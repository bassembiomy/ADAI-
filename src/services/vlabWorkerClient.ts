import type { Node, Edge } from '@xyflow/react';
import type { SolverConfiguration } from '../engine/vlab/kernel/types';
import type { VLabWorkerRequest, VLabWorkerResponse } from '../engine/vlab/vlabWorkerProtocol';

interface PendingStep {
  request: VLabWorkerRequest;
  resolve: (state: any) => void;
  reject: (error: Error) => void;
}

export class VLabWorkerClient {
  private worker: Worker | null;
  private nextId = 1;
  private activePending: PendingStep | null = null;
  private queue: PendingStep[] = [];

  constructor(workerFactory: (() => Worker) | null = typeof Worker === 'undefined'
    ? null
    : () => new Worker(new URL('../engine/vlab/vlabWorker.ts', import.meta.url), { type: 'module' })) {
    this.worker = workerFactory ? workerFactory() : null;
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<VLabWorkerResponse>) => {
        const { requestId, state, error } = event.data;
        if (!this.activePending || this.activePending.request.requestId !== requestId) {
          // Stale response or unexpected requestId: safely ignore
          return;
        }

        const current = this.activePending;
        this.activePending = null;

        if (error) {
          current.reject(new Error(error));
        } else {
          current.resolve(state);
        }

        this.processQueue();
      };

      this.worker.onerror = event => {
        const error = new Error(event.message || 'V-Lab worker failed');
        if (this.activePending) {
          this.activePending.reject(error);
          this.activePending = null;
        }
        for (const item of this.queue) {
          item.reject(error);
        }
        this.queue = [];
      };
    }
  }

  get available(): boolean {
    return this.worker !== null;
  }

  get inFlightCount(): number {
    return (this.activePending ? 1 : 0) + this.queue.length;
  }

  private processQueue(): void {
    if (this.activePending !== null || this.queue.length === 0 || !this.worker) {
      return;
    }

    const next = this.queue.shift()!;
    this.activePending = next;
    try {
      this.worker.postMessage(next.request);
    } catch (err: any) {
      this.activePending = null;
      next.reject(new Error(err?.message || 'Failed to postMessage to V-Lab worker'));
      this.processQueue();
    }
  }

  step(nodes: Node[], edges: Edge[], configuration: SolverConfiguration, previousState: any, dt: number): Promise<any> {
    if (!this.worker) return Promise.reject(new Error('V-Lab worker is unavailable'));
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      const stepItem: PendingStep = {
        request: { requestId, nodes, edges, configuration, previousState, dt },
        resolve,
        reject,
      };

      if (this.activePending === null) {
        this.activePending = stepItem;
        this.worker!.postMessage(stepItem.request);
      } else {
        // Serialized dispatch: queue so overlapping ticks cannot reuse stale state
        this.queue.push(stepItem);
      }
    });
  }

  cancel(requestId?: number): void {
    if (requestId !== undefined) {
      if (this.activePending && this.activePending.request.requestId === requestId) {
        const pending = this.activePending;
        this.activePending = null;
        pending.reject(new Error(`V-Lab step ${requestId} cancelled`));
        this.processQueue();
        return;
      }

      const idx = this.queue.findIndex(item => item.request.requestId === requestId);
      if (idx !== -1) {
        const [item] = this.queue.splice(idx, 1);
        item.reject(new Error(`V-Lab step ${requestId} cancelled`));
      }
      return;
    }

    // Cancel all
    if (this.activePending) {
      this.activePending.reject(new Error('V-Lab simulation cancelled'));
      this.activePending = null;
    }
    for (const item of this.queue) {
      item.reject(new Error('V-Lab simulation cancelled'));
    }
    this.queue = [];
  }

  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}
