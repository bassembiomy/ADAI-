# SysML Requirement Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated SysML Requirement Containment relationship to the Requirement Diagram with correct notation, validation, ownership lifecycle, persistence, reporting, RTM impact, and deletion behavior.

**Architecture:** Introduce `requirementContainment` as a canonical relationship kind instead of overloading BDD `composition`. Treat its source as the container requirement and its target as the nested requirement. Keep diagram removal separate from semantic deletion; model deletion of a container cascades through nested requirements only after impact confirmation, while deleting the relationship or removing a symbol from a diagram preserves both requirements.

**Tech Stack:** TypeScript 5, React 18, Vitest, Playwright, existing canonical SysML repository and SVG/reporting infrastructure.

## Global Constraints

- Normative target: OMG SysML 1.6 requirement containment, based on UML namespace/nested-classifier containment.
- Canonical direction is `container requirement -> nested requirement`.
- A nested requirement has at most one containment owner.
- Requirement containment must be acyclic.
- BDD composition remains a distinct structural relationship and must retain its current BlockDefinition/PartUsage semantics.
- Deleting a containment relationship never deletes either requirement.
- Removing a requirement symbol from a diagram never deletes the semantic requirement or its relationships.
- Deleting a container requirement from the model recursively deletes nested requirements and their owned containment subtree after impact confirmation.
- Before deleting a container, users may re-home nested requirements by changing/removing containment.
- `deriveReqt`, `satisfy`, `verify`, `refine`, `trace`, and `copy` never cascade-delete connected elements.
- Every mutation must be atomic, auditable, undoable/redoable, persisted, and reflected consistently in Requirements, RTM, reports, and verification evidence.

---

### Task 1: Add the canonical Requirement Containment metamodel kind

**Files:**
- Modify: `src/engine/sysml/model.ts`
- Modify: `src/types/sysml_types.ts`
- Modify: `src/engine/sysml/persistence.ts`
- Modify: `src/engine/sysml/model.test.ts`
- Modify: `src/engine/sysml/persistence.test.ts`

**Interfaces:**
- Produces: canonical `SysmlRelationship.kind === 'requirementContainment'` and legacy `RelationshipData.type === 'requirementContainment'`.

- [ ] **Step 1: Write failing type and round-trip tests.** Create a parent and child requirement connected by `requirementContainment`; assert deterministic serialization/load preserves its kind, source, target, and ID.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/engine/sysml/model.test.ts src/engine/sysml/persistence.test.ts`; expect TypeScript/test failure because the kind is not accepted.
- [ ] **Step 3: Extend the canonical and compatibility unions.** Add the exact literal to both relationship types and persistence allowlists:

```ts
export type RequirementRelationshipKind =
  | 'requirementContainment'
  | 'deriveReqt'
  | 'satisfy'
  | 'verify'
  | 'refine'
  | 'trace'
  | 'copy';
```

- [ ] **Step 4: Add a one-time migration.** During legacy load, convert `composition` to `requirementContainment` only when both endpoints resolve to requirements. Preserve `composition` when either endpoint is a BDD/IBD structural element. Emit migration diagnostic `LEGACY_REQUIREMENT_COMPOSITION_MIGRATED`.
- [ ] **Step 5: Run GREEN and commit.** Run the two focused suites and `npx tsc --noEmit`; require zero failures. Commit `feat(sysml): add requirement containment relationship kind`.

### Task 2: Implement validation, ownership, and lifecycle semantics

**Files:**
- Modify: `src/engine/sysml/requirements.ts`
- Modify: `src/engine/sysml/requirements.test.ts`
- Modify: `src/engine/sysml/validation.ts`
- Modify: `src/engine/sysml/validation.test.ts`
- Modify: `src/services/sysmlCreationRules.ts`
- Modify: `src/services/sysmlCreationRules.test.ts`

**Interfaces:**
- Produces: `validateRequirementContainment(repo, relationshipId)`, `getNestedRequirementIds(repo, containerId)`, and stable diagnostics.

- [ ] **Step 1: Write failing semantic tests.** Cover valid parent-to-child containment, non-requirement endpoint rejection, self-containment, two parents for one child, direct and transitive cycles, and valid re-homing after deleting the old relationship.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/engine/sysml/requirements.test.ts src/engine/sysml/validation.test.ts src/services/sysmlCreationRules.test.ts`; expect missing-kind/diagnostic failures.
- [ ] **Step 3: Implement validation with exact diagnostic codes.** Return:

```ts
INVALID_REQUIREMENT_CONTAINMENT_ENDPOINT
REQUIREMENT_SELF_CONTAINMENT
MULTIPLE_REQUIREMENT_CONTAINERS
REQUIREMENT_CONTAINMENT_CYCLE
```

- [ ] **Step 4: Replace overloaded checks.** In `requirements.ts`, remove requirement hierarchy handling from `composition`; include only `requirementContainment` in hierarchy direction/cycle checks. In `sysmlCreationRules.ts`, validate `requirementContainment` separately from BDD composition.
- [ ] **Step 5: Implement deterministic traversal.** `getNestedRequirementIds` must return descendants in depth-first, stable-ID order, protect against corrupt cycles, and never include the root ID.
- [ ] **Step 6: Run GREEN and commit.** Run focused tests and `npm run test:sysml`. Commit `feat(sysml): enforce requirement containment semantics`.

### Task 3: Add correct deletion, impact-preview, and undo behavior

**Files:**
- Modify: `src/engine/sysml/mutations.ts`
- Modify: `src/engine/sysml/mutations.test.ts`
- Modify: `src/services/sysmlTransactionAdapter.ts`
- Modify: `src/services/sysmlTransactionAdapter.test.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`

**Interfaces:**
- Extends: `MutationImpact` with `nestedRequirementIds: string[]` and `removedRelationshipIds: string[]`.
- Consumes: `getNestedRequirementIds`.

- [ ] **Step 1: Write failing lifecycle tests.** Assert that model-deleting a container deletes all nested requirements recursively, containment edges, relationships touching deleted requirements, associated current evidence, and RTM rows; unrelated requirements and suppliers survive.
- [ ] **Step 2: Add non-cascade tests.** Assert that deleting only the containment edge preserves parent/child; `deriveReqt`, `satisfy`, `verify`, `refine`, `trace`, and `copy` never delete their opposite endpoint; BDD composition continues preserving connected BlockDefinitions.
- [ ] **Step 3: Add confirmation and transaction tests.** Assert preview lists the complete subtree before mutation, cancellation changes no revision, confirmed deletion makes exactly one revision/audit record, and one undo restores the exact repository.
- [ ] **Step 4: Run RED.** Run `npx vitest run src/engine/sysml/mutations.test.ts src/services/sysmlTransactionAdapter.test.ts src/services/sysmlCommandGateway.test.ts`; expect nested requirements to survive incorrectly.
- [ ] **Step 5: Extend the deletion closure.** In `analyzeMutation`, add descendants only when a requested/deleted element is a requirement container. Do not follow arbitrary relationships. Include all secondary effects in `MutationImpact` before confirmation.
- [ ] **Step 6: Run GREEN and commit.** Run focused tests and `npm run test:sysml`. Commit `fix(sysml): enforce requirement containment deletion lifecycle`.

### Task 4: Add contextual Requirement Diagram creation and notation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/sysml/RelationshipEndEditor.tsx`
- Modify: `src/components/sysml/RelationshipEndEditor.test.tsx`
- Modify: `src/utils/sysmlConnectionRouting.ts`
- Modify: `src/features/reporting/reportDiagramModel.ts`
- Modify: `src/features/reporting/reportDiagrams.ts`
- Modify: `src/features/reporting/reportDiagrams.sysml.test.ts`

**Interfaces:**
- Produces: visible relationship label `Requirement Containment`, canonical value `requirementContainment`, and notation identifier `requirement-containment-crosshair`.

- [ ] **Step 1: Write failing component/report tests.** Assert the relationship selector includes `Requirement Containment`; it is enabled only when both endpoints are requirements; report SVG contains a circle-plus/crosshair marker at the container end and no composition diamond.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/components/sysml/RelationshipEndEditor.test.tsx src/features/reporting/reportDiagrams.sysml.test.ts`; expect the option and marker to be absent.
- [ ] **Step 3: Add contextual creation choice.** Replace the hard-coded requirement-to-requirement default with an explicit relationship chooser containing `Containment`, `deriveReqt`, `copy`, and `trace`. Keep `deriveReqt` as a selectable choice, not an implicit substitute for containment.
- [ ] **Step 4: Update the inspector.** Add:

```tsx
<option value="requirementContainment">
  Requirement Containment (parent → child)
</option>
```

Disable/reject it unless source and target are requirements. Show parent and child role labels in the inspector.
- [ ] **Step 5: Render SysML notation.** Add a dedicated SVG marker representing the containment circle with plus/crosshair at the source/container end. Reuse it in live canvas and generated reports; never render a filled composition diamond for requirement containment.
- [ ] **Step 6: Add accessible guidance.** The edge accessible name must state `Requirement containment: <parent> contains <child>` and expose validation errors without relying on color.
- [ ] **Step 7: Run GREEN and commit.** Run component/report tests and `npx tsc --noEmit`. Commit `feat(sysml): add requirement containment diagram tooling`.

### Task 5: Separate diagram removal from semantic model deletion

**Files:**
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/utils/adiaProjectPersistence.ts`
- Modify: `src/utils/adiaProjectPersistence.test.ts`

**Interfaces:**
- Adds: `{ type: 'removeFromDiagram'; diagramId: string; elementIds: string[] }` and persisted diagram membership.

- [ ] **Step 1: Write failing distinction tests.** Removing a parent or child symbol from the Requirement Diagram must preserve both requirements, containment, RTM rows, evidence, and repository revision; only presentation membership changes.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/services/sysmlCommandGateway.test.ts src/utils/adiaProjectPersistence.test.ts`; expect no diagram-membership command.
- [ ] **Step 3: Add presentation membership.** Persist `diagramPresentations[diagramId].elementIds` separately from `SysmlRepository`; semantic validation must not depend on whether an element is shown.
- [ ] **Step 4: Add explicit UI actions.** Provide `Remove from Diagram` and `Delete from Model…`. Keyboard Delete removes from diagram by default; model deletion requires the explicit command and impact confirmation.
- [ ] **Step 5: Verify save/load and undo.** Assert both presentation-only and semantic operations round-trip and undo independently without altering stable IDs.
- [ ] **Step 6: Run GREEN and commit.** Run focused tests and `npm run test:sysml`. Commit `feat(sysml): separate diagram removal from model deletion`.

### Task 6: Integrate RTM, reports, fixture, conformance evidence, and browser qualification

**Files:**
- Modify: `src/engine/sysml/rtm.test.ts`
- Modify: `src/engine/sysml/fixtures/representative-profile.json`
- Modify: `src/engine/sysml/profileFixture.test.ts`
- Modify: `src/engine/sysml/profile.ts`
- Modify: `src/engine/sysml/conformanceManifest.ts`
- Modify: `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`
- Modify: `tests/e2e/sysml-bdd-ibd-requirements-rtm.spec.ts`
- Modify: `tests/e2e/sysml-deletion-lifecycle.spec.ts`
- Modify: `tests/e2e/sysml-persistence-report.spec.ts`

**Interfaces:**
- Produces: executable capability `req.containment` and end-to-end evidence IDs for creation, notation, lifecycle, persistence, RTM, and report behavior.

- [ ] **Step 1: Add failing RTM and fixture tests.** Confirm containment creates requirement hierarchy but not satisfaction/verification coverage; nested requirements remain independent RTM rows; fixture coverage requires a three-level containment tree.
- [ ] **Step 2: Add failing browser creation test.** Through visible controls, create parent, child, and grandchild; choose Requirement Containment; verify notation, navigation, save/reload, and report output.
- [ ] **Step 3: Add failing browser lifecycle test.** Remove a parent symbol from the diagram and verify no semantic deletion; delete only the containment edge and verify both requirements survive; delete the parent from the model, inspect full impact, cancel once, confirm once, then undo/redo.
- [ ] **Step 4: Implement fixture/profile evidence.** Add `req.containment` to the profile and manifest with engine, UI, persistence, report, and E2E evidence. Keep its matrix status `partial` until all mandatory gates pass.
- [ ] **Step 5: Run the full qualification gate.** Run `npm run test:sysml:full-release`; require zero failures and zero skipped mandatory checks.
- [ ] **Step 6: Audit and promote.** Compare the current implementation against every constraint above. Promote `req.containment` to `supported` only after all evidence categories pass; otherwise record the exact limitation.
- [ ] **Step 7: Commit.** Commit `test(sysml): qualify requirement containment lifecycle`.

## Acceptance matrix

| Operation | Parent requirement | Nested requirement | Containment edge |
|---|---|---|---|
| Remove parent symbol from diagram | Preserved | Preserved | Preserved in model |
| Delete containment edge | Preserved | Preserved | Deleted |
| Delete nested requirement from model | Preserved | Deleted | Deleted |
| Re-home nested requirement | Preserved | Preserved under new parent | Old edge replaced |
| Delete container requirement from model | Deleted | Recursively deleted | Deleted |
| Cancel container deletion | Preserved | Preserved | Preserved |
| Undo confirmed container deletion | Restored | Entire subtree restored | Restored |

## Final acceptance criteria

- `Requirement Containment` appears as a dedicated relationship type in the Requirement Diagram.
- It is distinct from BDD composition in types, validation, rendering, migration, and lifecycle behavior.
- The source/container and target/child direction is unambiguous in UI and reports.
- Multiple ownership, self-containment, and direct/transitive cycles are rejected before commit.
- Diagram removal, relationship deletion, and semantic model deletion have separate outcomes.
- Container model deletion cascades only through the nested-requirement containment subtree after complete impact confirmation.
- Every non-containment requirement relationship preserves its connected peer when deleted.
- Save/load, undo/redo, RTM, evidence, reports, and browser behavior remain consistent.
- The conformance matrix makes no `supported` claim until the complete release gate proves it.
