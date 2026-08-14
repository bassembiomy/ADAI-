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

  const controller = createProjectFileController({
    ipcMain: mockIpcMain,
    dialog: mockDialog,
    readProjectFile: mockReadProjectFile,
    writeProjectFile: mockWriteProjectFile,
    randomUUID: mockRandomUUID,
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

  console.log('All projectFileController tests PASSED successfully.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
