import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type PropertyDefinition, type SysmlRepository } from './model';
import { resolveInheritedFeatures, validateBlockDefinition } from './bdd';
import { isSameOrSubtype, resolveInheritance } from './policy';
import { validateSysmlRepository } from './validation';
import { effectiveSupertypeIds } from './services/supertypes';
import { findPortDefinition } from './ibd';
import { loadRepository, serializeRepository } from './persistence';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const block = (id: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', isAbstract: false, isLeaf: false, ownerId: 'model',
  properties: [], ports: [], operations: [], constraints: [], ...extra,
});
const part = (id: string, typeId: string, extra: Partial<PropertyDefinition> = {}): PropertyDefinition => ({
  id, name: id, kind: 'part', typeId, multiplicity: one, ...extra,
});

function vehicleModel(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.engine = block('engine');
  repo.definitions.diesel = block('diesel');
  repo.relationships.dieselIsEngine = { id: 'dieselIsEngine', kind: 'generalization', sourceId: 'diesel', targetId: 'engine' };
  repo.definitions.vehicle = block('vehicle', { properties: [part('engineProp', 'engine')], ports: [] });
  return repo;
}

describe('Generalization gives inheritance without a second write', () => {
  it('treats a drawn Block-to-Block Generalization as a supertype', () => {
    const repo = vehicleModel();
    expect((repo.definitions.diesel as BlockDefinition).supertypeIds).toBeUndefined();
    expect(effectiveSupertypeIds(repo, 'diesel')).toEqual(['engine']);
  });

  it('inherits parts and ports through the drawn Generalization', () => {
    const repo = vehicleModel();
    (repo.definitions.engine as BlockDefinition).properties.push(part('cylinder', 'engine'));
    (repo.definitions.engine as BlockDefinition).ports.push({
      id: 'fuelIn', name: 'fuelIn', kind: 'standard', typeId: '', direction: 'in', isConjugated: false, multiplicity: one,
    });
    const resolved = resolveInheritedFeatures(repo, 'diesel');
    expect(resolved.properties.map(p => p.id)).toContain('cylinder');
    expect(resolved.ports.map(p => p.id)).toContain('fuelIn');
    expect(findPortDefinition(repo, 'diesel', 'fuelIn')?.id).toBe('fuelIn');
    expect(resolveInheritance(repo, 'diesel').features.map(f => f.featureId)).toEqual(expect.arrayContaining(['cylinder', 'fuelIn']));
  });

  it('stops inheriting when the Generalization is removed, and ignores non-Block endpoints', () => {
    const repo = vehicleModel();
    expect(effectiveSupertypeIds(repo, 'diesel')).toEqual(['engine']);
    delete repo.relationships.dieselIsEngine;
    repo.revision += 1; // in-place mutation: bump the revision like a committed change
    expect(effectiveSupertypeIds(repo, 'diesel')).toEqual([]);
    repo.definitions.signal = { id: 'signal', name: 'Signal', namespace: [], kind: 'valueType' };
    repo.relationships.odd = { id: 'odd', kind: 'generalization', sourceId: 'diesel', targetId: 'signal' };
    repo.revision += 1;
    expect(effectiveSupertypeIds(repo, 'diesel')).toEqual([]);
  });

  it('keeps stored supertypeIds and does not duplicate a supertype that is stored and drawn', () => {
    const repo = vehicleModel();
    (repo.definitions.diesel as BlockDefinition).supertypeIds = ['engine'];
    repo.revision += 1;
    expect(effectiveSupertypeIds(repo, 'diesel')).toEqual(['engine']);
  });

  it('reports a leaf specialization and a cycle created by drawn Generalizations', () => {
    const repo = vehicleModel();
    (repo.definitions.engine as BlockDefinition).isLeaf = true;
    expect(validateBlockDefinition(repo, 'diesel').map(d => d.code)).toContain('LEAF_SPECIALIZATION');
    (repo.definitions.engine as BlockDefinition).isLeaf = false;
    repo.relationships.loop = { id: 'loop', kind: 'generalization', sourceId: 'engine', targetId: 'diesel' };
    repo.revision += 1;
    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).toContain('INHERITANCE_CYCLE');
  });
});

describe('Stored supertypes become Generalization relationships on load', () => {
  const stored = (): SysmlRepository => {
    const repo = createEmptyRepository();
    repo.definitions.engine = block('engine');
    repo.definitions.diesel = block('diesel', { supertypeIds: ['engine', 'ghost'] });
    return repo;
  };

  it('converts resolvable supertypes, keeps unresolved ones so they are still reported', () => {
    const loaded = loadRepository(serializeRepository(stored()));
    const rels = Object.values(loaded.repository.relationships);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ kind: 'generalization', sourceId: 'diesel', targetId: 'engine' });
    expect((loaded.repository.definitions.diesel as BlockDefinition).supertypeIds).toEqual(['ghost']);
    expect(loaded.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining(['SUPERTYPES_MATERIALIZED', 'MISSING_SUPERTYPE']));
    expect(loaded.migrated).toBe(true);
    // Inheritance is unchanged by the conversion.
    expect(effectiveSupertypeIds(loaded.repository, 'diesel')).toEqual(expect.arrayContaining(['engine']));
  });

  it('is idempotent and does not duplicate a Generalization that was already drawn', () => {
    const repo = stored();
    repo.relationships.drawn = { id: 'drawn', kind: 'generalization', sourceId: 'diesel', targetId: 'engine' };
    const once = loadRepository(serializeRepository(repo));
    expect(Object.values(once.repository.relationships)).toHaveLength(1);
    const twice = loadRepository(serializeRepository(once.repository));
    expect(Object.values(twice.repository.relationships)).toHaveLength(1);
    expect(twice.diagnostics.map(d => d.code)).not.toContain('SUPERTYPES_MATERIALIZED');
  });
});

describe('Redefinition and subsetting may narrow to a subtype', () => {
  it('knows same type, direct subtype, indirect subtype and unrelated types', () => {
    const repo = vehicleModel();
    repo.definitions.turbo = block('turbo');
    repo.relationships.turboIsDiesel = { id: 'turboIsDiesel', kind: 'generalization', sourceId: 'turbo', targetId: 'diesel' };
    expect(isSameOrSubtype(repo, 'engine', 'engine')).toBe(true);
    expect(isSameOrSubtype(repo, 'diesel', 'engine')).toBe(true);
    expect(isSameOrSubtype(repo, 'turbo', 'engine')).toBe(true);
    expect(isSameOrSubtype(repo, 'engine', 'diesel')).toBe(false);
    expect(isSameOrSubtype(repo, 'vehicle', 'engine')).toBe(false);
  });

  it('accepts redefining a part with a subtype and rejects an unrelated type', () => {
    const repo = vehicleModel();
    repo.definitions.truck = block('truck', {
      supertypeIds: ['vehicle'],
      properties: [part('dieselProp', 'diesel', { redefinesId: 'engineProp' })],
    });
    expect(validateBlockDefinition(repo, 'truck').map(d => d.code)).not.toContain('INCOMPATIBLE_REDEFINITION');
    repo.definitions.wheel = block('wheel');
    (repo.definitions.truck as BlockDefinition).properties = [part('wheelProp', 'wheel', { redefinesId: 'engineProp' })];
    expect(validateBlockDefinition(repo, 'truck').map(d => d.code)).toContain('INCOMPATIBLE_REDEFINITION');
  });

  it('applies the same subtype rule to subsetting', () => {
    const repo = vehicleModel();
    repo.definitions.truck = block('truck', {
      supertypeIds: ['vehicle'],
      properties: [part('dieselProp', 'diesel', { subsetsId: 'engineProp' })],
    });
    expect(validateBlockDefinition(repo, 'truck').map(d => d.code)).not.toContain('INVALID_SUBSETTING_MULTIPLICITY');
  });
});

describe('Composition limits instances, not part types', () => {
  it('allows one Block to be the part type of several wholes', () => {
    const repo = createEmptyRepository();
    repo.definitions.bolt = block('bolt');
    repo.definitions.wheel = block('wheel');
    repo.definitions.frame = block('frame');
    repo.relationships.c1 = { id: 'c1', kind: 'composition', sourceId: 'wheel', targetId: 'bolt' };
    repo.relationships.c2 = { id: 'c2', kind: 'composition', sourceId: 'frame', targetId: 'bolt' };
    expect(validateSysmlRepository(repo).diagnostics.map(d => d.code)).not.toContain('MULTIPLE_COMPOSITE_OWNERS');
  });
});
