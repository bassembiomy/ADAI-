/**
 * Build TRUCK.adia from the user's model models/truck/TRUCK_source.adia (the main BDD of the truck controllers).
 *
 * The source is opened with the app's loader and extended only with the gateway commands the editor
 * dispatches. Its nine blocks, their ids, names and BDD positions are kept; no block is added.
 *
 *   ports         every `p1` proxy port is named after the CAN segment it sits on and typed by an InterfaceBlock
 *                 (the app asks for one: PROXY_PORT_TYPE_REQUIRED); CPC and CGW, which bridge two segments, and
 *                 power train (boundary) get the second / boundary port
 *   power train   part properties mcm / cpc / tcm for its three compositions, IBD with the drivetrain CAN
 *   CGW           reference properties to the controllers on its two segments; its IBD (the user's) is the vehicle network
 *   other blocks  an IBD owned by the block, showing its ports (the source has no blocks inside them)
 *   requirements  package Requirements: one specification containing the controller requirements, satisfied by
 *                 the blocks; REQ 00 and one requirements diagram per block
 *
 * The build fails unless the app's validators report nothing.
 * Run: npx tsx scripts/build_truck_adia.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSysmlGatewayState, executeSysmlCommand, loadCanonicalSysmlProject, type SysmlEditorCommand, type SysmlGatewayState,
} from '../src/services/sysmlCommandGateway';
import { buildCreatePathIbdConnectorCommand } from '../src/services/sysmlIbdConnectorCommands';
import { buildRelationshipUpdateCommand } from '../src/services/sysmlPropertyCommands';
import {
  createBlock, createDiagramDefinition, createInterface, createPackage, createQuantityKind, createRequirement, createSignal, createUnit, createValueType,
} from '../src/features/modelExplorer/adapters/modelExplorerFactories';
import { computeBlockDisplayBounds } from '../src/components/sysml/blockLayout';
import type { BlockDefinition, PortDefinition, PropertyDefinition } from '../src/engine/sysml/model';
import { serializeSysmlProjectState } from '../src/engine/sysml/persistence';
import { getCachedLegacyView } from '../src/engine/sysml/normalizedStore';
import { validateSysmlRepository } from '../src/engine/sysml/validation';
import { deriveIbdView } from '../src/engine/sysml/ibd';
import { deriveBddView } from '../src/engine/sysml/bdd';
import { projectStateEndpoints } from '../src/engine/sysml/workers/projectIoPayload';
import { createUnifiedProjectPayload } from '../src/utils/adiaProjectPersistence';
import type { PresentationCoordinates } from '../src/engine/sysml/presentationState';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(resolve(ROOT, 'models/truck/TRUCK_source.adia'), 'utf8'));
const OUT = resolve(ROOT, 'TRUCK.adia');
const stateContext = { externalEndpoints: projectStateEndpoints(source.states) };
const loaded = loadCanonicalSysmlProject(source, stateContext);
if (!loaded.valid) throw new Error('the source project does not load');

let state: SysmlGatewayState = createSysmlGatewayState(loaded.repository, loaded.coordinates, loaded.diagramPresentations, undefined, stateContext);
const run = (command: SysmlEditorCommand, diagramId?: string) => {
  const result = executeSysmlCommand(state, command, diagramId, stateContext);
  if (!result.committed) throw new Error(`${command.type} rejected: ${JSON.stringify(result.diagnostics.slice(0, 3))}`);
  state = { ...state, ...result } as SysmlGatewayState;
};
const update = (elementId: string, patch: Record<string, unknown>) => run({ type: 'updateElement', elementId, patch });
const R = () => state.repository;
const box = (x: number, y: number, width = 220, height = 120): PresentationCoordinates => ({ x, y, width, height });

// ------------------------------------------------- the blocks of the source
const blockNamed = (name: string) => {
  const found = Object.values(R().definitions).filter(d => d.kind === 'block' && d.name.trim() === name);
  if (found.length !== 1) throw new Error(`the source has ${found.length} blocks named "${name}"`);
  return found[0].id;
};
const SRC = {
  powerTrain: blockNamed('power train'), mcm: blockNamed('MCM'), cpc: blockNamed('CPC padels=FR'), tcm: blockNamed('TCM power shifts'),
  ebs: blockNamed('EBS'), cgw: blockNamed('CGW connector'), asam: blockNamed('ASAM (Advanced Sensor and Actuator Module)'),
  icuc: blockNamed('ICUC – Instrument Cluster'), srs: blockNamed('SRS air bag'),
};
/** The blocks the user asked for in the second request: the display screens (and the air conditioner they control). */
const NEW = {
  displaySystem: 'blk-display-system', countersScreen: 'blk-counters-screen', entertainmentScreen: 'blk-entertainment-screen',
  airConditioner: 'blk-air-conditioner',
};
const B = { ...SRC, ...NEW };
type Key = keyof typeof B;
const SOURCE_BLOCK_IDS = Object.values(SRC);
if (Object.values(R().definitions).filter(d => d.kind === 'block').length !== SOURCE_BLOCK_IDS.length) throw new Error('unexpected blocks in the source');
const USER_PACKAGE = R().definitions[B.powerTrain].ownerId!;
const MODEL = R().packages[USER_PACKAGE].ownerId || 'model';

// ------------------------------------------- interface blocks (port types)
const P = { ifaces: 'pkg-truck-interfaces', reqs: 'pkg-truck-requirements' };
run({ type: 'createElement', element: createPackage({ id: P.ifaces, name: 'Interfaces', ownerId: MODEL }) });
run({ type: 'createElement', element: createPackage({ id: P.reqs, name: 'Requirements', ownerId: MODEL }) });
const IF = { drivetrain: 'if-drivetrain-can', frame: 'if-frame-can', cabin: 'if-cabin-can' };
run({ type: 'createElement', element: createInterface({ id: IF.drivetrain, name: 'DrivetrainCAN', ownerId: P.ifaces }) });
run({ type: 'createElement', element: createInterface({ id: IF.frame, name: 'FrameCAN', ownerId: P.ifaces }) });
run({ type: 'createElement', element: createInterface({ id: IF.cabin, name: 'CabinCAN', ownerId: P.ifaces }) });
type Segment = keyof typeof IF;
// the video / touch link between the two screens of the display system
const IF_DISPLAY_LINK = 'if-display-link';
run({ type: 'createElement', element: createInterface({ id: IF_DISPLAY_LINK, name: 'DisplayLink', ownerId: P.ifaces }) });

// --------------------------------------------- value types and units (the specs of the display system)
const TYPES = 'pkg-truck-types';
run({ type: 'createElement', element: createPackage({ id: TYPES, name: 'Types', ownerId: MODEL }) });
const QK: Array<[string, string, string]> = [
  ['qk-length', 'Length', 'l'], ['qk-luminance', 'Luminance', 'Lv'], ['qk-voltage', 'ElectricPotential', 'U'], ['qk-temperature', 'Temperature', 'T'],
  ['qk-time', 'Time', 't'], ['qk-frequency', 'Frequency', 'f'], ['qk-datarate', 'DataRate', 'r'],
];
for (const [id, name, symbol] of QK) run({ type: 'createElement', element: createQuantityKind({ id, name, ownerId: TYPES, symbol }) });
const UNITS: Array<[string, string, string, string]> = [
  ['unit-inch', 'inch', 'in', 'qk-length'], ['unit-nit', 'candela per square metre', 'cd/m²', 'qk-luminance'], ['unit-volt', 'volt', 'V', 'qk-voltage'],
  ['unit-degc', 'degree Celsius', '°C', 'qk-temperature'], ['unit-ms', 'millisecond', 'ms', 'qk-time'], ['unit-hz', 'hertz', 'Hz', 'qk-frequency'],
  ['unit-kbps', 'kilobit per second', 'kbit/s', 'qk-datarate'],
];
for (const [id, name, symbol, quantityKindId] of UNITS) run({ type: 'createElement', element: createUnit({ id, name, ownerId: TYPES, symbol, quantityKindId }) });
const VT = {
  Integer: ['vt-integer', 'Integer'], String: ['vt-string', 'String'], Boolean: ['vt-boolean', 'Boolean'],
  Inch: ['vt-inch', 'ScreenDiagonal', 'unit-inch', 'qk-length'], Luminance: ['vt-luminance', 'LuminanceValue', 'unit-nit', 'qk-luminance'],
  Voltage: ['vt-voltage', 'VoltageValue', 'unit-volt', 'qk-voltage'], Temperature: ['vt-temperature', 'TemperatureValue', 'unit-degc', 'qk-temperature'],
  Time: ['vt-time', 'TimeValue', 'unit-ms', 'qk-time'], Frequency: ['vt-frequency', 'FrequencyValue', 'unit-hz', 'qk-frequency'],
  DataRate: ['vt-datarate', 'DataRateValue', 'unit-kbps', 'qk-datarate'],
} as const;
type VtKey = keyof typeof VT;
for (const [id, name, unitId, quantityKindId] of Object.values(VT) as Array<readonly string[]>) {
  run({ type: 'createElement', element: createValueType({ id, name, ownerId: TYPES }) });
  if (unitId) update(id, { unitId, quantityKindId }); // the inspector's Unit / Quantity Kind pickers
}

// ------------------------------------------- signals: the data each controller sends to the screens
const SIGNALS_PKG = 'pkg-truck-signals';
run({ type: 'createElement', element: createPackage({ id: SIGNALS_PKG, name: 'Signals', ownerId: MODEL }) });
const SIGNALS = ['VehicleSpeed', 'EngineData', 'CruiseControlStatus', 'GearData', 'BrakeStatus', 'AirbagStatus', 'ClusterData', 'BodyStatus',
  'BodyRequest', 'FaultList', 'ClimateRequest', 'ClimateStatus', 'NavigationGuidance', 'PhoneCallStatus'] as const;
type SignalName = typeof SIGNALS[number];
const sig = (name: SignalName) => `sig-${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`).slice(1)}`;
for (const name of SIGNALS) run({ type: 'createElement', element: createSignal({ id: sig(name), name, ownerId: SIGNALS_PKG }) });

// ------------------------------------------- the display system blocks (in the package of the user's BDD)
const NEW_NAMES: Record<keyof typeof NEW, string> = {
  displaySystem: 'Display System', countersScreen: 'Counters Screen (instrument display)',
  entertainmentScreen: 'Entertainment Screen (infotainment)', airConditioner: 'Air Conditioner (climate control)',
};
for (const [key, id] of Object.entries(NEW) as Array<[keyof typeof NEW, string]>) {
  run({ type: 'createElement', element: createBlock({ id, name: NEW_NAMES[key], ownerId: USER_PACKAGE }) });
}
const PORT_NAME: Record<Segment, string> = { drivetrain: 'drivetrainCAN', frame: 'frameCAN', cabin: 'cabinCAN' };

// ------------------------------------------------------------------- ports
// [block, the segment of its existing p1, a second segment for the two gateways / the boundary of power train]
const PORTS: Array<[Key, Segment | undefined, Segment?]> = [
  ['mcm', 'drivetrain'], ['cpc', 'drivetrain', 'frame'], ['tcm', 'drivetrain'], ['ebs', 'frame'], ['cgw', 'frame', 'cabin'],
  ['asam', 'cabin'], ['icuc', 'cabin'], ['srs', 'cabin'], ['powerTrain', undefined, 'frame'],
  ['displaySystem', undefined, 'cabin'], ['countersScreen', undefined, 'cabin'], ['entertainmentScreen', undefined, 'cabin'], ['airConditioner', undefined, 'cabin'],
];
const portId: Partial<Record<`${Key}.${Segment}`, string>> = {};
for (const [key, first, second] of PORTS) {
  const id = B[key];
  if (first) {
    // the port editor: name and type of the port the user created
    const ports = (R().definitions[id] as BlockDefinition).ports;
    if (ports.length !== 1 || ports[0].name !== 'p1') throw new Error(`${key}: expected the single port p1 of the source`);
    update(id, { ports: ports.map((p): PortDefinition => ({ ...p, name: PORT_NAME[first], typeId: IF[first] })) });
    portId[`${key}.${first}`] = ports[0].id;
  }
  if (second) {
    // "+ Proxy" on the block
    const featureId = `port-${key.toLowerCase()}-${second}`;
    run({ type: 'createOwnedFeature', intent: { featureKind: 'port', ownerBlockId: id, portKind: 'proxyPort', typeId: IF[second], name: PORT_NAME[second], featureId } });
    portId[`${key}.${second}`] = featureId;
  }
}
// the two screens are also joined by the display link (navigation arrows, call and media pop-ups on the counters screen)
const DISPLAY_LINK_PORT = { countersScreen: 'port-countersscreen-displaylink', entertainmentScreen: 'port-entertainmentscreen-displaylink' };
for (const [key, featureId] of Object.entries(DISPLAY_LINK_PORT) as Array<[Key, string]>) {
  run({ type: 'createOwnedFeature', intent: { featureKind: 'port', ownerBlockId: B[key], portKind: 'proxyPort', typeId: IF_DISPLAY_LINK, name: 'displayLink', featureId } });
}
const portOf = (key: Key, segment: Segment) => {
  const id = portId[`${key}.${segment}`];
  if (!id) throw new Error(`${key} has no ${segment} port`);
  return id;
};

// ---------------------------------------------- part and reference properties
const ROLE: Record<Key, string> = { powerTrain: 'powerTrain', mcm: 'mcm', cpc: 'cpc', tcm: 'tcm', ebs: 'ebs', cgw: 'cgw', asam: 'asam', icuc: 'icuc', srs: 'srs',
  displaySystem: 'displaySystem', countersScreen: 'countersScreen', entertainmentScreen: 'entertainmentScreen', airConditioner: 'airConditioner' };
const propertyId = (owner: Key, role: Key) => `prop-${owner.toLowerCase()}-${role.toLowerCase()}`;
const property = (owner: Key, role: Key, propertyKind: 'part' | 'reference') =>
  run({ type: 'createOwnedFeature', intent: { featureKind: 'property', ownerBlockId: B[owner], propertyKind, typeId: B[role], name: ROLE[role], featureId: propertyId(owner, role) } });

// power train is composed of MCM, CPC and TCM (the three compositions of the source BDD): the part properties
// and the role / multiplicity of each composition end
for (const part of ['mcm', 'cpc', 'tcm'] as const) {
  property('powerTrain', part, 'part');
  const composition = Object.values(R().relationships).filter(r => r.kind === 'composition' && r.sourceId === B.powerTrain && r.targetId === B[part]);
  if (composition.length !== 1) throw new Error(`expected one composition power train -> ${part}, found ${composition.length}`);
  const plan = buildRelationshipUpdateCommand(R(), composition[0].id, { sourceMultiplicity: '1', sourceAggregation: 'composite', targetRole: ROLE[part], targetMultiplicity: '1' });
  if (!plan.ok) throw new Error(plan.diagnostic.message);
  run(plan.command);
}

/**
 * CGW is the hub of the vehicle network (the IBD the user created for it): it references the controllers on its
 * two segments, which it does not own. The other controllers have no internal blocks in the source, so they
 * get no properties: their IBD shows their ports only.
 */
type Link = [role: Key, segment: Segment];
const CGW_LINKS: Link[] = [['powerTrain', 'frame'], ['ebs', 'frame'], ['asam', 'cabin'], ['icuc', 'cabin'], ['srs', 'cabin'],
  ['displaySystem', 'cabin'], ['airConditioner', 'cabin']];
for (const [role] of CGW_LINKS) property('cgw', role, 'reference');

// the display system is composed of its two screens (part properties + compositions, drawn on the BDD)
for (const screen of ['countersScreen', 'entertainmentScreen'] as const) {
  property('displaySystem', screen, 'part');
  const id = `comp-displaysystem-${screen.toLowerCase()}`;
  run({ type: 'createElement', element: { id, sourceId: B.displaySystem, targetId: B[screen], kind: 'composition', name: '', sourceFamily: 'block', targetFamily: 'block' } });
  const plan = buildRelationshipUpdateCommand(R(), id, { sourceMultiplicity: '1', sourceAggregation: 'composite', targetRole: ROLE[screen], targetMultiplicity: '1' });
  if (!plan.ok) throw new Error(plan.diagnostic.message);
  run(plan.command);
}

/** Specs: value properties with their default values (the property editor), operations and receptions (the block inspector). */
type Spec = [name: string, type: VtKey, value: string | number];
const specify = (key: Key, specs: Spec[], operations: string[], receptions: SignalName[]) => {
  const id = B[key];
  for (const [name, type] of specs) {
    run({ type: 'createOwnedFeature', intent: { featureKind: 'property', ownerBlockId: id, propertyKind: 'value', typeId: VT[type][0], name, featureId: `${id}::${name}` } });
  }
  const values = Object.fromEntries(specs.map(([name, , value]) => [`${id}::${name}`, String(value)]));
  update(id, { properties: (R().definitions[id] as BlockDefinition).properties.map((p): PropertyDefinition => values[p.id] !== undefined ? { ...p, defaultValue: values[p.id] } : p) });
  update(id, { operations });
  update(id, { receptions: receptions.map(sig) });
};
specify('displaySystem', [
  ['supplyNominal', 'Voltage', 24], ['supplyMin', 'Voltage', 16], ['supplyMax', 'Voltage', 32], ['canBitRate', 'DataRate', 500],
  ['wakeUp', 'String', 'KL15 on or cabin CAN activity'], ['mounting', 'String', 'dashboard, one housing, counters screen in front of the driver'],
], ['wakeUp()', 'sleep()', 'setDayNightMode()', 'setBrightness()'], []);
specify('countersScreen', [
  ['diagonal', 'Inch', 12.3], ['resolution', 'String', '1920 x 720 px'], ['brightness', 'Luminance', 1000], ['contrastRatio', 'String', '1000:1'],
  ['refreshRate', 'Frequency', 60], ['telltaleStartupTime', 'Time', 2000], ['warningLatency', 'Time', 200], ['operatingTempMin', 'Temperature', -40],
  ['operatingTempMax', 'Temperature', 85], ['safetyLevel', 'String', 'ASIL B for telltales (ISO 26262)'],
], ['showVehicleSpeed()', 'showEngineSpeed()', 'showGear()', 'showCruiseControl()', 'showEngineData()', 'showOdometer()', 'showTelltales()',
  'showWarning()', 'showNavigationArrow()', 'showCallPopup()', 'runLampCheck()'],
['VehicleSpeed', 'EngineData', 'CruiseControlStatus', 'GearData', 'BrakeStatus', 'AirbagStatus', 'ClusterData', 'NavigationGuidance', 'PhoneCallStatus']);
specify('entertainmentScreen', [
  ['diagonal', 'Inch', 10.25], ['resolution', 'String', '1920 x 720 px'], ['touch', 'String', 'projected capacitive, multi-touch, glove capable'],
  ['brightness', 'Luminance', 800], ['touchResponseTime', 'Time', 100], ['bootTime', 'Time', 10000], ['operatingTempMin', 'Temperature', -30],
  ['operatingTempMax', 'Temperature', 85], ['connectivity', 'String', 'Bluetooth 5 (hands-free, audio), Wi-Fi, 2 x USB-C'],
  ['audioOutput', 'String', '4 x 25 W'], ['drivingLockoutSpeed', 'String', 'video and text entry locked above 5 km/h'],
], ['playMedia()', 'tuneRadio()', 'handsFreeCall()', 'navigate()', 'setClimate()', 'setBodyFunction()', 'showVehicleSettings()', 'showFaultList()'],
['VehicleSpeed', 'BodyStatus', 'ClimateStatus', 'FaultList']);
specify('airConditioner', [
  ['setTemperatureMin', 'Temperature', 16], ['setTemperatureMax', 'Temperature', 28], ['setTemperatureStep', 'String', '0.5 °C'], ['fanLevels', 'Integer', 7],
  ['modes', 'String', 'AC on/off, auto, recirculation, defrost, air distribution (face / feet / windscreen)'],
], ['applyClimateRequest()', 'reportClimateStatus()'], ['ClimateRequest']);

// -------------------------------------------------------------------- IBDs
const tabs: string[] = [];
/** A connector drawn on the IBD; `item` is the item flow of the connector inspector (conveyed interface + item property). */
const connect = (context: Key, diagramId: string, from: { role?: Key; port: string }, to: { role?: Key; port: string }, item?: { conveyed: string; property: string }) => {
  const end = (e: { role?: Key; port: string }) => ({ path: e.role ? [propertyId(context, e.role)] : [], portId: e.port });
  const id = `conn-${context}-${from.role ?? 'self'}-${to.role ?? 'self'}-${to.port.replace(/^port-/, '')}`.toLowerCase();
  const plan = buildCreatePathIbdConnectorCommand(R(), { contextId: B[context], diagramId, connectorId: id, source: end(from), target: end(to), ...(item ? { itemFlowId: item.conveyed } : {}) });
  if (!plan.ok || !plan.command || !plan.connector) throw new Error(`connector ${id} refused: ${JSON.stringify(plan.diagnostics)}`);
  const element = item ? { ...plan.connector, itemProperty: item.property } : plan.connector;
  run({ type: 'createAndPresent', diagramId, element, presentation: {} } as SysmlEditorCommand, diagramId);
};
/** The IBD of a block: owned by the block (a double-click on the block opens it), its frame encloses the roles. */
const ibd = (context: Key, layout: Partial<Record<Key, PresentationCoordinates>>, existingDiagramId?: string) => {
  const diagramId = existingDiagramId ?? `diag-ibd-${context.toLowerCase()}`;
  const name = `IBD - ${R().definitions[B[context]].name.trim()}`;
  if (existingDiagramId) update(existingDiagramId, { name });
  else run({ type: 'createDiagram', diagram: createDiagramDefinition({ id: diagramId, name, ownerId: B[context], diagramKind: 'ibd', contextElementId: B[context] }) });
  const coordinates = Object.fromEntries(Object.entries(layout).map(([role, bounds]) => [propertyId(context, role as Key), bounds]));
  const right = Math.max(560, ...Object.values(layout).map(b => b.x + (b.width ?? 0)));
  const bottom = Math.max(300, ...Object.values(layout).map(b => b.y + (b.height ?? 0)));
  const frame = box(40, 40, right + 100, bottom + 60);
  const shown = new Set(Object.keys(state.diagramPresentations?.[diagramId]?.presentations ?? {}));
  if (shown.has(B[context])) run({ type: 'updatePresentation', diagramId, elementId: B[context], presentation: frame }, diagramId);
  const elementIds = [...(shown.has(B[context]) ? [] : [B[context]]), ...Object.keys(coordinates)];
  if (elementIds.length) run({ type: 'addToDiagram', diagramId, elementIds, coordinates: { ...(shown.has(B[context]) ? {} : { [B[context]]: frame }), ...coordinates } }, diagramId);
  tabs.push(diagramId);
  return diagramId;
};

// power train: the drivetrain CAN joins its three parts; its frame CAN port is CPC's
{
  const d = ibd('powerTrain', { cpc: box(520, 130, 300, 140), mcm: box(240, 440, 300, 140), tcm: box(800, 440, 300, 140) });
  connect('powerTrain', d, { role: 'cpc', port: portOf('cpc', 'drivetrain') }, { role: 'mcm', port: portOf('mcm', 'drivetrain') });
  connect('powerTrain', d, { role: 'cpc', port: portOf('cpc', 'drivetrain') }, { role: 'tcm', port: portOf('tcm', 'drivetrain') });
  connect('powerTrain', d, { role: 'mcm', port: portOf('mcm', 'drivetrain') }, { role: 'tcm', port: portOf('tcm', 'drivetrain') });
  connect('powerTrain', d, { port: portOf('powerTrain', 'frame') }, { role: 'cpc', port: portOf('cpc', 'frame') });
}
// CGW: the vehicle network. Frame CAN to power train and EBS, cabin CAN to ASAM, ICUC and SRS; the nodes of
// one segment are also joined to each other (a CAN segment is a shared bus).
{
  const userCgwIbd = Object.values(R().diagrams).find(d => d.diagramKind === 'ibd' && (d.contextElementId ?? d.ownerId) === B.cgw)?.id;
  const d = ibd('cgw', { powerTrain: box(300, 140, 560, 330), ebs: box(1080, 140, 320, 150),
    asam: box(300, 660, 460, 150), icuc: box(900, 660, 360, 150), srs: box(1400, 660, 320, 150),
    displaySystem: box(300, 1060, 560, 330), airConditioner: box(1080, 1060, 420, 150) }, userCgwIbd);
  // how the display system is connected: everything the frame side sends reaches it through the CGW, the cabin
  // controllers send to it directly; each connector carries an item flow naming the data and the controller it comes from
  const CAN = IF.cabin;
  const DISPLAY_ITEMS: Partial<Record<Key, string>> = {
    displaySystem: 'routedVehicleData : VehicleSpeed (EBS), EngineData (MCM), CruiseControlStatus (CPC), GearData (TCM), BrakeStatus (EBS), FaultList (all, via CGW)',
  };
  for (const [role, segment] of CGW_LINKS) {
    const item = DISPLAY_ITEMS[role];
    connect('cgw', d, { port: portOf('cgw', segment) }, { role, port: portOf(role, segment) }, item ? { conveyed: CAN, property: item } : undefined);
  }
  // the controllers of each segment are joined to each other (a CAN segment is a shared bus)
  for (const segment of ['frame', 'cabin'] as const) {
    const peers = CGW_LINKS.filter(([role, s]) => s === segment && !(role in NEW)).map(([role]) => role);
    for (let i = 0; i + 1 < peers.length; i += 1) connect('cgw', d, { role: peers[i], port: portOf(peers[i], segment) }, { role: peers[i + 1], port: portOf(peers[i + 1], segment) });
  }
  const toDisplay: Array<[Key, string]> = [
    ['icuc', 'clusterData : ClusterData (ICUC) - odometer, trip, service interval, telltale and warning list'],
    ['asam', 'bodyData : BodyStatus (ASAM) - lights, doors, switches / BodyRequest (display) - light and body function requests'],
    ['srs', 'airbagStatus : AirbagStatus (SRS) - airbag ready / fault telltale'],
  ];
  for (const [role, property] of toDisplay) connect('cgw', d, { role, port: portOf(role, 'cabin') }, { role: 'displaySystem', port: portOf('displaySystem', 'cabin') }, { conveyed: CAN, property });
  connect('cgw', d, { role: 'displaySystem', port: portOf('displaySystem', 'cabin') }, { role: 'airConditioner', port: portOf('airConditioner', 'cabin') },
    { conveyed: CAN, property: 'climate : ClimateRequest (display) - AC on/off, temperature, fan, distribution / ClimateStatus (AC)' });
}
// the display system: its cabin CAN port serves both screens; the display link joins the screens
{
  const d = ibd('displaySystem', { countersScreen: box(300, 160, 420, 200), entertainmentScreen: box(980, 160, 420, 200) });
  connect('displaySystem', d, { port: portOf('displaySystem', 'cabin') }, { role: 'countersScreen', port: portOf('countersScreen', 'cabin') },
    { conveyed: IF.cabin, property: 'drivingData : VehicleSpeed, EngineData, CruiseControlStatus, GearData, BrakeStatus, AirbagStatus, ClusterData' });
  connect('displaySystem', d, { port: portOf('displaySystem', 'cabin') }, { role: 'entertainmentScreen', port: portOf('entertainmentScreen', 'cabin') },
    { conveyed: IF.cabin, property: 'featureData : BodyStatus, ClimateStatus, FaultList, VehicleSpeed / BodyRequest, ClimateRequest' });
  connect('displaySystem', d, { role: 'entertainmentScreen', port: DISPLAY_LINK_PORT.entertainmentScreen }, { role: 'countersScreen', port: DISPLAY_LINK_PORT.countersScreen },
    { conveyed: IF_DISPLAY_LINK, property: 'sharedContent : NavigationGuidance, PhoneCallStatus, media title' });
}
// the controllers without internal blocks: the frame with their ports
for (const key of ['mcm', 'cpc', 'tcm', 'ebs', 'asam', 'icuc', 'srs', 'countersScreen', 'entertainmentScreen', 'airConditioner'] as const) ibd(key, {});

// ------------------------------------------------------------- requirements
interface Req { id: string; name: string; text: string; by: Key[]; from?: string; priority?: 'high' | 'critical' }
const REQUIREMENTS: Req[] = [
  { id: 'REQ-NET-01', name: 'Network segmentation', by: ['cgw', 'cpc'],
    text: 'The controllers shall communicate over three separated CAN segments: the drivetrain CAN (MCM, CPC, TCM), the frame CAN (CPC, EBS, CGW) and the cabin CAN (CGW, ASAM, ICUC, SRS).' },
  { id: 'REQ-NET-02', name: 'Central gateway routing', by: ['cgw'], from: 'REQ-NET-01',
    text: 'The CGW shall route the messages needed by controllers of another segment between the frame CAN and the cabin CAN.' },
  { id: 'REQ-NET-03', name: 'Drivetrain gateway', by: ['cpc'], from: 'REQ-NET-01',
    text: 'The CPC shall be the only link between the drivetrain CAN and the frame CAN and shall route powertrain data between them.' },
  { id: 'REQ-NET-04', name: 'Diagnostic access', by: ['cgw'],
    text: 'The CGW shall give a diagnostic tester access to the fault memory of every controller on the frame CAN and the cabin CAN.' },
  { id: 'REQ-PT-01', name: 'Power train composition', by: ['powerTrain'],
    text: 'The power train shall consist of the engine control (MCM), the powertrain coordination (CPC) and the transmission control (TCM).' },
  { id: 'REQ-CPC-01', name: 'Driver demand acquisition', by: ['cpc'], priority: 'high',
    text: 'The CPC shall read the accelerator pedal position and convert it into the driver torque demand.' },
  { id: 'REQ-CPC-02', name: 'Torque coordination', by: ['cpc'], priority: 'high',
    text: 'The CPC shall arbitrate the torque demands of the driver, the TCM and the EBS and send one resulting torque demand to the MCM.' },
  { id: 'REQ-MCM-01', name: 'Engine torque control', by: ['mcm'], from: 'REQ-CPC-02', priority: 'high',
    text: 'The MCM shall control the engine so that it delivers the torque demanded by the CPC.' },
  { id: 'REQ-MCM-02', name: 'Engine status reporting', by: ['mcm'],
    text: 'The MCM shall report the engine speed, the actual engine torque and the engine status on the drivetrain CAN.' },
  { id: 'REQ-TCM-01', name: 'Automated gear shifting', by: ['tcm'], priority: 'high',
    text: 'The TCM shall select the gear and execute the gear changes of the automated (PowerShift) transmission.' },
  { id: 'REQ-TCM-02', name: 'Shift torque intervention', by: ['tcm'], from: 'REQ-CPC-02',
    text: 'The TCM shall request the engine torque and engine speed it needs during a gear change from the CPC.' },
  { id: 'REQ-EBS-01', name: 'Electronic service braking', by: ['ebs'], priority: 'critical',
    text: 'The EBS shall control the brake pressure electronically according to the brake demand of the driver.' },
  { id: 'REQ-EBS-02', name: 'Wheel slip control', by: ['ebs'], priority: 'critical',
    text: 'The EBS shall prevent wheel lock under braking (ABS) and drive wheel spin under traction (ASR).' },
  { id: 'REQ-EBS-03', name: 'Brake torque intervention', by: ['ebs'], from: 'REQ-CPC-02', priority: 'high',
    text: 'The EBS shall request the engine torque limitation and the engine brake it needs from the CPC over the frame CAN.' },
  { id: 'REQ-ASAM-01', name: 'Sensor acquisition and actuation', by: ['asam'],
    text: 'The ASAM shall read the sensors and switches wired to it, drive the actuators wired to it and exchange their states on the cabin CAN.' },
  { id: 'REQ-ICUC-01', name: 'Driver information', by: ['icuc'],
    text: 'The ICUC shall display the vehicle speed, the engine speed, the engaged gear and the operating data it receives over the cabin CAN.' },
  { id: 'REQ-ICUC-02', name: 'Warning indication', by: ['icuc'], priority: 'high',
    text: 'The ICUC shall indicate the warnings and faults reported by the other controllers to the driver.' },
  { id: 'REQ-SRS-01', name: 'Restraint deployment', by: ['srs'], priority: 'critical',
    text: 'The SRS shall detect a crash and deploy the air bag.' },
  { id: 'REQ-SRS-02', name: 'Restraint system monitoring', by: ['srs'], from: 'REQ-ICUC-02', priority: 'high',
    text: 'The SRS shall monitor its firing circuits and sensors and report a fault on the cabin CAN for indication by the ICUC.' },
  { id: 'REQ-COM-01', name: 'Communication loss handling', by: ['mcm', 'cpc', 'tcm', 'ebs', 'cgw', 'asam', 'icuc', 'srs'], priority: 'high',
    text: 'Every controller shall detect the loss of communication with a partner it depends on, store a fault and continue with a defined substitute behaviour.' },
];
const reqId = (rid: string) => `req-${rid.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const requirement = (r: { id: string; name: string; text: string; priority?: Req['priority'] }, ownerId: string) =>
  run({ type: 'createElement', element: { ...createRequirement({ id: reqId(r.id), name: r.name, ownerId, text: r.text }), requirementId: r.id,
    source: 'Engineering proposal from the controller BDD - to be confirmed', ...(r.priority ? { priority: r.priority } : {}) } });
const relate = (kind: 'requirementContainment' | 'deriveReqt' | 'satisfy', sourceId: string, targetId: string) =>
  run({ type: 'createElement', element: { id: `${kind.toLowerCase()}-${sourceId}-${targetId}`, kind, sourceId, targetId } });
const SPEC = { id: 'REQ-TRK-00', name: 'Truck controller specification', priority: 'high' as const,
  text: 'Specification of the main controllers of the truck: power train (MCM, CPC, TCM), EBS, CGW, ASAM, ICUC, SRS, the display system and the air conditioner.' };
requirement(SPEC, P.reqs);
// requirement containment (SysML 1.6 §16.3.2.4): the specification owns the requirements it contains
for (const r of REQUIREMENTS) {
  requirement(r, reqId(SPEC.id));
  relate('requirementContainment', reqId(SPEC.id), reqId(r.id));
}
for (const r of REQUIREMENTS) {
  if (r.from) relate('deriveReqt', reqId(r.id), reqId(r.from));
  for (const key of r.by) relate('satisfy', B[key], reqId(r.id));
}

// ------------------------------------------------ display system requirements (second request)
// REQ-DSP-00 (in REQ-TRK-00) contains the screen functions and specs, and REQ-CON-00, which contains one
// connection requirement per controller: the data it sends to the screens and the path it takes.
const DSP = { id: 'REQ-DSP-00', name: 'Display system specification', priority: 'high' as const,
  text: 'The display system shall present every vehicle feature to the driver on two screens: a counters screen for the driving information and an entertainment screen for media, communication, climate and all other vehicle features.' };
const CON = { id: 'REQ-CON-00', name: 'Display connection specification',
  text: 'The display system shall be connected to the cabin CAN and shall receive the data of every controller listed below, directly on the cabin CAN or routed by the CPC and the CGW.' };
const DISPLAY_REQS: Req[] = [
  { id: 'REQ-DSP-01', name: 'Two-screen display system', by: ['displaySystem'],
    text: 'The display system shall consist of a counters screen in front of the driver and an entertainment screen in the centre of the dashboard.' },
  { id: 'REQ-DSP-02', name: 'Single access to vehicle features', by: ['displaySystem', 'entertainmentScreen'],
    text: 'Every vehicle feature the driver can see or set shall be reachable from the display system: driving information on the counters screen, all other features from the vehicle menu of the entertainment screen.' },
  { id: 'REQ-DSP-03', name: 'Power and wake-up', by: ['displaySystem'],
    text: 'The display system shall operate from the 24 V supply between 16 V and 32 V and shall wake up on KL15 on or on cabin CAN activity.' },
  { id: 'REQ-DSP-04', name: 'Day and night mode', by: ['displaySystem'],
    text: 'Both screens shall adapt their brightness to the ambient light and switch to a night colour scheme when the vehicle lights are on.' },
  { id: 'REQ-CNT-01', name: 'Speed and engine speed', by: ['countersScreen'], from: 'REQ-ICUC-01', priority: 'high',
    text: 'The counters screen shall show the vehicle speed (km/h) and the engine speed (rpm), updated at least 10 times per second.' },
  { id: 'REQ-CNT-02', name: 'Gear and cruise control', by: ['countersScreen'], from: 'REQ-ICUC-01',
    text: 'The counters screen shall show the engaged gear, the shift mode (automatic / manual) and the cruise control state and set speed.' },
  { id: 'REQ-CNT-03', name: 'Engine operating data', by: ['countersScreen'], from: 'REQ-ICUC-01',
    text: 'The counters screen shall show the coolant temperature and the engine oil pressure.' },
  { id: 'REQ-CNT-04', name: 'Odometer and trip', by: ['countersScreen'],
    text: 'The counters screen shall show the total distance, two trip distances and the service interval received from the ICUC.' },
  { id: 'REQ-CNT-05', name: 'Telltales and warnings', by: ['countersScreen'], from: 'REQ-ICUC-02', priority: 'critical',
    text: 'The counters screen shall show the brake / ABS / ASR, airbag, engine and transmission telltales and warnings within 200 ms of their reception, in front of any other content.' },
  { id: 'REQ-CNT-06', name: 'Telltale start-up and lamp check', by: ['countersScreen'], priority: 'high',
    text: 'The counters screen shall show the telltales within 2 s of KL15 on and run a lamp check of all telltales.' },
  { id: 'REQ-CNT-07', name: 'Missing data indication', by: ['countersScreen'], from: 'REQ-COM-01', priority: 'high',
    text: 'When a displayed value is not received for 1 s, the counters screen shall show it as invalid (---) and indicate a communication fault.' },
  { id: 'REQ-ENT-01', name: 'Media', by: ['entertainmentScreen'],
    text: 'The entertainment screen shall play radio (FM / DAB), USB and Bluetooth audio.' },
  { id: 'REQ-ENT-02', name: 'Hands-free telephone', by: ['entertainmentScreen'],
    text: 'The entertainment screen shall provide Bluetooth hands-free calls and show incoming calls also on the counters screen.' },
  { id: 'REQ-ENT-03', name: 'Navigation', by: ['entertainmentScreen'],
    text: 'The entertainment screen shall provide truck navigation and send the turn guidance to the counters screen.' },
  { id: 'REQ-ENT-04', name: 'Climate control', by: ['entertainmentScreen'], priority: 'high',
    text: 'The entertainment screen shall control the air conditioner: AC on/off, auto mode, set temperature 16 to 28 °C in 0.5 °C steps, fan level 1 to 7, recirculation, defrost and air distribution, and shall show the climate status.' },
  { id: 'REQ-ENT-05', name: 'Vehicle settings', by: ['entertainmentScreen'],
    text: 'The entertainment screen shall show and set the body functions (lights, doors, switches) handled by the ASAM.' },
  { id: 'REQ-ENT-06', name: 'Fault list', by: ['entertainmentScreen'], from: 'REQ-NET-04',
    text: 'The entertainment screen shall show the active faults of every controller, read through the CGW.' },
  { id: 'REQ-ENT-07', name: 'Driver distraction lockout', by: ['entertainmentScreen'], priority: 'high',
    text: 'Above 5 km/h the entertainment screen shall block video playback and text entry.' },
  { id: 'REQ-AC-01', name: 'Climate request execution', by: ['airConditioner'], from: 'REQ-ENT-04',
    text: 'The air conditioner shall execute the climate requests of the display system within 100 ms and report its climate status on the cabin CAN.' },
  { id: 'REQ-SPC-01', name: 'Counters screen specification', by: ['countersScreen'],
    text: 'Counters screen: 12.3 in, 1920 x 720 px, at least 1000 cd/m², contrast 1000:1, 60 Hz, -40 to +85 °C, telltales ASIL B (ISO 26262).' },
  { id: 'REQ-SPC-02', name: 'Entertainment screen specification', by: ['entertainmentScreen'],
    text: 'Entertainment screen: 10.25 in, 1920 x 720 px, projected-capacitive multi-touch usable with gloves, at least 800 cd/m², touch response at most 100 ms, -30 to +85 °C, Bluetooth 5, Wi-Fi, 2 x USB-C, 4 x 25 W audio.' },
  { id: 'REQ-SPC-03', name: 'Display network interface', by: ['displaySystem'],
    text: 'The display system shall be connected to the cabin CAN at 500 kbit/s; the two screens shall be joined by a display link for shared content.' },
];
/** One connection requirement per controller: [id, name, provider, receiving screen, text]. */
const CONNECTIONS: Array<[string, string, Key, Key, string]> = [
  ['REQ-CON-01', 'MCM to counters screen', 'mcm', 'countersScreen', 'The MCM shall send EngineData (engine speed, coolant temperature, oil pressure, engine warnings) at 10 Hz; CPC routes it from the drivetrain CAN to the frame CAN and CGW to the cabin CAN, to the counters screen.'],
  ['REQ-CON-02', 'CPC to counters screen', 'cpc', 'countersScreen', 'The CPC shall send CruiseControlStatus (state, set speed, accelerator pedal position) at 10 Hz on the frame CAN; CGW routes it to the counters screen.'],
  ['REQ-CON-03', 'TCM to counters screen', 'tcm', 'countersScreen', 'The TCM shall send GearData (engaged gear, target gear, shift mode, transmission warnings) on change and at 10 Hz; CPC and CGW route it to the counters screen.'],
  ['REQ-CON-04', 'EBS to counters screen', 'ebs', 'countersScreen', 'The EBS shall send VehicleSpeed (from the wheel speeds) at 10 Hz and BrakeStatus (ABS / ASR active, brake fault, lining wear) on the frame CAN; CGW routes them to both screens.'],
  ['REQ-CON-05', 'ICUC to counters screen', 'icuc', 'countersScreen', 'The ICUC shall send ClusterData (odometer, trips, service interval, telltale and warning list) on the cabin CAN to the counters screen.'],
  ['REQ-CON-06', 'SRS to counters screen', 'srs', 'countersScreen', 'The SRS shall send AirbagStatus (ready / fault) on the cabin CAN at 1 Hz and on change, to the counters screen.'],
  ['REQ-CON-07', 'ASAM to entertainment screen', 'asam', 'entertainmentScreen', 'The ASAM shall send BodyStatus (lights, doors, switches) on the cabin CAN to the entertainment screen and execute the BodyRequest messages it receives from it.'],
  ['REQ-CON-08', 'CGW to entertainment screen', 'cgw', 'entertainmentScreen', 'The CGW shall route the frame CAN data the screens need to the cabin CAN and provide the FaultList of every controller to the entertainment screen.'],
  ['REQ-CON-09', 'Entertainment screen to air conditioner', 'airConditioner', 'entertainmentScreen', 'The entertainment screen shall send ClimateRequest on the cabin CAN on every change; the air conditioner shall answer with ClimateStatus at 1 Hz and on change.'],
];
const CONNECTION_REQS: Req[] = CONNECTIONS.map(([id, name, provider, screen, text]) => ({ id, name, by: [provider, screen], text, from: 'REQ-NET-02' }));
requirement(DSP, reqId(SPEC.id));
relate('requirementContainment', reqId(SPEC.id), reqId(DSP.id));
requirement(CON, reqId(DSP.id));
relate('requirementContainment', reqId(DSP.id), reqId(CON.id));
for (const r of DISPLAY_REQS) { requirement(r, reqId(DSP.id)); relate('requirementContainment', reqId(DSP.id), reqId(r.id)); }
for (const r of CONNECTION_REQS) { requirement(r, reqId(CON.id)); relate('requirementContainment', reqId(CON.id), reqId(r.id)); }
for (const r of [...DISPLAY_REQS, ...CONNECTION_REQS]) {
  if (r.from && r.from !== 'REQ-NET-02') relate('deriveReqt', reqId(r.id), reqId(r.from));
  for (const key of r.by) relate('satisfy', B[key], reqId(r.id));
}
relate('deriveReqt', reqId(CON.id), reqId('REQ-NET-02'));
const ALL_REQS = [...REQUIREMENTS, ...DISPLAY_REQS, ...CONNECTION_REQS];
if (new Set(ALL_REQS.flatMap(r => r.by)).size !== Object.keys(B).length) throw new Error('a block satisfies no requirement');

// REQ 00: the specification between two rows of the requirements it contains (no containment line crosses a
// requirement); a derived requirement sits beside or above the one it is derived from
const requirementDiagrams: string[] = [];
const reqDiagram = (id: string, name: string, coordinates: Record<string, PresentationCoordinates>) => {
  run({ type: 'createDiagram', diagram: createDiagramDefinition({ id, name, ownerId: P.reqs, diagramKind: 'requirements' }) });
  run({ type: 'addToDiagram', diagramId: id, elementIds: Object.keys(coordinates), coordinates }, id);
  requirementDiagrams.push(id);
};
{
  const TOP = ['REQ-NET-04', 'REQ-NET-02', 'REQ-NET-01', 'REQ-NET-03', 'REQ-ASAM-01', 'REQ-ICUC-01', 'REQ-ICUC-02', 'REQ-SRS-02', 'REQ-EBS-03', 'REQ-SRS-01', 'REQ-DSP-00'];
  const BOTTOM = ['REQ-PT-01', 'REQ-CPC-01', 'REQ-EBS-01', 'REQ-EBS-02', 'REQ-COM-01', 'REQ-TCM-01', 'REQ-MCM-02', 'REQ-MCM-01', 'REQ-CPC-02', 'REQ-TCM-02'];
  const contained = [...REQUIREMENTS.map(r => r.id), DSP.id];
  if (new Set([...TOP, ...BOTTOM]).size !== contained.length || [...TOP, ...BOTTOM].some(id => !contained.includes(id))) throw new Error('REQ 00 must show every requirement once');
  const coordinates: Record<string, PresentationCoordinates> = { [reqId(SPEC.id)]: box(40 + 4.5 * 350, 480, 320, 160) };
  TOP.forEach((id, i) => { coordinates[reqId(id)] = box(40 + i * 350, 40, 320, 200); });
  BOTTOM.forEach((id, i) => { coordinates[reqId(id)] = box(40 + i * 350, 880, 320, 200); });
  reqDiagram('diag-req-00', 'REQ 00 - Truck controller specification', coordinates);
}
// REQ 10: the display system specification and the requirements it contains, by screen
{
  const groups: string[][] = [
    ['REQ-DSP-01', 'REQ-DSP-02', 'REQ-DSP-03', 'REQ-DSP-04', 'REQ-SPC-03', 'REQ-CON-00', 'REQ-AC-01'],
    ['REQ-CNT-01', 'REQ-CNT-02', 'REQ-CNT-03', 'REQ-CNT-04', 'REQ-CNT-05', 'REQ-CNT-06', 'REQ-CNT-07', 'REQ-SPC-01'],
    ['REQ-ENT-01', 'REQ-ENT-02', 'REQ-ENT-03', 'REQ-ENT-04', 'REQ-ENT-05', 'REQ-ENT-06', 'REQ-ENT-07', 'REQ-SPC-02'],
  ];
  const ids = [...DISPLAY_REQS.map(r => r.id), CON.id];
  if (new Set(groups.flat()).size !== ids.length || groups.flat().some(id => !ids.includes(id))) throw new Error('REQ 10 must show every display requirement once');
  // the specification between two rows (no containment line crosses a requirement): the system and entertainment
  // screen requirements above it, the counters screen requirements below it
  const top = [...groups[0], ...groups[2]];
  const coordinates: Record<string, PresentationCoordinates> = { [reqId(DSP.id)]: box(40 + 7 * 350, 520, 320, 180) };
  top.forEach((id, i) => { coordinates[reqId(id)] = box(40 + i * 350, 40, 320, 220); });
  groups[1].forEach((id, i) => { coordinates[reqId(id)] = box(40 + (3.5 + i) * 350, 940, 320, 220); });
  reqDiagram('diag-req-10', 'REQ 10 - Display system specification', coordinates);
}
// REQ 11: how the screens are connected to the controllers - each connection requirement between the controller
// that sends the data (below) and the screen that shows it (above)
{
  // (REQ-CON-00, which contains them, is on REQ 10)
  const coordinates: Record<string, PresentationCoordinates> = {
    [B.countersScreen]: box(40 + 2 * 350, 40, 420, 160), [B.entertainmentScreen]: box(40 + 6.5 * 350, 40, 420, 160),
  };
  CONNECTIONS.forEach(([id, , provider], i) => {
    coordinates[reqId(id)] = box(40 + i * 350, 560, 320, 260);
    coordinates[B[provider]] = box(40 + i * 350 + 20, 1000, 280, 130);
  });
  reqDiagram('diag-req-11', 'REQ 11 - Display connections to the controllers', coordinates);
}
// one requirements diagram per block: the block and every requirement it satisfies
for (const key of Object.keys(B) as Key[]) {
  const reqs = ALL_REQS.filter(r => r.by.includes(key));
  const coordinates: Record<string, PresentationCoordinates> = { [B[key]]: box(60, 60 + (Math.ceil(reqs.length / 3) - 1) * 130, 300, 130) };
  reqs.forEach((r, i) => { coordinates[reqId(r.id)] = box(560 + (i % 3) * 380, 60 + Math.floor(i / 3) * 260, 320, 200); });
  reqDiagram(`diag-req-${key.toLowerCase()}`, `REQ - ${R().definitions[B[key]].name.trim()}`, coordinates);
}

// -------------------------------------------------------------------- BDDs
/** Places elements on a BDD row by row with the sizes the canvas draws (longest compartment line, ports). */
const placeOnBdd = (diagramId: string, rows: string[][], x0: number, y0: number, gapX = 90, gapY = 120, extra: string[] = []) => {
  const ids = rows.flat();
  run({ type: 'addToDiagram', diagramId, elementIds: [...ids, ...extra], coordinates: Object.fromEntries(ids.map((e, i) => [e, box(x0 + i * 10, y0, 200, 100)])) }, diagramId);
  const drawn = new Map(getCachedLegacyView(state.store!, diagramId).blocks.map(b => [b.id, computeBlockDisplayBounds({ ...b, width: 150, height: 80 })]));
  const size = (e: string) => drawn.get(e) ?? { width: 220, height: 110 };
  let y = y0;
  for (const row of rows) {
    let x = x0;
    for (const e of row) { run({ type: 'updatePresentation', diagramId, elementId: e, presentation: { x, y, ...size(e) } }, diagramId); x += size(e).width + gapX; }
    y += Math.max(...row.map(e => size(e).height)) + gapY;
  }
};
const DISPLAY_COMPOSITIONS = ['comp-displaysystem-countersscreen', 'comp-displaysystem-entertainmentscreen'];
// the user's BDD: the new blocks below the controllers
const USER_BDD = Object.values(R().diagrams).find(d => d.diagramKind === 'bdd' && d.ownerId === USER_PACKAGE)!.id;
placeOnBdd(USER_BDD, [[B.displaySystem, B.airConditioner], [B.countersScreen, B.entertainmentScreen]], 760, 760, 140, 160, DISPLAY_COMPOSITIONS);
// BDD - Display system: the display system, its screens with their specs, the air conditioner, the interfaces and signals
{
  const id = 'diag-bdd-display';
  run({ type: 'createDiagram', diagram: createDiagramDefinition({ id, name: 'BDD - Display system', ownerId: USER_PACKAGE, diagramKind: 'bdd' }) });
  placeOnBdd(id, [[B.displaySystem, B.airConditioner], [B.countersScreen, B.entertainmentScreen], [IF.cabin, IF_DISPLAY_LINK], SIGNALS.slice(0, 7).map(sig), SIGNALS.slice(7).map(sig)],
    40, 40, 90, 120, DISPLAY_COMPOSITIONS);
  tabs.push(id);
}

// ------------------------------------------------------------------ verify
const blocks = Object.values(R().definitions).filter((d): d is BlockDefinition => d.kind === 'block');
// exactly the user's blocks: the nine of the source BDD and the display system / air conditioner of the second request
const ALL_BLOCK_IDS: string[] = Object.values(B);
if (blocks.length !== ALL_BLOCK_IDS.length || blocks.some(b => !ALL_BLOCK_IDS.includes(b.id))) throw new Error('the model must hold exactly the requested blocks');
const findings = [
  ...validateSysmlRepository(R(), stateContext).diagnostics,
  ...blocks.flatMap(b => deriveIbdView(R(), b.id).diagnostics),
  ...deriveBddView(R()).diagnostics,
];
if (findings.length > 0) {
  throw new Error(`The app's validators report ${findings.length} finding(s):\n${findings.slice(0, 40).map(d => `${d.severity} ${d.code} ${d.elementId}: ${d.message}`).join('\n')}`);
}
for (const diagramId of Object.keys(R().diagrams)) {
  const view = getCachedLegacyView(state.store!, diagramId);
  console.log(`${R().diagrams[diagramId].name} [${diagramId}]: ${view.blocks.length} elements, ${view.relationships.length} relationships, ${view.parts.length} parts, ${view.connectors.length} connectors`);
}

// -------------------------------------------------------------------- save
const saved = serializeSysmlProjectState(R(), state.diagramPresentations ?? {}, state.coordinates);
const userTabs: Array<{ kind: string; diagramId: string }> = source.diagramWorkspace?.tabs ?? [];
const workspaceTabs = [...userTabs, ...[...tabs, ...requirementDiagrams].filter(id => !userTabs.some(t => t.diagramId === id)).map(diagramId => ({ kind: 'sysmlDiagram', diagramId }))];
const payload = createUnifiedProjectPayload({
  ...source,
  diagramWorkspace: { tabs: workspaceTabs, activeTab: source.diagramWorkspace?.activeTab ?? workspaceTabs[0] },
  blocks: [], relationships: [], parts: [], connectors: [],
  sysmlRepository: saved.sysmlRepository,
  sysmlCoordinates: saved.sysmlCoordinates,
  diagramPresentations: saved.diagramPresentations,
} as never, () => new Date('2026-11-12T00:00:00Z'));
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote ${OUT.slice(ROOT.length + 1)}: ${blocks.length} blocks, ${Object.keys(R().requirements).length} requirements, ${Object.keys(R().connectors).length} connectors, ${Object.keys(R().diagrams).length} diagrams`);
