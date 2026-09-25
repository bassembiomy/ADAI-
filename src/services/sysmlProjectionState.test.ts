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
      bdd: { elementIds: ['motor'], presentations: { motor: { id: 'p-motor-bdd', diagramId: 'bdd', semanticElementId: 'motor', bounds: { x: 20, y: 30, width: 10, height: 10 } } } },
      ibd: { elementIds: ['left-motor'], presentations: { 'left-motor': { id: 'p-part-ibd', diagramId: 'ibd', semanticElementId: 'left-motor', bounds: { x: 40, y: 50, width: 10, height: 10 }, portLayouts: { control: { side: 'right' as const, offset: 0.75 } } } } },
    };

    const active = projectDiagramScopedCanvasView(complete, 'ibd', diagrams);
    const other = projectDiagramScopedCanvasView(complete, 'bdd', diagrams);
    expect(active.parts[0]).toMatchObject({ x: 40, y: 50, portLayouts: { control: { side: 'right', offset: 0.75 } } });
    expect(other.parts[0]).toMatchObject({ x: 3, y: 4 });
    expect(other.parts[0].portLayouts).toBeUndefined();
    expect(other.blocks[0]).toMatchObject({ x: 20, y: 30 });
  });
});
