import { applyCommand, type MutationImpact } from '../engine/sysml/mutations';
import { loadRepository } from '../engine/sysml/persistence';
import type { SysmlRepository } from '../engine/sysml/model';
import { classifyDeletionTarget, type DeletionDecision } from '../engine/sysml/policy';
import { synchronizeEvidenceCurrency } from '../engine/sysml/evidence';
import type { CompactImpactDelta } from '../engine/sysml/workerProtocol';
import type { BlockData, ConnectorData, PartData, RelationshipData } from '../types/sysml_types';

export interface LegacySysmlModel {
  blocks: readonly BlockData[];
  relationships: readonly RelationshipData[];
  parts: readonly PartData[];
  connectors: readonly ConnectorData[];
}

export interface LegacySysmlDeletionResult {
  model: { blocks: BlockData[]; relationships: RelationshipData[]; parts: PartData[]; connectors: ConnectorData[] };
  repository: SysmlRepository;
  impact: MutationImpact;
}

/**
 * Projects a legacy editor model into a canonical repository while honoring
 * the legacy ownership semantics carried by {@link PartData.aggregation}.
 * The canonical projection defaults every usage to composite; an explicit
 * legacy shared/reference marker narrows that projection so the central
 * policy (composite-only cascade, unresolved impacts) sees the same
 * ownership the editor drew. Parts without a marker keep the legacy
 * composite default, preserving existing models byte-for-byte.
 */
function projectLegacyRepository(model: LegacySysmlModel): SysmlRepository {
  const repository = loadRepository({
    blocks: model.blocks,
    relationships: model.relationships,
    parts: model.parts,
    connectors: model.connectors,
  }).repository;
  for (const part of model.parts) {
    const usage = repository.usages[part.id];
    if (usage && usage.kind === 'part' && (part.aggregation === 'shared' || part.aggregation === 'reference')) {
      usage.aggregation = part.aggregation;
    }
  }
  return repository;
}

function isRecordShallowEqual<T extends Record<string, any>>(
  a: Record<string, T>,
  b: Record<string, T>,
): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i];
    const valA = a[key];
    const valB = b[key];
    if (valA === valB) continue;
    if (!valB || typeof valA !== 'object' || typeof valB !== 'object') return false;
    const propKeysA = Object.keys(valA);
    const propKeysB = Object.keys(valB);
    if (propKeysA.length !== propKeysB.length) return false;
    for (let j = 0; j < propKeysA.length; j++) {
      const p = propKeysA[j];
      const pA = valA[p];
      const pB = valB[p];
      if (pA === pB) continue;
      if (Array.isArray(pA) && Array.isArray(pB)) {
        if (pA.length !== pB.length) return false;
        if (JSON.stringify(pA) !== JSON.stringify(pB)) return false;
      } else if (typeof pA === 'object' && pA !== null && typeof pB === 'object' && pB !== null) {
        if (JSON.stringify(pA) !== JSON.stringify(pB)) return false;
      } else {
        return false;
      }
    }
  }
  return true;
}

function isSemanticEqual(
  a: Record<string, Record<string, any>>,
  b: Record<string, Record<string, any>>,
): boolean {
  return (
    isRecordShallowEqual(a.definitions, b.definitions) &&
    isRecordShallowEqual(a.usages, b.usages) &&
    isRecordShallowEqual(a.connectors, b.connectors) &&
    isRecordShallowEqual(a.relationships, b.relationships) &&
    isRecordShallowEqual(a.requirements, b.requirements) &&
    isRecordShallowEqual(a.verificationCases, b.verificationCases)
  );
}

export function mergeLegacyDiagramIntoRepository(repository: SysmlRepository, model: LegacySysmlModel): SysmlRepository {
  const projected = loadRepository({ blocks: model.blocks, relationships: model.relationships, parts: model.parts, connectors: model.connectors }).repository;
  const mergeRecords = <T extends { id: string }>(current: Record<string, T>, incoming: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(incoming).map(([id, value]) => [id, { ...current[id], ...value }]));
  const retainedCanonicalRelationships = Object.fromEntries(Object.entries(repository.relationships).filter(([, relationship]) =>
    (repository.artifacts[relationship.sourceId] || repository.artifacts[relationship.targetId])
    && !projected.relationships[relationship.id]
  ));
  const semantic = {
    definitions: mergeRecords(repository.definitions, projected.definitions),
    usages: mergeRecords(repository.usages, projected.usages),
    connectors: projected.connectors,
    relationships: { ...retainedCanonicalRelationships, ...mergeRecords(repository.relationships, projected.relationships) },
    requirements: mergeRecords(repository.requirements, projected.requirements),
    verificationCases: mergeRecords(repository.verificationCases, projected.verificationCases),
  };
  const currentSemantic = {
    definitions: repository.definitions,
    usages: repository.usages,
    connectors: repository.connectors,
    relationships: repository.relationships,
    requirements: repository.requirements,
    verificationCases: repository.verificationCases,
  };
  if (isSemanticEqual(semantic, currentSemantic)) return repository;
  const next: SysmlRepository = { ...structuredClone(repository), ...semantic, revision: repository.revision + 1 };
  next.auditTrail.push({
    id: `change-${next.revision}-legacy-editor-sync`, revision: next.revision, timestamp: new Date().toISOString(),
    command: 'synchronizeNativeSysmlEditor', elementIds: [...Object.keys(projected.definitions), ...Object.keys(projected.usages), ...Object.keys(projected.relationships), ...Object.keys(projected.connectors), ...Object.keys(projected.requirements)],
  });
  return synchronizeEvidenceCurrency(next);
}

export function requiresDeletionConfirmation(impact: MutationImpact): boolean {
  const requested = new Set(impact.requestedElementIds);
  return impact.deletedElementIds.some(id => !requested.has(id))
    || impact.nestedRequirementIds.length > 0
    || impact.removedRelationshipIds.some(id => !requested.has(id))
    || impact.unresolvedUsageIds.length > 0
    || impact.invalidatedEvidenceIds.length > 0
    || impact.affectedRequirementIds.length > 0
    || impact.affectedBaselineIds.length > 0;
}

export function formatLegacyDeletionImpact(impact: MutationImpact): string {
  const requested = new Set(impact.requestedElementIds);
  const cascade = impact.deletedElementIds.filter(id => !requested.has(id));
  const lines = [
    'SysML deletion impact',
    `Requested: ${impact.requestedElementIds.join(', ') || 'none'}`,
    `Cascade deleted: ${cascade.join(', ') || 'none'}`,
    `Nested requirements: ${impact.nestedRequirementIds.join(', ') || 'none'}`,
    `Removed relationships: ${impact.removedRelationshipIds.join(', ') || 'none'}`,
    `Affected diagrams: ${impact.affectedDiagramKinds.join(', ') || 'none'}`,
    `Affected requirements: ${impact.affectedRequirementIds.join(', ') || 'none'}`,
    `Typed usages left unresolved: ${impact.unresolvedUsageIds.join(', ') || 'none'}`,
    `Invalidated evidence: ${impact.invalidatedEvidenceIds.join(', ') || 'none'}`,
    `Protected baselines retained: ${impact.affectedBaselineIds.join(', ') || 'none'}`,
    '',
    'Continue with this atomic deletion?',
  ];
  return lines.join('\n');
}

export function applyLegacySysmlDeletion(model: LegacySysmlModel, elementIds: readonly string[]): LegacySysmlDeletionResult {
  const repository = projectLegacyRepository(model);
  const requested = [...new Set(elementIds)];
  // Legacy BDD editor semantics (adapter-owned): deleting a block definition
  // deletes its composite-owned typed usages with it — they are drawn as
  // owned parts of the definition's whole. Shared/reference usages are never
  // implicit children; the canonical policy below reports them as unresolved
  // impacts. The expansion only adds explicit targets; the closure itself is
  // still driven by analyzeMutation through the central policy.
  const deletedDefinitions = new Set(requested.filter(id => repository.definitions[id]));
  const expanded = [...requested];
  if (deletedDefinitions.size > 0) {
    for (const [usageId, usage] of Object.entries(repository.usages)) {
      if (usage.kind === 'part' && usage.aggregation === 'composite' && deletedDefinitions.has(usage.typeId) && !expanded.includes(usageId)) {
        expanded.push(usageId);
      }
    }
  }
  // Policy boundary: classify every requested target through the central
  // deletion policy before running the atomic transaction, so unresolved
  // (non-composite) impacts are explicit even when the closure itself is
  // driven by analyzeMutation.
  const policyUnresolved = new Set<string>();
  for (const id of new Set(expanded)) {
    for (const unresolvedId of classifyDeletionTarget(repository, id).unresolvedUsageIds) {
      policyUnresolved.add(unresolvedId);
    }
  }
  const transaction = applyCommand(repository, { kind: 'deleteElements', elementIds: expanded });
  const deleted = new Set(transaction.impact.deletedElementIds);

  // Legacy connectors are projected incompletely because their ports are
  // definition-relative. They still participate in the same atomic deletion
  // closure using their stable endpoint IDs.
  for (const connector of model.connectors) {
    if (deleted.has(connector.id) || deleted.has(connector.sourcePartId) || deleted.has(connector.targetPartId) || deleted.has(connector.sourcePortId) || deleted.has(connector.targetPortId)) {
      deleted.add(connector.id);
    }
  }
  for (const relationship of model.relationships) {
    if (deleted.has(relationship.id) || deleted.has(relationship.sourceId) || deleted.has(relationship.targetId)) deleted.add(relationship.id);
  }

  const next = {
    blocks: model.blocks
      .filter(block => !deleted.has(block.id))
      .map(block => ({
        ...block,
        ports: block.ports.filter(port => !deleted.has(port.id)),
        satisfiedReqIds: block.satisfiedReqIds?.filter(id => !deleted.has(id)),
      })),
    parts: model.parts
      .filter(part => !deleted.has(part.id))
      .map(part => ({ ...part, satisfiedReqIds: part.satisfiedReqIds?.filter(id => !deleted.has(id)) })),
    relationships: model.relationships.filter(relationship => !deleted.has(relationship.id) && !deleted.has(relationship.sourceId) && !deleted.has(relationship.targetId)),
    connectors: model.connectors.filter(connector => !deleted.has(connector.id) && !deleted.has(connector.sourcePartId) && !deleted.has(connector.targetPartId) && !deleted.has(connector.sourcePortId) && !deleted.has(connector.targetPortId)),
  };
  const impact: MutationImpact = {
    ...transaction.impact,
    requestedElementIds: [...requested].sort(),
    deletedElementIds: [...deleted].sort(),
    removedRelationshipIds: [...new Set([
      ...transaction.impact.removedRelationshipIds,
      ...model.relationships.filter(r => deleted.has(r.id) || deleted.has(r.sourceId) || deleted.has(r.targetId)).map(r => r.id),
    ])].sort(),
    unresolvedUsageIds: [...new Set([
      ...transaction.impact.unresolvedUsageIds,
      ...[...policyUnresolved].filter(id => !deleted.has(id)),
    ])].sort(),
    affectedDiagramKinds: [...new Set([
      ...transaction.impact.affectedDiagramKinds,
      ...(model.connectors.some(connector => deleted.has(connector.id)) ? ['ibd' as const] : []),
    ])].sort(),
  };
  return { model: next, repository: transaction.repository, impact };
}

/**
 * Classifies a legacy-model deletion target through the central typed
 * deletion policy (composite-only cascade, unresolved impacts).
 */
export function classifyLegacyDeletionTarget(model: LegacySysmlModel, elementId: string): DeletionDecision {
  return classifyDeletionTarget(projectLegacyRepository(model), elementId);
}

/**
 * Projects a mutation impact to a compact delta (ID lists + summary counts)
 * without embedding the repository.
 */
export function toCompactImpactDelta(impact: MutationImpact): CompactImpactDelta {
  return {
    requestedElementIds: [...impact.requestedElementIds],
    deletedElementIds: [...impact.deletedElementIds],
    impactSummary: {
      nestedRequirements: impact.nestedRequirementIds.length,
      removedRelationships: impact.removedRelationshipIds.length,
      unresolvedUsages: impact.unresolvedUsageIds.length,
      invalidatedEvidence: impact.invalidatedEvidenceIds.length,
    },
    impact,
  };
}
