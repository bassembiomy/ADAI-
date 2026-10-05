import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository,
  type BlockDefinition,
  type PortDefinition,
  type PropertyDefinition,
  type SysmlRepository,
} from '../engine/sysml/model';
import { projectLegacyDiagram } from './sysmlCommandGateway';
import { buildCreateIbdConnectorCommand } from './sysmlIbdConnectorCommands';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const port = (id: string, direction: PortDefinition['direction']): PortDefinition => ({
  id, name: id, kind: 'proxy', typeId: 'if', direction, isConjugated: false, multiplicity: one,
});
const prop = (id: string, typeId: string): PropertyDefinition => ({ id, name: `${id}-name`, kind: 'part', typeId, multiplicity: one });
const block = (id: string, properties: PropertyDefinition[] = [], ports: PortDefinition[] = []): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', isAbstract: false, isLeaf: false, properties, ports, operations: [], constraints: [],
});

const model = (): SysmlRepository => {
  const repo = createEmptyRepository();
  repo.definitions.if = { id: 'if', name: 'IF', namespace: [], kind: 'interface', features: [] };
  repo.definitions.source = block('source', [], [port('cOut', 'out')]);
  repo.definitions.sink = block('sink', [], [port('dIn', 'in')]);
  repo.definitions.left = block('left', [prop('inner', 'source')]);
  repo.definitions.right = block('right', [prop('inner2', 'sink')]);
  repo.definitions.system = block('system', [prop('a', 'left'), prop('b', 'right')], [port('sysIn', 'in')]);
  return repo;
};

const nestedIntent = {
  contextId: 'system',
  source: { path: ['a', 'inner'], portId: 'cOut' },
  target: { path: ['b', 'inner2'], portId: 'dIn' },
  connectorId: 'c1',
};

describe('path-based connector commands and projection', () => {
  it('builds a createAndPresent command with ConnectorEnds and no usage records', () => {
    const plan = buildCreateIbdConnectorCommand(model(), nestedIntent);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.ok).toBe(true);
    expect(plan.command?.type).toBe('createAndPresent');
    expect(plan.connector?.sourceEnd).toEqual({ path: ['a', 'inner'], portId: 'cOut' });
    expect(plan.connector?.targetEnd).toEqual({ path: ['b', 'inner2'], portId: 'dIn' });
    expect(plan.connector?.kind).toBe('assembly');
  });

  it('infers delegation for boundary <-> direct inner port and rejects invalid paths', () => {
    const repo = model();
    (repo.definitions.left as BlockDefinition).ports.push(port('leftIn', 'in'));
    const plan = buildCreateIbdConnectorCommand(repo, {
      contextId: 'system', source: { path: [], portId: 'sysIn' }, target: { path: ['a'], portId: 'leftIn' },
    });
    expect(plan.ok).toBe(true);
    expect(plan.connector?.kind).toBe('delegation');

    const bad = buildCreateIbdConnectorCommand(repo, { ...nestedIntent, target: { path: ['b', 'missing'], portId: 'dIn' } });
    expect(bad.ok).toBe(false);
    expect(bad.diagnostics.map(d => d.code)).toContain('MISSING_CONNECTOR_ENDPOINT');
  });

  it('derives parts from properties (id = path string) and connector endpoints for nested ends', () => {
    const repo = model();
    const plan = buildCreateIbdConnectorCommand(repo, nestedIntent);
    repo.connectors.c1 = plan.connector!;
    const view = projectLegacyDiagram(repo);
    const byId = new Map(view.parts.map(part => [part.id, part]));
    // Format 5: every part property without a usage record is a derived part (the nested ones also under
    // their path string), so the unfiltered view lists left.inner and right.inner2 as parts of their Blocks too.
    expect([...byId.keys()].sort()).toEqual(['a', 'a/inner', 'b', 'b/inner2', 'inner', 'inner2']);
    expect(byId.get('inner')).toMatchObject({ blockId: 'left', typeId: 'source' });
    expect(byId.get('a')).toMatchObject({ name: 'a-name', blockId: 'system', typeId: 'left', propertyId: 'a' });
    expect(byId.get('a/inner')).toMatchObject({ name: 'inner-name', blockId: 'a', parentPartId: 'a', typeId: 'source', propertyId: 'inner' });
    expect(view.connectors).toEqual([expect.objectContaining({
      id: 'c1', kind: 'assembly',
      sourcePartId: 'a/inner', sourcePortId: 'cOut', targetPartId: 'b/inner2', targetPortId: 'dIn',
    })]);
  });

  it('projects a boundary path end onto the context block and reuses an existing PartUsage for a depth-1 property', () => {
    const repo = model();
    (repo.definitions.left as BlockDefinition).ports.push(port('leftIn', 'in'));
    repo.usages.pa = { id: 'pa', kind: 'part', name: 'a', ownerId: 'system', typeId: 'left', aggregation: 'composite', multiplicity: one, propertyId: 'a' };
    const plan = buildCreateIbdConnectorCommand(repo, {
      contextId: 'system', source: { path: [], portId: 'sysIn' }, target: { path: ['a'], portId: 'leftIn' }, connectorId: 'd1',
    });
    repo.connectors.d1 = plan.connector!;
    const view = projectLegacyDiagram(repo);
    // 'pa' stands for the property `a` of system, so it is not derived a second time; the other part properties are.
    expect(view.parts.map(part => part.id)).toEqual(['pa', 'inner', 'inner2', 'b']);
    expect(view.connectors[0]).toMatchObject({ sourcePartId: 'system', sourcePortId: 'sysIn', targetPartId: 'pa', targetPortId: 'leftIn' });
  });
});
