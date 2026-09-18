import { PlanEnvelope } from '../planner/planSchemas';
import { PlanValidator } from '../planner/planValidator';
import { CapabilityRegistry } from '../contracts/capabilityRegistry';
import { ExecutionContext, ExecutionResult } from './types';
import { ITransactionJournalStore } from './transactionJournalStore';
import { EngineeringModelPlan } from '../contracts/engineeringModel';
import { PlanPreflight } from '../planner/planPreflight';

interface ActionRecord {
  actionId: string;
  module: string;
  action: any;
  prepared?: any;
  result?: any;
  scopedKey: string;
}

export class TransactionManager {
  constructor(
    private registry: CapabilityRegistry,
    private adapters: Map<string, any>,
    private journalStore: ITransactionJournalStore
  ) {}

  public async recoverIncompleteTransactions(projectId: string): Promise<void> {
    const incomplete = await this.journalStore.getIncompleteTransactions(projectId);
    for (const tx of incomplete) {
      if (tx.preparedSnapshot) {
        const adapter = this.adapters.get('xbridges');
        if (adapter && typeof adapter.restoreSnapshot === 'function') {
          await adapter.restoreSnapshot(tx.preparedSnapshot);
        }
      }
      await this.journalStore.markStatus(tx.transactionId, projectId, tx.planId || '', 'ROLLED_BACK', 'Recovered at startup');
    }
  }

  public async executeEngineeringPlan(
    plan: EngineeringModelPlan,
    currentRevision: number,
    options?: { allowedBridgePairs?: Array<{ fromDomain: any; toDomain: any }> }
  ): Promise<ExecutionResult> {
    const preflightRes = PlanPreflight.preflight(plan, {
      currentRevision,
      allowedBridgePairs: options?.allowedBridgePairs
    });

    if (!preflightRes.passed) {
      return {
        success: false,
        status: 'REJECTED',
        planId: plan.planId,
        executedActionIds: [],
        rolledBackActionIds: [],
        newRevision: currentRevision,
        error: preflightRes.diagnostics[0]?.message || 'Plan preflight validation failed'
      };
    }

    const adapter = this.adapters.get(plan.targetDomain);
    if (!adapter) {
      return {
        success: false,
        status: 'REJECTED',
        planId: plan.planId,
        executedActionIds: [],
        rolledBackActionIds: [],
        newRevision: currentRevision,
        error: `No adapter registered for target domain: ${plan.targetDomain}`
      };
    }

    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const context: ExecutionContext = {
      projectId: plan.projectId,
      workspaceRevision: currentRevision,
      isDryRun: false
    };

    let initialSnapshot: any = null;
    let beforeHash = '';
    if (typeof adapter.createSnapshot === 'function') {
      initialSnapshot = adapter.createSnapshot();
    } else if (typeof adapter.prepare === 'function') {
      const prep = await adapter.prepare({ type: 'INIT' }, context);
      initialSnapshot = prep?.snapshot;
    }
    if (typeof adapter.getStateHash === 'function') {
      beforeHash = adapter.getStateHash();
    }

    await this.journalStore.append({
      transactionId,
      projectId: plan.projectId,
      planId: plan.planId,
      actionId: 'init',
      scopedKey: `${plan.projectId}:plan:${plan.planId}:init`,
      preparedSnapshot: initialSnapshot,
      beforeStateHash: beforeHash,
      result: null,
      status: 'PREPARED',
      timestamp: Date.now()
    });

    const executedActions: string[] = [];

    try {
      // 1. Add blocks and set parameters
      for (const block of plan.blocks) {
        const actionId = `add_block_${block.id}`;
        if (typeof adapter.addBlock === 'function') {
          const res = await adapter.addBlock(block);
          if (res && res.success === false) {
            throw new Error(res.error || `Failed to add block '${block.id}'`);
          }
          if (typeof adapter.verifyBlockExists === 'function') {
            if (!adapter.verifyBlockExists(block.id, block.blockDefinitionId)) {
              throw new Error(`Verification failed for block '${block.id}'`);
            }
          }
        } else if (typeof adapter.execute === 'function') {
          await adapter.execute({ type: 'XB_CREATE_BLOCK', payload: { blockId: block.id, blockType: block.blockDefinitionId } }, context);
        }
        executedActions.push(actionId);

        for (const p of block.parameters) {
          if (typeof adapter.setParameter === 'function') {
            const pRes = await adapter.setParameter(block.id, p.parameterName, p.value);
            if (pRes && pRes.success === false) {
              throw new Error(pRes.error || `Failed to set parameter '${p.parameterName}' on block '${block.id}'`);
            }
          }
        }
      }

      // 2. Connect ports
      for (const conn of plan.connections) {
        const actionId = `connect_${conn.id}`;
        if (typeof adapter.connectPorts === 'function') {
          const res = await adapter.connectPorts(conn);
          if (res && res.success === false) {
            throw new Error(res.error || `Failed to connect '${conn.id}'`);
          }
          if (typeof adapter.verifyConnectionExists === 'function') {
            if (!adapter.verifyConnectionExists(conn.id)) {
              throw new Error(`Verification failed for connection '${conn.id}'`);
            }
          }
        } else if (typeof adapter.execute === 'function') {
          await adapter.execute({
            type: 'XB_CONNECT_PORTS',
            payload: {
              connectionId: conn.id,
              sourceBlockId: conn.fromBlockId,
              sourcePortId: conn.fromPortId,
              targetBlockId: conn.toBlockId,
              targetPortId: conn.toPortId,
              domainType: conn.domain
            }
          }, context);
        }
        executedActions.push(actionId);
      }

      await this.journalStore.append({
        transactionId,
        projectId: plan.projectId,
        planId: plan.planId,
        actionId: 'commit',
        scopedKey: `${plan.projectId}:plan:${plan.planId}:commit`,
        preparedSnapshot: initialSnapshot,
        result: { blockCount: plan.blocks.length, connectionCount: plan.connections.length },
        status: 'COMMITTED',
        timestamp: Date.now()
      });
      await this.journalStore.markStatus(transactionId, plan.projectId, plan.planId, 'COMMITTED');

      return {
        success: true,
        status: 'COMMITTED',
        planId: plan.planId,
        executedActionIds: executedActions,
        rolledBackActionIds: [],
        newRevision: currentRevision + 1
      };
    } catch (err: any) {
      if (initialSnapshot) {
        if (typeof adapter.restoreSnapshot === 'function') {
          await adapter.restoreSnapshot(initialSnapshot);
        }
      }
      await this.journalStore.markStatus(transactionId, plan.projectId, plan.planId, 'ROLLED_BACK', err.message);

      return {
        success: false,
        status: 'ROLLED_BACK',
        planId: plan.planId,
        executedActionIds: executedActions,
        rolledBackActionIds: executedActions,
        newRevision: currentRevision,
        error: err.message
      };
    }
  }

  public async undoTransaction(transactionId: string, projectId: string): Promise<ExecutionResult> {
    const entries = await this.journalStore.getEntries(projectId);
    const txRecords = entries.filter(r => r.transactionId === transactionId);
    if (txRecords.length === 0) {
      return {
        success: false,
        status: 'REJECTED',
        planId: '',
        executedActionIds: [],
        rolledBackActionIds: [],
        newRevision: 0,
        error: `Transaction '${transactionId}' not found.`
      };
    }

    const initRecord = txRecords.find(r => r.actionId === 'init' || r.preparedSnapshot);
    const commitRecord = txRecords.find(r => r.status === 'COMMITTED');

    if (!commitRecord) {
      return {
        success: false,
        status: 'REJECTED',
        planId: txRecords[0].planId || '',
        executedActionIds: [],
        rolledBackActionIds: [],
        newRevision: 0,
        error: `Transaction '${transactionId}' is not committed.`
      };
    }

    if (initRecord?.preparedSnapshot) {
      for (const adapter of this.adapters.values()) {
        if (typeof adapter.restoreSnapshot === 'function') {
          await adapter.restoreSnapshot(initRecord.preparedSnapshot);
        }
      }
    }

    await this.journalStore.markStatus(transactionId, projectId, txRecords[0].planId || '', 'ROLLED_BACK', 'Undone by user');

    return {
      success: true,
      status: 'ROLLED_BACK',
      planId: txRecords[0].planId || '',
      executedActionIds: [],
      rolledBackActionIds: txRecords.map(r => r.actionId || '').filter(Boolean),
      newRevision: 0
    };
  }

  public async executePlan(rawPlan: any, currentRevision: number, existingEntityIds: Set<string>): Promise<ExecutionResult> {
    if (rawPlan.baseRevision !== currentRevision) {
      return {
        success: false,
        status: 'REJECTED',
        planId: rawPlan.planId || 'unknown',
        executedActionIds: [],
        rolledBackActionIds: [],
        newRevision: currentRevision,
        error: `Revision conflict: expected ${rawPlan.baseRevision}, current is ${currentRevision}`
      };
    }

    const valResult = PlanValidator.validate(rawPlan, this.registry, { existingEntityIds });
    if (!valResult.isValid) {
      return {
        success: false,
        status: 'REJECTED',
        planId: rawPlan.planId || 'unknown',
        executedActionIds: [],
        rolledBackActionIds: [],
        newRevision: currentRevision,
        error: valResult.diagnostics[0]?.message || 'Plan validation failed'
      };
    }

    const plan = rawPlan as PlanEnvelope;
    const actionMap = new Map(plan.actions.map(a => [a.actionId, a]));
    const actionHistory: ActionRecord[] = [];

    const context: ExecutionContext = {
      projectId: plan.projectId,
      workspaceRevision: currentRevision,
      isDryRun: false
    };

    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    for (const actionId of valResult.sortedActionIds) {
      const action = actionMap.get(actionId)!;
      const scopedKey = `${plan.projectId}:${action.type}:${action.actionSchemaVersion}:${action.idempotencyKey}`;

      if (await this.journalStore.isKeyCommitted(scopedKey)) {
        continue;
      }

      const adapter = this.adapters.get(action.targetModule);
      if (!adapter) {
        return this.rollback(transactionId, plan.planId, actionHistory, context, `No adapter registered for module: ${action.targetModule}`);
      }

      const actionVal = await adapter.validate(action, context);
      if (!actionVal.isValid) {
        return this.rollback(transactionId, plan.planId, actionHistory, context, actionVal.diagnostics[0]?.message || 'Adapter validation failed');
      }

      let prepared = null;
      if (typeof adapter.prepare === 'function') {
        prepared = await adapter.prepare(action, context);
      }

      const actionRecord: ActionRecord = {
        actionId,
        module: action.targetModule,
        action,
        prepared,
        result: null,
        scopedKey
      };
      // Record PREPARED in memory history BEFORE execute
      actionHistory.push(actionRecord);

      await this.journalStore.append({
        transactionId,
        projectId: plan.projectId,
        planId: plan.planId,
        actionId,
        scopedKey,
        preparedSnapshot: prepared?.snapshot,
        beforeStateHash: prepared?.beforeStateHash,
        result: null,
        status: 'PREPARED',
        timestamp: Date.now()
      });

      try {
        const result = await adapter.execute(action, context);
        actionRecord.result = result;

        await this.journalStore.append({
          transactionId,
          projectId: plan.projectId,
          planId: plan.planId,
          actionId,
          scopedKey,
          preparedSnapshot: prepared?.snapshot,
          beforeStateHash: prepared?.beforeStateHash,
          result,
          status: 'EXECUTED',
          timestamp: Date.now()
        });

        const verifyRes = await adapter.verify(action, result, context);
        if (!verifyRes.isVerified) {
          return this.rollback(transactionId, plan.planId, actionHistory, context, verifyRes.diagnostics[0]?.message || 'Verification failed');
        }
      } catch (err: any) {
        return this.rollback(transactionId, plan.planId, actionHistory, context, err.message);
      }
    }

    await this.journalStore.commitKeys(transactionId, actionHistory.map(h => h.scopedKey));
    await this.journalStore.markStatus(transactionId, plan.projectId, plan.planId, 'COMMITTED');

    return {
      success: true,
      status: 'COMMITTED',
      planId: plan.planId,
      executedActionIds: actionHistory.map(h => h.actionId),
      rolledBackActionIds: [],
      newRevision: currentRevision + 1
    };
  }

  private async rollback(
    transactionId: string,
    planId: string,
    history: ActionRecord[],
    context: ExecutionContext,
    reason: string
  ): Promise<ExecutionResult> {
    const rolledBackIds: string[] = [];
    let recoveryRequired = false;

    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      const adapter = this.adapters.get(item.module);
      if (adapter) {
        try {
          if (typeof adapter.rollback === 'function') {
            await adapter.rollback(item.result, context, item.prepared);
          }

          if (typeof adapter.getStateHash === 'function' && item.prepared?.beforeStateHash) {
            let currentHash = adapter.getStateHash();
            if (currentHash !== item.prepared.beforeStateHash) {
              // Attempt deep snapshot fallback
              if (typeof adapter.restoreSnapshot === 'function' && item.prepared?.snapshot) {
                await adapter.restoreSnapshot(item.prepared.snapshot);
                currentHash = adapter.getStateHash();
              }
              if (currentHash !== item.prepared.beforeStateHash) {
                recoveryRequired = true;
              }
            }
          }
          rolledBackIds.push(item.actionId);
        } catch (e) {
          console.error(`Rollback failure on action ${item.actionId}`, e);
          recoveryRequired = true;
        }
      }
    }

    const finalStatus = recoveryRequired ? 'RECOVERY_REQUIRED' : 'ROLLED_BACK';
    await this.journalStore.markStatus(transactionId, context.projectId, planId, finalStatus, reason);

    return {
      success: false,
      status: finalStatus,
      planId,
      executedActionIds: history.map(h => h.actionId),
      rolledBackActionIds: rolledBackIds,
      newRevision: context.workspaceRevision,
      error: reason
    };
  }
}
