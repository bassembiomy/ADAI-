import { describe, it, expect } from 'vitest';
import {
  TaskState,
  RequirementState,
  AgentEvent,
  ApprovalRequest,
  ToolAction,
  AuditRecord,
  WorkflowStatus,
  serializeTaskState,
  deserializeTaskState
} from './types';

describe('Agent Domain Types & Serialization', () => {
  it('should support all specified discriminated union workflow statuses', () => {
    const validStatuses: WorkflowStatus[] = [
      'clarifying',
      'specification_ready',
      'awaiting_specification_approval',
      'planning',
      'awaiting_plan_approval',
      'awaiting_change_approval',
      'executing',
      'validating',
      'completed',
      'blocked',
      'failed'
    ];

    expect(validStatuses).toHaveLength(11);
  });

  it('should accurately serialize and deserialize TaskState preserving all fields and types', () => {
    const approvalRequest: ApprovalRequest = {
      id: 'app-req-1',
      type: 'specification',
      title: 'Approve Air-Fryer Specification',
      description: 'Air-fryer thermal and control baseline specification',
      status: 'pending',
      createdAt: '2026-09-17T10:00:00.000Z',
      payload: {
        specId: 'spec-1',
        hash: 'abc123'
      }
    };

    const toolAction: ToolAction = {
      id: 'act-1',
      tool: 'inspect_project',
      params: { path: 'models/air_fryer.json' },
      approvalToken: 'app-req-1',
      status: 'pending'
    };

    const auditRecord: AuditRecord = {
      id: 'audit-1',
      timestamp: '2026-09-17T10:01:00.000Z',
      eventType: 'PROPOSAL_CREATED',
      actor: 'agent',
      details: { summary: 'Proposed heating element and sensor blocks' }
    };

    const event: AgentEvent = {
      id: 'evt-1',
      timestamp: '2026-09-17T10:00:00.000Z',
      type: 'QUESTION_ASKED',
      payload: { question: 'What is the target maximum operating temperature?' }
    };

    const requirementState: RequirementState = {
      id: 'req-state-1',
      objective: 'Design an air-fryer heating and fan control system',
      targetSystem: 'air-fryer',
      inputs: {
        powerVoltage: '230V AC'
      },
      constraints: ['Max temperature 200C'],
      assumptions: [
        {
          id: 'asm-1',
          key: 'maxPower',
          value: '1800W',
          description: 'Standard domestic air-fryer heating power',
          status: 'pending_approval'
        }
      ],
      requiredOutputs: ['Simulink model', 'C code', 'Verification report'],
      successCriteria: ['Reaches 180C within 3 minutes with overshoot < 5C'],
      openQuestions: ['What temperature sensor type is desired?'],
      answers: {
        targetTemp: '180C'
      },
      completenessScore: 0.8,
      conflicts: []
    };

    const taskState: TaskState = {
      id: 'task-101',
      status: 'clarifying',
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:01:00.000Z',
      requirementState,
      events: [event],
      approvals: [approvalRequest],
      pendingActions: [toolAction],
      auditHistory: [auditRecord]
    };

    const serialized = serializeTaskState(taskState);
    expect(typeof serialized).toBe('string');

    const deserialized = deserializeTaskState(serialized);
    expect(deserialized).toEqual(taskState);
    expect(deserialized.status).toBe('clarifying');
    expect(deserialized.requirementState.assumptions[0].status).toBe('pending_approval');
  });

  it('fails safely when deserializing corrupted or malformed task state JSON', () => {
    expect(() => deserializeTaskState('{ invalid json')).toThrow(/Failed to parse task state JSON/);
    expect(() => deserializeTaskState('{"foo": "bar"}')).toThrow(/Invalid task state/);
  });
});
