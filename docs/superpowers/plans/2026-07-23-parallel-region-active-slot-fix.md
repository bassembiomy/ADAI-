# Parallel Region Active Slot Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the code generator so parallel (AND) states in different regions get distinct `active_states[]` slots, preventing last-write-wins overwrite.

**Architecture:** Introduce `stateActiveSlotMap` and `totalActiveSlots` alongside the existing `layerIndexMap`. The slot map assigns each parallel region its own array index while keeping layer function naming unchanged. `SM_NUM_LAYERS` is set to `totalActiveSlots` (expanded count).

**Tech Stack:** TypeScript (Vitest), C code generation (MISRA-C compliant output)

## Global Constraints

- All existing 31 tests in `stateMachineCodeGenerator.test.ts` must continue to pass
- All 14 antigravity tests must continue to pass
- All 10 smAnalysisEngine tests must continue to pass
- Generated C code must compile cleanly with avr-gcc
- MISRA-C compliance must be maintained (unsigned suffixes, braced bodies, no magic numbers)
- Internal transitions (`type === 'internal'` or `isInternal === true`) must never emit exit/entry calls

---

### Task 1: Build Region-Expanded Slot Maps

**Files:**
- Modify: `src/utils/stateMachineCodeGenerator.ts:117-118`
- Test: `src/utils/stateMachineCodeGenerator.test.ts`

**Interfaces:**
- Produces: `stateActiveSlotMap: Map<string, number>`, `layerActiveSlotMap: Map<string, number>`, `totalActiveSlots: number`

- [ ] **Step 1: Write the failing test**

Add a test that creates a 3-region parallel layer (3 states in 3 different regions under one parent) plus a nested child layer, and asserts:
- `SM_NUM_LAYERS` in `sm_config.h` equals `totalActiveSlots` (not `sortedLayers.length`)
- Each parallel state writes to a different `active_states[]` index in `SM_Enter_State_Shallow`
- Internal transitions within parallel states don't emit `SM_Exit_State` / `SM_Enter_State`

```typescript
it('should assign distinct active_states slots per parallel region (multi-region fix)', () => {
  const states: any[] = [
    {
      id: 'parent', name: 'SuperState', x: 0, y: 0, width: 300, height: 300,
      entry: '', during: '', exit: '',
      isActive: false, color: 'gray', parentId: 'root', children: ['s_a', 's_b', 's_c'],
      priority: 1, isParallel: false, regionId: 'MAIN', autostart: true,
      isTerminal: true
    },
    {
      id: 's_a', name: 'RegionA', x: 10, y: 10, width: 80, height: 80,
      entry: 'counter = 1;', during: '', exit: '',
      isActive: false, color: 'blue', parentId: 'parent', children: [],
      priority: 1, isParallel: true, regionId: 'R_A', autostart: true
    },
    {
      id: 's_b', name: 'RegionB', x: 100, y: 10, width: 80, height: 80,
      entry: 'counter = 2;', during: '', exit: '',
      isActive: false, color: 'green', parentId: 'parent', children: [],
      priority: 2, isParallel: true, regionId: 'R_B', autostart: true
    },
    {
      id: 's_c', name: 'RegionC', x: 200, y: 10, width: 80, height: 80,
      entry: 'counter = 3;', during: '', exit: '',
      isActive: false, color: 'red', parentId: 'parent', children: [],
      priority: 3, isParallel: true, regionId: 'R_C', autostart: true
    }
  ];

  const layers: any[] = [
    { id: 'root', name: 'root', parentStateId: null, stateIds: ['parent'], transitionIds: [], junctionIds: [] },
    { id: 'child_layer', name: 'child', parentStateId: 'parent', stateIds: ['s_a', 's_b', 's_c'], transitionIds: [], junctionIds: [] }
  ];

  const chart: any = {
    tickMs: 10,
    states,
    junctions: [],
    transitions: [
      {
        id: 't_int', sourceId: 's_a', targetId: 's_a', type: 'internal',
        condition: 'counter', action: 'counter = counter + 10;',
        afterTicks: null, hasControlPoint: false, order: 1
      }
    ],
    variables: [
      { id: 'v1', name: 'counter', type: 'int', initialValue: '0', currentValue: 0, visibleInScope: true }
    ],
    layers,
    safetyMode: false
  };

  const result = generateMISRACCode(chart);
  expect(result.errors).toHaveLength(0);

  const configH = result.files.find(f => f.name === 'sm_config.h')?.content || '';
  const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

  // SM_NUM_LAYERS must be >= 4 (root layer + 3 region slots)
  const numLayersMatch = configH.match(/#define SM_NUM_LAYERS (\d+)U/);
  expect(numLayersMatch).toBeTruthy();
  const numLayers = parseInt(numLayersMatch![1]);
  expect(numLayers).toBeGreaterThanOrEqual(4);

  // Extract active_states indices from SM_Enter_State_Shallow for each region state
  const enterShallowStart = coreC.indexOf('SM_Enter_State_Shallow');
  const enterShallowEnd = coreC.indexOf('SM_NODE_SAFE', enterShallowStart);
  const enterShallowBody = coreC.substring(enterShallowStart, enterShallowEnd);

  // Find each state's active_states assignment
  const regionASlot = enterShallowBody.match(/case SM_ST_REGIONA:[\s\S]*?active_states\[(\d+)U\]/);
  const regionBSlot = enterShallowBody.match(/case SM_ST_REGIONB:[\s\S]*?active_states\[(\d+)U\]/);
  const regionCSlot = enterShallowBody.match(/case SM_ST_REGIONC:[\s\S]*?active_states\[(\d+)U\]/);

  expect(regionASlot).toBeTruthy();
  expect(regionBSlot).toBeTruthy();
  expect(regionCSlot).toBeTruthy();

  // Each region must have a DISTINCT slot
  const slotA = regionASlot![1];
  const slotB = regionBSlot![1];
  const slotC = regionCSlot![1];
  const uniqueSlots = new Set([slotA, slotB, slotC]);
  expect(uniqueSlots.size).toBe(3);

  // Internal transition in parallel state must NOT emit SM_Exit_State
  expect(coreC).not.toContain('SM_Exit_State(instance, SM_ST_REGIONA)');
  // But must contain the internal action
  expect(coreC).toContain('counter = (int32_t)(instance->data.counter + 10)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmd /c npx vitest run src/utils/stateMachineCodeGenerator.test.ts -t "should assign distinct active_states slots"`
Expected: FAIL — all 3 regions get the same `active_states[]` index

- [ ] **Step 3: Build the slot maps**

In `src/utils/stateMachineCodeGenerator.ts`, after the existing `layerIndexMap` setup (line 117-118), add:

```typescript
// --- Region-expanded active slot mapping ---
// For exclusive (OR) layers: one slot per layer (same as layerIndexMap).
// For parallel (AND) layers: one slot per distinct regionId.
const stateActiveSlotMap = new Map<string, number>();
const layerActiveSlotMap = new Map<string, number>();
let totalActiveSlots = 0;

sortedLayers.forEach(l => {
  const layerStates = l.stateIds
    .map(sid => sortedStates.find(s => s.id === sid))
    .filter(Boolean) as StateData[];
  const allParallel = layerStates.length > 0 && layerStates.every(st => st.isParallel);

  layerActiveSlotMap.set(l.id, totalActiveSlots);

  if (allParallel) {
    const regions = new Map<string, StateData[]>();
    layerStates.forEach(s => {
      const rId = s.regionId || 'MAIN';
      if (!regions.has(rId)) regions.set(rId, []);
      regions.get(rId)!.push(s);
    });
    regions.forEach(regionStates => {
      const slotIdx = totalActiveSlots++;
      regionStates.forEach(s => stateActiveSlotMap.set(s.id, slotIdx));
    });
  } else {
    const slotIdx = totalActiveSlots++;
    layerStates.forEach(s => stateActiveSlotMap.set(s.id, slotIdx));
  }
});
```

- [ ] **Step 4: Update SM_NUM_LAYERS define**

Change line 877 from:
```typescript
#define SM_NUM_LAYERS ${sortedLayers.length > 0 ? sortedLayers.length : 1}U
```
To:
```typescript
#define SM_NUM_LAYERS ${totalActiveSlots > 0 ? totalActiveSlots : 1}U
```

- [ ] **Step 5: Update SM_Enter_State_Shallow**

Change lines 1276-1281. Replace `parentLayerIdx` lookup with `stateActiveSlotMap`:

Before:
```typescript
const parentLayer = chart.layers.find(l => l.stateIds.includes(s.id));
const parentLayerIdx = parentLayer ? layerIndexMap.get(parentLayer.id) : 0;

smEnterShallowFunc += `        case ${sEnum}:\n`;
if (parentLayer) {
  smEnterShallowFunc += `            instance->active_states[${parentLayerIdx}U] = state;\n`;
}
```

After:
```typescript
const stateSlot = stateActiveSlotMap.get(s.id) ?? 0;

smEnterShallowFunc += `        case ${sEnum}:\n`;
smEnterShallowFunc += `            instance->active_states[${stateSlot}U] = state;\n`;
```

- [ ] **Step 6: Update SM_Exit_State slot clearing and history save**

Change lines 1218-1261. Replace `parentLayerIdx` with `stateActiveSlotMap`:

For history save (line 1251):
```typescript
smExitStateFunc += `            instance->history_states[${stateActiveSlotMap.get(s.id) ?? 0}U] = state;\n`;
```

For slot clearing (lines 1254-1261): Since each parallel region now has its own slot, we can always clear it on exit:
```typescript
smExitStateFunc += `            instance->active_states[${stateActiveSlotMap.get(s.id) ?? 0}U] = SM_NODE_INVALID;\n`;
```

For recursive child exit (lines 1236-1239): Replace `lIdx` with `layerActiveSlotMap`:
```typescript
const childSlot = layerActiveSlotMap.get(l.id) ?? 0;
smExitStateFunc += `            if (instance->active_states[${childSlot}U] != SM_NODE_INVALID) {\n`;
smExitStateFunc += `                SM_Exit_State(instance, instance->active_states[${childSlot}U]);\n`;
```

- [ ] **Step 7: Update SM_Enter_Layer_N history check**

Change line 1349. Replace `lIdx` with `layerActiveSlotMap`:
```typescript
const activeSlot = layerActiveSlotMap.get(l.id);
layerEntryFuncs += `    if (use_history && (instance->history_states[${activeSlot}U] != SM_NODE_INVALID)) {\n`;
layerEntryFuncs += `        SM_Enter_State(instance, instance->history_states[${activeSlot}U], ${restoreArg});\n`;
```

- [ ] **Step 8: Update SM_Step_Layer_N switch for normal layers**

Change line 1591. Replace `lIdx` with `layerActiveSlotMap`:
```typescript
const activeSlot = layerActiveSlotMap.get(l.id);
layerStepFuncs += `    switch (instance->active_states[${activeSlot}U]) {\n`;
```

- [ ] **Step 9: Update SM_GetActive for exclusive regions**

Change line 1717. Replace `layerIndexMap` lookup with `layerActiveSlotMap`:
```typescript
const lIdx = layerForRegion ? layerActiveSlotMap.get(layerForRegion.id) : undefined;
```

- [ ] **Step 10: Run the new test to verify it passes**

Run: `cmd /c npx vitest run src/utils/stateMachineCodeGenerator.test.ts -t "should assign distinct active_states slots"`
Expected: PASS

- [ ] **Step 11: Run full regression suite**

Run: `cmd /c npx vitest run src/utils/stateMachineCodeGenerator.test.ts src/utils/smAnalysisEngine.test.ts src/utils/antigravity`
Expected: All tests pass (only avr-gcc worktree tests may fail due to missing toolchain, which is expected)

- [ ] **Step 12: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.ts src/utils/stateMachineCodeGenerator.test.ts
git commit -m "fix(generator): assign distinct active_states slots per parallel region"
```
