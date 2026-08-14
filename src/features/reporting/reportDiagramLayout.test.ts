import { describe, expect, it } from 'vitest';
import { SizedNode, measureNode, rectsOverlap } from './reportDiagramModel';
import { layoutGrid, layoutLayered, nodeById, routeEdgePath, routeManhattan } from './reportDiagramLayout';

function assertNoOverlaps(nodes: { id: string; x: number; y: number; width: number; height: number }[]): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      expect(rectsOverlap(nodes[i], nodes[j]), `${nodes[i].id} overlaps ${nodes[j].id}`).toBe(false);
    }
  }
}

const chain = (): { nodes: SizedNode[]; edges: { sourceId: string; targetId: string }[] } => ({
  nodes: ['idle', 'heat', 'cool', 'safe'].map(id => measureNode(id, [id], 'state')),
  edges: [
    { sourceId: 'idle', targetId: 'heat' },
    { sourceId: 'heat', targetId: 'cool' },
    { sourceId: 'cool', targetId: 'safe' },
  ],
});

describe('layoutLayered', () => {
  it('places ranks left to right with no overlapping nodes', () => {
    const { nodes, edges } = chain();
    const placed = layoutLayered(nodes, edges, { rootIds: ['idle'] });
    assertNoOverlaps(placed);
    expect(nodeById(placed, 'idle')!.x).toBeLessThan(nodeById(placed, 'heat')!.x);
    expect(nodeById(placed, 'heat')!.x).toBeLessThan(nodeById(placed, 'cool')!.x);
    expect(nodeById(placed, 'cool')!.x).toBeLessThan(nodeById(placed, 'safe')!.x);
  });

  it('survives cyclic graphs without infinite loops or overlaps', () => {
    const nodes = ['a', 'b', 'c'].map(id => measureNode(id, [id], 'state'));
    const edges = [
      { sourceId: 'a', targetId: 'b' },
      { sourceId: 'b', targetId: 'c' },
      { sourceId: 'c', targetId: 'a' },
    ];
    const placed = layoutLayered(nodes, edges);
    expect(placed).toHaveLength(3);
    assertNoOverlaps(placed);
  });

  it('lays out a dense diamond without overlaps', () => {
    const nodes = ['root', ...Array.from({ length: 9 }, (_, i) => `mid${i}`), 'sink']
      .map(id => measureNode(id, [id], 'state'));
    const edges = [
      ...Array.from({ length: 9 }, (_, i) => ({ sourceId: 'root', targetId: `mid${i}` })),
      ...Array.from({ length: 9 }, (_, i) => ({ sourceId: `mid${i}`, targetId: 'sink' })),
    ];
    assertNoOverlaps(layoutLayered(nodes, edges, { rootIds: ['root'] }));
  });
});

describe('layoutGrid', () => {
  it('places nodes in rows without overlaps', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => measureNode(`n${i}`, [`component ${i}`], 'hmi'));
    const placed = layoutGrid(nodes, 3);
    assertNoOverlaps(placed);
    expect(nodeById(placed, 'n0')!.y).toBe(nodeById(placed, 'n1')!.y);
    expect(nodeById(placed, 'n0')!.y).toBeLessThan(nodeById(placed, 'n3')!.y);
  });
});

describe('routeEdgePath', () => {
  const a = { x: 0, y: 0, width: 100, height: 40 };
  const b = { x: 240, y: 80, width: 100, height: 40 };

  it('routes forward edges as a curve from right edge to left edge', () => {
    expect(routeEdgePath(a, b)).toMatch(/^M 100 20 C /);
    expect(routeEdgePath(a, b)).toMatch(/240 100$/);
  });

  it('routes self loops above the node', () => {
    const path = routeEdgePath(a, a);
    expect(path).toContain('C');
    expect(path).toContain('-30');
  });

  it('routes backward edges below both nodes', () => {
    const path = routeEdgePath(b, a);
    expect(path).toContain(`L ${b.x + b.width + 16} 140`);
  });

  it('routes orthogonal edges through the mid channel', () => {
    expect(routeEdgePath(a, b, { orthogonal: true })).toBe('M 100 20 L 170 20 L 170 100 L 240 100');
  });
});

describe('routeManhattan', () => {
  it('offsets parallel connectors by index', () => {
    const p = { x: 10, y: 10 };
    const q = { x: 210, y: 90 };
    expect(routeManhattan(p, q, 0)).not.toBe(routeManhattan(p, q, 1));
  });
});
