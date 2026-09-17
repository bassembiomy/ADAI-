import { VLabPhysicsEngine } from './vlabPhysics';
import type { VLabWorkerRequest, VLabWorkerResponse } from './vlabWorkerProtocol';

let engine: VLabPhysicsEngine | null = null;
let configurationId = '';

self.onmessage = (event: MessageEvent<VLabWorkerRequest | { type: 'cancel' | 'reset'; kind?: string }>) => {
  const request = event.data as any;
  if (!request) return;

  if (request.type === 'cancel' || request.kind === 'cancel') {
    return;
  }
  if (request.type === 'reset' || request.kind === 'reset') {
    engine = null;
    configurationId = '';
    return;
  }

  try {
    if (!engine || configurationId !== request.configuration.id) {
      engine = new VLabPhysicsEngine(request.configuration);
      configurationId = request.configuration.id;
    } else {
      engine.updateConfiguration(request.configuration);
    }
    const state = engine.simulateStep(request.nodes, request.edges, request.previousState, request.dt);
    self.postMessage({ requestId: request.requestId, state } satisfies VLabWorkerResponse);
  } catch (error) {
    self.postMessage({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error)
    } satisfies VLabWorkerResponse);
  }
};
