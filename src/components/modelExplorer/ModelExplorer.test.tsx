import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ModelExplorer } from './ModelExplorer';
import type { ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';

describe('ModelExplorer', () => {
  const nodesById = new Map<string, ModelTreeNode>([
    [
      'root',
      {
        nodeId: 'root',
        semanticId: 'pkg-root',
        domain: 'sysml',
        kind: 'package',
        label: 'RootPackage',
        parentNodeId: null,
        childNodeIds: ['block-a'],
        hasChildren: true,
      },
    ],
    [
      'block-a',
      {
        nodeId: 'block-a',
        semanticId: 'blk-a',
        domain: 'sysml',
        kind: 'block',
        label: 'FlightController',
        secondaryLabel: ': Block',
        parentNodeId: 'root',
        childNodeIds: [],
        hasChildren: false,
      },
    ],
  ]);

  it('renders the complete model explorer with toolbar and virtual tree', () => {
    const html = renderToStaticMarkup(
      <ModelExplorer
        nodesById={nodesById}
        rootNodeIds={['root']}
        selectedNodeIds={new Set(['block-a'])}
        onSelectNode={vi.fn()}
        height={400}
      />
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('role="tree"');
    expect(html).toContain('FlightController');
    expect(html).toContain('RootPackage');
    expect(html).toContain('aria-selected="true"');
  });

  it('renders empty placeholder when no nodes match', () => {
    const html = renderToStaticMarkup(
      <ModelExplorer
        nodesById={new Map()}
        rootNodeIds={[]}
        selectedNodeIds={new Set()}
        onSelectNode={vi.fn()}
        height={400}
      />
    );

    expect(html).toContain('Model is empty');
  });
});
