# Professional Report Diagram Rendering Design

**Date:** 2026-08-14

**Status:** Approved for implementation planning

**Scope:** Generated engineering report diagrams only: requirements, BDD, IBD, state machine, X-Bridges, and HMI diagrams

## 1. Objective

Ensure every diagram embedded in the ADIA generated report is well visualized, professional, and free of overlapping nodes or crossing edges. Diagrams must remain readable in print and on screen, must not mutate the authoritative project model, and must degrade gracefully when project data is missing or too dense.

This work is a focused subset of the approved `2026-08-09-professional-report-reactive-hmi-design.md` and implements the diagram readability policy defined there.

## 2. Selected Direction

Use an **SVG-native auto-layout renderer** implemented in TypeScript.

Rationale:

- No new runtime dependencies are required.
- Output is deterministic and self-contained, so the report works offline and in print.
- The renderer can apply layout algorithms tuned to each diagram type instead of relying on the interactive canvas positions.
- Print-safe styling is easier to guarantee when the report controls the SVG directly.

Rejected alternatives:

- Exporting the in-app ReactFlow canvas: couples report generation to a live browser render context and does not guarantee intersection-free layouts.
- Server-side graph layout libraries (`dagre`, ELK): add runtime dependencies and contradict the existing no-new-dependency constraint.

## 3. Scope and Boundaries

### 3.1 In scope

- SVG rendering of the following generated-report figures:
  - Requirements diagram (requirements + relationships)
  - Block Definition Diagram (BDD)
  - Internal Block Diagram (IBD)
  - State-machine diagrams (one figure per layer/region, including hierarchy)
  - X-Bridges control-model diagram
  - HMI component layout diagram
- Deterministic auto-layout and edge routing to avoid overlapping nodes and crossing edges.
- Splitting oversized diagrams into multiple captioned views.
- Print-safe styling, legends, captions, and label escaping.
- Independent display coordinates that do not mutate project data.

### 3.2 Out of scope

- Changing the in-app diagram editors or ReactFlow canvases.
- Changing report metadata, charts, or the reactive HMI workspace.
- Adding new runtime dependencies.
- Changing the report HTML composer beyond consuming the new diagram renderers.

## 4. Module Structure

Create a single module `src/features/reporting/reportDiagrams.ts` with one public renderer per diagram type:

```ts
export function renderRequirementsDiagram(source: ReportRequirementSource): string;
export function renderBddDiagram(source: ReportBlockSource): string;
export function renderIbdDiagram(source: ReportIbdSource): string;
export function renderStateMachineDiagrams(source: ReportStateMachineSource): string[];
export function renderXbridgesDiagram(source: ReportXBridgesSource): string;
export function renderHmiDiagram(source: ReportHmiSource): string;
```

Each renderer returns a self-contained `<figure>` fragment containing an inline SVG and a caption.

Internal helpers should be pure and separately testable:

- Layout computation per diagram type.
- Edge routing with obstacle avoidance.
- Bounding-box and label-measurement utilities.
- Splitting helpers for large diagrams.

## 5. Layout Algorithms

### 5.1 BDD, requirements, and X-Bridges

Use a hierarchical grid layout:

1. Compute dependency levels by longest path from a root.
2. Assign nodes to columns by level.
3. Order nodes within each column to minimize edge crossings using a median heuristic.
4. Size each node from its wrapped label.
5. Draw edges as cubic Bézier curves or right-angle polylines that route between node rows without passing through nodes.

### 5.2 IBD

Use a port-aware grid layout:

1. Place parts on a regular grid inside the owning block frame.
2. Snap ports to part edges.
3. Route connectors as orthogonal Manhattan lines with up to three segments.
4. Offset parallel connectors by index to avoid overlap.

### 5.3 State machine

Use a layered layout per region:

1. Determine initial states and compute rank by path depth.
2. Render parent states as rounded containers and nest child states inside them.
3. Render junctions as diamonds and history states as small labeled circles.
4. Draw transitions as curved paths with optional labels for guards/actions.
5. Split regions into separate figures when a region has more than the configured node cap.

### 5.4 HMI diagram

- Preserve component positions when available and scale them to fit a fixed viewBox.
- Fall back to a deterministic grid if positions are missing or overlapping.

## 6. Intersection Avoidance

- Every node has a computed bounding box including padding.
- Edge routing receives obstacle rectangles and adds vertical or horizontal detours as needed.
- Self-loops and parallel edges are offset so they do not coincide.
- Labels are placed along edges with a small halo or margin.
- If a layout cannot resolve overlaps for a dense diagram, the diagram is split instead of shrinking text below readable size.

## 7. Large-Diagram Splitting

- Default node cap per figure: 20 (configurable constant).
- Split state machines by region or layer first, then by connected components.
- Split BDD/IBD by semantic grouping or by stable range chunks with continuation captions.
- Each split view receives a caption such as:
  `Figure 4-a · State machine · Root region (8 states, 12 transitions)`

## 8. Styling and Print Safety

- Professional muted palette: navy nodes, cyan accents, amber for warnings, gray edges.
- Crisp 1px strokes and readable sans-serif font; minimum effective text size 10px.
- Avoid color-only meaning; use line styles and shapes.
- Consistent figure caption styling.
- All user-facing text HTML-escaped.

## 9. Error Handling and Fallbacks

- Missing or empty diagram data renders a formal `No data available` figure with a caption.
- Invalid or non-numeric coordinates are replaced with deterministic fallback positions.
- Broken references are excluded from the diagram and counted in the report warning summary.
- Renderer exceptions are caught by the composer and rendered as an unavailable-evidence note, never as silent failure.

## 10. Testing Strategy

- Unit tests for layout helpers: ranking, crossing reduction, obstacle-aware routing, bounding boxes.
- Renderer tests asserting expected elements, captions, split view markers, and absence of raw `<script>` tags.
- Fixture-based tests for each diagram type using representative project data.
- Integration test confirming the report composer embeds the generated figures and that print CSS rules are present.

## 11. Acceptance Criteria

1. Every supported report diagram renders as a self-contained SVG figure with a caption.
2. Nodes and edges do not overlap in representative fixtures.
3. Large diagrams split into readable, captioned views.
4. Diagrams remain readable in print without losing labels, legends, or captions.
5. No new runtime dependencies are introduced.
6. Existing project data is not mutated by rendering.
