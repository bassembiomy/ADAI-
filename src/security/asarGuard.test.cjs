'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyAsarIntegrity } = require('./asarGuard.cjs');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-guard-'));
  try {
    const resources = path.join(dir, 'resources');
    fs.mkdirSync(resources);
    const asarPath = path.join(resources, 'app.asar');
    const payload = crypto.randomBytes(200000);
    fs.writeFileSync(asarPath, payload);
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const integrity = path.join(resources, 'app-integrity.json');
    const app = (packaged) => ({ isPackaged: packaged, getAppPath: () => asarPath });

    assert.deepEqual(await verifyAsarIntegrity({ app: app(false) }), { ok: true });
    assert.deepEqual(await verifyAsarIntegrity({ app: app(true) }), { ok: true }, 'missing integrity file');

    fs.writeFileSync(integrity, JSON.stringify({}));
    assert.deepEqual(await verifyAsarIntegrity({ app: app(true) }), { ok: true }, 'missing hash field');

    fs.writeFileSync(integrity, JSON.stringify({ hash }));
    assert.deepEqual(await verifyAsarIntegrity({ app: app(true) }), { ok: true }, 'matching hash');

    fs.writeFileSync(integrity, JSON.stringify({ hash: 'deadbeef' }));
    const bad = await verifyAsarIntegrity({ app: app(true) });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /integrity check failed/);

    fs.writeFileSync(integrity, JSON.stringify({ hash }));
    fs.rmSync(asarPath);
    assert.deepEqual(await verifyAsarIntegrity({ app: app(true) }), { ok: true }, 'unreadable asar fails open');

    console.log('asarGuard tests passed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exit(1); });
