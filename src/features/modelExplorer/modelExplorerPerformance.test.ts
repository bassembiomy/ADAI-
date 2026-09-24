import { describe, expect, it } from 'vitest';
import type { ModelTreeNode } from './modelExplorerTypes';
import { projectModelTree } from './modelExplorerProjection';
import { computeMultiSelectForest } from './modelExplorerMultiSelect';

describe('Model Explorer Performance Gates (10,000 elements)', () => {
  // Generate synthetic 10,000-element tree
  const TOTAL_ELEMENTS = 10_000;
  const nodesById: Record<string, ModelTreeNode> = {};
  const rootNodeIds: string[] = [];

  const ROOT_COUNT = 10;
  for (let r = 0; r < ROOT_COUNT; r++) {
    const rootId = `pkg_root_${r}`;
    rootNodeIds.push(rootId);
    nodesById[rootId] = {
      nodeId: rootId,
      semanticId: rootId,
      domain: 'sysml',
      kind: 'package',
      label: `Package_${r}`,
      parentNodeId: null,
      childNodeIds: [],
      hasChildren: true,
    };
  }

  // Distribute 9,990 child elements among roots
  for (let i = ROOT_COUNT; i < TOTAL_ELEMENTS; i++) {
    const parentId = `pkg_root_${i % ROOT_COUNT}`;
    const id = `elem_${i}`;
    nodesById[id] = {
      nodeId: id,
      semanticId: id,
      domain: 'sysml',
      kind: i % 2 === 0 ? 'block' : 'part',
      label: `Element_${i}`,
      parentNodeId: parentId,
      childNodeIds: [],
      hasChildren: false,
    };
    nodesById[parentId].childNodeIds.push(id);
  }

  it('projects and flattens 10,000-element tree within deterministic performance budget (< 100ms)', () => {
    // Expand first 5 roots (contains approx 5,000 visible elements)
    const expandedNodeIds = new Set(rootNodeIds.slice(0, 5));

    const startTime = performance.now();
    const rows = projectModelTree({
      nodesById,
      rootNodeIds,
      expandedNodeIds,
    });
    const duration = performance.now() - startTime;

    expect(rows.length).toBeGreaterThan(4500);
    // Budget: 100ms max (usually < 25ms)
    expect(duration).toBeLessThan(100);
  });

  it('filters 10,000-element tree by search query within performance budget (< 100ms)', () => {
    const expandedNodeIds = new Set(rootNodeIds);

    const startTime = performance.now();
    const rows = projectModelTree({
      nodesById,
      rootNodeIds,
      expandedNodeIds,
      filterQuery: 'Element_99',
    });
    const duration = performance.now() - startTime;

    expect(rows.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(100);
  });

  it('computes multi-select forest across 1,000 selected elements rapidly (< 50ms)', () => {
    // Select 1,000 random items (both parents and children)
    const selectedIds = [
      ...rootNodeIds.slice(0, 3),
      ...nodesById['pkg_root_0'].childNodeIds.slice(0, 500),
      ...nodesById['pkg_root_5'].childNodeIds.slice(0, 497),
    ];

    const startTime = performance.now();
    const forest = computeMultiSelectForest(selectedIds, nodesById);
    const duration = performance.now() - startTime;

    // Root 0 was selected, so its children should be pruned
    expect(forest).toContain('pkg_root_0');
    expect(forest).not.toContain(nodesById['pkg_root_0'].childNodeIds[0]);

    // Root 5 was not selected, so its children should be present in the forest
    expect(forest).toContain(nodesById['pkg_root_5'].childNodeIds[0]);

    expect(duration).toBeLessThan(50);
  });
});
