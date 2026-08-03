'use strict';

const assert = require('node:assert/strict');
const { evaluateBuildRequest } = require('./hilBuildPolicy.cjs');

const selection = Object.freeze({
  targetId: 'stm32f407vgt6',
  packVersion: '1.0.0',
  driverMode: 'vendor',
  boardRevision: 'A',
});
const workspace = Object.freeze({
  buildId: 'build-12345678',
  sourceManifestHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  targetSelection: selection,
  flashBlocked: false,
  files: Object.freeze(['sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'main_hil.c', 'hal_drivers.c', 'hil_interface.c', 'mcal_dio_hil.c', 'adia_mcal.c', 'adia_component.c']),
});
const request = Object.freeze({
  buildId: workspace.buildId,
  sourceManifestHash: workspace.sourceManifestHash,
  targetSelection: selection,
});

function denied(name, candidate, current, code) {
  const result = evaluateBuildRequest(candidate, current);
  assert.equal(result.allowed, false, name);
  assert.equal(result.code, code, name);
  process.stdout.write(`  ✓ ${name}\n`);
}

denied('rejects missing saved workspace', request, null, 'NO_SAVED_WORKSPACE');
denied('rejects renderer compiler flags', { ...request, optimization: '-O0' }, workspace, 'UNEXPECTED_BUILD_FIELD');
denied('rejects stale source manifests', { ...request, sourceManifestHash: `sha256:${'b'.repeat(64)}` }, workspace, 'STALE_SOURCE_MANIFEST');
denied('rejects target mismatch', { ...request, targetSelection: { ...selection, targetId: 'stm32f103c8t6' } }, workspace, 'TARGET_MISMATCH');
denied('rejects family-level targets', { ...request, targetSelection: { ...selection, targetId: 'STM32F4' } }, workspace, 'INVALID_TARGET_SELECTION');
denied('rejects stubbed integrations', request, { ...workspace, flashBlocked: true }, 'INTEGRATION_STUBBED');
denied('rejects incomplete source sets', request, { ...workspace, files: ['sm_core.c'] }, 'INCOMPLETE_SOURCE_SET');

const allowed = evaluateBuildRequest(request, workspace);
assert.equal(allowed.allowed, true);
assert.equal(allowed.recipeId, 'arm-none-eabi-stm32f407vg-v1');
assert.deepEqual(allowed.compilerFlags, ['-mcpu=cortex-m4', '-mthumb', '-Os', '-Wall', '-Wextra', '-Werror']);
process.stdout.write('  ✓ returns an application-owned fixed recipe\n');
