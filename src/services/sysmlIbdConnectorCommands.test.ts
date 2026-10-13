import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type ConnectorUsage, type PortDefinition, type PropertyDefinition, type SysmlRepository } from '../engine/sysml/model';
import { buildCreateIbdConnectorCommand } from './sysmlIbdConnectorCommands';
import { createSysmlGatewayState, executeSysmlCommand, projectLegacyDiagram } from './sysmlCommandGateway';
import { loadRepository, serializeRepository } from '../engine/sysml/persistence';
import { connectorEndOf } from '../engine/sysml/connectorEnds';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };

const block = (id: string, ports: PortDefinition[] = []): BlockDefinition => ({
  id, name: id, namespace: [], kind: 'block', isAbstract: false, isLeaf: false,
  ownerId: 'model',
  properties: [], ports, operations: [], constraints: [],
});

const port = (id: string, direction: PortDefinition['direction'] = 'inout', typeId = 'if1'): PortDefinition => ({
  id, name: id, kind: 'proxy', typeId, direction, isConjugated: false, multiplicity: one,
});

const partProperty = (id: string, typeId: string): PropertyDefinition => ({ id, name: id, kind: 'part', typeId, multiplicity: one });

function createIbdFixture(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.if1 = { id: 'if1', name: 'Interface1', namespace: [], kind: 'interface', features: [] };
  repo.definitions.if2 = { id: 'if2', name: 'Interface2', namespace: [], kind: 'interface', features: [] };

  // Context Block with boundary ports 'busPort' and 'vehAuxPort' and the parts leftMotor, rightMotor, subVehicle.
  // A delegation keeps its direction through the boundary, so the boundary
  // port that delegates to the motor's 'in' port is itself 'in'.
  repo.definitions.vehicle = {
    ...block('vehicle', [port('busPort', 'in', 'if1'), port('vehAuxPort', 'in', 'if1')]),
    properties: [partProperty('leftMotor', 'motor'), partProperty('rightMotor', 'motor'), partProperty('subVehicle', 'vehicle')],
  };

  // Motor Block with 'ctrlPort' and 'pwrPort'
  repo.definitions.motor = block('motor', [
    port('ctrlPort', 'in', 'if1'),
    port('pwrPort', 'inout', 'if1'),
  ]);

  // Foreign Block with a part that is not in the vehicle context
  repo.definitions.foreign = {
    ...block('foreign', [port('foreignPort', 'in', 'if1')]),
    properties: [partProperty('foreignPart', 'motor')],
  };

  return repo;
}

describe('SysML IBD Connector Commands & Endpoint Resolution', () => {
  describe('connector end resolution', () => {
    it('resolves a boundary port on the context block', () => {
      const res = buildCreateIbdConnectorCommand(createIbdFixture(), {
        contextId: 'vehicle',
        source: { occurrenceId: null, portDefinitionId: 'busPort' },
        target: { occurrenceId: 'leftMotor', portDefinitionId: 'ctrlPort' },
      });
      expect(res.ok).toBe(true);
      expect(res.connector?.sourceEnd).toEqual({ path: [], portId: 'busPort' });
    });

    it('resolves an occurrence port on a part in the context block', () => {
      const res = buildCreateIbdConnectorCommand(createIbdFixture(), {
        contextId: 'vehicle',
        source: { occurrenceId: null, portDefinitionId: 'busPort' },
        target: { occurrenceId: 'leftMotor', portDefinitionId: 'ctrlPort' },
      });
      expect(res.connector?.targetEnd).toEqual({ path: ['leftMotor'], portId: 'ctrlPort' });
    });

    it('distinguishes boundary port from part occurrence port when sharing definition ID', () => {
      const repo = createIbdFixture();
      const boundary = buildCreateIbdConnectorCommand(repo, {
        contextId: 'vehicle',
        source: { occurrenceId: null, portDefinitionId: 'busPort' },
        target: { occurrenceId: 'leftMotor', portDefinitionId: 'ctrlPort' },
      });
      const occurrence = buildCreateIbdConnectorCommand(repo, {
        contextId: 'vehicle',
        source: { occurrenceId: 'subVehicle', portDefinitionId: 'busPort' },
        target: { occurrenceId: 'leftMotor', portDefinitionId: 'pwrPort' },
        kind: 'assembly',
      });
      expect(boundary.connector?.sourceEnd).toEqual({ path: [], portId: 'busPort' });
      expect(occurrence.connector?.sourceEnd).toEqual({ path: ['subVehicle'], portId: 'busPort' });
      expect(boundary.connector?.sourcePortId).not.toBe(occurrence.connector?.sourcePortId);
    });

    it('rejects an endpoint belonging to a part outside the IBD context with ENDPOINT_OUTSIDE_IBD_CONTEXT', () => {
      const res = buildCreateIbdConnectorCommand(createIbdFixture(), {
        contextId: 'vehicle',
        source: { occurrenceId: 'foreignPart', portDefinitionId: 'ctrlPort' },
        target: { occurrenceId: 'leftMotor', portDefinitionId: 'ctrlPort' },
      });
      expect(res.ok).toBe(false);
      expect(res.diagnostics[0]?.code).toBe('ENDPOINT_OUTSIDE_IBD_CONTEXT');
    });

    it('rejects a port definition that does not exist on the target block/part', () => {
      const res = buildCreateIbdConnectorCommand(createIbdFixture(), {
        contextId: 'vehicle',
        source: { occurrenceId: 'leftMotor', portDefinitionId: 'nonExistentPort' },
        target: { occurrenceId: 'rightMotor', portDefinitionId: 'ctrlPort' },
      });
      expect(res.ok).toBe(false);
      expect(res.diagnostics.some(d => d.code === 'MISSING_CONNECTOR_ENDPOINT')).toBe(true);
    });
  });
  describe('buildCreateIbdConnectorCommand', () => {
    it('creates delegation connector between boundary port and internal part port', () => {
      const repo = createIbdFixture();
      const res = buildCreateIbdConnectorCommand(repo, {
        contextId: 'vehicle',
        source: { occurrenceId: null, portDefinitionId: 'busPort' },
        target: { occurrenceId: 'leftMotor', portDefinitionId: 'ctrlPort' },
      });

      expect(res.ok).toBe(true);
      expect(res.command).toBeDefined();
      if (res.command?.type === 'createAndPresent') {
        expect(res.command.diagramId).toBe('vehicle');
        expect((res.command.element as ConnectorUsage).kind).toBe('delegation');
        expect((res.command.element as ConnectorUsage).ownerId).toBe('vehicle');
      }
    });

    it('creates assembly connector between internal part occurrences with compatible directions', () => {
      const repo = createIbdFixture();
      const res = buildCreateIbdConnectorCommand(repo, {
        contextId: 'vehicle',
        source: { occurrenceId: 'leftMotor', portDefinitionId: 'pwrPort' },
        target: { occurrenceId: 'rightMotor', portDefinitionId: 'pwrPort' },
      });

      expect(res.ok).toBe(true);
      expect(res.command).toBeDefined();
      if (res.command?.type === 'createAndPresent') {
        expect(res.command.diagramId).toBe('vehicle');
        expect((res.command.element as ConnectorUsage).kind).toBe('assembly');
      }
    });

    it('rejects boundary-to-boundary assembly connectors', () => {
      const repo = createIbdFixture();
      const res = buildCreateIbdConnectorCommand(repo, {
        contextId: 'vehicle',
        source: { occurrenceId: null, portDefinitionId: 'busPort' },
        target: { occurrenceId: null, portDefinitionId: 'vehAuxPort' },
        kind: 'assembly',
      });

      expect(res.ok).toBe(false);
      expect(res.diagnostics.some(d => d.code === 'INVALID_CONNECTOR_CONTEXT' || d.code === 'INVALID_ASSEMBLY_ENDPOINTS')).toBe(true);
    });

    it('rejects cross-context connectors with ENDPOINT_OUTSIDE_IBD_CONTEXT', () => {
      const repo = createIbdFixture();
      const res = buildCreateIbdConnectorCommand(repo, {
        contextId: 'vehicle',
        source: { occurrenceId: 'leftMotor', portDefinitionId: 'ctrlPort' },
        target: { occurrenceId: 'foreignPart', portDefinitionId: 'ctrlPort' },
      });

      expect(res.ok).toBe(false);
      expect(res.diagnostics.some(d => d.code === 'ENDPOINT_OUTSIDE_IBD_CONTEXT')).toBe(true);
    });

    it('rejects duplicate connectors with DUPLICATE_CONNECTOR', () => {
      const repo = createIbdFixture();
      repo.connectors.c1 = {
        id: 'c1',
        kind: 'delegation',
        ownerId: 'vehicle',
        sourcePortId: '#busPort',
        targetPortId: 'leftMotor#ctrlPort',
        sourceEnd: { path: [], portId: 'busPort' },
        targetEnd: { path: ['leftMotor'], portId: 'ctrlPort' },
      };

      const res = buildCreateIbdConnectorCommand(repo, {
        contextId: 'vehicle',
        source: { occurrenceId: null, portDefinitionId: 'busPort' },
        target: { occurrenceId: 'leftMotor', portDefinitionId: 'ctrlPort' },
      });

      expect(res.ok).toBe(false);
      expect(res.diagnostics.some(d => d.code === 'DUPLICATE_CONNECTOR')).toBe(true);
    });

    it('supports persistence, undo/redo, and browser-independent projection', () => {
      const repo = createIbdFixture();
      const plan = buildCreateIbdConnectorCommand(repo, {
        contextId: 'vehicle',
        connectorId: 'conn-del-1',
        source: { occurrenceId: null, portDefinitionId: 'busPort' },
        target: { occurrenceId: 'leftMotor', portDefinitionId: 'ctrlPort' },
      });

      expect(plan.ok).toBe(true);
      expect(plan.command).toBeDefined();

      // Execute via gateway
      const gatewayState = createSysmlGatewayState(repo);
      const commitRes = executeSysmlCommand(gatewayState, plan.command!);
      expect(commitRes.committed).toBe(true);
      expect(commitRes.repository.connectors['conn-del-1']).toBeDefined();
      expect(commitRes.repository.connectors['conn-del-1'].kind).toBe('delegation');
      expect(commitRes.repository.connectors['conn-del-1'].ownerId).toBe('vehicle');

      // Check diagram projection has the connector
      const view1 = projectLegacyDiagram(commitRes.repository, commitRes.coordinates, commitRes.diagramPresentations, 'vehicle');
      const projectedConn = view1.connectors.find(c => c.id === 'conn-del-1');
      expect(projectedConn).toBeDefined();
      expect(projectedConn?.sourcePartId).toBe('vehicle');
      expect(projectedConn?.targetPartId).toBe('leftMotor');

      // Persistence round-trip: serialize and reload
      const serialized = serializeRepository(commitRes.repository);
      const loaded = loadRepository(serialized);
      expect(loaded.valid).toBe(true);
      const reloadedConn = loaded.repository.connectors['conn-del-1'];
      expect(reloadedConn).toBeDefined();
      expect(reloadedConn.ownerId).toBe('vehicle');
      // Format 5: the saved connector stores property paths instead of the port usage records it was created with.
      expect(connectorEndOf(reloadedConn, 'source')).toEqual({ path: [], portId: 'busPort' });
      expect(connectorEndOf(reloadedConn, 'target')).toMatchObject({ portId: 'ctrlPort' });
      expect(connectorEndOf(reloadedConn, 'target')!.path).toHaveLength(1);
      expect(loaded.repository.usages).toEqual({});

      // Reloaded projection renders edge
      const viewReloaded = projectLegacyDiagram(loaded.repository, commitRes.coordinates, commitRes.diagramPresentations, 'vehicle');
      expect(viewReloaded.connectors.some(c => c.id === 'conn-del-1')).toBe(true);

      // Undo removes connector and presentation
      const undoRes = executeSysmlCommand(commitRes, { type: 'undo' });
      expect(undoRes.committed).toBe(true);
      expect(undoRes.repository.connectors['conn-del-1']).toBeUndefined();
      const viewUndone = projectLegacyDiagram(undoRes.repository, undoRes.coordinates, undoRes.diagramPresentations, 'vehicle');
      expect(viewUndone.connectors.some(c => c.id === 'conn-del-1')).toBe(false);

      // Redo restores connector with identical ID
      const redoRes = executeSysmlCommand(undoRes, { type: 'redo' });
      expect(redoRes.committed).toBe(true);
      expect(redoRes.repository.connectors['conn-del-1']).toBeDefined();
      expect(redoRes.repository.connectors['conn-del-1'].id).toBe('conn-del-1');
      const viewRedone = projectLegacyDiagram(redoRes.repository, redoRes.coordinates, redoRes.diagramPresentations, 'vehicle');
      expect(viewRedone.connectors.some(c => c.id === 'conn-del-1')).toBe(true);
    });
  });
});
