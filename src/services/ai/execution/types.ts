export type TransactionStatus = 'PREPARED' | 'EXECUTED' | 'COMMITTED' | 'ROLLED_BACK' | 'REJECTED' | 'RECOVERY_REQUIRED';

export interface ExecutionContext {
  projectId: string;
  workspaceRevision: number;
  isDryRun: boolean;
  abortSignal?: AbortSignal;
}

export interface ExecutionResult {
  success: boolean;
  status: TransactionStatus;
  planId: string;
  executedActionIds: string[];
  rolledBackActionIds: string[];
  newRevision: number;
  error?: string;
}

export interface PreparedAction<TSnapshot = any> {
  snapshot: TSnapshot;
  beforeStateHash: string;
}
