# Report Generation — Interactive Diagrams, Connection Routing & Multi-Layer Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full SysML relationship and connector rendering across BDD/IBD report diagrams, along with an interactive multi-layer drill-down engine that allows double-clicking any block, part, or state to navigate to its nested layer with breadcrumbs, zoom/pan, and offline HTML export support.

**Architecture:** A unified SVG diagram rendering and layout pipeline with accurate markers (composition, generalization, aggregation, dependencies, item flows) and an embedded hierarchy navigator in the report that renders breadcrumbs and switches active diagram layers upon double-clicking nodes.

**Tech Stack:** TypeScript, React, SVG/DOM APIs, Vitest, DOMPurify.

## Global Constraints

- Preserve all existing report export formats (Word, PDF, standalone HTML).
- Ensure BDD relationship lines and IBD connectors are never missing, dropped, or unrouted.
- Double-clicking any element with a child layer (BDD Block $\rightarrow$ IBD, IBD Part $\rightarrow$ Sub-IBD, State $\rightarrow$ Sub-State) must switch the diagram in-place with breadcrumbs.
- Pure client-side JavaScript in exported HTML without external CDN dependencies.

---

### Task 1: BDD Relationship Routing & Markers in Report Generator

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts`
- Modify: `src/App.tsx` (around lines 11660-11755)
- Test: `src/features/reporting/reportDiagrams.sysml.test.ts`

**Interfaces:**
- Consumes: `ReportBlockSource` (`blocks: BlockData[]`, `relationships: RelationshipData[]`).
- Produces: SVG strings with properly attributed markers (`rf-diamond-filled`, `rf-diamond-hollow`, `rf-triangle-hollow`, `rf-arrow`), dashed strokes for dependency/trace/satisfy, multiplicity labels, and orthogonal/S-curve routing.

- [ ] **Step 1: Write failing tests for BDD markers and relationships**

In `src/features/reporting/reportDiagrams.sysml.test.ts`:
```ts
it('renders all BDD relationship markers and multiplicity labels correctly', () => {
  const blocks = [
    { id: 'b1', name: 'Engine', stereotype: 'block', properties: [], operations: [], ports: [] } as any,
    { id: 'b2', name: 'Piston', stereotype: 'block', properties: [], operations: [], ports: [] } as any,
    { id: 'b3', name: 'Valve', stereotype: 'block', properties: [], operations: [], ports: [] } as any,
  ];
  const rels = [
    { id: 'r1', sourceId: 'b1', targetId: 'b2', type: 'composition', sourceMultiplicity: '1', targetMultiplicity: '4' } as any,
    { id: 'r2', sourceId: 'b1', targetId: 'b3', type: 'aggregation', sourceMultiplicity: '1', targetMultiplicity: '16' } as any,
    { id: 'r3', sourceId: 'b2', targetId: 'b1', type: 'generalization' } as any,
  ];
  const html = renderBddDiagram({ blocks, relationships: rels });
  expect(html).toContain('marker-start="url(#rf-diamond-filled)"');
  expect(html).toContain('marker-start="url(#rf-diamond-hollow)"');
  expect(html).toContain('marker-end="url(#rf-triangle-hollow)"');
  expect(html).toContain('1');
  expect(html).toContain('4');
  expect(html).toContain('16');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: FAIL (missing markers or multiplicity format expectations).

- [ ] **Step 3: Implement BDD relationship routing and markers**

In `src/features/reporting/reportDiagrams.ts` and `src/App.tsx`:
- Fix marker associations for `composition`, `aggregation`, `generalization`, and stereotypes for `derive`, `satisfy`, `verify`, `trace`, `allocation`.
- Ensure multiplicity labels are calculated with non-overlapping offsets.
- Ensure S-curve and orthogonal edge routing connects source boundary to target boundary cleanly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts`
Expected: PASS

- [ ] **Step 5: Verify all SysML diagram tests pass**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts src/features/reporting/reportDiagrams.ibd.test.ts`
Expected: PASS

---

### Task 2: IBD Connector Manhattan Routing & Environment Port Connections

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts`
- Modify: `src/App.tsx` (around lines 11400-11650)
- Test: `src/features/reporting/reportDiagrams.ibd.test.ts`

**Interfaces:**
- Consumes: `ReportIbdSource` (`contextBlock: BlockData`, `parts: PartData[]`, `connectors: ConnectorData[]`, `blocks: BlockData[]`).
- Produces: IBD diagram SVG with boundary frame, boundary ports, part ports, Manhattan routed connectors with item flow labels.

- [ ] **Step 1: Write failing tests for IBD connector routing and context boundary ports**

In `src/features/reporting/reportDiagrams.ibd.test.ts`:
```ts
it('renders boundary environment ports and connects them to internal parts', () => {
  const contextBlock = {
    id: 'sys', name: 'ThermalSystem', stereotype: 'block',
    ports: [{ id: 'p-env', name: 'powerIn', type: 'Real', direction: 'in' }],
  } as any;
  const blocks = [
    contextBlock,
    { id: 'ctrl', name: 'Controller', ports: [{ id: 'p1', name: 'vin' }] } as any,
  ];
  const parts = [{ id: 'part1', name: 'ctrlPart', blockId: 'sys', typeId: 'ctrl' }] as any;
  const connectors = [
    { id: 'c-env', sourcePartId: undefined, sourcePortId: 'p-env', targetPartId: 'part1', targetPortId: 'p1', itemFlow: 'PowerBus' } as any,
  ];
  const html = renderIbdDiagram({ contextBlock, parts, connectors, blocks });
  expect(html).toContain('powerIn');
  expect(html).toContain('PowerBus');
  expect(html).toContain('ibd [Block] ThermalSystem');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDiagrams.ibd.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement boundary ports and connector Manhattan routing in IBD**

In `src/features/reporting/reportDiagrams.ts` and `src/App.tsx`:
- Render boundary ports on the outer IBD frame (`top`, `bottom`, `left`, `right` placement).
- Calculate Manhattan orthogonal lines connecting boundary ports $\leftrightarrow$ part ports, and part ports $\leftrightarrow$ part ports.
- Center item flow badge pills (`«ItemFlow»`) on connector paths.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDiagrams.ibd.test.ts`
Expected: PASS

---

### Task 3: Multi-Layer Hierarchy Resolver & Interactive Diagram Navigation Engine

**Files:**
- Create: `src/features/reporting/reportHierarchyEngine.ts`
- Create: `src/features/reporting/reportHierarchyEngine.test.ts`
- Modify: `src/features/reporting/index.ts`

**Interfaces:**
- Consumes: Project model (`blocks`, `parts`, `connectors`, `relationships`, `states`, `layers`, `transitions`, `junctions`).
- Produces:
  - `buildReportHierarchy(model)`: Builds layer registry mapping each block ID to its IBD layer, each part ID to its sub-IBD layer, each state to its sub-state layer.
  - `generateInteractiveDiagramHtml(options)`: Generates client-side interactive SVG wrapper with breadcrumbs, double-click layer switcher, zoom & pan engine.

- [ ] **Step 1: Write failing test for hierarchy resolution and diagram layer switching**

In `src/features/reporting/reportHierarchyEngine.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildReportHierarchy } from './reportHierarchyEngine';

describe('buildReportHierarchy', () => {
  it('resolves BDD block to IBD layer and Part to Sub-IBD layer', () => {
    const blocks = [
      { id: 'b-sys', name: 'ThermalSystem', stereotype: 'block' },
      { id: 'b-ctrl', name: 'Controller', stereotype: 'block' },
      { id: 'b-sensor', name: 'SensorUnit', stereotype: 'block' },
    ] as any;
    const parts = [
      { id: 'p1', name: 'controller', blockId: 'b-sys', typeId: 'b-ctrl' },
      { id: 'p2', name: 'sensor', blockId: 'b-ctrl', typeId: 'b-sensor' },
    ] as any;
    const hierarchy = buildReportHierarchy({ blocks, parts, connectors: [], relationships: [], states: [], layers: [], transitions: [], junctions: [] });
    
    expect(hierarchy.hasLayer('b-sys')).toBe(true);
    expect(hierarchy.getLayerType('b-sys')).toBe('ibd');
    expect(hierarchy.hasLayer('p1')).toBe(true);
    expect(hierarchy.getLayerType('p1')).toBe('ibd');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportHierarchyEngine.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `reportHierarchyEngine.ts`**

- Build registry of all drillable layers across BDD, IBD, State Machine, and Requirements.
- Generate client-side JS navigation script for handling double-clicks, breadcrumb trails, zoom, pan, and layer rendering.
- Export `buildReportHierarchy` from `src/features/reporting/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportHierarchyEngine.test.ts`
Expected: PASS

---

### Task 4: Integrate Interactive Diagrams & Sandbox into Report Generator and Modal

**Files:**
- Modify: `src/App.tsx` (`handleGenerateReport`, `GlobalReportPreviewModal`)
- Modify: `src/components/reporting/ReportViewerModal.tsx`

**Interfaces:**
- Consumes: `buildReportHierarchy` and interactive SVG renderer.
- Produces: Report preview with working double-click drill-down in modal and exported HTML.

- [ ] **Step 1: Write integration tests for Report Viewer modal with interactive diagrams**

In `src/components/reporting/ReportViewerModal.test.tsx`:
```ts
it('renders report modal with interactive diagrams', () => {
  // Test modal mounting and iframe/sandboxed rendering
});
```

- [ ] **Step 2: Run test to verify it passes/fails**

Run: `npx vitest run src/components/reporting/ReportViewerModal.test.tsx`

- [ ] **Step 3: Update `handleGenerateReport` and `GlobalReportPreviewModal` in `App.tsx`**

- Connect `renderDiagramSVG` with double-click drill-down (`ondblclick="window.ADIA_DIAGRAMS.drillDown(this)"`).
- Add breadcrumb bar and back button above each diagram card.
- In `GlobalReportPreviewModal`, render the report inside an interactive iframe with `srcdoc` so interactive scripts (double-click, zoom, pan, breadcrumb navigation) execute without DOMPurify stripping event handlers.
- Add CSS cursor cues (`cursor: pointer`, hover glow, `⧉ Drill-down available` badges).

- [ ] **Step 4: Run all reporting tests**

Run: `npx vitest run src/features/reporting/`
Expected: PASS

---

### Task 5: End-to-End Verification & Walkthrough

**Files:**
- Verify: Full report generation workflow in browser.
- Verify: BDD connections, IBD connections, double-click drill-down on Blocks $\rightarrow$ IBD $\rightarrow$ Sub-IBD $\rightarrow$ State Machine.
- Verify: Export to HTML file opens and functions offline.
- Create: `walkthrough.md`

- [ ] **Step 1: Execute all unit and integration tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Launch browser subagent to verify interactive double-click drill-down in the Report Viewer**

- Open project in browser.
- Click "Generate Report" $\rightarrow$ Open Report Preview.
- Double-click on BDD block $\rightarrow$ Verify diagram switches to IBD with breadcrumbs.
- Click "⬅ Back" $\rightarrow$ Verify diagram returns to BDD.
- Double-click on State with sub-states $\rightarrow$ Verify drill-down into sub-state layer.
- Export as HTML $\rightarrow$ Verify standalone file works cleanly.

- [ ] **Step 3: Create `walkthrough.md` with verification results and screenshots.**
