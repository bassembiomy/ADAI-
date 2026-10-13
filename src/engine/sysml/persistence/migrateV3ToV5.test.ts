import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type ConnectorUsage } from '../model';
import {
  compareBaselines,
  createBaseline,
  loadRepository,
  prepareSysmlStateForSave,
  serializeRepository,
  serializeSysmlProjectState,
} from '../persistence';
import { connectorEndOf, resolveConnectorEnd, validatePathConnector } from '../connectorEnds';
import { deriveIbdView, validateConnector } from '../ibd';
import { validateSysmlRepository } from '../validation';
import { analyzeMutation, applyCommand } from '../mutations';
import { stableDiagramPresentationId, type DiagramPresentation } from '../presentationState';
import { migrateRepositoryToV5, rekeyPresentationState } from './migrateV3ToV5';

import { asV3, block, divergentModel, flatModel, nestedModel, one, part, portUsage, presentation } from '../fixtures/formatV3Models';

function names(report: { changes: Array<{ message: string; names: string[] }> }): string {
  return report.changes.map(change => change.message).join('\n');
}

describe('format 5 upgrade: flat parts, ports, connectors and relationships', () => {
  const loaded = loadRepository(asV3(flatModel()));
  const repo = loaded.repository;

  it('loads without errors, reports the upgrade and removes every usage record', () => {
    expect(loaded.valid).toBe(true);
    expect(loaded.migrated).toBe(true);
    expect(loaded.upgradeReport?.fromVersion).toBe(3);
    expect(loaded.upgradeReport?.toVersion).toBe(5);
    expect(Object.keys(repo.usages)).toEqual([]);
    expect(loaded.diagnostics.map(d => d.code)).toContain('FORMAT_UPGRADED_TO_V5');
  });

  it('keeps each part as its Block property and does not duplicate it', () => {
    const vehicle = repo.definitions['b-veh'] as BlockDefinition;
    expect(vehicle.properties.map(p => p.id)).toEqual(['pr-engine', 'pr-wheel', 'pr-mass', 'pr-mass2']);
    expect(loaded.upgradeReport!.keyMap['u-eng']).toBe('pr-engine');
    expect(loaded.upgradeReport!.keyMap['pu-eng-torque']).toBe('pr-engine#po-eng-torque');
    expect(loaded.upgradeReport!.keyMap['pu-veh-fuel']).toBe('#po-veh-fuel');
  });

  it('rewrites connectors of every end kind to paths and they validate', () => {
    const asm = repo.connectors['c-asm'];
    expect(connectorEndOf(asm, 'source')).toEqual({ path: ['pr-engine'], portId: 'po-eng-torque' });
    expect(connectorEndOf(asm, 'target')).toEqual({ path: ['pr-wheel'], portId: 'po-whl-torque' });
    expect(connectorEndOf(repo.connectors['c-del'], 'source')).toEqual({ path: [], portId: 'po-veh-fuel' });
    expect(connectorEndOf(repo.connectors['c-del'], 'target')).toEqual({ path: ['pr-engine'], portId: 'po-eng-fuel' });
    expect(connectorEndOf(repo.connectors['c-part'], 'source')).toEqual({ path: ['pr-engine'] });
    expect(connectorEndOf(repo.connectors['c-part'], 'target')).toEqual({ path: ['pr-wheel'] });
    // The parametric binding keeps its property ends untouched.
    expect(repo.connectors['c-par'].sourceEnd).toEqual({ propertyId: 'pr-mass' });
    expect(validateConnector(repo, 'c-par').filter(d => d.severity === 'error')).toEqual([]);
    for (const id of ['c-asm', 'c-del', 'c-part']) {
      expect(validatePathConnector(repo, repo.connectors[id]).filter(d => d.severity === 'error')).toEqual([]);
    }
    expect(loaded.interchangeReport.quarantinedConnectorIds).toEqual([]);
    expect(validateSysmlRepository(repo).valid).toBe(true);
  });

  it('rewrites relationships from a part to the property id and keeps them', () => {
    expect(repo.relationships['rl-sat']).toMatchObject({ sourceId: 'pr-engine', targetId: 'rq-1' });
    expect(repo.relationships['rl-alloc']).toMatchObject({ sourceId: 'pr-wheel', targetId: 'b-eng' });
    expect(loaded.interchangeReport.quarantinedRelationshipIds).toEqual([]);
  });

  it('lists every change by name and never shows an id', () => {
    const text = names(loaded.upgradeReport!);
    expect(text).toContain('Vehicle.engine');
    expect(text).toContain('Vehicle.wheel');
    expect(text).toContain('Engine');
    expect(text).toContain('satisfy');
    for (const id of ['u-eng', 'u-whl', 'pu-eng-torque', 'pr-engine', 'po-eng-torque', 'b-veh', 'b-eng', 'c-asm', 'rq-1', 'rl-sat']) {
      expect(text).not.toContain(id);
    }
    const kinds = new Set(loaded.upgradeReport!.changes.map(change => change.kind));
    for (const kind of ['part-to-property', 'port-to-path', 'connector-rewritten', 'relationship-rewritten']) expect(kinds.has(kind as never)).toBe(true);
  });

  it('derives the IBD view of the migrated model from properties and paths', () => {
    const view = deriveIbdView(repo, 'b-veh');
    expect(view.parts.map(p => p.name).sort()).toEqual(['engine', 'wheel']);
    expect(view.parts.map(p => p.id).sort()).toEqual(['pr-engine', 'pr-wheel']);
    expect(view.ports.map(p => p.definition.name).sort()).toEqual(['fuel', 'fuel', 'torque', 'torque']);
    expect(view.connectors.map(c => c.id).sort()).toEqual(['c-asm', 'c-del', 'c-par', 'c-part']);
    expect(view.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('is saved as format 5 and reloads unchanged, exactly once upgraded', () => {
    const serialized = serializeRepository(repo);
    expect(JSON.parse(serialized)).toMatchObject({ format: 'ADIA-SysML', schemaVersion: 5, repository: { schemaVersion: 5, usages: {} } });
    const again = loadRepository(serialized);
    expect(again.migrated).toBe(false);
    expect(again.upgradeReport).toBeUndefined();
    expect(again.diagnostics).toEqual([]);
    expect(again.repository).toEqual(repo);
    expect(serializeRepository(again.repository)).toBe(serialized);
  });
});

describe('format 5 upgrade: presentations', () => {
  it('re-keys part and port presentations by path string and keeps their positions and port layouts', () => {
    const loaded = loadRepository(asV3(flatModel()));
    const before = {
      'b-veh': presentation('b-veh', ['u-eng', 'u-whl', 'pu-eng-torque', 'pu-veh-fuel', 'c-asm'], { 'u-eng': { x: 120, y: 80 } }),
    };
    const coordinates = { 'u-whl': { x: 300, y: 40 }, 'b-veh': { x: 1, y: 2 } };
    const rekeyed = rekeyPresentationState(before, coordinates, loaded.upgradeReport!.keyMap, id => loaded.repository.definitions[id]?.name ?? id);
    const view = rekeyed.presentations['b-veh'];
    expect(view.elementIds).toEqual(['pr-engine', 'pr-wheel', 'pr-engine#po-eng-torque', '#po-veh-fuel', 'c-asm']);
    expect(view.presentations['pr-engine'].bounds).toEqual({ x: 120, y: 80 });
    expect(view.presentations['pr-engine'].semanticElementId).toBe('pr-engine');
    expect(view.presentations['pr-engine'].id).toBe(stableDiagramPresentationId('b-veh', 'pr-engine'));
    expect(view.presentations['pr-engine'].portLayouts).toEqual({ 'po-eng-torque': { side: 'right', offset: 0.5 } });
    expect(view.presentations['u-eng']).toBeUndefined();
    expect(rekeyed.coordinates).toEqual({ 'pr-wheel': { x: 300, y: 40 }, 'b-veh': { x: 1, y: 2 } });
    expect(rekeyed.changes[0].message).toContain('Vehicle');
    expect(rekeyed.changes[0].message).not.toContain('b-veh');
  });

  it('keeps the presentations of a session that still holds usage records when it is saved', () => {
    const session = flatModel();
    const saved = prepareSysmlStateForSave(session, { 'b-veh': presentation('b-veh', ['u-eng', 'c-asm']) }, { 'u-eng': { x: 5, y: 6 } });
    expect(saved.repository.usages).toEqual({});
    expect(session.usages['u-eng']).toBeDefined(); // the live repository is not touched
    expect(saved.presentations['b-veh'].elementIds).toEqual(['pr-engine', 'c-asm']);
    expect(saved.coordinates).toEqual({ 'pr-engine': { x: 5, y: 6 } });
    const state = serializeSysmlProjectState(session, { 'b-veh': presentation('b-veh', ['u-eng']) });
    expect(JSON.parse(state.sysmlRepository).repository.usages).toEqual({});
    expect(state.diagramPresentations['b-veh'].elementIds).toEqual(['pr-engine']);
  });
});

describe('format 5 upgrade: nested part usages', () => {
  it('adds the nested parts to the type of the owner part and addresses them by path', () => {
    const loaded = loadRepository(asV3(nestedModel()));
    const axle = loaded.repository.definitions['b-axle'] as BlockDefinition;
    expect(axle.properties.map(p => p.name)).toEqual(['left', 'right']);
    expect(axle.properties.every(p => p.typeId === 'b-whl' && p.kind === 'part')).toBe(true);
    const leftId = axle.properties[0].id;
    const connector = loaded.repository.connectors['c-nested'];
    expect(connectorEndOf(connector, 'target')).toEqual({ path: ['pr-axle', leftId], portId: 'po-whl-torque' });
    expect(resolveConnectorEnd(loaded.repository, 'b-veh', connectorEndOf(connector, 'target')!).diagnostics).toEqual([]);
    expect(validatePathConnector(loaded.repository, connector).filter(d => d.severity === 'error')).toEqual([]);
    expect(loaded.repository.relationships['rl-nested'].sourceId).toBe(leftId);
    expect(loaded.upgradeReport!.keyMap['u-left']).toBe(`pr-axle/${leftId}`);
    expect(loaded.upgradeReport!.keyMap['pu-left-torque']).toBe(`pr-axle/${leftId}#po-whl-torque`);
    expect(loaded.upgradeReport!.changes.some(change => change.kind === 'nested-property-added' && change.message.includes('Axle'))).toBe(true);
    expect(loaded.upgradeReport!.changes.some(change => change.code === 'NESTED_PART_TYPE_SPECIALISED')).toBe(false);
    expect(loaded.valid).toBe(true);
    const view = deriveIbdView(loaded.repository, 'b-veh');
    expect(view.parts.map(p => p.id)).toContain(`pr-axle/${leftId}`);
  });

  it('reuses a property of the type that already has the same name and type', () => {
    const repo = nestedModel();
    (repo.definitions['b-axle'] as BlockDefinition).properties.push({ id: 'pr-left', name: 'left', kind: 'part', typeId: 'b-whl', multiplicity: one });
    const loaded = loadRepository(asV3(repo));
    const axle = loaded.repository.definitions['b-axle'] as BlockDefinition;
    expect(axle.properties.map(p => p.id).filter(id => id === 'pr-left')).toHaveLength(1);
    expect(axle.properties).toHaveLength(2);
    expect(loaded.upgradeReport!.keyMap['u-left']).toBe('pr-axle/pr-left');
  });

  it('presents nested parts under their path key and rekeys the presentation', () => {
    const loaded = loadRepository(asV3(nestedModel()));
    const leftKey = loaded.upgradeReport!.keyMap['u-left'];
    const rekeyed = rekeyPresentationState({ 'b-veh': presentation('b-veh', ['u-axle', 'u-left']) }, {}, loaded.upgradeReport!.keyMap);
    expect(rekeyed.presentations['b-veh'].elementIds).toEqual(['pr-axle', leftKey]);
  });
});

describe('format 5 upgrade: nested contents that diverge', () => {
  const loaded = loadRepository(asV3(divergentModel()));
  const vehicle = loaded.repository.definitions['b-veh'] as BlockDefinition;
  const blockByName = (name: string) => Object.values(loaded.repository.definitions).find(def => def.name === name) as BlockDefinition | undefined;

  it('creates a specialised subtype per distinct content and retypes the parts', () => {
    const front = vehicle.properties.find(p => p.id === 'pr-a1')!;
    const rear = vehicle.properties.find(p => p.id === 'pr-a2')!;
    const spare = vehicle.properties.find(p => p.id === 'pr-a3')!;
    expect(spare.typeId).toBe('b-axle'); // the part without nested contents stays on the type
    expect(front.typeId).not.toBe('b-axle');
    expect(rear.typeId).not.toBe('b-axle');
    expect(front.typeId).not.toBe(rear.typeId);
    const frontType = loaded.repository.definitions[front.typeId] as BlockDefinition;
    const rearType = loaded.repository.definitions[rear.typeId] as BlockDefinition;
    expect(frontType.properties.map(p => p.name)).toEqual(['left']);
    expect(rearType.properties.map(p => p.name).sort()).toEqual(['left', 'right']);
    expect((loaded.repository.definitions['b-axle'] as BlockDefinition).properties).toEqual([]);
    const generalizations = Object.values(loaded.repository.relationships).filter(r => r.kind === 'generalization');
    expect(generalizations.map(r => `${r.sourceId}>${r.targetId}`).sort()).toEqual([`${front.typeId}>b-axle`, `${rear.typeId}>b-axle`].sort());
  });

  it('reports NESTED_PART_TYPE_SPECIALISED by name and carries the connector through the subtype', () => {
    const specialised = loaded.upgradeReport!.changes.filter(change => change.code === 'NESTED_PART_TYPE_SPECIALISED');
    expect(specialised).toHaveLength(2);
    expect(specialised.every(change => change.severity === 'warning')).toBe(true);
    const text = specialised.map(change => change.message).join('\n');
    expect(text).toContain('Axle');
    expect(text).toContain('Vehicle.front');
    expect(text).toContain('Vehicle.rear');
    expect(text).not.toMatch(/b-axle|pr-a|u-a/);
    expect(loaded.diagnostics.filter(d => d.code === 'NESTED_PART_TYPE_SPECIALISED')).toHaveLength(2);
    const target = connectorEndOf(loaded.repository.connectors['c-div'], 'target')!;
    expect(target.path[0]).toBe('pr-a2');
    expect(resolveConnectorEnd(loaded.repository, 'b-veh', target).diagnostics).toEqual([]);
    expect(validatePathConnector(loaded.repository, loaded.repository.connectors['c-div']).filter(d => d.severity === 'error')).toEqual([]);
    expect(blockByName('Axle (front)')).toBeDefined();
    expect(blockByName('Axle (rear)')).toBeDefined();
    expect(loaded.valid).toBe(true);
  });

  it('survives a save and reload without being upgraded again', () => {
    const again = loadRepository(serializeRepository(loaded.repository));
    expect(again.upgradeReport).toBeUndefined();
    expect(again.repository).toEqual(loaded.repository);
  });
});

describe('format 5 upgrade: baselines', () => {
  it('keeps a baseline matching the elements it still describes', () => {
    const repo = flatModel();
    const { repository: withBaseline } = createBaseline(repo, { id: 'bl-1', name: 'Release 1', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(Object.keys(withBaseline.baselines['bl-1'].elementHashes!)).toContain('u-eng');
    const loaded = loadRepository(asV3(withBaseline));
    const hashes = loaded.repository.baselines['bl-1'].elementHashes!;
    // Part and port records leave the snapshot; everything else keeps matching.
    expect(Object.keys(hashes).filter(id => id.startsWith('u-') || id.startsWith('pu-'))).toEqual([]);
    const { repository: fresh } = createBaseline(loaded.repository, { id: 'bl-now', name: 'Now', createdAt: '2026-02-01T00:00:00.000Z' });
    const combined = { ...fresh, baselines: { ...fresh.baselines, 'bl-1': loaded.repository.baselines['bl-1'] } };
    expect(compareBaselines(combined, 'bl-1', 'bl-now')).toEqual({ added: [], removed: [], changed: [] });
    expect(loaded.upgradeReport!.changes.some(change => change.kind === 'baseline-carried' && change.message.includes('Release 1'))).toBe(true);
    expect(Object.isFrozen(loaded.repository.baselines['bl-1'])).toBe(true);
  });
});

describe('format 5 upgrade: deletion and other readers on the migrated model', () => {
  const loaded = loadRepository(asV3(flatModel()));
  const repo = loaded.repository;

  it('deleting a part removes its property, its connectors and the relationships that end on it', () => {
    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['pr-engine'] });
    expect(impact.deletedElementIds).toEqual(expect.arrayContaining(['pr-engine', 'c-asm', 'c-del', 'c-part', 'rl-sat']));
    expect(impact.deletedElementIds).not.toContain('c-par');
    const applied = applyCommand(repo, { kind: 'deleteElements', elementIds: ['pr-engine'] });
    expect(applied.applied).toBe(true);
    expect((applied.repository.definitions['b-veh'] as BlockDefinition).properties.map(p => p.id)).toEqual(['pr-wheel', 'pr-mass', 'pr-mass2']);
    expect(Object.keys(applied.repository.connectors)).toEqual(['c-par']);
    expect(applied.repository.relationships['rl-sat']).toBeUndefined();
    expect((repo.definitions['b-veh'] as BlockDefinition).properties).toHaveLength(4); // the original is untouched
  });

  it('deleting a Block reports the properties typed by it as unresolved', () => {
    const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['b-eng'] });
    expect(impact.unresolvedUsageIds).toEqual(['pr-engine']);
  });

  it('keeps the V4 view complete for the migrated model', async () => {
    const { migrateV3ToV4 } = await import('./migrateV3ToV4');
    const v4 = migrateV3ToV4(repo as never);
    expect(v4.elements['pr-engine']).toMatchObject({ metaclass: 'PartProperty', name: 'engine' });
    expect(v4.elements['po-eng-torque']).toMatchObject({ metaclass: 'Port' });
    expect(v4.relationships['c-asm']).toMatchObject({ sourceId: 'po-eng-torque', targetId: 'po-whl-torque' });
    expect(v4.relationships['c-part']).toMatchObject({ sourceId: 'pr-engine', targetId: 'pr-wheel' });
    expect(v4.relationships['rl-sat']).toMatchObject({ sourceId: 'pr-engine', targetId: 'rq-1' });
  });
});

describe('format 5 upgrade: robustness', () => {
  it('is a no-op on a repository without usage records', () => {
    const repo = createEmptyRepository();
    repo.definitions['b-a'] = block('b-a', 'A');
    const result = migrateRepositoryToV5(repo);
    expect(result.report.changed).toBe(false);
    expect(result.report.changes).toEqual([]);
  });

  it('reports a part whose owner is gone instead of inventing a place for it', () => {
    const repo = flatModel();
    repo.usages['u-lost'] = part('u-lost', 'lost', 'missing-owner', 'b-whl');
    const result = migrateRepositoryToV5(repo);
    expect(result.report.changes.some(change => change.kind === 'record-dropped' && change.message.includes('lost'))).toBe(true);
    expect(repo.usages).toEqual({});
  });

  it('keeps a connector it cannot resolve and says so', () => {
    const repo = flatModel();
    repo.connectors['c-bad'] = { id: 'c-bad', kind: 'assembly', ownerId: 'b-veh', sourcePortId: 'nowhere', targetPortId: 'pu-whl-torque' };
    const result = migrateRepositoryToV5(repo);
    expect(repo.connectors['c-bad'].sourcePortId).toBe('nowhere');
    expect(result.report.changes.some(change => change.kind === 'record-dropped' && change.message.includes('Vehicle'))).toBe(true);
  });

  it('merges two usages of one property into one part', () => {
    const repo = flatModel();
    repo.usages['u-eng-2'] = part('u-eng-2', 'engine again', 'b-veh', 'b-eng', 'pr-engine');
    const result = migrateRepositoryToV5(repo);
    expect(result.report.keyMap['u-eng-2']).toBe('pr-engine');
    expect((repo.definitions['b-veh'] as BlockDefinition).properties.filter(p => p.name === 'engine')).toHaveLength(1);
  });

  it('moves a connector owned by a nested part to the Block that holds the path', () => {
    const repo = flatModel();
    repo.definitions['b-axle'] = block('b-axle', 'Axle');
    (repo.definitions['b-veh'] as BlockDefinition).properties.push({ id: 'pr-axle', name: 'axle', kind: 'part', typeId: 'b-axle', multiplicity: one });
    repo.usages['u-axle'] = part('u-axle', 'axle', 'b-veh', 'b-axle', 'pr-axle');
    repo.usages['u-l'] = part('u-l', 'l', 'u-axle', 'b-whl');
    repo.usages['u-r'] = part('u-r', 'r', 'u-axle', 'b-whl');
    repo.usages['pu-l'] = portUsage('pu-l', 'torque', 'u-l', 'po-whl-torque');
    repo.usages['pu-r'] = portUsage('pu-r', 'torque', 'u-r', 'po-whl-torque');
    repo.connectors['c-in'] = { id: 'c-in', kind: 'assembly', ownerId: 'u-axle', sourcePortId: 'pu-l', targetPortId: 'pu-r' };
    migrateRepositoryToV5(repo);
    expect(repo.connectors['c-in'].ownerId).toBe('b-veh');
    expect(connectorEndOf(repo.connectors['c-in'] as ConnectorUsage, 'source')!.path).toHaveLength(2);
  });
});
