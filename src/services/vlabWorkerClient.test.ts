import { describe, expect, it, vi } from 'vitest';
import { VLabWorkerClient } from './vlabWorkerClient';

describe('VLabWorkerClient', () => {
  it('resolves a simulation step response by request id', async () => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const worker = { postMessage: vi.fn((request: any) => handler?.({ data: { requestId: request.requestId, state: { time: 1 } } } as MessageEvent)), terminate: vi.fn(), set onmessage(value: any) { handler = value; }, set onerror(_value: any) {} } as unknown as Worker;
    const client = new VLabWorkerClient(() => worker);
    await expect(client.step([], [], { id: 'c' } as any, null, 0.1)).resolves.toEqual({ time: 1 });
    expect(worker.postMessage).toHaveBeenCalledOnce();
    client.dispose();
  });
});
