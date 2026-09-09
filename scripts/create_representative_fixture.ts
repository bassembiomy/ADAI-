import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmptyRepository, type SysmlRepository } from '../src/engine/sysml/model';
import { serializeRepository } from '../src/engine/sysml/persistence';
import { traceArtifactToRequirement } from '../src/engine/sysml/evidence';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const repo: SysmlRepository = createEmptyRepository();
repo.revision = 3;

// Definitions - Value Types & Interfaces
repo.definitions['DataIF'] = {
  id: 'DataIF',
  name: 'DataIF',
  namespace: ['Vehicle'],
  kind: 'interface',
  features: ['telemetry', 'command'],
};

repo.definitions['PowerIF'] = {
  id: 'PowerIF',
  name: 'PowerIF',
  namespace: ['Vehicle'],
  kind: 'interface',
  features: ['voltage', 'current'],
};

repo.definitions['Real'] = {
  id: 'Real',
  name: 'Real',
  namespace: ['Common'],
  kind: 'valueType',
  unit: 'V',
  dimension: 'electricPotential',
};

repo.definitions['Watts'] = {
  id: 'Watts',
  name: 'Watts',
  namespace: ['Common'],
  kind: 'valueType',
  unit: 'W',
  dimension: 'power',
};

// Definitions - Blocks
repo.definitions['VehicleComponent'] = {
  id: 'VehicleComponent',
  name: 'VehicleComponent',
  namespace: ['Vehicle'],
  kind: 'block',
  isAbstract: true,
  isLeaf: false,
  properties: [
    { id: 'vc_voltage', name: 'voltage', kind: 'value', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
    { id: 'vc_power', name: 'powerRating', kind: 'value', typeId: 'Watts', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
    { id: 'vc_flow', name: 'flowStatus', kind: 'flow', typeId: 'Real', direction: 'out', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
  ],
  ports: [
    { id: 'fullPwr', name: 'fullPwr', kind: 'full', typeId: 'PowerIF', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
  ],
  operations: ['calibrate()'],
  constraints: ['powerRating > 0'],
};

repo.definitions['SpacecraftSystem'] = {
  id: 'SpacecraftSystem',
  name: 'SpacecraftSystem',
  namespace: ['Vehicle'],
  kind: 'block',
  isAbstract: false,
  isLeaf: false,
  properties: [
    { id: 'sys_refSubsystem', name: 'refSubsystem', kind: 'reference', typeId: 'VehicleComponent', multiplicity: { lower: 0, upper: 1, ordered: false, unique: true } },
    { id: 'sys_partProp', name: 'partProp', kind: 'part', typeId: 'PayloadSubsystem', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
  ],
  ports: [
    { id: 'extPwr', name: 'extPwr', kind: 'proxy', typeId: 'PowerIF', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
  ],
  operations: ['initializeSystem()'],
  constraints: ['extPwr.voltage == 28'],
};

repo.definitions['PayloadSubsystem'] = {
  id: 'PayloadSubsystem',
  name: 'PayloadSubsystem',
  namespace: ['Vehicle'],
  kind: 'block',
  isAbstract: false,
  isLeaf: false,
  supertypeIds: ['VehicleComponent'],
  properties: [
    { id: 'payload_voltage', name: 'voltage', kind: 'value', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
    { id: 'payload_auxRef', name: 'auxRef', kind: 'reference', typeId: 'AuxiliarySubsystem', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
  ],
  ports: [
    { id: 'payload_pwrIn', name: 'pwrIn', kind: 'proxy', typeId: 'PowerIF', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
    { id: 'payload_dataOut', name: 'dataOut', kind: 'proxy', typeId: 'DataIF', direction: 'out', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
  ],
  operations: ['captureData()'],
  constraints: ['dataRate <= 1000'],
};

repo.definitions['BusSubsystem'] = {
  id: 'BusSubsystem',
  name: 'BusSubsystem',
  namespace: ['Vehicle'],
  kind: 'block',
  isAbstract: false,
  isLeaf: false,
  supertypeIds: ['VehicleComponent'],
  properties: [
    { id: 'bus_voltage', name: 'voltage', kind: 'value', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
  ],
  ports: [
    { id: 'bus_pwrIn', name: 'pwrIn', kind: 'proxy', typeId: 'PowerIF', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
    { id: 'bus_dataIn', name: 'dataIn', kind: 'proxy', typeId: 'DataIF', direction: 'in', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
  ],
  operations: ['distributePower()'],
  constraints: [],
};

repo.definitions['AuxiliarySubsystem'] = {
  id: 'AuxiliarySubsystem',
  name: 'AuxiliarySubsystem',
  namespace: ['Vehicle'],
  kind: 'block',
  isAbstract: false,
  isLeaf: false,
  properties: [],
  ports: [],
  operations: [],
  constraints: [],
};

// Usages (Parts and Ports)
repo.usages['payloadPart'] = {
  id: 'payloadPart',
  name: 'payload',
  kind: 'part',
  ownerId: 'SpacecraftSystem',
  typeId: 'PayloadSubsystem',
  aggregation: 'composite',
  multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
};

repo.usages['busPart'] = {
  id: 'busPart',
  name: 'bus',
  kind: 'part',
  ownerId: 'SpacecraftSystem',
  typeId: 'BusSubsystem',
  aggregation: 'composite',
  multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
};

repo.usages['auxPart'] = {
  id: 'auxPart',
  name: 'auxiliary',
  kind: 'part',
  ownerId: 'SpacecraftSystem',
  typeId: 'AuxiliarySubsystem',
  aggregation: 'shared',
  multiplicity: { lower: 0, upper: 1, ordered: false, unique: true },
};

// Port Usages
repo.usages['extPwrUsage'] = {
  id: 'extPwrUsage',
  name: 'extPwr',
  kind: 'port',
  ownerId: 'SpacecraftSystem',
  definitionId: 'extPwr',
};

repo.usages['payloadPwrPort'] = {
  id: 'payloadPwrPort',
  name: 'pwrIn',
  kind: 'port',
  ownerId: 'payloadPart',
  definitionId: 'payload_pwrIn',
};

repo.usages['payloadDataPort'] = {
  id: 'payloadDataPort',
  name: 'dataOut',
  kind: 'port',
  ownerId: 'payloadPart',
  definitionId: 'payload_dataOut',
};

repo.usages['busPwrPort'] = {
  id: 'busPwrPort',
  name: 'pwrIn',
  kind: 'port',
  ownerId: 'busPart',
  definitionId: 'bus_pwrIn',
};

repo.usages['busDataPort'] = {
  id: 'busDataPort',
  name: 'dataIn',
  kind: 'port',
  ownerId: 'busPart',
  definitionId: 'bus_dataIn',
};

// Connectors
repo.connectors['c_assembly'] = {
  id: 'c_assembly',
  name: 'dataBusAssembly',
  kind: 'assembly',
  ownerId: 'SpacecraftSystem',
  sourcePortId: 'payloadDataPort',
  targetPortId: 'busDataPort',
  itemFlowId: 'DataIF',
  itemFlow: {
    conveyedClassifierId: 'DataIF',
    itemProperty: 'telemetryStream',
    multiplicity: '1',
  },
};

repo.connectors['c_delegation'] = {
  id: 'c_delegation',
  name: 'externalPowerDelegation',
  kind: 'delegation',
  ownerId: 'SpacecraftSystem',
  sourcePortId: 'extPwrUsage',
  targetPortId: 'busPwrPort',
  itemFlowId: 'PowerIF',
  itemFlow: {
    conveyedClassifierId: 'PowerIF',
    itemProperty: 'mainBus',
    multiplicity: '1',
  },
};

repo.connectors['c_binding'] = {
  id: 'c_binding',
  name: 'powerBinding',
  kind: 'binding',
  ownerId: 'SpacecraftSystem',
  sourcePortId: 'payloadPwrPort',
  targetPortId: 'busPwrPort',
};

// Relationships
repo.relationships['comp_payload'] = {
  id: 'comp_payload',
  kind: 'composition',
  sourceId: 'SpacecraftSystem',
  targetId: 'payloadPart',
};

repo.relationships['comp_bus'] = {
  id: 'comp_bus',
  kind: 'composition',
  sourceId: 'SpacecraftSystem',
  targetId: 'busPart',
};

repo.relationships['shared_aux'] = {
  id: 'shared_aux',
  kind: 'sharedAggregation',
  sourceId: 'SpacecraftSystem',
  targetId: 'auxPart',
};

repo.relationships['assoc_payload_aux'] = {
  id: 'assoc_payload_aux',
  kind: 'association',
  sourceId: 'PayloadSubsystem',
  targetId: 'AuxiliarySubsystem',
};

repo.relationships['gen_payload_vc'] = {
  id: 'gen_payload_vc',
  kind: 'generalization',
  sourceId: 'PayloadSubsystem',
  targetId: 'VehicleComponent',
};

repo.relationships['gen_bus_vc'] = {
  id: 'gen_bus_vc',
  kind: 'generalization',
  sourceId: 'BusSubsystem',
  targetId: 'VehicleComponent',
};

repo.relationships['dep_payload_bus'] = {
  id: 'dep_payload_bus',
  kind: 'dependency',
  sourceId: 'PayloadSubsystem',
  targetId: 'BusSubsystem',
};

repo.relationships['alloc_payload_bus'] = {
  id: 'alloc_payload_bus',
  kind: 'allocation',
  sourceId: 'payloadPart',
  targetId: 'busPart',
};

// Requirements
repo.requirements['req_safety'] = {
  id: 'req_safety',
  requirementId: 'REQ-SAFE-001',
  name: 'Payload Safety',
  namespace: ['Mission', 'Safety'],
  kind: 'requirement',
  text: 'Payload shall execute safely within thermal and power constraints.',
  status: 'verified',
  version: '2',
  owner: 'Systems Team',
  priority: 'high',
  risk: 'critical',
};

repo.requirements['req_perf'] = {
  id: 'req_perf',
  requirementId: 'REQ-PERF-001',
  name: 'Telemetry Performance',
  namespace: ['Mission', 'Telemetry'],
  kind: 'requirement',
  text: 'Telemetry rate shall exceed 100kbps under nominal link budget.',
  status: 'approved',
  version: '1',
  owner: 'Comms Team',
  priority: 'high',
  risk: 'medium',
};

repo.requirements['req_mission'] = {
  id: 'req_mission',
  requirementId: 'REQ-MSSN-001',
  name: 'Mission Life',
  namespace: ['Mission'],
  kind: 'requirement',
  text: 'Mission operational life shall exceed 5 years in orbit.',
  status: 'draft',
  version: '1',
  owner: 'Flight Dynamics',
  priority: 'medium',
  risk: 'low',
};

repo.requirements['req_thermal'] = {
  id: 'req_thermal',
  requirementId: 'REQ-THRM-001',
  name: 'Thermal Dissipation',
  namespace: ['Mission', 'Thermal'],
  kind: 'requirement',
  text: 'Thermal dissipation shall not exceed 50W during solar transit.',
  status: 'implemented',
  version: '1',
  owner: 'Thermal Team',
  priority: 'medium',
  risk: 'medium',
};

repo.requirements['req_safety_copy'] = {
  id: 'req_safety_copy',
  requirementId: 'REQ-SAFE-001-COPY',
  name: 'Payload Safety Copy',
  namespace: ['Mission', 'Safety'],
  kind: 'requirement',
  text: 'Payload shall execute safely within thermal and power constraints.',
  status: 'verified',
  version: '2',
  owner: 'Systems Team',
  priority: 'high',
  risk: 'critical',
};

// Requirement Relationships
repo.relationships['s_payload'] = {
  id: 's_payload',
  kind: 'satisfy',
  sourceId: 'payloadPart',
  targetId: 'req_safety',
};

repo.relationships['v_case'] = {
  id: 'v_case',
  kind: 'verify',
  sourceId: 'vc_payload_test',
  targetId: 'req_safety',
};

repo.relationships['d_perf'] = {
  id: 'd_perf',
  kind: 'deriveReqt',
  sourceId: 'req_perf',
  targetId: 'req_safety',
};

repo.relationships['r_block'] = {
  id: 'r_block',
  kind: 'refine',
  sourceId: 'SpacecraftSystem',
  targetId: 'req_mission',
};

repo.relationships['t_aux'] = {
  id: 't_aux',
  kind: 'trace',
  sourceId: 'AuxiliarySubsystem',
  targetId: 'req_thermal',
};

repo.relationships['c_copy'] = {
  id: 'c_copy',
  kind: 'copy',
  sourceId: 'req_safety_copy',
  targetId: 'req_safety',
};

// Verification Case
repo.verificationCases['vc_payload_test'] = {
  id: 'vc_payload_test',
  name: 'Payload Power Safety Verification',
  namespace: ['Verification'],
  kind: 'verificationCase',
  method: 'test',
  verifiesRequirementIds: ['req_safety'],
};

// Evidence
repo.evidence['ev_safety_1'] = {
  id: 'ev_safety_1',
  verificationCaseId: 'vc_payload_test',
  requirementId: 'req_safety',
  result: 'passed',
  executedAt: '2026-09-09T08:00:00Z',
  artifactUri: 'artifacts/payload_test_results.json',
};

// Artifacts
let linkedRepo = traceArtifactToRequirement(repo, {
  id: 'art_sim_1',
  name: 'Power Simulation Output',
  kind: 'simulation',
  ownerId: 'SpacecraftSystem',
  revision: repo.revision,
  uri: 'simulations/power_run.json',
}, 'req_safety').repository;

linkedRepo = traceArtifactToRequirement(linkedRepo, {
  id: 'art_code_1',
  name: 'payload_control.c',
  kind: 'generatedArtifact',
  ownerId: 'PayloadSubsystem',
  revision: repo.revision,
  uri: 'src/payload_control.c',
}, 'req_perf').repository;

const serialized = serializeRepository(linkedRepo);
const targetPath = resolve(__dirname, '../src/engine/sysml/fixtures/representative-profile.json');
mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, serialized, 'utf-8');
console.log('Fixture successfully generated at:', targetPath);
