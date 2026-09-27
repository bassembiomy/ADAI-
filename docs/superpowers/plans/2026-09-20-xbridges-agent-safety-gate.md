# X-Bridges Agent Safety Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make X-Bridges agent plans structurally valid, semantically honest, and fail closed before approval or execution.

**Architecture:** Keep synthesis in `generalGraphPlanner.ts`, add a focused pure validator for generated graphs, and make all planner paths pass through it before action generation. Preserve the existing isolated proof and approval workflow, while replacing silent generic fallback behavior with explicit diagnostics and forwarding verified pattern evidence into planning.

**Tech Stack:** TypeScript, Vitest, existing X-Bridges capability index, existing engineering entity/unit parser, existing isolated proof runner, canonical JSON/hash utilities.

## Global Constraints

- Never create executable actions from an invalid or unverified graph.
- The canonical `XbridgesCapabilityIndex` remains the source of truth for block types, ports, and parameters.
- LLM output is untrusted data and must be schema- and capability-validated.
- Preserve deterministic plan hashes for identical inputs.
- Keep user approval and isolated proof before mutation.
- Do not add a new runtime dependency.

---

### Task 1: Add the generated-graph validator

**Files:**
- Create: `src/services/ai/planner/generatedGraphValidator.ts`
- Create: `src/services/ai/planner/generatedGraphValidator.test.ts`
- Read: `src/services/ai/catalog/xbridgesCapabilityIndex.ts`
- Read: `src/services/ai/contracts/engineeringModel.ts`

**Interfaces:**
- Consumes: `InternalBlockSpec[]`, `InternalConnSpec[]`, `XbridgesCapabilityIndex`, validation options.
- Produces: `validateGeneratedGraph(...)` returning `{ valid: boolean; diagnostics: StructuredDiagnostic[] }`.

- [ ] **Step 1: Write failing validator tests** for duplicate IDs, unknown block types, unknown source/target ports, reversed direction, missing connection references, duplicate edges, invalid parameters, disconnected blocks, and valid arithmetic/control graphs.
- [ ] **Step 2: Run the focused test file** with `npx vitest run src/services/ai/planner/generatedGraphValidator.test.ts`; verify the new tests fail because the validator is absent.
- [ ] **Step 3: Implement the pure validator** using capability-index block definitions. Return stable diagnostic codes such as `DUPLICATE_BLOCK_ID`, `UNKNOWN_BLOCK_TYPE`, `UNKNOWN_SOURCE_PORT`, `UNKNOWN_TARGET_PORT`, `INVALID_PARAMETER`, `DANGLING_CONNECTION`, `DUPLICATE_CONNECTION`, `DISCONNECTED_BLOCK`, and `MISSING_OBSERVABLE_SINK`.
- [ ] **Step 4: Add graph-size limits** for maximum blocks and connections and reject non-finite parameter values.
- [ ] **Step 5: Run the focused validator tests** and confirm all pass.
- [ ] **Step 6: Commit** with `git add src/services/ai/planner/generatedGraphValidator.ts src/services/ai/planner/generatedGraphValidator.test.ts && git commit -m "feat(agent): add generated graph safety validator"`.

### Task 2: Route deterministic plans through validation

**Files:**
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.test.ts`

**Interfaces:**
- Consumes: `validateGeneratedGraph` from Task 1.
- Produces: deterministic plans that refuse before action creation when validation fails.

- [ ] **Step 1: Add failing tests** that mutate a catalog port definition and verify the planner returns `refused` with a structured diagnostic instead of a plan.
- [ ] **Step 2: Run** `npx vitest run src/services/ai/planner/generalGraphPlanner.test.ts`; confirm the new cases fail.
- [ ] **Step 3: Call the validator immediately after archetype resolution and before diff/action generation.** Map validator diagnostics into the existing `PlanningOutcome.diagnostics` shape.
- [ ] **Step 4: Ensure deterministic plans still produce identical `planHash` values for identical requests.
- [ ] **Step 5: Run planner tests** and confirm pass.
- [ ] **Step 6: Commit** with `git add src/services/ai/planner/generalGraphPlanner.ts src/services/ai/planner/generalGraphPlanner.test.ts && git commit -m "feat(planner): fail closed on invalid deterministic graphs"`.

### Task 3: Validate and constrain LLM synthesis

**Files:**
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.test.ts`

**Interfaces:**
- Consumes: Task 1 validator and the existing `LlmProvider`.
- Produces: validated LLM plans only; invalid output returns refusal diagnostics.

- [ ] **Step 1: Add failing tests** for unknown ports, duplicate IDs, dangling connections, invalid parameters, oversized output, and malformed LLM output.
- [ ] **Step 2: Run the planner tests** and confirm failures.
- [ ] **Step 3: Replace the `allValid` block-type-only check with schema normalization plus `validateGeneratedGraph`.
- [ ] **Step 4: Validate and bound each generated block, connection, parameter object, and position before building actions.
- [ ] **Step 5: Replace `.slice(0, 40)` with a deterministic complete or domain-filtered capability summary that includes parameter metadata needed for validation.
- [ ] **Step 6: Return `LLM_GRAPH_INVALID` diagnostics and never return a plan for invalid output.
- [ ] **Step 7: Run planner tests and commit** with `git add src/services/ai/planner/generalGraphPlanner.ts src/services/ai/planner/generalGraphPlanner.test.ts && git commit -m "feat(planner): validate zero-shot llm graphs"`.

### Task 4: Remove misleading generic fallback behavior

**Files:**
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.test.ts`
- Modify: `src/agent/agentOrchestrator.ts` only if diagnostic presentation requires it.

**Interfaces:**
- Consumes: planner diagnostics and existing clarification/blocking response flow.
- Produces: explicit refusal for unsupported or ambiguous requests.

- [ ] **Step 1: Add failing tests** asserting an unrecognized request does not generate `canonical_generic_model`, `Constant -> Scope`, or executable actions.
- [ ] **Step 2: Run planner tests and verify failure.
- [ ] **Step 3: Replace the generic fallback with `UNSUPPORTED_ENGINEERING_REQUEST` and a clarification diagnostic listing the missing target behavior or required input/output intent.
- [ ] **Step 4: Preserve explicit arithmetic and canonical archetype paths.
- [ ] **Step 5: Run focused planner/orchestrator tests and commit** with `git add src/services/ai/planner/generalGraphPlanner.ts src/services/ai/planner/generalGraphPlanner.test.ts src/agent/agentOrchestrator.ts && git commit -m "fix(agent): refuse unsupported generic xbridges requests"`.

### Task 5: Connect verified pattern evidence to planning

**Files:**
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/agent/collaborators/planningCollaborator.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.test.ts`

**Interfaces:**
- Consumes: `currentPatternEvidence` from retrieval.
- Produces: planner context containing ranked, verified `EngineeringPattern[]`.

- [ ] **Step 1: Add a failing test** proving a compatible verified pattern is present in the planner context and selected before LLM synthesis.
- [ ] **Step 2: Run the targeted tests and confirm failure.
- [ ] **Step 3: Pass `currentPatternEvidence` instead of `patterns: []` when building `PlanningContext`.
- [ ] **Step 4: Add deterministic pattern ranking by quality score, capability coverage, and pattern ID tie-breaker.
- [ ] **Step 5: Reject unverified or incompatible pattern templates before use.
- [ ] **Step 6: Run tests and commit** with `git add src/agent/agentOrchestrator.ts src/agent/collaborators/planningCollaborator.ts src/services/ai/planner/generalGraphPlanner.ts src/services/ai/planner/generalGraphPlanner.test.ts && git commit -m "feat(agent): use verified patterns in xbridges planning"`.

### Task 6: Improve numeric and unit-aware request handling

**Files:**
- Read/modify: `src/services/ai/planner/engineeringEntityParser.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.test.ts`

**Interfaces:**
- Consumes: parsed engineering entities with values and units.
- Produces: arithmetic graphs with explicit numeric values or refusal diagnostics for ambiguity/invalid dimensions.

- [ ] **Step 1: Add failing tests** for negative, fractional, scientific-notation, unit-bearing, missing-value, and ambiguous arithmetic requests.
- [ ] **Step 2: Run the parser/planner tests and confirm failures.
- [ ] **Step 3: Replace the arithmetic regex extraction with the existing entity parser plus a strict numeric-expression path for binary operations.
- [ ] **Step 4: Reject non-finite values, missing operands, incompatible units, and division by zero before graph creation.
- [ ] **Step 5: Preserve exact numeric values in canonical plan JSON and verify deterministic hashes.
- [ ] **Step 6: Run the focused tests and commit** with `git add src/services/ai/planner/engineeringEntityParser.ts src/services/ai/planner/generalGraphPlanner.ts src/services/ai/planner/generalGraphPlanner.test.ts && git commit -m "feat(planner): parse arithmetic values and units safely"`.

### Task 7: Add semantic simulation assertions

**Files:**
- Modify: `src/services/ai/benchmarks/generalXbridgesCorpus.test.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.test.ts`
- Read/modify only if needed: `src/services/ai/proof/xbridgesProofRunner.ts`

**Interfaces:**
- Consumes: validated plans and existing isolated proof/simulation APIs.
- Produces: test evidence that observable outputs match requested behavior.

- [ ] **Step 1: Add failing tests** for multiplication, division, addition, negative values, and division-by-zero refusal.
- [ ] **Step 2: Run the targeted benchmark tests and confirm failures.
- [ ] **Step 3: Execute validated arithmetic plans through the existing proof/simulation path and assert the Scope observable equals the expected result within the existing tolerance.
- [ ] **Step 4: Assert genuine engine run IDs and reject unavailable observables rather than substituting synthetic metrics.
- [ ] **Step 5: Run benchmark tests and commit** with `git add src/services/ai/benchmarks/generalXbridgesCorpus.test.ts src/services/ai/planner/generalGraphPlanner.test.ts src/services/ai/proof/xbridgesProofRunner.ts && git commit -m "test(agent): verify semantic xbridges outputs"`.

### Task 8: Full regression and release evidence

**Files:**
- Modify: `docs/AI_AGENT_CODE_REVIEW.md`
- Modify: `task.md`
- Test: `src/agent/agentOrchestrator.test.ts`
- Test: `src/services/ai/benchmarks/generalXbridgesCorpus.test.ts`

**Interfaces:**
- Consumes: all completed safety-gate behavior.
- Produces: reproducible verification evidence and updated task status.

- [ ] **Step 1: Add end-to-end adversarial lifecycle tests** proving invalid LLM graphs are blocked before action approval and workspace nodes/edges remain unchanged.
- [ ] **Step 2: Run focused suites:** `npx vitest run src/services/ai/planner src/agent/agentOrchestrator.test.ts src/services/ai/benchmarks/generalXbridgesCorpus.test.ts --reporter=verbose`.
- [ ] **Step 3: Run typecheck:** `npx tsc --noEmit`; expected exit code `0`.
- [ ] **Step 4: Run production build:** `npm run build`; expected successful TypeScript, Vite, and Electron build.
- [ ] **Step 5: Run the relevant X-Bridges E2E tests:** `npx playwright test tests/e2e/agent-general-xbridges.spec.ts tests/e2e/agent-real-adapter-contract.spec.ts tests/e2e/agent-approval-flow.spec.ts`.
- [ ] **Step 6: Update the release review with exact command output and remove any claim not supported by executed evidence.
- [ ] **Step 7: Commit** with `git add docs/AI_AGENT_CODE_REVIEW.md task.md src/agent/agentOrchestrator.test.ts src/services/ai/benchmarks/generalXbridgesCorpus.test.ts && git commit -m "docs(agent): publish xbridges safety gate verification"`.

## Self-review checklist

- All reviewed gaps have a task: validator, fallback, LLM validation, patterns, parsing, semantic simulation, adversarial regression, and evidence.
- The plan introduces one focused new module rather than expanding the planner further.
- Every task has exact files, tests, commands, and commit boundaries.
- No task permits mutation before validation, proof, and approval.
