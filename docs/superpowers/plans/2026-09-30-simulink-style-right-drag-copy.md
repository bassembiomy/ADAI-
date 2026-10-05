# Simulink-Style Right-Drag Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make right-click drag create independent, persisted copies across ADIA canvases while preserving context-click behavior.

**Architecture:** A pure gesture controller classifies a right-button pointer sequence as either a context click or copy drag. Domain commands create new semantic elements and presentations atomically; canvases only submit commands and render their results.

**Tech Stack:** React, TypeScript, Vitest, Playwright, canonical SysML command gateway, React Flow.

## Global Constraints

- A copied item has a fresh ID and unique name; it is never a second presentation of the source.
- A six-pixel Euclidean movement threshold differentiates a context click from a copy drag.
- Each copy is validated, persisted, undoable, and visible in its tree and active diagram.
- Recreate a connection only when both endpoints are copied.
- Unsupported source types return a diagnostic and perform no mutation.

---

## File Structure

- Create `src/services/rightDragCopyGesture.ts` and `src/services/rightDragCopyGesture.test.ts` for pointer classification.
- Create `src/services/sysmlCloneCommands.ts` and `src/services/sysmlCloneCommands.test.ts` for typed SysML clone planning.
- Modify `src/services/sysmlCommandGateway.ts` to execute clone transactions atomically.
- Modify `src/App.tsx` for State Machine, BDD, IBD, Requirements, and Package Diagram bindings.
- Modify `src/components/xbridges/XbridgesWorkspace.tsx` and `src/components/vlab/VLabWorkspace.tsx` to replace eager UI copy behavior.
- Create `tests/e2e/right-drag-copy.spec.ts` and extend `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts`.

### Task 1: Gesture Controller

**Files:**
- Create: `src/services/rightDragCopyGesture.ts`
- Test: `src/services/rightDragCopyGesture.test.ts`

**Interfaces:** Produces `beginRightDragCopy`, `moveRightDragCopy`, `endRightDragCopy`, and `cancelRightDragCopy` consumed by all canvas tasks.

- [ ] **Step 1: Write failing tests**

```ts
it('keeps a right click below six pixels as a context gesture', () => {
  const state = beginRightDragCopy({ sourceIds: ['motor'], clientX: 10, clientY: 10 });
  expect(endRightDragCopy(moveRightDragCopy(state, { clientX: 13, clientY: 14 }))).toEqual({ kind: 'contextMenu' });
});
it('converts a right drag into a copy request', () => {
  const state = beginRightDragCopy({ sourceIds: ['motor'], clientX: 10, clientY: 10 });
  expect(endRightDragCopy(moveRightDragCopy(state, { clientX: 20, clientY: 10 }))).toMatchObject({ kind: 'copy', sourceIds: ['motor'] });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run src/services/rightDragCopyGesture.test.ts`

Expected: FAIL because the gesture module does not exist.

- [ ] **Step 3: Implement the controller**

```ts
export const RIGHT_DRAG_COPY_THRESHOLD_PX = 6;
export type RightDragCopyState = { sourceIds: string[]; startClientX: number; startClientY: number; clientX: number; clientY: number; phase: 'pending' | 'dragging' };
export function beginRightDragCopy(input: { sourceIds: string[]; clientX: number; clientY: number }): RightDragCopyState;
export function moveRightDragCopy(state: RightDragCopyState, point: { clientX: number; clientY: number }): RightDragCopyState;
export function endRightDragCopy(state: RightDragCopyState): { kind: 'contextMenu' } | ({ kind: 'copy' } & Pick<RightDragCopyState, 'sourceIds' | 'clientX' | 'clientY'>);
```

`moveRightDragCopy` uses Euclidean distance; `endRightDragCopy` returns `contextMenu` only for the pending state.

- [ ] **Step 4: Verify controller tests pass**

Run: `npx vitest run src/services/rightDragCopyGesture.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/services/rightDragCopyGesture.ts src/services/rightDragCopyGesture.test.ts; git commit -m "feat: add shared right-drag copy gesture"`

### Task 2: Canonical SysML Clone Transaction

**Files:**
- Create: `src/services/sysmlCloneCommands.ts`
- Test: `src/services/sysmlCloneCommands.test.ts`
- Modify: `src/services/sysmlCommandGateway.ts`

**Interfaces:** Consumes Task 1 completion and produces `buildSysmlCloneElementsCommand(input): SysmlEditorCommand` for Task 3.

- [ ] **Step 1: Write failing repository tests**

```ts
it('clones a Block with fresh identity and an independent presentation', () => {
  const result = executeSysmlCommand(state, buildSysmlCloneElementsCommand({ sourceIds: ['motor'], diagramId: 'bdd-a', drop: { x: 400, y: 220 }, idFactory: () => 'motor-copy' }));
  expect(result.repository.definitions['motor-copy']).toMatchObject({ kind: 'block', name: 'Motor_1' });
  expect(result.diagramPresentations['bdd-a'].elementIds).toContain('motor-copy');
});
it('recreates only relationships whose two endpoints were copied', () => { /* copy A+B association but not A-to-external satisfy */ });
```

- [ ] **Step 2: Verify tests fail**

Run: `npx vitest run src/services/sysmlCloneCommands.test.ts`

Expected: FAIL because the clone builder does not exist.

- [ ] **Step 3: Implement semantic clone planning and execution**

```ts
export type SysmlCloneElementsInput = { sourceIds: string[]; diagramId: string; drop: { x: number; y: number }; repository: SysmlRepository; idFactory?: () => string };
export function buildSysmlCloneElementsCommand(input: SysmlCloneElementsInput): SysmlEditorCommand;
```

Add `cloneElementsToDiagram` to `SysmlEditorCommand`. Before mutation, resolve all source IDs and validate source type, owner, and target diagram context. Create new IDs and collision-free names; copy only legal metaclass properties; remap only relationships with two copied endpoints; add exact-ID diagram presentations offset to the drop point. Run the existing gateway validation and patch history so the full clone is atomic and undoable.

- [ ] **Step 4: Verify repository behavior**

Run: `npx vitest run src/services/sysmlCloneCommands.test.ts src/services/sysmlCommandGateway.test.ts`

Expected: PASS, including independent rename, undo/redo, and serialized reload assertions.

- [ ] **Step 5: Commit**

Run: `git add src/services/sysmlCloneCommands.ts src/services/sysmlCloneCommands.test.ts src/services/sysmlCommandGateway.ts; git commit -m "feat(sysml): clone semantic elements through gateway"`

### Task 3: SysML Canvas Binding

**Files:**
- Modify: `src/App.tsx:11145-11775`
- Modify: `src/App.tsx:15323-16465`
- Modify: `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts`
- Create: `tests/e2e/right-drag-copy.spec.ts`

**Interfaces:** Consumes Tasks 1–2. Produces repository-backed copy behavior for State Machine, BDD, IBD, Requirements, and Package Diagram.

- [ ] **Step 1: Write failing browser tests**

```ts
test('right-dragging a BDD Block creates an independent persisted Block', async ({ page }) => {
  // Create Motor; right-drag 200px; assert two tree Blocks and two BDD presentations.
  // Rename the copy; reload; assert the source remains Motor.
});
test('a simple BDD right click opens its context menu without cloning', async ({ page }) => {
  // Assert menu visibility and unchanged repository Block count.
});
```

- [ ] **Step 2: Verify browser tests fail**

Run: `npx playwright test tests/e2e/right-drag-copy.spec.ts --project=chromium`

Expected: FAIL because the SysML canvas has no clone command path.

- [ ] **Step 3: Bind the controller to SysML nodes**

On right-button down, capture selected IDs. On move, change only gesture state. On right-button up after drag, convert screen coordinates using existing `uiZoom` and `view`, build a clone command, and apply its canonical result only if committed. Pending release follows the existing context-menu route. Reset on Escape, leave, invalid drop, and unmount. Use `activeSysmlDiagramId` for BDD/Requirements/Package, `currentLayerId` for IBD, and the State Machine adapter for state clones.

- [ ] **Step 4: Verify SysML browser behavior**

Run: `npx playwright test tests/e2e/sysml-bdd-package-navigation-parity.spec.ts tests/e2e/right-drag-copy.spec.ts --project=chromium`

Expected: PASS for context click and copy behavior in all five SysML canvases.

- [ ] **Step 5: Commit**

Run: `git add src/App.tsx tests/e2e/sysml-bdd-package-navigation-parity.spec.ts tests/e2e/right-drag-copy.spec.ts; git commit -m "feat(sysml): copy canvas elements with right drag"`

### Task 4: X-Bridges and V-Lab Binding

**Files:**
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx:1590-1645`
- Modify: `src/components/vlab/VLabWorkspace.tsx:1262-1310`
- Modify: `tests/e2e/right-drag-copy.spec.ts`

**Interfaces:** Consumes Task 1; uses each module’s normal node, edge, history, and persistence APIs.

- [ ] **Step 1: Extend failing module tests**

```ts
test('X-Bridges and V-Lab right-drag copy without external edges', async ({ page }) => {
  // Right-drag one selected node in each module; assert new ID and persistence.
  // Assert an edge from the source to an unselected node was not recreated.
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npx playwright test tests/e2e/right-drag-copy.spec.ts --project=chromium`

Expected: FAIL because current modules clone eagerly on right mouse down.

- [ ] **Step 3: Replace eager local copy state**

Remove the current immediate `rightClickDrag` clone creation in both workspaces. Create cloned React Flow nodes only on completed shared copy drag, assign fresh node and data IDs, save one pre-transaction history snapshot, and persist once. When multiple nodes copy, map and recreate only edges whose source and target both map to a clone. Keep non-drag right click available for module context behavior.

- [ ] **Step 4: Verify module tests pass**

Run: `npx playwright test tests/e2e/right-drag-copy.spec.ts --project=chromium`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/components/xbridges/XbridgesWorkspace.tsx src/components/vlab/VLabWorkspace.tsx tests/e2e/right-drag-copy.spec.ts; git commit -m "feat: unify right-drag copy in simulation canvases"`

### Task 5: Full Verification

**Files:** No production changes expected.

- [ ] **Step 1: Run semantic tests**

Run: `npx vitest run src/services/rightDragCopyGesture.test.ts src/services/sysmlCloneCommands.test.ts src/services/sysmlCommandGateway.test.ts`

Expected: PASS.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit --pretty false`

Expected: exit code 0.

- [ ] **Step 3: Run browser regressions**

Run: `npx playwright test tests/e2e/sysml-bdd-package-navigation-parity.spec.ts tests/e2e/right-drag-copy.spec.ts --project=chromium`

Expected: PASS.

- [ ] **Step 4: Check final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intended source/test files.
