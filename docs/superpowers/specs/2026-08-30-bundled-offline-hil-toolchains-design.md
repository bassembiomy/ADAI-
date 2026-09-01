# Bundled Offline HIL Toolchains Design Specification

## Overview
ADIA requires cross-compilation toolchains (`gcc`, `avr-gcc`, `arm-none-eabi-gcc`, `xtensa-esp32-elf-gcc`) and hardware flashing utilities (`avrdude`, `openocd`, `esptool`) for Hardware-in-the-Loop (HIL) firmware generation and target device programming.

This design specifies packaging the entire toolchain suite directly into the application distribution installer (`ADIA Setup.exe` via Electron Forge) using Electron's `extraResource` mechanism. This ensures that any installation on a target PC—whether connected to the internet or fully air-gapped/offline—has immediate out-of-the-box build, flash, and verification capabilities without requiring manual downloads or external dependencies.

---

## Requirements

1. **Self-Contained Installer**:
   - `npm run make` MUST produce an installer containing all required compiler toolchains and flasher binaries.
   - Binaries must exist outside `app.asar` in the unpacked `resources/toolchains` directory so the Windows kernel can directly execute `.exe` binaries and spawn child processes.

2. **Resolution Hierarchy**:
   When resolving toolchains and flasher paths, the system MUST check locations in the following prioritized order:
   1. **Bundled Resources**: `path.join(process.resourcesPath, 'toolchains')` (active in packaged production builds).
   2. **Workspace Local**: `path.join(process.cwd(), 'toolchains')` (active during local development/testing).
   3. **User AppData**: `path.join(app.getPath('userData'), 'toolchains')` (user-installed updates/custom toolchains).
   4. **Host System PATH**: Global binaries found via `where.exe`/`which`.

3. **Zero-Configuration Startup**:
   - Upon application startup, `configureToolchainPaths()` automatically registers all bundled bin directories into `process.env.PATH`.
   - Compiling and flashing in the HIL module works immediately without requiring internet access or manual environment variable configuration.

---

## Architectural Changes

### 1. Electron Forge Packaging Configuration (`forge.config.cjs`)
- Add `extraResource: ['./toolchains']` to `packagerConfig`.
- Ensure `toolchains` is preserved in the build output under `resources/toolchains`.
- Maintain ASAR integrity and exclude raw source directories while shipping executable toolchains side-by-side in `resources/`.

```javascript
packagerConfig: {
  executableName: 'ADIA',
  asar: true,
  asarIntegrity: true,
  extraResource: [
    path.resolve(__dirname, 'toolchains')
  ],
  // ...
}
```

### 2. Toolchain Manager (`src/security/toolchainManager.cjs`)
- Update `defaultToolchainsDir()` to automatically detect `process.resourcesPath`:
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
- Update `resolveToolExecutable()` to iterate through bundled paths, AppData paths, workspace paths, and system PATH.

### 3. Main Process Directory Resolution (`src/main.cjs`)
- Update `getToolchainsDir()` in `src/main.cjs` to align with `toolchainManager.cjs`:
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

---

## Verification & Testing Plan

1. **Unit Tests (`src/security/toolchainManager.test.cjs`)**:
   - Test directory resolution when `process.resourcesPath` contains `toolchains`.
   - Test fallback to `process.cwd()` in development mode.
   - Test fallback to `userData` when extra resources are not present.
   - Test `configureToolchainPaths()` correctly populates `process.env.PATH` from the bundled directory.

2. **Integration Verification (`scripts/hil_env_doctor.cjs`)**:
   - Verify `hil_env_doctor.cjs` reports all compilers and flashers as `[ OK ]` when pointed at the bundled resources directory.

3. **Packaging Build Verification**:
   - Run `npm run package` and verify that `out/ADIA-win32-x64/resources/toolchains` contains the complete binary tree (`gcc`, `avr-gcc`, `arm-gcc`, `xtensa-esp-elf`, `flashers`).
