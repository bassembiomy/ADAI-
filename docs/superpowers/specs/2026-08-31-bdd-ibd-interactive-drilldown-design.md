# Interactive BDD ↔ IBD Diagram Drill-Down & Hierarchy Navigation — Specification

**Date:** 2026-08-31  
**Status:** Approved  
**Target Areas:** `src/features/reporting/reportDiagrams.ts`, `src/features/reporting/reportHierarchyEngine.ts`, `src/features/reporting/reportDiagramModel.ts`

---

## 1. Objective

Enable seamless multi-layer interactive drill-down from Block Definition Diagrams (BDD) to Internal Block Diagrams (IBD), as well as nested Sub-IBD layers and State Machines, with full breadcrumb navigation, zoom/pan controls, and visual node indicators.

---

## 2. Requirements & User Experience

### 2.1 Visual Affordance on Blocks with Child Layers
- When a BDD block has child internal parts (`parts.some(p => p.blockId === block.id)`), it is rendered as an interactive node:
  - Cursor style: `cursor: pointer`
  - Class: `diagram-node has-child-layer`
  - Subtle visual badge or subtext in the block header: `«block» ⤓ [IBD]`
  - Tooltip: `title="Double-click to open IBD (${block.name})"`
  - Event handler: `ondblclick="window.ADIA_DIAGRAM_NAV?.drillDown('${containerId}', 'ibd-${block.id}', 'IBD · ${escapeHtml(block.name)}')"`.

### 2.2 Interactive Multi-Layer Container
- The generated report packages root diagrams and their nested drill-down layers into an interactive container:
  - Header toolbar with:
    - `⬅ Back` button (visible when drilled down)
    - Breadcrumb trail (e.g. `BDD Overview / IBD · ThermalSystem / Internal Sub-Structure · Controller`)
    - Zoom/Pan controls (`➕ Zoom`, `➖ Zoom`, `↺ Reset`)
  - Container body containing:
    - Root BDD layer view (`<div id="layer-bdd-root" class="diagram-layer-view active">...</div>`)
    - Context IBD layer views (`<div id="layer-ibd-${blockId}" class="diagram-layer-view" style="display:none">...</div>`) for each block with parts.
  - Client navigation runtime (`generateDiagramScript`) manages history stack, breadcrumb updates, and smooth layer transitions.

### 2.3 Standalone & Preview Compatibility
- Renders valid SVG and standard HTML/JavaScript.
- Works in:
  1. Desktop App Report Preview Modal.
  2. Exported standalone `.html` report files.

---

## 3. Architecture & Interface Changes

### 3.1 `ReportBlockSource` Extension
Extend `ReportBlockSource` or add optional hierarchy context:
```typescript
export interface ReportBlockSource {
  blocks: readonly BlockData[];
  relationships: readonly RelationshipData[];
  parts?: readonly PartData[];
  containerId?: string;
}
```

### 3.2 `drawLabeledNode` Interactive Options
Support optional node interactivity options:
```typescript
export interface LabeledNodeOptions {
  stroke?: string;
  isInteractive?: boolean;
  childLayerId?: string;
  childLayerTitle?: string;
  containerId?: string;
}
```
When `isInteractive` is true and `childLayerId` is present, `drawLabeledNode` wraps the `<rect>` and text in:
```html
<g class="diagram-node has-child-layer" data-node-id="${node.id}" style="cursor: pointer" ondblclick="window.ADIA_DIAGRAM_NAV?.drillDown('${containerId}', '${childLayerId}', '${childLayerTitle}')">
  <!-- rect and text elements -->
</g>
```

### 3.3 `renderInteractiveDiagramHierarchy` Function
Add a high-level renderer in `reportHierarchyEngine.ts`:
```typescript
export function renderInteractiveDiagramHierarchy(
  model: HierarchySourceModel,
  options?: { containerId?: string; title?: string }
): string;
```
This builds the `ReportHierarchyRegistry`, renders the root BDD diagram, renders each child IBD and State Machine layer, and wraps them in the interactive container with navigation script.

---

## 4. Test & Verification Plan

1. **BDD Node Interactivity Tests** (`reportDiagrams.sysml.test.ts`):
   - Verify BDD blocks with associated parts render `has-child-layer`, `cursor: pointer`, and `ondblclick`.
   - Verify BDD blocks without parts render standard static node groups.

2. **Interactive Hierarchy Container Tests** (`reportHierarchyEngine.test.ts`):
   - Verify `renderInteractiveDiagramHierarchy` outputs root BDD, all child IBD layer containers (`layer-ibd-*`), breadcrumbs container (`bc-*`), and navigation script.
   - Verify navigation between root BDD $\rightarrow$ IBD context $\rightarrow$ Sub-IBD.

3. **Full Suite Regression & Typecheck**:
   - Run `npx vitest run src/features/reporting/`
   - Run `npx tsc --noEmit`
