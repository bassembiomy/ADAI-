# Building the ADIA Windows installer

Result: `ADIA Setup.exe`, a per-machine NSIS installer (Program Files, UAC elevation, selectable install directory,
desktop + Start-menu shortcuts, `.adia` file association) that bundles every toolchain needed for code generation,
HIL compile and HIL flashing of Generic, Arduino Uno/Mega and STM32F1/F4 targets. It works offline.
ESP32 code generation works; ESP32 build/flash is blocked with `TARGET_NOT_YET_SUPPORTED` until the ESP32 SDK is bundled.

The installer can only be built on **Windows x64** (NSIS target). The steps below cannot be run on Linux/macOS.

## Prerequisites

- Windows 10/11 x64 build machine with internet access (needed only for the fetch step)
- Node.js >= 20 and npm >= 10
- Git (used by the STM32Cube HAL fetch)
- Optional: code-signing certificate; USB drivers under `drivers/` (see `drivers/README.md`)

## Steps

```powershell
npm ci
npm run fetch:toolchains    # or `node scripts/fetch_toolchains.cjs --dry-run` to preview
npm run make
```

1. `npm ci` installs the exact dependency tree (including `@felixrieseberg/electron-forge-maker-nsis@7.2.0`).
2. `npm run fetch:toolchains` reads `toolchains.lock.json` (single source of truth), downloads every entry with
   `"bundle": true` into `toolchains/`, **verifies each archive's SHA-256 before extracting**, and then runs
   `scripts/fetch_stm32cube.cjs` to vendor the pinned official STM32Cube HAL/CMSIS sources into `vendor/stm32cube/`.
   It is idempotent: an entry whose `.complete-<key>` marker already records the pinned hash is skipped.
   A hash mismatch, or an entry with `"sha256": null`, aborts the build (`--allow-unpinned` overrides the latter for experiments only).
3. `npm run make` runs `fetch:toolchains` again (no-op), builds the app, and runs Electron Forge. Output:
   `out/make/nsis/x64/ADIA Setup.exe` (plus the zip maker output).

`npm run make` and `npm run package` both fail if `toolchains/` or `vendor/` is missing, so an installer without
toolchains cannot be produced by accident.

### What ends up where on the target machine

| Content | Location |
| --- | --- |
| Toolchains (read-only) | `<install dir>\resources\toolchains` |
| Target packs (startup files, linker scripts) | `<install dir>\resources\target-packs` |
| STM32Cube HAL / CMSIS | `<install dir>\resources\vendor\stm32cube` |
| Optional USB drivers | `<install dir>\resources\drivers` (installed with `pnputil` by the installer) |
| HIL build output (writable) | `%APPDATA%\ADIA\hil_build` |
| Repair downloads (writable) | `%APPDATA%\ADIA\toolchains` |

Tool resolution order at runtime: bundled dir, then user dir, then system `PATH`. The app never downloads anything
at startup when the bundled toolchains are complete; if one is missing it downloads **only** into the user dir and
refuses any archive whose SHA-256 does not match `toolchains.lock.json`.

## Updating a toolchain

1. Edit the entry in `toolchains.lock.json` (url, version, layout fields).
2. Download the archive and compute `sha256sum`/`Get-FileHash -Algorithm SHA256`; put the real hash in `sha256`. Never guess one.
3. Run `node scripts/fetch_toolchains.cjs --force` and `npm run -s test:security`.

## Smoke-test checklist (fresh Windows VM, network disabled)

- [ ] Run `ADIA Setup.exe`: UAC prompt appears, install directory can be changed, installs under Program Files.
- [ ] Desktop and Start-menu shortcuts exist; double-clicking a `.adia` file opens it in ADIA.
- [ ] Launch ADIA. Open the HIL workspace: the environment status panel shows OK for Generic, Arduino Uno/Mega, STM32F1/F4 and "not yet supported" for ESP32.
- [ ] Generic target: generate, compile, run the simulation host.
- [ ] Arduino Uno: generate, compile, flash over USB, observe HIL telemetry.
- [ ] STM32F4 Discovery: generate, compile (real HAL, no mock), flash via ST-Link/OpenOCD, observe HIL telemetry on the UART.
- [ ] ESP32: compile/flash is refused with `TARGET_NOT_YET_SUPPORTED`.
- [ ] No files were created inside `C:\Program Files\ADIA` after first run; HIL output is under `%APPDATA%\ADIA\hil_build`.
- [ ] Uninstall removes the program; `%APPDATA%\ADIA` is kept.

## Troubleshooting

- `HASH_MISMATCH` / `UNPINNED_ARCHIVE` during fetch: the downloaded archive differs from the lock file. Do not bypass; investigate the source.
- Packaging error about a missing `vendor` or `toolchains` path: run `npm run fetch:toolchains`.
- `npm ci` fails on lock-file drift: regenerate `package-lock.json` on a networked machine (`npm install --package-lock-only`) after dependency changes.
