import type { VisibleTreeRow, ModelTreeNode, ExplorerView } from './modelExplorerTypes';

export interface PersistedExplorerUiState {
  favorites: string[];
  recentSemanticIds: string[];
  expandedNodeIds: string[];
  activeView: ExplorerView;
}

const memoryStore = new Map<string, string>();

/**
 * Computes contiguous range selection between anchor and target row in visible tree.
 */
export function computeRangeSelection(
  visibleRows: VisibleTreeRow[],
  anchorId: string,
  targetId: string
): string[] {
  let anchorIdx = -1;
  let targetIdx = -1;

  for (let i = 0; i < visibleRows.length; i++) {
    const row = visibleRows[i];
    if (row.node.nodeId === anchorId || row.node.semanticId === anchorId) {
      anchorIdx = i;
    }
    if (row.node.nodeId === targetId || row.node.semanticId === targetId) {
      targetIdx = i;
    }
    if (anchorIdx !== -1 && targetIdx !== -1) break;
  }

  if (anchorIdx === -1 || targetIdx === -1) {
    return [targetId];
  }

  const start = Math.min(anchorIdx, targetIdx);
  const end = Math.max(anchorIdx, targetIdx);

  return visibleRows.slice(start, end + 1).map(r => r.node.semanticId);
}

/**
 * Toggles a single item in or out of the active selection set.
 */
export function computeToggleSelection(
  currentSelectedIds: string[],
  targetId: string
): string[] {
  const exists = currentSelectedIds.includes(targetId);
  if (exists) {
    return currentSelectedIds.filter(id => id !== targetId);
  }
  return [...currentSelectedIds, targetId];
}

/**
 * Computes the minimal root forest from a multi-selection list,
 * pruning any node whose ancestor is also selected.
 */
export function computeMultiSelectForest(
  selectedIds: string[],
  nodesById: Record<string, ModelTreeNode> | Map<string, ModelTreeNode>
): string[] {
  const nodeMap = nodesById instanceof Map ? Object.fromEntries(nodesById.entries()) : nodesById;
  const selectedSet = new Set(selectedIds);

  // Map semanticId to node
  const nodeBySemanticId = new Map<string, ModelTreeNode>();
  for (const node of Object.values(nodeMap)) {
    nodeBySemanticId.set(node.semanticId, node);
  }

  const roots: string[] = [];

  for (const id of selectedIds) {
    const node = nodeMap[id] || nodeBySemanticId.get(id);
    if (!node) {
      roots.push(id);
      continue;
    }

    let hasSelectedAncestor = false;
    let current: ModelTreeNode | undefined = node;

    while (current && current.parentNodeId) {
      const parent: ModelTreeNode | undefined =
        nodeMap[current.parentNodeId] || nodeBySemanticId.get(current.parentNodeId);
      if (!parent) break;

      if (selectedSet.has(parent.semanticId) || selectedSet.has(parent.nodeId)) {
        hasSelectedAncestor = true;
        break;
      }
      current = parent;
    }

    if (!hasSelectedAncestor) {
      roots.push(id);
    }
  }

  return roots;
}

const STORAGE_PREFIX = 'adia_model_explorer_ui_state_';

/**
 * Persists explorer UI state (favorites, recents, expansion, view) safely.
 */
export function persistExplorerUiState(
  projectId: string,
  state: PersistedExplorerUiState
): void {
  const key = `${STORAGE_PREFIX}${projectId || 'default'}`;
  const serialized = JSON.stringify({
    favorites: state.favorites,
    recentSemanticIds: state.recentSemanticIds.slice(0, 30),
    expandedNodeIds: state.expandedNodeIds,
    activeView: state.activeView,
  });

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, serialized);
    } else {
      memoryStore.set(key, serialized);
    }
  } catch {
    memoryStore.set(key, serialized);
  }
}

/**
 * Loads persisted explorer UI state, falling back gracefully to memory store or null.
 */
export function loadPersistedExplorerUiState(
  projectId: string
): PersistedExplorerUiState | null {
  const key = `${STORAGE_PREFIX}${projectId || 'default'}`;
  let raw: string | null = null;

  try {
    if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(key);
    }
    if (!raw) {
      raw = memoryStore.get(key) ?? null;
    }
  } catch {
    raw = memoryStore.get(key) ?? null;
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      recentSemanticIds: Array.isArray(parsed.recentSemanticIds) ? parsed.recentSemanticIds : [],
      expandedNodeIds: Array.isArray(parsed.expandedNodeIds) ? parsed.expandedNodeIds : [],
      activeView: parsed.activeView || 'containment',
    };
  } catch {
    return null;
  }
}
