# Repository-First Model Tree and Diagram Viewpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Model Tree the authoritative semantic repository editor and make every diagram a presentation of the same stable semantic identities.

**Architecture:** All tree, diagram, import, script, migration, and AI mutations pass through the canonical SysML command gateway. A shared capability policy controls ownership and endpoint legality; semantic elements and diagram presentations are committed separately or atomically through typed transactions, while legacy arrays remain read-only compatibility projections during migration.

**Tech Stack:** TypeScript, React, Vitest, canonical SysML repository v4, normalized store, command gateway, existing model-explorer adapters.

## Global Constraints

- Semantic authorities are `OMG_SYSML_1_6`, `UML_FOUNDATION`, `CAMEO_TOOLING`, or `ADIA_EXTENSION`.
- Never classify Cameo interaction behavior as normative SysML without independent specification evidence.
- Generic Port creates a UML Port; ProxyPort and FullPort require explicit selection.
- TestCase is normative; VerificationCase is migrated or marked `ADIA_EXTENSION`.
- No command source may silently create a missing type; return `TYPE_NOT_FOUND` with candidates and `CreateNewType`.
- One semantic element may have multiple presentations, but no presentation may duplicate semantic fields.
- Existing project files must migrate without changing stable semantic IDs.
- `Motor`/`leftMotor`/`REQ-001` semantic identity remains a release gate.

---

### Task 1: Central Capability and Ownership Catalog

**Files:**
- Create: `src/engine/sysml/capabilities/catalog.ts`
- Create: `src/engine/sysml/capabilities/ownershipPolicy.ts`
- Create: `src/engine/sysml/capabilities/ownershipPolicy.test.ts`
- Modify: `src/features/modelExplorer/modelExplorerCapabilities.ts`

**Interfaces:**
- Produces: `getSupportedElementKinds(): ElementCapabilityDefinition[]`
- Produces: `evaluateOwnership(owner: SemanticElement | null, childKind: MetaclassKind): CapabilityDecision`
- Produces: `getOwnedElementCapabilities(owner, repository): ElementCapability[]`

- [ ] **Step 1: Write failing ownership-policy tests**

```ts
it('allows classifiers under packages but not under requirements', () => {
  expect(evaluateOwnership(pkg, 'Block').allowed).toBe(true);
  expect(evaluateOwnership(requirement, 'Block')).toMatchObject({
    allowed: false,
    code: 'ILLEGAL_OWNERSHIP',
  });
});

it('allows all declared Block features', () => {
  for (const kind of ['PartProperty', 'ReferenceProperty', 'ValueProperty', 'FlowProperty', 'Port', 'Operation'] as const) {
    expect(evaluateOwnership(block, kind).allowed).toBe(true);
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/engine/sysml/capabilities/ownershipPolicy.test.ts`

Expected: FAIL because the capability catalog and policy do not exist.

- [ ] **Step 3: Implement the typed catalog and policy**

```ts
export interface CapabilityDecision {
  allowed: boolean;
  code?: 'ILLEGAL_OWNERSHIP';
  message?: string;
}

export interface ElementCapabilityDefinition {
  metaclass: MetaclassKind;
  label: string;
  authority: SemanticAuthority;
  category: 'element' | 'feature';
}

export function evaluateOwnership(owner: SemanticElement | null, childKind: MetaclassKind): CapabilityDecision {
  const ownerKind = owner?.metaclass ?? 'Model';
  const allowed = OWNERSHIP_MATRIX[ownerKind]?.includes(childKind) ?? false;
  return allowed
    ? { allowed: true }
    : { allowed: false, code: 'ILLEGAL_OWNERSHIP', message: `${childKind} cannot be owned by ${ownerKind}.` };
}
```

- [ ] **Step 4: Replace `SYSML_CHILDREN` consumers with catalog projections**

Keep `getElementKindLabel` as a compatibility helper, but derive labels and legal children from `catalog.ts` and `ownershipPolicy.ts`.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/engine/sysml/capabilities/ownershipPolicy.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

Expected: PASS.

Commit: `feat(sysml): centralize semantic capability policy`

---

### Task 2: Complete Canonical Element and Feature Types

**Files:**
- Modify: `src/engine/sysml/domain/base.ts`
- Modify: `src/engine/sysml/domain/classifiers.ts`
- Modify: `src/engine/sysml/domain/properties.ts`
- Modify: `src/engine/sysml/domain/requirements.ts`
- Modify: `src/engine/sysml/domain/index.ts`
- Create: `src/engine/sysml/domain/behaviors.ts`
- Create: `src/engine/sysml/domain/completeMetamodel.test.ts`

**Interfaces:**
- Produces canonical `UseCase`, `Activity`, `ActivityPartition`, `Operation`, `ConstraintExpression`, and feature types required by the catalog.

- [ ] **Step 1: Write a failing metamodel construction test**

```ts
it('stores every catalog kind as a canonical semantic element', () => {
  const elements: SemanticElement[] = [useCase, activity, operation, testCase, flowSpecification];
  expect(elements.map(element => element.metaclass)).toEqual([
    'UseCase', 'Activity', 'Operation', 'TestCase', 'FlowSpecification',
  ]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/engine/sysml/domain/completeMetamodel.test.ts`

Expected: FAIL on missing metaclass/type declarations.

- [ ] **Step 3: Add focused behavior-domain types**

```ts
export interface UseCase extends SemanticElement {
  metaclass: 'UseCase';
  subjectIds: string[];
  extensionPointIds: string[];
}

export interface Activity extends SemanticElement {
  metaclass: 'Activity';
  parameterIds: string[];
  nodeIds: string[];
  partitionIds: string[];
}
```

Extend `MetaclassKind` and the `SemanticElement` union without representing UseCase or Activity as a Block stereotype.

- [ ] **Step 4: Run domain and migration tests**

Run: `npx vitest run src/engine/sysml/domain src/engine/sysml/persistence/migrateV3ToV4.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(sysml): complete canonical tree element types`

---

### Task 3: Atomic Create-and-Present Command

**Files:**
- Modify: `src/engine/sysml/commands/types.ts`
- Modify: `src/engine/sysml/commands/dispatcher.ts`
- Modify: `src/engine/sysml/commands/elementCommands.ts`
- Modify: `src/engine/sysml/commands/presentationCommands.ts`
- Create: `src/engine/sysml/commands/createAndPresent.test.ts`

**Interfaces:**
- Produces: `CreateAndPresentElementCommand`
- Produces error codes `ILLEGAL_OWNERSHIP`, `INVALID_DIAGRAM_ELEMENT`, and `ALREADY_PRESENTED`.

- [ ] **Step 1: Write atomicity and identity tests**

```ts
it('commits exactly one semantic element and one presentation', () => {
  const result = dispatchSysmlCommand(repo, {
    type: 'CreateAndPresentElement',
    element: block,
    presentation,
  }, uiContext);
  expect(result.success).toBe(true);
  expect(result.state.elements[block.id]).toBeDefined();
  expect(result.state.presentations[presentation.id].semanticElementId).toBe(block.id);
});

it('commits neither side when presentation validation fails', () => {
  const result = dispatchSysmlCommand(repo, invalidCommand, uiContext);
  expect(result.success).toBe(false);
  expect(result.state).toBe(repo);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/engine/sysml/commands/createAndPresent.test.ts`

- [ ] **Step 3: Implement the command**

```ts
export interface CreateAndPresentElementCommand {
  type: 'CreateAndPresentElement';
  element: SemanticElement;
  presentation: DiagramPresentation;
}
```

Validate ownership and diagram compatibility against the original state, clone once, create the element, create the presentation, and increment the revision once.

- [ ] **Step 4: Enforce duplicate-presentation policy**

Reject an existing `(diagramId, semanticElementId)` pair with `ALREADY_PRESENTED`; do not duplicate semantics.

- [ ] **Step 5: Run command tests and commit**

Run: `npx vitest run src/engine/sysml/commands`

Expected: PASS.

Commit: `feat(sysml): add atomic create and present command`

---

### Task 4: Canonical Element Factory and No-Silent-Type Resolution

**Files:**
- Create: `src/engine/sysml/services/elementFactory.ts`
- Create: `src/engine/sysml/services/elementFactory.test.ts`
- Modify: `src/engine/sysml/services/typeResolution.ts`
- Modify: `src/features/modelExplorer/adapters/modelExplorerFactories.ts`

**Interfaces:**
- Produces: `createSemanticElement(input, repository): CreateElementOutcome`
- Consumes: `resolveType(...)`
- Returns: `TYPE_NOT_FOUND` with `candidates` and `createNewTypeAction`.

- [ ] **Step 1: Write failing factory tests**

```ts
it('creates TestCase rather than VerificationCase', () => {
  expect(createSemanticElement(testCaseInput, repo)).toMatchObject({ ok: true, element: { metaclass: 'TestCase' } });
});

it('does not invent a requested property type', () => {
  expect(createSemanticElement({ ...propertyInput, requestedTypeName: 'MissingType' }, repo)).toMatchObject({
    ok: false,
    code: 'TYPE_NOT_FOUND',
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/engine/sysml/services/elementFactory.test.ts`

- [ ] **Step 3: Implement factory dispatch by metaclass**

The factory sets IDs, owner IDs, namespaces, normative defaults, and provenance but does not write the repository.

- [ ] **Step 4: Make legacy explorer factories wrappers over the canonical factory**

Do not retain independent defaulting logic for ports, TestCase, properties, or classifiers.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/engine/sysml/services/elementFactory.test.ts src/engine/sysml/services/typeResolution.test.ts`

Commit: `feat(sysml): centralize semantic element creation`

---

### Task 5: Repository-First Model Tree Context Menu

**Files:**
- Modify: `src/features/modelExplorer/modelExplorerTypes.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/components/modelExplorer/ModelExplorerMenu.tsx`
- Modify: `src/components/modelExplorer/ModelExplorerMenu.test.tsx`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

**Interfaces:**
- Adds `capabilityGroup`, `authority`, `diagnosticCode`, and `catalogVisibility` to `ExplorerCapability`.
- Adds `createOwnedFeature` and `showAllTypes` capability handling.

- [ ] **Step 1: Write failing menu and adapter tests**

```ts
it('shows legal Block children and disabled illegal All Types entries', () => {
  const capabilities = adapter.capabilities(['block-1'], 'bdd-1', { includeAllTypes: true });
  expect(capabilities).toContainEqual(expect.objectContaining({ elementKind: 'PartProperty', enabled: true }));
  expect(capabilities).toContainEqual(expect.objectContaining({ elementKind: 'Requirement', enabled: false, diagnosticCode: 'ILLEGAL_OWNERSHIP' }));
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/components/modelExplorer/ModelExplorerMenu.test.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

- [ ] **Step 3: Project capabilities from backend policy**

Remove hard-coded `SYSML_CHILDREN` branching from preflight and execution. Both call `evaluateOwnership` and `createSemanticElement`.

- [ ] **Step 4: Render grouped actions and “All Types…”**

Disabled items must show the backend diagnostic message and must not invoke execution.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/components/modelExplorer src/features/modelExplorer`

Commit: `feat(sysml): make model tree a repository editor`

---

### Task 6: Relationship Capability and Target Policy

**Files:**
- Create: `src/engine/sysml/capabilities/relationshipPolicy.ts`
- Create: `src/engine/sysml/capabilities/relationshipPolicy.test.ts`
- Modify: `src/engine/sysml/commands/relationshipCommands.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/services/sysmlConnectionUi.ts`

**Interfaces:**
- Produces: `getLegalRelationshipKinds(source, direction, repository)`
- Produces: `getLegalRelationshipTargets(source, kind, direction, repository)`
- Produces: `validateRelationshipEndpoints(relationship, repository)`

- [ ] **Step 1: Write endpoint parity tests**

```ts
it('returns only targets accepted by command validation', () => {
  const targets = getLegalRelationshipTargets(block, 'Satisfy', 'outgoing', repo);
  for (const target of targets) {
    expect(validateRelationshipEndpoints(satisfy(block.id, target.id), repo).allowed).toBe(true);
  }
});

it('does not silently map unsupported relationships to Trace', () => {
  expect(validateRelationshipEndpoints(invalidRelationship, repo)).toMatchObject({ allowed: false });
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/engine/sysml/capabilities/relationshipPolicy.test.ts`

- [ ] **Step 3: Implement one shared policy and use it in commands/UI**

Cover Association, SharedAggregation, Composition, Generalization, Dependency, Allocate, Satisfy, Verify, Refine, Trace, RequirementContainment, DeriveReqt, Copy, Connector, BindingConnector, and ItemFlow.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/engine/sysml/capabilities/relationshipPolicy.test.ts src/services/sysmlConnectionUi.test.ts src/engine/sysml/services/relationshipSemantics.test.ts`

Commit: `feat(sysml): unify relationship target policy`

---

### Task 7: Diagram Toolbars as Semantic-and-Presentation Commands

**Files:**
- Create: `src/features/sysml/diagramCreationController.ts`
- Create: `src/features/sysml/diagramCreationController.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/engine/sysml/requirementsDiagramScope.ts`
- Modify: `src/engine/sysml/requirementsDiagramScope.test.ts`

**Interfaces:**
- Produces: `createElementOnDiagram(request, gateway): CommandResult`
- Produces: `addExistingElementToDiagram(request, gateway): CommandResult`

- [ ] **Step 1: Write cross-diagram identity tests**

```ts
it('creates a Block on Requirements and displays the same Block on BDD', () => {
  const created = createElementOnDiagram(requirementsRequest('Block'), gateway);
  const blockId = created.affectedIds.semanticElementId;
  addExistingElementToDiagram({ semanticElementId: blockId, diagramId: 'bdd-a', bounds }, gateway);
  expect(gateway.repository.elements[blockId].metaclass).toBe('Block');
  expect(presentationsFor(blockId)).toHaveLength(2);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/features/sysml/diagramCreationController.test.ts`

- [ ] **Step 3: Implement the controller**

Tree selection determines semantic owner; active diagram determines presentation only. Requirements are not owners of Blocks, UseCases, or TestCases merely because those elements are created on a Requirements Diagram.

- [ ] **Step 4: Replace direct `setBlocks`, `setRelationships`, and presentation mutations in affected toolbar handlers**

BDD Block, Requirements Requirement/Block/UseCase/TestCase, IBD properties/ports, and relationship tools must dispatch gateway commands and refresh from projections.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/features/sysml/diagramCreationController.test.ts src/engine/sysml/requirementsDiagramScope.test.ts`

Commit: `refactor(sysml): route diagram creation through repository`

---

### Task 8: Feature Editing and Specification Panels

**Files:**
- Create: `src/features/sysml/semanticFeatureController.ts`
- Create: `src/features/sysml/semanticFeatureController.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/engine/sysml/services/propertySemantics.ts`
- Modify: `src/engine/sysml/services/portSemantics.ts`

**Interfaces:**
- Produces: `createOwnedFeature`, `updateOwnedFeature`, and `deleteOwnedFeature`.

- [ ] **Step 1: Write feature identity tests**

```ts
it('edits one Port identity from tree, BDD compartment, IBD, and specification view', () => {
  const portId = createOwnedFeature(proxyPortRequest, gateway).affectedIds[0];
  updateOwnedFeature({ featureId: portId, patch: { name: 'canBus' } }, gateway);
  expect(allFeatureProjections(portId).every(view => view.name === 'canBus')).toBe(true);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/features/sysml/semanticFeatureController.test.ts`

- [ ] **Step 3: Implement controller commands and type resolution**

ProxyPort creation requires an existing InterfaceBlock type. A missing type returns `TYPE_NOT_FOUND`; the caller may invoke the explicit `CreateNewType` action and retry.

- [ ] **Step 4: Replace affected direct property/port array mutations in `App.tsx`**

The UI may retain local form drafts but commits only through the controller.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/features/sysml/semanticFeatureController.test.ts src/engine/sysml/validation/portRules.test.ts src/engine/sysml/services/propertySemantics.test.ts`

Commit: `refactor(sysml): make features repository owned`

---

### Task 9: Persistence, Migration, and Read-Only Legacy Projections

**Files:**
- Modify: `src/engine/sysml/persistence/migrateV3ToV4.ts`
- Modify: `src/engine/sysml/persistence/migrateV3ToV4.test.ts`
- Modify: `src/engine/sysml/normalizedStore.ts`
- Modify: `src/engine/sysml/projection/canonicalProjections.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Legacy arrays become projection outputs only.
- Existing `diagramPresentations` migrate to canonical `DiagramPresentation` records.

- [ ] **Step 1: Write save/load and migration tests**

```ts
it('round-trips one Block with two presentations without duplication', () => {
  const loaded = loadRepository(serializeRepository(repository));
  expect(elementsOfKind(loaded, 'Block')).toHaveLength(1);
  expect(presentationsForElement(loaded, 'motor')).toHaveLength(2);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/engine/sysml/persistence/migrateV3ToV4.test.ts src/engine/sysml/projection/canonicalProjections.test.ts`

- [ ] **Step 3: Implement presentation migration and projection-only adapters**

Remove the migrated action families from the `mergeLegacyDiagramIntoRepository` write-back effect. Keep only explicitly allowlisted, not-yet-migrated families until their later migration.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/engine/sysml/persistence src/engine/sysml/projection src/engine/sysml/oneWritableModel.test.ts`

Commit: `refactor(sysml): make canonical repository the sole writer`

---

### Task 10: Release Gates, Evidence, and Compliance Status

**Files:**
- Modify: `src/engine/sysml/semanticIdentityReleaseGate.test.ts`
- Create: `src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts`
- Modify: `src/engine/sysml/conformanceManifest.ts`
- Modify: `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`
- Modify: `scripts/verify_sysml_architecture.ts`

**Interfaces:**
- Adds release evidence for tree capability parity, cross-diagram identity, ownership, relationships, features, persistence, and no-silent-type creation.

- [ ] **Step 1: Add the repository-first release scenarios**

```ts
it('preserves one Block identity from Requirements Diagram to BDD', () => {
  expect(repository.elements['motor'].name).toBe('BLDCMotor');
  expect(presentationsFor('motor').map(p => p.diagramId).sort()).toEqual(['bdd-a', 'requirements-a']);
});

it('keeps tree capabilities and backend preflight in parity', () => {
  for (const capability of everyAdvertisedCapability(fixtureRepository)) {
    expect(preflight(capability.command).allowed).toBe(capability.enabled);
  }
});
```

- [ ] **Step 2: Verify the new tests fail before final wiring**

Run: `npx vitest run src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts`

- [ ] **Step 3: Complete remaining wiring until all gates pass**

Do not weaken assertions or add architecture allowlist entries. Remove obsolete direct-mutation allowlist entries as their code paths are migrated.

- [ ] **Step 4: Run full verification**

Run: `npm run test:sysml:architecture`

Expected: zero unallowlisted notices and fewer allowlisted notices than the baseline of 88.

Run: `npm run test:sysml`

Expected: all SysML tests pass.

Run: `npm run test:sysml:release-gate`

Expected: all release gates pass.

Run: `npx tsc --noEmit --pretty false`

Expected: exits successfully with no diagnostics. If the existing Windows environment hangs, record the timeout honestly and run the bounded CI typecheck instead; never report it as passed without completion.

- [ ] **Step 5: Update evidence and commit**

Only mark a feature COMPLIANT when element, properties, relationships, constraints, persistence, projection, validator, and automated-test evidence are present.

Commit: `test(sysml): gate repository-first tree and viewpoints`

---

## Final Acceptance Checklist

- [ ] Right-clicking every supported semantic item displays legal owned elements/features and relationship actions.
- [ ] “All Types…” displays disabled illegal actions with backend-derived explanations.
- [ ] Tree creation persists semantics without requiring a diagram.
- [ ] Diagram creation commits semantics and presentation atomically.
- [ ] Add/Remove from Diagram never duplicates or deletes semantics.
- [ ] Blocks, UseCases, TestCases, properties, and ports retain identity across views.
- [ ] BDD, IBD, and Requirements projections resolve names and features from the repository.
- [ ] Relationship target filtering matches repository validation.
- [ ] Missing types fail with `TYPE_NOT_FOUND` for every caller source.
- [ ] Save/load and legacy migration preserve identities and presentations.
- [ ] Architecture, full SysML, semantic identity, and release-gate suites pass.
