import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ModelTreeRow, getNodeKindIcon } from './ModelTreeRow';
import type { ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';

describe('ModelTreeRow', () => {
  const nodeWithChildren: ModelTreeNode = {
    nodeId: 'node-1',
    semanticId: 'block-1',
    domain: 'sysml',
    kind: 'block',
    label: 'EngineBlock',
    secondaryLabel: ': Block',
    parentNodeId: null,
    childNodeIds: ['part-1'],
    hasChildren: true,
    badges: [{ label: '«block»', kind: 'info' }],
  };

  const leafNode: ModelTreeNode = {
    nodeId: 'node-2',
    semanticId: 'state-1',
    domain: 'stateMachine',
    kind: 'state',
    label: 'IdleState',
    parentNodeId: 'node-1',
    childNodeIds: [],
    hasChildren: false,
  };

  it('renders row label, secondaryLabel, badges, and chevron for nodes with children', () => {
    const html = renderToStaticMarkup(
      <ModelTreeRow
        node={nodeWithChildren}
        depth={0}
        index={0}
        isExpanded={false}
        isSelected={false}
        isFocused={true}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('EngineBlock');
    expect(html).toContain(': Block');
    expect(html).toContain('«block»');
    expect(html).toContain('aria-label="Expand"');
  });

  it('renders Collapse chevron when node is expanded', () => {
    const html = renderToStaticMarkup(
      <ModelTreeRow
        node={nodeWithChildren}
        depth={0}
        index={0}
        isExpanded={true}
        isSelected={true}
        isFocused={true}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Collapse"');
    expect(html).toContain('border-blue-500'); // Selected styling
  });

  it('renders leaf node without expand button', () => {
    const html = renderToStaticMarkup(
      <ModelTreeRow
        node={leafNode}
        depth={1}
        index={1}
        isExpanded={false}
        isSelected={false}
        isFocused={false}
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('IdleState');
    expect(html).not.toContain('aria-label="Expand"');
    expect(html).not.toContain('aria-label="Collapse"');
  });

  it('renders input element when isRenaming is true', () => {
    const html = renderToStaticMarkup(
      <ModelTreeRow
        node={nodeWithChildren}
        depth={0}
        index={0}
        isExpanded={false}
        isSelected={true}
        isFocused={true}
        isRenaming={true}
        renameValue="NewEngineName"
        onToggleExpand={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('<input');
    expect(html).toContain('value="NewEngineName"');
  });

  it('provides icons for domain metatypes', () => {
    const blockIconHtml = renderToStaticMarkup(getNodeKindIcon('block', 'sysml'));
    const stateIconHtml = renderToStaticMarkup(getNodeKindIcon('state', 'state_machine'));
    const diagramIconHtml = renderToStaticMarkup(getNodeKindIcon('diagram', 'sysml'));

    expect(blockIconHtml).toContain('<svg');
    expect(stateIconHtml).toContain('<svg');
    expect(diagramIconHtml).toContain('<svg');
  });
});
