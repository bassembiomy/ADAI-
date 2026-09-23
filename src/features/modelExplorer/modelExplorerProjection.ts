import type {
  ModelTreeNode,
  ModelTreeProjection,
  VisibleTreeRow,
} from './modelExplorerTypes';

/**
 * Flattens visible rows in deterministic label order based on current expansion state.
 */
export function flattenVisibleTree(
  projection: ModelTreeProjection,
  expanded: ReadonlySet<string>
): VisibleTreeRow[] {
  const rows: VisibleTreeRow[] = [];
  const visited = new Set<string>();

  const visit = (nodeId: string, depth: number) => {
    const node = projection.nodes[nodeId];
    if (!node || visited.has(nodeId)) return;
    visited.add(nodeId);

    rows.push({ node, depth, index: rows.length });

    if (!expanded.has(nodeId)) return;

    [...node.childNodeIds]
      .sort((left, right) => {
        const leftNode = projection.nodes[left];
        const rightNode = projection.nodes[right];
        const leftLabel = leftNode?.label ?? left;
        const rightLabel = rightNode?.label ?? right;
        return leftLabel.localeCompare(rightLabel) || left.localeCompare(right);
      })
      .forEach(childId => visit(childId, depth + 1));
  };

  projection.roots.forEach(rootId => visit(rootId, 0));
  return rows;
}

/**
 * Checks if a single node matches the search query string.
 */
function nodeMatchesQuery(node: ModelTreeNode, queryLower: string): boolean {
  if (node.label.toLowerCase().includes(queryLower)) return true;
  if (node.secondaryLabel && node.secondaryLabel.toLowerCase().includes(queryLower)) return true;
  if (node.kind.toLowerCase().includes(queryLower)) return true;
  return false;
}

/**
 * Filters projection by retaining all ancestors of matches and only matching descendant branches.
 */
export function filterProjection(
  projection: ModelTreeProjection,
  query: string
): ModelTreeProjection {
  const trimmed = query.trim();
  if (!trimmed) {
    return projection;
  }

  const queryLower = trimmed.toLowerCase();
  const directMatches = new Set<string>();

  for (const [nodeId, node] of Object.entries(projection.nodes)) {
    if (nodeMatchesQuery(node, queryLower)) {
      directMatches.add(nodeId);
    }
  }

  if (directMatches.size === 0) {
    return {
      roots: [],
      nodes: {},
      revision: projection.revision,
    };
  }

  // Find all ancestor nodes of matches
  const includedIds = new Set<string>(directMatches);

  for (const matchId of directMatches) {
    let current = projection.nodes[matchId];
    while (current && current.parentNodeId) {
      includedIds.add(current.parentNodeId);
      current = projection.nodes[current.parentNodeId];
    }
  }

  // Construct filtered nodes map with pruned childNodeIds
  const filteredNodes: Record<string, ModelTreeNode> = {};
  for (const id of includedIds) {
    const orig = projection.nodes[id];
    if (!orig) continue;
    const filteredChildren = orig.childNodeIds.filter(childId => includedIds.has(childId));
    filteredNodes[id] = {
      ...orig,
      childNodeIds: filteredChildren,
      hasChildren: filteredChildren.length > 0,
    };
  }

  const filteredRoots = projection.roots.filter(rootId => includedIds.has(rootId));

  return {
    roots: filteredRoots,
    nodes: filteredNodes,
    revision: projection.revision,
  };
}
