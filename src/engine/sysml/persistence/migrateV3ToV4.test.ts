import { describe, expect, it } from 'vitest';
import {
  migrateV3ToV4,
  serializeRepositoryV4,
  deserializeRepositoryV4,
  elementsOfKind,
  presentationsForElement,
} from './migrateV3ToV4';
import { serializeRepository, loadRepository } from '../persistence';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type Block,
  type DiagramPresentation,
} from '../domain';
import { createEmptyRepository, type SysmlRepository } from '../model';

describe('Schema v4 Persistence and Migration (Task 13)', () => {
  it('migrates v3 repository to v4 without losing identity, presentations, or links', () => {
    const v3: SysmlRepository = createEmptyRepository();

    // 1. Add Block definition
    v3.definitions['blk-1'] = {
      id: 'blk-1',
      name: 'Vehicle',
      kind: 'block',
      namespace: [],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [
        {
          id: 'prop-speed',
          name: 'speed',
          kind: 'value',
          typeId: 'vt-float',
          multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
        },
      ],
      ports: [
        {
          id: 'port-can',
          name: 'canPort',
          kind: 'proxy',
          typeId: 'if-can',
          direction: 'inout',
          isConjugated: false,
          multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
        },
      ],
      operations: [],
      constraints: [],
    };

    // 2. Add Requirement
    v3.requirements['req-1'] = {
      id: 'req-1',
      name: 'SafeStopping',
      kind: 'requirement',
      requirementId: 'REQ-001',
      text: 'Must stop safely',
      status: 'approved',
      version: '1.0',
      namespace: [],
      ownerId: 'model',
    };

    // 3. Add VerificationCase
    v3.verificationCases['vc-1'] = {
      id: 'vc-1',
      name: 'BrakeTest',
      kind: 'verificationCase',
      method: 'test',
      verifiesRequirementIds: ['req-1'],
      namespace: [],
      ownerId: 'model',
    };

    // 4. Add Relationship
    v3.relationships['rel-1'] = {
      id: 'rel-1',
      kind: 'satisfy',
      sourceId: 'blk-1',
      targetId: 'req-1',
    };

    const v4 = migrateV3ToV4(v3);

    expect(v4.schemaVersion).toBe(4);
    expect(v4.elements['blk-1']).toBeDefined();
    expect(v4.elements['blk-1'].metaclass).toBe('Block');
    expect(v4.elements['req-1']).toBeDefined();
    expect(v4.elements['req-1'].metaclass).toBe('Requirement');
    // VerificationCase mapped to TestCase
    expect(v4.elements['vc-1']).toBeDefined();
    expect(v4.elements['vc-1'].metaclass).toBe('TestCase');

    // Relationships preserved
    expect(v4.relationships['rel-1']).toBeDefined();
    expect(v4.relationships['rel-1'].metaclass).toBe('Satisfy');
  });

  it('serializes deterministically and round-trips with identical hash and IDs', () => {
    const v3: SysmlRepository = createEmptyRepository();
    v3.definitions['blk-sensor'] = {
      id: 'blk-sensor',
      name: 'RadarSensor',
      kind: 'block',
      namespace: [],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    const v4 = migrateV3ToV4(v3);
    const json1 = serializeRepositoryV4(v4);
    const json2 = serializeRepositoryV4(v4);
    expect(json1).toBe(json2);

    const reloaded = deserializeRepositoryV4(json1);
    expect(reloaded.schemaVersion).toBe(4);
    expect(reloaded.elements['blk-sensor'].name).toBe('RadarSensor');
    expect(reloaded.elements['blk-sensor'].id).toBe('blk-sensor');
  });

  it('round-trips one Block with two presentations without duplication', () => {
    let repository = createEmptyRepositoryV4();
    const motor: Block = {
      id: 'motor',
      name: 'BLDCMotor',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
      isAbstract: false,
      isLeaf: false,
    };
    addSemanticElementV4(repository, motor);

    const pres1: DiagramPresentation = {
      id: 'pres-1',
      diagramId: 'bdd-1',
      semanticElementId: 'motor',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    };
    const pres2: DiagramPresentation = {
      id: 'pres-2',
      diagramId: 'ibd-1',
      semanticElementId: 'motor',
      bounds: { x: 10, y: 10, width: 100, height: 100 },
    };
    repository.presentations['pres-1'] = pres1;
    repository.presentations['pres-2'] = pres2;
    repository.indexes.byDiagram['bdd-1'] = ['pres-1'];
    repository.indexes.byDiagram['ibd-1'] = ['pres-2'];

    const loaded = loadRepository(serializeRepository(repository));
    expect(elementsOfKind(loaded, 'Block')).toHaveLength(1);
    expect(presentationsForElement(loaded, 'motor')).toHaveLength(2);
  });
});
