'use strict';

const crypto = require('crypto');
const { readProjectFile: defaultRead, writeProjectFile: defaultWrite } = require('./projectFileService.cjs');

const path = require('path');
const fs = require('fs');

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      out[key] = sortKeysDeep(item);
    }
    return out;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(sortKeysDeep(value)) ?? 'null';
}

function computeModelFingerprint(payload) {
  return crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function createProjectFileController(deps = {}) {
  const ipcMain = deps.ipcMain;
  const dialog = deps.dialog;
  const readProjectFile = deps.readProjectFile || defaultRead;
  const writeProjectFile = deps.writeProjectFile || defaultWrite;
  const randomUUID = deps.randomUUID || (() => crypto.randomUUID());
  const fsImpl = deps.fsImpl || fs;
  const snapshotBaseDir = path.resolve(deps.snapshotBaseDir || process.cwd());

  let activeProjectPath = null;
  const pendingTokens = new Map();
  let targetWindow = null;

  function setWindow(win) {
    targetWindow = win;
  }

  function getActivePath() {
    return activeProjectPath;
  }

  function isPathInside(baseDir, candidatePath) {
    const relative = path.relative(path.resolve(baseDir), path.resolve(candidatePath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  function assertSnapshotPathAllowed(candidatePath) {
    const trustedRoots = [snapshotBaseDir];
    if (activeProjectPath) trustedRoots.push(path.dirname(path.resolve(activeProjectPath)));
    if (!trustedRoots.some((root) => isPathInside(root, candidatePath))) {
      throw new Error('PATH_TRAVERSAL_DETECTED: Target path is outside allowed project base directory');
    }
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

  async function saveSnapshot(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('INVALID_SNAPSHOT: snapshot must be an object');
    }

    const projectId = snapshot.projectId || 'default_project';
    const revision = Number(snapshot.revision ?? 0);
    const nodes = snapshot.nodes || [];
    const edges = snapshot.edges || [];
    const modelFingerprint = computeModelFingerprint({ nodes, edges });

    const targetPath = options.targetPath
      ? path.resolve(options.targetPath)
      : (activeProjectPath || path.join(snapshotBaseDir, `project_${projectId}.adia`));

    const resolvedPath = path.resolve(targetPath);
    assertSnapshotPathAllowed(resolvedPath);

    const now = Date.now();
    const payload = {
      formatVersion: '2.0.0',
      projectId,
      revision,
      modelFingerprint,
      xbridges: { nodes, edges },
      savedAt: now,
    };

    const fileContent = JSON.stringify(payload, null, 2) + '\n';
    const contentHash = crypto.createHash('sha256').update(fileContent).digest('hex');

    const tempPath = `${resolvedPath}.tmp-${process.pid}-${now}`;
    fsImpl.writeFileSync(tempPath, fileContent, 'utf8');
    fsImpl.renameSync(tempPath, resolvedPath);

    activeProjectPath = resolvedPath;
    const stat = fsImpl.statSync(resolvedPath);

    return {
      filePath: resolvedPath,
      contentHash,
      modelFingerprint,
      revision,
      savedAt: now,
      sizeBytes: stat.size,
    };
  }

  async function reloadSnapshot(receipt, options = {}) {
    if (!receipt || typeof receipt !== 'object' || !receipt.filePath) {
      throw new Error('INVALID_RECEIPT: receipt must contain filePath');
    }

    const resolvedPath = path.resolve(receipt.filePath);
    assertSnapshotPathAllowed(resolvedPath);

    if (!fsImpl.existsSync(resolvedPath)) {
      throw new Error(`FILE_NOT_FOUND: Persisted file '${resolvedPath}' does not exist.`);
    }

    const rawContent = fsImpl.readFileSync(resolvedPath, 'utf8');
    const actualContentHash = crypto.createHash('sha256').update(rawContent).digest('hex');

    if (actualContentHash !== receipt.contentHash) {
      throw new Error(
        `CONTENT_HASH_MISMATCH: Persisted project file has been corrupted or tampered on disk. Expected ${receipt.contentHash}, found ${actualContentHash}.`
      );
    }

    const data = JSON.parse(rawContent);
    const nodes = data.xbridges?.nodes || [];
    const edges = data.xbridges?.edges || [];
    const revision = Number(data.revision ?? receipt.revision);
    const projectId = String(data.projectId ?? '');

    const actualFingerprint = computeModelFingerprint({ nodes, edges });
    if (actualFingerprint !== receipt.modelFingerprint) {
      throw new Error(
        `MODEL_FINGERPRINT_MISMATCH: Read-back model fingerprint '${actualFingerprint}' does not match receipt '${receipt.modelFingerprint}'.`
      );
    }

    return {
      projectId,
      revision,
      nodes,
      edges,
      stateHash: actualFingerprint,
      timestamp: Date.now(),
    };
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
    ipcMain.handle('project-save-snapshot', (_event, snapshot, options) => saveSnapshot(snapshot, options));
    ipcMain.handle('project-reload-snapshot', (_event, receipt, options) => reloadSnapshot(receipt, options));
  }

  return {
    setWindow,
    getActivePath,
    openFromDialog,
    save,
    saveSnapshot,
    reloadSnapshot,
    acceptOpen,
    openExternal,
    registerIpc,
  };
}

module.exports = {
  createProjectFileController,
};
