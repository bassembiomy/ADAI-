import type { SysmlRepository } from './model';
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

  // A composite usage is lifetime-owned by its owner. Shared and reference usages
  // intentionally do not join this closure.
  let changed = true;
  while (changed) {
    changed = false;
    for (const usage of Object.values(repo.usages)) {
      if (usage.kind === 'part' && usage.aggregation === 'composite' && deleted.has(usage.ownerId) && !deleted.has(usage.id)) {
        deleted.add(usage.id);
        changed = true;
      }
      if (usage.kind === 'port' && deleted.has(usage.ownerId) && !deleted.has(usage.id)) {
        deleted.add(usage.id);
        changed = true;
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
  const unresolvedUsageIds = Object.values(repo.usages)
    .filter(u => u.kind === 'part' && deletedDefinitions.has(u.typeId) && !deleted.has(u.id))
    .map(u => u.id).sort();

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
  return { applied: true, repository: next, impact, validation: validateSysmlRepository(next) };
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
  return structuredClone(repo);
}
