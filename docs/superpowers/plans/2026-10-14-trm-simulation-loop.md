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
1. Target reference `simTarget.ts`:
   - SM: `sim:sm/<stateId>`, `sim:sm/<transitionId>`, `sim:sm/var/<variableId>`
   - X-Bridges: `sim:xb/<canvas>/<blockId>/<portId>`, `sim:xb/<canvas>/<blockId>/param/<name>`; `<canvas>` = `global` | workspace file id | `state:<stateId>`
   - V-Lab: `sim:vlab/<canvas>/<nodeId>/<portId>`, `sim:vlab/<canvas>/<nodeId>/param/<name>`, `sim:vlab/<canvas>/var/<solverVariable>`
2. Simulation interface `simInterface.ts`: `extractSimInterface(model)` -> signals {id, name, direction stimulus|observe, dataType, width, unit?}.
3. Acceptance criterion `simCriterion.ts`: on a verification case (method `simulation`): stimuli (constant|step|ramp), one observed signal, check (`<=`, `>=`, `within`, `reaches`, `settles`) with value, unit, tolerance, time window; duration, step.
4. Headless runner `simRunner.ts`: `runSimVerification(criterion, model)` -> {result, trace, firstViolation}; no workers, no UI.
5. Evidence `simEvidence.ts`: `recordVerificationEvidence` + `simulation` trace artifact holding the trace; fingerprint includes target model hash.

## 3. Work packages
| WP | Scope | Deps |
| --- | --- | --- |
| 00 | Set up loop (agent, skill, ledger, this file); baseline suites | — |
| 01 | Target reference: `simTarget.ts`, `simExternalElements.ts` | 00 |
| 02 | SM interface `smInterface.ts` (direction from HIL/XB mappings, else script read/write scan; undeclared-identifier diagnostic) | 01 |
| 03 | X-Bridges interface `xbInterface.ts` (both shapes; ports from saved nodes; unknown unit stays unknown) | 01 |
| 04 | V-Lab interface `vlabInterface.ts` (signal ports with quantity/unit; conserving ports as across/through pair; params with bounds; solver variables) | 01 |
| 05 | Assign: `sim:` endpoints accepted for satisfy/verify/refine/trace (`App.tsx:9479` createRelationship, `resolveUiConnectionEndpoint`, SysML command validator); external elements to TRM window and report index | 01 |
| 06 | Real requirement ids in SM codegen (`smSemanticBuilder.ts:785`, `smTestPlanBuilder.ts:87`; placeholder only when none linked) | 05 |
| 07 | Criterion type + pure evaluator `simEvaluate.ts` | 01 |
| 08a/b/c | Runners: SM (`smAppAdapter.ts`), X-Bridges (`XbridgesEngine` global / `xbInterpreter` state-embedded), V-Lab (`VLabPhysicsEngine`, `vlabScopeRead.ts`) | 02,03,04,07 |
| 09 | Evidence + staleness from model hash (`evidence.ts`) | 08 |
| 10 | `RequirementAssignmentsPanel.tsx` (generalises `StateRequirementTraceability.tsx`) in state inspector, `XbridgesPropertiesPanel.tsx`, V-Lab properties in `VLabWorkspace.tsx`; criterion editor + Run on `TraceabilityMatrix.tsx` rows | 05,09 |
| 11 | E2E: motor-speed requirement on V-Lab speed signal, X-Bridges `omega`, SM state; run -> verified; edit -> stale; re-run -> verified | 10 |
| 12 | Close-out (Opus): targeted suites, `tsc --noEmit`, PR | 11 |

Per-WP acceptance tests are written by Opus before dispatch (see the living plan, "Implementation steps").

## 4. Loop
See `.claude/skills/trm-sim-loop/SKILL.md` and `.claude/agents/trm-executor.md`. Opus never writes
production code; Sonnet never edits acceptance tests or the ledger.
