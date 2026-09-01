'use strict';

const EXACT_TARGET_ID = /^[a-z][a-z0-9-]{1,63}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const REQUEST_FIELDS = new Set(['buildId', 'sourceManifestHash', 'targetSelection']);
const COMMON_SOURCES = Object.freeze([
  'sm_mapping.c', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'hal_drivers.c',
  'hil_interface.c', 'mcal_dio_hil.c', 'adia_mcal.c', 'adia_component.c',
]);

const RECIPES = Object.freeze({
  stm32f103c8t6: Object.freeze({
    recipeId: 'arm-none-eabi-stm32f103c8-v1',
    compilerFlags: Object.freeze(['-mcpu=cortex-m3', '-mthumb', '-Os', '-Wall', '-Wextra', '-Werror']),
    main: 'main_hil.c',
  }),
  stm32f407vgt6: Object.freeze({
    recipeId: 'arm-none-eabi-stm32f407vg-v1',
    compilerFlags: Object.freeze(['-mcpu=cortex-m4', '-mthumb', '-Os', '-Wall', '-Wextra', '-Werror']),
    main: 'main_hil.c',
  }),
  atmega328p: Object.freeze({
    recipeId: 'avr-gcc-atmega328p-v1',
    compilerFlags: Object.freeze(['-mmcu=atmega328p', '-DF_CPU=16000000UL', '-DADIA_BARE_ARDUINO_MAIN', '-Os', '-Wall', '-Wextra', '-Werror']),
    main: 'main_hil.ino',
    extraSources: Object.freeze(['Arduino.cpp']),
  }),
  atmega2560: Object.freeze({
    recipeId: 'avr-gcc-atmega2560-v1',
    compilerFlags: Object.freeze(['-mmcu=atmega2560', '-DF_CPU=16000000UL', '-DADIA_BARE_ARDUINO_MAIN', '-Os', '-Wall', '-Wextra', '-Werror']),
    main: 'main_hil.ino',
    extraSources: Object.freeze(['Arduino.cpp']),
  }),
  'esp32-wroom-32': Object.freeze({
    recipeId: 'esp-idf-esp32-wroom-32-v1',
    compilerFlags: Object.freeze(['-DADIA_BARE_ARDUINO_MAIN', '-Os', '-Wall', '-Wextra', '-Werror']),
    main: 'main_hil.ino',
    extraSources: Object.freeze(['Arduino.cpp']),
  }),
  'generic-host': Object.freeze({
    recipeId: 'gcc-generic-host-v1',
    compilerFlags: Object.freeze(['-std=c99', '-Os', '-Wall', '-Wextra']),
    main: 'main_hil.c',
  }),
});

function denied(code, error) {
  return Object.freeze({ allowed: false, code, error });
}

function validSelection(selection) {
  return selection
    && EXACT_TARGET_ID.test(String(selection.targetId || ''))
    && SEMVER.test(String(selection.packVersion || ''))
    && (selection.driverMode === 'vendor' || selection.driverMode === 'bare-metal')
    && /^[A-Za-z0-9._:-]{1,128}$/.test(String(selection.boardRevision || ''));
}

function sameSelection(left, right) {
  return left.targetId === right.targetId
    && left.packVersion === right.packVersion
    && left.driverMode === right.driverMode
    && left.boardRevision === right.boardRevision;
}

function evaluateBuildRequest(request, workspace) {
  if (!workspace) return denied('NO_SAVED_WORKSPACE', 'Save a generated workspace before building');
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return denied('INVALID_BUILD_REQUEST', 'A structured build request is required');
  }
  const unexpected = Object.keys(request).find(key => !REQUEST_FIELDS.has(key));
  if (unexpected) return denied('UNEXPECTED_BUILD_FIELD', `Renderer-controlled field is not accepted: ${unexpected}`);
  if (!validSelection(request.targetSelection)) {
    return denied('INVALID_TARGET_SELECTION', 'An exact validated target selection is required');
  }
  if (!SAFE_ID.test(String(request.buildId || '')) || request.buildId !== workspace.buildId) {
    return denied('STALE_BUILD', 'Build token does not match the saved workspace');
  }
  if (!SHA256.test(String(request.sourceManifestHash || '')) || request.sourceManifestHash !== workspace.sourceManifestHash) {
    return denied('STALE_SOURCE_MANIFEST', 'Source manifest hash does not match the saved workspace');
  }
  if (!workspace.targetSelection || !sameSelection(request.targetSelection, workspace.targetSelection)) {
    return denied('TARGET_MISMATCH', 'Exact target selection does not match the saved workspace');
  }
  if (workspace.flashBlocked) return denied('INTEGRATION_STUBBED', 'One or more required target providers are stubbed');
  const recipe = RECIPES[request.targetSelection.targetId];
  if (!recipe) return denied('NO_TRUSTED_RECIPE', 'No application-owned build recipe exists for this exact target');
  const present = new Set(Array.isArray(workspace.files) ? workspace.files : []);
  const targetSources = [...COMMON_SOURCES, ...(recipe.extraSources || []), recipe.main];
  const missing = targetSources.filter(name => !present.has(name));
  if (missing.length > 0) return denied('INCOMPLETE_SOURCE_SET', `Missing required generated files: ${missing.join(', ')}`);
  return Object.freeze({
    allowed: true,
    recipeId: recipe.recipeId,
    compilerFlags: recipe.compilerFlags,
    sourceFiles: Object.freeze(targetSources),
  });
}

module.exports = { evaluateBuildRequest };
