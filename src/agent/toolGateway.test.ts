import { describe, it, expect, beforeEach } from 'vitest';
import { ToolGateway, ToolExecutionResult } from './toolGateway';
import { createApprovalRequest, approve } from './approvalGate';

describe('ToolGateway & Controlled Execution Security', () => {
  let gateway: ToolGateway;

  beforeEach(() => {
    gateway = new ToolGateway();
  });

  it('allows inspect() read operations without modifying project state', async () => {
    const result = await gateway.inspect('inspect_catalog', { capability: 'thermal' });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.auditRecord.eventType).toBe('TOOL_INSPECT');
    expect(result.auditRecord.actor).toBe('agent');
  });

  it('rejects inspect() on un-allowlisted or unknown inspection tools', async () => {
    const result = await gateway.inspect('read_arbitrary_system_file', { path: '/etc/passwd' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Tool 'read_arbitrary_system_file' is not an allowlisted read tool/);
  });

  it('proposes model changes without modifying state (proposal-only)', async () => {
    const proposal = await gateway.propose('instantiate_block', {
      blockId: 'resistor',
      instanceName: 'Heater1'
    });

    expect(proposal.success).toBe(true);
    expect(proposal.isDryRun).toBe(true);
    expect(proposal.auditRecord.eventType).toBe('TOOL_PROPOSAL');
    expect(proposal.data).toHaveProperty('proposedAction');
  });

  it('rejects proposing a non-catalog block', async () => {
    const proposal = await gateway.propose('instantiate_block', {
      blockId: 'unknown_hallucinated_block',
      instanceName: 'Test'
    });

    expect(proposal.success).toBe(false);
    expect(proposal.error).toMatch(/does not exist in ADIA catalog/);
  });

  it('rejects executeApproved() without a valid approved approval token', async () => {
    // No token
    await expect(
      gateway.executeApproved('instantiate_block', { blockId: 'resistor' }, '')
    ).rejects.toThrow(/Approval token is required for executable tool operations/);

    // Pending (unapproved) token
    const pendingReq = createApprovalRequest('change', 'Add resistor', 'desc', { blockId: 'resistor' });
    await expect(
      gateway.executeApproved('instantiate_block', { blockId: 'resistor' }, pendingReq.id)
    ).rejects.toThrow(/not approved/);
  });

  it('executes approved changes successfully when valid approved token is provided', async () => {
    gateway.registerAdapter('instantiate_block', {
      inspect: async () => ({ success: true, data: {} }),
      execute: async action => ({
        success: true, changedArtifacts: [`xbridges/${action.id}`],
        evidence: { status: 'instantiated' }, durationMs: 1
      })
    });
    const req = createApprovalRequest('change', 'Add resistor', 'desc', { blockId: 'resistor' });
    const approvedReq = approve(req);
    gateway.registerApprovedToken(approvedReq);

    const result = await gateway.executeApproved(
      'instantiate_block',
      { blockId: 'resistor', instanceName: 'MainHeater' },
      approvedReq.id
    );

    expect(result.success).toBe(true);
    expect(result.evidence).toBeDefined();
    expect(result.auditRecord.eventType).toBe('TOOL_EXECUTION_SUCCESS');

    // Token cannot be reused
    await expect(
      gateway.executeApproved('instantiate_block', { blockId: 'resistor' }, approvedReq.id)
    ).rejects.toThrow(/Token has already been consumed/);
  });

  it('preserves failed executions and error evidence in audit record without claiming completion', async () => {
    // Inject a VLabAdapter with a runner that checks duration
    const failingRunner = {
      async runSimulation(p: any) {
        if (p.durationSeconds <= 0) {
          return { success: false, error: 'Invalid simulation duration: must be positive' };
        }
        return { success: true, data: {} };
      }
    };
    const { VLabAdapter } = await import('./toolAdapters/vlabAdapter');
    gateway.registerAdapter('run_simulation', new VLabAdapter(failingRunner));

    const req = createApprovalRequest('change', 'Run Sim', 'desc', {});
    const approvedReq = approve(req);
    gateway.registerApprovedToken(approvedReq);

    // Force simulation failure with invalid negative duration
    const result = await gateway.executeApproved(
      'run_simulation',
      { durationSeconds: -50 },
      approvedReq.id
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid simulation duration/);
    expect(result.auditRecord.eventType).toBe('TOOL_EXECUTION_FAILURE');
    expect(result.auditRecord.details['error']).toBeDefined();

    // Verify audit record is stored
    const history = gateway.getAuditHistory();
    expect(history.some(a => a.eventType === 'TOOL_EXECUTION_FAILURE')).toBe(true);
  });

  it('runs validation check against evidence and outputs verification result', async () => {
    const validEvidence = {
      riseTimeSeconds: 180,
      targetTemperature: 200,
      overshootDegrees: 2.1,
      peakTemperature: 202.1
    };

    const valResult = await gateway.validate(validEvidence, {
      maxRiseTimeSeconds: 240,
      maxOvershootDegrees: 5.0
    });

    expect(valResult.passed).toBe(true);
    expect(valResult.checks.every(c => c.passed)).toBe(true);
  });

  it('dispatches executeApproved() to injected adapter matching ApprovedAction.kind', async () => {
    let adapterCalledWith: any = null;
    const mockAdapter = {
      async execute(action: any) {
        adapterCalledWith = action;
        return {
          success: true,
          changedArtifacts: ['xbridges/motor_1'],
          evidence: { blockInstantiated: true },
          durationMs: 42
        };
      },
      async inspect() {
        return { success: true, data: {} };
      }
    };

    gateway.registerAdapter('instantiate_block', mockAdapter);

    const req = createApprovalRequest('change', 'Instantiate', 'desc', {});
    const approvedReq = approve(req);
    gateway.registerApprovedToken(approvedReq);

    const action = {
      id: 'act-inst-1',
      kind: 'instantiate_block' as const,
      projectId: 'proj-1',
      targetWorkspace: 'xbridges',
      params: { blockName: 'bldc_1' },
      blockIds: ['bldc_motor'],
      approvalId: approvedReq.id,
      expectedEvidence: 'bldc_motor created'
    };

    const result = await gateway.executeApprovedAction(action, approvedReq.id);
    expect(result.success).toBe(true);
    expect(adapterCalledWith).toBe(action);
    expect(result.evidence).toEqual({ blockInstantiated: true });
  });

  it('rejects execution if approvalToken does not match action.approvalId', async () => {
    const req = createApprovalRequest('change', 'Instantiate', 'desc', {});
    const approvedReq = approve(req);
    gateway.registerApprovedToken(approvedReq);

    const action = {
      id: 'act-inst-1',
      kind: 'instantiate_block' as const,
      projectId: 'proj-1',
      targetWorkspace: 'xbridges',
      params: { blockName: 'bldc_1' },
      blockIds: ['bldc_motor'],
      approvalId: 'mismatched-approval-id',
      expectedEvidence: 'bldc_motor created'
    };

    await expect(
      gateway.executeApprovedAction(action, approvedReq.id)
    ).rejects.toThrow(/Approval token does not match action approvalId/);
  });

  it('fails run_simulation when no real simulator adapter is configured rather than fabricating numbers', async () => {
    const req = createApprovalRequest('change', 'Simulate', 'desc', {});
    const approvedReq = approve(req);
    gateway.registerApprovedToken(approvedReq);

    const action = {
      id: 'act-sim-1',
      kind: 'run_simulation' as const,
      projectId: 'proj-1',
      targetWorkspace: 'vlab',
      params: { durationSeconds: 100 },
      blockIds: [],
      approvalId: approvedReq.id,
      expectedEvidence: 'simulation trace'
    };

    const result = await gateway.executeApprovedAction(action, approvedReq.id);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No real simulator adapter configured/);
    // Never returns fake numbers
    expect(result.evidence?.['peakTemperature']).toBeUndefined();
  });
});
