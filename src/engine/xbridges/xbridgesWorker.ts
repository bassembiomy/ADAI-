import { XbridgesEngine } from './XbridgesEngine';
import { liveStep } from './liveStep';
import type { SolverOptions } from './types';
import type {
  XbridgesWorkerRequest,
  XbridgesWorkerResponse,
  XbridgesEngineSnapshot,
} from './xbridgesWorkerProtocol';

let workerEngine: XbridgesEngine | null = null;
let currentSolverType = 'rk4';

function serializeEngineSnapshot(engine: XbridgesEngine, time: number): XbridgesEngineSnapshot {
  const blockStates: Record<string, any> = {};
  for (const block of engine.executionOrder) {
    if (block.state !== undefined) {
      blockStates[block.id] = block.state;
    }
  }

  return {
    time,
    blockStates,
  };
}

function collectOutputValues(engine: XbridgesEngine): Record<string, any> {
  const outputValues: Record<string, any> = {};
  for (const block of engine.executionOrder) {
    for (const out of block.outputs) {
      const val = engine.getSignalValue(block.id, out.id);
      if (val !== undefined) {
        outputValues[`${block.id}.${out.id}`] = val;
      }
    }
  }
  return outputValues;
}

export function handleXbridgesWorkerMessage(request: XbridgesWorkerRequest): XbridgesWorkerResponse {
  const { requestId, type } = request;

  if (type === 'cancel') {
    return {
      requestId,
      ok: true,
      simulationTime: request.time ?? 0,
    };
  }

  if (type === 'reset') {
    workerEngine = null;
    return {
      requestId,
      ok: true,
      simulationTime: 0,
    };
  }

  try {
    if (request.model) {
      workerEngine = new XbridgesEngine(request.model);
      // Solver options (fixed step, solver type) drive the solver-specific compile checks.
      if (request.solverOptions) workerEngine.options = request.solverOptions as SolverOptions;
      const compileDiagnostics = workerEngine.compile(request.time || 0);
      const hasErrors = compileDiagnostics.some(d => d.severity === 'error');
      if (hasErrors) {
        return {
          requestId,
          ok: false,
          simulationTime: request.time || 0,
          diagnostics: compileDiagnostics,
          error: {
            message: compileDiagnostics.find(d => d.severity === 'error')?.message || 'Model compilation failed',
          },
        };
      }
    }

    if (!workerEngine) {
      return {
        requestId,
        ok: false,
        simulationTime: request.time || 0,
        error: { message: 'X-Bridges worker engine is not initialized' },
      };
    }

    // Dynamic parameter tuning
    if (request.paramUpdates) {
      for (const [id, params] of Object.entries(request.paramUpdates)) {
        // An Inport driven by a State Machine variable takes 'value' from inportOverrides below.
        const overridden = request.inportOverrides && Object.prototype.hasOwnProperty.call(request.inportOverrides, id);
        workerEngine.applyParameterUpdates(id, overridden
          ? Object.fromEntries(Object.entries(params as Record<string, unknown>).filter(([key]) => key !== 'value'))
          : params);
      }
    }

    // Inport signal value overrides (e.g. state machine variables)
    if (request.inportOverrides) {
      for (const [id, val] of Object.entries(request.inportOverrides)) {
        workerEngine.setSignalValue(id, 'out', val);
        const block = workerEngine.getBlock(id);
        if (block && block.params) {
          block.params.value = val;
        }
      }
    }

    // Restore state from snapshot if provided
    if (request.engineSnapshot?.blockStates) {
      for (const [id, state] of Object.entries(request.engineSnapshot.blockStates)) {
        const block = workerEngine.getBlock(id);
        if (block) {
          block.state = state;
        }
      }
    }

    const engineRunId = request.engineRunId || (type === 'compile' ? `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : undefined);

    if (type === 'compile') {
      return {
        requestId,
        ok: true,
        simulationTime: request.time || 0,
        engineRunId,
        diagnostics: workerEngine.diagnostics,
        engineSnapshot: serializeEngineSnapshot(workerEngine, request.time || 0),
        outputValues: collectOutputValues(workerEngine),
      };
    }

    const solver = request.solverType || currentSolverType || 'rk4';
    currentSolverType = solver;

    const dt = request.dt;
    const batchSize = Math.max(1, request.batchSize || 1);
    // Canvas time base (plan 5.1): step i of the request starts at time + i * dt, not at an accumulated sum.
    let stepsTaken = 0;
    let stepFailed = false;

    for (let i = 0; i < batchSize && !workerEngine.hasFatalError(); i++) {
      // One dispatch for canvas, worker and batch (liveStep.ts); an unknown solver name is refused there.
      if (!liveStep(workerEngine, solver, request.time + i * dt, dt)) { stepFailed = true; break; }
      stepsTaken++;
    }
    let currentTime = request.time + stepsTaken * dt;

    if (request.finalOutputs && !stepFailed && !workerEngine.hasFatalError()) {
      // The step reaches the stop time: the final sample is logged exactly at the stop time (as the main-thread path does).
      const stopTime = workerEngine.options?.stopTime;
      if (typeof stopTime === 'number' && Number.isFinite(stopTime) && Math.abs(stopTime - currentTime) <= 1e-9 * Math.max(1, Math.abs(stopTime))) {
        currentTime = stopTime;
      }
      // Outputs and logging at the final time (a Scope logs in its discrete update), no integration.
      workerEngine.computeOutputs(currentTime);
      workerEngine.updateDiscreteStates(currentTime);
    }

    if (stepFailed || workerEngine.hasFatalError()) {
      // A block raised an exception (BLOCK_RUNTIME_FAULT) or the solver could not take the step: the run stops, the
      // caller marks the simulation Failed.
      return {
        requestId,
        ok: false,
        simulationTime: currentTime,
        engineRunId,
        diagnostics: workerEngine.diagnostics,
        error: {
          message: workerEngine.diagnostics.find(d => d.code === 'BLOCK_RUNTIME_FAULT')?.message
            ?? workerEngine.diagnostics.find(d => d.severity === 'error')?.message
            ?? 'A block raised an exception',
        },
      };
    }

    return {
      requestId,
      ok: true,
      simulationTime: currentTime,
      engineRunId,
      engineSnapshot: serializeEngineSnapshot(workerEngine, currentTime),
      outputValues: collectOutputValues(workerEngine),
      diagnostics: workerEngine.diagnostics,
    };
  } catch (err: any) {
    return {
      requestId,
      ok: false,
      simulationTime: request.time || 0,
      error: {
        message: err?.message || 'X-Bridges simulation step failed',
        stack: err?.stack,
      },
    };
  }
}

// Attach listener in Web Worker environment
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<XbridgesWorkerRequest>) => {
    const response = handleXbridgesWorkerMessage(event.data);
    (self as any).postMessage(response);
  };
}
