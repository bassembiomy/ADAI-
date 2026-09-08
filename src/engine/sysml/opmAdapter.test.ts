import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from './model';
import { assessOpmRoundTripLoss, projectSysmlToOpm } from './opmAdapter';

const model = (): SysmlRepository => {
  const repo = createEmptyRepository();
  repo.definitions.whole = { id: 'whole', name: 'Whole', namespace: [], kind: 'block', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  repo.definitions.child = { id: 'child', name: 'Child', namespace: [], kind: 'block', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  repo.requirements.r = { id: 'r', name: 'Safety', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Safe', status: 'approved', version: '2' };
  repo.usages.p = { id: 'p', name: 'part', kind: 'part', ownerId: 'whole', typeId: 'child', aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } };
  repo.relationships.comp = { id: 'comp', kind: 'composition', sourceId: 'whole', targetId: 'child' };
  repo.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'whole', targetId: 'r' };
  return repo;
};

describe('loss-aware SysML to OPM adapter', () => {
  it('retains source IDs and requirement governance metadata on projected nodes', () => {
    const projection = projectSysmlToOpm(model());
    expect(projection.nodes.find(node => node.id === 'whole')).toMatchObject({ sourceSysmlId: 'whole', type: 'object' });
    expect(projection.nodes.find(node => node.id === 'r')).toMatchObject({ sourceSysmlId: 'r', type: 'requirement', requirementId: 'REQ-1', requirementStatus: 'approved', requirementVersion: '2' });
  });

  it('keeps composition distinguishable and explicitly marks aggregation projection as lossy', () => {
    const projection = projectSysmlToOpm(model());
    const edge = projection.edges.find(item => item.sourceSysmlId === 'comp');
    expect(edge).toMatchObject({ type: 'aggregation', mappingStatus: 'conceptual-only', sourceSysmlKind: 'composition' });
    expect(projection.diagnostics.map(item => item.code)).toContain('OPM_COMPOSITION_OWNERSHIP_LOSS');
  });

  it('does not silently map IBD connectors, ports, or unsupported relationships', () => {
    const repo = model();
    repo.usages.port = { id: 'port', name: 'port', kind: 'port', ownerId: 'p', definitionId: 'missing' };
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'whole', sourcePortId: 'port', targetPortId: 'port' };
    repo.relationships.binding = { id: 'binding', kind: 'binding', sourceId: 'p', targetId: 'port' };
    const projection = projectSysmlToOpm(repo);
    expect(projection.mappings.find(item => item.sourceSysmlId === 'c')?.status).toBe('unsupported');
    expect(projection.mappings.find(item => item.sourceSysmlId === 'binding')?.status).toBe('unsupported');
    expect(projection.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining(['OPM_IBD_CONNECTOR_UNSUPPORTED', 'OPM_RELATIONSHIP_UNSUPPORTED']));
  });

  it('reports round-trip loss for every conceptual/unsupported mapping and never mutates native SysML', () => {
    const repo = model();
    const before = structuredClone(repo);
    const projection = projectSysmlToOpm(repo);
    const loss = assessOpmRoundTripLoss(repo, projection);
    expect(loss.lossless).toBe(false);
    expect(loss.lossySourceIds).toContain('comp');
    expect(repo).toEqual(before);
  });
});
