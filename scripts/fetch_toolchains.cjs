#!/usr/bin/env node
'use strict';

// Populates ./toolchains from toolchains.lock.json for the installer build.
//   node scripts/fetch_toolchains.cjs [--dry-run] [--allow-unpinned] [--force]
// Idempotent: an entry is skipped when its completion marker records the same sha256.
// Every archive is SHA-256 verified before extraction; mismatch or unpinned => refused.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { evaluateArchiveHash, sha256File, downloadFile } = require('../src/security/toolchainManager.cjs');

const ROOT = path.resolve(__dirname, '..');

function loadLock(file = path.join(ROOT, 'toolchains.lock.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Entries that go into the installer (bundle !== false). */
function selectBundleEntries(lock) {
  return Object.entries(lock.entries || {})
    .filter(([, e]) => e.bundle !== false)
    .map(([key, entry]) => ({ key, entry }));
}

function markerFile(toolchainsDir, key, entry) {
  return path.join(toolchainsDir, entry.extractSubdir || '.', `.complete-${key}`);
}

function isComplete(toolchainsDir, key, entry) {
  if (!entry.sha256) return false;
  try {
    const recorded = fs.readFileSync(markerFile(toolchainsDir, key, entry), 'utf8').trim();
    if (recorded !== entry.sha256) return false;
    const bin = path.join(toolchainsDir, ...entry.binPathSegments);
    return fs.existsSync(path.join(bin, entry.checkFile))
      || (entry.candidatePathSegments || []).some((segs) => fs.existsSync(path.join(toolchainsDir, ...segs, entry.checkFile)));
  } catch {
    return false;
  }
}

function extractArchive(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const attempts = [['tar', ['-xf', zipPath, '-C', destDir]], ['unzip', ['-q', '-o', zipPath, '-d', destDir]]];
    const next = (i, lastErr) => {
      if (i >= attempts.length) { reject(new Error(`Extraction failed: ${lastErr || 'no extractor'}`)); return; }
      const [cmd, a] = attempts[i];
      const child = spawn(cmd, a, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('error', (e) => next(i + 1, e.message));
      child.on('close', (code) => (code === 0 ? resolve() : next(i + 1, stderr)));
    };
    next(0);
  });
}

function runStm32CubeFetch(rootDir, { dryRun }) {
  const script = path.join(rootDir, 'scripts', 'fetch_stm32cube.cjs');
  if (!fs.existsSync(script)) {
    console.log('[fetch] scripts/fetch_stm32cube.cjs not present; skipping STM32Cube HAL fetch.');
    return;
  }
  if (dryRun) { console.log('[fetch] (dry-run) would run: node scripts/fetch_stm32cube.cjs'); return; }
  const res = spawnSync(process.execPath, [script], { cwd: rootDir, stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`fetch_stm32cube.cjs failed with exit code ${res.status}`);
}

async function run(opts = {}) {
  const rootDir = opts.rootDir || ROOT;
  const lock = opts.lock || loadLock(path.join(rootDir, 'toolchains.lock.json'));
  const toolchainsDir = opts.toolchainsDir || path.join(rootDir, 'toolchains');
  const dryRun = Boolean(opts.dryRun);
  const allowUnpinned = Boolean(opts.allowUnpinned);
  const download = opts.downloadFile || downloadFile;
  const extract = opts.extractArchive || extractArchive;
  const log = opts.log || console.log;
  const stm32cube = opts.runStm32CubeFetch || ((dir) => runStm32CubeFetch(dir, { dryRun }));
  const results = [];

  for (const { key, entry } of selectBundleEntries(lock)) {
    const pin = entry.sha256 || 'UNPINNED (null)';
    if (dryRun) {
      const state = !entry.sha256 && !allowUnpinned ? 'would REFUSE (unpinned)' : isComplete(toolchainsDir, key, entry) ? 'up to date' : 'would download';
      log(`[fetch] ${key.padEnd(8)} ${String(entry.version || '').padEnd(12)} sha256=${pin}  ${state}\n         ${entry.url}`);
      results.push({ key, status: 'dry-run' });
      continue;
    }
    if (!opts.force && isComplete(toolchainsDir, key, entry)) {
      log(`[fetch] ${key}: already complete (sha256 ${entry.sha256.slice(0, 12)}...), skipping`);
      results.push({ key, status: 'skipped' });
      continue;
    }
    if (!entry.sha256 && !allowUnpinned) {
      throw new Error(`UNPINNED_ARCHIVE: '${key}' has no sha256 in toolchains.lock.json (pass --allow-unpinned to override)`);
    }
    fs.mkdirSync(toolchainsDir, { recursive: true });
    const zipPath = path.join(toolchainsDir, `.download-${entry.zipName}`);
    log(`[fetch] ${key}: downloading ${entry.url}`);
    await download(entry.url, zipPath);
    const actual = await sha256File(zipPath);
    const verdict = evaluateArchiveHash(key, entry, actual, { allowUnpinned });
    if (!verdict.valid) {
      fs.rmSync(zipPath, { force: true });
      throw new Error(`${verdict.code}: ${verdict.message}`);
    }
    const dest = path.join(toolchainsDir, entry.extractSubdir || '.');
    fs.mkdirSync(dest, { recursive: true });
    log(`[fetch] ${key}: sha256 verified, extracting to ${dest}`);
    await extract(zipPath, dest);
    fs.rmSync(zipPath, { force: true });
    const candidates = [entry.binPathSegments, ...(entry.candidatePathSegments || [])];
    if (!candidates.some((segs) => fs.existsSync(path.join(toolchainsDir, ...segs, entry.checkFile)))) {
      throw new Error(`EXTRACT_LAYOUT_UNEXPECTED: ${key}: ${entry.checkFile} not found under ${entry.binPathSegments.join('/')}`);
    }
    fs.writeFileSync(markerFile(toolchainsDir, key, entry), `${actual}\n`);
    results.push({ key, status: 'fetched' });
  }

  stm32cube(rootDir);
  return results;
}

module.exports = { loadLock, selectBundleEntries, markerFile, isComplete, extractArchive, run };

if (require.main === module) {
  const argv = process.argv.slice(2);
  run({
    dryRun: argv.includes('--dry-run'),
    allowUnpinned: argv.includes('--allow-unpinned'),
    force: argv.includes('--force'),
  }).catch((err) => { console.error(`[fetch] ERROR: ${err.message}`); process.exit(1); });
}
