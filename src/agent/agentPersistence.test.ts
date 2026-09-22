import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentPersistence,
  AgentPersistenceData,
  AGENT_PERSISTENCE_SCHEMA_VERSION
} from './agentPersistence';
import { createRequirementState } from './requirementState';
import { TaskState, AuditRecord, ApprovalRequest } from './types';

describe('AgentPersistence', () => {
  let initialRequirementState: ReturnType<typeof createRequirementState>;
  let baseTaskState: TaskState;

  beforeEach(() => {
    initialRequirementState = createRequirementState('Design air fryer heater', 'air-fryer');
    baseTaskState = {
      id: 'task-100',
      status: 'awaiting_specification_approval',
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:00:00.000Z',
      requirementState: initialRequirementState,
      events: [],
      approvals: [],
      pendingActions: [],
      auditHistory: [
        {
          id: 'audit-1',
          timestamp: '2026-09-17T10:00:00.000Z',
          eventType: 'STATE_TRANSITION',
          actor: 'agent',
          details: { from: 'clarifying', to: 'awaiting_specification_approval' }
        }
      ]
    };
  });

  it('serializes and deserializes agent session data with versioning and timestamps', () => {
    const data: AgentPersistenceData = {
      version: AGENT_PERSISTENCE_SCHEMA_VERSION,
      requirementState: initialRequirementState,
      taskState: baseTaskState,
      pendingApprovals: [
        {
          id: 'req-spec-1',
          type: 'specification',
          title: 'Approve Air Fryer Spec',
          description: 'Review thermal requirements',
          status: 'pending',
          createdAt: '2026-09-17T10:00:00.000Z',
          payload: { specId: 'spec-1' }
        }
      ],
      auditTrail: baseTaskState.auditHistory,
      lastSavedAt: '2026-09-17T10:05:00.000Z'
    };

    const serialized = AgentPersistence.serialize(data);
    expect(typeof serialized).toBe('string');
    expect(serialized).toContain(`"version": ${AGENT_PERSISTENCE_SCHEMA_VERSION}`);

    const deserialized = AgentPersistence.deserialize(serialized);
    expect(deserialized.version).toBe(AGENT_PERSISTENCE_SCHEMA_VERSION);
    expect(deserialized.taskState.id).toBe('task-100');
    expect(deserialized.pendingApprovals).toHaveLength(1);
    expect(deserialized.auditTrail).toHaveLength(1);
  });

  it('rejects deserialization of corrupted or incompatible version payloads', () => {
    expect(() => AgentPersistence.deserialize('not-json')).toThrow(/Invalid JSON/);

    const incompatible = JSON.stringify({
      version: 999,
      requirementState: initialRequirementState,
      taskState: baseTaskState,
      pendingApprovals: [],
      auditTrail: []
    });
    expect(() => AgentPersistence.deserialize(incompatible)).toThrow(/Incompatible persistence version/);
  });

  it('marks interrupted executing state as blocked with requires_review on restore and never resumes automatically', () => {
    const executingTask: TaskState = {
      ...baseTaskState,
      status: 'executing'
    };

    const data: AgentPersistenceData = {
      version: AGENT_PERSISTENCE_SCHEMA_VERSION,
      requirementState: initialRequirementState,
      taskState: executingTask,
      pendingApprovals: [],
      auditTrail: executingTask.auditHistory,
      lastSavedAt: '2026-09-17T10:00:00.000Z'
    };

    const restored = AgentPersistence.restoreSafely(data);
    expect(restored.taskState.status).toBe('blocked');
    expect(restored.taskState.blockedReason).toContain('requires_review');
    expect(restored.taskState.blockedReason).toContain('Never resumed automatically');

    const recoveryAudit = restored.auditTrail.find(
      (a: AuditRecord) => a.eventType === 'INTERRUPTED_EXECUTION_DETECTED'
    );
    expect(recoveryAudit).toBeDefined();
    expect(recoveryAudit?.resultStatus).toBe('requires_review');
    expect(recoveryAudit?.details.disposition).toBe('requires_review');
  });

  it('persists action IDs, adapter results, changed-artifact hashes, approval IDs, and evidence references', () => {
    const actionResults = [
      {
        actionId: 'act-101',
        approvalId: 'appr-501',
        projectId: 'req-proj-1',
        adapterKind: 'instantiate_block',
        status: 'success' as const,
        changedArtifactHashes: {
          'xbridges/nodes/node-1.json': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        },
        evidenceReferences: {
          nodeId: 'node-1',
          blockType: 'resistor'
        },
        executedAt: '2026-09-17T10:02:00.000Z',
        durationMs: 42
      }
    ];

    const data: AgentPersistenceData = {
      version: AGENT_PERSISTENCE_SCHEMA_VERSION,
      requirementState: initialRequirementState,
      taskState: baseTaskState,
      pendingApprovals: [],
      actionResults,
      auditTrail: baseTaskState.auditHistory,
      lastSavedAt: '2026-09-17T10:05:00.000Z'
    };

    const serialized = AgentPersistence.serialize(data);
    const deserialized = AgentPersistence.deserialize(serialized);

    expect(deserialized.actionResults).toHaveLength(1);
    const ar = deserialized.actionResults![0];
    expect(ar.actionId).toBe('act-101');
    expect(ar.approvalId).toBe('appr-501');
    expect(ar.adapterKind).toBe('instantiate_block');
    expect(ar.changedArtifactHashes['xbridges/nodes/node-1.json']).toBeDefined();
    expect(ar.evidenceReferences['nodeId']).toBe('node-1');
  });

  it('produces immutable audit records containing actor, project, approval, adapter, and result status', () => {
    const data: AgentPersistenceData = {
      version: AGENT_PERSISTENCE_SCHEMA_VERSION,
      requirementState: initialRequirementState,
      taskState: baseTaskState,
      pendingApprovals: [],
      auditTrail: [
        {
          id: 'audit-sec-1',
          timestamp: '2026-09-17T10:01:00.000Z',
          eventType: 'ACTION_EXECUTION',
          actor: 'agent',
          actionId: 'act-99',
          projectId: 'req-1',
          approvalId: 'appr-1',
          adapter: 'xbridges',
          resultStatus: 'success',
          details: { blockId: 'resistor' }
        }
      ],
      lastSavedAt: '2026-09-17T10:01:00.000Z'
    };

    const restored = AgentPersistence.restoreSafely(data);
    const record = restored.auditTrail[0];
    expect(record.actor).toBe('agent');
    expect(record.actionId).toBe('act-99');
    expect(record.projectId).toBe('req-1');
    expect(record.approvalId).toBe('appr-1');
    expect(record.adapter).toBe('xbridges');
    expect(record.resultStatus).toBe('success');

    // Immutability: attempting to mutate properties throws in strict mode
    expect(() => {
      (record as any).actor = 'user';
    }).toThrow();
  });

  it('invalidates and marks stale pending approval tokens as cancelled on restore', () => {
    const data: AgentPersistenceData = {
      version: AGENT_PERSISTENCE_SCHEMA_VERSION,
      requirementState: initialRequirementState,
      taskState: baseTaskState,
      pendingApprovals: [
        {
          id: 'token-old-1',
          type: 'plan',
          title: 'Pending Plan Approval',
          description: 'Old session plan approval',
          status: 'pending',
          createdAt: '2026-09-17T09:00:00.000Z',
          payload: { planId: 'plan-1' }
        }
      ],
      auditTrail: baseTaskState.auditHistory,
      lastSavedAt: '2026-09-17T09:00:00.000Z'
    };

    const restored = AgentPersistence.restoreSafely(data);
    // Approval tokens from previous sessions must be cancelled or refreshed for safety
    expect(restored.pendingApprovals[0].status).toBe('cancelled');
    expect(restored.taskState.status).toBe('blocked');
    expect(restored.auditTrail.some((a: AuditRecord) => a.eventType === 'APPROVAL_TOKENS_INVALIDATED')).toBe(true);
  });
});
