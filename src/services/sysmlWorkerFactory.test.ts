import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setCustomWorkerFactory,
  isWorkerSupported,
  createSysmlWorker,
} from './sysmlWorkerFactory';
import { SysmlWorkerClient } from './sysmlWorkerClient';
import { SYSML_WORKER_PROTOCOL_VERSION } from '../engine/sysml/workerProtocol';
import { createEmptyRepository } from '../engine/sysml/model';

describe('sysmlWorkerFactory and sysmlWorkerClient integration', () => {
  let mockWorker: any;

  beforeEach(() => {
    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
    setCustomWorkerFactory(() => mockWorker);
  });

  afterEach(() => {
    setCustomWorkerFactory(null);
  });

  it('supports setting custom worker factory and instantiating worker', () => {
    expect(isWorkerSupported()).toBe(true);
    const worker = createSysmlWorker();
    expect(worker).toBe(mockWorker);
  });

  it('creates client with custom factory and exposes active diagnostics', () => {
    const client = new SysmlWorkerClient();
    const diag = client.getDiagnostics();
    expect(diag.workerAvailable).toBe(true);
    expect(diag.fallbackReason).toBeNull();
    expect(diag.lastWorkerError).toBeNull();
    expect(diag.pendingCount).toBe(0);
    expect(diag.staleCount).toBe(0);
  });

  it('allows explicit workerFactory: null for test fallback mode', async () => {
    const client = new SysmlWorkerClient(null);
    const diag = client.getDiagnostics();
    expect(diag.workerAvailable).toBe(false);
    expect(diag.fallbackReason).toContain('explicitly disabled');

    // Fast-path execution still succeeds synchronously
    const repo = createEmptyRepository();
    const report = await client.validate(repo, 1);
    expect(report.valid).toBe(true);
  });

  it('handles worker errors gracefully and records diagnostics', async () => {
    const client = new SysmlWorkerClient(() => mockWorker);
    const repo = createEmptyRepository();

    // Trigger request above fast-path threshold
    const promise = client.execute('validate', 1, reqId => ({
      version: SYSML_WORKER_PROTOCOL_VERSION,
      requestId: reqId,
      revision: 1,
      taskType: 'validate',
      payload: repo,
    }), 500);

    expect(mockWorker.postMessage).toHaveBeenCalled();

    // Simulate worker error
    mockWorker.onerror({ message: 'Script evaluation terminated abnormally' });

    await expect(promise).rejects.toThrow('Script evaluation terminated abnormally');
    const diag = client.getDiagnostics();
    expect(diag.lastWorkerError).toContain('Script evaluation terminated abnormally');
  });

  it('rejects stale responses when newer revisions are submitted and tracks stale count', async () => {
    const client = new SysmlWorkerClient(() => mockWorker);
    const repo = createEmptyRepository();

    // Send request with revision 2
    const p2 = client.execute('validate', 2, reqId => ({
      requestId: reqId,
      revision: 2,
      taskType: 'validate',
      payload: repo,
    }), 500);

    const req2Id = mockWorker.postMessage.mock.calls[0][0].requestId;

    // Simulate arriving response with stale revision 1 for req2Id
    mockWorker.onmessage({
      data: {
        version: SYSML_WORKER_PROTOCOL_VERSION,
        requestId: req2Id,
        revision: 1, // Stale! 1 < latest revision 2
        taskType: 'validate',
        success: true,
        result: { valid: true, diagnostics: [] },
      },
    });

    await expect(p2).rejects.toThrow('Stale result rejected');
    expect(client.getDiagnostics().staleCount).toBe(1);
  });

  it('cancels pending requests and terminates worker cleanly', async () => {
    const client = new SysmlWorkerClient(() => mockWorker);
    const repo = createEmptyRepository();

    const promise = client.execute('validate', 1, reqId => ({
      requestId: reqId,
      revision: 1,
      taskType: 'validate',
      payload: repo,
    }), 500);

    expect(client.getPendingCount()).toBe(1);

    client.terminate();

    expect(mockWorker.terminate).toHaveBeenCalled();
    expect(client.getPendingCount()).toBe(0);
    expect(client.getDiagnostics().workerAvailable).toBe(false);

    await expect(promise).rejects.toThrow('SysmlWorkerClient terminated');
  });
});
