import { loadCanonicalSysmlProject } from '../../../services/sysmlCommandGateway';
import { serializeSysmlProjectState } from '../persistence';
import {
  isChunkedProjectContainer,
  decodeChunkedManifest,
  readChunkFromContainer,
  encodeChunkedProject,
  type EntityChunk,
  type DiagramChunk,
} from '../persistence/chunkedProjectFormat';
import { type SysmlRepository, createEmptyRepository } from '../model';

export type ProgressPhase = 'read' | 'parse' | 'migrate' | 'normalize' | 'validate' | 'serialize';

export type ProjectWorkerRequest =
  | { id: string; type: 'load'; buffer: ArrayBuffer }
  | { id: string; type: 'serialize'; payload: any }
  | { id: string; type: 'cancel' };

export type ProjectWorkerResponse =
  | { id: string; type: 'progress'; phase: ProgressPhase }
  | { id: string; type: 'loadSuccess'; result: any }
  | { id: string; type: 'serializeSuccess'; buffer: ArrayBuffer }
  | { id: string; type: 'error'; message: string };

const cancelledIds = new Set<string>();

if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
  self.addEventListener('message', (event: MessageEvent<ProjectWorkerRequest>) => {
    const data = event.data;
    if (!data) return;

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
        const loaded = loadCanonicalSysmlProject(parsed);

        if (cancelledIds.has(data.id)) return;
        self.postMessage({ id: data.id, type: 'progress', phase: 'validate' });

        self.postMessage({
          id: data.id,
          type: 'loadSuccess',
          result: {
            repository: loaded.repository,
            coordinates: loaded.coordinates,
            diagramPresentations: loaded.diagramPresentations,
            valid: loaded.valid,
            diagnostics: loaded.diagnostics,
            upgradeReport: loaded.upgradeReport,
            interchangeReport: loaded.interchangeReport,
            rawPayload: parsed,
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
        const encoder = new TextEncoder();
        const encoded = encoder.encode(jsonText);
        const buffer = encoded.buffer;

        (self as any).postMessage(
          {
            id: data.id,
            type: 'serializeSuccess',
            buffer,
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
