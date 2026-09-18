import { describe, it, expect } from 'vitest';
import { PlanPreflight } from './planPreflight';
import { EngineeringModelPlan } from '../contracts/engineeringModel';
import { AdiaBlockCatalog } from '../../../agent/adiaBlockCatalog';

describe('PlanPreflight Gates and Separation', () => {
  const validInverterPlan: EngineeringModelPlan = {
    schemaVersion: '1.0.0',
    planId: 'plan_inv_preflight',
    projectId: 'proj_preflight',
    baseRevision: 2,
    targetDomain: 'xbridges',
    designRationale: 'Preflight validation test for 3-phase inverter',
    assumptions: ['400V DC Bus', '50Hz AC'],
    blocks: [
      {
        id: 'dc_src',
        blockDefinitionId: 'Constant',
        domain: 'xbridges',
        name: 'DC Source',
        parameters: [{ blockId: 'dc_src', parameterName: 'value', value: 400 }]
      },
      {
        id: 'pwm_gen',
        blockDefinitionId: 'THREE_PHASE_PWM',
        domain: 'xbridges',
        name: 'PWM Modulator',
        parameters: [{ blockId: 'pwm_gen', parameterName: 'frequency', value: 10000 }]
      },
      {
        id: 'inv_bridge',
        blockDefinitionId: 'THREE_PHASE_INVERTER',
        domain: 'xbridges',
        name: '3-Phase Inverter',
        parameters: [{ blockId: 'inv_bridge', parameterName: 'Ron', value: 0.01 }]
      }
    ],
    connections: [
      {
        id: 'c_gate_a',
        fromBlockId: 'pwm_gen',
        fromPortId: 'ga',
        toBlockId: 'inv_bridge',
        toPortId: 'ga',
        domain: 'xbridges'
      },
      {
        id: 'c_dc_p',
        fromBlockId: 'dc_src',
        fromPortId: 'out',
        toBlockId: 'inv_bridge',
        toPortId: 'vdc_p',
        domain: 'xbridges'
      }
    ],
    validationCriteria: [
      {
        id: 'c_thd',
        description: 'THD <= 5%',
        metric: 'THD',
        operator: '<=',
        targetValue: 0.05
      }
    ]
  };

  it('passes preflight for a valid plan matching canonical catalog', () => {
    const result = PlanPreflight.preflight(validInverterPlan, { currentRevision: 2 });
    if (!result.passed) {
      console.log('Preflight diagnostics:', JSON.stringify(result.diagnostics, null, 2));
    }
    expect(result.passed).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.resolvedBlocks.size).toBe(3);
  });

  it('rejects stale base revision before opening transactions', () => {
    const result = PlanPreflight.preflight(validInverterPlan, { currentRevision: 5 }); // expected 5, plan is 2
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'STALE_BASE_REVISION')).toBe(true);
  });

  it('rejects hallucinated or unknown blocks before execution', () => {
    const badPlan: EngineeringModelPlan = {
      ...validInverterPlan,
      blocks: [
        ...validInverterPlan.blocks,
        {
          id: 'hallucinated',
          blockDefinitionId: 'MAGIC_INVERTER_TURBO_999',
          domain: 'xbridges',
          name: 'Magic',
          parameters: []
        }
      ]
    };
    const result = PlanPreflight.preflight(badPlan, { currentRevision: 2 });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_BLOCK_DEFINITION')).toBe(true);
  });

  it('rejects nonexistent ports on block connections', () => {
    const badPlan: EngineeringModelPlan = {
      ...validInverterPlan,
      connections: [
        {
          id: 'bad_conn',
          fromBlockId: 'pwm_gen',
          fromPortId: 'nonexistent_pwm_port',
          toBlockId: 'inv_bridge',
          toPortId: 'ga',
          domain: 'xbridges'
        }
      ]
    };
    const result = PlanPreflight.preflight(badPlan, { currentRevision: 2 });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_PORT')).toBe(true);
  });

  it('detects missing reference/source blocks in power converter circuits', () => {
    const noSourcePlan: EngineeringModelPlan = {
      ...validInverterPlan,
      blocks: validInverterPlan.blocks.filter(b => b.id !== 'dc_src'),
      connections: validInverterPlan.connections.filter(c => c.fromBlockId !== 'dc_src')
    };
    const result = PlanPreflight.preflight(noSourcePlan, { currentRevision: 2 });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'MISSING_ENVIRONMENT_REFERENCE')).toBe(true);
  });
});
