# Unified Model Explorer Pillars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one Cameo-style project hierarchy with Structural, Behavior, Parametric, and Requirements pillars, and make Diagram view show the active diagram's real semantic context.

**Architecture:** Add a pure project-level projection above the existing SysML and State Machine adapters. The projection combines canonical domain snapshots into navigation-only virtual pillars while preserving semantic IDs and owners; commands are routed by each node's domain, not by the active editor. Active-diagram membership is passed explicitly to the explorer and filters the unified projection without changing semantic ownership.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Playwright, normalized SysML repository, existing State Machine snapshots and command adapters.

## Global Constraints

- Preserve unrelated modified and untracked files already present in the working tree.
- Follow red-green-refactor: every production behavior starts with a failing focused test.
- The first-level order is exactly Structural, Behavior, Parametric, Requirements.
- Pillars are virtual navigation nodes and must never be serialized as SysML packages.
- Canonical semantic IDs and owner references remain unchanged by projection.
- Standalone XBridge/VLab models appear under Parametric; State-owned models appear only beneath their owning State under Behavior.
- Use application semantic palette tokens; add no hard-coded colors.
- Do not duplicate semantic elements between pillars or diagram views.

## File structure

- Create `src/features/modelExplorer/unifiedModelExplorerProjection.ts`: pure classification and combined projection.
- Create `src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`: pillar, ownership, ordering, and fallback tests.
- Create `src/features/modelExplorer/modelExplorerDiagramContext.ts`: active diagram descriptor and context filtering.
- Create `src/features/modelExplorer/modelExplorerDiagramContext.test.ts`: context ancestor/filter tests.
- Modify `src/features/modelExplorer/modelExplorerTypes.ts`: project domains, virtual-node metadata, active diagram descriptor.
- Modify `src/features/modelExplorer/modelExplorerProjection.ts`: preserve explicit sibling order and expose ancestor expansion.
- Modify `src/components/modelExplorer/ModelExplorer.tsx`: controlled context data, no-context behavior, reveal-in-containment.
- Modify `src/components/modelExplorer/ModelExplorerToolbar.tsx`: functional/disabled Diagram tab and active diagram name.
- Modify `src/components/modelExplorer/AppModelExplorer.tsx`: combined snapshots, adapter registry, domain command routing.
- Modify `src/types/sm_types.ts`: canonical owned embedded-model metadata and persisted diagram collection.
- Modify `src/App.tsx`: pass all project domains, persist diagrams/ownership, open tree diagrams, route canvas drops.
- Modify existing component/unit tests and create `tests/e2e/model-explorer-unified-hierarchy.spec.ts`.

---

### Task 1: Extend explorer types for a unified project tree

**Files:**
- Modify: `src/features/modelExplorer/modelExplorerTypes.ts`
- Test: `src/features/modelExplorer/modelExplorerProjection.test.ts`

**Interfaces:**
- Produces: `ExplorerDomain = 'project' | 'stateMachine' | 'sysml' | 'xbridges' | 'vlab'`
- Produces: `ModelPillar`, `ActiveDiagramContext`, and optional `virtualKind`/`ownerSemanticId` node metadata.
- Consumes: existing `ModelTreeNode` and `ModelTreeProjection` contracts.

- [ ] **Step 1: Write the failing type/behavior test**

Add a compile-time fixture and runtime ordering assertion:

```ts
const pillar: ModelTreeNode = {
  nodeId: 'project:pillar:behavior',
  semanticId: 'project:pillar:behavior',
  domain: 'project',
  kind: 'pillar',
  virtualKind: 'behavior',
  label: 'Behavior',
  parentNodeId: 'project:model',
  ownerSemanticId: 'project:model',
  childNodeIds: [],
  hasChildren: false,
  readOnly: true,
};
expect(pillar.virtualKind).toBe('behavior');
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/features/modelExplorer/modelExplorerProjection.test.ts`

Expected: TypeScript/Vitest fails because `project`, `virtualKind`, and `ownerSemanticId` are not defined.

- [ ] **Step 3: Add the minimal contracts**

```ts
export type ExplorerDomain = 'project' | 'stateMachine' | 'sysml' | 'xbridges' | 'vlab';
export type ModelPillar = 'structural' | 'behavior' | 'parametric' | 'requirements';

export interface ActiveDiagramContext {
  diagramId: string;
  name: string;
  kind: string;
  domain: Exclude<ExplorerDomain, 'project'>;
  presentedSemanticIds: string[];
  contextSemanticIds?: string[];
}
```

Add to `ModelTreeNode`:

```ts
virtualKind?: 'model' | ModelPillar | 'group' | 'unresolved' | 'unclassified';
ownerSemanticId?: string | null;
diagramId?: string;
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/features/modelExplorer/modelExplorerProjection.test.ts && npx tsc --noEmit`

Expected: PASS with no diagnostics.

- [ ] **Step 5: Commit**

```bash
git add src/features/modelExplorer/modelExplorerTypes.ts src/features/modelExplorer/modelExplorerProjection.test.ts
git commit -m "feat(model-explorer): define unified project tree contracts"
```

### Task 2: Build the four-pillar unified projection

**Files:**
- Create: `src/features/modelExplorer/unifiedModelExplorerProjection.ts`
- Create: `src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`
- Modify: `src/features/modelExplorer/index.ts`
- Modify: `src/features/modelExplorer/modelExplorerProjection.ts`

**Interfaces:**
- Consumes: `StateMachineExplorerSnapshot`, `SysmlRepository`, standalone XBridge/VLab descriptors.
- Produces: `UnifiedExplorerInput` and `buildUnifiedModelProjection(input): ModelTreeProjection`.

- [ ] **Step 1: Write failing pillar and classification tests**

Use a fixture containing a Block, Requirement, State, standalone XBridge/VLab models, and one State-owned XBridge model. Assert:

```ts
const projection = buildUnifiedModelProjection(fixture);
expect(projection.nodes['project:model'].childNodeIds).toEqual([
  'project:pillar:structural',
  'project:pillar:behavior',
  'project:pillar:parametric',
  'project:pillar:requirements',
]);
expect(projection.nodes['project:pillar:structural'].childNodeIds).toContain('sysml:element:block-1');
expect(projection.nodes['project:pillar:behavior'].childNodeIds).toContain('sm:machine:main');
expect(projection.nodes['project:pillar:parametric'].childNodeIds).toContain('xbridges:model:global-xb');
expect(projection.nodes['sm:state:run'].childNodeIds).toContain('xbridges:model:state-xb');
expect(projection.nodes['project:pillar:parametric'].childNodeIds).not.toContain('xbridges:model:state-xb');
expect(projection.nodes['project:pillar:requirements'].childNodeIds).toContain('sysml:element:req-1');
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx vitest run src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`

Expected: FAIL because the projection module does not exist.

- [ ] **Step 3: Implement deterministic virtual roots and pure classification**

Define input descriptors explicitly:

```ts
export interface ExternalModelDescriptor {
  id: string;
  name: string;
  domain: 'xbridges' | 'vlab';
  ownerStateId?: string | null;
  diagramId: string;
}

export interface UnifiedExplorerInput {
  sysml: SysmlRepository;
  stateMachine: StateMachineExplorerSnapshot;
  externalModels: ExternalModelDescriptor[];
  revision: number;
}
```

Implement helpers `createVirtualScaffold`, `attachNode`, `classifySysmlElement`, `projectStateMachine`, and `projectExternalModels`. Attach owned XBridge/VLab nodes to `sm:state:${ownerStateId}` when that State exists; otherwise place them in `project:unresolved:parametric` with a warning badge.

- [ ] **Step 4: Preserve explicit child order**

Update `flattenVisibleTree` so nodes with `virtualKind === 'model'` retain `childNodeIds` order; continue collator sorting for ordinary semantic siblings:

```ts
const childIds = node.virtualKind === 'model'
  ? [...node.childNodeIds]
  : [...node.childNodeIds].sort(compareNodeLabels);
childIds.forEach(childId => visit(childId, depth + 1));
```

- [ ] **Step 5: Run focused tests and existing adapter tests**

Run: `npx vitest run src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/modelExplorerProjection.test.ts src/features/modelExplorer/adapters`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/modelExplorer/unifiedModelExplorerProjection.ts src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/modelExplorerProjection.ts src/features/modelExplorer/index.ts
git commit -m "feat(model-explorer): project unified architecture pillars"
```

### Task 3: Implement real active-diagram context filtering

**Files:**
- Create: `src/features/modelExplorer/modelExplorerDiagramContext.ts`
- Create: `src/features/modelExplorer/modelExplorerDiagramContext.test.ts`
- Modify: `src/features/modelExplorer/modelExplorerProjection.ts`

**Interfaces:**
- Consumes: `ModelTreeProjection` and `ActiveDiagramContext`.
- Produces: `projectDiagramContext(projection, context): ModelTreeProjection` and `getAncestorNodeIds(projection, semanticId): string[]`.

- [ ] **Step 1: Write the failing context test**

```ts
const filtered = projectDiagramContext(projection, {
  diagramId: 'bdd-main',
  name: 'Main BDD',
  kind: 'bdd',
  domain: 'sysml',
  presentedSemanticIds: ['block-1'],
});
expect(Object.values(filtered.nodes).map(node => node.semanticId)).toEqual(
  expect.arrayContaining(['project:model', 'project:pillar:structural', 'block-1'])
);
expect(Object.values(filtered.nodes).map(node => node.semanticId)).not.toContain('req-1');
```

Also test a State Machine context retains its owner path and a context with no matches returns the scaffold plus no semantic elements.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run src/features/modelExplorer/modelExplorerDiagramContext.test.ts`

Expected: FAIL because `projectDiagramContext` is missing.

- [ ] **Step 3: Implement semantic-ID matching and ancestor closure**

Build a semantic-ID-to-node-ID index, include `presentedSemanticIds` plus `contextSemanticIds`, walk `parentNodeId` to root, clone only included nodes, and prune every `childNodeIds` list to included IDs. Return roots containing only `project:model` when context exists but matches nothing.

- [ ] **Step 4: Run focused projection tests**

Run: `npx vitest run src/features/modelExplorer/modelExplorerDiagramContext.test.ts src/features/modelExplorer/modelExplorerProjection.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/modelExplorer/modelExplorerDiagramContext.ts src/features/modelExplorer/modelExplorerDiagramContext.test.ts src/features/modelExplorer/modelExplorerProjection.ts
git commit -m "feat(model-explorer): filter hierarchy by active diagram context"
```

### Task 4: Make the Diagram toolbar state functional and accessible

**Files:**
- Modify: `src/components/modelExplorer/ModelExplorer.tsx`
- Modify: `src/components/modelExplorer/ModelExplorerToolbar.tsx`
- Modify: `src/components/modelExplorer/ModelExplorerToolbar.test.tsx`
- Modify: `src/components/modelExplorer/ModelExplorer.test.tsx`

**Interfaces:**
- Consumes: `activeDiagramContext?: ActiveDiagramContext`.
- Produces: `onRevealInContainment?: (semanticId: string) => void` and controlled context projection behavior.

- [ ] **Step 1: Write failing interaction tests**

Render with unrelated Structural and Requirements nodes plus a Structural active context. Click Diagram and assert the Requirement disappears while Model, Structural, and the Block remain. Render without context and assert Diagram is disabled with `aria-disabled="true"` and title `No active diagram`.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run src/components/modelExplorer/ModelExplorerToolbar.test.tsx src/components/modelExplorer/ModelExplorer.test.tsx`

Expected: FAIL because Diagram receives no context and is always enabled.

- [ ] **Step 3: Wire context into visible projection**

Replace `activeDiagramNodeIds` with `activeDiagramContext`. In `visibleRows`, call `projectDiagramContext` before search/favorites when `viewMode === 'diagramContext'`. Do not fall back to containment when context has zero elements.

- [ ] **Step 4: Add disabled and empty-context UI**

Add `diagramAvailable={Boolean(activeDiagramContext)}` to the toolbar. Disable the button when false. For an active context with no matching rows, display `No model elements are presented in ${activeDiagramContext.name}` and a button that returns to Containment.

- [ ] **Step 5: Verify component tests**

Run: `npx vitest run src/components/modelExplorer`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/modelExplorer/ModelExplorer.tsx src/components/modelExplorer/ModelExplorerToolbar.tsx src/components/modelExplorer/ModelExplorerToolbar.test.tsx src/components/modelExplorer/ModelExplorer.test.tsx
git commit -m "fix(model-explorer): make diagram context control functional"
```

### Task 5: Route unified-node capabilities and commands by domain

**Files:**
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.test.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`
- Create: `src/features/modelExplorer/unifiedModelExplorerCapabilities.ts`
- Create: `src/features/modelExplorer/unifiedModelExplorerCapabilities.test.ts`

**Interfaces:**
- Consumes: unified projection nodes, existing SysML/State Machine adapters.
- Produces: `adapterForNode(node)`, `capabilitiesForUnifiedNode(node, selection)`, and pillar creation intents.

- [ ] **Step 1: Write failing combined-tree tests**

Render `AppModelExplorer` with both a Block and a State while `diagramMode="bdd"`; assert Structural, Behavior, Parametric, Requirements, the Block, and the State are all present. Assert a State capability resolves to State Machine adapter commands even while BDD is active.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run src/components/modelExplorer/AppModelExplorer.test.tsx src/features/modelExplorer/unifiedModelExplorerCapabilities.test.ts`

Expected: FAIL because `AppModelExplorer` currently selects one adapter from `diagramMode`.

- [ ] **Step 3: Replace active-adapter projection with unified projection**

Build both adapters unconditionally, create `UnifiedExplorerInput`, and memoize `buildUnifiedModelProjection`. Resolve adapter from `node.domain`; virtual pillar capabilities are returned by `capabilitiesForUnifiedNode` and mapped to explicit owner/domain commands.

- [ ] **Step 4: Reject incompatible mixed-domain mutations**

For selected nodes spanning different mutation domains, keep selection but return disabled Rename/Move/Delete/Duplicate capabilities with reason `Select elements from one modeling domain to modify them together.` Copy and reveal remain enabled where safe.

- [ ] **Step 5: Fix ownership-aware clipboard traversal while touching dispatch**

Replace both `() => []` descendant callbacks with traversal over unified `childNodeIds`, excluding virtual nodes and retaining only descendants in the copied root's semantic ownership forest.

- [ ] **Step 6: Run component and feature suites**

Run: `npx vitest run src/components/modelExplorer src/features/modelExplorer`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/modelExplorer/AppModelExplorer.tsx src/components/modelExplorer/AppModelExplorer.test.tsx src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/features/modelExplorer/unifiedModelExplorerCapabilities.ts src/features/modelExplorer/unifiedModelExplorerCapabilities.test.ts
git commit -m "feat(model-explorer): route unified hierarchy actions by domain"
```

### Task 6: Persist State Machine diagrams and XBridge/VLab ownership

**Files:**
- Modify: `src/types/sm_types.ts`
- Modify: `src/App.tsx`
- Modify: `src/utils/adiaProjectPersistence.test.ts`
- Modify: `src/utils/stateMachine/smModelMigration.test.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.commands.test.tsx`

**Interfaces:**
- Produces: `ExternalModelOwnership { modelId, domain, name, ownerStateId, diagramId }` in project state.
- Consumes: `StateMachineDiagramData[]` in snapshot commits and project serialization.

- [ ] **Step 1: Write failing round-trip tests**

Create project data with one `StateMachineDiagramData`, one standalone XBridge model, and one State-owned XBridge model. Serialize/load and assert identical diagram IDs and `ownerStateId` values. Add a commit-handler test proving `snapshot.diagrams` is retained.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run src/utils/adiaProjectPersistence.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx`

Expected: FAIL because `handleCommitStateMachineSnapshot` drops diagrams and standalone/owned external model metadata has no canonical collection.

- [ ] **Step 3: Add canonical ownership metadata and diagram state**

```ts
export interface ExternalModelOwnership {
  modelId: string;
  domain: 'xbridges' | 'vlab';
  name: string;
  ownerStateId: string | null;
  diagramId: string;
}
```

Add App state for `stateMachineDiagrams` and `externalModelOwnership`. Update `handleCommitStateMachineSnapshot` to store `snapshot.diagrams`. Include both collections in project save/export/import with defaults for legacy projects. Migrate existing `StateData.isXBridges` entries to owned descriptors without deleting legacy data.

- [ ] **Step 4: Verify round-trip and migration tests**

Run: `npx vitest run src/components/modelExplorer/AppModelExplorer.commands.test.tsx src/utils/adiaProjectPersistence.test.ts src/utils/stateMachine/smModelMigration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/sm_types.ts src/App.tsx src/components/modelExplorer/AppModelExplorer.commands.test.tsx src/utils/adiaProjectPersistence.test.ts src/utils/stateMachine/smModelMigration.test.ts
git commit -m "fix(model-explorer): persist diagrams and external model ownership"
```

### Task 7: Integrate the unified explorer across every workspace

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/modelExplorer/modelExplorerDragDrop.test.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.test.tsx`

**Interfaces:**
- Consumes: `ActiveDiagramContext`, `stateMachineDiagrams`, `externalModelOwnership`, diagram presentation maps.
- Produces: correct diagram opening and domain-aware canvas-drop routing.

- [ ] **Step 1: Write failing integration tests**

Assert the hierarchy is mounted for `xbridges` and `vlab` modes, not hidden by the current `!['xbridges', 'vlab', ...].includes(diagramMode)` condition. Assert active BDD/IBD/Requirements/State Machine contexts contain real presented IDs. Assert a State Machine drag payload does not invoke the SysML gateway.

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run src/components/modelExplorer/AppModelExplorer.test.tsx src/features/modelExplorer/modelExplorerDragDrop.test.ts`

Expected: FAIL because the sidebar is hidden and drops are unconditionally routed to SysML.

- [ ] **Step 3: Keep the Hierarchy visible in modeling workspaces**

Remove XBridge/VLab from the hierarchy hide condition while preserving existing mobile/collapse behavior. Pass all canonical project inputs to `AppModelExplorer`, including both diagram presentation maps and external ownership descriptors.

- [ ] **Step 4: Derive the active diagram descriptor**

Memoize a descriptor by active mode:

```ts
const activeDiagramContext: ActiveDiagramContext | undefined = activeDiagramId
  ? {
      diagramId: activeDiagramId,
      name: activeFile?.name ?? activeDiagramId,
      kind: diagramMode,
      domain: diagramMode === 'statemachine' ? 'stateMachine'
        : diagramMode === 'xbridges' ? 'xbridges'
        : diagramMode === 'vlab' ? 'vlab'
        : 'sysml',
      presentedSemanticIds: getPresentedIds(activeDiagramId, diagramMode),
      contextSemanticIds: getDiagramContextOwnerIds(activeDiagramId, diagramMode),
    }
  : undefined;
```

- [ ] **Step 5: Open diagram nodes and route canvas drops**

On diagram-node activation, select the associated workspace file and set its diagram mode. Branch canvas drops by `payload.domain`: SysML uses `handleExecuteSysmlCommand`; State Machine invokes its presentation handler; XBridge/VLab switch/open their owned model and place only supported elements. Reject unsupported cross-domain drops with an application diagnostic.

- [ ] **Step 6: Run type-check and focused tests**

Run: `npx tsc --noEmit && npx vitest run src/components/modelExplorer src/features/modelExplorer`

Expected: PASS with no diagnostics.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/features/modelExplorer/modelExplorerDragDrop.test.ts src/components/modelExplorer/AppModelExplorer.test.tsx
git commit -m "feat(model-explorer): integrate unified hierarchy across workspaces"
```

### Task 8: Verify theme, end-to-end behavior, and release claims

**Files:**
- Create: `tests/e2e/model-explorer-unified-hierarchy.spec.ts`
- Modify: `tests/e2e/model-explorer-theme.spec.ts`
- Modify: `tests/e2e/model-explorer-undo-persistence.spec.ts`
- Modify: `src/components/modelExplorer/modelExplorerTheme.test.tsx`
- Modify: `docs/model-explorer-release-report.md`

**Interfaces:**
- Consumes: completed unified hierarchy.
- Produces: browser-level acceptance evidence and accurate release status.

- [ ] **Step 1: Write the failing end-to-end scenario**

Create or load a deterministic fixture, then assert:

```ts
await expect(tree.getByText('Structural')).toBeVisible();
await expect(tree.getByText('Behavior')).toBeVisible();
await expect(tree.getByText('Parametric')).toBeVisible();
await expect(tree.getByText('Requirements')).toBeVisible();
await expect(tree.getByText('Main State Machine')).toBeVisible();
await expect(tree.getByText('Plant XBridge')).toBeVisible();
await tree.getByRole('tab', { name: 'Diagram' }).click();
await expect(tree.getByText('Unrelated Requirement')).toHaveCount(0);
```

Reload and assert the State-owned XBridge remains beneath its State while the standalone VLab remains beneath Parametric.

- [ ] **Step 2: Run and confirm RED**

Run: `npx playwright test tests/e2e/model-explorer-unified-hierarchy.spec.ts`

Expected: FAIL before the new fixture/workflow is fully wired.

- [ ] **Step 3: Expand theme contracts**

Assert tree root, toolbar tabs, pillar rows, selected rows, context menu, dialogs, badges, hover, and focus resolve through application CSS variables in dark and light themes. Add source checks forbidding raw hex/rgb/rgba values in `src/components/modelExplorer` except documented SVG `currentColor` usage.

- [ ] **Step 4: Correct persistence and release evidence**

Change the persistence E2E test to assert created semantic names and stable IDs after reload. Update the release report to list actual commands and results; remove `GO`, `full Cameo parity`, and performance/persistence claims unless directly proven by the final runs.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
npx tsc --noEmit
npx vitest run src/features/modelExplorer src/components/modelExplorer src/services/sysmlCommandGateway.test.ts src/engine/sysml/persistence.test.ts src/utils/stateMachine/smModelMigration.test.ts
npm run lint:theme
npx playwright test tests/e2e/model-explorer-unified-hierarchy.spec.ts tests/e2e/model-explorer-statemachine.spec.ts tests/e2e/model-explorer-sysml.spec.ts tests/e2e/model-explorer-undo-persistence.spec.ts tests/e2e/model-explorer-theme.spec.ts
```

Expected: all commands exit 0; no skipped acceptance assertions; no console errors attributable to Model Explorer.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/model-explorer-unified-hierarchy.spec.ts tests/e2e/model-explorer-theme.spec.ts tests/e2e/model-explorer-undo-persistence.spec.ts src/components/modelExplorer/modelExplorerTheme.test.tsx docs/model-explorer-release-report.md
git commit -m "test(model-explorer): verify unified hierarchy release behavior"
```

## Final review checkpoint

- Confirm all ten acceptance criteria in `docs/superpowers/specs/2026-09-24-unified-model-explorer-pillars-design.md` have a passing automated assertion.
- Inspect `git diff fd3e600..HEAD` for accidental edits outside the Model Explorer, ownership persistence, App integration, tests, and documentation scope.
- Confirm existing user modifications in `BlockPropertiesEditor`, SysML property rules, and State Machine utility files were preserved unless a task explicitly required a non-overlapping change.
- Perform a manual browser pass: switch BDD -> State Machine -> XBridge -> VLab -> Requirements while confirming the four pillars remain stable and Diagram context changes visibly.
