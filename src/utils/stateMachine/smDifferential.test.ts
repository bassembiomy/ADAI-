import { describe, expect, it } from 'vitest';
import { buildSemanticModel } from './smSemanticBuilder';
import {
  renderConfigHeader,
  renderCoreHeader,
  renderCoreSource,
  renderUserLogicSource,
} from './smCGenerator';
import { flatOrFixture } from './smFixtures';
import {
  compareSemanticTraces,
  type SemanticTraceFrame,
} from './smTrace';
import {
  semanticFixture,
  hybridXBridgesFixture,
  type DifferentialFixtureName,
} from './smFixtures';
import {
  compileAndRunCTrace,
  renderDifferentialHarness,
  runInterpreterTrace,
} from './smCHarness';
import {
  createRuntime,
  initializeRuntime,
  stepRuntime,
} from './smInterpreter';
import type { AnyStateMachineModel } from './smModel';
import { XB_EXECUTABLE_C_CASES } from './xbCConformanceCases';
import { setXBConformanceStatus } from './xbConformanceStatus';

const frame = (
  sequence: number,
  activeStateIds: string[] = ['a'],
): SemanticTraceFrame => ({
  sequence,
  elapsedMs: 10,
  activeStateIds,
  actions: [],
  data: { go: false },
  stateTimersMs: { a: 10 },
  history: { root: 'a' },
  mappedOutputs: {},
  ioEffects: { safeOutputsApplied: 0, watchdogKicks: 0 },
  xBridges: {},
  error: null,
});

describe('semantic trace comparison', () => {
  it('reports the first differing frame with both values', () => {
    const expected = [frame(0), frame(1), frame(2, ['b'])];
    const actual = [frame(0), frame(1, ['b']), frame(2, ['b'])];

    expect(compareSemanticTraces(expected, actual)).toEqual({
      index: 1,
      expected: expected[1],
      actual: actual[1],
    });
  });

  it('reports a missing frame at the first length difference', () => {
    const expected = [frame(0), frame(1)];
    const actual = [frame(0)];

    expect(compareSemanticTraces(expected, actual)).toEqual({
      index: 1,
      expected: expected[1],
      actual: undefined,
    });
  });

  it('treats record insertion order as semantically irrelevant', () => {
    const expected = frame(0);
    expected.data = { alpha: 1, beta: 2 };
    const actual = frame(0);
    actual.data = { beta: 2, alpha: 1 };

    expect(compareSemanticTraces([expected], [actual])).toBeNull();
  });

  it('compares canonical X-Bridges signals, block state, and faults deeply', () => {
    const expected = frame(0);
    expected.xBridges = {
      controller: {
        signals: { 'gain:y': 1.25, 'vector:y': [1, 2] },
        blockState: { delay: { previous: 1 } },
        faults: [],
      },
    };
    const actual = frame(0);
    actual.xBridges = {
      controller: {
        signals: { 'vector:y': [1, 2], 'gain:y': 1.25 },
        blockState: { delay: { previous: 1 } },
        faults: [],
      },
    };

    expect(compareSemanticTraces([expected], [actual])).toBeNull();
    actual.xBridges.controller.blockState.delay.previous = 2;
    expect(compareSemanticTraces([expected], [actual])?.index).toBe(0);
  });
});

describe('generated trace instrumentation contract', () => {
  const model = flatOrFixture();
  model.states[0].entry = 'total = total + 1;';
  const built = buildSemanticModel(model);
  if (!built.ir) throw new Error('fixture must build');
  const ir = built.ir;

  it('exposes a test-only trace sink and omits trace storage in production preprocessing', () => {
    const config = renderConfigHeader(ir);
    const header = renderCoreHeader();
    const source = renderCoreSource(ir);
    const userLogic = renderUserLogicSource(ir);

    expect(config).toContain('#ifdef SM_TRACE_ENABLED');
    expect(config).toContain('SM_TraceSink_t trace_sink;');
    expect(header).toContain(
      'void SM_SetTraceSink(ADIA_Instance_t *instance, SM_TraceSink_t sink);',
    );
    expect(source).toContain('#ifdef SM_TRACE_ENABLED');
    expect(source).toContain('SM_TraceAction(instance, "transition:t_ab");');
    expect(userLogic).toContain('SM_TraceAction(instance, "entry:A");');
  });

  it('escapes model-owned transition ids in trace string literals', () => {
    const quotedModel = flatOrFixture();
    quotedModel.transitions[0].id = 'quoted"id';
    quotedModel.layers[0].transitionIds = ['quoted"id'];
    const quotedBuild = buildSemanticModel(quotedModel);
    if (!quotedBuild.ir) throw new Error('quoted fixture must build');

    expect(renderCoreSource(quotedBuild.ir)).toContain(
      'SM_TraceAction(instance, "transition:quoted\\"id");',
    );
  });

  it('forces the C numeric locale before emitting trace numbers', () => {
    const harness = renderDifferentialHarness(ir, []);

    expect(harness).toContain('#include <locale.h>');
    expect(harness).toContain('(void)setlocale(LC_NUMERIC, "C");');
    expect(harness.indexOf('(void)setlocale(LC_NUMERIC, "C");'))
      .toBeLessThan(harness.indexOf('(void)SM_Init(&instance);'));
  });
});

const fixtureMatrix: readonly DifferentialFixtureName[] = [
  'flat-priority',
  'nested-cross-boundary',
  'external-self',
  'internal-action',
  'inner-descendant',
  'inner-history',
  'parallel-independent',
  'parallel-parent-exit',
  'shallow-history',
  'deep-history-and',
  'junction-backtracking',
  'temporal-exact-boundary',
  'timing-jitter-normalized',
  'terminal-or',
  'terminal-and-sibling',
  'reset',
  'safe-output-fault',
];

type NumericFaultCase =
  | 'division-by-zero'
  | 'fixed-overflow'
  | 'non-finite-float'
  | 'solve-pivot-failure';

const xbPort = (
  id: string,
  direction: 'input' | 'output',
  shape: 'scalar' | 'vector' | 'matrix',
  dimensions: readonly number[],
  dataType: string,
) => ({ id, direction, shape, dimensions, dataType });

const stepSourceFixture = (): AnyStateMachineModel => {
  const model = hybridXBridgesFixture();
  model.states[0].autostart = false;
  const controller = model.states.find((state) => state.id === 'controller')!;
  controller.autostart = true;
  controller.xBridgesModel = {
    schemaVersion: 1,
    nodes: [{
      id: 'step',
      type: 'Step',
      parameters: {
        step_time: 0.03,
        initial_value: 2,
        final_value: 5,
        inputs: [],
        outputs: [xbPort('out', 'output', 'scalar', [], 'float32')],
      },
    }],
    edges: [],
    mappings: [],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  return model;
};

const numericFaultFixture = (
  faultCase: NumericFaultCase,
  numericFault: 'signal-only' | 'escalate',
): AnyStateMachineModel => {
  const model = hybridXBridgesFixture();
  const ordinary = model.states.find((state) => state.id === 'ordinary')!;
  const controller = model.states.find((state) => state.id === 'controller')!;
  ordinary.autostart = false;
  controller.autostart = true;
  model.safetyMode = true;
  model.variables.push({
    id: 'output_enable', name: 'output_enable', type: 'bool',
    initialValue: 'true', currentValue: true, visibleInScope: true,
  });
  model.hilConfig = {
    enabled: true, target: 'Generic', clockSpeed: 1, commPort: '', baudRate: 115200,
    channels: [{
      id: 'motor', name: 'Motor', peripheral: 'GPIO', pin: '0',
      direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1,
      scalingFactor: 1, unit: '',
    }],
    mappings: [{
      id: 'write_motor', adiaVarId: 'output_enable', channelId: 'motor',
      direction: 'write', safeValue: false,
    }],
  };
  const scalar64 = (id: string, direction: 'input' | 'output') =>
    xbPort(id, direction, 'scalar', [], 'float32');
  const vector64 = (id: string, direction: 'input' | 'output') =>
    xbPort(id, direction, 'vector', [2], 'float32');
  const matrix64 = (id: string, direction: 'input' | 'output', rows: number, columns: number) =>
    xbPort(id, direction, 'matrix', [rows, columns], 'float32');
  const constant = (id: string, value: number | number[], output: ReturnType<typeof scalar64>) => ({
    id, type: 'Constant', parameters: { value, inputs: [], outputs: [output] },
  });
  const terminator = (input: ReturnType<typeof scalar64>) => ({
    id: 'sink', type: 'TERMINATOR', parameters: { inputs: [input], outputs: [] },
  });
  let nodes: any[];
  let edges: any[];
  let operationId: string;
  switch (faultCase) {
    case 'division-by-zero':
      operationId = 'divide';
      nodes = [
        constant('numerator', [1, 1], vector64('out', 'output')),
        constant('denominator', [0, 0], vector64('out', 'output')),
        {
          id: operationId, type: 'VectorDiv', parameters: {
            inputs: [vector64('a', 'input'), vector64('b', 'input')],
            outputs: [vector64('y', 'output')],
          },
        },
        terminator(vector64('u', 'input')),
      ];
      edges = [
        { id: 'numerator_to_divide', sourceNodeId: 'numerator', sourcePortId: 'out', targetNodeId: operationId, targetPortId: 'a' },
        { id: 'denominator_to_divide', sourceNodeId: 'denominator', sourcePortId: 'out', targetNodeId: operationId, targetPortId: 'b' },
        { id: 'divide_to_sink', sourceNodeId: operationId, sourcePortId: 'y', targetNodeId: 'sink', targetPortId: 'u' },
      ];
      break;
    case 'fixed-overflow':
      operationId = 'convert';
      nodes = [
        constant('source', 128, scalar64('out', 'output')),
        {
          id: operationId, type: 'DATA_TYPE_CONVERSION', parameters: {
            output_type: 'int8', rounding: 'zero', overflow: 'error',
            inputs: [scalar64('u', 'input')],
            outputs: [xbPort('y', 'output', 'scalar', [], 'int8')],
          },
        },
        terminator(xbPort('u', 'input', 'scalar', [], 'int8')),
      ];
      edges = [
        { id: 'source_to_convert', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: operationId, targetPortId: 'u' },
        { id: 'convert_to_sink', sourceNodeId: operationId, sourcePortId: 'y', targetNodeId: 'sink', targetPortId: 'u' },
      ];
      break;
    case 'non-finite-float':
      operationId = 'gain';
      nodes = [
        constant('source', 1e20, scalar64('out', 'output')),
        {
          id: operationId, type: 'GAIN', parameters: {
            gain: 1e20,
            inputs: [scalar64('u', 'input')],
            outputs: [xbPort('y', 'output', 'scalar', [], 'float32')],
          },
        },
        terminator(scalar64('u', 'input')),
      ];
      edges = [
        { id: 'source_to_gain', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: operationId, targetPortId: 'u' },
        { id: 'gain_to_sink', sourceNodeId: operationId, sourcePortId: 'y', targetNodeId: 'sink', targetPortId: 'u' },
      ];
      break;
    case 'solve-pivot-failure':
      operationId = 'solve';
      nodes = [
        constant('matrix', [1, 2, 2, 4], matrix64('out', 'output', 2, 2)),
        constant('right', [3, 6], matrix64('out', 'output', 2, 1)),
        {
          id: operationId, type: 'MatrixSolve', parameters: {
            maxDimension: 4,
            inputs: [matrix64('a', 'input', 2, 2), matrix64('b', 'input', 2, 1)],
            outputs: [matrix64('y', 'output', 2, 1)],
          },
        },
        terminator(matrix64('u', 'input', 2, 1)),
      ];
      edges = [
        { id: 'matrix_to_solve', sourceNodeId: 'matrix', sourcePortId: 'out', targetNodeId: operationId, targetPortId: 'a' },
        { id: 'right_to_solve', sourceNodeId: 'right', sourcePortId: 'out', targetNodeId: operationId, targetPortId: 'b' },
        { id: 'solve_to_sink', sourceNodeId: operationId, sourcePortId: 'y', targetNodeId: 'sink', targetPortId: 'u' },
      ];
      break;
  }
  controller.xBridgesModel = {
    schemaVersion: 1, nodes, edges, mappings: [],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault },
  };
  return model;
};

const runNumericFault = (
  faultCase: NumericFaultCase,
  policy: 'signal-only' | 'escalate',
) => {
  const model = numericFaultFixture(faultCase, policy);
  const built = buildSemanticModel(model);
  if (built.ir === undefined) throw new Error(`numeric fixture failed to build: ${built.diagnostics.map((diagnostic) => `${diagnostic.code}:${diagnostic.message}`).join(', ')}`);
  const runtime = createRuntime(built.ir);
  initializeRuntime(runtime);
  stepRuntime(runtime, built.ir.tickMs);
  const frame = runInterpreterTrace({
    name: 'flat-priority', model, steps: [{ kind: 'step' }],
  }).at(-1)!;
  const xBridges = runtime.xBridgesByStateId.controller as typeof runtime.xBridgesByStateId.controller & {
    operationFaults?: Record<string, { active: boolean }>;
  };
  const operationId = {
    'division-by-zero': 'divide',
    'fixed-overflow': 'convert',
    'non-finite-float': 'gain',
    'solve-pivot-failure': 'solve',
  }[faultCase];
  return {
    frame,
    runtime,
    errorOutput: xBridges.operationFaults?.[operationId]?.active ?? false,
  };
};

const statefulOverflowFixture = (
  numericFault: 'signal-only' | 'escalate',
): AnyStateMachineModel => {
  const model = hybridXBridgesFixture();
  const ordinary = model.states.find((state) => state.id === 'ordinary')!;
  const controller = model.states.find((state) => state.id === 'controller')!;
  ordinary.autostart = false;
  controller.autostart = true;
  model.variables.push({
    id: 'delay_y', name: 'delay_y', type: 'int', initialValue: '7',
    currentValue: 7, visibleInScope: true,
  });
  controller.xBridgesModel = {
    schemaVersion: 1,
    nodes: [
      { id: 'source', type: 'Constant', parameters: {
        value: 128, inputs: [], outputs: [xbPort('out', 'output', 'scalar', [], 'float32')],
      } },
      { id: 'delay', type: 'UNIT_DELAY', parameters: {
        initialValue: 7, overflow: 'error',
        inputs: [xbPort('u', 'input', 'scalar', [], 'float32')],
        outputs: [xbPort('y', 'output', 'scalar', [], 'int8')],
      } },
    ],
    edges: [{
      id: 'source-to-delay', sourceNodeId: 'source', sourcePortId: 'out',
      targetNodeId: 'delay', targetPortId: 'u',
    }],
    mappings: [{ smVarId: 'delay_y', blockId: 'delay', portId: 'y', direction: 'out' }],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault },
  };
  return model;
};

const traceConstant = (
  id: string,
  value: number | number[],
  shape: 'scalar' | 'vector' | 'matrix',
  dimensions: readonly number[],
) => ({
  id,
  type: 'Constant',
  parameters: {
    value,
    inputs: [],
    outputs: [xbPort('y', 'output', shape, dimensions, 'float32')],
  },
});

const shapedTraceFixture = (): AnyStateMachineModel => {
  const model = hybridXBridgesFixture();
  model.states[0].autostart = false;
  const controller = model.states.find((state) => state.id === 'controller')!;
  controller.autostart = true;
  controller.xBridgesModel = {
    schemaVersion: 1,
    nodes: [
      traceConstant('vector', [1.25, -2.5], 'vector', [2]),
      traceConstant('matrix', [1, 2, 3, 4], 'matrix', [2, 2]),
      {
        id: 'vector_sink', type: 'TERMINATOR', parameters: {
          inputs: [xbPort('u', 'input', 'vector', [2], 'float32')], outputs: [],
        },
      },
      {
        id: 'matrix_sink', type: 'TERMINATOR', parameters: {
          inputs: [xbPort('u', 'input', 'matrix', [2, 2], 'float32')], outputs: [],
        },
      },
    ],
    edges: [
      { id: 'vector_to_sink', sourceNodeId: 'vector', sourcePortId: 'y', targetNodeId: 'vector_sink', targetPortId: 'u' },
      { id: 'matrix_to_sink', sourceNodeId: 'matrix', sourcePortId: 'y', targetNodeId: 'matrix_sink', targetPortId: 'u' },
    ], mappings: [],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault: 'signal-only' },
  };
  return model;
};

const collisionAndOrderingFixture = (): AnyStateMachineModel => {
  const model = hybridXBridgesFixture();
  const template = model.states.find((state) => state.id === 'controller')!;
  const makeState = (id: string, nodes: any[], edges: any[]) => ({
    ...template,
    id,
    name: id,
    autostart: false,
    xBridgesModel: {
      schemaVersion: 1 as const,
      nodes,
      edges,
      mappings: [],
      solver: { kind: 'euler' as const, stepSeconds: 0.002 },
      policy: { memory: 'reset' as const, numericFault: 'signal-only' as const },
    },
  });
  const scalar = (id: string, direction: 'input' | 'output') =>
    xbPort(id, direction, 'scalar', [], 'float32');
  const source = traceConstant('z_source', 3, 'scalar', []);
  const zDelay = {
    id: 'z-delay', type: 'UNIT_DELAY', parameters: {
      initialValue: 1,
      inputs: [scalar('u', 'input')], outputs: [scalar('y', 'output')],
    },
  };
  const aDelay = {
    id: 'a_delay', type: 'UNIT_DELAY', parameters: {
      initialValue: 2,
      inputs: [scalar('u', 'input')], outputs: [scalar('y', 'output')],
    },
  };
  const first = makeState('z-controller', [source, zDelay, aDelay], [
    { id: 'source-z', sourceNodeId: 'z_source', sourcePortId: 'y', targetNodeId: 'z-delay', targetPortId: 'u' },
    { id: 'z-a', sourceNodeId: 'z-delay', sourcePortId: 'y', targetNodeId: 'a_delay', targetPortId: 'u' },
  ]);
  const collisionDelay = {
    id: 'z_delay', type: 'UNIT_DELAY', parameters: {
      initialValue: 4,
      inputs: [scalar('u', 'input')], outputs: [scalar('y', 'output')],
    },
  };
  first.xBridgesModel!.nodes = [source, zDelay, collisionDelay, aDelay];
  first.xBridgesModel!.edges = [
    { id: 'source-z', sourceNodeId: 'z_source', sourcePortId: 'y', targetNodeId: 'z-delay', targetPortId: 'u' },
    { id: 'z-collision', sourceNodeId: 'z-delay', sourcePortId: 'y', targetNodeId: 'z_delay', targetPortId: 'u' },
    { id: 'collision-a', sourceNodeId: 'z_delay', sourcePortId: 'y', targetNodeId: 'a_delay', targetPortId: 'u' },
  ];
  first.priority = 1;
  const second = makeState('a-controller', [
    traceConstant('only-source', 9, 'scalar', []),
  ], []);
  second.priority = 2;
  model.states = [first, second];
  model.layers[0].decomposition = 'AND';
  model.layers[0].stateIds = ['z-controller', 'a-controller'];
  model.layers[0].transitionIds = [];
  model.transitions = [];
  return model;
};

const multiSampleDelayFixture = (): AnyStateMachineModel => {
  const model = hybridXBridgesFixture();
  const template = model.states.find((state) => state.id === 'controller')!;
  const scalar = (id: string, direction: 'input' | 'output') =>
    xbPort(id, direction, 'scalar', [], 'float32');
  const source = traceConstant('u_source', 7, 'scalar', []);
  const delay = {
    id: 'delay',
    type: 'DELAY',
    parameters: {
      delay_length: 2,
      initial_condition: -1,
      inputs: [scalar('u', 'input')],
      outputs: [scalar('y', 'output')],
    },
  };
  const outport = {
    id: 'out_y',
    type: 'Outport',
    parameters: {
      smVarId: 'delay_y',
      inputs: [scalar('in', 'input')],
      outputs: [scalar('out', 'output')],
    },
  };
  const controller = {
    ...template,
    id: 'controller',
    name: 'controller',
    autostart: true,
    xBridgesModel: {
      schemaVersion: 1 as const,
      nodes: [source, delay, outport],
      edges: [
        { id: 'src-del', sourceNodeId: 'u_source', sourcePortId: 'y', targetNodeId: 'delay', targetPortId: 'u' },
        { id: 'del-out', sourceNodeId: 'delay', sourcePortId: 'y', targetNodeId: 'out_y', targetPortId: 'in' },
      ],
      mappings: [{
        smVarId: 'delay_y',
        blockId: 'out_y',
        portId: 'out',
        direction: 'out' as const,
      }],
      solver: { kind: 'euler' as const, stepSeconds: 0.01 },
      policy: { memory: 'reset' as const, numericFault: 'signal-only' as const },
    },
  };
  model.states = [controller];
  model.layers[0].stateIds = ['controller'];
  model.variables = [{ id: 'delay_y', name: 'delay_y', type: 'float', initialValue: '-1', currentValue: -1, visibleInScope: true }];
  return model;
};

describe('X-Bridges numeric fault recovery and escalation', () => {
  it.each([
    'division-by-zero',
    'fixed-overflow',
    'non-finite-float',
    'solve-pivot-failure',
  ] as const)('%s signals a recoverable numeric fault without a runtime error', (faultCase) => {
    const signalOnly = runNumericFault(faultCase, 'signal-only');

    expect(signalOnly.errorOutput).toBe(true);
    expect(signalOnly.runtime.error).toBeNull();
    expect(signalOnly.frame.error).toBeNull();
  });

  it.each([
    'division-by-zero',
    'fixed-overflow',
    'non-finite-float',
    'solve-pivot-failure',
  ] as const)('%s latches XBRIDGES_NUMERIC and follows the safety output path', (faultCase) => {
    const escalated = runNumericFault(faultCase, 'escalate');

    expect(escalated.errorOutput).toBe(true);
    expect(escalated.runtime.error?.code).toBe('XBRIDGES_NUMERIC');
    expect(escalated.frame.ioEffects).toEqual({
      safeOutputsApplied: 1,
      watchdogKicks: 0,
    });
  });

  it.each([
    'division-by-zero',
    'fixed-overflow',
    'non-finite-float',
    'solve-pivot-failure',
  ] as const)('%s preserves the numeric-fault contract in generated C for both policies', (faultCase) => {
    for (const policy of ['signal-only', 'escalate'] as const) {
      const fixture = {
        name: 'flat-priority' as const,
        model: numericFaultFixture(faultCase, policy),
        steps: [{ kind: 'step' as const }],
      };
      const expected = runInterpreterTrace(fixture);
      const actual = compileAndRunCTrace(fixture);

      const operationId = {
        'division-by-zero': 'divide',
        'fixed-overflow': 'convert',
        'non-finite-float': 'gain',
        'solve-pivot-failure': 'solve',
      }[faultCase];
      expect(actual.at(-1)?.xBridgesFaults[`controller/${operationId}`]).toBe(true);
      expect(compareSemanticTraces(expected, actual), policy).toBeNull();
    }
  }, 60_000);

  it.each(['signal-only', 'escalate'] as const)(
    'retains the previous fixed UNIT_DELAY state transactionally on %s overflow in TypeScript and C',
    (policy) => {
      const fixture = {
        name: 'flat-priority' as const,
        model: statefulOverflowFixture(policy),
        steps: [{ kind: 'step' as const }],
      };
      const expected = runInterpreterTrace(fixture);
      const actual = compileAndRunCTrace(fixture);

      expect(expected.at(-1)?.data.delay_y).toBe(7);
      expect(actual.at(-1)?.xBridgesFaults['controller/delay']).toBe(true);
      expect(compareSemanticTraces(expected, actual)).toBeNull();
    },
    60_000,
  );
});

describe('TypeScript-versus-generated-C differential gate', () => {
  it('T14-INT-STEP and T14-C99-STEP preserve state-timer Step semantics', () => {
    const fixture = {
      name: 'flat-priority' as const,
      model: stepSourceFixture(),
      steps: [
        { kind: 'step' as const },
        { kind: 'step' as const },
        { kind: 'step' as const },
      ],
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);

    expect(expected.map((frame) =>
      frame.xBridges.controller.signals['step:out']))
      .toEqual([0, 2, 2, 5]);
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('GEN-XB-DELAY-TEST-008..012: multi-sample DELAY(N=2, IC=-1, input=7) compiles cleanly, uses uint32 index, and matches sequence [-1, -1, 7, 7]', () => {
    const fixture = {
      name: 'flat-priority' as const,
      model: multiSampleDelayFixture(),
      steps: [
        { kind: 'step' as const },
        { kind: 'step' as const },
        { kind: 'step' as const },
      ],
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);

    // TEST-008 / TEST-011: Sequence output matches reference delayed sequence
    expect(expected.map((frame) => frame.data.delay_y)).toEqual([-1, -1, -1, 7]);
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('T14-INT-CORE-DIRECT and T14-C99-CORE-DIRECT preserve boundary mapping parity through Inport, Sum, and Outport', () => {
    const model = hybridXBridgesFixture();
    model.states[0].autostart = false;
    const controller = model.states.find((state) => state.id === 'controller')!;
    controller.autostart = true;
    model.variables.push({
      id: 'x', name: 'x', type: 'float', initialValue: '1', currentValue: 1,
      visibleInScope: true,
    });
    const scalar = (id: string, direction: 'input' | 'output') =>
      xbPort(id, direction, 'scalar', [], 'float32');
    controller.xBridgesModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'inport', type: 'Inport', parameters: { inputs: [scalar('in', 'input')], outputs: [scalar('y', 'output')] } },
        { id: 'constant', type: 'Constant', parameters: { value: 1, inputs: [], outputs: [scalar('y', 'output')] } },
        { id: 'sum', type: 'Sum', parameters: { signs: '++', inputs: [scalar('a', 'input'), scalar('b', 'input')], outputs: [scalar('y', 'output')] } },
        { id: 'outport', type: 'Outport', parameters: { inputs: [scalar('u', 'input')], outputs: [scalar('out', 'output')] } },
      ],
      edges: [
        { id: 'inport_sum', sourceNodeId: 'inport', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'a' },
        { id: 'constant_sum', sourceNodeId: 'constant', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'b' },
        { id: 'sum_outport', sourceNodeId: 'sum', sourcePortId: 'y', targetNodeId: 'outport', targetPortId: 'u' },
      ],
      mappings: [
        { smVarId: 'x', blockId: 'inport', portId: 'in', direction: 'in' },
        { smVarId: 'x', blockId: 'outport', portId: 'out', direction: 'out' },
      ],
      solver: { kind: 'euler', stepSeconds: 0.002 },
      policy: { memory: 'reset', numericFault: 'signal-only' },
    };
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: [{ kind: 'step' as const }],
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);

    expect(expected.at(-1)?.data.x).toBe(2);
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('T10-INT-FILTERS and T10-C99-FILTERS preserve LOW_PASS_FILTER, HIGH_PASS_FILTER, and MOVING_AVERAGE semantics across constant, step, sine, and reset sequences', () => {
    setXBConformanceStatus('T10-PAIRED-FILTERS', 'PASS');
    const fixture = XB_EXECUTABLE_C_CASES['T10-C99-FILTERS'].fixture;
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);

    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('REQ-B5C-008 / REQ-B5C-009 / REQ-B5C-013 / REQ-B5C-014 generates differential trace and verifies <= 1e-4 max error and 10 substeps scheduling', () => {
    setXBConformanceStatus('T10-PAIRED-FILTERS', 'PASS');
    const fixture = XB_EXECUTABLE_C_CASES['T10-C99-FILTERS'].fixture;
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);

    expect(expected.length).toBeGreaterThan(0);
    expect(actual.length).toEqual(expected.length);

    interface DifferentialTraceEntry {
      sampleIndex: number;
      timeSeconds: number;
      input: number;
      interpreterLpf: number;
      generatedCLpf: number;
      lpfError: number;
      interpreterHpf: number;
      generatedCHpf: number;
      hpfError: number;
      interpreterMa: number;
      generatedCMa: number;
      maError: number;
      status: 'PASS' | 'FAIL';
    }

    const differentialTrace: DifferentialTraceEntry[] = [];

    for (let i = 0; i < expected.length; i++) {
      const expFrame = expected[i]!;
      const actFrame = actual[i]!;

      const u = Number(expFrame.data.u ?? 0);
      const expSignals = expFrame.xBridges.controller?.signals ?? {};
      const actSignals = actFrame.xBridges.controller?.signals ?? {};

      const expLpf = Number(expSignals['lpf1:y'] ?? 0);
      const actLpf = Number(actSignals['lpf1:y'] ?? 0);
      const lpfErr = Math.abs(expLpf - actLpf);

      const expHpf = Number(expSignals['hpf1:y'] ?? 0);
      const actHpf = Number(actSignals['hpf1:y'] ?? 0);
      const hpfErr = Math.abs(expHpf - actHpf);

      const expMa = Number(expSignals['ma1:y'] ?? 0);
      const actMa = Number(actSignals['ma1:y'] ?? 0);
      const maErr = Math.abs(expMa - actMa);

      const pass = lpfErr <= 1e-4 && hpfErr <= 1e-4 && maErr <= 1e-4;

      differentialTrace.push({
        sampleIndex: i,
        timeSeconds: i * 0.01,
        input: u,
        interpreterLpf: expLpf,
        generatedCLpf: actLpf,
        lpfError: lpfErr,
        interpreterHpf: expHpf,
        generatedCHpf: actHpf,
        hpfError: hpfErr,
        interpreterMa: expMa,
        generatedCMa: actMa,
        maError: maErr,
        status: pass ? 'PASS' : 'FAIL',
      });

      expect(lpfErr, `LOW_PASS_FILTER sample ${i} abs error`).toBeLessThanOrEqual(1e-4);
      expect(hpfErr, `HIGH_PASS_FILTER sample ${i} abs error`).toBeLessThanOrEqual(1e-4);
      expect(maErr, `MOVING_AVERAGE sample ${i} abs error`).toBeLessThanOrEqual(1e-4);
    }

    // Verify sample-time holding: filter outputs should only change every 10 substeps (0.1s / 0.01s)
    // Between step 1 and 9 (inclusive), outputs should be held constant
    for (let substep = 1; substep < 9; substep++) {
      expect(differentialTrace[substep]!.generatedCLpf).toBe(differentialTrace[0]!.generatedCLpf);
      expect(differentialTrace[substep]!.generatedCHpf).toBe(differentialTrace[0]!.generatedCHpf);
      expect(differentialTrace[substep]!.generatedCMa).toBe(differentialTrace[0]!.generatedCMa);
    }
  }, 60_000);

  it('T14-INT-SHAPED-CONSTANT and T14-C99-SHAPED-CONSTANT round-trip vector and matrix constants through compiled C', () => {
    const fixture = {
      name: 'flat-priority' as const,
      model: shapedTraceFixture(),
      steps: [{ kind: 'step' as const }],
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);

    expect(actual.at(-1)?.xBridges.controller.signals).toMatchObject({
      'matrix:y': [[1, 2], [3, 4]],
      'vector:y': [1.25, -2.5],
    });
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('uses collision-safe C fields and lexicographic canonical ordering', () => {
    const fixture = {
      name: 'parallel-independent' as const,
      model: collisionAndOrderingFixture(),
      steps: [{ kind: 'step' as const }],
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);
    const frame = actual.at(-1)!;

    expect(Object.keys(frame.xBridges)).toEqual(['a-controller', 'z-controller']);
    expect(Object.keys(frame.xBridges['z-controller'].signals)).toEqual(
      [...Object.keys(frame.xBridges['z-controller'].signals)].sort(),
    );
    expect(Object.keys(frame.xBridges['z-controller'].blockState)).toEqual([
      'a_delay', 'z-delay', 'z_delay',
    ]);
    expect(frame.xBridgesFaults).toHaveProperty('z-controller/z-delay');
    expect(frame.xBridgesFaults).toHaveProperty('z-controller/z_delay');
    expect(frame.xBridgesFaults).toHaveProperty('a-controller/only-source');
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('captures deterministic X-Bridges values and state in both traces', () => {
    const model = statefulOverflowFixture('signal-only');
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: [{ kind: 'step' as const }],
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);

    expect(expected.at(-1)?.xBridges.controller).toEqual(
      expect.objectContaining({
        signals: expect.objectContaining({ 'delay:y': 7 }),
        blockState: { delay: { y: 7 } },
        faults: ['delay'],
      }),
    );
    expect(actual.at(-1)?.xBridges).toEqual(expected.at(-1)?.xBridges);
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it.each(fixtureMatrix)(
    '%s matches generated C tick by tick',
    (fixtureName) => {
      const fixture = semanticFixture(fixtureName);
      const expected = runInterpreterTrace(fixture);
      const actual = compileAndRunCTrace(fixture);
      const difference = compareSemanticTraces(expected, actual);

      expect(
        difference,
        difference === null
          ? undefined
          : `first semantic difference at frame ${difference.index}\n`
            + `expected: ${JSON.stringify(difference.expected)}\n`
            + `actual:   ${JSON.stringify(difference.actual)}`,
      ).toBeNull();
    },
    60_000,
  );

  it('uses a distinct inner transition whose destination is history', () => {
    const inner = semanticFixture('inner-history');
    const shallow = semanticFixture('shallow-history');
    const built = buildSemanticModel(inner.model);
    if (!built.ir) throw new Error('inner-history fixture must build');

    expect(inner).not.toEqual(shallow);
    expect(built.ir.transitions.inner_restore_history).toMatchObject({
      kind: 'inner',
      routes: [
        expect.objectContaining({
          destinationKind: 'history',
          destinationJunctionId: 'shallow_history',
        }),
      ],
    });
    const frames = runInterpreterTrace(inner);
    expect(frames.at(-1)?.activeStateIds).toContain('parent_b');
    expect(frames.at(-1)?.activeStateIds).not.toContain('parent_a');
  });

  it('round-trips legal delimiter characters in trace-owned model ids', () => {
    const model = flatOrFixture();
    model.states[0].id = 'a,|;:%';
    model.transitions[0].sourceId = 'a,|;:%';
    model.transitions[0].id = 't,|;:%';
    model.layers[0].stateIds[0] = 'a,|;:%';
    model.layers[0].transitionIds = ['t,|;:%'];
    model.variables[0].id = 'go,|;:%';
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: [{ kind: 'step' as const, inputs: { go: true } }],
    };

    expect(
      compareSemanticTraces(
        runInterpreterTrace(fixture),
        compileAndRunCTrace(fixture),
      ),
    ).toBeNull();
  }, 60_000);

  it('observes reset output commitment and watchdog effects', () => {
    const fixture = semanticFixture('reset');
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);
    const resetFrame = expected.at(-1) as SemanticTraceFrame & {
      mappedOutputs?: Record<string, number | boolean>;
      ioEffects?: { safeOutputsApplied: number; watchdogKicks: number };
    };

    expect(fixture.model.hilConfig?.mappings).toEqual([
      expect.objectContaining({
        direction: 'write',
        safeValue: false,
      }),
    ]);
    expect(resetFrame.mappedOutputs).toEqual({ motor: false });
    expect(resetFrame.ioEffects).toEqual({
      safeOutputsApplied: 0,
      watchdogKicks: 1,
    });
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('observes immediate safe output without a watchdog kick on fault', () => {
    const fixture = semanticFixture('safe-output-fault');
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);
    const faultFrame = expected.at(-1) as SemanticTraceFrame & {
      mappedOutputs?: Record<string, number | boolean>;
      ioEffects?: { safeOutputsApplied: number; watchdogKicks: number };
    };

    expect(faultFrame.mappedOutputs).toEqual({ motor: false });
    expect(faultFrame.ioEffects).toEqual({
      safeOutputsApplied: 1,
      watchdogKicks: 0,
    });
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('does not truncate action traces for large legal parallel charts', () => {
    const model = flatOrFixture();
    const template = model.states[0];
    model.states = Array.from({ length: 140 }, (_, index) => ({
      ...template,
      id: `parallel_${index}`,
      name: `Parallel ${index}`,
      entry: '',
      during: 'total = total + 1;',
      autostart: false,
      priority: index + 1,
    }));
    model.transitions = [];
    model.layers = [{
      ...model.layers[0],
      decomposition: 'AND',
      stateIds: model.states.map((state) => state.id),
      transitionIds: [],
    }];
    const fixture = {
      name: 'parallel-independent' as const,
      model,
      steps: [{ kind: 'step' as const }],
    };
    const expected = runInterpreterTrace(fixture);

    expect(expected[1].actions).toHaveLength(140);
    expect(
      compareSemanticTraces(expected, compileAndRunCTrace(fixture)),
    ).toBeNull();
  }, 60_000);

  it('coerces numeric stimuli to the declared C integer type', () => {
    const model = flatOrFixture();
    model.variables.push({
      id: 'sample',
      name: 'sample',
      type: 'uint8',
      initialValue: '0',
      currentValue: 0,
      visibleInScope: true,
    });
    model.states[0].during = 'total = sample;';
    model.transitions = [];
    model.layers[0].transitionIds = [];
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: [{ kind: 'step' as const, inputs: { sample: 258.75 } }],
    };
    const expected = runInterpreterTrace(fixture);

    expect(expected.at(-1)?.data.sample).toBe(2);
    expect(
      compareSemanticTraces(expected, compileAndRunCTrace(fixture)),
    ).toBeNull();
  }, 60_000);

  it('commits a mapped X-Bridges output before an inner transition in the same tick', () => {
    const model = hybridXBridgesFixture();
    const ordinary = model.states.find((state) => state.id === 'ordinary')!;
    const controller = model.states.find((state) => state.id === 'controller')!;
    ordinary.autostart = false;
    controller.autostart = true;
    controller.during = 'u = 2;';
    controller.internalTransitions = '[y > 3] / u = u;';
    controller.xBridgesModel = {
      schemaVersion: 1,
      nodes: [{
        id: 'gain',
        type: 'GAIN',
        parameters: {
          inputs: [{
            id: 'u',
            direction: 'input',
            shape: 'scalar',
            dataType: 'float32',
          }],
          outputs: [{
            id: 'y',
            direction: 'output',
            shape: 'scalar',
            dataType: 'float32',
          }],
          gain: 2,
        },
      }],
      edges: [],
      mappings: [
        { smVarId: 'u', blockId: 'gain', portId: 'u', direction: 'in' },
        { smVarId: 'y', blockId: 'gain', portId: 'y', direction: 'out' },
      ],
      solver: { kind: 'euler', stepSeconds: 0.002 },
      policy: { memory: 'reset', numericFault: 'escalate' },
    };
    for (const id of ['u', 'y']) {
      model.variables.push({
        id,
        name: id,
        type: 'float',
        initialValue: '0',
        currentValue: 0,
        visibleInScope: true,
      });
    }
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: [{ kind: 'step' as const }],
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);

    expect(expected.at(-1)?.data.y).toBe(4);
    expect(expected.at(-1)?.actions).toContain(
      'transition:$internal_controller_0',
    );
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('compiles and executes DELAY(N=2) circular buffer state trace identically to the interpreter', () => {
    const float32 = { kind: 'float32' } as const;
    const model = flatOrFixture();
    const stateA = model.states.find((s) => s.id === 'a')!;
    stateA.xBridgesModel = {
      executionOrder: ['delay1'],
      operations: [
        {
          id: 'delay1',
          type: 'DELAY',
          inputs: [{ portId: 'u', signalId: 'delay1:u' }],
          outputs: [{ portId: 'y', signalId: 'delay1:y' }],
          parameters: { delay_length: 2, initial_condition: -1, sample_time: 0.01 },
        },
      ],
      signals: [
        { id: 'delay1:u', portId: 'u', direction: 'input', numericType: float32, shape: { kind: 'scalar' } },
        { id: 'delay1:y', portId: 'y', direction: 'output', numericType: float32, shape: { kind: 'scalar' } },
      ],
      solver: { kind: 'euler', stepSeconds: 0.01 },
      policy: { memory: 'reset', numericFault: 'escalate' },
    } as any;
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: [
        { kind: 'step' as const },
        { kind: 'step' as const },
        { kind: 'step' as const },
        { kind: 'step' as const },
      ],
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);

  it('verifies DELAY output over multiple cycles and Discrete Integrator 100ms sample timing', () => {
    const float32 = { kind: 'float32' } as const;
    const model = flatOrFixture();
    const stateA = model.states.find((s) => s.id === 'a')!;
    stateA.xBridgesModel = {
      executionOrder: ['XB8_Delay', 'XB8_Discrete'],
      operations: [
        {
          id: 'XB8_Delay',
          type: 'DELAY',
          inputs: [{ portId: 'u', signalId: 'u' }],
          outputs: [{ portId: 'y', signalId: 'XB8_Delay_y' }],
          parameters: { delay_length: 2, initial_condition: -1, sample_time: 0.1 },
        },
        {
          id: 'XB8_Discrete',
          type: 'INTEGRATOR_DISCRETE',
          inputs: [{ portId: 'u', signalId: 'u' }],
          outputs: [{ portId: 'y', signalId: 'XB8_Discrete_y' }],
          parameters: { sample_time: 0.1, initial_condition: 1, method: 'forward_euler' },
        },
      ],
      signals: [
        { id: 'u', portId: 'u', direction: 'input', numericType: float32, shape: { kind: 'scalar' } },
        { id: 'XB8_Delay_y', portId: 'y', direction: 'output', numericType: float32, shape: { kind: 'scalar' } },
        { id: 'XB8_Discrete_y', portId: 'y', direction: 'output', numericType: float32, shape: { kind: 'scalar' } },
      ],
      solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 10 },
      policy: { memory: 'reset', numericFault: 'escalate' },
    } as any;
    const fixture = {
      name: 'flat-priority' as const,
      model,
      steps: Array.from({ length: 20 }, () => ({ kind: 'step' as const })),
    };
    const expected = runInterpreterTrace(fixture);
    const actual = compileAndRunCTrace(fixture);
    expect(compareSemanticTraces(expected, actual)).toBeNull();
  }, 60_000);
});


