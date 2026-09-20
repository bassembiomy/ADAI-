import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentOrchestrator } from './agentOrchestrator';
import { ToolGateway } from './toolGateway';
import { createXbridgesDelegate, ReactFlowXbridgesNode, ReactFlowXbridgesEdge } from './toolAdapters/xbridgesAdapter';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from './llmProvider';
import { EngineeringPattern, computePatternContentHash, derivePatternId } from '../services/ai/knowledge/patternSchemas';

class TestMockLlm implements LlmProvider {
  constructor(private intentData: any = { intent: 'create', targetSystem: 'rl_circuit' }) {}

  setIntent(data: any) {
    this.intentData = data;
  }

  async generate<T>(_req: LlmRequest, _schema: JsonSchema): Promise<LlmResult<T>> {
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
      } as any
    });

    orchestrator = new AgentOrchestrator(mockLlm, tools);
    orchestrator.updateProjectContext({ projectId: 'proj_general_test', workspace: 'xbridges', revision });
  });

  it('uses verified runtime knowledge and the generic planner for a non-inverter model', async () => {
    const payload = {
      version: 1,
      name: 'Runtime Filter Pattern',
      description: 'A verified low-pass filter pattern',
      domain: 'signal_processing',
      provenance: { source: 'test', author: 'ADIA', license: 'MIT', licenseApproved: true, ingestedAt: 1 },
      lifecycle: 'verified' as const,
      requirements: {
        targetSystem: 'xbridges_model',
        targetBehaviors: ['noise_filtering'],
        requiredInputs: [],
        requiredOutputs: []
      },
      topology: { blocks: [], connections: [] },
      exactMappings: {},
      simulationContract: { minDuration: 1, stepSize: 0.01, expectedObservables: [] },
      evidence: { proofStatus: 'proved' as const, catalogFingerprint: 'catalog', qualityScore: 1 }
    };
    const contentHash = computePatternContentHash(payload);
    const pattern: EngineeringPattern = {
      ...payload,
      id: derivePatternId(payload.name, contentHash),
      contentHash
    };
    const loadPatterns = vi.fn(async () => [pattern]);
    orchestrator = new AgentOrchestrator(mockLlm, tools, loadPatterns);
    orchestrator.updateProjectContext({ projectId: 'proj_general_test', workspace: 'xbridges', revision });

    let response = await orchestrator.handle('Create a low pass filter model for sensor noise filtering');
    expect(response.status).toBe('clarifying');
    response = await orchestrator.handle('5V');
    expect(response.status).toBe('clarifying');
    response = await orchestrator.handle('filtered sensor signal load');
    expect(response.status).toBe('awaiting_specification_approval');

    const planned = await orchestrator.approve(response.pendingApproval!.id);
    expect(loadPatterns).toHaveBeenCalledOnce();
    expect(planned.status, planned.message).toBe('awaiting_plan_approval');
    expect(planned.patternEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ pattern: expect.objectContaining({ id: pattern.id }) })
    ]));
    expect(planned.executionPlan?.actions.some(action => action.params.blockType === 'TRANSFER_FUNCTION')).toBe(true);
    expect(planned.proof?.status).toBe('proved');

    let execution = await orchestrator.approve(planned.pendingApproval!.id);
    while (execution.status === 'awaiting_change_approval' && execution.pendingApproval) {
      execution = await orchestrator.approve(execution.pendingApproval.id);
    }
    expect(execution.status).toBe('completed');
    expect(execution.transactionStatus).toBe('committed');
    expect(nodes.some(node => node.data.type === 'TRANSFER_FUNCTION')).toBe(true);
  });

  it('handles all 6 general intents: create, inspect, modify, diagnose, repair, optimize', async () => {
    // 1. inspect intent
    mockLlm.setIntent({ intent: 'inspect', objective: 'Inspect current circuit model' });
    const rInspect = await orchestrator.handle('Inspect current circuit model');
    expect(['inspect', 'clarifying', 'awaiting_specification_approval', 'completed']).toContain(rInspect.status);
    expect(rInspect.intent || rInspect.taskState?.requirementState?.targetSystem).toBeDefined();

    // Reset orchestrator for next intent
    orchestrator = new AgentOrchestrator(mockLlm, tools);

    // 2. diagnose intent
    mockLlm.setIntent({ intent: 'diagnose', objective: 'Diagnose model for disconnected ports' });
    const rDiag = await orchestrator.handle('Diagnose model for disconnected ports');
    expect(rDiag.taskState).toBeDefined();

    // 3. repair intent
    orchestrator = new AgentOrchestrator(mockLlm, tools);
    mockLlm.setIntent({ intent: 'repair', objective: 'Repair model topology' });
    const rRepair = await orchestrator.handle('Repair model topology');
    expect(rRepair.taskState).toBeDefined();

    // 4. modify intent
    orchestrator = new AgentOrchestrator(mockLlm, tools);
    mockLlm.setIntent({ intent: 'modify', objective: 'Modify gain parameter to 5' });
    const rModify = await orchestrator.handle('Modify gain parameter to 5');
    expect(rModify.taskState).toBeDefined();

    // 5. optimize intent
    orchestrator = new AgentOrchestrator(mockLlm, tools);
    mockLlm.setIntent({ intent: 'optimize', objective: 'Optimize gain to minimize rise time' });
    const rOpt = await orchestrator.handle('Optimize gain to minimize rise time');
    expect(rOpt.taskState).toBeDefined();

    // 6. create intent
    orchestrator = new AgentOrchestrator(mockLlm, tools);
    mockLlm.setIntent({ intent: 'create', objective: 'Create a first order RC filter model' });
    const rCreate = await orchestrator.handle('Create a first order RC filter model');
    expect(rCreate.taskState).toBeDefined();
  });

  it('runs sequential clarification until requirements are complete', async () => {
    mockLlm.setIntent({ intent: 'create', objective: 'Create a power supply circuit' });
    const r1 = await orchestrator.handle('Create a power supply circuit');
    expect(r1.status).toBe('clarifying');
    expect(r1.message).toBeTruthy();

    // Supply missing voltage
    const r2 = await orchestrator.handle('48V');
    expect(['clarifying', 'awaiting_specification_approval']).toContain(r2.status);
  });

  it('refuses invalid or unsupported requests with structured diagnostics and zero mutations', async () => {
    mockLlm.setIntent({ intent: 'create', objective: 'Build a warp drive quantum engine' });
    const r = await orchestrator.handle('Build a warp drive quantum engine');
    expect(r.status).toBe('blocked');
    expect(r.message).toMatch(/unsupported/i);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('runs isolated proof before requesting plan approval and displays proof in response', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    await orchestrator.handle('Create a three-phase inverter model');
    await orchestrator.handle('400V');
    await orchestrator.handle('10000Hz');
    const rSpec = await orchestrator.handle('50Hz');

    expect(rSpec.status).toBe('awaiting_specification_approval');
    const rPlan = await orchestrator.approve(rSpec.pendingApproval!.id);

    expect(rPlan.status).toBe('awaiting_plan_approval');
    expect(rPlan.executionPlan).toBeDefined();
    // Preflight or proof must have passed
    expect(rPlan.preflightResult || rPlan.proof).toBeDefined();
  });

  it('supports individual action approvals and executes actions sequentially with live mutations', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    await orchestrator.handle('Create a three-phase inverter model');
    await orchestrator.handle('400V');
    await orchestrator.handle('10000Hz');
    const rSpec = await orchestrator.handle('50Hz');
    const rPlan = await orchestrator.approve(rSpec.pendingApproval!.id);
    const rChange1 = await orchestrator.approve(rPlan.pendingApproval!.id);

    expect(rChange1.status).toBe('awaiting_change_approval');
    expect(rChange1.pendingApproval?.type).toBe('change');
    const firstActionId = rChange1.pendingApproval?.payload?.actionId;
    expect(firstActionId).toBeDefined();

    // Approve the first change action
    const rChange2 = await orchestrator.approve(rChange1.pendingApproval!.id);
    expect(['awaiting_change_approval', 'completed']).toContain(rChange2.status);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('rolls back completely to initial snapshot if an action approval is rejected mid-transaction', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    await orchestrator.handle('Create a three-phase inverter model');
    await orchestrator.handle('400V');
    await orchestrator.handle('10000Hz');
    const rSpec = await orchestrator.handle('50Hz');
    const rPlan = await orchestrator.approve(rSpec.pendingApproval!.id);
    const rChange1 = await orchestrator.approve(rPlan.pendingApproval!.id);

    // Execute first action
    const rChange2 = await orchestrator.approve(rChange1.pendingApproval!.id);
    expect(nodes.length).toBeGreaterThan(0);

    // Reject second action
    const rReject = await orchestrator.reject(rChange2.pendingApproval!.id, 'User decided to stop here');
    expect(rReject.status).toBe('blocked');
    expect(rReject.message).toMatch(/rejected/i);
    // Should have restored pre-execution state
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('cancels in-flight operation and restores pre-execution snapshot', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    await orchestrator.handle('Create a three-phase inverter model');
    await orchestrator.handle('400V');
    await orchestrator.handle('10000Hz');
    const rSpec = await orchestrator.handle('50Hz');
    const rPlan = await orchestrator.approve(rSpec.pendingApproval!.id);
    const rChange1 = await orchestrator.approve(rPlan.pendingApproval!.id);
    await orchestrator.approve(rChange1.pendingApproval!.id);
    expect(nodes.length).toBeGreaterThan(0);

    const cancelRes = await orchestrator.cancelOperation();
    expect(cancelRes.success).toBe(true);
    expect(nodes).toHaveLength(0);
  });

  it('requires proof, final validation, persisted save, and engine run evidence before completing', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    await orchestrator.handle('Create a three-phase inverter model');
    await orchestrator.handle('400V');
    await orchestrator.handle('10000Hz');
    const rSpec = await orchestrator.handle('50Hz');
    const rPlan = await orchestrator.approve(rSpec.pendingApproval!.id);

    let curr = await orchestrator.approve(rPlan.pendingApproval!.id);
    while (curr.status === 'awaiting_change_approval' && curr.pendingApproval) {
      curr = await orchestrator.approve(curr.pendingApproval.id);
    }

    expect(curr.status).toBe('completed');
    expect(curr.transactionStatus).toBe('committed');
    // Final evidence must exist
    expect(savedNodes.length).toBeGreaterThan(0);
    expect(curr.simulationResult || curr.finalEvidence).toBeDefined();
  });

  it('allows undoing a committed transaction back to the prior revision and state', async () => {
    mockLlm.setIntent({ intent: 'create', targetSystem: 'three_phase_inverter' });
    await orchestrator.handle('Create a three-phase inverter model');
    await orchestrator.handle('400V');
    await orchestrator.handle('10000Hz');
    const rSpec = await orchestrator.handle('50Hz');
    const rPlan = await orchestrator.approve(rSpec.pendingApproval!.id);

    let curr = await orchestrator.approve(rPlan.pendingApproval!.id);
    while (curr.status === 'awaiting_change_approval' && curr.pendingApproval) {
      curr = await orchestrator.approve(curr.pendingApproval.id);
    }

    expect(curr.status).toBe('completed');
    expect(nodes.length).toBeGreaterThan(0);

    const undoRes = await orchestrator.undoLastTransaction();
    expect(undoRes.success).toBe(true);
    expect(nodes).toHaveLength(0);
  });
});
