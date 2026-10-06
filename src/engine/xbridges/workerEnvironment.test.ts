import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('X-Bridges worker module environment', () => {
  for (const modulePath of ['./xbridgesWorker', '../../services/xbridgesAnalysisWorker']) {
    it(`preserves the window message handler when importing ${modulePath} for shared helpers`, async () => {
      vi.resetModules();
      const originalHandler = vi.fn();
      const browserWindow = { onmessage: originalHandler, postMessage: vi.fn() };
      vi.stubGlobal('window', browserWindow);
      vi.stubGlobal('self', browserWindow);
      await import(modulePath);
      expect(browserWindow.onmessage).toBe(originalHandler);
      expect(browserWindow.postMessage).not.toHaveBeenCalled();
    });

    it(`registers its message handler inside a worker for ${modulePath}`, async () => {
      vi.resetModules();
      vi.stubGlobal('window', undefined);
      const workerScope = { onmessage: undefined, postMessage: vi.fn() };
      vi.stubGlobal('self', workerScope);
      await import(modulePath);
      expect(workerScope.onmessage).toEqual(expect.any(Function));
    });
  }
});
