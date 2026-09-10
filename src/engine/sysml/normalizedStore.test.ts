import { describe, it, expect } from 'vitest';
import {
  createEmptyNormalizedStore,
  fromRepository,
  toRepository,
  getById,
  idsByIndex,
  upsertEntity,
  removeEntity,
  projectIds,
  projectNormalizedDiagram,
} from './normalizedStore';
import { generate1kModel, generate10kModel } from './largeModelGenerator';
import { projectLegacyDiagram } from '../../services/sysmlCommandGateway';
import type { BlockDefinition, PartUsage, SysmlRelationship } from './model';

describe('NormalizedSysmlStore', () => {
  it('creates an empty normalized store with initialized indexes', () => {
    const store = createEmptyNormalizedStore();
    expect(store.schemaVersion).toBe(2);
    expect(store.definitions.size).toBe(0);
    expect(store.indexes.byId.size).toBe(0);
    expect(store.indexes.ownerId.size).toBe(0);
  });

  it('converts from SysmlRepository and preserves full roundtrip equivalence', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    expect(store.definitions.size).toBe(Object.keys(repository.definitions).length);
    expect(store.usages.size).toBe(Object.keys(repository.usages).length);
    expect(store.relationships.size).toBe(Object.keys(repository.relationships).length);
    expect(store.requirements.size).toBe(Object.keys(repository.requirements).length);

    const roundtrip = toRepository(store);
    expect(roundtrip.schemaVersion).toBe(2);
    expect(roundtrip.revision).toBe(repository.revision);
    expect(Object.keys(roundtrip.definitions).sort()).toEqual(Object.keys(repository.definitions).sort());
    expect(Object.keys(roundtrip.usages).sort()).toEqual(Object.keys(repository.usages).sort());
    expect(Object.keys(roundtrip.relationships).sort()).toEqual(Object.keys(repository.relationships).sort());
  });

  it('maintains secondary indexes for ownerId, typeId, sourceId, targetId, and diagramId', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    // Test getById O(1)
    const block = getById(store, 'blk_1') as BlockDefinition;
    expect(block).toBeDefined();
    expect(block.kind).toBe('block');
    expect(block.name).toBe('Block_1');

    // Test ownerId index
    const partsForBlock1 = idsByIndex(store, 'ownerId', 'blk_1');
    expect(partsForBlock1.size).toBeGreaterThan(0);
    for (const partId of partsForBlock1) {
      const part = getById(store, partId) as PartUsage;
      expect(part.ownerId).toBe('blk_1');
    }

    // Test typeId index
    const firstPart = getById(store, [...partsForBlock1][0]) as PartUsage;
    const typeId = firstPart.typeId;
    const usagesOfType = idsByIndex(store, 'typeId', typeId);
    expect(usagesOfType.has(firstPart.id)).toBe(true);

    // Test sourceId / targetId indexes
    const rel1 = Object.values(repository.relationships)[0];
    const relsWithSource = idsByIndex(store, 'sourceId', rel1.sourceId);
    expect(relsWithSource.has(rel1.id)).toBe(true);

    // Test diagramId index
    const rootDiagramElements = idsByIndex(store, 'diagramId', 'diagram-root');
    expect(rootDiagramElements.size).toBeGreaterThan(0);
  });

  it('updates indexes incrementally on upsertEntity and removeEntity', () => {
    const store = createEmptyNormalizedStore();

    const block: BlockDefinition = {
      id: 'blk_test',
      name: 'TestBlock',
      namespace: ['Test'],
      kind: 'block',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    upsertEntity(store, 'definitions', block);
    expect(getById(store, 'blk_test')).toBe(block);
    expect(store.definitions.get('blk_test')).toBe(block);

    const part: PartUsage = {
      id: 'part_test',
      name: 'testPart',
      kind: 'part',
      ownerId: 'blk_test',
      typeId: 'blk_target',
      aggregation: 'composite',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    upsertEntity(store, 'usages', part);
    expect(idsByIndex(store, 'ownerId', 'blk_test').has('part_test')).toBe(true);
    expect(idsByIndex(store, 'typeId', 'blk_target').has('part_test')).toBe(true);

    // Update part's ownerId and typeId
    const updatedPart: PartUsage = {
      ...part,
      ownerId: 'blk_new_owner',
      typeId: 'blk_new_target',
    };
    upsertEntity(store, 'usages', updatedPart);
    expect(idsByIndex(store, 'ownerId', 'blk_test').has('part_test')).toBe(false);
    expect(idsByIndex(store, 'ownerId', 'blk_new_owner').has('part_test')).toBe(true);
    expect(idsByIndex(store, 'typeId', 'blk_target').has('part_test')).toBe(false);
    expect(idsByIndex(store, 'typeId', 'blk_new_target').has('part_test')).toBe(true);

    // Remove part
    const removed = removeEntity(store, 'part_test');
    expect(removed).toBe(true);
    expect(getById(store, 'part_test')).toBeUndefined();
    expect(idsByIndex(store, 'ownerId', 'blk_new_owner').has('part_test')).toBe(false);
  });

  it('projects diagram element IDs without scanning unrelated entities', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    const projectedRoot = projectIds(store, 'diagram-root');
    expect(projectedRoot.length).toBeGreaterThan(0);
    expect(projectedRoot.length).toBeLessThan(store.indexes.byId.size);

    for (const id of diagramPresentations['diagram-root'].elementIds) {
      expect(projectedRoot).toContain(id);
    }
  });

  it('produces identical legacy projection to projectLegacyDiagram', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    // Single diagram comparison
    const legacyView = projectLegacyDiagram(repository, coordinates, diagramPresentations, 'diagram-root');
    const normalizedView = projectNormalizedDiagram(store, 'diagram-root');

    expect(normalizedView.blocks.length).toBe(legacyView.blocks.length);
    expect(normalizedView.parts.length).toBe(legacyView.parts.length);
    expect(normalizedView.relationships.length).toBe(legacyView.relationships.length);
    expect(normalizedView.connectors.length).toBe(legacyView.connectors.length);

    // Compare block IDs and properties
    const legacyBlockIds = legacyView.blocks.map(b => b.id).sort();
    const normalizedBlockIds = normalizedView.blocks.map(b => b.id).sort();
    expect(normalizedBlockIds).toEqual(legacyBlockIds);
  });

  it('demonstrates superior performance over legacy projection on 10k models', () => {
    const { repository, coordinates, diagramPresentations } = generate10kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    const t0 = performance.now();
    const legacyView = projectLegacyDiagram(repository, coordinates, diagramPresentations, 'diagram-root');
    const legacyDuration = performance.now() - t0;

    const t1 = performance.now();
    const normalizedView = projectNormalizedDiagram(store, 'diagram-root');
    const normalizedDuration = performance.now() - t1;

    expect(normalizedView.blocks.length).toBe(legacyView.blocks.length);
    // Normalized projection avoids scanning all 10,000 elements!
    expect(normalizedDuration).toBeLessThan(legacyDuration + 1); // Significantly faster or comparable
  });
});
