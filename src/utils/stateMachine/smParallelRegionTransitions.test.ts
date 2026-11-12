import { describe, expect, it } from 'vitest';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import type { StateMachineModelV5 } from './smModel';

/*
 * Stateflow and UML/SysML do not allow a transition between two regions of the same
 * parallel (AND) state: its source and target would both stay inside the parallel state
 * while leaving one region without an active state. ADIA rejects such a transition at
 * validation with the diagnostic SM_TRANSITION_BETWEEN_PARALLEL_REGIONS, naming the
 * transition. Transitions inside one region, and transitions that leave the parallel
 * state altogether, stay valid.
 */

const st = (id: string, o: Record<string, unknown> = {}) => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '',
  isActive: false, color: '#000000', parentId: null, children: [], priority: 1,
  isParallel: false, regionId: null, autostart: false, ...o,
});
const tr = (id: string, sourceId: string, targetId: string) => ({
  id, sourceId, targetId, condition: 'go', action: '', afterTicks: null, type: 'condition',
  hasControlPoint: false, order: 1,
});
const ly = (id: string, parentStateId: string | null, decomposition: 'OR' | 'AND', stateIds: string[], transitionIds: string[] = []) => ({
  id, name: id, parentStateId, decomposition, stateIds, transitionIds, junctionIds: [],
});

/*
 * root: Par (AND: RA, RB), Out
 *   RA: A1 (default), A2 — A1 has children A1x (default), A1y
 *   RB: B1 (default), B2
 */
const chart = (transitions: Array<[string, string, string, string]>): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.states = [
    st('Par', { autostart: true }), st('Out', { priority: 2 }),
    st('RA', { parentId: 'Par' }), st('RB', { parentId: 'Par', priority: 2 }),
    st('A1', { parentId: 'RA', autostart: true }), st('A2', { parentId: 'RA', priority: 2 }),
    st('A1x', { parentId: 'A1', autostart: true }), st('A1y', { parentId: 'A1', priority: 2 }),
    st('B1', { parentId: 'RB', autostart: true }), st('B2', { parentId: 'RB', priority: 2 }),
  ] as never;
  const layers = [
    ly('root', null, 'OR', ['Par', 'Out']),
    ly('par', 'Par', 'AND', ['RA', 'RB']),
    ly('ra', 'RA', 'OR', ['A1', 'A2']),
    ly('rb', 'RB', 'OR', ['B1', 'B2']),
    ly('a1', 'A1', 'OR', ['A1x', 'A1y']),
  ];
  model.transitions = transitions.map(([id, source, target]) => tr(id, source, target)) as never;
  for (const [id, , , layerId] of transitions) layers.find((layer) => layer.id === layerId)!.transitionIds.push(id);
  model.layers = layers as never;
  return model;
};

const crossings = (model: StateMachineModelV5) =>
  buildSemanticModel(model).diagnostics
    .filter((item) => item.severity === 'error' && item.code === 'SM_TRANSITION_BETWEEN_PARALLEL_REGIONS')
    .map((item) => item.elementId);

describe('transitions between parallel regions', () => {
  it('rejects a transition from one region to a sibling region', () => {
    expect(crossings(chart([['t_ab', 'A1', 'B2', 'ra']]))).toEqual(['t_ab']);
  });

  it('rejects one that crosses from a nested state into another region', () => {
    expect(crossings(chart([['t_deep', 'A1y', 'B1', 'a1']]))).toEqual(['t_deep']);
  });

  it('rejects a transition between the region states themselves', () => {
    expect(crossings(chart([['t_regions', 'RA', 'RB', 'par']]))).toEqual(['t_regions']);
  });

  it('accepts transitions inside one region and transitions leaving the parallel state', () => {
    const model = chart([
      ['t_in_region', 'A1', 'A2', 'ra'],
      ['t_nested', 'A1x', 'A1y', 'a1'],
      ['t_out', 'A1y', 'Out', 'a1'],
      ['t_back', 'Out', 'B2', 'root'],
    ]);
    expect(crossings(model)).toEqual([]);
    const built = buildSemanticModel(model);
    expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(built.ir).toBeDefined();
  });
});
