import { useMemo } from 'react';
import type { XBMappingV1 } from '../../utils/stateMachine/xbModel';
import { syncXBBoundaryNodeMetadata } from '../../utils/stateMachine/xbBoundaryMappings';

/**
 * Inputs for XbridgesWorkspace (the state-embedded model when `xBridgesStateId` is set, else the global canvas).
 * They keep their identity until the stored model itself changes: the workspace re-imports `initialNodes`/`initialEdges`
 * whenever their identity changes, so a fresh array on every App render (e.g. while adding a variable) would overwrite
 * edits that its 300 ms debounced save has not stored yet.
 */
export function useXBridgesWorkspaceInputs(
  states: readonly { id: string; xBridgesModel?: { nodes?: readonly any[]; edges?: readonly any[]; mappings?: readonly XBMappingV1[] } }[],
  xBridgesStateId: string | null | undefined,
  globalXBridgesNodes: readonly any[],
  globalXBridgesEdges: readonly any[],
): { initialNodes: any[]; initialEdges: any[]; initialMappings: XBMappingV1[] } {
  const model = xBridgesStateId ? states.find(state => state.id === xBridgesStateId)?.xBridgesModel : undefined;
  const sourceNodes = xBridgesStateId ? model?.nodes : globalXBridgesNodes;
  const sourceEdges = xBridgesStateId ? model?.edges : globalXBridgesEdges;
  const sourceMappings = xBridgesStateId ? model?.mappings : undefined;
  const initialMappings = useMemo(() => Array.from(sourceMappings ?? []), [sourceMappings]);
  const initialNodes = useMemo(() => syncXBBoundaryNodeMetadata(Array.from(sourceNodes ?? []), initialMappings), [sourceNodes, initialMappings]);
  const initialEdges = useMemo(() => Array.from(sourceEdges ?? []), [sourceEdges]);
  return { initialNodes, initialEdges, initialMappings };
}

/**
 * Pending-save registry. The workspace stores its canvas in the project through a 300 ms debounce; the App's Save
 * calls `flushXBridgesPendingSave()` first so the file holds the canvas as it is now, not as it was 300 ms ago.
 */
interface SaveFlusher { flush: () => void; discard: () => void }
const pendingSaveFlushers = new Set<SaveFlusher>();
export function registerXBridgesSaveFlusher(flush: () => void, discard: () => void = () => undefined): () => void {
  const entry = { flush, discard };
  pendingSaveFlushers.add(entry);
  return () => { pendingSaveFlushers.delete(entry); };
}
export function flushXBridgesPendingSave(): void {
  for (const entry of Array.from(pendingSaveFlushers)) entry.flush();
}
/** Drops the unsaved canvas edits of every mounted workspace: a project that replaces the model must not be overwritten by them. */
export function discardXBridgesPendingSave(): void {
  for (const entry of Array.from(pendingSaveFlushers)) entry.discard();
}

/**
 * True when two node lists differ only in run state (`data.state`, refreshed every few steps while a simulation runs).
 * Run state is not an edit: it must neither restart the debounce nor count as a pending change.
 */
export function nodesDifferOnlyInRunState(prev: readonly any[], next: readonly any[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i], b = next[i];
    if (a === b) continue;
    if (!a || !b) return false;
    const aKeys = Object.keys(a), bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (k === 'data') continue;
      if (a[k] !== b[k]) return false;
    }
    const ad = a.data, bd = b.data;
    if (ad === bd) continue;
    if (!ad || !bd) return false;
    const adKeys = Object.keys(ad), bdKeys = Object.keys(bd);
    if (adKeys.length !== bdKeys.length) return false;
    for (const k of adKeys) {
      if (k === 'state') continue;
      if (ad[k] !== bd[k]) return false;
    }
  }
  return true;
}
