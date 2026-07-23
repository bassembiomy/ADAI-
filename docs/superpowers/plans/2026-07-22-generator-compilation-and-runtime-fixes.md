# Code Generator Compilation and Runtime Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address 10 critical, major, and minor compilation and runtime code generation bugs in `src/utils/stateMachineCodeGenerator.ts` and update related unit tests and snapshots.

**Architecture:** We will adjust the code generator template strings to size state active and timer tracking arrays to `SM_NUM_STATES + 1U`, map indices 1-to-1 to state enum values, separate internal state timers from public `SM_Data_t`, enforce strict prefix/suffix I/O mapping filters (removing fallback mapping), add `volatile` qualifiers to variable members, and update `SM_Sync_IO` to return `SM_Error_t`.

**Tech Stack:** TypeScript, Node.js, Vitest, C (MISRA-C:2012 / C99).

## Global Constraints
- Target generator file: `src/utils/stateMachineCodeGenerator.ts`
- Target test file: `src/utils/stateMachineCodeGenerator.test.ts`
- Target phase 2 test file: `src/utils/stateMachineCodeGenerator.phase2.test.ts`
- Target snap file: `src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap`
- All code changes must compile with zero warnings under gcc / avr-gcc where relevant.

---

### Task 1: Refactor State Index Mapping and Sizing
**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: Existing array definition templates.
- Produces: `state_timers[SM_NUM_STATES + 1U]`, `state_active[SM_NUM_STATES + 1U]`, and 1-based indexing for `_IDX` macros.

- [ ] **Step 1: Update State Index Mapping**
  Change the map initialization to map state IDs to 1-based indices (so `idx + 1` instead of `idx`):
  ```typescript
  // Change:
  // sortedStates.forEach((s, idx) => stateIndexMap.set(s.id, idx));
  // To:
  sortedStates.forEach((s, idx) => stateIndexMap.set(s.id, idx + 1));
  ```

- [ ] **Step 2: Update state index macro definitions in sm_config.h**
  Update `SM_ST_*_IDX` macros to use `(idx + 1)`:
  ```typescript
  // Change:
  // ${sortedStates.map((s, idx) => `#define ${stateEnum(s)}_IDX ${idx}U`).join('\n')}
  // To:
  ${sortedStates.map((s, idx) => `#define ${stateEnum(s)}_IDX ${(idx + 1)}U`).join('\n')}
  ```

- [ ] **Step 3: Update state timers and active arrays size in sm_config.h**
  Sizing arrays to `SM_NUM_STATES + 1U` to safely allow 1-based indexing.
  ```typescript
  // Change:
  //     ${timeType} state_timers[SM_NUM_STATES];
  //     bool state_active[SM_NUM_STATES];
  // To:
  //     ${timeType} state_timers[SM_NUM_STATES + 1U];
  //     bool state_active[SM_NUM_STATES + 1U];
  ```

- [ ] **Step 4: Update loops to initialize SM_NUM_STATES + 1U elements**
  Modify loops in `SM_Init` and `SM_Reset` to run up to `SM_NUM_STATES`:
  ```typescript
  // Change:
  //     for (sm_iter = 0U; sm_iter < SM_NUM_STATES; sm_iter++) {
  // To:
  //     for (sm_iter = 0U; sm_iter <= SM_NUM_STATES; sm_iter++) {
  ```

- [ ] **Step 5: Update step/exit loops to cast sm_iter directly**
  Change exit loops in `SM_Step` and `SM_Exit_State` to start from `1U` and cast `sm_iter` directly to state enum type:
  ```typescript
  // Change:
  //         for (sm_iter = 0U; sm_iter < SM_NUM_STATES; sm_iter++) {
  //             if (instance->state_active[sm_iter]) {
  //                 SM_Exit_State(instance, (SM_Node_t)(sm_iter + 1U));
  //             }
  //         }
  // To:
  //         for (sm_iter = 1U; sm_iter <= SM_NUM_STATES; sm_iter++) {
  //             if (instance->state_active[sm_iter]) {
  //                 SM_Exit_State(instance, (SM_Node_t)sm_iter);
  //             }
  //         }
  ```

---

### Task 2: Move global state_timer out of SM_Data_t to ADIA_Instance_t
**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts`

**Interfaces:**
- Consumes: `SM_Data_t` and `ADIA_Instance_t` struct definitions.
- Produces: Struct fields with `state_timer` inside `ADIA_Instance_t`.

- [ ] **Step 1: Remove state_timer from SM_Data_t struct template**
  Update the template for `SM_Data_t`:
  ```typescript
  // Change:
  // typedef struct {
  // ${sortedVariables.length > 0 ? sortedVariables.map(v => `    ${getCTimeType(v.type)} ${v.name};`).join('\n') : ''}
  // ${blockStates.length > 0 ? blockStates.join('\n') + '\n' : ''}    ${timeType} state_timer;
  // } SM_Data_t;
  // To:
  // typedef struct {
  // ${sortedVariables.length > 0 ? sortedVariables.map(v => `    volatile ${getCTimeType(v.type)} ${v.name};`).join('\n') : ''}
  // ${blockStates.length > 0 ? blockStates.join('\n') + '\n' : ''}
  // } SM_Data_t;
  ```
  *(Note: This also adds the `volatile` qualifier as per Issue 8).*

- [ ] **Step 2: Add state_timer to ADIA_Instance_t struct template**
  Update the template for `ADIA_Instance_t`:
  ```typescript
  // Change:
  // typedef struct {
  //     SM_Node_t active_states[SM_NUM_LAYERS];
  //     SM_Node_t history_states[SM_NUM_LAYERS];
  //     ${timeType} state_timers[SM_NUM_STATES];
  //     bool state_active[SM_NUM_STATES];
  //     SM_Data_t data;
  //     SM_Error_t error_status;
  // } ADIA_Instance_t;
  // To:
  // typedef struct {
  //     SM_Node_t active_states[SM_NUM_LAYERS];
  //     SM_Node_t history_states[SM_NUM_LAYERS];
  //     ${timeType} state_timers[SM_NUM_STATES + 1U];
  //     bool state_active[SM_NUM_STATES + 1U];
  //     ${timeType} state_timer;
  //     SM_Data_t data;
  //     SM_Error_t error_status;
  // } ADIA_Instance_t;
  ```

- [ ] **Step 3: Update timer initialization and step increment accesses**
  Update `SM_Init` and `SM_Step` templates in the generator:
  - In `SM_Init`, change `instance->data.state_timer = ${zeroLiteral};` to `instance->state_timer = ${zeroLiteral};`.
  - In `SM_Step`, change `instance->data.state_timer` to `instance->state_timer` in the overflow check and increment statement.

---

### Task 3: Refactor I/O Binding Filters and SM_Sync_IO return type
**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts`

**Interfaces:**
- Consumes: I/O variables definitions.
- Produces: `SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance)`.

- [ ] **Step 1: Define isInputVariable and isOutputVariable helpers**
  Add the helper functions for name filtering:
  ```typescript
  const isInputVariable = (name: string): boolean => {
    return name.startsWith('in_') || name.startsWith('sensor_') || name.startsWith('btn_') || name.startsWith('sw_') || name.startsWith('input_') || name.startsWith('button_') ||
           name.endsWith('_in') || name.endsWith('_sensor') || name.endsWith('_btn') || name.endsWith('_sw') || name.endsWith('_button') || name.endsWith('_input');
  };

  const isOutputVariable = (name: string): boolean => {
    return name.startsWith('out_') || name.startsWith('led_') || name.startsWith('motor_') || name.startsWith('output_') || name.startsWith('actuator_') || name.startsWith('relay_') || name.startsWith('valve_') ||
           name.endsWith('_out') || name.endsWith('_led') || name.endsWith('_motor') || name.endsWith('_active') || name.endsWith('_output') || name.endsWith('_actuator') || name.endsWith('_relay') || name.endsWith('_valve');
  };
  ```

- [ ] **Step 2: Update I/O variable filter and remove fallback logic**
  Replace lines 1537-1570 with:
  ```typescript
    let inPinIdx = 0;
    let outPinIdx = 0;
    sortedVariables.forEach(v => {
      if (isInputVariable(v.name)) {
        syncInputsCode += `    instance->data.${v.name} = (${getCTimeType(v.type)})MCAL_Dio_ReadChannel(MCAL_PIN_INPUT_${inPinIdx});\n`;
        inPinIdx++;
      } else if (isOutputVariable(v.name)) {
        syncOutputsCode += `    MCAL_Dio_WriteChannel(MCAL_PIN_OUTPUT_${outPinIdx}, ${boolCoerce(v)});\n`;
        outPinIdx++;
      }
    });
    
    if (!syncInputsCode.trim()) {
      syncInputsCode = '    (void)instance;\n';
    }
    if (!syncOutputsCode.trim()) {
      syncOutputsCode = '    (void)instance;\n';
    }
  ```

- [ ] **Step 3: Update dynamic MCAL_PIN count calculation**
  Update lines 1665-1668 to use `isInputVariable` and `isOutputVariable`:
  ```typescript
  const inPrefixVars = sortedVariables.filter(v => isInputVariable(v.name));
  const outPrefixVars = sortedVariables.filter(v => isOutputVariable(v.name));
  ```

- [ ] **Step 4: Update SM_Sync_IO signature and return type**
  Change all declarations/definitions of `SM_Sync_IO` to:
  - Header files `sm_core.h`: `SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance);`
  - Core C file declarations and definitions:
    ```c
    SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance);
    
    ...
    
    /**
     * @brief Synchronizes state machine variables with MCAL hardware channels.
     * @param instance Pointer to state machine context
     * @return SM_Error_t Sync result error status
     */
    SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance) {
        if (instance == NULL) {
            return SM_ERR_NONE;
        }
        /* MCAL-to-SM Input Signal Binding */
    ${syncInputsCode}
        /* SM-to-MCAL Output Signal Binding */
    ${syncOutputsCode}
        return SM_ERR_NONE;
    }
    ```

---

### Task 4: Align Unit Tests and Update Snapshots
**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`
- Modify: `src/utils/stateMachineCodeGenerator.phase2.test.ts`
- Update: `src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap`

- [ ] **Step 1: Update test file validations**
  Adjust checking code in `stateMachineCodeGenerator.test.ts` to expect the updated structures:
  - Change checks from `instance->data.state_timer` to `instance->state_timer`.
  - Change checks for array size `state_timers[SM_NUM_STATES]` to `state_timers[SM_NUM_STATES + 1U]`.
  - Change checks from `instance->state_active[0U] = true;` to `instance->state_active[1U] = true;` (since state indices are now 1-based).
  - Update any check for `SM_Sync_IO` returning `SM_Error_t`.

- [ ] **Step 2: Update phase2 test file validations**
  Update expectations in `stateMachineCodeGenerator.phase2.test.ts` for:
  - Loop variable `sm_iter` conditions checking `sm_iter <= SM_NUM_STATES`.
  - `state_timers` declarations/arrays.

- [ ] **Step 3: Run Vitest with Snapshot Update**
  Command: `npx.cmd vitest run src/utils/stateMachineCodeGenerator -u`
  Verify all tests pass and that snapshots are successfully written.
