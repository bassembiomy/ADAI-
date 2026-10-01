import { describe, it, expect, vi } from 'vitest';
import { TransactionManager } from './transactionManager';
import { InMemoryTransactionJournalStore } from './transactionJournalStore';
import { CapabilityRegistry } from '../contracts/capabilityRegistry';
import { RiskClass, RollbackLevel, SideEffectClass } from '../contracts/types';
import type { EngineeringModelPlan } from '../contracts/engineeringModel';
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

    const validInverterPlan: EngineeringModelPlan = {
      schemaVersion: '1.0.0',
      planId: 'plan_inverter_tx',
      projectId: 'proj_inv',
      baseRevision: 1,
      targetDomain: 'xbridges',
      designRationale: 'Transaction test for complete inverter',
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
          parameters: [{ blockId: 'v_ref', parameterName: 'frequency', value: 50 }, { blockId: 'v_ref', parameterName: 'amplitude', value: 1 }]
        },
        {
          id: 'pwm_gen',
          blockDefinitionId: 'THREE_PHASE_PWM',
          domain: 'xbridges',
          name: '3-Phase SPWM Modulator',
          parameters: [{ blockId: 'pwm_gen', parameterName: 'frequency', value: 10000 }]
        },
        {
          id: 'inv_bridge',
          blockDefinitionId: 'THREE_PHASE_INVERTER',
          domain: 'xbridges',
          name: '3-Phase Inverter Bridge',
          parameters: [{ blockId: 'inv_bridge', parameterName: 'Ron', value: 0.01 }]
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
        { id: 'c_dc_p', fromBlockId: 'dc_src', fromPortId: 'v_pos', toBlockId: 'inv_bridge', toPortId: 'vdc_p', domain: 'xbridges' },
        { id: 'c_dc_n', fromBlockId: 'dc_src', fromPortId: 'v_neg', toBlockId: 'inv_bridge', toPortId: 'vdc_n', domain: 'xbridges' },
        { id: 'c_ref_a', fromBlockId: 'v_ref', fromPortId: 'va', toBlockId: 'pwm_gen', toPortId: 'va_ref', domain: 'xbridges' },
        { id: 'c_ref_b', fromBlockId: 'v_ref', fromPortId: 'vb', toBlockId: 'pwm_gen', toPortId: 'vb_ref', domain: 'xbridges' },
        { id: 'c_ref_c', fromBlockId: 'v_ref', fromPortId: 'vc', toBlockId: 'pwm_gen', toPortId: 'vc_ref', domain: 'xbridges' },
        { id: 'c_pwm_a', fromBlockId: 'pwm_gen', fromPortId: 'ga', toBlockId: 'inv_bridge', toPortId: 'ga', domain: 'xbridges' },
        { id: 'c_pwm_b', fromBlockId: 'pwm_gen', fromPortId: 'gb', toBlockId: 'inv_bridge', toPortId: 'gb', domain: 'xbridges' },
        { id: 'c_pwm_c', fromBlockId: 'pwm_gen', fromPortId: 'gc', toBlockId: 'inv_bridge', toPortId: 'gc', domain: 'xbridges' },
        { id: 'c_out_a', fromBlockId: 'inv_bridge', fromPortId: 'va', toBlockId: 'ac_load', toPortId: 'va', domain: 'xbridges' },
        { id: 'c_out_b', fromBlockId: 'inv_bridge', fromPortId: 'vb', toBlockId: 'ac_load', toPortId: 'vb', domain: 'xbridges' },
        { id: 'c_out_c', fromBlockId: 'inv_bridge', fromPortId: 'vc', toBlockId: 'ac_load', toPortId: 'vc', domain: 'xbridges' }
      ],
      validationCriteria: []
    };

    const res = await tm.executeEngineeringPlan(validInverterPlan, 1);
    expect(res.success).toBe(true);
    expect(res.status).toBe('COMMITTED');
    expect(res.newRevision).toBe(2);
    expect(adapter.getAllBlocks()).toHaveLength(5);
    expect(adapter.getAllConnections()).toHaveLength(11);

    // Verify journal has entries
    const entries = await journalStore.getEntries('proj_inv');
    expect(entries.some(e => e.status === 'COMMITTED')).toBe(true);

    // Test Undo
    const commitRecord = entries.find(e => e.status === 'COMMITTED');
    const undoRes = await tm.undoTransaction(commitRecord!.transactionId, 'proj_inv', 2);
    expect(undoRes.success).toBe(true);
    expect(undoRes.status).toBe('ROLLED_BACK');
    expect(undoRes.newRevision).toBe(1);
    expect(adapter.getAllBlocks()).toHaveLength(0);
    expect(adapter.getAllConnections()).toHaveLength(0);
  });

  it('fails closed and rolls back cleanly without partial blocks on runtime fault', async () => {
    const { EngineeringModelAdapter } = await import('../adapters/engineeringModelAdapter');
    const adapter = new EngineeringModelAdapter('xbridges');
    const journalStore = new InMemoryTransactionJournalStore();
    const tm = new TransactionManager(registry, new Map([['xbridges', adapter]]), journalStore);

    const testPlan: EngineeringModelPlan = {
      schemaVersion: '1.0.0',
      planId: 'plan_faulty',
      projectId: 'proj_inv',
      baseRevision: 1,
      targetDomain: 'xbridges',
      designRationale: 'Faulty plan test',
      assumptions: [],
      blocks: [
        {
          id: 'g1',
          blockDefinitionId: 'GAIN',
          domain: 'xbridges',
          name: 'Gain 1',
          parameters: [{ blockId: 'g1', parameterName: 'gain', value: 2 }]
        },
        {
          id: 'g2',
          blockDefinitionId: 'GAIN',
          domain: 'xbridges',
          name: 'Gain 2',
          parameters: [{ blockId: 'g2', parameterName: 'gain', value: 3 }]
        }
      ],
      connections: [
        { id: 'c1', fromBlockId: 'g1', fromPortId: 'y', toBlockId: 'g2', toPortId: 'u', domain: 'xbridges' }
      ],
      validationCriteria: []
    };

    // Inject failure on second block
    const origAdd = adapter.addBlock.bind(adapter);
    let callCount = 0;
    adapter.addBlock = async (b) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Mid-execution disk or hardware fault');
      }
      return origAdd(b);
    };

    const res = await tm.executeEngineeringPlan(testPlan, 1);
    expect(res.success).toBe(false);
    expect(res.status).toBe('ROLLED_BACK');
    expect(res.newRevision).toBe(1); // Revision unchanged
    // Adapter must not retain partial blocks
    expect(adapter.getAllBlocks()).toHaveLength(0);
  });

  it('fails closed and restores snapshot if failure occurs during parameter assignment, connection, or save', async () => {
    const { EngineeringModelAdapter } = await import('../adapters/engineeringModelAdapter');
    const adapter = new EngineeringModelAdapter('xbridges');
    const journalStore = new InMemoryTransactionJournalStore();
    const tm = new TransactionManager(registry, new Map([['xbridges', adapter]]), journalStore);

    const testPlan: EngineeringModelPlan = {
      schemaVersion: '1.0.0',
      planId: 'plan_conn_fail',
      projectId: 'proj_inv',
      baseRevision: 1,
      targetDomain: 'xbridges',
      designRationale: 'Connection failure test',
      assumptions: [],
      blocks: [
        { id: 'g1', blockDefinitionId: 'GAIN', domain: 'xbridges', name: 'Gain 1', parameters: [] },
        { id: 'g2', blockDefinitionId: 'GAIN', domain: 'xbridges', name: 'Gain 2', parameters: [] }
      ],
      connections: [
        { id: 'c1', fromBlockId: 'g1', fromPortId: 'y', toBlockId: 'g2', toPortId: 'u', domain: 'xbridges' }
      ],
      validationCriteria: []
    };

    // Inject failure on connection
    adapter.connectPorts = async () => {
      throw new Error('Injected connection port incompatibility');
    };

    const res = await tm.executeEngineeringPlan(testPlan, 1);
    expect(res.success).toBe(false);
    expect(res.status).toBe('ROLLED_BACK');
    expect(adapter.getAllBlocks()).toHaveLength(0);
    expect(adapter.getAllConnections()).toHaveLength(0);
  });

  it('aborts cleanly when AbortSignal is cancelled before or during execution', async () => {
    const { EngineeringModelAdapter } = await import('../adapters/engineeringModelAdapter');
    const adapter = new EngineeringModelAdapter('xbridges');
    const journalStore = new InMemoryTransactionJournalStore();
    const tm = new TransactionManager(registry, new Map([['xbridges', adapter]]), journalStore);

    const testPlan: EngineeringModelPlan = {
      schemaVersion: '1.0.0',
      planId: 'plan_abort',
      projectId: 'proj_inv',
      baseRevision: 1,
      targetDomain: 'xbridges',
      designRationale: 'Abort test',
      assumptions: [],
      blocks: [
        { id: 'g1', blockDefinitionId: 'GAIN', domain: 'xbridges', name: 'Gain 1', parameters: [] }
      ],
      connections: [],
      validationCriteria: []
    };

    const controller = new AbortController();
    controller.abort(); // pre-aborted

    const res = await tm.executeEngineeringPlan(testPlan, 1, { signal: controller.signal });
    expect(res.success).toBe(false);
    expect(res.status).toBe('ROLLED_BACK');
    expect(adapter.getAllBlocks()).toHaveLength(0);
  });

  it('rejects transaction undo if project revision changed due to subsequent edits', async () => {
    const { EngineeringModelAdapter } = await import('../adapters/engineeringModelAdapter');
    const adapter = new EngineeringModelAdapter('xbridges');
    const journalStore = new InMemoryTransactionJournalStore();
    const tm = new TransactionManager(registry, new Map([['xbridges', adapter]]), journalStore);

    const testPlan: EngineeringModelPlan = {
      schemaVersion: '1.0.0',
      planId: 'plan_revision_check',
      projectId: 'proj_rev',
      baseRevision: 1,
      targetDomain: 'xbridges',
      designRationale: 'Revision test',
      assumptions: [],
      blocks: [
        { id: 'g1', blockDefinitionId: 'GAIN', domain: 'xbridges', name: 'Gain 1', parameters: [] }
      ],
      connections: [],
      validationCriteria: []
    };

    const res = await tm.executeEngineeringPlan(testPlan, 1);
    expect(res.success).toBe(true);
    expect(res.newRevision).toBe(2);

    const entries = await journalStore.getEntries('proj_rev');
    const commitRecord = entries.find(e => e.status === 'COMMITTED');

    // Attempt undo with stale revision 3 (simulating user edit)
    const staleUndo = await tm.undoTransaction(commitRecord!.transactionId, 'proj_rev', 3);
    expect(staleUndo.success).toBe(false);
    expect(staleUndo.status).toBe('REJECTED');
    expect(staleUndo.error).toMatch(/Stale undo/i);
    // Blocks should NOT be deleted
    expect(adapter.getAllBlocks()).toHaveLength(1);
  });
});
