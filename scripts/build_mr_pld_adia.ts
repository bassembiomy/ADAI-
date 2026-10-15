/**
 * Build MR_PLD_ECU.adia (step 2 of 2, see scripts/generate_mr_pld_adia.py).
 *
 * Loads models/mr_pld/MR_PLD_ECU.flat.json through the app's own SysML loader
 * (upgrading it to model format 5), creates the BDD/IBD diagrams with the
 * gateway's createDiagram/addToDiagram commands and saves the project the same
 * way the app's Save does, so the file opens without an upgrade notice.
 *
 * Run: npx tsx scripts/build_mr_pld_adia.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSysmlGatewayState,
  executeSysmlCommand,
  loadCanonicalSysmlProject,
  type SysmlGatewayState,
} from '../src/services/sysmlCommandGateway';
import { serializeSysmlProjectState } from '../src/engine/sysml/persistence';
import { getCachedLegacyView } from '../src/engine/sysml/normalizedStore';
import { createUnifiedProjectPayload } from '../src/utils/adiaProjectPersistence';
import type { PresentationCoordinates } from '../src/engine/sysml/presentationState';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flat = JSON.parse(readFileSync(resolve(ROOT, 'models/mr_pld/MR_PLD_ECU.flat.json'), 'utf8'));
const loaded = loadCanonicalSysmlProject(flat);
const blocking = loaded.diagnostics.filter(d => d.severity === 'error');
if (!loaded.valid || blocking.length || loaded.quarantinedConnectorIds.length || loaded.quarantinedRelationshipIds.length) {
  throw new Error(`Flat project does not load cleanly: ${JSON.stringify(blocking.slice(0, 5))}`);
}

let state: SysmlGatewayState = createSysmlGatewayState(loaded.repository, loaded.coordinates, loaded.diagramPresentations);
const run = (command: Parameters<typeof executeSysmlCommand>[1], diagramId?: string) => {
  const result = executeSysmlCommand(state, command, diagramId);
  if (!result.committed) throw new Error(`${command.type} rejected: ${JSON.stringify(result.diagnostics.slice(0, 3))}`);
  state = { ...state, ...result } as SysmlGatewayState;
};

const flatBlock = (id: string) => flat.blocks.find((b: { id: string }) => b.id === id);
const size = (id: string) => ({ width: flatBlock(id).width, height: flatBlock(id).height });

/** Whole on top, its parts in rows of `perRow` underneath. */
const treeLayout = (whole: string, members: string[], perRow = 4): Record<string, PresentationCoordinates> => {
  const colW = 300;
  const rowGap = 60;
  const coords: Record<string, PresentationCoordinates> = {};
  const rows = Math.ceil(members.length / perRow);
  const span = Math.min(perRow, members.length) * colW;
  coords[whole] = { x: 40 + span / 2 - size(whole).width / 2, y: 40, ...size(whole) };
  let y = 40 + size(whole).height + 140;
  for (let r = 0; r < rows; r++) {
    const row = members.slice(r * perRow, (r + 1) * perRow);
    row.forEach((id, i) => { coords[id] = { x: 40 + i * colW, y, ...size(id) }; });
    y += Math.max(...row.map(id => size(id).height)) + rowGap;
  }
  return coords;
};
const gridLayout = (ids: string[], perRow: number): Record<string, PresentationCoordinates> => {
  const coords: Record<string, PresentationCoordinates> = {};
  let y = 40;
  for (let r = 0; r * perRow < ids.length; r++) {
    const row = ids.slice(r * perRow, (r + 1) * perRow);
    row.forEach((id, i) => { coords[id] = { x: 40 + i * 260, y, ...size(id) }; });
    y += Math.max(...row.map(id => size(id).height)) + 50;
  }
  return coords;
};

const addDiagram = (
  id: string, name: string, diagramKind: 'bdd' | 'ibd', coordinates: Record<string, PresentationCoordinates>,
  contextElementId?: string,
) => {
  run({
    type: 'createDiagram',
    diagram: {
      id, kind: 'diagram', diagramKind, name, namespace: ['model'], ownerId: contextElementId ?? 'model',
      ...(contextElementId ? { contextElementId } : {}),
    },
  });
  run({ type: 'addToDiagram', diagramId: id, elementIds: Object.keys(coordinates), coordinates }, id);
};

const ids = (prefix: string) => flat.blocks.map((b: { id: string }) => b.id).filter((id: string) => id.startsWith(prefix));
const ecuMembers = ['blk_PSU', 'blk_MCU', 'blk_Flash', 'blk_EEPROM', 'blk_CoProc', 'blk_TLog', 'blk_SigC', 'blk_Comm', 'blk_PStage', 'blk_Aux', 'blk_Mosfet'];
const engineMembers = ['blk_CKP', 'blk_CMP', 'blk_Analog', 'blk_Pump', 'blk_Starter', 'blk_PV', 'blk_Fan'];

addDiagram('bdd_context', 'BDD 1 - System context', 'bdd',
  treeLayout('blk_System', ['blk_Battery', 'blk_Ignition', 'blk_FR', 'blk_ECU', 'blk_Engine', 'blk_Tester'], 6));
addDiagram('bdd_ecu', 'BDD 2 - MR-PLD ECU internals', 'bdd', treeLayout('blk_ECU', ecuMembers, 6));
addDiagram('bdd_engine', 'BDD 3 - OM 501 LA engine', 'bdd', treeLayout('blk_Engine', engineMembers, 4));
addDiagram('bdd_items_ports', 'BDD 4 - Items and port definitions', 'bdd', gridLayout([...ids('item_'), ...ids('pdef_')], 6));

/** IBD: one symbol per part property of the context block, at its flat-project position. */
const ibdLayout = (context: string) => {
  const properties = (state.repository.definitions[context] as { properties: { id: string }[] }).properties;
  const coords: Record<string, PresentationCoordinates> = {};
  for (const part of flat.parts.filter((p: { blockId: string }) => p.blockId === context)) {
    const property = properties.find(p => p.id === `property:${part.id}` || p.id.startsWith(`property:${part.id}:`));
    if (!property) throw new Error(`No part property for ${part.id} in ${properties.map(p => p.id).join(', ')}`);
    coords[property.id] = { x: part.x, y: part.y, width: part.width, height: part.height };
  }
  return coords;
};
addDiagram('ibd_context', 'IBD - Actros_EngineMgmt_System', 'ibd', ibdLayout('blk_System'), 'blk_System');
addDiagram('ibd_ecu', 'IBD - MR_PLD_ECU', 'ibd', ibdLayout('blk_ECU'), 'blk_ECU');
addDiagram('ibd_engine', 'IBD - OM501LA_Engine', 'ibd', ibdLayout('blk_Engine'), 'blk_Engine');

const presentations = state.diagramPresentations ?? {};
for (const diagramId of ['bdd_context', 'bdd_ecu', 'bdd_engine', 'bdd_items_ports', 'ibd_context', 'ibd_ecu', 'ibd_engine']) {
  const view = getCachedLegacyView(state.store!, diagramId);
  console.log(`${diagramId}: ${view.blocks.length} blocks, ${view.relationships.length} relationships, `
    + `${view.parts.length} parts, ${view.connectors.length} connectors`);
}

const saved = serializeSysmlProjectState(state.repository, presentations, state.coordinates);
const tabs = ['bdd_context', 'ibd_context', 'ibd_ecu', 'bdd_ecu', 'bdd_engine', 'bdd_items_ports', 'ibd_engine']
  .map(diagramId => ({ kind: 'sysmlDiagram', diagramId }));
const { blocks: _b, relationships: _r, parts: _p, connectors: _c, ...behaviour } = flat;
const payload = createUnifiedProjectPayload({
  ...behaviour,
  version: flat.version,
  projectName: flat.projectName,
  openTabs: ['statemachine', 'bdd', 'ibd', 'hmi'],
  diagramWorkspace: { tabs, activeTab: tabs[0] },
  activeSysmlDiagramId: 'bdd_context',
  diagramNavigationStack: [],
  sysmlRepository: saved.sysmlRepository,
  sysmlCoordinates: saved.sysmlCoordinates,
  diagramPresentations: saved.diagramPresentations,
}, () => new Date('2026-10-15T00:00:00Z'));
writeFileSync(resolve(ROOT, 'MR_PLD_ECU.adia'), `${JSON.stringify(payload, null, 2)}\n`);
console.log('wrote MR_PLD_ECU.adia');
