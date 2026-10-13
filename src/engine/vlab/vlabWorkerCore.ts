import { VLabPhysicsEngine } from './vlabPhysics';
import { serializeVLabError } from './vlabDiagnostics';
import type { VLabWorkerControl, VLabWorkerRequest, VLabWorkerResponse } from './vlabWorkerProtocol';

/**
 * The message handler of the V-Lab worker, free of `self` so it can be driven by a test (and by the real worker, vlabWorker.ts).
 *
 *  - every failure is posted as {requestId, error: message, diagnostic: VLabDiagnostic}: the typed record of the error class, never a
 *    bare string and never swallowed;
 *  - a step runs with the cancel check of its request (the shared flag, or `isCancelled` for hosts without SharedArrayBuffer): a cancelled
 *    step stops within one solver attempt and answers with a CANCELLED diagnostic;
 *  - progress is posted while a long step runs (throttled);
 *  - the engine is deterministic: the same request twice answers with bit-identical state (no wall-clock value enters the result).
 */
export function createVLabWorkerHandler(
  post: (message: VLabWorkerResponse) => void,
  options: { isCancelled?: (requestId: number) => boolean; progressIntervalMs?: number } = {},
) {
  let engine: VLabPhysicsEngine | null = null;
  let configurationId = '';
  const cancelled = new Set<number>();

  return (request: VLabWorkerRequest | VLabWorkerControl | null | undefined): void => {
    const message = request as any;
    if (!message) return;

    if (message.type === 'cancel' || message.kind === 'cancel') {
      if (typeof message.requestId === 'number') cancelled.add(message.requestId);
      return;
    }
    if (message.type === 'reset' || message.kind === 'reset') {
      engine = null;
      configurationId = '';
      cancelled.clear();
      return;
    }

    const req = message as VLabWorkerRequest;
    try {
      if (!engine || configurationId !== req.configuration.id) {
        engine = new VLabPhysicsEngine(req.configuration);
        configurationId = req.configuration.id;
      } else {
        engine.updateConfiguration(req.configuration);
      }
      const flag = req.cancelFlag;
      engine.setCancellation(() =>
        cancelled.has(req.requestId)
        || (flag !== undefined && Atomics.load(flag, 0) === req.requestId)
        || (options.isCancelled?.(req.requestId) ?? false));
      engine.setProgress(progress => post({ requestId: req.requestId, type: 'progress', progress }), options.progressIntervalMs ?? 100);
      const state = engine.simulateStep(req.nodes, req.edges, req.previousState, req.dt);
      post({ requestId: req.requestId, state });
    } catch (error) {
      const diagnostic = serializeVLabError(error);
      post({ requestId: req.requestId, error: diagnostic.message, diagnostic });
    } finally {
      engine?.setCancellation(null);
      engine?.setProgress(null);
      cancelled.delete(req.requestId);
    }
  };
}
