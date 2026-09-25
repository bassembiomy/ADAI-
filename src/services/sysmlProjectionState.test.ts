// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LegacySysmlView } from './sysmlCommandGateway';
import { applyCanonicalSysmlResult, projectDiagramScopedCanvasView } from './sysmlProjectionState';

describe('applyCanonicalSysmlResult', () => {
  it('applies only the view projected from the canonical gateway result', () => {
    const view: LegacySysmlView = { packages: [], blocks: [], relationships: [], parts: [], connectors: [] };
    const setProjection = vi.fn();
    applyCanonicalSysmlResult({ view }, setProjection);
    expect(setProjection).toHaveBeenCalledExactlyOnceWith(view);
  });

  it('overlays active-diagram bounds and port layouts without leaking them to another viewpoint', () => {
    const complete: LegacySysmlView = {
      packages: [],
      blocks: [{ id: 'motor', name: 'Motor', stereotype: 'block', x: 1, y: 2, width: 10, height: 10, properties: [], operations: [], constraints: [], classes: [], ports: [] }],
      relationships: [],
      parts: [{ id: 'left-motor', name: 'leftMotor', blockId: 'vehicle', typeId: 'motor', x: 3, y: 4, width: 10, height: 10 }],
      connectors: [],
    };
    const diagrams = {
      bdd: { elementIds: ['motor', 'left-motor'], presentations: { motor: { id: 'p-motor-bdd', diagramId: 'bdd', semanticElementId: 'motor', bounds: { x: 20, y: 30, width: 10, height: 10 } } } },
      ibd: { elementIds: ['left-motor'], presentations: { 'left-motor': { id: 'p-part-ibd', diagramId: 'ibd', semanticElementId: 'left-motor', bounds: { x: 40, y: 50, width: 10, height: 10 }, portLayouts: { control: { side: 'right' as const, offset: 0.75 } } } } },
    };

    const active = projectDiagramScopedCanvasView(complete, 'ibd', diagrams);
    const other = projectDiagramScopedCanvasView(complete, 'bdd', diagrams);
    expect(active.parts[0]).toMatchObject({ x: 40, y: 50, portLayouts: { control: { side: 'right', offset: 0.75 } } });
    expect(other.parts[0]).toMatchObject({ x: 3, y: 4 });
    expect(other.parts[0].portLayouts).toBeUndefined();
    expect(other.blocks[0]).toMatchObject({ x: 20, y: 30 });
  });

  it('shows semantic elements only on diagrams that contain their presentation', () => {
    const complete: LegacySysmlView = {
      packages: [],
      blocks: [
        { id: 'requirements-only', name: 'Requirement Block', stereotype: 'block', x: 0, y: 0, width: 10, height: 10, properties: [], operations: [], constraints: [], classes: [], ports: [] },
        { id: 'bdd-only', name: 'BDD Block', stereotype: 'block', x: 0, y: 0, width: 10, height: 10, properties: [], operations: [], constraints: [], classes: [], ports: [] },
      ],
      relationships: [{ id: 'satisfy-1', sourceId: 'bdd-only', targetId: 'requirement-1', type: 'satisfy', label: 'satisfy' }],
      parts: [],
      connectors: [{ id: 'connector-1', sourcePartId: 'left', sourcePortId: 'p1', targetPartId: 'right', targetPortId: 'p2', kind: 'assembly' }],
    };
    const diagrams = {
      requirements: { elementIds: ['requirements-only'], presentations: {} },
      bdd: { elementIds: ['bdd-only'], presentations: {} },
    };

    expect(projectDiagramScopedCanvasView(complete, 'requirements', diagrams).blocks.map(block => block.id))
      .toEqual(['requirements-only']);
    expect(projectDiagramScopedCanvasView(complete, 'bdd', diagrams).blocks.map(block => block.id))
      .toEqual(['bdd-only']);
    expect(projectDiagramScopedCanvasView(complete, 'uninitialized-bdd', diagrams).blocks)
      .toEqual([]);
    expect(projectDiagramScopedCanvasView(complete, 'bdd', diagrams).relationships).toEqual(complete.relationships);
    expect(projectDiagramScopedCanvasView(complete, 'bdd', diagrams).connectors).toEqual(complete.connectors);
  });

  it('scopes and overlays Package presentations independently from semantic containment', () => {
    const complete: LegacySysmlView = {
      packages: [{ id: 'pkg-powertrain', name: 'Powertrain', ownerId: 'model', x: 0, y: 0, width: 220, height: 140 }],
      blocks: [], relationships: [], parts: [], connectors: [],
    };
    const diagrams = {
      bdd: {
        elementIds: ['pkg-powertrain'],
        presentations: {
          'pkg-powertrain': {
            id: 'presentation:bdd:pkg-powertrain', diagramId: 'bdd', semanticElementId: 'pkg-powertrain',
            bounds: { x: 120, y: 80, width: 260, height: 160 },
          },
        },
      },
    };

    expect(projectDiagramScopedCanvasView(complete, 'bdd', diagrams).packages[0]).toMatchObject({ x: 120, y: 80, width: 260, height: 160 });
    expect(projectDiagramScopedCanvasView(complete, 'requirements', diagrams).packages).toEqual([]);
  });

  it('keeps the active IBD context Block available without making it a BDD member', () => {
    const contextBlock: LegacySysmlView['blocks'][number] = {
      id: 'vehicle', name: 'Vehicle', stereotype: 'block', x: 0, y: 0, width: 10, height: 10,
      properties: [], operations: [], constraints: [], classes: [], ports: [],
    };
    const complete: LegacySysmlView = { packages: [], blocks: [contextBlock], relationships: [], parts: [], connectors: [] };
    const diagrams = { requirements: { elementIds: ['vehicle'], presentations: {} } };

    expect(projectDiagramScopedCanvasView(complete, 'vehicle-ibd', diagrams, ['vehicle']).blocks.map(block => block.id))
      .toEqual(['vehicle']);
    expect(projectDiagramScopedCanvasView(complete, 'bdd', diagrams).blocks).toEqual([]);
  });

  it('keeps repository Block choices complete while producing a scoped IBD canvas projection', () => {
    const repositoryProjection: LegacySysmlView = {
      packages: [],
      blocks: [
        { id: 'vehicle', name: 'Vehicle', stereotype: 'block', x: 0, y: 0, width: 10, height: 10, properties: [], operations: [], constraints: [], classes: [], ports: [] },
        { id: 'motor', name: 'Motor', stereotype: 'block', x: 0, y: 0, width: 10, height: 10, properties: [], operations: [], constraints: [], classes: [], ports: [] },
      ],
      relationships: [],
      parts: [{ id: 'left-motor', name: 'leftMotor', blockId: 'vehicle', typeId: 'motor', x: 0, y: 0, width: 10, height: 10 }],
      connectors: [],
    };
    let sharedRepositoryView: LegacySysmlView | undefined;
    applyCanonicalSysmlResult({ view: repositoryProjection }, view => {
      sharedRepositoryView = typeof view === 'function' ? (view as (prev: LegacySysmlView) => LegacySysmlView)(repositoryProjection) : view;
    });

    const ibdCanvasView = projectDiagramScopedCanvasView(sharedRepositoryView!, 'vehicle-ibd', {
      'vehicle-ibd': { elementIds: ['left-motor'], presentations: {} },
    }, ['vehicle']);

    expect(sharedRepositoryView?.blocks.filter(block => block.stereotype === 'block').map(block => block.id))
      .toEqual(['vehicle', 'motor']);
    expect(ibdCanvasView.blocks.map(block => block.id)).toEqual(['vehicle']);
    expect(ibdCanvasView.parts.map(part => part.id)).toEqual(['left-motor']);
  });

  it('allows decoupling drag movement via updateBlockBounds and updatePartBounds in useSysmlProjectionState', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { useSysmlProjectionState } = await import('./sysmlProjectionState');

    const { result } = renderHook(() => useSysmlProjectionState());
    const initialView: LegacySysmlView = {
      packages: [],
      blocks: [{ id: 'b1', name: 'B1', stereotype: 'block', x: 10, y: 20, width: 100, height: 80, properties: [], operations: [], constraints: [], classes: [], ports: [] }],
      relationships: [],
      parts: [{ id: 'p1', name: 'P1', blockId: 'b1', typeId: 'b1', x: 30, y: 40, width: 80, height: 60 }],
      connectors: [],
    };

    act(() => {
      result.current.applyCanonicalSysmlResult({ view: initialView });
    });

    expect(result.current.blocks[0]).toMatchObject({ x: 10, y: 20 });
    expect(result.current.parts[0]).toMatchObject({ x: 30, y: 40 });

    act(() => {
      result.current.updateBlockBounds('b1', { x: 150, y: 250 });
    });
    expect(result.current.blocks[0]).toMatchObject({ x: 150, y: 250, width: 100, height: 80 });

    act(() => {
      result.current.updatePartBounds('p1', { x: 300, y: 400 });
    });
    expect(result.current.parts[0]).toMatchObject({ x: 300, y: 400, width: 80, height: 60 });
  });
});
