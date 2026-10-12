# HIL production readiness review and proposed design

## Requested outcome

A fresh ADIA installation supplies the real driver/runtime dependencies and generated project files needed to compile and program each supported MCU: STM32F103C8T6, STM32F407VGT6, ATmega328P, ATmega2560, and ESP32-WROOM-32. Generic is a host simulation target.

## Verified findings

- The bundled-tool verifier passes for GCC, ARM GCC, AVR GCC, Xtensa GCC, OpenOCD, AVRDUDE, and esptool. This checks tool presence, not complete vendor runtime dependencies.
- HIL and target-pack Vitest suites report 20 passing files and 97 passing tests. ESP32 and Generic compilation checks explicitly skip when host g++ is unavailable.
- The build matrix reports six passes, but scripts/hil_emit_sources.ts enables includeTestShims. ESP32 shim GPIO, ADC, PWM, timing and serial functions in stateMachineCodeGenerator.ts do not perform hardware I/O. These results must not certify production firmware.
- elfInspector.cjs substitutes fixed text/data/bss values when size inspection fails. It also substitutes the ELF hash for absent BIN/HEX files. Successful inspection therefore does not establish genuine memory usage or presence of flash artifacts.
- hilBuildService.cjs creates an ELF but has no BIN/HEX conversion step. It accepts optional startup/linker inputs rather than resolving target assets itself. Its default recipe executable is a command name rather than the bundled compiler path.
- ESP32's build recipe invokes raw Xtensa C++ with generated sources; it does not configure/link a complete ESP-IDF or Arduino runtime, bootloader, partition table and flash layout.
- Packaging explicitly includes toolchains but has no explicit target-packs resource entry. targetPackLoader.cjs defaults to process.cwd()/target-packs and silently falls back to limits. STM32F407 fallback capacities differ from its checked-in manifest.
- AVR flash recipes omit serial port and baud arguments, although the Mega default programmer is a serial bootloader protocol.

## Approaches

1. Recommended: retain the target registry and integrate pinned, complete vendor runtimes per target. Arduino AVR/ESP32 cores and STM32 HAL/CMSIS provide actual drivers. Bundle all dependencies during release preparation and validate them before packaging.
2. Implement every runtime and peripheral directly against registers. This offers control but greatly increases hardware validation and maintenance work.
3. Require external IDE/SDK installations. This reduces application packaging work but fails the requested first-install experience.

## Proposed correction

Use one target dependency manifest for runtime assets, compiler tools, programmer tools, startup/vector files, linker scripts, supported peripherals and flash layout. Provision dependencies during release preparation and package immutable verified assets. A fresh installation resolves assets from application resources and generates a writable complete project on demand.

Production generation must exclude test shims and reject unsupported peripheral/pin combinations. AVR builds link the real Arduino core; STM32 builds link the real HAL/CMSIS, startup and target linker scripts; ESP32 builds use a complete pinned SDK/core environment and its prescribed image generation and flash layout. Preserve the existing C state-machine boundary where framework glue requires C++.

Resolve compiler and programmer paths from the bundled registry. Generate and hash actual ELF/MAP and required HEX/BIN artifacts. Fail inspection on missing tools, malformed output, wrong architecture, overflow or absent flash assets. Do not synthesize evidence. Supply selected programmer, serial port, baud and board-specific flash arguments.

Separate simulation compilation from production compilation in scripts and reports. Production release checks must use complete packaged resources, an empty user-data directory, no external PATH tools and networking disabled. Verify all five MCU builds. Physical programming and peripheral operation require the corresponding connected boards; report those checks separately from compilation.

## Acceptance checks

- All five supported MCU production projects compile and link without test shims or missing dependencies.
- Flash artifacts and memory measurements come from actual tool output.
- Packaging rejects incomplete runtime bundles.
- First-run generation works from packaged resources without downloads or separately installed SDKs.
- Flash commands use the selected connection and correct target image layout.
- Connected-board checks verify programming, boot, communication and the peripherals advertised as supported.

## Status

Design approved and implementation completed for the five MCU production build paths and Generic host simulation. Real offline vendor builds pass for every MCU; HIL tests and security checks pass. Release packaging and packaged-resource build verification are recorded in docs/HIL_PRODUCTION_SETUP.md. Existing workspace changes were preserved. Successful physical programming has not been established.
