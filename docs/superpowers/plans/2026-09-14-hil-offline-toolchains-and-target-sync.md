# HIL Offline Toolchains and Target Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HIL target selection correct on the first switch and make all supported MCU builds start from verified local toolchains with current Electron output.

**Architecture:** Centralize legacy-to-pack selection in `hilTypes.ts`, centralize all executable discovery and explicit provisioning in `toolchainManager.cjs`, and make `npm start` rebuild before Electron launch. Runtime resolution is offline-only; downloads occur only in the explicit provisioning command.

**Tech Stack:** React 18, TypeScript 5.4, Vitest 4, Node.js CommonJS security services, Electron Forge 7, pinned AVR/ARM/ESP compiler and flash-tool distributions.

## Global Constraints

- Cover STM32F1, STM32F4, Arduino Uno, Arduino Mega, and ESP32.
- Startup and the HIL Build button perform no network installation.
- Preserve SHA-256 verification and safe extraction.
- Preserve unrelated `hil_build/` workspace changes.
- Use test-first red-green cycles for every behavior change.

---

### Task 1: Atomic target and pin-map selection

**Files:**
- Modify: `src/engine/hil/hilTypes.ts`
- Modify: `src/engine/hil/hilTypes.test.ts`
- Modify: `src/components/hil/HILWorkspace.tsx`
- Test: `src/components/hil/HILDriverPanel.test.tsx` or the nearest existing HIL component test

**Interfaces:**
- Produces: `applyLegacyTargetSelection(config: HILConfig, target: TargetMCU): HILConfig`
- Consumes: `LEGACY_TARGET_SELECTIONS`, `applyTargetSelection`, and `TARGET_PIN_MAPS`

- [ ] **Step 1: Write failing engine tests**

Add assertions that switching a config containing the Uno selection to `Arduino_Mega` returns `target === 'Arduino_Mega'` and `targetSelection.targetId === 'atmega2560'`, and switching to `Generic` removes `targetSelection`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run src/engine/hil/hilTypes.test.ts`

Expected: FAIL because `applyLegacyTargetSelection` is not exported.

- [ ] **Step 3: Implement the canonical transition**

Export a function that returns `{ ...config, target, targetSelection: selection ? { ...selection } : undefined }`, using the canonical mapping for the selected legacy target.

- [ ] **Step 4: Wire the top selector and add immediate Mega-pin regression coverage**

Replace the direct `{ ...config, target }` assignment in `HILWorkspace.tsx` with `applyLegacyTargetSelection(config, target)`. Assert that a first switch exposes Mega-only choices such as digital pin `53` and analog pin `A15`, without an Uno round trip.

- [ ] **Step 5: Verify GREEN**

Run: `npx vitest run src/engine/hil/hilTypes.test.ts src/components/hil/HILDriverPanel.test.tsx`

Expected: all focused tests pass.

### Task 2: Deterministic offline executable discovery

**Files:**
- Modify: `src/security/toolchainManager.cjs`
- Modify: `src/security/toolchainManager.test.cjs`
- Modify: build-service tests that currently assume automatic runtime downloads

**Interfaces:**
- Produces: `candidateToolchainDirs()`, `resolveInstalledToolchain(key, options)`, and offline `ensureToolchain(key, dir)` behavior
- Consumes: `TOOLCHAINS`, `FLASH_TOOLS`, `process.resourcesPath`, and repository root

- [ ] **Step 1: Write failing discovery tests**

Cover the existing `avr-gcc/avr-gcc-15.2.0-x64-windows/bin/avr-g++.exe`, packaged `resources/toolchains`, canonical repository layouts, and a missing key error that includes searched paths without calling a downloader.

- [ ] **Step 2: Verify RED**

Run: `node src/security/toolchainManager.test.cjs`

Expected: the legacy AVR layout is reported missing or the runtime attempts the injected downloader.

- [ ] **Step 3: Implement multi-root discovery and offline runtime resolution**

Resolve required executables across packaged, canonical repository, and declared compatibility layouts. Make runtime `ensureToolchain` configure discovered paths or throw `OFFLINE_TOOLCHAIN_MISSING` with the explicit provisioning command.

- [ ] **Step 4: Verify GREEN and build-service compatibility**

Run: `node src/security/toolchainManager.test.cjs && node src/security/hilBuildService.test.cjs`

Expected: all tests pass and no runtime downloader is invoked.

### Task 3: Race-safe explicit provisioning and full inventory

**Files:**
- Modify: `src/security/toolchainManager.cjs`
- Modify: `src/security/toolchainManager.test.cjs`
- Create: `scripts/provision_hil_toolchains.cjs`
- Modify: `scripts/hil_env_doctor.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `provisionToolchain(key, dir, deps)`, `provisionAllRequiredToolchains(dir)`, and `npm run provision:hil`
- Produces inventory for compiler and flash tools mapped to every concrete target

- [ ] **Step 1: Write failing concurrency and inventory tests**

Invoke the same provision key twice concurrently with injected download/extract functions; assert one provisioning operation, unique `.part`/staging names, verified promotion, and cleanup. Assert the required inventory covers all five targets and their compiler/flash keys.

- [ ] **Step 2: Verify RED**

Run: `node src/security/toolchainManager.test.cjs`

Expected: FAIL because provisioning coalescing and the complete inventory do not exist.

- [ ] **Step 3: Implement explicit provisioning**

Use a module-level `Map<string, Promise>` keyed by destination plus tool key. Download to a UUID-suffixed temporary archive, verify before extraction, extract to staging, validate `checkFile`, promote to the declared canonical directory, and clean temporary files in `finally`.

- [ ] **Step 4: Add the all-target command and doctor checks**

Add `provision:hil` to `package.json`. Make the script provision the union of required tools and then run the doctor. Make the doctor print a row per target/tool and exit nonzero on any missing executable.

- [ ] **Step 5: Verify GREEN**

Run: `node src/security/toolchainManager.test.cjs && npm run test:hil:env`

Expected: concurrency tests pass and the doctor reports every required local tool.

### Task 4: Current-source Electron startup and packaged resources

**Files:**
- Modify: `package.json`
- Modify: `forge.config.cjs` only if resource verification reveals missing packaged toolchain content
- Create or modify: `scripts/package_scripts.test.cjs`

**Interfaces:**
- Produces: `npm start` as build-then-launch and `npm run start:prebuilt` as launch-only
- Consumes: `npm run build`, Electron Forge, and `extraResource`

- [ ] **Step 1: Write a failing package-script test**

Parse `package.json` and assert `scripts.start` runs `npm run build` before `electron-forge start`, `start:prebuilt` equals the launch-only command, and `forge.config.cjs` includes the canonical toolchains resource.

- [ ] **Step 2: Verify RED**

Run: `node scripts/package_scripts.test.cjs`

Expected: FAIL because `start` is currently launch-only and `start:prebuilt` is absent.

- [ ] **Step 3: Update scripts minimally**

Set `start` to `npm run build && electron-forge start` and `start:prebuilt` to `electron-forge start`. Keep packaging’s canonical toolchain resource inclusion.

- [ ] **Step 4: Verify GREEN and production build**

Run: `node scripts/package_scripts.test.cjs && npm run build`

Expected: test passes and build exits zero.

### Task 5: Offline MCU build-matrix acceptance

**Files:**
- Modify only if failures expose a root cause: `scripts/hil_build_matrix.cjs`, target manifests, or build recipes
- Do not stage generated `hil_build/` output

**Interfaces:**
- Consumes: local tool inventory and all target build recipes
- Produces: reproducible evidence that supported target builds do not download

- [ ] **Step 1: Run focused regression and type checks**

Run: `node src/security/toolchainManager.test.cjs && npx vitest run src/engine/hil/hilTypes.test.ts src/engine/hil/pinValidator.test.ts && npx tsc --noEmit`

Expected: all commands exit zero.

- [ ] **Step 2: Run offline environment and build matrix**

Run: `npm run test:hil:env && npm run test:hil:build-matrix`

Expected: each of STM32F1, STM32F4, Arduino Uno, Arduino Mega, and ESP32 compiles and links using a local executable, with no download message or network dependency.

- [ ] **Step 3: Run startup smoke verification**

Run `npm start`, observe a successful fresh build and Electron window load, then terminate the smoke-test process cleanly. Confirm the loaded bundle identifies the current build rather than an older `dist` artifact.

- [ ] **Step 4: Audit the final diff**

Run: `git status --short && git diff --check && git diff -- package.json forge.config.cjs src/engine/hil src/components/hil src/security/toolchainManager.cjs scripts`

Expected: no whitespace errors, only task-related source changes, and pre-existing `hil_build/` changes remain unstaged.
