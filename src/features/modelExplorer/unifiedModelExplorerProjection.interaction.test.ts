import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition } from '../../engine/sysml/model';
import { buildUnifiedModelProjection } from './unifiedModelExplorerProjection';

describe('buildUnifiedModelProjection interaction content', () => {
  it('nests lifelines, messages, fragments, ref frames and invariants under their Interaction', () => {
    const repository = createEmptyRepository();
    repository.definitions.Vehicle = { id: 'Vehicle', kind: 'block', name: 'Vehicle', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repository.definitions.main = {
      id: 'main', name: 'Main', kind: 'interaction', namespace: [], ownerId: 'model',
      lifelines: [{ id: 'a', name: 'driver' }, { id: 'b', name: 'car', representsId: 'Vehicle' }],
      messages: [
        { id: 'm2', name: 'stop', order: 2, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b' },
        { id: 'm1', name: 'start', order: 1, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b' },
      ],
      fragments: [{ id: 'f1', operator: 'alt', operands: [{ guard: 'ready', messageIds: ['m1'] }], coveredLifelineIds: ['a', 'b'] }],
      uses: [{ id: 'u1', refersToId: 'other', coveredLifelineIds: ['a'] }],
      stateInvariants: [{ id: 'i1', lifelineId: 'b', stateId: 's1' }],
    } as InteractionDefinition;
    repository.definitions.other = { id: 'other', kind: 'interaction', name: 'Other', namespace: [], ownerId: 'model', lifelines: [], messages: [], fragments: [] } as InteractionDefinition;

    const { nodes } = buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: { states: [], layers: [], transitions: [], junctions: [], diagrams: [], revision: 1 },
      externalModels: [],
      revision: 1,
    });
    const labels = (key: string) => nodes[`sysml:group:main:${key}`].childNodeIds.map(id => nodes[id].label);
    expect(nodes['sysml:element:main'].childNodeIds).toEqual(expect.arrayContaining(
      ['lifelines', 'messages', 'fragments', 'uses', 'invariants'].map(key => `sysml:group:main:${key}`),
    ));
    expect(labels('lifelines')).toEqual(['driver', 'car']);
    expect(labels('messages')).toEqual(['1: start', '2: stop']);
    expect(labels('fragments')).toEqual(['alt [ready]']);
    expect(labels('uses')).toEqual(['ref Other']);
    expect(nodes['sysml:element:b']).toMatchObject({
      kind: 'lifeline', readOnly: true, ownerSemanticId: 'main', parentNodeId: 'sysml:group:main:lifelines', secondaryLabel: ': Vehicle',
    });
    expect(nodes['sysml:element:m1']).toMatchObject({ kind: 'message', readOnly: true, ownerSemanticId: 'main' });
    expect(nodes['sysml:element:f1'].kind).toBe('fragment');
    expect(nodes['sysml:element:u1'].kind).toBe('interactionUse');
    expect(nodes['sysml:element:i1'].kind).toBe('stateInvariant');
  });
});
