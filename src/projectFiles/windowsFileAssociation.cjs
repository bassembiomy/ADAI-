'use strict';

const path = require('path');
const fs = require('fs');

const EXTENSION_KEY = 'HKCU\\Software\\Classes\\.adia';
const PROG_ID = 'ADIA.Project';
const PROG_ID_KEY = `HKCU\\Software\\Classes\\${PROG_ID}`;

function resolveDefaultIcon(execPath, options = {}) {
  const fsImpl = options.fsImpl || fs;
  if (options && typeof options.iconPath === 'string' && options.iconPath.trim()) {
    try {
      if (fsImpl.existsSync(options.iconPath)) return options.iconPath;
    } catch {}
  }

  const candidates = [
    path.resolve(__dirname, '../../icon.ico'),
    path.resolve(__dirname, '../icon.ico'),
    path.resolve(path.dirname(execPath || ''), 'icon.ico'),
    path.resolve(path.dirname(execPath || ''), 'resources', 'icon.ico'),
    process.resourcesPath ? path.resolve(process.resourcesPath, 'icon.ico') : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fsImpl.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }

  return null;
}

function notifyShellAssocChanged(execFileImpl = require('child_process').execFile) {
  if (process.platform !== 'win32') return Promise.resolve();
  return new Promise((resolve) => {
    const psScript = 'try { $code = @\'\nusing System;\nusing System.Runtime.InteropServices;\npublic class Shell { [DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2); }\n\'@; Add-Type $code; [Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero); } catch {}';
    execFileImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true }, () => {
      resolve();
    });
  });
}

function buildAssociationValues(execPath, options = {}) {
  const icon = (options && options.iconPath)
    ? `"${options.iconPath}"`
    : `"${execPath}",0`;
  return {
    extensionKey: EXTENSION_KEY,
    progIdKey: PROG_ID_KEY,
    icon,
    command: `"${execPath}" "%1"`,
  };
}

function createRegRunner(execFileImpl = require('child_process').execFile) {
  return (args) =>
    new Promise((resolve, reject) => {
      execFileImpl('reg.exe', args, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      });
    });
}

async function registerAdiaAssociation(execPath, deps = {}) {
  const runReg = deps.runReg || createRegRunner();
  const iconPath = deps.iconPath || resolveDefaultIcon(execPath, deps);
  const optionsWithIcon = Object.assign({}, deps, { iconPath });
  const values = buildAssociationValues(execPath, optionsWithIcon);

  // 1. Set HKCU\Software\Classes\.adia (Default) -> ADIA.Project
  await runReg(['ADD', values.extensionKey, '/ve', '/d', PROG_ID, '/f']);

  // 2. Set HKCU\Software\Classes\ADIA.Project (Default) -> "ADIA Project File"
  await runReg(['ADD', values.progIdKey, '/ve', '/d', 'ADIA Project File', '/f']);

  // 3. Set HKCU\Software\Classes\ADIA.Project\DefaultIcon (Default) -> resolved icon
  await runReg(['ADD', `${values.progIdKey}\\DefaultIcon`, '/ve', '/d', values.icon, '/f']);

  // 4. Set HKCU\Software\Classes\ADIA.Project\shell\open\command (Default) -> "execPath" "%1"
  await runReg(['ADD', `${values.progIdKey}\\shell\\open\\command`, '/ve', '/d', values.command, '/f']);

  if (deps.notifyShell !== false && process.platform === 'win32') {
    const notify = deps.notifyShellAssocChanged || notifyShellAssocChanged;
    try {
      await notify(deps.execFileImpl);
    } catch {}
  }
}

async function unregisterOwnedAdiaAssociation(execPath, deps = {}) {
  const runReg = deps.runReg || createRegRunner();
  const values = buildAssociationValues(execPath);

  // Check extension key ownership
  try {
    const extQueryResult = await runReg(['QUERY', values.extensionKey, '/ve']);
    if (extQueryResult.stdout.includes(PROG_ID)) {
      await runReg(['DELETE', values.extensionKey, '/f']);
    }
  } catch {}

  // Check ProgID command key ownership
  try {
    const cmdQueryResult = await runReg([
      'QUERY',
      `${values.progIdKey}\\shell\\open\\command`,
      '/ve',
    ]);
    if (cmdQueryResult.stdout.includes(values.command)) {
      await runReg(['DELETE', values.progIdKey, '/f']);
    }
  } catch {}

  if (deps.notifyShell !== false && process.platform === 'win32') {
    const notify = deps.notifyShellAssocChanged || notifyShellAssocChanged;
    try {
      await notify(deps.execFileImpl);
    } catch {}
  }
}

module.exports = {
  EXTENSION_KEY,
  PROG_ID,
  PROG_ID_KEY,
  resolveDefaultIcon,
  notifyShellAssocChanged,
  buildAssociationValues,
  createRegRunner,
  registerAdiaAssociation,
  unregisterOwnedAdiaAssociation,
};
