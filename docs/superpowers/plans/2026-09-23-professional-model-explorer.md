# Professional State Machine and SysML Model Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cameo-style Model Explorer that authors, reorganizes, relates, and presents State Machine and SysML elements directly from a validated semantic tree.

**Architecture:** Add a framework-neutral explorer core under `src/features/modelExplorer/`, with domain adapters for State Machine and SysML, then mount a focused React view from `App.tsx`. All operations dispatch typed commands through domain adapters; SysML reuses `sysmlCommandGateway`, while State Machine receives an equivalent immutable command adapter over the existing arrays and history snapshot boundary.

**Tech Stack:** React 18, TypeScript 5, Vitest, Playwright, existing ADIA SysML normalized store/patch history, existing State Machine model types and snapshot history, native pointer/keyboard events, Lucide icons, Tailwind/CSS variables.

## Global Constraints

- The containment tree represents semantic ownership, not visual grouping.
- Tree creation creates a semantic element only; it must not create a diagram presentation.
- Diagram symbols reference existing stable semantic IDs and never duplicate semantic elements.
- Every mutation must be validated, atomic, reversible, and synchronized with properties and diagrams.
- Unsupported metatypes must not be advertised by the capability registry.
- Existing project files must migrate without destructive ownership changes.
- Existing SysML persistence, deletion, reporting, simulation, code generation, and State Machine runtime behavior must remain intact.
- Preserve unrelated changes already present in the working tree.
- Do not add a tree-widget dependency; use the fixed-row virtualization implementation in this plan.
- Use semantic IDs for commands and selection; view-node IDs may be projection-specific.

---

## File map

### Explorer core

- Create `src/features/modelExplorer/modelExplorerTypes.ts`: normalized node, capability, command, diagnostic, drag/drop, and adapter contracts.
- Create `src/features/modelExplorer/modelExplorerProjection.ts`: flattening, sorting, filtering, expansion, and visible-row derivation.
- Create `src/features/modelExplorer/modelExplorerCapabilities.ts`: shared capability helpers and registry composition.
- Create `src/features/modelExplorer/modelExplorerCommandBus.ts`: preflight and adapter dispatch boundary.
- Create `src/features/modelExplorer/modelExplorerClipboard.ts`: ownership-forest copy, ID remapping, and paste payloads.
- Create `src/features/modelExplorer/modelDiagramRegistry.ts`: shared diagram metadata, creation, lookup, and active-diagram navigation.
- Create `src/features/modelExplorer/modelExplorerUiState.ts`: expansion, favorites, recents, search, selection, and persistence-safe reducer.
- Create `src/features/modelExplorer/index.ts`: public exports.

### Domain adapters

- Create `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.ts`: State Machine projection, capabilities, creation, rename, move, delete, and relationship commands.
- Create `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`: canonical SysML projection and command-gateway translation.
- Create `src/features/modelExplorer/adapters/modelExplorerFactories.ts`: deterministic element factories and unique-name generation.
- Modify `src/services/sysmlCommandGateway.ts`: semantic reparent, batch transaction, and add-to-diagram commands.
- Modify `src/engine/sysml/model.ts`: explicit package/owner support and schema migration target.
- Modify `src/engine/sysml/persistence.ts`: schema migration and explorer UI-state persistence.
- Modify `src/types/sm_types.ts`: Region-compatible layer metadata and supported pseudostate kinds.
- Modify `src/utils/stateMachine/smStatePruner.ts`: reusable move impact analysis and immutable reparent helper.

### React UI

- Create `src/components/modelExplorer/ModelExplorer.tsx`: composed explorer shell.
- Create `src/components/modelExplorer/ModelExplorerToolbar.tsx`: tabs, search, expand/collapse, favorites.
- Create `src/components/modelExplorer/VirtualTree.tsx`: fixed-row virtualized ARIA tree.
- Create `src/components/modelExplorer/ModelTreeRow.tsx`: row visuals, badges, inline rename, drag handle.
- Create `src/components/modelExplorer/ModelExplorerMenu.tsx`: searchable context menu and create menus.
- Create `src/components/modelExplorer/RelationshipWizard.tsx`: direction/type/target workflow.
- Create `src/components/modelExplorer/MoveImpactDialog.tsx`: move/delete impact confirmation.
- Create `src/components/modelExplorer/modelExplorer.css`: focus, drag, validation, and density styling.
- Modify `src/App.tsx`: remove inline `HierarchyTree`, instantiate adapters, route commands, and mount `ModelExplorer`.

### Tests and documentation

- Create colocated `*.test.ts` and `*.test.tsx` files for each core/adaptor/component module.
- Create `tests/e2e/model-explorer-state-machine.spec.ts`.
- Create `tests/e2e/model-explorer-sysml.spec.ts`.
- Create `tests/e2e/model-explorer-performance.spec.ts`.
- Create `docs/guides/model-explorer.md`.

---

### Task 1: Lock the explorer contracts and normalized projection

**Files:**
- Create: `src/features/modelExplorer/modelExplorerTypes.ts`
- Create: `src/features/modelExplorer/modelExplorerProjection.ts`
- Create: `src/features/modelExplorer/modelExplorerProjection.test.ts`
- Create: `src/features/modelExplorer/index.ts`

**Interfaces:**
- Produces: `ModelTreeNode`, `ModelTreeProjection`, `ExplorerCapability`, `ModelExplorerCommand`, `ModelExplorerAdapter`, `flattenVisibleTree()`.
- Consumes: only primitive TypeScript types; no React or domain imports.

- [ ] **Step 1: Write failing projection tests**

```ts
import { describe, expect, it } from 'vitest';
import { flattenVisibleTree, filterProjection } from './modelExplorerProjection';
import type { ModelTreeProjection } from './modelExplorerTypes';

const projection: ModelTreeProjection = {
  roots: ['root'],
  nodes: {
    root: { nodeId: 'root', semanticId: 'model', domain: 'sysml', kind: 'model', label: 'Model', parentNodeId: null, childNodeIds: ['b', 'a'], hasChildren: true },
    a: { nodeId: 'a', semanticId: 'a', domain: 'sysml', kind: 'block', label: 'Alpha', parentNodeId: 'root', childNodeIds: [], hasChildren: false },
    b: { nodeId: 'b', semanticId: 'b', domain: 'sysml', kind: 'block', label: 'Beta', parentNodeId: 'root', childNodeIds: [], hasChildren: false },
  },
  revision: 1,
};

describe('modelExplorerProjection', () => {
  it('flattens expanded nodes in deterministic label order', () => {
    expect(flattenVisibleTree(projection, new Set(['root'])).map(row => [row.node.semanticId, row.depth]))
      .toEqual([['model', 0], ['a', 1], ['b', 1]]);
  });

  it('retains ancestor paths for search matches', () => {
    const filtered = filterProjection(projection, 'beta');
    expect(filtered.roots).toEqual(['root']);
    expect(filtered.nodes.root.childNodeIds).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npx vitest run src/features/modelExplorer/modelExplorerProjection.test.ts`

Expected: FAIL because the explorer modules do not exist.

- [ ] **Step 3: Add the contracts**

```ts
export type ExplorerDomain = 'stateMachine' | 'sysml';
export type ExplorerView = 'containment' | 'diagramContext' | 'search';
export type CapabilityKind = 'createElement' | 'createDiagram' | 'createRelationship' | 'rename' | 'move' | 'copy' | 'paste' | 'duplicate' | 'delete' | 'addToDiagram' | 'openSpecification' | 'reveal';

export interface ModelTreeNode {
  nodeId: string;
  semanticId: string;
  domain: ExplorerDomain;
  kind: string;
  label: string;
  secondaryLabel?: string;
  parentNodeId: string | null;
  childNodeIds: string[];
  hasChildren: boolean;
  icon?: string;
  badges?: Array<{ kind: 'error' | 'warning' | 'info'; label: string }>;
  readOnly?: boolean;
}

export interface ModelTreeProjection {
  roots: string[];
  nodes: Record<string, ModelTreeNode>;
  revision: number;
}

export interface VisibleTreeRow { node: ModelTreeNode; depth: number; index: number; }
export interface ExplorerCapability { id: string; kind: CapabilityKind; label: string; enabled: boolean; reason?: string; elementKind?: string; relationshipKind?: string; direction?: 'incoming' | 'outgoing'; }
export interface ExplorerDiagnostic { code: string; severity: 'error' | 'warning' | 'info'; message: string; semanticId?: string; }
export interface ExplorerImpact { descendants: string[]; relationships: string[]; presentations: string[]; invalidated: string[]; }

export type ModelExplorerCommand =
  | { type: 'createElement'; ownerId: string; elementKind: string; name?: string }
  | { type: 'createDiagram'; ownerId: string; diagramKind: string; name?: string }
  | { type: 'rename'; elementId: string; name: string }
  | { type: 'move'; elementIds: string[]; targetOwnerId: string; confirmedImpactHash?: string }
  | { type: 'delete'; elementIds: string[]; confirmedImpactHash?: string }
  | { type: 'createRelationship'; relationshipKind: string; sourceId: string; targetId: string }
  | { type: 'addToDiagram'; elementIds: string[]; diagramId: string; position?: { x: number; y: number } }
  | { type: 'duplicate'; elementIds: string[]; targetOwnerId: string }
  | { type: 'paste'; payload: ExplorerClipboardPayload; targetOwnerId: string; mode: 'copy' | 'move' | 'reference' };

export interface ExplorerClipboardPayload { domain: ExplorerDomain; rootIds: string[]; snapshots: Record<string, unknown>; copiedAtRevision: number; }
export interface ExplorerCommandResult { committed: boolean; revision: number; diagnostics: ExplorerDiagnostic[]; selectedIds?: string[]; impact?: ExplorerImpact; }

export interface ModelExplorerAdapter {
  readonly domain: ExplorerDomain;
  getRevision(): number;
  project(view: ExplorerView, contextId?: string): ModelTreeProjection;
  capabilities(elementIds: readonly string[], activeDiagramId?: string): ExplorerCapability[];
  preflight(command: ModelExplorerCommand): ExplorerCommandResult;
  execute(command: ModelExplorerCommand): ExplorerCommandResult;
  relationshipTargets(sourceId: string, relationshipKind: string, direction: 'incoming' | 'outgoing'): ModelTreeNode[];
}
```

- [ ] **Step 4: Implement deterministic flattening and ancestor-preserving filtering**

```ts
export function flattenVisibleTree(projection: ModelTreeProjection, expanded: ReadonlySet<string>): VisibleTreeRow[] {
  const rows: VisibleTreeRow[] = [];
  const visit = (nodeId: string, depth: number) => {
    const node = projection.nodes[nodeId];
    if (!node) return;
    rows.push({ node, depth, index: rows.length });
    if (!expanded.has(nodeId)) return;
    [...node.childNodeIds]
      .sort((left, right) => projection.nodes[left].label.localeCompare(projection.nodes[right].label) || left.localeCompare(right))
      .forEach(childId => visit(childId, depth + 1));
  };
  projection.roots.forEach(rootId => visit(rootId, 0));
  return rows;
}
```

Implement `filterProjection()` by matching lowercase `label`, `secondaryLabel`, and `kind`, retaining all ancestors of matches and only matching descendant branches.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/features/modelExplorer/modelExplorerProjection.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/modelExplorer
git commit -m "feat(model-explorer): add normalized tree contracts"
```

---

### Task 2: Add explicit SysML ownership and safe persistence migration

**Files:**
- Modify: `src/engine/sysml/model.ts`
- Modify: `src/engine/sysml/persistence.ts`
- Modify: `src/engine/sysml/normalizedStore.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Test: `src/engine/sysml/persistence.test.ts`
- Test: `src/engine/sysml/normalizedStore.test.ts`
- Test: `src/services/sysmlCommandGateway.test.ts`

**Interfaces:**
- Produces: `PackageDefinition`, `ModelDiagramDefinition`, `ownerId` on named definitions, and `moveElements`, `createDiagram`, and `batch` gateway commands.
- Consumes: existing normalized store and patch history.

- [ ] **Step 1: Add failing migration and reparent tests**

```ts
it('migrates schema 2 definitions into the model root without changing IDs', () => {
  const loaded = deserializeSysmlRepository(JSON.stringify(schema2Fixture));
  expect(loaded.schemaVersion).toBe(3);
  expect(loaded.packages.model.name).toBe('Model');
  expect(loaded.definitions.motor.ownerId).toBe('model');
});

it('moves definitions atomically and undo restores their owners', () => {
  const result = executeSysmlCommand(state, { type: 'moveElements', elementIds: ['motor'], targetOwnerId: 'pkg-power' });
  expect(result.committed).toBe(true);
  expect(result.repository.definitions.motor.ownerId).toBe('pkg-power');
  const undone = executeSysmlCommand(result, { type: 'undo' });
  expect(undone.repository.definitions.motor.ownerId).toBe('model');
});
```

- [ ] **Step 2: Verify failures**

Run: `npx vitest run src/engine/sysml/persistence.test.ts src/engine/sysml/normalizedStore.test.ts src/services/sysmlCommandGateway.test.ts`

Expected: FAIL on missing schema 3 ownership and `moveElements`.

- [ ] **Step 3: Extend the canonical model**

```ts
export interface NamedElement { id: string; name: string; namespace: string[]; ownerId: string; }
export interface PackageDefinition extends NamedElement { kind: 'package'; }
export interface ModelDiagramDefinition extends NamedElement {
  kind: 'diagram';
  diagramKind: 'bdd' | 'ibd' | 'requirements' | 'rtm' | 'stateMachine';
  contextElementId?: string;
}

export interface SysmlRepository {
  schemaVersion: 3;
  profileId: 'OMG-SysML-1.6-ADIA';
  revision: number;
  packages: Record<string, PackageDefinition>;
  diagrams: Record<string, ModelDiagramDefinition>;
  // existing collections remain unchanged
}
```

`createEmptyRepository()` must create `{ id: 'model', kind: 'package', name: 'Model', namespace: [], ownerId: '' }`. Migration assigns `ownerId: 'model'` only when an existing element has no explicit owner. Requirements and usages retain their current owner semantics.

- [ ] **Step 4: Add cycle-safe batch reparent commands**

```ts
export type SysmlMutationCommand =
  | { type: 'createElement'; element: SysmlElement; presentation?: PresentationCoordinates; coalesceKey?: string }
  | { type: 'updateElement'; elementId: string; patch: Record<string, unknown>; coalesceKey?: string }
  | { type: 'deleteElements'; elementIds: string[]; confirmedImpactHash?: string; authorizedBaselineIds?: string[] }
  | { type: 'removeFromDiagram'; diagramId: string; elementIds: string[] }
  | { type: 'updatePresentation'; elementId: string; presentation: PresentationCoordinates; coalesceKey?: string }
  | { type: 'moveElements'; elementIds: string[]; targetOwnerId: string; confirmedImpactHash?: string }
  | { type: 'createDiagram'; diagram: ModelDiagramDefinition }
  | { type: 'addToDiagram'; diagramId: string; elementIds: string[]; coordinates?: Record<string, PresentationCoordinates> };

export type SysmlEditorCommand =
  | SysmlMutationCommand
  | { type: 'batch'; commands: SysmlMutationCommand[]; coalesceKey?: string }
  | { type: 'undo' }
  | { type: 'redo' };
```

Preflight must reject missing owners, ownership cycles, unsupported owner/child pairs, and conflicting names. `batch` must apply against a cloned store and commit its single combined patch only after every child command succeeds.

- [ ] **Step 5: Run focused and release tests**

Run: `npx vitest run src/engine/sysml/persistence.test.ts src/engine/sysml/normalizedStore.test.ts src/services/sysmlCommandGateway.test.ts && npm run test:sysml`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/sysml/model.ts src/engine/sysml/persistence.ts src/engine/sysml/normalizedStore.ts src/services/sysmlCommandGateway.ts src/engine/sysml/*.test.ts src/services/sysmlCommandGateway.test.ts
git commit -m "feat(sysml): add explicit model ownership commands"
```

---

### Task 3: Implement SysML projection and capabilities

**Files:**
- Create: `src/features/modelExplorer/modelExplorerCapabilities.ts`
- Create: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Create: `src/features/modelExplorer/adapters/modelExplorerFactories.ts`
- Create: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

**Interfaces:**
- Consumes: `SysmlGatewayState`, `executeSysmlCommand()`, `ModelExplorerAdapter`.
- Produces: `createSysmlExplorerAdapter(options)` and supported-child/relationship capability matrices.

- [ ] **Step 1: Write failing capability tests**

```ts
it('offers only legal children and creates no presentation from the tree', () => {
  const adapter = createSysmlExplorerAdapter(harness);
  const labels = adapter.capabilities(['block-1'], 'bdd-1').filter(x => x.enabled).map(x => x.label);
  expect(labels).toContain('Part');
  expect(labels).toContain('Proxy Port');
  expect(labels).not.toContain('Region');
  const result = adapter.execute({ type: 'createElement', ownerId: 'block-1', elementKind: 'part', name: 'controller' });
  expect(result.committed).toBe(true);
  expect(harness.state.diagramPresentations['bdd-1']?.elementIds).not.toContain(result.selectedIds?.[0]);
});

it('filters relationship targets by canonical policy', () => {
  const targets = adapter.relationshipTargets('req-1', 'satisfy', 'incoming');
  expect(targets.map(node => node.kind)).toContain('block');
  expect(targets.map(node => node.kind)).not.toContain('requirement');
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement declarative capability tables**

```ts
const SYSML_CHILDREN: Record<string, readonly string[]> = {
  model: ['package', 'block', 'valueType', 'interface', 'requirement', 'verificationCase'],
  package: ['package', 'block', 'valueType', 'interface', 'requirement', 'verificationCase'],
  block: ['part', 'reference', 'sharedPart', 'fullPort', 'proxyPort', 'valueProperty'],
  requirement: ['requirement'],
};

const SYSML_RELATIONSHIPS: Record<string, readonly string[]> = {
  block: ['association', 'sharedAggregation', 'composition', 'generalization', 'dependency', 'allocation', 'satisfy', 'verify', 'refine', 'trace'],
  requirement: ['requirementContainment', 'deriveReqt', 'refine', 'trace', 'copy'],
  part: ['connector', 'binding', 'itemFlow', 'allocation', 'satisfy'],
};
```

Only advertise a kind when a factory and gateway validation path exist. Factories generate UUIDs, valid defaults, a unique sibling name, and required types. Part creation without a valid Block type must return `PART_TYPE_REQUIRED` rather than inventing an unresolved type.

- [ ] **Step 4: Implement projection branches**

Create package/definition ownership branches, Block feature branches (`Parts`, `Ports`, `Properties`), Requirement children, `Relationships`, and canonical `Diagrams`. `createDiagram` must create metadata and an empty `diagramPresentations[diagramId]`, without creating semantic elements or symbols. Use projection node IDs such as `sysml:element:<id>` and `sysml:group:<ownerId>:parts`; keep `semanticId` canonical.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/services/sysmlCommandGateway.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/modelExplorer
git commit -m "feat(model-explorer): project SysML containment and capabilities"
```

---

### Task 4: Implement immutable State Machine commands and projection

**Files:**
- Modify: `src/types/sm_types.ts`
- Modify: `src/utils/stateMachine/smStatePruner.ts`
- Create: `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.ts`
- Create: `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts`
- Test: `src/utils/stateMachine/smStatePruner.test.ts`

**Interfaces:**
- Consumes: existing `StateData`, `Layer`, `JunctionData`, `TransitionData`, and App snapshot callback.
- Produces: `StateMachineExplorerSnapshot`, State Machine diagram metadata, `analyzeStateMove()`, `moveStateMachineElements()`, and `createStateMachineExplorerAdapter()`.

- [ ] **Step 1: Write failing hierarchy tests**

```ts
it('projects regions, vertices, and transitions under their semantic owners', () => {
  const projection = adapter.project('containment');
  expect(projection.nodes['sm:region:root'].childNodeIds).toContain('sm:state:idle');
  expect(projection.nodes['sm:group:root:transitions'].childNodeIds).toContain('sm:transition:t1');
});

it('moves a state atomically and reports invalid connected transitions', () => {
  const preflight = adapter.preflight({ type: 'move', elementIds: ['idle'], targetOwnerId: 'region-b' });
  expect(preflight.committed).toBe(false);
  expect(preflight.impact?.invalidated).toEqual(['t1']);
  const result = adapter.execute({ type: 'move', elementIds: ['idle'], targetOwnerId: 'region-b', confirmedImpactHash: hashImpact(preflight.impact!) });
  expect(result.committed).toBe(true);
  expect(harness.snapshot.layers.find(x => x.id === 'region-b')?.stateIds).toContain('idle');
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts src/utils/stateMachine/smStatePruner.test.ts`

Expected: FAIL on missing adapter and move helpers.

- [ ] **Step 3: Complete supported pseudostate metadata**

```ts
export type PseudostateKind = 'initial' | 'final' | 'junction' | 'choice' | 'fork' | 'join' | 'history' | 'deep-history' | 'entry-point' | 'exit-point' | 'terminate';

export interface JunctionData {
  // existing fields
  type?: PseudostateKind;
}

export interface StateMachineDiagramData {
  id: string;
  name: string;
  ownerId: string;
  contextRegionId: string;
}
```

Migration must map current `junction`, `history`, and `deep-history` values unchanged and reject no existing project.

- [ ] **Step 4: Implement move analysis and immutable application**

`analyzeStateMove(snapshot, elementIds, targetRegionId)` must reject missing targets, attempts to move a state into its own descendant Region, and incompatible vertex types. It must classify connected transitions as `preserved`, `crossRegion`, or `invalid`. `moveStateMachineElements()` clones touched arrays, updates source/target membership lists and parent references, removes only user-confirmed invalid transitions, and returns a complete next snapshot.

- [ ] **Step 5: Implement capabilities and commands**

```ts
const STATE_MACHINE_CHILDREN = {
  stateMachine: ['region'],
  region: ['state', 'final', 'initial', 'choice', 'junction', 'fork', 'join', 'history', 'deep-history', 'entry-point', 'exit-point', 'terminate'],
  state: ['region'],
} as const;
```

`createRelationship` supports transitions only and delegates to existing transition semantics. `createDiagram` adds `StateMachineDiagramData` for the selected State Machine or composite State context and initializes an empty presentation set. The adapter calls `onCommit(nextSnapshot, description)` once per successful command so App history records a single undo step.

- [ ] **Step 6: Run State Machine regression tests**

Run: `npx vitest run src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts src/utils/stateMachine/smStatePruner.test.ts src/utils/stateMachine/smModelMigration.test.ts src/utils/stateMachine/smSemanticBuilder.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/sm_types.ts src/utils/stateMachine/smStatePruner.ts src/utils/stateMachine/smStatePruner.test.ts src/features/modelExplorer/adapters
git commit -m "feat(model-explorer): add State Machine authoring adapter"
```

---

### Task 5: Add the command bus, explorer state, and clipboard engine

**Files:**
- Create: `src/features/modelExplorer/modelExplorerCommandBus.ts`
- Create: `src/features/modelExplorer/modelExplorerCommandBus.test.ts`
- Create: `src/features/modelExplorer/modelExplorerUiState.ts`
- Create: `src/features/modelExplorer/modelExplorerUiState.test.ts`
- Create: `src/features/modelExplorer/modelExplorerClipboard.ts`
- Create: `src/features/modelExplorer/modelExplorerClipboard.test.ts`
- Create: `src/features/modelExplorer/modelDiagramRegistry.ts`
- Create: `src/features/modelExplorer/modelDiagramRegistry.test.ts`

**Interfaces:**
- Consumes: `ModelExplorerAdapter`.
- Produces: `createModelExplorerCommandBus()`, `modelExplorerUiReducer()`, `copyOwnershipForest()`, `remapClipboardPayload()`, and `createModelDiagramRegistry()`.

- [ ] **Step 1: Write failing atomicity, reducer, and ID-remapping tests**

```ts
it('does not execute when preflight returns errors', () => {
  const result = bus.dispatch({ type: 'rename', elementId: 'a', name: '' });
  expect(result.committed).toBe(false);
  expect(adapter.execute).not.toHaveBeenCalled();
});

it('remaps internal references and preserves external references on duplicate', () => {
  const remapped = remapClipboardPayload(payload, () => ids.shift()!);
  expect(remapped.snapshots.newChild.ownerId).toBe('newRoot');
  expect(remapped.snapshots.newRoot.externalTypeId).toBe('library-block');
});

it('creates and opens an empty owned diagram without creating symbols', () => {
  const diagram = registry.create({ ownerId: 'block-1', diagramKind: 'ibd', name: 'Power IBD' });
  expect(registry.listForOwner('block-1')).toContainEqual(diagram);
  expect(registry.presentedElementIds(diagram.id)).toEqual([]);
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/features/modelExplorer/modelExplorerCommandBus.test.ts src/features/modelExplorer/modelExplorerUiState.test.ts src/features/modelExplorer/modelExplorerClipboard.test.ts src/features/modelExplorer/modelDiagramRegistry.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement dispatch semantics**

```ts
export function createModelExplorerCommandBus(adapter: ModelExplorerAdapter) {
  return {
    dispatch(command: ModelExplorerCommand): ExplorerCommandResult {
      const checked = adapter.preflight(command);
      if (checked.diagnostics.some(d => d.severity === 'error') || checked.impact) return checked;
      return adapter.execute(command);
    },
    confirm(command: ModelExplorerCommand, impactHash: string): ExplorerCommandResult {
      return adapter.execute({ ...command, confirmedImpactHash: impactHash } as ModelExplorerCommand);
    },
  };
}
```

The UI reducer stores `activeView`, `expandedNodeIds`, `selectedSemanticIds`, `focusedNodeId`, `query`, `favorites`, and `recentSemanticIds`. Persistence exports only view state, never model state. The diagram registry wraps domain-owned diagram metadata behind `listForOwner()`, `create()`, `open()`, and `presentedElementIds()` so the React tree does not special-case SysML versus State Machine navigation.

- [ ] **Step 4: Implement clipboard ownership-forest rules**

Reject mixed domains, remove selected descendants whose ancestor is already selected, snapshot the complete owned forest, remap every copied ID, rewrite internal references, and preserve legal references to external elements.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/features/modelExplorer/modelExplorerCommandBus.test.ts src/features/modelExplorer/modelExplorerUiState.test.ts src/features/modelExplorer/modelExplorerClipboard.test.ts src/features/modelExplorer/modelDiagramRegistry.test.ts && npx tsc --noEmit`

```bash
git add src/features/modelExplorer
git commit -m "feat(model-explorer): add command and clipboard infrastructure"
```

---

### Task 6: Build the accessible virtualized tree shell

**Files:**
- Create: `src/components/modelExplorer/VirtualTree.tsx`
- Create: `src/components/modelExplorer/VirtualTree.test.tsx`
- Create: `src/components/modelExplorer/ModelTreeRow.tsx`
- Create: `src/components/modelExplorer/ModelTreeRow.test.tsx`
- Create: `src/components/modelExplorer/ModelExplorerToolbar.tsx`
- Create: `src/components/modelExplorer/ModelExplorer.tsx`
- Create: `src/components/modelExplorer/modelExplorer.css`

**Interfaces:**
- Consumes: projections, capabilities, UI reducer, and callbacks supplied by App.
- Produces: `ModelExplorerProps` and an ARIA-compliant fixed-row tree.

- [ ] **Step 1: Write failing keyboard and virtualization tests**

```tsx
it('moves focus and expands with tree keyboard semantics', () => {
  renderExplorer();
  fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowRight' });
  expect(screen.getByRole('treeitem', { name: /model/i })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });
  expect(screen.getByRole('treeitem', { name: /alpha/i })).toHaveAttribute('tabindex', '0');
});

it('renders only viewport rows plus overscan', () => {
  renderLargeTree(10_000, { height: 320, rowHeight: 24 });
  expect(screen.getAllByRole('treeitem').length).toBeLessThan(50);
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/components/modelExplorer/VirtualTree.test.tsx src/components/modelExplorer/ModelTreeRow.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement fixed-row virtualization**

Calculate `start = floor(scrollTop / rowHeight)`, render through `ceil((scrollTop + height) / rowHeight) + overscan`, and position rows inside a spacer with `transform: translateY(index * rowHeight)`. Preserve active descendant/focus even when scrolling.

- [ ] **Step 4: Implement tree semantics and toolbar**

The tree uses `role="tree"`; rows use `role="treeitem"`, `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded`, and `aria-selected`. Arrow keys navigate/expand/collapse; Home/End/Page keys move focus; Enter opens; Space selects; F2 renames; Delete requests impact.

Toolbar tabs are `Containment`, `Diagram Context`, and conditional `Search Results`, plus search, collapse all, expand selected, favorites, and options.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/components/modelExplorer/VirtualTree.test.tsx src/components/modelExplorer/ModelTreeRow.test.tsx && npx tsc --noEmit`

```bash
git add src/components/modelExplorer
git commit -m "feat(model-explorer): add accessible virtual tree shell"
```

---

### Task 7: Add searchable context menus and inline rename

**Files:**
- Create: `src/components/modelExplorer/ModelExplorerMenu.tsx`
- Create: `src/components/modelExplorer/ModelExplorerMenu.test.tsx`
- Modify: `src/components/modelExplorer/ModelTreeRow.tsx`
- Modify: `src/components/modelExplorer/ModelExplorer.tsx`

**Interfaces:**
- Consumes: `ExplorerCapability[]` and `onCommand(command)`.
- Produces: context menu, searchable create submenus, and validated rename requests.

- [ ] **Step 1: Write failing interaction tests**

```tsx
it('shows enabled legal children and disabled actions with reasons', () => {
  openContextMenu('block-1');
  expect(screen.getByRole('menuitem', { name: 'Part' })).toBeEnabled();
  expect(screen.queryByRole('menuitem', { name: 'Region' })).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Paste' })).toHaveAttribute('aria-disabled', 'true');
});

it('commits F2 rename once and restores row focus', () => {
  beginRename('block-1');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PowerUnit' } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(onCommand).toHaveBeenCalledWith({ type: 'rename', elementId: 'block-1', name: 'PowerUnit' });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/components/modelExplorer/ModelExplorerMenu.test.tsx src/components/modelExplorer/ModelTreeRow.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement menus and rename**

Group commands as `Create Element`, `Create Diagram`, `Create Relationship`, navigation, clipboard/refactor, and destructive actions. Create lists include a search input when more than eight entries exist. Escape closes without mutation. Rename trims input, keeps the editor open on validation failure, and displays the first diagnostic below the row.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/components/modelExplorer/ModelExplorerMenu.test.tsx src/components/modelExplorer/ModelTreeRow.test.tsx`

```bash
git add src/components/modelExplorer
git commit -m "feat(model-explorer): add contextual creation and rename"
```

---

### Task 8: Add relationship authoring and impact confirmation

**Files:**
- Create: `src/components/modelExplorer/RelationshipWizard.tsx`
- Create: `src/components/modelExplorer/RelationshipWizard.test.tsx`
- Create: `src/components/modelExplorer/MoveImpactDialog.tsx`
- Create: `src/components/modelExplorer/MoveImpactDialog.test.tsx`
- Modify: `src/components/modelExplorer/ModelExplorer.tsx`

**Interfaces:**
- Consumes: relationship capabilities, `relationshipTargets()`, command-bus preflight results.
- Produces: a three-stage direction/type/target workflow and reusable impact confirmation.

- [ ] **Step 1: Write failing wizard tests**

```tsx
it('filters valid targets and dispatches a canonical outgoing relationship', () => {
  renderWizard({ sourceId: 'req-1', direction: 'outgoing' });
  selectOption('Derive Requirement');
  typeSearch('thermal');
  chooseTarget('req-thermal');
  clickCreate();
  expect(onCreate).toHaveBeenCalledWith({ type: 'createRelationship', relationshipKind: 'deriveReqt', sourceId: 'req-1', targetId: 'req-thermal' });
});

it('requires the exact impact hash before a risky move executes', () => {
  renderImpactDialog(impact);
  clickConfirm();
  expect(onConfirm).toHaveBeenCalledWith(hashImpact(impact));
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/components/modelExplorer/RelationshipWizard.test.tsx src/components/modelExplorer/MoveImpactDialog.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the wizard**

The wizard fixes the selected endpoint, lists only enabled relationship types, debounces target search by 150 ms, shows qualified name/type, exposes disabled-target reasons, and reverses endpoints for incoming creation. If both endpoint presentations exist, show an unchecked `Add relationship to active diagram` option.

- [ ] **Step 4: Implement the generic impact dialog**

Render separate counts and expandable lists for descendants, relationships, presentations, and invalidated references. Confirmation returns the deterministic impact hash received from preflight; any model revision change forces a new preflight.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/components/modelExplorer/RelationshipWizard.test.tsx src/components/modelExplorer/MoveImpactDialog.test.tsx`

```bash
git add src/components/modelExplorer
git commit -m "feat(model-explorer): add relationship and impact workflows"
```

---

### Task 9: Add tree reparenting and tree-to-diagram presentation drag/drop

**Files:**
- Create: `src/features/modelExplorer/modelExplorerDragDrop.ts`
- Create: `src/features/modelExplorer/modelExplorerDragDrop.test.ts`
- Modify: `src/components/modelExplorer/ModelTreeRow.tsx`
- Modify: `src/components/modelExplorer/ModelExplorer.tsx`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `ExplorerDragPayload`, `classifyDropTarget()`, and `application/x-adia-model-elements` data-transfer format.
- Consumes: `move` and `addToDiagram` commands.

- [ ] **Step 1: Write failing drop-classification tests**

```ts
it('classifies legal, warning, and forbidden tree drops', () => {
  expect(classifyDropTarget(adapter, ['state-a'], 'region-b').state).toBe('allowed');
  expect(classifyDropTarget(adapter, ['state-a'], 'region-c').state).toBe('warning');
  expect(classifyDropTarget(adapter, ['state-a'], 'state-a-child').state).toBe('forbidden');
});

it('does not duplicate an existing diagram presentation', () => {
  const result = adapter.execute({ type: 'addToDiagram', elementIds: ['block-1'], diagramId: 'bdd-1' });
  expect(result.diagnostics[0].code).toBe('PRESENTATION_ALREADY_EXISTS');
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/features/modelExplorer/modelExplorerDragDrop.test.ts src/services/sysmlCommandGateway.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement drag payload and target feedback**

```ts
export interface ExplorerDragPayload {
  version: 1;
  domain: ExplorerDomain;
  semanticIds: string[];
  sourceRevision: number;
  intent: 'move' | 'present';
}
```

Tree rows serialize selected semantic IDs. Tree targets call move preflight and render green/amber/red feedback. Canvas drop revalidates revision, converts client coordinates through the existing viewport transform, then dispatches `addToDiagram` with active diagram ID and world position.

- [ ] **Step 4: Preserve semantic/presentation deletion distinction**

`Delete` from Containment dispatches semantic deletion with impact. Canvas deletion and `Remove from Diagram` continue to dispatch presentation-only removal. Add regression tests for both paths.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/features/modelExplorer/modelExplorerDragDrop.test.ts src/services/sysmlCommandGateway.test.ts && npx tsc --noEmit`

```bash
git add src/features/modelExplorer src/components/modelExplorer src/services/sysmlCommandGateway.ts src/App.tsx
git commit -m "feat(model-explorer): add semantic and presentation drag-drop"
```

---

### Task 10: Integrate Model Explorer into App and remove the inline tree

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/modelExplorer/ModelExplorer.integration.test.tsx`
- Modify: `src/components/sysml/sysmlBrowserFlow.test.tsx`

**Interfaces:**
- Consumes: domain adapters, active `diagramMode`, `currentLayerId`, selection, snapshots, canonical SysML gateway state.
- Produces: one mounted `ModelExplorer` replacing the inline `HierarchyTree` function.

- [ ] **Step 1: Write failing integration tests**

```tsx
it('creates a State from the tree and records one App history entry', () => {
  renderAppInStateMachineMode();
  createChildFromTree('root', 'State', 'Heating');
  expect(readState('Heating')).toBeDefined();
  undoWithKeyboard();
  expect(readState('Heating')).toBeUndefined();
});

it('creates a SysML Part semantically and presents the same ID after drag', () => {
  renderAppInBddMode();
  const partId = createPartFromTree('motor-block', 'rotor', 'rotor-type');
  expect(activeDiagramElementIds()).not.toContain(partId);
  dragTreeNodeToCanvas(partId, { x: 320, y: 240 });
  expect(activeDiagramElementIds()).toContain(partId);
  expect(canonicalPartIds().filter(id => id === partId)).toHaveLength(1);
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/components/modelExplorer/ModelExplorer.integration.test.tsx src/components/sysml/sysmlBrowserFlow.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Extract and mount**

Delete the local `HierarchyTree` declaration from `App.tsx`. Memoize adapters from the current State Machine snapshot and canonical SysML gateway state. Route State Machine adapter commits through `addToHistory()` plus one `applyStateMachineSnapshot()`. Route SysML adapter commits through `executeSysmlCommand()` and the existing repository/view synchronization path.

- [ ] **Step 4: Synchronize navigation and selection**

Tree selection updates `selectedIds`. Canvas selection reveals the corresponding node when `followSelection` is enabled. Double-click opens composite State context, IBD context Block, or the most relevant existing diagram. `Reveal in Containment` expands every ancestor path.

- [ ] **Step 5: Run integration and release checks**

Run: `npx vitest run src/components/modelExplorer/ModelExplorer.integration.test.tsx src/components/sysml/sysmlBrowserFlow.test.tsx && npm run test:sysml:release && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/modelExplorer src/components/sysml/sysmlBrowserFlow.test.tsx
git commit -m "feat(model-explorer): integrate professional tree into ADIA"
```

---

### Task 11: Complete multi-selection, copy/paste, duplicate, favorites, and recents

**Files:**
- Modify: `src/components/modelExplorer/ModelExplorer.tsx`
- Modify: `src/components/modelExplorer/ModelExplorerMenu.tsx`
- Modify: `src/features/modelExplorer/modelExplorerClipboard.ts`
- Modify: `src/features/modelExplorer/modelExplorerUiState.ts`
- Create: `src/components/modelExplorer/ModelExplorer.commands.test.tsx`
- Modify: `src/engine/sysml/persistence.ts`

**Interfaces:**
- Consumes: clipboard and UI-state core from Task 5.
- Produces: range/additive selection, command enablement, persisted non-semantic explorer state.

- [ ] **Step 1: Write failing command tests**

```tsx
it('copies only top-level selected ownership roots and duplicates with new IDs', () => {
  selectWithCtrl(['parent', 'child']);
  copy();
  pasteInto('target');
  expect(createdRoots()).toHaveLength(1);
  expect(createdRootId()).not.toBe('parent');
});

it('persists favorites and expansion without changing model revision', () => {
  favorite('block-1');
  expand('block-1');
  saveAndReload();
  expect(isFavorite('block-1')).toBe(true);
  expect(modelRevision()).toBe(originalRevision);
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run src/components/modelExplorer/ModelExplorer.commands.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement complete selection and clipboard behavior**

Shift selects visible ranges; Ctrl/Cmd toggles; incompatible mixed-domain command sets are disabled. Cut marks payload intent but does not mutate until paste succeeds. Duplicate pastes beside the original owner with a deterministic unique name. Standard shortcuts must not fire while text inputs are editing.

- [ ] **Step 4: Persist explorer UI state separately**

Store `{ expandedSemanticIds, favorites, recentSemanticIds, activeView, followSelection }` in project UI metadata. Remove IDs missing after load. Never increment semantic revision for UI-state changes.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/components/modelExplorer/ModelExplorer.commands.test.tsx src/engine/sysml/persistence.test.ts && npx tsc --noEmit`

```bash
git add src/components/modelExplorer src/features/modelExplorer src/engine/sysml/persistence.ts
git commit -m "feat(model-explorer): complete professional tree commands"
```

---

### Task 12: Add end-to-end authoring and performance gates

**Files:**
- Create: `tests/e2e/model-explorer-state-machine.spec.ts`
- Create: `tests/e2e/model-explorer-sysml.spec.ts`
- Create: `tests/e2e/model-explorer-performance.spec.ts`
- Modify: `src/engine/sysml/largeModelGenerator.ts`
- Create: `docs/guides/model-explorer.md`

**Interfaces:**
- Consumes: completed explorer UI and existing Playwright configuration.
- Produces: release-level functional and performance evidence.

- [ ] **Step 1: Write the State Machine E2E scenario**

The test must create a State Machine Region, composite State, child Region, nested States, initial node, history node, and transitions from tree menus; rename and move a State; confirm transition impact; undo/redo; save/reload; and verify generated semantic hierarchy remains valid.

Run: `npx playwright test tests/e2e/model-explorer-state-machine.spec.ts`

Expected before implementation completion: FAIL at the first missing explorer action.

- [ ] **Step 2: Write the SysML E2E scenario**

The test must create a Package, Blocks, typed Part, ports, Requirement, satisfy relation, BDD and IBD presentations; prove tree creation does not auto-present; drag the same Part ID to the IBD; move a Block between Packages; distinguish presentation deletion from semantic deletion; undo/redo; and save/reload.

Run: `npx playwright test tests/e2e/model-explorer-sysml.spec.ts`

Expected before implementation completion: FAIL at the first missing explorer action.

- [ ] **Step 3: Add deterministic performance gates**

Generate 1,000 and 10,000 model elements. Measure projection, initial visible render, search, expand, rename, and move with `performance.now()`. Enforce these CI budgets on the existing test host:

- 10,000-element projection: under 300 ms.
- Initial virtualized render: under 500 ms.
- Search result projection: under 300 ms after debounce.
- Incremental rename update: under 100 ms.
- Reparent preflight and commit: each under 300 ms.
- Rendered tree rows: fewer than 100 at a 900 px viewport.

Run: `npx playwright test tests/e2e/model-explorer-performance.spec.ts`

Expected: PASS without timeout or renderer freeze.

- [ ] **Step 4: Write the user guide**

Document views, create element, create relationship, model-versus-presentation deletion, drag/reparent, drag-to-diagram, keyboard shortcuts, impact dialogs, favorites, search, and troubleshooting diagnostics. Include no unsupported capability.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
npx vitest run src/features/modelExplorer src/components/modelExplorer
npm run test:sysml:release
npx vitest run src/utils/stateMachine/smStatePruner.test.ts src/utils/stateMachine/smModelMigration.test.ts src/utils/stateMachine/smSemanticBuilder.test.ts
npx playwright test tests/e2e/model-explorer-state-machine.spec.ts tests/e2e/model-explorer-sysml.spec.ts tests/e2e/model-explorer-performance.spec.ts
npm run test:freeze-gate
npm run build
```

Expected: every command exits 0; no TypeScript errors; no renderer freeze; the production Electron build succeeds.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/model-explorer-*.spec.ts src/engine/sysml/largeModelGenerator.ts docs/guides/model-explorer.md
git commit -m "test(model-explorer): certify authoring and large-model behavior"
```

---

## Final review checklist

- [ ] Compare every design acceptance criterion with at least one unit, integration, or E2E assertion above.
- [ ] Confirm tree creation never inserts an element into `diagramPresentations`.
- [ ] Confirm add-to-diagram never inserts a second semantic entity.
- [ ] Confirm State Machine and SysML moves are rejected before mutation when ownership is invalid.
- [ ] Confirm impact confirmation hashes are revision-sensitive.
- [ ] Confirm every successful mutation is one undo entry and every failed mutation is zero entries.
- [ ] Confirm presentation deletion and semantic deletion remain distinct.
- [ ] Confirm 10,000-element interaction budgets pass on the supported Windows test host.
- [ ] Confirm existing uncommitted user work was not overwritten or staged accidentally.
