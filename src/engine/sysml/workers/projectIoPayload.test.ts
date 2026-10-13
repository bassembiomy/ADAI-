import { describe, expect, it } from 'vitest';
import {
  appendRepositoryChunk,
  appendCoordinateChunk,
  createRepositoryStreamBase,
  streamEntriesInChunks,
  stripCanonicalPayloadForHydration,
  projectStateEndpointSignature,
  projectStateEndpoints,
  hasMatchingProjectStateContext,
} from './projectIoPayload';
import { createEmptyRepository } from '../model';
import { loadCanonicalSysmlProject } from '../../../services/sysmlCommandGateway';

describe('stripCanonicalPayloadForHydration', () => {
  it('revalidates a contextual preload when all states have been removed', () => {
    const repository = createEmptyRepository();
    repository.requirements.req1 = { id: 'req1', name: 'Req 1', kind: 'requirement', namespace: [],
      requirementId: 'REQ-1', text: 'Must hold', status: 'draft', version: '1' };
    repository.relationships.link = { id: 'link', kind: 'satisfy', sourceId: 'state-active', targetId: 'req1' };
    const states = [{ id: 'state-active', name: 'Active' }];
    const loaded = loadCanonicalSysmlProject({ states, sysmlRepository: repository }, { externalEndpoints: projectStateEndpoints(states) });
    expect(loaded.valid).toBe(true);
    const signature = projectStateEndpointSignature(states);
    const incoming = { states: [], sysmlRepository: loaded.repository };
    expect(hasMatchingProjectStateContext(signature, incoming.states)).toBe(false);
    expect(hasMatchingProjectStateContext(undefined, incoming.states)).toBe(false);
    expect(hasMatchingProjectStateContext(projectStateEndpointSignature([]), incoming.states)).toBe(true);
    expect(stripCanonicalPayloadForHydration(incoming, true, signature)).toBe(incoming);
    const revalidated = loadCanonicalSysmlProject(incoming, { externalEndpoints: projectStateEndpoints(incoming.states) });
    expect(revalidated.repository.relationships.link).toBeUndefined();
  });
  it('strips a contextual graph only when its validated endpoint signature matches', () => {
    const payload = { states: [{ id: 'state-1', name: 'Active' }], sysmlRepository: createEmptyRepository() };
    const signature = projectStateEndpointSignature(payload.states);
    expect(stripCanonicalPayloadForHydration(payload, true, signature)).toEqual({ states: payload.states });
    expect(stripCanonicalPayloadForHydration(payload, true, projectStateEndpointSignature([{ id: 'state-2' }]))).toBe(payload);
    expect(stripCanonicalPayloadForHydration(payload, false, signature)).toBe(payload);
  });
  it('keeps a State-to-Requirement link through the renderer contextual reload', () => {
    const repository = createEmptyRepository();
    repository.requirements.req1 = { id: 'req1', name: 'Req 1', kind: 'requirement', namespace: [],
      requirementId: 'REQ-1', text: 'Must hold', status: 'draft', version: '1' };
    repository.relationships.link = { id: 'link', kind: 'satisfy', sourceId: 'state-active', targetId: 'req1' };
    const payload = { states: [{ id: 'state-active', name: 'Active' }], sysmlRepository: repository };
    const workerResult = loadCanonicalSysmlProject(payload);
    const hydrationPayload = stripCanonicalPayloadForHydration(payload, workerResult.valid);
    const reloaded = loadCanonicalSysmlProject(hydrationPayload, {
      externalEndpoints: new Map([['state-active', { id: 'state-active', name: 'Active', family: 'state' as const }]]),
    });
    expect(reloaded.repository.requirements.req1.id).toBe('req1');
    expect(reloaded.repository.relationships.link).toMatchObject({ sourceId: 'state-active', targetId: 'req1' });
    expect(reloaded.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
  it('retains the original graph when state endpoints require renderer revalidation', () => {
    const payload = { states: [{ id: 'state-1' }], sysmlRepository: { relationships: { satisfy: { sourceId: 'state-1' } } } };
    expect(stripCanonicalPayloadForHydration(payload)).toBe(payload);
  });

  it('retains the original graph when the preloaded result cannot be applied', () => {
    const payload = { sysmlRepository: { definitions: { block1: { id: 'block1' } } } };
    expect(stripCanonicalPayloadForHydration(payload, false)).toBe(payload);
  });
  it('removes canonical SysML graphs already returned in the loaded result', () => {
    const payload = {
      projectName: 'Large model',
      workspaceFiles: [],
      sysmlRepository: { definitions: { block1: { id: 'block1' } } },
      canonicalSysmlRepository: { definitions: { block2: { id: 'block2' } } },
      sysmlCoordinates: { diagram: { block1: { x: 10, y: 20 } } },
      coordinates: { diagram: { block1: { x: 10, y: 20 } } },
      diagramPresentations: { diagram: { elementIds: ['block1'] } },
    };

    const metadata = stripCanonicalPayloadForHydration(payload);

    expect(metadata).toEqual({ projectName: 'Large model', workspaceFiles: [] });
    expect(payload.sysmlRepository.definitions.block1.id).toBe('block1');
  });

  it('reassembles streamed repository collections without replacing prior chunks', () => {
    const repository = createEmptyRepository();
    repository.revision = 12;
    const streamed = createRepositoryStreamBase(repository);

    appendRepositoryChunk(streamed, 'definitions', [
      ['block-1', { id: 'block-1', name: 'Block 1' }],
    ]);
    appendRepositoryChunk(streamed, 'definitions', [
      ['block-2', { id: 'block-2', name: 'Block 2' }],
    ]);
    appendRepositoryChunk(streamed, 'requirements', [
      ['req-1', { id: 'req-1', name: 'Requirement 1' }],
    ]);

    expect(streamed.revision).toBe(12);
    expect(Object.keys(streamed.definitions)).toEqual(['block-1', 'block-2']);
    expect(streamed.requirements['req-1']?.name).toBe('Requirement 1');
  });

  it('reassembles coordinate chunks by diagram', () => {
    const coordinates: Record<string, Record<string, { x: number; y: number }>> = {};
    appendCoordinateChunk(coordinates, [
      ['diagram-1', { block1: { x: 10, y: 20 } }],
    ]);
    appendCoordinateChunk(coordinates, [
      ['diagram-2', { block2: { x: 30, y: 40 } }],
    ]);

    expect(coordinates).toEqual({
      'diagram-1': { block1: { x: 10, y: 20 } },
      'diagram-2': { block2: { x: 30, y: 40 } },
    });
  });

  it('yields between streamed chunks so the renderer can service heartbeats', async () => {
    const emitted: number[][] = [];
    let yields = 0;

    await streamEntriesInChunks(
      [1, 2, 3, 4, 5],
      2,
      chunk => { emitted.push([...chunk]); },
      async () => { yields += 1; },
    );

    expect(emitted).toEqual([[1, 2], [3, 4], [5]]);
    expect(yields).toBe(2);
  });

  it('waits for asynchronous chunk delivery before emitting the next chunk', async () => {
    const order: string[] = [];
    await streamEntriesInChunks(
      [1, 2],
      1,
      async chunk => {
        order.push(`start-${chunk[0]}`);
        await Promise.resolve();
        order.push(`end-${chunk[0]}`);
      },
      async () => { order.push('yield'); },
    );

    expect(order).toEqual(['start-1', 'end-1', 'yield', 'start-2', 'end-2']);
  });
});
