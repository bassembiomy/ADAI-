# TRM simulation loop (plan)

Planner/reviewer and test author: Opus (main session). Executor: Sonnet `trm-executor`, one WP at a time.
Branch: feature branch off `co-work`, PR into `co-work`. Never `git add -A`. Never edit `.adia` files.
Never weaken, skip or delete a test. Living copy of this plan: https://claude.ai/code/artifact/6441f0cb-6710-49ac-9eb9-1f9f4a841b14

## 0. User mandate (2026-10-14)
Any TRM (Requirements Traceability Matrix, `src/engine/sysml/rtm.ts`) requirement can be assigned to
state-machine, X-Bridges and V-Lab elements, ports and variables; their ports and variables are exposed
for simulation; each assigned model runs headless against an acceptance criterion; the result is
recorded as TRM evidence. "Always Sonnet is the executor and Opus plans and reviews."

Decisions (recommended defaults, taken): each engine verified on its own (coupled runs = phase 2);
criteria stored on the SysML verification case (method `simulation`); feature branch + PR into `co-work`.

## 1. Findings (baseline code, co-work 0a4decd)
- F1 TRM has `simulations`/`ports` columns and verified/failed/stale, but nothing creates `TraceArtifact{kind:'simulation'}` (`model.ts:264`).
- F2 Evidence fingerprint (`evidence.ts:15`, `traceClosure` `:105`) covers only SysML repository elements; SM / X-Bridges / V-Lab edits never make evidence stale.
- F3 States/junctions link to requirements (`StateRequirementTraceability.tsx`), passed to the TRM window as external elements (`App.tsx:18776`); the report path (`App.tsx:11600`, `reportSnapshotAdapter.ts:13`) builds the index without them -> unresolved in the report.
- F4 `smSemanticBuilder.ts:785` emits `requirementIds: []`; `smTestPlanBuilder.ts:87` uses placeholder ids (`TEST-INIT-001`).
- F5 X-Bridges: global canvas (`globalXBridgesNodes/Edges`, legacy React Flow `xblock` nodes) and state-embedded `XBPersistedModelV1`; ports addressed by blockId+portId; units sparse (81 of 954 catalog ports); 15 block types allow user-added ports.
- F6 V-Lab: `vlabNodes/vlabEdges`; `VLabPort` with domain, quantity, unit; edge handles `<portId>_s/_t`; solver variables named by `DAEAssembler.ts`; headless `VLabPhysicsEngine.simulateStep` (see `doe/vlabIntegration.test.ts`).
- F7 SM variables (`VariableDef`, `src/types/sm_types.ts`) have no direction or unit; direction only via `HILMapping` / `XBMappingV1` / script use. Coffee-heater sample uses 11 undeclared identifiers.
- F8 No V-Lab <-> X-Bridges / SM link exists (phase 2).

## 2. Contracts (fixed) — `src/engine/trmSim/`
1. Target reference `simTarget.ts` (as built in WP-01; segments `encodeURIComponent`-ed):
   - SM: states and junctions keep their raw id; `sim:sm/transition/<id>`, `sim:sm/var/<variableId>`
   - X-Bridges: `sim:xb/<canvas>/<blockId>[/<portId>]`, `sim:xb/<canvas>/<blockId>/$param/<name>`; `<canvas>` = `global` | workspace file id | `state:<stateId>`
   - V-Lab: `sim:vlab/<canvas>/<nodeId>[/<portId>]`, `sim:vlab/<canvas>/<nodeId>/$param/<name>`, `sim:vlab/<canvas>/$var/<solverVariable>`
2. Simulation interfaces (WP-02/03/04): `extractSmInterface`, `extractXbInterface`, `extractVlabInterface` -> signals {target, name, direction, dataType/unit, width, ...}, parameters, diagnostics.
3. Acceptance criterion `simCriterion.ts`: on a verification case (method `simulation`): stimuli (constant|step|ramp), one observed signal, check (`<=`, `>=`, `within`, `reaches`, `settles`) with value, unit, tolerance, time window; duration, step.
4. Headless runners, one per engine (WP-08a/b/c): `run<Sm|Xb|Vlab>Verification(model, criterion)` -> `{ trace: SimTraceSample[]; evaluation: SimEvaluation; diagnostics }`; no workers, no UI.
   - Sampling: stimuli are written at t = 0, then one sample at t = 0 (initial state; SM and X-Bridges only, V-Lab has no t = 0 solve), then for k = 1..round(duration/step): apply stimuli at t = (k-1)*step, advance one step, record at t = k*step.
   - X-Bridges (WP-08b): global/workspace canvases only (React Flow nodes rebuilt through BLOCK_LIBRARY like XbridgesWorkspace, RK4 at `step`); `state:` canvases run inside the SM runner. Stimuli: `$param` (patchBlockParams) or an unconnected input port; output ports and wired inputs are `NOT_STIMULABLE`.
   - V-Lab (WP-08c): observe a signal output (through a hidden probe scope) or `$var/<name>`; conserving ports are `NOT_OBSERVABLE` (use a sensor block). Stimuli: `$param` only, kept inside library bounds (`OUT_OF_BOUNDS`). Solver exceptions become `RUNTIME_ERROR`.
   - Inputs are never mutated.
   - A stimulus is written at t = 0 and afterwards only when its profile value changes, so model logic may overwrite it in between.
   - Booleans and active states are observed as 1/0.
   - An invalid criterion (`validateCriterion`), a target missing from the model (`UNKNOWN_TARGET`) or a target of another engine (`UNSUPPORTED_TARGET`) means no run: empty trace, `passed: false`, diagnostics `{code, message, target?}`. A runtime error stops the run with `RUNTIME_ERROR` and fails it.
5. Evidence `simEvidence.ts`: `recordVerificationEvidence` + `simulation` trace artifact holding the trace; fingerprint includes target model hash.

## 3. Work packages
| WP | Scope | Deps |
| --- | --- | --- |
| 00 | Set up loop (agent, skill, ledger, this file); baseline suites | — |
| 01 | Target reference: `simTarget.ts`, `simExternalElements.ts` | 00 |
| 02 | SM interface `smInterface.ts` (direction from HIL/XB mappings, else script read/write scan; undeclared-identifier diagnostic) | 01 |
| 03 | X-Bridges interface `xbInterface.ts` (both shapes; ports from saved nodes; unknown unit stays unknown) | 01 |
| 04 | V-Lab interface `vlabInterface.ts` (signal ports with quantity/unit; conserving ports as across/through pair; params with bounds; solver variables) | 01 |
| 05 | Assign: new endpoint family `simulationTarget` (connectionPolicy, ExternalSemanticEndpoint) accepted only for satisfy/verify/refine/trace; `simEndpoints.ts` (`projectSimSources`, `buildSimEndpoints`, `projectExternalEndpoints`, `projectExternalEndpointSignature`) feeding App `externalEndpointContext`, project hydration (App, projectIo worker/client) and `resolveUiConnectionEndpoint`; sim external elements to TRM window and report index | 01 |
| 06 | Real requirement ids in SM codegen: `trmSim/smRequirementLinks.ts` (`smRequirementLinks(repo, model)` -> element id -> requirement ids via satisfy/verify/refine/trace on states and `sim:sm/transition/...`); `buildSemanticModel(model, { requirementLinks })` fills `traceableElements`; `buildSMTestManifest` uses them for cases on linked states/transitions (placeholder only when none linked); `generateMISRACCode(chart, { requirementLinks })` adds ` requirements=...` to TRACE-BEGIN markers only when linked | 05 |
| 07 | Criterion type + pure evaluator `simEvaluate.ts` | 01 |
| 08a/b/c | Runners: SM (`smAppAdapter.ts`), X-Bridges (`XbridgesEngine` global / `xbInterpreter` state-embedded), V-Lab (`VLabPhysicsEngine`, `vlabScopeRead.ts`) | 02,03,04,07 |
| 09 | Evidence + staleness: `trmSim/simEvidence.ts` (`simModelFingerprint` ignores layout, `recordSimulationEvidence` on a verification case with method `simulation`, `deriveSimEvidenceStatus` stale on requirement or model change); additive model fields `VerificationCase.simulationCriterion?: SimCriterion` and `VerificationEvidence.simulation?: { criterionId, modelFingerprint, trace, firstViolation? }`, kept by save/load | 07, 08 |
| 10 | Panel + Run: controller `trmSim/simVerification.ts` (`linkedSimTargets`, `simulationCases`, `simCandidates`, `runSimCriterion` dispatching to the engine of the observed target with a fingerprint of that engine's model only, `verifyRequirementBySimulation`, `simEvidenceStatusFor`); `components/trmSim/SimVerificationPanel.tsx` (linked targets, per-case Run with result/first violation/diagnostics, evidence status, criterion editor from model ports and variables); App.tsx: open the panel from a requirement in the TRM window and commit repository changes through the SysML gateway | 05, 09 |
| 11 | E2E: motor-speed requirement on V-Lab speed signal, X-Bridges `omega`, SM state; run -> verified; edit -> stale; re-run -> verified | 10 |
| 12 | Close-out (Opus): targeted suites, `tsc --noEmit`, PR | 11 |

Per-WP acceptance tests are written by Opus before dispatch (see the living plan, "Implementation steps").

## 4. Loop
See `.claude/skills/trm-sim-loop/SKILL.md` and `.claude/agents/trm-executor.md`. Opus never writes
production code; Sonnet never edits acceptance tests or the ledger.
