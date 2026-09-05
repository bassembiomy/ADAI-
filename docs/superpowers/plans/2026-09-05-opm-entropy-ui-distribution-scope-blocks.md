# OPM Entropy UI Distribution, Simulation Scope & Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the OPM Entropy Module with a restructured Studio Ribbon command bar, a dedicated real-time Simulation Scope logic analyzer dock tab, and high-fidelity glassmorphic blocks and ports with directional indicators, with zero feature regressions.

**Architecture:** Create an isolated `OpmSimulationScope.tsx` component that samples simulation ticks to render multi-track logic waveforms via SVG. Update `OPMNodeComponents.tsx` to add directional port chevrons, expanded interactive halos, and active process energy pulses. Restructure the top bar in `EntropyWorkspace.tsx` into a Studio Ribbon with 4 distinct clusters, mounting the Scope in the dock shell.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, @xyflow/react (React Flow), Vitest, Lucide React.

## Global Constraints

- Preserve all existing `data-testid` attributes: `opm-sim-status`, `opm-sim-time`, `opm-sim-toggle`, `opm-sim-step`, `opm-sim-reset`, `opm-toolbar-tick-slider`, `opm-link-mode-select`, `opm-sim-config-tick`.
- Preserve all React Flow handle IDs, types, and positions (`Position.Left`, `Position.Right`, `Position.Top`, `Position.Bottom`).
- Zero regressions across existing 18 test suites in `src/components/entropy/__tests__`.
- All CSS styles must adhere to dark-theme glassmorphism and ISO-19450 standards.

---

### Task 1: Simulation Scope Core Component & Signal Extraction

**Files:**
- Create: `src/components/entropy/OpmSimulationScope.tsx`
- Create: `src/components/entropy/__tests__/opmSimulationScope.test.tsx`

**Interfaces:**
- Consumes: `AppNode`, `AppEdge`, `SimulationLog`, `OpmSimulationState` from `./EntropyTypes` and `./OpmSimulationEngine`.
- Produces: `OpmSimulationScope` component accepting `{ simRunning, currentTick, tickMs, nodes, edges, recentLogs, onReset }`.

- [ ] **Step 1: Write the failing tests for `OpmSimulationScope`**

Create `src/components/entropy/__tests__/opmSimulationScope.test.tsx`:
```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OpmSimulationScope } from '../OpmSimulationScope';
import { AppNode, AppEdge } from '../EntropyTypes';

describe('OpmSimulationScope', () => {
  const mockNodes: AppNode[] = [
    {
      id: 'proc-1',
      type: 'process',
      position: { x: 0, y: 0 },
      data: { id: 'proc-1', name: 'WaterBoiling', type: 'process', isFiring: true } as any,
    },
    {
      id: 'obj-1',
      type: 'object',
      position: { x: 100, y: 100 },
      data: {
        id: 'obj-1',
        name: 'Water',
        type: 'object',
        states: [
          { id: 'st-cold', name: 'Cold', isActive: false },
          { id: 'st-hot', name: 'Hot', isActive: true },
        ],
      } as any,
    },
  ];

  const mockEdges: AppEdge[] = [];

  it('renders channels for active processes and object states', () => {
    render(
      <OpmSimulationScope
        simRunning={true}
        currentTick={3}
        tickMs={200}
        nodes={mockNodes}
        edges={mockEdges}
        recentLogs={[]}
      />
    );

    expect(screen.getByText('WaterBoiling')).toBeInTheDocument();
    expect(screen.getByText('Water::Hot')).toBeInTheDocument();
    expect(screen.getByTestId('opm-scope-timeline')).toBeInTheDocument();
  });

  it('updates buffer when currentTick advances', () => {
    const { rerender } = render(
      <OpmSimulationScope
        simRunning={true}
        currentTick={1}
        tickMs={100}
        nodes={mockNodes}
        edges={mockEdges}
        recentLogs={[]}
      />
    );

    rerender(
      <OpmSimulationScope
        simRunning={true}
        currentTick={2}
        tickMs={100}
        nodes={mockNodes}
        edges={mockEdges}
        recentLogs={[]}
      />
    );

    expect(screen.getByTestId('opm-scope-tick-counter')).toHaveTextContent('Tick 2 (200ms)');
  });

  it('allows clearing scope data and toggling zoom', () => {
    const onReset = vi.fn();
    render(
      <OpmSimulationScope
        simRunning={false}
        currentTick={5}
        tickMs={100}
        nodes={mockNodes}
        edges={mockEdges}
        recentLogs={[]}
        onReset={onReset}
      />
    );

    const clearBtn = screen.getByTestId('opm-scope-clear');
    fireEvent.click(clearBtn);
    expect(onReset).toHaveBeenCalled();

    const zoomSelect = screen.getByTestId('opm-scope-zoom-select');
    fireEvent.change(zoomSelect, { target: { value: '2' } });
    expect(zoomSelect).toHaveValue('2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/opmSimulationScope.test.tsx`
Expected: FAIL with "Cannot find module '../OpmSimulationScope'".

- [ ] **Step 3: Implement `OpmSimulationScope.tsx`**

Create `src/components/entropy/OpmSimulationScope.tsx` with:
- `ScopeSample` interface capturing tick, timestamp, and channel boolean/number states.
- Dynamic extraction of channels:
  - Process nodes (`data.type === 'process'`) -> `isFiring ? 1 : 0`.
  - Object child states (`obj.data.states`) -> `state.isActive ? 1 : 0`.
- SVG multi-track rendering:
  - Track height: 32px per channel.
  - Step-line path generation (`M x y H x2 V y2 ...`) showing High (1) and Low (0) logic transitions.
  - Time playhead indicator at `currentTick`.
  - Grid background lines for time intervals.
- Scope controls header:
  - Play/Pause sync indicator.
  - Zoom selector (`1x`, `2x`, `5x`, `Fit`).
  - Channel search filter (`searchTerm`).
  - Clear history button (`data-testid="opm-scope-clear"`).
  - Tick & Time readout (`data-testid="opm-scope-tick-counter"`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/entropy/__tests__/opmSimulationScope.test.tsx`
Expected: PASS with 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/OpmSimulationScope.tsx src/components/entropy/__tests__/opmSimulationScope.test.tsx
git commit -m "feat(opm): add simulation scope component and logic analyzer tests"
```

---

### Task 2: High-Fidelity Blocks & Directional Ports Visual System

**Files:**
- Modify: `src/components/entropy/OPMNodeComponents.tsx`
- Modify: `src/components/entropy/__tests__/opmBlocksVisual.test.tsx`
- Modify: `src/components/entropy/__tests__/opmPortsLinks.test.tsx`

**Interfaces:**
- Consumes: `AppNode`, `OPMPort` from `./EntropyTypes`.
- Produces: Upgraded `OPMObjectNode`, `OPMProcessNode`, `OPMStateNode`, and `renderOPMPort`.

- [ ] **Step 1: Write additional visual and port assertions in `opmBlocksVisual.test.tsx`**

Update `src/components/entropy/__tests__/opmBlocksVisual.test.tsx` to assert:
- `renderOPMPort` outputs directional indicator attributes (`data-port-direction="input"` or `"output"`).
- `OPMProcessNode` includes pulse halo classes when `isFiring` is true.
- `OPMObjectNode` preserves all port handles and child state containers.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/opmBlocksVisual.test.tsx`
Expected: FAIL on missing directional indicator attributes or halo styling.

- [ ] **Step 3: Implement Visual Enhancements in `OPMNodeComponents.tsx`**

1. In `renderOPMPort`:
   - Add directional SVG chevrons inside the handle:
     - Input (`direction === 'input'`): miniature arrow pointing inward into the block.
     - Output (`direction === 'output'`): miniature arrow pointing outward from the block.
   - Expand interactive halo container with transition scale (`hover:scale-125 hover:shadow-[0_0_12px_#38bdf8]`).
   - Add `data-port-direction={port.direction}` to the handle wrapper for automated testing.
   - Refine port label badges with high-contrast obsidian backdrops (`bg-[#09090b]/95 border-white/15`).
2. In `OPMProcessNode`:
   - Enhance `isFiring` state with an outer pulsing radial aura (`shadow-[0_0_25px_rgba(251,146,60,0.8),0_0_50px_rgba(249,115,22,0.3)]`).
   - Add sleek dark-glass backdrop styling and uppercase stereotype badge.
3. In `OPMObjectNode` and `OPMStateNode`:
   - Add refined glassmorphic gradient backgrounds (`backdrop-blur-md`).
   - Refine state pills with crisp border contrasts and active state glowing rings.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entropy/__tests__/opmBlocksVisual.test.tsx src/components/entropy/__tests__/opmPortsLinks.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/OPMNodeComponents.tsx src/components/entropy/__tests__/opmBlocksVisual.test.tsx src/components/entropy/__tests__/opmPortsLinks.test.tsx
git commit -m "feat(opm): upgrade block glassmorphism and directional port chevrons"
```

---

### Task 3: Studio Ribbon Command Bar Redistribution & Dock Scope Integration

**Files:**
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/components/entropy/__tests__/executionPanels.test.tsx`

**Interfaces:**
- Consumes: `OpmSimulationScope` from `./OpmSimulationScope`.
- Produces: Modern Studio Ribbon top bar and Scope tab integration across dock views.

- [ ] **Step 1: Write test for Ribbon distribution and Scope tab in `executionPanels.test.tsx`**

Add tests to verify:
- Top bar displays Studio Ribbon segments: Context cluster, Edit cluster, Layout cluster, Simulation cluster.
- Switching to `rightTab === 'scope'` renders the `OpmSimulationScope` without errors.
- Simulation playback controls retain `data-testid="opm-sim-toggle"`, `data-testid="opm-sim-step"`, `data-testid="opm-sim-reset"`, and `data-testid="opm-toolbar-tick-slider"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/entropy/__tests__/executionPanels.test.tsx`
Expected: FAIL on missing `'scope'` tab or Ribbon segment headers.

- [ ] **Step 3: Restructure Top Bar and Mount Scope in `EntropyWorkspace.tsx`**

1. Top Bar Redistribution:
   - Wrap top navigation bar in a sleek Studio Ribbon with 4 visual clusters:
     - **Cluster 1 (Project & Models):** `← Back`, Breadcrumb trail, Load Template selector, `Import SysML → OPM` button with violet accent.
     - **Cluster 2 (History & Editing):** Undo (`↶`) and Redo (`↷`) with shortcut tooltips.
     - **Cluster 3 (Canvas Layout):** Force Layout and Hierarchy Layout segmented buttons with icons.
     - **Cluster 4 (Simulation Control):** Transport pill (`Play/Pause`, `Step`, `Reset`), Status pill (`data-testid="opm-sim-status"`), Tick slider (`data-testid="opm-toolbar-tick-slider"`), and Scope shortcut button.
2. Dock Integration:
   - Extend `rightTab` state type: `'simControl' | 'scope' | 'opl' | 'smartShow' | 'opmCodegen'`.
   - Add `📈 Scope` tab button to dock tab header.
   - Render `<OpmSimulationScope ... />` inside the dock panel when `rightTab === 'scope'`.
   - Also allow opening Scope in the bottom dock alongside the console when selected.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/entropy/__tests__/executionPanels.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/entropy/EntropyWorkspace.tsx src/components/entropy/__tests__/executionPanels.test.tsx
git commit -m "feat(opm): integrate studio ribbon and simulation scope dock tab"
```

---

### Task 4: Full Test Suite, Accessibility, and Production Build Verification

**Files:**
- Check: All files in `src/components/entropy/` and `src/engine/opm/`

- [ ] **Step 1: Run complete vitest test suite across all entropy and engine tests**

Run: `npx vitest run src/components/entropy/__tests__ src/engine/opm/__tests__`
Expected: All 100+ tests pass with 0 failures.

- [ ] **Step 2: Run TypeScript typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Build completes successfully.

- [ ] **Step 4: Commit final verification**

```bash
git commit --allow-empty -m "test(opm): verify studio ribbon, simulation scope, and block visuals"
```
