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
   * The generator shall precompute LCA and exit/entry paths at generation time for the 3 transition kinds (`external`, `internal`, `local`) across 7 hierarchy scenarios (child $\rightarrow$ sibling, child $\rightarrow$ ancestor, ancestor $\rightarrow$ descendant, cross-branch, self, internal, local).
   * Runtime execution shall perform no dynamic hierarchy search.
   * The maximum number of exit/entry operations shall be statically bounded by the generated model, enabling deterministic worst-case execution time (WCET) analysis.
   * The generation report shall include static metrics: `Maximum hierarchy depth`, `Maximum transition exit depth`, `Maximum transition entry depth`, and `Maximum state actions per step`.
2. **Transition Execution Order (`GEN-FUN-008`):**
   * For **external transitions**: Source Exit Actions $\rightarrow$ Transition Action $\rightarrow$ Destination Entry Actions.
   * For **internal transitions**: Transition Action executed; zero exit/entry actions performed.
   * For **local transitions**: Sub-state exit/entry executed without exiting/re-entering containing parent state.
3. **Variable Shadowing Prevention (`GEN-CODE-002`):**
   * Generated local variables within transition/action functions shall use unique namespaced identifiers (e.g. `const bool sm_t14_guard_eval = ...`).
   * Generated C code shall compile warning-free under `-Wshadow -Werror`.

### 3.2 Type Mapping & Timing Semantics
1. **Data Types & Static Portability Assertions (`GEN-DATA-001` - `GEN-DATA-003`):**
   * Integer model types shall map strictly to fixed-width types from `<stdint.h>` (`uint8_t`, `int16_t`, `uint32_t`, etc.).
   * Boolean values shall map to `bool` from `<stdbool.h>`.
   * Floating-point model types shall map explicitly to `float` or `double`.
   * Type width assumptions shall be validated via C portability assertions:
     ```c
     #if defined(__STDC_VERSION__) && (__STDC_VERSION__ >= 201112L)
     #define SM_STATIC_ASSERT(cond, msg) _Static_assert((cond), msg)
     #else
     #define SM_STATIC_ASSERT_GLUE_(a, b) a##b
     #define SM_STATIC_ASSERT_GLUE(a, b) SM_STATIC_ASSERT_GLUE_(a, b)
     #define SM_STATIC_ASSERT(cond, msg) typedef char SM_STATIC_ASSERT_GLUE(sm_static_assert_, __LINE__)[(cond) ? 1 : -1]
     #endif
     SM_STATIC_ASSERT(sizeof(float) == 4U, "Unsupported float storage width");
     SM_STATIC_ASSERT(sizeof(double) == 8U, "Unsupported double storage width");
     ```
2. **Timing Model & Wraparound (`GEN-TIME-001` - `GEN-TIME-004`):**
   * Timebase unit: `uint32_t` milliseconds.
   * Elapsed time comparisons shall use modular subtraction: `(uint32_t)(now - start) >= duration`.
   * Duration Restriction: Generated timeout durations shall not exceed $\text{UINT32\_MAX} / 2$ ($2,147,483,647\text{ ms} \approx 24.8\text{ days}$) to maintain unambiguous modular subtraction.
   * Timebase Model: Documented in `generated/sm_config.h`.

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
   * A valid instance encountering a fatal error latches `SM_Error_t`, latches fault state, and calls `SM_ApplySafeOutputs(instance)`.
4. **XBridges Scale-Aware Matrix Solvers (`GEN-DATA-005`):**
   * Statically bounded storage (`no malloc/free`).
   * Scale-aware pivot validation: `abs(pivot) <= max(abs_eps, rel_eps * scale)`, where `scale` is the maximum absolute element magnitude of the active pivot row.
   * Detection of NaN, Inf, singular, or ill-conditioned inputs triggers `SM_ERR_NUMERIC_FAULT` and safe output fallback.

---

## 4. Traceability & Line Mapping Engine

1. **Traceable Elements Metadata (`ir.traceableElements`):**
   Collection of states, transitions, guards, entry actions, exit actions, transition actions, events, and XBridges operations.
2. **`traceId` Marker Pairing (`GEN-TRACE-001/002`):**
   Generated C files embed unique `traceId` markers:
   ```c
   /* TRACE-BEGIN: traceId=TRACE-T14-GUARD model=T14 symbol=sm_t14_guard */
   case SM_STATE_RUNNING: { ... }
   /* TRACE-END: traceId=TRACE-T14-GUARD */
   ```
3. **Machine-Readable Mapping (`reports/traceability.json`):**
   Post-processing locates markers by `traceId` after formatting. Unmapped markers raise `TRACEABILITY_UNRESOLVED`.

---

## 5. Automated Verification & Differential Execution Engine

### 5.1 Host Compilation Verification (`GEN-TEST-001` - `GEN-TEST-003`)
* Compilation of generated C code using host compiler (`gcc` / `clang` / `cl`) under strict warnings (`-Wshadow -Werror`).
* Execution under ASan and UBSan where supported.

### 5.2 Independent Differential Execution Oracle (`GEN-DIFF-001` - `GEN-DIFF-004`)
* **Independent Semantics (`GEN-DIFF-004`):** `smReferenceInterpreter.ts` evaluates guards, priority, HSM hierarchy, entry/exit actions, events, timers, and variable mutations independently of C generation logic.
* **Canonical Trace Protocol:**
  Contains **1 sequence identifier (`tick`) + 10 behavioral comparison fields**:
  `tick`, `activeStates`, `transitionIds`, `exitActions`, `transitionActions`, `entryActions`, `consumedEvents`, `emittedEvents`, `variables`, `timers`, `error`.
* **Step-by-Step Comparator (`GEN-DIFF-002`):**
  Compares reference trace steps vs actual host-compiled C binary JSONL trace steps. Validates tick equality (`ref.tick === gen.tick`) and canonical fields in fixed order. On mismatch, logs `firstDivergence` and produces deterministic `diff_failure_XXXX.json` replay vectors containing `modelHash`, `generatorVersion`, `seed`, `vectors`, and divergence info.

---

## 6. Verification Status Model & Hierarchical Aggregation Precedence

Verification results enforce a strict 7-state status model (`GEN-RPT-001` - `GEN-RPT-003`):

### Aggregation Precedence Order
When aggregating required verification stages:
1. If any required stage is `FAIL` $\rightarrow$ Overall status is `FAIL`.
2. If any required stage is `UNSUPPORTED` $\rightarrow$ Overall status is `UNSUPPORTED`.
3. If any required stage is `BLOCKED` $\rightarrow$ Overall status is `BLOCKED`.
4. If any required stage is `NOT RUN` $\rightarrow$ Overall status is `NOT RUN`.
5. If all required stages are `PASS` or `NOT APPLICABLE` $\rightarrow$ Overall status is `PASS`.

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

### GEN-SYS-002 — Verification Evidence (No False PASSes)
`GEN-SYS-001` shall be considered `PASS` only when host compilation succeeds, required runtime tests execute successfully, differential execution against actual host-compiled C binary output reports zero divergence, and coverage thresholds are achieved. **No verification component may produce `PASS` from generated placeholders, self-comparison, assumed compiler success, assumed runtime success, or unexecuted stages.**
