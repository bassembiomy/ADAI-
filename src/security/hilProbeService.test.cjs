'use strict';

const assert = require('node:assert/strict');
const { detectProbes } = require('./hilProbeService.cjs');

async function runTests() {
  console.log('Running hilProbeService tests...');

  // Test 1: Returns detected probes matching target selection
  const probes = await detectProbes({
    targetId: 'stm32f407vgt6',
    packVersion: '1.0.0',
    driverMode: 'vendor',
    boardRevision: 'A',
  }, {
    mockProbes: [
      { probeId: 'stlink-001', programmerId: 'stlink-v2-1', serial: '066EFF53', deviceSignature: '0x10016413' },
    ],
  });

  assert.equal(probes.length, 1);
  assert.equal(probes[0].probeId, 'stlink-001');

  console.log('hilProbeService tests passed!');
}

runTests().catch(err => {
  console.error('hilProbeService tests failed:', err);
  process.exit(1);
});
