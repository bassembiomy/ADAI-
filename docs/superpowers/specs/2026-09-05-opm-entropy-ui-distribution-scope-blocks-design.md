# OPM Entropy UI Distribution, Simulation Scope & Blocks Visual Specification

**Date:** 2026-09-05  
**Topic:** OPM Entropy UI Ribbon Distribution, Simulation Logic Scope & Block/Port Visualization Overhaul  
**Status:** Approved by User  

---

## 1. Executive Summary

This specification outlines the comprehensive visual and functional upgrade to the OPM Entropy Module. The goal is to deliver:
1. **Reorganized UI Distribution:** A modern Studio Ribbon command bar grouping navigation, model templates, edit history, auto-layout, and simulation transport into clean visual clusters.
2. **Simulation Scope / Logic Analyzer:** A dedicated real-time waveform and logic analyzer dock tab (`OpmSimulationScope.tsx`) capturing tick-by-tick process states, object state transitions, and signal pulses with interactive time playhead, zoom, and channel toggles.
3. **High-Fidelity Blocks & Ports Visual Experience:** Upgraded styling for Objects, Processes, States, Requirements, and Ports with modern glassmorphism, active firing halos, directional port chevrons, and luminous semantic link-role indicators.
4. **Guaranteed Non-Breaking Compatibility:** Strict preservation of all test IDs, handle contracts, simulation persistence, keyboard navigation, and existing features.

---

## 2. Component Distribution & Studio Ribbon Architecture

### 2.1 Studio Ribbon Clusters (`EntropyWorkspace.tsx`)
The top bar is restructured into 4 distinct, cohesive segments:
- **Cluster 1: Project & Hierarchy Navigation**
  - `← Back` button with hover feedback.
  - Interactive Breadcrumb navigation (`root › level-1 › level-2`) with hover styling and clear level indication.
  - Load Template dropdown (`OPM_EXAMPLES`) with clean dark container and indicator.
  - `Import SysML → OPM` migration trigger button styled with violet accent.
- **Cluster 2: Authoring & History**
  - Undo (`↶`) and Redo (`↷`) buttons with disabled state contrast and shortcut tooltips.
  - Auto-Layout switcher with Force-Directed (`Layout` icon) and Hierarchy/Tree layout options.
- **Cluster 3: Simulation Control Center**
  - Grouped playback transport pill: Play/Pause (`data-testid="opm-sim-toggle"`), Step (`data-testid="opm-sim-step"`), and Reset (`data-testid="opm-sim-reset"`).
  - Live simulation status pill with pulsing LED (`data-testid="opm-sim-status"`).
  - Isolated OPM tick speed slider (`data-testid="opm-toolbar-tick-slider"`) with real-time numeric readout (`{activeOpmConfig.tickMs}ms`).
- **Cluster 4: Dock & Scope Quick Access**
  - Scope shortcut button jumping directly to the new `📈 Scope` tab.
  - Workspace preset selectors (`Standard`, `Wide Split`, `Canvas Focus`).

### 2.2 Left Toolbar Refinements
- Grouped tool buttons: Selection, Object, Process, State, Requirement with active highlight states.
- Link Mode selector (`data-testid="opm-link-mode-select"`) grouped with semantic categories (Procedural, Structural, Traceability).
- Outline pane showing zoom hierarchy depth and in-scope element/link counts.

---

## 3. OPM Simulation Scope (Logic Analyzer / Waveform Visualizer)

### 3.1 New Component: `src/components/entropy/OpmSimulationScope.tsx`
- **Props:**
  - `simRunning: boolean`: Current run state.
  - `currentTick: number`: Active tick count from `simStateRef.current.tick`.
  - `tickMs: number`: Active tick interval.
  - `nodes: AppNode[]`: Diagram nodes to derive channels from.
  - `edges: AppEdge[]`: Diagram edges to monitor connections.
  - `recentLogs: SimulationLog[]`: Log events for event correlation.
  - `onReset?: () => void`: Optional callback to reset buffer.

### 3.2 Signal Extraction & Buffer Management
- Records samples on every simulation tick:
  - **Process Channels:** Binary state (1 = firing, 0 = idle).
  - **State Channels:** Active status (1 = active, 0 = inactive) for each child state of objects.
  - **Event Pulses:** Spike indicators (1 for 1 tick) when an event triggers or a link fires.
- Maintains a rolling history buffer of the last 50–200 ticks.
- Synchronized with `simStateRef.current` and resets cleanly when simulation resets.

### 3.3 Visual Layout & Scope Controls
- Multi-track timeline chart rendered via SVG:
  - Left track labels: Element name, stereotype icon (`«Process»`, `«State»`), and current state value.
  - Center waveform track: Digital logic step lines (square wave transitions) with color coding matching node stereotypes (emerald for states, sky blue for processes, amber for triggers).
  - Time axis: Grid lines with millisecond labels computed from `tick * tickMs`.
  - Playhead marker: Vertical glowing golden cursor at the current tick position.
- Controls bar:
  - Zoom presets: `1x`, `2x`, `5x`, `Fit`.
  - Channel filter search input to quickly isolate specific processes/objects.
  - `Clear Scope` button to wipe buffer.
  - `Export Trace` button to download CSV/JSON waveform data.

### 3.4 Dock Integration
- Added as a tab option:
  - Right tab strip: `⚡ Sim | 📈 Scope | 📝 OPL | 🌐 Smart Show | 🛠 OPM Build`
  - Bottom dock drawer: Available side-by-side with the Console or as a switchable view.

---

## 4. High-Fidelity Blocks & Ports Visual System

### 4.1 Object & Requirement Nodes (`OPMObjectNode`)
- High-contrast obsidian glass card (`bg-[#0a1810]/90 backdrop-blur-md` for objects, `bg-[#160b22]/90` for requirements).
- Specular header bar with uppercase stereotype tag (`«Object»` / `«Requirement»`).
- Distinct border weights:
  - Informational Object: 1.5px emerald border (`#10b981`).
  - Physical Object: 3px emerald border with deep outer glow (`shadow-lg`).
  - Requirement: Purple gradient header and crisp italicized text body.
- Polished child-state drop slot with subtle grid background.

### 4.2 Process Nodes (`OPMProcessNode`)
- Elliptical body with smooth radial shading (`bg-[#0c1a24]/85 border-sky-600/70`).
- Firing State (`isFiring`): Animated dual-ring luminous halo (`box-shadow: 0 0 25px rgba(251, 146, 60, 0.8)` with pulsating outer aura).
- Centered typography with luminous stereotype chip.

### 4.3 State Nodes (`OPMStateNode`)
- Rounded pills with amber/orange tones.
- Active State: Gradient fill (`from-orange-500 to-amber-500`) with high-contrast text and ping indicator.
- Initial State: Crisp ISO marker dot on the left.

### 4.4 Port Visual & Interaction System (`renderOPMPort`)
- **Directional Chevrons:** Small arrow indicators within the port handle pointing inward for input targets and outward for output sources.
- **Enhanced Halo:** 16px hover zone with magnetic expansion on connection drag (`hover:scale-125`).
- **Semantic Role Colors:**
  - Agent (`#38bdf8`), Instrument (`#0284c7`), Trigger (`#f59e0b`), Condition (`#c084fc`), Effect (`#ec4899`), Result (`#10b981`), Consumption (`#64748b`).
- **Crisp Label Chips:** Monospace micro-badge with color-coded dot and high-contrast dark backdrop.

---

## 5. Backward Compatibility & Test Verification

### 5.1 Test IDs & Contracts
The following test IDs and properties must remain accessible and functional:
- `data-testid="opm-sim-status"`
- `data-testid="opm-sim-time"`
- `data-testid="opm-sim-toggle"`
- `data-testid="opm-sim-step"`
- `data-testid="opm-sim-reset"`
- `data-testid="opm-toolbar-tick-slider"`
- `data-testid="opm-link-mode-select"`
- `data-testid="opm-sim-config-tick"`
- React Flow handle positions and IDs.

### 5.2 Verification Plan
1. **Automated Unit & Integration Tests:**
   - Run existing test suite across all 18 test files: `npx vitest run src/components/entropy/__tests__ src/engine/opm/__tests__`
   - Add test suite for `OpmSimulationScope.test.tsx` validating tick sampling, signal waveforms, and user controls.
2. **TypeScript & Build Verification:**
   - `npx tsc --noEmit`
   - `npm run build`
3. **Visual & Regression Verification:**
   - Verify all buttons and menus in the redesigned Studio Ribbon.
   - Verify Simulation Scope accurately records and displays waveforms when running simulation.
   - Verify blocks and ports display enhanced aesthetics without breaking drag, resize, or connection behavior.
