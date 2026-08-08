# ADIA SysML Module Architecture Update Design

**Date**: 2026-08-07  
**Status**: Approved  
**Target Module**: ADIA SysML System Architecture (BDD, IBD, Requirements, Traceability)

---

## 1. Overview & Context

A critical engineering review (`ADIA_SysML_Architecture_Critical_Review_AR.pdf`) evaluated the ADIA SysML module (v2.4 ENGINE / ADIA_OS_v2.5) and identified critical data integrity issues, lack of cascade deletion handling, missing port/connector validation rules, and requirement traceability gaps.

This design document specifies the architectural updates required to resolve all **P0 critical bugs and data integrity risks** (BR-01 through BR-05, BR-07, BR-08, BR-10) while guaranteeing **100% backward compatibility** with legacy project JSON states and canvas rendering workflows.

---

## 2. Key Objectives & Scope

1. **Transactional Cascade Deletion**:
   - Prevent dangling Part type references when a Block is deleted (BR-01).
   - Prevent dangling Connector endpoints when a Port is deleted (BR-02).
   - Provide a dependency impact preview before deletion (BR-08).

2. **Semantic Connector & Port Validation**:
   - Enforce direction compatibility (`out -> in`, `inout`) and prevent mismatched port wiring (BR-03).
   - Enforce strict endpoint semantics for traceability relations (`satisfy`, `verify`, `deriveReqt`) (BR-04).
   - Prevent duplicate identical connectors between the same two endpoints while allowing valid parallel edges (BR-05).

3. **Requirement Governance & Token Canonicalization**:
   - Constrain requirement IDs to be globally unique across the workspace (BR-07).
   - Canonicalize the relationship token between UI (`derive`) and storage/export (`deriveReqt`) (BR-10).

4. **100% Backward Compatibility**:
   - Provide an automatic schema hydration layer on project load (`migrateSysMLState`) to inject default fields for missing properties without modifying node IDs or positions.

---

## 3. Architecture & System Decomposition

### 3.1 New Integrity Module (`src/services/sysmlIntegrityService.ts`)

A pure, decoupled TypeScript service containing integrity checks, cascade deletion helpers, and schema migration logic.

```
+-------------------------------------------------------------+
|                      Diagram UI Canvas                      |
|                  (App.tsx / Diagram Views)                  |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                 sysmlIntegrityService.ts                    |
|                                                             |
|  - migrateSysMLState(state)                                 |
|  - cascadeDeleteBlock(blockId, state)                       |
|  - cascadeDeletePort(portId, state)                         |
|  - previewDeletionImpact(elementId, state)                  |
|  - validateConnectorConnection(source, target, state)       |
|  - validateTraceabilityRelation(source, target, relation)   |
|  - validateUniqueRequirementIds(requirements)              |
+-------------------------------------------------------------+
```

### 3.2 Key Methods & API Specifications

#### A. Schema Hydration & Migration (`migrateSysMLState`)
```typescript
export function migrateSysMLState(rawState: any): SysMLDiagramState {
  // Safely inject default fallback fields if missing in legacy JSON:
  // - port.direction defaults to 'inout' if undefined
  // - part.parentPartId defaults to null if undefined
  // - requirement.reqId canonicalized
  // - relation.type canonicalized ('derive' -> 'deriveReqt')
}
```

#### B. Cascade Deletion Functions
```typescript
export interface DeletionImpact {
  elementId: string;
  elementType: 'block' | 'port' | 'part' | 'requirement';
  affectedParts: string[];
  affectedConnectors: string[];
  affectedRelations: string[];
}

export function previewDeletionImpact(elementId: string, state: SysMLDiagramState): DeletionImpact;

export function cascadeDeleteBlock(blockId: string, state: SysMLDiagramState): SysMLDiagramState;

export function cascadeDeletePort(portId: string, state: SysMLDiagramState): SysMLDiagramState;
```

#### C. Connector & Traceability Validators
```typescript
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateConnectorConnection(
  sourcePortId: string,
  targetPortId: string,
  state: SysMLDiagramState
): ValidationResult;

export function validateTraceabilityRelation(
  sourceId: string,
  targetId: string,
  relationType: string,
  state: SysMLDiagramState
): ValidationResult;
```

---

## 4. Backward Compatibility Strategy

1. **Schema Non-Breaking Guarantee**: Existing saved `.json` files will continue to load seamlessly.
2. **Graceful Fallbacks**: If an old `.json` lacks new attributes (e.g. `direction` on Ports), the `migrateSysMLState` function automatically populates them with safe defaults upon import.
3. **No UI Breaking Changes**: Visual styling, diagram canvas layouts, and user interactions remain consistent while gaining active validation feedback.

---

## 5. Verification & Testing Strategy

1. **Unit Test Suite (`src/services/sysmlIntegrityService.test.ts`)**:
   - `cascadeDeleteBlock`: Verifies deleting a Block removes/unassigns referencing Parts.
   - `cascadeDeletePort`: Verifies deleting a Port removes attached Connectors.
   - `validateConnectorConnection`: Tests rejection of `out -> out` connections and duplicate edges.
   - `validateTraceabilityRelation`: Tests `satisfy`/`verify`/`deriveReqt` endpoint constraints.
   - `migrateSysMLState`: Tests legacy JSON state migration and token normalization.

2. **Build Verification**:
   - Run `npm test` to ensure 100% test suite pass rate.
