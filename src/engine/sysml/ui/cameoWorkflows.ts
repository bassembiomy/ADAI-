import type { DiagramPresentation, SemanticElement } from '../domain';
import type { TransactionManager } from '../commands/dispatcher';
import { resolveType } from '../services/typeResolution';
import { isTypeNotFound, type CreateNewTypeAction, type TypeCandidate } from '../commands/commandResult';

export interface DragDropOptions {
  elementId: string;
  diagramId: string;
  dropCoordinates: { x: number; y: number };
  width?: number;
  height?: number;
}

export function handleBrowserDragDropToDiagram(
  mgr: TransactionManager,
  options: DragDropOptions
): { success: boolean; presentationId?: string; error?: string } {
  const repo = mgr.getState();
  const element = repo.elements[options.elementId];
  if (!element) {
    return { success: false, error: `Element ${options.elementId} not found` };
  }

  const presentationId = `pres-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const presentation: DiagramPresentation = {
    id: presentationId,
    diagramId: options.diagramId,
    semanticElementId: options.elementId,
    bounds: {
      x: options.dropCoordinates.x,
      y: options.dropCoordinates.y,
      width: options.width ?? 160,
      height: options.height ?? 100,
    },
  };

  const res = mgr.dispatch(
    { type: 'DisplayExistingElement', presentation },
    { source: 'ui', actor: 'cameoWorkflow' }
  );

  return {
    success: res.success,
    presentationId: res.success ? presentationId : undefined,
    error: res.message,
  };
}

export interface RemoveOrDeleteOptions {
  action: 'removeFromDiagram' | 'previewDeleteImpact' | 'deleteFromModel';
  elementId: string;
  presentationId?: string;
}

export interface RemoveOrDeleteResult {
  success: boolean;
  impact?: {
    affectedPresentations: string[];
    affectedRelationships: string[];
  };
  error?: string;
}

export function handleRemoveFromDiagramVsDeleteFromModel(
  mgr: TransactionManager,
  options: RemoveOrDeleteOptions
): RemoveOrDeleteResult {
  const repo = mgr.getState();

  if (options.action === 'removeFromDiagram') {
    if (!options.presentationId) {
      return { success: false, error: 'presentationId required for removeFromDiagram' };
    }
    const res = mgr.dispatch(
      { type: 'RemovePresentation', presentationId: options.presentationId },
      { source: 'ui', actor: 'cameoWorkflow' }
    );
    return { success: res.success, error: res.message };
  }

  if (options.action === 'previewDeleteImpact') {
    const affectedPresentations = Object.values(repo.presentations)
      .filter((p) => p.semanticElementId === options.elementId)
      .map((p) => p.id);
    const affectedRelationships = Object.values(repo.relationships)
      .filter((r) => r.sourceId === options.elementId || r.targetId === options.elementId)
      .map((r) => r.id);

    return {
      success: true,
      impact: {
        affectedPresentations,
        affectedRelationships,
      },
    };
  }

  if (options.action === 'deleteFromModel') {
    const res = mgr.dispatch(
      { type: 'DeleteElement', elementId: options.elementId },
      { source: 'ui', actor: 'cameoWorkflow' }
    );
    return { success: res.success, error: res.message };
  }

  return { success: false, error: 'Unknown action' };
}

export interface TypeSelectionChoice {
  action: 'useExisting' | 'createNew';
  metaclass?: 'Block' | 'ValueType' | 'InterfaceBlock';
}

export interface TypeSelectionResult {
  status: 'RESOLVED' | 'TYPE_NOT_FOUND' | 'CREATED';
  typeId?: string;
  candidates: TypeCandidate[];
  createNewTypeAction?: CreateNewTypeAction;
}

export function handleTypeSelectionWorkflow(
  mgr: TransactionManager,
  input: string,
  choice?: TypeSelectionChoice
): TypeSelectionResult {
  const repo = mgr.getState();

  if (choice?.action === 'useExisting') {
    return {
      status: 'RESOLVED',
      typeId: input,
      candidates: [],
    };
  }

  if (choice?.action === 'createNew') {
    const newId = `blk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newElement: SemanticElement = {
      id: newId,
      name: input,
      metaclass: choice.metaclass ?? 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };
    mgr.dispatch(
      { type: 'CreateElement', element: newElement },
      { source: 'ui', actor: 'cameoWorkflow' }
    );
    return {
      status: 'CREATED',
      typeId: newId,
      candidates: [],
    };
  }

  // Resolve type: resolveType(query, repo)
  const outcome = resolveType(input, repo);
  if (isTypeNotFound(outcome)) {
    return {
      status: 'TYPE_NOT_FOUND',
      candidates: outcome.candidates,
      createNewTypeAction: outcome.action,
    };
  }

  return {
    status: 'RESOLVED',
    typeId: outcome.element.id,
    candidates: [],
  };
}
