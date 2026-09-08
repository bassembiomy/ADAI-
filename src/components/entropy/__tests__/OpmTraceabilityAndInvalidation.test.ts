import { describe, it, expect } from 'vitest';
import {
  deriveOpmTraceabilityModel,
  reconcileSimulationState,
  type OpmRequirementEvidence,
} from '../OpmTraceabilityModel';
import {
  resetToDraft,
  canDownload,
  canRunHil,
  type OpmArtifactState,
} from '../OpmCodeGenerationWorkspace';
import type { OpmModelSnapshot, AppNode, AppEdge } from '../EntropyTypes';
import { createSimulationState } from '../OpmSimulationEngine';

describe('OPM Traceability & Invalidation Engine (Task 6)', () => {
  const reqNode: AppNode = {
    id: 'req-safety',
    type: 'opmObject',
    position: { x: 100, y: 100 },
    data: {
      name: 'Safety Interlock',
      type: 'requirement',
      physical: false,
      states: [],
      attributes: [],
      requirementText: 'The system shall stop on door open.',
    },
  };

  const procNode: AppNode = {
    id: 'proc-stop',
    type: 'opmProcess',
    position: { x: 300, y: 100 },
    data: {
      name: 'Stop Motion',
      type: 'process',
      physical: false,
      states: [],
      attributes: [],
    },
  };

  const testNode: AppNode = {
    id: 'proc-test',
    type: 'opmProcess',
    position: { x: 500, y: 100 },
    data: {
      name: 'Verify Stop Motion',
      type: 'process',
      physical: false,
      states: [],
      attributes: [],
    },
  };

  it('marks requirement as uncovered when no satisfying or verifying links exist', () => {
    const snapshot: OpmModelSnapshot = {
      nodes: [reqNode, procNode],
      edges: [],
    };

    const model = deriveOpmTraceabilityModel(snapshot, 1);
    expect(model.totalRequirements).toBe(1);
    expect(model.uncoveredCount).toBe(1);
    expect(model.coveredCount).toBe(0);
    expect(model.rows[0].status).toBe('uncovered');
    expect(model.rows[0].isStale).toBe(false);
  });

  it('marks requirement as covered when satisfying link exists but no evidence registered', () => {
    const satisfiesEdge: AppEdge = {
      id: 'e-satisfies',
      source: 'proc-stop',
      target: 'req-safety',
      type: 'opmEdge',
      data: { type: 'satisfies' },
    };

    const snapshot: OpmModelSnapshot = {
      nodes: [reqNode, procNode],
      edges: [satisfiesEdge],
    };

    const model = deriveOpmTraceabilityModel(snapshot, 1);
    expect(model.coveredCount).toBe(1);
    expect(model.uncoveredCount).toBe(0);
    expect(model.rows[0].status).toBe('covered');
    expect(model.rows[0].satisfiedByNodeIds).toContain('proc-stop');
  });

  it('marks requirement as verified when evidence matches the current model revision and passed is true', () => {
    const satisfiesEdge: AppEdge = {
      id: 'e-satisfies',
      source: 'proc-stop',
      target: 'req-safety',
      type: 'opmEdge',
      data: { type: 'satisfies' },
    };

    const snapshot: OpmModelSnapshot = {
      nodes: [reqNode, procNode],
      edges: [satisfiesEdge],
    };

    const evidenceMap: Record<string, OpmRequirementEvidence> = {
      'req-safety': {
        verifiedRevision: 2,
        passed: true,
        verifiedAt: '2026-09-08T12:00:00Z',
      },
    };

    const model = deriveOpmTraceabilityModel(snapshot, 2, evidenceMap);
    expect(model.verifiedCount).toBe(1);
    expect(model.rows[0].status).toBe('verified');
    expect(model.rows[0].isStale).toBe(false);
  });

  it('marks requirement as stale when evidence revision lags behind the current model revision', () => {
    const satisfiesEdge: AppEdge = {
      id: 'e-satisfies',
      source: 'proc-stop',
      target: 'req-safety',
      type: 'opmEdge',
      data: { type: 'satisfies' },
    };

    const snapshot: OpmModelSnapshot = {
      nodes: [reqNode, procNode],
      edges: [satisfiesEdge],
    };

    // Evidence recorded at revision 1, but model is now revision 2
    const evidenceMap: Record<string, OpmRequirementEvidence> = {
      'req-safety': {
        verifiedRevision: 1,
        passed: true,
      },
    };

    const model = deriveOpmTraceabilityModel(snapshot, 2, evidenceMap);
    expect(model.staleCount).toBe(1);
    expect(model.rows[0].status).toBe('stale');
    expect(model.rows[0].isStale).toBe(true);
  });

  it('reconciles simulation state and purges dead nodes and edges', () => {
    const simState = createSimulationState();
    simState.objectActiveState = {
      'obj-surviving': 'st-surviving',
      'obj-deleted': 'st-dead',
      'obj-st-deleted': 'st-dead',
    };
    simState.pendingEvents = [
      { objectId: 'obj-surviving', stateId: 'st-surviving', tick: 1 },
      { objectId: 'obj-deleted', stateId: 'st-dead', tick: 2 },
    ];
    simState.lastChangeTick = {
      'proc-surviving': 5,
      'proc-deleted': 3,
    };
    simState.lastLoggedBlock = {
      'proc-surviving': 'Waiting on event',
      'proc-deleted': 'Blocked',
    };
    simState.trace = [
      {
        tick: 1,
        processId: 'proc-surviving',
        processName: 'Proc Surviving',
        kind: 'fired',
        stateChanges: [{ objectId: 'obj-surviving', fromStateId: null, toStateId: 'st-surviving' }],
      },
      {
        tick: 2,
        processId: 'proc-deleted',
        processName: 'Proc Deleted',
        kind: 'fired',
        stateChanges: [{ objectId: 'obj-deleted', fromStateId: null, toStateId: 'st-dead' }],
      },
    ];

    const survivingNodeIds = new Set(['obj-surviving', 'st-surviving', 'proc-surviving', 'obj-st-deleted']);
    const survivingEdgeIds = new Set(['e-1']);

    const reconciled = reconcileSimulationState(simState, survivingNodeIds, survivingEdgeIds);

    // obj-deleted purged completely
    expect(reconciled.objectActiveState['obj-deleted']).toBeUndefined();
    // obj-surviving preserved
    expect(reconciled.objectActiveState['obj-surviving']).toBe('st-surviving');
    // obj-st-deleted had state deleted, so state is nullified
    expect(reconciled.objectActiveState['obj-st-deleted']).toBeNull();

    // pendingEvents purged
    expect(reconciled.pendingEvents).toHaveLength(1);
    expect(reconciled.pendingEvents[0].objectId).toBe('obj-surviving');

    // lastChangeTick & lastLoggedBlock purged
    expect(reconciled.lastChangeTick['proc-deleted']).toBeUndefined();
    expect(reconciled.lastChangeTick['proc-surviving']).toBe(5);
    expect(reconciled.lastLoggedBlock['proc-deleted']).toBeUndefined();

    // trace entries purged
    expect(reconciled.trace).toHaveLength(1);
    expect(reconciled.trace[0].processId).toBe('proc-surviving');
  });

  it('resets code generation state to draft and disables download/HIL export on model revision', () => {
    const verifiedState: OpmArtifactState = {
      lifecycle: 'verified',
      currentFingerprint: 'fp-123',
      generatedFingerprint: 'fp-123',
      verifiedFingerprint: 'fp-123',
      files: [{ name: 'model.c', content: '...' }],
      manifest: null,
      diagnostics: [],
      evidence: { hostCompile: 'pass', hostRuntime: 'pass' },
      errors: [],
      verifiedAt: '2026-09-08T12:00:00Z',
      toolchainVersion: '1.0.0',
    };

    expect(canDownload(verifiedState)).toBe(true);
    expect(canRunHil(verifiedState)).toBe(true);

    const resetState = resetToDraft(verifiedState);
    expect(resetState.lifecycle).toBe('draft');
    expect(resetState.verifiedFingerprint).toBeNull();
    expect(resetState.evidence).toBeNull();

    // Gating check: download and HIL export must fail closed
    expect(canDownload(resetState)).toBe(false);
    expect(canRunHil(resetState)).toBe(false);
  });
});
