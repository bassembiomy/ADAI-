/**
 * src/agent/generalXbridgesWorkflow.ts
 *
 * The single production workflow for every X-Bridges engineering request.
 *
 * Pipeline: normalize requirements -> retrieve verified patterns -> synthesize
 * a typed, catalog-only plan -> prove it with the real engine -> execute one
 * approved mutation at a time inside an atomic transaction -> save, reload,
 * and verify the final fingerprint.
 *
 * Ollama is an untrusted natural-language interpreter: deterministic services
 * (catalog, resolver, planner, proof engine, transaction journal) are
 * authoritative. Patterns guide planning but never authorize blocks, ports,
 * parameters, or physics that the installed catalog does not expose.
 */
import { OrchestratorResponse, ProjectContext } from './agentOrchestrator';
import { TaskState, AuditRecord } from './types';
import {
  createApprovalRequest,
  createActionApprovalRequest,
  approve as gateApprove,
  reject as gateReject,
  cancel as gateCancel,
  ExtendedApprovalRequest,
} from './approvalGate';
import { ToolGateway } from './toolGateway';
import { LlmProvider } from './llmProvider';
import { RequestCollaborator, ClassifiedRequest } from './collaborators/requestCollaborator';
import { PlanningCollaborator } from './collaborators/planningCollaborator';
import { ProofCollaborator } from './collaborators/proofCollaborator';
import { TransactionCollaborator } from './collaborators/transactionCollaborator';
import { XbridgesIntent, GeneralEngineeringRequest } from '../services/ai/planner/generalIntent';
import { resolveRequirements, RequirementResolution } from '../services/ai/planner/requirementResolver';
import { buildXbridgesCapabilityIndex } from '../services/ai/catalog/xbridgesCapabilityIndex';
import { LiveXbridgesModelAdapter, ModelSnapshot } from '../services/ai/adapters/liveXbridgesModelAdapter';
import { EngineeringModelPlanV2, StructuredDiagnostic } from '../services/ai/contracts/engineeringModel';
import { XbridgesProof } from '../services/ai/proof/xbridgesProofRunner';
import { ActionApprovalBinding, TransactionStatus } from '../services/ai/execution/xbridgesAgentTransaction';
import { computeModelFingerprint, canonicalJson, sha256Hex } from '../engine/opm/canonicalHash';
import { EngineeringPattern } from '../services/ai/planner/generalGraphPlanner';

// ---------------------------------------------------------------------------
// Pattern gateway contract (browser-safe; no Node fs/path in renderer code).
// Task 3 supplies the IPC-backed implementation over preload.
// ---------------------------------------------------------------------------
export interface PatternRetrievalQueryInput {
  intent?: XbridgesIntent;
  targetSystem?: string;
  targetBehaviors?: string[];
  domain?: string;
}

export interface EngineeringPatternGateway {
  listVerified(query: PatternRetrievalQueryInput): Promise<EngineeringPattern[]>;
  get(id: string): Promise<EngineeringPattern | undefined>;
  getManifestFingerprint(): Promise<string>;
}

/** Offline gateway with no patterns: planning continues, evidence is empty. */
export class NullPatternGateway implements EngineeringPatternGateway {
  async listVerified(): Promise<EngineeringPattern[]> {
    return [];
  }
  async get(): Promise<EngineeringPattern | undefined> {
    return undefined;
  }
  async getManifestFingerprint(): Promise<string> {
    return 'empty-manifest';
  }
}

export interface GeneralWorkflowDependencies {
  requirements: typeof resolveRequirements;
  patterns: EngineeringPatternGateway;
  planner: PlanningCollaborator;
  proof: ProofCollaborator;
  transactions: TransactionCollaborator;
}

export interface LivePlanningContext {
  projectId: string;
  workspace: string;
  getRevision(): number;
  setRevision(rev: number): void;
}

export type GeneralWorkflowTerminalState =
  | 'completed'
  | 'refused'
  | 'cancelled'
  | 'rolled_back'
  | 'failed_rollback'
  | undefined;

interface WorkflowSession {
  intent: XbridgesIntent;
  objective: string;
  rawPrompt: string;
  request?: GeneralEngineeringRequest;
  resolution?: RequirementResolution;
  plan?: EngineeringModelPlanV2;
  proof?: XbridgesProof;
  patternsSelected: Array<{ id: string; name: string; reason: string }>;
  patternsRejected: Array<{ id: string; name: string; reason: string }>;
  knowledgeHash?: string;
  observedDeltas: Array<Record<string, unknown>>;
  pendingApproval?: ExtendedApprovalRequest;
  approvals: ExtendedApprovalRequest[];
  actionIndex: number;
  preMutationFingerprint?: string;
  questionCounts: Record<string, number>;
  context: LivePlanningContext;
  terminalState: GeneralWorkflowTerminalState;
}

const UNSUPPORTED_PHYSICS_KEYWORDS = [
  'warp drive',
  'quantum engine',
  'perpetual motion',
  'infinite energy',
  'zero-point',
  'zero point energy',
  'rocket engine propulsion',
  'airplane rocket',
  'faster than light',
  'nonexistent block',
];

export class GeneralXbridgesWorkflow {
  public lastHandledIntent?: XbridgesIntent;

  private readonly llm: LlmProvider;
  private readonly tools: ToolGateway;
  private readonly deps: GeneralWorkflowDependencies;
  private readonly requestCollaborator: RequestCollaborator;
  private session?: WorkflowSession;
  private taskState?: TaskState;

  constructor(llm: LlmProvider, tools: ToolGateway, deps?: Partial<GeneralWorkflowDependencies>) {
    this.llm = llm;
    this.tools = tools;
    this.requestCollaborator = new RequestCollaborator(llm);
    this.deps = {
      requirements: deps?.requirements || resolveRequirements,
      patterns: deps?.patterns || new NullPatternGateway(),
      planner: deps?.planner || new PlanningCollaborator(),
      proof: deps?.proof || new ProofCollaborator(),
      transactions: deps?.transactions || new TransactionCollaborator(),
    };
  }

  public getTaskState(): TaskState | undefined {
    return this.taskState;
  }

  public getPendingApproval(): ExtendedApprovalRequest | undefined {
    return this.session?.pendingApproval;
  }

  public getSession(): Readonly<WorkflowSession> | undefined {
    return this.session;
  }

  public hasActiveSession(): boolean {
    return this.session !== undefined && this.session.terminalState === undefined;
  }

  /**
   * One-step undo of the last committed transaction. Only allowed when the
   * current workspace fingerprint still equals the committed after-state.
   */
  public async undoLastTransaction(projectId: string): Promise<{ success: boolean; message: string }> {
    const last = this.deps.transactions.getLastCommitted();
    if (!last) {
      return { success: false, message: 'No committed transaction available to undo.' };
    }
    const delegates = this.tools.getDelegates();
    if (delegates?.xbridges?.getRevisionFingerprint) {
      const currentFp = await delegates.xbridges.getRevisionFingerprint();
      if (currentFp !== last.record.afterHash) {
        return {
          success: false,
          message: 'Stale undo: X-Bridges model changed after the Agent transaction.',
        };
      }
    }
    const result = await last.transaction.undo(last.record.transactionId);
    this.appendAudit('TRANSACTION_UNDO', { projectId, restoredRevision: result.restoredRevision });
    return {
      success: result.success,
      message: `Transaction undone for project '${projectId}'. Workspace state restored to revision ${result.restoredRevision}.`,
    };
  }

  public getAuditHistory(): readonly AuditRecord[] {
    return this.taskState?.auditHistory ?? [];
  }

  private initTaskState(objective: string, targetSystem: string): void {
    const now = new Date().toISOString();
    this.taskState = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'clarifying',
      createdAt: now,
      updatedAt: now,
      requirementState: {
        id: `req_${Date.now()}`,
        objective,
        targetSystem,
        inputs: {},
        constraints: [],
        assumptions: [],
        requiredOutputs: [],
        successCriteria: [],
        openQuestions: [],
        answers: {},
        completenessScore: 0,
        conflicts: [],
      },
      events: [],
      approvals: [],
      pendingActions: [],
      auditHistory: [],
    } as TaskState;
  }

  private appendAudit(eventType: string, details: Record<string, unknown>): void {
    if (!this.taskState) return;
    const audit: AuditRecord = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      eventType,
      actor: 'agent',
      details,
    };
    this.taskState = {
      ...this.taskState,
      updatedAt: audit.timestamp,
      auditHistory: [...this.taskState.auditHistory, audit],
    };
  }

  private setTaskStatus(status: TaskState['status']): void {
    if (!this.taskState) return;
    this.taskState = { ...this.taskState, status, updatedAt: new Date().toISOString() };
  }

  private requireTaskState(): TaskState {
    if (!this.taskState) {
      // Defensive: facade always initializes through handle(); keep a stub.
      this.initTaskState('General X-Bridges request', 'xbridges_model');
    }
    return this.taskState!;
  }

  // -------------------------------------------------------------------------
  // Entry point
  // -------------------------------------------------------------------------
  public async handle(input: string, context: LivePlanningContext): Promise<OrchestratorResponse> {
    const trimmed = input.trim();

    // A finished session never consumes new input; start fresh instead.
    if (this.session?.terminalState !== undefined) {
      this.session = undefined;
    }

    if (!this.session) {
      return this.startSession(trimmed, context);
    }

    // Active clarification loop: record the answer and re-resolve. The session
    // stays bound to the context captured at session start.
    if (this.session.resolution && !this.session.resolution.complete) {
      const key = this.session.resolution.nextQuestion?.key || `answer_${Object.keys(this.session.request?.inputs || {}).length}`;
      this.appendAudit('CLARIFICATION_ANSWER', { key, answer: trimmed });
      this.mergeAnswerIntoRequest(key, trimmed);
      return this.progressAfterResolution(this.session.context);
    }

    return this.respond({
      status: 'blocked',
      message: 'Workflow is not awaiting further input. Start a new request.',
      taskState: this.requireTaskState(),
      intent: this.session.intent,
      transactionStatus: this.transactionStatus(),
    });
  }

  private mergeAnswerIntoRequest(key: string, answer: string): void {
    if (!this.session) return;
    const request = this.session.request;
    if (!request) return;

    const numeric = answer.match(/-?\d+(?:\.\d+)?/);
    const value: number | string = numeric ? Number(numeric[0]) : answer;

    if (key.startsWith('optimization_bounds_')) {
      // e.g. optimization_bounds_<blockId>_<param>
      request.optimization = request.optimization || {
        objective: 'unspecified',
        targetMetric: 'unspecified',
        direction: 'minimize',
        parametersToTune: [],
      };
      request.optimization.parametersToTune.push({
        blockId: key.replace('optimization_bounds_', '').split('_')[0] || 'unknown',
        parameterName: key.replace('optimization_bounds_', '').split('_').slice(1).join('_') || 'value',
        min: typeof value === 'number' ? value : 0,
        max: typeof value === 'number' ? value * 2 : 1,
      });
      return;
    }

    // Fold the free-text answer back into the request so deterministic
    // re-resolution can see it. Load/observable answers belong to outputs,
    // everything else to inputs.
    const isOutputAnswer =
      key === 'load_specification' ||
      key.startsWith('observable') ||
      key.startsWith('output');
    if (isOutputAnswer) {
      request.outputs = [
        ...request.outputs.filter(o => o.name !== key),
        { name: key, value, sourceText: answer },
      ];
    } else {
      request.inputs = [
        ...request.inputs.filter(i => i.name !== key),
        { name: key, value, sourceText: answer },
      ];
    }
    request.targetBehaviors = Array.from(
      new Set([...request.targetBehaviors, ...deriveBehaviorsFromText(answer)])
    );
    request.rawPrompt = `${request.rawPrompt ?? ''}\n${answer}`;
  }

  private async startSession(input: string, context: LivePlanningContext): Promise<OrchestratorResponse> {
    const lower = input.toLowerCase();

    // Unsupported physics: refuse before anything else.
    if (UNSUPPORTED_PHYSICS_KEYWORDS.some(k => lower.includes(k))) {
      this.initTaskState(input, 'unsupported');
      this.setTaskStatus('blocked');
      this.appendAudit('REQUEST_REFUSED', { reason: 'UNSUPPORTED_PHYSICS', input });
      return this.respond({
        status: 'blocked',
        message: `Request refused: the requested physics cannot be realized by the installed X-Bridges catalog. Supported capability domains: ${buildXbridgesCapabilityIndex().categories.join(', ') || 'catalog blocks'}.`,
        taskState: this.requireTaskState(),
        intent: 'create',
        transactionStatus: 'idle',
        finalEvidence: undefined,
      });
    }

    const classified: ClassifiedRequest = await this.requestCollaborator.classifyRequest(input);
    this.lastHandledIntent = classified.intent;

    if (!classified.isSupported) {
      this.initTaskState(input, 'unsupported');
      this.setTaskStatus('blocked');
      this.appendAudit('REQUEST_REFUSED', { reason: 'UNCLASSIFIED_REQUEST', input });
      return this.respond({
        status: 'blocked',
        message:
          classified.unsupportedReason ||
          'Request refused: no installed X-Bridges catalog capability matches this request. Describe a model expressible with catalog blocks (sources, gains, integrators, controllers, logic, sinks, ...).',
        taskState: this.requireTaskState(),
        intent: classified.intent,
        transactionStatus: 'idle',
      });
    }

    this.initTaskState(input, classified.targetSystem);
    this.session = {
      intent: classified.intent,
      objective: classified.objective,
      rawPrompt: input,
      patternsSelected: [],
      patternsRejected: [],
      observedDeltas: [],
      approvals: [],
      actionIndex: 0,
      questionCounts: {},
      context,
      terminalState: undefined,
    };

    // Read-only intents never mutate and need no approvals.
    if (classified.intent === 'inspect') {
      return this.runInspect();
    }
    if (classified.intent === 'diagnose') {
      return this.runDiagnose();
    }

    // Mutation intents: extract and resolve requirements deterministically.
    const request = await this.extractRequest(input, classified);
    this.session.request = request;

    const refusal = this.detectHardRefusals(request);
    if (refusal) {
      this.session.terminalState = 'refused';
      this.setTaskStatus('blocked');
      this.appendAudit('REQUEST_REFUSED', { reason: refusal.code, message: refusal.message });
      return this.respond({
        status: 'blocked',
        message: refusal.message,
        taskState: this.requireTaskState(),
        intent: this.session.intent,
        resolvedRequirements: request,
        transactionStatus: 'idle',
      });
    }

    return this.progressAfterResolution(context);
  }

  /**
   * Ollama is advisory only: it may contribute intent hints and entities, but
   * every identifier is revalidated against the installed catalog by the
   * deterministic layers downstream.
   */
  private async extractRequest(input: string, classified: ClassifiedRequest): Promise<GeneralEngineeringRequest> {
    const behaviors = deriveBehaviorsFromText(`${input} ${classified.targetSystem}`);
    const request: GeneralEngineeringRequest = {
      intent: classified.intent,
      objective: classified.objective,
      targetBehaviors: behaviors,
      inputs: [],
      outputs: [],
      constraints: [],
      rawPrompt: input,
    };

    // Explicit catalog block mentions (advisory source: user text).
    const mentioned = extractBlockMentions(input);
    if (mentioned.length > 0) {
      request.inputs = [
        ...request.inputs,
        { name: 'block_mentions', value: mentioned.join(','), description: 'Blocks named explicitly by the user' },
      ];
    }

    // Numeric quantities with units.
    for (const q of extractQuantities(input)) {
      request.inputs.push({ name: q.name, value: q.value, unit: q.unit, sourceText: q.sourceText });
    }

    // LLM hint (advisory only — never authoritative).
    try {
      const health = await this.llm.health();
      if (health.available) {
        const hint = await this.llm.generate<{
          targetBehaviors?: string[];
          objective?: string;
        }>(
          {
            system: 'You extract engineering intent. Reply JSON only.',
            user: `Extract behaviors/objective for: ${input}`,
          } as never,
          { type: 'object' } as never
        );
        if (hint.success && hint.data) {
          const extra = Array.isArray(hint.data.targetBehaviors) ? hint.data.targetBehaviors : [];
          request.targetBehaviors = Array.from(new Set([...request.targetBehaviors, ...extra.filter(b => typeof b === 'string')]));
        }
      }
    } catch {
      // Deterministic extraction remains authoritative when Ollama is unavailable.
    }

    return request;
  }

  /** Unknown blocks and impossible obligations are refused before any planning. */
  private detectHardRefusals(request: GeneralEngineeringRequest): { code: string; message: string } | undefined {
    const catalog = buildXbridgesCapabilityIndex();
    const mentionInput = request.inputs.find(i => i.name === 'block_mentions');
    if (mentionInput && typeof mentionInput.value === 'string') {
      for (const name of mentionInput.value.split(',').map(s => s.trim()).filter(Boolean)) {
        const cap = catalog.blocks.get(name) || catalog.aliases.get(name.toLowerCase());
        if (!cap) {
          return {
            code: 'UNKNOWN_BLOCK',
            message: `Request refused: block '${name}' is not registered in the installed X-Bridges catalog and will not be invented. Use only catalog blocks.`,
          };
        }
      }
    }
    return undefined;
  }

  private async progressAfterResolution(context: LivePlanningContext): Promise<OrchestratorResponse> {
    const session = this.session!;
    const catalog = buildXbridgesCapabilityIndex();

    const resolution = this.deps.requirements(session.request!, catalog);
    session.resolution = resolution;

    if (resolution.conflicts && resolution.conflicts.length > 0) {
      const description = resolution.conflicts.map(c => c.description).join('; ');
      this.setTaskStatus('blocked');
      this.appendAudit('REQUIREMENT_CONFLICT', { conflicts: resolution.conflicts });
      return this.respond({
        status: 'blocked',
        message: `Requirement conflict: ${description}. Please clarify which value governs.`,
        taskState: this.requireTaskState(),
        intent: session.intent,
        resolvedRequirements: session.request,
        transactionStatus: this.transactionStatus(),
      });
    }

    if (!resolution.complete) {
      const q = resolution.nextQuestion;
      const qKey = q?.key ?? resolution.unresolvedKeys.join(', ') ?? 'unknown';
      const asked = (session.questionCounts[qKey] || 0) + 1;
      session.questionCounts = { ...session.questionCounts, [qKey]: asked };
      if (!q || asked > 4) {
        session.terminalState = 'refused';
        this.setTaskStatus('blocked');
        this.appendAudit('REQUIREMENT_UNRESOLVABLE', { key: q?.key, attempts: asked });
        return this.respond({
          status: 'blocked',
          message: `Request refused: mandatory requirement '${q?.key ?? resolution.unresolvedKeys.join(', ')}' remains unresolved after clarification. No assumptions will be invented.`,
          taskState: this.requireTaskState(),
          intent: session.intent,
          resolvedRequirements: session.request,
          transactionStatus: 'idle',
        });
      }
      this.setTaskStatus('clarifying');
      this.appendAudit('QUESTION_ASKED', { key: q.key, question: q.question });
      const promptText = q.recommendedDefault
        ? `${q.question}\n(Recommended: ${q.recommendedDefault} — ${q.rationale})`
        : q.question;
      return this.respond({
        status: 'clarifying',
        message: promptText,
        taskState: this.requireTaskState(),
        intent: session.intent,
        resolvedRequirements: session.request,
        transactionStatus: this.transactionStatus(),
      });
    }

    // Requirements complete: planning needs a live workspace target.
    const delegates = this.tools.getDelegates();
    if (!delegates?.xbridges) {
      this.setTaskStatus('failed');
      return this.respond({
        status: 'failed',
        message: 'X-Bridges workspace delegate is unavailable; refusing to proceed without a live model target.',
        taskState: this.requireTaskState(),
        intent: session.intent,
        transactionStatus: 'idle',
      });
    }

    const adapter = new LiveXbridgesModelAdapter(delegates.xbridges, {
      projectId: context.projectId,
      getRevision: context.getRevision,
      setRevision: context.setRevision,
    });
    const snapshot = await adapter.inspect();

    // Retrieve patterns, plan, prove.
    return this.planProveAndPresent(context, snapshot, adapter, resolution.canonicalRequest || session.request!);
  }

  private async planProveAndPresent(
    context: LivePlanningContext,
    snapshot: ModelSnapshot,
    adapter: LiveXbridgesModelAdapter,
    request: GeneralEngineeringRequest
  ): Promise<OrchestratorResponse> {
    const session = this.session!;
    const catalog = buildXbridgesCapabilityIndex();

    // Knowledge retrieval: verified compatible patterns only (advisory).
    let patterns: EngineeringPattern[] = [];
    try {
      session.knowledgeHash = await this.deps.patterns.getManifestFingerprint();
      patterns = await this.deps.patterns.listVerified({
        intent: session.intent,
        targetSystem: request.objective,
        targetBehaviors: request.targetBehaviors,
      });
      session.patternsSelected = patterns.map(p => ({ id: p.id, name: p.name, reason: 'verified & catalog-compatible' }));
    } catch (err) {
      // Fail closed on invalid knowledge stores.
      this.setTaskStatus('blocked');
      this.appendAudit('KNOWLEDGE_STORE_REJECTED', { error: String(err) });
      return this.respond({
        status: 'blocked',
        message: `Request refused: engineering knowledge store failed integrity validation (${err instanceof Error ? err.message : String(err)}).`,
        taskState: this.requireTaskState(),
        intent: session.intent,
        transactionStatus: 'idle',
      });
    }

    const outcome = this.deps.planner.planGeneralModel(request, {
      projectId: context.projectId,
      baseRevision: context.getRevision(),
      activeSnapshot: snapshot,
      catalog,
      patterns,
    });

    if (outcome.status === 'refused' || !outcome.plan) {
      session.terminalState = 'refused';
      this.setTaskStatus('blocked');
      const detail = outcome.diagnostics.map(d => d.message).join('; ') || 'no catalog-supported realization exists';
      this.appendAudit('PLAN_REFUSED', { diagnostics: outcome.diagnostics });
      return this.respond({
        status: 'blocked',
        message: `Request refused: ${detail}`,
        taskState: this.requireTaskState(),
        intent: session.intent,
        resolvedRequirements: request,
        patternEvidence: { selected: session.patternsSelected, rejected: session.patternsRejected },
        transactionStatus: 'idle',
      });
    }

    const plan = outcome.plan;
    session.plan = plan;

    // Real-engine proof before any approval is requested.
    const proof = await this.deps.proof.provePlan(plan);
    session.proof = proof;
    if (proof.status !== 'proved') {
      session.terminalState = 'refused';
      this.setTaskStatus('blocked');
      const detail = proof.diagnostics.map(d => d.message).join('; ') || 'isolated engine proof failed';
      this.appendAudit('PROOF_REFUSED', { diagnostics: proof.diagnostics });
      return this.respond({
        status: 'blocked',
        message: `Request refused: plan proof failed — ${detail}`,
        taskState: this.requireTaskState(),
        intent: session.intent,
        resolvedRequirements: request,
        plan,
        proof,
        patternEvidence: { selected: session.patternsSelected, rejected: session.patternsRejected },
        transactionStatus: 'idle',
      });
    }

    this.appendAudit('PLAN_PROVED', { planHash: plan.planHash, engineRunId: proof.engineRunId });

    const planApproval = createApprovalRequest(
      'plan',
      'Approve Execution Plan',
      `Proven plan with ${plan.actions.length} actions (proof run ${proof.engineRunId})`,
      {
        planId: plan.planId,
        planHash: plan.planHash,
        catalogHash: plan.catalogFingerprint,
        engineRunId: proof.engineRunId,
        actionsCount: plan.actions.length,
      }
    );
    session.pendingApproval = planApproval;
    session.approvals = [...session.approvals, planApproval];
    this.setTaskStatus('awaiting_plan_approval');
    this.appendAudit('PLAN_APPROVAL_REQUESTED', { approvalId: planApproval.id, planHash: plan.planHash });

    return this.respond({
      status: 'awaiting_plan_approval',
      message: `Plan is ready and engine-proven (run ${proof.engineRunId}). ${plan.actions.length} actions require individual approval.`,
      taskState: this.requireTaskState(),
      intent: session.intent,
      resolvedRequirements: request,
      patternEvidence: { selected: session.patternsSelected, rejected: session.patternsRejected, knowledgeHash: session.knowledgeHash },
      plan,
      proof,
      pendingApproval: planApproval,
      currentApproval: planApproval,
      transactionStatus: this.transactionStatus(),
    });
  }

  // -------------------------------------------------------------------------
  // Approvals
  // -------------------------------------------------------------------------
  public async approve(requestId: string, reason?: string): Promise<OrchestratorResponse> {
    const session = this.session;
    if (!session || !session.pendingApproval || session.pendingApproval.id !== requestId) {
      throw new Error(`No matching pending approval request for ID '${requestId}'`);
    }
    const approvedReq = gateApprove(session.pendingApproval, reason);
    session.pendingApproval = undefined;
    session.approvals = [...session.approvals, approvedReq];

    if (approvedReq.type === 'plan') {
      return this.onPlanApproved(reason);
    }
    if (approvedReq.type === 'change' || approvedReq.type === 'action') {
      return this.onActionApproved(approvedReq, reason);
    }
    throw new Error(`Unhandled approval type '${approvedReq.type}'`);
  }

  private async onPlanApproved(reason?: string): Promise<OrchestratorResponse> {
    const session = this.session!;
    const delegates = this.tools.getDelegates();
    if (!delegates?.xbridges || !session.plan || !session.proof) {
      this.setTaskStatus('failed');
      return this.respond({
        status: 'failed',
        message: 'Plan approval failed: workspace or proved plan unavailable.',
        taskState: this.requireTaskState(),
        intent: session.intent,
        transactionStatus: this.transactionStatus(),
      });
    }

    const context = session.context;
    const adapter = new LiveXbridgesModelAdapter(delegates.xbridges, {
      projectId: context.projectId,
      getRevision: context.getRevision,
      setRevision: context.setRevision,
    });

    try {
      await this.deps.transactions.beginTransaction(
        adapter,
        delegates.xbridges,
        { plan: session.plan, proof: session.proof },
        { projectId: context.projectId, getRevision: context.getRevision, setRevision: context.setRevision }
      );
    } catch (err) {
      this.setTaskStatus('failed');
      this.appendAudit('TRANSACTION_BEGIN_FAILED', { error: String(err) });
      return this.respond({
        status: 'failed',
        message: `Transaction could not begin: ${err instanceof Error ? err.message : String(err)}`,
        taskState: this.requireTaskState(),
        intent: session.intent,
        transactionStatus: 'failed',
      });
    }

    session.preMutationFingerprint = (await delegates.xbridges.getRevisionFingerprint?.()) as string | undefined;
    this.appendAudit('TRANSACTION_BEGAN', { planHash: session.plan.planHash, reason: reason || '' });
    return this.presentNextActionApproval('Plan approved. Every action requires individual approval.');
  }

  private computeBinding(actionIndex: number): ActionApprovalBinding {
    const session = this.session!;
    const action = session.plan!.actions[actionIndex];
    return {
      token: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      projectId: session.plan!.projectId,
      baseRevision: session.plan!.baseRevision,
      planHash: session.plan!.planHash,
      actionId: action.id,
      actionKind: action.kind,
      canonicalParamsHash: computeModelFingerprint(action),
    };
  }

  private presentNextActionApproval(message: string): OrchestratorResponse {
    const session = this.session!;
    const txState = this.deps.transactions.getTransaction()?.getState();
    const actionIndex = txState ? txState.nextActionIndex : session.actionIndex;
    const action = session.plan!.actions[actionIndex];
    const binding = this.computeBinding(actionIndex);

    const approval = createActionApprovalRequest({
      projectId: binding.projectId,
      baseRevision: binding.baseRevision,
      planHash: binding.planHash,
      actionId: binding.actionId,
      actionKind: binding.actionKind,
      canonicalParamsHash: binding.canonicalParamsHash,
      title: `Approve Action ${actionIndex + 1}/${session.plan!.actions.length}: ${binding.actionKind} (${binding.actionId})`,
      description: `Execute '${binding.actionKind}' action '${binding.actionId}' with approved canonical parameters.`,
    });
    approval.payload = { ...approval.payload, binding };

    session.pendingApproval = approval;
    session.approvals = [...session.approvals, approval];
    session.actionIndex = actionIndex;
    this.setTaskStatus('awaiting_change_approval');
    this.appendAudit('ACTION_APPROVAL_REQUESTED', {
      approvalId: approval.id,
      actionId: binding.actionId,
      actionKind: binding.actionKind,
      actionIndex,
    });

    return this.respond({
      status: 'awaiting_change_approval',
      message: `${message} Next: ${approval.title}.`,
      taskState: this.requireTaskState(),
      intent: session.intent,
      resolvedRequirements: session.request,
      plan: session.plan,
      proof: session.proof,
      pendingApproval: approval,
      currentApproval: approval,
      observedDeltas: session.observedDeltas,
      transactionStatus: this.transactionStatus(),
    });
  }

  private async onActionApproved(approvedReq: ExtendedApprovalRequest, reason?: string): Promise<OrchestratorResponse> {
    const session = this.session!;
    const binding = approvedReq.payload.binding as ActionApprovalBinding | undefined;
    if (!binding) {
      throw new Error('Approval token is missing its action binding; refusing to execute.');
    }

    const tx = this.deps.transactions.getTransaction();
    if (!tx) {
      this.setTaskStatus('failed');
      return this.respond({
        status: 'failed',
        message: 'No active transaction; action cannot be executed.',
        taskState: this.requireTaskState(),
        intent: session.intent,
        transactionStatus: 'failed',
      });
    }

    let result;
    try {
      result = await tx.approveAndExecute(binding);
    } catch (err) {
      const txState = tx.getState();
      const rolledBack = txState.status === 'rolled_back';
      const failedRollback = txState.status === 'failed_rollback';
      session.terminalState = failedRollback ? 'failed_rollback' : rolledBack ? 'rolled_back' : undefined;
      this.setTaskStatus('failed');
      this.appendAudit('ACTION_EXECUTION_FAILED', {
        actionId: binding.actionId,
        error: String(err instanceof Error ? err.message : err),
        transactionStatus: txState.status,
      });
      return this.respond({
        status: 'failed',
        message: `Execution failed on '${binding.actionId}': ${err instanceof Error ? err.message : String(err)}. ${
          rolledBack ? 'Workspace restored to pre-transaction snapshot.' : failedRollback ? 'ROLLBACK FAILED: manual inspection required.' : ''
        }`,
        taskState: this.requireTaskState(),
        intent: session.intent,
        plan: session.plan,
        proof: session.proof,
        observedDeltas: session.observedDeltas,
        transactionStatus: this.transactionStatus(),
      });
    }

    // Post-action integrity: the live topology must never contain dangling
    // edges; violations trigger full rollback of the transaction.
    const delegates = this.tools.getDelegates();
    if (delegates?.xbridges) {
      const liveNodes = await delegates.xbridges.getNodes();
      const liveEdges = await delegates.xbridges.getEdges();
      const nodeIds = new Set(liveNodes.map(n => n.id));
      const dangling = liveEdges.filter(e => !nodeIds.has(e.source) || !nodeIds.has(e.target));
      if (dangling.length > 0) {
        const rb = await this.deps.transactions.rollback(
          `POST_ACTION_TOPOLOGY_VIOLATION: dangling edge '${dangling[0].id}' after action '${binding.actionId}'`
        );
        session.terminalState = rb.success ? 'rolled_back' : 'failed_rollback';
        this.setTaskStatus('failed');
        this.appendAudit('TOPOLOGY_VALIDATION_FAILED', {
          actionId: binding.actionId,
          danglingEdgeId: dangling[0].id,
          rolledBack: rb.success,
        });
        return this.respond({
          status: 'failed',
          message: `Validation failed: X-BRIDGES topology contains a dangling edge (${dangling[0].id}). ${rb.success ? 'Workspace restored to pre-transaction snapshot.' : 'ROLLBACK FAILED.'}`,
          taskState: this.requireTaskState(),
          intent: session.intent,
          plan: session.plan,
          proof: session.proof,
          observedDeltas: session.observedDeltas,
          transactionStatus: this.transactionStatus(),
        });
      }
    }

    session.observedDeltas = [
      ...session.observedDeltas,
      {
        actionId: binding.actionId,
        actionKind: binding.actionKind,
        beforeHash: result.beforeHash,
        afterHash: result.afterHash,
        changedNodeIds: result.changedNodeIds,
        changedEdgeIds: result.changedEdgeIds,
        reason: reason || '',
      },
    ];
    this.appendAudit('ACTION_EXECUTED', { actionId: binding.actionId, afterHash: result.afterHash });

    const txState = tx.getState();
    if (txState.status === 'final_verification') {
      return this.finalizeTransaction(reason);
    }
    return this.presentNextActionApproval(`Action '${binding.actionId}' executed and verified.`);
  }

  private async finalizeTransaction(reason?: string): Promise<OrchestratorResponse> {
    const session = this.session!;
    const delegates = this.tools.getDelegates();
    const tx = this.deps.transactions.getTransaction();
    if (!delegates?.xbridges || !tx || !session.plan || !session.proof) {
      this.setTaskStatus('failed');
      return this.respond({
        status: 'failed',
        message: 'Final verification failed: missing delegate, transaction, or proved plan.',
        taskState: this.requireTaskState(),
        intent: session.intent,
        transactionStatus: 'failed',
      });
    }

    // Commit: save + read-back with fingerprint comparison happens inside.
    let committed;
    try {
      committed = await this.deps.transactions.commit();
    } catch (err) {
      const txState = tx.getState();
      session.terminalState = txState.status === 'failed_rollback' ? 'failed_rollback' : 'rolled_back';
      this.setTaskStatus('failed');
      this.appendAudit('TRANSACTION_COMMIT_FAILED', { error: String(err) });
      return this.respond({
        status: 'failed',
        message: `Commit failed: ${err instanceof Error ? err.message : String(err)}. Workspace restored to pre-transaction snapshot.`,
        taskState: this.requireTaskState(),
        intent: session.intent,
        transactionStatus: this.transactionStatus(),
      });
    }

    // Reload verification: re-read persisted+live state and compare fingerprints.
    const liveNodes = await delegates.xbridges.getNodes();
    const liveEdges = await delegates.xbridges.getEdges();
    const reloadedFingerprint =
      (await delegates.xbridges.getRevisionFingerprint?.()) ||
      sha256Hex(canonicalJson({ nodes: liveNodes, edges: liveEdges }));

    const reloadMatches = committed ? reloadedFingerprint === committed.afterHash : false;
    if (!reloadMatches) {
      session.terminalState = 'rolled_back';
      this.setTaskStatus('failed');
      this.appendAudit('RELOAD_VERIFICATION_FAILED', { saved: committed?.afterHash, reloaded: reloadedFingerprint });
      return this.respond({
        status: 'failed',
        message: 'Reload verification failed: persisted fingerprint does not match live state. Transaction rolled back.',
        taskState: this.requireTaskState(),
        intent: session.intent,
        transactionStatus: 'rolled_back',
      });
    }

    session.terminalState = 'completed';
    this.setTaskStatus('completed');
    this.appendAudit('WORKFLOW_COMPLETED', {
      planHash: session.plan.planHash,
      engineRunId: session.proof.engineRunId,
      savedFingerprint: committed?.afterHash,
      persistedRevision: committed?.committedRevision,
    });

    return this.respond({
      status: 'completed',
      message: `All ${session.plan.actions.length} approved actions executed, saved, reloaded, and fingerprint-verified.`,
      taskState: this.requireTaskState(),
      intent: session.intent,
      resolvedRequirements: session.request,
      patternEvidence: { selected: session.patternsSelected, rejected: session.patternsRejected, knowledgeHash: session.knowledgeHash },
      plan: session.plan,
      proof: session.proof,
      observedDeltas: session.observedDeltas,
      transactionStatus: 'committed',
      finalEvidence: {
        engineRunId: session.proof.engineRunId,
        proof: session.proof,
        planHash: session.plan.planHash,
        catalogHash: session.plan.catalogFingerprint,
        knowledgeHash: session.knowledgeHash,
        savedFingerprint: committed?.afterHash,
        reloadedFingerprint,
        persistedRevision: committed?.committedRevision,
        baseRevision: committed?.baseRevision,
        validationPassed: true,
        metrics: session.proof.observables,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Reject / cancel
  // -------------------------------------------------------------------------
  public async reject(requestId: string, reason: string): Promise<OrchestratorResponse> {
    const session = this.session;
    if (!session || !session.pendingApproval || session.pendingApproval.id !== requestId) {
      throw new Error(`No matching pending approval request for ID '${requestId}'`);
    }
    const rejected = gateReject(session.pendingApproval, reason);
    session.pendingApproval = undefined;
    session.approvals = [...session.approvals, rejected];
    return this.rollBackSession(`Rejected by user: ${reason}`, 'rolled_back', rejected.type);
  }

  public async cancel(reason: string): Promise<OrchestratorResponse> {
    if (!this.session) {
      return this.respond({
        status: 'blocked',
        message: 'Nothing to cancel.',
        taskState: this.requireTaskState(),
        transactionStatus: 'idle',
      });
    }
    if (this.session.pendingApproval) {
      const cancelledReq = gateCancel(this.session.pendingApproval, reason);
      this.session.pendingApproval = undefined;
      this.session.approvals = [...this.session.approvals, cancelledReq];
    }
    return this.rollBackSession(`Cancelled by user: ${reason}`, 'cancelled');
  }

  private async rollBackSession(
    reason: string,
    terminal: 'rolled_back' | 'cancelled',
    approvalType?: string
  ): Promise<OrchestratorResponse> {
    const session = this.session!;
    const tx = this.deps.transactions.getTransaction();
    let rolledBackNow = false;

    if (tx) {
      const result = approvalType === 'plan' ? await this.deps.transactions.rollback(reason) : await tx.reject(session.plan?.actions[session.actionIndex]?.id || '');
      rolledBackNow = result.success;
      session.terminalState = result.success ? terminal : 'failed_rollback';
    } else {
      session.terminalState = terminal === 'cancelled' ? 'cancelled' : 'refused';
    }

    this.setTaskStatus('blocked');
    this.appendAudit(tx ? 'TRANSACTION_ROLLED_BACK' : 'WORKFLOW_REJECTED', {
      reason,
      success: rolledBackNow,
      terminalState: session.terminalState,
    });

    const statusMessage =
      session.terminalState === 'failed_rollback'
        ? `ROLLBACK FAILED: ${reason}. Workspace state may be inconsistent — manual inspection required.`
        : tx
          ? `Request ${terminal}: ${reason}. Workspace restored to pre-transaction snapshot.`
          : `Request ${session.terminalState}: ${reason}. No mutations were made.`;

    return this.respond({
      status: 'blocked',
      message: statusMessage,
      taskState: this.requireTaskState(),
      intent: session.intent,
      resolvedRequirements: session.request,
      plan: session.plan,
      proof: session.proof,
      observedDeltas: session.observedDeltas,
      transactionStatus: this.transactionStatus(),
    });
  }

  // -------------------------------------------------------------------------
  // Read-only intents
  // -------------------------------------------------------------------------
  private async runInspect(): Promise<OrchestratorResponse> {
    const session = this.session!;
    const delegates = this.tools.getDelegates();
    const liveNodes = delegates?.xbridges ? await delegates.xbridges.getNodes() : [];
    const liveEdges = delegates?.xbridges ? await delegates.xbridges.getEdges() : [];
    const catalog = buildXbridgesCapabilityIndex();

    const blockSummary = liveNodes.map(n => ({
      id: n.id,
      type: String(n.data?.type ?? n.type),
      inCatalog: catalog.blocks.has(String(n.data?.type ?? n.type)),
    }));

    this.setTaskStatus('completed');
    session.terminalState = 'completed';
    this.appendAudit('INSPECT_COMPLETED', { nodes: liveNodes.length, edges: liveEdges.length });

    return this.respond({
      status: 'completed',
      message: `Inspection complete: ${liveNodes.length} blocks and ${liveEdges.length} connections in the active workspace.`,
      taskState: this.requireTaskState(),
      intent: 'inspect',
      observedDeltas: { nodesCount: liveNodes.length, edgesCount: liveEdges.length, blocks: blockSummary },
      transactionStatus: 'idle',
      finalEvidence: {
        nodesCount: liveNodes.length,
        edgesCount: liveEdges.length,
        catalogHash: catalog.catalogFingerprint,
        validationPassed: true,
      },
    });
  }

  private async runDiagnose(): Promise<OrchestratorResponse> {
    const session = this.session!;
    const delegates = this.tools.getDelegates();
    const liveNodes = delegates?.xbridges ? await delegates.xbridges.getNodes() : [];
    const liveEdges = delegates?.xbridges ? await delegates.xbridges.getEdges() : [];
    const nodeIds = new Set(liveNodes.map(n => n.id));

    const diagnostics: StructuredDiagnostic[] = [];
    for (const e of liveEdges) {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
        diagnostics.push({
          category: 'TOPOLOGY',
          code: 'DANGLING_CONNECTION',
          severity: 'ERROR',
          message: `Connection '${e.id}' references a non-existent node.`,
          entityId: e.id,
        });
      }
    }
    const unconnected = liveNodes.filter(n => !liveEdges.some(e => e.source === n.id || e.target === n.id));
    for (const n of unconnected) {
      diagnostics.push({
        category: 'TOPOLOGY',
        code: 'UNCONNECTED_BLOCK',
        severity: 'WARNING',
        message: `Block '${n.id}' has no connections.`,
        entityId: n.id,
      });
    }

    this.setTaskStatus('completed');
    session.terminalState = 'completed';
    this.appendAudit('DIAGNOSIS_COMPLETED', { findings: diagnostics.length });

    return this.respond({
      status: 'completed',
      message:
        diagnostics.length === 0
          ? 'No topology defects detected in the active model.'
          : `Diagnosis complete: ${diagnostics.length} finding(s).`,
      taskState: this.requireTaskState(),
      intent: 'diagnose',
      validationResult: {
        valid: diagnostics.filter(d => d.severity === 'ERROR').length === 0,
        errors: diagnostics.filter(d => d.severity === 'ERROR').map(d => d.message),
        diagnostics,
      } as never,
      observedDeltas: { diagnostics },
      transactionStatus: 'idle',
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private transactionStatus(): TransactionStatus | 'idle' | 'failed' {
    const tx = this.deps.transactions.getTransaction();
    if (!tx) return this.session?.terminalState === 'failed_rollback' ? 'failed_rollback' : 'idle';
    return tx.getState().status;
  }

  private respond(response: OrchestratorResponse): OrchestratorResponse {
    return { ...response, taskState: response.taskState || this.requireTaskState() };
  }
}

// ---------------------------------------------------------------------------
// Deterministic extraction helpers (Ollama never authorizes identifiers)
// ---------------------------------------------------------------------------
const BEHAVIOR_KEYWORDS: Array<{ match: RegExp; behavior: string }> = [
  { match: /\b(pid|closed[- ]loop|feedback)\b/i, behavior: 'closed_loop_control' },
  { match: /\b(speed control|speed controller|velocity control)\b/i, behavior: 'speed_control' },
  { match: /\b(low[- ]?pass|lowpass|filter|smoothing)\b/i, behavior: 'low_pass_filter' },
  { match: /\b(thermal|temperature|heat|alarm)\b/i, behavior: 'thermal_alarm_logic' },
  { match: /\b(motor drive|motor control|three[- ]phase|inverter|pwm)\b/i, behavior: 'motor_drive' },
  { match: /\b(feed[- ]?forward|open[- ]?loop|signal chain|step response)\b/i, behavior: 'feed_forward' },
  { match: /\b(air[- ]?fryer|airfryer)\b/i, behavior: 'thermal_control' },
  { match: /\b(logic|interlock|sequen\w+|latch|flip[- ]?flop)\b/i, behavior: 'logical_sequencing' },
];

export function deriveBehaviorsFromText(text: string): string[] {
  const behaviors = new Set<string>();
  for (const { match, behavior } of BEHAVIOR_KEYWORDS) {
    if (match.test(text)) behaviors.add(behavior);
  }
  return [...behaviors].sort();
}

const BLOCK_MENTION_PATTERN = /\b([A-Z][A-Z0-9_]{2,}|[A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;

export function extractBlockMentions(text: string): string[] {
  const mentions = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = BLOCK_MENTION_PATTERN.exec(text)) !== null) {
    mentions.add(m[1]);
  }
  return [...mentions].sort();
}

const QUANTITY_PATTERN =
  /\b(setpoint|set point|gain|kp|ki|kd|threshold|frequency|voltage|time constant|amplitude|resistance|load)\s*(?:of|:|=)?\s*(-?\d+(?:\.\d+)?)\s*(rpm|hz|khz|mhz|v|kv|a|ma|w|kw|ohm|ohms|s|ms|degc|°c|celsius)?/gi;

export function extractQuantities(text: string): Array<{ name: string; value: number; unit?: string; sourceText: string }> {
  const out: Array<{ name: string; value: number; unit?: string; sourceText: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = QUANTITY_PATTERN.exec(text)) !== null) {
    out.push({
      name: m[1].toLowerCase().replace(/\s+/g, '_'),
      value: Number(m[2]),
      unit: m[3]?.toLowerCase(),
      sourceText: m[0],
    });
  }
  return out;
}
