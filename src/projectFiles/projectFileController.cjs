'use strict';

const crypto = require('crypto');
const { readProjectFile: defaultRead, writeProjectFile: defaultWrite } = require('./projectFileService.cjs');

function createProjectFileController(deps = {}) {
  const ipcMain = deps.ipcMain;
  const dialog = deps.dialog;
  const readProjectFile = deps.readProjectFile || defaultRead;
  const writeProjectFile = deps.writeProjectFile || defaultWrite;
  const randomUUID = deps.randomUUID || (() => crypto.randomUUID());

  let activeProjectPath = null;
  const pendingTokens = new Map();
  let targetWindow = null;

  function setWindow(win) {
    targetWindow = win;
  }

  function getActivePath() {
    return activeProjectPath;
  }

  async function openFromDialog() {
    try {
      const result = await dialog.showOpenDialog(targetWindow || undefined, {
        title: 'Open ADIA Project',
        filters: [{ name: 'ADIA Project', extensions: ['adia', 'json'] }],
        properties: ['openFile'],
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { status: 'cancelled' };
      }

      const rawPath = result.filePaths[0];
      const { filePath, data } = readProjectFile(rawPath, { allowLegacyJson: true });
      const token = randomUUID();
      pendingTokens.set(token, filePath);

      return { status: 'opened', token, filePath, data };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  }

  async function save(data, saveAs) {
    let targetPath = activeProjectPath;

    if (saveAs || !targetPath) {
      const result = await dialog.showSaveDialog(targetWindow || undefined, {
        title: 'Save ADIA Project',
        defaultPath: activeProjectPath || 'adia_project.adia',
        filters: [{ name: 'ADIA Project', extensions: ['adia'] }],
      });

      if (result.canceled || !result.filePath) {
        return { status: 'cancelled' };
      }

      targetPath = result.filePath;
    }

    try {
      const savedPath = writeProjectFile(targetPath, data);
      activeProjectPath = savedPath;
      return { status: 'saved', filePath: savedPath };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  }

  async function acceptOpen(token) {
    if (!token || !pendingTokens.has(token)) {
      return { accepted: false };
    }
    const filePath = pendingTokens.get(token);
    pendingTokens.delete(token);
    activeProjectPath = filePath;
    return { accepted: true };
  }

  function openExternal(filePath, win) {
    const windowToUse = win || targetWindow;
    if (!windowToUse || !windowToUse.webContents) return false;

    try {
      const { filePath: resolved, data } = readProjectFile(filePath, { allowLegacyJson: true });
      const token = randomUUID();
      pendingTokens.set(token, resolved);
      windowToUse.webContents.send('project-open-requested', {
        token,
        filePath: resolved,
        data,
      });
      return true;
    } catch (err) {
      console.error(`Failed to open external ADIA project ${filePath}:`, err);
      return false;
    }
  }

  function registerIpc() {
    if (!ipcMain) return;
    ipcMain.handle('project-open-dialog', openFromDialog);
    ipcMain.handle('project-save', (_event, data) => save(data, false));
    ipcMain.handle('project-save-as', (_event, data) => save(data, true));
    ipcMain.handle('project-accept-open', (_event, payload) => acceptOpen(payload ? payload.token : null));
  }

  return {
    setWindow,
    getActivePath,
    openFromDialog,
    save,
    acceptOpen,
    openExternal,
    registerIpc,
  };
}

module.exports = {
  createProjectFileController,
};
