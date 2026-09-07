# OPM Right Panel Visualization & Floating Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide enhanced glassmorphic visualization, collapsible inspector cards, and double-click floating & sizable window behavior for the OPM right panel.

**Architecture:** Encapsulate the right panel into a modular `OpmRightPanelContent` presenter with upgraded visuals (glowing status pills, collapsible cards for states/attributes/ports, refined studio tabs). Wrap it in `OpmFloatingWindow` when undocked via double-click or popout button, supporting drag-to-move, double-click maximize/restore, and corner/edge resizing handles while preserving all simulation and inspector states.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons, Vitest.

## Global Constraints
- Exact minimum bounds for floating window: 320px width, 300px height.
- Preserve all existing data-testids: `opm-dock-right`, `opm-node-name-input`, `opm-convert-node-type`, `opm-convert-edge-type`, `opm-sim-status`, `opm-sim-toggle`, `opm-sim-step`, `opm-sim-reset`, `opm-scope-tab-btn`.
- Strict type safety with `EntropyTypes.ts` and `OpmDockState.ts`.
- Non-blocking canvas interaction: `e.stopPropagation()` on floating window mouse events.

---

### Task 1: Create `OpmFloatingWindow` Component and Tests

**Files:**
- Create: `src/components/entropy/OpmFloatingWindow.tsx`
- Test: `src/components/entropy/__tests__/opmFloatingWindow.test.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface OpmFloatingWindowProps {
    title: string;
    badge?: string;
    isOpen: boolean;
    onClose: () => void;
    onDock: () => void;
    initialPosition?: { x: number; y: number };
    initialSize?: { width: number; height: number };
    minWidth?: number;
    minHeight?: number;
    children: React.ReactNode;
  }
  export const OpmFloatingWindow: React.FC<OpmFloatingWindowProps>;
  ```

- [ ] **Step 1: Write the failing test for `OpmFloatingWindow`**
Create `src/components/entropy/__tests__/opmFloatingWindow.test.tsx`:
```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OpmFloatingWindow } from '../OpmFloatingWindow';

describe('OpmFloatingWindow', () => {
  it('renders title, badge, and children when isOpen is true', () => {
    render(
      <OpmFloatingWindow
        title="Element Inspector"
        badge="OPM Studio"
        isOpen={true}
        onClose={vi.fn()}
        onDock={vi.fn()}
      >
        <div data-testid="floating-child">Panel Content</div>
      </OpmFloatingWindow>
    );

    expect(screen.getByText('Element Inspector')).toBeInTheDocument();
    expect(screen.getByText('OPM Studio')).toBeInTheDocument();
    expect(screen.getByTestId('floating-child')).toBeInTheDocument();
  });

  it('calls onDock when dock button is clicked', () => {
    const handleDock = vi.fn();
    render(
      <OpmFloatingWindow
        title="Inspector"
        isOpen={true}
        onClose={vi.fn()}
        onDock={handleDock}
      >
        <div>Content</div>
      </OpmFloatingWindow>
    );

    const dockBtn = screen.getByTitle(/dock to sidebar/i);
    fireEvent.click(dockBtn);
    expect(handleDock).toHaveBeenCalledTimes(1);
  });

  it('toggles maximize on titlebar double-click', () => {
    const { container } = render(
      <OpmFloatingWindow
        title="Inspector"
        isOpen={true}
        onClose={vi.fn()}
        onDock={vi.fn()}
      >
        <div>Content</div>
      </OpmFloatingWindow>
    );

    const titlebar = screen.getByTestId('opm-floating-titlebar');
    const windowEl = container.firstElementChild as HTMLElement;
    expect(windowEl.className).not.toContain('inset-');

    fireEvent.doubleClick(titlebar);
    expect(windowEl.className).toContain('inset-');

    fireEvent.doubleClick(titlebar);
    expect(windowEl.className).not.toContain('inset-');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/components/entropy/__tests__/opmFloatingWindow.test.tsx`
Expected: FAIL with module not found `OpmFloatingWindow`.

- [ ] **Step 3: Implement `OpmFloatingWindow.tsx`**
Create `src/components/entropy/OpmFloatingWindow.tsx` with:
- Dragging via mouse move & up window listeners with position clamping.
- Corner resize handle (`cursor-nwse-resize`) updating width and height clamped to `minWidth` (default 320) and `minHeight` (default 300).
- Maximize & minimize toggle buttons.
- Double-click titlebar to toggle maximize.
- Re-dock button (`ArrowRightFromLine` / `PanelRightClose`) invoking `onDock`.
- Stopping click/mouse event propagation to prevent canvas interference.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/components/entropy/__tests__/opmFloatingWindow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/entropy/OpmFloatingWindow.tsx src/components/entropy/__tests__/opmFloatingWindow.test.tsx
git commit -m "feat(opm): add OpmFloatingWindow component with drag, resize, and double-click maximize"
```

---

### Task 2: Create `OpmRightPanelContent` with Enhanced Visuals & Collapsible Cards

**Files:**
- Create: `src/components/entropy/OpmRightPanelContent.tsx`
- Test: `src/components/entropy/__tests__/opmRightPanelContent.test.tsx`

**Interfaces:**
- Consumes: `AppNode`, `AppEdge`, `OpmNodeKind`, `OPMLinkType`, `OPMPort` from `./EntropyTypes`.
- Produces:
  ```typescript
  export interface OpmRightPanelContentProps {
    selectedNode: AppNode | null;
    selectedEdge: AppEdge | null;
    onCloseInspector: () => void;
    onUpdateNodeProp: (key: string, value: any) => void;
    onConvertNodeType: (kind: OpmNodeKind) => void;
    onAddStateToObject: (nodeId: string, name: string) => void;
    onManualActivateState: (stateId: string, nodeId: string) => void;
    onDeleteState: (stateId: string, nodeId: string) => void;
    onAddAttribute: (key: string, value: string) => void;
    onAddPort: (name: string, dir: 'input' | 'output', pos: any, type: any) => void;
    onRemovePort: (portId: string, dir: 'input' | 'output') => void;
    onZoomInNode: (nodeId: string) => void;
    onDeleteSelectedNode: () => void;
    onConvertEdgeType: (edgeId: string, type: OPMLinkType) => void;
    rightTab: string;
    onRightTabChange: (tab: string) => void;
    simRunning: boolean;
    simTick: number;
    tickMs: number;
    onToggleSimulation: () => void;
    onRunSimTick: () => void;
    onResetSimulation: () => void;
    activeOpmConfig: any;
    onOpmConfigChange: (updater: (prev: any) => any) => void;
    scopeTabContent: React.ReactNode;
    oplTabContent: React.ReactNode;
    smartShowTabContent: React.ReactNode;
    codegenTabContent: React.ReactNode;
    isWideLayout?: boolean;
  }
  export const OpmRightPanelContent: React.FC<OpmRightPanelContentProps>;
  ```

- [ ] **Step 1: Write tests for `OpmRightPanelContent`**
Create `src/components/entropy/__tests__/opmRightPanelContent.test.tsx`:
- Verifies collapsible accordion behavior for States, Attributes, and Ports.
- Verifies active state glowing pill styling (`bg-orange-500 shadow-[0_0_8px_#f97316]`).
- Verifies tab navigation buttons and simulation controls.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `OpmRightPanelContent.tsx`**
Implement the component with:
- Glassmorphic card design.
- Collapsible cards for States, Attributes, and Ports with chevron icons (`ChevronDown`, `ChevronRight`) and count badges.
- Glowing pulse dot on active states (`bg-orange-500 shadow-[0_0_8px_#f97316]`).
- Ports color-coded direction badges (`IN` blue, `OUT` emerald).
- Dual-column adaptation when `isWideLayout={true}`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/components/entropy/__tests__/opmRightPanelContent.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/entropy/OpmRightPanelContent.tsx src/components/entropy/__tests__/opmRightPanelContent.test.tsx
git commit -m "feat(opm): add OpmRightPanelContent with glassmorphism, collapsible cards, and glowing pills"
```

---

### Task 3: Integrate Floating Right Panel into `EntropyWorkspace`

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Test: `src/components/entropy/__tests__/opmFloatingRightPanel.test.tsx`

- [ ] **Step 1: Write integration tests for floating right panel in `EntropyWorkspace`**
Create `src/components/entropy/__tests__/opmFloatingRightPanel.test.tsx`:
- Render `EntropyWorkspace`.
- Assert right dock has undock / popout button and header responds to double-click.
- Double-clicking or clicking popout undocks right panel into `OpmFloatingWindow`.
- In floating mode, clicking dock button re-docks into sidebar.
- Selected node properties and active tab remain intact throughout transition.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/components/entropy/__tests__/opmFloatingRightPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `EntropyWorkspace.tsx`**
- Import `OpmFloatingWindow` and `OpmRightPanelContent`.
- Add state: `isRightFloating`, `floatingPos`, `floatingSize`.
- In docked mode: wrap `OpmRightPanelContent` with a dock header containing double-click handler and popout button (`Maximize2` / `ExternalLink`).
- In floating mode: render `OpmFloatingWindow` over canvas with `OpmRightPanelContent`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/components/entropy/__tests__/opmFloatingRightPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/entropy/EntropyWorkspace.tsx src/components/entropy/__tests__/opmFloatingRightPanel.test.tsx
git commit -m "feat(opm): integrate double-click floating and resizable right panel in EntropyWorkspace"
```

---

### Task 4: Full Regression & Verification

**Files:**
- All modified and new files.

- [ ] **Step 1: Run complete OPM test suite**
Run: `npm run test:opm`
Expected: PASS with 100% test success across all OPM tests.

- [ ] **Step 2: Run TypeScript compile verification**
Run: `npx tsc --noEmit`
Expected: PASS with zero errors.

- [ ] **Step 3: Final Commit**
```bash
git commit --allow-empty -m "chore(opm): verify full test and type coverage for floating right panel"
```
