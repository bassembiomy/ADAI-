import type { HierarchySourceModel } from './reportHierarchyEngine';
import type { ReportModelDiagnostics } from '../../services/reportModelConsistency';
import { createEmptyRepository, type SysmlRepository } from '../../engine/sysml/model';
import { computeCoverageMetrics, type TraceabilityMatrix } from '../../engine/sysml/rtm';
import { buildSystemReport } from './systemReport/buildSystemReport';

export interface ArchitectureReportOptions {
  projectName?: string;
  author?: string;
  version?: string;
  /** Canonical repository; an empty one is used when the caller only has the legacy hierarchy projection. */
  repository?: SysmlRepository;
  /** Traceability matrix for the repository; an empty one is used when omitted. */
  matrix?: TraceabilityMatrix;
  generatedAt?: Date;
}

/** Builds the full system report from a legacy hierarchy projection (kept for existing callers). */
export function generateArchitectureReport(
  source: HierarchySourceModel,
  diagnostics?: ReportModelDiagnostics,
  options?: ArchitectureReportOptions,
): string {
  const repository = options?.repository ?? createEmptyRepository();
  const matrix: TraceabilityMatrix = options?.matrix ?? { revision: repository.revision, filters: {}, rows: [] };
  return buildSystemReport({
    projectName: options?.projectName || 'System Architecture',
    author: options?.author || 'Engineer',
    engineVersion: options?.version || '1.0.0',
    generatedAt: options?.generatedAt ?? new Date(),
    repository,
    hierarchy: source,
    diagnostics,
    traceability: { matrix, metrics: computeCoverageMetrics(matrix), repositoryRevision: repository.revision },
  });
}
