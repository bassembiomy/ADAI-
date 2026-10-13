import { describe, it, expect } from 'vitest';
import { optimizeXbridgesModel, type OptimizationResult } from './xbridgesOptimizer';
import { OptimizationRequest } from '../planner/generalIntent';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { proveXbridgesPlan } from '../proof/xbridgesProofRunner';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';

describe('Deterministic Optimization With Evidence', () => {
  const catalog = buildXbridgesCapabilityIndex();

  const baselineSnapshot: ModelSnapshot = {
    projectId: 'opt_proj',
    revision: 1,
    nodes: [
      {
        id: 'step_src',
        type: 'Step',
        data: { label: 'Step Source', params: { stepTime: 0.01, finalValue: 5.0 } },
        position: { x: 0, y: 0 }
      } as any,
      {
        id: 'gain_blk',
        type: 'GAIN',
        data: { label: 'Gain', params: { gain: 2.0 } },
        position: { x: 100, y: 0 }
      } as any
    ],
    edges: [
      {
        id: 'e1',
        source: 'step_src',
        sourceHandle: 'out',
        target: 'gain_blk',
        targetHandle: 'u'
      } as any
    ],
    stateHash: 'baseline_state_hash',
    timestamp: Date.now()
  };

  it('refuses optimization when objective or targetMetric is missing', async () => {
    const invalidRequest = {
      objective: '',
      targetMetric: '',
      direction: 'minimize' as const,
      parametersToTune: []
    };

    const result = await optimizeXbridgesModel(
      baselineSnapshot,
      invalidRequest as any,
      catalog,
      proveXbridgesPlan
    );

    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/missing objective|target metric/i);
  });

  it('refuses optimization when parameter bounds are missing or min > max', async () => {
    const invalidBoundsRequest: OptimizationRequest = {
      objective: 'Minimize error',
      targetMetric: 'gain_blk.y',
      direction: 'minimize',
      parametersToTune: [
        {
          blockId: 'gain_blk',
          parameterName: 'gain',
          min: 10,
          max: 2 // min > max
        }
      ]
    };

    const result = await optimizeXbridgesModel(
      baselineSnapshot,
      invalidBoundsRequest,
      catalog,
      proveXbridgesPlan
    );

    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/invalid bounds/i);
  });

  it('runs deterministic grid search and selects the optimal candidate with proof evidence', async () => {
    const request: OptimizationRequest = {
      objective: 'Tune gain to achieve closest output to 15.0 (Step value is 5.0, so ideal gain is 3.0)',
      targetMetric: 'gain_blk.y',
      direction: 'minimize',
      parametersToTune: [
        {
          blockId: 'gain_blk',
          parameterName: 'gain',
          min: 1.0,
          max: 5.0,
          step: 1.0 // 1, 2, 3, 4, 5
        }
      ],
      maxEvaluations: 10
    };

    const result = await optimizeXbridgesModel(
      baselineSnapshot,
      request,
      catalog,
      proveXbridgesPlan
    );

    expect(result.status).toBe('optimal_found');
    expect(result.candidatesEvaluated).toBe(5);
    expect(result.bestCandidate).toBeDefined();
    expect(result.bestCandidate?.parameters).toEqual({ 'gain_blk.gain': 3.0 });
    expect(result.bestCandidate?.engineRunId).toBeDefined();
    expect(result.bestCandidate?.modelHash).toBeDefined();

    // The winning parameters must be turned into ordinary set_parameter actions
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({
      id: 'opt_param_gain_blk_gain',
      kind: 'set_parameter',
      blockId: 'gain_blk',
      parameterName: 'gain',
      value: 3.0
    });
  });

  it('stops upon budget exhaustion and reports best found within budget', async () => {
    const request: OptimizationRequest = {
      objective: 'Tune gain with budget',
      targetMetric: 'gain_blk.y',
      direction: 'minimize',
      parametersToTune: [
        {
          blockId: 'gain_blk',
          parameterName: 'gain',
          min: 1.0,
          max: 10.0,
          step: 1.0 // 10 candidates
        }
      ],
      maxEvaluations: 3 // hard budget
    };

    const result = await optimizeXbridgesModel(
      baselineSnapshot,
      request,
      catalog,
      proveXbridgesPlan
    );

    expect(result.candidatesEvaluated).toBe(3);
    expect(result.bestCandidate).toBeDefined();
  });
});
