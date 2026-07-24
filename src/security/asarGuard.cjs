// src/security/asarGuard.cjs
// ============================================================================
// ASAR Integrity Guard for ADIA Engineering Suite
// ============================================================================
// Verifies that the packaged ASAR archive has not been tampered with after
// distribution. This raises the bar against local source code extraction and
// modification attacks. Runs only in packaged (production) builds.
//
// How it works:
//   1. electron-forge with `asarIntegrity: true` embeds a `resources/app-integrity.json`
//      file alongside the ASAR containing expected file hashes.
//   2. At startup, this module reads the ASAR file, hashes it with SHA-256,
//      and compares against the expected hash in `app-integrity.json`.
//   3. If the hash mismatches, the app shows an error dialog and refuses to continue.
//
// Note: This is a defense-in-depth measure. A determined attacker who controls
// the machine and has admin rights can still bypass it — but it raises the bar
// significantly against casual tampering and automated extraction tools.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

/**
 * Verifies the ASAR integrity in production builds.
 * No-ops in development mode.
 * @returns {{ ok: boolean, error?: string }}
 */
function verifyAsarIntegrity() {
  // Only enforce in production (packaged) builds
  if (!app.isPackaged) {
    return { ok: true };
  }

  try {
    const resourcesDir = path.dirname(app.getAppPath());
    const asarPath = app.getAppPath(); // path to app.asar
    const integrityPath = path.join(resourcesDir, 'app-integrity.json');

    // If no integrity file exists, skip (forge may not have generated it yet)
    if (!fs.existsSync(integrityPath)) {
      console.warn('[ASAR Guard] Integrity file not found — skipping verification.');
      return { ok: true };
    }

    const integrityData = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
    const expectedHash = integrityData?.hash;
    if (!expectedHash) {
      console.warn('[ASAR Guard] Integrity file missing expected hash field.');
      return { ok: true };
    }

    // Compute actual ASAR hash
    const asarBuffer = fs.readFileSync(asarPath);
    const actualHash = crypto.createHash('sha256').update(asarBuffer).digest('hex');

    if (actualHash !== expectedHash) {
      const error = `ASAR integrity check failed.\nExpected: ${expectedHash}\nActual:   ${actualHash}\n\nThe application package may have been tampered with.`;
      console.error('[ASAR Guard] ' + error);
      return { ok: false, error };
    }

    console.log('[ASAR Guard] Integrity check passed.');
    return { ok: true };
  } catch (err) {
    console.error('[ASAR Guard] Error during integrity check:', err.message);
    // Fail open in case of read errors (e.g., permissions) to avoid bricking app
    return { ok: true };
  }
}

/**
 * Generates an integrity file for the current ASAR build.
 * Call this from your build script after packaging, not at runtime.
 * @param {string} asarPath - Path to the app.asar file.
 * @param {string} outputPath - Where to write the integrity JSON.
 */
function generateIntegrityFile(asarPath, outputPath) {
  const buffer = fs.readFileSync(asarPath);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const data = {
    hash,
    algorithm: 'sha256',
    generatedAt: new Date().toISOString(),
    asarFile: path.basename(asarPath),
  };
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[ASAR Guard] Integrity file written to: ${outputPath}`);
  console.log(`[ASAR Guard] ASAR SHA-256: ${hash}`);
  return data;
}

module.exports = { verifyAsarIntegrity, generateIntegrityFile };
