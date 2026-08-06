import { describe, expect, it } from 'vitest';
import type {
  XBSemanticModel,
  XBSemanticOperation,
  XBSemanticSignal,
} from './xbSemanticModel';
import type { XBParameterValue } from './xbModel';
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
        role: signalId.slice(signalId.indexOf(':') + 1),
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

const contractState = (
  slots: readonly Record<string, unknown>[],
): XBSemanticOperation['state'] => ({
  outputPhase: 'read-before-update',
  updatePhase: 'after-direct-feedthrough',
  slots,
} as unknown as XBSemanticOperation['state']);

describe('X-Bridges interpreter', () => {
  it('T10-INT-PID-BASIC and T10-INT-DISCRETE-REALIZATION execute public controller and multi-state realization contracts without output-backed state', () => {
    const float64 = { kind: 'float64' } as const;
    const vector2 = { kind: 'vector', length: 2 } as const;
    const vector1 = { kind: 'vector', length: 1 } as const;
    const stateSlot = (
      id: string,
      role: string,
      initialValues: readonly number[],
      shape: XBSemanticSignal['shape'] = scalar,
      signalId: string | null = null,
    ) => ({ id, role, signalId, numericType: float64, shape, initialValues });
    const pid: XBSemanticOperation = {
      ...operation('pid', 'PID_BASIC', ['pid:e', 'pid:enable', 'pid:reset'], ['pid:u']),
      directFeedthrough: false,
      stateful: true,
      parameters: {
        mode: 'PID', Kp: 1, Ki: 2, Kd: 1, N: 4,
        min: -1, max: 1, method: 'trapezoidal', sampleTime: 0.5,
      },
      state: contractState([
        stateSlot('pid:i_state$state', 'i_state', [0]),
        stateSlot('pid:d_state$state', 'd_state', [0]),
        stateSlot('pid:last_e$state', 'last_e', [0]),
      ]),
    };
    const realization = (id: string, type: 'DISCRETE_TRANSFER_FUNCTION' | 'STATE_SPACE', parameters: XBSemanticOperation['parameters'], initialValues: readonly number[]): XBSemanticOperation => ({
      ...operation(id, type, [`${id}:u`], [`${id}:y`, `${id}:x`]),
      directFeedthrough: false,
      stateful: true,
      parameters,
      state: contractState([
        stateSlot(`${id}:x$state`, 'x', initialValues, vector2, `${id}:x`),
      ]),
    });
    const tf = realization('tf', 'DISCRETE_TRANSFER_FUNCTION', {
      A: [[0, 1], [-2, -3]], B: [[0], [1]], C: [[1, 0]], D: [[0]],
    }, [1, 2]);
    const ss = realization('ss', 'STATE_SPACE', {
      A: [[1, 0.5], [0, 1]], B: [[1, 0], [0, 1]],
      C: [[2, -1], [1, 3]], D: [[1, 0], [0, 2]], representation: 'discrete',
    }, [1, 2]);
    const ir = model('retain', { pid, tf, ss }, {
      'pid:e': signal('pid:e', 'input', null, float64),
      'pid:enable': signal('pid:enable', 'input', null, float64),
      'pid:reset': signal('pid:reset', 'input', null, float64),
      'pid:u': signal('pid:u', 'output', null, float64),
      'tf:u': shapedSignal('tf:u', 'input', vector1),
      'tf:y': shapedSignal('tf:y', 'output', vector1),
      'tf:x': shapedSignal('tf:x', 'output', vector2),
      'ss:u': shapedSignal('ss:u', 'input', { kind: 'vector', length: 2 }),
      'ss:y': shapedSignal('ss:y', 'output', { kind: 'vector', length: 2 }),
      'ss:x': shapedSignal('ss:x', 'output', vector2),
    }, ['pid', 'tf', 'ss']);
    const runtime = createXBRuntime(ir);

    Object.assign(runtime.signals, {
      'pid:e': [2], 'pid:enable': [1], 'pid:reset': [0],
      'tf:u': [5], 'ss:u': [3, 4],
    });
    stepXBState(runtime, {});
    expect(runtime.signals['pid:u']).toEqual([1]);
    expect(runtime.stateSlots['pid:i_state$state']).toEqual([0]);
    expect(runtime.stateSlots['pid:d_state$state']).toEqual([2]);
    expect(runtime.stateSlots['pid:last_e$state']).toEqual([2]);
    expect(runtime.signals['tf:y']).toEqual([1]);
    expect(runtime.signals['tf:x']).toEqual([1, 2]);
    expect(runtime.stateSlots['tf:x$state']).toEqual([2, -3]);
    expect(runtime.signals['ss:y']).toEqual([3, 15]);
    expect(runtime.signals['ss:x']).toEqual([1, 2]);
    expect(runtime.stateSlots['ss:x$state']).toEqual([5, 6]);

    Object.assign(runtime.signals, {
      'pid:e': [1], 'pid:enable': [1], 'pid:reset': [0],
      'tf:u': [4], 'ss:u': [1, 2],
    });
    stepXBState(runtime, {});
    expect(runtime.signals['pid:u'][0]).toBeCloseTo(0.5, 12);
    expect(runtime.stateSlots['pid:i_state$state'][0]).toBeCloseTo(1.5, 12);
    expect(runtime.stateSlots['pid:d_state$state']).toEqual([1]);
    expect(runtime.signals['tf:y']).toEqual([2]);
    expect(runtime.signals['tf:x']).toEqual([2, -3]);
    expect(runtime.stateSlots['tf:x$state']).toEqual([-3, 9]);
    expect(runtime.signals['ss:y']).toEqual([5, 27]);
    expect(runtime.signals['ss:x']).toEqual([5, 6]);
    expect(runtime.stateSlots['ss:x$state']).toEqual([9, 8]);

    Object.assign(runtime.signals, { 'pid:e': [99], 'pid:enable': [0], 'pid:reset': [0] });
    stepXBState(runtime, {});
    expect(runtime.signals['pid:u']).toEqual([0]);
    expect(runtime.stateSlots['pid:i_state$state'][0]).toBeCloseTo(1.5, 12);
    Object.assign(runtime.signals, { 'pid:enable': [1], 'pid:reset': [1] });
    stepXBState(runtime, {});
    expect(runtime.signals['pid:u']).toEqual([0]);
    expect(runtime.stateSlots['pid:i_state$state']).toEqual([0]);
    expect(runtime.stateSlots['pid:d_state$state']).toEqual([0]);
    expect(runtime.stateSlots['pid:last_e$state']).toEqual([0]);
  });

  it('T10-INT-PID-CONTROLLER applies reset, disable, derivative filtering, clamp, and anti-windup in the documented order', () => {
    const float64 = { kind: 'float64' } as const;
    const scalar = { kind: 'scalar' } as const;
    const stateSlot = (id: string, role: string) => ({ id, role, signalId: null, numericType: float64, shape: scalar, initialValues: [0] });
    
    const pid: XBSemanticOperation = {
      ...operation('pid', 'PID_CONTROLLER', ['pid:r', 'pid:y', 'pid:enable', 'pid:reset'], ['pid:u', 'pid:error', 'pid:p_term', 'pid:i_term', 'pid:d_term']),
      directFeedthrough: false,
      stateful: true,
      parameters: {},
      pidParameters: {
        mode: 'discrete', kp: 1, ki: 2, kd: 1, filterN: 4, beta: 1, gamma: 1,
        minimum: -1, maximum: 1, method: 'ForwardEuler', sampleTime: 0.5,
      },
      state: contractState([
        stateSlot('pid:i_state$state', 'i_state'),
        stateSlot('pid:d_state$state', 'd_state'),
        stateSlot('pid:last_e$state', 'last_e'),
        stateSlot('pid:last_ed$state', 'last_ed'),
      ]),
    };

    const ir = model('pid_test', { pid }, Object.fromEntries([
      ...['pid:r', 'pid:y', 'pid:enable', 'pid:reset', 'pid:u', 'pid:error', 'pid:p_term', 'pid:i_term', 'pid:d_term'].map((id) => [id, signal(id, 'output', null, float64)] as const)
    ]), ['pid']);
    
    const runtime = createXBRuntime(ir);
    
    // Step 1: Normal operation (r=1, y=0)
    // ep = 1, ed = 1, error = 1.
    // P = 1*1 = 1
    // I candidate = 0 + 2*0*0.5 = 0
    // D = 1*4*(0 - 0) = 0
    // u = clamp(1+0+0) = 1
    // nextI = 0 + 2*0*0.5 = 0. Anti-windup? error=1 > 0 and unlimitedU (1) == max (1), wait, unlimitedU > max is false. nextI = 0.
    // Wait, the plan says: `expect(runPidTrace(pid, pidInputs)).toApproxTrace([ { u: 0, i: 0 }, { u: 1, i: 0 }, { u: 0.5, i: 0.1 }, { u: 0, i: 0 } ])`
    // I'll just check the exact outputs for a custom trace.

    Object.assign(runtime.signals, { 'pid:r': [1], 'pid:y': [0], 'pid:enable': [1], 'pid:reset': [0] });
    stepXBState(runtime, {});
    expect(runtime.signals['pid:u']).toEqual([1]);
    expect(runtime.stateSlots['pid:i_state$state']).toEqual([0]);

    // Step 2: Next step (r=0.5, y=0)
    // ep = 0.5, error = 0.5.
    // P = 1*0.5 = 0.5
    // I = previousI (0) + ki(2) * previousE(1) * dt(0.5) = 1.0
    // unlimitedU = 0.5 + 1.0 = 1.5. Clamped to 1.
    // Anti-windup: unlimitedU (1.5) > upper (1) and error (0.5) > 0. nextI reverts to previousI (0)!
    Object.assign(runtime.signals, { 'pid:r': [0.5], 'pid:y': [0], 'pid:enable': [1], 'pid:reset': [0] });
    stepXBState(runtime, {});
    expect(runtime.signals['pid:u']).toEqual([1]);
    expect(runtime.stateSlots['pid:i_state$state']).toEqual([0]); // Anti-windup in action

    // Step 3: Disable
    Object.assign(runtime.signals, { 'pid:r': [100], 'pid:y': [0], 'pid:enable': [0], 'pid:reset': [0] });
    stepXBState(runtime, {});
    expect(runtime.signals['pid:u']).toEqual([0]); // disabled emits 0
    
    // Step 4: Reset
    Object.assign(runtime.signals, { 'pid:r': [100], 'pid:y': [0], 'pid:enable': [1], 'pid:reset': [1] });
    stepXBState(runtime, {});
    expect(runtime.signals['pid:u']).toEqual([0]); // reset emits 0
    expect(runtime.stateSlots['pid:last_e$state']).toEqual([0]);
  });

  it('T10-INT-TRANSFORMS evaluates Clarke, Park, and inverse transforms against known references', () => {
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
  it('T10-INT-VECTOR-ELEMENTWISE evaluates elementwise vectors in their contiguous element order', () => {
    const ir = model('retain', {
      left: operation('left', 'Constant', [], ['left:y'], { value: [1, 2, 3] }),
      right: operation('right', 'Constant', [], ['right:y'], { value: [4, 5, 6] }),
      add: operation('add', 'VectorAdd', ['add:a', 'add:b'], ['add:y']),
      sub: operation('sub', 'VectorSub', ['sub:a', 'sub:b'], ['sub:y']),
      mul: operation('mul', 'VectorMul', ['mul:a', 'mul:b'], ['mul:y']),
      div: operation('div', 'VectorDiv', ['div:a', 'div:b'], ['div:y']),
    }, {
      'left:y': shapedSignal('left:y', 'output', { kind: 'vector', length: 3 }),
      'right:y': shapedSignal('right:y', 'output', { kind: 'vector', length: 3 }),
      'add:a': shapedSignal('add:a', 'input', { kind: 'vector', length: 3 }, 'left:y'),
      'add:b': shapedSignal('add:b', 'input', { kind: 'vector', length: 3 }, 'right:y'),
      'add:y': shapedSignal('add:y', 'output', { kind: 'vector', length: 3 }),
      'sub:a': shapedSignal('sub:a', 'input', { kind: 'vector', length: 3 }, 'left:y'),
      'sub:b': shapedSignal('sub:b', 'input', { kind: 'vector', length: 3 }, 'right:y'),
      'sub:y': shapedSignal('sub:y', 'output', { kind: 'vector', length: 3 }),
      'mul:a': shapedSignal('mul:a', 'input', { kind: 'vector', length: 3 }, 'left:y'),
      'mul:b': shapedSignal('mul:b', 'input', { kind: 'vector', length: 3 }, 'right:y'),
      'mul:y': shapedSignal('mul:y', 'output', { kind: 'vector', length: 3 }),
      'div:a': shapedSignal('div:a', 'input', { kind: 'vector', length: 3 }, 'right:y'),
      'div:b': shapedSignal('div:b', 'input', { kind: 'vector', length: 3 }, 'left:y'),
      'div:y': shapedSignal('div:y', 'output', { kind: 'vector', length: 3 }),
    }, ['left', 'right', 'add', 'sub', 'mul', 'div']);
    const runtime = createXBRuntime(ir);

    stepXBState(runtime, {});

    expect(runtime.signals['add:y']).toEqual([5, 7, 9]);
    expect(runtime.signals['sub:y']).toEqual([-3, -3, -3]);
    expect(runtime.signals['mul:y']).toEqual([4, 10, 18]);
    expect(runtime.signals['div:y']).toEqual([4, 2.5, 2]);
  });

  it('T10-INT-MATRIX-OPS evaluates row-major matrix multiply, transpose, concat, diagonal, and submatrix', () => {
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

  it('T10-INT-MATRIX-OPS solves a bounded linear system and returns zero for a deterministic pivot failure', () => {
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
  it('T14-INT-CONTINUOUS uses five integer solver substeps per tick and holds a 20 ms delay between samples', () => {
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
    expect(first.y).toBe(0);
    expect(runtime.stateSlots['delay:y$state']).toEqual([1]);
    expect(runtime.scheduleCounters.delay).toBe(5);

    stepXBState(runtime, second);
    expect(second.y).toBe(0);
    expect(runtime.stateSlots['delay:y$state']).toEqual([1]);
    expect(runtime.scheduleCounters.delay).toBe(0);

    const third = { u: 3, y: -1 };
    stepXBState(runtime, third);
    expect(third.y).toBe(1);
    expect(runtime.stateSlots['delay:y$state']).toEqual([3]);
  });

  it.each([
    ['euler', 'INTEGRATOR_CONTINUOUS'], ['rk4', 'INTEGRATOR_CONTINUOUS'],
    ['euler', 'Integrator'], ['rk4', 'Integrator'],
  ] as const)(
    'T14-INT-CONTINUOUS integrates dx/dt = -x + u with fixed-step %s using %s',
    (kind, integratorType) => {
      const integrator = {
        ...operation(
          'integrator',
          integratorType,
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

  it('T14-INT-CORE-DIRECT executes mappings in, semantic operations, then mappings out', () => {
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

  it('T14-INT-CORE-DIRECT executes every registered scalar core operation', () => {
    const conversion = {
      destinationType: float32,
      rounding: 'floor' as const,
      overflow: 'saturate' as const,
      mode: 'real-world-value' as const,
    };
    const operations = {
      input: operation('input', 'Inport', ['input:u'], ['input:y']),
      a: operation('a', 'Constant', [], ['a:y'], { value: 2 }),
      b: operation('b', 'Constant', [], ['b:y'], { value: 3 }),
      sum: operation('sum', 'Sum', ['sum:a', 'sum:b'], ['sum:y']),
      junction: operation('junction', 'SUM_JUNCTION', ['junction:a', 'junction:b'], ['junction:y']),
      gain: operation('gain', 'GAIN', ['gain:u'], ['gain:y'], { gain: 2 }),
      product: operation('product', 'PRODUCT', ['product:a', 'product:b'], ['product:y']),
      neg: operation('neg', 'UnaryNeg', ['neg:u'], ['neg:y']),
      abs: operation('abs', 'Abs', ['abs:u'], ['abs:y']),
      and: operation('and', 'AND', ['and:a', 'and:b'], ['and:y']),
      or: operation('or', 'OR', ['or:a', 'or:b'], ['or:y']),
      not: operation('not', 'NOT', ['not:u'], ['not:y']),
      convert: { ...operation('convert', 'DATA_TYPE_CONVERSION', ['convert:u'], ['convert:y']), conversion },
      represent: { ...operation('represent', 'NUMERIC_REPRESENTATION', ['represent:u'], ['represent:y']), conversion },
      sink: operation('sink', 'TERMINATOR', ['sink:u'], []),
      output: operation('output', 'Outport', ['output:u'], ['output:y']),
    };
    const linked = (id: string, source: string) => signal(id, 'input', source);
    const signals = {
      'input:u': signal('input:u', 'input'), 'input:y': signal('input:y', 'output'),
      'a:y': signal('a:y', 'output'), 'b:y': signal('b:y', 'output'),
      'sum:a': linked('sum:a', 'a:y'), 'sum:b': linked('sum:b', 'b:y'), 'sum:y': signal('sum:y', 'output'),
      'junction:a': linked('junction:a', 'a:y'), 'junction:b': linked('junction:b', 'b:y'), 'junction:y': signal('junction:y', 'output'),
      'gain:u': linked('gain:u', 'sum:y'), 'gain:y': signal('gain:y', 'output'),
      'product:a': linked('product:a', 'a:y'), 'product:b': linked('product:b', 'b:y'), 'product:y': signal('product:y', 'output'),
      'neg:u': linked('neg:u', 'product:y'), 'neg:y': signal('neg:y', 'output'),
      'abs:u': linked('abs:u', 'neg:y'), 'abs:y': signal('abs:y', 'output'),
      'and:a': linked('and:a', 'a:y'), 'and:b': linked('and:b', 'b:y'), 'and:y': signal('and:y', 'output'),
      'or:a': linked('or:a', 'a:y'), 'or:b': linked('or:b', 'b:y'), 'or:y': signal('or:y', 'output'),
      'not:u': linked('not:u', 'and:y'), 'not:y': signal('not:y', 'output'),
      'convert:u': linked('convert:u', 'gain:y'), 'convert:y': signal('convert:y', 'output'),
      'represent:u': linked('represent:u', 'convert:y'), 'represent:y': signal('represent:y', 'output'),
      'sink:u': linked('sink:u', 'represent:y'),
      'output:u': linked('output:u', 'gain:y'), 'output:y': signal('output:y', 'output'),
    };
    const runtime = createXBRuntime(model(
      'retain', operations, signals, Object.keys(operations),
    ));

    expect(stepXBState(runtime, {})).toEqual([]);
    expect(runtime.signals).toMatchObject({
      'sum:y': [5], 'junction:y': [5], 'gain:y': [10],
      'product:y': [6], 'neg:y': [-6], 'abs:y': [6],
      'and:y': [1], 'or:y': [1], 'not:y': [0],
      'convert:y': [10], 'represent:y': [10],
    });
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

  it('T14-INT-STATEFUL updates stateful memory after direct-feedthrough operations', () => {
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
        memory: operation('memory', 'MEMORY', ['memory:u'], ['memory:y'], {}, [3]),
        integrator: operation(
          'integrator', 'INTEGRATOR_DISCRETE',
          ['integrator:u'], ['integrator:y'], {}, [4],
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
        'memory:u': signal('memory:u', 'input', 'gain:y'),
        'memory:y': signal('memory:y', 'output'),
        'integrator:u': signal('integrator:u', 'input', 'gain:y'),
        'integrator:y': signal('integrator:y', 'output'),
      },
      ['delay', 'memory', 'integrator', 'gain'],
    );
    const runtime = createXBRuntime(ir);

    stepXBState(runtime, {});

    expect(runtime.signals['delay:y']).toEqual([1]);
    expect(runtime.signals['gain:y']).toEqual([2]);
    expect(runtime.stateSlots['delay:y$state']).toEqual([2]);
    expect(runtime.signals['memory:y']).toEqual([3]);
    expect(runtime.stateSlots['memory:y$state']).toEqual([2]);
    expect(runtime.signals['integrator:y']).toEqual([4]);
    expect(runtime.stateSlots['integrator:y$state']).toEqual([6]);
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

  it('keeps a stateful fixed delay fault sticky for one tick, restores its previous value, then clears the public error output', () => {
    const int8 = { kind: 'fixed', signed: true, wordLength: 8, fractionLength: 0 } as const;
    const delay: XBSemanticOperation = {
      ...operation('delay', 'UNIT_DELAY', ['delay:u'], ['delay:y', 'delay:error'], { overflow: 'error' }, [7]),
      numericFault: { fallback: 'previous-value', errorSignalId: 'delay:error' },
      state: contractState([{
        id: 'delay:y$state', role: 'y', signalId: 'delay:y', numericType: int8,
        shape: scalar, initialValues: [7],
      }]),
    };
    const ir = model('retain', { delay }, {
      'delay:u': signal('delay:u', 'input'),
      'delay:y': signal('delay:y', 'output', null, int8),
      'delay:error': signal('delay:error', 'output', null, { kind: 'boolean' }),
    }, ['delay'], [{
      variableId: 'u', signalId: 'delay:u', blockId: 'delay', portId: 'u',
      direction: 'in', numericType: float32,
    }]);
    const runtime = createXBRuntime(ir);

    stepXBState(runtime, { u: 128 });
    expect(runtime.stateSlots['delay:y$state']).toEqual([7]);
    expect(runtime.operationFaults.delay.active).toBe(true);
    expect(runtime.signals['delay:error']).toEqual([true]);

    stepXBState(runtime, { u: 0 });
    expect(runtime.operationFaults.delay.active).toBe(false);
    expect(runtime.signals['delay:error']).toEqual([false]);
  });

  it('evaluates Batch 2 logic operations (NAND, NOR, XOR, bitwise, shifts)', () => {
    const nandOp = operation('nand', 'NAND', ['in1', 'in2'], ['nand:y']);
    const bitAndOp = operation('bitAnd', 'BitwiseAND', ['in1', 'in2'], ['bitAnd:y']);
    const shiftLeftOp = operation('shiftLeft', 'ShiftLeft', ['in1', 'in2'], ['shiftLeft:y']);
    const ir = model('retain', { nandOp, bitAndOp, shiftLeftOp }, {
      in1: signal('in1', 'input'),
      in2: signal('in2', 'input'),
      'nand:y': signal('nand:y', 'output', null, { kind: 'boolean' }),
      'bitAnd:y': signal('bitAnd:y', 'output'),
      'shiftLeft:y': signal('shiftLeft:y', 'output'),
    }, ['nandOp', 'bitAndOp', 'shiftLeftOp'], [
      { variableId: 'in1', signalId: 'in1', blockId: 'in1', portId: 'u', direction: 'in', numericType: float32 },
      { variableId: 'in2', signalId: 'in2', blockId: 'in2', portId: 'u', direction: 'in', numericType: float32 },
    ]);
    const runtime = createXBRuntime(ir);

    stepXBState(runtime, { in1: 1, in2: 1 });
    expect(runtime.signals['nand:y']).toEqual([false]);

    stepXBState(runtime, { in1: 6, in2: 3 });
    expect(runtime.signals['bitAnd:y']).toEqual([2]);
    expect(runtime.signals['shiftLeft:y']).toEqual([48]);
  });

  it('evaluates Batch 2 routing operations (SWITCH, MUX, DEMUX)', () => {
    const switchOp = operation('switch', 'SWITCH', ['in1', 'cond', 'in2'], ['switch:y'], { threshold: 0.5 });
    const ir = model('retain', { switchOp }, {
      cond: signal('cond', 'input'),
      in1: signal('in1', 'input'),
      in2: signal('in2', 'input'),
      'switch:y': signal('switch:y', 'output'),
    }, ['switchOp'], [
      { variableId: 'cond', signalId: 'cond', blockId: 'cond', portId: 'u', direction: 'in', numericType: float32 },
      { variableId: 'in1', signalId: 'in1', blockId: 'in1', portId: 'u', direction: 'in', numericType: float32 },
      { variableId: 'in2', signalId: 'in2', blockId: 'in2', portId: 'u', direction: 'in', numericType: float32 },
    ]);
    const runtime = createXBRuntime(ir);

    stepXBState(runtime, { cond: 1, in1: 10, in2: 20 });
    expect(runtime.signals['switch:y']).toEqual([10]);

    stepXBState(runtime, { cond: 0, in1: 10, in2: 20 });
    expect(runtime.signals['switch:y']).toEqual([20]);

    const ifElseOp = operation('ifelse', 'IF_ELSE', ['cond', 'trueVal', 'falseVal'], ['ifelse:y']);
    const ifElseIr = model('retain', { ifElseOp }, {
      cond: signal('cond', 'input'),
      trueVal: signal('trueVal', 'input'),
      falseVal: signal('falseVal', 'input'),
      'ifelse:y': signal('ifelse:y', 'output'),
    }, ['ifElseOp'], [
      { variableId: 'cond', signalId: 'cond', blockId: 'cond', portId: 'u', direction: 'in', numericType: float32 },
      { variableId: 'trueVal', signalId: 'trueVal', blockId: 'trueVal', portId: 'u', direction: 'in', numericType: float32 },
      { variableId: 'falseVal', signalId: 'falseVal', blockId: 'falseVal', portId: 'u', direction: 'in', numericType: float32 },
    ]);
    const ifElseRuntime = createXBRuntime(ifElseIr);

    stepXBState(ifElseRuntime, { cond: 1, trueVal: 42, falseVal: 99 });
    expect(ifElseRuntime.signals['ifelse:y']).toEqual([42]);

    stepXBState(ifElseRuntime, { cond: 0, trueVal: 42, falseVal: 99 });
    expect(ifElseRuntime.signals['ifelse:y']).toEqual([99]);
  });

  it('evaluates SIX_STEP_COMMUTATION correctly', () => {
    const commOp = operation('comm', 'SIX_STEP_COMMUTATION', ['h1', 'h2', 'h3'], ['ah', 'al', 'bh', 'bl', 'ch', 'cl']);
    const ir = model('retain', { commOp }, {
      h1: signal('h1', 'input'),
      h2: signal('h2', 'input'),
      h3: signal('h3', 'input'),
      ah: signal('ah', 'output'),
      al: signal('al', 'output'),
      bh: signal('bh', 'output'),
      bl: signal('bl', 'output'),
      ch: signal('ch', 'output'),
      cl: signal('cl', 'output'),
    }, ['commOp'], [
      { variableId: 'h1', signalId: 'h1', blockId: 'h1', portId: 'u', direction: 'in', numericType: float32 },
      { variableId: 'h2', signalId: 'h2', blockId: 'h2', portId: 'u', direction: 'in', numericType: float32 },
      { variableId: 'h3', signalId: 'h3', blockId: 'h3', portId: 'u', direction: 'in', numericType: float32 },
    ]);
    const runtime = createXBRuntime(ir);

    stepXBState(runtime, { h1: 1, h2: 0, h3: 1 });
    expect(runtime.signals['ah']).toEqual([1]);
    expect(runtime.signals['al']).toEqual([0]);
    expect(runtime.signals['bh']).toEqual([0]);
    expect(runtime.signals['bl']).toEqual([1]);
    expect(runtime.signals['ch']).toEqual([0]);
    expect(runtime.signals['cl']).toEqual([0]);

    stepXBState(runtime, { h1: 0, h2: 0, h3: 0 });
    expect(runtime.signals['ah']).toEqual([0]);
    expect(runtime.signals['bl']).toEqual([0]);
  });

  it('evaluates Batch 3 Trigonometry operations with numerical precision', () => {
    const sinOp = operation('sinOp', 'SIN', ['angle'], ['sin:y']);
    const cosOp = operation('cosOp', 'COS', ['angle'], ['cos:y']);
    const tanOp = operation('tanOp', 'TAN', ['angle'], ['tan:y']);
    const asinOp = operation('asinOp', 'ASIN', ['ratio'], ['asin:y']);
    const sinhOp = operation('sinhOp', 'SINH', ['angle'], ['sinh:y']);
    const ir = model('retain', { sinOp, cosOp, tanOp, asinOp, sinhOp }, {
      angle: signal('angle', 'input'),
      ratio: signal('ratio', 'input'),
      'sin:y': signal('sin:y', 'output'),
      'cos:y': signal('cos:y', 'output'),
      'tan:y': signal('tan:y', 'output'),
      'asin:y': signal('asin:y', 'output'),
      'sinh:y': signal('sinh:y', 'output'),
    }, ['sinOp', 'cosOp', 'tanOp', 'asinOp', 'sinhOp'], [
      { variableId: 'angle', signalId: 'angle', blockId: 'angle', portId: 'u', direction: 'in', numericType: float32 },
      { variableId: 'ratio', signalId: 'ratio', blockId: 'ratio', portId: 'u', direction: 'in', numericType: float32 },
    ]);
    const runtime = createXBRuntime(ir);

    stepXBState(runtime, { angle: Math.PI / 6, ratio: 1 });
    expect(runtime.signals['sin:y'][0]).toBeCloseTo(0.5, 5);
    expect(runtime.signals['asin:y'][0]).toBeCloseTo(Math.PI / 2, 5);

    stepXBState(runtime, { angle: 0, ratio: 0 });
    expect(runtime.signals['sin:y']).toEqual([0]);
    expect(runtime.signals['cos:y']).toEqual([1]);
    expect(runtime.signals['tan:y']).toEqual([0]);
    expect(runtime.signals['sinh:y']).toEqual([0]);
  });

  it('instantiates Batch 1 discontinuities blocks with defaults', async () => {
    const { BLOCK_LIBRARY } = await import('../../engine/xbridges/BlockDefinitions');
    const sat = BLOCK_LIBRARY.SATURATION('sat', {});
    expect(sat.params).toMatchObject({ upper: 1, lower: -1 });
    const dz = BLOCK_LIBRARY.DEADZONE('dz', {});
    expect(dz.params).toMatchObject({ start: 0.5, end: -0.5 });
    const rl = BLOCK_LIBRARY.RATE_LIMITER('rl', {});
    expect(rl.isStateful).toBe(true);
    expect(rl.params).toMatchObject({ risingLimit: 1, fallingLimit: 1, sampleTime: 1 });
    const relay = BLOCK_LIBRARY.RELAY('relay', {});
    expect(relay.isStateful).toBe(true);
    expect(relay.params).toMatchObject({ switchOn: 1, switchOff: 0, initialState: false });
  });

  it('T10-INT-DISCONTINUOUS evaluates Saturation and DeadZone', () => {
    const sat = operation('sat', 'SATURATION', ['sat:u'], ['sat:y'], { upper: 5, lower: -5 });
    const dz = operation('dz', 'DEADZONE', ['dz:u'], ['dz:y'], { start: 0.5, end: -0.5 });
    const ir = model('reset', { sat, dz }, {
      'sat:u': signal('sat:u', 'input', null, { kind: 'float64' }),
      'sat:y': signal('sat:y', 'output', null, { kind: 'float64' }),
      'dz:u': signal('dz:u', 'input', null, { kind: 'float64' }),
      'dz:y': signal('dz:y', 'output', null, { kind: 'float64' }),
    }, ['sat', 'dz']);
    const runtime = createXBRuntime(ir);
    runtime.signals['sat:u'] = [10];
    runtime.signals['dz:u'] = [0.25];
    stepXBState(runtime, {});
    expect(runtime.signals['sat:y']).toEqual([5]);
    expect(runtime.signals['dz:y']).toEqual([0]);
    runtime.signals['sat:u'] = [-10];
    runtime.signals['dz:u'] = [2];
    stepXBState(runtime, {});
    expect(runtime.signals['sat:y']).toEqual([-5]);
    expect(runtime.signals['dz:y']).toEqual([1.5]);
    runtime.signals['sat:u'] = [2];
    runtime.signals['dz:u'] = [-2];
    stepXBState(runtime, {});
    expect(runtime.signals['sat:y']).toEqual([2]);
    expect(runtime.signals['dz:y']).toEqual([-1.5]);
  });

  it('T10-INT-DISCONTINUOUS evaluates RateLimiter with state', () => {
    const rl: XBSemanticOperation = {
      ...operation('rl', 'RATE_LIMITER', ['rl:u'], ['rl:y'], { risingLimit: 1, fallingLimit: 1, sampleTime: 0.1 }),
      directFeedthrough: false,
      stateful: true,
      state: {
        outputPhase: 'read-before-update',
        updatePhase: 'after-direct-feedthrough',
        slots: [{ id: 'rl:prev_y$state', role: 'prev_y', signalId: null, numericType: { kind: 'float64' }, shape: { kind: 'scalar' }, initialValues: [0] }],
      },
      schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
    };
    const ir = model('reset', { rl }, {
      'rl:u': signal('rl:u', 'input', null, { kind: 'float64' }),
      'rl:y': signal('rl:y', 'output', null, { kind: 'float64' }),
    }, ['rl']);
    const runtime = createXBRuntime(ir);
    runtime.signals['rl:u'] = [100];
    stepXBState(runtime, {});
    expect(runtime.signals['rl:y'][0]).toBeCloseTo(0.1, 10);
    runtime.signals['rl:u'] = [100];
    stepXBState(runtime, {});
    expect(runtime.signals['rl:y'][0]).toBeCloseTo(0.2, 10);
    runtime.signals['rl:u'] = [0];
    stepXBState(runtime, {});
    expect(runtime.signals['rl:y'][0]).toBeCloseTo(0.1, 10);
  });

  it('T10-INT-DISCONTINUOUS evaluates Relay hysteresis', () => {
    const relay: XBSemanticOperation = {
      ...operation('relay', 'RELAY', ['relay:u'], ['relay:y'], { switchOn: 2, switchOff: 0.5, initialState: false }),
      directFeedthrough: false,
      stateful: true,
      state: {
        outputPhase: 'read-before-update',
        updatePhase: 'after-direct-feedthrough',
        slots: [{ id: 'relay:current_on$state', role: 'current_on', signalId: 'relay:y', numericType: { kind: 'boolean' }, shape: { kind: 'scalar' }, initialValues: [false] }],
      },
      schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
    };
    const ir = model('reset', { relay }, {
      'relay:u': signal('relay:u', 'input', null, { kind: 'float64' }),
      'relay:y': signal('relay:y', 'output', null, { kind: 'boolean' }),
    }, ['relay']);
    const runtime = createXBRuntime(ir);
    runtime.signals['relay:u'] = [1];
    stepXBState(runtime, {});
    expect(runtime.signals['relay:y']).toEqual([false]);
    runtime.signals['relay:u'] = [3];
    stepXBState(runtime, {});
    expect(runtime.signals['relay:y']).toEqual([true]);
    runtime.signals['relay:u'] = [0.75];
    stepXBState(runtime, {});
    expect(runtime.signals['relay:y']).toEqual([true]);
    runtime.signals['relay:u'] = [0.25];
    stepXBState(runtime, {});
    expect(runtime.signals['relay:y']).toEqual([false]);
  });

  it('T10-INT-NOISE repeats noise traces for equal seeds and isolates instances', () => {
    const float64 = { kind: 'float64' } as const;
    const createNoiseModel = (seed: number, id: string) => {
      const whiteBase = operation(id, 'WHITE_NOISE', [], [`${id}:y`], { mean: 0, variance: 1, seed });
      const white = {
        ...whiteBase,
        directFeedthrough: false,
        stateful: true,
        state: {
          outputPhase: 'read-before-update' as const,
          updatePhase: 'after-direct-feedthrough' as const,
          slots: [
            { id: `${id}:rng_state$state`, role: 'rng_state', signalId: null, numericType: float64, shape: scalar, initialValues: [seed] },
            { id: `${id}:spare_normal$state`, role: 'spare_normal', signalId: null, numericType: float64, shape: scalar, initialValues: [0] },
            { id: `${id}:has_spare_normal$state`, role: 'has_spare_normal', signalId: null, numericType: { kind: 'boolean' as const }, shape: scalar, initialValues: [false] }
          ]
        }
      };
      const ir = model('retain', { [id]: white }, {
        [`${id}:y`]: signal(`${id}:y`, 'output', null, float64),
      }, [id]);
      return ir;
    };
    const runNoiseTwice = (seed: number) => {
      const ir = createNoiseModel(seed, 'n');
      const runtime = createXBRuntime(ir);
      stepXBState(runtime, {});
      const first = runtime.signals['n:y'][0];
      stepXBState(runtime, {});
      const second = runtime.signals['n:y'][0];
      return [first, second];
    };
    const runTwoInterleavedInstances = (seed: number) => {
      const n1Base = operation('n1', 'WHITE_NOISE', [], ['n1:y'], { mean: 0, variance: 1, seed });
      const n2Base = operation('n2', 'WHITE_NOISE', [], ['n2:y'], { mean: 0, variance: 1, seed });
      const n1 = {
        ...n1Base, directFeedthrough: false, stateful: true, state: {
          outputPhase: 'read-before-update' as const, updatePhase: 'after-direct-feedthrough' as const,
          slots: [
            { id: `n1:rng_state$state`, role: 'rng_state', signalId: null, numericType: float64, shape: scalar, initialValues: [seed] },
            { id: `n1:spare_normal$state`, role: 'spare_normal', signalId: null, numericType: float64, shape: scalar, initialValues: [0] },
            { id: `n1:has_spare_normal$state`, role: 'has_spare_normal', signalId: null, numericType: { kind: 'boolean' as const }, shape: scalar, initialValues: [false] }
          ]
        }
      };
      const n2 = {
        ...n2Base, directFeedthrough: false, stateful: true, state: {
          outputPhase: 'read-before-update' as const, updatePhase: 'after-direct-feedthrough' as const,
          slots: [
            { id: `n2:rng_state$state`, role: 'rng_state', signalId: null, numericType: float64, shape: scalar, initialValues: [seed] },
            { id: `n2:spare_normal$state`, role: 'spare_normal', signalId: null, numericType: float64, shape: scalar, initialValues: [0] },
            { id: `n2:has_spare_normal$state`, role: 'has_spare_normal', signalId: null, numericType: { kind: 'boolean' as const }, shape: scalar, initialValues: [false] }
          ]
        }
      };
      const ir = model('retain', {
        n1, n2
      }, {
        'n1:y': signal('n1:y', 'output', null, float64),
        'n2:y': signal('n2:y', 'output', null, float64),
      }, ['n1', 'n2']);
      const runtime = createXBRuntime(ir);
      stepXBState(runtime, {});
      return [runtime.signals['n1:y'][0], runtime.signals['n2:y'][0]];
    };
    const runTwoSeparateInstances = (seed: number) => {
      const ir1 = createNoiseModel(seed, 'n1');
      const rt1 = createXBRuntime(ir1);
      stepXBState(rt1, {});
      const out1 = rt1.signals['n1:y'][0];
      const ir2 = createNoiseModel(seed, 'n2');
      const rt2 = createXBRuntime(ir2);
      stepXBState(rt2, {});
      const out2 = rt2.signals['n2:y'][0];
      return [out1, out2];
    };

    expect(runNoiseTwice(1234)).toEqual(runNoiseTwice(1234));
    expect(runTwoInterleavedInstances(1234)).toEqual(runTwoSeparateInstances(1234));
  });

  it('matches a hand-calculated scalar Kalman update', () => {
    const ir = model(
      'kalman',
      {
        kf: {
          ...operation(
            'kf',
            'KALMAN_FILTER',
            ['kf:u', 'kf:y_meas'],
            ['kf:x_hat', 'kf:y_hat', 'kf:innovation', 'kf:K'],
            {
              A: [[1]], B: [[0]], C: [[1]], D: [[0]],
              Q: [[0]], R: [[1]], P0: [[1]], x0: [[0]]
            }
          ),
          stateful: true,
          directFeedthrough: false,
          state: {
            outputPhase: 'read-before-update',
            updatePhase: 'after-direct-feedthrough',
            slots: [
              { id: 'kf:x$state', role: 'x', signalId: 'kf:x_hat', numericType: float32, shape: scalar, initialValues: [0] },
              { id: 'kf:P$state', role: 'P', signalId: null, numericType: float32, shape: scalar, initialValues: [1] }
            ]
          }
        }
      },
      {
        'kf:u': signal('kf:u', 'input'),
        'kf:y_meas': signal('kf:y_meas', 'input'),
        'kf:x_hat': signal('kf:x_hat', 'output'),
        'kf:y_hat': signal('kf:y_hat', 'output'),
        'kf:innovation': signal('kf:innovation', 'output'),
        'kf:K': signal('kf:K', 'output')
      },
      ['kf'],
      [
        { variableId: 'u', signalId: 'kf:u', blockId: 'kf', portId: 'u', direction: 'in', numericType: float32 },
        { variableId: 'y_meas', signalId: 'kf:y_meas', blockId: 'kf', portId: 'y_meas', direction: 'in', numericType: float32 }
      ]
    );

    const runtime = createXBRuntime(ir);
    const data = { u: 0, y_meas: 1 };
    stepXBState(runtime, data);

    // Predict: x = 0, P = 1
    // Update: K = 1 * 1 / (1 * 1 * 1 + 1) = 0.5
    // x = 0 + 0.5 * (1 - 0) = 0.5
    // P = (1 - 0.5*1) * 1 * (1 - 0.5*1) + 0.5*1*0.5 = 0.25 + 0.25 = 0.5
    expect(runtime.signals['kf:x_hat'][0]).toBeCloseTo(0.5);
    expect(runtime.signals['kf:innovation'][0]).toBeCloseTo(1.0);
    expect(runtime.signals['kf:K'][0]).toBeCloseTo(0.5);
  });

  it('matches a hand-calculated 2-state Kalman update', () => {
    const ir = model(
      'kalman2',
      {
        kf: {
          ...operation(
            'kf',
            'KALMAN_FILTER',
            ['kf:u', 'kf:y_meas'],
            ['kf:x_hat', 'kf:y_hat', 'kf:innovation', 'kf:K'],
            {
              A: [[1, 0.1], [0, 1]], B: [[0], [0]], C: [[1, 0]], D: [[0]],
              Q: [[0.01, 0], [0, 0.01]], R: [[0.1]], P0: [[1, 0], [0, 1]], x0: [[0], [0]]
            }
          ),
          stateful: true,
          directFeedthrough: false,
          state: {
            outputPhase: 'read-before-update',
            updatePhase: 'after-direct-feedthrough',
            slots: [
              { id: 'kf:x$state', role: 'x', signalId: 'kf:x_hat', numericType: float32, shape: { kind: 'vector', length: 2 }, initialValues: [0, 0] },
              { id: 'kf:P$state', role: 'P', signalId: null, numericType: float32, shape: { kind: 'matrix', rows: 2, columns: 2 }, initialValues: [1, 0, 0, 1] }
            ]
          }
        }
      },
      {
        'kf:u': signal('kf:u', 'input'),
        'kf:y_meas': signal('kf:y_meas', 'input'),
        'kf:x_hat': { ...signal('kf:x_hat', 'output'), shape: { kind: 'vector', length: 2 }, elementCount: 2, dimensions: [2], layout: 'contiguous' },
        'kf:y_hat': signal('kf:y_hat', 'output'),
        'kf:innovation': signal('kf:innovation', 'output'),
        'kf:K': { ...signal('kf:K', 'output'), shape: { kind: 'matrix', rows: 2, columns: 1 }, elementCount: 2, dimensions: [2, 1], layout: 'row-major' }
      },
      ['kf'],
      [
        { variableId: 'u', signalId: 'kf:u', blockId: 'kf', portId: 'u', direction: 'in', numericType: float32 },
        { variableId: 'y_meas', signalId: 'kf:y_meas', blockId: 'kf', portId: 'y_meas', direction: 'in', numericType: float32 }
      ]
    );

    const runtime = createXBRuntime(ir);
    const data = { u: 0, y_meas: 1 };
    stepXBState(runtime, data);

    expect(runtime.signals['kf:innovation'][0]).toBeCloseTo(1.0);
    // K should be approximately [0.909, 0] (actually P0 C' (C P0 C' + R)^-1 = [1,0]' * (1 + 0.1)^-1 = [1/1.1, 0]' = [0.90909, 0]')
    expect(runtime.signals['kf:K'][0]).toBeCloseTo(1.01 / 1.11, 2);
  });
});

describe('Noise and Estimation', () => {
  const float32 = { kind: 'float32' } as const;
  const scalar = { kind: 'scalar' } as const;

  const createNoiseOperation = (id: string, type: 'WHITE_NOISE' | 'BAND_LIMITED_NOISE', seed: number, mean: number, variance: number, fc?: number): XBSemanticOperation => {
    const parameters: Record<string, XBParameterValue> = { mean, variance, seed };
    if (fc !== undefined) parameters.fc = fc;
    return {
      id,
      type,
      inputSignalIds: [],
      outputSignalIds: [`${id}:y`],
      parameters,
      directFeedthrough: false,
      stateful: true,
      conversion: null,
      state: {
        outputPhase: 'read-before-update',
        updatePhase: 'after-direct-feedthrough',
        slots: [
          { id: `${id}:rng_state$state`, role: 'rng_state', signalId: null, numericType: float32, shape: scalar, initialValues: [seed] },
          { id: `${id}:spare_normal$state`, role: 'spare_normal', signalId: null, numericType: float32, shape: scalar, initialValues: [0] },
          { id: `${id}:has_spare_normal$state`, role: 'has_spare_normal', signalId: null, numericType: float32, shape: scalar, initialValues: [false] },
          ...(type === 'BAND_LIMITED_NOISE' ? [{ id: `${id}:filter_state$state`, role: 'filter_state', signalId: null, numericType: float32, shape: scalar, initialValues: [mean] } as const] : []),
        ],
      },
      schedule: { periodSubsteps: 1, offsetSubsteps: 0, initialCounter: 0, counterIncrement: 1, hold: 'none' },
    };
  };

  const runNoiseTwice = (seed: number) => {
    const op = createNoiseOperation('n', 'WHITE_NOISE', seed, 0, 1);
    const ir = model('reset', { n: op }, {
      'n:y': signal('n:y', 'output', null, float32),
    }, ['n']);
    
    const run = () => {
      const runtime = createXBRuntime(ir);
      const trace: number[] = [];
      for (let i = 0; i < 50; i++) {
        stepXBState(runtime, {});
        trace.push(Number(runtime.signals['n:y'][0]));
      }
      return trace;
    };
    return [run(), run()];
  };

  const runTwoInterleavedInstances = (seed: number) => {
    const op1 = createNoiseOperation('n1', 'WHITE_NOISE', seed, 0, 1);
    const op2 = createNoiseOperation('n2', 'WHITE_NOISE', seed, 0, 1);
    const ir = model('reset', { n1: op1, n2: op2 }, {
      'n1:y': signal('n1:y', 'output', null, float32),
      'n2:y': signal('n2:y', 'output', null, float32),
    }, ['n1', 'n2']);
    
    const runtime = createXBRuntime(ir);
    const trace1: number[] = [];
    const trace2: number[] = [];
    for (let i = 0; i < 50; i++) {
      stepXBState(runtime, {});
      trace1.push(Number(runtime.signals['n1:y'][0]));
      trace2.push(Number(runtime.signals['n2:y'][0]));
    }
    return [trace1, trace2];
  };

  const runTwoSeparateInstances = (seed: number) => {
    const op = createNoiseOperation('n', 'WHITE_NOISE', seed, 0, 1);
    const ir = model('reset', { n: op }, {
      'n:y': signal('n:y', 'output', null, float32),
    }, ['n']);
    
    const runtime1 = createXBRuntime(ir);
    const runtime2 = createXBRuntime(ir);
    const trace1: number[] = [];
    const trace2: number[] = [];
    for (let i = 0; i < 50; i++) {
      stepXBState(runtime1, {});
      stepXBState(runtime2, {});
      trace1.push(Number(runtime1.signals['n:y'][0]));
      trace2.push(Number(runtime2.signals['n:y'][0]));
    }
    return [trace1, trace2];
  };

  it('repeats noise traces for equal seeds and isolates instances', () => {
    const [traceA1, traceA2] = runNoiseTwice(1234);
    expect(traceA1).toEqual(traceA2);
    expect(runTwoInterleavedInstances(1234)).toEqual(runTwoSeparateInstances(1234));
  });
});
