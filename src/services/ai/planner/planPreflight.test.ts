import { describe, it, expect } from 'vitest';
import { PlanPreflight } from './planPreflight';
import { EngineeringModelPlan } from '../contracts/engineeringModel';
import { AdiaBlockCatalog } from '../../../agent/adiaBlockCatalog';

describe('PlanPreflight Gates and Physical Topology Validation', () => {
  // Known valid complete 3-phase inverter topology with real X-Bridges block definitions
  const validCompleteInverterPlan: EngineeringModelPlan = {
    schemaVersion: '1.0.0',
    planId: 'plan_inv_preflight_valid',
    projectId: 'proj_preflight',
    baseRevision: 2,
    targetDomain: 'xbridges',
    designRationale: 'Complete physical 3-phase inverter topology with DC source, PWM, bridge, and load',
    assumptions: ['400V DC Bus', '50Hz AC Fundamental', '10kHz SPWM'],
    blocks: [
      {
        id: 'dc_src',
        blockDefinitionId: 'DC_VOLTAGE_SOURCE',
        domain: 'xbridges',
        name: 'DC Voltage Source',
        parameters: [{ blockId: 'dc_src', parameterName: 'voltage', value: 400 }]
      },
      {
        id: 'v_ref',
        blockDefinitionId: 'VOLTAGE_REFERENCE_GENERATOR',
        domain: 'xbridges',
        name: 'Sine Voltage Reference',
        parameters: [
          { blockId: 'v_ref', parameterName: 'frequency', value: 50 },
          { blockId: 'v_ref', parameterName: 'amplitude', value: 1 }
        ]
      },
      {
        id: 'pwm_gen',
        blockDefinitionId: 'THREE_PHASE_PWM',
        domain: 'xbridges',
        name: '3-Phase SPWM Modulator',
        parameters: [
          { blockId: 'pwm_gen', parameterName: 'frequency', value: 10000 },
          { blockId: 'pwm_gen', parameterName: 'method', value: 'SPWM' }
        ]
      },
      {
        id: 'inv_bridge',
        blockDefinitionId: 'THREE_PHASE_INVERTER',
        domain: 'xbridges',
        name: '3-Phase Inverter Bridge',
        parameters: [
          { blockId: 'inv_bridge', parameterName: 'Ron', value: 0.01 },
          { blockId: 'inv_bridge', parameterName: 'Vf', value: 0.7 }
        ]
      },
      {
        id: 'ac_load',
        blockDefinitionId: 'THREE_PHASE_LOAD',
        domain: 'xbridges',
        name: '3-Phase AC Load',
        parameters: [{ blockId: 'ac_load', parameterName: 'R', value: 10 }]
      }
    ],
    connections: [
      // DC Rail connections (both positive and negative rail return)
      {
        id: 'c_dc_p',
        fromBlockId: 'dc_src',
        fromPortId: 'v_pos',
        toBlockId: 'inv_bridge',
        toPortId: 'vdc_p',
        domain: 'xbridges'
      },
      {
        id: 'c_dc_n',
        fromBlockId: 'dc_src',
        fromPortId: 'v_neg',
        toBlockId: 'inv_bridge',
        toPortId: 'vdc_n',
        domain: 'xbridges'
      },
      // Modulation references
      {
        id: 'c_ref_a',
        fromBlockId: 'v_ref',
        fromPortId: 'va',
        toBlockId: 'pwm_gen',
        toPortId: 'va_ref',
        domain: 'xbridges'
      },
      {
        id: 'c_ref_b',
        fromBlockId: 'v_ref',
        fromPortId: 'vb',
        toBlockId: 'pwm_gen',
        toPortId: 'vb_ref',
        domain: 'xbridges'
      },
      {
        id: 'c_ref_c',
        fromBlockId: 'v_ref',
        fromPortId: 'vc',
        toBlockId: 'pwm_gen',
        toPortId: 'vc_ref',
        domain: 'xbridges'
      },
      // Gate drive signals
      {
        id: 'c_gate_a',
        fromBlockId: 'pwm_gen',
        fromPortId: 'ga',
        toBlockId: 'inv_bridge',
        toPortId: 'ga',
        domain: 'xbridges'
      },
      {
        id: 'c_gate_b',
        fromBlockId: 'pwm_gen',
        fromPortId: 'gb',
        toBlockId: 'inv_bridge',
        toPortId: 'gb',
        domain: 'xbridges'
      },
      {
        id: 'c_gate_c',
        fromBlockId: 'pwm_gen',
        fromPortId: 'gc',
        toBlockId: 'inv_bridge',
        toPortId: 'gc',
        domain: 'xbridges'
      },
      // AC 3-phase load outputs
      {
        id: 'c_ac_a',
        fromBlockId: 'inv_bridge',
        fromPortId: 'va',
        toBlockId: 'ac_load',
        toPortId: 'va',
        domain: 'xbridges'
      },
      {
        id: 'c_ac_b',
        fromBlockId: 'inv_bridge',
        fromPortId: 'vb',
        toBlockId: 'ac_load',
        toPortId: 'vb',
        domain: 'xbridges'
      },
      {
        id: 'c_ac_c',
        fromBlockId: 'inv_bridge',
        fromPortId: 'vc',
        toBlockId: 'ac_load',
        toPortId: 'vc',
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

  it('passes preflight for a known valid complete inverter topology composed solely of real IDs', () => {
    const result = PlanPreflight.preflight(validCompleteInverterPlan, { currentRevision: 2 });
    if (!result.passed) {
      console.error('Unexpected preflight failure:', JSON.stringify(result.diagnostics, null, 2));
    }
    expect(result.passed).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.resolvedBlocks.size).toBe(5);
  });

  it('rejects missing DC rail return with MISSING_DC_RAIL_RETURN diagnostic', () => {
    // Remove the negative DC rail return connection (c_dc_n)
    const missingReturnPlan: EngineeringModelPlan = {
      ...validCompleteInverterPlan,
      connections: validCompleteInverterPlan.connections.filter(c => c.id !== 'c_dc_n')
    };

    const result = PlanPreflight.preflight(missingReturnPlan, { currentRevision: 2 });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'MISSING_DC_RAIL_RETURN')).toBe(true);
    const diag = result.diagnostics.find(d => d.code === 'MISSING_DC_RAIL_RETURN');
    expect(diag?.entityId).toBe('inv_bridge');
    expect(diag?.portId).toBe('vdc_n');
  });

  it('rejects unsupported or hallucinated block IDs with UNKNOWN_BLOCK_DEFINITION', () => {
    const badBlockPlan: EngineeringModelPlan = {
      ...validCompleteInverterPlan,
      blocks: [
        ...validCompleteInverterPlan.blocks,
        {
          id: 'hallucinated_chip',
          blockDefinitionId: 'NONEXISTENT_MAGIC_INVERTER_9000',
          domain: 'xbridges',
          name: 'Magic Chip',
          parameters: []
        }
      ]
    };

    const result = PlanPreflight.preflight(badBlockPlan, { currentRevision: 2 });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_BLOCK_DEFINITION')).toBe(true);
  });

  it('rejects a gate-to-physical port mismatch with GATE_PHYSICAL_PORT_MISMATCH', () => {
    // Connect logical gate ga to power rail vdc_p
    const mismatchPlan: EngineeringModelPlan = {
      ...validCompleteInverterPlan,
      connections: [
        ...validCompleteInverterPlan.connections.filter(c => c.id !== 'c_gate_a'),
        {
          id: 'c_gate_a_mismatch',
          fromBlockId: 'pwm_gen',
          fromPortId: 'ga', // logical
          toBlockId: 'inv_bridge',
          toPortId: 'vdc_p', // power
          domain: 'xbridges'
        }
      ]
    };

    const result = PlanPreflight.preflight(mismatchPlan, { currentRevision: 2 });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'GATE_PHYSICAL_PORT_MISMATCH')).toBe(true);
  });

  it('rejects equating signal Constant with electrical DC power rail with PORT_DOMAIN_MISMATCH', () => {
    // Replace DC_VOLTAGE_SOURCE with signal Constant block
    const constantSourcePlan: EngineeringModelPlan = {
      ...validCompleteInverterPlan,
      blocks: [
        ...validCompleteInverterPlan.blocks.filter(b => b.id !== 'dc_src'),
        {
          id: 'dc_src',
          blockDefinitionId: 'Constant',
          domain: 'xbridges',
          name: 'Signal Constant as DC',
          parameters: [{ blockId: 'dc_src', parameterName: 'value', value: 400 }]
        }
      ],
      connections: [
        ...validCompleteInverterPlan.connections.filter(c => c.id !== 'c_dc_p' && c.id !== 'c_dc_n'),
        {
          id: 'c_dc_p_constant',
          fromBlockId: 'dc_src',
          fromPortId: 'out',
          toBlockId: 'inv_bridge',
          toPortId: 'vdc_p',
          domain: 'xbridges'
        },
        {
          id: 'c_dc_n_constant',
          fromBlockId: 'dc_src',
          fromPortId: 'out',
          toBlockId: 'inv_bridge',
          toPortId: 'vdc_n',
          domain: 'xbridges'
        }
      ]
    };

    const result = PlanPreflight.preflight(constantSourcePlan, { currentRevision: 2 });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'PORT_DOMAIN_MISMATCH')).toBe(true);
  });

  it('rejects missing load reference with MISSING_LOAD_REFERENCE', () => {
    // Inverter with no AC load connections
    const missingLoadPlan: EngineeringModelPlan = {
      ...validCompleteInverterPlan,
      blocks: validCompleteInverterPlan.blocks.filter(b => b.id !== 'ac_load'),
      connections: validCompleteInverterPlan.connections.filter(c => c.toBlockId !== 'ac_load')
    };

    const result = PlanPreflight.preflight(missingLoadPlan, { currentRevision: 2 });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'MISSING_LOAD_REFERENCE')).toBe(true);
  });

  it('rejects stale base revision before opening transactions', () => {
    const result = PlanPreflight.preflight(validCompleteInverterPlan, { currentRevision: 10 });
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'STALE_BASE_REVISION')).toBe(true);
  });
});
