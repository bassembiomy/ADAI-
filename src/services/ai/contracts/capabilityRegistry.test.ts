import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { CapabilityRegistry } from './capabilityRegistry';
import { RiskClass, RollbackLevel, SideEffectClass } from './types';

describe('CapabilityRegistry with Strict Consistency & Entity Lifecycle Rules', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  it('should register a valid capability and validate payloads against strict Zod schema', () => {
    const payloadSchema = z.object({
      blockId: z.string().min(1),
      blockType: z.enum(['DC_VOLTAGE_SOURCE', 'SPWM_GENERATOR', 'WAVEFORM_GENERATOR'])
    }).strict();

    registry.register({
      actionType: 'XB_CREATE_BLOCK',
      schemaVersion: '1.0.0',
      module: 'xbridges',
      riskClass: RiskClass.REVERSIBLE_MUTATION,
      rollbackLevel: RollbackLevel.INVERSE_ACTION,
      sideEffectClass: SideEffectClass.DOMAIN_STATE,
      payloadSchema,
      requiredPermissions: [],
      supportsDryRun: true,
      requiresCommitBarrier: false,
      resourceAccess: { readSets: ['xbridges.nodes'], writeSets: ['xbridges.nodes'] },
      entityLifecycle: {
        creates: (p: any) => [p.blockId]
      }
    });

    const cap = registry.get('XB_CREATE_BLOCK', '1.0.0');
    expect(cap).toBeDefined();
    expect(cap?.actionType).toBe('XB_CREATE_BLOCK');

    const valid = cap?.payloadSchema.safeParse({ blockId: 'b1', blockType: 'DC_VOLTAGE_SOURCE' });
    expect(valid?.success).toBe(true);

    const invalid = cap?.payloadSchema.safeParse({ blockId: 'b1', blockType: 'UNKNOWN_TYPE' });
    expect(invalid?.success).toBe(false);
  });

  it('should reject invalid capability consistency rules', () => {
    // 1. Hardware actuation marked reversible
    expect(() => {
      registry.register({
        actionType: 'HIL_ACTUATE',
        schemaVersion: '1.0.0',
        module: 'hil',
        riskClass: RiskClass.HARDWARE_ACTUATION,
        rollbackLevel: RollbackLevel.INVERSE_ACTION,
        sideEffectClass: SideEffectClass.PHYSICAL_HARDWARE,
        payloadSchema: z.object({}).strict(),
        requiredPermissions: ['hardware.write'],
        supportsDryRun: false,
        requiresCommitBarrier: true,
        resourceAccess: { readSets: [], writeSets: [] }
      });
    }).toThrowError(/Hardware actuation cannot have rollback level INVERSE_ACTION/);

    // 2. Read-only declaring write sets
    expect(() => {
      registry.register({
        actionType: 'INSPECT_MODEL',
        schemaVersion: '1.0.0',
        module: 'xbridges',
        riskClass: RiskClass.READ_ONLY,
        rollbackLevel: RollbackLevel.NONE,
        sideEffectClass: SideEffectClass.READ_ONLY,
        payloadSchema: z.object({}).strict(),
        requiredPermissions: [],
        supportsDryRun: true,
        requiresCommitBarrier: false,
        resourceAccess: { readSets: ['xbridges'], writeSets: ['xbridges.mutation'] }
      });
    }).toThrowError(/Read-only capabilities cannot declare writeSets/);
  });

  it('should reject duplicate registration of same type and version', () => {
    const cap = {
      actionType: 'XB_CREATE_BLOCK',
      schemaVersion: '1.0.0',
      module: 'xbridges',
      riskClass: RiskClass.REVERSIBLE_MUTATION,
      rollbackLevel: RollbackLevel.INVERSE_ACTION,
      sideEffectClass: SideEffectClass.DOMAIN_STATE,
      payloadSchema: z.object({}).strict(),
      requiredPermissions: [],
      supportsDryRun: true,
      requiresCommitBarrier: false,
      resourceAccess: { readSets: [], writeSets: [] }
    };
    registry.register(cap);
    expect(() => registry.register(cap)).toThrowError(/already registered/);
  });
});
