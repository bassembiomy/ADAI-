import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from './model';
import { migrateLegacyRelationship, migrateProjectRelationships } from './relationshipMigration';

describe('relationshipMigration', () => {
  it('migrates legacy composition between requirements to requirementContainment', () => {
    const repo = createEmptyRepository();
    repo.requirements.r1 = { id: 'r1', kind: 'requirement', requirementId: 'REQ-1', name: 'Parent', text: '', status: 'draft', version: '1', namespace: [] };
    repo.requirements.r2 = { id: 'r2', kind: 'requirement', requirementId: 'REQ-2', name: 'Child', text: '', status: 'draft', version: '1', namespace: [] };
    repo.relationships.rel1 = { id: 'rel1', kind: 'composition' as any, sourceId: 'r1', targetId: 'r2' };

    const res = migrateLegacyRelationship(repo.relationships.rel1, repo);
    expect(res.relationship.kind).toBe('requirementContainment');
    expect(res.diagnostic?.code).toBe('LEGACY_REQUIREMENT_COMPOSITION_MIGRATED');
  });

  it('migrates legacy derive between requirements to deriveReqt', () => {
    const repo = createEmptyRepository();
    repo.requirements.r1 = { id: 'r1', kind: 'requirement', requirementId: 'REQ-1', name: 'Source', text: '', status: 'draft', version: '1', namespace: [] };
    repo.requirements.r2 = { id: 'r2', kind: 'requirement', requirementId: 'REQ-2', name: 'Derived', text: '', status: 'draft', version: '1', namespace: [] };
    repo.relationships.rel2 = { id: 'rel2', kind: 'derive' as any, sourceId: 'r2', targetId: 'r1' };

    const res = migrateLegacyRelationship(repo.relationships.rel2, repo);
    expect(res.relationship.kind).toBe('deriveReqt');
    expect(res.diagnostic?.code).toBe('LEGACY_REQUIREMENT_DERIVE_MIGRATED');
  });

  it('migrates legacy traceability to trace', () => {
    const repo = createEmptyRepository();
    repo.requirements.r1 = { id: 'r1', kind: 'requirement', requirementId: 'REQ-1', name: 'Req', text: '', status: 'draft', version: '1', namespace: [] };
    repo.definitions.b1 = { id: 'b1', kind: 'block', name: 'Block', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repo.relationships.rel3 = { id: 'rel3', kind: 'traceability' as any, sourceId: 'b1', targetId: 'r1' };

    const res = migrateLegacyRelationship(repo.relationships.rel3, repo);
    expect(res.relationship.kind).toBe('trace');
    expect(res.diagnostic?.code).toBe('LEGACY_REQUIREMENT_TRACEABILITY_MIGRATED');
  });

  it('reverses legacy reversed satisfy, verify, and refine relationships', () => {
    const repo = createEmptyRepository();
    repo.requirements.r1 = { id: 'r1', kind: 'requirement', requirementId: 'REQ-1', name: 'Req', text: '', status: 'draft', version: '1', namespace: [] };
    repo.definitions.b1 = { id: 'b1', kind: 'block', name: 'Block', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repo.verificationCases.vc1 = { id: 'vc1', kind: 'verificationCase', name: 'TestCase', namespace: [], method: 'test', verifiesRequirementIds: [] };

    // Reversed satisfy: source is requirement, target is block
    repo.relationships.sat = { id: 'sat', kind: 'satisfy', sourceId: 'r1', targetId: 'b1' };
    const resSat = migrateLegacyRelationship(repo.relationships.sat, repo);
    expect(resSat.relationship.sourceId).toBe('b1');
    expect(resSat.relationship.targetId).toBe('r1');
    expect(resSat.diagnostic?.code).toBe('LEGACY_SATISFY_DIRECTION_REVERSED');

    // Reversed verify: source is requirement, target is verificationCase
    repo.relationships.ver = { id: 'ver', kind: 'verify', sourceId: 'r1', targetId: 'vc1' };
    const resVer = migrateLegacyRelationship(repo.relationships.ver, repo);
    expect(resVer.relationship.sourceId).toBe('vc1');
    expect(resVer.relationship.targetId).toBe('r1');
    expect(resVer.diagnostic?.code).toBe('LEGACY_VERIFY_DIRECTION_REVERSED');

    // Reversed refine: source is requirement, target is block
    repo.relationships.ref = { id: 'ref', kind: 'refine', sourceId: 'r1', targetId: 'b1' };
    const resRef = migrateLegacyRelationship(repo.relationships.ref, repo);
    expect(resRef.relationship.sourceId).toBe('b1');
    expect(resRef.relationship.targetId).toBe('r1');
    expect(resRef.diagnostic?.code).toBe('LEGACY_REFINE_DIRECTION_REVERSED');
  });

  it('runs migrateProjectRelationships across full repository', () => {
    const repo = createEmptyRepository();
    repo.requirements.r1 = { id: 'r1', kind: 'requirement', requirementId: 'REQ-1', name: 'Parent', text: '', status: 'draft', version: '1', namespace: [] };
    repo.requirements.r2 = { id: 'r2', kind: 'requirement', requirementId: 'REQ-2', name: 'Child', text: '', status: 'draft', version: '1', namespace: [] };
    repo.definitions.b1 = { id: 'b1', kind: 'block', name: 'Block', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repo.verificationCases.vc1 = { id: 'vc1', kind: 'verificationCase', name: 'TestCase', namespace: [], method: 'test', verifiesRequirementIds: [] };

    repo.relationships.c1 = { id: 'c1', kind: 'composition' as any, sourceId: 'r1', targetId: 'r2' };
    repo.relationships.s1 = { id: 's1', kind: 'satisfy', sourceId: 'r1', targetId: 'b1' };
    repo.relationships.v1 = { id: 'v1', kind: 'verify', sourceId: 'r2', targetId: 'vc1' };

    const result = migrateProjectRelationships(repo);
    expect(result.migratedCount).toBe(3);
    expect(result.diagnostics).toHaveLength(3);
    expect(result.migratedRelationships.c1.kind).toBe('requirementContainment');
    expect(result.migratedRelationships.s1.sourceId).toBe('b1');
    expect(result.migratedRelationships.v1.sourceId).toBe('vc1');
  });
});
