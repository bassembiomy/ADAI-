// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { VirtualTree } from './VirtualTree';
import type { VisibleTreeRow } from '../../features/modelExplorer/modelExplorerTypes';

it('updates the row range without reading layout and still clamps user scrolling after shrink', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const rows: VisibleTreeRow[] = Array.from({ length: 40 }, (_, index) => ({ index, depth: 0,
    node: { nodeId: `row-${index}`, semanticId: `element-${index}`, domain: 'sysml', kind: 'block', label: `Block ${index}`, parentNodeId: null, childNodeIds: [], hasChildren: false },
  }));
  const tree = (visible: VisibleTreeRow[], focusedIndex = 0) => <VirtualTree rows={visible} height={130} rowHeight={26} focusedIndex={focusedIndex}
    onFocusIndex={() => {}} isExpanded={() => false} onToggleExpand={() => {}} renderRow={row => <span>{row.node.label}</span>} />;
  try {
    await act(async () => { root.render(tree(rows.slice(0, 10))); });
    const viewport = host.querySelector('[role="tree"]') as HTMLDivElement;
    let position = 0;
    const read = vi.fn(() => position);
    const write = vi.fn((value: number) => { position = value; });
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, get: read, set: write });
    await act(async () => { root.render(tree(rows)); });
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    await act(async () => { root.render(tree(rows, 30)); });
    expect(read).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(676);
    position = 520;
    await act(async () => { viewport.dispatchEvent(new Event('scroll')); });
    read.mockClear();
    await act(async () => { root.render(tree(rows.slice(0, 2))); });
    expect(read).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(0);
    expect(host.textContent).toContain('Block 0');
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
