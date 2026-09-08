/**
 * Canonical OPM Model Lifecycle & Integrity Service.
 * Pure TypeScript — validates and normalizes containment, reference integrity,
 * structural cycles, state ownership, and model snapshots.
 */
import type {
  AppNode,
  AppEdge,
  OPMState,
  OpmModelSnapshot,
  OpmLifecycleReport,
  OpmLifecycleDiagnostic,
} from './EntropyTypes';

/**
 * Checks if a node has conflicting containment declarations between
 * `node.parentId` (React Flow) and `node.data.parentId` (OPM data).
 */
export function hasContainmentConflict(node: AppNode): boolean {
  const rfParent = node.parentId ? String(node.parentId).trim() : null;
  const dataParent = node.data?.parentId ? String(node.data.parentId).trim() : null;
  return Boolean(rfParent && dataParent && rfParent !== dataParent);
}

/**
 * Returns the canonical parent ID for a node.
 * Canonicalizes only when both fields agree or one is absent.
 * Returns null if neither is set, or if they are in disagreement (conflict).
 */
export function getCanonicalParentId(node: AppNode): string | null {
  const rfParent = node.parentId ? String(node.parentId).trim() : null;
  const dataParent = node.data?.parentId ? String(node.data.parentId).trim() : null;

  if (rfParent && dataParent) {
    return rfParent === dataParent ? rfParent : null;
  }
  return rfParent || dataParent || null;
}

/**
 * Purely normalizes containment across an immutable model snapshot.
 * - When one parentId is set and the other is absent, sets both to the canonical value.
 * - Leaves conflicting containment un-repaired so the lifecycle validator can report it.
 * - Synchronizes each Object's `data.states` list with its valid child state nodes.
 */
export function normalizeContainment(snapshot: OpmModelSnapshot): OpmModelSnapshot {
  const { nodes, edges } = snapshot;

  // 1. Normalize node parent fields (without overwriting conflicting fields)
  const normalizedNodes = nodes.map(node => {
    if (hasContainmentConflict(node)) {
      return { ...node };
    }
    const canonicalParent = getCanonicalParentId(node);
    const updatedData = {
      ...node.data,
      parentId: canonicalParent ?? null,
    };
    return {
      ...node,
      parentId: canonicalParent ?? undefined,
      data: updatedData,
    };
  });

  // 2. Synchronize Object `data.states` with surviving child state nodes
  const stateNodesByParent = new Map<string, AppNode[]>();
  normalizedNodes.forEach(n => {
    if (n.data?.type === 'state') {
      const parentId = getCanonicalParentId(n);
      if (parentId) {
        const list = stateNodesByParent.get(parentId) || [];
        list.push(n);
        stateNodesByParent.set(parentId, list);
      }
    }
  });

  const finalNodes = normalizedNodes.map(node => {
    if (node.data?.type === 'object') {
      const childStateNodes = stateNodesByParent.get(node.id) || [];
      const existingStates = Array.isArray(node.data.states) ? (node.data.states as OPMState[]) : [];
      const existingMap = new Map<string, OPMState>(existingStates.map(s => [s.id, s]));

      const syncedStates: OPMState[] = childStateNodes.map(sn => {
        const existing = existingMap.get(sn.id);
        return {
          id: sn.id,
          name: sn.data.name || existing?.name || sn.id,
          isActive: Boolean(existing?.isActive ?? (sn.data as any).isActive ?? false),
          isInitial: Boolean(sn.data.isInitial ?? existing?.isInitial ?? false),
          value: existing?.value ?? (sn.data as any).value,
        };
      });

      return {
        ...node,
        data: {
          ...node.data,
          states: syncedStates,
        },
      };
    }
    return node;
  });

  return {
    nodes: finalNodes,
    edges: [...edges],
  };
}

/**
 * Validates complete snapshot integrity against OPM and SysML lifecycle rules.
 * Fails closed on duplicate IDs, orphan edges, missing parents, conflicting containment,
 * invalid state ownership, and structural/containment cycles.
 */
export function validateOpmModelLifecycle(snapshot: OpmModelSnapshot): OpmLifecycleReport {
  const diagnostics: OpmLifecycleDiagnostic[] = [];
  const orphanNodeIds: string[] = [];
  const orphanEdgeIds: string[] = [];
  const structuralCycleIds: string[][] = [];
  const conflictingContainmentIds: string[] = [];

  const { nodes, edges } = snapshot;

  // 1. Duplicate node IDs
  const seenNodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  nodes.forEach(n => {
    if (seenNodeIds.has(n.id)) {
      duplicateNodeIds.add(n.id);
    } else {
      seenNodeIds.add(n.id);
    }
  });
  duplicateNodeIds.forEach(id => {
    diagnostics.push({
      code: 'OPM_DUPLICATE_NODE_ID',
      severity: 'error',
      message: `Duplicate node ID "${id}" detected.`,
      elementId: id,
    });
  });

  // 2. Duplicate edge IDs
  const seenEdgeIds = new Set<string>();
  const duplicateEdgeIds = new Set<string>();
  edges.forEach(e => {
    if (seenEdgeIds.has(e.id)) {
      duplicateEdgeIds.add(e.id);
    } else {
      seenEdgeIds.add(e.id);
    }
  });
  duplicateEdgeIds.forEach(id => {
    diagnostics.push({
      code: 'OPM_DUPLICATE_EDGE_ID',
      severity: 'error',
      message: `Duplicate edge ID "${id}" detected.`,
      elementId: id,
    });
  });

  const nodeMap = new Map<string, AppNode>(nodes.map(n => [n.id, n]));

  // 3. Node containment and ownership validation
  nodes.forEach(node => {
    const isConflict = hasContainmentConflict(node);
    if (isConflict) {
      conflictingContainmentIds.push(node.id);
      diagnostics.push({
        code: 'OPM_CONTAINMENT_CONFLICT',
        severity: 'error',
        message: `Conflicting containment parentId "${node.parentId}" vs data.parentId "${node.data?.parentId}" on element "${node.id}".`,
        elementId: node.id,
        propertyPath: 'parentId',
      });
    }

    const canonicalParent = getCanonicalParentId(node);

    // If a parent is declared, does it exist?
    if (canonicalParent) {
      const parentNode = nodeMap.get(canonicalParent);
      if (!parentNode) {
        orphanNodeIds.push(node.id);
        diagnostics.push({
          code: 'OPM_CONTAINMENT_MISSING_PARENT',
          severity: 'error',
          message: `Element "${node.id}" references non-existent parent node "${canonicalParent}".`,
          elementId: node.id,
          propertyPath: 'parentId',
        });
      } else if (node.data?.type === 'state' && parentNode.data?.type !== 'object') {
        conflictingContainmentIds.push(node.id);
        diagnostics.push({
          code: 'OPM_STATE_INVALID_OWNER',
          severity: 'error',
          message: `State "${node.id}" owner "${parentNode.id}" must be an Object, but is "${parentNode.data?.type}".`,
          elementId: node.id,
        });
      }
    } else if (node.data?.type === 'state') {
      orphanNodeIds.push(node.id);
      diagnostics.push({
        code: 'OPM_STATE_MISSING_OWNER',
        severity: 'error',
        message: `State "${node.id}" must be owned by an Object.`,
        elementId: node.id,
      });
    }
  });

  // 4. Edge endpoints validation (orphan edges)
  edges.forEach(edge => {
    const sourceExists = nodeMap.has(edge.source);
    const targetExists = nodeMap.has(edge.target);
    if (!sourceExists || !targetExists) {
      orphanEdgeIds.push(edge.id);
      diagnostics.push({
        code: 'OPM_ORPHAN_EDGE',
        severity: 'error',
        message: `Edge "${edge.id}" references missing endpoint(s): source "${edge.source}", target "${edge.target}".`,
        elementId: edge.id,
      });
    }
  });

  // 5. Structural cycle detection (aggregation/generalization and containment)
  const adj = new Map<string, string[]>();
  const addEdge = (u: string, v: string) => {
    const list = adj.get(u) || [];
    list.push(v);
    adj.set(u, list);
  };

  // Add structural edges
  edges.forEach(e => {
    const linkType = e.data?.type;
    if (linkType === 'aggregation' || linkType === 'generalization') {
      if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
        addEdge(e.source, e.target);
      }
    }
  });

  // Add containment relationships (parent -> child)
  nodes.forEach(n => {
    const p = getCanonicalParentId(n);
    if (p && nodeMap.has(p)) {
      addEdge(p, n.id);
    }
  });

  // Detect directed cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  const dfs = (u: string) => {
    visited.add(u);
    recursionStack.add(u);
    path.push(u);

    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (!visited.has(v)) {
        dfs(v);
      } else if (recursionStack.has(v)) {
        const cycleStartIndex = path.indexOf(v);
        if (cycleStartIndex !== -1) {
          const cycle = path.slice(cycleStartIndex).concat(v);
          structuralCycleIds.push(cycle);
          diagnostics.push({
            code: 'OPM_STRUCTURAL_CYCLE',
            severity: 'error',
            message: `Structural cycle detected: ${cycle.join(' -> ')}.`,
            elementId: cycle[0],
          });
        }
      }
    }

    path.pop();
    recursionStack.delete(u);
  };

  for (const nodeId of nodeMap.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  const hasErrors = diagnostics.some(d => d.severity === 'error');

  return {
    valid: !hasErrors,
    diagnostics,
    orphanNodeIds: Array.from(new Set(orphanNodeIds)),
    orphanEdgeIds: Array.from(new Set(orphanEdgeIds)),
    structuralCycleIds,
    conflictingContainmentIds: Array.from(new Set(conflictingContainmentIds)),
  };
}
