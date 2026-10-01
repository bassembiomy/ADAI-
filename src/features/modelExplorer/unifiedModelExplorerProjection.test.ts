import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from '../../engine/sysml/model';
import { ensureDefaultSysmlDiagrams } from '../../services/sysmlDiagramWorkspace';
import { buildUnifiedModelProjection, type UnifiedExplorerInput } from './unifiedModelExplorerProjection';
import { ensureRootStateMachineDiagram } from './adapters/stateMachineExplorerAdapter';

function emptyStateMachine(): UnifiedExplorerInput['stateMachine'] {
  return { states: [], layers: [], transitions: [], junctions: [], diagrams: [], revision: 1 };
}

function defaultWorkspaceInput(): UnifiedExplorerInput {
  const { repository } = ensureDefaultSysmlDiagrams(createEmptyRepository());
  return {
    sysml: repository,
    stateMachine: ensureRootStateMachineDiagram({
      states: [],
      layers: [{ id: 'root', name: 'Root Region', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] }],
      transitions: [],
      junctions: [],
      diagrams: [],
      revision: 1,
    }),
    externalModels: [],
    revision: 1,
  };
}

describe('buildUnifiedModelProjection', () => {
  it('creates ordered pillars and classifies owned external models', () => {
    const repository = createEmptyRepository();
    repository.definitions['block-1'] = {
      id: 'block-1', name: 'Engine', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.requirements['req-1'] = {
      id: 'req-1', name: 'Safety', namespace: ['model'], ownerId: 'model', kind: 'requirement',
      requirementId: 'REQ-1', text: 'safe', status: 'draft', version: '1',
    };
    const projection = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: {
        states: [{ id: 'run', name: 'Run', x: 0, y: 0, width: 1, height: 1, entry: '', during: '', exit: '', isActive: false, color: '#000', parentId: null, children: [], priority: 0, isParallel: false, regionId: null, autostart: false }],
        layers: [{ id: 'root', name: 'Root', parentStateId: null, stateIds: ['run'], transitionIds: [], junctionIds: [] }],
        transitions: [], junctions: [], diagrams: [], revision: 1,
      },
      externalModels: [
        { id: 'global-xb', name: 'Global XBridge', domain: 'xbridges', diagramId: 'xb-diagram' },
        { id: 'state-vlab', name: 'State VLab', domain: 'vlab', ownerStateId: 'run', diagramId: 'vlab-diagram' },
      ],
      revision: 1,
    });

    expect(projection.nodes['project:model'].childNodeIds).toEqual([
      'project:pillar:structural', 'project:pillar:behavior', 'project:pillar:parametric', 'project:pillar:requirements',
    ]);
    expect(projection.nodes['project:pillar:structural'].childNodeIds).toContain('sysml:element:block-1');
    expect(projection.nodes['project:pillar:behavior'].childNodeIds).toContain('sm:machine:main');
    expect(projection.nodes['project:pillar:parametric'].childNodeIds).toContain('xbridges:model:global-xb');
    expect(projection.nodes['sm:state:run'].childNodeIds).toContain('vlab:model:state-vlab');
    expect(projection.nodes['project:pillar:parametric'].childNodeIds).not.toContain('vlab:model:state-vlab');
    expect(projection.nodes['project:pillar:requirements'].childNodeIds).toContain('sysml:element:req-1');
  });

  it('nests requirements according to requirement containment relationships', () => {
    const repository = createEmptyRepository();
    repository.requirements.parent = {
      id: 'parent', name: 'Parent', namespace: ['model'], ownerId: 'model', kind: 'requirement',
      requirementId: 'REQ-P', text: 'parent', status: 'draft', version: '1',
    };
    repository.requirements.child = {
      id: 'child', name: 'Child', namespace: ['model'], ownerId: 'model', kind: 'requirement',
      requirementId: 'REQ-C', text: 'child', status: 'draft', version: '1',
    };
    repository.relationships.contains = {
      id: 'contains', kind: 'requirementContainment', sourceId: 'parent', targetId: 'child',
    };
    const projection = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: { states: [], layers: [], transitions: [], junctions: [], diagrams: [], revision: 1 },
      externalModels: [],
      revision: 1,
    });

    const parent = projection.nodes['sysml:element:parent'];
    const child = projection.nodes['sysml:element:child'];
    const requirements = projection.nodes['project:pillar:requirements'];
    expect(parent.parentNodeId).toBe(requirements.nodeId);
    expect(parent.childNodeIds).toContain(child.nodeId);
    expect(child.parentNodeId).toBe(parent.nodeId);
    expect(requirements.childNodeIds).not.toContain(child.nodeId);
  });

  it('shows a port usage name with its resolved type and direction', () => {
    const repository = createEmptyRepository();
    repository.definitions.block = {
      id: 'block', name: 'Controller', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], operations: [], constraints: [],
      ports: [{ id: 'port-def', name: 'command', kind: 'proxy', typeId: 'signal', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
    };
    repository.definitions.signal = { id: 'signal', name: 'CommandSignal', namespace: ['model'], ownerId: 'model', kind: 'interface', features: [] };
    repository.usages.part = { id: 'part', name: 'controller', kind: 'part', ownerId: 'model', typeId: 'block', aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } };
    repository.usages.port = { id: 'port', name: 'port', kind: 'port', ownerId: 'part', definitionId: 'port-def' };
    const projection = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: { states: [], layers: [], transitions: [], junctions: [], diagrams: [], revision: 1 },
      externalModels: [],
      revision: 1,
    });

    expect(projection.nodes['sysml:element:port']).toMatchObject({
      label: 'command',
      secondaryLabel: ': CommandSignal · in',
    });
  });

  it('projects BlockDefinition ports as children of their owning Block', () => {
    const repository = createEmptyRepository();
    repository.definitions.block = {
      id: 'block', name: 'Vehicle', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [],
      ports: [{ id: 'port-standard', name: 'power', kind: 'standard', typeId: '', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
      operations: [], constraints: [],
    };

    const projection = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: { states: [], layers: [], transitions: [], junctions: [], diagrams: [] },
      externalModels: [],
      revision: 0,
    });

    expect(projection.nodes['sysml:element:port-standard']).toMatchObject({
      semanticId: 'port-standard', kind: 'port', label: 'power', parentNodeId: 'sysml:element:block', ownerSemanticId: 'block',
    });
    expect(projection.nodes['sysml:element:block'].childNodeIds).toContain('sysml:element:port-standard');
    expect(projection.nodes['sysml:element:block'].hasChildren).toBe(true);
  });

  it('places default diagrams under Structural, Requirements, and Behavior', () => {
    const projection = buildUnifiedModelProjection(defaultWorkspaceInput());
    expect(projection.nodes['sysml:element:adia-default-bdd'].parentNodeId).toBe('project:pillar:structural');
    expect(projection.nodes['sysml:element:adia-default-requirements'].parentNodeId).toBe('project:pillar:requirements');
    expect(projection.nodes['sm:diagram:adia-default-state-machine'].parentNodeId).toBe('project:pillar:behavior');
  });

  it('keeps nested state-machine diagrams under their Region', () => {
    const input = defaultWorkspaceInput();
    input.stateMachine = {
      ...input.stateMachine,
      states: [
        {
          id: 's1', name: 'S1', x: 0, y: 0, width: 1, height: 1, entry: '', during: '', exit: '',
          isActive: false, color: '#000', parentId: 'root', children: ['region-1'], priority: 0,
          isParallel: false, regionId: 'root', autostart: false,
        },
      ],
      layers: [
        { id: 'root', name: 'Root Region', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] },
        { id: 'region-1', name: 'Region 1', parentStateId: 's1', stateIds: [], transitionIds: [], junctionIds: [] },
      ],
      diagrams: [
        ...(input.stateMachine.diagrams ?? []),
        { id: 'nested-sm', name: 'Nested SM', ownerId: 'region-1', contextRegionId: 'region-1' },
      ],
    };
    const projection = buildUnifiedModelProjection(input);
    expect(projection.nodes['sm:diagram:nested-sm'].parentNodeId).toBe('sm:region:region-1');
    expect(projection.nodes['sm:diagram:adia-default-state-machine'].parentNodeId).toBe('project:pillar:behavior');
  });

  it('groups BDD-presented elements under the diagram while preserving their semantic owner', () => {
    const repository = createEmptyRepository();
    repository.definitions['block-1'] = {
      id: 'block-1', name: 'Engine', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.diagrams['bdd-1'] = {
      id: 'bdd-1', name: 'Engine BDD', namespace: ['model'], ownerId: 'model', kind: 'diagram', diagramKind: 'bdd',
    };
    const projection = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: emptyStateMachine(),
      externalModels: [],
      revision: 1,
      diagramPresentations: { 'bdd-1': { elementIds: ['block-1'] } },
    });

    expect(projection.nodes['sysml:element:block-1']).toMatchObject({
      parentNodeId: 'sysml:element:bdd-1',
      ownerSemanticId: 'model',
    });
    expect(projection.nodes['sysml:element:bdd-1'].childNodeIds).toContain('sysml:element:block-1');
    // One primary containment location: the semantic pillar no longer lists it.
    expect(projection.nodes['project:pillar:structural'].childNodeIds).not.toContain('sysml:element:block-1');
  });

  it('groups requirements-diagram content under that diagram', () => {
    const repository = createEmptyRepository();
    repository.requirements['req-1'] = {
      id: 'req-1', name: 'Safety', namespace: ['model'], ownerId: 'model', kind: 'requirement',
      requirementId: 'REQ-1', text: 'safe', status: 'draft', version: '1',
    };
    repository.diagrams['req-diagram-1'] = {
      id: 'req-diagram-1', name: 'Safety Requirements', namespace: ['model'], ownerId: 'model',
      kind: 'diagram', diagramKind: 'requirements',
    };
    const projection = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: emptyStateMachine(),
      externalModels: [],
      revision: 1,
      diagramPresentations: { 'req-diagram-1': { elementIds: ['req-1'] } },
    });

    expect(projection.nodes['sysml:element:req-1']).toMatchObject({
      parentNodeId: 'sysml:element:req-diagram-1',
      ownerSemanticId: 'model',
    });
    expect(projection.nodes['project:pillar:requirements'].childNodeIds)
      .not.toContain('sysml:element:req-1');
  });

  it('groups parametric-diagram content and classifies parametric diagrams under the Parametric pillar', () => {
    const repository = createEmptyRepository();
    repository.definitions['block-1'] = {
      id: 'block-1', name: 'Engine', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.usages['constraint-1'] = {
      id: 'constraint-1', name: 'Torque Constraint', kind: 'part', ownerId: 'block-1', typeId: 'block-1',
      aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    // The canonical SysML domain accepts a parametric DiagramKind; the legacy V3
    // record type is narrower than the domain it serializes.
    repository.diagrams['parametric-1'] = {
      id: 'parametric-1', name: 'Engine Parametric', namespace: ['model'], ownerId: 'block-1',
      kind: 'diagram', diagramKind: 'parametric',
    } as unknown as SysmlRepository['diagrams'][string];
    repository.diagrams['parametric-orphan'] = {
      id: 'parametric-orphan', name: 'Orphan Parametric', namespace: ['model'], ownerId: 'missing-owner',
      kind: 'diagram', diagramKind: 'parametric',
    } as unknown as SysmlRepository['diagrams'][string];
    const projection = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: emptyStateMachine(),
      externalModels: [],
      revision: 1,
      diagramPresentations: { 'parametric-1': { elementIds: ['constraint-1'] } },
    });

    expect(projection.nodes['sysml:element:constraint-1']).toMatchObject({
      parentNodeId: 'sysml:element:parametric-1',
      ownerSemanticId: 'block-1',
    });
    expect(projection.nodes['project:pillar:parametric'].childNodeIds)
      .toContain('sysml:element:parametric-orphan');
    expect(projection.nodes['project:pillar:structural'].childNodeIds)
      .not.toContain('sysml:element:parametric-orphan');
  });

  it('groups state-machine states and junctions under the diagram that presents them', () => {
    const input = defaultWorkspaceInput();
    input.stateMachine = ensureRootStateMachineDiagram({
      states: [
        {
          id: 's1', name: 'S1', x: 0, y: 0, width: 1, height: 1, entry: '', during: '', exit: '',
          isActive: false, color: '#000', parentId: 'root', children: ['region-1'], priority: 0,
          isParallel: false, regionId: 'root', autostart: false,
        },
        {
          id: 's2', name: 'S2', x: 0, y: 0, width: 1, height: 1, entry: '', during: '', exit: '',
          isActive: false, color: '#000', parentId: 'region-1', children: [], priority: 0,
          isParallel: false, regionId: 'region-1', autostart: false,
        },
      ],
      layers: [
        { id: 'root', name: 'Root Region', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] },
        { id: 'region-1', name: 'Region 1', parentStateId: 's1', stateIds: ['s2'], transitionIds: [], junctionIds: ['j1'] },
      ],
      transitions: [],
      junctions: [{ id: 'j1', name: 'J1', type: 'junction', x: 0, y: 0, color: '#000', parentId: 'region-1' }],
      diagrams: [{ id: 'nested-sm-1', name: 'Nested SM', ownerId: 'region-1', contextRegionId: 'region-1' }],
      revision: 1,
    });
    const projection = buildUnifiedModelProjection(input);

    expect(projection.nodes['sm:state:s1']).toMatchObject({
      parentNodeId: 'sm:diagram:adia-default-state-machine',
      ownerSemanticId: 'root',
    });
    expect(projection.nodes['sm:state:s2']).toMatchObject({
      parentNodeId: 'sm:diagram:nested-sm-1',
      ownerSemanticId: 'region-1',
    });
    expect(projection.nodes['sm:junction:j1']).toMatchObject({
      parentNodeId: 'sm:diagram:nested-sm-1',
      ownerSemanticId: 'region-1',
    });
    // A diagram keeps its semantic parent: grouping is presentation, not ownership.
    expect(projection.nodes['sm:diagram:nested-sm-1'].parentNodeId).toBe('sm:region:region-1');
    expect(projection.nodes['sm:region:region-1'].parentNodeId).toBe('sm:state:s1');
  });

  it('ignores stale presentation IDs and never nests a diagram inside its own presenter', () => {
    const repository = createEmptyRepository();
    repository.definitions['block-1'] = {
      id: 'block-1', name: 'Engine', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    // A block-owned diagram that also presents its owner must not become the
    // parent of that owner: the two would form a containment cycle.
    repository.diagrams['bdd-1'] = {
      id: 'bdd-1', name: 'Engine BDD', namespace: ['model'], ownerId: 'block-1', kind: 'diagram', diagramKind: 'bdd',
    };
    const projection = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: emptyStateMachine(),
      externalModels: [],
      revision: 1,
      diagramPresentations: { 'bdd-1': { elementIds: ['block-1', 'deleted-element'] } },
    });

    expect(projection.nodes['sysml:element:deleted-element']).toBeUndefined();
    expect(projection.nodes['sysml:element:block-1'].parentNodeId).toBe('project:pillar:structural');
    expect(projection.nodes['sysml:element:bdd-1'].parentNodeId).toBe('sysml:element:block-1');
    expect(projection.nodes['sysml:element:block-1'].childNodeIds).toContain('sysml:element:bdd-1');
  });

  it('does not expose a UUID as the port name when the port definition name is missing', () => {
    const repository = createEmptyRepository();
    const uuid = 'e6871056-81d2-429a-9597-48ce068bcdef';
    repository.definitions.block = {
      id: 'block', name: 'Controller', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], operations: [], constraints: [],
      ports: [{ id: uuid, name: uuid, kind: 'proxy', typeId: 'signal', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
    };
    repository.definitions.signal = { id: 'signal', name: 'CommandSignal', namespace: ['model'], ownerId: 'model', kind: 'interface', features: [] };
    repository.usages.part = { id: 'part', name: 'part_3', kind: 'part', ownerId: 'block', typeId: 'block', aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } };
    repository.usages[uuid] = { id: uuid, name: uuid, kind: 'port', ownerId: 'part', definitionId: uuid };
    const projection = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: { states: [], layers: [], transitions: [], junctions: [], diagrams: [], revision: 1 },
      externalModels: [],
      revision: 1,
    });

    expect(projection.nodes[`sysml:element:${uuid}`]).toMatchObject({
      label: 'Port 1',
      secondaryLabel: `: CommandSignal · in · ID ${uuid}`,
    });
  });

  it('projects structural, behavioral, requirement, and relationship elements', () => {
    const fullRepositoryFixture: UnifiedExplorerInput = {
      sysml: {
        ...createEmptyRepository(),
        definitions: {
          'block-1': {
            id: 'block-1',
            name: 'Block1',
            namespace: ['model'],
            ownerId: 'model',
            kind: 'block',
            isAbstract: false,
            isLeaf: false,
            properties: [
              { id: 'property-1', name: 'prop1', kind: 'part', typeId: 'block-1', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
            ],
            ports: [
              { id: 'port-1', name: 'port1', kind: 'proxy', typeId: 'signal', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
            ],
            operations: ['operation-1'],
            constraints: [],
          },
        },
        elements: {
          'block-1': { id: 'block-1', name: 'Block1', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' },
          'port-1': { id: 'port-1', name: 'port1', metaclass: 'Port', namespace: [], ownerId: 'block-1', typeId: 'signal', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true }, portKind: 'proxyPort' },
          'property-1': { id: 'property-1', name: 'prop1', metaclass: 'PartProperty', namespace: [], ownerId: 'block-1', typeId: 'block-1', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true }, aggregation: 'composite' },
          'operation-1': { id: 'operation-1', name: 'op1', metaclass: 'Operation', namespace: [], ownerId: 'block-1', parameterIds: [] },
          'transition-1': { id: 'transition-1', name: 'trans1', metaclass: 'Transition', namespace: [], ownerId: 'block-1' },
          'activity-edge-1': { id: 'activity-edge-1', name: 'edge1', metaclass: 'ControlFlow', namespace: [], ownerId: 'block-1' },
        },
        relationships: {
          'connector-1': {
            id: 'connector-1',
            name: 'connector1',
            metaclass: 'Connector',
            sourceId: 'port-1',
            targetId: 'port-2',
            sourceEnd: { id: 'connector-end-a', roleId: 'port-1' },
            targetEnd: { id: 'connector-end-b', roleId: 'port-2' },
          },
          'allocate-1': {
            id: 'allocate-1',
            name: 'allocate1',
            metaclass: 'Allocate',
            sourceId: 'block-1',
            targetId: 'subsystem-1',
          },
          'satisfy-1': {
            id: 'satisfy-1',
            name: 'satisfy1',
            metaclass: 'Satisfy',
            sourceId: 'block-1',
            targetId: 'req-1',
          },
        },
        itemFlows: {
          'item-flow-1': {
            id: 'item-flow-1',
            name: 'itemFlow1',
            realizingRelationshipId: 'connector-1',
            conveyedClassifierIds: ['signal-1'],
            sourceId: 'port-1',
            targetId: 'port-2',
          },
        },
        diagrams: {
          'diagram-2': {
            id: 'diagram-2',
            name: 'Other Diagram',
            namespace: [],
            ownerId: 'model',
            kind: 'diagram',
            diagramKind: 'bdd',
          },
        },
      } as any,
      stateMachine: emptyStateMachine(),
      externalModels: [],
      revision: 1,
      diagramPresentations: {
        'diagram-2': { elementIds: ['port-1'] },
      },
    };

    const projection = buildUnifiedModelProjection(fullRepositoryFixture);
    for (const id of ['port-1', 'property-1', 'operation-1', 'connector-1', 'connector-end-a', 'item-flow-1', 'allocate-1', 'transition-1', 'activity-edge-1', 'satisfy-1']) {
      expect(projection.nodes[`sysml:element:${id}`], id).toBeDefined();
    }
  });

  it('nests by semantic owner even when presented on another diagram', () => {
    const fullRepositoryFixture: UnifiedExplorerInput = {
      sysml: {
        ...createEmptyRepository(),
        definitions: {
          'block-1': {
            id: 'block-1',
            name: 'Block1',
            namespace: ['model'],
            ownerId: 'model',
            kind: 'block',
            isAbstract: false,
            isLeaf: false,
            properties: [],
            ports: [
              { id: 'port-1', name: 'port1', kind: 'proxy', typeId: 'signal', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
            ],
            operations: [],
            constraints: [],
          },
        },
        diagrams: {
          'diagram-2': {
            id: 'diagram-2',
            name: 'Other Diagram',
            namespace: [],
            ownerId: 'model',
            kind: 'diagram',
            diagramKind: 'bdd',
          },
        },
      } as any,
      stateMachine: emptyStateMachine(),
      externalModels: [],
      revision: 1,
      diagramPresentations: {
        'diagram-2': { elementIds: ['port-1'] },
      },
    };

    const projection = buildUnifiedModelProjection(fullRepositoryFixture);
    expect(projection.nodes['sysml:element:port-1'].ownerSemanticId).toBe('block-1');
    expect(projection.nodes['sysml:element:port-1'].parentNodeId).toBe('sysml:element:block-1');
  });
});

