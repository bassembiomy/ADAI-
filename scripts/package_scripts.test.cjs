'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const forge = fs.readFileSync(path.join(root, 'forge.config.cjs'), 'utf8');

assert.equal(pkg.scripts.start, 'npm run build:offline && electron-forge start');
assert.equal(pkg.scripts['build:offline'], 'npm run build:sm-runtime && tsc && vite build && npm run build:electron');
assert.equal(pkg.scripts['start:prebuilt'], 'electron-forge start');
assert.equal(pkg.scripts['provision:hil'], 'node scripts/provision_hil_toolchains.cjs');
assert.equal(pkg.scripts['test:hil:bundle'], 'node scripts/verify_bundled_hil_toolchains.cjs');
assert.match(pkg.scripts['test:hil:env'], /--strict/);
assert.match(pkg.scripts['test:security'], /offlineToolchainPolicy\.test\.cjs/);
assert.match(forge, /extraResource:[\s\S]*path\.resolve\(__dirname, 'toolchains'\)/);

console.log('package script and bundled resource tests passed!');
