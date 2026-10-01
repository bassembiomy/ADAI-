import { describe, it, expect } from 'vitest';
import { PlanValidator } from './planValidator';
import { CapabilityRegistry } from '../contracts/capabilityRegistry';
import { RiskClass, RollbackLevel, SideEffectClass } from '../contracts/types';
import { z } from 'zod';

describe('PlanValidator with Capability-Driven Entity Lifecycle Resolution', () => {
  const registry = new CapabilityRegistry();
  registry.register({
    actionType: 'XB_CREATE_BLOCK',
    schemaVersion: '1.0.0',
    module: 'xbridges',
    riskClass: RiskClass.REVERSIBLE_MUTATION,
    rollbackLevel: RollbackLevel.INVERSE_ACTION,
    sideEffectClass: SideEffectClass.DOMAIN_STATE,
    payloadSchema: z.object({ blockId: z.string(), blockType: z.string() }).strict(),
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
    entityLifecycle: {
      reads: (p: any) => [p.sourceBlockId, p.targetBlockId],
      creates: (p: any) => [p.connectionId]
    }
  });

  it('should detect when an action reads an entity that has not yet been created in topological order', () => {
    const invalidPlan = {
      schemaVersion: '1.0.0',
      planId: 'p1',
      projectId: 'proj1',
      baseRevision: 42,
      userMessage: 'Premature entity read',
      designRationale: '',
      assumptions: [],
      warnings: [],
      actions: [
        {
          actionId: 'act_conn',
          actionSchemaVersion: '1.0.0',
          idempotencyKey: 'k_c',
          type: 'XB_CONNECT_PORTS',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: [], // Missing dependency on block creation!
          onFailure: 'ROLLBACK_PLAN',
          payload: { connectionId: 'c1', sourceBlockId: 'b_sine', sourcePortId: 'out', targetBlockId: 'b_pwm', targetPortId: 'in', domainType: 'SIGNAL_FLOW' }
        },
        {
          actionId: 'act_create',
          actionSchemaVersion: '1.0.0',
          idempotencyKey: 'k_cr',
          type: 'XB_CREATE_BLOCK',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: [],
          onFailure: 'ROLLBACK_PLAN',
          payload: { blockId: 'b_sine', blockType: 'WAVEFORM_GENERATOR' }
        }
      ]
    };

    const res = PlanValidator.validate(invalidPlan, registry, { existingEntityIds: new Set() });
    expect(res.isValid).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'UNRESOLVED_ENTITY_REFERENCE')).toBe(true);
  });
});

describe('PlanValidator.validateEngineeringModelPlan', () => {
  const mockCatalog = {
    findById(id: string) {
      if (id === 'DC_VOLTAGE_SOURCE') {
        return {
          id: 'DC_VOLTAGE_SOURCE',
          domain: 'xbridges',
          ports: [{ id: 'positive_out', domain: 'xbridges' }, { id: 'negative_out', domain: 'xbridges' }],
          parameters: {
            voltage: { value: 100, unit: 'V' }
          }
        };
      }
      if (id === 'INVERTER_BRIDGE') {
        return {
          id: 'INVERTER_BRIDGE',
          domain: 'xbridges',
          ports: [
            { id: 'dc_pos', domain: 'xbridges' },
            { id: 'dc_neg', domain: 'xbridges' },
            { id: 'phase_a', domain: 'xbridges' },
            { id: 'phase_b', domain: 'xbridges' },
            { id: 'phase_c', domain: 'xbridges' }
          ],
          parameters: {
            frequency: { value: 50, unit: 'Hz' }
          }
        };
      }
      if (id === 'SYSML_BLOCK') {
        return {
          id: 'SYSML_BLOCK',
          domain: 'sysml',
          ports: [{ id: 'in', domain: 'sysml' }],
          parameters: {}
        };
      }
      return undefined;
    }
  };

  const validPlan = {
    schemaVersion: '1.0.0',
    planId: 'plan_1',
    projectId: 'proj_1',
    baseRevision: 2,
    targetDomain: 'xbridges',
    designRationale: 'Test plan',
    assumptions: ['Testing assumptions'],
    blocks: [
      {
        id: 'b_source',
        blockDefinitionId: 'DC_VOLTAGE_SOURCE',
        domain: 'xbridges',
        name: 'DC Source',
        parameters: [{ blockId: 'b_source', parameterName: 'voltage', value: 400, unit: 'V' }]
      },
      {
        id: 'b_bridge',
        blockDefinitionId: 'INVERTER_BRIDGE',
        domain: 'xbridges',
        name: 'Inverter Bridge',
        parameters: [{ blockId: 'b_bridge', parameterName: 'frequency', value: 50, unit: 'Hz' }]
      }
    ],
    connections: [
      {
        id: 'c1',
        fromBlockId: 'b_source',
        fromPortId: 'positive_out',
        toBlockId: 'b_bridge',
        toPortId: 'dc_pos',
        domain: 'xbridges'
      }
    ],
    validationCriteria: [
      {
        id: 'vc1',
        description: 'Check voltage',
        metric: 'voltage',
        operator: '==',
        targetValue: 400,
        unit: 'V'
      }
    ]
  };

  it('validates a correct EngineeringModelPlan against catalog', () => {
    const res = PlanValidator.validateEngineeringModelPlan(validPlan, mockCatalog as any);
    expect(res.isValid).toBe(true);
    expect(res.diagnostics).toHaveLength(0);
  });

  it('rejects unknown blockDefinitionId not present in catalog', () => {
    const badPlan = {
      ...validPlan,
      blocks: [
        {
          id: 'b_unknown',
          blockDefinitionId: 'NONEXISTENT_BLOCK_TYPE',
          domain: 'xbridges',
          name: 'Nonexistent',
          parameters: []
        }
      ],
      connections: []
    };
    const res = PlanValidator.validateEngineeringModelPlan(badPlan, mockCatalog as any);
    expect(res.isValid).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'UNKNOWN_BLOCK_DEFINITION')).toBe(true);
  });

  it('rejects unknown port on connection', () => {
    const badPlan = {
      ...validPlan,
      connections: [
        {
          id: 'c_bad_port',
          fromBlockId: 'b_source',
          fromPortId: 'nonexistent_port',
          toBlockId: 'b_bridge',
          toPortId: 'dc_pos',
          domain: 'xbridges'
        }
      ]
    };
    const res = PlanValidator.validateEngineeringModelPlan(badPlan, mockCatalog as any);
    expect(res.isValid).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'UNKNOWN_PORT')).toBe(true);
  });

  it('rejects invalid parameter name on block', () => {
    const badPlan = {
      ...validPlan,
      blocks: [
        {
          id: 'b_source',
          blockDefinitionId: 'DC_VOLTAGE_SOURCE',
          domain: 'xbridges',
          name: 'DC Source',
          parameters: [{ blockId: 'b_source', parameterName: 'inventedParam', value: 99 }]
        },
        validPlan.blocks[1]
      ]
    };
    const res = PlanValidator.validateEngineeringModelPlan(badPlan, mockCatalog as any);
    expect(res.isValid).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'INVALID_PARAMETER_NAME')).toBe(true);
  });

  it('rejects base revision mismatch when expectedRevision is provided', () => {
    const res = PlanValidator.validateEngineeringModelPlan(validPlan, mockCatalog as any, {
      expectedRevision: 5
    });
    expect(res.isValid).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'STALE_BASE_REVISION')).toBe(true);
  });
});

