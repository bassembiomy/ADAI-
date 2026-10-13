import {
  XbridgesAgentTransaction,
  ProvedPlan,
  TransactionState,
  ActionApprovalBinding,
  CommittedTransaction,
  RollbackResult
} from '../../services/ai/execution/xbridgesAgentTransaction';
import { LiveXbridgesModelAdapter, ObservedActionResult } from '../../services/ai/adapters/liveXbridgesModelAdapter';
import { XbridgesApplicationDelegate } from '../applicationDelegates';

export class TransactionCollaborator {
  private currentTransaction?: XbridgesAgentTransaction;

  public getTransaction(): XbridgesAgentTransaction | undefined {
    return this.currentTransaction;
  }

  public async beginTransaction(
    adapter: LiveXbridgesModelAdapter,
    delegate: XbridgesApplicationDelegate,
    provedPlan: ProvedPlan,
    projectContext?: { projectId: string; getRevision: () => number; setRevision?: (rev: number) => void }
  ): Promise<TransactionState> {
    this.currentTransaction = new XbridgesAgentTransaction(adapter, delegate, projectContext);
    return this.currentTransaction.begin(provedPlan);
  }

  public prepareNextApproval(): ActionApprovalBinding {
    if (!this.currentTransaction) {
      throw new Error('No active transaction');
    }
    const state = this.currentTransaction.getState();
    return {
      token: `tok_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      projectId: state.projectId,
      baseRevision: state.baseRevision,
      planHash: state.planHash,
      actionId: `act_${state.nextActionIndex}`,
      actionKind: 'add_block',
      canonicalParamsHash: 'canonical_params'
    };
  }

  public async executeApproved(binding: ActionApprovalBinding): Promise<ObservedActionResult> {
    if (!this.currentTransaction) {
      throw new Error('No active transaction');
    }
    return this.currentTransaction.approveAndExecute(binding);
  }

  public async commit(): Promise<CommittedTransaction | undefined> {
    if (!this.currentTransaction) {
      return undefined;
    }
    const state = this.currentTransaction.getState();
    if (state.status !== 'final_verification') {
      return undefined;
    }
    const committed = await this.currentTransaction.commit();
    this.currentTransaction = undefined;
    return committed;
  }

  public async rollback(reason: string): Promise<RollbackResult> {
    if (!this.currentTransaction) {
      return { success: true, transactionId: '', restoredRevision: 0, restoredStateHash: '', reason };
    }
    const result = await this.currentTransaction.rollback(reason);
    this.currentTransaction = undefined;
    return result;
  }

  public async reject(token: string, reason?: string): Promise<RollbackResult> {
    if (!this.currentTransaction) {
      return { success: true, transactionId: '', restoredRevision: 0, restoredStateHash: '', reason: reason || 'Rejected' };
    }
    const result = await this.currentTransaction.reject(token);
    this.currentTransaction = undefined;
    return result;
  }

  public async cancel(): Promise<RollbackResult> {
    if (!this.currentTransaction) {
      return { success: true, transactionId: '', restoredRevision: 0, restoredStateHash: '', reason: 'No active transaction' };
    }
    const result = await this.currentTransaction.cancel();
    this.currentTransaction = undefined;
    return result;
  }
}
