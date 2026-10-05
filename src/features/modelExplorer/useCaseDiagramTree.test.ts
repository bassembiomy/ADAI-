import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { ensureDefaultSysmlDiagrams } from '../../services/sysmlDiagramWorkspace';
import { buildUnifiedModelProjection } from './unifiedModelExplorerProjection';

function useCaseModel() {
  const { repository } = ensureDefaultSysmlDiagrams(createEmptyRepository());
  repository.packages.pkg = { id: 'pkg', kind: 'package', name: 'Structural', namespace: [], ownerId: 'model' } as any;
  repository.actors.actor1 = { id: 'actor1', kind: 'actor', name: 'Actor_1', namespace: [], ownerId: 'pkg', isExternal: true, generalizationIds: [] };
  repository.actors.actor2 = { id: 'actor2', kind: 'actor', name: 'Actor_2', namespace: [], ownerId: 'pkg', isExternal: true, generalizationIds: [] };
  repository.useCases.uc1 = { id: 'uc1', kind: 'useCase', name: 'UseCase_1', namespace: [], ownerId: 'pkg', extensionPointIds: ['ep1'], behaviorArtifactIds: [] };
  repository.extensionPoints.ep1 = { id: 'ep1', kind: 'extensionPoint', name: 'EP', namespace: [], useCaseId: 'uc1' };
  repository.diagrams.ucd = { id: 'ucd', kind: 'diagram', name: 'UseCaseDiagram', namespace: [], ownerId: 'pkg', diagramKind: 'usecase' } as any;
  repository.relationships.assoc = { id: 'assoc', kind: 'useCaseAssociation', name: 'Use Case Association', sourceId: 'actor1', targetId: 'uc1' };
  repository.relationships.other = { id: 'other', kind: 'useCaseAssociation', name: 'Other', sourceId: 'actor2', targetId: 'uc1' };
  return repository;
}

const stateMachine = {
  states: [], layers: [{ id: 'root', name: 'Root', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] }],
  transitions: [], junctions: [], diagrams: [], revision: 1,
} as any;

describe('Use Case diagram grouping in the model tree', () => {
  it('shows presented actors, use cases and connecting relationships under the diagram', () => {
    const projection = buildUnifiedModelProjection({
      sysml: useCaseModel(), stateMachine, externalModels: [], revision: 1,
      diagramPresentations: { ucd: { elementIds: ['actor1', 'uc1'] } },
    });
    const diagram = projection.nodes['sysml:element:ucd'];
    expect(diagram.childNodeIds).toEqual(expect.arrayContaining([
      'sysml:element:actor1', 'sysml:element:uc1', 'sysml:element:assoc',
    ]));
    // Only one end of `other` is presented, so it is not drawn on this diagram.
    expect(diagram.childNodeIds).not.toContain('sysml:element:other');
    // Extension points stay with their owning Use Case, not the diagram.
    expect(projection.nodes['sysml:element:uc1'].childNodeIds).toContain('sysml:element:ep1');
    expect(diagram.childNodeIds).not.toContain('sysml:element:ep1');
  });

  it('keeps semantic ownership unchanged when grouping under the diagram', () => {
    const projection = buildUnifiedModelProjection({
      sysml: useCaseModel(), stateMachine, externalModels: [], revision: 1,
      diagramPresentations: { ucd: { elementIds: ['actor1', 'uc1'] } },
    });
    expect(projection.nodes['sysml:element:actor1'].ownerSemanticId).toBe('pkg');
    expect(projection.nodes['sysml:element:uc1'].parentNodeId).toBe('sysml:element:ucd');
  });

  it('does not draw an explicitly hidden relationship under the diagram', () => {
    const projection = buildUnifiedModelProjection({
      sysml: useCaseModel(), stateMachine, externalModels: [], revision: 1,
      diagramPresentations: { ucd: { elementIds: ['actor1', 'uc1'], hiddenElementIds: ['assoc'] } },
    });
    expect(projection.nodes['sysml:element:ucd'].childNodeIds).not.toContain('sysml:element:assoc');
  });

  it('still lists actors and use cases that no diagram presents, under their owner', () => {
    const projection = buildUnifiedModelProjection({ sysml: useCaseModel(), stateMachine, externalModels: [], revision: 1 });
    expect(projection.nodes['sysml:element:actor1'].parentNodeId).toBe('sysml:element:pkg');
    expect(projection.nodes['sysml:element:uc1'].parentNodeId).toBe('sysml:element:pkg');
  });
});
