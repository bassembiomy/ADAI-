import { AuditRecord } from './types';
import { ExtendedApprovalRequest, validateBlockProposal } from './approvalGate';
import { AdiaBlockCatalog } from './adiaBlockCatalog';
import {
  ActionKind,
  ApprovedAction,
  ToolAdapter,
  ToolResult,
  validateApprovedAction
} from './actionContracts';
import { AdiaProjectAdapter } from './toolAdapters/adiaProjectAdapter';
import { XbridgesAdapter } from './toolAdapters/xbridgesAdapter';
import { VLabAdapter } from './toolAdapters/vlabAdapter';
import { SysmlAdapter } from './toolAdapters/sysmlAdapter';
import { LocalProcessAdapter } from './toolAdapters/localProcessAdapter';

export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  evidence?: Record<string, unknown>;
  changedArtifacts?: string[];
  auditRecord: AuditRecord;
  isDryRun?: boolean;
}

export interface ValidationCheckResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    actual: unknown;
    expected: unknown;
    reason?: string;
  }>;
}

const ALLOWLISTED_READ_TOOLS = new Set([
  'inspect_project',
  'inspect_catalog',
  'inspect_model',
  'inspect_simulation_status'
]);

const ALLOWLISTED_EXECUTE_TOOLS = new Set([
  'instantiate_block',
  'connect_ports',
  'configure_parameters',
  'run_simulation',
  'generate_code',
  'run_tests',
  'generate_report'
]);

import type { AgentApplicationDelegates } from './applicationDelegates';

export class ToolGateway {
  private auditHistory: AuditRecord[] = [];
  private approvedTokens: Map<string, ExtendedApprovalRequest> = new Map();
  private consumedTokens: Set<string> = new Set();
  private adapters: Map<ActionKind, ToolAdapter> = new Map();
  private delegates?: AgentApplicationDelegates;

  constructor(delegates?: AgentApplicationDelegates) {
    this.delegates = delegates;

    // Truth-preserving adapters connected to delegates if provided
    const projectAdapter = new AdiaProjectAdapter(delegates?.report, delegates?.project);
    const xbridgesAdapter = new XbridgesAdapter(delegates?.xbridges);
    const sysmlAdapter = new SysmlAdapter(delegates?.sysml);
    const vlabAdapter = new VLabAdapter(); // No runner by default -> fails simulation truthfully
    const processAdapter = new LocalProcessAdapter();

    this.registerAdapter('generate_report', projectAdapter);
    this.registerAdapter('instantiate_block', xbridgesAdapter);
    this.registerAdapter('connect_ports', xbridgesAdapter);
    this.registerAdapter('configure_parameters', xbridgesAdapter);
    this.registerAdapter('run_simulation', vlabAdapter);
    this.registerAdapter('generate_code', processAdapter);
    this.registerAdapter('run_tests', processAdapter);

    // Register SysML commands to sysmlAdapter
    this.registerAdapter('create_block' as any, sysmlAdapter as any);
    this.registerAdapter('create_requirement' as any, sysmlAdapter as any);
    this.registerAdapter('create_relationship' as any, sysmlAdapter as any);
    this.registerAdapter('sysml_command' as any, sysmlAdapter as any);
  }

  public getDelegates(): AgentApplicationDelegates | undefined {
    return this.delegates;
  }

  public getDelegateReadiness(): {
    xbridges: boolean;
    sysml: boolean;
    report: boolean;
    simulation: boolean;
  } {
    const xbridgesAdapter = this.adapters.get('instantiate_block') as XbridgesAdapter | undefined;
    const sysmlAdapter = this.adapters.get('create_block' as any) as SysmlAdapter | undefined;
    const reportAdapter = this.adapters.get('generate_report') as AdiaProjectAdapter | undefined;
    const vlabAdapter = this.adapters.get('run_simulation') as VLabAdapter | undefined;

    return {
      xbridges: Boolean(xbridgesAdapter?.isAvailable?.() || this.delegates?.xbridges),
      sysml: Boolean(sysmlAdapter?.isAvailable?.() || this.delegates?.sysml),
      report: Boolean(reportAdapter?.isAvailable?.() || this.delegates?.report),
      simulation: Boolean(vlabAdapter?.isAvailable?.()),
    };
  }

  public registerAdapter(kind: ActionKind, adapter: ToolAdapter): void {
    this.adapters.set(kind, adapter);
  }

  public getAdapter(kind: ActionKind): ToolAdapter | undefined {
    return this.adapters.get(kind);
  }

  public registerApprovedToken(request: ExtendedApprovalRequest): void {
    if (request.status === 'approved') {
      this.approvedTokens.set(request.id, request);
    }
  }

  public getAuditHistory(): readonly AuditRecord[] {
    return this.auditHistory;
  }

  private createAuditRecord(
    eventType: string,
    details: Record<string, unknown>
  ): AuditRecord {
    const record: AuditRecord = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      eventType,
      actor: 'agent',
      details
    };
    this.auditHistory.push(record);
    return record;
  }

  /**
   * Read-only inspection operations. Does not modify project state.
   */
  public async inspect(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    if (!ALLOWLISTED_READ_TOOLS.has(toolName)) {
      const audit = this.createAuditRecord('TOOL_INSPECT_REJECTED', {
        toolName,
        reason: 'Not an allowlisted read tool'
      });
      return {
        success: false,
        error: `Tool '${toolName}' is not an allowlisted read tool`,
        auditRecord: audit
      };
    }

    let resultData: unknown = {};

    if (toolName === 'inspect_catalog') {
      if (params.capability) {
        resultData = AdiaBlockCatalog.findByCapability(String(params.capability));
      } else if (params.name) {
        resultData = AdiaBlockCatalog.findByName(String(params.name));
      } else {
        resultData = AdiaBlockCatalog.list().slice(0, 20);
      }
    } else if (toolName === 'inspect_project') {
      const projectAdapter = this.adapters.get('generate_report') as AdiaProjectAdapter | undefined;
      const liveParams = {
        projectId: this.delegates?.project?.getProjectId(),
        workspace: this.delegates?.project?.getActiveWorkspace(),
        ...params,
      };
      if (projectAdapter) {
        const insp = await projectAdapter.inspect(liveParams);
        resultData = insp.data;
      } else {
        resultData = {
          projectType: 'adia_engineering_suite',
          ready: true,
          availableModules: ['vlab', 'xbridges', 'sysml'],
          ...liveParams,
        };
      }
    } else if (toolName === 'inspect_model') {
      const targetWs = (params.workspace as string) || this.delegates?.project?.getActiveWorkspace();
      if (targetWs === 'sysml') {
        const sysmlAdapter = this.adapters.get('create_block' as any) as SysmlAdapter | undefined;
        if (sysmlAdapter && sysmlAdapter.isAvailable()) {
          const insp = await sysmlAdapter.inspect(params);
          resultData = insp.data;
        } else {
          resultData = { workspace: 'sysml', available: false, params };
        }
      } else {
        const xbridgesAdapter = this.adapters.get('instantiate_block');
        if (xbridgesAdapter) {
          const insp = await xbridgesAdapter.inspect(params);
          resultData = insp.data;
        } else {
          resultData = { workspace: 'default', params };
        }
      }
    } else if (toolName === 'inspect_simulation_status') {
      const vlabAdapter = this.adapters.get('run_simulation');
      if (vlabAdapter) {
        const insp = await vlabAdapter.inspect(params);
        resultData = insp.data;
      } else {
        resultData = { active: false, simulatorAvailable: false };
      }
    }

    const audit = this.createAuditRecord('TOOL_INSPECT', {
      toolName,
      params,
      success: true
    });

    return {
      success: true,
      data: resultData,
      auditRecord: audit
    };
  }

  /**
   * Generates a dry-run proposed change without mutating state.
   */
  public async propose(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    if (!ALLOWLISTED_EXECUTE_TOOLS.has(toolName)) {
      const audit = this.createAuditRecord('TOOL_PROPOSAL_REJECTED', {
        toolName,
        reason: 'Not an allowlisted execution tool'
      });
      return {
        success: false,
        error: `Tool '${toolName}' is not an allowlisted tool`,
        auditRecord: audit,
        isDryRun: true
      };
    }

    // Verify catalog block constraints if blockId is referenced
    if (params.blockId && typeof params.blockId === 'string') {
      try {
        validateBlockProposal(params.blockId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const audit = this.createAuditRecord('TOOL_PROPOSAL_BLOCKED_NON_CATALOG', {
          blockId: params.blockId,
          error: msg
        });
        return {
          success: false,
          error: msg,
          auditRecord: audit,
          isDryRun: true
        };
      }
    }

    const audit = this.createAuditRecord('TOOL_PROPOSAL', {
      toolName,
      params,
      isDryRun: true
    });

    return {
      success: true,
      isDryRun: true,
      data: {
        proposedAction: toolName,
        params,
        requiresApproval: true
      },
      auditRecord: audit
    };
  }

  /**
   * Executes a typed ApprovedAction using the registered adapter.
   * Strictly requires a valid, unconsumed approval token that matches action.approvalId.
   */
  public async executeApprovedAction(
    action: ApprovedAction,
    approvalToken: string
  ): Promise<ToolExecutionResult> {
    if (!approvalToken || approvalToken.trim() === '') {
      throw new Error('Approval token is required for executable tool operations');
    }

    if (this.consumedTokens.has(approvalToken)) {
      throw new Error(`Token has already been consumed: ${approvalToken}`);
    }

    const approvedReq = this.approvedTokens.get(approvalToken);
    if (!approvedReq || approvedReq.status !== 'approved') {
      throw new Error(`Token '${approvalToken}' is not approved or was not found in registered gates`);
    }

    if (action.approvalId !== approvalToken) {
      throw new Error(
        `Approval token does not match action approvalId: token='${approvalToken}', action='${action.approvalId}'`
      );
    }

    const val = validateApprovedAction(action);
    if (!val.valid) {
      throw new Error(`ApprovedAction validation failed: ${val.errors.join('; ')}`);
    }

    const adapter = this.adapters.get(action.kind);
    if (!adapter) {
      throw new Error(`No adapter registered for action kind '${action.kind}'`);
    }

    // Mark token consumed before execution to prevent double execution
    this.consumedTokens.add(approvalToken);

    try {
      const toolResult: ToolResult = await adapter.execute(action);

      const audit = this.createAuditRecord(
        toolResult.success ? 'TOOL_EXECUTION_SUCCESS' : 'TOOL_EXECUTION_FAILURE',
        {
          actionId: action.id,
          kind: action.kind,
          params: action.params,
          approvalToken,
          evidence: toolResult.evidence,
          changedArtifacts: toolResult.changedArtifacts,
          durationMs: toolResult.durationMs,
          error: toolResult.error
        }
      );

      return {
        success: toolResult.success,
        data: toolResult.evidence,
        evidence: toolResult.evidence,
        changedArtifacts: toolResult.changedArtifacts,
        error: toolResult.error,
        auditRecord: audit
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const audit = this.createAuditRecord('TOOL_EXECUTION_FAILURE', {
        actionId: action.id,
        kind: action.kind,
        params: action.params,
        approvalToken,
        error: msg
      });

      return {
        success: false,
        error: msg,
        auditRecord: audit
      };
    }
  }

  /**
   * Executes an approved tool operation. Strictly requires a valid, unconsumed approval token.
   * Backward-compatible bridge to executeApprovedAction.
   */
  public async executeApproved(
    toolName: string,
    params: Record<string, unknown>,
    approvalToken: string
  ): Promise<ToolExecutionResult> {
    if (!approvalToken || approvalToken.trim() === '') {
      throw new Error('Approval token is required for executable tool operations');
    }

    if (this.consumedTokens.has(approvalToken)) {
      throw new Error(`Token has already been consumed: ${approvalToken}`);
    }

    const approvedReq = this.approvedTokens.get(approvalToken);
    if (!approvedReq || approvedReq.status !== 'approved') {
      throw new Error(`Token '${approvalToken}' is not approved or was not found in registered gates`);
    }

    if (!ALLOWLISTED_EXECUTE_TOOLS.has(toolName)) {
      throw new Error(`Tool '${toolName}' is not an allowlisted execution tool`);
    }

    // Strictly verify catalog constraint on block creation
    if (params.blockId && typeof params.blockId === 'string') {
      validateBlockProposal(params.blockId);
    }

    const kind = toolName as ActionKind;
    const blockIds: string[] = [];
    if (typeof params.blockId === 'string') blockIds.push(params.blockId);
    if (typeof params.blockType === 'string') blockIds.push(params.blockType);

    const action: ApprovedAction = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      kind,
      projectId: String(params.projectId || 'current_project'),
      targetWorkspace: String(params.targetWorkspace || 'xbridges'),
      params,
      blockIds,
      approvalId: approvalToken,
      expectedEvidence: `${toolName} execution evidence`
    };

    return this.executeApprovedAction(action, approvalToken);
  }

  /**
   * Validates execution evidence against approved acceptance criteria.
   */
  public async validate(
    evidence: Record<string, unknown>,
    criteria: Record<string, unknown>
  ): Promise<ValidationCheckResult> {
    const checks: ValidationCheckResult['checks'] = [];
    let overallPassed = true;

    if (criteria.maxRiseTimeSeconds !== undefined && evidence.riseTimeSeconds !== undefined) {
      const actual = Number(evidence.riseTimeSeconds);
      const expected = Number(criteria.maxRiseTimeSeconds);
      const passed = actual <= expected;
      if (!passed) overallPassed = false;
      checks.push({
        name: 'Rise Time Within Limit',
        passed,
        actual: `${actual}s`,
        expected: `<= ${expected}s`
      });
    }

    if (criteria.maxOvershootDegrees !== undefined && evidence.overshootDegrees !== undefined) {
      const actual = Number(evidence.overshootDegrees);
      const expected = Number(criteria.maxOvershootDegrees);
      const passed = actual <= expected;
      if (!passed) overallPassed = false;
      checks.push({
        name: 'Temperature Overshoot Within Limit',
        passed,
        actual: `${actual}°C`,
        expected: `<= ${expected}°C`
      });
    }

    this.createAuditRecord('VALIDATION_PERFORMED', {
      checks,
      overallPassed
    });

    return {
      passed: overallPassed,
      checks
    };
  }
}

export const toolGateway = new ToolGateway();
