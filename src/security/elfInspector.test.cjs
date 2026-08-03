'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { inspectElf, parseMemoryUsage } = require('./elfInspector.cjs');

async function runTests() {
  console.log('Running elfInspector tests...');

  // Test 1: parseMemoryUsage correctly parses GNU size output format
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

  // Test 2: Detects memory overflow
  const overflowOutput = `   text\t   data\t    bss\t    dec\t    hex\tfilename\n  70000\t    128\t     64\t  70192\t  11230\tfirmware.elf\n`;
  const overflowMemory = parseMemoryUsage(overflowOutput, {
    memoryRegions: [
      { name: 'FLASH', start: 0x08000000, size: 65536 },
      { name: 'RAM', start: 0x20000000, size: 20480 },
    ],
  });
  assert.equal(overflowMemory.overflow, true);

  console.log('elfInspector tests passed!');
}

runTests().catch(err => {
  console.error('elfInspector tests failed:', err);
  process.exit(1);
});
