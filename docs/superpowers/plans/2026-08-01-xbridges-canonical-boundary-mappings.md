# X-Bridges Canonical Boundary Mappings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist valid state-machine variable mappings to X-Bridges Inport and Outport blocks and preserve identical behavior through save/load, simulation, and generated C.

**Architecture:** Add a pure boundary-mapping module that resolves real React Flow block ports into canonical `XBMappingV1` records, mirrors canonical mappings into boundary-node display metadata, and prunes deleted references. Use the same resolver during legacy migration and editor saves; keep semantic validation strict and rely on the already implemented scalar Inport/Outport pass-through in the interpreter and C emitter.

**Tech Stack:** TypeScript, React 18, React Flow, Vitest, strict C99 differential harness.

## Global Constraints

- `xBridgesModel.mappings` is the only authoritative persisted mapping source.
- Every persisted mapping has non-empty `smVarId`, `blockId`, `portId`, and a valid `direction`.
- `in` maps a state-machine variable to an Inport input; `out` maps an Outport output to a state-machine variable.
- Repair legacy mappings only when one compatible boundary target exists; never guess among multiple candidates.
- Semantic validation must remain strict.
- Preserve legacy one-sided semantic models.
- Do not enable scalar code generation for `VectorAdd`; scalar addition uses `Sum`.
- Preserve unrelated user-owned working-tree changes.

---

### Task 1: Pure Canonical Boundary-Mapping Utilities

**Files:**
- Create: `src/utils/stateMachine/xbBoundaryMappings.ts`
- Create: `src/utils/stateMachine/xbBoundaryMappings.test.ts`

**Interfaces:**
- Consumes: React Flow legacy nodes or `XBNodeV1` nodes, `XBMappingV1`, and valid variable IDs.
- Produces:
  - `listXBBoundaryTargets(nodes, direction): readonly XBBoundaryTarget[]`
  - `createXBBoundaryMapping(smVarId, target): XBMappingV1`
  - `syncXBBoundaryNodeMetadata(nodes, mappings): any[]`
  - `reconcileXBBoundaryMappings(nodes, previousMappings, validVariableIds): readonly XBMappingV1[]`
  - `pruneXBBoundaryMappings(mappings, nodes): readonly XBMappingV1[]`

- [ ] **Step 1: Write failing target-resolution and canonical-record tests**

Create tests with real legacy Inport and Outport nodes:

```ts
const nodes = [
  {
    id: 'input', type: 'xblock',
    data: {
      type: 'Inport', params: { smVarId: 'x' },
      inputs: [{ id: 'in', direction: 'input' }],
      outputs: [{ id: 'out', direction: 'output' }],
    },
  },
  {
    id: 'output', type: 'xblock',
    data: {
      type: 'Outport', params: { smVarId: 'x' },
      inputs: [{ id: 'in', direction: 'input' }],
      outputs: [{ id: 'out', direction: 'output' }],
    },
  },
];

expect(listXBBoundaryTargets(nodes, 'in')).toEqual([
  { blockId: 'input', portId: 'in', direction: 'in', label: 'input' },
]);
expect(listXBBoundaryTargets(nodes, 'out')).toEqual([
  { blockId: 'output', portId: 'out', direction: 'out', label: 'output' },
]);
expect(createXBBoundaryMapping('x', listXBBoundaryTargets(nodes, 'in')[0]))
  .toEqual({ smVarId: 'x', blockId: 'input', portId: 'in', direction: 'in' });
```

- [ ] **Step 2: Write failing synchronization, reconciliation, and pruning tests**

Prove that canonical mappings overwrite stale `params.smVarId`, valid node
metadata creates complete mappings, nonexistent variables are not imported,
and deleting a block prunes its mapping:

```ts
const canonical = [
  { smVarId: 'x', blockId: 'input', portId: 'in', direction: 'in' as const },
  { smVarId: 'x', blockId: 'output', portId: 'out', direction: 'out' as const },
];
expect(syncXBBoundaryNodeMetadata(nodesWithStaleIds, canonical))
  .toMatchObject([
    { data: { params: { smVarId: 'x' } } },
    { data: { params: { smVarId: 'x' } } },
  ]);
expect(reconcileXBBoundaryMappings(nodes, [], new Set(['x']))).toEqual(canonical);
expect(reconcileXBBoundaryMappings(nodes, canonical, new Set(['other'])))
  .toEqual(canonical);
expect(pruneXBBoundaryMappings(canonical, [nodes[0]])).toEqual([canonical[0]]);
```

- [ ] **Step 3: Run the new tests and verify RED**

Run: `npx vitest run src/utils/stateMachine/xbBoundaryMappings.test.ts --reporter=verbose`

Expected: FAIL because `xbBoundaryMappings.ts` and its exports do not exist.

- [ ] **Step 4: Implement deterministic boundary resolution**

Implement `XBBoundaryTarget` and helpers. Resolve legacy type and ports from
`node.data`; resolve canonical type and ports from `node.type` and
`node.parameters.inputs/outputs`. Sort targets by `blockId`, then `portId`.
Accept only Inport input ports for direction `in` and Outport output ports for
direction `out`.

```ts
export interface XBBoundaryTarget {
  readonly blockId: string;
  readonly portId: string;
  readonly direction: 'in' | 'out';
  readonly label: string;
}

export const createXBBoundaryMapping = (
  smVarId: string,
  target: XBBoundaryTarget,
): XBMappingV1 => ({
  smVarId,
  blockId: target.blockId,
  portId: target.portId,
  direction: target.direction,
});
```

`reconcileXBBoundaryMappings` must preserve every already-complete canonical
mapping. It may derive a boundary mapping from `params.smVarId` only when that
variable exists and there is no canonical mapping for that boundary block.
`syncXBBoundaryNodeMetadata` mirrors the canonical variable ID into legacy
`data.params.smVarId` or canonical `parameters.smVarId` without mutating input.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx vitest run src/utils/stateMachine/xbBoundaryMappings.test.ts --reporter=verbose`

Expected: all boundary utility tests PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- src/utils/stateMachine/xbBoundaryMappings.ts src/utils/stateMachine/xbBoundaryMappings.test.ts
git commit -m "feat(xbridges): canonicalize boundary mappings"
```

---

### Task 2: Deterministic Legacy Mapping Repair

**Files:**
- Modify: `src/utils/stateMachine/xbBoundaryMappings.ts`
- Modify: `src/utils/stateMachine/xbBoundaryMappings.test.ts`
- Modify: `src/utils/stateMachine/smModelMigration.ts`
- Modify: `src/utils/stateMachine/smModelMigration.test.ts`

**Interfaces:**
- Consumes: raw embedded X-Bridges model plus `ReadonlySet<string>` valid variable IDs.
- Produces: `repairLegacyXBBoundaryMappings(input, validVariableIds): XBLegacyBoundaryRepairResult` with repaired raw model and explicit diagnostics.

- [ ] **Step 1: Add failing unique-repair and ambiguity tests**

Use a model shaped like `G:\statemachine.json`: two blank target mappings with
valid variable `x`, one two-port Inport, and one two-port Outport. Assert repair
fills `input:in` and `output:out`. Add a second Inport and assert the input
mapping remains invalid with a diagnostic containing:

```text
Mapping at index 0 cannot infer an input boundary because 2 compatible Inport ports exist.
```

Also prove a valid canonical mapping wins over stale node `params.smVarId`.

- [ ] **Step 2: Run migration tests and verify RED**

Run: `npx vitest run src/utils/stateMachine/smModelMigration.test.ts src/utils/stateMachine/xbBoundaryMappings.test.ts --reporter=verbose`

Expected: FAIL because blank mappings are still rejected before repair.

- [ ] **Step 3: Implement and wire repair before `adaptXBModel`**

Add:

```ts
export interface XBLegacyBoundaryRepairResult {
  readonly model: unknown;
  readonly diagnostics: readonly ModelDiagnostic[];
}

export const repairLegacyXBBoundaryMappings = (
  input: unknown,
  validVariableIds: ReadonlySet<string>,
): XBLegacyBoundaryRepairResult => { /* deterministic reconstruction */ };
```

Change `normalizeEmbeddedXBModels` to accept variables and call the repair
before `adaptXBModel`:

```ts
const validVariableIds = new Set(variables.map((variable) => variable.id));
const repaired = repairLegacyXBBoundaryMappings(
  state.xBridgesModel,
  validVariableIds,
);
const adapted = adaptXBModel(repaired.model);
```

Return repair diagnostics with the owning state ID. Do not remove the embedded
model when repair succeeds. Keep fail-closed behavior when repair is ambiguous
or references a nonexistent variable.

- [ ] **Step 4: Run migration tests and verify GREEN**

Run: `npx vitest run src/utils/stateMachine/smModelMigration.test.ts src/utils/stateMachine/xbBoundaryMappings.test.ts --reporter=verbose`

Expected: all selected tests PASS.

- [ ] **Step 5: Reproduce migration of the supplied JSON**

Run:

```powershell
npx tsx -e "import fs from 'node:fs'; import { migrateStateMachineModel } from './src/utils/stateMachine/smModelMigration.ts'; const raw=JSON.parse(fs.readFileSync('G:/statemachine.json','utf8')); const result=migrateStateMachineModel(raw); console.log(JSON.stringify(result.diagnostics,null,2)); console.log(JSON.stringify(result.model.states.find(s=>s.isXBridges)?.xBridgesModel?.mappings,null,2));"
```

Expected: no blank-mapping migration diagnostics and mappings contain
`Inport-1785536656374:in` and `Outport-1785536674566:out`. A later semantic
diagnostic for scalar `VectorAdd` remains correct until the model uses `Sum`.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- src/utils/stateMachine/xbBoundaryMappings.ts src/utils/stateMachine/xbBoundaryMappings.test.ts src/utils/stateMachine/smModelMigration.ts src/utils/stateMachine/smModelMigration.test.ts
git commit -m "fix(xbridges): repair legacy boundary mappings"
```

---

### Task 3: Editor Persistence and Boundary Selection

**Files:**
- Modify: `src/App.tsx:8032-8044,15098-15120,15969-16101`
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx:1241-1320`
- Modify: `src/utils/stateMachine/xbBoundaryMappings.test.ts`

**Interfaces:**
- Consumes: Task 1 utilities and the current state's `xBridgesModel.mappings`.
- Produces: complete canonical mappings on every debounced X-Bridges save and validated mapping dropdowns in the state properties panel.

- [ ] **Step 1: Add failing save/reload and direction-change utility tests**

Test this sequence entirely through the pure utility API:

1. Start with canonical input mapping `x -> input:in`.
2. Synchronize node metadata, structured-clone the model, and reconcile it.
3. Assert the canonical mapping is byte-for-byte stable.
4. Replace its target with the first output target and assert all four fields
   become `{ smVarId: 'x', blockId: 'output', portId: 'out', direction: 'out' }`.
5. Assert no intermediate mapping contains an empty field.

- [ ] **Step 2: Run the utility test and verify RED**

Run: `npx vitest run src/utils/stateMachine/xbBoundaryMappings.test.ts --reporter=verbose`

Expected: FAIL until target replacement and round-trip behavior are implemented.

- [ ] **Step 3: Extend the X-Bridges save contract**

Pass `initialMappings` from `App.tsx` into `XbridgesWorkspace`. Change the save
signature to:

```ts
onSave?: (
  nodes: any[],
  edges: any[],
  mappings: readonly XBMappingV1[],
) => void;
```

Before rendering initial nodes, mirror canonical mappings with
`syncXBBoundaryNodeMetadata`. On each debounced save, call
`reconcileXBBoundaryMappings(nodes, initialMappings, validVariableIds)` and
pass the result to `onSave`.

Update `handleXBridgesSave` to persist `{ nodes, edges, mappings }` together.
This ensures selecting a variable in the Inport/Outport properties panel
immediately updates the canonical mapping source.

- [ ] **Step 4: Replace free-text mapping controls**

Replace `+ Add Map`, `Block ID`, and `Block Port` free text with two buttons:
`+ Input` and `+ Output`. Disable a button when no variable or compatible
boundary exists. Each button creates a complete mapping from the first
variable and first compatible target.

Each row contains:

- a variable dropdown;
- a read-only direction label;
- a boundary dropdown populated by `listXBBoundaryTargets` for that direction;
- the existing remove button.

Changing the boundary uses `createXBBoundaryMapping(map.smVarId, target)`.
Changing the variable replaces only `smVarId`. No handler may write an empty
block or port ID.

- [ ] **Step 5: Prune mappings when nodes disappear**

In `handleXBridgesSave`, call:

```ts
const pruned = pruneXBBoundaryMappings(mappings, nodes);
```

Persist `pruned` and mirror it back into node metadata. This covers deletion,
clear-canvas, and paste/replace paths through the existing debounced save.

- [ ] **Step 6: Verify editor-related compilation and tests**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbBoundaryMappings.test.ts src/utils/stateMachine/smAppAdapter.test.ts --reporter=verbose
npx tsc --noEmit
```

Expected: all selected tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- src/App.tsx src/components/xbridges/XbridgesWorkspace.tsx src/utils/stateMachine/xbBoundaryMappings.test.ts
git commit -m "fix(app): persist valid X-Bridges boundary mappings"
```

---

### Task 4: End-to-End Simulation and Generated-C Gate

**Files:**
- Modify: `src/utils/stateMachine/smXBridgesAppIntegration.test.ts`
- Modify: `src/utils/stateMachine/smDifferential.test.ts`
- Modify: `docs/embedded-codegen.md`

**Interfaces:**
- Consumes: migrated canonical mapping model from Tasks 1-3.
- Produces: executable proof that application simulation and compiled C commit the same boundary output.

- [ ] **Step 1: Add failing application integration test**

Construct a state containing two-port Inport, scalar `Sum`, Constant `1`, and
two-port Outport. Start with `x = 1`, map `x -> Inport:in` and
`Outport:out -> x`, execute one state tick, and assert `x === 2`.

Use `createAppSimulationSession` and `stepAppSimulationSession`; do not invoke
the standalone X-Bridges engine.

- [ ] **Step 2: Add or update compiled-C differential case**

Use the same graph and mapping directions in `smDifferential.test.ts`. Assert:

```ts
expect(expected.at(-1)?.data.x).toBe(2);
expect(compareSemanticTraces(expected, actual)).toBeNull();
```

Label the case with both `T14-INT-CORE-DIRECT` and `T14-C99-CORE-DIRECT`.

- [ ] **Step 3: Run the new cases and establish the executable baseline**

Run:

```powershell
npx vitest run src/utils/stateMachine/smXBridgesAppIntegration.test.ts --reporter=verbose
npx vitest run src/utils/stateMachine/smDifferential.test.ts -t "boundary mapping" --reporter=verbose
```

Expected: if Tasks 1-3 exposed a missing application handoff, FAIL from a
rejected mapping or output other than `2`. If both tests PASS, they lock the
already-correct semantic pass-through and no additional production change is
authorized in this task.

- [ ] **Step 4: Complete only the wiring exposed by the failing tests**

If the canonical two-port model already passes due the existing interpreter
and C pass-through, retain production code unchanged. Otherwise, correct the
single failing boundary in the adapter or mapping handoff; do not weaken
semantic validation or add a second execution path.

- [ ] **Step 5: Document the supported modeling method**

Add this concise example to `docs/embedded-codegen.md`:

```text
SM x -> Inport input -> Sum(+ Constant 1) -> Outport output -> SM x
```

State that scalar arithmetic uses `Sum`, while `VectorAdd` requires vector
signals.

- [ ] **Step 6: Run the complete focused verification**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbBoundaryMappings.test.ts src/utils/stateMachine/smModelMigration.test.ts src/utils/stateMachine/smAppAdapter.test.ts src/utils/stateMachine/smXBridgesAppIntegration.test.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts --reporter=dot
npx vitest run src/utils/stateMachine/smDifferential.test.ts -t "boundary mapping" --reporter=verbose
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "T14-C99-CORE-DIRECT" --reporter=verbose
npx tsc --noEmit
git diff --check
```

Expected: all tests and TypeScript PASS; differential traces match; diff check
reports no whitespace errors.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- src/utils/stateMachine/smXBridgesAppIntegration.test.ts src/utils/stateMachine/smDifferential.test.ts docs/embedded-codegen.md
git commit -m "test(xbridges): prove boundary mapping parity"
```
