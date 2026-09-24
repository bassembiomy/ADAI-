import { describe, expect, it } from 'vitest';
import { flattenVisibleTree, filterProjection } from './modelExplorerProjection';
import type { ModelTreeNode, ModelTreeProjection } from './modelExplorerTypes';

const projection: ModelTreeProjection = {
  roots: ['root'],
  nodes: {
    root: {
      nodeId: 'root',
      semanticId: 'model',
      domain: 'sysml',
      kind: 'model',
      label: 'Model',
      parentNodeId: null,
      childNodeIds: ['b', 'a'],
      hasChildren: true,
    },
    a: {
      nodeId: 'a',
      semanticId: 'a',
      domain: 'sysml',
      kind: 'block',
      label: 'Alpha',
      parentNodeId: 'root',
      childNodeIds: [],
      hasChildren: false,
    },
    b: {
      nodeId: 'b',
      semanticId: 'b',
      domain: 'sysml',
      kind: 'block',
      label: 'Beta',
      parentNodeId: 'root',
      childNodeIds: [],
      hasChildren: false,
    },
  },
  revision: 1,
};

describe('modelExplorerProjection', () => {
  it('supports unified project pillar metadata', () => {
    const pillar: ModelTreeNode = {
      nodeId: 'project:pillar:behavior',
      semanticId: 'project:pillar:behavior',
      domain: 'project',
      kind: 'pillar',
      virtualKind: 'behavior',
      label: 'Behavior',
      parentNodeId: 'project:model',
      ownerSemanticId: 'project:model',
      childNodeIds: [],
      hasChildren: false,
      readOnly: true,
    };

    expect(pillar.virtualKind).toBe('behavior');
  });

  it('flattens expanded nodes in deterministic label order', () => {
    expect(flattenVisibleTree(projection, new Set(['root'])).map(row => [row.node.semanticId, row.depth]))
      .toEqual([['model', 0], ['a', 1], ['b', 1]]);
  });

  it('flattens with unexpanded root showing only root', () => {
    expect(flattenVisibleTree(projection, new Set()).map(row => [row.node.semanticId, row.depth]))
      .toEqual([['model', 0]]);
  });

  it('retains ancestor paths for search matches', () => {
    const filtered = filterProjection(projection, 'beta');
    expect(filtered.roots).toEqual(['root']);
    expect(filtered.nodes.root.childNodeIds).toEqual(['b']);
    expect(filtered.nodes.b).toBeDefined();
    expect(filtered.nodes.a).toBeUndefined();
  });

  it('returns exact projection if query is empty or blank', () => {
    const filtered = filterProjection(projection, '   ');
    expect(filtered).toEqual(projection);
  });

  it('filters by secondaryLabel and kind', () => {
    const complexProjection: ModelTreeProjection = {
      roots: ['root'],
      nodes: {
        root: {
          nodeId: 'root',
          semanticId: 'pkg1',
          domain: 'sysml',
          kind: 'package',
          label: 'Packages',
          parentNodeId: null,
          childNodeIds: ['c1', 'c2'],
          hasChildren: true,
        },
        c1: {
          nodeId: 'c1',
          semanticId: 'p1',
          domain: 'sysml',
          kind: 'part',
          label: 'Engine',
          secondaryLabel: 'InternalCombustion',
          parentNodeId: 'root',
          childNodeIds: [],
          hasChildren: false,
        },
        c2: {
          nodeId: 'c2',
          semanticId: 'p2',
          domain: 'sysml',
          kind: 'port',
          label: 'FuelIn',
          parentNodeId: 'root',
          childNodeIds: [],
          hasChildren: false,
        },
      },
      revision: 2,
    };

    const matchSecondary = filterProjection(complexProjection, 'combustion');
    expect(matchSecondary.nodes.root.childNodeIds).toEqual(['c1']);

    const matchKind = filterProjection(complexProjection, 'port');
    expect(matchKind.nodes.root.childNodeIds).toEqual(['c2']);
  });
});
