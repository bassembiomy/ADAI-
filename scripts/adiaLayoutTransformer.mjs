import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BDD_DOMAIN_ORDER = ['Mechanical System', 'Hardware System', 'Software System'];
const BDD_SUBSYSTEM_ORDER = new Map([
  ['Mechanical System', ['Mechanical Structure', 'Vessel Interface', 'IR Mechanical Assembly', 'User Interface Mechanics']],
  ['Hardware System', ['Mains & DC Power', 'Induction Power Stage', 'Control & Sensing Electronics', 'Thermal & EMC']],
  ['Software System', ['Platform Software', 'Sensor Processing', 'Heating & Safety Control', 'HMI & Diagnostics SW']],
]);
const IBD_MAIN_FLOW = ['power_cord', 'ac_protection', 'rectifier_dc_bus', 'lower_power_pcb', 'resonant_network', 'coil_120mm', 'pot_boiler'];
const IBD_CONTROL = ['aux_psu', 'upper_control_pcb', 'mcu', 'ir_sensor'];
const IBD_SUPPORT = ['upper_lower_link', 'cooling'];
const REQUIREMENT_GROUP_ORDER = ['REQ-M-', 'REQ-H-', 'REQ-SW-'];

function workspace(project, id) {
  const file = project.workspaceFiles?.find(value => value.id === id);
  if (!file) throw new Error(`Workspace ${id} is missing`);
  return file;
}

function setBox(node, x, y, width, height) {
  node.x = Math.round(x);
  node.y = Math.round(y);
  node.width = width;
  node.height = height;
}

function byName(values) {
  return new Map(values.map(value => [value.name, value]));
}

const CHILD_PATTERNS = {
  0: [],
  1: [{ x: 0, y: 0 }],
  2: [{ x: -120, y: 0 }, { x: 120, y: 0 }],
  3: [{ x: -190, y: 0 }, { x: 190, y: 0 }, { x: 0, y: 210 }],
  4: [{ x: -220, y: 0 }, { x: 220, y: 0 }, { x: -105, y: 210 }, { x: 105, y: 210 }],
};

function layoutBdd(data) {
  const blocksById = new Map(data.blocks.map(value => [value.id, value]));
  const blocksByName = byName(data.blocks);
  const children = new Map();
  for (const relationship of data.relationships) {
    if (relationship.type !== 'composition') continue;
    const list = children.get(relationship.sourceId) ?? [];
    list.push(relationship.targetId);
    children.set(relationship.sourceId, list);
  }

  const root = blocksByName.get('Smart Induction Coffee Heater');
  if (!root) throw new Error('BDD root Smart Induction Coffee Heater is missing');
  const domainGap = 180;
  const clusterGap = 55;
  let cursorX = 0;
  const domainCenters = [];

  for (const domainName of BDD_DOMAIN_ORDER) {
    const domain = blocksByName.get(domainName);
    if (!domain) throw new Error(`BDD domain ${domainName} is missing`);
    const preferredOrder = BDD_SUBSYSTEM_ORDER.get(domainName) ?? [];
    const directSubsystemIds = children.get(domain.id) ?? [];
    const directSubsystems = directSubsystemIds.map(id => blocksById.get(id)).filter(Boolean);
    
    // Sort directSubsystems by preferredOrder if found, otherwise keep original order
    directSubsystems.sort((a, b) => {
      const ia = preferredOrder.indexOf(a.name);
      const ib = preferredOrder.indexOf(b.name);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });

    const clusters = directSubsystems.map(subsystem => {
      const childIds = children.get(subsystem.id) ?? [];
      const pattern = CHILD_PATTERNS[childIds.length];
      if (!pattern) throw new Error(`BDD subsystem ${subsystem.name} has unsupported child count ${childIds.length}`);
      const halfWidth = childIds.length <= 1 ? 105 : childIds.length === 2 ? 235 : childIds.length === 3 ? 300 : 330;
      return { subsystem, childIds, pattern, width: halfWidth * 2 };
    });
    const domainStart = cursorX;
    for (const cluster of clusters) {
      const centerX = cursorX + cluster.width / 2;
      setBox(cluster.subsystem, centerX - 105, 390, 210, 100);
      cluster.childIds.forEach((childId, index) => {
        const child = blocksById.get(childId);
        const offset = cluster.pattern[index];
        setBox(child, centerX + offset.x - 102.5, 650 + offset.y, 205, 110);
      });
      cursorX += cluster.width + clusterGap;
    }
    cursorX -= clusterGap;
    const domainEnd = cursorX;
    const domainCenter = (domainStart + domainEnd) / 2;
    setBox(domain, domainCenter - 112.5, 180, 225, 110);
    domainCenters.push(domainCenter);
    cursorX += domainGap;
  }

  setBox(root, (domainCenters[0] + domainCenters.at(-1)) / 2 - 130, -40, 260, 125);
  for (const block of data.blocks) {
    block.ports = [];
    block.satisfiedReqIds = [];
  }
}

function requirementPrefix(reqId) {
  return REQUIREMENT_GROUP_ORDER.find(prefix => reqId?.startsWith(prefix));
}

function layoutRequirements(data) {
  const blocksById = new Map(data.blocks.map(value => [value.id, value]));
  const requirements = data.blocks.filter(value => value.stereotype === 'requirement');
  const groupWidth = 940;
  const rowGap = 145;
  const requirementXOffset = 0;
  const satisfierXOffset = 390;

  REQUIREMENT_GROUP_ORDER.forEach((prefix, groupIndex) => {
    const baseX = groupIndex * groupWidth;
    const groupRequirements = requirements
      .filter(value => requirementPrefix(value.reqId) === prefix)
      .sort((a, b) => a.reqId.localeCompare(b.reqId, undefined, { numeric: true }));

    groupRequirements.forEach((requirement, rowIndex) => {
      setBox(requirement, baseX + requirementXOffset, 40 + rowIndex * rowGap, 300, 120);
    });

    const satisfierRows = new Map();
    for (const relationship of data.relationships) {
      if (relationship.type !== 'satisfy') continue;
      const requirement = blocksById.get(relationship.targetId);
      if (!requirement || requirementPrefix(requirement.reqId) !== prefix) continue;
      const rows = satisfierRows.get(relationship.sourceId) ?? [];
      rows.push(groupRequirements.indexOf(requirement));
      satisfierRows.set(relationship.sourceId, rows);
    }

    for (const [satisfierId, rows] of satisfierRows) {
      const satisfier = blocksById.get(satisfierId);
      if (!satisfier) continue;
      const averageRow = rows.reduce((sum, value) => sum + value, 0) / rows.length;
      setBox(satisfier, baseX + satisfierXOffset, 50 + averageRow * rowGap, 240, 100);
    }
  });
}

function layoutIbd(data) {
  const partsByName = byName(data.parts);
  let mainIndex = 0;
  IBD_MAIN_FLOW.forEach((name) => {
    const part = partsByName.get(name);
    if (part) {
      setBox(part, 40 + mainIndex * 225, 360, 175, 105);
      mainIndex++;
    }
  });
  const controlX = [490, 715, 940, 1165];
  let controlIndex = 0;
  IBD_CONTROL.forEach((name) => {
    const part = partsByName.get(name);
    if (part) {
      setBox(part, controlX[controlIndex % controlX.length], 90, 175, 105);
      controlIndex++;
    }
  });
  const supportX = [760, 1040];
  let supportIndex = 0;
  IBD_SUPPORT.forEach((name) => {
    const part = partsByName.get(name);
    if (part) {
      setBox(part, supportX[supportIndex % supportX.length], 630, 175, 105);
      supportIndex++;
    }
  });
  const placedNames = new Set([...IBD_MAIN_FLOW, ...IBD_CONTROL, ...IBD_SUPPORT]);
  data.parts.filter(p => !placedNames.has(p.name)).forEach((part, i) => {
    setBox(part, 40 + i * 225, 800, 175, 105);
  });
}

function assertUnique(values, label) {
  const ids = values.map(value => value.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate IDs`);
}

function assertEndpointSet(relationships, ids, label) {
  for (const relationship of relationships) {
    if (!ids.has(relationship.sourceId)) {
      throw new Error(`${label} relationship ${relationship.id} source ${relationship.sourceId} does not resolve`);
    }
    if (!ids.has(relationship.targetId)) {
      throw new Error(`${label} relationship ${relationship.id} target ${relationship.targetId} does not resolve`);
    }
  }
}

function comparableNonTargetWorkspaces(project) {
  return project.workspaceFiles
    .filter(file => !['default_bdd', 'default_requirements', 'default_ibd'].includes(file.id))
    .map(file => structuredClone(file));
}

function comparableProjectShell(project, bddIds, partIds) {
  const clone = structuredClone(project);
  clone.workspaceFiles = [];
  for (const block of clone.blocks) {
    if (!bddIds.has(block.id)) continue;
    delete block.x;
    delete block.y;
    delete block.width;
    delete block.height;
  }
  for (const part of clone.parts) {
    if (!partIds.has(part.id)) continue;
    delete part.x;
    delete part.y;
    delete part.width;
    delete part.height;
  }
  return clone;
}

export function validateProject(original, redesigned) {
  const bdd = workspace(redesigned, 'default_bdd').data;
  const requirements = workspace(redesigned, 'default_requirements').data;
  const ibd = workspace(redesigned, 'default_ibd').data;
  assertUnique(redesigned.blocks, 'Root blocks');
  assertUnique(redesigned.relationships, 'Root relationships');
  assertUnique(redesigned.parts, 'Root parts');
  assertUnique(redesigned.connectors, 'Root connectors');
  if (bdd.blocks.length !== 46 && original.workspaceFiles.find(file => file.id === 'default_bdd').data.blocks.length === 46) {
    throw new Error(`BDD block count changed to ${bdd.blocks.length}`);
  }
  if (bdd.relationships.length !== original.workspaceFiles.find(file => file.id === 'default_bdd').data.relationships.length) {
    throw new Error('BDD relationship count changed');
  }
  if (!bdd.relationships.every(value => value.type === 'composition')) throw new Error('BDD contains a non-composition relationship');
  if (!bdd.blocks.every(value => value.ports.length === 0 && value.satisfiedReqIds.length === 0)) throw new Error('BDD contains ports or satisfiedReqIds');
  assertUnique(bdd.blocks, 'BDD blocks');
  assertEndpointSet(bdd.relationships, new Set(bdd.blocks.map(value => value.id)), 'BDD');
  assertUnique(requirements.blocks, 'Requirements blocks');
  assertUnique(requirements.relationships, 'Requirements relationships');
  if (!requirements.relationships.every(value => value.type === 'satisfy')) throw new Error('Requirements contains a non-satisfy relationship');
  assertEndpointSet(requirements.relationships, new Set(requirements.blocks.map(value => value.id)), 'Requirements');
  assertUnique(ibd.parts, 'IBD parts');
  assertUnique(ibd.connectors, 'IBD connectors');
  const partIds = new Set(ibd.parts.map(value => value.id));
  const rootBlocksById = new Map(redesigned.blocks.map(value => [value.id, value]));
  const partsById = new Map(ibd.parts.map(value => [value.id, value]));
  for (const connector of ibd.connectors) {
    if (!partIds.has(connector.sourcePartId) || !partIds.has(connector.targetPartId)) throw new Error(`IBD connector ${connector.id} has a missing part endpoint`);
    for (const [partKey, portKey] of [['sourcePartId', 'sourcePortId'], ['targetPartId', 'targetPortId']]) {
      const part = partsById.get(connector[partKey]);
      const typeBlock = rootBlocksById.get(part.typeId);
      if (typeBlock?.ports?.length && !typeBlock.ports.some(port => port.id === connector[portKey])) {
        throw new Error(`IBD connector ${connector.id} port ${connector[portKey]} does not resolve through ${part.name}`);
      }
    }
  }
  if (JSON.stringify(comparableNonTargetWorkspaces(original)) !== JSON.stringify(comparableNonTargetWorkspaces(redesigned))) {
    throw new Error('A non-target workspace changed');
  }
  const bddIds = new Set(bdd.blocks.map(value => value.id));
  if (JSON.stringify(comparableProjectShell(original, bddIds, partIds)) !== JSON.stringify(comparableProjectShell(redesigned, bddIds, partIds))) {
    throw new Error('Unified root data changed outside approved BDD and IBD coordinates');
  }
  if (redesigned.activeFileId !== 'default_bdd') throw new Error('default_bdd is not active');
  if (JSON.stringify(redesigned.openTabIds) !== JSON.stringify(original.openTabIds)) throw new Error('Open tabs changed');
  return {
    bddBlocks: bdd.blocks.length,
    bddRelationships: bdd.relationships.length,
    requirementBlocks: requirements.blocks.length,
    satisfyRelationships: requirements.relationships.length,
    ibdParts: ibd.parts.length,
    ibdConnectors: ibd.connectors.length,
  };
}

export function segmentIntersectsRect(start, end, rect) {
  const minX = rect.x;
  const maxX = rect.x + rect.width;
  const minY = rect.y;
  const maxY = rect.y + rect.height;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let low = 0;
  let high = 1;
  for (const [origin, delta, min, max] of [[start.x, dx, minX, maxX], [start.y, dy, minY, maxY]]) {
    if (delta === 0) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    low = Math.max(low, Math.min(first, second));
    high = Math.min(high, Math.max(first, second));
    if (low > high) return false;
  }
  return true;
}

function assertNoBddConnectorThroughBlocks(data) {
  const blocksById = new Map(data.blocks.map(value => [value.id, value]));
  for (const relationship of data.relationships) {
    const source = blocksById.get(relationship.sourceId);
    const target = blocksById.get(relationship.targetId);
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    for (const block of data.blocks) {
      if (block.id === source.id || block.id === target.id) continue;
      const interior = { x: block.x + 3, y: block.y + 3, width: block.width - 6, height: block.height - 6 };
      if (segmentIntersectsRect(start, end, interior)) {
        throw new Error(`BDD relationship ${relationship.id} passes through unrelated block ${block.name}`);
      }
    }
  }
}

function mirrorBddCoordinatesToRoot(project, bddBlocks) {
  const bddById = new Map(bddBlocks.map(value => [value.id, value]));
  for (const rootBlock of project.blocks) {
    const bddBlock = bddById.get(rootBlock.id);
    if (!bddBlock) continue;
    rootBlock.x = bddBlock.x;
    rootBlock.y = bddBlock.y;
    rootBlock.width = bddBlock.width;
    rootBlock.height = bddBlock.height;
  }
}

function mirrorIbdCoordinatesToRoot(project, ibdParts) {
  const ibdById = new Map(ibdParts.map(value => [value.id, value]));
  for (const rootPart of project.parts) {
    const ibdPart = ibdById.get(rootPart.id);
    if (!ibdPart) continue;
    rootPart.x = ibdPart.x;
    rootPart.y = ibdPart.y;
    rootPart.width = ibdPart.width;
    rootPart.height = ibdPart.height;
  }
}

export function redesignProject(project) {
  const redesigned = structuredClone(project);
  const bdd = workspace(redesigned, 'default_bdd').data;
  const requirements = workspace(redesigned, 'default_requirements').data;
  const ibd = workspace(redesigned, 'default_ibd').data;
  layoutBdd(bdd);
  layoutRequirements(requirements);
  layoutIbd(ibd);
  mirrorBddCoordinatesToRoot(redesigned, bdd.blocks);
  mirrorIbdCoordinatesToRoot(redesigned, ibd.parts);
  redesigned.activeFileId = 'default_bdd';
  assertNoBddConnectorThroughBlocks(bdd);
  validateProject(project, redesigned);
  return redesigned;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const input = argument('--input');
  const output = argument('--output');
  const validateOnly = argument('--validate-only');
  if (validateOnly) {
    const project = JSON.parse(fs.readFileSync(validateOnly, 'utf8'));
    const summary = validateProject(project, project);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return;
  }
  if (!input || !output) throw new Error('Usage: node scripts/adiaLayoutTransformer.mjs --input <source.json> --output <corrected.json>');
  const original = JSON.parse(fs.readFileSync(input, 'utf8'));
  const redesigned = redesignProject(original);
  const productionSummary = validateProject(original, redesigned);
  const expected = { bddBlocks: 46, bddRelationships: 45, requirementBlocks: 67, satisfyRelationships: 38, ibdParts: 13, ibdConnectors: 14 };
  for (const [key, value] of Object.entries(expected)) {
    if (productionSummary[key] !== value) throw new Error(`${key} expected ${value}, received ${productionSummary[key]}`);
  }
  fs.writeFileSync(output, `${JSON.stringify(redesigned, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ output: path.resolve(output), ...productionSummary })}\n`);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) main().catch(error => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
