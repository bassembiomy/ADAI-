'use strict';

const assert = require('node:assert/strict');
const { detectProbes, KNOWN_PROBE_PATTERNS } = require('./hilProbeService.cjs');

async function runTests() {
  console.log('Running hilProbeService tests...');

  // Test 1: Returns detected mock probes matching target selection
  const mockProbes = await detectProbes({
    targetId: 'stm32f407vgt6',
    packVersion: '1.0.0',
    driverMode: 'vendor',
    boardRevision: 'A',
  }, {
    mockProbes: [
      { probeId: 'stlink-001', programmerId: 'stlink-v2-1', serial: '066EFF53', deviceSignature: '0x10016413' },
    ],
  });

  assert.equal(mockProbes.length, 1);
  assert.equal(mockProbes[0].probeId, 'stlink-001');

  // Test 2: Detects and classifies real port list by VID/PID
  const mockPortList = [
    { path: 'COM3', vendorId: '0483', productId: '374B', serialNumber: 'ST12345', manufacturer: 'STMicroelectronics' },
    { path: 'COM4', vendorId: '2341', productId: '0043', serialNumber: 'ARD9876', manufacturer: 'Arduino LLC' },
    { path: 'COM5', vendorId: '303A', productId: '1001', serialNumber: 'ESP5555', manufacturer: 'Espressif' },
    { path: 'COM6', vendorId: 'FFFF', productId: '0000', serialNumber: 'UNK0000', manufacturer: 'Unknown Device' },
  ];

  // Test 2a: No target filter returns all 3 recognized probes
  const allProbes = await detectProbes(null, {
    listPorts: async () => mockPortList,
  });
  assert.equal(allProbes.length, 3);
  assert.equal(allProbes.some(p => p.programmerId === 'stlink-v2-1' && p.port === 'COM3'), true);
  assert.equal(allProbes.some(p => p.programmerId === 'avrdude' && p.port === 'COM4'), true);
  assert.equal(allProbes.some(p => p.programmerId === 'esptool' && p.port === 'COM5'), true);

  // Test 2b: Filtering for STM32 only returns ST-Link probe
  const stm32Probes = await detectProbes({ targetId: 'stm32f407vgt6' }, {
    listPorts: async () => mockPortList,
  });
  assert.equal(stm32Probes.length, 1);
  assert.equal(stm32Probes[0].programmerId, 'stlink-v2-1');
  assert.equal(stm32Probes[0].port, 'COM3');

  // Test 2c: Filtering for Arduino Uno only returns avrdude probe
  const avrProbes = await detectProbes({ targetId: 'atmega328p' }, {
    listPorts: async () => mockPortList,
  });
  assert.equal(avrProbes.length, 1);
  assert.equal(avrProbes[0].programmerId, 'avrdude');
  assert.equal(avrProbes[0].port, 'COM4');

  // Test 2d: Filtering for ESP32 only returns esptool probe
  const espProbes = await detectProbes({ targetId: 'esp32-wroom-32' }, {
    listPorts: async () => mockPortList,
  });
  assert.equal(espProbes.length, 1);
  assert.equal(espProbes[0].programmerId, 'esptool');
  assert.equal(espProbes[0].port, 'COM5');

  console.log('hilProbeService tests passed!');
}

runTests().catch(err => {
  console.error('hilProbeService tests failed:', err);
  process.exit(1);
});
