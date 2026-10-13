import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRepository } from '../../../engine/sysml/model';
import { interactionToPlantUml } from './sysmlInteractionToPlantUml';

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.Vehicle = { id: 'Vehicle', kind: 'block', name: 'Vehicle', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: ['start()'], constraints: [] };
  repo.definitions.Ignite = { id: 'Ignite', kind: 'signal', name: 'Ignite', namespace: [], ownerId: 'model' };
  repo.definitions.other = { id: 'other', kind: 'interaction', name: 'Check Fuel', namespace: [], ownerId: 'model', lifelines: [], messages: [], fragments: [] } as InteractionDefinition;
  repo.actors = { drv: { id: 'drv', kind: 'actor', name: 'Driver', namespace: [], ownerId: 'model', isExternal: true, generalizationIds: [] } } as any;
  const msg = (id: string, order: number, sort: string, from: string, to: string, extra = {}) => ({ id, name: '', order, sort, sourceLifelineId: from, targetLifelineId: to, ...extra });
  repo.definitions.main = {
    id: 'main', kind: 'interaction', name: 'Start Engine', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: '', representsId: 'drv' }, { id: 'b', name: 'car', representsId: 'Vehicle' }, { id: 'c', name: 'tmp' }],
    messages: [
      msg('m1', 1, 'synchCall', 'a', 'b', { signatureId: 'start()', arguments: 'fast' }),
      msg('m2', 2, 'reply', 'b', 'a', { name: 'ok' }),
      msg('m3', 3, 'asynchSignal', 'a', 'b', { signatureId: 'Ignite' }),
      msg('m4', 4, 'asynchCall', 'b', 'a', { name: 'retry' }),
      msg('m5', 5, 'createMessage', 'b', 'c'),
      msg('m6', 6, 'deleteMessage', 'b', 'c'),
    ],
    fragments: [{ id: 'f1', operator: 'alt', operands: [{ guard: 'ready', messageIds: ['m3'] }, { guard: 'else', messageIds: ['m4'] }], coveredLifelineIds: ['a', 'b'] }],
    uses: [{ id: 'u1', refersToId: 'other', coveredLifelineIds: ['a', 'b'], afterMessageId: 'm2', arguments: 'level' }],
    stateInvariants: [{ id: 'i1', lifelineId: 'b', stateId: 's1', afterMessageId: 'm6' }],
  } as InteractionDefinition;
  return repo;
}

describe('interactionToPlantUml', () => {
  it('exports participants, arrows, groups, ref frames and state invariants', () => {
    const endpoints = { externalEndpoints: new Map([['s1', { id: 's1', name: 'Running', family: 'state' as const }]]) };
    expect(interactionToPlantUml(model(), 'main', endpoints)).toBe([
      '@startuml',
      'title Start Engine',
      'actor "Driver" as L_a',
      'participant "car : Vehicle" as L_b',
      'participant "tmp" as L_c #lightgrey',
      'L_a -> L_b : start(fast)',
      'L_b --> L_a : ok',
      'ref over L_a, L_b : Check Fuel(level)',
      'alt [ready]',
      'L_a ->> L_b : Ignite',
      'else [else]',
      'L_b ->> L_a : retry',
      'end',
      'create L_c',
      'L_b -> L_c : <<create>>',
      'L_b -> L_c : <<destroy>>',
      'destroy L_c',
      'hnote over L_b : Running',
      '@enduml',
    ].join('\n'));
  });

  it('returns an empty diagram for something that is not an interaction', () => {
    expect(interactionToPlantUml(model(), 'Vehicle')).toBe('@startuml\n@enduml');
  });
});
