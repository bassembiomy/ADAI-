# Report Diagram Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every generated report diagram and export reflect one validated model snapshot, with relationships and IBD connectors removed everywhere when their endpoints are deleted.

**Architecture:** Add a pure consistency service that performs cascade deletion and report-time reconciliation over the existing SysML model types. Build one immutable report snapshot from the reconciled state, route all report sections through the reusable reporting module, and expose structured diagnostics for recoverable cleanup or blocking identity/context errors.

**Tech Stack:** TypeScript, React state in `src/App.tsx`, Vitest, existing reporting renderers, jsPDF, and DOCX generation.

## Global Constraints

- Preserve the existing `RelationshipData` and `ConnectorData` distinction; do not introduce a generic connection type into persisted project files.
- Keep report layout and SysML relationship semantics unchanged.
- Do not silently render dangling relationships or connectors.
- Use the same immutable snapshot for BDD, Requirements, IBD, Traceability, State Machine, PDF, and DOCX generation.
- Existing reporting, integrity-service, project-file, and state-machine tests must continue to pass.

## File Map

- Create `src/services/reportModelConsistency.ts`: pure cascade deletion, reconciliation, validation, snapshot construction, and diagnostic types for report inputs.
- Create `src/services/reportModelConsistency.test.ts`: unit tests for deletion closure, dangling cleanup, duplicate IDs, invalid contexts, and deterministic snapshot output.
- Modify `src/services/sysmlIntegrityService.ts`: align existing block/port cascade helpers with the canonical cleanup rules without breaking its legacy `SysMLDiagramState` API.
- Modify `src/services/sysmlIntegrityService.test.ts`: cover requirement/part deletion and connector endpoint cleanup in the existing service contract.
- Create `src/features/reporting/reportSnapshot.ts`: adapt the application state into the report hierarchy source and expose a single report-generation input.
- Create `src/features/reporting/reportSnapshot.test.ts`: verify that all renderer inputs come from one reconciled revision.
- Modify `src/features/reporting/reportHierarchyEngine.ts`: consume validated snapshot data and render every relevant child layer from that snapshot, including nested IBD layers.
- Modify `src/features/reporting/reportDiagrams.ts`: enforce valid edge/connector inputs at the renderer boundary and preserve complete relationship visibility for Requirements, BDD, and Traceability.
- Modify `src/features/reporting/reportDocumentModel.ts`: add model-consistency diagnostics to the report document without making them optional at generation time.
- Modify `src/App.tsx`: replace duplicated report assembly filters with the canonical snapshot/report pipeline and route editor deletion operations through shared cascade helpers.
- Create `src/features/reporting/reportConsistency.integration.test.ts`: exercise deletion-to-report behavior across all diagram families and exports.
- Modify `src/features/reporting/exportReportToPdf.test.ts` and `src/features/reporting/exportReportToDocx.test.ts`: assert that consistency summaries and surviving connection identities are preserved through export.

### Task 1: Define and test the canonical consistency service

**Files:**
- Create: `src/services/reportModelConsistency.ts`
- Test: `src/services/reportModelConsistency.test.ts`

**Interfaces:**
- Consumes: `BlockData[]`, `RelationshipData[]`, `PartData[]`, `ConnectorData[]` and optional `states/layers/transitions/junctions` from application state.
- Produces: `ReportModelSnapshot`, `ReportModelDiagnostics`, `reconcileReportModel()`, `cascadeDeleteReportElement()`, and `buildReportSnapshot()` for Tasks 2–5.

- [x] **Step 1: Write failing tests for deletion closure**

```ts
it('removes requirement relationships when the requirement is deleted', () => {
  const model = fixture({
    blocks: [block('b1', 'block'), block('r1', 'requirement')],
    relationships: [relation('rel-1', 'b1', 'r1', 'satisfy')],
  });

  const next = cascadeDeleteReportElement(model, { kind: 'block', id: 'r1' });

  expect(next.blocks.map(b => b.id)).toEqual(['b1']);
  expect(next.relationships).toEqual([]);
});

it('removes connectors when either part endpoint is deleted', () => {
  const model = fixture({
    parts: [part('p1', 'b1'), part('p2', 'b1')],
    connectors: [connector('conn-1', 'p1', 'p2')],
  });

  const next = cascadeDeleteReportElement(model, { kind: 'part', id: 'p1' });

  expect(next.parts.map(p => p.id)).toEqual(['p2']);
  expect(next.connectors).toEqual([]);
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/services/reportModelConsistency.test.ts -v`  
Expected: FAIL because the consistency service and its exported functions do not exist.

- [x] **Step 3: Implement immutable model types and deletion closure**

Implement these exact public types and signatures:

```ts
export interface ReportModelInput {
  blocks: readonly BlockData[];
  relationships: readonly RelationshipData[];
  parts: readonly PartData[];
  connectors: readonly ConnectorData[];
  states?: readonly StateData[];
  layers?: readonly Layer[];
  transitions?: readonly TransitionData[];
  junctions?: readonly JunctionData[];
}

export interface ReportModelDiagnostics {
  errors: Array<{
    code: 'DANGLING_RELATIONSHIP' | 'DANGLING_CONNECTOR' | 'DUPLICATE_ID' | 'INVALID_CONTEXT';
    elementId: string;
    message: string;
  }>;
  removedRelationshipIds: string[];
  removedConnectorIds: string[];
}

export interface ReportModelSnapshot extends ReportModelInput {
  revision: string;
  diagnostics: ReportModelDiagnostics;
}

export function cascadeDeleteReportElement(
  model: ReportModelInput,
  target: { kind: 'block' | 'requirement' | 'part' | 'port'; id: string },
): ReportModelInput;

export function reconcileReportModel(
  model: ReportModelInput,
): { model: ReportModelInput; diagnostics: ReportModelDiagnostics };

export function buildReportSnapshot(model: ReportModelInput): ReportModelSnapshot;
```

For block deletion, remove the block, its ports, parts whose `blockId`, `typeId`, `parentBlockId`, or `typeBlockId` references the deleted block, recursively remove descendants, then remove affected connectors and relationships. For requirement deletion, remove the requirement and all touching relationships. For part/port deletion, remove dependent connectors; preserve unrelated model arrays. Generate `revision` as a deterministic hash/string derived from ordered element IDs and connection IDs so repeated input gives the same revision.

- [x] **Step 4: Add reconciliation and validation tests**

```ts
it('records and removes dangling relationships and connectors', () => {
  const result = reconcileReportModel(fixture({
    blocks: [block('b1', 'block')],
    relationships: [relation('rel-dangling', 'b1', 'missing', 'trace')],
    parts: [part('p1', 'b1')],
    connectors: [connector('conn-dangling', 'p1', 'missing-part')],
  }));

  expect(result.model.relationships).toEqual([]);
  expect(result.model.connectors).toEqual([]);
  expect(result.diagnostics.removedRelationshipIds).toEqual(['rel-dangling']);
  expect(result.diagnostics.removedConnectorIds).toEqual(['conn-dangling']);
  expect(result.diagnostics.errors.map(e => e.code)).toEqual([
    'DANGLING_RELATIONSHIP', 'DANGLING_CONNECTOR',
  ]);
});

it('blocks the snapshot when element IDs are duplicated', () => {
  const result = reconcileReportModel(fixture({
    blocks: [block('b1', 'block'), block('b1', 'block')],
  }));

  expect(result.diagnostics.errors[0].code).toBe('DUPLICATE_ID');
});
```

- [x] **Step 5: Run the focused tests and verify they pass**

Run: `npx vitest run src/services/reportModelConsistency.test.ts -v`  
Expected: PASS for deletion, dangling cleanup, duplicate-ID, invalid-context, and deterministic-revision cases.

- [x] **Step 6: Commit the service**

```bash
git add src/services/reportModelConsistency.ts src/services/reportModelConsistency.test.ts
git commit -m "feat: add canonical report model consistency service"
```

### Task 2: Align existing SysML cascade deletion with the canonical rules

**Files:**
- Modify: `src/services/sysmlIntegrityService.ts:167-200`
- Test: `src/services/sysmlIntegrityService.test.ts`

**Interfaces:**
- Consumes: Existing `SysMLDiagramState` and its current `cascadeDeleteBlock()`/`cascadeDeletePort()` API.
- Produces: Existing callers continue to receive a complete state with no dangling relations/connectors; App-level deletion can safely delegate to the shared rules.

- [x] **Step 1: Add failing tests for requirement and part deletion behavior**

```ts
it('removes all relations touching a deleted requirement', () => {
  const updated = cascadeDeleteRequirement('req-1', sampleState);
  expect(updated.requirements.some(r => r.id === 'req-1')).toBe(false);
  expect(updated.relations.some(r => r.sourceId === 'req-1' || r.targetId === 'req-1')).toBe(false);
});

it('removes connectors touching parts removed by block cascade deletion', () => {
  const updated = cascadeDeleteBlock('b1', sampleState);
  expect(updated.connectors.every(c => c.sourcePartId !== 'part-b1' && c.targetPartId !== 'part-b1')).toBe(true);
});
```

- [x] **Step 2: Run the focused tests and verify the new tests fail**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts -v`  
Expected: FAIL because requirement/part cascade behavior is incomplete or not exported.

- [x] **Step 3: Implement the minimal compatible cascade helpers**

Add `cascadeDeleteRequirement(requirementId, state)` and `cascadeDeletePart(partId, state)` with the same immutable return shape as the existing helpers. Update block cascade to recursively include descendant parts and then filter connectors by both part IDs and deleted block port IDs. Do not change migration behavior or unrelated validation functions.

- [x] **Step 4: Run the service test suite**

Run: `npx vitest run src/services/sysmlIntegrityService.test.ts -v`  
Expected: PASS, including all pre-existing migration, preview, and cascade tests.

- [x] **Step 5: Commit the compatibility changes**

```bash
git add src/services/sysmlIntegrityService.ts src/services/sysmlIntegrityService.test.ts
git commit -m "fix: close SysML deletion cascade over report connections"
```

### Task 3: Build one report snapshot adapter

**Files:**
- Create: `src/features/reporting/reportSnapshot.ts`
- Test: `src/features/reporting/reportSnapshot.test.ts`
- Modify: `src/features/reporting/index.ts`

**Interfaces:**
- Consumes: `ReportModelInput` from Task 1 and the existing `HierarchySourceModel` from `reportHierarchyEngine.ts`.
- Produces: `createReportSnapshot()` and `toHierarchySource()` for App and all report renderers.

- [x] **Step 1: Write failing snapshot adapter tests**

```ts
it('returns one revision and one reconciled connection set for every renderer', () => {
  const snapshot = createReportSnapshot(modelWithCrossDiagramLinks());
  const source = toHierarchySource(snapshot);

  expect(source.relationships.map(r => r.id)).toEqual(snapshot.relationships.map(r => r.id));
  expect(source.connectors.map(c => c.id)).toEqual(snapshot.connectors.map(c => c.id));
  expect(snapshot.revision).toBeTruthy();
  expect(snapshot.diagnostics.removedConnectorIds).toContain('dangling-1');
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/features/reporting/reportSnapshot.test.ts -v`  
Expected: FAIL because the adapter functions do not exist.

- [x] **Step 3: Implement the adapter**

Implement:

```ts
export function createReportSnapshot(input: ReportModelInput): ReportModelSnapshot;
export function toHierarchySource(snapshot: ReportModelSnapshot): HierarchySourceModel;
```

`createReportSnapshot()` must call `buildReportSnapshot()` exactly once. `toHierarchySource()` must pass the snapshot arrays by reference as readonly arrays and must not filter connections. Export both functions from `src/features/reporting/index.ts`.

- [x] **Step 4: Run reporting unit tests**

Run: `npx vitest run src/features/reporting/reportSnapshot.test.ts src/features/reporting/reportHierarchyEngine.test.ts -v`  
Expected: PASS.

- [x] **Step 5: Commit the adapter**

```bash
git add src/features/reporting/reportSnapshot.ts src/features/reporting/reportSnapshot.test.ts src/features/reporting/index.ts
git commit -m "feat: add immutable report snapshot adapter"
```

### Task 4: Make renderers and hierarchy consume the validated snapshot consistently

**Files:**
- Modify: `src/features/reporting/reportDiagrams.ts`
- Modify: `src/features/reporting/reportHierarchyEngine.ts`
- Test: `src/features/reporting/reportDiagrams.sysml.test.ts`
- Test: `src/features/reporting/reportDiagrams.ibd.test.ts`
- Test: `src/features/reporting/reportHierarchyEngine.test.ts`

**Interfaces:**
- Consumes: `ReportModelSnapshot` converted to `HierarchySourceModel` from Task 3.
- Produces: consistent rendered connection IDs in Requirements, BDD, IBD, Traceability, and nested IBD layers.

- [x] **Step 1: Add failing renderer tests for shared connection identity**

```ts
it('does not render a reconciled-away relationship in BDD or Requirements', () => {
  const snapshot = createReportSnapshot(modelWithDeletedRequirementLink());
  const source = toHierarchySource(snapshot);

  expect(renderBddDiagram({ blocks: source.blocks, relationships: source.relationships })).not.toContain('edge-deleted-rel');
  expect(renderRequirementsDiagram({ blocks: source.blocks, relationships: source.relationships })).not.toContain('edge-deleted-rel');
});

it('renders a connector only in the IBD context containing both parts', () => {
  const source = toHierarchySource(createReportSnapshot(modelWithTwoIbdContexts()));
  const contextA = source.blocks.find(b => b.id === 'context-a')!;
  const partsA = source.parts.filter(p => p.blockId === contextA.id);
  const connectorsA = source.connectors.filter(c => {
    const sourcePart = source.parts.find(p => p.id === c.sourcePartId);
    const targetPart = source.parts.find(p => p.id === c.targetPartId);
    return sourcePart?.blockId === contextA.id && targetPart?.blockId === contextA.id;
  });

  expect(renderIbdDiagram({ contextBlock: contextA, parts: partsA, connectors: connectorsA, blocks: source.blocks })).toContain('edge-context-a-conn');
});
```

- [x] **Step 2: Run focused renderer tests and verify they fail**

Run: `npx vitest run src/features/reporting/reportDiagrams.sysml.test.ts src/features/reporting/reportDiagrams.ibd.test.ts src/features/reporting/reportHierarchyEngine.test.ts -v`  
Expected: FAIL for the new shared-snapshot assertions if any renderer still accepts stale or cross-context connections.

- [x] **Step 3: Implement boundary filtering and nested-layer sourcing**

Keep relationship filtering presentation-specific but require that every relationship ID passed to a renderer exists in the snapshot. In `renderIbdDiagram()`, filter invalid endpoint records before building paths and include only connectors whose endpoints resolve to the provided context’s parts or explicitly supported environment ports. In `renderInteractiveDiagramHierarchy()`, derive every block layer and nested part layer from `source.parts` and `source.connectors` without re-reading or reconstructing from live state.

- [x] **Step 4: Add traceability and deletion-direction assertions**

Extend `reportDiagrams.trace.test.ts` so a relationship deleted from either a requirement fixture or block fixture is absent from both the traceability and source diagram output. Extend the hierarchy test so deleting a parent block removes its nested IBD layer’s connector.

- [x] **Step 5: Run all reporting renderer tests**

Run: `npx vitest run src/features/reporting/reportDiagrams*.test.ts src/features/reporting/reportHierarchyEngine.test.ts -v`  
Expected: PASS with no changes to existing captions, markers, pagination, nested drilldown, or parallel connector routing.

- [x] **Step 6: Commit renderer consistency changes**

```bash
git add src/features/reporting/reportDiagrams.ts src/features/reporting/reportHierarchyEngine.ts src/features/reporting/reportDiagrams*.test.ts src/features/reporting/reportHierarchyEngine.test.ts
git commit -m "fix: render report diagrams from validated connection sets"
```

### Task 5: Add report consistency metadata and remove the duplicate App report path

**Files:**
- Modify: `src/features/reporting/reportDocumentModel.ts`
- Modify: `src/App.tsx:11369-11680` and report-generation call sites
- Test: `src/features/reporting/reportConsistency.integration.test.ts`

**Interfaces:**
- Consumes: current App state, `createReportSnapshot()`, and `toHierarchySource()` from Task 3.
- Produces: one report-generation path that renders the approved snapshot and includes diagnostics in the document.

- [x] **Step 1: Add failing integration test for deletion-to-report behavior**

```ts
it('omits deleted requirement relationships and IBD connectors from the generated report', async () => {
  const snapshot = createReportSnapshot(modelWithDeletedRequirementLinkAndConnector());
  const html = generateArchitectureReport(toHierarchySource(snapshot), snapshot.diagnostics);

  expect(html).not.toContain('edge-deleted-rel');
  expect(html).not.toContain('edge-deleted-connector');
  expect(html).toContain('removed connections: 2');
});
```

- [x] **Step 2: Run the integration test and verify it fails**

Run: `npx vitest run src/features/reporting/reportConsistency.integration.test.ts -v`  
Expected: FAIL because the App’s report assembly still uses independent filters and no consistency summary exists.

- [x] **Step 3: Extend the report document model**

Add this required field to `ReportDocument`:

```ts
export interface ReportConsistencySummary {
  revision: string;
  removedRelationshipIds: string[];
  removedConnectorIds: string[];
  errors: ReportModelDiagnostics['errors'];
}

export interface ReportDocument {
  // existing fields
  consistency: ReportConsistencySummary;
}
```

Update `validateReportDocument()` to require `consistency.revision` and arrays for all three diagnostic collections. Update PDF/DOCX rendering to include a short consistency section before the first diagram/table.

- [x] **Step 4: Route App report generation through the snapshot**

At the report-generation entry point in `src/App.tsx`, construct:

```ts
const snapshot = createReportSnapshot({
  blocks,
  relationships,
  parts,
  connectors,
  states,
  layers,
  transitions,
  junctions,
});
const hierarchySource = toHierarchySource(snapshot);
```

Use `renderRequirementsDiagram`, `renderBddDiagram`, `renderInteractiveDiagramHierarchy`, and `renderStateMachineDiagrams` with `hierarchySource`. Replace the local `reqRels`, `bddRels`, and `ctxConns` assembly in the legacy path with the snapshot-derived source. Preserve the existing tables and analysis sections, but ensure their element/connection lists use the same snapshot arrays.

- [x] **Step 5: Route editor deletion callbacks through shared cascade logic**

Update `deleteBlock`, `deleteRelationship`, `deletePart`, and `deleteConnector` so block/part deletion computes one next model using `cascadeDeleteReportElement()` (or the compatible SysML service adapter) and updates all affected state arrays together. `deleteRelationship` and `deleteConnector` remain targeted deletions. Keep existing selection cleanup, history recording, and user notifications.

- [x] **Step 6: Run focused App/report tests and TypeScript validation**

Run: `npx vitest run src/features/reporting src/services/sysmlIntegrityService.test.ts -v`  
Expected: PASS.

Run: `npx tsc --noEmit`  
Expected: PASS with no new type errors.

- [x] **Step 7: Commit the unified report path**

```bash
git add src/App.tsx src/features/reporting/reportDocumentModel.ts src/features/reporting/reportConsistency.integration.test.ts
git commit -m "fix: unify report generation on one validated snapshot"
```

### Task 6: Verify PDF and DOCX exports preserve consistency evidence

**Files:**
- Modify: `src/features/reporting/exportReportToPdf.test.ts`
- Modify: `src/features/reporting/exportReportToDocx.test.ts`
- Modify: `src/features/reporting/exportReportToPdf.ts`
- Modify: `src/features/reporting/exportReportToDocx.ts`
- Modify: `src/features/reporting/reportConsistency.integration.test.ts`

**Interfaces:**
- Consumes: `ReportDocument.consistency` from Task 5.
- Produces: PDF and DOCX files containing the same revision and diagnostic counts as the HTML report.

- [x] **Step 1: Add failing export assertions**

```ts
it('includes report consistency metadata in the PDF output', () => {
  const pdf = exportReportToPdf({ ...mockDoc, consistency: {
    revision: 'rev-1', removedRelationshipIds: ['rel-1'], removedConnectorIds: [], errors: [],
  }});
  const text = pdf.internal.pages.flat().join(' ');
  expect(text).toContain('rev-1');
  expect(text).toContain('rel-1');
});
```

For DOCX, generate the buffer and inspect its document XML with the existing `docx` test utilities or unzip helper; assert that `rev-1` and `removed connections` are present.

- [x] **Step 2: Run export tests and verify the new assertions fail**

Run: `npx vitest run src/features/reporting/exportReportToPdf.test.ts src/features/reporting/exportReportToDocx.test.ts -v`  
Expected: FAIL because consistency metadata is not rendered yet.

- [x] **Step 3: Render the consistency summary in both exporters**

Add a compact section with revision, removed relationship count, removed connector count, and blocking error count. Do not regenerate or filter diagram data inside either exporter.

- [x] **Step 4: Run export and integration tests**

Run: `npx vitest run src/features/reporting/exportReportToPdf.test.ts src/features/reporting/exportReportToDocx.test.ts src/features/reporting/reportConsistency.integration.test.ts -v`  
Expected: PASS and generated buffers remain non-empty and valid.

- [x] **Step 5: Commit export verification**

```bash
git add src/features/reporting/exportReportToPdf.ts src/features/reporting/exportReportToDocx.ts src/features/reporting/exportReportToPdf.test.ts src/features/reporting/exportReportToDocx.test.ts src/features/reporting/reportConsistency.integration.test.ts
git commit -m "test: preserve report consistency evidence in exports"
```

### Task 7: Run the complete verification gate and review the diff

**Files:**
- Verify: all files changed by Tasks 1–6
- Modify only if a failing test identifies a concrete regression.

**Interfaces:**
- Consumes: completed canonical snapshot, editor cascade, renderer, report, and export changes.
- Produces: verified implementation ready for review, with no stale report connections.

- [x] **Step 1: Run all reporting and integrity tests**

Run: `npx vitest run src/features/reporting src/services/sysmlIntegrityService.test.ts -v`  
Expected: PASS.

- [x] **Step 2: Run the TypeScript build check**

Run: `npx tsc --noEmit`  
Expected: PASS.

- [x] **Step 3: Run the production build**

Run: `npm run build`  
Expected: PASS through TypeScript, Vite, and Electron build stages.

- [x] **Step 4: Inspect the final diff and verify no unrelated files changed**

Run: `git status --short` and `git diff HEAD~6 --stat`  
Expected: only the planned consistency service, reporting, export, App integration, and tests are changed.

If the verification gate passes, no additional commit is required. If it finds a concrete regression, fix it in the responsible planned file, rerun the failing check, and commit that explicit file with `git add` followed by `git commit -m "fix: address report consistency verification findings"`.
