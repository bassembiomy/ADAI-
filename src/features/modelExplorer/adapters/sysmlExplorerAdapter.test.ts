import { describe, expect, it, vi } from 'vitest';
import { createSysmlExplorerAdapter } from './sysmlExplorerAdapter';
import type { ModelExplorerCommand } from '../modelExplorerTypes';
import { createSysmlGatewayState, executeSysmlCommand, projectLegacyDiagram, type SysmlGatewayState } from '../../../services/sysmlCommandGateway';
import { createEmptyRepository, type BlockDefinition, type InterfaceDefinition, type PartUsage, type RequirementDefinition, type SysmlRelationship } from '../../../engine/sysml/model';
import { buildCreateOwnedPortCommand, type CanonicalPortKind } from '../../../services/sysmlOwnedFeatureCommands';
import { createModelExplorerCommandBus } from '../modelExplorerCommandBus';

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
  it.each([
    ['PartProperty', ['owner', 'block-type']],
    ['ReferenceProperty', ['owner', 'block-type']],
    ['ValueProperty', ['value-type']],
    ['ProxyPort', ['interface-type']],
    ['FullPort', ['owner', 'block-type', 'value-type']],
    ['FlowPort', ['owner', 'block-type', 'value-type', 'interface-type']],
  ])('requests explicit compatible types for %s without dispatch', (elementKind, candidateIds) => {
    const harness = createTestHarness();
    const owner: BlockDefinition = { id: 'owner', name: 'Owner', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    harness.executeCommand({ type: 'createElement', element: owner });
    harness.executeCommand({ type: 'createElement', element: { ...owner, id: 'block-type', name: 'Motor' } });
    harness.executeCommand({ type: 'createElement', element: { id: 'value-type', name: 'Voltage', kind: 'valueType', namespace: [], ownerId: 'model' } });
    harness.executeCommand({ type: 'createElement', element: { id: 'interface-type', name: 'Signals', kind: 'interface', namespace: [], ownerId: 'model', features: [] } });
    const revision = harness.state.repository.revision;
    const dispatch = vi.spyOn(harness, 'executeCommand');
    const adapter = createSysmlExplorerAdapter(harness);
    const result = createModelExplorerCommandBus(adapter).dispatch({ type: 'createElement', ownerId: owner.id, elementKind, name: 'newFeature' });
    expect(result.committed).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'TYPE_NOT_FOUND', severity: 'error' }));
    expect(result.typeSelection?.candidates.map(candidate => candidate.id)).toEqual(candidateIds);
    expect(result.typeSelection?.action.kind).toBe('CreateNewType');
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.state.repository.revision).toBe(revision);
  });

  it('direct execute preserves the missing-type chooser and does not mutate', () => {
    const harness = createTestHarness();
    const owner: BlockDefinition = { id: 'owner', name: 'Owner', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    harness.executeCommand({ type: 'createElement', element: owner });
    harness.executeCommand({ type: 'createElement', element: { id: 'interface-type', name: 'Signals', kind: 'interface', namespace: [], ownerId: 'model', features: [] } });
    const revision = harness.state.repository.revision;
    const dispatch = vi.spyOn(harness, 'executeCommand');
    const result = createSysmlExplorerAdapter(harness).execute({ type: 'createElement', ownerId: owner.id, elementKind: 'ProxyPort', name: 'proxy' });
    expect(result.committed).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'TYPE_NOT_FOUND', severity: 'error' }));
    expect(result.typeSelection).toMatchObject({ candidates: [{ id: 'interface-type' }], action: { kind: 'CreateNewType' } });
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.state.repository.revision).toBe(revision);
  });

  it('returns TYPE_NOT_FOUND with an empty chooser and CreateNewType when no compatible type exists', () => {
    const harness = createTestHarness();
    const owner: BlockDefinition = { id: 'owner', name: 'Owner', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    harness.executeCommand({ type: 'createElement', element: owner });
    const revision = harness.state.repository.revision;
    const dispatch = vi.spyOn(harness, 'executeCommand');
    const result = createModelExplorerCommandBus(createSysmlExplorerAdapter(harness)).dispatch({ type: 'createElement', ownerId: owner.id, elementKind: 'ProxyPort', name: 'proxy' });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'TYPE_NOT_FOUND' }));
    expect(result.typeSelection).toMatchObject({ candidates: [], action: { kind: 'CreateNewType' } });
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.state.repository.revision).toBe(revision);
  });

  it('creates an untyped Standard UML Port without a type-selection request', () => {
    const harness = createTestHarness();
    const owner: BlockDefinition = { id: 'owner', name: 'Owner', kind: 'block', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    harness.executeCommand({ type: 'createElement', element: owner });
    const result = createModelExplorerCommandBus(createSysmlExplorerAdapter(harness)).dispatch({ type: 'createElement', ownerId: owner.id, elementKind: 'Port', name: 'standard' });
    expect(result.committed).toBe(true);
    expect(result.typeSelection).toBeUndefined();
    expect((harness.state.repository.definitions[owner.id] as BlockDefinition).ports[0]).toMatchObject({ kind: 'standard', typeId: '' });
  });
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
      'bdd-1': { elementIds: [], presentations: {} },
    };

    const adapter = createSysmlExplorerAdapter(harness);
    const labels = adapter.capabilities(['block-1'], 'bdd-1').filter(x => x.enabled).map(x => x.label);
    expect(labels).toContain('Part');
    expect(labels).toContain('Proxy Port');
    expect(labels).not.toContain('Region');

    const result = adapter.execute({ type: 'createElement', ownerId: 'block-1', elementKind: 'part', name: 'controller', typeId: block.id });
    expect(result.committed).toBe(true);
    expect(harness.state.diagramPresentations?.['bdd-1']?.elementIds).not.toContain(result.selectedIds?.[0]);
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
      type: 'createElement', ownerId: owner.id, elementKind: 'PartProperty', name: 'part1', typeId: type.id,
    });

    expect(result.committed).toBe(true);
    expect(harness.state.repository.usages[result.selectedIds![0]]).toMatchObject({
      ownerId: owner.id,
      kind: 'part',
    });
    const usage = harness.state.repository.usages[result.selectedIds![0]] as PartUsage;
    expect(usage.propertyId).toEqual(expect.any(String));
    expect(harness.state.repository.definitions[owner.id].kind).toBe('block');
    expect((harness.state.repository.definitions[owner.id] as BlockDefinition).properties).toContainEqual(expect.objectContaining({
      id: usage.propertyId,
      name: 'part1',
      kind: 'part',
      typeId: type.id,
    }));

    const undone = harness.executeCommand({ type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(undone.repository.usages[usage.id]).toBeUndefined();
    expect((undone.repository.definitions[owner.id] as BlockDefinition).properties).toEqual([]);
  });

  it('pastes a standalone PartProperty through the atomic owner-property command', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);
    const ownerId = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Vehicle' }).selectedIds![0];
    const motorId = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Motor' }).selectedIds![0];
    const targetId = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Fleet' }).selectedIds![0];
    const originalId = adapter.execute({ type: 'createElement', ownerId, elementKind: 'PartProperty', name: 'leftMotor', typeId: motorId }).selectedIds![0];
    const original = harness.state.repository.usages[originalId] as PartUsage;
    const copied = adapter.execute({ type: 'copy', elementIds: [originalId] }).clipboard!;

    const pasted = adapter.execute({ type: 'paste', payload: copied, targetOwnerId: targetId, mode: 'copy' });

    expect(pasted.committed).toBe(true);
    const pastedUsage = harness.state.repository.usages[pasted.selectedIds![0]] as PartUsage;
    expect(pastedUsage.ownerId).toBe(targetId);
    expect(pastedUsage.propertyId).not.toBe(original.propertyId);
    expect((harness.state.repository.definitions[targetId] as BlockDefinition).properties).toContainEqual(expect.objectContaining({
      id: pastedUsage.propertyId,
      name: pastedUsage.name,
      typeId: pastedUsage.typeId,
    }));
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
      const result = adapter.execute({ type: 'createElement', ownerId: owner.id, elementKind, name,
        typeId: elementKind === 'proxyPort' ? interfaceType.id : elementKind === 'Port' ? undefined : owner.id });
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
    harness.executeCommand({ type: 'createElement', element: { id: 'capability-value', name: 'Voltage', kind: 'valueType', namespace: [], ownerId: 'model' } });
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
          typeId: ['ProxyPort', 'proxyPort'].includes(capability.elementKind ?? '') ? interfaceType.id
            : ['ValueProperty', 'valueProperty'].includes(capability.elementKind ?? '') ? 'capability-value'
              : ['PartProperty', 'part', 'sharedPart', 'ReferenceProperty', 'reference', 'FullPort', 'fullPort', 'FlowPort', 'flowPort'].includes(capability.elementKind ?? '') ? type.id : undefined,
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

  it('offers allocate targets for a part-usage source id', () => {
    const harness = createTestHarness();
    const vehicle: BlockDefinition = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const battery: BlockDefinition = {
      id: 'battery', name: 'Battery', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    harness.executeCommand({ type: 'createElement', element: vehicle });
    harness.executeCommand({ type: 'createElement', element: battery });
    harness.state.repository.usages['usage-motor'] = {
      id: 'usage-motor', kind: 'part', name: 'motor', ownerId: 'vehicle', typeId: 'vehicle',
      aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    const adapter = createSysmlExplorerAdapter(harness);
    const targets = adapter.relationshipTargets('usage-motor', 'allocation', 'outgoing');
    expect(targets.map(node => node.semanticId)).toContain('battery');
    const satisfyTargets = adapter.relationshipTargets('usage-motor', 'satisfy', 'outgoing');
    expect(Array.isArray(satisfyTargets)).toBe(true);
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

  it('creates a repository-backed Package Diagram under Model', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);
    const result = adapter.execute({ type: 'createDiagram', ownerId: 'model', diagramKind: 'package', name: 'Package Map' });
    expect(result.committed).toBe(true);
    const id = result.selectedIds?.[0]!;
    expect(harness.state.repository.diagrams[id]).toMatchObject({ id, diagramKind: 'package', ownerId: 'model', name: 'Package Map' });
    expect(harness.state.diagramPresentations?.[id]?.elementIds).toEqual([]);
  });

  it('offers Show Contents for a Package on a Package Diagram and presents owned members', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);
    const packageId = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'package', name: 'Vehicle' }).selectedIds![0];
    const blockId = adapter.execute({ type: 'createElement', ownerId: packageId, elementKind: 'block', name: 'Motor' }).selectedIds![0];
    const diagramId = adapter.execute({ type: 'createDiagram', ownerId: packageId, diagramKind: 'package', name: 'Structure' }).selectedIds![0];
    expect(adapter.capabilities([packageId], diagramId)).toContainEqual(expect.objectContaining({ kind: 'showPackageContents', enabled: true }));
    const result = adapter.execute({ type: 'showPackageContents', diagramId, packageId, mode: 'direct' });
    expect(result.committed).toBe(true);
    expect(harness.state.diagramPresentations?.[diagramId].elementIds).toContain(blockId);
    expect(harness.state.repository.definitions[blockId].ownerId).toBe(packageId);
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
      'bdd-1': { elementIds: ['block-1'], presentations: {} },
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
      requirements: { elementIds: [blockId], presentations: {} },
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

  it('returns material gateway impact when deleting a Block with owned features and presentations', () => {
    const repository = createEmptyRepository();
    const vehicle: BlockDefinition = {
      id: 'block-vehicle', name: 'Vehicle', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const motor: BlockDefinition = {
      id: 'block-motor', name: 'Motor', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const leftMotor: PartUsage = {
      id: 'part-left-motor', name: 'leftMotor', kind: 'part', ownerId: motor.id, typeId: vehicle.id,
      aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    const requirement: RequirementDefinition = {
      id: 'req-001', name: 'REQ-001', kind: 'requirement', namespace: [], requirementId: 'REQ-001',
      text: 'Motor shall run', status: 'approved', version: '1', priority: 'high', risk: 'medium',
    };
    const satisfy: SysmlRelationship = {
      id: 'satisfy-motor-req', kind: 'satisfy', sourceId: motor.id, targetId: requirement.id,
    };
    repository.definitions[vehicle.id] = vehicle;
    repository.definitions[motor.id] = motor;
    repository.usages[leftMotor.id] = leftMotor;
    repository.requirements[requirement.id] = requirement;
    repository.relationships[satisfy.id] = satisfy;
    const initial = createSysmlGatewayState(repository, {
      [motor.id]: { x: 10, y: 20 },
      [leftMotor.id]: { x: 30, y: 40 },
    }, {
      bdd: { elementIds: [vehicle.id, motor.id, leftMotor.id] },
      requirements: { elementIds: [motor.id, requirement.id, satisfy.id] },
    });
    const harness = createTestHarness(initial);
    const adapter = createSysmlExplorerAdapter(harness);

    const result = adapter.execute({ type: 'delete', elementIds: [motor.id] });

    expect(result.committed).toBe(false);
    expect(result.impact).toMatchObject({
      descendants: [leftMotor.id],
      relationships: [satisfy.id],
      presentations: expect.arrayContaining([`bdd:${motor.id}`, `bdd:${leftMotor.id}`, `requirements:${motor.id}`, `requirements:${satisfy.id}`]),
    });
    expect(result.impact?.invalidated).toEqual([]);
    expect(result.impactHash).toEqual(expect.any(String));
  });

  it('copies and pastes a Block with owned PartProperty, preserving internal references', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);
    const blkRes = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Car' });
    const blockId = blkRes.selectedIds?.[0]!;
    const wheelRes = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Wheel' });
    const wheelId = wheelRes.selectedIds?.[0]!;
    const partRes = adapter.execute({ type: 'createElement', ownerId: blockId, elementKind: 'part', name: 'leftWheel', typeId: wheelId });
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

  it('guarantees tree and canvas commands produce equivalent Port semantic definitions', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);

    const ownerRes = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Robot' });
    const ownerId = ownerRes.selectedIds![0];
    const typeBlockRes = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'block', name: 'Actuator' });
    const typeBlockId = typeBlockRes.selectedIds![0];
    const ifaceRes = adapter.execute({ type: 'createElement', ownerId: 'model', elementKind: 'interface', name: 'IControl' });
    const ifaceId = ifaceRes.selectedIds![0];

    const testCases: Array<{
      explorerKind: string;
      canonicalKind: CanonicalPortKind;
      typeId?: string;
      expectedKind: string;
      expectedStereotypes: string[];
    }> = [
      {
        explorerKind: 'Port',
        canonicalKind: 'umlPort',
        typeId: undefined,
        expectedKind: 'standard',
        expectedStereotypes: [],
      },
      {
        explorerKind: 'proxyPort',
        canonicalKind: 'proxyPort',
        typeId: ifaceId,
        expectedKind: 'proxy',
        expectedStereotypes: ['ProxyPort'],
      },
      {
        explorerKind: 'fullPort',
        canonicalKind: 'fullPort',
        typeId: typeBlockId,
        expectedKind: 'full',
        expectedStereotypes: ['FullPort'],
      },
      {
        explorerKind: 'flowPort',
        canonicalKind: 'flowPort',
        typeId: typeBlockId,
        expectedKind: 'flow',
        expectedStereotypes: ['FlowPort'],
      },
    ];

    for (const tc of testCases) {
      // Tree execution with selected type
      const treeRes = adapter.execute({
        type: 'createElement',
        ownerId,
        elementKind: tc.explorerKind,
        name: `tree_${tc.explorerKind}`,
        ...({ typeId: tc.typeId } as any),
      });
      expect(treeRes.committed).toBe(true);

      // Canvas command builder execution
      const canvasPlan = buildCreateOwnedPortCommand(harness.state.repository, {
        ownerBlockId: ownerId,
        portKind: tc.canonicalKind,
        name: `canvas_${tc.canonicalKind}`,
        typeId: tc.typeId,
      });
      expect(canvasPlan.ok).toBe(true);
      const canvasRes = harness.executeCommand(canvasPlan.command as any);
      expect(canvasRes.committed).toBe(true);

      const block = harness.state.repository.definitions[ownerId] as BlockDefinition;
      const treePort = block.ports?.find(p => p.name === `tree_${tc.explorerKind}`);
      const canvasPort = block.ports?.find(p => p.name === `canvas_${tc.canonicalKind}`);

      expect(treePort).toBeDefined();
      expect(canvasPort).toBeDefined();
      expect(treePort?.kind).toBe(tc.expectedKind);
      expect(canvasPort?.kind).toBe(tc.expectedKind);
      expect(treePort?.portKind).toBe(tc.canonicalKind);
      expect(canvasPort?.portKind).toBe(tc.canonicalKind);
      expect(treePort?.typeId).toBe(tc.typeId || '');
      expect(canvasPort?.typeId).toBe(tc.typeId || '');
      expect(treePort?.appliedStereotypeIds).toEqual(tc.expectedStereotypes);
      expect(canvasPort?.appliedStereotypeIds).toEqual(tc.expectedStereotypes);
    }
  });

  it('creates TestCase from tree and adds to Requirement Diagram with matching counts and no Block surrogate', () => {
    const harness = createTestHarness();
    const adapter = createSysmlExplorerAdapter(harness);

    harness.state.diagramPresentations = {
      requirements: { elementIds: [], presentations: {} },
    };

    // 1. Create TestCase from tree
    const createRes = adapter.execute({
      type: 'createElement',
      ownerId: 'model',
      elementKind: 'testCase',
      name: 'TC_Safety_Check',
    });
    expect(createRes.committed).toBe(true);

    const tc = Object.values(harness.state.repository.verificationCases).find(v => v.name === 'TC_Safety_Check');
    expect(tc).toBeDefined();
    expect(Object.keys(harness.state.repository.verificationCases)).toHaveLength(1);

    // Assert no surrogate Block in definitions
    expect(harness.state.repository.definitions[tc!.id]).toBeUndefined();
    expect(Object.keys(harness.state.repository.definitions)).toHaveLength(0);

    // 2. Add to Requirement diagram
    const addRes = adapter.execute({
      type: 'addToDiagram',
      diagramId: 'requirements',
      elementIds: [tc!.id],
    });
    expect(addRes.committed).toBe(true);
    expect(harness.state.diagramPresentations.requirements.elementIds).toContain(tc!.id);

    // 3. Verify projection in view
    const view = projectLegacyDiagram(
      harness.state.repository,
      harness.state.coordinates,
      harness.state.diagramPresentations,
      'requirements',
    );
    const projectedBlock = view.blocks.find(b => b.id === tc!.id);
    expect(projectedBlock).toBeDefined();
    expect(projectedBlock?.stereotype).toBe('testCase');

    // 4. Remove from diagram preserves TestCase in repository
    const removeRes = adapter.execute({
      type: 'removeFromDiagram',
      diagramId: 'requirements',
      elementIds: [tc!.id],
    });
    expect(removeRes.committed).toBe(true);
    expect(harness.state.diagramPresentations.requirements.elementIds).not.toContain(tc!.id);
    expect(harness.state.repository.verificationCases[tc!.id]).toBeDefined();
  });

  it('dispatches createOwnedFeature for Part and Value Property creation with selected existing types', () => {
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
    const engine: BlockDefinition = {
      id: 'block-engine',
      name: 'Engine',
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
    const voltage = {
      id: 'type-voltage',
      name: 'Voltage',
      kind: 'valueType' as const,
      namespace: [],
      unit: 'V',
    };
    harness.executeCommand({ type: 'createElement', element: block });
    harness.executeCommand({ type: 'createElement', element: engine });
    harness.executeCommand({ type: 'createElement', element: voltage });

    const adapter = createSysmlExplorerAdapter(harness);
    const spy = vi.spyOn(harness, 'executeCommand');

    // 1. Create Part Property
    const partResult = adapter.execute({
      type: 'createElement',
      ownerId: 'block-1',
      elementKind: 'part',
      name: 'myEngine',
      typeId: engine.id,
    });
    expect(partResult.committed).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'createOwnedFeature',
        intent: expect.objectContaining({
          featureKind: 'property',
          ownerBlockId: 'block-1',
          propertyKind: 'part',
          typeId: 'block-engine',
        }),
      })
    );

    // 2. Create Value Property
    const valueResult = adapter.execute({
      type: 'createElement',
      ownerId: 'block-1',
      elementKind: 'valueProperty',
      name: 'sensorVoltage',
      typeId: voltage.id,
    });
    expect(valueResult.committed).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'createOwnedFeature',
        intent: expect.objectContaining({
          featureKind: 'property',
          ownerBlockId: 'block-1',
          propertyKind: 'value',
          typeId: 'type-voltage',
        }),
      })
    );
  });

  it('returns TYPE_NOT_FOUND and does not commit when no compatible type exists for property creation', () => {
    const harness = createTestHarness();
    const block: BlockDefinition = {
      id: 'block-isolated',
      name: 'IsolatedBlock',
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
    harness.executeCommand({ type: 'createElement', element: block });

    const adapter = createSysmlExplorerAdapter(harness);

    // Value property creation when no ValueType exists in repository
    const valueResult = adapter.execute({
      type: 'createElement',
      ownerId: 'block-isolated',
      elementKind: 'valueProperty',
      name: 'noTypeValue',
    });

    expect(valueResult.committed).toBe(false);
    expect(valueResult.diagnostics.some(d => d.code === 'TYPE_NOT_FOUND')).toBe(true);

    // Part property creation with non-existent typeId
    const partResult = adapter.execute({
      type: 'createElement',
      ownerId: 'block-isolated',
      elementKind: 'part',
      name: 'noTypePart',
      typeId: 'non-existent-type',
    } as any);

    expect(partResult.committed).toBe(false);
    expect(partResult.diagnostics.some(d => d.code === 'TYPE_NOT_FOUND')).toBe(true);
    expect((harness.state.repository.definitions['block-isolated'] as BlockDefinition).properties).toHaveLength(0);
  });
});
