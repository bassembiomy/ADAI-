# ADIA Local AI Engineering Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend ADIA's existing local Agent infrastructure into a controlled, validated three-phase-inverter engineering workflow without duplicating the model engines, registries, validators, persistence, or undo/transaction mechanisms already in the repository.

**Architecture:** Keep the Agent in the renderer-facing TypeScript application layer, with the existing `AgentOrchestrator` as workflow coordinator, `ILLMProvider` as the provider boundary, `AdiaBlockCatalog` as the discovery source, `PlanValidator`/`CapabilityRegistry` as preflight gates, and adapter-backed transactions as the mutation boundary. Add an explicit engineering model-plan contract and inverter-specific planning/execution adapters; do not create a standalone server until a concrete Electron isolation requirement is demonstrated. Keep Ollama local and replaceable.

**Tech Stack:** Electron 43, React 18, Vite 7, TypeScript 5.4, Vitest 4, Playwright, existing ADIA V-Lab/X-Bridges/SysML engines, local Ollama HTTP API.

## Global Constraints

- The LLM is a planner/reasoner; it never directly edits ADIA state.
- Every block, port, parameter, and connection must resolve against existing ADIA metadata before execution.
- All mutations go through narrow ADIA-specific tools/adapters and an approval/transaction boundary.
- Structured outputs are mandatory; malformed or stale plans are rejected fail-closed.
- Validation must distinguish schema, topology, engineering, compile, and simulation outcomes.
- Automatic repair is bounded to three attempts and must make minimal changes.
- Local workflows must function without Internet; remote providers remain replaceable configuration options.
- No arbitrary shell, file-write, JavaScript-eval, or generic mutation tool is exposed to the model.

## Repository Analysis

### Existing reusable components

| Requirement | Existing implementation | Decision |
|---|---|---|
| Agent workflow/state | `src/agent/agentOrchestrator.ts`, `requirementState.ts`, `clarificationEngine.ts` | Extend, do not replace |
| Approvals/audit | `approvalGate.ts`, `types.ts`, `toolGateway.ts`, `AgentPanel.tsx` | Reuse and add plan/action detail |
| Block discovery | `src/agent/adiaBlockCatalog.ts`, `src/utils/vlabLibrary.ts`, `src/utils/xbridges/XbridgesLibrary.ts` | Make schema richer, preserve source libraries |
| LLM abstraction | `src/services/ai/providers/providerInterface.ts`, `localOllamaProvider.ts`, `providerFactory.ts` | Reuse; add health/config/error normalization |
| Structured generation | `structuredGenerationCoordinator.ts`, `planSchemas.ts`, `planValidator.ts` | Make model-plan schemas the canonical contract |
| Safe execution | `src/services/ai/execution/transactionManager.ts`, journal stores, adapters | Reuse; add inverter/model adapter coverage |
| SysML topology validation | `sysmlIntegrityService.ts`, `sysmlCreationRules.ts`, `sysmlCommandGateway.ts` | Wrap through tool contracts where SysML is the target |
| Simulation | V-Lab/X-Bridges worker clients and engines | Expose capability-gated simulation tools |
| UI | `src/components/agent/AgentPanel.tsx`, `src/components/AiArchitectSidebar.tsx` | Extend with guided plan preview, diagnostics, cancel, undo |
| Security | Electron preload/main, input validators, CSP, SAST tests | Keep local Ollama access allowlisted and validated |

### Architectural conflicts and risks

1. `AgentOrchestrator` currently defaults intent handling to an air-fryer and builds legacy action plans. This must become target-system agnostic, with inverter routing selected by registry/template retrieval.
2. `AdiaBlockCatalog` loses rich port and parameter semantics for X-Bridges blocks and has no canonical aliases/compatibility schema. It must expose source-native metadata or explicitly report unavailable fields.
3. Existing approval flow is action-by-action. Guided mode needs a plan-level preview plus transaction-level approval while preserving the existing stale-revision checks.
4. The repository contains multiple model domains (V-Lab, X-Bridges, SysML, OPM) rather than one universal block graph. The first vertical slice must declare its target domain and adapter; cross-domain connections must be rejected unless a registered bridge exists.
5. `LocalOllamaProvider` currently hard-codes a default model and lacks health/model-unavailable normalization. Configuration must move to validated settings with no required model name in core logic.
6. Simulation support is domain-specific and asynchronous. The Agent must report unsupported simulation explicitly rather than treating validation as simulation success.

## Ordered Implementation Tasks

### Task 1: Freeze the canonical Agent contracts

**Files:**
- Create: `src/services/ai/contracts/engineeringModel.ts`
- Create: `src/services/ai/contracts/toolResults.ts`
- Modify: `src/services/ai/planner/planSchemas.ts`
- Modify: `src/services/ai/planner/planValidator.ts`
- Test: `src/services/ai/contracts/engineeringModel.test.ts`, `src/services/ai/planner/planValidator.test.ts`

Define `EngineeringModelPlan`, `LogicalBlock`, `LogicalConnection`, `ParameterIntent`, `ValidationCriterion`, structured diagnostics, and a discriminated tool-result union. Require target domain, stable logical IDs, registry block IDs, explicit ports, and base project revision. Reject unknown fields, duplicate IDs, unknown block IDs, unknown ports, invalid parameter names/types, self-connections, and cross-domain connections without a registered bridge.

Run: `npx vitest run src/services/ai/contracts/engineeringModel.test.ts src/services/ai/planner/planValidator.test.ts`.

### Task 2: Upgrade the block catalog into the canonical read-only registry

**Files:**
- Modify: `src/agent/adiaBlockCatalog.ts`
- Modify: `src/utils/vlabLibrary.ts` only where metadata is missing and can be added without changing runtime behavior
- Modify: `src/engine/xbridges/BlockDefinitions.ts` or its source adapter as needed
- Create: `src/services/ai/retrieval/blockSearch.ts`
- Test: `src/agent/adiaBlockCatalog.test.ts`, `src/services/ai/retrieval/blockSearch.test.ts`

Expose stable ID, aliases, domain, category, description, port direction/type/domain, parameter schema, compatibility metadata, source library, and documentation references. Preserve source truth; never synthesize a missing port or parameter. Implement deterministic search ranking by exact ID/name, aliases, category, capability, and description. Add tests proving nonexistent blocks never resolve and that returned details reflect the source library.

Run: `npx vitest run src/agent/adiaBlockCatalog.test.ts src/services/ai/retrieval/blockSearch.test.ts`.

### Task 3: Define the narrow Agent tool boundary

**Files:**
- Create: `src/services/ai/tools/engineeringTools.ts`
- Create: `src/services/ai/tools/engineeringToolSchemas.ts`
- Modify: `src/agent/toolGateway.ts`
- Modify: `src/agent/actionContracts.ts`
- Test: `src/services/ai/tools/engineeringTools.test.ts`

Implement read tools (`search_blocks`, `get_block_definition`, `inspect_model`, `get_model_summary`) and mutation intents (`create_model`, `add_block`, `remove_block`, `move_block`, `rename_block`, `set_parameter`, `connect_ports`, `disconnect_ports`, `validate_model`, `simulate_model`, `read_diagnostics`, `undo_transaction`). Each mutation must validate arguments, project/revision scope, registry references, and approval token before delegating. No tool may accept arbitrary code or raw project JSON replacement.

Run: `npx vitest run src/services/ai/tools/engineeringTools.test.ts src/agent/toolGateway.test.ts`.

### Task 4: Make provider configuration and Ollama failure handling production-safe

**Files:**
- Modify: `src/services/ai/providers/providerInterface.ts`
- Modify: `src/services/ai/providers/localOllamaProvider.ts`
- Modify: `src/services/ai/providers/providerFactory.ts`
- Modify: `src/services/localLlmService.ts`
- Test: existing provider tests plus `src/services/ai/providers/localOllamaProvider.test.ts`

Add validated provider settings (`provider`, `baseUrl`, optional `modelId`, temperature, context, timeout), `healthCheck`, cancellation, timeout, malformed-response, model-not-found, and Ollama-unavailable diagnostics. Do not silently default to a model that may not exist; surface configuration status to the UI. Keep `ILLMProvider` independent of Ollama.

Run: `npx vitest run src/services/ai/providers src/services/localLlmService.test.ts`.

### Task 5: Replace target-specific intent defaults with template-driven requirement analysis

**Files:**
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/agent/clarificationEngine.ts`
- Modify: `src/agent/specificationEngine.ts`
- Create: `src/services/ai/templates/templateTypes.ts`
- Create: `src/services/ai/templates/threePhaseInverter.ts`
- Modify: `src/agent/promptTemplates.ts`
- Tests: corresponding existing tests plus `src/services/ai/templates/threePhaseInverter.test.ts`

Add explicit workflow states for understand, retrieve, clarify, plan, preflight, build, validate, repair, simulate, final verify, report while maintaining compatibility with persisted `TaskState`. Route “three-phase inverter” to a template that declares dynamic questions, required information, recommended roles, and validation criteria. Ask only missing critical questions; retain assumptions as reviewable records.

Run: `npx vitest run src/agent/agentOrchestrator.test.ts src/agent/clarificationEngine.test.ts src/services/ai/templates/threePhaseInverter.test.ts`.

### Task 6: Implement plan preflight and planner/executor separation

**Files:**
- Create: `src/services/ai/planner/planPreflight.ts`
- Modify: `src/services/ai/planner/dependencyGraph.ts`
- Modify: `src/agent/planEngine.ts`
- Modify: `src/agent/agentOrchestrator.ts`
- Test: `src/services/ai/planner/planPreflight.test.ts`

Resolve every logical block to a real catalog entry, validate every port and parameter, check compatibility, detect missing environment/reference blocks, and reject contradictions before opening a transaction. The planner may produce a plan; only the executor/tool layer may mutate state. If an adapter says the plan is impossible, return to clarification/planning rather than silently redesigning it.

Run: `npx vitest run src/services/ai/planner/planPreflight.test.ts src/agent/planEngine.test.ts`.

### Task 7: Add inverter adapter execution through existing transactions

**Files:**
- Create: `src/services/ai/adapters/engineeringModelAdapter.ts`
- Modify: `src/services/ai/execution/transactionManager.ts`
- Modify: `src/agent/toolAdapters/vlabAdapter.ts`, `xbridgesAdapter.ts`, or `sysmlAdapter.ts` only for explicit adapter contracts
- Test: `src/services/ai/adapters/engineeringModelAdapter.test.ts`, `src/services/ai/execution/transactionManager.test.ts`

Execute approved plans as narrow adapter operations, journal before/after state, verify each action, increment revision only on commit, and restore snapshots on failure/restart. Ensure UI undo maps to the committed transaction and that partial builds cannot remain after a failed transaction.

Run: `npx vitest run src/services/ai/adapters/engineeringModelAdapter.test.ts src/services/ai/execution/transactionManager.test.ts`.

### Task 8: Add post-build validation, diagnostics, and bounded repair

**Files:**
- Create: `src/services/ai/validation/modelValidation.ts`
- Create: `src/services/ai/repair/repairLoop.ts`
- Create: `src/services/ai/repair/diagnosticClassifier.ts`
- Test: `src/services/ai/validation/modelValidation.test.ts`, `src/services/ai/repair/repairLoop.test.ts`

Aggregate schema, topology, parameter, domain/unit, engineering, compile, and simulation results. Classify only deterministic repairable errors, execute at most three repairs, revalidate after each, and stop with unresolved diagnostics. A valid plan or JSON alone must never produce a success report.

Run: `npx vitest run src/services/ai/validation/modelValidation.test.ts src/services/ai/repair/repairLoop.test.ts`.

### Task 9: Integrate simulation capability without overclaiming

**Files:**
- Create: `src/services/ai/simulation/simulationTools.ts`
- Modify: existing V-Lab/X-Bridges worker client interfaces as required
- Test: `src/services/ai/simulation/simulationTools.test.ts`

Expose compile/simulate/status/stop/diagnostics/results only when the target adapter advertises the capability. Normalize cancellation, timeout, solver failure, and unsupported-domain results. Report validation success separately from simulation success.

Run: `npx vitest run src/services/ai/simulation/simulationTools.test.ts src/services/vlabWorkerClient.test.ts src/services/xbridgesWorkerClient.test.ts`.

### Task 10: Complete guided UI, cancellation, action log, and undo

**Files:**
- Modify: `src/components/agent/AgentPanel.tsx`
- Modify: `src/components/agent/AgentPanel.css`
- Modify: `src/App.tsx`
- Test: `src/components/agent/AgentPanel.test.tsx`, `tests/e2e/agent-approval-flow.spec.ts`

Add provider health state, question cards, assumptions, plan preview, explicit apply/approve, action log, validation/diagnostic panels, stop/cancel, and undo. Disable execution while approval is stale or preflight is invalid. Preserve accessible error messages and existing approval-flow behavior.

Run: `npx vitest run src/components/agent/AgentPanel.test.tsx`; then `npx playwright test tests/e2e/agent-approval-flow.spec.ts tests/e2e/agent-real-adapter-contract.spec.ts`.

### Task 11: Add the first vertical-slice benchmark and security gates

**Files:**
- Create: `src/services/ai/benchmarks/threePhaseInverterScenario.ts`
- Create: `src/services/ai/benchmarks/threePhaseInverterScenario.test.ts`
- Modify: `scripts/security_sast_scan.cjs` only if new forbidden bypass patterns are needed
- Create: `docs/AI_AGENT_EVALUATION.md`

Test the complete scenario: request, dynamic clarification, exact registry resolution, plan approval, preflight rejection of hallucinated blocks/ports, transactional build, invalid-connection rejection, validation, bounded repair, simulation capability handling, final report, cancellation, and undo. Add metrics for registry resolution, invalid-plan rejection, validation correctness, repair termination, and truthful reporting.

Run: `npx vitest run src/services/ai/benchmarks/threePhaseInverterScenario.test.ts`; `npm run scan:sast`; `npm run build`.

## Acceptance Criteria

- “Create a three-phase inverter model” triggers targeted clarification and does not build on missing critical requirements.
- Every selected block and port is present in the canonical registry; nonexistent IDs are rejected before mutation.
- The plan is machine-readable, revision-scoped, approval-visible, and preflight validated.
- All edits use controlled tools/adapters inside a recoverable transaction and are undoable.
- Invalid topology, domains, units, parameters, and required ports produce structured diagnostics.
- Ollama is configurable, health failures are actionable, and provider code is replaceable.
- Simulation/compile results are reported distinctly from model validation.
- Repair stops after three attempts and never claims success with unresolved errors.
- Existing ADIA domain tests, security tests, TypeScript build, and relevant E2E tests remain green.

## Implementation & Finish Execution Status

All 9 tasks from the finish implementation plan (`docs/superpowers/plans/2026-09-18-adia-agent-finish.md`) have been implemented, verified, and audited:

1. **Task 1 (Real Inverter Topology):** Pinned `DC_VOLTAGE_SOURCE` and `THREE_PHASE_LOAD` in `BLOCK_LIBRARY`; `PlanPreflight` rejects missing rail returns, gate-power port mismatches, and domain mismatches fail-closed.
2. **Task 2 (Live Model Adapter):** Built `LiveXbridgesModelAdapter` translating logical IDs to live ReactFlow node IDs with atomic snapshot/restore and stale-revision rejection.
3. **Task 3 (Live Engineering Tools):** Connected `EngineeringToolDispatcher` directly to live adapters; single-use, revision-bound tokens enforced.
4. **Task 4 (Guided UI Flow):** Interview extraction, 16-step canonical plan preview, diagnostics panel, and execution cards.
5. **Task 5 (Atomic Transactions & Undo):** Rollback on partial writes/cancellations, journal status tracking, and stale undo prevention.
6. **Task 6 (Honest Simulation & Repair):** Real `engineRunId` with measured solver metrics; compile validation via `XbridgesEngine.compile()`; bounded 3-attempt repair.
7. **Task 7 (Security Hardening):** Removed loose `sast-ignore` and broad `generated` exclusions; eliminated unsafe `eval` and `new Function`; audited exceptions strictly verified.
8. **Task 8 (Live Acceptance Benchmarks):** Canonical 5-block vertical slice benchmark meeting 100% metrics across resolution, preflight, validation, repair, simulation, live adapter, and undo.
9. **Task 9 (Release Review):** Comprehensive independent code review documented in `docs/AI_AGENT_CODE_REVIEW.md`.

## Verification Commands

```powershell
# 1. Benchmark & Contract Tests
npx vitest run src/services/ai/benchmarks/

# 2. Agent, Services, & Validation Suite
npx vitest run src/agent src/services/ai src/services/localLlmService.test.ts src/components/agent

# 3. Security Unit Tests & Offline SAST Scan
node scripts/security_sast_scan.test.cjs
npm run scan:sast

# 4. Typecheck and Production Build
npx tsc --noEmit
npm run build
```

