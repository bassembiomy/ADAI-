# Adia Unified Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a validated Adia project JSON whose BDD, Requirements, and IBD workspaces use the three approved compact layouts without changing engineering content or creating dangling links.

**Architecture:** Add one pure Node.js transformer with a small CLI. The transformer deep-clones the imported project, lays out each target workspace independently, mirrors BDD coordinates into the unified root blocks, and validates topology and counts before writing output. Node's built-in test runner exercises layout geometry and invalid-endpoint handling; a real-file run creates the corrected JSON and performs full structural regression checks.

**Tech Stack:** Node.js 20+, ECMAScript modules, `node:test`, `node:assert/strict`, existing Adia JSON schema.

## Global Constraints

- Preserve every existing object ID, object name, property, operation, constraint, stereotype, requirement description, state-machine element, X-Bridges element, V-Lab element, HIL setting, ENTROPY element, HMI element, and DOE value.
- Preserve 46 BDD blocks, 45 BDD composition relationships, 67 Requirements-view blocks, 38 satisfy relationships, 13 IBD parts, and 14 IBD connectors.
- Do not add duplicate blocks, synthetic routing nodes, new relationships, or new connectors.
- Keep BDD workspace ports and `satisfiedReqIds` empty; preserve root block ports because the IBD resolves connector ports through root type blocks.
- Keep `default_bdd` active and preserve the existing open tabs.
- Preserve the source file at `C:\Users\EL-Dawlia\Downloads\adia_project_unified_bdd_no_dangling_links.json` unchanged.
- Write the corrected output to `G:\adia project\adia_project_unified_adia_corrected.json` as UTF-8 JSON.

---

## File Structure

- Create `scripts/adiaLayoutTransformer.mjs`: pure transformation functions, geometry/topology validation, CLI argument parsing, source reading, and output writing.
- Create `scripts/adiaLayoutTransformer.test.mjs`: focused unit fixtures for the BDD tree, paired Requirements groups, layered IBD, dangling endpoints, and connector-through-node geometry.
- Create `adia_project_unified_adia_corrected.json`: generated user deliverable; do not stage or commit this generated file.

### Task 1: Lock the Layout and Validation Contracts with Tests

**Files:**
- Create: `scripts/adiaLayoutTransformer.test.mjs`
- Test: `scripts/adiaLayoutTransformer.test.mjs`

**Interfaces:**
- Consumes: `redesignProject(project: object): object`, `validateProject(original: object, redesigned: object): ValidationSummary`, and `segmentIntersectsRect(start, end, rect): boolean` from `scripts/adiaLayoutTransformer.mjs`.
- Produces: executable contracts for the transformer and a reusable `makeFixture()` test project.

- [ ] **Step 1: Write the failing transformer tests**

Create `scripts/adiaLayoutTransformer.test.mjs` with a compact fixture that retains the real workspace shapes:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redesignProject,
  segmentIntersectsRect,
  validateProject,
} from './adiaLayoutTransformer.mjs';

const block = (id, name, extra = {}) => ({
  id,
  name,
  stereotype: 'block',
  x: 0,
  y: 0,
  width: 205,
  height: 110,
  properties: [],
  operations: [],
  constraints: [],
  classes: [],
  ports: [],
  satisfiedReqIds: [],
  ...extra,
});

const rel = (id, sourceId, targetId, type = 'composition') => ({
  id,
  sourceId,
  targetId,
  type,
  label: '',
});

function makeFixture() {
  const architecture = [
    block('root', 'Smart Induction Coffee Heater'),
    block('mechanical', 'Mechanical System'),
    block('hardware', 'Hardware System'),
    block('software', 'Software System'),
    block('power', 'Mains & DC Power'),
    block('protection', 'AC Input + Protection', {
      ports: [{ id: 'p-in', name: 'AC In', type: 'power', direction: 'in' }],
    }),
    block('bus', 'Bridge Rectifier + HV DC Bus', {
      ports: [{ id: 'p-out', name: 'DC Out', type: 'power', direction: 'out' }],
    }),
    block('aux', 'Isolated Auxiliary PSU'),
  ];
  const bddRelationships = [
    rel('r-root-m', 'root', 'mechanical'),
    rel('r-root-h', 'root', 'hardware'),
    rel('r-root-s', 'root', 'software'),
    rel('r-h-power', 'hardware', 'power'),
    rel('r-power-protection', 'power', 'protection'),
    rel('r-power-bus', 'power', 'bus'),
    rel('r-power-aux', 'power', 'aux'),
  ];
  const requirements = [
    block('req-m', 'Housing Material', { stereotype: 'requirement', reqId: 'REQ-M-001' }),
    block('req-h1', 'Input Protection', { stereotype: 'requirement', reqId: 'REQ-H-002' }),
    block('req-h2', 'Mains Input', { stereotype: 'requirement', reqId: 'REQ-H-001' }),
  ];
  const requirementBlocks = [architecture[1], architecture[5], ...requirements].map(value => structuredClone(value));
  const satisfy = [
    rel('sat-m', 'mechanical', 'req-m', 'satisfy'),
    rel('sat-h1', 'protection', 'req-h1', 'satisfy'),
    rel('sat-h2', 'protection', 'req-h2', 'satisfy'),
  ];
  const parts = [
    { id: 'part-cord', name: 'power_cord', blockId: 'root', typeId: 'protection', x: 0, y: 0, width: 175, height: 105 },
    { id: 'part-bus', name: 'rectifier_dc_bus', blockId: 'root', typeId: 'bus', x: 0, y: 0, width: 175, height: 105 },
    { id: 'part-aux', name: 'aux_psu', blockId: 'root', typeId: 'aux', x: 0, y: 0, width: 175, height: 105 },
  ];
  const connectors = [
    { id: 'c1', sourcePartId: 'part-cord', sourcePortId: 'p-in', targetPartId: 'part-bus', targetPortId: 'p-out' },
  ];

  return {
    projectName: 'Fixture',
    blocks: [...architecture, ...requirements].map(value => structuredClone(value)),
    relationships: [...bddRelationships, ...satisfy].map(value => structuredClone(value)),
    parts: structuredClone(parts),
    connectors: structuredClone(connectors),
    workspaceFiles: [
      { id: 'default_bdd', type: 'bdd', data: { blocks: structuredClone(architecture), relationships: structuredClone(bddRelationships), customStereotypes: [] } },
      { id: 'default_requirements', type: 'requirements', data: { blocks: requirementBlocks, relationships: structuredClone(satisfy) } },
      { id: 'default_ibd', type: 'ibd', data: { parts: structuredClone(parts), connectors: structuredClone(connectors), interfaceRealizations: [] } },
      { id: 'default_sm', type: 'statemachine', data: { states: [{ id: 'untouched' }] } },
    ],
    openTabIds: ['default_bdd', 'default_requirements', 'default_ibd'],
    activeFileId: 'default_bdd',
  };
}

test('BDD layout keeps a centered tree and avoids connector-through-node geometry', () => {
  const original = makeFixture();
  const redesigned = redesignProject(original);
  const bdd = redesigned.workspaceFiles.find(file => file.id === 'default_bdd').data;
  const byId = new Map(bdd.blocks.map(value => [value.id, value]));

  assert.ok(byId.get('root').y < byId.get('hardware').y);
  assert.ok(byId.get('hardware').y < byId.get('power').y);
  assert.ok(byId.get('power').y < byId.get('aux').y);
  assert.equal(bdd.relationships.every(value => value.type === 'composition'), true);
  assert.equal(bdd.blocks.every(value => value.ports.length === 0), true);
  assert.equal(bdd.blocks.every(value => value.satisfiedReqIds.length === 0), true);
  assert.doesNotThrow(() => validateProject(original, redesigned));
});

test('Requirements layout pairs one satisfier beside all requirements it satisfies', () => {
  const redesigned = redesignProject(makeFixture());
  const data = redesigned.workspaceFiles.find(file => file.id === 'default_requirements').data;
  const byId = new Map(data.blocks.map(value => [value.id, value]));
  const satisfier = byId.get('protection');
  const req1 = byId.get('req-h1');
  const req2 = byId.get('req-h2');

  assert.ok(satisfier.x > req1.x);
  assert.ok(satisfier.x > req2.x);
  assert.ok(satisfier.y >= Math.min(req1.y, req2.y));
  assert.ok(satisfier.y <= Math.max(req1.y, req2.y));
});

test('IBD layout puts the main flow on one row and auxiliary power above it', () => {
  const redesigned = redesignProject(makeFixture());
  const data = redesigned.workspaceFiles.find(file => file.id === 'default_ibd').data;
  const byName = new Map(data.parts.map(value => [value.name, value]));

  assert.equal(byName.get('power_cord').y, byName.get('rectifier_dc_bus').y);
  assert.ok(byName.get('aux_psu').y < byName.get('rectifier_dc_bus').y);
});

test('validator rejects a relationship with a missing endpoint', () => {
  const original = makeFixture();
  const redesigned = redesignProject(original);
  redesigned.workspaceFiles.find(file => file.id === 'default_bdd').data.relationships[0].targetId = 'missing';

  assert.throws(
    () => validateProject(original, redesigned),
    /BDD relationship r-root-m target missing does not resolve/,
  );
});

test('segmentIntersectsRect detects a connector passing through an unrelated node', () => {
  assert.equal(
    segmentIntersectsRect({ x: 0, y: 50 }, { x: 300, y: 50 }, { x: 120, y: 20, width: 60, height: 60 }),
    true,
  );
  assert.equal(
    segmentIntersectsRect({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 120, y: 20, width: 60, height: 60 }),
    false,
  );
});
```

- [ ] **Step 2: Run the tests and verify the module is missing**

Run:

```powershell
node --test scripts/adiaLayoutTransformer.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/adiaLayoutTransformer.mjs`.

- [ ] **Step 3: Commit the failing contract**

```powershell
git add -- scripts/adiaLayoutTransformer.test.mjs
git commit -m "test: define Adia layout transformation contracts"
```

### Task 2: Implement the Pure Adia Layout Transformer

**Files:**
- Create: `scripts/adiaLayoutTransformer.mjs`
- Test: `scripts/adiaLayoutTransformer.test.mjs`

**Interfaces:**
- Consumes: an imported Adia project object with `blocks`, `relationships`, `workspaceFiles`, `openTabIds`, and `activeFileId`.
- Produces: `redesignProject(project)`, `validateProject(original, redesigned)`, `segmentIntersectsRect(start, end, rect)`, and a CLI accepting `--input`, `--output`, or `--validate-only`.

- [ ] **Step 1: Add deterministic layout constants and workspace helpers**

Create `scripts/adiaLayoutTransformer.mjs` with these public constants and helpers:

```js
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
```

- [ ] **Step 2: Implement the compact BDD cluster layout**

Use the actual composition topology, curated domain/subsystem ordering, and a connector-safe two-row child pattern:

```js
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
    const subsystemNames = BDD_SUBSYSTEM_ORDER.get(domainName);
    const clusters = subsystemNames.map(name => {
      const subsystem = blocksByName.get(name);
      if (!subsystem) throw new Error(`BDD subsystem ${name} is missing`);
      const childIds = children.get(subsystem.id) ?? [];
      const pattern = CHILD_PATTERNS[childIds.length];
      if (!pattern) throw new Error(`BDD subsystem ${name} has unsupported child count ${childIds.length}`);
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
```

This placement keeps every second-row child line inside the gap between the two first-row children, eliminating the exact false-dangling pattern visible in the supplied screenshot.

- [ ] **Step 3: Implement paired Requirements groups**

Place Mechanical, Hardware, and Software groups side by side. Requirements use the left column of each group; a satisfying block uses one location centered across every requirement it satisfies:

```js
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
      const averageRow = rows.reduce((sum, value) => sum + value, 0) / rows.length;
      setBox(satisfier, baseX + satisfierXOffset, 50 + averageRow * rowGap, 240, 100);
    }
  });
}
```

- [ ] **Step 4: Implement the layered IBD layout**

Use fixed functional lanes and align support parts beneath the related control/power region:

```js
function layoutIbd(data) {
  const partsByName = byName(data.parts);
  IBD_MAIN_FLOW.forEach((name, index) => {
    const part = partsByName.get(name);
    if (!part) throw new Error(`IBD main-flow part ${name} is missing`);
    setBox(part, 40 + index * 225, 360, 175, 105);
  });
  const controlX = [490, 715, 940, 1165];
  IBD_CONTROL.forEach((name, index) => {
    const part = partsByName.get(name);
    if (!part) throw new Error(`IBD control part ${name} is missing`);
    setBox(part, controlX[index], 90, 175, 105);
  });
  const supportX = [760, 1040];
  IBD_SUPPORT.forEach((name, index) => {
    const part = partsByName.get(name);
    if (!part) throw new Error(`IBD support part ${name} is missing`);
    setBox(part, supportX[index], 630, 175, 105);
  });
}
```

- [ ] **Step 5: Implement topology, count, and semantic-preservation validation**

Add exact collection checks, endpoint checks, port checks, and non-target workspace comparison:

```js
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
```

For fixture compatibility, count assertions compare against the original collection; for the real file, the CLI additionally enforces the exact production counts from Global Constraints.

- [ ] **Step 6: Implement geometry checking, transformation orchestration, and CLI output**

Add a slab-based segment/rectangle intersection helper, mirror only BDD coordinates into root blocks, and validate before writing:

```js
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
```

- [ ] **Step 7: Run the unit tests and verify they pass**

Run:

```powershell
node --test scripts/adiaLayoutTransformer.test.mjs
```

Expected: 5 tests pass, 0 fail.

- [ ] **Step 8: Commit the transformer**

```powershell
git add -- scripts/adiaLayoutTransformer.mjs
git commit -m "feat: add deterministic Adia layout transformer"
```

### Task 3: Transform and Validate the Supplied Unified Project

**Files:**
- Read: `C:\Users\EL-Dawlia\Downloads\adia_project_unified_bdd_no_dangling_links.json`
- Create: `adia_project_unified_adia_corrected.json`
- Modify if validation exposes a defect: `scripts/adiaLayoutTransformer.mjs`
- Test: `scripts/adiaLayoutTransformer.test.mjs`

**Interfaces:**
- Consumes: the approved source JSON and the Task 2 CLI.
- Produces: `G:\adia project\adia_project_unified_adia_corrected.json` and a six-count validation summary.

- [ ] **Step 1: Record the source hash and timestamp without modifying the source**

Run:

```powershell
Get-FileHash -Algorithm SHA256 'C:\Users\EL-Dawlia\Downloads\adia_project_unified_bdd_no_dangling_links.json'
Get-Item 'C:\Users\EL-Dawlia\Downloads\adia_project_unified_bdd_no_dangling_links.json' | Select-Object FullName,Length,LastWriteTime
```

Expected: one SHA-256 hash plus the source metadata.

- [ ] **Step 2: Generate the corrected file**

Run:

```powershell
node scripts/adiaLayoutTransformer.mjs --input 'C:\Users\EL-Dawlia\Downloads\adia_project_unified_bdd_no_dangling_links.json' --output 'G:\adia project\adia_project_unified_adia_corrected.json'
```

Expected JSON summary:

```json
{"bddBlocks":46,"bddRelationships":45,"requirementBlocks":67,"satisfyRelationships":38,"ibdParts":13,"ibdConnectors":14}
```

- [ ] **Step 3: Run the validator against the generated file**

Run:

```powershell
node scripts/adiaLayoutTransformer.mjs --validate-only 'G:\adia project\adia_project_unified_adia_corrected.json'
```

Expected: the same six counts and exit code 0.

- [ ] **Step 4: Confirm the source file hash and timestamp did not change**

Repeat Step 1 and compare the hash, length, and `LastWriteTime` with the recorded values.

Expected: exact match.

- [ ] **Step 5: Run the unit tests again after the production transformation**

Run:

```powershell
node --test scripts/adiaLayoutTransformer.test.mjs
```

Expected: 5 tests pass, 0 fail.

### Task 4: Visually Verify the Three Views in Adia

**Files:**
- Read: `adia_project_unified_adia_corrected.json`
- Modify only if visual verification fails: `scripts/adiaLayoutTransformer.mjs`
- Regenerate: `adia_project_unified_adia_corrected.json`

**Interfaces:**
- Consumes: corrected JSON and the existing Adia web fallback importer.
- Produces: verified BDD, Requirements, and IBD renderings with no overlapping nodes or false-dangling lines.

- [ ] **Step 1: Start the Adia development server**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Expected: Vite reports a local URL and remains running.

- [ ] **Step 2: Open the local Adia URL and import the corrected JSON**

Use the browser's visible **Import** button and its `.json` file chooser to select:

```text
G:\adia project\adia_project_unified_adia_corrected.json
```

Expected: the project loads with `System Architecture BDD` active and no parse error notification.

- [ ] **Step 3: Inspect the BDD**

Verify all of the following:

- The root is centered above Mechanical, Hardware, and Software.
- Each domain's subsystem clusters stay within their domain band.
- No component overlaps another component.
- No composition line passes behind an upper-row component and reappears as a dangling line.
- No requirement or satisfy line appears in the BDD.

If one check fails, adjust only `CHILD_PATTERNS`, cluster widths, or gaps; add a regression assertion to `scripts/adiaLayoutTransformer.test.mjs`; rerun Tasks 2 Step 7 and Task 3 Steps 2-3.

- [ ] **Step 4: Inspect Requirements and IBD**

Requirements verification:

- Mechanical, Hardware, and Software groups are spatially separate.
- Every requirement has a visible satisfy line.
- Multi-requirement satisfiers sit between the requirements they satisfy.
- No satisfy line terminates in empty space.

IBD verification:

- The seven-part main energy path reads left-to-right on one row.
- Aux PSU, upper control PCB, MCU, and IR sensor sit above the main flow.
- Upper/lower link and cooling sit below the main flow.
- All 14 connectors terminate at visible parts and ports.

If a check fails, adjust only the affected layout function, add a regression assertion, regenerate the output, and repeat the failed view.

- [ ] **Step 5: Run the final verification commands**

Run:

```powershell
node --test scripts/adiaLayoutTransformer.test.mjs
node scripts/adiaLayoutTransformer.mjs --validate-only 'G:\adia project\adia_project_unified_adia_corrected.json'
git status --short
```

Expected: all tests pass; validation reports `46/45/67/38/13/14`; the corrected JSON is present as an untracked deliverable; unrelated pre-existing modifications remain untouched.

- [ ] **Step 6: Commit any verification-driven transformer/test corrections**

Run only when Task 4 required code changes:

```powershell
git add -- scripts/adiaLayoutTransformer.mjs scripts/adiaLayoutTransformer.test.mjs
git commit -m "fix: refine Adia diagram layout geometry"
```
