# SysML Presentation Decoupling and State Requirement Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix diagram presentation scoping and canvas dragging so elements in the repository do not leak onto uninitialized diagrams and can be freely moved, while enabling full UI and Backend requirement traceability assignment for State Machine states.

**Architecture:**
- **Backend & Presentation Store:**
  - Enforce strict diagram presentation scoping in `normalizedStore.ts` and `sysmlCommandGateway.ts`: when `diagramId` is specified, only elements explicitly registered in `diagramPresentations[diagramId].elementIds` are projected into the view.
  - Automatically initialize default diagram presentations (`bdd`, `requirements`) with empty sets, preventing repository-wide element leakage.
  - Extend `sysmlConnectionUi.ts` and `connectionPolicy.ts` so `StateData` is recognized as a valid `ConnectionEndpoint` (family: `'state'`), enabling `«satisfy»`, `«trace»`, and `«verify»` relationships between States and Requirements.
- **Frontend & UI Interaction:**
  - Decouple mouse-drag positioning on the canvas from full synchronous repository validation: track element movements locally during active drag, and dispatch `updatePresentation` to the command gateway on mouse up/drop.
  - Implement full drag-and-drop and context-menu placement from the Model Explorer tree to any canvas, supporting independent coordinates per diagram.
  - Add a dedicated **Requirements Traceability** section in the State Inspector (`selectedState` in `App.tsx`), allowing engineers to view, link (`«satisfy»` / `«trace»`), and unlink requirements directly from state properties.

**Tech Stack:** React 18, TypeScript, Vitest, Playwright, SVG Canvas, OMG SysML 1.6 Presentation Metamodel.

## Global Constraints
- One canonical SysML repository remains the sole semantic authority for all definitions, requirements, and relationships.
- Diagrams store presentations only (coordinates, references, geometry); no duplicate semantic state.
- No direct semantic writes in React handlers; all mutations flow through `sysmlCommandGateway`.
- State Machine MISRA-C code generation remains 100% deterministic and isolated from SysML presentation changes.
- All architecture guardrails (`npm run test:sysml:architecture`) and release gates (`npm run test:sysml:release-gate`) must pass with 0 errors.

---

### Task 1: Strict Diagram Presentation Scoping in Normalized Store & Gateway

**Files:**
- Modify: `src/engine/sysml/normalizedStore.ts:670-680`
- Modify: `src/services/sysmlCommandGateway.ts:330-340, 1968-1985`
- Test: `src/engine/sysml/normalizedStore.test.ts`
- Test: `src/services/sysmlCommandGateway.test.ts`

**Interfaces:**
- `projectNormalizedDiagram(store: NormalizedSysmlStore, diagramId?: string): LegacySysmlView`: When `diagramId` is provided, elements not in `store.diagramPresentations.get(diagramId).elementIds` are omitted from the view (empty set when diagram has no presentations registered yet).
- `projectLegacyDiagram(repository, coordinates, diagramPresentations, diagramId?: string): LegacySysmlView`: Mirrors normalized store behavior for strict scoping.
- `addToDiagram` gateway command: Ensures valid bounds and coordinates are stored in both `diagramPresentations[diagramId].presentations[elementId].bounds` and `store.coordinates`.

- [ ] **Step 1: Write the failing unit tests for diagram scoping and repository creation isolation**

Add test in `src/engine/sysml/normalizedStore.test.ts`:
```ts
it('does not leak repository elements into a diagram when diagram has no presentation entries', () => {
  const repo = createEmptyRepository();
  const block = createBlock({ id: 'blk-isolated', name: 'IsolatedBlock', ownerId: 'model' });
  repo.definitions[block.id] = block;
  const store = fromRepository(repo);

  // When diagramId is specified, unpresented repository elements must NOT be visible
  const bddView = projectNormalizedDiagram(store, 'bdd');
  expect(bddView.blocks.map(b => b.id)).not.toContain('blk-isolated');

  // When diagramId is omitted, full repository view is returned
  const fullView = projectNormalizedDiagram(store);
  expect(fullView.blocks.map(b => b.id)).toContain('blk-isolated');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/sysml/normalizedStore.test.ts`
Expected: FAIL (presenting `blk-isolated` in `bddView` because `visibleFilter` was `null`).

- [ ] **Step 3: Update `normalizedStore.ts` and `sysmlCommandGateway.ts`**

In `src/engine/sysml/normalizedStore.ts`:
```ts
  const visibleFilter = diagramId
    ? new Set(store.diagramPresentations.get(diagramId)?.elementIds ?? [])
    : null;
```

In `src/services/sysmlCommandGateway.ts`:
```ts
  const visibleFilter = diagramId
    ? new Set(diagramPresentations[diagramId]?.elementIds ?? [])
    : null;
```

And in `addToDiagram` handler in `src/services/sysmlCommandGateway.ts`:
Ensure `store.coordinates` and `coordinates` dictionary receive bounds so elements don't fall back to `(0, 0)`:
```ts
    const newRecords = Object.fromEntries(addedIds.map(semanticElementId => {
      const b = { ...(command.coordinates?.[semanticElementId] ?? coordinates[semanticElementId] ?? { x: 100, y: 100, width: 160, height: 100 }) };
      coordinates[semanticElementId] = b;
      store.coordinates.set(semanticElementId, b);
      return [semanticElementId, {
        id: stableDiagramPresentationId(command.diagramId, semanticElementId),
        diagramId: command.diagramId,
        semanticElementId,
        bounds: b,
      }];
    }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/sysml/normalizedStore.test.ts src/services/sysmlCommandGateway.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/sysml/normalizedStore.ts src/services/sysmlCommandGateway.ts src/engine/sysml/normalizedStore.test.ts src/services/sysmlCommandGateway.test.ts
git commit -m "fix(sysml): enforce strict diagram presentation scoping and initial bounds"
```

---

### Task 2: Smooth Canvas Movement and Drag Decoupling

**Files:**
- Modify: `src/App.tsx:10660-10725, 10730-10750`
- Test: `tests/e2e/sysml-repository-presentation.spec.ts`

**Interfaces:**
- Canvas dragging: Updates block/element coordinates in local React view state during active mouse dragging (`handleMouseMove`), updating `dragOffset`.
- On mouse release (`handleMouseUp`): Dispatches a single `updatePresentation` command to `sysmlCommandGateway` to commit the final position to repository presentations and history without locking or stuttering.

- [ ] **Step 1: Write an automated test asserting smooth canvas dragging persistence**

In `src/engine/sysml/repositoryPresentationReleaseGate.test.ts`:
Verify that updating presentation bounds via gateway commits coordinates cleanly to the active diagram and preserves independent positions across diagrams.

- [ ] **Step 2: Run test to verify current state**

Run: `npx vitest run src/engine/sysml/repositoryPresentationReleaseGate.test.ts`
Expected: PASS.

- [ ] **Step 3: Update `App.tsx` canvas mouse handlers**

In `src/App.tsx`:
1. In `updateBlock`: When `hasGeometric && !hasSemantic` during an active drag, update local `blocks` state directly so 60fps dragging is lag-free and doesn't trigger full repository recalculation on every pixel.
2. In `handleMouseUp`: If `isDragging` was true and selected block positions were modified, commit the final `{ x, y, width, height }` via `handleExecuteSysmlCommand({ type: 'updatePresentation', diagramId: activeDiagramId, elementId, presentation })`.
3. Handle drag-and-drop from Model Explorer onto canvas: In `onDrop`, dispatch `addToDiagram` with the calculated `worldPoint` coordinates and select the dropped element immediately so it can be moved.

- [ ] **Step 4: Verify with TypeScript and Vitest**

Run: `npx tsc --noEmit && npm run test:sysml:release-gate`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/engine/sysml/repositoryPresentationReleaseGate.test.ts
git commit -m "perf(canvas): decouple mousemove drag updates and commit on drop"
```

---

### Task 3: State Machine State Requirement Connection Backend & Connection Policy

**Files:**
- Modify: `src/services/sysmlConnectionUi.ts:14-25`
- Modify: `src/engine/sysml/connectionPolicy.ts:40-60`
- Test: `src/services/sysmlConnectionUi.test.ts`
- Test: `src/engine/sysml/connectionPolicy.test.ts`

**Interfaces:**
- `classifyLegacyEndpoint(item: unknown): ConnectionEndpoint`: Recognizes State Machine states with `family: 'state'` and `isState: true`.
- `evaluateSysmlConnection`: Allows `«satisfy»`, `«trace»`, `«verify»`, and `«refine»` relationships where one endpoint has `family: 'state'` and the other has `family: 'requirement'`.

- [ ] **Step 1: Write failing unit tests for State to Requirement relationship evaluation**

In `src/services/sysmlConnectionUi.test.ts`:
```ts
it('allows satisfy and trace relationships between State and Requirement endpoints', () => {
  const stateEndpoint = { id: 'state-idle', name: 'Idle', family: 'state' as const };
  const reqEndpoint = { id: 'req-safety', name: 'SafetyReq', family: 'requirement' as const };

  const satisfyForward = evaluateSysmlConnection({
    relationshipKind: 'satisfy',
    source: stateEndpoint,
    target: reqEndpoint,
    diagram: 'requirements',
  });
  expect(satisfyForward.allowed).toBe(true);

  const traceReverse = evaluateSysmlConnection({
    relationshipKind: 'trace',
    source: reqEndpoint,
    target: stateEndpoint,
    diagram: 'requirements',
  });
  expect(traceReverse.allowed).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/sysmlConnectionUi.test.ts`
Expected: FAIL because `state` family is currently rejected.

- [ ] **Step 3: Update `connectionPolicy.ts` and `sysmlConnectionUi.ts`**

In `src/engine/sysml/connectionPolicy.ts`:
1. Add `'state'` to `EndpointFamily`:
   ```ts
   export type EndpointFamily = 'block' | 'part' | 'port' | 'requirement' | 'testCase' | 'useCase' | 'state' | 'unknown';
   ```
2. Update allowed relationship mappings: allow `satisfy`, `trace`, `refine`, and `verify` between `'state'` and `'requirement'`.
3. In `src/services/sysmlConnectionUi.ts`: update `resolveUiConnectionEndpoint` to accept `states: readonly StateData[]` and resolve state items to `{ id: state.id, name: state.name, family: 'state' }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/sysmlConnectionUi.test.ts src/engine/sysml/connectionPolicy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/sysml/connectionPolicy.ts src/services/sysmlConnectionUi.ts src/services/sysmlConnectionUi.test.ts src/engine/sysml/connectionPolicy.test.ts
git commit -m "feat(sysml): support State Machine states in requirement connection policy"
```

---

### Task 4: State Machine Inspector Requirement Traceability UI

**Files:**
- Modify: `src/App.tsx:17480-17520` (within `selectedState` property inspector)
- Create/Modify: `src/components/statemachine/StateRequirementTraceability.tsx`
- Test: `src/components/statemachine/StateRequirementTraceability.test.tsx`

**Interfaces:**
- Component `StateRequirementTraceability`:
  - Props: `stateId: string`, `stateName: string`, `canonicalSysmlRepository: SysmlRepository`, `onAddRelationship: (sourceId, targetId, type) => void`, `onRemoveRelationship: (relationshipId) => void`.
  - Displays all requirements currently linked to `stateId` via `«satisfy»` or `«trace»`.
  - Dropdown selector to choose from existing repository requirements and relationship type (`«satisfy»` / `«trace»`).
  - Button `+ Link Requirement` that dispatches gateway command `createRelationship`.
  - Unlink button (✕) that removes the relationship from `canonicalSysmlRepository.relationships`.

- [ ] **Step 1: Write component unit test for `StateRequirementTraceability`**

Test:
1. Renders linked requirements with badge (`«satisfy» REQ-001 Motor Control`).
2. Calls `onAddRelationship` when user selects a requirement and clicks `Link Requirement`.
3. Calls `onRemoveRelationship` when user clicks remove icon.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/statemachine/StateRequirementTraceability.test.tsx`
Expected: FAIL (file not found).

- [ ] **Step 3: Implement `StateRequirementTraceability.tsx` and integrate into `App.tsx`**

1. Create `src/components/statemachine/StateRequirementTraceability.tsx`.
2. In `src/App.tsx`, embed `<StateRequirementTraceability />` inside the `selectedState` property panel (below Entry/During/Exit actions).
3. Connect `onAddRelationship` to `handleExecuteSysmlCommand({ type: 'createRelationship', relationship: ... })` and removal to `deleteElements([relationshipId])`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/statemachine/StateRequirementTraceability.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify full TypeScript and Release Checks**

Run: `npx tsc --noEmit && npm run test:sysml:release`
Expected: PASS with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/statemachine/StateRequirementTraceability.tsx src/components/statemachine/StateRequirementTraceability.test.tsx src/App.tsx
git commit -m "feat(ui): add requirements traceability section to State Machine Inspector"
```

---

### Task 5: End-to-End Verification of Cameo Cross-Diagram Workflow and State Traceability

**Files:**
- Create: `tests/e2e/sysml-state-requirement-cross-diagram.spec.ts`
- Modify: `task.md`

**Interfaces:**
- E2E Spec verifies:
  1. Creating a Block in the repository via Model Explorer tree does NOT appear on BDD or Requirements canvas until explicitly added.
  2. Right-click "Add to Diagram" on Requirements diagram places the Block on Requirements canvas.
  3. Dragging/moving the Block on the canvas is smooth and stays pinned where placed.
  4. User switches to BDD diagram: Block is not on BDD diagram until explicitly added or dragged.
  5. User switches to State Machine: selects a State, assigns a Requirement in the State Inspector (`«satisfy»`), and verifies the relationship is persisted and visible in the Traceability Matrix and Report.

- [ ] **Step 1: Add the new E2E specification**

Create `tests/e2e/sysml-state-requirement-cross-diagram.spec.ts`.

- [ ] **Step 2: Run Playwright test**

Run: `npx playwright test tests/e2e/sysml-state-requirement-cross-diagram.spec.ts --reporter=line`
Expected: PASS.

- [ ] **Step 3: Run all release and architecture gates**

Run:
1. `npm run test:sysml:architecture`
2. `npm run test:sysml:release-gate`
3. `npm run verify:repository-codegen-isolation`
4. `npx tsc --noEmit`
Expected: Every check exits 0 cleanly.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/sysml-state-requirement-cross-diagram.spec.ts task.md
git commit -m "test(sysml): verify cross-diagram presentation isolation and state traceability"
```

---

## Final Verification Checklist
- [ ] Confirm creating an element in the repository does not leak onto uninitialized diagrams.
- [ ] Confirm moving elements on canvas is smooth and positions persist across tab switches.
- [ ] Confirm one Block can be presented independently on both Requirements and BDD diagrams.
- [ ] Confirm State Machine states can be linked to Requirements with `«satisfy»` and `«trace»` in both UI and backend.
- [ ] Confirm State Machine MISRA-C code generation remains 100% compliant and unaffected.
