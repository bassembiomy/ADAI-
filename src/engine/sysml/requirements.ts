import type { RequirementDefinition, SysmlRelationship, SysmlRepository } from './model';
import type { SysmlDiagnostic } from './validation';
import { deriveEvidenceStatus } from './evidence';

export type VerificationStatus = 'verified' | 'failed' | 'stale' | 'unverified';

export interface RequirementViewRow {
  requirement: RequirementDefinition;
  incoming: SysmlRelationship[];
  outgoing: SysmlRelationship[];
  verificationStatus: VerificationStatus;
}

export interface RequirementView {
  requirements: RequirementViewRow[];
  relationships: SysmlRelationship[];
  diagnostics: SysmlDiagnostic[];
}

export interface RequirementTransitionResult {
  applied: boolean;
  repository: SysmlRepository;
  diagnostics: SysmlDiagnostic[];
}

const GOVERNED_RELATIONSHIPS = new Set(['deriveReqt', 'satisfy', 'verify', 'refine', 'trace', 'copy', 'composition']);
const NORMAL_TRANSITIONS: Record<RequirementDefinition['status'], RequirementDefinition['status'][]> = {
  draft: ['approved'],
  approved: ['implemented'],
  implemented: ['verified'],
  verified: [],
  failed: ['draft', 'approved', 'implemented'],
  stale: ['draft', 'approved', 'implemented'],
  retired: [],
};

export function validateRequirement(repo: SysmlRepository, requirementId: string): SysmlDiagnostic[] {
  const requirement = repo.requirements[requirementId];
  if (!requirement) return [diag('REQUIREMENT_NOT_FOUND', requirementId, undefined, `Requirement ${requirementId} does not exist`)];
  const diagnostics: SysmlDiagnostic[] = [];
  const normalizedId = requirement.requirementId.trim().toLocaleUpperCase();
  if (!normalizedId) diagnostics.push(diag('EMPTY_REQUIREMENT_ID', requirement.id, 'requirementId', 'Requirement ID is required'));
  if (Object.values(repo.requirements).some(other => other.id !== requirement.id && other.requirementId.trim().toLocaleUpperCase() === normalizedId)) {
    diagnostics.push(diag('DUPLICATE_REQUIREMENT_ID', requirement.id, 'requirementId', `Requirement ID ${requirement.requirementId} is not unique`));
  }
  if (!requirement.text.trim()) diagnostics.push(diag('EMPTY_REQUIREMENT_TEXT', requirement.id, 'text', 'Normative requirement text is required'));
  if (!requirement.version.trim()) diagnostics.push(diag('EMPTY_REQUIREMENT_VERSION', requirement.id, 'version', 'Requirement version is required'));
  if (!requirement.owner?.trim()) diagnostics.push(diag('MISSING_REQUIREMENT_OWNER', requirement.id, 'owner', 'Requirement owner is required'));
  if (requirement.baselineId && !repo.baselines[requirement.baselineId]) diagnostics.push(diag('MISSING_BASELINE', requirement.id, 'baselineId', `Baseline ${requirement.baselineId} does not exist`));
  if (requirement.copiedFromId && !repo.requirements[requirement.copiedFromId]) diagnostics.push(diag('MISSING_COPY_SOURCE', requirement.id, 'copiedFromId', `Copy source ${requirement.copiedFromId} does not exist`));
  return diagnostics;
}

export function transitionRequirementStatus(
  repo: SysmlRepository,
  requirementId: string,
  targetStatus: RequirementDefinition['status'],
): RequirementTransitionResult {
  const requirement = repo.requirements[requirementId];
  if (!requirement) return { applied: false, repository: repo, diagnostics: [diag('REQUIREMENT_NOT_FOUND', requirementId, undefined, `Requirement ${requirementId} does not exist`)] };
  if (targetStatus === requirement.status) return { applied: true, repository: repo, diagnostics: [] };
  const exceptional = targetStatus === 'failed' || targetStatus === 'stale' || targetStatus === 'retired';
  if (!exceptional && !NORMAL_TRANSITIONS[requirement.status].includes(targetStatus)) {
    return { applied: false, repository: repo, diagnostics: [diag('INVALID_REQUIREMENT_STATUS_TRANSITION', requirement.id, 'status', `${requirement.status} cannot transition directly to ${targetStatus}`)] };
  }
  if (targetStatus === 'verified' && !hasCurrentPassingEvidence(repo, requirement.id)) {
    return { applied: false, repository: repo, diagnostics: [diag('CURRENT_PASSING_EVIDENCE_REQUIRED', requirement.id, 'status', 'Verified requires current passed verification evidence')] };
  }
  const next = structuredClone(repo);
  next.requirements[requirementId].status = targetStatus;
  next.revision += 1;
  return { applied: true, repository: next, diagnostics: [] };
}

export function markSuspectLinks(repo: SysmlRepository, changedElementIds: readonly string[]): SysmlRepository {
  const changed = new Set(changedElementIds);
  const next = structuredClone(repo);
  next.revision += 1;
  const affectedRequirements = new Set<string>();
  for (const relationship of Object.values(next.relationships)) {
    if (changed.has(relationship.sourceId) || changed.has(relationship.targetId)) {
      relationship.suspect = true;
      if (next.requirements[relationship.sourceId]) affectedRequirements.add(relationship.sourceId);
      if (next.requirements[relationship.targetId]) affectedRequirements.add(relationship.targetId);
    }
  }
  for (const id of changed) if (next.requirements[id]) affectedRequirements.add(id);
  for (const id of affectedRequirements) {
    if (next.requirements[id].status === 'verified') next.requirements[id].status = 'stale';
  }
  return next;
}

export function deriveRequirementView(repo: SysmlRepository): RequirementView {
  const relationships = Object.values(repo.relationships).filter(relationship => GOVERNED_RELATIONSHIPS.has(relationship.kind));
  const diagnostics = Object.values(repo.requirements).flatMap(requirement => validateRequirement(repo, requirement.id));
  for (const relationship of relationships) {
    if (!validDirection(repo, relationship)) diagnostics.push(diag('INVALID_REQUIREMENT_RELATION_DIRECTION', relationship.id, 'kind', `${relationship.kind} has invalid requirement endpoints`));
  }
  diagnostics.push(...cycleDiagnostics(repo, relationships.filter(r => r.kind === 'deriveReqt' || r.kind === 'copy'), 'REQUIREMENT_DERIVATION_CYCLE'));
  diagnostics.push(...cycleDiagnostics(repo, relationships.filter(r => r.kind === 'composition' && repo.requirements[r.sourceId] && repo.requirements[r.targetId]), 'REQUIREMENT_CONTAINMENT_CYCLE'));
  const requirements = Object.values(repo.requirements).sort((a, b) => a.requirementId.localeCompare(b.requirementId)).map(requirement => {
    const incoming = relationships.filter(r => r.targetId === requirement.id);
    const outgoing = relationships.filter(r => r.sourceId === requirement.id);
    return { requirement, incoming, outgoing, verificationStatus: verificationStatus(repo, requirement.id, [...incoming, ...outgoing]) };
  });
  return { requirements, relationships, diagnostics };
}

function hasCurrentPassingEvidence(repo: SysmlRepository, requirementId: string): boolean {
  const cases = new Set(Object.values(repo.verificationCases).filter(test => test.verifiesRequirementIds.includes(requirementId)).map(test => test.id));
  return Object.values(repo.evidence).some(evidence => evidence.requirementId === requirementId && cases.has(evidence.verificationCaseId) && evidence.result === 'passed' && deriveEvidenceStatus(repo, evidence.id) === 'current');
}

function verificationStatus(repo: SysmlRepository, requirementId: string, relationships: SysmlRelationship[]): VerificationStatus {
  if (relationships.some(relationship => relationship.suspect)) return 'stale';
  const evidence = Object.values(repo.evidence).filter(item => item.requirementId === requirementId);
  if (evidence.some(item => item.result === 'failed')) return 'failed';
  if (evidence.some(item => item.result === 'passed')) return 'verified';
  return 'unverified';
}

function validDirection(repo: SysmlRepository, relationship: SysmlRelationship): boolean {
  const sourceReq = Boolean(repo.requirements[relationship.sourceId]);
  const targetReq = Boolean(repo.requirements[relationship.targetId]);
  switch (relationship.kind) {
    case 'deriveReqt':
    case 'copy':
    case 'composition': return sourceReq && targetReq;
    case 'satisfy': return !sourceReq && targetReq;
    case 'verify': return Boolean(repo.verificationCases[relationship.sourceId]) && targetReq;
    case 'refine': return !sourceReq && targetReq;
    case 'trace': return sourceReq || targetReq;
    default: return true;
  }
}

function cycleDiagnostics(repo: SysmlRepository, relationships: SysmlRelationship[], code: string): SysmlDiagnostic[] {
  const next = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (!repo.requirements[relationship.sourceId] || !repo.requirements[relationship.targetId]) continue;
    next.set(relationship.sourceId, [...(next.get(relationship.sourceId) ?? []), relationship.targetId]);
  }
  const diagnostics: SysmlDiagnostic[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      if (!reported.has(id)) diagnostics.push(diag(code, id, 'relationships', `Requirement cycle includes ${id}`));
      reported.add(id);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of next.get(id) ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of next.keys()) visit(id);
  return diagnostics;
}

function diag(code: string, elementId: string, propertyPath: string | undefined, message: string): SysmlDiagnostic {
  return { code, severity: 'error', elementId, propertyPath, message };
}
