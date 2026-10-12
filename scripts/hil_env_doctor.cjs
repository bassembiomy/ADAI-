#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { TOOLCHAINS, FLASH_TOOLS, ensureToolchain, configureToolchainPaths } = require('../src/security/toolchainManager.cjs');
const { listToolRows, computeHilEnvStatus } = require('../src/security/hilEnvironment.cjs');
const { resolveAppPaths } = require('../src/security/appPaths.cjs');

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const jsonOut = args.includes('--json');
const userDirArg = args.find((a) => a.startsWith('--user-dir='));
const paths = resolveAppPaths({
  isPackaged: false,
  resourcesPath: '',
  userDataPath: userDirArg ? path.resolve(userDirArg.slice('--user-dir='.length)) : path.join(process.cwd(), '.adia-user'),
  cwd: process.cwd(),
});
// Same resolution order as the app: bundled -> user -> system PATH.
const toolchainDirs = [paths.bundledToolchainsDir, paths.userToolchainsDir];
// ESP32 build/flash is not supported yet (bundle:false in toolchains.lock.json), so it is informational only.
const isRequired = (row) => (TOOLCHAINS[row.id] || FLASH_TOOLS[row.id]).bundle !== false;

async function main() {
  let rows = listToolRows(toolchainDirs);
  if (fix) {
    for (const row of rows.filter((r) => !r.installed && isRequired(r))) {
      console.log(`[FIX] Installing ${row.id} ...`);
      try {
        // Hash-verified against toolchains.lock.json; fix downloads go to the bundled (dev) dir.
        await ensureToolchain(row.id, toolchainDirs, paths.bundledToolchainsDir);
      } catch (e) {
        console.error(`[FIX] Failed to install ${row.id}: ${e.message}`);
      }
    }
    configureToolchainPaths(toolchainDirs);
    rows = listToolRows(toolchainDirs);
  }

  let serialportOk = true;
  try { require.resolve('serialport'); } catch { serialportOk = false; }
  rows.push({ kind: 'runtime', id: 'serialport', label: 'serialport@12 native module loads', installed: serialportOk, path: null });

  const ok = rows.every((r) => r.installed || (r.kind !== 'runtime' && !isRequired(r)));
  const targets = await computeHilEnvStatus({
    toolchainDirs, targetPacksDir: paths.targetPacksDir, vendorDir: paths.vendorDir,
  });

  if (jsonOut) {
    console.log(JSON.stringify({ ok, toolchainDirs, rows, targets }, null, 2));
  } else {
    console.log('\nADIA HIL Environment Doctor');
    console.log(`toolchain search order: ${toolchainDirs.join(' -> ')} -> system PATH\n`);
    for (const r of rows) {
      console.log(`${r.installed ? '[ OK ]' : '[MISS]'} ${r.kind.padEnd(8)} ${r.id.padEnd(10)} ${r.label}`);
    }
    console.log('\nPer-target readiness:');
    for (const t of targets) {
      console.log(`  ${t.blockedReason ? '[BLOCKED]' : '[ READY ]'} ${t.target.padEnd(13)} ${t.blockedReason || ''}`);
    }
    console.log(ok ? '\nEnvironment ready.' : '\nEnvironment INCOMPLETE. Re-run with --fix to install missing compilers/flashers.');
  }
  process.exit(ok || !args.includes('--strict') ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
