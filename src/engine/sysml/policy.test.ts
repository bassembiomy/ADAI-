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
