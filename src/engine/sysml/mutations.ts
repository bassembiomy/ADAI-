import type { SysmlRepository } from './model';
import { classifyDeletionTarget } from './policy';
import { getNestedRequirementIds } from './requirements';
import { validateSysmlRepository, type SysmlValidationReport } from './validation';

export type SysmlCommand = { kind: 'deleteElements'; elementIds: string[] };

export interface MutationImpact {
  requestedElementIds: string[];
  deletedElementIds: string[];
  nestedRequirementIds: string[];
  removedRelationshipIds: string[];
  unresolvedUsageIds: string[];
  invalidatedEvidenceIds: string[];
  affectedRequirementIds: string[];
  affectedBaselineIds: string[];
  affectedDiagramKinds: Array<'bdd' | 'ibd' | 'requirements' | 'rtm'>;
}

export interface MutationResult {
  applied: boolean;
  repository: SysmlRepository;
  impact: MutationImpact;
  validation: SysmlValidationReport;
  forwardPatch?: import('./patches').SysmlPatch;
  inversePatch?: import('./patches').SysmlPatch;
}

export interface MutationHistory {
  past: SysmlRepository[];
  present: SysmlRepository;
  future: SysmlRepository[];
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

  return {
    requestedElementIds: [...requested].sort(),
    deletedElementIds: [...deleted].sort(),
    nestedRequirementIds: [...nestedRequirementIdsSet].sort(),
    removedRelationshipIds: [...removedRelationshipIdsSet].sort(),
    unresolvedUsageIds,
    invalidatedEvidenceIds: invalidatedEvidence.sort(),
    affectedRequirementIds: [...affectedRequirements].sort(),
    affectedBaselineIds: Object.values(repo.baselines).filter(b => b.protected).map(b => b.id).sort(),
    affectedDiagramKinds: [...diagramKinds].sort(),
  };
}

export function applyCommand(repo: SysmlRepository, command: SysmlCommand): MutationResult {
  const impact = analyzeMutation(repo, command);
  const removed = new Set(impact.deletedElementIds);
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

  for (const verificationCase of Object.values(next.verificationCases)) {
    verificationCase.verifiesRequirementIds = verificationCase.verifiesRequirementIds.filter(id => !removed.has(id));
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
    impact,
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
