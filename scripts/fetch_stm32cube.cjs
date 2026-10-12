'use strict';
/**
 * Vendors the pinned official STM32Cube sources (see stm32cube.lock.json) into
 * vendor/stm32cube/<repo>/ . Each repo is shallow-fetched at an exact commit,
 * HEAD is verified against the pin, and only the files needed to build firmware
 * (headers, sources, licences) are kept.
 *
 *   node scripts/fetch_stm32cube.cjs [--dry-run] [--force] [--out <dir>]
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LOCK_PATH = path.join(ROOT, 'stm32cube.lock.json');
const COMPLETE_MARKER = '.complete';

function loadLock(lockPath = LOCK_PATH) {
  return validateLock(JSON.parse(fs.readFileSync(lockPath, 'utf8')));
}

function validateLock(lock) {
  if (!lock || !Array.isArray(lock.repos) || lock.repos.length === 0) {
    throw new Error('stm32cube.lock.json: "repos" must be a non-empty array');
  }
  for (const r of lock.repos) {
    if (!/^[A-Za-z0-9_.-]+$/.test(r.name || '')) throw new Error(`lock: bad repo name ${JSON.stringify(r.name)}`);
    if (!/^https:\/\/github\.com\/STMicroelectronics\/[A-Za-z0-9_.-]+\.git$/.test(r.url || '')) {
      throw new Error(`lock: ${r.name}: url must be an https://github.com/STMicroelectronics/ git URL`);
    }
    if (!/^[0-9a-f]{40}$/.test(r.commit || '')) throw new Error(`lock: ${r.name}: commit must be a full 40-hex SHA`);
    if (!r.tag) throw new Error(`lock: ${r.name}: tag is required`);
    if (!Array.isArray(r.keep) || r.keep.length === 0) throw new Error(`lock: ${r.name}: keep must be non-empty`);
    for (const k of r.keep) {
      if (path.isAbsolute(k) || k.split(/[\\/]/).includes('..')) throw new Error(`lock: ${r.name}: unsafe keep path ${k}`);
    }
  }
  return lock;
}

function isComplete(repoDir, repo) {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(repoDir, COMPLETE_MARKER), 'utf8'));
    return marker.commit === repo.commit;
  } catch { return false; }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
}

/** Copies the lock's `keep` entries (missing optional licence files are skipped; Inc/Src/Include are required). */
function copyKept(srcDir, destDir, keep) {
  for (const rel of keep) {
    const from = path.join(srcDir, rel);
    if (!fs.existsSync(from)) {
      if (/^(Inc|Src|Include|Source)/.test(rel)) throw new Error(`required path missing in checkout: ${rel}`);
      continue;
    }
    const to = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

function fetchRepo(repo, vendorRoot, { force = false, log = console.log } = {}) {
  const finalDir = path.join(vendorRoot, repo.name);
  if (!force && isComplete(finalDir, repo)) {
    log(`[stm32cube] ${repo.name} ${repo.tag} already present`);
    return finalDir;
  }
  const work = path.join(vendorRoot, `.work-${repo.name}`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  try {
    git(['init', '-q'], work);
    git(['remote', 'add', 'origin', repo.url], work);
    git(['fetch', '-q', '--depth', '1', 'origin', repo.commit], work);
    git(['checkout', '-q', '--detach', 'FETCH_HEAD'], work);
    const head = git(['rev-parse', 'HEAD'], work);
    if (head !== repo.commit) {
      throw new Error(`${repo.name}: pinned commit ${repo.commit} but checkout is ${head}`);
    }
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.mkdirSync(finalDir, { recursive: true });
    copyKept(work, finalDir, repo.keep);
    fs.writeFileSync(path.join(finalDir, COMPLETE_MARKER), JSON.stringify({ tag: repo.tag, commit: head }) + '\n');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  log(`[stm32cube] ${repo.name} ${repo.tag} @ ${repo.commit.slice(0, 12)} OK`);
  return finalDir;
}

function fetchAll({ lock = loadLock(), outDir, force = false, dryRun = false, log = console.log } = {}) {
  const vendorRoot = outDir || path.join(ROOT, lock.vendorSubdir || 'vendor/stm32cube');
  if (dryRun) {
    for (const r of lock.repos) log(`[dry-run] ${r.name} ${r.tag} ${r.commit} -> ${path.join(vendorRoot, r.name)}`);
    return vendorRoot;
  }
  fs.mkdirSync(vendorRoot, { recursive: true });
  for (const r of lock.repos) fetchRepo(r, vendorRoot, { force, log });
  return vendorRoot;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  try {
    fetchAll({
      force: argv.includes('--force'),
      dryRun: argv.includes('--dry-run'),
      outDir: outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : undefined,
    });
  } catch (err) {
    console.error(`[stm32cube] FAILED: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { loadLock, validateLock, fetchAll, fetchRepo, copyKept, isComplete, LOCK_PATH };
