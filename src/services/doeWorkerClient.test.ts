import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DOEWorkerClient } from './doeWorkerClient';
import type { DOEWorkerRequest, DOEWorkerResponse } from '../engine/doe/doeWorkerProtocol';

describe('DOEWorkerClient', () => {
  let mockWorker: any;
  let postedMessages: any[] = [];

  beforeEach(() => {
    postedMessages = [];
    mockWorker = {
      postMessage: vi.fn((msg) => postedMessages.push(msg)),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
  });

  it('runs fitRSM and resolves on matching requestId', async () => {
    const client = new DOEWorkerClient(() => mockWorker);
    const promise = client.fitRSM({ headers: ['A', 'Y'], data: [[1, 2], [2, 4]] });

    expect(postedMessages.length).toBe(1);
    const req = postedMessages[0] as DOEWorkerRequest;
    expect(req.taskType).toBe('fitRSM');

    // Simulate worker success response
    mockWorker.onmessage({
      data: {
        requestId: req.requestId,
        taskType: 'fitRSM',
        ok: true,
        result: {
          modelType: 'RSM',
          rSquared: 0.99,
          details: { Beta: [1, 2] },
        },
      } as DOEWorkerResponse,
    });

    const res = await promise;
    expect(res.modelType).toBe('RSM');
    expect(res.rSquared).toBe(0.99);
  });

  it('rejects stale responses with mismatched requestId', async () => {
    const client = new DOEWorkerClient(() => mockWorker);
    const p1 = client.fitRSM({ headers: ['A', 'Y'], data: [[1, 2]] });
    const p2 = client.fitRSM({ headers: ['B', 'Y'], data: [[2, 4]] });

    const req1 = postedMessages[0];
    const req2 = postedMessages[1];

    // Response arrives for req2 first
    mockWorker.onmessage({
      data: {
        requestId: req2.requestId,
        taskType: 'fitRSM',
        ok: true,
        result: { modelType: 'RSM', rSquared: 0.95 },
      },
    });

    const res2 = await p2;
    expect(res2.rSquared).toBe(0.95);

    // Cancel / stale response for an unknown requestId
    mockWorker.onmessage({
      data: {
        requestId: 99999,
        taskType: 'fitRSM',
        ok: true,
        result: { modelType: 'RSM', rSquared: 0.1 },
      },
    });

    // P1 still pending until its response arrives
    mockWorker.onmessage({
      data: {
        requestId: req1.requestId,
        taskType: 'fitRSM',
        ok: true,
        result: { modelType: 'RSM', rSquared: 0.8 },
      },
    });

    const res1 = await p1;
    expect(res1.rSquared).toBe(0.8);
  });

  it('propagates worker error to pending promise', async () => {
    const client = new DOEWorkerClient(() => mockWorker);
    const promise = client.fitGMDH({ headers: ['A', 'Y'], data: [[1, 2]] });

    const req = postedMessages[0];
    mockWorker.onmessage({
      data: {
        requestId: req.requestId,
        taskType: 'fitGMDH',
        ok: false,
        error: { message: 'Singular matrix in GMDH layer' },
      },
    });

    await expect(promise).rejects.toThrow('Singular matrix in GMDH layer');
  });

  it('cancels pending request and sends cancel message', async () => {
    const client = new DOEWorkerClient(() => mockWorker);
    const { requestId, promise } = client.runTaskWithId('computeSurface', { gridRes: 40 });

    expect(postedMessages.length).toBe(1);
    client.cancel(requestId);

    expect(postedMessages.length).toBe(2);
    expect(postedMessages[1]).toEqual({
      requestId: expect.any(Number),
      taskType: 'cancel',
      payload: { targetRequestId: requestId },
    });

    await expect(promise).rejects.toThrow(/cancelled/i);
  });

  it('rehydrates GMDH predict method on result', async () => {
    const client = new DOEWorkerClient(() => mockWorker);
    const promise = client.fitGMDH({ headers: ['A', 'B', 'Y'], data: [[1, 2, 3]] });

    const req = postedMessages[0];
    mockWorker.onmessage({
      data: {
        requestId: req.requestId,
        taskType: 'fitGMDH',
        ok: true,
        result: {
          modelType: 'GMDH',
          deployment: {
            modelType: 'GMDH',
            factorOrder: ['A', 'B'],
            gmdh: {
              polyOrder: 2,
              layers: [
                [
                  { inputs: [0, 1], coeffs: [1, 2, 3, 0, 0, 0] }
                ]
              ]
            }
          },
          details: {
            model: {
              layers: [
                [
                  { inputs: [0, 1], coeffs: [1, 2, 3, 0, 0, 0] }
                ]
              ],
              config: { polynomialOrder: 2 }
            }
          }
        },
      },
    });

    const res = await promise;
    expect(res.details).toBeDefined();
    expect(typeof res.details!.model.predict).toBe('function');
    // 1 + 2*(1) + 3*(2) = 1 + 2 + 6 = 9
    const pred = res.details!.model.predict([1, 2]);
    expect(pred).toBe(9);
  });
});
