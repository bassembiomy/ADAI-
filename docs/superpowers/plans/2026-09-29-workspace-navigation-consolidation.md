# Workspace Navigation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the lower workspace tab bar the only visible workspace navigator and make existing V-Lab and X-Bridges tabs activate reliably.

**Architecture:** Keep workspace file ID as the navigation source of truth. Refactor `switchActiveFile` so it performs state transitions outside a React state-updater callback, then expose stable tab semantics for browser verification. Remove only the duplicate header switcher; programmatic mode navigation remains available to model-explorer, export, and back-navigation flows.

**Tech Stack:** React 18, TypeScript, Vitest, Playwright, Vite

## Global Constraints

- Preserve the lower workspace tab bar, its active/close/open controls, and its current visual design.
- Do not create or duplicate a workspace file when an existing V-Lab or X-Bridges tab is selected.
- Keep programmatic navigation used by model-explorer and export workflows.
- An unknown file ID must leave the active workspace unchanged.
- Selecting the active tab must not reload or reset its model state.

---

## File structure

- Modify `src/App.tsx`: make workspace activation deterministic, add tab accessibility/test semantics, and remove the duplicate header switcher.
- Create `tests/e2e/workspace-tab-navigation.spec.ts`: verify visible single-bar navigation and real V-Lab/X-Bridges activation.

### Task 1: Make workspace-file activation authoritative

**Files:**
- Modify: `src/App.tsx:4564-4628`
- Modify: `src/App.tsx:6916-6934`
- Test: `tests/e2e/workspace-tab-navigation.spec.ts`

**Interfaces:**
- Consumes: `WorkspaceFile`, `workspaceFiles`, `activeFileId`, `saveCurrentFileState(filesList, activeId)`, and `loadStateForFile(file)`.
- Produces: `switchActiveFile(newFileId: string): void`; stable tab attributes `role="tab"`, `aria-selected`, and `data-workspace-type`.

- [ ] **Step 1: Write failing browser tests for lower-tab activation**

Create `tests/e2e/workspace-tab-navigation.spec.ts` with:

```ts
import { test, expect } from '@playwright/test';

async function openModeler(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) {
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  }
}

test.describe('workspace tab navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openModeler(page);
  });

  test('opens existing X-Bridges and V-Lab files from the lower tab bar', async ({ page }) => {
    const tabs = page.locator('.workspace-tab-bar');
    const xbridges = tabs.locator('[data-workspace-type="xbridges"]');
    const vlab = tabs.locator('[data-workspace-type="vlab"]');

    await xbridges.click();
    await expect(xbridges).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('X-Bridges', { exact: true }).last()).toBeVisible();

    await vlab.click();
    await expect(vlab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: /V-LAB PHYSICS SIMULATOR/i })).toBeVisible();

    await expect(tabs.locator('[data-workspace-type="xbridges"]')).toHaveCount(1);
    await expect(tabs.locator('[data-workspace-type="vlab"]')).toHaveCount(1);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx playwright test tests/e2e/workspace-tab-navigation.spec.ts --grep "opens existing"
```

Expected: FAIL because the lower tabs do not yet expose `data-workspace-type` or `aria-selected`.

- [ ] **Step 3: Add stable semantics to each workspace tab**

In the clickable tab container in `WorkspaceTabBar`, add these attributes while preserving its classes and click handler:

```tsx
<div
  key={tabId}
  role="tab"
  aria-selected={isActive}
  data-workspace-type={file.type}
  onClick={() => onSwitchTab(tabId)}
  className={`flex items-center gap-2 px-4 h-full rounded-t-lg text-xs font-bold transition-all duration-200 cursor-pointer border-t-2 shrink-0 ${
    isActive
      ? 'workspace-tab-active ui-card bg-[var(--surface-panel)] text-[var(--text-primary)] border-t-[#f97316]'
      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] border-t-transparent'
  }`}
>
```

- [ ] **Step 4: Refactor `switchActiveFile` to avoid stateful side effects inside `setWorkspaceFiles`**

Replace the callback with this ordering:

```tsx
const switchActiveFile = useCallback((newFileId: string) => {
  if (newFileId === activeFileId) return;

  const targetExists = workspaceFiles.some(file => file.id === newFileId);
  if (!targetExists) return;

  setSelectedIds([]);
  const updatedFiles = activeFileId
    ? saveCurrentFileState(workspaceFiles, activeFileId)
    : workspaceFiles;
  const targetFile = updatedFiles.find(file => file.id === newFileId);
  if (!targetFile) return;

  setWorkspaceFiles(updatedFiles);
  loadStateForFile(targetFile);
  setDiagramModeState(targetFile.type as DiagramMode);
  setActiveFileId(newFileId);
}, [activeFileId, workspaceFiles, saveCurrentFileState, loadStateForFile]);
```

This makes unknown IDs and active-tab clicks no-ops, saves the outgoing workspace once, and loads the selected file before publishing it as active.

- [ ] **Step 5: Run the focused activation test and verify GREEN**

Run:

```powershell
npx playwright test tests/e2e/workspace-tab-navigation.spec.ts --grep "opens existing"
```

Expected: PASS; exactly one V-Lab and one X-Bridges tab remain, and each workspace becomes visible when selected.

- [ ] **Step 6: Commit activation behavior**

```powershell
git add -- src/App.tsx tests/e2e/workspace-tab-navigation.spec.ts
git commit -m "fix: make workspace tabs authoritative"
```

### Task 2: Remove the duplicate header navigator

**Files:**
- Modify: `src/App.tsx:16973-17012`
- Modify: `tests/e2e/workspace-tab-navigation.spec.ts`

**Interfaces:**
- Consumes: the `WorkspaceTabBar` rendered below the header.
- Produces: one visible workspace navigation bar; no header buttons for State Machine, SysML BDD, Requirements, SysML IBD, Package Diagram, X-Bridges, V-Lab, HIL, or ENTROPY OPM.

- [ ] **Step 1: Add a failing test for the duplicate header controls**

Append inside the existing `test.describe` block:

```ts
test('uses the lower workspace tabs as the only visible workspace navigator', async ({ page }) => {
  await expect(page.locator('.workspace-tab-bar')).toHaveCount(1);
  const header = page.getByRole('banner');
  await expect(header.getByRole('button', { name: 'State Machine', exact: true })).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'X-Bridges', exact: true })).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'V-Lab', exact: true })).toHaveCount(0);
});
```

- [ ] **Step 2: Run the single-bar test and verify RED**

Run:

```powershell
npx playwright test tests/e2e/workspace-tab-navigation.spec.ts --grep "only visible"
```

Expected: FAIL because the header still contains the duplicate diagram-mode buttons.

- [ ] **Step 3: Remove only the header diagram-mode switcher markup**

Delete the `Separator`, `DIAGRAM MODE SWITCHER` container, mapped mode buttons, and following `Separator` currently between the project identity group and simulation controls. Do not remove `setDiagramMode`, `syncTabWithMode`, `handleActivatePackageDiagram`, or `handleActivateIbdDiagram`, because non-header flows still use them.

The header sequence becomes:

```tsx
</div>

{/* SIMULATION & VALIDATION GROUP */}
<div className="flex items-center gap-1.5 ui-card bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg p-1 shrink-0">
```

- [ ] **Step 4: Run the complete focused navigation spec**

Run:

```powershell
npx playwright test tests/e2e/workspace-tab-navigation.spec.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Run relevant existing navigation coverage and type-check**

Run:

```powershell
npx playwright test tests/e2e/sysml-bdd-package-navigation-parity.spec.ts
npx tsc --noEmit
```

Expected: existing navigation tests PASS and TypeScript exits with code 0.

- [ ] **Step 6: Commit the single-bar UI**

```powershell
git add -- src/App.tsx tests/e2e/workspace-tab-navigation.spec.ts
git commit -m "refactor: remove duplicate workspace switcher"
```

### Task 3: Final regression verification

**Files:**
- Verify: `src/App.tsx`
- Verify: `tests/e2e/workspace-tab-navigation.spec.ts`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: verification evidence for the consolidated navigation behavior.

- [ ] **Step 1: Run formatting and diff checks**

Run:

```powershell
git diff --check HEAD~2..HEAD
git status --short
```

Expected: no whitespace errors; only intentional changes are present.

- [ ] **Step 2: Run the focused browser spec once more from the committed state**

Run:

```powershell
npx playwright test tests/e2e/workspace-tab-navigation.spec.ts --reporter=line
```

Expected: 2 tests PASS with no browser errors.

- [ ] **Step 3: Inspect the final diff against the approved scope**

Run:

```powershell
git diff HEAD~2..HEAD -- src/App.tsx tests/e2e/workspace-tab-navigation.spec.ts
```

Expected: the diff contains only deterministic workspace activation, tab semantics, duplicate-switcher removal, and its regression tests.
