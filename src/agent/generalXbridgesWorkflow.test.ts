import { describe, it, expect, beforeEach } from 'vitest';
import { GeneralXbridgesWorkflow, LivePlanningContext, NullPatternGateway } from './generalXbridgesWorkflow';
import { ToolGateway } from './toolGateway';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from './llmProvider';
import {
  createXbridgesDelegate,
  ReactFlowXbridgesNode,
  ReactFlowXbridgesEdge,
} from './toolAdapters/xbridgesAdapter';
import { PlanningCollaborator } from './collaborators/planningCollaborator';
import { ProofCollaborator } from './collaborators/proofCollaborator';
import { TransactionCollaborator } from './collaborators/transactionCollaborator';
import { resolveRequirements } from '../services/ai/planner/requirementResolver';
import { XbridgesIntent } from '../services/ai/planner/generalIntent';

class StubLlm implements LlmProvider {
  constructor(private payload: Record<string, unknown> = {}) {}
  async generate<T>(_req: LlmRequest, _schema?: JsonSchema): Promise<LlmResult<T>> {
    return { success: true, data: this.payload as unknown as T, rawOutput: JSON.stringify(this.payload) };
  }
  async health(): Promise<LlmHealth> {
    return { available: true, model: 'stub', latencyMs: 1 };
  }
}

interface Harness {
  workflow: GeneralXbridgesWorkflow;
  context: LivePlanningContext;
  nodes(): ReactFlowXbridgesNode[];
  edges(): ReactFlowXbridgesEdge[];
  saves(): number;
  revision(): number;
}

function makeHarness(llmPayload: Record<string, unknown> = {}): Harness {
  let nodes: ReactFlowXbridgesNode[] = [];
  let edges: ReactFlowXbridgesEdge[] = [];
  let revision = 1;
  let saves = 0;

  const delegate = createXbridgesDelegate({
    getNodes: () => nodes,
    getEdges: () => edges,
    setNodes: u => { nodes = u(nodes); revision++; },
    setEdges: u => { edges = u(edges); revision++; },
    onSave: (n, e) => { nodes = [...n]; edges = [...e]; saves++; },
  });

  const tools = new ToolGateway({
    xbridges: delegate,
    project: {
      getProjectId: () => 'proj_wf',
      getActiveWorkspace: () => 'xbridges',
      getRevision: () => revision,
    } as never,
  });

  const workflow = new GeneralXbridgesWorkflow(new StubLlm(llmPayload), tools, {
    requirements: resolveRequirements,
    patterns: new NullPatternGateway(),
    planner: new PlanningCollaborator(),
    proof: new ProofCollaborator(),
    transactions: new TransactionCollaborator(),
  });

  const context: LivePlanningContext = {
    projectId: 'proj_wf',
    workspace: 'xbridges',
    getRevision: () => revision,
    setRevision: r => { revision = r; },
  };

  return { workflow, context, nodes: () => nodes, edges: () => edges, saves: () => saves, revision: () => revision };
}

async function driveToTerminal(
  harness: Harness,
  prompt: string,
  answers: string[],
  options: { stopBeforePlanApproval?: boolean } = {}
) {
  const { workflow, context } = harness;
  let res = await workflow.handle(prompt, context);
  const history = [res];
  let ai = 0;
  for (let i = 0; i < 80; i++) {
    if (res.status === 'clarifying') {
      if (ai >= answers.length) break;
      res = await workflow.handle(answers[ai++], context);
      history.push(res);
      continue;
    }
    const pending = workflow.getPendingApproval();
    if (!pending) break;
    if (options.stopBeforePlanApproval && pending.type === 'plan') break;
    res = await workflow.approve(pending.id);
    history.push(res);
  }
  return { res, history };
}

describe('GeneralXbridgesWorkflow routing', () => {
  const cases: Array<{ prompt: string; intent: XbridgesIntent }> = [
    { prompt: 'Create a signal chain: Step source into a Gain of 2 into a Scope', intent: 'create' },
    { prompt: 'Inspect current schematic', intent: 'inspect' },
    { prompt: 'Modify gain parameter to 5', intent: 'modify' },
    { prompt: 'Diagnose model for disconnected ports', intent: 'diagnose' },
    { prompt: 'Repair model topology', intent: 'repair' },
    { prompt: 'Optimize gain to minimize rise time', intent: 'optimize' },
    { prompt: 'Create a three-phase inverter model', intent: 'create' },
    { prompt: 'Create an air fryer thermal control model', intent: 'create' },
  ];

  for (const { prompt, intent } of cases) {
    it(`routes '${prompt.slice(0, 36)}...' as intent '${intent}'`, async () => {
      const harness = makeHarness({ intent, targetSystem: 'xbridges_model' });
      const res = await harness.workflow.handle(prompt, harness.context);
      expect(harness.workflow.lastHandledIntent).toBe(intent);
      expect(res.intent).toBe(intent);
      // No intent may mutate the workspace during handle() alone.
      expect(harness.nodes()).toHaveLength(0);
      expect(harness.edges()).toHaveLength(0);
    });
  }
});

describe('GeneralXbridgesWorkflow create pipeline', () => {
  let harness: Harness;
  beforeEach(() => {
    harness = makeHarness();
  });

  it('runs clarification -> proved plan -> per-action approvals -> committed persistence', async () => {
    const { res } = await driveToTerminal(
      harness,
      'Create a signal chain: Step source into a Gain of 2 into a Scope',
      ['use defaults', 'resistive load']
    );

    expect(res.status).toBe('completed');
    expect(res.transactionStatus).toBe('committed');
    expect(res.proof?.status).toBe('proved');
    expect(res.proof?.engineRunId).toBeTruthy();
    expect(harness.nodes().length).toBeGreaterThanOrEqual(3);
    expect(harness.edges().length).toBeGreaterThanOrEqual(2);
    expect(harness.saves()).toBeGreaterThanOrEqual(1);
    expect(res.finalEvidence?.savedFingerprint).toBe(res.finalEvidence?.reloadedFingerprint);
    expect(res.finalEvidence?.persistedRevision).toBeGreaterThanOrEqual(1);
  });

  it('presents real proof before plan approval', async () => {
    const { res } = await driveToTerminal(
      harness,
      'Create a signal chain: Step source into a Gain of 2 into a Scope',
      ['use defaults', 'resistive load'],
      { stopBeforePlanApproval: true }
    );
    expect(res.status).toBe('awaiting_plan_approval');
    expect(res.proof?.status).toBe('proved');
    expect(res.plan?.planHash).toHaveLength(64);
    expect(res.proof?.planHash).toBe(res.plan?.planHash);
  });

  it('rejecting mid-transaction restores the exact pre-transaction snapshot', async () => {
    const { workflow, context } = harness;
    let res = await workflow.handle('Create a signal chain: Step source into a Gain of 2 into a Scope', context);
    for (const ans of ['use defaults', 'resistive load']) {
      if (res.status !== 'clarifying') break;
      res = await workflow.handle(ans, context);
    }
    res = await workflow.approve(workflow.getPendingApproval()!.id); // plan
    res = await workflow.approve(workflow.getPendingApproval()!.id); // first action
    expect(harness.nodes().length).toBeGreaterThan(0);

    const rejected = await workflow.reject(workflow.getPendingApproval()!.id, 'stop here');
    expect(rejected.status).toBe('blocked');
    expect(rejected.message).toMatch(/restored|rejected/i);
    expect(harness.nodes()).toHaveLength(0);
    expect(harness.edges()).toHaveLength(0);
  });

  it('cancel restores the pre-execution snapshot', async () => {
    const { workflow, context } = harness;
    let res = await workflow.handle('Create a signal chain: Step source into a Gain of 2 into a Scope', context);
    for (const ans of ['use defaults', 'resistive load']) {
      if (res.status !== 'clarifying') break;
      res = await workflow.handle(ans, context);
    }
    res = await workflow.approve(workflow.getPendingApproval()!.id);
    res = await workflow.approve(workflow.getPendingApproval()!.id);
    expect(harness.nodes().length).toBeGreaterThan(0);

    const cancelled = await workflow.cancel('user cancelled');
    expect(cancelled.message).toMatch(/cancel/i);
    expect(harness.nodes()).toHaveLength(0);
  });

  it('undo is only allowed while the workspace matches the committed fingerprint', async () => {
    const { workflow, context } = harness;
    const { res } = await driveToTerminal(
      harness,
      'Create a signal chain: Step source into a Gain of 2 into a Scope',
      ['use defaults', 'resistive load']
    );
    expect(res.status).toBe('completed');
    expect(harness.nodes().length).toBeGreaterThan(0);

    const undo = await workflow.undoLastTransaction('proj_wf');
    expect(undo.success).toBe(true);
    expect(harness.nodes()).toHaveLength(0);

    // Second undo has no committed transaction left.
    const second = await workflow.undoLastTransaction('proj_wf');
    expect(second.success).toBe(false);
  });

  it('refuses unsupported physics with zero mutations', async () => {
    const res = await harness.workflow.handle(
      'Build a warp drive producing infinite energy',
      harness.context
    );
    expect(res.status).toBe('blocked');
    expect(res.message).toMatch(/refused|unsupported|cannot be realized/i);
    expect(harness.nodes()).toHaveLength(0);
    expect(harness.saves()).toBe(0);
  });

  it('refuses invented blocks named by the user', async () => {
    const res = await harness.workflow.handle(
      'Instantiate a FLUX_CAPACITOR block and connect it to a Scope',
      harness.context
    );
    expect(res.status).toBe('blocked');
    expect(res.message).toMatch(/FLUX_CAPACITOR/);
    expect(harness.nodes()).toHaveLength(0);
  });

  it('inspect and diagnose are read-only', async () => {
    const inspectRes = await harness.workflow.handle('Inspect current schematic', harness.context);
    expect(inspectRes.status).toBe('completed');
    expect(inspectRes.intent).toBe('inspect');

    const diagRes = await harness.workflow.handle('Diagnose model for disconnected ports', harness.context);
    expect(diagRes.status).toBe('completed');
    expect(harness.nodes()).toHaveLength(0);
    expect(harness.saves()).toBe(0);
  });
});
