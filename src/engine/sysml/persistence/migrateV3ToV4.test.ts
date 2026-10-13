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

  it('preserves non-block definitions, usages, and exact diagram metadata for the inspector', () => {
    const v3: SysmlRepository = createEmptyRepository();
    v3.definitions['if-control'] = {
      id: 'if-control', name: 'ControlIF', kind: 'interface', namespace: ['model'], ownerId: 'model', features: [],
    };
    v3.definitions['voltage'] = {
      id: 'voltage', name: 'Voltage', kind: 'valueType', namespace: ['model'], ownerId: 'model', unit: 'V', quantityKind: 'electricPotential',
    } as any;
    v3.definitions['controller'] = {
      id: 'controller', name: 'Controller', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    v3.usages['controller-port'] = {
      id: 'controller-port', name: 'control', kind: 'port', ownerId: 'controller', definitionId: 'if-control',
    } as any;
    v3.diagrams['pkg-structure'] = {
      id: 'pkg-structure', name: 'Package Structure', kind: 'diagram', diagramKind: 'package',
      namespace: ['model'], ownerId: 'model', contextElementId: 'model',
    };

    const v4 = migrateV3ToV4(v3);

    expect(v4.elements['if-control']).toMatchObject({ metaclass: 'InterfaceBlock', ownerId: 'pkg-root' });
    expect(v4.elements['voltage']).toMatchObject({ metaclass: 'ValueType', unit: 'V' });
    expect(v4.elements['controller-port']).toMatchObject({ metaclass: 'Port', ownerId: 'controller', typeId: 'if-control' });
    expect(v4.diagrams['pkg-structure']).toMatchObject({
      id: 'pkg-structure', name: 'Package Structure', diagramKind: 'package', contextElementId: 'pkg-root',
    });
    expect(v4.indexes.byOwner['controller']).toContain('controller-port');
    expect(v4.indexes.byType['InterfaceBlock']).toContain('if-control');
  });

  it('handles wide-owner models (10,000 siblings) linearly with exact child ordering and deduplication', () => {
    const v3: SysmlRepository = createEmptyRepository();
    const parentBlockId = 'wide-parent';
    v3.definitions[parentBlockId] = {
      id: parentBlockId, name: 'WideParent', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };

    const count = 10_000;
    for (let i = 0; i < count; i++) {
      v3.usages[`prop-${i}`] = {
        id: `prop-${i}`, name: `prop_${i}`, kind: 'part', ownerId: parentBlockId,
      } as any;
    }

    const t0 = performance.now();
    const v4 = migrateV3ToV4(v3);
    const duration = performance.now() - t0;

    const owned = v4.indexes.byOwner[parentBlockId];
    expect(owned).toBeDefined();
    expect(owned.length).toBe(count);
    expect(owned[0]).toBe('prop-0');
    expect(owned[count - 1]).toBe(`prop-${count - 1}`);

    // Linear scaling budget: 10,000 siblings should comfortably index in < 150ms (quadratic takes > 1000ms)
    expect(duration).toBeLessThan(250);
  });
});
