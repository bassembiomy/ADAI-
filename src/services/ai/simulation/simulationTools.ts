import { EngineeringDomain, StructuredDiagnostic } from '../contracts/engineeringModel';
import { EngineeringModelAdapter } from '../adapters/engineeringModelAdapter';
import { ModelValidator } from '../validation/modelValidation';
import { XbridgesEngine } from '../../../engine/xbridges/XbridgesEngine';
import { Solvers } from '../../../engine/xbridges/Solvers';
import type { XModel, XBlock } from '../../../engine/xbridges/types';

export type SimulationStatus =
  | 'IDLE'
  | 'COMPILING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'FAILED'
  | 'UNSUPPORTED';

export interface SimulationCapabilities {
  readonly domain: EngineeringDomain;
  readonly supportsCompilation: boolean;
  readonly supportsSimulation: boolean;
  readonly supportsStop: boolean;
  readonly supportedSolvers: readonly string[];
}

export interface SimulationResult {
  readonly status: SimulationStatus;
  readonly domain: EngineeringDomain;
  readonly isSupported: boolean;
  readonly validationPassed: boolean;
  readonly executionTimeMs: number;
  readonly engineRunId?: string;
  readonly timeVector?: number[];
  readonly signals?: Record<string, number[]>;
  readonly metrics?: Record<string, number>;
  readonly diagnostics: StructuredDiagnostic[];
  readonly error?: string;
}

export interface SimulationRunOptions {
  domain: EngineeringDomain;
  tSpan?: [number, number];
  stepSize?: number;
  timeoutMs?: number;
  solver?: 'euler' | 'rk4' | 'ode2' | 'ode3' | 'ode5' | 'ode23' | 'ode45';
  abortSignal?: AbortSignal;
  customSimulator?: (model: EngineeringModelAdapter, signal?: AbortSignal) => Promise<any>;
}

export function convertModelAdapterToXModel(
  adapter: EngineeringModelAdapter | { getAllBlocks(): any[]; getAllConnections(): any[] }
): XModel {
  const blocks = adapter.getAllBlocks();
  const connections = adapter.getAllConnections();

  const xBlocks: XBlock[] = blocks.map(b => {
    let params: Record<string, any> = {};
    if (Array.isArray(b.parameters)) {
      for (const p of b.parameters) {
        if (p && p.parameterName !== undefined) {
          params[p.parameterName] = p.value;
        }
      }
    } else if (b.parameters && typeof b.parameters === 'object') {
      params = { ...b.parameters };
    }

    return {
      id: b.id,
      type: b.blockDefinitionId,
      label: b.name || b.id,
      params,
      inputs: [],
      outputs: []
    } as any as XBlock;
  });

  const xConnections = connections.map(c => ({
    sourceBlock: c.fromBlockId,
    sourcePort: c.fromPortId,
    targetBlock: c.toBlockId,
    targetPort: c.toPortId
  }));

  return {
    blocks: xBlocks,
    connections: xConnections
  };
}

export class SimulationTools {
  public static getCapabilities(domain: EngineeringDomain): SimulationCapabilities {
    switch (domain) {
      case 'xbridges':
        return Object.freeze({
          domain: 'xbridges',
          supportsCompilation: true,
          supportsSimulation: true,
          supportsStop: true,
          supportedSolvers: Object.freeze(['euler', 'rk4', 'ode2', 'ode3', 'ode5', 'ode23', 'ode45'])
        });
      case 'vlab':
        return Object.freeze({
          domain: 'vlab',
          supportsCompilation: true,
          supportsSimulation: true,
          supportsStop: true,
          supportedSolvers: Object.freeze(['euler', 'rk4', 'vlab_solver'])
        });
      case 'sysml':
      default:
        return Object.freeze({
          domain: 'sysml',
          supportsCompilation: false,
          supportsSimulation: false,
          supportsStop: false,
          supportedSolvers: Object.freeze([])
        });
    }
  }

  public static async compileModel(
    adapter: EngineeringModelAdapter,
    domain: EngineeringDomain
  ): Promise<{ success: boolean; diagnostics: StructuredDiagnostic[]; engine?: XbridgesEngine; error?: string }> {
    const caps = this.getCapabilities(domain);
    if (!caps.supportsCompilation) {
      return {
        success: false,
        diagnostics: [{
          category: 'COMPILE',
          code: 'UNSUPPORTED_COMPILE_DOMAIN',
          severity: 'ERROR',
          message: `Model compilation is not supported in the '${domain}' domain.`
        }],
        error: `Domain '${domain}' does not advertise compilation capability.`
      };
    }

    const blocks = adapter.getAllBlocks();
    if (blocks.length === 0) {
      return {
        success: false,
        diagnostics: [{
          category: 'COMPILE',
          code: 'EMPTY_MODEL_CANNOT_COMPILE',
          severity: 'ERROR',
          message: 'Cannot compile empty model graph.'
        }],
        error: 'Cannot compile empty model.'
      };
    }

    if (domain === 'xbridges') {
      try {
        const xModel = convertModelAdapterToXModel(adapter);
        const engine = new XbridgesEngine(xModel);
        const compileDiags = engine.compile(0);
        const errorDiags = compileDiags.filter(d => d.severity === 'error');
        const structuredDiags: StructuredDiagnostic[] = compileDiags.map(d => ({
          category: 'COMPILE',
          code: d.code || 'COMPILE_ERROR',
          severity: d.severity === 'error' ? 'ERROR' : d.severity === 'warning' ? 'WARNING' : 'INFO',
          message: d.message,
          entityId: d.blockIds?.[0]
        }));

        if (errorDiags.length > 0) {
          return {
            success: false,
            diagnostics: structuredDiags,
            error: errorDiags[0].message
          };
        }

        return {
          success: true,
          diagnostics: structuredDiags,
          engine
        };
      } catch (err: any) {
        return {
          success: false,
          diagnostics: [{
            category: 'COMPILE',
            code: 'COMPILE_EXCEPTION',
            severity: 'ERROR',
            message: err?.message || 'X-Bridges engine compile exception'
          }],
          error: err?.message || 'Compile exception'
        };
      }
    }

    return {
      success: true,
      diagnostics: []
    };
  }

  public static async simulateModel(
    adapter: EngineeringModelAdapter,
    options: SimulationRunOptions
  ): Promise<SimulationResult> {
    const startTime = Date.now();
    const domain = options.domain;
    const caps = this.getCapabilities(domain);

    // 1. Explicitly check domain capability
    if (!caps.supportsSimulation) {
      return {
        status: 'UNSUPPORTED',
        domain,
        isSupported: false,
        validationPassed: true,
        executionTimeMs: Date.now() - startTime,
        diagnostics: [{
          category: 'SIMULATION',
          code: 'UNSUPPORTED_SIMULATION_DOMAIN',
          severity: 'ERROR',
          message: `Simulation capability is not supported for domain '${domain}'.`
        }],
        error: `Domain '${domain}' does not advertise dynamic simulation capability.`
      };
    }

    // 2. Model Validation
    const valResult = ModelValidator.validate(adapter);
    if (!valResult.passed) {
      return {
        status: 'FAILED',
        domain,
        isSupported: true,
        validationPassed: false,
        executionTimeMs: Date.now() - startTime,
        diagnostics: valResult.diagnostics,
        error: `Pre-simulation validation failed: ${valResult.diagnostics[0]?.message || 'Invalid model'}`
      };
    }

    // 3. Early Abort Check
    if (options.abortSignal?.aborted) {
      return {
        status: 'CANCELLED',
        domain,
        isSupported: true,
        validationPassed: true,
        executionTimeMs: Date.now() - startTime,
        diagnostics: [{
          category: 'SIMULATION',
          code: 'SIMULATION_CANCELLED_EARLY',
          severity: 'INFO',
          message: 'Simulation was cancelled before initiation.'
        }],
        error: 'Simulation cancelled.'
      };
    }

    // 4. Compile check for xbridges
    let compiledEngine: XbridgesEngine | undefined;
    if (domain === 'xbridges') {
      const compileRes = await this.compileModel(adapter, domain);
      if (!compileRes.success) {
        return {
          status: 'FAILED',
          domain,
          isSupported: true,
          validationPassed: true,
          executionTimeMs: Date.now() - startTime,
          diagnostics: compileRes.diagnostics,
          error: `Model compilation failed: ${compileRes.error || compileRes.diagnostics[0]?.message}`
        };
      }
      compiledEngine = compileRes.engine;
    }

    // 5. Run execution with timeout and cancellation protection
    const timeoutMs = options.timeoutMs ?? 5000;

    try {
      const simPromise = options.customSimulator
        ? options.customSimulator(adapter, options.abortSignal)
        : this.runRealEngineSimulation(adapter, options, compiledEngine);

      const timeoutPromise = new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('SIMULATION_TIMEOUT')), timeoutMs);
        if (options.abortSignal) {
          options.abortSignal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('SIMULATION_ABORTED'));
          });
        }
      });

      const rawResult: any = await Promise.race([simPromise, timeoutPromise]);

      if (typeof rawResult?.engineRunId !== 'string' || !rawResult.engineRunId.trim()) {
        throw new Error('Simulator returned no verifiable engine run identifier');
      }

      return {
        status: 'COMPLETED',
        domain,
        isSupported: true,
        validationPassed: true,
        executionTimeMs: Date.now() - startTime,
        engineRunId: rawResult.engineRunId,
        timeVector: rawResult?.timeVector,
        signals: rawResult?.signals,
        metrics: rawResult?.metrics,
        diagnostics: []
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      if (err.message === 'SIMULATION_TIMEOUT') {
        return {
          status: 'TIMEOUT',
          domain,
          isSupported: true,
          validationPassed: true,
          executionTimeMs: duration,
          diagnostics: [{
            category: 'SIMULATION',
            code: 'SOLVER_TIMEOUT',
            severity: 'ERROR',
            message: `Simulation exceeded maximum allowable timeout of ${timeoutMs}ms.`
          }],
          error: `Solver timed out after ${timeoutMs}ms.`
        };
      }

      if (err.message === 'SIMULATION_ABORTED' || options.abortSignal?.aborted) {
        return {
          status: 'CANCELLED',
          domain,
          isSupported: true,
          validationPassed: true,
          executionTimeMs: duration,
          diagnostics: [{
            category: 'SIMULATION',
            code: 'SIMULATION_CANCELLED',
            severity: 'INFO',
            message: 'Simulation was halted per cancellation request.'
          }],
          error: 'Simulation cancelled by user.'
        };
      }

      return {
        status: 'FAILED',
        domain,
        isSupported: true,
        validationPassed: true,
        executionTimeMs: duration,
        diagnostics: [{
          category: 'SIMULATION',
          code: 'SOLVER_RUNTIME_EXCEPTION',
          severity: 'ERROR',
          message: err.message || 'Numerical solver failed during integration.'
        }],
        error: err.message || 'Solver failure'
      };
    }
  }

  private static async runRealEngineSimulation(
    adapter: EngineeringModelAdapter,
    options: SimulationRunOptions,
    engine?: XbridgesEngine
  ): Promise<{
    engineRunId: string;
    timeVector: number[];
    signals: Record<string, number[]>;
    metrics: Record<string, number>;
  }> {
    const signal = options.abortSignal;
    if (signal?.aborted) throw new Error('SIMULATION_ABORTED');

    let xEngine = engine;
    if (!xEngine) {
      const xModel = convertModelAdapterToXModel(adapter);
      xEngine = new XbridgesEngine(xModel);
      const compileDiags = xEngine.compile(0);
      const err = compileDiags.find(d => d.severity === 'error');
      if (err) {
        throw new Error(err.message || 'Model compilation failed');
      }
    }

    const tSpan = options.tSpan ?? [0, 0.02];
    const tStart = tSpan[0];
    const tStop = tSpan[1];
    const stepSize = options.stepSize ?? 0.001;
    const solverType = options.solver ?? 'rk4';
    const engineRunId = `xbr_run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const timeVector: number[] = [];
    const recordedSignals: Record<string, number[]> = {};

    const outputPorts: Array<{ blockId: string; portId: string; signalKey: string }> = [];
    for (const b of xEngine.executionOrder) {
      for (const p of b.outputs) {
        const signalKey = `${b.id}.${p.id}`;
        outputPorts.push({ blockId: b.id, portId: p.id, signalKey });
        recordedSignals[signalKey] = [];
        if (!recordedSignals[p.id]) {
          recordedSignals[p.id] = [];
        }
      }
    }

    let t = tStart;
    let stepCount = 0;
    while (t <= tStop + 1e-9) {
      if (signal?.aborted) throw new Error('SIMULATION_ABORTED');

      if (solverType === 'euler') {
        Solvers.stepEuler(xEngine, t, stepSize);
      } else if (solverType === 'ode2') {
        Solvers.stepODE2(xEngine, t, stepSize);
      } else if (solverType === 'ode3') {
        Solvers.stepODE3(xEngine, t, stepSize);
      } else if (solverType === 'ode5') {
        Solvers.stepODE5(xEngine, t, stepSize);
      } else {
        Solvers.stepRK4(xEngine, t, stepSize);
      }

      xEngine.computeOutputs(t);

      timeVector.push(Math.round(t * 1e6) / 1e6);
      for (const op of outputPorts) {
        const val = xEngine.getSignalValue(op.blockId, op.portId);
        const numVal = typeof val === 'number' ? val : Number(val) || 0;
        recordedSignals[op.signalKey].push(numVal);
        if (recordedSignals[op.portId]) {
          recordedSignals[op.portId].push(numVal);
        }
      }

      t += stepSize;
      stepCount++;
      if (stepCount % 50 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const primarySignal = recordedSignals['va'] || recordedSignals['vout'] || Object.values(recordedSignals)[0] || [];
    let vRms = 0;
    let vPeak = 0;

    if (primarySignal.length > 0) {
      const sumSq = primarySignal.reduce((acc, v) => acc + v * v, 0);
      vRms = Math.round(Math.sqrt(sumSq / primarySignal.length) * 100) / 100;
      vPeak = Math.round(Math.max(...primarySignal.map(Math.abs)) * 100) / 100;

    }

    return {
      engineRunId,
      timeVector,
      signals: recordedSignals,
      metrics: {
        vRms,
        vPeak,
        stepCount
      }
    };
  }
}
