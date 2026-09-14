'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { verifyToolchainHash } = require('./toolchainVerifier.cjs');

const ALLOWED_DOWNLOAD_HOSTS = Object.freeze([
  'github.com',
  'objects.githubusercontent.com',
  'releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'raw.githubusercontent.com',
  'codeload.github.com',
  'developer.arm.com',
  'armkeil.blob.core.windows.net',
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
    installRootSegments: ['w64devkit'],
    binPathSegments: ['w64devkit', 'w64devkit', 'bin'],
    checkFile: 'gcc.exe',
  }),
  Arduino: Object.freeze({
    cmd: 'avr-g++',
    name: 'Arduino AVR Toolchain (avr-gcc)',
    url: 'https://github.com/ZakKemble/avr-gcc-build/releases/download/v15.2.0-1/avr-gcc-15.2.0-x64-windows.zip',
    zipName: 'avr-gcc-15.2.0-x64-windows.zip',
    extractSubdir: 'avr-gcc',
    installRootSegments: ['avr-gcc'],
    binPathSegments: ['avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin'],
    checkFile: 'avr-g++.exe',
    requiredFromBin: [['..', 'libexec', 'gcc', 'avr', '15.2.0', 'cc1plus.exe']],
  }),
  STM32: Object.freeze({
    cmd: 'arm-none-eabi-gcc',
    name: 'STM32 ARM Embedded Toolchain (arm-none-eabi-gcc)',
    url: 'https://developer.arm.com/-/media/Files/downloads/gnu-rm/10.3-2021.10/gcc-arm-none-eabi-10.3-2021.10-win32.zip',
    zipName: 'gcc-arm-none-eabi-10.3-2021.10-win32.zip',
    extractSubdir: 'arm-gcc',
    installRootSegments: ['arm-gcc'],
    binPathSegments: ['arm-gcc', 'gcc-arm-none-eabi-10.3-2021.10', 'bin'],
    checkFile: 'arm-none-eabi-gcc.exe',
  }),
  ESP32: Object.freeze({
    cmd: 'xtensa-esp32-elf-gcc',
    name: 'ESP32 Xtensa Cross Compiler (esp-13.2.0)',
    url: 'https://github.com/espressif/crosstool-NG/releases/download/esp-13.2.0_20240530/xtensa-esp-elf-13.2.0_20240530-x86_64-w64-mingw32.zip',
    zipName: 'xtensa-esp-elf-13.2.0_20240530-x86_64-w64-mingw32.zip',
    extractSubdir: 'xtensa-esp-elf',
    installRootSegments: ['xtensa-esp-elf'],
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
    installRootSegments: ['flashers', 'avrdude'],
    binPathSegments: ['flashers', 'avrdude'],
    candidatePathSegments: [
      ['flashers', 'avrdude'],
      ['avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin'],
    ],
    checkFile: 'avrdude.exe',
    hashKey: 'avrdude-v8.0-windows-x64',
  }),
  openocd: Object.freeze({
    name: 'OpenOCD (ST-Link flasher)',
    cmd: 'openocd',
    url: 'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-3/xpack-openocd-0.12.0-3-win32-x64.zip',
    zipName: 'xpack-openocd-0.12.0-3-win32-x64.zip',
    extractSubdir: 'flashers',
    installRootSegments: ['flashers', 'xpack-openocd-0.12.0-3'],
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
    installRootSegments: ['flashers', 'esptool-win64'],
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

const TARGET_ENVIRONMENTS = Object.freeze({
  STM32F1: Object.freeze({ compiler: 'STM32', flasher: 'openocd' }),
  STM32F4: Object.freeze({ compiler: 'STM32', flasher: 'openocd' }),
  Arduino_Uno: Object.freeze({ compiler: 'Arduino', flasher: 'avrdude' }),
  Arduino_Mega: Object.freeze({ compiler: 'Arduino', flasher: 'avrdude' }),
  ESP32: Object.freeze({ compiler: 'ESP32', flasher: 'esptool' }),
});

const activeProvisions = new Map();

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

function installationMarker(spec) {
  return process.platform === 'win32' ? (spec.checkFile || exeName(spec.cmd)) : spec.cmd;
}

function candidateToolchainDirs(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '../..'));
  const requestedDir = path.resolve(options.toolchainsDir || defaultToolchainsDir());
  const resourcesPath = options.resourcesPath === undefined ? process.resourcesPath : options.resourcesPath;
  const roots = [];
  if (resourcesPath) roots.push(path.resolve(resourcesPath, 'toolchains'));
  roots.push(requestedDir);
  if (options.repoRoot !== undefined || requestedDir === path.resolve(defaultToolchainsDir())) {
    roots.push(path.join(repoRoot, 'toolchains'));
  }
  return [...new Set(roots)];
}

function installationIsComplete(spec, binPath) {
  const executable = path.join(binPath, installationMarker(spec));
  if (!fs.existsSync(executable)) return false;
  return (spec.requiredFromBin || []).every(segments => fs.existsSync(path.resolve(binPath, ...segments)));
}

function resolveInstalledToolchain(key, options = {}) {
  const spec = TOOLCHAINS[key] || FLASH_TOOLS[key];
  if (!spec) return null;
  const marker = installationMarker(spec);
  const searchedPaths = [];

  for (const root of candidateToolchainDirs(options)) {
    const segmentsList = spec.candidatePathSegments || [spec.binPathSegments];
    for (const segments of segmentsList) {
      const binPath = path.join(root, ...segments);
      const executable = path.join(binPath, marker);
      searchedPaths.push(executable);
      if (installationIsComplete(spec, binPath)) return { key, binPath, executable, searchedPaths };
    }
  }

  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '../..'));
  const compatibilityBins = [];
  const includeRepoCompatibility = options.repoRoot !== undefined
    || path.resolve(options.toolchainsDir || defaultToolchainsDir()) === path.resolve(defaultToolchainsDir());
  if (includeRepoCompatibility && key === 'Arduino') {
    compatibilityBins.push(path.join(repoRoot, 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin'));
  } else if (includeRepoCompatibility && key === 'avrdude') {
    compatibilityBins.push(
      path.join(repoRoot, 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin'),
      path.join(repoRoot, 'toolchains', 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin'),
    );
  }
  for (const binPath of compatibilityBins) {
    const executable = path.join(binPath, marker);
    searchedPaths.push(executable);
    if (installationIsComplete(spec, binPath)) return { key, binPath, executable, searchedPaths };
  }
  return { key, binPath: null, executable: null, searchedPaths };
}

function isToolchainLocallyInstalled(key, toolchainsDir = defaultToolchainsDir()) {
  if (!TOOLCHAINS[key]) return false;
  return Boolean(resolveInstalledToolchain(key, { toolchainsDir })?.executable);
}

function isFlashToolLocallyInstalled(key, toolchainsDir = defaultToolchainsDir()) {
  if (!FLASH_TOOLS[key]) return false;
  return Boolean(resolveInstalledToolchain(key, { toolchainsDir })?.executable);
}

function configureToolchainPaths(toolchainsDir = defaultToolchainsDir()) {
  const dir = toolchainsDir || defaultToolchainsDir();
  const bins = [];
  for (const key of [...Object.keys(TOOLCHAINS), ...Object.keys(FLASH_TOOLS)]) {
    const resolved = resolveInstalledToolchain(key, { toolchainsDir: dir });
    if (resolved?.executable) bins.push(resolved.binPath);
  }
  const currentPath = String(process.env.PATH || '');
  const requestedRoot = path.resolve(dir) + path.sep;
  const uniqueBins = [...new Set(bins)]
    .sort((left, right) => Number(!path.resolve(left).startsWith(requestedRoot)) - Number(!path.resolve(right).startsWith(requestedRoot)))
    .filter(bin => !currentPath.split(path.delimiter).includes(bin));
  if (uniqueBins.length > 0) {
    process.env.PATH = [...uniqueBins, currentPath].filter(Boolean).join(path.delimiter);
  }
}

function resolveToolExecutable(name, toolchainsDir = defaultToolchainsDir()) {
  const dir = toolchainsDir || defaultToolchainsDir();
  // Check in known toolchain and flasher directories first
  for (const [key, spec] of [...Object.entries(TOOLCHAINS), ...Object.entries(FLASH_TOOLS)]) {
    if (name !== spec.cmd && name !== spec.checkFile && name !== key) continue;
    const resolved = resolveInstalledToolchain(key, { toolchainsDir: dir });
    if (resolved?.executable) return resolved.executable;
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
        'param($zipPath,$destPath) Expand-Archive -LiteralPath $zipPath -DestinationPath $destPath -Force',
        zipPath, destDir,
      ], { shell: false });
      ps.on('close', psCode => psCode === 0 ? resolve() : reject(new Error(`Extraction failed: ${stderr}`)));
      ps.on('error', () => reject(new Error(`Extraction failed: ${stderr}`)));
    });
    child.on('error', err => reject(err));
  });
}

async function performProvision(key, toolchainsDir = defaultToolchainsDir(), deps = {}) {
  const dir = toolchainsDir || defaultToolchainsDir();
  const spec = TOOLCHAINS[key] || FLASH_TOOLS[key];
  if (!spec || !spec.url) throw new Error(`UNKNOWN_TOOLCHAIN: ${key}`);
  if (!deps.skipHashVerify && typeof verifyToolchainHash !== 'function') {
    throw new Error('toolchainVerifier.cjs must export verifyToolchainHash(key, buffer)');
  }
  fs.mkdirSync(dir, { recursive: true });
  const suffix = randomUUID();
  const zipPath = path.join(dir, `${spec.zipName}.part-${suffix}`);
  const stagingRoot = path.join(dir, `.staging-${key}-${suffix}`);
  const finalRoot = path.join(dir, ...spec.installRootSegments);
  const backupRoot = `${finalRoot}.backup-${suffix}`;
  try {
    const doDownload = deps.downloadFile || downloadFile;
    await doDownload(spec.url, zipPath);
    if (!deps.skipHashVerify) {
      const buf = fs.readFileSync(zipPath);
      const res = verifyToolchainHash(deps.hashKey || spec.hashKey || key, buf);
      if (!res || !res.valid) {
        throw new Error(`HASH_MISMATCH: ${res?.message || res?.code || 'verification failed'}`);
      }
    }
    const extractDest = path.join(stagingRoot, spec.extractSubdir || '.');
    fs.mkdirSync(extractDest, { recursive: true });
    const doExtract = deps.extractZip || extractZip;
    await doExtract(zipPath, extractDest);
    const stagedBinPath = binPathFor(spec, stagingRoot);
    if (!fs.existsSync(path.join(stagedBinPath, installationMarker(spec)))) {
      throw new Error(`EXTRACT_LAYOUT_UNEXPECTED: ${spec.name} -> ${stagedBinPath}`);
    }
    const stagedRoot = path.join(stagingRoot, ...spec.installRootSegments);
    if (!fs.existsSync(stagedRoot)) {
      throw new Error(`EXTRACT_INSTALL_ROOT_MISSING: ${spec.name} -> ${stagedRoot}`);
    }
    fs.mkdirSync(path.dirname(finalRoot), { recursive: true });
    if (fs.existsSync(finalRoot)) fs.renameSync(finalRoot, backupRoot);
    try {
      fs.renameSync(stagedRoot, finalRoot);
    } catch (error) {
      if (!fs.existsSync(finalRoot) && fs.existsSync(backupRoot)) fs.renameSync(backupRoot, finalRoot);
      throw error;
    }
    const resolved = resolveInstalledToolchain(key, {
      toolchainsDir: dir,
      repoRoot: deps.repoRoot || path.join(__dirname, '../..'),
      resourcesPath: deps.resourcesPath || null,
    });
    if (!resolved?.executable) {
      throw new Error(`PROMOTED_LAYOUT_UNEXPECTED: ${spec.name}`);
    }
    fs.rmSync(backupRoot, { recursive: true, force: true });
    return resolved;
  } finally {
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    if (fs.existsSync(backupRoot) && !fs.existsSync(finalRoot)) fs.renameSync(backupRoot, finalRoot);
    fs.rmSync(backupRoot, { recursive: true, force: true });
  }
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function withProvisionLock(key, dir, operation, deps = {}) {
  const safeKey = key.replace(/[^A-Za-z0-9_.-]/g, '_');
  const lockPath = path.join(dir, `.provision-${safeKey}.lock`);
  const timeoutMs = deps.lockTimeoutMs || 120000;
  const pollMs = deps.lockPollMs || 50;
  const deadline = Date.now() + timeoutMs;
  let handle;
  while (!handle) {
    try {
      handle = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const installed = resolveInstalledToolchain(key, { ...deps, toolchainsDir: dir });
      if (installed?.executable) return installed;
      if (Date.now() >= deadline) throw new Error(`PROVISION_LOCK_TIMEOUT: ${key} (${lockPath})`);
      await delay(pollMs);
    }
  }
  try {
    const installed = resolveInstalledToolchain(key, { ...deps, toolchainsDir: dir });
    return installed?.executable ? installed : await operation();
  } finally {
    fs.closeSync(handle);
    fs.rmSync(lockPath, { force: true });
  }
}

function provisionToolchain(key, toolchainsDir = defaultToolchainsDir(), deps = {}) {
  const dir = path.resolve(toolchainsDir || defaultToolchainsDir());
  const operationKey = `${dir}\0${key}`;
  const active = activeProvisions.get(operationKey);
  if (active) return active;
  fs.mkdirSync(dir, { recursive: true });
  const operation = withProvisionLock(key, dir, () => performProvision(key, dir, deps), deps)
    .finally(() => activeProvisions.delete(operationKey));
  activeProvisions.set(operationKey, operation);
  return operation;
}

async function downloadAndExtractToolchain(key, toolchainsDir = defaultToolchainsDir(), deps = {}) {
  return provisionToolchain(key, toolchainsDir, deps);
}

async function provisionAllRequiredToolchains(toolchainsDir = defaultToolchainsDir(), deps = {}) {
  const requiredKeys = ['Generic', ...new Set(Object.values(TARGET_ENVIRONMENTS).flatMap(item => [item.compiler, item.flasher]))];
  const results = [];
  for (const key of requiredKeys) {
    const existing = resolveInstalledToolchain(key, { ...deps, toolchainsDir });
    results.push(existing?.executable ? existing : await provisionToolchain(key, toolchainsDir, deps));
  }
  return results;
}

async function ensureToolchain(key, toolchainsDir = defaultToolchainsDir(), options = {}) {
  const dir = toolchainsDir || defaultToolchainsDir();
  const resolved = resolveInstalledToolchain(key, { ...options, toolchainsDir: dir });
  if (!resolved?.executable) {
    const spec = TOOLCHAINS[key] || FLASH_TOOLS[key];
    const error = new Error(
      `OFFLINE_TOOLCHAIN_MISSING: ${key} (${installationMarker(spec)}) was not found. `
      + `Run 'npm run provision:hil' before starting ADIA. Searched: ${resolved?.searchedPaths.join(', ')}`,
    );
    error.code = 'OFFLINE_TOOLCHAIN_MISSING';
    throw error;
  }
  configureToolchainPaths(dir);
  return resolved;
}

module.exports = {
  ALLOWED_DOWNLOAD_HOSTS, TOOLCHAINS, FLASH_TOOLS, TARGET_ENVIRONMENTS,
  defaultToolchainsDir,
  candidateToolchainDirs, resolveInstalledToolchain,
  isToolchainLocallyInstalled, isFlashToolLocallyInstalled,
  configureToolchainPaths, resolveToolExecutable,
  downloadFile, extractZip, provisionToolchain, provisionAllRequiredToolchains,
  downloadAndExtractToolchain, ensureToolchain,
};
