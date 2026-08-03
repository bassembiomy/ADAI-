'use strict';

const EXACT_TARGET_ID = /^[a-z][a-z0-9-]{1,63}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function denied(code, error) {
  return Object.freeze({ allowed: false, code, error });
}

function validSelection(selection) {
  return selection
    && EXACT_TARGET_ID.test(String(selection.targetId || ''))
    && SEMVER.test(String(selection.packVersion || ''))
    && (selection.driverMode === 'vendor' || selection.driverMode === 'bare-metal')
    && SAFE_ID.test(String(selection.boardRevision || ''));
}

function sameSelection(left, right) {
  return left.targetId === right.targetId
    && left.packVersion === right.packVersion
    && left.driverMode === right.driverMode
    && left.boardRevision === right.boardRevision;
}

function evaluateFlashRequest(request, currentBuild) {
  if (!currentBuild) return denied('NO_VERIFIED_BUILD', 'No verified linked build is available');
  if (currentBuild.flashBlocked) return denied('FLASH_BLOCKED', 'The integration manifest blocks flashing');
  if (!request || !validSelection(request.targetSelection)) {
    return denied('INVALID_TARGET_SELECTION', 'An exact validated target selection is required');
  }
  if (!SAFE_ID.test(String(request.buildId || '')) || request.buildId !== currentBuild.buildId) {
    return denied('STALE_BUILD', 'The requested build is not current');
  }
  if (!SHA256.test(String(request.artifactHash || '')) || request.artifactHash !== currentBuild.artifactHash) {
    return denied('STALE_ARTIFACT', 'The requested artifact hash is not current');
  }
  if (!sameSelection(request.targetSelection, currentBuild.targetSelection)) {
    return denied('TARGET_MISMATCH', 'Target selection does not match the linked artifact');
  }
  if (!SAFE_ID.test(String(request.programmerId || '')) || !SAFE_ID.test(String(request.probeId || ''))) {
    return denied('INVALID_PROGRAMMER', 'Programmer and probe identity are required');
  }
  if (!SAFE_ID.test(String(request.confirmationToken || '')) || String(request.confirmationToken).length < 16) {
    return denied('CONFIRMATION_REQUIRED', 'Explicit flash confirmation is required');
  }
  return Object.freeze({ allowed: true, request: Object.freeze({ ...request }) });
}

module.exports = { evaluateFlashRequest };
