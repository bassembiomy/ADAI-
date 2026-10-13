# Generic Dynamic Synthesizer & Comprehensive Domain Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide full natural language understanding across all X-Bridges domains by introducing a comprehensive semantic vocabulary and dynamic graph synthesizer that generates complete, connected block diagrams (e.g. multiplying constants, division, powers, logic, control) without relying on hardcoded keyword fallbacks.

**Architecture:** A domain vocabulary maps multi-domain keywords, synonyms, and operations to catalog blocks. The general graph planner parses operator semantics and sources, dynamically constructing DAG topologies (`Constant(10) & Constant(100) -> VectorMul -> Scope`) or leveraging the LLM with active catalog block definitions, validated through isolated simulation proof and transactional approval gates.

**Tech Stack:** TypeScript, React Flow / X-Bridges Block Catalog, Vitest.

---

## Task 1: Multi-Domain Semantic Vocabulary & Synonym Resolver

**Files:**
- Create: `src/services/ai/catalog/xbridgesDomainVocabulary.ts`
- Test: `src/services/ai/catalog/xbridgesDomainVocabulary.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface SemanticOperation {
    operator: 'multiply' | 'add' | 'subtract' | 'divide' | 'power' | 'gain' | 'integrate' | 'filter' | 'logic' | 'custom';
    blockType: string;
    inputPorts: string[];
    outputPort: string;
    defaultParams?: Record<string, unknown>;
  }

  export function resolveDomainOperation(text: string, catalog: XbridgesCapabilityIndex): SemanticOperation | null;
  export function resolveDomainKeywords(text: string): { domain: string; matchedKeywords: string[] };
  ```

- [ ] **Step 1: Write failing test for multi-domain vocabulary**
  Create `src/services/ai/catalog/xbridgesDomainVocabulary.test.ts` asserting that keywords across elementary math (`multiply`, `times`, `product`, `divide`, `power`, `abs`), signal sources, dynamic systems, logic, and control map to correct canonical blocks and port IDs.

- [ ] **Step 2: Run test to confirm failure**
  Run `npx vitest run src/services/ai/catalog/xbridgesDomainVocabulary.test.ts`.

- [ ] **Step 3: Implement `xbridgesDomainVocabulary.ts`**
  Implement comprehensive keyword tables across all 12 X-Bridges categories with operator resolution.

- [ ] **Step 4: Run test to confirm pass**
  Run `npx vitest run src/services/ai/catalog/xbridgesDomainVocabulary.test.ts`.

- [ ] **Step 5: Commit**
  `git add src/services/ai/catalog/xbridgesDomainVocabulary.* && git commit -m "feat(catalog): add multi-domain semantic vocabulary and operation resolver"`

---

## Task 2: Dynamic Semantic Operator & Math Expression Synthesizer

**Files:**
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Test: `src/services/ai/planner/generalGraphPlanner.test.ts`

**Interfaces:**
- Consumes: `resolveDomainOperation` from `xbridgesDomainVocabulary.ts`
- Produces: Synthesizes `blocks` and `connections` for binary math (`VectorMul`, `VectorAdd`, `VectorSub`, `VectorDiv`, `VectorPow`), unary math (`Abs`, `UnaryNeg`), and scaling (`Gain`).

- [ ] **Step 1: Write failing test for multiplication and arithmetic expressions**
  Add unit tests to `src/services/ai/planner/generalGraphPlanner.test.ts`:
  - `synthesizes multiplication of constant 10 by 100 on scope (Constant + Constant -> VectorMul -> Scope)`
  - `synthesizes division of constant 100 by 5 on scope (Constant + Constant -> VectorDiv -> Scope)`
  - `synthesizes power operation of constant 2 by 3 on scope (Constant + Constant -> VectorPow -> Scope)`

- [ ] **Step 2: Run test to confirm failure**
  Run `npx vitest run src/services/ai/planner/generalGraphPlanner.test.ts`.

- [ ] **Step 3: Implement dynamic math synthesis in `generalGraphPlanner.ts`**
  Integrate `resolveDomainOperation`, parse numeric operands from text, instantiate input sources, intermediate operator blocks, and observer sinks with non-overlapping canvas coordinates.

- [ ] **Step 4: Run test to confirm pass**
  Run `npx vitest run src/services/ai/planner/generalGraphPlanner.test.ts`.

- [ ] **Step 5: Commit**
  `git add src/services/ai/planner/generalGraphPlanner.ts src/services/ai/planner/generalGraphPlanner.test.ts && git commit -m "feat(planner): implement dynamic arithmetic and multi-operator graph synthesis"`

---

## Task 3: Zero-Shot LLM Catalog-Informed Graph Synthesis

**Files:**
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Test: `src/services/ai/planner/generalGraphPlanner.test.ts`

**Interfaces:**
- Consumes: `LlmProvider` and active `XbridgesCapabilityIndex`
- Produces: LLM-prompted dynamic DAG synthesis fallback when no canonical pattern or basic arithmetic matches, falling back to deterministic synthesis if offline.

- [ ] **Step 1: Write failing test for LLM-driven complex model synthesis**
  Add test in `generalGraphPlanner.test.ts` with a mock LLM providing a multi-block topology for an arbitrary engineering prompt.

- [ ] **Step 2: Run test to confirm failure**
  Run `npx vitest run src/services/ai/planner/generalGraphPlanner.test.ts`.

- [ ] **Step 3: Implement LLM catalog schema prompt and parsing in `generalGraphPlanner.ts`**
  Provide the LLM with block schemas (types, inputs, outputs, parameters), parse JSON graph output, and validate against catalog definitions.

- [ ] **Step 4: Run test to confirm pass**
  Run `npx vitest run src/services/ai/planner/generalGraphPlanner.test.ts`.

- [ ] **Step 5: Commit**
  `git add src/services/ai/planner/generalGraphPlanner.ts src/services/ai/planner/generalGraphPlanner.test.ts && git commit -m "feat(planner): add zero-shot LLM catalog-informed graph synthesis"`

---

## Task 4: End-to-End Orchestration Integration & User Prompt Verification

**Files:**
- Modify: `src/agent/agentOrchestrator.ts`
- Test: `src/agent/agentOrchestrator.test.ts`

**Interfaces:**
- Consumes: `AgentOrchestrator` lifecycle (`handle`, `approve`, simulation proof)
- Produces: Verified end-to-end execution of `"make a model multiply constant its value is 10 by 100 and display the result on a scope"`.

- [ ] **Step 1: Write failing test for user prompt in `agentOrchestrator.test.ts`**
  Add integration test:
  ```typescript
  it('handles "make a model multiply constant its value is 10 by 100 and display the result on a scope" end-to-end', async () => { ... });
  ```
  Asserts that 4 blocks are placed (`Constant(10)`, `Constant(100)`, `VectorMul`, `Scope`), 3 connections are wired, and simulation proof passes.

- [ ] **Step 2: Run test to confirm failure or pass**
  Run `npx vitest run src/agent/agentOrchestrator.test.ts`.

- [ ] **Step 3: Ensure orchestrator wires domain vocabulary and proof correctly**
  Verify plan generation and approval workflow.

- [ ] **Step 4: Run full regression test suite**
  Run all 7 vitest test suites across the repository.

- [ ] **Step 5: Commit**
  `git add src/agent/agentOrchestrator.ts src/agent/agentOrchestrator.test.ts && git commit -m "feat(agent): verify end-to-end dynamic multiplication model workflow"`
