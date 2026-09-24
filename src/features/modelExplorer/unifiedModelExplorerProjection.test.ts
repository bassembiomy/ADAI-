import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { buildUnifiedModelProjection } from './unifiedModelExplorerProjection';

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
    repository.usages.part = { id: 'part', name: 'controller', kind: 'part', ownerId: 'model', typeId: 'block' };
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

  it('does not expose a UUID as the port name when the port definition name is missing', () => {
    const repository = createEmptyRepository();
    const uuid = 'e6871056-81d2-429a-9597-48ce068bcdef';
    repository.definitions.block = {
      id: 'block', name: 'Controller', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], operations: [], constraints: [],
      ports: [{ id: uuid, name: uuid, kind: 'proxy', typeId: 'signal', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
    };
    repository.definitions.signal = { id: 'signal', name: 'CommandSignal', namespace: ['model'], ownerId: 'model', kind: 'interface', features: [] };
    repository.usages.part = { id: 'part', name: 'part_3', kind: 'part', ownerId: 'block', typeId: 'block' };
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
});
