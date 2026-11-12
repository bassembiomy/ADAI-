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
import { createDiagramDefinition, createInterface, createPackage, createRequirement } from '../src/features/modelExplorer/adapters/modelExplorerFactories';
import type { BlockDefinition, PortDefinition } from '../src/engine/sysml/model';
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
const B = {
  powerTrain: blockNamed('power train'), mcm: blockNamed('MCM'), cpc: blockNamed('CPC padels=FR'), tcm: blockNamed('TCM power shifts'),
  ebs: blockNamed('EBS'), cgw: blockNamed('CGW connector'), asam: blockNamed('ASAM (Advanced Sensor and Actuator Module)'),
  icuc: blockNamed('ICUC – Instrument Cluster'), srs: blockNamed('SRS air bag'),
};
type Key = keyof typeof B;
const SOURCE_BLOCK_IDS = Object.values(B);
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
const PORT_NAME: Record<Segment, string> = { drivetrain: 'drivetrainCAN', frame: 'frameCAN', cabin: 'cabinCAN' };

// ------------------------------------------------------------------- ports
// [block, the segment of its existing p1, a second segment for the two gateways / the boundary of power train]
const PORTS: Array<[Key, Segment | undefined, Segment?]> = [
  ['mcm', 'drivetrain'], ['cpc', 'drivetrain', 'frame'], ['tcm', 'drivetrain'], ['ebs', 'frame'], ['cgw', 'frame', 'cabin'],
  ['asam', 'cabin'], ['icuc', 'cabin'], ['srs', 'cabin'], ['powerTrain', undefined, 'frame'],
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
const portOf = (key: Key, segment: Segment) => {
  const id = portId[`${key}.${segment}`];
  if (!id) throw new Error(`${key} has no ${segment} port`);
  return id;
};

// ---------------------------------------------- part and reference properties
const ROLE: Record<Key, string> = { powerTrain: 'powerTrain', mcm: 'mcm', cpc: 'cpc', tcm: 'tcm', ebs: 'ebs', cgw: 'cgw', asam: 'asam', icuc: 'icuc', srs: 'srs' };
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
const CGW_LINKS: Link[] = [['powerTrain', 'frame'], ['ebs', 'frame'], ['asam', 'cabin'], ['icuc', 'cabin'], ['srs', 'cabin']];
for (const [role] of CGW_LINKS) property('cgw', role, 'reference');

// -------------------------------------------------------------------- IBDs
const tabs: string[] = [];
const connect = (context: Key, diagramId: string, from: { role?: Key; port: string }, to: { role?: Key; port: string }) => {
  const end = (e: { role?: Key; port: string }) => ({ path: e.role ? [propertyId(context, e.role)] : [], portId: e.port });
  const id = `conn-${context}-${from.role ?? 'self'}-${to.role ?? 'self'}-${to.port.replace(/^port-/, '')}`.toLowerCase();
  const plan = buildCreatePathIbdConnectorCommand(R(), { contextId: B[context], diagramId, connectorId: id, source: end(from), target: end(to) });
  if (!plan.ok || !plan.command || !plan.connector) throw new Error(`connector ${id} refused: ${JSON.stringify(plan.diagnostics)}`);
  run(plan.command as SysmlEditorCommand, diagramId);
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
    asam: box(300, 660, 460, 150), icuc: box(900, 660, 360, 150), srs: box(1400, 660, 320, 150) }, userCgwIbd);
  for (const [role, segment] of CGW_LINKS) connect('cgw', d, { port: portOf('cgw', segment) }, { role, port: portOf(role, segment) });
  for (const segment of ['frame', 'cabin'] as const) {
    const peers = CGW_LINKS.filter(([, s]) => s === segment).map(([role]) => role);
    for (let i = 0; i + 1 < peers.length; i += 1) connect('cgw', d, { role: peers[i], port: portOf(peers[i], segment) }, { role: peers[i + 1], port: portOf(peers[i + 1], segment) });
  }
}
// the controllers without internal blocks: the frame with their ports
for (const key of ['mcm', 'cpc', 'tcm', 'ebs', 'asam', 'icuc', 'srs'] as const) ibd(key, {});

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
  text: 'Specification of the main controllers of the truck: power train (MCM, CPC, TCM), EBS, CGW, ASAM, ICUC and SRS.' };
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
if (new Set(REQUIREMENTS.flatMap(r => r.by)).size !== SOURCE_BLOCK_IDS.length) throw new Error('a block satisfies no requirement');

// REQ 00: the specification between two rows of the requirements it contains (no containment line crosses a
// requirement); a derived requirement sits beside or above the one it is derived from
const requirementDiagrams: string[] = [];
const reqDiagram = (id: string, name: string, coordinates: Record<string, PresentationCoordinates>) => {
  run({ type: 'createDiagram', diagram: createDiagramDefinition({ id, name, ownerId: P.reqs, diagramKind: 'requirements' }) });
  run({ type: 'addToDiagram', diagramId: id, elementIds: Object.keys(coordinates), coordinates }, id);
  requirementDiagrams.push(id);
};
{
  const TOP = ['REQ-NET-04', 'REQ-NET-02', 'REQ-NET-01', 'REQ-NET-03', 'REQ-ASAM-01', 'REQ-ICUC-01', 'REQ-ICUC-02', 'REQ-SRS-02', 'REQ-EBS-03', 'REQ-SRS-01'];
  const BOTTOM = ['REQ-PT-01', 'REQ-CPC-01', 'REQ-EBS-01', 'REQ-EBS-02', 'REQ-COM-01', 'REQ-TCM-01', 'REQ-MCM-02', 'REQ-MCM-01', 'REQ-CPC-02', 'REQ-TCM-02'];
  if (new Set([...TOP, ...BOTTOM]).size !== REQUIREMENTS.length || [...TOP, ...BOTTOM].some(id => !REQUIREMENTS.some(r => r.id === id))) throw new Error('REQ 00 must show every requirement once');
  const coordinates: Record<string, PresentationCoordinates> = { [reqId(SPEC.id)]: box(40 + 4.5 * 350, 480, 320, 160) };
  TOP.forEach((id, i) => { coordinates[reqId(id)] = box(40 + i * 350, 40, 320, 200); });
  BOTTOM.forEach((id, i) => { coordinates[reqId(id)] = box(40 + i * 350, 880, 320, 200); });
  reqDiagram('diag-req-00', 'REQ 00 - Truck controller specification', coordinates);
}
// one requirements diagram per block: the block and every requirement it satisfies
for (const key of Object.keys(B) as Key[]) {
  const reqs = REQUIREMENTS.filter(r => r.by.includes(key));
  const coordinates: Record<string, PresentationCoordinates> = { [B[key]]: box(60, 60 + (Math.ceil(reqs.length / 3) - 1) * 130, 300, 130) };
  reqs.forEach((r, i) => { coordinates[reqId(r.id)] = box(560 + (i % 3) * 380, 60 + Math.floor(i / 3) * 260, 320, 200); });
  reqDiagram(`diag-req-${key.toLowerCase()}`, `REQ - ${R().definitions[B[key]].name.trim()}`, coordinates);
}

// ------------------------------------------------------------------ verify
const blocks = Object.values(R().definitions).filter((d): d is BlockDefinition => d.kind === 'block');
if (blocks.length !== SOURCE_BLOCK_IDS.length || blocks.some(b => !SOURCE_BLOCK_IDS.includes(b.id))) throw new Error('the model must hold exactly the blocks of the source');
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
