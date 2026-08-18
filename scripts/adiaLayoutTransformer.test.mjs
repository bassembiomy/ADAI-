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
