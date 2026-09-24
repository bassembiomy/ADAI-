import { describe, expect, it } from 'vitest';
import {
  createEmptyRepositoryV4,
  type Block,
  type Port,
  type PartProperty,
  type SemanticRelationship,
  type ItemFlow,
  type AllocateRelationship,
} from '../domain';
import {
  resolveConnectorPath,
  validateConnectorEnds,
} from './connectorPath';
import {
  queryAllocations,
  type AllocationQueryResult,
} from './allocationQueries';
import {
  validateRelationshipEndpoints,
} from '../validation/relationshipRules';

describe('Relationship, Connector-End, Flow, and Allocation Foundations (Task 9)', () => {
  it('enforces Association versus Connector ownership and endpoint rules', () => {
    let repo = createEmptyRepositoryV4();

    const blkCar: Block = { id: 'b-car', name: 'Car', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    const blkWheel: Block = { id: 'b-wheel', name: 'Wheel', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repo.elements[blkCar.id] = blkCar;
    repo.elements[blkWheel.id] = blkWheel;

    // Association connecting two Blocks is valid
    const assoc: SemanticRelationship = {
      id: 'assoc-1',
      metaclass: 'Association',
      sourceId: 'b-car',
      targetId: 'b-wheel',
      sourceEnd: { id: 'e1', aggregation: 'none', isNavigable: true },
      targetEnd: { id: 'e2', aggregation: 'none', isNavigable: true },
    };
    const assocValid = validateRelationshipEndpoints(repo, assoc);
    expect(assocValid.valid).toBe(true);

    // Connector connecting two Blocks directly without context is invalid (must connect ports or parts within context)
    const rawConnector: SemanticRelationship = {
      id: 'conn-bad',
      metaclass: 'Connector',
      sourceId: 'b-car',
      targetId: 'b-wheel',
    };
    const connInvalid = validateRelationshipEndpoints(repo, rawConnector);
    expect(connInvalid.valid).toBe(false);
    expect(connInvalid.diagnostics).toContain('CONNECTOR_ENDPOINTS_MUST_BE_FEATURES');
  });

  it('resolves nested connector paths across properties and ports, rejecting broken paths', () => {
    let repo = createEmptyRepositoryV4();

    // Context Block: Vehicle
    const bVehicle: Block = { id: 'b-vehicle', name: 'Vehicle', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    // Powertrain Block
    const bPowertrain: Block = { id: 'b-pt', name: 'Powertrain', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    // Inverter Block
    const bInverter: Block = { id: 'b-inv', name: 'Inverter', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    // Port on Inverter
    const pAC: Port = {
      id: 'port-ac',
      name: 'acOut',
      metaclass: 'Port',
      portKind: 'proxyPort',
      namespace: [],
      ownerId: 'b-inv',
      typeId: 'b-inv',
    };

    // Part in Vehicle: powertrain : Powertrain
    const partPT: PartProperty = {
      id: 'p-pt',
      name: 'powertrain',
      metaclass: 'PartProperty',
      namespace: [],
      ownerId: 'b-vehicle',
      typeId: 'b-pt',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      aggregation: 'composite',
    };

    // Part in Powertrain: inverter : Inverter
    const partInv: PartProperty = {
      id: 'p-inv',
      name: 'inverter',
      metaclass: 'PartProperty',
      namespace: [],
      ownerId: 'b-pt',
      typeId: 'b-inv',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      aggregation: 'composite',
    };

    repo.elements[bVehicle.id] = bVehicle;
    repo.elements[bPowertrain.id] = bPowertrain;
    repo.elements[bInverter.id] = bInverter;
    repo.elements[pAC.id] = pAC;
    repo.elements[partPT.id] = partPT;
    repo.elements[partInv.id] = partInv;

    // Legal nested path from bVehicle: powertrain.inverter.acOut
    const validPath = resolveConnectorPath(repo, 'b-vehicle', ['p-pt', 'p-inv', 'port-ac']);
    expect(validPath.valid).toBe(true);
    expect(validPath.targetElementId).toBe('port-ac');

    // Broken path (broken link in chain)
    const brokenPath = resolveConnectorPath(repo, 'b-vehicle', ['p-pt', 'b-inv', 'port-ac']);
    expect(brokenPath.valid).toBe(false);
    expect(brokenPath.errorCode).toBe('INVALID_PATH_SEGMENT');
  });

  it('indexes Allocate relationships and derives allocatedFrom and allocatedTo queries', () => {
    let repo = createEmptyRepositoryV4();

    const logicalFn: Block = { id: 'fn-steer', name: 'SteerVehicle', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    const physECU: Block = { id: 'hw-ecu', name: 'SteeringECU', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repo.elements[logicalFn.id] = logicalFn;
    repo.elements[physECU.id] = physECU;

    const allocRel: AllocateRelationship = {
      id: 'alloc-1',
      metaclass: 'Allocate',
      sourceId: 'fn-steer',
      targetId: 'hw-ecu',
      allocatedFromId: 'fn-steer',
      allocatedToId: 'hw-ecu',
    };
    repo.relationships[allocRel.id] = allocRel;
    repo.indexes.bySourceEndpoint['fn-steer'] = [allocRel.id];
    repo.indexes.byTargetEndpoint['hw-ecu'] = [allocRel.id];

    const fnQuery = queryAllocations(repo, 'fn-steer');
    expect(fnQuery.allocatedTo).toEqual(['hw-ecu']);
    expect(fnQuery.allocatedFrom).toEqual([]);

    const ecuQuery = queryAllocations(repo, 'hw-ecu');
    expect(ecuQuery.allocatedFrom).toEqual(['fn-steer']);
    expect(ecuQuery.allocatedTo).toEqual([]);
  });

  it('keeps ItemFlow and BindingConnector distinct from generic Connector', () => {
    let repo = createEmptyRepositoryV4();

    const b1: Block = { id: 'b1', name: 'B1', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    const b2: Block = { id: 'b2', name: 'B2', metaclass: 'Block', namespace: [], ownerId: 'pkg-root' };
    repo.elements[b1.id] = b1;
    repo.elements[b2.id] = b2;

    const bindingConn: SemanticRelationship = {
      id: 'bconn-1',
      metaclass: 'BindingConnector',
      sourceId: 'b1',
      targetId: 'b2',
    };
    expect(bindingConn.metaclass).toBe('BindingConnector');

    const itemFlow: ItemFlow = {
      id: 'iflow-1',
      realizingRelationshipId: 'bconn-1',
      conveyedClassifierIds: ['b1'],
      sourceId: 'b1',
      targetId: 'b2',
    };
    expect(itemFlow.realizingRelationshipId).toBe('bconn-1');
  });
});
