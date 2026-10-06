# ADIA scalability final fixes — measured status

## Implemented fixes

- Load validated JSON in a worker, stream all 16 repository collections with acknowledgements, and construct normalized indexes incrementally before publication. Keep original data for invalid loads or changed State endpoint context.
- Prepare saved SysML data and the timestamp-free saved snapshot in the worker. Save from the current command gateway state; refuse save while project hydration has not committed.
- Yield between worker delivery, desktop buffer decoding, JSON parsing, and IPC handoff. The desktop object protocol is retained; parsing itself remains synchronous.
- Schedule model publication and diagram navigation with React transitions. Project the active diagram, share owned immutable history snapshots, and avoid sorting the entire model during undo/redo.
- Avoid a forced layout read in the virtual tree and remove duplicate whole-model background validation whose result was ignored. Gateway/import validation remains in place.
- Route baseline creation/cloning, suspect-link clearing, and requirement Copy synchronization through reversible gateway commands so immediate saves and subsequent commands preserve those changes.
- Register X-Bridges worker dispatchers only inside workers. Importing shared helpers into the main window previously replaced its message handler and posted responses to unrelated window messages.
- Include initial load in the responsiveness gate, wait for rendered revisions and hydration completion, and exercise real save preparation with an intercepted desktop save response.

## Production evidence

Source change: worktree commit `702530ec`, integrated locally as `3482033e` on `co-work`. Production build: `npx vite build`; 10k asset `index-MKLT7SjQ.js`, final 50k asset `index-4bSdr9SJ.js`, I/O worker `projectIo.worker-1nse2qX9.js`. Browser: Playwright Chromium, normal scheduling project, Vite preview at `127.0.0.1:3115`. Host: Windows x64, Intel i7-6700HQ (4 physical cores/8 logical processors), 16 GB RAM, Node 24.20.0.

[Raw 10k profile](evidence/2026-10-06/10k-qualified.json): five samples per interactive workflow; initial load is one cold sample. The 10k gate passed without CPU profiling, with heartbeat p95 below 100 ms and no interaction long task above 100 ms.

| Workflow | Heartbeat median (ms) | Heartbeat p95/max (ms) |
|---|---:|---:|
| Rename | 30.0 | 36.5 |
| Undo | 26.8 | 31.3 |
| Redo | 26.9 | 38.6 |
| Property edit | 19.6 | 29.9 |
| Create/delete | 29.1 | 35.6 |
| Tree expand | 16.9 | 18.6 |
| Tree search | 16.6 | 18.5 |
| Diagram switch | 32.2 | 52.9 |
| Stress diagram | 22.9 | 43.1 |
| Save/reopen | 66.6 | 81.7 |
| Initial load (single sample) | — | 70.3 |

Initial load took 1494.7 ms in total; its longest task was 63 ms. Save/reopen's longest task was 50 ms. A passing responsiveness gate means the UI can service input during the operation, not that loading/saving finishes within 100 ms.

The final [50k profile](evidence/2026-10-06/50k-qualified.json) passed its recorded 200 ms gate after separating desktop decode/parse/IPC tasks. Its earlier [failed save/reopen measurement](evidence/2026-10-06/50k-before-desktop-handoff-yields.json) is retained; p95 improved from 314.9 to 149.1 ms.

| 50k workflow | Heartbeat median (ms) | Heartbeat p95/max (ms) |
|---|---:|---:|
| Rename | 101.1 | 107.7 |
| Undo | 101.1 | 107.9 |
| Redo | 102.9 | 126.0 |
| Property edit | 105.6 | 108.4 |
| Create/delete | 107.8 | 151.5 |
| Tree expand | 17.0 | 19.4 |
| Tree search | 17.0 | 18.0 |
| Diagram switch | 86.4 | 116.0 |
| Stress diagram | 53.8 | 57.7 |
| Save/reopen | 124.3 | 149.1 |
| Initial load (single sample) | — | 121.1 |

50k load took 7216.7 ms in total; its longest task was 72 ms. The longest interactive task was 151 ms (rename). This qualifies the measured responsiveness workflows at the **50k 200 ms budget**, not the 10k 100 ms budget or a complete capacity/memory/disk release.

## Measurement limits and remaining work

- Load timing begins at the FileReader `onload` handler. It excludes Playwright's file injection and file reading before that handler.
- Save/reopen includes real payload preparation and completion bookkeeping, with desktop IPC intercepted in the test. It does not qualify physical disk writing, Electron packaging, or the actual desktop IPC memory cost.
- Concurrent V-Lab work was present on this host. The saved profile is a measured run on this machine, not a portable latency guarantee.
- 10k and 50k responsiveness runs pass their respective budgets. No 250k or 1M production support is established. A fresh 10k run on the integrated workspace is pending.
- The external editor store and slice-selector modules exist, but the main App has not completed migration to them. Repository/store state still coexists in App.
- Binary persistence is a prototype: its worker loader does not preserve every collection, automatic size detection occurs after JSON preparation, and desktop IPC expects JSON. Do not enable or advertise it as a safe production large-model save format.
- Full desktop release packaging and a 30-minute memory/capacity soak remain separate gates. These fixes do not establish MATLAB/Cameo feature completeness.

## Verification

Final SysML regression: 125 files / 1215 tests passed. Reporting, gate evaluator, virtual tree/history, X-Bridges worker/client/environment, and desktop JSON handoff: 27 files / 108 tests passed. All five project-file lifecycle suites passed. Incremental TypeScript check and Vite production build passed. Contextual load/helper and X-Bridges root-locus checks also passed earlier.

`npm run audit:prebuild` failed with four reported production dependency vulnerabilities (one low, two high, one critical): `@capacitor/android`, nested `brace-expansion`, `dompurify`, and `source-map-js`. Dependency upgrades were not included in this renderer remediation. The desktop release build/security gate is **not qualified**; passing Vite build and responsiveness tests do not establish release readiness.
