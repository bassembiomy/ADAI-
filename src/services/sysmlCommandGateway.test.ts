import { describe, it, expect } from 'vitest';
import {
  executeSysmlCommand,
  projectLegacyDiagram,
  createSysmlGatewayState,
  buildCanonicalSysmlProjectPayload,
  loadCanonicalSysmlProject,
  computeImpactHash,
  fromRepository,
  type SysmlGatewayState,
} from './sysmlCommandGateway';
import { createEmptyRepository, type BlockDefinition, type ConnectorUsage, type PackageDefinition, type PartUsage, type PortDefinition, type PortUsage, type RequirementDefinition, type SysmlRelationship } from '../engine/sysml/model';
import { serializeRepository } from '../engine/sysml/persistence';
import type { SysmlElement } from './sysmlCommandGateway';
import { buildCreateOwnedPortCommand } from './sysmlOwnedFeatureCommands';

describe('sysmlCommandGateway', () => {
  it('projects a presented UML Package as a package presentation without inventing a Block', () => {
    const repository = createEmptyRepository();
    const powertrain: PackageDefinition = {
      id: 'pkg-powertrain', kind: 'package', name: 'Powertrain', namespace: ['model'], ownerId: 'model',
    };
    repository.packages[powertrain.id] = powertrain;

    const view = projectLegacyDiagram(repository, {}, {
      bdd: { elementIds: [powertrain.id] },
    }, 'bdd');

    expect(view.packages).toEqual([expect.objectContaining({
      id: powertrain.id,
      name: 'Powertrain',
      x: 0,
      y: 0,
    })]);
    expect(view.blocks).toEqual([]);
    expect(repository.definitions[powertrain.id]).toBeUndefined();

    const normalizedResult = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'addToDiagram', diagramId: 'bdd', elementIds: [powertrain.id],
    });
    expect(normalizedResult.view.packages).toContainEqual(expect.objectContaining({ id: powertrain.id, name: 'Powertrain' }));
  });

  it('creates, moves, and undoes a Package presentation without changing semantic identity', () => {
    const powertrain: PackageDefinition = {
      id: 'pkg-powertrain', kind: 'package', name: 'Powertrain', namespace: ['model'], ownerId: 'model',
    };
    let state = executeSysmlCommand(createSysmlGatewayState(), {
      type: 'createAndPresent', element: powertrain, diagramId: 'bdd', presentation: { x: 20, y: 30, width: 220, height: 140 },
    });
    state = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'requirements', elementIds: [powertrain.id] });
    state = executeSysmlCommand(state, {
      type: 'updatePresentation', diagramId: 'requirements', elementId: powertrain.id, presentation: { x: 400, y: 500 },
    });
    expect(Object.keys(state.repository.packages).filter(id => id === powertrain.id)).toHaveLength(1);
    expect(state.diagramPresentations.bdd.presentations[powertrain.id].bounds).toMatchObject({ x: 20, y: 30 });
    expect(state.diagramPresentations.requirements.presentations[powertrain.id].bounds).toMatchObject({ x: 400, y: 500 });

    const undoneMove = executeSysmlCommand(state, { type: 'undo' });
    const undoneAdd = executeSysmlCommand(undoneMove, { type: 'undo' });
    const undoneCreate = executeSysmlCommand(undoneAdd, { type: 'undo' });
    expect(undoneCreate.repository.packages[powertrain.id]).toBeUndefined();
    expect(undoneCreate.diagramPresentations.bdd?.elementIds ?? []).not.toContain(powertrain.id);
  });

  it('keeps a removed relationship semantic but hides its presentation from the active diagram', () => {
    const repository = createEmptyRepository();
    const owner: BlockDefinition = {
      id: 'owner', name: 'Owner', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false,
      properties: [{ id: 'owner-property', name: 'motor', kind: 'part', typeId: 'motor', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
      ports: [], operations: [], constraints: [],
    };
    const motor: BlockDefinition = {
      id: 'motor', name: 'Motor', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const relationship: SysmlRelationship = {
      id: 'owner-motor-association', kind: 'association', name: 'Owner : Motor',
      sourceId: 'owner', targetId: 'motor',
    };
    repository.definitions.owner = owner;
    repository.definitions.motor = motor;
    repository.relationships[relationship.id] = relationship;
    let state = createSysmlGatewayState(repository, {}, {
      bdd: { elementIds: ['owner', 'motor', relationship.id] },
    });

    state = executeSysmlCommand(state, {
      type: 'removeFromDiagram', diagramId: 'bdd', elementIds: [relationship.id],
    });

    expect(state.repository.relationships[relationship.id]).toEqual(relationship);
    expect(projectLegacyDiagram(state.repository, state.coordinates, state.diagramPresentations, 'bdd').relationships)
      .not.toContainEqual(expect.objectContaining({ id: relationship.id }));

    state = executeSysmlCommand(state, {
      type: 'addToDiagram', diagramId: 'bdd', elementIds: [relationship.id],
    });
    expect(projectLegacyDiagram(state.repository, state.coordinates, state.diagramPresentations, 'bdd').relationships)
      .toContainEqual(expect.objectContaining({ id: relationship.id }));
  });

  it('presents a newly created IBD Part usage immediately with the supplied canvas bounds', () => {
    const repository = createEmptyRepository();
    const vehicle: BlockDefinition = {
      id: 'ibd-vehicle', name: 'Vehicle', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const motor: BlockDefinition = {
      id: 'ibd-motor', name: 'Motor', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions[vehicle.id] = vehicle;
    repository.definitions[motor.id] = motor;
    const state = createSysmlGatewayState(repository);

    const result = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'property', ownerBlockId: vehicle.id, propertyKind: 'part',
        typeId: motor.id, name: 'leftMotor', featureId: 'property-left-motor', usageId: 'part-left-motor',
      },
      diagramId: vehicle.id,
      presentation: { x: 260, y: 180, width: 150, height: 100 },
    });

    expect(result.committed).toBe(true);
    expect(result.view.parts).toContainEqual(expect.objectContaining({
      id: 'part-left-motor', blockId: vehicle.id, typeId: motor.id, x: 260, y: 180,
    }));
    expect(result.diagramPresentations[vehicle.id].elementIds).toContain('part-left-motor');
    expect(result.diagramPresentations[vehicle.id].presentations['part-left-motor']?.bounds).toMatchObject({ x: 260, y: 180 });
  });

  it('rejects creating an IBD Part under a Block other than the active IBD context', () => {
    const repository = createEmptyRepository();
    for (const [id, name] of [['ibd-vehicle', 'Vehicle'], ['ibd-airframe', 'Airframe'], ['ibd-motor', 'Motor']]) {
      repository.definitions[id] = {
        id, name, kind: 'block', namespace: [], ownerId: 'model',
        isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
      };
    }

    const state = createSysmlGatewayState(repository);
    const result = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'property', ownerBlockId: 'ibd-airframe', propertyKind: 'part',
        typeId: 'ibd-motor', name: 'motor', featureId: 'property-airframe-motor', usageId: 'part-airframe-motor',
      },
      diagramId: 'ibd-vehicle',
      presentation: { x: 200, y: 150 },
    });

    expect(result.committed).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'OWNER_CONTEXT_MISMATCH' }));
    expect(result.repository.definitions['ibd-airframe']?.kind === 'block' && result.repository.definitions['ibd-airframe'].properties).toHaveLength(0);
    expect(result.repository.usages['part-airframe-motor']).toBeUndefined();
  });

  it('accepts a BDD Association from a typed Block property to its target Block', () => {
    const repository = createEmptyRepository();
    const target: BlockDefinition = {
      id: 'blk-engine', name: 'Engine', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const owner: BlockDefinition = {
      id: 'blk-vehicle', name: 'Vehicle', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false,
      properties: [{
        id: 'prop-engine', name: 'engine', kind: 'part', typeId: target.id,
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      }],
      ports: [], operations: [], constraints: [],
    };
    repository.definitions[owner.id] = owner;
    repository.definitions[target.id] = target;
    let state = createSysmlGatewayState(repository);
    state = executeSysmlCommand(state, {
      type: 'addToDiagram', diagramId: 'bdd', elementIds: [owner.id, target.id],
    });
    const relation: SysmlRelationship = {
      id: 'rel-engine-property', kind: 'association', sourceId: 'prop-engine', targetId: target.id,
      name: 'engine : Engine', sourceMultiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    const result = executeSysmlCommand(state, {
      type: 'createAndPresent', diagramId: 'bdd', element: relation, presentation: {},
    });

    expect(result.committed).toBe(true);
    expect(result.repository.relationships[relation.id]).toEqual(relation);
    expect(result.view.relationships).toContainEqual(expect.objectContaining({
      id: relation.id, sourceId: 'prop-engine', targetId: target.id, type: 'association',
    }));
  });

  it('adds a PartProperty to a BDD through its owning Block presentation', () => {
    const repository = createEmptyRepository();
    const vehicle: BlockDefinition = {
      id: 'blk-vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [{
        id: 'property-left-motor', name: 'leftMotor', kind: 'part', typeId: 'blk-motor',
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      }], ports: [], operations: [], constraints: [],
    };
    const motor: BlockDefinition = {
      id: 'blk-motor', name: 'Motor', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const part: PartUsage = {
      id: 'part-left-motor', propertyId: 'property-left-motor', kind: 'part', name: 'leftMotor',
      ownerId: vehicle.id, typeId: motor.id, aggregation: 'composite',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    repository.definitions[vehicle.id] = vehicle;
    repository.definitions[motor.id] = motor;
    repository.usages[part.id] = part;

    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'addToDiagram', diagramId: 'bdd', elementIds: [part.id],
    });

    expect(result.committed).toBe(true);
    expect(result.diagramPresentations.bdd.elementIds).toEqual([vehicle.id]);
    expect(result.view.blocks).toContainEqual(expect.objectContaining({
      id: vehicle.id,
      properties: [expect.objectContaining({ id: 'property-left-motor', name: 'leftMotor', type: 'Motor', typeId: motor.id })],
    }));
    expect(result.view.parts).toEqual([]);

    const renamed = executeSysmlCommand(result, {
      type: 'updateElement', elementId: motor.id, patch: { name: 'BLDCMotor' },
    });
    expect(renamed.view.blocks.find(block => block.id === vehicle.id)?.properties[0]).toMatchObject({
      type: 'BLDCMotor',
      typeId: motor.id,
    });
  });

  it('presents an existing PartProperty on its owning Block IBD context', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.usages.leftMotor = {
      id: 'leftMotor', kind: 'part', name: 'leftMotor', ownerId: 'vehicle', typeId: 'vehicle',
      aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'addToDiagram', diagramId: 'vehicle', elementIds: ['leftMotor'],
    });
    expect(result.committed).toBe(true);
    expect(result.diagramPresentations.vehicle.elementIds).toContain('leftMotor');
  });

  it('rejects a Package presentation on an IBD instead of committing an invisible symbol', () => {
    const repository = createEmptyRepository();
    repository.packages['pkg-powertrain'] = {
      id: 'pkg-powertrain', kind: 'package', name: 'Powertrain', namespace: ['model'], ownerId: 'model',
    };
    repository.diagrams['ibd-vehicle'] = {
      id: 'ibd-vehicle', kind: 'diagram', diagramKind: 'ibd', name: 'Vehicle IBD', namespace: ['model'], ownerId: 'model',
    };
    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'addToDiagram', diagramId: 'ibd-vehicle', elementIds: ['pkg-powertrain'],
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('INVALID_DIAGRAM_ELEMENT');
    expect(result.diagramPresentations['ibd-vehicle']).toBeUndefined();
  });

  it('accepts a Package presentation on a persisted Package Diagram', () => {
    const repository = createEmptyRepository();
    repository.packages['pkg-domain'] = {
      id: 'pkg-domain', kind: 'package', name: 'Domain', namespace: ['model'], ownerId: 'model',
    };
    repository.diagrams['diag-packages'] = {
      id: 'diag-packages', kind: 'diagram', diagramKind: 'package', name: 'Packages', namespace: ['model'], ownerId: 'model',
    };
    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'addToDiagram', diagramId: 'diag-packages', elementIds: ['pkg-domain'],
    });
    expect(result.committed).toBe(true);
    expect(result.diagramPresentations['diag-packages'].elementIds).toEqual(['pkg-domain']);
    expect(result.view.packages).toContainEqual(expect.objectContaining({ id: 'pkg-domain', name: 'Domain' }));

    const payload = buildCanonicalSysmlProjectPayload(result, { version: '1', projectName: 'Package Diagram' });
    const reloaded = loadCanonicalSysmlProject(payload);
    expect(reloaded.repository.diagrams['diag-packages'].diagramKind).toBe('package');
    expect(reloaded.diagramPresentations['diag-packages'].elementIds).toEqual(['pkg-domain']);
  });

  it('does not create and present an element into a missing semantic diagram', () => {
    const result = executeSysmlCommand(createSysmlGatewayState(), {
      type: 'createAndPresent',
      element: { id: 'pkg-orphan', kind: 'package', name: 'Orphan', namespace: [], ownerId: 'model' },
      diagramId: 'missing-package-diagram', presentation: { x: 40, y: 50 },
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('DIAGRAM_NOT_FOUND');
    expect(result.repository.packages['pkg-orphan']).toBeUndefined();
  });

  it('rejects creation of a diagram whose semantic ID already exists', () => {
    const repository = createEmptyRepository();
    repository.diagrams['diag-existing'] = {
      id: 'diag-existing', kind: 'diagram', diagramKind: 'package', name: 'Original', namespace: [], ownerId: 'model',
    };
    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'createDiagram',
      diagram: { id: 'diag-existing', kind: 'diagram', diagramKind: 'package', name: 'Replacement', namespace: [], ownerId: 'model' },
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('DUPLICATE_ELEMENT_ID');
    expect(result.repository.diagrams['diag-existing'].name).toBe('Original');
  });

  it('rejects adding a missing semantic element to an existing diagram', () => {
    const repository = createEmptyRepository();
    repository.diagrams['diag-packages'] = {
      id: 'diag-packages', kind: 'diagram', diagramKind: 'package', name: 'Packages', namespace: [], ownerId: 'model',
    };
    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'addToDiagram', diagramId: 'diag-packages', elementIds: ['missing-element'],
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('ELEMENT_NOT_FOUND');
    expect(result.diagramPresentations['diag-packages']).toBeUndefined();
  });

  it('rejects adding an element to an unknown diagram ID', () => {
    const repository = createEmptyRepository();
    repository.packages['pkg-existing'] = {
      id: 'pkg-existing', kind: 'package', name: 'Existing', namespace: ['model'], ownerId: 'model',
    };
    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'addToDiagram', diagramId: 'missing-diagram', elementIds: ['pkg-existing'],
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('DIAGRAM_NOT_FOUND');
    expect(result.diagramPresentations['missing-diagram']).toBeUndefined();
  });

  it('rejects diagram creation when the ID collides with a package or block definition (superset guard)', () => {
    const repository = createEmptyRepository();
    repository.packages['pkg-collision'] = {
      id: 'pkg-collision', kind: 'package', name: 'Collision', namespace: ['model'], ownerId: 'model',
    };
    repository.definitions['blk-collision'] = {
      id: 'blk-collision', name: 'Collision', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };

    const packageCollision = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'createDiagram',
      diagram: { id: 'pkg-collision', kind: 'diagram', diagramKind: 'package', name: 'Impostor', namespace: [], ownerId: 'model' },
    });
    expect(packageCollision.committed).toBe(false);
    expect(packageCollision.diagnostics[0]?.code).toBe('DUPLICATE_ELEMENT_ID');
    expect(packageCollision.repository.diagrams['pkg-collision']).toBeUndefined();

    const definitionCollision = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'createDiagram',
      diagram: { id: 'blk-collision', kind: 'diagram', diagramKind: 'bdd', name: 'Impostor', namespace: [], ownerId: 'model' },
    });
    expect(definitionCollision.committed).toBe(false);
    expect(definitionCollision.diagnostics[0]?.code).toBe('DUPLICATE_ELEMENT_ID');
    expect(definitionCollision.repository.diagrams['blk-collision']).toBeUndefined();
  });

  it('accepts the legacy package pseudo-ID as a package-mode presentation target', () => {
    const repository = createEmptyRepository();
    repository.packages['pkg-domain'] = {
      id: 'pkg-domain', kind: 'package', name: 'Domain', namespace: ['model'], ownerId: 'model',
    };
    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'addToDiagram', diagramId: 'package', elementIds: ['pkg-domain'],
    });
    expect(result.committed).toBe(true);
    expect(result.diagramPresentations['package'].elementIds).toEqual(['pkg-domain']);
  });

  it('normalizes an omitted Package Diagram owner to the Model', () => {
    const result = executeSysmlCommand(createSysmlGatewayState(), {
      type: 'createDiagram',
      diagram: { id: 'diag-default-owner', kind: 'diagram', diagramKind: 'package', name: 'Packages', namespace: [] },
    });
    expect(result.committed).toBe(true);
    expect(result.repository.diagrams['diag-default-owner'].ownerId).toBe('model');
  });

  it('rejects unrenderable semantic subjects on a Package Diagram', () => {
    const repository = createEmptyRepository();
    repository.diagrams['diag-packages'] = {
      id: 'diag-packages', kind: 'diagram', diagramKind: 'package', name: 'Packages', namespace: [], ownerId: 'model',
    };
    const result = executeSysmlCommand(createSysmlGatewayState(repository), {
      type: 'addToDiagram', diagramId: 'diag-packages', elementIds: ['diag-packages'],
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('INVALID_DIAGRAM_ELEMENT');
    expect(result.diagramPresentations['diag-packages']).toBeUndefined();
  });

  it('shows direct and recursive Package contents as one undoable presentation transaction', () => {
    const repository = createEmptyRepository();
    repository.packages['pkg-parent'] = { id: 'pkg-parent', kind: 'package', name: 'Parent', namespace: ['model'], ownerId: 'model' };
    repository.packages['pkg-child'] = { id: 'pkg-child', kind: 'package', name: 'Child', namespace: ['model', 'Parent'], ownerId: 'pkg-parent' };
    repository.definitions['blk-direct'] = {
      id: 'blk-direct', kind: 'block', name: 'Direct', namespace: [], ownerId: 'pkg-parent',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions['blk-nested'] = {
      id: 'blk-nested', kind: 'block', name: 'Nested', namespace: [], ownerId: 'pkg-child',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.diagrams['diag-packages'] = {
      id: 'diag-packages', kind: 'diagram', diagramKind: 'package', name: 'Packages', namespace: [], ownerId: 'model',
    };

    const initial = createSysmlGatewayState(repository);
    const direct = executeSysmlCommand(initial, {
      type: 'showPackageContents', diagramId: 'diag-packages', packageId: 'pkg-parent', mode: 'direct',
    });
    expect(direct.committed).toBe(true);
    expect(direct.repository).toBe(repository);
    expect(direct.diagramPresentations['diag-packages'].elementIds).toEqual(['pkg-child', 'blk-direct']);
    expect(direct.repository.definitions['blk-direct'].ownerId).toBe('pkg-parent');

    const undone = executeSysmlCommand(direct, { type: 'undo' });
    expect(undone.diagramPresentations['diag-packages']?.elementIds ?? []).toEqual([]);
    const recursive = executeSysmlCommand(initial, {
      type: 'showPackageContents', diagramId: 'diag-packages', packageId: 'pkg-parent', mode: 'recursive',
    });
    expect(recursive.diagramPresentations['diag-packages'].elementIds).toEqual(['pkg-child', 'blk-direct', 'blk-nested']);
  });

  it('persists a private Package Import and rejects an invalid target without mutation', () => {
    const repository = createEmptyRepository();
    repository.packages.consumer = { id: 'consumer', kind: 'package', name: 'Consumer', namespace: [], ownerId: 'model' };
    repository.packages.types = { id: 'types', kind: 'package', name: 'Types', namespace: [], ownerId: 'model' };
    repository.definitions.block = {
      id: 'block', kind: 'block', name: 'Block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const initial = createSysmlGatewayState(repository);
    const invalid = executeSysmlCommand(initial, { type: 'createElement', element: {
      id: 'bad-import', kind: 'packageImport', sourceId: 'consumer', targetId: 'block',
      importingNamespaceId: 'consumer', importedPackageId: 'block', visibility: 'public',
    } });
    expect(invalid.committed).toBe(false);
    expect(invalid.diagnostics.map(d => d.code)).toContain('PACKAGE_IMPORT_TARGET_NOT_PACKAGE');
    expect(invalid.repository).toBe(repository);
    const valid = executeSysmlCommand(initial, { type: 'createElement', element: {
      id: 'import', kind: 'packageImport', sourceId: 'consumer', targetId: 'types',
      importingNamespaceId: 'consumer', importedPackageId: 'types', visibility: 'private',
    } });
    expect(valid.committed).toBe(true);
    expect(valid.repository.relationships.import).toMatchObject({ visibility: 'private', sourceId: 'consumer', targetId: 'types' });
    const reloaded = loadCanonicalSysmlProject(buildCanonicalSysmlProjectPayload(valid, { version: '1', projectName: 'Imports' }));
    expect(reloaded.repository.relationships.import.visibility).toBe('private');
  });

  it('atomically creates and presents a Package Import only when both endpoints are displayed', () => {
    const repository = createEmptyRepository();
    repository.packages.consumer = { id: 'consumer', kind: 'package', name: 'Consumer', namespace: [], ownerId: 'model' };
    repository.packages.types = { id: 'types', kind: 'package', name: 'Types', namespace: [], ownerId: 'model' };
    repository.diagrams['diag-packages'] = { id: 'diag-packages', kind: 'diagram', diagramKind: 'package', name: 'Packages', namespace: [], ownerId: 'model' };
    const relationship: SysmlRelationship = {
      id: 'rel-import', kind: 'packageImport', sourceId: 'consumer', targetId: 'types',
      importingNamespaceId: 'consumer', importedPackageId: 'types', visibility: 'public',
    };
    const initial = createSysmlGatewayState(repository);
    const rejected = executeSysmlCommand(initial, {
      type: 'createAndPresent', diagramId: 'diag-packages', element: relationship, presentation: {},
    });
    expect(rejected.committed).toBe(false);
    expect(rejected.repository.relationships['rel-import']).toBeUndefined();

    const endpoints = executeSysmlCommand(initial, { type: 'addToDiagram', diagramId: 'diag-packages', elementIds: ['consumer', 'types'] });
    const created = executeSysmlCommand(endpoints, {
      type: 'createAndPresent', diagramId: 'diag-packages', element: relationship, presentation: {},
    });
    expect(created.committed).toBe(true);
    expect(created.diagramPresentations['diag-packages'].elementIds).toContain('rel-import');
    expect(created.repository.relationships['rel-import'].kind).toBe('packageImport');
    const undone = executeSysmlCommand(created, { type: 'undo' });
    expect(undone.repository.relationships['rel-import']).toBeUndefined();
    expect(undone.diagramPresentations['diag-packages'].elementIds).toEqual(['consumer', 'types']);
  });

  it('deletes a Package with owned descendants, diagram and imports only after impact confirmation', () => {
    const repository = createEmptyRepository();
    repository.packages.parent = { id: 'parent', kind: 'package', name: 'Parent', namespace: [], ownerId: 'model' };
    repository.packages.child = { id: 'child', kind: 'package', name: 'Child', namespace: [], ownerId: 'parent' };
    repository.packages.other = { id: 'other', kind: 'package', name: 'Other', namespace: [], ownerId: 'model' };
    repository.definitions.motor = {
      id: 'motor', kind: 'block', name: 'Motor', namespace: [], ownerId: 'child',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.diagrams.diagram = { id: 'diagram', kind: 'diagram', diagramKind: 'package', name: 'Inside', namespace: [], ownerId: 'parent' };
    repository.relationships.link = {
      id: 'link', kind: 'packageImport', sourceId: 'other', targetId: 'child',
      importingNamespaceId: 'other', importedPackageId: 'child', visibility: 'public',
    };
    const initial = createSysmlGatewayState(repository, {}, {
      diagram: { elementIds: ['child', 'motor'], presentations: {} },
    });
    const proposed = executeSysmlCommand(initial, { type: 'deleteElements', elementIds: ['parent'] });
    expect(proposed.committed).toBe(false);
    expect(proposed.impact?.deletedElementIds).toEqual(expect.arrayContaining(['parent', 'child', 'motor', 'diagram', 'link']));
    const confirmed = executeSysmlCommand(initial, {
      type: 'deleteElements', elementIds: ['parent'], confirmedImpactHash: computeImpactHash(proposed.impact!),
    });
    expect(confirmed.committed).toBe(true);
    expect(confirmed.repository.packages.parent).toBeUndefined();
    expect(confirmed.repository.packages.child).toBeUndefined();
    expect(confirmed.repository.definitions.motor).toBeUndefined();
    expect(confirmed.repository.diagrams.diagram).toBeUndefined();
    expect(confirmed.repository.relationships.link).toBeUndefined();
    expect(confirmed.repository.packages.other).toBeDefined();
    expect(confirmed.diagramPresentations.diagram).toBeUndefined();
    const restored = executeSysmlCommand(confirmed, { type: 'undo' });
    expect(restored.repository.packages.child).toBeDefined();
    expect(restored.repository.relationships.link).toBeDefined();
  });

  it('keeps one semantic element at independent diagram positions across persistence', () => {
    const repository = createEmptyRepository();
    const motor: BlockDefinition = {
      id: 'blk-motor', name: 'Motor', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions[motor.id] = motor;
    let state = createSysmlGatewayState(repository, { [motor.id]: { x: 1, y: 2 } }, {
      requirements: { elementIds: [motor.id] },
      bdd: { elementIds: [motor.id] },
    });

    const requirementsMove = executeSysmlCommand(state, {
      type: 'updatePresentation', diagramId: 'requirements', elementId: motor.id,
      presentation: { x: 10, y: 20, width: 180, height: 90 },
    }, 'requirements');
    state = { ...state, ...requirementsMove };
    const bddMove = executeSysmlCommand(state, {
      type: 'updatePresentation', diagramId: 'bdd', elementId: motor.id,
      presentation: { x: 400, y: 500, width: 160, height: 100 },
    }, 'bdd');
    state = { ...state, ...bddMove };

    const requirementsPresentation = state.diagramPresentations?.requirements?.presentations?.[motor.id];
    const bddPresentation = state.diagramPresentations?.bdd?.presentations?.[motor.id];
    expect(requirementsPresentation?.id).toBeTruthy();
    expect(bddPresentation?.id).toBeTruthy();
    expect(requirementsPresentation?.id).not.toBe(bddPresentation?.id);
    expect(requirementsPresentation?.bounds).toMatchObject({ x: 10, y: 20 });
    expect(bddPresentation?.bounds).toMatchObject({ x: 400, y: 500 });
    expect(state.coordinates[motor.id]).toEqual({ x: 1, y: 2 });

    const payload = buildCanonicalSysmlProjectPayload(state, { version: '1', projectName: 'Scoped presentations' });
    const loaded = loadCanonicalSysmlProject(payload);
    expect(loaded.repository.definitions[motor.id].name).toBe('Motor');
    expect(loaded.repository.definitions).toHaveProperty(motor.id);
    expect(projectLegacyDiagram(loaded.repository, loaded.coordinates, loaded.diagramPresentations, 'requirements').blocks[0])
      .toMatchObject({ id: motor.id, x: 10, y: 20 });
    expect(projectLegacyDiagram(loaded.repository, loaded.coordinates, loaded.diagramPresentations, 'bdd').blocks[0])
      .toMatchObject({ id: motor.id, x: 400, y: 500 });
  });

  it('rejects presentation updates without a resolvable diagram context', () => {
    const result = executeSysmlCommand(createSysmlGatewayState(), {
      type: 'updatePresentation',
      diagramId: 'missing-diagram',
      elementId: 'blk-motor',
      presentation: { x: 10, y: 20 },
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('DIAGRAM_NOT_FOUND');
  });

  it('creates an element in the canonical repository first and derives legacy arrays', () => {
    const state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'block-engine',
      name: 'Engine',
      kind: 'block',
      namespace: ['Vehicle'],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [{
        id: 'port-fuel',
        name: 'fuelIn',
        kind: 'full',
        typeId: 'FuelType',
        direction: 'in',
        isConjugated: false,
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      }],
      operations: ['start()'],
      constraints: ['fuelRate > 0'],
    };

    const result = executeSysmlCommand(state, {
      type: 'createElement',
      element: block,
      presentation: { x: 100, y: 150, width: 200, height: 120 },
    });

    expect(result.committed).toBe(true);
    // Repository is mutated first and revision incremented
    expect(result.repository.definitions['block-engine']).toBeDefined();
    expect(result.repository.definitions['block-engine'].name).toBe('Engine');
    expect(result.repository.revision).toBe(1);
    expect(result.repository.auditTrail).toHaveLength(1);
    expect(result.repository.auditTrail[0].command).toBe('createElement');
    expect(result.repository.auditTrail[0].elementIds).toContain('block-engine');

    // Legacy view is derived from canonical repository
    expect(result.view.blocks).toHaveLength(1);
    const legacyBlock = result.view.blocks[0];
    expect(legacyBlock.id).toBe('block-engine');
    expect(legacyBlock.name).toBe('Engine');
    expect(legacyBlock.x).toBe(100);
    expect(legacyBlock.y).toBe(150);
    expect(legacyBlock.ports).toHaveLength(1);
    expect(legacyBlock.ports[0].id).toBe('port-fuel');
    expect(legacyBlock.ports[0].direction).toBe('in');
  });

  it('updates an element in the canonical repository and reflects in derived view', () => {
    let state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'block-motor',
      name: 'Motor',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    const createResult = executeSysmlCommand(state, {
      type: 'createElement',
      element: block,
    });
    state = { ...state, repository: createResult.repository, history: createResult.history };

    const updateResult = executeSysmlCommand(state, {
      type: 'updateElement',
      elementId: 'block-motor',
      patch: { name: 'ElectricMotor', isAbstract: true },
    });

    expect(updateResult.committed).toBe(true);
    expect(updateResult.repository.revision).toBe(2);
    expect(updateResult.repository.definitions['block-motor'].name).toBe('ElectricMotor');
    expect((updateResult.repository.definitions['block-motor'] as BlockDefinition).isAbstract).toBe(true);

    // Derived view matches
    const updatedViewBlock = updateResult.view.blocks.find((b: any) => b.id === 'block-motor');
    expect(updatedViewBlock?.name).toBe('ElectricMotor');
    expect(updatedViewBlock?.isAbstract).toBe(true);
  });

  it('requires confirmation for cascading deletion and applies atomically upon confirmation', () => {
    let state = createSysmlGatewayState();
    const parentBlock: BlockDefinition = {
      id: 'block-parent',
      name: 'ParentBlock',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    const childUsage: PartUsage = {
      id: 'part-child',
      name: 'childUsage',
      kind: 'part',
      ownerId: 'block-parent',
      typeId: 'block-parent',
      aggregation: 'composite',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    let r = executeSysmlCommand(state, { type: 'createElement', element: parentBlock });
    state = { ...state, repository: r.repository, history: r.history };
    r = executeSysmlCommand(state, { type: 'createElement', element: childUsage });
    state = { ...state, repository: r.repository, history: r.history };

    // Deleting parent block cascades to composite childUsage, so it requires confirmation
    const unconfirmed = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['block-parent'],
    });

    expect(unconfirmed.committed).toBe(false);
    expect(unconfirmed.impact).toBeDefined();
    expect(unconfirmed.impact?.deletedElementIds).toContain('part-child');

    // Confirm with hash
    const impactHash = computeImpactHash(unconfirmed.impact!);
    const confirmed = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['block-parent'],
      confirmedImpactHash: impactHash,
    });

    expect(confirmed.committed).toBe(true);
    expect(confirmed.repository.definitions['block-parent']).toBeUndefined();
    expect(confirmed.repository.usages['part-child']).toBeUndefined();
    expect(confirmed.view.blocks).toHaveLength(0);
    expect(confirmed.view.parts).toHaveLength(0);
  });

  it('supports atomic undo and redo across mutations', () => {
    let state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'block-undoable',
      name: 'InitialName',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    const r1 = executeSysmlCommand(state, { type: 'createElement', element: block });
    state = { ...state, repository: r1.repository, history: r1.history };

    const r2 = executeSysmlCommand(state, {
      type: 'updateElement',
      elementId: 'block-undoable',
      patch: { name: 'UpdatedName' },
    });
    state = { ...state, repository: r2.repository, history: r2.history };

    expect(state.repository.definitions['block-undoable'].name).toBe('UpdatedName');

    // Undo update
    const undoRes = executeSysmlCommand(state, { type: 'undo' });
    expect(undoRes.committed).toBe(true);
    expect(undoRes.repository.definitions['block-undoable'].name).toBe('InitialName');
    expect(undoRes.view.blocks[0].name).toBe('InitialName');
    state = { ...state, repository: undoRes.repository, history: undoRes.history };

    // Redo update
    const redoRes = executeSysmlCommand(state, { type: 'redo' });
    expect(redoRes.committed).toBe(true);
    expect(redoRes.repository.definitions['block-undoable'].name).toBe('UpdatedName');
    expect(redoRes.view.blocks[0].name).toBe('UpdatedName');
  });

  it('atomically rejects invalid createOwnedFeature without mutating repository or history', () => {
    let state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'blk-vehicle',
      name: 'Vehicle',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [{
        id: 'port-existing',
        name: 'p1',
        kind: 'standard',
        typeId: 'type-voltage',
        direction: 'inout',
        isConjugated: false,
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      }],
      operations: [],
      constraints: [],
    };
    const blockRes = executeSysmlCommand(state, { type: 'createElement', element: block });
    state = { ...state, repository: blockRes.repository, history: blockRes.history };

    const initialRevision = state.repository.revision;
    const initialPortsLength = (state.repository.definitions['blk-vehicle'] as BlockDefinition).ports.length;
    const initialPastLength = state.patchHistory?.past.length ?? 0;
    const initialActionStackLength = state.actionStack?.length ?? 0;

    // 1. Invalid ProxyPort type (pointing to normal block)
    const badProxyRes = executeSysmlCommand(state, {
      type: 'createOwnedFeature' as any,
      intent: {
        featureKind: 'port',
        ownerBlockId: 'blk-vehicle',
        portKind: 'proxyPort',
        typeId: 'blk-vehicle', // Block is not an InterfaceBlock
      },
    } as any);
    expect(badProxyRes.committed).toBe(false);
    expect(badProxyRes.diagnostics.some(d => d.code === 'INVALID_PROXY_PORT_TYPE')).toBe(true);
    expect(state.repository.revision).toBe(initialRevision);
    expect((state.repository.definitions['blk-vehicle'] as BlockDefinition).ports.length).toBe(initialPortsLength);
    expect(state.patchHistory?.past.length ?? 0).toBe(initialPastLength);
    expect(state.actionStack?.length ?? 0).toBe(initialActionStackLength);

    // 2. Duplicate feature ID
    const duplicateRes = executeSysmlCommand(state, {
      type: 'createOwnedFeature' as any,
      intent: {
        featureKind: 'port',
        ownerBlockId: 'blk-vehicle',
        portKind: 'umlPort',
        featureId: 'port-existing',
      },
    } as any);
    expect(duplicateRes.committed).toBe(false);
    expect(duplicateRes.diagnostics.some(d => d.code === 'DUPLICATE_SEMANTIC_ID')).toBe(true);

    // 3. Missing diagram
    const missingDiagRes = executeSysmlCommand(state, {
      type: 'createOwnedFeature' as any,
      intent: {
        featureKind: 'port',
        ownerBlockId: 'blk-vehicle',
        portKind: 'umlPort',
      },
      diagramId: 'nonexistent-diagram-xyz',
      presentation: { x: 10, y: 20 },
    } as any);
    expect(missingDiagRes.committed).toBe(false);
    expect(missingDiagRes.diagnostics.some(d => d.code === 'DIAGRAM_NOT_FOUND')).toBe(true);
  });

  it('executes createOwnedFeature atomically with feature presentation and single undo/redo', () => {
    let state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'blk-car',
      name: 'Car',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    const bRes = executeSysmlCommand(state, { type: 'createElement', element: block, presentation: { x: 100, y: 100 } });
    state = { ...state, repository: bRes.repository, history: bRes.history, coordinates: bRes.coordinates, diagramPresentations: bRes.diagramPresentations };

    // Create Port on Car with presentation in bdd diagram
    const createRes = executeSysmlCommand(state, {
      type: 'createOwnedFeature' as any,
      intent: {
        featureKind: 'port',
        ownerBlockId: 'blk-car',
        portKind: 'umlPort',
        name: 'fuelPort',
        featureId: 'port-fuel-1',
      },
      diagramId: 'bdd',
      presentation: { x: 15, y: 25 },
    } as any);

    expect(createRes.committed).toBe(true);
    const updatedBlock = createRes.repository.definitions['blk-car'] as BlockDefinition;
    expect(updatedBlock.ports).toHaveLength(1);
    expect(updatedBlock.ports[0].id).toBe('port-fuel-1');
    expect(updatedBlock.ports[0].name).toBe('fuelPort');
    expect(createRes.actionStack).toHaveLength(1);
    expect(createRes.diagramPresentations.bdd?.presentations['blk-car']?.featureLayouts?.['port-fuel-1'] ?? createRes.coordinates['port-fuel-1']).toEqual(expect.objectContaining({ x: 15, y: 25 }));

    state = { ...state, ...createRes };

    // Undo createOwnedFeature
    const undoRes = executeSysmlCommand(state, { type: 'undo' });
    expect(undoRes.committed).toBe(true);
    expect((undoRes.repository.definitions['blk-car'] as BlockDefinition).ports).toHaveLength(0);

    // Redo restores exact feature ID
    const redoRes = executeSysmlCommand({ ...state, ...undoRes }, { type: 'redo' });
    expect(redoRes.committed).toBe(true);
    expect((redoRes.repository.definitions['blk-car'] as BlockDefinition).ports).toHaveLength(1);
    expect((redoRes.repository.definitions['blk-car'] as BlockDefinition).ports[0].id).toBe('port-fuel-1');
  });

  it('persists only canonical repository and presentation; ignores direct legacy-array tampering', () => {
    let state = createSysmlGatewayState();
    const req: RequirementDefinition = {
      id: 'req-speed',
      name: 'Speed Requirement',
      kind: 'requirement',
      namespace: [],
      requirementId: 'REQ-101',
      text: 'Shall exceed 100 km/h',
      status: 'approved',
      version: '1.0',
    };
    const r = executeSysmlCommand(state, {
      type: 'createElement',
      element: req,
      presentation: { x: 50, y: 75, width: 180, height: 90 },
    });
    state = { ...state, repository: r.repository, coordinates: r.coordinates };

    // Simulate direct legacy mutation (a detached rogue block injected directly into view)
    const tamperedView = {
      ...r.view,
      blocks: [
        ...r.view.blocks,
        {
          id: 'rogue-untracked-block',
          name: 'RogueBlock',
          stereotype: 'block',
          x: 999,
          y: 999,
          width: 100,
          height: 80,
          properties: [],
          operations: [],
          constraints: [],
          classes: [],
          ports: [],
        },
      ],
    };

    // Building the project payload must be authoritative from canonical state
    const payload = buildCanonicalSysmlProjectPayload(state, {
      version: '1.0.0',
      projectName: 'SpeedProject',
    });

    // The project payload has canonical sysmlRepository envelope and coordinates
    expect(payload.sysmlRepository).toBeDefined();
    // Rogue block is not in the serialized repository
    const loaded = loadCanonicalSysmlProject(payload);
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.definitions['rogue-untracked-block']).toBeUndefined();
    expect(loaded.view.blocks.find((b: any) => b.id === 'rogue-untracked-block')).toBeUndefined();
    // Authorized requirement survived perfectly
    expect(loaded.repository.requirements['req-speed']).toBeDefined();
    expect(loaded.view.blocks.find((b: any) => b.id === 'req-speed')?.reqId).toBe('REQ-101');
  });

  it('rejects tampered checksum or invalid schema on project load without replacing active model', () => {
    const state = createSysmlGatewayState();
    const payload = buildCanonicalSysmlProjectPayload(state, {
      version: '1.0.0',
      projectName: 'CorruptedProject',
    });

    // Corrupt the repository string in envelope
    const parsedEnvelope = JSON.parse(payload.sysmlRepository as string);
    parsedEnvelope.repository.revision = 99999; // Alters content without updating checksum
    const corruptedPayload = {
      ...payload,
      sysmlRepository: JSON.stringify(parsedEnvelope),
    };

    const loadResult = loadCanonicalSysmlProject(corruptedPayload);
    expect(loadResult.valid).toBe(false);
    expect(loadResult.diagnostics.some((d: any) => d.code === 'PERSISTENCE_CHECKSUM_MISMATCH')).toBe(true);
  });

  it('previews container deletion impact, cancels without mutation or revision change, confirms with single revision/audit record, and undoes completely', () => {
    let state = createSysmlGatewayState();
    const parentReq: RequirementDefinition = {
      id: 'req-parent', name: 'ParentReq', kind: 'requirement', namespace: [],
      requirementId: 'REQ-P', text: 'Parent', status: 'draft', version: '1.0',
    };
    const childReq: RequirementDefinition = {
      id: 'req-child', name: 'ChildReq', kind: 'requirement', namespace: [],
      requirementId: 'REQ-C', text: 'Child', status: 'draft', version: '1.0',
    };
    const containmentRel: SysmlRelationship = {
      id: 'rel-rc', kind: 'requirementContainment', sourceId: 'req-parent', targetId: 'req-child',
    };

    // Add elements to state
    let r = executeSysmlCommand(state, { type: 'createElement', element: parentReq, presentation: { x: 10, y: 10, width: 100, height: 60 } });
    state = { ...state, repository: r.repository, coordinates: r.coordinates, history: r.history };
    r = executeSysmlCommand(state, { type: 'createElement', element: childReq, presentation: { x: 10, y: 100, width: 100, height: 60 } });
    state = { ...state, repository: r.repository, coordinates: r.coordinates, history: r.history };
    r = executeSysmlCommand(state, { type: 'createElement', element: containmentRel });
    state = { ...state, repository: r.repository, coordinates: r.coordinates, history: r.history };

    const initialRevision = state.repository.revision;
    const initialAuditLength = state.repository.auditTrail.length;

    // 1. Preview without confirmation hash -> uncommitted, preview lists complete subtree
    const unconfirmed = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['req-parent'] });
    expect(unconfirmed.committed).toBe(false);
    expect(unconfirmed.impact).toBeDefined();
    expect(unconfirmed.impact!.nestedRequirementIds).toEqual(['req-child']);
    expect(unconfirmed.impact!.deletedElementIds).toEqual(expect.arrayContaining(['req-parent', 'req-child', 'rel-rc']));
    expect(unconfirmed.repository.revision).toBe(initialRevision);
    expect(unconfirmed.repository.auditTrail).toHaveLength(initialAuditLength);
    expect(unconfirmed.repository.requirements['req-parent']).toBeDefined();
    expect(unconfirmed.repository.requirements['req-child']).toBeDefined();

    // 2. Confirmed deletion with computed impact hash
    const impactHash = computeImpactHash(unconfirmed.impact!);
    const confirmed = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['req-parent'],
      confirmedImpactHash: impactHash,
    });
    expect(confirmed.committed).toBe(true);
    expect(confirmed.repository.revision).toBe(initialRevision + 1);
    expect(confirmed.repository.auditTrail).toHaveLength(initialAuditLength + 1);
    expect(confirmed.repository.auditTrail[confirmed.repository.auditTrail.length - 1].command).toBe('deleteElements');
    expect(confirmed.repository.requirements['req-parent']).toBeUndefined();
    expect(confirmed.repository.requirements['req-child']).toBeUndefined();
    expect(confirmed.repository.relationships['rel-rc']).toBeUndefined();

    // 3. One undo restores exact repository prior to deletion
    const undone = executeSysmlCommand(
      { ...state, repository: confirmed.repository, coordinates: confirmed.coordinates, history: confirmed.history },
      { type: 'undo' },
    );
    expect(undone.committed).toBe(true);
    expect(undone.repository.requirements['req-parent']).toBeDefined();
    expect(undone.repository.requirements['req-child']).toBeDefined();
    expect(undone.repository.relationships['rel-rc']).toBeDefined();
    expect(undone.repository.revision).toBe(initialRevision);
  });

  it('separates diagram removal from semantic model deletion and preserves containment & revision', () => {
    let state = createSysmlGatewayState();
    const parentReq: RequirementDefinition = {
      id: 'req-parent',
      name: 'System Specification',
      requirementId: 'REQ-001',
      text: 'The system shall perform all operations.',
      namespace: [],
      kind: 'requirement',
      status: 'approved',
      priority: 'high',
      risk: 'low',
      version: '1.0',
    };
    const childReq: RequirementDefinition = {
      id: 'req-child',
      name: 'Subsystem Specification',
      requirementId: 'REQ-002',
      text: 'The subsystem shall perform sub-operations.',
      namespace: [],
      kind: 'requirement',
      status: 'draft',
      priority: 'medium',
      risk: 'medium',
      version: '1.0',
    };
    const containmentRel: SysmlRelationship = {
      id: 'rel-contain',
      kind: 'requirementContainment',
      sourceId: 'req-parent',
      targetId: 'req-child',
    };

    const s1 = executeSysmlCommand(state, { type: 'createElement', element: parentReq });
    const s2 = executeSysmlCommand({ ...state, repository: s1.repository, history: s1.history }, { type: 'createElement', element: childReq });
    const s3 = executeSysmlCommand({ ...state, repository: s2.repository, history: s2.history }, { type: 'createElement', element: containmentRel });

    const initialRevision = s3.repository.revision;
    const initialAuditLength = s3.repository.auditTrail.length;

    // Set initial diagram presentation membership
    state = {
      ...state,
      repository: s3.repository,
      history: s3.history,
      diagramPresentations: {
        'req-diagram-1': { elementIds: ['req-parent', 'req-child'], presentations: {} },
      },
    };

    // Remove parent from diagram only
    const removeResult = executeSysmlCommand(state, {
      type: 'removeFromDiagram',
      diagramId: 'req-diagram-1',
      elementIds: ['req-parent'],
    });

    expect(removeResult.committed).toBe(true);
    // 1. Repository revision is preserved!
    expect(removeResult.repository.revision).toBe(initialRevision);
    expect(removeResult.repository.auditTrail).toHaveLength(initialAuditLength);

    // 2. Both semantic requirements, containment relationship, and RTM rows survive
    expect(removeResult.repository.requirements['req-parent']).toBeDefined();
    expect(removeResult.repository.requirements['req-child']).toBeDefined();
    expect(removeResult.repository.relationships['rel-contain']).toBeDefined();
    expect(removeResult.repository.relationships['rel-contain'].kind).toBe('requirementContainment');

    // 3. Only presentation membership changes
    expect(removeResult.diagramPresentations['req-diagram-1'].elementIds).toEqual(['req-child']);
    expect(removeResult.diagramPresentations['req-diagram-1'].elementIds).not.toContain('req-parent');

    // 4. View for this diagram filters out removed element
    const filteredView = projectLegacyDiagram(removeResult.repository, removeResult.coordinates, removeResult.diagramPresentations, 'req-diagram-1');
    expect(filteredView.blocks.map(b => b.id)).toEqual(['req-child']);

    // 5. Presentation-only operation undoes without modifying repository revision
    const undonePresentation = executeSysmlCommand(
      {
        ...state,
        repository: removeResult.repository,
        coordinates: removeResult.coordinates,
        diagramPresentations: removeResult.diagramPresentations,
        history: removeResult.history,
        presentationHistory: (removeResult as any).presentationHistory,
      },
      { type: 'undo' },
    );
    expect(undonePresentation.committed).toBe(true);
    expect(undonePresentation.diagramPresentations['req-diagram-1'].elementIds).toEqual(expect.arrayContaining(['req-parent', 'req-child']));
    expect(undonePresentation.repository.revision).toBe(initialRevision);

    // 6. Project payload serialization & load round-trips diagramPresentations
    const payload = buildCanonicalSysmlProjectPayload(
      {
        ...state,
        repository: removeResult.repository,
        diagramPresentations: removeResult.diagramPresentations,
      },
      { version: '1.0', projectName: 'Test Project' },
    );
    expect(payload.diagramPresentations).toEqual({
      'req-diagram-1': {
        elementIds: ['req-child'],
        presentations: {
          'req-child': {
            id: 'presentation:req-diagram-1:req-child',
            diagramId: 'req-diagram-1',
            semanticElementId: 'req-child',
            bounds: {},
          },
        },
      },
    });

    const loaded = loadCanonicalSysmlProject(payload);
    expect(loaded.diagramPresentations).toEqual(payload.diagramPresentations);
    expect(loaded.repository.requirements['req-parent']).toBeDefined();
    expect(loaded.repository.requirements['req-child']).toBeDefined();
  });

  it('coalesces rapid pointer drag updates sharing a coalesceKey into a single history entry', () => {
    let state = createSysmlGatewayState();
    const block: BlockDefinition = {
      id: 'blk-drag',
      name: 'DraggableBlock',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    let r = executeSysmlCommand(state, {
      type: 'createElement',
      element: block,
      presentation: { x: 0, y: 0 },
    });
    state = { ...state, repository: r.repository, coordinates: r.coordinates, store: r.store, patchHistory: r.patchHistory, history: r.history };
    const initialPresentation = {
      id: 'presentation:drag-diagram:blk-drag',
      diagramId: 'drag-diagram',
      semanticElementId: 'blk-drag',
      bounds: { x: 0, y: 0 },
    };
    const dragDiagramPresentations = {
      'drag-diagram': { elementIds: ['blk-drag'], presentations: { 'blk-drag': initialPresentation } },
    };
    state = {
      ...state,
      diagramPresentations: dragDiagramPresentations,
      store: fromRepository(r.repository, r.coordinates, dragDiagramPresentations),
    };

    // Simulate 10 drag move events with same coalesceKey
    for (let i = 1; i <= 10; i++) {
      r = executeSysmlCommand(state, {
        type: 'updatePresentation',
        diagramId: 'drag-diagram',
        elementId: 'blk-drag',
        presentation: { x: i * 10, y: i * 10 },
        coalesceKey: 'drag-blk-drag',
      });
      state = {
        ...state,
        coordinates: r.coordinates,
        diagramPresentations: r.diagramPresentations,
        store: r.store,
        patchHistory: r.patchHistory,
        history: r.history,
      };
    }

    expect(state.diagramPresentations?.['drag-diagram']?.presentations['blk-drag'].bounds)
      .toEqual({ x: 100, y: 100 });
    // In patchHistory, all 10 drag operations should have coalesced into ONE entry!
    expect(state.patchHistory?.past.length).toBe(2); // 1 create + 1 coalesced drag

    // Single undo restores back to initial position (0, 0)
    const undone = executeSysmlCommand(state, { type: 'undo' });
    expect(undone.diagramPresentations['drag-diagram'].presentations['blk-drag'].bounds)
      .toEqual({ x: 0, y: 0 });

    // Redo restores to final position (100, 100)
    const redone = executeSysmlCommand(
      {
        ...state,
        repository: undone.repository,
        coordinates: undone.coordinates,
        diagramPresentations: undone.diagramPresentations,
        store: undone.store,
        patchHistory: undone.patchHistory,
        history: undone.history,
      },
      { type: 'redo' },
    );
    expect(redone.diagramPresentations['drag-diagram'].presentations['blk-drag'].bounds)
      .toEqual({ x: 100, y: 100 });
  });

  it('bounds history memory under configurable budget', () => {
    let state = createSysmlGatewayState(undefined, undefined, undefined, {
      maxEntries: 5,
      maxBytes: 5000,
    });

    const block: BlockDefinition = {
      id: 'blk-budget',
      name: 'BudgetBlock',
      kind: 'block',
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    let r = executeSysmlCommand(state, { type: 'createElement', element: block });
    state = { ...state, repository: r.repository, store: r.store, patchHistory: r.patchHistory, history: r.history };

    for (let i = 1; i <= 15; i++) {
      r = executeSysmlCommand(state, {
        type: 'updateElement',
        elementId: 'blk-budget',
        patch: { name: `Name_v${i}` },
      });
      state = { ...state, repository: r.repository, store: r.store, patchHistory: r.patchHistory, history: r.history };
    }

    // Both patchHistory and legacy MutationHistory are capped to prevent memory leaks!
    expect(state.patchHistory?.past.length).toBeLessThanOrEqual(5);
    expect(state.history.past.length).toBeLessThanOrEqual(20);
  });

  it('Task 6: refuses deletion touching a protected baseline until cloned or explicitly authorized', () => {
    let state = createSysmlGatewayState();
    const target: RequirementDefinition = {
      id: 'req-target', name: 'Target', kind: 'requirement', namespace: [],
      requirementId: 'REQ-T', text: 'Target', status: 'draft', version: '1.0',
    };
    let r = executeSysmlCommand(state, { type: 'createElement', element: target });
    state = { ...state, repository: r.repository, history: r.history, store: r.store, patchHistory: r.patchHistory, coordinates: r.coordinates, diagramPresentations: r.diagramPresentations };
    const revisionBefore = state.repository.revision;
    const auditBefore = state.repository.auditTrail.length;
    const patchesBefore = state.patchHistory?.past.length ?? 0;

    // Freeze the target inside a protected baseline snapshot.
    const frozen: typeof state.repository.baselines[string] = {
      id: 'bl-frozen', name: 'Frozen', revision: state.repository.revision,
      createdAt: '2026-09-12T00:00:00Z', protected: true,
      contentHash: 'frozen', elementHashes: { 'req-target': 'h-target' },
    };
    state = { ...state, repository: { ...state.repository, baselines: { ...state.repository.baselines, [frozen.id]: frozen } } };

    // 1. Blocked: no silent deletion of protected content.
    const refused = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['req-target'] });
    expect(refused.committed).toBe(false);
    expect(refused.impact?.severity).toBe('blocked');
    expect(refused.impact?.blockedBaselineIds).toEqual(['bl-frozen']);
    expect(refused.diagnostics.map(d => d.code)).toContain('PROTECTED_BASELINE_REQUIRES_AUTHORIZATION');
    expect(refused.repository.revision).toBe(revisionBefore);
    expect(refused.repository.auditTrail).toHaveLength(auditBefore);
    expect(refused.patchHistory?.past.length ?? 0).toBe(patchesBefore);
    expect(refused.repository.requirements['req-target']).toBeDefined();

    // 2. A confirmed impact hash alone is still not enough without authorization.
    const impactHash = computeImpactHash(refused.impact!);
    const hashOnly = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['req-target'], confirmedImpactHash: impactHash });
    expect(hashOnly.committed).toBe(false);
    expect(hashOnly.diagnostics.map(d => d.code)).toContain('PROTECTED_BASELINE_REQUIRES_AUTHORIZATION');

    // 3. Explicit authorization plus the confirmed hash commits atomically.
    const committed = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['req-target'],
      confirmedImpactHash: impactHash,
      authorizedBaselineIds: ['bl-frozen'],
    });
    expect(committed.committed).toBe(true);
    expect(committed.repository.requirements['req-target']).toBeUndefined();
    expect(committed.repository.revision).toBe(revisionBefore + 1);
    expect(committed.repository.auditTrail).toHaveLength(auditBefore + 1);
  });
});

describe('sysmlCommandGateway semantic policy gating (Task 2)', () => {
  const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
  const defBlock = (id: string, extra: Partial<BlockDefinition> = {}): BlockDefinition => ({
    id, name: id, kind: 'block', namespace: [], isAbstract: false, isLeaf: false,
    properties: [], ports: [], operations: [], constraints: [], ...extra,
  });
  const requirement = (id: string): RequirementDefinition => ({
    id, name: id, kind: 'requirement', namespace: [], requirementId: `REQ-${id}`,
    text: `${id} text`, status: 'draft', version: '1.0',
  });
  const rel = (id: string, kind: SysmlRelationship['kind'], sourceId: string, targetId: string): SysmlRelationship => ({
    id, kind, sourceId, targetId,
  });

  function commitAll(elements: SysmlElement[]) {
    let state = createSysmlGatewayState();
    for (const element of elements) {
      const r = executeSysmlCommand(state, { type: 'createElement', element });
      expect(r.committed).toBe(true);
      state = {
        ...state, repository: r.repository, history: r.history, store: r.store,
        patchHistory: r.patchHistory, coordinates: r.coordinates,
        diagramPresentations: r.diagramPresentations,
      };
    }
    return state;
  }

  function codesOf(result: { diagnostics: Array<{ code: string }> }): string[] {
    return result.diagnostics.map(d => d.code);
  }

  it('rejects generalization with non-block endpoints instead of a generic error', () => {
    const state = commitAll([defBlock('b1'), requirement('req1')]);
    const before = { revision: state.repository.revision, audit: state.repository.auditTrail.length, patches: state.patchHistory?.past.length ?? 0 };
    const result = executeSysmlCommand(state, {
      type: 'createElement', element: rel('g-bad', 'generalization', 'req1', 'b1'),
    });
    expect(result.committed).toBe(false);
    expect(codesOf(result)).toContain('INVALID_GENERALIZATION_ENDPOINTS');
    expect(result.repository.revision).toBe(before.revision);
    expect(result.repository.auditTrail).toHaveLength(before.audit);
    expect(result.patchHistory?.past.length ?? 0).toBe(before.patches);
    expect(result.repository.relationships['g-bad']).toBeUndefined();
  });

  it('rejects composition touching requirement endpoints', () => {
    const state = commitAll([defBlock('b1'), requirement('req1')]);
    const result = executeSysmlCommand(state, {
      type: 'createElement', element: rel('c-bad', 'composition', 'b1', 'req1'),
    });
    expect(result.committed).toBe(false);
    expect(codesOf(result)).toContain('INVALID_COMPOSITION_ENDPOINTS');
  });

  it('blocks invalid relationship creates and updates before repository mutation', () => {
    const valueType = { id: 'temperature', name: 'Temperature', namespace: [], kind: 'valueType' as const };
    const state = commitAll([defBlock('system'), defBlock('child'), valueType as SysmlElement, requirement('req')]);
    const before = { revision: state.repository.revision, audit: state.repository.auditTrail.length };

    const aggregation = executeSysmlCommand(state, {
      type: 'createElement', element: rel('aggregation', 'sharedAggregation', 'system', 'temperature'),
    });
    expect(aggregation.committed).toBe(false);
    expect(codesOf(aggregation)).toContain('INVALID_AGGREGATION_ENDPOINTS');
    expect(aggregation.repository.relationships.aggregation).toBeUndefined();

    const crossFamily = executeSysmlCommand(state, {
      type: 'createElement', element: rel('cross-family', 'generalization', 'system', 'temperature'),
    });
    expect(crossFamily.committed).toBe(false);
    expect(codesOf(crossFamily)).toContain('CROSS_FAMILY_GENERALIZATION');
    expect(crossFamily.repository.relationships['cross-family']).toBeUndefined();

    const structuralRequirement = executeSysmlCommand(state, {
      type: 'createElement', element: rel('req-structure', 'association', 'req', 'system'),
    });
    expect(structuralRequirement.committed).toBe(false);
    expect(codesOf(structuralRequirement)).toContain('INCOMPATIBLE_RELATIONSHIP_ENDPOINTS');
    expect(structuralRequirement.repository.relationships['req-structure']).toBeUndefined();

    const valid = executeSysmlCommand(state, {
      type: 'createElement', element: rel('change-me', 'association', 'system', 'child'),
    });
    expect(valid.committed).toBe(true);
    const update = executeSysmlCommand({ ...state, repository: valid.repository, history: valid.history, store: valid.store, patchHistory: valid.patchHistory }, {
      type: 'updateElement', elementId: 'change-me', patch: { kind: 'sharedAggregation', targetId: 'temperature' },
    });
    expect(update.committed).toBe(false);
    expect(codesOf(update)).toContain('INVALID_AGGREGATION_ENDPOINTS');
    expect(update.repository.relationships['change-me']).toEqual(valid.repository.relationships['change-me']);
    expect(update.repository.revision).toBe(before.revision + 1);
    expect(update.repository.auditTrail).toHaveLength(before.audit + 1);
  });

  it('rejects relationships with missing endpoints and duplicates with typed codes', () => {
    const state = commitAll([defBlock('a'), defBlock('b')]);
    const missing = executeSysmlCommand(state, {
      type: 'createElement', element: rel('r-missing', 'association', 'a', 'ghost'),
    });
    expect(missing.committed).toBe(false);
    expect(codesOf(missing)).toContain('MISSING_RELATIONSHIP_ENDPOINT');

    const first = executeSysmlCommand(state, {
      type: 'createElement', element: rel('r1', 'association', 'a', 'b'),
    });
    expect(first.committed).toBe(true);
    const next = {
      ...state, repository: first.repository, history: first.history, store: first.store,
      patchHistory: first.patchHistory, coordinates: first.coordinates,
      diagramPresentations: first.diagramPresentations,
    };
    const dupe = executeSysmlCommand(next, {
      type: 'createElement', element: rel('r2', 'association', 'a', 'b'),
    });
    expect(dupe.committed).toBe(false);
    expect(codesOf(dupe)).toContain('DUPLICATE_RELATIONSHIP');
  });

  it('rejects block creation specializing a leaf supertype', () => {
    const state = commitAll([defBlock('leaf-parent', { isLeaf: true })]);
    const result = executeSysmlCommand(state, {
      type: 'createElement',
      element: defBlock('child', { supertypeIds: ['leaf-parent'] }),
    });
    expect(result.committed).toBe(false);
    expect(codesOf(result)).toContain('LEAF_SPECIALIZATION');
  });

  it('accepts a valid block-to-block generalization (policy allow path)', () => {
    const state = commitAll([defBlock('base'), defBlock('sub')]);
    const result = executeSysmlCommand(state, {
      type: 'createElement', element: rel('g-ok', 'generalization', 'sub', 'base'),
    });
    expect(result.committed).toBe(true);
    expect(result.repository.relationships['g-ok']).toBeDefined();
  });

  const portDef = (id: string, direction: PortDefinition['direction'], typeId = 'if'): PortDefinition => ({
    id, name: id, kind: 'proxy', typeId, direction, isConjugated: false, multiplicity: one,
  });

  function ibdFixture() {
    const ifDef = { id: 'if', name: 'IF', namespace: [], kind: 'interface' as const, features: ['signal'] };
    return commitAll([
      ifDef as unknown as SysmlElement,
      defBlock('sys', { ports: [portDef('boundary-def', 'out')] }),
      defBlock('compA', { ports: [portDef('out-def', 'out')] }),
      defBlock('compB', { ports: [portDef('in-def', 'in'), portDef('out-def-b', 'out')] }),
      { id: 'partA', name: 'partA', kind: 'part', ownerId: 'sys', typeId: 'compA', aggregation: 'composite', multiplicity: one } as unknown as SysmlElement,
      { id: 'partB', name: 'partB', kind: 'part', ownerId: 'sys', typeId: 'compB', aggregation: 'composite', multiplicity: one } as unknown as SysmlElement,
      { id: 'aOut', name: 'out', kind: 'port', ownerId: 'partA', definitionId: 'out-def' } as unknown as SysmlElement,
      { id: 'bIn', name: 'in', kind: 'port', ownerId: 'partB', definitionId: 'in-def' } as unknown as SysmlElement,
      { id: 'bOut', name: 'out', kind: 'port', ownerId: 'partB', definitionId: 'out-def-b' } as unknown as SysmlElement,
    ]);
  }

  const connector = (id: string, extra: Partial<ConnectorUsage> = {}): ConnectorUsage => ({
    id, kind: 'assembly', ownerId: 'sys', sourcePortId: 'aOut', targetPortId: 'bIn', ...extra,
  });

  it('gates connector creation (connect path) through the IBD policy', () => {
    const state = ibdFixture();
    const ok = executeSysmlCommand(state, { type: 'createElement', element: connector('conn-ok') });
    expect(ok.committed).toBe(true);
    expect(ok.repository.connectors['conn-ok']).toBeDefined();

    const badDirection = executeSysmlCommand(state, {
      type: 'createElement', element: connector('conn-dir', { targetPortId: 'bOut' }),
    });
    expect(badDirection.committed).toBe(false);
    expect(codesOf(badDirection)).toContain('INCOMPATIBLE_PORT_DIRECTION');

    const badContext = executeSysmlCommand(state, {
      type: 'createElement', element: connector('conn-ctx', { ownerId: 'compA' }),
    });
    expect(badContext.committed).toBe(false);
    expect(codesOf(badContext)).toContain('INVALID_CONNECTOR_CONTEXT');

    const afterOk = {
      ...state, repository: ok.repository, history: ok.history, store: ok.store,
      patchHistory: ok.patchHistory, coordinates: ok.coordinates,
      diagramPresentations: ok.diagramPresentations,
    };
    const dupe = executeSysmlCommand(afterOk, {
      type: 'createElement', element: connector('conn-dupe'),
    });
    expect(dupe.committed).toBe(false);
    expect(codesOf(dupe)).toContain('DUPLICATE_CONNECTOR');
  });

  it('validates updateElement against leaf / redefine policy', () => {
    const base = defBlock('base', {
      properties: [{ id: 'p1', name: 'p1', kind: 'value', typeId: 'T', multiplicity: one }],
    });
    const leafParent = defBlock('leaf-parent', { isLeaf: true });
    const state = commitAll([
      { id: 'T', name: 'T', namespace: [], kind: 'valueType' } as unknown as SysmlElement,
      base, leafParent, defBlock('child', { supertypeIds: ['base'] }),
    ]);

    const leafUpdate = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'child', patch: { supertypeIds: ['leaf-parent'] },
    });
    expect(leafUpdate.committed).toBe(false);
    expect(codesOf(leafUpdate)).toContain('LEAF_SPECIALIZATION');
    expect(leafUpdate.repository.revision).toBe(state.repository.revision);

    const badRedefine = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'child',
      patch: {
        properties: [{ id: 'p1r', name: 'p1r', kind: 'value', typeId: 'Other', multiplicity: one, redefinesId: 'p1' }],
      },
    });
    expect(badRedefine.committed).toBe(false);
    expect(codesOf(badRedefine)).toContain('INCOMPATIBLE_REDEFINITION');

    const sealParent = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'base', patch: { isLeaf: true },
    });
    expect(sealParent.committed).toBe(false);
    expect(codesOf(sealParent)).toContain('LEAF_SPECIALIZATION');
  });

  it('rejects deletion of unknown elements with a typed code and no state change', () => {
    const state = commitAll([defBlock('lonely')]);
    const before = { revision: state.repository.revision, audit: state.repository.auditTrail.length };
    const result = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['ghost'] });
    expect(result.committed).toBe(false);
    expect(codesOf(result)).toContain('ELEMENT_NOT_FOUND');
    expect(result.repository.revision).toBe(before.revision);
    expect(result.repository.auditTrail).toHaveLength(before.audit);
  });

  it('rejects creation of element with duplicate ID with DUPLICATE_ELEMENT_ID and preserves state', () => {
    const state = commitAll([defBlock('block-existing')]);
    const before = { revision: state.repository.revision, audit: state.repository.auditTrail.length };
    const result = executeSysmlCommand(state, {
      type: 'createElement',
      element: defBlock('block-existing'),
    });
    expect(result.committed).toBe(false);
    expect(codesOf(result)).toContain('DUPLICATE_ELEMENT_ID');
    expect(result.repository.revision).toBe(before.revision);
    expect(result.repository.auditTrail).toHaveLength(before.audit);
  });

  it('moves definitions atomically and undo restores their owners', () => {
    const repo = createEmptyRepository();
    repo.definitions.motor = {
      id: 'motor',
      name: 'Motor',
      namespace: [],
      kind: 'block',
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    } as any;
    (repo as any).packages = {
      model: { id: 'model', name: 'Model', namespace: [], ownerId: '', kind: 'package' },
      'pkg-power': { id: 'pkg-power', name: 'Power', namespace: [], ownerId: 'model', kind: 'package' },
    };
    const state = createSysmlGatewayState(repo);
    const result = executeSysmlCommand(state, { type: 'moveElements', elementIds: ['motor'], targetOwnerId: 'pkg-power' } as any);
    expect(result.committed).toBe(true);
    expect((result.repository.definitions.motor as any).ownerId).toBe('pkg-power');
    const undone = executeSysmlCommand(result, { type: 'undo' });
    expect((undone.repository.definitions.motor as any).ownerId).toBe('model');
  });

  it('rejects moving the root model package', () => {
    const repo = createEmptyRepository();
    repo.packages['pkg-sub'] = { id: 'pkg-sub', name: 'Sub', namespace: [], ownerId: 'model', kind: 'package' };
    const state = createSysmlGatewayState(repo);
    const result = executeSysmlCommand(state, {
      type: 'moveElements',
      elementIds: ['model'],
      targetOwnerId: 'pkg-sub',
    } as any);
    expect(result.committed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'ROOT_PACKAGE_MOVE_PROHIBITED')).toBe(true);
  });

  it('rejects deleting the root model package', () => {
    const repo = createEmptyRepository();
    const state = createSysmlGatewayState(repo);
    const result = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['model'],
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'ROOT_PACKAGE_DELETION_PROHIBITED')).toBe(true);
  });

  it('rejects moving an element into an incompatible parent metatype', () => {
    const repo = createEmptyRepository();
    repo.definitions.b1 = {
      id: 'b1', name: 'B1', namespace: [], kind: 'block', ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repo.usages.p1 = {
      id: 'p1', name: 'part1', ownerId: 'b1', kind: 'part', typeId: 'b1',
      aggregation: 'composite', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    const state = createSysmlGatewayState(repo);
    // Attempt to move part1 directly under root package 'model'
    const result = executeSysmlCommand(state, {
      type: 'moveElements',
      elementIds: ['p1'],
      targetOwnerId: 'model',
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DISALLOWED_OWNERSHIP')).toBe(true);
  });

  it('creates a Requirements Diagram satisfy relationship in the canonical repository', () => {
    const repo = createEmptyRepository();
    repo.definitions.motor = {
      id: 'motor', name: 'Motor', namespace: [], kind: 'block', ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repo.requirements['req-001'] = {
      id: 'req-001', name: 'REQ-001', requirementId: 'REQ-001', text: 'The motor shall operate.',
      namespace: [], kind: 'requirement', status: 'draft', priority: 'medium', risk: 'medium', version: '1.0',
    };

    const result = executeSysmlCommand(createSysmlGatewayState(repo), {
      type: 'createElement',
      element: {
        id: 'satisfy-001', kind: 'satisfy', sourceId: 'motor', targetId: 'req-001', name: '',
      },
    });

    expect(result.committed).toBe(true);
    expect(result.repository.relationships['satisfy-001']).toMatchObject({
      kind: 'satisfy', sourceId: 'motor', targetId: 'req-001',
    });
    expect(result.view.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'satisfy-001', type: 'satisfy' }),
    ]));
  });

  const makeBlock = (id: string, name: string): BlockDefinition => ({
    id,
    name,
    namespace: [],
    kind: 'block',
    ownerId: 'model',
    isAbstract: false,
    isLeaf: false,
    properties: [],
    ports: [],
    operations: [],
    constraints: [],
  });

  it('atomically creates one semantic element and one presentation', () => {
    const state = createSysmlGatewayState();
    const block = makeBlock('blk-motor', 'Motor');
    const result = executeSysmlCommand(state, {
      type: 'createAndPresent',
      element: block,
      diagramId: 'requirements',
      presentation: { x: 40, y: 80, width: 150, height: 100 },
    });
    expect(result.committed).toBe(true);
    expect(result.repository.definitions['blk-motor']).toBeDefined();
    expect(result.diagramPresentations.requirements.elementIds).toEqual(['blk-motor']);
    expect(result.diagramPresentations.requirements.presentations['blk-motor'].bounds)
      .toMatchObject({ x: 40, y: 80 });
    expect(result.coordinates['blk-motor']).toBeUndefined();
  });

  it('rolls back semantic creation when presentation validation fails', () => {
    const state = createSysmlGatewayState();
    const result = executeSysmlCommand(state, {
      type: 'createAndPresent',
      element: makeBlock('blk-invalid', 'Invalid'),
      diagramId: '',
      presentation: { x: 0, y: 0 },
    });
    expect(result.committed).toBe(false);
    expect(result.repository.definitions['blk-invalid']).toBeUndefined();
    expect(state.store?.entities.has('blk-invalid')).toBe(false);
  });

  it('undoes createAndPresent in a single step', () => {
    const state = createSysmlGatewayState();
    const block = makeBlock('blk-undo-test', 'UndoTest');
    const result = executeSysmlCommand(state, {
      type: 'createAndPresent',
      element: block,
      diagramId: 'requirements',
      presentation: { x: 40, y: 80, width: 150, height: 100 },
    });
    expect(result.committed).toBe(true);
    expect(result.actionStack).toHaveLength(1);

    const undone = executeSysmlCommand(result, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(undone.repository.definitions['blk-undo-test']).toBeUndefined();
    expect(undone.diagramPresentations.requirements?.elementIds ?? []).not.toContain('blk-undo-test');
    expect(undone.diagramPresentations.requirements?.presentations['blk-undo-test']).toBeUndefined();

    const redone = executeSysmlCommand(undone, { type: 'redo' });
    expect(redone.repository.definitions['blk-undo-test']).toEqual(block);
    expect(redone.diagramPresentations.requirements?.presentations['blk-undo-test']).toEqual(
      result.diagramPresentations.requirements.presentations['blk-undo-test'],
    );
  });

  it('updates a Block once and projects the change on every diagram', () => {
    const base = createSysmlGatewayState();
    const block = makeBlock('blk-motor', 'Motor');
    let state = executeSysmlCommand(base, { type: 'createElement', element: block });
    state = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'bdd', elementIds: ['blk-motor'] });
    state = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'requirements', elementIds: ['blk-motor'] });

    const renamed = executeSysmlCommand(state, { type: 'updateElement', elementId: 'blk-motor', patch: { name: 'BLDCMotor' } });
    expect(renamed.repository.definitions['blk-motor'].name).toBe('BLDCMotor');
    expect(renamed.diagramPresentations.bdd.elementIds).toContain('blk-motor');
    expect(renamed.diagramPresentations.requirements.elementIds).toContain('blk-motor');
  });

  it('creates one satisfy relationship independent of its presentation', () => {
    const base = createSysmlGatewayState();
    const block = makeBlock('blk-motor', 'Motor');
    const req: RequirementDefinition = {
      id: 'req-power',
      requirementId: 'REQ-power',
      name: 'PowerRequirement',
      text: 'Must provide power',
      status: 'draft',
      version: '1.0',
      kind: 'requirement',
      namespace: ['model'],
      ownerId: 'model',
    };
    let state = executeSysmlCommand(base, { type: 'createElement', element: block });
    state = executeSysmlCommand(state, { type: 'createElement', element: req });

    const satisfyRelationship: SysmlRelationship = {
      id: 'rel-satisfy-1',
      kind: 'satisfy',
      sourceId: 'blk-motor',
      targetId: 'req-power',
    };
    const result = executeSysmlCommand(state, { type: 'createElement', element: satisfyRelationship });
    expect(result.committed).toBe(true);
    expect(Object.keys(result.repository.relationships)).toEqual([satisfyRelationship.id]);
  });
  it('executes owned port create-and-present atomically with undo and redo restoring identical IDs', () => {
    const base = createSysmlGatewayState();
    const canBus = { id: 'canBus', name: 'CANBus', namespace: [], kind: 'interface' as const, features: ['baud'] };
    const vehicle = makeBlock('blk-vehicle', 'Vehicle');
    let state = executeSysmlCommand(base, { type: 'createElement', element: canBus });
    state = executeSysmlCommand(state, { type: 'createAndPresent', element: vehicle, diagramId: 'bdd', presentation: { x: 50, y: 50, width: 200, height: 150 } });

    const portBuild = buildCreateOwnedPortCommand(state.repository, {
      ownerBlockId: 'blk-vehicle',
      portKind: 'proxyPort',
      typeId: 'canBus',
      diagramId: 'bdd',
      presentation: { x: 50, y: 80 },
    });
    expect(portBuild.ok).toBe(true);

    const executed = executeSysmlCommand(state, portBuild.command as any);
    expect(executed.committed).toBe(true);
    const updatedVehicle = executed.repository.definitions['blk-vehicle'] as BlockDefinition;
    expect(updatedVehicle.ports).toHaveLength(1);
    const createdPortId = updatedVehicle.ports[0].id;
    expect(updatedVehicle.ports[0].kind).toBe('proxy');
    expect(updatedVehicle.ports[0].portKind).toBe('proxyPort');

    // Undo removes the port
    const undone = executeSysmlCommand(executed, { type: 'undo' });
    const undoneVehicle = undone.repository.definitions['blk-vehicle'] as BlockDefinition;
    expect(undoneVehicle.ports).toHaveLength(0);

    // Redo restores the exact same port
    const redone = executeSysmlCommand(undone, { type: 'redo' });
    const redoneVehicle = redone.repository.definitions['blk-vehicle'] as BlockDefinition;
    expect(redoneVehicle.ports).toHaveLength(1);
    expect(redoneVehicle.ports[0].id).toBe(createdPortId);
  });

  it('rejects invalid owned port creation without committing any semantic feature or presentation', () => {
    const base = createSysmlGatewayState();
    const motor = makeBlock('blk-motor', 'Motor');
    const vehicle = makeBlock('blk-vehicle', 'Vehicle');
    let state = executeSysmlCommand(base, { type: 'createElement', element: motor });
    state = executeSysmlCommand(state, { type: 'createAndPresent', element: vehicle, diagramId: 'bdd', presentation: { x: 50, y: 50, width: 200, height: 150 } });

    // Invalid proxyPort typed with a Block
    const invalidBuild = buildCreateOwnedPortCommand(state.repository, {
      ownerBlockId: 'blk-vehicle',
      portKind: 'proxyPort',
      typeId: 'blk-motor',
      diagramId: 'bdd',
      presentation: { x: 50, y: 80 },
    });
    expect(invalidBuild.ok).toBe(false);
    expect(invalidBuild.diagnostics[0]?.code).toBe('INVALID_PROXY_PORT_TYPE');

    // Repository definitions and presentations remain unchanged
    const currentVehicle = state.repository.definitions['blk-vehicle'] as BlockDefinition;
    expect(currentVehicle.ports).toHaveLength(0);
  });

  it('guarantees atomicity: invalid proxy port type leaves repo revision, block features, presentation map, patch history, and action stack unchanged', () => {
    const base = createSysmlGatewayState();
    const motor = makeBlock('blk-motor', 'Motor');
    const vehicle = makeBlock('blk-vehicle', 'Vehicle');
    let state = executeSysmlCommand(base, { type: 'createElement', element: motor });
    state = executeSysmlCommand(state, { type: 'createAndPresent', element: vehicle, diagramId: 'bdd', presentation: { x: 50, y: 50 } });

    const revBefore = state.repository.revision;
    const pastLengthBefore = state.patchHistory?.past.length ?? 0;
    const actionStackLength = state.actionStack?.length ?? 0;

    const res = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'port',
        ownerBlockId: 'blk-vehicle',
        portKind: 'proxyPort',
        typeId: 'blk-motor',
        featureId: 'bad-port-1',
      },
      diagramId: 'bdd',
      presentation: { x: 60, y: 70 },
    });

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'INVALID_PROXY_PORT_TYPE')).toBe(true);
    expect(res.repository.revision).toBe(revBefore);
    expect((res.repository.definitions['blk-vehicle'] as BlockDefinition).ports).toHaveLength(0);
    expect(res.coordinates['bad-port-1']).toBeUndefined();
    expect(res.patchHistory?.past.length ?? 0).toBe(pastLengthBefore);
    expect(res.actionStack?.length ?? 0).toBe(actionStackLength);
  });

  it('guarantees atomicity: missing diagram leaves repo revision, block features, presentation map, patch history, and action stack unchanged', () => {
    const base = createSysmlGatewayState();
    const vehicle = makeBlock('blk-vehicle', 'Vehicle');
    const state = executeSysmlCommand(base, { type: 'createElement', element: vehicle });

    const revBefore = state.repository.revision;
    const pastLengthBefore = state.patchHistory?.past.length ?? 0;
    const actionStackLength = state.actionStack?.length ?? 0;

    const res = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'port',
        ownerBlockId: 'blk-vehicle',
        portKind: 'umlPort',
        featureId: 'port-missing-diagram',
      },
      diagramId: 'nonexistent-diagram-xyz',
      presentation: { x: 60, y: 70 },
    });

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'DIAGRAM_NOT_FOUND')).toBe(true);
    expect(res.repository.revision).toBe(revBefore);
    expect((res.repository.definitions['blk-vehicle'] as BlockDefinition).ports).toHaveLength(0);
    expect(res.coordinates['port-missing-diagram']).toBeUndefined();
    expect(res.patchHistory?.past.length ?? 0).toBe(pastLengthBefore);
    expect(res.actionStack?.length ?? 0).toBe(actionStackLength);
  });

  it('guarantees atomicity: duplicate feature ID leaves repo revision, block features, presentation map, patch history, and action stack unchanged', () => {
    const base = createSysmlGatewayState();
    const vehicle = makeBlock('blk-vehicle', 'Vehicle');
    let state = executeSysmlCommand(base, { type: 'createAndPresent', element: vehicle, diagramId: 'bdd', presentation: { x: 50, y: 50 } });

    // First port
    state = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'port',
        ownerBlockId: 'blk-vehicle',
        portKind: 'umlPort',
        featureId: 'existing-port-id',
      },
      diagramId: 'bdd',
    });
    expect(state.committed).toBe(true);

    const revBefore = state.repository.revision;
    const pastLengthBefore = state.patchHistory?.past.length ?? 0;
    const actionStackLength = state.actionStack?.length ?? 0;

    // Try creating another feature with the duplicate ID
    const res = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'port',
        ownerBlockId: 'blk-vehicle',
        portKind: 'umlPort',
        featureId: 'existing-port-id',
      },
      diagramId: 'bdd',
    });

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'DUPLICATE_SEMANTIC_ID')).toBe(true);
    expect(res.repository.revision).toBe(revBefore);
    expect((res.repository.definitions['blk-vehicle'] as BlockDefinition).ports).toHaveLength(1);
    expect(res.patchHistory?.past.length ?? 0).toBe(pastLengthBefore);
    expect(res.actionStack?.length ?? 0).toBe(actionStackLength);
  });
});

describe('sysmlCommandGateway Task 3: atomic owned-feature IDs and staged validation', () => {
  const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
  const taskBlock = (id: string): BlockDefinition => ({
    id, name: id, kind: 'block', namespace: [], ownerId: 'model',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  });

  function advance(state: SysmlGatewayState, result: ReturnType<typeof executeSysmlCommand>): SysmlGatewayState {
    return {
      ...state,
      repository: result.repository,
      history: result.history,
      store: result.store ?? state.store,
      patchHistory: result.patchHistory ?? state.patchHistory,
      coordinates: result.coordinates,
      diagramPresentations: result.diagramPresentations,
      actionStack: result.actionStack ?? state.actionStack,
      redoStack: result.redoStack ?? state.redoStack,
    };
  }

  function seedVehicleWithMotor(): SysmlGatewayState {
    let state = createSysmlGatewayState();
    state = advance(state, executeSysmlCommand(state, { type: 'createElement', element: taskBlock('blk-vehicle') }));
    state = advance(state, executeSysmlCommand(state, { type: 'createElement', element: taskBlock('blk-motor') }));
    return state;
  }

  function snapshot(state: SysmlGatewayState) {
    return {
      revision: state.repository.revision,
      audit: state.repository.auditTrail.length,
      patches: state.patchHistory?.past.length ?? 0,
      actions: state.actionStack?.length ?? 0,
      redos: state.redoStack?.length ?? 0,
      usages: Object.keys(state.repository.usages).sort(),
      coordinates: JSON.stringify(state.coordinates),
      diagrams: JSON.stringify(state.diagramPresentations),
    };
  }

  function expectNoMutation(result: ReturnType<typeof executeSysmlCommand>, state: SysmlGatewayState, before: ReturnType<typeof snapshot>) {
    expect(result.repository).toBe(state.repository);
    expect(result.repository.revision).toBe(before.revision);
    expect(result.repository.auditTrail).toHaveLength(before.audit);
    expect(result.history).toBe(state.history);
    expect(result.patchHistory?.past.length ?? 0).toBe(before.patches);
    expect(result.actionStack?.length ?? 0).toBe(before.actions);
    expect(result.redoStack?.length ?? 0).toBe(before.redos);
    expect(Object.keys(result.repository.usages).sort()).toEqual(before.usages);
    expect(JSON.stringify(result.coordinates)).toBe(before.coordinates);
    expect(JSON.stringify(result.diagramPresentations)).toBe(before.diagrams);
  }

  it('rejects property creation when caller usageId collides with repo.usages', () => {
    let state = seedVehicleWithMotor();
    const taken: PartUsage = {
      id: 'usage-taken', name: 'taken', kind: 'part', ownerId: 'blk-vehicle', typeId: 'blk-motor',
      aggregation: 'composite', multiplicity: { ...one },
    };
    const created = executeSysmlCommand(state, { type: 'createElement', element: taken });
    expect(created.committed).toBe(true);
    state = advance(state, created);

    const before = snapshot(state);
    const res = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'property', ownerBlockId: 'blk-vehicle', propertyKind: 'part',
        typeId: 'blk-motor', name: 'fresh', featureId: 'prop-fresh-1', usageId: 'usage-taken',
      },
    } as any);

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'DUPLICATE_USAGE_ID')).toBe(true);
    expectNoMutation(res, state, before);
    expect((res.repository.definitions['blk-vehicle'] as BlockDefinition).properties).toHaveLength(0);
    expect(res.repository.usages['prop-fresh-1']).toBeUndefined();
  });

  it('rejects feature IDs colliding with a different repo namespace', () => {
    let state = seedVehicleWithMotor();
    const req: RequirementDefinition = {
      id: 'req-001', name: 'Req', kind: 'requirement', namespace: [],
      requirementId: 'REQ-001', text: 'text', status: 'draft', version: '1.0',
    };
    state = advance(state, executeSysmlCommand(state, { type: 'createElement', element: req }));

    const before = snapshot(state);
    const crossNamespace = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'port', ownerBlockId: 'blk-vehicle', portKind: 'umlPort',
        name: 'p', featureId: 'req-001',
      },
    } as any);
    expect(crossNamespace.committed).toBe(false);
    expect(crossNamespace.diagnostics.some(d => d.code === 'DUPLICATE_SEMANTIC_ID')).toBe(true);
    expectNoMutation(crossNamespace, state, before);

    const definitionNamespace = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'port', ownerBlockId: 'blk-vehicle', portKind: 'umlPort',
        name: 'p', featureId: 'blk-motor',
      },
    } as any);
    expect(definitionNamespace.committed).toBe(false);
    expect(definitionNamespace.diagnostics.some(d => d.code === 'DUPLICATE_SEMANTIC_ID')).toBe(true);
    expectNoMutation(definitionNamespace, state, before);
    expect((definitionNamespace.repository.definitions['blk-vehicle'] as BlockDefinition).ports).toHaveLength(0);
  });

  it('rejects staged usage/feature self-collision and generated usage collisions', () => {
    const state = seedVehicleWithMotor();
    const before = snapshot(state);

    const selfCollision = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'property', ownerBlockId: 'blk-vehicle', propertyKind: 'part',
        typeId: 'blk-motor', name: 'self', featureId: 'dup-self', usageId: 'dup-self',
      },
    } as any);
    expect(selfCollision.committed).toBe(false);
    expect(selfCollision.diagnostics.some(d => d.code === 'DUPLICATE_USAGE_ID')).toBe(true);
    expectNoMutation(selfCollision, state, before);

    let staged = seedVehicleWithMotor();
    const occupant: PartUsage = {
      id: 'part-auto-feat', name: 'occupant', kind: 'part', ownerId: 'blk-vehicle', typeId: 'blk-motor',
      aggregation: 'composite', multiplicity: { ...one },
    };
    staged = advance(staged, executeSysmlCommand(staged, { type: 'createElement', element: occupant }));
    const stagedBefore = snapshot(staged);
    const generatedCollision = executeSysmlCommand(staged, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'property', ownerBlockId: 'blk-vehicle', propertyKind: 'part',
        typeId: 'blk-motor', name: 'auto', featureId: 'auto-feat',
      },
    } as any);
    expect(generatedCollision.committed).toBe(false);
    expect(generatedCollision.diagnostics.some(d => d.code === 'DUPLICATE_USAGE_ID')).toBe(true);
    expectNoMutation(generatedCollision, staged, stagedBefore);
  });

  it('rolls back a staged usage colliding with a nested feature namespace without mutation', () => {
    let state = seedVehicleWithMotor();
    state = advance(state, executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'port', ownerBlockId: 'blk-vehicle', portKind: 'umlPort',
        name: 'nested', featureId: 'port-nested-1',
      },
    } as any));

    const before = snapshot(state);
    const res = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'property', ownerBlockId: 'blk-vehicle', propertyKind: 'part',
        typeId: 'blk-motor', name: 'clash', featureId: 'prop-clash-1', usageId: 'port-nested-1',
      },
      diagramId: 'bdd',
      presentation: { x: 5, y: 5 },
    } as any);

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.severity === 'error')).toBe(true);
    expectNoMutation(res, state, before);
    expect((res.repository.definitions['blk-vehicle'] as BlockDefinition).properties).toHaveLength(0);
    expect(res.coordinates['prop-clash-1']).toBeUndefined();
  });

  it('rolls back a staged-validation failure (duplicate port name) after passing admission without mutation', () => {
    let state = seedVehicleWithMotor();
    const first = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'port', ownerBlockId: 'blk-vehicle', portKind: 'umlPort',
        name: 'duplex', featureId: 'port-duplex-1',
      },
    } as any);
    expect(first.committed).toBe(true);
    state = advance(state, first);

    const before = snapshot(state);
    // Both IDs are fresh so atomic admission passes; the duplicate port name
    // is detectable only by validating the staged repository.
    const res = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'port', ownerBlockId: 'blk-vehicle', portKind: 'umlPort',
        name: 'duplex', featureId: 'port-duplex-2',
      },
      diagramId: 'bdd',
      presentation: { x: 5, y: 5 },
    } as any);

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'PORT_NAME_NOT_UNIQUE' && d.severity === 'error')).toBe(true);
    expect(res.diagnostics.some(d => d.code === 'DUPLICATE_SEMANTIC_ID' || d.code === 'DUPLICATE_USAGE_ID')).toBe(false);
    expectNoMutation(res, state, before);
    expect((res.repository.definitions['blk-vehicle'] as BlockDefinition).ports).toHaveLength(1);
    expect(res.coordinates['port-duplex-2']).toBeUndefined();
  });

  it('commits a valid property creation as one transaction with no error diagnostics', () => {
    const state = seedVehicleWithMotor();
    const before = snapshot(state);
    const res = executeSysmlCommand(state, {
      type: 'createOwnedFeature',
      intent: {
        featureKind: 'property', ownerBlockId: 'blk-vehicle', propertyKind: 'part',
        typeId: 'blk-motor', name: 'engine', featureId: 'prop-engine', usageId: 'usage-engine',
      },
    } as any);

    expect(res.committed).toBe(true);
    expect(res.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(res.repository.revision).toBe(before.revision + 1);
    expect(res.repository.auditTrail).toHaveLength(before.audit + 1);
    expect(res.repository.auditTrail[res.repository.auditTrail.length - 1].command).toBe('createOwnedFeature');
    expect(res.patchHistory?.past.length ?? 0).toBe(before.patches + 1);
    expect(res.actionStack?.length ?? 0).toBe(before.actions + 1);
    expect(res.redoStack?.length ?? 0).toBe(0);
    expect((res.repository.definitions['blk-vehicle'] as BlockDefinition).properties.map(p => p.id)).toEqual(['prop-engine']);
    expect(res.repository.usages['usage-engine']).toMatchObject({ propertyId: 'prop-engine', ownerId: 'blk-vehicle', typeId: 'blk-motor' });

    const undone = executeSysmlCommand(res, { type: 'undo' });
    expect((undone.repository.definitions['blk-vehicle'] as BlockDefinition).properties).toHaveLength(0);
    expect(undone.repository.usages['usage-engine']).toBeUndefined();
    const redone = executeSysmlCommand(undone, { type: 'redo' });
    expect((redone.repository.definitions['blk-vehicle'] as BlockDefinition).properties.map(p => p.id)).toEqual(['prop-engine']);
    expect(redone.repository.usages['usage-engine']).toBeDefined();
  });

  it('Task 4: preserves a valid State-to-Requirement link across mutation, undo, redo, and hydration with context', () => {
    const repository = createEmptyRepository();
    repository.requirements.req1 = {
      id: 'req1', name: 'Req 1', kind: 'requirement', namespace: [],
      requirementId: 'REQ-1', text: 'Must hold', status: 'draft', version: '1',
    };
    const stateContext = {
      externalEndpoints: new Map([
        ['state-active', { id: 'state-active', name: 'Active', family: 'state' as const }],
      ]),
    };
    let state = createSysmlGatewayState(repository, {}, {}, undefined, stateContext);
    // The UI carries family labels on the candidate; persistence must keep IDs only.
    const link: SysmlRelationship = {
      id: 'rel-state-req', kind: 'satisfy', sourceId: 'state-active', targetId: 'req1',
      sourceFamily: 'state', targetFamily: 'requirement',
    };
    const created = executeSysmlCommand(state, { type: 'createElement', element: link });
    expect(created.committed).toBe(true);
    expect(created.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    state = { ...state, ...created };

    const unrelated: BlockDefinition = {
      id: 'blk-unrelated', name: 'Unrelated', kind: 'block', namespace: [], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const mutated = executeSysmlCommand(state, { type: 'createElement', element: unrelated });
    expect(mutated.committed).toBe(true);
    expect(mutated.diagnostics.map(d => d.code)).not.toContain('MISSING_RELATIONSHIP_ENDPOINT');
    expect(mutated.repository.relationships['rel-state-req']).toMatchObject({
      sourceId: 'state-active', targetId: 'req1',
    });
    state = { ...state, ...mutated };

    const renamed = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'blk-unrelated', patch: { name: 'Renamed' },
    });
    expect(renamed.committed).toBe(true);
    expect(renamed.diagnostics.map(d => d.code)).not.toContain('MISSING_RELATIONSHIP_ENDPOINT');
    state = { ...state, ...renamed };

    const undone = executeSysmlCommand(state, { type: 'undo' });
    expect(undone.repository.relationships['rel-state-req']).toMatchObject({
      sourceId: 'state-active', targetId: 'req1',
    });
    expect(undone.diagnostics.map(d => d.code)).not.toContain('MISSING_RELATIONSHIP_ENDPOINT');

    const redone = executeSysmlCommand({ ...state, ...undone }, { type: 'redo' });
    expect(redone.repository.relationships['rel-state-req']).toMatchObject({
      sourceId: 'state-active', targetId: 'req1',
    });
    expect(redone.diagnostics.map(d => d.code)).not.toContain('MISSING_RELATIONSHIP_ENDPOINT');
    state = { ...state, ...redone };

    // Persistence is authoritative on IDs only: no stale State copies survive.
    const payload = buildCanonicalSysmlProjectPayload(state, { version: '1', projectName: 'StateLink' });
    const envelope = JSON.parse(payload.sysmlRepository as string);
    expect(envelope.repository.relationships['rel-state-req']).toMatchObject({
      sourceId: 'state-active', targetId: 'req1',
    });
    expect(envelope.repository.relationships['rel-state-req'].sourceFamily).toBeUndefined();
    expect(envelope.repository.relationships['rel-state-req'].targetFamily).toBeUndefined();

    // Hydration with the active State Machine endpoint context stays valid.
    const loaded = loadCanonicalSysmlProject(payload, stateContext);
    expect(loaded.repository.relationships['rel-state-req']).toMatchObject({
      sourceId: 'state-active', targetId: 'req1',
    });
    expect(loaded.diagnostics.map(d => d.code)).not.toContain('MISSING_RELATIONSHIP_ENDPOINT');
    expect(loaded.diagnostics.map(d => d.code)).not.toContain('UNRESOLVED_ENDPOINT');

    // Hydration without an integrated State diagnoses the missing endpoint.
    const loadedBare = loadCanonicalSysmlProject(payload);
    expect(loadedBare.valid).toBe(false);
    expect(loadedBare.diagnostics.map(d => d.code)).toContain('UNRESOLVED_ENDPOINT');
  });

  it('Task 4: rejects reversed Requirement-to-State satisfy without mutation', () => {
    const repository = createEmptyRepository();
    repository.requirements.req1 = {
      id: 'req1', name: 'Req 1', kind: 'requirement', namespace: [],
      requirementId: 'REQ-1', text: 'Must hold', status: 'draft', version: '1',
    };
    const stateContext = {
      externalEndpoints: new Map([
        ['state-active', { id: 'state-active', name: 'Active', family: 'state' as const }],
      ]),
    };
    const state = createSysmlGatewayState(repository, {}, {}, undefined, stateContext);
    const revisionBefore = state.repository.revision;
    const bad: SysmlRelationship = {
      id: 'rel-bad-direction', kind: 'satisfy', sourceId: 'req1', targetId: 'state-active',
    };
    const res = executeSysmlCommand(state, { type: 'createElement', element: bad });
    expect(res.committed).toBe(false);
    expect(res.repository).toBe(state.repository);
    expect(res.repository.revision).toBe(revisionBefore);
    expect(res.repository.relationships['rel-bad-direction']).toBeUndefined();
    expect(res.diagnostics.map(d => d.code)).toContain('INVALID_SATISFY_DIRECTION');
    // Finding 2: admission carries the same five structured elements as the
    // validation layer (INVALID_RELATIONSHIP_DIRECTION), not a terse code.
    const rejection = res.diagnostics.find(d => d.code === 'INVALID_SATISFY_DIRECTION')!;
    expect(rejection.message).toContain('satisfy');
    expect(rejection.message).toContain('req1');
    expect(rejection.message).toContain('requirement');
    expect(rejection.message).toContain('state-active');
    expect(rejection.message).toContain('state');
    expect(rejection.message).toContain('Satisfy requires');
    expect(rejection.message).toContain('Connect the State to the Requirement');
  });
});

describe('sysmlCommandGateway review follow-up: atomic element commands (Finding 1)', () => {
  const one = { lower: 1, upper: 1 as const, ordered: false, unique: true };
  const block = (id: string, name: string): BlockDefinition => ({
    id, name, kind: 'block', namespace: ['model'], ownerId: 'model',
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  });

  function advance(state: SysmlGatewayState, result: ReturnType<typeof executeSysmlCommand>): SysmlGatewayState {
    return {
      ...state,
      repository: result.repository,
      history: result.history,
      store: result.store ?? state.store,
      patchHistory: result.patchHistory ?? state.patchHistory,
      coordinates: result.coordinates,
      diagramPresentations: result.diagramPresentations,
      actionStack: result.actionStack ?? state.actionStack,
      redoStack: result.redoStack ?? state.redoStack,
    };
  }

  function snapshot(state: SysmlGatewayState) {
    return {
      revision: state.repository.revision,
      audit: state.repository.auditTrail.length,
      patches: state.patchHistory?.past.length ?? 0,
      actions: state.actionStack?.length ?? 0,
      redos: state.redoStack?.length ?? 0,
      definitions: Object.keys(state.repository.definitions).sort(),
      usages: Object.keys(state.repository.usages).sort(),
      diagrams: Object.keys(state.repository.diagrams ?? {}).sort(),
      coordinates: JSON.stringify(state.coordinates),
      presentations: JSON.stringify(state.diagramPresentations),
    };
  }

  function expectNoMutation(result: ReturnType<typeof executeSysmlCommand>, state: SysmlGatewayState, before: ReturnType<typeof snapshot>) {
    expect(result.repository).toBe(state.repository);
    expect(result.repository.revision).toBe(before.revision);
    expect(result.repository.auditTrail).toHaveLength(before.audit);
    expect(result.history).toBe(state.history);
    expect(result.patchHistory?.past.length ?? 0).toBe(before.patches);
    expect(result.actionStack?.length ?? 0).toBe(before.actions);
    expect(result.redoStack?.length ?? 0).toBe(before.redos);
    expect(Object.keys(result.repository.definitions).sort()).toEqual(before.definitions);
    expect(Object.keys(result.repository.usages).sort()).toEqual(before.usages);
    expect(JSON.stringify(result.coordinates)).toBe(before.coordinates);
    expect(JSON.stringify(result.diagramPresentations)).toBe(before.presentations);
  }

  function expectSingleTransaction(result: ReturnType<typeof executeSysmlCommand>, before: ReturnType<typeof snapshot>) {
    expect(result.committed).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.repository.revision).toBe(before.revision + 1);
    expect(result.repository.auditTrail).toHaveLength(before.audit + 1);
    expect(result.patchHistory?.past.length ?? 0).toBe(before.patches + 1);
    expect(result.actionStack?.length ?? 0).toBe(before.actions + 1);
    expect(result.redoStack?.length ?? 0).toBe(0);
  }

  it('createElement rolls back a staged-validation failure (duplicate qualified name) admitted by the gate', () => {
    let state = createSysmlGatewayState();
    state = advance(state, executeSysmlCommand(state, { type: 'createElement', element: block('blk-motor', 'Motor') }));
    const before = snapshot(state);

    // The gate only checks duplicate IDs plus relationship/connector/block
    // policy, so a duplicate qualified name is admitted and caught only by
    // full staged validation (DUPLICATE_QUALIFIED_NAME).
    const res = executeSysmlCommand(state, {
      type: 'createElement',
      element: block('blk-motor-copy', 'Motor'),
      presentation: { x: 5, y: 5 },
    });

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'DUPLICATE_QUALIFIED_NAME' && d.severity === 'error')).toBe(true);
    expectNoMutation(res, state, before);
    expect(res.repository.definitions['blk-motor-copy']).toBeUndefined();
    expect(res.coordinates['blk-motor-copy']).toBeUndefined();
    expect(res.store?.definitions.has('blk-motor-copy')).toBe(false);
    expect(res.store?.coordinates.has('blk-motor-copy')).toBe(false);
  });

  it('updateElement rolls back a staged-validation failure (missing usage type) admitted by the gate', () => {
    let state = createSysmlGatewayState();
    state = advance(state, executeSysmlCommand(state, { type: 'createElement', element: block('blk-vehicle', 'Vehicle') }));
    state = advance(state, executeSysmlCommand(state, { type: 'createElement', element: block('blk-motor', 'Motor') }));
    const part: PartUsage = {
      id: 'part-engine', propertyId: 'prop-engine', kind: 'part', name: 'engine',
      ownerId: 'blk-vehicle', typeId: 'blk-motor', aggregation: 'composite',
      multiplicity: { ...one },
    };
    state = advance(state, executeSysmlCommand(state, { type: 'createElement', element: part }));
    const before = snapshot(state);

    // The update gate only covers block/relationship/connector candidates, so
    // retargeting a part usage at a ghost type is admitted and caught only by
    // full staged validation (MISSING_USAGE_TYPE).
    const res = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'part-engine', patch: { typeId: 'ghost-type' },
    });

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'MISSING_USAGE_TYPE' && d.severity === 'error')).toBe(true);
    expectNoMutation(res, state, before);
    expect(res.repository.usages['part-engine']).toMatchObject({ typeId: 'blk-motor' });
    expect(res.store?.usages.get('part-engine')).toMatchObject({ typeId: 'blk-motor' });
  });

  it('moveElements rolls back a staged-validation failure (duplicate qualified name) admitted by the gate', () => {
    const repository = createEmptyRepository();
    repository.packages['pkg-target'] = {
      id: 'pkg-target', kind: 'package', name: 'Target', namespace: ['model'], ownerId: 'model',
    };
    // Pre-existing repo-level validity error the move gate does not cover:
    // two blocks share one qualified name. The move gate only checks target
    // existence plus ownership policy, so the intent is admitted and only
    // full staged validation (DUPLICATE_QUALIFIED_NAME) rejects it.
    repository.definitions['blk-motor'] = block('blk-motor', 'Motor');
    repository.definitions['blk-motor-copy'] = block('blk-motor-copy', 'Motor');
    const state = createSysmlGatewayState(repository);
    const before = snapshot(state);

    const res = executeSysmlCommand(state, {
      type: 'moveElements', elementIds: ['blk-motor'], targetOwnerId: 'pkg-target',
    });

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'DUPLICATE_QUALIFIED_NAME' && d.severity === 'error')).toBe(true);
    expect(res.diagnostics.some(d => d.code === 'TARGET_OWNER_NOT_FOUND' || d.code === 'DISALLOWED_OWNERSHIP' || d.code === 'CIRCULAR_OWNERSHIP' || d.code === 'ROOT_PACKAGE_MOVE_PROHIBITED')).toBe(false);
    expectNoMutation(res, state, before);
    expect(res.repository.definitions['blk-motor']).toMatchObject({ ownerId: 'model' });
    expect(res.store?.definitions.get('blk-motor')).toMatchObject({ ownerId: 'model' });
  });

  it('createDiagram rolls back a staged-validation failure (proxy port typing) admitted by the gate', () => {
    const repository = createEmptyRepository();
    // Pre-existing repo-level validity error the diagram gate does not
    // cover: a proxy port with no InterfaceBlock type. The diagram gate only
    // checks the diagram id, owner existence, and package-diagram ownership,
    // so the intent is admitted and only full staged validation
    // (PROXY_PORT_TYPE_REQUIRED) rejects it.
    repository.definitions['blk-vehicle'] = {
      ...block('blk-vehicle', 'Vehicle'),
      ports: [{
        id: 'port-orphan', name: 'orphan', kind: 'proxy', portKind: 'proxyPort', typeId: '',
        direction: 'in', isConjugated: false, multiplicity: { ...one },
      }],
    };
    const state = createSysmlGatewayState(repository);
    const before = snapshot(state);

    const res = executeSysmlCommand(state, {
      type: 'createDiagram',
      diagram: { id: 'diag-bdd', kind: 'diagram', diagramKind: 'bdd', name: 'BDD', namespace: ['model'], ownerId: 'model' },
    });

    expect(res.committed).toBe(false);
    expect(res.diagnostics.some(d => d.code === 'PROXY_PORT_TYPE_REQUIRED' && d.severity === 'error')).toBe(true);
    expect(res.diagnostics.some(d => d.code === 'INVALID_DIAGRAM_ID' || d.code === 'DUPLICATE_ELEMENT_ID' || d.code === 'OWNER_NOT_FOUND' || d.code === 'INVALID_DIAGRAM_OWNER')).toBe(false);
    expectNoMutation(res, state, before);
    expect(res.repository.diagrams['diag-bdd']).toBeUndefined();
    expect(res.store?.diagrams.has('diag-bdd')).toBe(false);
    expect(res.diagramPresentations['diag-bdd']).toBeUndefined();
  });

  it('createElement commits a valid element as one transaction with no error diagnostics', () => {
    const state = createSysmlGatewayState();
    const before = snapshot(state);
    const res = executeSysmlCommand(state, {
      type: 'createElement',
      element: block('blk-motor', 'Motor'),
      presentation: { x: 10, y: 20 },
    });

    expectSingleTransaction(res, before);
    expect(res.repository.definitions['blk-motor']).toBeDefined();
    expect(res.coordinates['blk-motor']).toMatchObject({ x: 10, y: 20 });
    expect(res.store?.definitions.has('blk-motor')).toBe(true);
    expect(res.repository.auditTrail[res.repository.auditTrail.length - 1].command).toBe('createElement');
  });

  it('updateElement commits a valid patch as one transaction with no error diagnostics', () => {
    let state = createSysmlGatewayState();
    state = advance(state, executeSysmlCommand(state, { type: 'createElement', element: block('blk-motor', 'Motor') }));
    const before = snapshot(state);
    const res = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'blk-motor', patch: { name: 'BLDCMotor' },
    });

    expectSingleTransaction(res, before);
    expect(res.repository.definitions['blk-motor']).toMatchObject({ name: 'BLDCMotor' });
    expect(res.store?.definitions.get('blk-motor')).toMatchObject({ name: 'BLDCMotor' });
  });

  it('moveElements commits a valid move as one transaction with no error diagnostics', () => {
    let state = createSysmlGatewayState();
    state = advance(state, executeSysmlCommand(state, {
      type: 'createElement',
      element: { id: 'pkg-target', kind: 'package', name: 'Target', namespace: ['model'], ownerId: 'model' },
    }));
    state = advance(state, executeSysmlCommand(state, { type: 'createElement', element: block('blk-motor', 'Motor') }));
    const before = snapshot(state);
    const res = executeSysmlCommand(state, {
      type: 'moveElements', elementIds: ['blk-motor'], targetOwnerId: 'pkg-target',
    });

    expectSingleTransaction(res, before);
    expect(res.repository.definitions['blk-motor']).toMatchObject({ ownerId: 'pkg-target' });
    expect(res.store?.definitions.get('blk-motor')).toMatchObject({ ownerId: 'pkg-target' });
  });

  it('createDiagram commits a valid diagram as one transaction with no error diagnostics', () => {
    const state = createSysmlGatewayState();
    const before = snapshot(state);
    const res = executeSysmlCommand(state, {
      type: 'createDiagram',
      diagram: { id: 'diag-bdd', kind: 'diagram', diagramKind: 'bdd', name: 'BDD', namespace: ['model'], ownerId: 'model' },
    });

    expectSingleTransaction(res, before);
    expect(res.repository.diagrams['diag-bdd']).toBeDefined();
    expect(res.store?.diagrams.has('diag-bdd')).toBe(true);
  });

  it('rejects a duplicate diagram ID without changing repository or presentation state', () => {
    let state = createSysmlGatewayState();
    state = advance(state, executeSysmlCommand(state, {
      type: 'createDiagram',
      diagram: { id: 'diag-owned', kind: 'diagram', diagramKind: 'bdd', name: 'Owned BDD', namespace: ['model'], ownerId: 'model' },
    }));
    const existingDiagram = state.repository.diagrams['diag-owned'];
    const before = snapshot(state);
    const result = executeSysmlCommand(state, { type: 'createDiagram', diagram: existingDiagram });
    expect(result.committed).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_ELEMENT_ID' }),
    ]));
    expect(snapshot(state)).toEqual(before);
    expectNoMutation(result, state, before);
    expect(result.repository.diagrams['diag-owned']).toMatchObject({ name: 'Owned BDD' });
    expect(result.diagramPresentations['diag-owned']).toEqual(state.diagramPresentations?.['diag-owned']);
  });
});

describe('sysmlCommandGateway Task 1 red phase: BDD/package semantic contracts', () => {
  // Task 1 step 3 — test-local inventory (no metamodel change): relationship
  // kinds in the existing metamodel (SysmlRelationship['kind'] in
  // src/engine/sysml/model.ts) mapped to Package Diagram tool support.
  // Sources: model.ts kinds, capabilities/packagePolicy.ts validators
  // (packageImport / elementImport / packageMerge), policy.ts
  // classifyRelationship (dependency with a package endpoint renders on the
  // package diagram; Generalization between compatible classifiers is a
  // supported legal package connection per the design spec), and the gateway
  // addToDiagram endpoint preflight. Association is BDD-scoped here: it must
  // NOT be silently coerced into a dependency on a Package Diagram.
  // OMG_SYSML_1_6 / UML_FOUNDATION govern endpoint semantics; ADIA_EXTENSION
  // governs which tools are offered per diagram.
  const PACKAGE_DIAGRAM_CONNECTION_INVENTORY = [
    { kind: 'generalization', createTool: 'Package Diagram Generalization tool', display: true },
    { kind: 'packageImport', createTool: 'Package Diagram Import/Access tool (public=«import», private=«access»)', display: true },
    { kind: 'elementImport', createTool: 'Package Diagram Element Import tool', display: true },
    { kind: 'packageMerge', createTool: 'Package Diagram Merge tool', display: true },
    { kind: 'dependency', createTool: 'Package Diagram Dependency tool (package endpoints)', display: true },
  ] as const;

  const pkg = (id: string, ownerId = 'model'): PackageDefinition => ({
    id, kind: 'package', name: id, namespace: [], ownerId,
  });
  const block = (id: string, ownerId = 'model'): BlockDefinition => ({
    id, name: id, kind: 'block', namespace: [], ownerId,
    isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
  });
  const semanticIds = (repository: ReturnType<typeof createEmptyRepository>): string[] => [
    ...Object.keys(repository.packages),
    ...Object.keys(repository.diagrams),
    ...Object.keys(repository.definitions),
    ...Object.keys(repository.usages),
    ...Object.keys(repository.connectors),
    ...Object.keys(repository.relationships),
    ...Object.keys(repository.requirements),
    ...Object.keys(repository.verificationCases),
  ].sort();

  it('TASK1-C: Show Contents is presentation-only and only the explicit move command may change package ownership', () => {
    const repository = createEmptyRepository();
    repository.packages['pkg-parent'] = pkg('pkg-parent');
    repository.packages['pkg-child'] = pkg('pkg-child', 'pkg-parent');
    repository.packages['pkg-other'] = pkg('pkg-other');
    repository.definitions['blk-direct'] = block('blk-direct', 'pkg-parent');
    repository.diagrams['diag-packages'] = {
      id: 'diag-packages', kind: 'diagram', diagramKind: 'package', name: 'Packages', namespace: [], ownerId: 'model',
    };
    const state = createSysmlGatewayState(repository);
    const revisionBefore = state.repository.revision;
    const auditBefore = state.repository.auditTrail.length;
    const semanticIdsBefore = semanticIds(state.repository);

    const shown = executeSysmlCommand(state, {
      type: 'showPackageContents', diagramId: 'diag-packages', packageId: 'pkg-parent', mode: 'recursive',
    });
    expect(shown.committed).toBe(true);
    // Presentation only: ownerId of every shown member unchanged.
    expect(shown.repository.packages['pkg-child'].ownerId).toBe('pkg-parent');
    expect(shown.repository.definitions['blk-direct'].ownerId).toBe('pkg-parent');
    // No semantic element created or removed, no revision/audit churn.
    expect(semanticIds(shown.repository)).toEqual(semanticIdsBefore);
    expect(shown.repository.revision).toBe(revisionBefore);
    expect(shown.repository.auditTrail).toHaveLength(auditBefore);
    expect(shown.diagramPresentations['diag-packages'].elementIds)
      .toEqual(expect.arrayContaining(['pkg-child', 'blk-direct']));
    // Single undo restores the presentation while semantics stay put.
    const undone = executeSysmlCommand(shown, { type: 'undo' });
    expect(undone.diagramPresentations['diag-packages']?.elementIds ?? []).toEqual([]);
    expect(undone.repository.definitions['blk-direct'].ownerId).toBe('pkg-parent');

    // Positive control: the explicit move command IS an ownership change.
    const moved = executeSysmlCommand(shown, {
      type: 'moveElements', elementIds: ['blk-direct'], targetOwnerId: 'pkg-other',
    });
    expect(moved.committed).toBe(true);
    expect(moved.repository.definitions['blk-direct'].ownerId).toBe('pkg-other');

    // RED (missing behavior): a generic updateElement ownerId patch must NOT
    // silently reparent — the explicit Move-to-Package command remains the
    // only ownership change (design spec § Package Diagram hierarchy).
    const fresh = createSysmlGatewayState(repository);
    const sneaky = executeSysmlCommand(fresh, {
      type: 'updateElement', elementId: 'blk-direct', patch: { ownerId: 'pkg-other' },
    });
    expect(sneaky.committed).toBe(false);
    expect(sneaky.diagnostics.map(d => d.code))
      .toContain('OWNERSHIP_CHANGE_REQUIRES_MOVE');
    expect(sneaky.repository.definitions['blk-direct'].ownerId).toBe('pkg-parent');
  });

  it('TASK1-D: every inventoried Package Diagram connection kind creates and presents by canonical ID', () => {
    const repository = createEmptyRepository();
    repository.packages.consumer = pkg('consumer');
    repository.packages.types = pkg('types');
    repository.definitions.base = block('base', 'types');
    repository.definitions.sub = block('sub', 'consumer');
    repository.definitions.standalone = block('standalone', 'types');
    repository.diagrams['diag-packages'] = {
      id: 'diag-packages', kind: 'diagram', diagramKind: 'package', name: 'Packages', namespace: [], ownerId: 'model',
    };
    let state = createSysmlGatewayState(repository);
    state = {
      ...state,
      ...executeSysmlCommand(state, {
        type: 'addToDiagram', diagramId: 'diag-packages',
        elementIds: ['consumer', 'types', 'base', 'sub', 'standalone'],
      }),
    };

    const candidates: SysmlRelationship[] = [
      { id: 'rel-gen', kind: 'generalization', sourceId: 'sub', targetId: 'base' },
      {
        id: 'rel-import', kind: 'packageImport', sourceId: 'consumer', targetId: 'types',
        importingNamespaceId: 'consumer', importedPackageId: 'types', visibility: 'public',
      },
      {
        id: 'rel-access', kind: 'packageImport', sourceId: 'types', targetId: 'consumer',
        importingNamespaceId: 'types', importedPackageId: 'consumer', visibility: 'private',
      },
      {
        id: 'rel-elem-import', kind: 'elementImport', sourceId: 'consumer', targetId: 'standalone',
        importingNamespaceId: 'consumer', importedElementId: 'standalone', visibility: 'public',
      },
      {
        id: 'rel-merge', kind: 'packageMerge', sourceId: 'consumer', targetId: 'types',
        mergingPackageId: 'consumer', mergedPackageId: 'types',
      },
      { id: 'rel-dep', kind: 'dependency', sourceId: 'consumer', targetId: 'types' },
    ];
    expect(candidates.map(c => c.kind).sort()).toEqual(
      [...PACKAGE_DIAGRAM_CONNECTION_INVENTORY.map(row => row.kind), 'packageImport'].sort(),
    );

    for (const candidate of candidates) {
      const created = executeSysmlCommand(state, { type: 'createElement', element: candidate });
      expect({ kind: candidate.kind, committed: created.committed }).toEqual({ kind: candidate.kind, committed: true });
      state = { ...state, repository: created.repository, history: created.history, store: created.store, patchHistory: created.patchHistory };
      const presented = executeSysmlCommand(state, {
        type: 'addToDiagram', diagramId: 'diag-packages', elementIds: [candidate.id],
      });
      // RED for generalization today: INVALID_DIAGRAM_ELEMENT — the gateway
      // allowlist omits it although the policy/spec list it as supported.
      expect({ kind: candidate.kind, committed: presented.committed })
        .toEqual({ kind: candidate.kind, committed: true });
      state = { ...state, diagramPresentations: presented.diagramPresentations, store: presented.store, patchHistory: presented.patchHistory };
      expect(state.repository.relationships[candidate.id]).toMatchObject({
        id: candidate.id, sourceId: candidate.sourceId, targetId: candidate.targetId,
      });
      expect(presented.diagramPresentations['diag-packages'].elementIds).toContain(candidate.id);
    }

    // No silent coercion: an unsupported Package Diagram connection is
    // rejected with a diagnostic instead of being stored as another kind.
    const legalCheck = executeSysmlCommand(state, {
      type: 'createElement',
      element: { id: 'rel-coerced', kind: 'requirementContainment', sourceId: 'consumer', targetId: 'types' },
    });
    expect(legalCheck.committed).toBe(false);
    expect(state.repository.relationships['rel-coerced']).toBeUndefined();
  });

  it('dispatches a valid relationship update and checks repository; rejects invalid multiplicity/constraint atomically', () => {
    const repository = createEmptyRepository();
    const blockA: BlockDefinition = {
      id: 'blk-a', name: 'BlockA', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const blockB: BlockDefinition = {
      id: 'blk-b', name: 'BlockB', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions['blk-a'] = blockA;
    repository.definitions['blk-b'] = blockB;

    const initialRel: SysmlRelationship = {
      id: 'rel-composition-1',
      kind: 'composition',
      sourceId: 'blk-a',
      targetId: 'blk-b',
      sourceRole: 'whole',
      targetRole: 'part',
      sourceMultiplicity: { lower: 0, upper: 1, ordered: false, unique: true },
      targetMultiplicity: { lower: 1, upper: '*', ordered: false, unique: true },
    };
    repository.relationships['rel-composition-1'] = initialRel;

    const state = createSysmlGatewayState(repository);

    // 1. Valid update: change role name and multiplicity to 0..4
    const validResult = executeSysmlCommand(state, {
      type: 'updateElement',
      elementId: 'rel-composition-1',
      patch: {
        sourceRole: 'car',
        targetRole: 'wheel',
        targetMultiplicity: { lower: 0, upper: 4, ordered: false, unique: true },
      },
    });

    expect(validResult.committed).toBe(true);
    expect(validResult.repository.relationships['rel-composition-1']).toMatchObject({
      sourceRole: 'car',
      targetRole: 'wheel',
      targetMultiplicity: { lower: 0, upper: 4, ordered: false, unique: true },
    });

    // 2. Invalid update: composition composite end upper multiplicity > 1
    const invalidResult = executeSysmlCommand(validResult, {
      type: 'updateElement',
      elementId: 'rel-composition-1',
      patch: {
        sourceMultiplicity: { lower: 2, upper: 5, ordered: false, unique: true },
      },
    });

    expect(invalidResult.committed).toBe(false);
    expect(invalidResult.diagnostics.some(d => d.code === 'INVALID_MULTIPLICITY')).toBe(true);
    // Repository remains unchanged from before the invalid command
    expect(invalidResult.repository.relationships['rel-composition-1']).toEqual(
      validResult.repository.relationships['rel-composition-1']
    );
  });

  it('rejects relationship role names that collide with Block properties atomically', () => {
    const repository = createEmptyRepository();
    const blockA: BlockDefinition = {
      id: 'blk-role-a', name: 'BlockA', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false,
      properties: [{ id: 'property-existing', name: 'existingRole', kind: 'value', typeId: 'real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } }],
      ports: [], operations: [], constraints: [],
    };
    const blockB: BlockDefinition = {
      id: 'blk-role-b', name: 'BlockB', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions[blockA.id] = blockA;
    repository.definitions[blockB.id] = blockB;
    repository.relationships['rel-role'] = {
      id: 'rel-role', kind: 'association', sourceId: blockA.id, targetId: blockB.id, sourceRole: 'safeRole',
    };

    const state = createSysmlGatewayState(repository);
    const result = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'rel-role', patch: { sourceRole: 'existingRole' },
    });

    expect(result.committed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_ROLE_NAME')).toBe(true);
    expect(result.repository.relationships['rel-role'].sourceRole).toBe('safeRole');
  });

  it('rejects relationships with both ends non-navigable atomically', () => {
    const repository = createEmptyRepository();
    const block = (id: string): BlockDefinition => ({
      id, name: id, kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    });
    repository.definitions.a = block('a');
    repository.definitions.b = block('b');
    repository.relationships['rel-nav'] = {
      id: 'rel-nav', kind: 'association', sourceId: 'a', targetId: 'b',
      sourceNavigable: true, targetNavigable: true,
    };

    const state = createSysmlGatewayState(repository);
    const result = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'rel-nav',
      patch: { sourceNavigable: false, targetNavigable: false },
    });

    expect(result.committed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'NON_NAVIGABLE_ENDS')).toBe(true);
    expect(result.repository.relationships['rel-nav']).toMatchObject({ sourceNavigable: true, targetNavigable: true });
  });
});
