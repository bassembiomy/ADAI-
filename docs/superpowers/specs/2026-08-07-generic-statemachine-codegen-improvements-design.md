# Generic State Machine Code Generator — Design Specification

**Date:** 2026-08-07  
**Status:** APPROVED FOR IMPLEMENTATION  
**Target Module:** ADIA State Machine Code Generator Engine (`src/utils/stateMachine/`)  

---

## 1. Executive Summary & Purpose

The Generic State Machine Code Generator transforms platform-independent state machine models (including Standard FSMs, Hierarchical State Machines (HSMs), and XBridges continuous/matrix states) into deterministic, portable C code.

The generated C code is strictly independent of target MCUs, vendor HALs, MCALs, RTOSs, or compiler extensions. Integration with target hardware and peripheral drivers is performed via well-bounded, protected integration interfaces.

---

## 2. Directory Architecture & File Classification

The generator produces a clear separation between reusable runtime infrastructure, model-specific C code, platform interfaces, test suites, documentation, examples, build scripts, and machine-readable verification reports:

```text
runtime/
    sm_runtime.c            /* REUSABLE RUNTIME: Generic scheduler, dispatcher, & initialization engine */
    sm_runtime.h            /* REUSABLE RUNTIME: Core runtime library declarations */

generated/
    sm_core.c               /* GENERATED MODEL BEHAVIOR: Precomputed transitions, guards, actions, timers */
    sm_core.h               /* GENERATED MODEL BEHAVIOR: State enums, context structs, function prototypes */
    sm_types.h              /* GENERATED MODEL BEHAVIOR: Fixed-width data types & event definitions */
    sm_config.h             /* GENERATED CONFIG: Compile-time macro flags & numerical tolerances */
    sm_version.h            /* GENERATED VERSION: Version, model hash, and code version macros */
    sm_xb_runtime.c          /* GENERATED XBRIDGES: Static matrix solvers & signal execution loops */
    sm_xb_runtime.h          /* GENERATED XBRIDGES: XBridges state structures & operation functions */
    manifest.json           /* GENERATED MANIFEST: File catalog, model hash, and generator metadata */

platform/
    sm_platform.h           /* PLATFORM INTERFACE: Target platform type definitions (e.g. ADC_Value, DigitalInput) */
    sm_inputs.h             /* PLATFORM INTERFACE: Input acquisition prototype (SM_ReadInputs) */
    sm_outputs.h            /* PLATFORM INTERFACE: Output update prototype (SM_WriteOutputs) */
    sm_safety.h             /* PLATFORM INTERFACE: Safe-state handling prototype (SM_ApplySafeOutputs) */
    sm_inputs.c             /* USER IMPLEMENTATION: Generated ONCE. Preserved across code regenerations */
    sm_outputs.c            /* USER IMPLEMENTATION: Generated ONCE. Preserved across code regenerations */
    sm_safety.c             /* USER IMPLEMENTATION: Generated ONCE. Preserved across code regenerations */

tests/
    sm_generated_tests.c    /* VERIFICATION ARTIFACT: Host transition, guard boundary, & timer unit tests */
    sm_reference_vectors.c  /* VERIFICATION ARTIFACT: Reference model execution vectors for host test runner */

docs/
    architecture.md         /* DOCUMENTATION: State machine structure & hierarchy overview */
    api_reference.md        /* DOCUMENTATION: Public C API specification */
    integration_guide.md    /* DOCUMENTATION: Guide for target integration engineers */

examples/
    generic_main.c          /* EXAMPLES: Bare-metal main loop integration example */
    integration_example.c   /* EXAMPLES: RTOS task / periodic timer integration example */

cmake/
    CMakeLists.txt          /* BUILD SYSTEM: Out-of-the-box CMake build script */
    Makefile                /* BUILD SYSTEM: Portable Makefile for host GCC/Clang validation */

reports/
    compile_report.md       /* REPORT: Host build log & strict warning audit */
    runtime_report.md       /* REPORT: State transition & guard/timer boundary test results */
    diff_report.md          /* REPORT: Differential execution comparison & first divergence logs */
    coverage_report.md      /* REPORT: State, transition, and guard execution coverage */
    requirements_report.md  /* REPORT: Detailed requirement-by-requirement PASS/FAIL matrix */
    traceability.json       /* MACHINE-READABLE: Requirement & Model Element -> C file, symbol, & line ranges */
    verification.json       /* MACHINE-READABLE: Complete execution results & metrics for CI/CD */
    generation.json         /* MACHINE-READABLE: Snapshot of generator configuration & environment */
    failures/               /* MACHINE-READABLE: Deterministic replay JSON vectors for test failures */
```

### Regeneration Protection Rule (`GEN-INT-005`)
The generator **shall never modify existing user implementation files** (`platform/sm_inputs.c`, `platform/sm_outputs.c`, `platform/sm_safety.c`) during regeneration. Only interface headers (`platform/sm_inputs.h`, `platform/sm_outputs.h`, `platform/sm_safety.h`) are updated if model signals change.

---

## 3. Core Behavioral Generator Requirements

### 3.1 State Representation & Hierarchical Precomputation
1. **Precomputed HSM LCA & Paths (`GEN-HSM-001` - `GEN-HSM-004`):**
   * The generator shall precompute the Lowest Common Ancestor (LCA) and exit/entry paths at generation time across all transition types (child $\rightarrow$ sibling, child $\rightarrow$ ancestor, ancestor $\rightarrow$ descendant, cross-branch, self, internal, local).
   * Runtime execution shall perform no dynamic hierarchy search.
   * The maximum number of exit/entry operations shall be statically bounded by the generated model, enabling deterministic worst-case execution time (WCET) analysis.
   * The generation report shall include exact static metrics: `Maximum hierarchy depth`, `Maximum transition exit depth`, `Maximum transition entry depth`, and `Maximum state actions per step`.
2. **Transition Execution Order (`GEN-FUN-008`):**
   * For **external transitions**: Source Exit Actions $\rightarrow$ Transition Action $\rightarrow$ Destination Entry Actions.
   * For **internal transitions**: Transition Action executed; zero exit/entry actions performed.
   * For **local transitions**: Sub-state exit/entry executed without exiting/re-entering the containing parent state.
3. **Variable Shadowing Prevention (`GEN-CODE-002`):**
   * Generated local variables within transition/action functions shall use unique namespaced identifiers (e.g. `const bool sm_t14_guard_eval = ...`).
   * Generated C code shall compile warning-free under `-Wshadow -Werror`.

### 3.2 Type Mapping & Timing Semantics
1. **Data Types (`GEN-DATA-001` - `GEN-DATA-003`):**
   * Integer model types shall map strictly to fixed-width types from `<stdint.h>` (`uint8_t`, `int16_t`, `uint32_t`, etc.).
   * Boolean values shall map to `bool` from `<stdbool.h>`.
   * Floating-point model types shall map explicitly to `float` or `double`.
   * Type assumptions shall be validated via C compile-time assertions: `_Static_assert(sizeof(float) == 4U, "Invalid float width");`.
2. **Timing Model & Wraparound (`GEN-TIME-001` - `GEN-TIME-004`):**
   * Timebase unit: `uint32_t` milliseconds.
   * Elapsed time comparisons shall use modular subtraction: `(uint32_t)(now - start) >= duration`.
   * Duration Restriction: Generated timeout durations shall not exceed $\text{UINT32\_MAX} / 2$ ($2,147,483,647\text{ ms} \approx 24.8\text{ days}$) to maintain unambiguous modular subtraction.
   * Timebase Model: The generator shall explicitly document whether the timebase uses absolute monotonic clock ticks or accumulated logical ticks in `generated/sm_config.h`.

### 3.3 Robustness & Fault Handling
1. **Error Classification (`SM_Error_t`):**
   ```c
   typedef enum
   {
       SM_ERR_NONE = 0,
       SM_ERR_NULL_POINTER,
       SM_ERR_INVALID_STATE,
       SM_ERR_INVALID_CONFIGURATION,
       SM_ERR_TIMING_VIOLATION,
       SM_ERR_BOUNDS,
       SM_ERR_NUMERIC_FAULT,
       SM_ERR_INTERNAL
   } SM_Error_t;
   ```
2. **Null-Pointer Handling (`GEN-ROB-002`):**
   * If a public API receives a `NULL` instance pointer, it shall return `SM_ERR_NULL_POINTER` immediately without dereferencing `instance`.
3. **Instance Runtime Fault Latching (`GEN-SAFE-001` - `GEN-SAFE-004`):**
   * A valid instance encountering a fatal runtime error shall latch the specific `SM_Error_t` value, latch the fault state, and invoke `SM_ApplySafeOutputs(instance)`.
4. **XBridges Static Matrix Solvers (`GEN-DATA-005`):**
   * XBridges numerical operations shall use statically bounded storage with **zero dynamic memory allocation** (`no malloc/free`).
   * Singularity & ill-conditioning detection shall be based on scale-aware pivot validation: `abs(pivot) <= max(abs_eps, rel_eps * scale)`.
   * Detection of NaN, Inf, singular, or numerically invalid results shall raise `SM_ERR_NUMERIC_FAULT` and invoke the configured fallback behavior.

---

## 4. Traceability & Line Mapping Engine

1. **Traceable Elements Metadata (`ir.traceableElements`):**
   The semantic model shall maintain a normalized collection of all traceable elements across states, transitions, guards, entry actions, exit actions, transition actions, events, and XBridges operations.
2. **Marker-Based Line Resolution (`GEN-TRACE-001/002`):**
   Generated C files embed explicit marker pairs:
   ```c
   /* TRACE-BEGIN: model=S17 requirement=REQ-SM-042 symbol=sm_state_S17_execute */
   case SM_STATE_RUNNING: { ... }
   /* TRACE-END: model=S17 */
   ```
3. **Machine-Readable Multi-Location Mapping (`reports/traceability.json`):**
   Post-processing locates markers after formatting. If a traceable element cannot be resolved, line mapping raises `TRACEABILITY_UNRESOLVED` rather than inventing false locations:
   ```json
   {
     "mappings": [
       {
         "requirementIds": ["REQ-SM-042"],
         "traceId": "TRACE-STATE-S17",
         "modelElementId": "S17",
         "locations": [
           {
             "file": "generated/sm_core.c",
             "symbol": "sm_state_S17_execute",
             "startLine": 410,
             "endLine": 462
           }
         ]
       }
     ]
   }
   ```

---

## 5. Automated Verification & Differential Execution Engine

### 5.1 Host Compilation Verification (`GEN-TEST-001` - `GEN-TEST-003`)
* Automatic compilation of generated C code using host compiler (`gcc` / `clang` / `cl`).
* Exact compiler versions logged in `generation.json`. Warnings promoted to errors (`-Wshadow -Werror`).
* Execution under AddressSanitizer (ASan) and UndefinedBehaviorSanitizer (UBSan) where supported.

### 5.2 Independent Differential Execution Oracle (`GEN-DIFF-001` - `GEN-DIFF-004`)
* **Independent Semantics (`GEN-DIFF-004`):** `smReferenceInterpreter.ts` interprets normalized source state machine models independently of C generation code.
* **Canonical 10-Field Trace Protocol:**
  Both reference interpreter and host C binary emit steps containing:
  `tick`, `activeStates`, `transitionIds`, `exitActions`, `transitionActions`, `entryActions`, `consumedEvents`, `emittedEvents`, `variables`, `timers`, `error`.
* **Step-by-Step Comparator (`GEN-DIFF-002`):**
  Compares reference trace steps vs host C JSONL binary trace steps in deterministic field order. Mismatch in trace length or any field reports `FAIL` and logs first point of divergence (`GEN-DIFF-003`).
* **Deterministic Replay Vectors:**
  Failing differential tests produce `reports/failures/diff_failure_XXXX.json` containing `modelHash`, `inputs`, `events`, `timing`, and exact divergence info.

---

## 6. Verification Status Model & Hierarchical Aggregation Rules

Verification results enforce a strict 7-state status model (`GEN-RPT-001` - `GEN-RPT-003`):

| Status | Definition |
| :--- | :--- |
| `PASS` | Stage executed and strictly verified. |
| `FAIL` | Verification executed and detected a mismatch/error. |
| `NOT RUN` | Verification stage not scheduled or executed. |
| `NOT APPLICABLE` | Feature not present in current model. |
| `UNSUPPORTED` | Model construct explicitly rejected by generator. |
| `INTEGRATION REQUIRED` | Target MCU driver integration pending (not a generator defect). |
| `BLOCKED` | Stage could not run due to an upstream failure (e.g. host compile failure). |

### Hierarchical Status Aggregation Matrix

| Aggregate Level | Contributing Inputs | Expected Result |
| :--- | :--- | :--- |
| **Behavioral Generation Status** | Generator run, host compile, runtime tests, differential verification | `PASS` |
| **Target Integration Status** | Platform implementation, target compiler, hardware test bench | `INTEGRATION REQUIRED` |
| **Product Verification Status** | Aggregation of Behavioral Generation Status & Target Integration Status | `INCOMPLETE` |

---

## 7. Core Acceptance Requirements

### GEN-SYS-001 — Behavioral Equivalence
Given identical initial configuration, ordered inputs, events, and timing observations, the generated C implementation shall produce the same observable behavioral trace as the independent reference semantics for every supported model construct.

### GEN-SYS-002 — Verification Evidence
`GEN-SYS-001` shall be considered `PASS` only when host compilation succeeds, required runtime tests execute successfully, differential execution against actual host C binary output reports zero divergence, and coverage thresholds are achieved.
