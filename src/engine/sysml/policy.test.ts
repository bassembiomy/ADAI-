import { describe, expect, it } from 'vitest';
import { createEmptyRepository, parseMultiplicity, type SysmlRepository } from './model';
import { classifyDeletionTarget, resolveInheritance, classifyRelationship } from './policy';

const one = parseMultiplicity('1');

function repository(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.base = {
    id: 'base', name: 'Base', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
    properties: [{ id: 'base.temp', name: 'temperature', kind: 'value', typeId: 'real', multiplicity: one }],
    ports: [], operations: [], constraints: [],
  };
  repo.definitions.child = {
    id: 'child', name: 'Child', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
    supertypeIds: ['base'], properties: [], ports: [], operations: [], constraints: [],
  };
  repo.definitions.system = {
    id: 'system', name: 'System', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
    properties: [], ports: [], operations: [], constraints: [],
  };
  repo.usages.composite = { id: 'composite', kind: 'part', name: 'composite', ownerId: 'system', typeId: 'child', aggregation: 'composite', multiplicity: one };
  repo.usages.shared = { id: 'shared', kind: 'part', name: 'shared', ownerId: 'system', typeId: 'child', aggregation: 'shared', multiplicity: one };
  repo.relationships.comp = { id: 'comp', kind: 'composition', sourceId: 'system', targetId: 'composite' };
  repo.relationships.assoc = { id: 'assoc', kind: 'association', sourceId: 'child', targetId: 'system' };
  return repo;
}

describe('typed SysML policy', () => {
  it('resolves inherited features with their origin', () => {
    const result = resolveInheritance(repository(), 'child');
    expect(result.valid).toBe(true);
    expect(result.features).toEqual([{ featureId: 'base.temp', inheritedFromId: 'base' }]);
  });

  it('classifies BDD relationships separately from IBD connectors', () => {
    const repo = repository();
    expect(classifyRelationship(repo, 'assoc')).toMatchObject({ diagram: 'bdd', allowed: true });
    expect(classifyRelationship(repo, 'comp')).toMatchObject({ diagram: 'bdd', allowed: true, ownership: 'composite' });
  });

  it('does not treat shared typed usages as definition deletion cascades', () => {
    const repo = repository();
    expect(classifyDeletionTarget(repo, 'child')).toMatchObject({
      targetKind: 'definition', cascadeIds: [], unresolvedUsageIds: ['composite', 'shared'],
    });
    expect(classifyDeletionTarget(repo, 'system')).toMatchObject({
      targetKind: 'definition', cascadeIds: ['composite'], unresolvedUsageIds: [],
    });
  });
});

describe('typed SysML policy inheritance hardening', () => {
  it('emits LEAF_SPECIALIZATION when specializing a leaf supertype', () => {
    const repo = repository();
    repo.definitions.leaf = {
      id: 'leaf', name: 'Leaf', namespace: [], kind: 'block', isAbstract: false, isLeaf: true,
      properties: [], ports: [], operations: [], constraints: [],
    };
    repo.definitions.sub = {
      id: 'sub', name: 'Sub', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      supertypeIds: ['leaf'], properties: [], ports: [], operations: [], constraints: [],
    };
    const result = resolveInheritance(repo, 'sub');
    expect(result.diagnostics.join('\n')).toMatch('LEAF_SPECIALIZATION');
  });

  it('emits ABSTRACT_INSTANTIATION guidance for abstract definitions', () => {
    const repo = repository();
    repo.definitions.abs = {
      id: 'abs', name: 'Abs', namespace: [], kind: 'block', isAbstract: true, isLeaf: false,
      properties: [], ports: [], operations: [], constraints: [],
    };
    const result = resolveInheritance(repo, 'abs');
    expect(result.diagnostics.join('\n')).toMatch('ABSTRACT_INSTANTIATION');
  });

  it('reports missing supertypes and cycles with typed diagnostics in deterministic order', () => {
    const repo = repository();
    repo.definitions.orphan = {
      id: 'orphan', name: 'Orphan', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      supertypeIds: ['missing-parent'], properties: [], ports: [], operations: [], constraints: [],
    };
    expect(resolveInheritance(repo, 'orphan').diagnostics.join('\n')).toMatch('MISSING_SUPERTYPE');

    repo.definitions.a = {
      id: 'a', name: 'A', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      supertypeIds: ['b'], properties: [], ports: [], operations: [], constraints: [],
    };
    repo.definitions.b = {
      id: 'b', name: 'B', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      supertypeIds: ['a'], properties: [], ports: [], operations: [], constraints: [],
    };
    expect(resolveInheritance(repo, 'a').diagnostics.join('\n')).toMatch('INHERITANCE_CYCLE');

    const ordered = repository();
    ordered.definitions.zbase = {
      id: 'zbase', name: 'Z', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      properties: [{ id: 'zbase.z', name: 'z', kind: 'value', typeId: 'real', multiplicity: one }],
      ports: [], operations: [], constraints: [],
    };
    ordered.definitions.abase = {
      id: 'abase', name: 'A', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      properties: [{ id: 'abase.a', name: 'a', kind: 'value', typeId: 'real', multiplicity: one }],
      ports: [], operations: [], constraints: [],
    };
    ordered.definitions.multi = {
      id: 'multi', name: 'M', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      supertypeIds: ['zbase', 'abase'], properties: [], ports: [], operations: [], constraints: [],
    };
    const features = resolveInheritance(ordered, 'multi').features.map(f => f.featureId);
    expect(features).toEqual([...features].sort());
  });

  it('flags incompatible redefinition and invalid subsetting', () => {
    const repo = repository();
    repo.definitions.base2 = {
      id: 'base2', name: 'Base2', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      properties: [{ id: 'base2.items', name: 'items', kind: 'part', typeId: 'base', multiplicity: parseMultiplicity('1..2') }],
      ports: [], operations: [], constraints: [],
    };
    repo.definitions.badchild = {
      id: 'badchild', name: 'Bad', namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
      supertypeIds: ['base2'],
      properties: [
        { id: 'badchild.re', name: 'items', kind: 'value', typeId: 'real', multiplicity: one, redefinesId: 'base2.items' },
        { id: 'badchild.sub', name: 'subset', kind: 'part', typeId: 'base', multiplicity: parseMultiplicity('0..*'), subsetsId: 'base2.items' },
      ],
      ports: [], operations: [], constraints: [],
    };
    const diagnostics = resolveInheritance(repo, 'badchild').diagnostics.join('\n');
    expect(diagnostics).toMatch('INCOMPATIBLE_REDEFINITION');
    expect(diagnostics).toMatch('INVALID_SUBSETTING_MULTIPLICITY');
  });
});

describe('typed SysML policy relationship endpoints', () => {
  it('rejects generalization with non-block endpoints', () => {
    const repo = repository();
    repo.usages.u = { id: 'u', kind: 'part', name: 'u', ownerId: 'system', typeId: 'child', aggregation: 'reference', multiplicity: one };
    repo.relationships.badgen = { id: 'badgen', kind: 'generalization', sourceId: 'u', targetId: 'base' };
    const decision = classifyRelationship(repo, 'badgen');
    expect(decision.allowed).toBe(false);
    expect(decision.diagnostics.join('\n')).toMatch('INVALID_GENERALIZATION_ENDPOINTS');
  });

  it('rejects composition touching requirements and maps IBD vs BDD diagrams', () => {
    const repo = repository();
    repo.requirements.r = { id: 'r', name: 'R', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'x', status: 'draft', version: '1' };
    repo.relationships.badcomp = { id: 'badcomp', kind: 'composition', sourceId: 'system', targetId: 'r' };
    expect(classifyRelationship(repo, 'badcomp').diagnostics.join('\n')).toMatch('INVALID_COMPOSITION_ENDPOINTS');
    expect(classifyRelationship(repo, 'badcomp').allowed).toBe(false);

    repo.relationships.bind = { id: 'bind', kind: 'binding', sourceId: 'composite', targetId: 'shared' };
    expect(classifyRelationship(repo, 'bind')).toMatchObject({ diagram: 'ibd', allowed: true });
    repo.relationships.flow = { id: 'flow', kind: 'itemFlow', sourceId: 'composite', targetId: 'shared' };
    expect(classifyRelationship(repo, 'flow')).toMatchObject({ diagram: 'ibd', allowed: true });
  });

  it('validates requirement relation directions and rejects unknown kinds', () => {
    const repo = repository();
    repo.requirements.r1 = { id: 'r1', name: 'R1', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'x', status: 'draft', version: '1' };
    repo.requirements.r2 = { id: 'r2', name: 'R2', namespace: [], kind: 'requirement', requirementId: 'REQ-2', text: 'y', status: 'draft', version: '1' };
    repo.relationships.derive = { id: 'derive', kind: 'deriveReqt', sourceId: 'r1', targetId: 'r2' };
    expect(classifyRelationship(repo, 'derive')).toMatchObject({ diagram: 'rtm', allowed: true });
    repo.relationships.reqcont = { id: 'reqcont', kind: 'requirementContainment', sourceId: 'r1', targetId: 'r2' };
    expect(classifyRelationship(repo, 'reqcont')).toMatchObject({ diagram: 'requirements', allowed: true });

    repo.relationships.badsat = { id: 'badsat', kind: 'satisfy', sourceId: 'r1', targetId: 'child' };
    const bad = classifyRelationship(repo, 'badsat');
    expect(bad.allowed).toBe(false);
    expect(bad.diagnostics.join('\n')).toMatch('INVALID_REQUIREMENT_RELATION_DIRECTION');

    repo.relationships.weird = { id: 'weird', kind: 'telepathy' as never, sourceId: 'child', targetId: 'system' };
    const unknown = classifyRelationship(repo, 'weird');
    expect(unknown.allowed).toBe(false);
    expect(unknown.diagnostics.join('\n')).toMatch('UNSUPPORTED_RELATIONSHIP_KIND');
  });
});

describe('typed SysML policy deletion targets', () => {
  it('cascades composite usage subtrees while leaving shared usages alone', () => {
    const repo = repository();
    repo.usages.nested = { id: 'nested', kind: 'part', name: 'nested', ownerId: 'composite', typeId: 'child', aggregation: 'composite', multiplicity: one };
    const compositeDecision = classifyDeletionTarget(repo, 'composite');
    expect(compositeDecision.targetKind).toBe('usage');
    expect(compositeDecision.cascadeIds).toEqual(expect.arrayContaining(['composite', 'nested']));

    const sharedDecision = classifyDeletionTarget(repo, 'shared');
    expect(sharedDecision.cascadeIds).not.toContain('shared');
  });

  it('reports unknown deletion targets with diagnostics', () => {
    expect(classifyDeletionTarget(repository(), 'nope').diagnostics.length).toBeGreaterThan(0);
  });
});
