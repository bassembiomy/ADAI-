import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from '../../engine/sysml/model';
import type { ModelTreeNode } from './modelExplorerTypes';
import type { StateMachineExplorerSnapshot } from './adapters/stateMachineExplorerAdapter';
import { buildDiagramVisualParentIndex, resolveCanvasSymbolDiagramTarget, resolveCanvasSymbolDiagramTargets, resolveDiagramSemanticOwner, resolveExactDiagramCanvasContext } from './diagramTreeContext';

function diagramNode(id: string, domain: 'sysml' | 'stateMachine'): ModelTreeNode {
  return {
    nodeId: domain === 'sysml' ? `sysml:element:${id}` : `sm:diagram:${id}`,
    semanticId: id,
    domain,
    kind: 'diagram',
    label: id,
    parentNodeId: domain === 'sysml' ? 'project:pillar:structural' : 'project:pillar:behavior',
    childNodeIds: [],
    hasChildren: false,
  };
}

function repositoryWithDiagrams(): SysmlRepository {
  const repository = createEmptyRepository();
  repository.definitions['block-1'] = {
    id: 'block-1', name: 'Engine', namespace: ['model'], ownerId: 'model', kind: 'block',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  };
  repository.requirements['req-1'] = {
    id: 'req-1', name: 'Safe Torque', namespace: ['model'], ownerId: 'model', kind: 'requirement',
    requirementId: 'REQ-1', text: 'safe', status: 'draft', version: '1',
  };
  repository.usages['constraint-1'] = {
    id: 'constraint-1', name: 'Torque Constraint', kind: 'part', ownerId: 'block-1', typeId: 'block-1',
    aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
  };
  repository.diagrams['bdd-1'] = {
    id: 'bdd-1', name: 'Engine BDD', namespace: [], ownerId: 'model', kind: 'diagram', diagramKind: 'bdd',
  };
  repository.diagrams['req-diagram-1'] = {
    id: 'req-diagram-1', name: 'Safety Requirements', namespace: [], ownerId: 'model', kind: 'diagram',
    diagramKind: 'requirements',
  };
  // The canonical SysML domain accepts a parametric DiagramKind; the legacy V3
  // record type is narrower than the domain it serializes.
  repository.diagrams['parametric-1'] = {
    id: 'parametric-1', name: 'Engine Parametric', namespace: [], ownerId: 'block-1', kind: 'diagram',
    diagramKind: 'parametric',
  } as unknown as SysmlRepository['diagrams'][string];
  return repository;
}

function stateMachineWithNestedDiagram(): StateMachineExplorerSnapshot {
  return {
    states: [],
    layers: [
      { id: 'root', name: 'Root Region', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] },
      { id: 'region-1', name: 'Region 1', parentStateId: 's1', stateIds: ['s2'], transitionIds: [], junctionIds: ['j1'] },
    ],
    transitions: [],
    junctions: [],
    diagrams: [{ id: 'nested-sm-1', name: 'Nested SM', ownerId: 'region-1', contextRegionId: 'region-1' }],
  };
}

describe('resolveDiagramSemanticOwner', () => {
  it('resolves each diagram family to a legal semantic owner, never to the diagram itself', () => {
    const repository = repositoryWithDiagrams();
    const stateMachine = stateMachineWithNestedDiagram();

    expect(resolveDiagramSemanticOwner(diagramNode('bdd-1', 'sysml'), repository, stateMachine)).toBe('model');
    expect(resolveDiagramSemanticOwner(diagramNode('req-diagram-1', 'sysml'), repository, stateMachine)).toBe('model');
    expect(resolveDiagramSemanticOwner(diagramNode('parametric-1', 'sysml'), repository, stateMachine)).toBe('block-1');
    expect(resolveDiagramSemanticOwner(diagramNode('nested-sm-1', 'stateMachine'), repository, stateMachine)).toBe('region-1');
  });

  it('falls back to the model for unknown SysML diagrams and to the root region for unknown SM diagrams', () => {
    const repository = createEmptyRepository();
    const stateMachine: StateMachineExplorerSnapshot = {
      states: [], layers: [], transitions: [], junctions: [], diagrams: [],
    };
    expect(resolveDiagramSemanticOwner(diagramNode('ghost', 'sysml'), repository, stateMachine)).toBe('model');
    expect(resolveDiagramSemanticOwner(diagramNode('ghost-sm', 'stateMachine'), repository, stateMachine)).toBe('root');
  });
});

describe('buildDiagramVisualParentIndex', () => {
  it('maps presented SysML elements to their diagram node', () => {
    const index = buildDiagramVisualParentIndex({
      sysml: repositoryWithDiagrams(),
      stateMachine: stateMachineWithNestedDiagram(),
      diagramPresentations: {
        'bdd-1': { elementIds: ['block-1'] },
        'req-diagram-1': { elementIds: ['req-1'] },
        'parametric-1': { elementIds: ['constraint-1'] },
      },
    });

    expect(index.get('block-1')).toBe('sysml:element:bdd-1');
    expect(index.get('req-1')).toBe('sysml:element:req-diagram-1');
    expect(index.get('constraint-1')).toBe('sysml:element:parametric-1');
  });

  it('maps states and junctions of a state-machine diagram to that diagram node', () => {
    const index = buildDiagramVisualParentIndex({
      sysml: createEmptyRepository(),
      stateMachine: stateMachineWithNestedDiagram(),
      diagramPresentations: {},
    });

    expect(index.get('s2')).toBe('sm:diagram:nested-sm-1');
    expect(index.get('j1')).toBe('sm:diagram:nested-sm-1');
  });

  it('ignores presentations whose diagram or element no longer resolves', () => {
    const index = buildDiagramVisualParentIndex({
      sysml: repositoryWithDiagrams(),
      stateMachine: stateMachineWithNestedDiagram(),
      diagramPresentations: {
        'deleted-diagram': { elementIds: ['block-1'] },
        'bdd-1': { elementIds: ['ghost-1', ''] },
      },
    });

    expect(index.get('ghost-1')).toBeUndefined();
    expect(index.has('')).toBe(false);
    // A stale diagram ID must not capture a semantic element that still exists.
    expect(index.has('block-1')).toBe(false);
  });

  it('lets the later diagram entry win deterministically', () => {
    const index = buildDiagramVisualParentIndex({
      sysml: repositoryWithDiagrams(),
      stateMachine: stateMachineWithNestedDiagram(),
      diagramPresentations: {
        'bdd-1': { elementIds: ['block-1'] },
        'req-diagram-1': { elementIds: ['block-1'] },
      },
    });

    expect(index.get('block-1')).toBe('sysml:element:req-diagram-1');
  });

  it('correctly maps relationships when explicitly presented, inferred from endpoints, or hidden', () => {
    const repo = repositoryWithDiagrams();
    repo.definitions['block-2'] = {
      id: 'block-2', name: 'Gearbox', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repo.relationships['rel-explicit'] = {
      id: 'rel-explicit', kind: 'association', sourceId: 'block-1', targetId: 'block-2',
    } as any;
    repo.relationships['rel-inferred'] = {
      id: 'rel-inferred', kind: 'dependency', sourceId: 'block-1', targetId: 'block-2',
    } as any;
    repo.relationships['rel-hidden'] = {
      id: 'rel-hidden', kind: 'generalization', sourceId: 'block-1', targetId: 'block-2',
    } as any;
    repo.relationships['rel-stale-endpoint'] = {
      id: 'rel-stale-endpoint', kind: 'association', sourceId: 'block-1', targetId: 'missing-block',
    } as any;

    const index = buildDiagramVisualParentIndex({
      sysml: repo,
      stateMachine: stateMachineWithNestedDiagram(),
      diagramPresentations: {
        'bdd-1': {
          elementIds: ['block-1', 'block-2', 'rel-explicit'],
          hiddenElementIds: ['rel-hidden'],
        },
      },
    });

    // rel-explicit is explicitly presented
    expect(index.get('rel-explicit')).toBe('sysml:element:bdd-1');
    // rel-inferred has both endpoints presented and is not hidden
    expect(index.get('rel-inferred')).toBe('sysml:element:bdd-1');
    // rel-hidden is hidden despite both endpoints presented
    expect(index.get('rel-hidden')).toBeUndefined();
    // rel-stale-endpoint does not have both endpoints presented
    expect(index.get('rel-stale-endpoint')).toBeUndefined();
  });

  it('handles multiple diagrams with later precedence for relationships and ignores missing diagrams', () => {
    const repo = repositoryWithDiagrams();
    repo.definitions['block-2'] = {
      id: 'block-2', name: 'Gearbox', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repo.relationships['rel-shared'] = {
      id: 'rel-shared', kind: 'association', sourceId: 'block-1', targetId: 'block-2',
    } as any;

    const index = buildDiagramVisualParentIndex({
      sysml: repo,
      stateMachine: stateMachineWithNestedDiagram(),
      diagramPresentations: {
        'bdd-1': { elementIds: ['block-1', 'block-2'] },
        'missing-diagram': { elementIds: ['block-1', 'block-2', 'rel-shared'] },
        'req-diagram-1': { elementIds: ['block-1', 'block-2'] },
      },
    });

    // req-diagram-1 comes after bdd-1; missing-diagram is ignored because it does not exist in repo.diagrams
    expect(index.get('rel-shared')).toBe('sysml:element:req-diagram-1');
  });
});

describe('resolveCanvasSymbolDiagramTarget', () => {
  it('prefers an explicit diagram reference over a uniquely owned diagram', () => {
    const repository = repositoryWithDiagrams();
    repository.diagrams['owned-ibd'] = {
      id: 'owned-ibd', name: 'Engine IBD', namespace: [], ownerId: 'block-1', kind: 'diagram', diagramKind: 'ibd',
    };
    repository.diagramReferences['engine-reference'] = {
      id: 'engine-reference', sourceElementId: 'block-1', diagramId: 'bdd-1',
      diagramKind: 'bdd', role: 'elaborates',
    };

    expect(resolveCanvasSymbolDiagramTarget('block-1', repository)).toBe('bdd-1');
  });

  it('opens only a unique owned diagram and rejects ambiguous candidates', () => {
    const repository = repositoryWithDiagrams();
    expect(resolveCanvasSymbolDiagramTarget('block-1', repository)).toBe('parametric-1');
    repository.diagrams['another-owned'] = {
      id: 'another-owned', name: 'Engine IBD', namespace: [], ownerId: 'block-1', kind: 'diagram', diagramKind: 'ibd',
    };
    expect(resolveCanvasSymbolDiagramTarget('block-1', repository)).toBeNull();
  });

  it('lists every owned diagram so the canvas can offer a chooser', () => {
    const repository = repositoryWithDiagrams();
    repository.diagrams['another-owned'] = {
      id: 'another-owned', name: 'Engine IBD', namespace: [], ownerId: 'block-1', kind: 'diagram', diagramKind: 'ibd',
    };
    expect(resolveCanvasSymbolDiagramTargets('block-1', repository).sort()).toEqual(['another-owned', 'parametric-1']);
    expect(resolveCanvasSymbolDiagramTargets('missing-block', repository)).toEqual([]);
  });

  it('does not navigate unknown symbols, stale references, or conflicting explicit references', () => {
    const repository = repositoryWithDiagrams();
    expect(resolveCanvasSymbolDiagramTarget('missing-block', repository)).toBeNull();
    repository.diagramReferences['stale'] = {
      id: 'stale', sourceElementId: 'block-1', diagramId: 'missing-diagram', diagramKind: 'bdd', role: 'elaborates',
    };
    expect(resolveCanvasSymbolDiagramTarget('block-1', repository)).toBeNull();
    repository.diagramReferences['second'] = {
      id: 'second', sourceElementId: 'block-1', diagramId: 'bdd-1', diagramKind: 'bdd', role: 'elaborates',
    };
    expect(resolveCanvasSymbolDiagramTarget('block-1', repository)).toBeNull();
  });

  it('resolves a state through its uniquely owned nested region diagram', () => {
    const stateMachine = stateMachineWithNestedDiagram();
    stateMachine.layers[1].parentStateId = 'state-1';
    stateMachine.states.push({ id: 'state-1' } as StateMachineExplorerSnapshot['states'][number]);
    expect(resolveCanvasSymbolDiagramTarget('state-1', createEmptyRepository(), stateMachine)).toBe('nested-sm-1');
    stateMachine.diagrams!.push({ id: 'second-sm', name: 'Other', ownerId: 'region-1', contextRegionId: 'region-1' });
    expect(resolveCanvasSymbolDiagramTarget('state-1', createEmptyRepository(), stateMachine)).toBeNull();
  });
});

describe('resolveExactDiagramCanvasContext', () => {
  it('restores an IBD context from its exact diagram rather than the prior canvas', () => {
    const repository = repositoryWithDiagrams();
    repository.diagrams['engine-ibd'] = {
      id: 'engine-ibd', name: 'Engine IBD', namespace: [], ownerId: 'block-1', kind: 'diagram', diagramKind: 'ibd',
      contextElementId: 'block-1',
    };
    expect(resolveExactDiagramCanvasContext('engine-ibd', repository)).toEqual({
      layerId: 'block-1', layerStack: ['root'], layerPath: ['Root', 'Engine'],
    });
    expect(resolveExactDiagramCanvasContext('bdd-1', repository)).toEqual({
      layerId: 'root', layerStack: [], layerPath: ['Root'],
    });
  });

  it('restores nested State Machine breadcrumbs from the destination region', () => {
    const snapshot = stateMachineWithNestedDiagram();
    snapshot.states.push({ id: 'outer', name: 'Outer', parentId: 'root' } as StateMachineExplorerSnapshot['states'][number]);
    snapshot.states.push({ id: 'inner', name: 'Inner', parentId: 'region-1' } as StateMachineExplorerSnapshot['states'][number]);
    snapshot.layers[1].parentStateId = 'outer';
    snapshot.layers.push({ id: 'region-2', name: 'Inner Region', parentStateId: 'inner', stateIds: [], transitionIds: [], junctionIds: [] });
    snapshot.diagrams!.push({ id: 'deep-sm', name: 'Deep SM', ownerId: 'region-2', contextRegionId: 'region-2' });

    expect(resolveExactDiagramCanvasContext('deep-sm', createEmptyRepository(), snapshot)).toEqual({
      layerId: 'region-2', layerStack: ['root', 'region-1'], layerPath: ['Root', 'Outer', 'Inner'],
    });
    expect(resolveExactDiagramCanvasContext('missing', createEmptyRepository(), snapshot)).toBeNull();
    snapshot.diagrams!.push({ id: 'stale-sm', name: 'Stale SM', ownerId: 'absent', contextRegionId: 'absent' });
    expect(resolveExactDiagramCanvasContext('stale-sm', createEmptyRepository(), snapshot)).toBeNull();
  });
});
