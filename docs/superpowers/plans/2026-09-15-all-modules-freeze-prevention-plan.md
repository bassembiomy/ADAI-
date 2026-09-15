# All-Modules Freeze Prevention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent computationally heavy diagrams, simulations, reports, analysis, and telemetry processing from blocking the renderer while preserving existing numerical accuracy and application features.

**Architecture:** Introduce one typed background-task protocol and worker client pattern, then migrate each heavy module to it. Workers receive serializable snapshots and return typed results; the UI owns rendering, cancellation, progress, and stale-result rejection. Bounded rendering batches and event-driven cancellation protect the UI even when a worker is unavailable, while numerical solver equations and requested timesteps remain unchanged.

**Tech Stack:** TypeScript, Vite module Web Workers, React 18, Vitest, existing VLAB/X-Bridges/SysML/DOE/OPM/HIL engines.

## Global Constraints

- Do not change solver equations, model parameters, tolerances, requested timesteps, or numerical result formats.
- Do not remove existing modules, learning labs, scopes, exports, diagnostics, or fallback behavior.
- Every worker request must have a request ID and stale responses must be ignored.
- Every worker must support cancellation/disposal and convert thrown errors into user-visible diagnostics.
- Main-thread fallback is allowed only for small work or explicit worker unavailability; large work must fail safely with an actionable message instead of blocking indefinitely.
- Add a regression test before each production change and run the focused test before moving to the next task.

## File Map

- Create `src/services/backgroundTaskProtocol.ts` and `src/services/backgroundWorkerClient.ts` for shared request IDs, cancellation, errors, and diagnostics.
- Create one worker/client pair per domain where imports and state are materially different: `src/engine/xbridges/xbridgesWorker.ts`, `src/services/xbridgesWorkerClient.ts`, `src/engine/doe/doeWorker.ts`, `src/services/doeWorkerClient.ts`, and report/analysis workers under `src/engine/sysml/`.
- Keep domain engines in their existing files; workers call those engines rather than duplicating algorithms.
- Modify UI orchestration files only to submit work, receive results, update progress, and throttle rendering.

---

### Task 1: Establish shared background-task infrastructure

**Files:**
- Create: `src/services/backgroundTaskProtocol.ts`
- Create: `src/services/backgroundWorkerClient.ts`
- Test: `src/services/backgroundWorkerClient.test.ts`

**Interfaces:**
- Produce `BackgroundRequest<T> { requestId: number; kind: string; payload: T }`.
- Produce `BackgroundResponse<R> { requestId: number; ok: boolean; result?: R; error?: { message: string; stack?: string } }`.
- Produce `BackgroundWorkerClient<TRequest, TResult>.run(payload): Promise<TResult>`, `cancel(requestId): void`, `dispose(): void`, and `available: boolean`.

- [ ] Write tests for request-ID matching, stale response rejection, worker error propagation, cancellation, and disposal.
- [ ] Run `npx vitest run src/services/backgroundWorkerClient.test.ts`; verify the tests fail before implementation.
- [ ] Implement the typed client and protocol without domain imports.
- [ ] Run the focused test and verify all cases pass.
- [ ] Commit as `feat: add shared background task runtime`.

### Task 2: Harden and complete the VLAB worker runtime

**Files:**
- Modify: `src/services/vlabWorkerClient.ts`
- Modify: `src/engine/vlab/vlabWorker.ts`
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Test: `src/services/vlabWorkerClient.test.ts`
- Test: `src/components/vlab/VLabWorkspace.test.tsx`

**Interfaces:**
- Keep `VLabWorkerClient.step(nodes, edges, configuration, previousState, dt): Promise<any>`.
- Add serialized configuration-change handling and a single in-flight step guard so overlapping interval ticks cannot reuse stale state.

- [ ] Add a failing test proving a second step is queued or skipped while the first step is pending.
- [ ] Add a failing test proving worker errors stop the run with the existing diagnostic path.
- [ ] Implement serialized step dispatch, cancellation on pause/stop/unmount, and stale-result rejection.
- [ ] Verify identical state/output against direct `VLabPhysicsEngine.simulateStep` for representative PID, thermal, and electrical fixtures.
- [ ] Run `npx vitest run src/services/vlabWorkerClient.test.ts src/components/vlab/VLabWorkspace.test.tsx`.
- [ ] Commit as `fix: isolate VLAB simulation from renderer`.

### Task 3: Move X-Bridges simulation off the renderer

**Files:**
- Create: `src/engine/xbridges/xbridgesWorkerProtocol.ts`
- Create: `src/engine/xbridges/xbridgesWorker.ts`
- Create: `src/services/xbridgesWorkerClient.ts`
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx:1555-1835`
- Test: `src/services/xbridgesWorkerClient.test.ts`
- Test: `src/engine/xbridges/xbridgesWorker.test.ts`

**Interfaces:**
- Worker request: model snapshot, solver options, current engine snapshot, and requested step/batch size.
- Worker response: engine snapshot, output values, simulation time, diagnostics, and optional progress.

- [ ] Add an equivalence test comparing worker and direct `XbridgesEngine` one-step outputs for PID, integrator, and coupled models.
- [ ] Add a cancellation test for an adaptive-solver request.
- [ ] Implement worker-side engine creation/reuse and state serialization.
- [ ] Replace synchronous solver calls in the animation callback with worker requests; allow only one in-flight request and apply the latest completed state.
- [ ] Throttle ReactFlow node synchronization to a bounded display rate while keeping worker simulation steps unchanged.
- [ ] Run X-Bridges engine tests and worker tests.
- [ ] Commit as `fix: isolate X-Bridges simulation from renderer`.

### Task 4: Protect X-Bridges analysis and rendering paths

**Files:**
- Create: `src/services/xbridgesAnalysisWorker.ts`
- Modify: `src/components/xbridges/XbridgesRootLocusWindow.tsx`
- Modify: `src/components/xbridges/XbridgesScopeWindow.tsx`
- Modify: `src/components/xbridges/XBlockNode.tsx`
- Test: `src/components/xbridges/XbridgesRootLocusWindow.test.tsx`

- [ ] Add a failing test that root-locus calculation is deferred and stale calculations cannot replace newer parameters.
- [ ] Move root-locus sweeps and high-order root matching to a worker.
- [ ] Cap canvas history used for drawing with a configurable display window while preserving full export history.
- [ ] Memoize static geometry and redraw only when geometry or sampled state changes.
- [ ] Verify animation cleanup cancels every `requestAnimationFrame` on unmount.
- [ ] Run focused X-Bridges UI tests and commit as `perf: isolate X-Bridges analysis and rendering`.

### Task 5: Make SysML large-model and reporting work non-blocking

**Files:**
- Modify: `src/services/sysmlWorkerClient.ts`
- Modify: `src/components/sysml/VirtualizedDiagram.tsx`
- Modify: `src/components/sysml/TraceabilityMatrix.tsx`
- Modify: `src/features/reporting/reportDiagrams.ts`
- Modify: `src/features/reporting/reportDiagramLayout.ts`
- Modify: `src/App.tsx`
- Create/Test: `src/engine/sysml/reportWorker.ts`, `src/engine/sysml/reportWorker.test.ts`

- [ ] Add tests for large report generation, RTM equivalence, cyclic requirement graphs, and stale report responses.
- [ ] Remove synchronous large-work fallback for payloads above the existing worker threshold; return a clear recoverable diagnostic when no worker exists.
- [ ] Route report snapshot/index/matrix/diagram generation through the worker.
- [ ] Add visited-set and depth protection to recursive requirement rendering.
- [ ] Build reusable maps for relationship/node lookup instead of repeated `find()` scans.
- [ ] Reuse spatial indexes during viewport culling instead of rebuilding them on every revision.
- [ ] Run SysML worker, reporting, and large-model tests; commit as `fix: isolate SysML analysis and reports`.

### Task 6: Move DOE/GMDH and surface evaluation to workers

**Files:**
- Create: `src/engine/doe/doeWorker.ts`
- Create: `src/services/doeWorkerClient.ts`
- Modify: `src/components/doe/PlotlyPlots.tsx`
- Modify: `src/components/doe/DOEWorkspace.tsx`
- Modify: `src/engine/doe/statistics.ts` only if a pure serialization adapter is needed
- Test: `src/services/doeWorkerClient.test.ts`
- Test: `src/engine/doe/doeWorker.test.ts`

- [ ] Add equivalence tests for RSM, GMDH, Taguchi, and 41×41 surface results.
- [ ] Add cancellation/progress tests for GMDH layer and cross-validation work.
- [ ] Run training and surface prediction in the worker; keep Plotly updates on the UI thread.
- [ ] Batch surface points and publish progress so cancellation remains responsive.
- [ ] Preserve existing model objects, diagnostics, and exports exactly.
- [ ] Run DOE tests and commit as `fix: isolate DOE and GMDH computation`.

### Task 7: Batch HIL telemetry and protect OPM heavy operations

**Files:**
- Modify: `src/components/hil/HILDashboard.tsx`
- Modify: `src/engine/hil/hilSerialSession.ts`
- Create/Test: `src/services/hilTelemetryBuffer.ts`, `src/services/hilTelemetryBuffer.test.ts`
- Modify: `src/engine/opm/canonicalHash.ts`
- Modify: `src/engine/opm/runtime.ts`
- Test: `src/engine/opm/runtime.test.ts`

- [ ] Add telemetry-buffer tests proving many incoming lines produce one bounded UI update per frame while preserving sample order.
- [ ] Replace per-line React state updates with a ring buffer and scheduled flush; bound Plotly history separately from full recording/export storage.
- [ ] Add cancellation/yield boundaries around optional OPM analysis and ensure configured runtime limits remain enforced.
- [ ] Keep `execFileSync` confined to Node/test qualification paths and expose an async API for UI callers.
- [ ] Add indexed lookup maps for OPM runtime hot paths without changing event ordering.
- [ ] Run HIL and OPM tests and commit as `perf: batch HIL telemetry and harden OPM work`.

### Task 8: Add application-wide freeze regression and performance gates

**Files:**
- Create: `tests/performance/no-renderer-blocking.spec.ts`
- Modify: `package.json`
- Modify: `docs/performance-baseline.md`

- [ ] Add browser tests that start representative VLAB, X-Bridges, SysML, DOE, and HIL workloads and assert input heartbeat/progress messages continue during computation.
- [ ] Add worker equivalence fixtures for numerical outputs and report outputs.
- [ ] Add scripts for focused worker tests and performance tests.
- [ ] Record baseline and target metrics: maximum main-thread task, worker completion, cancellation latency, and output equivalence.
- [ ] Run the complete focused suite, `npx tsc --noEmit`, and the production build.
- [ ] Commit as `test: add cross-module freeze regression gates`.

## Final Acceptance Checklist

- [ ] VLAB, X-Bridges, SysML, DOE, HIL, and OPM high-cost paths execute outside the renderer or are explicitly bounded and batched.
- [ ] No solver equations, numerical settings, or exported result schemas changed.
- [ ] Pause, stop, reset, cancellation, errors, and unmount cleanup work in every migrated module.
- [ ] Worker and direct execution outputs match within each module’s existing test tolerance.
- [ ] Large-model fallback cannot silently perform unbounded work on the UI thread.
- [ ] Full TypeScript check, focused tests, performance tests, and production build pass.
