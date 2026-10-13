import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRepository } from '../model';
import { whereOperationUsedInInteractions, whereUsedInInteractions } from './interactionQueries';

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  const block = (id: string, operations: string[] = [], extra = {}) => ({
    id, kind: 'block' as const, name: id, namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false,
    properties: [], ports: [], operations, constraints: [], ...extra,
  });
  repo.definitions.Vehicle = block('Vehicle', ['start()']);
  repo.definitions.Driver = block('Driver', [], { properties: [{ id: 'carProp', name: 'car', kind: 'part', typeId: 'Vehicle', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }] });
  repo.definitions.Ignite = { id: 'Ignite', kind: 'signal', name: 'Ignite', namespace: [], ownerId: 'model' };
  repo.definitions.main = {
    id: 'main', kind: 'interaction', name: 'Start', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: 'driver', representsId: 'Driver' }, { id: 'b', name: 'car', representsId: 'carProp' }],
    messages: [
      { id: 'm1', name: '', sort: 'synchCall', sourceLifelineId: 'a', targetLifelineId: 'b', order: 1, signatureId: 'start()' },
      { id: 'm2', name: '', sort: 'asynchSignal', sourceLifelineId: 'a', targetLifelineId: 'b', order: 2, signatureId: 'Ignite', connectorId: 'wire' },
    ],
    fragments: [],
  } as InteractionDefinition;
  repo.definitions.other = { id: 'other', kind: 'interaction', name: 'Other', namespace: [], ownerId: 'model', lifelines: [{ id: 'x', name: 'x', representsId: 'Vehicle' }], messages: [], fragments: [] } as InteractionDefinition;
  repo.diagrams.d1 = { id: 'd1', kind: 'diagram', name: 'Start', namespace: [], ownerId: 'main', contextElementId: 'main', diagramKind: 'sequence' } as any;
  repo.diagrams.d2 = { id: 'd2', kind: 'diagram', name: 'Other', namespace: [], ownerId: 'other', diagramKind: 'sequence' } as any;
  repo.diagrams.bdd = { id: 'bdd', kind: 'diagram', name: 'BDD', namespace: [], ownerId: 'model', diagramKind: 'bdd' } as any;
  return repo;
}

describe('where an element is shown in sequence diagrams', () => {
  const repo = model();

  it('finds the lifelines of a Block, including parts typed by it, in every interaction', () => {
    expect(whereUsedInInteractions(repo, 'Vehicle')).toEqual([
      { interactionId: 'main', diagramIds: ['d1'], elementIds: ['b'] },
      { interactionId: 'other', diagramIds: ['d2'], elementIds: ['x'] },
    ]);
    expect(whereUsedInInteractions(repo, 'Driver')).toEqual([{ interactionId: 'main', diagramIds: ['d1'], elementIds: ['a'] }]);
  });

  it('finds the lifeline of a part by its property id', () => {
    expect(whereUsedInInteractions(repo, 'carProp')).toEqual([{ interactionId: 'main', diagramIds: ['d1'], elementIds: ['b'] }]);
  });

  it('finds the messages that send a Signal or travel over a connector', () => {
    expect(whereUsedInInteractions(repo, 'Ignite')).toEqual([{ interactionId: 'main', diagramIds: ['d1'], elementIds: ['m2'] }]);
    expect(whereUsedInInteractions(repo, 'wire')).toEqual([{ interactionId: 'main', diagramIds: ['d1'], elementIds: ['m2'] }]);
  });

  it('finds the calls of a Block operation by name, only when received by that Block', () => {
    expect(whereOperationUsedInInteractions(repo, 'Vehicle', 'start(x: Real)')).toEqual([{ interactionId: 'main', diagramIds: ['d1'], elementIds: ['m1'] }]);
    expect(whereOperationUsedInInteractions(repo, 'Driver', 'start()')).toEqual([]);
    expect(whereOperationUsedInInteractions(repo, 'Vehicle', 'stop()')).toEqual([]);
  });

  it('is empty for an element nothing refers to', () => {
    expect(whereUsedInInteractions(repo, 'nothing')).toEqual([]);
  });
});
