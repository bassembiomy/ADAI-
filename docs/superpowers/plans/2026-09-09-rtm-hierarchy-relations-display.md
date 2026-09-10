# RTM Hierarchy and Requirement Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the SysML Requirements Traceability Matrix (RTM) engine, Standard Table View, Virtualized Grid, and CSV exporter to display parent requirements, child requirements, and relationship connection types (`requirementContainment`, `deriveReqt`, `copy`, `trace`, `refine`).

**Architecture:** Enrich `RtmRow` with canonical `parents`, `children`, and `requirementRelations` arrays computed from the repository's relationships. Update `TraceabilityMatrix.tsx` and `VirtualizedTraceabilityGrid.tsx` to include an interactive "Hierarchy / Relations" column with clickable badges, connection stereotypes (e.g. `«containment»`, `«deriveReqt»`), and canvas navigation. Update `exportRtmCsv` to output hierarchical links.

**Tech Stack:** TypeScript 5, React 18, Vitest, TailwindCSS

---

## Global Constraints
- Strictly preserve existing `RtmRow` fields to maintain backwards compatibility with existing consumers.
- All new requirement relationship badges must support `onNavigate(elementId)` to highlight and navigate on the active canvas.
- Maintain full compatibility with `OMG-SysML-1.6-ADIA` serialization and existing conformance matrix assertions.

---

### Task 1: Extend RTM Engine with Hierarchy and Requirement Relations

**Files:**
- Modify: `src/engine/sysml/rtm.ts:20-65`, `src/engine/sysml/rtm.ts:114-175`
- Test: `src/engine/sysml/rtm.test.ts`

**Interfaces:**
- Produces in `RtmRow`:
  ```ts
  export interface RtmRequirementRef {
    id: string;
    requirementId: string; // e.g. "REQ-001"
    name: string;
    kind: SysmlRelationship['kind'];
  }

  export interface RtmRelationshipLink {
    relationshipId: string;
    kind: SysmlRelationship['kind'];
    direction: 'incoming' | 'outgoing';
    otherRequirementId: string;
    otherReqIdentifier: string;
    otherRequirementName: string;
  }
  ```
  On `RtmRow`:
  - `parents: RtmRequirementRef[]`
  - `children: RtmRequirementRef[]`
  - `requirementRelations: RtmRelationshipLink[]`

- [ ] **Step 1: Write failing unit tests for RTM hierarchy and relations in `src/engine/sysml/rtm.test.ts`**
  - Verify that a containment parent (`req_mission -> req_perf`) yields `req_perf.parents` containing `req_mission` with `kind: 'requirementContainment'`.
  - Verify that `req_mission.children` contains `req_perf` with `kind: 'requirementContainment'`.
  - Verify that `deriveReqt` relationships populate parent/child derivation links.
  - Verify that `exportRtmCsv` includes `Parents` and `Children` columns.

- [ ] **Step 2: Run test to verify RED**
  - Run: `npx vitest run src/engine/sysml/rtm.test.ts`
  - Expected: Failures on missing `parents`, `children`, and CSV headers.

- [ ] **Step 3: Implement hierarchy extraction in `src/engine/sysml/rtm.ts`**
  - Populate `parents`, `children`, and `requirementRelations` during `buildRow`.
  - Update `exportRtmCsv` to output parents and children in the CSV string.

- [ ] **Step 4: Run test to verify GREEN**
  - Run: `npx vitest run src/engine/sysml/rtm.test.ts`
  - Expected: PASS

- [ ] **Step 5: Commit**
  - `git add src/engine/sysml/rtm.ts src/engine/sysml/rtm.test.ts`
  - `git commit -m "feat(sysml): add hierarchy and requirement links to rtm engine"`

---

### Task 2: Add Hierarchy & Relations Column to Standard RTM Table View

**Files:**
- Modify: `src/components/sysml/TraceabilityMatrix.tsx:125-165`
- Test: `src/components/sysml/TraceabilityMatrix.test.tsx`

**Interfaces:**
- Consumes: `RtmRow.parents`, `RtmRow.children`, `RtmRow.requirementRelations` from Task 1.
- Renders:
  - Header: `Hierarchy / Relations`
  - Cell:
    - Parent badge: `«containment» REQ-001: Name` (or `«deriveReqt»`)
    - Child badges: `«containment» REQ-002: Name`
    - Other links: `«copy»`, `«trace»`
    - Clicking badge triggers `onNavigate(req.id)`.

- [ ] **Step 1: Write failing component test in `src/components/sysml/TraceabilityMatrix.test.tsx`**
  - Test rendering static markup for a repository with a containment hierarchy.
  - Assert presence of `Hierarchy / Relations` header and containment badge with `«containment»`.

- [ ] **Step 2: Run test to verify RED**
  - Run: `npx vitest run src/components/sysml/TraceabilityMatrix.test.tsx`
  - Expected: Failure on missing header or text.

- [ ] **Step 3: Implement UI column in `src/components/sysml/TraceabilityMatrix.tsx`**
  - Add column header to table.
  - Add cell with styled parent and child pills with relationship tags.

- [ ] **Step 4: Run test to verify GREEN**
  - Run: `npx vitest run src/components/sysml/TraceabilityMatrix.test.tsx`
  - Expected: PASS

- [ ] **Step 5: Commit**
  - `git add src/components/sysml/TraceabilityMatrix.tsx src/components/sysml/TraceabilityMatrix.test.tsx`
  - `git commit -m "feat(sysml): display hierarchy and relations in standard rtm table"`

---

### Task 3: Add Hierarchy & Relations to Virtualized Traceability Grid

**Files:**
- Modify: `src/components/sysml/VirtualizedTraceabilityGrid.tsx:145-280`
- Test: `src/components/sysml/VirtualizedTraceabilityGrid.test.tsx`

**Interfaces:**
- Consumes: `RtmRow.parents`, `RtmRow.children`, `RtmRow.requirementRelations`.
- Renders:
  - Adjusted column widths accommodating `Hierarchy / Relations`.
  - Virtual grid cell rendering parent/children badges with accessible `aria-label` and `onNavigate`.

- [ ] **Step 1: Write failing test in `src/components/sysml/VirtualizedTraceabilityGrid.test.tsx`**
  - Assert that grid header contains `Hierarchy / Relations`.
  - Assert that rendered row includes parent and child relationship badges.

- [ ] **Step 2: Run test to verify RED**
  - Run: `npx vitest run src/components/sysml/VirtualizedTraceabilityGrid.test.tsx`
  - Expected: Failure on missing header or badges.

- [ ] **Step 3: Implement column in `src/components/sysml/VirtualizedTraceabilityGrid.tsx`**
  - Adjust header definitions and cell rendering.

- [ ] **Step 4: Run test to verify GREEN**
  - Run: `npx vitest run src/components/sysml/VirtualizedTraceabilityGrid.test.tsx`
  - Expected: PASS

- [ ] **Step 5: Commit**
  - `git add src/components/sysml/VirtualizedTraceabilityGrid.tsx src/components/sysml/VirtualizedTraceabilityGrid.test.tsx`
  - `git commit -m "feat(sysml): display hierarchy and relations in virtualized rtm grid"`

---

### Task 4: Full Suite Qualification & End-to-End Verification

**Files:**
- Test: All SysML test suites and build

- [ ] **Step 1: Run complete SysML test suite**
  - Run: `npm run test:sysml`
  - Expected: 27 test files, 187+ tests passing.

- [ ] **Step 2: Verify Vite build**
  - Run: `npm run build`
  - Expected: Clean production build.

- [ ] **Step 3: Commit and summarize**
  - Commit any remaining documentation updates.
