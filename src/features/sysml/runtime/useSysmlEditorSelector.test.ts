// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createSysmlEditorStore } from './sysmlEditorStore';
import { useSysmlEditorSelector } from './useSysmlEditorSelector';
import { createEmptyRepository } from '../../../engine/sysml/model';

describe('useSysmlEditorSelector', () => {
  it('triggers component updates only when the selected slice changes', () => {
    const repo = createEmptyRepository();
    repo.definitions['b1'] = {
      id: 'b1', name: 'Block1', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const store = createSysmlEditorStore({
      repository: repo,
      activeDiagramId: 'd1',
      selectedIds: ['b1'],
    });

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useSysmlEditorSelector(store, state => state.activeDiagramId);
    });

    expect(result.current).toBe('d1');
    expect(renderCount).toBe(1);

    // Coordinate update: activeDiagramId is unchanged
    act(() => {
      store.dispatch({
        type: 'updateCoordinates',
        diagramId: 'd1',
        elementId: 'b1',
        coordinates: { x: 50, y: 50 },
      });
    });

    // Should NOT re-render because activeDiagramId did not change
    expect(renderCount).toBe(1);
    expect(result.current).toBe('d1');

    // Switch diagram
    act(() => {
      store.dispatch({
        type: 'setActiveDiagram',
        diagramId: 'd2',
      });
    });

    // Should re-render once
    expect(renderCount).toBe(2);
    expect(result.current).toBe('d2');
  });
});
