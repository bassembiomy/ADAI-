import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand, projectLegacyDiagram } from './sysmlCommandGateway';
import { buildBlockPropertyUpdateCommand, buildCreatePartDefinitionCommand, buildCreatePartPropertyCommand, buildPartUpdateCommand, buildRelationshipUpdateCommand } from './sysmlPropertyCommands';
import { buildCreateOwnedPropertyCommand } from './sysmlOwnedFeatureCommands';

describe('BDD property-end associations', () => {
  it('persists and projects an Association whose member end is a typed Block property', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [{
        id: 'engine-property', name: 'engine', kind: 'part', typeId: 'engine',
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      }], ports: [], operations: [], constraints: [],
    };
    repository.definitions.engine = {
      id: 'engine', name: 'Engine', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };

    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'createAndPresent', diagramId: 'bdd', presentation: {},
      element: { id: 'vehicle-engine-association', kind: 'association', sourceId: 'engine-property', targetId: 'engine', name: 'engine : Engine' },
    });

    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.relationships['vehicle-engine-association']).toMatchObject({
      kind: 'association', sourceId: 'engine-property', targetId: 'engine',
    });
    expect(result.view.relationships).toContainEqual(expect.objectContaining({
      id: 'vehicle-engine-association', sourceId: 'engine-property', targetId: 'engine', type: 'association',
    }));
  });
});

describe('buildCreatePartDefinitionCommand', () => {
  const block = (id: string, name: string, properties: import('../engine/sysml/model').PropertyDefinition[] = []) => ({
    id, name, kind: 'block' as const, namespace: ['model'], ownerId: 'model',
    isAbstract: false, isLeaf: false, properties, ports: [], operations: [], constraints: [],
  });
  const oneOne = { lower: 1, upper: 1, ordered: false, unique: true };

  it('creates the classifier and retypes the part property atomically through the gateway, with no usage record', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = block('vehicle', 'Vehicle', [
      { id: 'property-left-motor', name: 'leftMotor', kind: 'part', typeId: 'old', multiplicity: oneOne },
    ]);
    repository.definitions.old = block('old', 'Old');
    const state = createSysmlGatewayState(repository);

    const result = executeSysmlCommand(state, buildCreatePartDefinitionCommand({ partId: 'property-left-motor', definitionId: 'motor-def', definitionName: 'Motor_Def', repository }));
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.definitions['motor-def']).toMatchObject({ name: 'Motor_Def', kind: 'block' });
    expect(result.repository.usages).toEqual({});
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties).toMatchObject([
      { id: 'property-left-motor', typeId: 'motor-def', kind: 'part' },
    ]);
    const undone = executeSysmlCommand(result, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(undone.repository.definitions['motor-def']).toBeUndefined();
    expect(undone.repository.definitions.vehicle?.kind === 'block' && undone.repository.definitions.vehicle.properties).toMatchObject([
      { id: 'property-left-motor', typeId: 'old' },
    ]);
  });

  it('retypes a nested part addressed by its property path', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = block('vehicle', 'Vehicle', [{ id: 'axle', name: 'axle', kind: 'part', typeId: 'axle-def', multiplicity: oneOne }]);
    repository.definitions['axle-def'] = block('axle-def', 'Axle', [{ id: 'wheel', name: 'wheel', kind: 'part', typeId: 'old', multiplicity: oneOne }]);
    repository.definitions.old = block('old', 'Old');
    const result = executeSysmlCommand(createSysmlGatewayState(repository), buildCreatePartDefinitionCommand({ partId: 'axle/wheel', definitionId: 'wheel-def', definitionName: 'Wheel', repository }));
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect((result.repository.definitions['axle-def'] as import('../engine/sysml/model').BlockDefinition).properties[0].typeId).toBe('wheel-def');
    expect(result.repository.usages).toEqual({});
  });

  it('updates Block part properties through the Block update without creating usage records', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = block('vehicle', 'Vehicle');
    repository.definitions.motor = block('motor', 'Motor');
    const state = createSysmlGatewayState(repository);
    const command = buildBlockPropertyUpdateCommand(repository, 'vehicle', {
      properties: [{ id: 'property-left-motor', name: 'leftMotor', kind: 'part', typeId: 'motor', multiplicity: '1' }],
    });

    const result = executeSysmlCommand(state, command);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties).toMatchObject([
      { id: 'property-left-motor', typeId: 'motor', kind: 'part' },
    ]);
    expect(result.repository.usages).toEqual({});
    expect(projectLegacyDiagram(result.repository, result.coordinates, result.diagramPresentations).parts).toContainEqual(
      expect.objectContaining({ id: 'property-left-motor', name: 'leftMotor', typeId: 'motor' }));
    const undone = executeSysmlCommand(result, { type: 'undo' });
    expect(undone.repository.usages).toEqual({});
    expect(undone.repository.definitions.vehicle?.kind === 'block' && undone.repository.definitions.vehicle.properties).toHaveLength(0);
  });

  it('removing a part from the Block property list deletes it, and refuses while connectors still end in it', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = block('vehicle', 'Vehicle', [
      { id: 'a', name: 'a', kind: 'part', typeId: 'motor', multiplicity: oneOne },
      { id: 'b', name: 'b', kind: 'part', typeId: 'motor', multiplicity: oneOne },
      { id: 'c', name: 'c', kind: 'part', typeId: 'motor', multiplicity: oneOne },
    ]);
    repository.definitions.motor = block('motor', 'Motor');
    repository.connectors.link = { id: 'link', kind: 'assembly', ownerId: 'vehicle', sourcePortId: 'a', targetPortId: 'b', sourceEnd: { path: ['a'] }, targetEnd: { path: ['b'] } };
    const state = createSysmlGatewayState(repository);
    const keepAandB = [
      { id: 'a', name: 'a', kind: 'part', typeId: 'motor', multiplicity: '1' },
      { id: 'b', name: 'b', kind: 'part', typeId: 'motor', multiplicity: '1' },
    ];
    const removed = executeSysmlCommand(state, buildBlockPropertyUpdateCommand(repository, 'vehicle', { properties: keepAandB }));
    expect(removed.committed, JSON.stringify(removed.diagnostics)).toBe(true);
    expect((removed.repository.definitions.vehicle as import('../engine/sysml/model').BlockDefinition).properties.map(property => property.id)).toEqual(['a', 'b']);
    expect(removed.repository.usages).toEqual({});

    const refused = executeSysmlCommand(state, buildBlockPropertyUpdateCommand(repository, 'vehicle', { properties: keepAandB.slice(1) }));
    expect(refused.committed).toBe(false);
    expect(refused.repository.connectors.link).toBeDefined();
  });
  it('persists Block Satisfied Requirements as canonical satisfy relationships and synchronizes reassignment', () => {
    const repository = createEmptyRepository();
    repository.definitions.controller = {
      id: 'controller', name: 'Controller', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    for (const id of ['req-a', 'req-b']) repository.requirements[id] = {
      id, name: id.toUpperCase(), kind: 'requirement', namespace: ['model'], ownerId: 'model',
      requirementId: id.toUpperCase(), text: '', status: 'draft', version: '1.0',
    };

    const assign = executeSysmlCommand(createSysmlGatewayState(repository),
      buildBlockPropertyUpdateCommand(repository, 'controller', { satisfiedReqIds: ['req-a'] }));
    expect(assign.committed, JSON.stringify(assign.diagnostics)).toBe(true);
    expect(Object.values(assign.repository.relationships).filter(relation => relation.kind === 'satisfy'))
      .toEqual([expect.objectContaining({ sourceId: 'controller', targetId: 'req-a' })]);
    expect(assign.view.blocks.find(block => block.id === 'controller')?.satisfiedReqIds).toEqual(['req-a']);

    const reassign = executeSysmlCommand(assign,
      buildBlockPropertyUpdateCommand(assign.repository, 'controller', { satisfiedReqIds: ['req-b'] }));
    expect(reassign.committed, JSON.stringify(reassign.diagnostics)).toBe(true);
    expect(Object.values(reassign.repository.relationships).filter(relation => relation.kind === 'satisfy'))
      .toEqual([expect.objectContaining({ sourceId: 'controller', targetId: 'req-b' })]);
    expect(reassign.view.blocks.find(block => block.id === 'controller')?.satisfiedReqIds).toEqual(['req-b']);
  });

  it('removes a Block satisfy relationship when its requirement is unchecked', () => {
    const repository = createEmptyRepository();
    repository.definitions.controller = {
      id: 'controller', name: 'Controller', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.requirements['req-a'] = {
      id: 'req-a', name: 'REQ-A', kind: 'requirement', namespace: ['model'], ownerId: 'model',
      requirementId: 'REQ-A', text: '', status: 'draft', version: '1.0',
    };
    repository.relationships['satisfy-controller-req-a'] = {
      id: 'satisfy-controller-req-a', kind: 'satisfy', sourceId: 'controller', targetId: 'req-a',
    };

    const state = createSysmlGatewayState(repository);
    const command = buildBlockPropertyUpdateCommand(repository, 'controller', { satisfiedReqIds: [] });
    const preflight = executeSysmlCommand(state, command);

    expect(preflight.committed).toBe(false);
    expect(preflight.impact?.requestedElementIds).toContain('satisfy-controller-req-a');
    const result = executeSysmlCommand(state, {
      ...(command as Extract<typeof command, { type: 'deleteElements' }>),
      confirmedImpactHash: computeImpactHash(preflight.impact!),
    });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(Object.values(result.repository.relationships).filter(relation => relation.kind === 'satisfy')).toHaveLength(0);
    expect(result.view.blocks.find(block => block.id === 'controller')?.satisfiedReqIds).toEqual([]);
  });

  it('keeps a part type/name edit on its Block property, with no usage record', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = block('vehicle', 'Vehicle', [{ id: 'property-left-motor', name: 'leftMotor', kind: 'part', typeId: 'old', multiplicity: oneOne }]);
    repository.definitions.old = block('old', 'Old');
    repository.definitions.new = block('new', 'New');
    const state = createSysmlGatewayState(repository);
    const result = executeSysmlCommand(state, buildPartUpdateCommand(repository, 'property-left-motor', { name: 'rightMotor', typeId: 'new' }));

    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.usages).toEqual({});
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties[0]).toMatchObject({ id: 'property-left-motor', name: 'rightMotor', typeId: 'new' });
  });

  it('adds a part property to its owning Block and nothing else', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = block('vehicle', 'Vehicle');
    repository.definitions.motor = block('motor', 'Motor');
    const command = buildCreatePartPropertyCommand(repository, {
      id: 'left-motor', name: 'leftMotor', ownerId: 'vehicle', typeId: 'motor', aggregation: 'composite', multiplicity: oneOne,
    });
    expect(command).toBeDefined();
    const result = executeSysmlCommand(createSysmlGatewayState(repository), command!);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.usages).toEqual({});
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties).toMatchObject([
      { name: 'leftMotor', kind: 'part', typeId: 'motor' },
    ]);
    expect(buildCreatePartPropertyCommand(repository, { name: 'x', ownerId: 'motor-missing', typeId: 'motor', multiplicity: oneOne })).toBeUndefined();
  });

  it('creates a part property and its active IBD presentation atomically, with no usage record', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = block('vehicle', 'Vehicle');
    repository.definitions.motor = block('motor', 'Motor');
    const before = structuredClone(repository);
    const state = createSysmlGatewayState(repository);
    const plan = buildCreateOwnedPropertyCommand(repository, {
      ownerBlockId: 'vehicle', propertyKind: 'part', typeId: 'motor', name: 'leftMotor', featureId: 'left-motor',
      diagramId: 'vehicle', presentation: { x: 120, y: 220, width: 150, height: 100 },
    });
    expect(plan.ok).toBe(true);
    const result = executeSysmlCommand(state, plan.command!);

    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.usages).toEqual({});
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties)
      .toMatchObject([{ id: 'left-motor', name: 'leftMotor', kind: 'part', typeId: 'motor' }]);
    expect(result.diagramPresentations.vehicle).toMatchObject({
      elementIds: expect.arrayContaining(['left-motor']),
      presentations: { 'left-motor': { semanticElementId: 'left-motor', bounds: { x: 120, y: 220, width: 150, height: 100 } } },
    });
    expect(projectLegacyDiagram(result.repository, result.coordinates, result.diagramPresentations, 'vehicle').parts)
      .toContainEqual(expect.objectContaining({ id: 'left-motor', x: 120, y: 220 }));
    expect(state.repository).toEqual(before);

    const undone = executeSysmlCommand(result, { type: 'undo' });
    expect(undone.repository.definitions.vehicle?.kind === 'block' && undone.repository.definitions.vehicle.properties).toHaveLength(0);
    expect(undone.diagramPresentations.vehicle?.elementIds ?? []).not.toContain('left-motor');
  });
});
describe('buildRelationshipUpdateCommand', () => {
  it('constructs an updateElement command with normalized role names and parsed multiplicities', () => {
    const repository = createEmptyRepository();
    repository.relationships['rel-1'] = {
      id: 'rel-1',
      kind: 'association',
      sourceId: 'blockA',
      targetId: 'blockB',
    };

    const outcome = buildRelationshipUpdateCommand(repository, 'rel-1', {
      sourceRole: ' sourceRoleVal ',
      targetRole: 'targetRoleVal',
      sourceMultiplicity: '0..*',
      targetMultiplicity: '1..5',
      sourceNavigable: true,
      targetNavigable: false,
      sourceAggregation: 'shared',
      targetAggregation: 'none',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.command).toEqual({
      type: 'updateElement',
      elementId: 'rel-1',
      patch: {
        sourceRole: 'sourceRoleVal',
        targetRole: 'targetRoleVal',
        sourceMultiplicity: { lower: 0, upper: '*', ordered: false, unique: true },
        targetMultiplicity: { lower: 1, upper: 5, ordered: false, unique: true },
        sourceNavigable: true,
        targetNavigable: false,
        sourceAggregation: 'shared',
        targetAggregation: 'none',
      },
    });
  });

  it('rejects invalid multiplicity text before dispatch with INVALID_MULTIPLICITY diagnostic', () => {
    const repository = createEmptyRepository();
    repository.relationships['rel-1'] = {
      id: 'rel-1',
      kind: 'association',
      sourceId: 'blockA',
      targetId: 'blockB',
    };

    const outcome = buildRelationshipUpdateCommand(repository, 'rel-1', {
      targetMultiplicity: 'not-a-multiplicity',
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.diagnostic.code).toBe('INVALID_MULTIPLICITY');
    }
  });

  it('preserves immutable sourceId and targetId unchanged', () => {
    const repository = createEmptyRepository();
    repository.relationships['rel-1'] = {
      id: 'rel-1',
      kind: 'association',
      sourceId: 'blockA',
      targetId: 'blockB',
    };

    const outcome = buildRelationshipUpdateCommand(repository, 'rel-1', {
      sourceId: 'hijackedSource',
      targetId: 'hijackedTarget',
      sourceRole: 'owner',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.command.patch.sourceId).toBeUndefined();
    expect(outcome.command.patch.targetId).toBeUndefined();
    expect(outcome.command.patch.sourceRole).toBe('owner');
  });
});
