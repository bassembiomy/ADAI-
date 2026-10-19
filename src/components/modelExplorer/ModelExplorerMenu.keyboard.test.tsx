// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelExplorerMenu } from './ModelExplorerMenu';
import type { ExplorerCapability, ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';

afterEach(cleanup);

const targetNode: ModelTreeNode = {
  nodeId: 'n', semanticId: 'b', domain: 'sysml', kind: 'block', label: 'B', parentNodeId: 'root', childNodeIds: [], hasChildren: false,
};

// input order differs from display order: New, Diagram, Edit groups
const capabilities: ExplorerCapability[] = [
  { id: 'rename', kind: 'rename', label: 'Rename', enabled: true },
  { id: 'createA', kind: 'createElement', label: 'Create A', enabled: true, elementKind: 'a' },
  { id: 'diagram', kind: 'addToDiagram', label: 'Add to Diagram', enabled: false, reason: 'already shown' },
  { id: 'delete', kind: 'delete', label: 'Delete', enabled: true },
  { id: 'createB', kind: 'createElement', label: 'Create B', enabled: true, elementKind: 'b' },
];

function pressAndEnter(downs: number, ups = 0) {
  const onSelectCapability = vi.fn();
  render(<ModelExplorerMenu targetNode={targetNode} capabilities={capabilities} x={0} y={0} onSelectCapability={onSelectCapability} onClose={vi.fn()} />);
  for (let i = 0; i < downs; i++) fireEvent.keyDown(window, { key: 'ArrowDown' });
  for (let i = 0; i < ups; i++) fireEvent.keyDown(window, { key: 'ArrowUp' });
  fireEvent.keyDown(window, { key: 'Enter' });
  return onSelectCapability;
}

describe('ModelExplorerMenu keyboard navigation', () => {
  it('starts on the first displayed item, not the first input item', () => {
    expect(pressAndEnter(0)).toHaveBeenCalledWith(expect.objectContaining({ id: 'createA' }));
  });

  it('walks the items in display order and skips the disabled one', () => {
    expect(pressAndEnter(1)).toHaveBeenCalledWith(expect.objectContaining({ id: 'createB' }));
    expect(pressAndEnter(2)).toHaveBeenCalledWith(expect.objectContaining({ id: 'rename' }));
    expect(pressAndEnter(3)).toHaveBeenCalledWith(expect.objectContaining({ id: 'delete' }));
  });

  it('stops at the last item and walks back up in display order', () => {
    expect(pressAndEnter(9)).toHaveBeenCalledWith(expect.objectContaining({ id: 'delete' }));
    expect(pressAndEnter(3, 1)).toHaveBeenCalledWith(expect.objectContaining({ id: 'rename' }));
    expect(pressAndEnter(2, 1)).toHaveBeenCalledWith(expect.objectContaining({ id: 'createB' }));
  });
});
