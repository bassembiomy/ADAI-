import type {
  SysmlRepository,
  SysmlDefinition,
  SysmlUsage,
  ConnectorUsage,
  SysmlRelationship,
  RequirementDefinition,
  VerificationCase,
  VerificationEvidence,
  ModelBaseline,
  TraceArtifact,
  ModelChangeRecord,
  ActorDefinition,
  SubjectDefinition,
  UseCaseDefinition,
  ExtensionPoint,
  DiagramReference,
} from './model';
import type { NormalizedSysmlStore } from './normalizedStore';
import type { SysmlValidationReport } from './validation';
import type { MutationImpact } from './mutations';
import type { DiagramPresentationInput, PresentationCoordinates } from './presentationState';

export const SYSML_WORKER_PROTOCOL_VERSION = '1.0.0';

export type WorkerTaskType = 'validate' | 'project' | 'impact' | 'serialize';

/**
 * Worker-safe serializable snapshot using plain objects/arrays (no Map/Set).
 * Can be transferred efficiently across Web Worker postMessage boundaries.
 */
export interface WorkerStoreSnapshot {
  schemaVersion: 2;
  profileId: 'OMG-SysML-1.6-ADIA';
  revision: number;
  definitions: Record<string, SysmlDefinition>;
  usages: Record<string, SysmlUsage>;
  connectors: Record<string, ConnectorUsage>;
  relationships: Record<string, SysmlRelationship>;
  requirements: Record<string, RequirementDefinition>;
  verificationCases: Record<string, VerificationCase>;
  evidence?: Record<string, VerificationEvidence>;
  baselines?: Record<string, ModelBaseline>;
  artifacts?: Record<string, TraceArtifact>;
  auditTrail?: ModelChangeRecord[];
  actors?: Record<string, ActorDefinition>;
  subjects?: Record<string, SubjectDefinition>;
  useCases?: Record<string, UseCaseDefinition>;
  extensionPoints?: Record<string, ExtensionPoint>;
  diagramReferences?: Record<string, DiagramReference>;
  coordinates?: Record<string, PresentationCoordinates>;
  diagramPresentations?: Record<string, DiagramPresentationInput>;
  activeDiagramId?: string;
  activeDiagramElementIds?: string[];
}

export interface WorkerBaseRequest {
  version?: string;
  requestId: string;
  revision: number;
  taskType: WorkerTaskType;
  /** Worker-safe snapshot or normalized store / repository */
  payload: WorkerStoreSnapshot | SysmlRepository | NormalizedSysmlStore;
}

export interface WorkerValidateRequest extends WorkerBaseRequest {
  taskType: 'validate';
}

export interface WorkerProjectRequest extends WorkerBaseRequest {
  taskType: 'project';
  diagramId?: string;
  elementIds?: string[];
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
