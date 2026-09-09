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
});
