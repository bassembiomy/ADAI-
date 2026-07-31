import { describe, expect, it } from 'vitest';
import type {
  XBSemanticModel,
  XBSemanticOperation,
  XBSemanticSignal,
} from './xbSemanticModel';
import type { XBNumericType } from './xbNumeric';
import {
  createXBRuntime,
  enterXBState,
  resetXBState,
  stepXBState,
} from './xbInterpreter';

const float32 = { kind: 'float32' } as const;
const scalar = { kind: 'scalar' } as const;

const signal = (
  id: string,
  direction: 'input' | 'output',
  sourceSignalId: string | null = null,
  numericType: XBNumericType = float32,
): XBSemanticSignal => {
  const separator = id.indexOf(':');
  return {
    id,
    nodeId: id.slice(0, separator),
    portId: id.slice(separator + 1),
    direction,
    sourceSignalId,
    shape: scalar,
    dimensions: [],
    elementCount: 1,
    layout: 'scalar',
    numericType,
    storage: numericType.kind === 'fixed' ? 'stored-integer' : 'native',
  };
};

const operation = (
  id: string,
  type: string,
  inputSignalIds: readonly string[],
  outputSignalIds: readonly string[],
  parameters: XBSemanticOperation['parameters'] = {},
  initialValues: readonly number[] | null = null,
): XBSemanticOperation => ({
  id,
  type,
  inputSignalIds,
  outputSignalIds,
  parameters,
  directFeedthrough: initialValues === null,
  stateful: initialValues !== null,
  conversion: null,
  state: initialValues === null
    ? null
    : {
      outputPhase: 'read-before-update',
      updatePhase: 'after-direct-feedthrough',
      slots: outputSignalIds.map((signalId) => ({
        id: `${signalId}$state`,
        signalId,
        numericType: float32,
        shape: scalar,
        initialValues,
      })),
    },
  schedule: {
    periodSubsteps: 1,
    offsetSubsteps: 0,
    initialCounter: 0,
    counterIncrement: 1,
    hold: initialValues === null ? 'none' : 'zero-order',
  },
});

const model = (
  memory: 'reset' | 'retain',
  operations: XBSemanticModel['operations'],
  signals: XBSemanticModel['signals'],
  executionOrder: readonly string[],
  mappings: XBSemanticModel['mappings'] = [],
): XBSemanticModel => ({
  stateId: 'controller',
  executionOrder,
  operations,
  signals,
  mappings,
  solver: { kind: 'euler', substepsPerTick: 1 },
  policy: { memory, numericFault: 'escalate' },
});

describe('X-Bridges interpreter', () => {
  it('executes mappings in, semantic operations, then mappings out', () => {
    const ir = model(
      'reset',
      {
        second: operation(
          'second',
          'GAIN',
          ['second:u'],
          ['second:y'],
          { gain: 2 },
        ),
        gain: operation(
          'gain',
          'GAIN',
          ['gain:u'],
          ['gain:y'],
          { gain: 4 },
        ),
      },
      {
        'gain:u': signal('gain:u', 'input'),
        'gain:y': signal('gain:y', 'output'),
        'second:u': signal('second:u', 'input', 'gain:y'),
        'second:y': signal('second:y', 'output'),
      },
      ['gain', 'second'],
      [
        {
          variableId: 'u',
          signalId: 'gain:u',
          blockId: 'gain',
          portId: 'u',
          direction: 'in',
          numericType: float32,
        },
        {
          variableId: 'y',
          signalId: 'second:y',
          blockId: 'second',
          portId: 'y',
          direction: 'out',
          numericType: float32,
        },
      ],
    );
    const runtime = createXBRuntime(ir);
    const data = { u: 1.25, y: 0 };

    expect(stepXBState(runtime, data)).toEqual([]);

    expect(data.y).toBe(10);
    expect(runtime.signals['gain:u']).toEqual([1.25]);
    expect(runtime.signals['gain:y']).toEqual([5]);
    expect(runtime.signals['second:y']).toEqual([10]);
  });

  it('canonicalizes state memory through its declared numeric type', () => {
    const ir = model(
      'retain',
      {
        integrator: operation(
          'integrator',
          'INTEGRATOR_DISCRETE',
          ['integrator:u'],
          ['integrator:y'],
          {},
          [0.1],
        ),
      },
      {
        'integrator:u': signal('integrator:u', 'input'),
        'integrator:y': signal('integrator:y', 'output'),
      },
      ['integrator'],
      [{
        variableId: 'u',
        signalId: 'integrator:u',
        blockId: 'integrator',
        portId: 'u',
        direction: 'in',
        numericType: float32,
      }],
    );
    const runtime = createXBRuntime(ir);

    expect(runtime.stateSlots['integrator:y$state']).toEqual([
      Math.fround(0.1),
    ]);

    stepXBState(runtime, { u: 0.2 });

    expect(runtime.stateSlots['integrator:y$state']).toEqual([
      Math.fround(Math.fround(0.1) + Math.fround(0.2)),
    ]);
  });

  it('updates stateful memory after direct-feedthrough operations', () => {
    const ir = model(
      'retain',
      {
        delay: operation(
          'delay',
          'UNIT_DELAY',
          ['delay:u'],
          ['delay:y'],
          {},
          [1],
        ),
        gain: operation(
          'gain',
          'GAIN',
          ['gain:u'],
          ['gain:y'],
          { gain: 2 },
        ),
      },
      {
        'delay:u': signal('delay:u', 'input', 'gain:y'),
        'delay:y': signal('delay:y', 'output'),
        'gain:u': signal('gain:u', 'input', 'delay:y'),
        'gain:y': signal('gain:y', 'output'),
      },
      ['delay', 'gain'],
    );
    const runtime = createXBRuntime(ir);

    stepXBState(runtime, {});

    expect(runtime.signals['delay:y']).toEqual([1]);
    expect(runtime.signals['gain:y']).toEqual([2]);
    expect(runtime.stateSlots['delay:y$state']).toEqual([2]);
  });

  it('converts only y and emits quantization error on e', () => {
    const fixedQ2 = {
      kind: 'fixed',
      signed: true,
      wordLength: 8,
      fractionLength: 2,
    } as const;
    const convert = {
      ...operation(
        'convert',
        'NUMERIC_REPRESENTATION',
        ['convert:u'],
        ['convert:y', 'convert:e'],
      ),
      conversion: {
        destinationType: fixedQ2,
        rounding: 'floor',
        overflow: 'saturate',
        mode: 'real-world-value',
      },
    } satisfies XBSemanticOperation;
    const ir = model(
      'reset',
      { convert },
      {
        'convert:u': signal('convert:u', 'input'),
        'convert:y': signal('convert:y', 'output', null, fixedQ2),
        'convert:e': signal('convert:e', 'output'),
      },
      ['convert'],
      [
        {
          variableId: 'u',
          signalId: 'convert:u',
          blockId: 'convert',
          portId: 'u',
          direction: 'in',
          numericType: float32,
        },
        {
          variableId: 'y',
          signalId: 'convert:y',
          blockId: 'convert',
          portId: 'y',
          direction: 'out',
          numericType: fixedQ2,
        },
        {
          variableId: 'e',
          signalId: 'convert:e',
          blockId: 'convert',
          portId: 'e',
          direction: 'out',
          numericType: float32,
        },
      ],
    );
    const runtime = createXBRuntime(ir);
    const data = { u: 1.2, y: 0, e: 0 };

    expect(stepXBState(runtime, data)).toEqual([]);

    expect(data.y).toBe(1);
    expect(data.e).toBeCloseTo(0.2, 6);
    expect(runtime.signals['convert:y']).toEqual([1]);
    expect(runtime.signals['convert:e'][0]).toBeCloseTo(0.2, 6);
    expect(runtime.storedIntegers['convert:y']).toEqual([4]);
    expect(runtime.storedIntegers['convert:e']).toEqual([null]);
  });

  it('reinterprets source stored integers without real-world conversion', () => {
    const fixedQ4 = {
      kind: 'fixed',
      signed: true,
      wordLength: 8,
      fractionLength: 4,
    } as const;
    const fixedQ2 = {
      kind: 'fixed',
      signed: true,
      wordLength: 8,
      fractionLength: 2,
    } as const;
    const reinterpret = {
      ...operation(
        'reinterpret',
        'NUMERIC_REPRESENTATION',
        ['reinterpret:u'],
        ['reinterpret:y', 'reinterpret:e'],
      ),
      conversion: {
        destinationType: fixedQ2,
        rounding: 'floor',
        overflow: 'saturate',
        mode: 'stored-integer-reinterpretation',
      },
    } satisfies XBSemanticOperation;
    const ir = model(
      'reset',
      { reinterpret },
      {
        'reinterpret:u': signal(
          'reinterpret:u',
          'input',
          null,
          fixedQ4,
        ),
        'reinterpret:y': signal(
          'reinterpret:y',
          'output',
          null,
          fixedQ2,
        ),
        'reinterpret:e': signal('reinterpret:e', 'output'),
      },
      ['reinterpret'],
      [
        {
          variableId: 'u',
          signalId: 'reinterpret:u',
          blockId: 'reinterpret',
          portId: 'u',
          direction: 'in',
          numericType: fixedQ4,
        },
        {
          variableId: 'y',
          signalId: 'reinterpret:y',
          blockId: 'reinterpret',
          portId: 'y',
          direction: 'out',
          numericType: fixedQ2,
        },
        {
          variableId: 'e',
          signalId: 'reinterpret:e',
          blockId: 'reinterpret',
          portId: 'e',
          direction: 'out',
          numericType: float32,
        },
      ],
    );
    const runtime = createXBRuntime(ir);
    const data = { u: 1.5, y: 0, e: -1 };

    expect(stepXBState(runtime, data)).toEqual([]);

    expect(runtime.storedIntegers['reinterpret:u']).toEqual([24]);
    expect(runtime.storedIntegers['reinterpret:y']).toEqual([24]);
    expect(data.y).toBe(6);
    expect(data.e).toBe(0);
  });

  it.each(['reset', 'retain'] as const)(
    'applies the %s memory policy when a state is re-entered',
    (memory) => {
      const ir = model(
        memory,
        {
          delay: operation(
            'delay',
            'UNIT_DELAY',
            ['delay:u'],
            ['delay:y'],
            {},
            [2],
          ),
          integrator: operation(
            'integrator',
            'INTEGRATOR_DISCRETE',
            ['integrator:u'],
            ['integrator:y'],
            {},
            [3],
          ),
        },
        {
          'delay:u': signal('delay:u', 'input'),
          'delay:y': signal('delay:y', 'output'),
          'integrator:u': signal('integrator:u', 'input'),
          'integrator:y': signal('integrator:y', 'output'),
        },
        ['delay', 'integrator'],
        [
          {
            variableId: 'u',
            signalId: 'delay:u',
            blockId: 'delay',
            portId: 'u',
            direction: 'in',
            numericType: float32,
          },
          {
            variableId: 'u',
            signalId: 'integrator:u',
            blockId: 'integrator',
            portId: 'u',
            direction: 'in',
            numericType: float32,
          },
        ],
      );
      const runtime = createXBRuntime(ir);

      stepXBState(runtime, { u: 7 });
      expect(runtime.stateSlots['delay:y$state']).toEqual([7]);
      expect(runtime.stateSlots['integrator:y$state']).toEqual([10]);

      enterXBState(runtime);

      const expectedDelay = memory === 'reset' ? [2] : [7];
      const expectedIntegrator = memory === 'reset' ? [3] : [10];
      expect(runtime.stateSlots['delay:y$state']).toEqual(expectedDelay);
      expect(runtime.stateSlots['integrator:y$state']).toEqual(
        expectedIntegrator,
      );

      resetXBState(runtime);
      expect(runtime.stateSlots['delay:y$state']).toEqual([2]);
      expect(runtime.stateSlots['integrator:y$state']).toEqual([3]);
    },
  );
});
