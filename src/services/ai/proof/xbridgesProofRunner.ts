import { EngineeringModelPlanV2, StructuredDiagnostic } from '../contracts/engineeringModel';
import { BLOCK_LIBRARY } from '../../../engine/xbridges/BlockDefinitions';
import { handleXbridgesWorkerMessage } from '../../../engine/xbridges/xbridgesWorker';
import { XbridgesWorkerRequest } from '../../../engine/xbridges/xbridgesWorkerProtocol';
import type { XModel, XBlock } from '../../../engine/xbridges/types';

export interface ProofOptions {
  stopTime?: number;
  maxSteps?: number;
  requiredObservables?: string[];
  signal?: AbortSignal;
}

export interface XbridgesProof {
  status: 'proved' | 'refused' | 'cancelled';
  planHash: string;
  catalogHash: string;
  engineRunId?: string;
  diagnostics: StructuredDiagnostic[];
  observables: Record<string, number | boolean | number[]>;
}

export async function proveXbridgesPlan(
  plan: EngineeringModelPlanV2,
  options: ProofOptions = {}
): Promise<XbridgesProof> {
  const { stopTime = 0.1, maxSteps = 100, requiredObservables = [], signal } = options;

  // 1. Cancellation check
  if (signal?.aborted) {
    return {
      status: 'cancelled',
      planHash: plan.planHash,
      catalogHash: plan.catalogFingerprint,
      diagnostics: [],
      observables: {},
    };
  }

  // 2. Materialize in-memory XModel strictly from catalog factories
  const blocks: XBlock[] = [];
  const diagnostics: StructuredDiagnostic[] = [];

  for (const b of plan.blocks) {
    const factory = BLOCK_LIBRARY[b.blockDefinitionId];
    if (!factory) {
      diagnostics.push({
        category: 'COMPILE',
        code: 'UNKNOWN_BLOCK_TYPE',
        severity: 'ERROR',
        message: `Block definition '${b.blockDefinitionId}' for block '${b.id}' was not found in BLOCK_LIBRARY.`,
        entityId: b.id,
      });
      continue;
    }

    const params: Record<string, any> = {};
    if (Array.isArray(b.parameters)) {
      for (const p of b.parameters) {
        if (p && p.parameterName !== undefined) {
          params[p.parameterName] = p.value;
        }
      }
    }

    try {
      const instance = factory(b.id, params);
      blocks.push(instance);
    } catch (err: any) {
      diagnostics.push({
        category: 'COMPILE',
        code: 'BLOCK_INSTANTIATION_FAILED',
        severity: 'ERROR',
        message: `Failed to instantiate block '${b.id}' (${b.blockDefinitionId}): ${err?.message}`,
        entityId: b.id,
      });
    }
  }

  if (diagnostics.length > 0) {
    return {
      status: 'refused',
      planHash: plan.planHash,
      catalogHash: plan.catalogFingerprint,
      diagnostics,
      observables: {},
    };
  }

  const blockMap = new Map(blocks.map(b => [b.id, b]));
  for (const c of plan.connections) {
    const src = blockMap.get(c.fromBlockId);
    const tgt = blockMap.get(c.toBlockId);

    if (!src) {
      diagnostics.push({
        category: 'COMPILE',
        code: 'UNKNOWN_CONNECTION_SOURCE',
        severity: 'ERROR',
        message: `Connection references non-existent source block '${c.fromBlockId}'.`,
        entityId: c.id,
      });
    } else if (!src.outputs.some(p => p.id === c.fromPortId)) {
      diagnostics.push({
        category: 'COMPILE',
        code: 'UNKNOWN_PORT',
        severity: 'ERROR',
        message: `Port '${c.fromPortId}' not found on source block '${c.fromBlockId}'.`,
        entityId: c.id,
        portId: c.fromPortId,
      });
    }

    if (!tgt) {
      diagnostics.push({
        category: 'COMPILE',
        code: 'UNKNOWN_CONNECTION_TARGET',
        severity: 'ERROR',
        message: `Connection references non-existent target block '${c.toBlockId}'.`,
        entityId: c.id,
      });
    } else if (!tgt.inputs.some(p => p.id === c.toPortId)) {
      diagnostics.push({
        category: 'COMPILE',
        code: 'UNKNOWN_PORT',
        severity: 'ERROR',
        message: `Port '${c.toPortId}' not found on target block '${c.toBlockId}'.`,
        entityId: c.id,
        portId: c.toPortId,
      });
    }
  }

  if (diagnostics.length > 0) {
    return {
      status: 'refused',
      planHash: plan.planHash,
      catalogHash: plan.catalogFingerprint,
      diagnostics,
      observables: {},
    };
  }

  const connections = plan.connections.map(c => ({
    sourceBlock: c.fromBlockId,
    sourcePort: c.fromPortId,
    targetBlock: c.toBlockId,
    targetPort: c.toPortId,
  }));

  const inMemoryModel: XModel = { blocks, connections };

  // 3. Compile in isolated worker protocol
  const engineRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const compileReq: XbridgesWorkerRequest = {
    requestId: 1,
    type: 'compile',
    model: inMemoryModel,
    engineRunId,
    time: 0,
    dt: 0.001,
  };

  const compileRes = handleXbridgesWorkerMessage(compileReq);
  if (!compileRes.ok) {
    const compileDiags: StructuredDiagnostic[] = (compileRes.diagnostics || []).map(d => ({
      category: 'COMPILE',
      code: d.code || 'COMPILE_ERROR',
      severity: d.severity === 'error' ? 'ERROR' : d.severity === 'warning' ? 'WARNING' : 'INFO',
      message: d.message,
    }));

    if (compileDiags.length === 0 && compileRes.error) {
      compileDiags.push({
        category: 'COMPILE',
        code: 'COMPILE_FAILED',
        severity: 'ERROR',
        message: compileRes.error.message,
      });
    }

    return {
      status: 'refused',
      planHash: plan.planHash,
      catalogHash: plan.catalogFingerprint,
      engineRunId: compileRes.engineRunId,
      diagnostics: compileDiags,
      observables: {},
    };
  }

  // 4. Bounded execution steps
  if (signal?.aborted) {
    return {
      status: 'cancelled',
      planHash: plan.planHash,
      catalogHash: plan.catalogFingerprint,
      diagnostics: [],
      observables: {},
    };
  }

  const dt = 0.001;
  const numSteps = Math.min(maxSteps, Math.max(1, Math.ceil(stopTime / dt)));
  const stepReq: XbridgesWorkerRequest = {
    requestId: 2,
    type: 'step',
    time: 0,
    dt,
    batchSize: numSteps,
    engineRunId: compileRes.engineRunId,
    solverType: 'rk4',
  };

  const stepRes = handleXbridgesWorkerMessage(stepReq);
  if (!stepRes.ok) {
    return {
      status: 'refused',
      planHash: plan.planHash,
      catalogHash: plan.catalogFingerprint,
      engineRunId: compileRes.engineRunId,
      diagnostics: [
        {
          category: 'SIMULATION',
          code: 'SIMULATION_STEP_FAILED',
          severity: 'ERROR',
          message: stepRes.error?.message || 'Simulation execution step failed in isolated worker',
        },
      ],
      observables: {},
    };
  }

  // 5. Extract observables and enforce required observables without fallback
  const observables: Record<string, number | boolean | number[]> = {};
  if (stepRes.outputValues) {
    for (const [k, v] of Object.entries(stepRes.outputValues)) {
      observables[k] = v;
    }
  }

  for (const reqObs of requiredObservables) {
    if (observables[reqObs] === undefined) {
      diagnostics.push({
        category: 'SIMULATION',
        code: 'OBSERVABLE_UNAVAILABLE',
        severity: 'ERROR',
        message: `Requested observable '${reqObs}' was not produced by model simulation outputs.`,
      });
    }
  }

  if (diagnostics.length > 0) {
    return {
      status: 'refused',
      planHash: plan.planHash,
      catalogHash: plan.catalogFingerprint,
      engineRunId: compileRes.engineRunId,
      diagnostics,
      observables: {},
    };
  }

  return {
    status: 'proved',
    planHash: plan.planHash,
    catalogHash: plan.catalogFingerprint,
    engineRunId: compileRes.engineRunId,
    diagnostics: [],
    observables,
  };
}
