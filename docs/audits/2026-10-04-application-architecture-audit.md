# ADIA application architecture and large-model audit

Date: 4 October 2026. Scope: the local working tree, including existing uncommitted changes. This is an audit, not an implementation change or release certification.

**Verdict: ADIA has real engineering engines and useful architectural foundations, but it is only partially layered. Large-model UI freezing is reproducible in the production frontend. The evidence does not support describing the current application as having MATLAB/Simulink- or Cameo-level production robustness.**

## Assessment

| Question | Assessment | Evidence |
|---|---|---|
| Are the layers real? | Partly. A modular application with genuine engines, services, workers, and an Electron boundary; substantial responsibilities remain concentrated in the UI. | SysML command gateway, worker clients, domain engines; approximately 21,900 lines and 199 useState calls in App.tsx at inspection. |
| Is the core scalable? | Some primitives are. Their performance is not representative of the complete application. | Indexed lookups, patch history and culling are fast in microbenchmarks. Actual commands, projections, and tree reconstruction add substantial synchronous work. |
| Is the UI free of freezes on large models? | No. Confirmed in an optimized production frontend build. | Three edits of a 10,000-block model each stopped the browser heartbeat for 3.47–3.68 seconds in the confirmation run. |
| Are workers used? | Yes, but incompletely and with uneven cancellation/recovery. | V-Lab, X-Bridges, DOE and SysML workers exist. State-machine and OPM stepping still execute synchronously in their UI paths. |
| Is persistence production-ready for large models? | Not yet. | The native writer accepts a file larger than the native reader's 50 MiB ceiling; full JSON serialization and synchronous file I/O remain. |
| Is professional-tool equivalence demonstrated? | No. | Real responsiveness failures, inconsistent memory bounds, a certificate-validation defect, and incomplete end-to-end performance qualification. |

## Method and limitations

- Windows x64, Intel Core i7-6700HQ, 8 logical processors, 16 GiB RAM, Node v24.20.0.
- Static review of App, domain engines, command gateway, worker protocols, model projections, persistence, history, browser tests, release workflow, and Electron configuration.
- Fresh TypeScript, architecture, worker, project-file, freeze, benchmark and production frontend build checks.
- Real Chromium sessions importing an `.adia` payload through the application's file input, followed by the application's live `__sysmlExecuteCommand` handler. The command reaches the real gateway and React state updates; no substitute renderer was used.
- Fixtures are deliberately simple, wide models: all blocks are siblings under the root, with no ports or relationships. Only 100 blocks are placed on the active BDD. This exposes broad-tree scaling; timings are not a prediction for every model topology.
- Confirmation explicitly verified active diagram `audit-bdd`, mode `bdd`, 100 presented elements, and only 28 Model Explorer DOM rows.
- Heartbeat intervals include operation boundaries; browser Long Tasks and an independent CPU profile substantiate the stalls.
- Production frontend tested with Vite preview, not the packaged Electron executable. Native file/TLS findings were assessed in source and isolated probes. No full Electron packaging, hardware-in-the-loop qualification, multi-hour memory soak, numerical solver certification, or Cameo interchange qualification was performed.
- Other development processes were present on the workstation. These are diagnostic measurements, not controlled comparative benchmarks. Repeated multi-second production stalls and their CPU profile establish the defect despite timing variability.
- A 50,000-block live-browser attempt was interrupted; no completed 50,000-block browser result or supported capacity is claimed.

## Measurements

### Live production frontend

| Fixture | File import through settled rendering | Edit handler alone, three runs | Longest heartbeat gap during each edit |
|---|---:|---:|---:|
| 1,000 blocks, 100 placed | 481 ms | 18 / 7.5 / 8.5 ms | 96.7 / 86.8 / 98.1 ms |
| 10,000 blocks, 100 placed, first run | 6,374 ms | 154.9 / 122.4 / 114.2 ms | 4,350.1 / 3,625.3 / 3,266.7 ms |
| 10,000 blocks, 100 placed, confirmation | 4,394 ms | 142 / 125.9 / 102 ms | 3,620.1 / 3,473.6 / 3,678.9 ms |

All measured edit commands committed successfully. No page-level JavaScript exception was recorded. The problem is blocking computation, not a crash. The confirmation import's longest heartbeat gap was 3,580 ms.

Production CPU profiling attributed approximately 3,020 ms of sampled self time to the minified functions corresponding to tree `register` and `rebuildChildren`, both calling `addChild`. This is a separate profiled edit; its timings are not included in the unprofiled edit table.

### Synchronous service path, without React rendering

| Blocks | Gateway rename | App-equivalent store rebuild + whole-repository projection | Combined synchronous work |
|---|---:|---:|---:|
| 1,000 | 52.9 ms | 8.7 ms | 61.6 ms |
| 10,000 | 219.9 ms | 96.2 ms | 316.1 ms |
| 50,000 | 1,577.9 ms | 546.9 ms | 2,124.8 ms |

These are single Node measurements of the relevant production functions, not browser input-latency results. They exclude tree building and React rendering. A separate tree-only probe took 64.4 ms at 1,000 blocks and 4,801.5 ms at 10,000 blocks.

## Findings

### A1 — High: quadratic Model Explorer construction freezes the renderer

**Evidence:** `src/features/modelExplorer/unifiedModelExplorerProjection.ts:175–193`; `src/components/modelExplorer/AppModelExplorer.tsx:535`.

`addChild` searches the existing child array with `includes` for every insertion. For N siblings, this performs roughly N(N−1)/2 comparisons. Registration builds these lists, and `rebuildChildren` builds them again. The projection is recomputed from updated repository references during React rendering.

VirtualTree limits DOM rows but does not limit this preprocessing. The confirmation showed only 28 tree rows while edits still blocked for more than three seconds. The independent tree probe and production CPU profile identify this code as a dominant contributor.

**Remedy:** Build child memberships with sets or guarantee unique insertion in a single pass; update affected branches incrementally; keep expensive projection construction outside the render-critical path. Add a production-browser regression with 10,000 siblings and a 100-element diagram.

### A2 — High: ordinary SysML edits still perform whole-model synchronous work

**Evidence:** `src/App.tsx:6362`, `:6631`, `:6635`, `:8875`; `src/services/sysmlCommandGateway.ts:1411`, `:2454`.

The live handler calls synchronous `executeSysmlCommand`, passes no active diagram ID, and rebuilds the entire normalized store after a committed edit. App also derives a whole-repository legacy projection and a V4 inspector representation. The gateway validates the staged repository synchronously. The subsequent worker validation effect does not remove that earlier blocking work.

Fast `targetedUpdateEntity` and ID-set queries in benchmarks therefore do not represent the complete user edit. The 50,000-block service path alone took 2.12 seconds.

**Remedy:** Keep one authoritative indexed state; apply returned patches instead of reconstructing stores; project the active diagram and selected inspector element; perform dependency-scoped validation, with heavy validation/transactions in a worker while preserving atomic commit and revision checks.

### A3 — High: the native save path can produce a project the native open path rejects

**Evidence:** `src/projectFiles/projectFileService.cjs:7`, `:50`, `:60–70`; `src/App.tsx:8598`.

The reader rejects files larger than 52,428,800 bytes. The writer serializes and accepts data without enforcing the same limit. An isolated fake-filesystem probe accepted a 52,428,820-byte save and then received `Project file exceeds the 50 MB limit` on open. No large file was written to disk for this probe.

Native load/save also use synchronous filesystem calls and JSON parse/stringify. App's unified save still serializes full semantic and legacy representations; the existence of chunked persistence functions does not make that user path incremental.

**Remedy:** Make read/write limits consistent immediately and surface size failures before replacing a file. Move serialization and file work off critical threads; wire versioned chunked or streaming persistence into the actual project workflow. Test files around the boundary and interrupted writes/recovery.

### A4 — High: Electron certificate handling breaks trust and availability

**Evidence:** `src/main.cjs:137–145`; isolated callback results in the evidence directory.

The default session accepts any certificate when the hostname contains `3dexperience.3ds.com`, without checking the verification result. An invalid certificate for both the exact hostname and `3dexperience.3ds.com.example.invalid` received `0` in the extracted callback probe. The other branch returns `-2`, which rejects certificates; its comment incorrectly describes it as default validation.

Electron documents `0` as success, `-2` as failure, and `-3` as using Chromium's verification result. Thus the callback weakens trust for matching requests and can reject valid HTTPS requests to other hosts using this session. No network interception or exploit was attempted; reachability and impact depend on the session and navigation/request paths.

**Remedy:** Restore normal Chromium verification. If a business requirement actually needs pinning, use exact host boundaries and properly verified pinning, with valid/invalid certificate regression tests. [Electron reference](https://www.electronjs.org/docs/latest/api/session#sessetcertificateverifyprocproc).

### A5 — High: existing performance gates overstate application coverage

**Evidence:** `src/index.tsx:12`; `tests/performance/no-renderer-blocking.spec.ts:56–89`; `tests/e2e/sysml-large-model-performance.spec.ts`; `src/engine/sysml/largeModelStress.test.ts:41–42`.

- Freeze workloads contain four V-Lab nodes, two X-Bridges blocks, two SysML definitions, five DOE rows, and 200 HIL samples. They do not load representative large projects into module workspaces.
- SysML/HIL fixtures explicitly insert short delays, allowing heartbeats between small operations.
- The freeze monitor computes gaps between observed ticks but omits the initial and final gaps. A long blocking interval before the first recorded tick can escape that metric.
- The large-model browser suite's culling cases calculate synthetic visibility inside `page.evaluate`; they do not assert the actual editor DOM after importing those large models.
- A fixture test titled with “100k” only iterates 1k, 10k and 50k.
- Worker cancellation tests establish promise cancellation, not preemption of a running compute task.

All six existing freeze tests passed while the actual production editor froze. Two timing budgets failed on the initial benchmark run and passed on rerun, so their initial failures should not be treated as deterministic regressions.

**Remedy:** Measure complete real workflows in a production build: load, rename, drag, connect, search, undo/redo, save/reopen, simulate, stop/cancel, and export. Include operation boundaries and CPU long tasks, realistic model topology and signal history, explicit memory budgets, and soak testing.

### A6 — Medium/High: layers exist but boundaries and ownership are inconsistent

**Evidence:** `src/App.tsx`; `src/services/sysmlCommandGateway.ts`; `src/engine/opm/semanticValidator.ts:11`; `src/engine/opm/persistence.ts:17`; `src/engine/sysml/normalizedStore.ts:26`.

At inspection there were 673 non-test source files and approximately 246,000 source lines. App had approximately 21,900 lines, 147 imports and 199 useState calls. File size alone is not a defect; its concentration of state, model projection, persistence orchestration, UI rendering, and simulation lifecycle explains the broad update cost and change risk.

The OPM engine imports runtime semantic link rules from the components tree. Several engine modules obtain types from UI/service modules. Type-only imports do not add runtime dependencies, but they still place contracts in the wrong responsibility layer. Multiple repository/projection formats are converted in ordinary UI renders.

The passing architecture guard checks particular SysML mutation/storage patterns. It is not an application-wide dependency-direction or cycle analysis.

**Remedy:** Extract module controllers and stores from App; locate domain contracts and connection rules below UI; keep persistence adapters outside domain logic; enforce import boundaries automatically. Retain the useful engines and gateway rather than replace the entire application.

### A7 — Medium/High: worker lifecycle and simulation isolation are incomplete

**Evidence:** `src/services/sysmlWorkerClient.ts:303`; `src/engine/sysml/sysmlWorker.ts:117` and final message handler; `src/services/backgroundWorkerClient.ts`; `src/services/vlabWorkerClient.ts`; `src/utils/stateMachine/smAppAdapter.ts:415`, `:481`; `src/components/entropy/EntropyWorkspace.tsx:1097`.

SysML cancellation rejects a pending promise and posts a cancel message, while the worker executes its calculation synchronously inside its message handler. That message cannot interrupt the calculation already running. Client classes reviewed also lack a general per-request execution deadline and consistent worker restart after a fault. “Available” can remain true after an error.

State-machine `runAppSimulationTick` is async for I/O, but its `stepAppSimulationSession` calls `stepRuntime` synchronously. OPM stepping runs directly in a timer callback on the renderer. V-Lab and X-Bridges have useful worker-backed normal paths, but their reviewed code also contains main-thread fallback paths. Async syntax alone does not provide compute isolation.

**Remedy:** Use a consistent worker task lifecycle: bounded queue, deadlines, revision/generation checks, cooperative chunking or terminate-and-recreate cancellation, and explicit restart/recovery. Isolate the remaining simulation compute paths. Define supported behavior when workers are unavailable.

### A8 — Medium: rendering and history budgets are uneven across modules

**Evidence:** `src/components/sysml/UseCaseWorkspace.tsx:663–673`; `src/components/sysml/ActivityWorkspace.tsx:686–691`; `src/App.tsx:9021`; `src/components/entropy/EntropyWorkspace.tsx:464`; `src/services/sysmlCommandGateway.ts:2967`, `:3077`; `src/engine/sysml/patches.ts:209`, `:222`.

BDD/IBD have real culling infrastructure, and the explorer has actual row virtualization. Other reviewed workspaces render all projected nodes/edges, so those protections are not universal. Package rendering also does not share a complete equivalent culling path.

State-machine and OPM history capture full JSON snapshots with entry-count limits rather than byte budgets. SysML's patch history is bounded, but move/createDiagram branches additionally retain repository snapshots, and checkpoint snapshots are not included in the patch byte counter. This creates memory-pressure risk in long editing sessions; this audit did not establish a measured memory leak.

**Remedy:** Adopt consistent viewport-aware rendering and one byte-budgeted history strategy across modules, including checkpoints and compatibility state. Test wide diagrams, deep trees and extended edit/undo sessions.

### A9 — Medium: large startup bundle increases loading and integration cost

**Evidence:** fresh production frontend build in the evidence directory.

Vite produced an approximately 10.39 MB minified main JavaScript chunk, 2.59 MB gzip, and a chunk-size warning. Lazy Plotly chunks and separate workers do exist. The large main bundle still suggests substantial feature code is eagerly loaded into the shell.

**Remedy:** Load module workspaces, inspectors, exporters and expensive catalogs when needed. Track startup, module-switch and heap budgets in addition to output size. Bundle size alone does not explain the measured tree freeze.

## Existing strengths

- Genuine separated domain engines, a SysML mutation gateway, staged semantic validation, stable IDs and presentation/model distinctions.
- Indexed normalized storage, cached projections, spatial culling, virtualized tree rows and patch-history infrastructure.
- Worker implementations for several compute-heavy modules, stale-result rejection, and in-flight guards in simulation loops.
- Native atomic temporary-file replacement and format-upgrade backup support, with passing project-file tests.
- Electron uses nodeIntegration=false, contextIsolation=true and sandbox=true for its primary window. These strengths do not compensate for the certificate callback defect.
- A meaningful automated-test base and a Windows release workflow covering compilation, tests, browser workflows and builds.

## Fresh verification record

| Check | Result |
|---|---|
| `npx tsc --noEmit --pretty false` | Passed |
| `npm run test:sysml:architecture` | Passed; 0 unallowed notices, 2 allowlisted projection notices |
| Nine selected worker/client/telemetry test files | 45 tests passed |
| `npm run test:project-files` | Five test scripts passed |
| Existing Chromium freeze suite | 6 tests passed |
| Initial benchmark/stress/report-memory selection | 9 passed, 2 timing-budget failures: 24.64 ms versus 15 ms culling; 1,566.16 ms versus 1,500 ms hydration |
| Rerun of benchmark and stress files | All 8 tests passed; confirms timing sensitivity |
| Production frontend Vite build | Passed, with large-chunk warning |
| Production live large-model probe | Reproduced multi-second UI stalls, confirmed a second time |
| Native size-boundary probe | Reproduced save/open mismatch using a fake filesystem |
| Extracted certificate callback probe | Reproduced invalid-certificate acceptance and non-default fallback code |

## Comparison with professional tools

MATLAB/Simulink and Cameo should be treated as workflow and qualification benchmarks, not claims that those products never become slow. MathWorks documents performance analysis using Performance Advisor, Simulink Profiler and Solver Profiler. Cameo/MagicDraw documents model-size, memory, project-load and operation-performance considerations. [MathWorks](https://www.mathworks.com/help/simulink/ug/troubleshoot-and-speed-up-simulation-performance.html), [Cameo/MagicDraw](https://docs.nomagic.com/spaces/MD2024xR2/pages/189145989/Guidelines%2Bfor%2BWorking%2Bwith%2BLarge%2BModels).

ADIA has substantial implementation breadth. Equivalent reliability would require repeatable end-to-end performance envelopes, responsive cancellation, recovery evidence, numerical correctness on supported solver domains, semantic/interchange conformance on supported modeling features, and a documented supported capacity. This audit establishes that important gaps remain; it is not a comparative benchmark of the other products.

## Recommended order of work

1. Remove the quadratic explorer construction and repeat the exact production-browser fixture.
2. Repair native save/open size consistency and certificate verification.
3. Eliminate whole-model work from routine edits and adopt dependency-scoped validation/projection.
4. Standardize worker cancellation, deadlines and fault recovery; isolate remaining renderer simulation paths.
5. Consolidate state/history ownership, extend rendering budgets to every workspace, and split the application shell.
6. Replace synthetic-only scalability claims with real production-workflow, persistence, cancellation and soak gates.

Suggested acceptance criteria should be agreed against target hardware: ordinary edits should remain interactive, no unaccounted multi-second renderer tasks, complete-workflow heartbeat gaps within a documented budget, cancel acknowledged promptly with computation actually stopped, and every successfully saved supported project reopening without loss. Model limits should describe both total elements and active-diagram density.

## Evidence files

Audit scripts and raw measurements are in `artifacts/architecture-audit-2026-10-04/`:

- `gateway-probe.ts`, `gateway-probe-results.json`
- `projection-probe.ts`, `projection-probe-results.json`
- `browser-probe.ts`, `browser-probe-results.json` (initial development run)
- `browser-probe-production-results.json`
- `browser-probe-production-confirmation-results.json`
- `browser-production.cpuprofile`, `browser-production-confirmation.cpuprofile`
- `certificate-probe-results.json`, `file-size-probe-results.json`
- `production-dist/` (isolated frontend build used for production probes)

Only audit scripts, build artifacts, measurements and this report were created by this audit. Application source was not edited by the auditor.
