'use strict';

const assert = require('assert');
const { createProjectFileController } = require('./projectFileController.cjs');

console.log('Running projectFileController tests...');

(async () => {
  const handlers = {};
  const mockIpcMain = {
    handle: (channel, handler) => {
      handlers[channel] = handler;
    },
  };

  let dialogOpenResult = { canceled: true, filePaths: [] };
  let dialogSaveResult = { canceled: true, filePath: '' };

  const mockDialog = {
    showOpenDialog: async () => dialogOpenResult,
    showSaveDialog: async () => dialogSaveResult,
  };

  const fileStore = new Map();
  const mockReadProjectFile = (filePath, options) => {
    if (!fileStore.has(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return { filePath, data: fileStore.get(filePath) };
  };

  const mockWriteProjectFile = (filePath, data) => {
    const norm = filePath.endsWith('.adia') ? filePath : `${filePath}.adia`;
    fileStore.set(norm, data);
    return norm;
  };

  let tokenCount = 0;
  const mockRandomUUID = () => `token-${++tokenCount}`;

  const sentMessages = [];
  const mockWindow = {
    webContents: {
      send: (channel, payload) => {
        sentMessages.push([channel, payload]);
      },
    },
  };

  const mockDisk = new Map();
  const mockFs = {
    writeFileSync: (p, content) => mockDisk.set(p, content),
    readFileSync: (p) => {
      if (!mockDisk.has(p)) throw new Error(`File not found: ${p}`);
      return mockDisk.get(p);
    },
    existsSync: (p) => mockDisk.has(p),
    renameSync: (oldP, newP) => {
      if (!mockDisk.has(oldP)) throw new Error(`File not found: ${oldP}`);
      mockDisk.set(newP, mockDisk.get(oldP));
      mockDisk.delete(oldP);
    },
    statSync: (p) => {
      if (!mockDisk.has(p)) throw new Error(`File not found: ${p}`);
      return { size: Buffer.byteLength(mockDisk.get(p)) };
    },
  };

  const controller = createProjectFileController({
    ipcMain: mockIpcMain,
    dialog: mockDialog,
    readProjectFile: mockReadProjectFile,
    writeProjectFile: mockWriteProjectFile,
    randomUUID: mockRandomUUID,
    fsImpl: mockFs,
    snapshotBaseDir: 'C:\\work',
  });

  controller.registerIpc();
  controller.setWindow(mockWindow);

  // 1. Initial state
  assert.strictEqual(controller.getActivePath(), null);

  // 2. Open dialog cancellation
  dialogOpenResult = { canceled: true, filePaths: [] };
  assert.deepStrictEqual(await handlers['project-open-dialog'](), { status: 'cancelled' });

  // 3. Open dialog success
  fileStore.set('C:\\work\\Pump.adia', { version: '1.0' });
  dialogOpenResult = { canceled: false, filePaths: ['C:\\work\\Pump.adia'] };
  const openRes = await handlers['project-open-dialog']();
  assert.strictEqual(openRes.status, 'opened');
  assert.strictEqual(openRes.filePath, 'C:\\work\\Pump.adia');
  assert.strictEqual(openRes.token, 'token-1');

  // Active path is NOT set on read, only on accept-open or save
  assert.strictEqual(controller.getActivePath(), null);

  // 4. Accept open token handshake
  const acceptRes1 = await handlers['project-accept-open']({}, { token: 'token-1' });
  assert.deepStrictEqual(acceptRes1, { accepted: true });
  assert.strictEqual(controller.getActivePath(), 'C:\\work\\Pump.adia');

  // Stale token reject
  const acceptRes2 = await handlers['project-accept-open']({}, { token: 'token-1' });
  assert.deepStrictEqual(acceptRes2, { accepted: false });

  // 5. Save with active path (skips dialog)
  const saveRes1 = await handlers['project-save']({}, { version: '1.0', name: 'Saved' });
  assert.strictEqual(saveRes1.status, 'saved');
  assert.strictEqual(saveRes1.filePath, 'C:\\work\\Pump.adia');

  // 6. Save As (triggers dialog)
  dialogSaveResult = { canceled: false, filePath: 'C:\\work\\PumpNew.adia' };
  const saveAsRes = await handlers['project-save-as']({}, { version: '1.0', name: 'SaveAs' });
  assert.strictEqual(saveAsRes.status, 'saved');
  assert.strictEqual(saveAsRes.filePath, 'C:\\work\\PumpNew.adia');
  assert.strictEqual(controller.getActivePath(), 'C:\\work\\PumpNew.adia');

  // 7. Save As cancellation preserves active path
  dialogSaveResult = { canceled: true, filePath: '' };
  const saveAsCancelRes = await handlers['project-save-as']({}, { version: '1.0', name: 'Cancel' });
  assert.strictEqual(saveAsCancelRes.status, 'cancelled');
  assert.strictEqual(controller.getActivePath(), 'C:\\work\\PumpNew.adia');

  // 8. openExternal sends project-open-requested
  fileStore.set('C:\\work\\External.adia', { version: '1.0', name: 'Ext' });
  controller.openExternal('C:\\work\\External.adia', mockWindow);

  const request = sentMessages.find(([ch]) => ch === 'project-open-requested')[1];
  assert.strictEqual(request.token, 'token-2');
  assert.strictEqual(request.filePath, 'C:\\work\\External.adia');
  assert.deepStrictEqual(request.data, { version: '1.0', name: 'Ext' });

  // Accept external open token
  const acceptExt = await handlers['project-accept-open']({}, { token: 'token-2' });
  assert.deepStrictEqual(acceptExt, { accepted: true });
  assert.strictEqual(controller.getActivePath(), 'C:\\work\\External.adia');

  // 9. Snapshot save and reload via IPC
  assert(typeof handlers['project-save-snapshot'] === 'function', 'project-save-snapshot handler must be registered');
  assert(typeof handlers['project-reload-snapshot'] === 'function', 'project-reload-snapshot handler must be registered');

  const sampleSnapshot = {
    projectId: 'test_p1',
    revision: 3,
    nodes: [{ id: 'n1', type: 'block', position: { x: 0, y: 0 }, data: { blockId: 'STEP' } }],
    edges: []
  };

  const receipt = await handlers['project-save-snapshot']({}, sampleSnapshot, {
    targetPath: 'C:\\work\\snapshot_test.adia',
    allowedBaseDir: 'C:\\work'
  });

  assert.strictEqual(receipt.filePath, 'C:\\work\\snapshot_test.adia');
  assert(receipt.contentHash && receipt.contentHash.length === 64, 'contentHash must be a 64-char sha256 hex string');
  assert(receipt.modelFingerprint && receipt.modelFingerprint.length === 64, 'modelFingerprint must be a 64-char sha256 hex string');
  assert.strictEqual(receipt.revision, 3);

  // Reload snapshot
  const reloaded = await handlers['project-reload-snapshot']({}, receipt, {
    allowedBaseDir: 'C:\\work'
  });
  assert.strictEqual(reloaded.projectId, 'test_p1');
  assert.strictEqual(reloaded.revision, 3);
  assert.strictEqual(reloaded.nodes.length, 1);
  assert.strictEqual(reloaded.stateHash, receipt.modelFingerprint);

  // Path traversal detection on save
  await assert.rejects(
    async () => {
      await handlers['project-save-snapshot']({}, sampleSnapshot, {
        targetPath: 'C:\\other\\forbidden.adia',
        allowedBaseDir: 'C:\\work'
      });
    },
    /PATH_TRAVERSAL_DETECTED/
  );

  // Renderer cannot enlarge the trusted main-process snapshot boundary.
  await assert.rejects(
    async () => {
      await handlers['project-save-snapshot']({}, sampleSnapshot, {
        targetPath: 'C:\\other\\renderer_escape.adia',
        allowedBaseDir: 'C:\\'
      });
    },
    /PATH_TRAVERSAL_DETECTED/
  );

  // Prefix siblings are not children (C:\\work-evil must not pass C:\\work).
  await assert.rejects(
    async () => {
      await handlers['project-save-snapshot']({}, sampleSnapshot, {
        targetPath: 'C:\\work-evil\\prefix_escape.adia'
      });
    },
    /PATH_TRAVERSAL_DETECTED/
  );

  console.log('All projectFileController tests PASSED successfully.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
