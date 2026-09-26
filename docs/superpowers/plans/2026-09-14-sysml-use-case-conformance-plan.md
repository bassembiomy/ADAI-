# SysML Use-Case Module Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the use-case module a first-class SysML 1.6 view with Cameo-style use-case notation, canonical persistence, validated relationships, and bidirectional links to BDD, IBD, requirements/RTM, activity, sequence, state-machine, simulation, and report artifacts.

**Architecture:** Keep React Flow as a presentation layer only. Extend the canonical `SysmlRepository` with typed use-case definitions, actors, subjects, extension points, and use-case relationships; project that repository into the use-case canvas and persist layout separately. Route every mutation through the existing SysML command/transaction gateway and shared connection/deletion/traceability services. Use explicit reference objects and diagnostics for links to diagrams and artifacts so stale or unresolved references are visible and never silently downgraded.

**Tech Stack:** TypeScript, React, React Flow (`@xyflow/react`), Vitest, Playwright, existing SysML repository/normalized-store/persistence/connection-policy/reporting infrastructure.

## Global Constraints

- Canonical profile remains `OMG-SysML-1.6-ADIA`; do not claim SysML v2 equivalence.
- The repository is the only semantic mutation and serialization authority; React Flow nodes/edges are projections.
- Preserve existing `.adia`/JSON compatibility through an explicit migration and loss report.
- Use the existing command gateway, normalized store, validation, deletion, audit, and undo/redo mechanisms.
- Do not reinterpret a use-case diagram edge as a BDD/IBD connector or requirement relationship merely because it has a similar label.
- Existing uncommitted `hil_build/` changes are unrelated and must not be modified.

## Current-State Findings

- `src/types/usecase_types.ts` models only three node kinds and seven UI relationship strings. It has no canonical SysML element kind, namespace, ownership, multiplicity, navigability, subject semantics, extension-point identity, or diagram presentation metadata.
- `src/utils/useCasePersistence.ts` serializes React Flow state directly and filters dangling edges, but it does not validate endpoints, directions, relationship legality, identity uniqueness, stale links, or schema versions.
- `src/components/usecase/UseCaseWorkspace.tsx` owns semantic state locally, permits unrestricted `onConnect`, and mutates node/edge arrays without the SysML command gateway.
- `UseCaseInspector.tsx` consumes `sysmlBlocks: any[]`; requirement traces and `elaboratingDiagramId` are UI fields rather than canonical relationships/references.
- `src/engine/sysml/model.ts` has no use-case/actor/subject collections and no `useCase` relationship kinds. `connectionPolicy.ts`, `mutations.ts`, `normalizedStore.ts`, persistence, reporting, and conformance manifests consequently have no use-case lifecycle.
- `src/App.tsx` mounts only `useCaseDiagrams[0]`, stores `usecase.json` separately, and passes legacy block arrays into the module.
- Existing PlantUML output is a useful export target but cannot be the semantic source of truth.

## Target Semantic Contract

Introduce canonical entities with stable IDs and explicit references:

```ts
interface ActorDefinition extends NamedElement {
  kind: 'actor';
  isExternal: boolean;
  generalizationIds: string[];
}

interface SubjectDefinition extends NamedElement {
  kind: 'subject';
  realizedByBlockId?: string;
}

interface UseCaseDefinition extends NamedElement {
  kind: 'useCase';
  subjectId?: string;
  description?: string;
  extensionPointIds: string[];
  behaviorArtifactIds: string[];
}

interface ExtensionPoint extends NamedElement {
  kind: 'extensionPoint';
  useCaseId: string;
  location?: string;
}

type UseCaseRelationshipKind =
  | 'useCaseAssociation'
  | 'include'
  | 'extend'
  | 'useCaseGeneralization'
  | 'useCaseRefine'
  | 'useCaseSatisfy'
  | 'useCaseTrace';

interface DiagramReference {
  diagramId: string;
  diagramKind: 'useCase' | 'activity' | 'sequence' | 'stateMachine' | 'bdd' | 'ibd' | 'requirements' | 'rtm';
  role: 'elaborates' | 'realizes' | 'traces' | 'verifies';
}
```

The exact placement may use a dedicated `useCases` collection or the existing definitions collection, but the selected shape must be consistent across `model.ts`, normalized storage, persistence, deletion, indexing, and report snapshots. Layout must be keyed by canonical element ID and diagram ID, never used to infer semantics.

### Task 1: Define the canonical use-case metamodel and migration boundary

**Files:**
- Modify: `src/engine/sysml/model.ts`
- Create: `src/engine/sysml/useCases.ts`
- Create: `src/engine/sysml/useCases.test.ts`
- Modify: `src/engine/sysml/workerProtocol.ts`
- Modify: `src/engine/sysml/profile.ts`
- Modify: `src/engine/sysml/conformanceManifest.ts`

**Interfaces:**
- Produce typed actor, subject, use-case, extension-point, diagram-reference, and use-case relationship contracts.
- Produce `validateUseCaseElement`, `validateUseCaseRelationship`, `deriveUseCaseView`, and `classifyUseCaseRelationship`.
- Consume `SysmlRepository`, `NamedElement`, and existing diagnostic conventions.

- [ ] Add stable canonical types and collections without changing existing BDD/IBD semantics.
- [ ] Define legal endpoint/direction rules: actor↔use case association; use case→use case include; extending use case→base use case extend with extension-point target; actor/use-case generalization only within the same metaclass family; trace/refine/satisfy only through the shared traceability policy.
- [ ] Define subject containment and ensure a use case can belong to at most one subject in a given semantic context.
- [ ] Add tests for valid/invalid endpoints, duplicate extension points, missing subject/block references, illegal cycles, and stable derived ordering.
- [ ] Register use-case capabilities as `partial` until the full lifecycle is released, then update evidence only after later tasks pass.

### Task 2: Add normalized-store, persistence, migration, and identity support

**Files:**
- Modify: `src/engine/sysml/normalizedStore.ts`
- Modify: `src/engine/sysml/persistence.ts`
- Modify: `src/engine/sysml/normalizedStore.test.ts`
- Modify: `src/engine/sysml/persistence.test.ts`
- Create: `src/engine/sysml/useCaseMigration.test.ts`

**Interfaces:**
- Consume the canonical types from Task 1.
- Produce loss-aware migration from legacy `useCaseDiagrams` arrays into canonical entities plus presentation records.

- [ ] Add store maps/indexes for use-case entities, extension points, diagram references, and use-case relationships.
- [ ] Preserve canonical IDs from `canonicalElementId`; generate deterministic IDs for legacy nodes using diagram ID and legacy node ID.
- [ ] Migrate legacy node types: `actor`, `useCase`, and `systemBoundary` to actor/use-case/subject; migrate `subjectBlockId`, `elaboratingDiagramId`, and requirement traces into explicit references/relationships.
- [ ] Migrate legacy edge labels to typed relationships only when endpoint validation succeeds; otherwise retain an explicit unresolved legacy record and diagnostic.
- [ ] Round-trip the new repository with checksum, deterministic ordering, legacy arrays, and no loss of unrelated entities.

### Task 3: Integrate command gateway, validation, deletion, undo/redo, and connection policy

**Files:**
- Modify: `src/engine/sysml/connectionPolicy.ts`
- Modify: `src/engine/sysml/policy.ts`
- Modify: `src/engine/sysml/mutations.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlTransactionAdapter.ts`
- Modify: `src/engine/sysml/validation.ts`
- Create: `src/engine/sysml/useCaseLifecycle.test.ts`
- Modify: related service/policy/mutation tests

**Interfaces:**
- Produce commands for create/update/delete actor, subject, use case, extension point, diagram reference, and relationship.
- Produce impact analysis that reports affected use-case, BDD, IBD, requirements, RTM, behavior, and report views.

- [ ] Extend `connectionPolicy` with `useCase` as a diagram kind and fail closed for all unsupported relationship kinds.
- [ ] Route create, rename, reconnect, type change, link/unlink, delete, import, save, undo, and redo through one transaction path.
- [ ] Enforce include/extend/generalization rules and reject self-links/cycles where SysML semantics disallow them.
- [ ] On deletion, remove owned extension points and presentation references, remove semantic links touching the deleted ID, and retain typed usages that merely reference a deleted subject/block with an invalid-reference diagnostic rather than silently deleting them.
- [ ] Add audit records and revision increments for every semantic command; layout-only movements must not invalidate verification evidence.

### Task 4: Replace the React Flow-owned model with a canonical use-case projection

**Files:**
- Modify: `src/types/usecase_types.ts`
- Modify: `src/utils/useCasePersistence.ts`
- Modify: `src/components/usecase/UseCaseWorkspace.tsx`
- Modify: `src/components/usecase/UseCaseNodes.tsx`
- Modify: `src/components/usecase/UseCaseEdges.tsx`
- Create: `src/components/usecase/useCaseProjection.ts`
- Create: `src/components/usecase/useCaseProjection.test.ts`

**Interfaces:**
- Consume `deriveUseCaseView` and the command gateway.
- Produce React Flow nodes/edges from canonical entities and apply only presentation patches back to the repository.

- [ ] Separate semantic records from node position, size, z-index, selection, and viewport metadata.
- [ ] Replace unrestricted `onConnect` with a connection preview/validation flow that displays the policy diagnostic before committing.
- [ ] Render actor, use-case, subject boundary, extension point, include, extend, generalization, and traceability notation with Cameo-like line styles, arrowheads, stereotypes, and extension-point labels.
- [ ] Support nested subjects and containment safely; do not use React Flow `parentId` as a semantic relationship.
- [ ] Preserve copy/paste and undo/redo through command history with collision-safe IDs and relationship remapping.
- [ ] Add unit tests for projection round trips, stale/deleted references, layout persistence, illegal connections, and copy/paste semantics.

### Task 5: Build a typed inspector and cross-diagram navigation workflow

**Files:**
- Modify: `src/components/usecase/UseCaseInspector.tsx`
- Modify: `src/components/usecase/UseCaseToolbar.tsx`
- Create: `src/components/usecase/UseCaseRelationshipEditor.tsx`
- Create: `src/components/usecase/UseCaseReferencePicker.tsx`
- Modify: `src/components/usecase/UseCaseInspector.test.tsx`
- Create: `src/components/usecase/UseCaseReferencePicker.test.tsx`

**Interfaces:**
- Consume canonical repository/index selectors and command gateway callbacks.
- Produce typed edits for subject, realization, extension points, relationship ends, behavior diagram references, and requirement links.

- [ ] Remove `any[]` block input and show definitions/usages/requirements/diagrams from typed selectors.
- [ ] Replace free-text `elaboratingDiagramId` with a picker limited to existing activity/sequence/state-machine diagrams, showing unresolved references explicitly.
- [ ] Replace local `requirementTraces` with canonical `refine`, `satisfy`, `verify`, and `trace` relationship editing, including direction and endpoint diagnostics.
- [ ] Add navigation actions that open the referenced BDD/IBD/requirements/RTM/behavior diagram and select the corresponding canonical element.
- [ ] Add a relationship editor for multiplicity, role names, navigability, extension point, and stereotype where applicable.

### Task 6: Integrate App state, project files, import/export, reports, and PlantUML

**Files:**
- Modify: `src/App.tsx`
- Modify: project-file persistence/import code identified around existing `usecase.json` handling
- Modify: `src/features/plantuml/adapters/useCaseAdapter.ts`
- Modify: `src/features/reporting/reportDiagrams.ts`
- Modify: `src/features/reporting/reportDiagramModel.ts`
- Create: `src/features/reporting/reportDiagrams.usecase.test.ts`
- Modify: `src/features/plantuml/adapters/useCaseAdapter.test.ts`

**Interfaces:**
- Consume canonical repository and use-case projection.
- Produce report snapshots and exports that include canonical IDs, relationship kinds, unresolved-reference diagnostics, and cross-diagram trace links.

- [ ] Stop mounting only `useCaseDiagrams[0]`; support active use-case diagram selection while preserving legacy default behavior.
- [ ] Make canonical repository state the source for save/load; keep legacy `usecase.json` as a compatibility export/import surface with migration diagnostics.
- [ ] Extend report hierarchy/diagram rendering to include use-case diagrams, actors, subjects, use cases, include/extend/generalization links, and traceability links.
- [ ] Make PlantUML export consume canonical semantics and preserve direction/stereotype/extension-point notation; add diagnostics for unsupported elements.
- [ ] Ensure report links between use case, realizing block/part, requirement, activity/sequence/state-machine artifact, simulation artifact, and verification case are bidirectional in the snapshot/index.

### Task 7: Add end-to-end conformance, performance, and release-gate evidence

**Files:**
- Create: `tests/e2e/sysml-usecase-conformance.spec.ts`
- Create: `src/engine/sysml/useCaseLargeModel.test.ts`
- Modify: `tests/e2e/sysml-persistence-report.spec.ts`
- Modify: `src/engine/sysml/conformanceManifest.ts`
- Modify: `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`
- Create: `docs/SYSML_USECASE_CONFORMANCE.md`

- [ ] Qualify create/edit/connect/reconnect/delete/undo/redo/save/load flows in a real browser.
- [ ] Qualify cross-diagram navigation and traceability from use case→subject/block, use case→requirement, use case→behavior diagram, requirement→use case, and report→source element.
- [ ] Qualify migration of a legacy use-case payload and confirm diagnostics are visible and persisted.
- [ ] Add large-model checks for projection, validation, index lookup, drag latency, and no semantic revision on layout-only updates.
- [ ] Run `npm run test:sysml`, `npm run test:sysml:release`, `npm run test:e2e:sysml`, and `npx tsc --noEmit`; only then mark use-case capabilities supported in the conformance manifest.

## Verification Matrix

| Capability | Unit/integration evidence | Browser evidence |
|---|---|---|
| Canonical actors, subjects, use cases, extension points | `useCases.test.ts`, validation tests | create/edit/delete scenario |
| Include/extend/generalization semantics | policy/lifecycle tests | valid and rejected connections |
| Requirement links | RTM/index tests and inspector tests | navigation + RTM update |
| BDD/IBD realization | projection/reference tests | subject/block and part/port navigation |
| Activity/sequence/state-machine elaboration | reference validation tests | picker, open, stale-reference warning |
| Persistence/migration | persistence/migration tests | reload and legacy import |
| Reports/PlantUML | report and adapter tests | exported/report snapshot checks |
| Deletion/undo/redo | mutation/gateway tests | browser lifecycle flow |

## Self-Review and Scope Notes

This plan intentionally separates semantic conformance from visual polish. The current code can make use-case diagrams look plausible, but it cannot currently guarantee that an element or connection has one canonical identity across diagrams. The first three tasks therefore establish the repository and lifecycle contract before UI replacement. Activity and sequence diagrams are referenced as typed artifacts in this plan; if those modules do not yet expose stable diagram IDs, their adapter work must be added inside Task 6 rather than storing free-form strings.

Plan complete and saved to `docs/superpowers/plans/2026-09-14-sysml-use-case-conformance-plan.md`.
