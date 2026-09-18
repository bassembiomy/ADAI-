import { describe, it, expect, vi } from 'vitest';
import { TransactionManager } from './transactionManager';
import { InMemoryTransactionJournalStore } from './transactionJournalStore';
import { CapabilityRegistry } from '../contracts/capabilityRegistry';
import { RiskClass, RollbackLevel, SideEffectClass } from '../contracts/types';
import { z } from 'zod';

describe('TransactionManager with Deep Snapshot Fallback and Startup Crash Recovery', () => {
  const registry = new CapabilityRegistry();
  registry.register({
    actionType: 'TEST_MUTATION',
    schemaVersion: '1.0.0',
    module: 'test',
    riskClass: RiskClass.REVERSIBLE_MUTATION,
    rollbackLevel: RollbackLevel.SNAPSHOT_RESTORE,
    sideEffectClass: SideEffectClass.DOMAIN_STATE,
    payloadSchema: z.object({ id: z.string() }).strict(),
    requiredPermissions: [],
    supportsDryRun: true,
    requiresCommitBarrier: false,
    resourceAccess: { readSets: [], writeSets: [] }
  });

  it('should record prepared history before execute and fallback to restoreSnapshot on hash mismatch', async () => {
    const journalStore = new InMemoryTransactionJournalStore();
    const mockAdapter = {
      validate: vi.fn().mockResolvedValue({ isValid: true, diagnostics: [] }),
      prepare: vi.fn().mockResolvedValue({ snapshot: { deep: 'copy' }, beforeStateHash: 'hash_initial' }),
      execute: vi.fn().mockRejectedValue(new Error('Mutation Crash Simulation')),
      verify: vi.fn(),
      rollback: vi.fn().mockResolvedValue(undefined),
      restoreSnapshot: vi.fn().mockResolvedValue(undefined),
      getStateHash: vi.fn()
        .mockReturnValueOnce('hash_corrupted') // First check after inverse fails
        .mockReturnValueOnce('hash_initial')   // Second check after snapshot restore succeeds
    };

    const tm = new TransactionManager(registry, new Map([['test', mockAdapter as any]]), journalStore);

    const plan = {
      schemaVersion: '1.0.0',
      planId: 'p_fallback_test',
      projectId: 'proj1',
      baseRevision: 1,
      userMessage: 'Snapshot fallback test',
      designRationale: '',
      assumptions: [],
      warnings: [],
      actions: [
        {
          actionId: 'a1',
          actionSchemaVersion: '1.0.0',
          idempotencyKey: 'k_fb',
          type: 'TEST_MUTATION',
          targetModule: 'test',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: [],
          onFailure: 'ROLLBACK_PLAN',
          payload: { id: 'item1' }
        }
      ]
    };

    const res = await tm.executePlan(plan, 1, new Set());
    expect(res.success).toBe(false);
    expect(res.status).toBe('ROLLED_BACK');
    expect(mockAdapter.restoreSnapshot).toHaveBeenCalledWith({ deep: 'copy' });
  });

  it('executes valid EngineeringModelPlan atomically and commits new revision', async () => {
    const { EngineeringModelAdapter } = await import('../adapters/engineeringModelAdapter');
    const adapter = new EngineeringModelAdapter('xbridges');
    const journalStore = new InMemoryTransactionJournalStore();
    const tm = new TransactionManager(registry, new Map([['xbridges', adapter]]), journalStore);

    const inverterPlan = {
      schemaVersion: '1.0.0' as const,
      planId: 'plan_inverter_tx',
      projectId: 'proj_inv',
      baseRevision: 1,
      targetDomain: 'xbridges' as const,
      designRationale: 'Transaction test for inverter',
      assumptions: ['400V DC Bus'],
      blocks: [
        {
          id: 'dc_src',
          blockDefinitionId: 'Constant',
          domain: 'xbridges' as const,
          name: 'DC Source',
          parameters: [{ blockId: 'dc_src', parameterName: 'value', value: 400 }]
        },
        {
          id: 'inv_bridge',
          blockDefinitionId: 'THREE_PHASE_INVERTER',
          domain: 'xbridges' as const,
          name: 'Inverter Bridge',
          parameters: [{ blockId: 'inv_bridge', parameterName: 'Ron', value: 0.01 }]
        }
      ],
      connections: [
        {
          id: 'c_dc_p',
          fromBlockId: 'dc_src',
          fromPortId: 'out',
          toBlockId: 'inv_bridge',
          toPortId: 'vdc_p',
          domain: 'xbridges' as const
        }
      ],
      validationCriteria: []
    };

    const res = await tm.executeEngineeringPlan(inverterPlan, 1);
    expect(res.success).toBe(true);
    expect(res.status).toBe('COMMITTED');
    expect(res.newRevision).toBe(2);
    expect(adapter.getAllBlocks()).toHaveLength(2);
    expect(adapter.getAllConnections()).toHaveLength(1);

    // Verify journal has entries
    const entries = await journalStore.getEntries('proj_inv');
    expect(entries.some(e => e.status === 'COMMITTED')).toBe(true);

    // Test Undo
    const commitRecord = entries.find(e => e.status === 'COMMITTED');
    const undoRes = await tm.undoTransaction(commitRecord!.transactionId, 'proj_inv');
    expect(undoRes.success).toBe(true);
    expect(undoRes.status).toBe('ROLLED_BACK');
    expect(adapter.getAllBlocks()).toHaveLength(0);
    expect(adapter.getAllConnections()).toHaveLength(0);
  });

  it('fails closed and rolls back cleanly without partial blocks on runtime fault', async () => {
    const { EngineeringModelAdapter } = await import('../adapters/engineeringModelAdapter');
    const adapter = new EngineeringModelAdapter('xbridges');
    const journalStore = new InMemoryTransactionJournalStore();
    const tm = new TransactionManager(registry, new Map([['xbridges', adapter]]), journalStore);

    // Inverter plan where second connection fails (nonexistent port on target)
    const faultyPlan = {
      schemaVersion: '1.0.0' as const,
      planId: 'plan_faulty',
      projectId: 'proj_inv',
      baseRevision: 1,
      targetDomain: 'xbridges' as const,
      designRationale: 'Faulty plan test',
      assumptions: [],
      blocks: [
        {
          id: 'dc_src',
          blockDefinitionId: 'Constant',
          domain: 'xbridges' as const,
          name: 'DC Source',
          parameters: []
        }
      ],
      connections: [],
      validationCriteria: []
    };

    // Spy on connectPorts to simulate mid-execution crash
    const origAdd = adapter.addBlock.bind(adapter);
    let callCount = 0;
    adapter.addBlock = async (b) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Mid-execution disk or hardware fault');
      }
      return origAdd(b);
    };

    faultyPlan.blocks.push({
      id: 'fault_block',
      blockDefinitionId: 'Constant',
      domain: 'xbridges' as const,
      name: 'Second Block',
      parameters: []
    });

    const res = await tm.executeEngineeringPlan(faultyPlan, 1);
    expect(res.success).toBe(false);
    expect(res.status).toBe('ROLLED_BACK');
    expect(res.newRevision).toBe(1); // Revision unchanged
    // Adapter must not retain partial blocks
    expect(adapter.getAllBlocks()).toHaveLength(0);
  });
});
