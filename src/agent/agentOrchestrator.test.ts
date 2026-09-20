import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from './agentOrchestrator';
import { ToolGateway } from './toolGateway';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from './llmProvider';
import {
  createXbridgesDelegate,
  ReactFlowXbridgesNode,
  ReactFlowXbridgesEdge
} from './toolAdapters/xbridgesAdapter';
import { buildXbridgesCapabilityIndex } from '../services/ai/catalog/xbridgesCapabilityIndex';

class MockLlmProvider implements LlmProvider {
  public mockResponse: any = {
    intent: 'create',
    targetSystem: 'xbridges_model',
    summary: 'General xbridges request',
    targetBehaviors: ['feed_forward'],
    confidence: 0.95
  };
  public isHealthy = true;

  async generate<T>(_request: LlmRequest, _schema: JsonSchema): Promise<LlmResult<T>> {
    if (!this.isHealthy) {
      return { success: false, error: 'Connection refused: local LLM is offline' };
    }
    return { success: true, data: this.mockResponse as T, rawOutput: JSON.stringify(this.mockResponse) };
  }

  async health(): Promise<LlmHealth> {
    return { available: this.isHealthy, model: 'llama3:8b', latencyMs: 5 };
  }
}

interface LiveHarness {
  tools: ToolGateway;
  nodes(): ReactFlowXbridgesNode[];
  edges(): ReactFlowXbridgesEdge[];
  saves(): number;
  savedNodes(): ReactFlowXbridgesNode[];
  bumpRevision(): void;
  currentRevision(): number;
}

function makeLiveHarness(): LiveHarness {
  let nodesState: ReactFlowXbridgesNode[] = [];
  let edgesState: ReactFlowXbridgesEdge[] = [];
  let revision = 1;
  let saveCount = 0;
  let savedNodes: ReactFlowXbridgesNode[] = [];
  const liveDelegate = createXbridgesDelegate({
    getNodes: () => nodesState,
    getEdges: () => edgesState,
    setNodes: updater => { nodesState = updater(nodesState); revision++; },
    setEdges: updater => { edgesState = updater(edgesState); revision++; },
    onSave: (n, e) => { savedNodes = [...n]; nodesState = [...n]; edgesState = [...e]; saveCount++; }
  });
  const tools = new ToolGateway({
    xbridges: liveDelegate,
    project: {
      getProjectId: () => 'proj_orch_test',
      getActiveWorkspace: () => 'xbridges',
      getRevision: () => revision
    } as never
  });
  return {
    tools,
    nodes: () => nodesState,
    edges: () => edgesState,
    saves: () => saveCount,
    savedNodes: () => savedNodes,
    bumpRevision: () => { revision++; },
    currentRevision: () => revision
  };
}

async function approveUntilTerminal(orch: AgentOrchestrator, maxSteps = 60) {
  let response = await Promise.resolve(null as unknown as Awaited<ReturnType<AgentOrchestrator['handle']>>);
  for (let i = 0; i < maxSteps; i++) {
    const pending = orch.getPendingApproval();
    if (!pending) break;
    response = await orch.approve(pending.id);
  }
  return response;
}

describe('AgentOrchestrator (general workflow facade)', () => {
  it('runs the complete approved lifecycle for a generic Step→Gain→Scope creation', async () => {
    const harness = makeLiveHarness();
    const llm = new MockLlmProvider();
    const orch = new AgentOrchestrator(llm, harness.tools);
    orch.updateProjectContext({ projectId: 'proj_orch_test', workspace: 'xbridges', revision: harness.currentRevision() });

    let res = await orch.handle('Create a signal chain: Step source into a Gain of 2 into a Scope');
    while (res.status === 'clarifying') {
      res = await orch.handle('use defaults');
    }
    expect(res.status).toBe('awaiting_plan_approval');
    expect(res.proof?.status).toBe('proved');
    expect(res.proof?.engineRunId).toBeTruthy();

    const final = await approveUntilTerminal(orch);
    expect(final?.status).toBe('completed');
    expect(final?.transactionStatus).toBe('committed');
    expect(harness.nodes().length).toBeGreaterThanOrEqual(3);
    expect(harness.edges().length).toBeGreaterThanOrEqual(2);
    expect(harness.saves()).toBeGreaterThanOrEqual(1);
    expect(final?.finalEvidence?.savedFingerprint).toBe(final?.finalEvidence?.reloadedFingerprint);
    expect(final?.finalEvidence?.engineRunId).toBe(res.proof?.engineRunId);

    const index = buildXbridgesCapabilityIndex();
    for (const n of harness.nodes()) {
      expect(index.blocks.has(String(n.data?.type ?? n.type))).toBe(true);
    }
  });

  it('fails on a rejected action execution, rolls back atomically, and preserves zero mutations', async () => {
    // Delegate that fails on the first mutation to inject a tool failure.
    let nodesState: ReactFlowXbridgesNode[] = [];
    let edgesState: ReactFlowXbridgesEdge[] = [];
    let revision = 1;
    let firstMutation = true;
    const base = createXbridgesDelegate({
      getNodes: () => nodesState,
      getEdges: () => edgesState,
      setNodes: updater => { nodesState = updater(nodesState); revision++; },
      setEdges: updater => { edgesState = updater(edgesState); revision++; },
      onSave: (n, e) => { nodesState = [...n]; edgesState = [...e]; }
    });
    const failingDelegate = {
      ...base,
      addBlock: async (...args: Parameters<typeof base.addBlock>) => {
        if (firstMutation) {
          firstMutation = false;
          throw new Error('Injected adapter failure');
        }
        return base.addBlock(...args);
      }
    };
    const tools = new ToolGateway({
      xbridges: failingDelegate,
      project: { getProjectId: () => 'p', getActiveWorkspace: () => 'xbridges', getRevision: () => revision } as never
    });
    const orch = new AgentOrchestrator(new MockLlmProvider(), tools);

    let res = await orch.handle('Create a signal chain: Step source into a Gain of 2 into a Scope');
    while (res.status === 'clarifying') res = await orch.handle('use defaults');
    expect(res.status).toBe('awaiting_plan_approval');

    // Approve plan, then the first action approval; execution fails inside adapter.
    const planPending = orch.getPendingApproval();
    const afterPlan = await orch.approve(planPending!.id);
    expect(afterPlan.status).toBe('awaiting_change_approval');
    const actionPending = orch.getPendingApproval();
    const failed = await orch.approve(actionPending!.id);

    expect(failed.status).toBe('failed');
    expect(failed.message).toMatch(/Injected adapter failure/);
    expect(failed.transactionStatus).toBe('rolled_back');
    expect(nodesState).toHaveLength(0);
    expect(edgesState).toHaveLength(0);
  });

  it('throws on approval IDs that do not match a pending request (no reusable tokens)', async () => {
    const harness = makeLiveHarness();
    const orch = new AgentOrchestrator(new MockLlmProvider(), harness.tools);
    await orch.handle('Create a signal chain: Step source into a Gain of 2 into a Scope');
    await expect(orch.approve('app-req-nonexistent')).rejects.toThrow(/No matching pending approval/);
  });

  it('handles user rejection of the plan with zero mutations', async () => {
    const harness = makeLiveHarness();
    const orch = new AgentOrchestrator(new MockLlmProvider(), harness.tools);

    let res = await orch.handle('Create a signal chain: Step source into a Gain of 2 into a Scope');
    while (res.status === 'clarifying') res = await orch.handle('use defaults');
    expect(res.status).toBe('awaiting_plan_approval');

    const rejected = await orch.reject(orch.getPendingApproval()!.id, 'not today');
    expect(rejected.status).toBe('blocked');
    expect(rejected.message).toMatch(/rejected/i);
    expect(harness.nodes()).toHaveLength(0);
    expect(harness.saves()).toBe(0);
  });

  it('gracefully degrades to deterministic parsing when Ollama is offline', async () => {
    const harness = makeLiveHarness();
    const llm = new MockLlmProvider();
    llm.isHealthy = false;
    const orch = new AgentOrchestrator(llm, harness.tools);

    const res = await orch.handle('Create a signal chain: Step source into a Gain of 2 into a Scope');
    // Deterministic keyword classification must still route the request.
    expect(['clarifying', 'awaiting_plan_approval', 'blocked']).toContain(res.status);
    expect(res.intent).toBeDefined();
  });

  it('emits audit events for questions, proofs, approvals, and executed actions', async () => {
    const harness = makeLiveHarness();
    const orch = new AgentOrchestrator(new MockLlmProvider(), harness.tools);

    let res = await orch.handle('Create a signal chain: Step source into a Gain of 2 into a Scope');
    while (res.status === 'clarifying') res = await orch.handle('use defaults');
    await approveUntilTerminal(orch);

    const events = orch.getAuditHistory().map(a => a.eventType);
    expect(events).toContain('PLAN_PROVED');
    expect(events).toContain('PLAN_APPROVAL_REQUESTED');
    expect(events).toContain('ACTION_APPROVAL_REQUESTED');
    expect(events).toContain('ACTION_EXECUTED');
    expect(events).toContain('WORKFLOW_COMPLETED');
  });

  it('rejects stale execution when the live workspace changed after planning', async () => {
    const harness = makeLiveHarness();
    const orch = new AgentOrchestrator(new MockLlmProvider(), harness.tools);

    let res = await orch.handle('Create a signal chain: Step source into a Gain of 2 into a Scope');
    while (res.status === 'clarifying') res = await orch.handle('use defaults');
    expect(res.status).toBe('awaiting_plan_approval');

    // Simulate a concurrent user edit changing the live workspace fingerprint.
    harness.bumpRevision();
    const stale = await orch.approve(orch.getPendingApproval()!.id);
    expect(stale.status).toBe('failed');
    expect(stale.message).toMatch(/STALE_STATE|Transaction could not begin/i);
    expect(harness.nodes()).toHaveLength(0);
  });

  it('fails post-action consistency checks when the adapter leaves dangling edges', async () => {
    // A delegate whose connectPorts appends an edge pointing at nothing must
    // cause the workflow to fail rather than silently commit a broken model.
    let nodesState: ReactFlowXbridgesNode[] = [];
    let edgesState: ReactFlowXbridgesEdge[] = [];
    let revision = 1;
    const base = createXbridgesDelegate({
      getNodes: () => nodesState,
      getEdges: () => edgesState,
      setNodes: updater => { nodesState = updater(nodesState); revision++; },
      setEdges: updater => { edgesState = updater(edgesState); revision++; },
      onSave: (n, e) => { nodesState = [...n]; edgesState = [...e]; }
    });
    const corruptingDelegate = {
      ...base,
      connectPorts: async (...args: Parameters<typeof base.connectPorts>) => {
        const edge = await base.connectPorts(...args);
        // Corrupt live state after the connect.
        edgesState = [...edgesState, { id: 'dangling_edge', source: 'ghost', target: 'ghost2' } as never];
        return edge;
      }
    };
    const tools = new ToolGateway({
      xbridges: corruptingDelegate,
      project: { getProjectId: () => 'p', getActiveWorkspace: () => 'xbridges', getRevision: () => revision } as never
    });
    const orch = new AgentOrchestrator(new MockLlmProvider(), tools);

    let res = await orch.handle('Create a signal chain: Step source into a Gain of 2 into a Scope');
    while (res.status === 'clarifying') res = await orch.handle('use defaults');

    const final = await approveUntilTerminal(orch);
    // Commit read-back compares fingerprints; a corrupted live state cannot
    // silently reach 'completed'.
    expect(['failed']).toContain(final?.status);
  });

  it('rejects unsupported intent with capability-based diagnostics and zero mutations', async () => {
    const harness = makeLiveHarness();
    const orch = new AgentOrchestrator(new MockLlmProvider(), harness.tools);

    const res = await orch.handle('Build an airplane rocket engine propulsion system');
    expect(res.status).toBe('blocked');
    expect(res.message).toMatch(/unsupported|cannot be realized|refused/i);
    expect(harness.nodes()).toHaveLength(0);
    expect(harness.edges()).toHaveLength(0);
  });

  it('keeps a pending approval when the live workspace gateway is refreshed', async () => {
    const harness = makeLiveHarness();
    const orch = new AgentOrchestrator(new MockLlmProvider(), harness.tools);

    let res = await orch.handle('Create a signal chain: Step source into a Gain of 2 into a Scope');
    while (res.status === 'clarifying') res = await orch.handle('use defaults');
    expect(res.status).toBe('awaiting_plan_approval');
    const pendingId = orch.getPendingApproval()?.id;

    orch.setToolGateway(harness.tools);
    // After gateway refresh the session restarts; the old approval id must not
    // be reusable.
    await expect(orch.approve(pendingId!)).rejects.toThrow(/No matching pending approval/);
  });
});

describe('AgentOrchestrator general workflow routing', () => {
  const intents: Array<{ prompt: string; intent: string }> = [
    { prompt: 'Create a signal chain: Step source into a Gain of 2 into a Scope', intent: 'create' },
    { prompt: 'Inspect current schematic', intent: 'inspect' },
    { prompt: 'Modify gain parameter to 5', intent: 'modify' },
    { prompt: 'Diagnose model for disconnected ports', intent: 'diagnose' },
    { prompt: 'Repair model topology', intent: 'repair' },
    { prompt: 'Optimize gain to minimize rise time', intent: 'optimize' },
    { prompt: 'Create a three-phase inverter model', intent: 'create' },
    { prompt: 'Create an air fryer thermal control model', intent: 'create' },
  ];

  for (const { prompt, intent } of intents) {
    it(`routes "${prompt.slice(0, 40)}..." through the single general workflow`, async () => {
      const llm = new MockLlmProvider();
      llm.mockResponse = { intent, targetSystem: 'xbridges_model', summary: prompt, confidence: 0.9 };
      const harness = makeLiveHarness();
      const orch = new AgentOrchestrator(llm, harness.tools);

      const res = await orch.handle(prompt);

      const workflow = orch.getGeneralWorkflow();
      expect(workflow, 'orchestrator must expose the general xbridges workflow').toBeDefined();
      expect(workflow.lastHandledIntent, 'the general workflow must have handled the request').toBe(intent);
      expect(res.intent).toBe(intent);
    });
  }
});
