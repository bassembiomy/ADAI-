import { toRepository, fromRepository, projectNormalizedDiagram, type NormalizedSysmlStore } from './normalizedStore';
import type { SysmlRepository } from './model';
import { validateSysmlRepository, type SysmlValidationReport } from './validation';
import { analyzeMutation, type MutationImpact } from './mutations';
import { serializeRepository } from './persistence';
import type {
  WorkerRequest,
  WorkerResponse,
  CompactProjectDelta,
  CompactImpactDelta,
} from './workerProtocol';

const cancelledRequestIds = new Set<string>();

function isNormalizedStore(payload: any): payload is NormalizedSysmlStore {
  return Boolean(payload && typeof payload === 'object' && 'indexes' in payload && payload.definitions instanceof Map);
}

function ensureRepository(payload: SysmlRepository | NormalizedSysmlStore): SysmlRepository {
  if (isNormalizedStore(payload)) {
    return toRepository(payload);
  }
  return payload as SysmlRepository;
}

function ensureStore(payload: SysmlRepository | NormalizedSysmlStore): NormalizedSysmlStore {
  if (isNormalizedStore(payload)) {
    return payload;
  }
  return fromRepository(payload as SysmlRepository);
}

export function cancelRequest(requestId: string): void {
  cancelledRequestIds.add(requestId);
}

export function handleWorkerMessage(request: WorkerRequest): WorkerResponse {
  if (request.taskType === 'cancel') {
    cancelledRequestIds.add(request.requestId);
    return {
      requestId: request.requestId,
      revision: 0,
      taskType: 'validate',
      success: false,
      error: 'Cancelled',
      cancelled: true,
    };
  }

  const { requestId, revision, taskType, payload } = request;

  if (cancelledRequestIds.has(requestId)) {
    cancelledRequestIds.delete(requestId);
    return {
      requestId,
      revision,
      taskType,
      success: false,
      error: 'Request cancelled before execution',
      cancelled: true,
    };
  }

  const startTime = performance.now();

  try {
    switch (taskType) {
      case 'validate': {
        const repo = ensureRepository(payload);
        if (cancelledRequestIds.has(requestId)) {
          cancelledRequestIds.delete(requestId);
          return { requestId, revision, taskType, success: false, error: 'Cancelled', cancelled: true };
        }
        const result: SysmlValidationReport = validateSysmlRepository(repo);
        return {
          requestId,
          revision,
          taskType,
          success: true,
          result,
          durationMs: performance.now() - startTime,
        };
      }

      case 'project': {
        const store = ensureStore(payload);
        if (cancelledRequestIds.has(requestId)) {
          cancelledRequestIds.delete(requestId);
          return { requestId, revision, taskType, success: false, error: 'Cancelled', cancelled: true };
        }
        const view = projectNormalizedDiagram(store, request.diagramId);
        const delta: CompactProjectDelta = {
          diagramId: request.diagramId,
          blockIds: view.blocks.map(b => b.id),
          partIds: view.parts.map(p => p.id),
          connectorIds: view.connectors.map(c => c.id),
          relationshipIds: view.relationships.map(r => r.id),
          totalElements: view.blocks.length + view.parts.length + view.connectors.length + view.relationships.length,
        };
        return {
          requestId,
          revision,
          taskType,
          success: true,
          result: { view, delta },
          durationMs: performance.now() - startTime,
        };
      }

      case 'impact': {
        const repo = ensureRepository(payload);
        if (cancelledRequestIds.has(requestId)) {
          cancelledRequestIds.delete(requestId);
          return { requestId, revision, taskType, success: false, error: 'Cancelled', cancelled: true };
        }
        const impact: MutationImpact = analyzeMutation(repo, {
          kind: 'deleteElements',
          elementIds: request.targetElementIds,
        });
        const delta: CompactImpactDelta = {
          requestedElementIds: impact.requestedElementIds,
          deletedElementIds: impact.deletedElementIds,
          impactSummary: {
            nestedRequirements: impact.nestedRequirementIds.length,
            removedRelationships: impact.removedRelationshipIds.length,
            unresolvedUsages: impact.unresolvedUsageIds.length,
            invalidatedEvidence: impact.invalidatedEvidenceIds.length,
          },
          impact,
        };
        return {
          requestId,
          revision,
          taskType,
          success: true,
          result: delta,
          durationMs: performance.now() - startTime,
        };
      }

      case 'serialize': {
        const repo = ensureRepository(payload);
        if (cancelledRequestIds.has(requestId)) {
          cancelledRequestIds.delete(requestId);
          return { requestId, revision, taskType, success: false, error: 'Cancelled', cancelled: true };
        }
        const json = serializeRepository(repo);
        return {
          requestId,
          revision,
          taskType,
          success: true,
          result: json,
          durationMs: performance.now() - startTime,
        };
      }

      default:
        return {
          requestId,
          revision,
          taskType,
          success: false,
          error: `Unknown task type: ${(request as any).taskType}`,
        };
    }
  } catch (err) {
    return {
      requestId,
      revision,
      taskType,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    cancelledRequestIds.delete(requestId);
  }
}

// Web Worker message event binding (only executed when loaded in a dedicated worker environment)
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const response = handleWorkerMessage(event.data);
    (self as any).postMessage(response);
  };
}
