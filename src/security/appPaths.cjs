'use strict';

const path = require('node:path');

function requireNonEmpty(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`resolveAppPaths: ${name} must be a non-empty string`);
  }
}

/**
 * Pure path resolution for installed vs. dev runs (no Electron required).
 * Read-only assets live in resourcesPath when packaged; everything the app
 * writes (repair downloads, HIL build output) lives under userData, never cwd.
 */
function resolveAppPaths({ isPackaged, resourcesPath, userDataPath, cwd }) {
  requireNonEmpty('userDataPath', userDataPath);
  if (isPackaged) requireNonEmpty('resourcesPath', resourcesPath);
  else requireNonEmpty('cwd', cwd);
  const assetRoot = isPackaged ? resourcesPath : cwd;
  return Object.freeze({
    bundledToolchainsDir: path.join(assetRoot, 'toolchains'),
    userToolchainsDir: path.join(userDataPath, 'toolchains'),
    targetPacksDir: path.join(assetRoot, 'target-packs'),
    vendorDir: path.join(assetRoot, 'vendor'),
    hilBuildDir: path.join(userDataPath, 'hil_build'),
  });
}

module.exports = { resolveAppPaths };
