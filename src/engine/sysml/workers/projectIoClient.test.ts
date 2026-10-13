import { describe, it, expect, vi } from 'vitest';
import {
  loadProjectInWorker,
  serializeProjectInWorker,
  type ProgressPhase,
  setCustomProjectIoWorkerFactory,
} from './projectIoClient';
import { createEmptyRepository } from '../model';
import { buildCanonicalSysmlProjectPayload, createSysmlGatewayState } from '../../../services/sysmlCommandGateway';

describe('Project IO Worker Client', () => {
  it('validates State-to-Requirement endpoints before returning a metadata-only hydration payload', async () => {
    const repository = createEmptyRepository();
    repository.requirements.req = { id: 'req', kind: 'requirement', name: 'Requirement', namespace: [], requirementId: 'R', text: 'Must hold', status: 'draft', version: '1' };
    repository.relationships.link = { id: 'link', kind: 'satisfy', sourceId: 'state-active', targetId: 'req' };
    const payload = { projectName: 'Mixed model', states: [{ id: 'state-active', name: 'Active' }], sysmlRepository: repository };
    const loaded = await loadProjectInWorker(new TextEncoder().encode(JSON.stringify(payload)).buffer);
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.relationships.link).toMatchObject({ sourceId: 'state-active', targetId: 'req' });
    expect(loaded.stateEndpointSignature).toBeDefined();
    expect(loaded.rawPayload.sysmlRepository).toBeUndefined();
    expect(loaded.rawPayload.states).toEqual(payload.states);
  });
  it('returns the timestamp-free snapshot of the exact serialized file', async () => {
    let snapshot: string | undefined;
    const buffer = await serializeProjectInWorker({ projectName: 'Snapshot', timestamp: 'ignored', notes: ['saved'] }, {
      onSnapshot: value => { snapshot = value; },
    });
    const { timestamp: _timestamp, ...stable } = JSON.parse(new TextDecoder().decode(buffer));
    expect(snapshot).toBe(JSON.stringify(stable));
  });
  function createTestProjectBuffer(): { buffer: ArrayBuffer; payload: any } {
    const repo = createEmptyRepository();
    repo.definitions['b1'] = {
      id: 'b1', name: 'TestBlock', namespace: ['model'], ownerId: 'model', kind: 'block',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    const payload = buildCanonicalSysmlProjectPayload(createSysmlGatewayState(repo), {
      version: '1.0',
      projectName: 'Worker IO Test',
    });
    const str = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return { buffer: bytes.buffer, payload };
  }

  it('loads project and reports progress phases in order', async () => {
    const { buffer } = createTestProjectBuffer();
    const phases: ProgressPhase[] = [];

    const result = await loadProjectInWorker(buffer, {
      onProgress: phase => phases.push(phase),
    });

    expect(result.valid).toBe(true);
    expect(result.repository.definitions['b1'].name).toBe('TestBlock');
    expect(phases).toContain('parse');
    expect(phases).toContain('normalize');
    expect(phases).toContain('validate');
  });

  it('serializes project to ArrayBuffer and reports progress', async () => {
    const { payload } = createTestProjectBuffer();
    const phases: ProgressPhase[] = [];

    const buffer = await serializeProjectInWorker(payload, {
      onProgress: phase => phases.push(phase),
    });

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(phases).toContain('serialize');

    const text = new TextDecoder().decode(buffer);
    const parsed = JSON.parse(text);
    const envelope = typeof parsed.sysmlRepository === 'string' ? JSON.parse(parsed.sysmlRepository) : parsed.sysmlRepository;
    const repo = envelope.repository ?? envelope;
    expect(repo?.definitions?.['b1']?.name).toBe('TestBlock');
  });

  it('aborts operation when AbortSignal is cancelled', async () => {
    const { buffer } = createTestProjectBuffer();
    const controller = new AbortController();

    // Abort immediately
    controller.abort();

    await expect(loadProjectInWorker(buffer, { signal: controller.signal })).rejects.toThrow();
  });

  it('propagates syntax errors on corrupted payload', async () => {
    const corrupted = new TextEncoder().encode('{ not-valid-json ]').buffer;
    await expect(loadProjectInWorker(corrupted)).rejects.toThrow();
  });

  it('does not acknowledge a queued chunk after cancellation terminates the worker', async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, (event: any) => void>();
    const postMessage = vi.fn();
    const terminate = vi.fn();
    setCustomProjectIoWorkerFactory(() => ({
      addEventListener: (type: string, listener: any) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
      postMessage,
      terminate,
    } as unknown as Worker));
    try {
      const controller = new AbortController();
      const pending = loadProjectInWorker(new ArrayBuffer(0), { signal: controller.signal });
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      const id = postMessage.mock.calls[0][0].id;
      listeners.get('message')!({ data: { id, type: 'loadRepositoryStart', repository: createEmptyRepository() } });
      listeners.get('message')!({ data: { id, type: 'loadRepositoryChunk', sequence: 0, collection: 'definitions', entries: [] } });
      controller.abort();
      await rejected;
      await vi.runAllTimersAsync();
      expect(terminate).toHaveBeenCalledOnce();
      expect(postMessage.mock.calls.some(([message]) => message.type === 'loadChunkAck')).toBe(false);
    } finally {
      setCustomProjectIoWorkerFactory(null);
      vi.useRealTimers();
    }
  });

  it('assembles a streamed load with an empty coordinate record and acknowledges chunks', async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, (event: any) => void>();
    const postMessage = vi.fn();
    setCustomProjectIoWorkerFactory(() => ({
      addEventListener: (type: string, listener: any) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
      postMessage,
      terminate: vi.fn(),
    } as unknown as Worker));
    try {
      const pending = loadProjectInWorker(new ArrayBuffer(0));
      const id = postMessage.mock.calls[0][0].id;
      const emit = (data: any) => listeners.get('message')!({ data: { id, ...data } });
      emit({ type: 'loadRepositoryStart', repository: createEmptyRepository() });
      emit({ type: 'loadRepositoryChunk', sequence: 0, collection: 'definitions', entries: [['block1', { id: 'block1', name: 'Block 1' }]] });
      await vi.runAllTimersAsync();
      expect(postMessage).toHaveBeenCalledWith({ id, type: 'loadChunkAck', sequence: 0 });
      emit({ type: 'loadSuccess', result: { valid: true, diagnostics: [], rawPayload: { projectName: 'Streamed' } } });
      const result = await pending;
      expect(result.repository.definitions.block1.name).toBe('Block 1');
      expect(result.coordinates).toEqual({});
      expect(result.rawPayload.projectName).toBe('Streamed');
    } finally {
      setCustomProjectIoWorkerFactory(null);
      vi.useRealTimers();
    }
  });
});
