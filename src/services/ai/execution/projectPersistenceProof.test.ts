import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  saveProjectSnapshot,
  reloadProjectSnapshot,
  verifyPersistenceIntegrity,
  PersistedSnapshotReceipt
} from './projectPersistenceProof';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { computeModelFingerprint } from '../../../engine/opm/canonicalHash';

describe('Project Persistence Proof (Task 7)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-persistence-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  const sampleSnapshot: ModelSnapshot = {
    projectId: 'test_persist_proj',
    revision: 3,
    nodes: [
      {
        id: 'dc_1',
        type: 'DC_VOLTAGE_SOURCE',
        data: { id: 'dc_1', type: 'DC_VOLTAGE_SOURCE', params: { voltage: 48 }, instanceName: 'DC1' },
        position: { x: 100, y: 150 }
      },
      {
        id: 'gain_1',
        type: 'GAIN',
        data: { id: 'gain_1', type: 'GAIN', params: { gain: 2 }, instanceName: 'G1' },
        position: { x: 300, y: 150 }
      }
    ],
    edges: [
      {
        id: 'e_dc_gain',
        source: 'dc_1',
        sourceHandle: 'v_pos',
        target: 'gain_1',
        targetHandle: 'u'
      }
    ],
    stateHash: '',
    timestamp: Date.now()
  };

  it('proves workspace state callbacks alone do not count as persistence: requires file receipt, content hash, read-back model hash, and revision', async () => {
    // A fake save callback that just records an in-memory boolean
    let callbackCalled = false;
    const fakeCallback = () => { callbackCalled = true; };
    fakeCallback();
    expect(callbackCalled).toBe(true);

    // Calling the persistence proof MUST require a real file receipt
    const targetFile = path.join(tempDir, 'sample_project.adia');
    const receipt = await saveProjectSnapshot(sampleSnapshot, { targetPath: targetFile });

    expect(receipt.filePath).toBe(targetFile);
    expect(fs.existsSync(receipt.filePath)).toBe(true);
    expect(typeof receipt.contentHash).toBe('string');
    expect(receipt.contentHash).toHaveLength(64);
    expect(typeof receipt.modelFingerprint).toBe('string');
    expect(receipt.modelFingerprint).toHaveLength(64);
    expect(receipt.revision).toBe(3);
    expect(receipt.sizeBytes).toBeGreaterThan(0);
  });

  it('reloads saved snapshot from disk and verifies byte-for-byte read-back model fingerprint', async () => {
    const targetFile = path.join(tempDir, 'reloaded_project.adia');
    const receipt = await saveProjectSnapshot(sampleSnapshot, { targetPath: targetFile });

    const reloaded = await reloadProjectSnapshot(receipt);
    expect(reloaded.projectId).toBe(sampleSnapshot.projectId);
    expect(reloaded.revision).toBe(3);
    expect(reloaded.nodes).toHaveLength(2);
    expect(reloaded.edges).toHaveLength(1);

    const reloadedFingerprint = computeModelFingerprint({
      nodes: reloaded.nodes,
      edges: reloaded.edges
    });
    expect(reloadedFingerprint).toBe(receipt.modelFingerprint);
  });

  it('detects tampering or corruption and rejects reloaded snapshot if content hash mismatches', async () => {
    const targetFile = path.join(tempDir, 'tampered_project.adia');
    const receipt = await saveProjectSnapshot(sampleSnapshot, { targetPath: targetFile });

    // Tamper with the file on disk
    fs.appendFileSync(targetFile, '\n// malicious extra content');

    await expect(reloadProjectSnapshot(receipt)).rejects.toThrow(/CONTENT_HASH_MISMATCH/);
  });

  it('rejects path traversal attempts when reloading snapshot outside allowed project paths', async () => {
    const maliciousReceipt: PersistedSnapshotReceipt = {
      filePath: path.join(tempDir, '..', '..', '..', 'Windows', 'System32', 'evil.adia'),
      contentHash: '0000000000000000000000000000000000000000000000000000000000000000',
      modelFingerprint: '0000000000000000000000000000000000000000000000000000000000000000',
      revision: 1,
      savedAt: Date.now(),
      sizeBytes: 100
    };

    await expect(reloadProjectSnapshot(maliciousReceipt, { allowedBaseDir: tempDir })).rejects.toThrow(/PATH_TRAVERSAL_DETECTED/);
  });

  it('verifyPersistenceIntegrity returns true when active model matches persisted receipt', async () => {
    const targetFile = path.join(tempDir, 'verified_project.adia');
    const receipt = await saveProjectSnapshot(sampleSnapshot, { targetPath: targetFile });

    const isMatch = verifyPersistenceIntegrity(receipt, sampleSnapshot);
    expect(isMatch).toBe(true);

    const modifiedSnapshot: ModelSnapshot = {
      ...sampleSnapshot,
      nodes: [sampleSnapshot.nodes[0]] // dropped one node
    };
    const isMismatched = verifyPersistenceIntegrity(receipt, modifiedSnapshot);
    expect(isMismatched).toBe(false);
  });
});
