import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentOrchestrator } from './agentOrchestrator';
import { ToolGateway } from './toolGateway';
import { createXbridgesDelegate, ReactFlowXbridgesNode, ReactFlowXbridgesEdge } from './toolAdapters/xbridgesAdapter';
import { createProjectDelegate, createReportDelegate } from './toolAdapters/adiaProjectAdapter';
import { VLabAdapter } from './toolAdapters/vlabAdapter';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from './llmProvider';

class MockLlm implements LlmProvider {
  async generate<T>(_req: LlmRequest, _schema: JsonSchema): Promise<LlmResult<T>> {
    const data = {
      intent: 'CREATE_MODEL',
      targetSystem: 'xbridges-control',
      summary: 'X-BRIDGES Signal Control System',
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

describe('Sequential Action Execution Integration Test (Task 6)', () => {
  let tempReportsDir: string;
  let nodesStore: ReactFlowXbridgesNode[];
  let edgesStore: ReactFlowXbridgesEdge[];
  let savedSnapshot: { nodes: ReactFlowXbridgesNode[]; edges: ReactFlowXbridgesEdge[] } | null;

  beforeEach(() => {
    tempReportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-test-reports-'));
    nodesStore = [];
    edgesStore = [];
    savedSnapshot = null;
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempReportsDir)) {
        fs.rmSync(tempReportsDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('executes full sequential pipeline: instantiate blocks -> connect ports -> configure parameters -> save -> run simulation -> generate report', async () => {
    // 1. Build live X-BRIDGES application delegate connected to in-memory state
    const xbridgesDelegate = createXbridgesDelegate({
      getNodes: () => [...nodesStore],
      getEdges: () => [...edgesStore],
      setNodes: (updater) => {
        nodesStore = updater(nodesStore);
      },
      setEdges: (updater) => {
        edgesStore = updater(edgesStore);
      },
      onSave: (nodes, edges) => {
        savedSnapshot = { nodes: [...nodes], edges: [...edges] };
      },
    });

    // 2. Build live Project context application delegate
    let projectRevision = 1;
    const projectDelegate = createProjectDelegate({
      getProjectId: () => 'AirFryer_Xbridges_Control',
      getActiveWorkspace: () => 'xbridges',
      getRevision: () => projectRevision,
      onRefreshPersistence: async () => {
        await xbridgesDelegate.save();
      },
    });

    // 3. Build live Report application delegate writing to real temp directory
    const reportDelegate = createReportDelegate({
      outputDir: tempReportsDir,
      getProjectData: () => ({
        projectId: 'AirFryer_Xbridges_Control',
        projectName: 'Air Fryer Control Twin',
        modelRevision: projectRevision,
      }),
    });

    // 4. Build simulation runner
    const mockRunner = {
      runSimulation: vi.fn().mockResolvedValue({
        success: true,
        data: { riseTimeSeconds: 150, overshootDegrees: 1.8 },
      }),
      getSimulationStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
    };
    const vlabAdapter = new VLabAdapter(mockRunner);

    // 5. Construct ToolGateway with the real delegates
    const tools = new ToolGateway({
      xbridges: xbridgesDelegate,
      project: projectDelegate,
      report: reportDelegate,
    });
    // Register the simulation adapter
    tools.registerAdapter('run_simulation', vlabAdapter);

    // Verify readiness
    const readiness = tools.getDelegateReadiness();
    expect(readiness.xbridges).toBe(true);
    expect(readiness.report).toBe(true);
    expect(readiness.simulation).toBe(true);

    // 6. Construct AgentOrchestrator
    const orchestrator = new AgentOrchestrator(new MockLlm(), tools);
    orchestrator.updateProjectContext({
      projectId: 'AirFryer_Xbridges_Control',
      workspace: 'xbridges',
      revision: projectRevision,
    });

    // 7. Clarification turns leading to X-BRIDGES specification
    await orchestrator.handle('Build an xbridges signal feedback control system');
    await orchestrator.handle('200°C');
    await orchestrator.handle('1800W');
    await orchestrator.handle('230V AC');
    await orchestrator.handle('NTC 100k');
    await orchestrator.handle('PID');
    await orchestrator.handle('240°C');
    const rSpec = await orchestrator.handle('Reach 200°C in under 4 minutes with overshoot < 5°C');

    expect(rSpec.status).toBe('awaiting_specification_approval');
    expect(rSpec.pendingApproval?.type).toBe('specification');

    // 8. Approve Specification -> Generates Execution Plan
    const rPlan = await orchestrator.approve(rSpec.pendingApproval!.id);
    expect(rPlan.status).toBe('awaiting_plan_approval');
    expect(rPlan.pendingApproval?.type).toBe('plan');
    expect(rPlan.executionPlan).toBeDefined();
    expect(rPlan.executionPlan?.actions).toHaveLength(6);

    // 9. Approve Execution Plan -> Emits first change proposal (Instantiate GAIN)
    const rChange1 = await orchestrator.approve(rPlan.pendingApproval!.id);
    expect(rChange1.status).toBe('awaiting_change_approval');
    expect(rChange1.pendingApproval?.title).toContain('Instantiate Gain Block');
    expect(rChange1.pendingApproval?.payload?.actionType).toBe('instantiate_block');

    // 10. Execute Action 1: Instantiate GAIN Block
    const rChange2 = await orchestrator.approve(rChange1.pendingApproval!.id);
    expect(rChange2.status).toBe('awaiting_change_approval');
    expect(rChange2.pendingApproval?.title).toContain('Instantiate Scope Block');
    expect(nodesStore).toHaveLength(1);
    expect(nodesStore[0].data.type).toBe('GAIN');

    // 11. Execute Action 2: Instantiate Scope Block
    const rChange3 = await orchestrator.approve(rChange2.pendingApproval!.id);
    expect(rChange3.status).toBe('awaiting_change_approval');
    expect(rChange3.pendingApproval?.title).toContain('Connect Gain to Scope');
    expect(nodesStore).toHaveLength(2);
    expect(nodesStore[1].data.type).toBe('Scope');

    // 12. Execute Action 3: Connect Ports (GAIN.y -> Scope.in1)
    const rChange4 = await orchestrator.approve(rChange3.pendingApproval!.id);
    expect(rChange4.status).toBe('awaiting_change_approval');
    expect(rChange4.pendingApproval?.title).toContain('Configure Gain Parameter');
    expect(edgesStore).toHaveLength(1);
    expect(edgesStore[0].sourceHandle).toBe('y');
    expect(edgesStore[0].targetHandle).toBe('in1');

    // 13. Execute Action 4: Configure Parameters (Gain = 5)
    const rChange5 = await orchestrator.approve(rChange4.pendingApproval!.id);
    expect(rChange5.status).toBe('awaiting_change_approval');
    expect(rChange5.pendingApproval?.title).toContain('Run Signal Closed-Loop Simulation');
    expect(nodesStore[0].data.params.gain).toBe(5);

    // 14. Execute Action 5: Run Simulation (verified against criteria)
    const rChange6 = await orchestrator.approve(rChange5.pendingApproval!.id);
    expect(rChange6.status).toBe('awaiting_change_approval');
    expect(rChange6.pendingApproval?.title).toContain('Generate Verification Engineering Report');
    expect(mockRunner.runSimulation).toHaveBeenCalledOnce();
    expect(rChange6.validationResult?.passed).toBe(true);

    // 15. Execute Action 6: Generate Report (real DOCX generation & validation)
    const rFinal = await orchestrator.approve(rChange6.pendingApproval!.id);
    expect(rFinal.status).toBe('completed');
    expect(rFinal.message).toMatch(/completed successfully/i);

    // 16. Verify the generated report on disk
    const history = orchestrator.getAuditHistory();
    const reportAction = history.find(
      (a) => a.eventType === 'ACTION_COMPLETED' && (a.details as any)?.kind === 'generate_report'
    );
    const reportEvidence = reportAction?.details?.evidence as Record<string, unknown> | undefined;
    const reportPath = reportEvidence?.path as string | undefined;

    expect(reportPath).toBeDefined();
    expect(reportPath).toContain('.docx');
    expect(fs.existsSync(reportPath!)).toBe(true);
    const reportStat = fs.statSync(reportPath!);
    expect(reportStat.size).toBeGreaterThan(100);

    // 17. Verify complete audit trail
    const completedActions = history.filter((a) => a.eventType === 'ACTION_COMPLETED');
    expect(completedActions).toHaveLength(6);
    expect(history.some((a) => a.eventType === 'WORKFLOW_COMPLETED')).toBe(true);
  });
});
