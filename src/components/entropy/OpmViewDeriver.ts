/**
 * Smart Show view derivation: every classic SysML diagram view is derived
 * from the single OPM model (ISO 19450) instead of being authored separately.
 *  - Structure view      (replaces SysML BDD)  ← aggregation/generalization links
 *  - Internal view       (replaces SysML IBD)  ← a process and its procedural links
 *  - Behavior view       (replaces state machine) ← result/effect/consumption per object
 *  - Requirements view   (replaces requirements diagram) ← satisfies/verifies links
 * Pure TypeScript, no React.
 */
import type { AppNode, AppEdge, OPMLinkType, OPMNodeType, OpmLifecycleDiagnostic } from './EntropyTypes';

export interface OpmStructureNode {
  id: string;
  name: string;
  kind: 'object' | 'requirement';
  physical: boolean;
  children: OpmStructureNode[];
}

export type OpmStructureViewResult = OpmStructureNode[] & {
  diagnostics: OpmLifecycleDiagnostic[];
};

export function deriveStructureView(nodes: AppNode[], edges: AppEdge[]): OpmStructureViewResult {
  const byId = new Map(nodes.map(n => [n.id, n] as const));
  const diagnostics: OpmLifecycleDiagnostic[] = [];

  const structural = edges.filter(
    e => e.data?.type === 'aggregation' || e.data?.type === 'generalization'
  );

  // 1. Check for orphan edges
  edges.forEach(e => {
    if (!byId.has(e.source) || !byId.has(e.target)) {
      diagnostics.push({
        code: 'OPM_ORPHAN_EDGE',
        severity: 'error',
        message: `Edge "${e.id}" connects to missing node(s): source "${e.source}", target "${e.target}".`,
        elementId: e.id,
      });
    }
  });

  // 2. Check for structural cycles across aggregation & generalization
  const adj = new Map<string, string[]>();
  structural.forEach(e => {
    if (byId.has(e.source) && byId.has(e.target)) {
      const list = adj.get(e.source) || [];
      list.push(e.target);
      adj.set(e.source, list);
    }
  });

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  const dfs = (u: string) => {
    visited.add(u);
    recStack.add(u);
    path.push(u);

    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (!visited.has(v)) {
        dfs(v);
      } else if (recStack.has(v)) {
        const cycleStart = path.indexOf(v);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart).concat(v);
          diagnostics.push({
            code: 'OPM_STRUCTURAL_CYCLE',
            severity: 'error',
            message: `Structural cycle in BDD view: ${cycle.join(' -> ')}.`,
            elementId: cycle[0],
          });
        }
      }
    }

    path.pop();
    recStack.delete(u);
  };

  for (const n of nodes) {
    if (!visited.has(n.id)) {
      dfs(n.id);
    }
  }

  // 3. Build structure tree
  const childIds = new Set(structural.map(e => e.target));
  const treeVisited = new Set<string>();

  const build = (n: AppNode): OpmStructureNode => {
    treeVisited.add(n.id);
    return {
      id: n.id,
      name: n.data.name,
      kind: n.data.type === 'requirement' ? 'requirement' : 'object',
      physical: !!n.data.physical,
      children: structural
        .filter(e => e.source === n.id)
        .map(e => byId.get(e.target))
        .filter((c): c is AppNode => !!c && !treeVisited.has(c.id))
        .map(build),
    };
  };

  const roots = nodes
    .filter(n => n.data.type === 'object' && !childIds.has(n.id))
    .map(build) as OpmStructureViewResult;

  roots.diagnostics = diagnostics;
  return roots;
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

export type OpmRequirementStatus = 'uncovered' | 'covered' | 'verified' | 'failed' | 'stale';

export interface OpmRequirementTrace {
  requirementId: string;
  requirementName: string;
  requirementText: string;
  status: OpmRequirementStatus;
  statusReason?: string;
  satisfiedBy: { id: string; name: string; kind: OPMNodeType }[];
  verifiedBy?: { id: string; name: string; kind: OPMNodeType }[];
}

export function deriveRequirementsView(nodes: AppNode[], edges: AppEdge[]): OpmRequirementTrace[] {
  return nodes
    .filter(n => n.data.type === 'requirement')
    .map(r => {
      const satisfiesEdges = edges.filter(e => e.source === r.id && e.data?.type === 'satisfies');
      const verifiesEdges = edges.filter(e => e.source === r.id && e.data?.type === 'verifies');

      const toSatisfied = (e: AppEdge) => {
        const t = nodes.find(n => n.id === e.target);
        return t ? { id: t.id, name: t.data.name, kind: t.data.type } : null;
      };

      const satisfiedBy = [...satisfiesEdges, ...verifiesEdges]
        .map(toSatisfied)
        .filter((x): x is { id: string; name: string; kind: OPMNodeType } => x !== null);

      const verifiedBy = verifiesEdges
        .map(toSatisfied)
        .filter((x): x is { id: string; name: string; kind: OPMNodeType } => x !== null);

      // Determine lifecycle coverage status:
      // Explicit status override takes priority
      const explicitStatus = (r.data as any).status as OpmRequirementStatus | undefined;
      let status: OpmRequirementStatus = 'uncovered';

      if (explicitStatus && ['uncovered', 'covered', 'verified', 'failed', 'stale'].includes(explicitStatus)) {
        status = explicitStatus;
      } else if ((r.data as any).isStale || (r.data as any).evidenceStatus === 'stale') {
        status = 'stale';
      } else if ((r.data as any).verificationStatus === 'failed' || (r.data as any).failed) {
        status = 'failed';
      } else if (verifiedBy.length > 0) {
        status = 'verified';
      } else if (satisfiedBy.length > 0) {
        status = 'covered';
      } else {
        status = 'uncovered';
      }

      return {
        requirementId: r.id,
        requirementName: r.data.name,
        requirementText: String((r.data as any).requirementText || ''),
        status,
        satisfiedBy,
        verifiedBy,
      };
    });
}

export interface OpmInternalPort {
  peerId: string;
  peerName: string;
  peerType: string;
  linkType: OPMLinkType;
  direction: 'in' | 'out';
  sourceHandle?: string;
  targetHandle?: string;
}

export interface OpmInternalUnresolvedMapping {
  edgeId: string;
  reason: string;
}

export interface OpmInternalView {
  processId: string;
  processName: string;
  inputs: OpmInternalPort[];
  outputs: OpmInternalPort[];
  diagnostics?: OpmLifecycleDiagnostic[];
  unresolvedMappings?: OpmInternalUnresolvedMapping[];
}

export function deriveInternalView(
  nodes: AppNode[],
  edges: AppEdge[],
  processId: string
): OpmInternalView | null {
  const proc = nodes.find(n => n.id === processId && n.data.type === 'process');
  if (!proc) return null;

  const unresolvedMappings: OpmInternalUnresolvedMapping[] = [];
  const diagnostics: OpmLifecycleDiagnostic[] = [];

  const portOf = (e: AppEdge, direction: 'in' | 'out'): OpmInternalPort | null => {
    const peerNodeId = direction === 'in' ? e.source : e.target;
    const peer = nodes.find(n => n.id === peerNodeId);

    if (!peer) {
      const reason = `Edge "${e.id}" connects to non-existent endpoint node "${peerNodeId}".`;
      unresolvedMappings.push({ edgeId: e.id, reason });
      diagnostics.push({
        code: 'OPM_INTERNAL_UNRESOLVED_ENDPOINT',
        severity: 'warning',
        message: reason,
        elementId: e.id,
      });
      return null;
    }

    // Check handle resolution if specified
    if (direction === 'in' && e.sourceHandle) {
      const allPorts = [...(peer.data.inputs || []), ...(peer.data.outputs || [])];
      if (!allPorts.some(p => p.id === e.sourceHandle)) {
        const reason = `Edge "${e.id}" references missing source handle "${e.sourceHandle}" on node "${peer.id}".`;
        unresolvedMappings.push({ edgeId: e.id, reason });
        diagnostics.push({
          code: 'OPM_INTERNAL_UNRESOLVED_HANDLE',
          severity: 'warning',
          message: reason,
          elementId: e.id,
        });
      }
    } else if (direction === 'out' && e.targetHandle) {
      const allPorts = [...(peer.data.inputs || []), ...(peer.data.outputs || [])];
      if (!allPorts.some(p => p.id === e.targetHandle)) {
        const reason = `Edge "${e.id}" references missing target handle "${e.targetHandle}" on node "${peer.id}".`;
        unresolvedMappings.push({ edgeId: e.id, reason });
        diagnostics.push({
          code: 'OPM_INTERNAL_UNRESOLVED_HANDLE',
          severity: 'warning',
          message: reason,
          elementId: e.id,
        });
      }
    }

    return {
      peerId: peer.id,
      peerName: peer.data.name,
      peerType: peer.data.type,
      linkType: (e.data?.type ?? 'condition') as OPMLinkType,
      direction,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
    };
  };

  const inputs = edges
    .filter(e => e.target === processId)
    .map(e => portOf(e, 'in'))
    .filter((p): p is OpmInternalPort => !!p);

  const outputs = edges
    .filter(e => e.source === processId)
    .map(e => portOf(e, 'out'))
    .filter((p): p is OpmInternalPort => !!p);

  return {
    processId: proc.id,
    processName: proc.data.name,
    inputs,
    outputs,
    diagnostics,
    unresolvedMappings,
  };
}
