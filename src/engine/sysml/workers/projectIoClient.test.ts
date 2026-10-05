import { describe, it, expect, vi } from 'vitest';
import {
  loadProjectInWorker,
  serializeProjectInWorker,
  type ProgressPhase,
} from './projectIoClient';
import { createEmptyRepository } from '../model';
import { buildCanonicalSysmlProjectPayload, createSysmlGatewayState } from '../../../services/sysmlCommandGateway';

describe('Project IO Worker Client', () => {
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
});
