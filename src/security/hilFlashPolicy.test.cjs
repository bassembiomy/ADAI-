'use strict';

const assert = require('node:assert/strict');
const { evaluateFlashRequest } = require('./hilFlashPolicy.cjs');

const readyBuild = Object.freeze({
  buildId: 'build-123',
  artifactHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  targetSelection: Object.freeze({
    targetId: 'stm32f407vgt6',
    packVersion: '1.0.0',
    driverMode: 'vendor',
    boardRevision: 'A',
  }),
  flashBlocked: false,
});

const validRequest = Object.freeze({
  buildId: readyBuild.buildId,
  artifactHash: readyBuild.artifactHash,
  targetSelection: readyBuild.targetSelection,
  programmerId: 'stlink-v2',
  probeId: '066DFF525051717867013445',
  confirmationToken: 'confirm-1234567890',
});

function expectDenied(name, request, build, code) {
  const result = evaluateFlashRequest(request, build);
  assert.equal(result.allowed, false, name);
  assert.equal(result.code, code, name);
  process.stdout.write(`  ✓ ${name}\n`);
}

expectDenied('rejects missing current build', validRequest, null, 'NO_VERIFIED_BUILD');
expectDenied('rejects stub-blocked builds', validRequest, { ...readyBuild, flashBlocked: true }, 'FLASH_BLOCKED');
expectDenied('rejects stale artifact hashes', { ...validRequest, artifactHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }, readyBuild, 'STALE_ARTIFACT');
expectDenied('rejects family-level target ids', { ...validRequest, targetSelection: { ...validRequest.targetSelection, targetId: 'STM32F4' } }, readyBuild, 'INVALID_TARGET_SELECTION');
expectDenied('rejects target selection mismatch', { ...validRequest, targetSelection: { ...validRequest.targetSelection, driverMode: 'bare-metal' } }, readyBuild, 'TARGET_MISMATCH');
expectDenied('rejects missing explicit confirmation', { ...validRequest, confirmationToken: '' }, readyBuild, 'CONFIRMATION_REQUIRED');

const allowed = evaluateFlashRequest(validRequest, readyBuild);
assert.equal(allowed.allowed, true);
process.stdout.write('  ✓ accepts exact current verified artifact\n');
