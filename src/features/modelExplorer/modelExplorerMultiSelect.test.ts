import { describe, expect, it } from 'vitest';
import {
  computeRangeSelection,
  computeToggleSelection,
  computeMultiSelectForest,
  persistExplorerUiState,
  loadPersistedExplorerUiState,
} from './modelExplorerMultiSelect';
import type { VisibleTreeRow, ModelTreeNode } from './modelExplorerTypes';

describe('modelExplorerMultiSelect & persistence', () => {
  const sampleNodes: Record<string, ModelTreeNode> = {
    pkg: {
      nodeId: 'pkg',
      semanticId: 'pkg-1',
      domain: 'sysml',
      kind: 'package',
      label: 'MainPackage',
      parentNodeId: null,
      childNodeIds: ['b1', 'b2'],
      hasChildren: true,
    },
    b1: {
      nodeId: 'b1',
      semanticId: 'b-1',
      domain: 'sysml',
      kind: 'block',
      label: 'Block1',
      parentNodeId: 'pkg',
      childNodeIds: ['part1'],
      hasChildren: true,
    },
    part1: {
      nodeId: 'part1',
      semanticId: 'part-1',
      domain: 'sysml',
      kind: 'part',
      label: 'Part1',
      parentNodeId: 'b1',
      childNodeIds: [],
      hasChildren: false,
    },
    b2: {
      nodeId: 'b2',
      semanticId: 'b-2',
      domain: 'sysml',
      kind: 'block',
      label: 'Block2',
      parentNodeId: 'pkg',
      childNodeIds: [],
      hasChildren: false,
    },
  };

  const sampleRows: VisibleTreeRow[] = [
    { node: sampleNodes.pkg, depth: 0, index: 0 },
    { node: sampleNodes.b1, depth: 1, index: 1 },
    { node: sampleNodes.part1, depth: 2, index: 2 },
    { node: sampleNodes.b2, depth: 1, index: 3 },
  ];

  it('computes range selection between two rows accurately', () => {
    const range = computeRangeSelection(sampleRows, 'b1', 'b2');
    expect(range).toEqual(['b-1', 'part-1', 'b-2']);

    const reverseRange = computeRangeSelection(sampleRows, 'b2', 'b1');
    expect(reverseRange).toEqual(['b-1', 'part-1', 'b-2']);
  });

  it('toggles selection when Ctrl-clicking', () => {
    const afterAdd = computeToggleSelection(['b-1'], 'b-2');
    expect(afterAdd).toEqual(['b-1', 'b-2']);

    const afterRemove = computeToggleSelection(['b-1', 'b-2'], 'b-1');
    expect(afterRemove).toEqual(['b-2']);
  });

  it('prunes descendant nodes from multi-selection to produce minimal root forest', () => {
    // If both 'b-1' and 'part-1' are selected, only 'b-1' should be copied/moved
    const forest = computeMultiSelectForest(['b-1', 'part-1'], sampleNodes);
    expect(forest).toEqual(['b-1']);

    // If disjoint nodes 'b-1' and 'b-2' are selected, both are roots
    const disjoint = computeMultiSelectForest(['b-1', 'b-2'], sampleNodes);
    expect(disjoint).toContain('b-1');
    expect(disjoint).toContain('b-2');
  });

  it('persists and restores explorer UI state safely with localStorage fallback', () => {
    const stateToSave = {
      favorites: ['b-1'],
      recentSemanticIds: ['b-1', 'b-2'],
      expandedNodeIds: ['pkg', 'b1'],
      activeView: 'containment' as const,
    };

    persistExplorerUiState('test-project-1', stateToSave);
    const restored = loadPersistedExplorerUiState('test-project-1');

    expect(restored).not.toBeNull();
    expect(restored?.favorites).toEqual(['b-1']);
    expect(restored?.recentSemanticIds).toEqual(['b-1', 'b-2']);
    expect(restored?.expandedNodeIds).toEqual(['pkg', 'b1']);
  });
});
