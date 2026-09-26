import type { Bounds, DiagramPresentation } from '../domain/presentations';
import type { SemanticElement } from '../domain/base';
import type { SysmlRepositoryV4 } from '../domain';
import type { DiagramPresentationInput, PresentationCoordinates } from '../presentationState';

export interface DisplayExistingElementCommand {
  type: 'DisplayExistingElement';
  id?: string;
  diagramId: string;
  semanticElementId: string;
  bounds?: Partial<Bounds>;
  visibleCompartments?: string[];
  style?: Record<string, string | number>;
  zIndex?: number;
}

export interface RemovePresentationCommand {
  type: 'RemovePresentation';
  presentationId: string;
}

export interface MovePresentationCommand {
  type: 'MovePresentation';
  presentationId: string;
  x: number;
  y: number;
}

export interface ResizePresentationCommand {
  type: 'ResizePresentation';
  presentationId: string;
  width: number;
  height: number;
}

export interface DeleteModelElementCommand {
  type: 'DeleteModelElement';
  semanticElementId: string;
}

export interface DeleteModelElementResult {
  deletedElement: SemanticElement;
  removedPresentations: DiagramPresentation[];
  affectedRelationships: string[];
}

export function executeDisplayExistingElement(
  repo: SysmlRepositoryV4,
  cmd: DisplayExistingElementCommand
): DiagramPresentation {
  const element = repo.elements[cmd.semanticElementId];
  if (!element) {
    throw new Error(`Semantic element not found: ${cmd.semanticElementId}`);
  }
  const diagram = repo.diagrams[cmd.diagramId];
  if (!diagram) {
    throw new Error(`Diagram not found: ${cmd.diagramId}`);
  }

  // Check if this element is already presented on this diagram
  const existingPresId = (repo.indexes.byDiagram[cmd.diagramId] ?? []).find(
    id => repo.presentations[id]?.semanticElementId === cmd.semanticElementId
  );
  if (existingPresId && repo.presentations[existingPresId]) {
    return repo.presentations[existingPresId];
  }

  const id = cmd.id ?? `pres_${cmd.diagramId}_${cmd.semanticElementId}`;
  const presentation: DiagramPresentation = {
    id,
    diagramId: cmd.diagramId,
    semanticElementId: cmd.semanticElementId,
    bounds: {
      x: cmd.bounds?.x ?? 0,
      y: cmd.bounds?.y ?? 0,
      width: cmd.bounds?.width ?? 160,
      height: cmd.bounds?.height ?? 100,
    },
    zIndex: cmd.zIndex,
    style: cmd.style,
    visibleCompartments: cmd.visibleCompartments,
  };

  repo.presentations[id] = presentation;

  if (!repo.indexes.byDiagram[cmd.diagramId]) {
    repo.indexes.byDiagram[cmd.diagramId] = [];
  }
  if (!repo.indexes.byDiagram[cmd.diagramId].includes(id)) {
    repo.indexes.byDiagram[cmd.diagramId].push(id);
  }

  if (!diagram.presentationIds.includes(id)) {
    diagram.presentationIds.push(id);
  }

  return presentation;
}

export function executeRemovePresentation(
  repo: SysmlRepositoryV4,
  cmd: RemovePresentationCommand
): { removedPresentation: DiagramPresentation } {
  const presentation = repo.presentations[cmd.presentationId];
  if (!presentation) {
    throw new Error(`Presentation not found: ${cmd.presentationId}`);
  }

  delete repo.presentations[cmd.presentationId];

  // Remove from diagram index
  const diagIndex = repo.indexes.byDiagram[presentation.diagramId];
  if (diagIndex) {
    repo.indexes.byDiagram[presentation.diagramId] = diagIndex.filter(id => id !== cmd.presentationId);
  }

  // Remove from diagram entity
  const diagram = repo.diagrams[presentation.diagramId];
  if (diagram) {
    diagram.presentationIds = diagram.presentationIds.filter(id => id !== cmd.presentationId);
  }

  return { removedPresentation: presentation };
}

export function executeMovePresentation(
  repo: SysmlRepositoryV4,
  cmd: MovePresentationCommand
): DiagramPresentation {
  const presentation = repo.presentations[cmd.presentationId];
  if (!presentation) {
    throw new Error(`Presentation not found: ${cmd.presentationId}`);
  }
  presentation.bounds.x = cmd.x;
  presentation.bounds.y = cmd.y;
  return presentation;
}

export function executeResizePresentation(
  repo: SysmlRepositoryV4,
  cmd: ResizePresentationCommand
): DiagramPresentation {
  const presentation = repo.presentations[cmd.presentationId];
  if (!presentation) {
    throw new Error(`Presentation not found: ${cmd.presentationId}`);
  }
  presentation.bounds.width = cmd.width;
  presentation.bounds.height = cmd.height;
  return presentation;
}

export function executeDeleteModelElement(
  repo: SysmlRepositoryV4,
  cmd: DeleteModelElementCommand
): DeleteModelElementResult {
  const element = repo.elements[cmd.semanticElementId];
  if (!element) {
    throw new Error(`Semantic element not found: ${cmd.semanticElementId}`);
  }

  delete repo.elements[cmd.semanticElementId];

  // Remove all presentations across all diagrams
  const presentationsToRemove = Object.values(repo.presentations).filter(
    p => p.semanticElementId === cmd.semanticElementId
  );

  for (const pres of presentationsToRemove) {
    delete repo.presentations[pres.id];
    const diagIndex = repo.indexes.byDiagram[pres.diagramId];
    if (diagIndex) {
      repo.indexes.byDiagram[pres.diagramId] = diagIndex.filter(id => id !== pres.id);
    }
    const diagram = repo.diagrams[pres.diagramId];
    if (diagram) {
      diagram.presentationIds = diagram.presentationIds.filter(id => id !== pres.id);
    }
  }

  // Identify affected relationships
  const affectedRelIds: string[] = [];
  for (const [relId, rel] of Object.entries(repo.relationships)) {
    if (rel.sourceId === cmd.semanticElementId || rel.targetId === cmd.semanticElementId) {
      affectedRelIds.push(relId);
      delete repo.relationships[relId];
    }
  }

  // Cleanup indexes
  if (element.ownerId && repo.indexes.byOwner[element.ownerId]) {
    repo.indexes.byOwner[element.ownerId] = repo.indexes.byOwner[element.ownerId].filter(
      id => id !== cmd.semanticElementId
    );
  }
  if (repo.indexes.byType[element.metaclass]) {
    repo.indexes.byType[element.metaclass] = repo.indexes.byType[element.metaclass].filter(
      id => id !== cmd.semanticElementId
    );
  }

  return {
    deletedElement: element,
    removedPresentations: presentationsToRemove,
    affectedRelationships: affectedRelIds,
  };
}

/**
 * Deterministically migrates legacy v3 coordinates map and diagramPresentations
 * side-car into typed v4 DiagramPresentation entities.
 */
export function migrateV3PresentationsToV4(
  coordinates: Record<string, PresentationCoordinates> = {},
  diagramPresentations: Record<string, DiagramPresentationInput> = {}
): DiagramPresentation[] {
  const results: DiagramPresentation[] = [];

  for (const [diagramId, presData] of Object.entries(diagramPresentations)) {
    for (const elementId of presData.elementIds) {
      const coords = coordinates[elementId] ?? {};
      results.push({
        id: `pres_${diagramId}_${elementId}`,
        diagramId,
        semanticElementId: elementId,
        bounds: {
          x: coords.x ?? 0,
          y: coords.y ?? 0,
          width: coords.width ?? 160,
          height: coords.height ?? 100,
        },
      });
    }
  }

  return results;
}
