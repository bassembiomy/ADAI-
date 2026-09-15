import { VLabPhysicsEngine } from './vlabPhysics';
import type { VLabWorkerRequest, VLabWorkerResponse } from './vlabWorkerProtocol';

let engine: VLabPhysicsEngine | null = null;
let configurationId = '';

self.onmessage = (event: MessageEvent<VLabWorkerRequest>) => {
  const request = event.data;
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
