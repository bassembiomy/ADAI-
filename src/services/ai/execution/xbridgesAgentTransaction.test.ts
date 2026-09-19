import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  XbridgesAgentTransaction,
  ActionApprovalBinding,
  ProvedPlan,
  TransactionError
} from './xbridgesAgentTransaction';
import {
  createXbridgesDelegate,
  ReactFlowXbridgesNode,
  ReactFlowXbridgesEdge
} from '../../../agent/toolAdapters/xbridgesAdapter';
import { LiveXbridgesModelAdapter } from '../adapters/liveXbridgesModelAdapter';
import { EngineeringModelPlanV2, XbridgesAction } from '../contracts/engineeringModel';
import { computeModelFingerprint } from '../../../engine/opm/canonicalHash';

describe('XbridgesAgentTransaction', () => {
  let nodesStore: ReactFlowXbridgesNode[];
  let edgesStore: ReactFlowXbridgesEdge[];
  let currentRevision: number;
  let saveCount: number;

  function createTestFixture() {
    nodesStore = [];
    edgesStore = [];
    currentRevision = 1;
    saveCount = 0;

    const delegate = createXbridgesDelegate({
      getNodes: () => [...nodesStore],
      getEdges: () => [...edgesStore],
      setNodes: (updater) => {
        nodesStore = typeof updater === 'function' ? updater(nodesStore) : updater;
      },
      setEdges: (updater) => {
        edgesStore = typeof updater === 'function' ? updater(edgesStore) : updater;
      },
      onSave: () => {
        saveCount++;
      },
    });

    const projectContext = {
      projectId: 'proj_tx_test',
      getRevision: () => currentRevision,
      setRevision: (r: number) => { currentRevision = r; }
    };

    const adapter = new LiveXbridgesModelAdapter(delegate, projectContext);

    return { delegate, adapter, projectContext };
  }

  function createSampleProvedPlan(): ProvedPlan {
    const actions: XbridgesAction[] = [
      {
        id: 'act_1',
        kind: 'add_block',
        blockId: 'gain_1',
        blockDefinitionId: 'GAIN',
        parameters: [{ blockId: 'gain_1', parameterName: 'gain', value: 5 }]
      },
      {
        id: 'act_2',
        kind: 'add_block',
        blockId: 'scope_1',
        blockDefinitionId: 'Scope',
        parameters: []
      },
      {
        id: 'act_3',
        kind: 'connect_ports',
        sourceBlockId: 'gain_1',
        sourcePortId: 'y',
        targetBlockId: 'scope_1',
        targetPortId: 'in1'
      }
    ];

    const planHash = computeModelFingerprint({ actions });

    const plan: EngineeringModelPlanV2 = {
      schemaVersion: '2.0.0',
      planId: 'plan_test_tx',
      planHash,
      projectId: 'proj_tx_test',
      baseRevision: 1,
      catalogFingerprint: 'cat_fp_123',
      expectedBeforeHash: computeModelFingerprint({ nodes: [], edges: [] }),
      expectedAfterDelta: {
        addedBlocks: ['gain_1', 'scope_1'],
        removedBlocks: [],
        modifiedBlocks: [],
        addedConnections: [{ from: 'gain_1', to: 'scope_1' }],
        removedConnections: []
      },
      actions,
      blocks: [
        { id: 'gain_1', blockDefinitionId: 'GAIN', domain: 'xbridges', name: 'Gain 1', parameters: [] },
        { id: 'scope_1', blockDefinitionId: 'Scope', domain: 'xbridges', name: 'Scope 1', parameters: [] }
      ],
      connections: [
        { id: 'c1', fromBlockId: 'gain_1', fromPortId: 'y', toBlockId: 'scope_1', toPortId: 'in1', domain: 'xbridges' }
      ]
    };

    return {
      plan,
      proof: {
        status: 'proved',
        planHash,
        catalogHash: 'cat_fp_123',
        engineRunId: 'eng_run_proof_1',
        diagnostics: [],
        observables: { verified: 1 }
      }
    };
  }

  function makeBinding(
    token: string,
    action: XbridgesAction,
    plan: EngineeringModelPlanV2,
    overrides: Partial<ActionApprovalBinding> = {}
  ): ActionApprovalBinding {
    return {
      token,
      projectId: plan.projectId,
      baseRevision: plan.baseRevision,
      planHash: plan.planHash,
      actionId: action.id,
      actionKind: action.kind,
      canonicalParamsHash: computeModelFingerprint(action),
      ...overrides
    };
  }

  // -------------------------------------------------------------------------
  // Failure Injection & Rollback Tests
  // -------------------------------------------------------------------------

  describe('Failure-injection and atomic rollback', () => {
    it('restores exact live fingerprint when an action fails mid-transaction', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      // Inject failure on third action (connecting invalid port)
      (provedPlan.plan.actions[2] as any).targetPortId = 'nonexistent_port';

      const initialFingerprint = await delegate.getRevisionFingerprint();

      const tx = new XbridgesAgentTransaction(adapter, delegate);
      const state = await tx.begin(provedPlan);
      expect(state.status).toBe('awaiting_action');

      // Approve act_1
      const b1 = makeBinding('tok_1', provedPlan.plan.actions[0], provedPlan.plan);
      await tx.approveAndExecute(b1);
      expect(nodesStore).toHaveLength(1);

      // Approve act_2
      const b2 = makeBinding('tok_2', provedPlan.plan.actions[1], provedPlan.plan);
      await tx.approveAndExecute(b2);
      expect(nodesStore).toHaveLength(2);

      // Approve act_3 -> must fail and automatically rollback entire transaction
      const b3 = makeBinding('tok_3', provedPlan.plan.actions[2], provedPlan.plan);
      await expect(tx.approveAndExecute(b3)).rejects.toThrow();

      expect(tx.getState().status).toBe('rolled_back');
      expect(nodesStore).toHaveLength(0);
      expect(edgesStore).toHaveLength(0);
      expect(await delegate.getRevisionFingerprint()).toBe(initialFingerprint);
    });

    it('rejecting any single action rolls back all previously executed actions', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const initialFingerprint = await delegate.getRevisionFingerprint();

      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await tx.begin(provedPlan);

      // Action 1 approved and executed
      const b1 = makeBinding('tok_1', provedPlan.plan.actions[0], provedPlan.plan);
      await tx.approveAndExecute(b1);
      expect(nodesStore).toHaveLength(1);

      // User rejects Action 2
      const rollback = await tx.reject(provedPlan.plan.actions[1].id);
      expect(rollback.success).toBe(true);
      expect(tx.getState().status).toBe('rolled_back');

      // Whole transaction restored
      expect(nodesStore).toHaveLength(0);
      expect(await delegate.getRevisionFingerprint()).toBe(initialFingerprint);
    });

    it('cancelling a transaction rolls back to initial state', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const initialFingerprint = await delegate.getRevisionFingerprint();

      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await tx.begin(provedPlan);

      const b1 = makeBinding('tok_1', provedPlan.plan.actions[0], provedPlan.plan);
      await tx.approveAndExecute(b1);

      const rollback = await tx.cancel();
      expect(rollback.success).toBe(true);
      expect(tx.getState().status).toBe('rolled_back');
      expect(await delegate.getRevisionFingerprint()).toBe(initialFingerprint);
    });

    it('undo restores exact pre-transaction state after successful commit', async () => {
      const { adapter, delegate, projectContext } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const initialFingerprint = await delegate.getRevisionFingerprint();

      const tx = new XbridgesAgentTransaction(adapter, delegate, projectContext);
      await tx.begin(provedPlan);

      for (let i = 0; i < provedPlan.plan.actions.length; i++) {
        const act = provedPlan.plan.actions[i];
        const b = makeBinding(`tok_${i}`, act, provedPlan.plan);
        await tx.approveAndExecute(b);
      }

      const committed = await tx.commit();
      expect(committed.committedRevision).toBe(2);
      expect(currentRevision).toBe(2);
      expect(nodesStore).toHaveLength(2);

      // Now undo
      const undoRes = await tx.undo(committed.transactionId);
      expect(undoRes.success).toBe(true);
      expect(nodesStore).toHaveLength(0);
      expect(edgesStore).toHaveLength(0);
      expect(currentRevision).toBe(1);
      expect(await delegate.getRevisionFingerprint()).toBe(initialFingerprint);
    });
  });

  // -------------------------------------------------------------------------
  // Approval Security & Bound-Token Tests
  // -------------------------------------------------------------------------

  describe('Approval-security tests', () => {
    it('rejects stale project revision', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await tx.begin(provedPlan);

      const bStale = makeBinding('tok_stale', provedPlan.plan.actions[0], provedPlan.plan, {
        baseRevision: 99
      });
      await expect(tx.approveAndExecute(bStale)).rejects.toThrow(/STALE_REVISION/);
    });

    it('rejects altered parameters hash', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await tx.begin(provedPlan);

      const bAltered = makeBinding('tok_alt', provedPlan.plan.actions[0], provedPlan.plan, {
        canonicalParamsHash: 'altered_tampered_hash_value'
      });
      await expect(tx.approveAndExecute(bAltered)).rejects.toThrow(/PARAM_HASH_MISMATCH/);
    });

    it('rejects wrong action kind', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await tx.begin(provedPlan);

      const bWrongKind = makeBinding('tok_kind', provedPlan.plan.actions[0], provedPlan.plan, {
        actionKind: 'remove_block'
      });
      await expect(tx.approveAndExecute(bWrongKind)).rejects.toThrow(/ACTION_KIND_MISMATCH/);
    });

    it('rejects wrong project ID', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await tx.begin(provedPlan);

      const bWrongProj = makeBinding('tok_proj', provedPlan.plan.actions[0], provedPlan.plan, {
        projectId: 'completely_different_project'
      });
      await expect(tx.approveAndExecute(bWrongProj)).rejects.toThrow(/PROJECT_MISMATCH/);
    });

    it('rejects wrong plan hash', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await tx.begin(provedPlan);

      const bWrongPlan = makeBinding('tok_plan', provedPlan.plan.actions[0], provedPlan.plan, {
        planHash: 'tampered_plan_hash'
      });
      await expect(tx.approveAndExecute(bWrongPlan)).rejects.toThrow(/PLAN_HASH_MISMATCH/);
    });

    it('strictly prevents approval token replay', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await tx.begin(provedPlan);

      const b = makeBinding('single_use_tok', provedPlan.plan.actions[0], provedPlan.plan);
      await tx.approveAndExecute(b);

      // Replay same token
      await expect(tx.approveAndExecute(b)).rejects.toThrow(/TOKEN_ALREADY_CONSUMED/);
    });

    it('rejects out-of-order action execution', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await tx.begin(provedPlan);

      // Try executing action 2 before action 1
      const bOutOfOrder = makeBinding('tok_out', provedPlan.plan.actions[1], provedPlan.plan);
      await expect(tx.approveAndExecute(bOutOfOrder)).rejects.toThrow(/OUT_OF_ORDER_ACTION/);
    });

    it('refuses unproved plan or plan with invalid proof status', async () => {
      const { adapter, delegate } = createTestFixture();
      const provedPlan = createSampleProvedPlan();
      provedPlan.proof.status = 'refused';

      const tx = new XbridgesAgentTransaction(adapter, delegate);
      await expect(tx.begin(provedPlan)).rejects.toThrow(/UNPROVED_PLAN/);
    });
  });
});
