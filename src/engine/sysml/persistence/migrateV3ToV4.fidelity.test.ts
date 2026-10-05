import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type SysmlRelationship, type SysmlRepository } from '../model';
import { migrateV3ToV4, V4_RELATIONSHIP_METACLASS } from './migrateV3ToV4';
import { resolveSemanticElement } from '../capabilities/ownershipPolicy';

const ALL_KINDS = Object.keys(V4_RELATIONSHIP_METACLASS) as SysmlRelationship['kind'][];

function repoWith(...relationships: SysmlRelationship[]): SysmlRepository {
  const repo = createEmptyRepository();
  for (const relationship of relationships) repo.relationships[relationship.id] = relationship;
  return repo;
}

describe('V3 → V4 view is faithful', () => {
  it('maps every V3 relationship kind to a specific V4 metaclass (none silently becomes Association)', () => {
    const generic = ALL_KINDS.filter(kind => V4_RELATIONSHIP_METACLASS[kind] === 'Association');
    // Only genuine UML Associations (incl. aggregation ends and use-case associations) map here.
    expect(generic.sort()).toEqual(['association', 'composition', 'sharedAggregation', 'useCaseAssociation']);
    const v4 = migrateV3ToV4(repoWith(...ALL_KINDS.map(kind => ({ id: `r-${kind}`, kind, sourceId: 'a', targetId: 'b' }) as SysmlRelationship)));
    for (const kind of ALL_KINDS) {
      expect(v4.relationships[`r-${kind}`].metaclass).toBe(V4_RELATIONSHIP_METACLASS[kind]);
      expect(v4.relationships[`r-${kind}`].customProperties?.sourceKind).toBe(kind);
    }
  });

  it('keeps dependency, allocation, imports, binding and item flow distinct from Association', () => {
    const v4 = migrateV3ToV4(repoWith(
      { id: 'dep', kind: 'dependency', sourceId: 'a', targetId: 'b' },
      { id: 'alloc', kind: 'allocation', sourceId: 'a', targetId: 'b' },
      { id: 'imp', kind: 'packageImport', sourceId: 'a', targetId: 'b', visibility: 'private' },
      { id: 'bind', kind: 'binding', sourceId: 'a', targetId: 'b' },
    ));
    expect(v4.relationships.dep.metaclass).toBe('Dependency');
    expect(v4.relationships.alloc.metaclass).toBe('Allocate');
    expect(v4.relationships.imp.metaclass).toBe('PackageImport');
    expect(v4.relationships.imp.customProperties?.visibility).toBe('private');
    expect(v4.relationships.bind.metaclass).toBe('BindingConnector');
  });

  it('carries aggregation, roles, multiplicity and navigability on the association ends', () => {
    const multiplicity = { lower: 0, upper: '*' as const, ordered: false, unique: true };
    const v4 = migrateV3ToV4(repoWith(
      { id: 'comp', kind: 'composition', sourceId: 'whole', targetId: 'part', targetRole: 'wheels', targetMultiplicity: multiplicity },
      { id: 'agg', kind: 'sharedAggregation', sourceId: 'whole', targetId: 'part' },
      { id: 'plain', kind: 'association', sourceId: 'a', targetId: 'b' },
    ));
    expect(v4.relationships.comp.sourceEnd).toMatchObject({ aggregation: 'composite' });
    expect(v4.relationships.comp.targetEnd).toMatchObject({ role: 'wheels', multiplicity, isNavigable: true });
    expect(v4.relationships.agg.sourceEnd).toMatchObject({ aggregation: 'shared' });
    expect(v4.relationships.plain.sourceEnd).toBeUndefined();
  });

  it('keeps actors and use cases (they were dropped before)', () => {
    const repo = createEmptyRepository();
    repo.actors.user = { id: 'user', kind: 'actor', name: 'Driver', namespace: [], ownerId: 'model', isExternal: true, generalizationIds: [] };
    repo.useCases.drive = {
      id: 'drive', kind: 'useCase', name: 'Drive', namespace: [], ownerId: 'model',
      subjectId: 'sub', extensionPointIds: ['ep'], behaviorArtifactIds: [],
    };
    const v4 = migrateV3ToV4(repo);
    expect(v4.elements.user.metaclass).toBe('Actor');
    expect(v4.elements.drive).toMatchObject({ metaclass: 'UseCase', subjectIds: ['sub'], extensionPointIds: ['ep'] });
  });

  it('resolves a ValueType as a ValueType, not as a Block', () => {
    const repo = createEmptyRepository();
    repo.definitions.mass = { id: 'mass', kind: 'valueType', name: 'Mass', namespace: [], ownerId: 'model' };
    expect(resolveSemanticElement(repo, 'mass')?.metaclass).toBe('ValueType');
  });
});
