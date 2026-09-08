import type { TraceArtifact, VerificationEvidence, SysmlRepository } from './model';
import { validateSysmlRepository, type SysmlDiagnostic } from './validation';

export type SysmlOperation = 'simulate' | 'report' | 'export' | 'verify';
export type EvidenceCurrency = 'current' | 'stale' | 'missing';

export interface OperationGate {
  operation: SysmlOperation;
  allowed: boolean;
  diagnostics: SysmlDiagnostic[];
}

export function semanticFingerprint(repo: SysmlRepository, requirementId: string): string {
  const closure = traceClosure(repo, requirementId);
  const elements: unknown[] = [];
  for (const id of [...closure].sort()) {
    const element = repo.requirements[id] ?? repo.definitions[id] ?? repo.usages[id] ?? repo.connectors[id] ?? repo.relationships[id] ?? repo.verificationCases[id] ?? repo.artifacts[id];
    if (element) elements.push(semanticElement(element));
  }
  return hash(stableStringify(elements));
}

function semanticElement(element: unknown): unknown {
  if (!element || typeof element !== 'object') return element;
  const copy = { ...(element as Record<string, unknown>) };
  // Governance workflow state and link review flags do not alter the modeled
  // requirement or supplier semantics that verification evidence proves.
  if (copy.kind === 'requirement') delete copy.status;
  delete copy.suspect;
  delete copy.lastValidatedRevision;
  return copy;
}

export function recordVerificationEvidence(
  repo: SysmlRepository,
  evidence: Omit<VerificationEvidence, 'revision' | 'semanticFingerprint' | 'status'>,
): { repository: SysmlRepository; evidence: VerificationEvidence } {
  if (!repo.requirements[evidence.requirementId]) throw new Error(`Requirement ${evidence.requirementId} does not exist`);
  const test = repo.verificationCases[evidence.verificationCaseId];
  if (!test || !test.verifiesRequirementIds.includes(evidence.requirementId)) throw new Error(`Verification case ${evidence.verificationCaseId} does not verify ${evidence.requirementId}`);
  const next = structuredClone(repo);
  const recorded: VerificationEvidence = {
    ...evidence,
    revision: repo.revision,
    semanticFingerprint: semanticFingerprint(repo, evidence.requirementId),
    status: 'current',
  };
  next.evidence[recorded.id] = recorded;
  next.revision += 1;
  next.auditTrail.push({ id: `change-${next.revision}-evidence-${recorded.id}`, revision: next.revision, timestamp: recorded.executedAt, command: 'recordVerificationEvidence', elementIds: [recorded.id, recorded.verificationCaseId, recorded.requirementId] });
  return { repository: next, evidence: recorded };
}

export function deriveEvidenceStatus(repo: SysmlRepository, evidenceId: string): EvidenceCurrency {
  const evidence = repo.evidence[evidenceId];
  if (!evidence) return 'missing';
  if (!evidence.semanticFingerprint) return evidence.revision === repo.revision ? 'current' : 'stale';
  return evidence.semanticFingerprint === semanticFingerprint(repo, evidence.requirementId) ? 'current' : 'stale';
}

export function synchronizeEvidenceCurrency(repo: SysmlRepository): SysmlRepository {
  const next = structuredClone(repo);
  for (const evidence of Object.values(next.evidence)) evidence.status = deriveEvidenceStatus(repo, evidence.id) === 'current' ? 'current' : 'stale';
  return next;
}

export function traceArtifactToRequirement(
  repo: SysmlRepository,
  artifact: TraceArtifact,
  requirementId: string,
): { repository: SysmlRepository; relationshipId: string } {
  if (!repo.requirements[requirementId]) throw new Error(`Requirement ${requirementId} does not exist`);
  const next = structuredClone(repo);
  next.revision += 1;
  next.artifacts[artifact.id] = { ...artifact, revision: next.revision };
  const relationshipId = `trace-${artifact.id}-${requirementId}`;
  next.relationships[relationshipId] = { id: relationshipId, kind: 'trace', sourceId: artifact.id, targetId: requirementId, suspect: false, lastValidatedRevision: next.revision };
  next.auditTrail.push({ id: `change-${next.revision}-${relationshipId}`, revision: next.revision, timestamp: new Date().toISOString(), command: 'traceArtifactToRequirement', elementIds: [artifact.id, requirementId, relationshipId] });
  return { repository: synchronizeEvidenceCurrency(next), relationshipId };
}

export function evaluateSysmlOperationGate(repo: SysmlRepository, operation: SysmlOperation): OperationGate {
  const validation = validateSysmlRepository(repo);
  const allowed = operation === 'simulate' ? validation.canSimulate
    : operation === 'report' ? validation.canReport
      : operation === 'export' ? validation.canExport
        : validation.canVerify;
  return { operation, allowed, diagnostics: validation.diagnostics };
}

function traceClosure(repo: SysmlRepository, rootId: string): Set<string> {
  const closure = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const relationship of Object.values(repo.relationships)) {
      if (closure.has(relationship.sourceId) || closure.has(relationship.targetId)) {
        for (const id of [relationship.id, relationship.sourceId, relationship.targetId]) {
          if (!closure.has(id)) { closure.add(id); changed = true; }
        }
      }
    }
    for (const test of Object.values(repo.verificationCases)) {
      if (test.verifiesRequirementIds.some(id => closure.has(id)) && !closure.has(test.id)) { closure.add(test.id); changed = true; }
    }
    for (const usage of Object.values(repo.usages)) {
      if (closure.has(usage.id)) {
        const references = usage.kind === 'part' ? [usage.ownerId, usage.typeId] : [usage.ownerId, usage.definitionId];
        for (const id of references) if (!closure.has(id)) { closure.add(id); changed = true; }
      }
    }
    for (const artifact of Object.values(repo.artifacts)) {
      if (closure.has(artifact.id) && artifact.ownerId && !closure.has(artifact.ownerId)) { closure.add(artifact.ownerId); changed = true; }
    }
  }
  return closure;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(16).padStart(8, '0');
}
