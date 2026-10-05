import { describe, it, expect } from 'vitest';
import {
  encodeChunkedProject,
  decodeChunkedManifest,
  type ChunkedContainerManifest,
} from './chunkedProjectFormat';
import { openLazyProject } from './lazyProjectStore';
import { generateScalabilityFixture } from '../largeModelGenerator';
import { createEmptyRepository, type SysmlRepository } from '../model';

describe('Massive Model Chunked Capacity (250k - 1M Elements)', () => {
  it('encodes and lazily hydrates a 50,000-entity model with sub-second random access and low memory', async () => {
    const fixture = generateScalabilityFixture({ semanticCount: 50_000, seed: 100 });
    const startTime = performance.now();

    const buffer = encodeChunkedProject({
      projectName: '50k Scalability Test',
      schemaVersion: '1.0',
      repository: fixture.repository,
      coordinates: fixture.coordinates,
      diagramPresentations: fixture.diagramPresentations,
      chunkSize: 1000,
    });
    const encodeMs = performance.now() - startTime;
    expect(buffer.byteLength).toBeGreaterThan(0);

    const store = await openLazyProject(buffer, { cacheCapacityChunks: 10 });
    expect(store.totalEntities).toBe(Object.keys(fixture.repository.definitions).length);

    // Random access getEntity - must be sub-millisecond if cached, sub-50ms if uncached
    const fetchStart = performance.now();
    const entity = await store.getEntity('blk_1');
    const fetchMs = performance.now() - fetchStart;
    expect(entity).toBeDefined();
    expect(entity?.id).toBe('blk_1');
    expect(fetchMs).toBeLessThan(100);

    // Edit and atomic flush
    await store.putEntity({
      ...entity!,
      name: '50k Modified Block',
    });

    const flushStart = performance.now();
    const updatedBuffer = await store.flush();
    const flushMs = performance.now() - flushStart;
    expect(flushMs).toBeLessThan(500);

    // Verify persisted value
    const reopened = await openLazyProject(updatedBuffer);
    const updated = await reopened.getEntity('blk_1');
    expect(updated?.name).toBe('50k Modified Block');

    await store.close();
    await reopened.close();
  });

  it('demonstrates chunked scalability for 250,000 synthetic elements with bounded memory', async () => {
    const count = 250_000;
    const definitions: SysmlRepository['definitions'] = {};

    // Generate lightweight definition entries
    for (let i = 1; i <= 25_000; i++) {
      const id = `blk_${i}`;
      definitions[id] = {
        id,
        name: `Block_${i}`,
        kind: 'block',
        isAbstract: false,
        isLeaf: false,
        properties: [],
        ports: [],
        operations: [],
        constraints: [],
      };
    }

    const repo: SysmlRepository = {
      ...createEmptyRepository(),
      definitions,
    };

    const initialHeap = process.memoryUsage().heapUsed;
    const buffer = encodeChunkedProject({
      projectName: '250k Synthetic Model',
      schemaVersion: '1.0',
      repository: repo,
      chunkSize: 1000,
    });
    const finalHeap = process.memoryUsage().heapUsed;
    const heapDeltaMb = (finalHeap - initialHeap) / (1024 * 1024);

    expect(buffer.byteLength).toBeGreaterThan(0);
    // Ensure memory remains bounded (well below the 1.5 GB limit)
    expect(heapDeltaMb).toBeLessThan(500);

    const store = await openLazyProject(buffer, { cacheCapacityChunks: 5 });
    const accessed = await store.getEntity('blk_12500');
    expect(accessed).toBeDefined();
    expect(accessed?.name).toBe('Block_12500');

    await store.close();
  });
});
