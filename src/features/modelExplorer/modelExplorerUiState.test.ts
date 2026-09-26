import { describe, expect, it } from 'vitest';
import {
  modelExplorerUiReducer,
  createInitialUiState,
} from './modelExplorerUiState';

describe('modelExplorerUiState', () => {
  it('manages expansion state with expand, collapse, and toggle actions', () => {
    let state = createInitialUiState();
    expect(state.expandedNodeIds.has('root')).toBe(false);

    state = modelExplorerUiReducer(state, { type: 'toggleExpanded', nodeId: 'root' });
    expect(state.expandedNodeIds.has('root')).toBe(true);

    state = modelExplorerUiReducer(state, { type: 'toggleExpanded', nodeId: 'root' });
    expect(state.expandedNodeIds.has('root')).toBe(false);

    state = modelExplorerUiReducer(state, { type: 'expandAll', nodeIds: ['a', 'b', 'c'] });
    expect(state.expandedNodeIds.size).toBe(3);

    state = modelExplorerUiReducer(state, { type: 'collapseAll' });
    expect(state.expandedNodeIds.size).toBe(0);
  });

  it('manages favorites and recents list boundedly', () => {
    let state = createInitialUiState();
    state = modelExplorerUiReducer(state, { type: 'toggleFavorite', semanticId: 'block-1' });
    expect(state.favorites).toContain('block-1');

    state = modelExplorerUiReducer(state, { type: 'toggleFavorite', semanticId: 'block-1' });
    expect(state.favorites).not.toContain('block-1');

    state = modelExplorerUiReducer(state, { type: 'addRecent', semanticId: 'item-1' });
    state = modelExplorerUiReducer(state, { type: 'addRecent', semanticId: 'item-2' });
    expect(state.recentSemanticIds[0]).toBe('item-2');
    expect(state.recentSemanticIds[1]).toBe('item-1');
  });

  it('updates selection and active view', () => {
    let state = createInitialUiState();
    state = modelExplorerUiReducer(state, { type: 'setActiveView', view: 'diagramContext' });
    expect(state.activeView).toBe('diagramContext');

    state = modelExplorerUiReducer(state, { type: 'setSelectedSemanticIds', ids: ['a', 'b'] });
    expect(state.selectedSemanticIds).toEqual(['a', 'b']);
  });
});
