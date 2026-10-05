import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository,
  type BlockDefinition,
  type ConnectorUsage,
  type PortDefinition,
  type PropertyDefinition,
  type SysmlRepository,
} from './model';
import { createIbdConnector, validateConnector } from './ibd';
import {
  connectorEndKey,
  legacyEndToPath,
  resolveConnectorEnd,
} from './connectorEnds';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const port = (id: string, direction: PortDefinition['direction'], isConjugated = false, typeId = 'if'): PortDefinition => ({
  id, name: id, kind: 'proxy', typeId, direction, isConjugated, multiplicity: one,
});
const prop = (id: string, typeId: string, kind: PropertyDefinition['kind'] = 'part'): PropertyDefinition => ({
  id, name: id, kind, typeId, multiplicity: one,
});
const block = (id: string, properties: PropertyDefinition[] = [], ports: PortDefinition[] = [], supertypeIds: string[] = []): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
  supertypeIds, properties, ports, operations: [], constraints: [],
});
const codes = (repo: SysmlRepository, id: string) => validateConnector(repo, id).map(d => d.code);

/**
 * system
 *   a: Left  { inner: Source { out: cOut } , boundaryish: -}
 *   b: Right { inner2: Sink { in: dIn } }
 * Source / Sink are typed two levels below the context.
 */
const model = (): SysmlRepository => {
  const repo = createEmptyRepository();
  repo.definitions.if = { id: 'if', name: 'IF', namespace: [], kind: 'interface', features: [] };
  repo.definitions.source = block('source', [], [port('cOut', 'out')]);
  repo.definitions.sink = block('sink', [], [port('dIn', 'in')]);
  repo.definitions.left = block('left', [prop('inner', 'source')], [port('leftIn', 'in')]);
  repo.definitions.right = block('right', [prop('inner2', 'sink')], [port('rightOut', 'out')]);
  repo.definitions.system = block('system', [prop('a', 'left'), prop('b', 'right'), prop('v', 'if', 'value')], [port('sysIn', 'in')]);
  return repo;
};

const connector = (over: Partial<ConnectorUsage> & Pick<ConnectorUsage, 'sourceEnd' | 'targetEnd'>): ConnectorUsage => ({
  id: 'c', kind: 'assembly', ownerId: 'system',
  sourcePortId: connectorEndKey(over.sourceEnd as { path: string[] }),
  targetPortId: connectorEndKey(over.targetEnd as { path: string[] }),
  ...over,
});

describe('path-based connector ends', () => {
  it('validates a nested assembly connector two levels deep', () => {
    const repo = model();
    repo.connectors.c = connector({
      sourceEnd: { path: ['a', 'inner'], portId: 'cOut' },
      targetEnd: { path: ['b', 'inner2'], portId: 'dIn' },
    });
    expect(validateConnector(repo, 'c')).toEqual([]);
  });

  it('creates nested ends through createIbdConnector and keeps the key in the port ids', () => {
    const repo = model();
    const result = createIbdConnector(repo, {
      id: 'c', kind: 'assembly', ownerId: 'system',
      sourcePortId: 'a/inner#cOut', targetPortId: 'b/inner2#dIn',
      sourceEnd: { path: ['a', 'inner'], portId: 'cOut' },
      targetEnd: { path: ['b', 'inner2'], portId: 'dIn' },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.connector?.sourceEnd).toEqual({ path: ['a', 'inner'], portId: 'cOut' });
  });

  it('allows part ends at any depth for assembly connectors', () => {
    const repo = model();
    repo.connectors.c = connector({ sourceEnd: { path: ['a', 'inner'] }, targetEnd: { path: ['b'] } });
    expect(validateConnector(repo, 'c')).toEqual([]);
  });

  it('computes effective direction with conjugation of the port definition', () => {
    const repo = model();
    const end = { path: ['a', 'inner'], portId: 'cOut' };
    expect(resolveConnectorEnd(repo, 'system', end).resolved?.effectiveDirection).toBe('out');
    (repo.definitions.source as BlockDefinition).ports[0].isConjugated = true;
    expect(resolveConnectorEnd(repo, 'system', end).resolved?.effectiveDirection).toBe('in');
  });

  it('rejects in-to-in once a conjugation turns the source around, and accepts it again when both flip', () => {
    const repo = model();
    repo.connectors.c = connector({
      sourceEnd: { path: ['a', 'inner'], portId: 'cOut' },
      targetEnd: { path: ['b', 'inner2'], portId: 'dIn' },
    });
    (repo.definitions.source as BlockDefinition).ports[0].isConjugated = true; // out -> effective in
    expect(codes(repo, 'c')).toContain('INCOMPATIBLE_DIRECTION');
    (repo.definitions.sink as BlockDefinition).ports[0].isConjugated = true; // in -> effective out
    expect(codes(repo, 'c')).toEqual([]);
  });

  it('resolves properties and ports inherited through supertypes', () => {
    const repo = model();
    repo.definitions.baseSource = block('baseSource', [], [port('baseOut', 'out')]);
    repo.definitions.source = block('source', [], [], ['baseSource']);
    repo.definitions.baseLeft = block('baseLeft', [prop('inner', 'source')]);
    repo.definitions.left = block('left', [], [port('leftIn', 'in')], ['baseLeft']);
    const end = resolveConnectorEnd(repo, 'system', { path: ['a', 'inner'], portId: 'baseOut' });
    expect(end.diagnostics).toEqual([]);
    expect(end.resolved?.port?.id).toBe('baseOut');
    expect(end.resolved?.depth).toBe(2);

    repo.definitions.baseSystem = block('baseSystem', [prop('c', 'right')]);
    repo.definitions.system = block('system', [prop('a', 'left'), prop('b', 'right')], [], ['baseSystem']);
    repo.connectors.c = connector({
      sourceEnd: { path: ['a', 'inner'], portId: 'baseOut' },
      targetEnd: { path: ['c', 'inner2'], portId: 'dIn' },
    });
    expect(validateConnector(repo, 'c')).toEqual([]);
  });

  it('rejects unresolvable, non-part and empty paths', () => {
    const repo = model();
    expect(resolveConnectorEnd(repo, 'system', { path: ['a', 'nope'] }).diagnostics[0]?.code).toBe('MISSING_CONNECTOR_ENDPOINT');
    expect(resolveConnectorEnd(repo, 'system', { path: ['v'] }).diagnostics[0]?.code).toBe('INVALID_CONNECTOR_PATH');
    expect(resolveConnectorEnd(repo, 'system', { path: ['a', 'inner'], portId: 'missing' }).diagnostics[0]?.code).toBe('MISSING_CONNECTOR_ENDPOINT');
    expect(resolveConnectorEnd(repo, 'system', { path: [] }).diagnostics[0]?.code).toBe('MISSING_CONNECTOR_ENDPOINT');
    // a segment is looked up under the previous type only, not under the context
    expect(resolveConnectorEnd(repo, 'system', { path: ['inner'] }).diagnostics[0]?.code).toBe('MISSING_CONNECTOR_ENDPOINT');

    repo.connectors.bad = connector({ id: 'bad', sourceEnd: { path: ['a', 'nope'], portId: 'cOut' }, targetEnd: { path: ['b', 'inner2'], portId: 'dIn' } });
    expect(codes(repo, 'bad')).toContain('MISSING_CONNECTOR_ENDPOINT');
    const created = createIbdConnector(repo, {
      id: 'x', kind: 'assembly', ownerId: 'system', sourcePortId: 'v', targetPortId: 'b',
      sourceEnd: { path: ['v'] }, targetEnd: { path: ['b'] },
    });
    expect(created.connector).toBeUndefined();
    expect(created.diagnostics.map(d => d.code)).toContain('INVALID_CONNECTOR_PATH');
  });

  it('rejects self, duplicate (either order) and boundary ends on an assembly', () => {
    const repo = model();
    const src = { path: ['a', 'inner'], portId: 'cOut' };
    const tgt = { path: ['b', 'inner2'], portId: 'dIn' };
    repo.connectors.c1 = connector({ id: 'c1', sourceEnd: src, targetEnd: tgt });
    repo.connectors.c2 = connector({ id: 'c2', sourceEnd: tgt, targetEnd: src });
    expect(codes(repo, 'c2')).toContain('DUPLICATE_CONNECTOR');
    repo.connectors.self = connector({ id: 'self', sourceEnd: src, targetEnd: src });
    expect(codes(repo, 'self')).toContain('SELF_CONNECTOR');
    repo.connectors.boundary = connector({ id: 'boundary', sourceEnd: { path: [], portId: 'sysIn' }, targetEnd: tgt });
    expect(codes(repo, 'boundary')).toContain('INVALID_CONNECTOR_CONTEXT');
  });

  it('rejects incompatible interfaces on nested ends', () => {
    const repo = model();
    repo.definitions.other = { id: 'other', name: 'Other', namespace: [], kind: 'interface', features: [] };
    (repo.definitions.sink as BlockDefinition).ports[0].typeId = 'other';
    repo.connectors.c = connector({ sourceEnd: { path: ['a', 'inner'], portId: 'cOut' }, targetEnd: { path: ['b', 'inner2'], portId: 'dIn' } });
    expect(codes(repo, 'c')).toContain('INCOMPATIBLE_INTERFACE');
  });

  it('keeps delegation to boundary <-> direct inner port, and rejects deeper or part ends', () => {
    const repo = model();
    repo.connectors.ok = connector({ id: 'ok', kind: 'delegation', sourceEnd: { path: [], portId: 'sysIn' }, targetEnd: { path: ['a'], portId: 'leftIn' } });
    expect(validateConnector(repo, 'ok')).toEqual([]);

    (repo.definitions.source as BlockDefinition).ports.push(port('deepIn', 'in'));
    repo.connectors.deep = connector({ id: 'deep', kind: 'delegation', sourceEnd: { path: [], portId: 'sysIn' }, targetEnd: { path: ['a', 'inner'], portId: 'deepIn' } });
    expect(codes(repo, 'deep')).toContain('INVALID_DELEGATION_ENDPOINTS');

    repo.connectors.partEnd = connector({ id: 'partEnd', kind: 'delegation', sourceEnd: { path: [], portId: 'sysIn' }, targetEnd: { path: ['a'] } });
    expect(codes(repo, 'partEnd')).toContain('INVALID_PART_END_CONNECTOR_KIND');

    repo.connectors.twoInner = connector({ id: 'twoInner', kind: 'delegation', sourceEnd: { path: ['a'], portId: 'leftIn' }, targetEnd: { path: ['b'], portId: 'rightOut' } });
    expect(codes(repo, 'twoInner')).toContain('INVALID_DELEGATION_ENDPOINTS');

    // delegation passes the same direction through the boundary: in -> out is wrong
    repo.connectors.wrongDir = connector({ id: 'wrongDir', kind: 'delegation', sourceEnd: { path: [], portId: 'sysIn' }, targetEnd: { path: ['b'], portId: 'rightOut' } });
    expect(codes(repo, 'wrongDir')).toContain('INCOMPATIBLE_DIRECTION');
  });

  it('leaves usage-id connectors unchanged and lets them mix with path ends', () => {
    const repo = model();
    repo.definitions.system = block('system', [prop('a', 'left'), prop('b', 'right')], [port('sysIn', 'in')]);
    repo.usages.pa = { id: 'pa', kind: 'part', name: 'a', ownerId: 'system', typeId: 'left', aggregation: 'composite', multiplicity: one, propertyId: 'a' };
    repo.usages.pb = { id: 'pb', kind: 'part', name: 'b', ownerId: 'system', typeId: 'right', aggregation: 'composite', multiplicity: one, propertyId: 'b' };
    repo.usages.paIn = { id: 'paIn', kind: 'port', name: 'leftIn', ownerId: 'pa', definitionId: 'leftIn' };
    repo.usages.pbOut = { id: 'pbOut', kind: 'port', name: 'rightOut', ownerId: 'pb', definitionId: 'rightOut' };
    repo.connectors.legacy = { id: 'legacy', kind: 'assembly', ownerId: 'system', sourcePortId: 'pbOut', targetPortId: 'paIn' };
    expect(validateConnector(repo, 'legacy')).toEqual([]);

    expect(legacyEndToPath(repo, 'system', 'paIn')).toEqual({ path: ['a'], portId: 'leftIn' });
    expect(legacyEndToPath(repo, 'system', 'pb')).toEqual({ path: ['b'] });

    repo.connectors.mixed = {
      id: 'mixed', kind: 'assembly', ownerId: 'system',
      sourcePortId: 'b#rightOut', targetPortId: 'paIn',
      sourceEnd: { path: ['b'], portId: 'rightOut' },
    };
    // same pair as the legacy connector -> flagged as a duplicate across representations
    expect(codes(repo, 'mixed')).toContain('DUPLICATE_CONNECTOR');
  });
});
