import { describe, it, expect } from 'vitest';
import { proposeRepairs, type RepairContext } from './generalRepairPlanner';
import { diagnoseXbridges } from '../diagnosis/xbridgesDiagnosis';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';

describe('generalRepairPlanner Dedicated Tests', () => {
  const catalog = buildXbridgesCapabilityIndex();

  const emptySnapshot: ModelSnapshot = {
    projectId: 'repair_test_proj',
    revision: 1,
    nodes: [],
    edges: [],
    stateHash: 'hash_repair_test',
    timestamp: Date.now()
  };

  it('clamps negative step times into set_parameter repair actions', async () => {
    const snapshot: ModelSnapshot = {
      ...emptySnapshot,
      nodes: [
        { id: 'step_1', type: 'Step', data: { label: 'Step Source', params: { time: -2.5 } }, position: { x: 0, y: 0 } } as any
      ],
      edges: []
    };

    const report = diagnoseXbridges(snapshot, {}, catalog);
    const context: RepairContext = {
      snapshot,
      catalog,
      projectId: 'repair_test_proj',
      baseRevision: 1
    };

    const candidates = await proposeRepairs(report, context);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].plan.actions).toHaveLength(1);
    expect(candidates[0].plan.actions[0]).toEqual(
      expect.objectContaining({
        kind: 'set_parameter',
        blockId: 'step_1',
        parameterName: 'time',
        value: 0
      })
    );
  });

  it('proposes sources for unconnected required inputs and limits to 3 candidates', async () => {
    const snapshot: ModelSnapshot = {
      ...emptySnapshot,
      nodes: [
        { id: 'gain_1', type: 'GAIN', data: { label: 'Gain 1', params: {} }, position: { x: 0, y: 0 } } as any,
        { id: 'gain_2', type: 'GAIN', data: { label: 'Gain 2', params: {} }, position: { x: 100, y: 0 } } as any,
        { id: 'gain_3', type: 'GAIN', data: { label: 'Gain 3', params: {} }, position: { x: 200, y: 0 } } as any,
        { id: 'gain_4', type: 'GAIN', data: { label: 'Gain 4', params: {} }, position: { x: 300, y: 0 } } as any
      ],
      edges: []
    };

    const report = diagnoseXbridges(snapshot, {}, catalog);
    const context: RepairContext = {
      snapshot,
      catalog,
      projectId: 'repair_test_proj',
      baseRevision: 1
    };

    const candidates = await proposeRepairs(report, context);
    expect(candidates.length).toBeLessThanOrEqual(3);
    for (const cand of candidates) {
      expect(cand.plan.schemaVersion).toBe('2.0.0');
      expect(cand.plan.catalogFingerprint).toBe(catalog.catalogFingerprint);
    }
  });
});
