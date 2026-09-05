# OPM Module UI Redesign — Dockable Studio + Bold Blocks + Guided Links

Date: 2026-09-05
Scope: `src/components/entropy/` (EntropyWorkspace, OPMNodeComponents, OPMEdgeComponents, ports/links) + `src/engine/opm` validation reuse. No engine semantics change.
Approved approach: A. Dockable Studio.

## 1. Problem
- Pages confusing: floating Inspector overlaps canvas; right tabs Sim/OPL/Smart Show/OPM Build compete; bottom console always takes 160px; top bar crowded (breadcrumbs + example loader + sim controls + layout buttons).
- Blocks unclear: dark low-contrast cards, small type tags, state slot invisible.
- Ports unclear: 10px dots, label only on hover, hard to hit, no count.
- Links unclear: 12 types distinguished only by thin color; smooth-step path; selected badge is small dropdown; invalid drop gives only console log.

## 2. Pages — Dockable Studio Layout
- Top PageBar (h-12): Back | Page segmented control Model / Simulate / Review | breadcrumb of zoomPath | example loader | sim Run/Pause/Step/Reset + tick badge | undo/redo + layout menu | dock toggles.
  - Model page: left+center+right docks, bottom dock collapsed to 32px strip.
  - Simulate page: right dock forced to Sim tab, bottom console expanded, canvas gets live badge + firing pulse.
  - Review page: center canvas + bottom OPL + right Build tab; diagnostics badge prominent.
- Left dock (w-60, collapsible): Tools section (Select/Object/Process/State/Requirement as large buttons with testids `opm-tool-*` preserved) + Link Mode composer (link-type select `opm-link-mode-select` preserved, grouped Procedural/Structural/Traceability + one-line hint of allowed direction) + Outline (objects/processes counts, click to select, zoom-path list).
- Center: canvas only. ReactFlow `fitView`, dark grid. Legend bottom-left, diagnostics badge top-center, nav fallback toast preserved (`diagnostic-nav-fallback`).
- Right dock (w-80, collapsible, tabs Inspector | Ports | Link): Inspector = current Element Inspector (name `opm-node-name-input`, type convert `opm-convert-node-type`, physical, states, attributes, zoom, delete — all testids preserved); Ports tab = full Ports Manager (counts, add form); Link tab = selected edge inspector (`opm-convert-edge-type` preserved) + incoming/outgoing list.
- Bottom dock (h-48, collapsible, split): left Simulation Console (existing log colors, Clear), right OPL mini-editor (read-only in Model/Simulate, editable in Review; Sync/Cancel preserved). Resize handle, persisted heights.
- Dock state: `localStorage opm.docks.v1 {left,right,bottom,page,rightTab}`. No ReactFlow node/edge schema change. All existing `data-testid` kept: `opm-toolbar-tick-slider`, `opm-sim-*`, `opm-sim-config-*`, `opm-close-*-inspector`, `diagnostic-nav-fallback`.

## 3. Blocks — Bold Color-Coded
- Object (emerald): solid emerald-950 header bar with «Object» + icon + physical badge; body `#0a1810` with 2px emerald-500 border (physical = 3px + “Physical” chip); name 13px bold white centered; states strip always visible (dashed placeholder “+ State” when empty); attributes mono list; selected = amber glow ring (`shadow-[0_0_25px_rgba(251,191,36,0.65)]` + `ring-1 ring-amber-300/40`); min 240x110 with states, 220x80 without; NodeResizer only when selected.
- Process (sky): solid sky ellipse, header «Process» 8px black on sky-300 chip; name 13px bold; in/out mini-chips inside when zoomed; firing = orange pulse + scale-105; selected = amber ring; min 220x90.
- State (amber): pill 110x36, inactive = amber-950 bg + amber-200 text + border; active = solid `from-orange-500 to-amber-500` black bold text + glow; initial = filled dot prefix + “Init” chip in inspector; selected = amber ring + scale-105.
- Requirement (purple): card with «Requirement» header, italic statement body inside, satisfies/verifies outgoing hint; selected = amber ring.
- A11y: all tool buttons keep aria-labels; Escape clears selection (existing); focus-visible rings preserved; status never color-only (text labels Active/Firing/Init kept).

## 4. Ports — Always-Labeled
- Render as pill: 8px color dot (existing `getHandleColor` map preserved) + 10px mono uppercase name, `bg-black/85 border white/10`, positioned on edge boundary (rect for Object/State, ellipse-projected for Process — existing math reused).
- Always visible (not hover-only); hover raises z + amber border; 14px invisible hit halo around 10px Handle; `crosshair` cursor.
- Grouping: left/top = inputs, right/bottom = outputs; overflow (>4 per side) collapses to “+N” popover listing rest.
- Inspector Ports tab: counts (`N Ports`), per-port rows with side letter + type chip + delete; Add form (label + In/Out + side + role) preserved, Add button validates non-empty name, duplicate name rejected with inline error.
- No port-model change: `OPMPort {id,name,type,direction,position}` unchanged; `updateNodeInternals` on count change preserved.

## 5. Links — Guided Composer + Type Chips
- Path: bezier (replace `getSmoothStepPath` with `getBezierPath`), 2px base (`#52525b` idle), type color when `isActiveFlow` or selected (existing `LINK_STYLES` colors preserved); dashed for trigger/condition/satisfies/verifies; effect = double arrowheads; structural = source glyph (triangle-filled/hollow, circle-filled) + 1.5px line; active flow = animated white particle (`animateMotion`, existing).
- Midpoint chip: always rendered via EdgeLabelRenderer — icon (`LINK_ICONS`) + label (`LINK_LABELS`) + role color border; click selects edge; selected expands to type `<select>` + delete (existing behavior, restyled larger 12px).
- Creation: Link Mode select sets `activeLinkType`; drag shows `OPMConnectionLine` golden preview + valid targets glow (query `validateOpmPortConnection` per candidate handle on drag move); invalid drop = red shake on cursor + toast with `verdict.reason` + `onAddError('error', ...)` + console error (existing `onConnect` gate reused, no rule change in `OpmLinkRules`/`OpmPortContracts`).
- Edge id format unchanged (`e-src-handle-tgt-handle`); `edge.type='opmEdge'`, `data.type/data.linkType` preserved; `onTypeChange/onDelete` callbacks preserved.

## 6. Architecture / Files
- New: `src/components/entropy/OpmDockShell.tsx` (PageBar + left/right/bottom docks + persistence + page switching).
- Refactor (visual only): `EntropyWorkspace.tsx` → host docks, keep all state/handlers (`saveHistory`, `onConnect`, `isValidConnection`, sim, OPL, zoom) unchanged; `OPMNodeComponents.tsx` → bold card renderers (same props, same ports math); `OPMEdgeComponents.tsx` → bezier + chip (same `LINK_STYLES/LABELS/ICONS`); `OpmLegend.tsx` → updated swatches.
- No changes: `EntropyTypes.ts`, `editorBoundaryTypes.ts`, `OpmLinkRules.ts`, `OpmPortContracts.ts`, `OpmSimulationEngine.ts`, `OplParser.ts`, pipeline/codegen.

## 7. Data flow
Canvas drag → `validateOpmPortConnection(nodes,edges,connection,activeLinkType)` → valid ? `addEdge` + log : toast + `onAddError`. Port add/remove → `setNodes` + `updateNodeInternals` + history. Dock toggles → localStorage only. Page switch → dock preset + rightTab, no model mutation.

## 8. Error handling
Duplicate link / self-link / direction violation → inline toast with rule reason (from existing verdicts), no edge created, history untouched. Duplicate port name → inline form error. Diagnostic navigate missing control → existing fallback toast preserved. OPL parse errors → existing syntax drawer.

## 9. Testing
- Keep green: `npm run test:opm` (engine + `src/components/entropy/__tests__`), existing testids/assertions unchanged.
- New tests: `opmDockShell.test.tsx` (page presets, dock collapse persistence, testids present); `opmBlocksVisual.test.tsx` (selected-ring classes, active-state fill, requirement body); `opmPortsLinks.test.tsx` (pill labels rendered, chip per link type, bezier path used, invalid drop calls onAddError with reason).
- Manual: load smartHome example, drag each of 12 link types, toggle docks, switch Model/Simulate/Review, resize bottom dock, reload (docks persist).

## 10. Out of scope
Light theme, engine/sim semantics, OPL grammar, codegen artifacts, SysML importer changes, minimap/controls redesign.
