#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  TARGET_ENVIRONMENTS,
  resolveInstalledToolchain,
  configureToolchainPaths,
} = require('../src/security/toolchainManager.cjs');

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const strict = args.includes('--strict');
const toolchainsDir = path.join(process.cwd(), 'toolchains');
configureToolchainPaths(toolchainsDir);

const rows = [];
for (const [target, environment] of Object.entries(TARGET_ENVIRONMENTS)) {
  for (const [kind, key] of Object.entries(environment)) {
    const resolved = resolveInstalledToolchain(key, { toolchainsDir });
    rows.push({ target, kind, key, installed: Boolean(resolved?.executable), executable: resolved?.executable || null });
  }
}

const generic = resolveInstalledToolchain('Generic', { toolchainsDir });
rows.push({ target: 'Generic', kind: 'compiler', key: 'Generic', installed: Boolean(generic?.executable), executable: generic?.executable || null });

let serialportOk = true;
try { require.resolve('serialport'); } catch { serialportOk = false; }
rows.push({ target: 'All', kind: 'runtime', key: 'serialport', installed: serialportOk, executable: null });

const ok = rows.every(row => row.installed);
if (jsonOut) {
  console.log(JSON.stringify({ ok, toolchainsDir, rows }, null, 2));
} else {
  console.log('\nADIA HIL Offline Environment Doctor');
  console.log(`toolchains dir: ${toolchainsDir}\n`);
  for (const row of rows) {
    console.log(`${row.installed ? '[ OK ]' : '[MISS]'} ${row.target.padEnd(14)} ${row.kind.padEnd(8)} ${row.key.padEnd(9)} ${row.executable || ''}`);
  }
  console.log(ok
    ? '\nEnvironment ready; runtime downloads are not required.'
    : '\nEnvironment INCOMPLETE. Run "npm run provision:hil" while online, then retry.');
}

if (strict && !ok) process.exitCode = 1;
