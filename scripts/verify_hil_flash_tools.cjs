#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getFlashCommand } = require('../src/security/hilRuntime.cjs');
const option = process.argv.indexOf('--resources-path');
const opts = option >= 0 ? { resourcesPath: process.argv[option + 1] } : { repoRoot: path.resolve(__dirname, '..') };
let failed = false;
// Parse tool/configuration files only. No probe initialization or programming.
for (const targetId of ['atmega328p','atmega2560','stm32f103c8t6','stm32f407vgt6','esp32-wroom-32']) {
  try {
    const command = getFlashCommand(targetId, [{ path: 'firmware.elf', address: '0x10000' }], { ...opts, port: 'COM3' });
    const args = targetId.startsWith('atmega') ? ['-C', command.args[1], '-?']
      : targetId.startsWith('stm32') ? [...command.args.slice(0, -1), 'shutdown'] : ['--help'];
    const result = spawnSync(command.executable, args, { encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000 });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || `Exit ${result.status}`);
    console.log(`[ OK ] ${targetId} bundled flasher and configuration self-check`);
  } catch (error) { failed = true; console.error(`[FAIL] ${targetId}: ${error.message}`); }
}
if (failed) process.exitCode = 1;
