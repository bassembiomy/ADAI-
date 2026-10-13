import { loadCanonicalSysmlProject } from '../../../services/sysmlCommandGateway';
import { serializeSysmlProjectState } from '../persistence';
import { createProjectSnapshot } from '../../../utils/adiaProjectPersistence';
import {
  isChunkedProjectContainer,
  decodeChunkedManifest,
  readChunkFromContainer,
  encodeChunkedProject,
  type EntityChunk,
  type DiagramChunk,
} from '../persistence/chunkedProjectFormat';
import { type SysmlRepository, createEmptyRepository } from '../model';
import {
  createRepositoryStreamBase,
  STREAMED_REPOSITORY_COLLECTIONS,
  streamEntriesInChunks,
  stripCanonicalPayloadForHydration,
  projectStateEndpoints,
  projectStateEndpointSignature,
} from './projectIoPayload';

export type ProgressPhase = 'read' | 'parse' | 'migrate' | 'normalize' | 'validate' | 'serialize';

export type ProjectWorkerRequest =
  | { id: string; type: 'load'; buffer: ArrayBuffer }
  | { id: string; type: 'serialize'; payload: any; includeSnapshot?: boolean }
  | { id: string; type: 'loadChunkAck'; sequence: number }
  | { id: string; type: 'cancel' };

export type ProjectWorkerResponse =
  | { id: string; type: 'progress'; phase: ProgressPhase }
  | { id: string; type: 'loadRepositoryStart'; repository: SysmlRepository }
  | { id: string; type: 'loadRepositoryChunk'; sequence: number; collection: string; entries: [string, any][] }
  | { id: string; type: 'loadCoordinateChunk'; sequence: number; entries: [string, any][] }
  | { id: string; type: 'loadSuccess'; result: any }
  | { id: string; type: 'serializeSuccess'; buffer: ArrayBuffer; snapshot?: string }
  | { id: string; type: 'error'; message: string };

const cancelledIds = new Set<string>();
const pendingChunkAcks = new Map<string, () => void>();

if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.addEventListener('message', async (event: MessageEvent<ProjectWorkerRequest>) => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'loadChunkAck') {
      const key = `${data.id}:${data.sequence}`;
      pendingChunkAcks.get(key)?.();
      pendingChunkAcks.delete(key);
      return;
    }

    if (data.type === 'cancel') {
      cancelledIds.add(data.id);
      return;
    }

    if (data.type === 'load') {
      try {
        if (cancelledIds.has(data.id)) return;
        self.postMessage({ id: data.id, type: 'progress', phase: 'read' });

        if (isChunkedProjectContainer(data.buffer)) {
          if (cancelledIds.has(data.id)) return;
          self.postMessage({ id: data.id, type: 'progress', phase: 'parse' });
          const manifest = decodeChunkedManifest(data.buffer);

          if (cancelledIds.has(data.id)) return;
          self.postMessage({ id: data.id, type: 'progress', phase: 'migrate' });

          if (cancelledIds.has(data.id)) return;
          self.postMessage({ id: data.id, type: 'progress', phase: 'normalize' });

          const definitions: Record<string, any> = {};
          for (const chunkMeta of manifest.entityChunkTable) {
            if (cancelledIds.has(data.id)) return;
            const chunk = readChunkFromContainer<EntityChunk>(data.buffer, chunkMeta);
            Object.assign(definitions, chunk.entities);
          }

          const coordinates: Record<string, any> = {};
          const diagramPresentations: Record<string, any> = {};
          for (const diagId in manifest.diagramMembershipTable) {
            const diagMeta = manifest.diagramMembershipTable[diagId];
            const diagChunk = readChunkFromContainer<DiagramChunk>(data.buffer, diagMeta);
            Object.assign(coordinates, diagChunk.coordinates);
            Object.assign(diagramPresentations, diagChunk.presentations);
          }

          const repository: SysmlRepository = {
            ...createEmptyRepository(),
            definitions,
          };

          if (cancelledIds.has(data.id)) return;
          self.postMessage({ id: data.id, type: 'progress', phase: 'validate' });

          self.postMessage({
            id: data.id,
            type: 'loadSuccess',
            result: {
              repository,
              coordinates,
              diagramPresentations,
              valid: true,
              diagnostics: [],
              upgradeReport: { upgraded: false },
              interchangeReport: null,
              rawPayload: {
                projectName: manifest.projectName,
                version: manifest.schemaVersion,
                sysmlRepository: repository,
                diagramPresentations,
                coordinates,
                stateMachine: manifest.stateMachine,
                diagramWorkspace: manifest.diagramWorkspace,
              },
            },
          });
          return;
        }

        const decoder = new TextDecoder('utf-8');
        const jsonText = decoder.decode(data.buffer);

        if (cancelledIds.has(data.id)) return;
        self.postMessage({ id: data.id, type: 'progress', phase: 'parse' });
        const parsed = JSON.parse(jsonText);

        if (cancelledIds.has(data.id)) return;
        self.postMessage({ id: data.id, type: 'progress', phase: 'migrate' });

        if (cancelledIds.has(data.id)) return;
        self.postMessage({ id: data.id, type: 'progress', phase: 'normalize' });
        const loaded = loadCanonicalSysmlProject(parsed, { externalEndpoints: projectStateEndpoints(parsed.states) });
        const stateEndpointSignature = projectStateEndpointSignature(parsed.states);

        if (cancelledIds.has(data.id)) return;
        self.postMessage({ id: data.id, type: 'progress', phase: 'validate' });

        self.postMessage({
          id: data.id,
          type: 'loadRepositoryStart',
          repository: createRepositoryStreamBase(loaded.repository),
        });
        const streamChunkSize = 250;
        const yieldBetweenChunks = () => new Promise<void>(resolve => setTimeout(resolve, 1));
        let chunkSequence = 0;
        const postChunkWithBackpressure = (message: Record<string, any>) => new Promise<void>(resolve => {
          const sequence = chunkSequence++;
          pendingChunkAcks.set(`${data.id}:${sequence}`, resolve);
          self.postMessage({ ...message, id: data.id, sequence });
        });
        for (const collection of STREAMED_REPOSITORY_COLLECTIONS) {
          const entries = Object.entries(loaded.repository[collection]);
          await streamEntriesInChunks(entries, streamChunkSize, chunk => postChunkWithBackpressure({
            type: 'loadRepositoryChunk', collection, entries: chunk,
          }), yieldBetweenChunks);
          if (cancelledIds.has(data.id)) return;
        }

        const coordinateEntries = Object.entries(loaded.coordinates);
        const coordinateChunkSize = 100;
        await streamEntriesInChunks(coordinateEntries, coordinateChunkSize, chunk => postChunkWithBackpressure({
          type: 'loadCoordinateChunk', entries: chunk,
        }), yieldBetweenChunks);
        if (cancelledIds.has(data.id)) return;

        self.postMessage({
          id: data.id,
          type: 'loadSuccess',
          result: {
            diagramPresentations: loaded.diagramPresentations,
            stateEndpointSignature,
            valid: loaded.valid,
            diagnostics: loaded.diagnostics,
            upgradeReport: loaded.upgradeReport,
            interchangeReport: loaded.interchangeReport,
            rawPayload: stripCanonicalPayloadForHydration(parsed, loaded.valid, stateEndpointSignature),
          },
        });
      } catch (err: any) {
        self.postMessage({
          id: data.id,
          type: 'error',
          message: err?.message || 'Failed to load project in worker',
        });
      } finally {
        cancelledIds.delete(data.id);
      }
      return;
    }

    if (data.type === 'serialize') {
      try {
        if (cancelledIds.has(data.id)) return;
        self.postMessage({ id: data.id, type: 'progress', phase: 'serialize' });

        let payloadToSerialize = data.payload;
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

        const defCount = Object.keys(payloadToSerialize?.sysmlRepository?.definitions ?? {}).length;
        if (defCount > 50_000 || data.payload?.format === 'chunked') {
          const buffer = encodeChunkedProject({
            projectName: payloadToSerialize.projectName,
            schemaVersion: payloadToSerialize.version ?? '1.0',
            repository: payloadToSerialize.sysmlRepository,
            coordinates: payloadToSerialize.sysmlCoordinates ?? payloadToSerialize.coordinates,
            diagramPresentations: payloadToSerialize.diagramPresentations,
            stateMachine: payloadToSerialize.stateMachine,
            diagramWorkspace: payloadToSerialize.diagramWorkspace,
            chunkSize: 1000,
            metadata: payloadToSerialize.metadata,
          });

          (self as any).postMessage(
            {
              id: data.id,
              type: 'serializeSuccess',
              buffer,
            },
            [buffer],
          );
          return;
        }

        const jsonText = JSON.stringify(payloadToSerialize);
        const snapshot = data.includeSnapshot ? createProjectSnapshot(payloadToSerialize) : undefined;
        const encoder = new TextEncoder();
        const encoded = encoder.encode(jsonText);
        const buffer = encoded.buffer;

        (self as any).postMessage(
          {
            id: data.id,
            type: 'serializeSuccess',
            buffer,
            snapshot,
          },
          [buffer],
        );
      } catch (err: any) {
        self.postMessage({
          id: data.id,
          type: 'error',
          message: err?.message || 'Failed to serialize project in worker',
        });
      } finally {
        cancelledIds.delete(data.id);
      }
      return;
    }
  });
}
