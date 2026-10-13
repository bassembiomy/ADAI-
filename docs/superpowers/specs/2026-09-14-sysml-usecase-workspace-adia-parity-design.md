# SysML Use-Case Workspace: ADIA UI/UX Parity, Keyboard Shortcuts & Cross-Diagram Traceability Design

## 1. Overview & Objective

This design document establishes the architecture, visual language, interaction mechanics, keyboard shortcuts, and SysML cross-diagram traceability model for the **Use-Case Diagram Module** in ADIA.

The objective is to achieve 100% parity with ADIA's design system (established in ENTROPY OPM, BDD, IBD, and State Machine workspaces) and conform strictly to **OMG SysML v1.6 / v1.7 (ISO/IEC 19514)** specifications.

---

## 2. Architecture & Visual System

### 2.1 Warm Light Selection Illumination System
When any diagram element is selected (Use Case, Actor, Subject Boundary, or Relationship Link):
- **Aesthetic**: Incandescent warm golden-amber illumination (`#fbbf24`, `rgba(251, 191, 36, 0.65)` and `rgba(245, 158, 11, 0.35)`).
- **Node Glow**:
  ```css
  box-shadow: 0 0 25px rgba(251, 191, 36, 0.65), 0 0 45px rgba(245, 158, 11, 0.35), inset 0 0 10px rgba(251, 191, 36, 0.15);
  border-color: #fbbf24;
  ```
- **Edge Glow**: Amber stroke `#fbbf24`, SVG filter `drop-shadow(0 0 8px #fbbf24)`, with an underlying translucent wider glow path.

### 2.2 SysML Standard Visual Elements
1. **Use Case Node (`UseCaseNodeComponent`)**:
   - Polished ellipse container with dark frosted glass (`bg-[#18181b]/95 border border-[#3f3f46]`).
   - SysML header tag `«use case»` centered above the element name.
   - Extension points compartment display when extension points exist.
   - Top, bottom, left, right port connection handles with magnetic radius.
2. **Actor Node (`ActorNodeComponent`)**:
   - Vector stick-figure icon with `«actor»` stereotype label and name centered underneath.
   - Toggle support between stick-figure and classifier box (`«actor»` block).
3. **Subject / System Boundary (`BoundaryNodeComponent`)**:
   - SysML Subject bounding container with header tag `[Subject: <Block Name>]` or `«subject» <System Name>`.
   - Dashed structural border with subtle background tint (`bg-zinc-900/30 border-zinc-700`).
   - Supports nesting and visual containment of Use Cases within its scope.

### 2.3 SysML Standard Edges & Interactive Inline Switcher
- **Association**: Solid line connecting Actor and Use Case (`stroke: #71717a`, `strokeWidth: 2`).
- **«include»**: Dashed line with open arrowhead pointing from base use case to included use case, labeled `«include»`.
- **«extend»**: Dashed line with open arrowhead pointing from extending use case to base use case, labeled `«extend»`.
- **Generalization**: Solid line with closed hollow triangular arrowhead pointing to the parent classifier.
- **«refine» / «satisfy» / «trace»**: Dashed directed line with stereotype label linking use cases to Requirements or Blocks.
- **Interactive Edge Badge (`EdgeLabelRenderer`)**:
  - Floating pill on the edge midpoint displaying the relationship type icon and name.
  - Dropdown selector allowing the user to change relationship type inline on the canvas without opening a side panel.
  - Delete button to quickly remove the relationship.

---

## 3. ADIA Canvas Toolbar & User Experience

### 3.1 Floating Canvas Toolbar
A floating toolbar placed at `top-3 left-3`, styled to match ADIA's exact canvas aesthetic:
- Class: `bg-[#1a1a1a]/95 border border-[#333] rounded-lg px-2.5 py-1.5 shadow-xl backdrop-blur-sm flex items-center gap-1.5 text-xs text-gray-200`
- **Toolbar Items**:
  1. Breadcrumb: `SysML / Use Cases / [Diagram Name]`
  2. Separator (`h-4 w-[1px] bg-[#333]`)
  3. `+ Actor` button (`User` icon)
  4. `+ Use Case` button (`Circle` icon)
  5. `+ Subject` button (`Square` icon)
  6. Separator
  7. Relationship Mode Selector: `Association`, `«include»`, `«extend»`, `Generalization`, `«refine»`, `«satisfy»`
  8. Separator
  9. `Auto Layout` button (`Layout` icon)
  10. `Fit View` button (`Maximize2` icon)
  11. `Save` button (`Save` icon with orange `#f97316` hover accent)

---

## 4. Keyboard Shortcuts & Clipboard Engine (100% ADIA Parity)

A global hotkey event listener attached to the workspace window (ignoring inputs/textareas):
- **`Ctrl+S` / `Cmd+S`**: Save diagram to project state.
- **`Ctrl+Z` / `Cmd+Z`**: Undo canvas action.
- **`Ctrl+Y` / `Cmd+Y` / `Ctrl+Shift+Z`**: Redo undone action.
- **`Ctrl+C` / `Cmd+C`**: Copy selected nodes and connected edges into the clipboard buffer.
- **`Ctrl+V` / `Cmd+V`**: Paste copied elements with new UUIDs and a `+35px` spatial offset.
- **`Ctrl+X` / `Cmd+X`**: Cut selected elements to clipboard.
- **`Ctrl+A` / `Cmd+A`**: Select all nodes and edges.
- **`Delete` / `Backspace`**: Delete currently selected nodes and edges.
- **`Escape`**: Clear selection and close right inspector.
- **`Ctrl+0` / `Space+F`**: Zoom to fit all diagram elements.
- **`Ctrl +` / `Ctrl -`**: Zoom in / Zoom out.
- **Arrow Keys (`↑`, `↓`, `←`, `→`)**: Nudge selected elements by 1px (or 10px when holding `Shift`).

---

## 5. SysML Cross-Diagram Connections & Traceability Inspector

### 5.1 Subject Realization (`subject`)
- The system boundary maps directly to a canonical SysML **Block** in the project repository.
- Selecting a Subject Boundary allows choosing the realizing Block (e.g. `VehicleSystem`, `FlightComputer`).

### 5.2 Behavioral Elaboration
- In SysML, a Use Case specifies functional requirements elaborated by behavioral diagrams:
  - **Activity Diagram (`act`)**: Step-by-step operational workflow.
  - **Sequence Diagram (`sd`)**: Message sequence interactions between Actors and Subject lifelines.
  - **State Machine (`stm`)**: Operational modes and state transitions triggered by use case completion.
- The inspector allows linking a Use Case to an Activity or Sequence diagram, with a one-click button to open that diagram in ADIA.

### 5.3 Requirements Governance (`req`)
- Trace links between Use Cases and Requirements (`«refine»`, `«satisfy»`, `«verify»`).
- Established links automatically populate into ADIA's canonical **Requirements Traceability Matrix (RTM)**.

### 5.4 Unified Right-Panel Dock Shell
- Standard ADIA styled inspector with 3 tabs:
  - **Tab 1: Properties**: Name, stereotype, description, extension points.
  - **Tab 2: SysML Architecture**: Associated Subject Block, realizing Activity/Sequence diagram link.
  - **Tab 3: Traceability**: Refined and satisfied Requirements with status badges.

---

## 6. Files & Components Affected

1. `src/types/usecase_types.ts`:
   - Extend `UseCaseNode`, `UseCaseRelationship`, and `UseCaseElementData` with SysML metadata (stereotypes, subjectBlockId, elaboratingDiagramId, requirementsTraces).
2. `src/components/usecase/UseCaseNodes.tsx`:
   - Implement warm-light selection illumination and SysML styling (`«use case»`, `«actor»`, Subject boundary).
3. `src/components/usecase/UseCaseEdges.tsx` (NEW):
   - Custom SysML edges: open arrowheads for `«include»` / `«extend»`, hollow triangle for `Generalization`, solid for `Association`.
   - Floating edge badge (`EdgeLabelRenderer`) with inline type switcher.
4. `src/components/usecase/UseCaseToolbar.tsx` (NEW):
   - ADIA-styled floating top canvas toolbar with breadcrumb, node creation buttons, relationship tools, layout, and zoom controls.
5. `src/components/usecase/UseCaseInspector.tsx`:
   - Upgrade to ADIA 3-tab inspector (Properties, SysML Architecture, Traceability).
6. `src/components/usecase/UseCaseWorkspace.tsx`:
   - Integrate toolbar, keyboard shortcut engine (Undo/Redo, Copy/Paste/Cut, Nudge, Fit View), custom edges, and warm-light selection state.
7. `src/components/usecase/UseCaseAutoLayout.ts` (NEW):
   - Structured auto-layout organizing Actors to the left/right and Use Cases inside Subject boundaries.

---

## 7. Verification Plan

1. **Automated Unit Tests**:
   - Verify keyboard shortcut dispatcher (Copy/Paste offset, Undo/Redo stack).
   - Verify SysML edge validation (`«include»` only valid between Use Cases, `Association` valid between Actor and Use Case).
   - Verify node rendering with warm-light class names when `selected: true`.
2. **Type Checking & Build Verification**:
   - Run `npx tsc --noEmit` and ensure 0 compilation errors.
3. **Manual Verification**:
   - Verify floating canvas toolbar styling matches ADIA.
   - Verify warm-light selection glow illuminates nodes and edges.
   - Test shortcuts: `Ctrl+S`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+A`, `Del`, `Ctrl+0`.
   - Verify establishing a trace link to a Requirement correctly updates the element state.
