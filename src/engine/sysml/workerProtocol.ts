import type { SysmlRepository } from './model';
import type { NormalizedSysmlStore } from './normalizedStore';
import type { SysmlValidationReport } from './validation';
import type { MutationImpact } from './mutations';

export type WorkerTaskType = 'validate' | 'project' | 'impact' | 'serialize';

export interface WorkerBaseRequest {
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
  taskType: 'cancel';
  requestId: string;
}

export type WorkerRequest =
  | WorkerValidateRequest
  | WorkerProjectRequest
  | WorkerImpactRequest
  | WorkerSerializeRequest
  | WorkerCancelRequest;

export interface WorkerSuccessResponse<T = unknown> {
  requestId: string;
  revision: number;
  taskType: WorkerTaskType;
  success: true;
  result: T;
  durationMs: number;
}

export interface WorkerErrorResponse {
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
