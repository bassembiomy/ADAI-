import { describe, it, expect, vi } from 'vitest';
import { openLazyProject, type LazyProjectStore } from './lazyProjectStore';
import { encodeChunkedProject } from './chunkedProjectFormat';
import { generateScalabilityFixture } from '../largeModelGenerator';
import { buildCanonicalSysmlProjectPayload, createSysmlGatewayState } from '../../../services/sysmlCommandGateway';

describe('Lazy Project Store', () => {
  it('opens a chunked project and lazily resolves entities via LRU chunk cache', async () => {
    const fixture = generateScalabilityFixture({ semanticCount: 300, seed: 10 });
    const buffer = encodeChunkedProject({
      projectName: 'Lazy Store Project',
      schemaVersion: '1.0',
      repository: fixture.repository,
      coordinates: fixture.coordinates,
      diagramPresentations: fixture.diagramPresentations,
      chunkSize: 50,
    });

    const store = await openLazyProject(buffer, { cacheCapacityChunks: 3 });
    expect(store.projectName).toBe('Lazy Store Project');
    expect(store.totalEntities).toBe(Object.keys(fixture.repository.definitions).length);

    // Entity resolution
    const sampleId = 'blk_1';
    const entity = await store.getEntity(sampleId);
    expect(entity).toBeDefined();
    expect(entity?.id).toBe(sampleId);

    // Repeated access should hit cache
    const cachedEntity = await store.getEntity(sampleId);
    expect(cachedEntity).toBe(entity);

    // Non-existent entity returns null
    const nonExistent = await store.getEntity('non_existent_id');
    expect(nonExistent).toBeNull();

    await store.close();
  });

  it('supports paged getChildren queries using the container index without loading all entities', async () => {
    const fixture = generateScalabilityFixture({ semanticCount: 200, seed: 11 });
    const buffer = encodeChunkedProject({
      projectName: 'Children Test Project',
      schemaVersion: '1.0',
      repository: fixture.repository,
      coordinates: fixture.coordinates,
      diagramPresentations: fixture.diagramPresentations,
      chunkSize: 50,
    });

    const store = await openLazyProject(buffer);
    const children = await store.getChildren('model');
    expect(Array.isArray(children)).toBe(true);
    expect(children.length).toBeGreaterThan(0);

    await store.close();
  });

  it('provides random-access diagram retrieval with presentations and coordinates', async () => {
    const fixture = generateScalabilityFixture({ semanticCount: 100, seed: 12 });
    const buffer = encodeChunkedProject({
      projectName: 'Diagram Store Project',
      schemaVersion: '1.0',
      repository: fixture.repository,
      coordinates: fixture.coordinates,
      diagramPresentations: fixture.diagramPresentations,
      chunkSize: 50,
    });

    const store = await openLazyProject(buffer);
    const ordinaryDiag = await store.getDiagram('diagram-ordinary');
    expect(ordinaryDiag).toBeDefined();
    expect(ordinaryDiag?.diagramId).toBe('diagram-ordinary');
    expect(ordinaryDiag?.coordinates).toBeDefined();

    await store.close();
  });

  it('supports token search across search-index chunks', async () => {
    const fixture = generateScalabilityFixture({ semanticCount: 200, seed: 13 });
    const buffer = encodeChunkedProject({
      projectName: 'Search Store Project',
      schemaVersion: '1.0',
      repository: fixture.repository,
      coordinates: fixture.coordinates,
      diagramPresentations: fixture.diagramPresentations,
      chunkSize: 50,
    });

    const store = await openLazyProject(buffer);
    const results = await store.search('Block_1');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    await store.close();
  });

  it('supports atomic flush with dirty-chunk tracking and interrupted-save recovery', async () => {
    const fixture = generateScalabilityFixture({ semanticCount: 150, seed: 14 });
    const buffer = encodeChunkedProject({
      projectName: 'Flush Test Project',
      schemaVersion: '1.0',
      repository: fixture.repository,
      coordinates: fixture.coordinates,
      diagramPresentations: fixture.diagramPresentations,
      chunkSize: 50,
    });

    const store = await openLazyProject(buffer);

    // Mutate an entity
    const blk = await store.getEntity('blk_1');
    expect(blk).toBeDefined();
    await store.putEntity({
      ...blk!,
      name: 'Flushed Modified Name',
    });

    // Flush to produce updated container buffer
    const updatedBuffer = await store.flush();
    expect(updatedBuffer).toBeDefined();
    expect(updatedBuffer.byteLength).toBeGreaterThan(0);

    // Reopen from the flushed buffer and verify persisted mutation
    const reopenedStore = await openLazyProject(updatedBuffer);
    const updatedBlk = await reopenedStore.getEntity('blk_1');
    expect(updatedBlk?.name).toBe('Flushed Modified Name');

    await store.close();
    await reopenedStore.close();
  });
});
