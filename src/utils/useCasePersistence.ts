import type { UseCaseDiagram, UseCaseNode, UseCaseNodeType, UseCaseRelationship, UseCaseRelationshipType } from '../types/usecase_types';

export function createDefaultUseCaseDiagram(id = 'default_usecase', name = 'Main SysML Use Cases'): UseCaseDiagram {
  return {
    id,
    name,
    nodes: [],
    edges: [],
  };
}

export function toUseCaseRelationships(rawEdges: any[]): UseCaseRelationship[] {
  if (!Array.isArray(rawEdges)) return [];
  return rawEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: (e.data?.type || (['association', 'include', 'extend', 'generalization', 'refine', 'satisfy', 'trace'].includes(e.type) ? e.type : 'association')) as UseCaseRelationshipType,
    label: e.label || e.data?.label || '',
    selected: Boolean(e.selected),
  }));
}

export function serializeUseCaseDiagram(
  baseDiagram: UseCaseDiagram,
  nodes: UseCaseNode[],
  rawEdges: any[]
): UseCaseDiagram {
  const safeNodes: UseCaseNode[] = (nodes || []).map((n) => ({
    id: n.id,
    type: n.type as UseCaseNodeType,
    position: {
      x: typeof n.position?.x === 'number' ? n.position.x : 0,
      y: typeof n.position?.y === 'number' ? n.position.y : 0,
    },
    data: {
      label: n.data?.label || 'Unnamed',
      description: n.data?.description || '',
      isExternal: n.data?.isExternal,
      subjectBlockId: n.data?.subjectBlockId,
      elaboratingDiagramId: n.data?.elaboratingDiagramId,
      requirementTraces: n.data?.requirementTraces || [],
      extensionPoints: n.data?.extensionPoints || [],
      canonicalElementId: n.data?.canonicalElementId,
    },
    width: n.width,
    height: n.height,
    parentId: n.parentId,
    selected: Boolean(n.selected),
  }));

  const nodeIds = new Set(safeNodes.map((n) => n.id));
  // Filter out edges whose source or target no longer exists
  const relationships = toUseCaseRelationships(rawEdges).filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  return {
    id: baseDiagram?.id || 'default_usecase',
    name: baseDiagram?.name || 'Main SysML Use Cases',
    nodes: safeNodes,
    edges: relationships,
  };
}

export function updateDiagramInList(
  diagramList: UseCaseDiagram[],
  updatedDiagram: UseCaseDiagram
): UseCaseDiagram[] {
  if (!diagramList || diagramList.length === 0) {
    return [updatedDiagram];
  }
  const index = diagramList.findIndex((d) => d.id === updatedDiagram.id);
  if (index >= 0) {
    const next = [...diagramList];
    next[index] = updatedDiagram;
    return next;
  }
  return [...diagramList, updatedDiagram];
}
