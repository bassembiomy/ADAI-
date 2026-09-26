import {
  toRepository,
  fromRepository,
  fromWorkerSnapshot,
  projectNormalizedDiagram,
  type NormalizedSysmlStore,
} from './normalizedStore';
import type { SysmlRepository } from './model';
import { validateSysmlRepository, type SysmlDiagnostic, type SysmlValidationReport } from './validation';
import { analyzeMutation, type MutationImpact } from './mutations';
import { classifyDeletionTarget } from './policy';
import { serializeRepository } from './persistence';
import type {
  WorkerRequest,
  WorkerResponse,
  WorkerStoreSnapshot,
  CompactProjectDelta,
  CompactImpactDelta,
} from './workerProtocol';

const cancelledRequestIds = new Set<string>();

function isNormalizedStore(payload: any): payload is NormalizedSysmlStore {
  return Boolean(payload && typeof payload === 'object' && 'indexes' in payload && payload.definitions instanceof Map);
}

function isWorkerSnapshot(payload: any): payload is WorkerStoreSnapshot {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    payload.schemaVersion === 2 &&
    typeof payload.revision === 'number' &&
    !(payload.definitions instanceof Map)
  );
}

function ensureRepository(payload: WorkerStoreSnapshot | SysmlRepository | NormalizedSysmlStore): SysmlRepository {
  if (isNormalizedStore(payload)) {
    return toRepository(payload);
  }
  if (isWorkerSnapshot(payload)) {
    return toRepository(fromWorkerSnapshot(payload));
  }
  return payload as SysmlRepository;
}

function ensureStore(payload: WorkerStoreSnapshot | SysmlRepository | NormalizedSysmlStore): NormalizedSysmlStore {
  if (isNormalizedStore(payload)) {
    return payload;
  }
  if (isWorkerSnapshot(payload)) {
    return fromWorkerSnapshot(payload);
  }
  return fromRepository(payload as SysmlRepository);
}

export function cancelRequest(requestId: string): void {
  cancelledRequestIds.add(requestId);
}

export interface CompactWorkerDiagnostic {
  code: string;
  severity: SysmlDiagnostic['severity'];
  elementId?: string;
}

/** Compact (code-only + severity) projection of diagnostics — no element payloads, no repository. */
export function toCompactDiagnostics(diagnostics: readonly SysmlDiagnostic[]): CompactWorkerDiagnostic[] {
  return diagnostics.map(diagnostic => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    ...(diagnostic.elementId === undefined ? {} : { elementId: diagnostic.elementId }),
  }));
}

/** Sorted unique diagnostic codes for a validation report. */
export function toDiagnosticCodes(diagnostics: readonly Pick<SysmlDiagnostic, 'code'>[]): string[] {
  return [...new Set(diagnostics.map(diagnostic => diagnostic.code))].sort();
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

  // Validate payload format & revision match
  if (!payload || typeof payload !== 'object') {
    return {
      requestId,
      revision,
      taskType,
      success: false,
      error: 'Malformed worker request: payload must be a non-null object',
    };
  }

  if ('schemaVersion' in payload && payload.schemaVersion !== 2 && payload.schemaVersion !== 3) {
    return {
      requestId,
      revision,
      taskType,
      success: false,
      error: `Unsupported schemaVersion: ${(payload as any).schemaVersion} (expected 2 or 3)`,
    };
  }

  if ('revision' in payload && typeof payload.revision === 'number' && payload.revision !== revision) {
    return {
      requestId,
      revision,
      taskType,
      success: false,
      error: `Revision mismatch: request revision ${revision} != payload revision ${payload.revision}`,
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
          result: {
            ...result,
            diagnosticCodes: toDiagnosticCodes(result.diagnostics),
            compactDiagnostics: toCompactDiagnostics(result.diagnostics),
          },
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
        // Compact diagnostic codes for the projected revision (IDs only —
        // the repository itself is never embedded in the response).
        const projectedDiagnostics = validateSysmlRepository(toRepository(store)).diagnostics;
        return {
          requestId,
          revision,
          taskType,
          success: true,
          result: { view, delta, diagnosticCodes: toDiagnosticCodes(projectedDiagnostics) },
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
        const targetIds = [...new Set(request.targetElementIds)].sort();
        const targets = targetIds.map(id => {
          const decision = classifyDeletionTarget(repo, id);
          return { id, targetKind: decision.targetKind, cascadeIds: decision.cascadeIds, unresolvedUsageIds: decision.unresolvedUsageIds };
        });
        const targetDiagnosticCodes = toDiagnosticCodes(
          targetIds.flatMap(id => classifyDeletionTarget(repo, id).diagnostics.map(entry => ({ code: entry.split(':')[0].trim() }))),
        );
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
          result: { ...delta, targets, diagnosticCodes: targetDiagnosticCodes },
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
