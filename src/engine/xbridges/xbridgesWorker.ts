import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';
import { AdaptiveSolver } from './AdaptiveSolver';
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
        workerEngine.patchBlockParams(id, params);
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
    let currentTime = request.time;

    for (let i = 0; i < batchSize; i++) {
      if (solver === 'rk4') Solvers.stepRK4(workerEngine, currentTime, dt);
      else if (solver === 'ode2') Solvers.stepODE2(workerEngine, currentTime, dt);
      else if (solver === 'ode3') Solvers.stepODE3(workerEngine, currentTime, dt);
      else if (solver === 'ode5') Solvers.stepODE5(workerEngine, currentTime, dt);
      else if (solver === 'ode23') AdaptiveSolver.stepODE23(workerEngine, currentTime, dt);
      else if (solver === 'ode45') AdaptiveSolver.stepODE45(workerEngine, currentTime, dt);
      else Solvers.stepEuler(workerEngine, currentTime, dt);

      currentTime += dt;
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
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<XbridgesWorkerRequest>) => {
    const response = handleXbridgesWorkerMessage(event.data);
    (self as any).postMessage(response);
  };
}
