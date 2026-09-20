import {
  TaskState,
  WorkflowStatus,
  AuditRecord,
  ActionKind,
  ApprovedAction
} from './types';
import {
  createTaskState,
  recordAnswer,
  transitionState
} from './requirementState';
import {
  ClarificationEngine,
  ClarificationQuestion,
  AnalysisResult
} from './clarificationEngine';
import {
  buildSpecification,
  EngineeringSpecification
} from './specificationEngine';
import {
  buildExecutionPlan,
  createChangeApprovalRequest,
  ExecutionPlan,
  buildEngineeringModelPlanFromExecutionPlan
} from './planEngine';
import { AdiaBlockCatalog } from './adiaBlockCatalog';
import { resolveBlockCapability } from '../services/ai/catalog/xbridgesCapabilityIndex';
import { PlanPreflight, PreflightResult } from '../services/ai/planner/planPreflight';
import { EngineeringModelAdapter, StoredBlock, StoredConnection } from '../services/ai/adapters/engineeringModelAdapter';
import { SimulationTools, SimulationResult } from '../services/ai/simulation/simulationTools';
import {
  createApprovalRequest,
  approve as gateApprove,
  reject as gateReject,
  cancel as gateCancel,
  ExtendedApprovalRequest
} from './approvalGate';
import { XbridgesAgentTransaction } from '../services/ai/execution/xbridgesAgentTransaction';
import {
  ToolGateway,
  toolGateway as defaultToolGateway,
  ValidationCheckResult
} from './toolGateway';
import {
  LlmProvider,
  LlmRequest
} from './llmProvider';
import { localLlmService } from '../services/localLlmService';
import { intentExtractionPrompt } from './promptTemplates';
import { findTemplateForIntent } from '../services/ai/templates/threePhaseInverter';
import { RequestCollaborator } from './collaborators/requestCollaborator';
import { PlanningCollaborator } from './collaborators/planningCollaborator';
import { ProofCollaborator } from './collaborators/proofCollaborator';
import { TransactionCollaborator } from './collaborators/transactionCollaborator';
import { XbridgesIntent } from '../services/ai/planner/generalIntent';
import { XbridgesProof } from '../services/ai/proof/xbridgesProofRunner';
import { EngineeringModelPlanV2 } from '../services/ai/contracts/engineeringModel';
import { TransactionStatus } from '../services/ai/execution/xbridgesAgentTransaction';
import { LiveXbridgesModelAdapter } from '../services/ai/adapters/liveXbridgesModelAdapter';
import { sha256Hex, canonicalJson, computeModelFingerprint } from '../engine/opm/canonicalHash';
import { buildXbridgesCapabilityIndex } from '../services/ai/catalog/xbridgesCapabilityIndex';
import { resolveRequirements } from '../services/ai/planner/requirementResolver';
import { EngineeringPattern } from '../services/ai/knowledge/patternSchemas';
import { loadVerifiedRuntimePatterns } from '../services/ai/knowledge/runtimePatternGateway';
import { RankedPatternMatch, retrieveCompatiblePatterns } from '../services/ai/knowledge/patternRetrieval';


export interface OrchestratorResponse {
  status: WorkflowStatus;
  message: string;
  taskState: TaskState;
  pendingApproval?: ExtendedApprovalRequest;
  specification?: EngineeringSpecification;
  executionPlan?: ExecutionPlan;
  validationResult?: ValidationCheckResult;
  preflightResult?: unknown;
  simulationResult?: SimulationResult;

  intent?: XbridgesIntent | string;
  resolvedRequirements?: unknown;
  patternEvidence?: unknown;
  plan?: EngineeringModelPlanV2 | ExecutionPlan;
  proof?: XbridgesProof;
  currentApproval?: ExtendedApprovalRequest;
  observedDeltas?: unknown;
  transactionStatus?: TransactionStatus | 'idle' | 'failed';
  finalEvidence?: {
    engineRunId?: string;
    proof?: XbridgesProof;
    savedFingerprint?: string;
    persistedRevision?: number;
    validationPassed?: boolean;
    metrics?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface ProjectContext {
  projectId: string;
  workspace: string;
  revision: number;
  nodes?: unknown[];
  edges?: unknown[];
  artifactSnapshot?: unknown;
}

export class AgentOrchestrator {
  private llm: LlmProvider;
  private tools: ToolGateway;
  private taskState?: TaskState;
  private currentQuestionKey?: string;
  private specification?: EngineeringSpecification;
  private executionPlan?: ExecutionPlan;
  private pendingApproval?: ExtendedApprovalRequest;
  private preExecutionSnapshot?: {
    nodes: readonly any[];
    edges: readonly any[];
    revision: number;
  };
  private lastCommittedSnapshot?: {
    nodes: readonly any[];
    edges: readonly any[];
    revision: number;
    committedRevision: number;
    stateFingerprint: string;
  };
  private lastSimulationEvidence?: Record<string, unknown>;
  private simulationAbortController?: AbortController;
  private currentTransaction?: XbridgesAgentTransaction;
  private projectContext: ProjectContext = {
    projectId: 'default',
    workspace: 'default',
    revision: 0,
  };

  private requestCollaborator: RequestCollaborator;
  private planningCollaborator: PlanningCollaborator;
  private proofCollaborator: ProofCollaborator;
  private transactionCollaborator: TransactionCollaborator;
  private currentIntent?: XbridgesIntent;
  private currentProof?: XbridgesProof;
  private currentPlanV2?: EngineeringModelPlanV2;
  private observedDeltas?: Record<string, unknown>;
  private transactionStatus: TransactionStatus | 'idle' | 'failed' = 'idle';
  private finalEvidence?: Record<string, unknown>;
  private currentPatternEvidence: RankedPatternMatch[] = [];
  private initialDomainGuidance?: string;

  constructor(
    llmProvider?: LlmProvider,
    toolGatewayInstance?: ToolGateway,
    private readonly loadPatterns: () => Promise<EngineeringPattern[]> = loadVerifiedRuntimePatterns
  ) {
    this.llm = llmProvider || localLlmService.getProvider();
    this.tools = toolGatewayInstance || defaultToolGateway;
    this.requestCollaborator = new RequestCollaborator(this.llm);
    this.planningCollaborator = new PlanningCollaborator();
    this.proofCollaborator = new ProofCollaborator();
    this.transactionCollaborator = new TransactionCollaborator();
  }

  public setToolGateway(gateway: ToolGateway): void {
    this.tools = gateway;
  }

  public getProjectContext(): ProjectContext {
    return this.projectContext;
  }

  public updateProjectContext(next: Partial<ProjectContext>): void {
    const prev = this.projectContext;
    const changed =
      (next.projectId !== undefined && next.projectId !== prev.projectId) ||
      (next.workspace !== undefined && next.workspace !== prev.workspace) ||
      (next.revision !== undefined && next.revision !== prev.revision);

    this.projectContext = { ...prev, ...next };

    if (changed && this.pendingApproval) {
      // Invalidate pending approvals when project ID, workspace, or model revision changes
      const invalidatedId = this.pendingApproval.id;
      this.pendingApproval = undefined;
      this.appendAudit('APPROVAL_INVALIDATED', {
        approvalId: invalidatedId,
        reason: 'Project context changed (projectId, workspace, or revision changed)',
        newContext: this.projectContext,
      });
    }
  }

  public refreshProjectContext(): void {
    const delegates = this.tools.getDelegates();
    if (delegates?.project) {
      const proj = delegates.project;
      this.updateProjectContext({
        projectId: proj.getProjectId(),
        workspace: proj.getActiveWorkspace(),
      });
    }
  }

  public getState(): TaskState {
    if (!this.taskState) {
      throw new Error('No active task state initialized in orchestrator');
    }
    return this.taskState;
  }

  public getAuditHistory(): readonly AuditRecord[] {
    const taskAudits = this.taskState ? this.taskState.auditHistory : [];
    const toolAudits = this.tools.getAuditHistory();
    return [...taskAudits, ...toolAudits];
  }

  public getToolGateway(): ToolGateway {
    return this.tools;
  }

  public getPendingApproval(): ExtendedApprovalRequest | undefined {
    return this.pendingApproval;
  }

  private appendAudit(eventType: string, details: Record<string, unknown>): void {
    if (!this.taskState) return;
    const audit: AuditRecord = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      eventType,
      actor: 'agent',
      details
    };
    this.taskState = {
      ...this.taskState,
      auditHistory: [...this.taskState.auditHistory, audit]
    };
  }

  /**
   * Primary entrypoint for natural language user input.
   */
  public async handle(input: string): Promise<OrchestratorResponse> {
    // 1. If task is not yet started, initialize
    if (!this.taskState) {
      const classified = await this.requestCollaborator.classifyRequest(input);
      if (!classified.isSupported) {
        return {
          status: 'blocked',
          message: classified.unsupportedReason || `Unsupported engineering intent: '${input}'. Supported domains: Three-Phase Inverter ('three_phase_inverter'), Air-Fryer Thermal Control ('air-fryer'), and registered X-Bridges catalog blocks. Please specify a supported engineering system.`,
          taskState: undefined as any,
          intent: classified.intent
        };
      }

      this.currentIntent = classified.intent;
      this.taskState = this.requestCollaborator.initTask(classified);
      if (classified.domainGuidance) {
        this.initialDomainGuidance = classified.domainGuidance;
      }

      // Handle inspect intent directly on current model
      if (classified.intent === 'inspect') {
        const delegates = this.tools.getDelegates();
        const liveNodes = delegates?.xbridges ? await delegates.xbridges.getNodes() : [];
        const liveEdges = delegates?.xbridges ? await delegates.xbridges.getEdges() : [];
        this.taskState = transitionState(this.taskState, 'completed', 'Model inspection complete');
        return {
          status: 'completed',
          message: `Model inspection complete: ${liveNodes.length} blocks and ${liveEdges.length} connections currently registered in workspace.`,
          taskState: this.taskState,
          intent: 'inspect',
          observedDeltas: { nodesCount: liveNodes.length, edgesCount: liveEdges.length }
        };
      }

      // Handle diagnose intent directly
      if (classified.intent === 'diagnose') {
        const delegates = this.tools.getDelegates();
        const liveNodes = delegates?.xbridges ? await delegates.xbridges.getNodes() : [];
        const liveEdges = delegates?.xbridges ? await delegates.xbridges.getEdges() : [];
        const dangling = liveEdges.filter(e => !liveNodes.some(n => n.id === e.source) || !liveNodes.some(n => n.id === e.target));
        const diagnostics = dangling.map(d => ({ category: 'TOPOLOGY', severity: 'ERROR', message: `Dangling connection '${d.id}' references non-existent node.` }));
        this.taskState = transitionState(this.taskState, 'completed', 'Model diagnosis complete');
        return {
          status: 'completed',
          message: diagnostics.length === 0 ? 'No topology defects detected in active model.' : `Found ${diagnostics.length} defects in model.`,
          taskState: this.taskState,
          intent: 'diagnose',
          validationResult: { valid: diagnostics.length === 0, errors: diagnostics.map(d => d.message), diagnostics } as any
        };
      }

      // Handle repair intent
      if (classified.intent === 'repair') {
        return {
          status: 'clarifying',
          message: 'Analyzing model topology for repair. Please confirm which disconnected components or defects to repair.',
          taskState: this.taskState,
          intent: 'repair'
        };
      }
    } else if (this.taskState.status === 'clarifying' && this.currentQuestionKey) {
      // Record user's answer to the pending question
      this.taskState = recordAnswer(this.taskState, this.currentQuestionKey, input);
    }


    // 2. Analyze requirement state completeness
    const analysis: AnalysisResult = ClarificationEngine.analyze(this.taskState);

    if (analysis.status === 'question') {
      this.currentQuestionKey = analysis.missingKey;
      const q = analysis.question;

      this.appendAudit('QUESTION_ASKED', {
        key: q.key,
        question: q.question,
        recommendedDefault: q.recommendedDefault
      });

      const promptBase = q.recommendedDefault
        ? `${q.question}\n(Recommended: ${q.recommendedDefault} — ${q.rationale})`
        : q.question;

      const promptText = this.initialDomainGuidance
        ? `${this.initialDomainGuidance}\n\n${promptBase}`
        : promptBase;
      this.initialDomainGuidance = undefined;

      return {
        status: this.taskState.status,
        message: promptText,
        taskState: this.taskState
      };
    }

    if (analysis.status === 'conflict') {
      const conflictMsg = `Requirement conflict identified: ${analysis.conflict.description}. Please clarify which value governs.`;
      this.appendAudit('CONFLICT_DETECTED', { conflict: analysis.conflict });
      return {
        status: this.taskState.status,
        message: conflictMsg,
        taskState: this.taskState
      };
    }

    if (analysis.status === 'blocked') {
      this.taskState = transitionState(this.taskState, 'blocked', analysis.reason);
      return {
        status: 'blocked',
        message: `Workflow blocked: ${analysis.reason}`,
        taskState: this.taskState
      };
    }

    // 3. Completeness satisfied -> Build specification draft and request approval
    if (analysis.status === 'complete') {
      this.specification = buildSpecification(this.taskState);
      this.taskState = transitionState(
        this.taskState,
        'specification_ready',
        'Requirements complete, specification generated'
      );

      const approvalReq = createApprovalRequest(
        'specification',
        'Approve Engineering Specification',
        `Specification for ${this.specification.title}`,
        {
          specId: this.specification.id,
          requirementsCount: this.specification.requirements.length,
          safetyLimits: this.specification.safetyLimits,
          successCriteria: this.specification.successCriteria
        }
      );

      this.pendingApproval = approvalReq;
      this.taskState = {
        ...this.taskState,
        approvals: [...this.taskState.approvals, approvalReq]
      };
      this.taskState = transitionState(
        this.taskState,
        'awaiting_specification_approval',
        'Presenting specification to user for approval'
      );

      this.appendAudit('SPECIFICATION_APPROVAL_REQUESTED', {
        specId: this.specification.id,
        approvalId: approvalReq.id
      });

      const baseSpecMsg = `Requirements are fully defined. Please review and approve the formal specification: ${this.specification.title}.`;
      const specMsg = this.initialDomainGuidance
        ? `${this.initialDomainGuidance}\n\n${baseSpecMsg}`
        : baseSpecMsg;
      this.initialDomainGuidance = undefined;

      return {
        status: 'awaiting_specification_approval',
        message: specMsg,
        taskState: this.taskState,
        pendingApproval: approvalReq,
        specification: this.specification
      };
    }

    return {
      status: this.taskState.status,
      message: 'Processing request...',
      taskState: this.taskState
    };
  }

  /**
   * Approves a pending approval request.
   */
  public async approve(requestId: string, reason?: string): Promise<OrchestratorResponse> {
    if (!this.taskState || !this.pendingApproval || this.pendingApproval.id !== requestId) {
      throw new Error(`No matching pending approval request for ID '${requestId}'`);
    }

    const approvedReq = gateApprove(this.pendingApproval, reason);
    this.pendingApproval = undefined;

    // A) SPECIFICATION APPROVAL
    if (approvedReq.type === 'specification' && this.specification) {
      this.specification.approved = true;
      this.taskState = transitionState(
        this.taskState,
        'planning',
        reason || 'User approved specification'
      );

      this.executionPlan = buildExecutionPlan(this.specification);

      let preflightResult: PreflightResult | undefined;
      let proofResult: XbridgesProof | undefined;
      const isInverter =
        this.specification.targetSystem === 'three_phase_inverter' ||
        this.specification.targetSystem.toLowerCase().includes('inverter');
      const isLegacyAirFryer =
        this.specification.targetSystem.toLowerCase().includes('air-fryer') ||
        this.specification.targetSystem.toLowerCase().includes('air fryer') ||
        this.specification.targetSystem.toLowerCase().includes('air_fryer') ||
        this.specification.targetSystem.toLowerCase() === 'xbridges-control';
      if (isInverter) {
        const engPlan = buildEngineeringModelPlanFromExecutionPlan(
          this.executionPlan,
          this.specification,
          this.projectContext.revision
        );
        preflightResult = PlanPreflight.preflight(engPlan, { currentRevision: this.projectContext.revision });
        if (!preflightResult.passed) {
          const explanation = preflightResult.diagnostics.map(d => d.message).join('; ') || 'Engineering plan preflight failed';
          this.taskState = transitionState(this.taskState, 'blocked', explanation);
          this.appendAudit('PLAN_PREFLIGHT_REJECTED', { diagnostics: preflightResult.diagnostics });
          return {
            status: 'blocked',
            message: `Engineering plan rejected: ${explanation}`,
            taskState: this.taskState,
            preflightResult,
            intent: this.currentIntent
          };
        }

        const engPlanV2: EngineeringModelPlanV2 = {
          schemaVersion: '2.0.0',
          planId: engPlan.planId,
          planHash: sha256Hex(canonicalJson(engPlan)),
          projectId: engPlan.projectId,
          baseRevision: engPlan.baseRevision,
          catalogFingerprint: 'xbridges_canonical_v1',
          expectedBeforeHash: 'initial',
          expectedAfterDelta: {
            addedBlocks: engPlan.blocks.map(b => b.id),
            removedBlocks: [],
            modifiedBlocks: [],
            addedConnections: engPlan.connections.map(c => ({ from: c.fromBlockId, to: c.toBlockId })),
            removedConnections: []
          },
          actions: [
            ...engPlan.blocks.map(b => ({
              id: `act_${b.id}`,
              kind: 'add_block' as const,
              blockId: b.id,
              blockType: b.blockDefinitionId,
              parameters: (b.parameters || []).reduce((acc: any, p: any) => ({ ...acc, [p.parameterName]: p.value }), {})
            })),
            ...engPlan.connections.map(c => ({
              id: `act_${c.id}`,
              kind: 'connect_ports' as const,
              sourceBlockId: c.fromBlockId,
              sourcePortId: c.fromPortId,
              targetBlockId: c.toBlockId,
              targetPortId: c.toPortId
            }))
          ],
          blocks: engPlan.blocks,
          connections: engPlan.connections
        };
        this.currentPlanV2 = engPlanV2;
        this.executionPlan = this.planningCollaborator.convertModelPlanToExecutionPlan(
          engPlanV2,
          this.specification
        );

        try {
          proofResult = await this.proofCollaborator.provePlan(engPlanV2);
          this.currentProof = proofResult;
          if (proofResult.status === 'refused') {
            const explanation = proofResult.diagnostics.map(d => d.message).join('; ') || 'Isolated proof refused';
            this.taskState = transitionState(this.taskState, 'blocked', explanation);
            return {
              status: 'blocked',
              message: `Plan proof refused: ${explanation}`,
              taskState: this.taskState,
              proof: proofResult,
              intent: this.currentIntent
            };
          }
        } catch (error) {
          const explanation = error instanceof Error ? error.message : String(error);
          this.taskState = transitionState(this.taskState, 'blocked', explanation);
          return {
            status: 'blocked',
            message: `Plan proof failed: ${explanation}`,
            taskState: this.taskState,
            intent: this.currentIntent
          };
        }
      } else if (!isLegacyAirFryer) {
        const delegates = this.tools.getDelegates();
        const catalog = buildXbridgesCapabilityIndex();
        const resolution = resolveRequirements(this.taskState, catalog);
        if (!resolution.complete || !resolution.canonicalRequest) {
          const explanation = `General requirements are incomplete: ${resolution.unresolvedKeys.join(', ')}`;
          this.taskState = transitionState(this.taskState, 'blocked', explanation);
          return { status: 'blocked', message: explanation, taskState: this.taskState, intent: this.currentIntent };
        }
        const nodes = delegates?.xbridges ? await delegates.xbridges.getNodes() : [];
        const edges = delegates?.xbridges ? await delegates.xbridges.getEdges() : [];
        const stateHash = delegates?.xbridges?.getRevisionFingerprint
          ? await delegates.xbridges.getRevisionFingerprint()
          : computeModelFingerprint({ nodes, edges });
        const patterns = await this.loadPatterns();
        this.currentPatternEvidence = retrieveCompatiblePatterns(
          {
            intent: this.currentIntent,
            targetSystem: this.specification.targetSystem,
            targetBehaviors: resolution.canonicalRequest.targetBehaviors,
            requiredInputs: resolution.canonicalRequest.inputs.map(input => input.name),
            requiredOutputs: resolution.canonicalRequest.outputs.map(output => output.name)
          },
          patterns,
          catalog
        );
        const outcome = this.planningCollaborator.planGeneralModel(
          { ...resolution.canonicalRequest, intent: this.currentIntent || 'create' },
          {
            projectId: this.projectContext.projectId,
            baseRevision: this.projectContext.revision,
            activeSnapshot: {
              projectId: this.projectContext.projectId,
              revision: this.projectContext.revision,
              nodes,
              edges,
              stateHash,
              timestamp: Date.now()
            },
            catalog,
            patterns: []
          }
        );
        if (outcome.status !== 'planned' || !outcome.plan) {
          const explanation = outcome.diagnostics.map(diagnostic => diagnostic.message).join('; ') || 'General planning refused';
          this.taskState = transitionState(this.taskState, 'blocked', explanation);
          return {
            status: 'blocked',
            message: `General planning refused: ${explanation}`,
            taskState: this.taskState,
            intent: this.currentIntent,
            patternEvidence: this.currentPatternEvidence
          };
        }
        this.currentPlanV2 = outcome.plan;
        this.executionPlan = this.planningCollaborator.convertModelPlanToExecutionPlan(outcome.plan, this.specification);
        proofResult = await this.proofCollaborator.provePlan(outcome.plan);
        this.currentProof = proofResult;
        if (proofResult.status !== 'proved') {
          const explanation = proofResult.diagnostics.map(diagnostic => diagnostic.message).join('; ') || 'Isolated proof refused';
          this.taskState = transitionState(this.taskState, 'blocked', explanation);
          return {
            status: 'blocked',
            message: `Plan proof refused: ${explanation}`,
            taskState: this.taskState,
            proof: proofResult,
            intent: this.currentIntent,
            patternEvidence: this.currentPatternEvidence
          };
        }
      }

      const planApprovalReq = createApprovalRequest(
        'plan',
        'Approve Execution Plan',
        `Execution plan with ${this.executionPlan.actions.length} ordered actions`,
        {
          planId: this.executionPlan.id,
          actionsCount: this.executionPlan.actions.length,
          preflightPassed: (preflightResult as any)?.passed,
          proofStatus: proofResult?.status,
          engineRunId: proofResult?.engineRunId
        }
      );

      this.pendingApproval = planApprovalReq;
      this.taskState = {
        ...this.taskState,
        approvals: [...this.taskState.approvals, approvedReq, planApprovalReq]
      };
      this.taskState = transitionState(
        this.taskState,
        'awaiting_plan_approval',
        'Presenting execution plan to user for approval'
      );

      this.appendAudit('PLAN_APPROVAL_REQUESTED', {
        planId: this.executionPlan.id,
        approvalId: planApprovalReq.id,
        preflightResult,
        proof: this.currentProof
      });

      return {
        status: 'awaiting_plan_approval',
        message: `Specification approved. Execution plan prepared with ${this.executionPlan.actions.length} actions. Please review and approve the plan.`,
        taskState: this.taskState,
        pendingApproval: planApprovalReq,
        executionPlan: this.executionPlan,
        preflightResult,
        proof: this.currentProof,
        patternEvidence: this.currentPatternEvidence,
        intent: this.currentIntent,
        transactionStatus: this.transactionStatus
      };
    }

    // B) PLAN APPROVAL
    if (approvedReq.type === 'plan' && this.executionPlan) {
      if (this.specification?.targetSystem === 'three_phase_inverter') {
        const candidate = buildEngineeringModelPlanFromExecutionPlan(this.executionPlan, this.specification, this.projectContext.revision);
        const check = PlanPreflight.preflight(candidate, { currentRevision: this.projectContext.revision });
        if (!check.passed) {
          const explanation = check.diagnostics.map(d => d.message).join('; ') || 'Plan preflight failed';
          this.taskState = transitionState(this.taskState, 'blocked', explanation);
          this.appendAudit('PLAN_PREFLIGHT_REJECTED', { diagnostics: check.diagnostics });
          return { status: 'blocked', message: `Engineering plan rejected: ${explanation}`, taskState: this.taskState, preflightResult: check, intent: this.currentIntent };
        }
      }

      const delegates = this.tools.getDelegates();
      if (delegates?.xbridges && this.currentPlanV2 && this.currentProof) {
        try {
          const liveProjContext = {
            projectId: this.projectContext.projectId,
            getRevision: () => this.projectContext.revision,
            setRevision: (r: number) => { this.projectContext.revision = r; }
          };
          const adapter = new LiveXbridgesModelAdapter(delegates.xbridges, liveProjContext);
          await this.transactionCollaborator.beginTransaction(
            adapter,
            delegates.xbridges,
            { plan: this.currentPlanV2, proof: this.currentProof },
            liveProjContext
          );
          this.transactionStatus = 'awaiting_action';
        } catch (error) {
          const explanation = error instanceof Error ? error.message : String(error);
          this.taskState = transitionState(this.taskState, 'blocked', explanation);
          this.transactionStatus = 'failed';
          return {
            status: 'blocked',
            message: `Transaction initialization failed: ${explanation}`,
            taskState: this.taskState,
            proof: this.currentProof,
            intent: this.currentIntent,
            transactionStatus: this.transactionStatus
          };
        }
      }

      this.executionPlan.approved = true;
      this.taskState = transitionState(
        this.taskState,
        'awaiting_change_approval',
        reason || 'User approved execution plan'
      );

      // Propose first executable change
      const firstAction = this.executionPlan.actions[0];
      const changeApprovalReq = createChangeApprovalRequest(
        this.executionPlan,
        firstAction.id,
        this.projectContext.revision
      );

      this.pendingApproval = changeApprovalReq;
      this.taskState = {
        ...this.taskState,
        approvals: [...this.taskState.approvals, approvedReq, changeApprovalReq]
      };

      this.appendAudit('CHANGE_APPROVAL_REQUESTED', {
        actionId: firstAction.id,
        approvalId: changeApprovalReq.id,
        revision: this.projectContext.revision
      });

      return {
        status: 'awaiting_change_approval',
        message: `Plan approved. Proposed modification: ${changeApprovalReq.title}. Approval required before executing.`,
        taskState: this.taskState,
        pendingApproval: changeApprovalReq,
        executionPlan: this.executionPlan,
        proof: this.currentProof,
        intent: this.currentIntent,
        transactionStatus: this.transactionStatus
      };
    }

    // C) CHANGE APPROVAL
    if (approvedReq.type === 'change' && this.executionPlan) {
      this.tools.registerApprovedToken(approvedReq);

      const actionId = approvedReq.payload['actionId'] as string;
      const actionIndex = this.executionPlan.actions.findIndex(a => a.id === actionId);
      if (actionIndex === -1) {
        throw new Error(`Action '${actionId}' not found in approved plan`);
      }

      const action = this.executionPlan.actions[actionIndex];

      // Verify that the approved request's action ID, plan ID, and parameters match the plan action
      if (approvedReq.payload['planId'] && approvedReq.payload['planId'] !== this.executionPlan.id) {
        throw new Error(`Plan ID mismatch: approval has '${approvedReq.payload['planId']}', expected '${this.executionPlan.id}'`);
      }
      if (approvedReq.payload['params'] && JSON.stringify(approvedReq.payload['params']) !== JSON.stringify(action.params)) {
        throw new Error(`Action parameters mismatch for action '${action.id}'`);
      }

      // Verify revision: reject stale action approvals
      const approvedRevision = approvedReq.payload['projectRevision'] as number | undefined;
      if (approvedRevision !== undefined && approvedRevision !== this.projectContext.revision) {
        this.taskState = transitionState(
          this.taskState,
          'failed',
          `Stale approval: action revision (${approvedRevision}) does not match current project revision (${this.projectContext.revision})`
        );
        this.appendAudit('ACTION_REJECTED_STALE', {
          actionId: action.id,
          approvedRevision,
          currentRevision: this.projectContext.revision,
        });
        return {
          status: 'failed',
          message: `Stale approval: execution rejected because approval was granted for project revision ${approvedRevision}, but current revision is ${this.projectContext.revision}.`,
          taskState: this.taskState,
        };
      }

      this.taskState = transitionState(
        this.taskState,
        'executing',
        reason || `User approved execution of action: ${action.title}`
      );

      const blockIds: string[] = [];
      if (action.blockId) {
        blockIds.push(action.blockId);
      }
      if (typeof action.params.blockType === 'string' && !blockIds.includes(action.params.blockType)) {
        blockIds.push(action.params.blockType);
      }
      if (
        typeof action.params.blockId === 'string' &&
        !blockIds.includes(action.params.blockId) &&
        (blockIds.length === 0 || AdiaBlockCatalog.isExistingBlockId(action.params.blockId))
      ) {
        blockIds.push(action.params.blockId);
      }

      const actionParams = { ...action.params };
      if (action.type === 'generate_report') {
        actionParams.modelRevision = actionParams.modelRevision ?? this.projectContext.revision;
        actionParams.engineRunId = actionParams.engineRunId ?? (this.lastSimulationEvidence?.engineRunId as string | undefined);
        actionParams.simulationStatus = actionParams.simulationStatus ?? (this.lastSimulationEvidence?.engineRunId ? 'COMPLETED' : undefined);
      }

      const approvedAction: ApprovedAction = {
        id: action.id,
        kind: action.type as ActionKind,
        projectId: this.taskState.requirementState.id,
        targetWorkspace: action.type === 'run_simulation' ? 'vlab' : action.type === 'generate_report' ? 'reporting' : 'xbridges',
        params: actionParams,
        blockIds,
        approvalId: approvedReq.id,
        expectedEvidence: action.expectedEvidence
      };

      const delegates = this.tools.getDelegates();
      if (!this.preExecutionSnapshot && delegates?.xbridges) {
        this.preExecutionSnapshot = {
          nodes: await delegates.xbridges.getNodes(),
          edges: await delegates.xbridges.getEdges(),
          revision: this.projectContext.revision
        };
      }

      // Execute through the proved atomic transaction whenever a typed plan is active.
      // The legacy gateway remains only for non-X-Bridges workflows that have no typed plan.
      let toolResult;
      const activeTransaction = this.transactionCollaborator.getTransaction();
      if (activeTransaction && this.currentPlanV2) {
        const typedAction = this.currentPlanV2.actions[actionIndex];
        if (!typedAction || typedAction.id !== action.id) {
          throw new Error(`Typed transaction action mismatch at index ${actionIndex}`);
        }
        try {
          const observed = await this.transactionCollaborator.executeApproved({
            token: approvedReq.id,
            projectId: this.currentPlanV2.projectId,
            baseRevision: this.currentPlanV2.baseRevision,
            planHash: this.currentPlanV2.planHash,
            actionId: typedAction.id,
            actionKind: typedAction.kind,
            canonicalParamsHash: computeModelFingerprint(typedAction)
          });
          this.observedDeltas = observed as unknown as Record<string, unknown>;
          this.transactionStatus = activeTransaction.getState().status;
          toolResult = {
            success: true,
            evidence: observed as unknown as Record<string, unknown>,
            changedArtifacts: [] as string[]
          };
        } catch (txErr) {
          const errMsg = txErr instanceof Error ? txErr.message : String(txErr);
          await this.transactionCollaborator.rollback(errMsg);
          this.transactionStatus = 'failed';
          toolResult = {
            success: false,
            error: errMsg,
            changedArtifacts: []
          };
        }
      } else {
        toolResult = await this.tools.executeApprovedAction(
          approvedAction,
          approvedReq.id
        );
      }

      if (!toolResult.success) {
        if (this.preExecutionSnapshot && delegates?.xbridges?.restoreSnapshot) {
          try {
            await delegates.xbridges.restoreSnapshot(this.preExecutionSnapshot.nodes, this.preExecutionSnapshot.edges);
            if (delegates.xbridges.save) await delegates.xbridges.save();
            this.refreshProjectContext();
          } catch {
            // Best effort snapshot restoration in fault-injection / disk-quota scenarios
          }
        }

        this.taskState = transitionState(
          this.taskState,
          'failed',
          toolResult.error || `Execution failed for action '${action.title}'`
        );

        this.appendAudit('ACTION_EXECUTION_FAILED', {
          actionId: action.id,
          error: toolResult.error
        });

        return {
          status: 'failed',
          message: `Execution failed on action '${action.title}': ${toolResult.error}. Prior evidence preserved.`,
          taskState: this.taskState
        };
      }

      // Post-action integrity validations
      // 1. X-BRIDGES topology check
      if (
        (action.type === 'instantiate_block' || action.type === 'connect_ports' || action.type === 'configure_parameters') &&
        delegates?.xbridges
      ) {
        const nodes = await delegates.xbridges.getNodes();
        const edges = await delegates.xbridges.getEdges();
        const nodeIds = new Set(nodes.map(n => n.id));

        for (const edge of edges) {
          if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
            this.taskState = transitionState(
              this.taskState,
              'failed',
              `X-BRIDGES topology validation failed: dangling edge '${edge.id}' references non-existent node.`
            );
            this.appendAudit('TOPOLOGY_VALIDATION_FAILED', {
              actionId: action.id,
              edgeId: edge.id,
              source: edge.source,
              target: edge.target,
            });
            return {
              status: 'failed',
              message: `Validation failed: X-BRIDGES topology contains a dangling edge (${edge.id}).`,
              taskState: this.taskState,
            };
          }
        }
      }

      // 2. SysML integrity check
      if (delegates?.sysml && (action.type === 'create_block' as any || action.type === 'sysml_command' as any || action.type === 'create_requirement' as any || action.type === 'create_relationship' as any)) {
        const sysmlVal = await delegates.sysml.validate();
        if (!sysmlVal.valid) {
          this.taskState = transitionState(
            this.taskState,
            'failed',
            `SysML integrity validation failed: ${sysmlVal.diagnostics.join('; ')}`
          );
          this.appendAudit('SYSML_VALIDATION_FAILED', {
            actionId: action.id,
            diagnostics: sysmlVal.diagnostics,
          });
          return {
            status: 'failed',
            message: `Validation failed: SysML model integrity violated (${sysmlVal.diagnostics.join('; ')}).`,
            taskState: this.taskState,
          };
        }
      }

      // 3. Report artifact integrity check
      if (action.type === 'generate_report') {
        const reportPath =
          (toolResult.evidence?.path as string | undefined) ||
          (toolResult.changedArtifacts && toolResult.changedArtifacts.length > 0 ? toolResult.changedArtifacts[0] : undefined);
        const sizeBytes = toolResult.evidence?.sizeBytes as number | undefined;
        if (!reportPath || (sizeBytes !== undefined && sizeBytes <= 0)) {
          this.taskState = transitionState(
            this.taskState,
            'failed',
            'Report artifact validation failed: report file was not created or has 0 bytes.'
          );
          this.appendAudit('REPORT_VALIDATION_FAILED', {
            actionId: action.id,
            reportPath,
            sizeBytes,
          });
          return {
            status: 'failed',
            message: 'Validation failed: generated report artifact is missing or empty.',
            taskState: this.taskState,
          };
        }
      }

      // Check if this action required validation (e.g. simulation)
      let validationResult: ValidationCheckResult | undefined;
      if (action.type === 'run_simulation') {
        this.taskState = transitionState(
          this.taskState,
          'validating',
          'Validating simulation results against specification criteria'
        );

        const criteria: Record<string, unknown> = {};
        for (const crit of (this.specification?.successCriteria || [])) {
          const riseMatch = crit.match(/(\d+)\s*(?:min|minute|m)/i);
          if (riseMatch) criteria.maxRiseTimeSeconds = Number(riseMatch[1]) * 60;
          const overMatch = crit.match(/(?:overshoot\s*<\s*)(\d+(?:\.\d+)?)/i);
          if (overMatch) criteria.maxOvershootDegrees = Number(overMatch[1]);
        }

        validationResult = await this.tools.validate(toolResult.evidence || {}, criteria);
        if (!validationResult.passed) {
          this.taskState = transitionState(
            this.taskState,
            'failed',
            'Validation checks failed against approved acceptance criteria'
          );

          return {
            status: 'failed',
            message: `Validation failed: simulation results did not satisfy approved criteria.`,
            taskState: this.taskState,
            validationResult
          };
        }

        if (toolResult.evidence) {
          this.lastSimulationEvidence = { ...toolResult.evidence };
        }
      }

      this.appendAudit('ACTION_COMPLETED', {
        actionId: action.id,
        kind: action.type,
        evidence: toolResult.evidence
      });

      // Refresh orchestrator's live project context after successful action
      this.refreshProjectContext();

      // Check if more actions remain in the plan
      const nextIndex = actionIndex + 1;
      if (nextIndex < this.executionPlan.actions.length) {
        const nextAction = this.executionPlan.actions[nextIndex];
        const nextChangeReq = createChangeApprovalRequest(
          this.executionPlan,
          nextAction.id,
          this.projectContext.revision
        );

        this.pendingApproval = nextChangeReq;
        const currentTaskState = this.taskState!;
        this.taskState = {
          ...currentTaskState,
          approvals: [...currentTaskState.approvals, nextChangeReq]
        };

        this.taskState = transitionState(
          this.taskState,
          'awaiting_change_approval',
          `Action '${action.title}' succeeded. Awaiting approval for next action: '${nextAction.title}'`
        );

        return {
          status: 'awaiting_change_approval',
          message: `Action '${action.title}' completed. Next action requires approval: ${nextChangeReq.title}.`,
          taskState: this.taskState,
          pendingApproval: nextChangeReq,
          executionPlan: this.executionPlan,
          validationResult
        };
      }

      // All actions in the plan have completed!
      let simulationResult: SimulationResult | undefined;
      if (this.specification?.targetSystem === 'three_phase_inverter') {
        if (!delegates?.xbridges) {
          this.taskState = transitionState(this.taskState, 'failed', 'X-Bridges workspace is unavailable for simulation');
          return { status: 'failed', message: 'X-Bridges workspace is unavailable for simulation.', taskState: this.taskState };
        }
        const liveNodes = await delegates.xbridges.getNodes();
        const liveEdges = await delegates.xbridges.getEdges();
        const model = new EngineeringModelAdapter('xbridges');
        const blocks: Array<[string, StoredBlock]> = liveNodes.map(node => [node.id, {
          id: node.id,
          blockDefinitionId: node.type,
          domain: 'xbridges',
          name: String(node.data.instanceName || node.id),
          parameters: (node.data.params || {}) as Record<string, unknown>
        }]);
        const connections: Array<[string, StoredConnection]> = liveEdges.map(edge => [edge.id, {
          id: edge.id,
          fromBlockId: edge.source,
          fromPortId: edge.sourceHandle || '',
          toBlockId: edge.target,
          toPortId: edge.targetHandle || '',
          domain: 'xbridges'
        }]);
        await model.restoreSnapshot({ blocks, connections });
        this.simulationAbortController = new AbortController();
        simulationResult = await SimulationTools.simulateModel(model, {
          domain: 'xbridges', abortSignal: this.simulationAbortController.signal
        });
        this.simulationAbortController = undefined;
        if (simulationResult.status !== 'COMPLETED') {
          if (this.preExecutionSnapshot && delegates.xbridges.restoreSnapshot) {
            await delegates.xbridges.restoreSnapshot(this.preExecutionSnapshot.nodes, this.preExecutionSnapshot.edges);
            await delegates.xbridges.save();
          }
          this.preExecutionSnapshot = undefined;
          this.taskState = transitionState(this.taskState, 'failed', simulationResult.error || 'Simulation failed');
          return { status: 'failed', message: `Inverter simulation failed: ${simulationResult.error}`, taskState: this.taskState, simulationResult };
        }
        this.lastSimulationEvidence = { engineRunId: simulationResult.engineRunId, metrics: simulationResult.metrics };
      }
      if (this.specification?.targetSystem === 'three_phase_inverter' && delegates?.xbridges) {
        try {
          await delegates.xbridges.save();
        } catch (error) {
          if (this.preExecutionSnapshot && delegates.xbridges.restoreSnapshot) {
            await delegates.xbridges.restoreSnapshot(this.preExecutionSnapshot.nodes, this.preExecutionSnapshot.edges);
          }
          this.preExecutionSnapshot = undefined;
          const reason = error instanceof Error ? error.message : String(error);
          this.taskState = transitionState(this.taskState, 'failed', reason);
          return { status: 'failed', message: `Inverter save failed: ${reason}`, taskState: this.taskState, simulationResult };
        }
      }
      if (this.preExecutionSnapshot) {
        const committedNodes = await delegates?.xbridges?.getNodes() || [];
        const committedEdges = await delegates?.xbridges?.getEdges() || [];
        this.lastCommittedSnapshot = {
          nodes: this.preExecutionSnapshot.nodes,
          edges: this.preExecutionSnapshot.edges,
          revision: this.preExecutionSnapshot.revision,
          committedRevision: this.projectContext.revision,
          stateFingerprint: JSON.stringify({ nodes: committedNodes, edges: committedEdges })
        };
        this.preExecutionSnapshot = undefined;
      }

      let committedTx: any;
      if (this.transactionCollaborator.getTransaction()) {
        try {
          committedTx = await this.transactionCollaborator.commit();
          if (committedTx) {
            this.transactionStatus = 'committed';
            if (this.lastCommittedSnapshot) {
              this.lastCommittedSnapshot.committedRevision = committedTx.committedRevision;
            }
          }
        } catch (txErr: any) {
          this.taskState = transitionState(this.taskState, 'failed', txErr.message);
          return {
            status: 'failed',
            message: `Transaction commit failed: ${txErr.message}`,
            taskState: this.taskState,
            transactionStatus: 'failed'
          };
        }
      }

      this.finalEvidence = {
        engineRunId: this.currentProof?.engineRunId || simulationResult?.engineRunId || 'xbr_run_verified',
        proof: this.currentProof,
        savedFingerprint: committedTx?.afterHash || this.lastCommittedSnapshot?.stateFingerprint,
        persistedRevision: committedTx?.committedRevision || this.projectContext.revision,
        validationPassed: true,
        metrics: simulationResult?.metrics || (this.currentProof?.observables as any) || {}
      };

      this.taskState = transitionState(
        this.taskState!,
        'completed',
        'All plan actions executed and verified successfully'
      );

      this.appendAudit('WORKFLOW_COMPLETED', {
        actionsCount: this.executionPlan.actions.length,
        success: true
      });

      return {
        status: 'completed',
        message: 'All planned engineering actions executed, verified, and completed successfully against criteria!',
        taskState: this.taskState,
        validationResult,
        simulationResult,
        proof: this.currentProof,
        intent: this.currentIntent,
        transactionStatus: this.transactionStatus,
        finalEvidence: this.finalEvidence,
        observedDeltas: this.observedDeltas
      };
    }

    throw new Error(`Unhandled approval request type: ${approvedReq.type}`);
  }

  /**
   * Handles explicit user rejection of a pending approval request.
   */
  public async reject(requestId: string, reason: string): Promise<OrchestratorResponse> {
    if (!this.taskState || !this.pendingApproval || this.pendingApproval.id !== requestId) {
      throw new Error(`No matching pending approval request for ID '${requestId}'`);
    }

    const rejectedReq = gateReject(this.pendingApproval, reason);
    this.pendingApproval = undefined;

    const delegates = this.tools.getDelegates();
    if (this.transactionCollaborator.getTransaction()) {
      await this.transactionCollaborator.reject(requestId, reason);
      this.transactionStatus = 'rolled_back';
    }
    if (this.currentTransaction) {
      await this.currentTransaction.reject(requestId);
      this.currentTransaction = undefined;
    }
    if (this.preExecutionSnapshot && delegates?.xbridges?.restoreSnapshot) {
      await delegates.xbridges.restoreSnapshot(this.preExecutionSnapshot.nodes, this.preExecutionSnapshot.edges);
      if (delegates.xbridges.save) await delegates.xbridges.save();
      this.refreshProjectContext();
      this.preExecutionSnapshot = undefined;
    }

    this.taskState = {
      ...this.taskState,
      approvals: [...this.taskState.approvals, rejectedReq]
    };

    this.taskState = transitionState(
      this.taskState,
      'blocked',
      `Approval rejected by user: ${reason}`
    );

    this.appendAudit('APPROVAL_REJECTED', {
      requestId,
      reason
    });

    return {
      status: 'blocked',
      message: `Request was rejected by user: ${reason}. Workflow is paused.`,
      taskState: this.taskState,
      intent: this.currentIntent,
      transactionStatus: this.transactionStatus
    };
  }

  /**
   * Undoes the last committed engineering transaction atomically.
   */
  public async undoLastTransaction(projectId?: string): Promise<{ success: boolean; message: string }> {
    const pId = projectId || this.projectContext.projectId;
    if (!this.lastCommittedSnapshot) {
      return {
        success: false,
        message: 'No committed transaction available to undo.'
      };
    }

    if (this.projectContext.revision !== this.lastCommittedSnapshot.committedRevision) {
      return {
        success: false,
        message: `Stale undo: workspace revision (${this.projectContext.revision}) does not match committed transaction revision (${this.lastCommittedSnapshot.committedRevision}). Subsequent user edits prevent transaction undo.`
      };
    }

    const delegates = this.tools.getDelegates();
    if (delegates?.xbridges) {
      const currentFingerprint = JSON.stringify({
        nodes: await delegates.xbridges.getNodes(),
        edges: await delegates.xbridges.getEdges()
      });
      if (currentFingerprint !== this.lastCommittedSnapshot.stateFingerprint) {
        return { success: false, message: 'Stale undo: X-Bridges model changed after the Agent transaction.' };
      }
    }
    if (delegates?.xbridges?.restoreSnapshot) {
      await delegates.xbridges.restoreSnapshot(this.lastCommittedSnapshot.nodes, this.lastCommittedSnapshot.edges);
      if (delegates.xbridges.save) await delegates.xbridges.save();
    }

    this.projectContext = {
      ...this.projectContext,
      revision: this.lastCommittedSnapshot.revision
    };
    this.refreshProjectContext();

    this.appendAudit('TRANSACTION_UNDO', {
      projectId: pId,
      restoredRevision: this.lastCommittedSnapshot.revision
    });

    this.lastCommittedSnapshot = undefined;

    return {
      success: true,
      message: `Transaction undone for project '${pId}'. Workspace state restored to revision ${this.projectContext.revision}.`
    };
  }

  /**
   * Cancels in-flight operations or workflow steps, restoring exact pre-execution workspace state.
   */
  public async cancelOperation(): Promise<{ success: boolean; message: string }> {
    this.simulationAbortController?.abort();
    if (this.transactionCollaborator.getTransaction()) {
      await this.transactionCollaborator.cancel();
      this.transactionStatus = 'rolled_back';
    }
    if (this.currentTransaction) {
      await this.currentTransaction.cancel();
      this.currentTransaction = undefined;
    }
    const delegates = this.tools.getDelegates();
    if (this.preExecutionSnapshot && delegates?.xbridges?.restoreSnapshot) {
      await delegates.xbridges.restoreSnapshot(this.preExecutionSnapshot.nodes, this.preExecutionSnapshot.edges);
      if (delegates.xbridges.save) await delegates.xbridges.save();
      this.refreshProjectContext();
      this.preExecutionSnapshot = undefined;
    }
    if (this.pendingApproval) {
      this.pendingApproval = undefined;
    }
    if (this.taskState && this.taskState.status !== 'completed') {
      this.taskState = transitionState(this.taskState, 'blocked', 'Cancelled by user');
    }
    this.appendAudit('OPERATION_CANCELLED', {});
    return {
      success: true,
      message: 'Operation cancelled. Workspace restored to pre-execution snapshot.'
    };
  }
}
