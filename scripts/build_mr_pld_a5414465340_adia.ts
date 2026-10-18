/**
 * Build MR_PLD_A5414465340.adia from models/mr_pld_a5414465340/MR_PLD_A5414465340.sysml.
 *
 * Every element is a semantic element of the ADIA repository, created through the gateway
 * commands the editor uses. The blocks are exactly the `part def`s of the source (Driver, a
 * human participant, is the Actor of the use cases); nothing structural is invented.
 *
 *   attribute def / enum def   -> ValueTypes / Enumerations («modelLibrary» Types, Identification, Signals)
 *   item def                   -> Signals (the payload of every item flow and sequence message)
 *   port def / interface def   -> InterfaceBlocks; X1 (16) / X2 (55) are ports with one nested port per pin
 *   part def                   -> Blocks with values, parts (+ composition), proxy ports, operations, receptions
 *   :>> redefinitions          -> redefining value properties on the specialised component / sensor blocks
 *   connect / interface / flow -> IBD connectors of OM501LA_EngineSystem, MR_PLD_ECU and its subsystems
 *   requirement def / satisfy  -> Requirements (+ per-block derived requirements) and one requirements diagram per block
 *   constraint def / calc def  -> ConstraintBlocks; SensorChainContext + MR_PLD_ECU parametric diagrams
 *   state def                  -> the executable state machine (scripts/mr_pld_a5414465340_behaviour.ts)
 *   action def                 -> Activities with swimlanes allocated to the blocks
 *   occurrence def (sd)        -> Interactions + sequence diagrams over the IBD connectors
 *   verification / analysis    -> Verification cases; the 14 simulation scenarios are simulation test cases
 *   (use cases)                -> Use case diagram of the MR_PLD_ECU subject
 *
 * The build fails unless the app's validators report nothing.
 * Run: npx tsx scripts/build_mr_pld_a5414465340_adia.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlEditorCommand, type SysmlGatewayState } from '../src/services/sysmlCommandGateway';
import { buildCreatePathIbdConnectorCommand } from '../src/services/sysmlIbdConnectorCommands';
import { buildCreateParametricBindingCommand } from '../src/services/sysmlParametricCommands';
import { buildCreateUseCaseRelationshipCommand } from '../src/services/sysmlUseCaseCommands';
import { buildCreateAllocationCommand } from '../src/services/sysmlAllocationCommands';
import {
  buildAddActivityEdgeCommand, buildAddActivityNodeCommand, buildAddPartitionCommand, type ActivityCommandPlan,
} from '../src/services/sysmlActivityCommands';
import {
  buildAddFragmentCommand, buildAddInteractionConstraintCommand, buildAddInteractionMessageCommand, buildAddInteractionUseCommand,
  buildAddLifelineCommand, buildAddStateInvariantCommand, type InteractionCommandPlan,
} from '../src/services/sysmlInteractionCommands';
import {
  createActivity, createActor, createDiagramDefinition, createInteraction, createRequirement, createSubject, createUseCase,
  createVerificationCase,
} from '../src/features/modelExplorer/adapters/modelExplorerFactories';
import {
  createEmptyRepository, type BlockDefinition, type Multiplicity, type PortDefinition, type PropertyDefinition, type SysmlRepository,
} from '../src/engine/sysml/model';
import { serializeSysmlProjectState } from '../src/engine/sysml/persistence';
import { getCachedLegacyView } from '../src/engine/sysml/normalizedStore';
import { validateSysmlRepository } from '../src/engine/sysml/validation';
import { deriveIbdView } from '../src/engine/sysml/ibd';
import { deriveBddView } from '../src/engine/sysml/bdd';
import { projectStateEndpoints } from '../src/engine/sysml/workers/projectIoPayload';
import { createUnifiedProjectPayload } from '../src/utils/adiaProjectPersistence';
import { createAppSimulationSession } from '../src/utils/stateMachine/smAppAdapter';
import type { PresentationCoordinates } from '../src/engine/sysml/presentationState';
import * as SM from './mr_pld_a5414465340_behaviour';
import { DERIVED, STATE_SATISFIES, SUPPLEMENTARY, TOP_SATISFIED_BY } from './mr_pld_a5414465340_requirements';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(resolve(ROOT, 'models/mr_pld_a5414465340/MR_PLD_A5414465340.sysml'), 'utf8');
const OUT = resolve(ROOT, 'MR_PLD_A5414465340.adia');

const behaviour = {
  version: 'v2.4 ENGINE', projectName: 'MR_PLD_A5414465340', tickMs: SM.TICK_MS, safetyMode: false,
  states: SM.states, junctions: SM.junctions, transitions: SM.transitions, variables: SM.variables, layers: SM.layers,
  view: { scale: 0.55, offsetX: 80, offsetY: 60 }, interfaceRealizations: [], customStereotypes: [], hmiComponents: SM.hmiComponents,
  vlabNodes: [], vlabEdges: [], globalXBridgesNodes: [], globalXBridgesEdges: [], entropyNodes: [], entropyEdges: [],
};
createAppSimulationSession(behaviour as never); // throws unless the state machine passes the app's rules
const stateContext = { externalEndpoints: projectStateEndpoints(behaviour.states) };

// ----------------------------------------------------------------- helpers
const mult = (text = '1'): Multiplicity => {
  if (text === '*') return { lower: 0, upper: '*', ordered: false, unique: true };
  const [lo, hi] = text.split('..');
  if (hi === undefined) return { lower: Number(lo), upper: Number(lo), ordered: false, unique: true };
  return { lower: Number(lo), upper: hi === '*' ? '*' : Number(hi), ordered: false, unique: true };
};
const one = mult('1');
const docOf = (body: string) => body.replace(/\s*\n\s*\*\s?/g, ' ').replace(/\s+/g, ' ').trim();
const between = (text: string, start: string, end: string) => {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`source has no "${start}"`);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to < 0 ? undefined : to);
};

const repo: SysmlRepository = createEmptyRepository();
const NS = 'MercedesBenz_MR_PLD_A5414465340';
const P = {
  root: 'pkg_MR_PLD', types: 'pkg_Types', ident: 'pkg_Identification', signals: 'pkg_Signals', ifaces: 'pkg_Interfaces',
  reqs: 'pkg_Requirements', hw: 'pkg_HardwareStructure', ibd: 'pkg_InternalStructure', par: 'pkg_Parametrics',
  beh: 'pkg_OperationalBehavior', sd: 'pkg_Interactions', ana: 'pkg_AnalysisAndSimulation', trace: 'pkg_Traceability',
  variants: 'pkg_Variants', views: 'pkg_Views', uc: 'pkg_UseCases',
};
repo.packages[P.root] = { id: P.root, kind: 'package', name: NS, namespace: [], ownerId: 'model' };
const PACKAGE_NAMES: Array<[string, string, 'modelLibrary'?]> = [
  [P.types, '00_Types', 'modelLibrary'], [P.ident, '01_Identification'], [P.signals, '02_Signals'], [P.ifaces, '03_Interfaces'],
  [P.reqs, '04_Requirements'], [P.hw, '05_HardwareStructure'], [P.ibd, '06_InternalStructure'], [P.par, '07_Parametrics'],
  [P.beh, '08_OperationalBehavior'], [P.sd, '09_Interactions'], [P.ana, '10_AnalysisAndSimulation'], [P.trace, '11_Traceability'],
  [P.variants, '12_Variants'], [P.views, '13_Views'], [P.uc, '14_UseCases'],
];
for (const [id, name, stereotype] of PACKAGE_NAMES) {
  repo.packages[id] = { id, kind: 'package', name, namespace: [NS], ownerId: P.root, ...(stereotype ? { stereotype } : {}) };
}
const ns = (pkgId: string) => [NS, repo.packages[pkgId].name];

// ------------------------------------------- 00 Types: ScalarValues / ISQ / SI
const QK: Array<[string, string, string]> = [
  ['qk_ElectricPotential', 'ElectricPotential', 'U'], ['qk_ElectricCurrent', 'ElectricCurrent', 'I'], ['qk_Frequency', 'Frequency', 'f'],
];
for (const [id, name, symbol] of QK) repo.definitions[id] = { id, kind: 'quantityKind', name, symbol, namespace: ns(P.types), ownerId: P.types };
const UNITS: Array<[string, string, string, string]> = [['u_V', 'volt', 'V', 'qk_ElectricPotential'], ['u_A', 'ampere', 'A', 'qk_ElectricCurrent'], ['u_Hz', 'hertz', 'Hz', 'qk_Frequency']];
for (const [id, name, symbol, quantityKindId] of UNITS) repo.definitions[id] = { id, kind: 'unit', name, symbol, quantityKindId, namespace: ns(P.types), ownerId: P.types };
const VT: Array<[string, string, string?, string?, string?]> = [
  ['vt_Real', 'Real'], ['vt_Integer', 'Integer'], ['vt_Boolean', 'Boolean'], ['vt_String', 'String'],
  ['vt_ElectricPotentialValue', 'ElectricPotentialValue', 'u_V', 'qk_ElectricPotential', 'V'],
  ['vt_ElectricCurrentValue', 'ElectricCurrentValue', 'u_A', 'qk_ElectricCurrent', 'A'],
  ['vt_FrequencyValue', 'FrequencyValue', 'u_Hz', 'qk_Frequency', 'Hz'],
];
for (const [id, name, unitId, quantityKindId, unit] of VT) {
  repo.definitions[id] = { id, kind: 'valueType', name, namespace: ns(P.types), ownerId: P.types, ...(unitId ? { unitId, unit, quantityKindId } : {}) };
}
// 01 Identification: attribute def ECU_Label, enum def EngineVariant
repo.definitions.vt_ECU_Label = { id: 'vt_ECU_Label', kind: 'valueType', name: 'ECU_Label', namespace: ns(P.ident), ownerId: P.ident };
const ENUMS: Array<[string, string, string[]]> = [
  [P.ident, 'EngineVariant', ['OM501LA_V6', 'OM502LA_V8']],
  [P.signals, 'KeyState', ['OFF', 'IGN', 'CRANK', 'RUN', 'BRAKE']], [P.signals, 'SyncMode', ['BOTH', 'CMP_ONLY', 'CKP_ONLY', 'NONE']],
  [P.signals, 'Severity', ['CRITICAL', 'DERATE', 'WARNING', 'DRIFT']], [P.signals, 'SensorFaultMode', ['NORMAL', 'OPEN', 'SCG', 'SCB', 'DRIFT']],
  [P.signals, 'PinDirection', ['IN', 'OUT', 'INOUT', 'GND', 'NC']], [P.signals, 'InjectionPhase', ['IDLE', 'PEAK', 'BIP_WAIT', 'HOLD', 'SPILL']],
];
for (const [pkg, name, literals] of ENUMS) repo.definitions[`enum_${name}`] = { id: `enum_${name}`, kind: 'enumeration', name, literals, namespace: ns(pkg), ownerId: pkg };
const TYPE: Record<string, string> = {
  Real: 'vt_Real', Integer: 'vt_Integer', Boolean: 'vt_Boolean', String: 'vt_String', ElectricPotentialValue: 'vt_ElectricPotentialValue',
  ElectricCurrentValue: 'vt_ElectricCurrentValue', FrequencyValue: 'vt_FrequencyValue', ECU_Label: 'vt_ECU_Label',
  EngineVariant: 'enum_EngineVariant', KeyState: 'enum_KeyState', Severity: 'enum_Severity', PinDirection: 'enum_PinDirection',
};
const typeId = (name: string) => { const id = TYPE[name]; if (!id) throw new Error(`unknown type ${name}`); return id; };

// ------------------------------------------------------- 02 Signals (item defs)
const SIGNALS = ['KL15_On', 'KL15_Off', 'KL50_CrankRequest', 'BlockStartButton', 'BlockStopButton', 'SelfTestPassed', 'SyncLocked', 'SyncLost',
  'CkpLost', 'CkpRestored', 'CmpLost', 'EngineRunning', 'EngineStopped', 'AfterrunComplete', 'EngineBrakeRequest', 'EngineBrakeRelease',
  'OvertempDetected', 'OvertempCleared', 'BankShortDetected', 'CanTimeout', 'CanRestored', 'PeakCurrentReached', 'BipDetected',
  'OvercurrentTrip', 'ImmoRejected', 'CanFrame', 'ImmoReleaseFrame', 'TorqueRequestFrame', 'EngineDataFrame', 'SoiTrigger', 'EoiTrigger',
  'VrToothPulse', 'FaultRecord', 'ElectricalPower', 'Fuel'];
for (const name of SIGNALS) {
  if (!new RegExp(`item def ${name}\\b`).test(SOURCE)) throw new Error(`item def ${name} missing in the source`);
  repo.definitions[`sig_${name}`] = { id: `sig_${name}`, kind: 'signal', name, namespace: ns(P.signals), ownerId: P.signals };
}
const sig = (name: string) => { const id = `sig_${name}`; if (!repo.definitions[id]) throw new Error(`unknown signal ${name}`); return id; };
/** Attributes of the item defs that carry data (Signals have no attributes in the ADIA metamodel: shown as message arguments). */
const ITEM_ATTRIBUTES: Record<string, string> = {
  CanFrame: 'identifier, dlc', ImmoReleaseFrame: 'identifier, dlc, authCode', TorqueRequestFrame: 'identifier, dlc, pedalPct',
  EngineDataFrame: 'identifier, dlc, rpm, coolantC, oilPressureBar', SoiTrigger: 'cylinder, soiDegBTDC, durationDegCA',
  EoiTrigger: 'cylinder', VrToothPulse: 'toothIndex', FaultRecord: 'mrCode, j1939Spn, fmi, severity',
};

// ------------------------------------------------ 03 Interfaces (port defs)
const interfaceIds: Record<string, string> = {};
const nominal: Record<string, PortDefinition['direction']> = {};
const iface = (name: string, direction: PortDefinition['direction'], features: string[]) => {
  const id = `if_${name}`;
  repo.definitions[id] = { id, kind: 'interface', name, features, namespace: ns(P.ifaces), ownerId: P.ifaces };
  interfaceIds[name] = id;
  nominal[id] = direction;
};
iface('SupplyPort', 'out', ['out voltage : ElectricPotentialValue', 'out power : ElectricalPower']);
iface('GroundPort', 'inout', []);
iface('AnalogSignalPort', 'out', ['out voltage : ElectricPotentialValue']);
iface('VRSignalPort', 'out', ['out vpp : ElectricPotentialValue', 'out frequency : FrequencyValue', 'out tooth : VrToothPulse']);
iface('DigitalInputPort', 'out', ['out active : Boolean']);
iface('CanPort', 'inout', ['bitRate : Real = 250000.0', 'inout canFrame : CanFrame']);
iface('KLinePort', 'inout', ['protocol : String = "ISO 14230 (KWP2000)"']);
iface('SolenoidDrivePort', 'out', ['out current : ElectricCurrentValue']);
iface('ValveDrivePort', 'out', ['out dutyCyclePct : Real']);
iface('RelayDrivePort', 'out', ['out energised : Boolean']);
iface('GateDrivePort', 'out', ['out gateOn : Boolean', 'out trigger : SoiTrigger']);
iface('CurrentSensePort', 'out', ['out senseVoltage : ElectricPotentialValue']);
iface('MemoryBusPort', 'inout', ['widthBits : Integer']);
iface('SerialMemoryPort', 'inout', ['protocol : String = "Microwire"']);
iface('FuelPort', 'inout', ['inout fuel : Fuel']);
iface('ConnectorPin', 'inout', ['pinNo : Integer', 'direction : PinDirection', 'signalName : String', 'function : String', 'testValue : String']);

// X1 / X2 pin tables, read from the port defs of the source
interface Pin { no: number; dir: string; signal: string; fn: string; test: string }
const pinsOf = (portDef: string): Pin[] => {
  const body = between(SOURCE, `port def ${portDef}`, '\n        }\n');
  const re = /port pin_(\d+) : ConnectorPin \{ :>> pinNo = \d+; :>> direction = PinDirection::(\w+); :>> signalName = "([^"]*)"; :>> function = "([^"]*)"; :>> testValue = "([^"]*)"; \}/g;
  return [...body.matchAll(re)].map(m => ({ no: Number(m[1]), dir: m[2], signal: m[3], fn: m[4], test: m[5] }));
};
const X1 = pinsOf('X1_CabConnector16');
const X2 = pinsOf('X2_EngineConnector55');
if (X1.length !== 16 || X2.length !== 55) throw new Error(`pin tables: X1 ${X1.length}, X2 ${X2.length}`);
const pinName = (no: number) => `pin_${String(no).padStart(2, '0')}`;
const pinFeature = (p: Pin) => `port ${pinName(p.no)} : ${p.dir} ${p.signal} - ${p.fn} - ${p.test}`;
iface('X1_CabConnector16', 'inout', X1.map(pinFeature));
iface('X2_EngineConnector55', 'inout', X2.map(pinFeature));
// interface defs (connection definitions)
iface('CanBusLink', 'inout', ['end port nodeA : CanPort', 'end port nodeB : CanPort', 'IES-CAN 250 kbit/s, 120 Ohm termination per node end']);
iface('AnalogSensorLink', 'inout', ['end port sensor : AnalogSignalPort', 'end port ecu : ~AnalogSignalPort']);
iface('VRSensorLink', 'inout', ['end port sensor : VRSignalPort', 'end port ecu : ~VRSignalPort']);
iface('SolenoidLink', 'inout', ['end port driver : SolenoidDrivePort', 'end port coil : ~SolenoidDrivePort']);
iface('ValveLink', 'inout', ['end port driver : ValveDrivePort', 'end port valve : ~ValveDrivePort']);
iface('SupplyLink', 'inout', ['end port source : SupplyPort', 'end port sink : ~SupplyPort']);

/**
 * The interface each pin carries. In the source every pin is a ConnectorPin; the pins a harness connector
 * reaches are typed by the port def at the other end (conjugated where the ECU receives) so that the IBD
 * connector rules can check direction and interface; reserved / return pins stay ConnectorPin.
 */
const PIN_TYPE: Record<string, Record<number, string>> = {
  x1: { 1: 'CanPort', 2: 'CanPort', 3: 'GroundPort', 4: 'GroundPort', 5: '~SupplyPort', 6: '~SupplyPort', 8: '~DigitalInputPort', 9: '~GroundPort',
    10: 'SupplyPort', 11: '~GroundPort', 12: 'RelayDrivePort', 13: 'KLinePort', 14: 'ValveDrivePort', 15: '~DigitalInputPort', 16: 'ValveDrivePort' },
  x2: { 1: 'GroundPort', 2: 'GroundPort', 3: 'GroundPort', 4: 'GroundPort', 6: 'SupplyPort', 7: 'SupplyPort', 9: 'SolenoidDrivePort', 10: 'GroundPort',
    12: 'SupplyPort', 15: 'GroundPort', 16: 'SolenoidDrivePort', 18: 'RelayDrivePort', 19: '~VRSignalPort', 20: '~VRSignalPort', 21: 'GroundPort',
    23: 'GroundPort', 25: '~DigitalInputPort', 29: '~AnalogSignalPort', 30: 'SupplyPort', 32: '~AnalogSignalPort', 33: '~AnalogSignalPort',
    34: '~AnalogSignalPort', 35: '~DigitalInputPort', 36: '~AnalogSignalPort', 37: 'SolenoidDrivePort', 38: 'SolenoidDrivePort',
    39: '~AnalogSignalPort', 41: 'ValveDrivePort', 43: 'ValveDrivePort', 44: 'SolenoidDrivePort', 45: 'SolenoidDrivePort',
    46: 'SolenoidDrivePort', 47: 'SolenoidDrivePort', 48: '~AnalogSignalPort', 49: 'GroundPort', 50: 'ValveDrivePort', 51: 'ValveDrivePort',
    52: 'SupplyPort', 53: 'SolenoidDrivePort', 54: 'SolenoidDrivePort' },
};

const port = (owner: string, name: string, type: string, multiplicity = '1', ownerPortId?: string): PortDefinition => {
  const tid = interfaceIds[type.replace('~', '')];
  if (!tid) throw new Error(`unknown port type ${type}`);
  return {
    id: ownerPortId ? `${ownerPortId}.${name}` : `${owner}.${name}`, name, kind: 'proxy', portKind: 'proxyPort', typeId: tid,
    direction: nominal[tid], isConjugated: type.startsWith('~'), multiplicity: mult(multiplicity),
    ...(ownerPortId ? { ownerPortId, nestedPortPathIds: [ownerPortId, `${ownerPortId}.${name}`] } : {}),
  };
};

// ------------------------------------------------------------------- blocks
type Value = [name: string, type: string, defaultValue?: string | number, multiplicity?: string];
interface BlockSpec {
  name: string; pkg: string; abstract?: boolean; general?: string; doc?: string;
  values?: Value[]; redefines?: Array<[string, string | number]>; parts?: Array<[string, string, string?]>;
  ports?: Array<[string, string, string?]>; operations?: string[]; receptions?: string[]; constraints?: string[];
}
const blockId = (name: string) => `blk_${name}`;
const compositions: Array<[owner: string, type: string, role: string, multiplicity: string]> = [];
const generalizations: Array<[string, string]> = [];
const value = (owner: string, [name, type, defaultValue, multiplicity]: Value): PropertyDefinition => ({
  id: `${owner}.${name}`, name, kind: 'value', typeId: typeId(type), multiplicity: mult(multiplicity),
  ...(defaultValue !== undefined ? { defaultValue: String(defaultValue) } : {}),
});
const findValue = (general: string, name: string): PropertyDefinition => {
  const def = repo.definitions[blockId(general)] as BlockDefinition;
  const found = def.properties.find(p => p.name === name);
  if (!found) throw new Error(`${general} has no ${name} to redefine`);
  return found;
};
const block = (spec: BlockSpec) => {
  const id = blockId(spec.name);
  const properties: PropertyDefinition[] = [
    ...(spec.redefines ?? []).map(([name, v]) => {
      const inherited = findValue(spec.general!, name);
      return { ...inherited, id: `${id}.${name}`, defaultValue: String(v), redefinesId: inherited.id };
    }),
    ...(spec.values ?? []).map(v => value(id, v)),
    ...(spec.parts ?? []).map(([name, type, m]) => {
      compositions.push([id, blockId(type), name, m ?? '1']);
      return { id: `${id}.${name}`, name, kind: 'part' as const, typeId: blockId(type), multiplicity: mult(m) };
    }),
  ];
  const def: BlockDefinition = {
    id, kind: 'block', name: spec.name, namespace: ns(spec.pkg), ownerId: spec.pkg, isAbstract: spec.abstract ?? false, isLeaf: false,
    properties, ports: (spec.ports ?? []).map(([name, type, m]) => port(id, name, type, m)), operations: spec.operations ?? [],
    constraints: [...(spec.doc ? [spec.doc] : []), ...(spec.constraints ?? [])],
    ...(spec.receptions ? { receptions: spec.receptions.map(sig) } : {}),
  };
  repo.definitions[id] = def;
  if (spec.general) generalizations.push([id, blockId(spec.general)]);
  return def;
};
const HW = P.hw;
const EC = 'ElectronicComponent';
block({ name: EC, pkg: HW, abstract: true, values: [['refDes', 'String'], ['partNumber', 'String'], ['packageType', 'String']] });
// compute core
block({ name: 'SAK_C167CS_LM', pkg: HW, general: EC, doc: 'Siemens/Infineon C167CS, ROM-less, MQFP-144 (mounted at 45 deg).',
  redefines: [['partNumber', 'SAK-C167CS-LM'], ['packageType', 'P-MQFP-144']],
  values: [['adcBits', 'Integer', 10], ['adcInputs', 'Integer', 24], ['canModules', 'Integer', 2], ['capcomChannels', 'Integer', 32]],
  ports: [['vdd', '~SupplyPort'], ['extBus', 'MemoryBusPort'], ['microwire', 'SerialMemoryPort'], ['capcomIn', '~VRSignalPort'], ['soiOut', 'GateDrivePort'],
    ['can', 'CanPort'], ['asc0', 'KLinePort'], ['adcIn', '~AnalogSignalPort', '12']],
  operations: ['computeQuantity()', 'computeSoi()', 'armCapcom()', 'synchronise()', 'authorise()', 'rampToIdle()'],
  receptions: ['ImmoReleaseFrame', 'TorqueRequestFrame', 'VrToothPulse', 'CkpLost', 'CanTimeout', 'FaultRecord', 'BipDetected', 'EngineBrakeRequest'] });
block({ name: 'TEMIC_845AW', pkg: HW, general: EC, doc: 'Co-processor / watchdog / digital input supervisor (PLCC-68). Function TBV.',
  redefines: [['packageType', 'PLCC-68']], ports: [['vdd', '~SupplyPort'], ['digIn', '~DigitalInputPort', '6']], operations: ['selfTest()'] });
block({ name: 'AM29F400BB', pkg: HW, general: EC,
  doc: '4 Mbit (512 KB) bottom-boot flash. Map: 0x00000-0x03FFF boot, 0x04000-0x5FFFF code, 0x60000-0x7FEFF data set (maps), 0x7FF00-0x7FFFF checksums. BSL entry: DQ4 (pin 24) to GND via 1 kOhm at reset = C167 P0L.4 low (TBV).',
  redefines: [['partNumber', 'AM29F400BB'], ['packageType', 'PSOP-44']], values: [['capacityKB', 'Integer', 512]], ports: [['bus', '~MemoryBusPort']] });
block({ name: 'M93C86', pkg: HW, general: EC, doc: '16 kbit (2 KB) Microwire EEPROM: immobiliser pairing, engine no., device codes.',
  redefines: [['partNumber', '93C86'], ['packageType', 'SOIC-8']], values: [['capacityBytes', 'Integer', 2048]], ports: [['microwire', '~SerialMemoryPort']],
  receptions: ['FaultRecord'] });
block({ name: 'PLD_C1_1', pkg: HW, general: EC, doc: 'TEMIC PLD_C1.1 (PLCC-44): gate sequencer and peak/hold chopper logic. Executes InjectionMicroCycle.',
  redefines: [['packageType', 'PLCC-44']], ports: [['soiIn', '~GateDrivePort'], ['gateOut', 'GateDrivePort', '10'], ['currentTripIn', '~CurrentSensePort', '2']],
  operations: ['pullIn()', 'detectBip()', 'holdChop()', 'release()'],
  receptions: ['SoiTrigger', 'EoiTrigger', 'PeakCurrentReached', 'BipDetected', 'OvercurrentTrip'] });
block({ name: 'Crystal4MHz', pkg: HW, general: EC, values: [['frequencyMHz', 'Real', 4.0]] });
// analogue front-end
block({ name: 'LM2903D', pkg: HW, general: EC, doc: 'Dual comparator - VR zero-crossing detector.', redefines: [['partNumber', 'LM2903D']],
  ports: [['vrIn', '~VRSignalPort'], ['output', 'VRSignalPort']], receptions: ['VrToothPulse'] });
block({ name: 'LM2904D', pkg: HW, general: EC, doc: 'Dual op-amp - ratiometric sensor buffer.', redefines: [['partNumber', 'LM2904D']],
  ports: [['inp', '~AnalogSignalPort'], ['output', 'AnalogSignalPort']] });
block({ name: 'LM2901D', pkg: HW, general: EC, doc: 'Quad comparator - shunt current thresholds (peak / hold / overcurrent / open).',
  redefines: [['partNumber', 'LM2901D']], ports: [['senseIn', '~CurrentSensePort'], ['trip', 'CurrentSensePort']] });
block({ name: 'NtcPullUpNetwork', pkg: HW, general: EC, doc: '2.49 kOhm 0.1 % pull-up to VAREF + RC low-pass.', values: [['rPullUpOhm', 'Real', 2490.0]],
  ports: [['vref', '~SupplyPort'], ['sensor', '~AnalogSignalPort'], ['toAdc', 'AnalogSignalPort']] });
block({ name: 'OnboardBaroSensor', pkg: HW, general: EC, doc: 'Absolute MEMS barometric sensor on PCB, 0.50-1.15 bar -> 0.5-4.5 V (TBV).',
  ports: [['vdd', '~SupplyPort'], ['output', 'AnalogSignalPort']] });
// power & comms
block({ name: 'TLE4275', pkg: HW, general: EC, doc: '5 V / 450 mA LDO with reset; output 4.90 .. 5.10 V.', redefines: [['partNumber', 'TLE4275']],
  values: [['vOutNom', 'Real', 5.0], ['vOutTolPct', 'Real', 2.0]], ports: [['vin', '~SupplyPort'], ['wake', '~DigitalInputPort'], ['vout', 'SupplyPort']],
  operations: ['wakeUp()'] });
block({ name: 'EmiChoke', pkg: HW, general: EC, redefines: [['partNumber', 'S+M 882590']] });
block({ name: 'CanTransceiver', pkg: HW, general: EC, doc: 'PCA82C250 / B10011S class transceiver.', ports: [['bus', 'CanPort'], ['mcu', '~CanPort']],
  receptions: ['ImmoReleaseFrame', 'TorqueRequestFrame', 'FaultRecord', 'EngineDataFrame', 'CanFrame'] });
block({ name: 'L9637D', pkg: HW, general: EC, redefines: [['partNumber', 'L9637D']], ports: [['line', 'KLinePort'], ['mcu', '~KLinePort']] });
// power stage
block({ name: 'BUZ102SL', pkg: HW, general: EC, doc: 'High-side MOSFET, D2PAK.', redefines: [['partNumber', 'BUZ102SL'], ['packageType', 'TO-263']],
  ports: [['gate', '~GateDrivePort'], ['output', 'SolenoidDrivePort']] });
block({ name: 'SUD25N06_45L', pkg: HW, general: EC, doc: 'Low-side solenoid MOSFET, DPAK.', redefines: [['partNumber', 'SUD25N06-45L'], ['packageType', 'TO-252']],
  ports: [['gate', '~GateDrivePort'], ['drain', 'SolenoidDrivePort']], receptions: ['SoiTrigger', 'PeakCurrentReached'] });
block({ name: 'DaleShunt', pkg: HW, general: EC, redefines: [['partNumber', 'Vishay DALE R033F']], values: [['resistanceOhm', 'Real', 0.033]],
  ports: [['sense', 'CurrentSensePort']] });
block({ name: 'FreewheelNetwork', pkg: HW, general: EC, redefines: [['packageType', 'SMB + 0805']] });
// ECU subsystems
block({ name: 'ComputeCore', pkg: HW, parts: [['mcu', 'SAK_C167CS_LM'], ['coProcessor', 'TEMIC_845AW'], ['flash', 'AM29F400BB'], ['eeprom', 'M93C86'], ['crystals', 'Crystal4MHz', '2']],
  constraints: ['mcu.refDes = "U1"', 'coProcessor.refDes = "U4"', 'flash.refDes = "U2"', 'eeprom.refDes = "U5"'] });
block({ name: 'SensorAFE', pkg: HW, parts: [['vrComparators', 'LM2903D', '2'], ['buffers', 'LM2904D', '2'], ['ntcNetworks', 'NtcPullUpNetwork', '4'], ['baro', 'OnboardBaroSensor']] });
block({ name: 'InjectionPowerStage', pkg: HW,
  parts: [['gateCpld', 'PLD_C1_1'], ['hsBank1', 'BUZ102SL'], ['hsBank2', 'BUZ102SL'], ['lowSide', 'SUD25N06_45L', '8'], ['shuntBank1', 'DaleShunt'],
    ['shuntBank2', 'DaleShunt'], ['currentComparators', 'LM2901D', '3'], ['freewheel', 'FreewheelNetwork', '8']],
  constraints: ['gateCpld.refDes = "U3"', 'hsBank1.refDes = "Q_HS1"', 'hsBank2.refDes = "Q_HS2"', 'shuntBank1.refDes = "R_SH1"', 'shuntBank2.refDes = "R_SH2"',
    'lowSide: Q_LS1..3 cyl 1-3, Q_LS5..7 cyl 4-6, Q_LS4 / Q_LS8 cyl 7 / 8 (V8 only)'],
  receptions: ['SoiTrigger', 'PeakCurrentReached'] });
block({ name: 'ValveAndStarterDrivers', pkg: HW, parts: [['hsValveSupply', 'BUZ102SL'], ['hsStarter', 'BUZ102SL'], ['hsAux', 'BUZ102SL']],
  ports: [['starterOut', 'RelayDrivePort'], ['pvOut', 'ValveDrivePort', '4']],
  constraints: ['hsValveSupply.refDes = "Q_HS3"', 'hsStarter.refDes = "Q_HS4"', 'hsAux.refDes = "Q_HS5"'], operations: ['engageStarter()'] });
block({ name: 'PowerSupplyAndComms', pkg: HW, parts: [['regulator', 'TLE4275'], ['choke', 'EmiChoke'], ['canPhy', 'CanTransceiver', '2'], ['kLinePhy', 'L9637D']],
  constraints: ['regulator.refDes = "U16"', 'choke.refDes = "L_FILT1"', 'kLinePhy.refDes = "U15"'] });
// the ECU
const label = 'A 541 446 53 40 | ZGS 001 | TEMIC 287699.01 B | OM 501 LA.II/2-00 (V6, Euro II) | 541.922-00-063818 | 1061 1047 1034 1026';
const ECU = blockId('MR_PLD_ECU');
const x1 = port(ECU, 'x1', 'X1_CabConnector16');
const x2 = port(ECU, 'x2', 'X2_EngineConnector55');
// Pin ports keep the source id (x2.pin_19) and are named <connector>_<pin>_<signal> (X2_19_CKP_SIG): names must be unique in the block.
const pinPorts = (connector: PortDefinition, key: 'x1' | 'x2', pins: Pin[]) =>
  pins.map(p => ({ ...port(ECU, pinName(p.no), PIN_TYPE[key][p.no] ?? 'ConnectorPin', '1', connector.id), name: `${key.toUpperCase()}_${String(p.no).padStart(2, '0')}_${p.signal}` }));
block({ name: 'MR_PLD_ECU', pkg: HW, doc: 'Engine controller MR (Motor-Regelung) for PLD unit-pump injection. Exhibits MR_PLD_OperatingStates.',
  values: [['label', 'ECU_Label', label], ['engineVariant', 'EngineVariant', 'OM501LA_V6'], ['rShuntOhm', 'Real', 0.033], ['iPeakA', 'Real', 16.0],
    ['iHoldA', 'Real', 8.0], ['iOvercurrentA', 'Real', 24.0], ['vRefV', 'Real', 5.0], ['rPullUpOhm', 'Real', 2490.0],
    ['firingOrder', 'Integer', '(1, 4, 2, 5, 3, 6)', '6'], ['firingIntervalDeg', 'Real', 120.0]],
  parts: [['core', 'ComputeCore'], ['afe', 'SensorAFE'], ['injStage', 'InjectionPowerStage'], ['drivers', 'ValveAndStarterDrivers'], ['pwrCom', 'PowerSupplyAndComms']],
  operations: ['powerLatchOn()', 'runSelfTests()', 'storeImmoFault()', 'starterOn()', 'starterOff()', 'engineBrakeValvesOn()', 'engineBrakeValvesOff()',
    'applyTorqueLimit()', 'tristateDrivers()', 'writeEeprom()'],
  receptions: ['KL15_On', 'KL15_Off', 'KL50_CrankRequest', 'BlockStartButton', 'BlockStopButton', 'SelfTestPassed', 'ImmoRejected', 'SyncLocked', 'SyncLost',
    'CkpLost', 'CkpRestored', 'CmpLost', 'EngineRunning', 'EngineStopped', 'AfterrunComplete', 'EngineBrakeRequest', 'EngineBrakeRelease',
    'OvertempDetected', 'OvertempCleared', 'BankShortDetected', 'CanTimeout', 'CanRestored', 'ImmoReleaseFrame', 'TorqueRequestFrame',
    'VrToothPulse', 'ElectricalPower'] });
(repo.definitions[ECU] as BlockDefinition).ports.push(x1, ...pinPorts(x1, 'x1', X1), x2, ...pinPorts(x2, 'x2', X2));
// external blocks
block({ name: 'FR_CabECU', pkg: HW, doc: 'Vehicle controller FR (Fahrregelung) - pedal, immobiliser authorisation.',
  ports: [['can', 'CanPort'], ['kl15', 'DigitalInputPort'], ['kl50', 'DigitalInputPort']],
  receptions: ['KL15_On', 'KL15_Off', 'KL50_CrankRequest', 'FaultRecord', 'EngineDataFrame', 'EngineStopped'] });
block({ name: 'Battery24V', pkg: HW, ports: [['kl30', 'SupplyPort'], ['kl31', 'GroundPort']] });
block({ name: 'DiagnosticTester', pkg: HW, ports: [['kLine', 'KLinePort']], receptions: ['FaultRecord'] });
block({ name: 'EngineSensor', pkg: HW, abstract: true, values: [['reference', 'String'], ['kind', 'String']] });
block({ name: 'VRSensor', pkg: HW, general: 'EngineSensor', redefines: [['kind', 'Inductive VR']],
  values: [['coilOhmMin', 'Real', 1050.0], ['coilOhmMax', 'Real', 1350.0], ['teeth', 'Integer']], ports: [['sig', 'VRSignalPort']] });
block({ name: 'NTCSensor', pkg: HW, general: 'EngineSensor', redefines: [['kind', 'NTC 2.5 kOhm @ 20 C']],
  values: [['r20Ohm', 'Real', 2500.0], ['r80Ohm', 'Real', 322.0]], ports: [['sig', 'AnalogSignalPort']] });
block({ name: 'RatiometricPressureSensor', pkg: HW, general: 'EngineSensor', redefines: [['kind', 'Piezoresistive ratiometric 0.5-4.5 V']],
  values: [['pMin', 'Real'], ['pMax', 'Real']], ports: [['supply', '~SupplyPort'], ['sig', 'AnalogSignalPort']] });
block({ name: 'ThermalOilLevelSensor', pkg: HW, general: 'EngineSensor', redefines: [['kind', 'Hot-wire']],
  values: [['ohmMin', 'Real', 18.0], ['ohmMax', 'Real', 26.0]], ports: [['sig', 'AnalogSignalPort']] });
block({ name: 'UnitPump', pkg: HW, doc: 'PLD unit pump (Pumpe-Leitung-Duese) with solenoid valve.',
  values: [['cylinder', 'Integer'], ['coilOhm', 'Real', 0.6], ['coilInductanceH', 'Real', 0.0003]], ports: [['coil', '~SolenoidDrivePort'], ['fuelIn', 'FuelPort']],
  constraints: ['coilInductanceH: TBV - used by the RL simulation'], receptions: ['SoiTrigger', 'EoiTrigger'] });
block({ name: 'ProportionalValve', pkg: HW, values: [['name', 'String'], ['coilOhmMin', 'Real', 30.0], ['coilOhmMax', 'Real', 50.0]], ports: [['drive', '~ValveDrivePort']],
  receptions: ['ElectricalPower'] });
block({ name: 'StarterRelay', pkg: HW, ports: [['coil', '~RelayDrivePort']], receptions: ['KL50_CrankRequest'] });
const SYS = blockId('OM501LA_EngineSystem');
block({ name: 'OM501LA_EngineSystem', pkg: HW, doc: 'System context: the ECU with everything wired to X1 / X2.',
  parts: [['ecu', 'MR_PLD_ECU'], ['fr', 'FR_CabECU'], ['battery', 'Battery24V'], ['tester', 'DiagnosticTester'], ['b15_ckp', 'VRSensor'], ['b16_cmp', 'VRSensor'],
    ['b111_boost', 'RatiometricPressureSensor'], ['b111_iat', 'NTCSensor'], ['b65_ect', 'NTCSensor'], ['b10_fuel', 'NTCSensor'],
    ['b110_oilP', 'RatiometricPressureSensor'], ['b11_oilT', 'NTCSensor'], ['b14_oilLvl', 'ThermalOilLevelSensor'], ['unitPumps', 'UnitPump', '6'],
    ['pv1_decompression', 'ProportionalValve'], ['pv2_exhaustBrake', 'ProportionalValve'], ['pv3_fanClutch', 'ProportionalValve'],
    ['pv4_aux', 'ProportionalValve'], ['starter', 'StarterRelay']],
  constraints: ['b15_ckp.reference = "B15"; b15_ckp.teeth = 36', 'b16_cmp.reference = "B16"; b16_cmp.teeth = 12',
    'b111_boost.reference = "B111-P"; pMin = 0.6; pMax = 3.4', 'b111_iat.reference = "B111-T"', 'b65_ect.reference = "B65"', 'b10_fuel.reference = "B10"',
    'b110_oilP.reference = "B110"; pMin = 0.0; pMax = 5.0', 'b11_oilT.reference = "B11"', 'b14_oilLvl.reference = "B14"',
    'pv1_decompression.name = "PV1 constant throttle"', 'pv2_exhaustBrake.name = "PV2 exhaust brake flap"', 'pv3_fanClutch.name = "PV3 fan clutch"',
    'pv4_aux.name = "PV4 aux / fan stage"', 'firing order 1-4-2-5-3-6, 120 deg'] });
// 07 Parametrics: SensorChainContext; 10 Analysis: SimulationScenario; 12 Variants: EngineConfiguration
block({ name: 'SensorChainContext', pkg: P.par, doc: 'Binds the ECU constants to the sensor transfer functions.',
  values: [['vRef', 'Real', 5.0], ['rPullUp', 'Real', 2490.0], ['rShunt', 'Real', 0.033], ['ectOhm', 'Real'], ['ectVolt', 'Real'], ['boostBar', 'Real'],
    ['boostVolt', 'Real'], ['coilA', 'Real'], ['shuntVolt', 'Real'], ['pMinBoost', 'Real', 0.6], ['pMaxBoost', 'Real', 3.4], ['vMinBoost', 'Real', 0.5],
    ['vMaxBoost', 'Real', 4.5]] });
block({ name: 'SimulationScenario', pkg: P.ana, doc: 'Stimulus + expected final state; executed by mrpld_sim.py and by the ADIA state machine.',
  values: [['keyState', 'KeyState'], ['pedalPct', 'Real'], ['coolantC', 'Real'], ['boostBar', 'Real'], ['immoValid', 'Boolean'], ['ckpValid', 'Boolean'],
    ['cmpValid', 'Boolean'], ['bank1Short', 'Boolean'], ['canValid', 'Boolean'], ['expectedState', 'String']] });
block({ name: 'EngineConfiguration', pkg: P.variants, doc: '«variation» Same ECU hardware, harness decides V6 / V8.',
  parts: [['om501_V6', 'OM501LA_EngineSystem', '0..1'], ['om502_V8', 'OM501LA_EngineSystem', '0..1']],
  constraints: ['om501_V6: X2-46 / X2-37 unused', 'om502_V8: adds unit pumps G (cyl 7, X2-46) and H (cyl 8, X2-37)', 'exactly one variant is selected'] });

for (const [owner, type, role, m] of compositions) {
  repo.relationships[`comp_${owner}_${role}`] = { id: `comp_${owner}_${role}`, kind: 'composition', sourceId: owner, targetId: type, name: role,
    targetRole: role, sourceMultiplicity: one, targetMultiplicity: mult(m), sourceAggregation: 'composite' };
}
for (const [sub, sup] of generalizations) repo.relationships[`gen_${sub}`] = { id: `gen_${sub}`, kind: 'generalization', sourceId: sub, targetId: sup };

// ------------------------------------------------ 07 constraint defs + calc defs
const cblock = (pkg: string, name: string, params: string[], expression: string) => {
  const id = `cb_${name}`;
  repo.definitions[id] = { id, kind: 'constraintBlock', name, namespace: ns(pkg), ownerId: pkg, constraints: [expression],
    parameters: params.map(p => ({ id: `${id}.${p}`, name: p, typeId: 'vt_Real' })) };
};
cblock(P.par, 'NtcDivider', ['rNtc', 'rPullUp', 'vRef', 'vPin'], 'vPin == vRef * rNtc / (rNtc + rPullUp)');
cblock(P.par, 'RatiometricTransfer', ['p', 'pMin', 'pMax', 'vMin', 'vMax', 'v'], 'v == vMin + (p - pMin) * (vMax - vMin) / (pMax - pMin)');
cblock(P.par, 'AdcQuantization', ['v', 'vRef', 'code'], 'code == v / vRef * 1023.0');
cblock(P.par, 'ShuntSense', ['iCoil', 'rShunt', 'vSense'], 'vSense == iCoil * rShunt');
cblock(P.par, 'VrFrequency', ['teethPerRev', 'shaftToCrankRatio', 'rpm', 'fHz'], 'fHz == teethPerRev * rpm * shaftToCrankRatio / 60.0');
cblock(P.par, 'SmokeLimiter', ['pBoostBar', 'qMax'], 'qMax == 55.0 + 65.0 * (pBoostBar - 1.0)');
cblock(P.par, 'FuelDemand', ['pedalPct', 'qReq'], 'qReq == 22.0 + 1.6 * pedalPct');
cblock(P.par, 'SoiMap', ['pedalPct', 'coldAdvance', 'soiDeg'], 'soiDeg == 11.5 + 0.05 * pedalPct + coldAdvance');
cblock(P.par, 'BatteryDivider', ['vBat', 'vAdc'], 'vAdc == vBat * 1.8 / 11.8');
cblock(P.par, 'SolenoidRL', ['vBat', 'rTotal', 'lCoil', 'i', 'diDt'], 'diDt == (vBat - rTotal * i) / lCoil');
cblock(P.ana, 'NtcVoltage', ['tempOhm', 'v'], 'v = 5.00 * tempOhm / (tempOhm + 2490.0)');
cblock(P.ana, 'BoostVoltage', ['pBar', 'v'], 'v = 0.5 + (pBar - 0.6) * 4.0 / (3.4 - 0.6)');
cblock(P.ana, 'OilPressureVoltage', ['pBar', 'v'], 'v = 0.5 + pBar * 0.8');
cblock(P.ana, 'AdcCode', ['v', 'code'], 'code = v / 5.00 * 1023.0');
cblock(P.ana, 'ShuntVoltage', ['i', 'v'], 'v = i * 0.033');
cblock(P.ana, 'InjectedQuantity', ['pedalPct', 'pBoostBar', 'torqueLimitPct', 'q'], 'q = min(22.0 + 1.6 * pedalPct, 55.0 + 65.0 * (pBoostBar - 1.0)) * torqueLimitPct / 100.0');
const constraintProperty = (owner: string, name: string, cb: string) =>
  (repo.definitions[owner] as BlockDefinition).properties.push({ id: `${owner}.${name}`, name, kind: 'constraint', typeId: `cb_${cb}`, multiplicity: one });
const SCC = blockId('SensorChainContext');
constraintProperty(SCC, 'ect', 'NtcDivider');
constraintProperty(SCC, 'boost', 'RatiometricTransfer');
constraintProperty(SCC, 'shunt', 'ShuntSense');
constraintProperty(ECU, 'shuntSense', 'ShuntSense');
constraintProperty(ECU, 'firing', 'VrFrequency');

// ---------------------------------------------------------- gateway state
let state: SysmlGatewayState = createSysmlGatewayState(repo, {}, {}, undefined, stateContext);
const run = (command: SysmlEditorCommand, diagramId?: string) => {
  const result = executeSysmlCommand(state, command, diagramId, stateContext);
  if (!result.committed) throw new Error(`${command.type} rejected: ${JSON.stringify(result.diagnostics.slice(0, 3))}`);
  state = { ...state, ...result } as SysmlGatewayState;
};
const applyPlan = (plan: InteractionCommandPlan | ActivityCommandPlan, what: string) => {
  if (!plan.ok) throw new Error(`${what} refused: ${JSON.stringify(plan.diagnostics)}`);
  run(plan.command);
};
const box = (x: number, y: number, width = 220, height = 120): PresentationCoordinates => ({ x, y, width, height });
const diagram = (id: string, name: string, diagramKind: 'bdd' | 'ibd' | 'requirements' | 'parametric' | 'useCase' | 'activity' | 'sequence' | 'package', ownerId: string, contextElementId?: string) =>
  run({ type: 'createDiagram', diagram: createDiagramDefinition({ id, name, ownerId, diagramKind, contextElementId }) });
const tabs: string[] = [];

// -------------------------------------------------------------------- IBDs
const typeOfPart = (blockIdValue: string, partName: string) => {
  const found = (repo.definitions[blockIdValue] as BlockDefinition).properties.find(p => p.name === partName && p.kind === 'part');
  return found ? { id: found.id, typeId: found.typeId } : undefined;
};
/** `a.b.port` / `a.b.x2.pin_19` / `unitPumps[3].coil` under `context` -> property path + port id. */
const endOf = (context: string, dotted: string) => {
  const segments = dotted.replace(/\[\d+\]/g, '').split('.');
  const path: string[] = [];
  let current = context;
  let i = 0;
  for (; i < segments.length; i += 1) {
    const partFound = typeOfPart(current, segments[i]);
    if (!partFound) break;
    path.push(partFound.id);
    current = partFound.typeId;
  }
  const rest = segments.slice(i);
  if (rest.length === 0) return { path };
  const portId = `${current}.${rest.join('.')}`;
  const def = repo.definitions[current] as BlockDefinition;
  if (!def.ports.some(p => p.id === portId)) throw new Error(`${dotted}: ${def.name} has no port ${rest.join('.')}`);
  return { path, portId };
};
const connectorIds: Record<string, string[]> = {};
const connect = (context: string, diagramId: string, id: string, from: string, to: string, itemFlow?: { conveyed: string; property: string }) => {
  const plan = buildCreatePathIbdConnectorCommand(state.repository, {
    contextId: context, diagramId, connectorId: id, source: endOf(context, from), target: endOf(context, to),
    ...(itemFlow ? { itemFlowId: interfaceIds[itemFlow.conveyed] } : {}),
  });
  if (!plan.ok || !plan.command || !plan.connector) throw new Error(`connector ${id} (${from} -> ${to}) refused: ${JSON.stringify(plan.diagnostics)}`);
  const element = itemFlow ? { ...plan.connector, itemProperty: itemFlow.property } : plan.connector;
  run({ type: 'createAndPresent', diagramId, element, presentation: {} } as SysmlEditorCommand, diagramId);
  (connectorIds[context] ??= []).push(id);
};
const ibd = (diagramId: string, context: string, layout: Record<string, PresentationCoordinates>) => {
  diagram(diagramId, `IBD - ${repo.definitions[context].name}`, 'ibd', context, context);
  const coordinates = Object.fromEntries(Object.entries(layout).map(([name, bounds]) => [`${context}.${name}`, bounds]));
  run({ type: 'addToDiagram', diagramId, elementIds: Object.keys(coordinates), coordinates }, diagramId);
  tabs.push(diagramId);
};
const grid = (names: string[], columns: number, x0 = 220, y0 = 100, dx = 300, dy = 200, w = 240, h = 140) =>
  Object.fromEntries(names.map((name, i) => [name, box(x0 + (i % columns) * dx, y0 + Math.floor(i / columns) * dy, w, h)]));

// IBD of OM501LA_EngineSystem (package InternalStructure, part engineSystem)
const sysParts = (repo.definitions[SYS] as BlockDefinition).properties.filter(p => p.kind === 'part').map(p => p.name).filter(n => n !== 'ecu');
ibd('ibd_engine_system', SYS, { ...grid(sysParts.slice(0, 9), 1, 120, 60, 0, 150, 260, 120), ...grid(sysParts.slice(9), 1, 1500, 60, 0, 150, 260, 120), ecu: box(560, 60, 700, 1400) });
const engineBody = between(SOURCE, 'part engineSystem : OM501LA_EngineSystem {', '\n        }\n');
const canLink = /interface : CanBusLink connect nodeA ::> (\S+) to nodeB ::> (\S+);/.exec(engineBody)!;
const canFlows = [...engineBody.matchAll(/flow of (\w+) from \S+ to \S+;/g)].map(m => m[1]);
connect(SYS, 'ibd_engine_system', 'c_sys_canBusLink', canLink[1], canLink[2], { conveyed: 'CanPort', property: `canFrame : ${canFlows.join(', ')}` });
for (const [, from, to, comment] of engineBody.matchAll(/^\s*connect (\S+) to (\S+);(?:\s*\/\/\s*(.*))?$/gm)) {
  const pump = /unitPumps\[(\d)\]/.exec(from);
  const id = `c_sys_${pump ? `up${pump[1]}` : from.split('.')[0]}_${to.split('.').pop()}`;
  connect(SYS, 'ibd_engine_system', id, from, to, pump ? { conveyed: 'SolenoidDrivePort', property: `current : cyl ${pump[1]} (${comment ?? ''})` } : undefined);
}

// IBD of MR_PLD_ECU (package InternalStructure, part mrPld): every connect of the source is a connector of MR_PLD_ECU
// with nested ends; the subsystem IBDs show the parts each subsystem is made of.
const ecuBody = between(SOURCE, 'part mrPld : MR_PLD_ECU {', '\n        }\n');
const SUBSYSTEM: Record<string, string> = { core: 'ComputeCore', afe: 'SensorAFE', injStage: 'InjectionPowerStage', drivers: 'ValveAndStarterDrivers', pwrCom: 'PowerSupplyAndComms' };
ibd('ibd_ecu', ECU, { pwrCom: box(160, 80, 320, 260), core: box(640, 80, 360, 300), afe: box(160, 460, 320, 260), injStage: box(640, 460, 360, 300), drivers: box(1120, 460, 280, 200) });
ibd('ibd_compute_core', blockId('ComputeCore'), grid(['mcu', 'flash', 'eeprom', 'coProcessor', 'crystals'], 3));
ibd('ibd_sensor_afe', blockId('SensorAFE'), grid(['vrComparators', 'buffers', 'ntcNetworks', 'baro'], 2));
ibd('ibd_injection_stage', blockId('InjectionPowerStage'), grid(['gateCpld', 'hsBank1', 'hsBank2', 'lowSide', 'shuntBank1', 'shuntBank2', 'currentComparators', 'freewheel'], 4));
ibd('ibd_drivers', blockId('ValveAndStarterDrivers'), grid(['hsValveSupply', 'hsStarter', 'hsAux'], 3));
ibd('ibd_power_comms', blockId('PowerSupplyAndComms'), grid(['regulator', 'choke', 'canPhy', 'kLinePhy'], 2));
const soiFlow = /flow of (\w+) from (\S+)\.(\w+) to (\S+)\.(\w+);/.exec(ecuBody)!; // SoiTrigger on soiOut -> soiIn
let n = 0;
for (const [, from, to] of ecuBody.matchAll(/^\s*connect (\S+) to (\S+);/gm)) {
  n += 1;
  const flow = from === soiFlow[2] && to === soiFlow[4] ? { conveyed: 'GateDrivePort', property: `${soiFlow[3]} : ${soiFlow[1]}` } : undefined;
  connect(ECU, 'ibd_ecu', `c_ecu_${n}`, from, to, flow);
}
// X1 / X2 pins delegated to the starter and valve drivers (pin functions of the source pin tables)
for (const [pin, target] of [['x2.pin_18', 'starterOut'], ['x1.pin_12', 'starterOut'], ['x2.pin_51', 'pvOut'], ['x2.pin_50', 'pvOut'],
  ['x2.pin_41', 'pvOut'], ['x2.pin_43', 'pvOut'], ['x1.pin_14', 'pvOut'], ['x1.pin_16', 'pvOut']] as const) {
  connect(ECU, 'ibd_ecu', `c_ecu_${pin.replace('.', '_')}`, pin, `drivers.${target}`);
}

// -------------------------------------------------------------------- BDDs
const bdd = (id: string, name: string, pkg: string, rows: string[][], colW = 380, rowGap = 110) => {
  diagram(id, name, 'bdd', pkg);
  const coordinates: Record<string, PresentationCoordinates> = {};
  let y = 40;
  for (const row of rows) {
    const heights = row.map(def => {
      const d = repo.definitions[def] as BlockDefinition | undefined;
      // compartments grow with values / parts / operations, the border with the ports (MR_PLD_ECU carries 73)
      return d?.kind === 'block' ? Math.max(120, 80 + 14 * (d.properties.length + d.operations.length + d.constraints.length), 40 + 16 * d.ports.length) : 110;
    });
    row.forEach((def, i) => { coordinates[def] = { x: 40 + i * colW, y, width: colW - 40, height: heights[i] }; });
    y += Math.max(...heights) + rowGap;
  }
  run({ type: 'addToDiagram', diagramId: id, elementIds: Object.keys(coordinates), coordinates }, id);
  tabs.push(id);
};
const B = (...names: string[]) => names.map(blockId);
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
bdd('bdd_01_system_context', 'BDD 01 - OM 501 LA engine system context', HW, [B('OM501LA_EngineSystem', 'FR_CabECU', 'Battery24V', 'DiagnosticTester', 'StarterRelay'),
  B('EngineSensor', 'UnitPump', 'ProportionalValve'), B('VRSensor', 'NTCSensor', 'RatiometricPressureSensor', 'ThermalOilLevelSensor'), B('MR_PLD_ECU')]);
bdd('bdd_02_ecu_architecture', 'BDD 02 - MR_PLD_ECU architecture', HW, [B('MR_PLD_ECU'), B('ComputeCore', 'SensorAFE', 'InjectionPowerStage', 'ValveAndStarterDrivers', 'PowerSupplyAndComms')]);
bdd('bdd_03_compute_core', 'BDD 03 - Compute core', HW, [B('ComputeCore'), B('SAK_C167CS_LM', 'TEMIC_845AW', 'AM29F400BB', 'M93C86', 'Crystal4MHz')]);
bdd('bdd_04_sensor_afe', 'BDD 04 - Sensor analogue front-end', HW, [B('SensorAFE'), B('LM2903D', 'LM2904D', 'NtcPullUpNetwork', 'OnboardBaroSensor')]);
bdd('bdd_05_injection_stage', 'BDD 05 - Injection power stage', HW, [B('InjectionPowerStage'), B('PLD_C1_1', 'BUZ102SL', 'SUD25N06_45L', 'DaleShunt', 'LM2901D', 'FreewheelNetwork')]);
bdd('bdd_06_drivers_power_comms', 'BDD 06 - Drivers, power supply and communication', HW, [B('ValveAndStarterDrivers', 'PowerSupplyAndComms'), B('BUZ102SL', 'TLE4275', 'EmiChoke', 'CanTransceiver', 'L9637D')]);
const components = generalizations.filter(([, sup]) => sup === blockId(EC)).map(([sub]) => sub);
bdd('bdd_07_component_taxonomy', 'BDD 07 - Electronic component taxonomy', HW, [[blockId(EC)], ...chunk(components, 6)]);
bdd('bdd_08_engine_sensors', 'BDD 08 - Engine sensor taxonomy', HW, [B('EngineSensor'), B('VRSensor', 'NTCSensor', 'RatiometricPressureSensor', 'ThermalOilLevelSensor')]);
bdd('bdd_09_signals', 'BDD 09 - Signals (item defs) and enumerations', P.signals, [...chunk(SIGNALS.map(s => `sig_${s}`), 7), ENUMS.map(([, name]) => `enum_${name}`)], 230, 40);
bdd('bdd_10_interfaces', 'BDD 10 - Port and interface definitions', P.ifaces, chunk(Object.values(interfaceIds), 6), 300, 60);
bdd('bdd_11_types', 'BDD 11 - Value types and units', P.types, [VT.map(([id]) => id).concat('vt_ECU_Label'), UNITS.map(([id]) => id).concat(QK.map(([id]) => id))], 240, 50);
bdd('bdd_12_constraints', 'BDD 12 - Constraint blocks and calculations', P.par, [B('SensorChainContext'), ...chunk(Object.keys(repo.definitions).filter(id => id.startsWith('cb_')), 6)], 300, 50);
bdd('bdd_13_analysis_variants', 'BDD 13 - Analysis context and variants', P.ana, [B('EngineConfiguration', 'SimulationScenario'), B('OM501LA_EngineSystem')]);

// --------------------------------------------------------------- parametric
const bind = (context: string, id: string, source: { propertyId: string; parameterId?: string }, target: { propertyId: string; parameterId?: string }) => {
  const plan = buildCreateParametricBindingCommand(state.repository, { contextId: context, source, target, connectorId: id });
  if (!plan.ok || !plan.command) throw new Error(`binding ${id} refused: ${JSON.stringify(plan.diagnostics)}`);
  run(plan.command);
};
const pv = (owner: string, name: string) => ({ propertyId: `${owner}.${name}` });
const pc = (owner: string, cp: string, cb: string, param: string) => ({ propertyId: `${owner}.${cp}`, parameterId: `cb_${cb}.${param}` });
for (const [v, p] of [['ectOhm', 'rNtc'], ['rPullUp', 'rPullUp'], ['vRef', 'vRef'], ['ectVolt', 'vPin']]) bind(SCC, `b_ect_${p}`, pv(SCC, v), pc(SCC, 'ect', 'NtcDivider', p));
for (const [v, p] of [['boostBar', 'p'], ['pMinBoost', 'pMin'], ['pMaxBoost', 'pMax'], ['vMinBoost', 'vMin'], ['vMaxBoost', 'vMax'], ['boostVolt', 'v']]) bind(SCC, `b_boost_${p}`, pv(SCC, v), pc(SCC, 'boost', 'RatiometricTransfer', p));
for (const [v, p] of [['coilA', 'iCoil'], ['rShunt', 'rShunt'], ['shuntVolt', 'vSense']]) bind(SCC, `b_shunt_${p}`, pv(SCC, v), pc(SCC, 'shunt', 'ShuntSense', p));
bind(ECU, 'b_ecu_shunt_i', pv(ECU, 'iPeakA'), pc(ECU, 'shuntSense', 'ShuntSense', 'iCoil'));
bind(ECU, 'b_ecu_shunt_r', pv(ECU, 'rShuntOhm'), pc(ECU, 'shuntSense', 'ShuntSense', 'rShunt'));
for (const [context, id, name, props] of [
  [SCC, 'par_sensor_chain', 'PAR - SensorChainContext', ['ect', 'boost', 'shunt', 'vRef', 'rPullUp', 'rShunt', 'ectOhm', 'ectVolt', 'boostBar', 'boostVolt', 'coilA', 'shuntVolt', 'pMinBoost', 'pMaxBoost', 'vMinBoost', 'vMaxBoost']],
  [ECU, 'par_ecu_constants', 'PAR - MR_PLD_ECU constants', ['shuntSense', 'firing', 'iPeakA', 'rShuntOhm']],
] as const) {
  diagram(id, name, 'parametric', context, context);
  const coordinates = Object.fromEntries(props.map((p, i) => [`${context}.${p}`, box(60 + (i % 4) * 280, 60 + Math.floor(i / 4) * 170, 240, 130)]));
  run({ type: 'addToDiagram', diagramId: id, elementIds: Object.keys(coordinates), coordinates }, id);
  // no workspace tab: the canvas has no parametric mode; the diagrams live in the model tree and the Report renders them
}

// ------------------------------------------------------------- requirements
const reqId = (rid: string) => `req_${rid.replace(/[^A-Za-z0-9]/g, '_')}`;
const reqBody = between(SOURCE, 'package Requirements {', 'package HardwareStructure {');
const TOP = [...reqBody.matchAll(/requirement def <'([^']+)'> (\w+) \{\s*doc \/\*([\s\S]*?)\*\/([\s\S]*?)\n        \}/g)].map(m => ({
  id: m[1], name: m[2], text: docOf(m[3]),
  constraints: [...m[4].matchAll(/(assume|require) constraint \{ (.*?) \}/g)].map(c => `${c[1]}: ${c[2]}`),
}));
if (TOP.length !== 12) throw new Error(`expected 12 requirement defs, found ${TOP.length}`);
const requirement = (rid: string, name: string, text: string, owner = P.reqs, extra: Record<string, unknown> = {}) => {
  const element = { ...createRequirement({ id: reqId(rid), name, ownerId: owner, text }), requirementId: rid, namespace: ns(owner), status: 'approved' as const, ...extra };
  run({ type: 'createElement', element });
};
const relate = (kind: 'requirementContainment' | 'deriveReqt' | 'satisfy' | 'verify' | 'refine' | 'trace' | 'allocation', sourceId: string, targetId: string) =>
  run({ type: 'createElement', element: { id: `${kind}_${sourceId}_${targetId}`, kind, sourceId, targetId } });
requirement('REQ-SPEC-00', 'mrPldSpecification', 'Top-level specification grouping all ECU requirements (subject: MR_PLD_ECU).', P.reqs, { priority: 'high' });
for (const r of TOP) {
  requirement(r.id, r.name, `${r.text}${r.constraints.length ? ` [${r.constraints.join('; ')}]` : ''}`, P.reqs, { source: 'MR_PLD_A5414465340.sysml', risk: 'high', priority: 'high' });
  relate('requirementContainment', reqId('REQ-SPEC-00'), reqId(r.id));
  for (const blk of TOP_SATISFIED_BY[r.id]) relate('satisfy', blk, reqId(r.id));
}
for (const r of SUPPLEMENTARY) {
  requirement(r.id, r.name, r.text, P.reqs, { source: 'MR_PLD_A5414465340.sysml part / state docs', priority: 'medium' });
  relate('requirementContainment', reqId('REQ-SPEC-00'), reqId(r.id));
  for (const blk of r.satisfiedBy) relate('satisfy', blk, reqId(r.id));
}
for (const r of DERIVED) {
  requirement(r.id, r.name, r.text, P.reqs, { source: 'MR_PLD_A5414465340.sysml / mrpld_data.py', priority: 'medium', ...(r.text.includes('TBV') ? { risk: 'medium' } : {}) });
  relate('deriveReqt', reqId(r.id), reqId(r.from));
  for (const blk of r.satisfiedBy) relate('satisfy', blk, reqId(r.id));
}
for (const [stateId, rid] of STATE_SATISFIES) relate('satisfy', stateId, reqId(rid));
relate('refine', SCC, reqId('REQ-DIAG-07'));

// one requirements diagram per block: the block, every requirement it satisfies and their source requirements
const satisfiedBy = (blk: string) => Object.values(state.repository.relationships).filter(r => r.kind === 'satisfy' && r.sourceId === blk).map(r => r.targetId);
const derivedFrom = (req: string) => Object.values(state.repository.relationships).filter(r => r.kind === 'deriveReqt' && r.sourceId === req).map(r => r.targetId);
const blockIds = Object.values(state.repository.definitions).filter(d => d.kind === 'block').map(d => d.id);
const requirementDiagrams: string[] = [];
diagram('req_00_specification', 'REQ 00 - MR-PLD specification', 'requirements', P.reqs);
{
  const top = [reqId('REQ-SPEC-00'), ...TOP.map(r => reqId(r.id)), ...SUPPLEMENTARY.map(r => reqId(r.id))];
  const coordinates = Object.fromEntries(top.map((id, i) => [id, i === 0 ? box(820, 40, 300, 150) : box(40 + ((i - 1) % 6) * 330, 300 + Math.floor((i - 1) / 6) * 230, 300, 170)]));
  run({ type: 'addToDiagram', diagramId: 'req_00_specification', elementIds: Object.keys(coordinates), coordinates }, 'req_00_specification');
  tabs.push('req_00_specification');
}
for (const blk of blockIds) {
  const reqs = satisfiedBy(blk);
  if (reqs.length === 0) throw new Error(`block ${blk} satisfies no requirement`);
  const parents = [...new Set(reqs.flatMap(derivedFrom))].filter(id => !reqs.includes(id));
  const id = `req_blk_${repo.definitions[blk].name}`;
  diagram(id, `REQ - ${repo.definitions[blk].name}`, 'requirements', P.reqs);
  const coordinates: Record<string, PresentationCoordinates> = { [blk]: box(60, 60, 380, 200) };
  reqs.forEach((r, i) => { coordinates[r] = box(620 + (i % 3) * 340, 60 + Math.floor(i / 3) * 240, 310, 190); });
  const rows = Math.ceil(reqs.length / 3);
  parents.forEach((r, i) => { coordinates[r] = box(620 + (i % 3) * 340, 60 + (rows + Math.floor(i / 3)) * 240 + 60, 310, 190); });
  run({ type: 'addToDiagram', diagramId: id, elementIds: Object.keys(coordinates), coordinates }, id);
  requirementDiagrams.push(id);
}

// ---------------------------------------------------------------- use cases
const UC = P.uc;
const actors: Record<string, string> = {};
for (const [key, name] of [['driver', 'Driver'], ['fr', 'FR_CabECU'], ['tester', 'DiagnosticTester'], ['battery', 'Battery24V']]) {
  actors[key] = `actor_${name}`;
  run({ type: 'createElement', element: { ...createActor({ id: actors[key], name, ownerId: UC }), namespace: ns(UC) } });
}
const SUBJECT = 'subject_MR_PLD_ECU';
run({ type: 'createElement', element: { ...createSubject({ id: SUBJECT, name: 'MR_PLD_ECU', ownerId: UC }), namespace: ns(UC), realizedByBlockId: ECU, representedBlockId: ECU } });
const USE_CASES: Array<[string, string, string, string[], string[]]> = [
  // id, name, description, actors, requirements it refines
  ['uc01', 'Power up and self-test', 'KL.15 on: power latch, 5 V on, flash / EEPROM checksum, ADC plausibility, B14 oil-level pulse.', ['driver', 'battery'], ['REQ-PWR-01', 'REQ-ADC-12']],
  ['uc02', 'Authorise drive (immobiliser)', 'FR sends the drive-authorisation code over IES-CAN; the MR compares it with the 93C86 pairing data.', ['fr'], ['REQ-SEC-06']],
  ['uc03', 'Crank and start engine', 'KL.50 crank request: starter X2-18 on, synchronisation, start fuel, ramp to idle.', ['driver', 'fr'], ['REQ-SEC-06', 'REQ-SYNC-02']],
  ['uc04', 'Start / stop from engine block', 'Engine-block start (X2-25) and stop (X2-35) buttons bridged to X2-30.', ['driver'], ['REQ-SEC-06']],
  ['uc05', 'Synchronise crank and cam position', 'CAPCOM locks on the CKP reference slot (36 + 1) and the CMP sync tooth (12 + 1).', [], ['REQ-SYNC-02']],
  ['uc06', 'Inject fuel (peak & hold)', 'Per cylinder in firing order 1-4-2-5-3-6: pull-in 16 A, BIP, hold 8 A, spill.', [], ['REQ-INJ-03', 'REQ-FIRE-10']],
  ['uc07', 'Limit smoke', 'Injected quantity limited by the boost map, ceiling 185 mg/stroke.', [], ['REQ-SAF-05']],
  ['uc08', 'Apply engine brake', 'Pedal 0 % and request from FR: PV1 + PV2 on, injection cut.', ['driver', 'fr'], ['REQ-BRK-13']],
  ['uc09', 'Protect engine thermally', 'PV3 fan clutch from 92 C, warning and derate from 103 C, hard derate from 110 C.', [], ['REQ-THM-08']],
  ['uc10', 'Run limp-home', 'CKP or CMP lost, bank short, CAN timeout or coolant >= 103 C: torque limited, <= 1800 rpm on CMP only.', [], ['REQ-LIMP-09', 'REQ-COM-11']],
  ['uc11', 'Shut down on total sync loss', 'CKP and CMP lost: MOSFET matrix tristated, injection stopped.', [], ['REQ-SYNC-02']],
  ['uc12', 'Protect solenoid circuits', 'Overcurrent > 24 A or open coil < 4 A: cylinder disabled, DTC 5Nxx.', [], ['REQ-INJ-04']],
  ['uc13', 'Diagnose sensors and store faults', 'Sensor windows 0.25..4.75 V / 0.18..4.82 V, substitute values, MR code + J1939 SPN / FMI.', [], ['REQ-DIAG-07']],
  ['uc14', 'Read faults and flash over K-line', 'Workshop tester on X1-13, ISO 14230 (KWP2000), BSL flashing.', ['tester'], ['REQ-DIAG-07', 'REQ-COM-11']],
  ['uc15', 'Exchange data over IES-CAN', 'Torque request and engine data frames with FR at 250 kbit/s.', ['fr'], ['REQ-COM-11']],
  ['uc16', 'Stop engine and after-run', 'KL.15 off: store DTCs / adaptation to EEPROM, release power latch.', ['driver'], ['REQ-AFT-18']],
];
for (const [id, name, description] of USE_CASES) {
  run({ type: 'createElement', element: { ...createUseCase({ id, name, ownerId: UC }), namespace: ns(UC), subjectId: SUBJECT, description } });
}
const ucRel = (kind: 'useCaseAssociation' | 'include' | 'extend' | 'useCaseGeneralization' | 'useCaseRefine', sourceId: string, targetId: string, extra: { newExtensionPointName?: string; extensionPointId?: string; condition?: string } = {}) => {
  const plan = buildCreateUseCaseRelationshipCommand(state.repository, { kind, sourceId, targetId, relationshipId: `${kind}_${sourceId}_${targetId}`, ...extra });
  if (!plan.ok) throw new Error(`${kind} ${sourceId} -> ${targetId} refused: ${JSON.stringify(plan.diagnostics)}`);
  run(plan.command);
};
for (const [id, , , who, reqs] of USE_CASES) {
  for (const actor of who) ucRel('useCaseAssociation', actors[actor], id);
  for (const r of reqs) ucRel('useCaseRefine', id, reqId(r));
}
ucRel('include', 'uc03', 'uc02');
ucRel('include', 'uc03', 'uc05');
ucRel('include', 'uc03', 'uc01');
ucRel('include', 'uc06', 'uc07');
ucRel('include', 'uc06', 'uc05');
ucRel('include', 'uc13', 'uc15');
ucRel('useCaseGeneralization', 'uc04', 'uc03');
ucRel('extend', 'uc10', 'uc06', { newExtensionPointName: 'sensor, CAN or thermal fault', extensionPointId: undefined, condition: '[CKP or CMP lost, bank short, CAN timeout, coolant >= 103 C]' });
ucRel('extend', 'uc11', 'uc10', { newExtensionPointName: 'total sync loss', condition: '[CKP and CMP lost]' });
ucRel('extend', 'uc12', 'uc06', { newExtensionPointName: 'coil fault', condition: '[i > 24 A or i_peak < 4 A]' });
ucRel('extend', 'uc08', 'uc06', { newExtensionPointName: 'engine-brake request', condition: '[pedal 0 % and request from FR]' });
ucRel('extend', 'uc09', 'uc06', { newExtensionPointName: 'coolant hot', condition: '[coolant >= 92 C]' });
diagram('uc_01_mr_pld', 'UC 01 - MR-PLD ECU use cases', 'useCase', UC);
{
  const coordinates: Record<string, PresentationCoordinates> = {
    [actors.driver]: box(40, 120, 120, 160), [actors.battery]: box(40, 520, 120, 160),
    [actors.fr]: box(1500, 120, 120, 160), [actors.tester]: box(1500, 620, 120, 160), [SUBJECT]: box(220, 40, 1220, 1060),
  };
  USE_CASES.forEach(([id], i) => { coordinates[id] = box(260 + (i % 4) * 290, 100 + Math.floor(i / 4) * 240, 250, 110); });
  run({ type: 'addToDiagram', diagramId: 'uc_01_mr_pld', elementIds: Object.keys(coordinates), coordinates }, 'uc_01_mr_pld');
  tabs.unshift('uc_01_mr_pld');
}

// --------------------------------------------------------------- activities
interface ActStep { id: string; name: string; lane: string }
const activity = (id: string, name: string, lanes: Array<[string, string, string]>, steps: ActStep[], useCaseId: string) => {
  run({ type: 'createElement', element: { ...createActivity({ id, name, ownerId: P.beh }), namespace: ns(P.beh) } });
  const diagramId = `ad_${id.slice(4)}`;
  diagram(diagramId, `ACT - ${name}`, 'activity', id, id);
  for (const [laneId, laneName, represents] of lanes) applyPlan(buildAddPartitionCommand(state.repository, { activityId: id, id: laneId, name: laneName, representsId: represents }), `lane ${laneId}`);
  const laneIndex = new Map(lanes.map(([laneId], i) => [laneId, i]));
  const at = (lane: string, row: number) => ({ x: 80 + (laneIndex.get(lane) ?? 0) * 300, y: 80 + row * 130 });
  applyPlan(buildAddActivityNodeCommand(state.repository, { activityId: id, id: `${id}_start`, kind: 'initial', name: 'start', diagramId, position: at(steps[0].lane, 0), partitionId: steps[0].lane }), 'initial');
  steps.forEach((step, i) => applyPlan(buildAddActivityNodeCommand(state.repository, { activityId: id, id: step.id, kind: 'action', name: step.name, diagramId, position: at(step.lane, i + 1), partitionId: step.lane }), step.id));
  const last = steps[steps.length - 1];
  applyPlan(buildAddActivityNodeCommand(state.repository, { activityId: id, id: `${id}_done`, kind: 'activityFinal', name: 'done', diagramId, position: at(last.lane, steps.length + 1), partitionId: last.lane }), 'final');
  const order = [`${id}_start`, ...steps.map(s => s.id), `${id}_done`];
  for (let i = 0; i + 1 < order.length; i += 1) applyPlan(buildAddActivityEdgeCommand(state.repository, { activityId: id, id: `${id}_f${i + 1}`, sourceId: order[i], targetId: order[i + 1], kind: 'controlFlow' }), `flow ${i}`);
  // «allocate»: each action to the block of its swimlane, the activity to MR_PLD_ECU
  for (const step of steps) run(buildCreateAllocationCommand(state.repository, step.id, lanes.find(([laneId]) => laneId === step.lane)![2]));
  run(buildCreateAllocationCommand(state.repository, id, ECU));
  run({ type: 'updateElement', elementId: useCaseId, patch: { behaviorArtifactIds: [...(state.repository.useCases[useCaseId].behaviorArtifactIds ?? []), id] } });
  tabs.push(diagramId);
};
activity('act_InjectionEvent', 'InjectionEvent', [
  ['lane_ie_mcu', 'mcu : SAK_C167CS_LM', blockId('SAK_C167CS_LM')], ['lane_ie_cpld', 'gateCpld : PLD_C1_1', blockId('PLD_C1_1')],
  ['lane_ie_stage', 'injStage : InjectionPowerStage', blockId('InjectionPowerStage')],
], [
  { id: 'ie_computeQuantity', name: 'computeQuantity', lane: 'lane_ie_mcu' }, { id: 'ie_computeSoi', name: 'computeSoi', lane: 'lane_ie_mcu' },
  { id: 'ie_armCapcom', name: 'armCapcom', lane: 'lane_ie_mcu' }, { id: 'ie_pullIn', name: 'pullIn', lane: 'lane_ie_stage' },
  { id: 'ie_detectBip', name: 'detectBip', lane: 'lane_ie_cpld' }, { id: 'ie_holdChop', name: 'holdChop', lane: 'lane_ie_cpld' },
  { id: 'ie_release', name: 'release', lane: 'lane_ie_stage' },
], 'uc06');
activity('act_EngineStartProcedure', 'EngineStartProcedure', [
  ['lane_es_pwr', 'pwrCom : PowerSupplyAndComms', blockId('PowerSupplyAndComms')], ['lane_es_core', 'core : ComputeCore', blockId('ComputeCore')],
  ['lane_es_drv', 'drivers : ValveAndStarterDrivers', blockId('ValveAndStarterDrivers')], ['lane_es_afe', 'afe : SensorAFE', blockId('SensorAFE')],
  ['lane_es_inj', 'injStage : InjectionPowerStage', blockId('InjectionPowerStage')],
], [
  { id: 'es_wakeUp', name: 'wakeUp', lane: 'lane_es_pwr' }, { id: 'es_selfTest', name: 'selfTest', lane: 'lane_es_core' },
  { id: 'es_authorise', name: 'authorise', lane: 'lane_es_core' }, { id: 'es_engageStarter', name: 'engageStarter', lane: 'lane_es_drv' },
  { id: 'es_synchronise', name: 'synchronise', lane: 'lane_es_afe' }, { id: 'es_startFuel', name: 'startFuel', lane: 'lane_es_inj' },
  { id: 'es_rampToIdle', name: 'rampToIdle', lane: 'lane_es_core' },
], 'uc03');

// -------------------------------------------------------- sequence diagrams
const sysPath = (...names: string[]) => {
  const path: string[] = [];
  let current = SYS;
  for (const name of names) { const found = typeOfPart(current, name)!; path.push(found.id); current = found.typeId; }
  return path.join('/');
};
const ecuPath = (...names: string[]) => {
  const path: string[] = [];
  let current = ECU;
  for (const name of names) { const found = typeOfPart(current, name)!; path.push(found.id); current = found.typeId; }
  return path.join('/');
};
const ll = (interactionId: string, local: string) => `${interactionId}__${local}`;
interface Msg { id: string; from: string; to: string; signal: string; connector?: string; args?: string; inState?: string }
const interaction = (id: string, name: string, owner: string, lifelines: Array<[string, string, string]>, messages: Msg[], extra: (iid: string) => void = () => {}, useCaseId?: string) => {
  run({ type: 'createElement', element: { ...createInteraction({ id, name, ownerId: owner }), namespace: ns(P.sd) } });
  // lifeline ids are global: <interaction>__<local id>
  for (const [llId, llName, represents] of lifelines) applyPlan(buildAddLifelineCommand(state.repository, { interactionId: id, id: ll(id, llId), name: llName, representsId: represents }), `lifeline ${llId}`);
  const ecuLifeline = lifelines.find(([, llName]) => llName === 'ecu')?.[0];
  for (const m of messages) {
    applyPlan(buildAddInteractionMessageCommand(state.repository, {
      interactionId: id, id: m.id, sort: 'asynchSignal', sourceLifelineId: ll(id, m.from), targetLifelineId: ll(id, m.to), name: m.signal, signatureId: sig(m.signal),
      ...(m.connector ? { connectorId: m.connector } : {}), ...(m.args ?? ITEM_ATTRIBUTES[m.signal] ? { arguments: m.args ?? ITEM_ATTRIBUTES[m.signal] } : {}),
    }), `message ${m.id}`);
    if (m.inState && ecuLifeline) applyPlan(buildAddStateInvariantCommand(state.repository, { interactionId: id, id: `inv_${m.id}`, lifelineId: ll(id, ecuLifeline), stateId: m.inState, afterMessageId: m.id }), `invariant ${m.id}`);
  }
  extra(id);
  const sd = `sd_${id.slice(4)}`;
  diagram(sd, `SD - ${name}`, 'sequence', id, id);
  tabs.push(sd);
  if (useCaseId) run({ type: 'updateElement', elementId: useCaseId, patch: { behaviorArtifactIds: [...(state.repository.useCases[useCaseId].behaviorArtifactIds ?? []), id] } });
};
const firstInvariant = (iid: string, lifeline: string, stateId: string) =>
  applyPlan(buildAddStateInvariantCommand(state.repository, { interactionId: iid, id: `inv_${iid}_start`, lifelineId: ll(iid, lifeline), stateId, afterMessageId: null }), 'initial invariant');
const C = (id: string) => { if (!state.repository.connectors[id]) throw new Error(`no connector ${id}`); return id; };

// ECU-internal collaboration (referenced from the system-level sequence diagrams)
const LL_INT: Array<[string, string, string]> = [
  ['li_canPhy', 'canPhy', ecuPath('pwrCom', 'canPhy')], ['li_vr', 'vrComparators', ecuPath('afe', 'vrComparators')], ['li_mcu', 'mcu', ecuPath('core', 'mcu')],
  ['li_eeprom', 'eeprom', ecuPath('core', 'eeprom')], ['li_cpld', 'gateCpld', ecuPath('injStage', 'gateCpld')], ['li_lowSide', 'lowSide', ecuPath('injStage', 'lowSide')],
  ['li_cmp', 'currentComparators', ecuPath('injStage', 'currentComparators')],
];
const ecuConnector = (from: string, to: string) => {
  const hit = Object.values(state.repository.connectors).find(c => [ECU, ...Object.values(SUBSYSTEM).map(blockId)].includes(c.ownerId)
    && ((c.sourcePortId.endsWith(from) && c.targetPortId.endsWith(to)) || (c.sourcePortId.endsWith(to) && c.targetPortId.endsWith(from))));
  if (!hit) throw new Error(`no ECU connector ${from} - ${to}`);
  return hit.id;
};
const cMcuEeprom = ecuConnector('SAK_C167CS_LM.microwire', 'M93C86.microwire');
const cCanMcu = ecuConnector('SAK_C167CS_LM.can', 'CanTransceiver.mcu');
const cVrMcu = ecuConnector('LM2903D.output', 'SAK_C167CS_LM.capcomIn');
const cSoi = ecuConnector('SAK_C167CS_LM.soiOut', 'PLD_C1_1.soiIn');
const cGateLs = ecuConnector('PLD_C1_1.gateOut', 'SUD25N06_45L.gate');
const cTrip = ecuConnector('LM2901D.trip', 'PLD_C1_1.currentTripIn');
interaction('int_ECU_Start_Injection', 'ECU internal - authorisation, sync and first peak & hold injection', ECU, LL_INT, [
  { id: 'e01_eepromRead', from: 'li_mcu', to: 'li_eeprom', signal: 'FaultRecord', connector: cMcuEeprom, args: 'read pairing data' },
  { id: 'e02_eepromData', from: 'li_eeprom', to: 'li_mcu', signal: 'FaultRecord', connector: cMcuEeprom, args: 'pairing data, stored DTCs' },
  { id: 'e03_immo', from: 'li_canPhy', to: 'li_mcu', signal: 'ImmoReleaseFrame', connector: cCanMcu },
  { id: 'e04_ckp', from: 'li_vr', to: 'li_mcu', signal: 'VrToothPulse', connector: cVrMcu, args: 'CKP tooth (36 + 1)' },
  { id: 'e05_cmp', from: 'li_vr', to: 'li_mcu', signal: 'VrToothPulse', connector: cVrMcu, args: 'CMP tooth (12 + 1)' },
  { id: 'e06_torque', from: 'li_canPhy', to: 'li_mcu', signal: 'TorqueRequestFrame', connector: cCanMcu },
  { id: 'e07_soi', from: 'li_mcu', to: 'li_cpld', signal: 'SoiTrigger', connector: cSoi },
  { id: 'e08_gates', from: 'li_cpld', to: 'li_lowSide', signal: 'SoiTrigger', connector: cGateLs, args: 'bank high-side + cylinder low-side on' },
  { id: 'e09_peak', from: 'li_cmp', to: 'li_cpld', signal: 'PeakCurrentReached', connector: cTrip, args: '16 A = 528 mV' },
  { id: 'e10_hold', from: 'li_cpld', to: 'li_lowSide', signal: 'PeakCurrentReached', connector: cGateLs, args: 'hold chop 8 A' },
  { id: 'e11_bip', from: 'li_cpld', to: 'li_mcu', signal: 'BipDetected', connector: cSoi },
  { id: 'e12_eoi', from: 'li_mcu', to: 'li_cpld', signal: 'EoiTrigger', connector: cSoi },
], iid => {
  applyPlan(buildAddFragmentCommand(state.repository, { interactionId: iid, id: 'frag_inj_loop', operator: 'loop', coveredLifelineIds: [ll(iid, 'li_mcu'), ll(iid, 'li_cpld'), ll(iid, 'li_lowSide'), ll(iid, 'li_cmp')], messageIds: ['e07_soi', 'e08_gates', 'e09_peak', 'e10_hold', 'e11_bip', 'e12_eoi'], guard: '[each cylinder 1-4-2-5-3-6, every 120 deg]' } as never), 'loop');
  applyPlan(buildAddInteractionConstraintCommand(state.repository, { interactionId: iid, id: 'dc_peak', kind: 'duration', fromMessageId: 'e08_gates', toMessageId: 'e09_peak', expression: 'pull-in < 0.3 ms' }), 'peak time');
});
interaction('int_ECU_CmpTiming', 'ECU internal - CKP lost, CMP timing', ECU, LL_INT.filter(([id]) => ['li_canPhy', 'li_vr', 'li_mcu', 'li_cpld'].includes(id)), [
  { id: 'n1_ckpLost', from: 'li_vr', to: 'li_mcu', signal: 'CkpLost', connector: cVrMcu, args: 'no CKP edge' },
  { id: 'n2_cmp', from: 'li_vr', to: 'li_mcu', signal: 'VrToothPulse', connector: cVrMcu, args: 'CMP tooth (12 + 1)' },
  { id: 'n3_dtc', from: 'li_mcu', to: 'li_canPhy', signal: 'FaultRecord', connector: cCanMcu, args: 'mrCode=0110, j1939Spn=636' },
  { id: 'n4_soi', from: 'li_mcu', to: 'li_cpld', signal: 'SoiTrigger', connector: cSoi, args: 'CMP-timed, <= 1800 rpm' },
]);

// system-level sequence diagrams (context OM501LA_EngineSystem)
const LL: Record<string, [string, string, string]> = {
  driver: ['l_driver', 'driver', actors.driver], fr: ['l_fr', 'fr', sysPath('fr')], ecu: ['l_ecu', 'ecu', sysPath('ecu')],
  starter: ['l_starter', 'starter', sysPath('starter')], ckp: ['l_ckp', 'b15_ckp', sysPath('b15_ckp')], cmp: ['l_cmp', 'b16_cmp', sysPath('b16_cmp')],
  pumps: ['l_pumps', 'unitPumps', sysPath('unitPumps')], ect: ['l_ect', 'b65_ect', sysPath('b65_ect')], pv1: ['l_pv1', 'pv1_decompression', sysPath('pv1_decompression')],
  pv2: ['l_pv2', 'pv2_exhaustBrake', sysPath('pv2_exhaustBrake')], pv3: ['l_pv3', 'pv3_fanClutch', sysPath('pv3_fanClutch')],
  tester: ['l_tester', 'tester', sysPath('tester')], battery: ['l_battery', 'battery', sysPath('battery')],
};
const lls = (...keys: string[]) => keys.map(k => LL[k]);
const CAN = C('c_sys_canBusLink');
interaction('int_SD_Crank_Auth_PeakHold_Injection', 'Crank, authorisation and peak & hold injection', SYS, lls('driver', 'battery', 'fr', 'ecu', 'starter', 'ckp', 'cmp', 'pumps'), [
  { id: 'm00_kl30', from: 'l_battery', to: 'l_ecu', signal: 'ElectricalPower', connector: C('c_sys_battery_pin_05'), args: 'KL.30 24 V' },
  { id: 'm01_keyOn', from: 'l_driver', to: 'l_fr', signal: 'KL15_On' },
  { id: 'm02_wake', from: 'l_fr', to: 'l_ecu', signal: 'KL15_On', connector: C('c_sys_fr_pin_15'), inState: 'ST_INIT_IMMO' },
  { id: 'm03_immo', from: 'l_fr', to: 'l_ecu', signal: 'ImmoReleaseFrame', connector: CAN, args: 'authCode matches 93C86 -> immoValid' },
  { id: 'm04_selfTest', from: 'l_ecu', to: 'l_ecu', signal: 'SelfTestPassed', args: 'flash / EEPROM checksum, ADC plausibility', inState: 'ST_READY' },
  { id: 'm06_crankReq', from: 'l_driver', to: 'l_fr', signal: 'KL50_CrankRequest' },
  { id: 'm07_kl50', from: 'l_fr', to: 'l_ecu', signal: 'KL50_CrankRequest', connector: C('c_sys_fr_pin_08'), inState: 'ST_CRANK_SYNC' },
  { id: 'm08_starterOn', from: 'l_ecu', to: 'l_starter', signal: 'KL50_CrankRequest', connector: C('c_sys_starter_pin_18'), args: 'starter relay X2-18 on' },
  { id: 'm09_ckp', from: 'l_ckp', to: 'l_ecu', signal: 'VrToothPulse', connector: C('c_sys_b15_ckp_pin_19') },
  { id: 'm10_cmp', from: 'l_cmp', to: 'l_ecu', signal: 'VrToothPulse', connector: C('c_sys_b16_cmp_pin_20') },
  { id: 'm11_torque', from: 'l_fr', to: 'l_ecu', signal: 'TorqueRequestFrame', connector: CAN },
  { id: 'm12_inject', from: 'l_ecu', to: 'l_pumps', signal: 'SoiTrigger', connector: C('c_sys_up1_pin_54'), args: 'cylinder=1, soiDegBTDC, durationDegCA' },
  { id: 'm13_eoi', from: 'l_ecu', to: 'l_pumps', signal: 'EoiTrigger', connector: C('c_sys_up1_pin_54') },
  { id: 'm14_running', from: 'l_ckp', to: 'l_ecu', signal: 'EngineRunning', connector: C('c_sys_b15_ckp_pin_19'), args: 'rpm > 500 from CKP period', inState: 'ST_RUN_NORMAL' },
], iid => {
  firstInvariant(iid, 'l_ecu', 'ST_STANDBY');
  applyPlan(buildAddInteractionUseCommand(state.repository, { interactionId: iid, id: 'ref_ecu_start', refersToId: 'int_ECU_Start_Injection', coveredLifelineIds: [ll(iid, 'l_ecu')], afterMessageId: 'm11_torque' } as never), 'ref');
  applyPlan(buildAddFragmentCommand(state.repository, { interactionId: iid, id: 'frag_firing', operator: 'loop', coveredLifelineIds: [ll(iid, 'l_ecu'), ll(iid, 'l_pumps')], messageIds: ['m12_inject', 'm13_eoi'], guard: '[firing order 1-4-2-5-3-6]' } as never), 'loop');
  applyPlan(buildAddInteractionConstraintCommand(state.repository, { interactionId: iid, id: 'tc_crank', kind: 'duration', fromMessageId: 'm08_starterOn', toMessageId: 'm14_running', expression: 'rpm < 300 at crank, > 500 when running' }), 'crank');
}, 'uc03');
interaction('int_SD_CkpLoss_LimpHome', 'CKP loss - limp home on CMP', SYS, lls('ckp', 'cmp', 'ecu', 'fr', 'pumps'), [
  { id: 'k1_ckpLost', from: 'l_ckp', to: 'l_ecu', signal: 'CkpLost', connector: C('c_sys_b15_ckp_pin_19'), inState: 'ST_LIMP_DERATE' },
  { id: 'k2_cmp', from: 'l_cmp', to: 'l_ecu', signal: 'VrToothPulse', connector: C('c_sys_b16_cmp_pin_20') },
  { id: 'k3_dtc', from: 'l_ecu', to: 'l_fr', signal: 'FaultRecord', connector: CAN, args: 'mrCode=0110, j1939Spn=636, severity=DERATE' },
  { id: 'k4_inject', from: 'l_ecu', to: 'l_pumps', signal: 'SoiTrigger', connector: C('c_sys_up1_pin_54'), args: 'CMP-timed, <= 1800 rpm, torque <= 65 %' },
  { id: 'k5_restored', from: 'l_ckp', to: 'l_ecu', signal: 'CkpRestored', connector: C('c_sys_b15_ckp_pin_19'), inState: 'ST_RUN_NORMAL' },
], iid => {
  firstInvariant(iid, 'l_ecu', 'ST_RUN');
  applyPlan(buildAddInteractionUseCommand(state.repository, { interactionId: iid, id: 'ref_cmp_timing', refersToId: 'int_ECU_CmpTiming', coveredLifelineIds: [ll(iid, 'l_ecu')], afterMessageId: 'k2_cmp' } as never), 'ref');
}, 'uc10');
interaction('int_SD_Immobilizer_Rejected', 'Immobiliser code rejected', SYS, lls('driver', 'fr', 'ecu', 'starter'), [
  { id: 'r1_wake', from: 'l_fr', to: 'l_ecu', signal: 'KL15_On', connector: C('c_sys_fr_pin_15'), inState: 'ST_INIT_IMMO' },
  { id: 'r2_immo', from: 'l_fr', to: 'l_ecu', signal: 'ImmoReleaseFrame', connector: CAN, args: 'authCode does not match 93C86' },
  { id: 'r3_reject', from: 'l_ecu', to: 'l_ecu', signal: 'ImmoRejected', args: 'authCode != pairing data', inState: 'ST_IMMO_LOCKED' },
  { id: 'r4_crankReq', from: 'l_driver', to: 'l_fr', signal: 'KL50_CrankRequest' },
  { id: 'r5_kl50', from: 'l_fr', to: 'l_ecu', signal: 'KL50_CrankRequest', connector: C('c_sys_fr_pin_08') },
  { id: 'r6_dtc', from: 'l_ecu', to: 'l_fr', signal: 'FaultRecord', connector: CAN, args: 'mrCode=9964' },
  { id: 'r7_noStarter', from: 'l_ecu', to: 'l_starter', signal: 'KL50_CrankRequest', connector: C('c_sys_starter_pin_18'), args: 'must not occur' },
  { id: 'r8_keyOff', from: 'l_fr', to: 'l_ecu', signal: 'KL15_Off', connector: C('c_sys_fr_pin_15'), inState: 'ST_STANDBY' },
], iid => {
  firstInvariant(iid, 'l_ecu', 'ST_STANDBY');
  applyPlan(buildAddFragmentCommand(state.repository, { interactionId: iid, id: 'frag_no_start', operator: 'neg', coveredLifelineIds: [ll(iid, 'l_ecu'), ll(iid, 'l_starter')], messageIds: ['r7_noStarter'] } as never), 'neg');
}, 'uc02');
interaction('int_SD_EngineBrake', 'Engine brake', SYS, lls('driver', 'fr', 'ecu', 'pv1', 'pv2', 'pumps'), [
  { id: 'b1_request', from: 'l_fr', to: 'l_ecu', signal: 'EngineBrakeRequest', connector: CAN, args: 'pedal 0 %', inState: 'ST_ENGINE_BRAKE' },
  { id: 'b2_pv1', from: 'l_ecu', to: 'l_pv1', signal: 'ElectricalPower', connector: C('c_sys_pv1_decompression_pin_51'), args: 'PV1 on' },
  { id: 'b3_pv2', from: 'l_ecu', to: 'l_pv2', signal: 'ElectricalPower', connector: C('c_sys_pv2_exhaustBrake_pin_50'), args: 'PV2 on' },
  { id: 'b4_release', from: 'l_fr', to: 'l_ecu', signal: 'EngineBrakeRelease', connector: CAN, inState: 'ST_RUN_NORMAL' },
  { id: 'b5_inject', from: 'l_ecu', to: 'l_pumps', signal: 'SoiTrigger', connector: C('c_sys_up1_pin_54'), args: 'injection resumes' },
], iid => firstInvariant(iid, 'l_ecu', 'ST_RUN_NORMAL'), 'uc08');
interaction('int_SD_Overtemp_Derate', 'Over-temperature derate and fan clutch', SYS, lls('ect', 'ecu', 'pv3', 'fr'), [
  { id: 'o1_fan', from: 'l_ecu', to: 'l_pv3', signal: 'ElectricalPower', connector: C('c_sys_pv3_fanClutch_pin_41'), args: 'PWM from 92 C, 100 % at 100 C' },
  { id: 'o2_hot', from: 'l_ect', to: 'l_ecu', signal: 'OvertempDetected', connector: C('c_sys_b65_ect_pin_34'), args: 'coolant >= 103 C (0.37 V)', inState: 'ST_LIMP_DERATE' },
  { id: 'o3_dtc', from: 'l_ecu', to: 'l_fr', signal: 'FaultRecord', connector: CAN, args: 'mrCode=1515, j1939Spn=110, severity=DERATE' },
  { id: 'o4_cooled', from: 'l_ect', to: 'l_ecu', signal: 'OvertempCleared', connector: C('c_sys_b65_ect_pin_34'), args: 'coolant < 100 C', inState: 'ST_RUN_NORMAL' },
], iid => firstInvariant(iid, 'l_ecu', 'ST_RUN'), 'uc09');
interaction('int_SD_Stop_Afterrun', 'Stop engine and after-run', SYS, lls('driver', 'fr', 'ecu', 'pumps', 'tester'), [
  { id: 'a1_keyOff', from: 'l_driver', to: 'l_fr', signal: 'KL15_Off' },
  { id: 'a2_kl15', from: 'l_fr', to: 'l_ecu', signal: 'KL15_Off', connector: C('c_sys_fr_pin_15'), inState: 'ST_AFTERRUN' },
  { id: 'a3_stopped', from: 'l_ecu', to: 'l_fr', signal: 'EngineStopped', connector: CAN },
  { id: 'a4_done', from: 'l_ecu', to: 'l_ecu', signal: 'AfterrunComplete', args: 'EEPROM written, latch released', inState: 'ST_STANDBY' },
  { id: 'a5_readDtc', from: 'l_ecu', to: 'l_tester', signal: 'FaultRecord', connector: C('c_sys_tester_pin_13'), args: 'stored DTCs over K-line' },
], iid => firstInvariant(iid, 'l_ecu', 'ST_RUN'), 'uc16');

// ------------------------------------------------- verification and analysis
const vcBody = between(SOURCE, 'package AnalysisAndSimulation {', 'package Traceability {');
const verification = (id: string, name: string, method: string, verifies: string[], behaviorId?: string) => {
  run({ type: 'createElement', element: { ...createVerificationCase({ id, name, ownerId: P.ana }), namespace: ns(P.ana), method, verifiesRequirementIds: verifies.map(reqId), ...(behaviorId ? { behaviorId } : {}) } });
  for (const r of verifies) relate('verify', id, reqId(r));
};
const REQ_BY_NAME = Object.fromEntries(TOP.map(r => [r.name, r.id]));
for (const [, name, body] of vcBody.matchAll(/verification def (\w+) \{([\s\S]*?)\n        \}/g)) {
  verification(`vc_${name}`, name, 'Test', [...body.matchAll(/verify requirement : (\w+);/g)].map(m => REQ_BY_NAME[m[1]]));
}
verification('vc_SensorCalibrationAnalysis', 'SensorCalibrationAnalysis', 'Analysis', ['REQ-DIAG-07', 'REQ-ADC-12', 'REQ-PWR-01']);
verification('vc_PeakHoldCurrentAnalysis', 'PeakHoldCurrentAnalysis', 'Analysis', ['REQ-INJ-03', 'REQ-INJ-04']);
const SCENARIO_VERIFIES: Record<string, string[]> = {
  ST_STANDBY: ['REQ-PWR-01'], ST_READY: ['REQ-SEC-06'], ST_CRANK_SYNC: ['REQ-SEC-06', 'REQ-SYNC-02'], ST_RUN_NORMAL: ['REQ-SAF-05', 'REQ-FIRE-10'],
  ST_ENGINE_BRAKE: ['REQ-BRK-13'], ST_IMMO_LOCKED: ['REQ-SEC-06'], ST_LIMP_DERATE: ['REQ-LIMP-09'], ST_FAULT_SHUTDOWN: ['REQ-SYNC-02'],
};
const SCENARIOS = [...vcBody.matchAll(/part (scn\d+_\w+) : SimulationScenario \{ (.*?) \}/g)].map(m => {
  const fields = Object.fromEntries([...m[2].matchAll(/:>> (\w+) = ([^;]+);/g)].map(f => [f[1], f[2].replace(/"/g, '').replace('KeyState::', '')]));
  return { name: m[1], ...fields } as Record<string, string> & { name: string };
});
if (SCENARIOS.length !== 14) throw new Error(`expected 14 scenarios, found ${SCENARIOS.length}`);
for (const s of SCENARIOS) {
  const extra = s.name.includes('Overheat') ? ['REQ-THM-08'] : s.name.includes('CanTimeout') ? ['REQ-COM-11'] : s.name.includes('Bank1Short') ? ['REQ-INJ-04'] : s.name.includes('CmpLoss') ? ['REQ-SYNC-02'] : [];
  verification(`vc_${s.name}`, `${s.name} -> ${s.expectedState}`, 'Simulation', [...new Set([...(SCENARIO_VERIFIES[s.expectedState] ?? []), ...extra])]);
}
for (const [iid, reqs] of [['int_SD_Immobilizer_Rejected', ['REQ-SEC-06']], ['int_SD_CkpLoss_LimpHome', ['REQ-LIMP-09', 'REQ-SYNC-02']], ['int_SD_EngineBrake', ['REQ-BRK-13']],
  ['int_SD_Overtemp_Derate', ['REQ-THM-08']], ['int_SD_Stop_Afterrun', ['REQ-AFT-18']], ['int_SD_Crank_Auth_PeakHold_Injection', ['REQ-INJ-03', 'REQ-FIRE-10']]] as const) {
  for (const r of reqs) relate('verify', iid, reqId(r));
}
diagram('req_99_verification', 'REQ 99 - Verification', 'requirements', P.reqs);
{
  const vcs = Object.keys(state.repository.verificationCases);
  const top = TOP.map(r => reqId(r.id)).concat(reqId('REQ-BRK-13'), reqId('REQ-AFT-18'));
  const coordinates = Object.fromEntries([
    ...top.map((id, i) => [id, box(40 + (i % 7) * 300, 40, 270, 170)]),
    ...vcs.map((id, i) => [id, box(40 + (i % 7) * 300, 320 + Math.floor(i / 7) * 160, 270, 120)]),
  ]);
  run({ type: 'addToDiagram', diagramId: 'req_99_verification', elementIds: Object.keys(coordinates), coordinates }, 'req_99_verification');
  tabs.push('req_99_verification');
}

// ------------------------------------------------------- views / package diagram
diagram('pkg_01_model', 'PKG 01 - Model organisation', 'package', P.root);
run({ type: 'addToDiagram', diagramId: 'pkg_01_model', elementIds: PACKAGE_NAMES.map(([id]) => id),
  coordinates: Object.fromEntries(PACKAGE_NAMES.map(([id], i) => [id, box(40 + (i % 5) * 300, 40 + Math.floor(i / 5) * 200, 260, 150)])) }, 'pkg_01_model');
tabs.unshift('pkg_01_model');

// ------------------------------------------------------------------ verify
const findings = [
  ...validateSysmlRepository(state.repository, stateContext).diagnostics,
  ...Object.values(state.repository.definitions).filter(d => d.kind === 'block').flatMap(d => deriveIbdView(state.repository, d.id).diagnostics),
  ...deriveBddView(state.repository).diagnostics,
];
// The only accepted findings: the app's guidance on the two `abstract part def`s of the source.
const ABSTRACT = new Set([blockId(EC), blockId('EngineSensor')]);
const isAbstractGuidance = (d: { code: string; elementId?: string }) => d.code === 'ABSTRACT_INSTANTIATION' && ABSTRACT.has(d.elementId ?? '');
if (findings.filter(d => !isAbstractGuidance(d)).length > 0 || findings.length !== ABSTRACT.size) {
  throw new Error(`The app's validators report ${findings.length} finding(s):\n${findings.slice(0, 40).map(d => `${d.severity} ${d.code} ${d.elementId}: ${d.message}`).join('\n')}`);
}
for (const diagramId of Object.keys(state.repository.diagrams)) {
  const view = getCachedLegacyView(state.store!, diagramId);
  console.log(`${diagramId}: ${view.blocks.length} elements, ${view.relationships.length} relationships, ${view.parts.length} parts, ${view.connectors.length} connectors`);
}

// -------------------------------------------------------------------- save
const saved = serializeSysmlProjectState(state.repository, state.diagramPresentations ?? {}, state.coordinates);
const workspaceTabs = [...tabs, ...requirementDiagrams].map(diagramId => ({ kind: 'sysmlDiagram', diagramId }));
const payload = createUnifiedProjectPayload({
  ...behaviour,
  openTabs: ['statemachine', 'bdd', 'ibd', 'requirements', 'hmi'],
  diagramWorkspace: { tabs: workspaceTabs, activeTab: workspaceTabs[0] },
  activeSysmlDiagramId: 'bdd_01_system_context',
  diagramNavigationStack: [],
  blocks: [], relationships: [], parts: [], connectors: [],
  sysmlRepository: saved.sysmlRepository,
  sysmlCoordinates: saved.sysmlCoordinates,
  diagramPresentations: saved.diagramPresentations,
} as never, () => new Date('2026-10-18T00:00:00Z'));
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
const kinds: Record<string, number> = {};
for (const d of Object.values(state.repository.diagrams)) kinds[d.diagramKind] = (kinds[d.diagramKind] ?? 0) + 1;
console.log(`wrote ${OUT.slice(ROOT.length + 1)}: ${blockIds.length} blocks, ${Object.keys(state.repository.requirements).length} requirements, ` +
  `${Object.keys(state.repository.connectors).length} connectors, diagrams ${JSON.stringify(kinds)}, ${SM.states.length} states, ${SM.transitions.length} transitions`);
