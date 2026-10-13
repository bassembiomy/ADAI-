# Design Document: Diagram & Module Action Toolbar Horizontal Scroll

**Date:** 2026-10-07  
**Status:** Approved  
**Author:** ADIA Engineering Team  

---

## 1. Executive Summary
In complex diagram views and engineering modules within ADIA (such as Requirements Diagrams, SysML BDD, State Machine, IBD, Package, Use Case, Activity, Sequence, X-Bridges, and V-Lab), the action toolbar directly below the workspace tabs strip can contain dozens of command buttons (creation actions, domain switches, layout triggers, connection toggles, grid/snap, and zoom controls).

When sidebar docks (Hierarchy, Variables, Properties) are opened or the viewport width is reduced, the canvas toolbar overflows. Previously, the toolbar lacked horizontal scroll constraints and scrollbar styling, causing end tools (such as Grid, Snap, and Zoom) to get cut off or become completely inaccessible behind container overflow clipping.

This design introduces a universal, responsive horizontal scrolling mechanism with a bespoke dark-theme scrollbar, mouse-wheel horizontal scrolling support, and non-shrinking button guarantees across all diagram workspaces and simulation modules.

---

## 2. Architecture & Scope

### 2.1 Floating Canvas Toolbar (`src/App.tsx`)
The primary canvas floating toolbar serves:
- **Main Requirements Diagram** (`requirements`)
- **Main SysML BDD Diagram** (`bdd`)
- **Main State Machine Diagram** (`statemachine`)
- **Package Diagram** (`package`)
- **Internal Block Diagram** (`ibd`)
- Custom hierarchical/nested state machine and SysML diagram views.

**Design Adjustments:**
- Constrain maximum width with `max-w-[calc(100%-1.5rem)]`.
- Set container classes: `overflow-x-auto overflow-y-hidden adia-toolbar-scrollbar select-none`.
- Wrap inner elements with `shrink-0` to protect intrinsic button dimensions and text readability.
- Add wheel event listener `onWheel` that maps vertical scroll delta (`deltaY`) to horizontal scroll position (`scrollLeft += deltaY`).

### 2.2 SysML Dedicated Workspaces
- **Use Case Diagram** (`src/components/sysml/UseCaseWorkspace.tsx`):
  Update header bar from rigid/unbounded wrapping to a fluid horizontal scroll with `adia-toolbar-scrollbar` and `overflow-x-auto`.
- **Activity Diagram** (`src/components/sysml/ActivityWorkspace.tsx`):
  Update header palette and zoom action bar with `overflow-x-auto` and `adia-toolbar-scrollbar`.
- **Sequence Diagram** (`src/components/sysml/SequenceWorkspace.tsx`):
  Update header palette and interaction action strip with `overflow-x-auto` and `adia-toolbar-scrollbar`.

### 2.3 Simulation Modules & Studio Workspaces
- **X-Bridges Workspace** (`src/components/xbridges/XbridgesWorkspace.tsx`):
  Update top ribbon toolbar (`h-16`) to support `overflow-x-auto` and `adia-toolbar-scrollbar` so run/pause/step/parameters do not get clipped on narrow screens.
- **V-Lab Physics Simulator** (`src/components/vlab/VLabWorkspace.tsx`):
  Ensure top control bar (`vlab-panel`) controls container supports `overflow-x-auto` and `adia-toolbar-scrollbar`.
- **HIL Workspace** (`src/components/hil/HILWorkspace.tsx`):
  Add `overflow-x-auto` and `adia-toolbar-scrollbar` to header action containers.
- **Entropy Workspace** (`src/components/entropy/EntropyWorkspace.tsx`):
  Align `opm-studio-ribbon` with the shared `adia-toolbar-scrollbar` tokens.
- **PlantUML Workspace** (`src/components/plantuml/PlantUmlWorkspace.tsx`):
  Ensure top action button cluster scrolls cleanly on narrow screens.

---

## 3. Visual Scrollbar Design (`src/index.css`)

A dedicated CSS utility `.adia-toolbar-scrollbar` will be defined:
```css
/* Custom slim horizontal scrollbar for diagram action toolbars */
.adia-toolbar-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.adia-toolbar-scrollbar::-webkit-scrollbar {
  height: 4px;
}

.adia-toolbar-scrollbar::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 9999px;
}

.adia-toolbar-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  transition: background-color 0.2s ease;
}

.adia-toolbar-scrollbar:hover::-webkit-scrollbar-thumb,
.adia-toolbar-scrollbar:focus-within::-webkit-scrollbar-thumb {
  background: rgba(249, 115, 22, 0.7); /* ADIA Brand Orange */
}

.adia-toolbar-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #f97316; /* Bright Orange on thumb hover */
}
```

---

## 4. Interaction Model

1. **Wheel Translation Utility**:
   A reusable helper `handleHorizontalWheel(event: React.WheelEvent<HTMLElement>)`:
   - Checks if `e.deltaY !== 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth`.
   - If scrollable, executes `e.currentTarget.scrollLeft += e.deltaY` and calls `e.preventDefault()` / prevents canvas zoom interference.
2. **Touch & Trackpad Gestures**:
   Native touch swipe and two-finger horizontal trackpad scrolling work seamlessly via standard `overflow-x-auto`.
3. **Keyboard & Focus Navigation**:
   Tabbing through buttons automatically scrolls focused items into view.

---

## 5. Testing & Verification

1. **Automated Tests**:
   - Unit tests verifying the presence of `adia-toolbar-scrollbar`, `overflow-x-auto`, and `max-w-[calc(100%-1.5rem)]` on the canvas toolbar.
   - Verification that children of the canvas toolbar have `shrink-0`.
   - Unit tests verifying wheel translation logic.
2. **Manual Regression & Visual Inspection**:
   - Verify Requirements Diagram toolbar with all sidebars open. Confirm that `+ Package`, `+ Requirement`, `+ Block`, `+ Test Case`, `RTM`, `Allocations`, `Auto Layout`, `Connect`, `Grid`, `Snap`, and `Zoom` controls are fully reachable via the scrollbar and wheel.
   - Verify BDD, State Machine, IBD, Package, Use Case, Activity, Sequence, X-Bridges, and V-Lab toolbars.
