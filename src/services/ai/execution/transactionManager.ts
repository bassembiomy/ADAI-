import { PlanEnvelope } from '../planner/planSchemas';
import { PlanValidator } from '../planner/planValidator';
import { CapabilityRegistry } from '../contracts/capabilityRegistry';
import { ExecutionContext, ExecutionResult } from './types';
import { ITransactionJournalStore } from './transactionJournalStore';

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
