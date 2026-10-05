# ADIA Remaining Scalability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the verified renderer freezes, qualify every important editing workflow at 10,000 and 50,000 elements, and establish the persistence and memory architecture needed to progress safely toward 1,000,000 elements.

**Architecture:** Treat responsiveness as an end-to-end browser property: measure input, command, React commit, paint, and heartbeat delay separately. Keep one normalized SysML source of truth, derive only the active diagram and visible explorer rows, move load/save preparation off the renderer thread, and admit larger model sizes only after automated gates pass.

**Tech Stack:** React 18, TypeScript 5, Vite, Vitest, Playwright, Electron 43, Web Workers, normalized SysML repository/store.

## Global Constraints

- Preserve SysML semantics, undo/redo behavior, diagram presentation coordinates, and existing `.adia` compatibility.
- Use production builds for performance acceptance; development timing is diagnostic only.
- Run five samples per workflow and report median, p95, maximum heartbeat delay, and long tasks over 50 ms.
- The 10,000-element acceptance gate is p95 heartbeat delay below 100 ms and no long task above 100 ms during an interaction.
- A handler-duration pass does not satisfy the responsiveness gate.
- Do not claim 50,000, 250,000, or 1,000,000-element support until that tier's load, edit, undo/redo, save/reopen, and memory gates pass.
- Preserve unrelated workspace changes and make one reviewable commit per task.

---

## File Map

- `scripts/scalability/profileBrowser.ts`: shared production-browser runner and raw timing capture.
- `scripts/scalability/assertBrowserProfile.ts`: deterministic acceptance evaluator created in Task 1.
- `scripts/scalability/workflows.ts`: typed definitions for load, rename, property edit, create/delete, tree, save/reopen, undo, and redo workflows.
- `tests/performance/sysml-scalability.spec.ts`: Playwright release gate for the supported size.
- `src/features/sysml/performance/renderTelemetry.ts`: test-enabled React commit and paint marks.
- `src/engine/sysml/normalizedStore.ts`: normalized entities, membership indexes, and revision counters.
- `src/engine/sysml/projection/activeDiagramProjection.ts`: active-diagram-only canvas projection.
- `src/features/modelExplorer/modelExplorerQuery.ts`: paged root/child/search queries over normalized indexes.
- `src/components/modelExplorer/AppModelExplorer.tsx`: consumes visible rows without rebuilding the full tree.
- `src/features/sysml/runtime/sysmlEditorStore.ts`: external editor store with slice subscriptions.
- `src/features/sysml/runtime/useSysmlEditorSelector.ts`: `useSyncExternalStore` selector hook.
- `src/engine/sysml/workers/projectIo.worker.ts`: parse, migrate, normalize, validate, and serialize work away from the UI thread.
- `src/engine/sysml/workers/projectIoClient.ts`: typed worker client and cancellation/progress interface.
- `src/App.tsx`: integration only; remove duplicated repository/store state after the external store is proven.

---

### Task 1: Make the responsiveness gate truthful and reproducible

**Files:**
- Modify: `scripts/scalability/profileBrowser.ts`
- Create: `scripts/scalability/workflows.ts`
- Create: `scripts/scalability/assertBrowserProfile.ts`
- Create: `scripts/scalability/assertBrowserProfile.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `type WorkflowName = 'load' | 'rename' | 'property-edit' | 'create-delete' | 'tree-expand' | 'tree-search' | 'undo' | 'redo' | 'save-reopen'`.
- Produces: `evaluateBrowserProfile(profile: BrowserProfile, limits: ProfileLimits): GateResult`.
- Produces: `npm run profile:sysml -- --size=10000 --samples=5 --no-cpu-profile` and `npm run gate:sysml-profile -- <json-path>`.

- [ ] **Step 1: Write failing evaluator tests.** Cover exactly-at-limit failure, five-sample p95 calculation, a fast handler followed by a slow heartbeat, and a long task above 100 ms.
- [ ] **Step 2: Run `npx vitest run scripts/scalability/assertBrowserProfile.test.ts`; expect failure because the evaluator does not exist.**
- [ ] **Step 3: Implement workflow/result types and the pure evaluator.** Return `{ passed, failures, workflows }`; each failure must name the workflow, metric, observed value, and limit.
- [ ] **Step 4: Update the runner.** Make no-CPU-profile mode the acceptance default, collect five independent samples, retain CPU profiling as an explicit diagnostic flag, and record input-to-next-paint plus heartbeat delay.
- [ ] **Step 5: Add package scripts and run the unit test; expect all evaluator cases to pass.**
- [ ] **Step 6: Build and run the 10,000-element baseline against `vite preview`.** Save raw JSON under `artifacts/scalability/baseline/`; expect the gate to fail with the currently observed interaction p95 near 170–234 ms and load long task near 770 ms.
- [ ] **Step 7: Commit with `git commit -m "test(sysml): enforce end-to-end responsiveness gate"`.**

### Task 2: Attribute post-command stalls to exact React work

**Files:**
- Create: `src/features/sysml/performance/renderTelemetry.ts`
- Create: `src/features/sysml/performance/renderTelemetry.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `scripts/scalability/profileBrowser.ts`

**Interfaces:**
- Produces: `recordRenderCommit(area: 'workspace' | 'canvas' | 'explorer' | 'inspector', phase: 'mount' | 'update', actualDurationMs: number): void`.
- Produces: browser profile fields `reactCommits`, `paintDelayMs`, and `renderCountsByArea`.

- [ ] **Step 1: Write failing tests.** Verify telemetry is inert unless `?perfTelemetry=1` is present, keeps a bounded 500-entry buffer, and clears between workflow samples.
- [ ] **Step 2: Run `npx vitest run src/features/sysml/performance/renderTelemetry.test.ts`; expect failure.**
- [ ] **Step 3: Implement the bounded telemetry buffer and expose it through a test-only `window.__ADIA_PERF__` reader.**
- [ ] **Step 4: Wrap workspace, canvas, explorer, and inspector boundaries with React `Profiler` callbacks.** Add `performance.mark` before command dispatch and after the next animation-frame paint.
- [ ] **Step 5: Run the focused Vitest test and `npx tsc --noEmit --pretty false`; expect both to pass.**
- [ ] **Step 6: Re-run rename, undo, and redo with five samples.** Record the components responsible for at least 80% of post-command commit duration in `artifacts/scalability/diagnosis-10000.json`.
- [ ] **Step 7: Commit with `git commit -m "perf(sysml): measure render and paint latency"`.**

### Task 3: Project only the active diagram

**Files:**
- Create: `src/engine/sysml/projection/activeDiagramProjection.ts`
- Create: `src/engine/sysml/projection/activeDiagramProjection.test.ts`
- Modify: `src/engine/sysml/normalizedStore.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `projectActiveDiagram(store: NormalizedSysmlStore, diagramId: string): LegacyDiagramProjection`.
- Produces: `diagramElementIdsByDiagramId: Readonly<Record<string, readonly string[]>>` maintained by normalization and commands.

- [ ] **Step 1: Write failing tests.** Build a repository with two diagrams and assert that the projection returns only the active diagram's elements, links, and presentations; switching diagrams must reuse unchanged normalized entity maps.
- [ ] **Step 2: Run `npx vitest run src/engine/sysml/projection/activeDiagramProjection.test.ts`; expect failure.**
- [ ] **Step 3: Add the diagram-membership index to normalized store construction and command updates.** Update only the affected diagram entry for add/remove/create/delete operations.
- [ ] **Step 4: Implement `projectActiveDiagram` with direct indexed lookups.** Do not scan every repository definition to determine membership.
- [ ] **Step 5: Replace `projectLegacyDiagram(canonicalSysmlRepository, ...)` in `src/App.tsx` with the active-diagram selector.** Keep full-project repository access for reports, export, and validation.
- [ ] **Step 6: Run the focused test, `npm run test:sysml`, and TypeScript; expect all to pass.**
- [ ] **Step 7: Profile all supported diagram kinds at 10,000 elements.** Require BDD, IBD, package, requirements, and use-case diagram switching to satisfy the 100 ms interaction gate.
- [ ] **Step 8: Commit with `git commit -m "perf(sysml): project the active diagram by index"`.**

### Task 4: Replace full-tree rebuilding with paged explorer queries

**Files:**
- Create: `src/features/modelExplorer/modelExplorerQuery.ts`
- Create: `src/features/modelExplorer/modelExplorerQuery.test.ts`
- Modify: `src/features/modelExplorer/unifiedModelExplorerProjection.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/engine/sysml/normalizedStore.ts`

**Interfaces:**
- Produces: `getRootRows(store, options: { offset: number; limit: number }): ExplorerPage`.
- Produces: `getChildRows(store, parentId, options: { offset: number; limit: number }): ExplorerPage`.
- Produces: `searchExplorer(store, query, options: { offset: number; limit: number }): ExplorerPage`.
- `ExplorerPage` is `{ rows: readonly ExplorerRow[]; total: number; nextOffset: number | null; revision: number }`.

- [x] **Step 1: Write failing tests with 50,000 entities.** Assert a collapsed root query visits only indexed roots, an expanded node visits only its indexed children, results page at 200 rows, and selection resolves by ID without constructing unrelated nodes.
- [x] **Step 2: Run the focused test; expect failure because query functions do not exist.**
- [x] **Step 3: Add parent/child and lowercase-search-token indexes to normalized store creation and incremental command updates.**
- [x] **Step 4: Implement the three paged queries with revision-keyed caches.** Invalidate only the changed parent, changed entity, or search token.
- [x] **Step 5: Change `AppModelExplorer` to request roots and expanded children on demand.** Keep `unifiedModelExplorerProjection` as the compatibility adapter for small non-SysML sources.
- [x] **Step 6: Run focused tests, existing model explorer tests, and TypeScript; expect all to pass.**
- [x] **Step 7: Profile expand, collapse, search, clear-search, and selection at 10,000 and 50,000 elements.** Require 10,000 to pass the 100 ms gate and record the 50,000 baseline.
- [x] **Step 8: Commit with `git commit -m "perf(explorer): query visible model rows lazily"`.**

### Task 5: Isolate editor state updates from the monolithic App render

**Files:**
- Create: `src/features/sysml/runtime/sysmlEditorStore.ts`
- Create: `src/features/sysml/runtime/sysmlEditorStore.test.ts`
- Create: `src/features/sysml/runtime/useSysmlEditorSelector.ts`
- Create: `src/features/sysml/runtime/SysmlWorkspace.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `createSysmlEditorStore(initial): { getState; subscribe; dispatch }`.
- Produces: `useSysmlEditorSelector<T>(selector: (state: SysmlEditorState) => T, isEqual?: (a: T, b: T) => boolean): T`.
- `SysmlEditorState` owns repository/store, active diagram ID, selection, coordinates, presentations, undo stack, and redo stack with independent revision counters.

- [x] **Step 1: Write failing store tests.** Verify rename changes entity and inspector revisions but not membership revision; coordinate drag changes presentation revision only; diagram switching changes active-view revision only; undo/redo emit one atomic notification.
- [x] **Step 2: Run the store test; expect failure.**
- [x] **Step 3: Implement the external store using immutable slice replacement and `useSyncExternalStore`.** Preserve the existing command gateway as the only mutation entry point.
- [x] **Step 4: Extract `SysmlWorkspace` and subscribe canvas, explorer, and inspector to the smallest required slices.** Replace the duplicated `canonicalSysmlRepository`/`sysmlStore` React state updates in `App.tsx` with one atomic store dispatch.
- [x] **Step 5: Add render-count assertions.** A rename must not rerender unrelated application panels; a coordinate drag must not rebuild explorer rows; a tree expansion must not reproject the canvas.
- [x] **Step 6: Run store tests, `npm run test:sysml`, TypeScript, and the production browser profile.** Require rename, undo, redo, property edit, and create/delete to pass the 100 ms gate before continuing.
- [x] **Step 7: Commit with `git commit -m "perf(sysml): isolate editor updates with slice subscriptions"`.**

### Task 6: Move project load and save preparation off the renderer thread

**Files:**
- Create: `src/engine/sysml/workers/projectIo.worker.ts`
- Create: `src/engine/sysml/workers/projectIoClient.ts`
- Create: `src/engine/sysml/workers/projectIoClient.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/projectFiles/projectFileService.cjs`

**Interfaces:**
- Produces: `loadProjectInWorker(bytes: ArrayBuffer, signal?: AbortSignal): Promise<LoadedProject>`.
- Produces: `serializeProjectInWorker(snapshot: SerializableProject, signal?: AbortSignal): Promise<ArrayBuffer>`.
- Worker progress phases are `read`, `parse`, `migrate`, `normalize`, `validate`, and `serialize`.

- [x] **Step 1: Write failing client tests.** Verify progress ordering, cancellation, stale-result rejection, worker error propagation, and transfer of `ArrayBuffer` without copying.
- [x] **Step 2: Run the focused test; expect failure.**
- [x] **Step 3: Implement the typed worker protocol.** Parse JSON, run migrations, build normalized indexes, and run load-time validation in the worker; return serializable data plus diagnostics.
- [x] **Step 4: Integrate load with an atomic store swap.** Show progress while the old project remains usable, then commit the loaded snapshot once.
- [x] **Step 5: Integrate save preparation.** Snapshot once, serialize in the worker, and pass the resulting bytes to the existing native file service.
- [x] **Step 6: Run project-file tests, SysML tests, TypeScript, and production load/save profiles.** Require 10,000-element load and save/reopen to have no heartbeat delay or long task above 100 ms.
- [x] **Step 7: Commit with `git commit -m "perf(project): move SysML load and save work to a worker"`.**

### Task 7: Turn all missing workflows into a release gate

**Files:**
- Create: `tests/performance/sysml-scalability.spec.ts`
- Modify: `scripts/scalability/workflows.ts`
- Modify: `package.json`
- Modify: `docs/scalability/2026-10-05-remediation-results.md`
- Modify: `task.md`

**Interfaces:**
- Produces: `npm run test:sysml:scalability`.
- Produces: one JSON result per size plus `artifacts/scalability/qualification-summary.json`.

- [ ] **Step 1: Write Playwright cases for load, rename, property edit, create/delete, tree expand/search, undo, redo, native save/reopen, diagram switch, and the stress diagram.** Use deterministic element IDs and verify persisted semantic values after reopen.
- [ ] **Step 2: Run the suite at 1,000 elements; expect functional assertions to pass and the performance evaluator to execute.**
- [ ] **Step 3: Run the production suite at 10,000 elements with five samples per workflow.** Any p95 heartbeat at or above 100 ms or interaction long task above 100 ms must exit nonzero.
- [ ] **Step 4: Run the same suite at 50,000 elements.** Set the supported-tier limit to 200 ms initially; if every workflow is below 100 ms, record 100 ms as the limit instead.
- [ ] **Step 5: Update the remediation report with raw artifact paths, machine specification, commit SHA, pass/fail per workflow, and the highest fully passing tier.**
- [ ] **Step 6: Mark `task.md` items complete only when their linked artifact passes.** Keep larger tiers open when evidence is incomplete.
- [ ] **Step 7: Commit with `git commit -m "test(sysml): qualify complete large-model workflows"`.**

### Task 8: Add chunked persistence and lazy hydration for 250,000–1,000,000 elements

**Files:**
- Create: `src/engine/sysml/persistence/chunkedProjectFormat.ts`
- Create: `src/engine/sysml/persistence/chunkedProjectFormat.test.ts`
- Create: `src/engine/sysml/persistence/lazyProjectStore.ts`
- Create: `src/engine/sysml/persistence/lazyProjectStore.test.ts`
- Modify: `src/engine/sysml/workers/projectIo.worker.ts`
- Modify: `src/projectFiles/projectFileService.cjs`

**Interfaces:**
- Produces: a versioned container manifest containing schema version, entity chunk table, diagram membership table, search-index chunks, checksums, and legacy-project metadata.
- Produces: `openLazyProject(source): Promise<LazyProjectStore>` with `getEntity`, `getChildren`, `getDiagram`, `search`, `flush`, and `close`.

- [ ] **Step 1: Write failing round-trip tests.** Cover old JSON `.adia` import, chunk checksum failure, interrupted-save recovery, atomic replacement, and random access that reads only the required chunks.
- [ ] **Step 2: Run persistence tests; expect failure because the chunked format does not exist.**
- [ ] **Step 3: Implement the manifest and fixed-size entity chunks.** Use stable IDs and schema-versioned codecs; retain legacy JSON reading.
- [ ] **Step 4: Implement lazy hydration with an LRU cache and dirty-chunk tracking.** Flush to a temporary file and atomically replace the target only after checksums succeed.
- [ ] **Step 5: Connect worker load/save to the lazy store for projects above 50,000 elements.** Keep the current path for smaller and legacy projects.
- [ ] **Step 6: Run round-trip tests, project-file tests, SysML tests, and TypeScript; expect all to pass.**
- [ ] **Step 7: Run 250,000-element load/edit/save/reopen tests.** Require semantic equality, bounded renderer memory below 1.5 GB, and no renderer task above 200 ms.
- [ ] **Step 8: Run the 1,000,000-element capacity soak.** Require successful open, search, diagram access, edit, undo/redo, save/reopen, and 30-minute idle/edit memory stability; publish measurements without calling the tier supported unless every gate passes.
- [ ] **Step 9: Commit with `git commit -m "feat(project): add lazy chunked storage for massive models"`.**

### Task 9: Final regression, evidence, and support statement

**Files:**
- Modify: `docs/scalability/2026-10-05-remediation-results.md`
- Modify: `task.md`

**Interfaces:**
- Consumes: all automated gates and raw artifacts from Tasks 1–8.
- Produces: an evidence-backed support matrix for 10k, 50k, 250k, and 1M tiers.

- [ ] **Step 1: Run `npm run test:sysml:release`, `npm run test:project-files`, `npm run test:sysml:scalability`, and `npx tsc --noEmit --pretty false`; require zero failures.**
- [ ] **Step 2: Run `git diff --check`; require no whitespace errors.**
- [ ] **Step 3: Re-run the highest claimed tier on a clean production build and archive five-sample raw results, summary, machine specification, and commit SHA.**
- [ ] **Step 4: Update the report's support matrix.** Use `Supported` only for a tier that passes every workflow; otherwise use `Experimental` or `Not qualified` and list the failing metric.
- [ ] **Step 5: Review the final diff for duplicated source-of-truth state, unbounded arrays/caches, full-repository scans on UI paths, and test-only telemetry leaking into normal builds.**
- [ ] **Step 6: Commit with `git commit -m "docs(sysml): publish scalability qualification evidence"`.**

---

## Delivery Order and Stop Conditions

Tasks 1–7 form the first release: they must make the 10,000-element tier pass and provide a measured 50,000-element result. Task 8 starts only after Task 7 passes at 10,000 because chunked persistence cannot compensate for a renderer that still performs whole-model React work. Stop increasing the advertised capacity whenever a lower tier fails; fix the named workflow, rerun five samples, and retain the failed artifact for comparison.

The expected product output is a responsive 10,000-element editor, a qualified 50,000-element tier if its gate passes, background load/save with progress and cancellation, lazy explorer and active-diagram rendering, automated freeze regression tests, and an evidence-based path to 250,000 and 1,000,000 elements through chunked persistence.
