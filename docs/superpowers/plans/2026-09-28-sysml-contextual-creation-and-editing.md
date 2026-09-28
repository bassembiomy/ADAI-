# SysML Contextual Creation and Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SysML port creation, relationship-property editing, and contextual element ownership consistent across canvas, tree, and diagram projections.

**Architecture:** A pure context resolver chooses the semantic owner from the active diagram and its context. Canvas and tree actions share semantic creation commands; selected-property edits go through the gateway with validation before repository mutation. Diagram canvases and the model tree remain projections of the canonical repository.

**Tech Stack:** React, TypeScript, Vitest, Playwright, SysML repository/command gateway.

## Global Constraints

- No canvas-only semantic objects or direct UI mutation that bypasses the command gateway.
- No silent type creation or automatic first-candidate selection.
- No owner picker. Use the owner rules below; reject with a diagnostic only when required contextual ownership is missing or invalid.
- Validate multiplicity syntax and relationship-specific constraints before persistence. Fields that are not defined for a relationship kind are not shown as editable fields for that relationship.
- Preserve current user data and unrelated local changes; avoid broad migration or repository redesign.
- Do not add SysML metaclasses or relax SysML v1.6 constraints.

## File Map

- `src/services/sysmlDiagramCreationContext.ts` (new): pure resolution of diagram kind, active context, and semantic owner.
- `src/services/sysmlDiagramCreationContext.test.ts` (new): owner-resolution cases and invalid-context diagnostics.
- `src/services/sysmlDiagramCreation.ts` and `src/services/sysmlDiagramCreation.test.ts`: continue validating creation requests against the resolved owner and active diagram.
- `src/services/sysmlOwnedFeatureCommands.ts` and its tests: shared semantic port/property command builders and type-selection behavior.
- `src/services/sysmlPropertyCommands.ts` and `src/services/sysmlPropertyCommands.test.ts`: normalize relationship-end field updates before gateway validation.
- `src/components/sysml/PortKindActions.tsx` and `PortKindActions.test.tsx` (new): shared explicit buttons for Standard, Flow, Proxy, and Full port creation.
- Delete: `src/components/sysml/PortToolMenu.tsx` and `PortToolMenu.test.tsx`, since the placement-mode menu is no longer used.
- `src/components/sysml/RelationshipEndEditor.tsx` and its tests: editable supported relationship properties and validated input behavior.
- `src/App.tsx`: route canvas creation, selected-context defaults, and inspector edits through the shared services and command gateway.
- `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts` and tests: retain tree parity with canvas semantic creation.
- `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts` or a focused new Playwright spec: verify persistence and projections across the active diagrams.

---

### Task 1: Resolve the default semantic owner from diagram context

**Files:**
- Create: `src/services/sysmlDiagramCreationContext.ts`
- Test: `src/services/sysmlDiagramCreationContext.test.ts`
- Read-only reference: `src/engine/sysml/model.ts` for `ModelDiagramDefinition`, package and block ownership types

**Interface:**

```ts
export interface SysmlDiagramCreationContext {
  diagramId: string;
  diagramKind: 'bdd' | 'ibd' | 'requirements' | 'package' | string;
  contextElementId?: string;
}

export type SysmlCreationOwnerResult =
  | { ok: true; ownerId: string }
  | { ok: false; diagnostic: { code: 'OWNER_CONTEXT_REQUIRED' | 'OWNER_NOT_FOUND'; message: string } };

export function resolveSysmlCreationOwner(
  repository: SysmlRepository,
  context: SysmlDiagramCreationContext,
): SysmlCreationOwnerResult;
```

Owner policy: IBD requires a real Block `contextElementId`; Package Diagram uses its owning Package or `model`; BDD and Requirements use an explicitly owned diagram's owner or `model`.

- [ ] **Step 1: Write failing tests** for IBD Block context, IBD missing/invalid context, Package Diagram owner, root BDD/Requirements fallback, and explicit owner on a non-root diagram.
- [ ] **Step 2: Verify red** with `npx vitest run src/services/sysmlDiagramCreationContext.test.ts`; expect import/export or missing-behavior failures for the new resolver.
- [ ] **Step 3: Implement the pure resolver** using only repository diagrams, packages, and definitions; do not create or mutate entities.
- [ ] **Step 4: Verify green** with `npx vitest run src/services/sysmlDiagramCreationContext.test.ts src/services/sysmlDiagramCreation.test.ts`.

### Task 2: Use contextual ownership for canvas element and Part creation

**Files:**
- Modify: `src/App.tsx` creation handlers around `createSysmlElementOnActiveDiagram`, `createPart`, and the right-click duplicate handler
- Modify: `src/services/sysmlDiagramCreation.ts`
- Test: `src/services/sysmlDiagramCreation.test.ts`
- Integration test: `tests/e2e/sysml-contextual-creation-editing.spec.ts`

**Consumes:** `resolveSysmlCreationOwner(repository, context)` from Task 1.

**Produces:** Each canvas create request passes the resolved `ownerId` to `buildDiagramCreationCommand`; Part creation uses the active Block context by default and retains explicit compatible type selection.

- [ ] **Step 1: Add failing service tests** proving a Block created on a Package Diagram is owned by the diagram's Package and invalid IBD context returns `OWNER_CONTEXT_REQUIRED` without a command.
- [ ] **Step 2: Verify red** with `npx vitest run src/services/sysmlDiagramCreation.test.ts`.
- [ ] **Step 3: Update canvas handlers** to call the resolver. In an IBD, use the current Block as Part owner without an owner-selection prompt; keep the existing type chooser when an explicit Block type is required. Route right-click duplicate through the same resolved owner path.
- [ ] **Step 4: Verify green** with `npx vitest run src/services/sysmlDiagramCreation.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx`.

### Task 3: Make port-kind actions the single canvas creation path

**Files:**
- Modify: `src/App.tsx` port controls and `handleBlockMouseDown`
- Create: `src/components/sysml/PortKindActions.tsx` and `PortKindActions.test.tsx`
- Delete: `src/components/sysml/PortToolMenu.tsx` and `PortToolMenu.test.tsx`
- Test: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`
- Test: `src/components/modelExplorer/AppModelExplorer.commands.test.tsx`

**Behavior:** Remove the separate `Port ▼` placement-mode control from the BDD. Keep named port-kind buttons (`Standard`, `Flow`, `Proxy`, `Full`); selecting a Block and using one invokes the same `createOwnedFeature` command path as tree creation. The canvas action requires an explicit selected Block; it must not select the first compatible type automatically. Standard UML Port remains untyped when permitted. Typed port kinds retain compatible-type selection and `TYPE_NOT_FOUND`/`CreateNewType` behavior.

`PortKindActions` accepts `{ onAddPort: (kind: 'standard' | 'flow' | 'proxy' | 'full') => void }` and renders one button per kind.

- [ ] **Step 1: Write failing component tests** proving `PortKindActions` renders four named actions and calls the matching callback for the requested kind; add adapter assertions for selected owner and preserved type-selection response.
- [ ] **Step 2: Verify red** with `npx vitest run src/components/sysml/PortKindActions.test.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx`.
- [ ] **Step 3: Remove the dropdown component** and its active-tool click-on-canvas path from BDD. Keep shared port-kind callbacks for explicit buttons and tree commands; do not remove IBD/property-inspector port editing.
- [ ] **Step 4: Verify green** with `npx vitest run src/components/sysml/PortKindActions.test.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx` and `npx tsc --noEmit`.

### Task 4: Persist editable relationship-end properties through validated commands

**Files:**
- Modify: `src/App.tsx` `updateRelationship` and relationship inspector mapping
- Modify: `src/services/sysmlPropertyCommands.ts`
- Test: `src/services/sysmlPropertyCommands.test.ts`
- Test: `src/components/sysml/RelationshipEndEditor.test.tsx`
- Reference: `src/services/sysmlCommandGateway.ts` update-element staging/validation path

**Behavior:** Preserve edits for relationship `name`, `kind`, source/target role names, source/target multiplicity, navigability, and aggregation wherever legal for that relationship kind. Parse multiplicity text into canonical `Multiplicity` before dispatch. Keep immutable `sourceId`/`targetId` unchanged unless the user explicitly invokes an endpoint-reversal action. Invalid edits must be rejected atomically by gateway validation and leave the stored relationship unchanged.

- [ ] **Step 1: Add failing tests** for relationship update command construction with role names and multiplicities; assert text `0..*` becomes `{ lower: 0, upper: '*', ordered: false, unique: true }` and invalid text is rejected before dispatch.
- [ ] **Step 2: Verify red** with `npx vitest run src/services/sysmlPropertyCommands.test.ts src/components/sysml/RelationshipEndEditor.test.tsx`.
- [ ] **Step 3: Implement relationship-specific normalization** in `src/services/sysmlPropertyCommands.ts`, parsing `sourceMultiplicity` and `targetMultiplicity` before constructing the `updateElement` command. Include `name`, `kind`, source/target role names, source/target multiplicities, navigability, and aggregation in `src/App.tsx` `updateRelationship`. Ensure non-relationship Part usage updates retain existing mirrored usage/property behavior.
- [ ] **Step 4: Add a gateway persistence test** in `src/services/sysmlCommandGateway.test.ts` that dispatches a valid relationship update and checks the canonical repository; dispatch an invalid multiplicity/constraint update and assert `committed === false` and the original record is unchanged.
- [ ] **Step 5: Verify green** with `npx vitest run src/services/sysmlPropertyCommands.test.ts src/components/sysml/RelationshipEndEditor.test.tsx src/services/sysmlCommandGateway.test.ts`.

### Task 5: Verify repository identity and diagram/tree projections end to end

**Files:**
- Create: `tests/e2e/sysml-contextual-creation-editing.spec.ts`
- Reference: `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts`
- Verify: `src/engine/sysml/normalizedStore.test.ts`

- [ ] **Step 1: Add a browser scenario** creating a port from a selected BDD Block, then confirm its tree node and Block feature list share one semantic ID and the correct owner/type.
- [ ] **Step 2: Add a browser scenario** creating a Part in the active Block IBD, editing an applicable multiplicity/role field, switching to another relevant diagram, and confirming repository-backed name/field values remain consistent.
- [ ] **Step 3: Exercise persistence** by saving/reloading through the application's real project persistence path and asserting owner, port type, relationship endpoint IDs, role names, and multiplicity survive.
- [ ] **Step 4: Run focused verification:** `npx vitest run src/services/sysmlDiagramCreationContext.test.ts src/services/sysmlDiagramCreation.test.ts src/services/sysmlPropertyCommands.test.ts src/components/sysml/RelationshipEndEditor.test.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx`.
- [ ] **Step 5: Run integration verification:** `npx playwright test tests/e2e/sysml-contextual-creation-editing.spec.ts`, `npx tsc --noEmit`, and `npm run build`.

## Plan Self-Review

- Port menu removal, selected-Block port creation, explicit type selection, and tree parity are covered by Task 3.
- IBD contextual ownership, diagram owner defaults, no owner chooser, and Part type selection are covered by Tasks 1–2.
- Editable applicable relationship fields, canonical parsing, constraint validation, endpoint identity, and atomic rejection are covered by Task 4.
- Repository/tree/diagram identity and real persistence are covered by Task 5.
- All task APIs match the pure resolver signature in Task 1; later tasks consume its `ownerId` or diagnostic result.
- No new dependency, metaclass, or non-semantic canvas state is introduced.
