# Deterministic Generic Agent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each current-turn request to exactly one eligible planner using explicit intent and preconditions, with safe clarification when routing is incomplete.

**Architecture:** Add a pure routing/normalization layer before domain planning. Planner candidates expose deterministic preconditions and return structured diagnostics; the existing planners remain responsible for plan generation only after routing succeeds. Current-turn request construction becomes isolated from prior conversational intent.

**Tech Stack:** TypeScript, Zod contracts, Vitest, existing AI planner/catalog/knowledge services.

## Global Constraints

- Routing must be generic and reusable across domains; no one-off PatternStore exception.
- A planner may run only when its intent is explicitly selected and required inputs are valid.
- Loose substring matching must not select a planner.
- Previous-turn operands, operations, or target behaviors must not be silently reused.
- External artifacts remain non-executable and only verified patterns reach execution planning.

---

### Task 1: Define the routing contract and failing tests

**Files:**
- Create: `src/services/ai/planner/deterministicRouter.ts`
- Create: `src/services/ai/planner/deterministicRouter.test.ts`
- Modify: `src/services/ai/planner/generalIntent.ts` only if the existing request type lacks fields needed by the contract

**Interfaces:**
- Produce `PlannerIntent = 'arithmetic' | 'pattern_workflow' | 'model_construction' | 'validation' | 'simulation' | 'unknown'`.
- Produce `RoutingDiagnostic` with `code`, `message`, `remediation`, and optional `failedPreconditions`.
- Produce `RoutingResult = { status: 'routed'; intent: PlannerIntent; normalizedRequest: ... } | { status: 'clarification'; diagnostics: RoutingDiagnostic[] }`.
- Export `routeDeterministically(request, context): RoutingResult` as a pure function.

- [ ] **Step 1: Write failing tests** for architecture prose selecting `pattern_workflow` or `unknown` rather than arithmetic; explicit `add 5 and 7` selecting arithmetic; missing arithmetic operands returning clarification; and a request containing prior-turn fields in context not inheriting them.
- [ ] **Step 2: Run the focused test** with `npx vitest run src/services/ai/planner/deterministicRouter.test.ts`; verify the new tests fail because the router contract is not implemented.
- [ ] **Step 3: Define the minimal TypeScript/Zod-compatible routing types** and test fixtures without changing planner behavior.
- [ ] **Step 4: Run the focused test** and confirm the contract tests compile and fail only on the intended routing assertions.
- [ ] **Step 5: Commit** with `git add src/services/ai/planner/deterministicRouter.ts src/services/ai/planner/deterministicRouter.test.ts src/services/ai/planner/generalIntent.ts && git commit -m "test: define deterministic planner routing contract"`.

### Task 2: Implement bounded normalization and intent candidate detection

**Files:**
- Modify: `src/services/ai/planner/deterministicRouter.ts`
- Modify: `src/services/ai/planner/deterministicRouter.test.ts`
- Inspect/reference: `src/services/ai/planner/engineeringEntityParser.ts`, `src/services/ai/catalog/xbridgesDomainVocabulary.ts`

**Interfaces:**
- Implement `normalizeCurrentTurn(request)` so objective, explicit intent, entities, operands, source metadata, and target behaviors are copied only from the supplied request.
- Implement internal candidate detectors using token/phrase boundaries and contextual patterns, not `String.includes` for operation selection.

- [ ] **Step 1: Add failing tests** for `metadata`, `candidate`, `catalog`, and other architecture prose containing no arithmetic intent; test explicit phrases such as `add 5 and 7`, `sum 5 plus 7`, and `multiply 10 by 100`.
- [ ] **Step 2: Run the focused tests** and confirm broad substring behavior is rejected.
- [ ] **Step 3: Implement normalization and bounded candidate detection**, including explicit arithmetic context, pattern/source/artifact vocabulary, model-construction vocabulary, and validation/simulation vocabulary.
- [ ] **Step 4: Run `npx vitest run src/services/ai/planner/deterministicRouter.test.ts`** and confirm all detector tests pass.
- [ ] **Step 5: Commit** with `git add src/services/ai/planner/deterministicRouter.ts src/services/ai/planner/deterministicRouter.test.ts && git commit -m "feat: add bounded generic intent detection"`.

### Task 3: Add deterministic preconditions and clarification diagnostics

**Files:**
- Modify: `src/services/ai/planner/deterministicRouter.ts`
- Modify: `src/services/ai/planner/deterministicRouter.test.ts`
- Reference: `src/services/ai/contracts/engineeringModel.ts` for existing diagnostic conventions

**Interfaces:**
- Implement candidate preconditions that return `{ eligible: boolean; failedPreconditions: string[] }`.
- Ensure arithmetic binary operations require two finite parsed operands.
- Ensure missing or conflicting intent produces `status: 'clarification'`, not a domain planner refusal.

- [ ] **Step 1: Add failing tests** for missing operands, conflicting explicit intents, missing pattern source metadata, and ambiguous requests.
- [ ] **Step 2: Run focused tests** and verify diagnostics are absent or incorrect before implementation.
- [ ] **Step 3: Implement the precondition table and stable precedence order**, returning machine-readable codes and user-facing remediation.
- [ ] **Step 4: Run focused tests** and confirm every invalid case returns deterministic diagnostics.
- [ ] **Step 5: Commit** with `git add src/services/ai/planner/deterministicRouter.ts src/services/ai/planner/deterministicRouter.test.ts && git commit -m "feat: enforce planner preconditions and clarifications"`.

### Task 4: Integrate routing before general graph planning

**Files:**
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.test.ts`
- Modify: the current planner entrypoint discovered by tests/callers if routing occurs upstream

**Interfaces:**
- General graph planning receives only requests routed to `arithmetic` or `model_construction`.
- Routing clarification diagnostics are returned unchanged to the caller.

- [ ] **Step 1: Add regression tests** reproducing the two reported conversations: the architecture PatternStore request after the earlier add-numbers request, and the explicit add request without operands.
- [ ] **Step 2: Run the regression tests** and verify the current implementation misroutes or produces the old generic refusal.
- [ ] **Step 3: Insert `routeDeterministically` at the planner boundary**, reject ineligible arithmetic dispatch, and preserve existing verified-pattern safety checks.
- [ ] **Step 4: Run `npx vitest run src/services/ai/planner/generalGraphPlanner.test.ts src/services/ai/planner/deterministicRouter.test.ts`** and confirm both regressions pass.
- [ ] **Step 5: Commit** with `git add src/services/ai/planner/generalGraphPlanner.ts src/services/ai/planner/generalGraphPlanner.test.ts src/services/ai/planner/deterministicRouter.ts src/services/ai/planner/deterministicRouter.test.ts && git commit -m "fix: route requests before domain planning"`.

### Task 5: Verify cross-system compatibility and complete handoff

**Files:**
- Modify: only files required by failing compatibility tests
- Test: existing planner, ingestion, retrieval, promotion, and integration suites

- [ ] **Step 1: Run focused planner and ingestion suites** with `npx vitest run src/services/ai/planner src/services/ai/knowledge`.
- [ ] **Step 2: Run the full project test command from `package.json`** and capture any failures.
- [ ] **Step 3: If failures occur, fix only routing-contract compatibility issues and add a regression test for each confirmed defect.**
- [ ] **Step 4: Run `git diff --check` and the complete verification command again.**
- [ ] **Step 5: Commit the final compatibility fixes** with a focused message describing the verified behavior.

## Plan self-review

- Spec coverage: generic routing, explicit preconditions, bounded arithmetic detection, conversation isolation, diagnostics, safety boundaries, and tests are covered by Tasks 1–5.
- Placeholder scan: no TBD/TODO or unspecified implementation step is required.
- Type consistency: `routeDeterministically`, `RoutingResult`, `RoutingDiagnostic`, and `PlannerIntent` are introduced in Task 1 and consumed consistently in Tasks 3–4.

