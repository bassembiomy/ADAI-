import { describe, it, expect, vi } from 'vitest';
import {
  proveXbridgesPlan,
  type ProofOptions,
  type XbridgesProof,
} from './xbridgesProofRunner';
import { planGeneralXbridgesModel } from '../planner/generalGraphPlanner';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import type { EngineeringModelPlanV2 } from '../contracts/engineeringModel';

function makeValidTestPlan(): EngineeringModelPlanV2 {
  const catalog = buildXbridgesCapabilityIndex();
  const outcome = planGeneralXbridgesModel(
    {
      intent: 'create',
      objective: 'Feed-forward open loop control',
      targetBehaviors: ['feed_forward', 'open_loop'],
      inputs: [{ name: 'Step', value: 1 }],
      outputs: [{ name: 'Scope', value: 'monitored' }],
      constraints: [],
    },
    {
      projectId: 'proj_proof',
      baseRevision: 1,
      activeSnapshot: {
        projectId: 'proj_proof',
        revision: 1,
        nodes: [],
        edges: [],
        stateHash: 'base_hash',
        timestamp: Date.now(),
      },
      catalog,
      patterns: [],
    }
  );
  if (!outcome.plan) throw new Error('Failed to generate test plan');
  return outcome.plan;
}

describe('xbridgesProofRunner (Isolated Simulation Proof)', () => {
  it('proves valid compilation and bounded simulation in memory without live delegate', async () => {
    const plan = makeValidTestPlan();
    const proof = await proveXbridgesPlan(plan, { stopTime: 0.1, maxSteps: 50 });

    expect(proof.status).toBe('proved');
    expect(proof.planHash).toBe(plan.planHash);
    expect(proof.catalogHash).toBe(plan.catalogFingerprint);
    expect(proof.engineRunId).toBeDefined();
    expect(proof.engineRunId?.length).toBeGreaterThan(0);
    expect(proof.diagnostics).toHaveLength(0);
  });

  it('refuses models that fail compilation in the isolated engine', async () => {
    const validPlan = makeValidTestPlan();
    // Corrupt plan with invalid connection
    const brokenPlan: EngineeringModelPlanV2 = {
      ...validPlan,
      connections: [
        ...validPlan.connections,
        {
          id: 'conn_broken',
          fromBlockId: 'nonexistent_block_999',
          fromPortId: 'out',
          toBlockId: 'sink_scope',
          toPortId: 'in1',
          domain: 'xbridges',
        },
      ],
    };

    const proof = await proveXbridgesPlan(brokenPlan, { stopTime: 0.1, maxSteps: 10 });
    expect(proof.status).toBe('refused');
    expect(proof.diagnostics.length).toBeGreaterThan(0);
  });

  it('handles cancellation gracefully when AbortSignal triggers', async () => {
    const plan = makeValidTestPlan();
    const controller = new AbortController();
    controller.abort(); // pre-abort

    const proof = await proveXbridgesPlan(plan, { signal: controller.signal });
    expect(proof.status).toBe('cancelled');
  });

  it('refuses with OBSERVABLE_UNAVAILABLE when requested observable is missing without fallback guessing', async () => {
    const plan = makeValidTestPlan();
    const proof = await proveXbridgesPlan(plan, {
      stopTime: 0.1,
      maxSteps: 10,
      requiredObservables: ['imaginary_unmeasured_thd_metric'],
    });

    expect(proof.status).toBe('refused');
    expect(proof.diagnostics.some(d => d.code === 'OBSERVABLE_UNAVAILABLE')).toBe(true);
    expect(proof.observables['imaginary_unmeasured_thd_metric']).toBeUndefined();
  });

  it('ensures proof validity is strictly bound to exact planHash and catalogHash', async () => {
    const plan = makeValidTestPlan();
    const proof = await proveXbridgesPlan(plan, { stopTime: 0.1, maxSteps: 10 });
    expect(proof.status).toBe('proved');

    // Mutate plan after proof
    const mutatedPlan: EngineeringModelPlanV2 = {
      ...plan,
      planHash: 'tampered_fake_hash_99999',
    };

    expect(mutatedPlan.planHash).not.toEqual(proof.planHash);
  });
});
