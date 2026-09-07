# Report Diagram Consistency Design

**Date:** 2026-09-07  
**Status:** Approved design

## Goal

Ensure every generated report diagram reflects one consistent, validated model revision. When a SysML relationship or IBD connector is deleted, it must not remain in another diagram, the report body, or a PDF/DOCX export. The same rule must apply when the deletion occurs from either endpoint/editor view.

## Current Context

The project currently contains reusable report renderers under `src/features/reporting/`, including BDD, Requirements, IBD, Traceability, State Machine, X-Bridges, and HMI renderers. `src/features/reporting/reportHierarchyEngine.ts` builds interactive BDD/IBD/state-machine layers.

`src/App.tsx` also contains a separate legacy report assembly path. It independently filters requirements, BDD relationships, IBD contexts, and connectors. This duplicated assembly can produce stale or incomplete diagrams even when the underlying model is correct.

The model distinguishes two connection classes:

- `RelationshipData`: SysML relationships between blocks and/or requirements, such as `composition`, `deriveReqt`, `satisfy`, `verify`, and `trace`.
- `ConnectorData`: IBD connections between part/port endpoints, optionally carrying an item flow or label.

Both classes need consistent lifecycle cleanup, but they should remain separate types because their endpoints and rendering rules differ.

## Chosen Architecture

Use a canonical immutable report snapshot as the only input to report generation. Build the snapshot from the current project model, reconcile invalid references, validate it, and pass the same snapshot to every report section and export adapter.

Editor mutations should use shared deletion/reconciliation helpers so normal deletions update the persisted model immediately. Report-time reconciliation remains a defensive boundary for imported, legacy, or externally modified data.

The report pipeline will be:

```text
project/editor state
        |
        v
canonical report snapshot
        |
reconcile + validate
        |
validated snapshot + diagnostics
        |
BDD / Requirements / IBD / Traceability / State Machine renderers
        |
HTML report -> PDF or DOCX
```

The report snapshot is immutable for one generation operation. No renderer may re-read live editor state or apply independent semantic cleanup.

## Synchronization Rules

The following rules apply to persisted model mutation and defensive report reconciliation:

1. Deleting a block removes every `RelationshipData` entry whose `sourceId` or `targetId` is the block ID.
2. Deleting a block removes parts contained by that block or typed by that block, according to the existing project ownership/type semantics; connectors touching removed parts are removed.
3. Deleting a requirement removes every relationship whose source or target is that requirement.
4. Deleting a part removes every connector whose `sourcePartId` or `targetPartId` is that part.
5. Deleting a port removes every connector whose matching part/port endpoint references that port.
6. A relationship is renderable only when both referenced block IDs exist.
7. A connector is renderable only when its part endpoints exist and its port endpoints resolve to a valid part port or an explicitly supported environment port.
8. A relationship or connector is removed from report rendering if it is dangling, but the removal is recorded in diagnostics.
9. A connection must appear at most once in each applicable rendered diagram and must never appear if its ID is absent from the validated snapshot.

## Diagram Data Flow

All report sections consume the same validated snapshot:

- Requirements rendering receives all valid relationships and selects requirement-related nodes/edges for presentation, including cross-diagram `satisfy`, `verify`, and traceability links.
- BDD rendering receives all valid relationships and presents block-to-block and block-to-requirement relationships using its existing stereotypes and markers.
- IBD rendering receives only connectors whose resolved endpoints belong to the current IBD context, while preserving supported environment-port connectors.
- Traceability rendering receives the same blocks, requirements, states, relationships, and transitions used by the other sections.
- State-machine rendering uses the snapshot’s states, layers, junctions, and transitions without reconstructing connection data from another editor state.
- PDF and DOCX exporters consume the already-generated report document/HTML and must not independently rebuild diagram data.

The reusable reporting module becomes the preferred assembly path. The duplicated report logic in `src/App.tsx` should be removed or reduced to a call into the canonical report-generation pipeline so future diagram types cannot diverge.

## Diagnostics and Failure Policy

Reconciliation returns structured diagnostics:

```ts
interface ReportModelDiagnostics {
  errors: Array<{
    code: 'DANGLING_RELATIONSHIP' | 'DANGLING_CONNECTOR' | 'DUPLICATE_ID' | 'INVALID_CONTEXT';
    elementId: string;
    message: string;
  }>;
  removedRelationshipIds: string[];
  removedConnectorIds: string[];
}
```

Recoverable dangling relationships/connectors are excluded from the report and listed in the consistency summary. Duplicate IDs and structurally invalid contexts stop report export because they make identity-based verification unreliable. The user-facing error must identify the affected element IDs and the corrective action: repair the model and regenerate.

The report includes a compact model-consistency summary with the snapshot revision/counts, number of reconciled connections, and any blocking errors.

## Testing Strategy

Tests will be added at three levels:

1. Unit tests for deletion/reconciliation helpers: block, requirement, part, and port deletion; dangling relationship/connector removal; duplicate-ID and invalid-context diagnostics.
2. Renderer tests for BDD, Requirements, IBD, and Traceability proving shared connection IDs are included or excluded consistently, including nested IBD contexts and environment ports.
3. End-to-end report tests proving a deleted relationship/connector is absent from the generated report and from PDF/DOCX output, while all surviving connection IDs occur exactly once in applicable sections.

Existing tests for empty diagrams, pagination, escaped labels, nested layers, parallel connectors, and renderer exports must remain passing.

## Scope Boundaries

This change does not redesign diagram layouts, change SysML relationship semantics, add new connection types, or implement collaborative conflict resolution. It focuses on model consistency, report snapshot construction, renderer inputs, and export verification.

