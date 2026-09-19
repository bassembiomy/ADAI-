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

  constructor(llmProvider?: LlmProvider, toolGatewayInstance?: ToolGateway) {
    this.llm = llmProvider || localLlmService.getProvider();
    this.tools = toolGatewayInstance || defaultToolGateway;
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
      const matchedTemplate = findTemplateForIntent(input);
      let targetSystem = matchedTemplate ? matchedTemplate.id : undefined;
      let objective = input;

      if (!targetSystem) {
        try {
          const intentReq = intentExtractionPrompt(input);
          const result = await this.llm.generate<{ targetSystem?: string; summary?: string }>(
            intentReq,
            { type: 'object' }
          );
          if (result.success && result.data.targetSystem) {
            targetSystem = result.data.targetSystem;
          }
        } catch {
          // Fallback to deterministic template matching
        }
      }

      if (!targetSystem) {
        if (input.toLowerCase().includes('air fryer') || input.toLowerCase().includes('air-fryer')) {
          targetSystem = 'air-fryer';
        }
      }

      if (!targetSystem) {
        return {
          status: 'blocked',
          message: `Unsupported engineering intent: '${input}'. Supported domains: Three-Phase Inverter ('three_phase_inverter') and Air-Fryer Thermal Control ('air-fryer'). Please specify a supported engineering system.`,
          taskState: undefined as any
        };
      }

      this.taskState = createTaskState(objective, targetSystem);

      if (matchedTemplate && matchedTemplate.defaultAssumptions.length > 0) {
        this.taskState.requirementState.assumptions = matchedTemplate.defaultAssumptions.map((a, idx) => ({
          id: `assump-${matchedTemplate.id}-${idx + 1}`,
          key: a.key,
          value: a.value,
          description: a.rationale,
          status: 'approved' as const
        }));
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

      const promptText = q.recommendedDefault
        ? `${q.question}\n(Recommended: ${q.recommendedDefault} — ${q.rationale})`
        : q.question;

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

      return {
        status: 'awaiting_specification_approval',
        message: `Requirements are fully defined. Please review and approve the formal specification: ${this.specification.title}.`,
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
      if (
        this.specification.targetSystem === 'three_phase_inverter' ||
        this.specification.targetSystem.toLowerCase().includes('inverter')
      ) {
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
            preflightResult
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
          preflightPassed: (preflightResult as any)?.passed
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
        preflightResult
      });

      return {
        status: 'awaiting_plan_approval',
        message: `Specification approved. Execution plan prepared with ${this.executionPlan.actions.length} actions. Please review and approve the plan.`,
        taskState: this.taskState,
        pendingApproval: planApprovalReq,
        executionPlan: this.executionPlan,
        preflightResult
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
          return { status: 'blocked', message: `Engineering plan rejected: ${explanation}`, taskState: this.taskState, preflightResult: check };
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
        executionPlan: this.executionPlan
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

      // Execute approved action with real parameters and matching approval token
      const toolResult = await this.tools.executeApprovedAction(
        approvedAction,
        approvedReq.id
      );

      if (!toolResult.success) {
        if (this.preExecutionSnapshot && delegates?.xbridges?.restoreSnapshot) {
          await delegates.xbridges.restoreSnapshot(this.preExecutionSnapshot.nodes, this.preExecutionSnapshot.edges);
          if (delegates.xbridges.save) await delegates.xbridges.save();
          this.refreshProjectContext();
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
        simulationResult
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
      taskState: this.taskState
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
