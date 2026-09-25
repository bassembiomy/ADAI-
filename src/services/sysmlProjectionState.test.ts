import { describe, expect, it, vi } from 'vitest';
import type { LegacySysmlView } from './sysmlCommandGateway';
import { applyCanonicalSysmlResult, projectDiagramScopedCanvasView } from './sysmlProjectionState';

describe('applyCanonicalSysmlResult', () => {
  it('applies only the view projected from the canonical gateway result', () => {
    const view: LegacySysmlView = { blocks: [], relationships: [], parts: [], connectors: [] };
    const setProjection = vi.fn();
    applyCanonicalSysmlResult({ view }, setProjection);
    expect(setProjection).toHaveBeenCalledExactlyOnceWith(view);
  });

  it('overlays active-diagram bounds and port layouts without leaking them to another viewpoint', () => {
    const complete: LegacySysmlView = {
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

  it('keeps the active IBD context Block available without making it a BDD member', () => {
    const contextBlock: LegacySysmlView['blocks'][number] = {
      id: 'vehicle', name: 'Vehicle', stereotype: 'block', x: 0, y: 0, width: 10, height: 10,
      properties: [], operations: [], constraints: [], classes: [], ports: [],
    };
    const complete: LegacySysmlView = { blocks: [contextBlock], relationships: [], parts: [], connectors: [] };
    const diagrams = { requirements: { elementIds: ['vehicle'], presentations: {} } };

    expect(projectDiagramScopedCanvasView(complete, 'vehicle-ibd', diagrams, ['vehicle']).blocks.map(block => block.id))
      .toEqual(['vehicle']);
    expect(projectDiagramScopedCanvasView(complete, 'bdd', diagrams).blocks).toEqual([]);
  });

  it('keeps repository Block choices complete while producing a scoped IBD canvas projection', () => {
    const repositoryProjection: LegacySysmlView = {
      blocks: [
        { id: 'vehicle', name: 'Vehicle', stereotype: 'block', x: 0, y: 0, width: 10, height: 10, properties: [], operations: [], constraints: [], classes: [], ports: [] },
        { id: 'motor', name: 'Motor', stereotype: 'block', x: 0, y: 0, width: 10, height: 10, properties: [], operations: [], constraints: [], classes: [], ports: [] },
      ],
      relationships: [],
      parts: [{ id: 'left-motor', name: 'leftMotor', blockId: 'vehicle', typeId: 'motor', x: 0, y: 0, width: 10, height: 10 }],
      connectors: [],
    };
    let sharedRepositoryView: LegacySysmlView | undefined;
    applyCanonicalSysmlResult({ view: repositoryProjection }, view => { sharedRepositoryView = view; });

    const ibdCanvasView = projectDiagramScopedCanvasView(sharedRepositoryView!, 'vehicle-ibd', {
      'vehicle-ibd': { elementIds: ['left-motor'], presentations: {} },
    }, ['vehicle']);

    expect(sharedRepositoryView?.blocks.filter(block => block.stereotype === 'block').map(block => block.id))
      .toEqual(['vehicle', 'motor']);
    expect(ibdCanvasView.blocks.map(block => block.id)).toEqual(['vehicle']);
    expect(ibdCanvasView.parts.map(part => part.id)).toEqual(['left-motor']);
  });
});
