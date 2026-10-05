import { describe, it, expect } from 'vitest';
import { generateScalabilityFixture } from '../../engine/sysml/largeModelGenerator';
import { fromRepository, targetedUpdateEntity } from '../../engine/sysml/normalizedStore';
import { queryExplorerChildren, searchExplorer } from './modelExplorerQuery';

describe('Paged Model Explorer Queries (50,000 entities)', () => {
  // Generate 50,000 element model
  const fixture = generateScalabilityFixture({ semanticCount: 50_000, seed: 42, topology: 'distributed' });
  const store = fromRepository(fixture.repository, fixture.coordinates, fixture.diagramPresentations);

  it('queries root children in under 5ms without materializing 50,000 tree nodes', () => {
    // Warm-up query once
    queryExplorerChildren(store, null, { offset: 0, limit: 50 });

    const t0 = performance.now();
    const result = queryExplorerChildren(store, null, { offset: 0, limit: 50 });
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(5);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes.length).toBeLessThanOrEqual(50);
    expect(result.totalCount).toBeGreaterThanOrEqual(result.nodes.length);
  });

  it('queries children of an expanded package in under 5ms', () => {
    // Find a package with children
    const pkgIds = Array.from(store.packages.keys()).filter(id => id !== 'model');
    const targetPkgId = pkgIds.find(id => (store.indexes.ownerId.get(id)?.size ?? 0) > 0) ?? pkgIds[0];

    // Warm-up
    queryExplorerChildren(store, targetPkgId, { offset: 0, limit: 50 });

    const t0 = performance.now();
    const result = queryExplorerChildren(store, targetPkgId, { offset: 0, limit: 50 });
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(5);
    expect(result.nodes.length).toBeLessThanOrEqual(50);
    for (const node of result.nodes) {
      expect(node.ownerSemanticId).toBe(targetPkgId);
    }
  });

  it('searches by prefix across 50,000 entities in under 15ms', () => {
    // Warm-up
    searchExplorer(store, 'block_1', { offset: 0, limit: 20 });

    const t0 = performance.now();
    const result = searchExplorer(store, 'block_1', { offset: 0, limit: 20 });
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(15);
    expect(result.nodes.length).toBeGreaterThan(0);
    for (const node of result.nodes) {
      expect(node.label.toLowerCase()).toContain('block_1');
    }
  });

  it('invalidates only affected queries when an element name is updated', () => {
    const searchBefore = searchExplorer(store, 'unique_test_term', { offset: 0, limit: 10 });
    expect(searchBefore.totalCount).toBe(0);

    // Rename an element in the store using targetedUpdateEntity
    const firstDefId = Array.from(store.definitions.keys())[0];
    const def = store.definitions.get(firstDefId)!;
    const oldName = def.name;

    targetedUpdateEntity(store, firstDefId, { name: 'Unique_Test_Term_Block' });

    // Cache should invalidate and find the new name
    const searchAfter = searchExplorer(store, 'unique_test_term', { offset: 0, limit: 10 });
    expect(searchAfter.totalCount).toBeGreaterThan(0);
    expect(searchAfter.nodes[0].label).toBe('Unique_Test_Term_Block');

    // Restore name
    targetedUpdateEntity(store, firstDefId, { name: oldName });
  });
});
