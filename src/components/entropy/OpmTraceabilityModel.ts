/**
 * OPM Traceability & Invalidation Model (Task 6)
 *
 * Tracks requirement coverage, verification status, and evidence validity
 * across model revisions. Reconciles runtime simulation state against
 * surviving model snapshots so dead element references are eliminated cleanly.
 */
import type { AppNode, AppEdge, OpmModelSnapshot } from './EntropyTypes';
import type { OpmSimulationState } from './OpmSimulationEngine';

export type RequirementCoverageStatus = 'uncovered' | 'covered' | 'verified' | 'failed' | 'stale';

export interface OpmRequirementEvidence {
  verifiedRevision: number;
  passed: boolean;
  verifiedAt?: string;
  reason?: string;
}

export interface OpmTraceabilityRow {
  requirementId: string;
  requirementName: string;
  requirementText?: string;
  status: RequirementCoverageStatus;
  satisfiedByNodeIds: string[];
  verifiedByNodeIds: string[];
  refiningNodeIds: string[];
  satisfyingLinkIds: string[];
  verifyingLinkIds: string[];
  refiningLinkIds: string[];
  evidence?: OpmRequirementEvidence;
  isStale: boolean;
}

export interface OpmTraceabilityModel {
  revision: number;
  totalRequirements: number;
  coveredCount: number;
  verifiedCount: number;
  failedCount: number;
  staleCount: number;
  uncoveredCount: number;
  rows: OpmTraceabilityRow[];
}

/**
 * Derives a comprehensive traceability model for all Requirement nodes in the model snapshot.
 *
 * Requirements are evaluated against incoming and outgoing structural and verification links.
 * Evidence is tied to a specific model revision; if the current model revision has advanced
 * past the evidence revision, the requirement status transitions to 'stale'.
 */
export function deriveOpmTraceabilityModel(
  snapshot: OpmModelSnapshot,
  currentRevision: number,
  evidenceMap?: Record<string, OpmRequirementEvidence>
): OpmTraceabilityModel {
  const reqNodes = snapshot.nodes.filter(n => n.data?.type === 'requirement');
  const rows: OpmTraceabilityRow[] = [];

  let coveredCount = 0;
  let verifiedCount = 0;
  let failedCount = 0;
  let staleCount = 0;
  let uncoveredCount = 0;

  for (const req of reqNodes) {
    const reqId = req.id;
    const reqName = req.data?.name || reqId;
    const reqText = req.data?.requirementText;

    // Discover incident links
    const satisfyingLinkIds: string[] = [];
    const satisfiedByNodeIds: string[] = [];

    const verifyingLinkIds: string[] = [];
    const verifiedByNodeIds: string[] = [];

    const refiningLinkIds: string[] = [];
    const refiningNodeIds: string[] = [];

    for (const edge of snapshot.edges) {
      const linkType = edge.data?.type || edge.data?.linkType;
      const isSrc = edge.source === reqId;
      const isTgt = edge.target === reqId;

      if (!isSrc && !isTgt) continue;

      const otherNodeId = isSrc ? edge.target : edge.source;
      const otherNodeExists = snapshot.nodes.some(n => n.id === otherNodeId);
      if (!otherNodeExists) continue;

      if (linkType === 'satisfies') {
        satisfyingLinkIds.push(edge.id);
        satisfiedByNodeIds.push(otherNodeId);
      } else if (linkType === 'verifies') {
        verifyingLinkIds.push(edge.id);
        verifiedByNodeIds.push(otherNodeId);
      } else if (linkType === 'refines') {
        refiningLinkIds.push(edge.id);
        refiningNodeIds.push(otherNodeId);
      }
    }

    const hasCoverage = satisfiedByNodeIds.length > 0 || verifiedByNodeIds.length > 0;
    const evidence = evidenceMap ? evidenceMap[reqId] : undefined;

    let status: RequirementCoverageStatus = 'uncovered';
    let isStale = false;

    if (!hasCoverage) {
      status = 'uncovered';
      uncoveredCount++;
    } else if (evidence) {
      if (evidence.verifiedRevision !== currentRevision) {
        status = 'stale';
        isStale = true;
        staleCount++;
      } else if (evidence.passed) {
        status = 'verified';
        verifiedCount++;
      } else {
        status = 'failed';
        failedCount++;
      }
    } else {
      status = 'covered';
      coveredCount++;
    }

    rows.push({
      requirementId: reqId,
      requirementName: reqName,
      requirementText: reqText,
      status,
      satisfiedByNodeIds,
      verifiedByNodeIds,
      refiningNodeIds,
      satisfyingLinkIds,
      verifyingLinkIds,
      refiningLinkIds,
      evidence,
      isStale,
    });
  }

  return {
    revision: currentRevision,
    totalRequirements: reqNodes.length,
    coveredCount,
    verifiedCount,
    failedCount,
    staleCount,
    uncoveredCount,
    rows,
  };
}

/**
 * Purely reconciles an OPM simulation state against a surviving set of node and edge IDs.
 * Cleans up dead references in active states, pending events, lastChangeTick, lastLoggedBlock,
 * and traces to prevent zombie/stale references.
 */
export function reconcileSimulationState(
  state: OpmSimulationState,
  survivingNodeIds: Set<string>,
  survivingEdgeIds: Set<string>
): OpmSimulationState {
  const activeStates: Record<string, string | null> = {};
  for (const [objId, stId] of Object.entries(state.objectActiveState || {})) {
    if (survivingNodeIds.has(objId)) {
      if (stId && survivingNodeIds.has(stId)) {
        activeStates[objId] = stId;
      } else {
        activeStates[objId] = null;
      }
    }
  }

  const pendingEvents = (state.pendingEvents || []).filter(
    ev => survivingNodeIds.has(ev.objectId) && (!ev.stateId || survivingNodeIds.has(ev.stateId))
  );

  const lastChangeTick: Record<string, number> = {};
  for (const [procId, tick] of Object.entries(state.lastChangeTick || {})) {
    if (survivingNodeIds.has(procId)) {
      lastChangeTick[procId] = tick;
    }
  }

  const lastLoggedBlock: Record<string, string> = {};
  for (const [procId, block] of Object.entries(state.lastLoggedBlock || {})) {
    if (survivingNodeIds.has(procId)) {
      lastLoggedBlock[procId] = block;
    }
  }

  const trace = (state.trace || []).filter(
    tr =>
      survivingNodeIds.has(tr.processId) &&
      survivingNodeIds.has(tr.objectId) &&
      (!tr.toStateId || survivingNodeIds.has(tr.toStateId))
  );

  return {
    ...state,
    objectActiveState: activeStates,
    pendingEvents,
    lastChangeTick,
    lastLoggedBlock,
    trace,
  };
}
