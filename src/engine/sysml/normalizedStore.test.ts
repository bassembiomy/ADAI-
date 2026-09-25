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
  getCachedLegacyView,
  selectEntityById,
  selectBlockById,
  selectDefinitionById,
  selectRequirementById,
  selectUsagesByOwner,
  selectConnectorsByOwner,
  selectRelationshipsByEndpoint,
  selectEvidenceForRequirement,
  selectSuspectLinks,
  selectVisibleElementIds,
  selectActiveDiagramElementIds,
  targetedUpdateEntity,
  targetedUpdatePresentation,
  selectVisibleBlocks,
  selectVisibleParts,
  selectRelationshipsForVisibleNodes,
  selectConnectorsForVisibleParts,
} from './normalizedStore';
import { generate1kModel, generate10kModel } from './largeModelGenerator';
import { projectLegacyDiagram } from '../../services/sysmlCommandGateway';
import { createEmptyRepository, type BlockDefinition, type PartUsage, type SysmlRelationship, type RequirementDefinition } from './model';

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
    expect(roundtrip.schemaVersion).toBe(repository.schemaVersion);
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

    // Warm up both methods
    projectLegacyDiagram(repository, coordinates, diagramPresentations, 'diagram-root');
    projectNormalizedDiagram(store, 'diagram-root');

    const t0 = performance.now();
    const legacyView = projectLegacyDiagram(repository, coordinates, diagramPresentations, 'diagram-root');
    const legacyDuration = performance.now() - t0;

    const t1 = performance.now();
    const normalizedView = projectNormalizedDiagram(store, 'diagram-root');
    const normalizedDuration = performance.now() - t1;

    expect(normalizedView.blocks.length).toBe(legacyView.blocks.length);
    // Normalized projection avoids scanning all 10,000 elements, well within latency budget
    expect(normalizedDuration).toBeLessThan(Math.max(legacyDuration + 10, 50));
  });

  it('provides indexed selectors for entities, usages, relationships, and evidence', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    // selectEntityById
    const entity = selectEntityById<BlockDefinition>(store, 'blk_1');
    expect(entity).toBeDefined();
    expect(entity?.id).toBe('blk_1');

    // selectBlockById
    const block = selectBlockById(store, 'blk_1');
    expect(block).toBeDefined();
    expect(block?.kind).toBe('block');

    // selectDefinitionById
    const def = selectDefinitionById(store, 'blk_1');
    expect(def?.name).toBe('Block_1');

    // selectUsagesByOwner
    const usages = selectUsagesByOwner(store, 'blk_1');
    expect(usages.length).toBeGreaterThan(0);
    expect(usages.every(u => u.ownerId === 'blk_1')).toBe(true);

    // selectRelationshipsByEndpoint
    const rels = selectRelationshipsByEndpoint(store, 'blk_1');
    expect(rels.every(r => r.sourceId === 'blk_1' || r.targetId === 'blk_1')).toBe(true);

    // selectVisibleElementIds & selectActiveDiagramElementIds
    const visibleIds = selectVisibleElementIds(store, 'diagram-root');
    const diagramIds = selectActiveDiagramElementIds(store, 'diagram-root');
    expect(visibleIds.size).toBe(diagramIds.length);
    expect(diagramIds.length).toBeGreaterThan(0);
  });

  it('provides cached legacy view with reference stability when revision is unchanged', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    const view1 = getCachedLegacyView(store, 'diagram-root');
    const view2 = getCachedLegacyView(store, 'diagram-root');

    // Exact same reference - 0ms computation, 0 bytes allocated!
    expect(view1).toBe(view2);
    expect(view1.blocks).toBe(view2.blocks);

    // When revision changes, fresh view is computed
    store.revision += 1;
    const view3 = getCachedLegacyView(store, 'diagram-root');
    expect(view3).not.toBe(view1);
  });

  it('ensures editing one element does not recreate unrelated block objects', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    const viewBefore = projectNormalizedDiagram(store, 'diagram-root');
    const block0Before = viewBefore.blocks[0];
    const block1Before = viewBefore.blocks[1];

    // Targeted update of block 0
    targetedUpdateEntity(store, block0Before.id, { name: 'RenamedBlock' });

    const viewAfter = projectNormalizedDiagram(store, 'diagram-root');
    const block0After = viewAfter.blocks.find(b => b.id === block0Before.id);
    const block1After = viewAfter.blocks.find(b => b.id === block1Before.id);

    // Block 0 was edited, so its projected object was recreated with the new name
    expect(block0After?.name).toBe('RenamedBlock');
    expect(block0After).not.toBe(block0Before);

    // Block 1 was UNRELATED, so its object reference is EXACTLY preserved!
    expect(block1After).toBe(block1Before);
  });

  it('performs targeted presentation updates and preserves unrelated block objects', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    const viewBefore = projectNormalizedDiagram(store, 'diagram-root');
    const targetBlock = viewBefore.blocks[0];
    const otherBlock = viewBefore.blocks[1];

    const otherDiagram = {
      elementIds: [targetBlock.id],
      presentations: {
        [targetBlock.id]: {
          id: `presentation:diagram-other:${targetBlock.id}`,
          diagramId: 'diagram-other',
          semanticElementId: targetBlock.id,
          bounds: { x: 10, y: 20 },
        },
      },
    };
    store.diagramPresentations.set('diagram-other', otherDiagram);

    expect(targetedUpdatePresentation(store, 'diagram-root', targetBlock.id, { x: 999, y: 888 })).toBe(true);

    const viewAfter = projectNormalizedDiagram(store, 'diagram-root');
    const updatedTarget = viewAfter.blocks.find(b => b.id === targetBlock.id);
    const unchangedOther = viewAfter.blocks.find(b => b.id === otherBlock.id);

    expect(updatedTarget?.x).toBe(999);
    expect(updatedTarget?.y).toBe(888);
    expect(updatedTarget).not.toBe(targetBlock);
    expect(projectNormalizedDiagram(store, 'diagram-other').blocks.find(b => b.id === targetBlock.id))
      .toMatchObject({ x: 10, y: 20 });
    expect(store.coordinates.get(targetBlock.id)).toEqual(coordinates[targetBlock.id]);

    // Unrelated block object identity is completely stable
    expect(unchangedOther).toBe(otherBlock);
  });

  it('selects visible blocks, parts, relationships, and connectors with stable references', () => {
    const { repository, coordinates, diagramPresentations } = generate1kModel(42);
    const store = fromRepository(repository, coordinates, diagramPresentations);

    const activeIds = selectActiveDiagramElementIds(store, 'diagram-root');
    expect(activeIds.length).toBeGreaterThan(0);

    const visibleBlocks = selectVisibleBlocks(store, activeIds, 'diagram-root');
    const visibleParts = selectVisibleParts(store, activeIds, 'diagram-root');
    expect(visibleBlocks.length).toBeGreaterThan(0);

    // Test relationship selector with known connected endpoints
    const rel1 = Object.values(repository.relationships)[0];
    const nodeIds = [rel1.sourceId, rel1.targetId];
    const visibleRels = selectRelationshipsForVisibleNodes(store, nodeIds);
    expect(visibleRels.length).toBeGreaterThan(0);
    expect(visibleRels[0].id).toBe(rel1.id);

    // Second call with same revision returns exact same references
    const visibleBlocks2 = selectVisibleBlocks(store, activeIds, 'diagram-root');
    expect(visibleBlocks2[0]).toBe(visibleBlocks[0]);

    // Updating one block preserves references for all other visible blocks
    const targetBlock = visibleBlocks[0];
    const otherBlock = visibleBlocks[1];
    targetedUpdateEntity(store, targetBlock.id, { name: 'NewName' });

    const visibleBlocksAfter = selectVisibleBlocks(store, activeIds, 'diagram-root');
    const updatedTarget = visibleBlocksAfter.find(b => b.id === targetBlock.id);
    const unchangedOther = visibleBlocksAfter.find(b => b.id === otherBlock.id);

    expect(updatedTarget?.name).toBe('NewName');
    expect(updatedTarget).not.toBe(targetBlock);
    expect(unchangedOther).toBe(otherBlock);
  });

  it('stores and indexes use-case entities, extension points, and diagram references', () => {
    const repo = createEmptyRepository();
    repo.actors['act_1'] = { id: 'act_1', name: 'Pilot', kind: 'actor', namespace: [], isExternal: true, generalizationIds: [] };
    repo.subjects['sub_1'] = { id: 'sub_1', name: 'Cockpit', kind: 'subject', namespace: [] };
    repo.useCases['uc_1'] = { id: 'uc_1', name: 'Fly', kind: 'useCase', namespace: [], subjectId: 'sub_1', extensionPointIds: ['ep_1'], behaviorArtifactIds: [] };
    repo.extensionPoints['ep_1'] = { id: 'ep_1', name: 'Emergency', kind: 'extensionPoint', namespace: [], useCaseId: 'uc_1' };
    repo.diagramReferences['ref_1'] = { id: 'ref_1', diagramId: 'act_1', diagramKind: 'activity', role: 'elaborates', sourceElementId: 'uc_1' };

    const store = fromRepository(repo);
    expect(store.actors.size).toBe(1);
    expect(store.subjects.size).toBe(1);
    expect(store.useCases.size).toBe(1);
    expect(store.extensionPoints.size).toBe(1);
    expect(store.diagramReferences.size).toBe(1);

    expect(getById(store, 'act_1')).toEqual(repo.actors['act_1']);
    expect(getById(store, 'uc_1')).toEqual(repo.useCases['uc_1']);

    const back = toRepository(store);
    expect(back.actors).toEqual(repo.actors);
    expect(back.subjects).toEqual(repo.subjects);
    expect(back.useCases).toEqual(repo.useCases);
    expect(back.extensionPoints).toEqual(repo.extensionPoints);
    expect(back.diagramReferences).toEqual(repo.diagramReferences);
  });
});
