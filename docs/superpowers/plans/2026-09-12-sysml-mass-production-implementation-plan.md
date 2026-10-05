# SysML Mass-Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ADIA’s SysML modules use one typed semantic policy across BDD, IBD, Requirements, traceability, persistence, and deletion so the application is releaseable for mass production.

**Architecture:** Keep `SysmlRepository` as the sole semantic authority. Add a pure policy layer for inheritance, endpoint typing, and deletion classification; route the canonical worker/gateway and legacy `App.tsx` adapter through it; keep diagram coordinates as projections. Every task ends with unit, integration, and browser evidence before promotion.

**Tech Stack:** TypeScript, React, Vitest, Playwright, normalized SysML repository, worker protocol, existing conformance manifest.

## Global Constraints

- Preserve `OMG-SysML-1.6-ADIA`; do not claim SysML v2 equivalence.
- Cascade deletion only through explicit composite ownership.
- Treat definition-typed usages as unresolved impacts, never implicit children.
- Keep legacy diagrams as projections; no new semantic mutation in `App.tsx`.
- Every new command must have a failing test before implementation.
- Every capability must be registered in `src/engine/sysml/profile.ts` and evidenced by tests.
- Preserve stable IDs, audit trail, inverse patches, and schema migration behavior.

---

### Task 1: Add the typed SysML policy layer

**Files:**
- Create: `src/engine/sysml/policy.ts`
- Create: `src/engine/sysml/policy.test.ts`
- Modify: `src/engine/sysml/bdd.ts`
- Modify: `src/engine/sysml/ibd.ts`
- Modify: `src/engine/sysml/mutations.ts`

**Interfaces:**
- `resolveInheritance(repo, definitionId): InheritanceResolution`
- `classifyRelationship(repo, relationshipId): RelationshipDecision`
- `classifyDeletionTarget(repo, elementId): DeletionDecision`

- [ ] Write tests for inherited feature provenance, leaf/abstract rules, BDD-vs-IBD endpoint legality, and definition deletion versus composite usage deletion.
- [ ] Run `npx vitest run src/engine/sysml/policy.test.ts`; confirm failure because the policy module is absent.
- [ ] Implement pure functions using existing `BlockDefinition`, `PartUsage`, `PortUsage`, `ConnectorUsage`, `SysmlRelationship`, and `analyzeMutation` data.
- [ ] Run the focused policy, BDD, IBD, validation, and mutation tests; require zero failures.
- [ ] Register the policy capability/evidence in `src/engine/sysml/profile.ts` and `conformanceManifest.ts`.
- [ ] Commit `feat(sysml): centralize typed semantic policy decisions`.

### Task 2: Route canonical commands through policy decisions

**Files:**
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlCreationRules.ts`
- Modify: `src/services/sysmlTransactionAdapter.ts`
- Modify: `src/engine/sysml/sysmlWorker.ts`
- Test: corresponding `*.test.ts` files plus `src/engine/sysml/sysmlWorker.test.ts`

- [ ] Add failing tests proving create/update/connect/delete commands return typed diagnostic codes instead of generic invalid-operation errors.
- [ ] Add policy calls at the gateway boundary before mutation; preserve transaction IDs and inverse patches.
- [ ] Ensure worker responses carry compact diagnostics and deletion impact without serializing the entire repository.
- [ ] Verify `npm run test:sysml` and `npx tsc --noEmit`.
- [ ] Commit `feat(sysml): gate canonical commands with semantic policy`.

### Task 3: Replace legacy semantic branches with adapters

**Files:**
- Modify: `src/App.tsx` at legacy SysML create/update/connect/delete callbacks
- Modify: `src/types/sysml_types.ts`
- Modify: `src/services/sysmlTransactionAdapter.ts`
- Test: `src/services/sysmlTransactionAdapter.test.ts`, `src/components/sysml/sysmlBrowserFlow.test.tsx`

- [ ] Add a failing adapter test for a legacy block definition deletion with two typed usages: one composite-owned and one external/shared.
- [ ] Make the adapter call the canonical policy and return unresolved usage impacts for the external/shared usage.
- [ ] Replace direct relationship/connector array filtering in the affected callbacks with adapter transactions.
- [ ] Preserve history, selection cleanup, and user-facing confirmation text.
- [ ] Run targeted UI tests and browser smoke tests.
- [ ] Commit `refactor(sysml): route legacy editor mutations through canonical adapter`.

### Task 4: Deliver inheritance and type UX parity

**Files:**
- Modify: `src/components/sysml/BlockPropertiesEditor.tsx`
- Modify: `src/components/sysml/BlockFeatureEditor.tsx`
- Modify: `src/components/sysml/RelationshipEndEditor.tsx`
- Create/modify tests beside each component

- [ ] Add a failing test showing inherited features with origin, read-only state, and explicit redefine/subset action.
- [ ] Add an inheritance panel with parent chain, cycle/leaf diagnostics, abstract instantiation guidance, and deterministic ordering.
- [ ] Add type/multiplicity/unit validation messages that use canonical diagnostic codes.
- [ ] Verify keyboard navigation, empty state, and large inherited-feature lists.
- [ ] Commit `feat(sysml): expose inheritance and typed feature governance`.

### Task 5: Deliver BDD/IBD connection governance

**Files:**
- Modify: `src/components/sysml/IbdConnectorEditor.tsx`
- Modify: `src/components/sysml/VirtualizedDiagram.tsx`
- Modify: `src/engine/sysml/bdd.ts` and `src/engine/sysml/ibd.ts`
- Test: `IbdConnectorEditor.test.tsx`, `ibd.test.ts`, browser BDD/IBD spec

- [ ] Add failing tests for assembly, delegation, binding, direction, port typing, conjugation, and duplicate connector rejection.
- [ ] Render BDD relation notation separately from IBD connector notation.
- [ ] Make connector creation context-bound to one owning block and reject cross-context edges without delegation.
- [ ] Add item-flow compatibility and explicit unresolved-import state.
- [ ] Run BDD/IBD unit and Playwright tests.
- [ ] Commit `feat(sysml): enforce typed BDD and IBD connection semantics`.

### Task 6: Make deletion preview and recovery production-grade

**Files:**
- Modify: `src/engine/sysml/mutations.ts`
- Modify: `src/components/sysml/RequirementGovernancePanel.tsx`
- Modify: `src/components/sysml/LargeModelDiagnostics.tsx`
- Modify: `src/App.tsx`
- Test: `mutations.test.ts`, `patches.test.ts`, deletion lifecycle E2E

- [ ] Add failing tests for each deletion-matrix row in `docs/sysml/SYSML_MODULE_BIBLE.md`.
- [ ] Add a typed impact severity (`safe`, `review`, `blocked`) and resolution choices for unresolved usages.
- [ ] Require protected-baseline clone or explicit authorization before destructive mutation.
- [ ] Ensure inverse patch restores every cascade member and evidence invalidation state.
- [ ] Verify the deletion lifecycle browser test with dialogs, cancellation, apply, undo, and reload.
- [ ] Commit `feat(sysml): harden deletion impact and recovery workflows`.

### Task 7: Persistence, migration, and interchange evidence

**Files:**
- Modify: `src/engine/sysml/persistence.ts`
- Modify: `src/engine/sysml/normalizedStore.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Create: `src/engine/sysml/interchangeReport.ts` and test
- Modify: `docs/SYSML_INTERCHANGE_LIMITATIONS.md`

- [ ] Add a failing round-trip fixture test covering inheritance, composition, shared/reference parts, ports, connectors, requirements, evidence, and baselines.
- [ ] Preserve semantic IDs and produce explicit loss records for unsupported legacy/OPM projections.
- [ ] Reject or quarantine unresolved endpoint references during import; do not silently create generic associations.
- [ ] Verify schema migration from legacy arrays to `schemaVersion: 2` and deterministic serialization.
- [ ] Commit `feat(sysml): qualify persistence and interchange loss reporting`.

### Task 8: Mass-production performance and release gates

**Files:**
- Modify: `src/engine/sysml/largeModelBenchmarkGate.test.ts`
- Modify: `src/engine/sysml/conformanceManifest.ts`
- Modify: `package.json`
- Create: `docs/sysml/SYSML_MASS_PRODUCTION_RELEASE_GATE.md`
- Modify: `.github/workflows/dependency-security.yml` or add a dedicated SysML workflow

- [ ] Add a failing release-gate test requiring supported capabilities to have unit, integration, browser, and persistence evidence.
- [ ] Benchmark 10k definitions/usages/relationships/connectors with validation and viewport culling thresholds recorded.
- [ ] Add CI commands: `npm run test:sysml:full-release`, `npm run test:e2e:sysml`, `npm run build`, and `git diff --check`.
- [ ] Record current counts, runtime, memory, known limitations, and rollback criteria in the release gate document.
- [ ] Run the full gate and commit `docs(sysml): define mass-production release qualification`.

## Final acceptance checklist

- [ ] All canonical and legacy mutation paths use the typed policy gateway.
- [ ] Generalization is acyclic, directional, provenance-aware, and leaf/abstract-safe.
- [ ] BDD relationships and IBD connectors are distinct in storage, validation, rendering, and deletion.
- [ ] Composite deletion cascades only through explicit ownership; shared/reference usages are impact-only.
- [ ] Every deletion is previewable, confirmable, auditable, and undoable.
- [ ] Import/export reports loss and preserves stable identity.
- [ ] `npm run test:sysml:full-release` passes with no unsupported “supported” rows.
- [ ] Production build and browser gates pass with zero uncaught console errors.
