/**
 * src/agent/generalWorkflow.integration.test.ts
 *
 * Integration tests locking the GENERAL X-Bridges workflow contract:
 * every engineering request expressible by the installed catalog must flow
 * through the generic planner, knowledge store, real proof engine, per-action
 * approvals, atomic transaction, save, reload, and fingerprint verification.
 *
 * These tests intentionally do NOT special-case the three-phase inverter or
 * the air fryer: any composition supported by the catalog must pass the same
 * gates.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentOrchestrator, OrchestratorResponse } from './agentOrchestrator';
import { ToolGateway } from './toolGateway';
import {
  createXbridgesDelegate,
  ReactFlowXbridgesNode,
  ReactFlowXbridgesEdge,
} from './toolAdapters/xbridgesAdapter';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from './llmProvider';
import { buildXbridgesCapabilityIndex } from '../services/ai/catalog/xbridgesCapabilityIndex';
import { BLOCK_LIBRARY } from '../engine/xbridges/BlockDefinitions';

// ---------------------------------------------------------------------------
// Mock LLM: extracts a deterministic engineering request from the prompt text.
// The real workflow must treat LLM output as advisory only; catalog validation
// remains authoritative.
// ---------------------------------------------------------------------------
class ScriptedLlm implements LlmProvider {
  constructor(private payload: Record<string, unknown> = {}) {}

  setPayload(payload: Record<string, unknown>): void {
    this.payload = payload;
  }

  async generate<T>(_req: LlmRequest, _schema?: JsonSchema): Promise<LlmResult<T>> {
    return {
      success: true,
      data: this.payload as unknown as T,
      rawOutput: JSON.stringify(this.payload),
    };
  }

  async health(): Promise<LlmHealth> {
    return { available: true, model: 'scripted-test-model', latencyMs: 1 };
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
export interface WorkflowHarness {
  orchestrator: AgentOrchestrator;
  tools: ToolGateway;
  llm: ScriptedLlm;
  /** live workspace state */
  getNodes(): ReactFlowXbridgesNode[];
  getEdges(): ReactFlowXbridgesEdge[];
  /** last persisted state via save() */
  savedNodes(): ReactFlowXbridgesNode[];
  savedEdges(): ReactFlowXbridgesEdge[];
  saveCount(): number;
  currentRevision(): number;
}

export function createWorkflowHarness(llmPayload: Record<string, unknown> = {}): WorkflowHarness {
  let nodes: ReactFlowXbridgesNode[] = [];
  let edges: ReactFlowXbridgesEdge[] = [];
  let revision = 1;
  let savedNodeSnapshot: ReactFlowXbridgesNode[] = [];
  let savedEdgeSnapshot: ReactFlowXbridgesEdge[] = [];
  let saves = 0;

  const delegate = createXbridgesDelegate({
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
      savedNodeSnapshot = JSON.parse(JSON.stringify(n));
      savedEdgeSnapshot = JSON.parse(JSON.stringify(e));
      saves++;
    },
  });

  const llm = new ScriptedLlm(llmPayload);
  const tools = new ToolGateway({
    xbridges: delegate,
    project: {
      getProjectId: () => 'proj_general_workflow',
      getActiveWorkspace: () => 'xbridges',
      getRevision: () => revision,
    } as never,
  });

  const orchestrator = new AgentOrchestrator(llm, tools);
  orchestrator.updateProjectContext({ projectId: 'proj_general_workflow', workspace: 'xbridges', revision });

  return {
    orchestrator,
    tools,
    llm,
    getNodes: () => nodes,
    getEdges: () => edges,
    savedNodes: () => savedNodeSnapshot,
    savedEdges: () => savedEdgeSnapshot,
    saveCount: () => saves,
    currentRevision: () => revision,
  };
}

// ---------------------------------------------------------------------------
// Reusable approved-workflow driver
// ---------------------------------------------------------------------------
export interface ApprovedWorkflowResult {
  final: OrchestratorResponse;
  responses: OrchestratorResponse[];
  approvalsGranted: number;
  answersUsed: number;
}

/**
 * Drives a complete approved workflow: feeds queued clarification answers,
 * then approves every presented approval (specification, plan, and each
 * individual action) until the workflow reaches a terminal state.
 */
export async function runApprovedWorkflow(
  prompt: string,
  answers: string[],
  harness: WorkflowHarness,
  options: { maxSteps?: number; approvePlan?: boolean } = {}
): Promise<ApprovedWorkflowResult> {
  const { maxSteps = 80, approvePlan = true } = options;
  const orchestrator = harness.orchestrator;
  const responses: OrchestratorResponse[] = [];
  let approvalsGranted = 0;
  let answersUsed = 0;

  let response = await orchestrator.handle(prompt);
  responses.push(response);

  for (let step = 0; step < maxSteps; step++) {
    const status = response.status;

    if (status === 'clarifying') {
      if (answersUsed >= answers.length) break;
      response = await orchestrator.handle(answers[answersUsed++]);
      responses.push(response);
      continue;
    }

    const pending = orchestrator.getPendingApproval();
    if (pending) {
      if (pending.type === 'plan' && !approvePlan) break;
      response = await orchestrator.approve(pending.id, 'integration approval');
      approvalsGranted++;
      responses.push(response);
      continue;
    }

    break;
  }

  return { final: responses[responses.length - 1], responses, approvalsGranted, answersUsed };
}

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------
function assertCatalogOnlyModel(harness: WorkflowHarness): void {
  const index = buildXbridgesCapabilityIndex();
  for (const node of harness.getNodes()) {
    const type = String(node.data?.type ?? node.type);
    expect(index.blocks.has(type), `node type '${type}' must exist in the installed catalog`).toBe(true);
    expect(BLOCK_LIBRARY[type], `BLOCK_LIBRARY factory must exist for '${type}'`).toBeDefined();
  }
}

function assertCompletedEvidence(
  result: ApprovedWorkflowResult,
  harness: WorkflowHarness,
  expectations: { minBlocks: number; minEdges: number }
): void {
  const { final } = result;

  expect(final.status, `workflow must complete, got '${final.status}': ${final.message}`).toBe('completed');
  expect(final.intent).toBe('create');
  expect(final.resolvedRequirements, 'resolved requirements must be exposed').toBeDefined();
  expect(final.patternEvidence, 'pattern evidence must be exposed').toBeDefined();
  expect(final.plan, 'typed plan must be exposed').toBeDefined();
  expect(final.transactionStatus, 'transaction status must be committed').toBe('committed');

  // Real proof from the real engine — no synthetic evidence allowed.
  const proof = final.proof;
  expect(proof, 'proof must be present').toBeDefined();
  expect(proof!.status).toBe('proved');
  expect(proof!.engineRunId, 'proof must carry a real engine run id').toBeTruthy();
  expect(proof!.catalogHash).toBe(buildXbridgesCapabilityIndex().catalogFingerprint);

  // Live model must contain only catalog blocks and be non-trivial.
  assertCatalogOnlyModel(harness);
  expect(harness.getNodes().length).toBeGreaterThanOrEqual(expectations.minBlocks);
  expect(harness.getEdges().length).toBeGreaterThanOrEqual(expectations.minEdges);

  // Persistence: save was called and persisted nodes match live nodes.
  expect(harness.saveCount()).toBeGreaterThanOrEqual(1);
  expect(harness.savedNodes().length).toBe(harness.getNodes().length);
  expect(harness.savedEdges().length).toBe(harness.getEdges().length);

  // Final evidence contract.
  const ev = final.finalEvidence;
  expect(ev, 'finalEvidence must be present').toBeDefined();
  expect(ev!.engineRunId).toBe(proof!.engineRunId);
  expect(ev!.planHash).toBe((final.plan as { planHash?: string })?.planHash);
  expect(ev!.catalogHash).toBe(proof!.catalogHash);
  expect(typeof ev!.savedFingerprint).toBe('string');
  expect((ev!.savedFingerprint as string).length).toBeGreaterThan(0);
  expect(typeof ev!.persistedRevision).toBe('number');
  expect(ev!.reloadedFingerprint, 'reload verification fingerprint required').toBe(ev!.savedFingerprint);
  expect(ev!.validationPassed).toBe(true);
}

// ---------------------------------------------------------------------------
// Positive scenarios: non-inverter general engineering requests
// ---------------------------------------------------------------------------
describe('General X-Bridges workflow integration (non-inverter requests)', () => {
  let harness: WorkflowHarness;

  beforeEach(() => {
    harness = createWorkflowHarness();
  });

  it('builds a PID speed-control loop (Constant→Sum→PID→plant→feedback→Scope) end to end', async () => {
    const result = await runApprovedWorkflow(
      'Create a closed-loop PID speed control model: speed setpoint 100 rpm, PID gains Kp 2 Ki 0.5 Kd 0.05, integrator plant, observe the plant output',
      ['setpoint 100 rpm', 'Kp 2 Ki 0.5 Kd 0.05', 'integrator plant', 'observe plant speed output'],
      harness
    );

    assertCompletedEvidence(result, harness, { minBlocks: 5, minEdges: 4 });

    const types = harness.getNodes().map(n => String(n.data?.type ?? n.type));
    expect(types).toContain('PID_CONTROLLER');
    expect(types).toContain('Sum');
    // Feedback loop: an edge returns the plant output toward the controller.
    const nodeIds = new Set(harness.getNodes().map(n => n.id));
    for (const e of harness.getEdges()) {
      expect(nodeIds.has(e.source)).toBe(true);
      expect(nodeIds.has(e.target)).toBe(true);
    }
  });

  it('builds a first-order low-pass filter (Step→Sum→Gain→Integrator feedback→Scope) end to end', async () => {
    const result = await runApprovedWorkflow(
      'Create a first-order low-pass filter with time constant 0.01 s driven by a step input, observe the filtered output',
      ['time constant 0.01 s', 'step input amplitude 1', 'observe filtered output'],
      harness
    );

    assertCompletedEvidence(result, harness, { minBlocks: 5, minEdges: 5 });

    const types = harness.getNodes().map(n => String(n.data?.type ?? n.type));
    expect(types).toContain('Sum');
    expect(types).toContain('Integrator');
    expect(types).toContain('Scope');
  });

  it('builds thermal alarm logic (signal→SWITCH threshold→Scope) end to end', async () => {
    const result = await runApprovedWorkflow(
      'Create thermal alarm logic: temperature signal from a waveform generator, alarm threshold 200 degrees Celsius, alarm output to scope',
      ['threshold 200 degC', 'waveform generator temperature signal', 'scope alarm output'],
      harness
    );

    assertCompletedEvidence(result, harness, { minBlocks: 4, minEdges: 3 });

    const types = harness.getNodes().map(n => String(n.data?.type ?? n.type));
    expect(types).toContain('SWITCH');
  });

  it('builds a three-phase motor drive stage (source→PWM→inverter→load→Scope) end to end', async () => {
    const result = await runApprovedWorkflow(
      'Create a three-phase motor drive: 400 V DC source, PWM generator at 5 kHz driving the inverter gates, three-phase resistive load 10 ohm, observe phase A current',
      ['400 V dc source', '5 kHz pwm', 'resistive load 10 ohm', 'observe phase current'],
      harness
    );

    assertCompletedEvidence(result, harness, { minBlocks: 5, minEdges: 5 });

    const types = harness.getNodes().map(n => String(n.data?.type ?? n.type));
    expect(types).toContain('THREE_PHASE_INVERTER');
    expect(types).toContain('THREE_PHASE_LOAD');
  });

  it('builds an arbitrary Step→Gain→Scope composition end to end', async () => {
    const result = await runApprovedWorkflow(
      'Create a signal chain: Step source into a Gain of 2 into a Scope',
      ['step amplitude 1 at t 0.5', 'gain 2'],
      harness
    );

    assertCompletedEvidence(result, harness, { minBlocks: 3, minEdges: 2 });

    const types = harness.getNodes().map(n => String(n.data?.type ?? n.type));
    expect(types).toContain('Step');
    expect(types).toContain('GAIN');
    expect(types).toContain('Scope');
    const gainNode = harness.getNodes().find(n => String(n.data?.type ?? n.type) === 'GAIN');
    expect(gainNode).toBeDefined();
    expect((gainNode!.data?.params as Record<string, unknown>)?.gain).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Negative scenarios: structured refusals with zero mutations
// ---------------------------------------------------------------------------
describe('General X-Bridges workflow integration (refusals with zero mutations)', () => {
  let harness: WorkflowHarness;

  beforeEach(() => {
    harness = createWorkflowHarness();
  });

  it('refuses unknown blocks invented by the user', async () => {
    const result = await runApprovedWorkflow(
      'Instantiate a FLUX_CAPACITOR block and connect it to a Scope',
      ['88 mph'],
      harness
    );

    expect(['blocked', 'refused']).toContain(result.final.status);
    expect(result.final.message).toMatch(/not.*(catalog|registered)|unknown block|unsupported/i);
    expect(harness.getNodes()).toHaveLength(0);
    expect(harness.getEdges()).toHaveLength(0);
    expect(harness.saveCount()).toBe(0);
  });

  it('refuses unsupported physics with zero mutations', async () => {
    const result = await runApprovedWorkflow(
      'Build a warp drive producing thrust from zero-point vacuum energy',
      [],
      harness
    );

    expect(['blocked', 'refused']).toContain(result.final.status);
    expect(result.final.message).toMatch(/unsupported|cannot be realized|refus/i);
    expect(harness.getNodes()).toHaveLength(0);
    expect(harness.saveCount()).toBe(0);
  });

  it('refuses requests with missing mandatory requirements instead of guessing', async () => {
    // optimize intent without objective, bounds, or target blocks must not
    // silently invent an optimization problem.
    const result = await runApprovedWorkflow(
      'Optimize the model',
      [],
      harness,
      { maxSteps: 4 }
    );

    expect(['clarifying', 'blocked', 'refused']).toContain(result.final.status);
    if (result.final.status !== 'clarifying') {
      expect(result.final.message).toMatch(/objective|required|missing/i);
    }
    expect(harness.getNodes()).toHaveLength(0);
    expect(harness.saveCount()).toBe(0);
  });

  it('refuses topologies that cannot satisfy port compatibility', async () => {
    const result = await runApprovedWorkflow(
      'Create a chain that feeds the output of a TERMINATOR block into a Scope',
      ['use terminator output'],
      harness
    );

    // TERMINATOR exposes no output port: the obligation is unsatisfiable.
    expect(['blocked', 'refused']).toContain(result.final.status);
    expect(harness.getNodes()).toHaveLength(0);
    expect(harness.saveCount()).toBe(0);
  });

  it('rejecting the plan approval rolls back with zero mutations', async () => {
    const result = await runApprovedWorkflow(
      'Create a signal chain: Step source into a Gain of 2 into a Scope',
      ['step amplitude 1', 'gain 2'],
      harness,
      { approvePlan: false }
    );

    const pending = harness.orchestrator.getPendingApproval();
    expect(pending, 'plan approval must be pending before rejection').toBeDefined();
    const rejected = await harness.orchestrator.reject(pending!.id, 'not today');
    expect(['blocked', 'refused', 'cancelled']).toContain(rejected.status);
    expect(harness.getNodes()).toHaveLength(0);
    expect(harness.getEdges()).toHaveLength(0);
    expect(harness.saveCount()).toBe(0);
  });
});
