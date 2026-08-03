# MCU Hardware & Codegen Verification Gate Specification

## Overview

ADIA enforces a strict, fail-closed verification pipeline for microcontroller unit (MCU) targets: `stm32f103c8t6`, `stm32f407vgt6`, `atmega328p`, `atmega2560`, and `esp32-wroom-32`.

No release package or evidence certificate is granted without passing every gate sequentially on the exact physical hardware and pinned toolchains.

## Verification Gate Hierarchy

1. **STATIC_ANALYSIS_ONLY**: Generated state machine C code and MCAL headers pass static verification.
2. **TARGET_COMPILE_VERIFIED**: All C/C++ source files compile with the pinned target compiler (`-Wall -Wextra -Werror`).
3. **LINKED_IMAGE_VERIFIED**: ELF image linked successfully and inspected via target `size`/`nm`/`readelf`. Flash and RAM section bounds verified.
4. **FLASH_VERIFIED**: Binary written and verified on exact target hardware using single-use confirmation tokens and readback hash matching.
5. **SELF_TEST_VERIFIED**: On-target firmware self-test passes (boot identity, RAM pattern, clock tick, watchdog recovery, loopback).
6. **EXTERNAL_HIL_VERIFIED**: Physical HIL hardware trace matches simulation/compiled-C execution without divergence.
7. **RELEASE_READY**: All prerequisite engineering gates passed cleanly with zero residual stubs.

## Target Pack Identity & Hashing

Each target pack is immutable and hashed via canonical content hashing (`sha256`). Target packs own:
- Pinned startup files & linker scripts
- Driver provider inventory
- Fixed compiler & programmer recipes
- Device identity masks and signatures
- Hardware HIL fixture wiring manifests

## Disclaimer

`RELEASE_READY` indicates that all declared engineering gates passed cleanly. It does not constitute a formal ISO 26262 or IEC 61508 functional safety certification.
