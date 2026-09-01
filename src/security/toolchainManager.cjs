'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { verifyToolchainHash } = require('./toolchainVerifier.cjs');

const ALLOWED_DOWNLOAD_HOSTS = Object.freeze([
  'github.com',
  'objects.githubusercontent.com',
  'releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'raw.githubusercontent.com',
  'codeload.github.com',
  'developer.arm.com',
]);

function validateRedirectUrl(url, allowedHosts) {
  try {
    const parsed = new URL(url);
    return allowedHosts.includes(parsed.hostname)
      && (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      ? parsed.toString() : null;
  } catch { return null; }
}

const TOOLCHAINS = Object.freeze({
  Generic: Object.freeze({
    cmd: 'gcc',
    name: 'Generic C/C++ Compiler (w64devkit)',
    url: 'https://github.com/skeeto/w64devkit/releases/download/v1.23.0/w64devkit-1.23.0.zip',
    zipName: 'w64devkit-1.23.0.zip',
    extractSubdir: 'w64devkit',
    binPathSegments: ['w64devkit', 'w64devkit', 'bin'],
    checkFile: 'gcc.exe',
  }),
  Arduino: Object.freeze({
    cmd: 'avr-g++',
    name: 'Arduino AVR Toolchain (avr-gcc)',
    url: 'https://github.com/ZakKemble/avr-gcc-build/releases/download/v15.2.0-1/avr-gcc-15.2.0-x64-windows.zip',
    zipName: 'avr-gcc-15.2.0-x64-windows.zip',
    extractSubdir: 'avr-gcc',
    binPathSegments: ['avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin'],
    checkFile: 'avr-g++.exe',
  }),
  STM32: Object.freeze({
    cmd: 'arm-none-eabi-gcc',
    name: 'STM32 ARM Embedded Toolchain (arm-none-eabi-gcc)',
    url: 'https://developer.arm.com/-/media/Files/downloads/gnu-rm/10.3-2021.10/gcc-arm-none-eabi-10.3-2021.10-win32.zip',
    zipName: 'gcc-arm-none-eabi-10.3-2021.10-win32.zip',
    extractSubdir: 'arm-gcc',
    binPathSegments: ['arm-gcc', 'gcc-arm-none-eabi-10.3-2021.10', 'bin'],
    checkFile: 'arm-none-eabi-gcc.exe',
  }),
  ESP32: Object.freeze({
    cmd: 'xtensa-esp32-elf-gcc',
    name: 'ESP32 Xtensa Cross Compiler (esp-13.2.0)',
    url: 'https://github.com/espressif/crosstool-NG/releases/download/esp-13.2.0_20240530/xtensa-esp-elf-13.2.0_20240530-x86_64-w64-mingw32.zip',
    zipName: 'xtensa-esp-elf-13.2.0_20240530-x86_64-w64-mingw32.zip',
    extractSubdir: 'xtensa-esp-elf',
    binPathSegments: ['xtensa-esp-elf', 'xtensa-esp-elf', 'bin'],
    checkFile: 'xtensa-esp32-elf-gcc.exe',
    hashKey: 'esp32-xtensa-gcc-13.2.0-win64',
  }),
});

// Flasher tools
const FLASH_TOOLS = Object.freeze({
  avrdude: Object.freeze({
    name: 'AVRDUDE (AVR flasher)',
    cmd: 'avrdude',
    url: 'https://github.com/avrdudes/avrdude/releases/download/v8.0/avrdude-v8.0-windows-x64.zip',
    zipName: 'avrdude-v8.0-windows-x64.zip',
    extractSubdir: 'flashers/avrdude',
    binPathSegments: ['flashers', 'avrdude'],
    checkFile: 'avrdude.exe',
    hashKey: 'avrdude-v8.0-windows-x64',
  }),
  openocd: Object.freeze({
    name: 'OpenOCD (ST-Link flasher)',
    cmd: 'openocd',
    url: 'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-3/xpack-openocd-0.12.0-3-win32-x64.zip',
    zipName: 'xpack-openocd-0.12.0-3-win32-x64.zip',
    extractSubdir: 'flashers',
    binPathSegments: ['flashers', 'xpack-openocd-0.12.0-3', 'bin'],
    candidatePathSegments: [
      ['flashers', 'xpack-openocd-0.12.0-3', 'bin'],
      ['flashers', 'openocd', 'bin'],
      ['flashers', 'openocd'],
    ],
    checkFile: 'openocd.exe',
    hashKey: 'xpack-openocd-0.12.0-3-win32-x64',
  }),
  esptool: Object.freeze({
    name: 'esptool (ESP32 flasher)',
    cmd: 'esptool.py',
    url: 'https://github.com/espressif/esptool/releases/download/v4.8.1/esptool-v4.8.1-win64.zip',
    zipName: 'esptool-v4.8.1-win64.zip',
    extractSubdir: 'flashers',
    binPathSegments: ['flashers', 'esptool-win64'],
    candidatePathSegments: [
      ['flashers', 'esptool-win64'],
      ['flashers', 'esptool-v4.8.1-win64'],
      ['flashers', 'esptool'],
    ],
    checkFile: 'esptool.exe',
    hashKey: 'esptool-v4.8.1-windows-amd64',
  }),
});

function exeName(cmd) {
  return process.platform === 'win32' ? `${cmd}.exe` : cmd;
}

function binPathFor(spec, toolchainsDir) {
  if (spec.candidatePathSegments && toolchainsDir) {
    for (const segments of spec.candidatePathSegments) {
      const candidate = path.join(toolchainsDir, ...segments);
      const marker = process.platform === 'win32' ? (spec.checkFile || `${spec.cmd}.exe`) : spec.cmd;
      if (fs.existsSync(path.join(candidate, marker))) {
        return candidate;
      }
    }
  }
  return path.join(toolchainsDir, ...spec.binPathSegments);
}

function defaultToolchainsDir() {
  if (process.resourcesPath) {
    const bundledPath = path.join(process.resourcesPath, 'toolchains');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
  }
  return path.join(process.cwd(), 'toolchains');
}

function isToolchainLocallyInstalled(key, toolchainsDir = defaultToolchainsDir()) {
  const tc = TOOLCHAINS[key];
  if (!tc) return false;
  const dir = toolchainsDir || defaultToolchainsDir();
  const expected = process.platform === 'win32'
    ? path.join(binPathFor(tc, dir), tc.checkFile)
    : path.join(binPathFor(tc, dir), tc.cmd);
  return fs.existsSync(expected);
}

function isFlashToolLocallyInstalled(key, toolchainsDir = defaultToolchainsDir()) {
  const tc = FLASH_TOOLS[key];
  if (!tc) return false;
  const dir = toolchainsDir || defaultToolchainsDir();
  return fs.existsSync(path.join(binPathFor(tc, dir), tc.checkFile));
}

function configureToolchainPaths(toolchainsDir = defaultToolchainsDir()) {
  const dir = toolchainsDir || defaultToolchainsDir();
  const bins = [];
  // Support legacy project workspace path first if it exists
  const legacyAvrBin = path.join(__dirname, '../../avr-gcc/avr-gcc-15.2.0-x64-windows/bin');
  if (fs.existsSync(legacyAvrBin)) {
    bins.push(legacyAvrBin);
  }

  for (const spec of [...Object.values(TOOLCHAINS), ...Object.values(FLASH_TOOLS)]) {
    const bin = binPathFor(spec, dir);
    const marker = process.platform === 'win32'
      ? path.join(bin, spec.checkFile || '')
      : path.join(bin, spec.cmd);
    if (fs.existsSync(marker)) bins.push(bin);
  }
  for (const bin of bins) {
    if (!String(process.env.PATH || '').includes(bin)) {
      process.env.PATH = bin + path.delimiter + process.env.PATH;
    }
  }
}

function resolveToolExecutable(name, toolchainsDir = defaultToolchainsDir()) {
  const dir = toolchainsDir || defaultToolchainsDir();
  // Check in known toolchain and flasher directories first
  for (const spec of [...Object.values(TOOLCHAINS), ...Object.values(FLASH_TOOLS)]) {
    const bin = binPathFor(spec, dir);
    const candidate = path.join(bin, process.platform === 'win32' ? (spec.checkFile || `${name}.exe`) : name);
    if (fs.existsSync(candidate) && (candidate.endsWith(name) || candidate.endsWith(`${name}.exe`))) {
      return candidate;
    }
  }

  try {
    const tool = process.platform === 'win32' ? 'where.exe' : 'which';
    const out = execFileSync(tool, [name], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const first = out.split(/\r?\n/).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

function downloadFile(url, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    const fetchUrl = (targetUrl) => {
      const client = targetUrl.startsWith('https') ? require('node:https') : require('node:http');
      const req = client.get(targetUrl, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const redirectUrl = res.headers.location;
          if (!redirectUrl) { reject(new Error('Redirect location header missing')); return; }
          const safeRedirect = validateRedirectUrl(redirectUrl, ALLOWED_DOWNLOAD_HOSTS);
          if (!safeRedirect) { reject(new Error(`Blocked redirect to untrusted host: ${redirectUrl}`)); return; }
          fetchUrl(safeRedirect);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`Failed to download: Status Code ${res.statusCode}`)); return; }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0; let lastProgress = Date.now();
        const fileStream = fs.createWriteStream(destPath);
        res.on('data', chunk => {
          received += chunk.length;
          if (progressCallback && Date.now() - lastProgress > 500) {
            lastProgress = Date.now();
            progressCallback(total ? Math.round((received / total) * 100) : 0);
          }
        });
        res.pipe(fileStream);
        fileStream.on('finish', () => fileStream.close(() => resolve(destPath)));
        fileStream.on('error', reject);
      });
      req.on('error', reject);
    };
    fetchUrl(url);
  });
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xf', zipPath, '-C', destDir], { shell: false });
    let stderr = '';
    child.stderr.on('data', c => { stderr += c.toString(); });
    child.on('close', code => {
      if (code === 0) { resolve(); return; }
      // Fallback: PowerShell Expand-Archive
      const ps = spawn('powershell.exe', [
        '-NoProfile', '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
      ], { shell: false });
      ps.on('close', psCode => psCode === 0 ? resolve() : reject(new Error(`Extraction failed: ${stderr}`)));
      ps.on('error', () => reject(new Error(`Extraction failed: ${stderr}`)));
    });
    child.on('error', err => reject(err));
  });
}

async function downloadAndExtractToolchain(key, toolchainsDir = defaultToolchainsDir(), deps = {}) {
  const dir = toolchainsDir || defaultToolchainsDir();
  const spec = TOOLCHAINS[key] || FLASH_TOOLS[key];
  if (!spec || !spec.url) throw new Error(`UNKNOWN_TOOLCHAIN: ${key}`);
  if (!deps.skipHashVerify && typeof verifyToolchainHash !== 'function') {
    throw new Error('toolchainVerifier.cjs must export verifyToolchainHash(key, buffer)');
  }
  const zipPath = path.join(dir, spec.zipName);
  const doDownload = deps.downloadFile || downloadFile;
  await doDownload(spec.url, zipPath);
  if (!deps.skipHashVerify) {
    const buf = fs.readFileSync(zipPath);
    const res = verifyToolchainHash(deps.hashKey || spec.hashKey || key, buf);
    if (!res || !res.valid) {
      fs.rmSync(zipPath, { force: true });
      throw new Error(`HASH_MISMATCH: ${res?.message || res?.code || 'verification failed'}`);
    }
  }
  const extractDest = path.join(dir, spec.extractSubdir || '.');
  fs.mkdirSync(extractDest, { recursive: true });
  const doExtract = deps.extractZip || extractZip;
  await doExtract(zipPath, extractDest);
  const binPath = binPathFor(spec, dir);
  if (!fs.existsSync(path.join(binPath, process.platform === 'win32' ? (spec.checkFile || exeName(spec.cmd)) : spec.cmd))) {
    throw new Error(`EXTRACT_LAYOUT_UNEXPECTED: ${spec.name} -> ${binPath}`);
  }
  return { binPath };
}

async function ensureToolchain(key, toolchainsDir = defaultToolchainsDir()) {
  const dir = toolchainsDir || defaultToolchainsDir();
  const isFlash = !TOOLCHAINS[key];
  const installed = isFlash
    ? isFlashToolLocallyInstalled(key, dir)
    : isToolchainLocallyInstalled(key, dir);
  if (!installed) await downloadAndExtractToolchain(key, dir);
  configureToolchainPaths(dir);
}

module.exports = {
  TOOLCHAINS, FLASH_TOOLS,
  defaultToolchainsDir,
  isToolchainLocallyInstalled, isFlashToolLocallyInstalled,
  configureToolchainPaths, resolveToolExecutable,
  downloadFile, extractZip, downloadAndExtractToolchain, ensureToolchain,
};
