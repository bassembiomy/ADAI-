# Very Large SysML Model Scalability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ADIA handle very large SysML/state-machine projects with bounded memory growth, responsive editing, incremental persistence, and measurable performance limits.

**Architecture:** Keep the canonical SysML repository normalized by ID, but stop mirroring the entire project into React arrays for every edit. Add immutable patch-based history, indexed selectors, lazy diagram projections, viewport-aware rendering, and worker-backed heavy operations. Preserve the existing JSON format through a compatibility adapter and migrate incrementally behind feature flags.

**Tech Stack:** TypeScript 5, React 18, Electron/Vite, Vitest, Playwright, Web Workers, IndexedDB/Electron file APIs, existing SysML gateway and SVG renderer.

## Global Constraints

- Preserve `ADIA-SysML` schema version 2 compatibility and legacy import behavior.
- Preserve existing BDD/IBD semantics, undo/redo behavior, deletion-impact confirmation, and diagram exports.
- Do not load the complete repository into the rendered React tree when only one diagram/layer is visible.
- No synchronous full-project clone/stringify on pointer-move, property-edit, or every history entry.
- Every optimization must have a correctness test and a benchmark threshold.
- Keep the current array-based legacy view only as a compatibility boundary; new code uses normalized indexed data.

## Target Performance Contract

- 100,000 definitions/usages/relationships can be opened without a renderer freeze longer than 100 ms per main-thread task.
- Editing or dragging one visible element stays below 16 ms median and 50 ms p95 for the active viewport.
- Undo/redo memory is bounded by a configurable byte/count budget rather than project size multiplied by history depth.
- Opening a diagram renders only visible elements plus a configurable overscan margin.
- Save is incremental when possible; full export remains available and is explicitly asynchronous.

## File Map

- Create `src/engine/sysml/normalizedStore.ts`: normalized entity store, ID indexes, and bounded selector APIs.
- Create `src/engine/sysml/patches.ts`: typed JSON-patch-like mutation operations and inverse patches.
- Create `src/engine/sysml/workerProtocol.ts`: worker request/result/error contracts.
- Create `src/engine/sysml/sysmlWorker.ts`: validation, projection, impact analysis, and serialization worker entrypoint.
- Create `src/engine/sysml/largeModelGenerator.ts`: deterministic synthetic benchmark fixtures.
- Create `src/services/sysmlPerformance.ts`: timing, memory, and long-task instrumentation.
- Create `src/components/sysml/VirtualizedDiagram.tsx`: viewport culling and visible-element rendering boundary.
- Create `src/components/sysml/LargeModelDiagnostics.tsx`: performance mode, counts, memory, and degraded-rendering status.
- Modify `src/engine/sysml/model.ts`: add normalized-store and persistence metadata types without breaking schema 2.
- Modify `src/services/sysmlCommandGateway.ts`: patches, indexes, lazy projection, bounded history, and compatibility projection.
- Modify `src/engine/sysml/persistence.ts`: chunked/incremental persistence and worker-safe serialization.
- Modify `src/App.tsx`: use gateway selectors, visible diagram projections, and debounced/asynchronous save.
- Modify relevant BDD/IBD components: render visible nodes/edges and memoize element components.
- Add tests beside each implementation and add `tests/e2e/sysml-large-model-performance.spec.ts`.

### Task 1: Establish Baselines and Synthetic Large-Model Fixtures

**Files:** Create `src/engine/sysml/largeModelGenerator.ts`, `src/engine/sysml/largeModelGenerator.test.ts`, `src/services/sysmlPerformance.ts`.

- [ ] Add deterministic generators for 1k, 10k, 50k, and 100k definitions/usages/relationships with bounded property/port counts.
- [ ] Add `measureSync(label, fn)` and `measureAsync(label, fn)` returning duration, heap delta when available, and long-task observations.
- [ ] Add baseline tests for load, project, select, update, delete-impact, serialize, and render-data preparation.
- [ ] Run `npx vitest run src/engine/sysml/largeModelGenerator.test.ts` and record current failures/measurements in `docs/performance-baseline.md`.
- [ ] Commit the fixture and baseline only.

### Task 2: Add a Normalized Store and Secondary Indexes

**Files:** Create `src/engine/sysml/normalizedStore.ts` and tests; modify `src/engine/sysml/model.ts`.

- [ ] Define `NormalizedSysmlStore` with `definitions`, `usages`, `connectors`, `relationships`, `requirements`, `verificationCases`, plus `coordinates` and `diagramPresentations`.
- [ ] Define indexes for `ownerId`, `typeId`, `sourceId`, `targetId`, `diagramId`, and `requirementId`.
- [ ] Implement `fromRepository`, `getById`, `idsByIndex`, `upsert`, `remove`, and `projectIds` without scanning unrelated entities.
- [ ] Keep `SysmlRepository` serialization shape unchanged through `toRepository()`.
- [ ] Test index correctness after create/update/delete and compare normalized projection against current `projectLegacyDiagram` output.

### Task 3: Replace Full-Snapshot History with Bounded Inverse Patches

**Files:** Create `src/engine/sysml/patches.ts` and tests; modify `src/services/sysmlCommandGateway.ts`.

- [ ] Define typed operations: `add`, `replace`, `remove`, `batch`; each operation carries entity collection, ID, field path, old value, and new value.
- [ ] Make `applyCommand` return `{ nextStore, forwardPatch, inversePatch, impact }`.
- [ ] Store history entries as patches with configurable `maxEntries`, `maxBytes`, and coalescing key for drag operations.
- [ ] Coalesce pointer-move updates into one history entry on pointer-up.
- [ ] Retain a periodic checkpoint only when patch replay cost exceeds the configured threshold.
- [ ] Add tests proving undo/redo equivalence, bounded history bytes, deletion cascade restoration, and compatibility with existing commands.

### Task 4: Move App State to Store Selectors

**Files:** Modify `src/App.tsx`, `src/services/sysmlCommandGateway.ts`; add selector tests.

- [ ] Keep one gateway/store state as the source of truth for SysML data.
- [ ] Replace repeated `blocks.find/filter/map` mutations with indexed selectors and targeted updates.
- [ ] Expose only the active diagram's visible IDs to React.
- [ ] Keep `LegacySysmlView` projection available for existing panels and exports, but compute it lazily and cache it by repository revision plus diagram ID.
- [ ] Ensure selecting/editing one element does not recreate unrelated block/relationship objects.
- [ ] Run `npm run test:sysml` and `npx tsc --noEmit`.

### Task 5: Add Viewport Culling and Memoized Diagram Rendering

**Files:** Create `src/components/sysml/VirtualizedDiagram.tsx`; modify BDD/IBD render paths in `src/App.tsx` and related components.

- [ ] Define `DiagramViewport` and `VisibleElementSet` APIs.
- [ ] Build a grid/R-tree-compatible spatial index over coordinates; query viewport plus overscan on pan/zoom.
- [ ] Render only visible blocks/parts and edges whose endpoints or bounds intersect the viewport.
- [ ] Memoize block, port, relationship, connector, and label components by stable entity revision.
- [ ] During rapid pan/drag, render simplified nodes and defer labels/edge routing to idle time.
- [ ] Add a large-model mode that disables shadows, animations, and expensive labels above configured thresholds.
- [ ] Add Playwright tests verifying offscreen elements are not mounted and visible elements remain correct after zoom/pan.

### Task 6: Make Projection, Validation, and Impact Analysis Worker-Backed

**Files:** Create `workerProtocol.ts`, `sysmlWorker.ts`; modify gateway and add worker tests.

- [ ] Define request IDs, revision numbers, cancellation tokens, and stale-result rejection.
- [ ] Move full validation, diagram projection, deletion-impact analysis, and full serialization off the UI thread.
- [ ] Return compact deltas (`added`, `updated`, `removed`, diagnostics) instead of cloning the full result.
- [ ] Keep small-model fast paths synchronous when estimated work is below a threshold.
- [ ] Cancel obsolete validation/projection jobs when a newer revision is submitted.
- [ ] Test ordering, cancellation, stale responses, worker errors, and deterministic results.

### Task 7: Implement Chunked and Incremental Persistence

**Files:** Modify `src/engine/sysml/persistence.ts`; add persistence tests and worker integration.

- [ ] Preserve current `ADIA-SysML` JSON export/import as a compatibility format.
- [ ] Add an internal chunk format keyed by collection and entity ID, with manifest containing schema version, revision, checksum, and chunk checksums.
- [ ] Write only changed chunks after patch commits; perform writes asynchronously and atomically through temporary files/rename in Electron.
- [ ] Load manifest first, then lazy-load definitions/usages for the active diagram; validate checksums per chunk.
- [ ] Provide full export as an explicit operation that streams chunks rather than building one giant intermediate string when possible.
- [ ] Test interrupted writes, checksum mismatch, migration, partial loading, and round-trip equivalence.

### Task 8: Reduce Memory Pressure in Import, Export, and Reports

**Files:** Modify `src/App.tsx`, persistence/reporting utilities, and project export code.

- [ ] Remove duplicate full copies of blocks/relationships between canonical repository, legacy view, undo history, and export payload where not required.
- [ ] Use stable IDs and references in report generation; materialize full arrays only at final output boundaries.
- [ ] Debounce autosave and never serialize on every pointer or text-change event.
- [ ] Add explicit progress/cancel UI for full export, migration, validation, and report generation.
- [ ] Add tests asserting no repeated full serialization during drag and that cancellation releases worker data.

### Task 9: Add Large-Model UX and Safety Limits

**Files:** Create `src/components/sysml/LargeModelDiagnostics.tsx`; modify `src/App.tsx` and settings/types.

- [ ] Show entity counts, active diagram counts, renderer mode, pending worker jobs, last save, and estimated memory.
- [ ] Warn before opening a project above configurable thresholds and offer “performance mode”.
- [ ] Disable or confirm expensive operations such as full auto-layout, whole-project SVG export, and global report generation.
- [ ] Show recoverable progress/errors instead of allowing a silent UI freeze.
- [ ] Persist user limits separately from the SysML semantic model.

### Task 10: Benchmark Gates and Regression Protection

**Files:** Create `tests/e2e/sysml-large-model-performance.spec.ts`, benchmark scripts, and CI documentation.

- [ ] Benchmark 1k/10k/50k/100k fixtures on load, edit, drag, pan, zoom, validation, undo/redo, save, and reopen.
- [ ] Fail CI if p95 edit/drag exceeds 50 ms, any main-thread task exceeds 100 ms in performance mode, or memory exceeds the configured budget.
- [ ] Compare normalized gateway output with legacy behavior on all existing SysML tests.
- [ ] Run `npm run test:sysml`, `npm run test:e2e:sysml`, `npx tsc --noEmit`, and the new performance suite.
- [ ] Document machine profile, browser/Electron version, fixture size, thresholds, and known degraded modes.

## Rollout Order

1. Baselines and fixtures.
2. Normalized store and indexes.
3. Patch history.
4. App selectors.
5. Viewport rendering.
6. Workers.
7. Chunked persistence.
8. Memory/export cleanup.
9. UX limits.
10. CI performance gates.

Each task must land with its tests passing before the next task starts. Keep compatibility flags for normalized store, worker execution, and virtualized rendering until the benchmark suite passes on representative projects.

## Risks and Mitigations

- **Legacy behavior drift:** run old-vs-new projection differential tests for every command.
- **Stale worker results:** attach repository revision and request ID; discard mismatches.
- **History correctness:** retain checkpoint fallback and test cascade deletes/undo extensively.
- **Visual regressions:** compare BDD/IBD screenshots and interaction tests at multiple zoom levels.
- **Huge single-file export:** retain the existing export contract but use asynchronous/chunked internals.
- **Complexity creep:** do not add a database dependency until chunked file persistence and indexes are measured insufficient.

## Success Criteria

The work is complete only when the benchmark suite demonstrates bounded memory, responsive viewport editing, correct undo/redo, compatible import/export, and no regression in the existing SysML and E2E suites for small and medium models.
