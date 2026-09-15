import { describe, expect, it } from 'vitest';
import { loadRepository, serializeRepository } from './persistence';
import type { UseCaseDiagram } from '../../types/usecase_types';

describe('SysML Use-Case Legacy Migration & Persistence', () => {
  const legacyDiagram: UseCaseDiagram = {
    id: 'uc-diag-1',
    name: 'Vehicle Use Cases',
    nodes: [
      {
        id: 'node-actor-1',
        type: 'actor',
        position: { x: 50, y: 100 },
        data: {
          label: 'Driver',
          isExternal: true,
          canonicalElementId: 'actor-driver',
        },
      },
      {
        id: 'node-boundary-1',
        type: 'systemBoundary',
        position: { x: 200, y: 50 },
        width: 500,
        height: 400,
        data: {
          label: 'Vehicle System',
          subjectBlockId: 'block-vehicle',
        },
      },
      {
        id: 'node-uc-1',
        type: 'useCase',
        position: { x: 250, y: 120 },
        parentId: 'node-boundary-1',
        data: {
          label: 'Drive Vehicle',
          description: 'Primary transport function',
          extensionPoints: ['HighSpeedMode'],
          requirementTraces: [
            { requirementId: 'req-safety', relationType: 'satisfy' },
          ],
          elaboratingDiagramId: 'act-diag-drive',
        },
      },
      {
        id: 'node-uc-2',
        type: 'useCase',
        position: { x: 450, y: 120 },
        data: {
          label: 'Cruise Control',
          description: 'Automated velocity holding',
        },
      },
    ],
    edges: [
      {
        id: 'edge-assoc-1',
        source: 'node-actor-1',
        target: 'node-uc-1',
        type: 'association',
      },
      {
        id: 'edge-inc-1',
        source: 'node-uc-1',
        target: 'node-uc-2',
        type: 'include',
      },
      {
        id: 'edge-dangling',
        source: 'node-actor-1',
        target: 'missing-node-id',
        type: 'include',
      },
    ],
  };

  it('migrates legacy useCaseDiagrams payload into canonical entities', () => {
    const legacyPayload = {
      blocks: [
        {
          id: 'block-vehicle',
          name: 'Vehicle',
          stereotype: 'block',
        },
        {
          id: 'req-safety',
          reqId: 'REQ-01',
          name: 'SafetyReq',
          stereotype: 'requirement',
          description: 'Safe operation',
        },
      ],
      useCaseDiagrams: [legacyDiagram],
    };

    const { repository: repo, interchangeReport } = loadRepository(legacyPayload);

    // Actor migrated with canonical ID preserved
    expect(repo.actors['actor-driver']).toBeDefined();
    expect(repo.actors['actor-driver'].name).toBe('Driver');
    expect(repo.actors['actor-driver'].isExternal).toBe(true);

    // Subject migrated with deterministic fallback ID
    const subjectId = 'uc-diag-1_node-boundary-1';
    expect(repo.subjects[subjectId]).toBeDefined();
    expect(repo.subjects[subjectId].name).toBe('Vehicle System');
    expect(repo.subjects[subjectId].realizedByBlockId).toBe('block-vehicle');

    // UseCase migrated with subject linkage and extension points
    const uc1Id = 'uc-diag-1_node-uc-1';
    expect(repo.useCases[uc1Id]).toBeDefined();
    expect(repo.useCases[uc1Id].name).toBe('Drive Vehicle');
    expect(repo.useCases[uc1Id].subjectId).toBe(subjectId);
    expect(repo.useCases[uc1Id].extensionPointIds).toHaveLength(1);

    const epId = repo.useCases[uc1Id].extensionPointIds[0];
    expect(repo.extensionPoints[epId]).toBeDefined();
    expect(repo.extensionPoints[epId].name).toBe('HighSpeedMode');
    expect(repo.extensionPoints[epId].useCaseId).toBe(uc1Id);

    // Elaborating diagram reference migrated
    const diagRefs = Object.values(repo.diagramReferences);
    expect(diagRefs.some(ref => ref.diagramId === 'act-diag-drive' && ref.sourceElementId === uc1Id)).toBe(true);

    // Valid relationships migrated
    const rels = Object.values(repo.relationships);
    expect(rels.some(r => r.kind === 'useCaseAssociation' && r.sourceId === 'actor-driver' && r.targetId === uc1Id)).toBe(true);
    expect(rels.some(r => r.kind === 'include' && r.sourceId === uc1Id && r.targetId === 'uc-diag-1_node-uc-2')).toBe(true);
    expect(rels.some(r => r.kind === 'useCaseSatisfy' && r.sourceId === uc1Id && r.targetId === 'req-safety')).toBe(true);

    // Dangling edge quarantined/reported in loss entries, not silently mapped
    expect(interchangeReport.lossEntries.some(e => e.sourceId === 'edge-dangling')).toBe(true);

    // Round-trip serialization preserves canonical use cases
    const serialized = serializeRepository(repo);
    const reloaded = loadRepository(serialized);
    expect(reloaded.repository.actors['actor-driver']).toEqual(repo.actors['actor-driver']);
    expect(reloaded.repository.useCases[uc1Id]).toEqual(repo.useCases[uc1Id]);
  });
});
