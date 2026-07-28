import { describe, expect, it } from 'vitest';
import { interpreterFixture, type InterpreterFixtureName } from './smFixtures';
import {
  createRuntime,
  initializeRuntime,
  resetRuntime,
  stepRuntime,
} from './smInterpreter';
import { buildSemanticModel } from './smSemanticBuilder';

const buildFixture = (name: InterpreterFixtureName) => {
  const result = buildSemanticModel(interpreterFixture(name));
  expect(result.diagnostics).toEqual([]);
  if (!result.ir) throw new Error(`fixture '${name}' did not build`);
  return result.ir;
};

const initializedFixture = (name: InterpreterFixtureName) => {
  const runtime = createRuntime(buildFixture(name));
  initializeRuntime(runtime);
  return runtime;
};

describe('Stateflow-referenced OR execution', () => {
  it('runs exit, transition action, and entry in order', () => {
    const runtime = initializedFixture('exit-action-entry');
    runtime.data.go = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual([
      'exit:A',
      'transition:t_ab',
      'entry:B',
    ]);
    expect(frame.activeStateIds).toEqual(['b']);
    expect(frame.data.counter).toBe(111);
  });

  it('executes outer before during and inner', () => {
    const runtime = initializedFixture('outer-during-inner');
    runtime.data.outer = false;
    runtime.data.inner = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual(['during:A', 'transition:inner_a']);
    expect(frame.activeStateIds).toEqual(['a', 'a2']);
    expect(frame.data.counter).toBe(11);
  });

  it('takes an enabled outer transition before during or inner behavior', () => {
    const runtime = initializedFixture('outer-during-inner');
    runtime.data.outer = true;
    runtime.data.inner = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.activeStateIds).toEqual(['b']);
    expect(frame.actions).not.toContain('during:A');
    expect(frame.actions).not.toContain('transition:inner_a');
    expect(frame.data.counter).toBe(0);
  });

  it('default-enters an active ancestor destination after its child exits', () => {
    const runtime = initializedFixture('ancestor-destination');
    runtime.data.go = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual([
      'exit:A1',
      'transition:to_ancestor',
      'entry:A1',
    ]);
    expect(frame.activeStateIds).toEqual(['a', 'a1']);
    expect(frame.data.counter).toBe(112);
  });

  it('selects the first enabled transition by semantic priority', () => {
    const runtime = initializedFixture('transition-priority');
    const frame = stepRuntime(runtime, 10);

    expect(frame.activeStateIds).toEqual(['c']);
  });

  it('distinguishes external self from internal action-only', () => {
    const external = initializedFixture('external-self');
    external.data.go = true;
    const externalFrame = stepRuntime(external, 10);

    expect(externalFrame.actions).toEqual(['exit:A', 'entry:A']);
    expect(externalFrame.data.counter).toBe(21);

    const internal = initializedFixture('internal-action');
    internal.data.go = true;
    const internalFrame = stepRuntime(internal, 10);

    expect(internalFrame.actions).toEqual(['transition:internal_a']);
    expect(internalFrame.data.counter).toBe(1);
  });

  it('backtracks junction paths without committing rejected path actions', () => {
    const runtime = initializedFixture('atomic-junction');
    runtime.data.go = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual([
      'transition:to_decision',
      'transition:selected_branch',
    ]);
    expect(frame.data.counter).toBe(11);
    expect(frame.activeStateIds).toEqual(['b']);
  });
});

describe('runtime lifecycle and canonical traces', () => {
  it('initializes defaults, active configuration, timers, history, and error', () => {
    const runtime = createRuntime(buildFixture('reset'));

    const frame = initializeRuntime(runtime);

    expect(frame.sequence).toBe(0);
    expect(frame.actions).toEqual(['entry:A']);
    expect(runtime.data.counter).toBe(0);
    expect(runtime.activeSlots).toEqual(['a']);
    expect(runtime.stateTimersMs.every((value) => value === 0)).toBe(true);
    expect(runtime.historySlots.every((value) => value === null)).toBe(true);
    expect(runtime.error).toBeNull();
  });

  it('reset exits active states and restores all defaults', () => {
    const runtime = initializedFixture('reset');
    runtime.data.counter = 99;
    stepRuntime(runtime, 10);
    runtime.historySlots[0] = 'b';
    runtime.error = {
      code: 'RUNTIME_EVALUATION_ERROR',
      message: 'injected',
    };

    const frame = resetRuntime(runtime);

    expect(frame.actions).toEqual(['exit:A', 'entry:A']);
    expect(runtime.data.counter).toBe(0);
    expect(runtime.stateTimersMs.every((value) => value === 0)).toBe(true);
    expect(runtime.historySlots.every((value) => value === null)).toBe(true);
    expect(runtime.error).toBeNull();
  });

  it('increments active-state timers and latches invalid elapsed-time errors', () => {
    const runtime = initializedFixture('reset');

    const tick = stepRuntime(runtime, 10);
    const fault = stepRuntime(runtime, -1);

    expect(tick.stateTimersMs).toMatchObject({ a: 10 });
    expect(runtime.error?.code).toBe('INVALID_ELAPSED_MS');
    expect(fault.error).toContain('INVALID_ELAPSED_MS');
    expect(fault.stateTimersMs).toMatchObject({ a: 10 });
  });

  it('preserves the first latched error across later invalid steps', () => {
    const runtime = initializedFixture('reset');
    runtime.error = {
      code: 'RUNTIME_EVALUATION_ERROR',
      message: 'first fault',
    };

    const frame = stepRuntime(runtime, -1);

    expect(runtime.error).toEqual({
      code: 'RUNTIME_EVALUATION_ERROR',
      message: 'first fault',
    });
    expect(frame.error).toBe('RUNTIME_EVALUATION_ERROR: first fault');
  });

  it('returns deeply immutable trace snapshots that do not alias runtime data', () => {
    const runtime = initializedFixture('reset');
    const frame = stepRuntime(runtime, 10);

    runtime.data.counter = 42;
    runtime.stateTimersMs[0] = 20;

    expect(frame.data.counter).toBe(0);
    expect(frame.stateTimersMs.a).toBe(10);
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame.actions)).toBe(true);
    expect(Object.isFrozen(frame.activeStateIds)).toBe(true);
    expect(Object.isFrozen(frame.data)).toBe(true);
    expect(Object.isFrozen(frame.stateTimersMs)).toBe(true);
    expect(Object.isFrozen(frame.history)).toBe(true);
  });
});
