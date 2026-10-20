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
  presentedElementIds?: ReadonlySet<string> | readonly string[],
): RequirementsDiagramScope {
  const selectedLayerId = currentLayerId ?? 'root';
  // A diagram with a presented set shows exactly that set; without one it falls back to the layer's requirements.
  const presented = new Set(presentedElementIds ?? []);
  const presentedSet = presented.size > 0 ? presented : null;
  const blocksById = new Map(blocks.map(block => [block.id, block]));
  const visibleBlockIds = new Set(
    blocks
      .filter(block => {
        if (presentedSet) return presentedSet.has(block.id);
        return block.stereotype === 'requirement' && layerIdOf(block) === selectedLayerId;
      })
      .map(block => block.id),
  );

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

export interface DiagramBlockDoubleClickAction {
  action: 'none' | 'enterBlock';
  targetId?: string;
}

/**
 * Resolves the double-click action for a Block or element on the canvas.
 * On Requirement diagrams, double-clicking a Requirement, Block or TestCase does NOT drill down or mutate:
 * nested requirements are drawn on the same diagram with containment lines, so there is no layer to enter.
 * Explicit actions (e.g. Open in BDD, Open IBD) must be used instead, matching Cameo behavior.
 */
export function resolveBlockDoubleClickAction(
  diagramMode: string,
  block: { id: string; stereotype: string },
): DiagramBlockDoubleClickAction {
  if (diagramMode === 'requirements') return { action: 'none' };
  return { action: 'enterBlock', targetId: block.id };
}

export interface ExplicitNavigationTarget {
  targetMode: 'bdd' | 'ibd';
  targetLayerId: string;
}

/**
 * Resolves explicit diagram navigation actions (e.g. "Open in BDD", "Open IBD") without side effects.
 */
export function resolveExplicitBlockNavigation(
  target: 'bdd' | 'ibd',
  blockId: string,
): ExplicitNavigationTarget {
  return {
    targetMode: target,
    targetLayerId: target === 'ibd' ? blockId : 'root',
  };
}
