import { describe, expect, it } from 'vitest';
import { compileEkfVectorExpressions } from './xbEkfExpressions';

describe('compileEkfVectorExpressions', () => {
  const symbols = new Set(['x0', 'x1', 'u0', 'dt']);
  const limits = { maxNodes: 50, maxExpressions: 10 };

  it('accepts bounded arithmetic and rejects calls or unknown symbols', () => {
    expect(compileEkfVectorExpressions(['x0 + dt*u0', 'sin(x1)'], symbols, limits)).toHaveLength(2);
    expect(() => compileEkfVectorExpressions(['import("fs")'], symbols, limits)).toThrow();
    expect(() => compileEkfVectorExpressions(['x99'], symbols, limits)).toThrow();
  });

  it('rejects too many expressions', () => {
    const exprs = Array(15).fill('x0');
    expect(() => compileEkfVectorExpressions(exprs, symbols, limits)).toThrow();
  });

  it('rejects too many AST nodes', () => {
    const expr = 'x0 + '.repeat(50) + 'x0';
    expect(() => compileEkfVectorExpressions([expr], symbols, limits)).toThrow();
  });
});
import { createXBRuntime, stepXBState } from './xbInterpreter';
import type { XBSemanticOperation } from './xbSemanticModel';
import type { XBNumericType } from './xbNumeric';

const float32: XBNumericType = { kind: 'float', bytes: 4, name: 'float32', precision: 'float32' } as any;
const scalar: any = { kind: 'scalar' };

import type { XBOwnerState } from './smSemanticModel';

const defaultOwnerState: XBOwnerState = {
  stateId: 'controller',
  stateName: 'controller',
  cIndexSymbol: 'SM_ST_CONTROLLER_IDX',
  numericIndex: 0,
};

const operation = (
  id: string,
  type: string,
  inputSignalIds: string[],
  outputSignalIds: string[],
  parameters: XBSemanticOperation['parameters'] = {},
): XBSemanticOperation => ({
  id,
  type,
  inputSignalIds,
  outputSignalIds,
  parameters,
  stateful: false,
  directFeedthrough: true,
  schedule: { hold: 'none', periodSubsteps: 1, offsetSubsteps: 0, counterIncrement: 1, initialCounter: 0 },
  conversion: null,
  state: null,
  numericFault: { fallback: 'zero', errorSignalId: null },
});

const signal = (
  id: string,
  direction: 'input' | 'output',
  sourceSignalId: string | null = null,
  numericType: XBNumericType = float32,
): import('./xbSemanticModel').XBSemanticSignal => {
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

const model = (
  memory: 'reset' | 'retain',
  operations: import('./xbSemanticModel').XBSemanticModel['operations'],
  signals: import('./xbSemanticModel').XBSemanticModel['signals'],
  executionOrder: readonly string[],
  mappings: import('./xbSemanticModel').XBSemanticModel['mappings'] = [],
): import('./xbSemanticModel').XBSemanticModel => ({
  stateId: 'controller',
  ownerState: defaultOwnerState,
  executionOrder,
  operations,
  signals,
  mappings,
  solver: { kind: 'euler', stepSeconds: 1.0, substepsPerTick: 1 },
  policy: { memory, numericFault: 'escalate' },
});

describe('EXTENDED_KALMAN_FILTER interpreter', () => {
  it('matches a nonlinear scalar case with finite differences', () => {
    const ir = model(
      'reset',
      {
        ekf: {
          ...operation(
            'ekf',
            'EXTENDED_KALMAN_FILTER',
            ['ekf:u', 'ekf:y_meas'],
            ['ekf:x_hat', 'ekf:y_hat', 'ekf:innovation', 'ekf:K'],
            {
              f: ['x1 + dt * u1'],
              h: ['x1 * x1'],
              fAst: compileEkfVectorExpressions(['x1 + dt * u1'], new Set(['x1', 'u1', 'dt']), { maxNodes: 100, maxExpressions: 10 }),
              hAst: compileEkfVectorExpressions(['x1 * x1'], new Set(['x1', 'u1', 'dt']), { maxNodes: 100, maxExpressions: 10 }),
              Q: [[0.01]], R: [[0.1]], P0: [[1]], x0: [[2]]
            }
          ),
          stateful: true,
          directFeedthrough: false,
          state: {
            outputPhase: 'read-before-update',
            updatePhase: 'after-direct-feedthrough',
            slots: [
              { id: 'ekf:x$state', role: 'x', signalId: 'ekf:x_hat', numericType: float32, shape: scalar, initialValues: [2] },
              { id: 'ekf:P$state', role: 'P', signalId: null, numericType: float32, shape: scalar, initialValues: [1] }
            ]
          }
        }
      },
      {
        'ekf:u': signal('ekf:u', 'input'),
        'ekf:y_meas': signal('ekf:y_meas', 'input'),
        'ekf:x_hat': signal('ekf:x_hat', 'output'),
        'ekf:y_hat': signal('ekf:y_hat', 'output'),
        'ekf:innovation': signal('ekf:innovation', 'output'),
        'ekf:K': signal('ekf:K', 'output')
      },
      ['ekf'],
      [
        { variableId: 'u', signalId: 'ekf:u', blockId: 'ekf', portId: 'u', direction: 'in', numericType: float32 },
        { variableId: 'y_meas', signalId: 'ekf:y_meas', blockId: 'ekf', portId: 'y_meas', direction: 'in', numericType: float32 }
      ]
    );

    const runtime = createXBRuntime(ir);
    
    console.log("TEST SOLVER:", runtime.ir.solver);
    console.log("TEST EKF STATEFUL:", runtime.ir.operations['ekf'].stateful);
    console.log("TEST EKF SCHEDULE:", runtime.ir.operations['ekf'].schedule);
    
    // Initial state: x0 = 2, P0 = 1
    // f(x, u) = x0 + dt * u0
    // dt = 1 (default runtime period for discrete test if not specified, wait, the period is 1 by default, but what is dt? 
    // Wait, dt comes from the schedule, which is 1 if counterIncrement is 1 and no specific time is given).
    // Let's assume dt = 1 for the test context (since time logic sets dt variable).
    
    const data = { u: 1, y_meas: 8 };
    
    console.log("executionOrder", runtime.ir.executionOrder);
    for (const operationId of runtime.ir.executionOrder) {
      const operation = runtime.ir.operations[operationId];
      console.log("Operation", operationId, "stateful:", operation.stateful);
      const period = operation.schedule.periodSubsteps;
      const current = runtime.scheduleCounters[operation.id] ?? 0;
      const isScheduled = period === 0 || current === operation.schedule.offsetSubsteps;
      console.log("scheduled:", isScheduled, "period:", period, "current:", current, "offset:", operation.schedule.offsetSubsteps);
    }
    
    stepXBState(runtime, data);
    
    // Predict:
    // x_pred = 2 + 1 * 1 = 3
    // A = df/dx = 1
    // P_pred = 1 * 1 * 1 + 0.01 = 1.01
    // 
    // Update:
    // y_hat = h(x_pred) = 3 * 3 = 9
    // C = dh/dx = 2 * x_pred = 6
    // innovation = 8 - 9 = -1
    // 
    // Gain:
    // S = C * P_pred * C' + R = 6 * 1.01 * 6 + 0.1 = 36.36 + 0.1 = 36.46
    // K = P_pred * C' / S = 1.01 * 6 / 36.46 = 6.06 / 36.46 = 0.1662
    // 
    // x_hat = x_pred + K * innovation = 3 + 0.1662 * (-1) = 2.8338

    expect(runtime.signals['ekf:innovation'][0]).toBeCloseTo(-1);
    expect(runtime.signals['ekf:K'][0]).toBeCloseTo(0.1662, 3);
    expect(runtime.signals['ekf:x_hat'][0]).toBeCloseTo(2.8338, 3);
  });
});

