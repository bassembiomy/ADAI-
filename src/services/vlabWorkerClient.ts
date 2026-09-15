import type { Node, Edge } from '@xyflow/react';
import type { SolverConfiguration } from '../engine/vlab/kernel/types';
import type { VLabWorkerRequest, VLabWorkerResponse } from '../engine/vlab/vlabWorkerProtocol';

type Pending = { resolve: (state: any) => void; reject: (error: Error) => void };

export class VLabWorkerClient {
  private worker: Worker | null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(workerFactory: (() => Worker) | null = typeof Worker === 'undefined'
    ? null
    : () => new Worker(new URL('../engine/vlab/vlabWorker.ts', import.meta.url), { type: 'module' })) {
    this.worker = workerFactory ? workerFactory() : null;
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<VLabWorkerResponse>) => {
        const pending = this.pending.get(event.data.requestId);
        if (!pending) return;
        this.pending.delete(event.data.requestId);
        event.data.error ? pending.reject(new Error(event.data.error)) : pending.resolve(event.data.state);
      };
      this.worker.onerror = event => {
        const error = new Error(event.message || 'V-Lab worker failed');
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      };
    }
  }

  get available(): boolean { return this.worker !== null; }

  step(nodes: Node[], edges: Edge[], configuration: SolverConfiguration, previousState: any, dt: number): Promise<any> {
    if (!this.worker) return Promise.reject(new Error('V-Lab worker is unavailable'));
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      const request: VLabWorkerRequest = { requestId, nodes, edges, configuration, previousState, dt };
      this.worker!.postMessage(request);
    });
  }

  dispose(): void {
    for (const pending of this.pending.values()) pending.reject(new Error('V-Lab worker disposed'));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
