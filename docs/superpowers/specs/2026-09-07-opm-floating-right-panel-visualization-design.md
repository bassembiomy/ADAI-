# OPM Right Panel Visualization & Floating Window Design

## Context & Problem
In the ADIA OPM (Object-Process Methodology) module, the right panel currently hosts the Element Inspector (properties, states, attributes, ports) and Studio Tabs (Simulation Dashboard, Scope logic analyzer, OPL natural language specifications, Smart Show views, and OPM Code Generator/Build). Currently, this panel is strictly docked inside the right sidebar of `OpmDockShell` with a basic dark appearance and a fixed width. Users require:
1. **Better visualization**: Modern glassmorphic aesthetics, glowing status indicators, clear typography, and collapsible cards for Inspector sections (States, Attributes, Ports).
2. **Double-click to float**: Double-clicking the panel header undocks it to float directly over the workspace canvas.
3. **Sizable like the entire application**: The floating window can be freely resized (drag handles), dragged across the canvas, minimized, maximized, and re-docked back to the sidebar.

## Architecture & Interaction Mechanics

### State Model
In `src/components/entropy/EntropyWorkspace.tsx` (or an encapsulating container):
- `isRightFloating: boolean` (default: `false` — docked in the right dock slot).
- `floatingPos: { x: number; y: number }` (default: `{ x: Math.max(80, window.innerWidth - 480), y: 64 }`).
- `floatingSize: { width: number; height: number }` (default: `{ width: 450, height: 620 }`).
- `isMaximized: boolean` (default: `false`).
- `isMinimized: boolean` (default: `false`).

### Interaction Gestures
1. **Double-Click Header**:
   - **When Docked**: Double-clicking the right panel titlebar undocks it to a floating window on the workspace.
   - **When Floating**: Double-clicking the floating window titlebar toggles between maximized (full workspace view) and restored dimensions.
2. **Dragging**:
   - Grabbing the floating titlebar allows repositioning anywhere within the workspace viewport, clamped within bounds so the window is never lost offscreen.
3. **Sizing**:
   - Bottom-right corner resize handle (`cursor-nwse-resize`) with constraints:
     - Minimum width: `320px`
     - Minimum height: `300px`
     - Maximum width/height: Viewport minus margins.
4. **Header Window Actions**:
   - **Dock Back Button** (`ArrowRightFromLine` / `PanelRightClose`): Re-docks into the sidebar.
   - **Minimize Button** (`Minus`): Collapses the window into a compact floating status pill.
   - **Maximize / Restore Button** (`Maximize2` / `Minimize2`): Toggles full canvas focus mode.
   - **Close Button** (`X`): Re-docks to the right sidebar.
   - **Docked Header Popout Button**: A dedicated popout button in docked mode for instant mouse click accessibility.

## Visual Design & Aesthetics

### Theme & Styling
- Dark glassmorphic background: `bg-[#121217]/95 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] rounded-xl`.
- Accent gradient banner (`from-orange-500 via-amber-500 to-sky-500`) at the top of the window frame.
- High-contrast typography and subtle borders (`border-white/5` and `border-[#2d2d2d]`).

### Inspector Visualization
- **Element Banner**: Color-coded badges for element kinds (Object: green, Process: sky blue, State: orange, Link: indigo).
- **States Section**:
  - Glowing active state pill: `bg-orange-500/20 text-orange-300 border border-orange-500/40` with animated pulsing dot `shadow-[0_0_8px_#f97316]`.
  - Initial state marker badge.
  - Collapsible accordion with counter badge (`N States`).
- **Attributes Section**:
  - Monospace key-value chips with formatted borders.
  - Collapsible accordion with counter badge (`N Attributes`).
- **Ports Manager**:
  - Direction badges (`IN` blue pill, `OUT` emerald pill) with position markers (`L`, `R`, `T`, `B`) and port types.
  - Clean inline form for adding custom ports with type options.
  - Collapsible accordion with counter badge (`N Ports`).

### Tab Navigation Strip
- Modern glassmorphic tab strip with active indicator underlines, glowing icons, and clean hover states for:
  - `⚡ Sim` (Simulation transport & time metrics)
  - `📈 Scope` (Simulation scope logic analyzer)
  - `📝 OPL` (OPL sentence specification)
  - `🌐 Smart Show` (Dynamic view deriver)
  - `🛠 OPM Build` (C code generator & verification)

### Multi-Column Layout Adaptation
- When the floating window is resized wider (`width >= 620px`), it automatically switches to a side-by-side dual-pane layout (Inspector on the left, Tab dashboard on the right) for optimal workspace ergonomics.

## Component Architecture

1. **`src/components/entropy/OpmFloatingWindow.tsx`**:
   - Encapsulates window frame, titlebar drag handler, double-click maximize/undock, window controls, and corner/edge resizing handles.
2. **`src/components/entropy/OpmRightPanelContent.tsx`**:
   - Reusable presenter component containing both the Element/Link Inspector and the Studio Tabs (`simControl`, `scope`, `opl`, `smartShow`, `opmCodegen`).
   - Supports docked mode styling and wide floating multi-column styling.
3. **`src/components/entropy/EntropyWorkspace.tsx`**:
   - Integrates `isRightFloating` state.
   - When docked: renders `OpmRightPanelContent` in `OpmDockShell`'s `right` slot with undock double-click/button.
   - When floating: collapses `OpmDockShell`'s right dock and mounts `OpmFloatingWindow` over the canvas holding `OpmRightPanelContent`.

## Verification & Testing Plan

### Automated Tests (`src/components/entropy/__tests__/opmFloatingRightPanel.test.tsx`)
- Default docked state verification: renders docked header with double-click and popout button.
- Undocking gesture: double-clicking docked header triggers floating mode.
- Floating window titlebar: double-clicking toggles maximize/restore.
- Re-docking: clicking the dock button restores sidebar docking.
- Resizing logic: resizing updates width and height within minimum bounds (`320px x 300px`).
- Section toggling: verifies collapsible accordions for States, Attributes, and Ports.
- Tab persistence: switching tabs in floating mode retains active selection.

### Regression Suite
- Run `npm run test:opm` to ensure all existing dock, parser, and simulation tests pass.
