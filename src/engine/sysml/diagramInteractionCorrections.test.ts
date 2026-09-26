import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository,
  type BlockDefinition,
  type PortDefinition,
  type SysmlRepository,
} from './model';
import { createOwnedPort } from '../../services/sysmlOwnedFeatureCommands';
import { evaluateSysmlConnection, type ConnectionEndpoint } from './connectionPolicy';
import { createIbdConnector } from './ibd';
import { validateCanonicalRelationshipCandidate } from '../../services/sysmlCreationRules';

const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };

function createFixture(): {
  repo: SysmlRepository;
  stateEndpoint: ConnectionEndpoint;
  reqEndpoint: ConnectionEndpoint;
} {
  const repo = createEmptyRepository();

  // 1. InterfaceBlock
  repo.definitions.canBus = {
    id: 'canBus',
    name: 'CANBus',
    namespace: [],
    kind: 'interface',
    features: ['messageRate'],
  };

  // 2. Part type Block
  repo.definitions.motor = {
    id: 'motor',
    name: 'Motor',
    namespace: [],
    kind: 'block',
    isAbstract: false,
    isLeaf: false,
    supertypeIds: [],
    properties: [],
    ports: [
      {
        id: 'motorCtrlDef',
        name: 'ctrl',
        kind: 'proxy',
        typeId: 'canBus',
        direction: 'in',
        isConjugated: false,
        multiplicity: one,
      },
    ],
    operations: [],
    constraints: [],
  };

  // 3. Context Block
  repo.definitions.vehicle = {
    id: 'vehicle',
    name: 'Vehicle',
    namespace: [],
    kind: 'block',
    isAbstract: false,
    isLeaf: false,
    supertypeIds: [],
    properties: [
      {
        id: 'prop-leftMotor',
        name: 'leftMotor',
        kind: 'part',
        typeId: 'motor',
        multiplicity: one,
      },
    ],
    ports: [
      {
        id: 'vehBoundaryDef',
        name: 'externalBus',
        kind: 'proxy',
        typeId: 'canBus',
        direction: 'in',
        isConjugated: false,
        multiplicity: one,
      },
    ],
    operations: [],
    constraints: [],
  };

  // 4. Usages in Vehicle context
  repo.usages.leftMotorUsage = {
    id: 'leftMotorUsage',
    name: 'leftMotor',
    kind: 'part',
    ownerId: 'vehicle',
    typeId: 'motor',
    aggregation: 'composite',
    multiplicity: one,
    propertyId: 'prop-leftMotor',
  };

  repo.usages.vehBoundaryUsage = {
    id: 'vehBoundaryUsage',
    name: 'externalBus',
    kind: 'port',
    ownerId: 'vehicle',
    definitionId: 'vehBoundaryDef',
  };

  repo.usages.leftMotorCtrlUsage = {
    id: 'leftMotorCtrlUsage',
    name: 'ctrl',
    kind: 'port',
    ownerId: 'leftMotorUsage',
    definitionId: 'motorCtrlDef',
  };

  // 5. Requirement
  repo.requirements.req1 = {
    id: 'req1',
    name: 'Vehicle Speed Spec',
    namespace: [],
    kind: 'requirement',
    requirementId: 'REQ-001',
    text: 'The vehicle shall accelerate to 100 km/h in 5s',
    status: 'draft',
    version: '1.0',
  };

  // 6. VerificationCase / TestCase
  repo.verificationCases.tc1 = {
    id: 'tc1',
    name: 'SpeedAccelerationTest',
    namespace: [],
    kind: 'verificationCase',
    method: 'Automated Test Track',
    verifiesRequirementIds: ['req1'],
  };

  const stateEndpoint: ConnectionEndpoint = {
    id: 'state-accelerating',
    name: 'Accelerating',
    family: 'state',
  };

  const reqEndpoint: ConnectionEndpoint = {
    id: 'req1',
    name: 'REQ-001',
    family: 'requirement',
  };

  return { repo, stateEndpoint, reqEndpoint };
}

describe('SysML v1.6 Diagram Interaction Corrections Characterization', () => {
  it('characterizes owned port creation: retains umlPort and enforces InterfaceBlock typing on proxyPort', () => {
    const { repo } = createFixture();

    // Standard Port creation retains umlPort
    const stdResult = createOwnedPort(repo, { ownerBlockId: 'vehicle', portKind: 'umlPort' });
    expect(stdResult.element?.portKind).toBe('umlPort');

    // ProxyPort typed by regular Block fails with INVALID_PROXY_PORT_TYPE
    const proxyResult = createOwnedPort(repo, { ownerBlockId: 'vehicle', portKind: 'proxyPort', typeId: 'vehicle' });
    expect(proxyResult.diagnostics[0]?.code).toBe('INVALID_PROXY_PORT_TYPE');
  });

  it('characterizes IBD boundary-to-part delegation connector creation', () => {
    const { repo } = createFixture();

    const result = createIbdConnector(repo, {
      id: 'conn-delegation-1',
      kind: 'delegation',
      ownerId: 'vehicle',
      sourcePortId: 'vehBoundaryUsage',
      targetPortId: 'leftMotorCtrlUsage',
    });

    // Boundary to internal part delegation must succeed
    expect(result.diagnostics).toEqual([]);
    expect(result.connector).toBeDefined();
    expect(result.connector?.kind).toBe('delegation');
  });

  it('characterizes State to Requirement Satisfy connection evaluation', () => {
    const { repo, stateEndpoint, reqEndpoint } = createFixture();

    const decision = evaluateSysmlConnection({
      relationshipKind: 'satisfy',
      source: stateEndpoint,
      target: reqEndpoint,
      diagram: 'statemachine',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.diagnostics).toEqual([]);

    // Characterize canonical repository validation for state satisfy
    const candidate = {
      id: 'rel-sat-1',
      kind: 'satisfy' as const,
      sourceId: 'state-accelerating',
      targetId: 'req1',
    };
    const candidateResult = validateCanonicalRelationshipCandidate(repo, candidate);
    expect(candidateResult.valid).toBe(true);
  });


  it('characterizes TestCase storage and projection under stable identity', () => {
    const { repo } = createFixture();
    const testCase = repo.verificationCases.tc1;
    expect(testCase).toBeDefined();
    expect(testCase.id).toBe('tc1');
    expect(testCase.verifiesRequirementIds).toContain('req1');
  });
});
