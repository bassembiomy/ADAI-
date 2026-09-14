'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

assert.doesNotMatch(
  mainSource,
  /downloadAndExtractToolchain/,
  'Electron runtime must never download or install a toolchain',
);
assert.doesNotMatch(
  mainSource,
  /Initiating automatic toolchain installation|Background installing missing toolchain/,
  'startup/build logs must not claim a background installation',
);
assert.match(
  mainSource,
  /OFFLINE_TOOLCHAIN_MISSING|npm run provision:hil/,
  'missing toolchains must point to explicit offline provisioning',
);
assert.match(mainSource, /process\.env\.ADIA_DEV_SERVER_URL/);
assert.doesNotMatch(
  mainSource,
  /else \{\s*win\.loadURL\('http:\/\/localhost:3000'\)/,
  'default Electron startup must load the freshly built renderer without probing a stale dev URL',
);

console.log('offline toolchain runtime policy tests passed!');
