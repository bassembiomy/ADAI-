# State Machine Generator Code Quality & Safety Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor ADIA C state machine generator (`stateMachineCodeGenerator.ts`) to fix core I/O isolation, complete reset, non-blocking parallel layer execution, state hierarchy checking, and MCAL driver safety.

**Architecture:** Update template rendering logic in `stateMachineCodeGenerator.ts` to generate robust C99 compliant state machine code (`sm_core.c`, `sm_core.h`, `sm_safety.c`, `sm_safety.h`, `sm_config.h`, `mcal_dio.h`).

**Tech Stack:** TypeScript, Jest, C99, Node.js

## Global Constraints
- Target codebase: `src/utils/stateMachineCodeGenerator.ts`
- Must maintain C99 compatibility and zero compiler warnings.
- Must not break existing snapshot or validation tests.

---

### Task 1: Complete State Machine Reset (`SM_Reset`)

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts:1974-1995`
- Test: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: State machine chart context and sorted variables
- Produces: Generated `SM_Reset` C function clearing `instance->state_timer` and reinitializing `instance->data` fields.

- [ ] **Step 1: Write failing unit test for complete SM_Reset reinitialization**

```typescript
// In src/utils/stateMachineCodeGenerator.test.ts
it('should generate SM_Reset that resets state_timer and instance data variables', () => {
  const result = generateStateMachineCode(mockChart);
  const coreC = result.files.find(f => f.filename === 'sm_core.c')?.content || '';
  expect(coreC).toContain('instance->state_timer = 0');
  expect(coreC).toContain('instance->data.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/stateMachineCodeGenerator.test.ts -t "resets state_timer"`
Expected: FAIL (missing `instance->state_timer = 0` inside `SM_Reset` body in `sm_core.c`)

- [ ] **Step 3: Update `SM_Reset` C code generator template**

Modify `SM_Reset` rendering in `src/utils/stateMachineCodeGenerator.ts` to include:
```c
void SM_Reset(ADIA_Instance_t* instance) {
    uint32_t sm_iter;
    if (instance == NULL) {
        return;
    }
    instance->state_timer = 0U;
    for (sm_iter = 0U; sm_iter < SM_NUM_LAYERS; sm_iter++) {
        instance->active_states[sm_iter] = SM_NODE_INVALID;
        instance->history_states[sm_iter] = SM_NODE_INVALID;
    }
    for (sm_iter = 0U; sm_iter <= SM_NUM_STATES; sm_iter++) {
        instance->state_timers[sm_iter] = 0U;
        instance->state_active[sm_iter] = false;
    }
    instance->error_status = SM_ERR_NONE;
    SM_Enter_Layer_0(instance, false);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/stateMachineCodeGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "fix(generator): extend SM_Reset to reset state_timer and data defaults"
```

---

### Task 2: I/O Signal Isolation (`SM_Sync_IO` splitting into `SM_ReadInputs` and `SM_WriteOutputs`)

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts:1880-1906, 1995-2015`
- Test: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: Sorted input/output variables from chart context
- Produces: `SM_ReadInputs()` and `SM_WriteOutputs()` static helpers called sequentially by `SM_Sync_IO()`.

- [ ] **Step 1: Write failing unit test for I/O signal isolation helpers**

```typescript
// In src/utils/stateMachineCodeGenerator.test.ts
it('should generate SM_ReadInputs and SM_WriteOutputs helper functions in SM_Sync_IO', () => {
  const result = generateStateMachineCode(mockChartWithIO);
  const coreC = result.files.find(f => f.filename === 'sm_core.c')?.content || '';
  expect(coreC).toContain('static void SM_ReadInputs(ADIA_Instance_t* instance)');
  expect(coreC).toContain('static void SM_WriteOutputs(ADIA_Instance_t* instance)');
  expect(coreC).toContain('SM_ReadInputs(instance);');
  expect(coreC).toContain('SM_WriteOutputs(instance);');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/stateMachineCodeGenerator.test.ts -t "SM_ReadInputs"`
Expected: FAIL

- [ ] **Step 3: Update `SM_Sync_IO` rendering in `stateMachineCodeGenerator.ts`**

Generate `SM_ReadInputs` and `SM_WriteOutputs` functions in `sm_core.c` and call them within `SM_Sync_IO`:
```c
static void SM_ReadInputs(ADIA_Instance_t* instance) {
    /* Read physical pins only into designated hardware input signals */
}

static void SM_WriteOutputs(ADIA_Instance_t* instance) {
    /* Write designated hardware output signals to physical pins */
}

SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance) {
    if (instance == NULL) {
        return SM_ERR_NONE;
    }
    SM_ReadInputs(instance);
    SM_WriteOutputs(instance);
    return SM_ERR_NONE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/stateMachineCodeGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "fix(generator): split SM_Sync_IO into SM_ReadInputs and SM_WriteOutputs"
```

---

### Task 3: Non-Blocking Parallel State Transitions

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts:1600-1800`
- Test: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: Transition list and layer state hierarchies
- Produces: Structured `if/else` transition checks in layer step functions without short-circuiting early returns.

- [ ] **Step 1: Write failing unit test for structured non-blocking transition branching**

```typescript
// In src/utils/stateMachineCodeGenerator.test.ts
it('should generate layer step handlers without early returns in transition checks', () => {
  const result = generateStateMachineCode(mockParallelChart);
  const coreC = result.files.find(f => f.filename === 'sm_core.c')?.content || '';
  expect(coreC).not.toMatch(/if\s*\([^)]+\)\s*\{\s*instance->data\.[^;]+;\s*return;\s*\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/stateMachineCodeGenerator.test.ts -t "without early returns"`
Expected: FAIL

- [ ] **Step 3: Update transition handler rendering in `stateMachineCodeGenerator.ts`**

Replace early `return;` inside internal action handlers with structured `if/else if` blocks so all active parallel layer step handlers run during every tick.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/stateMachineCodeGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "fix(generator): remove early returns from internal state transition handlers"
```

---

### Task 4: Hierarchical State Consistency (`SM_Validate_State_Consistency`)

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts:1160-1180`
- Test: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: State parent-child tree mapping
- Produces: `SM_State_Parent_Map` lookup table and hierarchy validator in `sm_safety.c`.

- [ ] **Step 1: Write failing unit test for parent-child state consistency validation**

```typescript
// In src/utils/stateMachineCodeGenerator.test.ts
it('should generate static SM_State_Parent_Map and check active parent states in SM_Validate_State_Consistency', () => {
  const result = generateStateMachineCode(mockChart);
  const safetyC = result.files.find(f => f.filename === 'sm_safety.c')?.content || '';
  expect(safetyC).toContain('SM_State_Parent_Map');
  expect(safetyC).toContain('SM_ERR_INVALID_STATE');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/stateMachineCodeGenerator.test.ts -t "SM_State_Parent_Map"`
Expected: FAIL

- [ ] **Step 3: Update `sm_safety.c` template rendering in `stateMachineCodeGenerator.ts`**

Generate `SM_State_Parent_Map` array mapping each state enum to its parent state enum (or `SM_NODE_INVALID` for root states). In `SM_Validate_State_Consistency`, iterate active states and verify parent state is active:
```c
static const SM_Node_t SM_State_Parent_Map[SM_NUM_STATES + 1U] = {
    /* Generated state parent mappings */
};

SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t* instance) {
    if (instance == NULL) {
        return SM_ERR_NONE;
    }
#ifdef SM_SAFETY_ENABLED
    uint32_t sm_iter;
    for (sm_iter = 1U; sm_iter <= SM_NUM_STATES; sm_iter++) {
        if (instance->state_active[sm_iter]) {
            SM_Node_t parent = SM_State_Parent_Map[sm_iter];
            if ((parent != SM_NODE_INVALID) && (!instance->state_active[(uint32_t)parent])) {
                return SM_ERR_INVALID_STATE;
            }
        }
    }
#endif
    return SM_ERR_NONE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/stateMachineCodeGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "fix(generator): implement parent-child hierarchy validation in SM_Validate_State_Consistency"
```

---

### Task 5: MCAL Driver Guards & Verification Run

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts:2020-2050`
- Test: `src/utils/stateMachineCodeGenerator.test.ts`, `src/utils/validateGeneratedCode.test.ts`

**Interfaces:**
- Consumes: Preprocessor configuration
- Produces: `#ifndef MCAL_CUSTOM_DIO` preprocessor guards in `mcal_dio.h`.

- [ ] **Step 1: Write failing unit test for MCAL driver preprocessor guards**

```typescript
// In src/utils/stateMachineCodeGenerator.test.ts
it('should include MCAL_CUSTOM_DIO preprocessor guards in mcal_dio.h', () => {
  const result = generateStateMachineCode(mockChart);
  const dioH = result.files.find(f => f.filename === 'mcal_dio.h')?.content || '';
  expect(dioH).toContain('#ifndef MCAL_CUSTOM_DIO');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/stateMachineCodeGenerator.test.ts -t "MCAL_CUSTOM_DIO"`
Expected: FAIL

- [ ] **Step 3: Update `mcal_dio.h` template in `stateMachineCodeGenerator.ts`**

Add preprocessor guards:
```c
#ifndef MCAL_CUSTOM_DIO
/**
 * Default MCAL DIO Stubs - override by defining MCAL_CUSTOM_DIO in build configuration.
 */
static inline bool MCAL_Dio_ReadChannel(uint32_t channel) {
    (void)channel;
    return false;
}
static inline void MCAL_Dio_WriteChannel(uint32_t channel, bool level) {
    (void)channel;
    (void)level;
}
#endif
```

- [ ] **Step 4: Run all generator unit and integration tests**

Run: `npm test src/utils/stateMachineCodeGenerator.test.ts src/utils/validateGeneratedCode.test.ts`
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "fix(generator): add MCAL_CUSTOM_DIO preprocessor guards to mcal_dio.h"
```
