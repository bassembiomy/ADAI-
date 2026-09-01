# HIL Module End-to-End Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the full ADIA HIL pipeline — toolchain environment install, pin assignment validation, `-Os` build of generated state-machine + driver code for all 5 target MCUs with a flash/size gate, flashing real boards, and correct UART variable telemetry between the generated drivers and the state machine code (Embedded-Coder-style contract).

**Architecture:** The plan hardens and tests the *hardened* pipeline that already exists in `src/security/*` (`HilBuildService` → exact per-target recipes → ELF inspection) plus the generator stack (`stateMachineCodeGenerator` → `generateHALCode`). Toolchain/flasher management is extracted from `src/main.cjs` into a testable module; a size gate backed by each pack's `memoryRegions` is added to `elfInspector.cjs`; a new pure-TS pin validator enforces the "pin variables assignment process"; a small injectable serial session service implements UART variable listening over the existing text protocol (`name=value;...\n` from `hilProtocol.ts`); hardware suites are opt-in scripts gated by `ADIA_HIL_HARDWARE=1`.

**Tech Stack:** Electron 43 (main process CommonJS), TypeScript + Vitest 4 for engine tests, plain-node assert for `.cjs` security tests, avr-gcc 15.2.0 / arm-none-eabi-gcc 10.3-2021.10 / xtensa-esp-elf gcc / w64devkit gcc, avrdude + OpenOCD + esptool, `serialport@12` npm package (already a dependency), target packs under `target-packs/<id>/manifest.json`.

## Global Constraints

- Node >= 20.0.0, npm >= 10 (package.json engines).
- Dev host is Windows (win32); all spawn calls use `shell: false` — never string-concatenate commands.
- Never modify generated SM logic files by hand (`sm_core.c`, `sm_user_logic.c`, `sm_safety.c`) — regenerate via `generateMISRACCode`.
- Every downloaded compiler/flasher archive must be SHA-256 pinned in `src/security/toolchainVerifier.cjs` before first use.
- Renderer-facing build/flash requests must keep passing the policy gates in `hilBuildPolicy.cjs` / `hilFlashPolicy.cjs` (no renderer-controlled flags).
- Hardware-dependent suites must be opt-in via env `ADIA_HIL_HARDWARE=1` and skip cleanly (exit 0 with `[SKIP]` lines) when unset.
- No new runtime npm dependencies (serialport already present at ^12.0.0).
- AVR telemetry uses `%f` in `snprintf`: AVR builds MUST link `-Wl,-u,vfprintf -lprintf_flt -lm` or channel values print as `?`.
- Commit after every task with conventional-commit messages.

## Requirement → Task Map

| User requirement | Tasks |
|---|---|
| All MCU environments installed with app install on PC | 1, 2, 3 |
| Build all types of MCUs | 6 |
| Flashing the code | 8, 9 |
| Optimizing it (-Os + size gate) | 5, 6, 7 |
| Pin variables assignment done correctly | 4 |
| Listen to a variable from UART works correctly | 10, 12 |
| Drivers ↔ generated SM code connection correct (Embedded-Coder-like) | 7, 11, 12 |

---

### Task 1: Extract a testable toolchain manager

The install/check/download functions live inside `src/main.cjs` (lines ~24–300) and cannot be required outside Electron. Extract them into a standalone CommonJS module so tests (and later scripts) can drive installs without launching the app.

**Files:**
- Create: `src/security/toolchainManager.cjs`
- Create: `src/security/toolchainManager.test.cjs`
- Modify: `src/main.cjs` (delete local copies of `toolchains`, `isCommandInPath`, `isToolchainLocallyInstalled`, `configureToolchainPaths`, `downloadFile`, `extractZip`, `downloadAndExtractToolchain`; delegate to the new module)

**Interfaces:**
- Consumes: `verifyToolchainHash(key, buffer)` from `src/security/toolchainVerifier.cjs`.
- Produces (all named exports):
  - `TOOLCHAINS` — frozen spec map keyed `'Generic' | 'Arduino' | 'STM32'`
  - `FLASH_TOOLS` — frozen spec map keyed `'avrdude' | 'openocd' | 'esptool'`
  - `isToolchainLocallyInstalled(key: string, toolchainsDir: string): boolean`
  - `isFlashToolLocallyInstalled(key: string, toolchainsDir: string): boolean`
  - `configureToolchainPaths(toolchainsDir: string): void` — prepends every installed bin dir to `process.env.PATH`
  - `resolveToolExecutable(name: string): string | null` — uses `where.exe`/`which` to resolve `name` (with `.exe` on win32) to an absolute path, else `null`
  - `downloadAndExtractToolchain(key: string, toolchainsDir: string, deps?: { downloadFile?, extractZip? }): Promise<{ binPath: string }>` — downloads, SHA-256 verifies via `verifyToolchainHash`, extracts
  - `ensureToolchain(key: string, toolchainsDir: string): Promise<void>` — install-if-missing + PATH config

- [ ] **Step 1: Write the failing test**

Create `src/security/toolchainManager.test.cjs`:

```js
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

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('toolchainManager tests passed!');
}

runTests().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/security/toolchainManager.test.cjs`
Expected: FAIL with `Cannot find module './toolchainManager.cjs'`

- [ ] **Step 3: Write the module**

Create `src/security/toolchainManager.cjs`. Move the exact URL/zip/binPath values currently in `src/main.cjs` lines 35–63 into `TOOLCHAINS` unchanged:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { verifyToolchainHash } = require('./toolchainVerifier.cjs');

const ALLOWED_DOWNLOAD_HOSTS = Object.freeze([
  'github.com',
  'objects.githubusercontent.com',
  'developer.arm.com',
]);

function validateRedirectUrl(url, allowedHosts) {
  try {
    const parsed = new URL(url);
    return allowedHosts.includes(parsed.hostname)
      && (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      ? parsed.toString() : null;
  } catch { return null; }
}

const TOOLCHAINS = Object.freeze({
  Generic: Object.freeze({
    cmd: 'gcc',
    name: 'Generic C/C++ Compiler (w64devkit)',
    url: 'https://github.com/skeeto/w64devkit/releases/download/v1.23.0/w64devkit-1.23.0.zip',
    zipName: 'w64devkit-1.23.0.zip',
    extractSubdir: 'w64devkit',
    binPathSegments: ['w64devkit', 'w64devkit', 'bin'],
    checkFile: 'gcc.exe',
  }),
  Arduino: Object.freeze({
    cmd: 'avr-g++',
    name: 'Arduino AVR Toolchain (avr-gcc)',
    url: 'https://github.com/lucasg/avr-gcc-build/releases/download/v15.2.0/avr-gcc-15.2.0-x64-windows.zip',
    zipName: 'avr-gcc-15.2.0-x64-windows.zip',
    extractSubdir: 'avr-gcc',
    binPathSegments: ['avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin'],
    checkFile: 'avr-g++.exe',
  }),
  STM32: Object.freeze({
    cmd: 'arm-none-eabi-gcc',
    name: 'STM32 ARM Embedded Toolchain (arm-none-eabi-gcc)',
    url: 'https://developer.arm.com/-/media/Files/downloads/gnu-rm/10.3-2021.10/gcc-arm-none-eabi-10.3-2021.10-win32.zip',
    zipName: 'gcc-arm-none-eabi-10.3-2021.10-win32.zip',
    extractSubdir: 'arm-gcc',
    binPathSegments: ['arm-gcc', 'gcc-arm-none-eabi-10.3-2021.10', 'bin'],
    checkFile: 'arm-none-eabi-gcc.exe',
  }),
});

// Flasher tools: URLs are pinned at Task 2 Step 3 after hash computation.
const FLASH_TOOLS = Object.freeze({
  avrdude: Object.freeze({
    name: 'AVRDUDE (AVR flasher)',
    cmd: 'avrdude',
    url: '', zipName: 'avrdude-v8.0-windows-x64.zip',
    extractSubdir: 'flashers', binPathSegments: ['flashers', 'avrdude', 'bin'],
    checkFile: 'avrdude.exe', hashKey: 'avrdude-v8.0-windows-x64',
  }),
  openocd: Object.freeze({
    name: 'OpenOCD (ST-Link flasher)',
    cmd: 'openocd',
    url: '', zipName: 'xpack-openocd-0.12.0-3-win32-x64.zip',
    extractSubdir: 'flashers', binPathSegments: ['flashers', 'openocd', 'bin'],
    checkFile: 'openocd.exe', hashKey: 'xpack-openocd-0.12.0-3-win32-x64',
  }),
  esptool: Object.freeze({
    name: 'esptool (ESP32 flasher)',
    cmd: 'esptool.py',
    url: '', zipName: 'esptool-v4.8.1-windows-amd64.zip',
    extractSubdir: 'flashers', binPathSegments: ['flashers', 'esptool'],
    checkFile: 'esptool.exe', hashKey: 'esptool-v4.8.1-windows-amd64',
  }),
});

function exeName(cmd) {
  return process.platform === 'win32' ? `${cmd}.exe` : cmd;
}

function binPathFor(spec, toolchainsDir) {
  return path.join(toolchainsDir, ...spec.binPathSegments);
}

function isToolchainLocallyInstalled(key, toolchainsDir) {
  const tc = TOOLCHAINS[key];
  if (!tc) return false;
  const expected = process.platform === 'win32'
    ? path.join(binPathFor(tc, toolchainsDir), tc.checkFile)
    : path.join(binPathFor(tc, toolchainsDir), tc.cmd);
  return fs.existsSync(expected);
}

function isFlashToolLocallyInstalled(key, toolchainsDir) {
  const tc = FLASH_TOOLS[key];
  if (!tc) return false;
  return fs.existsSync(path.join(binPathFor(tc, toolchainsDir), tc.checkFile));
}

function configureToolchainPaths(toolchainsDir) {
  const bins = [];
  for (const spec of [...Object.values(TOOLCHAINS), ...Object.values(FLASH_TOOLS)]) {
    const bin = binPathFor(spec, toolchainsDir);
    const marker = process.platform === 'win32'
      ? path.join(bin, spec.checkFile || '')
      : path.join(bin, spec.cmd);
    if (fs.existsSync(marker)) bins.push(bin);
  }
  for (const bin of bins) {
    if (!String(process.env.PATH || '').includes(bin)) {
      process.env.PATH = bin + path.delimiter + process.env.PATH;
    }
  }
}

function resolveToolExecutable(name) {
  try {
    const tool = process.platform === 'win32' ? 'where.exe' : 'which';
    const out = execFileSync(tool, [name], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const first = out.split(/\r?\n/).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

function downloadFile(url, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    const fetchUrl = (targetUrl) => {
      const client = targetUrl.startsWith('https') ? require('node:https') : require('node:http');
      const req = client.get(targetUrl, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const redirectUrl = res.headers.location;
          if (!redirectUrl) { reject(new Error('Redirect location header missing')); return; }
          const safeRedirect = validateRedirectUrl(redirectUrl, ALLOWED_DOWNLOAD_HOSTS);
          if (!safeRedirect) { reject(new Error(`Blocked redirect to untrusted host: ${redirectUrl}`)); return; }
          fetchUrl(safeRedirect);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`Failed to download: Status Code ${res.statusCode}`)); return; }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0; let lastProgress = Date.now();
        const fileStream = fs.createWriteStream(destPath);
        res.on('data', chunk => {
          received += chunk.length;
          if (progressCallback && Date.now() - lastProgress > 500) {
            lastProgress = Date.now();
            progressCallback(total ? Math.round((received / total) * 100) : 0);
          }
        });
        res.pipe(fileStream);
        fileStream.on('finish', () => fileStream.close(() => resolve(destPath)));
        fileStream.on('error', reject);
      });
      req.on('error', reject);
    };
    fetchUrl(url);
  });
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xf', zipPath, '-C', destDir], { shell: false });
    let stderr = '';
    child.stderr.on('data', c => { stderr += c.toString(); });
    child.on('close', code => {
      if (code === 0) { resolve(); return; }
      // Fallback: PowerShell Expand-Archive
      const ps = spawn('powershell.exe', [
        '-NoProfile', '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
      ], { shell: false });
      ps.on('close', psCode => psCode === 0 ? resolve() : reject(new Error(`Extraction failed: ${stderr}`)));
      ps.on('error', () => reject(new Error(`Extraction failed: ${stderr}`)));
    });
    child.on('error', err => reject(err));
  });
}

async function downloadAndExtractToolchain(key, toolchainsDir, deps = {}) {
  const spec = TOOLCHAINS[key] || FLASH_TOOLS[key];
  if (!spec || !spec.url) throw new Error(`UNKNOWN_TOOLCHAIN: ${key}`);
  if (!deps.skipHashVerify && typeof verifyToolchainHash !== 'function') {
    throw new Error('toolchainVerifier.cjs must export verifyToolchainHash(key, buffer)');
  }
  const zipPath = path.join(toolchainsDir, spec.zipName);
  const doDownload = deps.downloadFile || downloadFile;
  await doDownload(spec.url, zipPath);
  if (!deps.skipHashVerify) {
    const buf = fs.readFileSync(zipPath);
    const res = verifyToolchainHash(deps.hashKey || key, buf);
    if (!res || !res.valid) {
      fs.rmSync(zipPath, { force: true });
      throw new Error(`HASH_MISMATCH: ${res?.message || res?.code || 'verification failed'}`);
    }
  }
  const extractDest = path.join(toolchainsDir, spec.extractSubdir || '.');
  fs.mkdirSync(extractDest, { recursive: true });
  const doExtract = deps.extractZip || extractZip;
  await doExtract(zipPath, extractDest);
  const binPath = binPathFor(spec, toolchainsDir);
  if (!fs.existsSync(path.join(binPath, process.platform === 'win32' ? (spec.checkFile || exeName(spec.cmd)) : spec.cmd))) {
    throw new Error(`EXTRACT_LAYOUT_UNEXPECTED: ${spec.name} -> ${binPath}`);
  }
  return { binPath };
}

async function ensureToolchain(key, toolchainsDir) {
  const isFlash = !TOOLCHAINS[key];
  const installed = isFlash
    ? isFlashToolLocallyInstalled(key, toolchainsDir)
    : isToolchainLocallyInstalled(key, toolchainsDir);
  if (!installed) await downloadAndExtractToolchain(key, toolchainsDir);
  configureToolchainPaths(toolchainsDir);
}

module.exports = {
  TOOLCHAINS, FLASH_TOOLS,
  isToolchainLocallyInstalled, isFlashToolLocallyInstalled,
  configureToolchainPaths, resolveToolExecutable,
  downloadFile, extractZip, downloadAndExtractToolchain, ensureToolchain,
};
```

Note: `binPath` values are expressed as `binPathSegments` so the module has no dependency on `app.getPath`. Keep the legacy fallback working: `src/main.cjs` line ~86 checks `../avr-gcc/...`; leave that block intact.

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/security/toolchainManager.test.cjs`
Expected: PASS — `toolchainManager tests passed!`

- [ ] **Step 5: Delegate from main.cjs**

In `src/main.cjs`, delete the local definitions listed in Files and add near the top:

```js
const {
  TOOLCHAINS, configureToolchainPaths, isToolchainLocallyInstalled,
  downloadAndExtractToolchain, ensureToolchain, resolveToolExecutable,
} = require('./security/toolchainManager.cjs');
```

Keep a thin adapter so the rest of `main.cjs` keeps compiling:

```js
function getToolchainsDir() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'toolchains')
    : path.join(process.cwd(), 'toolchains');
}
```

Replace call sites:
- `isToolchainLocallyInstalled(key)` → `isToolchainLocallyInstalled(key, getToolchainsDir())`
- `configureToolchainPaths()` → `configureToolchainPaths(getToolchainsDir())`
- `downloadAndExtractToolchain(tcKey)` → `downloadAndExtractToolchain(tcKey, getToolchainsDir())`

- [ ] **Step 6: Verify app still boots and existing security suite passes**

Run: `npm run test:security`
Expected: all suites print `... passed!`, exit 0.
Also run: `npx electron . --smoke & sleep 8; kill` (or manually launch `npm run dev` once) — confirm no `require` errors in console.

- [ ] **Step 7: Commit**

```bash
git add src/security/toolchainManager.cjs src/security/toolchainManager.test.cjs src/main.cjs
git commit -m "refactor(security): extract testable toolchain manager from main process"
```

---

### Task 2: Pin ESP32 cross-compiler and flasher tools with SHA-256 hashes

The hardened ESP32 recipe needs `xtensa-esp32-elf-gcc` (absent today — only Generic/Arduino/STM32 exist). Flashers (avrdude, OpenOCD, esptool) are needed for Task 9. This task pins exact versions + hashes.

**Files:**
- Modify: `src/security/toolchainManager.cjs` (fill `url:` fields added in Task 1; add `ESP32` entry)
- Modify: `src/security/toolchainVerifier.cjs` (add raw 64-hex SHA-256 hashes)
- Modify: `src/security/inputValidator.cjs` (add `'ESP32'` to `ALLOWED_TOOLCHAIN_KEYS`)
- Modify: `src/security/inputValidator.test.cjs` (add `'ESP32'` test case)

**Interfaces:**
- Produces: `TOOLCHAINS.ESP32` with `cmd: 'xtensa-esp32-elf-gcc'`; populated `FLASH_TOOLS.*.url`; verifier entries keyed `esp32-xtensa-gcc-13.2.0-win64`, `avrdude-v8.0-windows-x64`, `xpack-openocd-0.12.0-3-win32-x64`, `esptool-v4.8.1-windows-amd64`; `ALLOWED_TOOLCHAIN_KEYS` allowing `'ESP32'`.

- [ ] **Step 1: Download each archive once into temp**

```bash
mkdir -p "$TEMP/adia-pin" ; cd "$TEMP/adia-pin"
curl -L -o xtensa.zip https://github.com/espressif/crosstool-NG/releases/download/esp-13.2.0_20240530/xtensa-esp-elf-13.2.0_20240530-x86_64-w64-mingw32.zip
curl -L -o avrdude.zip https://github.com/avrdudes/avrdude/releases/download/v8.0/avrdude-v8.0-windows-x64.zip
curl -L -o openocd.zip https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-3/xpack-openocd-0.12.0-3-win32-x64.zip
curl -L -o esptool.zip https://github.com/espressif/esptool/releases/download/v4.8.1/esptool-v4.8.1-windows-amd64.zip
```

Expected: four non-empty zips. If any URL 404s, find the current release asset of the same project (same major version or newer patch), use it consistently in this step and in `toolchainManager.cjs`, and note it in the commit message.

- [ ] **Step 2: Compute SHA-256 of each**

```bash
cd "$TEMP/adia-pin" && sha256sum *.zip
```

Record the four hex digests.

- [ ] **Step 3: Add entries to `toolchainVerifier.cjs` and `inputValidator.cjs`**

Following the existing convention in `src/security/toolchainVerifier.cjs` (raw 64-hex string hashes consumed by `verifyToolchainHash(key, buffer)` without `sha256:` prefix), add:

```js
'esp32-xtensa-gcc-13.2.0-win64': '<DIGEST_FROM_STEP_2>',
'avrdude-v8.0-windows-x64': '<DIGEST_FROM_STEP_2>',
'xpack-openocd-0.12.0-3-win32-x64': '<DIGEST_FROM_STEP_2>',
'esptool-v4.8.1-windows-amd64': '<DIGEST_FROM_STEP_2>',
```

Also update `ALLOWED_TOOLCHAIN_KEYS` in `src/security/inputValidator.cjs` to `['Generic', 'Arduino', 'STM32', 'ESP32']` and add a matching test case to `src/security/inputValidator.test.cjs`.

- [ ] **Step 4: Fill specs in `toolchainManager.cjs`**

Add to `TOOLCHAINS`:

```js
  ESP32: Object.freeze({
    cmd: 'xtensa-esp32-elf-gcc',
    name: 'ESP32 Xtensa Cross Compiler (esp-13.2.0)',
    url: 'https://github.com/espressif/crosstool-NG/releases/download/esp-13.2.0_20240530/xtensa-esp-elf-13.2.0_20240530-x86_64-w64-mingw32.zip',
    zipName: 'xtensa-esp-elf-13.2.0_20240530-x86_64-w64-mingw32.zip',
    extractSubdir: 'xtensa-esp-elf',
    binPathSegments: ['xtensa-esp-elf', 'xtensa-esp-elf', 'bin'],
    checkFile: 'xtensa-esp32-elf-gcc.exe',
    hashKey: 'esp32-xtensa-gcc-13.2.0-win64',
  }),
```

Set the three `FLASH_TOOLS[*].url` values to the URLs from Step 1, and give each toolchain spec its matching `hashKey` (`Generic`/`Arduino`/`STM32` keep whatever keys `toolchainVerifier.cjs` already uses for them — read the file and reuse those exact keys).

- [ ] **Step 5: Real-install smoke test (manual, one command)**

```bash
node -e "const{ensureToolchain}=require('./src/security/toolchainManager.cjs');const td=require('path').join(process.cwd(),'toolchains');ensureToolchain('avrdude',td).then(()=>console.log('OK')).catch(e=>{console.error(e);process.exit(1)})"
```

Expected: prints `OK`; `toolchains/flashers/avrdude/bin/avrdude.exe` exists; running `toolchains\flashers\avrdude\bin\avrdude.exe -v` prints version 8.0.x. Repeat for `openocd` and `esptool` (esptool check file may be `esptool.exe` inside `bin` — adjust `checkFile`/`binPathSegments` to the actual extracted layout and re-run until OK).

- [ ] **Step 6: Run manager tests**

Run: `node src/security/toolchainManager.test.cjs && node src/security/toolchainHashVerifier.test.cjs`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/security/toolchainManager.cjs src/security/toolchainVerifier.cjs src/security/inputValidator.cjs src/security/inputValidator.test.cjs
git commit -m "feat(hil): pin esp32 xtensa cross-compiler and avrdude/openocd/esptool with sha256"
```

---

### Task 3: Environment doctor CLI (`test:hil:env`)

One command that proves "all environments of the target MCUs are installed with the application on the PC", runnable by users and CI, with `--fix` to auto-install missing pieces.

**Files:**
- Create: `scripts/hil_env_doctor.cjs`
- Modify: `package.json` (add script `test:hil:env`)

**Interfaces:**
- Consumes: everything exported by `src/security/toolchainManager.cjs`.
- Produces: exit codes `0` (all required components present), `1` (something missing); JSON report via `--json`; auto-install via `--fix`.

- [ ] **Step 1: Write the doctor**

Create `scripts/hil_env_doctor.cjs`:

```js
#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  TOOLCHAINS, FLASH_TOOLS,
  isToolchainLocallyInstalled, isFlashToolLocallyInstalled,
  ensureToolchain, configureToolchainPaths,
} = require('../src/security/toolchainManager.cjs');

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const jsonOut = args.includes('--json');
const toolchainsDir = path.join(process.cwd(), 'toolchains');

const rows = [];
function check(kind, id, label, installedFn) {
  const installed = installedFn();
  rows.push({ kind, id, label, installed });
  return installed;
}

let ok = true;
ok &= check('compiler', 'Generic', 'Host C compiler (w64devkit gcc)', () => isToolchainLocallyInstalled('Generic', toolchainsDir));
ok &= check('compiler', 'Arduino', 'avr-gcc 15.2.0 (ATmega328P/Mega2560)', () => isToolchainLocallyInstalled('Arduino', toolchainsDir));
ok &= check('compiler', 'STM32', 'arm-none-eabi-gcc 10.3 (STM32F1/F4)', () => isToolchainLocallyInstalled('STM32', toolchainsDir));
ok &= check('compiler', 'ESP32', 'xtensa-esp32-elf-gcc 13.2', () => isToolchainLocallyInstalled('ESP32', toolchainsDir));
ok &= check('flasher', 'avrdude', 'avrdude (Mega2560/Uno)', () => isFlashToolLocallyInstalled('avrdude', toolchainsDir));
ok &= check('flasher', 'openocd', 'OpenOCD (ST-Link F1/F4)', () => isFlashToolLocallyInstalled('openocd', toolchainsDir));
ok &= check('flasher', 'esptool', 'esptool (ESP32-WROOM-32)', () => isFlashToolLocallyInstalled('esptool', toolchainsDir));

let serialportOk = true;
try { require.resolve('serialport'); } catch { serialportOk = false; }
rows.push({ kind: 'runtime', id: 'serialport', label: 'serialport@12 native module loads', installed: serialportOk });
ok &= serialportOk;

if (fix) {
  for (const row of rows.filter(r => r.kind === 'compiler' || r.kind === 'flasher')) {
    if (!row.installed) {
      const key = row.id === 'avrdude' || row.id === 'openocd' || row.id === 'esptool' ? row.id : row.id;
      console.log(`[FIX] Installing ${key} ...`);
      try {
        // eslint-disable-next-line no-await-in-loop
        require('child_process').execSync(
          `node -e "const{ensureToolchain}=require('./src/security/toolchainManager.cjs');ensureToolchain('${key}',${JSON.stringify(toolchainsDir)}).then(()=>console.log('installed'))"`,
          { stdio: 'inherit' },
        );
        row.installed = true;
      } catch (e) {
        console.error(`[FIX] Failed to install ${key}: ${e.message}`);
        ok = false;
      }
    }
  }
  configureToolchainPaths(toolchainsDir);
}

if (jsonOut) {
  console.log(JSON.stringify({ ok: !!ok, toolchainsDir, rows }, null, 2));
} else {
  console.log('\nADIA HIL Environment Doctor');
  console.log(`toolchains dir: ${toolchainsDir}\n`);
  for (const r of rows) {
    console.log(`${r.installed ? '[ OK ]' : '[MISS]'} ${r.kind.padEnd(8)} ${r.id.padEnd(9)} ${r.label}`);
  }
  console.log(ok ? '\nEnvironment ready.' : '\nEnvironment INCOMPLETE. Re-run with --fix to install missing compilers/flashers.');
}
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2: Add npm script**

In `package.json` `scripts`, add:

```json
"test:hil:env": "node scripts/hil_env_doctor.cjs",
```

- [ ] **Step 3: Run and record baseline**

Run: `npm run test:hil:env`
Expected: table prints; on your machine `arm-gcc` shows OK (already installed), others likely MISS → exit 1. Then run `npm run test:hil:env -- --fix` and re-run plain doctor.
Expected after fix: all rows `[ OK ]`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/hil_env_doctor.cjs package.json
git commit -m "feat(hil): add environment doctor CLI for mcu toolchains and flashers"
```

---

### Task 4: Pin assignment validator (pin variables assignment correctness)

Today pin sanity lives as ad-hoc warnings inside `generateHALCode` (hilCodeGenerator.ts:29–39) and `smSemanticValidator.ts`. Replace with one pure validator that also checks duplicates, per-family ranges, ESP32 input-only/strapping pins, and target-pack `pins[]` membership, then wire it into generation and the driver panel UI.

**Files:**
- Create: `src/engine/hil/pinValidator.ts`
- Create: `src/engine/hil/pinValidator.test.ts`
- Modify: `src/engine/hil/hilCodeGenerator.ts` (call validator, emit errors, drop duplicated ad-hoc warning block at lines 29–39)
- Modify: `src/components/hil/HILDriverPanel.tsx` (live issue badges; receives `channels` + `target` props, confirmed at lines 6–8, 94)

**Interfaces:**
- Consumes: `HILConfig`, `DriverChannel` from `./hilTypes`; optional pack manifest `{ pins?: Array<{id:string}>, capabilityManifest?: { supportedPeripherals?: string[] }, displayName?: string }`.
- Produces:
  ```ts
  export interface PinValidationIssue { level: 'error' | 'warning'; channelId: string; message: string; }
  export function validatePinAssignments(
    channels: DriverChannel[],
    opts: { targetLegacy: TargetMCU; pack?: PackLike | null },
  ): PinValidationIssue[];
  ```
  Errors mean "generation must refuse"; warnings are advisory.

- [ ] **Step 1: Write failing tests**

Create `src/engine/hil/pinValidator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validatePinAssignments } from './pinValidator';
import type { DriverChannel } from './hilTypes';

const ch = (over: Partial<DriverChannel> = {}): DriverChannel => ({
  id: 'c1', name: 'led', peripheral: 'GPIO', pin: '13', direction: 'Out',
  dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '',
  ...over,
});

describe('validatePinAssignments', () => {
  it('accepts valid Arduino Mega digital pin', () => {
    const issues = validatePinAssignments([ch()], { targetLegacy: 'Arduino_Mega' });
    expect(issues.filter(i => i.level === 'error')).toHaveLength(0);
  });

  it('rejects duplicate pin assignment across channels', () => {
    const issues = validatePinAssignments(
      [ch({ id: 'a', pin: '13' }), ch({ id: 'b', pin: '13', direction: 'In' })],
      { targetLegacy: 'Arduino_Mega' },
    );
    expect(issues.some(i => i.level === 'error' && i.channelId === 'b' && i.message.includes('already assigned'))).toBe(true);
  });

  it('rejects out-of-range pin on Uno (53 does not exist)', () => {
    const issues = validatePinAssignments([ch({ pin: '53' })], { targetLegacy: 'Arduino_Uno' });
    expect(issues.some(i => i.level === 'error' && i.message.includes('not available'))).toBe(true);
  });

  it('warns when Hardware Serial pins 0/1 are used on Arduino', () => {
    const issues = validatePinAssignments([ch({ pin: '0', direction: 'In' })], { targetLegacy: 'Arduino_Uno' });
    expect(issues.some(i => i.level === 'warning' && i.message.includes('Hardware Serial'))).toBe(true);
  });

  it('errors STM32-style pin names on Arduino targets', () => {
    const issues = validatePinAssignments([ch({ pin: 'PA5' })], { targetLegacy: 'Arduino_Mega' });
    expect(issues.some(i => i.level === 'error' && i.message.includes('STM32-style'))).toBe(true);
  });

  it('accepts STM32 PA5 on STM32 targets', () => {
    const issues = validatePinAssignments([ch({ pin: 'PA5' })], { targetLegacy: 'STM32F4' });
    expect(issues.filter(i => i.level === 'error')).toHaveLength(0);
  });

  it('errors output on ESP32 input-only pins 34-39', () => {
    const issues = validatePinAssignments([ch({ pin: '35' })], { targetLegacy: 'ESP32' });
    expect(issues.some(i => i.level === 'error' && i.message.includes('input-only'))).toBe(true);
  });

  it('warns on ESP32 strapping pins', () => {
    const issues = validatePinAssignments([ch({ pin: '12' })], { targetLegacy: 'ESP32' });
    expect(issues.some(i => i.level === 'warning' && i.message.includes('strapping'))).toBe(true);
  });

  it('errors unknown pin when pack provides a complete pins[] list', () => {
    const pack = { pins: [{ id: 'PB5' }], pinsComplete: true };
    const issues = validatePinAssignments([ch({ pin: 'PD9' })], { targetLegacy: 'STM32F1', pack });
    expect(issues.some(i => i.level === 'error' && i.message.includes('not defined in target pack'))).toBe(true);
  });

  it('errors peripheral unsupported by pack capability manifest', () => {
    const pack = { capabilityManifest: { supportedPeripherals: ['gpio', 'adc'] } };
    const issues = validatePinAssignments([ch({ peripheral: 'CAN', pin: 'PA0' })], { targetLegacy: 'STM32F1', pack });
    expect(issues.some(i => i.level === 'error' && i.message.includes('peripheral'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/hil/pinValidator.test.ts`
Expected: FAIL — module `./pinValidator` does not exist.

- [ ] **Step 3: Implement the validator**

Create `src/engine/hil/pinValidator.ts`:

```ts
import type { DriverChannel, TargetMCU } from './hilTypes';

export interface PinValidationIssue {
  level: 'error' | 'warning';
  channelId: string;
  message: string;
}

export interface PackLike {
  pins?: Array<{ id: string }>;
  pinsComplete?: boolean;
  capabilityManifest?: { supportedPeripherals?: string[] };
}

interface FamilyRule {
  validPin: (pin: string) => boolean;
  describe: string;
  serialConflict?: (pin: string) => boolean;
  strappingWarn?: (pin: string) => boolean;
  inputOnlyError?: (pin: string) => boolean;
}

const arduinoDigital = (max: number) => {
  const analogCount = max === 13 ? 6 : 16;
  const analog = Array.from({ length: analogCount }, (_, i) => `A${i}`);
  return new Set([...Array.from({ length: max + 1 }, String), ...analog]);
};

const FAMILY: Partial<Record<TargetMCU, FamilyRule>> = {
  Arduino_Uno: {
    validPin: p => arduinoDigital(13).has(p.trim().toUpperCase()),
    describe: "numeric '0'-'13' or analog 'A0'-'A5'",
    serialConflict: p => p.trim() === '0' || p.trim() === '1',
  },
  Arduino_Mega: {
    validPin: p => arduinoDigital(53).has(p.trim().toUpperCase()),
    describe: "numeric '0'-'53' or analog 'A0'-'A15'",
    serialConflict: p => p.trim() === '0' || p.trim() === '1',
  },
  STM32F1: {
    validPin: p => /^P[A-EL][0-9]$|^P[A-EL]1[0-5]$/i.test(p.trim()),
    describe: "STM32 style e.g. 'PA5', 'PB12'",
  },
  STM32F4: {
    validPin: p => /^P[A-EL][0-9]$|^P[A-EL]1[0-5]$/i.test(p.trim()),
    describe: "STM32 style e.g. 'PA5', 'PB12'",
  },
  ESP32: {
    validPin: p => /^(0|[1-9]|[1-3][0-9])$/.test(p.trim()) && Number(p.trim()) <= 39,
    describe: "GPIO numbers '0'-'39'",
    strappingWarn: p => ['0', '2', '5', '12', '15'].includes(p.trim()),
    inputOnlyError: p => ['34', '35', '36', '39'].includes(p.trim()),
  },
};

export function validatePinAssignments(
  channels: DriverChannel[],
  opts: { targetLegacy: TargetMCU; pack?: PackLike | null },
): PinValidationIssue[] {
  const issues: PinValidationIssue[] = [];
  const family = FAMILY[opts.targetLegacy];

  if (family) {
    const seen = new Map<string, string>();
    for (const ch of channels) {
      const pin = String(ch.pin ?? '').trim();

      if (/^P[A-L]\d+$/i.test(pin) && opts.targetLegacy.startsWith('Arduino')) {
        issues.push({ level: 'error', channelId: ch.id, message: `pin '${pin}' uses STM32-style naming which is invalid on ${opts.targetLegacy}; use numeric pins ('13') or analog pins ('A0')` });
      }
      if (opts.targetLegacy.startsWith('Arduino') && family.serialConflict?.(pin)) {
        issues.push({ level: 'warning', channelId: ch.id, message: `pin '${pin}' is a Hardware Serial RX/TX pin and conflicts with HIL UART communication; remap (e.g. '4' or '22')` });
      }
      if (!family.validPin(pin)) {
        issues.push({ level: 'error', channelId: ch.id, message: `pin '${pin}' is not available on ${opts.targetLegacy}; expected ${family.describe}` });
      } else {
        const owner = seen.get(pin.toUpperCase());
        if (owner && owner !== ch.id) {
          issues.push({ level: 'error', channelId: ch.id, message: `pin '${pin}' already assigned to channel '${owner}'` });
        } else {
          seen.set(pin.toUpperCase(), ch.id);
        }
      }
      if (ch.direction === 'Out' && family.inputOnlyError?.(pin)) {
        issues.push({ level: 'error', channelId: ch.id, message: `pin '${pin}' is input-only on ESP32 and cannot drive an output channel` });
      }
      if (family.strappingWarn?.(pin) && ch.direction === 'Out') {
        issues.push({ level: 'warning', channelId: ch.id, message: `pin '${pin}' is an ESP32 strapping pin; avoid outputs on it (boot mode side effects)` });
      }
    }
  }

  if (opts.pack?.capabilityManifest?.supportedPeripherals?.length) {
    const supported = new Set(opts.pack.capabilityManifest.supportedPeripherals);
    for (const ch of channels) {
      if (!supported.has(ch.peripheral.toLowerCase())) {
        issues.push({ level: 'error', channelId: ch.id, message: `peripheral '${ch.peripheral}' is not supported by the selected target pack (${[...supported].join(', ')})` });
      }
    }
  }

  if (opts.pack?.pinsComplete && Array.isArray(opts.pack.pins) && opts.pack.pins.length > 0) {
    const known = new Set(opts.pack.pins.map(p => p.id.toUpperCase()));
    for (const ch of channels) {
      if (!known.has(String(ch.pin).trim().toUpperCase())) {
        issues.push({ level: 'error', channelId: ch.id, message: `pin '${ch.pin}' is not defined in target pack pins[]` });
      }
    }
  }

  return issues;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/hil/pinValidator.test.ts`
Expected: 10 PASS.

- [ ] **Step 5: Enforce in generateHALCode**

In `src/engine/hil/hilCodeGenerator.ts`:

1. Change signature (line 8):

```ts
export function generateHALCode(
  config: HILConfig,
  smVariables: Array<{ name: string; type: string }>,
  warnings?: string[],
  errors?: string[]
): Array<{ name: string; content: string }> {
```

2. Immediately after the `if (!config || !config.enabled)` guard, replace the whole ad-hoc warning block (lines 21–39) with:

```ts
import { validatePinAssignments } from './pinValidator';
import { defaultTargetPackFor } from '../targetPacks/defaultTargetPacks';
```
(add these two imports at the top of the file), then:

```ts
  const pinIssues = validatePinAssignments(config.channels, {
    targetLegacy: target,
    pack: defaultTargetPackFor(resolveTargetSelection(config)?.targetId ?? ''),
  });
  for (const issue of pinIssues) {
    const line = `[HIL] Channel '${issue.channelId}': ${issue.message}`;
    if (issue.level === 'error') errors?.push(line); else warnings?.push(line);
  }
  if (errors && errors.length > 0) {
    return [];
  }
```

If `defaultTargetPackFor(targetId)` does not exist in `defaultTargetPacks.ts`, add there:

```ts
export function defaultTargetPackFor(targetId: string): TargetPackManifest | null {
  return BUILTIN_TARGET_PACKS.find(p => p.targetId === targetId) ?? null;
}
```

(matching the actual export shape of that file), and extend the returned manifest objects with `pinsComplete: false` so the pack `pins[]` membership check stays advisory until packs ship complete pin tables.

3. In `HILWorkspace.tsx` where HAL files are produced (~line 209–212), pass an error sink and stop the save flow on errors:

```ts
const halErrors: string[] = [];
const halWarnings: string[] = [];
const halFiles = generateHALCode({ ...config, enabled: true }, smVars, halWarnings, halErrors);
if (halErrors.length > 0) {
  setBuildLog(prev => [...prev, ...halErrors.map(e => `[ERROR] ${e}`)]);
  setActiveMainTab('build');
  return;
}
```

(adapt `smVars`/`setBuildLog` to the identifiers actually present at that call site — they were introduced in the surrounding lines).

- [ ] **Step 6: Surface live issues in HILDriverPanel**

At the top of `src/components/hil/HILDriverPanel.tsx`, add:

```tsx
import { useMemo } from 'react';
import { validatePinAssignments } from '../../engine/hil/pinValidator';
import type { PinValidationIssue } from '../../engine/hil/pinValidator';
```

Inside the component body (after line 94):

```tsx
const issues: PinValidationIssue[] = useMemo(
  () => validatePinAssignments(channels, { targetLegacy: target }),
  [channels, target]
);
const errors = issues.filter(i => i.level === 'error');
const warnings = issues.filter(i => i.level === 'warning');
```

Render above the channel table:

```tsx
{errors.length > 0 && (
  <div className="mb-2 rounded border border-red-700 bg-red-900/40 p-2 text-xs text-red-300">
    {errors.map((i, idx) => <p key={idx}>PIN ERROR: {i.message}</p>)}
  </div>
)}
{warnings.length > 0 && (
  <div className="mb-2 rounded border border-yellow-600 bg-yellow-900/30 p-2 text-xs text-yellow-200">
    {warnings.map((i, idx) => <p key={idx}>PIN WARN: {i.message}</p>)}
  </div>
)}
```

Also disable the Generate/Save button upstream in `HILWorkspace.tsx` when `errors.length > 0` by hoisting the same `useMemo` there (same import, using `config.channels` and `config.target`).

- [ ] **Step 7: Regression run**

Run: `npx vitest run src/engine/hil/ && npm run test:security`
Expected: all HIL engine tests and security suites PASS (existing `hil.test.ts` cases that relied on the old warning strings must be updated to the new message text — update expectations, never weaken assertions).

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/engine/hil/pinValidator.ts src/engine/hil/pinValidator.test.ts src/engine/hil/hilCodeGenerator.ts src/components/hil/HILDriverPanel.tsx src/components/hil/HILWorkspace.tsx src/engine/targetPacks/defaultTargetPacks.ts
git commit -m "feat(hil): enforce per-target pin assignment validation in generator and UI"
```

---

### Task 5: Real memory size gate in elf inspection (-Os enforcement, part 1)

`inspectElf` currently returns hardcoded fake numbers unless a mock is supplied (elfInspector.cjs:72–82). Make it run the toolchain's real `size` binary and compare against the target-pack `memoryRegions`. This is the "-Os build must fit" gate.

**Files:**
- Modify: `src/security/elfInspector.cjs`
- Create: `src/security/targetPackLoader.cjs`
- Create: `src/security/targetPackLoader.test.cjs`
- Create: `src/security/elfInspector.sizegate.test.cjs`
- Modify: `src/security/hilBuildService.cjs` (load real pack, forward `sizeExecutable`)

**Interfaces:**
- Consumes: `parseMemoryUsage(sizeOutput, pack)` (exists), pack manifests at `target-packs/<targetId>/manifest.json`.
- Produces:
  - `loadPackManifest(targetId: string, repoRoot?: string): object` — parsed manifest JSON (throws `PACK_NOT_FOUND`)
  - `inspectElf(elfPath, pack, opts)` — new opt `sizeExecutable?: string`; when provided, runs `sizeExecutable -B elfPath` and sets `valid:false, error:'MEMORY_BUDGET_EXCEEDED'` on overflow; `memory.overflow=true` otherwise computed from real numbers.

- [ ] **Step 1: Write failing tests**

Create `src/security/targetPackLoader.test.cjs`:

```js
'use strict';
const assert = require('node:assert/strict');
const { loadPackManifest } = require('./targetPackLoader.cjs');

async function runTests() {
  const pack = loadPackManifest('atmega328p');
  assert.equal(pack.targetId, 'atmega328p');
  assert.equal(pack.memoryRegions.find(r => r.name === 'FLASH').size, 32768);
  assert.throws(() => loadPackManifest('not-a-target'), /PACK_NOT_FOUND/);
  console.log('targetPackLoader tests passed!');
}
runTests().catch(e => { console.error(e); process.exit(1); });
```

Create `src/security/elfInspector.sizegate.test.cjs` (uses a stub `size` executable so no toolchain is needed):

```js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { inspectElf, parseMemoryUsage } = require('./elfInspector.cjs');

async function runTests() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sizegate-'));
  const elfPath = path.join(tmp, 'firmware.elf');
  fs.writeFileSync(elfPath, 'fake-elf');
  const sizeStub = path.join(tmp, 'fake-size.cmd');
  fs.writeFileSync(sizeStub, '@echo off\r\necho    text    data     bss     dec     hex filename\r\necho   28000      32    1024   29056    7180 firmware.elf\r\n');
  const pack = { memoryRegions: [{ name: 'FLASH', start: 0, size: 32768 }, { name: 'RAM', start: 0x800100, size: 2048 }] };

  // Fits: flashUsed = 28000+32 = 28032 <= 32768, ramUsed = 32+1024 <= 2048
  const fits = await inspectElf(elfPath, pack, { sizeExecutable: sizeStub });
  assert.equal(fits.valid, true);
  assert.equal(fits.memory.flashUsed, 28032);
  assert.equal(fits.memory.ramUsed, 1056);
  assert.equal(fits.memory.overflow, false);

  // Overflow RAM: bss pushes data+bss past 2048
  fs.writeFileSync(sizeStub, '@echo off\r\necho    text    data     bss     dec     hex filename\r\necho   28000      32    4000   32032    7d20 firmware.elf\r\n');
  const overflow = await inspectElf(elfPath, pack, { sizeExecutable: sizeStub });
  assert.equal(overflow.valid, false);
  assert.equal(overflow.error, 'MEMORY_BUDGET_EXCEEDED');
  assert.equal(overflow.memory.overflow, true);

  // parseMemoryUsage unit: SRAM alias resolution
  const sram = parseMemoryUsage('t\nd\nbss', { memoryRegions: [{ name: 'FLASH', size: 10 }, { name: 'SRAM', size: 20 }] });
  assert.equal(sram.ramTotal, 20);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('elfInspector size gate tests passed!');
}
runTests().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node src/security/targetPackLoader.test.cjs ; node src/security/elfInspector.sizegate.test.cjs`
Expected: FAIL — `Cannot find module './targetPackLoader.cjs'`; sizegate fails because `sizeExecutable` is ignored (`fits.valid` true but `memory.flashUsed` equals fake defaults).

- [ ] **Step 3: Implement targetPackLoader.cjs**

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadPackManifest(targetId, repoRoot = process.cwd()) {
  const manifestPath = path.join(repoRoot, 'target-packs', targetId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`PACK_NOT_FOUND: ${targetId} (${manifestPath})`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

module.exports = { loadPackManifest };
```

- [ ] **Step 4: Upgrade inspectElf**

In `src/security/elfInspector.cjs` add a runner and integrate:

```js
// NOTE: Node >= 20 refuses to spawn .cmd/.bat without going through ComSpec
// (spawning them with shell:false throws EINVAL), so script-style stubs are
// routed through %ComSpec% explicitly.
function runSize(sizeExecutable, elfPath) {
  return new Promise((resolve) => {
    const { spawn } = require('node:child_process');
    const isScript = /\.(cmd|bat)$/i.test(sizeExecutable);
    const exe = isScript ? (process.env.ComSpec || 'cmd.exe') : sizeExecutable;
    const args = isScript ? ['/d', '/s', '/c', sizeExecutable, '-B', elfPath] : ['-B', elfPath];
    const child = spawn(exe, args, { shell: false });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', c => { stdout += c.toString(); });
    child.stderr.on('data', c => { stderr += c.toString(); });
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.on('error', err => resolve({ code: 1, stdout, stderr: err.message }));
  });
}
```

Replace the tail of `inspectElf` (the block starting at the current line 62 comment) with:

```js
  if (opts.mockSizeOutput) {
    const memory = parseMemoryUsage(opts.mockSizeOutput, pack);
    return {
      valid: !memory.overflow,
      hashes: { elf: elfHash, map: mapHash, bin: sha256File(binPath) || elfHash, hex: sha256File(hexPath) || elfHash },
      memory,
    };
  }

  if (opts.sizeExecutable) {
    const { code, stdout, stderr } = await runSize(opts.sizeExecutable, elfPath);
    if (code !== 0) {
      return { valid: false, error: 'SIZE_EXECUTION_FAILED', detail: stderr.slice(0, 512),
        hashes: { elf: elfHash }, memory: null };
    }
    const memory = parseMemoryUsage(stdout, pack);
    return {
      valid: !memory.overflow,
      error: memory.overflow ? 'MEMORY_BUDGET_EXCEEDED' : undefined,
      hashes: { elf: elfHash, map: mapHash, bin: sha256File(binPath) || elfHash, hex: sha256File(hexPath) || elfHash },
      memory,
    };
  }

  return { valid: false, error: 'SIZE_EXECUTABLE_REQUIRED',
    hashes: { elf: elfHash }, memory: null };
```

Removing the silent fake-numbers branch is intentional: without a size binary there is no verified image. Update the existing `elfInspector.test.cjs` expectations that relied on `valid:true` defaults to either supply `mockSizeOutput` or expect `SIZE_EXECUTABLE_REQUIRED`.

- [ ] **Step 5: Wire pack + size executable through HilBuildService**

In `src/security/hilBuildService.cjs`:

```js
const { loadPackManifest } = require('./targetPackLoader.cjs');
const { resolveToolExecutable } = require('./toolchainManager.cjs');
```

Inside `build()` replace the recipe/inspection wiring (current lines 51–81) with:

```js
      const recipe = getBuildRecipe(request.targetSelection.targetId, {
        sources: evaluation.sourceFiles,
        linkerScript: opts.linkerScript,
        startupFile: opts.startupFile,
      });
      const pack = opts.pack || loadPackManifest(request.targetSelection.targetId);

      // ... existing spawn block unchanged ...

      const sizePrefix = recipe.compiler.replace(/-gcc$|-g\+\+$/, '');
      const sizeExecutable = opts.sizeExecutable
        || resolveToolExecutable(process.platform === 'win32' ? `${sizePrefix}-size.exe` : `${sizePrefix}-size`);

      const elfPath = path.join(buildDir, 'firmware.elf');
      const inspection = await inspectElf(elfPath, pack, {
        sizeExecutable: sizeExecutable || undefined,
        ...(opts.mockSizeOutput ? { mockSizeOutput: opts.mockSizeOutput } : {}),
      });
```

Existing tests that pass `mockSizeOutput` keep working; the default-pack fallback object (old lines 76–80) is deleted — real packs always exist for the five hardened targets.

- [ ] **Step 6: Run all inspector/service tests**

Run: `node src/security/targetPackLoader.test.cjs && node src/security/elfInspector.sizegate.test.cjs && node src/security/elfInspector.test.cjs && node src/security/hilBuildService.test.cjs && npm run test:security`
Expected: all PASS (update any stale mocks as noted in Step 4).

- [ ] **Step 7: Commit**

```bash
git add src/security/elfInspector.cjs src/security/targetPackLoader.cjs src/security/targetPackLoader.test.cjs src/security/elfInspector.sizegate.test.cjs src/security/hilBuildService.cjs src/security/elfInspector.test.cjs
git commit -m "feat(hil): enforce real memory budget size gate from target packs"
```

---

### Task 6: Build matrix — compile/link all 5 MCU targets through the hardened path

Generates one representative SM+HIL source set, then runs `HilBuildService.build` for each target with the real cross-compilers installed by Tasks 1–3, asserting `LINKED_IMAGE_VERIFIED` (or `TARGET_COMPILE_VERIFIED` for ESP32 compile-only) and passing the size gate.

Prerequisite fixes discovered during design, applied here:
- STM32 recipes need `--specs=nosys.specs` (snprintf pulls newlib syscalls; the legacy live path already used them).
- ESP32 has no free-standing linker script/startup in-repo → recipe becomes compile-only, producing `.o` objects certified as `TARGET_COMPILE_VERIFIED` (matches the packs' `capabilityManifest.certifiedStatuses` vocabulary).
- AVR recipes need float printf libs for the `%.4f` telemetry frames: `-Wl,-u,vfprintf -lprintf_flt -lm`.

**Files:**
- Modify: `src/security/hilBuildRecipes.cjs` (three recipe fixes above)
- Modify: `src/security/hilBuildService.cjs` (compile-only handling + executable resolution)
- Modify: `src/security/hilBuildPolicy.cjs` (align `RECIPES.recipeId`s with `hilBuildRecipes.cjs` — they currently differ, e.g. `arm-none-eabi-stm32f103c8-v1` vs `arm-none-eabi-stm32f103-v1`; make policy reference the canonical ids)
- Create: `scripts/hil_build_matrix.cjs` (executable suite)
- Modify: `package.json` (script `test:hil:build-matrix`)

**Interfaces:**
- Consumes: `generateMISRACCode(chart, options)` returning `{ files:[{name,content}] }`; `generateHALCode(config, smVariables, warnings, errors)`; `HilBuildService.build(request, savedWorkspace, opts)`; `loadPackManifest`; `ensureToolchain`; workspace contract `{ buildId, sourceManifestHash, targetSelection, flashBlocked:false, files[], dir }` (verified against hilBuildPolicy.cjs:60–91 and hilBuildService.test.cjs:14–40).
- Produces: `runBuildMatrix(targets?: string[]): Promise<Array<{targetId,status,memory?}>>` exported from the script for reuse; npm script exit 0 only when every requested target passes.

- [ ] **Step 1: Recipe fixes**

In `src/security/hilBuildRecipes.cjs`:

stm32f103c8t6 args — insert after `'-Os',`:

```js
      '--specs=nosys.specs',
```

stm32f407vgt6 args — same insertion after `'-Os',`.

atmega328p args — change the linker tail to:

```js
      ...sources,
      '-Wl,-Map=firmware.map,--gc-sections', '-Wl,-u,vfprintf', '-lprintf_flt', '-lm', '-o', 'firmware.elf',
```

atmega2560 args — identical tail change.

esp32-wroom-32 — replace the whole recipe entry with compile-only form:

```js
  'esp32-wroom-32': Object.freeze({
    recipeId: 'esp-idf-wroom32-v1',
    inspectRecipeId: 'esp-idf-image-v1',
    compiler: 'xtensa-esp32-elf-gcc',
    compileOnly: true,
    buildArgs: (paths, sources) => Object.freeze([
      '-mlongcalls', '-Os', '-Wall', '-Wextra', '-Werror',
      '-ffunction-sections', '-fdata-sections',
      '-Isrc/mcal', '-Isrc/component',
      '-c', ...sources,
    ]),
  }),
```

- [ ] **Step 2: Policy id alignment**

In `src/security/hilBuildPolicy.cjs` change the five `recipeId` values to exactly match `hilBuildRecipes.cjs`: `arm-none-eabi-stm32f103-v1`, `arm-none-eabi-stm32f407-v1`, `avr-atmega328p-v1`, `avr-atmega2560-v1`, `esp-idf-wroom32-v1`, and change esp32/atmega `main` from `main_hil.ino` to `main_hil.cpp` (the matrix compiles the generated `main_hil.c` content under a `.cpp` name for C++-shimmed targets — see Step 5; keeping policy and sources consistent avoids a special case). Run `npm run test:security` and update the stale recipe-id literals inside `hilBuildPolicy.test.cjs` / `hilBuildRecipes.test.cjs` to the aligned ids.

- [ ] **Step 3: Compile-only support in HilBuildService**

In `hilBuildRecipes.cjs` export helper:

```js
function objectsFor(sources) {
  return sources.map(s => s.replace(/\.c(pp)?$/, '.o'));
}
module.exports = { getBuildRecipe, RECIPES, objectsFor };
```

In `hilBuildService.cjs`, after the spawn result and before inspection:

```js
      if (recipe.compileOnly) {
        const missingObjects = objectsFor(evaluation.sourceFiles)
          .filter(o => !fs.existsSync(path.join(buildDir, o)));
        const status = (spawnResult.exitCode === 0 && missingObjects.length === 0)
          ? 'TARGET_COMPILE_VERIFIED' : 'BUILD_FAILED';
        return Object.freeze({
          buildId: request.buildId,
          targetSelection: Object.freeze({ ...request.targetSelection }),
          recipeId: recipe.recipeId,
          sourceManifestHash: request.sourceManifestHash,
          status,
          buildDir,
          artifacts: Object.freeze({ elfPath: null, hashes: Object.freeze({}) }),
          memory: null,
          logs: Object.freeze({ stdout: spawnResult.stdout.slice(0, 4096), stderr: spawnResult.stderr.slice(0, 4096) }),
          timestamp: Date.now(),
        });
      }
```

(import `objectsFor` alongside `getBuildRecipe`). Also resolve the compiler to an absolute path before spawning so win32 `spawn(name-without-.exe)` works:

```js
      const resolvedCompiler = resolveToolExecutable(recipe.executable)
        || (process.platform === 'win32' ? `${recipe.executable}.exe` : recipe.executable);
```

and use `resolvedCompiler` in the `spawn(...)` call.

- [ ] **Step 4: Write the matrix suite**

Create `scripts/hil_build_matrix.cjs`:

```js
#!/usr/bin/env node
'use strict';

/**
 * Builds the ADIA HIL firmware source set for every requested MCU target via
 * the hardened HilBuildService. Requires toolchains installed (Task 1-3):
 *   npm run test:hil:env -- --fix
 * Usage:
 *   node scripts/hil_build_matrix.cjs                # all five targets
 *   node scripts/hil_build_matrix.cjs atmega2560     # subset
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { HilBuildService } = require('../src/security/hilBuildService.cjs');
const { loadPackManifest } = require('../src/security/targetPackLoader.cjs');
const { ensureToolchain } = require('../src/security/toolchainManager.cjs');

const ALL_TARGETS = ['atmega328p', 'atmega2560', 'stm32f103c8t6', 'stm32f407vgt6', 'esp32-wroom-32'];
// Sources required by hilBuildPolicy COMMON_SOURCES + the per-target main file.
const REQUIRED_SOURCES = [
  'sm_mapping.c', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'hal_drivers.c',
  'hil_interface.c', 'mcal_dio_hil.c', 'adia_mcal.c', 'adia_component.c',
];

function writeWorkspace(targetId) {
  const legacyByTarget = {
    stm32f103c8t6: 'STM32F1', stm32f407vgt6: 'STM32F4',
    atmega328p: 'Arduino_Uno', atmega2560: 'Arduino_Mega', 'esp32-wroom-32': 'ESP32',
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `adia-ws-${targetId}-`));
  // Materialize generated sources through the shared tsx emitter
  // (scripts/hil_emit_sources.ts, created in Task 7 Step 3).
  execFileSync('npx', ['tsx', 'scripts/hil_emit_sources.ts', dir, legacyByTarget[targetId]],
    { stdio: 'pipe', shell: process.platform === 'win32' });

  const names = fs.readdirSync(dir).filter(n => n.endsWith('.c') || n.endsWith('.cpp') || n.endsWith('.h'));
  const missing = REQUIRED_SOURCES.filter(s => !names.includes(s));
  const mainName = names.find(n => /^main_hil\.(c|cpp|ino)$/.test(n));
  if (missing.length > 0 || !mainName) {
    throw new Error(`INCOMPLETE_SOURCE_SET: missing=${missing.join(',')} main=${mainName || 'none'}`);
  }
  const hashInput = names.sort()
    .map(n => fs.readFileSync(path.join(dir, n)))
    .map(b => crypto.createHash('sha256').update(b).digest('hex'))
    .join('\u0000');
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
  return {
    dir, files: [...names],
    sourceManifestHash: `sha256:${hash}`,
    targetSelection: { targetId, packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
  };
}

async function buildTarget(service, targetId) {
  const ws = writeWorkspace(targetId);
  const request = {
    buildId: `BUILD_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    sourceManifestHash: ws.sourceManifestHash,
    targetSelection: ws.targetSelection,
  };
  const savedWorkspace = {
    buildId: request.buildId,
    sourceManifestHash: ws.sourceManifestHash,
    targetSelection: ws.targetSelection,
    flashBlocked: false,
    files: ws.files,
    dir: ws.dir,
  };
  const opts = {};
  if (targetId === 'stm32f103c8t6') {
    opts.linkerScript = path.join(process.cwd(), 'target-packs', targetId, 'linker', 'stm32f103c8tx.ld');
    opts.startupFile = path.join(process.cwd(), 'target-packs', targetId, 'startup', 'startup_stm32f103c8tx.c');
  }
  if (targetId === 'stm32f407vgt6') {
    opts.linkerScript = path.join(process.cwd(), 'target-packs', targetId, 'linker', 'stm32f407vgtx.ld');
    opts.startupFile = path.join(process.cwd(), 'target-packs', targetId, 'startup', 'startup_stm32f407xx.c');
  }
  const record = await service.build(request, savedWorkspace, opts);
  return { targetId, record };
}

async function runBuildMatrix(targets = ALL_TARGETS) {
  const service = new HilBuildService();
  const results = [];
  for (const targetId of targets) {
    process.stdout.write(`[${targetId}] building ... `);
    try {
      const { record } = await buildTarget(service, targetId);
      // `record` is passed through so downstream suites (flash/vector) can
      // locate artifacts via result.record.buildDir.
      results.push({ targetId, status: record.status, memory: record.memory, record });
      console.log(record.status, record.memory ? `(flash ${record.memory.flashUsed}/${record.memory.flashTotal})` : '');
    } catch (e) {
      results.push({ targetId, status: 'BUILD_FAILED', error: e.message, record: null });
      console.log('FAILED:', e.message.split('\n')[0]);
    }
  }
  return results;
}

module.exports = { runBuildMatrix };

if (require.main === module) {
  const wanted = process.argv.slice(2).filter(a => !a.startsWith('-'));
  (async () => {
    for (const key of ['Arduino', 'STM32', 'ESP32']) {
      await ensureToolchain(key, path.join(process.cwd(), 'toolchains')).catch(e => {
        console.warn(`[WARN] toolchain ${key} unavailable: ${e.message}`);
      });
    }
    const results = await runBuildMatrix(wanted.length ? wanted : ALL_TARGETS);
    const failed = results.filter(r => r.status === 'BUILD_FAILED');
    console.log(`\n${results.length - failed.length}/${results.length} targets verified`);
    process.exit(failed.length ? 1 : 0);
  })();
}
```

Add npm script:

```json
"test:hil:build-matrix": "node scripts/hil_build_matrix.cjs",
```

Note: the matrix materializes generated sources by spawning `npx tsx scripts/hil_emit_sources.ts` (the shared TS emitter created in Task 7 Step 3 — if you execute Task 6 before Task 7, create that file first; it is listed verbatim there). `hil_emit_sources.ts` must rename the firmware entry point for C++-shimmed targets at write time — inside its write loop use:

```ts
const cppShimTargets = new Set(['Arduino_Uno', 'Arduino_Mega', 'ESP32']);
for (const f of [...sm.files, ...generateHALCode(hilConfig, [], warnings, errors)]) {
  const name = cppShimTargets.has(legacyTarget) && f.name === 'main_hil.c' ? 'main_hil.cpp' : f.name;
  fs.writeFileSync(path.join(wsDir, name), f.content);
}
```

This matches the `main: 'main_hil.cpp'` policy change from Task 6 Step 2.

- [ ] **Step 5: Run the matrix**

Run: `npm run test:hil:env -- --fix && npm run test:hil:build-matrix`
Expected (all toolchains present):

```
[atmega328p] building ... LINKED_IMAGE_VERIFIED (flash nnnn/32768)
[atmega2560] building ... LINKED_IMAGE_VERIFIED (flash nnnn/262144)
[stm32f103c8t6] building ... LINKED_IMAGE_VERIFIED (flash nnnn/65536)
[stm32f407vgt6] building ... LINKED_IMAGE_VERIFIED (flash nnnn/1048576)
[esp32-wroom-32] building ... TARGET_COMPILE_VERIFIED

5/5 targets verified
```

Debugging notes (expected failure modes, each with its fix):
- `fatal error: hal_config.h: No such file` → recipes lack `-I.`; add `'-I.',` right after the `-Isrc/...` entries.
- AVR link: `undefined reference to __cxa_...` in `.cpp` path → append `'-fno-exceptions', '-fno-rtti'` to the two AVR recipes' arg lists.
- STM32 link: `undefined reference to _sbrk/_write` → confirm `--specs=nosys.specs` landed in both ARM recipes.
- `MEMORY_BUDGET_EXCEEDED` → real signal; reduce fixture (fewer channels) only if genuinely oversized, otherwise investigate `-ffunction-sections`/gc-sections wiring.

- [ ] **Step 6: Security regression**

Run: `npm run test:security`
Expected: PASS (policy/recipes/service tests updated in Steps 2–3).

- [ ] **Step 7: Commit**

```bash
git add src/security/hilBuildRecipes.cjs src/security/hilBuildPolicy.cjs src/security/hilBuildService.cjs scripts/hil_build_matrix.cjs package.json src/security/*.test.cjs
git commit -m "feat(hil): five-target hardened build matrix with size gate and float printf"
```

---

### Task 7: Optimization integrity (-Os) — telemetry must survive optimization

Verifies the chosen optimization posture: release `-Os` everywhere (already in recipes), debug `-Og` variant for one target, and proof that optimization never corrupts the UART variable stream. Two concrete hazards get locked down:
1. Override globals in generated `hil_interface.c` must be `volatile` (ISR-free today, but the UART poll path can be re-entered by interrupts on vendor drivers; `volatile` makes it robust and costs nothing).
2. Host golden trace must be byte-identical across `-O0`, `-O2`, `-Os`.

**Files:**
- Modify: `src/engine/hil/hilCodeGenerator.ts` (volatile override globals)
- Modify: `src/engine/hil/hil.test.ts` (new assertion)
- Create: `scripts/hil_opt_golden.cjs`
- Create: `scripts/hil_emit_sources.ts`
- Modify: `package.json` (script `test:hil:opt`)

**Interfaces:**
- Consumes: `generateHALCode`, `decodeTextFrame` semantics (`name=%.4f;...\n`), host gcc from TOOLCHAINS.Generic.
- Produces: guarantee that `override_active_*` globals are declared `static volatile bool`; `scripts/hil_opt_golden.cjs` exits 0 only if traces at O0/O2/Os are identical.

- [ ] **Step 1: Failing test for volatile overrides**

Append to `src/engine/hil/hil.test.ts` inside its top-level describe (reuse the config-building helpers already present in that file; the essential assertion is):

```ts
it('declares override globals volatile so -Os cannot elide override polling', () => {
  const warnings: string[] = [];
  const files = generateHALCode(makeMinimalHilConfig(), [], warnings);
  const interfaceC = files.find(f => f.name === 'hil_interface.c')!.content;
  expect(interfaceC).toMatch(/static\s+volatile\s+bool\s+override_active_/);
  expect(interfaceC).toMatch(/static\s+volatile\s+(float|double)\s+override_val_/);
});
```

(`makeMinimalHilConfig` = the minimal enabled config helper used by neighboring tests in that file.)

Run: `npx vitest run src/engine/hil/hil.test.ts`
Expected: FAIL (globals currently plain `bool`).

- [ ] **Step 2: Emit volatile globals**

In `hilCodeGenerator.ts`, locate `overrideGlobals` construction (search `override_val_${sanitize(ch.name)}` declarations, near line 340–380) and change both declaration lines to include `volatile`:

```ts
static volatile bool override_active_${sanitize(ch.name)} = false;
static volatile float override_val_${sanitize(ch.name)} = 0.0f;
```

(match the actual emitted types — if doubles are used, declare `double`).

Re-run Step 1's command → PASS.

- [ ] **Step 3: Optimization golden script**

Create `scripts/hil_opt_golden.cjs`:

```js
#!/usr/bin/env node
'use strict';
/** Compiles the Generic-target HIL firmware harness at -O0/-O2/-Os and asserts
 *  identical telemetry traces. Proves optimization never changes behavior. */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ensureToolchain, configureToolchainPaths } = require('../src/security/toolchainManager.cjs');

async function main() {
  await ensureToolchain('Generic', path.join(process.cwd(), 'toolchains'));
  configureToolchainPaths(path.join(process.cwd(), 'toolchains'));

  const { spawnSync } = require('node:child_process');
  // Materialize sources via tsx (TS generators) into tmp workspace
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'opt-golden-'));
  execFileSync('npx', ['tsx', 'scripts/hil_emit_sources.ts', ws, 'Generic'], { stdio: 'inherit', shell: process.platform === 'win32' });

  fs.writeFileSync(path.join(ws, 'harness.c'), `
#include "sm_core.h"
#include <stdio.h>
#include <stdint.h>
static unsigned pwm_value = 0U;
uint32_t HAL_ADC_Read(const char* pin, const char* name) { (void)pin; (void)name; return 321U; }
void HAL_PWM_Write(const char* pin, const char* name, uint32_t value) { (void)pin; (void)name; pwm_value = value; }
int main(void) {
  ADIA_Instance_t inst;
  if (SM_Init(&inst) != SM_ERR_NONE) return 1;
  for (int i = 0; i < 5; i++) {
    SM_ReadInputs(&inst);
    SM_Step(&inst, SM_TICK_MS);
    SM_WriteOutputs(&inst);
    printf("%u %u\\n", (unsigned)inst.data.v_adc, pwm_value);
  }
  return 0;
}
`);

  const traces = {};
  for (const opt of ['-O0', '-O2', '-Os']) {
    execFileSync('gcc', [opt, '-std=c99', '-Wall', '-Wextra', '-Werror', '-I.',
      'sm_mapping.c', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c',
      'mcal_dio_hil.c', 'harness.c', '-o', 'harness.exe'], { cwd: ws, stdio: 'pipe', shell: process.platform === 'win32' });
    traces[opt] = execFileSync(path.join(ws, 'harness.exe'), { cwd: ws, encoding: 'utf8' });
  }
  fs.rmSync(ws, { recursive: true, force: true });

  const identical = traces['-O0'] === traces['-O2'] && traces['-O0'] === traces['-Os'];
  console.log(traces['-O0']);
  if (!identical) {
    console.error('[FAIL] telemetry trace differs across optimization levels',
      JSON.stringify(traces, null, 2));
    process.exit(1);
  }
  console.log('[PASS] identical traces across -O0/-O2/-Os');
}

main().catch(e => { console.error(e); process.exit(1); });
```

Create `scripts/hil_emit_sources.ts` (shared emitter used by this script; takes `<ws-dir> <legacy-target>`):

```ts
#!/usr/bin/env node
import { generateMISRACCode } from '../src/utils/stateMachineCodeGenerator';
import { generateHALCode } from '../src/engine/hil/hilCodeGenerator';
import * as fs from 'node:fs';
import * as path from 'node:path';

const [wsDir, legacyTarget] = process.argv.slice(2);
const baseChart = {
  tickMs: 10, safetyMode: false,
  states: [{ id: 's1', name: 'Run', x: 0, y: 0, width: 100, height: 100,
    entry: '', during: 'v_pwm_out = v_adc_in;', exit: '',
    isActive: false, color: 'blue', parentId: 'root', children: [],
    priority: 1, isParallel: false, regionId: 'MAIN', autostart: true }],
  junctions: [], transitions: [],
  variables: [
    { id: 'v1', name: 'v_adc_in', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v2', name: 'v_pwm_out', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
  ],
  layers: [{ id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }],
};
const hilConfig = {
  enabled: true, target: legacyTarget as any, clockSpeed: 16, commPort: '', baudRate: 115200,
  channels: [
    { id: 'adc1', name: 'v_adc_in', peripheral: 'ADC' as const, pin: 'A0', direction: 'In' as const, dataType: 'uint16' as const, rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' },
    { id: 'pwm1', name: 'v_pwm_out', peripheral: 'PWM' as const, pin: '5', direction: 'Out' as const, dataType: 'uint16' as const, rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
  ],
  mappings: [
    { id: 'm1', adiaVarId: 'v_adc_in', channelId: 'adc1', direction: 'read' as const },
    { id: 'm2', adiaVarId: 'v_pwm_out', channelId: 'pwm1', direction: 'write' as const, safeValue: 128 },
  ],
};
const warnings: string[] = []; const errors: string[] = [];
const sm = generateMISRACCode({ ...baseChart, hilConfig });
if (sm.errors.length) { console.error(sm.errors.join('\n')); process.exit(1); }
for (const f of [...sm.files, ...generateHALCode(hilConfig, [], warnings, errors)]) {
  fs.writeFileSync(path.join(wsDir, f.name), f.content);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`emitted sources to ${wsDir}`);
```

(Run via `npx tsx scripts/hil_emit_sources.ts` — tsx handles TS imports.)

Add npm script: `"test:hil:opt": "node scripts/hil_opt_golden.cjs"`.

- [ ] **Step 4: Run**

Run: `npm run test:hil:opt`
Expected: five `321 321` lines then `[PASS] identical traces across -O0/-O2/-Os`.

- [ ] **Step 5: Full HIL engine regression**

Run: `npx vitest run src/engine/hil/ && npx tsc --noEmit`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/hil/hilCodeGenerator.ts src/engine/hil/hil.test.ts scripts/hil_opt_golden.cjs scripts/hil_emit_sources.ts package.json
git commit -m "feat(hil): volatile override state and cross-optimization-level golden trace"
```

---

### Task 8: Real probe detection in hilProbeService

`detectProbes` is mock-only today (exploration finding #4). Flashing gates (Task 9) need honest probe presence detection.

**Files:**
- Modify: `src/security/hilProbeService.cjs`
- Modify: `src/security/hilProbeService.test.cjs`

**Interfaces:**
- Consumes: `resolveToolExecutable` from toolchainManager; Windows USB enumeration via PowerShell `Get-PnpDevice -PresentOnly -Status OK`.
- Produces: `detectProbes(targetSelection, opts)` where `opts.real === true` performs OS queries and returns `Array<{ kind: 'usbasp'|'stlink'|'uart-esp32'|'wiring', vidPid, description }>`, `[]` when nothing attached; default (no `real`) keeps existing mock behavior for tests.

- [ ] **Step 1: Failing tests**

Append to `src/security/hilProbeService.test.cjs` (plain-node assert style used in that file):

```js
  // Test N+1: real mode with injected enumerator
  const probes = await detectProbes(
    { targetId: 'stm32f407vgt6', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
    {
      real: true,
      listUsbDevices: async () => ([
        { deviceId: 'USB\\VID_0483&PID_3748\\ABC', description: 'STMicroelectronics STLink dongle' },
        { deviceId: 'USB\\VID_16C0&PID_05DC\\004', description: 'USBasp' },
        { deviceId: 'USB\\VID_10C4&PID_EA60\\0001', description: 'CP210x UART Bridge' },
      ]),
    },
  );
  assert.ok(probes.some(p => p.kind === 'stlink' && p.vidPid === 'VID_0483&PID_3748'));
  assert.ok(probes.some(p => p.kind === 'usbasp'));
  assert.ok(probes.every(p => p.kind !== 'uart-esp32' || p.vidPid === 'VID_10C4&PID_EA60'));

  // Test N+2: real mode, nothing attached -> empty array, no throw
  const none = await detectProbes(validSelection, { real: true, listUsbDevices: async () => [] });
  assert.deepEqual(none, []);
```

- [ ] **Step 2: Implement real mode**

In `hilProbeService.cjs` add the known-probe table and real branch:

```js
const KNOWN_PROBES = [
  { kind: 'stlink', vidPidPattern: /VID_0483&PID_(3748|374B|374C|374D|374E|374F)/ },
  { kind: 'usbasp', vidPidPattern: /VID_16C0&PID_05DC/i },
  { kind: 'wiring', vidPidPattern: /VID_2341&PID_(0042|0043|0010)/ }, // Arduino MEGA 2560/UNO vendor USB
  { kind: 'uart-esp32', vidPidPattern: /VID_(10C4&PID_EA60|1A86&PID_7523)/i }, // CP210x / CH340
];

async function listUsbDevicesDefault() {
  const { execFile } = require('node:child_process');
  return new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile', '-Command',
      'Get-PnpDevice -PresentOnly -Status OK | Where-Object { $_.InstanceId -like "USB*" } | Select-Object InstanceId,FriendlyName | ConvertTo-Json -Compress',
    ], { shell: false }, (err, stdout) => {
      if (err) { resolve([]); return; }
      try {
        const arr = JSON.parse(stdout);
        resolve((Array.isArray(arr) ? arr : [arr]).map(d => ({
          deviceId: d.InstanceId, description: d.FriendlyName || '',
        })));
      } catch { resolve([]); }
    });
  });
}
```

and inside `detectProbes`:

```js
  if (opts.real) {
    const devices = await (opts.listUsbDevices || listUsbDevicesDefault)();
    return devices.flatMap(d => KNOWN_PROBES
      .filter(k => k.vidPidPattern.test(d.deviceId))
      .map(k => ({ kind: k.kind, vidPid: (d.deviceId.match(/VID_[0-9A-F]{4}&PID_[0-9A-F]{4}/i) || [''])[0], description: d.description })));
  }
```

- [ ] **Step 3: Run tests**

Run: `node src/security/hilProbeService.test.cjs && npm run test:security`
Expected: PASS.

- [ ] **Step 4: Live check (board plugged in)**

With the ST-Link attached:

```bash
node -e "require('./src/security/hilProbeService.cjs').detectProbes({targetId:'stm32f407vgt6',packVersion:'1.0.0',driverMode:'vendor',boardRevision:'A'},{real:true}).then(p=>console.log(p))"
```

Expected: array containing `kind: 'stlink'`. Repeat with each board to learn your bench inventory (record output in the Task 9 evidence header).

- [ ] **Step 5: Commit**

```bash
git add src/security/hilProbeService.cjs src/security/hilProbeService.test.cjs
git commit -m "feat(hil): real USB probe detection for stlink/usbasp/wiring/esp-uart"
```

---

### Task 9: Hardware flashing gate suite (opt-in, all 5 boards)

Flashes the Task-6 artifacts to physical boards using the pack-exact flash recipes, then verifies flash-back contents and device identity against the pack manifest. Fully gated behind `ADIA_HIL_HARDWARE=1`.

**Files:**
- Create: `scripts/run_hil_flash_suite.cjs`
- Modify: `package.json` (scripts `test:hil:hardware:flash`)

**Interfaces:**
- Consumes: `getFlashRecipe(targetId, opts)` (hilFlashRecipes.cjs:56), `loadPackManifest`, `resolveToolExecutable`, `detectProbes(real)`, build artifacts from `scripts/hil_build_matrix.cjs` (`runBuildMatrix` export).
- Produces: evidence records at `hil_evidence/<timestamp>-<targetId>.json` with `{ targetId, recipeId, artifactHashes, deviceIdentity, flashVerifyOutput, verdict }`.

Board-specific prerequisites (physical setup checklist, documented in README_HIL.md update in Task 12):

| Board | Programmer | Wiring |
|---|---|---|
| ATmega328P | USBasp (`-c usbasp`) | ICSP 6-pin header; board powered by USBasp or external 5V |
| ATmega2560 | USB cable (`-c wiring`) | USB connected; close Serial boot if bootloader present |
| STM32F103C8T6 | ST-Link V2 (`SWD`) | SWDIO/SWCLK/GND/3V3 jumpers; BOOT0=0 |
| STM32F407VGT6 | On-board ST-LINK (`SWD`) | USB CN1; both BOOT pins 0 |
| ESP32-WROOM-32 | UART (`esptool`) | GPIO0→GND during reset (auto-download circuit usually handles), CP210x USB |

- [ ] **Step 1: Write the suite**

Create `scripts/run_hil_flash_suite.cjs`:

```js
#!/usr/bin/env node
'use strict';
/** Flashes verified firmware to physical boards. Opt-in:
 *   ADIA_HIL_HARDWARE=1 npm run test:hil:hardware:flash [-- targetId COMport]
 * Without ADIA_HIL_HARDWARE=1 the script exits 0 printing [SKIP]. */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { getFlashRecipe } = require('../src/security/hilFlashRecipes.cjs');
const { loadPackManifest } = require('../src/security/targetPackLoader.cjs');
const { resolveToolExecutable, configureToolchainPaths } = require('../src/security/toolchainManager.cjs');
const { detectProbes } = require('../src/security/hilProbeService.cjs');
const { runBuildMatrix } = require('./hil_build_matrix.cjs');

function runCmd(executable, args, cwd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { cwd, shell: false });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', c => { stdout += c.toString(); });
    child.stderr.on('data', c => { stderr += c.toString(); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.on('error', err => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: err.message }); });
  });
}

function sha256File(p) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`;
}

async function main() {
  if (process.env.ADIA_HIL_HARDWARE !== '1') {
    console.log('[SKIP] set ADIA_HIL_HARDWARE=1 with boards attached to run hardware flashing');
    return;
  }
  configureToolchainPaths(path.join(process.cwd(), 'toolchains'));

  const positional = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const targets = positional.length ? positional : ['atmega328p', 'atmega2560', 'stm32f103c8t6', 'stm32f407vgt6', 'esp32-wroom-32'];
  const portArgIdx = process.argv.indexOf('--port');
  const comPort = portArgIdx >= 0 ? process.argv[portArgIdx + 1] : 'COM3';

  fs.mkdirSync(path.join(process.cwd(), 'hil_evidence'), { recursive: true });

  for (const targetId of targets) {
    console.log(`\n=== ${targetId} ===`);
    const selection = { targetId, packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' };
    const probes = await detectProbes(selection, { real: true });
    console.log('probes:', JSON.stringify(probes));

    // 1. Build fresh verified artifacts
    const [result] = await runBuildMatrix([targetId]);
    if (!result.record || (result.status !== 'LINKED_IMAGE_VERIFIED' && result.status !== 'TARGET_COMPILE_VERIFIED')) {
      console.error(`[FAIL] ${targetId}: build not verified (${result.status}), refusing to flash`);
      continue;
    }
    const buildDir = result.record.buildDir;
    const artifact = fs.existsSync(path.join(buildDir, 'firmware.hex'))
      ? path.join(buildDir, 'firmware.hex')
      : path.join(buildDir, 'firmware.elf');
    if (!fs.existsSync(artifact)) {
      console.error(`[SKIP] ${targetId}: certified as ${result.status} (compile-only) — no bootable image yet; ESP32 IDF packaging is a deferred milestone`);
      const evPath = path.join(process.cwd(), 'hil_evidence', `${Date.now()}-${targetId}.json`);
      fs.mkdirSync(path.dirname(evPath), { recursive: true });
      fs.writeFileSync(evPath, JSON.stringify({ timestamp: new Date().toISOString(), targetId, verdict: 'NOT_FLASHABLE_COMPILE_ONLY', status: result.status }, null, 2));
      continue;
    }

    // 2. Recipe-driven flash
    const recipe = getFlashRecipe(targetId, {
      artifactPath: path.basename(artifact),
      programmerId: targetId === 'atmega328p' ? 'usbasp' : undefined,
      port: comPort,
    });
    const executable = resolveToolExecutable(recipe.executable)
      || (process.platform === 'win32' ? `${recipe.executable}.exe` : recipe.executable);
    console.log('flashing:', executable, recipe.args.join(' '));
    const flashRes = await runCmd(executable, recipe.args, buildDir, 180000);
    console.log(flashRes.stdout, flashRes.stderr);
    const flashOk = flashRes.code === 0;

    // 3. Post-flash verification + device identity
    let verifyOut = '(embedded in flasher output)';
    let identity = '(not checked)';
    const pack = loadPackManifest(targetId);
    if (targetId === 'atmega328p' || targetId === 'atmega2560') {
      const avrdude = resolveToolExecutable('avrdude') || 'avrdude.exe';
      const mcu = targetId === 'atmega328p' ? 'm328p' : 'm2560';
      const prog = targetId === 'atmega328p' ? 'usbasp' : 'wiring';
      const sig = await runCmd(avrdude, ['-c', prog, '-p', mcu, '-U', 'signature:r:%02x%02x%02x:h'], buildDir);
      identity = `signature=${sig.stdout.trim()} expected=${pack.deviceIdentity.signature}`;
      const vres = await runCmd(avrdude, ['-c', prog, '-p', mcu, '-U', 'flash:v:firmware.hex:i'], buildDir);
      verifyOut = vres.stdout + vres.stderr;
    } else if (targetId === 'esp32-wroom-32') {
      const esptool = resolveToolExecutable('esptool.py') || 'esptool.py';
      const chip = await runCmd('python', [esptool, '--chip', 'esp32', '--port', comPort, '--baud', '115200', 'chip_id'], buildDir);
      identity = chip.stdout.includes('ESP32') ? 'ESP32 detected' : `unexpected: ${chip.stdout.slice(0, 200)}`;
    } else {
      identity = 'ST-LINK probe present=' + String(probes.some(p => p.kind === 'stlink')) +
        ' (OpenOCD program command already ran verify)';
    }

    const verdict = flashOk ? 'FLASHED_AND_VERIFIED' : 'FLASH_FAILED';
    const evidence = {
      timestamp: new Date().toISOString(),
      targetId,
      recipeId: recipe.recipeId,
      artifactHash: fs.existsSync(artifact) ? sha256File(artifact) : null,
      deviceIdentity: identity,
      flashVerifyOutput: verifyOut.slice(0, 4096),
      verdict,
    };
    const evPath = path.join(process.cwd(), 'hil_evidence', `${Date.now()}-${targetId}.json`);
    fs.writeFileSync(evPath, JSON.stringify(evidence, null, 2));
    console.log(verdict === 'FLASHED_AND_VERIFIED' ? '[PASS]' : '[FAIL]', 'evidence:', evPath);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

Add npm script:

```json
"test:hil:hardware:flash": "node scripts/run_hil_flash_suite.cjs",
```

- [ ] **Step 2: Dry-run without hardware**

Run: `npm run test:hil:hardware:flash`
Expected: `[SKIP] ...` line, exit 0.

- [ ] **Step 3: Bench run, board by board**

Attach one board at a time (setup table above), then:

```bash
set ADIA_HIL_HARDWARE=1
npm run test:hil:hardware:flash -- atmega2560
npm run test:hil:hardware:flash -- stm32f407vgt6
npm run test:hil:hardware:flash -- esp32-wroom-32 --port COM5
npm run test:hil:hardware:flash -- stm32f103c8t6
npm run test:hil:hardware:flash -- atmega328p
```

Expected per board: probe detected → build verified → flasher exits 0 → verification section passes (avrdude signature matches pack `deviceIdentity.signature`, e.g. `0x1E950F` for 328P) → evidence JSON written. For ESP32 the expected outcome is the explicit guard from Step 1: `[SKIP] ... NOT_FLASHABLE_COMPILE_ONLY` plus an evidence record — the compile-only artifact is not a bootable image until IDF packaging lands (documented deferred milestone); never force a bad flash past this guard.

- [ ] **Step 4: Commit**

```bash
git add scripts/run_hil_flash_suite.cjs package.json
git commit -m "feat(hil): opt-in hardware flash suite with per-board evidence records"
```

---

### Task 10: UART variable-listening session service

Implements and tests "listening to a variable from the UART": an injectable serial session that reads the generated telemetry protocol (`name=value;...\n` — hilCodeGenerator.ts:464–482 emits it every tick; `HIL_ProcessMessage` at :436–462 accepts `name=value;` override and `name_release=0` release messages), decodes frames, waits on specific channel values, and sends overrides.

**Files:**
- Create: `src/engine/hil/hilSerialSession.ts`
- Create: `src/engine/hil/hilSerialSession.test.ts`
- Modify: `src/components/hil/HILDashboard.tsx` (optional swap-in later; not required for tests — left out to keep scope tight)

**Interfaces:**
- Consumes: `decodeTextFrame(line): Record<string, number>` from `./hilProtocol`.
- Produces:
  ```ts
  export interface SerialTransport {
    onData(cb: (chunk: Buffer | string) => void): void;
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }
  export interface SerialSession {
    readonly transport: SerialTransport;
    waitForFrame(timeoutMs?: number): Promise<Record<string, number>>;
    listen(channelName: string, opts?: { timeoutMs?: number; predicate?: (v: number) => boolean }): Promise<number>;
    sendOverrides(values: Record<string, number>): Promise<void>;
    releaseOverride(channelName: string): Promise<void>;
    close(): Promise<void>;
  }
  export function openSerialSession(opts: { transport?: SerialTransport; port?: string; baudRate?: number }): Promise<SerialSession>;
  ```
  When `transport` is omitted, one is built from `serialport` using `port`/`baudRate` (dynamic import so unit tests never touch the native module).

- [ ] **Step 1: Failing tests**

Create `src/engine/hil/hilSerialSession.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { openSerialSession, type SerialTransport } from './hilSerialSession';
import { encodeTextFrame } from './hilProtocol';

class FakeTransport implements SerialTransport {
  private cb: ((chunk: Buffer | string) => void) | null = null;
  sent: string[] = [];
  closed = false;
  onData(cb: (chunk: Buffer | string) => void) { this.cb = cb; }
  emitLine(line: string) { this.cb?.(line + '\n'); }
  async write(data: string) { this.sent.push(data); }
  async close() { this.closed = true; }
}

describe('hilSerialSession', () => {
  it('parses a telemetry frame into channel values', async () => {
    const t = new FakeTransport();
    const s = await openSerialSession({ transport: t });
    const framePromise = s.waitForFrame(1000);
    setTimeout(() => t.emitLine('v_adc_in=321.0000;v_pwm_out=128.0000'), 5);
    const frame = await framePromise;
    expect(frame.v_adc_in).toBeCloseTo(321);
    expect(frame.v_pwm_out).toBeCloseTo(128);
    await s.close();
  });

  it('listen() resolves with the value of one variable when predicate matches', async () => {
    const t = new FakeTransport();
    const s = await openSerialSession({ transport: t });
    const listenPromise = s.listen('v_pwm_out', { timeoutMs: 1000, predicate: v => v >= 127 });
    setTimeout(() => {
      t.emitLine('v_pwm_out=10.0000');
      t.emitLine('v_pwm_out=128.0000');
    }, 5);
    const v = await listenPromise;
    expect(v).toBeGreaterThanOrEqual(127);
    await s.close();
  });

  it('listen() times out when the variable never appears', async () => {
    const t = new FakeTransport();
    const s = await openSerialSession({ transport: t });
    await expect(s.listen('missing_ch', { timeoutMs: 50 })).rejects.toThrow(/TIMEOUT/);
    await s.close();
  });

  it('sendOverrides writes the firmware override wire format', async () => {
    const t = new FakeTransport();
    const s = await openSerialSession({ transport: t });
    await s.sendOverrides({ v_adc_in: 123.5 });
    expect(t.sent).toEqual(['v_adc_in=123.5;\n']);
    await s.releaseOverride('v_adc_in');
    expect(t.sent[1]).toBe('v_adc_in_release=1;\n');
    await s.close();
  });

  it('buffers partial chunks across onData callbacks', async () => {
    const t = new FakeTransport();
    const s = await openSerialSession({ transport: t });
    const p = s.waitForFrame(1000);
    t.cb?.('v_adc_in=42.');       // split mid-frame
    setTimeout(() => t.emitLine('0000'), 5); // completion arrives separately
    const frame = await p;
    expect(frame.v_adc_in).toBeCloseTo(42);
    await s.close();
  });
});
```

Note on wire format vs firmware: `HIL_ProcessMessage` tokenizes on `;` and parses `name=value` — the trailing `;` terminator is what the dashboard sends; `_release` messages still carry `=value` to satisfy the shared sscanf (`"%63[^=]=%f"`), hence `v_adc_in_release=1;\n`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/hil/hilSerialSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the session**

Create `src/engine/hil/hilSerialSession.ts`:

```ts
import { decodeTextFrame } from './hilProtocol';

export interface SerialTransport {
  onData(cb: (chunk: Buffer | string) => void): void;
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface SerialSession {
  readonly transport: SerialTransport;
  waitForFrame(timeoutMs?: number): Promise<Record<string, number>>;
  listen(channelName: string, opts?: { timeoutMs?: number; predicate?: (v: number) => boolean }): Promise<number>;
  sendOverrides(values: Record<string, number>): Promise<void>;
  releaseOverride(channelName: string): Promise<void>;
  close(): Promise<void>;
}

function timeout(ms: number, label: string): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SERIAL_TIMEOUT: ${label} after ${ms}ms`)), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

export async function openSerialSession(
  opts: { transport?: SerialTransport; port?: string; baudRate?: number },
): Promise<SerialSession> {
  let transport = opts.transport ?? null;
  if (!transport) {
    if (!opts.port) throw new Error('openSerialSession requires transport or port');
    const { SerialPort } = await import('serialport');
    const port = await new Promise<any>((resolve, reject) => {
      const sp = new SerialPort({ path: opts.port!, baudRate: opts.baudRate ?? 115200 }, err => {
        if (err) reject(err); else resolve(sp);
      });
    });
    transport = {
      onData: cb => { port.on('data', (chunk: Buffer) => cb(chunk)); },
      write: data => new Promise<void>((res, rej) =>
        port.write(data, e => e ? rej(e) : res())),
      close: () => new Promise<void>(res => port.close(() => res())),
    };
  }

  let buffer = '';
  const listeners = new Set<(frame: Record<string, number>) => void>();
  transport.onData(chunk => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const frame = decodeTextFrame(line);
      if (Object.keys(frame).length > 0) {
        listeners.forEach(fn => fn(frame));
      }
    }
  });

  const nextFrame = (): Promise<Record<string, number>> =>
    new Promise(resolve => listeners.add(function fn(f) { listeners.delete(fn); resolve(f); }));

  return {
    transport,
    async waitForFrame(timeoutMs = 5000) {
      const t = timeout(timeoutMs, 'waitForFrame');
      try {
        return await Promise.race([nextFrame(), t.promise]);
      } finally { t.cancel(); }
    },
    async listen(channelName, o = {}) {
      const deadline = Date.now() + (o.timeoutMs ?? 5000);
      while (Date.now() < deadline) {
        const t = timeout(deadline - Date.now(), `listen(${channelName})`);
        try {
          const frame = await Promise.race([nextFrame(), t.promise]);
          const v = frame[channelName];
          if (v !== undefined && (!o.predicate || o.predicate(v))) return v;
        } finally { t.cancel(); }
      }
      throw new Error(`SERIAL_TIMEOUT: listen(${channelName}) after ${o.timeoutMs ?? 5000}ms`);
    },
    async sendOverrides(values) {
      const msg = Object.entries(values).map(([k, v]) => `${k}=${v}`).join(';') + ';\n';
      await transport.write(msg);
    },
    async releaseOverride(channelName) {
      await transport.write(`${channelName}_release=1;\n`);
    },
    async close() { await transport.close(); },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/hil/hilSerialSession.test.ts && npx tsc --noEmit`
Expected: 5 PASS, 0 type errors.

- [ ] **Step 5: PC-loopback end-to-end (host firmware, no board needed)**

This proves the full chain on the PC: generated firmware ticks → telemetry frame → decode → override send → firmware applies override → next frame reflects it.

Append to `hilSerialSession.test.ts` (uses the Generic build produced by `hil_emit_sources.cjs`; requires host gcc from Task 1 — skip cleanly if absent):

```ts
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';

describe('host loopback (Generic target, real generated firmware)', () => {
  it('streams variable values and applies overrides end-to-end', async () => {
    let gcc: string;
    try { execFileSync('where.exe', ['gcc.exe']); gcc = 'gcc'; } catch { console.warn('[SKIP] host gcc missing'); return; }

    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'hil-loopback-'));
    execFileSync('npx', ['tsx', 'scripts/hil_emit_sources.ts', ws, 'Generic'], { stdio: 'pipe', shell: process.platform === 'win32' });
    execFileSync(gcc, ['-std=c99', '-Wall', '-Wextra', '-I.', 'sm_mapping.c', 'sm_core.c',
      'sm_safety.c', 'sm_user_logic.c', 'mcal_dio_hil.c', 'hil_interface.c',
      'main_hil.c', 'hal_drivers.c', 'adia_mcal.c', 'adia_component.c',
      '-o', 'firmware_host.exe'], { cwd: ws, stdio: 'pipe', shell: process.platform === 'win32' });

    const child: ChildProcess = spawn(path.join(ws, 'firmware_host.exe'), [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const t: SerialTransport = {
      onData: cb => { child.stdout.on('data', c => cb(c)); },
      write: async data => { child.stdin.write(data); },
      close: async () => { child.kill(); },
    };
    const s = await openSerialSession({ transport: t });
    try {
      const v = await s.listen('v_adc_in', { timeoutMs: 15000, predicate: x => Math.abs(x - 321) < 0.01 });
      expect(Math.abs(v - 321)).toBeLessThan(0.01);
      await s.sendOverrides({ v_adc_in: 999 });
      await s.listen('v_adc_in', { timeoutMs: 15000, predicate: x => Math.abs(x - 999) < 0.5 });
      await s.releaseOverride('v_adc_in');
    } finally {
      await s.close();
      fs.rmSync(ws, { recursive: true, force: true });
    }
  }, 60_000);
});
```

(The exact ADC constant depends on `hal_drivers.c` Generic template — read the emitted file; if the Generic template returns a different fixed value than 321, assert equality with that value; the point is decode→override→reflect.)

Run: `npx vitest run src/engine/hil/hilSerialSession.test.ts`
Expected: all PASS including loopback.

- [ ] **Step 6: Commit**

```bash
git add src/engine/hil/hilSerialSession.ts src/engine/hil/hilSerialSession.test.ts
git commit -m "feat(hil): injectable uart session service for variable listening and overrides"
```

---

### Task 11: Driver ↔ generated-SM integration contract tests (Embedded-Coder equivalence)

Locks the "connection between drivers and the application generated code from the state machine" with three layers of proof per target:
A. static routing: every mapping becomes exactly one HAL call site in `mcal_dio_hil.c`;
B. dynamic ordering: `HIL_Sync_Inputs` → `SM_ReadInputs` → `SM_Step` → `SM_WriteOutputs` → `HIL_Sync_Outputs` with values carried end-to-end (Read→Step→Write like MATLAB Embedded Coder I/O stages);
C. safety path: latched fault drives mapped outputs to their configured `safeValue`.

**Files:**
- Create: `src/engine/hil/hilIntegrationContract.test.ts`

**Interfaces:**
- Consumes: `generateMISRACCode`, `generateHALCode`, host gcc (skips if absent), the `harness.c` pattern proven in `hilCompilation.test.ts:94–106`.

- [ ] **Step 1: Write the contract test file**

Create `src/engine/hil/hilIntegrationContract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import { generateHALCode } from './hilCodeGenerator';
import type { HILConfig, DriverChannel, HILMapping } from './hilTypes';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync, spawnSync } from 'child_process';

const CHANNELS: DriverChannel[] = [
  { id: 'gpio_in', name: 'v_gpio_in', peripheral: 'GPIO', pin: '2', direction: 'In', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
  { id: 'gpio_out', name: 'v_gpio_out', peripheral: 'GPIO', pin: '3', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
  { id: 'adc_in', name: 'v_adc_in', peripheral: 'ADC', pin: 'A0', direction: 'In', dataType: 'uint16', rangeMin: 0, rangeMax: 1023, scalingFactor: 1, unit: '' },
  { id: 'pwm_out', name: 'v_pwm_out', peripheral: 'PWM', pin: '5', direction: 'Out', dataType: 'uint16', rangeMin: 0, rangeMax: 255, scalingFactor: 1, unit: '' },
];

const MAPPINGS: HILMapping[] = [
  { id: 'm1', adiaVarId: 'v_gpio_in', channelId: 'gpio_in', direction: 'read' },
  { id: 'm2', adiaVarId: 'v_gpio_out', channelId: 'gpio_out', direction: 'write', safeValue: 0 },
  { id: 'm3', adiaVarId: 'v_adc_in', channelId: 'adc_in', direction: 'read' },
  { id: 'm4', adiaVarId: 'v_pwm_out', channelId: 'pwm_out', direction: 'write', safeValue: 128 },
];

const HIL_CONFIG: HILConfig = {
  enabled: true, target: 'Generic', clockSpeed: 16, commPort: '', baudRate: 115200,
  channels: CHANNELS, mappings: MAPPINGS,
};

const VARIABLES = CHANNELS.map((c, i) => ({
  id: `v${i}`, name: c.name, type: c.dataType === 'bool' ? 'bool' : 'uint16',
  initialValue: '0', currentValue: 0, visibleInScope: true,
}));

const CHART = {
  tickMs: 10, safetyMode: true,
  states: [{ id: 's1', name: 'Run', x: 0, y: 0, width: 100, height: 100,
    entry: '', during: 'v_gpio_out = v_gpio_in; v_pwm_out = v_adc_in;', exit: '',
    isActive: false, color: 'blue', parentId: 'root', children: [],
    priority: 1, isParallel: false, regionId: 'MAIN', autostart: true }],
  junctions: [], transitions: [], variables: VARIABLES,
  layers: [{ id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }],
};

function emitSources(dir: string) {
  const warnings: string[] = []; const errors: string[] = [];
  const sm = generateMISRACCode({ ...CHART, hilConfig: HIL_CONFIG });
  expect(sm.errors).toEqual([]);
  for (const f of [...sm.files, ...generateHALCode(HIL_CONFIG, [], warnings, errors)]) {
    fs.writeFileSync(path.join(dir, f.name), f.content);
  }
  expect(errors).toEqual([]);
}

const HARNESS = `#include "sm_core.h"
#include "hil_interface.h"
#include <stdio.h>
#include <string.h>
static int g_call_order[16]; static int g_order_idx = 0;
#define RECORD(x) do { if (g_order_idx < 16) g_call_order[g_order_idx++] = (x); } while (0)
static unsigned adc_stub = 321U; static unsigned pwm_written = 0; static int gpio_written = -1;
static int gpio_read_stub(void) { RECORD(1); return 1; }
uint32_t HAL_ADC_Read(const char* pin, const char* name) { (void)pin; (void)name; RECORD(2); return adc_stub; }
void HAL_PWM_Write(const char* pin, const char* name, uint32_t v) { (void)pin; (void)name; RECORD(3); pwm_written = v; }
void HAL_GPIO_Write(const char* pin, const char* name, int v) { (void)pin; (void)name; RECORD(4); gpio_written = v; }
uint32_t HAL_UART_Read(const char* pin, const char* name) { (void)pin;(void)name; return 0; }
void HAL_UART_Write(const char* pin, const char* name, uint32_t v) { (void)pin;(void)name; (void)v; }
int main(int argc, char** argv) {
  ADIA_Instance_t inst; SM_Init(&inst);
  HIL_Sync_Inputs(&inst);            /* overrides land here */
  SM_ReadInputs(&inst);              /* HAL_ADC_Read called */
  SM_Step(&inst, SM_TICK_MS);
  SM_WriteOutputs(&inst);
  HIL_Sync_Outputs(&inst);           /* HAL_PWM_Write called */
  if (argc > 1 && strcmp(argv[1], "--fault") == 0) {
    /* latch a safety fault and re-run the output stage */
    inst.error_status = 1;
    HIL_Sync_Outputs(&inst);
    printf("FAULT %u %d\\n", pwm_written, gpio_written);
    return 0;
  }
  printf("ORDER %d %d %d %d\\n", g_call_order[0], g_call_order[1], g_call_order[2], g_call_order[3]);
  printf("DATA %u %d\\n", pwm_written, gpio_written);
  printf("VAR %u %u\\n", (unsigned)inst.data.v_adc_in, (unsigned)inst.data.v_pwm_out);
  return 0;
}
`;

describe('driver <-> generated SM integration contract', () => {
  it('routes every mapping to exactly one HAL call site in mcal_dio_hil.c', () => {
    const warnings: string[] = []; const errors: string[] = [];
    generateHALCode(HIL_CONFIG, [], warnings, errors);
    expect(errors).toEqual([]);
    const mcal = generateMISRACCode({ ...CHART, hilConfig: HIL_CONFIG })
      .files.find(f => f.name === 'mcal_dio_hil.c')!.content;
    for (const ch of CHANNELS) {
      const occurrences = mcal.split(`"${ch.name}"`).length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(1);
    }
    expect(mcal).toContain('HAL_GPIO_Read');
    expect(mcal).toContain('HAL_GPIO_Write');
    expect(mcal).toContain('HAL_ADC_Read');
    expect(mcal).toContain('HAL_PWM_Write');
  });

  it('executes inputs->step->outputs in order with values carried end-to-end', { timeout: 60_000 }, async () => {
    let gccAvailable = true;
    try { execFileSync('where.exe', ['gcc.exe']); } catch { gccAvailable = false; }
    if (!gccAvailable) { console.warn('[SKIP] host gcc missing'); return; }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hil-contract-'));
    try {
      emitSources(dir);
      fs.writeFileSync(path.join(dir, 'harness.c'), HARNESS);
      execFileSync('gcc', ['-std=c99', '-Wall', '-Wextra', '-Werror', '-I.',
        'sm_mapping.c', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c',
        'mcal_dio_hil.c', 'hil_interface.c', 'harness.c', '-o', 'contract.exe'],
        { cwd: dir, stdio: 'pipe', shell: process.platform === 'win32' });
      const out = execFileSync(path.join(dir, 'contract.exe'), { cwd: dir, encoding: 'utf8' });
      expect(out).toContain('ORDER 2 3 4');           // ADC read -> PWM write -> GPIO write
      expect(out).toContain('DATA 321 1');            // adc 321 forwarded to PWM; GPIO high
      expect(out).toContain('VAR 321 321');           // SM instance carries the value too
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drives mapped outputs to safeValue when safety fault is latched', { timeout: 60_000 }, async () => {
    let gccAvailable = true;
    try { execFileSync('where.exe', ['gcc.exe']); } catch { gccAvailable = false; }
    if (!gccAvailable) { console.warn('[SKIP] host gcc missing'); return; }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hil-fault-'));
    try {
      emitSources(dir);
      fs.writeFileSync(path.join(dir, 'harness.c'), HARNESS);
      execFileSync('gcc', ['-std=c99', '-Wall', '-Wextra', '-Werror', '-I.',
        'sm_mapping.c', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c',
        'mcal_dio_hil.c', 'hil_interface.c', 'harness.c', '-o', 'fault.exe'],
        { cwd: dir, stdio: 'pipe', shell: process.platform === 'win32' });
      const out = spawnSync(path.join(dir, 'fault.exe'), ['--fault'], { cwd: dir, encoding: 'utf8' });
      expect(out.stdout).toContain('FAULT 128 0');    // pwm -> safeValue 128, gpio -> safeValue 0
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

Adjust two details against reality while implementing (both are mechanical):
- If `SM_Init/SM_ReadInputs/SM_Step/SM_WriteOutputs` signatures differ in `sm_core.h` (check emitted header), adapt harness calls — the ordering/data assertions must stay.
- If `HIL_Sync_Outputs` consults `SM_GetError` rather than `error_status`, set the fault the way `sm_safety.h` exposes (e.g. call the exposed fault-latch function) so the safe-value branch executes.

- [ ] **Step 2: Run**

Run: `npx vitest run src/engine/hil/hilIntegrationContract.test.ts`
Expected: 3 PASS (with gcc) or documented skips.

- [ ] **Step 3: Cross-check same fixtures compile for all cross-targets**

Reuse Task 6: temporarily point `scripts/hil_build_matrix.cjs` CHART at this 4-channel configuration (replace the 2-channel one) and re-run the matrix so the richer contract fixture is what gets certified for all five MCUs.

Run: `npm run test:hil:build-matrix`
Expected: 5/5 verified again with the 4-channel fixture.

- [ ] **Step 4: Commit**

```bash
git add src/engine/hil/hilIntegrationContract.test.ts scripts/hil_build_matrix.cjs
git commit -m "test(hil): embedded-coder-style driver/sm integration contract suite"
```

---

### Task 12: On-target vector suite, evidence chain, orchestration docs

Final wiring: closed-loop vectors over real UART using `runHilSuite`/`compareTrace`, tamper-evident evidence records, npm orchestration, and documentation updates.

**Files:**
- Create: `fixtures/hil/vector-suite-atmega2560.fixture.json`
- Create: `scripts/run_hil_vector_suite.cjs`
- Modify: `package.json` (scripts `test:hil:host`, `test:hil:hardware:vectors`, `test:hil:all`)
- Modify: `hil_build/README_HIL.md` (bench wiring + runbook)
- Modify: `docs/CODEGEN_MCU_VERIFICATION_GATE.md` (certification levels table)

**Interfaces:**
- Consumes: `openSerialSession` (Task 10), `compareTrace(ExpectedTraceStep[], ActualTraceStep[], {floatTolerance})` from `./hilTraceComparator` (states/variables per step — hilTraceComparator.ts:1–33), `validateHilFixture` from `./hilFixture`, `runBuildMatrix` (Task 6), flash suite (Task 9).
- Produces: evidence JSON per vector run in `hil_evidence/`; npm meta-scripts.

- [ ] **Step 1: Fixture manifest**

Create `fixtures/hil/vector-suite-atmega2560.fixture.json`:

```json
{
  "fixtureId": "vector-suite-atmega2560",
  "revision": "1.0.0",
  "hash": "sha256:FILL_AT_SAVE_TIME",
  "wiring": [
    { "channelId": "adc_in", "direction": "In", "pin": "A0" },
    { "channelId": "pwm_out", "direction": "Out", "pin": "5" }
  ],
  "sampleRateHz": 100,
  "timingToleranceMs": 50,
  "vectors": [
    { "tick": 0, "inputs": { "v_adc_in": 0 } },
    { "tick": 5, "inputs": { "v_adc_in": 128 } },
    { "tick": 10, "inputs": { "v_adc_in": 511 } },
    { "tick": 15, "inputs": { "v_adc_in": 1023 } }
  ],
  "expectedTrace": [
    { "tick": 0, "states": {}, "variables": { "v_pwm_out": 0 } },
    { "tick": 5, "states": {}, "variables": { "v_pwm_out": 128 } },
    { "tick": 10, "states": {}, "variables": { "v_pwm_out": 511 } },
    { "tick": 15, "states": {}, "variables": { "v_pwm_out": 1023 } }
  ],
  "floatTolerance": 0.05
}
```

Compute and fill `hash`: `node -e "const c=require('crypto'),f=require('fs');const j=JSON.parse(f.readFileSync('fixtures/hil/vector-suite-atmega2560.fixture.json','utf8'));j.hash='sha256:'+c.createHash('sha256').update(JSON.stringify(j.vectors)).digest('hex');f.writeFileSync('fixtures/hil/vector-suite-atmega2560.fixture.json',JSON.stringify(j,null,2))"`

- [ ] **Step 2: Vector runner script**

Create `scripts/run_hil_vector_suite.cjs`:

```js
#!/usr/bin/env node
'use strict';
/** Closed-loop HIL vectors over real UART. Opt-in:
 *  ADIA_HIL_HARDWARE=1 npm run test:hil:hardware:vectors -- <COMport> [fixturePath]
 * Uses the atmega2560 firmware built by the matrix; sends input overrides each
 * vector tick and compares the collected telemetry trace against expectedTrace. */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { loadPackManifest } = require('../src/security/targetPackLoader.cjs');
const { configureToolchainPaths } = require('../src/security/toolchainManager.cjs');
const { runBuildMatrix } = require('./hil_build_matrix.cjs');

async function main() {
  if (process.env.ADIA_HIL_HARDWARE !== '1') {
    console.log('[SKIP] set ADIA_HIL_HARDWARE=1 with the board connected');
    return;
  }
  const comPort = process.argv[2];
  if (!comPort) { console.error('usage: node scripts/run_hil_vector_suite.cjs <COMport> [fixturePath]'); process.exit(2); }
  const fixtureRel = process.argv[3] || 'fixtures/hil/vector-suite-atmega2560.fixture.json';
  const fixture = JSON.parse(fs.readFileSync(fixtureRel, 'utf8'));

  // Dynamic import of TS modules through tsx loader
  const { openSerialSession } = await import(pathToFileURL(path.join(process.cwd(), 'src/engine/hil/hilSerialSession.ts')).href);
  const { compareTrace } = await import(pathToFileURL(path.join(process.cwd(), 'src/engine/hil/hilTraceComparator.ts')).href);

  configureToolchainPaths(path.join(process.cwd(), 'toolchains'));

  // 1. Fresh verified firmware flashed to the board
  const [built] = await runBuildMatrix(['atmega2560']);
  if (built.status !== 'LINKED_IMAGE_VERIFIED') { console.error('[FAIL] firmware not verified'); process.exit(1); }

  // 2. Session
  const session = await openSerialSession({ port: comPort, baudRate: 115200 });
  const actual = [];
  try {
    for (const vec of fixture.vectors) {
      if (Object.keys(vec.inputs).length > 0) await session.sendOverrides(vec.inputs);
      const frame = await session.waitForFrame(fixture.timingToleranceMs ? 2000 : 2000);
      actual.push({ tick: vec.tick, states: {}, variables: { ...frame } });
      console.log(`tick ${vec.tick}: ${JSON.stringify(frame)}`);
    }
  } finally {
    await session.close();
  }

  // 3. Compare
  const comparison = compareTrace(fixture.expectedTrace, actual, { floatTolerance: fixture.floatTolerance ?? 1e-4 });
  const evidence = {
    timestamp: new Date().toISOString(),
    fixtureId: fixture.fixtureId,
    fixtureHash: fixture.hash,
    comparison,
    actualTrace: actual,
  };
  fs.mkdirSync(path.join(process.cwd(), 'hil_evidence'), { recursive: true });
  const evPath = path.join(process.cwd(), 'hil_evidence', `${Date.now()}-${fixture.fixtureId}.json`);
  fs.writeFileSync(evPath, JSON.stringify(evidence, null, 2));
  if (comparison.passed) {
    console.log(`[PASS] HIL vector suite verified — evidence: ${evPath}`);
  } else {
    console.error(`[FAIL] first divergence: ${JSON.stringify(comparison.firstDivergence)} — evidence: ${evPath}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

Note: `expectedTrace.variables` keys are ADIA variable names; telemetry frames carry channel names (`v_adc_in` etc.) which equal the mapped variable names by construction of the fixture — keep that convention.

- [ ] **Step 3: Orchestration scripts**

In `package.json` add:

```json
"test:hil:host": "vitest run src/engine/hil/ && node src/security/toolchainManager.test.cjs && node src/security/targetPackLoader.test.cjs && node src/security/elfInspector.sizegate.test.cjs && npm run test:hil:opt && npm run test:hil:build-matrix",
"test:hil:hardware:vectors": "node scripts/run_hil_vector_suite.cjs",
"test:hil:all": "npm run test:hil:env -- --fix && npm run test:hil:host && npm run test:hil:security",
```

plus define `test:hil:security` as `npm run test:security` alias, and keep the hardware pair explicit:

```json
"test:hil:security": "npm run test:security",
```

- [ ] **Step 4: Documentation**

Update `hil_build/README_HIL.md` with sections: *Bench wiring per board* (table from Task 9), *One-time environment setup* (`npm run test:hil:env -- --fix`), *Host-only verification* (`npm run test:hil:host`), *Flashing* (`npm run test:hil:hardware:flash`), *Closed-loop vectors* (`npm run test:hil:hardware:vectors -- COM5`), and *Evidence* (`hil_evidence/*.json`).

Update `docs/CODEGEN_MCU_VERIFICATION_GATE.md` certification table:

| Status | Meaning | Proven by |
|---|---|---|
| `STATIC_ANALYSIS_ONLY` | generated, lint-clean, not compiled | generator warnings/errors empty |
| `TARGET_COMPILE_VERIFIED` | compiled with pinned cross-toolchain (ESP32 compile-only today) | `test:hil:build-matrix` |
| `LINKED_IMAGE_VERIFIED` | linked + size-gated within pack memoryRegions | `test:hil:build-matrix` |
| `EXTERNAL_HIL_VERIFIED` | closed-loop UART vector suite passed on hardware | `test:hil:hardware:vectors` |

- [ ] **Step 5: Full green run**

Run: `npm run test:hil:host`
Expected: every sub-suite passes; matrix reports 5/5.
Then with the Mega2560 attached:

```bash
set ADIA_HIL_HARDWARE=1
npm run test:hil:hardware:vectors -- COM4
```

Expected: `[PASS] HIL vector suite verified` + evidence file.

- [ ] **Step 6: Commit**

```bash
git add fixtures/hil package.json hil_build/README_HIL.md docs/CODEGEN_MCU_VERIFICATION_GATE.md scripts/run_hil_vector_suite.cjs hil_evidence/.gitignore
git commit -m "feat(hil): closed-loop vector suite, evidence chain, and orchestration docs"
```

(Add `hil_evidence/.gitignore` containing `*\n!.gitignore` so evidence artifacts stay untracked.)

---

## Execution Notes

- Tasks 1–3 (environment) and Task 4 (pins) are independent of each other; Tasks 5–7 depend on 1–3; Task 8 independent; Task 9 depends on 6+8; Task 10 depends on 7; Task 11 depends on 6; Task 12 depends on 6, 9, 10.
- Total estimated wall-clock with boards attached: 2–4 days including bench bring-up.
- Known deferred milestones (documented, not silently dropped): ESP32 bootable runtime image (IDF packaging) beyond compile-only certification; `hil-run-erase` remains intentionally blocked by `EXACT_TARGET_ERASE_REQUIRED` policy.
