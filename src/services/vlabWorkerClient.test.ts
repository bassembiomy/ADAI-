import { describe, expect, it, vi } from 'vitest';
import { VLabWorkerClient } from './vlabWorkerClient';
import { VLabPhysicsEngine } from '../engine/vlab/vlabPhysics';
import type { Node, Edge } from '@xyflow/react';

describe('VLabWorkerClient', () => {
  it('resolves a simulation step response by request id', async () => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const worker = {
      postMessage: vi.fn((request: any) => handler?.({ data: { requestId: request.requestId, state: { time: 1 } } } as MessageEvent)),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);
    await expect(client.step([], [], { id: 'c' } as any, null, 0.1)).resolves.toEqual({ time: 1 });
    expect(worker.postMessage).toHaveBeenCalledOnce();
    client.dispose();
  });

  it('proves a second step is queued or serialized while the first step is pending', async () => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const postedRequests: any[] = [];
    const worker = {
      postMessage: vi.fn((request: any) => {
        postedRequests.push(request);
      }),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);

    // Call step 1
    const p1 = client.step([], [], { id: 'c' } as any, null, 0.1);
    expect(postedRequests.length).toBe(1);
    expect(postedRequests[0].requestId).toBe(1);

    // Call step 2 while step 1 is still in-flight
    const p2 = client.step([], [], { id: 'c' } as any, { time: 0.1 }, 0.1);
    // Crucial check: Step 2 should NOT have posted to worker yet because step 1 is in-flight!
    expect(postedRequests.length).toBe(1);

    // Complete step 1
    handler?.({ data: { requestId: 1, state: { time: 0.1 } } } as MessageEvent);
    await expect(p1).resolves.toEqual({ time: 0.1 });

    // Now step 2 should be dispatched
    expect(postedRequests.length).toBe(2);
    expect(postedRequests[1].requestId).toBe(2);

    // Complete step 2
    handler?.({ data: { requestId: 2, state: { time: 0.2 } } } as MessageEvent);
    await expect(p2).resolves.toEqual({ time: 0.2 });

    client.dispose();
  });

  it('proves worker errors reject the step promise and clear in-flight state', async () => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const worker = {
      postMessage: vi.fn((request: any) => {
        handler?.({ data: { requestId: request.requestId, error: 'DAE Singular Matrix Error' } } as MessageEvent);
      }),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);
    await expect(client.step([], [], { id: 'c' } as any, null, 0.1)).rejects.toThrow('DAE Singular Matrix Error');
    expect(client.inFlightCount).toBe(0);
    client.dispose();
  });

  it('rejects pending and queued steps on cancellation or disposal and rejects stale responses', async () => {
    let handler: ((event: MessageEvent) => void) | undefined;
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);
    const p1 = client.step([], [], { id: 'c' } as any, null, 0.1);
    const p2 = client.step([], [], { id: 'c' } as any, null, 0.1);

    client.dispose();

    await expect(p1).rejects.toThrow(/disposed|cancelled/i);
    await expect(p2).rejects.toThrow(/disposed|cancelled/i);

    // Stale message arriving after disposal should not throw or resurrect
    expect(() => {
      handler?.({ data: { requestId: 1, state: { time: 0.1 } } } as MessageEvent);
    }).not.toThrow();
  });

  it('produces identical state and output to direct VLabPhysicsEngine.simulateStep for electrical circuit', async () => {
    const nodes: Node[] = [
      { id: 'gnd', data: { type: 'ground' } } as any,
      { id: 'src', data: { type: 'dc_voltage', params: { V: 12 } } } as any,
      { id: 'res', data: { type: 'resistor', params: { R: 100 } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];
    const dt = 0.05;

    // Direct engine simulation
    const directEngine = new VLabPhysicsEngine();
    let directState: any = null;
    for (let i = 0; i < 3; i++) {
      directState = directEngine.simulateStep(nodes, edges, directState, dt);
    }

    // Worker simulation simulated via client and worker logic
    const workerEngine = new VLabPhysicsEngine();
    let handler: ((event: MessageEvent) => void) | undefined;
    const worker = {
      postMessage: vi.fn((request: any) => {
        const state = workerEngine.simulateStep(request.nodes, request.edges, request.previousState, request.dt);
        handler?.({ data: { requestId: request.requestId, state } } as MessageEvent);
      }),
      terminate: vi.fn(),
      set onmessage(value: any) { handler = value; },
      set onerror(_value: any) {},
    } as unknown as Worker;

    const client = new VLabWorkerClient(() => worker);
    let workerState: any = null;
    for (let i = 0; i < 3; i++) {
      workerState = await client.step(nodes, edges, { id: 'cfg' } as any, workerState, dt);
    }

    expect(workerState.x).toEqual(directState.x);
    expect(workerState.time).toEqual(directState.time);
    client.dispose();
  });
});
