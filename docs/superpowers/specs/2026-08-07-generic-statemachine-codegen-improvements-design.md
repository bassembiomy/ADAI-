# Generic State Machine Code Generator — Design Specification

**Date:** 2026-08-07  
**Status:** APPROVED FOR EXECUTION  
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
   * Precomputes LCA and exit/entry paths at generation time for 3 transition kinds (`external`, `internal`, `local`) across 7 hierarchy scenarios:
     - Child $\rightarrow$ sibling
     - Child $\rightarrow$ ancestor
     - Ancestor $\rightarrow$ descendant
     - Cross-branch
     - External self
     - Internal
     - Local
   * Runtime execution performs zero dynamic hierarchy search.
   * Maximum number of exit/entry operations is statically bounded by generated model.
2. **Transition Execution Order (`GEN-FUN-008`):**
   * For **external transitions**: Source Exit Actions $\rightarrow$ Transition Action $\rightarrow$ Destination Entry Actions.
   * For **internal transitions**: Transition Action executed; zero exit/entry actions performed.
   * For **local transitions**: Sub-state exit/entry executed without exiting/re-entering containing parent state.
3. **Variable Shadowing Prevention (`GEN-CODE-002`):**
   * Local variables inside transition/action functions use unique namespaced identifiers (e.g. `const bool sm_t14_guard_eval = ...`).
   * Generated C code compiles warning-free under `-Wshadow -Werror`.

### 3.2 Type Mapping & Timing Semantics
1. **Data Types & Static Portability Assertions (`GEN-DATA-001` - `GEN-DATA-003`):**
   * Integer types map to `<stdint.h>`, booleans to `<stdbool.h>`, floats to `float`/`double`.
   * Type width assumptions validated via `SM_STATIC_ASSERT`:
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
   * Elapsed time comparisons use modular subtraction: `(uint32_t)(now - start) >= duration`.
   * Timeout durations shall not exceed $\text{UINT32\_MAX} / 2$.

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
   * If a public API receives a `NULL` instance pointer, it returns `SM_ERR_NULL_POINTER` immediately without dereferencing `instance`.
3. **Instance Runtime Fault Latching (`GEN-SAFE-001` - `GEN-SAFE-004`):**
   * Latches specific `SM_Error_t`, latches fault state, and calls `SM_ApplySafeOutputs(instance)`.
4. **XBridges Scale-Aware Matrix Solvers (`GEN-DATA-005`):**
   * Statically bounded storage (`no malloc/free`).
   * Scale-aware pivot validation: `abs(pivot) <= max(abs_eps, rel_eps * scale)`, where `scale` is the maximum absolute row magnitude.
   * Executable tests verify Identity (PASS), Well-conditioned (PASS), Exactly singular (`SM_ERR_NUMERIC_FAULT`), Near singular (`SM_ERR_NUMERIC_FAULT`), Small well-scaled (PASS), NaN (`SM_ERR_NUMERIC_FAULT`), Inf (`SM_ERR_NUMERIC_FAULT`).

---

## 4. Traceability & Line Mapping Engine

1. **Traceable Elements Metadata (`ir.traceableElements`):**
   Collection of states, transitions, guards, entry actions, exit actions, transition actions, events, and XBridges operations.
2. **`traceId` Marker Pairing (`GEN-TRACE-001/002`):**
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
* **Independent Semantics (`GEN-DIFF-004`):** `smReferenceInterpreter.ts` evaluates guards, priority, HSM hierarchy, entry/exit actions, events, timers, and variable mutations independently of C generation code via 9 semantic milestones (7A-7I).
* **Canonical Trace Protocol:**
  Contains **1 sequence key (`tick`) + 10 behavioral comparison fields**:
  `tick`, `activeStates`, `transitionIds`, `exitActions`, `transitionActions`, `entryActions`, `consumedEvents`, `emittedEvents`, `variables`, `timers`, `error`.
* **Host Binary JSONL Execution:** Host harness stdout parsed line-by-line using `JSON.parse()` asserting trace schema.
* **Step-by-Step Comparator (`GEN-DIFF-002`):**
  Compares reference trace steps vs actual host C binary JSONL trace steps. Validates trace length and tick equality (`ref.tick === gen.tick`). Mismatch in trace length or any field reports `FAIL` and logs `firstDivergence`.
* **Deterministic Replay Context Vectors:**
  Failing differential tests produce `reports/failures/diff_failure_XXXX.json` containing `modelHash`, `generatorVersion`, `seed`, `vectors`, and divergence info.

---

## 6. Verification Status Model & Hierarchical Aggregation Precedence

Verification results distinguish `VerificationStatus` from overall product status:

```typescript
export type VerificationStatus =
  | 'PASS'
  | 'FAIL'
  | 'NOT RUN'
  | 'NOT APPLICABLE'
  | 'UNSUPPORTED'
  | 'INTEGRATION REQUIRED'
  | 'BLOCKED';

export type ProductVerificationStatus =
  | 'PASS'
  | 'FAIL'
  | 'INCOMPLETE';

export interface AggregatedStatus {
  behavioralGenerationStatus: VerificationStatus;
  targetIntegrationStatus: VerificationStatus;
  productVerificationStatus: ProductVerificationStatus;
}
```

### Aggregation Precedence Order
When aggregating required verification stages:
1. `FAIL`
2. `UNSUPPORTED`
3. `BLOCKED`
4. `NOT RUN`
5. `PASS` (or `NOT APPLICABLE` if stage is optional)

---

## 7. Core Acceptance Requirements

### GEN-SYS-001 — Behavioral Equivalence
Given identical initial configuration, ordered inputs, events, and timing observations, the generated C implementation shall produce the same observable behavioral trace as the independent reference semantics for every supported model construct.

### GEN-SYS-002 — Verification Evidence (No False PASSes)
`GEN-SYS-001` shall be considered `PASS` only when host compilation succeeds, required runtime tests execute successfully, differential execution against actual host-compiled C binary output reports zero divergence, and coverage thresholds are achieved. **No verification component may produce `PASS` from generated placeholders, self-comparison, assumed compiler success, assumed runtime success, or unexecuted stages.**
