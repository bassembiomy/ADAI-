import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from '../../engine/sysml/model';
import type { ModelTreeNode } from './modelExplorerTypes';
import type { StateMachineExplorerSnapshot } from './adapters/stateMachineExplorerAdapter';
import { resolveCanvasSymbolDiagramTarget, resolveCanvasSymbolDiagramTargets, resolveDiagramSemanticOwner, resolveExactDiagramCanvasContext, resolveTreeOpenTarget } from './diagramTreeContext';

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

describe('resolveTreeOpenTarget', () => {
  const repo = () => {
    const r = createEmptyRepository();
    r.packages.reqs = { id: 'reqs', name: 'Reqs', kind: 'package', namespace: [], ownerId: 'model' };
    r.definitions.b1 = {
      id: 'b1', name: 'B1', namespace: [], ownerId: 'model', kind: 'block', isAbstract: false, isLeaf: false,
      properties: [{ id: 'b1.p', name: 'p', kind: 'value', typeId: '', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
      ports: [], operations: [], constraints: [],
    };
    r.requirements.r1 = { id: 'r1', name: 'R1', namespace: [], ownerId: 'reqs', kind: 'requirement', requirementId: 'R-1', text: 't', status: 'draft', version: '1' };
    r.relationships.sat = { id: 'sat', kind: 'satisfy', sourceId: 'b1', targetId: 'r1' };
    r.diagrams.bdd = { id: 'bdd', name: 'BDD', namespace: [], ownerId: 'model', kind: 'diagram', diagramKind: 'bdd' };
    r.diagrams.reqA = { id: 'reqA', name: 'REQ A', namespace: [], ownerId: 'reqs', kind: 'diagram', diagramKind: 'requirements' };
    r.diagrams.reqB = { id: 'reqB', name: 'REQ B', namespace: [], ownerId: 'reqs', kind: 'diagram', diagramKind: 'requirements' };
    return r;
  };
  const presentations = { bdd: { elementIds: ['b1'] }, reqA: { elementIds: ['b1', 'r1'] }, reqB: { elementIds: ['r1'] } };
  const sm: StateMachineExplorerSnapshot = {
    states: [
      { id: 'outer', name: 'Outer', parentId: 'root' } as never,
      { id: 'inner', name: 'Inner', parentId: 'outerRegion' } as never,
    ],
    layers: [
      { id: 'root', name: 'Root', parentStateId: null, stateIds: ['outer'], transitionIds: [], junctionIds: [] },
      { id: 'outerRegion', name: 'Outer', parentStateId: 'outer', stateIds: ['inner'], transitionIds: [], junctionIds: [] },
    ],
    transitions: [], junctions: [], revision: 1,
    diagrams: [{ id: 'smRoot', name: 'Main', ownerId: 'root', contextRegionId: 'root' }],
  };

  it('opens a diagram row as itself', () => {
    expect(resolveTreeOpenTarget('reqA', repo(), presentations, sm)).toEqual({ kind: 'diagram', diagramId: 'reqA', selectId: 'reqA' });
  });

  it('opens an element on the diagram of the clicked reference row, else on the shown diagram, else on the last that presents it', () => {
    expect(resolveTreeOpenTarget('r1', repo(), presentations, sm, { preferredDiagramId: 'reqA' })).toMatchObject({ diagramId: 'reqA', selectId: 'r1' });
    expect(resolveTreeOpenTarget('r1', repo(), presentations, sm, { activeDiagramId: 'reqA' })).toMatchObject({ diagramId: 'reqA' });
    expect(resolveTreeOpenTarget('r1', repo(), presentations, sm)).toMatchObject({ diagramId: 'reqB' });
  });

  it('opens a feature through its block and a relationship where both ends are shown', () => {
    expect(resolveTreeOpenTarget('b1.p', repo(), presentations, sm, { activeDiagramId: 'bdd' })).toEqual({ kind: 'diagram', diagramId: 'bdd', selectId: 'b1' });
    expect(resolveTreeOpenTarget('sat', repo(), presentations, sm)).toEqual({ kind: 'diagram', diagramId: 'reqA', selectId: 'sat' });
  });

  it('opens a state in the region that holds it', () => {
    expect(resolveTreeOpenTarget('outer', repo(), presentations, sm)).toEqual({ kind: 'diagram', diagramId: 'smRoot', selectId: 'outer' });
    expect(resolveTreeOpenTarget('inner', repo(), presentations, sm)).toEqual({
      kind: 'region', selectId: 'inner', context: { layerId: 'outerRegion', layerStack: ['root'], layerPath: ['Root', 'Outer'] },
    });
  });
});
