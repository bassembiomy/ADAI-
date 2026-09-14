#!/usr/bin/env node
'use strict';

const os = require('node:os');
const path = require('node:path');
const {
  TARGET_ENVIRONMENTS,
  resolveInstalledToolchain,
} = require('../src/security/toolchainManager.cjs');

const resourcesPath = process.cwd();
const isolatedFallback = path.join(os.tmpdir(), 'adia-bundle-verifier-no-fallback');
const keys = ['Generic', ...new Set(Object.values(TARGET_ENVIRONMENTS).flatMap(item => [item.compiler, item.flasher]))];
let ok = true;

console.log(`Verifying packaged HIL resources under ${path.join(resourcesPath, 'toolchains')}`);
for (const key of keys) {
  const resolved = resolveInstalledToolchain(key, {
    resourcesPath,
    toolchainsDir: isolatedFallback,
    repoRoot: isolatedFallback,
  });
  if (!resolved?.executable) ok = false;
  console.log(`[${resolved?.executable ? ' OK ' : 'MISS'}] ${key.padEnd(9)} ${resolved?.executable || ''}`);
}

if (!ok) {
  console.error('Bundled HIL toolchain resources are incomplete. Run "npm run provision:hil".');
  process.exitCode = 1;
} else {
  console.log('Bundled HIL toolchain resources are complete.');
}
