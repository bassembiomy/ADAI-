# Design Specification: HIL Workspace Scalable Panels & Visualization

**Date**: 2026-09-06  
**Status**: Approved by User  
**Scope**: Hardware-in-the-Loop (HIL) Engineering Toolchain Workspace (`src/components/hil/`)

---

## 1. Problem Statement & Objectives

In the ADIA HIL Engineering Suite, workspace tabs contain multiple information-dense cards (e.g. *Hardware Peripherals & Pins*, *Signal Mapping*, *HAL Live Preview*, *Compiler Terminal*, *Real-Time Telemetry Scope*).
On standard and high-DPI displays, fixed-width columns constrain visualization, making it difficult to inspect generated C code side-by-side with mapping configurations or view full oscilloscope waveforms.

### Key Objectives
1. **Interactive Panel Resizing**: Allow freeform horizontal resizing between side-by-side panels using smooth, draggable splitters with ADIA dark cyber styling.
2. **Maximize / Fullscreen Focus Mode**: Provide single-click Maximize (`Maximize2`) and Restore (`Minimize2`) controls on every panel header to focus on any card full-screen without context loss.
3. **Collapsible Header**: Allow collapsing the top *Target Pack Registry* in Tab 1 to expand vertical screen real estate for the driver and code preview panels.
4. **State Persistence**: Preserve user-customized panel widths and collapsed states in `localStorage` across reloads and tab switches.
5. **Zero External Bloat**: Implement a lightweight, zero-dependency component ensuring full compliance with ADIA's strict security policy and bundle standards.

---

## 2. Architecture & Components

### 2.1 Reusable Resizable Split-Pane Component (`ResizableSplitPaneGroup`)
Located at: `src/components/common/ResizableSplitPane.tsx`

```
+--------------------------------------------------------------------------------+
| ResizableSplitPaneGroup (horizontal flex container)                             |
| +-----------------+ [Grip 1] +--------------------+ [Grip 2] +----------------+ |
| | Panel 0         | <======> | Panel 1            | <======> | Panel 2        | |
| | (flex: sizes[0])|          | (flex: sizes[1])   |          | (flex: sizes[2]| |
| +-----------------+          +--------------------+          +----------------+ |
+--------------------------------------------------------------------------------+
```

* **Props**:
  * `children`: Array of React nodes representing the panels.
  * `initialSizes`: Array of default percentages summing to 100 (e.g. `[30, 35, 35]`).
  * `minSizes`: Array of minimum percentage thresholds (e.g. `[15, 15, 20]`) or default minimum (15%).
  * `storageKey`: Optional string key for saving/loading pane widths in `localStorage`.
  * `maximizedIndex`: `number | null` indicating which panel is currently expanded full-screen.
  * `className`: Optional styling container class.

* **Drag Interaction**:
  * Pointer capture (`onPointerDown` with `e.currentTarget.setPointerCapture(e.pointerId)`) ensures smooth tracking across the window.
  * Active state highlights the splitter gutter with ADIA neon orange accent (`#f97316`).
  * Global `user-select: none` during active drag prevents text selection.
  * Double-click on any splitter handle resets the adjacent panels to default equal proportions.

### 2.2 Panel Header Actions (`PanelHeaderAction`)
* Standardized header icon button for panels:
  * In normal mode: `<Maximize2 size={13} className="text-gray-400 hover:text-[#f97316]" />` (Tooltip: "Maximize")
  * In maximized mode: `<Minimize2 size={13} className="text-[#f97316] hover:text-white" />` (Tooltip: "Restore")
* Global `Escape` key listener restores maximized panels back to split view.

---

## 3. Tab-by-Tab Layout Specifications

### 3.1 Tab 1: `[1] Configure & Map Signals`
1. **Target Pack Registry Card**:
   * Add a collapse/expand toggle button (`ChevronUp` / `ChevronDown`) in the card header.
   * When collapsed, displays a single-line summary badge showing active Target Pack, Architecture, and Clock, reclaiming ~140px vertical space.
2. **Main 3-Column Split Group** (`adia_hil_tab1_sizes`):
   * **Pane 0 (Default 30%)**: *Hardware Peripherals & Pins* (`HILDriverPanel`) with Maximize button.
   * **Splitter 1**: Horizontal drag divider.
   * **Pane 1 (Default 35%)**: *Signal Mapping* (`HILSignalMapper`) with Maximize button.
   * **Splitter 2**: Horizontal drag divider.
   * **Pane 2 (Default 35%)**: *HAL Live Preview* (C-code generator preview) with Maximize button.

### 3.2 Tab 2: `[2] Build & Burn Toolchain`
1. **Top Config Row**: Compiler flags, memory utilization, flash utility, and safety audit status remain in compact top row.
2. **2-Column Split Group** (`adia_hil_tab2_sizes`):
   * **Pane 0 (Default 40%)**: *Linker Workspace Source Code* viewer with Maximize button.
   * **Splitter**: Horizontal drag divider.
   * **Pane 1 (Default 60%)**: *Embedded Toolchain Compiler Logs & Flash Terminal* with Maximize button.

### 3.3 Tab 3: `[3] Telemetry & Dashboard`
1. **Top Stream Status Toolbar**: Retains persistent connection, baud rate, and metrics.
2. **2-Column Split Group** (`adia_hil_tab3_sizes`):
   * **Pane 0 (Default 65%)**: *Real-Time Signal Scope* (Plotly waveform oscilloscope) with Maximize button.
   * **Splitter**: Horizontal drag divider.
   * **Pane 1 (Default 35%)**: *Fault Injection / Overrides & Session Event Log* with Maximize button.

---

## 4. Edge Cases & Safeguards

1. **Boundary Clamping**: Prevents dragging any panel below its minimum configured size (default 15% or 180px).
2. **Window Resize Handling**: Proportions are stored as relative percentages, automatically maintaining visual balance when the app window is resized.
3. **Invalid Stored State Recovery**: If `localStorage` data contains mismatched array lengths or non-numeric values, fall back gracefully to `initialSizes`.
4. **Overlay Shields**: An invisible pointer overlay activates during drag to prevent underlying code blocks, text selections, or canvas elements from stealing mouse events.

---

## 5. Verification Plan

1. **Automated Unit Tests**:
   * `src/components/common/ResizableSplitPane.test.tsx` testing split calculations, pointer drag, bounds clamping, double-click reset, maximize toggling, and storage persistence.
2. **TypeScript & Linter Checks**:
   * Verify clean typecheck via `npx tsc --noEmit`.
   * Ensure zero security regressions with existing `npm run test:security`.
3. **Visual & Interactive Validation**:
   * Drag splitters in all three tabs and verify smooth movement.
   * Toggle maximize on all cards and confirm clean restore via click and `Esc` key.
   * Verify Target Pack collapse toggle in Tab 1.
