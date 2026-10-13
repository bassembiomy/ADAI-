import type { Node, Edge } from '@xyflow/react';
import type { SolverConfiguration } from '../engine/vlab/kernel/types';
import type { VLabDiagnostic, VLabStepProgress, VLabWorkerRequest, VLabWorkerResponse } from '../engine/vlab/vlabWorkerProtocol';

/** A step failed in the worker: the message is the Error message, `diagnostic` the typed record (code, blockId(s), portId, details, items) for the UI. */
export class VLabWorkerError extends Error {
  constructor(readonly diagnostic: VLabDiagnostic) {
    super(diagnostic.message);
    this.name = 'VLabWorkerError';
  }
}

export type VLabDiagnosticsListener = (diagnostic: VLabDiagnostic, requestId: number) => void;
export type VLabProgressListener = (progress: VLabStepProgress, requestId: number) => void;

interface PendingStep {
  request: VLabWorkerRequest;
  resolve: (state: any) => void;
  reject: (error: Error) => void;
}

const workerDiagnostic = (message: string, code: VLabDiagnostic['code'] = 'WORKER'): VLabDiagnostic =>
  ({ code, message, name: 'VLabWorkerError', blockIds: [], details: {}, items: [] });

export class VLabWorkerClient {
  private worker: Worker | null;
  private nextId = 1;
  private activePending: PendingStep | null = null;
  private queue: PendingStep[] = [];
  private diagnosticListeners = new Set<VLabDiagnosticsListener>();
  private progressListeners = new Set<VLabProgressListener>();
  private lastDiag: VLabDiagnostic | null = null;
  /** shared cancel flag (see VLabWorkerRequest.cancelFlag); null where SharedArrayBuffer is unavailable (cancel then restarts the worker) */
  private cancelFlag: Int32Array | null = null;
  private readonly factory: (() => Worker) | null;

  constructor(workerFactory: (() => Worker) | null = typeof Worker === 'undefined'
    ? null
    : () => new Worker(new URL('../engine/vlab/vlabWorker.ts', import.meta.url), { type: 'module' })) {
    this.factory = workerFactory;
    try {
      if (typeof SharedArrayBuffer !== 'undefined' && (typeof crossOriginIsolated === 'undefined' || crossOriginIsolated)) {
        this.cancelFlag = new Int32Array(new SharedArrayBuffer(4));
      }
    } catch { this.cancelFlag = null; }
    this.worker = workerFactory ? workerFactory() : null;
    this.attach();
  }

  private attach(): void {
    if (!this.worker) return;
    this.worker.onmessage = (event: MessageEvent<VLabWorkerResponse>) => {
      const { requestId, state, error, diagnostic, progress, type } = event.data;
      if (!this.activePending || this.activePending.request.requestId !== requestId) {
        // Stale response or unexpected requestId: safely ignore
        return;
      }
      if (type === 'progress') {
        if (progress) this.progressListeners.forEach(l => l(progress, requestId));
        return;
      }

      const current = this.activePending;
      this.activePending = null;

      if (diagnostic || error) {
        const record = diagnostic ?? workerDiagnostic(error!, 'UNKNOWN');
        this.lastDiag = record;
        // listeners are the UI's channel: a throwing listener must never block the queue
        this.diagnosticListeners.forEach(l => { try { l(record, requestId); } catch { /* UI listener failure */ } });
        current.reject(new VLabWorkerError(record));
      } else {
        current.resolve(state);
      }

      this.processQueue();
    };

    this.worker.onerror = event => {
      const record = workerDiagnostic(event.message || 'V-Lab worker failed');
      this.lastDiag = record;
      this.diagnosticListeners.forEach(l => { try { l(record, this.activePending?.request.requestId ?? -1); } catch { /* UI listener failure */ } });
      const error = new VLabWorkerError(record);
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

  get available(): boolean {
    return this.worker !== null;
  }

  get inFlightCount(): number {
    return (this.activePending ? 1 : 0) + this.queue.length;
  }

  /** The diagnostic of the most recent failed step (null before any failure). */
  get lastDiagnostic(): VLabDiagnostic | null {
    return this.lastDiag;
  }

  /**
   * WP-31c: subscribe to every failed step as a typed diagnostic ({code, message, blockId, blockIds, portId, details, items}); the UI
   * (WP-40) renders it. Returns the unsubscribe function.
   */
  onDiagnostics(listener: VLabDiagnosticsListener): () => void {
    this.diagnosticListeners.add(listener);
    return () => { this.diagnosticListeners.delete(listener); };
  }

  /** Progress messages of the running step (time reached, target, accepted / rejected solver steps). Returns the unsubscribe function. */
  onProgress(listener: VLabProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => { this.progressListeners.delete(listener); };
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
      next.reject(new VLabWorkerError(workerDiagnostic(err?.message || 'Failed to postMessage to V-Lab worker')));
      this.processQueue();
    }
  }

  step(nodes: Node[], edges: Edge[], configuration: SolverConfiguration, previousState: any, dt: number): Promise<any> {
    if (!this.worker) return Promise.reject(new Error('V-Lab worker is unavailable'));
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      const stepItem: PendingStep = {
        request: { requestId, nodes, edges, configuration, previousState, dt, ...(this.cancelFlag ? { cancelFlag: this.cancelFlag } : {}) },
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

  /**
   * Stop the in-flight step (and the queued ones when no id is given). The worker is blocked inside a synchronous solver loop, so the
   * running step is stopped cooperatively through the shared flag (it answers with a CANCELLED diagnostic that is ignored here); without
   * SharedArrayBuffer the worker is terminated and recreated, which stops the CPU-bound step at once.
   */
  cancel(requestId?: number): void {
    const abortRunning = (id: number) => {
      if (this.cancelFlag) Atomics.store(this.cancelFlag, 0, id);
      else this.restartWorker();
      this.worker?.postMessage({ type: 'cancel', requestId: id });
    };
    if (requestId !== undefined) {
      if (this.activePending && this.activePending.request.requestId === requestId) {
        const pending = this.activePending;
        this.activePending = null;
        pending.reject(new Error(`V-Lab step ${requestId} cancelled`));
        abortRunning(requestId);
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
      const pending = this.activePending;
      this.activePending = null;
      pending.reject(new Error('V-Lab simulation cancelled'));
      abortRunning(pending.request.requestId);
    }
    for (const item of this.queue) {
      item.reject(new Error('V-Lab simulation cancelled'));
    }
    this.queue = [];
  }

  private restartWorker(): void {
    if (!this.factory || !this.worker) return;
    this.worker.terminate();
    this.worker = this.factory();
    this.attach();
  }

  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}
