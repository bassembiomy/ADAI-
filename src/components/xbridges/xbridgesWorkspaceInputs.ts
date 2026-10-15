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
