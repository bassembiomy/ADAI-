import type { ModelDiagnostic, SolverOptions, XModel } from './types';

export interface XbridgesEngineSnapshot {
  time: number;
  blockStates: Record<string, any>;
  signalValues?: Record<string, any>;
}

export type XbridgesWorkerTaskType = 'step' | 'batch' | 'compile' | 'cancel' | 'reset';

export interface XbridgesWorkerRequest {
  requestId: number;
  type: XbridgesWorkerTaskType;
  model?: XModel;
  engineRunId?: string;
  solverType?: string;
  solverOptions?: Partial<SolverOptions>;
  engineSnapshot?: XbridgesEngineSnapshot | null;
  time: number;
  dt: number;
  batchSize?: number;
  paramUpdates?: Record<string, Record<string, any>>;
  inportOverrides?: Record<string, any>;
}

export interface XbridgesWorkerResponse {
  requestId: number;
  ok: boolean;
  simulationTime: number;
  engineRunId?: string;
  engineSnapshot?: XbridgesEngineSnapshot;
  outputValues?: Record<string, any>;
  diagnostics?: ModelDiagnostic[];
  progress?: number;
  error?: {
    message: string;
    stack?: string;
  };
}
