import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  generateScalabilityFixture,
  type ScalabilityTopology,
} from '../../src/engine/sysml/largeModelGenerator';
import { validateSysmlRepository } from '../../src/engine/sysml/validation';
import { fromRepository } from '../../src/engine/sysml/normalizedStore';
import { serializeRepository, loadRepository } from '../../src/engine/sysml/persistence';
import {
  createSysmlGatewayState,
  executeSysmlCommand,
  type SysmlGatewayState,
} from '../../src/services/sysmlCommandGateway';
import { analyzeMutation } from '../../src/engine/sysml/mutations';
import {
  calculateStats,
  type OperationMetric,
  type SizeBaselineResult,
} from './metrics';

export interface VerifiedEditResult {
  success: boolean;
  finalState: SysmlGatewayState;
  undoRestoredName?: string;
  redoReappliedName?: string;
  durationsMs: number[];
}

export function executeVerifiedEditSequence(
  initialState: SysmlGatewayState,
  targetElementId: string,
  newNames: string[],
  activeDiagramId?: string,
  options?: { corruptUndoBeforeCommit?: boolean }
): VerifiedEditResult {
  if (newNames.length === 0) {
    throw new Error('At least one edit name must be provided for edit sequence');
  }

  let currentState = initialState;
  const durationsMs: number[] = [];

  for (let i = 0; i < newNames.length; i++) {
    const nextName = newNames[i];
    const prevRev = currentState.repository.revision;

    const t0 = performance.now();
    const result = executeSysmlCommand(
      currentState,
      {
        type: 'updateElement',
        elementId: targetElementId,
        patch: { name: nextName },
      },
      activeDiagramId
    );
    durationsMs.push(performance.now() - t0);

    if (!result.committed) {
      throw new Error(`Edit command failed to commit or find target element: ${targetElementId}`);
    }

    currentState = { ...currentState, ...result };
    const actualName = currentState.repository.definitions[targetElementId]?.name;
    if (actualName !== nextName) {
      throw new Error(
        `Edit command failed to commit or find target element ${targetElementId} with name ${nextName}`
      );
    }
    if (currentState.repository.revision <= prevRev) {
      throw new Error(`Edit command did not advance repository revision`);
    }
  }

  // Simulate corrupted undo state if requested
  if (options?.corruptUndoBeforeCommit) {
    currentState = {
      ...currentState,
      patchHistory: { past: [], future: [] },
      history: { past: [], present: currentState.repository, future: [] },
    };
  }

  // Verify Undo
  const lastCommittedName = currentState.repository.definitions[targetElementId]?.name;
  const expectedUndoName =
    newNames.length > 1
      ? newNames[newNames.length - 2]
      : initialState.repository.definitions[targetElementId]?.name;

  const undoResult = executeSysmlCommand(currentState, { type: 'undo' }, activeDiagramId);
  const undoState = { ...currentState, ...undoResult };
  const restoredName = undoState.repository.definitions[targetElementId]?.name;
  if (!undoResult.committed || restoredName !== expectedUndoName) {
    throw new Error(
      `Undo failed to commit or restore previous state: expected "${expectedUndoName}", got "${restoredName}"`
    );
  }

  // Verify Redo
  const redoResult = executeSysmlCommand(undoState, { type: 'redo' }, activeDiagramId);
  if (!redoResult.committed) {
    throw new Error(`Redo failed to commit or reapply state`);
  }
  const redoState = { ...undoState, ...redoResult };
  const reappliedName = redoState.repository.definitions[targetElementId]?.name;
  if (reappliedName !== lastCommittedName) {
    throw new Error(
      `Redo failed to commit or reapply state: expected "${lastCommittedName}", got "${reappliedName}"`
    );
  }

  return {
    success: true,
    finalState: redoState,
    undoRestoredName: restoredName,
    redoReappliedName: reappliedName,
    durationsMs,
  };
}

function getMemoryMb() {
  const mem = process.memoryUsage();
  return {
    rss: Math.round(mem.rss / 1024 / 1024),
    heap: Math.round(mem.heapUsed / 1024 / 1024),
  };
}

export async function runWorkerBenchmark(): Promise<void> {
  const args = process.argv.slice(2);
  const sizeArg = args.find(a => a.startsWith('--size='));
  const seedArg = args.find(a => a.startsWith('--seed='));
  const topologyArg = args.find(a => a.startsWith('--topology='));
  const samplesArg = args.find(a => a.startsWith('--samples='));
  const sidecarArg = args.find(a => a.startsWith('--sidecar='));

  const size = sizeArg ? parseInt(sizeArg.split('=')[1], 10) : 10000;
  const seed = seedArg ? parseInt(seedArg.split('=')[1], 10) : 42;
  const topology = (topologyArg ? topologyArg.split('=')[1] : 'distributed') as ScalabilityTopology;
  const sampleCount = samplesArg ? parseInt(samplesArg.split('=')[1], 10) : 5;

  const sidecarPath = sidecarArg
    ? resolve(process.cwd(), sidecarArg.split('=')[1])
    : resolve(process.cwd(), `artifacts/scalability/worker-${size}-phases.jsonl`);

  mkdirSync(dirname(sidecarPath), { recursive: true });

  const phases: Record<string, OperationMetric> = {};

  const recordPhase = (
    phase: string,
    action: () => void,
    iterations: number = sampleCount
  ): OperationMetric => {
    const samples: number[] = [];
    let maxRss = 0;
    let maxHeap = 0;

    for (let i = 0; i < iterations; i++) {
      if (global.gc) {
        try { global.gc(); } catch {}
      }
      const t0 = performance.now();
      action();
      const t1 = performance.now();
      samples.push(t1 - t0);

      const mem = getMemoryMb();
      if (mem.rss > maxRss) maxRss = mem.rss;
      if (mem.heap > maxHeap) maxHeap = mem.heap;
    }

    const stats = calculateStats(samples);
    const metric: OperationMetric = {
      phase,
      samples,
      p50Ms: stats.p50,
      p95Ms: stats.p95,
      maxMs: stats.max,
      meanMs: stats.mean,
      peakRssMb: maxRss,
      peakHeapMb: maxHeap,
      outcome: 'success',
    };
    phases[phase] = metric;

    // Immediately stream completed phase to sidecar JSONL
    try {
      appendFileSync(
        sidecarPath,
        JSON.stringify({ timestamp: new Date().toISOString(), size, metric }) + '\n',
        'utf8'
      );
    } catch {
      // Non-blocking sidecar write
    }

    return metric;
  };

  try {
    // 1. Generation
    let fixture: any;
    recordPhase('generation', () => {
      fixture = generateScalabilityFixture({ semanticCount: size, seed, topology });
    }, Math.min(3, sampleCount));

    // 2. Validation
    let valReport: any;
    recordPhase('validation', () => {
      valReport = validateSysmlRepository(fixture.repository);
    }, Math.min(3, sampleCount));

    const errors = valReport?.diagnostics?.filter((d: any) => d.severity === 'error') ?? [];
    if (errors.length > 0) {
      throw new Error(`Validation failed with ${errors.length} errors`);
    }

    // 3. Store Construction (fromRepository)
    let store: any;
    recordPhase('storeConstruction', () => {
      store = fromRepository(fixture.repository, fixture.coordinates, fixture.diagramPresentations);
    }, Math.min(3, sampleCount));

    // 4. Serialization
    let serialized: string = '';
    recordPhase('serialization', () => {
      serialized = serializeRepository(fixture.repository);
    }, Math.min(3, sampleCount));

    // 5. Deserialization
    recordPhase('deserialization', () => {
      loadRepository(serialized);
    }, Math.min(3, sampleCount));

    // 6. Lookup Queries
    recordPhase('lookupQueries', () => {
      for (let i = 0; i < 50; i++) {
        const id = `blk_${(i % 100) + 1}`;
        store.indexes.byId.get(id);
        store.indexes.ownerId.get('model');
        store.indexes.diagramId.get('diagram-ordinary');
      }
    }, sampleCount);

    // 7. Search Queries
    recordPhase('searchQueries', () => {
      const query = 'Block_10';
      const results: string[] = [];
      for (const [id, def] of Object.entries(fixture.repository.definitions as Record<string, any>)) {
        if (def.name.includes(query)) results.push(id);
      }
    }, sampleCount);

    // 8. Gateway Edit (state-advancing verified edit sequence with commit assertions)
    let gateway = createSysmlGatewayState(
      fixture.repository,
      fixture.coordinates,
      fixture.diagramPresentations
    );

    const editNames = Array.from({ length: sampleCount }, (_, idx) => `Block_1_Committed_${idx + 1}`);
    const editSamples: number[] = [];
    let editMaxRss = 0;
    let editMaxHeap = 0;

    for (let i = 0; i < sampleCount; i++) {
      if (global.gc) {
        try { global.gc(); } catch {}
      }
      const prevRev = gateway.repository.revision;
      const t0 = performance.now();
      const res = executeSysmlCommand(
        gateway,
        {
          type: 'updateElement',
          elementId: 'blk_1',
          patch: { name: editNames[i] },
        },
        'diagram-ordinary'
      );
      const t1 = performance.now();
      editSamples.push(t1 - t0);

      if (!res.committed) {
        throw new Error(`Gateway edit failed to commit at sample ${i}`);
      }
      gateway = { ...gateway, ...res };
      if (gateway.repository.definitions.blk_1?.name !== editNames[i]) {
        throw new Error(`Gateway edit state not updated at sample ${i}`);
      }
      if (gateway.repository.revision <= prevRev) {
        throw new Error(`Gateway revision not advanced at sample ${i}`);
      }

      const mem = getMemoryMb();
      if (mem.rss > editMaxRss) editMaxRss = mem.rss;
      if (mem.heap > editMaxHeap) editMaxHeap = mem.heap;
    }

    const editStats = calculateStats(editSamples);
    const editMetric: OperationMetric = {
      phase: 'gatewayEdit',
      samples: editSamples,
      p50Ms: editStats.p50,
      p95Ms: editStats.p95,
      maxMs: editStats.max,
      meanMs: editStats.mean,
      peakRssMb: editMaxRss,
      peakHeapMb: editMaxHeap,
      outcome: 'success',
    };
    phases['gatewayEdit'] = editMetric;
    try {
      appendFileSync(
        sidecarPath,
        JSON.stringify({ timestamp: new Date().toISOString(), size, metric: editMetric }) + '\n',
        'utf8'
      );
    } catch {}

    // 9. Delete Analysis
    recordPhase('deleteAnalysis', () => {
      analyzeMutation(gateway.repository, { kind: 'deleteElements', elementIds: ['blk_1'] });
    }, sampleCount);

    // 10. Undo / Redo with commit and restoration verification
    const undoRedoSamples: number[] = [];
    let urMaxRss = 0;
    let urMaxHeap = 0;

    for (let i = 0; i < sampleCount; i++) {
      if (global.gc) {
        try { global.gc(); } catch {}
      }
      const t0 = performance.now();
      const undoRes = executeSysmlCommand(gateway, { type: 'undo' }, 'diagram-ordinary');
      if (!undoRes.committed) throw new Error('Undo command failed to commit');
      gateway = { ...gateway, ...undoRes };

      const redoRes = executeSysmlCommand(gateway, { type: 'redo' }, 'diagram-ordinary');
      if (!redoRes.committed) throw new Error('Redo command failed to commit');
      gateway = { ...gateway, ...redoRes };
      const t1 = performance.now();
      undoRedoSamples.push(t1 - t0);

      const mem = getMemoryMb();
      if (mem.rss > urMaxRss) urMaxRss = mem.rss;
      if (mem.heap > urMaxHeap) urMaxHeap = mem.heap;
    }

    const urStats = calculateStats(undoRedoSamples);
    const urMetric: OperationMetric = {
      phase: 'undoRedo',
      samples: undoRedoSamples,
      p50Ms: urStats.p50,
      p95Ms: urStats.p95,
      maxMs: urStats.max,
      meanMs: urStats.mean,
      peakRssMb: urMaxRss,
      peakHeapMb: urMaxHeap,
      outcome: 'success',
    };
    phases['undoRedo'] = urMetric;
    try {
      appendFileSync(
        sidecarPath,
        JSON.stringify({ timestamp: new Date().toISOString(), size, metric: urMetric }) + '\n',
        'utf8'
      );
    } catch {}

    const result: SizeBaselineResult = {
      size,
      topology,
      counts: fixture.counts,
      phases,
      outcome: 'success',
    };

    console.log('__BENCH_RESULT_START__');
    console.log(JSON.stringify(result));
    console.log('__BENCH_RESULT_END__');
  } catch (err: any) {
    const mem = getMemoryMb();
    const result: SizeBaselineResult = {
      size,
      topology,
      phases,
      outcome: 'failed',
      failureReason: err?.message || String(err),
    };
    console.log('__BENCH_RESULT_START__');
    console.log(JSON.stringify(result));
    console.log('__BENCH_RESULT_END__');
    process.exit(1);
  }
}

// Only run CLI worker if executed directly, not when imported
if (process.argv[1] && (process.argv[1].endsWith('benchWorker.ts') || process.argv[1].endsWith('benchWorker.js'))) {
  runWorkerBenchmark();
}
