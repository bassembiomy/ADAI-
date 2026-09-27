import type {
  DOEModelResult,
  DOEDiagnostic,
  DOEDeploymentModel,
} from './types';
import type {
  DOEInputDataset,
  TaguchiOptions,
  GMDHOptions,
} from './statistics';

export type DOEWorkerTaskType =
  | 'fitRSM'
  | 'fitGMDH'
  | 'fitTaguchi'
  | 'computeSurface'
  | 'cancel';

export interface SurfaceComputeRequest {
  type: 'surface' | 'contour';
  data: number[][];
  results: DOEModelResult | any;
  factors: { x: number; y: number };
  headers: string[];
  holdValues: number[];
  modelType?: 'RSM' | 'GMDH' | 'Taguchi';
  gridRes?: number; // default 40 -> 41x41
}

export interface SurfaceComputeResult {
  xRange: number[];
  yRange: number[];
  zGrid: number[][];
}

export interface DOEWorkerRequest<T = any> {
  requestId: number;
  taskType: DOEWorkerTaskType;
  payload: T;
}

export interface DOEWorkerResponse<R = any> {
  requestId: number;
  taskType: DOEWorkerTaskType;
  ok: boolean;
  result?: R;
  progress?: number;
  error?: {
    message: string;
    stack?: string;
  };
}
