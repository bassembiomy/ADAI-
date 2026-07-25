# Generic State Machine Code Generator & Terminal Auto-Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `stateMachineCodeGenerator.ts` generic and robust so any state machine model (including models with sink states, deadlocks, unreachable states, or terminal nodes) produces 100% syntactically valid and compilable MISRA C code.

**Architecture:** Update template emission logic, implement End/Terminal node auto-reset to root autostart in `SM_Step`, dynamically generate `SM_Sync_IO` channel bindings for model variables, and enforce brace-matching verification in `validateGeneratedCode`.

**Tech Stack:** TypeScript, Node.js, Vitest, C/C++ static compilation tools.

## Global Constraints

- Must output 9 valid files (`sm_config.h`, `sm_core.h`, `sm_core.c`, `sm_safety.h`, `sm_safety.c`, `sm_user_logic.h`, `sm_user_logic.c`, `mcal_dio.h`, `sm_testing_report.md`).
- Must pass all existing 40 tests in `stateMachineCodeGenerator.test.ts`.
- Must handle sink states without throwing build-blocking generator errors.

---

### Task 1: Add Unit Tests for Sink States & Terminal Auto-Reset

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: `generateMISRACCode(chart)`
- Produces: Test assertions for sink states, terminal nodes, and brace balance.

- [ ] **Step 1: Write the failing tests in `stateMachineCodeGenerator.test.ts`**

```typescript
it('should generate valid C code without syntax errors for statemachine.json topology with sink states', () => {
  const chartWithSinkStates = {
    tickMs: 500,
    safetyMode: false,
    variables: [
      { id: 'v1', name: 'x', type: 'int32' as const, initialValue: '0', currentValue: 0, visibleInScope: true },
      { id: 'v2', name: 'y', type: 'int32' as const, initialValue: '0', currentValue: 0, visibleInScope: true }
    ],
    states: [
      { id: 's1', name: 'State_1', x: 100, y: 120, width: 160, height: 100, entry: '', during: '', exit: '', isActive: false, color: '#c96c8a', parentId: 'root', children: [], priority: 10, isParallel: true, regionId: 'xx', autostart: true },
      { id: 's2', name: 'State_2', x: 520, y: 140, width: 160, height: 100, entry: '', during: '', exit: '', isActive: false, color: '#6cc9a8', parentId: 'root', children: [], priority: 20, isParallel: true, regionId: 'xx', autostart: false },
      { id: 's6_1', name: 'State_6_1', x: 520, y: 140, width: 160, height: 100, entry: 'y=1;', during: '', exit: '', isActive: false, color: '#6c9ac6', parentId: 's2', children: [], priority: 10, isParallel: false, regionId: 'xx', autostart: true }
    ],
    junctions: [],
    transitions: [
      { id: 't1', sourceId: 's1', targetId: 's2', condition: 'x==1', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 0 }
    ],
    layers: [
      { id: 'root', name: 'Root', parentStateId: null, stateIds: ['s1', 's2'], transitionIds: ['t1'], junctionIds: [] }
    ]
  };

  const result = generateMISRACCode(chartWithSinkStates);
  expect(result.files).toHaveLength(9);

  const smCoreH = result.files.find(f => f.name === 'sm_core.h')?.content || '';
  const smUserLogicC = result.files.find(f => f.name === 'sm_user_logic.c')?.content || '';

  // Verify braces are balanced in sm_core.h and sm_user_logic.c
  expect(smCoreH).toContain('static inline const SM_Data_t* SM_Data_Legacy');
  expect(smCoreH).toMatch(/static inline const SM_Data_t\* SM_Data_Legacy[^{]+\{[^}]+\}/);
  expect(smUserLogicC).toMatch(/void SM_ST_STATE_6_1_Entry[^{]+\{[^}]+\}/);
});
```

- [ ] **Step 2: Run test to verify current status**

Run: `powershell -ExecutionPolicy Bypass -Command "npx vitest run src/utils/stateMachineCodeGenerator.test.ts"`

- [ ] **Step 3: Commit initial test setup**

```bash
git add src/utils/stateMachineCodeGenerator.test.ts
git commit -m "test: add test coverage for sink states and header syntax validation"
```

---

### Task 2: Syntactic C Code Generation & Header Guard Fixes

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts:980-1150`

**Interfaces:**
- Consumes: State machine chart definition
- Produces: `sm_core.h`, `sm_user_logic.c`, `mcal_dio.h` with complete brace scope control.

- [ ] **Step 1: Update `smCoreH` and `smUserLogicC` formatting templates**

Ensure `smCoreH` inline functions (`SM_Data_Legacy`) are explicitly closed with `}` prior to `#endif`.
Ensure `smUserLogicC` generates complete `{` ... `}` blocks for entry/during/exit functions of all states.

- [ ] **Step 2: Update `validateGeneratedCode` in `stateMachineCodeGenerator.ts`**

Add brace count validation and formatting normalization to `validateGeneratedCode(code)`.

- [ ] **Step 3: Run vitest to verify tests pass**

Run: `powershell -ExecutionPolicy Bypass -Command "npx vitest run src/utils/stateMachineCodeGenerator.test.ts"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts
git commit -m "fix(generator): enforce brace completion and syntax integrity in generated C headers and logic"
```

---

### Task 3: Terminal / End Node Support & Sink State Auto-Reset

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts:1300-1650`

**Interfaces:**
- Consumes: States and transitions in `chart`
- Produces: Auto-reset logic in `sm_core.c` when reaching Terminal nodes or sink states.

- [ ] **Step 1: Implement terminal state detection and auto-reset emission**

In `SM_Step` generation in `stateMachineCodeGenerator.ts`, detect states marked as terminal (`type === 'end'` or `isFinal === true`) or leaf sink states without outgoing transitions. Emit return to root autostart state logic (`State_1`).

- [ ] **Step 2: Add test case for Terminal Auto-Reset**

In `stateMachineCodeGenerator.test.ts`, verify that entering a terminal/sink state generates auto-reset or clean exit sequence.

- [ ] **Step 3: Run vitest**

Run: `powershell -ExecutionPolicy Bypass -Command "npx vitest run src/utils/stateMachineCodeGenerator.test.ts"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "feat(generator): add terminal node auto-reset and sink state graceful handling"
```

---

### Task 4: Dynamic IO Signal Mapping & Watchdog Refresh Stubs

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts:1010-1080`

**Interfaces:**
- Consumes: `chart.variables`
- Produces: `SM_Sync_IO` implementation in `sm_core.c` and `MCAL_Watchdog_Kick` stubs in `mcal_dio.h`.

- [ ] **Step 1: Dynamically generate variable read/write mappings in `SM_Sync_IO`**

Iterate over `chart.variables` and generate:
- Inputs (`in_`, `sensor_`, `btn_`, `sw_`, etc.): `instance->data.<var> = (type)MCAL_Dio_ReadChannel(channel_idx);`
- Outputs (`out_`, `led_`, `motor_`, `y`, etc.): `MCAL_Dio_WriteChannel(channel_idx, (Dio_LevelType)instance->data.<var>);`

- [ ] **Step 2: Update `mcal_dio.h` template with functional watchdog refresh stub**

Provide `#define MCAL_Watchdog_Kick() ((void)0)` and prototype stubs in `mcal_dio.h`.

- [ ] **Step 3: Run vitest**

Run: `powershell -ExecutionPolicy Bypass -Command "npx vitest run src/utils/stateMachineCodeGenerator.test.ts"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts
git commit -m "feat(generator): implement dynamic IO variable mapping in SM_Sync_IO and watchdog stubs"
```

---

### Task 5: End-to-End Build & Compilation Verification

**Files:**
- Test: `src/utils/stateMachineCodeGenerator.test.ts`

- [ ] **Step 1: Execute full test suite including GCC compiler checks**

Run: `powershell -ExecutionPolicy Bypass -Command "npx vitest run src/utils/stateMachineCodeGenerator.test.ts"`
Expected: PASS (All 40+ tests passing)

- [ ] **Step 2: Final Git status check and commit**

Verify repository clean status.
