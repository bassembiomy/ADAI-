import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type ConnectorUsage, type PortDefinition, type PropertyDefinition, type SysmlRepository } from './model';
import { createIbdConnector, validateConnector } from './ibd';
import { connectorEndKey, type ConnectorEnd } from './connectorEnds';
import { buildCreateIbdConnectorCommand } from '../../services/sysmlIbdConnectorCommands';
import { createSysmlGatewayState, executeSysmlCommand, projectLegacyDiagram } from '../../services/sysmlCommandGateway';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const block = (id: string, ports: PortDefinition[] = [], properties: PropertyDefinition[] = []): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', ownerId: 'model', isAbstract: false, isLeaf: false,
  properties, ports, operations: [], constraints: [],
});
const port = (id: string, direction: PortDefinition['direction']): PortDefinition => ({
  id, name: id, kind: 'proxy', typeId: 'if', direction, isConjugated: false, multiplicity: one,
});
const partProperty = (id: string, typeId: string): PropertyDefinition => ({ id, name: id, kind: 'part', typeId, multiplicity: one });

/** A system whose parts are the Block properties motor1 and pump1; there are no usage records. */
function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.if = { id: 'if', name: 'IF', namespace: [], kind: 'interface', features: [] };
  repo.definitions.motor = block('motor', [port('mOut', 'out')], [partProperty('outsider', 'pump')]);
  repo.definitions.pump = block('pump', [port('pIn', 'in')]);
  repo.definitions.system = block('system', [port('boundaryIn', 'in')], [partProperty('motor1', 'motor'), partProperty('pump1', 'pump')]);
  return repo;
}

const connector = (id: string, kind: ConnectorUsage['kind'], source: ConnectorEnd, target: ConnectorEnd): ConnectorUsage => ({
  id, kind, ownerId: 'system', sourcePortId: connectorEndKey(source), targetPortId: connectorEndKey(target), sourceEnd: source, targetEnd: target,
});

describe('connector ends may be parts (part-to-part and part-to-port)', () => {
  it('accepts a part-to-part assembly connector', () => {
    const repo = model();
    repo.connectors.c = connector('c', 'assembly', { path: ['motor1'] }, { path: ['pump1'] });
    expect(validateConnector(repo, 'c')).toEqual([]);
  });

  it('accepts a part-to-port assembly connector without comparing port direction', () => {
    const repo = model();
    repo.connectors.c = connector('c', 'assembly', { path: ['motor1'] }, { path: ['pump1'], portId: 'pIn' });
    expect(validateConnector(repo, 'c')).toEqual([]);
  });

  it('still checks direction when both ends are ports', () => {
    const repo = model();
    (repo.definitions.pump as BlockDefinition).ports[0].direction = 'out';
    repo.connectors.c = connector('c', 'assembly', { path: ['motor1'], portId: 'mOut' }, { path: ['pump1'], portId: 'pIn' });
    expect(validateConnector(repo, 'c').map(d => d.code)).toContain('INCOMPATIBLE_PORT_DIRECTION');
  });

  it('rejects a part outside the context, a self connector, a missing end, and a delegation to a part', () => {
    const repo = model();
    repo.connectors.outside = connector('outside', 'assembly', { path: ['motor1'] }, { path: ['outsider'] });
    repo.connectors.self = connector('self', 'assembly', { path: ['motor1'] }, { path: ['motor1'] });
    repo.connectors.ghost = connector('ghost', 'assembly', { path: ['motor1'] }, { path: ['nope'] });
    repo.connectors.deleg = connector('deleg', 'delegation', { path: [], portId: 'boundaryIn' }, { path: ['pump1'] });
    expect(validateConnector(repo, 'outside').map(d => d.code)).toContain('MISSING_CONNECTOR_ENDPOINT');
    expect(validateConnector(repo, 'self').map(d => d.code)).toContain('SELF_CONNECTOR');
    expect(validateConnector(repo, 'ghost').map(d => d.code)).toContain('MISSING_CONNECTOR_ENDPOINT');
    expect(validateConnector(repo, 'deleg').map(d => d.code)).toContain('INVALID_PART_END_CONNECTOR_KIND');
    const created = createIbdConnector(repo, { id: 'x', kind: 'delegation', ownerId: 'system', sourcePortId: '#boundaryIn', targetPortId: 'pump1', sourceEnd: { path: [], portId: 'boundaryIn' }, targetEnd: { path: ['pump1'] } });
    expect(created.connector).toBeUndefined();
  });

  it('detects a duplicate part-to-part connector in either direction', () => {
    const repo = model();
    repo.connectors.c1 = connector('c1', 'assembly', { path: ['motor1'] }, { path: ['pump1'] });
    repo.connectors.c2 = connector('c2', 'assembly', { path: ['pump1'] }, { path: ['motor1'] });
    expect(validateConnector(repo, 'c2').map(d => d.code)).toContain('DUPLICATE_CONNECTOR');
  });
});

describe('building a part-end connector from the canvas intent', () => {
  it('treats an end with no port as the part itself, defaults to an assembly, and names the failing end', () => {
    const repo = model();
    const plan = buildCreateIbdConnectorCommand(repo, {
      contextId: 'system', connectorId: 'pp',
      source: { occurrenceId: 'motor1' }, target: { occurrenceId: 'pump1' },
    });
    expect(plan.ok).toBe(true);
    expect(plan.connector).toMatchObject({ kind: 'assembly', sourceEnd: { path: ['motor1'] }, targetEnd: { path: ['pump1'] } });

    const outside = buildCreateIbdConnectorCommand(repo, { contextId: 'system', source: { occurrenceId: 'outsider' }, target: { occurrenceId: 'pump1' } });
    expect(outside.diagnostics[0]?.code).toBe('ENDPOINT_OUTSIDE_IBD_CONTEXT');
    const contextItself = buildCreateIbdConnectorCommand(repo, { contextId: 'system', source: { occurrenceId: null }, target: { occurrenceId: 'pump1' } });
    expect(contextItself.ok).toBe(false); // the context itself is not an end
    const missing = buildCreateIbdConnectorCommand(repo, { contextId: 'system', source: { occurrenceId: 'ghost' }, target: { occurrenceId: 'pump1' } });
    expect(missing.diagnostics[0]?.code).toBe('PART_NOT_FOUND');
  });

  it('creates it through the gateway without any usage record, and projects it with no port', () => {
    const repo = model();
    const plan = buildCreateIbdConnectorCommand(repo, {
      contextId: 'system', connectorId: 'pp',
      source: { occurrenceId: 'motor1' }, target: { occurrenceId: 'pump1', portDefinitionId: 'pIn' },
    });
    expect(plan.ok).toBe(true);
    const result = executeSysmlCommand(createSysmlGatewayState(repo), plan.command!);
    expect(result.committed).toBe(true);
    expect(result.repository.connectors.pp).toMatchObject({ sourceEnd: { path: ['motor1'] }, targetEnd: { path: ['pump1'], portId: 'pIn' } });
    expect(result.repository.usages).toEqual({});

    const view = projectLegacyDiagram(result.repository, result.coordinates, result.diagramPresentations, 'system');
    expect(view.connectors.find(c => c.id === 'pp')).toMatchObject({ sourcePartId: 'motor1', sourcePortId: '', targetPartId: 'pump1', targetPortId: 'pIn' });
  });
});
