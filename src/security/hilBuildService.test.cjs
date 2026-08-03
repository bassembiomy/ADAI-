'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { HilBuildService } = require('./hilBuildService.cjs');

async function runTests() {
  console.log('Running hilBuildService tests...');

  const service = new HilBuildService();

  const validWorkspace = {
    buildId: 'BUILD_12345678',
    sourceManifestHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    targetSelection: {
      targetId: 'stm32f407vgt6',
      packVersion: '1.0.0',
      driverMode: 'vendor',
      boardRevision: 'A',
    },
    flashBlocked: false,
    files: [
      'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'hal_drivers.c',
      'hil_interface.c', 'mcal_dio_hil.c', 'adia_mcal.c', 'adia_component.c',
      'main_hil.c',
    ],
  };

  const validRequest = {
    buildId: 'BUILD_12345678',
    sourceManifestHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    targetSelection: {
      targetId: 'stm32f407vgt6',
      packVersion: '1.0.0',
      driverMode: 'vendor',
      boardRevision: 'A',
    },
  };

  // Test 1: Rejects request with unexpected field (e.g. flags: ['-DATTACK'])
  await assert.rejects(
    () => service.build({ ...validRequest, flags: ['-DATTACK'] }, validWorkspace),
    error => error.code === 'UNEXPECTED_BUILD_FIELD'
  );

  // Test 2: Rejects build request when target selection does not match workspace
  await assert.rejects(
    () => service.build({
      ...validRequest,
      targetSelection: { ...validRequest.targetSelection, targetId: 'stm32f103c8t6' },
    }, validWorkspace),
    error => error.code === 'TARGET_MISMATCH'
  );

  console.log('hilBuildService tests passed!');
}

runTests().catch(err => {
  console.error('hilBuildService tests failed:', err);
  process.exit(1);
});
