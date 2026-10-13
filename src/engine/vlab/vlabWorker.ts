import { createVLabWorkerHandler } from './vlabWorkerCore';
import type { VLabWorkerResponse } from './vlabWorkerProtocol';

const handle = createVLabWorkerHandler((message: VLabWorkerResponse) => self.postMessage(message));

self.onmessage = (event: MessageEvent) => handle(event.data);
