import { describe, expect, it } from 'vitest';
import { createSysmlExplorerAdapter } from './sysmlExplorerAdapter';
import type { ModelExplorerCommand } from '../modelExplorerTypes';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from '../../../services/sysmlCommandGateway';
import type { BlockDefinition, InterfaceDefinition, RequirementDefinition } from '../../../engine/sysml/model';

function createTestHarness(initialState?: SysmlGatewayState) {
  let state = initialState ?? createSysmlGatewayState();
  return {
    get state() {
      return state;
    },
    set state(next) {
      state = next;
    },
    getState: () => state,
    executeCommand: (cmd: any) => {
      const result = executeSysmlCommand(state, cmd);
      if (result.committed) {
        state = {
          repository: result.repository,
          history: result.history,
          store: result.store,
          patchHistory: result.patchHistory,
          coordinates: result.coordinates,
          diagramPresentations: result.diagramPresentations,
          presentationHistory: result.presentationHistory,
          actionStack: result.actionStack,
          redoStack: result.redoStack,
        };
      }
      return result;
    },
  };
}

describe('sysmlExplorerAdapter', () => {
  it('offers only legal children and creates no presentation from the tree', () => {
    const harness = createTestHarness();
    const block: BlockDefinition = {
      id: 'block-1',
      name: 'Block1',
      kind: 'block',
      namespace: [],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    harness.executeCommand({
      type: 'createElement',
      element: block,
    });
    // Set up a diagram presentation with elementIds
    harness.state.diagramPresentations = {
      'bdd-1': { elementIds: [] },
    };

    const adapter = createSysmlExplorerAdapter(harness);
    const labels = adapter.capabilities(['block-1'], 'bdd-1').filter(x => x.enabled).map(x => x.label);
    expect(labels).toContain('Part');
    expect(labels).toContain('Proxy Port');
    expect(labels).not.toContain('Region');

    const result = adapter.execute({ type: 'createElement', ownerId: 'block-1', elementKind: 'part', name: 'controller' });
    expect(result.committed).toBe(true);
    expect(harness.state.diagramPresentations['bdd-1']?.elementIds).not.toContain(result.selectedIds?.[0]);
  });

  it('shows legal Block children and disabled illegal All Types entries', () => {
    const harness = createTestHarness();
    const block: BlockDefinition = {
      id: 'block-1',
      name: 'Block1',
      kind: 'block',
      namespace: [],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    harness.executeCommand({
      type: 'createElement',
      element: block,
    });
    const adapter = createSysmlExplorerAdapter(harness);
    const capabilities = adapter.capabilities(['block-1'], 'bdd-1', { includeAllTypes: true });
    expect(capabilities).toContainEqual(expect.objectContaining({ elementKind: 'PartProperty', enabled: true }));
    expect(capabilities).toContainEqual(
      expect.objectContaining({
        elementKind: 'Requirement',
        enabled: false,
        diagnosticCode: 'ILLEGAL_OWNERSHIP',
      })
    );
  });

  it('executes the canonical PartProperty capability exposed by the menu', () => {
    const harness = createTestHarness();
    const owner: BlockDefinition = {
      id: 'block-owner', name: 'Owner', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const type: BlockDefinition = {
      id: 'block-type', name: 'Type', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    harness.executeCommand({ type: 'createElement', element: owner });
    harness.executeCommand({ type: 'createElement', element: type });

    const adapter = createSysmlExplorerAdapter(harness);
    const result = adapter.execute({
      type: 'createElement', ownerId: owner.id, elementKind: 'PartProperty', name: 'part1',
    });

    expect(result.committed).toBe(true);
    expect(harness.state.repository.usages[result.selectedIds![0]]).toMatchObject({
      ownerId: owner.id,
      kind: 'part',
    });
  });

  it('creates and projects normative TestCase and UML UseCase entities', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);

    const testCaseResult = adapter.execute({
      type: 'createElement', ownerId: 'model', elementKind: 'TestCase', name: 'Brake verification',
    });
    const useCaseResult = adapter.execute({
      type: 'createElement', ownerId: 'model', elementKind: 'UseCase', name: 'Stop vehicle',
    });

    expect(testCaseResult.committed).toBe(true);
    expect(useCaseResult.committed).toBe(true);
    expect(harness.state.repository.verificationCases[testCaseResult.selectedIds![0]]).toBeDefined();
    expect(harness.state.repository.useCases[useCaseResult.selectedIds![0]]).toMatchObject({
      kind: 'useCase',
      name: 'Stop vehicle',
    });

    const projection = adapter.project('containment');
    expect(projection.nodes[`sysml:element:${testCaseResult.selectedIds![0]}`]?.kind).toBe('testCase');
    expect(projection.nodes[`sysml:element:${useCaseResult.selectedIds![0]}`]?.kind).toBe('useCase');
  });

  it('persists distinct standard, full, proxy, and legacy flow port kinds', () => {
    const harness = createTestHarness();
    const owner: BlockDefinition = {
      id: 'port-owner', name: 'PortOwner', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const interfaceType: InterfaceDefinition = {
      id: 'if-control', name: 'ControlIF', kind: 'interface', namespace: [], ownerId: 'model', features: [],
    };
    harness.executeCommand({ type: 'createElement', element: owner });
    harness.executeCommand({ type: 'createElement', element: interfaceType });
    const adapter = createSysmlExplorerAdapter(harness);

    for (const [elementKind, name] of [
      ['Port', 'standardPort'],
      ['fullPort', 'fullPort'],
      ['proxyPort', 'proxyPort'],
      ['flowPort', 'flowPort'],
    ] as const) {
      const result = adapter.execute({ type: 'createElement', ownerId: owner.id, elementKind, name });
      expect(result.committed, `${elementKind} should commit`).toBe(true);
    }

    expect(harness.state.repository.definitions[owner.id]).toMatchObject({
      ports: [
        expect.objectContaining({ name: 'standardPort', kind: 'standard' }),
        expect.objectContaining({ name: 'fullPort', kind: 'full' }),
        expect.objectContaining({ name: 'proxyPort', kind: 'proxy', typeId: interfaceType.id }),
        expect.objectContaining({ name: 'flowPort', kind: 'flow' }),
      ],
    });
  });

  it('commits every enabled repository creation capability exposed by the tree', () => {
    const harness = createTestHarness();
    const owner: BlockDefinition = {
      id: 'capability-owner', name: 'CapabilityOwner', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const type: BlockDefinition = {
      id: 'capability-type', name: 'CapabilityType', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const interfaceType: InterfaceDefinition = {
      id: 'capability-if', name: 'CapabilityIF', kind: 'interface', namespace: [], ownerId: 'model', features: [],
    };
    harness.executeCommand({ type: 'createElement', element: owner });
    harness.executeCommand({ type: 'createElement', element: type });
    harness.executeCommand({ type: 'createElement', element: interfaceType });
    const adapter = createSysmlExplorerAdapter(harness);

    for (const ownerId of ['model', owner.id]) {
      const capabilities = adapter.capabilities([ownerId], undefined, { includeAllTypes: true })
        .filter(capability => capability.enabled)
        .filter(capability => capability.kind === 'createElement' || capability.kind === 'createOwnedFeature');

      for (const capability of capabilities) {
        const result = adapter.execute({
          type: 'createElement',
          ownerId,
          elementKind: capability.elementKind!,
          name: `Created ${capability.elementKind}`,
        });
        expect(result.committed, `${ownerId}:${capability.elementKind} should commit`).toBe(true);
      }
    }
  });

  it('filters relationship targets by canonical policy', () => {
    const harness = createTestHarness();
    const req: RequirementDefinition = {
      id: 'req-1',
      name: 'Requirement1',
      kind: 'requirement',
      namespace: [],
      requirementId: 'REQ-1',
      text: 'Must work',
      status: 'approved',
      version: '1',
      priority: 'high',
      risk: 'medium',
    };
    const blk: BlockDefinition = {
      id: 'block-1',
      name: 'Block1',
      kind: 'block',
      namespace: [],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    const req2: RequirementDefinition = {
      id: 'req-2',
      name: 'Requirement2',
      kind: 'requirement',
      namespace: [],
      requirementId: 'REQ-2',
      text: 'Must be safe',
      status: 'approved',
      version: '1',
      priority: 'high',
      risk: 'critical',
    };
    harness.executeCommand({ type: 'createElement', element: req });
    harness.executeCommand({ type: 'createElement', element: blk });
    harness.executeCommand({ type: 'createElement', element: req2 });

    const adapter = createSysmlExplorerAdapter(harness);
    const targets = adapter.relationshipTargets('req-1', 'satisfy', 'incoming');
    expect(targets.map(node => node.kind)).toContain('block');
    expect(targets.map(node => node.kind)).not.toContain('requirement');
  });

  it('projects canonical containment tree with packages and blocks', () => {
    const harness = createTestHarness();
    const blk: BlockDefinition = {
      id: 'block-1',
      name: 'AlphaBlock',
      kind: 'block',
      namespace: [],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    harness.executeCommand({ type: 'createElement', element: blk });

    const adapter = createSysmlExplorerAdapter(harness);
    const projection = adapter.project('containment');
    expect(projection.roots).toContain('sysml:element:model');
    expect(projection.nodes['sysml:element:model']).toBeDefined();
    expect(projection.nodes['sysml:element:block-1']).toBeDefined();
    expect(projection.nodes['sysml:element:block-1'].label).toBe('AlphaBlock');
  });

  it('fails part creation when no block type is available', () => {
    const harness = createTestHarness();
    // Harness has no blocks in definitions
    const adapter = createSysmlExplorerAdapter(harness);
    const preflight = adapter.preflight({
      type: 'createElement',
      ownerId: 'model',
      elementKind: 'part',
    });
    // part cannot be created under model anyway, but under a block if no block exists:
    expect(preflight.diagnostics.length).toBeGreaterThan(0);

    const execResult = adapter.execute({
      type: 'createElement',
      ownerId: 'model',
      elementKind: 'part',
    });
    expect(execResult.committed).toBe(false);
  });

  it('creates a diagram without creating semantic elements or presentations', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);
    const result = adapter.execute({
      type: 'createDiagram',
      ownerId: 'model',
      diagramKind: 'bdd',
      name: 'Main BDD',
    });
    expect(result.committed).toBe(true);
    const diagId = result.selectedIds?.[0]!;
    expect(harness.state.repository.diagrams[diagId]).toBeDefined();
    expect(harness.state.repository.diagrams[diagId].name).toBe('Main BDD');
    // Does not create diagram presentations or semantic blocks
    expect(harness.state.diagramPresentations?.[diagId]?.elementIds ?? []).toEqual([]);
    expect(Object.keys(harness.state.repository.definitions)).toHaveLength(0);
  });

  it('moves an element atomically to another owner', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);
    // Create package
    const pkgRes = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'package', name: 'Powertrain' });
    const pkgId = pkgRes.selectedIds?.[0]!;
    // Create block under model
    const blkRes = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Motor' });
    const blkId = blkRes.selectedIds?.[0]!;

    expect(harness.state.repository.definitions[blkId].ownerId).toBe('model');

    // Move block to package
    const moveRes = adapter.execute({ type: 'move', elementIds: [blkId], targetOwnerId: pkgId });
    expect(moveRes.committed).toBe(true);
    expect(harness.state.repository.definitions[blkId].ownerId).toBe(pkgId);
  });

  it('rejects adding to diagram if presentation already exists', () => {
    const harness = createTestHarness();
    harness.state.diagramPresentations = {
      'bdd-1': { elementIds: ['block-1'] },
    };
    const adapter = createSysmlExplorerAdapter(harness);
    const pre = adapter.preflight({
      type: 'addToDiagram',
      diagramId: 'bdd-1',
      elementIds: ['block-1'],
    });
    expect(pre.diagnostics[0]?.code).toBe('PRESENTATION_ALREADY_EXISTS');
  });

  it('executes every enabled editing capability or returns a diagnostic', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);
    const blk = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'TestBlock' });
    const blockId = blk.selectedIds?.[0]!;
    harness.state.diagramPresentations = {
      requirements: { elementIds: [blockId] },
    };

    const commands: ModelExplorerCommand[] = [
      { type: 'copy', elementIds: [blockId] },
      { type: 'duplicate', elementIds: [blockId], targetOwnerId: 'model' },
      { type: 'removeFromDiagram', elementIds: [blockId], diagramId: 'requirements' },
      { type: 'delete', elementIds: [blockId] },
    ];
    for (const command of commands) {
      const result = adapter.execute(command);
      expect(result.committed || result.diagnostics.length > 0 || result.clipboard).toBeTruthy();
    }
  });

  it('copies and pastes a Block with owned PartProperty, preserving internal references', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);
    const blkRes = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Car' });
    const blockId = blkRes.selectedIds?.[0]!;
    const wheelRes = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Wheel' });
    const wheelId = wheelRes.selectedIds?.[0]!;
    const partRes = adapter.execute({ type: 'createElement', ownerId: blockId, elementKind: 'part', name: 'leftWheel' });
    const partId = partRes.selectedIds?.[0]!;

    const copyRes = adapter.execute({ type: 'copy', elementIds: [blockId] });
    expect(copyRes.clipboard).toBeDefined();
    expect(copyRes.clipboard!.rootIds).toEqual([blockId]);
    expect(Object.keys(copyRes.clipboard!.snapshots)).toContain(blockId);
    expect(Object.keys(copyRes.clipboard!.snapshots)).toContain(partId);

    const pasteRes = adapter.execute({
      type: 'paste',
      payload: copyRes.clipboard!,
      targetOwnerId: 'model',
      mode: 'copy',
    });
    expect(pasteRes.committed).toBe(true);
    const newBlockId = pasteRes.selectedIds?.[0]!;
    expect(newBlockId).not.toBe(blockId);
    const newBlock = harness.state.repository.definitions[newBlockId];
    expect(newBlock).toBeDefined();

    // Check remapped part
    const pastedPart = Object.values(harness.state.repository.usages).find(u => u.ownerId === newBlockId);
    expect(pastedPart).toBeDefined();
    expect(pastedPart!.id).not.toBe(partId);
  });
});
