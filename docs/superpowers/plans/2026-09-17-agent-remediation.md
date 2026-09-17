# ADIA Agent Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Antigravity ADIA Agent implementation truthful and production-safe by connecting approved actions to real ADIA operations, using real project context, and integrating Ollama without fake results or unrelated changes.

**Architecture:** Keep the existing central TypeScript orchestrator, but replace its simulated gateway with dependency-injected adapters for ADIA persistence, X-BRIDGES, V-Lab, SysML, MATLAB/Simulink, compilers, and validators. Every adapter receives a typed approved action and returns real evidence. Ollama remains a loopback-only provider with user-configurable model selection and deterministic fallback only for inspection/planning—not simulated execution.

**Tech Stack:** TypeScript, React, Electron, existing ADIA services/workers, Ollama HTTP API, Vitest, Playwright.

## Global Constraints

- Never report simulation, model creation, compilation, or validation success unless a real tool produced the evidence.
- Never create an ADIA block; only use block IDs returned by the existing ADIA catalog.
- Preserve specification approval, plan approval, and approval before every modification.
- Keep Ollama local by default and reject non-loopback URLs in offline mode.
- Deterministic fallback may explain limitations and inspect data, but must not fabricate engineering results.
- Remove or isolate unrelated V-Lab changes from the agent branch.
- Preserve existing user changes in `src/App.tsx`.

## Task 1: Establish a clean remediation baseline

**Files:** Branch history and `src/engine/vlab/gasEquations.test.ts`, `src/engine/vlab/vlabEquations.ts`.

- [ ] Compare the agent branch against its parent and record the unrelated V-Lab files.
- [ ] Restore `src/engine/vlab/gasEquations.test.ts` and `src/engine/vlab/vlabEquations.ts` to the parent branch versions in the Antigravity branch, unless a separate commit proves they are required by the agent.
- [ ] Keep only agent-related files in the remediation change set.
- [ ] Run `git diff --check` and commit the cleanup separately with `chore(agent): isolate agent changes`.

## Task 2: Define real action and adapter contracts

**Files:** Modify `src/agent/types.ts`; create `src/agent/actionContracts.ts` and tests.

- [ ] Add typed action kinds: `instantiate_block`, `connect_ports`, `configure_parameters`, `run_simulation`, `generate_code`, `run_tests`, and `generate_report`.
- [ ] Define `ApprovedAction` with `id`, `kind`, `projectId`, `targetWorkspace`, `params`, `blockIds`, `approvalId`, and `expectedEvidence`.
- [ ] Define `ToolAdapter.execute(action: ApprovedAction): Promise<ToolResult>` and `ToolAdapter.inspect(params): Promise<InspectionResult>`.
- [ ] Define `ToolResult` with `success`, `changedArtifacts`, `evidence`, `stdout`, `stderr`, `durationMs`, and `error`.
- [ ] Add tests proving an action without an approval ID, project ID, or catalog-valid block IDs is rejected.
- [ ] Run the focused type and contract tests and commit.

## Task 3: Replace the fake tool gateway

**Files:** Modify `src/agent/toolGateway.ts`; create `src/agent/toolAdapters/adiaProjectAdapter.ts`, `xbridgesAdapter.ts`, `vlabAdapter.ts`, `sysmlAdapter.ts`, `localProcessAdapter.ts`, and tests.

- [ ] Write failing tests proving `executeApproved()` dispatches according to `ApprovedAction.kind` instead of always calling `run_simulation`.
- [ ] Write failing tests proving no adapter is invoked for a missing, expired, consumed, or mismatched approval token.
- [ ] Implement dependency injection for an adapter registry keyed by action kind.
- [ ] Implement the ADIA project adapter using the existing project persistence and current workspace state rather than a hard-coded project object.
- [ ] Implement the X-BRIDGES adapter through the existing X-BRIDGES workspace/worker command boundary; it must instantiate, connect, and configure only catalog blocks.
- [ ] Implement V-Lab and SysML adapters through their existing worker or command gateways; do not duplicate their model mutation logic.
- [ ] Implement the local-process adapter with an explicit executable allowlist, argument arrays (never shell interpolation), working-directory validation, timeout, cancellation, and captured evidence.
- [ ] Make `run_simulation` return failure when no real simulator adapter is configured; never return sample temperatures or timing values.
- [ ] Make `inspect_project`, `inspect_model`, and `inspect_simulation_status` query real state.
- [ ] Run gateway and adapter tests and commit.

## Task 4: Make action execution truthful and sequential

**Files:** Modify `src/agent/agentOrchestrator.ts`, `src/agent/planEngine.ts`, and tests.

- [ ] Write a failing orchestrator test with a plan containing instantiate, connect, configure, simulate, validate, and report actions; assert each action reaches the matching adapter in order.
- [ ] Pass the actual approved action to `executeApproved()` rather than constructing `{ durationSeconds: 300 }` inside the orchestrator.
- [ ] Verify that the approved request’s action ID, approval ID, project ID, and parameters match the plan action before execution.
- [ ] Mark an action completed only after its adapter returns real success and evidence.
- [ ] Stop on the first failed action, preserve prior evidence, and return a reviewable `failed` or `blocked` state.
- [ ] Create the next per-change approval only after the previous action succeeds and validation passes for that action.
- [ ] Use approved specification criteria when validating instead of hard-coded rise time and overshoot thresholds.
- [ ] Run orchestrator tests and commit.

## Task 5: Build real air-fryer and X-BRIDGES proposals

**Files:** Modify `src/agent/xbridgesProposal.ts`, `src/agent/specificationEngine.ts`, and tests.

- [ ] Write tests for “Create an X-BRIDGES model for a BLDC motor with inverter” that assert real catalog IDs, port compatibility, required parameters, and unresolved questions.
- [ ] Write tests for an air-fryer request that produce requirements for heater, sensor, controller, fan, safety limits, modes, and acceptance criteria without guessed values.
- [ ] Map proposal actions to the typed action contract with exact block IDs, port IDs, parameter names, and expected evidence.
- [ ] Reject any proposal containing a block ID absent from the live catalog.
- [ ] Reject any connection whose source/target ports are incompatible according to existing ADIA connection rules.
- [ ] Return a precise blocked result when an existing ADIA block cannot satisfy a required capability.
- [ ] Run workflow tests and commit.

## Task 6: Correct Ollama integration

**Files:** Modify `src/agent/llmProvider.ts`, `src/services/localLlmService.ts`, `src/components/agent/AgentPanel.tsx`; create/update tests and local configuration documentation.

- [ ] Write tests for Ollama `/api/tags`, model discovery, selected-model availability, `/api/generate`, timeout, malformed JSON, and unavailable-server states.
- [ ] Make the base URL default to `http://127.0.0.1:11434` and allow only loopback hosts for offline mode.
- [ ] Replace the fixed model default with an empty or validated selected model; require the user to select an installed Ollama model when none is configured.
- [ ] Persist the selected model and local URL through the existing local settings convention.
- [ ] Add a model selector and “Test Ollama connection” control to the agent UI.
- [ ] Display `Ollama connected`, `Ollama unavailable`, or `Deterministic inspection-only mode`; do not always display “Offline Mode.”
- [ ] Validate model output against the complete schema required by each operation, including types, enums, and nested fields.
- [ ] Ensure fallback mode never creates proposals or evidence that were not produced by deterministic ADIA inspection.
- [ ] Run provider/service/component tests and commit.

## Task 7: Connect the UI to real project context

**Files:** Modify `src/App.tsx`, `src/components/agent/AgentPanel.tsx`, persistence integration, and tests.

- [ ] Write a component test proving the panel receives the active project name, workspace, blocks, nodes, connections, and current model state.
- [ ] Pass a stable project-context provider from App instead of defaulting to `AirFryer Project` and static block counts.
- [ ] Display the exact affected artifacts and action parameters in every change-approval card.
- [ ] Disable approval if the proposal is stale, blocked, contains unknown blocks, or has no real adapter.
- [ ] Refresh the panel after an approved adapter changes the project so the UI reflects actual ADIA state.
- [ ] Run component tests and commit.

## Task 8: Persistence, audit, and recovery hardening

**Files:** Modify `src/agent/agentPersistence.ts`, `src/agent/toolGateway.ts`, `src/agent/approvalGate.ts`, and tests.

- [ ] Persist action IDs, adapter results, changed-artifact hashes, approval IDs, and evidence references.
- [ ] Make audit records immutable from the UI and include actor, action, project, approval, adapter, and result status.
- [ ] Mark an interrupted real execution as `requires_review`; never resume it automatically.
- [ ] Prevent approval-token reuse across restart, action mismatch, or changed parameters.
- [ ] Add tests for recovery after adapter timeout, process crash, and validation failure.
- [ ] Run persistence/security tests and commit.

## Task 9: Verification and release gate

**Files:** Modify `tests/e2e/agent-approval-flow.spec.ts`; add `tests/e2e/agent-real-adapter-contract.spec.ts`; update `docs/guides/adia-agent-guide.md`.

- [ ] Run TypeScript compilation and fix all errors: `npx tsc --noEmit`.
- [ ] Run agent tests: `npx vitest run src/agent src/services/localLlmService.test.ts src/components/agent/AgentPanel.test.tsx --reporter=verbose`.
- [ ] Run the E2E approval test with a fake adapter that records calls and returns explicit evidence; assert no action occurs before approval.
- [ ] Run the missing-block test and assert the workflow blocks without creating a component.
- [ ] Run the Ollama integration test against a local test double; keep real Ollama as a documented manual acceptance check.
- [ ] Run `npm run build:offline` and the relevant existing X-BRIDGES, V-Lab, SysML, security, and worker suites.
- [ ] Manually verify one real approved operation in a disposable ADIA project and capture the generated evidence.
- [ ] Document installation, model selection, offline behavior, real-tool requirements, failure states, and the fact that no new ADIA blocks are ever generated.
- [ ] Run `git diff --check`, inspect the complete diff, and commit only after all release gates pass.

## Review Acceptance Criteria

- The agent never reports hard-coded simulation results.
- The approved plan action is the action executed.
- Real ADIA project state is inspected and updated through existing boundaries.
- Every modification requires a matching one-time approval token.
- Missing catalog blocks stop the workflow.
- Ollama model and connection status are visible and configurable.
- Offline fallback is explicit and cannot fabricate engineering evidence.
- The branch contains no unrelated V-Lab deletion or modification.

