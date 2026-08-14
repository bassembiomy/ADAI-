'use strict';

const EXTENSION_KEY = 'HKCU\\Software\\Classes\\.adia';
const PROG_ID = 'ADIA.Project';
const PROG_ID_KEY = `HKCU\\Software\\Classes\\${PROG_ID}`;

function buildAssociationValues(execPath) {
  return {
    extensionKey: EXTENSION_KEY,
    progIdKey: PROG_ID_KEY,
    icon: `"${execPath}",0`,
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
  const values = buildAssociationValues(execPath);

  // 1. Set HKCU\Software\Classes\.adia (Default) -> ADIA.Project
  await runReg(['ADD', values.extensionKey, '/ve', '/d', PROG_ID, '/f']);

  // 2. Set HKCU\Software\Classes\ADIA.Project (Default) -> "ADIA Project File"
  await runReg(['ADD', values.progIdKey, '/ve', '/d', 'ADIA Project File', '/f']);

  // 3. Set HKCU\Software\Classes\ADIA.Project\DefaultIcon (Default) -> "execPath",0
  await runReg(['ADD', `${values.progIdKey}\\DefaultIcon`, '/ve', '/d', values.icon, '/f']);

  // 4. Set HKCU\Software\Classes\ADIA.Project\shell\open\command (Default) -> "execPath" "%1"
  await runReg(['ADD', `${values.progIdKey}\\shell\\open\\command`, '/ve', '/d', values.command, '/f']);
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
}

module.exports = {
  EXTENSION_KEY,
  PROG_ID,
  PROG_ID_KEY,
  buildAssociationValues,
  createRegRunner,
  registerAdiaAssociation,
  unregisterOwnedAdiaAssociation,
};
