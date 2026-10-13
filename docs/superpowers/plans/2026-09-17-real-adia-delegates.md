# Real ADIA Delegate Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the approval-gated agent to the real ADIA X-BRIDGES, SysML, and reporting workflows so approved actions modify actual application state and produce real evidence.

**Architecture:** Keep `AgentOrchestrator` and `ToolGateway` as the approval boundary. Add application-owned delegate objects in `App.tsx` that call the same state setters and command gateways already used by ADIA UI workspaces. Inject these delegates into the adapters and refresh the agent context after every successful action. If a delegate is unavailable, the adapter must fail closed.

**Tech Stack:** TypeScript, React, Electron, existing ADIA state/persistence services, X-BRIDGES React Flow model, SysML command gateway, reporting feature, Vitest, Playwright.

## Global Constraints

- Every mutation requires a valid, one-time approval token.
- Use only existing ADIA catalog blocks; never create a new block definition.
- Reuse existing workspace mutation and command-gateway logic; do not duplicate model rules.
- No adapter may report success unless the real delegate completed the operation.
- Preserve the user’s existing `src/App.tsx` changes.
- Failed or unavailable delegates must return explicit failure evidence and must not partially claim completion.

## Task 1: Define application delegate interfaces

**Files:** Create `src/agent/applicationDelegates.ts`; modify `src/agent/actionContracts.ts`; add tests.

- [ ] Define `XbridgesApplicationDelegate` with `getNodes`, `getEdges`, `addBlock`, `connectPorts`, `updateParameters`, and `save`.
- [ ] Define `SysmlApplicationDelegate` with `inspect`, `executeCommand`, and `validate`.
- [ ] Define `ReportApplicationDelegate` with `generateReport` returning artifact paths, hashes, and evidence.
- [ ] Define `ProjectApplicationDelegate` with project identity, active workspace, model snapshot, and persistence refresh methods.
- [ ] Define `AgentApplicationDelegates` as an optional dependency bundle, where absent mutation delegates are invalid for execution.
- [ ] Test that read-only accessors may be absent only for inspection fields, while mutation methods are required for their action kinds.
- [ ] Run `npx vitest run src/agent/applicationDelegates.test.ts` and commit.

## Task 2: Connect X-BRIDGES to live App state

**Files:** Modify `src/App.tsx`, `src/agent/toolAdapters/xbridgesAdapter.ts`, `src/agent/toolGateway.ts`; add adapter tests.

- [ ] Create an application delegate in `App.tsx` around `globalXBridgesNodes`, `globalXBridgesEdges`, `setGlobalXBridgesNodes`, and `setGlobalXBridgesEdges`.
- [ ] Implement `addBlock` using the existing `BLOCK_LIBRARY[type]` factory so the node data, ports, defaults, and metadata match manually created X-BRIDGES blocks.
- [ ] Reject a block type unless it is present in both `AdiaBlockCatalog` and the existing X-BRIDGES block library.
- [ ] Implement `connectPorts` by validating source/target node and port compatibility with existing X-BRIDGES rules before appending the edge.
- [ ] Implement `updateParameters` by immutably updating the matching node’s `data.params`, preserving all other node metadata.
- [ ] Implement `save` through the existing X-BRIDGES persistence callback and wait for its completion.
- [ ] Pass this delegate to `XbridgesAdapter` only when the active workspace is X-BRIDGES and the state setters are available.
- [ ] Add tests proving approved add, connect, and parameter actions update the actual node/edge arrays.
- [ ] Add tests proving unknown blocks, unknown nodes, invalid ports, and missing delegates fail without changing arrays.
- [ ] Run focused X-BRIDGES and adapter tests and commit.

## Task 3: Connect SysML to the existing command gateway

**Files:** Modify `src/App.tsx`, `src/agent/toolAdapters/sysmlAdapter.ts`; use existing `src/services/sysmlCommandGateway.ts` and related services; add tests.

- [ ] Create a SysML delegate that reads the current canonical SysML model and revision from the existing store.
- [ ] Map approved agent action kinds to existing SysML commands instead of directly mutating arrays in the adapter.
- [ ] Require the command gateway to validate ownership, endpoint policy, relationship kind, duplicate IDs, and revision before applying a command.
- [ ] Return the command result, updated revision, changed element IDs, and validation evidence as `ToolResult` evidence.
- [ ] Reject stale revisions and preserve the model unchanged when a command fails.
- [ ] Inject the delegate into `SysmlAdapter` only when the SysML gateway is available.
- [ ] Add tests for a valid block/requirement command, invalid relationship, stale revision, and unavailable gateway.
- [ ] Run `npm run test:sysml` plus the focused adapter tests and commit.

## Task 4: Connect reporting to the real report pipeline

**Files:** Modify `src/App.tsx`, `src/agent/toolAdapters/adiaProjectAdapter.ts`; use existing files under `src/features/reporting/`; add tests.

- [ ] Identify the existing report document-model and export entry points used by `GlobalReportPreviewModal` and report actions.
- [ ] Create a report delegate that receives a frozen project snapshot, execution evidence, requested format, and template.
- [ ] Invoke the existing report builder/exporter for DOCX/PDF rather than returning a constructed filename.
- [ ] Verify the artifact exists, has nonzero size, and has a content hash before returning success.
- [ ] Return the real artifact path, format, hash, source snapshot ID, and included evidence IDs.
- [ ] Return failure when export is unavailable or artifact verification fails.
- [ ] Add tests with a temporary report output and an exporter failure case.
- [ ] Run the reporting test suite and commit.

## Task 5: Inject delegates and synchronize project context

**Files:** Modify `src/App.tsx`, `src/components/agent/AgentPanel.tsx`, `src/agent/agentOrchestrator.ts`, and persistence wiring.

- [ ] Construct the `ToolGateway` with application delegates using `useMemo`, keyed by active project/workspace and state setters.
- [ ] Construct one orchestrator instance for the active project instead of creating a disconnected default gateway inside the panel.
- [ ] Pass live project ID, workspace, nodes, edges, SysML revision, and artifact snapshot into each inspection call.
- [ ] Refresh the orchestrator’s project context after every successful action and after save/import operations.
- [ ] Invalidate pending approvals when project ID, workspace, model revision, or action parameters change.
- [ ] Display the real delegate readiness status in the agent panel: X-BRIDGES, SysML, reporting, and simulation separately.
- [ ] Add tests proving the agent panel does not enable approval for a missing delegate and reflects state changes after execution.
- [ ] Run agent and component tests and commit.

## Task 6: Complete sequential action execution

**Files:** Modify `src/agent/agentOrchestrator.ts`, `src/agent/planEngine.ts`, `src/agent/toolGateway.ts`; add tests.

- [ ] Ensure each change approval contains the exact action kind, action ID, project revision, parameters, and affected artifacts.
- [ ] Before execution, compare the approved action against the current project revision and reject stale actions.
- [ ] Execute the actual action adapter, persist its result, then create approval for the next action only after success.
- [ ] Validate X-BRIDGES topology after mutation, SysML integrity after command execution, and report artifact integrity after export.
- [ ] Stop and preserve evidence after the first failure; do not continue to later actions.
- [ ] Add a complete integration test: instantiate blocks → connect ports → configure parameters → save → run simulation → generate report.
- [ ] Run the full agent suite and commit.

## Task 7: End-to-end verification in the real application

**Files:** Modify `tests/e2e/agent-approval-flow.spec.ts`, `tests/e2e/agent-real-adapter-contract.spec.ts`; add a disposable fixture if needed.

- [ ] Start ADIA with a disposable air-fryer project and configured test delegates.
- [ ] Submit an air-fryer request and verify clarification questions are produced by Ollama or the explicit deterministic fallback.
- [ ] Approve the specification and plan; verify no model mutation occurred before the first change approval.
- [ ] Approve X-BRIDGES changes and assert actual nodes, edges, and parameters appear in the workspace.
- [ ] Verify rejection leaves the workspace unchanged.
- [ ] Verify unavailable SysML, reporting, or simulation delegates stop the workflow with a truthful message.
- [ ] Verify the final report exists and contains real model and validation evidence.
- [ ] Run `npx tsc --noEmit`, `npm run test:sysml`, focused agent tests, Playwright E2E tests, and `npm run build:offline`.
- [ ] Review `git diff --check`, confirm no unrelated V-Lab changes, and commit the completed integration.

## Completion Criteria

- An approved X-BRIDGES action changes the real ADIA workspace.
- An approved SysML action executes through the existing SysML command gateway.
- An approved report action creates and verifies a real report artifact.
- Missing delegates fail closed without false success.
- Project revisions and approval tokens prevent stale or repeated execution.
- The UI reflects the actual post-action ADIA state.
- End-to-end tests prove approval, mutation, persistence, validation, and reporting.

