import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RelationshipWizard } from './RelationshipWizard';
import type { ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';

describe('RelationshipWizard', () => {
  const sourceNode: ModelTreeNode = {
    nodeId: 'node-block-1',
    semanticId: 'block-1',
    domain: 'sysml',
    kind: 'block',
    label: 'Engine',
    parentNodeId: 'root',
    childNodeIds: [],
    hasChildren: false,
  };

  const targetCandidates: ModelTreeNode[] = [
    {
      nodeId: 'node-block-2',
      semanticId: 'block-2',
      domain: 'sysml',
      kind: 'block',
      label: 'Transmission',
      parentNodeId: 'root',
      childNodeIds: [],
      hasChildren: false,
    },
    {
      nodeId: 'node-req-1',
      semanticId: 'req-1',
      domain: 'sysml',
      kind: 'requirement',
      label: 'Performance Requirement',
      parentNodeId: 'root',
      childNodeIds: [],
      hasChildren: false,
    },
  ];

  it('renders relationship wizard with allowed kinds and target candidates', () => {
    const html = renderToStaticMarkup(
      <RelationshipWizard
        isOpen={true}
        sourceNode={sourceNode}
        targetCandidates={targetCandidates}
        allowedRelationshipKinds={['composition', 'generalization', 'satisfy']}
        onClose={vi.fn()}
        onCreateRelationship={vi.fn()}
      />
    );

    expect(html).toContain('Create Relationship');
    expect(html).toContain('Engine');
    expect(html).toContain('Transmission');
    expect(html).toContain('Composition');
    expect(html).toContain('Satisfy');
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <RelationshipWizard
        isOpen={false}
        sourceNode={sourceNode}
        targetCandidates={targetCandidates}
        allowedRelationshipKinds={['composition']}
        onClose={vi.fn()}
        onCreateRelationship={vi.fn()}
      />
    );

    expect(html).toBe('');
  });
});
