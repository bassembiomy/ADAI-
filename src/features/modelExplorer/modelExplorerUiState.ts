import type { ExplorerView } from './modelExplorerTypes';

export interface ModelExplorerUiState {
  activeView: ExplorerView;
  expandedNodeIds: Set<string>;
  selectedSemanticIds: string[];
  focusedNodeId: string | null;
  query: string;
  favorites: string[];
  recentSemanticIds: string[];
  followSelection: boolean;
}

export type ModelExplorerUiAction =
  | { type: 'setActiveView'; view: ExplorerView }
  | { type: 'toggleExpanded'; nodeId: string }
  | { type: 'setExpanded'; nodeIds: string[] | Set<string> }
  | { type: 'expandAll'; nodeIds: string[] }
  | { type: 'collapseAll' }
  | { type: 'setSelectedSemanticIds'; ids: string[] }
  | { type: 'setFocusedNodeId'; nodeId: string | null }
  | { type: 'setQuery'; query: string }
  | { type: 'toggleFavorite'; semanticId: string }
  | { type: 'addRecent'; semanticId: string }
  | { type: 'setFollowSelection'; follow: boolean };

export function createInitialUiState(partial?: Partial<ModelExplorerUiState>): ModelExplorerUiState {
  return {
    activeView: 'containment',
    expandedNodeIds: new Set(),
    selectedSemanticIds: [],
    focusedNodeId: null,
    query: '',
    favorites: [],
    recentSemanticIds: [],
    followSelection: true,
    ...partial,
  };
}

export function modelExplorerUiReducer(
  state: ModelExplorerUiState,
  action: ModelExplorerUiAction
): ModelExplorerUiState {
  switch (action.type) {
    case 'setActiveView':
      return { ...state, activeView: action.view };

    case 'toggleExpanded': {
      const next = new Set(state.expandedNodeIds);
      if (next.has(action.nodeId)) {
        next.delete(action.nodeId);
      } else {
        next.add(action.nodeId);
      }
      return { ...state, expandedNodeIds: next };
    }

    case 'setExpanded':
      return { ...state, expandedNodeIds: new Set(action.nodeIds) };

    case 'expandAll': {
      const next = new Set(state.expandedNodeIds);
      action.nodeIds.forEach(id => next.add(id));
      return { ...state, expandedNodeIds: next };
    }

    case 'collapseAll':
      return { ...state, expandedNodeIds: new Set() };

    case 'setSelectedSemanticIds':
      return { ...state, selectedSemanticIds: action.ids };

    case 'setFocusedNodeId':
      return { ...state, focusedNodeId: action.nodeId };

    case 'setQuery':
      return { ...state, query: action.query };

    case 'toggleFavorite': {
      const exists = state.favorites.includes(action.semanticId);
      const nextFavorites = exists
        ? state.favorites.filter(id => id !== action.semanticId)
        : [...state.favorites, action.semanticId];
      return { ...state, favorites: nextFavorites };
    }

    case 'addRecent': {
      const filtered = state.recentSemanticIds.filter(id => id !== action.semanticId);
      return {
        ...state,
        recentSemanticIds: [action.semanticId, ...filtered].slice(0, 30),
      };
    }

    case 'setFollowSelection':
      return { ...state, followSelection: action.follow };

    default:
      return state;
  }
}
