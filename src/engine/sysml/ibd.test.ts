import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type PortDefinition, type SysmlRepository } from './model';
import { deriveIbdView, resolvePortUsage, validateConnector, validateItemFlow } from './ibd';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const block = (id: string, ports: PortDefinition[] = [], supertypeIds: string[] = []): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
  supertypeIds, properties: [], ports, operations: [], constraints: [],
});
const port = (id: string, direction: PortDefinition['direction'], typeId = 'if', kind: PortDefinition['kind'] = 'proxy', isConjugated = false): PortDefinition => ({
  id, name: id, kind, typeId, direction, isConjugated, multiplicity: one,
});
const model = (): SysmlRepository => {
  const repo = createEmptyRepository();
  repo.definitions.if = { id: 'if', name: 'IF', namespace: [], kind: 'interface', features: ['signal'] };
  repo.definitions.signal = { id: 'signal', name: 'Signal', namespace: [], kind: 'valueType' };
  repo.definitions.base = block('base', [port('out-def', 'out')]);
  repo.definitions.component = block('component', [port('in-def', 'in')], ['base']);
  repo.definitions.system = block('system', [port('boundary-def', 'out')]);
  repo.usages.a = { id: 'a', name: 'a', kind: 'part', ownerId: 'system', typeId: 'component', aggregation: 'composite', multiplicity: one };
  repo.usages.b = { id: 'b', name: 'b', kind: 'part', ownerId: 'system', typeId: 'component', aggregation: 'composite', multiplicity: one };
  repo.usages.aOut = { id: 'aOut', name: 'out', kind: 'port', ownerId: 'a', definitionId: 'out-def' };
  repo.usages.bIn = { id: 'bIn', name: 'in', kind: 'port', ownerId: 'b', definitionId: 'in-def' };
  repo.usages.boundary = { id: 'boundary', name: 'boundary', kind: 'port', ownerId: 'system', definitionId: 'boundary-def' };
  return repo;
};

describe('canonical IBD semantics', () => {
  it('resolves inherited port definitions and effective conjugated direction', () => {
    const repo = model();
    const inherited = resolvePortUsage(repo, 'aOut');
    expect(inherited?.definition.id).toBe('out-def');
    expect(inherited?.effectiveDirection).toBe('out');

    (repo.definitions.base as BlockDefinition).ports[0].isConjugated = true;
    expect(resolvePortUsage(repo, 'aOut')?.effectiveDirection).toBe('in');
  });

  it('accepts compatible out-to-in assembly connectors within one owning context', () => {
    const repo = model();
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'system', sourcePortId: 'aOut', targetPortId: 'bIn' };
    expect(validateConnector(repo, 'c')).toEqual([]);
  });

  it('rejects incompatible direction/interface, duplicate, and cross-boundary assembly', () => {
    const repo = model();
    repo.definitions.otherIf = { id: 'otherIf', name: 'Other', namespace: [], kind: 'interface', features: [] };
    (repo.definitions.component as BlockDefinition).ports.push(port('other-out', 'out', 'otherIf'));
    repo.usages.bOther = { id: 'bOther', name: 'other', kind: 'port', ownerId: 'b', definitionId: 'other-out' };
    repo.connectors.c1 = { id: 'c1', kind: 'assembly', ownerId: 'system', sourcePortId: 'aOut', targetPortId: 'bOther' };
    repo.connectors.c2 = { id: 'c2', kind: 'assembly', ownerId: 'system', sourcePortId: 'aOut', targetPortId: 'bOther' };
    repo.connectors.cross = { id: 'cross', kind: 'assembly', ownerId: 'a', sourcePortId: 'aOut', targetPortId: 'bIn' };

    expect(validateConnector(repo, 'c1').map(d => d.code)).toEqual(expect.arrayContaining(['INCOMPATIBLE_PORT_DIRECTION', 'INCOMPATIBLE_INTERFACE', 'DUPLICATE_CONNECTOR']));
    expect(validateConnector(repo, 'cross').map(d => d.code)).toContain('INVALID_CONNECTOR_CONTEXT');
  });

  it('permits delegation only between a boundary port and an internal part port', () => {
    const repo = model();
    repo.connectors.good = { id: 'good', kind: 'delegation', ownerId: 'system', sourcePortId: 'boundary', targetPortId: 'bIn' };
    repo.connectors.bad = { id: 'bad', kind: 'delegation', ownerId: 'system', sourcePortId: 'aOut', targetPortId: 'bIn' };

    expect(validateConnector(repo, 'good')).toEqual([]);
    expect(validateConnector(repo, 'bad').map(d => d.code)).toContain('INVALID_DELEGATION_ENDPOINTS');
  });

  it('validates item flow existence, direction, and conveyed type', () => {
    const repo = model();
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'system', sourcePortId: 'aOut', targetPortId: 'bIn', itemFlowId: 'signal' };
    expect(validateItemFlow(repo, 'c')).toEqual([]);
    repo.connectors.c.itemFlowId = 'missing';
    expect(validateItemFlow(repo, 'c').map(d => d.code)).toContain('MISSING_ITEM_FLOW_TYPE');
  });

  it('derives a nested IBD view without unrelated usages or connectors', () => {
    const repo = model();
    repo.usages.nested = { id: 'nested', name: 'nested', kind: 'part', ownerId: 'a', typeId: 'component', aggregation: 'composite', multiplicity: one };
    repo.usages.unrelated = { id: 'unrelated', name: 'x', kind: 'part', ownerId: 'component', typeId: 'component', aggregation: 'reference', multiplicity: one };
    repo.connectors.c = { id: 'c', kind: 'assembly', ownerId: 'system', sourcePortId: 'aOut', targetPortId: 'bIn' };

    const view = deriveIbdView(repo, 'system');
    expect(view.parts.map(p => p.id).sort()).toEqual(['a', 'b', 'nested']);
    expect(view.ports.map(p => p.usage.id).sort()).toEqual(['aOut', 'bIn', 'boundary']);
    expect(view.connectors.map(c => c.id)).toEqual(['c']);
  });
});
