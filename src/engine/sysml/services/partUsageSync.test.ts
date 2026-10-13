import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type SysmlRepository } from '../model';
import { createBaseline, loadRepository, serializeRepository } from '../persistence';
import { hash, stableStringify } from '../requirements';
import { findPartUsageDrift, reconcilePartUsages } from './partUsageSync';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const block = (id: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [], ...extra,
});

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.motor = block('motor');
  repo.definitions.vehicle = block('vehicle');
  return repo;
}

describe('a part is a Block property with a derived occurrence', () => {
  it('creates the occurrence for a part property that has none', () => {
    const repo = model();
    (repo.definitions.vehicle as BlockDefinition).properties.push({ id: 'p-motor', name: 'motor', kind: 'part', typeId: 'motor', multiplicity: one });
    expect(findPartUsageDrift(repo)).toEqual([{ code: 'PROPERTY_WITHOUT_PART_USAGE', elementId: 'p-motor', ownerId: 'vehicle' }]);
    const created = reconcilePartUsages(repo);
    expect(created).toHaveLength(1);
    expect(repo.usages[created[0]]).toMatchObject({ kind: 'part', ownerId: 'vehicle', typeId: 'motor', aggregation: 'composite', propertyId: 'p-motor' });
    expect(findPartUsageDrift(repo)).toEqual([]);
  });

  it('creates the property for a usage that has none, keeping the usage and its identity', () => {
    const repo = model();
    repo.usages.u1 = { id: 'u1', kind: 'part', name: 'left', ownerId: 'vehicle', typeId: 'motor', aggregation: 'reference', multiplicity: one };
    repo.usages.port1 = { id: 'port1', kind: 'port', name: 'x', ownerId: 'u1', definitionId: 'whatever' };
    const created = reconcilePartUsages(repo);
    const property = (repo.definitions.vehicle as BlockDefinition).properties.find(p => p.id === created[0])!;
    expect(property).toMatchObject({ name: 'left', kind: 'reference', typeId: 'motor' });
    expect(repo.usages.u1.kind === 'part' && repo.usages.u1.propertyId).toBe(property.id);
    expect(repo.usages.port1.ownerId).toBe('u1'); // ports and ids are untouched
  });

  it('links a legacy usage to the property with the same name and type instead of duplicating it', () => {
    const repo = model();
    (repo.definitions.vehicle as BlockDefinition).properties.push({ id: 'p-motor', name: 'motor', kind: 'part', typeId: 'motor', multiplicity: one });
    repo.usages.u1 = { id: 'u1', kind: 'part', name: 'motor', ownerId: 'vehicle', typeId: 'motor', aggregation: 'composite', multiplicity: one };
    expect(reconcilePartUsages(repo)).toEqual([]);
    expect(repo.usages.u1.kind === 'part' && repo.usages.u1.propertyId).toBe('p-motor');
    expect((repo.definitions.vehicle as BlockDefinition).properties).toHaveLength(1);
  });

  it('is idempotent, never deletes, and reports nested part usages without moving them', () => {
    const repo = model();
    (repo.definitions.vehicle as BlockDefinition).properties.push({ id: 'p-motor', name: 'motor', kind: 'part', typeId: 'motor', multiplicity: one });
    repo.usages.nested = { id: 'nested', kind: 'part', name: 'n', ownerId: 'u-unknown-part', typeId: 'motor', aggregation: 'composite', multiplicity: one };
    reconcilePartUsages(repo);
    const snapshot = JSON.stringify(repo);
    expect(reconcilePartUsages(repo)).toEqual([]);
    expect(JSON.stringify(repo)).toBe(snapshot);
    const created = Object.values(repo.usages).find(u => u.kind === 'part' && u.ownerId === 'vehicle')!;
    repo.usages.deep = { id: 'deep', kind: 'part', name: 'd', ownerId: created.id, typeId: 'motor', aggregation: 'composite', multiplicity: one };
    expect(findPartUsageDrift(repo).map(d => d.code)).toContain('NESTED_PART_USAGE');
    expect(repo.usages.deep.ownerId).toBe(created.id);
  });

  it('does not invent an occurrence for a property typed by something that is not a Block', () => {
    const repo = model();
    repo.definitions.mass = { id: 'mass', kind: 'valueType', name: 'Mass', namespace: [], ownerId: 'model' };
    (repo.definitions.vehicle as BlockDefinition).properties.push({ id: 'p-mass', name: 'mass', kind: 'part', typeId: 'mass', multiplicity: one });
    expect(reconcilePartUsages(repo)).toEqual([]);
  });
});

describe('loading completes parts and carries baselines', () => {
  it('reconciles on load, once, and keeps a baseline matching', () => {
    const repo = model();
    (repo.definitions.vehicle as BlockDefinition).properties.push({ id: 'p-motor', name: 'motor', kind: 'part', typeId: 'motor', multiplicity: one });
    repo.usages.u1 = { id: 'u1', kind: 'part', name: 'extra', ownerId: 'vehicle', typeId: 'motor', aggregation: 'composite', multiplicity: one };
    const { repository: withBaseline } = createBaseline(repo, { id: 'bl', name: 'BL', createdAt: '2026-01-01T00:00:00.000Z' });

    // A file written before format 5: parts exist as usage records next to (or without) their properties.
    const loaded = loadRepository(structuredClone(withBaseline));
    expect(loaded.diagnostics.map(d => d.code)).toContain('PART_USAGES_RECONCILED');
    // Format 5: every part is only its Block property, so no usage record is left to drift from it.
    expect(loaded.repository.usages).toEqual({});
    const vehicle = loaded.repository.definitions.vehicle as BlockDefinition;
    expect(vehicle.properties.map(p => p.name).sort()).toEqual(['extra', 'motor']);
    const hashes = loaded.repository.baselines.bl.elementHashes!;
    expect(hashes.vehicle).toBe(hash(stableStringify(loaded.repository.definitions.vehicle)));
    expect(hashes.u1).toBeUndefined(); // the retired usage record left the snapshot
    expect(Object.keys(hashes).filter(id => id.startsWith('usage:'))).toEqual([]);

    const again = loadRepository(serializeRepository(loaded.repository));
    expect(again.diagnostics.map(d => d.code)).not.toContain('PART_USAGES_RECONCILED');
    expect(again.upgradeReport).toBeUndefined();
    expect(again.repository.baselines.bl.elementHashes).toEqual(hashes);
  });
});