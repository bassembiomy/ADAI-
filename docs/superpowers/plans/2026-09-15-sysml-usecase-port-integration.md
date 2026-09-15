# SysML Use-Case and Port Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the SysML use-case diagram and make its navigation, ports, module behavior, persistence, and cross-diagram connections reliable.

**Architecture:** Keep `SysmlRepository` and the normalized store authoritative. Use-case diagrams are typed projections of actors, subjects, use cases, extension points, and legal relationships. BDD owns port definitions; IBD owns port usages and connectors; a shared reference resolver connects all diagram kinds through stable IDs.

**Tech Stack:** TypeScript, React, React Flow, Vitest, Playwright, PlantUML, existing SysML normalized store and command gateway.

## Global Constraints

- Use-case diagrams must not own BDD/IBD port definitions or usages.
- All semantic changes must pass through the SysML command gateway.
- Presentation-only changes must not advance semantic revisions.
- Relationship and port compatibility policies must fail closed.
- Legacy data must migrate deterministically and emit explicit diagnostics for loss or unresolved references.

---

### Task 1: Establish the canonical use-case and structural boundary

**Files:**
- Modify: `src/types/usecase_types.ts`
- Modify: `src/types/sysml_types.ts`
- Modify: `src/engine/sysml/model.ts`
- Modify: `src/engine/sysml/useCases.ts`
- Modify: `src/engine/sysml/connectionPolicy.ts`
- Test: `src/engine/sysml/useCases.test.ts`
- Test: `src/engine/sysml/connectionPolicy.test.ts`

**Interfaces:**
- Produce typed `UseCaseDefinition`, `ActorDefinition`, `SubjectDefinition`, `ExtensionPoint`, `DiagramReference`, `PortDefinition`, `PortUsage`, and `ConnectorUsage` boundaries.
- Produce validators that return structured diagnostics with code, message, source ID, and target ID.

- [ ] Add tests for legal and illegal use-case endpoint combinations, duplicate names, self-links, missing subjects, and illegal port ownership.
- [ ] Add tests proving a use-case node can reference a subject block and elaborating diagram without embedding port data.
- [ ] Implement the smallest model/type changes needed to satisfy those tests.
- [ ] Run `npm test -- --run src/engine/sysml/useCases.test.ts src/engine/sysml/connectionPolicy.test.ts` and confirm all tests pass.

### Task 2: Normalize port counts, names, ownership, and compatibility

**Files:**
- Modify: `src/engine/sysml/normalizedStore.ts`
- Modify: `src/engine/sysml/validation.ts`
- Modify: `src/engine/sysml/mutations.ts`
- Modify: `src/components/sysml/BDDWorkspace.tsx`
- Modify: `src/components/sysml/IBDWorkspace.tsx`
- Test: `src/engine/sysml/portValidation.test.ts`

**Interfaces:**
- Produce `validatePortDefinition`, `validatePortUsage`, and `validateConnectorCompatibility`.
- Produce deterministic indexes by owner ID, qualified name, port name, and canonical element ID.

- [ ] Test exact port naming uniqueness within an owner, valid multiplicities, direction compatibility, interface/type compatibility, and missing-owner rejection.
- [ ] Test that BDD displays definitions while IBD displays usages and connectors.
- [ ] Implement port indexes and validators; reject duplicate or orphan ports before mutation.
- [ ] Update inspectors and creation dialogs to show the canonical port count and names from the owner’s index.
- [ ] Run `npm test -- --run src/engine/sysml/portValidation.test.ts` and confirm all tests pass.

### Task 3: Add one cross-diagram navigation and reference service

**Files:**
- Create: `src/engine/sysml/diagramReferences.ts`
- Modify: `src/engine/sysml/model.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/components/usecase/UseCaseReferencePicker.tsx`
- Modify: `src/components/usecase/UseCaseInspector.tsx`
- Test: `src/engine/sysml/diagramReferences.test.ts`
- Test: `src/components/usecase/UseCaseReferencePicker.test.tsx`

**Interfaces:**
- `resolveDiagramReference(referenceId: string): ResolvedDiagramReference | UnresolvedDiagramReference`.
- `createDiagramReference(sourceElementId: string, diagramId: string, diagramKind: DiagramKind, role: DiagramReferenceRole)`.

- [ ] Test resolution to BDD, IBD, Requirements, Activity, Sequence, and State Machine diagrams.
- [ ] Test wrong-kind targets, deleted targets, duplicate references, and navigation to a specific element.
- [ ] Implement the resolver and route reference creation/deletion through the gateway.
- [ ] Make inspector buttons navigate by canonical diagram ID and element ID, with visible unresolved diagnostics.
- [ ] Run the resolver and picker tests.

### Task 4: Replace unsafe use-case navigation and connection paths

**Files:**
- Modify: `src/components/usecase/UseCaseWorkspace.tsx`
- Modify: `src/components/usecase/UseCaseNodes.tsx`
- Modify: `src/components/usecase/UseCaseEdges.tsx`
- Modify: `src/utils/useCasePersistence.ts`
- Modify: `src/App.tsx`
- Test: `src/components/usecase/useCaseProjection.test.ts`
- Test: `tests/e2e/sysml-usecase-conformance.spec.ts`

**Interfaces:**
- Produce `projectUseCaseDiagram(repo, diagramId)` with stable node/edge IDs.
- Produce gateway-backed handlers for create, rename, connect, reconnect, delete, and navigate.

- [ ] Add failing tests for stale node IDs, illegal edges, duplicate projected nodes, and navigation after save/load.
- [ ] Implement projection-only rendering and remove direct semantic array mutation from UI handlers.
- [ ] Make connection creation select a relationship kind explicitly and validate it before insertion.
- [ ] Ensure node dragging updates presentation state only.
- [ ] Run the focused component tests and Playwright use-case conformance test.

### Task 5: Migrate legacy diagrams and make persistence loss-aware

**Files:**
- Modify: `src/utils/useCasePersistence.ts`
- Modify: `src/utils/adiaProjectPersistence.ts`
- Modify: `src/engine/sysml/persistence.ts`
- Modify: `src/engine/sysml/useCaseMigration.ts`
- Test: `src/engine/sysml/useCaseMigration.test.ts`
- Test: `src/engine/sysml/persistence.test.ts`

**Interfaces:**
- Produce `migrateLegacyUseCaseDiagram(raw): MigrationResult`.
- Produce deterministic serialization/deserialization preserving canonical IDs, references, positions, and diagnostics.

- [ ] Test legacy node/edge conversion, generated IDs, duplicate labels, unsupported edge types, missing targets, and round-trip equality.
- [ ] Implement migration without inventing ports or silently converting unsupported relationships.
- [ ] Include migration diagnostics in project reports and import results.
- [ ] Run persistence and migration tests.

### Task 6: Verify reports, PlantUML, and full traceability

**Files:**
- Modify: `src/features/plantuml/adapters/useCaseAdapter.ts`
- Modify: `src/features/reporting/reportDiagrams.ts`
- Modify: `src/features/reporting/reportDiagramModel.ts`
- Modify: `docs/SYSML_USECASE_CONFORMANCE.md`
- Modify: `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`
- Test: `src/features/plantuml/adapters/useCaseAdapter.test.ts`
- Test: `src/features/reporting/reportDiagrams.usecase.test.ts`
- Test: `tests/e2e/sysml-persistence-report.spec.ts`

- [ ] Test report/export output for subjects, actors, include/extend/generalization markers, extension points, port references, and unresolved diagnostics.
- [ ] Implement explicit report sections for canonical references and migration/validation errors.
- [ ] Confirm requirements links expose `refine`, `satisfy`, `verify`, and `trace` directionally.
- [ ] Run `npm run test:sysml`, `npm run test:sysml:release`, and `npx tsc --noEmit`.

### Completion Gate

- [ ] Confirm zero structural validation errors on representative models.
- [ ] Confirm no use-case diagram contains port definitions/usages.
- [ ] Confirm every port has one valid owner and every connector has compatible endpoints.
- [ ] Confirm save/load and export/import preserve stable IDs and show explicit loss diagnostics.
- [ ] Confirm browser navigation reaches the intended diagram and element after reload.

