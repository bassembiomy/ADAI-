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
| 10 | Panel + Run: controller `trmSim/simVerification.ts` (`linkedSimTargets`, `simulationCases`, `simCandidates`, `runSimCriterion` dispatching to the engine of the observed target with a fingerprint of that engine's model only, `verifyRequirementBySimulation`, `simEvidenceStatusFor`); `components/trmSim/SimVerificationPanel.tsx` (linked targets with Link/Unlink from any model port, variable or parameter, per-case Run with result/first violation/diagnostics, evidence status, criterion editor from model ports and variables); App.tsx: open the panel from a requirement in the TRM window and commit repository changes through the SysML gateway | 05, 09 |
| 10b | Model-side assignment: `RequirementAssignmentsPanel.tsx` (generalises `StateRequirementTraceability.tsx`) in the state inspector, `XbridgesPropertiesPanel.tsx`, V-Lab properties in `VLabWorkspace.tsx` | 10 |
| 11 | E2E: motor-speed requirement on V-Lab speed signal, X-Bridges `omega`, SM state; run -> verified; edit -> stale; re-run -> verified | 10 |
| 12 | Close-out (Opus): targeted suites, `tsc --noEmit`, PR | 11 |

Per-WP acceptance tests are written by Opus before dispatch (see the living plan, "Implementation steps").

## 4. Loop
See `.claude/skills/trm-sim-loop/SKILL.md` and `.claude/agents/trm-executor.md`. Opus never writes
production code; Sonnet never edits acceptance tests or the ledger.

---

# Phase 2: coupled scenarios, expressions, logic corrections (2026-10-14)

## 5. User mandate (phase 2)
"Make a full scenario with its testing, make sure it will fit, and make this loop professional with no logical errors."
The user's flow: link model variables/ports/parameters to a requirement, write a condition such as `x == 1`,
run, and see pass/fail in the TRM. Several models run in one simulation in a fixed execution order.

## 6. Findings that phase 2 must fix (verified against co-work 9493efc)
- L1 Dead end: the panel lists only cases with `method === 'simulation'` (`simVerification.ts:58`), but every UI path creates `automated`/`Test` cases (`contextualCreation.ts:220`, `modelExplorerFactories.ts:366`). A user can never reach Run.
- L2 RTM counts ALL historical evidence (`rtm.ts:373`, `:417`): one old failure keeps a requirement `failed` forever after a later pass.
- L3 RTM ignores the simulated-model fingerprint: after a model edit the panel says stale but the TRM still says `verified`.
- L4 Step count differs per runner (`smRunner` floor, `xbRunner`/`vlabRunner` round): with duration 1 / step 0.4, X-Bridges and V-Lab run to t = 1.2 > duration.
- L5 Float time boundaries: samples are at `k*step`; `0.1*3 = 0.30000000000000004 > 0.3`, so `simEvaluate.ts` drops the boundary sample of a window or `by`.
- L6 SM runner passes `step*1000` ms as ONE tick (`smRunner.ts:82`); the interpreter rejects anything outside tickMs ± tolerance (`smTiming.ts:21`) -> every step other than the chart tick is a `TIMING` runtime error.
- L7 One observed signal and five fixed checks only; no `x == 1`, no logic, no multi-signal condition.
- L9 `stimulusValue` compares `t >= at` exactly: with step 0.03, `11*0.03 = 0.32999999999999996 < 0.33`, so a step at 0.33 s is applied one step late.
- L8 Each model runs alone (`simVerification.ts:128`); no run respects an execution order across models.

## 7. Contracts (phase 2, fixed) — `src/engine/trmSim/`
### 7.1 Time base (WP-13)
- `simCriterion.ts`: `MAX_SIM_STEPS = 20000`; `stepCount(duration, step) = Math.round(duration / step)`;
  `TIME_EPS = 1e-9`; `timeLE(a, b) = a <= b + TIME_EPS * Math.max(1, Math.abs(b))`, `timeGE(a, b) = timeLE(b, a)`.
- `validateCriterion` adds `STEP` errors: duration not a whole multiple of step (|N*step - duration| > TIME_EPS*max(1, duration)); N > MAX_SIM_STEPS.
- `simEvaluate.ts` compares sample times only with `timeLE`/`timeGE`.
- `stimulusValue`: step switches when `timeGE(t, at)`; ramp is `from` until `timeGE(t, start)`, then `from + slope * Math.max(0, t - start)`.
- All runners use `stepCount`; sample k is at `t = k*step`.
- State machine: one major step = `ticks = round(step*1000 / tickMs)` interpreter ticks of exactly `tickMs`; `ticks < 1` or `|ticks*tickMs - step*1000| > 1e-6` -> `STEP_NOT_TICK_MULTIPLE` (no run). Stimuli are written once per major step, before its first tick.

### 7.2 RTM evidence currency (WP-14)
- `buildTraceabilityMatrix(repo, filters, index, externalElements, options?: RtmOptions)`,
  `RtmOptions = { evidenceCurrency?: (evidence: VerificationEvidence) => EvidenceCurrency }`.
- Only the LATEST evidence per (verificationCaseId, requirementId) counts (max `executedAt`, then `revision`). Older evidence stays listed in `row.evidence`.
- Evidence is stale when `deriveEvidenceStatus` says stale OR `options.evidenceCurrency` says stale.
- Status order on the latest set: any current failed -> `failed`; else requirement stale or any stale -> `stale`; else any current passed -> `verified`; else the existing fallbacks.
- `verificationStatus` is the latest RESULT regardless of currency (staleness is shown by `status`): any latest failed -> `failed`; else any latest passed -> `passed`; else `not-run` when cases or evidence exist; else `not-verified`. (Kept compatible with `rtm.test.ts:329`.)
- `TraceabilityMatrix.tsx` takes `evidenceCurrency?` and passes it on; App passes `simEvidenceStatusFor`-based currency at both RTM call sites (TRM window and report).

### 7.3 Condition language (WP-15) `simExpression.ts`
- `parseSimExpression(src) -> { ok: true; ast; aliases: string[] } | { ok: false; error: string; at: number }`; `evaluateSimExpression(ast, env) -> number`; `isTruthy(v) = v !== 0`.
- Grammar (lowest first): `||`, `&&`, `== !=`, `< <= > >=`, `+ -`, `* /`, unary `! -`, primary = number | `true` | `false` | alias | `abs(x)` | `min(a, b, ...)` | `max(a, b, ...)` | `( expr )`.
- Alias = `[A-Za-z_][A-Za-z0-9_]*`, not `true`/`false`/`abs`/`min`/`max`. `aliases` = distinct, in first-appearance order.
- Booleans are 1/0. Comparisons and logic return 1/0. A single `=`, `&` or `|` is a parse error with a hint.
- Strictness: any non-finite operand of a comparison, logical operator or `!` gives `NaN` (never a silent false); `==` is exact.

### 7.4 Engine sessions (WP-16) `simSession.ts`
- `SimEngine = 'sm' | 'xb' | 'vlab'` (re-exported by `simVerification.ts`); `engineOfSimTarget(target)` (raw state ids -> `sm`); `engineModelOf(project, engine)` (moved from `simVerification.ts`).
- `createSimSession(engine, project, { observe, drive, step }) -> { session: SimEngineSession | null; diagnostics }`. Resolution diagnostics and codes are the WP-08 ones (`UNKNOWN_TARGET`, `UNSUPPORTED_TARGET`, `NOT_STIMULABLE`, `NOT_OBSERVABLE`, `UNKNOWN_BLOCK`) plus `STEP_NOT_TICK_MULTIPLE`.
- `SimEngineSession`: `engine`; `hasInitialSample` (sm, xb true; vlab false); `initialize()` after the t = 0 writes; `read(target) -> number | null` (null before initialize, and for V-Lab before its first solve); `write(target, value)` (V-Lab checks library bounds -> `OUT_OF_BOUNDS`); `step(t, dt)` (-> `RUNTIME_ERROR`); `signalInfo(target) -> { unit?: string; discrete: boolean }` (`discrete` for SM bool/int* variables and states).
- V-Lab: one hidden probe scope per observed port. The project is never mutated.
- The WP-08 runners are re-implemented on sessions; their existing tests are the parity guard and are not edited.

### 7.5 Scenario (WP-17) `simScenario.ts`, stored as `VerificationCase.simulationScenario?: SimScenario`
```ts
interface SimSignalRef { alias: string; target: string }
type SimTemporal =
  | { kind: 'always' | 'never' | 'eventually'; window?: [number, number] }
  | { kind: 'response'; trigger: string; within: number; window?: [number, number] };
interface SimAssertion { id: string; requirementId: string; name?: string; condition: string; temporal: SimTemporal }
interface SimCoupling { from: string; to: string }   // observable target -> drivable target of ANOTHER engine
interface SimScenario { id: string; verificationCaseId: string; duration: number; step: number;
  order?: SimEngine[]; signals: SimSignalRef[]; stimuli: SimStimulus[]; couplings: SimCoupling[]; assertions: SimAssertion[] }
```
- `DEFAULT_ENGINE_ORDER = ['sm', 'xb', 'vlab']`. Window defaults to `[0, duration]`.
- `validateScenario(scenario, { project, repository?, verificationCase? }) -> { severity: 'error' | 'warning'; code; message; path?; target? }[]`.
  Errors: `DURATION`, `STEP` (7.1 rules), `STEP_NOT_TICK_MULTIPLE`, `ALIAS` (syntax, reserved, duplicate), `SIGNAL` (session resolution; the session code is in the message), `EXPRESSION` (parse error or unknown alias), `WINDOW` (start > end, outside [0, duration], or no grid sample: `ceil(t0/step - 1e-9) > floor(t1/step + 1e-9)`), `RESPONSE` (within not finite or <= 0, bad trigger), `REQUIREMENT` (assertion requirement not in `verificationCase.verifiesRequirementIds`), `ORDER` (duplicate, unknown, or missing a participating engine), `DRIVE_CONFLICT` (one target driven twice by stimuli/couplings), `SAME_ENGINE_COUPLING`, `COUPLING` (from not observable or to not drivable), `STIMULUS`, `NO_ASSERTIONS`.
  Warnings: `FLOAT_EQUALITY` (`==`/`!=` with an operand alias whose signal is not discrete), `UNLINKED_SIGNAL` (with `repository`: an assertion's alias target is not linked to that assertion's requirement by satisfy/verify/refine/trace).
- `scenarioSchedule(scenario) -> { order; engines; steps; couplings: { from, to, fromEngine, toEngine, delayed }[] }`. Participating engines = engines of signals, stimuli and both coupling ends. `order` = the configured order filtered to participating engines. A coupling is `delayed` when its source engine comes after its target engine in `order`.
- `criterionToScenario(criterion)`: alias `y` for `observe`. `<=`/`>=` -> always over window, `y <= v` / `y >= v`; `within` -> always over window, `abs(y - v) <= tol`; `reaches` -> eventually over [0, by], `y >= v` (falling: `y <= v`); `settles` -> always over [by, duration], `abs(y - v) <= tol`.

### 7.6 Temporal evaluation (WP-18a) `simTemporal.ts`
- Series: `{ times: number[]; values: Record<alias, (number | null)[]> }` with `times[k] = k*step`.
- Samples considered = window samples (by `timeLE`/`timeGE`) where every alias used by the condition and trigger is non-null.
- A non-finite condition or trigger value -> `failed` at that sample ("non-finite value").
- `always`: first false -> failed; else passed. `never`: first true -> failed; else passed. `eventually`: first true -> passed (witness); else failed at the last sample.
- `response`: rising edge of the trigger (true now, and false at the previous considered sample, or no previous sample); deadline = t_edge + within. Answered when the condition is true at some sample in [t_edge, deadline]. Unanswered with deadline <= last considered sample -> failed at the last sample <= deadline. Unanswered with deadline beyond the window -> pending. Result: failed (earliest failure) > inconclusive (pending, or the trigger never rose: vacuous) > passed.
- No considered samples -> inconclusive.
- `evaluateAssertion(assertion, series, duration) -> { assertionId, requirementId, verdict: 'passed' | 'failed' | 'inconclusive', samplesChecked, at?: { t, values }, reason }`; `at.values` holds every alias the assertion uses.
- `aggregateRequirementVerdicts(results)`: per requirement, failed > inconclusive > passed.

### 7.7 Coupled run (WP-18b) `simScenarioRunner.ts`
`runSimScenario(project, scenario, ctx?) -> { schedule, series, assertions, requirements, diagnostics, modelFingerprint, engines }`
1. Any validation error -> no run (empty series, no assertions).
2. One session per participating engine. observe = its signals + coupling sources; drive = its stimuli + coupling targets.
3. t = 0: write all stimuli at 0. Then for each engine in `order`: write its incoming couplings whose source value is non-null, then `initialize()`. Then sample every alias (null allowed).
4. For k = 1..N with t' = (k-1)*step: write stimuli at t'. Then for each engine in `order`: write its incoming couplings from the sources' current values (Gauss-Seidel: an earlier engine already holds t_k values, a later one still holds t_(k-1) values = one step delay), then `step(t', step)`. Then sample every alias at t = k*step.
5. A target is written only when its value differs from the last value written to it (model logic may overwrite it in between).
6. A session error stops the run: `RUNTIME_ERROR` / `OUT_OF_BOUNDS` diagnostic, series up to the failure, no assertions, no requirement verdicts.
7. `modelFingerprint` = `simModelFingerprint` over `{engine: engineModelOf(project, engine)}` for the participating engines only (`scenarioModelFingerprint(project, engines)`).
8. Deterministic: no clock, no randomness. The project is never mutated.

### 7.8 Evidence and controller (WP-19)
- Additive `VerificationEvidence.simulation` fields: `scenarioId?`, `engines?`, `assertions?`, `series?`, `decimated?`. `criterionId` = scenario id for scenario evidence. `trace` = [].
- `recordScenarioEvidence(repo, { newId: (requirementId) => string, scenario, run, executedAt }) -> { repository, evidence[], skipped: { requirementId, reason }[] }`. Throws when the run has error diagnostics or an empty series.
  - One evidence per requirement of the case with at least one assertion: `passed` iff its aggregate verdict is passed, `failed` iff failed.
  - Inconclusive or assertion-less requirements are skipped, with no evidence.
  - The series is reduced to that requirement's aliases, at most 2000 samples (even stride, always keeping index 0, the last index and every `at` sample), with `decimated` true when reduced.
  - `firstViolation` = the earliest failed assertion's `at` (value of its first alias).
- `simEvidenceStatusFor` uses `scenarioModelFingerprint(project, evidence.simulation.engines)` when `engines` is present.
- `simVerification.ts`:
  - `createSimulationCase(repo, requirementId, { id, name? })`: method `simulation`, verifies [requirementId], owner and namespace taken from the requirement.
  - `verifyRequirementsByScenario(repo, project, caseId, { newId, executedAt })`.
  - `runAllSimulationCases(repo, project, { newId, executedAt })`: scenario first, else legacy criterion, else skipped.
  - `repositoryChangeCommands` also emits `createElement` for new verification cases and `updateElement` for `simulationScenario` changes.

### 7.9 UI (WP-20)
- `SimVerificationPanel`:
  - a "New simulation test case" button;
  - a per-case `ScenarioEditor`, with run settings, execution order, signals, stimuli, couplings with a same-step / one-step-delay badge, and assertions;
  - live validation: errors block Save, warnings are shown;
  - Run results per assertion (verdict, t, values, reason) and per requirement, plus skipped requirements;
  - a `SimTracePlot` (inline SVG, no dependencies).
- `TraceabilityMatrix`: "Run all simulation tests" (`onRunAllSimulations`). App commits the result through the gateway.

## 8. Work packages (phase 2)
| WP | Scope | Deps |
| --- | --- | --- |
| 13 | Time base and runner fixes (7.1): `simCriterion.ts`, `simEvaluate.ts`, `smRunner.ts`, `xbRunner.ts`, `vlabRunner.ts` | 12 |
| 14 | RTM latest-evidence and model currency (7.2): `rtm.ts`, `TraceabilityMatrix.tsx`, App wiring | 12 |
| 15 | Condition language (7.3): `simExpression.ts` | 12 |
| 16 | Engine sessions (7.4) + runners on sessions | 13 |
| 18a | Temporal evaluation (7.6): `simTemporal.ts`; creates the 7.5 type declarations in `simScenario.ts` | 15, 16 |
| 17 | Scenario model and validation (7.5): functions in `simScenario.ts`, `model.ts` field | 15, 16, 18a |
| 18b | Coupled runner (7.7): `simScenarioRunner.ts` | 17, 18a |
| 19 | Scenario evidence and controller (7.8) | 14, 18b |
| 20 | UI (7.9) | 19 |
| 21 | E2E thermostat scenario across all three models through the SysML gateway (planner test; see 9) | 20 |
| 22 | Close-out: trmSim + sysml suites, `tsc --noEmit`, help topic, push | 21 |

## 9. The full scenario (WP-21): closed-loop thermostat
Fixture `src/engine/trmSim/__fixtures__/thermostatProject.ts` (SM 10 ms tick, hysteresis 55..65; X-Bridges GAIN 100; V-Lab ps_constant -> ps_lpf, T = 5 s).
Scenario: duration 30 s, step 0.01 s, order SM -> X-Bridges -> V-Lab; stimulus `enable` = 1.
Couplings: `heaterOn -> heaterGain.u` (same step), `heaterGain.y -> power.value` (same step), `chamber.y -> dT` (one step delay).

| Req | Text | Condition | Mode |
| --- | --- | --- | --- |
| REQ-T1 | Warm-up: dT reaches 60 within 10 s | `dT >= 60` | eventually [0, 10] |
| REQ-T2 | Regulation: dT stays within 50..70 after 15 s | `dT >= 50 && dT <= 70` | always [15, 30] |
| REQ-T3 | Over-temperature: heater off within 0.2 s of dT >= 65 | trigger `dT >= 65`, condition `heaterOn == 0` | response, within 0.2 |
| REQ-T4 | Power command never exceeds 100 % | `power > 100` | never |
| REQ-T5 | The heater turns on (the user's `x == 1` case) | `heating == 1` | eventually |

Expected values come from an independent reference model written in the test (plain arithmetic of the documented semantics: one SM transition per tick, GAIN, backward-Euler LPF `y_k = a*u + (1 - a)*y_(k-1)`, a = dt/(T + dt)). The run must match it at every sample (1e-9). First `dT >= 60` at t = 4.59 s.
Negative path: upper threshold 75 -> REQ-T2 fails at the reference model's first sample above 70 after 15 s; REQ-T3 fails at its first trigger + 0.2 s (the heater stays on until 75); the RTM shows failed. Restore -> re-run -> verified (latest evidence wins). Model edit -> stale in the panel and the RTM. Save/load keeps the scenario and evidence. Two runs are identical (determinism).
