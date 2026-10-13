import { v4 as uuidv4 } from 'uuid';
import {
  LiveXbridgesModelAdapter,
  ModelSnapshot,
  ObservedActionResult
} from '../adapters/liveXbridgesModelAdapter';
import { XbridgesApplicationDelegate } from '../../../agent/applicationDelegates';
import { EngineeringModelPlanV2, XbridgesAction } from '../contracts/engineeringModel';
import { XbridgesProof } from '../proof/xbridgesProofRunner';
import { computeModelFingerprint } from '../../../engine/opm/canonicalHash';

export type TransactionStatus =
  | 'prepared'
  | 'awaiting_action'
  | 'executing_action'
  | 'verifying_action'
  | 'final_verification'
  | 'committed'
  | 'rolling_back'
  | 'rolled_back'
  | 'failed_rollback';

export interface ActionApprovalBinding {
  readonly token: string;
  readonly projectId: string;
  readonly baseRevision: number;
  readonly planHash: string;
  readonly actionId: string;
  readonly actionKind: XbridgesAction['kind'];
  readonly canonicalParamsHash: string;
}

export interface ProvedPlan {
  readonly plan: EngineeringModelPlanV2;
  readonly proof: XbridgesProof;
}

export interface TransactionState {
  readonly transactionId: string;
  readonly projectId: string;
  readonly baseRevision: number;
  readonly planHash: string;
  readonly status: TransactionStatus;
  readonly nextActionIndex: number;
  readonly totalActions: number;
  readonly executedActions: readonly string[];
}

export interface RollbackResult {
  readonly success: boolean;
  readonly transactionId: string;
  readonly restoredRevision: number;
  readonly restoredStateHash: string;
  readonly reason: string;
  readonly error?: string;
}

export interface CommittedTransaction {
  readonly transactionId: string;
  readonly projectId: string;
  readonly baseRevision: number;
  readonly committedRevision: number;
  readonly planHash: string;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly actionsExecuted: number;
  readonly committedAt: number;
}

export class TransactionError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'TransactionError';
    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

export interface TransactionProjectContext {
  readonly projectId: string;
  getRevision: () => number;
  setRevision?: (newRevision: number) => void;
}

/** In-memory committed transactions journal for undo */
const COMMITTED_TRANSACTIONS = new Map<
  string,
  {
    record: CommittedTransaction;
    initialSnapshot: ModelSnapshot;
  }
>();

export class XbridgesAgentTransaction {
  private transactionId: string = '';
  private status: TransactionStatus = 'prepared';
  private plan?: EngineeringModelPlanV2;
  private proof?: XbridgesProof;
  private initialSnapshot?: ModelSnapshot;
  private initialFingerprint?: string;
  private nextActionIndex: number = 0;
  private readonly executedActionIds: string[] = [];
  private readonly consumedTokens = new Set<string>();

  constructor(
    private readonly adapter: LiveXbridgesModelAdapter,
    private readonly delegate: XbridgesApplicationDelegate,
    private readonly projectContext?: TransactionProjectContext
  ) {}

  public getState(): TransactionState {
    return {
      transactionId: this.transactionId,
      projectId: this.plan?.projectId ?? this.projectContext?.projectId ?? '',
      baseRevision: this.plan?.baseRevision ?? 0,
      planHash: this.plan?.planHash ?? '',
      status: this.status,
      nextActionIndex: this.nextActionIndex,
      totalActions: this.plan?.actions.length ?? 0,
      executedActions: [...this.executedActionIds]
    };
  }

  public async begin(provedPlan: ProvedPlan): Promise<TransactionState> {
    const { plan, proof } = provedPlan;

    if (!proof || proof.status !== 'proved') {
      throw new TransactionError(
        'UNPROVED_PLAN: Plan cannot be executed because isolated proof is missing or status is not "proved".',
        'UNPROVED_PLAN'
      );
    }

    if (proof.planHash !== plan.planHash) {
      throw new TransactionError(
        `UNPROVED_PLAN: Proof planHash '${proof.planHash}' does not match plan planHash '${plan.planHash}'.`,
        'UNPROVED_PLAN'
      );
    }

    this.transactionId = `tx_${uuidv4()}`;
    this.plan = plan;
    this.proof = proof;
    this.nextActionIndex = 0;
    this.executedActionIds.length = 0;
    this.consumedTokens.clear();

    this.initialSnapshot = await this.adapter.inspect();
    if (this.delegate.getRevisionFingerprint) {
      this.initialFingerprint = await this.delegate.getRevisionFingerprint();
    } else {
      this.initialFingerprint = this.initialSnapshot.stateHash;
    }

    this.status = 'awaiting_action';
    return this.getState();
  }

  public async approveAndExecute(binding: ActionApprovalBinding): Promise<ObservedActionResult> {
    if (!this.plan || !this.proof) {
      throw new TransactionError('Transaction not started. Call begin() first.', 'NOT_INITIALIZED');
    }

    if (this.status !== 'awaiting_action' && this.status !== 'prepared') {
      throw new TransactionError(
        `Cannot execute action in transaction status '${this.status}'. Expected 'awaiting_action'.`,
        'INVALID_STATE'
      );
    }

    // 1. Single-use token verification
    if (this.consumedTokens.has(binding.token)) {
      throw new TransactionError(
        `TOKEN_ALREADY_CONSUMED: Approval token '${binding.token}' was already used and cannot be replayed.`,
        'TOKEN_ALREADY_CONSUMED'
      );
    }

    // 2. Revision check
    if (binding.baseRevision !== this.plan.baseRevision) {
      throw new TransactionError(
        `STALE_REVISION: Approval bound to baseRevision ${binding.baseRevision}, but transaction plan is at baseRevision ${this.plan.baseRevision}.`,
        'STALE_REVISION'
      );
    }

    // 3. Project check
    if (binding.projectId !== this.plan.projectId) {
      throw new TransactionError(
        `PROJECT_MISMATCH: Approval bound to project '${binding.projectId}', but transaction is for '${this.plan.projectId}'.`,
        'PROJECT_MISMATCH'
      );
    }

    // 4. Plan hash check
    if (binding.planHash !== this.plan.planHash) {
      throw new TransactionError(
        `PLAN_HASH_MISMATCH: Approval bound to planHash '${binding.planHash}', but transaction plan has hash '${this.plan.planHash}'.`,
        'PLAN_HASH_MISMATCH'
      );
    }

    // 5. Sequence and order check
    const expectedAction = this.plan.actions[this.nextActionIndex];
    if (!expectedAction) {
      throw new TransactionError(
        'OUT_OF_ORDER_ACTION: All planned actions have already been executed.',
        'OUT_OF_ORDER_ACTION'
      );
    }

    if (expectedAction.id !== binding.actionId) {
      throw new TransactionError(
        `OUT_OF_ORDER_ACTION: Next sequential action is '${expectedAction.id}', but approval was for '${binding.actionId}'.`,
        'OUT_OF_ORDER_ACTION'
      );
    }

    // 6. Action kind check
    if (expectedAction.kind !== binding.actionKind) {
      throw new TransactionError(
        `ACTION_KIND_MISMATCH: Expected action kind '${expectedAction.kind}', but approval specified '${binding.actionKind}'.`,
        'ACTION_KIND_MISMATCH'
      );
    }

    // 7. Canonical parameter hash check
    const expectedParamsHash = computeModelFingerprint(expectedAction);
    if (binding.canonicalParamsHash !== expectedParamsHash) {
      throw new TransactionError(
        `PARAM_HASH_MISMATCH: Parameters for action '${expectedAction.id}' do not match approved canonical hash.`,
        'PARAM_HASH_MISMATCH'
      );
    }

    // Consume token
    this.consumedTokens.add(binding.token);
    this.status = 'executing_action';

    try {
      // Execute single typed action
      const actionResult = await this.adapter.executeAction(expectedAction);

      this.status = 'verifying_action';

      if (actionResult.beforeHash === actionResult.afterHash) {
        throw new TransactionError(
          `UNCHANGED_STATE: Action '${expectedAction.id}' produced identical pre- and post-action state fingerprints.`,
          'UNCHANGED_STATE'
        );
      }

      this.executedActionIds.push(expectedAction.id);
      this.nextActionIndex++;

      if (this.nextActionIndex >= this.plan.actions.length) {
        this.status = 'final_verification';
      } else {
        this.status = 'awaiting_action';
      }

      return actionResult;
    } catch (err: unknown) {
      // Mid-transaction failure: immediately rollback whole transaction
      const reason = err instanceof Error ? err.message : String(err);
      await this.rollback(`Action failure on '${expectedAction.id}': ${reason}`);
      throw err;
    }
  }

  public async reject(actionId: string): Promise<RollbackResult> {
    return this.rollback(`Rejected action '${actionId}' by user`);
  }

  public async cancel(): Promise<RollbackResult> {
    return this.rollback('Cancelled by user');
  }

  public async rollback(reason: string): Promise<RollbackResult> {
    this.status = 'rolling_back';

    try {
      if (this.initialSnapshot) {
        await this.adapter.restore(this.initialSnapshot);
      }

      // Check restored fingerprint
      let restoredFp = '';
      if (this.delegate.getRevisionFingerprint) {
        restoredFp = await this.delegate.getRevisionFingerprint();
      }

      const expectedFingerprint = this.initialFingerprint || this.initialSnapshot?.stateHash || '';
      if (!restoredFp || restoredFp !== expectedFingerprint) {
        throw new TransactionError(
          `ROLLBACK_FINGERPRINT_MISMATCH: Restored fingerprint '${restoredFp}' does not match initial fingerprint '${expectedFingerprint}'.`,
          'ROLLBACK_FINGERPRINT_MISMATCH'
        );
      }

      this.status = 'rolled_back';

      return {
        success: true,
        transactionId: this.transactionId,
        restoredRevision: this.initialSnapshot?.revision ?? 0,
        restoredStateHash: restoredFp || this.initialSnapshot?.stateHash || '',
        reason
      };
    } catch (err: unknown) {
      this.status = 'failed_rollback';
      return {
        success: false,
        transactionId: this.transactionId,
        restoredRevision: this.initialSnapshot?.revision ?? 0,
        restoredStateHash: '',
        reason,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  public async commit(): Promise<CommittedTransaction> {
    if (this.status !== 'final_verification') {
      throw new TransactionError(
        `Cannot commit transaction in status '${this.status}'. Expected 'final_verification'.`,
        'INVALID_COMMIT_STATE'
      );
    }

    if (!this.plan || !this.initialSnapshot) {
      throw new TransactionError('Transaction state corrupted', 'INTERNAL_ERROR');
    }

    const currentLiveSnapshot = await this.adapter.inspect();
    const liveFingerprint = this.delegate.getRevisionFingerprint
      ? await this.delegate.getRevisionFingerprint()
      : currentLiveSnapshot.stateHash;

    // Persist via saveAndReadBack
    const readBack = await this.delegate.saveAndReadBack();

    if (readBack.fingerprint !== liveFingerprint) {
      await this.rollback(
        `COMMIT_READBACK_MISMATCH: Live state fingerprint '${liveFingerprint}' does not match read-back persistence '${readBack.fingerprint}'.`
      );
      if (this.delegate.save) {
        await this.delegate.save();
      }
      throw new TransactionError(
        `COMMIT_READBACK_MISMATCH: Live state fingerprint '${liveFingerprint}' does not match read-back persistence '${readBack.fingerprint}'.`,
        'COMMIT_READBACK_MISMATCH'
      );
    }

    const baseRevision = this.plan.baseRevision;
    const committedRevision = baseRevision + 1;

    if (this.projectContext?.setRevision) {
      this.projectContext.setRevision(committedRevision);
    }

    const committedRecord: CommittedTransaction = {
      transactionId: this.transactionId,
      projectId: this.plan.projectId,
      baseRevision,
      committedRevision,
      planHash: this.plan.planHash,
      beforeHash: this.initialFingerprint || this.initialSnapshot.stateHash,
      afterHash: readBack.fingerprint,
      actionsExecuted: this.executedActionIds.length,
      committedAt: Date.now()
    };

    COMMITTED_TRANSACTIONS.set(this.transactionId, {
      record: committedRecord,
      initialSnapshot: this.initialSnapshot
    });

    this.status = 'committed';
    return committedRecord;
  }

  public async undo(transactionId: string): Promise<RollbackResult> {
    const entry = COMMITTED_TRANSACTIONS.get(transactionId);
    if (!entry) {
      throw new TransactionError(`Transaction '${transactionId}' not found in journal.`, 'TX_NOT_FOUND');
    }

    const currentFingerprint = this.delegate.getRevisionFingerprint
      ? await this.delegate.getRevisionFingerprint()
      : (await this.adapter.inspect()).stateHash;
    if (currentFingerprint !== entry.record.afterHash) {
      throw new TransactionError(
        `CURRENT_STATE_CHANGED: Cannot undo transaction '${transactionId}' because the current fingerprint '${currentFingerprint}' does not match committed fingerprint '${entry.record.afterHash}'.`,
        'CURRENT_STATE_CHANGED'
      );
    }

    await this.adapter.restore(entry.initialSnapshot);
    await this.delegate.save();

    if (this.projectContext?.setRevision) {
      this.projectContext.setRevision(entry.initialSnapshot.revision);
    }

    let restoredFp = '';
    if (this.delegate.getRevisionFingerprint) {
      restoredFp = await this.delegate.getRevisionFingerprint();
    }

    if (restoredFp && restoredFp !== entry.record.beforeHash) {
      throw new TransactionError(
        `UNDO_FINGERPRINT_MISMATCH: Restored fingerprint '${restoredFp}' does not match pre-transaction fingerprint '${entry.record.beforeHash}'.`,
        'UNDO_FINGERPRINT_MISMATCH'
      );
    }

    COMMITTED_TRANSACTIONS.delete(transactionId);

    return {
      success: true,
      transactionId,
      restoredRevision: entry.initialSnapshot.revision,
      restoredStateHash: restoredFp || entry.initialSnapshot.stateHash,
      reason: `Undo of committed transaction '${transactionId}'`
    };
  }
}
