'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// Exact fingerprints of legacy generated simulation shims. Edited files remain untouched.
const LEGACY_SHIMS = Object.freeze({
  "Arduino.h": "cd9943fa7cce2ee2e470903bac7c790d0f4b33797d3503d0124fa403132b0348",
  "Arduino.cpp": "7f1e016e6e73ddd80cf16c07855c254e8adea1be0b0a687b46bfe774fe1e14c6",
  "SPI.h": "7eab19cc4a4442db9694a40b26016bc864c02c07e241b8aba9d2dcb464a4cb44",
  "Wire.h": "91756925ef69330882e4d7f7967432ce2e5ac2af6e7a8d7eeb02e859d8c0f5f8",
  "stm32f1xx_hal.h": "2f542fb0bd264584f558e582bad2a41b461c91cfdba1b057852a5cc1372e179d",
  "stm32f4xx_hal.h": "2f542fb0bd264584f558e582bad2a41b461c91cfdba1b057852a5cc1372e179d"
});
function removeLegacyTestShims(buildDir) {
  for (const [name, expected] of Object.entries(LEGACY_SHIMS)) {
    const file = path.join(buildDir,name);
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) continue;
    const content = fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
    if (crypto.createHash('sha256').update(content).digest('hex') === expected) fs.unlinkSync(file);
  }
}
module.exports = { removeLegacyTestShims };
