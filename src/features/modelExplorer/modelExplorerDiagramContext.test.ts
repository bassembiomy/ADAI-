import { describe, expect, it } from 'vitest';
import type { ModelTreeNode, ModelTreeProjection } from './modelExplorerTypes';
import { getAncestorNodeIds, projectDiagramContext } from './modelExplorerDiagramContext';

const node = (
  nodeId: string,
  semanticId: string,
  parentNodeId: string | null,
  childNodeIds: string[],
  domain: ModelTreeNode['domain'] = 'project'
): ModelTreeNode => ({
  nodeId,
  semanticId,
  domain,
  kind: nodeId.startsWith('project:pillar:') ? 'pillar' : 'element',
  label: semanticId,
  parentNodeId,
  childNodeIds,
  hasChildren: childNodeIds.length > 0,
});

const createProjection = (): ModelTreeProjection => ({
  roots: ['project:model'],
  revision: 7,
  nodes: {
    'project:model': node(
      'project:model',
      'model',
      null,
      ['project:pillar:structural', 'project:pillar:behavior', 'project:pillar:requirements']
    ),
    'project:pillar:structural': node(
      'project:pillar:structural',
      'project:pillar:structural',
      'project:model',
      ['sysml:element:block-1']
    ),
    'sysml:element:block-1': node(
      'sysml:element:block-1',
      'block-1',
      'project:pillar:structural',
      [],
      'sysml'
    ),
    'project:pillar:behavior': node(
      'project:pillar:behavior',
      'project:pillar:behavior',
      'project:model',
      ['sm:machine:main']
    ),
    'sm:machine:main': node(
      'sm:machine:main',
      'machine-main',
      'project:pillar:behavior',
      ['sm:region:root'],
      'stateMachine'
    ),
    'sm:region:root': node(
      'sm:region:root',
      'region-root',
      'sm:machine:main',
      ['sm:state:run'],
      'stateMachine'
    ),
    'sm:state:run': node(
      'sm:state:run',
      'state-run',
      'sm:region:root',
      [],
      'stateMachine'
    ),
    'project:pillar:requirements': node(
      'project:pillar:requirements',
      'project:pillar:requirements',
      'project:model',
      ['sysml:element:req-1']
    ),
    'sysml:element:req-1': node(
      'sysml:element:req-1',
      'req-1',
      'project:pillar:requirements',
      [],
      'sysml'
    ),
  },
});

describe('getAncestorNodeIds', () => {
  it('returns a deterministic root-to-parent path for a semantic ID', () => {
    expect(getAncestorNodeIds(createProjection(), 'state-run')).toEqual([
      'project:model',
      'project:pillar:behavior',
      'sm:machine:main',
      'sm:region:root',
    ]);
  });

  it('returns an empty path when the semantic ID is absent', () => {
    expect(getAncestorNodeIds(createProjection(), 'missing')).toEqual([]);
  });
});

describe('projectDiagramContext', () => {
  it('keeps presented and context elements with their ancestor closure', () => {
    const filtered = projectDiagramContext(createProjection(), {
      diagramId: 'bdd-main',
      name: 'Main BDD',
      kind: 'bdd',
      domain: 'sysml',
      presentedSemanticIds: ['block-1'],
      contextSemanticIds: ['req-1'],
    });

    expect(Object.keys(filtered.nodes)).toEqual(expect.arrayContaining([
      'project:model',
      'project:pillar:structural',
      'sysml:element:block-1',
      'project:pillar:requirements',
      'sysml:element:req-1',
    ]));
    expect(filtered.nodes['project:model'].childNodeIds).toEqual([
      'project:pillar:structural',
      'project:pillar:requirements',
    ]);
    expect(filtered.nodes['project:pillar:structural'].hasChildren).toBe(true);
    expect(filtered.nodes['sysml:element:block-1'].childNodeIds).toEqual([]);
    expect(filtered.nodes['project:pillar:behavior']).toBeUndefined();
    expect(filtered.revision).toBe(7);
  });

  it('retains the complete State Machine owner path', () => {
    const filtered = projectDiagramContext(createProjection(), {
      diagramId: 'sm-main',
      name: 'Main State Machine',
      kind: 'stateMachine',
      domain: 'stateMachine',
      presentedSemanticIds: ['state-run'],
    });

    expect(Object.keys(filtered.nodes)).toEqual([
      'project:model',
      'project:pillar:behavior',
      'sm:machine:main',
      'sm:region:root',
      'sm:state:run',
    ]);
    expect(filtered.nodes['sm:region:root'].childNodeIds).toEqual(['sm:state:run']);
  });

  it('returns only an empty model scaffold when no semantic IDs match', () => {
    const filtered = projectDiagramContext(createProjection(), {
      diagramId: 'empty',
      name: 'Empty Diagram',
      kind: 'bdd',
      domain: 'sysml',
      presentedSemanticIds: ['missing'],
    });

    expect(filtered.roots).toEqual(['project:model']);
    expect(Object.keys(filtered.nodes)).toEqual(['project:model']);
    expect(filtered.nodes['project:model'].childNodeIds).toEqual([]);
    expect(filtered.nodes['project:model'].hasChildren).toBe(false);
  });
});
