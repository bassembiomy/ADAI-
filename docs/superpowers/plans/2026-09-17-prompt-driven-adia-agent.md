# Prompt-Driven ADIA Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline, approval-gated, prompt-driven central ADIA Agent that can clarify engineering requests and orchestrate existing ADIA blocks and local engineering tools, starting with the air-fryer workflow.

**Architecture:** Add a TypeScript agent domain behind a provider interface. A local 7B–8B 4-bit instruction model is accessed through Ollama or llama.cpp, while deterministic schemas, ADIA block metadata, transaction gates, and validators enforce correctness. Integrate the agent into the existing React/Electron application without changing existing model engines until adapters are tested.

**Tech Stack:** TypeScript, React 18, Electron 43, Vite, Vitest, Playwright, Ollama/llama.cpp HTTP-compatible API, existing ADIA engines and workers.

## Global Constraints

- The agent must work offline with a local CPU-capable 7B–8B 4-bit model on approximately 8–16 GB RAM.
- The exact local model must be configurable; do not hard-code a model name.
- The agent must use only existing ADIA blocks and components; it must never create a new block.
- The agent must ask one focused question at a time when required information is missing, ambiguous, conflicting, or unsafe.
- Engineering defaults require explicit user approval before entering the specification or model.
- Specification approval is required before planning.
- Plan approval is required before proposing execution changes.
- Every project or model modification requires explicit approval.
- Existing `src/App.tsx` changes are user-owned and must be preserved.
- No cloud API or internet dependency is required for normal operation.

## File Map

- Create `src/agent/types.ts`: domain types and discriminated workflow states.
- Create `src/agent/requirementState.ts`: immutable requirement-state transitions.
- Create `src/agent/clarificationEngine.ts`: missing-data, conflict, and default proposal logic.
- Create `src/agent/llmProvider.ts`: local-model provider contract and Ollama adapter.
- Create `src/agent/promptTemplates.ts`: controlled prompts and JSON-schema instructions.
- Create `src/agent/specificationEngine.ts`: structured specification generation and completeness checks.
- Create `src/agent/planEngine.ts`: deterministic plan validation and plan construction.
- Create `src/agent/approvalGate.ts`: approval tokens and pending-action transitions.
- Create `src/agent/toolGateway.ts`: allowlisted read/execute operations and audit records.
- Create `src/agent/adiaBlockCatalog.ts`: read-only index over existing ADIA blocks.
- Create `src/agent/xbridgesProposal.ts`: BLDC/inverter proposal mapping using catalog blocks only.
- Create `src/agent/agentOrchestrator.ts`: central workflow coordinator.
- Create `src/services/localLlmService.ts`: Electron-safe local LLM connectivity and health checks.
- Create `src/components/agent/AgentPanel.tsx`: chat, question, specification, plan, and approval UI.
- Create `src/components/agent/AgentPanel.css`: isolated agent styling.
- Modify `src/App.tsx`: mount the agent panel through the existing application layout.
- Create matching Vitest files beside each domain module.
- Create `tests/e2e/agent-approval-flow.spec.ts`: end-to-end approval-flow coverage.
- Modify `docs/architecture-diagram.html`: document the agent boundary if that diagram is the maintained architecture view.

## Task 1: Establish the agent domain contract

**Files:** Create `src/agent/types.ts`, `src/agent/requirementState.ts`, and their tests.

- [ ] Write tests for `TaskState`, `RequirementState`, `AgentEvent`, `ApprovalRequest`, `ToolAction`, and `AuditRecord` serialization.
- [ ] Write tests proving state transitions reject approval of an incomplete specification and preserve immutable history.
- [ ] Implement discriminated unions for `clarifying`, `specification_ready`, `awaiting_specification_approval`, `planning`, `awaiting_plan_approval`, `awaiting_change_approval`, `executing`, `validating`, `completed`, `blocked`, and `failed`.
- [ ] Implement `createRequirementState()`, `recordAnswer()`, `recordProposal()`, `approveProposal()`, and `transitionState()` with explicit validation errors.
- [ ] Run `npx vitest run src/agent/requirementState.test.ts src/agent/types.test.ts` and commit.

## Task 2: Add the local LLM provider

**Files:** Create `src/agent/llmProvider.ts`, `src/agent/promptTemplates.ts`, `src/services/localLlmService.ts`, and tests.

- [ ] Write tests for an OpenAI-compatible local provider contract: successful JSON response, malformed JSON, connection refusal, timeout, and health status.
- [ ] Define `LlmProvider.generate<T>(request: LlmRequest, schema: JsonSchema): Promise<LlmResult<T>>` and `LlmProvider.health(): Promise<LlmHealth>`.
- [ ] Implement the Ollama-compatible adapter using `fetch` against a configurable loopback URL, with an abort timeout and no remote URL by default.
- [ ] Add prompt templates that require JSON-only outputs for intent extraction, question generation, specification drafting, and proposal explanation.
- [ ] Validate all model output at the boundary and return a typed failure rather than trusting free-form output.
- [ ] Run the provider tests and commit.

## Task 3: Implement clarification and specification generation

**Files:** Create `src/agent/clarificationEngine.ts`, `src/agent/specificationEngine.ts`, and tests.

- [ ] Write tests for an air-fryer request with missing target temperature, power, voltage, sensor, control method, safety limits, and success criteria.
- [ ] Write tests proving exactly one highest-priority question is returned per clarification turn.
- [ ] Write tests for conflicting requirements and approved versus unapproved defaults.
- [ ] Implement `analyzeCompleteness(state, projectContext)` returning `complete`, `question`, `conflict`, or `blocked`.
- [ ] Implement `buildSpecification(state)` with requirement IDs, assumptions, source answers, approval status, and success criteria.
- [ ] Reject specifications containing unapproved assumptions or unresolved conflicts.
- [ ] Run focused clarification/specification tests and commit.

## Task 4: Build the read-only ADIA block catalog

**Files:** Create `src/agent/adiaBlockCatalog.ts`, tests, and narrowly scoped adapters to existing X-BRIDGES/V-Lab/SysML library exports.

- [ ] Write tests that index existing blocks by stable ID, display name, domain, ports, parameters, and capabilities.
- [ ] Write a test proving an unknown block ID cannot pass catalog lookup.
- [ ] Implement `AdiaBlockCatalog.list()`, `findByCapability()`, `findByName()`, and `isExistingBlockId()` as read-only operations.
- [ ] Ensure the catalog imports existing definitions rather than duplicating or creating block definitions.
- [ ] Add a library snapshot test so accidental block removal is visible.
- [ ] Run catalog tests and commit.

## Task 5: Implement proposal and approval gates

**Files:** Create `src/agent/approvalGate.ts`, `src/agent/planEngine.ts`, and tests.

- [ ] Write tests for specification approval, plan approval, per-change approval, rejection, expiration, and cancellation.
- [ ] Write tests proving a proposal referencing a non-catalog block is rejected before it can become executable.
- [ ] Implement `createApprovalRequest()`, `approve()`, `reject()`, and `cancel()` with one-time request IDs and audit timestamps.
- [ ] Implement plan creation with ordered actions, dependencies, affected artifacts, expected evidence, and rollback metadata.
- [ ] Require an approved specification and approved plan before any executable change action is emitted.
- [ ] Run focused gate/plan tests and commit.

## Task 6: Add the controlled tool gateway

**Files:** Create `src/agent/toolGateway.ts`, adapters under `src/agent/tools/`, and tests.

- [ ] Write tests for allowlisted read operations, proposal-only model changes, approved execution, audit records, and tool failures.
- [ ] Define `ToolGateway.inspect()`, `propose()`, `executeApproved()`, and `validate()` with typed inputs and outputs.
- [ ] Implement read adapters for ADIA project persistence and existing library state.
- [ ] Implement execution adapters for the existing X-BRIDGES/V-Lab/SysML workers, MATLAB/Simulink launch integration, compilers, and test runners only where existing project interfaces support them.
- [ ] Reject direct filesystem or process execution unless the operation is declared, allowlisted, and tied to an approval token.
- [ ] Preserve failed executions and evidence in the audit record without claiming completion.
- [ ] Run gateway tests and commit.

## Task 7: Implement the air-fryer and X-BRIDGES workflow

**Files:** Create `src/agent/xbridgesProposal.ts`, workflow fixtures, and tests.

- [ ] Write a fixture for “Create an X-BRIDGES model for a BLDC motor with inverter.”
- [ ] Write tests proving the proposal contains only existing catalog blocks for motor, inverter, source, sensors, control, and load.
- [ ] Write tests proving missing motor ratings and control data produce questions rather than guessed values.
- [ ] Implement capability matching against catalog metadata and deterministic connection/parameter validation.
- [ ] Implement air-fryer specification fields for heating, sensing, fan/control, modes, power, thermal limits, safety, simulation, code, and verification outputs.
- [ ] Return `blocked` with a precise library-gap message when no suitable existing block is available.
- [ ] Run workflow tests and commit.

## Task 8: Compose the central orchestrator

**Files:** Create `src/agent/agentOrchestrator.ts` and tests.

- [ ] Write a state-machine test covering request, questions, complete specification, specification approval, plan, plan approval, per-change approval, execution, validation, and report.
- [ ] Write tests for rejection, missing blocks, local-model outage, tool failure, and failed validation.
- [ ] Implement `AgentOrchestrator.handle(input)` and `AgentOrchestrator.approve(requestId)` as the only UI-facing workflow methods.
- [ ] Route model interpretation through `LlmProvider`, but perform completeness, catalog, approval, and validation checks deterministically.
- [ ] Emit audit events for every question, proposal, approval, tool call, result, and final status.
- [ ] Run orchestrator tests and commit.

## Task 9: Integrate the agent into the ADIA UI

**Files:** Create `src/components/agent/AgentPanel.tsx`, `src/components/agent/AgentPanel.css`; modify `src/App.tsx`.

- [ ] Write component tests for question display, answer submission, specification approval, plan approval, per-change approval, rejection, blocked state, and validation evidence.
- [ ] Add a panel that shows current project context, conversation, requirement completion, pending approval, proposed ADIA blocks, and audit history.
- [ ] Make approval buttons explicit and unavailable when the request is incomplete or blocked.
- [ ] Show model health and offline status without exposing secrets or requiring network access.
- [ ] Mount the panel through the existing App layout while preserving current user-owned changes and navigation behavior.
- [ ] Run component tests and commit.

## Task 10: Add persistence and recovery

**Files:** Create `src/agent/agentPersistence.ts`, tests, and the appropriate existing persistence integration.

- [ ] Write tests for saving/restoring requirement state, pending approvals, audit history, and interrupted execution.
- [ ] Implement versioned local JSON persistence using the existing ADIA project persistence conventions.
- [ ] On restart, restore only non-executing states; mark interrupted executions as requiring review.
- [ ] Ensure no approval token can be reused after completion, rejection, cancellation, or restore.
- [ ] Run persistence tests and commit.

## Task 11: End-to-end verification and documentation

**Files:** Create `tests/e2e/agent-approval-flow.spec.ts`; modify `docs/architecture-diagram.html` and add an agent guide under `docs/guides/`.

- [ ] Write a Playwright test for a new air-fryer request through clarification and specification approval.
- [ ] Write a Playwright test for the BLDC/inverter request proving only existing ADIA blocks are proposed and every change is approval-gated.
- [ ] Write a Playwright test for a missing-block stop and a local-LLM-unavailable state.
- [ ] Run `npx tsc --noEmit`, focused Vitest suites, `npx playwright test tests/e2e/agent-approval-flow.spec.ts`, and `npm run build:offline`.
- [ ] Document local runtime setup, model configuration, offline limitations, approval semantics, supported first workflow, and troubleshooting.
- [ ] Run `git diff --check`, review the complete diff, and commit the verified implementation.

## Verification Matrix

- Requirement completeness and one-question behavior: Tasks 1–3.
- Offline model connectivity and malformed-output safety: Task 2.
- Existing-block-only enforcement: Tasks 4 and 7.
- Approval gates and auditability: Tasks 5 and 8.
- Local engineering tool execution: Task 6.
- Air-fryer and X-BRIDGES vertical workflow: Task 7.
- UI behavior and recovery: Tasks 9–10.
- End-to-end release confidence: Task 11.

