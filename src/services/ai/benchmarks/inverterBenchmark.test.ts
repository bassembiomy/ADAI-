import { describe, it, expect } from 'vitest';
import { InverterSimulator } from './inverterSimulator';
import { InverterTopologyMatcher } from './inverterTopologyMatcher';
import { CapabilityRegistry } from '../contracts/capabilityRegistry';
import { RiskClass, RollbackLevel, SideEffectClass } from '../contracts/types';
import { TransactionManager } from '../execution/transactionManager';
import { InMemoryTransactionJournalStore } from '../execution/transactionJournalStore';
import { XBridgeDomainModel } from '../adapters/xbridgeDomainModel';
import { XBridgesModuleAdapter } from '../adapters/xbridgesAdapter';
import { z } from 'zod';

describe('Complete Open-Loop SPWM Inverter 10-Connection Synthesis Benchmark', () => {
  it('should synthesize full open-loop physical inverter model via Action Plan, match 10-connection graph, lower to ODE simulation, and verify numerical metrics', async () => {
    const registry = new CapabilityRegistry();
    registry.register({
      actionType: 'XB_CREATE_BLOCK',
      schemaVersion: '1.0.0',
      module: 'xbridges',
      riskClass: RiskClass.REVERSIBLE_MUTATION,
      rollbackLevel: RollbackLevel.INVERSE_ACTION,
      sideEffectClass: SideEffectClass.DOMAIN_STATE,
      payloadSchema: z.object({ blockId: z.string(), blockType: z.string(), parameters: z.record(z.string(), z.unknown()).optional() }).strict(),
      requiredPermissions: [],
      supportsDryRun: true,
      requiresCommitBarrier: false,
      resourceAccess: { readSets: [], writeSets: [] },
      entityLifecycle: { creates: (p: any) => [p.blockId] }
    });
    registry.register({
      actionType: 'XB_CONNECT_PORTS',
      schemaVersion: '1.0.0',
      module: 'xbridges',
      riskClass: RiskClass.REVERSIBLE_MUTATION,
      rollbackLevel: RollbackLevel.INVERSE_ACTION,
      sideEffectClass: SideEffectClass.DOMAIN_STATE,
      payloadSchema: z.object({ connectionId: z.string(), sourceBlockId: z.string(), sourcePortId: z.string(), targetBlockId: z.string(), targetPortId: z.string(), domainType: z.string() }).strict(),
      requiredPermissions: [],
      supportsDryRun: true,
      requiresCommitBarrier: false,
      resourceAccess: { readSets: [], writeSets: [] },
      entityLifecycle: { reads: (p: any) => [p.sourceBlockId, p.targetBlockId], creates: (p: any) => [p.connectionId] }
    });

    const model = new XBridgeDomainModel();
    const adapter = new XBridgesModuleAdapter(model);
    const journalStore = new InMemoryTransactionJournalStore();
    const tm = new TransactionManager(registry, new Map([['xbridges', adapter]]), journalStore);

    const fullInverterPlan = {
      schemaVersion: '1.0.0',
      planId: 'plan_inverter_e2e_v33',
      projectId: 'proj_e2e',
      baseRevision: 1,
      userMessage: 'Synthesize full open-loop SPWM Inverter',
      designRationale: '220V 50Hz full bridge',
      assumptions: ['380V DC Bus', 'm = 0.819'],
      warnings: [],
      actions: [
        { actionId: 'a_dc', actionSchemaVersion: '1.0.0', idempotencyKey: 'k_dc', type: 'XB_CREATE_BLOCK', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: [], onFailure: 'ROLLBACK_PLAN', payload: { blockId: 'dc', blockType: 'DC_VOLTAGE_SOURCE', parameters: { nominalVoltage: { value: 380, unit: 'V' } } } },
        { actionId: 'a_sine', actionSchemaVersion: '1.0.0', idempotencyKey: 'k_sine', type: 'XB_CREATE_BLOCK', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: [], onFailure: 'ROLLBACK_PLAN', payload: { blockId: 'sine', blockType: 'WAVEFORM_GENERATOR', parameters: { frequency: { value: 50, unit: 'Hz' } } } },
        { actionId: 'a_pwm', actionSchemaVersion: '1.0.0', idempotencyKey: 'k_pwm', type: 'XB_CREATE_BLOCK', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: [], onFailure: 'ROLLBACK_PLAN', payload: { blockId: 'pwm', blockType: 'SPWM_GENERATOR', parameters: { carrierFrequency: { value: 10000, unit: 'Hz' }, modulationIndex: { value: 0.819, unit: '1' } } } },
        { actionId: 'a_bridge', actionSchemaVersion: '1.0.0', idempotencyKey: 'k_br', type: 'XB_CREATE_BLOCK', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: [], onFailure: 'ROLLBACK_PLAN', payload: { blockId: 'bridge', blockType: 'FULL_H_BRIDGE' } },
        { actionId: 'a_filter', actionSchemaVersion: '1.0.0', idempotencyKey: 'k_flt', type: 'XB_CREATE_BLOCK', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: [], onFailure: 'ROLLBACK_PLAN', payload: { blockId: 'filter', blockType: 'LC_FILTER', parameters: { inductance: { value: 2.5, unit: 'mH' }, capacitance: { value: 10, unit: 'uF' } } } },
        { actionId: 'a_load', actionSchemaVersion: '1.0.0', idempotencyKey: 'k_ld', type: 'XB_CREATE_BLOCK', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: [], onFailure: 'ROLLBACK_PLAN', payload: { blockId: 'load', blockType: 'RESISTIVE_LOAD', parameters: { resistance: { value: 10, unit: 'Ohm' } } } },
        { actionId: 'a_scope', actionSchemaVersion: '1.0.0', idempotencyKey: 'k_sc', type: 'XB_CREATE_BLOCK', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: [], onFailure: 'ROLLBACK_PLAN', payload: { blockId: 'scope', blockType: 'VOLTAGE_SENSOR_SCOPE' } },

        // 10 Complete Circuit Connections
        { actionId: 'c_mod', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_mod', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_sine', 'a_pwm'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c1', sourceBlockId: 'sine', sourcePortId: 'out_signal', targetBlockId: 'pwm', targetPortId: 'in_modulation', domainType: 'SIGNAL_FLOW' } },
        { actionId: 'c_gate', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_gate', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_pwm', 'a_bridge'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c2', sourceBlockId: 'pwm', sourcePortId: 'out_pwm', targetBlockId: 'bridge', targetPortId: 'gate_pwm', domainType: 'SIGNAL_FLOW' } },
        { actionId: 'c_dc_p', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_dcp', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_dc', 'a_bridge'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c3', sourceBlockId: 'dc', sourcePortId: 'pos', targetBlockId: 'bridge', targetPortId: 'dc_pos', domainType: 'PHYSICAL_CONSERVING' } },
        { actionId: 'c_dc_n', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_dcn', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_dc', 'a_bridge'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c4', sourceBlockId: 'dc', sourcePortId: 'neg', targetBlockId: 'bridge', targetPortId: 'dc_neg', domainType: 'PHYSICAL_CONSERVING' } },
        { actionId: 'c_flt_p', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_fltp', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_bridge', 'a_filter'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c5', sourceBlockId: 'bridge', sourcePortId: 'ac_pos', targetBlockId: 'filter', targetPortId: 'in_pos', domainType: 'PHYSICAL_CONSERVING' } },
        { actionId: 'c_flt_n', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_fltn', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_bridge', 'a_filter'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c6', sourceBlockId: 'bridge', sourcePortId: 'ac_neg', targetBlockId: 'filter', targetPortId: 'in_neg', domainType: 'PHYSICAL_CONSERVING' } },
        { actionId: 'c_ld_p', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_ldp', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_filter', 'a_load'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c7', sourceBlockId: 'filter', sourcePortId: 'out_pos', targetBlockId: 'load', targetPortId: 'pos', domainType: 'PHYSICAL_CONSERVING' } },
        { actionId: 'c_ld_n', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_ldn', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_filter', 'a_load'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c8', sourceBlockId: 'filter', sourcePortId: 'out_neg', targetBlockId: 'load', targetPortId: 'neg', domainType: 'PHYSICAL_CONSERVING' } },
        { actionId: 'c_sc_p', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_scp', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_load', 'a_scope'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c9', sourceBlockId: 'load', sourcePortId: 'pos', targetBlockId: 'scope', targetPortId: 'probe_pos', domainType: 'PHYSICAL_CONSERVING' } },
        { actionId: 'c_sc_n', actionSchemaVersion: '1.0.0', idempotencyKey: 'kc_scn', type: 'XB_CONNECT_PORTS', targetModule: 'xbridges', risk: RiskClass.REVERSIBLE_MUTATION, dependsOn: ['a_load', 'a_scope'], onFailure: 'ROLLBACK_PLAN', payload: { connectionId: 'c10', sourceBlockId: 'load', sourcePortId: 'neg', targetBlockId: 'scope', targetPortId: 'probe_neg', domainType: 'PHYSICAL_CONSERVING' } }
      ]
    };

    const res = await tm.executePlan(fullInverterPlan, 1, new Set());
    expect(res.success).toBe(true);

    const match = InverterTopologyMatcher.match(model);
    expect(match.isComplete).toBe(true);
    expect(match.sineId).toBe('sine');

    const loweredParams = InverterSimulator.lowerFromDomainModel(model);
    expect(loweredParams.fFundamental).toBe(50);

    const simResult = InverterSimulator.simulate(loweredParams);
    expect(simResult.vRms).toBeGreaterThanOrEqual(218);
    expect(simResult.vRms).toBeLessThanOrEqual(223);
    expect(simResult.zeroCrossingFrequency).toBeCloseTo(50, 1);
    expect(simResult.lowOrderThdPercent).toBeLessThanOrEqual(5.0);
  });

  it('should reject lowering when negative return path is missing', () => {
    const incompleteModel = new XBridgeDomainModel();
    expect(() => InverterSimulator.lowerFromDomainModel(incompleteModel)).toThrowError(/Cannot lower incomplete topology/);
  });
});
