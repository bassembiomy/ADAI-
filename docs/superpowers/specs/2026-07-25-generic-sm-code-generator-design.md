# Design Spec: Generic State Machine Code Generator Engine & Terminal Auto-Reset

## Overview
This design updates the state machine code generation engine (`stateMachineCodeGenerator.ts`) to be completely generic, robust, and capable of generating 100% compilable MISRA-compliant C code for any user-drawn model topology without requiring model edits.

Key features include:
1. Elimination of all C syntax build-blockers (closing brace enforcement, header guards, template validation).
2. End / Terminal Node support and automatic return-to-autostart behavior for sink states across all hierarchy layers.
3. Non-blocking handling of unreachable states with warning annotations.
4. Dynamic signal mapping in `SM_Sync_IO` and complete watchdog kick hardware stubs in `mcal_dio.h`.

---

## 1. Syntactic Integrity & Header Guard Enforcement

* **Closing Braces in Header & Source Templates**:
  * Fix inline function definitions in `sm_core.h` (`SM_Data_Legacy`), `sm_safety.h`, `mcal_dio.h`, and `sm_user_logic.c` to guarantee balanced `{` and `}` braces.
  * Guarantee 1-to-1 prototype-to-definition parity between `sm_user_logic.h` and `sm_user_logic.c` for all `Entry`, `During`, `Exit`, and `XBridges_Step` state actions.
* **Template Code Validation**:
  * Enhance `validateGeneratedCode()` to check brace depth (`{` vs `}`) and report/auto-fix any dangling scopes before returning file content.

---

## 2. End Component & Terminal Auto-Reset Logic

* **Terminal / End Node Recognition**:
  * Support state/junction nodes designated as terminal or end states (`type === 'end'` or `isFinal === true`).
* **Hierarchical Auto-Reset Behavior**:
  * When execution reaches an End node in any child layer or leaf state with no outgoing transitions:
    * Exit active child states in sequence.
    * Automatically reset execution to the root layer's primary autostart state (`State_1`).
* **Non-Blocking Sink State Handling**:
  * Trapped states (sink states) generate valid C code and emit non-fatal warnings into `sm_testing_report.md` instead of throwing generator errors.

---

## 3. Unreachable States Handling

* **Dead Logic Graceful Degradation**:
  * Generate standard C entry/during/exit function stubs in `sm_user_logic.c` annotated with `/* UNREACHABLE STATE: No transition path from autostart */`.
  * Ensure the C build always succeeds without unused function or undefined symbol errors.

---

## 4. Driver & Integration (`SM_Sync_IO` & `MCAL_Watchdog_Kick`)

* **Dynamic Signal Mapping in `SM_Sync_IO`**:
  * Automatically iterate over declared model variables (`variables[]`).
  * Map input variables (names starting with `in_`, `sensor_`, `button_`, `sw_`, etc.) to `instance->data.<var> = (type)MCAL_Dio_ReadChannel(channel_id);`.
  * Map output variables (names starting with `out_`, `led_`, `motor_`, `y`, etc.) to `MCAL_Dio_WriteChannel(channel_id, (Dio_LevelType)instance->data.<var>);`.
* **Watchdog Kick Implementation**:
  * Provide functional `#define MCAL_Watchdog_Kick() ((void)0)` and prototype stubs in `mcal_dio.h` so `SM_Watchdog_Kick()` compiles cleanly in both hardware and HIL/host test builds.

---

## Verification Plan

### Automated Tests (`vitest`)
* Run full vitest suite on `stateMachineCodeGenerator.test.ts`.
* Add test cases for:
  1. Compiling model with sink states (`statemachine.json` topology) using `avr-gcc` / host C compiler.
  2. Verifying Terminal node auto-reset logic returns execution to root autostart state.
  3. Verifying `sm_core.h`, `sm_user_logic.c`, and `mcal_dio.h` have balanced braces and zero syntax errors.
  4. Verifying `SM_Sync_IO` generates dynamic hardware read/write calls for model variables.

### Compilation Check
* Verify all 9 output C/H files compile cleanly under GCC without warnings.
