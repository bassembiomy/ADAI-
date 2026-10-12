# Self-Contained Install & Real-Target HIL Builds — Implementation Plan

Goal: installing `ADIA Setup.exe` on any Windows x64 PC (online or air-gapped) gives working code generation,
HIL compile, and HIL flashing for Generic, Arduino Uno/Mega and STM32F1/F4 with no manual downloads.
ESP32: generation stays; build/flash is blocked with a clear message (follow-up).

Decisions (user, 2026-10-12): bundle toolchains in the installer; ship official STM32Cube HAL; ESP32 later.

## Findings this plan fixes
1. HIL files are written to / compiled in `process.cwd()/hil_build` (`main.cjs` ~542, 669, 965, 1270). Installed apps have an
   arbitrary, possibly read-only cwd.
2. `target-packs/` (STM32 startup + linker scripts, manifests) is not packaged.
3. HIL workspace generates with `includeTestShims: true` (`HILWorkspace.tsx:166,257`), so the **mock** `stm32f4xx_hal.h`
   (`STM32_MOCK_HAL_H`, every HAL call a no-op) ends up in the real STM32 build. `hil-run-compile` builds STM32 without
   startup file / linker script → the image has no vector table and cannot boot.
4. `toolchains/` is gitignored and nothing reproducibly populates it before `npm run make`; hashes are not pinned
   for all archives; ARM GCC URL (developer.arm.com) is not reachable from CI-like environments.
5. Native `serialport` binding lives inside `app.asar`.
6. Squirrel installer is per-user/no-elevation and re-extracts the full app per update — unsuitable for ~1 GB of toolchains.

---

## Part 1 — Runtime paths & toolchain resolution  (executor A)
Files: `src/main.cjs`, `src/security/toolchainManager.cjs` (+ test), new `src/security/appPaths.cjs` (+ test).

1.1 New pure module `appPaths.cjs` exporting `resolveAppPaths({ isPackaged, resourcesPath, userDataPath, cwd })` →
```
{ bundledToolchainsDir: isPackaged ? <resources>/toolchains : <cwd>/toolchains,
  userToolchainsDir:   <userData>/toolchains,          // writable: repair downloads
  targetPacksDir:      isPackaged ? <resources>/target-packs : <cwd>/target-packs,
  vendorDir:           isPackaged ? <resources>/vendor : <cwd>/vendor,
  hilBuildDir:         <userData>/hil_build }          // ALWAYS writable, never cwd
```
   Unit-test both packaged and dev shapes (no Electron needed).
1.2 `main.cjs`: replace every `process.cwd()` HIL path with `appPaths` values (save files, compile, flash, Generic exe
   launch, `getToolchainsDir`). Never `mkdirSync` inside `resourcesPath`.
1.3 Tool resolution order (toolchainManager `resolveToolExecutable` / `configureToolchainPaths`): bundled dir →
   user dir → system PATH. Downloads (repair path) go **only** to `userToolchainsDir`.
1.4 Startup: if bundled toolchains are complete, do NOT background-download anything. If a required toolchain is
   missing/corrupt, download into the user dir (existing behaviour) **with SHA-256 verification against the lock file
   (Part 2)**; refuse to use an archive whose hash mismatches.
1.5 New IPC `hil-env-status` returning per-target readiness `{ target, compiler: {ok, path, version}, flasher: {...},
   halAvailable (STM32), blockedReason? }` computed with the same resolver (reuse logic from
   `scripts/hil_env_doctor.cjs` — move the shared part into a `.cjs` module rather than duplicating). Add the channel to
   the preload allowlist.
1.6 ESP32: `hil-run-compile` and flash for ESP32 return `{ success:false, code:'TARGET_NOT_YET_SUPPORTED', error:'ESP32
   build/flash requires the ESP32 SDK, which is not bundled yet.' }` before invoking any tool.

## Part 2 — Pinned, verified toolchain bundle  (executor A)
Files: new `toolchains.lock.json` (repo root), new `scripts/fetch_toolchains.cjs` (+ `scripts/fetch_toolchains.test.cjs`
for pure parts), `src/security/toolchainManager.cjs`, `package.json` scripts, target-pack manifests' `pinnedToolchains`.

2.1 `toolchains.lock.json` is the single source of truth: for each key (`Generic` w64devkit 1.23.0, `Arduino` avr-gcc
   15.2.0-1, `STM32` **xpack arm-none-eabi-gcc 13.3.1-1.1 win32-x64** (GitHub; sha256
   `49cda1bf01215f3df0613972d21f9fec3eb79dca82506365e7da2ff74b921733`), `avrdude` 8.0, `openocd` xpack 0.12.0-3)
   record `url`, `sha256`, `archiveRoot`/`binDir`, `cmd`. Compute missing hashes by downloading the archive in this
   environment (`sha256sum`) — do NOT invent hashes. If an archive cannot be downloaded here, set `"sha256": null` and
   list it in the report; fetch must then refuse that entry unless `--allow-unpinned` is passed.
   ESP32 entries (xtensa gcc, esptool) are kept in the lock file with `"bundle": false`.
2.2 `toolchainManager.cjs` reads `TOOLCHAINS`/`FLASH_TOOLS` from the lock file (keep exported names/shape so existing
   callers and tests keep working) and verifies SHA-256 after every download before extraction.
2.3 `scripts/fetch_toolchains.cjs`: downloads every `bundle:true` entry into `toolchains/<key>/` (idempotent; skips when
   a `.complete` marker with matching sha exists), verifies hashes, extracts, then calls the STM32Cube fetch (Part 3.1).
   `npm run fetch:toolchains`; `make` and `package` scripts run it first (`"make": "npm run fetch:toolchains && npm run build && electron-forge make"`).
2.4 Update STM32 target-pack manifests `pinnedToolchains` to `arm-none-eabi-gcc 13.3.1`. Do not change asset hashes
   unless the asset changes (if you change startup/linker files, recompute their sha256 in the manifest).

## Part 3 — Real STM32 firmware with STM32Cube HAL  (executor B)
Files: new `scripts/fetch_stm32cube.cjs`, new `stm32cube.lock.json`, `src/engine/hil/hilDriverTemplates.ts`,
`src/engine/hil/hilCodeGenerator.ts`, `src/utils/stateMachineCodeGenerator.ts` (STM32 section only),
`src/components/hil/HILWorkspace.tsx` (only the `includeTestShims` call sites), new `src/security/stm32FirmwareBuild.cjs`
(+ `.test.cjs`), `target-packs/stm32f*/` (startup/linker only if required), tests under `src/engine/hil/`.

3.1 `stm32cube.lock.json` pins git repos by tag **and commit SHA**: `STMicroelectronics/stm32f1xx-hal-driver`,
   `stm32f4xx-hal-driver`, `cmsis-device-f1`, `cmsis-device-f4`, `cmsis-core` (or `cmsis_core`) — use `git ls-remote` to
   get the SHAs. `fetch_stm32cube.cjs` shallow-clones each at the pinned commit into `vendor/stm32cube/<repo>/`, verifies
   `git rev-parse HEAD` equals the pin, keeps only `Inc/`, `Src/`, `Include/`, license files (drop docs/examples to save
   space). `vendor/` is gitignored. Include the BSD-3/Apache licence files in the bundle.
3.2 Generated production STM32 projects (no test shims) must contain everything else the real HAL needs:
   `stm32f4xx_hal_conf.h` / `stm32f1xx_hal_conf.h` enabling only the used modules (GPIO, UART, ADC, DAC (F4), TIM, SPI,
   I2C, RCC, FLASH, PWR, CORTEX, DMA as required by those), `system_stm32f4xx.c`/`system_stm32f1xx.c` taken from the
   vendored CMSIS device template (copied at build time, not generated), `SysTick_Handler` → `HAL_IncTick()`,
   `HAL_Init()` + a default `SystemClock_Config()` (HSI-based, documented; F4: 16 MHz HSI → no PLL is acceptable for v1),
   and the MSP init for the UART pins used by HIL (GPIO AF config + clock enable) — the templates already contain most of
   the per-peripheral init; make sure nothing references mock-only symbols.
3.3 `HILWorkspace.tsx`: generate with `includeTestShims: false` for STM32 and Arduino real-target builds. Test shims stay
   for host/test builds only (existing tests keep `includeTestShims: true`). Check that Arduino builds still get the
   register-level `Arduino.h/.cpp` they need (those are real AVR implementations, not mocks — if they are only emitted as
   "test shims", split them so the real-target ones are always emitted for Arduino).
3.4 `stm32FirmwareBuild.cjs` (pure, no Electron): `stm32CompileInvocation({ target, buildDir, vendorDir, targetPacksDir,
   compiler })` → `{ executable, args, cwd }` that compiles generated sources + required HAL `Src/*.c` files + system file
   + target-pack startup, links with the target-pack linker script, `-ffunction-sections -fdata-sections
   -Wl,--gc-sections --specs=nano.specs --specs=nosys.specs`, correct `-mcpu/-mfloat-abi/-mfpu`, `-DSTM32F407xx` /
   `-DSTM32F103xB`, `-DUSE_HAL_DRIVER`, include dirs for HAL/CMSIS. Output `adia_hil.elf`. Reuse
   `src/security/hilBuildRecipes.cjs` where sensible (it already models startup/linker) instead of duplicating flags.
   Executor A wires this into `hil-run-compile` (contract below).
3.5 Verification in this Linux environment: download the **linux-x64** xpack arm-none-eabi-gcc 13.3.1-1.1 into the
   scratchpad, run the fetch script, generate STM32F4 and STM32F1 HIL projects (with UART + GPIO + ADC channels) via the
   generator, compile with `stm32CompileInvocation`, and assert in a test (skipped when the toolchain env var
   `ADIA_ARM_GCC` is unset): link succeeds with `-Wall -Wextra` and no undefined symbols; `arm-none-eabi-objdump -h`
   shows `.isr_vector` at `0x08000000`; the first vector word is the stack pointer inside RAM; `arm-none-eabi-nm` shows
   no `STM32_MOCK`/stub symbols and does show `HAL_UART_Init`, `HAL_Init`, `SysTick_Handler`.

### Contract between executors
`require('./security/stm32FirmwareBuild.cjs').stm32CompileInvocation(opts)` exactly as in 3.4; returns an object or
throws `Error` with a `code` property (`STM32_HAL_MISSING`, `TARGET_PACK_MISSING`). Executor A calls it from
`hil-run-compile` for STM32 targets with `appPaths` values. Executor B must create the file; executor A may create a
temporary stub with the same signature only if B's file does not exist yet — B's version wins.

## Part 4 — Packaging & installer  (executor A)
Files: `forge.config.cjs`, `package.json`, `.gitignore`.

4.1 `extraResource`: `toolchains`, `target-packs`, `vendor`, `icon.ico` (+ `drivers` if present, see 4.4).
4.2 `asar: { unpack: '**/*.node' }` (keep `asarIntegrity`), so the serialport native binding is unpacked.
4.3 Replace `@electron-forge/maker-squirrel` with an NSIS maker for Electron Forge (e.g.
   `@felixrieseberg/electron-forge-maker-nsis`; pick a maintained one, pin an exact version and check it supports
   `oneClick:false`, `perMachine`, `allowElevation`). Config: per-machine install to Program Files, allow choosing
   directory, desktop + start-menu shortcuts, keep `.adia` file association. Keep `maker-zip`. Remove now-unused squirrel
   startup handling only if it is purely Squirrel-specific (`electron-squirrel-startup`) — keep the code path harmless.
   This cannot be built on Linux here: validate config shape with `node -e "require('./forge.config.cjs')"` and document
   the Windows build steps.
4.4 USB drivers: add NSIS custom step that, if `resources/drivers/*.inf` exist, runs
   `pnputil /add-driver "<dir>\*.inf" /subdirs /install` (elevated). Do NOT download or commit any vendor driver; add
   `drivers/README.md` explaining which drivers (ST-Link, CP210x, CH340) the release engineer may place there after
   checking each vendor's redistribution licence. Windows 10/11 inbox drivers already cover Arduino Uno/Mega (usbser).
4.5 `.gitignore`: `toolchains/`, `vendor/`, `drivers/*` except `drivers/README.md`.
4.6 Add `docs/RELEASE_BUILD.md`: exact steps on a Windows build machine: `npm ci` → `npm run fetch:toolchains` →
   `npm run make` → smoke test checklist (fresh VM, offline: generate + compile + flash Arduino Uno and STM32F4 Discovery).

## Part 5 — First-run readiness UI  (executor A)
Files: `src/components/hil/HILWorkspace.tsx` (status panel only — executor B owns the `includeTestShims` lines; coordinate
by keeping edits in separate hunks), or a new small component `src/components/hil/HILEnvironmentStatus.tsx`.
5.1 Show per-target readiness from `hil-env-status` (OK / missing tool / ESP32 not yet supported). Disable Compile/Flash
   buttons with the reason when not ready.

---

## Verification (each executor reports)
- `npx vitest run src/engine/hil src/components/hil src/utils/stateMachine src/utils/stateMachineCodeGenerator.test.ts`
  → no new failures vs the 9 known toolchain-absent failures.
- `npm run -s test:security` plus every new `.test.cjs`.
- `npx tsc --noEmit -p .` → only the 2 known `xlsx` errors.
- B: the STM32F4/F1 real-HAL link test from 3.5 passes with `ADIA_ARM_GCC` pointing at the linux xpack gcc.
- A: `node -e "require('./forge.config.cjs')"`; `node scripts/fetch_toolchains.cjs --dry-run` prints each entry with its
  pinned hash; a hash mismatch test proves refusal.
- Out of scope / cannot be verified here: building the Windows installer, flashing physical boards.
