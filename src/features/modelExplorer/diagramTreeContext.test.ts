import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from '../../engine/sysml/model';
import type { ModelTreeNode } from './modelExplorerTypes';
import type { StateMachineExplorerSnapshot } from './adapters/stateMachineExplorerAdapter';
import { buildDiagramVisualParentIndex, resolveDiagramSemanticOwner } from './diagramTreeContext';

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
});
