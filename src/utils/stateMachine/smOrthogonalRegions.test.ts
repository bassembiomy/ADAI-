import { describe, expect, it } from 'vitest';
import type { StateData, TransitionData } from '../../types/sm_types';
import { applyAutostartEdit, canTransitionBeInternal, findPartiallyParallelRegions, findUnreachableStates, partiallyParallelRegionMessage } from './smOrthogonalRegions';

const state = (id: string, parentId: string, o: Partial<StateData> = {}): StateData => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#fff',
  parentId, children: [], priority: 0, isParallel: false, regionId: null, autostart: false, ...o,
});
const transition = (id: string, sourceId: string, targetId: string): TransitionData => ({
  id, sourceId, targetId, condition: 'go==true', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 0,
});

describe('orthogonal regions (parallel states)', () => {
  it('keeps one AutoStart state per region among sequential states', () => {
    const states = [state('a', 'r', { autostart: true }), state('b', 'r'), state('c', 'other', { autostart: true })];
    const next = applyAutostartEdit(states, 'b', true);
    expect(next.filter(s => s.autostart).map(s => s.id)).toEqual(['b', 'c']);
  });

  it('lets every parallel state of a region be AutoStart: entering the parent enters all its orthogonal regions', () => {
    let states = [state('p1', 'root', { isParallel: true }), state('p2', 'root', { isParallel: true }), state('p3', 'root', { isParallel: true })];
    for (const id of ['p1', 'p2', 'p3']) states = applyAutostartEdit(states, id, true);
    expect(states.every(s => s.autostart)).toBe(true);
  });

  it('reports no parallel region as unreachable once one of them is entered', () => {
    const states = [
      state('p1', 'root', { isParallel: true, autostart: true }), state('p2', 'root', { isParallel: true }),
      state('a', 'r1', { autostart: true }), state('b', 'r1'), state('lost', 'r1'),
    ];
    expect(findUnreachableStates(states, [transition('t', 'a', 'b')]).map(s => s.id)).toEqual(['lost']);
  });

  it('still reports a sequential state that no AutoStart or transition reaches', () => {
    const states = [state('a', 'root', { autostart: true }), state('b', 'root'), state('c', 'root')];
    expect(findUnreachableStates(states, [transition('t', 'a', 'b')]).map(s => s.id)).toEqual(['c']);
  });
});

describe('partially parallel regions', () => {
  it('reports a region where only some states are Parallel', () => {
    const states = [
      state('a', 'r', { isParallel: true }), state('b', 'r'),
      state('c', 'q', { isParallel: true }), state('d', 'q', { isParallel: true }),
      state('e', 's'), state('f', 's'),
    ];
    const found = findPartiallyParallelRegions(states);
    expect(found).toHaveLength(1);
    expect(found[0].parentId).toBe('r');
    expect(found[0].parallel.map(s => s.id)).toEqual(['a']);
    expect(found[0].sequential.map(s => s.id)).toEqual(['b']);
    expect(partiallyParallelRegionMessage(found[0])).toContain("'a'");
  });
});

describe('canTransitionBeInternal', () => {
  const states = [state('P', 'root'), state('C', 'rp'), state('G', 'rc'), state('X', 'root')];
  const layers = [
    { id: 'root', name: 'Root', parentStateId: null, stateIds: ['P', 'X'], transitionIds: [], junctionIds: [] },
    { id: 'rp', name: 'P', parentStateId: 'P', stateIds: ['C'], transitionIds: [], junctionIds: [] },
    { id: 'rc', name: 'C', parentStateId: 'C', stateIds: ['G'], transitionIds: [], junctionIds: [] },
  ];
  it('allows self and descendant targets only', () => {
    expect(canTransitionBeInternal({ sourceId: 'P', targetId: 'P' }, states, layers)).toBe(true);
    expect(canTransitionBeInternal({ sourceId: 'P', targetId: 'C' }, states, layers)).toBe(true);
    expect(canTransitionBeInternal({ sourceId: 'P', targetId: 'G' }, states, layers)).toBe(true);
    expect(canTransitionBeInternal({ sourceId: 'P', targetId: 'X' }, states, layers)).toBe(false);
    expect(canTransitionBeInternal({ sourceId: 'C', targetId: 'P' }, states, layers)).toBe(false);
    expect(canTransitionBeInternal({ sourceId: 'P', targetId: 'missing' }, states, layers)).toBe(false);
  });
});
