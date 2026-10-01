import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand } from './sysmlCommandGateway';
import { buildBlockPropertyUpdateCommand, buildCreatePartDefinitionCommand, buildCreatePartUsageCommand, buildPartUsageUpdateCommand, buildRelationshipUpdateCommand } from './sysmlPropertyCommands';

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
  it('creates the classifier and retargets its part usage atomically through the gateway', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions.old = {
      id: 'old', name: 'Old', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.usages['left-motor'] = {
      id: 'left-motor', kind: 'part', name: 'leftMotor', ownerId: 'vehicle', typeId: 'old',
      aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    const state = createSysmlGatewayState(repository);

    const result = executeSysmlCommand(state, buildCreatePartDefinitionCommand({ partId: 'left-motor', definitionId: 'motor-def', definitionName: 'Motor_Def', repository }));
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.definitions['motor-def']).toMatchObject({ name: 'Motor_Def', kind: 'block' });
    expect(result.repository.usages['left-motor']).toMatchObject({ typeId: 'motor-def' });
    const propertyId = (result.repository.usages['left-motor'] as import('../engine/sysml/model').PartUsage).propertyId;
    expect(propertyId).toBeTruthy();
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties).toMatchObject([
      { id: propertyId, typeId: 'motor-def', kind: 'part' },
    ]);
    const undone = executeSysmlCommand(result, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(undone.repository.definitions['motor-def']).toBeUndefined();
    expect(undone.repository.definitions.vehicle?.kind === 'block' && undone.repository.definitions.vehicle.properties).toHaveLength(0);
  });

  it('reconciles Block properties into canonical PartUsages in the same gateway transaction', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions.motor = {
      id: 'motor', name: 'Motor', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const state = createSysmlGatewayState(repository);
    const command = buildBlockPropertyUpdateCommand(repository, 'vehicle', {
      properties: [{ id: 'property-left-motor', name: 'leftMotor', kind: 'part', typeId: 'motor', multiplicity: '1' }],
    });

    const result = executeSysmlCommand(state, command);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties).toMatchObject([
      { id: 'property-left-motor', typeId: 'motor', kind: 'part' },
    ]);
    expect(Object.values(result.repository.usages)).toContainEqual(expect.objectContaining({ propertyId: 'property-left-motor', ownerId: 'vehicle', typeId: 'motor', kind: 'part' }));
    const undone = executeSysmlCommand(result, { type: 'undo' });
    expect(Object.values(undone.repository.usages)).toHaveLength(0);
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

  it('keeps a PartUsage type/name edit and its owner Block property synchronized atomically', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false,
      properties: [{ id: 'property-left-motor', name: 'leftMotor', kind: 'part', typeId: 'old', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
      ports: [], operations: [], constraints: [],
    };
    repository.definitions.old = {
      id: 'old', name: 'Old', kind: 'block', namespace: ['model'], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions.new = {
      id: 'new', name: 'New', kind: 'block', namespace: ['model'], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.usages['left-motor'] = {
      id: 'left-motor', propertyId: 'property-left-motor', kind: 'part', name: 'leftMotor', ownerId: 'vehicle', typeId: 'old', aggregation: 'composite',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    const state = createSysmlGatewayState(repository);
    const result = executeSysmlCommand(state, buildPartUsageUpdateCommand(repository, 'left-motor', { name: 'rightMotor', typeId: 'new' }));

    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.usages['left-motor']).toMatchObject({ name: 'rightMotor', typeId: 'new' });
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties[0]).toMatchObject({ id: 'property-left-motor', name: 'rightMotor', typeId: 'new' });
  });

  it('creates a PartUsage and its owning Block PartProperty in one gateway transaction', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions.motor = {
      id: 'motor', name: 'Motor', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const state = createSysmlGatewayState(repository);
    const result = executeSysmlCommand(state, buildCreatePartUsageCommand(repository, {
      id: 'left-motor', kind: 'part', name: 'leftMotor', ownerId: 'vehicle', typeId: 'motor', aggregation: 'composite',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    }));

    expect(result.committed).toBe(true);
    expect(result.repository.usages['left-motor']).toMatchObject({ propertyId: expect.any(String), typeId: 'motor' });
    const propertyId = (result.repository.usages['left-motor'] as import('../engine/sysml/model').PartUsage).propertyId;
    expect(propertyId).not.toBe('left-motor');
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties).toMatchObject([
      { id: propertyId, name: 'leftMotor', kind: 'part', typeId: 'motor' },
    ]);
  });

  it('creates a PartUsage, owner PropertyDefinition, and active IBD presentation atomically', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions.motor = {
      id: 'motor', name: 'Motor', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.diagrams['vehicle-ibd'] = {
      id: 'vehicle-ibd', kind: 'diagram', diagramKind: 'ibd', name: 'Vehicle IBD', namespace: ['model'], ownerId: 'vehicle', contextElementId: 'vehicle',
    };
    const before = structuredClone(repository);
    const state = createSysmlGatewayState(repository);
    const result = executeSysmlCommand(state, buildCreatePartUsageCommand(repository, {
      id: 'left-motor', kind: 'part', name: 'leftMotor', ownerId: 'vehicle', typeId: 'motor', aggregation: 'composite',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    }, { x: 120, y: 220, width: 150, height: 100 }, 'vehicle-ibd'));

    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.usages['left-motor']).toMatchObject({ kind: 'part', propertyId: expect.any(String) });
    expect(result.repository.definitions.vehicle?.kind === 'block' && result.repository.definitions.vehicle.properties)
      .toMatchObject([{ name: 'leftMotor', kind: 'part', typeId: 'motor' }]);
    expect(result.diagramPresentations['vehicle-ibd']).toMatchObject({
      elementIds: ['left-motor'],
      presentations: { 'left-motor': { semanticElementId: 'left-motor', bounds: { x: 120, y: 220, width: 150, height: 100 } } },
    });
    expect(result.coordinates['left-motor']).toBeUndefined();
    expect(state.repository).toEqual(before);

    const undone = executeSysmlCommand(result, { type: 'undo' });
    expect(undone.repository.usages['left-motor']).toBeUndefined();
    expect(undone.repository.definitions.vehicle?.kind === 'block' && undone.repository.definitions.vehicle.properties).toHaveLength(0);
    expect(undone.diagramPresentations['vehicle-ibd']?.elementIds).not.toContain('left-motor');
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
