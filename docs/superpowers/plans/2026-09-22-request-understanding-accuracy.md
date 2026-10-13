# Generic Request Understanding Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ADIA reliably convert natural-language engineering requests into validated, deterministic model plans without requiring model fine-tuning as the first step.

**Architecture:** Add a typed request-understanding layer before engineering planning. The layer normalizes language, extracts operations/entities/values/relationships, resolves follow-up answers against conversation requirements, and emits a discriminated `StructuredEngineeringRequest`. Deterministic templates and the verified X-Bridges catalog consume that object; the LLM is used only for ambiguous semantic interpretation and never for block or port invention.

**Tech Stack:** TypeScript, Zod, Vitest, existing `AgentOrchestrator`, engineering-intelligence pipeline, conversation memory, X-Bridges capability catalog, canonical hashing.

## Global Constraints

- Do not fine-tune or train model weights until the evaluation corpus and deterministic extraction layer are measured.
- Never allow the LLM to invent block IDs, ports, parameters, units, or validation results.
- Preserve legacy compatibility routing for unsupported domains during migration.
- Missing REQUIRED values must produce one actionable clarification question.
- Identical normalized requests and catalog snapshots must produce identical intent and plan fingerprints.
- Every generated plan must pass catalog, port, topology, preflight, proof, and approval gates.
- Renderer-reachable code must not access Node globals or modules (`process`, `fs`, `path`, `Buffer`) unless guarded behind an Electron main-process boundary.
- Sequential execution actions must observe their own node/edge writes immediately, even when React state commits asynchronously.
- A clarification answer must update the active request; it must never be interpreted as a new unrelated request.
- A requested transfer function must compile to `TRANSFER_FUNCTION` or `DISCRETE_TRANSFER_FUNCTION`; substituting an integrator is permitted only when the normalized transfer function is exactly `1/s` and the substitution is disclosed.
- Deterministic requests must remain usable when the local LLM is unavailable or times out.

## Locked Interfaces

```ts
type RequestUnderstandingStatus =
  | 'ready'
  | 'clarification_required'
  | 'unsupported'
  | 'invalid';

interface ExtractedValue {
  id: string;
  kind: 'number' | 'unit_value' | 'enum' | 'text' | 'reference';
  sourceText: string;
  normalizedValue: unknown;
  unit?: string;
  confidence: number;
}

interface RequestEntity {
  id: string;
  semanticType: string;
  sourceText: string;
  catalogBlockId?: string;
  confidence: number;
}

interface RequestRelationship {
  id: string;
  type: 'feeds' | 'controls' | 'observes' | 'feedback' | 'references';
  sourceEntityId: string;
  targetEntityId: string;
  sourceText: string;
}

interface UnresolvedRequirement {
  id: string;
  slotName: string;
  classification: 'REQUIRED' | 'OPTIONAL' | 'INFERABLE' | 'DEFAULTABLE';
  valueSchema: string;
  prompt: string;
  reason: string;
  affectedDecisionIds: string[];
  status: 'unresolved' | 'resolved';
  resolvedValue?: unknown;
}

interface StructuredEngineeringRequest {
  schemaVersion: '1.0.0';
  requestId: string;
  originalText: string;
  normalizedText: string;
  intent: 'create' | 'modify' | 'inspect' | 'validate' | 'simulate' | 'optimize';
  operations: string[];
  entities: RequestEntity[];
  values: ExtractedValue[];
  relationships: RequestRelationship[];
  requestedOutputs: string[];
  constraints: string[];
  unresolvedRequirements: UnresolvedRequirement[];
  confidence: number;
  evidence: Array<{ source: 'user' | 'catalog' | 'memory'; description: string }>;
}

interface ActiveRequestSession {
  sessionId: string;
  projectId: string;
  request: StructuredEngineeringRequest;
  architecturePlanId?: string;
  activeSlotId?: string;
  answeredSlotIds: string[];
  state: 'understanding' | 'clarifying' | 'planning' | 'awaiting_approval' | 'completed' | 'cancelled';
  revision: number;
}
```

These names and discriminants are authoritative for every task below. Changes require updating all consumers and contract tests in the same task.

---

### Task 1: Define the structured request contract

**Files:**
- Create: `src/services/ai/engineering/contracts/structuredEngineeringRequest.ts`
- Test: `src/services/ai/engineering/contracts/structuredEngineeringRequest.test.ts`

- [ ] Define Zod schemas for `operation`, `entities`, `numericValues`, `units`, `relationships`, `outputs`, `constraints`, `unresolvedRequirements`, `confidence`, and `evidence`.
- [ ] Use discriminated outcomes: `ready`, `clarification_required`, `unsupported`, and `invalid`.
- [ ] Require each extracted value to include source text and normalized value.
- [ ] Add tests for addition, multiplication, PID/transfer-function, Scope output, malformed values, and missing operands.
- [ ] Run `npx vitest run src/services/ai/engineering/contracts/structuredEngineeringRequest.test.ts`.
- [ ] Commit `feat(ai): define structured engineering request contract`.

### Task 2: Implement deterministic normalization and typo handling

**Files:**
- Create: `src/services/ai/engineering/intent/requestNormalizer.ts`
- Test: `src/services/ai/engineering/intent/requestNormalizer.test.ts`

- [ ] Normalize case, whitespace, punctuation, common spelling errors, number words, and unit spellings.
- [ ] Add bounded synonym dictionaries for operations, components, and observability terms.
- [ ] Preserve original text for evidence; never silently change user intent.
- [ ] Test `creat`, `multiblying`, `cnstant`, `scope`, `show`, `display`, and equivalent phrasing.
- [ ] Ensure normalization is idempotent: `normalize(normalize(x)) === normalize(x)`.
- [ ] Keep corrections bounded to an explicit dictionary; unknown words remain unchanged.
- [ ] Run `npx vitest run src/services/ai/engineering/intent/requestNormalizer.test.ts`.
- [ ] Commit `feat(ai): normalize engineering requests deterministically`.

### Task 3: Extract values, operations, components, and outputs

**Files:**
- Create: `src/services/ai/engineering/intent/structuredRequestExtractor.ts`
- Modify: `src/services/ai/engineering/intent/engineeringIntentInterpreter.ts`
- Test: `src/services/ai/engineering/intent/structuredRequestExtractor.test.ts`

- [ ] Extract arithmetic operators and all numeric operands without defaulting missing operands to zero.
- [ ] Extract engineering components such as Constant, Sum, VectorMul, PID_CONTROLLER, TRANSFER_FUNCTION, and Scope through aliases.
- [ ] Extract relationship phrases including `for it`, `connected to`, `feed into`, and `display the result on`.
- [ ] Emit unresolved requirement slots for missing operands, parameters, and output routing.
- [ ] Add metamorphic tests proving paraphrases produce equivalent structured requests.
- [ ] Parse signed values, decimals, scientific notation, arrays, ratios, transfer-function coefficients, and SI units.
- [ ] Distinguish ordinal/count language from operand values (`two numbers` is a count, not operands `[2]`).
- [ ] Run `npx vitest run src/services/ai/engineering/intent/structuredRequestExtractor.test.ts`.
- [ ] Commit `feat(ai): extract structured engineering requests`.

### Task 4: Ground extracted entities against the verified catalog

**Files:**
- Create: `src/services/ai/engineering/intent/catalogEntityResolver.ts`
- Modify: `src/services/ai/engineering/mapping/compositionResolver.ts`
- Test: `src/services/ai/engineering/intent/catalogEntityResolver.test.ts`

- [ ] Resolve aliases only through `buildXbridgesCapabilityIndex()` and verified composition mappings.
- [ ] Validate required ports and parameters during resolution.
- [ ] Return a capability gap for unknown blocks instead of inventing a mapping.
- [ ] Add catalog-backed mappings for transfer functions, PID controllers, arithmetic blocks, constants, and Scope.
- [ ] Return the exact canonical block ID plus verified input/output port IDs and parameter names.
- [ ] Reject aliases that resolve to multiple catalog entries.
- [ ] Run `npx vitest run src/services/ai/engineering/intent/catalogEntityResolver.test.ts`.
- [ ] Commit `feat(ai): ground request entities in verified catalog`.

### Task 5: Make follow-up answers resolve conversation slots

**Files:**
- Modify: `src/services/ai/engineering/memory/conversationMemory.ts`
- Modify: `src/services/ai/engineering/intent/referenceResolver.ts`
- Create: `src/services/ai/engineering/intent/requirementAnswerResolver.ts`
- Test: `src/services/ai/engineering/intent/requirementAnswerResolver.test.ts`

- [ ] Store unresolved slots with type, prompt, affected decisions, and original evidence.
- [ ] Parse answers such as `10 and 20`, `display output on Scope`, `use FOC`, and `the same value` against the active slot.
- [ ] Prevent already-resolved questions from being asked again.
- [ ] Reject answers that do not satisfy the active slot schema and ask a targeted replacement question.
- [ ] Permit exactly one active request per session; a new create request explicitly supersedes or restarts the old request.
- [ ] Use stable slot IDs derived from request ID, slot name, and affected decision IDs.
- [ ] Apply answers atomically: either the slot resolves and session revision increments, or no state changes.
- [ ] Resume from the same architecture plan and request ID after clarification.
- [ ] Support explicit `cancel`, `restart`, and `start new request` commands.
- [ ] Add stateful tests proving `10 and 20` resolves operands, `Display output on Scope` resolves observability, and resolved questions are never repeated.
- [ ] Run `npx vitest run src/services/ai/engineering/intent/requirementAnswerResolver.test.ts`.
- [ ] Commit `feat(ai): resolve clarification answers against active request slots`.

### Task 6: Add confidence and clarification policy

**Files:**
- Create: `src/services/ai/engineering/intent/requestConfidencePolicy.ts`
- Modify: `src/services/ai/engineering/orchestration/engineeringIntelligencePipeline.ts`
- Test: `src/services/ai/engineering/intent/requestConfidencePolicy.test.ts`

- [ ] Define thresholds for ready, clarification-required, unsupported, and invalid outcomes.
- [ ] Treat missing REQUIRED values as blocking.
- [ ] Keep OPTIONAL, INFERABLE, and DEFAULTABLE values explicit in assumptions.
- [ ] Ensure each clarification response contains one question, the reason, and a recommended value only when evidence supports it.
- [ ] Use deterministic confidence components: lexical match, value-schema validity, reference resolution, and catalog resolution.
- [ ] Do not use a confidence score to bypass a missing REQUIRED slot.
- [ ] Add boundary tests at every threshold.
- [ ] Commit `feat(ai): add request confidence and clarification policy`.

### Task 7: Add deterministic engineering templates

**Files:**
- Create: `src/services/ai/engineering/planning/deterministicEngineeringTemplates.ts`
- Modify: `src/services/ai/engineering/planning/engineeringPlanner.ts`
- Test: `src/services/ai/engineering/planning/deterministicEngineeringTemplates.test.ts`

- [ ] Implement templates for:
  - two operands → arithmetic block → optional Scope;
  - setpoint → error calculation → PID → plant → Scope;
  - transfer function with PID feedback;
  - source → integrator/plant → Scope.
- [ ] Select templates from the structured request, not raw text alone.
- [ ] Resolve every template port through the catalog before producing an architecture plan.
- [ ] Add deterministic snapshot tests for block IDs, ports, parameters, connections, and plan hashes.
- [ ] Implement the PID/transfer-function feedback topology exactly as:

```text
Setpoint -> Sum(in1) -> PID -> TRANSFER_FUNCTION -> Scope(in1)
              ^                    |
              +---- feedback ------+
```

- [ ] Resolve `Sum`, PID, plant, and Scope ports from the active catalog; do not hard-code stale port IDs.
- [ ] Require numerator and denominator for transfer functions unless a verified default or existing model supplies them.
- [ ] Require sample time for discrete transfer functions and discrete PID.
- [ ] Allow PID gains to be user-provided, catalog-defaulted, or explicitly marked as tuning assumptions.
- [ ] Never substitute `INTEGRATOR_CONTINUOUS` for a general transfer function.
- [ ] Commit `feat(ai): add deterministic engineering architecture templates`.

### Task 8: Integrate structured understanding before legacy planning

**Files:**
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/services/ai/engineering/orchestration/engineeringIntelligencePipeline.ts`
- Test: `src/agent/agentOrchestrator.test.ts`

- [ ] Route supported structured requests into the engineering pipeline.
- [ ] Keep legacy compatibility fallback for unsupported or incomplete capabilities.
- [ ] Preserve the existing approval, proof, transaction, rollback, and simulation boundaries.
- [ ] Add end-to-end tests for `Add 10 and 20`, missing operands, multiplication, transfer function + PID, and Scope output.
- [ ] Lock the selected route for the lifetime of an active request; do not fall back after architecture decisions have been accepted.
- [ ] Route fallback only before a new pipeline architecture plan exists.
- [ ] Preserve request/session state across `createFreshSession()` only when explicitly requested by the caller.
- [ ] Commit `feat(ai): integrate structured request understanding`.

### Task 9: Enforce browser/Electron runtime boundaries

**Files:**
- Create or complete: `src/services/ai/engineering/knowledge/inMemoryKnowledgeStores.ts`
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Test: `src/agent/agentOrchestrator.test.ts`
- Test: production Vite build

- [ ] Use browser-safe in-memory/read-only repositories from renderer-reachable code.
- [ ] Keep file-backed content-addressed stores behind the Electron main-process or another Node-only boundary.
- [ ] Prohibit renderer execution of `process.cwd()`, `fs`, `path`, and unguarded `Buffer` usage.
- [ ] Add a test that executes a supported request with `globalThis.process = undefined` and restores the global afterward.
- [ ] Verify bundled seed concepts are Zod-validated before use.
- [ ] Run `npx vitest run src/agent/agentOrchestrator.test.ts -t "browser-safe"`.
- [ ] Run `npm run build` and require no Node-global runtime failure.
- [ ] Commit `fix(ai): enforce browser-safe engineering knowledge access`.

### Task 10: Guarantee transaction-local topology consistency

**Files:**
- Modify: `src/agent/toolAdapters/xbridgesAdapter.ts`
- Test: `src/agent/toolAdapters/xbridgesAdapter.test.ts`
- Test: `src/agent/agentOrchestrator.test.ts`

- [ ] Maintain a transaction-local mirror of nodes and edges so sequential actions observe their own writes before React commits.
- [ ] Merge genuine external additions into the mirror so stale-state and undo checks remain effective.
- [ ] Validate every edge against the mirror immediately after connection.
- [ ] Add a React-like deferred-commit test: create PID and plant, connect them before external state updates, and assert zero dangling edges.
- [ ] Add a concurrent user-edit test proving undo is rejected after an external topology change.
- [ ] Run `npx vitest run src/agent/toolAdapters/xbridgesAdapter.test.ts src/agent/agentOrchestrator.test.ts`.
- [ ] Commit `fix(agent): preserve topology consistency across deferred React commits`.

### Task 11: Improve explainability without exposing hidden reasoning

**Files:**
- Modify: `src/services/ai/engineering/orchestration/engineeringIntelligencePipeline.ts`
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/components/agent/AgentPanel.tsx`
- Test: `src/components/agent/AgentPanel.test.tsx`
- Test: `src/services/ai/engineering/orchestration/engineeringIntelligencePipeline.test.ts`

- [ ] Return concise interpretation, extracted values, assumptions, unresolved requirements, catalog mappings, and citations.
- [ ] Do not expose private chain-of-thought.
- [ ] Make every clarification and capability gap actionable.
- [ ] Include the selected deterministic template and validated catalog IDs in approval summaries.
- [ ] Commit `feat(ai): expose request interpretation evidence`.

### Task 12: Build the evaluation corpus and regression harness

**Files:**
- Create: `src/services/ai/engineering/evaluation/requestUnderstandingCorpus.ts`
- Create: `src/services/ai/engineering/evaluation/requestUnderstandingEvaluation.test.ts`
- Create: `docs/superpowers/evaluations/request-understanding-baseline.md`

- [ ] Add at least 200 reviewed examples across arithmetic, transfer functions, PID, Scope, units, references, typos, ambiguity, and unsupported capabilities.
- [ ] Include positive, negative, and adversarial examples.
- [ ] Measure intent accuracy, slot extraction accuracy, block mapping accuracy, topology accuracy, clarification quality, and invented-capability rate.
- [ ] Add paraphrase and irrelevant-wording metamorphic tests.
- [ ] Record baseline metrics before changing prompts or models.
- [ ] Split examples into 70% development, 15% validation, and 15% untouched holdout sets by semantic family to prevent paraphrase leakage.
- [ ] Enforce these release thresholds:
  - intent classification accuracy >= 95%;
  - REQUIRED-slot extraction recall >= 98%;
  - catalog block/port validity = 100%;
  - invented capabilities = 0;
  - repeated resolved questions = 0;
  - invalid plans reaching approval = 0;
  - equivalent-paraphrase topology agreement >= 95%;
  - browser-safe supported-request completion = 100%.
- [ ] Commit `test(ai): add request understanding evaluation corpus`.

### Task 13: Add observability for failed understanding

**Files:**
- Modify: agent audit/event contracts and engineering pipeline
- Test: audit event tests

- [ ] Log normalized request hash, extractor outcome, unresolved slot IDs, catalog resolution outcome, and final plan hash.
- [ ] Redact sensitive user content while retaining enough evidence for debugging.
- [ ] Record whether the result came from deterministic extraction, LLM interpretation, or compatibility fallback.
- [ ] Log stage durations and timeout/fallback reasons without recording hidden reasoning.
- [ ] Commit `feat(ai): audit request understanding decisions`.

### Task 14: Define timeout and degraded-mode behavior

**Files:**
- Modify: `src/services/ai/engineering/orchestration/engineeringIntelligencePipeline.ts`
- Modify: `src/services/ai/providers/structuredGenerationCoordinator.ts`
- Test: `src/services/ai/providers/structuredGenerationCoordinator.test.ts`
- Test: `src/services/ai/engineering/orchestration/engineeringIntelligencePipeline.test.ts`

- [ ] Apply a bounded timeout to optional LLM interpretation.
- [ ] Continue deterministically when the request is fully resolvable without an LLM.
- [ ] Return a retryable diagnostic when ambiguous interpretation genuinely requires an unavailable LLM.
- [ ] Fail closed on invalid structured LLM output, catalog unavailability, corrupt knowledge, or stale catalog fingerprints.
- [ ] Never downgrade a validation failure into an unverified legacy plan.
- [ ] Add tests for timeout, malformed JSON, provider offline, catalog unavailable, and knowledge-store failure.
- [ ] Commit `fix(ai): add deterministic degraded-mode request handling`.

### Task 15: Add persistence migration and rollout controls

**Files:**
- Modify: `src/agent/agentPersistence.ts`
- Modify: `src/agent/agentOrchestrator.ts`
- Test: `src/agent/agentPersistence.test.ts`
- Test: `src/agent/agentOrchestrator.test.ts`

- [ ] Increment the persisted request/session schema version.
- [ ] Migrate old sessions deterministically or open incompatible state read-only with an actionable diagnostic.
- [ ] Preserve partially completed approvals and never reinterpret them under the new planner.
- [ ] Add feature flags for shadow, selected-project, and general rollout stages.
- [ ] Ensure rollback disables new routing without deleting stored knowledge or session evidence.
- [ ] Commit `feat(ai): migrate and gate structured request sessions`.

### Task 16: Evaluate prompt improvements and optional fine-tuning

**Files:**
- Create: `docs/superpowers/evaluations/request-understanding-model-decision.md`
- Modify only if metrics justify it: provider prompts/model configuration

- [ ] Run the corpus against the current model and prompts.
- [ ] Improve structured prompts and few-shot examples first.
- [ ] Consider fine-tuning only if extraction accuracy remains below the agreed threshold after deterministic grounding and prompt improvements.
- [ ] Require a holdout set and regression gate before deploying any fine-tuned model.
- [ ] Fine-tuning is permitted only if deterministic + prompt-based performance misses a release threshold by at least two percentage points on the untouched holdout set.
- [ ] A fine-tuned model must improve the missed metric without reducing any safety metric or catalog validity.
- [ ] Commit the model decision report; do not commit model weights to the application repository.

## Release Gates

```powershell
npx vitest run src/services/ai/engineering
npx vitest run src/agent src/services/ai src/components/agent
npx vitest run src/engine/xbridges src/services/xbridgesWorkerClient.test.ts
npm run scan:sast
npx tsc --noEmit --pretty false
npm run build
```

## Definition of Done

- `Create a model adding 10 and 20` produces a deterministic Sum plan.
- `Create a model adding two numbers` asks once for both operands.
- `10 and 20` resolves the active operand requirement and continues planning.
- `Create a transfer function and a PID controller for it` creates a catalog-valid feedback architecture or asks only for genuinely required parameters.
- Scope output resolves to the verified Scope block and `in1` port.
- Unknown blocks, ports, units, and facts fail closed.
- Existing legacy workflows remain green.
- Evaluation metrics and regression results are recorded before considering fine-tuning.
- Renderer execution succeeds with no Node `process`, `fs`, or `path` globals.
- PID/transfer-function execution completes without dangling edges under deferred React commits.
- The full lifecycle passes: understand → clarify → compile → preflight → proof → approve → execute → topology validation → persistence → simulation/read-back.
- Provider timeout and offline tests prove deterministic requests still complete.
- Existing sessions migrate or fail read-only without data loss.

## Task Execution Protocol

For every task:

1. Write one minimal failing test for the required behavior.
2. Run the exact focused command and confirm the expected failure reason.
3. Implement only enough production code to make the test pass.
4. Run the focused test again.
5. Run affected neighboring suites.
6. Commit only the files belonging to that task using the listed commit message.

Do not combine tasks unless their tests prove they are inseparable.

## Final Acceptance Scenarios

1. `Create a model adding two numbers` → one operand-pair question.
2. `10 and 20` → same request resumes; Sum plan is generated without repeating the question.
3. `Multiply 10 by 100 and display it on a scope` → two Constants, VectorMul, Scope, and three valid connections.
4. `Create a transfer function and a PID controller for it` → asks only for missing plant/controller values, then builds a feedback loop using `TRANSFER_FUNCTION`.
5. `Display output on Scope` → resolves the active observability slot, not a new request.
6. Local model timeout during scenario 1 or 3 → deterministic path completes.
7. Renderer with `globalThis.process === undefined` → supported request completes without runtime errors.
8. Deferred React state commits → PID-to-plant connection creates no dangling edge.
9. Invented block or port → capability gap before approval and zero mutations.
10. Concurrent external model edit before undo → stale undo is refused and user changes remain intact.
