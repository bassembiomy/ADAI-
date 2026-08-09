# State-Machine Mapping Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate unambiguous slot, layer, and state activity APIs; validate shared mapping metadata; omit truly empty child layers; and remove redundant XBridges float conversions without regressing Step-to-Outport mapping.

**Architecture:** Filter code-generation-empty non-root layers before semantic indexes are assigned, then render one shared `sm_mapping.h/.c` module consumed by core and safety code. Public queries use the shared tables, initialization validates their static relationships before entry, and XBridges output publication selects direct native assignment or one real destination conversion from resolved source/destination types.

**Tech Stack:** TypeScript 5, Vitest 4, immutable semantic IR, generated ISO C99, GCC host compilation.

## Global Constraints

- Layer IDs, active-slot IDs, and state IDs remain distinct concepts.
- `SM_GetActive()` remains for one compatibility cycle only as a deprecated slot wrapper.
- AND child states keep active slot `-1` and use `state_active[]`.
- The persisted source model is never mutated when empty layers are omitted.
- The application-facing `generateMISRACCode()` continues to render through the semantic generator.
- Preserve existing uncommitted edits in `xbSemanticBuilder.ts`, `xbCGenerator.ts`, and `xbCGenerator.test.ts`.
- Generated C must pass `-std=c99 -pedantic-errors -Wall -Wextra -Werror`; the focused numeric mapping fixture also passes `-Wconversion`.

---

### Task 1: Omit Truly Empty Non-Root Layers from Semantic Code Generation

**Files:**
- Modify: `src/utils/stateMachine/smSemanticBuilder.test.ts`
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts`

**Interfaces:**
- Consumes: `buildSemanticModel(model: StateMachineModelV4)`
- Produces: semantic IR whose `layers`, layer indexes, and `activeSlotCount` exclude non-root layers with no states, junctions, or transitions

- [ ] **Step 1: Tighten the existing empty-layer test so it fails**

Replace the current expectation that `empty_b_children` survives with:

```ts
it('omits a truly empty non-root layer from semantic code generation', () => {
  const model = flatOrFixture();
  model.layers.push({
    ...model.layers[0],
    id: 'empty_b_children',
    name: 'empty_b_children',
    parentStateId: 'b',
    stateIds: [],
    transitionIds: [],
    junctionIds: [],
    decomposition: 'OR',
  });

  const result = buildSemanticModel(model);

  expect(result.diagnostics).toEqual([]);
  expect(result.ir).toBeDefined();
  expect(result.ir!.layers).not.toHaveProperty('empty_b_children');
  expect(Object.keys(result.ir!.layers)).toEqual(['root']);
  expect(result.ir!.activeSlotCount).toBe(1);
  expect(model.layers).toHaveLength(2);
});
```

Add coverage proving meaningful empty-state layers are retained:

```ts
it('retains a non-root layer that owns a junction', () => {
  const model = historyFixture('shallow');
  const historyLayer = model.layers.find((layer) =>
    layer.junctionIds.some((id) => id.includes('history')),
  )!;
  historyLayer.stateIds = [];

  const result = buildSemanticModel(model);

  expect(result.ir).toBeDefined();
  expect(result.ir!.layers).toHaveProperty(historyLayer.id);
});
```

- [ ] **Step 2: Run the focused semantic tests and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts -t "empty non-root|owns a junction" --reporter=verbose
```

Expected: the first test fails because `empty_b_children` still exists in `ir.layers`; the junction test passes.

- [ ] **Step 3: Filter only code-generation-empty child layers**

At the start of `buildSemanticModel`, after structural validation succeeds and before `buildHierarchy`, derive a shallow model view:

```ts
const codegenLayers = model.layers.filter((layer) =>
  layer.parentStateId === null
  || layer.stateIds.length > 0
  || layer.junctionIds.length > 0
  || layer.transitionIds.length > 0);
const codegenModel: StateMachineModelV4 = {
  ...model,
  layers: codegenLayers,
};
const hierarchy = buildHierarchy(codegenModel);
```

Use `codegenModel.layers` for subsequent layer ownership/index construction while continuing to use the original immutable state, transition, variable, and XBridges collections.

- [ ] **Step 4: Run focused and full semantic tests and verify GREEN**

Run:

```powershell
npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts --reporter=verbose
```

Expected: all `smSemanticBuilder` tests pass.

- [ ] **Step 5: Commit the semantic normalization**

```powershell
git add -- src/utils/stateMachine/smSemanticBuilder.ts src/utils/stateMachine/smSemanticBuilder.test.ts
git commit -m "fix(state-machine): omit empty generated child layers"
```

---

### Task 2: Generate Shared Mapping Metadata and Validate It Before Entry

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts`

**Interfaces:**
- Produces generated `sm_mapping.h` declarations
- Produces generated `sm_mapping.c` definitions and `SM_Validate_Mapping_Configuration(void)`
- Consumed by generated `sm_core.c` and `sm_safety.c`

- [ ] **Step 1: Add failing mapping-artifact assertions**

Add a renderer test using `nestedAndFixture()`:

```ts
it('renders shared parent and active-slot mapping metadata', () => {
  const ir = build(nestedAndFixture());
  const header = generatedFile(ir, 'sm_mapping.h');
  const source = generatedFile(ir, 'sm_mapping.c');

  expect(header).toContain(
    'extern const uint32_t SM_State_Parent_Layer_Map[SM_NUM_STATES + 1U];',
  );
  expect(header).toContain(
    'SM_Error_t SM_Validate_Mapping_Configuration(void);',
  );
  expect(source).toContain('[SM_ST_REGION_A_IDX] = SM_LYR_PARALLEL_IDX');
  expect(source).toContain('[SM_ST_REGION_A_IDX] = -1');
  expect(source).toContain('[SM_ST_REGION_B_IDX] = -1');
  expect(source).toContain('Active State Mapping');
  expect(source).toContain('Parallel child states are tracked using state_active[].');
});
```

Add a source assertion that initialization gates entry:

```ts
it('validates generated mapping metadata before root entry', () => {
  const core = renderCoreSource(build(flatOrFixture()));
  const validation = core.indexOf('SM_Validate_Mapping_Configuration()');
  const rootEntry = core.indexOf('SM_Enter_Layer_Default');

  expect(validation).toBeGreaterThan(-1);
  expect(rootEntry).toBeGreaterThan(validation);
  expect(core).toContain('return SM_ERR_CONFIGURATION;');
});
```

- [ ] **Step 2: Run mapping tests and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "shared parent|metadata before root" --reporter=verbose
```

Expected: failure because `sm_mapping.h/.c` and the initialization gate do not exist.

- [ ] **Step 3: Render the internal mapping header**

Add `renderMappingHeader()`:

```ts
export const renderMappingHeader = (): string => lines(
  '#ifndef SM_MAPPING_H',
  '#define SM_MAPPING_H',
  '',
  '#include "sm_config.h"',
  '',
  'extern const uint32_t SM_State_Parent_Layer_Map[SM_NUM_STATES + 1U];',
  'extern const int32_t SM_State_Active_Slot_Map[SM_NUM_STATES + 1U];',
  'extern const SM_Node_t SM_Layer_Parent_State_Map[SM_NUM_LAYERS];',
  'extern const int32_t SM_Layer_Active_Slot_Map[SM_NUM_LAYERS];',
  '',
  'SM_Error_t SM_Validate_Mapping_Configuration(void);',
  '',
  '#endif /* SM_MAPPING_H */',
);
```

- [ ] **Step 4: Render mapping definitions, documentation, and range/relationship validation**

Add `renderMappingSource(ir)` using `orderedStates(ir)`, `orderedLayers(ir)`, and `buildIndex(ir)`. Its validator implements these bounded checks:

```c
for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {
    slot = SM_Layer_Active_Slot_Map[layer_index];
    if ((slot < -1) || (slot >= (int32_t)SM_NUM_ACTIVE_SLOTS)) {
        return SM_ERR_CONFIGURATION;
    }
    parent_state = SM_Layer_Parent_State_Map[layer_index];
    if ((parent_state < SM_NODE_INVALID)
        || ((uint32_t)parent_state > SM_NUM_STATES)) {
        return SM_ERR_CONFIGURATION;
    }
}
for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {
    parent_layer = SM_State_Parent_Layer_Map[state_index];
    if (parent_layer >= SM_NUM_LAYERS) {
        return SM_ERR_CONFIGURATION;
    }
    slot = SM_State_Active_Slot_Map[state_index];
    if ((slot < -1) || (slot >= (int32_t)SM_NUM_ACTIVE_SLOTS)) {
        return SM_ERR_CONFIGURATION;
    }
    if (slot != SM_Layer_Active_Slot_Map[parent_layer]) {
        return SM_ERR_CONFIGURATION;
    }
}
return SM_ERR_NONE;
```

Generate the documentation table from the same ordered layer list. Use `NONE` for `null` slots.

- [ ] **Step 5: Register the two new generated artifacts and consume them**

Add to `implementationFiles` before `sm_core.c`:

```ts
{ name: 'sm_mapping.h', content: renderMappingHeader() },
{ name: 'sm_mapping.c', content: renderMappingSource(ir) },
```

Include `sm_mapping.h` from generated core and safety sources. Remove duplicate state-slot and layer-slot definitions from `renderSafetySource`; retain only safety-specific activity/descendant metadata there.

In `SM_Init()`, after zero/sentinel initialization and before any entry call, emit:

```c
instance->error_status = SM_Validate_Mapping_Configuration();
if (instance->error_status != SM_ERR_NONE) {
    return SM_ERR_CONFIGURATION;
}
```

- [ ] **Step 6: Update explicit C compile lists**

In `compileAndRun()` and strict manual compilation tests, add `sm_mapping.c` immediately before `sm_core.c`:

```ts
'sm_mapping.c',
'sm_core.c',
'sm_safety.c',
'sm_user_logic.c',
```

- [ ] **Step 7: Run mapping and strict-C tests and verify GREEN**

Run:

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "shared parent|metadata before root|strict C99" --reporter=verbose
```

Expected: all selected tests pass without warnings or linker errors.

- [ ] **Step 8: Commit shared mapping generation**

```powershell
git add -- src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "feat(state-machine): generate validated mapping metadata"
```

---

### Task 3: Add Explicit Slot, Layer, and State Activity APIs

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Modify: `src/utils/stateMachineCodeGenerator.test.ts`
- Modify: `src/utils/stateMachine/smDifferential.test.ts`
- Modify: `src/utils/smAnalysisEngine.ts`

**Interfaces:**
- Produces: `SM_GetActiveSlot(instance, uint32_t slot)`
- Produces: `SM_GetLayerActive(instance, uint32_t layer)`
- Produces: `SM_IsStateActive(instance, SM_Node_t state)`
- Preserves: deprecated `SM_GetActive(instance, SM_Group_t slot)`

- [ ] **Step 1: Add failing public-header and source assertions**

```ts
it('renders distinct slot, layer, and state activity APIs', () => {
  const ir = build(nestedAndFixture());
  const header = generatedFile(ir, 'sm_core.h');
  const core = generatedFile(ir, 'sm_core.c');

  expect(header).toContain('SM_Node_t SM_GetActiveSlot(');
  expect(header).toContain('SM_Node_t SM_GetLayerActive(');
  expect(header).toContain('bool SM_IsStateActive(');
  expect(header).toContain('Deprecated: use SM_GetActiveSlot()');
  expect(core).toContain('slot = SM_Layer_Active_Slot_Map[layer];');
  expect(core).not.toContain('active_states[layer]');
  expect(core).toContain('return SM_GetActiveSlot(instance, (uint32_t)slot);');
});
```

- [ ] **Step 2: Add a failing compiled runtime API test**

Use `nestedAndFixture()` and compile a harness that prints results for valid and invalid slot/layer/state queries:

```c
printf("%u %u %u %u %u %u %u\n",
    SM_GetActiveSlot(&inst, 0U) != SM_NODE_INVALID,
    SM_GetActiveSlot(&inst, SM_NUM_ACTIVE_SLOTS) == SM_NODE_INVALID,
    SM_GetLayerActive(&inst, SM_LYR_ROOT_IDX) != SM_NODE_INVALID,
    SM_GetLayerActive(&inst, SM_LYR_PARALLEL_IDX) == SM_NODE_INVALID,
    SM_GetLayerActive(&inst, SM_NUM_LAYERS) == SM_NODE_INVALID,
    SM_IsStateActive(&inst, SM_ST_REGION_A),
    SM_IsStateActive(&inst, SM_ST_REGION_B));
```

Expected output after implementation: `1 1 1 1 1 1 1`.

- [ ] **Step 3: Run the API tests and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "distinct slot|runtime activity API" --reporter=verbose
```

Expected: missing declarations/functions cause assertion or C compilation failure.

- [ ] **Step 4: Render the public declarations and implementations**

Replace the single ambiguous declaration with:

```c
SM_Node_t SM_GetActiveSlot(const ADIA_Instance_t *instance, uint32_t slot);
SM_Node_t SM_GetLayerActive(const ADIA_Instance_t *instance, uint32_t layer);
bool SM_IsStateActive(const ADIA_Instance_t *instance, SM_Node_t state);
/* Deprecated: use SM_GetActiveSlot(). The argument is an active-slot ID. */
SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t slot);
```

Render the implementations exactly with range checks before indexing:

```c
SM_Node_t SM_GetActiveSlot(const ADIA_Instance_t *instance, uint32_t slot)
{
    if ((instance == NULL) || (slot >= SM_NUM_ACTIVE_SLOTS)) {
        return SM_NODE_INVALID;
    }
    return instance->active_states[slot];
}

SM_Node_t SM_GetLayerActive(const ADIA_Instance_t *instance, uint32_t layer)
{
    int32_t slot;
    if ((instance == NULL) || (layer >= SM_NUM_LAYERS)) {
        return SM_NODE_INVALID;
    }
    slot = SM_Layer_Active_Slot_Map[layer];
    if (slot < 0) {
        return SM_NODE_INVALID;
    }
    return SM_GetActiveSlot(instance, (uint32_t)slot);
}

bool SM_IsStateActive(const ADIA_Instance_t *instance, SM_Node_t state)
{
    if ((instance == NULL)
        || (state <= SM_NODE_INVALID)
        || ((uint32_t)state > SM_NUM_STATES)) {
        return false;
    }
    return instance->state_active[(uint32_t)state];
}

SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t slot)
{
    return SM_GetActiveSlot(instance, (uint32_t)slot);
}
```

- [ ] **Step 5: Migrate generated-code tests and guidance to explicit APIs**

Change runtime harness calls that intentionally query slots from
`SM_GetActive(&inst, 0U)` to `SM_GetActiveSlot(&inst, 0U)`. Update
`smAnalysisEngine.ts` guidance to say `Verify SM_GetActiveSlot() or
SM_GetLayerActive() returns the expected enum`. Keep one compatibility assertion
for `SM_GetActive()`.

- [ ] **Step 6: Run focused APIs, differential tests, and legacy facade tests**

Run:

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachineCodeGenerator.test.ts --reporter=verbose
```

Expected: all tests pass; both parallel region states report active.

- [ ] **Step 7: Commit the public interface correction**

```powershell
git add -- src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts src/utils/smAnalysisEngine.ts
git commit -m "feat(state-machine): separate activity query APIs"
```

---

### Task 4: Generate Type-Aware XBridges Output Assignments

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`

**Interfaces:**
- Consumes: resolved `XBSemanticSignal.numericType` and `SemanticVariableSymbol.semanticType`
- Produces: a direct native assignment for equal source/destination C types, otherwise one required conversion

- [ ] **Step 1: Change existing Step/Outport expectations to the required direct assignment**

In both existing Step auto-mapping tests, replace:

```ts
expect(coreSource).toContain(
  'instance->data.xb6_step_output = (float)((double)(instance->xb_a.XB6_StepOut_out));',
);
```

with:

```ts
expect(coreSource).toContain(
  'instance->data.xb6_step_output = instance->xb_a.XB6_StepOut_out;',
);
expect(coreSource).not.toContain(
  '(float)((double)(instance->xb_a.XB6_StepOut_out))',
);
```

Add a focused `float64 -> float` case asserting one `(float)` cast and no nested `(double)` cast.

- [ ] **Step 2: Run the Step mapping tests and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "Step block evaluation|auto-generates Outport|float64 output" --reporter=verbose
```

Expected: direct-assignment assertions fail because the generator still emits `(float)((double)(...))`.

- [ ] **Step 3: Add native type comparison and output expression rendering**

Add helpers beside `renderVariableCast`:

```ts
const nativeSignalCType = (type: XBNumericType): string | null => {
  if (type.kind === 'boolean') return 'bool';
  const precision = type.kind === 'float' ? type.precision : type.kind;
  if (precision === 'float32') return 'float';
  if (precision === 'float64') return 'double';
  return null;
};

const renderMappedOutputExpression = (
  state: SemanticState,
  mapping: XBSemanticMapping,
  signalId: string,
  layout: XBStateLayout,
  member: string,
): string => {
  const storage = signalStorageExpression(state, signalId, layout, member);
  const destination = renderVariableCast(mapping.variable.semanticType);
  const source = nativeSignalCType(storage.signal.numericType);
  if (source !== null) {
    return source === destination
      ? storage.expression
      : `(${destination})(${storage.expression})`;
  }
  return `(${destination})(${signalRealExpression(state, signalId, layout, member)})`;
};
```

Use `renderMappedOutputExpression(...)` in both `emitOutport` and the lifecycle output-publication loop so mapping is emitted once from the resolved Outport signal. Avoid duplicate assignments when `emitOutport` and lifecycle publication refer to the same mapping; lifecycle publication remains the authoritative boundary write.

- [ ] **Step 4: Add strict `-Wconversion` syntax verification for the fixture**

Extend `compileGeneratedCSyntax` with an optional flag list or add a focused test workspace compile using:

```ts
['-std=c11', '-Wall', '-Wextra', '-Wconversion', '-Werror', '-fsyntax-only']
```

Compile every generated `.c` file for the Step/Outport fixture.

- [ ] **Step 5: Run focused XBridges tests and verify GREEN**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "Step block evaluation|auto-generates Outport|float64 output" --reporter=verbose
```

Expected: Step auto-mapping remains correct, direct float assignment is emitted, and strict compilation passes.

- [ ] **Step 6: Commit the numeric conversion correction without discarding prior edits**

Review `git diff` first, then stage only the completed XBridges files:

```powershell
git diff -- src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git add -- src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "fix(xbridges): preserve Step output mapping types"
```

---

### Task 5: Refresh Generated Snapshots and Run the Complete Verification Gate

**Files:**
- Modify: `src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap`
- Modify only if generated: `src/generated/stateMachineRuntimeBundle.ts`

**Interfaces:**
- Verifies every requirement through semantic, generator, compiled-C, XBridges, facade, and TypeScript gates

- [ ] **Step 1: Run snapshot tests and verify the expected snapshot-only failure**

Run:

```powershell
npx vitest run src/utils/stateMachineCodeGenerator.golden.test.ts --reporter=verbose
```

Expected: snapshots fail only where the public API, mapping artifacts, or empty-layer output changed.

- [ ] **Step 2: Update snapshots deliberately and inspect their mapping/API sections**

Run:

```powershell
npx vitest run src/utils/stateMachineCodeGenerator.golden.test.ts -u --reporter=verbose
```

Inspect with:

```powershell
rg -n "SM_GetActiveSlot|SM_GetLayerActive|SM_IsStateActive|Active State Mapping|SM_Layer_Active_Slot_Map" src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap
```

Expected: new APIs and documentation are present; no `active_states[layer]` appears.

- [ ] **Step 3: Run all affected Vitest suites**

```powershell
npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts --reporter=verbose
```

Expected: all selected tests pass.

- [ ] **Step 4: Run TypeScript checking and the application build**

```powershell
npx tsc --noEmit
npm run build:sm-runtime
npm run build
```

Expected: all commands exit zero. If the runtime bundle changes, confirm its diff contains only regenerated semantic runtime changes.

- [ ] **Step 5: Search generated templates for forbidden identifier mixing and conversion patterns**

```powershell
rg -n "active_states\[layer\]|SM_GetActive\(.*group|\(float\)\(\(double\)" src/utils/stateMachine src/utils/__snapshots__
```

Expected: no production generator or snapshot matches; any compatibility test match is explicitly documented.

- [ ] **Step 6: Review the complete diff and preserve unrelated worktree changes**

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: no whitespace errors; only task-owned generated/runtime files plus pre-existing unrelated user files remain.

- [ ] **Step 7: Commit verified snapshots and generated bundle if changed**

```powershell
git add -- src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap
git add -- src/generated/stateMachineRuntimeBundle.ts
git commit -m "test(state-machine): verify explicit mapping APIs"
```

Skip the generated bundle path when it has no diff.

- [ ] **Step 8: Perform final requirement-by-requirement review**

Confirm REQ-001 through REQ-010 and all twelve Definition-of-Done items against test evidence. Any Critical or Important discrepancy blocks completion and returns to the relevant RED/GREEN task.
