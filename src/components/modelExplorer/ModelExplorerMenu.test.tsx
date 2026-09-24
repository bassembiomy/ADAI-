import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ModelExplorerMenu,
  filterMenuCapabilities,
  type MenuActionItem,
} from './ModelExplorerMenu';
import type {
  ModelTreeNode,
  ExplorerCapability,
} from '../../features/modelExplorer/modelExplorerTypes';

describe('ModelExplorerMenu', () => {
  const targetNode: ModelTreeNode = {
    nodeId: 'node-block-1',
    semanticId: 'block-1',
    domain: 'sysml',
    kind: 'block',
    label: 'FlightComputer',
    parentNodeId: 'root',
    childNodeIds: [],
    hasChildren: false,
  };

  const sampleCapabilities: ExplorerCapability[] = [
    {
      id: 'create-part',
      kind: 'createElement',
      label: 'Create Part Property',
      enabled: true,
      elementKind: 'part',
    },
    {
      id: 'create-port',
      kind: 'createElement',
      label: 'Create Full Port',
      enabled: true,
      elementKind: 'fullPort',
    },
    {
      id: 'create-ibd',
      kind: 'createDiagram',
      label: 'Create Internal Block Diagram',
      enabled: true,
      elementKind: 'ibd',
    },
    {
      id: 'rename',
      kind: 'rename',
      label: 'Rename',
      enabled: true,
    },
    {
      id: 'delete',
      kind: 'delete',
      label: 'Delete Element',
      enabled: true,
    },
    {
      id: 'disabled-action',
      kind: 'addToDiagram',
      label: 'Add to Diagram',
      enabled: false,
      reason: 'Already on active diagram',
    },
  ];

  it('renders menu with grouped actions and ARIA roles', () => {
    const html = renderToStaticMarkup(
      <ModelExplorerMenu
        x={100}
        y={150}
        targetNode={targetNode}
        capabilities={sampleCapabilities}
        onSelectCapability={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('role="menu"');
    expect(html).toContain('FlightComputer');
    expect(html).toContain('Create Part Property');
    expect(html).toContain('Create Internal Block Diagram');
    expect(html).toContain('Rename');
    expect(html).toContain('Delete Element');
    expect(html).toContain('aria-disabled="true"');
  });

  it('filters capabilities accurately based on search text', () => {
    const filtered = filterMenuCapabilities(sampleCapabilities, 'Port');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('create-port');

    const filteredDiagram = filterMenuCapabilities(sampleCapabilities, 'diagram');
    expect(filteredDiagram.length).toBeGreaterThanOrEqual(1);
  });

  it('renders disabled All Types entries with backend diagnostic message', () => {
    const capabilitiesWithDisabled: ExplorerCapability[] = [
      {
        id: 'create:PartProperty',
        kind: 'createElement',
        label: 'Part Property',
        enabled: true,
        elementKind: 'PartProperty',
      },
      {
        id: 'create:Requirement',
        kind: 'createElement',
        label: 'Requirement',
        enabled: false,
        elementKind: 'Requirement',
        diagnosticCode: 'ILLEGAL_OWNERSHIP',
        reason: 'Requirement cannot be owned by Block.',
      },
    ];

    const html = renderToStaticMarkup(
      <ModelExplorerMenu
        x={100}
        y={150}
        targetNode={targetNode}
        capabilities={capabilitiesWithDisabled}
        onSelectCapability={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('Requirement');
    expect(html).toContain('Requirement cannot be owned by Block.');
    expect(html).toContain('aria-disabled="true"');
  });
});
