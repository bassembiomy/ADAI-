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
