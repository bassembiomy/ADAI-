# Workspace Tab/Canvas Parity and Canvas Drilldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the selected upper workspace tab always renders the matching canvas, including after tab closing, and make double-clicking navigable canvas symbols open or activate their exact diagram tab.

**Architecture:** Keep the canonical diagram repository and existing exact-ID opener. Add a single activation path in `src/App.tsx` that all workspace-tab clicks, close fallbacks, and canvas drilldowns use; derive the next tab from the ordered unified strip and update canvas state through that path. Extend the existing canvas double-click handlers to resolve an owned/referenced diagram before calling the exact-ID opener, while preserving current property/selection behavior for non-navigable elements.

**Tech Stack:** React + TypeScript, Vite, Vitest, Playwright.

## Global Constraints

- Exactly one visible workspace tab may have `aria-selected="true"`.
- Unknown or stale diagram IDs must not mutate workspace or canvas state.
- Existing unrelated working-tree changes must remain untouched.
- Do not create duplicate tabs for an already-open exact diagram.

---

### Task 1: Add pure workspace activation/close regression coverage

**Files:**
- Modify: `src/services/sysmlDiagramWorkspace.test.ts`
- Test: `tests/e2e/workspace-tab-highlight-parity.spec.ts`

**Interfaces:**
- Consumes: existing `normalizeDiagramWorkspace`, `openDiagramWorkspaceTab`, and the unified `[data-testid="diagram-workspace-tabs"]` UI.
- Produces: failing tests that describe nearest-neighbor close behavior, final-tab canvas parity, and exact one-tab selection.

- [ ] **Step 1: Add a unit test for nearest-neighbor selection.**

Add a test fixture with ordered tabs `[state-machine, requirements, bdd]`, remove the middle tab, and assert the next tab at the closed index (`bdd`) is selected; remove the final indexed tab and assert the preceding tab is selected. Keep this test pure by asserting the helper/state transition result rather than rendering React.

- [ ] **Step 2: Extend the existing Playwright parity test with close-to-final assertions.**

After opening Requirements and returning to State Machine, close every non-State-Machine tab through the visible close buttons. Assert exactly one `[role="tab"][aria-selected="true"]` remains, that it is `[data-workspace-type="statemachine"]`, and that `page.getByText(/^States:/)` is visible. Also add an active-middle-tab close case and assert the neighbor's tab and canvas marker agree.

- [ ] **Step 3: Run the focused tests and verify they fail for the current implementation.**

Run:

```powershell
npx vitest run src/services/sysmlDiagramWorkspace.test.ts
npx playwright test tests/e2e/workspace-tab-highlight-parity.spec.ts --project=chromium
```

Expected: the new close/canvas assertions fail because `closeDiagramWorkspaceTab` updates `diagramWorkspace` and invokes `openExactDiagramById` through a stale state path, while module/file and diagram active signals remain separate.

- [ ] **Step 4: Commit the failing tests.**

```powershell
git add src/services/sysmlDiagramWorkspace.test.ts tests/e2e/workspace-tab-highlight-parity.spec.ts
git commit -m "test: cover workspace close canvas parity"
```

### Task 2: Centralize workspace activation and fix close behavior

**Files:**
- Modify: `src/App.tsx:6334-6405, 6745-6767, 6980-7030, 7059-7081`
- Modify: `src/services/sysmlDiagramWorkspace.ts` only if Task 1 requires a reusable pure close helper

**Interfaces:**
- Consumes: `openExactDiagramById`, `switchActiveFile`, `diagramWorkspace`, `moduleWorkspaceFiles`, and the `activeWorkspaceTab` derivation.
- Produces: one typed activation callback used by upper-tab clicks and close fallbacks; active tab and canvas state updated together.

- [ ] **Step 1: Add a typed workspace target helper beside the existing tab state.**

Use the existing `DiagramWorkspaceTab` and `WorkspaceFile` types. The helper must accept either `{ kind: 'diagram'; tab: DiagramWorkspaceTab }` or `{ kind: 'file'; fileId: string }`, call `openExactDiagramById` for exact diagrams, call `switchActiveFile` for module files, and return without mutation when the target no longer exists.

- [ ] **Step 2: Route diagram-tab clicks through the helper.**

Replace the tab-strip callback at the `onClick` for `diagramWorkspace.tabs` with the helper. Preserve `preserveReturnStack: true` for user navigation and keep the existing exact-ID validation.

- [ ] **Step 3: Rewrite `closeDiagramWorkspaceTab` to select the nearest surviving tab before mutating active state.**

Compute the removed tab index from the current ordered `diagramWorkspace.tabs`; choose `remaining[index] ?? remaining[index - 1] ?? null`; update the tabs list once; then activate the chosen neighbor through the centralized helper. If no tab remains, activate/recreate the required default State Machine file and ensure its canvas is rendered. Do not call the opener with `remaining[0]` unconditionally.

- [ ] **Step 4: Ensure module-file activation clears diagram active state before loading file state.**

Keep the existing `setDiagramWorkspace(previous => ... activeTab: null)` behavior in `switchActiveFile`, but make it part of the centralized activation callback so a file tab click cannot leave a stale exact diagram selected.

- [ ] **Step 5: Run the focused tests and verify they pass.**

Run the Vitest and Playwright commands from Task 1. Expected: all existing highlight tests and the new close-to-final assertions pass, with exactly one selected tab and the matching `States:`/diagram marker visible.

- [ ] **Step 6: Commit the activation fix.**

```powershell
git add src/App.tsx src/services/sysmlDiagramWorkspace.ts src/services/sysmlDiagramWorkspace.test.ts tests/e2e/workspace-tab-highlight-parity.spec.ts
git commit -m "fix: keep workspace tab and canvas state synchronized"
```

### Task 3: Add canvas double-click diagram drilldown

**Files:**
- Modify: `src/App.tsx:15976-16000` and any other canvas symbol renderers that already expose `onDoubleClick`
- Modify: `src/features/modelExplorer/diagramTreeContext.ts` only if the existing ownership resolver cannot provide a unique target
- Test: `tests/e2e/workspace-tab-highlight-parity.spec.ts`

**Interfaces:**
- Consumes: the clicked semantic element ID, canonical repository definitions/diagrams, and the centralized workspace activation helper from Task 2.
- Produces: a `handleCanvasElementDoubleClick(elementId)` path that opens/activates one exact diagram or leaves the current view unchanged for non-navigable elements.

- [ ] **Step 1: Add failing Playwright coverage for drilldown and tab reuse.**

Create or use a visible canvas symbol with a known owned diagram (the existing BDD/block fixture is preferred). Double-click it and assert the destination `[data-diagram-id]` tab is selected and its canvas marker is visible. Double-click it again and assert the tab count for that exact ID remains one. Add a symbol without an associated diagram and assert the selected tab key does not change.

- [ ] **Step 2: Implement deterministic diagram resolution in `App.tsx`.**

Resolve in this order: explicit element diagram reference, unique owned diagram in `canonicalSysmlRepository.diagrams`, then no target. If more than one candidate exists without a designated target, return no target. Never synthesize an unknown ID.

- [ ] **Step 3: Call the resolver from existing canvas double-click handlers.**

Preserve existing requirement/block entry behavior where it is the current semantic action. For an element that resolves to an exact diagram, call the centralized activation helper with `preserveReturnStack: true`; for an element with no target, keep selection/properties behavior and do not mutate workspace tabs.

- [ ] **Step 4: Run the drilldown test.**

Run:

```powershell
npx playwright test tests/e2e/workspace-tab-highlight-parity.spec.ts --project=chromium
```

Expected: destination opens once, is highlighted, its canvas is rendered, and non-navigable symbols do not change the active view.

- [ ] **Step 5: Commit the drilldown behavior.**

```powershell
git add src/App.tsx src/features/modelExplorer/diagramTreeContext.ts tests/e2e/workspace-tab-highlight-parity.spec.ts
git commit -m "feat: open associated diagrams from canvas symbols"
```

### Task 4: Full verification and review

**Files:**
- Test: `tests/e2e/workspace-tab-navigation.spec.ts`
- Test: `tests/e2e/workspace-tab-highlight-parity.spec.ts`
- Test: `src/services/sysmlDiagramWorkspace.test.ts`

**Interfaces:**
- Consumes: all implementation from Tasks 1–3.
- Produces: verified workspace navigation with no regressions.

- [ ] **Step 1: Run focused unit and component tests.**

```powershell
npx vitest run src/services/sysmlDiagramWorkspace.test.ts src/features/modelExplorer/diagramTreeContext.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run all workspace navigation E2E tests.**

```powershell
npx playwright test tests/e2e/workspace-tab-navigation.spec.ts tests/e2e/workspace-tab-highlight-parity.spec.ts --project=chromium
```

Expected: PASS with no duplicate tab or stale-canvas failures.

- [ ] **Step 3: Inspect the final diff and preserve unrelated changes.**

```powershell
git diff HEAD~3 -- src/App.tsx src/services/sysmlDiagramWorkspace.ts src/services/sysmlDiagramWorkspace.test.ts tests/e2e/workspace-tab-navigation.spec.ts tests/e2e/workspace-tab-highlight-parity.spec.ts
git status --short
```

Confirm only the planned files changed in the feature commits; leave pre-existing `task.md` and V-Lab changes untouched.

- [ ] **Step 4: Run the production build.**

```powershell
npm run build
```

Expected: successful Vite build with no TypeScript errors.
