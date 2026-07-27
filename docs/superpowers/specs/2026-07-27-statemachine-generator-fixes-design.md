# ADIA State Machine Code Generator Fixes Design Spec

## Overview
This design document defines the architectural enhancements to `stateMachineCodeGenerator.ts` and generated C files (`sm_core.c`, `sm_safety.c`, `sm_config.h`, `mcal_dio.h`) to fix core code quality, I/O isolation, state hierarchy, and execution bugs identified in static code reviews.

---

## 1. I/O Signal Isolation (`sm_core.c` & `sm_core.h`)

### Problem
Variables stored in `instance->data` can be overwritten by hardware input pin reads during `SM_Sync_IO()` even when used internally as multi-bit integers or state counters, causing unexpected state transition behavior.

### Solution
- Split `SM_Sync_IO()` into `SM_ReadInputs(instance)` and `SM_WriteOutputs(instance)`.
- Restrict `MCAL_Dio_ReadChannel` reads exclusively to variables designated as hardware input signals.
- Preserve internal state variables in `instance->data` without hardware overwrite risk.

---

## 2. Complete State Machine Reset (`SM_Reset()`)

### Problem
`SM_Reset()` currently clears `active_states` and `state_timers`, but omits `instance->state_timer` and variable defaults in `instance->data`.

### Solution
Update `SM_Reset()` to:
1. Reset `instance->state_timer = 0`.
2. Clear `active_states`, `history_states`, `state_timers`, and `state_active` arrays.
3. Reset `instance->error_status = SM_ERR_NONE`.
4. Restore default initial values for all variables in `instance->data`.
5. Enter root state layer (`SM_Enter_Layer_0`).

---

## 3. Non-Blocking Parallel State Transitions

### Problem
Conditional internal state transitions inside state step handlers currently execute early `return;` statements. This short-circuits execution and prevents subsequent parallel layer step functions (`SM_Step_Layer_X`) from running in the current tick.

### Solution
Replace early `return;` logic in step handlers with structured conditional branching (`if / else if`), ensuring step handlers for all active parallel layers complete execution every tick.

---

## 4. Hierarchical Consistency Checking (`SM_Validate_State_Consistency`)

### Problem
`SM_Validate_State_Consistency()` only checks enum numerical bounds (`state < SM_NUM_STATES`), failing to detect broken parent-child state relationships.

### Solution
- Generate static lookup array `SM_State_Parent_Map` in `sm_safety.c` mapping each state enum to its parent state enum.
- In `SM_Validate_State_Consistency(instance)`:
  1. Verify enum range.
  2. For every state marked `state_active[s] == true`, verify its parent state is active in `active_states`.
  3. Return `SM_ERR_INVALID_STATE` if a child state is active without its parent state being active.

---

## 5. MCAL Driver Guards (`mcal_dio.h`)

### Problem
Default stub inline functions in `mcal_dio.h` silently return `false` or do nothing without warning the user.

### Solution
Add preprocessor warnings and `#ifndef MCAL_CUSTOM_DIO` guards in `mcal_dio.h` instructing developers to provide real hardware channel implementations.

---

## 6. Layer Count Optimization (`sm_config.h`)

### Problem
`SM_NUM_LAYERS` counts total tree depth, including unpopulated layer indices.

### Solution
Prune unpopulated layers during state tree traversal before rendering `SM_NUM_LAYERS` in `sm_config.h`.

---

## Verification Plan

### Automated Tests
- Run unit tests: `npm test src/utils/stateMachineCodeGenerator.test.ts`
- Run C compilation / validation tests: `npm test src/utils/validateGeneratedCode.test.ts`
- Run orbital validator tests: `npm test src/utils/antigravity/orbitalValidator.test.ts`

### New Test Cases
1. Verify `SM_Reset` clears `state_timer` and re-applies `instance->data` variable initial values.
2. Verify `SM_Validate_State_Consistency` fails with `SM_ERR_INVALID_STATE` when parent-child relationships are invalid.
3. Verify step handlers for all parallel state layers execute in a single step tick without being blocked by early returns.
