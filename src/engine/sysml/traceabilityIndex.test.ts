import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from './model';
import { buildTraceabilityIndex, findRequirementCycles } from './traceabilityIndex';

const req = (id: string, requirementId: string) => ({ id, kind: 'requirement' as const, name: id, namespace: [], requirementId, text: id, status: 'draft' as const, version: '1.0' });

describe('traceability index', () => {
  it('indexes containment, verification, evidence, coverage, and unresolved endpoints', () => {
    const repo = createEmptyRepository();
    repo.requirements.r1 = req('r1', 'REQ-1');
    repo.requirements.r2 = req('r2', 'REQ-2');
    repo.definitions.b1 = { id: 'b1', kind: 'block', name: 'Block', namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
    repo.relationships.c = { id: 'c', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    repo.relationships.s = { id: 's', kind: 'satisfy', sourceId: 'b1', targetId: 'r1' };
    repo.relationships.u = { id: 'u', kind: 'trace', sourceId: 'r1', targetId: 'missing' };
    repo.verificationCases.v = { id: 'v', kind: 'verificationCase', name: 'V', namespace: [], method: 'Test', verifiesRequirementIds: ['r1'] };
    repo.evidence.e = { id: 'e', verificationCaseId: 'v', requirementId: 'r1', revision: 1, result: 'passed', executedAt: 'now' };
    const index = buildTraceabilityIndex(repo);
    expect(index.childrenByRequirement.get('r1')).toEqual(['r2']);
    expect(index.coveringElementsByRequirement.get('r1')).toEqual(['b1']);
    expect(index.verificationCasesByRequirement.get('r1')).toEqual(['v']);
    expect(index.evidenceByRequirement.get('r1')).toEqual(['e']);
    expect(index.diagnostics.some(item => item.code === 'UNRESOLVED_ENDPOINT')).toBe(true);
  });

  it('detects requirement cycles without recursing forever', () => {
    const repo = createEmptyRepository();
    repo.requirements.a = req('a', 'A');
    repo.requirements.b = req('b', 'B');
    repo.relationships.ab = { id: 'ab', kind: 'requirementContainment', sourceId: 'a', targetId: 'b' };
    repo.relationships.ba = { id: 'ba', kind: 'requirementContainment', sourceId: 'b', targetId: 'a' };
    expect(findRequirementCycles(buildTraceabilityIndex(repo))).toEqual([['a', 'b', 'a']]);
  });
});
