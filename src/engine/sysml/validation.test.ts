import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type PartUsage } from './model';
import { validateSysmlRepository } from './validation';

const block = (id: string, name = id): BlockDefinition => ({
  id, name, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [],
});

const part = (id: string, ownerId: string, typeId: string, aggregation: PartUsage['aggregation'] = 'composite'): PartUsage => ({
  id, ownerId, typeId, aggregation, kind: 'part', name: id,
  multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
});

describe('validateSysmlRepository', () => {
  it('accepts a valid definition and composite part usage', () => {
    const repo = createEmptyRepository();
    repo.definitions.whole = block('whole');
    repo.definitions.child = block('child');
    repo.usages.engine = part('engine', 'whole', 'child');

    const report = validateSysmlRepository(repo);

    expect(report.valid).toBe(true);
    expect(report.diagnostics).toEqual([]);
    expect(report.canSimulate).toBe(true);
    expect(report.canExport).toBe(true);
  });

  it('rejects duplicate element IDs and qualified names across namespaces', () => {
    const repo = createEmptyRepository();
    repo.definitions.a = block('same', 'Controller');
    repo.definitions.b = { ...block('other', 'Controller') };
    repo.requirements.r = {
      id: 'same', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1',
      text: 'x', status: 'draft', version: '1',
    };

    const codes = validateSysmlRepository(repo).diagnostics.map(d => d.code);
    expect(codes).toContain('DUPLICATE_ELEMENT_ID');
    expect(codes).toContain('DUPLICATE_QUALIFIED_NAME');
  });

  it('reports missing owner/type references and invalid relationship endpoints', () => {
    const repo = createEmptyRepository();
    repo.usages.p = part('p', 'missing-owner', 'missing-type');
    repo.relationships.rel = { id: 'rel', kind: 'association', sourceId: 'p', targetId: 'missing' };

    const report = validateSysmlRepository(repo);
    expect(report.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining([
      'MISSING_USAGE_OWNER', 'MISSING_USAGE_TYPE', 'MISSING_RELATIONSHIP_ENDPOINT',
    ]));
    expect(report.canSimulate).toBe(false);
    expect(report.canExport).toBe(false);
    expect(report.canReport).toBe(false);
  });

  it('detects composite containment and inheritance cycles', () => {
    const repo = createEmptyRepository();
    repo.definitions.a = { ...block('a'), supertypeIds: ['b'] };
    repo.definitions.b = { ...block('b'), supertypeIds: ['a'] };
    repo.usages.p1 = part('p1', 'p2', 'a');
    repo.usages.p2 = part('p2', 'p1', 'b');

    const codes = validateSysmlRepository(repo).diagnostics.map(d => d.code);
    expect(codes).toContain('INHERITANCE_CYCLE');
    expect(codes).toContain('COMPOSITE_CONTAINMENT_CYCLE');
  });

  it('rejects multiple composition relationships claiming the same owned usage', () => {
    const repo = createEmptyRepository();
    repo.definitions.a = block('a');
    repo.definitions.b = block('b');
    repo.definitions.t = block('t');
    repo.usages.p = part('p', 'a', 't');
    repo.relationships.c1 = { id: 'c1', kind: 'composition', sourceId: 'a', targetId: 'p' };
    repo.relationships.c2 = { id: 'c2', kind: 'composition', sourceId: 'b', targetId: 'p' };

    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).toContain('MULTIPLE_COMPOSITE_OWNERS');
  });

  it('enforces SysML requirement relationship direction', () => {
    const repo = createEmptyRepository();
    repo.definitions.b = block('b');
    repo.requirements.r = {
      id: 'r', name: 'Requirement', namespace: [], kind: 'requirement', requirementId: 'REQ-1',
      text: 'x', status: 'draft', version: '1',
    };
    repo.relationships.bad = { id: 'bad', kind: 'satisfy', sourceId: 'r', targetId: 'b' };

    const report = validateSysmlRepository(repo);
    expect(report.diagnostics.map(d => d.code)).toContain('INVALID_RELATIONSHIP_DIRECTION');
    expect(report.canVerify).toBe(false);
  });
});
