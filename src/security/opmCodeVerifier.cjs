// src/security/opmCodeVerifier.cjs
// Verified-generation gate for OPM C artifacts (Task 8, OPM scope only).
//
// Security contract (desktop-security + pre-deployment gate):
// - Exact allowlisted OPM artifact names only (no paths, no traversal, no dups).
// - Bounded UTF-8 payloads (per-file and package caps).
// - Fresh OS temp dir per verification, wiped afterwards.
// - Bundled compiler invoked with FIXED flags argv via spawn(shell:false);
//   never accept path/exe/flags/dest/command/cwd from the renderer.
// - Conformance execution under a fixed timeout with structured evidence.
// - Concurrency guard: at most one active verification (rate-limit backstop).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const TOOLCHAIN_VERSION = '1.0.0';

const ALLOWED_FILES = new Set([
  'opm_types.h',
  'opm_config.h',
  'opm_model.h',
  'opm_model.c',
  'opm_runtime.h',
  'opm_runtime.c',
  'opm_io.h',
  'opm_io.c',
  'opm_trace.h',
  'opm_trace.c',
  'opm_manifest.json',
  'main_example.c',
]);

const C_SOURCES = [
  'opm_model.c',
  'opm_runtime.c',
  'opm_io.c',
  'opm_trace.c',
  'main_example.c',
];

// Fixed, non-negotiable compiler argv (bundled gcc, C99, hardened warnings).
const FIXED_COMPILE_FLAGS = Object.freeze(['-Wall', '-Wextra', '-pedantic', '-std=c99']);
const FIXED_CONFORMANCE_ARGS = Object.freeze([]);

const MAX_FILE_COUNT = 16;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB per file
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // 8 MiB per package
const TIMEOUT_MS = 30000;

// Renderer must never smuggle execution control through the payload.
const FORBIDDEN_KEYS = new Set([
  'compiler', 'exe', 'path', 'flags', 'dest', 'command', 'argv',
  'toolchain', 'outputPath', 'cwd', 'shell', 'executable', 'cmd',
]);

let activeVerification = false;

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload must be an object');
  }
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Renderer must not supply execution control: "${key}"`);
    }
  }
  if (!Array.isArray(payload.files)) {
    throw new Error('Payload.files must be an array');
  }
  if (payload.files.length === 0) {
    throw new Error('Payload.files cannot be empty');
  }
  if (payload.files.length > MAX_FILE_COUNT) {
    throw new Error(`File count exceeds limit of ${MAX_FILE_COUNT}`);
  }

  const seenNames = new Set();
  let totalBytes = 0;

  for (const file of payload.files) {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw new Error('File item must be an object');
    }
    for (const key of Object.keys(file)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Renderer must not supply execution control: "files[].${key}"`);
      }
    }
    if (typeof file.name !== 'string' || typeof file.content !== 'string') {
      throw new Error('File name and content must be strings');
    }
    if (file.name.length === 0 || file.name.length > 128) {
      throw new Error(`Invalid filename length: ${file.name}`);
    }
    if (file.name.includes('\0') || file.name.includes('/') || file.name.includes('\\')) {
      throw new Error(`Invalid filename: ${file.name}`);
    }
    if (path.basename(file.name) !== file.name) {
      throw new Error(`Path traversal rejected in filename: ${file.name}`);
    }
    if (file.name === '.' || file.name === '..') {
      throw new Error(`Invalid filename: ${file.name}`);
    }
    if (!ALLOWED_FILES.has(file.name)) {
      throw new Error(`Filename not allowed: ${file.name}`);
    }
    if (seenNames.has(file.name)) {
      throw new Error(`Duplicate filename: ${file.name}`);
    }
    seenNames.add(file.name);

    const fileBytes = Buffer.byteLength(file.content, 'utf8');
    if (fileBytes > MAX_FILE_BYTES) {
      throw new Error(`File ${file.name} exceeds size limit of ${MAX_FILE_BYTES} bytes`);
    }
    totalBytes += fileBytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(`Total payload size exceeds limit of ${MAX_TOTAL_BYTES} bytes`);
    }
  }
}

function runCommand(cmd, args, options, spawnFn = spawn) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const proc = spawnFn(cmd, args, { ...options, shell: false });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGKILL'); } catch (_) {}
        resolve({ code: -1, stdout, stderr: `${stderr}\nProcess timed out`, timedOut: true });
      }
    }, options.timeout || TIMEOUT_MS);

    if (proc.stdout) {
      proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    }
    if (proc.stderr) {
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    }
    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}`, error: err });
      }
    });
    proc.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr, timedOut: false });
      }
    });
  });
}

async function verifyOpmCode(payload, deps = {}) {
  if (activeVerification) {
    return {
      success: false,
      toolchainVersion: TOOLCHAIN_VERSION,
      evidence: { hostCompile: 'fail', hostRuntime: 'not-run' },
      compiler: 'gcc',
      stdout: '',
      stderr: '',
      error: 'Verification already in progress',
    };
  }

  activeVerification = true;
  let tempDir = null;

  try {
    validatePayload(payload);

    const fsModule = deps.fs || fs;
    const osModule = deps.os || os;
    const spawnFn = deps.spawn || spawn;

    // Fresh temp dir per verification (user-scoped OS temp, wiped on exit path below).
    tempDir = fsModule.mkdtempSync(path.join(osModule.tmpdir(), 'adia-opm-verify-'));

    for (const file of payload.files) {
      const targetPath = path.join(tempDir, file.name);
      const resolved = path.resolve(targetPath);
      const resolvedTempDir = path.resolve(tempDir);
      if (resolved !== resolvedTempDir && !resolved.startsWith(resolvedTempDir + path.sep)) {
        throw new Error(`File target outside temporary directory: ${file.name}`);
      }
      fsModule.writeFileSync(targetPath, file.content, 'utf8');
    }

    const present = new Set(payload.files.map((f) => f.name));
    const sources = C_SOURCES.filter((name) => present.has(name));
    if (!present.has('main_example.c')) {
      return {
        success: false,
        toolchainVersion: TOOLCHAIN_VERSION,
        evidence: { hostCompile: 'not-run', hostRuntime: 'not-run' },
        compiler: 'gcc',
        stdout: '',
        stderr: '',
        error: 'OPM package must include main_example.c conformance entry point',
      };
    }

    const isWindows = process.platform === 'win32';
    const harnessExe = isWindows ? 'opm_harness.exe' : './opm_harness';

    // Fixed-flags host compile of the allowlisted sources only.
    const build = await runCommand(
      'gcc',
      [...FIXED_COMPILE_FLAGS, ...sources, '-o', harnessExe],
      { cwd: tempDir, timeout: TIMEOUT_MS },
      spawnFn,
    );
    if (build.code !== 0) {
      return {
        success: false,
        toolchainVersion: TOOLCHAIN_VERSION,
        evidence: { hostCompile: 'fail', hostRuntime: 'not-run' },
        compiler: 'gcc',
        stdout: build.stdout,
        stderr: build.stderr,
        error: 'OPM host compilation failed',
      };
    }

    // Conformance execution under a fixed timeout.
    const run = await runCommand(
      path.join(tempDir, harnessExe),
      [...FIXED_CONFORMANCE_ARGS],
      { cwd: tempDir, timeout: TIMEOUT_MS },
      spawnFn,
    );
    if (run.code !== 0) {
      return {
        success: false,
        toolchainVersion: TOOLCHAIN_VERSION,
        evidence: { hostCompile: 'pass', hostRuntime: 'fail' },
        compiler: 'gcc',
        stdout: run.stdout,
        stderr: run.stderr,
        error: `OPM conformance runtime failed with exit code ${run.code}`,
      };
    }

    return {
      success: true,
      toolchainVersion: TOOLCHAIN_VERSION,
      evidence: { hostCompile: 'pass', hostRuntime: 'pass' },
      compiler: 'gcc',
      stdout: `${build.stdout}\n${run.stdout}`.trim(),
      stderr: `${build.stderr}\n${run.stderr}`.trim(),
    };
  } catch (err) {
    return {
      success: false,
      toolchainVersion: TOOLCHAIN_VERSION,
      evidence: { hostCompile: 'fail', hostRuntime: 'not-run' },
      compiler: 'gcc',
      stdout: '',
      stderr: '',
      error: err.message,
    };
  } finally {
    activeVerification = false;
    if (tempDir) {
      try {
        const fsModule = deps.fs || fs;
        fsModule.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

module.exports = {
  ALLOWED_FILES,
  C_SOURCES,
  FIXED_COMPILE_FLAGS,
  TOOLCHAIN_VERSION,
  validatePayload,
  verifyOpmCode,
};
