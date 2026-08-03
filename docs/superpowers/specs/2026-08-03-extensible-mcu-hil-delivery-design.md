# Extensible MCU, Automatic Layer Generation, and HIL Delivery Design

**Date:** 2026-08-03  
**Status:** Approved design awaiting written-spec review

## 1. Purpose

ADIA shall generate a complete embedded firmware project from one validated
state-machine/X-Bridges model. The project shall contain the application,
component, MCAL, driver, and platform layers required to compile, link, flash,
and verify the selected exact MCU or board.

The architecture shall remain generic. MCU support shall be added through
versioned target packs rather than by adding target-specific conditionals to the
state-machine generator.

## 2. Initial Certification Scope

The first release shall fully certify these exact targets:

| Target ID | Device/Module | Primary ecosystem |
|---|---|---|
| `stm32f103c8t6` | STM32F103C8T6 | Arm GNU + STM32Cube HAL / bare metal |
| `stm32f407vgt6` | STM32F407VGT6 | Arm GNU + STM32Cube HAL / bare metal |
| `atmega328p` | ATmega328P / Arduino Uno profile | AVR GNU + Arduino core / bare metal |
| `atmega2560` | ATmega2560 / Arduino Mega profile | AVR GNU + Arduino core / bare metal |
| `esp32-wroom-32` | ESP32-WROOM-32 | ESP-IDF / target-pack register-level peripheral drivers |

Family labels such as `STM32F4` shall remain migration aliases only. A package
may be compiled, flashed, or certified only after resolving to an exact target
ID and target-pack version.

Future targets, including additional STM32, AVR, ESP32, RP2040, and NXP
devices, shall use the same target-pack contract and certification workflow.

## 3. Architectural Boundaries

```text
Validated model and mappings
             |
             v
 Generic application generator
             |
             v
 Automatic component generator
             |
             v
       Stable MCAL contract
             |
             v
 Versioned exact-device target pack
       /                    \
Vendor SDK/HAL         Bare-metal provider
       \                    /
             v
 Startup + linker + build + flash project
             |
             v
 SIL -> target compile/link -> flash -> self-test -> external HIL
```

The semantic model and generated application behavior shall not depend on a
vendor SDK. All platform access shall cross the generated component and MCAL
interfaces.

## 4. Automatically Generated Layers

### 4.1 Application layer

The existing state-machine and X-Bridges generators shall emit deterministic
C99 behavior. History, parallel states, internal transitions, temporal logic,
fixed/float algorithms, safety faults, and X-Bridges numerical behavior shall
remain simulation-equivalent.

### 4.2 Component layer

ADIA shall automatically generate:

- lifecycle entry points for initialize, start, cyclic execution, stop, reset,
  and fault recovery;
- deterministic input-read, model-step, and output-write sequencing;
- scheduler/timer integration using the model's fixed logical tick;
- watchdog service and scheduler-overrun detection;
- diagnostic event routing and firmware identity telemetry;
- safe-output application and fault-latched behavior;
- typed application-to-MCAL signal adapters.

The component layer shall own orchestration but shall contain no direct vendor
register or SDK calls.

### 4.3 MCAL layer

ADIA shall generate only the interfaces and configured instances required by
the model mappings. The stable MCAL contract shall cover:

- GPIO, ADC, DAC, PWM, UART, SPI, I2C, CAN, timer/capture, watchdog, system
  clock, reset reason, and nonvolatile storage;
- typed read/write functions with explicit status results;
- initialization, deinitialization, health, timeout, and safe-state operations;
- channel IDs, pin mux, range, scaling, units, direction, and safe values;
- deterministic error propagation without silent fallback values.

Unused peripherals shall not create source code, initialization calls, or
memory allocations.

### 4.4 Driver layer

The project configuration shall select one driver mode per target pack:

- `vendor`: generated configuration and adapters over the pinned vendor
  SDK/HAL; or
- `bare-metal`: generated register-level drivers supplied and certified by the
  target pack.

`bare-metal` describes the generated peripheral-driver implementation. It does
not require replacing a device's immutable ROM boot path or vendor-required
image format. For ESP32, the target pack may retain the ESP-IDF boot/image
infrastructure while its selected MCAL peripherals use target-pack
register-level drivers.

Driver generation shall consume target-owned pin, clock, interrupt, DMA, and
peripheral capability metadata. It shall not infer register addresses or
alternate-function selections from free-form user strings.

When a selected peripheral lacks an implementation, ADIA shall generate a
compilable, explicit integration stub. Every stub shall return a deterministic
`NOT_IMPLEMENTED` status, apply safe outputs where relevant, include a unique
manifest entry, and prevent flash-ready or HIL-verified claims. Stubs shall
never silently emulate successful hardware access.

### 4.5 Platform layer

Each target pack shall supply or render:

- reset/startup source, vector table, system clock initialization, and interrupt
  ownership;
- linker script and exact flash/RAM regions;
- CPU, FPU, ABI, endian, optimization, and language flags;
- pinned toolchain and SDK requirements;
- build-system files and reproducible compile/link commands;
- ELF plus BIN/HEX generation rules;
- programmer/probe configuration and flash/readback verification recipe;
- on-target self-test and external-HIL transport integration.

### 4.6 MCAL public API contract

The component layer and target-pack drivers shall communicate through a stable
C99 API contract. The generator shall emit:

- one header `adia_mcal.h` declaring the public types, channel enums, status
codes, and function signatures used by the component layer;
- one implementation file per configured peripheral instance, owned by the
target pack, containing the vendor or bare-metal driver body;
- safe-value and range metadata as compile-time constants consumed by the
component layer.

Every MCAL operation shall return an explicit status:

```c
typedef enum {
  ADIA_MCAL_OK = 0,
  ADIA_MCAL_ERROR,
  ADIA_MCAL_TIMEOUT,
  ADIA_MCAL_NOT_IMPLEMENTED,
  ADIA_MCAL_INVALID_CHANNEL,
  ADIA_MCAL_INVALID_STATE,
  ADIA_MCAL_HEALTH_FAULT,
} adia_mcal_status_t;
```

Read and write functions shall use typed channel handles, never raw register
addresses or free-form strings:

```c
adia_mcal_status_t adia_mcal_gpio_read(adia_mcal_gpio_channel_t ch,
                                        bool *out_value);
adia_mcal_status_t adia_mcal_gpio_write(adia_mcal_gpio_channel_t ch,
                                         bool value);
adia_mcal_status_t adia_mcal_adc_read(adia_mcal_adc_channel_t ch,
                                       int32_t *out_counts);
adia_mcal_status_t adia_mcal_pwm_write(adia_mcal_pwm_channel_t ch,
                                        uint32_t duty_counts);
```

Initialization, deinitialization, health, and safe-state functions shall take
no opaque context pointers and shall leave peripherals in a known safe state on
failure. Unused channel enums and peripheral files shall not be generated.

## 5. Target-Pack Contract

A target pack shall be an immutable, versioned package with:

- exact `targetId`, device/board revision, CPU architecture, core, FPU, ABI,
  endianness, clock limits, memory regions, and device identity values;
- supported driver modes and pinned SDK/toolchain versions;
- pin and alternate-function database;
- peripheral instance, interrupt, DMA, electrical, and conflict constraints;
- startup, linker, build, flash, self-test, and HIL assets;
- compiler/linker allowlists with fixed argument templates;
- supported programmer IDs and device-detection commands;
- capability and certification manifests;
- content hashes and schema version.

`TargetRegistry` shall validate schema compatibility, unique IDs, content
hashes, paths, build recipes, capability references, and evidence metadata
before a pack can be selected.

### 5.1 Packaging, discovery, and driver-mode selection

A target pack shall be distributed as a versioned directory or archive with a
single root manifest file. The registry shall discover packs from a configured
search path; no pack may be loaded from user-typed filesystem paths at runtime.

The driver mode (`vendor` or `bare-metal`) shall be selected in the project
target configuration, not inferred from installed SDKs. The registry shall
verify that the selected mode is listed in the pack's `supportedDriverModes`
before generation begins. Changing the driver mode shall be treated as a new
target configuration and shall invalidate previous compile, link, flash, and HIL
evidence.

Each pack shall declare its minimum ADIA generator schema version and shall be
rejected if the running generator is incompatible. A dependency lock shall
record the pack version, content hash, schema version, and selected driver mode
inside the generated delivery package.

## 6. Generation and Validation Flow

1. Validate the model, semantic behavior, mappings, timing, numeric limits, and
   safety configuration.
2. Resolve an exact target ID, pack version, driver mode, and board revision.
3. Validate clock feasibility, scheduler tick, pin mux, electrical capability,
   peripheral conflicts, interrupt/DMA ownership, memory budgets, and expected
   WCET margin.
4. Generate application, component, MCAL, driver, and platform layers.
5. Generate an integration manifest identifying every file, mapping,
   peripheral, implementation provider, dependency, and stub.
6. Cross-compile all generated and target-owned sources with strict warnings.
7. Link a complete ELF using the target startup and linker script.
8. Inspect ELF/map artifacts for sections, vector/reset symbols, unresolved
   symbols, stack/heap policy, flash/RAM use, FPU ABI, forbidden APIs, and
   scheduler/WCET evidence.
9. Generate BIN/HEX only after successful link and artifact inspection.
10. Verify the connected probe and device identity, request explicit flash
    authorization, program the image, verify/read back it, and reset the board.
11. Confirm firmware identity/hash over telemetry and run the on-target
    self-test.
12. Run the external HIL suite and compare its trace against simulation and
    compiled-C reference traces.
13. Package artifacts and evidence with the exact firmware hash.

A failure at any step shall stop the pipeline, record the failing step and the
exact configuration hashes, and shall not allow later steps to claim success.
Each successful step shall append an immutable evidence record containing the
step name, input hashes, output hashes, tool versions, timestamp, and the
status reached. Evidence records shall be stored alongside the generated
deliverable and shall be signed by the build identity for audit traceability.
The build identity is the stable ADIA generator instance identifier used for
the session; it is not a production code-signing key infrastructure.

## 7. HIL Architecture

Every certified target shall support two complementary stages.

### 7.1 On-target self-test

The generated firmware shall test boot identity, clock/tick accuracy, initialized
RAM, watchdog recovery, scheduler overrun detection, protocol CRC/sequence
handling, configured peripheral loopbacks where possible, fault latching, and
safe-output behavior.

### 7.2 External HIL certification

An independent HIL controller shall drive physical inputs and measure physical
outputs. The fixture definition shall describe channels, ranges, loads,
calibration, tolerances, sampling rates, timing tolerances, and wiring revision.
Tests shall include nominal paths, boundaries, noisy inputs, disconnects,
timeouts, invalid frames, peripheral faults, reset recovery, watchdog faults,
and safe outputs.

The HIL orchestrator shall replay deterministic vectors and compare:

- active states and parallel regions;
- history restoration and internal-transition behavior;
- state timers and execution order;
- application variables and X-Bridges signals;
- fixed/float values using declared absolute/relative tolerances;
- physical input/output values and timestamps;
- diagnostic, numeric, timing, and safety faults.

The first divergence shall record the stimulus index, timestamp, expected and
actual values, state configuration, target/firmware hash, and fixture revision.

## 8. Build, Flash, and Execution Safety

- Renderer data shall never become executable command text. Tool invocations
  shall use target-owned executables and fixed argument arrays with
  `shell: false`.
- Source names, directories, target packs, programmer IDs, ports, probe serials,
  and flags shall be allowlisted and bounds checked.
- Builds shall run in contained temporary workspaces with file-count, file-size,
  output-size, concurrency, and timeout limits.
- Flashing shall require an exact successful build hash, explicit user approval,
  one unambiguous probe, and matching device identity.
- The flasher shall refuse family-only targets, generated stubs, stale builds,
  failed artifact inspection, unexpected device IDs, or ambiguous probes.
- Flash logs and evidence shall exclude source contents and secrets.
- Browser mode may generate source packages but shall not claim local compile,
  flash, self-test, or HIL execution.

## 9. Evidence and Status Model

Evidence shall be immutable and attached to the exact model hash, generated
source hash, target-pack hash, toolchain/SDK versions, firmware hash, driver
mode, programmer, board revision, and HIL fixture revision.

| Status | Meaning |
|---|---|
| `STATIC_ANALYSIS_ONLY` | Semantic/static checks only. |
| `GENERATED_WITH_STUBS` | Complete project generated, but one or more MCAL/driver integrations remain explicit stubs. |
| `TARGET_COMPILE_VERIFIED` | All target sources compiled with the pinned target toolchain. |
| `LINKED_IMAGE_VERIFIED` | ELF linked and passed artifact inspection. |
| `FLASH_VERIFIED` | Exact image programmed and verified/read back on the expected device. |
| `SELF_TEST_VERIFIED` | Firmware identity and on-target self-test passed. |
| `EXTERNAL_HIL_VERIFIED` | Required external HIL suite passed. |
| `RELEASE_READY` | All mandatory model, compile, link, flash, self-test, HIL, resource, and safety gates passed for this exact configuration. |

Statuses shall never be inferred from a weaker layer. Object-only compilation
is not linked-image evidence, host-stub compilation is not target compilation,
estimated memory is not ELF/map evidence, and a family label is not exact-device
flash evidence.

### 9.1 Status transitions and evidence storage

The status model is cumulative and ordered. A configuration may advance only
through the sequence above, but it may regress to an earlier status or to
`STATIC_ANALYSIS_ONLY` whenever the model, target selection, driver mode,
toolchain, board revision, or target-pack version changes. Regression shall
clear all downstream evidence records.

Evidence shall be stored as a chain of signed JSON objects, each referencing the
previous record by hash, containing the status reached, all input and output
hashes, and a stable tool-version identifier. Evidence shall be written to the
delivery package and to the project's evidence store; it shall never be edited
in place. A missing or tampered evidence record shall be treated as no evidence
for that step.

## 10. Generated Delivery Package

The final package shall contain:

- generated application, component, MCAL, driver, and platform source;
- target-pack identity and dependency lock;
- startup, linker, build, flash, and debug assets;
- ELF, BIN/HEX, map, symbols, disassembly summary, and measured size report;
- integration/stub manifest and pin/peripheral configuration;
- SIL/PIL, compiler, linker, flash, self-test, and HIL reports;
- state name/model-ID/C-symbol traceability;
- WCET, stack, flash, RAM, watchdog, and safe-output evidence;
- firmware/model/source/target-pack/test-vector hashes;
- MCU integration, wiring, build, flash, debugging, rollback, and recovery
  instructions.

### 10.1 Package layout

The delivery package shall have a deterministic directory layout so that build,
flash, and HIL scripts can locate files without parsing free-form paths:

```text
<project>-<targetId>-<driverMode>-<firmwareHash>/
  src/
    app/
    component/
    mcal/
    driver/
    platform/
  build/
    Makefile / CMakeLists.txt / build script
    linker/
    startup/
  out/
    firmware.elf
    firmware.bin
    firmware.hex
    firmware.map
    firmware.lst
    size.report
  evidence/
    integration_manifest.json
    evidence_chain.json
    compile.report
    link.report
    flash.report
    self_test.report
    hil.report
  docs/
    integration.md
    wiring.md
    build.md
    flash.md
    debug.md
    recovery.md
```

## 11. First-Release Acceptance Criteria

1. All five initial exact target profiles generate complete projects
   automatically.
2. Every profile supports vendor and bare-metal selection; unavailable
   peripheral implementations generate explicit safe stubs and block release
   status.
3. Certified configurations compile and link with pinned real target
   toolchains—no host compiler or Arduino/ESP32 compatibility shim may satisfy
   target evidence.
4. Produced images flash to the correct physical target and pass readback or
   programmer verification.
5. Every certified target passes the generated on-target self-test and external
   HIL suite.
6. Simulation, host-compiled C, and target traces agree for history, parallel
   states, internal transitions, timing, fixed/float calculations, X-Bridges,
   faults, and safe outputs within declared numeric/timing tolerances.
7. Reports clearly distinguish generated stubs, compile, link, flash,
   self-test, external HIL, and release evidence.
8. A new MCU can be added through a target pack without modifying the semantic
   model, application generator, component contract, or MCAL public API.

## 12. Out of Scope for the First Release

- Claiming certification for every MCU in a family without an exact target
  pack and physical test evidence.
- Automatic PCB electrical validation beyond declared target-pack and fixture
  constraints.
- Functional-safety certification claims such as ISO 26262, IEC 61508, or
  DO-178C without the separate organizational process, tool qualification, and
  independent assessment those standards require.
- Production signing-key custody and factory provisioning infrastructure.
