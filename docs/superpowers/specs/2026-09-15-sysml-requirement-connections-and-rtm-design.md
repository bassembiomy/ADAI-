# SysML Requirement Connections & Traceability Matrix Design Specification

**Date**: 2026-09-15  
**Topic**: SysML Requirement Connections (Containment, deriveReqt, refine, trace, copy, satisfy, verify) on Requirements Diagram & Traceability Matrix Integration

---

## 1. Overview & Objectives

In OMG SysML 1.6, requirements are first-class modeling elements that connect to other requirements, architecture design blocks, and verification cases. This specification adds support for all 7 standard SysML requirement relationship types directly onto the **Requirements Diagram Canvas** and ensures full consistency, semantic validation, and visibility across the **Requirements Traceability Matrix (RTM)** and report generators.

---

## 2. Requirement Relationship Types & Semantics

| Relationship | Connects (Source → Target) | Meaning | Visual Line & Arrow Direction |
| :--- | :--- | :--- | :--- |
| **Containment** | Requirement → Sub-requirement | Breaks a requirement into smaller requirements | Solid line; circular crosshair `(+)` at parent; no dependency arrow at child |
| **«deriveReqt»** | Requirement → Requirement | A requirement is derived from another requirement | Dashed line; open arrow pointing from derived req to source req (`«deriveReqt»`) |
| **«refine»** | Model element / Requirement → Requirement | Adds detail or makes a requirement more precise | Dashed line; open arrow pointing from detailed element to refined req (`«refine»`) |
| **«trace»** | Any element → Any element | General-purpose traceability when no more specific relationship fits | Dashed line; open arrow pointing from tracing element to traced element (`«trace»`) |
| **«copy»** | Requirement → Requirement | Creates a controlled copy of a requirement, often from another specification | Dashed line; open arrow pointing from copy req to master req (`«copy»`) |
| **«satisfy»** | Design element → Requirement | Shows which component, block, or behavior implements the requirement | Dashed line; open arrow pointing from design element to requirement (`«satisfy»`) |
| **«verify»** | Test case → Requirement | Shows which test verifies the requirement | Dashed line; open arrow pointing from test case to requirement (`«verify»`) |

---

## 3. Architecture & Component Changes

### 3.1 Connection Policy & Semantic Rules (`src/engine/sysml/connectionPolicy.ts`)
- **`validDiagram`**:
  - Update to permit all 7 requirement relationship kinds (`requirementContainment`, `deriveReqt`, `copy`, `refine`, `trace`, `satisfy`, `verify`) when `diagram === 'requirements'`.
- **Endpoint Rules in `evaluateSysmlConnection`**:
  - `requirementContainment`: Source (`requirement`) → Target (`requirement`). Prevents self-containment, multiple containers for the same child, and circular containment chains.
  - `deriveReqt`: Source (`requirement`, derived) → Target (`requirement`, source/base). Prevents self-derivation and reciprocal derivation cycles.
  - `copy`: Source (`requirement`, copy) → Target (`requirement`, master). Prevents self-copy and cycles.
  - `refine`: Source (`block`, `part`, `verificationCase`, or `requirement`) → Target (`requirement`).
  - `trace`: Any element → Any element (at least one resolved element).
  - `satisfy`: Source (`block` or `part`) → Target (`requirement`).
  - `verify`: Source (`verificationCase` / `testCase`) → Target (`requirement`).

### 3.2 Diagram Context & UI Validation (`src/services/sysmlConnectionUi.ts` & `src/services/sysmlCreationRules.ts`)
- `relationshipContext(type)` recognizes the 7 requirement relationship kinds in the `'requirements'` diagram context.
- `getCanvasRelationshipKinds` provides candidate relationship options filtered by the selected endpoint stereotypes:
  - Requirement → Requirement: `['requirementContainment', 'deriveReqt', 'copy', 'refine', 'trace']`
  - Block / Part → Requirement: `['satisfy', 'refine', 'trace']`
  - Test Case → Requirement: `['verify', 'refine', 'trace']`
  - Other allowed pairs: `['trace']`

### 3.3 Canvas Elements & Live SVG Rendering (`src/App.tsx`)
- **Toolbar in Requirements Mode**:
  - Add `+ Block` (creates a design block) and `+ Test Case` (creates a verification case) alongside `+ Requirement`.
- **Canvas Visibility Filter**:
  - Allow blocks with stereotypes `requirement`, `block`, and `testCase` to render in `diagramMode === 'requirements'`.
- **Relationship Rendering (`renderRelationships`)**:
  - `requirementContainment`: Solid line with start marker `url(#requirement-containment-crosshair)` at parent, no arrow at target, centered `«contains»` badge.
  - `«deriveReqt»`, `«copy»`, `«refine»`, `«trace»`, `«satisfy»`, `«verify»`: Dashed line (`stroke-dasharray="4,2"`), open arrowhead at target, centered stereotype badge.
- **Connection Dialog**:
  - Displays user-friendly labels with explicit direction cues (e.g. `«deriveReqt» (Derived requirement → Source requirement)`).

### 3.4 Requirements Traceability Matrix (RTM) Engine & UI (`src/engine/sysml/rtm.ts` & `src/components/sysml/TraceabilityMatrix.tsx`)
- **RTM Data Model (`RtmRow`)**:
  - `parents`: Contains incoming parent containment, incoming `deriveReqt` source requirements, and incoming `copy` master requirements.
  - `children`: Contains outgoing child containment, outgoing `deriveReqt` derived requirements, and outgoing `copy` copied requirements.
  - `coveringBlocks`: Design elements connected via `«satisfy»`.
  - `verificationCases`: Test cases connected via `«verify»`.
  - `refinements`: Elements connected via `«refine»` (detailed element refining the requirement).
  - `traces`: Trace links connected via `«trace»` (bidirectional tracing elements).
- **RTM UI & Virtualized Grid**:
  - **Hierarchy & Relations**: Badges for containment (`«contains»`), derivation (`«deriveReqt»`), and copies (`«copy»`).
  - **Satisfied by**: Emerald badges for `«satisfy»` design elements.
  - **Verification**: Linked test cases and execution status for `«verify»`.
  - **Refined / Traced By**: New dedicated column displaying `«refine»` and `«trace»` element badges.
- **CSV / Excel Export**:
  - Includes dedicated columns for `Refined By` and `Traced By`.

---

## 4. Testing & Verification Plan

1. **Unit Tests**:
   - `connectionPolicy.test.ts`: Verify valid diagrams, endpoints, and error diagnostics for all 7 relationship types.
   - `sysmlConnectionUi.test.ts`: Verify canvas relationship options returned for Req-to-Req, Block-to-Req, Test-to-Req.
   - `sysmlCreationRules.test.ts`: Verify cycle detection for `deriveReqt`, `copy`, and `requirementContainment`.
   - `rtm.test.ts`: Verify indexing of `refinements`, `traces`, `coveringBlocks`, `parents`, and `children`.
2. **Component Tests**:
   - `TraceabilityMatrix.test.tsx` & `VirtualizedTraceabilityGrid.test.tsx`: Verify the new "Refined / Traced By" column renders correctly and supports keyboard navigation.
3. **End-to-End Diagram Verification**:
   - Verify adding requirements, blocks, and test cases to requirements diagram, connecting each relationship type, verifying arrow direction and markers, and checking RTM reflects all links accurately.
