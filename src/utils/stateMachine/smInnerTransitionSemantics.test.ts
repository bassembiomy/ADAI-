import { describe, expect, it } from 'vitest';
import { flatOrFixture, type DifferentialFixture, type DifferentialScenarioStep } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import type { StateMachineModelV5 } from './smModel';

/*
 * Inner transitions follow Stateflow semantics:
 *   An inner transition whose source is S and whose destination T is a descendant of S
 *   exits every active descendant of S (deepest first, i.e. exit actions bottom-up),
 *   runs the transition action, then enters the path from S (exclusive) down to T and
 *   T's default substates. S itself is neither exited nor re-entered.
 *   This holds when the child on the path to T is already active: it is exited and
 *   re-entered, so it never ends up with two active substates.
 *
 * Action order is observed through `ratio`: every action appends one decimal digit.
 * The generated C must produce exactly the simulation trace.
 */

const st = (id: string, o: Record<string, unknown> = {}) => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '',
  isActive: false, color: '#000000', parentId: null, children: [], priority: 1,
  isParallel: false, regionId: null, autostart: false, ...o,
});
const tr = (id: string, sourceId: string, targetId: string, o: Record<string, unknown> = {}) => ({
  id, sourceId, targetId, condition: '', action: '', afterTicks: null, type: 'condition',
  hasControlPoint: false, order: 1, ...o,
});
const ly = (id: string, parentStateId: string | null, decomposition: 'OR' | 'AND', stateIds: string[], transitionIds: string[] = []) => ({
  id, name: id, parentStateId, decomposition, stateIds, transitionIds, junctionIds: [],
});

const digit = (n: number) => `ratio = ratio * 10 + ${n};`;

/*
 * P ── C ── X (default)
 *   │    └─ Y
 *   └─ D
 * Variables (from flatOrFixture): go (bool), total, count, ratio (double).
 */
const chart = (innerTargetId: string): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.states = [
    st('P', { autostart: true }),
    st('C', { autostart: true, parentId: 'P', entry: digit(4), exit: digit(2) }),
    st('D', { parentId: 'P', priority: 2, entry: digit(6), exit: digit(7) }),
    st('X', { autostart: true, parentId: 'C', entry: digit(5), exit: digit(8) }),
    st('Y', { parentId: 'C', priority: 2, entry: digit(9), exit: digit(1) }),
  ] as never;
  model.transitions = [
    tr('t_xy', 'X', 'Y', { condition: 'go' }),
    tr('t_inner', 'P', innerTargetId, { condition: 'total > 0', action: digit(3), type: 'internal', isInternal: true }),
  ] as never;
  model.layers = [
    ly('root', null, 'OR', ['P']),
    ly('lp', 'P', 'OR', ['C', 'D'], ['t_inner']),
    ly('lc', 'C', 'OR', ['X', 'Y'], ['t_xy']),
  ] as never;
  return model;
};

const fixture = (innerTargetId: string, steps: DifferentialScenarioStep[]): DifferentialFixture => ({
  name: 'inner-descendant',
  model: chart(innerTargetId),
  steps,
});

const run = (fx: DifferentialFixture) => {
  const expected = runInterpreterTrace(fx);
  const actual = compileAndRunCTrace(fx);
  expect(compareSemanticTraces(expected, actual)).toBeNull();
  return expected;
};

describe('inner transitions (Stateflow semantics, simulation and generated C)', () => {
  it('re-enters an active composite child instead of leaving two substates active', () => {
    const frames = run(fixture('C', [
      { kind: 'step', inputs: { go: true } },                       // X -> Y
      { kind: 'step', inputs: { go: false, total: 1, ratio: 0 } },  // inner P -> C while Y active
      { kind: 'step', inputs: { total: 0 } },
    ]));
    const inner = frames[2];
    expect([...inner.activeStateIds].sort()).toEqual(['C', 'P', 'X']);
    expect(inner.error).toBeNull();
    // exit Y (1), exit C (2), transition action (3), entry C (4), entry X (5)
    expect(inner.data.ratio).toBe(12345);
    expect(frames[3].error).toBeNull();
    expect([...frames[3].activeStateIds].sort()).toEqual(['C', 'P', 'X']);
  }, 120_000);

  it('enters a deeper descendant through its active parent, exiting and re-entering the parent', () => {
    const frames = run(fixture('Y', [
      { kind: 'step', inputs: { total: 1, ratio: 0 } },             // inner P -> Y while X active
      { kind: 'step', inputs: { total: 0 } },
    ]));
    const inner = frames[1];
    expect([...inner.activeStateIds].sort()).toEqual(['C', 'P', 'Y']);
    // exit X (8), exit C (2), action (3), entry C (4), entry Y (9)
    expect(inner.data.ratio).toBe(82349);
    expect(inner.error).toBeNull();
  }, 120_000);

  it('moves to an inactive child, exiting the active subtree bottom-up', () => {
    const frames = run(fixture('D', [
      { kind: 'step', inputs: { go: true } },                       // X -> Y
      { kind: 'step', inputs: { go: false, total: 1, ratio: 0 } },  // inner P -> D
      { kind: 'step', inputs: { total: 0 } },
    ]));
    const inner = frames[2];
    expect([...inner.activeStateIds].sort()).toEqual(['D', 'P']);
    // exit Y (1), exit C (2), action (3), entry D (6)
    expect(inner.data.ratio).toBe(1236);
    expect(frames[3].error).toBeNull();
  }, 120_000);

  it('repeats every tick while its guard holds without corrupting the configuration', () => {
    const frames = run(fixture('C', [
      { kind: 'step', inputs: { go: true } },
      { kind: 'step', inputs: { go: false, total: 1 } },
      { kind: 'step' },
      { kind: 'step', inputs: { go: true } },
      { kind: 'step', inputs: { go: false } },
      { kind: 'step', inputs: { total: 0 } },
    ]));
    for (const frame of frames) {
      expect(frame.error).toBeNull();
      const active = frame.activeStateIds;
      expect(active.includes('X') && active.includes('Y')).toBe(false);
    }
  }, 120_000);
});
