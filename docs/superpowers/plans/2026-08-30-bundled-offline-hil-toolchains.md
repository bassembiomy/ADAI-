# Bundled Offline HIL Toolchains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the entire HIL cross-compilation toolchain and hardware flashing suite (`toolchains/`) directly with the Electron application installer using `extraResource`, enabling immediate, zero-configuration, 100% offline compilation and target programming on any PC.

**Architecture:** Electron Forge is configured with `packagerConfig.extraResource` to bundle the `toolchains/` directory alongside `app.asar` in `resources/toolchains`. `toolchainManager.cjs` and `src/main.cjs` resolve `process.resourcesPath/toolchains` first when packaged, auto-adding all binaries to `process.env.PATH` and resolving compilers/flashers without internet or manual setup.

**Tech Stack:** Node.js, Electron, Electron Forge, Vitest / Node test runner.

## Global Constraints
- All binaries must reside outside `app.asar` in `resources/toolchains` to allow Windows process spawning (`spawn`).
- Resolution hierarchy: 1. `process.resourcesPath/toolchains` (packaged) -> 2. `process.cwd()/toolchains` (dev) -> 3. `%APPDATA%/adia/toolchains` -> 4. System `PATH`.
- Must pass all security verifications, tests, and environment doctor checks.

---

### Task 1: Update Toolchain Directory Resolution in `toolchainManager.cjs` and Add Tests

**Files:**
- Modify: `src/security/toolchainManager.cjs`
- Modify: `src/security/toolchainManager.test.cjs`

**Interfaces:**
- Consumes: `process.resourcesPath`, `TOOLCHAINS`, `FLASH_TOOLS`
- Produces: `defaultToolchainsDir(): string`, `resolveToolExecutable(name, toolchainsDir): string | null`

- [ ] **Step 1: Write the unit test for bundled `process.resourcesPath` resolution**

Add tests to `src/security/toolchainManager.test.cjs`:
```javascript
// Test: defaultToolchainsDir prioritizes process.resourcesPath when present
const originalResourcesPath = process.resourcesPath;
const fakeResources = path.join(__dirname, '../../scratch/fake-resources');
const fakeToolchains = path.join(fakeResources, 'toolchains');
fs.mkdirSync(fakeToolchains, { recursive: true });

process.resourcesPath = fakeResources;
const detectedDir = defaultToolchainsDir();
assert.equal(detectedDir, fakeToolchains);

// Cleanup
process.resourcesPath = originalResourcesPath;
fs.rmSync(fakeResources, { recursive: true, force: true });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/security/toolchainManager.test.cjs`
Expected: FAIL (assertion fails or `defaultToolchainsDir` does not check `process.resourcesPath`).

- [ ] **Step 3: Update `src/security/toolchainManager.cjs`**

Update `defaultToolchainsDir` and `resolveToolExecutable`:
```javascript
function defaultToolchainsDir() {
  if (process.resourcesPath) {
    const bundledPath = path.join(process.resourcesPath, 'toolchains');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
  }
  return path.join(process.cwd(), 'toolchains');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/security/toolchainManager.test.cjs`
Expected: PASS — `toolchainManager tests passed!`

---

### Task 2: Update Main Electron Process Toolchain Path Discovery in `src/main.cjs`

**Files:**
- Modify: `src/main.cjs:37-46`

**Interfaces:**
- Consumes: `app.isPackaged`, `process.resourcesPath`, `app.getPath('userData')`, `toolchainManager.cjs`
- Produces: `getToolchainsDir(): string`

- [ ] **Step 1: Update `getToolchainsDir()` in `src/main.cjs`**

```javascript
function getToolchainsDir() {
  if (app.isPackaged && process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, 'toolchains');
    if (fs.existsSync(bundled)) return bundled;
    return path.join(app.getPath('userData'), 'toolchains');
  }
  return path.join(process.cwd(), 'toolchains');
}
```

- [ ] **Step 2: Verify `src/security/hilBuildService.test.cjs` and `src/security/hilFlashService.test.cjs` pass**

Run: `npm run test:security`
Expected: PASS — all security unit tests pass.

---

### Task 3: Configure Electron Forge `extraResource` in `forge.config.cjs`

**Files:**
- Modify: `forge.config.cjs:5-18`

**Interfaces:**
- Consumes: `path.resolve(__dirname, 'toolchains')`
- Produces: `packagerConfig.extraResource` array bundling `toolchains/` directory outside ASAR.

- [ ] **Step 1: Update `forge.config.cjs` to include `extraResource`**

Add `extraResource` to `packagerConfig`:
```javascript
  packagerConfig: {
    executableName: 'ADIA',
    asar: true,
    asarIntegrity: true,
    icon: path.resolve(__dirname, 'icon.ico'),
    extraResource: [
      path.resolve(__dirname, 'toolchains'),
    ],
    win32metadata: {
      CompanyName: 'ADIA Team',
      FileDescription: 'ADIA Engineering Suite',
      ProductName: 'ADIA',
      InternalName: 'ADIA',
    },
    // ...
```

- [ ] **Step 2: Validate forge config syntax and environment doctor**

Run: `npm run test:hil:env`
Expected: PASS

---

### Task 4: End-to-End Verification of Bundled Environment and Packaging Smoke Check

**Files:**
- Test: `scripts/hil_env_doctor.cjs`
- Verify: Full HIL build matrix and security test suites

- [ ] **Step 1: Run HIL environment doctor check**

Run: `npm run test:hil:env`
Expected: All compiler toolchains and flashers reported `[ OK ]`.

- [ ] **Step 2: Run all HIL and security suites**

Run: `npm run test:security && npm run test:hil:build-matrix`
Expected: PASS
