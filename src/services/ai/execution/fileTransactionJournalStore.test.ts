import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FileTransactionJournalStore } from './fileTransactionJournalStore';

describe('FileTransactionJournalStore Persistent Across Restarts', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adia-journal-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write records to file and reload them cleanly in a new store instance', async () => {
    const journalPath = path.join(tempDir, 'journal.json');
    const storeA = new FileTransactionJournalStore(journalPath);
    await storeA.append({
      transactionId: 'tx_100',
      projectId: 'proj1',
      actionId: 'act_1',
      scopedKey: 'proj1:XB_CREATE:1.0:k1',
      preparedSnapshot: { blocks: [['b1', { id: 'b1' }]] },
      beforeStateHash: 'hash_zero',
      status: 'PREPARED',
      timestamp: Date.now()
    });

    // Simulate restart by creating brand new store instance on same file
    const storeB = new FileTransactionJournalStore(journalPath);
    const incomplete = await storeB.getIncompleteTransactions('proj1');
    expect(incomplete.length).toBe(1);
    expect(incomplete[0].transactionId).toBe('tx_100');
    expect(incomplete[0].preparedSnapshot).toEqual({ blocks: [['b1', { id: 'b1' }]] });
  });
});
