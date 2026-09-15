import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackgroundWorkerClient } from './backgroundWorkerClient';
import type { BackgroundRequest, BackgroundResponse } from './backgroundTaskProtocol';

class MockWorker implements Partial<Worker> {
  public onmessage: ((this: Worker, ev: MessageEvent) => any) | null = null;
  public onerror: ((this: AbstractWorker, ev: ErrorEvent) => any) | null = null;
  public postMessage = vi.fn();
  public terminate = vi.fn();

  public simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }

  public simulateError(message: string) {
    if (this.onerror) {
      this.onerror({ message } as ErrorEvent);
    }
  }
}

describe('BackgroundWorkerClient', () => {
  let mockWorker: MockWorker;
  let client: BackgroundWorkerClient<any, any>;

  beforeEach(() => {
    mockWorker = new MockWorker();
    client = new BackgroundWorkerClient({
      workerFactory: () => mockWorker as unknown as Worker,
      kind: 'test-task',
    });
  });

  it('reports availability correctly', () => {
    expect(client.available).toBe(true);

    const unavailableClient = new BackgroundWorkerClient({
      workerFactory: null,
      kind: 'test-task',
    });
    expect(unavailableClient.available).toBe(false);
  });

  it('matches request IDs and resolves with typed result', async () => {
    const promise1 = client.run({ value: 10 });
    const promise2 = client.run({ value: 20 });

    expect(mockWorker.postMessage).toHaveBeenCalledTimes(2);
    const req1: BackgroundRequest<any> = mockWorker.postMessage.mock.calls[0][0];
    const req2: BackgroundRequest<any> = mockWorker.postMessage.mock.calls[1][0];

    expect(req1.requestId).toBeDefined();
    expect(req2.requestId).toBeDefined();
    expect(req1.requestId).not.toBe(req2.requestId);
    expect(req1.kind).toBe('test-task');

    // Simulate response in reverse order
    mockWorker.simulateMessage({
      requestId: req2.requestId,
      ok: true,
      result: { doubled: 40 },
    } as BackgroundResponse<any>);

    mockWorker.simulateMessage({
      requestId: req1.requestId,
      ok: true,
      result: { doubled: 20 },
    } as BackgroundResponse<any>);

    await expect(promise1).resolves.toEqual({ doubled: 20 });
    await expect(promise2).resolves.toEqual({ doubled: 40 });
  });

  it('propagates worker errors returned in response payload', async () => {
    const promise = client.run({ value: -1 });
    const req: BackgroundRequest<any> = mockWorker.postMessage.mock.calls[0][0];

    mockWorker.simulateMessage({
      requestId: req.requestId,
      ok: false,
      error: { message: 'Negative values not supported', stack: 'trace...' },
    } as BackgroundResponse<any>);

    await expect(promise).rejects.toThrow('Negative values not supported');
  });

  it('propagates worker runtime onerror events to all pending requests', async () => {
    const promise1 = client.run({ value: 1 });
    const promise2 = client.run({ value: 2 });

    mockWorker.simulateError('Worker crashed out of memory');

    await expect(promise1).rejects.toThrow('Worker crashed out of memory');
    await expect(promise2).rejects.toThrow('Worker crashed out of memory');
  });

  it('supports explicit cancellation of pending requests', async () => {
    const runResult = client.runWithId({ value: 99 });
    const { requestId, promise } = runResult;

    client.cancel(requestId);

    await expect(promise).rejects.toThrow(/cancelled/i);

    // After cancellation, a late message from the worker is safely ignored and does not crash
    expect(() => {
      mockWorker.simulateMessage({
        requestId,
        ok: true,
        result: { done: true },
      });
    }).not.toThrow();
  });

  it('ignores stale responses if request was replaced or unknown', async () => {
    // When a response arrives for an unknown or already fulfilled ID, it is cleanly ignored
    expect(() => {
      mockWorker.simulateMessage({
        requestId: 999999,
        ok: true,
        result: { orphan: true },
      });
    }).not.toThrow();
  });

  it('disposes worker and rejects all pending requests', async () => {
    const promise = client.run({ value: 5 });

    client.dispose();

    expect(client.available).toBe(false);
    expect(mockWorker.terminate).toHaveBeenCalled();
    await expect(promise).rejects.toThrow(/disposed/i);

    // Running after disposal rejects immediately
    await expect(client.run({ value: 6 })).rejects.toThrow(/unavailable|disposed/i);
  });
});
