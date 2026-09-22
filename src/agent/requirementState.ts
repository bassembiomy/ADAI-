import {
  TaskState,
  RequirementState,
  WorkflowStatus,
  Assumption,
  AgentEvent,
  AuditRecord
} from './types';

/**
 * Creates an empty initial RequirementState.
 */
export function createRequirementState(objective: string, targetSystem: string): RequirementState {
  return {
    id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
    conflicts: []
  };
}

/**
 * Creates a fresh TaskState in 'clarifying' status.
 */
export function createTaskState(objective: string, targetSystem: string): TaskState {
  const now = new Date().toISOString();
  const reqState = createRequirementState(objective, targetSystem);

  const initEvent: AgentEvent = {
    id: `evt-${Date.now()}-init`,
    timestamp: now,
    type: 'TASK_INITIALIZED',
    payload: { objective, targetSystem }
  };

  const initAudit: AuditRecord = {
    id: `audit-${Date.now()}-init`,
    timestamp: now,
    eventType: 'TASK_INITIALIZED',
    actor: 'system',
    details: { objective, targetSystem }
  };

  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    status: 'clarifying',
    createdAt: now,
    updatedAt: now,
    requirementState: reqState,
    events: [initEvent],
    approvals: [],
    pendingActions: [],
    auditHistory: [initAudit]
  };
}

/**
 * Records an answer to a question or input key, returning a new immutable TaskState.
 */
export function recordAnswer(state: TaskState, questionKey: string, answer: string): TaskState {
  const now = new Date().toISOString();

  const newAnswers = {
    ...state.requirementState.answers,
    [questionKey]: answer
  };

  const newInputs = {
    ...state.requirementState.inputs,
    [questionKey]: answer
  };

  const newOpenQuestions = state.requirementState.openQuestions.filter(q => q !== questionKey);

  const newReqState: RequirementState = {
    ...state.requirementState,
    answers: newAnswers,
    inputs: newInputs,
    openQuestions: newOpenQuestions
  };

  const event: AgentEvent = {
    id: `evt-${Date.now()}`,
    timestamp: now,
    type: 'ANSWER_RECORDED',
    payload: { key: questionKey, answer }
  };

  const audit: AuditRecord = {
    id: `audit-${Date.now()}`,
    timestamp: now,
    eventType: 'ANSWER_RECORDED',
    actor: 'user',
    details: { key: questionKey, answer }
  };

  return {
    ...state,
    updatedAt: now,
    requirementState: newReqState,
    events: [...state.events, event],
    auditHistory: [...state.auditHistory, audit]
  };
}

/**
 * Records an engineering assumption/default proposal with status 'pending_approval'.
 */
export function recordProposal(
  state: TaskState,
  key: string,
  value: string | number | boolean,
  description: string
): TaskState {
  const now = new Date().toISOString();

  const existingIndex = state.requirementState.assumptions.findIndex(a => a.key === key);
  const newAssumption: Assumption = {
    id: `asm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    key,
    value,
    description,
    status: 'pending_approval'
  };

  const newAssumptions = [...state.requirementState.assumptions];
  if (existingIndex >= 0) {
    newAssumptions[existingIndex] = newAssumption;
  } else {
    newAssumptions.push(newAssumption);
  }

  const newReqState: RequirementState = {
    ...state.requirementState,
    assumptions: newAssumptions
  };

  const event: AgentEvent = {
    id: `evt-${Date.now()}`,
    timestamp: now,
    type: 'PROPOSAL_RECORDED',
    payload: { key, value, description }
  };

  const audit: AuditRecord = {
    id: `audit-${Date.now()}`,
    timestamp: now,
    eventType: 'PROPOSAL_RECORDED',
    actor: 'agent',
    details: { key, value, description, status: 'pending_approval' }
  };

  return {
    ...state,
    updatedAt: now,
    requirementState: newReqState,
    events: [...state.events, event],
    auditHistory: [...state.auditHistory, audit]
  };
}

/**
 * Approves a proposed assumption/default, updating status to 'approved'.
 */
export function approveProposal(state: TaskState, key: string): TaskState {
  const now = new Date().toISOString();

  const existingIndex = state.requirementState.assumptions.findIndex(a => a.key === key);
  if (existingIndex < 0) {
    throw new Error(`Cannot approve non-existent proposal: ${key}`);
  }

  const target = state.requirementState.assumptions[existingIndex];
  const updatedAssumption: Assumption = {
    ...target,
    status: 'approved'
  };

  const newAssumptions = [...state.requirementState.assumptions];
  newAssumptions[existingIndex] = updatedAssumption;

  const newReqState: RequirementState = {
    ...state.requirementState,
    assumptions: newAssumptions
  };

  const event: AgentEvent = {
    id: `evt-${Date.now()}`,
    timestamp: now,
    type: 'PROPOSAL_APPROVED',
    payload: { key, value: target.value }
  };

  const audit: AuditRecord = {
    id: `audit-${Date.now()}`,
    timestamp: now,
    eventType: 'PROPOSAL_APPROVED',
    actor: 'user',
    details: { key, value: target.value }
  };

  return {
    ...state,
    updatedAt: now,
    requirementState: newReqState,
    events: [...state.events, event],
    auditHistory: [...state.auditHistory, audit]
  };
}

const VALID_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  understand: ['retrieve', 'clarify', 'plan', 'blocked', 'failed'],
  retrieve: ['clarify', 'plan', 'understand', 'blocked', 'failed'],
  clarify: ['plan', 'preflight', 'retrieve', 'blocked', 'failed'],
  plan: ['preflight', 'clarify', 'build', 'blocked', 'failed'],
  preflight: ['build', 'plan', 'clarify', 'blocked', 'failed'],
  build: ['validate', 'repair', 'blocked', 'failed'],
  validate: ['repair', 'simulate', 'final_verify', 'report', 'completed', 'blocked', 'failed'],
  repair: ['validate', 'build', 'blocked', 'failed'],
  simulate: ['final_verify', 'validate', 'report', 'blocked', 'failed'],
  final_verify: ['report', 'completed', 'validate', 'blocked', 'failed'],
  report: ['completed', 'understand', 'clarify'],

  clarifying: ['specification_ready', 'awaiting_specification_approval', 'completed', 'blocked', 'failed'],
  specification_ready: ['awaiting_specification_approval', 'clarifying', 'blocked', 'failed'],
  awaiting_specification_approval: ['planning', 'clarifying', 'blocked', 'failed'],
  planning: ['awaiting_plan_approval', 'clarifying', 'blocked', 'failed'],
  awaiting_plan_approval: ['awaiting_change_approval', 'planning', 'blocked', 'failed'],
  awaiting_change_approval: ['executing', 'awaiting_plan_approval', 'blocked', 'failed'],
  executing: ['validating', 'awaiting_change_approval', 'completed', 'failed', 'blocked'],
  validating: ['completed', 'awaiting_change_approval', 'failed', 'blocked'],
  completed: ['clarifying', 'understand'],
  blocked: [
    'understand',
    'retrieve',
    'clarify',
    'plan',
    'preflight',
    'build',
    'validate',
    'repair',
    'simulate',
    'final_verify',
    'report',
    'clarifying',
    'specification_ready',
    'awaiting_specification_approval',
    'planning',
    'awaiting_plan_approval',
    'awaiting_change_approval',
    'executing',
    'validating',
    'failed'
  ],
  failed: ['clarifying', 'understand']
};

/**
 * Transitions task status with strict validation and immutable history preservation.
 */
export function transitionState(
  state: TaskState,
  newStatus: WorkflowStatus,
  reason: string
): TaskState {
  const allowed = VALID_TRANSITIONS[state.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Illegal state transition from ${state.status} to ${newStatus}: ${reason}`);
  }

  // Pre-condition validations
  if (newStatus === 'specification_ready' || newStatus === 'awaiting_specification_approval') {
    const unapproved = state.requirementState.assumptions.filter(a => a.status === 'pending_approval');
    if (unapproved.length > 0) {
      const keys = unapproved.map(a => a.key).join(', ');
      if (newStatus === 'specification_ready') {
        throw new Error(`Cannot mark specification ready: unapproved assumptions pending (${keys})`);
      } else {
        throw new Error(`Cannot request specification approval: unapproved assumptions pending (${keys})`);
      }
    }

    const unresolvedConflicts = state.requirementState.conflicts.filter(c => !c.resolved);
    if (unresolvedConflicts.length > 0) {
      const label = newStatus === 'specification_ready' ? 'Cannot mark specification ready' : 'Cannot request specification approval';
      throw new Error(
        `${label}: ${unresolvedConflicts.length} unresolved conflicts exist`
      );
    }
  }

  if (newStatus === 'awaiting_specification_approval') {
    if (state.requirementState.openQuestions.length > 0) {
      throw new Error(
        `Cannot request specification approval: open questions remain (${state.requirementState.openQuestions.join(', ')})`
      );
    }
  }

  const now = new Date().toISOString();

  const event: AgentEvent = {
    id: `evt-${Date.now()}`,
    timestamp: now,
    type: 'STATE_TRANSITION',
    payload: { from: state.status, to: newStatus, reason }
  };

  const audit: AuditRecord = {
    id: `audit-${Date.now()}`,
    timestamp: now,
    eventType: 'STATE_TRANSITION',
    actor: 'agent',
    details: { from: state.status, to: newStatus, reason }
  };

  return {
    ...state,
    status: newStatus,
    updatedAt: now,
    events: [...state.events, event],
    auditHistory: [...state.auditHistory, audit]
  };
}
