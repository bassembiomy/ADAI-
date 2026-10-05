import { loadCanonicalSysmlProject } from '../../../services/sysmlCommandGateway';
import { serializeSysmlProjectState } from '../persistence';
import type { SysmlRepository } from '../model';

export type ProgressPhase = 'read' | 'parse' | 'migrate' | 'normalize' | 'validate' | 'serialize';

export interface ProjectWorkerOptions {
  signal?: AbortSignal;
  onProgress?: (phase: ProgressPhase) => void;
}

export interface LoadedProjectResult {
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
    const loaded = loadCanonicalSysmlProject(parsed);

    options?.onProgress?.('validate');
    checkAborted(options?.signal);

    return {
      repository: loaded.repository,
      coordinates: loaded.coordinates,
      diagramPresentations: loaded.diagramPresentations,
      valid: loaded.valid,
      diagnostics: loaded.diagnostics,
      upgradeReport: loaded.upgradeReport,
      interchangeReport: loaded.interchangeReport,
      rawPayload: parsed,
    };
  }

  return new Promise<LoadedProjectResult>((resolve, reject) => {
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
      } else if (data.type === 'loadSuccess') {
        cleanup();
        resolve(data.result);
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
      worker.postMessage({ id, type: 'serialize', payload });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
