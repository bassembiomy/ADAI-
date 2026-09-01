'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  TOOLCHAINS,
  FLASH_TOOLS,
  isToolchainLocallyInstalled,
  configureToolchainPaths,
  resolveToolExecutable,
  defaultToolchainsDir,
  downloadAndExtractToolchain,
} = require('./toolchainManager.cjs');

async function runTests() {
  console.log('Running toolchainManager tests...');

  // Test 1: specs expose check files used for install detection
  assert.equal(TOOLCHAINS.Arduino.checkFile, 'avr-g++.exe');
  assert.equal(TOOLCHAINS.STM32.cmd, 'arm-none-eabi-gcc');
  assert.equal(FLASH_TOOLS.avrdude.checkFile, 'avrdude.exe');

  // Test 2: install detection against a fake layout
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-mgr-test-'));
  const fakeBin = path.join(tmp, 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'avr-g++.exe'), '');
  assert.equal(isToolchainLocallyInstalled('Arduino', tmp), true);
  assert.equal(isToolchainLocallyInstalled('STM32', tmp), false);

  // Test 3: PATH configuration prepends installed bins only
  const prevPath = process.env.PATH;
  configureToolchainPaths(tmp);
  assert.ok(process.env.PATH.startsWith(fakeBin));
  assert.ok(!process.env.PATH.includes('arm-gcc')); // not installed -> untouched
  process.env.PATH = prevPath;

  // Test 4: resolveToolExecutable finds where.exe itself
  if (process.platform === 'win32') {
    assert.ok(resolveToolExecutable('where.exe') !== null);
    assert.equal(resolveToolExecutable('definitely-not-a-real-tool-xyz'), null);
  }

  // Test 5: download+extract with injected fakes writes check file and returns binPath
  const zipPath = path.join(tmp, 'fake.zip');
  fs.writeFileSync(zipPath, 'not-a-real-zip');
  const result = await downloadAndExtractToolchain('Arduino', tmp, {
    downloadFile: async (url, dest) => { fs.copyFileSync(zipPath, dest); },
    extractZip: async (zip, dest) => {
      const bin = path.join(dest, 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin');
      fs.mkdirSync(bin, { recursive: true });
      fs.writeFileSync(path.join(bin, 'avr-g++.exe'), '');
    },
    skipHashVerify: true,
  });
  assert.ok(result.binPath.endsWith('bin'));

  // Test 6: defaultToolchainsDir detects process.resourcesPath when present
  const originalResourcesPath = process.resourcesPath;
  const fakeResources = path.join(tmp, 'fake-resources');
  const fakeBundledToolchains = path.join(fakeResources, 'toolchains');
  fs.mkdirSync(fakeBundledToolchains, { recursive: true });

  process.resourcesPath = fakeResources;
  const detectedBundledDir = defaultToolchainsDir();
  assert.equal(detectedBundledDir, fakeBundledToolchains);

  // Fallback to process.cwd() when resourcesPath does not have toolchains
  process.resourcesPath = path.join(tmp, 'nonexistent-resources');
  assert.equal(defaultToolchainsDir(), path.join(process.cwd(), 'toolchains'));
  process.resourcesPath = originalResourcesPath;

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('toolchainManager tests passed!');
}

runTests().catch(err => { console.error(err); process.exit(1); });
