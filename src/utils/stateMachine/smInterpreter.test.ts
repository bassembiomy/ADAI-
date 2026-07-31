import { describe, expect, it } from 'vitest';
import {
  flatOrFixture,
  historyFixture,
  hybridXBridgesFixture,
  interpreterFixture,
  parallelHistoryFixture,
  type InterpreterFixtureName,
} from './smFixtures';
import {
  createRuntime,
  initializeRuntime,
  resetRuntime,
  stepRuntime,
} from './smInterpreter';
import { buildSemanticModel } from './smSemanticBuilder';
import type {
  XBNodeV1,
  XBParameterValue,
  XBPersistedModelV1,
} from './xbModel';

const xbPort = (
  id: string,
  direction: 'input' | 'output',
) => ({
  id,
  direction,
  shape: 'scalar',
  dataType: 'float32',
});

const xbNode = (
  id: string,
  type: string,
  inputs: readonly ReturnType<typeof xbPort>[],
  outputs: readonly ReturnType<typeof xbPort>[],
  parameters: Record<string, XBParameterValue> = {},
): XBNodeV1 => ({
  id,
  type,
  parameters: { inputs, outputs, ...parameters },
});

const xbModel = (
  memory: 'reset' | 'retain' = 'reset',
  nodes: readonly XBNodeV1[] = [],
  mappings: XBPersistedModelV1['mappings'] = [],
): XBPersistedModelV1 => ({
  schemaVersion: 1,
  nodes,
  edges: [],
  mappings,
  solver: { kind: 'euler', stepSeconds: 0.002 },
  policy: { memory, numericFault: 'escalate' },
});

const addFloatVariable = (
  model: ReturnType<typeof hybridXBridgesFixture>,
  id: string,
  initialValue = 0,
): void => {
  model.variables.push({
    id,
    name: id,
    type: 'float',
    initialValue: String(initialValue),
    currentValue: initialValue,
    visibleInScope: true,
  });
};

const gainModel = (
  memory: 'reset' | 'retain' = 'reset',
): XBPersistedModelV1 => xbModel(
  memory,
  [xbNode(
    'gain',
    'GAIN',
    [xbPort('u', 'input')],
    [xbPort('y', 'output')],
    { gain: 2 },
  )],
  [
    { smVarId: 'u', blockId: 'gain', portId: 'u', direction: 'in' },
    { smVarId: 'y', blockId: 'gain', portId: 'y', direction: 'out' },
  ],
);

const memoryModel = (
  memory: 'reset' | 'retain',
): XBPersistedModelV1 => xbModel(
  memory,
  [
    xbNode(
      'delay',
      'UNIT_DELAY',
      [xbPort('u', 'input')],
      [xbPort('y', 'output')],
      { initialValue: 2 },
    ),
    xbNode(
      'integrator',
      'INTEGRATOR_DISCRETE',
      [xbPort('u', 'input')],
      [xbPort('y', 'output')],
      { initialValue: 3 },
    ),
  ],
  [
    { smVarId: 'u', blockId: 'delay', portId: 'u', direction: 'in' },
    {
      smVarId: 'u',
      blockId: 'integrator',
      portId: 'u',
      direction: 'in',
    },
  ],
);

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

describe('X-Bridges during order and memory policy', () => {
  it('runs textual during, X-Bridges, then an inner transition', () => {
    const model = hybridXBridgesFixture();
    const ordinary = model.states.find((state) => state.id === 'ordinary')!;
    const controller = model.states.find((state) => state.id === 'controller')!;
    ordinary.autostart = false;
    controller.autostart = true;
    controller.during = 'u = 2;';
    controller.internalTransitions = '[y > 3] / u = u;';
    controller.xBridgesModel = gainModel();
    addFloatVariable(model, 'u');
    addFloatVariable(model, 'y');

    const built = buildSemanticModel(model);
    expect(built.diagnostics).toEqual([]);
    const runtime = createRuntime(built.ir!);
    initializeRuntime(runtime);

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual([
      'during:CONTROLLER',
      'xbridges:CONTROLLER',
      'transition:$internal_controller_0',
    ]);
    expect(frame.data.y).toBe(4);
  });

  it('suppresses X-Bridges when an enabled outer transition exits its owner', () => {
    const model = hybridXBridgesFixture();
    const ordinary = model.states.find((state) => state.id === 'ordinary')!;
    const controller = model.states.find((state) => state.id === 'controller')!;
    ordinary.autostart = false;
    controller.autostart = true;
    controller.during = 'u = 2;';
    controller.xBridgesModel = gainModel();
    addFloatVariable(model, 'u');
    addFloatVariable(model, 'y');
    model.variables.push({
      id: 'leave',
      name: 'leave',
      type: 'bool',
      initialValue: 'false',
      currentValue: false,
      visibleInScope: true,
    });
    model.transitions.push({
      id: 'leave_controller',
      sourceId: 'controller',
      targetId: 'ordinary',
      condition: 'leave',
      action: '',
      afterTicks: null,
      type: 'condition',
      hasControlPoint: false,
      order: 1,
    });
    model.layers[0].transitionIds.push('leave_controller');

    const built = buildSemanticModel(model);
    expect(built.diagnostics).toEqual([]);
    const runtime = createRuntime(built.ir!);
    initializeRuntime(runtime);
    runtime.data.leave = true;

    const frame = stepRuntime(runtime, 10);

    expect(frame.activeStateIds).toEqual(['ordinary']);
    expect(frame.actions).not.toContain('during:CONTROLLER');
    expect(frame.actions).not.toContain('xbridges:CONTROLLER');
  });

  it('does not reset block memory for an internal-action transition', () => {
    const model = hybridXBridgesFixture();
    const ordinary = model.states.find((state) => state.id === 'ordinary')!;
    const controller = model.states.find((state) => state.id === 'controller')!;
    ordinary.autostart = false;
    controller.autostart = true;
    controller.internalTransitions = '[true] / u = u;';
    controller.xBridgesModel = memoryModel('reset');
    addFloatVariable(model, 'u');

    const built = buildSemanticModel(model);
    expect(built.diagnostics).toEqual([]);
    const runtime = createRuntime(built.ir!);
    initializeRuntime(runtime);
    runtime.data.u = 7;

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions).toEqual([
      'xbridges:CONTROLLER',
      'transition:$internal_controller_0',
    ]);
    expect(
      runtime.xBridgesByStateId.controller.stateSlots['delay:y$state'],
    ).toEqual([7]);
    expect(
      runtime.xBridgesByStateId.controller.stateSlots[
        'integrator:y$state'
      ],
    ).toEqual([10]);
  });

  it('steps parallel X-Bridges states by layer priority and stable ID', () => {
    const model = parallelHistoryFixture('parallel-order');
    const r1 = model.states.find((state) => state.id === 'R1')!;
    const r2 = model.states.find((state) => state.id === 'R2')!;
    r1.isXBridges = true;
    r2.isXBridges = true;
    r1.xBridgesModel = xbModel();
    r2.xBridgesModel = xbModel();

    const built = buildSemanticModel(model);
    expect(built.diagnostics).toEqual([]);
    const ir = structuredClone(built.ir!);
    ir.states.R1.priority = 1;
    ir.states.R2.priority = 1;
    ir.layers.parallel_regions.children = ['R2', 'R1', 'R3'];
    const runtime = createRuntime(ir);
    initializeRuntime(runtime);

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions.filter((action) => action.startsWith('xbridges:')))
      .toEqual(['xbridges:R1', 'xbridges:R2']);
  });

  it('orders parallel X-Bridges states by priority before stable ID', () => {
    const model = parallelHistoryFixture('parallel-order');
    const r1 = model.states.find((state) => state.id === 'R1')!;
    const r2 = model.states.find((state) => state.id === 'R2')!;
    r1.priority = 2;
    r2.priority = 1;
    r1.isXBridges = true;
    r2.isXBridges = true;
    r1.xBridgesModel = xbModel();
    r2.xBridgesModel = xbModel();

    const built = buildSemanticModel(model);
    expect(built.diagnostics).toEqual([]);
    const runtime = createRuntime(built.ir!);
    initializeRuntime(runtime);

    const frame = stepRuntime(runtime, 10);

    expect(frame.actions.filter((action) => action.startsWith('xbridges:')))
      .toEqual(['xbridges:R2', 'xbridges:R1']);
  });

  it.each(['reset', 'retain'] as const)(
    'applies %s memory policy on exit and re-entry and clears it on resetRuntime',
    (memory) => {
      const model = hybridXBridgesFixture();
      const ordinary = model.states.find((state) => state.id === 'ordinary')!;
      const controller = model.states.find((state) => state.id === 'controller')!;
      ordinary.autostart = false;
      controller.autostart = true;
      controller.xBridgesModel = memoryModel(memory);
      addFloatVariable(model, 'u');
      model.variables.push({
        id: 'reenter',
        name: 'reenter',
        type: 'bool',
        initialValue: 'false',
        currentValue: false,
        visibleInScope: true,
      });
      model.transitions.push({
        id: 'reenter_controller',
        sourceId: 'controller',
        targetId: 'controller',
        condition: 'reenter',
        action: '',
        afterTicks: null,
        type: 'condition',
        hasControlPoint: false,
        order: 1,
      });
      model.layers[0].transitionIds.push('reenter_controller');
      const built = buildSemanticModel(model);
      expect(built.diagnostics).toEqual([]);
      const runtime = createRuntime(built.ir!);
      initializeRuntime(runtime);
      runtime.data.u = 7;
      stepRuntime(runtime, 10);
      runtime.data.reenter = true;

      stepRuntime(runtime, 10);

      const xb = runtime.xBridgesByStateId.controller;
      expect(xb.stateSlots['delay:y$state']).toEqual(
        memory === 'reset' ? [2] : [7],
      );
      expect(xb.stateSlots['integrator:y$state']).toEqual(
        memory === 'reset' ? [3] : [10],
      );

      resetRuntime(runtime);
      expect(xb.stateSlots['delay:y$state']).toEqual([2]);
      expect(xb.stateSlots['integrator:y$state']).toEqual([3]);
    },
  );

  it.each([
    ['shallow', 'reset'],
    ['shallow', 'retain'],
    ['deep', 'reset'],
    ['deep', 'retain'],
  ] as const)(
    '%s history restores configuration while %s memory policy remains independent',
    (history, memory) => {
      const model = historyFixture(history);
      const owner = model.states.find((state) => state.id === 'parent_a')!;
      owner.isXBridges = true;
      owner.xBridgesModel = memoryModel(memory);
      addFloatVariable(model, 'u');
      const built = buildSemanticModel(model);
      expect(built.diagnostics).toEqual([]);
      const runtime = createRuntime(built.ir!);
      initializeRuntime(runtime);
      runtime.data.select_a = true;
      stepRuntime(runtime, 10);
      runtime.data.select_a = false;
      for (
        const signal of [
          'advance_nested',
          'advance_left',
          'advance_right',
        ]
      ) {
        runtime.data[signal] = true;
        stepRuntime(runtime, 10);
        runtime.data[signal] = false;
      }
      runtime.data.u = 7;
      stepRuntime(runtime, 10);
      runtime.data.leave = true;
      stepRuntime(runtime, 10);
      runtime.data.leave = false;
      runtime.data.go = true;

      stepRuntime(runtime, 10);

      expect(
        runtime.stateActive[runtime.ir.states.parent_a.activityIndex],
      ).toBe(true);
      const active = (stateId: string): boolean =>
        runtime.stateActive[runtime.ir.states[stateId].activityIndex];
      if (history === 'shallow') {
        expect(active('nested_default')).toBe(true);
        expect(active('nested_previous')).toBe(false);
        expect(active('parallel_left_default')).toBe(true);
        expect(active('parallel_left_previous')).toBe(false);
        expect(active('parallel_right_default')).toBe(true);
        expect(active('parallel_right_previous')).toBe(false);
      } else {
        expect(active('nested_default')).toBe(false);
        expect(active('nested_previous')).toBe(true);
        expect(active('parallel_left_default')).toBe(false);
        expect(active('parallel_left_previous')).toBe(true);
        expect(active('parallel_right_default')).toBe(false);
        expect(active('parallel_right_previous')).toBe(true);
      }
      const xb = runtime.xBridgesByStateId.parent_a;
      expect(xb.stateSlots['delay:y$state']).toEqual(
        memory === 'reset' ? [2] : [7],
      );
      expect(xb.stateSlots['integrator:y$state']).toEqual(
        memory === 'reset' ? [3] : [10],
      );
    },
  );
});

describe('Stateflow-referenced OR execution', () => {
  it('omits empty layers from executable history observations', () => {
    const model = flatOrFixture();
    model.layers.push({
      ...model.layers[0],
      id: 'empty_b_children',
      name: 'empty_b_children',
      parentStateId: 'b',
      stateIds: [],
      transitionIds: [],
      junctionIds: [],
      decomposition: 'OR',
    });
    model.transitions.push({
      ...model.transitions[0],
      id: 't_ba',
      sourceId: 'b',
      targetId: 'a',
      condition: 'go == false',
      order: 1,
    });
    model.layers[0].transitionIds.push('t_ba');
    const built = buildSemanticModel(model);
    expect(built.diagnostics).toEqual([]);
    const runtime = createRuntime(built.ir!);
    initializeRuntime(runtime);
    runtime.data.go = true;
    stepRuntime(runtime, 10);
    runtime.data.go = false;

    const frame = stepRuntime(runtime, 10);

    expect(frame.history).not.toHaveProperty('empty_b_children:deep');
  });

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

  it('coerces assignments to the declared data type like generated C', () => {
    const model = interpreterFixture('reset');
    const counter = model.variables.find((variable) => variable.id === 'counter')!;
    counter.type = 'int32';
    const active = model.states.find((state) => state.id === 'a')!;
    active.during = 'counter = 1.9;';
    const built = buildSemanticModel(model);
    expect(built.diagnostics).toEqual([]);
    const runtime = createRuntime(built.ir!);
    initializeRuntime(runtime);

    const frame = stepRuntime(runtime, 10);

    expect(frame.data.counter).toBe(1);
  });
});
