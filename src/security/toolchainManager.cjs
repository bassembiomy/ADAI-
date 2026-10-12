'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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

// The lock file is the single source of truth for URLs, hashes and layouts.
// A literal require() lets the esbuild main-process bundle inline it.
const TOOLCHAIN_LOCK = require('../../toolchains.lock.json');

function freezeSpec(spec) {
  const copy = { ...spec };
  if (copy.binPathSegments) copy.binPathSegments = Object.freeze([...copy.binPathSegments]);
  if (copy.candidatePathSegments) {
    copy.candidatePathSegments = Object.freeze(copy.candidatePathSegments.map((segs) => Object.freeze([...segs])));
  }
  return Object.freeze(copy);
}

function specsOfKind(kind) {
  const out = {};
  for (const [key, spec] of Object.entries(TOOLCHAIN_LOCK.entries || {})) {
    if (spec.kind === kind) out[key] = freezeSpec(spec);
  }
  return Object.freeze(out);
}

const TOOLCHAINS = specsOfKind('toolchain');
// Flasher tools
const FLASH_TOOLS = specsOfKind('flasher');

/**
 * Pure archive-hash decision against the lock file.
 * An unpinned (null) entry is refused unless allowUnpinned is set explicitly.
 */
function evaluateArchiveHash(key, spec, actualHash, { allowUnpinned = false } = {}) {
  if (!spec) return { valid: false, code: 'UNKNOWN_TOOLCHAIN', message: `No lock entry for ${key}` };
  if (!spec.sha256) {
    if (allowUnpinned) return { valid: true, unpinned: true, actualHash };
    return { valid: false, code: 'UNPINNED_ARCHIVE', actualHash, message: `Lock entry '${key}' has no pinned SHA-256; refusing.` };
  }
  if (String(actualHash).toLowerCase() !== spec.sha256.toLowerCase()) {
    return {
      valid: false, code: 'HASH_MISMATCH', actualHash, expectedHash: spec.sha256,
      message: `SHA-256 mismatch for '${key}'. Expected ${spec.sha256}, got ${actualHash}`,
    };
  }
  return { valid: true, actualHash };
}

function checkArchiveHash(key, actualHash, opts = {}) {
  return evaluateArchiveHash(key, TOOLCHAINS[key] || FLASH_TOOLS[key], actualHash, opts);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Normalise a single dir or an ordered list of dirs (bundled -> user) to a list. */
function toDirList(dirs) {
  const list = Array.isArray(dirs) ? dirs : [dirs];
  return list.filter((d) => typeof d === 'string' && d.length > 0);
}

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

function markerPath(spec, bin) {
  return process.platform === 'win32'
    ? path.join(bin, spec.checkFile || `${spec.cmd}.exe`)
    : path.join(bin, spec.cmd);
}

/**
 * Locate a tool's bin directory. `toolchainsDirs` is a dir or an ordered list
 * (bundled first, then user); the first dir that holds the tool wins.
 */
function locateToolBin(spec, toolchainsDirs) {
  for (const dir of toDirList(toolchainsDirs)) {
    const bin = binPathFor(spec, dir);
    if (fs.existsSync(markerPath(spec, bin))) return { dir, bin };
  }
  return null;
}

function isToolchainLocallyInstalled(key, toolchainsDirs = defaultToolchainsDir()) {
  const tc = TOOLCHAINS[key];
  if (!tc) return false;
  return locateToolBin(tc, toolchainsDirs || defaultToolchainsDir()) !== null;
}

function isFlashToolLocallyInstalled(key, toolchainsDirs = defaultToolchainsDir()) {
  const tc = FLASH_TOOLS[key];
  if (!tc) return false;
  return locateToolBin(tc, toolchainsDirs || defaultToolchainsDir()) !== null;
}

function configureToolchainPaths(toolchainsDirs = defaultToolchainsDir()) {
  const dirs = toDirList(toolchainsDirs || defaultToolchainsDir());
  const bins = [];
  for (const dir of dirs) { // resolution order: earlier dirs win
    for (const spec of [...Object.values(TOOLCHAINS), ...Object.values(FLASH_TOOLS)]) {
      const bin = binPathFor(spec, dir);
      if (fs.existsSync(markerPath(spec, bin)) && !bins.includes(bin)) bins.push(bin);
    }
  }
  // Support legacy project workspace path last (dev only)
  const legacyAvrBin = path.join(__dirname, '../../avr-gcc/avr-gcc-15.2.0-x64-windows/bin');
  if (fs.existsSync(legacyAvrBin)) {
    bins.push(legacyAvrBin);
  }
  // Prepend in reverse so bins[0] ends up first on PATH.
  const current = String(process.env.PATH || '');
  const toAdd = bins.filter((bin) => !current.split(path.delimiter).includes(bin));
  if (toAdd.length > 0) {
    process.env.PATH = [...toAdd, current].filter(Boolean).join(path.delimiter);
  }
}

function specMatchesName(spec, name) {
  const base = String(name).replace(/\.exe$/i, '');
  return spec.cmd === base || spec.checkFile === name || spec.checkFile === `${base}.exe`;
}

/**
 * Resolution order: bundled dir -> user dir -> system PATH.
 * `toolchainsDirs` is a dir or an ordered list [bundled, user].
 */
function resolveToolExecutable(name, toolchainsDirs = defaultToolchainsDir()) {
  const dirs = toDirList(toolchainsDirs || defaultToolchainsDir());
  for (const dir of dirs) {
    for (const spec of [...Object.values(TOOLCHAINS), ...Object.values(FLASH_TOOLS)]) {
      if (!specMatchesName(spec, name)) continue;
      const bin = binPathFor(spec, dir);
      const candidate = markerPath(spec, bin);
      if (fs.existsSync(candidate)) return candidate;
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

/**
 * Downloads into `toolchainsDir` (callers pass the writable user dir, never the
 * bundled resources dir), verifies the archive SHA-256 against the lock file,
 * and only then extracts. A mismatching or unpinned archive is deleted and refused.
 */
async function downloadAndExtractToolchain(key, toolchainsDir = defaultToolchainsDir(), deps = {}) {
  const dir = toolchainsDir || defaultToolchainsDir();
  const spec = TOOLCHAINS[key] || FLASH_TOOLS[key];
  if (!spec || !spec.url) throw new Error(`UNKNOWN_TOOLCHAIN: ${key}`);
  fs.mkdirSync(dir, { recursive: true });
  const zipPath = path.join(dir, spec.zipName);
  const doDownload = deps.downloadFile || downloadFile;
  await doDownload(spec.url, zipPath);
  if (!deps.skipHashVerify) {
    const res = checkArchiveHash(key, await sha256File(zipPath), { allowUnpinned: deps.allowUnpinned === true });
    if (!res.valid) {
      fs.rmSync(zipPath, { force: true });
      throw new Error(`${res.code}: ${res.message || 'verification failed'}`);
    }
  }
  const extractDest = path.join(dir, spec.extractSubdir || '.');
  fs.mkdirSync(extractDest, { recursive: true });
  const doExtract = deps.extractZip || extractZip;
  await doExtract(zipPath, extractDest);
  fs.rmSync(zipPath, { force: true });
  const binPath = binPathFor(spec, dir);
  if (!fs.existsSync(markerPath(spec, binPath))) {
    throw new Error(`EXTRACT_LAYOUT_UNEXPECTED: ${spec.name} -> ${binPath}`);
  }
  return { binPath };
}

/**
 * Ensure a tool is usable. Looks in `toolchainsDirs` (ordered, e.g. [bundled, user]);
 * if missing, downloads (hash-verified) into `downloadDir` (default: last dir) only.
 */
async function ensureToolchain(key, toolchainsDirs = defaultToolchainsDir(), downloadDir) {
  const dirs = toDirList(toolchainsDirs || defaultToolchainsDir());
  const isFlash = !TOOLCHAINS[key];
  const installed = isFlash
    ? isFlashToolLocallyInstalled(key, dirs)
    : isToolchainLocallyInstalled(key, dirs);
  if (!installed) await downloadAndExtractToolchain(key, downloadDir || dirs[dirs.length - 1]);
  configureToolchainPaths(dirs);
}

module.exports = {
  TOOLCHAINS, FLASH_TOOLS, TOOLCHAIN_LOCK,
  defaultToolchainsDir, locateToolBin,
  isToolchainLocallyInstalled, isFlashToolLocallyInstalled,
  configureToolchainPaths, resolveToolExecutable,
  checkArchiveHash, evaluateArchiveHash, sha256File,
  downloadFile, extractZip, downloadAndExtractToolchain, ensureToolchain,
};
