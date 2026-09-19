import { describe, it, expect } from 'vitest';
import { diagnoseXbridges, type DiagnosisEvidence, type DiagnosisReport } from './xbridgesDiagnosis';
import { proposeRepairs, type RepairContext, type RepairCandidate } from '../repair/generalRepairPlanner';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';

describe('General Diagnosis and Bounded Repair', () => {
  const catalog = buildXbridgesCapabilityIndex();

  const emptySnapshot: ModelSnapshot = {
    projectId: 'test_proj',
    revision: 1,
    nodes: [],
    edges: [],
    stateHash: 'hash_empty',
    timestamp: Date.now()
  };

  describe('diagnoseXbridges', () => {
    it('diagnoses unsupported block definitions in snapshot', () => {
      const snapshot: ModelSnapshot = {
        ...emptySnapshot,
        nodes: [
          { id: 'b1', type: 'INVALID_BLOCK_ID', data: { label: 'Invalid Block', params: {} }, position: { x: 0, y: 0 } } as any
        ]
      };

      const report = diagnoseXbridges(snapshot, {}, catalog);
      expect(report.status).toBe('has_issues');
      expect(report.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'UNSUPPORTED_BLOCK_IN_CATALOG',
            entityId: 'b1'
          })
        ])
      );
    });

    it('diagnoses unconnected required inputs on blocks', () => {
      const snapshot: ModelSnapshot = {
        ...emptySnapshot,
        nodes: [
          { id: 'gain_1', type: 'GAIN', data: { label: 'Gain', params: {} }, position: { x: 0, y: 0 } } as any
        ]
      };

      const report = diagnoseXbridges(snapshot, {}, catalog);
      expect(report.status).toBe('has_issues');
      expect(report.diagnostics.some(d => d.code === 'UNCONNECTED_REQUIRED_INPUT')).toBe(true);
    });

    it('diagnoses out-of-bounds parameters when metadata or bounds exist', () => {
      const snapshot: ModelSnapshot = {
        ...emptySnapshot,
        nodes: [
          { id: 'step_1', type: 'Step', data: { label: 'Step', params: { time: -10 } }, position: { x: 0, y: 0 } } as any
        ]
      };

      const report = diagnoseXbridges(snapshot, {}, catalog);
      expect(report.diagnostics.some(d => d.code === 'INVALID_PARAMETER_VALUE')).toBe(true);
    });

    it('diagnoses simulation and solver failures from evidence', () => {
      const evidence: DiagnosisEvidence = {
        compileError: 'Syntax error in derivative',
        simulationFailed: true,
        runtimeError: 'Singular matrix in ODE solver',
        engineRunId: 'run_123'
      };

      const report = diagnoseXbridges(emptySnapshot, evidence, catalog);
      expect(report.diagnostics.some(d => d.code === 'SOLVER_RUNTIME_FAILURE')).toBe(true);
      expect(report.evidence?.engineRunId).toBe('run_123');
    });
  });

  describe('proposeRepairs', () => {
    it('generates at most 3 repair candidates sorted deterministically', async () => {
      const snapshot: ModelSnapshot = {
        ...emptySnapshot,
        nodes: [
          { id: 'gain_1', type: 'GAIN', data: { label: 'Gain', params: {} }, position: { x: 100, y: 100 } } as any
        ],
        edges: []
      };

      const report = diagnoseXbridges(snapshot, {}, catalog);
      const context: RepairContext = {
        snapshot,
        catalog,
        projectId: 'test_proj',
        baseRevision: 1
      };

      const candidates = await proposeRepairs(report, context);
      expect(candidates.length).toBeLessThanOrEqual(3);
      if (candidates.length > 0) {
        expect(candidates[0].plan).toBeDefined();
        expect(candidates[0].estimatedDelta).toBeDefined();
        // Check stable order
        const candidates2 = await proposeRepairs(report, context);
        expect(candidates.map(c => c.id)).toEqual(candidates2.map(c => c.id));
      }
    });

    it('refuses to invent repair actions when cause is ambiguous or unrepairable', async () => {
      const unrepairableReport: DiagnosisReport = {
        status: 'has_issues',
        modelFingerprint: 'dummy',
        diagnostics: [
          {
            category: 'SIMULATION',
            code: 'ALGEBRAIC_LOOP',
            severity: 'ERROR',
            message: 'Direct feedthrough algebraic loop detected with no delay'
          }
        ]
      };

      const context: RepairContext = {
        snapshot: emptySnapshot,
        catalog,
        projectId: 'test_proj',
        baseRevision: 1
      };

      const candidates = await proposeRepairs(unrepairableReport, context);
      expect(candidates).toHaveLength(0); // Refuses rather than guessing
    });

    it('proposes bounded parameter repair for negative step time', async () => {
      const snapshot: ModelSnapshot = {
        ...emptySnapshot,
        nodes: [
          { id: 'step_1', type: 'Step', data: { label: 'Step', params: { time: -5 } }, position: { x: 0, y: 0 } } as any
        ],
        edges: []
      };

      const report = diagnoseXbridges(snapshot, {}, catalog);
      const context: RepairContext = {
        snapshot,
        catalog,
        projectId: 'test_proj',
        baseRevision: 1
      };

      const candidates = await proposeRepairs(report, context);
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const firstPlan = candidates[0].plan;
      const paramAction = firstPlan.actions.find(a => a.kind === 'set_parameter');
      expect(paramAction).toBeDefined();
      if (paramAction && paramAction.kind === 'set_parameter') {
        expect(paramAction.parameterName).toBe('time');
        expect(paramAction.value).toBe(0);
      }
    });
  });
});
