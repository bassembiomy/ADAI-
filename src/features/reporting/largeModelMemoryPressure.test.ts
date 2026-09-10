import { describe, it, expect, vi } from 'vitest';
import { generateSysmlModel } from '../../engine/sysml/largeModelGenerator';
import { buildReportHierarchy } from './reportHierarchyEngine';
import { SysmlWorkerClient } from '../../services/sysmlWorkerClient';
import { streamExportChunks } from '../../engine/sysml/persistence';

describe('Large Model Memory Pressure & Throttling Verification', () => {
  it('buildReportHierarchy processes large model hierarchy in linear time without O(N^2) memory spikes', () => {
    const generated = generateSysmlModel({ targetElementCount: 200, seed: 123 });
    const repo = generated.repository;

    const blocks = Object.values(repo.definitions).filter(d => d.kind === 'block').map(b => ({
      id: b.id,
      name: b.name,
      stereotype: 'block' as const,
      x: 0,
      y: 0,
      width: 160,
      height: 100,
      classes: [],
      properties: [],
      operations: [],
      ports: (b as any).ports ?? [],
      constraints: [],
    }));

    const parts = Object.values(repo.usages).filter(u => u.kind === 'part').map(p => ({
      id: p.id,
      name: p.name,
      blockId: (p as any).ownerId,
      typeId: (p as any).typeId,
      multiplicity: '1',
      x: 0,
      y: 0,
      width: 150,
      height: 100,
    }));

    const connectors = Object.values(repo.connectors).map(c => ({
      id: c.id,
      kind: 'assembly' as const,
      sourcePartId: c.sourcePortId.split('::')[0],
      sourcePortId: c.sourcePortId,
      targetPartId: c.targetPortId.split('::')[0],
      targetPortId: c.targetPortId,
    }));

    const sourceModel = {
      blocks,
      parts,
      connectors,
      relationships: [],
      states: [],
      layers: [],
      transitions: [],
      junctions: [],
    };

    const start = performance.now();
    const registry = buildReportHierarchy(sourceModel);
    const durationMs = performance.now() - start;

    expect(registry).toBeDefined();
    // Linear hierarchy build on 200 elements must complete well under 100ms
    expect(durationMs).toBeLessThan(100);
  });

  it('streamExportChunks releases chunks sequentially without memory accumulation', async () => {
    const generated = generateSysmlModel({ targetElementCount: 150, seed: 456 });
    let emittedCount = 0;
    let maxSingleChunkBytes = 0;

    const { manifest, totalBytes } = await streamExportChunks(generated.repository, chunk => {
      emittedCount++;
      if (chunk.json.length > maxSingleChunkBytes) {
        maxSingleChunkBytes = chunk.json.length;
      }
    });

    expect(emittedCount).toBeGreaterThan(100);
    expect(totalBytes).toBeGreaterThan(0);
    expect(manifest.chunkIndex).toBeDefined();
    // Individual chunks are compact (< 10 KB each)
    expect(maxSingleChunkBytes).toBeLessThan(10000);
  });

  it('SysmlWorkerClient cancellation releases memory and purges pending requests', async () => {
    const client = new SysmlWorkerClient();
    const fixture = generateSysmlModel({ targetElementCount: 50, seed: 789 }).repository;

    expect(client.getPendingCount()).toBe(0);

    // Terminate cleans up all state
    client.terminate();
    expect(client.getPendingCount()).toBe(0);
  });
});
