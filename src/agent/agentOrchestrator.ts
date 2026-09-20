/**
 * src/agent/agentOrchestrator.ts
 *
 * Thin UI-compatible facade over the single production X-Bridges workflow
 * (GeneralXbridgesWorkflow). All engineering requests — create, inspect,
 * modify, diagnose, repair, optimize, including inverter and air-fryer
 * requests — flow through that one catalog-driven coordinator.
 *
 * The facade owns no execution behavior: no legacy template planning, no
 * target-system branches, no synthetic evidence.
 */
import {
  TaskState,
  WorkflowStatus,
  AuditRecord,
} from './types';
import {
  ExtendedApprovalRequest
} from './approvalGate';
import {
  ToolGateway,
  toolGateway as defaultToolGateway,
  ValidationCheckResult
} from './toolGateway';
import {
  LlmProvider,
} from './llmProvider';
import { localLlmService } from '../services/localLlmService';
import { RequestCollaborator } from './collaborators/requestCollaborator';
import { GeneralXbridgesWorkflow, LivePlanningContext } from './generalXbridgesWorkflow';
import { XbridgesIntent } from '../services/ai/planner/generalIntent';
import { XbridgesProof } from '../services/ai/proof/xbridgesProofRunner';
import { EngineeringModelPlanV2 } from '../services/ai/contracts/engineeringModel';
import { TransactionStatus } from '../services/ai/execution/xbridgesAgentTransaction';
import { ExecutionPlan } from './planEngine';
import { SimulationResult } from '../services/ai/simulation/simulationTools';

export interface OrchestratorResponse {
  status: WorkflowStatus;
  message: string;
  taskState: TaskState;
  pendingApproval?: ExtendedApprovalRequest;
  specification?: {
    id?: string;
    title?: string;
    targetSystem?: string;
    approved?: boolean;
    requirements?: Array<{ id: string; description?: string; value?: unknown; category?: string }>;
    assumptions?: Array<{ key: string; value: unknown; description?: string; rationale?: string }>;
    safetyLimits?: string[];
    successCriteria?: string[];
    [key: string]: unknown;
  };
  executionPlan?: ExecutionPlan;
  validationResult?: ValidationCheckResult;
  preflightResult?: unknown;
  simulationResult?: SimulationResult;

  intent?: XbridgesIntent | string;
  resolvedRequirements?: unknown;
  patternEvidence?: unknown;
  plan?: EngineeringModelPlanV2;
  proof?: XbridgesProof;
  currentApproval?: ExtendedApprovalRequest;
  observedDeltas?: unknown;
  transactionStatus?: TransactionStatus | 'idle' | 'failed';
  finalEvidence?: {
    engineRunId?: string;
    proof?: XbridgesProof;
    planHash?: string;
    catalogHash?: string;
    knowledgeHash?: string;
    savedFingerprint?: string;
    reloadedFingerprint?: string;
    persistedRevision?: number;
    baseRevision?: number;
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
  private requestCollaborator: RequestCollaborator;
  private generalWorkflow: GeneralXbridgesWorkflow;
  private projectContext: ProjectContext = {
    projectId: 'default',
    workspace: 'default',
    revision: 0,
  };

  constructor(llmProvider?: LlmProvider, toolGatewayInstance?: ToolGateway) {
    this.llm = llmProvider || localLlmService.getProvider();
    this.tools = toolGatewayInstance || defaultToolGateway;
    this.requestCollaborator = new RequestCollaborator(this.llm);
    this.generalWorkflow = new GeneralXbridgesWorkflow(this.llm, this.tools);
  }

  public setToolGateway(gateway: ToolGateway): void {
    this.tools = gateway;
    // Rebind the workflow to the refreshed gateway; pending approvals survive
    // because they are owned by the workflow session, not the gateway.
    this.generalWorkflow = new GeneralXbridgesWorkflow(this.llm, this.tools);
  }

  public getGeneralWorkflow(): GeneralXbridgesWorkflow {
    return this.generalWorkflow;
  }

  public getProjectContext(): ProjectContext {
    return this.projectContext;
  }

  public updateProjectContext(next: Partial<ProjectContext>): void {
    this.projectContext = { ...this.projectContext, ...next };
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
    const state = this.generalWorkflow.getTaskState();
    if (!state) {
      throw new Error('No active task state initialized in orchestrator');
    }
    return state;
  }

  public getAuditHistory(): readonly AuditRecord[] {
    return [
      ...this.generalWorkflow.getAuditHistory(),
      ...this.tools.getAuditHistory(),
    ];
  }

  public getToolGateway(): ToolGateway {
    return this.tools;
  }

  public getPendingApproval(): ExtendedApprovalRequest | undefined {
    return this.generalWorkflow.getPendingApproval();
  }

  private liveContext(): LivePlanningContext {
    const self = this;
    return {
      projectId: this.projectContext.projectId,
      workspace: this.projectContext.workspace,
      getRevision: () => {
        const delegates = self.tools.getDelegates();
        const proj = delegates?.project as { getRevision?: () => number } | undefined;
        return proj?.getRevision?.() ?? self.projectContext.revision;
      },
      setRevision: (rev: number) => {
        self.projectContext = { ...self.projectContext, revision: rev };
      },
    };
  }

  /**
   * Primary entrypoint for natural language user input. Every X-Bridges
   * request is routed to the single general workflow.
   */
  public async handle(input: string): Promise<OrchestratorResponse> {
    // Active sessions (clarification answers, follow-ups) go straight to the
    // workflow; classification happens once per session inside it.
    if (this.generalWorkflow.hasActiveSession()) {
      return this.generalWorkflow.handle(input, this.liveContext());
    }

    const classified = await this.requestCollaborator.classifyRequest(input);
    this.generalWorkflow.lastHandledIntent = classified.intent;
    return this.generalWorkflow.handle(input, this.liveContext());
  }

  /**
   * Approves a pending approval request owned by the general workflow.
   */
  public async approve(requestId: string, reason?: string): Promise<OrchestratorResponse> {
    const response = await this.generalWorkflow.approve(requestId, reason);
    this.refreshProjectContext();
    return response;
  }

  /**
   * Handles explicit user rejection of a pending approval request.
   */
  public async reject(requestId: string, reason: string): Promise<OrchestratorResponse> {
    const response = await this.generalWorkflow.reject(requestId, reason);
    this.refreshProjectContext();
    return response;
  }

  /**
   * Cancels in-flight operations, restoring exact pre-execution state.
   */
  public async cancelOperation(): Promise<{ success: boolean; message: string }> {
    const response = await this.generalWorkflow.cancel('Operation cancelled by user');
    this.refreshProjectContext();
    return {
      success: response.transactionStatus !== 'failed_rollback',
      message: response.message,
    };
  }

  /**
   * Undoes the last committed engineering transaction atomically, only when
   * the workspace still matches the committed transaction fingerprint.
   */
  public async undoLastTransaction(projectId?: string): Promise<{ success: boolean; message: string }> {
    const pId = projectId || this.projectContext.projectId;
    return this.generalWorkflow.undoLastTransaction(pId);
  }
}
