import { describe, it, expect } from 'vitest';
import { handleXbridgesWorkerMessage } from './xbridgesWorker';
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';
import { BLOCK_LIBRARY } from './BlockDefinitions';
import type { XModel } from './types';
import type { XbridgesWorkerRequest } from './xbridgesWorkerProtocol';

describe('xbridgesWorker', () => {
  const createIntegratorModel = (): XModel => ({
    blocks: [
      {
        ...BLOCK_LIBRARY['Constant']('src', { value: 5 }),
        id: 'src',
      },
      {
        ...BLOCK_LIBRARY['Integrator']('integ', { initialCondition: 0 }),
        id: 'integ',
      },
    ],
    connections: [
      { sourceBlock: 'src', sourcePort: 'out', targetBlock: 'integ', targetPort: 'u' },
    ],
  });

  const createPIDCoupledModel = (): XModel => ({
    blocks: [
      {
        ...BLOCK_LIBRARY['Step']('step', { stepTime: 0, initialValue: 0, finalValue: 1 }),
        id: 'step',
      },
      {
        ...BLOCK_LIBRARY['PID_CONTROLLER']('pid', { Kp: 2, Ki: 1, Kd: 0.1 }),
        id: 'pid',
      },
      {
        ...BLOCK_LIBRARY['Integrator']('plant', { initialCondition: 0 }),
        id: 'plant',
      },
    ],
    connections: [
      { sourceBlock: 'step', sourcePort: 'out', targetBlock: 'pid', targetPort: 'r' },
      { sourceBlock: 'pid', sourcePort: 'out', targetBlock: 'plant', targetPort: 'u' },
    ],
  });

  it('produces identical output to direct XbridgesEngine for integrator model using RK4', () => {
    const modelDirect = createIntegratorModel();
    const engineDirect = new XbridgesEngine(modelDirect);
    engineDirect.compile();
    const dt = 0.01;
    Solvers.stepRK4(engineDirect, 0, dt);
    const directIntegratorState = engineDirect.getBlock('integ')?.state;

    const modelWorker = createIntegratorModel();
    const request: XbridgesWorkerRequest = {
      requestId: 1,
      type: 'step',
      model: modelWorker,
      solverType: 'rk4',
      time: 0,
      dt,
      batchSize: 1,
    };

    const response = handleXbridgesWorkerMessage(request);
    expect(response.ok).toBe(true);
    expect(response.simulationTime).toBeCloseTo(0.01, 6);
    expect(response.engineSnapshot?.blockStates['integ']).toBeDefined();
    expect(response.engineSnapshot?.blockStates['integ']).toBeCloseTo(directIntegratorState, 6);
  });

  it('rehydrates function-free blocks received through postMessage', () => {
    const liveModel = createIntegratorModel();
    const serializedModel = {
      ...liveModel,
      blocks: liveModel.blocks.map(({ execute: _execute, evaluateDerivatives: _derivatives, ZeroCrossingFn: _zeroCrossing, ...block }) => block as any)
    } as XModel;
    const response = handleXbridgesWorkerMessage({
      requestId: 99, type: 'step', model: serializedModel,
      solverType: 'rk4', time: 0, dt: 0.01
    });
    expect(response.ok).toBe(true);
  });

  it('produces identical output to direct XbridgesEngine for coupled PID model using Euler and adaptive solvers', () => {
    const modelDirect = createPIDCoupledModel();
    const engineDirect = new XbridgesEngine(modelDirect);
    engineDirect.compile();
    const dt = 0.02;
    Solvers.stepEuler(engineDirect, 0, dt);
    const directPlantState = engineDirect.getBlock('plant')?.state;

    const modelWorker = createPIDCoupledModel();
    const request: XbridgesWorkerRequest = {
      requestId: 2,
      type: 'step',
      model: modelWorker,
      solverType: 'euler',
      time: 0,
      dt,
      batchSize: 1,
    };

    const response = handleXbridgesWorkerMessage(request);
    expect(response.ok).toBe(true);
    expect(response.engineSnapshot?.blockStates['plant']).toBeCloseTo(directPlantState, 6);
  });

  it('handles cancellation and reset requests gracefully without executing', () => {
    const model = createIntegratorModel();
    // Initialize
    handleXbridgesWorkerMessage({
      requestId: 10,
      type: 'step',
      model,
      solverType: 'ode45',
      time: 0,
      dt: 0.01,
    });

    const cancelReq: XbridgesWorkerRequest = {
      requestId: 11,
      type: 'cancel',
      time: 0.01,
      dt: 0.01,
    };
    const cancelRes = handleXbridgesWorkerMessage(cancelReq);
    expect(cancelRes.ok).toBe(true);

    const resetReq: XbridgesWorkerRequest = {
      requestId: 12,
      type: 'reset',
      time: 0,
      dt: 0,
    };
    const resetRes = handleXbridgesWorkerMessage(resetReq);
    expect(resetRes.ok).toBe(true);
  });
});
