import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type PartUsage, type SysmlRepository } from './model';
import { analyzeMutation, applyCommand, createHistory, redo, undo } from './mutations';

const block = (id: string): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [],
});
const part = (id: string, ownerId: string, typeId: string, aggregation: PartUsage['aggregation']): PartUsage => ({
  id, ownerId, typeId, aggregation, kind: 'part', name: id,
  multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
});
const repository = (): SysmlRepository => {
  const repo = createEmptyRepository();
  repo.definitions.whole = block('whole');
  repo.definitions.childType = block('childType');
  repo.definitions.sharedType = block('sharedType');
  repo.usages.owned = part('owned', 'whole', 'childType', 'composite');
  repo.usages.nested = part('nested', 'owned', 'childType', 'composite');
  repo.usages.shared = part('shared', 'whole', 'sharedType', 'shared');
  repo.usages.external = part('external', 'sharedType', 'childType', 'reference');
  repo.relationships.assoc = { id: 'assoc', kind: 'association', sourceId: 'whole', targetId: 'sharedType' };
  return repo;
};

describe('composition-aware SysML transactions', () => {
  it('deletes only recursively owned composite usages, preserving definitions and shared/reference usages', () => {
    const result = applyCommand(repository(), { kind: 'deleteElements', elementIds: ['whole'] });

    expect(result.applied).toBe(true);
    expect(Object.keys(result.repository.definitions).sort()).toEqual(['childType', 'sharedType']);
    expect(Object.keys(result.repository.usages).sort()).toEqual(['external', 'shared']);
    expect(result.impact.deletedElementIds).toEqual(expect.arrayContaining(['whole', 'owned', 'nested', 'assoc']));
    expect(result.repository.revision).toBe(1);
  });

  it('keeps usages typed by a deleted definition and reports them as unresolved impacts', () => {
    const repo = repository();
    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['childType'] });
    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['childType'] });

    expect(impact.unresolvedUsageIds.sort()).toEqual(['external', 'nested', 'owned']);
    expect(Object.keys(result.repository.usages).sort()).toEqual(['external', 'nested', 'owned', 'shared']);
    expect(result.repository.definitions.childType).toBeUndefined();
  });

  it('atomically removes connectors, trace links, and verification evidence touching deleted elements', () => {
    const repo = repository();
    const whole = repo.definitions.whole as BlockDefinition;
    whole.ports.push({
      id: 'pd', name: 'p', kind: 'proxy', typeId: 'sharedType', direction: 'out', isConjugated: false,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    });
    repo.usages.pu = { id: 'pu', kind: 'port', name: 'p', ownerId: 'owned', definitionId: 'pd' };
    repo.usages.extPort = { id: 'extPort', kind: 'port', name: 'p2', ownerId: 'external', definitionId: 'pd' };
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'whole', sourcePortId: 'pu', targetPortId: 'extPort' };
    repo.requirements.r = { id: 'r', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'x', status: 'verified', version: '1' };
    repo.verificationCases.v = { id: 'v', name: 'V', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['r'] };
    repo.evidence.e = { id: 'e', verificationCaseId: 'v', requirementId: 'r', revision: 0, result: 'passed', executedAt: '2026-01-01' };
    repo.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'owned', targetId: 'r' };

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['whole'] });

    expect(result.repository.connectors).toEqual({});
    expect(result.repository.relationships.s).toBeUndefined();
    expect(result.repository.evidence.e).toBeUndefined();
    expect(result.impact.invalidatedEvidenceIds).toEqual(['e']);
  });

  it('supports exact undo and redo without mutating prior snapshots', () => {
    const original = repository();
    const history = createHistory(original);
    const applied = applyCommand(original, { kind: 'deleteElements', elementIds: ['whole'] });
    const afterDelete = { past: [original], present: applied.repository, future: [] };
    const undone = undo(afterDelete);
    const redone = redo(undone);

    expect(undone.present).toEqual(original);
    expect(redone.present).toEqual(applied.repository);
    expect(history.present).toEqual(original);
    expect(original.definitions.whole).toBeDefined();
  });

  it('recursively deletes nested requirements and containment edges when container is deleted, while unrelated elements survive', () => {
    const repo = repository();
    repo.requirements.rParent = { id: 'rParent', name: 'Parent', namespace: [], kind: 'requirement', requirementId: 'REQ-P', text: 'Parent', status: 'draft', version: '1' };
    repo.requirements.rChild = { id: 'rChild', name: 'Child', namespace: [], kind: 'requirement', requirementId: 'REQ-C', text: 'Child', status: 'draft', version: '1' };
    repo.requirements.rGrandchild = { id: 'rGrandchild', name: 'Grandchild', namespace: [], kind: 'requirement', requirementId: 'REQ-GC', text: 'Grandchild', status: 'draft', version: '1' };
    repo.requirements.rUnrelated = { id: 'rUnrelated', name: 'Unrelated', namespace: [], kind: 'requirement', requirementId: 'REQ-U', text: 'Unrelated', status: 'draft', version: '1' };

    repo.relationships.rc1 = { id: 'rc1', kind: 'requirementContainment', sourceId: 'rParent', targetId: 'rChild' };
    repo.relationships.rc2 = { id: 'rc2', kind: 'requirementContainment', sourceId: 'rChild', targetId: 'rGrandchild' };
    repo.relationships.sat = { id: 'sat', kind: 'satisfy', sourceId: 'whole', targetId: 'rChild' };

    repo.verificationCases.v = { id: 'v', name: 'V', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['rGrandchild'] };
    repo.evidence.ev = { id: 'ev', verificationCaseId: 'v', requirementId: 'rGrandchild', revision: 0, result: 'passed', executedAt: '2026-09-09' };

    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['rParent'] });
    expect(impact.nestedRequirementIds).toEqual(['rChild', 'rGrandchild']);
    expect(impact.removedRelationshipIds).toEqual(expect.arrayContaining(['rc1', 'rc2', 'sat']));

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['rParent'] });
    expect(result.repository.requirements.rParent).toBeUndefined();
    expect(result.repository.requirements.rChild).toBeUndefined();
    expect(result.repository.requirements.rGrandchild).toBeUndefined();
    expect(result.repository.relationships.rc1).toBeUndefined();
    expect(result.repository.relationships.rc2).toBeUndefined();
    expect(result.repository.relationships.sat).toBeUndefined();
    expect(result.repository.evidence.ev).toBeUndefined();

    // Unrelated requirement, supplier block, and verification case survive
    expect(result.repository.requirements.rUnrelated).toBeDefined();
    expect(result.repository.definitions.whole).toBeDefined();
    expect(result.repository.verificationCases.v).toBeDefined();
    expect(result.repository.verificationCases.v.verifiesRequirementIds).toEqual([]);
  });

  it('deleting only a containment relationship preserves both container and nested requirements', () => {
    const repo = repository();
    repo.requirements.rParent = { id: 'rParent', name: 'Parent', namespace: [], kind: 'requirement', requirementId: 'REQ-P', text: 'Parent', status: 'draft', version: '1' };
    repo.requirements.rChild = { id: 'rChild', name: 'Child', namespace: [], kind: 'requirement', requirementId: 'REQ-C', text: 'Child', status: 'draft', version: '1' };
    repo.relationships.rc = { id: 'rc', kind: 'requirementContainment', sourceId: 'rParent', targetId: 'rChild' };

    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['rc'] });
    expect(impact.nestedRequirementIds).toEqual([]);
    expect(impact.deletedElementIds).toEqual(['rc']);
    expect(impact.removedRelationshipIds).toEqual(['rc']);

    const result = applyCommand(repo, { kind: 'deleteElements', elementIds: ['rc'] });
    expect(result.repository.relationships.rc).toBeUndefined();
    expect(result.repository.requirements.rParent).toBeDefined();
    expect(result.repository.requirements.rChild).toBeDefined();
  });

  it('deleting non-containment relationships never cascades to connected elements', () => {
    const repo = repository();
    repo.requirements.r1 = { id: 'r1', name: 'R1', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'R1', status: 'draft', version: '1' };
    repo.requirements.r2 = { id: 'r2', name: 'R2', namespace: [], kind: 'requirement', requirementId: 'REQ-2', text: 'R2', status: 'draft', version: '1' };
    repo.definitions.b = block('b');
    repo.verificationCases.v = { id: 'v', name: 'V', namespace: [], kind: 'verificationCase', method: 'test', verifiesRequirementIds: ['r1'] };

    repo.relationships.d = { id: 'rel_d', kind: 'deriveReqt', sourceId: 'r1', targetId: 'r2' };
    repo.relationships.s = { id: 'rel_s', kind: 'satisfy', sourceId: 'b', targetId: 'r1' };
    repo.relationships.v = { id: 'rel_v', kind: 'verify', sourceId: 'v', targetId: 'r1' };
    repo.relationships.ref = { id: 'rel_ref', kind: 'refine', sourceId: 'b', targetId: 'r1' };
    repo.relationships.tr = { id: 'rel_tr', kind: 'trace', sourceId: 'r1', targetId: 'b' };
    repo.relationships.cp = { id: 'rel_cp', kind: 'copy', sourceId: 'r1', targetId: 'r2' };

    for (const relId of ['rel_d', 'rel_s', 'rel_v', 'rel_ref', 'rel_tr', 'rel_cp']) {
      const result = applyCommand(repo, { kind: 'deleteElements', elementIds: [relId] });
      expect(result.repository.relationships[relId]).toBeUndefined();
      expect(result.repository.requirements.r1).toBeDefined();
      expect(result.repository.requirements.r2).toBeDefined();
      expect(result.repository.definitions.b).toBeDefined();
      expect(result.repository.verificationCases.v).toBeDefined();
    }
  });
});

