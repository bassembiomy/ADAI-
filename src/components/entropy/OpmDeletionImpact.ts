/**
 * Unified OPM Deletion Impact & Cascade Service.
 * Computes transitive descendant closures, incident edge cascades,
 * requirement impacts, simulation invalidations, and applies pure model mutations.
 */
import type {
  AppNode,
  AppEdge,
  OpmModelSnapshot,
  OpmModelMutationResult,
  OpmLifecycleDiagnostic,
} from './EntropyTypes';
import { getCanonicalParentId, normalizeContainment, validateOpmModelLifecycle } from './OpmModelLifecycle';

export interface OpmPortRef {
  nodeId: string;
  portId: string;
  direction?: 'input' | 'output';
}

export interface OpmDeletionTarget {
  nodeIds?: string[];
  edgeIds?: string[];
  portRefs?: OpmPortRef[];
}

export interface OpmDeletionImpactSummary {
  deletedNodeCount: number;
  deletedEdgeCount: number;
  deletedStateCount: number;
  deletedPortCount: number;
  descendantsCascadedCount: number;
  affectedRequirementCount: number;
  isHighImpact: boolean;
}

export interface OpmDeletionImpactReport {
  target: OpmDeletionTarget;
  closureNodeIds: string[];
  closureEdgeIds: string[];
  deletedPortRefs: OpmPortRef[];
  affectedRequirementIds: string[];
  affectedSimulationIds: string[];
  invalidationReasons: string[];
  isHighImpact: boolean;
  summary: OpmDeletionImpactSummary;
  diagnostics: OpmLifecycleDiagnostic[];
}

/**
 * Pure analysis of deletion impact across the complete model snapshot.
 * Determines the full transitive descendant closure, all incident edges,
 * affected requirements, runtime simulation IDs, and evidence invalidation reasons.
 */
export function analyzeOpmDeletion(
  snapshot: OpmModelSnapshot,
  target: OpmDeletionTarget,
): OpmDeletionImpactReport {
  const { nodes, edges } = snapshot;
  const initialNodeIds = new Set(target.nodeIds || []);
  const closureNodeIds = new Set<string>(initialNodeIds);
  const deletedPortRefs = target.portRefs ? [...target.portRefs] : [];

  // Build parent -> children map (direct containment)
  const childrenMap = new Map<string, string[]>();
  nodes.forEach(n => {
    const parentId = getCanonicalParentId(n);
    if (parentId) {
      const list = childrenMap.get(parentId) || [];
      list.push(n.id);
      childrenMap.set(parentId, list);
    }
  });

  // Transitive closure over parent -> child containment
  const queue = Array.from(initialNodeIds);
  let cascadedDescendants = 0;

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = childrenMap.get(parentId) || [];
    for (const childId of children) {
      if (!closureNodeIds.has(childId)) {
        closureNodeIds.add(childId);
        cascadedDescendants++;
        queue.push(childId);
      }
    }
  }

  // Edges closure: direct targets + incident edges touching any closure node + edges on deleted ports
  const closureEdgeIds = new Set<string>(target.edgeIds || []);

  edges.forEach(e => {
    if (closureNodeIds.has(e.source) || closureNodeIds.has(e.target)) {
      closureEdgeIds.add(e.id);
    } else if (deletedPortRefs.length > 0) {
      const touchesPort = deletedPortRefs.some(
        p =>
          (e.source === p.nodeId && e.sourceHandle === p.portId) ||
          (e.target === p.nodeId && e.targetHandle === p.portId),
      );
      if (touchesPort) {
        closureEdgeIds.add(e.id);
      }
    }
  });

  // Affected requirements:
  const affectedRequirementIds = new Set<string>();
  nodes.forEach(n => {
    if (n.data?.type === 'requirement' && closureNodeIds.has(n.id)) {
      affectedRequirementIds.add(n.id);
    }
  });

  edges.forEach(e => {
    if (closureEdgeIds.has(e.id) && (e.data?.type === 'satisfies' || e.data?.type === 'verifies')) {
      affectedRequirementIds.add(e.source);
    }
  });

  // Affected simulation entities:
  const affectedSimulationIds = new Set<string>();
  nodes.forEach(n => {
    if (closureNodeIds.has(n.id)) {
      if (n.data?.type === 'process' || n.data?.type === 'state') {
        affectedSimulationIds.add(n.id);
      }
    }
  });
  closureEdgeIds.forEach(id => affectedSimulationIds.add(id));

  // Count states deleted
  let deletedStateCount = 0;
  nodes.forEach(n => {
    if (closureNodeIds.has(n.id) && n.data?.type === 'state') {
      deletedStateCount++;
    }
  });

  // Construct invalidation reasons
  const invalidationReasons: string[] = [];
  if (closureNodeIds.size > 0) {
    invalidationReasons.push(
      `Deleted ${closureNodeIds.size} node(s) (${cascadedDescendants} cascaded descendant(s)).`,
    );
  }
  if (closureEdgeIds.size > 0) {
    invalidationReasons.push(`Removed ${closureEdgeIds.size} incident link(s).`);
  }
  if (deletedPortRefs.length > 0) {
    invalidationReasons.push(`Removed ${deletedPortRefs.length} port(s).`);
  }
  if (affectedRequirementIds.size > 0) {
    invalidationReasons.push(
      `Affects traceability for ${affectedRequirementIds.size} requirement(s).`,
    );
  }
  if (affectedSimulationIds.size > 0) {
    invalidationReasons.push(
      `Simulation active state/trace references removed for ${affectedSimulationIds.size} item(s).`,
    );
  }

  const isHighImpact =
    closureNodeIds.size > 1 ||
    cascadedDescendants > 0 ||
    affectedRequirementIds.size > 0 ||
    closureEdgeIds.size > 2;

  const summary: OpmDeletionImpactSummary = {
    deletedNodeCount: closureNodeIds.size,
    deletedEdgeCount: closureEdgeIds.size,
    deletedStateCount,
    deletedPortCount: deletedPortRefs.length,
    descendantsCascadedCount: cascadedDescendants,
    affectedRequirementCount: affectedRequirementIds.size,
    isHighImpact,
  };

  const diagnostics: OpmLifecycleDiagnostic[] = [];
  if (isHighImpact) {
    diagnostics.push({
      code: 'OPM_HIGH_IMPACT_DELETION',
      severity: 'warning',
      message: `High-impact deletion: ${summary.deletedNodeCount} element(s), ${summary.descendantsCascadedCount} cascaded child(ren), and ${summary.deletedEdgeCount} link(s) will be removed.`,
    });
  }

  return {
    target,
    closureNodeIds: Array.from(closureNodeIds),
    closureEdgeIds: Array.from(closureEdgeIds),
    deletedPortRefs,
    affectedRequirementIds: Array.from(affectedRequirementIds),
    affectedSimulationIds: Array.from(affectedSimulationIds),
    invalidationReasons,
    isHighImpact,
    summary,
    diagnostics,
  };
}

/**
 * Purely applies the deletion impact to produce a new immutable model snapshot.
 * Purges deleted state IDs from surviving objects and normalizes containment.
 */
export function applyOpmDeletion(
  snapshot: OpmModelSnapshot,
  impact: OpmDeletionImpactReport,
): OpmModelMutationResult {
  const { nodes, edges } = snapshot;
  const removedNodes = new Set(impact.closureNodeIds);
  const removedEdges = new Set(impact.closureEdgeIds);

  // 1. Filter surviving nodes
  const survivingNodes = nodes.filter(n => !removedNodes.has(n.id));

  // 2. Filter surviving edges
  const survivingEdges = edges.filter(e => !removedEdges.has(e.id));

  // 3. Purge deleted ports and deleted states from surviving nodes
  const portRefMap = new Map<string, Set<string>>();
  impact.deletedPortRefs.forEach(p => {
    const set = portRefMap.get(p.nodeId) || new Set<string>();
    set.add(p.portId);
    portRefMap.set(p.nodeId, set);
  });

  const updatedNodes = survivingNodes.map(node => {
    let changed = false;
    let inputs = node.data?.inputs;
    let outputs = node.data?.outputs;
    let states = node.data?.states;

    const removedPortsForNode = portRefMap.get(node.id);
    if (removedPortsForNode) {
      if (inputs) {
        inputs = inputs.filter(p => !removedPortsForNode.has(p.id));
        changed = true;
      }
      if (outputs) {
        outputs = outputs.filter(p => !removedPortsForNode.has(p.id));
        changed = true;
      }
    }

    if (node.data?.type === 'object' && Array.isArray(states)) {
      const filteredStates = states.filter(s => !removedNodes.has(s.id));
      if (filteredStates.length !== states.length) {
        states = filteredStates;
        changed = true;
      }
    }

    if (!changed) return node;

    return {
      ...node,
      data: {
        ...node.data,
        inputs,
        outputs,
        states,
      },
    };
  });

  // 4. Normalize containment and validate snapshot
  const normalizedSnapshot = normalizeContainment({
    nodes: updatedNodes,
    edges: survivingEdges,
  });

  const validationReport = validateOpmModelLifecycle(normalizedSnapshot);

  return {
    snapshot: normalizedSnapshot,
    diagnostics: validationReport.diagnostics,
    invalidatesSimulation:
      impact.closureNodeIds.length > 0 ||
      impact.closureEdgeIds.length > 0 ||
      impact.deletedPortRefs.length > 0,
    invalidatesEvidence:
      impact.closureNodeIds.length > 0 ||
      impact.closureEdgeIds.length > 0 ||
      impact.affectedRequirementIds.length > 0,
  };
}
