# HIL Workspace Scalable Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide smooth draggable resizable splitters, card maximize/restore focus mode, collapsible Target Pack header, and local persistence across all tabs of the HIL Engineering Toolchain screen.

**Architecture:** A pure React, zero-dependency `ResizableSplitPaneGroup` component managing percentage widths, min/max bounds, drag pointer capture, and double-click reset, integrated into HIL Workspace Tab 1 (Configure), Tab 2 (Build & Flash), and Tab 3 (Telemetry & Dashboard).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vitest for unit testing.

## Global Constraints
- Zero external package dependencies (no new npm installs).
- Preserve existing theme colors, font styles, and responsive layout.
- Strictly adhere to desktop security guidelines.

---

### Task 1: Create `ResizableSplitPaneGroup` Component & Unit Tests

**Files:**
- Create: `src/components/common/ResizableSplitPane.tsx`
- Test: `src/components/common/ResizableSplitPane.test.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface ResizableSplitPaneGroupProps {
    children: React.ReactNode[];
    initialSizes?: number[]; // Percentages e.g. [30, 35, 35]
    minSizes?: number[]; // Min percentage for each pane e.g. [15, 15, 20]
    storageKey?: string;
    maximizedIndex?: number | null;
    className?: string;
  }
  export const ResizableSplitPaneGroup: React.FC<ResizableSplitPaneGroupProps>;
  ```

- [ ] **Step 1: Write unit tests for `ResizableSplitPaneGroup`**
  Create `src/components/common/ResizableSplitPane.test.tsx` verifying:
  - Default proportions rendering.
  - Maximize mode rendering only the selected child.
  - Clamping when dragged past min thresholds.
  - Resetting to initial proportions.
  - Fallback handling for invalid localStorage data.

- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run src/components/common/ResizableSplitPane.test.tsx`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ResizableSplitPaneGroup`**
  Write `src/components/common/ResizableSplitPane.tsx` with:
  - Pointer capture drag tracking (`setPointerCapture`, `onPointerMove`, `onPointerUp`).
  - Gutter divider with neon orange glow on hover and active dragging.
  - Double-click reset to initial proportions.
  - Clamping to minSize thresholds.
  - Maximize index support (when not null, renders only child at that index with 100% width/height).
  - Safe localStorage load/save.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/components/common/ResizableSplitPane.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/common/ResizableSplitPane.tsx src/components/common/ResizableSplitPane.test.tsx
  git commit -m "feat(hil): add ResizableSplitPaneGroup component with unit tests"
  ```

---

### Task 2: Integrate Scalable Panels & Collapsible Header into Tab 1 (Configure)

**Files:**
- Modify: `src/components/hil/HILWorkspace.tsx`

**Interfaces:**
- Consumes: `ResizableSplitPaneGroup` from `src/components/common/ResizableSplitPane.tsx`
- Uses: `Maximize2`, `Minimize2`, `ChevronUp`, `ChevronDown` from `lucide-react`

- [ ] **Step 1: Add maximize state & header collapse state in `HILWorkspace`**
  Add state:
  ```typescript
  const [tab1Maximized, setTab1Maximized] = useState<number | null>(null);
  const [isTargetPackCollapsed, setIsTargetPackCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('adia_hil_target_pack_collapsed') === 'true';
    } catch { return false; }
  });
  ```

- [ ] **Step 2: Update Target Pack Registry to be collapsible**
  Wrap TargetPackSelector in a collapsible container with a collapse/expand toggle button. When collapsed, show compact summary banner (Target name, MCU, Clock, Mode).

- [ ] **Step 3: Replace fixed grid with `ResizableSplitPaneGroup` in Tab 1**
  Wrap `HILDriverPanel`, `HILSignalMapper`, and `HAL Live Preview` inside `<ResizableSplitPaneGroup storageKey="adia_hil_tab1_sizes" initialSizes={[30, 35, 35]} maximizedIndex={tab1Maximized}>`.
  Add Maximize/Restore buttons to the headers of `HILDriverPanel`, `HILSignalMapper`, and `HAL Live Preview`.

- [ ] **Step 4: Test Tab 1 rendering & typecheck**
  Run: `npx tsc --noEmit`
  Expected: Clean compilation with 0 errors.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/hil/HILWorkspace.tsx
  git commit -m "feat(hil): integrate resizable panels and collapsible target pack in Tab 1"
  ```

---

### Task 3: Integrate Scalable Panels into Tab 2 (Build & Flash)

**Files:**
- Modify: `src/components/hil/HILWorkspace.tsx`

**Interfaces:**
- Consumes: `ResizableSplitPaneGroup` from `src/components/common/ResizableSplitPane.tsx`

- [ ] **Step 1: Add maximize state in `HILWorkspace` for Tab 2**
  Add state:
  ```typescript
  const [tab2Maximized, setTab2Maximized] = useState<number | null>(null);
  ```

- [ ] **Step 2: Replace fixed grid with `ResizableSplitPaneGroup` in Tab 2**
  Wrap `Linker Workspace Source Code` and `Embedded Toolchain Compiler Logs` in `<ResizableSplitPaneGroup storageKey="adia_hil_tab2_sizes" initialSizes={[40, 60]} maximizedIndex={tab2Maximized}>`.
  Add Maximize/Restore button to the Source Code header and Compiler Logs header.

- [ ] **Step 3: Test Tab 2 rendering & typecheck**
  Run: `npx tsc --noEmit`
  Expected: Clean compilation with 0 errors.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/hil/HILWorkspace.tsx
  git commit -m "feat(hil): integrate resizable panels and maximize buttons in Tab 2"
  ```

---

### Task 4: Integrate Scalable Panels into Tab 3 (Telemetry Dashboard)

**Files:**
- Modify: `src/components/hil/HILDashboard.tsx`

**Interfaces:**
- Consumes: `ResizableSplitPaneGroup` from `src/components/common/ResizableSplitPane.tsx`

- [ ] **Step 1: Add maximize state in `HILDashboard`**
  Add state:
  ```typescript
  const [dashboardMaximized, setDashboardMaximized] = useState<number | null>(null);
  ```

- [ ] **Step 2: Wrap Telemetry Scope and Faults/Logs in `ResizableSplitPaneGroup`**
  Replace `grid grid-cols-12` in `HILDashboard.tsx` with `<ResizableSplitPaneGroup storageKey="adia_hil_tab3_sizes" initialSizes={[65, 35]} maximizedIndex={dashboardMaximized}>`.
  Add Maximize/Restore button in the header of `Real-Time Signal Scope` and `Fault Injection / Overrides`.

- [ ] **Step 3: Test Tab 3 rendering & typecheck**
  Run: `npx tsc --noEmit`
  Expected: Clean compilation with 0 errors.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/hil/HILDashboard.tsx
  git commit -m "feat(hil): integrate resizable panels and maximize buttons in Tab 3"
  ```

---

### Task 5: Full Regression Testing & Verification

**Files:**
- Verification only

- [ ] **Step 1: Run unit tests**
  Run: `npx vitest run src/components/common/ResizableSplitPane.test.tsx`
  Expected: PASS.

- [ ] **Step 2: Run security audit & test suite**
  Run: `npm run test:security`
  Expected: 100% security tests pass.

- [ ] **Step 3: Run TypeScript compiler check**
  Run: `npx tsc --noEmit`
  Expected: 0 errors.

- [ ] **Step 4: Commit and finalize**
  ```bash
  git add .
  git commit -m "chore(hil): verify scalable panel integration across all HIL workspace tabs"
  ```
