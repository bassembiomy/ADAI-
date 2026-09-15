import { findRoots } from '../engine/xbridges/BlockDefinitions';

export interface RootLocusCalculationParams {
  numerator: number[];
  denominator: number[];
  maxGain: number;
  numPoints?: number;
}

export interface RootLocusResult {
  olPoles: { re: number; im: number }[];
  olZeros: { re: number; im: number }[];
  gains: number[];
  trajectories: { re: number; im: number; gain: number }[][];
  allPolesMap: { re: number; im: number; gain: number }[];
}

export function computeRootLocus(params: RootLocusCalculationParams): RootLocusResult {
  const { numerator, denominator, maxGain, numPoints = 120 } = params;

  const olPoles = findRoots(denominator);
  const olZeros = findRoots(numerator);

  const gains: number[] = [];
  for (let i = 0; i <= numPoints; i++) {
    gains.push(maxGain * Math.pow(i / numPoints, 2));
  }

  const dCoeffs = [...denominator];
  const nCoeffs = [...numerator];
  const maxLength = Math.max(dCoeffs.length, nCoeffs.length);
  while (dCoeffs.length < maxLength) dCoeffs.unshift(0);
  while (nCoeffs.length < maxLength) nCoeffs.unshift(0);

  const degree = dCoeffs.length - 1;
  const trajectories: { re: number; im: number; gain: number }[][] = Array.from({ length: Math.max(0, degree) }, () => []);
  const allPolesMap: { re: number; im: number; gain: number }[] = [];

  let prevRoots = olPoles.map(r => ({ ...r, gain: 0 }));
  prevRoots.forEach((r, idx) => {
    if (trajectories[idx]) {
      trajectories[idx].push(r);
    }
    allPolesMap.push(r);
  });

  for (let step = 1; step < gains.length; step++) {
    const K = gains[step];
    const closedLoopCoeffs = dCoeffs.map((dVal, idx) => dVal + K * nCoeffs[idx]);
    const currentRoots = findRoots(closedLoopCoeffs);

    const matchedIndices = new Set<number>();
    const nextPrevRoots: { re: number; im: number; gain: number }[] = [];

    for (let i = 0; i < prevRoots.length; i++) {
      const prev = prevRoots[i];
      let bestDist = Infinity;
      let bestIdx = -1;

      for (let j = 0; j < currentRoots.length; j++) {
        if (matchedIndices.has(j)) continue;
        const curr = currentRoots[j];
        const dist = Math.pow(curr.re - prev.re, 2) + Math.pow(curr.im - prev.im, 2);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = j;
        }
      }

      if (bestIdx !== -1) {
        matchedIndices.add(bestIdx);
        const matchedRoot = { ...currentRoots[bestIdx], gain: K };
        if (trajectories[i]) {
          trajectories[i].push(matchedRoot);
        }
        nextPrevRoots.push(matchedRoot);
        allPolesMap.push(matchedRoot);
      } else {
        const fallback = { ...prev, gain: K };
        if (trajectories[i]) {
          trajectories[i].push(fallback);
        }
        nextPrevRoots.push(fallback);
        allPolesMap.push(fallback);
      }
    }
    prevRoots = nextPrevRoots;
  }

  return {
    olPoles,
    olZeros,
    gains,
    trajectories,
    allPolesMap,
  };
}

export class XbridgesAnalysisClient {
  private worker: Worker | null = null;
  private currentRequestId = 0;
  private activePending: {
    requestId: number;
    resolve: (res: RootLocusResult) => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(workerFactory?: (() => Worker) | null) {
    if (workerFactory === null) {
      this.worker = null;
      return;
    }

    const factory = workerFactory ?? (typeof Worker !== 'undefined'
      ? () => new Worker(new URL('./xbridgesAnalysisWorker.ts', import.meta.url), { type: 'module' })
      : null);

    if (factory) {
      try {
        this.worker = factory();
        this.worker.onmessage = (e: MessageEvent) => {
          const { requestId, ok, result, error } = e.data;
          if (!this.activePending || this.activePending.requestId !== requestId) {
            return;
          }
          const pending = this.activePending;
          this.activePending = null;
          if (ok) {
            pending.resolve(result);
          } else {
            pending.reject(new Error(error?.message || 'Root locus calculation failed'));
          }
        };
        this.worker.onerror = (e) => {
          if (this.activePending) {
            this.activePending.reject(new Error(e.message || 'Analysis worker failed'));
            this.activePending = null;
          }
        };
      } catch {
        this.worker = null;
      }
    }
  }

  public get available(): boolean {
    return this.worker !== null;
  }

  public computeRootLocusAsync(params: RootLocusCalculationParams): Promise<RootLocusResult> {
    // Supersede any earlier request
    if (this.activePending) {
      const prev = this.activePending;
      this.activePending = null;
      prev.reject(new Error(`Root locus request ${prev.requestId} superseded by newer parameters`));
    }

    const requestId = ++this.currentRequestId;

    return new Promise<RootLocusResult>((resolve, reject) => {
      this.activePending = { requestId, resolve, reject };

      if (this.worker) {
        this.worker.postMessage({ requestId, params });
      } else {
        // Asynchronous deferral to prevent blocking renderer
        setTimeout(() => {
          if (!this.activePending || this.activePending.requestId !== requestId) {
            return;
          }
          try {
            const result = computeRootLocus(params);
            if (this.activePending && this.activePending.requestId === requestId) {
              this.activePending = null;
              resolve(result);
            }
          } catch (err: any) {
            if (this.activePending && this.activePending.requestId === requestId) {
              this.activePending = null;
              reject(err);
            }
          }
        }, 0);
      }
    });
  }

  public cancel(): void {
    if (this.activePending) {
      const prev = this.activePending;
      this.activePending = null;
      prev.reject(new Error('Root locus calculation cancelled'));
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

// Web Worker message dispatcher
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.onmessage = (event: MessageEvent) => {
    const { requestId, params } = event.data;
    try {
      const result = computeRootLocus(params);
      (self as any).postMessage({ requestId, ok: true, result });
    } catch (err: any) {
      (self as any).postMessage({ requestId, ok: false, error: { message: err?.message || 'Error' } });
    }
  };
}
