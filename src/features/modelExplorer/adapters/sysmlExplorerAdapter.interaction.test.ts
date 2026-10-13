import { describe, expect, it } from 'vitest';
import { createSysmlExplorerAdapter } from './sysmlExplorerAdapter';
import { createModelExplorerCommandBus } from '../modelExplorerCommandBus';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from '../../../services/sysmlCommandGateway';
import type { InteractionDefinition } from '../../../engine/sysml/model';

function harness() {
  let state: SysmlGatewayState = createSysmlGatewayState();
  state.repository.definitions.Vehicle = { id: 'Vehicle', kind: 'block', name: 'Vehicle', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  state.repository.definitions.main = {
    id: 'main', name: 'Main', kind: 'interaction', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: 'driver' }, { id: 'b', name: 'car', representsId: 'Vehicle' }],
    messages: [
      { id: 'm1', name: 'start', order: 1, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b' },
      { id: 'm2', name: 'stop', order: 2, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b' },
    ],
    fragments: [{ id: 'f1', operator: 'opt', operands: [{ guard: 'ready', messageIds: ['m1'] }], coveredLifelineIds: ['a', 'b'] }],
    uses: [{ id: 'u1', refersToId: 'other', coveredLifelineIds: ['a'] }],
    stateInvariants: [{ id: 'i1', lifelineId: 'b', stateId: 's1' }],
  } as InteractionDefinition;
  state.repository.definitions.other = { id: 'other', kind: 'interaction', name: 'Other', namespace: [], ownerId: 'model', lifelines: [], messages: [], fragments: [] } as InteractionDefinition;
  const h = {
    get state() { return state; },
    set state(next) { state = next; },
    getState: () => state,
    executeCommand: (cmd: any) => {
      const result = executeSysmlCommand(state, cmd);
      if (result.committed) state = { ...state, ...result } as SysmlGatewayState;
      return result;
    },
  };
  return h;
}

const main = (h: ReturnType<typeof harness>) => h.state.repository.definitions.main as InteractionDefinition;

describe('interaction content in the model tree', () => {
  it('lists lifelines, messages in order, fragments, ref frames and state invariants under the interaction', () => {
    const nodes = createSysmlExplorerAdapter(harness()).project('containment').nodes;
    const childLabels = (key: string) => nodes[`sysml:group:main:${key}`].childNodeIds.map(id => nodes[id].label);
    expect(nodes['sysml:element:main'].childNodeIds).toEqual(expect.arrayContaining(['lifelines', 'messages', 'fragments', 'uses', 'invariants'].map(key => `sysml:group:main:${key}`)));
    expect(childLabels('lifelines')).toEqual(['driver', 'car']);
    expect(nodes['sysml:element:b']).toMatchObject({ kind: 'lifeline', secondaryLabel: ': Vehicle', readOnly: true, parentNodeId: 'sysml:group:main:lifelines' });
    expect(childLabels('messages')).toEqual(['1: start', '2: stop']);
    expect(childLabels('fragments')).toEqual(['opt [ready]']);
    expect(childLabels('uses')).toEqual(['ref Other']);
    expect(childLabels('invariants')).toEqual(['State invariant']);
  });

  it('offers only rename and delete for nested elements', () => {
    const adapter = createSysmlExplorerAdapter(harness());
    expect(adapter.capabilities(['m1']).map(cap => cap.kind)).toEqual(['rename', 'delete']);
    expect(adapter.capabilities(['f1']).map(cap => cap.kind)).toEqual(['delete']);
  });

  it('renames a message through the interaction builders as one undo step', () => {
    const h = harness();
    const bus = createModelExplorerCommandBus(createSysmlExplorerAdapter(h));
    const result = bus.dispatch({ type: 'rename', elementId: 'm1', name: 'begin' });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(main(h).messages.find(message => message.id === 'm1')?.name).toBe('begin');
    h.executeCommand({ type: 'undo' });
    expect(main(h).messages.find(message => message.id === 'm1')?.name).toBe('start');
  });

  it('deletes nested elements, re-anchoring and renumbering through the builders', () => {
    const h = harness();
    const bus = createModelExplorerCommandBus(createSysmlExplorerAdapter(h));
    expect(bus.dispatch({ type: 'delete', elementIds: ['m1'] }).committed).toBe(true);
    expect(main(h).messages.map(message => [message.id, message.order])).toEqual([['m2', 1]]);
    expect(main(h).fragments[0].operands[0].messageIds).toEqual([]);
    expect(bus.dispatch({ type: 'delete', elementIds: ['u1', 'i1', 'f1'] }).committed).toBe(true);
    expect(main(h).uses).toEqual([]);
    expect(main(h).stateInvariants).toEqual([]);
    expect(main(h).fragments).toEqual([]);
    expect(bus.dispatch({ type: 'delete', elementIds: ['a'] }).committed).toBe(true);
    expect(main(h).lifelines.map(lifeline => lifeline.id)).toEqual(['b']);
  });
});
