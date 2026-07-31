import { describe, expect, it } from 'vitest';
import type {
  XBSemanticModel,
  XBSemanticOperation,
  XBSemanticSignal,
} from './xbSemanticModel';
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
    numericType: float32,
    storage: 'native',
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
