import type { SysmlRepository } from './model';
import type { NormalizedSysmlStore } from './normalizedStore';
import type { SysmlValidationReport } from './validation';
import type { MutationImpact } from './mutations';

export const SYSML_WORKER_PROTOCOL_VERSION = '1.0.0';

export type WorkerTaskType = 'validate' | 'project' | 'impact' | 'serialize';

export interface WorkerBaseRequest {
  version?: string;
  requestId: string;
  revision: number;
  taskType: WorkerTaskType;
  /** Serialized repository or normalized store snapshot */
  payload: SysmlRepository | NormalizedSysmlStore;
}

export interface WorkerValidateRequest extends WorkerBaseRequest {
  taskType: 'validate';
}

export interface WorkerProjectRequest extends WorkerBaseRequest {
  taskType: 'project';
  diagramId?: string;
}

export interface WorkerImpactRequest extends WorkerBaseRequest {
  taskType: 'impact';
  targetElementIds: string[];
}

export interface WorkerSerializeRequest extends WorkerBaseRequest {
  taskType: 'serialize';
}

export interface WorkerCancelRequest {
  version?: string;
  taskType: 'cancel';
  requestId: string;
  revision?: number;
}

export type WorkerRequest =
  | WorkerValidateRequest
  | WorkerProjectRequest
  | WorkerImpactRequest
  | WorkerSerializeRequest
  | WorkerCancelRequest;

export interface WorkerSuccessResponse<T = unknown> {
  version?: string;
  requestId: string;
  revision: number;
  taskType: WorkerTaskType;
  success: true;
  result: T;
  durationMs: number;
}

export interface WorkerErrorResponse {
  version?: string;
  requestId: string;
  revision: number;
  taskType: WorkerTaskType;
  success: false;
  error: string;
  cancelled?: boolean;
}

export type WorkerResponse<T = unknown> = WorkerSuccessResponse<T> | WorkerErrorResponse;

export interface CompactProjectDelta {
  diagramId?: string;
  blockIds: string[];
  partIds: string[];
  connectorIds: string[];
  relationshipIds: string[];
  totalElements: number;
}

export interface CompactImpactDelta {
  requestedElementIds: string[];
  deletedElementIds: string[];
  impactSummary: {
    nestedRequirements: number;
    removedRelationships: number;
    unresolvedUsages: number;
    invalidatedEvidence: number;
  };
  impact: MutationImpact;
}

/** Threshold below which synchronous execution is preferred over worker overhead */
export const WORKER_FAST_PATH_THRESHOLD = 200;

export function shouldRunInWorker(entityCount: number): boolean {
  return entityCount >= WORKER_FAST_PATH_THRESHOLD;
}
