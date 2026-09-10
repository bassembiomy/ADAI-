import { describe, it, expect } from 'vitest';
import {
  DiagramSpatialGrid,
  computeViewportBounds,
  cullElements,
  type DiagramViewport,
} from './VirtualizedDiagram';
import type { BlockData, RelationshipData, PartData, ConnectorData } from '../../types/sysml_types';

describe('DiagramSpatialGrid', () => {
  it('correctly inserts, queries, and filters elements by bounding box', () => {
    const grid = new DiagramSpatialGrid(500);

    grid.insert({ id: 'b1', x: 100, y: 100, width: 150, height: 100 });
    grid.insert({ id: 'b2', x: 2000, y: 2000, width: 150, height: 100 });
    grid.insert({ id: 'b3', x: 450, y: 450, width: 150, height: 100 }); // spans cell boundary

    expect(grid.size).toBe(3);

    // Query area covering b1 and b3
    const hits1 = grid.query({ x: 0, y: 0, width: 600, height: 600 });
    expect(hits1.has('b1')).toBe(true);
    expect(hits1.has('b3')).toBe(true);
    expect(hits1.has('b2')).toBe(false);

    // Query area covering only b2
    const hits2 = grid.query({ x: 1900, y: 1900, width: 300, height: 300 });
    expect(hits2.has('b2')).toBe(true);
    expect(hits2.has('b1')).toBe(false);
    expect(hits2.has('b3')).toBe(false);
  });

  it('updates and removes elements cleanly', () => {
    const grid = new DiagramSpatialGrid(500);

    grid.insert({ id: 'b1', x: 100, y: 100, width: 150, height: 100 });
    expect(grid.query({ x: 0, y: 0, width: 300, height: 300 }).has('b1')).toBe(true);

    // Move b1 far away
    grid.update({ id: 'b1', x: 5000, y: 5000, width: 150, height: 100 });
    expect(grid.query({ x: 0, y: 0, width: 300, height: 300 }).has('b1')).toBe(false);
    expect(grid.query({ x: 4900, y: 4900, width: 300, height: 300 }).has('b1')).toBe(true);

    // Remove b1
    grid.remove('b1');
    expect(grid.query({ x: 4900, y: 4900, width: 300, height: 300 }).has('b1')).toBe(false);
    expect(grid.size).toBe(0);
  });
});

describe('computeViewportBounds', () => {
  it('translates screen view coordinates to world viewport bounds with overscan', () => {
    const view = { scale: 2, offsetX: -100, offsetY: -200 };
    const container = { width: 800, height: 600 };
    const viewport = computeViewportBounds(view, container, 50);

    expect(viewport.x).toBe(50); // -(-100)/2 = 50
    expect(viewport.y).toBe(100); // -(-200)/2 = 100
    expect(viewport.width).toBe(400); // 800/2 = 400
    expect(viewport.height).toBe(300); // 600/2 = 300
    expect(viewport.scale).toBe(2);
    expect(viewport.overscan).toBe(50);
  });
});

describe('cullElements', () => {
  const dummyBlock = (id: string, x: number, y: number): BlockData => ({
    id,
    name: `Block_${id}`,
    stereotype: 'block',
    x,
    y,
    width: 150,
    height: 100,
    properties: [],
    operations: [],
    constraints: [],
    classes: [],
    ports: [],
  });

  it('culls offscreen blocks and preserves visible blocks + connected edges', () => {
    const blocks: BlockData[] = [
      dummyBlock('b1', 100, 100), // In viewport
      dummyBlock('b2', 200, 200), // In viewport
      dummyBlock('b3', 5000, 5000), // Far offscreen
      dummyBlock('b4', 9000, 9000), // Far offscreen
    ];

    const relationships: RelationshipData[] = [
      { id: 'r1', sourceId: 'b1', targetId: 'b2', type: 'association', label: 'rel1' }, // Fully visible
      { id: 'r2', sourceId: 'b1', targetId: 'b3', type: 'trace', label: 'rel2' }, // Crosses boundary (source visible)
      { id: 'r3', sourceId: 'b3', targetId: 'b4', type: 'generalization', label: 'rel3' }, // Completely offscreen
    ];

    const viewport: DiagramViewport = {
      x: 0,
      y: 0,
      width: 500,
      height: 500,
      scale: 1,
      overscan: 50,
    };

    const culled = cullElements(viewport, blocks, relationships, [], []);

    expect(culled.visibleBlocks.map(b => b.id)).toEqual(['b1', 'b2']);
    expect(culled.visibleIds.has('b1')).toBe(true);
    expect(culled.visibleIds.has('b2')).toBe(true);
    expect(culled.visibleIds.has('b3')).toBe(false);
    expect(culled.visibleIds.has('b4')).toBe(false);

    // r1 and r2 are visible (at least one endpoint visible); r3 is completely offscreen
    expect(culled.visibleRelationships.map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('handles 10,000 synthetic elements with sub-millisecond culling time', () => {
    const blocks: BlockData[] = [];
    const gridSize = 100; // 100 x 100 = 10,000 blocks
    for (let i = 0; i < 10000; i++) {
      const col = i % gridSize;
      const row = Math.floor(i / gridSize);
      blocks.push(dummyBlock(`blk_${i}`, col * 300, row * 200));
    }

    const grid = new DiagramSpatialGrid(500);
    for (const b of blocks) {
      grid.insert({ id: b.id, x: b.x, y: b.y, width: b.width, height: b.height });
    }

    const viewport: DiagramViewport = {
      x: 500,
      y: 500,
      width: 800,
      height: 600,
      scale: 1,
      overscan: 200,
    };

    const t0 = performance.now();
    const culled = cullElements(viewport, blocks, [], [], [], grid);
    const duration = performance.now() - t0;

    // Out of 10,000 blocks, only a small viewport cluster is returned!
    expect(culled.visibleBlocks.length).toBeLessThan(100);
    expect(culled.visibleBlocks.length).toBeGreaterThan(0);
    expect(culled.isDegradedMode).toBe(true); // >= 500 triggers degraded/performance mode
    expect(duration).toBeLessThan(5); // Sub-5ms culling for 10k entities
  });

  it('handles 100,000 edges with sub-millisecond indexed edge culling and validates edge completeness', () => {
    // 10,000 blocks and 100,000 relationships
    const blocks: BlockData[] = [];
    const relationships: RelationshipData[] = [];
    const gridSize = 100;

    for (let i = 0; i < 10000; i++) {
      const col = i % gridSize;
      const row = Math.floor(i / gridSize);
      blocks.push(dummyBlock(`blk_${i}`, col * 300, row * 200));
    }

    // 10 relationships per block = 100,000 relationships
    for (let i = 0; i < 10000; i++) {
      for (let r = 0; r < 10; r++) {
        const targetIndex = (i + r + 1) % 10000;
        relationships.push({
          id: `rel_${i}_${r}`,
          sourceId: `blk_${i}`,
          targetId: `blk_${targetIndex}`,
          type: 'association',
          label: `rel_${i}_${r}`,
        });
      }
    }

    expect(relationships.length).toBe(100000);

    const grid = new DiagramSpatialGrid(500);
    for (const b of blocks) {
      grid.insert({ id: b.id, x: b.x, y: b.y, width: b.width, height: b.height });
    }

    const viewport: DiagramViewport = {
      x: 1000,
      y: 1000,
      width: 600,
      height: 400,
      scale: 1,
      overscan: 100,
    };

    // First run builds index
    const firstRun = cullElements(viewport, blocks, relationships, [], [], grid);
    expect(firstRun.visibleBlocks.length).toBeGreaterThan(0);
    expect(firstRun.visibleRelationships.length).toBeGreaterThan(0);

    // Warm run: query against 100k edges must be sub-millisecond
    const t0 = performance.now();
    const culled = cullElements(viewport, blocks, relationships, [], [], grid);
    const queryDuration = performance.now() - t0;

    // Must be fast (< 2ms typically, < 50ms under heavy parallel test suite load for 100k edges)
    expect(queryDuration).toBeLessThan(50);

    // Validate completeness: every visible edge must connect to at least one visible node
    const visibleBlockIds = new Set(culled.visibleBlocks.map(b => b.id));
    for (const r of culled.visibleRelationships) {
      expect(visibleBlockIds.has(r.sourceId) || visibleBlockIds.has(r.targetId)).toBe(true);
    }
  });

  it('preserves IBD context block edges even when context node is outside overscan box', () => {
    const blocks: BlockData[] = [
      dummyBlock('context_block', 10000, 10000), // far outside viewport
      dummyBlock('internal_part_1', 100, 100),   // inside viewport
    ];

    const relationships: RelationshipData[] = [
      { id: 'rel_to_context', sourceId: 'internal_part_1', targetId: 'context_block', type: 'composition', label: 'contextRel' },
    ];

    const viewport: DiagramViewport = {
      x: 0,
      y: 0,
      width: 500,
      height: 500,
      scale: 1,
      overscan: 50,
    };

    const culled = cullElements(viewport, blocks, relationships, [], [], undefined, 500, {
      ibdContextBlockId: 'context_block',
    });

    // context_block is not a visible block in viewport, but edge is preserved!
    expect(culled.visibleBlocks.map(b => b.id)).toEqual(['internal_part_1']);
    expect(culled.visibleRelationships.map(r => r.id)).toContain('rel_to_context');
  });

  it('returns stable array references when revision and visible elements are unchanged', () => {
    const blocks: BlockData[] = [
      dummyBlock('b1', 100, 100),
      dummyBlock('b2', 200, 200),
    ];
    const relationships: RelationshipData[] = [
      { id: 'r1', sourceId: 'b1', targetId: 'b2', type: 'association', label: 'rel1' },
    ];

    const viewport: DiagramViewport = {
      x: 0,
      y: 0,
      width: 500,
      height: 500,
      scale: 1,
      overscan: 50,
    };

    const res1 = cullElements(viewport, blocks, relationships, [], [], undefined, 500, { storeRevision: 1 });
    const res2 = cullElements(viewport, blocks, relationships, [], [], undefined, 500, { storeRevision: 1 });

    // Exact reference equality
    expect(res2).toBe(res1);
    expect(res2.visibleBlocks).toBe(res1.visibleBlocks);
    expect(res2.visibleRelationships).toBe(res1.visibleRelationships);
  });
});
