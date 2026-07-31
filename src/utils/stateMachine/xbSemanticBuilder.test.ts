import { describe, expect, it } from 'vitest';
import type { SemanticVariable } from './smSemanticModel';
import type {
  XBNodeV1,
  XBParameterValue,
  XBPersistedModelV1,
  XBTargetCapabilities,
} from './xbModel';
import { buildXBSemanticModel } from './xbSemanticBuilder';

const target: XBTargetCapabilities = {
  supportsFloat16: false,
  supportsFloat32: true,
  supportsFloat64: true,
  supportsMathLibrary: true,
  maxVectorLength: 16,
  maxMatrixDimension: 8,
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
        signalId: 'delay:y',
        numericType: { kind: 'float32' },
        shape: { kind: 'scalar' },
        initialValues: [0],
      }],
    });
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
});
