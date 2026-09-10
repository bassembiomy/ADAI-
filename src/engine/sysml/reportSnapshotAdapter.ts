import type { SysmlRepository } from './model';
import { buildTraceabilityIndex, findRequirementCycles, type TraceabilityIndex, type TraceabilityDiagnostic } from './traceabilityIndex';
import { hash, stableStringify } from './requirements';

export interface CanonicalTraceabilitySnapshot {
  repository: SysmlRepository;
  repositoryRevision: number;
  modelHash: string;
  index: TraceabilityIndex;
  diagnostics: TraceabilityDiagnostic[];
}

export function buildCanonicalTraceabilitySnapshot(repository: SysmlRepository): CanonicalTraceabilitySnapshot {
  const index = buildTraceabilityIndex(repository);
  const cycleDiagnostics = findRequirementCycles(index).map(cycle => ({
    code: 'REQUIREMENT_CYCLE' as const,
    elementId: cycle[0],
    message: `Requirement cycle detected: ${cycle.join(' -> ')}`,
  }));
  const diagnostics = [...index.diagnostics, ...cycleDiagnostics];
  return {
    repository,
    repositoryRevision: repository.revision,
    modelHash: hash(stableStringify(repository)),
    index,
    diagnostics,
  };
}
