'use strict';

const assert = require('node:assert/strict');
const { HilFlashService } = require('./hilFlashService.cjs');

async function runTests() {
  console.log('Running hilFlashService tests...');

  const service = new HilFlashService();

  const verifiedBuild = {
    buildId: 'BUILD_12345678',
    status: 'LINKED_IMAGE_VERIFIED',
    targetSelection: {
      targetId: 'stm32f407vgt6',
      packVersion: '1.0.0',
      driverMode: 'vendor',
      boardRevision: 'A',
    },
    artifacts: {
      elfPath: 'out/firmware.elf',
      hashes: { elf: 'sha256:1111111111111111111111111111111111111111111111111111111111111111' },
    },
  };

  const probe = {
    probeId: 'stlink-001',
    programmerId: 'stlink-v2-1',
    serial: '066EFF53',
    deviceSignature: '0x10016413',
  };

  // Test 1: issueFlashConfirmation produces a valid single-use token
  const confirmation = service.issueFlashConfirmation('BUILD_12345678', 'stlink-001');
  assert.ok(confirmation.token);
  assert.ok(confirmation.expiresAt > Date.now());

  const flashRequest = {
    buildId: 'BUILD_12345678',
    artifactHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    targetSelection: {
      targetId: 'stm32f407vgt6',
      packVersion: '1.0.0',
      driverMode: 'vendor',
      boardRevision: 'A',
    },
    programmerId: 'stlink-v2-1',
    probeId: 'stlink-001',
    confirmationToken: confirmation.token,
  };

  // Test 2: Flash succeeds on injected happy path with matching probe and readback
  const result = await service.flash(flashRequest, verifiedBuild, {
    probes: [probe],
    readbackHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    mockSpawn: async () => ({ exitCode: 0, stdout: 'Flash Verified', stderr: '' }),
  });

  assert.equal(result.status, 'FLASH_VERIFIED');
  assert.equal(result.probeId, 'stlink-001');
  assert.equal(result.artifactHash, flashRequest.artifactHash);

  // Test 3: Rejects re-use of single-use confirmation token
  const retryResult = await service.flash(flashRequest, verifiedBuild, { probes: [probe] });
  assert.equal(retryResult.allowed, false);
  assert.equal(retryResult.code, 'INVALID_CONFIRMATION_TOKEN');

  // Test 4: Rejects mismatched probe ID
  const conf2 = service.issueFlashConfirmation('BUILD_12345678', 'stlink-001');
  const badProbeRequest = { ...flashRequest, probeId: 'wrong-probe', confirmationToken: conf2.token };
  const badProbeResult = await service.flash(badProbeRequest, verifiedBuild, { probes: [probe] });
  assert.equal(badProbeResult.allowed, false);
  assert.equal(badProbeResult.code, 'DEVICE_MISMATCH');

  console.log('hilFlashService tests passed!');
}

runTests().catch(err => {
  console.error('hilFlashService tests failed:', err);
  process.exit(1);
});
