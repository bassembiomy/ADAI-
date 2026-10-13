import { describe, expect, it } from 'vitest';
import { asV3, flatModel, nestedModel, presentation } from '../engine/sysml/fixtures/formatV3Models';
import type { BlockDefinition } from '../engine/sysml/model';
import { connectorEndOf } from '../engine/sysml/connectorEnds';
import { buildTraceabilityMatrix } from '../engine/sysml/rtm';
import { resolveSysmlReferenceLabel } from '../features/sysml/sysmlDisplayLabel';
import { createSysmlExplorerAdapter } from '../features/modelExplorer/adapters/sysmlExplorerAdapter';
import { getCachedLegacyView } from '../engine/sysml/normalizedStore';
import {
  buildCanonicalSysmlProjectPayload,
  computeImpactHash,
  createSysmlGatewayState,
  executeSysmlCommand,
  loadCanonicalSysmlProject,
  projectLegacyDiagram,
  type SysmlGatewayState,
} from './sysmlCommandGateway';
import { buildCreateIbdConnectorCommand } from './sysmlIbdConnectorCommands';
import { buildCreatePartDefinitionCommand, buildPartUpdateCommand } from './sysmlPropertyCommands';

/** An old project file: a format 3 repository plus presentations keyed by its usage records. */
function oldProject(model = flatModel(), ids = ['u-eng', 'u-whl', 'c-asm']) {
  return {
    schemaVersion: 4,
    sysmlRepository: asV3(model),
    sysmlCoordinates: {},
    diagramPresentations: { 'b-veh': presentation('b-veh', ids, { 'u-eng': { x: 120, y: 80 }, 'u-whl': { x: 400, y: 80 } }) },
  };
}

function open(project = oldProject()): { state: SysmlGatewayState; loaded: ReturnType<typeof loadCanonicalSysmlProject> } {
  const loaded = loadCanonicalSysmlProject(project);
  return { loaded, state: createSysmlGatewayState(loaded.repository, loaded.coordinates, loaded.diagramPresentations) };
}

describe('opening an old project upgrades it once and shows it', () => {
  const { loaded } = open();

  it('returns the upgrade report and presentations that follow the new keys', () => {
    expect(loaded.valid).toBe(true);
    expect(loaded.upgradeReport?.fromVersion).toBe(3);
    expect(loaded.upgradeReport?.changes.some(change => change.kind === 'presentation-rekeyed' && change.message.includes('Vehicle'))).toBe(true);
    expect(loaded.diagramPresentations['b-veh'].elementIds).toEqual(['pr-engine', 'pr-wheel', 'c-asm']);
    expect(loaded.diagramPresentations['b-veh'].presentations['pr-engine'].bounds).toEqual({ x: 120, y: 80 });
    expect(Object.keys(loaded.repository.usages)).toEqual([]);
  });

  it('draws the IBD parts from Block properties with the saved positions', () => {
    const view = projectLegacyDiagram(loaded.repository, loaded.coordinates, loaded.diagramPresentations, 'b-veh');
    expect(view.parts.map(part => part.id).sort()).toEqual(['pr-engine', 'pr-wheel']);
    expect(view.parts.find(part => part.id === 'pr-engine')).toMatchObject({
      name: 'engine', blockId: 'b-veh', typeId: 'b-eng', propertyId: 'pr-engine', x: 120, y: 80, satisfiedReqIds: ['rq-1'],
    });
    expect(view.connectors.find(c => c.id === 'c-asm')).toMatchObject({
      sourcePartId: 'pr-engine', sourcePortId: 'po-eng-torque', targetPartId: 'pr-wheel', targetPortId: 'po-whl-torque',
    });
    // A part-to-part connector attaches to the parts themselves.
    expect(view.connectors.find(c => c.id === 'c-part')).toMatchObject({ sourcePartId: 'pr-engine', sourcePortId: '', targetPartId: 'pr-wheel' });
  });

  it('projects the same parts and connectors from the normalized store', () => {
    const fromStore = getCachedLegacyView(loaded.store, 'b-veh');
    const fromRepository = projectLegacyDiagram(loaded.repository, loaded.coordinates, loaded.diagramPresentations, 'b-veh');
    expect(fromStore.parts.map(part => part.id).sort()).toEqual(fromRepository.parts.map(part => part.id).sort());
    // The store draws the connectors the diagram presents; each one ends on the same parts and ports.
    const ends = (c: { id: string; sourcePartId: string; sourcePortId: string; targetPartId: string; targetPortId: string }) =>
      [c.id, c.sourcePartId, c.sourcePortId, c.targetPartId, c.targetPortId];
    expect(fromStore.connectors.map(ends)).toEqual([['c-asm', 'pr-engine', 'po-eng-torque', 'pr-wheel', 'po-whl-torque']]);
    expect(fromRepository.connectors.map(ends)).toEqual(expect.arrayContaining(fromStore.connectors.map(ends)));
    expect(fromStore.parts.find(part => part.id === 'pr-engine')).toMatchObject({ x: 120, y: 80, typeId: 'b-eng' });
  });

  it('saves format 5 and the next open needs no upgrade', () => {
    const { state } = open();
    const payload = buildCanonicalSysmlProjectPayload(state, { version: '1', projectName: 'Car' });
    expect(JSON.parse(payload.sysmlRepository as string).schemaVersion).toBe(5);
    const again = loadCanonicalSysmlProject(payload);
    expect(again.upgradeReport).toBeUndefined();
    expect(again.repository).toEqual(state.repository);
    expect(again.diagramPresentations['b-veh'].elementIds).toEqual(['pr-engine', 'pr-wheel', 'c-asm']);
  });

  it('upgrades a payload from the contextual-editing era once as well, with the presentations re-keyed', () => {
    const legacyPayload = { ...oldProject(), schemaVersion: 3 };
    const opened = loadCanonicalSysmlProject(legacyPayload);
    expect(opened.upgradeReport).toBeDefined();
    expect(opened.diagramPresentations['b-veh'].elementIds).toEqual(['pr-engine', 'pr-wheel', 'c-asm']);
    expect(Object.keys(opened.repository.usages)).toEqual([]);
  });
});

describe('editing the migrated model through the gateway', () => {
  it('renames, retypes and re-sizes a part through its property id or property path', () => {
    const { state } = open();
    const renamed = executeSysmlCommand(state, buildPartUpdateCommand(state.repository, 'pr-engine', { name: 'motor', multiplicity: '2' }));
    expect(renamed.committed).toBe(true);
    const property = (renamed.repository.definitions['b-veh'] as BlockDefinition).properties.find(p => p.id === 'pr-engine')!;
    expect(property).toMatchObject({ name: 'motor', multiplicity: { lower: 2, upper: 2 } });

    const direct = executeSysmlCommand(state, { type: 'updateElement', elementId: 'pr-wheel', patch: { name: 'tyre' } });
    expect(direct.committed).toBe(true);
    expect((direct.repository.definitions['b-veh'] as BlockDefinition).properties.find(p => p.id === 'pr-wheel')!.name).toBe('tyre');
    expect(projectLegacyDiagram(direct.repository).parts.find(part => part.id === 'pr-wheel')?.name).toBe('tyre');

    const undone = executeSysmlCommand(direct, { type: 'undo' });
    expect((undone.repository.definitions['b-veh'] as BlockDefinition).properties.find(p => p.id === 'pr-wheel')!.name).toBe('wheel');
  });

  it('gives a part a new type from its property, and refuses while connectors end in ports of the old type', () => {
    const { state } = open();
    const command = buildCreatePartDefinitionCommand({
      partId: 'pr-engine', definitionId: 'b-new', definitionName: 'ElectricMotor', repository: state.repository,
    });
    // c-asm ends in a port of Engine, which the new Block does not have: the retype must not leave it dangling.
    const refused = executeSysmlCommand(state, command);
    expect(refused.committed).toBe(false);
    expect(refused.diagnostics.map(d => d.code)).toContain('MISSING_CONNECTOR_ENDPOINT');

    const added = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: { featureKind: 'property', ownerBlockId: 'b-veh', propertyKind: 'part', typeId: 'b-eng', name: 'spare', featureId: 'pr-spare' },
    });
    expect(added.committed).toBe(true);
    const retyped = executeSysmlCommand(added, buildCreatePartDefinitionCommand({
      partId: 'pr-spare', definitionId: 'b-new', definitionName: 'ElectricMotor', repository: added.repository,
    }));
    expect(retyped.committed, JSON.stringify(retyped.diagnostics)).toBe(true);
    expect((retyped.repository.definitions['b-veh'] as BlockDefinition).properties.find(p => p.id === 'pr-spare')!.typeId).toBe('b-new');
  });

  it('connects two parts of the IBD that have no usage record, including a nested one', () => {
    const { state, loaded } = open(oldProject(nestedModel()));
    const axle = loaded.repository.definitions['b-axle'] as BlockDefinition;
    const rightId = axle.properties.find(property => property.name === 'right')!.id;
    const plan = buildCreateIbdConnectorCommand(state.repository, {
      contextId: 'b-veh', connectorId: 'c-new',
      source: { occurrenceId: 'pr-engine', portDefinitionId: 'po-eng-torque' },
      target: { occurrenceId: `pr-axle/${rightId}`, portDefinitionId: 'po-whl-torque' },
    });
    expect(plan.diagnostics).toEqual([]);
    const result = executeSysmlCommand(state, plan.command!);
    expect(result.committed).toBe(true);
    const connector = result.repository.connectors['c-new'];
    expect(connectorEndOf(connector, 'source')).toEqual({ path: ['pr-engine'], portId: 'po-eng-torque' });
    expect(connectorEndOf(connector, 'target')).toEqual({ path: ['pr-axle', rightId], portId: 'po-whl-torque' });
    expect(Object.keys(result.repository.usages)).toEqual([]);
    const view = projectLegacyDiagram(result.repository, result.coordinates, result.diagramPresentations, 'b-veh');
    expect(view.connectors.find(c => c.id === 'c-new')).toMatchObject({ sourcePartId: 'pr-engine', targetPartId: `pr-axle/${rightId}` });
    expect(view.parts.map(part => part.id)).toContain(`pr-axle/${rightId}`);
  });

  it('presents a part of the context on its IBD and refuses one from another Block', () => {
    const { state } = open(oldProject(flatModel(), ['c-asm']));
    const added = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'b-veh', elementIds: ['pr-engine'] });
    expect(added.committed).toBe(true);
    expect(added.diagramPresentations['b-veh'].elementIds).toContain('pr-engine');
    const foreign = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'b-eng', elementIds: ['pr-engine'] });
    expect(foreign.committed).toBe(false);
    expect(foreign.diagnostics.map(d => d.code)).toContain('INVALID_DIAGRAM_ELEMENT');
  });

  it('deletes a part with its connectors and relationships, asks for confirmation, and undo restores it', () => {
    const { state } = open();
    const first = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['pr-engine'] });
    expect(first.committed).toBe(false);
    expect(first.impact?.deletedElementIds).toEqual(expect.arrayContaining(['pr-engine', 'c-asm', 'rl-sat']));
    const deleted = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['pr-engine'], confirmedImpactHash: computeImpactHash(first.impact!) });
    expect(deleted.committed).toBe(true);
    expect((deleted.repository.definitions['b-veh'] as BlockDefinition).properties.map(p => p.id)).not.toContain('pr-engine');
    expect(deleted.repository.connectors['c-asm']).toBeUndefined();
    expect(deleted.repository.relationships['rl-sat']).toBeUndefined();
    expect(deleted.diagramPresentations['b-veh'].elementIds).toEqual(['pr-wheel']);
    expect(projectLegacyDiagram(deleted.repository).parts.map(part => part.id)).not.toContain('pr-engine');
    expect(getCachedLegacyView(deleted.store!).parts.map(part => part.id)).not.toContain('pr-engine');

    const undone = executeSysmlCommand(deleted, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect((undone.repository.definitions['b-veh'] as BlockDefinition).properties.map(p => p.id)).toContain('pr-engine');
    expect(undone.repository.connectors['c-asm']).toBeDefined();
    expect(getCachedLegacyView(undone.store!).parts.map(part => part.id)).toContain('pr-engine');
  });
});

describe('other readers on the migrated model', () => {
  const { loaded } = open();

  it('lists the parts of a Block in the explorer once, under Parts', () => {
    const state = createSysmlGatewayState(loaded.repository);
    const nodes = createSysmlExplorerAdapter({ getState: () => state }).project('containment').nodes;
    const parts = nodes['sysml:group:b-veh:parts'];
    expect(parts.childNodeIds).toEqual(['sysml:element:pr-engine', 'sysml:element:pr-wheel']);
    expect(nodes['sysml:element:pr-engine']).toMatchObject({ kind: 'part', label: 'engine', secondaryLabel: ': Engine' });
    const properties = nodes['sysml:group:b-veh:properties'];
    expect(properties.childNodeIds).toEqual(['sysml:element:pr-mass', 'sysml:element:pr-mass2']);
  });

  it('shows the part that satisfies a requirement by its name in the traceability matrix', () => {
    const row = buildTraceabilityMatrix(loaded.repository).rows.find(item => item.requirement.requirementId === 'REQ-1')!;
    expect(row.satisfiedBy).toEqual([expect.objectContaining({ name: 'engine', type: 'part' })]);
    expect(row.status).not.toBe('unresolved');
  });

  it('names a part by its property, never by an id', () => {
    expect(resolveSysmlReferenceLabel(loaded.repository, 'pr-engine', 'Part')).toBe('engine');
    expect(resolveSysmlReferenceLabel(loaded.repository, 'pr-engine/po-eng-torque', 'Part')).not.toContain('pr-');
  });
});
