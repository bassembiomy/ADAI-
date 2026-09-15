import { buildTraceabilityMatrix, computeCoverageMetrics, type TraceabilityMatrix, type RtmMetrics, type RtmFilterOptions } from './rtm';
import type { SysmlRepository } from './model';
import { renderRequirementsDiagram, renderBddDiagram } from '../../features/reporting/reportDiagrams';
import type { BlockData, RelationshipData } from '../../types/sysml_types';

export type ReportWorkerTaskType = 'rtm' | 'diagram' | 'bddDiagram' | 'cancel';

export interface ReportWorkerRequest {
  requestId: number;
  type: ReportWorkerTaskType;
  payload: any;
  options?: any;
}

export interface ReportWorkerResponse {
  requestId: number;
  ok: boolean;
  result?: any;
  error?: {
    message: string;
    stack?: string;
  };
}

export function handleReportWorkerMessage(request: ReportWorkerRequest): ReportWorkerResponse {
  const { requestId, type, payload, options } = request;

  if (type === 'cancel') {
    return {
      requestId,
      ok: true,
      result: { cancelled: true },
    };
  }

  try {
    if (type === 'rtm') {
      const repo = payload as SysmlRepository;
      const matrix = buildTraceabilityMatrix(repo, options as RtmFilterOptions);
      const metrics = computeCoverageMetrics(matrix);
      return {
        requestId,
        ok: true,
        result: { matrix, metrics },
      };
    }

    if (type === 'diagram') {
      const source = payload as { blocks: readonly BlockData[]; relationships: readonly RelationshipData[] };
      const svg = renderRequirementsDiagram(source);
      return {
        requestId,
        ok: true,
        result: { svg },
      };
    }

    if (type === 'bddDiagram') {
      const source = payload as { blocks: readonly BlockData[]; relationships: readonly RelationshipData[] };
      const svg = renderBddDiagram(source);
      return {
        requestId,
        ok: true,
        result: { svg },
      };
    }

    return {
      requestId,
      ok: false,
      error: { message: `Unknown task type: ${type}` },
    };
  } catch (err: any) {
    return {
      requestId,
      ok: false,
      error: {
        message: err?.message || 'Report worker execution failed',
        stack: err?.stack,
      },
    };
  }
}

// Web Worker message listener
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<ReportWorkerRequest>) => {
    const response = handleReportWorkerMessage(event.data);
    (self as any).postMessage(response);
  };
}
