# Model Tree Scrolling and Diagram Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Model Explorer vertically scrollable and group elements beneath the BDD, state-machine, requirements, or parametric diagram in which they are presented without changing semantic ownership.

**Architecture:** Measure the real flex viewport that contains the virtual tree instead of estimating its height. Extend the unified projection with diagram-presentation membership and state-machine region context, while retaining each node's semantic owner. Route create-from-diagram through a small context resolver that first creates under the legal semantic owner and then adds the new element to the initiating diagram.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Playwright, existing SysML command gateway and Model Explorer adapters.

## Global Constraints

- Diagrams are visual containers and never semantic owners.
- A semantic element appears once in the primary containment projection.
- Preserve existing undo/redo, persistence, selection, and canvas rendering behavior.
- Ignore stale presentation IDs that do not resolve to semantic elements.
- Keep virtualization enabled.
- Apply grouping consistently to BDD, state-machine, requirements, and parametric diagrams.

---

## File Structure

- `src/components/modelExplorer/ModelExplorer.tsx`: measure and pass the actual tree viewport height.
- `src/components/modelExplorer/VirtualTree.tsx`: own vertical overflow and clamp stale scroll offsets after row-count changes.
- `src/components/modelExplorer/VirtualTree.test.tsx`: scrolling and virtual-window regression coverage.
- `src/features/modelExplorer/diagramTreeContext.ts`: pure helpers for resolving legal semantic owners and visual diagram membership.
- `src/features/modelExplorer/diagramTreeContext.test.ts`: focused owner-resolution tests for all four diagram families.
- `src/features/modelExplorer/unifiedModelExplorerProjection.ts`: apply visual diagram parents while preserving `ownerSemanticId`.
- `src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`: BDD, requirements, parametric, state-machine, and stale-reference projection tests.
- `src/components/modelExplorer/AppModelExplorer.tsx`: orchestrate create then present for diagram context-menu creation.
- `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`: interaction-level create-from-diagram tests.
- `tests/e2e/model-explorer-diagram-grouping.spec.ts`: rendered scrolling and hierarchy verification.

### Task 1: Real Tree Viewport and Vertical Scrolling

**Files:**
- Modify: `src/components/modelExplorer/ModelExplorer.tsx:143-170,342-373`
- Modify: `src/components/modelExplorer/VirtualTree.tsx:150-250`
- Test: `src/components/modelExplorer/VirtualTree.test.tsx`

**Interfaces:**
- Consumes: `VirtualTreeProps.height: number`, `computeVirtualTreeWindow(options): VirtualTreeWindow`.
- Produces: `clampVirtualTreeScrollTop(scrollTop: number, totalRows: number, rowHeight: number, containerHeight: number): number`.

- [ ] **Step 1: Write failing viewport and scroll-clamping tests**

Add the helper import and these tests to `VirtualTree.test.tsx`:

```tsx
import { clampVirtualTreeScrollTop } from './VirtualTree';

it('clamps scrolling to the complete virtual row range', () => {
  expect(clampVirtualTreeScrollTop(10_000, 100, 26, 260)).toBe(2340);
  expect(clampVirtualTreeScrollTop(500, 5, 26, 260)).toBe(0);
});

it('renders the virtual tree as an owned vertical scroll viewport', () => {
  const html = renderToStaticMarkup(
    <VirtualTree
      rows={sampleRows}
      height={130}
      rowHeight={26}
      focusedIndex={0}
      onFocusIndex={() => {}}
      isExpanded={() => false}
      onToggleExpand={() => {}}
      renderRow={row => <div>{row.node.label}</div>}
    />
  );
  expect(html).toContain('height:130px');
  expect(html).toContain('overflow-y:auto');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/components/modelExplorer/VirtualTree.test.tsx`

Expected: FAIL because `clampVirtualTreeScrollTop` is not exported.

- [ ] **Step 3: Implement scroll clamping and real viewport measurement**

Add to `VirtualTree.tsx`:

```ts
export function clampVirtualTreeScrollTop(
  scrollTop: number,
  totalRows: number,
  rowHeight: number,
  containerHeight: number,
): number {
  const maximum = Math.max(0, totalRows * rowHeight - containerHeight);
  return Math.min(Math.max(0, scrollTop), maximum);
}
```

In `VirtualTree`, add an effect that clamps both the DOM value and React state whenever rows, row height, or viewport height change:

```tsx
useEffect(() => {
  const element = containerRef.current;
  if (!element) return;
  const next = clampVirtualTreeScrollTop(element.scrollTop, rows.length, rowHeight, height);
  if (next !== element.scrollTop) element.scrollTop = next;
  setScrollTop(current => current === next ? current : next);
}, [rows.length, rowHeight, height]);
```

In `ModelExplorer.tsx`, move the measurement ref from the outer explorer to the `flex-1 min-h-0` tree viewport. Observe that element directly and use `clientHeight` without subtracting a toolbar estimate:

```tsx
const treeViewportRef = useRef<HTMLDivElement>(null);
const [measuredHeight, setMeasuredHeight] = useState(0);

useEffect(() => {
  if (height !== undefined) return;
  const viewport = treeViewportRef.current;
  if (!viewport) return;
  const updateHeight = () => setMeasuredHeight(viewport.clientHeight);
  updateHeight();
  const observer = new ResizeObserver(updateHeight);
  observer.observe(viewport);
  return () => observer.disconnect();
}, [height]);

const treeHeight = height ?? measuredHeight;
```

Attach `ref={treeViewportRef}` to the tree viewport wrapper and render `VirtualTree` only when `treeHeight > 0`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npx vitest run src/components/modelExplorer/VirtualTree.test.tsx src/components/modelExplorer/ModelExplorer.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modelExplorer/ModelExplorer.tsx src/components/modelExplorer/VirtualTree.tsx src/components/modelExplorer/VirtualTree.test.tsx
git commit -m "fix(model-explorer): restore vertical tree scrolling"
```

### Task 2: Diagram-Aware Visual Parent Resolution

**Files:**
- Create: `src/features/modelExplorer/diagramTreeContext.ts`
- Create: `src/features/modelExplorer/diagramTreeContext.test.ts`
- Modify: `src/features/modelExplorer/unifiedModelExplorerProjection.ts:12-20,81-304`
- Modify: `src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`

**Interfaces:**
- Consumes: `SysmlRepository`, `DiagramPresentationInput`, `StateMachineExplorerSnapshot`.
- Produces: `resolveDiagramSemanticOwner(node, repository, stateMachine): string` and `buildDiagramVisualParentIndex(input): Map<string, string>`.

- [ ] **Step 1: Write failing pure-helper tests**

Create `diagramTreeContext.test.ts` with cases that assert:

```ts
expect(resolveDiagramSemanticOwner(bddDiagramNode, repository, stateMachine)).toBe('model');
expect(resolveDiagramSemanticOwner(requirementsDiagramNode, repository, stateMachine)).toBe('model');
expect(resolveDiagramSemanticOwner(parametricDiagramNode, repository, stateMachine)).toBe('block-1');
expect(resolveDiagramSemanticOwner(smDiagramNode, repository, stateMachine)).toBe('region-1');
```

Add projection tests that construct `diagramPresentations` and assert:

```ts
expect(projection.nodes['sysml:element:block-1']).toMatchObject({
  parentNodeId: 'sysml:element:bdd-1',
  ownerSemanticId: 'model',
});
expect(projection.nodes['sysml:element:req-1'].parentNodeId)
  .toBe('sysml:element:req-diagram-1');
expect(projection.nodes['sysml:element:constraint-1'].parentNodeId)
  .toBe('sysml:element:parametric-1');
expect(projection.nodes['sm:state:s1']).toMatchObject({
  parentNodeId: 'sm:diagram:nested-sm-1',
  ownerSemanticId: 'region-1',
});
```

Add a stale ID to a diagram presentation and assert no tree node is created for it.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npx vitest run src/features/modelExplorer/diagramTreeContext.test.ts src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`

Expected: FAIL because the helper and `diagramPresentations` projection input do not exist.

- [ ] **Step 3: Implement the context helpers**

Create `diagramTreeContext.ts` with these public contracts:

```ts
export interface DiagramTreeContextInput {
  sysml: SysmlRepository;
  stateMachine: StateMachineExplorerSnapshot;
  diagramPresentations: Record<string, DiagramPresentationInput>;
}

export function resolveDiagramSemanticOwner(
  node: ModelTreeNode,
  sysml: SysmlRepository,
  stateMachine: StateMachineExplorerSnapshot,
): string {
  if (node.domain === 'stateMachine') {
    return stateMachine.diagrams?.find(diagram => diagram.id === node.semanticId)?.contextRegionId ?? 'root';
  }
  return sysml.diagrams[node.semanticId]?.ownerId ?? node.ownerSemanticId ?? 'model';
}

export function buildDiagramVisualParentIndex(input: DiagramTreeContextInput): Map<string, string> {
  const result = new Map<string, string>();
  for (const [diagramId, presentation] of Object.entries(input.diagramPresentations)) {
    if (!input.sysml.diagrams[diagramId]) continue;
    for (const semanticId of presentation.elementIds ?? []) result.set(semanticId, `sysml:element:${diagramId}`);
  }
  for (const diagram of input.stateMachine.diagrams ?? []) {
    const layer = input.stateMachine.layers.find(candidate => candidate.id === diagram.contextRegionId);
    for (const stateId of layer?.stateIds ?? []) result.set(stateId, `sm:diagram:${diagram.id}`);
    for (const junctionId of layer?.junctionIds ?? []) result.set(junctionId, `sm:diagram:${diagram.id}`);
  }
  return result;
}
```

Only index semantic IDs that exist when applying this map in projection; later diagram entries win deterministically because the tree displays one primary location.

- [ ] **Step 4: Apply the visual parent index in unified projection**

Extend `UnifiedExplorerInput`:

```ts
diagramPresentations?: Record<string, DiagramPresentationInput>;
```

Build the visual-parent index before registering semantic elements. For each SysML element and state-machine state/junction, use the indexed diagram node only if that node exists; otherwise retain the existing semantic parent. Always keep `ownerSemanticId` equal to the real owner. Classify `parametric` diagrams under the Parametric pillar instead of Structural.

After all nodes are registered, call `rebuildChildren(nodes)` so no element remains in both locations.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npx vitest run src/features/modelExplorer/diagramTreeContext.test.ts src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/modelExplorer/diagramTreeContext.ts src/features/modelExplorer/diagramTreeContext.test.ts src/features/modelExplorer/unifiedModelExplorerProjection.ts src/features/modelExplorer/unifiedModelExplorerProjection.test.ts
git commit -m "feat(model-explorer): group presented elements under diagrams"
```

### Task 3: Create From Diagram Using Legal Semantic Ownership

**Files:**
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx:116-181,438-499,530-583`
- Modify: `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`

**Interfaces:**
- Consumes: `resolveDiagramSemanticOwner`, existing `createElement` and `addToDiagram` commands, `ExplorerCommandResult.selectedIds`.
- Produces: `resolveCreationContext(node, repository, stateMachine): { ownerId: string; diagramId?: string }`.

- [ ] **Step 1: Write failing owner-resolution and orchestration tests**

Add a pure test for a diagram node:

```ts
expect(resolveCreationContext(diagramNode, repository, stateMachine)).toEqual({
  ownerId: 'model',
  diagramId: 'bdd-1',
});
```

Add a Testing Library test that opens a BDD diagram row's context menu, clicks `Block`, and records gateway calls. Assert the first call creates a model-owned block and the second presents its selected ID:

```ts
expect(calls[0]).toMatchObject({
  type: 'createElement',
  element: { kind: 'block', ownerId: 'model' },
});
expect(calls[1]).toMatchObject({
  type: 'addToDiagram',
  diagramId: 'bdd-1',
  elementIds: [expect.any(String)],
});
```

Repeat the context assertion for requirements and parametric diagrams. Add a state-machine test asserting creation targets `contextRegionId` and the committed snapshot puts the state in that layer.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run src/components/modelExplorer/AppModelExplorer.actions.test.tsx`

Expected: FAIL because a diagram's semantic ID is currently used as the create owner and no follow-up presentation occurs.

- [ ] **Step 3: Implement creation-context resolution**

Export this helper from `AppModelExplorer.tsx`:

```ts
export function resolveCreationContext(
  node: ModelTreeNode,
  sysml: SysmlRepository,
  stateMachine: StateMachineExplorerSnapshot,
): { ownerId: string; diagramId?: string } {
  if (node.kind !== 'diagram') return { ownerId: resolveCapabilityOwnerId(node) };
  return {
    ownerId: resolveDiagramSemanticOwner(node, sysml, stateMachine),
    diagramId: node.semanticId,
  };
}
```

Pass `diagramPresentations` into `buildUnifiedModelProjection`.

- [ ] **Step 4: Orchestrate semantic create followed by presentation**

In `handleExecuteCapability`, resolve `{ ownerId, diagramId }` before dispatching a create command. After a committed SysML creation with `selectedIds`, dispatch the existing explorer command through the same adapter so its mutable state is already refreshed:

```ts
if (creation.diagramId && result.committed && result.selectedIds?.length) {
  const presentationCommand: ModelExplorerCommand = {
    type: 'addToDiagram',
    diagramId: creation.diagramId,
    elementIds: result.selectedIds,
  };
  const presentationResult = createModelExplorerCommandBus(sysmlAdapter)
    .dispatch(presentationCommand);
  acceptResult(presentationResult, presentationCommand);
}
```

Use the adapter/gateway's refreshed state rather than reconstructing stale state between the two commands. Do not issue the presentation command if creation fails. State-machine creation only needs legal region ownership because its diagram membership is derived from `contextRegionId`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/modelExplorer/AppModelExplorer.tsx src/components/modelExplorer/AppModelExplorer.actions.test.tsx
git commit -m "fix(model-explorer): create diagram items under legal owners"
```

### Task 4: Undo, Persistence, and End-to-End Regression Coverage

**Files:**
- Modify: `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`
- Create: `tests/e2e/model-explorer-diagram-grouping.spec.ts`

**Interfaces:**
- Consumes: existing SysML command gateway undo/redo and persisted `diagramPresentations`.
- Produces: release-level evidence for scrolling and all diagram grouping paths.

- [ ] **Step 1: Write undo/redo and persistence regression tests**

Create an element, add it to `bdd-1`, execute undo, then redo through the command gateway. Assert:

```ts
expect(afterCreate.diagramPresentations['bdd-1'].elementIds).toContain(createdId);
expect(afterUndo.diagramPresentations['bdd-1']?.elementIds ?? []).not.toContain(createdId);
expect(afterRedo.diagramPresentations['bdd-1'].elementIds).toContain(createdId);
```

Serialize the gateway state through the existing project persistence path, reload it, build the unified projection, and assert the reloaded node's `parentNodeId` is `sysml:element:bdd-1`.

- [ ] **Step 2: Run the integration tests**

Run: `npx vitest run src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/utils/adiaProjectPersistence.test.ts`

Expected: PASS because Task 3 now uses the existing gateway presentation history and persistence state instead of separate UI-only state.

- [ ] **Step 3: Add browser-level workflow coverage**

Create `model-explorer-diagram-grouping.spec.ts` using existing project setup helpers and stable `data-node-id` selectors. The test must:

```ts
await expect(page.locator('[role="tree"]')).toHaveCSS('overflow-y', 'auto');
await page.locator('[role="tree"]').hover();
await page.mouse.wheel(0, 900);
expect(await page.locator('[role="tree"]').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
```

For BDD, requirements, parametric, and state-machine diagrams, right-click the diagram row, create the legal element, expand the diagram, and assert the created row is a descendant tree item whose `aria-level` is greater than the diagram's level.

- [ ] **Step 4: Run all focused and type checks**

Run:

```bash
npx vitest run src/components/modelExplorer/VirtualTree.test.tsx src/components/modelExplorer/ModelExplorer.test.tsx src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/features/modelExplorer/diagramTreeContext.test.ts src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts
npx tsc --noEmit
npx playwright test tests/e2e/model-explorer-diagram-grouping.spec.ts
```

Expected: all commands exit 0 with no test failures or TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/modelExplorer/AppModelExplorer.actions.test.tsx tests/e2e/model-explorer-diagram-grouping.spec.ts
git commit -m "test(model-explorer): cover diagram grouping lifecycle"
```

### Task 5: Final Regression Verification

**Files:**
- No production changes expected.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: verified implementation ready for review.

- [ ] **Step 1: Run Model Explorer and SysML regression suites**

Run:

```bash
npx vitest run src/components/modelExplorer src/features/modelExplorer --no-file-parallelism
npm run test:sysml
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 2: Run relevant existing end-to-end tests**

Run:

```bash
npx playwright test tests/e2e/model-explorer-sysml.spec.ts tests/e2e/model-explorer-statemachine.spec.ts tests/e2e/model-explorer-diagram-grouping.spec.ts
```

Expected: all tests pass in Chromium.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff HEAD~4 --check && git status --short`

Expected: no whitespace errors; only task-related files are modified or untracked.
