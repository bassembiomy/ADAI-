/**
 * Smart Show view derivation: every classic SysML diagram view is derived
 * from the single OPM model (ISO 19450) instead of being authored separately.
 *  - Structure view      (replaces SysML BDD)  ← aggregation/generalization links
 *  - Internal view       (replaces SysML IBD)  ← a process and its procedural links
 *  - Behavior view       (replaces state machine) ← result/effect/consumption per object
 *  - Requirements view   (replaces requirements diagram) ← satisfies/verifies links
 * Pure TypeScript, no React.
 */
import type { AppNode, AppEdge, OPMLinkType, OPMNodeType } from './EntropyTypes';

export interface OpmStructureNode {
  id: string;
  name: string;
  kind: 'object' | 'requirement';
  physical: boolean;
  children: OpmStructureNode[];
}

export function deriveStructureView(nodes: AppNode[], edges: AppEdge[]): OpmStructureNode[] {
  const byId = new Map(nodes.map(n => [n.id, n] as const));
  const structural = edges.filter(
    e => e.data?.type === 'aggregation' || e.data?.type === 'generalization'
  );
  const childIds = new Set(structural.map(e => e.target));
  const visited = new Set<string>();

  const build = (n: AppNode): OpmStructureNode => {
    visited.add(n.id);
    return {
      id: n.id,
      name: n.data.name,
      kind: n.data.type === 'requirement' ? 'requirement' : 'object',
      physical: !!n.data.physical,
      children: structural
        .filter(e => e.source === n.id)
        .map(e => byId.get(e.target))
        .filter((c): c is AppNode => !!c && !visited.has(c.id))
        .map(build),
    };
  };

  return nodes
    .filter(n => n.data.type === 'object' && !childIds.has(n.id))
    .map(build);
}

export interface OpmBehaviorTransition {
  processId: string;
  processName: string;
  fromStateId: string | null;
  toStateId: string | null;
  kind: 'result' | 'effect' | 'consumption';
}

export interface OpmBehaviorObject {
  objectId: string;
  objectName: string;
  stateIds: string[];
  transitions: OpmBehaviorTransition[];
}

export function deriveBehaviorView(nodes: AppNode[], edges: AppEdge[]): OpmBehaviorObject[] {
  const nodeById = new Map(nodes.map(n => [n.id, n] as const));
  return nodes
    .filter(n => n.data.type === 'object')
    .map(obj => {
      const childStates = nodes.filter(
        n => n.data.type === 'state' && (n.parentId === obj.id || n.data.parentId === obj.id)
      );
      const stateIds = new Set(childStates.map(s => s.id));
      const transitions: OpmBehaviorTransition[] = [];

      edges.forEach(e => {
        const kind = e.data?.type as OpmBehaviorTransition['kind'];
        const isOutbound = kind === 'result' || kind === 'effect';
        const proc = isOutbound ? nodeById.get(e.source) : nodeById.get(e.target);
        if (!proc || proc.data.type !== 'process') return;
        if (isOutbound && stateIds.has(e.target)) {
          transitions.push({
            processId: proc.id, processName: proc.data.name,
            fromStateId: null, toStateId: e.target, kind,
          });
        } else if (kind === 'consumption' && stateIds.has(e.source)) {
          transitions.push({
            processId: proc.id, processName: proc.data.name,
            fromStateId: e.source, toStateId: null, kind,
          });
        }
      });

      return { objectId: obj.id, objectName: obj.data.name, stateIds: childStates.map(s => s.id), transitions };
    });
}

export interface OpmRequirementTrace {
  requirementId: string;
  requirementName: string;
  requirementText: string;
  satisfiedBy: { id: string; name: string; kind: OPMNodeType }[];
}

export function deriveRequirementsView(nodes: AppNode[], edges: AppEdge[]): OpmRequirementTrace[] {
  return nodes
    .filter(n => n.data.type === 'requirement')
    .map(r => {
      const satisfiedBy = edges
        .filter(e => e.source === r.id && (e.data?.type === 'satisfies' || e.data?.type === 'verifies'))
        .map(e => {
          const t = nodes.find(n => n.id === e.target);
          return t ? { id: t.id, name: t.data.name, kind: t.data.type } : null;
        })
        .filter((x): x is { id: string; name: string; kind: OPMNodeType } => x !== null);
      return {
        requirementId: r.id,
        requirementName: r.data.name,
        requirementText: String((r.data as any).requirementText || ''),
        satisfiedBy,
      };
    });
}

export interface OpmInternalPort {
  peerId: string;
  peerName: string;
  peerType: string;
  linkType: OPMLinkType;
  direction: 'in' | 'out';
}

export interface OpmInternalView {
  processId: string;
  processName: string;
  inputs: OpmInternalPort[];
  outputs: OpmInternalPort[];
}

export function deriveInternalView(
  nodes: AppNode[],
  edges: AppEdge[],
  processId: string
): OpmInternalView | null {
  const proc = nodes.find(n => n.id === processId && n.data.type === 'process');
  if (!proc) return null;

  const portOf = (e: AppEdge, direction: 'in' | 'out'): OpmInternalPort | null => {
    const peer = nodes.find(n => n.id === (direction === 'in' ? e.source : e.target));
    if (!peer) return null;
    return {
      peerId: peer.id,
      peerName: peer.data.name,
      peerType: peer.data.type,
      linkType: (e.data?.type ?? 'condition') as OPMLinkType,
      direction,
    };
  };

  return {
    processId: proc.id,
    processName: proc.data.name,
    inputs: edges.filter(e => e.target === processId).map(e => portOf(e, 'in')).filter((p): p is OpmInternalPort => !!p),
    outputs: edges.filter(e => e.source === processId).map(e => portOf(e, 'out')).filter((p): p is OpmInternalPort => !!p),
  };
}
