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

import { parallelEdgeOffsets, rankNodes, routeEdgeLabelPoint } from './reportDiagramLayout';

describe('layoutLayered v2', () => {
  it('keeps the LR default output for a chain fixture unchanged (x by cumulative width + 64, y 0)', () => {
    const { nodes, edges } = chain();
    const placed = layoutLayered(nodes, edges, { rootIds: ['idle'] });
    let x = 0;
    for (const n of nodes) {
      expect(nodeById(placed, n.id)).toMatchObject({ x, y: 0 });
      x += n.width + 64;
    }
  });

  it('TB puts the first rank on top (supertype/whole above subtype/part) and centres ranks', () => {
    const nodes = ['top', 'a', 'b', 'c'].map(id => measureNode(id, [id], 'bdd', 96));
    const placed = layoutLayered(nodes, [{ sourceId: 'top', targetId: 'a' }, { sourceId: 'top', targetId: 'b' }, { sourceId: 'top', targetId: 'c' }], { direction: 'TB' });
    assertNoOverlaps(placed);
    const top = nodeById(placed, 'top')!;
    for (const id of ['a', 'b', 'c']) expect(nodeById(placed, id)!.y).toBeGreaterThan(top.y + top.height);
    const row = ['a', 'b', 'c'].map(id => nodeById(placed, id)!);
    const rowCentre = (Math.min(...row.map(r => r.x)) + Math.max(...row.map(r => r.x + r.width))) / 2;
    expect(Math.abs(top.x + top.width / 2 - rowCentre)).toBeLessThan(1);
  });

  it('barycentre sweeps remove the crossing in a known crossing fixture', () => {
    const nodes = ['a', 'b', 'c', 'd'].map(id => measureNode(id, [id], 'bdd', 96));
    // Input order a,b / c,d with a->d and b->c is a single crossing.
    const placed = layoutLayered(nodes, [{ sourceId: 'a', targetId: 'd' }, { sourceId: 'b', targetId: 'c' }], { direction: 'TB' });
    const x = (id: string) => nodeById(placed, id)!.x;
    expect((x('a') - x('b')) * (x('d') - x('c'))).toBeGreaterThan(0);
  });

  it('wraps a wide TB rank onto extra rows no wider than maxRowWidth', () => {
    const nodes = ['root', ...Array.from({ length: 8 }, (_, i) => `k${i}`)].map(id => measureNode(id, [id], 'bdd', 120));
    const edges = Array.from({ length: 8 }, (_, i) => ({ sourceId: 'root', targetId: `k${i}` }));
    const placed = layoutLayered(nodes, edges, { direction: 'TB', maxRowWidth: 400 });
    assertNoOverlaps(placed);
    const kids = placed.filter(p => p.id.startsWith('k'));
    expect(new Set(kids.map(k => k.y)).size).toBeGreaterThan(1);
    for (const k of kids) expect(k.x + k.width).toBeLessThanOrEqual(400 + 1);
  });

  it('breaks cycles with DFS back edges and honours roots', () => {
    const ranks = rankNodes([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [{ sourceId: 'a', targetId: 'b' }, { sourceId: 'b', targetId: 'c' }, { sourceId: 'c', targetId: 'a' }], ['a']);
    expect([ranks.get('a'), ranks.get('b'), ranks.get('c')]).toEqual([0, 1, 2]);
  });

  it('longest-path ranking pushes a node below all of its predecessors', () => {
    const ranks = rankNodes([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [{ sourceId: 'a', targetId: 'b' }, { sourceId: 'b', targetId: 'c' }, { sourceId: 'a', targetId: 'c' }]);
    expect(ranks.get('c')).toBe(2);
  });
});

describe('TB routing', () => {
  const top = { x: 0, y: 0, width: 100, height: 40 };
  const low = { x: 200, y: 120, width: 100, height: 40 };
  it('routes bottom-centre to top-centre with rounded orthogonal elbows', () => {
    const d = routeEdgePath(top, low, { direction: 'TB' });
    expect(d).toMatch(/^M 50 40 /);
    expect(d).toContain('Q');
    expect(d).toMatch(/250 120$/);
  });
  it('routes upward edges from the top of the lower node to the bottom of the upper node', () => {
    expect(routeEdgePath(low, top, { direction: 'TB' })).toMatch(/^M 250 120 .* 50 40$/);
  });
  it('offsets parallel edges and leaves the default routing untouched', () => {
    const offsets = parallelEdgeOffsets([{ id: 'x', sourceId: 'a', targetId: 'b' }, { id: 'y', sourceId: 'b', targetId: 'a' }]);
    expect(offsets.get('x')).not.toBe(offsets.get('y'));
    expect(routeEdgePath(top, low, { direction: 'TB', offset: offsets.get('x') })).not.toBe(routeEdgePath(top, low, { direction: 'TB', offset: offsets.get('y') }));
    expect(routeEdgePath(top, low)).toBe(routeEdgePath(top, low, { direction: undefined, offset: 0 }));
  });
  it('anchors labels on the horizontal run', () => {
    const p = routeEdgeLabelPoint(top, low);
    expect(p.anchor).toBeUndefined();
    expect(p.y).toBeLessThan(120);
  });
});
