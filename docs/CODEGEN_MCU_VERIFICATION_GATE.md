# MCU Hardware & Codegen Verification Gate Specification

## Overview

ADIA enforces a strict, fail-closed verification pipeline for microcontroller unit (MCU) targets: `stm32f103c8t6`, `stm32f407vgt6`, `atmega328p`, `atmega2560`, and `esp32-wroom-32`.

No release package or evidence certificate is granted without passing every gate sequentially on the exact physical hardware and pinned toolchains. Structural-only analysis cannot produce an `ACCEPTED` verification bundle.

---

## Operator Workflow & CLI Usage

Verification packages and evidence bundles are generated and evaluated via the command line or CI pipeline:

```bash
# Generate artifacts, execute host & target verification gates, and render testing reports
npm run verify:sm:codegen -- --model <path/to/model.json> --output <output-directory>

# Target selection override
npm run verify:sm:codegen -- --model <path/to/model.json> --output <output-directory> --target stm32f407
```

### Command Flags:
- `--model <file>`: (Required) Path to the verified state machine JSON model.
- `--output <dir>`: (Required) Directory where the complete verification package, source files, and evidence artifacts are emitted.
- `--target <targetId>`: (Optional) Override target MCU identifier (e.g. `stm32f407`, `stm32f103`, `atmega328p`).
- `--clean`: (Optional) Clean output directory prior to generation.

---

## Verification Package Layout

Every generated verification package emitted to the output directory adheres to this self-contained structure:

```
<output-directory>/
├── production/                         # Pure C99/C11 state machine & MCAL interfaces
│   ├── sm_types.h                      # Scalar types, enum states, error codes
│   ├── sm_config.h                     # Model configuration, timing macros, state counts
│   ├── sm_core.h                       # Public lifecycle API (SM_Init, SM_Step, SM_Reset)
│   ├── sm_core.c                       # Core state machine execution engine
│   ├── sm_safety.h                     # Safety monitoring and fault injection bounds
│   ├── sm_safety.c                     # Safe output clamping, corruption detection
│   ├── mcal_dio.h                      # Digital I/O abstraction declarations
│   └── mcal_wdg.h                      # Watchdog refresh & kick declarations
├── test/                               # Isolated test harness & 9 independent C test suites
│   ├── test_main.c                     # Test suite orchestrator & exit code aggregator
│   ├── test_runtime.h                  # In-memory test MCAL and recorder declarations
│   ├── test_runtime.c                  # Call recording, mock I/O channels, assertion utilities
│   ├── test_init.c                     # Cold boot, null pointer, and zero-init tests
│   ├── test_transitions.c              # Guard evaluation, priorities, and boundary conditions
│   ├── test_actions.c                  # Entry, exit, during, transition action orders
│   ├── test_timing.c                   # Cycle ticks, boundary timers (449/450/500/550 ms), saturation
│   ├── test_safety.c                   # Fault clamping, safe-output latching, watchdog refresh
│   ├── test_io.c                       # MCAL channel mapping conversion, ordering, value checks
│   ├── test_reset.c                    # Normal, fault, and null reset behaviors
│   ├── test_robustness.c               # Out-of-bounds inputs, memory corruption, invalid pointers
│   └── test_hierarchy.c                # Composite state entry, history, and substate nesting
└── evidence/                           # Canonical evidence logs and audit certificates
    ├── test_manifest.json              # Machine-readable inventory of all test suites & vectors
    ├── host_compile.json               # Strict host compilation command, flags, and diagnostics
    ├── host_runtime.json               # Host execution log, assertion counts, pass/fail counts
    ├── sanitizers.json                 # AddressSanitizer & UndefinedBehaviorSanitizer logs
    ├── coverage.json                   # gcov statement & branch coverage metrics & uncovered lines
    ├── differential.json               # Frame-by-frame cycle trace vs. reference interpreter
    ├── static_analysis.json            # Static analysis findings, tool metadata, cyclomatic complexity
    ├── misra_analysis.json             # MISRA C:2012 compliance checks and documented deviations
    ├── target_compile.json             # Cross-compilation command, ELF artifacts, binary hashes
    ├── verification_bundle.json        # Unified canonical evidence bundle
    └── sm_testing_report.md            # Human-readable engineering verification report
```

---

## Canonical Activity Status Truth Table

Verification gates report exclusively one of five canonical statuses:

| Status | Meaning | Fail-Closed Policy |
|---|---|---|
| `PASS` | Gate executed and passed all verification assertions with zero violations. | Eligible for acceptance. |
| `FAIL` | Gate executed and failed one or more assertions, checks, or bounds. | Strictly rejects acceptance. |
| `NOT_RUN` | Mandatory tool or verification gate is not configured or not installed in the environment. | Strictly rejects acceptance (`overallStatus = REJECTED`). Never inferred as PASS. |
| `NOT_APPLICABLE` | Verification gate is explicitly irrelevant for the model configuration (e.g. hierarchy tests for flat models). | Allowed only when justified by semantic model properties. |
| `PENDING` | Reserved strictly for post-compilation physical hardware verification (e.g. HIL testing, flashing). | Acknowledges software gate completion while physical hardware test is queued. |

---

## Analyzer Adapters & Target Selection

The pipeline utilizes pluggable adapter interfaces:
- **`SMAnalysisAdapter`**: Encapsulates external static analysis tools (e.g. `cppcheck`, `clang-tidy`). Normalizes findings, severities, suppressions, and cyclomatic complexity metrics into canonical `AnalysisEvidenceDetails`.
- **`SMTargetCompileAdapter`**: Encapsulates cross-compilation toolchains (e.g. `arm-none-eabi-gcc` for STM32, `avr-gcc` for ATmega). Enforces strict compilation flags (`-Wall -Wextra -Werror -pedantic-errors`) and hashes emitted firmware binaries (`.elf`, `.bin`).

---

## Target Delivery Gate

Before any generated code can be delivered or released for target microcontroller deployment:
1. Host compilation, host test suites, coverage thresholds, and differential interpreter checks must achieve `PASS`.
2. Static analysis and MISRA compliance analysis must achieve `PASS`.
3. Target cross-compilation for the configured target recipe must achieve `PASS`.
4. If target cross-compilation is missing or unconfigured, the gate is marked `NOT_RUN` and delivery is rejected.

---

## Disclaimer & Functional Safety Scope

`RELEASE_READY` or `ACCEPTED` indicates that all declared engineering gates, strict compilation checks, unit suites, coverage metrics, and static checks passed cleanly with zero residual stubs.

This verification pipeline **does not** by itself constitute a formal ISO 26262 (ASIL) or IEC 61508 (SIL) functional safety certification. Official safety certification requires an accredited third-party assessment, complete system-level hazard analysis and risk assessment (HARA), safety manuals, and certified tool qualification kits.
