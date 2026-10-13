# Engineering Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe source registry and ingestion engine that turns approved engineering references into verified X-Bridges patterns.

**Architecture:** Extend the existing file-backed `PatternStore` and quarantine pipeline with source records, safe metadata ingestion, normalized candidate extraction, catalog compatibility checks, and promotion evidence. Keep external artifacts non-executable and let the existing planner consume only verified patterns.

**Tech Stack:** TypeScript, Zod schemas, Vitest, existing canonical hashing, `PatternStore`, source policy, X-Bridges capability index, existing proof runner.

## Global Constraints

- Do not execute downloaded MATLAB, Simulink, Scilab, archive, or callback content.
- Preserve source URL, author, license, retrieval timestamp, and SHA-256 hash.
- Default lifecycle is `quarantined`.
- Only `verified` and license-approved patterns may reach runtime planning.
- Do not add a database dependency in the first milestone.
- Preserve deterministic hashes and catalog-fingerprint checks.

---

### Task 1: Define source registry schemas and seed records

**Files:**
- Create: `src/services/ai/knowledge/sources/sourceSchemas.ts`
- Create: `src/services/ai/knowledge/sources/sourceRegistry.ts`
- Create: `src/services/ai/knowledge/sources/sourceRegistry.test.ts`
- Create: `src/services/ai/knowledge/sources/seedSources.ts`

**Interfaces:**
- `KnowledgeSource`: `{ id, url, title, provider, sourceType, licensePolicy, retrievalPolicy, enabled }`.
- `SourceRegistry.list(filter?)`, `get(id)`, and `seed(records)`.

- [ ] **Step 1: Write failing schema and seed tests** for official MathWorks docs, File Exchange, and GitHub search records.
- [ ] **Step 2: Run** `npx vitest run src/services/ai/knowledge/sources/sourceRegistry.test.ts`; confirm failure.
- [ ] **Step 3: Implement Zod schemas and deterministic source IDs derived from canonical URL.
- [ ] **Step 4: Add seed records for the approved source URLs and explicit license policies.
- [ ] **Step 5: Run the tests and commit** with `git commit -m "feat(knowledge): add engineering source registry"`.

### Task 2: Add safe metadata retrieval and quarantine storage

**Files:**
- Create: `src/services/ai/knowledge/sources/sourceFetcher.ts`
- Create: `src/services/ai/knowledge/sources/sourceFetcher.test.ts`
- Modify: `src/services/ai/knowledge/ingestion/ingestionSchemas.ts`
- Modify: `src/services/ai/knowledge/ingestion/sourcePolicy.ts`

**Interfaces:**
- `fetchSourceMetadata(source, transport?)` returns a hash-addressed `SourceCandidate`.
- Transport is injected so tests never require network access.

- [ ] **Step 1: Write failing tests** for successful HTML metadata extraction, size limits, unsupported content, missing license, and duplicate source hashes.
- [ ] **Step 2: Run the tests and confirm failure.
- [ ] **Step 3: Implement bounded fetching with maximum response size, timeout, content-type checks, HTML text sanitization, and SHA-256 hashing.
- [ ] **Step 4: Ensure the fetcher never evaluates scripts, model callbacks, archive contents, or MATLAB code.
- [ ] **Step 5: Store candidates through the existing quarantine pipeline and run tests.
- [ ] **Step 6: Commit** with `git commit -m "feat(knowledge): safely quarantine external source metadata"`.

### Task 3: Normalize engineering references into candidate patterns

**Files:**
- Create: `src/services/ai/knowledge/normalization/patternNormalizer.ts`
- Create: `src/services/ai/knowledge/normalization/patternNormalizer.test.ts`
- Read/modify: `src/services/ai/knowledge/patternSchemas.ts`

**Interfaces:**
- `normalizePatternCandidate(input, catalog)` returns a quarantined `EngineeringPattern` payload.
- Input supports structured JSON pattern manifests and documentation metadata; unsupported model binaries become metadata-only records.

- [ ] **Step 1: Write failing tests** for a valid structured pattern, incomplete topology, unknown block mapping, and documentation-only source.
- [ ] **Step 2: Run tests and confirm failure.
- [ ] **Step 3: Implement normalization with explicit block roles, exact mappings, requirements, simulation contract, provenance, and `unproved` evidence.
- [ ] **Step 4: Reject missing IDs, malformed connections, and executable-content fields.
- [ ] **Step 5: Run tests and commit** with `git commit -m "feat(knowledge): normalize engineering pattern candidates"`.

### Task 4: Validate candidates against the active X-Bridges catalog

**Files:**
- Create: `src/services/ai/knowledge/validation/patternCatalogValidator.ts`
- Create: `src/services/ai/knowledge/validation/patternCatalogValidator.test.ts`
- Modify: `src/services/ai/knowledge/ingestion/ingestionPipeline.ts`

**Interfaces:**
- `validatePatternCatalogCompatibility(pattern, catalog)` returns structured diagnostics.

- [ ] **Step 1: Write failing tests** for unknown block mappings, unknown ports, invalid parameters, stale catalog fingerprint, and valid topology.
- [ ] **Step 2: Run tests and confirm failure.
- [ ] **Step 3: Reuse the generated-graph validator and map pattern roles to exact catalog block IDs.
- [ ] **Step 4: Require compatible ports, parameter types, and deterministic catalog fingerprint before proof.
- [ ] **Step 5: Integrate validation into ingestion without changing lifecycle from quarantine.
- [ ] **Step 6: Run tests and commit** with `git commit -m "feat(knowledge): validate patterns against xbridges catalog"`.

### Task 5: Add proof-backed promotion workflow

**Files:**
- Create: `src/services/ai/knowledge/promotion/patternPromotionService.ts`
- Create: `src/services/ai/knowledge/promotion/patternPromotionService.test.ts`
- Modify: `src/services/ai/knowledge/ingestion/ingestionPipeline.ts`
- Read/modify: `src/services/ai/knowledge/runtimePatternGateway.ts`

**Interfaces:**
- `proveAndReviewPattern(patternId, store, catalog, proofRunner, reviewer)` returns a promotion review result.
- `promoteVerifiedPattern(...)` requires proof status, catalog fingerprint, engine run ID, license approval, and reviewer identity.

- [ ] **Step 1: Write failing tests** for successful proof, unavailable observables, license rejection, stale catalog, and promotion replay.
- [ ] **Step 2: Run tests and confirm failure.
- [ ] **Step 3: Execute only normalized in-process pattern graphs through the existing isolated proof runner.
- [ ] **Step 4: Persist genuine engine run ID, measured observables, catalog fingerprint, review time, and quality score.
- [ ] **Step 5: Promote only after all gates pass; otherwise keep quarantined with diagnostics.
- [ ] **Step 6: Run tests and commit** with `git commit -m "feat(knowledge): add proof-backed pattern promotion"`.

### Task 6: Connect verified knowledge to agent retrieval

**Files:**
- Modify: `src/services/ai/knowledge/patternRetrieval.ts`
- Modify: `src/agent/agentOrchestrator.ts`
- Modify: `src/services/ai/planner/generalGraphPlanner.ts`
- Create/modify tests in the corresponding existing test files.

**Interfaces:**
- Retrieval returns only license-approved, verified, catalog-compatible records.
- Planner receives deterministic ranked patterns with provenance and proof evidence.

- [ ] **Step 1: Add failing tests** proving quarantined records never enter planning and verified records are ranked deterministically.
- [ ] **Step 2: Run tests and confirm failure.
- [ ] **Step 3: Add catalog-fingerprint and compatibility filtering at retrieval time.
- [ ] **Step 4: Preserve source/proof provenance in the generated plan.
- [ ] **Step 5: Run planner/orchestrator tests and commit** with `git commit -m "feat(agent): retrieve verified engineering knowledge"`.

### Task 7: Add seed knowledge and release verification

**Files:**
- Create: `src/services/ai/knowledge/sources/seedSources.json`
- Create: `docs/knowledge/ENGINEERING_KNOWLEDGE_BASE.md`
- Modify: `docs/AI_AGENT_CODE_REVIEW.md`
- Tests: all knowledge, planner, orchestrator, and E2E suites.

- [ ] **Step 1: Add source seed documentation with links, license handling, and supported ingestion types.
- [ ] **Step 2: Run focused suites:** `npx vitest run src/services/ai/knowledge src/services/ai/planner src/agent/agentOrchestrator.test.ts --reporter=verbose`.
- [ ] **Step 3: Run typecheck:** `npx tsc --noEmit --pretty false`.
- [ ] **Step 4: Run the relevant X-Bridges E2E suite.
- [ ] **Step 5: Update release evidence with exact outputs and known limitations.
- [ ] **Step 6: Commit** with `git commit -m "docs(knowledge): document engineering knowledge base"`.

## Self-review checklist

- Existing quarantine, policy, pattern-store, and runtime gateway are reused.
- External sources remain metadata/reference inputs until manually reviewed.
- Every executable pattern requires catalog validation and isolated proof.
- The first milestone avoids a new database dependency while preserving a future migration path.
- The plan includes source registry, ingestion, normalization, validation, promotion, retrieval, and verification.
