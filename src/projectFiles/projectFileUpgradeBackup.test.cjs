'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  detectSysmlRepositoryFormat,
  ensureUpgradeBackup,
  upgradeBackupPathFor,
} = require('./projectFileService.cjs');
const { createProjectFileController } = require('./projectFileController.cjs');

console.log('Running project file upgrade backup tests...');

const envelope = (schemaVersion, usages = {}) => JSON.stringify({
  format: 'ADIA-SysML',
  schemaVersion,
  checksum: 'x',
  repository: { schemaVersion, profileId: 'OMG-SysML-1.6-ADIA', usages },
});

// Format detection: only repositories that still hold usage records need an upgrade.
assert.strictEqual(detectSysmlRepositoryFormat({ sysmlRepository: envelope(3) }), 3);
assert.strictEqual(detectSysmlRepositoryFormat({ sysmlRepository: envelope(2) }), 2);
assert.strictEqual(detectSysmlRepositoryFormat({ sysmlRepository: envelope(5) }), null);
assert.strictEqual(detectSysmlRepositoryFormat({ sysmlRepository: { schemaVersion: 4, elements: {} } }), null);
assert.strictEqual(detectSysmlRepositoryFormat({ canonicalSysmlRepository: { schemaVersion: 3, profileId: 'p' } }), 3);
assert.strictEqual(detectSysmlRepositoryFormat({ parts: [{ id: 'p' }] }), 1);
assert.strictEqual(detectSysmlRepositoryFormat({ version: '1.0' }), null);
assert.strictEqual(detectSysmlRepositoryFormat({ sysmlRepository: 'not json' }), null);
assert.strictEqual(detectSysmlRepositoryFormat(null), null);

assert.strictEqual(path.basename(upgradeBackupPathFor('C:\\work\\Pump.adia')), 'Pump.v3-backup.json');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-upgrade-backup-'));
try {
  const original = JSON.stringify({ version: '1.0', sysmlRepository: envelope(3, { p: { id: 'p' } }) }, null, 2) + '\n';
  const target = path.join(tempDir, 'Pump.adia');
  fs.writeFileSync(target, original, 'utf8');
  const data = JSON.parse(original);

  // The original bytes are kept next to the project as <name>.v3-backup.json.
  const first = ensureUpgradeBackup(target, data);
  assert.strictEqual(first.formatVersion, 3);
  assert.strictEqual(first.backupCreated, true);
  assert.strictEqual(path.basename(first.backupPath), 'Pump.v3-backup.json');
  assert.strictEqual(fs.readFileSync(first.backupPath, 'utf8'), original);

  // The first backup is the original: a later call never overwrites it.
  fs.writeFileSync(target, 'changed', 'utf8');
  const second = ensureUpgradeBackup(target, data);
  assert.strictEqual(second.backupCreated, false);
  assert.strictEqual(fs.readFileSync(second.backupPath, 'utf8'), original);

  // Nothing is written for a file that needs no upgrade.
  assert.strictEqual(ensureUpgradeBackup(target, { sysmlRepository: envelope(5) }), null);

  // A backup that cannot be written is reported, never swallowed.
  const failing = ensureUpgradeBackup(path.join(tempDir, 'Missing.adia'), data);
  assert.strictEqual(failing.backupPath, null);
  assert.ok(failing.backupError);

  (async () => {
    // Opening an old project through the controller backs it up and says so.
    fs.writeFileSync(target, original, 'utf8');
    fs.rmSync(first.backupPath);
    const handlers = {};
    const sent = [];
    const controller = createProjectFileController({
      ipcMain: { handle: (channel, fn) => { handlers[channel] = fn; } },
      dialog: {
        showOpenDialog: async () => ({ canceled: false, filePaths: [target] }),
        showSaveDialog: async () => ({ canceled: true }),
      },
      snapshotBaseDir: tempDir,
    });
    controller.registerIpc();
    controller.setWindow({ webContents: { send: (channel, payload) => sent.push([channel, payload]) } });

    const opened = await handlers['project-open-dialog']();
    assert.strictEqual(opened.status, 'opened');
    assert.ok(opened.upgrade, 'an old project reports its upgrade');
    assert.strictEqual(opened.upgrade.formatVersion, 3);
    assert.strictEqual(opened.upgrade.backupCreated, true);
    assert.strictEqual(fs.readFileSync(opened.upgrade.backupPath, 'utf8'), original);

    // The same through the external-open path.
    fs.rmSync(opened.upgrade.backupPath);
    assert.strictEqual(controller.openExternal(target), true);
    const request = sent.find(([channel]) => channel === 'project-open-requested')[1];
    assert.strictEqual(request.upgrade.formatVersion, 3);
    assert.strictEqual(fs.existsSync(request.upgrade.backupPath), true);

    // A current project is opened without any upgrade notice or backup file.
    const current = path.join(tempDir, 'Current.adia');
    fs.writeFileSync(current, JSON.stringify({ version: '1.0', sysmlRepository: envelope(5) }), 'utf8');
    const openedCurrent = await createProjectFileController({
      ipcMain: { handle: () => {} },
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [current] }) },
      snapshotBaseDir: tempDir,
    }).openFromDialog();
    assert.strictEqual(openedCurrent.status, 'opened');
    assert.strictEqual(openedCurrent.upgrade, undefined);
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'Current.v3-backup.json')), false);

    // Saving over an old file keeps its original first, and the save carries on.
    fs.writeFileSync(target, original, 'utf8');
    fs.rmSync(upgradeBackupPathFor(target), { force: true });
    await handlers['project-accept-open']({}, { token: request.token });
    const saved = await handlers['project-save']({}, { version: '1.0', sysmlRepository: envelope(5) });
    assert.strictEqual(saved.status, 'saved');
    assert.strictEqual(fs.readFileSync(upgradeBackupPathFor(target), 'utf8'), original);
    assert.ok(JSON.parse(fs.readFileSync(target, 'utf8')).sysmlRepository.includes('"schemaVersion":5'), 'the saved file is format 5');

    console.log('All project file upgrade backup tests PASSED successfully.');
    fs.rmSync(tempDir, { recursive: true, force: true });
  })().catch((error) => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.error(error);
    process.exit(1);
  });
} catch (error) {
  fs.rmSync(tempDir, { recursive: true, force: true });
  throw error;
}
