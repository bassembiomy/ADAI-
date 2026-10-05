import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type PortDefinition, type SysmlRepository } from '../engine/sysml/model';
import { connectorEndOf } from '../engine/sysml/connectorEnds';
import { loadRepository, serializeRepository } from '../engine/sysml/persistence';
import {
  computeImpactHash,
  createSysmlGatewayState,
  executeSysmlCommand,
  projectLegacyDiagram,
  type SysmlGatewayState,
} from './sysmlCommandGateway';
import { buildCreateOwnedPropertyCommand } from './sysmlOwnedFeatureCommands';
import { buildCreateIbdConnectorCommand } from './sysmlIbdConnectorCommands';
import { buildCreatePartDefinitionCommand, buildPartUpdateCommand } from './sysmlPropertyCommands';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
const block = (id: string, name: string, ports: PortDefinition[] = []): BlockDefinition => ({
  id, name, namespace: ['model'], kind: 'block', ownerId: 'model', isAbstract: false, isLeaf: false,
  properties: [], ports, operations: [], constraints: [],
});
const port = (id: string, direction: PortDefinition['direction']): PortDefinition => ({
  id, name: id, kind: 'standard', typeId: '', direction, isConjugated: false, multiplicity: one,
});

function fixture(): SysmlGatewayState {
  const repo: SysmlRepository = createEmptyRepository();
  repo.definitions.vehicle = block('vehicle', 'Vehicle', [port('veh-in', 'in')]);
  repo.definitions.engine = block('engine', 'Engine', [port('eng-in', 'in'), port('eng-out', 'out')]);
  repo.definitions.pump = block('pump', 'Pump', [port('pump-in', 'in')]);
  return createSysmlGatewayState(repo);
}

function commit(state: SysmlGatewayState, command: Parameters<typeof executeSysmlCommand>[1]): SysmlGatewayState {
  const result = executeSysmlCommand(state, command);
  expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.repository.usages).toEqual({});
  return result;
}

describe('a session works on Block properties and path ends only', () => {
  it('creates, edits, connects, retypes, deletes and saves parts and ports without any usage record', () => {
    let state = fixture();
    const partsOf = (s: SysmlGatewayState) => projectLegacyDiagram(s.repository, s.coordinates, s.diagramPresentations, 'vehicle').parts;

    // A typed part and an untyped part (the gateway gives it its own Block type), both on the vehicle IBD.
    const typed = buildCreateOwnedPropertyCommand(state.repository, {
      ownerBlockId: 'vehicle', propertyKind: 'part', typeId: 'engine', name: 'engine1', featureId: 'p-engine',
      diagramId: 'vehicle', presentation: { x: 100, y: 100, width: 150, height: 100 },
    });
    state = commit(state, typed.command!);
    const second = buildCreateOwnedPropertyCommand(state.repository, {
      ownerBlockId: 'vehicle', propertyKind: 'part', typeId: 'pump', name: 'pump1', featureId: 'p-pump',
      diagramId: 'vehicle', presentation: { x: 400, y: 100, width: 150, height: 100 },
    });
    state = commit(state, second.command!);
    const untyped = buildCreateOwnedPropertyCommand(state.repository, {
      ownerBlockId: 'vehicle', propertyKind: 'part', name: 'cooler', featureId: 'p-cooler',
      diagramId: 'vehicle', presentation: { x: 700, y: 100, width: 150, height: 100 },
    });
    state = commit(state, untyped.command!);
    expect(partsOf(state).map(part => part.id).sort()).toEqual(['p-cooler', 'p-engine', 'p-pump']);

    // A port on the part's type, then connectors: delegation from the boundary and assembly between parts.
    state = commit(state, { type: 'createOwnedPort', ownerBlockId: 'pump', portKind: 'umlPort', name: 'extra', featureId: 'pump-extra' } as never);
    const delegation = buildCreateIbdConnectorCommand(state.repository, {
      contextId: 'vehicle', connectorId: 'c-del',
      source: { occurrenceId: null, portDefinitionId: 'veh-in' }, target: { occurrenceId: 'p-engine', portDefinitionId: 'eng-in' },
    });
    expect(delegation.diagnostics).toEqual([]);
    state = commit(state, delegation.command!);
    const assembly = buildCreateIbdConnectorCommand(state.repository, {
      contextId: 'vehicle', connectorId: 'c-asm',
      source: { occurrenceId: 'p-engine', portDefinitionId: 'eng-out' }, target: { occurrenceId: 'p-pump', portDefinitionId: 'pump-in' },
    });
    expect(assembly.diagnostics).toEqual([]);
    state = commit(state, assembly.command!);
    expect(connectorEndOf(state.repository.connectors['c-asm'], 'target')).toEqual({ path: ['p-pump'], portId: 'pump-in' });
    const view = projectLegacyDiagram(state.repository, state.coordinates, state.diagramPresentations, 'vehicle');
    expect(view.connectors.find(c => c.id === 'c-asm')).toMatchObject({ sourcePartId: 'p-engine', targetPartId: 'p-pump', targetPortId: 'pump-in' });

    // Rename and re-multiply through the part's property.
    state = commit(state, buildPartUpdateCommand(state.repository, 'p-cooler', { name: 'radiator', multiplicity: '2' }) as never);
    const radiator = (state.repository.definitions.vehicle as BlockDefinition).properties.find(property => property.id === 'p-cooler')!;
    expect(radiator).toMatchObject({ name: 'radiator', multiplicity: { lower: 2, upper: 2 } });

    // Retype the untyped part to a new Block.
    state = commit(state, buildCreatePartDefinitionCommand({ partId: 'p-cooler', definitionId: 'cooler-def', definitionName: 'Cooler_Def', repository: state.repository }));
    expect((state.repository.definitions.vehicle as BlockDefinition).properties.find(property => property.id === 'p-cooler')!.typeId).toBe('cooler-def');

    // Save and open again: still no usage record, and nothing to upgrade.
    const reloaded = loadRepository(serializeRepository(state.repository));
    expect(reloaded.valid, JSON.stringify(reloaded.diagnostics)).toBe(true);
    expect(reloaded.upgradeReport).toBeUndefined();
    expect(reloaded.repository.usages).toEqual({});
    expect(Object.keys(reloaded.repository.connectors).sort()).toEqual(['c-asm', 'c-del']);

    // Deleting a part asks for confirmation because connectors end in it, then removes it with them; undo restores.
    const first = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['p-engine'] });
    expect(first.committed).toBe(false);
    expect(first.impact?.deletedElementIds).toEqual(expect.arrayContaining(['p-engine', 'c-del', 'c-asm']));
    const deleted = commit(state, { type: 'deleteElements', elementIds: ['p-engine'], confirmedImpactHash: computeImpactHash(first.impact!) });
    expect(deleted.repository.connectors).toEqual({});
    const undone = executeSysmlCommand(deleted, { type: 'undo' });
    expect(undone.repository.usages).toEqual({});
    expect(Object.keys(undone.repository.connectors).sort()).toEqual(['c-asm', 'c-del']);
  });

  it('refuses a PartUsage or PortUsage record from any command', () => {
    const state = fixture();
    const usage = { id: 'u', kind: 'part' as const, name: 'u', ownerId: 'vehicle', typeId: 'engine', aggregation: 'composite' as const, multiplicity: one };
    for (const command of [
      { type: 'createElement' as const, element: usage },
      { type: 'createAndPresent' as const, diagramId: 'vehicle', element: usage, presentation: {} },
      { type: 'batch' as const, commands: [{ type: 'createElement' as const, element: usage }] },
    ]) {
      const result = executeSysmlCommand(state, command);
      expect(result.committed).toBe(false);
      expect(result.diagnostics.map(d => d.code)).toContain('USAGE_RECORD_NOT_SUPPORTED');
      expect(result.repository.usages).toEqual({});
    }
  });

  it('refuses to retype a part while a connector ends in a port its new type lacks, rather than leaving the connector dangling', () => {
    let state = fixture();
    state = commit(state, buildCreateOwnedPropertyCommand(state.repository, {
      ownerBlockId: 'vehicle', propertyKind: 'part', typeId: 'engine', name: 'engine1', featureId: 'p-engine',
    }).command!);
    state = commit(state, buildCreateIbdConnectorCommand(state.repository, {
      contextId: 'vehicle', connectorId: 'c-del',
      source: { occurrenceId: null, portDefinitionId: 'veh-in' }, target: { occurrenceId: 'p-engine', portDefinitionId: 'eng-in' },
    }).command!);
    const result = executeSysmlCommand(state, buildCreatePartDefinitionCommand({ partId: 'p-engine', definitionId: 'new-def', definitionName: 'New_Def', repository: state.repository }));
    expect(result.committed).toBe(false);
    expect(result.diagnostics.map(d => d.code)).toContain('MISSING_CONNECTOR_ENDPOINT');
    expect(result.repository.definitions['new-def']).toBeUndefined();
  });
});