'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
assert.ok(!/setCertificateVerifyProc\s*\(/.test(mainSource), 'Use Chromium certificate verification for every host');
console.log('Electron certificate policy test passed.');
