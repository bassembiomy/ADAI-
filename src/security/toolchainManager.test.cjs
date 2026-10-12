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
  checkArchiveHash,
  evaluateArchiveHash,
  TOOLCHAIN_LOCK,
} = require('./toolchainManager.cjs');

// Marker file name the manager looks for on this platform.
const marker = (spec) => (process.platform === 'win32' ? spec.checkFile : spec.cmd);

async function runTests() {
  console.log('Running toolchainManager tests...');

  // Test 1: specs expose check files used for install detection
  assert.equal(TOOLCHAINS.Arduino.checkFile, 'avr-g++.exe');
  assert.equal(TOOLCHAINS.STM32.version, '13.3.1-1.1');
  assert.equal(TOOLCHAINS.STM32.cmd, 'arm-none-eabi-gcc');
  assert.equal(FLASH_TOOLS.avrdude.checkFile, 'avrdude.exe');

  // Test 2: install detection against a fake layout
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-mgr-test-'));
  const fakeBin = path.join(tmp, 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, marker(TOOLCHAINS.Arduino)), '');
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
      fs.writeFileSync(path.join(bin, marker(TOOLCHAINS.Arduino)), '');
    },
    skipHashVerify: true,
  });
  assert.ok(result.binPath.endsWith('bin'));

  // Test 5b: lock file is the source of truth; every bundled entry has a real pinned sha256
  for (const [key, spec] of Object.entries(TOOLCHAIN_LOCK.entries)) {
    if (spec.bundle) assert.match(spec.sha256, /^[0-9a-f]{64}$/, `bundle entry ${key} must be pinned`);
    assert.ok(TOOLCHAINS[key] || FLASH_TOOLS[key], `${key} exposed via TOOLCHAINS/FLASH_TOOLS`);
  }
  assert.equal(TOOLCHAIN_LOCK.entries.STM32.sha256, '49cda1bf01215f3df0613972d21f9fec3eb79dca82506365e7da2ff74b921733');
  assert.equal(TOOLCHAIN_LOCK.entries.ESP32.bundle, false);

  // Test 5c: pure hash decision (match / mismatch / unknown / unpinned)
  assert.equal(checkArchiveHash('STM32', TOOLCHAINS.STM32.sha256.toUpperCase()).valid, true);
  const bad = checkArchiveHash('STM32', '0'.repeat(64));
  assert.equal(bad.valid, false);
  assert.equal(bad.code, 'HASH_MISMATCH');
  assert.equal(checkArchiveHash('Nope', 'x').code, 'UNKNOWN_TOOLCHAIN');
  const unpinned = { sha256: null };
  assert.equal(evaluateArchiveHash('X', unpinned, 'abc').code, 'UNPINNED_ARCHIVE');
  assert.equal(evaluateArchiveHash('X', unpinned, 'abc', { allowUnpinned: true }).valid, true);

  // Test 5d: hash mismatch refuses: archive deleted, extractor never called
  let extracted = false;
  const dlDir = path.join(tmp, 'dl-user');
  await assert.rejects(
    downloadAndExtractToolchain('STM32', dlDir, {
      downloadFile: async (url, dest) => { fs.writeFileSync(dest, 'tampered-archive'); },
      extractZip: async () => { extracted = true; },
    }),
    /HASH_MISMATCH/,
  );
  assert.equal(extracted, false);
  assert.equal(fs.existsSync(path.join(dlDir, TOOLCHAINS.STM32.zipName)), false);

  // Test 5e: downloads land only in the dir passed in (the user dir), created on demand
  assert.ok(fs.existsSync(dlDir));
  assert.deepEqual(fs.readdirSync(dlDir), []);

  // Test 5f: resolution order bundled -> user (first dir holding the tool wins)
  const bundled = path.join(tmp, 'bundled');
  const user = path.join(tmp, 'user');
  for (const root of [bundled, user]) {
    const bin = path.join(root, ...TOOLCHAINS.STM32.binPathSegments);
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, marker(TOOLCHAINS.STM32)), '');
  }
  const gcc = resolveToolExecutable('arm-none-eabi-gcc', [bundled, user]);
  assert.ok(gcc.startsWith(bundled), 'bundled dir must win over user dir');
  fs.rmSync(path.join(bundled, 'arm-gcc'), { recursive: true, force: true });
  assert.ok(resolveToolExecutable('arm-none-eabi-gcc', [bundled, user]).startsWith(user), 'falls through to user dir');
  assert.equal(isToolchainLocallyInstalled('STM32', [bundled, user]), true);
  assert.equal(isToolchainLocallyInstalled('STM32', [bundled]), false);
  // PATH ordering: bundled-before-user for configureToolchainPaths
  const bundled2 = path.join(tmp, 'bundled2');
  const bin2 = path.join(bundled2, ...TOOLCHAINS.STM32.binPathSegments);
  fs.mkdirSync(bin2, { recursive: true });
  fs.writeFileSync(path.join(bin2, marker(TOOLCHAINS.STM32)), '');
  const savedPath = process.env.PATH;
  configureToolchainPaths([bundled2, user]);
  const parts = process.env.PATH.split(path.delimiter);
  assert.ok(parts.indexOf(bin2) !== -1 && parts.indexOf(bin2) < parts.indexOf(path.join(user, ...TOOLCHAINS.STM32.binPathSegments)));
  process.env.PATH = savedPath;

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
