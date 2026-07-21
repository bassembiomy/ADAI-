# Parallel Stateflow and AND-Decomposition Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated unit and behavior simulation tests for checking parallel states, AND-decomposition, and multi-layered configurations in the Stateflow code generator.

**Architecture:** We will add unit assertions for generated C structure directly in the code generator unit tests and add a comprehensive GCC-compiled execution simulation to behavior tests.

**Tech Stack:** Vitest, TypeScript, C, GCC, Node.js FS/Child Process APIs.

## Global Constraints
- Target test files must be `src/utils/stateMachineCodeGenerator.test.ts` and `src/utils/stateMachineCodeGenerator.behavior.test.ts`.
- No modifications to the compiler setup or other modules unless explicitly requested.
- Vitest must be run excluding `.kilo` worktree folders using `--exclude "**/.kilo/**"`.

---

### Task 1: Add Structural Unit Tests for Nested Mixed OR and AND Decomposition Layers

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Consumes: `generateMISRACCode` and type definitions (`StateData`, `VariableDef`, etc.) from `src/utils/stateMachineCodeGenerator.ts` and `src/types/sm_types.ts`.
- Produces: A new Vitest unit test suite named `should generate correct C code for nested mixed OR and AND decomposition layers`.

- [ ] **Step 1: Write the unit test code**

Add the following unit test to `src/utils/stateMachineCodeGenerator.test.ts` inside the `StateMachineCodeGenerator` describe block:

```typescript
  it('should generate correct C code for nested mixed OR and AND decomposition layers', () => {
    const mixedStates: StateData[] = [
      {
        id: 'super', name: 'SuperState', x: 0, y: 0, width: 300, height: 300,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 'ex_a', name: 'Ex_StateA', x: 10, y: 10, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'super', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 'ex_b', name: 'Ex_StateB', x: 110, y: 10, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'super', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false
      },
      {
        id: 'par_c', name: 'Par_StateC', x: 10, y: 150, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'super', children: [],
        priority: 1, isParallel: true, regionId: 'R1', autostart: true
      },
      {
        id: 'par_d', name: 'Par_StateD', x: 110, y: 150, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'super', children: [],
        priority: 2, isParallel: true, regionId: 'R2', autostart: true
      }
    ];

    const mixedChart = {
      tickMs: 10,
      states: mixedStates,
      junctions: [],
      transitions: [
        {
          id: 't_ex', sourceId: 'ex_a', targetId: 'ex_b', condition: 'cond_trigger', action: '', afterTicks: null,
          type: 'condition', hasControlPoint: false, order: 1
        }
      ],
      variables: [
        { id: 'v1', name: 'cond_trigger', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true }
      ],
      layers: [
        { id: 'root', name: 'root', parentStateId: null, stateIds: ['super'], transitionIds: [], junctionIds: [] },
        { id: 'layer_ex', name: 'Layer_Exclusive', parentStateId: 'super', stateIds: ['ex_a', 'ex_b'], transitionIds: ['t_ex'], junctionIds: [] },
        { id: 'layer_par', name: 'Layer_Parallel', parentStateId: 'super', stateIds: ['par_c', 'par_d'], transitionIds: [], junctionIds: [] }
      ],
      safetyMode: false
    };

    const result = generateMISRACCode(mixedChart as any);
    expect(result.errors).toHaveLength(0);

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    
    // Check that entering SuperState invokes default entries of both Layer_Exclusive (index 0) and Layer_Parallel (index 1)
    expect(coreC).toContain('SM_Enter_Layer_0(instance, false);');
    expect(coreC).toContain('SM_Enter_Layer_1(instance, false);');
    
    // Check that stepping SuperState steps both layers
    expect(coreC).toContain('SM_Step_Layer_0(instance, delta_ms);');
    expect(coreC).toContain('SM_Step_Layer_1(instance, delta_ms);');

    // Check exit of SuperState exits active state in exclusive layer and parallel states in parallel layer
    expect(coreC).toContain('SM_Exit_State(instance, instance->active_states[');
    expect(coreC).toContain('SM_Exit_State(instance, SM_ST_PAR_STATEC);');
    expect(coreC).toContain('SM_Exit_State(instance, SM_ST_PAR_STATED);');
  });
```

- [ ] **Step 2: Run unit tests to verify new test passes**

Run: `npx.cmd vitest run src/utils/stateMachineCodeGenerator.test.ts --exclude "**/.kilo/**"`
Expected: 26 passed

- [ ] **Step 3: Commit structural unit tests**

```bash
git add src/utils/stateMachineCodeGenerator.test.ts
git commit -m "test: add structural unit tests for mixed OR/AND decomposition layers"
```

---

### Task 2: Add Behavior Simulation Tests for Hierarchical Mixed OR/AND Decomposition Layers

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.behavior.test.ts`

**Interfaces:**
- Consumes: `hostCompileAndRun`, `writeFiles`, `HARNESS_PREAMBLE`, `HARNESS_EPILOGUE`, and `BEHAVIOR_TIMEOUT` from `src/utils/stateMachineCodeGenerator.behavior.test.ts`.
- Produces: A new Vitest behavior test named `hierarchical states with mixed OR and parallel AND layers behave correctly under simulation`.

- [ ] **Step 1: Write behavior simulation test code**

Add the following behavior test to `src/utils/stateMachineCodeGenerator.behavior.test.ts` inside the `describe` block:

```typescript
  it('hierarchical states with mixed OR and parallel AND layers behave correctly under simulation', () => {
    const states = [
      mkState('parent', 'Parent', { autostart: true }),
      mkState('target', 'Target'),
      mkState('ex_a', 'Ex_StateA', { parentId: 'parent', autostart: true, entry: 'log = log + 1U;', exit: 'log = log + 2U;' }),
      mkState('ex_b', 'Ex_StateB', { parentId: 'parent', entry: 'log = log + 4U;', exit: 'log = log + 8U;' }),
      mkState('par_c', 'Par_StateC', { parentId: 'parent', isParallel: true, regionId: 'R1', autostart: true, priority: 1, entry: 'log = log + 10U;', exit: 'log = log + 20U;', during: 'log = log + 100U;' }),
      mkState('par_d', 'Par_StateD', { parentId: 'parent', isParallel: true, regionId: 'R2', autostart: true, priority: 2, entry: 'log = log + 1000U;', exit: 'log = log + 2000U;', during: 'log = log + 10000U;' }),
      mkState('c_sub_1', 'C_Sub_1', { parentId: 'par_c', autostart: true, entry: 'log = log + 100000U;', exit: 'log = log + 200000U;' }),
      mkState('c_sub_2', 'C_Sub_2', { parentId: 'par_c', entry: 'log = log + 400000U;', exit: 'log = log + 800000U;' })
    ];

    const transitions = [
      mkTransition('t_exit', 'parent', 'target', { condition: 't_exit' }),
      mkTransition('t_ex', 'ex_a', 'ex_b', { condition: 't_ex' }),
      mkTransition('t_sub', 'c_sub_1', 'c_sub_2', { condition: 't_sub' })
    ];

    const varsList = [
      mkVar('v_log', 'log', 'uint32', '0'),
      mkVar('v_tex', 't_ex', 'bool', 'false'),
      mkVar('v_tsub', 't_sub', 'bool', 'false'),
      mkVar('v_texit', 't_exit', 'bool', 'false')
    ];

    const chart = {
      tickMs: 10,
      states,
      junctions: [],
      transitions,
      variables: varsList,
      layers: [
        { id: 'root', name: 'root', parentStateId: null, stateIds: ['parent', 'target'], transitionIds: ['t_exit'], junctionIds: [] },
        { id: 'layer_ex', name: 'Layer_Exclusive', parentStateId: 'parent', stateIds: ['ex_a', 'ex_b'], transitionIds: ['t_ex'], junctionIds: [] },
        { id: 'layer_par', name: 'Layer_Parallel', parentStateId: 'parent', stateIds: ['par_c', 'par_d'], transitionIds: [], junctionIds: [] },
        { id: 'layer_c_sub', name: 'Layer_C_Sub', parentStateId: 'par_c', stateIds: ['c_sub_1', 'c_sub_2'], transitionIds: ['t_sub'], junctionIds: [] }
      ],
      safetyMode: false
    };

    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);

    const dir = path.join(__dirname, '../../scratch/behavior_mixed_layers');
    writeFiles(dir, result.files);

    const harness = HARNESS_PREAMBLE + `
    SM_Init(&inst);
    /* Verify dual/all starts in AND decomposition and exclusive start are entered */
    CHECK(inst.state_active[SM_ST_PARENT_IDX] == true, "Parent active");
    CHECK(inst.state_active[SM_ST_EX_STATEA_IDX] == true, "Ex_StateA active");
    CHECK(inst.state_active[SM_ST_PAR_STATEC_IDX] == true, "Par_StateC active");
    CHECK(inst.state_active[SM_ST_PAR_STATED_IDX] == true, "Par_StateD active");
    CHECK(inst.state_active[SM_ST_C_SUB_1_IDX] == true, "C_Sub_1 active");
    /* Log check: Ex_StateA entry (1) + Par_StateC entry (10) + Par_StateD entry (1000) + C_Sub_1 entry (100000) = 101011 */
    CHECK(inst.data.log == 101011U, "initial entry log matches");

    /* Step with no triggers: runs during actions of parallel states Par_StateC (100) and Par_StateD (10000) */
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    CHECK(inst.data.log == 10100U, "during actions executed");

    /* Trigger transition in exclusive layer: Ex_StateA -> Ex_StateB */
    inst.data.t_ex = true;
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    /* Ex_StateA exit (2) + Ex_StateB entry (4) + during actions (10100) = 10106 */
    CHECK(inst.data.log == 10106U, "transition in exclusive layer logs correctly");
    CHECK(inst.state_active[SM_ST_EX_STATEA_IDX] == false, "Ex_StateA inactive");
    CHECK(inst.state_active[SM_ST_EX_STATEB_IDX] == true, "Ex_StateB active");

    /* Trigger transition in nested exclusive layer inside Par_StateC: C_Sub_1 -> C_Sub_2 */
    inst.data.t_sub = true;
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    /* C_Sub_1 exit (200000) + C_Sub_2 entry (400000) + during actions (10100) = 610100 */
    CHECK(inst.data.log == 610100U, "nested exclusive transition logs correctly");
    CHECK(inst.state_active[SM_ST_C_SUB_1_IDX] == false, "C_Sub_1 inactive");
    CHECK(inst.state_active[SM_ST_C_SUB_2_IDX] == true, "C_Sub_2 active");

    /* Exit parent superstate: exits C_Sub_2 (800000) + Par_StateC (20) + Par_StateD (2000) + Ex_StateB (8) = 802028 */
    inst.data.t_exit = true;
    inst.data.log = 0U;
    SM_Step(&inst, 10U);
    CHECK(inst.data.log == 802028U, "superstate exit logs correctly");
    CHECK(inst.state_active[SM_ST_PARENT_IDX] == false, "Parent inactive");
    CHECK(inst.state_active[SM_ST_TARGET_IDX] == true, "Target active");
    ` + HARNESS_EPILOGUE;

    const out = hostCompileAndRun(dir, harness);
    if (out !== 'SKIPPED') {
      expect(out).toContain('RESULT: PASS');
    }
  }, BEHAVIOR_TIMEOUT);
```

- [ ] **Step 2: Run behavior tests to verify new simulation test compiles and passes**

Run: `npx.cmd vitest run src/utils/stateMachineCodeGenerator.behavior.test.ts --exclude "**/.kilo/**"`
Expected: 18 passed

- [ ] **Step 3: Commit behavior simulation tests**

```bash
git add src/utils/stateMachineCodeGenerator.behavior.test.ts
git commit -m "test: add behavior simulation tests for hierarchical mixed OR/AND layers"
```
