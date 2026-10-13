# System Report — professional SysML document (plan)

Planner/reviewer: Opus (main session). Executor: Sonnet subagent, one WP at a time.
Branch `co-work`. **Do not commit** (other sessions stage-everything on this branch; `App.tsx` and
`package.json` hold the user's uncommitted work). Never edit `.adia` files. Never weaken existing tests.

## 0. User mandate (2026-10-08)
"Review the report generation and make sure that ALL the SysML diagrams are added with respect to
its connections and layers and as a professional layout, and the TRM [= Requirements Traceability
Matrix, `src/engine/sysml/rtm.ts`] is added. Make it a professional system file."

## 1. Review findings (baseline: `vitest run src/features/reporting` = 21 files / 84 tests green)
Live path: `handleGenerateReport` in `src/App.tsx` (~L12374–15041), HTML shown via `setGlobalReportData`.
- F1 Missing diagram kinds: package, useCase, activity, sequence, parametric (all present in `SysmlRepository`).
- F2 Layers: nested IBD / sub-state-machine layers live in one JS drill-down card
  (`renderInteractiveDiagramHierarchy`), not as numbered printable sections.
- F3 BDD rendered twice (§2 and root of §3 card).
- F4 Connections silently dropped (IBD connectors outside context, SM transitions crossing layer/chunk,
  cross-page BDD edges). No per-figure accounting.
- F5 Layout: `layoutLayered` is LR BFS, stacks siblings vertically; no TB SysML convention, no crossing
  reduction; IBD ports placed by index parity, not direction.
- F6 RTM: thin 7-column table; no satisfy/verify/derive/refine columns, no requirement×element grid,
  no coverage breakdown.
- F7 No cover / document control / TOC / figure+table numbering / print page setup. ~740 lines of dead
  code in App.tsx (`renderDiagramSVG`, `autoLayoutForReport`); `generateArchitectureReport.ts` unused duplicate.

## 2. Contracts (fixed — both WPs code against these)

### 2.1 Connection accounting (WP-R1)
Every diagram renderer that returns a figure must make dropped connections visible:
```ts
// reportDiagramModel.ts
export interface FigureAccounting { drawnNodes: number; drawnEdges: number; omitted: { id: string; reason: string }[] }
```
`wrapFigure(inner, caption, viewBox, accounting?)` — when `accounting.omitted.length > 0` the figure gets a
`<p class="report-figure-omitted">` note listing "N connection(s) not drawn in this view: <reason>…"
(names, never raw ids), and a `data-drawn-edges` / `data-omitted-edges` attribute on `<figure>` so tests can assert.
Rule: **model connections in scope = drawnEdges + omitted.length**, for every figure.

### 2.2 New renderers (WP-R1) — new file `src/features/reporting/reportDiagrams.sysml.ts`
All take the canonical `SysmlRepository` (`src/engine/sysml/model.ts`) and return `string[]` (one HTML
figure per diagram/page; `[]` when nothing to draw):
```ts
renderPackageDiagrams(repo): string[]      // package tree (ownerId), packageImport/elementImport/packageMerge, element counts per package
renderUseCaseDiagrams(repo): string[]      // one per subject (+ one for unassigned): subject boundary rect, actors outside (stick figure), use cases (ellipses) inside; useCaseAssociation, include, extend (with extension point), useCaseGeneralization
renderActivityDiagrams(repo): string[]     // one per ActivityDefinition: swimlanes (partitions), initial/final/flowFinal/decision/merge/fork/join notation, pins, controlFlow solid / objectFlow dashed, guards [..]
renderSequenceDiagrams(repo): string[]     // one per InteractionDefinition: lifelines (header box + dashed line), messages in `order` with sort-specific arrowheads (synch filled, asynch open, reply dashed, create/delete), combined fragments frames with operator tag + operand guards, ref uses, state invariants, time/duration constraints
renderParametricDiagrams(repo): string[]   // one per block owning constraint properties or binding connectors: constraint properties as rounded rects with parameter squares + expression, value properties as rects, binding connectors (ParametricEnd) as solid lines
```
Notation must match the app's own canvases — read the matching components under `src/components/sysml/`
(and any `*Canvas*`/`*Diagram*` for activity/sequence/useCase/parametric) before drawing.

### 2.3 Layout (WP-R1) — `reportDiagramLayout.ts`
`layoutLayered(nodes, edges, { direction?: 'TB' | 'LR', rootIds?, hGap?, vGap?, maxRowWidth? })`
- default `'LR'` keeps existing callers/tests unchanged; BDD, requirements, package, use-case use `'TB'`.
- Longest-path ranking with cycle breaking (DFS back-edges reversed) instead of the BFS revisit loop.
- ≥4 barycentre sweeps (down+up) for crossing reduction; then centre each rank.
- TB wraps a rank that exceeds `maxRowWidth` (default `MAX_FIGURE_WIDTH`) onto extra sub-rows.
- `routeEdgePath` gains TB routing (bottom-centre → top-centre, orthogonal with rounded elbows) and port-side
  awareness; parallel edges between the same pair are offset.
- BDD hierarchy direction: supertype above subtype (generalization), whole above part (composition/aggregation).
  Verify the model's source/target convention for these kinds from the canvas code before choosing edge orientation for ranking.
- IBD: ports placed on the side facing their connector peer (or by `direction`: in → left, out → right, inout → by peer);
  no two ports overlap; parts laid out by connectivity (layered LR) rather than plain grid when connectors exist.

### 2.4 Fixes to existing renderers (WP-R1)
- `renderIbdDiagram`, `renderStateMachineDiagrams`, `renderBddDiagram`, `renderRequirementsDiagram`: adopt 2.1 accounting.
  SM: transitions whose other end is outside the layer/chunk are drawn to a labelled stub ("→ <State> (layer X)") rather than dropped.
- Keep every existing exported signature backward compatible (existing 84 tests must stay green unmodified,
  except assertions that encode a now-fixed defect — list each such change in the report with justification).

### 2.5 Document builder (WP-R2) — new folder `src/features/reporting/systemReport/`
```ts
export interface SystemReportInput {
  projectName: string; author: string; engineVersion: string; generatedAt: Date;
  repository: SysmlRepository;            // canonical
  hierarchy: HierarchySourceModel;         // legacy projection (blocks/parts/connectors/relationships + SM)
  diagnostics?: ReportModelDiagnostics; revision?: string;
  traceability: { matrix: TraceabilityMatrix; metrics: CoverageMetrics; modelHash?: string; repositoryRevision?: number; diagnostics?: { code: string; message: string }[] };
  extraSections?: { id: string; title: string; html: string }[];   // App-supplied (SM analysis, scenarios, HMI, prototype)
}
export function buildSystemReport(input: SystemReportInput): string  // full <!DOCTYPE html> document
```
Structure (numbered headings, auto TOC with anchors, Figure N / Table N numbering + list of figures/tables):
Cover page (title, "System Architecture & Design Report", doc id `<project>-SAD-<rev>`, revision, date, author, engine, classification)
→ Document control (revision history row, approval block: Prepared/Reviewed/Approved with blank signature lines)
→ TOC → 1 Introduction (purpose, scope, model summary table with counts per element kind, consistency summary)
→ 2 Package structure → 3 Requirements (diagram + hierarchical table) → 4 Use cases
→ 5 Structure: 5.1 BDD, 5.2 Internal structure — **one numbered subsection per IBD layer, nested to mirror
  the part hierarchy (5.2.1 Vehicle, 5.2.1.1 Vehicle › Powertrain …)** with breadcrumb path line, part table and
  connector table (source part.port → target part.port, item flow) under each figure
→ 6 Parametrics → 7 Behaviour: 7.1 Activities, 7.2 Sequences, 7.3 State machines — **one subsection per layer,
  nested by parentStateId**, with state/transition tables
→ 8 Requirements Traceability Matrix (see 2.6) → extraSections (numbered in order) → Appendix A Diagnostics, Appendix B Glossary of SysML notation.
Every BDD/IBD node that has a child layer links (`<a href="#sec-…">`) to that layer's subsection; no JS needed for navigation.
Print CSS: `@page { size: A4; margin: 18mm 15mm 20mm }`, cover on its own page, `h2` page-break-before, figures/table rows
avoid breaks, running footer via `@page` margin boxes where supported plus a fixed print footer fallback. Professional palette:
navy `#0b3445` headings, neutral greys, orange only as accent. Empty sections render "Not modelled in this project." (still numbered → reviewer sees completeness).

### 2.6 RTM section (WP-R2) — `systemReport/rtmSection.ts`
- Coverage summary cards (total, satisfied %, verified %, failed, suspect, orphan, unresolved) + status legend.
- Full table: Req ID | Name/Text | Risk/Priority | Status badge | Derived from / Contains | Satisfied by | Refined by | Verified by (case + evidence result) | Traced | Change.
- Requirement × design element grid (rows = requirements, columns = blocks/parts/activities/use cases that appear in any trace),
  cell glyphs: S satisfy, V verify, R refine, D derive, T trace; paginated at ≤12 columns per table.
- Uses `sysmlObjectLabel` / `resolveSysmlReferenceLabel` for names; never print raw ids.

### 2.7 App wiring (WP-R2)
`handleGenerateReport` builds `SystemReportInput` and calls `buildSystemReport`; SM analysis (4.0–4.3), scenarios
(`renderScenariosSection`), HMI and interactive prototype become `extraSections` (move their HTML generation into
`systemReport/*.ts` helpers where it is pure; the prototype may stay in App if it depends on runtime state).
Delete dead `renderDiagramSVG`/`autoLayoutForReport`. `generateArchitectureReport` delegates to `buildSystemReport`
(keep its export). `setGlobalReportData({ html, projectName })` unchanged.

## 3. Work packages
| WP | Scope | Executor | Status |
|----|-------|----------|--------|
| R1 | 2.1–2.4 renderers, layout, accounting + tests | Sonnet | done — Opus-reviewed 2026-10-08 (23 files/130 tests, tsc clean). Carry to R3: long TB/IBD edges can pass behind nodes (no dummy nodes); SM stub lines can cross nodes; use-case cross-page edges drawn twice. |
| R2 | 2.5–2.7 document builder, RTM, App wiring + tests | Sonnet | done — Opus-reviewed 2026-10-08 (26 files/169 tests, tsc clean, App.tsx diff confined to report region + imports; sample rendered & inspected) |
| R3 | Opus visual-review fixes: SM back-edge clipped + labels clipped/overlapping; RTM "Satisfied" % uses covered status (should use satisfactionStatus); grid D glyph under wrong column (verify); sequence figure empty band; IBD rotated item-flow label + boundary port labels overlapping parts; R1 carry-overs | Sonnet | done — Opus-reviewed 2026-10-08 (27 files/190 tests, tsc clean, geometry checker over every figure of the full report; screenshots re-inspected). Open: traceability/X-Bridges diagrams (not in system report) keep old routing; SM composite-container edges lack collision guarantee; executor collided with a concurrent HMI session in reportDiagrams.ts and rebuilt `renderHmiDiagram` — HMI suite (85 tests) green, owner should re-check. |

Acceptance (each WP): `npx vitest run src/features/reporting src/engine/sysml/reportWorker.test.ts` green;
`npx tsc --noEmit -p .` introduces no new errors in touched files; new tests cover every new renderer with a
fixture that has ≥1 of every element/edge kind and assert accounting (drawn + omitted == in scope) and no node overlap.
