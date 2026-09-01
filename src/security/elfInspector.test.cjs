'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { inspectElf, parseMemoryUsage } = require('./elfInspector.cjs');
const { getTargetLimits, loadTargetPackManifest } = require('./targetPackLoader.cjs');

async function runTests() {
  console.log('Running elfInspector tests...');

  // Test 1: parseMemoryUsage correctly parses GNU size output format with manifest
  const sizeOutput = `   text\t   data\t    bss\t    dec\t    hex\tfilename\n   1024\t    128\t     64\t   1216\t    4c0\tfirmware.elf\n`;
  const memory = parseMemoryUsage(sizeOutput, {
    memoryRegions: [
      { name: 'FLASH', start: 0x08000000, size: 65536 },
      { name: 'RAM', start: 0x20000000, size: 20480 },
    ],
  });

  assert.equal(memory.flashUsed, 1152); // text (1024) + data (128)
  assert.equal(memory.ramUsed, 192);   // data (128) + bss (64)
  assert.equal(memory.flashTotal, 65536);
  assert.equal(memory.ramTotal, 20480);
  assert.equal(memory.overflow, false);

  // Test 2: Detects memory overflow with object pack
  const overflowOutput = `   text\t   data\t    bss\t    dec\t    hex\tfilename\n  70000\t    128\t     64\t  70192\t  11230\tfirmware.elf\n`;
  const overflowMemory = parseMemoryUsage(overflowOutput, {
    memoryRegions: [
      { name: 'FLASH', start: 0x08000000, size: 65536 },
      { name: 'RAM', start: 0x20000000, size: 20480 },
    ],
  });
  assert.equal(overflowMemory.overflow, true);
  assert.equal(overflowMemory.flashOverflow, true);
  assert.equal(overflowMemory.ramOverflow, false);

  // Test 3: targetPackLoader loads real on-disk manifests
  const stm32Limits = getTargetLimits('stm32f103c8t6');
  assert.equal(stm32Limits.flash, 65536);
  assert.equal(stm32Limits.sram, 20480);

  const atmegaLimits = getTargetLimits('atmega328p');
  assert.equal(atmegaLimits.flash, 32768);
  assert.equal(atmegaLimits.sram, 2048);

  const esp32Limits = getTargetLimits('esp32-wroom-32');
  assert.equal(esp32Limits.flash, 4194304);
  assert.equal(esp32Limits.sram, 327680);

  // Test 4: inspectElf with fake ELF file and mock size exceeding ATMega328P Flash (32256)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elf-test-'));
  const fakeElf = path.join(tmpDir, 'firmware.elf');
  fs.writeFileSync(fakeElf, 'FAKE_ELF_BINARY');

  const flashOverflowResult = await inspectElf(fakeElf, 'atmega328p', {
    mockSizeOutput: `   text\t   data\t    bss\t    dec\t    hex\tfilename\n  35000\t    100\t     50\t  35150\t   894e\tfirmware.elf\n`,
  });
  assert.equal(flashOverflowResult.valid, false);
  assert.equal(flashOverflowResult.code, 'FLASH_OVERFLOW');
  assert.match(flashOverflowResult.message, /FLASH overflow/);

  // Test 5: inspectElf with fake ELF file and mock size exceeding ATMega328P RAM (2048)
  const ramOverflowResult = await inspectElf(fakeElf, 'atmega328p', {
    mockSizeOutput: `   text\t   data\t    bss\t    dec\t    hex\tfilename\n   5000\t   1000\t   1500\t   7500\t   1d4c\tfirmware.elf\n`,
  });
  assert.equal(ramOverflowResult.valid, false);
  assert.equal(ramOverflowResult.code, 'RAM_OVERFLOW');
  assert.match(ramOverflowResult.message, /RAM overflow/);

  // Test 6: inspectElf with valid sizes
  const validResult = await inspectElf(fakeElf, 'atmega328p', {
    mockSizeOutput: `   text\t   data\t    bss\t    dec\t    hex\tfilename\n   5000\t    200\t    300\t   5500\t   157c\tfirmware.elf\n`,
  });
  assert.equal(validResult.valid, true);
  assert.equal(validResult.memory.flashUsed, 5200);
  assert.equal(validResult.memory.ramUsed, 500);

  // Cleanup tmpDir
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('elfInspector tests passed!');
}

runTests().catch(err => {
  console.error('elfInspector tests failed:', err);
  process.exit(1);
});
