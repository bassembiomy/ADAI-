/**
 * Build MR_PLD_ECU.adia from models/mr_pld/MR_PLD_Model.sysml (step 2 of 2).
 *
 * Every SysML element becomes a semantic element of the ADIA repository, created
 * through the same gateway commands the editor uses:
 *   packages            -> Packages (MR_PLD_Model::Types/Items/Ports/Structure/Behavior)
 *   ScalarValues / ISQ  -> ValueTypes with QUDV Units and QuantityKinds («modelLibrary» Types)
 *   item def            -> Blocks with typed attributes (Items)
 *   port def            -> InterfaceBlocks whose features are the item flow properties (Ports)
 *   part def / part     -> Blocks, part properties (+ composition), proxy ports typed by the
 *                          InterfaceBlocks; ~ is a conjugated port; CabConnector16 /
 *                          EngConnector55 are ports with nested ports (X1.KL30, X2.ckp, ...)
 *   :>> redefinitions   -> HighSide/LowSide MOSFET specialisations with redefined values
 *   connect / interface -> IBD connectors (path ends), validated by the IBD connector rules
 *   state def           -> the executable state machine (step 1 flat file), whose I/O are
 *                          Signals received by the Blocks (receptions)
 *   (new)               -> Interaction "Engine start and drive" (sequence diagram) whose
 *                          messages travel over the IBD connectors, with state invariants
 *                          on the ECU lifeline that name states of the state machine.
 *
 * The build fails unless the app's validators report nothing: validateSysmlRepository,
 * the IBD connector rules of every context and the BDD block rules.
 *
 * Run: python3 scripts/generate_mr_pld_adia.py && npx tsx scripts/build_mr_pld_adia.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSysmlGatewayState,
  executeSysmlCommand,
  type SysmlEditorCommand,
  type SysmlGatewayState,
} from '../src/services/sysmlCommandGateway';
import { buildCreatePathIbdConnectorCommand } from '../src/services/sysmlIbdConnectorCommands';
import {
  buildAddInteractionConstraintCommand,
  buildAddInteractionMessageCommand,
  buildAddLifelineCommand,
  buildAddStateInvariantCommand,
  type InteractionCommandPlan,
} from '../src/services/sysmlInteractionCommands';
import { createDiagramDefinition, createInteraction } from '../src/features/modelExplorer/adapters/modelExplorerFactories';
import {
  createEmptyRepository,
  type BlockDefinition,
  type Multiplicity,
  type PortDefinition,
  type PropertyDefinition,
  type SysmlRepository,
} from '../src/engine/sysml/model';
import { serializeSysmlProjectState } from '../src/engine/sysml/persistence';
import { getCachedLegacyView } from '../src/engine/sysml/normalizedStore';
import { validateSysmlRepository } from '../src/engine/sysml/validation';
import { deriveIbdView } from '../src/engine/sysml/ibd';
import { deriveBddView } from '../src/engine/sysml/bdd';
import { projectStateEndpoints } from '../src/engine/sysml/workers/projectIoPayload';
import { createUnifiedProjectPayload } from '../src/utils/adiaProjectPersistence';
import type { PresentationCoordinates } from '../src/engine/sysml/presentationState';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const behaviour = JSON.parse(readFileSync(resolve(ROOT, 'models/mr_pld/MR_PLD_ECU.behaviour.json'), 'utf8'));
const stateContext = { externalEndpoints: projectStateEndpoints(behaviour.states) };

// ------------------------------------------------------------------ helpers
const one: Multiplicity = { lower: 1, upper: 1, ordered: false, unique: true };
const mult = (text = '1'): Multiplicity => {
  if (text === '*') return { lower: 0, upper: '*', ordered: false, unique: true };
  const [lo, hi] = text.split('..');
  if (hi === undefined) return { lower: Number(lo), upper: Number(lo), ordered: false, unique: true };
  return { lower: Number(lo), upper: hi === '*' ? '*' : Number(hi), ordered: false, unique: true };
};

const repo: SysmlRepository = createEmptyRepository();
const NS = 'MR_PLD_Model';
const pkgIds = { root: 'pkg_MR_PLD_Model', types: 'pkg_Types', items: 'pkg_Items', ports: 'pkg_Ports', structure: 'pkg_Structure', behavior: 'pkg_Behavior' };
repo.packages[pkgIds.root] = { id: pkgIds.root, kind: 'package', name: NS, namespace: [], ownerId: 'model' };
const pkg = (id: string, name: string, stereotype?: 'modelLibrary') => {
  repo.packages[id] = { id, kind: 'package', name, namespace: [NS], ownerId: pkgIds.root, ...(stereotype ? { stereotype } : {}) };
};
pkg(pkgIds.types, 'Types', 'modelLibrary');
pkg(pkgIds.items, 'Items');
pkg(pkgIds.ports, 'Ports');
pkg(pkgIds.structure, 'Structure');
pkg(pkgIds.behavior, 'Behavior');
const ns = (pkgId: string) => [NS, repo.packages[pkgId].name];

// ------------------------------------------------- Types («modelLibrary»): QUDV
const quantityKinds: Array<[string, string, string]> = [
  ['qk_ElectricPotential', 'ElectricPotential', 'U'], ['qk_ElectricCurrent', 'ElectricCurrent', 'I'],
  ['qk_ElectricResistance', 'ElectricResistance', 'R'], ['qk_PlaneAngle', 'PlaneAngle', 'φ'],
  ['qk_Time', 'Time', 't'], ['qk_RotationalSpeed', 'RotationalSpeed', 'n'],
  ['qk_Temperature', 'ThermodynamicTemperature', 'T'], ['qk_InformationCapacity', 'InformationCapacity', 'C'],
  ['qk_DataRate', 'DataRate', 'r'],
];
for (const [id, name, symbol] of quantityKinds) {
  repo.definitions[id] = { id, kind: 'quantityKind', name, symbol, namespace: ns(pkgIds.types), ownerId: pkgIds.types };
}
const units: Array<[string, string, string, string]> = [
  ['u_V', 'volt', 'V', 'qk_ElectricPotential'], ['u_A', 'ampere', 'A', 'qk_ElectricCurrent'],
  ['u_Ohm', 'ohm', 'Ω', 'qk_ElectricResistance'], ['u_deg', 'degree', '°', 'qk_PlaneAngle'],
  ['u_ms', 'millisecond', 'ms', 'qk_Time'], ['u_rpm', 'revolution per minute', 'rpm', 'qk_RotationalSpeed'],
  ['u_degC', 'degree Celsius', '°C', 'qk_Temperature'], ['u_KB', 'kilobyte', 'KB', 'qk_InformationCapacity'],
  ['u_B', 'byte', 'B', 'qk_InformationCapacity'], ['u_kbps', 'kilobit per second', 'kbit/s', 'qk_DataRate'],
];
for (const [id, name, symbol, quantityKindId] of units) {
  repo.definitions[id] = { id, kind: 'unit', name, symbol, quantityKindId, namespace: ns(pkgIds.types), ownerId: pkgIds.types };
}
const valueTypes: Array<[string, string, string?, string?]> = [
  // ScalarValues
  ['vt_Real', 'Real'], ['vt_Integer', 'Integer'], ['vt_Boolean', 'Boolean'], ['vt_String', 'String'],
  // ISQ / SI quantities the model's attributes carry
  ['vt_Voltage', 'Voltage', 'u_V', 'qk_ElectricPotential'], ['vt_Current', 'Current', 'u_A', 'qk_ElectricCurrent'],
  ['vt_Resistance', 'Resistance', 'u_Ohm', 'qk_ElectricResistance'], ['vt_CrankAngle', 'CrankAngle', 'u_deg', 'qk_PlaneAngle'],
  ['vt_Duration', 'Duration', 'u_ms', 'qk_Time'], ['vt_EngineSpeed', 'EngineSpeed', 'u_rpm', 'qk_RotationalSpeed'],
  ['vt_Temperature', 'Temperature', 'u_degC', 'qk_Temperature'], ['vt_MemoryKB', 'MemorySizeKB', 'u_KB', 'qk_InformationCapacity'],
  ['vt_MemoryB', 'MemorySizeB', 'u_B', 'qk_InformationCapacity'], ['vt_BitRate', 'BitRate', 'u_kbps', 'qk_DataRate'],
];
for (const [id, name, unitId, quantityKindId] of valueTypes) {
  const symbol = unitId ? units.find(([u]) => u === unitId)![2] : undefined;
  repo.definitions[id] = {
    id, kind: 'valueType', name, namespace: ns(pkgIds.types), ownerId: pkgIds.types,
    ...(unitId ? { unitId, unit: symbol } : {}),
    ...(quantityKindId ? { quantityKindId } : {}),
  };
}

// ------------------------------------------------------------------ blocks
const block = (id: string, name: string, pkgId: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => {
  const def: BlockDefinition = {
    id, kind: 'block', name, namespace: ns(pkgId), ownerId: pkgId, isAbstract: false, isLeaf: false,
    properties: [], ports: [], operations: [], constraints: [], ...extra,
  };
  repo.definitions[id] = def;
  return def;
};
const value = (owner: string, name: string, typeId: string, defaultValue?: string | number, multiplicity = '1'): PropertyDefinition => ({
  id: `${owner}.${name}`, name, kind: 'value', typeId, multiplicity: mult(multiplicity),
  ...(defaultValue !== undefined ? { defaultValue: String(defaultValue) } : {}),
});

// ---- Ports (port def): InterfaceBlocks; features are the flow properties
const interfaceIds: Record<string, string> = {};
const nominalDirection: Record<string, PortDefinition['direction']> = {};
const iface = (name: string, direction: PortDefinition['direction'], features: string[]) => {
  const id = `if_${name}`;
  repo.definitions[id] = { id, kind: 'interface', name, features, namespace: ns(pkgIds.ports), ownerId: pkgIds.ports };
  interfaceIds[name] = id;
  nominalDirection[id] = direction;
};
iface('PowerPort', 'out', ['out supply : Electrical']);
iface('DigitalPort', 'out', ['out level : Electrical']);
iface('ImmoPort', 'out', ['out key : KeyCode']);
iface('CAN_Port', 'inout', ['in rx : TorqueRequest', 'out tx : EngineStatus']);
iface('KLinePort', 'inout', ['inout diag : DiagRequest']);
iface('VRSensorPort', 'out', ['out pulse : CrankPulse']);
iface('CamSensorPort', 'out', ['out pulse : CamPulse']);
iface('AnalogPort', 'out', ['out value : AnalogSignal']);
iface('SolenoidPort', 'in', ['in drive : SolenoidCurrent']);
iface('CabConnector16', 'inout', ['in port KL30 : ~PowerPort  (X1-5, X1-6)', 'in port KL15 : ~DigitalPort  (X1-15)',
  'in port KL50 : ~DigitalPort  (X1-8)', 'port can : ~CAN_Port  (X1-1 H, X1-2 L)', 'port kLine : KLinePort  (X1-13)']);
iface('EngConnector55', 'inout', ['in port ckp : ~VRSensorPort  (X2-19 / X2-2)', 'in port cmp : ~CamSensorPort  (X2-20 / X2-1)',
  'in port analog : ~AnalogPort[8]  (X2-29,32,34,36,39,48,33 ...)', 'out port bank1 : ~SolenoidPort[3]  (X2-16 + 54,53,47)',
  'out port bank2 : ~SolenoidPort[3]  (X2-9 + 45,44,38)', 'out port starter : PowerPort  (X2-18)',
  'out port pv : PowerPort[2]  (X2-12/51, X2-52/50)', 'out port fan : PowerPort[2]  (X2-41, X2-43)']);

/** Proxy port typed by an InterfaceBlock; `~Type` conjugates it. Nested ports name their owning port. */
const port = (owner: string, name: string, type: string, multiplicity = '1', ownerPortId?: string): PortDefinition => {
  const typeId = interfaceIds[type.replace('~', '')];
  if (!typeId) throw new Error(`Unknown port type ${type}`);
  return {
    id: ownerPortId ? `${ownerPortId}.${name}` : `${owner}.${name}`, name, kind: 'proxy', portKind: 'proxyPort',
    typeId, direction: nominalDirection[typeId], isConjugated: type.startsWith('~'), multiplicity: mult(multiplicity),
    ...(ownerPortId ? { ownerPortId, nestedPortPathIds: [ownerPortId, `${ownerPortId}.${name}`] } : {}),
  };
};

// ---- Items (item def): Blocks with typed attributes
const I = pkgIds.items;
block('item_TorqueRequest', 'TorqueRequest', I, { properties: [value('item_TorqueRequest', 'pedal', 'vt_Real'), value('item_TorqueRequest', 'engineBrake', 'vt_Boolean')] });
block('item_EngineStatus', 'EngineStatus', I, { properties: [value('item_EngineStatus', 'rpm', 'vt_EngineSpeed'), value('item_EngineStatus', 'ect', 'vt_Temperature'), value('item_EngineStatus', 'dtc', 'vt_String', undefined, '*')] });
block('item_CrankPulse', 'CrankPulse', I, { properties: [value('item_CrankPulse', 'toothIndex', 'vt_Integer')], constraints: ['36+1 tooth pattern'] });
block('item_CamPulse', 'CamPulse', I, { properties: [value('item_CamPulse', 'refTooth', 'vt_Boolean')], constraints: ['12+1 tooth pattern'] });
block('item_AnalogSignal', 'AnalogSignal', I, { properties: [value('item_AnalogSignal', 'volts', 'vt_Voltage')] });
block('item_InjectionCmd', 'InjectionCmd', I, { properties: [value('item_InjectionCmd', 'cylinder', 'vt_Integer'), value('item_InjectionCmd', 'soiDeg', 'vt_CrankAngle'), value('item_InjectionCmd', 'durationMs', 'vt_Duration')] });
block('item_SolenoidCurrent', 'SolenoidCurrent', I, { properties: [value('item_SolenoidCurrent', 'peakA', 'vt_Current', 16.0), value('item_SolenoidCurrent', 'holdA', 'vt_Current', 8.0)] });
block('item_Electrical', 'Electrical', I, { properties: [value('item_Electrical', 'volts', 'vt_Voltage')] });
block('item_DiagRequest', 'DiagRequest', I);
block('item_KeyCode', 'KeyCode', I, { properties: [value('item_KeyCode', 'code', 'vt_String')] });

// ---- Behavior: Signals = the inputs/outputs of the OperatingModes state machine
const signals = ['kl15', 'kl50', 'synced', 'rpm', 'pedal', 'ebReq', 'starter', 'injection', 'pv', 'engineStatus'];
for (const name of signals) {
  repo.definitions[`sig_${name}`] = { id: `sig_${name}`, kind: 'signal', name, namespace: ns(pkgIds.behavior), ownerId: pkgIds.behavior };
}
const sig = (name: string) => `sig_${name}`;

// ---- Structure
const S = pkgIds.structure;
const part = (owner: string, name: string, typeId: string, multiplicity = '1', kind: 'part' | 'reference' = 'part'): PropertyDefinition => ({
  id: `${owner}.${name}`, name, kind, typeId, multiplicity: mult(multiplicity),
});
const compositions: Array<[string, string, string, string]> = [];
const withParts = (owner: string, parts: Array<[string, string, string?]>) => {
  for (const [name, typeId, m] of parts) compositions.push([owner, typeId, name, m ?? '1']);
  return parts.map(([name, typeId, m]) => part(owner, name, typeId, m));
};

block('blk_VehicleBattery', 'VehicleBattery', S, {
  properties: [value('blk_VehicleBattery', 'nominal', 'vt_Voltage', 24.0)],
  ports: [port('blk_VehicleBattery', 'KL30', 'PowerPort')],
});
block('blk_IgnitionSwitch', 'IgnitionSwitch', S, {
  ports: [port('blk_IgnitionSwitch', 'KL15', 'DigitalPort'), port('blk_IgnitionSwitch', 'KL50', 'DigitalPort'), port('blk_IgnitionSwitch', 'immo', 'ImmoPort')],
});
block('blk_FR_DriveController', 'FR_DriveController', S, {
  properties: [value('blk_FR_DriveController', 'pedal', 'vt_Real'), value('blk_FR_DriveController', 'engBrakeReq', 'vt_Boolean')],
  ports: [port('blk_FR_DriveController', 'can', 'CAN_Port')],
  receptions: [sig('engineStatus')],
});
block('blk_DiagnosticTester', 'DiagnosticTester', S, {
  properties: [value('blk_DiagnosticTester', 'tool', 'vt_String', 'Star / XENTRY')],
  ports: [port('blk_DiagnosticTester', 'kLine', '~KLinePort')],
});

// ECU internals
block('blk_PowerSupplyUnit', 'PowerSupplyUnit', S, {
  properties: [value('blk_PowerSupplyUnit', 'vOut', 'vt_Voltage', 5.0), value('blk_PowerSupplyUnit', 'regulator', 'vt_String', 'TLE4275/TLE4267')],
  ports: [port('blk_PowerSupplyUnit', 'KL30', '~PowerPort')],
  operations: ['powerLatch()'],
});
block('blk_MainMCU', 'MainMCU', S, {
  properties: [value('blk_MainMCU', 'chip', 'vt_String', 'SAK-C167CS-LM'), value('blk_MainMCU', 'adcChannels', 'vt_Integer', 24), value('blk_MainMCU', 'capcomChannels', 'vt_Integer', 32)],
});
block('blk_FlashMemory', 'FlashMemory', S, {
  properties: [value('blk_FlashMemory', 'chip', 'vt_String', 'AM29F400BB'), value('blk_FlashMemory', 'sizeKB', 'vt_MemoryKB', 512)],
});
block('blk_ConfigEEPROM', 'ConfigEEPROM', S, {
  properties: [value('blk_ConfigEEPROM', 'chip', 'vt_String', '93C86'), value('blk_ConfigEEPROM', 'sizeBytes', 'vt_MemoryB', 2048), value('blk_ConfigEEPROM', 'codes', 'vt_String', '1061 1047 1034 1026')],
});
block('blk_CoProcessor', 'CoProcessor', S, { properties: [value('blk_CoProcessor', 'chip', 'vt_String', 'TEMIC 845AW')] });
block('blk_TimingLogic', 'TimingLogic', S, { properties: [value('blk_TimingLogic', 'chip', 'vt_String', 'TEMIC ULC (PLCC-44)')] });
block('blk_SensorConditioning', 'SensorConditioning', S, {
  properties: [value('blk_SensorConditioning', 'vrConditioner', 'vt_String', 'LM2903')],
  ports: [port('blk_SensorConditioning', 'ckp', '~VRSensorPort'), port('blk_SensorConditioning', 'cmp', '~CamSensorPort'), port('blk_SensorConditioning', 'analog', '~AnalogPort', '8')],
});
block('blk_CommInterface', 'CommInterface', S, {
  properties: [value('blk_CommInterface', 'canTransceiver', 'vt_String', 'B10011S + PCA82C250'), value('blk_CommInterface', 'kLineIC', 'vt_String', 'L9637D'), value('blk_CommInterface', 'canRate_kbps', 'vt_BitRate', 250)],
  ports: [port('blk_CommInterface', 'can', '~CAN_Port'), port('blk_CommInterface', 'kLine', 'KLinePort')],
});
block('blk_MosfetSwitch', 'MosfetSwitch', S, {
  properties: [value('blk_MosfetSwitch', 'partNo', 'vt_String'), value('blk_MosfetSwitch', 'vds', 'vt_Voltage'), value('blk_MosfetSwitch', 'id', 'vt_Current')],
});
// `part highSide : MosfetSwitch[2] { :>> partNo = ...; }` -> specialisations that redefine the values
const fet = (id: string, name: string, partNo: string, vds: number, idA: number) => block(id, name, S, {
  isLeaf: true,
  properties: [
    { ...value(id, 'partNo', 'vt_String', partNo), redefinesId: 'blk_MosfetSwitch.partNo' },
    { ...value(id, 'vds', 'vt_Voltage', vds), redefinesId: 'blk_MosfetSwitch.vds' },
    { ...value(id, 'id', 'vt_Current', idA), redefinesId: 'blk_MosfetSwitch.id' },
  ],
});
fet('blk_HighSideFET', 'HighSideFET_BUZ102SL', 'BUZ102SL', 55.0, 52.0);
fet('blk_LowSideFET', 'LowSideFET_SUD25N06', 'SUD25N06-45L', 60.0, 25.0);
block('blk_InjectionPowerStage', 'InjectionPowerStage', S, {
  properties: [
    value('blk_InjectionPowerStage', 'iPeak', 'vt_Current', 16.0), value('blk_InjectionPowerStage', 'iHold', 'vt_Current', 8.0),
    value('blk_InjectionPowerStage', 'rShunt', 'vt_Resistance', 0.033),
    ...withParts('blk_InjectionPowerStage', [['highSide', 'blk_HighSideFET', '2'], ['lowSide', 'blk_LowSideFET', '8']]),
  ],
  ports: [port('blk_InjectionPowerStage', 'bank1', '~SolenoidPort', '3'), port('blk_InjectionPowerStage', 'bank2', '~SolenoidPort', '3')],
});
block('blk_AuxDrivers', 'AuxDrivers', S, {
  ports: [port('blk_AuxDrivers', 'starter', 'PowerPort'), port('blk_AuxDrivers', 'pv', 'PowerPort', '2'), port('blk_AuxDrivers', 'fan', 'PowerPort', '2')],
});

const ECU = 'blk_MR_PLD_ECU';
const x1 = port(ECU, 'X1', 'CabConnector16');
const x2 = port(ECU, 'X2', 'EngConnector55');
block(ECU, 'MR_PLD_ECU', S, {
  properties: [
    value(ECU, 'partNo', 'vt_String', 'A 541 446 53 40'), value(ECU, 'zgs', 'vt_String', '001'),
    ...withParts(ECU, [['psu', 'blk_PowerSupplyUnit'], ['mcu', 'blk_MainMCU'], ['flash', 'blk_FlashMemory'], ['eeprom', 'blk_ConfigEEPROM'],
      ['coproc', 'blk_CoProcessor'], ['tlog', 'blk_TimingLogic'], ['sigc', 'blk_SensorConditioning'], ['comm', 'blk_CommInterface'],
      ['pstage', 'blk_InjectionPowerStage'], ['aux', 'blk_AuxDrivers']]),
  ],
  ports: [
    x1,
    port(ECU, 'KL30', '~PowerPort', '1', x1.id), port(ECU, 'KL15', '~DigitalPort', '1', x1.id), port(ECU, 'KL50', '~DigitalPort', '1', x1.id),
    port(ECU, 'can', '~CAN_Port', '1', x1.id), port(ECU, 'kLine', 'KLinePort', '1', x1.id),
    x2,
    port(ECU, 'ckp', '~VRSensorPort', '1', x2.id), port(ECU, 'cmp', '~CamSensorPort', '1', x2.id), port(ECU, 'analog', '~AnalogPort', '8', x2.id),
    port(ECU, 'bank1', '~SolenoidPort', '3', x2.id), port(ECU, 'bank2', '~SolenoidPort', '3', x2.id), port(ECU, 'starter', 'PowerPort', '1', x2.id),
    port(ECU, 'pv', 'PowerPort', '2', x2.id), port(ECU, 'fan', 'PowerPort', '2', x2.id),
  ],
  // The SysML actions of the OperatingModes state machine the ECU exhibits.
  operations: ['latchAndReadEEPROM()', 'storeImmoDTC()', 'starterOn()', 'injectStartQuantity()', 'injectPLD()', 'pvOn()', 'pvOff()',
    'derate()', 'cutInjection()', 'storeDTC()', 'releaseLatch()'],
  receptions: [sig('kl15'), sig('kl50'), sig('synced'), sig('rpm'), sig('pedal'), sig('ebReq')],
});

// Engine side
block('blk_CKP_Sensor', 'CKP_Sensor', S, { properties: [value('blk_CKP_Sensor', 'coilOhm', 'vt_Resistance', 1200.0), value('blk_CKP_Sensor', 'pattern', 'vt_String', '36+1')], ports: [port('blk_CKP_Sensor', 'out_', 'VRSensorPort')] });
block('blk_CMP_Sensor', 'CMP_Sensor', S, { properties: [value('blk_CMP_Sensor', 'pattern', 'vt_String', '12+1')], ports: [port('blk_CMP_Sensor', 'out_', 'CamSensorPort')] });
block('blk_AnalogSensor', 'AnalogSensor', S, { properties: [value('blk_AnalogSensor', 'id', 'vt_String')], ports: [port('blk_AnalogSensor', 'out_', 'AnalogPort')] });
block('blk_UnitPump', 'UnitPump', S, { properties: [value('blk_UnitPump', 'coilOhm', 'vt_Resistance', 0.6), value('blk_UnitPump', 'bank', 'vt_Integer')], ports: [port('blk_UnitPump', 'drive', 'SolenoidPort')] });
block('blk_StarterMotor', 'StarterMotor', S, { ports: [port('blk_StarterMotor', 'cmd', '~PowerPort')] });
block('blk_ProportionalValve', 'ProportionalValve', S, { properties: [value('blk_ProportionalValve', 'coilOhm', 'vt_Resistance', 40.0)], ports: [port('blk_ProportionalValve', 'cmd', '~PowerPort')] });
block('blk_FanClutch', 'FanClutch', S, { ports: [port('blk_FanClutch', 'cmd', '~PowerPort')] });
const ENG = 'blk_OM501LA_Engine';
const harness = port(ENG, 'harness', '~EngConnector55');
block(ENG, 'OM501LA_Engine', S, {
  properties: [
    value(ENG, 'cylinders', 'vt_Integer', 6), value(ENG, 'firingOrder', 'vt_String', '1-4-2-5-3-6'),
    ...withParts(ENG, [['ckp', 'blk_CKP_Sensor'], ['cmp', 'blk_CMP_Sensor'], ['sensors', 'blk_AnalogSensor', '8'], ['pump', 'blk_UnitPump', '6'],
      ['starter', 'blk_StarterMotor'], ['pv', 'blk_ProportionalValve', '2'], ['fan', 'blk_FanClutch']]),
  ],
  // `port harness : ~EngConnector55`: its pins come from the InterfaceBlock; nothing inside the engine connects to them.
  ports: [harness],
  receptions: [sig('starter'), sig('injection'), sig('pv')],
});

// System context
const SYS = 'blk_Actros_EngineMgmt_System';
block(SYS, 'Actros_EngineMgmt_System', S, {
  properties: [
    ...withParts(SYS, [['battery', 'blk_VehicleBattery'], ['ignition', 'blk_IgnitionSwitch'], ['fr', 'blk_FR_DriveController'], ['mr', ECU], ['engine', ENG]]),
    part(SYS, 'tester', 'blk_DiagnosticTester', '0..1', 'reference'),
  ],
});

for (const [owner, typeId, role, m] of compositions) {
  repo.relationships[`comp_${owner}_${role}`] = {
    id: `comp_${owner}_${role}`, kind: 'composition', sourceId: owner, targetId: typeId, name: role,
    targetRole: role, sourceMultiplicity: one, targetMultiplicity: mult(m), sourceAggregation: 'composite',
  };
}
repo.relationships[`assoc_${SYS}_tester`] = {
  id: `assoc_${SYS}_tester`, kind: 'association', sourceId: SYS, targetId: 'blk_DiagnosticTester', name: 'tester',
  targetRole: 'tester', sourceMultiplicity: one, targetMultiplicity: mult('0..1'),
};
for (const [sub, sup] of [['blk_HighSideFET', 'blk_MosfetSwitch'], ['blk_LowSideFET', 'blk_MosfetSwitch']]) {
  repo.relationships[`gen_${sub}`] = { id: `gen_${sub}`, kind: 'generalization', sourceId: sub, targetId: sup };
}

// ------------------------------------------------------------ gateway state
let state: SysmlGatewayState = createSysmlGatewayState(repo, {}, {}, undefined, stateContext);
const run = (command: SysmlEditorCommand, diagramId?: string) => {
  const result = executeSysmlCommand(state, command, diagramId, stateContext);
  if (!result.committed) throw new Error(`${command.type} rejected: ${JSON.stringify(result.diagnostics.slice(0, 3))}`);
  state = { ...state, ...result } as SysmlGatewayState;
};
const apply = (plan: InteractionCommandPlan) => {
  if (!plan.ok) throw new Error(`interaction command refused: ${JSON.stringify(plan.diagnostics)}`);
  run(plan.command);
};

// ------------------------------------------------------------------ IBDs
const createDiagram = (id: string, name: string, diagramKind: 'bdd' | 'ibd', ownerId = 'model', contextElementId?: string) =>
  run({ type: 'createDiagram', diagram: { id, kind: 'diagram', diagramKind, name, namespace: [NS], ownerId, ...(contextElementId ? { contextElementId } : {}) } });

const box = (x: number, y: number, width = 200, height = 120): PresentationCoordinates => ({ x, y, width, height });
const ibd = (diagramId: string, context: string, layout: Record<string, PresentationCoordinates>) => {
  createDiagram(diagramId, `IBD - ${repo.definitions[context].name}`, 'ibd', context, context);
  const coordinates = Object.fromEntries(Object.entries(layout).map(([name, bounds]) => [`${context}.${name}`, bounds]));
  run({ type: 'addToDiagram', diagramId, elementIds: Object.keys(coordinates), coordinates }, diagramId);
};
type End = { part?: string; port?: string };
const end = (context: string, e: End) => ({ path: e.part ? [`${context}.${e.part}`] : [], ...(e.port ? { portId: e.port } : {}) });
const connect = (diagramId: string, context: string, id: string, source: End, target: End, itemFlow?: { conveyed: string; property: string }) => {
  const plan = buildCreatePathIbdConnectorCommand(state.repository, {
    contextId: context, diagramId, connectorId: id, source: end(context, source), target: end(context, target),
    ...(itemFlow ? { itemFlowId: itemFlow.conveyed } : {}),
  });
  if (!plan.ok || !plan.command || !plan.connector) throw new Error(`connector ${id} refused: ${JSON.stringify(plan.diagnostics)}`);
  const element = itemFlow ? { ...plan.connector, itemProperty: itemFlow.property } : plan.connector;
  run({ type: 'createAndPresent', diagramId, element, presentation: {} } as SysmlEditorCommand, diagramId);
};
const P = (partName: string, portId?: string): End => ({ part: partName, ...(portId ? { port: portId } : {}) });
const B = (portId: string): End => ({ port: portId });

// IBD: Actros_EngineMgmt_System (connect / interface / flow statements of the system context)
ibd('ibd_system', SYS, {
  battery: box(220, 80), ignition: box(220, 280), fr: box(220, 480), tester: box(220, 680),
  mr: box(640, 160, 300, 560), engine: box(1100, 160, 300, 560),
});
connect('ibd_system', SYS, 'c_kl30', P('battery', 'blk_VehicleBattery.KL30'), P('mr', 'blk_MR_PLD_ECU.X1.KL30'));
connect('ibd_system', SYS, 'c_kl15', P('ignition', 'blk_IgnitionSwitch.KL15'), P('mr', 'blk_MR_PLD_ECU.X1.KL15'));
connect('ibd_system', SYS, 'c_kl50', P('ignition', 'blk_IgnitionSwitch.KL50'), P('mr', 'blk_MR_PLD_ECU.X1.KL50'));
connect('ibd_system', SYS, 'c_can', P('fr', 'blk_FR_DriveController.can'), P('mr', 'blk_MR_PLD_ECU.X1.can'),
  { conveyed: 'if_CAN_Port', property: 'rx : TorqueRequest' });
connect('ibd_system', SYS, 'c_kline', P('tester', 'blk_DiagnosticTester.kLine'), P('mr', 'blk_MR_PLD_ECU.X1.kLine'));
connect('ibd_system', SYS, 'c_x2_harness', P('mr', 'blk_MR_PLD_ECU.X2'), P('engine', 'blk_OM501LA_Engine.harness'),
  { conveyed: 'if_EngConnector55', property: 'ckp.pulse : CrankPulse, bank1.drive : SolenoidCurrent' });

// IBD: MR_PLD_ECU (internal connect statements)
ibd('ibd_ecu', ECU, {
  comm: box(240, 100), psu: box(240, 320), sigc: box(240, 540), mcu: box(580, 260, 200, 200), tlog: box(580, 540),
  aux: box(580, 760), flash: box(920, 100), eeprom: box(920, 280), coproc: box(920, 460), pstage: box(920, 640),
});
connect('ibd_ecu', ECU, 'c_i_kl30', B('blk_MR_PLD_ECU.X1.KL30'), P('psu', 'blk_PowerSupplyUnit.KL30'));
connect('ibd_ecu', ECU, 'c_i_can', B('blk_MR_PLD_ECU.X1.can'), P('comm', 'blk_CommInterface.can'));
connect('ibd_ecu', ECU, 'c_i_kline', B('blk_MR_PLD_ECU.X1.kLine'), P('comm', 'blk_CommInterface.kLine'));
connect('ibd_ecu', ECU, 'c_i_comm_mcu', P('comm'), P('mcu'));
connect('ibd_ecu', ECU, 'c_i_psu_mcu', P('psu'), P('mcu'));
connect('ibd_ecu', ECU, 'c_i_mcu_flash', P('mcu'), P('flash'));
connect('ibd_ecu', ECU, 'c_i_mcu_eeprom', P('mcu'), P('eeprom'));
connect('ibd_ecu', ECU, 'c_i_mcu_coproc', P('mcu'), P('coproc'));
connect('ibd_ecu', ECU, 'c_i_ckp', B('blk_MR_PLD_ECU.X2.ckp'), P('sigc', 'blk_SensorConditioning.ckp'));
connect('ibd_ecu', ECU, 'c_i_cmp', B('blk_MR_PLD_ECU.X2.cmp'), P('sigc', 'blk_SensorConditioning.cmp'));
connect('ibd_ecu', ECU, 'c_i_analog', B('blk_MR_PLD_ECU.X2.analog'), P('sigc', 'blk_SensorConditioning.analog'));
connect('ibd_ecu', ECU, 'c_i_sigc_mcu', P('sigc'), P('mcu'));
connect('ibd_ecu', ECU, 'c_i_mcu_tlog', P('mcu'), P('tlog'));
connect('ibd_ecu', ECU, 'c_i_tlog_pstage', P('tlog'), P('pstage'));
connect('ibd_ecu', ECU, 'c_i_bank1', P('pstage', 'blk_InjectionPowerStage.bank1'), B('blk_MR_PLD_ECU.X2.bank1'));
connect('ibd_ecu', ECU, 'c_i_bank2', P('pstage', 'blk_InjectionPowerStage.bank2'), B('blk_MR_PLD_ECU.X2.bank2'));
connect('ibd_ecu', ECU, 'c_i_mcu_aux', P('mcu'), P('aux'));
connect('ibd_ecu', ECU, 'c_i_starter', P('aux', 'blk_AuxDrivers.starter'), B('blk_MR_PLD_ECU.X2.starter'));
connect('ibd_ecu', ECU, 'c_i_pv', P('aux', 'blk_AuxDrivers.pv'), B('blk_MR_PLD_ECU.X2.pv'));
connect('ibd_ecu', ECU, 'c_i_fan', P('aux', 'blk_AuxDrivers.fan'), B('blk_MR_PLD_ECU.X2.fan'));

// IBDs of the engine and the power stage: their parts (the source declares no connections there)
ibd('ibd_engine', ENG, {
  ckp: box(220, 100), cmp: box(480, 100), sensors: box(740, 100), pump: box(1000, 100),
  starter: box(220, 320), pv: box(480, 320), fan: box(740, 320),
});
ibd('ibd_pstage', 'blk_InjectionPowerStage', { highSide: box(220, 100), lowSide: box(480, 100) });

// ------------------------------------------------------- sequence diagram
const INT = 'int_EngineStart';
run({ type: 'createElement', element: createInteraction({ id: INT, name: 'Engine start and drive', ownerId: SYS }) });
run({ type: 'createDiagram', diagram: createDiagramDefinition({ id: 'sd_engine_start', name: 'SD - Engine start and drive', ownerId: INT, diagramKind: 'sequence', contextElementId: INT }) });
const lifeline = (id: string, partName: string) =>
  apply(buildAddLifelineCommand(state.repository, { interactionId: INT, id, representsId: `${SYS}.${partName}` }));
lifeline('ll_ignition', 'ignition');
lifeline('ll_fr', 'fr');
lifeline('ll_mr', 'mr');
lifeline('ll_engine', 'engine');
const msg = (id: string, from: string, to: string, signal: string, connectorId: string, args?: string) =>
  apply(buildAddInteractionMessageCommand(state.repository, {
    interactionId: INT, id, sort: 'asynchSignal', sourceLifelineId: from, targetLifelineId: to,
    name: signal, signatureId: sig(signal), connectorId, ...(args ? { arguments: args } : {}),
  }));
const inState = (id: string, stateId: string, afterMessageId: string | null) =>
  apply(buildAddStateInvariantCommand(state.repository, { interactionId: INT, id, lifelineId: 'll_mr', stateId, afterMessageId }));

inState('inv_off', 'st_Off', null);
msg('m01_kl15_on', 'll_ignition', 'll_mr', 'kl15', 'c_kl15', 'true');
inState('inv_standby', 'st_Standby', 'm01_kl15_on');
msg('m02_kl50_on', 'll_ignition', 'll_mr', 'kl50', 'c_kl50', 'true');
inState('inv_sync', 'st_Crank_SyncSearch', 'm02_kl50_on');
msg('m03_starter', 'll_mr', 'll_engine', 'starter', 'c_x2_harness', 'on');
msg('m04_synced', 'll_engine', 'll_mr', 'synced', 'c_x2_harness', 'true');
inState('inv_startfuel', 'st_Crank_StartFuel', 'm04_synced');
msg('m05_start_qty', 'll_mr', 'll_engine', 'injection', 'c_x2_harness', 'startQuantity');
msg('m06_rpm', 'll_engine', 'll_mr', 'rpm', 'c_x2_harness', '> 450');
inState('inv_idle', 'st_Idle', 'm06_rpm');
msg('m08_pedal', 'll_fr', 'll_mr', 'pedal', 'c_can', '> 0');
inState('inv_drive', 'st_Drive', 'm08_pedal');
msg('m09_pld', 'll_mr', 'll_engine', 'injection', 'c_x2_harness', 'PLD');
msg('m10_status', 'll_mr', 'll_fr', 'engineStatus', 'c_can', 'rpm, ect, dtc');
msg('m11_ebreq', 'll_fr', 'll_mr', 'ebReq', 'c_can', 'true');
inState('inv_brake', 'st_EngineBrake', 'm11_ebreq');
msg('m12_pv_on', 'll_mr', 'll_engine', 'pv', 'c_x2_harness', 'on');
inState('inv_running', 'st_Running', 'm12_pv_on');
msg('m13_kl15_off', 'll_ignition', 'll_mr', 'kl15', 'c_kl15', 'false');
inState('inv_stopping', 'st_Stopping', 'm13_kl15_off');
apply(buildAddInteractionConstraintCommand(state.repository, { interactionId: INT, id: 'tc_selftest', kind: 'time', fromMessageId: 'm01_kl15_on', expression: 'Init_SelfTest: after 0.7 s -> ImmoCheck' }));
apply(buildAddInteractionConstraintCommand(state.repository, { interactionId: INT, id: 'dc_startfuel', kind: 'duration', fromMessageId: 'm05_start_qty', toMessageId: 'm06_rpm', expression: '<= 4 s (Crank_StartFuel timeout)' }));

// ------------------------------------------------------------------- BDDs
const bdd = (id: string, name: string, rows: string[][], colW = 290, rowGap = 90) => {
  createDiagram(id, name, 'bdd');
  const coordinates: Record<string, PresentationCoordinates> = {};
  let y = 40;
  for (const row of rows) {
    const heights = row.map(def => {
      const d = repo.definitions[def] as BlockDefinition | undefined;
      // Properties and operations are compartments; ports sit on the border.
      return d?.kind === 'block' ? Math.max(110, 70 + 13 * (d.properties.length + d.operations.length), 40 + 16 * d.ports.length) : 110;
    });
    row.forEach((def, i) => { coordinates[def] = { x: 40 + i * colW, y, width: 250, height: heights[i] }; });
    y += Math.max(...heights) + rowGap;
  }
  run({ type: 'addToDiagram', diagramId: id, elementIds: Object.keys(coordinates), coordinates }, id);
};
const idsOf = (prefix: string) => Object.keys(repo.definitions).filter(id => id.startsWith(prefix));
bdd('bdd_context', 'BDD 1 - System context', [[SYS], ['blk_VehicleBattery', 'blk_IgnitionSwitch', 'blk_FR_DriveController', ECU, ENG, 'blk_DiagnosticTester']]);
bdd('bdd_ecu', 'BDD 2 - MR-PLD ECU', [[ECU], ['blk_PowerSupplyUnit', 'blk_MainMCU', 'blk_FlashMemory', 'blk_ConfigEEPROM', 'blk_CoProcessor'],
  ['blk_TimingLogic', 'blk_SensorConditioning', 'blk_CommInterface', 'blk_InjectionPowerStage', 'blk_AuxDrivers'],
  ['blk_HighSideFET', 'blk_MosfetSwitch', 'blk_LowSideFET']]);
bdd('bdd_engine', 'BDD 3 - OM 501 LA engine', [[ENG], ['blk_CKP_Sensor', 'blk_CMP_Sensor', 'blk_AnalogSensor', 'blk_UnitPump'], ['blk_StarterMotor', 'blk_ProportionalValve', 'blk_FanClutch']]);
bdd('bdd_interfaces', 'BDD 4 - Items, interfaces and signals', [
  idsOf('item_').slice(0, 5), idsOf('item_').slice(5), idsOf('if_').slice(0, 6), idsOf('if_').slice(6), idsOf('sig_').slice(0, 5), idsOf('sig_').slice(5),
]);
bdd('bdd_types', 'BDD 5 - Value types and units', [
  valueTypes.slice(0, 7).map(([id]) => id), valueTypes.slice(7).map(([id]) => id),
  units.slice(0, 5).map(([id]) => id), units.slice(5).map(([id]) => id),
  quantityKinds.slice(0, 5).map(([id]) => id), quantityKinds.slice(5).map(([id]) => id),
], 260, 50);

// ---------------------------------------------------------------- verify
const findings = [
  ...validateSysmlRepository(state.repository, stateContext).diagnostics,
  ...[SYS, ECU, ENG, 'blk_InjectionPowerStage'].flatMap(context => deriveIbdView(state.repository, context).diagnostics),
  ...deriveBddView(state.repository).diagnostics,
];
if (findings.length > 0) {
  throw new Error(`The app's validators report ${findings.length} finding(s):\n${findings.map(d => `${d.severity} ${d.code} ${d.elementId}: ${d.message}`).join('\n')}`);
}
for (const diagramId of Object.keys(state.repository.diagrams)) {
  const view = getCachedLegacyView(state.store!, diagramId);
  console.log(`${diagramId}: ${view.blocks.length} elements, ${view.relationships.length} relationships, ${view.parts.length} parts, ${view.connectors.length} connectors`);
}

// ------------------------------------------------------------------- save
const saved = serializeSysmlProjectState(state.repository, state.diagramPresentations ?? {}, state.coordinates);
const tabs = ['bdd_context', 'ibd_system', 'ibd_ecu', 'sd_engine_start', 'bdd_ecu', 'bdd_engine', 'bdd_interfaces', 'bdd_types', 'ibd_engine', 'ibd_pstage']
  .map(diagramId => ({ kind: 'sysmlDiagram', diagramId }));
const payload = createUnifiedProjectPayload({
  ...behaviour,
  version: behaviour.version,
  projectName: behaviour.projectName,
  openTabs: ['statemachine', 'bdd', 'ibd', 'hmi'],
  diagramWorkspace: { tabs, activeTab: tabs[0] },
  activeSysmlDiagramId: 'bdd_context',
  diagramNavigationStack: [],
  blocks: [], relationships: [], parts: [], connectors: [],
  sysmlRepository: saved.sysmlRepository,
  sysmlCoordinates: saved.sysmlCoordinates,
  diagramPresentations: saved.diagramPresentations,
}, () => new Date('2026-10-15T00:00:00Z'));
writeFileSync(resolve(ROOT, 'MR_PLD_ECU.adia'), `${JSON.stringify(payload, null, 2)}\n`);
console.log('wrote MR_PLD_ECU.adia');
