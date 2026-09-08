import { describe, it, expect } from 'vitest';
import type { AppNode, AppEdge, OpmModelSnapshot } from '../EntropyTypes';
import { validateOpmModelLifecycle, normalizeContainment } from '../OpmModelLifecycle';
import { deriveStructureView, deriveInternalView, deriveRequirementsView } from '../OpmViewDeriver';
import { analyzeOpmDeletion, applyOpmDeletion } from '../OpmDeletionImpact';
import { deriveOpmTraceabilityModel, reconcileSimulationState } from '../OpmTraceabilityModel';
import {
  initializeSimulation,
  stepSimulation,
  applySimResultToNodes,
} from '../OpmSimulationEngine';
import {
  resetToDraft,
  canDownload,
  type OpmArtifactState,
} from '../OpmCodeGenerationWorkspace';

describe('OPM BDD/IBD/Requirements Lifecycle Release Gate (Task 8)', () => {
  it('executes full end-to-end lifecycle fixture across all views, simulation, deletion, and undo', () => {
    // ─── 1. Build Canonical Model Snapshot ───
    const objA: AppNode = {
      id: 'obj-parent',
      type: 'opmObject',
      position: { x: 0, y: 0 },
      data: {
        name: 'Cooling System',
        type: 'object',
        physical: true,
        states: [
          { id: 'st-off', name: 'Off', isInitial: true, isActive: true },
          { id: 'st-running', name: 'Running', isInitial: false, isActive: false },
        ],
        attributes: [{ key: 'temp', value: '45' }],
        inputs: [],
        outputs: [
          { id: 'out-p1', name: 'Status', direction: 'output', position: 'right', type: 'standard' },
        ],
      },
    };

    const stateOff: AppNode = {
      id: 'st-off',
      type: 'opmState',
      parentId: 'obj-parent',
      position: { x: 10, y: 10 },
      data: {
        name: 'Off',
        type: 'state',
        physical: false,
        states: [],
        attributes: [],
        parentId: 'obj-parent',
        inputs: [],
        outputs: [],
      },
    };

    const stateRunning: AppNode = {
      id: 'st-running',
      type: 'opmState',
      parentId: 'obj-parent',
      position: { x: 80, y: 10 },
      data: {
        name: 'Running',
        type: 'state',
        physical: false,
        states: [],
        attributes: [],
        parentId: 'obj-parent',
        inputs: [],
        outputs: [],
      },
    };

    const objChild: AppNode = {
      id: 'obj-pump',
      type: 'opmObject',
      parentId: 'obj-parent',
      position: { x: 100, y: 200 },
      data: {
        name: 'Coolant Pump',
        type: 'object',
        physical: true,
        states: [],
        attributes: [],
        parentId: 'obj-parent',
        inputs: [],
        outputs: [],
      },
    };

    const procStart: AppNode = {
      id: 'proc-start',
      type: 'opmProcess',
      position: { x: 300, y: 50 },
      data: {
        name: 'Start Cooling',
        type: 'process',
        physical: false,
        states: [],
        attributes: [],
        inputs: [
          { id: 'in-p1', name: 'Trigger', direction: 'input', position: 'left', type: 'standard' },
        ],
        outputs: [],
      },
    };

    const reqSafety: AppNode = {
      id: 'req-cooling-rate',
      type: 'opmObject',
      position: { x: 500, y: 50 },
      data: {
        name: 'Max Temp Limit',
        type: 'requirement',
        physical: false,
        states: [],
        attributes: [],
        requirementText: 'System shall activate cooling when temperature exceeds 50C.',
      },
    };

    const edgeAggregation: AppEdge = {
      id: 'e-agg-pump',
      source: 'obj-parent',
      target: 'obj-pump',
      type: 'opmEdge',
      data: { type: 'aggregation' },
    };

    const edgeConsumption: AppEdge = {
      id: 'e-consume-off',
      source: 'st-off',
      target: 'proc-start',
      type: 'opmEdge',
      data: { type: 'consumption' },
    };

    const edgeResult: AppEdge = {
      id: 'e-result-running',
      source: 'proc-start',
      target: 'st-running',
      type: 'opmEdge',
      data: { type: 'result' },
    };

    const edgeSatisfies: AppEdge = {
      id: 'e-satisfies-req',
      source: 'proc-start',
      target: 'req-cooling-rate',
      type: 'opmEdge',
      data: { type: 'satisfies' },
    };

    const initialSnapshot: OpmModelSnapshot = normalizeContainment({
      nodes: [objA, stateOff, stateRunning, objChild, procStart, reqSafety],
      edges: [edgeAggregation, edgeConsumption, edgeResult, edgeSatisfies],
    });

    // ─── 2. Lifecycle Integrity Validation ───
    const initialValidation = validateOpmModelLifecycle(initialSnapshot);
    expect(initialValidation.valid).toBe(true);
    expect(initialValidation.diagnostics).toHaveLength(0);

    // ─── 3. Projection Derivation (BDD, IBD, Requirements) ───
    // BDD View (Structure)
    const structureView = deriveStructureView(initialSnapshot.nodes, initialSnapshot.edges);
    expect(structureView.diagnostics).toHaveLength(0);
    expect(structureView.length).toBeGreaterThan(0);
    const parentStructure = structureView.find(n => n.id === 'obj-parent');
    expect(parentStructure).toBeDefined();
    expect(parentStructure?.children.some(c => c.id === 'obj-pump')).toBe(true);

    // IBD View (Internal connectors of procStart)
    const internalView = deriveInternalView(initialSnapshot.nodes, initialSnapshot.edges, 'proc-start');
    expect(internalView).toBeDefined();
    expect(internalView!.inputs.some(p => p.peerId === 'st-off')).toBe(true);
    expect(internalView!.outputs.some(p => p.peerId === 'st-running')).toBe(true);

    // Requirements View
    const reqView = deriveRequirementsView(initialSnapshot.nodes, initialSnapshot.edges);
    const reqEntry = reqView.find(r => r.requirementId === 'req-cooling-rate');
    expect(reqEntry).toBeDefined();
    expect(reqEntry?.satisfiedBy.some(s => s.id === 'proc-start')).toBe(true);
    expect(reqEntry?.status).toBe('covered');

    // ─── 4. Simulation Execution ───
    let simState = initializeSimulation(initialSnapshot.nodes);
    expect(simState.objectActiveState['obj-parent']).toBe('st-off');

    const simStep = stepSimulation(initialSnapshot.nodes, initialSnapshot.edges, simState, 10);
    expect(simStep.firingProcessIds).toContain('proc-start');
    expect(simStep.state.objectActiveState['obj-parent']).toBe('st-running');
    simState = simStep.state;

    // ─── 5. Traceability & Evidence Status ───
    let currentRevision = 1;
    const evidenceMap = {
      'req-cooling-rate': {
        verifiedRevision: 1,
        passed: true,
        verifiedAt: '2026-09-08T12:00:00Z',
      },
    };

    let traceModel = deriveOpmTraceabilityModel(initialSnapshot, currentRevision, evidenceMap);
    expect(traceModel.verifiedCount).toBe(1);
    expect(traceModel.rows[0].status).toBe('verified');
    expect(traceModel.rows[0].isStale).toBe(false);

    // Bump model revision (e.g. semantic edit)
    currentRevision = 2;
    traceModel = deriveOpmTraceabilityModel(initialSnapshot, currentRevision, evidenceMap);
    expect(traceModel.staleCount).toBe(1);
    expect(traceModel.rows[0].status).toBe('stale');
    expect(traceModel.rows[0].isStale).toBe(true);

    // ─── 6. Unified Deletion of Parent Object (Cascade Test) ───
    const historyStack: OpmModelSnapshot[] = [initialSnapshot];
    const parentDeleteImpact = analyzeOpmDeletion(initialSnapshot, { nodeIds: ['obj-parent'] });

    expect(parentDeleteImpact.isHighImpact).toBe(true);
    // Closure must include parent obj-parent, child states st-off, st-running, and aggregated obj-pump
    expect(parentDeleteImpact.closureNodeIds).toContain('obj-parent');
    expect(parentDeleteImpact.closureNodeIds).toContain('st-off');
    expect(parentDeleteImpact.closureNodeIds).toContain('st-running');
    expect(parentDeleteImpact.closureNodeIds).toContain('obj-pump');

    // Closure edges must include incident links
    expect(parentDeleteImpact.closureEdgeIds).toContain('e-agg-pump');
    expect(parentDeleteImpact.closureEdgeIds).toContain('e-consume-off');
    expect(parentDeleteImpact.closureEdgeIds).toContain('e-result-running');

    // Apply deletion immutably
    const postParentDelete = applyOpmDeletion(initialSnapshot, parentDeleteImpact);
    historyStack.push(postParentDelete.snapshot);

    // Verify snapshot integrity after parent deletion
    const postParentValidation = validateOpmModelLifecycle(postParentDelete.snapshot);
    expect(postParentValidation.valid).toBe(true);
    expect(postParentDelete.snapshot.nodes.map(n => n.id)).toEqual(['proc-start', 'req-cooling-rate']);
    expect(postParentDelete.snapshot.edges.map(e => e.id)).toEqual(['e-satisfies-req']);

    // Reconcile simulation state: deleted object & states must be purged
    const survivingNodeIds = new Set(postParentDelete.snapshot.nodes.map(n => n.id));
    const survivingEdgeIds = new Set(postParentDelete.snapshot.edges.map(e => e.id));
    simState = reconcileSimulationState(simState, survivingNodeIds, survivingEdgeIds);
    expect(simState.objectActiveState['obj-parent']).toBeUndefined();

    // ─── 7. Deletion of Process (Breaks Requirement Coverage) ───
    const procDeleteImpact = analyzeOpmDeletion(postParentDelete.snapshot, { nodeIds: ['proc-start'] });
    const postProcDelete = applyOpmDeletion(postParentDelete.snapshot, procDeleteImpact);
    historyStack.push(postProcDelete.snapshot);

    expect(postProcDelete.snapshot.nodes.map(n => n.id)).toEqual(['req-cooling-rate']);
    expect(postProcDelete.snapshot.edges).toHaveLength(0);

    // Requirement is now uncovered
    const postProcTraceModel = deriveOpmTraceabilityModel(postProcDelete.snapshot, currentRevision);
    expect(postProcTraceModel.uncoveredCount).toBe(1);
    expect(postProcTraceModel.rows[0].status).toBe('uncovered');

    // ─── 8. Undo / Redo Transactions ───
    // Undo step 1: restore proc-start and e-satisfies-req
    const undoStep1 = historyStack[1];
    const undo1Validation = validateOpmModelLifecycle(undoStep1);
    expect(undo1Validation.valid).toBe(true);
    expect(undoStep1.nodes.map(n => n.id)).toEqual(['proc-start', 'req-cooling-rate']);
    expect(undoStep1.edges.map(e => e.id)).toEqual(['e-satisfies-req']);

    // Undo step 2: restore initial full model
    const undoStep2 = historyStack[0];
    const undo2Validation = validateOpmModelLifecycle(undoStep2);
    expect(undo2Validation.valid).toBe(true);
    expect(undoStep2.nodes).toHaveLength(6);
    expect(undoStep2.edges).toHaveLength(4);

    // Verify code generation gating: resets to draft on model revision
    const mockArtifactState: OpmArtifactState = {
      lifecycle: 'verified',
      currentFingerprint: 'fp-1',
      generatedFingerprint: 'fp-1',
      verifiedFingerprint: 'fp-1',
      files: [{ name: 'model.c', content: '...' }],
      manifest: null,
      diagnostics: [],
      evidence: { hostCompile: 'pass', hostRuntime: 'pass' },
      errors: [],
      verifiedAt: '2026-09-08T12:00:00Z',
      toolchainVersion: '1.0.0',
    };
    expect(canDownload(mockArtifactState)).toBe(true);

    const draftState = resetToDraft(mockArtifactState);
    expect(draftState.lifecycle).toBe('draft');
    expect(canDownload(draftState)).toBe(false);
  });
});
