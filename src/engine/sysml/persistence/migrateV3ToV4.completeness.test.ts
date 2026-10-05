import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type SysmlRepository } from '../model';
import { migrateV3ToV4 } from './migrateV3ToV4';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const block = (id: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports: [], operations: [], constraints: [], ...extra,
});

function fullModel(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.packages.pkg = { id: 'pkg', kind: 'package', name: 'Pkg', namespace: [], ownerId: 'model' };
  repo.definitions.base = block('base', { ports: [{ id: 'pOut', name: 'out', kind: 'standard', typeId: '', direction: 'out', isConjugated: false, multiplicity: one }] });
  repo.definitions.child = block('child');
  repo.definitions.sys = block('sys', { ports: [{ id: 'pIn', name: 'in', kind: 'standard', typeId: '', direction: 'in', isConjugated: false, multiplicity: one }] });
  repo.definitions.mass = { id: 'mass', kind: 'valueType', name: 'Mass', namespace: [], ownerId: 'model' };
  repo.definitions.if1 = { id: 'if1', kind: 'interface', name: 'If1', namespace: [], ownerId: 'model', features: [] };
  repo.requirements.req = { id: 'req', kind: 'requirement', name: 'Req', namespace: [], ownerId: 'model', requirementId: 'R1', text: 't', status: 'draft', version: '1' };
  repo.verificationCases.vc = { id: 'vc', kind: 'verificationCase', name: 'VC', namespace: [], ownerId: 'model', method: 'test', verifiesRequirementIds: ['req'] };
  repo.actors.driver = { id: 'driver', kind: 'actor', name: 'Driver', namespace: [], ownerId: 'model', isExternal: true, generalizationIds: [] };
  repo.useCases.drive = { id: 'drive', kind: 'useCase', name: 'Drive', namespace: [], ownerId: 'model', extensionPointIds: [], behaviorArtifactIds: [] };
  repo.usages.p1 = { id: 'p1', kind: 'part', name: 'p1', ownerId: 'sys', typeId: 'child', aggregation: 'composite', multiplicity: one };
  repo.usages.u1 = { id: 'u1', kind: 'port', name: 'u1', ownerId: 'p1', definitionId: 'pOut' };
  repo.connectors.c1 = { id: 'c1', kind: 'delegation', ownerId: 'sys', sourcePortId: 'pIn', targetPortId: 'u1' };
  repo.relationships.gen = { id: 'gen', kind: 'generalization', sourceId: 'child', targetId: 'base' };
  return repo;
}

describe('V4 view is complete (decision D4: generated from the saved model)', () => {
  it('contains every stored element, relationship and connector', () => {
    const v3 = fullModel();
    const v4 = migrateV3ToV4(v3);
    const missing: string[] = [];
    const elementIds = [
      ...Object.keys(v3.packages).filter(id => id !== 'model'), ...Object.keys(v3.definitions), ...Object.keys(v3.usages),
      ...Object.keys(v3.requirements), ...Object.keys(v3.verificationCases), ...Object.keys(v3.actors), ...Object.keys(v3.useCases),
    ];
    for (const id of elementIds) if (!v4.elements[id]) missing.push(`element:${id}`);
    for (const id of [...Object.keys(v3.relationships), ...Object.keys(v3.connectors)]) if (!v4.relationships[id]) missing.push(`relationship:${id}`);
    expect(missing).toEqual([]);
  });

  it('maps connectors to Connector / BindingConnector with their ends', () => {
    const v3 = fullModel();
    v3.connectors.b1 = { id: 'b1', kind: 'binding', ownerId: 'sys', sourcePortId: 'pIn', targetPortId: 'u1' };
    const v4 = migrateV3ToV4(v3);
    expect(v4.relationships.c1).toMatchObject({ metaclass: 'Connector', sourceId: 'pIn', targetId: 'u1', customProperties: { sourceKind: 'delegation' } });
    expect(v4.relationships.b1.metaclass).toBe('BindingConnector');
    expect(v4.indexes.bySourceEndpoint.pIn).toEqual(expect.arrayContaining(['c1', 'b1']));
  });

  it('derives generalIds from drawn Generalizations as well as stored supertypes', () => {
    const v3 = fullModel();
    expect((v3.definitions.child as BlockDefinition).supertypeIds).toBeUndefined();
    expect((migrateV3ToV4(v3).elements.child as { generalIds?: string[] }).generalIds).toEqual(['base']);
  });
});
