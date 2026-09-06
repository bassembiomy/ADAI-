import { validateOpmPortConnection } from './OpmPortContracts';
import type { AppEdge, AppNode, OPMLinkType } from './EntropyTypes';
export function getValidTargetNodeIds(nodes: AppNode[], edges: AppEdge[], sourceId: string, linkType: OPMLinkType): string[] {
  return nodes
    .filter(n => n.id !== sourceId)
    .filter(n => validateOpmPortConnection(nodes, edges, { source: sourceId, target: n.id }, linkType).valid)
    .map(n => n.id);
}
