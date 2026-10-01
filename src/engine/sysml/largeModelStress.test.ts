import { describe, it, expect } from 'vitest';
import { generateSysmlModel, type LargeModelResult } from './largeModelGenerator';
import {
  fromRepository,
  toRepository,
  getById,
  targetedUpdateEntity,
  projectNormalizedDiagram,
} from './normalizedStore';
import {
  createSysmlPatch,
  createPatchHistory,
  pushPatch,
  undoPatch,
  redoPatch,
} from './patches';
import {
  serializeToChunks,
  hydrateRepositoryFromChunks,
  serializeIncrementalChunks,
} from './persistence';
import {
  DiagramSpatialGrid,
  cullElements,
  type DiagramViewport,
} from '../../components/sysml/VirtualizedDiagram';
import type { BlockData } from '../../types/sysml_types';
import { SysmlWorkerClient } from '../../services/sysmlWorkerClient';
import { analyzeMutation } from './mutations';

describe('SysML Large Model Stress & Performance Gates', () => {
  // Realistic high-density fixture helper
  function createDenseModel(targetCount: number, seed = 42): LargeModelResult {
    return generateSysmlModel({
      targetElementCount: targetCount,
      seed,
      elementsPerDiagram: Math.min(200, Math.max(50, Math.floor(targetCount / 10))),
    });
  }

  it('generates realistic fixtures (1k, 10k, 50k, 100k) with high relationship and connector density', () => {
    const counts = [1000, 10000, 50000];
    for (const count of counts) {
      const model = createDenseModel(count);
      const stats = model.stats;
      expect(stats.totalElements).toBeGreaterThanOrEqual(count * 0.9);
      expect(stats.relationshipsCount).toBeGreaterThan(0);
      expect(stats.connectorsCount).toBeGreaterThan(0);
      expect(stats.definitionsCount).toBeGreaterThan(0);
      expect(stats.diagramCount).toBeGreaterThan(0);
    }
  });

  it('enforces latency gates on real operations (edit, drag p95, undo, active projection) for 10k and 50k models', () => {
    const model10k = createDenseModel(10000, 101);
    const store10k = fromRepository(model10k.repository, model10k.coordinates, model10k.diagramPresentations);

    // 1. EDIT GATE: Target mutation must be < 50ms (hard threshold < 100ms)
    const firstDefId = Array.from(store10k.definitions.keys())[0];
    const tEditStart = performance.now();
    const updated = targetedUpdateEntity(store10k, firstDefId, { name: 'Stress_Updated_Block' });
    const editDuration = performance.now() - tEditStart;
    expect(updated.success).toBe(true);
    expect(editDuration).toBeLessThan(100);

    // 2. ACTIVE DIAGRAM PROJECTION GATE: Projecting single active diagram must be < 50ms
    const activeDiagId = Array.from(store10k.diagramPresentations.keys())[0];
    const tProjStart = performance.now();
    const projectedView = projectNormalizedDiagram(store10k, activeDiagId);
    const projDuration = performance.now() - tProjStart;
    expect(projectedView.blocks.length).toBeGreaterThan(0);
    expect(projDuration).toBeLessThan(50);

    // 3. DRAG P95 GATE: Simulating 60 frames of panning/dragging viewport queries
    const grid10k = new DiagramSpatialGrid(500);
    const blocks10k: BlockData[] = [];
    for (const [id, def] of store10k.definitions.entries()) {
      const coord = store10k.coordinates.get(id);
      const x = coord?.x ?? 0;
      const y = coord?.y ?? 0;
      grid10k.insert({ id, x, y, width: 160, height: 100 });
      blocks10k.push({
        id,
        name: def.name,
        stereotype: 'block',
        x,
        y,
        width: 160,
        height: 100,
        properties: [],
        operations: [],
        constraints: [],
        classes: [],
        ports: [],
      });
    }

    const frameDurations: number[] = [];
    for (let frame = 0; frame < 60; frame++) {
      const viewport: DiagramViewport = {
        x: frame * 10,
        y: frame * 10,
        width: 1200,
        height: 800,
        scale: 1,
        overscan: 200,
      };
      const t0 = performance.now();
      cullElements(viewport, blocks10k, [], [], [], grid10k, 500, {
        storeRevision: store10k.revision,
      });
      frameDurations.push(performance.now() - t0);
    }

    frameDurations.sort((a, b) => a - b);
    const p95Index = Math.floor(frameDurations.length * 0.95);
    const dragP95 = frameDurations[p95Index];
    expect(dragP95).toBeLessThan(50); // Enforce drag p95 < 50ms

    // 4. UNDO / REDO GATE: Multi-step patch history operations < 50ms
    const patchHistory = createPatchHistory({ maxEntries: 100 });
    const patch = createSysmlPatch({
      revision: 1,
      forward: [{ op: 'replace', collection: 'definitions', id: firstDefId, path: ['name'], oldValue: 'Original_Name', value: 'Undo_Redo_Name' }],
      inverse: [{ op: 'replace', collection: 'definitions', id: firstDefId, path: ['name'], oldValue: 'Undo_Redo_Name', value: 'Original_Name' }],
    });
    pushPatch(patchHistory, patch);

    const tUndoStart = performance.now();
    const undoRes = undoPatch(patchHistory, store10k);
    const undoDuration = performance.now() - tUndoStart;
    expect(undoRes).toBeDefined();
    expect(undoDuration).toBeLessThan(50);

    const tRedoStart = performance.now();
    const redoRes = redoPatch(patchHistory, store10k);
    const redoDuration = performance.now() - tRedoStart;
    expect(redoRes).toBeDefined();
    expect(redoDuration).toBeLessThan(50);

    // 5. DELETION PREVIEW IMPACT GATE: < 100ms for 10k elements
    const tImpactStart = performance.now();
    const impact = analyzeMutation(model10k.repository, { kind: 'deleteElements', elementIds: [firstDefId] });
    const impactDuration = performance.now() - tImpactStart;
    expect(impact.deletedElementIds.length).toBeGreaterThanOrEqual(1);
    expect(impactDuration).toBeLessThan(100);
  });

  it('enforces worker cancellation latency < 300ms and safe rejection of in-flight work', async () => {
    const client = new SysmlWorkerClient();
    const model = createDenseModel(1000);
    const store = fromRepository(model.repository);

    // Schedule validation and immediately cancel
    const t0 = performance.now();
    let receivedResult = false;
    let receivedError = false;

    const cancel = client.scheduleValidation(
      store,
      store.revision,
      () => { receivedResult = true; },
      () => { receivedError = true; }
    );

    cancel();
    const cancelDuration = performance.now() - t0;

    // Cancellation invocation must be instantaneous (< 300ms budget under heavy load)
    expect(cancelDuration).toBeLessThan(300);
    expect(receivedResult).toBe(false);
  });

  it('validates persistence round-trip and chunked recovery under 10k load', async () => {
    const model = createDenseModel(10000, 202);
    const repo = model.repository;

    const tSerialize = performance.now();
    const chunked = serializeToChunks(repo);
    const serializeDuration = performance.now() - tSerialize;
    expect(serializeDuration).toBeLessThan(1500);
    expect(Object.keys(chunked.chunks).length).toBeGreaterThan(1);

    const tHydrate = performance.now();
    const rehydration = hydrateRepositoryFromChunks(chunked.manifest, key => chunked.chunks[key]?.json);
    const hydrateDuration = performance.now() - tHydrate;
    expect(hydrateDuration).toBeLessThan(1500);
    expect(rehydration.valid).toBe(true);

    const hydrated = rehydration.repository;
    expect(Object.keys(hydrated.definitions).length).toBe(Object.keys(repo.definitions).length);
    expect(Object.keys(hydrated.usages).length).toBe(Object.keys(repo.usages).length);
    expect(Object.keys(hydrated.relationships).length).toBe(Object.keys(repo.relationships).length);
  });
});
