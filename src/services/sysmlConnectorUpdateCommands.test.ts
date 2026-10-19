import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type PortDefinition, type PropertyDefinition, type SysmlRepository } from '../engine/sysml/model';
import { buildCreateIbdConnectorCommand } from './sysmlIbdConnectorCommands';
import { createSysmlGatewayState, executeSysmlCommand } from './sysmlCommandGateway';
import { buildConnectorUpdateCommand, connectorEditorValue } from './sysmlConnectorUpdateCommands';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const port = (id: string, direction: PortDefinition['direction'] = 'inout'): PortDefinition => ({
  id, name: id, kind: 'proxy', typeId: 'if1', direction, isConjugated: false, multiplicity: one,
});
const part = (id: string, typeId: string): PropertyDefinition => ({ id, name: id, kind: 'part', typeId, multiplicity: one });

function fixture(): { repo: SysmlRepository; connectorId: string } {
  const repo = createEmptyRepository();
  repo.definitions.if1 = { id: 'if1', name: 'If1', namespace: [], kind: 'interface', features: [] };
  repo.definitions.sig = { id: 'sig', name: 'Signal', namespace: [], kind: 'valueType' } as never;
  const base = { namespace: [], isAbstract: false, isLeaf: false, ownerId: 'model', properties: [], operations: [], constraints: [] };
  repo.definitions.motor = { ...base, id: 'motor', name: 'motor', kind: 'block', ports: [port('ctrl'), port('pwr')] } as BlockDefinition;
  repo.definitions.ctx = { ...base, id: 'ctx', name: 'ctx', kind: 'block', ports: [port('bus')], properties: [part('left', 'motor'), part('right', 'motor')] } as BlockDefinition;
  const created = buildCreateIbdConnectorCommand(repo, {
    contextId: 'ctx', connectorId: 'c1',
    source: { occurrenceId: 'left', portDefinitionId: 'pwr' },
    target: { occurrenceId: 'right', portDefinitionId: 'ctrl' },
  });
  expect(created.ok).toBe(true);
  const result = executeSysmlCommand(createSysmlGatewayState(repo), created.command!);
  expect(result.committed).toBe(true);
  return { repo: result.repository, connectorId: created.connector!.id };
}

describe('buildConnectorUpdateCommand', () => {
  it('feeds the editor from the stored connector and yields no command when nothing changed', () => {
    const { repo, connectorId } = fixture();
    const value = connectorEditorValue(repo, connectorId)!;
    expect(value.sourcePortId).toBe('left::pwr');
    expect(value.targetPortId).toBe('right::ctrl');
    expect(buildConnectorUpdateCommand(repo, connectorId, value)).toEqual({ ok: true, diagnostics: [] });
  });

  it('writes itemFlowId and only real ConnectorUsage keys', () => {
    const { repo, connectorId } = fixture();
    const value = connectorEditorValue(repo, connectorId)!;
    const plan = buildConnectorUpdateCommand(repo, connectorId, { ...value, itemFlowId: 'sig' });
    expect(plan.ok).toBe(true);
    expect(plan.command).toEqual({ type: 'updateElement', elementId: connectorId, patch: { itemFlowId: 'sig' } });
    const result = executeSysmlCommand(createSysmlGatewayState(repo), plan.command!);
    expect(result.committed).toBe(true);
    const stored = result.repository.connectors[connectorId] as unknown as Record<string, unknown>;
    expect(stored.itemFlowId).toBe('sig');
    for (const stray of ['sourcePartId', 'targetPartId', 'itemFlow', 'label']) expect(stored).not.toHaveProperty(stray);
    // editing one field keeps the others
    expect(stored.sourcePortId).toBe(repo.connectors[connectorId].sourcePortId);
    expect(stored.kind).toBe('assembly');
  });

  it('re-stores a changed end as a path with its end key, leaving no stale sourceEnd/targetEnd', () => {
    const { repo, connectorId } = fixture();
    const value = connectorEditorValue(repo, connectorId)!;
    const plan = buildConnectorUpdateCommand(repo, connectorId, { ...value, targetPortId: 'right::pwr' });
    expect(plan.ok).toBe(true);
    const patch = (plan.command as { patch: Record<string, unknown> }).patch;
    expect(patch.targetEnd).toEqual({ path: ['right'], portId: 'pwr' });
    expect(patch.sourceEnd).toEqual({ path: ['left'], portId: 'pwr' });
    expect(Object.keys(patch).sort()).toEqual(['sourceEnd', 'sourcePortId', 'targetEnd', 'targetPortId']);
    const result = executeSysmlCommand(createSysmlGatewayState(repo), plan.command!);
    expect(result.committed).toBe(true);
    const stored = result.repository.connectors[connectorId];
    expect(stored.targetEnd).toEqual({ path: ['right'], portId: 'pwr' });
    expect(connectorEditorValue(result.repository, connectorId)!.targetPortId).toBe('right::pwr');
  });

  it('rejects an end that does not resolve instead of storing it', () => {
    const { repo, connectorId } = fixture();
    const value = connectorEditorValue(repo, connectorId)!;
    const plan = buildConnectorUpdateCommand(repo, connectorId, { ...value, targetPortId: 'nowhere::pwr' });
    expect(plan.ok).toBe(false);
    expect(plan.command).toBeUndefined();
    expect(plan.diagnostics.length).toBeGreaterThan(0);
  });
});
