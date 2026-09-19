import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XbridgesWorkerClient } from './xbridgesWorkerClient';
import type { XbridgesWorkerRequest, XbridgesWorkerResponse } from '../engine/xbridges/xbridgesWorkerProtocol';
import { BLOCK_LIBRARY } from '../engine/xbridges/BlockDefinitions';

class MockWorker {
  public onmessage: ((this: any, ev: MessageEvent) => any) | null = null;
  public onerror: ((this: any, ev: ErrorEvent) => any) | null = null;
  public postMessage = vi.fn();
  public terminate = vi.fn();

  public simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage.call(this, { data } as MessageEvent);
    }
  }

  public simulateError(message: string) {
    if (this.onerror) {
      this.onerror.call(this, { message } as ErrorEvent);
    }
  }
}

describe('XbridgesWorkerClient', () => {
  let mockWorker: MockWorker;
  let client: XbridgesWorkerClient;

  beforeEach(() => {
    mockWorker = new MockWorker();
    client = new XbridgesWorkerClient(() => mockWorker as unknown as Worker);
  });

  it('reports availability based on worker factory', () => {
    expect(client.available).toBe(true);
    const unavailable = new XbridgesWorkerClient(null);
    expect(unavailable.available).toBe(false);
  });

  it('serializes executable block definitions before posting a compile request', () => {
    const model = { blocks: [BLOCK_LIBRARY.Constant('source', { value: 1 })], connections: [] };
    void client.compile(model);
    const request = mockWorker.postMessage.mock.calls[0][0] as XbridgesWorkerRequest;
    expect(typeof model.blocks[0].execute).toBe('function');
    expect(typeof request.model?.blocks[0].execute).toBe('undefined');
    expect(() => structuredClone(request)).not.toThrow();
  });

  it('dispatches step and resolves with worker response', async () => {
    const promise = client.step({
      time: 0,
      dt: 0.01,
      solverType: 'rk4',
    });

    expect(mockWorker.postMessage).toHaveBeenCalledOnce();
    const req: XbridgesWorkerRequest = mockWorker.postMessage.mock.calls[0][0];
    expect(req.requestId).toBe(1);
    expect(req.type).toBe('step');

    mockWorker.simulateMessage({
      requestId: 1,
      ok: true,
      simulationTime: 0.01,
      engineSnapshot: { time: 0.01, blockStates: { b1: 42 } },
    } as XbridgesWorkerResponse);

    const result = await promise;
    expect(result.simulationTime).toBe(0.01);
    expect(result.engineSnapshot?.blockStates.b1).toBe(42);
    expect(client.inFlight).toBe(false);
  });

  it('enforces single in-flight request guard by rejecting or serializing concurrent calls', async () => {
    const p1 = client.step({ time: 0, dt: 0.01 });
    expect(client.inFlight).toBe(true);

    // Second step while first is in-flight
    const p2 = client.step({ time: 0.01, dt: 0.01 });
    // Should NOT post immediately
    expect(mockWorker.postMessage).toHaveBeenCalledTimes(1);

    mockWorker.simulateMessage({
      requestId: 1,
      ok: true,
      simulationTime: 0.01,
    } as XbridgesWorkerResponse);

    await p1;

    // After p1 completes, p2 is dispatched
    expect(mockWorker.postMessage).toHaveBeenCalledTimes(2);

    mockWorker.simulateMessage({
      requestId: 2,
      ok: true,
      simulationTime: 0.02,
    } as XbridgesWorkerResponse);

    await p2;
    expect(client.inFlight).toBe(false);
  });

  it('cancels pending requests and rejects stale responses', async () => {
    const p1 = client.step({ time: 0, dt: 0.01 });
    client.cancel();

    await expect(p1).rejects.toThrow(/cancelled/i);
    expect(mockWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel' }));

    // Late worker message after cancellation is ignored safely
    expect(() => {
      mockWorker.simulateMessage({
        requestId: 1,
        ok: true,
        simulationTime: 0.01,
      } as XbridgesWorkerResponse);
    }).not.toThrow();
  });

  it('handles worker errors by propagating them and resetting inFlight state', async () => {
    const p1 = client.step({ time: 0, dt: 0.01 });

    mockWorker.simulateMessage({
      requestId: 1,
      ok: false,
      error: { message: 'Algebraic loop did not converge' },
    } as XbridgesWorkerResponse);

    await expect(p1).rejects.toThrow('Algebraic loop did not converge');
    expect(client.inFlight).toBe(false);
  });
});
