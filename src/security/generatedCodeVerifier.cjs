// src/security/generatedCodeVerifier.cjs
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ALLOWED_FILES = new Set([
  'sm_config.h',
  'sm_core.h',
  'sm_core.c',
  'sm_safety.h',
  'sm_safety.c',
  'sm_user_logic.h',
  'sm_user_logic.c',
  'mcal_dio.h',
  'mcal_dio_test_stubs.c',
  'sm_xbridges.h',
  'sm_xbridges.c',
  'sm_host_test.c',
]);

const MAX_FILE_COUNT = 32;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_TOTAL_BYTES = 16 * 1024 * 1024; // 16 MiB
const TIMEOUT_MS = 30000; // 30 seconds

let activeVerification = false;

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
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
    if (!file || typeof file !== 'object') {
      throw new Error('File item must be an object');
    }
    if (typeof file.name !== 'string' || typeof file.content !== 'string') {
      throw new Error('File name and content must be strings');
    }
    if (file.name.includes('\0') || file.name.includes('/') || file.name.includes('\\')) {
      throw new Error(`Invalid filename: ${file.name}`);
    }
    if (path.basename(file.name) !== file.name) {
      throw new Error(`Path traversal rejected in filename: ${file.name}`);
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

    const proc = spawnFn(cmd, args, {
      ...options,
      shell: false,
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGKILL'); } catch (_) {}
        resolve({ code: -1, stdout, stderr: stderr + '\nProcess timed out', timedOut: true });
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
        resolve({ code: -1, stdout, stderr: stderr + '\n' + err.message, error: err });
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

async function verifyGeneratedCode(payload, deps = {}) {
  if (activeVerification) {
    return {
      success: false,
      evidence: { hostCompile: 'fail', hostRuntime: 'fail' },
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

    tempDir = fsModule.mkdtempSync(path.join(osModule.tmpdir(), 'adia-verify-'));

    for (const file of payload.files) {
      const targetPath = path.join(tempDir, file.name);
      const resolved = path.resolve(targetPath);
      const resolvedTempDir = path.resolve(tempDir);
      if (!resolved.startsWith(resolvedTempDir + path.sep)) {
        throw new Error(`File target outside temporary directory: ${file.name}`);
      }
      fsModule.writeFileSync(targetPath, file.content, 'utf8');
    }

    const fileNames = payload.files.map((f) => f.name);
    const cFiles = ['sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'sm_host_test.c'];
    if (fileNames.includes('sm_xbridges.c')) {
      cFiles.push('sm_xbridges.c');
    }
    if (fileNames.includes('mcal_dio_test_stubs.c')) {
      cFiles.push('mcal_dio_test_stubs.c');
    }

    const isWindows = process.platform === 'win32';
    const prodExe = isWindows ? 'harness_prod.exe' : './harness_prod';
    const traceExe = isWindows ? 'harness_trace.exe' : './harness_trace';

    // Build production harness
    const buildProd = await runCommand(
      'gcc',
      ['-Wall', '-Wextra', '-pedantic', '-std=c99', ...cFiles, '-o', prodExe],
      { cwd: tempDir, timeout: TIMEOUT_MS },
      spawnFn,
    );

    if (buildProd.code !== 0) {
      return {
        success: false,
        evidence: { hostCompile: 'fail', hostRuntime: 'not-run' },
        compiler: 'gcc',
        stdout: buildProd.stdout,
        stderr: buildProd.stderr,
        error: 'Host production compilation failed',
      };
    }

    // Run production harness
    const runProd = await runCommand(
      path.join(tempDir, prodExe),
      [],
      { cwd: tempDir, timeout: TIMEOUT_MS },
      spawnFn,
    );

    if (runProd.code !== 0) {
      return {
        success: false,
        evidence: { hostCompile: 'pass', hostRuntime: 'fail' },
        compiler: 'gcc',
        stdout: runProd.stdout,
        stderr: runProd.stderr,
        error: `Host production runtime failed with exit code ${runProd.code}`,
      };
    }

    // Build trace harness
    const buildTrace = await runCommand(
      'gcc',
      ['-Wall', '-Wextra', '-pedantic', '-std=c99', '-DSM_TRACE_ENABLED', ...cFiles, '-o', traceExe],
      { cwd: tempDir, timeout: TIMEOUT_MS },
      spawnFn,
    );

    if (buildTrace.code !== 0) {
      return {
        success: false,
        evidence: { hostCompile: 'fail', hostRuntime: 'not-run' },
        compiler: 'gcc',
        stdout: buildTrace.stdout,
        stderr: buildTrace.stderr,
        error: 'Host trace compilation failed',
      };
    }

    // Run trace harness
    const runTrace = await runCommand(
      path.join(tempDir, traceExe),
      [],
      { cwd: tempDir, timeout: TIMEOUT_MS },
      spawnFn,
    );

    if (runTrace.code !== 0) {
      return {
        success: false,
        evidence: { hostCompile: 'pass', hostRuntime: 'fail' },
        compiler: 'gcc',
        stdout: runTrace.stdout,
        stderr: runTrace.stderr,
        error: `Host trace runtime failed with exit code ${runTrace.code}`,
      };
    }

    return {
      success: true,
      evidence: { hostCompile: 'pass', hostRuntime: 'pass' },
      compiler: 'gcc',
      stdout: `${buildProd.stdout}\n${runProd.stdout}\n${buildTrace.stdout}\n${runTrace.stdout}`.trim(),
      stderr: `${buildProd.stderr}\n${runProd.stderr}\n${buildTrace.stderr}\n${runTrace.stderr}`.trim(),
    };
  } catch (err) {
    return {
      success: false,
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
  validatePayload,
  verifyGeneratedCode,
};
