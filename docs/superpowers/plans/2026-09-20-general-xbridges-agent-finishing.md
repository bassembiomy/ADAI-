# General X-Bridges Agent Finishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish ADIA as a genuinely general, knowledge-backed X-Bridges engineering agent that safely creates, inspects, modifies, diagnoses, repairs, and optimizes every model expressible by the installed catalog.

**Architecture:** Keep Ollama as an untrusted natural-language interpreter and make deterministic services authoritative. Route every production request through one catalog-derived workflow: normalize requirements, retrieve compatible verified patterns, synthesize a typed graph, prove it with the real engine, execute one approved mutation at a time in an atomic transaction, then save, reload, and verify the final fingerprint. Patterns guide planning but never authorize unsupported blocks, ports, parameters, or physics.

**Tech Stack:** Electron 43, React 18, TypeScript 5.4, Zod, Vite 7, Vitest 4, Playwright, Ollama, X-Bridges `BLOCK_LIBRARY`, existing worker engine, content-addressed JSON knowledge store.

## Global Constraints

- Use only block IDs, parameters, and ports present in the active X-Bridges catalog.
- Never silently invent a requirement, component, connection, observable, simulation result, or engineering capability.
- Ask one clarification at a time until all mandatory requirements are explicit.
- Require approval for every individual mutation and every simulation run.
- Bind each approval to project, revision, plan hash, action, action kind, and canonical parameters; tokens are single-use.
- Treat all actions in one request as one atomic transaction. Rejection, cancellation, stale state, or failure restores exact live and persisted snapshots.
- Runtime planning is offline. Online ingestion is a separate operator workflow and uses only legally accessible sources with explicit provenance and licensing.
- Do not bypass payment, authentication, licenses, robots controls, or technical access controls to make content “free.”
- Knowledge patterns are advisory until compatibility compilation and real-engine proof succeed.
- A successful result must include the actual engine run ID, plan hash, catalog hash, final model fingerprint, persisted revision, and reload verification.
- “General” means every composition supported by current catalog semantics—not unsupported physics or arbitrary external block types.

---

## File and Interface Map

| Responsibility | Primary files |
|---|---|
| Production workflow | `src/agent/agentOrchestrator.ts`, `src/agent/collaborators/*` |
| Request normalization | `src/services/ai/planner/generalIntent.ts`, `requirementResolver.ts` |
| Knowledge access | `src/services/ai/knowledge/patternGateway.ts`, `patternRetrieval.ts`, `src/main.cjs`, `src/preload.cjs` |
| Graph synthesis | `src/services/ai/planner/generalGraphPlanner.ts`, `graphSynthesizer.ts` |
| Proof | `src/services/ai/proof/xbridgesProofRunner.ts` |
| Transactions | `src/services/ai/execution/xbridgesAgentTransaction.ts` |
| Expert intents | `src/services/ai/diagnosis/*`, `repair/*`, `optimization/*` |
| Ollama | `src/services/localLlmService.ts`, `src/agent/collaborators/requestCollaborator.ts` |
| UI | `src/components/agent/AgentPanel.tsx`, `src/App.tsx` |
| Certification | `src/services/ai/benchmarks/generalXbridgesCorpus.ts`, `tests/e2e/*` |

## Task 1: Lock the Current Gaps Into Failing Integration Tests

**Files:**
- Create: `src/agent/generalWorkflow.integration.test.ts`
- Modify: `src/agent/agentOrchestrator.test.ts`
- Modify: `tests/e2e/agent-general-xbridges.spec.ts`

**Interfaces:**
- Produces a reusable `runApprovedWorkflow(prompt, answers, harness)` integration-test helper.
- Establishes required response fields: `intent`, `resolvedRequirements`, `patternEvidence`, `plan`, `proof`, `currentApproval`, `observedDeltas`, `transactionStatus`, and `finalEvidence`.

- [ ] Write failing tests for non-inverter requests: PID speed control, low-pass filtering, thermal alarm logic, motor drive, and an arbitrary valid Step→Gain→Scope composition.
- [ ] Assert each request reaches the generic planner, uses only catalog identifiers, obtains a real proof, executes all approvals, saves, reloads, and returns a matching fingerprint.
- [ ] Add negative tests proving unknown blocks, missing mandatory requirements, incompatible ports, and unsupported physics produce structured refusal with zero mutations.
- [ ] Replace E2E assertions that only check message visibility with assertions on actual nodes, edges, parameters, engine run IDs, persisted revisions, and fingerprints.
- [ ] Run `npx vitest run src/agent/generalWorkflow.integration.test.ts src/agent/agentOrchestrator.test.ts`. Expected: failures showing the generic planner and knowledge store are not called.
- [ ] Commit: `test(agent): expose incomplete general workflow integration`.

## Task 2: Introduce One Production General-Workflow Coordinator

**Files:**
- Create: `src/agent/generalXbridgesWorkflow.ts`
- Create: `src/agent/generalXbridgesWorkflow.test.ts`
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/agent/planEngine.ts`
- Modify: `src/agent/collaborators/requestCollaborator.ts`

**Interfaces:**

```ts
export interface GeneralWorkflowDependencies {
  requirements: RequirementResolver;
  patterns: EngineeringPatternGateway;
  planner: PlanningCollaborator;
  proof: ProofCollaborator;
  transactions: TransactionCollaborator;
}

export class GeneralXbridgesWorkflow {
  handle(input: string, context: LivePlanningContext): Promise<OrchestratorResponse>;
  approve(binding: ActionApprovalBinding): Promise<OrchestratorResponse>;
  reject(actionId: string, reason: string): Promise<OrchestratorResponse>;
  cancel(reason: string): Promise<OrchestratorResponse>;
}
```

- [ ] Write failing routing tests proving all six intents enter `GeneralXbridgesWorkflow`, including inverter and air-fryer requests.
- [ ] Implement the coordinator as the sole X-Bridges production path; `AgentOrchestrator` remains a thin UI-compatible facade.
- [ ] Remove calls from the production path to legacy `buildExecutionPlan(this.specification)` and remove all `targetSystem === 'three_phase_inverter'` execution branches.
- [ ] Keep old templates only as knowledge records or migration fixtures; they must not own execution behavior.
- [ ] Make every terminal state explicit: `completed`, `refused`, `cancelled`, `rolled_back`, or `failed_rollback`.
- [ ] Run `npx vitest run src/agent/generalXbridgesWorkflow.test.ts src/agent/agentOrchestrator.test.ts` and confirm every intent routes through the same coordinator.
- [ ] Commit: `refactor(agent): route xbridges through general workflow`.

## Task 3: Connect the Offline Knowledge Database to Runtime Planning

**Files:**
- Create: `src/services/ai/knowledge/patternGateway.ts`
- Create: `src/services/ai/knowledge/patternGateway.test.ts`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Modify: `src/types/electron.d.ts`
- Modify: `src/agent/generalXbridgesWorkflow.ts`

**Interfaces:**

```ts
export interface EngineeringPatternGateway {
  listVerified(query: PatternRetrievalQuery): Promise<EngineeringPattern[]>;
  get(id: string): Promise<EngineeringPattern | undefined>;
  getManifestFingerprint(): Promise<string>;
}
```

- [ ] Write failing tests proving verified compatible patterns are loaded before planning and quarantined, deprecated, corrupted, unlicensed, or catalog-incompatible records are excluded.
- [ ] Add a narrow IPC operation returning checksum-validated records and the manifest fingerprint; validate request and response with Zod on both sides.
- [ ] Implement a browser-safe gateway over preload IPC. Do not import Node `fs` or `path` into renderer modules.
- [ ] Run deterministic retrieval using intent, target behaviors, required domains, requirement coverage, catalog compatibility, lifecycle, quality score, then stable pattern ID.
- [ ] Attach selected and rejected pattern evidence—with reasons—to the orchestrator response and audit trail.
- [ ] Fail closed when the manifest or a selected pattern checksum is invalid. Continue without patterns only when the store is valid but has no compatible record.
- [ ] Run `npx vitest run src/services/ai/knowledge src/agent/generalXbridgesWorkflow.test.ts`.
- [ ] Commit: `feat(agent): ground runtime planning in verified knowledge`.

## Task 4: Replace Hardcoded Archetypes With Catalog-Driven Graph Synthesis

**Files:**
- Create: `src/services/ai/planner/graphSynthesizer.ts`
- Create: `src/services/ai/planner/graphSynthesizer.test.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Modify: `src/services/ai/planner/requirementResolver.ts`
- Modify: `src/services/ai/contracts/engineeringModel.ts`

**Interfaces:**

```ts
export function synthesizeGraph(input: {
  request: ResolvedEngineeringRequest;
  snapshot: ModelSnapshot;
  catalog: XbridgesCapabilityIndex;
  patterns: RetrievedPatternEvidence[];
}): PlanningOutcome;
```

- [ ] Write failing property and table tests that compose sources, transforms, controllers, plants, sensors, logic, and sinks from advertised port semantics rather than model-name keywords.
- [ ] Define graph obligations from requirements: required roles, source/load/reference, feedback, observables, sample times, domains, and acceptance criteria.
- [ ] Generate candidates only from catalog capabilities and exact compatible ports. Use deterministic ordering and bounded search limits.
- [ ] Use compatible knowledge patterns as constraints and topology evidence, not direct executable actions.
- [ ] Remove `canonical_*` archetypes as planning authority. Retain them only as seed patterns where their provenance and mappings validate.
- [ ] Return `PlanningRefusal` with missing capability, requirement, or mapping for unsatisfied obligations; never fall back to a meaningless generic graph.
- [ ] Verify identical normalized input, snapshot fingerprint, catalog hash, knowledge hash, and planner version produce the same plan hash.
- [ ] Run `npx vitest run src/services/ai/planner src/services/ai/catalog`.
- [ ] Commit: `feat(agent): synthesize graphs from xbridges capabilities`.

## Task 5: Make Clarification and Ollama Reliable but Non-Authoritative

**Files:**
- Modify: `src/services/ai/planner/generalIntent.ts`
- Modify: `src/services/ai/planner/requirementResolver.ts`
- Modify: `src/agent/collaborators/requestCollaborator.ts`
- Modify: `src/services/localLlmService.ts`
- Modify: corresponding tests

**Interfaces:**
- `extractEngineeringRequest(text, provider): Promise<ExtractionResult>` returns schema-valid candidates plus confidence and ambiguities.
- `resolveRequirements(candidate, catalog, snapshot): RequirementResolution` deterministically decides questions and readiness.

- [ ] Write tests for Ollama health, installed-model discovery, selected model, malformed JSON, schema mismatch, timeout, cancellation, offline mode, and model switching.
- [ ] Use Ollama only for intent, entities, quantities, constraints, and candidate role extraction. Reject any LLM-supplied action or unsupported identifier.
- [ ] Validate units, bounds, and catalog references deterministically; preserve the original user text and distinguish extracted facts from assumptions.
- [ ] Ask exactly one highest-impact question at a time. Require explicit approval for any proposed default.
- [ ] When Ollama is unavailable, support deterministic parsing where possible and clearly refuse requests that need semantic extraction.
- [ ] Replace legacy support messages listing only inverter and air fryer with capability-based explanations.
- [ ] Run `npx vitest run src/services/localLlmService.test.ts src/services/ai/planner src/agent/collaborators/requestCollaborator.test.ts`.
- [ ] Commit: `feat(agent): normalize ollama requests safely`.

## Task 6: Apply Real Proof to Every Plan and Simulation

**Files:**
- Modify: `src/services/ai/proof/xbridgesProofRunner.ts`
- Modify: `src/services/ai/planner/planPreflight.ts`
- Modify: `src/services/xbridgesWorkerClient.ts`
- Modify: `src/agent/generalXbridgesWorkflow.ts`
- Modify: corresponding tests

**Interfaces:**
- `proveXbridgesPlan(plan, options): Promise<XbridgesProof>` must return real `engineRunId`, hashes, diagnostics, and requested observables.

- [ ] Write proof tests for every catalog-supported block family and failures for compilation, topology, solver, runtime, timeout, cancellation, missing observables, and stale proof hashes.
- [ ] Materialize the complete candidate model in isolation and invoke the same worker engine used by X-Bridges Run.
- [ ] Require catalog, parameter, port, connectivity, sample-time, solver, compile, and isolated-simulation checks for every plan—not only inverters.
- [ ] Remove synthetic engine IDs and metric fallbacks. Missing evidence is a refusal.
- [ ] Bind proof to plan hash, catalog hash, knowledge-manifest hash, engine version, and normalized requirement hash.
- [ ] Add explicit approval before each simulation execution, including optimization evaluations if approved as a bounded batch.
- [ ] Run `npx vitest run src/services/ai/proof src/services/ai/simulation src/services/xbridgesWorkerClient.test.ts`.
- [ ] Commit: `feat(agent): prove every general xbridges plan`.

## Task 7: Enforce Individual Approvals and Atomic Execution End to End

**Files:**
- Modify: `src/services/ai/execution/xbridgesAgentTransaction.ts`
- Modify: `src/agent/collaborators/transactionCollaborator.ts`
- Modify: `src/agent/approvalGate.ts`
- Modify: `src/agent/toolGateway.ts`
- Modify: `src/agent/generalXbridgesWorkflow.ts`
- Modify: corresponding tests

**Interfaces:**
- `approveAndExecute(binding): Promise<ObservedActionResult>` is the only mutation entry point.

- [ ] Add tests for every action kind: add/remove block, connect/disconnect, set parameter, move, rename, simulate, save, and final reload verification.
- [ ] Reject wrong project, revision, plan hash, action ID, action kind, parameter hash, replayed token, out-of-order action, and changed live fingerprint.
- [ ] Verify each actual state delta equals the approved expected delta before requesting the next approval.
- [ ] Capture live and persisted snapshots before the first mutation and restore both on rejection, cancellation, stale state, tool failure, proof failure, save failure, or reload mismatch.
- [ ] Verify rollback by exact fingerprint; report `failed_rollback` loudly when equality cannot be established.
- [ ] Commit only after final compile, simulation, save, reload, and fingerprint comparison all succeed.
- [ ] Support one-step undo only when the current fingerprint equals the committed transaction fingerprint.
- [ ] Run all transaction, approval, adapter, and failure-injection tests.
- [ ] Commit: `fix(agent): guarantee approval-bound atomic execution`.

## Task 8: Wire Inspect, Modify, Diagnose, Repair, and Optimize to Real Services

**Files:**
- Modify: `src/agent/generalXbridgesWorkflow.ts`
- Modify: `src/services/ai/diagnosis/xbridgesDiagnosis.ts`
- Modify: `src/services/ai/repair/generalRepairPlanner.ts`
- Modify: `src/services/ai/optimization/xbridgesOptimizer.ts`
- Modify: corresponding tests

**Interfaces:**
- `inspect` returns catalog-resolved topology and evidence without mutation.
- `diagnose` returns structured observed diagnostics without mutation.
- `modify`, `repair`, and `optimize` return ordinary proved plans routed through approvals and transactions.

- [ ] Replace the current dangling-edge-only diagnosis with requirement, mapping, schema, topology, compile, solver, runtime, persistence, and reload diagnostics.
- [ ] Make modify compute a minimal graph delta while preserving unaffected blocks, edges, parameters, and presentation state.
- [ ] Limit repair to three deterministic candidates, prove each in isolation, and refuse when none succeeds.
- [ ] Require optimization objective, bounds, constraints, seed, scenario, and finite evaluation/time budget.
- [ ] Record optimization baseline, every candidate, rejection reason, winner, engine run ID, and reproducibility settings.
- [ ] Route all selected changes through the same individual-approval transaction path.
- [ ] Run diagnosis, repair, optimization, orchestrator, and integration suites.
- [ ] Commit: `feat(agent): complete all general engineering intents`.

## Task 9: Expand and Govern the Engineering Knowledge Base

**Files:**
- Modify: `resources/engineering-patterns/manifest.json`
- Add: `resources/engineering-patterns/patterns/*.json`
- Modify: `src/services/ai/knowledge/seedPatterns.ts`
- Modify: `src/services/ai/knowledge/ingestion/*`
- Modify: `src/services/ai/importers/*`
- Create: `scripts/verify-engineering-patterns.mjs`
- Modify: knowledge/importer tests

**Interfaces:**
- Verification command: `node scripts/verify-engineering-patterns.mjs`.

- [ ] Define seed coverage from the actual catalog: control, electrical, signal processing, motor/robotics, thermal, logic, and mixed-rate only where corresponding blocks and engine behavior exist.
- [ ] Add patterns for reusable roles and topologies rather than product names. Every pattern must contain license, source, checksum, mappings, mandatory requirements, solver contract, evidence, catalog hash, and lifecycle.
- [ ] Import permitted Simulink `.slx` and Scilab/Xcos files into quarantine without executing code, macros, or external references.
- [ ] Require explicit mapping to existing X-Bridges blocks; unmapped content remains non-executable reference material.
- [ ] Prove each promotion candidate with the current engine and require operator review before `verified` status.
- [ ] Add CI verification for schema validity, checksums, duplicate IDs, license policy, catalog mappings, proof freshness, and deterministic retrieval.
- [ ] Never claim comprehensive MATLAB/Simulink or Scilab coverage; publish exact mapped and unsupported constructs.
- [ ] Commit seed records in small domain-specific commits with provenance review.

## Task 10: Finish the Agent Panel as an Evidence UI

**Files:**
- Modify: `src/components/agent/AgentPanel.tsx`
- Modify: `src/components/agent/AgentPanel.css`
- Modify: `src/App.tsx`
- Modify: corresponding component tests

- [ ] Render intent, active project/revision, normalized requirements, assumptions, unanswered requirements, catalog hash, and knowledge-manifest hash.
- [ ] Show selected/rejected pattern provenance and compatibility reasons.
- [ ] Show exact proposed blocks, parameters, ports, connections, layout, plan hash, proof diagnostics, and real engine evidence.
- [ ] Present exactly one action approval card at a time with canonical parameters, expected delta, rollback scope, and explicit Approve/Reject controls.
- [ ] Show transaction progress, cancellation, rollback verification, save/reload status, final fingerprint, and one-step undo eligibility.
- [ ] Never display “completed” unless final proof and persistence fields are all present and internally consistent.
- [ ] Add accessible tests for every state, including refusal and failed rollback.
- [ ] Run `npx vitest run src/components/agent src/App.test.tsx`.
- [ ] Commit: `feat(agent): expose verified general workflow evidence`.

## Task 11: Build Honest Cross-Domain End-to-End Certification

**Files:**
- Modify: `src/services/ai/benchmarks/generalXbridgesCorpus.ts`
- Modify: `src/services/ai/benchmarks/generalXbridgesCorpus.test.ts`
- Rewrite: `tests/e2e/agent-general-xbridges.spec.ts`
- Rewrite: `tests/e2e/agent-xbridges-persistence.spec.ts`
- Modify: `docs/AI_AGENT_EVALUATION.md`
- Modify: `docs/guides/adia-agent-guide.md`

- [ ] Derive acceptance scenarios dynamically from advertised catalog domains and include create, inspect, modify, diagnose, repair, optimize, refusal, cancellation, restart, and undo.
- [ ] For every successful create scenario, execute every approval and assert exact blocks, edges, parameters, proof, engine run, save receipt, reload fingerprint, and undo fingerprint.
- [ ] Include adversarial prompts requesting invented blocks, approval bypass, fabricated metrics, unsafe imports, license bypass, and unsupported physics; all must refuse with zero mutation.
- [ ] Inject failure after every transaction phase and prove exact live and persisted rollback.
- [ ] Run an Ollama smoke corpus against the locally selected installed model and record model name/digest, prompt schema, latency, normalization result, and canonical plan hash.
- [ ] Ensure deterministic planning produces the same plan despite equivalent wording and permitted LLM variance.
- [ ] Remove or rename tests whose assertions do not certify their stated claim.
- [ ] Commit: `test(agent): certify honest cross-domain behavior`.

## Task 12: Final Independent Review and Release Gate

**Files:**
- Modify: `docs/AI_AGENT_CODE_REVIEW.md`
- Create: `docs/release/general-xbridges-agent-readiness.md`

- [ ] Run the complete verification matrix:

```powershell
npx tsc --noEmit
npx vitest run src/agent src/services/ai src/components/agent src/engine/xbridges src/services/xbridgesWorkerClient.test.ts src/services/localLlmService.test.ts
npx playwright test tests/e2e/agent-approval-flow.spec.ts tests/e2e/agent-real-adapter-contract.spec.ts tests/e2e/agent-general-xbridges.spec.ts tests/e2e/agent-xbridges-persistence.spec.ts tests/e2e/xbridges-run-engine.spec.ts
npm run test:project-files
npm run scan:sast
node scripts/verify-engineering-patterns.mjs
npm run build
```

- [ ] Perform an independent review for direct LLM mutation, hidden legacy routing, fabricated evidence, bypassable/reusable approvals, stale state, incomplete rollback, renderer filesystem access, unsafe import parsing, and provenance/license gaps.
- [ ] Confirm source searches return no production inverter-only branches, no synthetic run IDs, no unvalidated pattern reads, and no generic E2E test that merely checks visibility.
- [ ] Record all commands, environment versions, Ollama model digest, catalog hash, knowledge hash, test totals, and review findings in the readiness report.
- [ ] Release only when all commands exit 0, successful scenarios have zero invented identifiers, every injected failure restores exact state, and no blocker/high-severity model-integrity finding remains.
- [ ] Keep the agent labeled experimental if any gate fails; document the exact unsupported capability instead of weakening a test.
- [ ] Commit: `chore(agent): document verified release readiness`.

## Delivery Checkpoints

- **Checkpoint A — Real generic creation:** Tasks 1–7. Non-inverter models must pass the same live proof, approval, transaction, and persistence workflow as inverter models.
- **Checkpoint B — Expert operations:** Task 8. All six intents must use real services and deterministic evidence.
- **Checkpoint C — Knowledge intelligence:** Task 9. Runtime retrieval must use verified records with provenance; imports remain quarantined until proof and review.
- **Checkpoint D — Honest UX and certification:** Tasks 10–12. The UI and tests must prove actual outcomes, not the presence of messages.

## Definition of Finished

The work is finished only when a user can describe any system expressible by the installed X-Bridges catalog, answer explicit clarification questions, inspect a deterministic knowledge-grounded plan, approve every action individually, and receive a model that the real engine compiled and simulated, saved and reloaded with the same fingerprint, and can undo atomically. Requests beyond catalog or engine capability must be refused with a precise explanation and no mutation.

## Plan Self-Review

- Every blocker from the 2026-09-20 audit maps to a numbered task.
- Generic planner integration is Task 2; runtime knowledge integration is Task 3; hardcoded archetype removal is Task 4.
- Ollama, proof, approvals, rollback, persistence, all six intents, UI evidence, and honest E2E tests have explicit gates.
- No task permits new external block types, fabricated evidence, illegal source access, or test weakening.
- The plan contains no deferred placeholders and each task produces an independently reviewable commit.
