import { loadCanonicalSysmlProject } from '../../../services/sysmlCommandGateway';

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

        const jsonText = JSON.stringify(data.payload);
        const encoder = new TextEncoder();
        const encoded = encoder.encode(jsonText);
        const buffer = encoded.buffer;

        self.postMessage(
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
