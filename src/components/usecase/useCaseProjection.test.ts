import { describe, expect, it } from 'vitest';
import {
  projectUseCaseDiagram,
  buildPresentationPatch,
} from './useCaseProjection';
import {
  createEmptyRepository,
  type SysmlRepository,
  type ActorDefinition,
  type SubjectDefinition,
  type UseCaseDefinition,
  type ExtensionPoint,
  type SysmlRelationship,
} from '../../engine/sysml/model';

describe('SysML Use-Case Diagram Projection', () => {
  function createSampleRepository(): SysmlRepository {
    const repo = createEmptyRepository();
    const actor: ActorDefinition = {
      id: 'act-pilot',
      name: 'Pilot',
      kind: 'actor',
      namespace: [],
      isExternal: true,
      generalizationIds: [],
    };
    const subject: SubjectDefinition = {
      id: 'sub-uav',
      name: 'UAV System',
      kind: 'subject',
      namespace: [],
      representedBlockId: 'blk-uav',
    };
    const uc1: UseCaseDefinition = {
      id: 'uc-mission',
      name: 'Execute Mission',
      kind: 'useCase',
      namespace: [],
      subjectId: 'sub-uav',
      extensionPointIds: ['ep-abort'],
      behaviorArtifactIds: [],
    };
    const uc2: UseCaseDefinition = {
      id: 'uc-abort',
      name: 'Abort Mission',
      kind: 'useCase',
      namespace: [],
      subjectId: 'sub-uav',
      extensionPointIds: [],
      behaviorArtifactIds: [],
    };
    const ep: ExtensionPoint = {
      id: 'ep-abort',
      name: 'OnEngineFailure',
      kind: 'extensionPoint',
      namespace: [],
      useCaseId: 'uc-mission',
    };
    const relAssoc: SysmlRelationship = {
      id: 'rel-1',
      kind: 'useCaseAssociation',
      sourceId: 'act-pilot',
      targetId: 'uc-mission',
    };
    const relExtend: SysmlRelationship = {
      id: 'rel-2',
      kind: 'extend',
      sourceId: 'uc-abort',
      targetId: 'uc-mission',
    };

    repo.actors[actor.id] = actor;
    repo.subjects[subject.id] = subject;
    repo.useCases[uc1.id] = uc1;
    repo.useCases[uc2.id] = uc2;
    repo.extensionPoints[ep.id] = ep;
    repo.relationships[relAssoc.id] = relAssoc;
    repo.relationships[relExtend.id] = relExtend;
    return repo;
  }

  it('projects canonical repository entities into React Flow nodes and edges', () => {
    const repo = createSampleRepository();
    const coordinates = {
      'act-pilot': { x: 50, y: 100, width: 80, height: 100 },
      'sub-uav': { x: 200, y: 50, width: 400, height: 350 },
      'uc-mission': { x: 250, y: 100, width: 150, height: 75 },
      'uc-abort': { x: 250, y: 220, width: 150, height: 75 },
    };

    const projection = projectUseCaseDiagram(repo, {
      coordinates,
      activeDiagramId: 'diag-uc-main',
    });

    // Check Nodes
    expect(projection.nodes.length).toBe(4);
    const actorNode = projection.nodes.find(n => n.id === 'act-pilot');
    expect(actorNode).toBeDefined();
    expect(actorNode?.type).toBe('actor');
    expect(actorNode?.position).toEqual({ x: 50, y: 100 });
    expect(actorNode?.data.label).toBe('Pilot');
    expect(actorNode?.data.isExternal).toBe(true);
    expect(actorNode?.data.canonicalElementId).toBe('act-pilot');

    const subjectNode = projection.nodes.find(n => n.id === 'sub-uav');
    expect(subjectNode).toBeDefined();
    expect(subjectNode?.type).toBe('systemBoundary');
    expect(subjectNode?.data.label).toBe('UAV System');
    expect(subjectNode?.data.subjectBlockId).toBe('blk-uav');

    const ucNode = projection.nodes.find(n => n.id === 'uc-mission');
    expect(ucNode).toBeDefined();
    expect(ucNode?.type).toBe('useCase');
    expect(ucNode?.data.label).toBe('Execute Mission');
    expect(ucNode?.data.extensionPoints).toEqual(['OnEngineFailure']);

    // Check Edges
    expect(projection.edges.length).toBe(2);
    const assocEdge = projection.edges.find(e => e.id === 'rel-1');
    expect(assocEdge).toBeDefined();
    expect(assocEdge?.source).toBe('act-pilot');
    expect(assocEdge?.target).toBe('uc-mission');
    expect(assocEdge?.data?.type).toBe('association');

    const extendEdge = projection.edges.find(e => e.id === 'rel-2');
    expect(extendEdge).toBeDefined();
    expect(extendEdge?.source).toBe('uc-abort');
    expect(extendEdge?.target).toBe('uc-mission');
    expect(extendEdge?.data?.type).toBe('extend');
  });

  it('filters visible nodes when diagramPresentations are defined', () => {
    const repo = createSampleRepository();
    const diagramPresentations = {
      'diag-uc-1': { elementIds: ['act-pilot', 'uc-mission'] },
    };

    const projection = projectUseCaseDiagram(repo, {
      diagramPresentations,
      activeDiagramId: 'diag-uc-1',
    });

    expect(projection.nodes.map(n => n.id)).toEqual(['act-pilot', 'uc-mission']);
    // Only edges connecting visible nodes should be included
    expect(projection.edges.length).toBe(1);
    expect(projection.edges[0]?.id).toBe('rel-1');
  });

  it('generates presentation patch without touching semantic definitions', () => {
    const patch = buildPresentationPatch('uc-mission', { x: 300, y: 150, width: 160, height: 80 });
    expect(patch.type).toBe('updatePresentation');
    expect(patch.elementId).toBe('uc-mission');
    expect(patch.presentation).toEqual({ x: 300, y: 150, width: 160, height: 80 });
  });
});
