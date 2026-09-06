// src/components/entropy/OpmDockState.ts
export type OpmPage = 'model' | 'simulate' | 'review';
export interface OpmDocks { left: boolean; right: boolean; bottom: boolean; rightTab: string; page: OpmPage; }
export const DOCK_KEY = 'opm.docks.v1';
export const DEFAULT_DOCKS: OpmDocks = { left: true, right: true, bottom: true, rightTab: 'simControl', page: 'model' };
export const PAGE_PRESETS: Record<OpmPage, OpmDocks> = {
  model: { ...DEFAULT_DOCKS, page: 'model', bottom: false, rightTab: 'simControl' },
  simulate: { ...DEFAULT_DOCKS, page: 'simulate', bottom: true, rightTab: 'simControl' },
  review: { ...DEFAULT_DOCKS, page: 'review', bottom: true, rightTab: 'opmCodegen' },
};
// Module-level memory fallback for non-DOM runtimes (e.g. vitest node
// environment where `localStorage` is undefined). Mirrors the localStorage
// round-trip so loadDocks/saveDocks stay testable; browsers use localStorage.
const memoryStore = new Map<string, string>();
function storage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* ignore */ }
  return {
    getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k)! : null),
    setItem: (k, v) => { memoryStore.set(k, v); },
  };
}
export function loadDocks(): OpmDocks {
  try {
    const s = storage();
    const raw = s?.getItem(DOCK_KEY);
    if (!raw) return DEFAULT_DOCKS;
    return { ...DEFAULT_DOCKS, ...(JSON.parse(raw) as Partial<OpmDocks>) };
  } catch { return DEFAULT_DOCKS; }
}
export function saveDocks(d: OpmDocks): void {
  try { storage()?.setItem(DOCK_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
