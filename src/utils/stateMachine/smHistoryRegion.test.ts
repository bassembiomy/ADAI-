import { describe, expect, it } from 'vitest';
import type { JunctionData, Layer, StateData, TransitionData, VariableDef } from '../../types/sm_types';
import { generateMISRACCode } from '../stateMachineCodeGenerator';
import {
  applyStateHistoryChange,
  getStateHistoryType,
  planStateHistoryChange,
  type StateHistoryModel,
} from './smHistoryRegion';
import { createRuntime, initializeRuntime, stepRuntime, type SemanticRuntime } from './smInterpreter';
import type { LegacyStateMachineModel } from './smModel';
import { migrateStateMachineModel } from './smModelMigration';
import { buildSemanticModel } from './smSemanticBuilder';

const state = (id: string, overrides: Partial<StateData> = {}): StateData => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '',
  isActive: false, color: '#000', parentId: null, children: [], priority: 1,
  isParallel: false, regionId: null, autostart: false, ...overrides,
});

const transition = (
  id: string, sourceId: string, targetId: string, condition: string, order = 0,
): TransitionData => ({
  id, sourceId, targetId, condition, action: '', afterTicks: null, type: 'condition',
  hasControlPoint: false, order, isInternal: false,
});

const bool = (name: string): VariableDef => ({
  id: name, name, type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true,
});

/** What the App holds: root layer with composite P (no child region yet) and X. */
const appModel = (): LegacyStateMachineModel => ({
  schemaVersion: 3,
  tickMs: 10,
  states: [
    state('P', { autostart: true }),
    state('X', { priority: 2 }),
    state('C1', { autostart: true }),
    state('C2', { priority: 2 }),
  ],
  junctions: [],
  transitions: [
    transition('c1_c2', 'C1', 'C2', 'next'),
    transition('p_x', 'P', 'X', 'leave'),
    transition('x_p', 'X', 'P', 'back'),
  ],
  variables: [bool('next'), bool('leave'), bool('back')],
  layers: [
    { id: 'root', name: 'Root', parentStateId: null, stateIds: ['P', 'X'], transitionIds: ['p_x', 'x_p'], junctionIds: [] },
    { id: 'region_p', name: 'P', parentStateId: 'P', stateIds: ['C1', 'C2'], transitionIds: ['c1_c2'], junctionIds: [] },
  ],
  safetyMode: false,
});

const withHistory = (type: 'shallow' | 'deep') => {
  const base = appModel();
  const applied = applyStateHistoryChange(
    { layers: base.layers, junctions: base.junctions, transitions: base.transitions },
    { id: 'P', name: 'P' }, type, { newLayerId: 'unused', newJunctionId: 'hist' }, { x: 60, y: 60 }, '#111',
  );
  return { ...base, ...applied };
};

const runtimeOf = (model: LegacyStateMachineModel): SemanticRuntime => {
  const migrated = migrateStateMachineModel(model);
  const built = buildSemanticModel(migrated.model);
  expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const runtime = createRuntime(built.ir!);
  initializeRuntime(runtime);
  return runtime;
};

const pulse = (runtime: SemanticRuntime, name: string) => {
  runtime.data[name] = true;
  stepRuntime(runtime, 10);
  runtime.data[name] = false;
};

const isActive = (runtime: SemanticRuntime, id: string) =>
  runtime.stateActive[runtime.ir.states[id].activityIndex];

describe('History setting of a composite state', () => {
  it('puts a shallow history junction into the state\'s own region layer', () => {
    const next = withHistory('shallow');
    const region = next.layers.find((l) => l.parentStateId === 'P')!;
    const root = next.layers.find((l) => l.id === 'root')!;
    const junction = next.junctions.find((j) => j.type === 'history')!;
    expect(region.junctionIds).toEqual([junction.id]);
    expect(root.junctionIds).toEqual([]);
    expect(junction.parentId).toBeNull();
    expect(getStateHistoryType(next.layers, next.junctions, 'P')).toBe('shallow');
    expect(getStateHistoryType(next.layers, next.junctions, 'X')).toBe('none');
  });

  it('creates the region layer like the canvas when the state has none', () => {
    const base = appModel();
    const layers: Layer[] = base.layers.filter((l) => l.id !== 'region_p');
    const next = applyStateHistoryChange(
      { layers, junctions: [], transitions: [] },
      { id: 'P', name: 'Pump' }, 'deep', { newLayerId: 'new_layer', newJunctionId: 'h' }, { x: 1, y: 2 }, '#111',
    );
    expect(next.layers.find((l) => l.id === 'new_layer')).toEqual({
      id: 'new_layer', name: 'Pump', parentStateId: 'P', stateIds: [], transitionIds: [], junctionIds: ['h'],
    });
    expect(next.junctions[0]).toMatchObject({ id: 'h', type: 'deep-history', name: 'H*', x: 1, y: 2 });
  });

  it('re-types in place (keeping transitions into it) and removes on None', () => {
    const shallow = withHistory('shallow');
    const toHistory = transition('into_h', 'X', 'hist', 'back2');
    const model: StateHistoryModel = {
      layers: shallow.layers, junctions: shallow.junctions, transitions: [...shallow.transitions, toHistory],
    };
    const ids = { newLayerId: 'l', newJunctionId: 'j2' };
    const deep = applyStateHistoryChange(model, { id: 'P', name: 'P' }, 'deep', ids, { x: 0, y: 0 }, '#111');
    expect(deep.junctions.map((j: JunctionData) => [j.id, j.type])).toEqual([['hist', 'deep-history']]);
    expect(deep.transitions.some((t) => t.id === 'into_h')).toBe(true);
    expect(getStateHistoryType(deep.layers, deep.junctions, 'P')).toBe('deep');

    const none = applyStateHistoryChange(deep, { id: 'P', name: 'P' }, 'none', ids, { x: 0, y: 0 }, '#111');
    expect(none.junctions).toEqual([]);
    expect(none.transitions.some((t) => t.id === 'into_h')).toBe(false);
    expect(none.layers.every((l) => !l.transitionIds.includes('into_h') && l.junctionIds.length === 0)).toBe(true);
    expect(getStateHistoryType(none.layers, none.junctions, 'P')).toBe('none');
  });

  it('plans nothing when the type is already set', () => {
    const shallow = withHistory('shallow');
    const plan = planStateHistoryChange({
      layers: shallow.layers, junctions: shallow.junctions, state: { id: 'P', name: 'P' },
      newType: 'shallow', newLayerId: 'x',
    });
    expect(plan).toMatchObject({ layerToCreate: null, retype: null, removeJunctionIds: [], create: null });
  });

  it('simulator: a transition back into the composite restores the last active child', () => {
    for (const [label, model, restores] of [
      ['without history', appModel(), false],
      ['with shallow history', withHistory('shallow'), true],
      ['with deep history', withHistory('deep'), true],
    ] as const) {
      const runtime = runtimeOf(model);
      pulse(runtime, 'next');
      expect(isActive(runtime, 'C2'), label).toBe(true);
      pulse(runtime, 'leave');
      expect(isActive(runtime, 'X'), label).toBe(true);
      pulse(runtime, 'back');
      expect(isActive(runtime, 'P'), label).toBe(true);
      expect(isActive(runtime, 'C2'), label).toBe(restores);
      expect(isActive(runtime, 'C1'), label).toBe(!restores);
    }
  });

  it('generated C contains the history restore for that layer', () => {
    const source = (model: LegacyStateMachineModel) => {
      const result = generateMISRACCode(model);
      expect(result.errors).toEqual([]);
      return result.files.find((f) => f.name.endsWith('sm_core.c'))!.content;
    };
    const without = source(appModel());
    const shallow = source(withHistory('shallow'));
    const restore = /instance->history_states\[\d+U\] == SM_ST_C[12]/;
    expect(without).not.toMatch(restore);
    expect(shallow).toMatch(restore);
  });
});
