import { describe, expect, it } from 'vitest';
import type { SemanticVariable } from './smSemanticModel';
import { DEFAULT_XB_EMBEDDED_LIMITS } from './xbEmbeddedProfile';
import type {
  XBNodeV1,
  XBParameterValue,
  XBPersistedModelV1,
  XBTargetCapabilities,
} from './xbModel';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { buildXBSemanticModel } from './xbSemanticBuilder';

const target: XBTargetCapabilities = {
  supportsFloat16: false,
  supportsFloat32: true,
  supportsFloat64: true,
  supportsMathLibrary: true,
  maxVectorLength: 16,
  maxMatrixDimension: 8,
  embeddedLimits: DEFAULT_XB_EMBEDDED_LIMITS,
};

const variables: Readonly<Record<string, SemanticVariable>> = {
  command: {
    id: 'command',
    name: 'command',
    cName: 'command',
    type: 'float',
    initialValue: 0,
  },
};

const port = (
  id: string,
  direction: 'input' | 'output',
  extra: Record<string, XBParameterValue> = {},
) => ({
  id,
  direction,
  shape: 'scalar',
  dataType: 'float32',
  ...extra,
});

const node = (
  id: string,
  type: string,
  inputs: readonly ReturnType<typeof port>[],
  outputs: readonly ReturnType<typeof port>[],
  parameters: Record<string, XBParameterValue> = {},
): XBNodeV1 => ({
  id,
  type,
  parameters: {
    inputs,
    outputs,
    ...parameters,
  },
});

const edge = (
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
) => ({
  id,
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  targetPortId,
});

const model = (
  overrides: Partial<XBPersistedModelV1> = {},
): XBPersistedModelV1 => ({
  schemaVersion: 1,
  nodes: [],
  edges: [],
  mappings: [],
  solver: { kind: 'euler', stepSeconds: 0.002 },
  policy: { memory: 'reset', numericFault: 'escalate' },
  ...overrides,
});

const build = (
  xbModel: XBPersistedModelV1,
  baseTickMs = 10,
) => buildXBSemanticModel({
  stateId: 'controller',
  model: xbModel,
  variables,
  target,
  baseTickMs,
});

describe('buildXBSemanticModel', () => {
  it('resolves XBridge mappings and attaches ownerState symbol context', () => {
    const m = model({
      nodes: [
        node('const1', 'Constant', [], [port('out', 'output')], { value: 5.0 }),
        node('out1', 'Outport', [port('in', 'input')], [], { smVarId: 'xb_output' }),
      ],
      edges: [edge('e1', 'const1', 'out', 'out1', 'in')],
      mappings: [{ smVarId: 'xb_output', blockId: 'out1', portId: 'in', direction: 'out' }],
    });

    const ownerState = {
      stateId: 'state_1fc92e',
      stateName: 'State_6_copy',
      cIndexSymbol: 'SM_ST__1FC92E02_C821_43E6_9B89_2F938DB7945D_IDX',
      numericIndex: 2,
    };

    const varSymbols = new Map([
      ['xb_output', {
        id: 'cc53310b-344b-4df9-84f3-6068138c22aa',
        modelName: 'xb_output',
        cIdentifier: 'xb_output',
        semanticType: 'float64' as const,
        cType: 'double',
      }],
    ]);

    const result = buildXBSemanticModel({
      stateId: 'state_1fc92e',
      ownerState,
      variableSymbols: varSymbols,
      model: m,
      variables,
      target,
      baseTickMs: 100,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.ir).toBeDefined();
    expect(result.ir!.ownerState).toEqual(ownerState);
    expect(result.ir!.mappings).toHaveLength(1);
    expect(result.ir!.mappings[0].sourceVariableId).toBe('xb_output');
  });

  it('infers vector shape length 4 from Constant Value parameter [-2, 4, 1, 7] and propagates shape to SumElements', () => {
    const m = model({
      nodes: [
        node('c1', 'Constant', [], [port('out', 'output')], { Value: [-2, 4, 1, 7] }),
        node('sum1', 'SumElements', [port('in', 'input')], [port('out', 'output')]),
      ],
      edges: [edge('e1', 'c1', 'out', 'sum1', 'in')],
      mappings: [],
    });

    const result = buildXBSemanticModel({
      stateId: 'state_test',
      ownerState: { stateId: 'state_test', stateName: 'State_Test', cIndexSymbol: 'ST_IDX', numericIndex: 1 },
      variableSymbols: new Map(),
      model: m,
      variables,
      target,
      baseTickMs: 100,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.ir).toBeDefined();
    const sem = result.ir!;
    expect(sem.signals['c1:out']?.shape).toEqual({ kind: 'vector', length: 4 });
    expect(sem.signals['sum1:in']?.shape).toEqual({ kind: 'vector', length: 4 });
    expect(sem.signals['sum1:out']?.shape).toEqual({ kind: 'scalar' });
  });

  it('does not invent an Outport mapping for an unknown state-machine variable', () => {
    const m = model({
      nodes: [
        node('const1', 'Constant', [], [port('out', 'output')], { value: 5.0 }),
        node('out1', 'Outport', [port('in', 'input')], [], { smVarId: 'missing' }),
      ],
      edges: [edge('e1', 'const1', 'out', 'out1', 'in')],
    });

    const result = build(m);

    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.mappings).toEqual([]);
  });

  it('lowers Step parameters into pre-aligned threshold milliseconds and state timer source', () => {
    const m = model({
      nodes: [
        node('step1', 'Step', [], [port('out', 'output')], {
          step_time: 0.3,
          initial_value: 0,
          final_value: 5,
        }),
      ],
    });

    const ownerState = {
      stateId: 'state_6_copy',
      stateName: 'State_6_copy',
      cIndexSymbol: 'SM_ST__1FC92E02_C821_43E6_9B89_2F938DB7945D_IDX',
      numericIndex: 1,
    };

    const result = buildXBSemanticModel({
      stateId: 'state_6_copy',
      ownerState,
      model: m,
      variables,
      target,
      baseTickMs: 100,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.ir).toBeDefined();
    const stepOp = result.ir!.operations['step1'];
    expect(stepOp).toBeDefined();
    expect(stepOp.stepParameters).toEqual({
      initialValue: 0,
      finalValue: 5,
      threshold: { milliseconds: 300, alignment: 'ceil-to-tick' },
      timerSource: {
        kind: 'stateElapsedTime',
        stateId: 'state_6_copy',
        stateIndexSymbol: 'SM_ST__1FC92E02_C821_43E6_9B89_2F938DB7945D_IDX',
      },
    });
  });




  it('declares a numeric fault fallback and optional error signal for every operation', () => {
    const result = build(model({
      nodes: [
        node('gain', 'GAIN', [port('u', 'input')], [
          port('y', 'output'),
          port('error', 'output', { dataType: 'boolean' }),
        ]),
        node('delay', 'UNIT_DELAY', [port('u', 'input')], [port('y', 'output')]),
      ],
      edges: [edge('gain-to-delay', 'gain', 'y', 'delay', 'u')],
      mappings: [{
        smVarId: 'command', blockId: 'gain', portId: 'u', direction: 'in',
      }],
    }));

    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.operations.gain.numericFault).toEqual({
      fallback: 'zero', errorSignalId: 'gain:error',
    });
    expect(result.ir!.operations.delay.numericFault).toEqual({
      fallback: 'previous-value', errorSignalId: null,
    });
  });

  it('keeps public PID and discrete-transfer-function state separate from outputs', () => {
    const pid = BLOCK_LIBRARY.PID_BASIC('pid', {
      Kp: 2,
      Ki: 3,
      Kd: 4,
      N: 5,
      sampleTime: 0.1,
    });
    const transfer = BLOCK_LIBRARY.DISCRETE_TRANSFER_FUNCTION('transfer', {
      numerator: [1],
      denominator: [1, 3, 2],
      sampleTime: 0.1,
      x0: [7, 11],
    });
    const publicPorts = (block: typeof pid, shapes: Record<string, XBParameterValue>) => ({
      id: block.id,
      type: block.type,
      parameters: {
        ...block.params,
        inputs: block.inputs.map((publicPort) => ({
          id: publicPort.id,
          direction: publicPort.direction,
          shape: shapes[`in:${publicPort.id}`] ?? 'scalar',
          dimensions: shapes[`in:${publicPort.id}:dimensions`] ?? [],
          dataType: 'float32',
        })),
        outputs: block.outputs.map((publicPort) => ({
          id: publicPort.id,
          direction: publicPort.direction,
          shape: shapes[`out:${publicPort.id}`] ?? 'scalar',
          dimensions: shapes[`out:${publicPort.id}:dimensions`] ?? [],
          dataType: 'float32',
        })),
      },
    } satisfies XBNodeV1);
    const result = build(model({
      nodes: [
        publicPorts(pid, {}),
        publicPorts(transfer, {
          'in:u': 'vector', 'in:u:dimensions': [1],
          'out:y': 'vector', 'out:y:dimensions': [1],
          'out:x': 'vector', 'out:x:dimensions': [2],
        }),
      ],
    }));

    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.operations.pid.state?.slots).toMatchObject([
      { id: 'pid:i_state$state', role: 'i_state', signalId: null },
      { id: 'pid:d_state$state', role: 'd_state', signalId: null },
      { id: 'pid:last_e$state', role: 'last_e', signalId: null },
    ]);
    expect(result.ir?.operations.transfer.state?.slots).toMatchObject([
      {
        id: 'transfer:x$state',
        role: 'x',
        signalId: 'transfer:x',
        initialValues: [7, 11],
      },
    ]);
    expect(result.ir?.operations.transfer.state?.slots).toHaveLength(1);
    expect(result.ir?.operations.transfer.state?.slots.some((slot) =>
      slot.signalId === 'transfer:y')).toBe(false);
  });

  it('orders operations by dependencies and stable node IDs and propagates conversion types', () => {
    const xbModel = model({
      nodes: [
        node('out', 'Outport', [port('u', 'input')], []),
        node(
          'quantize',
          'NUMERIC_REPRESENTATION',
          [port('u', 'input')],
          [port('y', 'output')],
          {
            outputType: {
              kind: 'fixed',
              signed: true,
              wordLength: 16,
              fractionLength: 8,
            },
            rounding: 'simplest',
            overflow: 'wrap',
          },
        ),
        node('gain', 'GAIN', [port('u', 'input')], [port('y', 'output')]),
        node('constant', 'Constant', [], [port('y', 'output')], { value: 2 }),
      ],
      edges: [
        edge('gain-to-quantize', 'gain', 'y', 'quantize', 'u'),
        edge('quantize-to-out', 'quantize', 'y', 'out', 'u'),
        edge('constant-to-gain', 'constant', 'y', 'gain', 'u'),
      ],
    });

    const result = build(xbModel);
    expect(result.diagnostics).toEqual([]);
    const ir = result.ir!;

    expect(ir.executionOrder).toEqual(['constant', 'gain', 'quantize', 'out']);
    expect(ir.signals['quantize:y'].numericType).toEqual({
      kind: 'fixed',
      signed: true,
      wordLength: 16,
      fractionLength: 8,
    });
    expect(ir.signals['quantize:y'].storage).toBe('stored-integer');
    expect(ir.operations.quantize.conversion).toEqual({
      destinationType: {
        kind: 'fixed',
        signed: true,
        wordLength: 16,
        fractionLength: 8,
      },
      rounding: 'floor',
      overflow: 'wrap',
      mode: 'real-world-value',
    });
    expect(Object.isFrozen(ir)).toBe(true);
    expect(Object.isFrozen(ir.operations.quantize.parameters)).toBe(true);
  });

  it('applies conversion typing only to the designated data output', () => {
    const xbModel = model({
      nodes: [
        node(
          'quantize',
          'NUMERIC_REPRESENTATION',
          [port('u', 'input')],
          [
            port('y', 'output', { dataType: 'float32' }),
            port('e', 'output', { dataType: 'float32' }),
          ],
          {
            outputType: {
              kind: 'fixed',
              signed: true,
              wordLength: 16,
              fractionLength: 8,
            },
            rounding: 'floor',
            overflow: 'saturate',
          },
        ),
      ],
    });

    const signals = build(xbModel).ir!.signals;
    expect(signals['quantize:y'].numericType.kind).toBe('fixed');
    expect(signals['quantize:e'].numericType).toEqual({ kind: 'float32' });
  });

  it('breaks ready-node ties by stable ID regardless of persisted order', () => {
    const nodes = [
      node('z-source', 'Constant', [], [port('y', 'output')]),
      node('a-source', 'Constant', [], [port('y', 'output')]),
      node('m-source', 'Constant', [], [port('y', 'output')]),
    ];

    expect(build(model({ nodes })).ir?.executionOrder).toEqual([
      'a-source',
      'm-source',
      'z-source',
    ]);
    expect(build(model({ nodes: [...nodes].reverse() })).ir?.executionOrder).toEqual([
      'a-source',
      'm-source',
      'z-source',
    ]);
  });

  it('preserves fixed row-major matrix signal metadata', () => {
    const fixedMatrix = {
      kind: 'fixed',
      signed: false,
      wordLength: 12,
      fractionLength: 3,
    } as const;
    const xbModel = model({
      nodes: [
        node('matrix', 'Constant', [], [
          port('y', 'output', {
            shape: 'matrix',
            dimensions: [2, 3],
            numericType: fixedMatrix,
          }),
        ]),
      ],
    });

    const signal = build(xbModel).ir!.signals['matrix:y'];
    expect(signal.shape).toEqual({ kind: 'matrix', rows: 2, columns: 3 });
    expect(signal.dimensions).toEqual([2, 3]);
    expect(signal.elementCount).toBe(6);
    expect(signal.layout).toBe('row-major');
    expect(signal.numericType).toEqual(fixedMatrix);
    expect(signal.storage).toBe('stored-integer');
  });

  it('canonicalizes omitted port shape as scalar instead of propagating input shape', () => {
    const omittedShapeOutput = {
      id: 'y',
      direction: 'output',
      dataType: 'float32',
    } as ReturnType<typeof port>;
    const vector = {
      shape: 'vector',
      dimensions: [3],
    } as const;
    const xbModel = model({
      nodes: [
        node('source', 'Constant', [], [port('y', 'output', vector)]),
        node(
          'gain',
          'GAIN',
          [port('u', 'input', vector)],
          [omittedShapeOutput],
        ),
      ],
      edges: [edge('source-to-gain', 'source', 'y', 'gain', 'u')],
    });

    expect(build(xbModel).ir?.signals['gain:y'].shape).toEqual({
      kind: 'scalar',
    });
  });

  it('accepts feedback across a stateful output boundary', () => {
    const xbModel = model({
      nodes: [
        node('gain', 'GAIN', [port('u', 'input')], [port('y', 'output')]),
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input')],
          [port('y', 'output')],
          { sampleTime: 0.01, initialValue: 0 },
        ),
      ],
      edges: [
        edge('delay-to-gain', 'delay', 'y', 'gain', 'u'),
        edge('gain-to-delay', 'gain', 'y', 'delay', 'u'),
      ],
    });

    const result = build(xbModel);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.executionOrder).toEqual(['delay', 'gain']);
    expect(result.ir?.operations.delay.stateful).toBe(true);
    expect(result.ir?.operations.delay.state).toEqual({
      outputPhase: 'read-before-update',
      updatePhase: 'after-direct-feedthrough',
      slots: [{
        id: 'delay:y$state',
        role: 'y',
        signalId: 'delay:y',
        numericType: { kind: 'float32' },
        shape: { kind: 'scalar' },
        initialValues: [0],
        storageCategory: 'scalar',
      }],
    });
  });

  it('T14-INT-DISCONTINUOUS adds Semantic State Slots for Stateful Blocks (RateLimiter and Relay)', () => {
    const xbModel = model({
      nodes: [
        node('rl', 'RATE_LIMITER', [port('u', 'input')], [port('y', 'output')], { risingLimit: 2, fallingLimit: 3, initialCondition: 5, sampleTime: 0.1 }),
        node('sat', 'SATURATION', [port('u', 'input')], [port('y', 'output')], { lower: -3, upper: 3 }),
        node('dz', 'DEADZONE', [port('u', 'input')], [port('y', 'output')], { start: 0.8, end: -0.8 }),
        node('relay', 'RELAY', [port('u', 'input')], [port('y', 'output', { dataType: 'boolean' })], { initialState: false }),
      ],
      edges: [],
    });

    const result = build(xbModel);
    expect(result.diagnostics).toEqual([]);

    const rlOp = result.ir?.operations.rl;
    expect(rlOp?.parameters.risingSlewRate).toBe(2);
    expect(rlOp?.parameters.fallingSlewRate).toBe(-3);
    expect(rlOp?.parameters.initialCondition).toBe(5);

    const rlState = rlOp?.state;
    expect(rlState).toBeDefined();
    expect(rlState?.slots).toEqual([{
      id: 'rl:previousOutput$state',
      role: 'previousOutput',
      signalId: null,
      numericType: { kind: 'float32' },
      shape: { kind: 'scalar' },
      initialValues: [5],
    }]);

    const satOp = result.ir?.operations.sat;
    expect(satOp?.parameters.lowerLimit).toBe(-3);
    expect(satOp?.parameters.upperLimit).toBe(3);

    const dzOp = result.ir?.operations.dz;
    expect(dzOp?.parameters.lowerLimit).toBe(-0.8);
    expect(dzOp?.parameters.upperLimit).toBe(0.8);

    const relayState = result.ir?.operations.relay.state;
    expect(relayState).toBeDefined();
    expect(relayState?.slots).toEqual([{
      id: 'relay:current_on$state',
      role: 'current_on',
      signalId: 'relay:y',
      numericType: { kind: 'boolean' },
      shape: { kind: 'scalar' },
      initialValues: [false],
    }]);
  });

  it('rejects a pure direct-feedthrough algebraic loop', () => {
    const xbModel = model({
      nodes: [
        node('b', 'GAIN', [port('u', 'input')], [port('y', 'output')]),
        node('a', 'GAIN', [port('u', 'input')], [port('y', 'output')]),
      ],
      edges: [
        edge('a-to-b', 'a', 'y', 'b', 'u'),
        edge('b-to-a', 'b', 'y', 'a', 'u'),
      ],
    });

    const result = build(xbModel);
    expect(result.ir).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'XB_ALGEBRAIC_LOOP_UNSUPPORTED',
        severity: 'error',
      }),
    ]);
  });

  it('rejects multiply-driven shaped inputs independent of edge order', () => {
    const vectorPort = (
      id: string,
      direction: 'input' | 'output',
    ) => port(id, direction, {
      shape: 'vector',
      dimensions: [2],
    });
    const nodes = [
      node('a', 'Constant', [], [vectorPort('y', 'output')]),
      node('b', 'Constant', [], [vectorPort('y', 'output')]),
      node('sum', 'VectorAdd', [vectorPort('u', 'input')], [
        vectorPort('y', 'output'),
      ]),
    ];
    const edges = [
      edge('a-to-sum', 'a', 'y', 'sum', 'u'),
      edge('b-to-sum', 'b', 'y', 'sum', 'u'),
    ];

    for (const candidateEdges of [edges, [...edges].reverse()]) {
      const result = build(model({ nodes, edges: candidateEdges }));
      expect(result.ir).toBeUndefined();
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'XB_PORT_DANGLING',
          elementId: 'sum',
        }),
      ]);
    }
  });

  it.each([
    ['euler' as const, 5],
    ['rk4' as const, 5],
  ])('builds an exact integer %s solver schedule', (kind, substepsPerTick) => {
    const xbModel = model({
      solver: { kind, stepSeconds: 0.002 },
      nodes: [
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input')],
          [port('y', 'output')],
          { sampleTime: 0.02 },
        ),
      ],
      mappings: [{
        smVarId: 'command',
        blockId: 'delay',
        portId: 'u',
        direction: 'in',
      }],
    });

    const ir = build(xbModel).ir!;
    expect(ir.solver).toEqual({
      kind,
      stepSeconds: 0.002,
      substepsPerTick,
    });
    expect(ir.operations.delay.schedule).toEqual({
      periodSubsteps: 10,
      offsetSubsteps: 0,
      initialCounter: 0,
      counterIncrement: 1,
      hold: 'zero-order',
    });
    expect(Object.values(ir.operations.delay.schedule).filter(
      (value) => typeof value === 'number',
    ).every(Number.isInteger)).toBe(true);
  });

  it('interprets port sampleRate metadata as hertz', () => {
    const xbModel = model({
      nodes: [
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input', { sampleRate: 100 })],
          [port('y', 'output')],
        ),
      ],
    });

    expect(build(xbModel).ir?.operations.delay.schedule.periodSubsteps).toBe(5);
  });

  it('rejects a later non-divisible timing annotation', () => {
    const xbModel = model({
      nodes: [
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input', { sampleRate: 3 })],
          [port('y', 'output')],
          { sampleTime: 0.01 },
        ),
      ],
    });

    const result = build(xbModel);
    expect(result.ir).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain(
      'XB_SAMPLE_TIME_INVALID',
    );
  });

  it('rejects conflicting valid timing annotations', () => {
    const xbModel = model({
      nodes: [
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input', { sampleRate: 50 })],
          [port('y', 'output')],
          { sampleTime: 0.01 },
        ),
      ],
    });

    const result = build(xbModel);
    expect(result.ir).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain(
      'XB_SAMPLE_TIME_INVALID',
    );
  });

  it('accepts consistent duplicate timing annotations', () => {
    const xbModel = model({
      nodes: [
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input', { sampleRate: 100 })],
          [port('y', 'output')],
          { sampleTime: 0.01 },
        ),
      ],
    });

    const result = build(xbModel);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.operations.delay.schedule.periodSubsteps).toBe(5);
  });

  it('rejects any invalid timing annotation after a valid one', () => {
    const xbModel = model({
      nodes: [
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input', { sampleRate: 0 })],
          [port('y', 'output')],
          { sampleTime: 0.01 },
        ),
      ],
    });

    const result = build(xbModel);
    expect(result.ir).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain(
      'XB_SAMPLE_TIME_INVALID',
    );
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid port sampleRate %s',
    (sampleRate) => {
      const xbModel = model({
        nodes: [
          node(
            'delay',
            'UNIT_DELAY',
            [port('u', 'input', { sampleRate })],
            [port('y', 'output')],
          ),
        ],
      });

      const result = build(xbModel);
      expect(result.ir).toBeUndefined();
      expect(result.diagnostics.map((item) => item.code)).toContain(
        'XB_SAMPLE_TIME_INVALID',
      );
    },
  );

  it('uses documented conversion defaults when policy fields are omitted', () => {
    const xbModel = model({
      nodes: [
        node(
          'convert',
          'DATA_TYPE_CONVERSION',
          [port('u', 'input')],
          [port('y', 'output')],
          { output_type: 'int16' },
        ),
      ],
    });

    expect(build(xbModel).ir?.operations.convert.conversion).toEqual({
      destinationType: {
        kind: 'fixed',
        signed: true,
        wordLength: 16,
        fractionLength: 0,
      },
      rounding: 'floor',
      overflow: 'saturate',
      mode: 'real-world-value',
    });
  });

  it.each([
    ['rounding', 'sideway'],
    ['rounding', null],
    ['overflow', 'clip'],
    ['overflow', null],
  ] as const)('rejects unknown explicit conversion %s', (key, value) => {
    const xbModel = model({
      nodes: [
        node(
          'convert',
          'DATA_TYPE_CONVERSION',
          [port('u', 'input')],
          [port('y', 'output')],
          {
            output_type: 'int16',
            [key]: value,
          },
        ),
      ],
    });

    const result = build(xbModel);
    expect(result.ir).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'XB_CONVERSION_POLICY_INVALID',
        elementId: 'convert',
      }),
    ]);
  });

  it.each([
    ['DATA_TYPE_CONVERSION', undefined],
    ['DATA_TYPE_CONVERSION', 'float128'],
    ['NUMERIC_REPRESENTATION', undefined],
    ['NUMERIC_REPRESENTATION', 'float128'],
  ] as const)(
    'rejects %s destination type %s instead of inferring from y',
    (type, outputType) => {
      const parameters: Record<string, XBParameterValue> = {};
      if (outputType !== undefined) parameters.output_type = outputType;
      const xbModel = model({
        nodes: [
          node(
            'convert',
            type,
            [port('u', 'input')],
            [port('y', 'output', { dataType: 'float64' })],
            parameters,
          ),
        ],
      });

      const result = build(xbModel);
      expect(result.ir).toBeUndefined();
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'XB_CONVERSION_DESTINATION_INVALID',
          elementId: 'convert',
        }),
      ]);
    },
  );

  it('preserves exact shaped state-slot initial values', () => {
    const vector = {
      shape: 'vector',
      dimensions: [2],
    } as const;
    const xbModel = model({
      nodes: [
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input', vector)],
          [port('y', 'output', vector)],
          { initialValue: [1, 2] },
        ),
      ],
    });

    expect(
      build(xbModel).ir?.operations.delay.state?.slots[0].initialValues,
    ).toEqual([1, 2]);
  });

  it.each([
    ['undersized', [1]],
    ['oversized', [1, 2, 3]],
    ['wrong-type', [1, true]],
  ] as const)('rejects %s shaped state initial values', (_name, initialValue) => {
    const vector = {
      shape: 'vector',
      dimensions: [2],
    } as const;
    const xbModel = model({
      nodes: [
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input', vector)],
          [port('y', 'output', vector)],
          { initialValue },
        ),
      ],
    });

    const result = build(xbModel);
    expect(result.ir).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'XB_STATE_INITIAL_VALUE_INVALID',
        elementId: 'delay',
      }),
    ]);
  });

  it.each([
    ['a solver step that does not divide the base tick', 0.003, 10],
    ['a sample time that does not divide into solver substeps', 0.002, 10],
  ])('rejects %s', (_name, stepSeconds, baseTickMs) => {
    const xbModel = model({
      solver: { kind: 'euler', stepSeconds },
      nodes: [
        node(
          'delay',
          'UNIT_DELAY',
          [port('u', 'input')],
          [port('y', 'output')],
          { sampleTime: stepSeconds === 0.002 ? 0.003 : 0.006 },
        ),
      ],
      mappings: [{
        smVarId: 'command',
        blockId: 'delay',
        portId: 'u',
        direction: 'in',
      }],
    });

    const result = build(xbModel, baseTickMs);
    expect(result.ir).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain(
      'XB_SAMPLE_TIME_INVALID',
    );
  });

  it('correctly resolves vector shape for MUX output and propagates to DEMUX inputs/outputs', () => {
    const xbModel = model({
      nodes: [
        node('const1', 'Constant', [], [port('out', 'output')], { value: 7 }),
        node('const2', 'Constant', [], [port('out', 'output')], { value: 9 }),
        node('mux1', 'MUX', [port('u1', 'input'), port('u2', 'input')], [port('out', 'output')]),
        node('demux1', 'DEMUX', [port('in', 'input')], [port('out1', 'output'), port('out2', 'output')]),
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'const1', sourcePortId: 'out', targetNodeId: 'mux1', targetPortId: 'u1' },
        { id: 'e2', sourceNodeId: 'const2', sourcePortId: 'out', targetNodeId: 'mux1', targetPortId: 'u2' },
        { id: 'e3', sourceNodeId: 'mux1', sourcePortId: 'out', targetNodeId: 'demux1', targetPortId: 'in' },
      ],
    });

    const result = build(xbModel);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir).toBeDefined();
    const ir = result.ir!;
    expect(ir.signals['mux1:out'].shape).toEqual({ kind: 'vector', length: 2 });
    expect(ir.signals['mux1:out'].elementCount).toBe(2);
    expect(ir.signals['demux1:in'].shape).toEqual({ kind: 'vector', length: 2 });
    expect(ir.signals['demux1:in'].elementCount).toBe(2);
    expect(ir.signals['demux1:out1'].shape).toEqual({ kind: 'scalar' });
    expect(ir.signals['demux1:out2'].shape).toEqual({ kind: 'scalar' });
  });

  describe('DELAY(N) state boundary and parameter validation', () => {
    it('creates buffer array and index state slots for DELAY with delay_length=2 and initial_condition=-1', () => {
      const xbModel = model({
        nodes: [
          node(
            'delay1',
            'DELAY',
            [port('u', 'input')],
            [port('y', 'output')],
            { delay_length: 2, initial_condition: -1 },
          ),
        ],
      });

      const result = build(xbModel);
      expect(result.diagnostics).toEqual([]);
      expect(result.ir).toBeDefined();
      const op = result.ir!.operations.delay1;
      expect(op.delayParameters).toEqual({
        delayLength: 2,
        initialCondition: -1,
        samplePeriod: expect.any(Number),
        isUnitDelay: false,
      });
      expect(op.state?.slots).toHaveLength(2);
      const bufferSlot = op.state!.slots.find((s) => s.role === 'buffer');
      const indexSlot = op.state!.slots.find((s) => s.role === 'index');
      expect(bufferSlot).toBeDefined();
      expect(bufferSlot!.initialValues).toEqual([-1, -1]);
      expect(indexSlot).toBeDefined();
      expect(indexSlot!.initialValues).toEqual([0]);
    });

    it('optimizes DELAY with delay_length=1 to omit index slot', () => {
      const xbModel = model({
        nodes: [
          node(
            'delay1',
            'DELAY',
            [port('u', 'input')],
            [port('y', 'output')],
            { delay_length: 1, initialCondition: 5 },
          ),
        ],
      });

      const result = build(xbModel);
      expect(result.diagnostics).toEqual([]);
      const op = result.ir!.operations.delay1;
      expect(op.delayParameters?.isUnitDelay).toBe(true);
      expect(op.state?.slots).toHaveLength(1);
      expect(op.state!.slots[0].role).toBe('buffer');
      expect(op.state!.slots[0].initialValues).toEqual([5]);
    });

    it('emits diagnostic for missing or invalid delay_length in DELAY block', () => {
      const xbModelMissing = model({
        nodes: [
          node('delay1', 'DELAY', [port('u', 'input')], [port('y', 'output')], {}),
        ],
      });
      const resMissing = build(xbModelMissing);
      expect(resMissing.ir).toBeUndefined();
      expect(resMissing.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'XB_DELAY_LENGTH_MISSING' }),
      );

      const xbModelInvalid = model({
        nodes: [
          node(
            'delay2',
            'DELAY',
            [port('u', 'input')],
            [port('y', 'output')],
            { delay_length: -3 },
          ),
        ],
      });
      const resInvalid = build(xbModelInvalid);
      expect(resInvalid.ir).toBeUndefined();
      expect(resInvalid.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'XB_DELAY_LENGTH_INVALID' }),
      );
    });

    it('infers 2-state vector/matrix shapes for KALMAN_FILTER', () => {
      const xbModel = model({
        nodes: [
          node(
            'kf1',
            'KALMAN_FILTER',
            [
              port('u', 'input'),
              port('y_meas', 'input'),
            ],
            [
              port('x_hat', 'output'),
              port('y_hat', 'output'),
              port('innovation', 'output'),
              port('kg', 'output'),
            ],
            {
              A: [[1.0, 0.1], [0.0, 1.0]],
              B: [[0.005], [0.1]],
              C: [[1.0, 0.0]],
              D: [[0.0]],
              Q: [[0.01, 0.0], [0.0, 0.01]],
              R: [[0.1]],
              P0: [[1.0, 0.0], [0.0, 1.0]],
              x0: [0.0, 0.0],
            },
          ),
        ],
      });

      const result = build(xbModel);
      expect(result.diagnostics).toEqual([]);
      expect(result.ir).toBeDefined();

      const op = result.ir!.operations.kf1;
      const xSlot = op.state?.slots.find((s) => s.role === 'x');
      const pSlot = op.state?.slots.find((s) => s.role === 'P');

      expect(xSlot).toBeDefined();
      expect(xSlot!.shape).toEqual({ kind: 'vector', length: 2 });
      expect(pSlot).toBeDefined();
      expect(pSlot!.shape).toEqual({ kind: 'matrix', rows: 2, columns: 2 });

      const xHatSig = result.ir!.signals['kf1:x_hat'];
      expect(xHatSig).toBeDefined();
      expect(xHatSig.elementCount).toBe(2);

      const kgSig = result.ir!.signals['kf1:kg'];
      expect(kgSig).toBeDefined();
      expect(kgSig.elementCount).toBe(2);
    });

    it('emits diagnostic if KALMAN_FILTER parameters have mismatched dimensions', () => {
      const xbModel = model({
        nodes: [
          node(
            'kf1',
            'KALMAN_FILTER',
            [port('u', 'input'), port('y_meas', 'input')],
            [port('x_hat', 'output')],
            {
              A: [[1.0, 0.1], [0.0, 1.0]], // 2x2
              P0: [[1.0]], // 1x1 -> mismatch!
            },
          ),
        ],
      });

      const result = build(xbModel);
      expect(result.ir).toBeUndefined();
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'XB_KALMAN_DIMENSION_MISMATCH' }),
      );
    });

    it('broadcasts scalar initial condition x0 to multi-state STATE_SPACE block without diagnostics', () => {
      const xbModel = model({
        nodes: [
          node(
            'ss1',
            'STATE_SPACE',
            [port('u', 'input')],
            [port('y', 'output'), port('x', 'output', { shape: 'vector', dimensions: [2] })],
            {
              A: [[0, 1], [-2, -3]],
              B: [[0], [1]],
              C: [[1, 0]],
              D: [[0]],
              x0: 0,
            },
          ),
        ],
      });

      const result = build(xbModel);
      expect(result.diagnostics.filter((d) => d.code === 'XB_STATE_INITIAL_VALUE_INVALID')).toEqual([]);
      expect(result.ir).toBeDefined();
      const xState = result.ir?.operations['ss1']?.state?.slots.find((s) => s.role === 'x');
      expect(xState?.initialValues).toEqual([0, 0]);
    });

    it('safely handles variables array and omitted target without throwing TypeError', () => {
      const xbModel = model({
        nodes: [node('const1', 'Constant', [], [port('out', 'output')], { value: 5 })],
      });

      const result = buildXBSemanticModel({
        stateId: 'st1',
        model: xbModel,
        baseTickMs: 100,
        variables: [{ id: 'var1', name: 'myVar', type: 'float', initialValue: 0 }] as any,
        target: undefined as any,
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.ir).toBeDefined();
    });
  });
});




