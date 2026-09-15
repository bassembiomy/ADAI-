import type {
  DOEWorkerRequest,
  DOEWorkerResponse,
  DOEWorkerTaskType,
  SurfaceComputeRequest,
  SurfaceComputeResult,
} from '../engine/doe/doeWorkerProtocol';
import type { DOEModelResult } from '../engine/doe/types';
import type {
  DOEInputDataset,
  GMDHOptions,
  TaguchiOptions,
} from '../engine/doe/statistics';
import { handleDOEWorkerMessage } from '../engine/doe/doeWorker';

interface PendingTask<T = any> {
  requestId: number;
  taskType: DOEWorkerTaskType;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  onProgress?: (progress: number) => void;
}

export class DOEWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingTask>();

  constructor(workerFactory?: (() => Worker) | null) {
    if (workerFactory === null) {
      this.worker = null;
      return;
    }

    const factory =
      workerFactory ??
      (typeof Worker !== 'undefined'
        ? () =>
            new Worker(new URL('../engine/doe/doeWorker.ts', import.meta.url), {
              type: 'module',
            })
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

    this.worker.onmessage = (event: MessageEvent<DOEWorkerResponse>) => {
      const { requestId, ok, result, progress, error } = event.data;
      const pending = this.pending.get(requestId);
      if (!pending) {
        // Stale or cancelled response
        return;
      }

      if (progress !== undefined && pending.onProgress) {
        pending.onProgress(progress);
        return;
      }

      this.pending.delete(requestId);

      if (!ok) {
        const err = new Error(error?.message || 'DOE Worker task failed');
        if (error?.stack) err.stack = error.stack;
        pending.reject(err);
      } else {
        const processedResult = this.rehydrateGmdhModel(result);
        pending.resolve(processedResult);
      }
    };

    this.worker.onerror = (event: ErrorEvent) => {
      const errorMsg = event?.message || 'DOE Worker runtime error';
      const err = new Error(errorMsg);
      for (const pending of this.pending.values()) {
        pending.reject(err);
      }
      this.pending.clear();
    };
  }

  private rehydrateGmdhModel(result: any): any {
    if (!result || result.modelType !== 'GMDH') return result;

    const layers = result.details?.model?.layers || result.deployment?.gmdh?.layers;
    if (Array.isArray(layers)) {
      const predictFn = (factors: number[]): number => {
        let currentVals = [...factors];
        for (const layer of layers) {
          currentVals = layer.map((neuron: any) => {
            const xi = currentVals[neuron.inputs[0]];
            const xj = currentVals[neuron.inputs[1]];
            const c = neuron.coeffs;
            if (c.length === 6) {
              return (
                c[0] +
                c[1] * xi +
                c[2] * xj +
                c[3] * xi * xi +
                c[4] * xj * xj +
                c[5] * xi * xj
              );
            } else {
              return (
                c[0] +
                c[1] * xi +
                c[2] * xj +
                c[3] * xi * xi +
                c[4] * xj * xj +
                c[5] * xi * xj +
                c[6] * xi * xi * xi +
                c[7] * xj * xj * xj +
                c[8] * xi * xi * xj +
                c[9] * xi * xj * xj
              );
            }
          });
        }
        return currentVals[0];
      };

      if (result.details?.model) {
        result.details.model.predict = predictFn;
      } else if (result.details) {
        result.details.model = { layers, predict: predictFn };
      }
      if (!result.model && result.details?.model) {
        result.model = result.details.model;
      }
    }
    return result;
  }

  get available(): boolean {
    return this.worker !== null;
  }

  public runTaskWithId<TResult = any>(
    taskType: DOEWorkerTaskType,
    payload: any,
    onProgress?: (progress: number) => void,
  ): { requestId: number; promise: Promise<TResult> } {
    const requestId = this.nextId++;

    if (!this.worker) {
      // Fallback path when worker is not instantiated
      const fallbackPromise = handleDOEWorkerMessage(
        { requestId, taskType, payload },
        onProgress,
      ).then((res) => {
        if (!res.ok) {
          throw new Error(res.error?.message || 'Fallback execution error');
        }
        return this.rehydrateGmdhModel(res.result) as TResult;
      });

      return { requestId, promise: fallbackPromise };
    }

    const promise = new Promise<TResult>((resolve, reject) => {
      this.pending.set(requestId, {
        requestId,
        taskType,
        resolve,
        reject,
        onProgress,
      });

      const request: DOEWorkerRequest = { requestId, taskType, payload };
      this.worker!.postMessage(request);
    });

    return { requestId, promise };
  }

  public cancel(requestId: number): void {
    const pending = this.pending.get(requestId);
    if (pending) {
      this.pending.delete(requestId);
      pending.reject(new Error(`Request ${requestId} was cancelled`));
    }

    if (this.worker) {
      const cancelReq: DOEWorkerRequest = {
        requestId: this.nextId++,
        taskType: 'cancel',
        payload: { targetRequestId: requestId },
      };
      this.worker.postMessage(cancelReq);
    }
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const pending of this.pending.values()) {
      pending.reject(new Error('DOEWorkerClient terminated'));
    }
    this.pending.clear();
  }

  public fitRSM(input: DOEInputDataset): Promise<DOEModelResult> {
    return this.runTaskWithId<DOEModelResult>('fitRSM', { input }).promise;
  }

  public fitGMDH(
    input: DOEInputDataset & GMDHOptions,
    options?: GMDHOptions,
  ): Promise<DOEModelResult> {
    return this.runTaskWithId<DOEModelResult>('fitGMDH', { input, options }).promise;
  }

  public fitTaguchi(
    input: DOEInputDataset & TaguchiOptions,
    options?: TaguchiOptions,
  ): Promise<DOEModelResult> {
    return this.runTaskWithId<DOEModelResult>('fitTaguchi', { input, options }).promise;
  }

  public computeSurface(
    request: SurfaceComputeRequest,
    onProgress?: (progress: number) => void,
  ): Promise<SurfaceComputeResult> {
    return this.runTaskWithId<SurfaceComputeResult>(
      'computeSurface',
      request,
      onProgress,
    ).promise;
  }
}

let sharedDOEClient: DOEWorkerClient | null = null;

export function getSharedDOEWorkerClient(): DOEWorkerClient {
  if (!sharedDOEClient) {
    sharedDOEClient = new DOEWorkerClient();
  }
  return sharedDOEClient;
}
