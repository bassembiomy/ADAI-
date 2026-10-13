# ADIA Large-Model Edit Freeze Remediation Implementation Plan

> **For agentic workers:** Execute each task with a failing regression test, a focused implementation, verification, and review before the next task. Subagent use is optional.

**Goal:** Remove the measured synchronous work that stalls ADIA during ordinary edits of realistic large SysML models, while preserving repository semantics, diagram grouping, undo/redo, and old project compatibility.

**Architecture:** Keep the canonical repository and command gateway authoritative. First repair benchmark validity, then improve the two profiled quadratic projections. After those low-risk changes, reduce whole-model validation and duplicate UI projections only where differential tests prove equivalent behavior. Measure the same production workflow after every change.

**Tech Stack:** TypeScript, React, Vitest, Playwright, Vite production preview, Electron/Node for final persistence qualification.

## Global constraints and success measures

- This plan is a focused implementation slice of the [million-element plan](2026-10-05-adia-million-element-scalability.md), based on the [5 October bottleneck profile](../../scalability/2026-10-05-bottlenecks.md). It does not by itself certify one-million-element support.
- Preserve canonical repository ownership, SysML and State Machine semantics, command-only writes, read-only legacy projections, diagram precedence/hiding, selection, undo/redo, and old `.adia` files. Do not rewrite the application or replace its renderer without measured need.
- Use the same deterministic mixed fixture (seed 42, distributed topology, 250 elements on the active BDD) for before/after comparisons at 10k and 50k. Record hardware, source revision, production bundle, p50/p95/max, Long Tasks, heartbeat gaps, RSS/heap, and semantic result. Do not compare numbers from different machines or dev/production builds as if controlled.
- Baseline production result: a 10k committed rename took 141 ms in its handler and blocked the browser heartbeat for **828 ms** through render; 28 Model Browser rows were mounted. Single-sample Node stages at 50k: gateway 1,152 ms, V4 conversion 4,288 ms, visual-parent index 1,938 ms, full Browser projection 2,424 ms. These are diagnostic measurements, not stable p95 values.
- Interactive acceptance target: a committed rename, small property edit, undo, and redo on the 10k mixed fixture should each have **p95 heartbeat gap <100 ms**, no unaccounted task >100 ms, and identical semantic results. At 50k, collect the same workflow and set a supported target from measured hardware; do not claim it passes merely because the 10k gate passes. The broader million-element targets remain in the parent plan.
- Existing uncommitted changes touch `src/App.tsx`, `diagramTreeContext.ts`, and `migrateV3ToV4.ts`. Inspect their diffs before each edit and preserve them. Commit only files owned by the task if committing is appropriate.

## Data flow to preserve

`executeSysmlCommand` returns a committed repository and indexed store. `App.tsx` then sets the canonical repository, rebuilds a normalized store with `fromRepository`, derives a whole legacy canvas view, and derives a whole V4 inspector repository. `AppModelExplorer.tsx` builds a unified tree; `diagramTreeContext.ts` decides which diagram visually groups an element. `VirtualTree` limits DOM rows but does not limit those upstream calculations. Editing must retain the same repository revision, semantic IDs, diagram grouping, and UI notifications.

## Task 0 — Repair the measurement gate before optimizing

**Files:** `scripts/scalability/benchWorker.ts`, `scripts/scalability/runBaseline.ts`, `scripts/scalability/metrics.ts`, `scripts/scalability/profileBrowser.ts`, `tests/e2e/scalability-real-workflow.spec.ts`, `docs/scalability/2026-10-05-baseline.md`, `task.md`.

**Interface:** A benchmark sample is valid only if `result.committed === true`, the returned state replaces the prior state, the expected repository field changes, and undo/redo restore/reapply that field. Every attempted size and phase has `success`, `timedOut`, `outOfMemory`, `failed`, or `notRun` with a reason.

- [ ] Write a failing benchmark-harness test that rejects a stale-state edit sequence and an undo that does not restore the expected name. Run it before changing the runner.
- [ ] In the worker, advance state after each command with `{ ...state, ...result }`; use distinct valid names; assert committed revision/name and undo/redo effects. Emit each completed phase immediately to a sidecar JSONL file so a 250k timeout retains its last successful phase and memory sample.
- [ ] Separate **timeout per model size** from per-phase timeout in labels. Keep 250k as `timedOut`; keep 500k and 1M as `notRun` until attempted. Do not infer OOM from an elapsed-time stop.
- [ ] Make the browser workflow run against an explicit fresh production build for performance qualification. Keep the existing dev-server Playwright test as a functional test with an accurate label.
- [ ] Fill Task 1's missing operation rows with measured result or explicit failure: real native save/reopen, startup, Browser expansion, diagram open/pan/zoom, create/delete, search, and 50k+ real-browser load where feasible. Use at least five samples for any reported p95. Preserve the original raw baseline as historical evidence and publish a corrected revision separately.

**Check:** `npx vitest run src/engine/sysml/largeModelGenerator.test.ts` plus the new harness test; `npx tsc --noEmit`; the production Playwright workflow; inspect raw JSON for state transitions and explicit non-success statuses.

**Gate:** Reviewers can reproduce the 10k mixed production edit stall and trust the command/undo measurements. This gate precedes architectural changes.

## Task 1 — Cache diagram membership during Model Browser projection

**Files:** `src/features/modelExplorer/diagramTreeContext.ts`, `src/features/modelExplorer/diagramTreeContext.test.ts`, `src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`, `scripts/scalability/profileEdit.ts`, production browser workflow.

**Interface:** `buildDiagramVisualParentIndex(input)` keeps its existing signature and result. For every valid diagram, construct its presented-ID and hidden-ID `Set` once, in insertion order. For each relationship, consult those sets and keep the current “later diagram wins” behavior.

- [ ] Add tests for a relationship explicitly presented, inferred from two endpoints, hidden despite endpoint presentation, missing diagram, stale endpoint, multiple diagrams with later precedence, and State Machine diagram grouping. Compare the complete map to the current implementation on a deterministic small fixture.
- [ ] Run the focused test and a 10k mixed projection timing before the change. Confirm the new performance regression detects repeated membership allocation rather than only checking output.
- [ ] Move `new Set(presentation.elementIds)` and hidden membership construction out of the relationship loop. Reuse those sets for all relationships; do not change semantic ownership or the ordering of map assignments. Avoid full repository scans in the membership construction beyond the one intended pass.
- [ ] Run `diagramTreeContext`, unified projection, Model Browser and production-browser tests. Repeat 10k/50k stage profiles and the exact 10k production edit. Save before/after raw files and a short semantic-equivalence note.

**Gate:** All grouping/hiding/precedence tests pass; `diagramVisualParentIndex` time falls materially; the real browser heartbeat gap does not regress. If the total pause remains >100 ms, continue to Task 2.

## Task 2 — Make V4 owner indexing linear

**Files:** `src/engine/sysml/persistence/migrateV3ToV4.ts`, `src/engine/sysml/persistence/migrateV3ToV4.test.ts`, `migrateV3ToV4.fidelity.test.ts`, `migrateV3ToV4.completeness.test.ts`, related inspector and persistence tests.

**Interface:** `migrateV3ToV4` returns the same V4 element/relationship/diagram maps and `indexes.byOwner` child order. Use a per-owner membership set only while building the conversion; append each new child once. Do not expose the temporary set or alter serialized output.

- [ ] Add a golden test with duplicate registration opportunities and several owners, then a wide-owner test (10k siblings) that verifies uniqueness, exact child order, and a bounded build-time budget. Observe the wide test fail or exceed budget before implementation.
- [ ] Replace `owned.includes(id)` plus `[...owned, id]` in `registerElement` with push plus per-owner `Set` deduplication. Check other V4 conversion loops for the same pattern, changing only measured hotspots.
- [ ] Compare `migrateV3ToV4` results before/after on BDD, IBD, Requirements, Use Case, Package, State Machine-adjacent references, diagrams, and old-format fixtures; run serialization hashes and round trips where deterministic output is required.
- [ ] Repeat the 10k/50k stage and 10k production-browser measurements. Profile again to find the new dominant task rather than assuming this eliminates the entire pause.

**Gate:** V4 semantics and ordering match, conversion no longer grows quadratically with a wide owner, and the full browser workflow improves without regressions.

## Task 3 — Remove unnecessary whole-model views from ordinary edits

**Files:** `src/App.tsx`, `src/components/modelExplorer/AppModelExplorer.tsx`, `src/engine/sysml/normalizedStore.ts`, `src/services/sysmlCommandGateway.ts`, relevant App integration and diagram tests.

**Interface:** Keep one canonical repository revision and an explicit React change signal. The gateway's committed `result.store` is eligible for reuse only after tests prove every command updates all required indexes, coordinates, presentations and cache invalidation. Canvas projection is scoped to the active diagram when consumers permit it; inspector data is derived only for visible/selected inspector panels.

- [ ] Inventory every `sysmlCanvasProjection` and `inspectorRepoV4` consumer in `App.tsx`. Record which need whole-project data versus active diagram or selected element. Add failing tests for switching diagrams, selecting elements, creating/moving/deleting, and undo/redo across those consumers.
- [ ] Prove gateway-store consistency against `fromRepository(result.repository, ...)` after update, create, move, connect, disconnect, delete, undo, and redo. Keep the rebuild on any unproven branch. Replace the redundant rebuild only after React receives a new revision/snapshot signal; a mutated Map with unchanged React identity is insufficient.
- [ ] Introduce active-diagram canvas projection behind a checked adapter. Preserve reports/exports that legitimately need the whole project and preserve inactive diagram state.
- [ ] Gate V4 inspector conversion on actual panel visibility and selected IDs. Do not simply omit conversion while any existing component still receives a V4 repository; migrate each consumer with focused tests.
- [ ] Re-run the full production-browser edit, diagram switching, inspector, persistence and undo suites. Compare latency and memory at the same fixture sizes.

**Gate:** UI updates immediately and identically after all commands; no stale selection or diagram; measured work is proportional to the active/selected working set where expected.

## Task 4 — Dependency-scoped interactive validation

**Files:** `src/engine/sysml/validation.ts`, new `src/engine/sysml/validation/dependencyScope.ts`, `src/engine/sysml/normalizedStore.ts`, `src/services/sysmlCommandGateway.ts`, `src/engine/sysml/sysmlWorker.ts`, validation and gateway tests.

**Interface:** A command carries a change set of affected IDs, old/new owners, types, relationship endpoints and diagram memberships. Local validation returns revision-tagged diagnostics. Full `validateSysmlRepository` remains available for explicit audit, import, export and fallback paths.

- [ ] Classify each current validation rule as local, dependency-neighborhood, indexed-global (for example uniqueness), or full-only. Write a rule/affected-index table; do not silently skip a rule because it is expensive.
- [ ] Add differential tests comparing introduced errors from scoped validation to a full validation oracle after rename, property edit, create, move, connect, delete/cascade, undo/redo, and legacy import. Include valid and invalid models, duplicate qualified names, cycles, dangling endpoints, ports, requirements, Use Case and Activity relationships.
- [ ] Implement a conservative dependency closure using existing owner/type/source/target indexes. If a command touches an unproven rule, retain full validation for that command until the rule is covered.
- [ ] Keep commit atomic: reject newly introduced errors before mutating the authoritative state, preserve existing diagnostics, and discard stale worker results by revision. Add a real worker stop/restart test before claiming cancellation.
- [ ] Re-run semantic, gateway and production-browser tests. Measure committed edit and undo p50/p95 at 10k and 50k; profile remaining work.

**Gate:** No false-negative introduced errors against the full validator on the covered command matrix; editing does not run a whole-model synchronous validation on common covered commands.

## Task 5 — Lazy Browser projection only if profiling still requires it

**Files:** `src/features/modelExplorer/unifiedModelExplorerProjection.ts`, `modelExplorerProjection.ts`, `src/components/modelExplorer/AppModelExplorer.tsx`, `VirtualTree.tsx`, their tests and production browser workflow.

- [ ] Measure projection size, expanded branches, search, and heap after Tasks 1–4. If full projection still breaks the gate, capture small-model golden tree output, including labels, order, relationship grouping, read-only flags, keyboard selection and diagram context.
- [ ] Add revision-bound root/child-page query APIs and a bounded branch cache. Render only expanded pages; keep `VirtualTree` DOM virtualization. Reject stale cursors after commands and cancel obsolete searches.
- [ ] Differential-test output against the golden full tree, then measure wide and deep ownership at 10k/50k/100k. Keep the eager path as a temporary comparison switch until equivalence is proven.

**Gate:** Mounted rows and allocated Browser projection nodes track the visible/expanded working set, not total repository size. Search and expansion retain semantics and their published latency targets.

## Task 6 — Qualification of this remediation slice

**Files:** `tests/e2e/scalability-real-workflow.spec.ts`, `scripts/scalability/`, `docs/scalability/2026-10-05-bottlenecks.md` or a dated follow-up report, and release test manifest as needed.

- [ ] Run the full production workflow at 10k and 50k: import, rename, property edit, create, delete, undo/redo, diagram navigation, tree expansion/search, save/reopen, and validation. Include an active stress diagram separately from the ordinary 250-element diagram.
- [ ] Run at least five samples per operation on the same hardware and record p50/p95/max, heartbeat gaps, Long Tasks, DOM counts, memory, semantic fingerprints, test failures and startup/file size. Run critical SysML, State Machine, diagram, X-Bridges, simulation, code-generation and persistence regressions affected by touched paths.
- [ ] Publish the supported capacity and remaining bottleneck. A 10k pass is not a 50k, 250k or million-element claim. Continue the parent plan's persistence and memory phases before raising the advertised project limit.

**Done for this slice:** The 10k mixed project meets the agreed interactive gate without semantic regressions, 50k results and limits are documented, and every optimization has a preserved before/after record. The million-element goal remains a separate final qualification gate.

## Delivery record after every task

Record files changed, exact behavioral contract, failing-then-passing tests, broader tests and failures, before/after p50/p95/max, browser heartbeat and Long Tasks, RSS/heap, semantic equivalence, and the remaining top CPU hotspot. Stop and diagnose a regression before beginning the next task. Any change in task order requires fresh profile evidence.
