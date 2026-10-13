# Cameo-Style Repository and Diagram Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every SysML canvas and Model Explorer operation mutate one canonical repository while diagrams store only presentations, with verified compatibility for ADIA code generation.

**Architecture:** Extend the existing `sysmlCommandGateway` into the sole mutation boundary and make create-plus-present an atomic command. React canvas arrays remain derived compatibility projections, Model Explorer actions return explicit command results, and code generation continues to consume its validated semantic input rather than diagram presentation state.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Playwright, existing SysML repository/gateway/normalized-store infrastructure, existing MISRA-C/state-machine generator verification.

## Global Constraints

- The canonical SysML repository is the only authority for semantic identity, properties, ownership, typing, relationships, and validation.
- Diagram state stores references, geometry, routing, and display settings; it never owns duplicate semantic names, types, or relationship endpoints.
- Creating from a diagram is atomic: create exactly one semantic element and exactly one presentation, or commit neither.
- Creating from the Model Explorer creates a semantic element only.
- `Remove from Diagram` removes presentations only; `Delete from Model` removes semantics, affected relationships, and all presentations after material-impact confirmation.
- Empty impact metadata must not block a command.
- Every visible action commits a backend operation or returns a visible structured diagnostic; silent no-ops are forbidden.
- Missing semantic types return `TYPE_NOT_FOUND`, candidates, and an explicit `CreateNewType` action; UI, imports, scripts, migrations, and AI have no bypass.
- Standard UML Port, ProxyPort, FullPort, and legacy FlowPort remain distinct; ProxyPort constraints remain repository-enforced.
- SysML v1.6 `TestCase` is normative; persisted `VerificationCase` remains an explicitly mapped ADIA compatibility representation.
- Code generators consume semantic inputs only. Presentation membership, presentation coordinates, and diagram count must not change generated artifacts.
- Existing generated-code structural validation, MISRA checks, golden snapshots, and deterministic checks remain release gates.

---

## File Structure

- `src/services/sysmlCommandGateway.ts` — atomic semantic/presentation transactions and rollback-safe batching.
- `src/services/sysmlDiagramCreation.ts` — pure creation-intent builder used by every SysML diagram palette.
- `src/services/sysmlDiagramCreation.test.ts` — owner resolution, metaclass mapping, and no-silent-type tests.
- `src/features/modelExplorer/modelExplorerTypes.ts` — complete explorer command/result contracts.
- `src/features/modelExplorer/modelExplorerCommandBus.ts` — preflight and material-impact dispatch policy.
- `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts` — repository-backed copy, paste, duplicate, remove, and delete execution.
- `src/components/modelExplorer/AppModelExplorer.tsx` — result feedback and clipboard orchestration only.
- `src/App.tsx` — route SysML canvas intents through the gateway and project committed state.
- `src/engine/sysml/repositoryPresentationReleaseGate.test.ts` — repository/presentation identity and deletion release gate.
- `src/utils/stateMachineCodeGenerator.repositoryIsolation.test.ts` — generator invariance under SysML presentation changes.
- `tests/e2e/sysml-repository-presentation.spec.ts` — complete user workflow through canvas and tree.
- `scripts/verify_sysml_architecture.ts` — prohibit new direct SysML semantic array mutations.

---

### Task 1: Correct Empty-Impact Dispatch Semantics

**Files:**
- Modify: `src/features/modelExplorer/modelExplorerCommandBus.ts`
- Modify: `src/features/modelExplorer/modelExplorerCommandBus.test.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.commands.test.tsx`

**Interfaces:**
- Consumes: `ExplorerCommandResult.impact?: ExplorerImpact`
- Produces: `hasMaterialImpact(impact?: ExplorerImpact): boolean` and corrected `isPreflightClear(result): boolean`

- [ ] **Step 1: Write the failing empty-impact test**

```ts
it('executes when preflight contains an empty impact report', () => {
  const execute = vi.fn().mockReturnValue({ committed: true, revision: 2, diagnostics: [] });
  const adapter: ModelExplorerAdapter = {
    domain: 'sysml', getRevision: () => 1, project: vi.fn(), capabilities: vi.fn(),
    relationshipTargets: vi.fn(), execute,
    preflight: vi.fn().mockReturnValue({
      committed: false, revision: 1, diagnostics: [],
      impact: { descendants: [], relationships: [], presentations: [], invalidated: [] },
    }),
  };
  createModelExplorerCommandBus(adapter).dispatch({ type: 'delete', elementIds: ['block-1'] });
  expect(execute).toHaveBeenCalledOnce();
});
```

Keep the existing material-impact test, but make its impact contain `descendants: ['child-1']` and assert execution is blocked pending confirmation.

- [ ] **Step 2: Run the focused tests and verify the new test fails**

Run: `npx vitest run src/features/modelExplorer/modelExplorerCommandBus.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx`

Expected: FAIL because `isPreflightClear` currently rejects every defined impact object.

- [ ] **Step 3: Implement material-impact detection**

```ts
export function hasMaterialImpact(impact?: ExplorerImpact): boolean {
  if (!impact) return false;
  return impact.descendants.length > 0
    || impact.relationships.length > 0
    || impact.presentations.length > 0
    || impact.invalidated.length > 0;
}

export function isPreflightClear(result: ExplorerCommandResult): boolean {
  return !result.diagnostics.some(item => item.severity === 'error')
    && !hasMaterialImpact(result.impact);
}
```

Use `hasMaterialImpact` in `AppModelExplorer.tsx` instead of checking only `impact.invalidated` so descendants, relationships, and presentations all trigger the impact dialog.

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/features/modelExplorer/modelExplorerCommandBus.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/modelExplorer/modelExplorerCommandBus.ts src/features/modelExplorer/modelExplorerCommandBus.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx
git commit -m "fix(explorer): execute commands with empty impact"
```

### Task 2: Add an Atomic Create-and-Present Gateway Command

**Files:**
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`

**Interfaces:**
- Produces: `SysmlMutationCommand` variant `{ type: 'createAndPresent'; element: SysmlElement; diagramId: string; presentation: PresentationCoordinates }`
- Produces: `cloneGatewayStateForTransaction(state: SysmlGatewayState): SysmlGatewayState`
- Consumes later: Tasks 3 and 4

- [ ] **Step 1: Write rollback and identity tests**

```ts
it('atomically creates one semantic element and one presentation', () => {
  const state = createSysmlGatewayState();
  const block: BlockDefinition = {
    id: 'blk-motor', name: 'Motor', kind: 'block', namespace: [], ownerId: 'model',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  };
  const result = executeSysmlCommand(state, {
    type: 'createAndPresent',
    element: block,
    diagramId: 'requirements',
    presentation: { x: 40, y: 80, width: 150, height: 100 },
  });
  expect(result.committed).toBe(true);
  expect(result.repository.definitions['blk-motor']).toBeDefined();
  expect(result.diagramPresentations.requirements.elementIds).toEqual(['blk-motor']);
  expect(result.coordinates['blk-motor']).toMatchObject({ x: 40, y: 80 });
});

it('rolls back semantic creation when presentation validation fails', () => {
  const state = createSysmlGatewayState();
  const block: BlockDefinition = {
    id: 'blk-invalid', name: 'Invalid', kind: 'block', namespace: [], ownerId: 'model',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  };
  const result = executeSysmlCommand(state, {
    type: 'createAndPresent',
    element: block,
    diagramId: '',
    presentation: { x: 0, y: 0 },
  });
  expect(result.committed).toBe(false);
  expect(result.repository.definitions['blk-invalid']).toBeUndefined();
  expect(state.store?.entities.has('blk-invalid')).toBe(false);
});
```

- [ ] **Step 2: Run the gateway test and verify type/test failure**

Run: `npx vitest run src/services/sysmlCommandGateway.test.ts`

Expected: FAIL because `createAndPresent` is not in `SysmlMutationCommand`.

- [ ] **Step 3: Add rollback-safe transaction cloning**

```ts
export function cloneGatewayStateForTransaction(state: SysmlGatewayState): SysmlGatewayState {
  const coordinates = structuredClone(state.coordinates);
  const diagramPresentations = structuredClone(state.diagramPresentations ?? {});
  return {
    ...state,
    history: structuredClone(state.history),
    patchHistory: state.patchHistory ? structuredClone(state.patchHistory) : undefined,
    coordinates,
    diagramPresentations,
    presentationHistory: state.presentationHistory ? structuredClone(state.presentationHistory) : undefined,
    actionStack: [...(state.actionStack ?? [])],
    redoStack: [...(state.redoStack ?? [])],
    store: fromRepository(state.repository, coordinates, diagramPresentations),
  };
}
```

Execute `batch` against this clone and return the untouched original state on any failed subcommand. Reject an empty `diagramId` with `DIAGRAM_NOT_FOUND` before semantic mutation.

- [ ] **Step 4: Implement `createAndPresent` as one gateway transaction**

```ts
if (command.type === 'createAndPresent') {
  return executeSysmlCommand(state, {
    type: 'batch',
    commands: [
      { type: 'createElement', element: command.element },
      {
        type: 'addToDiagram',
        diagramId: command.diagramId,
        elementIds: [command.element.id],
        coordinates: { [command.element.id]: command.presentation },
      },
    ],
  }, command.diagramId);
}
```

Ensure the returned action stack contains one logical transaction entry and a single undo removes both semantic element and presentation.

- [ ] **Step 5: Run gateway and undo tests**

Run: `npx vitest run src/services/sysmlCommandGateway.test.ts`

Expected: PASS, including create/present rollback and one-step undo.

- [ ] **Step 6: Commit**

```bash
git add src/services/sysmlCommandGateway.ts src/services/sysmlCommandGateway.test.ts
git commit -m "feat(sysml): add atomic create and present command"
```

### Task 3: Build Diagram Creation Intents from Canonical Factories

**Files:**
- Create: `src/services/sysmlDiagramCreation.ts`
- Create: `src/services/sysmlDiagramCreation.test.ts`
- Modify: `src/features/modelExplorer/adapters/modelExplorerFactories.ts`

**Interfaces:**
- Produces: `buildDiagramCreationCommand(input): SysmlEditorCommand | DiagramCreationFailure`
- Produces: `DiagramCreationKind = 'Block' | 'Requirement' | 'TestCase' | 'UseCase'`
- Consumes: canonical factories and `SysmlRepository`

- [ ] **Step 1: Write failing creation-intent tests**

```ts
it.each([
  ['Block', 'block', 'blk-'],
  ['Requirement', 'requirement', 'req-'],
  ['TestCase', 'verificationCase', 'vc-'],
  ['UseCase', 'useCase', 'uc-'],
] as const)('builds one %s semantic element and active-diagram presentation', (kind, repositoryKind, idPrefix) => {
  const result = buildDiagramCreationCommand({
    repository: createEmptyRepository(), kind, ownerId: 'model', diagramId: 'requirements',
    position: { x: 100, y: 120 },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.command.type).toBe('createAndPresent');
  expect(result.command.element.kind).toBe(repositoryKind);
  expect(result.command.element.id.startsWith(idPrefix)).toBe(true);
});

it('returns OWNER_NOT_FOUND instead of inventing an owner', () => {
  const result = buildDiagramCreationCommand({
    repository: createEmptyRepository(), kind: 'Block', ownerId: 'missing', diagramId: 'requirements', position: { x: 0, y: 0 },
  });
  expect(result).toMatchObject({ ok: false, diagnostic: { code: 'OWNER_NOT_FOUND' } });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run src/services/sysmlDiagramCreation.test.ts`

Expected: FAIL because `sysmlDiagramCreation.ts` does not exist.

- [ ] **Step 3: Implement the pure builder**

```ts
export function buildDiagramCreationCommand(input: DiagramCreationInput): DiagramCreationOutcome {
  const ownerExists = input.ownerId === 'model'
    || Boolean(input.repository.packages[input.ownerId])
    || Boolean(input.repository.definitions[input.ownerId])
    || Boolean(input.repository.requirements[input.ownerId]);
  if (!ownerExists) return failure('OWNER_NOT_FOUND', `Owner '${input.ownerId}' does not exist.`);
  if (!input.diagramId) return failure('DIAGRAM_NOT_FOUND', 'An active diagram is required.');

  const names = collectRepositoryNames(input.repository);
  const element = input.kind === 'Block' ? createBlock({ ownerId: input.ownerId, existingNames: names })
    : input.kind === 'Requirement' ? createRequirement({ ownerId: input.ownerId, existingNames: names })
    : input.kind === 'TestCase' ? createVerificationCase({ ownerId: input.ownerId, existingNames: names })
    : createUseCase({ ownerId: input.ownerId });

  return {
    ok: true,
    semanticId: element.id,
    command: {
      type: 'createAndPresent', element, diagramId: input.diagramId,
      presentation: { x: input.position.x, y: input.position.y, width: 150, height: 100 },
    },
  };
}
```

Keep `TestCase` as the public normative term and document the V3 `verificationCase` storage mapping as `ADIA_EXTENSION` in the type comment.

- [ ] **Step 4: Run creation tests**

Run: `npx vitest run src/services/sysmlDiagramCreation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/sysmlDiagramCreation.ts src/services/sysmlDiagramCreation.test.ts src/features/modelExplorer/adapters/modelExplorerFactories.ts
git commit -m "feat(sysml): build canonical diagram creation commands"
```

### Task 4: Route Diagram Palette Creation Through the Repository

**Files:**
- Modify: `src/App.tsx:6180-6250`
- Modify: `src/App.tsx:9718-9800`
- Modify: `src/App.tsx:16525-16585`
- Create: `src/services/sysmlAppProjection.test.ts`

**Interfaces:**
- Consumes: `buildDiagramCreationCommand`, `handleExecuteSysmlCommand`
- Removes: direct semantic creation through `setBlocks(prev => [...prev, newBlock])`

- [ ] **Step 1: Write a failing repository-first application projection test**

```ts
it('creates a Block on Requirements and reuses its identity on BDD', () => {
  const initialState = createSysmlGatewayState();
  const built = buildDiagramCreationCommand({
    repository: initialState.repository, kind: 'Block', diagramId: 'requirements',
    ownerId: 'model', position: { x: 10, y: 20 },
  });
  expect(built.ok).toBe(true);
  if (!built.ok) return;
  const first = executeSysmlCommand(initialState, built.command);
  const blockId = Object.keys(first.repository.definitions)[0];
  const second = executeSysmlCommand(first, { type: 'addToDiagram', diagramId: 'bdd', elementIds: [blockId] });
  expect(Object.keys(second.repository.definitions)).toHaveLength(1);
  expect(second.diagramPresentations.requirements.elementIds).toEqual([blockId]);
  expect(second.diagramPresentations.bdd.elementIds).toEqual([blockId]);
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `npx vitest run src/services/sysmlAppProjection.test.ts`

Expected: FAIL because the application creation helper still writes the legacy block array first.

- [ ] **Step 3: Replace `createBlock` semantic construction with one command**

```ts
const createSysmlElementOnActiveDiagram = useCallback((
  x: number,
  y: number,
  kind: DiagramCreationKind,
) => {
  const diagramId = diagramMode === 'ibd' ? currentLayerId : diagramMode;
  const ownerId = diagramMode === 'ibd' ? currentLayerId : 'model';
  const outcome = buildDiagramCreationCommand({
    repository: canonicalSysmlRepository,
    kind,
    ownerId,
    diagramId,
    position: {
      x: snapEnabled ? snapToGrid(x - 75, GRID_SIZE) : x - 75,
      y: snapEnabled ? snapToGrid(y - 50, GRID_SIZE) : y - 50,
    },
  });
  if (!outcome.ok) {
    addError('error', outcome.diagnostic.message, 'SysML');
    return;
  }
  const result = handleExecuteSysmlCommand(outcome.command);
  if (result.committed) {
    setSelectedIds([outcome.semanticId]);
    addError('info', `Created ${kind}`);
  } else {
    result.diagnostics.forEach(item => addError(item.severity, item.message, 'SysML', item.elementId));
  }
}, [canonicalSysmlRepository, currentLayerId, diagramMode, snapEnabled, handleExecuteSysmlCommand, addError]);
```

Map toolbar actions exactly: BDD Block → `Block`; Requirements Requirement → `Requirement`; Requirements Block → `Block`; Requirements Test Case → `TestCase`; Use Case palette → `UseCase`.

- [ ] **Step 4: Delete the requirements-only presentation mutation inside legacy `createBlock`**

Remove direct `setDiagramPresentations`, direct `setSysmlStore`, and delayed containment creation from that function. Requirement nesting must be a gateway batch containing `createAndPresent` and `requirementContainment` relationship creation.

- [ ] **Step 5: Run focused SysML and TypeScript tests**

Run: `npx vitest run src/services/sysmlAppProjection.test.ts src/services/sysmlCommandGateway.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/services/sysmlAppProjection.test.ts
git commit -m "fix(sysml): create diagram elements in canonical repository"
```

### Task 5: Make Every Model Explorer Action Observable and Executable

**Files:**
- Modify: `src/features/modelExplorer/modelExplorerTypes.ts`
- Modify: `src/features/modelExplorer/modelExplorerCapabilities.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`
- Modify: `src/components/modelExplorer/ModelExplorerMenu.test.tsx`

**Interfaces:**
- Adds command variants: `copy`, `removeFromDiagram`
- Adds result field: `clipboard?: ExplorerClipboardPayload`
- Adds callback: `onCommandResult?: (result: ExplorerCommandResult) => void`

- [ ] **Step 1: Write failing adapter tests for copy, remove, delete, duplicate, and paste**

```ts
it('executes every enabled editing capability or returns a diagnostic', () => {
  const commands: ModelExplorerCommand[] = [
    { type: 'copy', elementIds: ['block-1'] },
    { type: 'duplicate', elementIds: ['block-1'], targetOwnerId: 'model' },
    { type: 'removeFromDiagram', elementIds: ['block-1'], diagramId: 'requirements' },
    { type: 'delete', elementIds: ['block-1'] },
  ];
  for (const command of commands) {
    const result = adapter.execute(command);
    expect(result.committed || result.diagnostics.length > 0 || result.clipboard).toBeTruthy();
  }
});
```

Add a copy/paste test whose Block owns a PartProperty and assert the copied ownership forest contains both IDs and paste remaps both IDs while preserving the internal `typeId`/owner references.

- [ ] **Step 2: Run explorer tests and verify failures**

Run: `npx vitest run src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/components/modelExplorer/ModelExplorerMenu.test.tsx`

Expected: FAIL because copy is outside the command bus and remove-from-diagram is absent.

- [ ] **Step 3: Extend command and result contracts**

```ts
export type ModelExplorerCommand =
  | { type: 'copy'; elementIds: string[] }
  | { type: 'removeFromDiagram'; elementIds: string[]; diagramId: string }
  | { type: 'createElement'; ownerId: string; elementKind: string; name?: string }
  | { type: 'createDiagram'; ownerId: string; diagramKind: string; name?: string }
  | { type: 'rename'; elementId: string; name: string }
  | { type: 'move'; elementIds: string[]; targetOwnerId: string; confirmedImpactHash?: string }
  | { type: 'delete'; elementIds: string[]; confirmedImpactHash?: string }
  | { type: 'createRelationship'; relationshipKind: string; sourceId: string; targetId: string }
  | { type: 'addToDiagram'; elementIds: string[]; diagramId: string; position?: { x: number; y: number } }
  | { type: 'duplicate'; elementIds: string[]; targetOwnerId: string }
  | { type: 'paste'; payload: ExplorerClipboardPayload; targetOwnerId: string; mode: 'copy' | 'move' | 'reference' };

export interface ExplorerCommandResult {
  committed: boolean;
  revision: number;
  diagnostics: ExplorerDiagnostic[];
  selectedIds?: string[];
  impact?: ExplorerImpact;
  clipboard?: ExplorerClipboardPayload;
}
```

Add `removeFromDiagram` to `CapabilityKind`, display it only when the selected semantic ID is in `activeDiagramContext.presentedSemanticIds`, and label destructive semantic deletion `Delete from Model`.

- [ ] **Step 4: Execute copy and remove through the adapter**

```ts
case 'copy':
  return {
    committed: false,
    revision: repo.revision,
    diagnostics: [{ code: 'COPIED_TO_CLIPBOARD', severity: 'info', message: `Copied ${command.elementIds.length} root element(s).` }],
    clipboard: copyOwnershipForest('sysml', command.elementIds, id => getElementById(id, repo), id => getSysmlDescendants(id, repo), repo.revision),
  };
case 'removeFromDiagram': {
  const result = dispatchCommand({ type: 'removeFromDiagram', diagramId: command.diagramId, elementIds: command.elementIds });
  return toExplorerResult(result, command.elementIds);
}
```

Map gateway diagnostics instead of returning `diagnostics: []` after failed rename, move, delete, add, duplicate, or paste.

- [ ] **Step 5: Centralize result handling in `AppModelExplorer`**

```ts
const acceptResult = useCallback((result: ExplorerCommandResult) => {
  if (result.clipboard) clipboardRef.current = result.clipboard;
  if (result.selectedIds?.length) onSelectMultiple?.(result.selectedIds);
  onCommandResult?.(result);
  return result;
}, [onCommandResult, onSelectMultiple]);
```

Every `bus.dispatch` and `bus.confirm` call must pass through `acceptResult`. Replace every command-path `return` that currently discards a failure with a result containing `UNSUPPORTED_COMMAND`, `CLIPBOARD_EMPTY`, or the adapter diagnostic.

- [ ] **Step 6: Run explorer tests**

Run: `npx vitest run src/features/modelExplorer src/components/modelExplorer --no-file-parallelism`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/modelExplorer src/components/modelExplorer
git commit -m "fix(explorer): execute and report every tree action"
```

### Task 6: Route SysML Updates and Relationships Through the Gateway

**Files:**
- Modify: `src/App.tsx:9800-10135`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/services/sysmlCreationRules.test.ts`

**Interfaces:**
- Consumes: `updateElement`, `createElement`, `deleteElements`, and `batch` gateway commands
- Removes: direct semantic `setBlocks`, `setRelationships`, `setParts`, and `setConnectors` writes from SysML handlers

- [ ] **Step 1: Write failing command-path tests for update and relationship creation**

```ts
it('updates a Block once and projects the change on every diagram', () => {
  const renamed = executeSysmlCommand(twoDiagramState, { type: 'updateElement', elementId: 'blk-motor', patch: { name: 'BLDCMotor' } });
  expect(renamed.repository.definitions['blk-motor'].name).toBe('BLDCMotor');
  expect(renamed.diagramPresentations.bdd.elementIds).toContain('blk-motor');
  expect(renamed.diagramPresentations.requirements.elementIds).toContain('blk-motor');
});

it('creates one satisfy relationship independent of its presentation', () => {
  const result = executeSysmlCommand(state, { type: 'createElement', element: satisfyRelationship });
  expect(result.committed).toBe(true);
  expect(Object.keys(result.repository.relationships)).toEqual([satisfyRelationship.id]);
});
```

- [ ] **Step 2: Run focused tests and establish the current failure**

Run: `npx vitest run src/services/sysmlCommandGateway.test.ts src/services/sysmlCreationRules.test.ts`

Expected: the repository tests expose any unsupported update/relationship cases before UI migration.

- [ ] **Step 3: Replace update handlers with command dispatch**

```ts
const updateBlock = useCallback((id: string, updates: Partial<BlockData>) => {
  const result = handleExecuteSysmlCommand({ type: 'updateElement', elementId: id, patch: updates });
  if (!result.committed) result.diagnostics.forEach(d => addError(d.severity, d.message, 'SysML', d.elementId));
}, [handleExecuteSysmlCommand, addError]);

const createRelationship = useCallback((sourceId: string, targetId: string, type: RelationshipData['type']) => {
  const candidate = buildCanonicalRelationship(sourceId, targetId, type);
  const result = handleExecuteSysmlCommand({ type: 'createElement', element: candidate });
  if (!result.committed) result.diagnostics.forEach(d => addError(d.severity, d.message, 'SysML', d.elementId));
}, [handleExecuteSysmlCommand, addError]);
```

Apply the same structure to relationship update/delete and block delete. Preserve existing validation by keeping it in `sysmlCreationRules` and gateway validation, not React.

- [ ] **Step 4: Run SysML tests and TypeScript**

Run: `npm run test:sysml`

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/services/sysmlCommandGateway.test.ts src/services/sysmlCreationRules.test.ts
git commit -m "refactor(sysml): route model edits through command gateway"
```

### Task 7: Route Parts, Ports, and Connectors Through the Gateway

**Files:**
- Modify: `src/App.tsx:10060-10410`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/engine/sysml/ports.test.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`

**Interfaces:**
- Consumes: repository-level type resolution and port validation
- Produces: no-silent-creation diagnostics from all property/port creation paths

- [ ] **Step 1: Add failing tests for typed property and port creation**

```ts
it('returns TYPE_NOT_FOUND when a requested PartProperty type is absent', () => {
  const result = createTypedUsageCommand(repo, { ownerId: 'vehicle', name: 'leftMotor', typeId: 'missing', kind: 'part' });
  expect(result).toMatchObject({ ok: false, code: 'TYPE_NOT_FOUND', action: { type: 'CreateNewType' } });
});

it('does not auto-create an InterfaceBlock for ProxyPort', () => {
  const result = adapter.execute({ type: 'createElement', ownerId: 'vehicle', elementKind: 'ProxyPort', name: 'control' });
  expect(result.committed).toBe(false);
  expect(result.diagnostics[0].code).toBe('TYPE_NOT_FOUND');
});
```

- [ ] **Step 2: Run focused tests and verify failures where UI still bypasses the repository**

Run: `npx vitest run src/engine/sysml/ports.test.ts src/services/sysmlCommandGateway.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

- [ ] **Step 3: Replace part, port, property, and connector setters**

Build each canonical entity first, then dispatch exactly one `createElement` or `updateElement` command. For missing types, propagate the existing structured result:

```ts
if (!resolved.ok) {
  addError('error', resolved.message, 'SysML');
  setPendingCreateNewTypeAction(resolved.action);
  return;
}
handleExecuteSysmlCommand({ type: 'createElement', element: createPartUsage({
  ownerId: currentLayerId,
  typeId: resolved.type.id,
  name,
  aggregation: 'composite',
}) });
```

Standard Port must remain `kind: 'standard'`; FullPort `kind: 'full'`; ProxyPort `kind: 'proxy'` with an InterfaceBlock type; legacy FlowPort `kind: 'flow'`.

- [ ] **Step 4: Run port, gateway, and conformance tests**

Run: `npx vitest run src/engine/sysml/ports.test.ts src/engine/sysml/conformanceManifest.test.ts src/services/sysmlCommandGateway.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts src/engine/sysml/ports.test.ts src/services/sysmlCommandGateway.test.ts
git commit -m "refactor(sysml): canonicalize properties ports and connectors"
```

### Task 8: Remove Legacy Semantic Writeback and Enforce the Boundary

**Files:**
- Modify: `src/App.tsx:6220-6250`
- Modify: `scripts/verify_sysml_architecture.ts`
- Modify: `src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts`
- Create: `src/engine/sysml/repositoryPresentationReleaseGate.test.ts`

**Interfaces:**
- Removes: `mergeLegacyDiagramIntoRepository` effect from runtime mutation flow
- Enforces: semantic arrays are gateway projections only

- [ ] **Step 1: Add the repository/presentation release gate**

```ts
it('keeps one Block identity across Requirements and BDD and separates both deletion modes', () => {
  const block: BlockDefinition = {
    id: 'blk-motor', name: 'Motor', kind: 'block', namespace: [], ownerId: 'model',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  };
  const initial = createSysmlGatewayState();
  const created = executeSysmlCommand(initial, {
    type: 'createAndPresent', element: block, diagramId: 'requirements', presentation: { x: 0, y: 0 },
  });
  let state: SysmlGatewayState = created;
  state = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'bdd', elementIds: ['blk-motor'] });
  expect(Object.keys(state.repository.definitions)).toEqual(['blk-motor']);

  state = executeSysmlCommand(state, { type: 'removeFromDiagram', diagramId: 'requirements', elementIds: ['blk-motor'] });
  expect(state.repository.definitions['blk-motor']).toBeDefined();
  expect(state.diagramPresentations.bdd.elementIds).toContain('blk-motor');

  const preflight = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['blk-motor'] });
  const deleted = preflight.impact
    ? executeSysmlCommand(state, {
        type: 'deleteElements', elementIds: ['blk-motor'], confirmedImpactHash: computeImpactHash(preflight.impact),
      })
    : preflight;
  state = deleted;
  expect(state.repository.definitions['blk-motor']).toBeUndefined();
  expect(state.diagramPresentations.bdd.elementIds).not.toContain('blk-motor');
});
```

- [ ] **Step 2: Run the release gate before removing the writeback**

Run: `npx vitest run src/engine/sysml/repositoryPresentationReleaseGate.test.ts`

Expected: PASS at gateway level; application architecture check still reports direct semantic writes.

- [ ] **Step 3: Delete the debounced merge effect**

Remove the `useEffect` that calls `mergeLegacyDiagramIntoRepository(previous, { blocks, parts, connectors, relationships })`. Keep projection assignments only inside committed gateway-result handling and load/import migration boundaries.

- [ ] **Step 4: Extend the architecture verifier**

Add forbidden runtime patterns for SysML handlers in `src/App.tsx`:

```ts
const forbidden = [
  /setBlocks\(prev\s*=>\s*\[\.\.\.prev,/,
  /setRelationships\(prev\s*=>\s*\[\.\.\.prev,/,
  /setParts\(prev\s*=>\s*\[\.\.\.prev,/,
  /setConnectors\(prev\s*=>\s*\[\.\.\.prev,/,
  /mergeLegacyDiagramIntoRepository\(/,
];
```

Allow only named load/import/history compatibility functions and require each allowlist entry to include a reason and expiry condition.

- [ ] **Step 5: Run architecture and release gates**

Run: `npm run test:sysml:architecture`

Run: `npm run test:sysml:release-gate`

Expected: zero unallowlisted direct SysML semantic writes and all release gates PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx scripts/verify_sysml_architecture.ts src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts src/engine/sysml/repositoryPresentationReleaseGate.test.ts
git commit -m "refactor(sysml): enforce repository-only semantic writes"
```

### Task 9: Prove Code-Generation Isolation and Compatibility

**Files:**
- Create: `src/utils/stateMachineCodeGenerator.repositoryIsolation.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `generateMISRACCode(chart)` and SysML gateway presentation commands
- Produces: `verify:repository-codegen-isolation` release command

- [ ] **Step 1: Write a deterministic generator-isolation test**

```ts
it('produces identical artifacts before and after SysML presentation changes', () => {
  const chart = flatOrFixture();
  const before = generateMISRACCode(chart);

  const repository = createEmptyRepository();
  repository.definitions['blk-motor'] = {
    id: 'blk-motor', name: 'Motor', kind: 'block', namespace: [], ownerId: 'model',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  };
  let sysml: SysmlGatewayState = createSysmlGatewayState(repository);
  sysml = executeSysmlCommand(sysml, { type: 'addToDiagram', diagramId: 'requirements', elementIds: ['blk-motor'] });
  sysml = executeSysmlCommand(sysml, { type: 'addToDiagram', diagramId: 'bdd', elementIds: ['blk-motor'] });
  sysml = executeSysmlCommand(sysml, { type: 'removeFromDiagram', diagramId: 'requirements', elementIds: ['blk-motor'] });

  const after = generateMISRACCode(chart);
  const stable = (content: string) => content.replace(/Model: ADIA State Machine \| .* UTC/, 'Model: ADIA State Machine | <timestamp> UTC');
  expect(after.errors).toEqual(before.errors);
  expect(after.warnings).toEqual(before.warnings);
  expect(after.files.map(file => [file.name, stable(file.content)]))
    .toEqual(before.files.map(file => [file.name, stable(file.content)]));
});
```

The test must not pass any SysML presentation object to the generator. This is the asserted architectural boundary.

- [ ] **Step 2: Run the isolation and golden tests**

Run: `npx vitest run src/utils/stateMachineCodeGenerator.repositoryIsolation.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts`

Expected: PASS with byte-equivalent artifacts after normalizing the generated timestamp header.

- [ ] **Step 3: Add a release script**

```json
"verify:repository-codegen-isolation": "vitest run src/utils/stateMachineCodeGenerator.repositoryIsolation.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts && npm run verify:sm:codegen"
```

Make `test:sysml:full-release` invoke this command after the SysML release verifier.

- [ ] **Step 4: Run the complete code-generation verification**

Run: `npm run verify:repository-codegen-isolation`

Expected: golden generator tests PASS and `verify_sm_codegen` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachineCodeGenerator.repositoryIsolation.test.ts package.json
git commit -m "test(codegen): gate SysML presentation isolation"
```

### Task 10: Verify the Complete Cameo-Style User Workflow

**Files:**
- Create: `tests/e2e/sysml-repository-presentation.spec.ts`
- Modify: `tests/e2e/sysml-requirements-existing-block.spec.ts`
- Create: `docs/sysml/compliance-evidence.json`

**Interfaces:**
- Verifies: canvas creation → tree → cross-diagram presentation → rename → remove → delete → generator regression

- [ ] **Step 1: Add the failing end-to-end workflow**

```ts
test('one Block is presented across Requirements and BDD with functional tree actions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Requirements', exact: true }).click();
  await page.getByRole('button', { name: '+ Block', exact: true }).click();
  const motor = page.locator('[role="treeitem"]:has-text("NewBlock")');
  await expect(motor).toHaveCount(1);

  await page.getByRole('button', { name: 'SysML BDD' }).click();
  await motor.click({ button: 'right' });
  await page.getByText('Add to Diagram', { exact: true }).click();
  await expect(page.locator('svg text').filter({ hasText: 'NewBlock' })).toBeVisible();

  await motor.click({ button: 'right' });
  await page.getByText('Rename', { exact: true }).click();
  await page.getByRole('treeitem').getByRole('textbox').fill('BLDCMotor');
  await page.getByRole('treeitem').getByRole('textbox').press('Enter');
  await expect(page.locator('svg text').filter({ hasText: 'BLDCMotor' })).toBeVisible();

  await motor.click({ button: 'right' });
  await page.getByText('Copy', { exact: true }).click();
  await page.locator('[role="treeitem"]:has-text("Model")').click({ button: 'right' });
  await page.getByText('Paste', { exact: true }).click();
  await expect(page.locator('[role="treeitem"]:has-text("BLDCMotor_1")')).toHaveCount(1);

  await page.locator('[role="treeitem"]:has-text("BLDCMotor")').first().click({ button: 'right' });
  await page.getByText('Delete from Model', { exact: true }).click();
  const confirm = page.getByRole('button', { name: /Confirm Delete/i });
  if (await confirm.isVisible()) await confirm.click();
  await expect(page.locator('[role="treeitem"]:has-text("BLDCMotor")')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the new E2E test and verify it fails before final UI wiring**

Run: `npx playwright test tests/e2e/sysml-repository-presentation.spec.ts --reporter=line`

Expected: FAIL at the first remaining unimplemented context-menu or cross-diagram action.

- [ ] **Step 3: Complete UI selectors and feedback wiring without adding semantic mutation paths**

Add stable `data-testid` attributes for the active diagram, explorer action, impact confirmation, and toast diagnostic. The E2E helpers must click real user controls and must not invoke application internals.

- [ ] **Step 4: Record four-level compliance evidence**

Add evidence entries that identify authority, specification section, implementation file, domain type, command, validator, persistence mapping, projection, and automated test. Status may be `COMPLIANT` only when the referenced semantic and E2E tests pass.

- [ ] **Step 5: Run all release checks**

Run: `npm run test:sysml:release`

Run: `npm run test:sysml:architecture`

Run: `npm run test:sysml:release-gate`

Run: `npm run verify:repository-codegen-isolation`

Run: `npx playwright test tests/e2e/sysml-repository-presentation.spec.ts tests/e2e/sysml-requirements-existing-block.spec.ts --reporter=line`

Run: `npx tsc --noEmit`

Expected: every command exits 0; no compliance item is marked `COMPLIANT` without its automated evidence.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/sysml-repository-presentation.spec.ts tests/e2e/sysml-requirements-existing-block.spec.ts docs/sysml/compliance-evidence.json
git commit -m "test(sysml): gate repository presentation workflow"
```

## Final Verification

- [ ] Confirm `git status --short` contains no unintended files.
- [ ] Confirm one Block shown on two diagrams has one semantic ID and two presentation memberships.
- [ ] Confirm `Remove from Diagram` preserves semantics and other presentations.
- [ ] Confirm `Delete from Model` removes semantic closure and all presentations.
- [ ] Confirm every enabled tree action produces a commit, clipboard result, impact request, or diagnostic.
- [ ] Confirm state-machine generated artifacts are unchanged by SysML presentation operations.
- [ ] Confirm the SysML architecture verifier reports zero unallowlisted semantic writes.
- [ ] Push the verified commits to branch `co-work` only after all release commands pass.
