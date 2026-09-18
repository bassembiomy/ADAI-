import { describe, it, expect, vi } from 'vitest';
import {
  LiveXbridgesModelAdapter,
  computeModelSnapshotHash
} from './liveXbridgesModelAdapter';
import {
  createXbridgesDelegate,
  ReactFlowXbridgesNode,
  ReactFlowXbridgesEdge
} from '../../../agent/toolAdapters/xbridgesAdapter';
import { EngineeringModelPlan } from '../contracts/engineeringModel';

function createLiveStore() {
  let nodes: ReactFlowXbridgesNode[] = [];
  let edges: ReactFlowXbridgesEdge[] = [];
  let saveCount = 0;

  const delegate = createXbridgesDelegate({
    getNodes: () => nodes,
    getEdges: () => edges,
    setNodes: (updater) => {
      nodes = typeof updater === 'function' ? updater(nodes) : updater;
    },
    setEdges: (updater) => {
      edges = typeof updater === 'function' ? updater(edges) : updater;
    },
    onSave: () => {
      saveCount++;
    }
  });

  return {
    delegate,
    getRawNodes: () => nodes,
    getRawEdges: () => edges,
    getSaveCount: () => saveCount,
    setRawNodes: (n: ReactFlowXbridgesNode[]) => { nodes = n; },
    setRawEdges: (e: ReactFlowXbridgesEdge[]) => { edges = e; }
  };
}

describe('LiveXbridgesModelAdapter', () => {
  const validTwoBlockPlan: EngineeringModelPlan = {
    schemaVersion: '1.0.0',
    planId: 'plan_two_block',
    projectId: 'test_proj',
    baseRevision: 1,
    targetDomain: 'xbridges',
    designRationale: 'Connect DC source to PWM modulator reference',
    assumptions: [],
    blocks: [
      {
        id: 'b_ref',
        blockDefinitionId: 'VOLTAGE_REFERENCE_GENERATOR',
        domain: 'xbridges',
        name: 'Ref Gen',
        parameters: [{ blockId: 'b_ref', parameterName: 'frequency', value: 50 }]
      },
      {
        id: 'b_pwm',
        blockDefinitionId: 'THREE_PHASE_PWM',
        domain: 'xbridges',
        name: 'PWM Gen',
        parameters: [{ blockId: 'b_pwm', parameterName: 'frequency', value: 10000 }]
      }
    ],
    connections: [
      {
        id: 'c_ref_to_pwm',
        fromBlockId: 'b_ref',
        fromPortId: 'va',
        toBlockId: 'b_pwm',
        toPortId: 'va_ref',
        domain: 'xbridges'
      }
    ],
    validationCriteria: []
  };

  it('applies a valid plan to a live stateful delegate and verifies real node/edge creation', async () => {
    const store = createLiveStore();
    let currentRev = 1;

    const adapter = new LiveXbridgesModelAdapter(store.delegate, {
      projectId: 'test_proj',
      getRevision: () => currentRev,
      setRevision: (r) => { currentRev = r; }
    });

    const initial = await adapter.inspect();
    expect(initial.nodes).toHaveLength(0);
    expect(initial.edges).toHaveLength(0);
    expect(initial.revision).toBe(1);

    const result = await adapter.apply(validTwoBlockPlan);
    expect(result.success).toBe(true);
    expect(result.newRevision).toBe(2);
    expect(currentRev).toBe(2);
    expect(store.getSaveCount()).toBe(1);

    // Assert live delegate state actually changed
    const inspection = await adapter.inspect();
    expect(inspection.nodes).toHaveLength(2);
    expect(inspection.edges).toHaveLength(1);
    expect(inspection.revision).toBe(2);

    // Verify logical ID mapping was populated
    expect(result.logicalToNodeIdMap['b_ref']).toBeDefined();
    expect(result.logicalToNodeIdMap['b_pwm']).toBeDefined();

    // Verify raw delegate storage matches
    expect(store.getRawNodes()).toHaveLength(2);
    expect(store.getRawEdges()).toHaveLength(1);
  });

  it('fails an integration test if the delegate does not change state (detects fake delegates)', async () => {
    // A fake delegate that records calls but never modifies its state
    const fakeDelegate: any = {
      getNodes: vi.fn().mockResolvedValue([]),
      getEdges: vi.fn().mockResolvedValue([]),
      addBlock: vi.fn().mockResolvedValue({ id: 'mock_node', type: 'mock', data: {} }),
      connectPorts: vi.fn().mockResolvedValue({ id: 'mock_edge', source: 'a', target: 'b' }),
      updateParameters: vi.fn().mockResolvedValue({ id: 'mock_node', type: 'mock', data: {} }),
      save: vi.fn().mockResolvedValue(undefined),
      restoreSnapshot: vi.fn().mockResolvedValue(undefined)
    };

    const adapter = new LiveXbridgesModelAdapter(fakeDelegate, {
      projectId: 'test_proj',
      getRevision: () => 1
    });

    await adapter.apply(validTwoBlockPlan);

    // Inspection MUST show 0 nodes if the delegate was a fake that didn't mutate state
    const inspection = await adapter.inspect();
    expect(inspection.nodes).toHaveLength(0); // Proves inspect reads live delegate state
  });

  it('rejects stale base revision before writing any blocks or mutating state', async () => {
    const store = createLiveStore();
    let currentRev = 5; // Current is 5, but plan is 1

    const adapter = new LiveXbridgesModelAdapter(store.delegate, {
      projectId: 'test_proj',
      getRevision: () => currentRev,
      setRevision: (r) => { currentRev = r; }
    });

    const result = await adapter.apply(validTwoBlockPlan);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Stale revision');
    expect(result.diagnostics?.some(d => d.code === 'STALE_BASE_REVISION')).toBe(true);

    // Zero mutations
    expect(store.getRawNodes()).toHaveLength(0);
    expect(store.getRawEdges()).toHaveLength(0);
    expect(store.getSaveCount()).toBe(0);
    expect(currentRev).toBe(5);
  });

  it('rejects unknown parameters before writing to the delegate', async () => {
    const store = createLiveStore();
    let currentRev = 1;

    const adapter = new LiveXbridgesModelAdapter(store.delegate, {
      projectId: 'test_proj',
      getRevision: () => currentRev,
      setRevision: (r) => { currentRev = r; }
    });

    const planWithBadParam: EngineeringModelPlan = {
      ...validTwoBlockPlan,
      blocks: [
        {
          id: 'b_ref',
          blockDefinitionId: 'VOLTAGE_REFERENCE_GENERATOR',
          domain: 'xbridges',
          name: 'Ref Gen',
          parameters: [
            {
              blockId: 'b_ref',
              parameterName: 'completely_unknown_bogus_param_xyz',
              value: 999
            }
          ]
        }
      ],
      connections: []
    };

    const result = await adapter.apply(planWithBadParam);
    expect(result.success).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'UNKNOWN_PARAMETER')).toBe(true);

    // Zero mutations
    expect(store.getRawNodes()).toHaveLength(0);
    expect(store.getSaveCount()).toBe(0);
  });

  it('restores the exact initial snapshot after a mid-plan connection failure', async () => {
    const store = createLiveStore();
    let currentRev = 1;

    const adapter = new LiveXbridgesModelAdapter(store.delegate, {
      projectId: 'test_proj',
      getRevision: () => currentRev,
      setRevision: (r) => { currentRev = r; }
    });

    // Plan with a bad target port on the connection (will fail at connectPorts phase)
    const planWithFailingConnection: EngineeringModelPlan = {
      ...validTwoBlockPlan,
      connections: [
        {
          id: 'c_fail',
          fromBlockId: 'b_ref',
          fromPortId: 'va',
          toBlockId: 'b_pwm',
          toPortId: 'nonexistent_target_port',
          domain: 'xbridges'
        }
      ]
    };

    const result = await adapter.apply(planWithFailingConnection);
    expect(result.success).toBe(false);
    expect(result.error).toContain('nonexistent_target_port');

    // Crucial check: Mid-plan rollback restored exact initial snapshot!
    // The nodes created before the connection error MUST be gone!
    const postRollback = await adapter.inspect();
    expect(postRollback.nodes).toHaveLength(0);
    expect(postRollback.edges).toHaveLength(0);
    expect(postRollback.revision).toBe(1);
    expect(currentRev).toBe(1);
  });

  it('restores previous model snapshot via restore()', async () => {
    const store = createLiveStore();
    let currentRev = 1;

    const adapter = new LiveXbridgesModelAdapter(store.delegate, {
      projectId: 'test_proj',
      getRevision: () => currentRev,
      setRevision: (r) => { currentRev = r; }
    });

    const snapshotBefore = await adapter.inspect();

    // Apply plan successfully
    await adapter.apply(validTwoBlockPlan);
    expect((await adapter.inspect()).nodes).toHaveLength(2);

    // Now restore snapshotBefore
    await adapter.restore(snapshotBefore);

    const snapshotAfterRestore = await adapter.inspect();
    expect(snapshotAfterRestore.nodes).toHaveLength(0);
    expect(snapshotAfterRestore.edges).toHaveLength(0);
    expect(snapshotAfterRestore.revision).toBe(1);
  });
});
