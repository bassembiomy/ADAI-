import { describe, expect, it } from 'vitest';
import {
  historyFixture,
  parallelHistoryFixture,
  type HistoryFixtureKind,
  type ParallelHistoryFixtureName,
} from './smFixtures';
import {
  createRuntime,
  initializeRuntime,
  resetRuntime,
  snapshotRuntime,
  stepRuntime,
  type SemanticRuntime,
} from './smInterpreter';
import { buildSemanticModel } from './smSemanticBuilder';

const initializedFixture = (name: ParallelHistoryFixtureName) => {
  const result = buildSemanticModel(parallelHistoryFixture(name));
  expect(result.diagnostics).toEqual([]);
  if (!result.ir) throw new Error(`fixture '${name}' did not build`);
  const runtime = createRuntime(result.ir);
  initializeRuntime(runtime);
  return runtime;
};

const runHistoryScenario = (kind: HistoryFixtureKind): SemanticRuntime => {
  const result = buildSemanticModel(historyFixture(kind));
  expect(result.diagnostics).toEqual([]);
  if (!result.ir) throw new Error(`${kind} history fixture did not build`);
  const runtime = createRuntime(result.ir);
  initializeRuntime(runtime);

  for (
    const signal of [
      'select_a',
      'advance_nested',
      'advance_left',
      'advance_right',
    ]
  ) {
    runtime.data[signal] = true;
    stepRuntime(runtime, 10);
    runtime.data[signal] = false;
  }

  runtime.data.leave = true;
  stepRuntime(runtime, 10);
  runtime.data.leave = false;
  runtime.data.go = true;
  stepRuntime(runtime, 10);
  return runtime;
};

const active = (runtime: SemanticRuntime, stateId: string): boolean => {
  const state = runtime.ir.states[stateId];
  return runtime.stateActive[state.activityIndex];
};

describe('parallel AND execution and terminal semantics', () => {
  it('enters AND children in priority order', () => {
    const fixture = parallelHistoryFixture('parallel-order');
    for (const childId of ['R1', 'R2', 'R3']) {
      fixture.states.find((state) => state.id === childId)!.entry =
        'total = total + 1;';
    }
    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    if (!result.ir) throw new Error('parallel entry fixture did not build');
    const runtime = createRuntime(result.ir);

    const frame = initializeRuntime(runtime);

    expect(frame.actions).toEqual(['entry:R1', 'entry:R2', 'entry:R3']);
  });

  it('enters every AND sibling when a transition targets one child', () => {
    const fixture = parallelHistoryFixture('parallel-order');
    fixture.states.find((state) => state.id === 'PARENT')!.autostart = false;
    fixture.states.find((state) => state.id === 'OUTSIDE')!.autostart = true;
    for (const stateId of ['PARENT', 'R1', 'R2', 'R3']) {
      fixture.states.find((state) => state.id === stateId)!.entry =
        'total = total + 1;';
    }
    fixture.transitions.push({
      id: 'enter_r2',
      sourceId: 'OUTSIDE',
      targetId: 'R2',
      condition: 'go',
      action: '',
      afterTicks: null,
      type: 'condition',
      hasControlPoint: false,
      order: 1,
    });
    fixture.layers.find((layer) => layer.id === 'root')!
      .transitionIds.push('enter_r2');
    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    if (!result.ir) throw new Error('parallel target-entry fixture did not build');
    const runtime = createRuntime(result.ir);
    initializeRuntime(runtime);
    runtime.data.go = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual([
      'entry:PARENT',
      'entry:R1',
      'entry:R2',
      'entry:R3',
    ]);
    expect(frame.activeStateIds).toEqual([
      'PARENT',
      'R1',
      'R2',
      'R3',
    ]);
  });

  it('executes AND children in priority order', () => {
    const runtime = initializedFixture('parallel-order');

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual(['during:R1', 'during:R2', 'during:R3']);
  });

  it('re-enters only the local AND child on an external self-transition', () => {
    const fixture = parallelHistoryFixture('parallel-order');
    for (const stateId of ['R1', 'R2', 'R3']) {
      fixture.states.find((state) => state.id === stateId)!.entry =
        'total = total + 1;';
    }
    fixture.transitions.push({
      id: 'self_r1',
      sourceId: 'R1',
      targetId: 'R1',
      condition: 'go',
      action: '',
      afterTicks: null,
      type: 'condition',
      hasControlPoint: false,
      order: 1,
    });
    fixture.layers.find((layer) => layer.id === 'parallel_regions')!
      .transitionIds.push('self_r1');
    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    if (!result.ir) throw new Error('parallel self-transition fixture did not build');
    const runtime = createRuntime(result.ir);
    initializeRuntime(runtime);
    runtime.stateTimersMs[result.ir.states.R2.activityIndex] = 20;
    runtime.stateTimersMs[result.ir.states.R3.activityIndex] = 30;
    runtime.data.go = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual([
      'exit:R1',
      'entry:R1',
      'during:R2',
      'during:R3',
    ]);
    expect(frame.activeStateIds).toEqual(['PARENT', 'R1', 'R2', 'R3']);
    expect(frame.stateTimersMs).toMatchObject({
      R1: 0,
      R2: 30,
      R3: 40,
    });
  });

  it('continues into a later AND layer after a local child-layer transition', () => {
    const fixture = historyFixture('shallow');
    fixture.states.find((state) => state.id === 'parallel_left')!.during =
      'total = total + 1;';
    fixture.states.find((state) => state.id === 'parallel_right')!.during =
      'total = total + 1;';
    const result = buildSemanticModel(fixture);
    expect(result.diagnostics).toEqual([]);
    if (!result.ir) throw new Error('multi-layer fixture did not build');
    const runtime = createRuntime(result.ir);
    initializeRuntime(runtime);
    runtime.data.select_a = true;
    stepRuntime(runtime, 10);
    runtime.data.select_a = false;
    runtime.data.advance_nested = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual([
      'during:PARALLEL_LEFT',
      'during:PARALLEL_RIGHT',
    ]);
  });

  it('stops later siblings when a transition exits the common AND parent', () => {
    const runtime = initializedFixture('parallel-parent-exit');
    runtime.data.leave = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual([
      'exit:R3',
      'exit:R2',
      'exit:R1',
      'exit:PARENT',
      'entry:OUTSIDE',
    ]);
    expect(frame.actions).not.toContain('during:R2');
  });

  it('keeps a terminal child active and quiescent while its AND sibling continues', () => {
    const runtime = initializedFixture('parallel-terminal');

    const first = stepRuntime(runtime, 10);
    const second = stepRuntime(runtime, 10);

    expect(first.activeStateIds).toContain('TERMINAL_CHILD');
    expect(second.activeStateIds).toContain('TERMINAL_CHILD');
    expect(first.actions).toEqual(['during:WORKER']);
    expect(second.actions).toEqual(['during:WORKER']);
    expect(second.data.total).toBe(2);
    expect(second.actions).not.toContain('reset:chart');
  });
});

describe('shallow and deep history', () => {
  it.each(['shallow', 'deep'] as const)(
    'uses the current orderly exit snapshot for external owner-to-own %s history',
    (kind) => {
      const fixture = historyFixture(kind);
      fixture.transitions = fixture.transitions.filter(
        (transition) => transition.id !== 'leave_workspace',
      );
      const root = fixture.layers.find((layer) => layer.id === 'root')!;
      root.transitionIds = root.transitionIds.filter(
        (transitionId) => transitionId !== 'leave_workspace',
      );
      const historyId = `${kind}_history`;
      fixture.transitions.push({
        id: 'owner_to_history',
        sourceId: 'workspace',
        targetId: historyId,
        condition: 'leave',
        action: '',
        afterTicks: null,
        type: 'condition',
        hasControlPoint: false,
        order: 1,
      });
      root.transitionIds.push('owner_to_history');
      const result = buildSemanticModel(fixture);
      expect(result.diagnostics).toEqual([]);
      if (!result.ir) throw new Error(`${kind} owner-history fixture did not build`);
      const runtime = createRuntime(result.ir);
      initializeRuntime(runtime);
      for (
        const signal of [
          'select_a',
          'advance_nested',
          'advance_left',
          'advance_right',
        ]
      ) {
        runtime.data[signal] = true;
        stepRuntime(runtime, 10);
        runtime.data[signal] = false;
      }
      runtime.data.leave = true;

      stepRuntime(runtime, 10);

      expect(active(runtime, 'parent_a')).toBe(true);
      expect(active(runtime, 'parent_b')).toBe(false);
      if (kind === 'shallow') {
        expect(active(runtime, 'nested_default')).toBe(true);
        expect(active(runtime, 'nested_previous')).toBe(false);
      } else {
        expect(active(runtime, 'nested_previous')).toBe(true);
        expect(active(runtime, 'parallel_left_previous')).toBe(true);
        expect(active(runtime, 'parallel_right_previous')).toBe(true);
      }
    },
  );

  it.each(['shallow', 'deep'] as const)(
    'falls back to the default entry when %s history has no snapshot',
    (kind) => {
      const fixture = historyFixture(kind);
      fixture.states.find((state) => state.id === 'workspace')!.autostart = false;
      fixture.states.find((state) => state.id === 'outside')!.autostart = true;
      const result = buildSemanticModel(fixture);
      expect(result.diagnostics).toEqual([]);
      if (!result.ir) throw new Error(`${kind} fallback fixture did not build`);
      const runtime = createRuntime(result.ir);
      initializeRuntime(runtime);
      runtime.data.go = true;

      stepRuntime(runtime, 10);

      expect(active(runtime, 'workspace')).toBe(true);
      expect(active(runtime, 'parent_b')).toBe(true);
      expect(active(runtime, 'parent_a')).toBe(false);
    },
  );

  it('restores only the direct child for shallow history', () => {
    const runtime = runHistoryScenario('shallow');

    expect(active(runtime, 'parent_a')).toBe(true);
    expect(active(runtime, 'nested_default')).toBe(true);
    expect(active(runtime, 'nested_previous')).toBe(false);
    expect(active(runtime, 'parallel_left_default')).toBe(true);
    expect(active(runtime, 'parallel_right_default')).toBe(true);
  });

  it('restores every nested OR and AND region for deep history', () => {
    const runtime = runHistoryScenario('deep');

    expect(active(runtime, 'parent_a')).toBe(true);
    expect(active(runtime, 'nested_previous')).toBe(true);
    expect(active(runtime, 'parallel_left_previous')).toBe(true);
    expect(active(runtime, 'parallel_right_previous')).toBe(true);
  });

  it('serializes the saved deep configuration in canonical history traces', () => {
    const runtime = runHistoryScenario('deep');

    const frame = snapshotRuntime(runtime);

    expect(JSON.parse(frame.history['workspace_children:deep']!)).toEqual([
      'parent_a',
      'nested_previous',
      'parallel_left',
      'parallel_left_previous',
      'parallel_right',
      'parallel_right_previous',
    ]);
  });

  it('clears shallow and deep snapshots on explicit reset', () => {
    const runtime = runHistoryScenario('deep');
    expect(Object.keys(runtime.deepHistory).length).toBeGreaterThan(0);

    resetRuntime(runtime);

    expect(runtime.historySlots.every((value) => value === null)).toBe(true);
    expect(runtime.deepHistory).toEqual({});
  });
});

describe('exact temporal boundaries', () => {
  it('fires after(3) on the third 10 ms step, not the fourth', () => {
    const runtime = initializedFixture('timing-boundary');

    const first = stepRuntime(runtime, 10);
    const second = stepRuntime(runtime, 10);
    const third = stepRuntime(runtime, 10);

    expect(first.activeStateIds).toContain('TIMED');
    expect(second.activeStateIds).toContain('TIMED');
    expect(third.activeStateIds).toEqual(['DONE']);
    expect(third.stateTimersMs.TIMED).toBe(0);
  });

  it('saturates active timers at the maximum safe integer', () => {
    const runtime = initializedFixture('parallel-order');
    const timed = runtime.ir.states.PARENT;
    runtime.stateTimersMs[timed.activityIndex] = Number.MAX_SAFE_INTEGER - 5;

    const frame = stepRuntime(runtime, 10);

    expect(frame.stateTimersMs.PARENT).toBe(Number.MAX_SAFE_INTEGER);
  });
});
