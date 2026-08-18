import { TransactionStatus } from './types';

export interface JournalRecord {
  transactionId: string;
  projectId: string;
  planId?: string;
  actionId?: string;
  scopedKey?: string;
  preparedSnapshot?: any;
  beforeStateHash?: string;
  result?: any;
  status: TransactionStatus;
  timestamp: number;
  error?: string;
}

export interface ITransactionJournalStore {
  append(record: JournalRecord): Promise<void>;
  markStatus(transactionId: string, projectId: string, planId: string, status: TransactionStatus, error?: string): Promise<void>;
  isKeyCommitted(scopedKey: string): Promise<boolean>;
  commitKeys(transactionId: string, keys: string[]): Promise<void>;
  getEntries(projectId: string): Promise<JournalRecord[]>;
  getIncompleteTransactions(projectId: string): Promise<JournalRecord[]>;
}

export class InMemoryTransactionJournalStore implements ITransactionJournalStore {
  private records: JournalRecord[] = [];
  private committedKeys = new Set<string>();

  async append(record: JournalRecord): Promise<void> {
    this.records.push({ ...record });
  }

  async markStatus(transactionId: string, projectId: string, planId: string, status: TransactionStatus, error?: string): Promise<void> {
    this.records.push({ transactionId, projectId, planId, status, error, timestamp: Date.now() });
  }

  async isKeyCommitted(scopedKey: string): Promise<boolean> {
    return this.committedKeys.has(scopedKey);
  }

  async commitKeys(transactionId: string, keys: string[]): Promise<void> {
    keys.forEach(k => this.committedKeys.add(k));
  }

  async getEntries(projectId: string): Promise<JournalRecord[]> {
    return this.records.filter(r => !projectId || r.projectId === projectId || r.projectId === '');
  }

  async getIncompleteTransactions(projectId: string): Promise<JournalRecord[]> {
    const map = new Map<string, JournalRecord>();
    for (const r of this.records) {
      if (!projectId || r.projectId === projectId || r.projectId === '') {
        map.set(r.transactionId, r);
      }
    }
    return Array.from(map.values()).filter(r => r.status === 'PREPARED' || r.status === 'EXECUTED');
  }
}
