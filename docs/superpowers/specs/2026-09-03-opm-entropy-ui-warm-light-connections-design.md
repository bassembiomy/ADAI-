# OPM Entropy UI: Warm Light Selection, Redesigned Blocks & Ports, Enhanced Connections & Overlap Prevention Design

## Overview
This design improves the visual fidelity, interaction mechanics, and clarity of the OPM (Object-Process Methodology) Entropy diagram workspace in ADIA. It introduces:
1. An incandescent "warm light" golden-amber illumination effect when elements (nodes, ports, links) are selected.
2. Premium redesigned visual styling for blocks (Objects, Processes, States, Requirements) and port handles.
3. Enhanced connection lines with smooth-step routing and animated drag preview.
4. An interactive floating badge directly on selected links displaying link types (with an in-diagram type switcher).
5. Dynamic collision nudge and increased auto-layout clearances to ensure blocks never overlap.

---

## Architecture & Visual System

### 1. Warm Light Selection Illumination System
When any diagram element is selected (Object, Process, State, Requirement, or Connection Link):
- **Core Aesthetic**: Warm golden-amber halo and sunlit luminescence (`#fbbf24`, `rgba(251, 191, 36, 0.7)` and `rgba(245, 158, 11, 0.45)`).
- **Node Glow**: Multi-tier box-shadow with outer bloom:
  `box-shadow: 0 0 25px rgba(251, 191, 36, 0.65), 0 0 50px rgba(245, 158, 11, 0.35), inset 0 0 12px rgba(251, 191, 36, 0.15);`
  and golden border accent (`border-amber-400`).
- **Edge Glow**: SVG filter drop-shadow with amber stroke:
  `stroke: #fbbf24`, `filter: drop-shadow(0 0 8px #fbbf24)`, with an underlying translucent wider glow path.

### 2. Redesigned Blocks (Nodes) & Ports
- **Object Node**:
  - Refined frosted dark glass (`bg-[#0a1510]/92 backdrop-blur-md`).
  - High-definition typography, tag badges (`«Object»`), physical object double-border styling, and clear property attribute rows.
  - Dedicated state container bay that dynamically stretches to accommodate nested states.
- **Process Node**:
  - Sleek modern ellipse with smooth border gradients (`bg-[#081522]/90`).
  - Cyan accents when unselected, golden-amber illumination when selected, and glowing orange animation during active simulation execution.
- **State Node**:
  - Polished rounded capsules positioned inside parent objects with dark amber gradients.
  - Distinct initial state indicator and active running pulse.
- **Requirement Node**:
  - Modern purple card with crisp italicized requirement statement and badge.
- **Port Handles**:
  - Enlarged interactive radius with an inner 10px circular core and clean high-contrast border (`#18181b`).
  - Color-coded per OPM link role (Agent: Sky-400, Instrument: Sky-600, Trigger: Amber-500, Condition: Purple-400, Effect: Pink-500, Result: Emerald-500, Consumption: Slate-400).
  - Hover micro-animation (`scale-125`) with magnetic pulse effect and floating high-contrast pill tooltip displaying port role and name.
  - Smart perimeter distribution so ports along any edge are spaced evenly without crowding.

### 3. Connection Lines & On-Diagram Link Type Display
- **Smooth Routing**:
  - Connection paths generated using `getSmoothStepPath` with an enlarged corner radius (16px) and 28px clearance offset, avoiding awkward bends or cutting across block boundaries.
- **Interactive Drag Connection Line**:
  - Glowing amber dashed path connecting from the source port to the cursor, with automatic magnetic snapping to valid target ports within a 30px radius.
- **Interactive Floating Link Badge**:
  - Rendered using `@xyflow/react`'s `EdgeLabelRenderer` at the exact path midpoint `(labelX, labelY)` when a link is selected.
  - Contains:
    - Link type icon and formatted name (e.g. `⚡ Trigger`, `👤 Agent`, `🎯 Instrument`, `📦 Consumption`, `✨ Result`, `🔄 Effect`, `❓ Condition`, `🧩 Aggregation`, `📐 Generalization`, `📜 Satisfies`).
    - Ambient warm glow and dark frosted pill background (`bg-[#121214]/95 border border-amber-400/70 shadow-[0_0_15px_rgba(251,191,36,0.4)]`).
    - Quick-switch dropdown menu to change link type inline on the canvas without leaving the diagram.
    - Delete button to quickly remove the link.

### 4. Overlap Prevention & Collision Resolution
- **Interactive Drag Nudge (`onNodeDragStop`)**:
  - Computes axis-aligned bounding box (AABB) intersection between the moved node and all other root nodes on the canvas.
  - If an overlap is detected (intersection greater than a safety margin of 10px), calculates the minimal translation vector along the X or Y axis and pushes the moved node smoothly to the nearest free spot.
- **Auto-Layout Clearances (`OpmAutoLayout.ts`)**:
  - Column gap increased to 420px, row gap increased to 70px.
  - Dynamic sizing calculation incorporates state counts and attribute lists to guarantee zero overlapping nodes or links.

---

## File Changes & Components Affected
1. `src/components/entropy/OPMNodeComponents.tsx`:
   - Implement warm light selection styling for Object, Process, State, and Requirement nodes.
   - Upgrade port handles with circular cores, hover bloom, and role-based glowing rings.
2. `src/components/entropy/OPMEdgeComponents.tsx`:
   - Implement warm light glow for selected edges.
   - Add `EdgeLabelRenderer` floating badge with icon, link type title, and interactive dropdown to change link type directly on the diagram.
3. `src/components/entropy/EntropyWorkspace.tsx`:
   - Add `onNodeDragStop` collision resolution handler to nudge overlapping blocks.
   - Pass link type change handler to edges.
   - Enhance `OPMConnectionLine` with warm amber glowing drag feedback.
4. `src/components/entropy/OpmAutoLayout.ts`:
   - Increase column and row clearance margins for guaranteed collision-free layout.

---

## Verification Plan
1. **Automated Tests**:
   - Run existing unit tests: `npm test -- src/components/entropy/`
   - Add unit tests for collision detection and nudge utility functions.
2. **Visual Verification**:
   - Verify warm golden light appears on selected nodes and edges.
   - Verify clicking any link shows the floating badge with link type and allows switching type.
   - Verify dragging nodes on top of each other triggers the collision nudge so blocks do not overlap.
   - Verify auto-layout renders clean, spacious, collision-free diagrams.
