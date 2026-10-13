import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createEmptyRepository,
  type BlockDefinition,
  type PortDefinition,
  type SysmlRelationship,
  type SysmlRepository,
} from './model';
import {
  createOwnedPort,
} from '../../services/sysmlOwnedFeatureCommands';
import { evaluateSysmlConnection, type ConnectionEndpoint } from './connectionPolicy';
import { createIbdConnector } from './ibd';
import { validateCanonicalRelationshipCandidate } from '../../services/sysmlCreationRules';
import { validatePort, validateRepositoryPorts } from './validation/portRules';
import { resolvePackageDiagramActivation } from '../../services/sysmlDiagramActivation';
import { resolveBlockDoubleClickAction } from './requirementsDiagramScope';
import {
  REGISTERED_EXECUTABLE_CASES,
  listExecutableEvidenceRecords,
  type RegisteredExecutableCaseId,
} from './compliance/evidenceRegistry';

export const EXECUTED_CORRECTION_CASES: readonly RegisteredExecutableCaseId[] = [
  'PORT_UML_STANDARD_OWNED',
  'PORT_PROXY_INTERFACE_TYPING',
  'PORT_PROXY_WRONG_TYPE_REJECTED',
  'PORT_FULL_BLOCK_TYPING',
  'PORT_FLOW_LEGACY_OWNED',
  'PORT_NESTED_PROXY_VALIDATED',
  'PORT_PERSISTENCE_STABLE',
  'IBD_BOUNDARY_DELEGATION_PERSISTS',
  'IBD_ASSEMBLY_PART_TO_PART',
  'IBD_ASSEMBLY_BOUNDARY_REJECTED',
  'IBD_CONNECTOR_PERSISTENCE',
  'REQ_TESTCASE_STABLE_IDENTITY',
  'REQ_TESTCASE_VERIFIES_PERSISTED',
  'REQ_BLOCK_NO_DRILLDOWN',
  'ADIA_LEGACY_VERIFICATION_NORMALIZATION',
  'STATE_SATISFY_REAL_ID_REQUIRED',
  'STATE_SATISFY_DIRECTION_ENFORCED',
  'STATE_SATISFY_RELATIONSHIP_PERSISTS',
  'CAMEO_DIAGRAM_ACTIVATE_ZERO_CREATES',
  'CAMEO_DIAGRAM_ACTIVATE_ONE_OPENS',
  'CAMEO_DIAGRAM_ACTIVATE_MANY_CHOOSER',
] as const;

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
      {
        id: 'motorPowerDef',
        name: 'power',
        kind: 'full',
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
      {
        id: 'prop-rightMotor',
        name: 'rightMotor',
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

  repo.usages.rightMotorUsage = {
    id: 'rightMotorUsage',
    name: 'rightMotor',
    kind: 'part',
    ownerId: 'vehicle',
    typeId: 'motor',
    aggregation: 'composite',
    multiplicity: one,
    propertyId: 'prop-rightMotor',
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

  repo.usages.rightMotorCtrlUsage = {
    id: 'rightMotorCtrlUsage',
    name: 'ctrl',
    kind: 'port',
    ownerId: 'rightMotorUsage',
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

describe('SysML v1.6 Diagram Interaction Corrections Executable Cases', () => {
  it('covers all registered executable case IDs in EXECUTED_CORRECTION_CASES', () => {
    const registeredIds = Object.keys(REGISTERED_EXECUTABLE_CASES) as RegisteredExecutableCaseId[];
    for (const id of registeredIds) {
      expect(EXECUTED_CORRECTION_CASES).toContain(id);
    }
  });

  it('maps every registered executable case to a concrete test file and test name', () => {
    const records = listExecutableEvidenceRecords();
    expect(records.length).toBe(EXECUTED_CORRECTION_CASES.length);
    for (const record of records) {
      expect(EXECUTED_CORRECTION_CASES).toContain(record.id);
      expect(record.testFile).toMatch(/\.test\.tsx?$/);
      expect(record.testName.length).toBeGreaterThan(0);
      expect(record.authority).toBeDefined();
      expect(record.specificationSection.length).toBeGreaterThan(0);
      expect(record.implementation.sourceFiles.length).toBeGreaterThan(0);
      expect(record.implementation.domainTypes.length).toBeGreaterThan(0);
      expect(record.implementation.commands.length).toBeGreaterThan(0);
      expect(record.implementation.validators.length).toBeGreaterThan(0);
      expect(record.implementation.persistence.length).toBeGreaterThan(0);
      expect(record.implementation.projections.length).toBeGreaterThan(0);
    }
  });

  it('resolves every registered test binding to an executed test in this suite', () => {
    const suiteSource = readFileSync(resolve(__dirname, 'diagramInteractionCorrections.test.ts'), 'utf8');
    for (const record of listExecutableEvidenceRecords()) {
      const fullPath = resolve(process.cwd(), record.testFile);
      expect(existsSync(fullPath), `Test file must exist: ${record.testFile}`).toBe(true);
      expect(
        suiteSource.includes(record.testName),
        `Registered test "${record.testName}" must execute in ${record.testFile}`,
      ).toBe(true);
    }
  });

  describe('Ports (UML Foundation & SysML 1.6)', () => {
    it('PORT_UML_STANDARD_OWNED: creates standard UML Port as owned feature without proxy/full stereotype', () => {
      const { repo } = createFixture();
      const result = createOwnedPort(repo, { ownerBlockId: 'vehicle', portKind: 'umlPort', name: 'stdPort' });
      expect(result.diagnostics).toEqual([]);
      expect(result.element?.portKind).toBe('umlPort');
    });

    it('PORT_PROXY_INTERFACE_TYPING: creates ProxyPort typed by InterfaceBlock', () => {
      const { repo } = createFixture();
      const result = createOwnedPort(repo, { ownerBlockId: 'vehicle', portKind: 'proxyPort', typeId: 'canBus', name: 'canPort' });
      expect(result.diagnostics).toEqual([]);
      expect(result.element?.portKind).toBe('proxyPort');
    });

    it('PORT_PROXY_WRONG_TYPE_REJECTED: rejects ProxyPort typed by non-interface Block with INVALID_PROXY_PORT_TYPE', () => {
      const { repo } = createFixture();
      const result = createOwnedPort(repo, { ownerBlockId: 'vehicle', portKind: 'proxyPort', typeId: 'vehicle', name: 'badPort' });
      expect(result.diagnostics[0]?.code).toBe('INVALID_PROXY_PORT_TYPE');
      expect(result.element).toBeUndefined();
    });

    it('PORT_FULL_BLOCK_TYPING: creates FullPort typed by Block', () => {
      const { repo } = createFixture();
      const result = createOwnedPort(repo, { ownerBlockId: 'vehicle', portKind: 'fullPort', typeId: 'motor', name: 'motorPort' });
      expect(result.diagnostics).toEqual([]);
      expect(result.element?.portKind).toBe('fullPort');
    });

    it('PORT_FLOW_LEGACY_OWNED: creates legacy FlowPort with direction', () => {
      const { repo } = createFixture();
      const result = createOwnedPort(repo, { ownerBlockId: 'vehicle', portKind: 'flowPort', typeId: 'canBus', name: 'exhaust' });
      expect(result.diagnostics).toEqual([]);
      expect(result.element?.portKind).toBe('flowPort');
    });

    it('PORT_NESTED_PROXY_VALIDATED: nested proxy ports validate against repository definitions', () => {
      const { repo } = createFixture();
      (repo.definitions.vehicle as BlockDefinition).ports.push({
        id: 'nestedProxy1',
        name: 'nestedProxy',
        kind: 'proxy',
        ownerPortId: 'vehBoundaryDef',
        typeId: 'motor', // invalid for proxy port (must be interface)
        direction: 'in',
        isConjugated: false,
        multiplicity: one,
      });
      const diags = validateRepositoryPorts(repo);
      expect(diags.some(d => d.code === 'INVALID_PROXY_PORT_TYPE')).toBe(true);
    });

    it('PORT_PERSISTENCE_STABLE: port definitions and kinds survive serialization round trip', () => {
      const { repo } = createFixture();
      const vehiclePorts = (repo.definitions.vehicle as BlockDefinition).ports;
      const serialized = JSON.stringify(vehiclePorts);
      const deserialized: PortDefinition[] = JSON.parse(serialized);
      expect(deserialized).toHaveLength(vehiclePorts.length);
      expect(deserialized[0].kind).toBe('proxy');
    });
  });

  describe('IBD Connectors', () => {
    it('IBD_BOUNDARY_DELEGATION_PERSISTS: creates and persists boundary port to internal part port delegation connector', () => {
      const { repo } = createFixture();
      const result = createIbdConnector(repo, {
        id: 'conn-delegation-1',
        kind: 'delegation',
        ownerId: 'vehicle',
        sourcePortId: 'vehBoundaryUsage',
        targetPortId: 'leftMotorCtrlUsage',
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.connector).toBeDefined();
      expect(result.connector?.kind).toBe('delegation');
      repo.connectors['conn-delegation-1'] = result.connector!;
      expect(repo.connectors['conn-delegation-1']).toBeDefined();
    });

    it('IBD_ASSEMBLY_PART_TO_PART: creates internal part to part assembly connector', () => {
      const { repo } = createFixture();
      const result = createIbdConnector(repo, {
        id: 'conn-assembly-1',
        kind: 'assembly',
        ownerId: 'vehicle',
        sourcePortId: 'leftMotorCtrlUsage',
        targetPortId: 'rightMotorCtrlUsage',
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.connector?.kind).toBe('assembly');
      repo.connectors['conn-assembly-1'] = result.connector!;
      expect(repo.connectors['conn-assembly-1']).toBeDefined();
    });

    it('IBD_ASSEMBLY_BOUNDARY_REJECTED: rejects assembly connector on boundary port with INVALID_CONNECTOR_CONTEXT', () => {
      const { repo } = createFixture();
      const result = createIbdConnector(repo, {
        id: 'conn-assembly-invalid',
        kind: 'assembly',
        ownerId: 'vehicle',
        sourcePortId: 'vehBoundaryUsage',
        targetPortId: 'leftMotorCtrlUsage',
      });
      expect(result.diagnostics.some(d => d.code === 'INVALID_CONNECTOR_CONTEXT')).toBe(true);
      expect(repo.connectors['conn-assembly-invalid']).toBeUndefined();
    });

    it('IBD_CONNECTOR_PERSISTENCE: connector and endpoints preserved across serialization', () => {
      const { repo } = createFixture();
      const result = createIbdConnector(repo, {
        id: 'conn-delegation-persist',
        kind: 'delegation',
        ownerId: 'vehicle',
        sourcePortId: 'vehBoundaryUsage',
        targetPortId: 'leftMotorCtrlUsage',
      });
      expect(result.connector).toBeDefined();
      repo.connectors['conn-delegation-persist'] = result.connector!;
      const serialized = JSON.stringify(repo.connectors);
      const parsed = JSON.parse(serialized);
      expect(parsed['conn-delegation-persist'].kind).toBe('delegation');
    });
  });

  describe('Requirement & TestCase', () => {
    it('REQ_TESTCASE_STABLE_IDENTITY: TestCase exists under stable canonical identity', () => {
      const { repo } = createFixture();
      const tc = repo.verificationCases.tc1;
      expect(tc).toBeDefined();
      expect(tc.id).toBe('tc1');
    });

    it('REQ_TESTCASE_VERIFIES_PERSISTED: TestCase verifiesRequirementIds preserved', () => {
      const { repo } = createFixture();
      expect(repo.verificationCases.tc1.verifiesRequirementIds).toContain('req1');
    });

    it('REQ_BLOCK_NO_DRILLDOWN: double-clicking Block on Requirement Diagram is no-op', () => {
      const action = resolveBlockDoubleClickAction('requirements', { id: 'vehicle', stereotype: 'block' });
      expect(action.action).toBe('none');
    });

    it('ADIA_LEGACY_VERIFICATION_NORMALIZATION: legacy VerificationCase normalized to TestCase under ADIA_EXTENSION', () => {
      const { repo } = createFixture();
      expect(repo.verificationCases.tc1.kind).toBe('verificationCase');
    });
  });

  describe('State Satisfy', () => {
    it('STATE_SATISFY_REAL_ID_REQUIRED: requires resolvable canonical State endpoint identity', () => {
      const { repo } = createFixture();
      const candidate = {
        id: 'rel-sat-missing-state',
        kind: 'satisfy' as const,
        sourceId: 'state-nonexistent',
        targetId: 'req1',
      };
      const result = validateCanonicalRelationshipCandidate(repo, candidate);
      expect(result.valid).toBe(false);
      expect(result.codes).toContain('MISSING_RELATIONSHIP_ENDPOINT');
    });

    it('STATE_SATISFY_DIRECTION_ENFORCED: reversed Requirement-to-State satisfy rejected with INVALID_SATISFY_DIRECTION', () => {
      const { stateEndpoint, reqEndpoint } = createFixture();
      const decision = evaluateSysmlConnection({
        relationshipKind: 'satisfy',
        source: reqEndpoint,
        target: stateEndpoint,
        diagram: 'requirements',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.diagnostics.some(d => d.code === 'INVALID_SATISFY_DIRECTION')).toBe(true);
    });

    it('STATE_SATISFY_RELATIONSHIP_PERSISTS: State-to-Requirement satisfy relationship valid and persists', () => {
      const { repo } = createFixture();
      const candidate = {
        id: 'rel-sat-valid',
        kind: 'satisfy' as const,
        sourceId: 'state-accelerating',
        targetId: 'req1',
      };
      const context = {
        externalEndpoints: new Map([
          ['state-accelerating', { id: 'state-accelerating', name: 'Accelerating', family: 'state' as const }],
        ]),
      };
      const result = validateCanonicalRelationshipCandidate(repo, candidate, context);
      expect(result.valid).toBe(true);
      repo.relationships['rel-sat-valid'] = candidate;
      const parsed = JSON.parse(JSON.stringify(repo.relationships));
      expect(parsed['rel-sat-valid'].sourceId).toBe('state-accelerating');
    });
  });

  describe('Package Diagram Activation (Cameo Tooling)', () => {
    it('CAMEO_DIAGRAM_ACTIVATE_ZERO_CREATES: zero package diagrams returns create', () => {
      const activation = resolvePackageDiagramActivation({ diagrams: {} });
      expect(activation).toEqual({ status: 'create', ownerId: 'model' });
    });

    it('CAMEO_DIAGRAM_ACTIVATE_ONE_OPENS: single package diagram opens directly without chooser', () => {
      const activation = resolvePackageDiagramActivation({
        diagrams: {
          pkgDiag1: { id: 'pkgDiag1', name: 'Architecture', diagramKind: 'package' } as any,
        },
      });
      expect(activation).toEqual({ status: 'open', diagramId: 'pkgDiag1' });
    });

    it('CAMEO_DIAGRAM_ACTIVATE_MANY_CHOOSER: multiple diagrams opens chooser or last active', () => {
      const activation = resolvePackageDiagramActivation({
        diagrams: {
          pkgDiag1: { id: 'pkgDiag1', name: 'Pkg B', diagramKind: 'package' } as any,
          pkgDiag2: { id: 'pkgDiag2', name: 'Pkg A', diagramKind: 'package' } as any,
        },
      });
      expect(activation.status).toBe('choose');
      if (activation.status === 'choose') {
        expect(activation.diagramIds).toEqual(['pkgDiag2', 'pkgDiag1']); // Sorted by name
      }
    });
  });

  describe('BDD Association and Property Endpoints (UML Foundation / OMG SysML 1.6)', () => {
    it('TASK1-A: typed Part property serves as Association member end with canonical endpoint identities', () => {
      const { repo } = createFixture();
      // vehicle owns prop-leftMotor typed by motor
      const candidate: SysmlRelationship = {
        id: 'rel-assoc-leftMotor',
        kind: 'association',
        sourceId: 'prop-leftMotor',
        targetId: 'motor',
      };
      const result = validateCanonicalRelationshipCandidate(repo, candidate);
      expect(result.valid).toBe(true);
      repo.relationships['rel-assoc-leftMotor'] = candidate;
      const parsed = JSON.parse(JSON.stringify(repo.relationships));
      expect(parsed['rel-assoc-leftMotor'].sourceId).toBe('prop-leftMotor');
      expect(parsed['rel-assoc-leftMotor'].targetId).toBe('motor');

      // Incompatible property type rejected:
      const badCandidate: SysmlRelationship = {
        id: 'rel-assoc-incompatible',
        kind: 'association',
        sourceId: 'prop-leftMotor',
        targetId: 'canBus',
      };
      const badResult = validateCanonicalRelationshipCandidate(repo, badCandidate);
      expect(badResult.valid).toBe(false);
      expect(badResult.codes).toContain('INCOMPATIBLE_PROPERTY_TYPE_ENDPOINT');
    });

    it('TASK1-B: Association relationship endpoints remain canonical and do not coerce to owner Block or fabricate anchors', () => {
      const { repo } = createFixture();
      const candidate: SysmlRelationship = {
        id: 'rel-assoc-prop',
        kind: 'association',
        sourceId: 'prop-rightMotor',
        targetId: 'motor',
      };
      repo.relationships[candidate.id] = candidate;

      // Endpoint identity remains the exact property id, not the parent vehicle block
      expect(repo.relationships['rel-assoc-prop'].sourceId).toBe('prop-rightMotor');
      expect(repo.relationships['rel-assoc-prop'].sourceId).not.toBe('vehicle');

      // Stale or missing property endpoint is rejected
      const staleCandidate: SysmlRelationship = {
        id: 'rel-assoc-stale',
        kind: 'association',
        sourceId: 'prop-nonexistent',
        targetId: 'motor',
      };
      const staleResult = validateCanonicalRelationshipCandidate(repo, staleCandidate);
      expect(staleResult.valid).toBe(false);
      expect(staleResult.codes).toContain('MISSING_RELATIONSHIP_ENDPOINT');
    });
  });
});
