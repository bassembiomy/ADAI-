import type {
  ActiveDiagramContext,
  ModelTreeNode,
  ModelTreeProjection,
} from './modelExplorerTypes';

function indexNodeIdsBySemanticId(projection: ModelTreeProjection): Map<string, string[]> {
  const nodeIdsBySemanticId = new Map<string, string[]>();

  for (const node of Object.values(projection.nodes)) {
    const existing = nodeIdsBySemanticId.get(node.semanticId);
    if (existing) {
      existing.push(node.nodeId);
    } else {
      nodeIdsBySemanticId.set(node.semanticId, [node.nodeId]);
    }
  }

  return nodeIdsBySemanticId;
}

function ancestorNodeIdsForNode(
  projection: ModelTreeProjection,
  nodeId: string
): string[] {
  const ancestors: string[] = [];
  const visited = new Set<string>([nodeId]);
  let parentNodeId = projection.nodes[nodeId]?.parentNodeId ?? null;

  while (parentNodeId && !visited.has(parentNodeId)) {
    const parent = projection.nodes[parentNodeId];
    if (!parent) break;

    ancestors.push(parentNodeId);
    visited.add(parentNodeId);
    parentNodeId = parent.parentNodeId;
  }

  return ancestors.reverse();
}

/**
 * Returns the root-to-parent ownership path for the first node matching a semantic ID.
 */
export function getAncestorNodeIds(
  projection: ModelTreeProjection,
  semanticId: string
): string[] {
  const nodeId = indexNodeIdsBySemanticId(projection).get(semanticId)?.[0];
  return nodeId ? ancestorNodeIdsForNode(projection, nodeId) : [];
}

function cloneIncludedNodes(
  projection: ModelTreeProjection,
  includedNodeIds: ReadonlySet<string>
): Record<string, ModelTreeNode> {
  const nodes: Record<string, ModelTreeNode> = {};

  for (const [nodeId, node] of Object.entries(projection.nodes)) {
    if (!includedNodeIds.has(nodeId)) continue;

    const childNodeIds = node.childNodeIds.filter(childId => includedNodeIds.has(childId));
    nodes[nodeId] = {
      ...node,
      childNodeIds,
      hasChildren: childNodeIds.length > 0,
    };
  }

  return nodes;
}

function emptyModelScaffold(projection: ModelTreeProjection): ModelTreeProjection {
  const modelNode = projection.nodes['project:model'];
  if (!modelNode) {
    return { roots: [], nodes: {}, revision: projection.revision };
  }

  return {
    roots: ['project:model'],
    nodes: {
      'project:model': {
        ...modelNode,
        childNodeIds: [],
        hasChildren: false,
      },
    },
    revision: projection.revision,
  };
}

/**
 * Projects a hierarchy down to elements presented by an active diagram, its
 * semantic context elements, and the ownership paths needed to reveal them.
 */
export function projectDiagramContext(
  projection: ModelTreeProjection,
  context: ActiveDiagramContext
): ModelTreeProjection {
  const nodeIdsBySemanticId = indexNodeIdsBySemanticId(projection);
  const requestedSemanticIds = new Set([
    ...context.presentedSemanticIds,
    ...(context.contextSemanticIds ?? []),
  ]);
  const matchedNodeIds = new Set<string>();

  for (const semanticId of requestedSemanticIds) {
    for (const nodeId of nodeIdsBySemanticId.get(semanticId) ?? []) {
      matchedNodeIds.add(nodeId);
    }
  }

  if (matchedNodeIds.size === 0) {
    return emptyModelScaffold(projection);
  }

  const includedNodeIds = new Set(matchedNodeIds);
  for (const nodeId of matchedNodeIds) {
    for (const ancestorId of ancestorNodeIdsForNode(projection, nodeId)) {
      includedNodeIds.add(ancestorId);
    }
  }

  return {
    roots: projection.roots.filter(rootId => includedNodeIds.has(rootId)),
    nodes: cloneIncludedNodes(projection, includedNodeIds),
    revision: projection.revision,
  };
}
