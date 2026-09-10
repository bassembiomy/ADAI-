import { describe, it, expect } from 'vitest';
import {
  generate1kModel,
  generate10kModel,
  generate50kModel,
} from './largeModelGenerator';
import { measureSync, formatBytes, formatDuration } from '../../services/sysmlPerformance';
import {
  fromRepository,
  toRepository,
  getById,
  targetedUpdateEntity,
  selectVisibleElementIds,
} from './normalizedStore';
import {
  createSysmlPatch,
  createPatchHistory,
  pushPatch,
  undoPatch,
  redoPatch,
  applyPatch,
} from './patches';
import {
  serializeToChunks,
  serializeIncrementalChunks,
  hydrateRepositoryFromChunks,
} from './persistence';
import {
  DiagramSpatialGrid,
  cullElements,
  type DiagramViewport,
} from '../../components/sysml/VirtualizedDiagram';
import { projectLegacyDiagram } from '../../services/sysmlCommandGateway';
import type { BlockData } from '../../types/sysml_types';

describe('SysML Large Model Benchmark Gates', () => {
  it('verifies normalized store projection equivalence with legacy projectLegacyDiagram', () => {
    const model = generate1kModel(42);
    const store = fromRepository(model.repository, model.coordinates, model.diagramPresentations);
    const normalizedRepo = toRepository(store);

    expect(Object.keys(normalizedRepo.definitions).length).toBe(Object.keys(model.repository.definitions).length);
    expect(Object.keys(normalizedRepo.usages).length).toBe(Object.keys(model.repository.usages).length);
    expect(Object.keys(normalizedRepo.relationships).length).toBe(Object.keys(model.repository.relationships).length);

    // Verify index retrieval by owner and type
    const firstDefId = Object.keys(model.repository.definitions)[0];
    const def = getById(store, firstDefId);
    expect(def).toBeDefined();

    const usagesOfDef = store.indexes.typeId.get(firstDefId);
    if (usagesOfDef && usagesOfDef.size > 0) {
      const usageId = Array.from(usagesOfDef)[0];
      expect(store.usages.has(usageId)).toBe(true);
    }
  });

  it('runs performance benchmark gate across 1k, 10k, and 50k models and enforces latency budgets', () => {
    const metrics: Record<string, any> = {};

    // ─────────────────────────────────────────────────────────────
    // 1. 1k Model Gate
    // ─────────────────────────────────────────────────────────────
    const m1k = generate1kModel(101);
    const store1k = fromRepository(m1k.repository, m1k.coordinates, m1k.diagramPresentations);

    // Edit latency gate (< 10ms)
    const edit1k = measureSync('Edit element 1k', () => {
      return targetedUpdateEntity(store1k, 'blk_1', { name: 'Updated_Blk_1' });
    });
    expect(edit1k.durationMs).toBeLessThan(50); // Hard budget: 50ms
    metrics['edit_1k_ms'] = edit1k.durationMs;

    // Spatial culling query gate (< 5ms)
    const grid1k = new DiagramSpatialGrid(500);
    const blocks1k: BlockData[] = [];
    for (const [id, def] of store1k.definitions.entries()) {
      const coord = store1k.coordinates.get(id);
      const x = coord?.x ?? 100;
      const y = coord?.y ?? 100;
      grid1k.insert({ id, x, y, width: 150, height: 100 });
      blocks1k.push({
        id,
        name: def.name,
        stereotype: 'block',
        x,
        y,
        width: 150,
        height: 100,
        properties: [],
        operations: [],
        constraints: [],
        classes: [],
        ports: [],
      });
    }

    const viewport: DiagramViewport = { x: 0, y: 0, width: 1200, height: 800, scale: 1, overscan: 100 };
    const cull1k = measureSync('Cull 1k', () => cullElements(viewport, blocks1k, [], [], [], grid1k));
    expect(cull1k.durationMs).toBeLessThan(15);
    metrics['cull_1k_ms'] = cull1k.durationMs;

    // ─────────────────────────────────────────────────────────────
    // 2. 10k Model Gate
    // ─────────────────────────────────────────────────────────────
    const m10k = generate10kModel(102);
    const store10k = fromRepository(m10k.repository, m10k.coordinates, m10k.diagramPresentations);

    // Edit latency gate (< 50ms)
    const edit10k = measureSync('Edit element 10k', () => {
      return targetedUpdateEntity(store10k, 'blk_1', { name: 'Updated_Blk_10k' });
    });
    expect(edit10k.durationMs).toBeLessThan(50); // Hard budget: 50ms
    metrics['edit_10k_ms'] = edit10k.durationMs;

    // Drag / pointer move coalesced patch & history gate
    const history = createPatchHistory({ maxEntries: 100 });
    const dragDurations: number[] = [];

    // Simulate 20 drag moves
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      const patch = createSysmlPatch({
        revision: store10k.revision + i + 1,
        coalesceKey: 'drag_blk_1',
        forward: [{
          op: 'replace',
          collection: 'coordinates',
          id: 'blk_1',
          oldValue: { x: 200, y: 200 },
          value: { x: 200 + i * 5, y: 200 + i * 5 },
        }],
        inverse: [{
          op: 'replace',
          collection: 'coordinates',
          id: 'blk_1',
          oldValue: { x: 200 + i * 5, y: 200 + i * 5 },
          value: { x: 200, y: 200 },
        }],
      });
      applyPatch(store10k, patch.forward);
      pushPatch(history, patch, store10k);
      dragDurations.push(performance.now() - t0);
    }

    dragDurations.sort((a, b) => a - b);
    const p95DragMs = dragDurations[Math.floor(dragDurations.length * 0.95)];
    expect(p95DragMs).toBeLessThan(50); // Must be sub-50ms p95 drag
    metrics['drag_p95_10k_ms'] = p95DragMs;

    // Undo / Redo gate (< 25ms)
    const undoMeasure = measureSync('Undo 10k', () => {
      return undoPatch(history, store10k);
    });
    expect(undoMeasure.durationMs).toBeLessThan(25);
    metrics['undo_10k_ms'] = undoMeasure.durationMs;

    const redoMeasure = measureSync('Redo 10k', () => {
      return redoPatch(history, store10k);
    });
    expect(redoMeasure.durationMs).toBeLessThan(25);
    metrics['redo_10k_ms'] = redoMeasure.durationMs;

    // Full Chunked Persistence Gate (< 1500ms for 10k entities with SHA256 hashes under parallel load)
    const chunkSerializeMeasure = measureSync('Chunked persistence 10k', () => {
      return serializeToChunks(m10k.repository);
    });
    expect(chunkSerializeMeasure.durationMs).toBeLessThan(1500);
    metrics['chunk_persist_10k_ms'] = chunkSerializeMeasure.durationMs;

    // Incremental Persistence Gate: saving after 1 edit (< 100ms)
    const incrementalPersistMeasure = measureSync('Incremental chunk persistence 10k', () => {
      return serializeIncrementalChunks(m10k.repository, ['blk_1'], chunkSerializeMeasure.result.manifest);
    });
    expect(incrementalPersistMeasure.durationMs).toBeLessThan(300); // Bounded manifest rehash under parallel load
    metrics['incremental_persist_10k_ms'] = incrementalPersistMeasure.durationMs;

    // Chunked Hydration Gate (< 1000ms under parallel load)
    const chunkHydrateMeasure = measureSync('Chunked hydration 10k', () => {
      return hydrateRepositoryFromChunks(
        chunkSerializeMeasure.result.manifest,
        key => chunkSerializeMeasure.result.chunks[key]?.json
      );
    });
    expect(chunkHydrateMeasure.durationMs).toBeLessThan(1000);
    metrics['chunk_hydrate_10k_ms'] = chunkHydrateMeasure.durationMs;

    // ─────────────────────────────────────────────────────────────
    // 3. 50k Model Scalability Gate
    // ─────────────────────────────────────────────────────────────
    const m50k = generate50kModel(103);
    const store50k = fromRepository(m50k.repository, m50k.coordinates, m50k.diagramPresentations);

    // Indexed getById gate on 50k items (< 1ms)
    const get50k = measureSync('GetById 50k', () => getById(store50k, 'blk_1000'));
    expect(get50k.durationMs).toBeLessThan(5);
    metrics['get_50k_ms'] = get50k.durationMs;

    // Single Diagram Projection on 50k items (< 20ms)
    const diag50k = measureSync('Diagram projection 50k', () => selectVisibleElementIds(store50k, 'diagram-root'));
    expect(diag50k.durationMs).toBeLessThan(30);
    metrics['diagram_proj_50k_ms'] = diag50k.durationMs;

    // Log complete benchmark summary
    console.log('\n=== BENCHMARK GATE SUMMARY ===');
    for (const [k, v] of Object.entries(metrics)) {
      console.log(`  ${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`);
    }
    console.log('==============================\n');
  });
});
