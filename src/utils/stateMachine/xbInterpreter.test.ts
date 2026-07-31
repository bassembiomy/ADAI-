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

const shapedSignal = (
  id: string,
  direction: 'input' | 'output',
  shape: XBSemanticSignal['shape'],
  sourceSignalId: string | null = null,
): XBSemanticSignal => {
  const dimensions = shape.kind === 'scalar'
    ? []
    : shape.kind === 'vector'
      ? [shape.length]
      : [shape.rows, shape.columns];
  return {
    ...signal(id, direction, sourceSignalId),
    shape,
    dimensions,
    elementCount: dimensions.length === 0 ? 1 : dimensions.reduce((a, b) => a * b, 1),
    layout: shape.kind === 'matrix'
      ? 'row-major'
      : shape.kind === 'vector'
        ? 'contiguous'
        : 'scalar',
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
  solver: { kind: 'euler', stepSeconds: 0.01, substepsPerTick: 1 },
  policy: { memory, numericFault: 'escalate' },
});

describe('X-Bridges interpreter', () => {
  it('updates saturated PID, transfer-function, and bounded state-space state deterministically', () => {
    const stateful = (id: string, type: string, parameters: XBSemanticOperation['parameters'], initialValues: number[]) => operation(
      id, type, [`${id}:u`, `${id}:feedback`], [`${id}:y`], parameters, initialValues,
    );
    const ir = model('retain', {
      pid: stateful('pid', 'PID_BASIC', { Kp: 10, Ki: 0, min: -2, max: 2, sampleTime: 0.1 }, [0]),
      tf: stateful('tf', 'DISCRETE_TRANSFER_FUNCTION', { A: [[0.5]], B: [[1]] }, [0]),
      ss: stateful('ss', 'STATE_SPACE', { A: [[0.5]], B: [[2]] }, [0]),
    }, {
      'pid:u': signal('pid:u', 'input'), 'pid:feedback': signal('pid:feedback', 'input'), 'pid:y': signal('pid:y', 'output'),
      'tf:u': signal('tf:u', 'input'), 'tf:feedback': signal('tf:feedback', 'input'), 'tf:y': signal('tf:y', 'output'),
      'ss:u': signal('ss:u', 'input'), 'ss:feedback': signal('ss:feedback', 'input'), 'ss:y': signal('ss:y', 'output'),
    }, ['pid', 'tf', 'ss']);
    const runtime = createXBRuntime(ir);
    runtime.signals['pid:u'] = [1]; runtime.signals['tf:u'] = [1]; runtime.signals['ss:u'] = [1];

    stepXBState(runtime, {});

    expect(runtime.stateSlots['pid:y$state']).toEqual([2]);
    expect(runtime.stateSlots['tf:y$state']).toEqual([1]);
    expect(runtime.stateSlots['ss:y$state']).toEqual([2]);
  });

  it('evaluates Clarke, Park, and inverse transforms against known references', () => {
    const ir = model('retain', {
      clarke: operation('clarke', 'CLARKE_TRANSFORM', ['clarke:ia', 'clarke:ib', 'clarke:ic'], ['clarke:alpha', 'clarke:beta']),
      park: operation('park', 'PARK_TRANSFORM', ['park:alpha', 'park:beta', 'park:theta'], ['park:d', 'park:q']),
      inversePark: operation('inversePark', 'INVERSE_PARK', ['inversePark:d', 'inversePark:q', 'inversePark:theta'], ['inversePark:alpha', 'inversePark:beta']),
      inverseClarke: operation('inverseClarke', 'INVERSE_CLARKE', ['inverseClarke:alpha', 'inverseClarke:beta'], ['inverseClarke:a', 'inverseClarke:b', 'inverseClarke:c']),
    }, Object.fromEntries([
      ...['clarke:ia', 'clarke:ib', 'clarke:ic', 'clarke:alpha', 'clarke:beta', 'park:alpha', 'park:beta', 'park:theta', 'park:d', 'park:q', 'inversePark:d', 'inversePark:q', 'inversePark:theta', 'inversePark:alpha', 'inversePark:beta', 'inverseClarke:alpha', 'inverseClarke:beta', 'inverseClarke:a', 'inverseClarke:b', 'inverseClarke:c']
        .map((id) => [id, signal(id, 'output')] as const),
    ]), ['clarke', 'park', 'inversePark', 'inverseClarke']);
    const runtime = createXBRuntime(ir);
    Object.assign(runtime.signals, {
      'clarke:ia': [1], 'clarke:ib': [-0.5], 'clarke:ic': [-0.5],
      'park:alpha': [1], 'park:beta': [0], 'park:theta': [Math.PI / 2],
      'inversePark:d': [0], 'inversePark:q': [-1], 'inversePark:theta': [Math.PI / 2],
      'inverseClarke:alpha': [1], 'inverseClarke:beta': [0],
    });

    stepXBState(runtime, {});

    expect(runtime.signals['clarke:alpha'][0]).toBeCloseTo(1, 12);
    expect(runtime.signals['clarke:beta'][0]).toBeCloseTo(0, 12);
    expect(runtime.signals['park:d'][0]).toBeCloseTo(0, 12);
    expect(runtime.signals['park:q'][0]).toBeCloseTo(-1, 12);
    expect(runtime.signals['inversePark:alpha'][0]).toBeCloseTo(1, 12);
    expect(runtime.signals['inversePark:beta'][0]).toBeCloseTo(0, 12);
    expect(runtime.signals['inverseClarke:a'][0]).toBeCloseTo(1, 12);
    expect(runtime.signals['inverseClarke:b'][0]).toBeCloseTo(-0.5, 12);
    expect(runtime.signals['inverseClarke:c'][0]).toBeCloseTo(-0.5, 12);
  });
  it('evaluates elementwise vectors in their contiguous element order', () => {
    const ir = model('retain', {
      left: operation('left', 'Constant', [], ['left:y'], { value: [1, 2, 3] }),
      right: operation('right', 'Constant', [], ['right:y'], { value: [4, 5, 6] }),
      add: operation('add', 'VectorAdd', ['add:a', 'add:b'], ['add:y']),
    }, {
      'left:y': shapedSignal('left:y', 'output', { kind: 'vector', length: 3 }),
      'right:y': shapedSignal('right:y', 'output', { kind: 'vector', length: 3 }),
      'add:a': shapedSignal('add:a', 'input', { kind: 'vector', length: 3 }, 'left:y'),
      'add:b': shapedSignal('add:b', 'input', { kind: 'vector', length: 3 }, 'right:y'),
      'add:y': shapedSignal('add:y', 'output', { kind: 'vector', length: 3 }),
    }, ['left', 'right', 'add']);
    const runtime = createXBRuntime(ir);

    stepXBState(runtime, {});

    expect(runtime.signals['add:y']).toEqual([5, 7, 9]);
  });

  it('evaluates row-major matrix multiply, transpose, concat, diagonal, and submatrix', () => {
    const ir = model('retain', {
      a: operation('a', 'Constant', [], ['a:y'], { value: [1, 2, 3, 4, 5, 6] }),
      b: operation('b', 'Constant', [], ['b:y'], { value: [7, 8, 9, 10, 11, 12] }),
      mul: operation('mul', 'MatrixMul', ['mul:a', 'mul:b'], ['mul:y']),
      transpose: operation('transpose', 'Transpose', ['transpose:u'], ['transpose:y']),
      concat: operation('concat', 'MatrixConcat', ['concat:a', 'concat:b'], ['concat:y'], { axis: 1 }),
      diag: operation('diag', 'MatrixDiag', ['diag:u'], ['diag:y']),
      sub: operation('sub', 'SubMatrix', ['sub:u'], ['sub:y'], { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 2 }),
    }, {
      'a:y': shapedSignal('a:y', 'output', { kind: 'matrix', rows: 2, columns: 3 }),
      'b:y': shapedSignal('b:y', 'output', { kind: 'matrix', rows: 3, columns: 2 }),
      'mul:a': shapedSignal('mul:a', 'input', { kind: 'matrix', rows: 2, columns: 3 }, 'a:y'),
      'mul:b': shapedSignal('mul:b', 'input', { kind: 'matrix', rows: 3, columns: 2 }, 'b:y'),
      'mul:y': shapedSignal('mul:y', 'output', { kind: 'matrix', rows: 2, columns: 2 }),
      'transpose:u': shapedSignal('transpose:u', 'input', { kind: 'matrix', rows: 2, columns: 2 }, 'mul:y'),
      'transpose:y': shapedSignal('transpose:y', 'output', { kind: 'matrix', rows: 2, columns: 2 }),
      'concat:a': shapedSignal('concat:a', 'input', { kind: 'matrix', rows: 2, columns: 2 }, 'mul:y'),
      'concat:b': shapedSignal('concat:b', 'input', { kind: 'matrix', rows: 2, columns: 2 }, 'transpose:y'),
      'concat:y': shapedSignal('concat:y', 'output', { kind: 'matrix', rows: 2, columns: 4 }),
      'diag:u': shapedSignal('diag:u', 'input', { kind: 'vector', length: 3 }),
      'diag:y': shapedSignal('diag:y', 'output', { kind: 'matrix', rows: 3, columns: 3 }),
      'sub:u': shapedSignal('sub:u', 'input', { kind: 'matrix', rows: 2, columns: 4 }, 'concat:y'),
      'sub:y': shapedSignal('sub:y', 'output', { kind: 'matrix', rows: 1, columns: 2 }),
    }, ['a', 'b', 'mul', 'transpose', 'concat', 'diag', 'sub']);
    const runtime = createXBRuntime(ir);
    runtime.signals['diag:u'] = [2, 3, 4];

    stepXBState(runtime, {});

    expect(runtime.signals['mul:y']).toEqual([58, 64, 139, 154]);
    expect(runtime.signals['transpose:y']).toEqual([58, 139, 64, 154]);
    expect(runtime.signals['concat:y']).toEqual([58, 64, 58, 139, 139, 154, 64, 154]);
    expect(runtime.signals['diag:y']).toEqual([2, 0, 0, 0, 3, 0, 0, 0, 4]);
    expect(runtime.signals['sub:y']).toEqual([64, 58]);
  });

  it('solves a bounded linear system and returns zero for a deterministic pivot failure', () => {
    const makeRuntime = (matrix: number[]) => createXBRuntime(model('retain', {
      a: operation('a', 'Constant', [], ['a:y'], { value: matrix }),
      b: operation('b', 'Constant', [], ['b:y'], { value: [5, 5] }),
      solve: operation('solve', 'MatrixSolve', ['solve:a', 'solve:b'], ['solve:y'], { maxDimension: 4 }),
    }, {
      'a:y': shapedSignal('a:y', 'output', { kind: 'matrix', rows: 2, columns: 2 }),
      'b:y': shapedSignal('b:y', 'output', { kind: 'matrix', rows: 2, columns: 1 }),
      'solve:a': shapedSignal('solve:a', 'input', { kind: 'matrix', rows: 2, columns: 2 }, 'a:y'),
      'solve:b': shapedSignal('solve:b', 'input', { kind: 'matrix', rows: 2, columns: 1 }, 'b:y'),
      'solve:y': shapedSignal('solve:y', 'output', { kind: 'matrix', rows: 2, columns: 1 }),
    }, ['a', 'b', 'solve']));
    const solved = makeRuntime([2, 1, 1, 3]);
    const singular = makeRuntime([1, 2, 2, 4]);

    stepXBState(solved, {});
    stepXBState(singular, {});

    expect(solved.signals['solve:y']).toEqual([2, 1]);
    expect(singular.signals['solve:y']).toEqual([0, 0]);
  });
  it('uses five integer solver substeps per tick and holds a 20 ms delay between samples', () => {
    const delay = {
      ...operation(
        'delay',
        'DELAY',
        ['delay:u'],
        ['delay:y'],
        {},
        [0],
      ),
      schedule: {
        periodSubsteps: 10,
        offsetSubsteps: 0,
        initialCounter: 0,
        counterIncrement: 1,
        hold: 'zero-order' as const,
      },
    } satisfies XBSemanticOperation;
    const ir = {
      ...model(
        'retain',
        { delay },
        {
          'delay:u': signal('delay:u', 'input'),
          'delay:y': signal('delay:y', 'output'),
        },
        ['delay'],
        [{
          variableId: 'u', signalId: 'delay:u', blockId: 'delay',
          portId: 'u', direction: 'in', numericType: float32,
        }, {
          variableId: 'y', signalId: 'delay:y', blockId: 'delay',
          portId: 'y', direction: 'out', numericType: float32,
        }],
      ),
      solver: { kind: 'euler' as const, stepSeconds: 0.002, substepsPerTick: 5 },
    } as XBSemanticModel;
    const runtime = createXBRuntime(ir);
    const first = { u: 1, y: -1 };
    const second = { u: 2, y: -1 };

    stepXBState(runtime, first);
    expect(first.y).toBe(1);
    expect(runtime.stateSlots['delay:y$state']).toEqual([1]);
    expect(runtime.scheduleCounters.delay).toBe(5);

    stepXBState(runtime, second);
    expect(second.y).toBe(1);
    expect(runtime.stateSlots['delay:y$state']).toEqual([1]);
    expect(runtime.scheduleCounters.delay).toBe(0);

    const third = { u: 3, y: -1 };
    stepXBState(runtime, third);
    expect(third.y).toBe(3);
    expect(runtime.stateSlots['delay:y$state']).toEqual([3]);
  });

  it.each(['euler', 'rk4'] as const)(
    'integrates dx/dt = -x + u with fixed-step %s',
    (kind) => {
      const integrator = {
        ...operation(
          'integrator',
          'INTEGRATOR_CONTINUOUS',
          ['integrator:u'],
          ['integrator:y'],
          {},
          [0],
        ),
      } satisfies XBSemanticOperation;
      const ir = {
        ...model(
          'retain',
          {
            integrator,
            negative: operation(
              'negative', 'GAIN', ['negative:u'], ['negative:y'], { gain: -1 },
            ),
            derivative: operation(
              'derivative', 'Sum', ['derivative:a', 'derivative:b'], ['derivative:y'],
            ),
            downstream: operation(
              'downstream', 'GAIN', ['downstream:u'], ['downstream:y'], { gain: 2 },
            ),
          },
          {
            'integrator:u': signal('integrator:u', 'input', 'derivative:y'),
            'integrator:y': signal('integrator:y', 'output'),
            'negative:u': signal('negative:u', 'input', 'integrator:y'),
            'negative:y': signal('negative:y', 'output'),
            'derivative:a': signal('derivative:a', 'input', 'negative:y'),
            'derivative:b': signal('derivative:b', 'input', 'input:y'),
            'derivative:y': signal('derivative:y', 'output'),
            'downstream:u': signal('downstream:u', 'input', 'integrator:y'),
            'downstream:y': signal('downstream:y', 'output'),
            'input:y': signal('input:y', 'input'),
          },
          ['integrator', 'negative', 'derivative', 'downstream'],
          [{
            variableId: 'u', signalId: 'input:y', blockId: 'input',
            portId: 'y', direction: 'in', numericType: float32,
          }, {
            variableId: 'x', signalId: 'integrator:y', blockId: 'integrator',
            portId: 'y', direction: 'out', numericType: float32,
          }, {
            variableId: 'twice', signalId: 'downstream:y', blockId: 'downstream',
            portId: 'y', direction: 'out', numericType: float32,
          }],
        ),
        solver: { kind, substepsPerTick: 5, stepSeconds: 0.002 },
      } as XBSemanticModel;
      const runtime = createXBRuntime(ir);
      const data = { u: 1, x: 0, twice: 0 };

      for (let tick = 0; tick < 5; tick++) stepXBState(runtime, data);

      const exact = 1 - Math.exp(-0.05);
      expect(runtime.stateSlots['integrator:y$state'][0]).toBeCloseTo(
        exact,
        kind === 'rk4' ? 6 : 4,
      );
      expect(data.x).toBeCloseTo(exact, kind === 'rk4' ? 6 : 4);
      expect(data.twice).toBeCloseTo(2 * data.x, kind === 'rk4' ? 6 : 4);
    },
  );

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
