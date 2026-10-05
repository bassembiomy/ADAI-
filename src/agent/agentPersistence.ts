import {
  TaskState,
  AuditRecord,
  RequirementState,
  ApprovalRequest
} from './types';

export const AGENT_PERSISTENCE_SCHEMA_VERSION = 3;

export interface PersistedActionResult {
  readonly actionId: string;
  readonly approvalId: string;
  readonly projectId: string;
  readonly adapterKind: string;
  readonly status: 'success' | 'failed' | 'requires_review';
  readonly changedArtifactHashes: Readonly<Record<string, string>>;
  readonly evidenceReferences: Readonly<Record<string, unknown>>;
  readonly executedAt: string;
  readonly durationMs?: number;
  readonly error?: string;
}

export interface AgentPersistenceData {
  version: number;
  requirementState: RequirementState;
  taskState: TaskState;
  pendingApprovals: ApprovalRequest[];
  actionResults?: PersistedActionResult[];
  auditTrail: AuditRecord[];
  lastSavedAt: string;
  projectMemory?: Record<string, unknown>;
  modelMemory?: Record<string, unknown>;
  engineeringSession?: {
    sessionId?: string;
    requestInput?: string;
    plannerRoute?: 'deterministic' | 'legacy';
  };
  rolloutStage?: 'shadow' | 'selected_project' | 'general' | 'disabled';
}

export class AgentPersistence {
  /**
   * Serializes session data to a JSON string with timestamp.
   */
  public static serialize(data: AgentPersistenceData): string {
    const payload: AgentPersistenceData = {
      ...data,
      version: AGENT_PERSISTENCE_SCHEMA_VERSION,
      lastSavedAt: new Date().toISOString()
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Deserializes session data with strict version and schema checks,
   * providing backwards-compatible fail-safe migration from Version 1 and 2.
   */
  public static deserialize(json: string): AgentPersistenceData {
    let parsed: any;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new Error(`Invalid JSON in agent persistence payload: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Persistence payload must be an object');
    }

    if (parsed.version === 1) {
      // Deterministic fail-safe migration from V1 to V3
      parsed.version = AGENT_PERSISTENCE_SCHEMA_VERSION;
      parsed.projectMemory = parsed.projectMemory || {};
      parsed.modelMemory = parsed.modelMemory || {};
      parsed.engineeringSession = undefined;
    } else if (parsed.version === 2) {
      // Deterministic fail-safe migration from V2 to V3
      parsed.version = AGENT_PERSISTENCE_SCHEMA_VERSION;
      parsed.engineeringSession = parsed.engineeringSession || undefined;
    } else if (parsed.version !== AGENT_PERSISTENCE_SCHEMA_VERSION) {
      throw new Error(
        `Incompatible persistence version: expected <= ${AGENT_PERSISTENCE_SCHEMA_VERSION}, received ${parsed.version}. Please open in read-only mode or update ADIA.`
      );
    }

    if (!parsed.taskState || !parsed.requirementState) {
      throw new Error('Persistence payload missing required taskState or requirementState');
    }

    return parsed as AgentPersistenceData;
  }

  /**
   * Safely restores an agent session:
   * - If an execution was interrupted mid-flight, marks status as 'blocked' with 'requires_review'; never resumes automatically.
   * - Invalidates and cancels any active approval tokens restored from disk to prevent token reuse across restarts.
   * - Appends immutable audit records documenting the recovery action.
   */
  public static restoreSafely(data: AgentPersistenceData): AgentPersistenceData {
    const now = new Date().toISOString();
    let updatedTaskState: TaskState = { ...data.taskState };
    const updatedAuditTrail: AuditRecord[] = (data.auditTrail || data.taskState.auditHistory || []).map(a => Object.freeze({ ...a }));
    let updatedPendingApprovals: ApprovalRequest[] = [...(data.pendingApprovals || [])];
    const actionResults: PersistedActionResult[] = [...(data.actionResults || [])];

    // Check for interrupted execution
    if (updatedTaskState.status === 'executing') {
      updatedTaskState = {
        ...updatedTaskState,
        status: 'blocked',
        blockedReason: 'requires_review: Application restarted while a real engineering action was executing. Never resumed automatically. Manual review required.',
        updatedAt: now
      };

      updatedAuditTrail.push(Object.freeze({
        id: `audit-recovery-${Date.now()}-1`,
        timestamp: now,
        eventType: 'INTERRUPTED_EXECUTION_DETECTED',
        actor: 'system',
        projectId: data.requirementState.id,
        resultStatus: 'requires_review',
        details: {
          originalStatus: 'executing',
          newStatus: 'blocked',
          disposition: 'requires_review',
          reason: 'Application restarted while an agent action was executing. Real execution interrupted. Never resume automatically.'
        }
      }));
    }

    // Check for pending approval tokens: tokens from a previous session must never be reused
    const hasPendingApprovals = updatedPendingApprovals.some(a => a.status === 'pending');
    if (hasPendingApprovals) {
      updatedPendingApprovals = updatedPendingApprovals.map(req => {
        if (req.status === 'pending') {
          return Object.freeze({
            ...req,
            status: 'cancelled' as const,
            description: `${req.description} (Session expired/restored from persistence; token invalidated)`
          });
        }
        return req;
      });

      updatedTaskState = {
        ...updatedTaskState,
        status: 'blocked',
        blockedReason: 'Approval tokens cannot cross application restart boundaries for safety. Re-approval required.',
        updatedAt: now
      };

      updatedAuditTrail.push(Object.freeze({
        id: `audit-recovery-${Date.now()}-2`,
        timestamp: now,
        eventType: 'APPROVAL_TOKENS_INVALIDATED',
        actor: 'system',
        projectId: data.requirementState.id,
        resultStatus: 'requires_review',
        details: {
          reason: 'Approval tokens cannot cross application restart boundaries for safety. Re-approval required.'
        }
      }));
    }

    return {
      version: data.version,
      requirementState: data.requirementState,
      taskState: {
        ...updatedTaskState,
        approvals: updatedPendingApprovals,
        auditHistory: updatedAuditTrail
      },
      pendingApprovals: updatedPendingApprovals,
      actionResults,
      auditTrail: updatedAuditTrail,
      lastSavedAt: now,
      projectMemory: data.projectMemory ? { ...data.projectMemory } : {},
      modelMemory: data.modelMemory ? { ...data.modelMemory } : {},
      engineeringSession: data.engineeringSession ? { ...data.engineeringSession } : undefined,
      rolloutStage: data.rolloutStage
    };
  }

  /**
   * Save session to localStorage or storage adapter.
   */
  public static saveToStorage(storageKey: string, data: AgentPersistenceData): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, this.serialize(data));
    }
  }

  /**
   * Load and safely restore session from localStorage or storage adapter.
   */
  public static loadFromStorage(storageKey: string): AgentPersistenceData | null {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      try {
        const parsed = this.deserialize(raw);
        return this.restoreSafely(parsed);
      } catch {
        return null;
      }
    }
    return null;
  }
}
