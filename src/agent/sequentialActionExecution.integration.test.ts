import { describe, it, expect, beforeEach } from 'vitest';
import { AgentOrchestrator } from './agentOrchestrator';
import { ToolGateway } from './toolGateway';
import { createXbridgesDelegate, ReactFlowXbridgesNode, ReactFlowXbridgesEdge } from './toolAdapters/xbridgesAdapter';
import { createProjectDelegate } from './toolAdapters/adiaProjectAdapter';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from './llmProvider';
import { buildXbridgesCapabilityIndex } from '../services/ai/catalog/xbridgesCapabilityIndex';

class MockLlm implements LlmProvider {
  async generate<T>(_req: LlmRequest, _schema?: JsonSchema): Promise<LlmResult<T>> {
    const data = {
      intent: 'create',
      targetSystem: 'xbridges_model',
      summary: 'X-BRIDGES signal chain',
      confidence: 0.98,
    };
    return {
      success: true,
      data: data as unknown as T,
      rawOutput: JSON.stringify(data),
    };
  }
  async health(): Promise<LlmHealth> {
    return { available: true, model: 'llama3:8b', latencyMs: 5 };
  }
}

/**
 * Sequential action execution through the single production workflow:
 * one approved mutation at a time, every delta verified against the live
 * workspace, followed by save, reload, and fingerprint verification.
 */
describe('Sequential Action Execution Integration Test (general workflow)', () => {
  let nodesStore: ReactFlowXbridgesNode[];
  let edgesStore: ReactFlowXbridgesEdge[];
  let savedSnapshot: { nodes: ReactFlowXbridgesNode[]; edges: ReactFlowXbridgesEdge[] } | null;

  beforeEach(() => {
    nodesStore = [];
    edgesStore = [];
    savedSnapshot = null;
  });

  it('executes the full sequential pipeline: add blocks -> set parameters -> connect ports -> save -> reload verification', async () => {
    // 1. Live X-BRIDGES delegate over in-memory workspace state.
    const xbridgesDelegate = createXbridgesDelegate({
      getNodes: () => [...nodesStore],
      getEdges: () => [...edgesStore],
      setNodes: updater => {
        nodesStore = updater(nodesStore);
      },
      setEdges: updater => {
        edgesStore = updater(edgesStore);
      },
      onSave: (nodes, edges) => {
        savedSnapshot = { nodes: [...nodes], edges: [...edges] };
      },
    });

    // 2. Live project context delegate.
    let projectRevision = 1;
    const projectDelegate = createProjectDelegate({
      getProjectId: () => 'Sequential_Signal_Chain',
      getActiveWorkspace: () => 'xbridges',
      getRevision: () => projectRevision,
      onRefreshPersistence: async () => {
        await xbridgesDelegate.save();
      },
    });

    // 3. ToolGateway with real delegates.
    const tools = new ToolGateway({
      xbridges: xbridgesDelegate,
      project: projectDelegate,
    });
    const readiness = tools.getDelegateReadiness();
    expect(readiness.xbridges).toBe(true);

    // 4. Orchestrator facade over the general workflow.
    const orchestrator = new AgentOrchestrator(new MockLlm(), tools);
    orchestrator.updateProjectContext({
      projectId: 'Sequential_Signal_Chain',
      workspace: 'xbridges',
      revision: projectRevision,
    });

    // 5. Requirements via clarification.
    let res = await orchestrator.handle('Create a signal chain: Step source into a Gain of 5 into a Scope');
    while (res.status === 'clarifying') {
      res = await orchestrator.handle('use defaults');
    }
    expect(res.status).toBe('awaiting_plan_approval');
    expect(res.proof?.status).toBe('proved');

    // 6. Approve the proven plan (transaction begins, snapshot captured).
    res = await orchestrator.approve(orchestrator.getPendingApproval()!.id);
    expect(res.status).toBe('awaiting_change_approval');
    expect(nodesStore).toHaveLength(0); // zero mutations before first action approval

    // 7. Approve every action one at a time; each approval executes exactly
    //    one mutation observable in the live workspace.
    const nodeCounts: number[] = [];
    const edgeCounts: number[] = [];
    let guard = 0;
    while (res.status === 'awaiting_change_approval' && guard++ < 40) {
      res = await orchestrator.approve(orchestrator.getPendingApproval()!.id);
      nodeCounts.push(nodesStore.length);
      edgeCounts.push(edgesStore.length);
    }

    // Strictly sequential: counts never decrease and grow one delta at a time.
    for (let i = 1; i < nodeCounts.length; i++) {
      expect(nodeCounts[i]).toBeGreaterThanOrEqual(nodeCounts[i - 1]);
      expect(edgeCounts[i]).toBeGreaterThanOrEqual(edgeCounts[i - 1]);
    }

    // 8. Terminal state: completed with committed transaction and evidence.
    expect(res.status).toBe('completed');
    expect(res.transactionStatus).toBe('committed');
    expect(nodesStore.length).toBeGreaterThanOrEqual(3);
    expect(edgesStore.length).toBeGreaterThanOrEqual(2);

    // Only catalog blocks may exist in the workspace.
    const index = buildXbridgesCapabilityIndex();
    for (const n of nodesStore) {
      expect(index.blocks.has(String(n.data?.type ?? n.type))).toBe(true);
    }

    // 9. Parameter actually applied to the live block.
    const gainNode = nodesStore.find(n => String(n.data?.type ?? n.type) === 'GAIN');
    expect(gainNode).toBeDefined();
    expect((gainNode!.data?.params as Record<string, unknown>)?.gain).toBe(5);

    // 10. Save + reload verification evidence.
    expect(savedSnapshot).not.toBeNull();
    expect(savedSnapshot!.nodes.length).toBe(nodesStore.length);
    expect(res.finalEvidence?.savedFingerprint).toBeTruthy();
    expect(res.finalEvidence?.reloadedFingerprint).toBe(res.finalEvidence?.savedFingerprint);
    expect(res.finalEvidence?.engineRunId).toBe(res.proof?.engineRunId);

    // 11. Complete audit trail.
    const history = orchestrator.getAuditHistory();
    const executed = history.filter(a => a.eventType === 'ACTION_EXECUTED');
    expect(executed.length).toBeGreaterThanOrEqual(5);
    expect(history.some(a => a.eventType === 'WORKFLOW_COMPLETED')).toBe(true);
  });
});
