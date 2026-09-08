import { applyCommand, type MutationImpact } from '../engine/sysml/mutations';
import { loadRepository } from '../engine/sysml/persistence';
import type { SysmlRepository } from '../engine/sysml/model';
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

export function requiresDeletionConfirmation(impact: MutationImpact): boolean {
  const requested = new Set(impact.requestedElementIds);
  return impact.deletedElementIds.some(id => !requested.has(id))
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
  const repository = loadRepository({
    blocks: model.blocks,
    relationships: model.relationships,
    parts: model.parts,
    connectors: model.connectors,
  }).repository;
  const transaction = applyCommand(repository, { kind: 'deleteElements', elementIds: [...new Set(elementIds)] });
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
    deletedElementIds: [...deleted].sort(),
    affectedDiagramKinds: [...new Set([
      ...transaction.impact.affectedDiagramKinds,
      ...(model.connectors.some(connector => deleted.has(connector.id)) ? ['ibd' as const] : []),
    ])].sort(),
  };
  return { model: next, repository: transaction.repository, impact };
}
