# ADIA Engineering Intelligence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade ADIA from direct request-to-block planning into a general, provenance-aware engineering modeling copilot that reasons through concepts, requirements, architecture, Model IR, deterministic compilation, and validation.

**Architecture:** Insert a typed Engineering Intelligence pipeline between `RequestCollaborator` and the existing X-Bridges planner/execution stack: semantic intent → hybrid knowledge retrieval → concept graph expansion → architecture planning → clarification → Model IR → deterministic capability mapping/compiler → existing preflight, proof, transaction, and validation gates. The LLM may propose typed semantic objects and plans, but only deterministic services may resolve ADIA capabilities or mutate a model.

**Tech Stack:** TypeScript 5, Zod, Vitest, Electron/React, existing Qwen/Ollama provider abstraction, existing content-addressed file stores and SHA-256 utilities. Initial retrieval uses deterministic BM25-style lexical scoring, metadata filters, graph traversal, and optional provider embeddings with brute-force cosine search; no native database or vector dependency is required for the first release.

## Global Constraints

- Build a general engineering intelligence layer; do not encode a BLDC-specific planner.
- The LLM is a reasoning/orchestration engine, never the engineering database or mutation executor.
- The LLM cannot invent blocks, ports, parameters, physical facts, citations, or validation success.
- Every engineering fact and relationship carries provenance, confidence, lifecycle, and verification state.
- Unverified external material is quarantined and unavailable to runtime planning.
- Only REQUIRED unresolved information blocks planning; OPTIONAL, INFERABLE, and DEFAULTABLE items remain explicit assumptions.
- Model generation passes through Semantic Intent, Engineering Plan, Model IR, deterministic ADIA compilation, and validation.
- Existing approval, proof, transaction, rollback, persistence, and simulation boundaries remain authoritative.
- No automatic model-weight training or uncontrolled web learning.
- Existing behavior remains available behind compatibility adapters during migration.

---

## 1. Existing Architecture to Reuse

| Capability | Existing implementation | Reuse decision |
|---|---|---|
| Workflow and progressive clarification | `src/agent/agentOrchestrator.ts`, `requestCollaborator.ts`, `clarificationEngine.ts`, `requirementState.ts` | Extend with typed semantic/project memory; do not replace approval state machine |
| LLM boundary | `src/agent/llmProvider.ts`, `src/services/ai/providers/*`, `structuredGenerationCoordinator.ts` | Reuse for schema-constrained intent, extraction, and planning |
| ADIA capability registry | `src/services/ai/catalog/xbridgesCapabilityIndex.ts`, `src/agent/adiaBlockCatalog.ts`, `src/services/ai/retrieval/blockSearch.ts` | Make the only source for block/port/parameter resolution |
| Existing plan/action contracts | `src/services/ai/contracts/engineeringModel.ts`, `planSchemas.ts`, `planPreflight.ts`, `generatedGraphValidator.ts` | Keep as compiler output/execution contracts |
| Knowledge patterns and provenance | `src/services/ai/knowledge/patternStore.ts`, `patternSchemas.ts`, ingestion/promotion/retrieval modules | Reuse storage/hash/lifecycle patterns; add separate concept/fact stores |
| Controlled planner tools | `src/services/ai/tools/engineeringTools.ts`, `engineeringToolSchemas.ts`, `toolGateway.ts` | Extend with read-only knowledge/graph/IR tools |
| Validation | `modelValidation.ts`, `dimensionalEngine.ts`, `planValidator.ts`, `planPreflight.ts` | Compose into a staged Model IR validation pipeline |
| Proof, simulation, repair | `xbridgesProofRunner.ts`, `simulationTools.ts`, `repairLoop.ts` | Reuse after deterministic compilation |
| Safe mutation | `engineeringModelAdapter.ts`, `xbridgesAgentTransaction.ts`, transaction journals | Keep unchanged as the only write boundary |
| Conversation/project persistence | `agentPersistence.ts`, `TaskState`, project context and model snapshots | Split into explicit memory-layer interfaces while preserving persisted state compatibility |

Key gaps: no generic concept/fact schema, no relationship graph, no hybrid concept retrieval, no architecture-level plan, no hierarchical Model IR, no concept-to-capability mapper, and no generic required/optional/inferable/defaultable slot model.

---

## 2. Target Module Layout

Create focused modules under `src/services/ai/engineering/`:

```text
engineering/
  contracts/       semanticIntent.ts, engineeringKnowledge.ts, conceptGraph.ts,
                   architecturePlan.ts, modelIr.ts, memory.ts
  intent/          engineeringIntentInterpreter.ts, referenceResolver.ts
  knowledge/       conceptStore.ts, factStore.ts, sourceDocumentStore.ts
  graph/           conceptGraphStore.ts, conceptGraphTraversal.ts
  retrieval/       lexicalIndex.ts, vectorIndex.ts, hybridRetriever.ts, reranker.ts
  ingestion/       documentExtractor.ts, conceptExtractor.ts,
                   relationshipExtractor.ts, knowledgeIngestionPipeline.ts
  planning/        engineeringPlanner.ts, informationClassifier.ts,
                   clarificationManager.ts, architecturePlanValidator.ts
  mapping/         conceptToBlockMapper.ts, compositionResolver.ts
  modelIr/         modelIrValidator.ts, modelIrCompiler.ts, modelIrDiff.ts
  memory/          conversationMemory.ts, projectMemory.ts, modelMemory.ts
  tools/           engineeringIntelligenceTools.ts
  orchestration/   engineeringIntelligencePipeline.ts
```

Keep current `src/services/ai/planner/` modules as the execution-facing compatibility layer until Model IR compilation fully replaces direct graph planning.

---

## 3. Storage Architecture

Use an append-safe, content-addressed file-backed store for the first release, following `PatternStore` conventions:

```text
<app-data>/engineering-knowledge/v1/
  manifest.json
  sources/<source-id>.json
  documents/<document-hash>.json
  concepts/<concept-id>.json
  facts/<fact-id>.json
  relationships/<relationship-id>.json
  indexes/lexical-index.json
  indexes/vector-index.json
  reviews/<review-id>.json
```

Each record is strict Zod-validated, size-limited, canonically hashed, atomically written, and listed in a self-hashed manifest. Records are immutable by ID; corrections create new versions and deprecate earlier records. Runtime planning reads only `verified` records. Quarantined and reviewed records remain available to operator tooling but not retrieval for planning.

Do not introduce a native database in Phase 1. Define repository interfaces (`ConceptRepository`, `FactRepository`, `RelationshipRepository`, `RetrievalIndex`) so a later SQLite/FTS5 or dedicated vector backend can replace file storage without changing planner contracts.

---

## 4. Canonical Schemas

### Engineering knowledge

`EngineeringConcept`:

- `schemaVersion`, `id`, `canonicalName`, `aliases`, `domain`, `description`
- `functionalRoles`, `requiredConcepts`, `optionalConcepts`, `alternatives`
- `inputs`, `outputs`, `designParameters`, `constraints`, `assumptions`
- `applicableMethods`, `validationRuleIds`, `referenceIds`
- `lifecycle`, `confidence`, `provenanceIds`, `contentHash`

`EngineeringFact`:

- `id`, `subjectConceptId`, `predicate`, typed `object`
- `conditions`, `units`, `confidence`, `verified`
- `sourceId`, `documentId`, `sectionLocator`, `extractionMethod`
- `review`, `version`, `validFrom`, `supersedes`, `contentHash`

### Concept graph

`ConceptRelationship`:

- `id`, `sourceConceptId`, `relationType`, `targetConceptId`
- relation types: `requires`, `uses`, `controls`, `measures`, `produces`, `accepts`, `alternative_to`, `specializes`, `composed_of`, `implemented_by`
- `cardinality`, `conditions`, `priority`, `confidence`, `verified`, provenance fields

Graph invariants: endpoints must exist; IDs are stable; prohibited self-cycles and invalid relationship/domain combinations fail validation; traversal is bounded by depth and result count.

### Semantic intent

`EngineeringIntent`:

- `intent`: create/modify/inspect/validate/simulate/optimize
- `objective`, `domainCandidates`, `systemConceptIds`, `operations`
- `controlledVariables`, `actuators`, `plants`, `sensors`, `inputs`, `outputs`
- `constraints`, `requestedFidelity`, `references`, `confidence`
- `unknownTerms`, `unresolvedReferences`, `evidence`

### Architecture plan

`EngineeringArchitecturePlan`:

- `system`, hierarchical `subsystems`, functional `components`, semantic `connections`
- `designDecisions`, `informationRequirements`, `assumptions`
- `knowledgeEvidence`, `capabilityAssessment`, `rationale`
- no ADIA block IDs except in the separate capability assessment

Every `InformationRequirement` has classification `REQUIRED | OPTIONAL | INFERABLE | DEFAULTABLE`, reason, affected decisions, candidate values, default provenance, and resolution state.

### Model IR

`EngineeringModelIR`:

- `schemaVersion`, `modelId`, `name`, `targetDomain`, `baseRevision`
- hierarchical `subsystems`
- semantic `components` with concept IDs and stable logical IDs
- semantic `ports` and typed `connections`
- parameters with value, unit, source, confidence, and resolution state
- assumptions, unresolved parameters, validation rules, trace links, rationale
- capability bindings added only by deterministic mapping

IR validation runs before and after capability binding. The compiled result remains `EngineeringModelPlanV2`, preserving existing execution infrastructure.

---

## 5. Ordered Implementation Tasks

### Task 1: Freeze engineering-intelligence contracts

**Files:**
- Create: `src/services/ai/engineering/contracts/engineeringKnowledge.ts`
- Create: `src/services/ai/engineering/contracts/conceptGraph.ts`
- Create: `src/services/ai/engineering/contracts/semanticIntent.ts`
- Create: `src/services/ai/engineering/contracts/architecturePlan.ts`
- Create: `src/services/ai/engineering/contracts/modelIr.ts`
- Test: corresponding `*.test.ts` files

- [ ] Write schema tests for valid cross-domain examples: arithmetic, motor control, thermal, hydraulic, state machine, and signal processing.
- [ ] Add negative tests for unknown fields, invalid confidence, dangling IDs, unresolved required values marked resolved, and malformed units.
- [ ] Implement strict Zod schemas and exported TypeScript types.
- [ ] Run `npx vitest run src/services/ai/engineering/contracts`.
- [ ] Commit `feat(ai): define engineering intelligence contracts`.

### Task 2: Build versioned concept, fact, relationship, and source stores

**Files:**
- Create: `src/services/ai/engineering/knowledge/contentAddressedStore.ts`
- Create: `conceptStore.ts`, `factStore.ts`, `sourceDocumentStore.ts`
- Create: `src/services/ai/engineering/graph/conceptGraphStore.ts`
- Reuse: canonical hash and atomic-write patterns from `patternStore.ts`
- Test: storage, corruption, duplicate, migration, and lifecycle tests

- [ ] Define repository interfaces independent of filesystem implementation.
- [ ] Implement strict manifests, atomic writes, hashes, version links, lifecycle filters, and deterministic listing.
- [ ] Verify corrupt records, path traversal, oversized records, and hash mismatches fail closed.
- [ ] Run `npx vitest run src/services/ai/engineering/knowledge src/services/ai/engineering/graph`.
- [ ] Commit `feat(ai): add provenance-aware engineering knowledge stores`.

### Task 3: Implement concept-graph validation and traversal

**Files:**
- Create: `src/services/ai/engineering/graph/conceptGraphValidator.ts`
- Create: `conceptGraphTraversal.ts`
- Test: `conceptGraphValidator.test.ts`, `conceptGraphTraversal.test.ts`

- [ ] Validate endpoints, relation taxonomy, cycles, confidence, and lifecycle eligibility.
- [ ] Implement bounded neighbors, ancestors, requirements closure, alternatives, and shortest evidence path.
- [ ] Return traversal evidence with every result.
- [ ] Run focused graph tests and commit `feat(ai): add bounded engineering concept graph`.

### Task 4: Add trusted document-ingestion pipeline

**Files:**
- Extend: `src/services/ai/knowledge/sources/sourceSchemas.ts`, `sourceRegistry.ts`, `sourceFetcher.ts`
- Create: `src/services/ai/engineering/ingestion/documentExtractor.ts`
- Create: `conceptExtractor.ts`, `relationshipExtractor.ts`, `knowledgeIngestionPipeline.ts`
- Test: fixture-based ingestion and adversarial-source tests

- [ ] Expand source taxonomy to approved documentation, standard, textbook, application note, manufacturer document, paper, and internal document.
- [ ] Store document identity, version/date, section locators, license decision, retrieval timestamp, checksum, and source reliability.
- [ ] Extract text/sections without executing active content, macros, scripts, embedded binaries, or arbitrary code.
- [ ] Use schema-constrained LLM extraction only to create quarantined candidates; deterministic validation and human review control promotion.
- [ ] Preserve extracted fact-to-section provenance and reject unsupported citations.
- [ ] Run ingestion/source-policy tests and commit `feat(ai): ingest quarantined engineering knowledge`.

### Task 5: Implement review and promotion gates

**Files:**
- Create: `src/services/ai/engineering/knowledge/knowledgePromotionService.ts`
- Create: `knowledgeReviewSchemas.ts`
- Extend: `src/services/ai/knowledge/promotion/patternPromotionService.ts` only for shared review utilities
- Test: promotion lifecycle and evidence tests

- [ ] Require license approval, source reliability threshold, reviewer identity, fact/relationship validation, and conflict checks.
- [ ] Promote atomically from quarantined to reviewed/verified; retain superseded history.
- [ ] Prevent runtime retrieval of unverified facts.
- [ ] Commit `feat(ai): add verified knowledge promotion workflow`.

### Task 6: Build hybrid retrieval and evidence reranking

**Files:**
- Create: `src/services/ai/engineering/retrieval/lexicalIndex.ts`
- Create: `vectorIndex.ts`, `hybridRetriever.ts`, `reranker.ts`
- Extend: provider interface only with optional `embed(texts)` capability
- Test: deterministic ranking corpus across domains

- [ ] Implement lexical token/BM25-style scoring, exact aliases, domain/version/lifecycle/source filters, graph-neighborhood expansion, and optional cosine similarity.
- [ ] Combine scores with an explicit formula and stable ID tie-breaker.
- [ ] Weight verified ADIA knowledge, standards, manufacturer docs, textbooks, and peer-reviewed sources above uncontrolled sources.
- [ ] Return cited evidence and score breakdown; never return quarantined knowledge to runtime planning.
- [ ] Run retrieval/provider tests and commit `feat(ai): add hybrid engineering knowledge retrieval`.

### Task 7: Replace keyword routing with typed semantic interpretation

**Files:**
- Create: `src/services/ai/engineering/intent/engineeringIntentInterpreter.ts`
- Create: `referenceResolver.ts`
- Modify: `src/agent/collaborators/requestCollaborator.ts`
- Modify: `src/services/ai/planner/deterministicRouter.ts`
- Test: intent corpus and multi-turn reference tests

- [ ] Parse deterministic entities/units/operations first, then use schema-constrained Qwen output for unresolved semantics.
- [ ] Resolve pronouns such as “it” against project/conversation memory with explicit confidence and ambiguity diagnostics.
- [ ] Preserve unknowns instead of inventing parameters.
- [ ] Route using typed intent fields, not substring checks.
- [ ] Acceptance: addition maps to two numeric operands and sum; BLDC speed control maps to plant/actuator/controller/feedback concepts without selecting blocks.
- [ ] Commit `feat(ai): add semantic engineering intent interpretation`.

### Task 8: Separate the four memory layers

**Files:**
- Create: `src/services/ai/engineering/contracts/memory.ts`
- Create: `src/services/ai/engineering/memory/conversationMemory.ts`
- Create: `projectMemory.ts`, `modelMemory.ts`
- Modify: `src/agent/types.ts`, `requirementState.ts`, `agentPersistence.ts`
- Test: isolation, persistence, reference resolution, and migration tests

- [ ] Store current dialogue in conversation memory, reusable engineering truth only in verified knowledge stores, approved project decisions in project memory, and graph/revision state in model memory.
- [ ] Give every decision provenance, timestamp, scope, and supersession metadata.
- [ ] Ensure new chats do not silently inherit conversation memory; project decisions may be explicitly attached by project ID.
- [ ] Migrate persistence schema version with fail-safe restoration and approval invalidation.
- [ ] Commit `feat(ai): separate conversation project and model memory`.

### Task 9: Implement generic engineering planning and information classification

**Files:**
- Create: `src/services/ai/engineering/planning/informationClassifier.ts`
- Create: `engineeringPlanner.ts`, `architecturePlanValidator.ts`
- Modify: `src/agent/collaborators/planningCollaborator.ts`
- Test: cross-domain architecture planning corpus

- [ ] Expand retrieved concept requirements into a hierarchical functional architecture before block selection.
- [ ] Classify missing information as REQUIRED/OPTIONAL/INFERABLE/DEFAULTABLE using concept rules and affected-decision analysis.
- [ ] Require evidence for inferred/defaulted values and record them as assumptions.
- [ ] Validate architecture completeness, contradictions, unsupported concepts, and traceability.
- [ ] Acceptance: BLDC request produces power/control/sensing/plant/load functions; FOC and six-step remain alternatives rather than hard-coded choices.
- [ ] Commit `feat(ai): add evidence-backed engineering architecture planner`.

### Task 10: Replace question loops with a generic clarification manager

**Files:**
- Create: `src/services/ai/engineering/planning/clarificationManager.ts`
- Modify: `src/agent/clarificationEngine.ts`, `requirementState.ts`, `agentOrchestrator.ts`
- Test: progressive conversation and no-repeat tests

- [ ] Rank unresolved REQUIRED slots by architecture impact and dependency order.
- [ ] Parse answers through each slot's declared value schema and update project memory.
- [ ] Never repeat a resolved question; reject invalid answers with a precise correction request.
- [ ] Present architecture alternatives with short engineering rationale.
- [ ] Commit `feat(ai): add slot-driven engineering clarification`.

### Task 11: Build hierarchical Model IR and diff support

**Files:**
- Create: `src/services/ai/engineering/modelIr/modelIrBuilder.ts`
- Create: `modelIrValidator.ts`, `modelIrDiff.ts`
- Test: hierarchy, references, units, feedback, and modification tests

- [ ] Convert an approved architecture plan into subsystem/component/connection IR with trace links.
- [ ] Validate stable IDs, ownership, subsystem boundaries, semantic ports, dimensions, units, required references, unresolved required parameters, and invalid cycles.
- [ ] Implement semantic IR diffs so “make it sensorless” changes affected sensing/control subsystems instead of rebuilding the project.
- [ ] Commit `feat(ai): add hierarchical engineering Model IR`.

### Task 12: Implement deterministic concept-to-ADIA capability mapping

**Files:**
- Create: `src/services/ai/engineering/mapping/conceptToBlockMapper.ts`
- Create: `compositionResolver.ts`, `capabilityGap.ts`
- Integrate: `xbridgesCapabilityIndex.ts`, `blockSearch.ts`, existing verified patterns
- Test: exact mapping, composition, and gap tests

- [ ] Resolve semantic concepts only to catalog IDs and verified compatible compositions.
- [ ] Validate ports, parameters, domains, solver features, and catalog fingerprint.
- [ ] Return structured `BLOCK_CAPABILITY_GAP` when no valid implementation exists.
- [ ] Keep candidate compositions unselected until validated and evidenced.
- [ ] Commit `feat(ai): map concepts to verified ADIA capabilities`.

### Task 13: Compile Model IR through existing plans and transactions

**Files:**
- Create: `src/services/ai/engineering/modelIr/modelIrCompiler.ts`
- Modify: `src/services/ai/contracts/engineeringModel.ts` only for trace/hierarchy metadata compatible with V2
- Modify: `src/agent/collaborators/planningCollaborator.ts`
- Test: deterministic compilation and snapshot tests

- [ ] Compile bound IR to `EngineeringModelPlanV2` and existing actions with stable ordering.
- [ ] Compile hierarchy to supported subsystem constructs; otherwise return an explicit hierarchy capability gap.
- [ ] Pass output through existing plan validation, preflight, isolated proof, approval, and transactions.
- [ ] Prove identical IR/catalog inputs produce identical plan fingerprints.
- [ ] Commit `feat(ai): compile engineering Model IR deterministically`.

### Task 14: Compose the engineering validation pipeline

**Files:**
- Create: `src/services/ai/engineering/modelIr/engineeringValidationPipeline.ts`
- Extend: existing `modelValidation.ts`, `dimensionalEngine.ts`, `generatedGraphValidator.ts`
- Test: positive and fault-injection validation corpus

- [ ] Validate IR schema, hierarchy, semantic completeness, capability bindings, ports, dimensions, data types, physical domains, parameter completeness, references, unconnected outputs, controller/plant relationships, feedback, algebraic loops, and unsupported blocks.
- [ ] Normalize results into structured diagnostics with affected component, evidence, required values, and remediation.
- [ ] Keep validation, compilation, proof, and simulation statuses distinct.
- [ ] Commit `feat(ai): add staged engineering validation pipeline`.

### Task 15: Expose explicit planner tools

**Files:**
- Create: `src/services/ai/engineering/tools/engineeringIntelligenceTools.ts`
- Modify: `src/services/ai/tools/engineeringToolSchemas.ts`, `engineeringTools.ts`
- Test: schema, authorization, and fail-closed tool tests

- [ ] Add read tools: `search_engineering_knowledge`, `get_concept`, `find_related_concepts`, `get_fact_evidence`, existing block/schema tools, model inspection.
- [ ] Add controlled transformations: `validate_architecture_plan`, `build_model_ir`, `validate_model_ir`, `map_concepts`, `compile_model_ir`.
- [ ] Keep mutation/simulation tools behind existing approval and transaction gates.
- [ ] Log tool input hashes, outputs, evidence IDs, and diagnostics.
- [ ] Commit `feat(ai): expose bounded engineering intelligence tools`.

### Task 16: Integrate the pipeline into the orchestrator with compatibility fallback

**Files:**
- Create: `src/services/ai/engineering/orchestration/engineeringIntelligencePipeline.ts`
- Modify: `src/agent/agentOrchestrator.ts`, collaborators, and `AgentPanel.tsx`
- Test: end-to-end progressive workflows

- [ ] Add explicit stages: interpret → retrieve → plan architecture → clarify → build IR → map → validate → compile → proof → approve → execute → verify.
- [ ] Present concise cited rationale, assumptions, unresolved requirements, capability gaps, and validation results without hidden chain-of-thought.
- [ ] Feature-flag the new pipeline; retain current planner for unsupported/migration cases during rollout.
- [ ] Prevent fallback after the new pipeline has made architecture decisions unless the user explicitly restarts.
- [ ] Commit `feat(ai): integrate engineering intelligence workflow`.

### Task 17: Seed cross-domain knowledge and acceptance benchmarks

**Files:**
- Create verified seed records under `resources/engineering-knowledge/`
- Create: `src/services/ai/engineering/benchmarks/engineeringIntelligenceCorpus.ts`
- Create: corresponding test and evaluation report

- [ ] Seed small reviewed concepts for addition, PID loop, BLDC drive, FOC, six-step commutation, buck/boost converter, thermal loop, hydraulic actuator, differential drive, state machine, Kalman filter, and vibration system.
- [ ] Do not seed unsupported ADIA mappings; represent them as capability gaps.
- [ ] Implement acceptance A (addition), B (BLDC architecture clarification/hierarchy/IR), and C (sensorless modification by IR diff).
- [ ] Add negative tests for invented facts, fake citations, unverified retrieval, hallucinated blocks/ports, ambiguous pronouns, invalid units, and repeated questions.
- [ ] Run full AI, X-Bridges, security, persistence, and TypeScript gates.
- [ ] Commit `test(ai): certify general engineering intelligence pipeline`.

---

## 6. API Boundaries

```ts
interface EngineeringIntentInterpreter {
  interpret(input: string, memory: MemoryContext): Promise<EngineeringIntentResult>;
}

interface EngineeringKnowledgeRetriever {
  retrieve(query: KnowledgeQuery): Promise<RetrievedKnowledgeBundle>;
}

interface EngineeringPlanner {
  plan(intent: EngineeringIntent, knowledge: RetrievedKnowledgeBundle,
       memory: ProjectMemorySnapshot): Promise<ArchitecturePlanningResult>;
}

interface ClarificationManager {
  next(plan: EngineeringArchitecturePlan): ClarificationDecision;
  applyAnswer(plan: EngineeringArchitecturePlan, answer: SlotAnswer): AnswerResult;
}

interface ConceptToBlockMapper {
  map(ir: EngineeringModelIR, catalog: XbridgesCapabilityIndex,
      patterns: readonly EngineeringPattern[]): CapabilityMappingResult;
}

interface ModelIrCompiler {
  compile(ir: BoundEngineeringModelIR, context: CompileContext): EngineeringModelPlanV2;
}

interface EngineeringValidationPipeline {
  validate(ir: EngineeringModelIR | BoundEngineeringModelIR,
           context: ValidationContext): EngineeringValidationReport;
}
```

All result types are discriminated unions with `ok`, `clarification_required`, `capability_gap`, `invalid`, or `failed` states. No boundary throws for expected engineering outcomes.

---

## 7. Recommended Dependencies

- Keep Zod for strict schemas and canonical validation.
- Reuse existing SHA-256/canonical JSON utilities and filesystem atomic-write patterns.
- Implement lexical ranking and cosine similarity internally at first; corpus size does not justify native search dependencies.
- Add an optional embedding method to the existing provider abstraction; use local Ollama/Qwen-compatible embeddings when available and degrade to lexical+graph retrieval when unavailable.
- Do not add LangChain or another orchestration framework; existing typed collaborators, tools, and transactions already provide the needed boundaries.
- Reassess SQLite FTS5 only when measured corpus size or retrieval latency exceeds file-backed index thresholds.

---

## 8. Testing Strategy

- Contract tests for every schema and discriminated result.
- Property/fuzz tests for IDs, hashes, graph traversal bounds, malformed units, and cyclic relationships.
- Golden retrieval corpus with score/evidence assertions.
- Cross-domain planner tests to prevent BLDC specialization.
- Metamorphic tests: paraphrases produce equivalent semantic intent; irrelevant wording does not change architecture.
- Stateful conversation tests for slot resolution, no-repeat behavior, and pronoun references.
- Capability-gap tests proving nonexistent blocks are never invented.
- Deterministic compiler snapshot/fingerprint tests.
- Fault injection for corrupt knowledge, fake citations, unavailable embeddings, stale catalog, LLM timeout, transaction failure, and simulation failure.
- End-to-end acceptance A/B/C plus existing `src/agent`, `src/services/ai`, and X-Bridges benchmark suites.

Release gates:

```powershell
npx vitest run src/services/ai/engineering
npx vitest run src/agent src/services/ai src/components/agent
npx vitest run src/engine/xbridges src/services/xbridgesWorkerClient.test.ts
npm run scan:sast
npx tsc --noEmit --pretty false
npm run build
```

---

## 9. Migration and Rollout

1. Add schemas/stores behind unused interfaces; no runtime behavior change.
2. Seed and verify a small cross-domain concept corpus.
3. Enable semantic interpretation and retrieval in shadow mode; compare against current routing without changing output.
4. Enable architecture planning/clarification for selected test projects.
5. Compile new Model IR into the existing `EngineeringModelPlanV2` path, preserving all current proof/approval/transaction gates.
6. Enable the pipeline by feature flag for general X-Bridges creation requests.
7. Migrate modify requests after Model IR diff acceptance C passes.
8. Remove direct LLM graph synthesis only after parity and negative-safety benchmarks pass.
9. Migrate PatternStore records by referencing them as verified implementation compositions; do not rewrite or discard existing patterns.
10. Increment persisted agent schema and provide deterministic migration for project/model memory.

Rollback is feature-flag based and never downgrades persisted knowledge. Any incompatible store version opens read-only and requires explicit migration.

---

## 10. Phased Roadmap

| Phase | Tasks | Deliverable | Exit criterion |
|---|---|---|---|
| 0 — Contracts | 1 | Stable schemas | Cross-domain contract suite passes |
| 1 — Knowledge foundation | 2–5 | Trusted persistent concept/fact/graph store and ingestion | Unverified content cannot reach runtime retrieval |
| 2 — Retrieval and semantics | 6–8 | Hybrid RAG, typed intent, separated memory | Paraphrase/reference corpus passes |
| 3 — Engineering planning | 9–11 | Hierarchical architecture, meaningful clarification, Model IR/diff | Acceptance A and semantic portion of B/C pass |
| 4 — Capability grounding | 12–15 | Mapper, compiler, validation, tools | Zero invented capabilities in fault corpus |
| 5 — Product integration | 16 | End-to-end orchestrator/UI flow | Proof/approval/transaction gates remain green |
| 6 — Certification | 17 | Cross-domain seeds and acceptance benchmarks | A/B/C and release gates pass |

Each phase is independently reviewable and should be delivered as its own PR. Major production routing changes begin only in Phase 5 after approval and evidence from shadow-mode evaluation.

## Plan Self-Review

- Coverage: all 17 requested planning areas and acceptance tests A/B/C are mapped to tasks and gates.
- Modularity: knowledge, graph, retrieval, intent, planning, clarification, IR, mapping, compilation, validation, memory, tools, and orchestration have separate interfaces.
- Generality: BLDC is an acceptance case and seed concept, not a routing special case.
- Safety: no direct LLM mutation, no unverified runtime knowledge, no invented capabilities, and no self-training.
- Migration: existing plans, patterns, validators, proof, transactions, and UI remain usable during phased rollout.
