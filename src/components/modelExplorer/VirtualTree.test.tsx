import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  VirtualTree,
  computeVirtualTreeWindow,
  handleTreeKeyNavigation,
} from './VirtualTree';
import type { VisibleTreeRow } from '../../features/modelExplorer/modelExplorerTypes';

describe('VirtualTree', () => {
  const sampleRows: VisibleTreeRow[] = [
    {
      node: {
        nodeId: 'root',
        semanticId: 'model',
        domain: 'sysml',
        kind: 'model',
        label: 'Model',
        parentNodeId: null,
        childNodeIds: ['a'],
        hasChildren: true,
      },
      depth: 0,
      index: 0,
    },
    {
      node: {
        nodeId: 'a',
        semanticId: 'alpha',
        domain: 'sysml',
        kind: 'block',
        label: 'Alpha',
        parentNodeId: 'root',
        childNodeIds: [],
        hasChildren: false,
      },
      depth: 1,
      index: 1,
    },
  ];

  it('renders accessible tree semantics with ARIA roles and labels', () => {
    const html = renderToStaticMarkup(
      <VirtualTree
        rows={sampleRows}
        height={300}
        rowHeight={30}
        focusedIndex={0}
        onFocusIndex={() => {}}
        isExpanded={(row: VisibleTreeRow) => row.node.nodeId === 'root'}
        onToggleExpand={() => {}}
        renderRow={(row: VisibleTreeRow) => <div>{row.node.label}</div>}
      />
    );

    expect(html).toContain('role="tree"');
    expect(html).toContain('role="treeitem"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Model');
  });

  it('computes correct virtual window for 10,000 items', () => {
    const window = computeVirtualTreeWindow({
      totalRows: 10_000,
      scrollTop: 1200,
      containerHeight: 320,
      rowHeight: 24,
      overscan: 5,
    });

    // 1200 / 24 = 50. With overscan 5: start 45.
    // 320 / 24 = 14 visible rows. End: 50 + 14 + 5 = 69.
    expect(window.startIndex).toBe(45);
    expect(window.endIndex).toBe(69);
    expect(window.endIndex - window.startIndex).toBeLessThan(50);
    expect(window.totalHeight).toBe(240_000);
  });

  it('moves focus and expands with tree keyboard semantics', () => {
    const onFocus = vi.fn();
    const onExpand = vi.fn();
    const onCollapse = vi.fn();

    // ArrowRight on closed node with children triggers onExpand
    const handledRight = handleTreeKeyNavigation({
      key: 'ArrowRight',
      focusedIndex: 0,
      totalRows: 2,
      isExpanded: false,
      hasChildren: true,
      onExpand,
      onCollapse,
      onFocusIndex: onFocus,
    });
    expect(handledRight).toBe(true);
    expect(onExpand).toHaveBeenCalled();

    // ArrowDown moves focus index
    const handledDown = handleTreeKeyNavigation({
      key: 'ArrowDown',
      focusedIndex: 0,
      totalRows: 2,
      isExpanded: true,
      hasChildren: true,
      onExpand,
      onCollapse,
      onFocusIndex: onFocus,
    });
    expect(handledDown).toBe(true);
    expect(onFocus).toHaveBeenCalledWith(1);
  });
});
