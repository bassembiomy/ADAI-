import { describe, expect, it } from 'vitest';
import type { VLabEdge, VLabNode } from './VLabWorkspaceTypes';
import { normalizeLegacyVLabGraph } from './vlabModelMigration';

const node = (id: string, type: string): VLabNode => ({
  id,
  position: { x: 0, y: 0 },
  data: { type },
});

describe('normalizeLegacyVLabGraph', () => {
  it('removes gas_properties nodes and their incident edges', () => {
    const nodes = [node('legacy', 'gas_properties'), node('source', 'gas_pressure_source')];
    const edges: VLabEdge[] = [
      { id: 'bad', source: 'source', target: 'legacy' },
    ];

    expect(normalizeLegacyVLabGraph(nodes, edges)).toEqual({
      nodes: [nodes[1]],
      edges: [],
    });
  });

  it('preserves unrelated data without mutating the input arrays', () => {
    const nodes = [node('source', 'gas_pressure_source'), node('sink', 'gas_reservoir')];
    const edges: VLabEdge[] = [{ id: 'valid', source: 'source', target: 'sink' }];
    const originalNodes = [...nodes];
    const originalEdges = [...edges];

    const result = normalizeLegacyVLabGraph(nodes, edges);

    expect(result).toEqual({ nodes, edges });
    expect(nodes).toEqual(originalNodes);
    expect(edges).toEqual(originalEdges);
  });
});
