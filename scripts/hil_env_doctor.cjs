#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  TOOLCHAINS, FLASH_TOOLS,
  isToolchainLocallyInstalled, isFlashToolLocallyInstalled,
  ensureToolchain, configureToolchainPaths,
} = require('../src/security/toolchainManager.cjs');

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const jsonOut = args.includes('--json');
const toolchainsDir = path.join(process.cwd(), 'toolchains');

const rows = [];
function check(kind, id, label, installedFn) {
  const installed = installedFn();
  rows.push({ kind, id, label, installed });
  return installed;
}

let ok = true;
ok = Boolean(ok & check('compiler', 'Generic', 'Host C compiler (w64devkit gcc)', () => isToolchainLocallyInstalled('Generic', toolchainsDir)));
ok = Boolean(ok & check('compiler', 'Arduino', 'avr-gcc 15.2.0 (ATmega328P/Mega2560)', () => isToolchainLocallyInstalled('Arduino', toolchainsDir)));
ok = Boolean(ok & check('compiler', 'STM32', 'arm-none-eabi-gcc 10.3 (STM32F1/F4)', () => isToolchainLocallyInstalled('STM32', toolchainsDir)));
ok = Boolean(ok & check('compiler', 'ESP32', 'xtensa-esp32-elf-gcc 13.2', () => isToolchainLocallyInstalled('ESP32', toolchainsDir)));
ok = Boolean(ok & check('flasher', 'avrdude', 'avrdude (Mega2560/Uno)', () => isFlashToolLocallyInstalled('avrdude', toolchainsDir)));
ok = Boolean(ok & check('flasher', 'openocd', 'OpenOCD (ST-Link F1/F4)', () => isFlashToolLocallyInstalled('openocd', toolchainsDir)));
ok = Boolean(ok & check('flasher', 'esptool', 'esptool (ESP32-WROOM-32)', () => isFlashToolLocallyInstalled('esptool', toolchainsDir)));

let serialportOk = true;
try { require.resolve('serialport'); } catch { serialportOk = false; }
rows.push({ kind: 'runtime', id: 'serialport', label: 'serialport@12 native module loads', installed: serialportOk });
ok = Boolean(ok & serialportOk);

async function runFix() {
  if (fix) {
    for (const row of rows.filter(r => r.kind === 'compiler' || r.kind === 'flasher')) {
      if (!row.installed) {
        const key = row.id;
        console.log(`[FIX] Installing ${key} ...`);
        try {
          await ensureToolchain(key, toolchainsDir);
          row.installed = true;
        } catch (e) {
          console.error(`[FIX] Failed to install ${key}: ${e.message}`);
          ok = false;
        }
      }
    }
    configureToolchainPaths(toolchainsDir);
    // Recalculate ok status
    ok = rows.every(r => r.installed);
  }

  if (jsonOut) {
    console.log(JSON.stringify({ ok: !!ok, toolchainsDir, rows }, null, 2));
  } else {
    console.log('\nADIA HIL Environment Doctor');
    console.log(`toolchains dir: ${toolchainsDir}\n`);
    for (const r of rows) {
      console.log(`${r.installed ? '[ OK ]' : '[MISS]'} ${r.kind.padEnd(8)} ${r.id.padEnd(9)} ${r.label}`);
    }
    console.log(ok ? '\nEnvironment ready.' : '\nEnvironment INCOMPLETE. Re-run with --fix to install missing compilers/flashers.');
  }
  const strict = process.argv.includes('--strict');
  process.exit(ok || !strict ? 0 : 1);
}

runFix().catch(err => {
  console.error(err);
  process.exit(1);
});
