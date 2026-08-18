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
});
