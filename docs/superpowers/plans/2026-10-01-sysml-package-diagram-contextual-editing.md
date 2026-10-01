# SysML Package Diagram and Contextual Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make package diagrams, contextual element creation, Model Explorer, diagram canvases, and the property panel operate as one SysML v1.6/Cameo-aligned system backed exclusively by canonical commands and persisted repository state.

**Architecture:** Introduce one semantic interaction-context resolver for tree, canvas, and inspector actions, then route every mutation through the existing SysML command gateway. Build tree, canvas, and inspector state as projections of the canonical repository; retain legacy adapters only behind explicit compatibility boundaries until the final removal phase.

**Tech Stack:** TypeScript 5.4, React 18, Vitest 4, Testing Library, Playwright, Electron/Vite, ADIA canonical SysML repository and command gateway.

## Global Constraints

- The canonical SysML repository is the only writable model.
- Every user-visible mutation must have frontend wiring, domain/backend behavior, validation, undo/redo, persistence, and automated round-trip coverage.
- Tree, canvas, property panel, tabs, and breadcrumbs align by stable semantic ID, never by name or array position.
- A diagram presentation never changes semantic ownership.
- Property-panel actions target the panel-bound element; focused-canvas actions target the selected canvas element; otherwise tree actions target the selected tree element.
- When no legal owner is selected, disable the action with an explanation; do not open a parent-selection popup.
- Choosers remain only for distinct semantic references such as types, relationship endpoints, conveyed classifiers, or multiple diagram targets.
- Enforce SysML v1.6 semantics in domain/services; use Cameo only as an interaction-behavior reference where the specification does not define UI behavior.
- No enabled button or editable-looking field may be display-only.
- Preserve current project-file compatibility through versioned migrations and repository validation.

## Target File Structure

| File | Responsibility |
|---|---|
| `src/features/sysml/interactionContext.ts` | Resolve source-aware selection into a legal semantic owner and optional presentation target. |
| `src/features/sysml/interactionContext.test.ts` | Ownership precedence and invalid-context tests. |
| `src/features/sysml/contextualCreation.ts` | Convert interaction context plus creation intent into canonical commands/type-selection requests. |
| `src/features/sysml/contextualCreation.test.ts` | Cross-surface command parity tests. |
| `src/features/sysml/diagramCreationController.ts` | Atomic create-and-present/display-existing behavior. |
| `src/engine/sysml/capabilities/ownershipPolicy.ts` | SysML legal ownership rules used by every UI surface. |
| `src/features/modelExplorer/modelExplorerCapabilities.ts` | Explorer labels and legal diagram/relationship menu mapping. |
| `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts` | Explorer-to-command adapter only; no independent semantic state. |
| `src/features/modelExplorer/unifiedModelExplorerProjection.ts` | Complete repository-to-tree projection. |
| `src/features/modelExplorer/diagramTreeContext.ts` | Diagram-owner delegation and exact diagram target resolution. |
| `src/components/modelExplorer/AppModelExplorer.tsx` | Tree interaction wiring through shared context and command gateway. |
| `src/services/sysmlDiagramNavigation.ts` | Exact diagram navigation/back-stack recovery. |
| `src/features/sysml/inspectorSchema.ts` | Editable/read-only field and action schemas by metaclass. |
| `src/features/sysml/inspectorSchema.test.ts` | Schema completeness and command-binding tests. |
| `src/components/sysml/SysmlPropertyPanel.tsx` | Generic schema-driven canonical inspector. |
| `src/components/sysml/SysmlPropertyPanel.test.tsx` | Field/action interaction tests. |
| `src/engine/sysml/commands/types.ts` | Typed semantic, relationship, and presentation update commands. |
| `src/engine/sysml/commands/dispatcher.ts` | Atomic dispatch and validation. |
| `src/services/sysmlCommandGateway.ts` | Application transaction, history, persistence-projection boundary. |
| `src/engine/sysml/persistence.ts` | Repository/presentation round-trip and migration. |
| `src/App.tsx` | Composition only; remove direct legacy SysML mutations phase by phase. |

---

### Task 1: Shared Semantic Interaction Context and Capability Guardrails

**Files:**
- Create: `src/features/sysml/interactionContext.ts`
- Create: `src/features/sysml/interactionContext.test.ts`
- Modify: `src/engine/sysml/capabilities/ownershipPolicy.ts`
- Modify: `src/engine/sysml/capabilities/ownershipPolicy.test.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx:102-220`
- Modify: `src/components/modelExplorer/AppModelExplorer.test.tsx`

**Interfaces:**
- Produces: `resolveInteractionContext(input: InteractionContextInput): ResolvedInteractionContext`.
- Produces: `ResolvedInteractionContext = { status: 'resolved'; ownerId: string; source: InteractionSource; diagramId?: string } | { status: 'disabled'; code: string; reason: string }`.
- Consumes: canonical repository, active diagram selection, tree selection, and inspector-bound ID.

- [ ] **Step 1: Write failing precedence and legality tests**

```ts
it.each([
  [{ source: 'propertyPanel', inspectorElementId: 'block-b', canvasElementId: 'block-a', treeElementId: 'block-c' }, 'block-b'],
  [{ source: 'canvas', canvasElementId: 'block-a', treeElementId: 'block-c' }, 'block-a'],
  [{ source: 'tree', treeElementId: 'block-c' }, 'block-c'],
])('resolves %o to %s', (selection, ownerId) => {
  expect(resolveInteractionContext({ repository, requestedMetaclass: 'Port', ...selection }))
    .toMatchObject({ status: 'resolved', ownerId });
});

it('delegates a diagram row to the diagram semantic owner', () => {
  expect(resolveInteractionContext({ repository, source: 'tree', treeElementId: 'pkg-diagram', requestedMetaclass: 'Block' }))
    .toMatchObject({ status: 'resolved', ownerId: 'pkg-1', diagramId: 'pkg-diagram' });
});

it('returns disabled guidance instead of requesting a parent', () => {
  expect(resolveInteractionContext({ repository, source: 'canvas', requestedMetaclass: 'Port' }))
    .toEqual({ status: 'disabled', code: 'LEGAL_OWNER_REQUIRED', reason: 'Select a Block to add a Port.' });
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run src/features/sysml/interactionContext.test.ts src/engine/sysml/capabilities/ownershipPolicy.test.ts`

Expected: FAIL because `resolveInteractionContext` and source-aware precedence do not exist.

- [ ] **Step 3: Implement the resolver as a pure domain-facing service**

```ts
export type InteractionSource = 'propertyPanel' | 'canvas' | 'tree';

export interface InteractionContextInput {
  repository: SysmlRepositoryV4;
  source: InteractionSource;
  requestedMetaclass: MetaclassKind;
  inspectorElementId?: string;
  canvasElementId?: string;
  treeElementId?: string;
}

export type ResolvedInteractionContext =
  | { status: 'resolved'; ownerId: string; source: InteractionSource; diagramId?: string }
  | { status: 'disabled'; code: 'LEGAL_OWNER_REQUIRED' | 'OWNER_NOT_FOUND' | 'ILLEGAL_OWNERSHIP'; reason: string };

export function resolveInteractionContext(input: InteractionContextInput): ResolvedInteractionContext {
  const selectedId = input.source === 'propertyPanel' ? input.inspectorElementId
    : input.source === 'canvas' ? input.canvasElementId
    : input.treeElementId;
  if (!selectedId) return disabledSelection(input.requestedMetaclass);
  const diagram = input.repository.diagrams[selectedId];
  const ownerId = diagram?.ownerId ?? selectedId;
  const owner = resolveSemanticElement(input.repository, ownerId);
  if (!owner) return { status: 'disabled', code: 'OWNER_NOT_FOUND', reason: `Owner ${ownerId} no longer exists.` };
  const decision = evaluateOwnership(owner, input.requestedMetaclass);
  return decision.allowed
    ? { status: 'resolved', ownerId, source: input.source, ...(diagram ? { diagramId: diagram.id } : {}) }
    : { status: 'disabled', code: 'ILLEGAL_OWNERSHIP', reason: decision.message! };
}
```

- [ ] **Step 4: Replace explorer-only owner calculations with the shared resolver**

Keep `resolveCreationContext` temporarily as a compatibility wrapper, but make it call `resolveInteractionContext`. Convert resolver failures into disabled `ExplorerCapability.reason` values rather than dialogs.

- [ ] **Step 5: Run focused and architecture tests**

Run: `npx vitest run src/features/sysml/interactionContext.test.ts src/components/modelExplorer/AppModelExplorer.test.tsx src/engine/sysml/architectureGuards.test.ts`

Expected: PASS; no tree or diagram-row command uses a diagram as semantic owner.

- [ ] **Step 6: Commit**

```bash
git add src/features/sysml/interactionContext.ts src/features/sysml/interactionContext.test.ts src/engine/sysml/capabilities/ownershipPolicy.ts src/engine/sysml/capabilities/ownershipPolicy.test.ts src/components/modelExplorer/AppModelExplorer.tsx src/components/modelExplorer/AppModelExplorer.test.tsx
git commit -m "feat(sysml): resolve creation context across UI surfaces"
```

### Task 2: Complete Package Diagram Creation and Exact Navigation

**Files:**
- Modify: `src/features/modelExplorer/modelExplorerCapabilities.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts:680-1060`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`
- Modify: `src/features/sysml/diagramCreationController.ts`
- Modify: `src/features/sysml/diagramCreationController.test.ts`
- Modify: `src/features/modelExplorer/diagramTreeContext.ts`
- Modify: `src/features/modelExplorer/diagramTreeContext.test.ts`
- Modify: `src/services/sysmlDiagramNavigation.ts`
- Modify: `src/services/sysmlDiagramNavigation.test.ts`
- Modify: `src/App.tsx:7575-7635,6249-6440,20774-20835`
- Test: `tests/e2e/model-explorer-diagram-grouping.spec.ts`
- Test: `tests/e2e/sysml-bdd-package-navigation-parity.spec.ts`

**Interfaces:**
- Consumes: `ResolvedInteractionContext` from Task 1.
- Produces: repository diagram IDs passed unchanged through tree nodes, tabs, breadcrumbs, chooser, and navigation stack.
- Preserves: `createElementOnDiagram` and `addExistingElementToDiagram` atomic behavior.

- [ ] **Step 1: Add failing tests for the complete package-diagram lifecycle**

```ts
it('offers Package Diagram only on Model and Package owners', () => {
  expect(diagramKindsFor(repository, 'model')).toContain('package');
  expect(diagramKindsFor(repository, 'pkg-1')).toContain('package');
  expect(diagramKindsFor(repository, 'block-1')).not.toContain('package');
});

it('creates and opens the exact repository diagram', () => {
  const result = adapter.execute({ type: 'createDiagram', ownerId: 'pkg-1', diagramKind: 'package', name: 'Interfaces' });
  expect(result.committed).toBe(true);
  expect(harness.state.repository.diagrams[result.selectedIds![0]]).toMatchObject({ ownerId: 'pkg-1', diagramKind: 'package' });
  expect(openExactDiagram(initial, result.selectedIds![0], harness.state.repository).activeDiagramId)
    .toBe(result.selectedIds![0]);
});
```

- [ ] **Step 2: Run focused tests and verify the missing behavior**

Run: `npx vitest run src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/features/sysml/diagramCreationController.test.ts src/features/modelExplorer/diagramTreeContext.test.ts src/services/sysmlDiagramNavigation.test.ts`

Expected: at least one new lifecycle assertion fails before wiring is complete.

- [ ] **Step 3: Centralize package-diagram eligibility and command construction**

```ts
export function allowedDiagramKinds(owner: SemanticElement): DiagramKind[] {
  if (owner.metaclass === 'Model' || owner.metaclass === 'Package') {
    return ['bdd', 'requirements', 'rtm', 'package'];
  }
  if (owner.metaclass === 'Block') return ['ibd', 'bdd', 'stateMachine'];
  return [];
}
```

Use this function from both Model Explorer capabilities and `App.tsx`; remove duplicated package-specific enablement conditions.

- [ ] **Step 4: Make creation one repository transaction and open by returned ID**

Dispatch one typed create-diagram command, update the gateway state, then feed `result.selectedIds[0]` to `openExactDiagram`. Do not use `'package'` as a pseudo-ID and do not derive identity from a mode string.

- [ ] **Step 5: Implement deterministic navigation target selection**

Explicit diagram references win, a unique owned diagram opens directly, and multiple candidates are sorted by `(name, id)` before the chooser renders. Back navigation stores `{ diagramId, diagramKind, contextElementId }` exactly.

- [ ] **Step 6: Add Playwright coverage**

```ts
test('creates a package diagram from a package and restores exact navigation', async ({ page }) => {
  await createPackageFromTree(page, 'Powertrain');
  await createDiagramFromTree(page, 'Powertrain', 'Package Diagram');
  const diagramId = await activeDiagramId(page);
  await page.reload();
  await openTreeDiagram(page, diagramId);
  await expect(page.locator('[data-active-diagram-id]')).toHaveAttribute('data-active-diagram-id', diagramId);
});
```

- [ ] **Step 7: Run package/navigation verification**

Run: `npx vitest run src/features/modelExplorer src/features/sysml/diagramCreationController.test.ts src/services/sysmlDiagramNavigation.test.ts`

Run: `npx playwright test tests/e2e/model-explorer-diagram-grouping.spec.ts tests/e2e/sysml-bdd-package-navigation-parity.spec.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/modelExplorer src/features/sysml/diagramCreationController.ts src/features/sysml/diagramCreationController.test.ts src/services/sysmlDiagramNavigation.ts src/services/sysmlDiagramNavigation.test.ts src/App.tsx tests/e2e/model-explorer-diagram-grouping.spec.ts tests/e2e/sysml-bdd-package-navigation-parity.spec.ts
git commit -m "feat(sysml): complete package diagram lifecycle"
```

### Task 3: Context-Aware Creation Without Redundant Parent Prompts

**Files:**
- Create: `src/features/sysml/contextualCreation.ts`
- Create: `src/features/sysml/contextualCreation.test.ts`
- Modify: `src/services/sysmlOwnedFeatureCommands.ts`
- Modify: `src/services/sysmlOwnedFeatureCommands.test.ts`
- Modify: `src/components/sysml/BlockFeatureEditor.tsx`
- Modify: `src/components/sysml/BlockFeatureEditor.test.tsx`
- Modify: `src/components/sysml/PortKindActions.tsx`
- Modify: `src/components/sysml/PortKindActions.test.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/App.tsx:10370-11230`
- Test: `tests/e2e/sysml-diagram-interaction-corrections.spec.ts`

**Interfaces:**
- Consumes: `ResolvedInteractionContext`.
- Produces: `planContextualCreation(input): { kind: 'command'; command: SysmlEditorCommand } | { kind: 'typeSelection'; request: TypeSelectionRequest } | { kind: 'disabled'; code: string; reason: string }`.
- Produces identical commands for tree, canvas, and property-panel invocation of the same intent.

- [ ] **Step 1: Write command-parity and no-parent-dialog tests**

```ts
it.each(['tree', 'canvas', 'propertyPanel'] as const)('creates a proxy port under the resolved block from %s', source => {
  const plan = planContextualCreation({ repository, source, selectedId: 'controller', intent: { metaclass: 'Port', portKind: 'proxyPort', typeId: 'control-if' } });
  expect(plan).toMatchObject({ kind: 'command', command: { type: 'createOwnedPort', ownerBlockId: 'controller', portKind: 'proxyPort', typeId: 'control-if' } });
});

it('does not request a parent when the property panel is bound to a block', () => {
  expect(planContextualCreation({ repository, source: 'propertyPanel', selectedId: 'controller', intent: { metaclass: 'Port', portKind: 'standardPort' } }).kind)
    .not.toBe('parentSelection');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/features/sysml/contextualCreation.test.ts src/components/sysml/BlockFeatureEditor.test.tsx src/components/sysml/PortKindActions.test.tsx`

Expected: FAIL because creation planning is split among UI handlers.

- [ ] **Step 3: Implement one creation planner**

```ts
export type ContextualCreationIntent =
  | { metaclass: 'Port'; portKind: CanonicalPortKind; typeId?: string; name?: string }
  | { metaclass: PropertyMetaclass; typeId?: string; name?: string }
  | { metaclass: 'Operation' | 'Constraint' | 'Parameter' | 'Activity' | 'Requirement' | 'TestCase' | 'UseCase'; name?: string };

export function planContextualCreation(input: ContextualCreationInput): ContextualCreationPlan {
  const context = resolveInteractionContext(toResolverInput(input));
  if (context.status === 'disabled') return { kind: 'disabled', code: context.code, reason: context.reason };
  return buildOwnedElementPlan(input.repository, context.ownerId, input.intent, context.diagramId);
}
```

- [ ] **Step 4: Route BDD toolbar/canvas and block inspector buttons through the planner**

Replace parent-selection state for direct child creation with `planContextualCreation`. Preserve the existing compatible-type prompt for typed ports/properties and the explicit create-new-type flow. Standard UML Port remains the documented untyped exception.

- [ ] **Step 5: Extend the path to all supported owned elements**

Use the same planner for properties, operations, constraints, parameters, pins, actions, states, regions, requirements, test cases, and use cases. Unsupported metaclasses return `UNSUPPORTED_ELEMENT_KIND`; illegal owners return `ILLEGAL_OWNERSHIP`; neither mutates state.

- [ ] **Step 6: Add end-to-end parity assertions**

In `sysml-diagram-interaction-corrections.spec.ts`, create every port kind from canvas, tree, and property panel; assert the same `ownerId`, tree parent, inspector selection, undo/redo result, and save/reload result. Assert that no parent-selection dialog appears.

- [ ] **Step 7: Run verification**

Run: `npx vitest run src/features/sysml/contextualCreation.test.ts src/services/sysmlOwnedFeatureCommands.test.ts src/components/sysml/BlockFeatureEditor.test.tsx src/components/sysml/PortKindActions.test.tsx`

Run: `npx playwright test tests/e2e/sysml-diagram-interaction-corrections.spec.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/sysml/contextualCreation.ts src/features/sysml/contextualCreation.test.ts src/services/sysmlOwnedFeatureCommands.ts src/services/sysmlOwnedFeatureCommands.test.ts src/components/sysml/BlockFeatureEditor.tsx src/components/sysml/BlockFeatureEditor.test.tsx src/components/sysml/PortKindActions.tsx src/components/sysml/PortKindActions.test.tsx src/components/modelExplorer/AppModelExplorer.tsx src/App.tsx tests/e2e/sysml-diagram-interaction-corrections.spec.ts
git commit -m "feat(sysml): create owned elements from active context"
```

### Task 4: Repository-Complete Model Explorer Projection and Selection Alignment

**Files:**
- Modify: `src/features/modelExplorer/unifiedModelExplorerProjection.ts`
- Modify: `src/features/modelExplorer/unifiedModelExplorerProjection.test.ts`
- Modify: `src/features/modelExplorer/modelExplorerTypes.ts`
- Modify: `src/features/modelExplorer/diagramTreeContext.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.test.tsx`
- Modify: `src/services/sysmlPropertyUsageSync.ts`
- Modify: `src/services/sysmlPropertyUsageSync.test.ts`
- Test: `tests/e2e/model-explorer-sysml.spec.ts`
- Test: `tests/e2e/sysml-state-requirement-cross-diagram.spec.ts`

**Interfaces:**
- Consumes every canonical repository collection and state-machine semantic snapshot.
- Produces exactly one semantic tree node per semantic ID plus explicitly identified diagram-view grouping nodes.
- Produces `SelectionOrigin = 'tree' | 'canvas' | 'propertyPanel' | 'breadcrumb' | 'tab'` and a shared semantic selection ID.

- [ ] **Step 1: Write a complete projection contract test**

```ts
it('projects structural, behavioral, requirement, and relationship elements', () => {
  const projection = buildUnifiedModelProjection(fullRepositoryFixture);
  for (const id of ['port-1', 'property-1', 'operation-1', 'connector-1', 'connector-end-a', 'item-flow-1', 'allocate-1', 'transition-1', 'activity-edge-1', 'satisfy-1']) {
    expect(projection.nodes[`sysml:element:${id}`], id).toBeDefined();
  }
});

it('nests by semantic owner even when presented on another diagram', () => {
  expect(projection.nodes['sysml:element:port-1'].ownerSemanticId).toBe('block-1');
  expect(projection.nodes['sysml:element:port-1'].parentNodeId).toBe('sysml:element:block-1');
});
```

- [ ] **Step 2: Run projection tests and capture missing collections**

Run: `npx vitest run src/features/modelExplorer/unifiedModelExplorerProjection.test.ts src/services/sysmlPropertyUsageSync.test.ts`

Expected: FAIL for relationship, connector-end, item-flow, and behavior nodes not currently projected.

- [ ] **Step 3: Add focused projector functions**

Add four focused functions with these exact signatures: `projectOwnedFeature(feature: SemanticElement, ownerId: string): ModelTreeNode`, `projectRelationship(relationship: SemanticRelationship): ModelTreeNode`, `projectItemFlow(flow: ItemFlow): ModelTreeNode`, and `projectBehaviorElement(element: BehaviorElement): ModelTreeNode`. Each function must set `nodeId` to `sysml:element:${id}`, retain the semantic owner in `ownerSemanticId`, and generate its secondary label exclusively from referenced canonical IDs.

Keep diagram grouping separate from containment: grouping nodes may reference semantic nodes but must not replace their semantic parent.

- [ ] **Step 4: Unify selection synchronization**

Update `AppModelExplorer` and `App.tsx` so all surfaces publish semantic IDs into one selection state. If the selected element has no presentation in the active diagram, retain tree/inspector selection and expose an “outside active view” state instead of selecting a similarly named symbol.

- [ ] **Step 5: Add navigation tests for relationship endpoints**

Double-clicking or invoking Reveal on a relationship endpoint selects its semantic target, opens an exact diagram only when a deterministic target exists, and preserves the original diagram on the back stack.

- [ ] **Step 6: Run verification**

Run: `npx vitest run src/features/modelExplorer src/services/sysmlPropertyUsageSync.test.ts`

Run: `npx playwright test tests/e2e/model-explorer-sysml.spec.ts tests/e2e/sysml-state-requirement-cross-diagram.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/modelExplorer src/components/modelExplorer/AppModelExplorer.tsx src/components/modelExplorer/AppModelExplorer.test.tsx src/services/sysmlPropertyUsageSync.ts src/services/sysmlPropertyUsageSync.test.ts tests/e2e/model-explorer-sysml.spec.ts tests/e2e/sysml-state-requirement-cross-diagram.spec.ts
git commit -m "feat(sysml): project complete repository in model explorer"
```

### Task 5: Typed, Schema-Driven Property Panel With Real Commands

**Files:**
- Create: `src/features/sysml/inspectorSchema.ts`
- Create: `src/features/sysml/inspectorSchema.test.ts`
- Create: `src/components/sysml/SysmlPropertyPanel.tsx`
- Create: `src/components/sysml/SysmlPropertyPanel.test.tsx`
- Modify: `src/engine/sysml/commands/types.ts`
- Modify: `src/engine/sysml/commands/elementCommands.ts`
- Modify: `src/engine/sysml/commands/relationshipCommands.ts`
- Modify: `src/engine/sysml/commands/dispatcher.test.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/App.tsx:19080-20550`
- Modify: `src/components/sysml/BlockFeatureEditor.tsx`
- Modify: `src/components/sysml/BlockPropertiesEditor.tsx`

**Interfaces:**
- Produces: `getInspectorSchema(selection: InspectorSelection): InspectorSchema`.
- Produces: `InspectorField = { key; label; valueType; mode: 'editable' | 'readOnly'; readOnlyReason?; validate; toCommand? }`.
- Produces: `InspectorAction = { id; label; enabled; disabledReason?; toCommand? }`.
- Consumes typed `UpdateElement`, `UpdateRelationship`, and presentation commands only.

- [ ] **Step 1: Write schema completeness tests**

```ts
it.each(supportedInspectorFixtures)('$metaclass exposes no fake editable controls', ({ selection }) => {
  const schema = getInspectorSchema(selection);
  for (const field of schema.fields) {
    if (field.mode === 'editable') expect(field.toCommand).toBeTypeOf('function');
    if (field.mode === 'readOnly') expect(field.readOnlyReason).toBeTruthy();
  }
  for (const action of schema.actions.filter(action => action.enabled)) {
    expect(action.toCommand).toBeTypeOf('function');
  }
});
```

- [ ] **Step 2: Write atomic update tests**

```ts
it('updates a connector nested end and preserves the opposite end', () => {
  const result = dispatchSysmlCommand(repository, {
    type: 'UpdateRelationship', relationshipId: 'connector-1',
    patch: { sourceEnd: { id: 'end-a', roleId: 'port-a', nestedPath: ['part-a', 'port-a'] } },
  }, { source: 'ui' });
  expect(result.success).toBe(true);
  expect(result.state.relationships['connector-1'].targetEnd).toEqual(repository.relationships['connector-1'].targetEnd);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npx vitest run src/features/sysml/inspectorSchema.test.ts src/components/sysml/SysmlPropertyPanel.test.tsx src/engine/sysml/commands/dispatcher.test.ts`

Expected: FAIL because the generic schema and command bindings do not exist.

- [ ] **Step 4: Define metaclass field/action schemas**

Cover packages, diagrams, classifiers, properties, all port kinds, requirements/test cases, relationships, connector ends, item/information flows, allocations, activities, states/transitions, and presentations. Include identity/naming, ownership when movable, type, multiplicity, direction, conjugation, aggregation, values/units, inheritance, endpoints, nested paths, conveyed classifiers, requirement attributes, behavioral guard/trigger/effect, documentation, and presentation bounds/style.

- [ ] **Step 5: Implement debounced/coalesced canonical updates**

Text fields dispatch typed updates with the existing `coalesceKey`; selects and toggles commit immediately. Validation runs before commit, and a rejected command keeps the prior value while rendering its stable diagnostic beside the field.

- [ ] **Step 6: Replace conditional `App.tsx` SysML editor branches**

Render `SysmlPropertyPanel` for canonical SysML selections. Keep state-machine-specific panels only until their repository-backed schemas are ready in Task 6. Remove direct array setters from migrated SysML fields.

- [ ] **Step 7: Verify field round trips**

Run: `npx vitest run src/features/sysml/inspectorSchema.test.ts src/components/sysml/SysmlPropertyPanel.test.tsx src/components/sysml/BlockFeatureEditor.test.tsx src/components/sysml/BlockPropertiesEditor.test.tsx src/engine/sysml/commands`

Expected: PASS; every editable field maps to a command, and derived fields are visibly read-only.

- [ ] **Step 8: Commit**

```bash
git add src/features/sysml/inspectorSchema.ts src/features/sysml/inspectorSchema.test.ts src/components/sysml/SysmlPropertyPanel.tsx src/components/sysml/SysmlPropertyPanel.test.tsx src/components/sysml/BlockFeatureEditor.tsx src/components/sysml/BlockPropertiesEditor.tsx src/engine/sysml/commands src/services/sysmlCommandGateway.ts src/App.tsx
git commit -m "feat(sysml): add command-backed property inspector"
```

### Task 6: First-Class Relationships, Connections, and Behavioral Elements

**Files:**
- Modify: `src/engine/sysml/domain/relationships.ts`
- Modify: `src/engine/sysml/domain/behaviors.ts`
- Modify: `src/engine/sysml/commands/relationshipCommands.ts`
- Modify: `src/engine/sysml/commands/relationshipCommands.test.ts`
- Modify: `src/engine/sysml/connectionPolicy.ts`
- Modify: `src/engine/sysml/connectionPolicy.test.ts`
- Modify: `src/components/modelExplorer/RelationshipWizard.tsx`
- Modify: `src/components/modelExplorer/RelationshipWizard.test.tsx`
- Modify: `src/components/sysml/IbdConnectorEditor.tsx`
- Modify: `src/components/sysml/IbdConnectorEditor.test.tsx`
- Modify: `src/utils/stateMachine/smSemanticModel.ts`
- Modify: `src/utils/stateMachine/smSemanticModel.test.ts`
- Test: `tests/e2e/sysml-bdd-ibd-requirements-rtm.spec.ts`
- Test: `tests/e2e/sysml-state-requirement-cross-diagram.spec.ts`

**Interfaces:**
- Produces atomic `CreateRelationship` payloads with explicit ends and optional `ItemFlow` records.
- Produces repository-addressable behavior elements/relationships that the tree and inspector schemas can consume.

- [ ] **Step 1: Write failing relationship round-trip tests**

```ts
it('creates connector ends and item flow atomically', () => {
  const result = createConnectorTransaction(repository, {
    ownerId: 'system', sourceEnd: { roleId: 'out', nestedPath: ['sensor', 'out'] },
    targetEnd: { roleId: 'in', nestedPath: ['controller', 'in'] }, conveyedClassifierIds: ['signal'],
  });
  expect(result.success).toBe(true);
  expect(result.state.relationships[result.relationshipId]).toBeDefined();
  expect(result.state.itemFlows[result.itemFlowId!].realizingRelationshipId).toBe(result.relationshipId);
});
```

- [ ] **Step 2: Run relationship tests and verify failure**

Run: `npx vitest run src/engine/sysml/commands/relationshipCommands.test.ts src/engine/sysml/connectionPolicy.test.ts src/components/modelExplorer/RelationshipWizard.test.tsx src/components/sysml/IbdConnectorEditor.test.tsx`

Expected: FAIL for atomic end/item-flow creation and full editing.

- [ ] **Step 3: Add explicit endpoint and item-flow command payloads**

Validate role existence, nested paths, port compatibility, owner context, direction, conveyed classifier compatibility, and relationship-specific endpoints before one transaction commits.

- [ ] **Step 4: Route relationship wizards and canvas connectors through the same commands**

The wizard chooses only semantic references not implied by selection. Canvas-drawn connectors provide source/target from hit-tested semantic IDs. Both paths create identical repository records.

- [ ] **Step 5: Project behavioral relationships and enable inspector editing**

Ensure state transitions, activity edges, use-case relationships, requirement relations, allocations, connector ends, and item flows appear in Model Explorer and use Task 5 schemas. Keep state-machine persistence compatible while eliminating canvas-only relationship state.

- [ ] **Step 6: Run cross-diagram verification**

Run: `npx vitest run src/engine/sysml src/components/modelExplorer/RelationshipWizard.test.tsx src/components/sysml/IbdConnectorEditor.test.tsx src/utils/stateMachine/smSemanticModel.test.ts`

Run: `npx playwright test tests/e2e/sysml-bdd-ibd-requirements-rtm.spec.ts tests/e2e/sysml-state-requirement-cross-diagram.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine/sysml/domain src/engine/sysml/commands src/engine/sysml/connectionPolicy.ts src/engine/sysml/connectionPolicy.test.ts src/components/modelExplorer/RelationshipWizard.tsx src/components/modelExplorer/RelationshipWizard.test.tsx src/components/sysml/IbdConnectorEditor.tsx src/components/sysml/IbdConnectorEditor.test.tsx src/utils/stateMachine/smSemanticModel.ts src/utils/stateMachine/smSemanticModel.test.ts tests/e2e/sysml-bdd-ibd-requirements-rtm.spec.ts tests/e2e/sysml-state-requirement-cross-diagram.spec.ts
git commit -m "feat(sysml): make relationships repository-first"
```

### Task 7: Retire Parallel Writable UI State and Migrate Persistence

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/types/sysml_types.ts`
- Modify: `src/engine/sysml/normalizedStore.ts`
- Modify: `src/engine/sysml/normalizedStore.test.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlTransactionAdapter.ts`
- Modify: `src/services/sysmlTransactionAdapter.test.ts`
- Modify: `src/engine/sysml/persistence.ts`
- Modify: `src/engine/sysml/persistence.test.ts`
- Create: `src/engine/sysml/persistence/migrateContextualEditing.ts`
- Create: `src/engine/sysml/persistence/migrateContextualEditing.test.ts`
- Modify: `src/engine/sysml/oneWritableModel.test.ts`
- Modify: `src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts`
- Modify: `src/engine/sysml/repositoryPresentationReleaseGate.test.ts`

**Interfaces:**
- Consumes old supported project payloads.
- Produces the current canonical repository plus typed presentations with no writable legacy merge state.
- Preserves `buildCanonicalSysmlProjectPayload` and `loadCanonicalSysmlProject` as the save/load boundary.

- [ ] **Step 1: Strengthen the single-writable-model guard before deleting code**

```ts
it('rejects direct SysML array setters and legacy merge mutations in UI code', () => {
  const source = readFileSync('src/App.tsx', 'utf8');
  for (const forbidden of ['setBlocks(', 'setParts(', 'setConnectors(', 'setRelationships(']) {
    expect(source).not.toContain(forbidden);
  }
});
```

Scope the guard to SysML mutation sites; unrelated state-machine or view-only setters are not false positives.

- [ ] **Step 2: Run release gates and verify failure**

Run: `npx vitest run src/engine/sysml/oneWritableModel.test.ts src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts src/engine/sysml/repositoryPresentationReleaseGate.test.ts`

Expected: FAIL while legacy writable paths remain.

- [ ] **Step 3: Convert legacy arrays to memoized projections**

Replace writable `blocks`, `parts`, `connectors`, and `relationships` state with `useMemo` projections from the canonical repository only where legacy rendering still requires those shapes. Remove reverse merges and direct setters as each consumer moves to canonical selectors.

- [ ] **Step 4: Add a versioned migration**

```ts
export function migrateContextualEditingPayload(input: PersistedSysmlPayload): PersistedSysmlPayload {
  const repository = migrateToCurrentRepository(input.repository);
  return { ...input, schemaVersion: CURRENT_SCHEMA_VERSION, repository, presentations: normalizePresentations(input.presentations, repository) };
}
```

Migrate diagram identity, owner references, relationship ends, item flows, and presentations; reject irrecoverable dangling references with stable diagnostics rather than silently inventing elements.

- [ ] **Step 5: Prove save/load/undo identity**

Test that create, edit, relationship creation, presentation move, undo, redo, save, and reload preserve semantic IDs, diagram IDs, owner IDs, field values, and presentation bounds.

- [ ] **Step 6: Run full repository and persistence verification**

Run: `npx vitest run src/engine/sysml/persistence src/engine/sysml/persistence.test.ts src/engine/sysml/normalizedStore.test.ts src/services/sysmlTransactionAdapter.test.ts src/engine/sysml/oneWritableModel.test.ts src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts src/engine/sysml/repositoryPresentationReleaseGate.test.ts`

Expected: PASS; no active UI mutation bypasses the gateway.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/types/sysml_types.ts src/engine/sysml/normalizedStore.ts src/engine/sysml/normalizedStore.test.ts src/services/sysmlCommandGateway.ts src/services/sysmlTransactionAdapter.ts src/services/sysmlTransactionAdapter.test.ts src/engine/sysml/persistence.ts src/engine/sysml/persistence.test.ts src/engine/sysml/persistence src/engine/sysml/oneWritableModel.test.ts src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts src/engine/sysml/repositoryPresentationReleaseGate.test.ts
git commit -m "refactor(sysml): retire parallel writable UI model"
```

### Task 8: End-to-End Release Certification and Documentation

**Files:**
- Create: `tests/e2e/sysml-package-contextual-editing.spec.ts`
- Modify: `tests/e2e/model-explorer-undo-persistence.spec.ts`
- Modify: `tests/e2e/sysml-persistence-report.spec.ts`
- Modify: `src/engine/sysml/conformanceManifest.ts`
- Modify: `src/engine/sysml/conformanceManifest.test.ts`
- Modify: `scripts/verify_sysml_architecture.ts`
- Modify: `scripts/verify_sysml_release.ts`
- Modify: `SYSML_V1_6_COMPLIANCE_MATRIX.md`
- Modify: `SYSML_V1_6_CURRENT_ARCHITECTURE.md`

**Interfaces:**
- Consumes all deliverables from Tasks 1-7.
- Produces executable release evidence for each definition-of-done requirement.

- [ ] **Step 1: Add a single user-journey certification test**

```ts
test('tree, package diagram, canvas, inspector, persistence, and navigation remain aligned', async ({ page }) => {
  const packageId = await createPackageFromTree(page, 'Vehicle');
  const diagramId = await createPackageDiagram(page, packageId, 'Vehicle Structure');
  const blockId = await createBlockOnActiveDiagram(page, 'Controller');
  await selectCanvasElement(page, blockId);
  const portId = await addPortFromInspector(page, 'Proxy Port', 'ControlIF');
  await expectTreeParent(page, portId, blockId);
  await editInspectorField(page, 'Direction', 'out');
  await saveAndReload(page);
  await expectRepositoryElement(page, portId, { ownerId: blockId, direction: 'out' });
  await openTreeDiagram(page, diagramId);
  await expectActiveDiagram(page, diagramId);
});
```

- [ ] **Step 2: Add negative and accessibility scenarios**

Verify disabled creation with an accessible explanation, atomic rejection without revision change, keyboard access to every enabled action, explicit read-only labels, deterministic multi-diagram chooser focus, and deletion impact confirmation.

- [ ] **Step 3: Run the focused certification matrix**

Run: `npm run test:sysml`

Run: `npm run test:e2e:sysml -- tests/e2e/sysml-package-contextual-editing.spec.ts tests/e2e/model-explorer-undo-persistence.spec.ts tests/e2e/sysml-persistence-report.spec.ts`

Run: `npm run test:sysml:architecture`

Expected: all commands exit 0.

- [ ] **Step 4: Run static and release gates**

Run: `npx tsc --noEmit`

Run: `npm run test:sysml:release-gate`

Run: `npm run test:sysml:full-release`

Expected: all commands exit 0, including existing 1k/10k/50k model gates.

- [ ] **Step 5: Update conformance evidence and architecture documentation**

Record exact automated evidence for package-diagram lifecycle, contextual creation, complete projections, property editing, relationships/behavior, one writable model, persistence, and navigation. Mark only behaviors exercised by committed tests as compliant.

- [ ] **Step 6: Verify the final diff contains no placeholders or UI-only controls**

Run: `rg -n "onClick=\{\(\) => \{\}\}|disabled=\{true\}|throw new Error\('not implemented'\)" src/features/sysml src/components/sysml src/components/modelExplorer src/App.tsx`

Expected: no task-related placeholders or permanently inert controls; documented intentional disabled states must be capability-driven.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e src/engine/sysml/conformanceManifest.ts src/engine/sysml/conformanceManifest.test.ts scripts/verify_sysml_architecture.ts scripts/verify_sysml_release.ts SYSML_V1_6_COMPLIANCE_MATRIX.md SYSML_V1_6_CURRENT_ARCHITECTURE.md
git commit -m "test(sysml): certify package and contextual editing parity"
```

## Final Acceptance Checklist

- [ ] Model and Package right-click menus create real Package Diagram repository elements.
- [ ] Tree, canvas symbols, diagram references, tabs, breadcrumbs, chooser, back, and reload navigate using exact diagram IDs.
- [ ] Port/property/feature creation from a selected canvas element or bound property panel never asks for a redundant parent.
- [ ] No legal-owner selection results in a disabled, explained action and no mutation.
- [ ] All semantic elements and relationships are visible and navigable in Model Explorer.
- [ ] All editable-looking property fields dispatch validated commands; derived fields are explicitly read-only.
- [ ] All enabled buttons have tested canonical behavior.
- [ ] Connections and behavioral relationships include editable endpoints/fields and persist as repository elements.
- [ ] Every mutation supports undo/redo and save/reload.
- [ ] No parallel writable SysML UI state or reverse merge path remains.
- [ ] SysML release, architecture, performance, TypeScript, and end-to-end gates pass.
