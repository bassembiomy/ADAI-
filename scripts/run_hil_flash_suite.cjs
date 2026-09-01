#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { HilFlashService } = require('../src/security/hilFlashService.cjs');
const { evaluateFlashRequest } = require('../src/security/hilFlashPolicy.cjs');
const { getFlashRecipe } = require('../src/security/hilFlashRecipes.cjs');
const { detectProbes } = require('../src/security/hilProbeService.cjs');

async function runFlashSuite() {
  console.log('\n======================================================');
  console.log('  ADIA HIL Hardware Flashing Gate & Security Suite');
  console.log('======================================================\n');

  let anyFailures = false;

  function runCase(name, fn) {
    try {
      fn();
      console.log(`[ PASS ] ${name}`);
    } catch (e) {
      console.error(`[ FAIL ] ${name}: ${e.message}`);
      anyFailures = true;
    }
  }

  async function runAsyncCase(name, fn) {
    try {
      await fn();
      console.log(`[ PASS ] ${name}`);
    } catch (e) {
      console.error(`[ FAIL ] ${name}: ${e.message}`);
      anyFailures = true;
    }
  }

  const validBuildRecord = {
    buildId: 'BUILD_STM32F4_001',
    status: 'LINKED_IMAGE_VERIFIED',
    flashBlocked: false,
    targetSelection: {
      targetId: 'stm32f407vgt6',
      packVersion: '1.0.0',
      driverMode: 'bare-metal',
      boardRevision: 'A',
    },
    artifacts: {
      elfPath: '/tmp/build/firmware.elf',
      hashes: { elf: 'sha256:1111111111111111111111111111111111111111111111111111111111111111' },
    },
    artifactHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    sourceManifestHash: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  };

  const validFlashRequest = {
    buildId: 'BUILD_STM32F4_001',
    targetSelection: {
      targetId: 'stm32f407vgt6',
      packVersion: '1.0.0',
      driverMode: 'bare-metal',
      boardRevision: 'A',
    },
    artifactHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    programmerId: 'stlink-v2-1',
    probeId: 'stlink-001',
    confirmationToken: 'CONFIRM_TOKEN_0123456789abcdef',
  };

  // Section 1: Security Policy Gate Checks
  console.log('--- 1. Security Policy Gate Rejections ---');

  runCase('Rejects missing build record (NO_VERIFIED_BUILD)', () => {
    const res = evaluateFlashRequest(validFlashRequest, null);
    assert.equal(res.allowed, false);
    assert.equal(res.code, 'NO_VERIFIED_BUILD');
  });

  runCase('Rejects blocked flash builds (FLASH_BLOCKED)', () => {
    const res = evaluateFlashRequest(validFlashRequest, { ...validBuildRecord, flashBlocked: true });
    assert.equal(res.allowed, false);
    assert.equal(res.code, 'FLASH_BLOCKED');
  });

  runCase('Rejects stale build ID (STALE_BUILD)', () => {
    const res = evaluateFlashRequest({ ...validFlashRequest, buildId: 'BUILD_OTHER_002' }, validBuildRecord);
    assert.equal(res.allowed, false);
    assert.equal(res.code, 'STALE_BUILD');
  });

  runCase('Rejects mismatched artifact hash (STALE_ARTIFACT)', () => {
    const res = evaluateFlashRequest({
      ...validFlashRequest,
      artifactHash: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    }, validBuildRecord);
    assert.equal(res.allowed, false);
    assert.equal(res.code, 'STALE_ARTIFACT');
  });

  runCase('Rejects mismatched target selection (TARGET_MISMATCH)', () => {
    const res = evaluateFlashRequest({
      ...validFlashRequest,
      targetSelection: { ...validFlashRequest.targetSelection, targetId: 'stm32f103c8t6' },
    }, validBuildRecord);
    assert.equal(res.allowed, false);
    assert.equal(res.code, 'TARGET_MISMATCH');
  });

  runCase('Rejects missing programmer or probe (INVALID_PROGRAMMER)', () => {
    const res = evaluateFlashRequest({ ...validFlashRequest, programmerId: '' }, validBuildRecord);
    assert.equal(res.allowed, false);
    assert.equal(res.code, 'INVALID_PROGRAMMER');
  });

  runCase('Rejects missing confirmation token (CONFIRMATION_REQUIRED)', () => {
    const res = evaluateFlashRequest({ ...validFlashRequest, confirmationToken: '' }, validBuildRecord);
    assert.equal(res.allowed, false);
    assert.equal(res.code, 'CONFIRMATION_REQUIRED');
  });

  runCase('Accepts verified build with matching hash and confirmed token', () => {
    const res = evaluateFlashRequest(validFlashRequest, validBuildRecord);
    assert.equal(res.allowed, true);
  });

  // Section 2: Flasher Recipe Verification
  console.log('\n--- 2. Flasher Recipe Verification ---');

  runCase('Generates OpenOCD recipe for STM32F4', () => {
    const recipe = getFlashRecipe('stm32f407vgt6', { artifactPath: '/tmp/firmware.elf' });
    assert.equal(recipe.executable, 'openocd');
    assert.equal(recipe.args.some(a => a.includes('stm32f4x.cfg')), true);
  });

  runCase('Generates OpenOCD recipe for STM32F1', () => {
    const recipe = getFlashRecipe('stm32f103c8t6', { artifactPath: '/tmp/firmware.elf' });
    assert.equal(recipe.executable, 'openocd');
    assert.equal(recipe.args.some(a => a.includes('stm32f1x.cfg')), true);
  });

  runCase('Generates AVRDUDE recipe for ATmega328P (Uno)', () => {
    const recipe = getFlashRecipe('atmega328p', { artifactPath: '/tmp/firmware.hex' });
    assert.equal(recipe.executable, 'avrdude');
    assert.equal(recipe.args.includes('m328p'), true);
  });

  runCase('Generates AVRDUDE recipe for ATmega2560 (Mega)', () => {
    const recipe = getFlashRecipe('atmega2560', { artifactPath: '/tmp/firmware.hex' });
    assert.equal(recipe.executable, 'avrdude');
    assert.equal(recipe.args.includes('m2560'), true);
  });

  runCase('Generates esptool recipe for ESP32', () => {
    const recipe = getFlashRecipe('esp32-wroom-32', { artifactPath: '/tmp/firmware.bin', port: 'COM5' });
    assert.equal(recipe.executable, 'esptool.py');
    assert.equal(recipe.args.includes('--chip'), true);
    assert.equal(recipe.args.includes('esp32'), true);
  });

  // Section 3: Probe Detection & Service Execution
  console.log('\n--- 3. Probe Detection & Service Execution ---');

  await runAsyncCase('HilFlashService issues single-use token and executes verified flash', async () => {
    const flashService = new HilFlashService();
    const probe = { probeId: 'stlink-001', programmerId: 'stlink-v2-1', serial: '066EFF53', deviceSignature: '0x10016413' };

    const tokenRecord = flashService.issueFlashConfirmation(validBuildRecord.buildId, probe.probeId);
    assert.ok(tokenRecord.token);
    assert.ok(tokenRecord.token.length >= 32);

    const flashReq = {
      ...validFlashRequest,
      confirmationToken: tokenRecord.token,
    };

    const result = await flashService.flash(flashReq, validBuildRecord, {
      mockSpawn: async (executable, args) => ({ exitCode: 0, stdout: 'Flash successful and verified', stderr: '' }),
      probes: [probe],
    });

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'FLASH_VERIFIED');
    assert.equal(result.probeId, 'stlink-001');
  });

  if (anyFailures) {
    console.error('\nFlash gate test suite encountered failures.');
    process.exit(1);
  } else {
    console.log('\nAll HIL hardware flashing gate and security tests passed.');
    process.exit(0);
  }
}

runFlashSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
