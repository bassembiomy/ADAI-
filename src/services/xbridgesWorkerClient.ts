import type {
  XbridgesWorkerRequest,
  XbridgesWorkerResponse,
} from '../engine/xbridges/xbridgesWorkerProtocol';
import type { XModel } from '../engine/xbridges/types';

interface PendingStep {
  request: XbridgesWorkerRequest;
  resolve: (res: XbridgesWorkerResponse) => void;
  reject: (err: Error) => void;
}

export class XbridgesWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private activePending: PendingStep | null = null;
  private queue: PendingStep[] = [];

  constructor(
    workerFactory?: (() => Worker) | null
  ) {
    if (workerFactory === null) {
      this.worker = null;
      return;
    }

    const factory = workerFactory ?? (typeof Worker !== 'undefined'
      ? () => new Worker(new URL('../engine/xbridges/xbridgesWorker.ts', import.meta.url), { type: 'module' })
      : null);

    if (factory) {
      try {
        this.worker = factory();
        this.attachWorkerHandlers();
      } catch {
        this.worker = null;
      }
    }
  }

  private attachWorkerHandlers(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent<XbridgesWorkerResponse>) => {
      const response = event.data;
      if (!this.activePending || this.activePending.request.requestId !== response.requestId) {
        // Stale response: safely ignore
        return;
      }

      const current = this.activePending;
      this.activePending = null;

      if (!response.ok) {
        const err = new Error(response.error?.message || 'X-Bridges worker error');
        if (response.error?.stack) err.stack = response.error.stack;
        current.reject(err);
      } else {
        current.resolve(response);
      }

      this.processQueue();
    };

    this.worker.onerror = (event: ErrorEvent) => {
      const errorMsg = event?.message || 'X-Bridges worker runtime error';
      const err = new Error(errorMsg);
      if (this.activePending) {
        this.activePending.reject(err);
        this.activePending = null;
      }
      for (const item of this.queue) {
        item.reject(err);
      }
      this.queue = [];
    };
  }

  get available(): boolean {
    return this.worker !== null;
  }

  get inFlight(): boolean {
    return this.activePending !== null;
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
      next.reject(new Error(err?.message || 'Failed to dispatch to X-Bridges worker'));
      this.processQueue();
    }
  }

  public compile(model: XModel, time = 0): Promise<XbridgesWorkerResponse> {
    if (!this.worker) return Promise.reject(new Error('X-Bridges worker is unavailable'));
    const requestId = this.nextId++;
    const request: XbridgesWorkerRequest = {
      requestId,
      type: 'compile',
      model,
      time,
      dt: 0,
    };

    return new Promise((resolve, reject) => {
      const item: PendingStep = { request, resolve, reject };
      if (this.activePending === null) {
        this.activePending = item;
        this.worker!.postMessage(request);
      } else {
        this.queue.push(item);
      }
    });
  }

  public step(
    params: Omit<XbridgesWorkerRequest, 'requestId' | 'type'> & { type?: 'step' | 'batch' }
  ): Promise<XbridgesWorkerResponse> {
    if (!this.worker) return Promise.reject(new Error('X-Bridges worker is unavailable'));
    const requestId = this.nextId++;
    const request: XbridgesWorkerRequest = {
      ...params,
      requestId,
      type: params.type || 'step',
    };

    return new Promise((resolve, reject) => {
      const item: PendingStep = { request, resolve, reject };
      if (this.activePending === null) {
        this.activePending = item;
        this.worker!.postMessage(request);
      } else {
        this.queue.push(item);
      }
    });
  }

  public cancel(): void {
    if (this.activePending) {
      const pending = this.activePending;
      this.activePending = null;
      pending.reject(new Error('X-Bridges worker request cancelled'));
    }

    for (const item of this.queue) {
      item.reject(new Error('X-Bridges worker request cancelled'));
    }
    this.queue = [];

    if (this.worker) {
      try {
        this.worker.postMessage({
          requestId: this.nextId++,
          type: 'cancel',
          time: 0,
          dt: 0,
        } as XbridgesWorkerRequest);
      } catch {
        // Safe ignore
      }
    }
  }

  public dispose(): void {
    this.cancel();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
