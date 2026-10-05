import type {
  SysmlEntity,
  SysmlEntityCollection,
  SysmlRepository,
} from './model';
import {
  type NormalizedSysmlStore,
  getById,
  upsertEntity,
  removeEntity,
  toWorkerSnapshot,
  fromWorkerSnapshot,
  toRepository,
  fromRepository,
} from './normalizedStore';
import type { WorkerStoreSnapshot } from './workerProtocol';
import type { PresentationCoordinates } from '../../services/sysmlCommandGateway';

export type PatchOpType = 'add' | 'replace' | 'remove' | 'batch';

export interface BasePatchOperation {
  op: PatchOpType;
  collection: SysmlEntityCollection | 'coordinates' | 'diagramPresentations';
  id: string;
  path?: string[];
}

export interface AddOperation extends BasePatchOperation {
  op: 'add';
  value: unknown;
}

export interface ReplaceOperation extends BasePatchOperation {
  op: 'replace';
  oldValue: unknown;
  value: unknown;
}

export interface RemoveOperation extends BasePatchOperation {
  op: 'remove';
  oldValue: unknown;
}

export interface BatchOperation {
  op: 'batch';
  operations: Array<AddOperation | ReplaceOperation | RemoveOperation>;
}

export type PatchOperation = AddOperation | ReplaceOperation | RemoveOperation | BatchOperation;

export interface SysmlPatch {
  id: string;
  revision: number;
  timestamp: string;
  coalesceKey?: string;
  forward: PatchOperation[];
  inverse: PatchOperation[];
  description?: string;
  estimatedBytes?: number;
}

export interface HistoryBudgetOptions {
  maxEntries?: number;
  maxBytes?: number;
  checkpointInterval?: number;
  checkpointEvery?: number;
  maxReplayOperations?: number;
}

export interface PatchHistoryCheckpoint {
  revision: number;
  storeSnapshot?: SysmlRepository;
  snapshot?: WorkerStoreSnapshot;
  timestamp: string;
}

export interface PatchHistoryOptions {
  maxEntries: number;
  maxBytes: number;
  checkpointEvery: number;
  maxReplayOperations: number;
}

export interface PatchHistoryState {
  past: SysmlPatch[];
  future: SysmlPatch[];
  checkpoints: PatchHistoryCheckpoint[];
  currentRevision: number;
  totalBytes: number;
  options: PatchHistoryOptions;
  lastCheckpointRevision: number;
  activeCoalesceKey?: string;
}

export function estimatePatchBytes(patch: SysmlPatch): number {
  try {
    return JSON.stringify(patch).length * 2; // UTF-16 approximate
  } catch {
    return 1024;
  }
}

export function createSysmlPatch(params: {
  id?: string;
  revision: number;
  forward: PatchOperation[];
  inverse: PatchOperation[];
  coalesceKey?: string;
  description?: string;
}): SysmlPatch {
  const patch: SysmlPatch = {
    id: params.id ?? `patch-${params.revision}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    revision: params.revision,
    timestamp: new Date().toISOString(),
    coalesceKey: params.coalesceKey,
    forward: params.forward,
    inverse: params.inverse,
    description: params.description,
  };
  patch.estimatedBytes = estimatePatchBytes(patch);
  return patch;
}

export function invertPatch(patch: SysmlPatch): SysmlPatch {
  return {
    ...patch,
    id: `invert-${patch.id}`,
    forward: patch.inverse,
    inverse: patch.forward,
  };
}

function setNestedProperty(obj: any, path: string[], value: unknown): any {
  if (path.length === 0) return value;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  let curr = clone;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    curr[key] = Array.isArray(curr[key]) ? [...curr[key]] : { ...curr[key] };
    curr = curr[key];
  }
  curr[path[path.length - 1]] = value;
  return clone;
}

/**
 * Apply a sequence of patch operations to a NormalizedSysmlStore.
 */
export function applyPatch(store: NormalizedSysmlStore, operations: PatchOperation[]): void {
  for (const op of operations) {
    if (op.op === 'batch') {
      applyPatch(store, op.operations);
      continue;
    }

    if (op.collection === 'coordinates') {
      if (op.op === 'remove') {
        store.coordinates.delete(op.id);
      } else {
        store.coordinates.set(op.id, op.value as PresentationCoordinates);
      }
      continue;
    }

    if (op.collection === 'diagramPresentations') {
      if (op.op === 'remove') {
        store.diagramPresentations.delete(op.id);
        store.indexes.diagramId.delete(op.id);
      } else {
        const pres = op.value as import('./presentationState').DiagramPresentation;
        store.diagramPresentations.set(op.id, pres);
        const set = new Set(pres.elementIds);
        store.indexes.diagramId.set(op.id, set);
      }
      continue;
    }

    // Entity collections
    const collection = op.collection as SysmlEntityCollection;
    if (op.op === 'add') {
      upsertEntity(store, collection, op.value as SysmlEntity);
    } else if (op.op === 'remove') {
      removeEntity(store, op.id);
    } else if (op.op === 'replace') {
      if (!op.path || op.path.length === 0) {
        upsertEntity(store, collection, op.value as SysmlEntity);
      } else {
        const existing = getById(store, op.id);
        if (existing) {
          const updated = setNestedProperty(existing, op.path, op.value);
          upsertEntity(store, collection, updated as SysmlEntity);
        }
      }
    }
  }
}

export function createPatchHistory(options: HistoryBudgetOptions = {}): PatchHistoryState {
  const checkpointEvery = options.checkpointEvery ?? options.checkpointInterval ?? 25;
  const maxReplayOperations = options.maxReplayOperations ?? 100;
  return {
    past: [],
    future: [],
    checkpoints: [],
    currentRevision: 0,
    totalBytes: 0,
    options: {
      maxEntries: options.maxEntries ?? 50,
      maxBytes: options.maxBytes ?? 10 * 1024 * 1024, // 10 MB default
      checkpointEvery,
      maxReplayOperations,
    },
    lastCheckpointRevision: 0,
  };
}

export function createCheckpoint(
  history: PatchHistoryState,
  store: NormalizedSysmlStore,
  repo?: SysmlRepository,
): PatchHistoryCheckpoint {
  const snapshot = toWorkerSnapshot(store);
  const checkpoint: PatchHistoryCheckpoint = {
    revision: store.revision,
    snapshot,
    storeSnapshot: repo ?? toRepository(store),
    timestamp: new Date().toISOString(),
  };
  history.checkpoints.push(checkpoint);
  history.lastCheckpointRevision = store.revision;
  while (history.checkpoints.length > 5) {
    history.checkpoints.shift();
  }
  return checkpoint;
}

export function replayFromCheckpoint(
  checkpoint: PatchHistoryCheckpoint,
  store: NormalizedSysmlStore,
  patches: SysmlPatch[] = [],
): void {
  if (checkpoint.snapshot) {
    const restored = fromWorkerSnapshot(checkpoint.snapshot);
    store.revision = restored.revision;
    store.definitions = restored.definitions;
    store.usages = restored.usages;
    store.connectors = restored.connectors;
    store.relationships = restored.relationships;
    store.requirements = restored.requirements;
    store.verificationCases = restored.verificationCases;
    store.evidence = restored.evidence;
    store.baselines = restored.baselines;
    store.artifacts = restored.artifacts;
    store.coordinates = restored.coordinates;
    store.diagramPresentations = restored.diagramPresentations;
    store.indexes = restored.indexes;
  } else if (checkpoint.storeSnapshot) {
    const restored = fromRepository(checkpoint.storeSnapshot);
    store.revision = restored.revision;
    store.definitions = restored.definitions;
    store.usages = restored.usages;
    store.connectors = restored.connectors;
    store.relationships = restored.relationships;
    store.requirements = restored.requirements;
    store.verificationCases = restored.verificationCases;
    store.evidence = restored.evidence;
    store.baselines = restored.baselines;
    store.artifacts = restored.artifacts;
    store.coordinates = restored.coordinates;
    store.diagramPresentations = restored.diagramPresentations;
    store.indexes = restored.indexes;
  }

  for (const patch of patches) {
    if (patch.revision > checkpoint.revision) {
      applyPatch(store, patch.forward);
      store.revision = patch.revision;
    }
  }
}

/**
 * Push a new patch onto the history with coalescing, checkpointing, and budget pruning.
 */
export function pushPatch(
  history: PatchHistoryState,
  patch: SysmlPatch,
  currentStore?: NormalizedSysmlStore,
): void {
  const bytes = patch.estimatedBytes ?? estimatePatchBytes(patch);

  // Coalescing check
  if (patch.coalesceKey && history.past.length > 0) {
    const last = history.past[history.past.length - 1];
    if (last.coalesceKey === patch.coalesceKey) {
      // Coalesce: keep original inverse, update forward
      last.forward = patch.forward;
      last.revision = patch.revision;
      const prevBytes = last.estimatedBytes ?? 0;
      last.estimatedBytes = estimatePatchBytes(last);
      history.totalBytes = history.totalBytes - prevBytes + last.estimatedBytes;
      history.currentRevision = patch.revision;
      return;
    }
  }

  history.past.push(patch);
  history.future = []; // Clear redo stack on new action
  history.totalBytes += bytes;
  history.currentRevision = patch.revision;

  // Periodic checkpoint creation when thresholds are reached
  if (currentStore && history.options.checkpointEvery > 0) {
    const revDiff = patch.revision - history.lastCheckpointRevision;
    if (revDiff >= history.options.checkpointEvery || revDiff >= history.options.maxReplayOperations) {
      createCheckpoint(history, currentStore);
    }
  }

  // Prune history to respect budgets
  while (
    history.past.length > history.options.maxEntries ||
    (history.past.length > 1 && history.totalBytes > history.options.maxBytes)
  ) {
    const trimmed = history.past.shift();
    if (trimmed) {
      history.totalBytes -= trimmed.estimatedBytes ?? estimatePatchBytes(trimmed);
    }
  }
}

/**
 * Undo the most recent patch in history.
 */
export function undoPatch(
  history: PatchHistoryState,
  store: NormalizedSysmlStore,
): { appliedPatch: SysmlPatch; nextHistory: PatchHistoryState } | undefined {
  if (history.past.length === 0) return undefined;

  const patch = history.past.pop()!;
  history.totalBytes -= patch.estimatedBytes ?? estimatePatchBytes(patch);
  applyPatch(store, patch.inverse);
  history.future.unshift(patch);
  history.currentRevision = patch.revision - 1;

  return { appliedPatch: patch, nextHistory: history };
}

/**
 * Redo the most recently undone patch.
 */
export function redoPatch(
  history: PatchHistoryState,
  store: NormalizedSysmlStore,
): { appliedPatch: SysmlPatch; nextHistory: PatchHistoryState } | undefined {
  if (history.future.length === 0) return undefined;

  const patch = history.future.shift()!;
  applyPatch(store, patch.forward);
  history.past.push(patch);
  history.totalBytes += patch.estimatedBytes ?? estimatePatchBytes(patch);
  history.currentRevision = patch.revision;

  return { appliedPatch: patch, nextHistory: history };
}
