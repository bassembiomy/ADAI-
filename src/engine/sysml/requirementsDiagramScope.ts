import type { BlockData, RelationshipData } from '../../types/sysml_types';

export const REQUIREMENT_DIAGRAM_RELATIONSHIP_TYPES: ReadonlySet<RelationshipData['type']> = new Set([
  'satisfy',
  'verify',
  'refine',
  'trace',
  'derive',
  'deriveReqt',
  'copy',
  'requirementContainment',
]);

export interface RequirementsDiagramScope {
  visibleBlockIds: Set<string>;
  visibleRelationshipIds: Set<string>;
}

export function getRequirementsDiagramScope(
  blocks: readonly BlockData[],
  relationships: readonly RelationshipData[],
  currentLayerId?: string,
  presentedElementIds?: ReadonlySet<string>,
): RequirementsDiagramScope {
  const selectedLayerId = currentLayerId ?? 'root';
  const blocksById = new Map(blocks.map(block => [block.id, block]));
  const visibleBlockIds = new Set(
    blocks
      .filter(block => block.stereotype === 'requirement' && layerIdOf(block) === selectedLayerId)
      .map(block => block.id),
  );

  // A Requirements Diagram may explicitly present a Block/TestCase before it
  // participates in satisfy/verify/refine/trace. This is how Cameo treats a
  // newly created diagram element: presentation is separate from semantics.
  for (const block of blocks) {
    if (presentedElementIds?.has(block.id) && layerIdOf(block) === selectedLayerId) {
      visibleBlockIds.add(block.id);
    }
  }

  for (const relationship of relationships) {
    const source = blocksById.get(relationship.sourceId);
    const target = blocksById.get(relationship.targetId);
    if (!source || !target || layerIdOf(source) !== selectedLayerId || layerIdOf(target) !== selectedLayerId) continue;

    const isRelAllowed =
      REQUIREMENT_DIAGRAM_RELATIONSHIP_TYPES.has(relationship.type) ||
      (relationship.type === 'composition' && source.stereotype === 'requirement' && target.stereotype === 'requirement');
    if (!isRelAllowed) continue;

    if (source.stereotype === 'requirement' && visibleBlockIds.has(source.id) && target.stereotype !== 'requirement') {
      visibleBlockIds.add(target.id);
    }
    if (target.stereotype === 'requirement' && visibleBlockIds.has(target.id) && source.stereotype !== 'requirement') {
      visibleBlockIds.add(source.id);
    }
  }

  const visibleRelationshipIds = new Set(
    relationships
      .filter(relationship => {
        const source = blocksById.get(relationship.sourceId);
        const target = blocksById.get(relationship.targetId);
        const isRelAllowed =
          REQUIREMENT_DIAGRAM_RELATIONSHIP_TYPES.has(relationship.type) ||
          (relationship.type === 'composition' && source?.stereotype === 'requirement' && target?.stereotype === 'requirement');

        return (
          isRelAllowed &&
          visibleBlockIds.has(relationship.sourceId) &&
          visibleBlockIds.has(relationship.targetId) &&
          (source?.stereotype === 'requirement' || target?.stereotype === 'requirement')
        );
      })
      .map(relationship => relationship.id),
  );

  return { visibleBlockIds, visibleRelationshipIds };
}

function layerIdOf(block: BlockData): string {
  return block.layerId ?? 'root';
}
