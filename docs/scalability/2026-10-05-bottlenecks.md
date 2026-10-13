# ADIA scalability: command-to-render profile

Date: 5 October 2026. This is diagnostic evidence for Task 2 of the [million-element plan](../superpowers/plans/2026-10-05-adia-million-element-scalability.md). No application optimization was made in this profiling pass.

## Result

A real 10,000-element mixed project still produces a visible production-browser stall on an ordinary committed rename: **828 ms maximum heartbeat gap**, with one 671 ms Long Task. Only 28 Model Browser rows were mounted, so DOM virtualization alone is not enough. The edit handler took 141 ms; most of the pause occurred in subsequent synchronous render/projection work.

| Production browser, 10k mixed model | Measured |
|---|---:|
| `.adia` payload | 3.02 MiB |
| Active diagram presentations | 250 |
| Mounted Model Browser rows | 28 |
| Import through settled view | 2,444 ms |
| Longest import heartbeat gap | 910 ms |
| Committed rename handler | 141 ms |
| Rename through settled view | 883 ms |
| Longest edit heartbeat gap | 828 ms |
| Page JavaScript errors | 0 |

This run used a newly built Vite production frontend and a real file import and command gateway. It was a single diagnostic run, not a latency distribution. Raw timing and CPU data: `artifacts/scalability/profile-browser-10000.json` and `profile-browser-10000.cpuprofile`.

## Isolated stage timings

The Node probe advances the gateway state after a committed rename, checks the changed repository, and checks undo. It measures the App-equivalent derived stages separately. These numbers **must not be added**: the visual-parent index is included in the full Model Browser projection, and the isolated stage sequence is not the React scheduler.

| Stage | 10k mixed | 50k mixed | Why it matters |
|---|---:|---:|---|
| Committed gateway rename | 156 ms | 1,152 ms | Synchronous validation and command work occur before return. |
| Redundant App store rebuild | 19 ms | 130 ms | App reconstructs indexed state after the gateway already returns a store. |
| Whole legacy canvas projection | 69 ms | 166 ms | Runs on repository changes without limiting to the active diagram. |
| Active diagram legacy projection, for comparison | 17 ms | 73 ms | Same projection with active diagram ID. |
| V4 inspector projection | 311 ms | 4,288 ms | Whole repository is converted during App render. |
| Diagram visual-parent index alone | 428 ms | 1,938 ms | Part of the Model Browser projection. |
| Full Model Browser projection | 525 ms | 2,424 ms | Recomputed after repository changes despite only 28 visible rows in the 10k browser test. |
| Committed undo | 149 ms | 1,052 ms | Full command path also affects undo. |

Raw stage and post-stage RSS/heap snapshots: `artifacts/scalability/profile-edit-10000.json` and `profile-edit-50000.json`. Each stage was measured once per fresh Node process. The post-stage memory readings are not peak allocations or leak evidence.

## Bottleneck ranking and evidence

1. **Diagram visual-parent construction.** `src/features/modelExplorer/diagramTreeContext.ts` builds a new `Set(presentation.elementIds)` inside the loop over *every relationship and diagram*. With R relationships, D diagrams, and P presented IDs, this repeats work approximately R×D times and adds a P-sized allocation per iteration. The production CPU profile's minified `JDn` maps to this function and accounts for 283 ms sampled self time during the profiled edit. First candidate: precompute one presented-ID set and hidden-ID set per diagram per projection, then preserve existing precedence and grouping semantics in differential tests.
2. **V4 conversion during ordinary render.** `src/engine/sysml/persistence/migrateV3ToV4.ts` registers elements by checking `owned.includes(element.id)` and copying the owned array on each insert. Wide owner groups make this quadratic. `src/App.tsx` derives `inspectorRepoV4` from the whole canonical repository on changes. The production CPU profile's minified `dO` maps to the conversion function (141 ms sampled self time); the isolated 50k conversion took 4.29 s. First candidate: a linear internal owner collector while preserving deterministic output and V4 identity. Then prevent full conversion for an inspector that needs only a selected element, after proving all consumers.
3. **Full synchronous validation and gateway work.** The gateway performs staged `validateSysmlRepository` for an ordinary rename. A committed rename took 1.15 s at 50k in the isolated path. Dependency-scoped validation needs a rule dependency map and full-validation differential oracle before replacing it; moving unsound validation off-thread would only hide errors.
4. **Eager full Model Browser projection and duplicate App views.** VirtualTree bounds DOM rows but not projection objects. The 50k tree contained 59,874 nodes; full construction took 2.42 s, including visual-parent work. App separately rebuilds the store and whole legacy/V4 projections. These should be reduced incrementally after the first two hotspots, with React update identity and undo/redo tests.
5. **Persistence and capacity remain separate unqualified paths.** The previous Task 1 run measured in-memory serialization/deserialization, not the native `.adia` save/reopen workflow. It did not measure packaged Electron or establish 250k OOM. The user-facing 50 MiB limit still requires a measured, compatible migration before a million-element claim.

## Baseline review correction

The Task 1 delivery text said 250k and above exhausted 4 GiB; the raw result records only a **180-second total-run timeout at 250k**, with 500k and 1M skipped. It also called the Playwright test “production,” but `playwright.config.ts` starts `npm run dev`; this report supplies a separate production-browser run.

The Task 1 `benchWorker.ts` ran repeated `gatewayEdit` and `undoRedo` calls against the same gateway state without advancing it or asserting commits. Its edit/undo rows are diagnostic timings on stale state, not a valid sequence of ordinary user actions. The new `profileEdit.ts` checks a committed rename, advances state, and checks committed undo. The Task 1 report now states these limitations. The baseline remains incomplete for real save/reopen, creation, Model Browser expansion, diagram pan/zoom, application startup at large sizes, and five-sample p95 latency. These measurements are required before claiming the Task 1 review gate fully satisfied.

## Next safe change and review gates

The first isolated optimization should target the visual-parent index, with small-model output equivalence tests across BDD, IBD, Package, Use Case, Requirements and relationship hiding/precedence. Repeat the exact production 10k browser run and the 10k/50k Node stages after the change. If the gap remains above 100 ms, the V4 conversion is the next measured target, followed by scoped gateway validation and lazy Browser projection. Update the original implementation-plan order only with these recorded results.

No million-element capacity claim follows from this profile. The reported limits apply to one 10k mixed production-browser run and single-sample 10k/50k Node stage probes on this workstation.
