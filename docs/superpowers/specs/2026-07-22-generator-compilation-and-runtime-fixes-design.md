# Design Spec: Code Generator Compilation and Runtime Fixes

This design document outlines the solutions to address 10 compilation, runtime, and MISRA C compliance issues in the generated state machine C code, to be implemented within `src/utils/stateMachineCodeGenerator.ts`.

---

## 1. Duplicate Definitions in `sm_config.h`
### Problem
The user reported that `sm_config.h` contains duplicate definitions (typedefs, enums, macros), causing compilation errors. 
### Solution
We will ensure `smConfigH` contains only a single instance of its definitions within the `#ifndef SM_CONFIG_H` / `#define SM_CONFIG_H` guard block, and confirm that no other generator outputs or write-handlers duplicate its content.

---

## 2. Enum Value Collision: `SM_NODE_INVALID = 0U` vs State Indices
### Problem
The state enum starts at `SM_NODE_INVALID = 0U`, meaning state enums start at `1`. However, state indices `SM_ST_*_IDX` were 0-indexed (`0`, `1`, ...). This off-by-one mismatch leads to incorrect array lookup index mapping if state enums are used interchangeably with index macros.
### Solution
- Map state index macros 1-to-1 to their actual enum values: `#define SM_ST_*_IDX <idx + 1>U` (where `idx` is the sorted state index).
- Size the state-dependent arrays (`state_active` and `state_timers` in `ADIA_Instance_t`) to `SM_NUM_STATES + 1U`.
- Adjust initialization loops in `SM_Init` and `SM_Reset` to loop from `0U` to `SM_NUM_STATES` (i.e. `sm_iter <= SM_NUM_STATES` or `sm_iter < SM_NUM_STATES + 1U`).
- Adjust runtime state-active/timer increment and exit loops in `SM_Step` and `SM_Exit_State` to start from `1U` and run up to `SM_NUM_STATES` (i.e. `sm_iter <= SM_NUM_STATES`), mapping directly to `(SM_Node_t)sm_iter` without off-by-one offsets.

---

## 3. Missing MCAL Header / Interface Contract in `sm_core.c`
### Problem
Linker errors and compiler warnings (implicit declaration) occur if the generated `sm_core.c` does not include `mcal_dio.h` or if `mcal_dio.h` is missing its interface contracts (e.g., prototypes/definitions for `MCAL_Dio_ReadChannel`, `MCAL_Dio_WriteChannel`, and pin macros).
### Solution
Ensure `mcal_dio.h` is always generated and contains clean prototypes/inlined implementations for `MCAL_Dio_ReadChannel(uint32_t)`, `MCAL_Dio_WriteChannel(uint32_t, bool)`, and `MCAL_Watchdog_Kick(void)`. `sm_core.c` will always include `"mcal_dio.h"` (when HIL is disabled) or `"hil_interface.h"` (when HIL is enabled).

---

## 4. I/O Binding Logic Mismatch with Model Intent
### Problem
The generator fell back to binding arbitrary variables (like `component_active` and `counter`) to hardware pins when no prefix matched, overwriting internal variables and causing incorrect type conversions (e.g. `counter != 0` for digital outputs).
### Solution
- Eliminate the arbitrary fallback binding logic.
- Clearly separate inputs, outputs, and internal variables using strict name prefix and suffix matching:
  - **Inputs**: variable name starts with `in_`, `sensor_`, `btn_`, `sw_`, `input_`, `button_` OR ends with `_in`, `_sensor`, `_btn`, `_sw`, `_button`, `_input`.
  - **Outputs**: variable name starts with `out_`, `led_`, `motor_`, `output_`, `actuator_`, `relay_`, `valve_` OR ends with `_out`, `_led`, `_motor`, `_active`, `_output`, `_actuator`, `_relay`, `_valve`.
  - **Internal Variables**: Not bound to I/O channels.
- If there are no input variables, generated `syncInputsCode` will simply use `(void)instance;` to satisfy compiler warnings.
- If there are no output variables, generated `syncOutputsCode` will use `(void)instance;`.

---

## 5. Spurious Variable `x` in `SM_Data_t`
### Problem
The user raised concerns about phantom variables like `x` and `state_timer` polluting the `SM_Data_t` struct, which is exposed to external integrations.
### Solution
- Verify that `x` is not injected by the generator (it only appears if defined by the user or in tests).
- Move the internal global state machine timer `state_timer` out of `SM_Data_t` and place it inside `ADIA_Instance_t` (accessed as `instance->state_timer`), keeping `SM_Data_t` exclusively for user-defined model variables.

---

## 6. `SM_NUM_STATES` vs Actual State Count
### Problem
Buffer overflow risks if `SM_NODE_ERROR` or `SM_NODE_SAFE` enums are used to index into state-dependent tracking arrays sized to `SM_NUM_STATES`.
### Solution
- Size the state-dependent tracking arrays to `SM_NUM_STATES + 1U` to safely accommodate state enums (which start at index 1).
- Ensure that `SM_NODE_ERROR` and `SM_NODE_SAFE` are never used as indices into `state_active` or `state_timers`. (Their enum values are greater than `SM_NUM_STATES`, and all loops only iterate up to `SM_NUM_STATES`).

---

## 7. Missing `const` Qualifiers and Pointer Safety
### Problem
MISRA C:2012 Rule 8.13 recommends using `const` for pointer parameters that are not modified.
### Solution
Ensure `const` qualifiers are consistently used on functions that only read the state machine context:
- `SM_Node_t SM_GetActive(const ADIA_Instance_t* instance, SM_Group_t g);`
- `SM_Error_t SM_GetError(const ADIA_Instance_t* instance);`
- `SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t* instance);`
(These are already declared as such in the generator templates, and we will preserve them).

---

## 8. No `volatile` on Hardware-Mapped Data
### Problem
Variables synchronized in `SM_Sync_IO` (which may be accessed from both tick tasks and ISRs) need `volatile` to prevent compiler optimization bugs.
### Solution
Ensure all fields in `SM_Data_t` generated from the model's user-defined variables are declared with `volatile` qualifiers:
```c
typedef struct {
    volatile int32_t counter;
    volatile bool flag;
    ...
} SM_Data_t;
```

---

## 9. No Return Value on `SM_Sync_IO`
### Problem
`SM_Sync_IO` does not return an error status, making it harder to detect and propagate I/O failures.
### Solution
Modify the prototype and implementation of `SM_Sync_IO` to return `SM_Error_t` (returning `SM_ERR_NONE` by default).

---

## 10. Missing `void` in Empty Parameter Lists
### Problem
Functions with empty parameter lists (like `MCAL_Watchdog_Kick`) must explicitly declare `(void)` to satisfy MISRA C and prevent implicit parameter interpretation.
### Solution
Ensure all empty parameter functions are declared as `func_name(void)` instead of `func_name()`. (This is already implemented in `MCAL_Watchdog_Kick(void)` and `SM_March_RAM_Test(void)`, and we will preserve it).

---

## Verification Plan

### Automated Tests
We will execute the existing test suites using Vitest:
`npx.cmd vitest run src/utils/stateMachineCodeGenerator.test.ts --exclude "**/.kilo/**"`

We will update the snapshot files and update any specific test cases in `stateMachineCodeGenerator.test.ts` and `stateMachineCodeGenerator.phase2.test.ts` that explicitly check for:
- `state_active` array sizes and 1-based indexing offsets.
- `state_timer` inside `ADIA_Instance_t` instead of `data.state_timer`.
- The new `volatile` qualifiers in `SM_Data_t`.
- `SM_Sync_IO` returning `SM_Error_t`.
