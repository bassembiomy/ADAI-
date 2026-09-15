import type {
  SysmlRepository,
} from '../../engine/sysml/model';
import type {
  PresentationCoordinates,
  SysmlEditorCommand,
} from '../../services/sysmlCommandGateway';
import type {
  UseCaseNode,
  UseCaseRelationshipType,
} from '../../types/usecase_types';

export interface UseCaseProjectionOptions {
  coordinates?: Record<string, PresentationCoordinates>;
  diagramPresentations?: Record<string, { elementIds: string[] }>;
  activeDiagramId?: string;
  onEdgeTypeChange?: (edgeId: string, newType: UseCaseRelationshipType) => void;
  onEdgeDelete?: (edgeId: string) => void;
}

export interface UseCaseProjectionResult {
  nodes: UseCaseNode[];
  edges: any[];
}

function mapRelationshipKindToEdgeType(kind: string): UseCaseRelationshipType {
  switch (kind) {
    case 'useCaseAssociation':
      return 'association';
    case 'useCaseGeneralization':
      return 'generalization';
    case 'include':
      return 'include';
    case 'extend':
      return 'extend';
    case 'useCaseSatisfy':
      return 'satisfy';
    case 'verify':
      return 'verify';
    case 'useCaseRefine':
      return 'refine';
    case 'useCaseTrace':
      return 'trace';
    default:
      return (kind as UseCaseRelationshipType) || 'association';
  }
}

export function projectUseCaseDiagram(
  repo: SysmlRepository,
  options: UseCaseProjectionOptions = {}
): UseCaseProjectionResult {
  const coordinates = options.coordinates || {};
  const activeDiagramId = options.activeDiagramId;
  const diagramPresentations = options.diagramPresentations || {};

  const visibleFilter =
    activeDiagramId && diagramPresentations[activeDiagramId]
      ? new Set(diagramPresentations[activeDiagramId].elementIds)
      : null;

  const isVisible = (id: string) => visibleFilter === null || visibleFilter.has(id);

  const nodes: UseCaseNode[] = [];

  // 1. Project Actors
  for (const actor of Object.values(repo.actors || {})) {
    if (!isVisible(actor.id)) continue;
    const coords = coordinates[actor.id] || {};
    nodes.push({
      id: actor.id,
      type: 'actor',
      position: {
        x: coords.x ?? 100,
        y: coords.y ?? 100,
      },
      width: coords.width,
      height: coords.height,
      data: {
        label: actor.name || 'Actor',
        isExternal: actor.isExternal,
        canonicalElementId: actor.id,
      },
    });
  }

  // 2. Project Subjects (Boundaries)
  for (const subject of Object.values(repo.subjects || {})) {
    if (!isVisible(subject.id)) continue;
    const coords = coordinates[subject.id] || {};
    nodes.push({
      id: subject.id,
      type: 'systemBoundary',
      position: {
        x: coords.x ?? 250,
        y: coords.y ?? 50,
      },
      width: coords.width ?? 400,
      height: coords.height ?? 350,
      data: {
        label: subject.name || 'Subject Boundary',
        subjectBlockId: subject.representedBlockId,
        canonicalElementId: subject.id,
      },
    });
  }

  // 3. Project Use Cases
  for (const uc of Object.values(repo.useCases || {})) {
    if (!isVisible(uc.id)) continue;
    const coords = coordinates[uc.id] || {};

    // Collect extension point names
    const extensionPointNames = (uc.extensionPointIds || [])
      .map(epId => repo.extensionPoints?.[epId]?.name)
      .filter((name): name is string => typeof name === 'string');

    nodes.push({
      id: uc.id,
      type: 'useCase',
      position: {
        x: coords.x ?? 300,
        y: coords.y ?? 150,
      },
      width: coords.width,
      height: coords.height,
      data: {
        label: uc.name || 'Use Case',
        subjectBlockId: uc.subjectId,
        extensionPoints: extensionPointNames,
        canonicalElementId: uc.id,
      },
    });
  }

  const visibleNodeIds = new Set(nodes.map(n => n.id));

  // 4. Project Relationships into Edges
  const edges: any[] = [];
  for (const rel of Object.values(repo.relationships || {})) {
    // Only use-case relationships
    const isUseCaseRel = [
      'useCaseAssociation',
      'include',
      'extend',
      'useCaseGeneralization',
      'useCaseSatisfy',
      'useCaseRefine',
      'useCaseTrace',
      'association',
      'generalization',
      'refine',
      'satisfy',
      'trace',
    ].includes(rel.kind);

    if (!isUseCaseRel) continue;

    if (!visibleNodeIds.has(rel.sourceId) || !visibleNodeIds.has(rel.targetId)) {
      continue;
    }

    const edgeType = mapRelationshipKindToEdgeType(rel.kind);
    edges.push({
      id: rel.id,
      source: rel.sourceId,
      target: rel.targetId,
      type: 'useCaseEdge',
      data: {
        type: edgeType,
        onTypeChange: options.onEdgeTypeChange,
        onDelete: options.onEdgeDelete,
      },
    });
  }

  return { nodes, edges };
}

export function buildPresentationPatch(
  elementId: string,
  presentation: PresentationCoordinates
): Extract<SysmlEditorCommand, { type: 'updatePresentation' }> {
  return {
    type: 'updatePresentation',
    elementId,
    presentation,
  };
}
