/**
 * SysML Worker Factory
 * Provides Vite- and Electron-compatible worker instantiation with a clean seam
 * for runtime injection, test stubbing, and fallback detection.
 */

export type SysmlWorkerFactoryFn = () => Worker;

let customWorkerFactory: SysmlWorkerFactoryFn | null = null;

/**
 * Configure an explicit worker factory for Electron, testing, or custom runtimes.
 * Set to null to restore default environment detection.
 */
export function setCustomWorkerFactory(factory: SysmlWorkerFactoryFn | null): void {
  customWorkerFactory = factory;
}

/**
 * Check whether a Web Worker can be instantiated in the current environment.
 */
export function isWorkerSupported(): boolean {
  if (customWorkerFactory !== null) return true;
  return typeof Worker !== 'undefined';
}

/**
 * Instantiate a new dedicated SysML Web Worker.
 * Uses ES module syntax compatible with Vite and modern Chromium / Electron.
 */
export function createSysmlWorker(): Worker {
  if (customWorkerFactory) {
    return customWorkerFactory();
  }

  if (typeof Worker !== 'undefined') {
    return new Worker(new URL('../engine/sysml/sysmlWorker.ts', import.meta.url), {
      type: 'module',
    });
  }

  throw new Error('Web Workers are not supported in this runtime environment');
}
