import { loadCanonicalSysmlProject } from '../../../services/sysmlCommandGateway';
import { serializeSysmlProjectState } from '../persistence';
import type { SysmlRepository } from '../model';
import { stripCanonicalPayloadForHydration } from './projectIoPayload';
import { projectStateEndpoints, projectStateEndpointSignature } from './projectIoPayload';
import { appendCoordinateChunk, appendRepositoryChunk } from './projectIoPayload';
import type { SysmlEntityCollection } from '../model';
import { createStreamedNormalizedStore, type NormalizedSysmlStore } from '../normalizedStore';
import { ensureDefaultSysmlDiagrams } from '../../../services/sysmlDiagramWorkspace';
import { createProjectSnapshot } from '../../../utils/adiaProjectPersistence';

export type ProgressPhase = 'read' | 'parse' | 'migrate' | 'normalize' | 'validate' | 'serialize';

export interface ProjectWorkerOptions {
  onSnapshot?: (snapshot: string) => void;
  signal?: AbortSignal;
  onProgress?: (phase: ProgressPhase) => void;
}

export interface LoadedProjectResult {
  stateEndpointSignature?: string;
  store?: NormalizedSysmlStore;
  repository: SysmlRepository;
  coordinates: Record<string, any>;
  diagramPresentations?: Record<string, any>;
  valid: boolean;
  diagnostics: any[];
  upgradeReport?: any;
  interchangeReport?: any;
  rawPayload: any;
}

let customWorkerFactory: (() => Worker) | null = null;
const STREAM_ACK_DELAY_MS = 8;

export function setCustomProjectIoWorkerFactory(factory: (() => Worker) | null): void {
  customWorkerFactory = factory;
}

function createWorker(): Worker | null {
  if (customWorkerFactory) {
    return customWorkerFactory();
  }
  if (typeof Worker !== 'undefined') {
    try {
      return new Worker(new URL('./projectIo.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      return null;
    }
  }
  return null;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Operation aborted');
    error.name = 'AbortError';
    throw error;
  }
}

export async function loadProjectInWorker(
  buffer: ArrayBuffer,
  options?: ProjectWorkerOptions,
): Promise<LoadedProjectResult> {
  checkAborted(options?.signal);

  const worker = createWorker();

  if (!worker) {
    // In-thread fallback (e.g. Node / Vitest test environment)
    options?.onProgress?.('read');
    checkAborted(options?.signal);

    const decoder = new TextDecoder('utf-8');
    const jsonText = decoder.decode(buffer);

    options?.onProgress?.('parse');
    checkAborted(options?.signal);
    const parsed = JSON.parse(jsonText);

    options?.onProgress?.('migrate');
    checkAborted(options?.signal);

    options?.onProgress?.('normalize');
    const loaded = loadCanonicalSysmlProject(parsed, { externalEndpoints: projectStateEndpoints(parsed.states) });
    const stateEndpointSignature = projectStateEndpointSignature(parsed.states);

    options?.onProgress?.('validate');
    checkAborted(options?.signal);

    return {
      repository: loaded.repository,
      stateEndpointSignature,
      coordinates: loaded.coordinates,
      diagramPresentations: loaded.diagramPresentations,
      valid: loaded.valid,
      diagnostics: loaded.diagnostics,
      upgradeReport: loaded.upgradeReport,
      interchangeReport: loaded.interchangeReport,
      rawPayload: stripCanonicalPayloadForHydration(parsed, loaded.valid, stateEndpointSignature),
    };
  }

  return new Promise<LoadedProjectResult>((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    let cleanedUp = false;
    let streamedRepository: SysmlRepository | null = null;
    let streamedStore: ReturnType<typeof createStreamedNormalizedStore> | null = null;
    const streamedCoordinates: Record<string, any> = {};
    const acknowledgeChunk = (sequence: number) => {
      setTimeout(() => {
        if (!cleanedUp) worker.postMessage({ id, type: 'loadChunkAck', sequence });
      }, STREAM_ACK_DELAY_MS);
    };

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      if (options?.signal) {
        options.signal.removeEventListener('abort', handleAbort);
      }
      worker.terminate();
    };

    const handleAbort = () => {
      try {
        worker.postMessage({ id, type: 'cancel' });
      } catch {
        // Worker might already be terminated
      }
      cleanup();
      const error = new Error('Operation aborted');
      error.name = 'AbortError';
      reject(error);
    };

    const handleError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || 'Worker execution error'));
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.id !== id) return;

      if (data.type === 'progress') {
        options?.onProgress?.(data.phase);
      } else if (data.type === 'loadRepositoryStart') {
        streamedRepository = data.repository;
        streamedStore = createStreamedNormalizedStore(data.repository);
      } else if (data.type === 'loadRepositoryChunk') {
        if (!streamedRepository) {
          cleanup();
          reject(new Error('Worker sent a repository chunk before repository metadata'));
          return;
        }
        appendRepositoryChunk(
          streamedRepository,
          data.collection as SysmlEntityCollection,
          data.entries,
        );
        streamedStore?.appendEntities(data.collection, data.entries);
        acknowledgeChunk(data.sequence);
      } else if (data.type === 'loadCoordinateChunk') {
        appendCoordinateChunk(streamedCoordinates, data.entries);
        streamedStore?.appendCoordinates(data.entries);
        acknowledgeChunk(data.sequence);
      } else if (data.type === 'loadSuccess') {
        cleanup();
        if (streamedRepository && streamedStore) {
          const defaults = ensureDefaultSysmlDiagrams(streamedRepository);
          streamedStore.appendEntities('diagrams', defaults.createdDiagramIds.map(id => [id, defaults.repository.diagrams[id]]));
          streamedRepository = defaults.repository;
        }
        resolve({
          ...data.result,
          ...(streamedStore ? { store: streamedStore.finish(data.result.diagramPresentations) } : {}),
          repository: streamedRepository ?? data.result.repository,
          coordinates: streamedRepository || Object.keys(streamedCoordinates).length > 0
            ? streamedCoordinates
            : data.result.coordinates,
        });
      } else if (data.type === 'error') {
        cleanup();
        reject(new Error(data.message));
      }
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        handleAbort();
        return;
      }
      options.signal.addEventListener('abort', handleAbort);
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    try {
      worker.postMessage({ id, type: 'load', buffer }, [buffer]);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

export async function serializeProjectInWorker(
  payload: any,
  options?: ProjectWorkerOptions,
): Promise<ArrayBuffer> {
  checkAborted(options?.signal);

  const worker = createWorker();

  if (!worker) {
    // In-thread fallback
    options?.onProgress?.('serialize');
    checkAborted(options?.signal);

    let payloadToSerialize = payload;
    if (payloadToSerialize && typeof payloadToSerialize.sysmlRepository === 'object') {
      const savedSysml = serializeSysmlProjectState(
        payloadToSerialize.sysmlRepository,
        payloadToSerialize.diagramPresentations,
        payloadToSerialize.sysmlCoordinates,
      );
      payloadToSerialize = {
        ...payloadToSerialize,
        sysmlRepository: savedSysml.sysmlRepository,
        diagramPresentations: savedSysml.diagramPresentations,
        sysmlCoordinates: savedSysml.sysmlCoordinates ?? payloadToSerialize.sysmlCoordinates,
      };
    }
    const jsonText = JSON.stringify(payloadToSerialize);
    options?.onSnapshot?.(createProjectSnapshot(payloadToSerialize));
    const encoder = new TextEncoder();
    return encoder.encode(jsonText).buffer;
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      if (options?.signal) {
        options.signal.removeEventListener('abort', handleAbort);
      }
      worker.terminate();
    };

    const handleAbort = () => {
      try {
        worker.postMessage({ id, type: 'cancel' });
      } catch {
        // Worker might already be terminated
      }
      cleanup();
      const error = new Error('Operation aborted');
      error.name = 'AbortError';
      reject(error);
    };

    const handleError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || 'Worker execution error'));
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.id !== id) return;

      if (data.type === 'progress') {
        options?.onProgress?.(data.phase);
      } else if (data.type === 'serializeSuccess') {
        cleanup();
        if (options?.onSnapshot) {
          if (typeof data.snapshot !== 'string') {
            reject(new Error('Worker did not provide the saved project snapshot'));
            return;
          }
          options.onSnapshot(data.snapshot);
        }
        resolve(data.buffer);
      } else if (data.type === 'error') {
        cleanup();
        reject(new Error(data.message));
      }
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        handleAbort();
        return;
      }
      options.signal.addEventListener('abort', handleAbort);
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    try {
      worker.postMessage({ id, type: 'serialize', payload, includeSnapshot: Boolean(options?.onSnapshot) });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
