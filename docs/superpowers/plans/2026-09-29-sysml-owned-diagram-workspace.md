# SysML Owned Diagram Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BDD, Requirements Diagram, and State Machine Diagram nodes owned, independently openable, and persisted as exact diagram views.

**Architecture:** Keep semantic diagrams and presentations in their existing repositories. Add a pure workspace service that supplies idempotent defaults and normalizes exact-ID diagram tabs, then route explorer creation and activation through it. The React shell consumes this service so the tree, canvas, tab bar, save payload, and reload path all use the same ID.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, Playwright, existing SysML command gateway and normalized repository.

## Global Constraints

- `OMG_SYSML_1_6`: semantic model elements and ownership stay repository-first; a diagram never duplicates an element.
- `UML_FOUNDATION`: diagrams are owned views/presentations of model content.
- `CAMEO_TOOLING`: containment-tree diagram creation and opening is a usability benchmark, not an OMG compliance claim.
- `ADIA_EXTENSION`: default diagram bootstrap, workspace-tab persistence, and legacy-tab migration.
- Do not create a root IBD; IBD navigation stays owned by a Block context.
- Any rejected command must leave repository, presentation store, and workspace tabs unchanged.
- Preserve user diagrams: default migration creates only missing defaults and is idempotent.

---

## File structure

- Create `src/services/sysmlDiagramWorkspace.ts` — pure default-diagram, exact-tab, and legacy-tab migration functions.
- Create `src/services/sysmlDiagramWorkspace.test.ts` — repository and workspace-state tests for the new service.
- Modify `src/services/sysmlCommandGateway.ts` and `src/services/sysmlDiagramNavigation.ts` — atomic diagram creation and exact-ID recovery.
- Modify `src/components/modelExplorer/AppModelExplorer.tsx` and `src/features/modelExplorer/unifiedModelExplorerProjection.ts` — real-owner context commands and default tree projections.
- Modify `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.ts` — idempotent root State Machine Diagram metadata.
- Modify `src/App.tsx` and `src/utils/jsonImportValidator.ts` — exact-ID workspace tabs plus save/load migration.
- Modify focused Vitest suites and `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts` — repository, component, and browser release gates.

### Task 1: Add default-diagram and exact-tab workspace service

**Files:**
- Create: `src/services/sysmlDiagramWorkspace.ts`
- Test: `src/services/sysmlDiagramWorkspace.test.ts`

**Interfaces:**
- Consumes: `SysmlRepository`, `ModelDiagramDefinition` from `src/engine/sysml/model.ts`.
- Produces: `ensureDefaultSysmlDiagrams`, `normalizeDiagramWorkspace`, `openDiagramWorkspaceTab`, and `DiagramWorkspaceTab`.

- [ ] **Step 1: Write the failing tests**

```ts
it('creates only missing defaults and remains idempotent', () => {
  const first = ensureDefaultSysmlDiagrams(createEmptyRepository());
  expect(Object.values(first.repository.diagrams).map(d => [d.name, d.diagramKind])).toEqual(expect.arrayContaining([
    ['Main SysML BDD', 'bdd'],
    ['Main Requirements Diagram', 'requirements'],
  ]));
  expect(ensureDefaultSysmlDiagrams(first.repository).createdDiagramIds).toEqual([]);
});

it('migrates mode tabs to exact IDs and drops stale duplicates', () => {
  const repository = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  const result = normalizeDiagramWorkspace(repository, ['bdd', 'requirements', 'bdd', 'missing']);
  expect(result.tabs).toEqual([
    { kind: 'sysmlDiagram', diagramId: 'adia-default-bdd' },
    { kind: 'sysmlDiagram', diagramId: 'adia-default-requirements' },
  ]);
  expect(result.diagnostics.map(d => d.code)).toContain('STALE_DIAGRAM_TAB');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/sysmlDiagramWorkspace.test.ts`

Expected: FAIL because the workspace service does not exist.

- [ ] **Step 3: Implement the minimal pure service**

```ts
export type DiagramWorkspaceTab =
  | { kind: 'sysmlDiagram'; diagramId: string }
  | { kind: 'stateMachineDiagram'; diagramId: string; contextRegionId: string }
  | { kind: 'module'; mode: string };

const DEFAULTS = [
  { id: 'adia-default-bdd', name: 'Main SysML BDD', diagramKind: 'bdd' as const, ownerId: 'model' },
  { id: 'adia-default-requirements', name: 'Main Requirements Diagram', diagramKind: 'requirements' as const, ownerId: 'model' },
];

export function ensureDefaultSysmlDiagrams(repository: SysmlRepository) {
  const diagrams = { ...repository.diagrams };
  const createdDiagramIds: string[] = [];
  for (const spec of DEFAULTS) {
    const exists = Object.values(diagrams).some(d => d.diagramKind === spec.diagramKind && d.ownerId === spec.ownerId);
    if (!exists) {
      diagrams[spec.id] = { ...spec, kind: 'diagram', namespace: ['model'] };
      createdDiagramIds.push(spec.id);
    }
  }
  return { repository: createdDiagramIds.length ? { ...repository, diagrams } : repository, createdDiagramIds };
}

export function openDiagramWorkspaceTab(tabs: readonly DiagramWorkspaceTab[], tab: DiagramWorkspaceTab) {
  return tabs.some(existing => existing.kind === tab.kind && existing.diagramId === tab.diagramId)
    ? [...tabs]
    : [...tabs, tab];
}
```

Implement `normalizeDiagramWorkspace` to resolve legacy `bdd`, `requirements`, `package`, and `rtm` strings to real diagrams; discard invalid IDs with diagnostics; deduplicate by kind/ID; and choose a valid active tab or default BDD.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/services/sysmlDiagramWorkspace.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/sysmlDiagramWorkspace.ts src/services/sysmlDiagramWorkspace.test.ts
git commit -m "feat(sysml): add owned diagram workspace state"
```

### Task 2: Make bootstrap, creation, and recovery atomic

**Files:**
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/services/sysmlDiagramNavigation.ts`
- Modify: `src/services/sysmlDiagramNavigation.test.ts`

**Interfaces:**
- Consumes: `ensureDefaultSysmlDiagrams` from Task 1.
- Produces: no-mutation duplicate rejection and exact-ID navigation fallback.

- [ ] **Step 1: Write failing gateway and navigation tests**

```ts
it('rejects a duplicate diagram ID without changing repository or presentation state', () => {
  const before = snapshot(state);
  const result = executeSysmlCommand(state, { type: 'createDiagram', diagram: existingDiagram });
  expect(result.committed).toBe(false);
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'DUPLICATE_ELEMENT_ID' }),
  ]));
  expect(snapshot(state)).toEqual(before);
});

it('falls back to the default BDD rather than a mode-only pseudo-ID', () => {
  const repository = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  expect(recoverNavigationState({ activeDiagramId: 'bdd', diagramKind: 'bdd', returnStack: [] }, repository).activeDiagramId)
    .toBe('adia-default-bdd');
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npx vitest run src/services/sysmlCommandGateway.test.ts src/services/sysmlDiagramNavigation.test.ts`

Expected: FAIL because existing code accepts duplicate IDs and treats mode labels as diagram IDs.

- [ ] **Step 3: Implement pre-mutation creation validation**

```ts
if (state.repository.diagrams[diagram.id] || state.repository.packages[diagram.id] || state.repository.definitions[diagram.id]) {
  return reject('DUPLICATE_ELEMENT_ID', `Diagram ID '\${diagram.id}' already exists.`, diagram.id);
}
```

Place this before `nextRepo` or `nextDiagramPresentations` are built. In `recoverNavigationState`, remove `bdd`, `requirements`, `rtm`, and `package` pseudo-ID validity. Recover from valid stack entry, same-kind real diagram, default BDD, then any BDD; never alter semantic ownership.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/services/sysmlCommandGateway.test.ts src/services/sysmlDiagramNavigation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/services/sysmlCommandGateway.ts src/services/sysmlCommandGateway.test.ts src/services/sysmlDiagramNavigation.ts src/services/sysmlDiagramNavigation.test.ts
git commit -m "fix(sysml): validate owned diagram creation"
```

### Task 3: Route tree creation through real owners and project defaults

**Files:**
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`
- Modify: `src/features/modelExplorer/unifiedModelExplorerProjection.ts`
- Modify: `src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`
- Modify: `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.ts`
- Modify: `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts`

**Interfaces:**
- Consumes: exact IDs from Tasks 1–2.
- Produces: legal context-menu `createDiagram` commands and accurate tree parents.

- [ ] **Step 1: Write failing component and projection tests**

```ts
it('uses the pillar owner instead of the virtual pillar ID for a new BDD', () => {
  const structural = { ...node, kind: 'pillar', virtualKind: 'structural', semanticId: 'project:pillar:structural', ownerSemanticId: 'model' };
  expect(capabilityToAction(createDiagramCapability('bdd'), structural, {})).toMatchObject({
    kind: 'command', command: { type: 'createDiagram', ownerId: 'model', diagramKind: 'bdd' },
  });
});

it('places default diagrams under Structural, Requirements, and Behavior', () => {
  const projection = buildUnifiedModelProjection(defaultWorkspaceInput());
  expect(projection.nodes['sysml:element:adia-default-bdd'].parentNodeId).toBe('project:pillar:structural');
  expect(projection.nodes['sysml:element:adia-default-requirements'].parentNodeId).toBe('project:pillar:requirements');
  expect(projection.nodes['sm:diagram:adia-default-state-machine'].parentNodeId).toBe('project:pillar:behavior');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts`

Expected: FAIL because virtual pillar IDs are currently emitted as owners and a root state-machine diagram is not guaranteed.

- [ ] **Step 3: Implement owner mapping and state-machine default metadata**

```ts
case 'createDiagram':
  return {
    kind: 'command',
    command: {
      type: 'createDiagram',
      ownerId: resolveCapabilityOwnerId(node),
      diagramKind: capability.elementKind || 'bdd',
    },
  };
```

Add `ensureRootStateMachineDiagram(snapshot)`. It adds exactly one `{ id: 'adia-default-state-machine', name: 'Main State Machine Diagram', ownerId: 'root', contextRegionId: 'root' }` only when root owns no state-machine diagram. Project this root diagram directly below Behavior; nested state-machine diagrams remain under their Region. Preserve exact selected diagram IDs in State Machine explorer command results.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/modelExplorer/AppModelExplorer.tsx src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/features/modelExplorer/unifiedModelExplorerProjection.ts src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/adapters/stateMachineExplorerAdapter.ts src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts
git commit -m "feat(sysml): create diagrams from containment owners"
```

### Task 4: Replace mode-only App tabs with persisted exact diagram tabs

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/utils/jsonImportValidator.ts`
- Test: `src/services/sysmlDiagramWorkspace.test.ts`

**Interfaces:**
- Consumes: `DiagramWorkspaceTab`, `ensureDefaultSysmlDiagrams`, `normalizeDiagramWorkspace`, and `openDiagramWorkspaceTab`.
- Produces: `diagramWorkspace` in the unified payload and one `openExactDiagramById` callback for creation, tree double-click, and tabs.

- [ ] **Step 1: Extend the workspace test first**

```ts
it('retains BDD-A and BDD-B as different persisted tabs', () => {
  const tabs = openDiagramWorkspaceTab(
    openDiagramWorkspaceTab([], { kind: 'sysmlDiagram', diagramId: 'bdd-a' }),
    { kind: 'sysmlDiagram', diagramId: 'bdd-b' },
  );
  expect(tabs).toEqual([
    { kind: 'sysmlDiagram', diagramId: 'bdd-a' },
    { kind: 'sysmlDiagram', diagramId: 'bdd-b' },
  ]);
});
```

- [ ] **Step 2: Run tests to verify the integration gap**

Run: `npx vitest run src/services/sysmlDiagramWorkspace.test.ts`

Expected: the service test passes after Task 1; App-level behavior remains unimplemented until Task 5.

- [ ] **Step 3: Implement App integration**

```ts
const [diagramWorkspace, setDiagramWorkspace] = useState<DiagramWorkspaceState>(() => ({
  tabs: [],
  activeTab: null,
}));

const openExactDiagramById = useCallback((diagramId: string) => {
  const nav = openExactDiagram(currentNavigationState(), canonicalSysmlRepository, diagramId);
  setDiagramWorkspace(previous => ({
    tabs: openDiagramWorkspaceTab(previous.tabs, toWorkspaceTab(nav, stateMachineDiagrams)),
    activeTab: diagramId,
  }));
  applyNavigation(nav);
}, [canonicalSysmlRepository, stateMachineDiagrams]);
```

During project initialization and `applyCanonicalProjectLoad`, call `ensureDefaultSysmlDiagrams` before `fromRepository`, seed the root State Machine Diagram, and normalize `importedData.diagramWorkspace ?? importedData.openTabs`. Persist `diagramWorkspace`, active exact diagram ID, and IBD return stack in both save paths and `buildUnifiedProjectPayload`.

Replace calls in `setDiagramMode`, `handleExplorerCommand`, `handleActivatePackageDiagram`, and tree double-click with `openExactDiagramById`. After every successful `createDiagram`, open `result.selectedIds[0]`, not only package diagrams. Render each tab from its diagram's real name and add `data-diagram-id={diagramId}`. Closing a tab removes only the workspace view, not the semantic diagram.

Accept optional `diagramWorkspace` in `validateImportedJson`; leave legacy `openTabs` valid as a migration source.

- [ ] **Step 4: Run static and focused checks**

Run: `npx vitest run src/services/sysmlDiagramWorkspace.test.ts src/services/sysmlDiagramNavigation.test.ts src/components/modelExplorer/AppModelExplorer.actions.test.tsx`

Expected: PASS.

Run: `npx tsc --noEmit --pretty false --skipLibCheck`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx src/utils/jsonImportValidator.ts src/services/sysmlDiagramWorkspace.test.ts
git commit -m "feat(sysml): persist exact diagram workspace tabs"
```

### Task 5: Verify browser workflow and regression boundaries

**Files:**
- Modify: `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts`
- Test: all focused tests from Tasks 1–4.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: release-gate evidence for tree creation, exact tabs, persistence, and IBD return.

- [ ] **Step 1: Add real browser tests**

```ts
test('creates and opens exact diagrams from Structural, Requirements, and Behavior', async ({ page }) => {
  for (const [pillar, menuItem, expectedKind] of [
    ['Structural', 'Block Definition Diagram (BDD)', 'bdd'],
    ['Requirements', 'Requirements Diagram', 'requirements'],
    ['Behavior', 'State Machine Diagram', 'stateMachine'],
  ] as const) {
    const row = page.locator('.model-tree-row', { hasText: pillar }).first();
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: menuItem, exact: true }).click();
    await expect.poll(() => page.evaluate(kind => (window as any).__adiaTestHooks.getDiagramMode() === kind, expectedKind)).toBe(true);
  }
});
```

Add a second test that creates BDD-A and BDD-B through the Structural context menu, presents distinct blocks, double-clicks each tree node, saves/reloads using the existing helpers, and asserts both `[data-diagram-id]` tabs and the active exact ID survive. Also assert rejected duplicate creation adds no tree node/tab, closing BDD-A retains its repository diagram, and Root from an IBD opened from BDD-B returns to BDD-B.

- [ ] **Step 2: Run browser test to verify failure before final adjustments**

Run: `npx playwright test tests/e2e/sysml-bdd-package-navigation-parity.spec.ts --project=chromium`

Expected: FAIL until exact workspace test hooks and tab selectors are present.

- [ ] **Step 3: Add read-only test hooks only**

```ts
(window as any).__adiaTestHooks = {
  ...existingHooks,
  getDiagramWorkspace: () => diagramWorkspace,
  getActiveDiagramId: () => activeSysmlDiagramId,
  getDiagramMode: () => diagramMode,
};
```

Do not add test-only mutation APIs.

- [ ] **Step 4: Run release checks**

Run: `npx vitest run src/services/sysmlDiagramWorkspace.test.ts src/services/sysmlCommandGateway.test.ts src/services/sysmlDiagramNavigation.test.ts src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/features/modelExplorer/adapters/stateMachineExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.actions.test.tsx`

Expected: PASS.

Run: `npx playwright test tests/e2e/sysml-bdd-package-navigation-parity.spec.ts --project=chromium`

Expected: PASS.

Run: `npx tsc --noEmit --pretty false --skipLibCheck; git diff --check`

Expected: exit code 0 and no whitespace errors.

- [ ] **Step 5: Commit verification**

```powershell
git add tests/e2e/sysml-bdd-package-navigation-parity.spec.ts src/App.tsx
git commit -m "test(sysml): cover owned diagram workspace workflow"
```

## Plan self-review

- Spec coverage: defaults and idempotent migration (Tasks 1 and 4); exact creation, owner validation, and tree projection (Tasks 2 and 3); persistent tabs and exact activation (Task 4); IBD return behavior, rejected-command atomicity, and browser reload coverage (Task 5).
- Scope: BDD, Requirements, and State Machine ownership/navigation only. IBD remains a Block context; no unrelated canvas or code-generation behavior changes are introduced.
- Type consistency: App integration uses `DiagramWorkspaceTab` from Task 1; semantic diagram commands remain `ModelDiagramDefinition` operations through the existing gateway.
