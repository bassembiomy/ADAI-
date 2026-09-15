import type { BackgroundRequest, BackgroundResponse } from './backgroundTaskProtocol';

export interface BackgroundWorkerClientOptions {
  workerFactory?: (() => Worker) | null;
  kind?: string;
  defaultWorkerUrl?: URL;
}

interface Pending<TResult> {
  resolve: (value: TResult) => void;
  reject: (reason: Error) => void;
}

export class BackgroundWorkerClient<TRequest = any, TResult = any> {
  private worker: Worker | null = null;
  private nextId = 1;
  private kind: string;
  private pending = new Map<number, Pending<TResult>>();

  constructor(options?: BackgroundWorkerClientOptions | (() => Worker) | null) {
    let factory: (() => Worker) | null | undefined;
    let kind = 'default';

    if (typeof options === 'function' || options === null) {
      factory = options;
    } else if (options && typeof options === 'object') {
      factory = options.workerFactory !== undefined
        ? options.workerFactory
        : (options.defaultWorkerUrl && typeof Worker !== 'undefined'
            ? () => new Worker(options.defaultWorkerUrl!, { type: 'module' })
            : null);
      if (options.kind) {
        kind = options.kind;
      }
    }

    this.kind = kind;

    if (factory) {
      try {
        this.worker = factory();
        this.attachWorkerHandlers();
      } catch {
        this.worker = null;
      }
    } else if (factory === undefined && typeof Worker !== 'undefined' && options && (options as BackgroundWorkerClientOptions).defaultWorkerUrl) {
      try {
        this.worker = new Worker((options as BackgroundWorkerClientOptions).defaultWorkerUrl!, { type: 'module' });
        this.attachWorkerHandlers();
      } catch {
        this.worker = null;
      }
    }
  }

  private attachWorkerHandlers(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent<BackgroundResponse<TResult>>) => {
      const { requestId, ok, result, error } = event.data;
      const pending = this.pending.get(requestId);
      if (!pending) {
        // Stale or unknown response, ignore safely
        return;
      }

      this.pending.delete(requestId);

      if (!ok) {
        const err = new Error(error?.message || 'Background worker request failed');
        if (error?.stack) {
          err.stack = error.stack;
        }
        pending.reject(err);
      } else {
        pending.resolve(result as TResult);
      }
    };

    this.worker.onerror = (event: ErrorEvent) => {
      const errorMsg = event.message || 'Background worker error';
      const err = new Error(errorMsg);
      for (const pending of this.pending.values()) {
        pending.reject(err);
      }
      this.pending.clear();
    };
  }

  get available(): boolean {
    return this.worker !== null;
  }

  public runWithId(payload: TRequest): { requestId: number; promise: Promise<TResult> } {
    if (!this.worker) {
      return {
        requestId: -1,
        promise: Promise.reject(new Error('Background worker is unavailable')),
      };
    }

    const requestId = this.nextId++;
    const promise = new Promise<TResult>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      const request: BackgroundRequest<TRequest> = {
        requestId,
        kind: this.kind,
        payload,
      };
      this.worker!.postMessage(request);
    });

    return { requestId, promise };
  }

  public run(payload: TRequest): Promise<TResult> {
    return this.runWithId(payload).promise;
  }

  public cancel(requestId: number): void {
    const pending = this.pending.get(requestId);
    if (pending) {
      this.pending.delete(requestId);
      pending.reject(new Error(`Task ${requestId} cancelled`));
    }

    if (this.worker) {
      try {
        this.worker.postMessage({
          requestId,
          kind: 'cancel',
          payload: null,
        });
      } catch {
        // Ignore errors posting cancellation
      }
    }
  }

  public dispose(): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Background worker disposed'));
    }
    this.pending.clear();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
