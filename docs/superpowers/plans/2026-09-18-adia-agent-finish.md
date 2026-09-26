# ADIA Engineering Agent Finish Implementation Plan

## Execution checkpoint (2026-09-19)

This plan is **in progress, not release-complete**. The UI-connected inverter path now projects its executable actions into preflight, runs the live X-Bridges delegate after approval, obtains a real engine run ID, omits unmeasured THD, saves workspace state on commit, and supports guarded one-operation undo. A browser approval-flow test and an application-flow benchmark exercise that path. The standalone engineering dispatcher now fails closed for unimplemented create/move/validate/simulate/undo operations instead of reporting synthetic success. The X-Bridges delegate snapshot retains node presentation state for exact rollback.

Verified so far: 41 AI/Agent test files and 289 tests passed before the last dispatcher missing-target fix; eight agent Playwright tests passed before that same fix; SAST passed with one audited exception. Re-run the full suite after the final edits. Ollama is installed but has no configured model, so a model-backed smoke test remains unverified.

Open release gates: disk `.adia` save/reload, exact rollback on every injected failure/cancellation path, consistent transaction handling through `TransactionManager`, all engineering dispatcher methods backed by observed live outcomes, full negative browser corpus, configured Ollama smoke test, and independent closure of the BLOCKER/HIGH findings. The benchmark retains separate in-memory probes; only its `appFlowVerified` branch counts as application-path evidence. Do not treat the original checkboxes or this checkpoint as release acceptance.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three-phase inverter Agent create, validate, simulate, report, and undo a real ADIA X-Bridges model through the existing application services, then close the security and evaluation gaps identified in review.

**Architecture:** Use the live X-Bridges model as the only write target for the first slice. Keep the canonical catalog and plan preflight as read-only checks; make an application-backed adapter the executor, with one approval-bound transaction and a recoverable snapshot. The orchestrator owns the workflow, while simulation and diagnostics come from the real X-Bridges engine. Keep other ADIA domains capability-gated until separately integrated.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Playwright, existing X-Bridges block definitions, workspace state, simulation workers, and local Ollama provider.

## Global Constraints

- Preserve the user-facing approval gate and stale-revision protection.
- Never let an LLM response or tool request write raw project JSON or create a block, port, or parameter absent from the real registry.
- Use the real workspace's creation, connection, parameter, persistence, and simulation rules as the source of truth.
- A successful preflight, model mutation, validation, and simulation are separate outcomes in the report.
- Failed or cancelled execution restores the exact pre-run workspace snapshot; a committed run is undoable as one operation.
- Do not weaken the security scanner to make it pass. Keep unrelated state-machine behavior outside this feature.
- A benchmark passes only when it exercises the same path that the UI uses to modify and simulate a project.

---

## Verified starting point and gaps

The 2026-09-18 independent review ran `npx vitest run src/services/ai src/agent src/components/agent src/services/localLlmService.test.ts` (40 files, 258 tests passed), `npx tsc --noEmit` (exit 0), `npm run scan:sast` (exit 0), and `npm run build` (exit 0, with browser-externalization and bundle-size warnings). These are baseline checks, not proof of the live inverter flow.

`EngineeringToolDispatcher` in `src/services/ai/tools/engineeringTools.ts` is not referenced by production code. Its read tools return empty model data and several write tools return success without a live mutation. `EngineeringModelAdapter` stores blocks and connections in private maps. `ThreePhaseInverterScenarioBenchmark` uses that map and hard-coded assumptions. `AgentPanel` receives the legacy `AgentOrchestrator` through `App.tsx`, so the new engineering path is not the UI execution path. The last commit added broad `sast-ignore` behavior and changed unrelated state-machine files. Treat the feature as unfinished until these gaps close.

## File and interface map

| Responsibility | Existing file to modify or new file to create |
|---|---|
| Live X-Bridges state and command bridge | `src/agent/toolAdapters/xbridgesAdapter.ts`, `src/agent/applicationDelegates.ts`, new `src/services/ai/adapters/liveXbridgesModelAdapter.ts` |
| Tool dispatch and read state | `src/services/ai/tools/engineeringTools.ts`, `src/agent/toolGateway.ts` |
| Plan, catalog, and physics preflight | `src/agent/adiaBlockCatalog.ts`, `src/services/ai/planner/planPreflight.ts`, `src/services/ai/planner/planValidator.ts` |
| Orchestration and approvals | `src/agent/agentOrchestrator.ts`, `src/agent/planEngine.ts`, `src/agent/types.ts` |
| Transaction and undo | `src/services/ai/execution/transactionManager.ts`, `src/agent/toolAdapters/xbridgesAdapter.ts`, `src/App.tsx` |
| Solver and reporting | `src/services/ai/simulation/simulationTools.ts`, `src/services/ai/validation/modelValidation.ts`, `src/services/ai/repair/repairLoop.ts`, `src/components/agent/AgentPanel.tsx` |
| Security and packaging | `scripts/security_sast_scan.cjs`, `src/App.tsx`, `src/utils/stateMachine/smBoundaryVectors.ts`, `smToolRunner.ts`, `smVerificationEvidence.ts`, `xbInterpreter.ts`, `src/agent/toolAdapters/adiaProjectAdapter.ts` |
| Acceptance evidence | `tests/e2e/agent-approval-flow.spec.ts`, `tests/e2e/agent-real-adapter-contract.spec.ts`, `src/services/ai/benchmarks/threePhaseInverterScenario.test.ts`, `docs/AI_AGENT_EVALUATION.md` |

## Task 1: Pin the real inverter topology and supported capabilities

**Files:** Modify `src/agent/adiaBlockCatalog.ts`, `src/services/ai/templates/threePhaseInverter.ts`, `src/services/ai/planner/planPreflight.ts`; test in `src/services/ai/templates/threePhaseInverter.test.ts` and `src/services/ai/planner/planPreflight.test.ts`.

**Consumes:** `BLOCK_LIBRARY` in `src/engine/xbridges/BlockDefinitions.ts`, `XBRIDGES_CATEGORIES` in `src/utils/xbridges/XbridgesLibrary.ts`.

**Produces:** An inverter template whose required components and ports are actual X-Bridges definitions, and preflight diagnostics that reject physically incomplete source, gate, load, and reference paths.

- [ ] Enumerate actual `THREE_PHASE_INVERTER`, PWM, electrical source, load, and reference definitions and record exact port IDs, parameter names, and physical/signal domains in the test fixtures. Do not equate the signal `Constant` block with an electrical DC source unless the engine explicitly models that conversion.
- [ ] Write failing tests for missing DC rail return, unsupported block IDs, a gate-to-physical port mismatch, missing load/reference, and a known valid complete topology. Assert specific diagnostic codes and zero mutations.
- [ ] Update template and preflight rules to derive requirements from the actual definitions. If the library cannot express a complete inverter circuit, make the slice report `UNSUPPORTED_TOPOLOGY` and add the smallest reusable engine component under a separate reviewed task before continuing.
- [ ] Run `npx vitest run src/services/ai/templates/threePhaseInverter.test.ts src/services/ai/planner/planPreflight.test.ts`. Expected: all cases pass; valid topology is composed solely of real IDs.

## Task 2: Build an application-backed X-Bridges model adapter

**Files:** Create `src/services/ai/adapters/liveXbridgesModelAdapter.ts` and `.test.ts`; modify `src/agent/toolAdapters/xbridgesAdapter.ts`, `src/agent/applicationDelegates.ts`, `src/App.tsx`.

**Consumes:** The live `XbridgesApplicationDelegate` and the `EngineeringModelPlan` contract.

**Produces:** `LiveXbridgesModelAdapter` with `inspect(): Promise<ModelSnapshot>`, `apply(plan, signal): Promise<AppliedModelResult>`, and `restore(snapshot): Promise<void>`. `ModelSnapshot` contains project ID, revision, real nodes, real edges, and a stable state hash.

- [ ] Write an integration test with a stateful delegate: call `apply` on a valid two-block/one-edge plan, then assert the delegate's nodes and edges changed and are returned by `inspect`. A fake that records calls but never changes state must fail this test.
- [ ] Implement logical-ID to actual-node-ID mapping, using existing `addBlock`, `connectPorts`, and `updateParameters` methods. Route each connection through the existing port validator. Add only narrowly required delegate methods for snapshot restoration and model inspection.
- [ ] Verify the adapter rejects unknown parameters and stale revisions before the first write and restores the exact snapshot after a mid-plan failure.
- [ ] Run `npx vitest run src/services/ai/adapters/liveXbridgesModelAdapter.test.ts src/agent/toolAdapters/xbridgesAdapter.test.ts`. Expected: real delegate state changes on success and equals the initial snapshot on failure.

## Task 3: Make every engineering tool reflect live state and real outcomes

**Files:** Modify `src/services/ai/tools/engineeringTools.ts`, `src/services/ai/tools/engineeringToolSchemas.ts`, `src/agent/toolGateway.ts`; test `src/services/ai/tools/engineeringTools.test.ts`.

**Consumes:** `LiveXbridgesModelAdapter` from Task 2; project/revision context and existing approval tokens.

**Produces:** `EngineeringToolDispatcher` whose `inspect_model`, `get_model_summary`, mutations, validation, simulation, diagnostics, and undo call the live adapter/services; no command fabricates a success response.

- [ ] Write a failing test for each currently fabricated response: a live model with nodes and edges must be reflected in inspection/summary, and an accepted mutation must be visible in the next inspection. An unavailable adapter must return `DELEGATE_UNAVAILABLE` and leave state unchanged.
- [ ] Replace fabricated responses with delegate calls. Remove the default mutable context that invents `default_project`, revision 1, and empty models for production use; require a real context provider at the application boundary.
- [ ] Verify approval tokens are bound to the exact project, base revision, action and parameters, and cannot be reused. Keep read operations scoped to the active project.
- [ ] Run `npx vitest run src/services/ai/tools/engineeringTools.test.ts src/agent/toolGateway.test.ts`. Expected: no successful mutation result without an observed state change.

## Task 4: Connect interview, plan preview, and execution in the UI

**Files:** Modify `src/agent/agentOrchestrator.ts`, `src/agent/planEngine.ts`, `src/components/agent/AgentPanel.tsx`, `src/App.tsx`; tests `src/agent/agentOrchestrator.test.ts`, `src/components/agent/AgentPanel.test.tsx`.

**Consumes:** Template analysis, catalog search, preflight, live dispatcher, and Task 3 results.

**Produces:** A single route from a user request to clarification, structured plan, approval, live execution, post-run checks, and report. `AgentPanel` renders the same plan and action IDs that execution uses.

- [ ] Write a test that starts with “Create a three-phase inverter model,” supplies answers, inspects the plan, approves it, then observes the live delegate change. Assert the first prompt is selected from missing requirements and that no mutation occurs before approval.
- [ ] Use the selected template and current project revision in plan generation; reject unsupported intent/plan output with actionable diagnostics. Remove hidden air-fryer fallback from this route.
- [ ] Update the panel to show confirmed requirements, assumptions, exact block/port plan, preflight diagnostics, and execution result. Keep the existing approval UI usable for legacy actions.
- [ ] Run `npx vitest run src/agent/agentOrchestrator.test.ts src/components/agent/AgentPanel.test.tsx`. Expected: the inverter path reaches the real delegate only after a valid approval.

## Task 5: Make transaction, cancellation, persistence, and undo atomic

**Files:** Modify `src/services/ai/execution/transactionManager.ts`, `src/agent/toolAdapters/xbridgesAdapter.ts`, `src/agent/agentOrchestrator.ts`, `src/App.tsx`; tests `src/services/ai/execution/transactionManager.test.ts`, `src/agent/agentOrchestrator.test.ts`.

**Consumes:** Live snapshot/restore from Task 2, approval from Task 4, current project revision.

**Produces:** `executeEngineeringPlan` commits once after validation; `cancel` and failure restore the exact original workspace; `undoTransaction` restores the committed snapshot and updates UI revision/history.

- [ ] Write failure injection tests after block creation, parameter assignment, connection, validation, and save. Assert that every failure leaves nodes, edges, revision, and persisted project equal to their original values.
- [ ] Run actions sequentially against the live delegate with an abort check before each write and before commit. Journal the original snapshot before the first mutation. Save only at commit or explicitly restore persisted state on rollback.
- [ ] Make the UI's Undo button invoke the same committed transaction identity; reject undo if another user edit changed the workspace revision. Confirm ordinary ADIA undo/redo is not silently bypassed.
- [ ] Run `npx vitest run src/services/ai/execution/transactionManager.test.ts src/agent/agentOrchestrator.test.ts`. Expected: one successful commit and one-step undo; all injected failures are state-neutral.

## Task 6: Validate and simulate the live model honestly

**Files:** Modify `src/services/ai/validation/modelValidation.ts`, `src/services/ai/simulation/simulationTools.ts`, `src/services/ai/repair/repairLoop.ts`, `src/agent/agentOrchestrator.ts`; tests `src/services/ai/validation/modelValidation.test.ts`, `src/services/ai/simulation/simulationTools.test.ts`, `src/services/ai/repair/repairLoop.test.ts`.

**Consumes:** The committed X-Bridges model and existing engine/worker simulation entry points. Preserve validated, compiled, simulated, and unsupported as distinct results.

**Produces:** Diagnostics and signal results from the real engine. A report includes the model revision and engine run identifier, plus measured results or an explicit unsupported/failed state.

- [ ] Write a test in which catalog/schema checks pass but X-Bridges compile or simulation fails; the Agent must report failure and diagnostics. A stubbed numerical trace must not satisfy this test.
- [ ] Connect the simulation wrapper to the existing X-Bridges worker/engine. Only advertise solvers and cancellation modes that the actual worker supports; remove hard-coded capability claims and fabricated metrics.
- [ ] Limit automatic repair to deterministic, local changes and three attempts. Re-run real validation after every repair; modifications require the same approval policy as other model edits.
- [ ] Run `npx vitest run src/services/ai/validation/modelValidation.test.ts src/services/ai/simulation/simulationTools.test.ts src/services/ai/repair/repairLoop.test.ts src/services/xbridgesWorkerClient.test.ts`. Expected: success only with real diagnostics and an observed engine result.

## Task 7: Restore security scan integrity and investigate renderer imports

**Files:** Modify `scripts/security_sast_scan.cjs`, `src/App.tsx`, `src/utils/stateMachine/smBoundaryVectors.ts`, `smToolRunner.ts`, `smVerificationEvidence.ts`, `xbInterpreter.ts`, `src/agent/toolAdapters/adiaProjectAdapter.ts`; add focused tests under `scripts/` or `src/security/` for scanner suppression behavior.

**Consumes:** The scanner state before commit `29a7198` and current Electron renderer/main process boundaries.

**Produces:** An auditable security gate with narrowly documented exceptions and no silent whole-directory or adjacent-line suppression. Renderer code either uses preload APIs or has proven browser-safe imports.

- [ ] Test that `sast-ignore` text on the preceding line cannot hide an arbitrary `eval`/`new Function` finding, and that generated source is scanned or excluded by an exact, documented generated path with integrity checks.
- [ ] Remove the broad `filePath.includes('generated')` and free-form suppression rules. Review each of the six suppression comments added in `29a7198` against actual call-site input control; fix unsafe uses or create explicit rule-ID/path exceptions with a justification and a dedicated test.
- [ ] Check `adiaProjectAdapter.ts` use of `fs`, `path`, and `crypto` in the renderer. Move Node-only operations behind an existing preload IPC boundary if reachable at runtime, or remove dead renderer imports. Verify the production build warning is resolved or documented with runtime evidence.
- [ ] Run the scanner's new tests, `npm run scan:sast`, and `npm run build`. Expected: scanner cannot be bypassed by arbitrary comment text; build exits 0; no unreviewed security findings.

## Task 8: Replace the synthetic benchmark with live acceptance tests

**Files:** Modify `src/services/ai/benchmarks/threePhaseInverterScenario.ts`, `.test.ts`, `tests/e2e/agent-approval-flow.spec.ts`, `tests/e2e/agent-real-adapter-contract.spec.ts`, `docs/AI_AGENT_EVALUATION.md`.

**Consumes:** The exact UI/orchestrator/delegate path from Tasks 1–7.

**Produces:** Repeatable evidence that a user can create, inspect, simulate, save, reload, cancel, and undo an inverter model in ADIA.

- [ ] Replace hard-coded one-turn `clarificationTurns`, assumptions, and fixed model plan in the benchmark with actual orchestrator messages, user answers, approved plan, and a live application delegate fixture. Assert the benchmark fails when `addBlock`, `connectPorts`, save, or simulation is disabled.
- [ ] Add Playwright coverage for request → questions → plan preview → approve → visible canvas blocks and connections → project save/reload → validation/simulation report → one-step undo. Include negative tests for hallucinated IDs, incompatible ports, stale approval, provider unavailable, and cancellation during execution.
- [ ] Report measured pass/fail counts and limitations in `docs/AI_AGENT_EVALUATION.md`; remove “production ready” language until thresholds and real Ollama/worker smoke checks are met.
- [ ] Run `npx vitest run src/services/ai/benchmarks/threePhaseInverterScenario.test.ts` and `npx playwright test tests/e2e/agent-approval-flow.spec.ts tests/e2e/agent-real-adapter-contract.spec.ts`. Expected: tests use the live application integration path and pass without synthetic success stubs.

## Task 9: Release review, documentation, and acceptance gate

**Files:** Modify `docs/AI_AGENT_IMPLEMENTATION_PLAN.md`, `docs/AI_AGENT_EVALUATION.md`, `docs/guides/adia-agent-guide.md`; create `docs/AI_AGENT_CODE_REVIEW.md`.

**Consumes:** Completed task evidence and git diff.

**Produces:** A tracked status for the original 11 tasks and the finish tasks, deviations, reproducible evaluation results, known limits, and an independent review graded BLOCKER/HIGH/MEDIUM/LOW.

- [ ] Record exact completion evidence and deviations next to each original task. Distinguish merged implementation from verified live behavior.
- [ ] Review for paths from LLM text to direct state mutation, token reuse, stale approvals, rollback failure, fabricated diagnostics/results, provider failure handling, and security scan bypass. Write file/line findings and owner/action for each.
- [ ] Run `npx vitest run src/agent src/services/ai src/components/agent src/services/localLlmService.test.ts`, focused X-Bridges engine tests, the two E2E specs, `npm run scan:sast`, `npx tsc --noEmit`, and `npm run build`. Record exit codes and test counts. Also perform one local Ollama smoke test with an installed user-configured model; report unavailable Ollama as unverified, not passed.
- [ ] Mark release candidate only when no BLOCKER/HIGH model-integrity findings remain and the acceptance flow meets the thresholds below. Do not commit unrelated user changes.

## Release acceptance thresholds

- 100% rejection of invented block IDs, port IDs, unsupported parameter names, incompatible connections, stale approvals, and token reuse in the test corpus.
- 100% rollback of injected partial-write, cancellation, save, and simulation failures; exact node/edge/persistence snapshot restored.
- 100% of reported completed simulations have an engine run identifier and real diagnostics/results for the same project revision.
- The inverter scenario passes through the UI-connected delegate, survives save/reload, and can be undone in one action.
- Local provider health, missing model, timeout, cancellation, malformed output, and offline behavior are observed in integration tests; a configured Ollama model passes a manual smoke test before release.
- Security scanner exceptions are explicit and tested; no broad generated-path or free-form comment suppression remains.
- TypeScript, focused tests, E2E, SAST, and production build exit 0. The independent code review has no unresolved BLOCKER/HIGH findings affecting model integrity.

## Execution order

Tasks 1–3 establish the real model boundary. Tasks 4–6 connect the user workflow and engine. Task 7 can run alongside Tasks 4–6 in a separate worktree. Task 8 follows integration. Task 9 is the final gate. After each task, run its focused tests and inspect `git diff` before committing only task-related files.
