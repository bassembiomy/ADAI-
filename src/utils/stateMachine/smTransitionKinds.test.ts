import { describe, expect, it } from 'vitest';
import type { StateData, TransitionData, VariableDef } from '../../types/sm_types';
import { generateMISRACCode } from '../stateMachineCodeGenerator';
import { createRuntime, initializeRuntime, stepRuntime, type SemanticRuntime } from './smInterpreter';
import type { LegacyStateMachineModel } from './smModel';
import { migrateStateMachineModel } from './smModelMigration';
import { buildSemanticModel } from './smSemanticBuilder';

const state = (id: string, parentId: string, o: Partial<StateData> = {}): StateData => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#000',
  parentId, children: [], priority: 1, isParallel: false, regionId: null, autostart: false, ...o,
});
const transition = (id: string, sourceId: string, targetId: string, isInternal: boolean): TransitionData => ({
  id, sourceId, targetId, condition: 'go', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 0, isInternal,
});
const variable = (name: string, type: VariableDef['type'] = 'bool'): VariableDef => ({
  id: name, name, type, initialValue: type === 'bool' ? 'false' : '0', currentValue: type === 'bool' ? false : 0, visibleInScope: true,
});

const model = (states: StateData[], transitions: TransitionData[], rootStates: string[], childStates: string[] = []): LegacyStateMachineModel => ({
  schemaVersion: 3, tickMs: 10, states, junctions: [], transitions,
  variables: [variable('go'), variable('exits', 'int32'), variable('entries', 'int32')],
  layers: [
    { id: 'root', name: 'Root', parentStateId: null, stateIds: rootStates, transitionIds: transitions.map(t => t.id), junctionIds: [] },
    ...(childStates.length ? [{ id: 'region_p', name: 'P', parentStateId: 'P', stateIds: childStates, transitionIds: [], junctionIds: [] }] : []),
  ],
  safetyMode: false,
});

const runtimeOf = (m: LegacyStateMachineModel): SemanticRuntime => {
  const built = buildSemanticModel(migrateStateMachineModel(m).model);
  expect(built.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const runtime = createRuntime(built.ir!);
  initializeRuntime(runtime);
  return runtime;
};
const isActive = (r: SemanticRuntime, id: string) => r.stateActive[r.ir.states[id].activityIndex];
const coreC = (m: LegacyStateMachineModel): string => {
  const result = generateMISRACCode(m);
  expect(result.errors).toEqual([]);
  return result.files.find(f => f.name.endsWith('sm_core.c'))!.content;
};

describe('isInternal transitions: self = internal action, descendant = local, otherwise external', () => {
  const sibling = () => model(
    [state('A', 'root', { autostart: true, exit: 'exits = exits + 1;' }), state('B', 'root', { priority: 2, entry: 'entries = entries + 1;' })],
    [transition('a_b', 'A', 'B', true)], ['A', 'B'],
  );

  it('a flagged sibling transition is rejected by the semantic builder and by Generate C/H, never silently internal', () => {
    const built = buildSemanticModel(migrateStateMachineModel(sibling()).model);
    expect(built.diagnostics.map(d => d.code)).toContain('INNER_DESTINATION_INVALID');
    const result = generateMISRACCode(sibling());
    expect(result.errors.map(e => e.id)).toContain('INNER_DESTINATION_INVALID');
    expect(result.files).toEqual([]);
  });

  it('the same transition without the flag is an external transition: exit and entry run', () => {
    const plain = sibling();
    plain.transitions[0].isInternal = false;
    const runtime = runtimeOf(plain);
    runtime.data.go = true;
    stepRuntime(runtime, 10);
    expect(isActive(runtime, 'B')).toBe(true);
    expect(isActive(runtime, 'A')).toBe(false);
    expect(runtime.data.exits).toBe(1);
    expect(coreC(plain)).toMatch(/exits = /);
  });

  it('a flagged transition to a descendant is local: the source is neither exited nor re-entered', () => {
    const local = model(
      [state('P', 'root', { autostart: true, exit: 'exits = exits + 1;' }), state('C1', 'P', { autostart: true }), state('C2', 'P', { priority: 2, entry: 'entries = entries + 1;' })],
      [transition('p_c2', 'P', 'C2', true)], ['P'], ['C1', 'C2'],
    );
    const runtime = runtimeOf(local);
    runtime.data.go = true;
    stepRuntime(runtime, 10);
    expect(isActive(runtime, 'C2')).toBe(true);
    expect(isActive(runtime, 'P')).toBe(true);
    expect(runtime.data.exits).toBe(0);
    const c = coreC(local);
    const unflagged = model(local.states, [{ ...local.transitions[0], isInternal: false }], ['P'], ['C1', 'C2']);
    expect(c).not.toBe(coreC(unflagged));
  });
});

describe('flagged self transition', () => {
  it('is an internal action: the state is not exited', () => {
    const m = model([state('A', 'root', { autostart: true, exit: 'exits = exits + 1;' })], [{ ...transition('a_a', 'A', 'A', true), action: 'entries = entries + 1;' }], ['A']);
    const runtime = runtimeOf(m);
    runtime.data.go = true;
    stepRuntime(runtime, 10);
    expect(runtime.data.exits).toBe(0);
    expect(runtime.data.entries).toBe(1);
  });
});

describe('terminal states', () => {
  const chart = (terminal: Partial<StateData>, name = 'Done') => model(
    [state('A', 'root', { autostart: true, entry: 'entries = entries + 1;' }), state('T', 'root', { priority: 2, name, ...terminal })],
    [transition('a_t', 'A', 'T', false)], ['A', 'T'],
  );

  it('simulator: a terminal state stays active', () => {
    const runtime = runtimeOf(chart({ isTerminalState: true }));
    runtime.data.go = true;
    stepRuntime(runtime, 10);
    stepRuntime(runtime, 10);
    expect(isActive(runtime, 'T')).toBe(true);
  });

  it('generated C: does not reset on entering a terminal state', () => {
    const c = coreC(chart({ isTerminalState: true }));
    expect(c).not.toMatch(/SM_Is_Terminal_State[\s\S]*SM_Reset\(instance\);\s*return;/);
    expect(c).not.toContain('Terminal / End State: auto-reset');
  });

  it('a state named like a terminal is not terminal unless flagged', () => {
    for (const name of ['end', 'terminal', 'Mode_end', 'Mode_terminal']) {
      const runtime = runtimeOf(chart({}, name));
      runtime.data.go = true;
      stepRuntime(runtime, 10);
      expect(isActive(runtime, 'T'), name).toBe(true);
      const c = coreC(chart({}, name));
      expect(c).not.toContain('static bool SM_Execute_State_2(ADIA_Instance_t *instance)\n{\n    (void)instance;\n    return false;');
    }
  });
});
