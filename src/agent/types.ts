/**
 * Domain Types for Offline Prompt-Driven ADIA Engineering Agent
 */

export type WorkflowStatus =
  // Explicit fine-grained engineering workflow states
  | 'understand'
  | 'retrieve'
  | 'clarify'
  | 'plan'
  | 'preflight'
  | 'build'
  | 'validate'
  | 'repair'
  | 'simulate'
  | 'final_verify'
  | 'report'
  // Preserved states for backward compatibility with existing TaskState persistence
  | 'clarifying'
  | 'specification_ready'
  | 'awaiting_specification_approval'
  | 'planning'
  | 'awaiting_plan_approval'
  | 'awaiting_change_approval'
  | 'executing'
  | 'validating'
  | 'completed'
  | 'blocked'
  | 'failed';


export type ApprovalType = 'specification' | 'plan' | 'change' | 'default_proposal';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  title: string;
  description: string;
  status: ApprovalStatus;
  createdAt: string;
  payload: Record<string, unknown>;
  decidedAt?: string;
  reason?: string;
}

export type ToolActionStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'rejected';

export interface ToolAction {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  approvalToken?: string;
  status: ToolActionStatus;
  result?: unknown;
  error?: string;
  executedAt?: string;
}

export interface AuditRecord {
  readonly id: string;
  readonly timestamp: string;
  readonly eventType: string;
  readonly actor: 'user' | 'agent' | 'system';
  readonly actionId?: string;
  readonly projectId?: string;
  readonly approvalId?: string;
  readonly adapter?: string;
  readonly resultStatus?: 'success' | 'failed' | 'requires_review' | 'pending';
  readonly details: Readonly<Record<string, unknown>>;
}

export interface AgentEvent {
  id: string;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface Assumption {
  id: string;
  key: string;
  value: string | number | boolean;
  description: string;
  status: 'pending_approval' | 'approved' | 'rejected';
}

export interface RequirementConflict {
  id: string;
  description: string;
  involvedKeys: string[];
  resolved: boolean;
}

export interface RequirementState {
  id: string;
  objective: string;
  targetSystem: string;
  inputs: Record<string, unknown>;
  constraints: string[];
  assumptions: Assumption[];
  requiredOutputs: string[];
  successCriteria: string[];
  openQuestions: string[];
  answers: Record<string, string>;
  completenessScore: number;
  conflicts: RequirementConflict[];
}

export interface TaskState {
  id: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  requirementState: RequirementState;
  events: AgentEvent[];
  approvals: ApprovalRequest[];
  pendingActions: ToolAction[];
  auditHistory: AuditRecord[];
  blockedReason?: string;
  failureReason?: string;
}

/**
 * Serializes a TaskState instance to deterministic JSON.
 */
export function serializeTaskState(state: TaskState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Deserializes JSON string into a validated TaskState object.
 */
export function deserializeTaskState(json: string): TaskState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse task state JSON: ${msg}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid task state: payload is not an object');
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.status !== 'string' || !obj.requirementState) {
    throw new Error('Invalid task state: missing required root properties (id, status, requirementState)');
  }

  return parsed as TaskState;
}

export * from './actionContracts';
