import type { SysmlRepository } from './model';
import { classifyDeletionTarget } from './policy';
import { getNestedRequirementIds } from './requirements';
import { validateSysmlRepository, type SysmlValidationReport } from './validation';

export type SysmlCommand = { kind: 'deleteElements'; elementIds: string[] };

export interface DeletionAuthorization {
  authorizedBaselineIds?: readonly string[];
}

export type ImpactSeverity = 'safe' | 'review' | 'blocked';

export type UnresolvedUsageAction = 'keep' | 'retarget' | 'delete';

export interface UnresolvedUsageResolution {
  usageId: string;
  action: UnresolvedUsageAction;
  newTypeId?: string;
}

export interface MutationImpact {
  requestedElementIds: string[];
  deletedElementIds: string[];
  nestedRequirementIds: string[];
  removedRelationshipIds: string[];
  unresolvedUsageIds: string[];
  invalidatedEvidenceIds: string[];
  affectedRequirementIds: string[];
  affectedBaselineIds: string[];
  blockedBaselineIds: string[];
  severity: ImpactSeverity;
  affectedDiagramKinds: Array<'bdd' | 'ibd' | 'requirements' | 'rtm'>;
}

export interface MutationResult {
  applied: boolean;
  repository: SysmlRepository;
  impact: MutationImpact;
  validation: SysmlValidationReport;
  blockedBaselineIds?: string[];
  diagnostics?: Array<{ code: string; severity: 'error'; elementId?: string; message: string }>;
  forwardPatch?: import('./patches').SysmlPatch;
  inversePatch?: import('./patches').SysmlPatch;
}

export interface MutationHistory {
  past: SysmlRepository[];
  present: SysmlRepository;
  future: SysmlRepository[];
}

export function computeTouchedProtectedBaselines(
  repo: SysmlRepository,
  deletedElementIds: ReadonlySet<string> | readonly string[],
  affectedRequirementIds: ReadonlySet<string> | readonly string[] = [],
): string[] {
  const deleted = deletedElementIds instanceof Set ? deletedElementIds : new Set(deletedElementIds);
  const affectedReqs = affectedRequirementIds instanceof Set ? affectedRequirementIds : new Set(affectedRequirementIds);
  const touched = new Set<string>();
  for (const baseline of Object.values(repo.baselines)) {
    if (!baseline.protected) continue;
    if (deleted.has(baseline.id)) {
      touched.add(baseline.id);
      continue;
    }
    if (baseline.elementHashes && [...deleted].some(id => id in (baseline.elementHashes as Record<string, string>))) {
      touched.add(baseline.id);
      continue;
    }
    // Baselines without a content snapshot fall back to requirement linkage:
    // a protected baseline is touched when a baselined requirement is deleted
    // or otherwise affected by the mutation.
    if (!baseline.elementHashes) {
      for (const id of [...deleted, ...affectedReqs]) {
        if (repo.requirements[id]?.baselineId === baseline.id) {
          touched.add(baseline.id);
          break;
        }
      }
    }
  }
  return [...touched].sort();
}

export function impactSeverity(
  impact: Pick<MutationImpact, 'affectedBaselineIds' | 'deletedElementIds' | 'requestedElementIds' | 'nestedRequirementIds' | 'removedRelationshipIds' | 'unresolvedUsageIds' | 'invalidatedEvidenceIds' | 'affectedRequirementIds'>,
  authorizedBaselineIds: readonly string[] = [],
): ImpactSeverity {
  const authorized = new Set(authorizedBaselineIds);
  if (impact.affectedBaselineIds.some(id => !authorized.has(id))) return 'blocked';
  const requested = new Set(impact.requestedElementIds);
  // Bible §7 matrix: leaf/unreferenced targets (deleted set equals the
  // request, no nested content, no affected bystanders) are safe. A
  // requirement only names itself as affected when it is the requested
  // target, so affected ids beyond the request are what force review.
  const needsReview =
    impact.deletedElementIds.some(id => !requested.has(id)) ||
    impact.nestedRequirementIds.length > 0 ||
    impact.removedRelationshipIds.some(id => !requested.has(id)) ||
    impact.unresolvedUsageIds.length > 0 ||
    impact.invalidatedEvidenceIds.length > 0 ||
    impact.affectedRequirementIds.some(id => !requested.has(id));
  return needsReview ? 'review' : 'safe';
}

export function applyUnresolvedResolutions(
  repo: SysmlRepository,
  resolutions: readonly UnresolvedUsageResolution[],
): SysmlRepository {
  const next = cloneRepository(repo);
  for (const resolution of resolutions) {
    const usage = next.usages[resolution.usageId];
    if (!usage || usage.kind !== 'part') continue;
    if (resolution.action === 'keep') continue;
    if (resolution.action === 'delete') {
      delete next.usages[resolution.usageId];
      continue;
    }
    if (resolution.action === 'retarget' && resolution.newTypeId && next.definitions[resolution.newTypeId]) {
      next.usages[resolution.usageId] = { ...usage, typeId: resolution.newTypeId };
    }
  }
  next.revision = repo.revision + 1;
  return next;
}

export function analyzeMutation(repo: SysmlRepository, command: SysmlCommand): MutationImpact {
  const requested = new Set(command.elementIds);
  const deleted = new Set(command.elementIds);

  const nestedRequirementIdsSet = new Set<string>();
  for (const id of command.elementIds) {
    if (repo.requirements[id]) {
      const descendants = getNestedRequirementIds(repo, id);
      for (const descId of descendants) {
        nestedRequirementIdsSet.add(descId);
        deleted.add(descId);
      }
    }
  }

  // Central typed policy is the single source of truth for deletion cascades
  // (composite-owned parts plus lifetime-owned ports, per policy.ts).
  // Mutations drive the closure purely through classifyDeletionTarget with no
  // independent port-ownership loop. Definition-typed usages become unresolved
  // impacts, never implicit children. Shared and reference usages never join
  // the part closure.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...deleted]) {
      const decision = classifyDeletionTarget(repo, id);
      for (const cascadeId of decision.cascadeIds) {
        if (!deleted.has(cascadeId)) {
          deleted.add(cascadeId);
          changed = true;
        }
      }
    }
  }

  for (const connector of Object.values(repo.connectors)) {
    if (deleted.has(connector.ownerId) || deleted.has(connector.sourcePortId) || deleted.has(connector.targetPortId)) deleted.add(connector.id);
  }
  const removedRelationshipIdsSet = new Set<string>();
  const affectedRequirements = new Set<string>();
  for (const relationship of Object.values(repo.relationships)) {
    if (deleted.has(relationship.id) || deleted.has(relationship.sourceId) || deleted.has(relationship.targetId)) {
      deleted.add(relationship.id);
      removedRelationshipIdsSet.add(relationship.id);
      if (repo.requirements[relationship.sourceId]) affectedRequirements.add(relationship.sourceId);
      if (repo.requirements[relationship.targetId]) affectedRequirements.add(relationship.targetId);
    }
  }
  for (const id of requested) if (repo.requirements[id]) affectedRequirements.add(id);

  const invalidatedEvidence = Object.values(repo.evidence)
    .filter(e => deleted.has(e.id) || deleted.has(e.verificationCaseId) || deleted.has(e.requirementId) || affectedRequirements.has(e.requirementId))
    .map(e => e.id);
  invalidatedEvidence.forEach(id => deleted.add(id));

  const deletedDefinitions = new Set(Object.values(repo.definitions).filter(d => deleted.has(d.id)).map(d => d.id));
  // Unresolved impacts come from the central policy: every definition-typed
  // usage that is not an owned composite cascade child.
  const unresolvedFromPolicy = new Set<string>();
  for (const definitionId of deletedDefinitions) {
    for (const unresolvedId of classifyDeletionTarget(repo, definitionId).unresolvedUsageIds) {
      if (!deleted.has(unresolvedId)) unresolvedFromPolicy.add(unresolvedId);
    }
  }
  const unresolvedUsageIds = [...unresolvedFromPolicy].sort();

  const diagramKinds = new Set<MutationImpact['affectedDiagramKinds'][number]>();
  if ([...deleted].some(id => repo.definitions[id])) diagramKinds.add('bdd');
  if ([...deleted].some(id => repo.usages[id] || repo.connectors[id])) diagramKinds.add('ibd');
  if (affectedRequirements.size || [...deleted].some(id => repo.requirements[id])) diagramKinds.add('requirements');
  if (affectedRequirements.size || invalidatedEvidence.length) diagramKinds.add('rtm');

  // Protected-baseline touch set: only baselines whose frozen content (or
  // baselined requirements) intersect this deletion are affected. A protected
  // baseline never joins the cascade; it blocks the mutation until the caller
  // clones it or presents explicit authorization.
  const affectedBaselineIds = computeTouchedProtectedBaselines(repo, deleted, affectedRequirements);
  const partial: Omit<MutationImpact, 'severity' | 'blockedBaselineIds'> = {
    requestedElementIds: [...requested].sort(),
    deletedElementIds: [...deleted].sort(),
    nestedRequirementIds: [...nestedRequirementIdsSet].sort(),
    removedRelationshipIds: [...removedRelationshipIdsSet].sort(),
    unresolvedUsageIds,
    invalidatedEvidenceIds: invalidatedEvidence.sort(),
    affectedRequirementIds: [...affectedRequirements].sort(),
    affectedBaselineIds,
    affectedDiagramKinds: [...diagramKinds].sort(),
  };
  const severity = impactSeverity(partial);
  return {
    ...partial,
    blockedBaselineIds: [...affectedBaselineIds],
    severity,
  };
}

export function applyCommand(repo: SysmlRepository, command: SysmlCommand, authorization: DeletionAuthorization = {}): MutationResult {
  const impact = analyzeMutation(repo, command);
  const authorized = new Set(authorization.authorizedBaselineIds ?? []);
  const unauthorized = impact.affectedBaselineIds.filter(id => !authorized.has(id));
  if (unauthorized.length > 0) {
    return {
      applied: false,
      repository: repo,
      impact: { ...impact, blockedBaselineIds: unauthorized, severity: 'blocked' },
      validation: validateSysmlRepository(repo),
      blockedBaselineIds: unauthorized,
      diagnostics: unauthorized.map(id => ({
        code: 'PROTECTED_BASELINE_REQUIRES_AUTHORIZATION',
        severity: 'error' as const,
        elementId: id,
        message: `Protected baseline ${id} forbids destructive mutation; clone the baseline or authorize explicitly before deleting ${impact.requestedElementIds.join(', ') || 'none'}`,
      })),
    };
  }
  const removed = new Set(impact.deletedElementIds);
  const authorizedImpact: MutationImpact = { ...impact, blockedBaselineIds: [], severity: impactSeverity(impact, [...authorized]) };
  const next = cloneRepository(repo);

  const forwardOps: Array<import('./patches').PatchOperation> = [];
  const inverseOps: Array<import('./patches').PatchOperation> = [];

  for (const id of impact.deletedElementIds) {
    if (repo.definitions[id]) {
      forwardOps.push({ op: 'remove', collection: 'definitions', id, oldValue: repo.definitions[id] });
      inverseOps.push({ op: 'add', collection: 'definitions', id, value: repo.definitions[id] });
    } else if (repo.usages[id]) {
      forwardOps.push({ op: 'remove', collection: 'usages', id, oldValue: repo.usages[id] });
      inverseOps.push({ op: 'add', collection: 'usages', id, value: repo.usages[id] });
    } else if (repo.connectors[id]) {
      forwardOps.push({ op: 'remove', collection: 'connectors', id, oldValue: repo.connectors[id] });
      inverseOps.push({ op: 'add', collection: 'connectors', id, value: repo.connectors[id] });
    } else if (repo.relationships[id]) {
      forwardOps.push({ op: 'remove', collection: 'relationships', id, oldValue: repo.relationships[id] });
      inverseOps.push({ op: 'add', collection: 'relationships', id, value: repo.relationships[id] });
    } else if (repo.requirements[id]) {
      forwardOps.push({ op: 'remove', collection: 'requirements', id, oldValue: repo.requirements[id] });
      inverseOps.push({ op: 'add', collection: 'requirements', id, value: repo.requirements[id] });
    } else if (repo.verificationCases[id]) {
      forwardOps.push({ op: 'remove', collection: 'verificationCases', id, oldValue: repo.verificationCases[id] });
      inverseOps.push({ op: 'add', collection: 'verificationCases', id, value: repo.verificationCases[id] });
    } else if (repo.evidence[id]) {
      forwardOps.push({ op: 'remove', collection: 'evidence', id, oldValue: repo.evidence[id] });
      inverseOps.push({ op: 'add', collection: 'evidence', id, value: repo.evidence[id] });
    }
  }

  removeFrom(next.definitions, removed);
  removeFrom(next.usages, removed);
  removeFrom(next.connectors, removed);
  removeFrom(next.relationships, removed);
  removeFrom(next.requirements, removed);
  removeFrom(next.verificationCases, removed);
  removeFrom(next.evidence, removed);

  // Evidence-invalidation state: filtering verifiesRequirementIds is part of
  // the atomic deletion, so the inverse patch must restore the exact prior
  // lists (not just re-add removed entities). Record a replace pair per
  // touched verification case to keep undo/redo byte-exact.
  for (const verificationCase of Object.values(repo.verificationCases)) {
    if (removed.has(verificationCase.id)) continue;
    const before = verificationCase.verifiesRequirementIds;
    const after = before.filter(id => !removed.has(id));
    if (after.length === before.length) continue;
    const updated = { ...verificationCase, verifiesRequirementIds: after };
    next.verificationCases[verificationCase.id] = updated;
    forwardOps.push({ op: 'replace', collection: 'verificationCases', id: verificationCase.id, path: ['verifiesRequirementIds'], oldValue: before, value: after });
    inverseOps.push({ op: 'replace', collection: 'verificationCases', id: verificationCase.id, path: ['verifiesRequirementIds'], oldValue: after, value: before });
  }
  next.revision = repo.revision + 1;

  const forwardPatch = {
    id: `patch-${next.revision}-delete`,
    revision: next.revision,
    timestamp: new Date().toISOString(),
    forward: forwardOps,
    inverse: inverseOps,
    description: 'deleteElements',
  };
  const inversePatch = {
    id: `invert-patch-${next.revision}-delete`,
    revision: next.revision,
    timestamp: new Date().toISOString(),
    forward: inverseOps,
    inverse: forwardOps,
    description: 'undo deleteElements',
  };

  return {
    applied: true,
    repository: next,
    impact: authorizedImpact,
    validation: validateSysmlRepository(next),
    forwardPatch,
    inversePatch,
  };
}

export function createHistory(repository: SysmlRepository): MutationHistory {
  return { past: [], present: cloneRepository(repository), future: [] };
}

export function undo(history: MutationHistory): MutationHistory {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return { past: history.past.slice(0, -1), present: cloneRepository(previous), future: [cloneRepository(history.present), ...history.future] };
}

export function redo(history: MutationHistory): MutationHistory {
  if (!history.future.length) return history;
  const next = history.future[0];
  return { past: [...history.past, cloneRepository(history.present)], present: cloneRepository(next), future: history.future.slice(1) };
}

function removeFrom<T>(record: Record<string, T>, removed: ReadonlySet<string>) {
  for (const [key, value] of Object.entries(record)) {
    if (removed.has(key) || removed.has((value as { id?: string }).id ?? '')) delete record[key];
  }
}

function cloneRepository(repo: SysmlRepository): SysmlRepository {
  return {
    ...repo,
    definitions: { ...repo.definitions },
    usages: { ...repo.usages },
    connectors: { ...repo.connectors },
    relationships: { ...repo.relationships },
    requirements: { ...repo.requirements },
    verificationCases: { ...repo.verificationCases },
    evidence: { ...repo.evidence },
    baselines: { ...repo.baselines },
    artifacts: { ...repo.artifacts },
    auditTrail: [...repo.auditTrail],
  };
}
