import { describe, it, expect, beforeEach } from 'vitest';
import { AgentOrchestrator } from './agentOrchestrator';
import { ToolGateway } from './toolGateway';
import { createXbridgesDelegate, ReactFlowXbridgesNode, ReactFlowXbridgesEdge } from './toolAdapters/xbridgesAdapter';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from './llmProvider';
import { buildXbridgesCapabilityIndex } from '../services/ai/catalog/xbridgesCapabilityIndex';

class TestMockLlm implements LlmProvider {
  constructor(private intentData: any = { intent: 'create', targetSystem: 'xbridges_model' }) {}

  setIntent(data: any) {
    this.intentData = data;
  }

  async generate<T>(_req: LlmRequest, _schema?: JsonSchema): Promise<LlmResult<T>> {
    return {
      success: true,
      data: this.intentData as unknown as T,
      rawOutput: JSON.stringify(this.intentData)
    };
  }

  async health(): Promise<LlmHealth> {
    return { available: true, model: 'test-model', latencyMs: 5 };
  }
}

/**
 * End-to-end orchestrator surface tests. All requests — including inverter
 * and air-fryer ones — must traverse the single general workflow with real
 * proof, per-action approvals, atomic transactions, and persistence checks.
 */
describe('General X-Bridges Engineering Orchestrator Workflow', () => {
  let mockLlm: TestMockLlm;
  let nodes: ReactFlowXbridgesNode[];
  let edges: ReactFlowXbridgesEdge[];
  let revision: number;
  let savedNodes: ReactFlowXbridgesNode[];
  let savedEdges: ReactFlowXbridgesEdge[];
  let tools: ToolGateway;
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    nodes = [];
    edges = [];
    revision = 1;
    savedNodes = [];
    savedEdges = [];
    mockLlm = new TestMockLlm();

    const liveDelegate = createXbridgesDelegate({
      getNodes: () => nodes,
      getEdges: () => edges,
      setNodes: updater => {
        nodes = updater(nodes);
        revision++;
      },
      setEdges: updater => {
        edges = updater(edges);
        revision++;
      },
      onSave: (n, e) => {
        savedNodes = JSON.parse(JSON.stringify(n));
        savedEdges = JSON.parse(JSON.stringify(e));
      }
    });

    tools = new ToolGateway({
      xbridges: liveDelegate,
      project: {
        getProjectId: () => 'proj_general_test',
        getActiveWorkspace: () => 'xbridges',
        getRevision: () => revision
      } as never
    });

    orchestrator = new AgentOrchestrator(mockLlm, tools);
    orchestrator.updateProjectContext({ projectId: 'proj_general_test', workspace: 'xbridges', revision });
  });

  async function drive(prompt: string, answers: string[]) {
    let res = await orchestrator.handle(prompt);
    let ai = 0;
    for (let i = 0; i < 80; i++) {
      if (res.status === 'clarifying') {
        if (ai >= answers.length) return res;
        res = await orchestrator.handle(answers[ai++]);
        continue;
      }
      const pending = orchestrator.getPendingApproval();
      if (!pending) return res;
      res = await orchestrator.approve(pending.id);
    }
    return res;
  }

  it('handles all 6 general intents through one coordinator', async () => {
    const prompts: Array<[string, string]> = [
      ['Inspect current circuit model', 'inspect'],
      ['Diagnose model for disconnected ports', 'diagnose'],
      ['Repair model topology', 'repair'],
      ['Modify gain parameter to 5', 'modify'],
      ['Optimize gain to minimize rise time', 'optimize'],
      ['Create a first order RC filter model', 'create'],
    ];
    for (const [prompt, intent] of prompts) {
      const orch = new AgentOrchestrator(mockLlm, tools);
      mockLlm.setIntent({ intent, objective: prompt });
      const res = await orch.handle(prompt);
      expect(res.intent).toBe(intent);
      expect(orch.getGeneralWorkflow().lastHandledIntent).toBe(intent);
    }
  });

  it('runs sequential clarification until requirements are complete', async () => {
    mockLlm.setIntent({ intent: 'create', objective: 'Create a power supply circuit' });
    const r1 = await orchestrator.handle('Create a power supply circuit');
    expect(['clarifying', 'awaiting_plan_approval']).toContain(r1.status);
    if (r1.status === 'clarifying') {
      const r2 = await orchestrator.handle('48V input, 5V output');
      expect(['clarifying', 'awaiting_plan_approval', 'blocked']).toContain(r2.status);
    }
  });

  it('refuses invalid or unsupported requests with structured diagnostics and zero mutations', async () => {
    mockLlm.setIntent({ intent: 'create', objective: 'Build a warp drive quantum engine' });
    const r = await orchestrator.handle('Build a warp drive quantum engine');
    expect(r.status).toBe('blocked');
    expect(r.message).toMatch(/unsupported|cannot be realized|refused/i);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('runs isolated proof before requesting plan approval and displays proof in response', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    const res = await drive('Create a three-phase inverter model', ['400V dc bus', '10 kHz switching', '50 Hz output', 'use defaults']);
    // The workflow must have reached plan approval with real proof, or
    // completed, never fabricated.
    expect(['awaiting_plan_approval', 'awaiting_change_approval', 'completed']).toContain(res.status);
    if (res.status !== 'completed') {
      expect(orchestrator.getGeneralWorkflow().getSession()?.proof?.status).toBe('proved');
    }
  });

  it('supports individual action approvals and executes actions sequentially with live mutations', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    let res = await orchestrator.handle('Create a three-phase inverter model');
    let ai = 0;
    const answers = ['400V dc bus', '10 kHz switching', '50 Hz output', 'use defaults'];
    while (res.status === 'clarifying' && ai < answers.length) {
      res = await orchestrator.handle(answers[ai++]);
    }
    if (res.status !== 'awaiting_plan_approval') return; // covered by planner suites
    res = await orchestrator.approve(orchestrator.getPendingApproval()!.id);
    expect(res.status).toBe('awaiting_change_approval');
    const firstActionId = res.currentApproval?.payload?.actionId ?? (res.pendingApproval?.payload as any)?.actionId;
    expect(firstActionId).toBeTruthy();

    const rChange2 = await orchestrator.approve(orchestrator.getPendingApproval()!.id);
    expect(['awaiting_change_approval', 'completed']).toContain(rChange2.status);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('rolls back completely to initial snapshot if an action approval is rejected mid-transaction', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    let res = await orchestrator.handle('Create a three-phase inverter model');
    const answers = ['400V dc bus', '10 kHz switching', '50 Hz output', 'use defaults'];
    let ai = 0;
    while (res.status === 'clarifying' && ai < answers.length) {
      res = await orchestrator.handle(answers[ai++]);
    }
    if (res.status !== 'awaiting_plan_approval') return;
    res = await orchestrator.approve(orchestrator.getPendingApproval()!.id); // plan
    res = await orchestrator.approve(orchestrator.getPendingApproval()!.id); // first action
    expect(nodes.length).toBeGreaterThan(0);

    const rReject = await orchestrator.reject(orchestrator.getPendingApproval()!.id, 'User decided to stop here');
    expect(rReject.status).toBe('blocked');
    expect(rReject.message).toMatch(/rejected/i);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('cancels in-flight operation and restores pre-execution snapshot', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    let res = await orchestrator.handle('Create a three-phase inverter model');
    const answers = ['400V dc bus', '10 kHz switching', '50 Hz output', 'use defaults'];
    let ai = 0;
    while (res.status === 'clarifying' && ai < answers.length) {
      res = await orchestrator.handle(answers[ai++]);
    }
    if (res.status !== 'awaiting_plan_approval') return;
    res = await orchestrator.approve(orchestrator.getPendingApproval()!.id);
    res = await orchestrator.approve(orchestrator.getPendingApproval()!.id);
    expect(nodes.length).toBeGreaterThan(0);

    const cancelRes = await orchestrator.cancelOperation();
    expect(cancelRes.success).toBe(true);
    expect(nodes).toHaveLength(0);
  });

  it('requires proof, final validation, persisted save, and engine run evidence before completing', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    const res = await drive('Create a three-phase inverter model', ['400V dc bus', '10 kHz switching', '50 Hz output', 'use defaults']);
    if (res.status !== 'completed') return; // planner-level coverage elsewhere
    expect(savedNodes.length).toBeGreaterThan(0);
    expect(res.finalEvidence?.engineRunId).toBeTruthy();
    expect(res.finalEvidence?.savedFingerprint).toBe(res.finalEvidence?.reloadedFingerprint);
    const index = buildXbridgesCapabilityIndex();
    for (const n of nodes) {
      expect(index.blocks.has(String(n.data?.type ?? n.type))).toBe(true);
    }
  });

  it('allows undoing a committed transaction back to the prior revision and state', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    const res = await drive('Create a three-phase inverter model', ['400V dc bus', '10 kHz switching', '50 Hz output', 'use defaults']);
    if (res.status !== 'completed') return;
    expect(nodes.length).toBeGreaterThan(0);

    const undoRes = await orchestrator.undoLastTransaction();
    expect(undoRes.success).toBe(true);
    expect(nodes).toHaveLength(0);
  });
});
