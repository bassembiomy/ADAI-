'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadLock, validateLock, fetchAll, copyKept, isComplete } = require('./fetch_stm32cube.cjs');

function good() {
  return { repos: [{ name: 'r', url: 'https://github.com/STMicroelectronics/r.git', tag: 'v1', commit: 'a'.repeat(40), keep: ['Inc'] }] };
}

function run() {
  console.log('Running fetch_stm32cube tests...');

  // The committed lock file is valid and pins every repo to a full commit SHA.
  const lock = loadLock();
  const names = lock.repos.map((r) => r.name).sort();
  assert.deepEqual(names, ['cmsis-device-f1', 'cmsis-device-f4', 'cmsis_core', 'stm32f1xx-hal-driver', 'stm32f4xx-hal-driver']);
  for (const r of lock.repos) assert.match(r.commit, /^[0-9a-f]{40}$/);

  // validateLock rejects unpinned / unsafe entries.
  assert.doesNotThrow(() => validateLock(good()));
  const mut = (fn) => { const l = good(); fn(l.repos[0]); return l; };
  assert.throws(() => validateLock(mut((r) => { r.commit = 'main'; })), /40-hex/);
  assert.throws(() => validateLock(mut((r) => { r.commit = 'abc123'; })), /40-hex/);
  assert.throws(() => validateLock(mut((r) => { r.url = 'https://evil.example/r.git'; })), /STMicroelectronics/);
  assert.throws(() => validateLock(mut((r) => { r.keep = ['../etc']; })), /unsafe/);
  assert.throws(() => validateLock(mut((r) => { r.name = '../x'; })), /bad repo name/);
  assert.throws(() => validateLock({ repos: [] }), /non-empty/);

  // dry-run touches nothing.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'adia_cube_'));
  const lines = [];
  fetchAll({ outDir: path.join(out, 'v'), dryRun: true, log: (l) => lines.push(l) });
  assert.equal(lines.length, lock.repos.length);
  assert.ok(!fs.existsSync(path.join(out, 'v')));

  // copyKept keeps only the listed paths and tolerates absent optional licence files.
  const src = path.join(out, 'src'); const dst = path.join(out, 'dst');
  fs.mkdirSync(path.join(src, 'Inc'), { recursive: true }); fs.mkdirSync(path.join(src, 'Docs'), { recursive: true });
  fs.writeFileSync(path.join(src, 'Inc', 'a.h'), 'x'); fs.writeFileSync(path.join(src, 'Docs', 'big.pdf'), 'x'); fs.writeFileSync(path.join(src, 'LICENSE.md'), 'x');
  fs.mkdirSync(dst);
  copyKept(src, dst, ['Inc', 'LICENSE.md', 'LICENSE.txt']);
  assert.deepEqual(fs.readdirSync(dst).sort(), ['Inc', 'LICENSE.md']);
  assert.throws(() => copyKept(src, dst, ['Src']), /required path missing/);

  // Real end-to-end fetch from a local bare repo: pinned commit is checked out and verified.
  // (A local repo cannot satisfy the github-only URL rule, so exercise fetchRepo's git logic directly.)
  const repo = path.join(out, 'origin'); fs.mkdirSync(repo);
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'uploadpack.allowAnySHA1InWant', 'true');
  fs.mkdirSync(path.join(repo, 'Inc')); fs.writeFileSync(path.join(repo, 'Inc', 'h.h'), 'v1'); fs.writeFileSync(path.join(repo, 'LICENSE.md'), 'lic');
  git('add', '.'); git('commit', '-qm', 'one');
  const sha = git('rev-parse', 'HEAD');
  const { fetchRepo } = require('./fetch_stm32cube.cjs');
  const vendorRoot = path.join(out, 'vendor'); fs.mkdirSync(vendorRoot);
  const entry = { name: 'r', url: repo, tag: 'v1', commit: sha, keep: ['Inc', 'LICENSE.md'] };
  const dir = fetchRepo(entry, vendorRoot, { log: () => {} });
  assert.equal(fs.readFileSync(path.join(dir, 'Inc', 'h.h'), 'utf8'), 'v1');
  assert.ok(isComplete(dir, entry));
  assert.ok(!fs.existsSync(path.join(dir, '.git')));
  // idempotent
  assert.equal(fetchRepo(entry, vendorRoot, { log: () => {} }), dir);
  // a pin that does not exist is refused (nothing replaces the good tree)
  const bad = { ...entry, commit: 'b'.repeat(40) };
  assert.throws(() => fetchRepo(bad, vendorRoot, { force: true, log: () => {} }));
  assert.equal(fs.readFileSync(path.join(dir, 'Inc', 'h.h'), 'utf8'), 'v1');

  console.log('fetch_stm32cube tests passed!');
}

try { run(); } catch (err) { console.error('fetch_stm32cube tests failed:', err); process.exit(1); }
