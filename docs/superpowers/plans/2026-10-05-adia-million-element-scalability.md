# ADIA Million-Element Scalability Implementation Plan

> **For agentic workers:** Execute the tasks in order with a fresh test and review gate after each task. Keep the canonical repository authoritative. The optional use of subagents is an execution choice, not a requirement of this plan.

**Goal:** A realistic, semantically valid ADIA project with at least 1,000,000 counted model elements can be loaded, navigated, searched, edited, incrementally validated, saved, and reopened on supported hardware without crashes, semantic drift, or unacceptable UI blocking.

**Architecture:** Preserve the canonical SysML and State Machine models and the command gateway. Improve the measured path from command to indexed state, derived views, validation, rendering, and persistence in small steps. Use existing normalized indexes, tree virtualization, diagram culling, workers, and chunked persistence where they prove useful; replace a component only after a repeatable profile identifies it as the bottleneck.

**Tech stack:** TypeScript, React, Vite, Electron/Node, Vitest, Playwright, existing SysML normalized store and worker protocols.

## Global constraints

- No rewrite or unproven replacement of the architecture. Preserve canonical repository ownership, SysML and State Machine semantics, command-only writes, read-only legacy projections, and old `.adia` compatibility.
- Preserve BDD, IBD, Requirements, State Machine, X-Bridges, simulation, code generation, validation, undo/redo, and persistence. Every optimization needs correctness and performance regression coverage.
- Do not call a project “one million elements” by counting only empty canvas objects. Record top-level semantic entities, nested block features, relationships, State Machine entities, and diagram presentations separately; count unique semantic IDs once, and never count coordinates or presentation copies as additional semantic elements.
- The requested numbers are engineering targets, not existing guarantees: lookup <10 ms typical, search <200 ms, cached tree expansion <100 ms, property edit and small command <100 ms, incremental validation <500 ms, incremental save <500 ms, large-project open <5 s if lazy loading makes it possible, normal visible diagram work at 60 FPS, and preferably <4 GiB application memory. Record p50/p95 and worst observed values; agree on hardware, visible working set, cache state, and operation definitions before using the targets as release gates.
- Treat a browser heartbeat gap >100 ms during an ordinary edit as a failure for the interactive target, even if the command handler alone is fast. Measure boundaries around the complete operation and use Chromium Long Tasks as corroboration.
- The working tree contains unrelated uncommitted work. At implementation time, identify ownership of each touched file, preserve existing edits, and avoid broad resets or commits that include unrelated changes.

## Current architecture and evidence

| Area | Current path | Planning implication |
|---|---|---|
| Canonical SysML | `src/engine/sysml/model.ts` repository records; `src/services/sysmlCommandGateway.ts` commits commands. | Keep semantic ownership and command contracts. |
| Query/index state | `src/engine/sysml/normalizedStore.ts` already provides `byId`, owner/type/source/target/diagram/requirement and other indexes plus selectors and entity upserts. | Measure incremental index maintenance before adding a second indexing system. Include nested features and State Machine entities in the query contract only where their ownership permits it. |
| UI propagation | `src/App.tsx` executes gateway commands, then calls `fromRepository` on committed edits; it also derives whole-repository legacy and V4 views. | Profile the entire edit, not only indexed primitives. Preserve result identity and React notification when removing duplicate work. |
| Model Browser | `src/components/modelExplorer/AppModelExplorer.tsx` builds `buildUnifiedModelProjection`; `ModelExplorer.tsx` uses `VirtualTree`. | DOM row virtualization exists, but projection and expansion costs still need measurement at scale. |
| Diagrams | `src/components/sysml/VirtualizedDiagram.tsx` has spatial culling; other workspaces differ. | Measure project size, active-diagram density, and viewport density independently. |
| Validation | `src/engine/sysml/validation.ts` traverses the full repository; normal edit branches in the gateway call it synchronously. | Preserve full validation while introducing sound dependency-scoped validation for interactive commands. |
| Persistence | `src/engine/sysml/persistence.ts` has chunked and incremental functions; `src/App.tsx` uses the unified project save path; `src/projectFiles/projectFileService.cjs` has a 50 MiB reader/writer limit. | A million-element project cannot be claimed supported until the actual user save/reopen path is measured and the limit is addressed with a versioned format. Do not assume existing chunk helpers are wired into that path. |
| Prior measurements | [4 October architecture audit](../../audits/2026-10-04-application-architecture-audit.md) found 10,000-block edits freezing the production browser for 3.47–3.68 s before the targeted tree fix. The follow-up probe after that fix measured 0.61–0.70 s pauses. | These were wide, simple fixtures, not the requested realistic million-element baseline. Existing `docs/performance-baseline.md` reports fast store microbenchmarks that do not establish complete-app latency. |

**Baseline status:** The requested 10k/50k/100k/250k/500k/1M mixed-model baseline has not been run. All cells in that series start as **unmeasured**; prior results must not be extrapolated.

## Benchmark contract used by every task

1. Use a deterministic seed and a documented model mix: packages and blocks; owned part/reference/value properties; typed ports; valid connectors; requirements and trace relationships; verification cases; some State Machine regions, states, and transitions; and multiple diagram references. Generate more than one topology: broad siblings, deep ownership, dense local relationships, and a realistic distributed model. Validate a small generated instance against existing rules before scaling it.
2. Keep total semantic count exact and report each category. Use at least two diagram densities per size: 100–500 presented elements for ordinary work and a stress diagram with thousands of presented elements. Record viewport DOM/SVG counts separately.
3. Run Node phases in isolated processes with a configured memory ceiling and timeout. A killed, out-of-memory, or invalid run is a failure with its last observed metric, never an omitted row. Store raw JSON, CPU profiles, heap snapshots, machine details, commit hash, working-tree state, seed, and tool versions under `artifacts/scalability/`.
4. Measure generation, canonical validation, serialization, save/reopen, repository and index construction, ID/owner/type/relationship/diagram queries, search, Browser expansion, diagram open and pan/zoom, rename/property edit/create/connect/delete, undo/redo, incremental and full validation, and app startup. Capture cold and warm runs separately. For each size, collect at least five complete operation samples after warm-up where feasible; report p50, p95, max, peak RSS/heap, heartbeat gap, Long Tasks, and outcome.
5. Use the production Vite bundle for browser measurements and the packaged Electron build for final capacity qualification. Include semantic fingerprints and round-trip equality checks after edits, undo/redo, save, and reopen. Run both ordinary and failure/recovery workflows.

## Task 1 — Reproducible mixed-model baseline, before optimization

**Files:** Extend `src/engine/sysml/largeModelGenerator.ts` and its test with a separate benchmark profile; create `scripts/scalability/generateFixture.ts`, `scripts/scalability/runBaseline.ts`, `scripts/scalability/metrics.ts`, `tests/e2e/scalability-real-workflow.spec.ts`, and `docs/scalability/2026-10-05-baseline.md`. Reuse existing `artifacts/architecture-audit-2026-10-04/browser-probe.ts` only as reference for heartbeat and real import mechanics.

**Interface:** `generateScalabilityFixture({ semanticCount, seed, topology, activeDiagramCount }): { repository, stateMachine, coordinates, diagramPresentations, counts }`. `counts` includes unique semantic IDs by family and a declared total. `runBaseline` emits machine-readable phase records, including explicit `failed`, `timedOut`, or `outOfMemory` status.

- [ ] Add a small fixture test asserting deterministic IDs, exact count accounting, valid references, diagram membership, and semantic validation. Include nested ports/properties and State Machine identities in the count. Run it and observe a meaningful failure before implementing the profile.
- [ ] Implement only the deterministic profile and test it at 1k and 10k. Keep the existing generator API unchanged for existing tests.
- [ ] Add isolated process runners and a production-browser workflow that imports the project through the real file input, invokes real commands, checks DOM rows and active diagram, and records operation-boundary heartbeat gaps and Long Tasks.
- [ ] Run 10k, 50k, 100k, 250k, 500k, and 1M in order. Stop a size after timeout/OOM and report the failure; continue only with safer phases that remain measurable. Do not raise machine limits silently.
- [ ] Save raw results and the baseline report before optimizing source paths. Include a bottleneck ranking by actual time and memory contribution and label unsupported or incomplete operations.

**Check:** `npx vitest run src/engine/sysml/largeModelGenerator.test.ts`; `npx tsc --noEmit`; `npx playwright test tests/e2e/scalability-real-workflow.spec.ts` against a production preview. The new benchmark runner must return nonzero for an invalid fixture or a claimed-success workflow that did not complete.

**Review gate:** Baseline report has every requested size and operation as a measurement or explicit failure, plus full environment/fixture details. No architecture optimization precedes this gate.

## Task 2 — Profile the actual command-to-render path

**Files:** `scripts/scalability/profileEdit.ts`, `docs/scalability/bottlenecks.md`; instrument `src/App.tsx`, `src/services/sysmlCommandGateway.ts`, `src/features/modelExplorer/unifiedModelExplorerProjection.ts`, and persistence only with optional measurement hooks that are disabled in normal builds.

- [ ] On the baseline 10k and largest loadable mixed fixtures, profile a rename and property edit through gateway, index update, validation, React update, Browser projection, diagram projection, and paint. Capture CPU and heap attribution in production mode.
- [ ] Compare each stage to the equivalent microbenchmark and identify every whole-model scan, duplicate representation, clone, and synchronous serialization on the real path. Measure the impact of selected diagram size separately from project size.
- [ ] Rank bottlenecks by p95 user-visible delay and retained memory, citing profile files. Propose the smallest first optimization and record a rollback condition.

**Review gate:** No source optimization is accepted on source appearance alone. The profile must explain the remaining observed 0.61–0.70 s pause and any larger mixed-fixture stalls.

## Task 3 — Incremental canonical store propagation

**Files:** `src/App.tsx`, `src/services/sysmlCommandGateway.ts`, `src/engine/sysml/normalizedStore.ts`, their focused tests, and `tests/e2e/scalability-real-workflow.spec.ts`.

**Interface:** A committed `SysmlCommandResult` already returns `repository`, `store`, revision, coordinates, presentations, and patch history. Use that result as the state transition; keep one authoritative repository revision and an explicit UI notification revision. Add a narrow `applyCommittedResult` helper if it makes identity and rollback rules testable.

- [ ] Write failing tests that one edit preserves unrelated entity/index object identity, updates all affected owner/type/endpoint/diagram indexes, and refreshes the UI even when the mutable indexed store instance is retained.
- [ ] Remove the redundant `fromRepository(result.repository, ...)` rebuild from the committed edit path only after proving the gateway result's indexes and presentation state are complete for create/update/move/delete/undo/redo. Avoid passing a mutable store reference as the only React change signal.
- [ ] Rerun SysML gateway, normalized store, undo/redo, Model Browser, persistence, and actual browser edit tests. Compare p95 latency, heap, and heartbeat gaps with Task 1 before/after on the same fixture and machine.

**Review gate:** No missed UI update or stale query result, no changed semantics, and measured reduction in full-path work. If `result.store` lacks a collection or command branch, repair that branch before removing its rebuild.

## Task 4 — Bounded repository query APIs and index consistency

**Files:** `src/engine/sysml/normalizedStore.ts`, new `src/engine/sysml/repositoryQueries.ts`, `src/engine/sysml/repositoryQueries.test.ts`, `src/services/sysmlCommandGateway.ts`, selected consumers identified by Task 2.

**Interface:** Provide read-only `getElement(id)`, `getChildren(ownerId, { offset, limit })`, `getElementsByType(kind, { offset, limit })`, `getRelationships(id, { direction, offset, limit })`, `getDiagramElements(diagramId, { offset, limit })`, and `searchElements(query, { offset, limit })`, all bound to a specific committed repository revision. Return IDs or compact summaries first; hydrate full elements only as requested. A cursor must identify the revision or be rejected after mutation.

- [ ] Characterize existing indexed selectors and write differential tests against full repository scans for create, rename, retype, move, connect, disconnect, delete, cascade, undo, redo, and load. Include duplicate IDs and nested features where repository semantics require them.
- [ ] Add only missing indexes justified by Task 2. Maintain them in the same atomic command transition; document complexity and memory overhead.
- [ ] Migrate the hottest consumers one at a time. Keep compatibility adapters read-only and verify identical ordering, filtering, and ownership. Do not migrate all callers in one change.
- [ ] Add cold/warm search latency, pagination correctness, index-memory, and million-element query samples to the benchmark.

**Review gate:** Indexed and scan results match on representative valid models; index rebuild is allowed on initial load/recovery but not per ordinary edit.

## Task 5 — Lazy Model Browser projection and incremental search

**Files:** `src/features/modelExplorer/unifiedModelExplorerProjection.ts`, `src/features/modelExplorer/modelExplorerProjection.ts`, `src/components/modelExplorer/AppModelExplorer.tsx`, `src/components/modelExplorer/VirtualTree.tsx`, corresponding tests and browser workflow.

**Interface:** Replace eager all-node projection on normal navigation with `getRootRows()`, `getChildRows(parentId, cursor, limit)`, and `searchRows(query, cursor, limit)` backed by Task 4 queries. Keep stable node IDs, diagram visual-parent rules, labels, read-only flags, sort order, selection, and accessibility semantics. Cache by repository revision and expanded branch with a bounded byte budget.

- [ ] Capture current tree output on mixed small fixtures as golden behavior, including Use Case, Package, interaction, requirements, and State Machine branches.
- [ ] Add tests that expanding one package touches only its child page; collapsed million-element branches allocate no tree nodes; visible DOM rows remain near viewport plus overscan; search returns correct IDs and can be cancelled when query/revision changes.
- [ ] Introduce lazy branch projection behind an internal switch and compare it with the golden result before making it the default. Preserve keyboard navigation, expansion state, selection, and diagram grouping.
- [ ] Measure expansion, search and heap at every supported fixture size. Record worst case for one owner with hundreds of thousands of children.

**Review gate:** Large project size does not cause proportional Browser DOM or eager node-object count; cached expansion meets its target on defined hardware.

## Task 6 — Dependency-scoped change propagation and validation

**Files:** `src/services/sysmlCommandGateway.ts`, `src/engine/sysml/validation.ts`, new `src/engine/sysml/validation/dependencyScope.ts`, `src/engine/sysml/sysmlWorker.ts`, `src/services/sysmlWorkerClient.ts`, and focused tests.

**Interface:** Each command yields a `ChangeSet` containing added/updated/deleted IDs, prior and new owners/types/endpoints/diagram memberships, and affected dependency IDs. Local validation returns diagnostics for that scope and a revision token. Full `validateSysmlRepository` remains available and runs as an explicit/background operation.

- [ ] Build a dependency map from current validation rules. Classify rules as local, neighborhood, namespace/global, or full-only; keep globally constraining rules (for example ID uniqueness and qualified-name uniqueness) sound via indexes or scoped invalidation.
- [ ] Add differential tests: for representative valid/invalid models, compare post-command incremental diagnostics to full-validation diagnostics on all impacted elements. Include deletion cascades, cycles, type changes, port/connector rules, requirements, use cases, and State Machine boundaries.
- [ ] Apply local validation before commit, retaining atomic rollback and prior diagnostics on failure. Move expensive full audits to a worker with revision checks, timeout, cancellation that actually stops work, and restart after fault.
- [ ] Repeat edit and validation benchmarks. Do not accept faster edits if any introduced error is missed or a stale worker result overwrites a newer revision.

**Review gate:** No false-negative semantic validation for the covered command set; operations whose dependency closure cannot be proven remain on the full validator until separately optimized.

## Task 7 — Diagram work proportional to the visible working set

**Files:** `src/components/sysml/VirtualizedDiagram.tsx`, active diagram workspaces discovered by Task 2, related culling tests, and `tests/e2e/scalability-real-workflow.spec.ts`.

- [ ] Record active-diagram and visible-viewport counts for BDD, IBD, Requirements, Use Case, Package, Activity, and State Machine views. Add real-browser assertions on mounted nodes/edges and pan/zoom frame timing; synthetic `page.evaluate` culling alone is insufficient.
- [ ] Use indexed diagram membership and existing spatial culling before adding new spatial structures. Add edge culling only with a test that preserves visible cross-viewport relationships, selection, and hit testing.
- [ ] For diagram types without equivalent culling, implement viewport-limited projection and level-of-detail only after their measurements show a need. Keep semantic graph data independent of mounted visual nodes.
- [ ] If measured dense visible SVG/DOM work still misses the budget, write a separate rendering-layer decision record with an isolated prototype; retain the current renderer for ordinary diagrams.

**Review gate:** A one-million-element project with a normal active diagram maintains bounded mounted nodes. Dense-diagram limits are published separately; project capacity is not confused with simultaneous visible-diagram capacity.

## Task 8 — Versioned large-project persistence and real incremental save

**Files:** `src/projectFiles/projectFileService.cjs`, `src/projectFiles/projectFileController.cjs`, `src/engine/sysml/persistence.ts`, `src/App.tsx`, associated tests, and `docs/scalability/persistence-format.md`.

- [ ] First measure complete user save, incremental save, open, and recovery with 10k through largest available fixtures, including the 50 MiB ceiling. Record serialized bytes, CPU, peak memory, and UI blocking. State whether existing chunks are used by the actual save/open path.
- [ ] Design a versioned container only if measurements demonstrate the current JSON path cannot meet the target. Compare chunked files and an embedded indexed store against atomicity, lazy reads, migration cost, corruption recovery, and distribution; choose the smallest proven option. Do not default to SQLite.
- [ ] Implement read-old/write-new compatibility, schema/version checks, atomic replacement or transaction commit, checksums, crash recovery, and a migration report. Keep old `.adia` files readable and test byte-for-byte preservation of semantic IDs and command behavior after migration.
- [ ] Wire dirty-chunk tracking from committed command changes to the actual Save action. Run save/reopen round trips after create/update/delete/undo/redo and under interrupted-write simulation. Test projects below, at, and above 50 MiB and verify any new file size policy is consistent on read and write.

**Review gate:** Every successfully saved supported million-element project reopens with the same semantic fingerprint and no silent loss; incremental save target is evaluated on a small edit, with full save reported separately.

## Task 9 — Memory ownership, cache limits, and recovery

**Files:** Cache owners identified by heap snapshots; likely `src/App.tsx`, `src/features/modelExplorer/`, `src/engine/sysml/patches.ts`, `src/engine/sysml/persistence.ts`, and tests in their modules.

- [ ] Capture heap snapshots after load, 100 ordinary edits, undo/redo, closing/reopening diagrams, save, and reopen at 10k/100k and the largest loadable fixture. Attribute retained repository copies, legacy projections, history snapshots, hydrated elements, and cache entries.
- [ ] Remove only measured duplicate graphs. Use bounded caches with revision-aware invalidation; keep canonical semantic data independent of eviction. Measure cache hit/miss behavior and memory before/after.
- [ ] Run long edit/search/pan cycles and forced worker/process recovery. Assert stable semantic fingerprints, no monotonic retained-heap growth beyond a documented bound, and graceful failure on supported-memory limits.

**Review gate:** Preferred <4 GiB application memory at one million is checked as peak committed/RSS and JS heap, with the measurement method and hardware reported. A limit miss is reported honestly rather than hidden through forced GC.

## Task 10 — Final qualification and supported-capacity statement

**Files:** `tests/e2e/scalability-real-workflow.spec.ts`, release scripts in `scripts/scalability/`, `docs/scalability/qualification-report.md`, and any affected existing test manifests.

- [ ] Run the complete existing critical suites for SysML, State Machine, BDD/IBD/Requirements/Use Case/Package, X-Bridges, simulation, code generation, persistence/migration, and security; repair regressions in the task that introduced them.
- [ ] Run all six fixture sizes on the supported hardware profile in a production browser and a packaged Electron build. Complete creation/load, navigation, search, partial display, edit/create/delete, undo/redo, local/full validation, save, and reopen. Include startup, p50/p95 latency, heartbeat/Long Tasks, frame timing, file size, and peak memory.
- [ ] Publish a capacity matrix: total semantic elements, maximum tested active-diagram size, maximum visible set, hardware/RAM, cold/warm state, successful operations, and measured limits. Mark any unmet target and unsupported workload explicitly.

**Done only when:** A semantically valid million-element fixture completes the entire user workflow, round-trips without corruption, stays inside the agreed responsiveness and memory envelope, and all critical regressions pass. Passing generation or indexed lookup alone does not count.

## Cross-task delivery record

After each task, record the exact files changed; contract and architectural change; tests added; tests passed/failed; before/after p50/p95/max, heartbeat and memory on the same fixture/hardware; semantic equivalence result; remaining bottleneck; and rollback path. Review each deliverable before advancing. The priority order may change only when the Task 1/2 measurements justify it; retain this record of the decision.

## Main risks and containment

| Risk | Containment |
|---|---|
| Existing fast microbenchmarks conceal UI stalls | Keep production-browser end-to-end measurement as the primary interactive gate. |
| Nested features make “element count” ambiguous | Declare unique semantic ID accounting and report every family separately. |
| Incremental indexes or validation become stale | Differential scan/full-validation oracles on every mutation and undo/redo path; atomic revision tokens. |
| Lazy tree/diagram views change semantics | Golden small-model projections, stable IDs, accessibility and selection tests, plus real-browser assertions. |
| New storage format loses compatibility or data | Versioned migration, immutable backup, atomic recovery tests, and semantic fingerprints on reopen. |
| One million elements exceed current hardware | Isolated process ceilings, explicit OOM/timeout results, documented supported hardware and capacity limits. |
| Large model loads while workspaces are active | Worker cancellation/restart, bounded queues, stale-result rejection, and user-visible progress/cancel behavior. |
