# HIL Offline Toolchains and Target Synchronization Design

## Problem

The HIL workspace exposes two representations of the selected MCU: the legacy `config.target` value and the target-pack `config.targetSelection`. The top MCU selector currently updates only the legacy value. A stale pack selection can therefore survive the first switch to Arduino Mega and feed the wrong pin choices until another target round-trip refreshes state.

Native build discovery has a similar split. The repository already contains AVR-GCC under `avr-gcc/`, while `isToolchainLocallyInstalled()` checks only the canonical `toolchains/` layout. The build consequently starts an unnecessary download. Downloads write directly to a shared archive name, so a concurrent or lingering reader produces the reported Windows `EBUSY` failure.

Finally, `npm run dev` serves current Vite source while `npm start` launches Electron against previously generated `dist` and `dist-electron` outputs. This explains the visible version mismatch.

## Requirements

1. Selecting Arduino Mega, or any supported legacy target, must atomically update both target representations on the first selection.
2. Pin options must immediately derive from the newly selected target.
3. Arduino Uno and Mega builds must reuse the installed local AVR-GCC without downloading.
4. STM32F1, STM32F4, ESP32, Uno, and Mega compiler environments and their supported flash utilities must be locally discoverable and packaged as Electron resources.
5. Runtime startup and HIL Build must not require network access or install data.
6. Concurrent provisioning must not share a writable archive path.
7. `npm start` must build current source before launching Electron. A separate explicitly named command may launch prebuilt output.
8. Existing user-generated `hil_build/` changes must remain untouched except when an explicit build verification regenerates them.

## Architecture

### Target synchronization

Add a single legacy-selection transition in `hilTypes.ts`. It converts a `TargetMCU` into its canonical `TargetSelectionConfig` and returns a new `HILConfig`. The top selector calls this transition rather than assigning `target` directly. Generic clears `targetSelection`; concrete targets replace it. `HILDriverPanel` continues to receive `config.target`, so its pin map changes in the same render.

### Offline toolchain registry

Keep `toolchainManager.cjs` as the single registry and resolver. Each tool spec declares canonical and compatible local layouts. Discovery checks packaged `process.resourcesPath/toolchains`, repository `toolchains`, and the existing legacy `avr-gcc` directory in deterministic order. Build services receive the resolved executable; they do not infer installation solely from one folder shape.

Provisioning downloads into a unique temporary archive within the destination, verifies its pinned hash, extracts into a unique staging directory, validates required executables, and atomically promotes the result. A per-key in-process promise coalesces concurrent requests. Temporary artifacts are removed after success or failure. Runtime is offline-first and fails with a precise missing-bundle diagnostic rather than downloading; an explicit provisioning script is the only network-enabled path.

The provisioning script iterates the compiler and flash-tool keys required by the five concrete MCU targets and emits a machine-readable inventory. Packaging includes the canonical `toolchains` directory through `extraResource`. A verification command checks every required executable in repository and packaged layouts.

### Startup consistency

Change `npm start` to run the production build and then invoke Electron Forge. Preserve the old fast behavior as `start:prebuilt`. This makes the default command deterministic and current while retaining an intentional shortcut for developers.

## Error Handling

Missing offline assets list the exact target, tool key, searched paths, and provisioning command. Hash or layout verification failures never promote partial installs. Concurrent calls share one result. Locked stale archives are irrelevant because live work uses unique temporary files.

## Testing and Acceptance

- Unit tests prove first-switch target synchronization and Generic clearing.
- Component or helper-level tests prove Mega pin choices are used immediately.
- Toolchain-manager tests prove legacy AVR discovery, packaged resource precedence, concurrent coalescing, unique temporary paths, cleanup, and offline missing-tool diagnostics.
- Package-script tests prove `start` builds before launch and `start:prebuilt` remains explicit.
- The environment doctor proves all supported target compilers/flashers are local.
- The HIL build matrix compiles and links every supported concrete MCU target with networking disabled.
- A fresh `npm start` build and Electron launch smoke test proves the current UI bundle is loaded.

## Scope

This work changes HIL target selection, toolchain lifecycle, packaging, and startup scripts only. It does not redesign target packs, pin naming, generated HAL semantics, or physical flashing policy.
