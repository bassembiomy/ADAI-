// Regression: "Failed to execute 'postMessage' on 'Worker': (_, p) => {...} could not be cloned" when saving a project
// after dropping an X-Bridges block (its node data carries the block's execute function and UI callbacks).
import { afterEach, describe, expect, it } from 'vitest';
import { serializeProjectInWorker, setCustomProjectIoWorkerFactory } from './projectIoClient';
import { BLOCK_LIBRARY } from '../../xbridges/BlockDefinitions';

/** A worker whose postMessage clones like a browser worker and answers like projectIo.worker (JSON file). */
function cloningWorker(received: unknown[]) {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  return {
    addEventListener: (type: string, fn: (e: any) => void) => { (listeners[type] ??= []).push(fn); },
    removeEventListener: (type: string, fn: (e: any) => void) => { listeners[type] = (listeners[type] ?? []).filter(f => f !== fn); },
    terminate: () => {},
    postMessage: (message: any) => {
      const copy = structuredClone(message); // throws DataCloneError on functions, like the browser
      received.push(copy);
      if (copy.type !== 'serialize') return;
      const text = JSON.stringify(copy.payload);
      const buffer = new TextEncoder().encode(text).buffer;
      queueMicrotask(() => (listeners.message ?? []).forEach(fn => fn({ data: { id: copy.id, type: 'serializeSuccess', buffer, snapshot: text } })));
    },
  } as unknown as Worker;
}

describe('saving a project whose X-Bridges nodes hold live block objects', () => {
  afterEach(() => setCustomProjectIoWorkerFactory(null));

  it('saves the same content a JSON file would hold, instead of failing to clone functions', async () => {
    const block = BLOCK_LIBRARY.Constant('c1', { value: 5 });
    expect(typeof (block as any).execute).toBe('function');
    const node = { id: 'c1', type: 'xblock', position: { x: 1, y: 2 }, data: { ...block, onUpdate: () => {}, parentId: null } };
    const payload = { projectName: 'P', globalXBridgesNodes: [node], states: [{ id: 's', xBridgesModel: { nodes: [node] } }], n: 0, flag: false, nothing: null };
    const received: any[] = [];
    setCustomProjectIoWorkerFactory(() => cloningWorker(received));

    const buffer = await serializeProjectInWorker(payload);
    const saved = JSON.parse(new TextDecoder().decode(buffer));
    expect(saved).toEqual(JSON.parse(JSON.stringify(payload)));
    expect(saved.globalXBridgesNodes[0].data.execute).toBeUndefined();
    expect(saved.globalXBridgesNodes[0].data.outputs[0].id).toBe('out');
    expect(saved.globalXBridgesNodes[0].data.params).toEqual({ value: 5 });
    // the caller's live objects are left untouched
    expect(typeof (payload.globalXBridgesNodes[0].data as any).execute).toBe('function');
  });

  it('posts the payload unchanged when it is already cloneable', async () => {
    const received: any[] = [];
    setCustomProjectIoWorkerFactory(() => cloningWorker(received));
    const payload = { projectName: 'P', list: [1, 'a', { b: [true, null] }] };
    await serializeProjectInWorker(payload);
    expect(received[0].payload).toEqual(payload);
  });
});
