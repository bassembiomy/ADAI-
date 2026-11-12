/**
 * Build TRUCK_v2.adia: the truck model (TRUCK.adia, saved by ADIA) extended with the engine controller (MCM) in
 * detail, from the user's documents D-Motor-ECU-SWRS-001 v3.0 (software) and the MR-PLD U1-U4 Memory and CAN
 * Specification (hardware). In those documents the MR is the truck's MCM and the FR is its CPC.
 *
 *   HW package   the MR-PLD hardware blocks already modelled in ADIA (MR_PLD_A5414465340.adia: ECU, its five
 *                subcircuits and their components, sensors, loads, port definitions, value types, equations),
 *                brought in unchanged with one createElement each (what the editor's paste does), sensors and
 *                loads in their own packages, the HW requirements and the HW views
 *   SW package   the layered software architecture of SWRS §14 (application components, runtime interface,
 *                services, ECU abstraction, MCAL, bootloader) allocated to the hardware, the ECU events and CAN
 *                messages, the SW requirements (SWR, response times, CAN messages, DTCs, diagnostic services,
 *                architecture and resources) and the SW views
 *   MCM          context of the engine control: the ECU, its sensors, loads and software, wired as in the harness,
 *                each connection carrying an item flow with its signal, timing and fault reaction; the MR state
 *                machine is the project's executable behaviour
 *
 * The build fails unless the app's validators report nothing new.
 * Run: npx tsx scripts/build_truck_v2_adia.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSysmlGatewayState, executeSysmlCommand, loadCanonicalSysmlProject, type SysmlEditorCommand, type SysmlElement, type SysmlGatewayState,
} from '../src/services/sysmlCommandGateway';
import { buildCreatePathIbdConnectorCommand } from '../src/services/sysmlIbdConnectorCommands';
import { buildRelationshipUpdateCommand } from '../src/services/sysmlPropertyCommands';
import { buildCreateAllocationCommand } from '../src/services/sysmlAllocationCommands';
import {
  createBlock, createDiagramDefinition, createPackage, createRequirement, createSignal,
} from '../src/features/modelExplorer/adapters/modelExplorerFactories';
import { computeBlockDisplayBounds } from '../src/components/sysml/blockLayout';
import type { BlockDefinition, PortDefinition, PropertyDefinition, SysmlRepository } from '../src/engine/sysml/model';
import { serializeSysmlProjectState } from '../src/engine/sysml/persistence';
import { getCachedLegacyView } from '../src/engine/sysml/normalizedStore';
import { validateSysmlRepository } from '../src/engine/sysml/validation';
import { deriveIbdView } from '../src/engine/sysml/ibd';
import { deriveBddView } from '../src/engine/sysml/bdd';
import { projectStateEndpoints } from '../src/engine/sysml/workers/projectIoPayload';
import { createUnifiedProjectPayload } from '../src/utils/adiaProjectPersistence';
import { createAppSimulationSession } from '../src/utils/stateMachine/smAppAdapter';
import type { PresentationCoordinates } from '../src/engine/sysml/presentationState';
import * as DOC from './truck_v2_requirements';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'TRUCK_v2.adia');
const truck = JSON.parse(readFileSync(resolve(ROOT, 'TRUCK.adia'), 'utf8'));
const mrProject = JSON.parse(readFileSync(resolve(ROOT, 'MR_PLD_A5414465340.adia'), 'utf8'));
const MR: SysmlRepository = loadCanonicalSysmlProject(mrProject, { externalEndpoints: projectStateEndpoints(mrProject.states) }).repository;
const mrPresentations = mrProject.diagramPresentations as Record<string, { presentations: Record<string, { bounds?: PresentationCoordinates }> }>;

// the MR state machine becomes the project's executable behaviour (the operation of the MCM software)
const behaviour = {
  states: mrProject.states, junctions: mrProject.junctions, transitions: mrProject.transitions, variables: mrProject.variables,
  layers: mrProject.layers, hmiComponents: mrProject.hmiComponents, tickMs: mrProject.tickMs, safetyMode: mrProject.safetyMode,
};
createAppSimulationSession({ ...truck, ...behaviour } as never); // throws unless the state machine passes the app's rules
const stateContext = { externalEndpoints: projectStateEndpoints(behaviour.states) };

const loaded = loadCanonicalSysmlProject(truck, stateContext);
if (!loaded.valid) throw new Error('TRUCK.adia does not load');
let state: SysmlGatewayState = createSysmlGatewayState(loaded.repository, loaded.coordinates, loaded.diagramPresentations, undefined, stateContext);
const run = (command: SysmlEditorCommand, diagramId?: string) => {
  const result = executeSysmlCommand(state, command, diagramId, stateContext);
  if (!result.committed) throw new Error(`${command.type} rejected: ${JSON.stringify(result.diagnostics.slice(0, 3))}`);
  state = { ...state, ...result } as SysmlGatewayState;
};
const create = (element: SysmlElement) => run({ type: 'createElement', element });
const update = (elementId: string, patch: Record<string, unknown>) => run({ type: 'updateElement', elementId, patch });
const R = () => state.repository;
const box = (x: number, y: number, width = 220, height = 120): PresentationCoordinates => ({ x, y, width, height });
const tabs: string[] = [];

// ------------------------------------------------------------- truck blocks
const blockNamed = (name: string) => {
  const found = Object.values(R().definitions).filter(d => d.kind === 'block' && d.name.trim() === name);
  if (found.length !== 1) throw new Error(`TRUCK.adia has ${found.length} blocks named "${name}"`);
  return found[0].id;
};
const MCM = blockNamed('MCM');
const CPC = blockNamed('CPC padels=FR');
const TCM = blockNamed('TCM power shifts');
const POWER_TRAIN = blockNamed('power train');
const MODEL = 'model';
const USER_PACKAGE = R().definitions[MCM].ownerId!;
const TRUCK_REQS = 'pkg-truck-requirements';

// ----------------------------------------------------------------- packages
const pkg = (id: string, name: string, ownerId: string, stereotype?: 'modelLibrary') => create(createPackage({ id, name, ownerId, stereotype }));
const P = { hw: 'pkg-hw', sw: 'pkg-sw', hwReq: 'pkg-hw-req', swReq: 'pkg-sw-req', sensors: 'pkg-hw-sensors', loads: 'pkg-hw-loads', swArch: 'pkg-sw-arch', can: 'pkg-sw-can' };
pkg(P.hw, 'HW', MODEL);
pkg(P.sw, 'SW', MODEL);
// the MR-PLD packages keep their ids, so the hardware brought in lands in them
pkg('pkg_HardwareStructure', 'HW 01 ECU hardware (MR-PLD)', P.hw);
pkg(P.sensors, 'HW 02 Sensors', P.hw);
pkg(P.loads, 'HW 03 Loads (actuators)', P.hw);
pkg('pkg_Interfaces', 'HW 04 Interfaces (port definitions)', P.hw);
pkg('pkg_Parametrics', 'HW 05 Circuit equations', P.hw);
pkg('pkg_Types', 'HW 06 ECU value types and units', P.hw, 'modelLibrary');
pkg('pkg_Identification', 'HW 07 Identification', P.hw);
pkg(P.hwReq, 'HW Requirements', P.hw);
pkg(P.swArch, 'SW 01 Architecture', P.sw);
pkg('pkg_Signals', 'SW 02 ECU events and signals', P.sw);
pkg(P.can, 'SW 03 CAN messages', P.sw);
pkg('pkg_AnalysisAndSimulation', 'SW 04 Calculations', P.sw);
pkg(P.swReq, 'SW Requirements', P.sw);
pkg('pkg_Requirements', 'MCM (MR-PLD) system requirements', TRUCK_REQS);

// ------------------------------------- MR-PLD hardware, as modelled in ADIA
// FR_CabECU is the truck's CPC and OM501LA_EngineSystem its MCM context; the variant / analysis / parametric
// contexts belong to the MR analysis, not to the truck.
const EXCLUDED = new Set(['blk_FR_CabECU', 'blk_OM501LA_EngineSystem', 'blk_EngineConfiguration', 'blk_SimulationScenario', 'blk_SensorChainContext']);
const BROUGHT_KINDS = ['quantityKind', 'unit', 'valueType', 'enumeration', 'signal', 'interface', 'constraintBlock', 'block'];
const mrDefinitions = Object.values(MR.definitions)
  .filter(d => BROUGHT_KINDS.includes(d.kind) && !EXCLUDED.has(d.id))
  .sort((a, b) => BROUGHT_KINDS.indexOf(a.kind) - BROUGHT_KINDS.indexOf(b.kind));
// blocks after the blocks their generalizations and parts refer to
const ordered: typeof mrDefinitions = [];
const placed = new Set<string>();
const visit = (id: string) => {
  if (placed.has(id)) return;
  const def = MR.definitions[id];
  if (!def || EXCLUDED.has(id) || !BROUGHT_KINDS.includes(def.kind)) return;
  placed.add(id);
  if (def.kind === 'block') {
    for (const r of Object.values(MR.relationships)) if (r.kind === 'generalization' && r.sourceId === id) visit(r.targetId);
    for (const p of (def as BlockDefinition).properties) visit(p.typeId);
  }
  ordered.push(def);
};
for (const def of mrDefinitions) if (def.kind !== 'block') visit(def.id);
for (const def of mrDefinitions) visit(def.id);
// a type the truck model already has under the same name is used instead of a second copy (the app refuses
// duplicate qualified names); references to the MR copy are pointed at it
const SAME: Record<string, string> = {};
for (const def of ordered) {
  const existing = Object.values(R().definitions).find(d => d.kind === def.kind && d.name === def.name);
  if (existing) SAME[def.id] = existing.id;
}
const remap = <T,>(element: T): T => {
  let json = JSON.stringify(element);
  for (const [from, to] of Object.entries(SAME)) json = json.split(`"${from}"`).join(`"${to}"`);
  return JSON.parse(json) as T;
};
for (const def of ordered) {
  if (SAME[def.id]) continue;
  const element = remap(structuredClone(def));
  if (element.kind !== 'block') { create(element as SysmlElement); continue; }
  // as the editor does: the block, then its generalization, then the redefinitions of inherited values
  const block = element as BlockDefinition;
  create({ ...block, properties: block.properties.map(({ redefinesId: _r, ...p }) => p) } as SysmlElement);
  for (const r of Object.values(MR.relationships)) {
    if (r.kind === 'generalization' && r.sourceId === def.id && R().definitions[r.targetId]) create(remap(structuredClone(r)) as SysmlElement);
  }
  if (block.properties.some(p => p.redefinesId)) update(block.id, { properties: block.properties });
}
for (const r of Object.values(MR.relationships)) {
  if (r.kind === 'composition' && R().definitions[r.sourceId] && R().definitions[r.targetId] && !R().relationships[r.id]) create(structuredClone(r) as SysmlElement);
}
// the ECU's internal connectors (the on-board wiring between its subcircuits)
for (const c of Object.values(MR.connectors).filter(c => c.ownerId === 'blk_MR_PLD_ECU')) create(remap(structuredClone(c)) as SysmlElement);
// the MR system requirements (REQ-xxx) the documents trace to, their containment, derivations and satisfactions
const mrReqs = Object.values(MR.requirements);
for (const q of mrReqs.filter(q => !MR.requirements[q.ownerId ?? ''])) create(structuredClone(q) as SysmlElement);
for (const q of mrReqs.filter(q => MR.requirements[q.ownerId ?? ''])) create(structuredClone(q) as SysmlElement);
for (const r of Object.values(MR.relationships)) {
  if (!['requirementContainment', 'deriveReqt', 'satisfy'].includes(r.kind)) continue;
  const known = (id: string) => R().requirements[id] || (R().definitions[id] && !EXCLUDED.has(id));
  if (known(r.sourceId) && known(r.targetId)) create(structuredClone(r) as SysmlElement);
}
// sensors and loads in their own packages (the model tree's move)
const SENSORS = ['blk_EngineSensor', 'blk_VRSensor', 'blk_NTCSensor', 'blk_RatiometricPressureSensor', 'blk_ThermalOilLevelSensor', 'blk_OnboardBaroSensor'];
const LOADS = ['blk_UnitPump', 'blk_ProportionalValve', 'blk_StarterRelay'];
run({ type: 'moveElements', elementIds: SENSORS, targetOwnerId: P.sensors });
run({ type: 'moveElements', elementIds: LOADS, targetOwnerId: P.loads });

// ----------------------------------------------------- new CAN messages
create(createSignal({ id: 'sig_ImmoStatus', name: 'ImmoStatus', ownerId: P.can }));
create(createSignal({ id: 'sig_EngineStatus', name: 'EngineStatus', ownerId: P.can }));
// the MR item defs that are CAN frames are CAN messages
run({ type: 'moveElements', elementIds: ['sig_TorqueRequestFrame', 'sig_ImmoReleaseFrame', 'sig_EngineDataFrame', 'sig_FaultRecord', 'sig_CanFrame'], targetOwnerId: P.can });

// ------------------------------------------------- SW architecture (SWRS §14)
type SwSpec = { id: string; name: string; values?: Array<[string, string]>; ops?: string[]; receptions?: string[] };
const module = (id: string, name: string, task: string, priority: string, owner: string, implementsWhat: string, ops: string[], receptions: string[] = []): SwSpec =>
  ({ id, name, values: [['task', task], ['priority', priority], ['owner', owner], ['implements', implementsWhat]], ops, receptions });
const SW_LAYERS: Array<{ id: string; name: string; role: string; modules: SwSpec[] }> = [
  { id: 'sw-layer-app', name: 'ApplicationLayer', role: 'appLayer', modules: [
    module('sw-modemgr', 'SWC_ModeMgr', 'TASK_10ms', 'P1', 'MBD', 'MR_PLD_ECU_OperatingStates (9 states, 31 transitions)', ['runOperatingStates()', 'setInjEnable()', 'requestTorqueLimit()'],
      ['KL15_On', 'KL15_Off', 'KL50_CrankRequest', 'BlockStartButton', 'BlockStopButton', 'SelfTestPassed', 'ImmoRejected', 'SyncLocked', 'SyncLost', 'EngineRunning',
        'EngineStopped', 'AfterrunComplete', 'OvertempDetected', 'OvertempCleared', 'BankShortDetected', 'CanTimeout', 'CanRestored', 'EngineBrakeRequest', 'EngineBrakeRelease']),
    module('sw-syncsup', 'SWC_SyncSup', 'TASK_10ms + AngleClock', 'P1', 'MBD', 'SAK_C167CS_LM_SyncSupervisor (BOTH / CMP_ONLY / CKP_ONLY / NONE)', ['evaluateSync()', 'raiseSyncLost()', 'raiseSyncLocked()'],
      ['VrToothPulse', 'CkpLost', 'CkpRestored', 'CmpLost']),
    module('sw-injtiming', 'SWC_InjTiming', 'ISR_SOI / EOI, TASK_Segment', 'P1', 'MBD + Embedded', 'SAK_C167CS_LM_InjectionTiming (1-4-2-5-3-6, 120°)', ['scheduleSoi()', 'scheduleEoi()', 'selectCylinder()']),
    module('sw-quantity', 'SWC_Quantity', 'TASK_Segment', 'P1', 'MBD', 'q = min(22 + 1.6·pedal, 55 + 65·(p_boost − 1)) × limit / 100 ≤ 185 mg/stroke', ['computeQuantity()', 'smokeLimit()', 'computeSoiAngle()']),
    module('sw-speedmon', 'SWC_SpeedMon', 'TASK_10ms', 'P1', 'MBD', 'SAK_C167CS_LM_SpeedMonitor (running > 500 rpm, stopped < 300 rpm)', ['detectEngineRunning()', 'detectEngineStopped()']),
    module('sw-speedgov', 'SWC_SpeedGov', 'TASK_10ms', 'P1', 'MBD', 'idle governor, 1800 rpm limp limit', ['governIdle()', 'limitSpeed()']),
    module('sw-immo', 'SWC_Immo', 'TASK_10ms', 'P1', 'MBD', 'REQ-SEC-06: authorisation code against the 93C86 pairing data', ['checkAuthorisation()', 'lockImmobiliser()'], ['ImmoReleaseFrame']),
    module('sw-thermal', 'SWC_Thermal', 'TASK_100ms', 'P2', 'MBD', 'ValveAndStarterDrivers_ThermalFanControl (duty = (T − 92) × 12.5 %)', ['computeFanDuty()', 'applyThermalDerate()']),
    module('sw-sensdiag', 'SWC_SensDiag', 'TASK_100ms (per channel rate)', 'P2', 'MBD', 'SensorAFE_SensorDiagnostics (NORMAL / OPEN / SCG / SCB / DRIFT)', ['classifyChannel()', 'applySubstitute()']),
    module('sw-engbrake', 'SWC_EngBrake', 'TASK_10ms', 'P2', 'MBD', 'REQ-BRK-13: PV1 + PV2 with injection cut', ['engageEngineBrake()', 'releaseEngineBrake()']),
    module('sw-starter', 'SWC_StarterCtl', 'TASK_10ms', 'P1', 'MBD', 'start sequence: starter < 300 rpm, immobiliser OK, U4 interlock', ['starterOn()', 'starterOff()']),
    module('sw-afterrun', 'SWC_AfterRun', 'TASK_10ms', 'P2', 'MBD', 'REQ-AFT-18: power latch and storage', ['holdPowerLatch()', 'storeNvmData()', 'releaseLatch()']),
    module('sw-variant', 'SWC_Variant', 'init', 'P3', 'MBD', 'REQ-VAR-16: V6 / V8 coding', ['readVariantCoding()']),
  ] },
  { id: 'sw-layer-rte', name: 'RuntimeInterface', role: 'rte', modules: [] },
  { id: 'sw-layer-services', name: 'ServicesLayer', role: 'services', modules: [
    module('sw-os', 'OS', 'all', 'P1', 'Embedded', 'static OSEK/VDX tasks and ISRs, fixed priorities, no dynamic memory', ['activateTask()', 'monitorDeadlines()']),
    module('sw-com', 'COM', 'TASK_10ms / 100ms / 1s', 'P1', 'Embedded', 'J1939 packing, cyclic Tx, Rx supervision, counter / CRC (SAK_C167CS_LM_CanTimeout)', ['packMessage()', 'superviseReception()'],
      ['TorqueRequestFrame', 'ImmoReleaseFrame', 'CanFrame']),
    module('sw-dcm', 'DCM', 'TASK_Bg', 'P2', 'Embedded', 'KWP2000 services and sessions over the K-line', ['handleRequest()', 'securityAccess()']),
    module('sw-dem', 'DEM', 'TASK_100ms', 'P2', 'Embedded', 'DTC debouncing, status, MR code + SPN / FMI + severity, freeze frames', ['reportEvent()', 'storeFreezeFrame()'], ['FaultRecord']),
    module('sw-nvm', 'NvM', 'TASK_Bg', 'P2', 'Embedded', 'EEPROM blocks (pairing, adaptation, DTCs) with CRC and redundant copy', ['readAll()', 'writeAll()']),
    module('sw-wdgm', 'WdgM', 'TASK_10ms', 'P1', 'Embedded', 'alive and deadline supervision, trigger to U4', ['checkpoint()', 'triggerWatchdog()']),
    module('sw-ecum', 'EcuM', 'start-up / shut-down', 'P1', 'Embedded', 'BSW mode / ECU state: start-up, latch, reset', ['startup()', 'shutdown()']),
  ] },
  { id: 'sw-layer-ecuab', name: 'EcuAbstractionLayer', role: 'ecuAbstraction', modules: [
    module('sw-iohwab', 'IoHwAb', 'TASK_10ms / 100ms / 1s', 'P2', 'Embedded', 'raw ADC → engineering units (I/O list)', ['readSensor()', 'scale()']),
    module('sw-angleclock', 'AngleClock', 'ISR_CKP / ISR_CMP', 'P1', 'Embedded', 'tooth decoding, gap detection, angle-time conversion', ['decodeTooth()', 'angleToTime()']),
    module('sw-injdrv', 'InjDrv', 'ISR_SOI / EOI, ISR_Trip', 'P1', 'Embedded', 'SOI / EOI / CYL_SEL to U3, trip flags, CYL_CUTOFF (PLD_C1_1_InjectionMicroCycle)', ['startInjection()', 'endInjection()', 'readTripFlags()'],
      ['BipDetected', 'OvercurrentTrip', 'PeakCurrentReached']),
    module('sw-outdrv', 'OutputDrv', 'TASK_10ms / 100ms', 'P1', 'Embedded', 'PV1–PV4, starter, valve supply, power latch', ['setOutput()', 'setPwm()']),
    module('sw-eepdrv', 'EepromDrv', 'TASK_Bg', 'P2', 'Embedded', 'M93C86 Microwire driver', ['readWord()', 'writeWord()']),
    module('sw-u4if', 'U4If', 'TASK_10ms', 'P1', 'Embedded', 'U4 digital inputs and watchdog link (D04)', ['exchangeFrame()', 'readInputs()']),
  ] },
  { id: 'sw-layer-mcal', name: 'MCAL', role: 'mcal', modules: [
    module('sw-mcal-adc', 'Adc', 'TASK_10ms', 'P1', 'Embedded', 'AN0–AN8, 10-bit', ['startScan()']),
    module('sw-mcal-capcom', 'Capcom', 'ISR', 'P1', 'Embedded', 'CC0 / CC1 capture, SOI / EOI compare, PWM', ['capture()', 'compare()']),
    module('sw-mcal-can', 'Can', 'ISR / TASK_10ms', 'P1', 'Embedded', 'CAN module 1 (IES-CAN), 29-bit identifiers', ['transmit()', 'receive()']),
    module('sw-mcal-asc0', 'Asc0', 'ISR', 'P2', 'Embedded', 'UART 8N1 for the K-line', ['send()', 'receive()']),
    module('sw-mcal-ssc', 'Ssc', 'TASK_10ms', 'P1', 'Embedded', 'SPI to U4, Microwire to U5', ['transfer()']),
    module('sw-mcal-gpio', 'GpioPwm', 'TASK_10ms', 'P1', 'Embedded', 'port pins and PWM', ['writePin()', 'setDuty()']),
    module('sw-mcal-ebc', 'EbcFlash', 'start-up / flashing', 'P1', 'Embedded', 'external bus controller and flash access', ['configureBus()', 'programFlash()']),
    module('sw-mcal-sys', 'ClockWdtInt', 'start-up', 'P1', 'Embedded', 'clock / PLL, internal WDT, interrupt controller', ['initClock()', 'initInterrupts()']),
  ] },
  { id: 'sw-bootloader', name: 'Bootloader', role: 'bootloader', modules: [] },
];
const SW_TOP = 'sw-mr-software';
const swBlock = (spec: SwSpec) => {
  create(createBlock({ id: spec.id, name: spec.name, ownerId: P.swArch }));
  for (const [name] of spec.values ?? []) {
    run({ type: 'createOwnedFeature', intent: { featureKind: 'property', ownerBlockId: spec.id, propertyKind: 'value', typeId: 'vt-string', name, featureId: `${spec.id}::${name}` } });
  }
  if (spec.values?.length) {
    const values = Object.fromEntries(spec.values.map(([name, value]) => [`${spec.id}::${name}`, value]));
    update(spec.id, { properties: (R().definitions[spec.id] as BlockDefinition).properties.map((p): PropertyDefinition => values[p.id] !== undefined ? { ...p, defaultValue: values[p.id] } : p) });
  }
  if (spec.ops?.length) update(spec.id, { operations: spec.ops });
  if (spec.receptions?.length) update(spec.id, { receptions: spec.receptions.map(s => { const id = `sig_${s}`; if (!R().definitions[id]) throw new Error(`no signal ${s}`); return id; }) });
};
const compose = (whole: string, part: string, role: string, multiplicity = '1', kind: 'part' | 'reference' = 'part') => {
  run({ type: 'createOwnedFeature', intent: { featureKind: 'property', ownerBlockId: whole, propertyKind: kind, typeId: part, name: role, featureId: `prop-${whole}-${role}`.toLowerCase() } });
  if (multiplicity !== '1') {
    const [lower, upper] = multiplicity.split('..').map(Number);
    update(whole, { properties: (R().definitions[whole] as BlockDefinition).properties.map(p => p.id === `prop-${whole}-${role}`.toLowerCase()
      ? { ...p, multiplicity: { lower: upper === undefined ? lower : lower, upper: upper ?? lower, ordered: false, unique: true } } : p) });
  }
  if (kind === 'reference') return;
  const id = `comp-${whole}-${part}`.toLowerCase();
  if (R().relationships[id]) return;
  create({ id, sourceId: whole, targetId: part, kind: 'composition', name: '', sourceFamily: 'block', targetFamily: 'block' } as SysmlElement);
  const plan = buildRelationshipUpdateCommand(R(), id, { sourceMultiplicity: '1', sourceAggregation: 'composite', targetRole: role, targetMultiplicity: multiplicity });
  if (!plan.ok) throw new Error(plan.diagnostic.message);
  run(plan.command);
};
swBlock({ id: SW_TOP, name: 'MCM_Software (MR-PLD)', values: [['target', 'U1 SAK-C167CS-LM, 16-bit, no FPU'], ['language', 'C (MISRA C:2012), fixed point, generated from Simulink / Stateflow'],
  ['os', 'OSEK/VDX static schedule'], ['codeArea', '0x04000–0x5FFFF (368 KB)'], ['dataSet', '0x60000–0x7FEFF (128 KB)'], ['document', 'D-Motor-ECU-SWRS-001 v3.0']] });
for (const layer of SW_LAYERS) {
  swBlock({ id: layer.id, name: layer.name, ...(layer.id === 'sw-layer-rte' ? { ops: ['readSignal()', 'writeSignal()'], values: [['rule', 'typed signals, static buffers, no direct HW access (AR-01)']] } : {}),
    ...(layer.id === 'sw-bootloader' ? { ops: ['checkFlashChecksum()', 'bootstrapLoad()', 'jumpToApplication()'], values: [['address', '0x00000–0x03FFF'], ['checksum', '0x7FF00–0x7FFFF']] } : {}) });
  for (const m of layer.modules) swBlock(m);
  compose(SW_TOP, layer.id, layer.role);
  for (const m of layer.modules) compose(layer.id, m.id, m.name.replace(/^SWC_/, '').replace(/^./, c => c.toLowerCase()));
}
// SW → HW allocation: every layer runs on U1; the modules tied to another device are allocated to it too
const ALLOCATIONS: Array<[string, string]> = [
  [SW_TOP, 'blk_MR_PLD_ECU'], ...SW_LAYERS.filter(l => l.id !== 'sw-bootloader').map(l => [l.id, 'blk_SAK_C167CS_LM'] as [string, string]),
  ['sw-bootloader', 'blk_AM29F400BB'], ['sw-mcal-ebc', 'blk_AM29F400BB'], ['sw-injdrv', 'blk_PLD_C1_1'], ['sw-u4if', 'blk_TEMIC_845AW'], ['sw-wdgm', 'blk_TEMIC_845AW'],
  ['sw-nvm', 'blk_M93C86'], ['sw-eepdrv', 'blk_M93C86'], ['sw-mcal-can', 'blk_CanTransceiver'], ['sw-mcal-asc0', 'blk_L9637D'], ['sw-mcal-adc', 'blk_SensorAFE'],
  ['sw-angleclock', 'blk_LM2903D'],
];
for (const [sw, hw] of ALLOCATIONS) run(buildCreateAllocationCommand(R(), sw, hw));

// ---------------------------------------------- MCM: ECU, sensors, loads, SW
// the parts of the MR engine-system context, now owned by the MCM (without the FR, which is the CPC)
const mrSystem = MR.definitions.blk_OM501LA_EngineSystem as BlockDefinition;
const MCM_ROLES = mrSystem.properties.filter(p => p.kind === 'part' && p.name !== 'fr');
const mcmProp = (name: string) => `prop-${MCM}-${name}`.toLowerCase();
for (const p of MCM_ROLES) {
  const reference = p.name === 'battery' || p.name === 'tester'; // the vehicle battery and the workshop tester are not part of the MCM
  compose(MCM, p.typeId, p.name, p.multiplicity.upper === 1 ? '1' : `${p.multiplicity.lower}..${p.multiplicity.upper}`, reference ? 'reference' : 'part');
}
compose(MCM, SW_TOP, 'sw');
// ports: IES-CAN (the drivetrain CAN) is the CanPort of the ECU pins; KL.15 / KL.50 come from the CPC (the FR)
const retype = (block: string) => {
  const def = R().definitions[block] as BlockDefinition;
  return { type: 'updateElement', elementId: block, patch: { ports: def.ports.map((p): PortDefinition => p.typeId === 'if-drivetrain-can' ? { ...p, typeId: 'if_CanPort' } : p) } } as SysmlEditorCommand;
};
run({ type: 'batch', commands: [retype(MCM), retype(CPC), retype(TCM)] } as SysmlEditorCommand);
const portIdOf = (block: string, name: string) => {
  const found = (R().definitions[block] as BlockDefinition).ports.find(p => p.name === name);
  if (!found) throw new Error(`${R().definitions[block].name} has no port ${name}`);
  return found.id;
};
const addPort = (block: string, id: string, name: string, typeId: string, conjugated: boolean) => {
  run({ type: 'createOwnedFeature', intent: { featureKind: 'port', ownerBlockId: block, portKind: 'proxyPort', typeId, name, featureId: id } });
  update(block, { ports: (R().definitions[block] as BlockDefinition).ports.map(p => p.id === id ? { ...p, direction: 'out', isConjugated: conjugated } : p) });
};
addPort(MCM, 'port-mcm-kl15', 'kl15', 'if_DigitalInputPort', true);
addPort(MCM, 'port-mcm-kl50', 'kl50', 'if_DigitalInputPort', true);
addPort(CPC, 'port-cpc-kl15', 'kl15', 'if_DigitalInputPort', false);
addPort(CPC, 'port-cpc-kl50', 'kl50', 'if_DigitalInputPort', false);
// the messages each controller receives (reception compartment of the block inspector)
update(MCM, { receptions: ['sig_TorqueRequestFrame', 'sig_ImmoReleaseFrame', 'sig_KL15_On', 'sig_KL15_Off', 'sig_KL50_CrankRequest', 'sig_EngineBrakeRequest', 'sig_EngineBrakeRelease'] });
update(CPC, { receptions: ['sig_EngineDataFrame', 'sig_FaultRecord', 'sig_ImmoStatus', 'sig_EngineStatus'] });
// the interface the drivetrain CAN ports used before is no longer used
run({ type: 'deleteElements', elementIds: ['if-drivetrain-can'] } as SysmlEditorCommand);

// ------------------------------------------------------------ connections
type End = { path: string[]; portId?: string };
const effective = (end: End, context: string) => {
  let type = context;
  for (const prop of end.path) type = ((R().definitions[type] as BlockDefinition).properties.find(p => p.id === prop) ?? { typeId: '' }).typeId;
  const port = (R().definitions[type] as BlockDefinition | undefined)?.ports.find(p => p.id === end.portId);
  if (!port) return { dir: 'inout', typeId: '' };
  const dir = port.isConjugated ? (port.direction === 'in' ? 'out' : port.direction === 'out' ? 'in' : 'inout') : port.direction;
  return { dir, typeId: port.typeId };
};
/** A connector of the IBD; with an item flow when `item` names the data, its timing and its fault reaction. */
const connect = (context: string, diagramId: string, id: string, a: End, b: End, item?: string) => {
  // the item flows from the end that sends
  const [source, target] = effective(a, context).dir === 'in' && effective(b, context).dir !== 'in' ? [b, a] : [a, b];
  const conveyed = item ? effective(source, context).typeId || effective(target, context).typeId : undefined;
  const plan = buildCreatePathIbdConnectorCommand(R(), { contextId: context, diagramId, connectorId: id, source, target, ...(conveyed ? { itemFlowId: conveyed } : {}) });
  if (!plan.ok || !plan.command || !plan.connector) throw new Error(`connector ${id} refused: ${JSON.stringify(plan.diagnostics)}`);
  run({ type: 'createAndPresent', diagramId, element: item ? { ...plan.connector, itemProperty: item } : plan.connector, presentation: {} } as SysmlEditorCommand, diagramId);
};
/** Signal, timing and fault reaction of every harness connection (SWRS §10 / §11, SPEC §11). */
const HARNESS_ITEMS: Record<string, string> = {
  b15_ckp: 'n_Ckp : X2-19/2 → LM2903D → CC0, 36 + 1 teeth, ≤ 1.4 kHz at 2300 rpm, ISR ≤ 20 µs (RT-02); missing ref / extra teeth → CkpLost, DTC 0110–0112, CMP-only limp',
  b16_cmp: 'n_Cmp : X2-20/1 → CC1, 12 + 1 teeth, ≤ 230 Hz; missing sync tooth → CmpLost, DTC 0113; both lost → DTC 0114, injection inhibited ≤ 1 firing interval (RT-05)',
  b111_boost: 'p_Boost : X2-29 → AN0, 0.6–3.4 bar abs, 10 ms mean of 4, ≤ 20 ms; outside 0.25–4.75 V 500 ms → DTC 1031, substitute 1.0 bar',
  b111_iat: 'T_Iat : X2-48 → AN1, NTC, 100 ms PT1 1 s; outside 0.18–4.82 V 500 ms → DTC 1032, substitute 40 °C',
  b65_ect: 'T_Ect : X2-34 → AN2, NTC, 100 ms PT1 1 s; fault → DTC 1021, 90 °C + fan 100 %; ≥ 103 °C → derate ≤ 1 s (RT-14)',
  b10_fuel: 'T_Fuel : X2-36 → AN3, NTC, 100 ms PT1 2 s; fault → DTC 1041, substitute 40 °C',
  b110_oilP: 'p_Oil : X2-32 → AN4, 0–5 bar, 10 ms mean of 8; sensor fault → DTC 1051; low 2 s at > 500 rpm → DTC 1052',
  b11_oilT: 'T_Oil : X2-39 → AN5, NTC, 100 ms PT1 2 s; fault → DTC 1061, substitute = coolant',
  b14_oilLvl: 'L_Oil : X2-33 → AN6, heat pulse at init; 18–26 Ω check → DTC 2515 / 2516',
  pv1_decompression: 'pv1 : X2-51 on / off, 10 ms; engine brake ≤ 50 ms (RT-13); open / short → DTC 4011',
  pv2_exhaustBrake: 'pv2 : X2-50 on / off, 10 ms; engine brake ≤ 50 ms (RT-13); open / short → DTC 4012',
  pv3_fanClutch: 'pv3DutyPct : X2-41 PWM, duty = (T − 92) × 12.5 %, 100 ms; safe 100 %; open / short → DTC 4013',
  pv4_aux: 'pv4 : X2-43 on / off, 10 ms; open / short → DTC 4014',
  starter: 'starter : Q_HS4 → X2-18, on ≤ 50 ms after start request (RT-08), off ≤ 50 ms above 500 rpm (RT-09), U4 permission; fault → DTC 4001',
  tester: 'KWP2000 : X1-13 K-line ISO 14230, 10.4 kbit/s, P2 25–50 ms (RT-17)',
};
const UNIT_PUMP_ITEM = (cyl: string, pin: string) =>
  `current : cyl ${cyl}, ${pin}, peak 16 A → BIP → hold 8 A → spill; > 24 A → driver off ≤ 10 µs (RT-06), cylinder cut off, DTC 5${cyl}xx`;
const mapEnd = (end: End): End => ({ ...end, path: end.path.map(seg => seg.startsWith('blk_OM501LA_EngineSystem.') ? mcmProp(seg.slice('blk_OM501LA_EngineSystem.'.length)) : seg) });

// IBD - MCM: the ECU with its sensors, loads and software, laid out as the MR engine-system IBD
const MCM_IBD = 'diag-ibd-mcm';
{
  const mrBounds = mrPresentations.ibd_engine_system.presentations;
  const coordinates: Record<string, PresentationCoordinates> = {};
  for (const [key, value] of Object.entries(mrBounds)) {
    if (!key.startsWith('blk_OM501LA_EngineSystem.') || !value.bounds) continue;
    const [head, ...rest] = key.split('/');
    const role = head.slice('blk_OM501LA_EngineSystem.'.length);
    if (role === 'fr') continue; // the CPC is outside the MCM
    coordinates[[mcmProp(role), ...rest].join('/')] = value.bounds;
  }
  // the software below the ECU
  const ecuBox = coordinates[mcmProp('ecu')];
  coordinates[mcmProp('sw')] = box(ecuBox.x, ecuBox.y + (ecuBox.height ?? 0) + 120, ecuBox.width, 520);
  const right = Math.max(...Object.values(coordinates).map(b => b.x + (b.width ?? 0)));
  const bottom = Math.max(...Object.values(coordinates).map(b => b.y + (b.height ?? 0)));
  run({ type: 'updatePresentation', diagramId: MCM_IBD, elementId: MCM, presentation: box(40, 30, right + 340, bottom + 80) }, MCM_IBD);
  run({ type: 'addToDiagram', diagramId: MCM_IBD, elementIds: Object.keys(coordinates), coordinates }, MCM_IBD);
  for (const c of Object.values(MR.connectors).filter(c => c.ownerId === 'blk_OM501LA_EngineSystem')) {
    const ends = [c.sourceEnd, c.targetEnd] as End[];
    if (ends.some(e => e.path[0] === 'blk_OM501LA_EngineSystem.fr')) continue; // the CPC side, below
    const role = (ends.find(e => e.path[0] !== 'blk_OM501LA_EngineSystem.ecu') ?? ends[0]).path[0].slice('blk_OM501LA_EngineSystem.'.length);
    const pump = /^c_sys_up(\d)_pin_(\d+)$/.exec(c.id);
    const supply = c.id.includes('_pin_06') || c.id.includes('_pin_07') ? `5 V sensor supply ${c.id.slice(-2)} (ratiometric reference)` : undefined;
    const battery = role === 'battery' ? (c.id.endsWith('05') || c.id.endsWith('06') ? 'KL.30 : 24 V (18–32 V), F1 / F2; < 16 V or > 32 V 1 s → DTC 1081' : 'KL.31 : ground') : undefined;
    const item = pump ? UNIT_PUMP_ITEM(pump[1], `X2-${pump[2]}`) : battery ?? (supply && role.startsWith('b1') ? supply : HARNESS_ITEMS[role]);
    connect(MCM, MCM_IBD, c.id.replace('c_sys_', 'c_mcm_'), mapEnd(ends[0]), mapEnd(ends[1]), item);
  }
  // the CPC (FR) reaches the ECU through the MCM's ports
  const ecu = mcmProp('ecu');
  connect(MCM, MCM_IBD, 'c_mcm_can_h', { path: [], portId: portIdOf(MCM, 'drivetrainCAN') }, { path: [ecu], portId: 'blk_MR_PLD_ECU.x1.pin_01' },
    'IES-CAN (X1-1 CAN_H) : 250 kbit/s, 29-bit J1939 — Rx TorqueRequestFrame 20 ms (timeout 200 ms → DTC 2001, limp), ImmoReleaseFrame (2 s → DTC 3001); Tx EEC1 20 ms, ET1 1 s, EFL/P1 500 ms, EngineStatus 100 ms, DM1 1 s, ImmoStatus');
  connect(MCM, MCM_IBD, 'c_mcm_can_l', { path: [], portId: portIdOf(MCM, 'drivetrainCAN') }, { path: [ecu], portId: 'blk_MR_PLD_ECU.x1.pin_02' },
    'IES-CAN (X1-2 CAN_L) : ISO 11898-2, 120 Ω termination; 3 bus-offs in 10 s → DTC 2003');
  connect(MCM, MCM_IBD, 'c_mcm_kl15', { path: [], portId: 'port-mcm-kl15' }, { path: [ecu], portId: 'blk_MR_PLD_ECU.x1.pin_15' },
    'KL.15 : X1-15 24 V via U4, debounce 30 ms, ≤ 60 ms to the mode manager; KL.15 on → ST_READY ≤ 500 ms (RT-07); U1 / U4 disagreement > 50 ms → DTC');
  connect(MCM, MCM_IBD, 'c_mcm_kl50', { path: [], portId: 'port-mcm-kl50' }, { path: [ecu], portId: 'blk_MR_PLD_ECU.x1.pin_08' },
    'KL.50 : X1-8 24 V via U4, debounce 30 ms; → starter on ≤ 50 ms (RT-08); stuck > 30 s → DTC');
}
// IBD - power train: the IES-CAN messages between the CPC (FR) and the MCM (MR), and the KL.15 / KL.50 wires
{
  const d = 'diag-ibd-powertrain';
  // the MCM now shows its ECU, sensors, loads and software inside: room for it, the TCM beside it
  run({ type: 'updatePresentation', diagramId: d, elementId: POWER_TRAIN, presentation: box(40, 40, 2100, 1300) }, d);
  run({ type: 'updatePresentation', diagramId: d, elementId: 'prop-powertrain-mcm', presentation: box(200, 440, 1100, 760) }, d);
  run({ type: 'updatePresentation', diagramId: d, elementId: 'prop-powertrain-tcm', presentation: box(1600, 440, 340, 160) }, d);
  const can = Object.values(R().connectors).find(c => c.ownerId === POWER_TRAIN && [c.sourcePortId, c.targetPortId].some(k => k.includes('prop-powertrain-mcm'))
    && [c.sourcePortId, c.targetPortId].some(k => k.includes('prop-powertrain-cpc')));
  if (!can) throw new Error('no CPC – MCM connector in the power train');
  update(can.id, { itemFlowId: 'if_CanPort', itemProperty: 'IES-CAN messages : CPC → MCM TorqueRequestFrame 0x0CF00331 20 ms (timeout 200 ms), ImmoReleaseFrame 0x18EF0031 event (2 s); MCM → CPC EEC1 0x0CF00400 20 ms, ET1 0x18FEEE00 1 s, EFL/P1 0x18FEEF00 500 ms, EngineStatus 0x18FF0200 100 ms, ImmoStatus 0x18EF3100, DM1 0x18FECA00 1 s, MR fault 0x18FF0100' });
  connect(POWER_TRAIN, d, 'c_pt_kl15', { path: ['prop-powertrain-cpc'], portId: 'port-cpc-kl15' }, { path: ['prop-powertrain-mcm'], portId: 'port-mcm-kl15' },
    'KL.15 ignition : 24 V discrete, debounce 30 ms; → ST_READY ≤ 500 ms (RT-07)');
  connect(POWER_TRAIN, d, 'c_pt_kl50', { path: ['prop-powertrain-cpc'], portId: 'port-cpc-kl50' }, { path: ['prop-powertrain-mcm'], portId: 'port-mcm-kl50' },
    'KL.50 crank request : 24 V discrete, debounce 30 ms; → starter ≤ 50 ms (RT-08)');
}

// ---------------------------------------------------------------- diagrams
const diagram = (id: string, name: string, diagramKind: 'bdd' | 'ibd' | 'requirements' | 'package', ownerId: string, contextElementId?: string) =>
  run({ type: 'createDiagram', diagram: createDiagramDefinition({ id, name, ownerId, diagramKind, contextElementId }) });
/** An MR-PLD diagram again, with its own layout, for the elements now in this model. */
const fromMr = (mrId: string, id: string, name: string, kind: 'bdd' | 'ibd' | 'requirements', ownerId: string, context?: string) => {
  diagram(id, name, kind, ownerId, context);
  const coordinates: Record<string, PresentationCoordinates> = {};
  const elementIds: string[] = [];
  for (const [key, value] of Object.entries(mrPresentations[mrId].presentations)) {
    const head = key.split('/')[0];
    const known = R().definitions[head] || R().requirements[head] || R().connectors[head] || R().relationships[head]
      || Object.values(R().definitions).some(d => d.kind === 'block' && (d as BlockDefinition).properties.some(p => p.id === head));
    if (!known || EXCLUDED.has(head)) continue;
    if (R().relationships[head]) continue; // drawn with their ends
    elementIds.push(key);
    if (value.bounds && !R().connectors[head]) coordinates[key] = value.bounds;
  }
  run({ type: 'addToDiagram', diagramId: id, elementIds, coordinates }, id);
  tabs.push(id);
};
/** Places elements on a BDD row by row with the sizes the canvas draws. */
const placeOnBdd = (diagramId: string, rows: string[][], x0 = 40, y0 = 40, gapX = 90, gapY = 120) => {
  const ids = rows.flat();
  run({ type: 'addToDiagram', diagramId, elementIds: ids, coordinates: Object.fromEntries(ids.map((e, i) => [e, box(x0 + i * 10, y0, 200, 100)])) }, diagramId);
  const drawn = new Map(getCachedLegacyView(state.store!, diagramId).blocks.map(b => [b.id, computeBlockDisplayBounds({ ...b, width: 150, height: 80 })]));
  const size = (e: string) => drawn.get(e) ?? { width: 220, height: 110 };
  let y = y0;
  for (const row of rows) {
    let x = x0;
    for (const e of row) { run({ type: 'updatePresentation', diagramId, elementId: e, presentation: { x, y, ...size(e) } }, diagramId); x += size(e).width + gapX; }
    y += Math.max(...row.map(e => size(e).height)) + gapY;
  }
};
const bdd = (id: string, name: string, ownerId: string, rows: string[][], gapX?: number, gapY?: number) => { diagram(id, name, 'bdd', ownerId); placeOnBdd(id, rows, 40, 40, gapX, gapY); tabs.push(id); };
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

// --- HW views
bdd('hw-bdd-00', 'HW · BDD 00 - MCM hardware context', 'pkg_HardwareStructure',
  [[MCM], ['blk_MR_PLD_ECU', 'blk_Battery24V', 'blk_DiagnosticTester'], ['blk_VRSensor', 'blk_NTCSensor', 'blk_RatiometricPressureSensor', 'blk_ThermalOilLevelSensor'],
    ['blk_UnitPump', 'blk_ProportionalValve', 'blk_StarterRelay']]);
fromMr('bdd_02_ecu_architecture', 'hw-bdd-01', 'HW · BDD 01 - MR_PLD_ECU architecture (subcircuits)', 'bdd', 'pkg_HardwareStructure');
fromMr('bdd_03_compute_core', 'hw-bdd-02', 'HW · BDD 02 - Compute core (U1, U2, U4, U5)', 'bdd', 'pkg_HardwareStructure');
fromMr('bdd_04_sensor_afe', 'hw-bdd-03', 'HW · BDD 03 - Sensor front-end', 'bdd', 'pkg_HardwareStructure');
fromMr('bdd_05_injection_stage', 'hw-bdd-04', 'HW · BDD 04 - Injection power stage (U3)', 'bdd', 'pkg_HardwareStructure');
fromMr('bdd_06_drivers_power_comms', 'hw-bdd-05', 'HW · BDD 05 - Drivers, power supply and communication', 'bdd', 'pkg_HardwareStructure');
fromMr('bdd_07_component_taxonomy', 'hw-bdd-06', 'HW · BDD 06 - Electronic components', 'bdd', 'pkg_HardwareStructure');
fromMr('bdd_08_engine_sensors', 'hw-bdd-07', 'HW · BDD 07 - Sensors', 'bdd', P.sensors);
bdd('hw-bdd-08', 'HW · BDD 08 - Loads (actuators)', P.loads, [['blk_UnitPump', 'blk_ProportionalValve', 'blk_StarterRelay']]);
fromMr('bdd_10_interfaces', 'hw-bdd-09', 'HW · BDD 09 - Port definitions', 'bdd', 'pkg_Interfaces');
fromMr('bdd_11_types', 'hw-bdd-10', 'HW · BDD 10 - ECU value types and units', 'bdd', 'pkg_Types');
bdd('hw-bdd-11', 'HW · BDD 11 - Circuit equations', 'pkg_Parametrics', chunk(Object.keys(R().definitions).filter(id => id.startsWith('cb_') && R().definitions[id].ownerId === 'pkg_Parametrics'), 5), 50, 60);
fromMr('ibd_ecu', 'hw-ibd-01', 'HW · IBD - MR_PLD_ECU (on-board wiring)', 'ibd', 'blk_MR_PLD_ECU', 'blk_MR_PLD_ECU');
fromMr('ibd_compute_core', 'hw-ibd-02', 'HW · IBD - Compute core', 'ibd', 'blk_ComputeCore', 'blk_ComputeCore');
fromMr('ibd_sensor_afe', 'hw-ibd-03', 'HW · IBD - Sensor front-end', 'ibd', 'blk_SensorAFE', 'blk_SensorAFE');
fromMr('ibd_injection_stage', 'hw-ibd-04', 'HW · IBD - Injection power stage', 'ibd', 'blk_InjectionPowerStage', 'blk_InjectionPowerStage');
fromMr('ibd_drivers', 'hw-ibd-05', 'HW · IBD - Valve and starter drivers', 'ibd', 'blk_ValveAndStarterDrivers', 'blk_ValveAndStarterDrivers');
fromMr('ibd_power_comms', 'hw-ibd-06', 'HW · IBD - Power supply and communication', 'ibd', 'blk_PowerSupplyAndComms', 'blk_PowerSupplyAndComms');
// --- SW views
const L = (id: string) => SW_LAYERS.find(l => l.id === id)!.modules.map(m => m.id);
bdd('sw-bdd-01', 'SW · BDD 01 - Software architecture (layers) and their HW', P.swArch,
  [[SW_TOP], SW_LAYERS.map(l => l.id), ['blk_MR_PLD_ECU', 'blk_SAK_C167CS_LM', 'blk_AM29F400BB']], 90, 220);
bdd('sw-bdd-02', 'SW · BDD 02 - Application components', P.swArch, [['sw-layer-app'], ...chunk(L('sw-layer-app'), 5)], 60, 100);
bdd('sw-bdd-03', 'SW · BDD 03 - Services layer', P.swArch, [['sw-layer-services'], ...chunk(L('sw-layer-services'), 4)], 60, 100);
bdd('sw-bdd-04', 'SW · BDD 04 - ECU abstraction and MCAL', P.swArch, [['sw-layer-ecuab', 'sw-layer-mcal'], ...chunk(L('sw-layer-ecuab'), 6), ...chunk(L('sw-layer-mcal'), 8)], 50, 100);
bdd('sw-bdd-05', 'SW · BDD 05 - SW to HW allocation', P.swArch,
  [['sw-injdrv', 'sw-u4if', 'sw-wdgm', 'sw-nvm', 'sw-eepdrv', 'sw-mcal-ebc', 'sw-mcal-can', 'sw-mcal-asc0', 'sw-mcal-adc', 'sw-angleclock'],
    ['blk_MR_PLD_ECU', 'blk_SAK_C167CS_LM', 'blk_PLD_C1_1', 'blk_TEMIC_845AW', 'blk_M93C86', 'blk_AM29F400BB', 'blk_CanTransceiver', 'blk_L9637D', 'blk_SensorAFE', 'blk_LM2903D']], 50, 260);
bdd('sw-bdd-06', 'SW · BDD 06 - ECU events and CAN messages', 'pkg_Signals',
  [...chunk(Object.keys(R().definitions).filter(id => R().definitions[id].kind === 'signal' && R().definitions[id].ownerId === P.can), 7),
    ...chunk(Object.keys(R().definitions).filter(id => R().definitions[id].kind === 'signal' && R().definitions[id].ownerId === 'pkg_Signals'), 7),
    Object.keys(R().definitions).filter(id => R().definitions[id].kind === 'enumeration' && R().definitions[id].ownerId === 'pkg_Signals')], 40, 50);
bdd('sw-bdd-07', 'SW · BDD 07 - Calculations', 'pkg_AnalysisAndSimulation', [Object.keys(R().definitions).filter(id => R().definitions[id].ownerId === 'pkg_AnalysisAndSimulation')], 50, 60);
{
  diagram('sw-ibd-01', 'SW · IBD - MCM_Software layers', 'ibd', SW_TOP, SW_TOP);
  const coordinates = Object.fromEntries(SW_LAYERS.map((l, i) => [`prop-${SW_TOP}-${l.role}`.toLowerCase(), box(160 + (i % 3) * 620, 120 + Math.floor(i / 3) * 520, 560, 420)]));
  run({ type: 'addToDiagram', diagramId: 'sw-ibd-01', elementIds: [SW_TOP, ...Object.keys(coordinates)], coordinates: { [SW_TOP]: box(40, 30, 2000, 1160), ...coordinates } }, 'sw-ibd-01');
  tabs.push('sw-ibd-01');
}

// ------------------------------------------------------------- requirements
const PRIORITY = { 1: 'critical', 2: 'high', 3: 'medium' } as const;
const rq = (id: string) => `rq-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const mrReq = (id: string) => { const found = `req_${id.replace(/[^A-Za-z0-9]/g, '_')}`; if (!R().requirements[found]) throw new Error(`no MR requirement ${id}`); return found; };
const requirement = (id: string, title: string, text: string, ownerId: string, priority: 1 | 2 | 3, source: string) => {
  // titles that two documents share get the requirement id (the app refuses duplicate qualified names)
  const name = Object.values(R().requirements).some(q => q.name === title) ? `${title} (${id})` : title;
  create({
  ...createRequirement({ id: rq(id), name, ownerId, text }), requirementId: id, priority: PRIORITY[priority], source, status: 'draft',
  } as SysmlElement);
};
const relate = (kind: 'requirementContainment' | 'deriveReqt' | 'satisfy', sourceId: string, targetId: string) =>
  create({ id: `${kind.toLowerCase()}-${sourceId}-${targetId}`, kind, sourceId, targetId } as SysmlElement);
const SWRS = 'D-Motor-ECU-SWRS-001 v3.0';
const SPEC = 'MR-PLD U1-U4 Memory and CAN Specification';
interface Group { id: string; name: string; text: string; reqs: DOC.DocReq[]; source: string }
const specification = (root: { id: string; name: string; text: string }, ownerPkg: string, groups: Group[]) => {
  requirement(root.id, root.name, root.text, ownerPkg, 1, groups[0].source);
  relate('deriveReqt', rq(root.id), 'req_REQ_SPEC_00');
  for (const g of groups) {
    requirement(g.id, g.name, g.text, rq(root.id), 1, g.source);
    relate('requirementContainment', rq(root.id), rq(g.id));
    for (const r of g.reqs) {
      requirement(r.id, r.name, r.text, rq(g.id), r.pri, g.source);
      relate('requirementContainment', rq(g.id), rq(r.id));
      for (const from of r.from ?? []) relate('deriveReqt', rq(r.id), mrReq(from));
      for (const by of r.by) {
        if (!R().definitions[by]) throw new Error(`${r.id}: no block ${by}`);
        relate('satisfy', by, rq(r.id));
      }
    }
  }
};
const SW_GROUPS: Group[] = [
  { id: 'SW-SWR-00', name: 'Software requirements', text: 'Functional, safety, platform and process requirements of the MCM software (SWRS §17).', reqs: DOC.SWR, source: SWRS },
  { id: 'SW-RT-00', name: 'Response times', text: 'System-level (RT-01 … RT-17) and I/O response times of the MCM software (SWRS §11).', reqs: [...DOC.RT, ...DOC.IORT], source: SWRS },
  { id: 'SW-CAN-00', name: 'CAN messages (IES-CAN)', text: 'Messages, signals, cycle times, timeouts and reception supervision on the IES-CAN between the CPC (FR) and the MCM (SWRS §7).', reqs: DOC.CANMSG, source: SWRS },
  { id: 'SW-DTC-00', name: 'Diagnostic trouble codes', text: 'Every fault the MCM stores, with MR code, J1939 SPN / FMI, severity, detection and reaction (SWRS §9).', reqs: DOC.DTC, source: SWRS },
  { id: 'SW-KWP-00', name: 'K-line diagnostic services', text: 'KWP2000 services of the MCM for the workshop tester (SWRS §8).', reqs: DOC.KWP, source: SWRS },
  { id: 'SW-ARC-00', name: 'Architecture rules and resources', text: 'Architecture rules, task schedule and resource budget of the MCM software (SWRS §12, §14.2).', reqs: DOC.ARCH, source: SWRS },
];
const HW_GROUPS: Group[] = [
  { id: 'HW-MCU-00', name: 'Main MCU selection', text: 'Requirements the main MCU (U1) shall meet (SWRS §6.1).', reqs: DOC.MCU, source: SWRS },
  { id: 'HW-DEV-00', name: 'On-board devices U1–U5', text: 'Requirements of the main MCU U1, the co-processor U4, the injection CPLD U3, the program flash U2 and the EEPROM U5 (SPEC §4–8).', reqs: DOC.DEVICE, source: SPEC },
  { id: 'HW-OBC-00', name: 'On-board data transfers D01–D18', text: 'Every on-board link of the MCM main PCB: data, physical layer, rate and integrity (SPEC §3).', reqs: DOC.ONBOARD, source: SPEC },
  { id: 'HW-IO-00', name: 'Inputs and outputs', text: 'Every input and output of the MCM: harness pin, front-end / driver, MCU resource, sampling and fault detection (SWRS §10).', reqs: DOC.IO, source: SWRS },
  { id: 'HW-SIG-00', name: 'CAN physical layer and signals', text: 'CAN and signal accuracy, sampling and latency requirements (SPEC §10.7, §11.5).', reqs: DOC.SIGNALS, source: SPEC },
];
specification({ id: 'SW-REQ-00', name: 'MCM software specification', text: 'Software of the MCM (MR-PLD engine ECU) on U1 SAK-C167CS-LM: what it shall do, how fast, which messages it exchanges and how it reacts to faults.' }, P.swReq, SW_GROUPS);
specification({ id: 'HW-REQ-00', name: 'MCM hardware specification', text: 'Hardware of the MCM (MR-PLD engine ECU, TEMIC PCB 287699.01 B): main MCU, on-board devices, on-board links, inputs and outputs, CAN and signal chain.' }, P.hwReq, HW_GROUPS);
// the MR system specification is part of the truck controller specification
relate('requirementContainment', 'req-req-trk-00', 'req_REQ_SPEC_00');

// requirements diagrams: overview (specification and its groups) and one table per group
const requirementDiagrams: string[] = [];
const reqDiagram = (id: string, name: string, ownerId: string, coordinates: Record<string, PresentationCoordinates>, tab = true) => {
  diagram(id, name, 'requirements', ownerId);
  run({ type: 'addToDiagram', diagramId: id, elementIds: Object.keys(coordinates), coordinates }, id);
  if (tab) requirementDiagrams.push(id);
};
const overview = (prefix: string, title: string, ownerId: string, rootId: string, groups: Group[]) => {
  const coordinates: Record<string, PresentationCoordinates> = { [rq(rootId)]: box(40 + ((groups.length - 1) / 2) * 360, 40, 320, 180), req_REQ_SPEC_00: box(40 + ((groups.length - 1) / 2) * 360 + 420, 40, 320, 160) };
  groups.forEach((g, i) => { coordinates[rq(g.id)] = box(40 + i * 360, 420, 320, 200); });
  reqDiagram(`${prefix}-req-00`, `${title} REQ 00 - ${R().requirements[rq(rootId)].name}`, ownerId, coordinates);
  groups.forEach((g, i) => {
    const columns = g.reqs.length > 24 ? 6 : 4;
    const grid: Record<string, PresentationCoordinates> = {};
    g.reqs.forEach((r, j) => { grid[rq(r.id)] = box(40 + (j % columns) * 360, 40 + Math.floor(j / columns) * 270, 330, 240); });
    reqDiagram(`${prefix}-req-${String(i + 1).padStart(2, '0')}`, `${title} REQ ${String(i + 1).padStart(2, '0')} - ${g.name}`, ownerId, grid);
  });
};
overview('sw', 'SW ·', P.swReq, 'SW-REQ-00', SW_GROUPS);
overview('hw', 'HW ·', P.hwReq, 'HW-REQ-00', HW_GROUPS);
fromMr('req_00_specification', 'mcm-req-00', 'MCM REQ 00 - MR-PLD system specification', 'requirements', 'pkg_Requirements');
// one requirements diagram per block that satisfies a requirement of the documents (opened from the model tree)
const allDocReqs = [...SW_GROUPS, ...HW_GROUPS].flatMap(g => g.reqs);
for (const block of [...new Set(allDocReqs.flatMap(r => r.by))]) {
  const reqs = allDocReqs.filter(r => r.by.includes(block));
  const name = R().definitions[block].name;
  const coordinates: Record<string, PresentationCoordinates> = { [block]: box(60, 60, 320, 160) };
  reqs.forEach((r, i) => { coordinates[rq(r.id)] = box(480 + (i % 4) * 360, 60 + Math.floor(i / 4) * 270, 330, 240); });
  const owner = block.startsWith('sw-') ? P.swReq : P.hwReq;
  reqDiagram(`${block.startsWith('sw-') ? 'sw' : 'hw'}-req-blk-${block.replace(/^blk_|^sw-/, '').toLowerCase()}`, `${block.startsWith('sw-') ? 'SW' : 'HW'} · REQ - ${name}`, owner, coordinates, false);
}

// ---------------------------------------------------------- package views
const TOP_PACKAGES = [USER_PACKAGE, P.hw, P.sw, TRUCK_REQS, 'pkg-truck-interfaces', 'pkg-truck-types', 'pkg-truck-signals'];
const packageView = (id: string, name: string, ownerId: string, packages: string[], columns: number) => {
  diagram(id, name, 'package', ownerId);
  run({ type: 'addToDiagram', diagramId: id, elementIds: packages,
    coordinates: Object.fromEntries(packages.map((p, i) => [p, box(40 + (i % columns) * 330, 40 + Math.floor(i / columns) * 220, 290, 170)])) }, id);
};
packageView('pkg-00-truck', 'PKG 00 - Truck model', MODEL, TOP_PACKAGES, 4);
packageView('pkg-hw-view', 'PKG HW - Hardware', P.hw, Object.values(R().packages).filter(p => p.ownerId === P.hw).map(p => p.id), 4);
packageView('pkg-sw-view', 'PKG SW - Software', P.sw, Object.values(R().packages).filter(p => p.ownerId === P.sw).map(p => p.id), 3);

// ------------------------------------------------------------------ verify
const blocks = Object.values(R().definitions).filter((d): d is BlockDefinition => d.kind === 'block');
const findings = [
  ...validateSysmlRepository(R(), stateContext).diagnostics,
  ...blocks.flatMap(b => deriveIbdView(R(), b.id).diagnostics),
  ...deriveBddView(R()).diagnostics,
];
// the app's guidance on the two abstract blocks of the MR-PLD hardware, as accepted in MR_PLD_A5414465340.adia
const ABSTRACT = new Set(['blk_ElectronicComponent', 'blk_EngineSensor']);
const remaining = findings.filter(d => !(d.code === 'ABSTRACT_INSTANTIATION' && ABSTRACT.has(d.elementId ?? '')));
if (remaining.length > 0) {
  throw new Error(`The app's validators report ${remaining.length} finding(s):\n${remaining.slice(0, 40).map(d => `${d.severity} ${d.code} ${d.elementId}: ${d.message}`).join('\n')}`);
}
console.log(`accepted: ${findings.length - remaining.length} ABSTRACT_INSTANTIATION guidance finding(s) on the abstract MR-PLD blocks`);

// -------------------------------------------------------------------- save
const saved = serializeSysmlProjectState(R(), state.diagramPresentations ?? {}, state.coordinates);
const userTabs: Array<{ kind: string; diagramId: string }> = truck.diagramWorkspace.tabs;
const newTabs = ['pkg-00-truck', 'pkg-hw-view', 'pkg-sw-view', ...tabs.filter(t => t.startsWith('hw-')), ...requirementDiagrams.filter(t => t.startsWith('hw-')),
  ...tabs.filter(t => t.startsWith('sw-')), ...requirementDiagrams.filter(t => t.startsWith('sw-')), 'mcm-req-00'];
const workspaceTabs = [{ kind: 'sysmlDiagram', diagramId: 'pkg-00-truck' }, ...userTabs, ...newTabs.filter(t => t !== 'pkg-00-truck').map(diagramId => ({ kind: 'sysmlDiagram', diagramId }))];
const smFile = mrProject.workspaceFiles.find((f: { id: string }) => f.id === 'default_sm');
const hmiFile = mrProject.workspaceFiles.find((f: { id: string }) => f.id === 'default_hmi');
const payload = createUnifiedProjectPayload({
  ...truck,
  ...behaviour,
  projectName: 'TRUCK v2',
  workspaceFiles: truck.workspaceFiles.map((f: { id: string }) => f.id === 'default_sm' ? smFile : f.id === 'default_hmi' ? hmiFile : f),
  diagramWorkspace: { tabs: workspaceTabs, activeTab: workspaceTabs[0] },
  activeSysmlDiagramId: 'pkg-00-truck',
  blocks: [], relationships: [], parts: [], connectors: [],
  sysmlRepository: saved.sysmlRepository,
  sysmlCoordinates: saved.sysmlCoordinates,
  diagramPresentations: saved.diagramPresentations,
} as never, () => new Date('2026-11-12T00:00:00Z'));
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
const kinds: Record<string, number> = {};
for (const d of Object.values(R().diagrams)) kinds[d.diagramKind] = (kinds[d.diagramKind] ?? 0) + 1;
console.log(`wrote ${OUT.slice(ROOT.length + 1)}: ${blocks.length} blocks, ${Object.keys(R().requirements).length} requirements, ${Object.keys(R().connectors).length} connectors, ` +
  `${Object.values(R().relationships).filter(r => r.kind === 'allocation').length} allocations, diagrams ${JSON.stringify(kinds)}, ${behaviour.states.length} states`);
