import fs from 'fs/promises';
import path from 'path';
import { ITransactionJournalStore, JournalRecord } from './transactionJournalStore';
import { TransactionStatus } from './types';

export class FileTransactionJournalStore implements ITransactionJournalStore {
  private committedKeys = new Set<string>();

  constructor(private filePath: string) {}

  private async readAll(): Promise<JournalRecord[]> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async writeAll(records: JournalRecord[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tempFile = `${this.filePath}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(records, null, 2), 'utf-8');
    await fs.rename(tempFile, this.filePath);
  }

  async append(record: JournalRecord): Promise<void> {
    const records = await this.readAll();
    records.push(record);
    await this.writeAll(records);
  }

  async markStatus(transactionId: string, projectId: string, planId: string, status: TransactionStatus, error?: string): Promise<void> {
    await this.append({ transactionId, projectId, planId, status, error, timestamp: Date.now() });
  }

  async isKeyCommitted(scopedKey: string): Promise<boolean> {
    return this.committedKeys.has(scopedKey);
  }

  async commitKeys(transactionId: string, keys: string[]): Promise<void> {
    keys.forEach(k => this.committedKeys.add(k));
  }

  async getEntries(projectId: string): Promise<JournalRecord[]> {
    const records = await this.readAll();
    return records.filter(r => !projectId || r.projectId === projectId);
  }

  async getIncompleteTransactions(projectId: string): Promise<JournalRecord[]> {
    const records = await this.readAll();
    const map = new Map<string, JournalRecord>();
    for (const r of records) {
      if (!projectId || r.projectId === projectId) {
        map.set(r.transactionId, r);
      }
    }
    return Array.from(map.values()).filter(r => r.status === 'PREPARED' || r.status === 'EXECUTED');
  }
}
