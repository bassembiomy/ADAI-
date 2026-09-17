import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentOrchestrator } from './agentOrchestrator';
import { ToolGateway } from './toolGateway';
import { VLabAdapter } from './toolAdapters/vlabAdapter';
import { ToolAdapter } from './actionContracts';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from './llmProvider';

class MockLlmProvider implements LlmProvider {
  public mockResponse: any = {
    intent: 'CREATE_MODEL',
    targetSystem: 'air-fryer',
    summary: 'Air fryer engineering request',
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

function registerSuccessfulNonSimulationAdapters(tools: ToolGateway): void {
  const adapter: ToolAdapter = {
    inspect: async () => ({ success: true, data: {} }),
    execute: async action => ({
      success: true, changedArtifacts: [action.id],
      evidence: { actionId: action.id, status: 'executed' }, durationMs: 1
    })
  };
  tools.registerAdapter('instantiate_block', adapter);
  tools.registerAdapter('connect_ports', adapter);
  tools.registerAdapter('configure_parameters', adapter);
  tools.registerAdapter('generate_report', adapter);
}

describe('AgentOrchestrator (Central Workflow Coordinator)', () => {
  let llm: MockLlmProvider;
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    llm = new MockLlmProvider();
    orchestrator = new AgentOrchestrator(llm);
  });

  it('runs complete end-to-end approval-gated lifecycle across all sequential plan actions', async () => {
    // Inject a ToolGateway with a real simulation runner mock
    const tools = new ToolGateway();
    const mockRunner = {
      runSimulation: vi.fn().mockResolvedValue({
        success: true,
        data: { riseTimeSeconds: 180, overshootDegrees: 2.1 }
      }),
      getSimulationStatus: vi.fn().mockResolvedValue({ status: 'idle' })
    };
    tools.registerAdapter('run_simulation', new VLabAdapter(mockRunner));
    const successfulAdapter: ToolAdapter = {
      inspect: async () => ({ success: true, data: {} }),
      execute: async action => ({
        success: true,
        changedArtifacts: action.kind === 'generate_report' ? ['report.pdf'] : [action.id],
        evidence: { actionId: action.id, status: 'executed' },
        durationMs: 1
      })
    };
    tools.registerAdapter('instantiate_block', successfulAdapter);
    tools.registerAdapter('connect_ports', successfulAdapter);
    tools.registerAdapter('configure_parameters', successfulAdapter);
    tools.registerAdapter('generate_report', successfulAdapter);

    const sequentialOrchestrator = new AgentOrchestrator(llm, tools);

    // 1. User submits natural language request
    await sequentialOrchestrator.handle('I want to build an air fryer control and heating model');
    await sequentialOrchestrator.handle('200°C');
    await sequentialOrchestrator.handle('1800W');
    await sequentialOrchestrator.handle('230V AC');
    await sequentialOrchestrator.handle('NTC 100k');
    await sequentialOrchestrator.handle('PID temperature control');
    await sequentialOrchestrator.handle('240°C');
    const r8 = await sequentialOrchestrator.handle('Reach 200°C in < 4 min with overshoot < 5°C');

    expect(r8.status).toBe('awaiting_specification_approval');
    expect(r8.pendingApproval).toBeDefined();

    // 9. User approves specification -> Plan generated & awaiting plan approval!
    const specApprovalId = r8.pendingApproval!.id;
    const r9 = await sequentialOrchestrator.approve(specApprovalId, 'Specification approved');
    expect(r9.status).toBe('awaiting_plan_approval');
    expect(r9.pendingApproval?.type).toBe('plan');
    expect(r9.executionPlan).toBeDefined();
    const plan = r9.executionPlan!;
    expect(plan.actions.length).toBe(6);

    // 10. User approves execution plan -> First change proposal emitted!
    const planApprovalId = r9.pendingApproval!.id;
    const r10 = await sequentialOrchestrator.approve(planApprovalId, 'Plan approved');
    expect(r10.status).toBe('awaiting_change_approval');
    expect(r10.pendingApproval?.type).toBe('change');
    expect(r10.pendingApproval?.title).toContain('Instantiate Heating Resistor');

    // 11. Sequentially approve each action in order
    // Action 1: Instantiate Heating Resistor
    const r11 = await sequentialOrchestrator.approve(r10.pendingApproval!.id, 'Approve Action 1');
    expect(r11.status).toBe('awaiting_change_approval');
    expect(r11.pendingApproval?.title).toContain('Instantiate Temperature Sensor');

    // Action 2: Instantiate Temperature Sensor
    const r12 = await sequentialOrchestrator.approve(r11.pendingApproval!.id, 'Approve Action 2');
    expect(r12.status).toBe('awaiting_change_approval');
    expect(r12.pendingApproval?.title).toContain('Connect Heater and Sensor Ports');

    // Action 3: Connect Ports
    const r13 = await sequentialOrchestrator.approve(r12.pendingApproval!.id, 'Approve Action 3');
    expect(r13.status).toBe('awaiting_change_approval');
    expect(r13.pendingApproval?.title).toContain('Configure Component Parameters');

    // Action 4: Configure Parameters
    const r14 = await sequentialOrchestrator.approve(r13.pendingApproval!.id, 'Approve Action 4');
    expect(r14.status).toBe('awaiting_change_approval');
    expect(r14.pendingApproval?.title).toContain('Run Thermal Closed-Loop Simulation');

    // Action 5: Run Thermal Closed-Loop Simulation (validated against criteria < 4 min and overshoot < 5)
    const r15 = await sequentialOrchestrator.approve(r14.pendingApproval!.id, 'Approve Action 5');
    expect(r15.status).toBe('awaiting_change_approval');
    expect(r15.validationResult?.passed).toBe(true);
    expect(mockRunner.runSimulation).toHaveBeenCalledOnce();
    expect(r15.pendingApproval?.title).toContain('Generate Verification Engineering Report');

    // Action 6: Generate Verification Report
    const r16 = await sequentialOrchestrator.approve(r15.pendingApproval!.id, 'Approve Action 6');
    expect(r16.status).toBe('completed');
    expect(r16.message).toMatch(/completed successfully/i);

    // Verify comprehensive audit history
    const history = sequentialOrchestrator.getAuditHistory();
    expect(history.length).toBeGreaterThan(15);
  });

  it('stops on failed action, preserves prior evidence, and returns failed state without fabricating results', async () => {
    // Default ToolGateway has no simulation runner configured
    const tools = new ToolGateway();
    registerSuccessfulNonSimulationAdapters(tools);
    const failingOrchestrator = new AgentOrchestrator(llm, tools);

    await failingOrchestrator.handle('Build an air fryer');
    await failingOrchestrator.handle('200°C');
    await failingOrchestrator.handle('1800W');
    await failingOrchestrator.handle('230V AC');
    await failingOrchestrator.handle('NTC 100k');
    await failingOrchestrator.handle('PID');
    await failingOrchestrator.handle('240°C');
    const r8 = await failingOrchestrator.handle('Heat in under 4 mins');

    const r9 = await failingOrchestrator.approve(r8.pendingApproval!.id);
    const r10 = await failingOrchestrator.approve(r9.pendingApproval!.id);

    // Run actions 1-4 successfully
    const r11 = await failingOrchestrator.approve(r10.pendingApproval!.id);
    const r12 = await failingOrchestrator.approve(r11.pendingApproval!.id);
    const r13 = await failingOrchestrator.approve(r12.pendingApproval!.id);
    const r14 = await failingOrchestrator.approve(r13.pendingApproval!.id);
    expect(r14.pendingApproval?.title).toContain('Run Thermal Closed-Loop Simulation');

    // Action 5 (simulation) without active runner MUST fail truthfully
    const r15 = await failingOrchestrator.approve(r14.pendingApproval!.id);
    expect(r15.status).toBe('failed');
    expect(r15.message).toMatch(/No real simulator adapter configured/i);
    expect(r15.message).toMatch(/Prior evidence preserved/i);

    // Prior audit trail remains intact
    const history = failingOrchestrator.getAuditHistory();
    expect(history.some(a => a.eventType === 'ACTION_COMPLETED')).toBe(true);
    expect(history.some(a => a.eventType === 'ACTION_EXECUTION_FAILED')).toBe(true);
  });

  it('fails workflow validation when simulation evidence exceeds specification limits', async () => {
    const tools = new ToolGateway();
    registerSuccessfulNonSimulationAdapters(tools);
    // Overshoot of 12°C exceeds spec limit of 5°C
    const mockRunner = {
      runSimulation: vi.fn().mockResolvedValue({
        success: true,
        data: { riseTimeSeconds: 150, overshootDegrees: 12.0 }
      })
    };
    tools.registerAdapter('run_simulation', new VLabAdapter(mockRunner));

    const invalidOrchestrator = new AgentOrchestrator(llm, tools);

    await invalidOrchestrator.handle('Build an air fryer');
    await invalidOrchestrator.handle('200°C');
    await invalidOrchestrator.handle('1800W');
    await invalidOrchestrator.handle('230V AC');
    await invalidOrchestrator.handle('NTC 100k');
    await invalidOrchestrator.handle('PID');
    await invalidOrchestrator.handle('240°C');
    const r8 = await invalidOrchestrator.handle('Reach 200°C in < 4 min with overshoot < 5°C');

    const r9 = await invalidOrchestrator.approve(r8.pendingApproval!.id);
    const r10 = await invalidOrchestrator.approve(r9.pendingApproval!.id);
    const r11 = await invalidOrchestrator.approve(r10.pendingApproval!.id);
    const r12 = await invalidOrchestrator.approve(r11.pendingApproval!.id);
    const r13 = await invalidOrchestrator.approve(r12.pendingApproval!.id);
    const r14 = await invalidOrchestrator.approve(r13.pendingApproval!.id);

    // Approve simulation -> should fail validation against spec
    const r15 = await invalidOrchestrator.approve(r14.pendingApproval!.id);
    expect(r15.status).toBe('failed');
    expect(r15.message).toMatch(/Validation failed: simulation results did not satisfy approved criteria/i);
    expect(r15.validationResult?.passed).toBe(false);
  });

  it('rejects execution if approval request parameters do not match plan action', async () => {
    await orchestrator.handle('Build an air fryer');
    await orchestrator.handle('200°C');
    await orchestrator.handle('1800W');
    await orchestrator.handle('230V AC');
    await orchestrator.handle('NTC 100k');
    await orchestrator.handle('PID');
    await orchestrator.handle('240°C');
    const r8 = await orchestrator.handle('Heat in under 4 mins');

    const r9 = await orchestrator.approve(r8.pendingApproval!.id);
    const r10 = await orchestrator.approve(r9.pendingApproval!.id);

    const pendingReq = r10.pendingApproval!;
    // Tamper with request parameters
    pendingReq.payload['params'] = { tampered: true };

    await expect(orchestrator.approve(pendingReq.id)).rejects.toThrow(
      /Action parameters mismatch/
    );
  });

  it('handles user rejection and transitions to blocked state', async () => {
    // Bring to spec approval
    await orchestrator.handle('Build an air fryer');
    await orchestrator.handle('200°C');
    await orchestrator.handle('1800W');
    await orchestrator.handle('230V AC');
    await orchestrator.handle('NTC 100k');
    await orchestrator.handle('PID');
    await orchestrator.handle('240°C');
    const res = await orchestrator.handle('Heat in under 4 mins');

    expect(res.status).toBe('awaiting_specification_approval');
    const specReqId = res.pendingApproval!.id;

    // User rejects
    const rejected = await orchestrator.reject(specReqId, 'Enclosure rating has changed to 180°C max');
    expect(rejected.status).toBe('blocked');
    expect(rejected.message).toMatch(/rejected/i);
    expect(orchestrator.getState().status).toBe('blocked');
  });

  it('gracefully degrades to deterministic reasoning when local LLM is offline or refuses connection', async () => {
    llm.isHealthy = false; // LLM unavailable

    const r1 = await orchestrator.handle('Build an air fryer');
    // Should still proceed deterministically without crashing!
    expect(r1.status).toBe('clarifying');
    expect(r1.message).toMatch(/temperature/i);
  });

  it('emits audit events for every question, proposal, approval, and tool call', async () => {
    await orchestrator.handle('Build an air fryer');
    await orchestrator.handle('200°C');

    const history = orchestrator.getAuditHistory();
    expect(history.some(a => a.eventType === 'TASK_INITIALIZED')).toBe(true);
    expect(history.some(a => a.eventType === 'ANSWER_RECORDED')).toBe(true);
    expect(history.some(a => a.eventType === 'QUESTION_ASKED')).toBe(true);
  });

  it('rejects stale change approval if approval revision does not match current project revision', async () => {
    const tools = new ToolGateway();
    registerSuccessfulNonSimulationAdapters(tools);
    const orch = new AgentOrchestrator(llm, tools);

    orch.updateProjectContext({ projectId: 'test-p', workspace: 'xbridges', revision: 5 });

    await orch.handle('Build an air fryer');
    await orch.handle('200°C');
    await orch.handle('1800W');
    await orch.handle('230V AC');
    await orch.handle('NTC 100k');
    await orch.handle('PID');
    await orch.handle('240°C');
    const r8 = await orch.handle('Heat in under 4 mins');

    const r9 = await orch.approve(r8.pendingApproval!.id);
    const r10 = await orch.approve(r9.pendingApproval!.id);

    const pendingReq = r10.pendingApproval!;
    expect(pendingReq.payload['projectRevision']).toBe(5);

    // Simulate concurrent modification bump: payload revision is now stale compared to project
    pendingReq.payload['projectRevision'] = 4;

    const rExec = await orch.approve(pendingReq.id);
    expect(rExec.status).toBe('failed');
    expect(rExec.message).toMatch(/Stale approval/i);
    expect(orch.getAuditHistory().some(a => a.eventType === 'ACTION_REJECTED_STALE')).toBe(true);
  });

  it('fails post-action validation if X-BRIDGES topology contains dangling edges', async () => {
    // Mock X-BRIDGES delegate returning an edge with non-existent target node
    const mockXbridgesDelegate = {
      getNodes: vi.fn().mockResolvedValue([{ id: 'node-1', type: 'GAIN', data: {} }]),
      getEdges: vi.fn().mockResolvedValue([
        { id: 'edge-1', source: 'node-1', target: 'ghost-node', sourceHandle: 'y', targetHandle: 'in1' }
      ]),
      addBlock: vi.fn(),
      connectPorts: vi.fn(),
      updateParameters: vi.fn(),
      save: vi.fn()
    };

    const mockProjectDelegate = {
      getProjectId: vi.fn().mockReturnValue('test-p1'),
      getActiveWorkspace: vi.fn().mockReturnValue('xbridges'),
      getModelSnapshot: vi.fn().mockResolvedValue({
        projectId: 'test-p1',
        workspace: 'xbridges',
        revision: 1,
        snapshotId: 'snap-1',
        capturedAt: Date.now()
      }),
      refreshPersistence: vi.fn().mockResolvedValue(undefined)
    };

    const tools = new ToolGateway({
      project: mockProjectDelegate,
      xbridges: mockXbridgesDelegate as any
    });
    registerSuccessfulNonSimulationAdapters(tools);

    const orch = new AgentOrchestrator(llm, tools);
    await orch.handle('Build an air fryer');
    await orch.handle('200°C');
    await orch.handle('1800W');
    await orch.handle('230V AC');
    await orch.handle('NTC 100k');
    await orch.handle('PID');
    await orch.handle('240°C');
    const r8 = await orch.handle('Heat in under 4 mins');
    const r9 = await orch.approve(r8.pendingApproval!.id);
    const r10 = await orch.approve(r9.pendingApproval!.id);

    // Executing Action 1 triggers topology check
    const r11 = await orch.approve(r10.pendingApproval!.id);
    expect(r11.status).toBe('failed');
    expect(r11.message).toMatch(/dangling edge/i);
    expect(orch.getAuditHistory().some(a => a.eventType === 'TOPOLOGY_VALIDATION_FAILED')).toBe(true);
  });

  it('fails post-action validation if generated report artifact has 0 bytes or is missing', async () => {
    const tools = new ToolGateway();
    const mockRunner = {
      runSimulation: vi.fn().mockResolvedValue({
        success: true,
        data: { riseTimeSeconds: 180, overshootDegrees: 2.1 }
      })
    };
    tools.registerAdapter('run_simulation', new VLabAdapter(mockRunner));

    const mockAdapter: ToolAdapter = {
      inspect: async () => ({ success: true, data: {} }),
      execute: async action => {
        if (action.kind === 'generate_report') {
          return {
            success: true,
            changedArtifacts: ['/tmp/report.docx'],
            evidence: { path: '/tmp/report.docx', sizeBytes: 0 }, // 0 bytes!
            durationMs: 1
          };
        }
        return {
          success: true,
          changedArtifacts: [action.id],
          evidence: { actionId: action.id },
          durationMs: 1
        };
      }
    };
    tools.registerAdapter('instantiate_block', mockAdapter);
    tools.registerAdapter('connect_ports', mockAdapter);
    tools.registerAdapter('configure_parameters', mockAdapter);
    tools.registerAdapter('generate_report', mockAdapter);

    const orch = new AgentOrchestrator(llm, tools);
    await orch.handle('Build an air fryer');
    await orch.handle('200°C');
    await orch.handle('1800W');
    await orch.handle('230V AC');
    await orch.handle('NTC 100k');
    await orch.handle('PID');
    await orch.handle('240°C');
    const r8 = await orch.handle('Heat in under 4 mins');
    const r9 = await orch.approve(r8.pendingApproval!.id);
    const r10 = await orch.approve(r9.pendingApproval!.id);
    const r11 = await orch.approve(r10.pendingApproval!.id);
    const r12 = await orch.approve(r11.pendingApproval!.id);
    const r13 = await orch.approve(r12.pendingApproval!.id);
    const r14 = await orch.approve(r13.pendingApproval!.id);
    const r15 = await orch.approve(r14.pendingApproval!.id);

    // Action 6 is report generation with 0 byte evidence -> must fail
    const r16 = await orch.approve(r15.pendingApproval!.id);
    expect(r16.status).toBe('failed');
    expect(r16.message).toMatch(/report artifact is missing or empty/i);
    expect(orch.getAuditHistory().some(a => a.eventType === 'REPORT_VALIDATION_FAILED')).toBe(true);
  });
});
