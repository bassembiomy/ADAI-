# General X-Bridges Engineering Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ADIA Agent create, inspect, modify, diagnose, repair, and optimize any model that can be expressed and simulated with the installed X-Bridges catalog, using complete clarification, deterministic planning, individual action approvals, verified persistence, and a provenance-controlled offline model knowledge base.

**Architecture:** Replace inverter-specific planning with a catalog-derived capability index and typed graph planner. Treat Ollama as an untrusted intent/requirement extractor; deterministic code owns retrieval, compatibility, preflight, simulation proof, action generation, transactions, persistence, and reporting. Store reviewed patterns as immutable content-addressed JSON through preload IPC so renderer code never receives filesystem authority.

**Tech Stack:** Electron 43, React 18, TypeScript 5.4, Zod, Vite 7, Vitest 4, Playwright, existing X-Bridges `BLOCK_LIBRARY`, worker simulation, local Ollama, Node filesystem/crypto behind preload IPC, JSZip for read-only `.slx` parsing.

## Global Constraints

- Generated projects use only block IDs, ports, and parameters present in the active `BLOCK_LIBRARY`.
- The agent asks about every unresolved mandatory requirement; it does not silently assume values.
- A plan that cannot compile and simulate in isolation is refused before live mutation.
- Every individual mutation requires a project-, revision-, action-, kind-, and parameter-bound single-use approval.
- All approved actions belong to one atomic transaction; rejection, cancellation, stale state, or failure restores live and persisted pre-transaction state.
- Runtime planning is offline. Online ingestion is a separate reviewed workflow and never mutates an open project.
- Only legally accessible material with recorded provenance and license may become an executable pattern. Never bypass access controls.
- LLM output is untrusted structured input and never invokes a tool directly.
- Metrics must include the model fingerprint and real engine run ID that produced them.
- Do not add a native database dependency. Use a versioned content-addressed JSON store behind existing Electron IPC boundaries.

---

## File and Interface Map

| Responsibility | Files |
|---|---|
| Catalog capabilities | `src/services/ai/catalog/xbridgesCapabilityIndex.ts`, `src/agent/adiaBlockCatalog.ts` |
| Intent and requirements | `src/services/ai/planner/generalIntent.ts`, `src/services/ai/planner/requirementResolver.ts` |
| Graph synthesis | `src/services/ai/planner/generalGraphPlanner.ts`, `src/services/ai/planner/planPreflight.ts` |
| Isolated proof | `src/services/ai/proof/xbridgesProofRunner.ts`, `src/services/xbridgesWorkerClient.ts` |
| Live actions | `src/agent/applicationDelegates.ts`, `src/agent/toolAdapters/xbridgesAdapter.ts`, `src/services/ai/adapters/liveXbridgesModelAdapter.ts` |
| Transactions | `src/services/ai/execution/xbridgesAgentTransaction.ts`, `src/agent/agentOrchestrator.ts` |
| Pattern database | `src/services/ai/knowledge/patternSchemas.ts`, `patternStore.ts`, `patternRetrieval.ts`, `src/main.cjs`, `src/preload.cjs` |
| Ingestion/import | `src/services/ai/knowledge/ingestion/*`, `src/services/ai/importers/*` |
| Diagnosis/repair | `src/services/ai/diagnosis/xbridgesDiagnosis.ts`, `src/services/ai/repair/generalRepairPlanner.ts` |
| Optimization | `src/services/ai/optimization/xbridgesOptimizer.ts` |
| UI/reporting | `src/components/agent/AgentPanel.tsx`, `src/components/agent/AgentPanel.css` |
| Acceptance | `src/services/ai/benchmarks/generalXbridgesCorpus.ts`, `tests/e2e/agent-general-xbridges.spec.ts` |

## Task 1: Generate the Canonical X-Bridges Capability Index

**Files:**
- Create: `src/services/ai/catalog/xbridgesCapabilityIndex.ts`
- Create: `src/services/ai/catalog/xbridgesCapabilityIndex.test.ts`
- Modify: `src/agent/adiaBlockCatalog.ts`
- Modify: `src/engine/xbridges/types.ts`

**Interfaces:**
- Produces: `buildXbridgesCapabilityIndex(): XbridgesCapabilityIndex`
- Produces: `resolveBlockCapability(blockId: string): XbridgesBlockCapability | undefined`
- `XbridgesBlockCapability` contains exact parameter defaults/types, input/output port IDs, signal types, units, statefulness, and executable solver features.

- [ ] **Step 1: Write failing catalog-completeness tests** that iterate `Object.keys(BLOCK_LIBRARY)`, instantiate each factory with deterministic IDs, and require exactly one indexed capability per block. Assert that indexed ports and parameter names equal the factory output and that duplicate aliases fail.

```ts
it('indexes every registered block without inventing metadata', () => {
  const index = buildXbridgesCapabilityIndex();
  expect([...index.blocks.keys()].sort()).toEqual(Object.keys(BLOCK_LIBRARY).sort());
  for (const [id, factory] of Object.entries(BLOCK_LIBRARY)) {
    const block = factory(`probe_${id}`, {});
    expect(index.blocks.get(id)?.ports.map(p => p.id).sort())
      .toEqual([...block.inputs, ...block.outputs].map(p => p.id).sort());
    expect(index.blocks.get(id)?.parameterNames.sort())
      .toEqual(Object.keys(block.params).sort());
  }
});
```

- [ ] **Step 2: Run RED:** `npx vitest run src/services/ai/catalog/xbridgesCapabilityIndex.test.ts`. Expected: module-not-found failure.
- [ ] **Step 3: Implement immutable capability extraction** directly from `BLOCK_LIBRARY`; freeze returned records and derive the catalog fingerprint with the browser-safe `canonicalJson` and `sha256Hex` exported by `src/engine/opm/canonicalHash.ts`. Do not infer units or compatibility when the factory does not publish them; record `unknown` explicitly.
- [ ] **Step 4: Replace hand-maintained X-Bridges metadata in `AdiaBlockCatalog`** with the capability index while preserving its public lookup API.
- [ ] **Step 5: Run GREEN:** catalog test plus `src/agent/adiaBlockCatalog.test.ts` and `src/engine/xbridges/BlockDefinitions.test.ts`.
- [ ] **Step 6: Commit:** `feat(agent): index canonical xbridges capabilities`.

## Task 2: Add General Intent and Complete Requirement Resolution

**Files:**
- Create: `src/services/ai/planner/generalIntent.ts`
- Create: `src/services/ai/planner/generalIntent.test.ts`
- Create: `src/services/ai/planner/requirementResolver.ts`
- Create: `src/services/ai/planner/requirementResolver.test.ts`
- Modify: `src/agent/clarificationEngine.ts`
- Modify: `src/agent/promptTemplates.ts`

**Interfaces:**

```ts
type XbridgesIntent = 'create' | 'inspect' | 'modify' | 'diagnose' | 'repair' | 'optimize';
interface GeneralEngineeringRequest {
  intent: XbridgesIntent;
  objective: string;
  targetBehaviors: string[];
  inputs: RequirementValue[];
  outputs: RequirementValue[];
  constraints: RequirementConstraint[];
  optimization?: OptimizationRequest;
}
interface RequirementResolution {
  complete: boolean;
  nextQuestion?: ClarificationQuestion;
  unresolvedKeys: string[];
  canonicalRequest?: GeneralEngineeringRequest;
}
```

- [ ] **Step 1: Write failing tests** for all six intents, malformed Ollama JSON, conflicting units, missing operating point, absent source/load/reference, missing optimization bounds, and deterministic one-question ordering. Assert that no plan is returned while `unresolvedKeys.length > 0`.
- [ ] **Step 2: Run RED** with both new test files.
- [ ] **Step 3: Implement strict Zod schemas** for LLM extraction. Normalize units and aliases deterministically; preserve the original user text for audit but never use it as a block ID.
- [ ] **Step 4: Implement capability-derived questions.** Questions come from required pattern fields and active block capabilities, sorted by safety priority, dependency order, then stable key—not from free-form LLM prose.
- [ ] **Step 5: Integrate `ClarificationEngine`** so it always asks rather than creating assumptions. Reject conflicting answers with `REQUIREMENT_CONFLICT`.
- [ ] **Step 6: Run GREEN:** new tests plus `src/agent/clarificationEngine.test.ts`, `requirementState.test.ts`, and `llmProvider.test.ts`.
- [ ] **Step 7: Commit:** `feat(agent): resolve complete general xbridges requirements`.

## Task 3: Build the Deterministic General Graph Planner

**Files:**
- Create: `src/services/ai/planner/generalGraphPlanner.ts`
- Create: `src/services/ai/planner/generalGraphPlanner.test.ts`
- Modify: `src/services/ai/contracts/engineeringModel.ts`
- Modify: `src/services/ai/planner/planValidator.ts`
- Modify: `src/services/ai/planner/planPreflight.ts`

**Interfaces:**

```ts
interface PlanningContext {
  projectId: string;
  baseRevision: number;
  activeSnapshot: ModelSnapshot;
  catalog: XbridgesCapabilityIndex;
  patterns: EngineeringPattern[];
}
interface PlanningOutcome {
  status: 'planned' | 'refused';
  plan?: EngineeringModelPlanV2;
  diagnostics: StructuredDiagnostic[];
  provenance: PatternReference[];
}
function planGeneralXbridgesModel(
  request: GeneralEngineeringRequest,
  context: PlanningContext
): PlanningOutcome;
```

- [ ] **Step 1: Extend the plan schema in a failing test** with explicit operations: `add_block`, `remove_block`, `set_parameter`, `connect_ports`, `disconnect_ports`, `move_block`, and `rename_block`. Include `expectedBeforeHash`, `expectedAfterDelta`, catalog fingerprint, and stable canonical action IDs.
- [ ] **Step 2: Add failing corpus tests** for feed-forward control, closed-loop PID, signal filtering, motor control, thermal monitoring, logical sequencing, modification of an existing graph, and impossible requests. Run each input twice and assert byte-identical canonical plans.
- [ ] **Step 3: Run RED:** `npx vitest run src/services/ai/planner/generalGraphPlanner.test.ts`.
- [ ] **Step 4: Implement planner candidate ranking** by exact requirement compatibility, verified pattern quality, fewest unsupported/extra blocks, and stable pattern ID. Semantic similarity may supply candidates but cannot alter this deterministic ordering.
- [ ] **Step 5: Implement graph synthesis and diffing** against `activeSnapshot`; produce only necessary actions and stable layout coordinates. Reject unknown IDs, missing required graph roles, and ambiguous candidate ties.
- [ ] **Step 6: Generalize preflight** by moving inverter-only checks into rule plugins and adding reusable rules for source/sink reachability, unconnected required inputs, port type/unit compatibility, algebraic-loop support, sample-time compatibility, and disconnected islands.
- [ ] **Step 7: Run GREEN:** planner, validator, preflight, and existing inverter tests.
- [ ] **Step 8: Commit:** `feat(agent): synthesize deterministic xbridges graph plans`.

## Task 4: Prove Compilation and Simulation Before Approval

**Files:**
- Create: `src/services/ai/proof/xbridgesProofRunner.ts`
- Create: `src/services/ai/proof/xbridgesProofRunner.test.ts`
- Modify: `src/services/ai/simulation/simulationTools.ts`
- Modify: `src/services/xbridgesWorkerClient.ts`
- Modify: `src/engine/xbridges/xbridgesWorkerProtocol.ts`

**Interfaces:**

```ts
interface XbridgesProof {
  status: 'proved' | 'refused' | 'cancelled';
  planHash: string;
  catalogHash: string;
  engineRunId?: string;
  diagnostics: StructuredDiagnostic[];
  observables: Record<string, number | boolean | number[]>;
}
async function proveXbridgesPlan(
  plan: EngineeringModelPlanV2,
  options: ProofOptions
): Promise<XbridgesProof>;
```

- [ ] **Step 1: Write failing proof tests** for compile success, compile failure, runtime failure, timeout, cancellation, missing observable, and plan mutation after proof. Assert no live delegate calls occur.
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement an isolated plan materializer** using catalog factories in memory, then run the same worker protocol as the UI. Add worker batch execution with bounded steps and an explicit generated `engineRunId` returned by the worker.
- [ ] **Step 4: Bind proof to canonical plan and catalog hashes.** Any change invalidates proof and prevents approval creation.
- [ ] **Step 5: Remove metric fallbacks.** Missing requested measurements produce `OBSERVABLE_UNAVAILABLE`, not guessed values.
- [ ] **Step 6: Run GREEN:** proof tests, simulation tests, worker tests, and X-Bridges engine tests.
- [ ] **Step 7: Commit:** `feat(agent): prove xbridges plans in isolated worker`.

## Task 5: Complete the Live X-Bridges Mutation Surface

**Files:**
- Modify: `src/agent/applicationDelegates.ts`
- Modify: `src/agent/toolAdapters/xbridgesAdapter.ts`
- Modify: `src/agent/toolAdapters/xbridgesAdapter.test.ts`
- Modify: `src/services/ai/adapters/liveXbridgesModelAdapter.ts`
- Modify: `src/services/ai/adapters/liveXbridgesModelAdapter.test.ts`
- Modify: `src/services/ai/tools/engineeringTools.ts`

**Interfaces:** Add delegate methods `removeBlock`, `disconnectPorts`, `moveBlock`, `renameBlock`, `validate`, `saveAndReadBack`, and `getRevisionFingerprint`. Each returns observed state, not a synthetic boolean.

- [ ] **Step 1: Write failing contract tests** for every mutation, nonexistent targets, duplicate IDs/edges, invalid parameters, incompatible ports, unchanged-state false success, and exact presentation-state restoration.
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement each delegate operation** against live React state, preserving unrelated nodes, edges, positions, selection, styles, and mappings. Validate before mutation and compare pre/post fingerprints.
- [ ] **Step 4: Replace all fail-closed dispatcher placeholders** with these live methods. Keep fail-closed behavior when a capability is absent.
- [ ] **Step 5: Make `LiveXbridgesModelAdapter` execute one typed action at a time** and return `ObservedActionResult { beforeHash, afterHash, changedNodeIds, changedEdgeIds }`.
- [ ] **Step 6: Run GREEN:** adapter, dispatcher, and application-delegate tests.
- [ ] **Step 7: Commit:** `feat(agent): support complete live xbridges actions`.

## Task 6: Implement Per-Action Approval Inside One Atomic Transaction

**Files:**
- Create: `src/services/ai/execution/xbridgesAgentTransaction.ts`
- Create: `src/services/ai/execution/xbridgesAgentTransaction.test.ts`
- Modify: `src/agent/approvalGate.ts`
- Modify: `src/agent/toolGateway.ts`
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/agent/types.ts`

**Interfaces:**

```ts
interface ActionApprovalBinding {
  token: string;
  projectId: string;
  baseRevision: number;
  planHash: string;
  actionId: string;
  actionKind: XbridgesAction['kind'];
  canonicalParamsHash: string;
}
interface XbridgesAgentTransaction {
  begin(plan: ProvedPlan): Promise<TransactionState>;
  approveAndExecute(binding: ActionApprovalBinding): Promise<ObservedActionResult>;
  reject(actionId: string): Promise<RollbackResult>;
  cancel(): Promise<RollbackResult>;
  commit(): Promise<CommittedTransaction>;
  undo(transactionId: string): Promise<RollbackResult>;
}
```

- [ ] **Step 1: Write failure-injection tests** after every action kind, before/after validation, during simulation, during save, and after persisted reload. Assert exact live and persisted fingerprint restoration.
- [ ] **Step 2: Add approval-security tests** for stale revisions, altered parameters, wrong action kind, wrong project, wrong plan hash, replay, out-of-order action, and proof invalidation.
- [ ] **Step 3: Run RED.**
- [ ] **Step 4: Implement the transaction state machine**: `prepared → awaiting_action → executing_action → verifying_action → final_verification → committed`, with `rolling_back`, `rolled_back`, and `failed_rollback` terminal handling.
- [ ] **Step 5: Route orchestrator execution exclusively through this transaction.** Remove the inverter-specific final-action branch and legacy parallel execution path.
- [ ] **Step 6: Rejecting one action rolls back the whole transaction.** Read-only inspection remains outside the transaction; simulation receives its own approval action.
- [ ] **Step 7: Run GREEN:** transaction, approval gate, gateway, orchestrator, and sequential integration tests.
- [ ] **Step 8: Commit:** `feat(agent): execute approved xbridges actions atomically`.

## Task 7: Verify Real Save, Reload, Restart, and Undo

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Modify: `src/projectFiles/projectFileController.cjs`
- Create: `src/services/ai/execution/projectPersistenceProof.ts`
- Create: `src/services/ai/execution/projectPersistenceProof.test.ts`
- Test: `tests/e2e/agent-xbridges-persistence.spec.ts`

**Interfaces:** `saveProjectSnapshot(): Promise<PersistedSnapshotReceipt>` and `reloadProjectSnapshot(receipt): Promise<ModelSnapshot>` exposed through narrowly scoped preload IPC.

- [ ] **Step 1: Write failing persistence tests** proving that workspace state callbacks alone do not count as persistence. Require a file receipt, content hash, read-back model hash, and project revision.
- [ ] **Step 2: Write failing Playwright flow:** create two-block model through approvals, save to a temporary `.adia`, close/reopen the project, compare graph fingerprint, undo, and compare the original fingerprint.
- [ ] **Step 3: Implement project persistence IPC** using existing project-file controller paths; prohibit arbitrary renderer paths and constrain temporary acceptance files to the test workspace.
- [ ] **Step 4: Add commit read-back verification** and rollback of both live and persisted snapshots on mismatch.
- [ ] **Step 5: Run GREEN:** project-file tests, persistence proof test, and new E2E spec.
- [ ] **Step 6: Commit:** `feat(agent): verify persisted xbridges transactions`.

## Task 8: Create the Versioned Offline Engineering Pattern Store

**Files:**
- Create: `src/services/ai/knowledge/patternSchemas.ts`
- Create: `src/services/ai/knowledge/patternStore.ts`
- Create: `src/services/ai/knowledge/patternStore.test.ts`
- Create: `src/services/ai/knowledge/patternRetrieval.ts`
- Create: `src/services/ai/knowledge/patternRetrieval.test.ts`
- Create: `resources/engineering-patterns/manifest.json`
- Modify: `src/main.cjs`, `src/preload.cjs`

**Interfaces:** `EngineeringPatternSchema`, `PatternManifestSchema`, `PatternStore.put/get/list`, and `retrieveCompatiblePatterns(query, capabilities)`.

- [ ] **Step 1: Write failing schema tests** for all provenance, license, requirements, topology, exact mappings, simulation contract, evidence, lifecycle, and version fields. Unknown fields fail strict parsing.
- [ ] **Step 2: Write failing immutability tests:** canonical JSON hash is the ID suffix; changing content creates a new version; overwriting an existing hash is rejected; corrupted manifest or record fails closed.
- [ ] **Step 3: Implement a content-addressed JSON store** behind preload IPC with atomic temporary-file rename, maximum record size, canonical serialization, checksum verification, and read-only packaged seed patterns.
- [ ] **Step 4: Implement deterministic retrieval**: lifecycle filter, exact capability compatibility, requirements coverage, quality score, then stable ID. A vector score may break no ties and cannot admit an incompatible record.
- [ ] **Step 5: Seed existing verified ADIA models** by converting the inverter and representative repository examples with complete provenance and fresh proof evidence.
- [ ] **Step 6: Run GREEN:** pattern tests, SAST, and build.
- [ ] **Step 7: Commit:** `feat(agent): add verified offline engineering pattern store`.

## Task 9: Build Lawful Public-Source Ingestion

**Files:**
- Create: `src/services/ai/knowledge/ingestion/ingestionSchemas.ts`
- Create: `src/services/ai/knowledge/ingestion/sourcePolicy.ts`
- Create: `src/services/ai/knowledge/ingestion/sourcePolicy.test.ts`
- Create: `src/services/ai/knowledge/ingestion/ingestionPipeline.ts`
- Create: `src/services/ai/knowledge/ingestion/ingestionPipeline.test.ts`
- Modify: `src/services/ai/retrieval/webSearchService.ts`

**Interfaces:** `ingestCandidate(source, policy): Promise<QuarantinedPattern>`; ingestion output can only be `quarantined` until compatibility proof and human review.

- [ ] **Step 1: Write policy tests** that accept explicit permissive licenses and user-owned imports; quarantine unknown licenses; reject paywall/auth bypass, executable downloads, macros, oversized content, redirects outside approved origins, and missing checksums.
- [ ] **Step 2: Write ingestion tests** with local fixtures—never live network calls in unit tests—covering citations, retrieval timestamps, content hashes, sanitization, duplicate detection, and source changes.
- [ ] **Step 3: Implement source policy and pipeline** as a separate operator workflow. Runtime agent code may query only the offline store and has no ingestion API.
- [ ] **Step 4: Add an operator review command** that prints provenance, license, mapping diagnostics, and proof results and requires explicit promotion from quarantine to reviewed/verified.
- [ ] **Step 5: Run GREEN:** ingestion tests, scanner, and offline test with network disabled.
- [ ] **Step 6: Commit:** `feat(agent): ingest licensed engineering references safely`.

## Task 10: Import Simulink and Scilab Models Into Quarantine

**Files:**
- Create: `src/services/ai/importers/externalModel.ts`
- Create: `src/services/ai/importers/simulinkImporter.ts`
- Create: `src/services/ai/importers/simulinkImporter.test.ts`
- Create: `src/services/ai/importers/scilabImporter.ts`
- Create: `src/services/ai/importers/scilabImporter.test.ts`
- Create: `src/services/ai/importers/xbridgesCompatibilityCompiler.ts`
- Create: `src/services/ai/importers/xbridgesCompatibilityCompiler.test.ts`

**Interfaces:** `parseSimulink(buffer)`, `parseScilab(text)`, and `compileExternalPattern(external, capabilityIndex): CompatibilityResult`.

- [ ] **Step 1: Add safe fixture tests** for supported `.slx` XML entries and Scilab/Xcos XML. Assert zip-slip paths, macros, scripts, external references, entities, oversized entries, and malformed archives are rejected without execution.
- [ ] **Step 2: Define a neutral `ExternalModel` AST** with components, parameters, ports, links, solver settings, source provenance, and unsupported constructs.
- [ ] **Step 3: Implement read-only parsers.** Use JSZip for `.slx`; never load MATLAB, Scilab, native libraries, or embedded code.
- [ ] **Step 4: Implement explicit mapping tables** from external component semantics to existing X-Bridges IDs. No fuzzy mapping may produce an executable block. Return `UNMAPPED_EXTERNAL_COMPONENT` with source location for every gap.
- [ ] **Step 5: Require preflight and proof before promotion.** Successfully mapped imports remain quarantined until operator review.
- [ ] **Step 6: Run GREEN:** importer, compatibility, security, and proof tests.
- [ ] **Step 7: Commit:** `feat(agent): quarantine and map simulink scilab models`.

## Task 11: General Diagnosis and Bounded Repair

**Files:**
- Create: `src/services/ai/diagnosis/xbridgesDiagnosis.ts`
- Create: `src/services/ai/diagnosis/xbridgesDiagnosis.test.ts`
- Create: `src/services/ai/repair/generalRepairPlanner.ts`
- Create: `src/services/ai/repair/generalRepairPlanner.test.ts`
- Modify: `src/services/ai/repair/repairLoop.ts`

**Interfaces:** `diagnoseXbridges(snapshot, evidence): DiagnosisReport` and `proposeRepairs(report, context): RepairCandidate[]` with a hard maximum of three candidates.

- [ ] **Step 1: Write failing diagnosis tests** for requirement, retrieval, mapping, schema, topology, compile, solver, runtime, persistence, and reload failures. Every diagnostic identifies evidence and affected entities.
- [ ] **Step 2: Write failing repair tests** for missing connection, invalid bounded parameter, unsupported block, algebraic loop, and unstable candidate. Unsupported and ambiguous cases return refusal, not mutation.
- [ ] **Step 3: Implement deterministic repair rules** only. Sort candidates by smallest state delta, proof success, and stable ID. The LLM may explain diagnostics but cannot invent repair actions.
- [ ] **Step 4: Prove every candidate in isolation** and expose each mutation through Task 6 approvals. Stop after three failed candidates.
- [ ] **Step 5: Run GREEN:** diagnosis, repair, proof, and transaction tests.
- [ ] **Step 6: Commit:** `feat(agent): diagnose and repair xbridges models deterministically`.

## Task 12: Deterministic Optimization With Evidence

**Files:**
- Create: `src/services/ai/optimization/xbridgesOptimizer.ts`
- Create: `src/services/ai/optimization/xbridgesOptimizer.test.ts`
- Create: `src/services/ai/optimization/optimizationReport.ts`
- Modify: `src/services/ai/simulation/simulationTools.ts`

**Interfaces:** `optimizeXbridgesModel(snapshot, request, proofRunner): Promise<OptimizationResult>`.

- [ ] **Step 1: Write failing tests** for missing objective, missing bounds, infeasible constraints, deterministic grid search, seeded sampling, cancellation, budget exhaustion, and no-improvement results.
- [ ] **Step 2: Implement a bounded deterministic search** starting with Cartesian grid refinement; cap evaluations and wall time from the approved request. Never mutate the live model while searching.
- [ ] **Step 3: Record each candidate** with parameter vector, proof status, objective, constraint violations, model hash, and engine run ID.
- [ ] **Step 4: Convert the winner into ordinary parameter actions** that require individual approvals and atomic commit.
- [ ] **Step 5: Run GREEN:** optimization, simulation, transaction, and reproducibility tests.
- [ ] **Step 6: Commit:** `feat(agent): optimize xbridges models with reproducible evidence`.

## Task 13: Replace the Inverter Route With the General Orchestrator and UI

**Files:**
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/agent/planEngine.ts`
- Modify: `src/components/agent/AgentPanel.tsx`
- Modify: `src/components/agent/AgentPanel.css`
- Modify: `src/App.tsx`
- Test: corresponding `.test.ts` and `.test.tsx` files

**Interfaces:** The orchestrator returns a discriminated response containing intent, requirements, pattern evidence, plan, proof, current action approval, observed deltas, transaction status, and final evidence.

- [ ] **Step 1: Write failing UI/orchestrator tests** for all six intents, sequential clarification, refusal, plan/proof display, individual approvals, rejection rollback, cancellation, completion, and undo.
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Split the oversized orchestration responsibilities** into request, planning, proof, and transaction collaborators while retaining `AgentOrchestrator` as the UI facade.
- [ ] **Step 4: Remove hidden target-system fallbacks** and route every X-Bridges request through the general planner. Keep inverter patterns as ordinary knowledge records.
- [ ] **Step 5: Render exact evidence and status.** Do not show “completed” unless proof, live final validation, persisted read-back, and engine run evidence all exist.
- [ ] **Step 6: Run GREEN:** agent, panel, and App tests.
- [ ] **Step 7: Commit:** `feat(agent): expose general xbridges workflow in agent panel`.

## Task 14: Build the Cross-Domain Acceptance Corpus and Release Gate

**Files:**
- Create: `src/services/ai/benchmarks/generalXbridgesCorpus.ts`
- Create: `src/services/ai/benchmarks/generalXbridgesCorpus.test.ts`
- Create: `tests/e2e/agent-general-xbridges.spec.ts`
- Modify: `docs/AI_AGENT_EVALUATION.md`
- Modify: `docs/guides/adia-agent-guide.md`
- Modify: `docs/AI_AGENT_CODE_REVIEW.md`

- [ ] **Step 1: Define acceptance cases** for each catalog-supported domain: electrical, control, signal processing, robotics, thermal, hydraulic, logic, and mixed-rate. Each case contains natural language, clarification answers, expected graph roles, prohibited invented IDs, proof criteria, and persisted fingerprint checks.
- [ ] **Step 2: Add negative cases** for unknown blocks/ports/parameters, incompatible connections, insufficient requirements, unsupported physics, stale/replayed approvals, provider offline, malformed LLM output, cancellation, worker crash, save failure, and reload mismatch.
- [ ] **Step 3: Make benchmark execution use the exact AgentPanel orchestrator/delegate path.** Disable any one of add/connect/update/remove/save/reload/simulate and assert the relevant case fails.
- [ ] **Step 4: Add Playwright flows** for create, modify, diagnose/repair, optimize, refusal, persistence/restart, and one-step undo.
- [ ] **Step 5: Run the complete release matrix:**

```powershell
npx vitest run src/agent src/services/ai src/components/agent src/engine/xbridges src/services/xbridgesWorkerClient.test.ts src/services/localLlmService.test.ts
npx playwright test tests/e2e/agent-approval-flow.spec.ts tests/e2e/agent-real-adapter-contract.spec.ts tests/e2e/agent-general-xbridges.spec.ts tests/e2e/agent-xbridges-persistence.spec.ts
npm run test:project-files
npm run scan:sast
npx tsc --noEmit
npm run build
```

- [ ] **Step 6: Run a configured Ollama smoke corpus** with `qwen2.5-coder:7b`; record model digest, prompt schema version, pass/fail totals, latency, and every deterministic refusal. LLM variance must not change the canonical plan after requirements are normalized.
- [ ] **Step 7: Perform independent integrity review** for direct LLM mutation, bypassable approvals, stale state, fabricated evidence, incomplete rollback, unsafe imports, licensing gaps, and renderer filesystem/network authority.
- [ ] **Step 8: Mark release candidate only when** the full matrix exits 0, the corpus has zero invented identifiers, all injected failures restore exact state, and no blocker/high model-integrity findings remain.
- [ ] **Step 9: Commit:** `test(agent): certify general xbridges engineering workflow`.

## Delivery Checkpoints

- **Checkpoint A — General creation:** Tasks 1–7. Ship only when arbitrary supported create/modify requests prove, persist, and undo through the live UI path.
- **Checkpoint B — Knowledge-backed planning:** Tasks 8–10. Ship only when provenance and compatibility promotion are auditable and imports cannot execute code.
- **Checkpoint C — Expert behavior:** Tasks 11–12. Ship only when diagnosis, repair, and optimization are deterministic and evidence-backed.
- **Checkpoint D — Release:** Tasks 13–14. Remove “experimental” status only after the complete acceptance matrix and independent review pass.

## Plan Self-Review Result

- Every approved design requirement maps to at least one task.
- Runtime browsing is excluded; lawful ingestion is isolated in Task 9.
- Existing X-Bridges blocks remain the sole executable vocabulary in Tasks 1, 3, and 10.
- Individual approvals and whole-transaction rollback are both explicit in Task 6.
- Real compilation, simulation, save/reload, and engine evidence are mandatory in Tasks 4 and 7.
- The plan introduces no native database dependency and preserves Electron renderer isolation.
