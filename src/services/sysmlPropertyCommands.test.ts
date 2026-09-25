import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand } from './sysmlCommandGateway';
import { buildBlockPropertyUpdateCommand, buildCreatePartDefinitionCommand, buildCreatePartUsageCommand, buildPartUsageUpdateCommand } from './sysmlPropertyCommands';

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
});
