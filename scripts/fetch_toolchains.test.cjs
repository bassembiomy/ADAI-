'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { run, selectBundleEntries, isComplete, loadLock } = require('./fetch_toolchains.cjs');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const noop = () => {};

function makeLock(payload, overrides = {}) {
  return {
    entries: {
      Fake: { kind: 'toolchain', bundle: true, version: '1', cmd: 'fake', url: 'https://github.com/x/y.zip', zipName: 'y.zip',
        sha256: sha(payload), extractSubdir: 'fake', binPathSegments: ['fake', 'bin'], checkFile: 'fake.exe', ...overrides },
      Skipped: { kind: 'toolchain', bundle: false, sha256: null, url: 'https://github.com/x/z.zip', zipName: 'z.zip', extractSubdir: 'z', binPathSegments: ['z'], checkFile: 'z.exe' },
    },
  };
}

(async () => {
  // Real lock: bundle selection and pinned hashes.
  const real = loadLock();
  const bundled = selectBundleEntries(real).map((e) => e.key).sort();
  assert.deepEqual(bundled, ['Arduino', 'Generic', 'STM32', 'avrdude', 'openocd']);
  for (const { key, entry } of selectBundleEntries(real)) assert.match(entry.sha256, /^[0-9a-f]{64}$/, key);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-tc-'));
  const goodPayload = 'good-archive-bytes';
  let downloads = 0;
  const mkDeps = (payload, extractCalls) => ({
    toolchainsDir: path.join(tmp, 'toolchains'),
    rootDir: tmp,
    log: noop,
    runStm32CubeFetch: noop,
    downloadFile: async (url, dest) => { downloads++; fs.writeFileSync(dest, payload); },
    extractArchive: async (zip, dest) => {
      extractCalls.push(dest);
      fs.mkdirSync(path.join(dest, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(dest, 'bin', 'fake.exe'), '');
    },
  });

  // Hash mismatch: refused, archive deleted, nothing extracted, no completion marker.
  {
    const extracts = [];
    await assert.rejects(run({ ...mkDeps('tampered', extracts), lock: makeLock(goodPayload) }), /HASH_MISMATCH/);
    assert.equal(extracts.length, 0);
    assert.deepEqual(fs.readdirSync(path.join(tmp, 'toolchains')).filter((n) => n.startsWith('.download')), []);
    assert.equal(isComplete(path.join(tmp, 'toolchains'), 'Fake', makeLock(goodPayload).entries.Fake), false);
  }

  // Unpinned: refused without --allow-unpinned, never downloads.
  {
    const before = downloads;
    await assert.rejects(run({ ...mkDeps(goodPayload, []), lock: makeLock(goodPayload, { sha256: null }) }), /UNPINNED_ARCHIVE/);
    assert.equal(downloads, before);
  }

  // Good archive: fetched once, then idempotent skip.
  {
    const extracts = [];
    const lock = makeLock(goodPayload);
    let res = await run({ ...mkDeps(goodPayload, extracts), lock });
    assert.deepEqual(res, [{ key: 'Fake', status: 'fetched' }]);
    assert.equal(isComplete(path.join(tmp, 'toolchains'), 'Fake', lock.entries.Fake), true);
    const before = downloads;
    res = await run({ ...mkDeps(goodPayload, extracts), lock });
    assert.deepEqual(res, [{ key: 'Fake', status: 'skipped' }]);
    assert.equal(downloads, before);
    // A marker recording a different sha is not "complete".
    fs.writeFileSync(path.join(tmp, 'toolchains', 'fake', '.complete-Fake'), 'deadbeef');
    assert.equal(isComplete(path.join(tmp, 'toolchains'), 'Fake', lock.entries.Fake), false);
  }

  // Dry run: no download, no marker.
  {
    const before = downloads;
    const lines = [];
    const res = await run({ ...mkDeps(goodPayload, []), toolchainsDir: path.join(tmp, 'dry'), lock: makeLock(goodPayload), dryRun: true, log: (l) => lines.push(l) });
    assert.equal(downloads, before);
    assert.deepEqual(res, [{ key: 'Fake', status: 'dry-run' }]);
    assert.ok(lines[0].includes(sha(goodPayload)));
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('fetch_toolchains tests passed!');
})().catch((e) => { console.error(e); process.exit(1); });
