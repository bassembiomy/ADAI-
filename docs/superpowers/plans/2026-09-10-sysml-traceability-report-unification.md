# SysML Traceability and Report Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SysML canonical data, the Traceability Matrix, architecture reports, BDD/IBD diagrams, requirements hierarchy, persistence, and browser flows use one consistent model with safe cycle handling and scalable performance.

**Architecture:** The canonical `SysmlRepository`/normalized store becomes the only semantic source. A single report/traceability snapshot adapter derives both RTM rows and report sections from that source. RTM and report engines use prebuilt indexes and cycle-safe traversal; UI rendering uses virtualized rows by default for large models. Legacy arrays remain only as a compatibility projection and are never used as the authoritative report input.

**Tech Stack:** TypeScript, React, existing SysML repository/gateway, normalized store, Vitest, Playwright, HTML/SVG report generators, CSV export.

## Global Constraints

- Preserve `ADIA-SysML` schema version 2 import/export compatibility.
- Preserve existing BDD, IBD, requirements, deletion, baseline, evidence, report, and navigation behavior.
- Keep legacy `BlockData[]`, `PartData[]`, and related arrays available only for existing editor compatibility.
- Do not silently discard unresolved endpoints, dangling links, cycles, stale evidence, or invalid connectors; report them as diagnostics.
- All report and RTM output must be derived from the same revisioned snapshot.
- Large models must not render an unbounded non-virtualized RTM table by default.
- Every correctness change requires a focused unit test and an E2E/regression test when it affects the UI flow.

## Problems Covered

1. Reports use legacy arrays while RTM uses the canonical repository.
2. Reports do not include complete RTM coverage/evidence/verification data.
3. Report requirement hierarchy omits `requirementContainment`.
4. Report hierarchy traversal can recurse forever on cycles.
5. RTM construction repeatedly scans the whole repository.
6. RTM filtering happens after full matrix construction.
7. RTM standard table is the default for large models.
8. RTM element labels can fall back to raw IDs.
9. Diagnostics E2E is blocked by the welcome overlay.
10. Report/RTM revision and diagnostics are not presented as one coherent snapshot.

## File Map

- Create `src/engine/sysml/traceabilityIndex.ts`: indexed canonical traceability graph.
- Create `src/engine/sysml/reportSnapshotAdapter.ts`: canonical repository to immutable report/RTM snapshot.
- Create `src/engine/sysml/traceabilityIndex.test.ts`.
- Create `src/engine/sysml/reportSnapshotAdapter.test.ts`.
- Modify `src/engine/sysml/rtm.ts`: consume indexes, support cycle-safe filtered builds, and expose complete coverage data.
- Modify `src/engine/sysml/rtm.test.ts`: indexing, containment, cycles, filters, baselines, evidence, and unresolved endpoints.
- Modify `src/components/sysml/TraceabilityMatrix.tsx`: canonical snapshot input, default virtualization threshold, indexed/lazy filtering, and complete labels.
- Modify `src/components/sysml/VirtualizedTraceabilityGrid.tsx`: stable virtual rows, keyboard focus, and large-model diagnostics.
- Modify `src/features/reporting/generateArchitectureReport.ts`: canonical traceability sections, containment support, cycle-safe hierarchy, and diagnostics.
- Modify `src/features/reporting/reportSnapshot.ts`: snapshot metadata and shared traceability projection.
- Modify `src/features/reporting/reportDiagrams.ts`: use shared endpoint maps and avoid repeated linear lookups.
- Modify `src/services/reportModelConsistency.ts`: reconcile canonical-to-report input and preserve diagnostics.
- Modify `src/App.tsx`: use one canonical report snapshot, remove legacy report input, and make welcome/diagnostics flow deterministic.
- Modify `tests/e2e/sysml-large-model-interaction.spec.ts`: close/wait for overlay before toolbar interaction.
- Create `tests/e2e/sysml-traceability-report-consistency.spec.ts`.
- Modify `tests/e2e/sysml-persistence-report.spec.ts`.
- Modify `docs/performance-baseline.md` and add `docs/sysml-traceability-report-contract.md`.

---

### Task 1: Define the Shared Canonical Traceability Contract

**Files:** Create `src/engine/sysml/reportSnapshotAdapter.ts`, tests; modify `src/features/reporting/reportSnapshot.ts`.

- [ ] Define `CanonicalTraceabilitySnapshot` containing `repositoryRevision`, immutable repository references, `TraceabilityIndex`, report diagnostics, and a deterministic content hash.
- [ ] Implement `buildCanonicalTraceabilitySnapshot(repository)` using only the canonical repository/normalized store.
- [ ] Expose adapters for both RTM and report generation so both receive the exact same revision and diagnostics.
- [ ] Preserve the existing `ReportModelSnapshot` API for legacy report diagram code through an explicit compatibility projection.
- [ ] Test that RTM and report snapshots from the same repository have the same revision/hash and the same endpoint set.

### Task 2: Build a Shared Indexed Traceability Graph

**Files:** Create `src/engine/sysml/traceabilityIndex.ts`, tests.

- [ ] Build indexes for:
  - `relationshipsByEndpoint`
  - `relationshipsByKind`
  - `requirementsById`
  - `childrenByRequirement`
  - `parentsByRequirement`
  - `verificationCasesByRequirement`
  - `evidenceByRequirement`
  - `evidenceByVerificationCase`
  - `artifactsByRequirement`
  - `coveringElementsByRequirement`
  - `elementsById`
- [ ] Normalize both canonical relationship directions for `satisfy`, `verify`, `deriveReqt`, `requirementContainment`, `satisfy`, `refine`, `trace`, and `copy` without changing stored direction.
- [ ] Detect unresolved endpoints and duplicate IDs once during index construction.
- [ ] Preserve deterministic sorted IDs for reproducible reports and CSV output.
- [ ] Test index equivalence against direct repository scans on representative fixtures.

### Task 3: Refactor RTM to Use the Shared Index

**Files:** Modify `src/engine/sysml/rtm.ts`; expand `src/engine/sysml/rtm.test.ts`.

- [ ] Change `buildTraceabilityMatrix` to accept an optional prebuilt `TraceabilityIndex`; build one once when absent.
- [ ] Replace per-requirement scans of all relationships, verification cases, evidence, and artifacts with index lookups.
- [ ] Add indexed query filtering for `owner`, `risk`, `status`, `method`, `subsystem`, `baselineId`, `changeType`, and `changedSinceRevision`.
- [ ] Preserve complete row fields: parents, children, requirement relations, covering blocks/parts, ports, connectors, behaviors, simulations, verification cases, evidence, artifacts, and unresolved endpoints.
- [ ] Include `unsupported` in metrics explicitly rather than silently excluding it from status counts.
- [ ] Test that filtered output matches filtering of the complete unfiltered matrix.

### Task 4: Make Requirement Hierarchy Cycle-Safe and Containment-Complete

**Files:** Modify `src/features/reporting/generateArchitectureReport.ts` and report diagram helpers; add report tests.

- [ ] Treat `requirementContainment` as a hierarchy relation everywhere the report builds parent/child maps.
- [ ] Add a recursion-stack and visited set to report hierarchy rendering.
- [ ] On a cycle, render the requirement once and add a visible diagnostic marker such as `cycle detected: REQ-X → REQ-Y`.
- [ ] Ensure disconnected requirements still render exactly once.
- [ ] Ensure roots are selected deterministically; if all nodes are in a cycle, start traversal from sorted requirement IDs.
- [ ] Add tests for three-level containment, mixed containment/deriveReqt, disconnected requirements, and two-node/three-node cycles.

### Task 5: Add the Full Traceability Section to Architecture Reports

**Files:** Modify `src/features/reporting/generateArchitectureReport.ts`, `src/features/reporting/reportSnapshot.ts`, and report tests.

- [ ] Add a “Traceability Matrix” report section generated from the same canonical snapshot used by the UI RTM.
- [ ] Include columns for requirement ID, status, change kind, owner, risk, parents, children, covering elements, verification cases, evidence, artifacts, unresolved endpoints, and relationship IDs.
- [ ] Add coverage summary: total, covered, verified, failed, stale, suspect, uncovered, orphan, unresolved, unsupported, coverage percentage, verification percentage.
- [ ] Add baseline/revision metadata and model hash to the report header.
- [ ] Include reconciliation diagnostics and cycle diagnostics in a dedicated section, not only a count.
- [ ] Escape all user-controlled text and preserve valid HTML/SVG output.
- [ ] Test report output for canonical requirements, containment, evidence, baselines, unresolved links, and cycles.

### Task 6: Route App Report Generation Through the Canonical Snapshot

**Files:** Modify `src/App.tsx` and report adapter imports.

- [ ] Replace the current `createReportSnapshot({ blocks, relationships, parts, connectors, ... })` call with `buildCanonicalTraceabilitySnapshot(canonicalSysmlRepository)` plus the state-machine view needed by the report.
- [ ] Derive the legacy report diagram source from the canonical snapshot only when the diagram renderer requires it.
- [ ] Ensure the report gate validates the exact repository revision used for report generation.
- [ ] Show a stale-snapshot error if a repository revision changes while an async report is being generated.
- [ ] Keep the large-model confirmation and add progress/cancel feedback for report generation.
- [ ] Add a test proving a canonical-only relationship appears in both RTM and report output.

### Task 7: Make RTM Scalable and Consistent in the UI

**Files:** Modify `src/components/sysml/TraceabilityMatrix.tsx`, `VirtualizedTraceabilityGrid.tsx`, and related tests.

- [ ] Use the shared canonical snapshot/index instead of rebuilding from raw repository scans per filter.
- [ ] Enable virtualization automatically when rows exceed the configured threshold; retain a manual override for small models.
- [ ] Keep filtering/indexing work out of render where possible and debounce free-text query input.
- [ ] Use stable row keys and preserve keyboard focus when filters or viewport windows change.
- [ ] Resolve display names for requirements, definitions, usages, connectors, verification cases, evidence, artifacts, baselines, and relationships through the shared element index.
- [ ] Add visible model revision, snapshot hash, and diagnostics count to the RTM header.
- [ ] Test standard and virtualized modes, keyboard navigation, filtering equivalence, large row counts, and canonical-only elements.

### Task 8: Optimize Report Diagrams and Hierarchy Rendering

**Files:** Modify `src/features/reporting/reportDiagrams.ts`, `reportHierarchyEngine.ts`, and tests.

- [ ] Build `blockById`, `partById`, `relationshipById`, and endpoint maps once per report snapshot.
- [ ] Replace repeated `.find()` calls inside node/edge loops with maps.
- [ ] Preserve page chunking and deterministic layout order.
- [ ] Keep connectors/relationships with unresolved endpoints in diagnostics and omit only the invalid visual edge.
- [ ] Add report generation budgets for large models and return structured progress/cancellation hooks where the caller supports them.
- [ ] Add 10k/50k report fixture tests for bounded runtime and output completeness.

### Task 9: Fix Diagnostics Overlay and Browser Flow Determinism

**Files:** Modify `src/App.tsx`, `tests/e2e/sysml-large-model-interaction.spec.ts`, and relevant overlay components.

- [ ] Add a deterministic `data-testid="welcome-overlay"` and a close action accessible to Playwright.
- [ ] Update E2E setup to close the overlay or wait for it to disappear before toolbar interaction.
- [ ] Ensure toolbar buttons are either disabled while the overlay is active or not exposed as interactable to automation.
- [ ] Add a regression test that Diagnostics opens successfully after startup and displays worker/performance state.
- [ ] Verify no overlay remains after project navigation or tab switching.

### Task 10: Cross-Subsystem Consistency and Persistence Tests

**Files:** Create `tests/e2e/sysml-traceability-report-consistency.spec.ts`; modify persistence/report E2E tests and unit tests.

- [ ] Create one canonical fixture containing requirements, containment, deriveReqt, satisfy, verify, evidence, artifact, BDD blocks, IBD parts/connectors, baseline, and an unresolved link.
- [ ] Assert the same fixture produces matching requirement IDs/statuses in the UI RTM, CSV export, and HTML report.
- [ ] Save/reload the fixture and assert the snapshot hash/revision and traceability outputs remain semantically identical.
- [ ] Delete an element and assert RTM status, report diagnostics, evidence invalidation, and diagrams update consistently.
- [ ] Test stale evidence and suspect relationships through both UI and generated report.

### Task 11: Performance and Release Gates

**Files:** Create/modify performance tests and `docs/sysml-traceability-report-contract.md`, `docs/performance-baseline.md`.

- [ ] Benchmark RTM build, filtered RTM, CSV export, report generation, and report diagram rendering at 1k, 10k, and 50k requirements/relationships.
- [ ] Require indexed RTM construction to scale approximately linearly with relationships rather than requirements multiplied by relationships.
- [ ] Require virtualized RTM DOM rows to remain bounded by viewport plus overscan.
- [ ] Require canonical/report revision equality in every generated report.
- [ ] Run:
  - `npm run test:sysml`
  - `npm run test:e2e:sysml`
  - `npx tsc --noEmit`
  - `npm run build`
- [ ] Document any environment-only dependency warnings separately from functional failures.

## Execution Order

```text
1 Shared snapshot contract
2 Traceability indexes
3 Indexed RTM
4 Cycle-safe/containment-complete hierarchy
5 Full RTM report section
6 Canonical App report path
7 Scalable RTM UI
8 Optimized report diagrams
9 Overlay/E2E determinism
10 Cross-subsystem consistency tests
11 Release/performance gates
```

## Definition of Done

- RTM and reports consume the same canonical snapshot, revision, and model hash.
- Requirement containment appears consistently in RTM, report tables, hierarchy, and diagrams.
- Cyclic requirement graphs never hang or overflow the stack.
- Reports include complete RTM coverage, verification, evidence, artifacts, baseline, and diagnostic data.
- RTM uses indexed queries and virtualized rendering for large models by default.
- BDD/IBD/report diagrams preserve deterministic, correct output and expose unresolved endpoints diagnostically.
- The diagnostics E2E flow passes without overlay interception.
- Persistence/reload preserves traceability semantics.
- All SysML unit, integration, E2E, typecheck, build, and performance gates pass.
