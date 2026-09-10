# Large-Model Remaining Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the missing production pieces from the large-model scalability work so very large SysML projects do not fall back to synchronous processing, full snapshot history, duplicate in-memory models, or full edge scans.

**Architecture:** Make the normalized SysML store the single semantic source of truth. React receives only visible, memoized selectors; mutations update the normalized store through patches; workers process immutable serialized/chunked snapshots with revision-based cancellation; the renderer uses node and edge indexes for viewport queries. Keep the existing repository/legacy view only at import/export and compatibility boundaries.

**Tech Stack:** TypeScript, React 18, Vite, Electron, Web Workers, Vitest, Playwright, existing normalized store, patches, persistence, and gateway modules.

## Global Constraints

- Preserve `ADIA-SysML` schema version 2 import/export compatibility.
- Preserve BDD/IBD behavior, deletion-impact confirmation, legacy migration, report generation, and existing undo/redo semantics.
- Do not perform `structuredClone(state.repository)` on every edit or history entry.
- Do not send `Map`-based stores directly through `postMessage`; use a worker-safe snapshot/transfer format.
- Reject stale worker results by revision and request ID.
- Keep a small-model fast path, but never silently use it for large-model work when a worker is unavailable.
- All changes require unit tests plus a real application-level performance test.

## Findings Being Closed

1. `SysmlWorkerClient` accepts an optional factory but the default client never creates a real worker.
2. `App.tsx` rebuilds `fromRepository(canonicalSysmlRepository)` after each repository change.
3. `sysmlCommandGateway.ts` still stores full repository snapshots beside patch history.
4. `cullElements()` indexes nodes but scans every relationship and connector on each viewport update.
5. The app still maintains canonical repository plus full legacy arrays as parallel sources of truth.
6. Existing benchmark gates do not exercise the real React/Electron path or memory/long-task budgets.

## Files and Boundaries

- Modify `src/services/sysmlWorkerClient.ts`: default worker creation, lifecycle, fallback policy, and structured-clone-safe payloads.
- Create `src/services/sysmlWorkerFactory.ts`: Vite/Electron-compatible worker construction and test factory.
- Modify `src/engine/sysml/workerProtocol.ts`: snapshot payloads, cancellation, and protocol version.
- Modify `src/engine/sysml/sysmlWorker.ts`: hydrate worker snapshots and run tasks without importing UI modules.
- Modify `src/engine/sysml/normalizedStore.ts`: persistent store mutation, edge indexes, visible selectors, and revisioned cache invalidation.
- Modify `src/engine/sysml/patches.ts`: patch-only history with checkpoints and byte budgets.
- Modify `src/services/sysmlCommandGateway.ts`: store-first mutations, patch-only undo/redo, worker scheduling, and compatibility projections.
- Modify `src/App.tsx`: remove canonical/legacy synchronization loop and subscribe to visible selectors.
- Modify `src/components/sysml/VirtualizedDiagram.tsx`: indexed edge culling and stable visible result references.
- Modify `src/services/sysmlPerformance.ts`: long-task, heap, worker, and renderer metrics.
- Modify `src/components/sysml/LargeModelDiagnostics.tsx`: display worker availability/fallback and memory budgets.
- Create `tests/e2e/sysml-large-model-interaction.spec.ts`: real UI performance tests.
- Create `src/engine/sysml/largeModelStress.test.ts`: 100k entity stress and memory-budget tests.
- Modify `docs/performance-baseline.md`: replace synthetic-only claims with measured application-path evidence.

---

### Task 1: Create and Verify the Real Worker Factory

**Files:** Create `src/services/sysmlWorkerFactory.ts` and tests; modify `src/services/sysmlWorkerClient.ts`, `src/engine/sysml/workerProtocol.ts`.

- [ ] Define `createSysmlWorker(): Worker` using `new Worker(new URL('../engine/sysml/sysmlWorker.ts', import.meta.url), { type: 'module' })` for Vite.
- [ ] Add an Electron-safe factory seam so production can inject a worker constructor without referencing `window` or Node-only globals.
- [ ] Change `SysmlWorkerClient` constructor to use the default factory when `Worker` is available, while allowing `workerFactory: null` for tests.
- [ ] Add `workerAvailable`, `lastWorkerError`, and `fallbackReason` to client diagnostics.
- [ ] Add protocol `version` and require `requestId`, `revision`, and `taskType` on every request/response.
- [ ] Test real factory injection, no-worker test fallback, worker error handling, termination, cancellation, and stale revisions.
- [ ] Verify Vite can bundle the worker with `npm run build`.

### Task 2: Make Worker Payloads Transferable and Safe

**Files:** Modify `src/engine/sysml/workerProtocol.ts`, `src/engine/sysml/normalizedStore.ts`, `src/engine/sysml/sysmlWorker.ts`, `src/services/sysmlWorkerClient.ts`.

- [ ] Add `WorkerStoreSnapshot` using plain objects/arrays instead of `Map` and `Set`.
- [ ] Add `toWorkerSnapshot(store)` and `fromWorkerSnapshot(snapshot)` with schema and revision fields.
- [ ] Ensure worker requests send only the data required by the task; projection requests must include the target diagram ID and its element IDs.
- [ ] Reject malformed snapshots and mismatched schema/revision before work starts.
- [ ] Keep cancellation checks inside large loops, not only before each task.
- [ ] Add tests comparing worker and main-thread outputs for validation, projection, impact, and serialization.

### Task 3: Remove Full-Snapshot History from Large-Model Mutations

**Files:** Modify `src/engine/sysml/patches.ts`, `src/services/sysmlCommandGateway.ts`; update tests.

- [ ] Define `HistoryBudgetOptions` with `maxEntries`, `maxBytes`, `checkpointEvery`, and `maxReplayOperations`.
- [ ] Make each committed mutation produce one forward/inverse patch and store only those patch operations.
- [ ] Remove `nextHistoryPast = [...past, structuredClone(...)]` and `present: structuredClone(...)` from create, update, delete, and diagram commands.
- [ ] Use `applyPatch` against the normalized store for undo/redo, then materialize the repository only when a compatibility caller explicitly requests it.
- [ ] Add periodic checkpoints only after `checkpointEvery` operations or when replay cost exceeds `maxReplayOperations`.
- [ ] Coalesce drag/update-presentation commands by `coalesceKey`; commit one history entry on pointer-up.
- [ ] Test memory bound, multi-step undo/redo, cascade-delete restoration, redo invalidation after a new edit, and patch replay from a checkpoint.

### Task 4: Make the Normalized Store the Single Source of Truth

**Files:** Modify `src/App.tsx`, `src/services/sysmlCommandGateway.ts`, `src/engine/sysml/normalizedStore.ts`.

- [ ] Initialize one gateway state containing the normalized store and presentation maps.
- [ ] Route create/update/delete/move operations through gateway commands and patches.
- [ ] Remove the 150 ms `mergeLegacyDiagramIntoRepository` synchronization effect.
- [ ] Remove full `blocks`, `relationships`, `parts`, and `connectors` project copies from App state; retain only active visible selector results and transient drag state.
- [ ] Keep `projectLegacyDiagram` only for compatibility panels and export, with cache key `{storeRevision, diagramId}`.
- [ ] Expose selectors such as `selectVisibleBlocks`, `selectVisibleParts`, `selectRelationshipsForVisibleNodes`, and `selectConnectorsForVisibleParts`.
- [ ] Test that updating one entity preserves references for unrelated entities and does not rebuild the entire store.

### Task 5: Add Indexed Edge Culling

**Files:** Modify `src/engine/sysml/normalizedStore.ts`, `src/components/sysml/VirtualizedDiagram.tsx`; add tests.

- [ ] Maintain endpoint indexes: `relationshipsByEndpoint`, `connectorsByPart`, and diagram membership indexes.
- [ ] Maintain optional edge bounds in a spatial grid when routing supplies geometry; otherwise query by visible endpoint IDs.
- [ ] Change culling so relationships/connectors are retrieved from the endpoint indexes instead of scanning full arrays.
- [ ] Return stable arrays when viewport, store revision, and visible IDs have not changed.
- [ ] Ensure edges to the current IBD context block remain visible even when the context node is outside the overscan box.
- [ ] Add 100k-edge tests measuring query time and validating no missing/extra visible edges.

### Task 6: Integrate Selectors into BDD/IBD Rendering

**Files:** Modify `src/App.tsx` and diagram render helpers/components.

- [ ] Replace `blocks.find()` inside per-node render loops with `getById`/selector maps.
- [ ] Memoize node, port, relationship, connector, and label components using entity revision plus presentation revision.
- [ ] Render only current diagram/layer IDs and the viewport-visible subset.
- [ ] During pan/drag, defer labels, route recomputation, shadows, and nonessential diagnostics using `requestAnimationFrame`/idle scheduling.
- [ ] Preserve selection, hit testing, context-block behavior, and current-layer filtering.
- [ ] Add React tests for reference stability and Playwright tests for visible/offscreen DOM counts.

### Task 7: Connect Worker Scheduling to Real Application Operations

**Files:** Modify `src/services/sysmlCommandGateway.ts`, `src/App.tsx`, `src/components/sysml/LargeModelDiagnostics.tsx`.

- [ ] Schedule large validation after edits with cancellation and revision checks.
- [ ] Schedule projection only for the active diagram; do not project the whole repository for a local diagram update.
- [ ] Schedule deletion-impact analysis before confirmation for large repositories.
- [ ] Schedule full serialization only for explicit save/export and show progress/cancel state.
- [ ] If the worker cannot be created, show a visible “main-thread fallback” warning and reduce expensive operations rather than silently continuing.
- [ ] Add worker queue count, last task duration, fallback reason, and stale-result count to diagnostics.

### Task 8: Add Real Large-Model Performance and Memory Gates

**Files:** Create `src/engine/sysml/largeModelStress.test.ts`, `tests/e2e/sysml-large-model-interaction.spec.ts`; modify performance docs/scripts.

- [ ] Add 1k, 10k, 50k, and 100k fixtures with realistic relationship/connector density, not only isolated definitions.
- [ ] Measure real application operations: open, first paint, edit, drag, pan, zoom, validation, deletion preview, undo/redo, save, and reopen.
- [ ] Capture long tasks with `PerformanceObserver` and record heap usage where Chromium exposes it.
- [ ] Define gates: no main-thread task above 100 ms in performance mode, drag p95 below 50 ms, worker validation cancellation below 100 ms after a newer revision, and bounded history bytes.
- [ ] Run tests in Electron/Chromium through Playwright, not only Vitest function benchmarks.
- [ ] Document hardware, runtime, fixture shape, thresholds, and known platform differences.

### Task 9: Verify Persistence and Recovery Under Load

**Files:** Modify persistence tests and worker integration; add recovery tests.

- [ ] Test incremental save after one patch without serializing unrelated chunks.
- [ ] Test interrupted chunk writes, temporary-file cleanup, checksum failure, and recovery from the last valid manifest.
- [ ] Test lazy loading of inactive diagrams and materialization of the active diagram only.
- [ ] Test full legacy JSON export/import remains byte-valid semantically even if internal storage is chunked.
- [ ] Ensure save cancellation never leaves the in-memory store at a half-committed revision.

### Task 10: Final Regression and Release Gate

**Files:** Existing SysML tests, `docs/performance-baseline.md`, release checklist.

- [ ] Run `npm run test:sysml`.
- [ ] Run `npm run test:e2e:sysml`.
- [ ] Run `npx tsc --noEmit` and `npm run build`.
- [ ] Run the 100k stress and Electron performance suites.
- [ ] Compare BDD/IBD behavior for small and medium fixtures against the pre-scalability behavior.
- [ ] Fail the release if the default production build has no real worker, if full snapshots remain in the large-model mutation path, or if benchmark evidence is synthetic-only.
- [ ] Update `docs/performance-baseline.md` with measured results and explicitly list any remaining limits.

## Execution Order

```text
1 Worker factory/protocol
2 Transferable worker snapshots
3 Patch-only history
4 Store-first App integration
5 Indexed edge culling
6 Selector-based rendering
7 Worker scheduling integration
8 Real performance gates
9 Persistence/recovery validation
10 Release regression gate
```

Every task must end with its focused tests passing before moving to the next task. Keep feature flags for worker mode, store-first mode, and indexed culling until Task 10 passes.

## Definition of Done

- The default production app creates a real SysML worker for large projects.
- Large-model mutations do not clone the full repository for history.
- The normalized store is the only live semantic source of truth.
- Viewport updates do not scan all relationships/connectors.
- The UI renders only the active diagram and visible elements.
- Worker and persistence failures are visible and recoverable.
- 100k realistic entities pass the application-level performance gates without a freeze longer than 100 ms.
- Existing SysML, import/export, deletion, report, BDD, and IBD tests remain green.
