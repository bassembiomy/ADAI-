'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { computeHilEnvStatus, ESP32_BLOCKED_REASON } = require('./hilEnvironment.cjs');

(async () => {
  const vendor = path.resolve('/v');
  const packs = path.resolve('/p');
  const present = new Set([
    path.join(vendor, 'stm32cube', 'stm32f4xx-hal-driver', 'Inc'),
    path.join(vendor, 'stm32cube', 'cmsis-device-f4', 'Include'),
    path.join(vendor, 'stm32cube', 'cmsis_core', 'Include'),
    path.join(packs, 'stm32f407vgt6'),
  ]);
  const tools = { gcc: '/tc/gcc', 'arm-none-eabi-gcc': '/tc/arm', openocd: '/tc/openocd' };
  const seen = [];
  const base = {
    toolchainDirs: ['/bundled', '/user'],
    vendorDir: vendor,
    targetPacksDir: packs,
    resolveExecutable: (name, dirs) => { seen.push(dirs); return tools[name] || null; },
    probeVersion: async () => '1.2.3',
    exists: (p) => present.has(p),
  };
  const byTarget = (rows) => Object.fromEntries(rows.map((r) => [r.target, r]));

  const rows = byTarget(await computeHilEnvStatus(base));
  assert.deepEqual(seen[0], ['/bundled', '/user'], 'resolver receives ordered dirs');
  assert.equal(rows.Generic.compiler.ok, true);
  assert.equal(rows.Generic.blockedReason, undefined);
  assert.equal(rows.STM32F4.compiler.path, '/tc/arm');
  assert.equal(rows.STM32F4.halAvailable, true);
  assert.equal(rows.STM32F4.blockedReason, undefined);
  assert.equal(rows.STM32F1.halAvailable, false);
  assert.match(rows.STM32F1.compileBlockedReason, /HAL/);
  assert.equal(rows.Arduino_Uno.compiler.ok, false);
  assert.match(rows.Arduino_Uno.compileBlockedReason, /avr-g\+\+/);
  assert.equal(rows.Arduino_Uno.flasher.ok, false);
  assert.equal(rows.ESP32.code, 'TARGET_NOT_YET_SUPPORTED');
  assert.equal(rows.ESP32.blockedReason, ESP32_BLOCKED_REASON);

  // Missing flasher blocks flashing only, not compiling.
  const noFlasher = byTarget(await computeHilEnvStatus({ ...base, resolveExecutable: (n) => (n === 'arm-none-eabi-gcc' ? '/tc/arm' : null) }));
  assert.equal(noFlasher.STM32F4.compileBlockedReason, undefined);
  assert.match(noFlasher.STM32F4.flashBlockedReason, /openocd/);
  console.log('hilEnvironment tests passed!');
})().catch((e) => { console.error(e); process.exit(1); });
