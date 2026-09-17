import { describe, it, expect } from 'vitest';
import { buildExecutionPlan, createChangeApprovalRequest } from './planEngine';
import { EngineeringSpecification } from './specificationEngine';
import { approve, createApprovalRequest } from './approvalGate';

describe('PlanEngine', () => {
  const sampleSpec: EngineeringSpecification = {
    id: 'spec-af-1',
    taskId: 'task-1',
    title: 'Air Fryer Specification',
    targetSystem: 'air-fryer',
    requirements: [
      {
        id: 'REQ-001',
        category: 'thermal',
        description: 'Chamber heating target 200°C',
        sourceAnswerKey: 'targetTemperature',
        value: '200°C'
      },
      {
        id: 'REQ-002',
        category: 'electrical',
        description: '1800W heating resistor element',
        sourceAnswerKey: 'powerRating',
        value: '1800W'
      }
    ],
    assumptions: [],
    safetyLimits: ['240°C'],
    successCriteria: ['Reach 200°C in under 4 minutes'],
    approved: false,
    createdAt: '2026-09-17T10:00:00.000Z'
  };

  it('rejects plan creation if specification is not yet approved', () => {
    expect(() => buildExecutionPlan(sampleSpec)).toThrow(
      /Cannot construct execution plan: specification 'spec-af-1' must be approved first/
    );
  });

  it('builds an execution plan with ordered actions, dependencies, evidence, and rollback metadata when spec is approved', () => {
    const approvedSpec: EngineeringSpecification = {
      ...sampleSpec,
      approved: true
    };

    const plan = buildExecutionPlan(approvedSpec);

    expect(plan.id).toMatch(/^plan-/);
    expect(plan.specificationId).toBe('spec-af-1');
    expect(plan.actions.length).toBeGreaterThanOrEqual(4);
    expect(plan.approved).toBe(false);

    // Verify ordering and dependencies
    const actions = plan.actions;
    for (let i = 0; i < actions.length; i++) {
      expect(actions[i].order).toBe(i + 1);
      expect(actions[i].affectedArtifacts.length).toBeGreaterThan(0);
      expect(actions[i].expectedEvidence).toBeDefined();
      expect(actions[i].rollbackMetadata).toBeDefined();
    }

    // First action has no dependencies; subsequent have prior IDs as dependencies
    expect(actions[0].dependencies).toEqual([]);
    expect(actions[1].dependencies).toContain(actions[0].id);
  });

  it('rejects emitting change approval requests if plan itself is not approved', () => {
    const approvedSpec = { ...sampleSpec, approved: true };
    const plan = buildExecutionPlan(approvedSpec);

    expect(() => createChangeApprovalRequest(plan, plan.actions[0].id)).toThrow(
      /Cannot create change approval: plan '.*' must be approved first/
    );
  });

  it('creates an action-specific change approval request once plan is approved', () => {
    const approvedSpec = { ...sampleSpec, approved: true };
    const plan = buildExecutionPlan(approvedSpec);
    plan.approved = true;

    const changeReq = createChangeApprovalRequest(plan, plan.actions[0].id);
    expect(changeReq.type).toBe('change');
    expect(changeReq.status).toBe('pending');
    expect(changeReq.payload['actionId']).toBe(plan.actions[0].id);
  });
});
