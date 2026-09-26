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
  resolveInstalledToolchain,
  ensureToolchain,
  provisionToolchain,
  TARGET_ENVIRONMENTS,
  ALLOWED_DOWNLOAD_HOSTS,
} = require('./toolchainManager.cjs');

function writeFakeAvrInstall(bin) {
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'avr-g++.exe'), '');
  const cc1plusDir = path.resolve(bin, '..', 'libexec', 'gcc', 'avr', '15.2.0');
  fs.mkdirSync(cc1plusDir, { recursive: true });
  fs.writeFileSync(path.join(cc1plusDir, 'cc1plus.exe'), '');
}

async function runTests() {
  console.log('Running toolchainManager tests...');

  // Test 1: specs expose check files used for install detection
  assert.equal(TOOLCHAINS.Arduino.checkFile, 'avr-g++.exe');
  assert.equal(TOOLCHAINS.STM32.cmd, 'arm-none-eabi-gcc');
  assert.equal(FLASH_TOOLS.avrdude.checkFile, 'avrdude.exe');
  assert.ok(ALLOWED_DOWNLOAD_HOSTS.includes('armkeil.blob.core.windows.net'));

  // Test 2: install detection against a fake layout
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-mgr-test-'));
  const fakeBin = path.join(tmp, 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin');
  writeFakeAvrInstall(fakeBin);
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
      const bin = path.join(dest, 'avr-gcc-15.2.0-x64-windows', 'bin');
      writeFakeAvrInstall(bin);
    },
    skipHashVerify: true,
  });
  assert.ok(result.binPath.endsWith('bin'));

  // Test 6: legacy repository AVR layout is a valid offline installation
  const legacyRepo = path.join(tmp, 'legacy-repo');
  const legacyBin = path.join(legacyRepo, 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin');
  writeFakeAvrInstall(legacyBin);
  const legacyResolved = resolveInstalledToolchain('Arduino', {
    toolchainsDir: path.join(legacyRepo, 'toolchains'),
    repoRoot: legacyRepo,
    resourcesPath: path.join(legacyRepo, 'missing-resources'),
  });
  assert.equal(legacyResolved?.binPath, legacyBin);

  // An interrupted archive extraction can leave avr-g++.exe without cc1plus.
  // Such a directory is not a usable installation and must not shadow a complete fallback.
  const interruptedCanonical = path.join(legacyRepo, 'toolchains', ...TOOLCHAINS.Arduino.binPathSegments);
  fs.mkdirSync(interruptedCanonical, { recursive: true });
  fs.writeFileSync(path.join(interruptedCanonical, 'avr-g++.exe'), '');
  const completeCc1plus = path.join(legacyRepo, 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'libexec', 'gcc', 'avr', '15.2.0');
  fs.mkdirSync(completeCc1plus, { recursive: true });
  fs.writeFileSync(path.join(completeCc1plus, 'cc1plus.exe'), '');
  const completeFallback = resolveInstalledToolchain('Arduino', {
    toolchainsDir: path.join(legacyRepo, 'toolchains'),
    repoRoot: legacyRepo,
    resourcesPath: null,
  });
  assert.equal(completeFallback?.binPath, legacyBin);

  // Test 7: packaged resources take deterministic precedence
  const packagedResources = path.join(tmp, 'packaged-resources');
  const packagedBin = path.join(packagedResources, 'toolchains', ...TOOLCHAINS.Arduino.binPathSegments);
  writeFakeAvrInstall(packagedBin);
  fs.writeFileSync(path.join(packagedBin, 'avrdude.exe'), '');
  const packagedResolved = resolveInstalledToolchain('Arduino', {
    toolchainsDir: path.join(legacyRepo, 'toolchains'),
    repoRoot: legacyRepo,
    resourcesPath: packagedResources,
  });
  assert.equal(packagedResolved?.binPath, packagedBin);
  const packagedAvrdude = resolveInstalledToolchain('avrdude', {
    toolchainsDir: path.join(legacyRepo, 'toolchains'),
    repoRoot: path.join(tmp, 'no-legacy-tools'),
    resourcesPath: packagedResources,
  });
  assert.equal(packagedAvrdude?.binPath, packagedBin);

  // Test 8: runtime ensure is offline and explains how to provision
  const emptyRoot = path.join(tmp, 'empty-root');
  fs.mkdirSync(emptyRoot, { recursive: true });
  await assert.rejects(
    ensureToolchain('STM32', path.join(emptyRoot, 'toolchains'), {
      repoRoot: emptyRoot,
      resourcesPath: path.join(emptyRoot, 'resources'),
    }),
    error => error.code === 'OFFLINE_TOOLCHAIN_MISSING'
      && /npm run provision:hil/.test(error.message)
      && /arm-none-eabi-gcc\.exe/.test(error.message),
  );

  // Test 9: provisioning is explicit, coalesced, and uses disposable paths
  const provisionRoot = path.join(tmp, 'provision-root');
  fs.mkdirSync(provisionRoot, { recursive: true });
  let downloadCount = 0;
  const downloadDestinations = [];
  const deps = {
    downloadFile: async (_url, dest) => {
      downloadCount += 1;
      downloadDestinations.push(dest);
      fs.writeFileSync(dest, 'fake-archive');
      await new Promise(resolve => setTimeout(resolve, 10));
    },
    extractZip: async (_zip, dest) => {
      const bin = path.join(dest, 'avr-gcc-15.2.0-x64-windows', 'bin');
      writeFakeAvrInstall(bin);
    },
    skipHashVerify: true,
  };
  const [firstProvision, secondProvision] = await Promise.all([
    provisionToolchain('Arduino', provisionRoot, deps),
    provisionToolchain('Arduino', provisionRoot, deps),
  ]);
  assert.equal(downloadCount, 1);
  assert.equal(firstProvision.executable, secondProvision.executable);
  assert.match(downloadDestinations[0], /\.part-[0-9a-f-]+$/i);
  assert.equal(fs.readdirSync(provisionRoot).some(name => name.includes('.part-') || name.includes('.staging-')), false);

  // Failed extraction leaves no archive, staging directory, lock, or visible final install.
  const failedRoot = path.join(tmp, 'failed-provision');
  await assert.rejects(provisionToolchain('Arduino', failedRoot, {
    downloadFile: async (_url, dest) => fs.writeFileSync(dest, 'fake-archive'),
    extractZip: async () => { throw new Error('injected extraction failure'); },
    skipHashVerify: true,
  }), /injected extraction failure/);
  assert.equal(fs.existsSync(path.join(failedRoot, 'avr-gcc')), false);
  assert.equal(fs.readdirSync(failedRoot).some(name => /\.part-|\.staging-|\.lock$/.test(name)), false);

  // The final path is invisible until a complete staged toolchain has been validated.
  const atomicRoot = path.join(tmp, 'atomic-provision');
  let visibleDuringExtraction = true;
  await provisionToolchain('Arduino', atomicRoot, {
    downloadFile: async (_url, dest) => fs.writeFileSync(dest, 'fake-archive'),
    extractZip: async (_zip, dest) => {
      visibleDuringExtraction = fs.existsSync(path.join(atomicRoot, 'avr-gcc'));
      writeFakeAvrInstall(path.join(dest, 'avr-gcc-15.2.0-x64-windows', 'bin'));
    },
    skipHashVerify: true,
  });
  assert.equal(visibleDuringExtraction, false);
  assert.equal(isToolchainLocallyInstalled('Arduino', atomicRoot), true);

  // A second process holding the lock wins; this process waits and reuses its complete result.
  const lockedRoot = path.join(tmp, 'locked-provision');
  fs.mkdirSync(lockedRoot, { recursive: true });
  const externalLock = path.join(lockedRoot, '.provision-Arduino.lock');
  fs.writeFileSync(externalLock, '{"pid":99999}');
  let lockedDownloadCount = 0;
  setTimeout(() => {
    writeFakeAvrInstall(path.join(lockedRoot, ...TOOLCHAINS.Arduino.binPathSegments));
    fs.rmSync(externalLock, { force: true });
  }, 25);
  const lockedResult = await provisionToolchain('Arduino', lockedRoot, {
    downloadFile: async () => { lockedDownloadCount += 1; },
    skipHashVerify: true,
    lockPollMs: 5,
  });
  assert.ok(lockedResult.executable);
  assert.equal(lockedDownloadCount, 0);

  // Distinct tools sharing the flashers parent can provision concurrently without collisions.
  const overlappingRoot = path.join(tmp, 'overlapping-provision');
  await Promise.all([
    provisionToolchain('openocd', overlappingRoot, {
      downloadFile: async (_url, dest) => fs.writeFileSync(dest, 'openocd'),
      extractZip: async (_zip, dest) => {
        const bin = path.join(dest, 'xpack-openocd-0.12.0-3', 'bin');
        fs.mkdirSync(bin, { recursive: true });
        fs.writeFileSync(path.join(bin, 'openocd.exe'), '');
      },
      skipHashVerify: true,
    }),
    provisionToolchain('esptool', overlappingRoot, {
      downloadFile: async (_url, dest) => fs.writeFileSync(dest, 'esptool'),
      extractZip: async (_zip, dest) => {
        const bin = path.join(dest, 'esptool-win64');
        fs.mkdirSync(bin, { recursive: true });
        fs.writeFileSync(path.join(bin, 'esptool.exe'), '');
      },
      skipHashVerify: true,
    }),
  ]);
  assert.ok(resolveInstalledToolchain('openocd', { toolchainsDir: overlappingRoot }).executable);
  assert.ok(resolveInstalledToolchain('esptool', { toolchainsDir: overlappingRoot }).executable);
  assert.equal(fs.readdirSync(overlappingRoot).some(name => /\.part-|\.staging-|\.lock$/.test(name)), false);

  // Test 10: every supported concrete MCU has compiler and flasher coverage
  assert.deepEqual(Object.keys(TARGET_ENVIRONMENTS).sort(), [
    'Arduino_Mega', 'Arduino_Uno', 'ESP32', 'STM32F1', 'STM32F4',
  ]);
  for (const environment of Object.values(TARGET_ENVIRONMENTS)) {
    assert.ok(TOOLCHAINS[environment.compiler]);
    assert.ok(FLASH_TOOLS[environment.flasher]);
  }

  // Test 11: defaultToolchainsDir detects process.resourcesPath when present
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
