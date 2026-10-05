// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { createSysmlEditorStore } from './sysmlEditorStore';
import { SysmlWorkspace } from './SysmlWorkspace';
import { createEmptyRepository } from '../../../engine/sysml/model';
import { fromRepository } from '../../../engine/sysml/normalizedStore';

describe('SysmlWorkspace Render Isolation', () => {
  function setupTestWorkspace() {
    const repo = createEmptyRepository();
    repo.definitions['b1'] = {
      id: 'b1', name: 'Block1', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repo.diagrams['d1'] = {
      id: 'd1', name: 'Diagram 1', kind: 'diagram', diagramKind: 'bdd', ownerId: 'model', namespace: ['model'],
    };

    const store = createSysmlEditorStore({
      repository: repo,
      store: fromRepository(repo),
      activeDiagramId: 'd1',
      selectedIds: ['b1'],
      coordinates: { d1: { b1: { x: 10, y: 10 } } },
    });

    return store;
  }

  it('coordinate drag updates canvas without re-rendering explorer', () => {
    const store = setupTestWorkspace();
    let explorerRenderCount = 0;
    let canvasRenderCount = 0;

    render(
      <SysmlWorkspace
        store={store}
        renderExplorer={() => {
          explorerRenderCount++;
          return <div data-testid="explorer">Explorer</div>;
        }}
        renderCanvas={({ coordinates }) => {
          canvasRenderCount++;
          return <div data-testid="canvas">Coords: {coordinates.d1?.b1?.x}</div>;
        }}
      />
    );

    expect(explorerRenderCount).toBe(1);
    expect(canvasRenderCount).toBe(1);

    // Simulate coordinate drag on the canvas
    act(() => {
      store.dispatch({
        type: 'updateCoordinates',
        diagramId: 'd1',
        elementId: 'b1',
        coordinates: { x: 120, y: 150 },
      });
    });

    // Canvas re-renders with new coordinates, but explorer does NOT re-render!
    expect(canvasRenderCount).toBe(2);
    expect(explorerRenderCount).toBe(1);
  });

  it('switching active diagram re-renders canvas without re-rendering explorer', () => {
    const store = setupTestWorkspace();
    let explorerRenderCount = 0;
    let canvasRenderCount = 0;

    render(
      <SysmlWorkspace
        store={store}
        renderExplorer={() => {
          explorerRenderCount++;
          return <div data-testid="explorer">Explorer</div>;
        }}
        renderCanvas={({ activeDiagramId }) => {
          canvasRenderCount++;
          return <div data-testid="canvas">Diagram: {activeDiagramId}</div>;
        }}
      />
    );

    expect(explorerRenderCount).toBe(1);
    expect(canvasRenderCount).toBe(1);

    // Switch active diagram
    act(() => {
      store.dispatch({
        type: 'setActiveDiagram',
        diagramId: 'd2',
      });
    });

    // Canvas re-renders with new active diagram, explorer does not re-render!
    expect(canvasRenderCount).toBe(2);
    expect(explorerRenderCount).toBe(1);
  });
});
