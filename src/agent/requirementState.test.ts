import { describe, it, expect } from 'vitest';
import {
  createRequirementState,
  createTaskState,
  recordAnswer,
  recordProposal,
  approveProposal,
  transitionState
} from './requirementState';
import { TaskState } from './types';

describe('RequirementState & TaskState Transitions', () => {
  it('should initialize a fresh requirement and task state in clarifying status', () => {
    const task = createTaskState('Design an air fryer', 'air-fryer');
    expect(task.status).toBe('clarifying');
    expect(task.requirementState.objective).toBe('Design an air fryer');
    expect(task.requirementState.targetSystem).toBe('air-fryer');
    expect(task.events).toHaveLength(1);
    expect(task.auditHistory).toHaveLength(1);
    expect(task.events[0].type).toBe('TASK_INITIALIZED');
  });

  it('should record an answer immutably and update answers and audit history', () => {
    const initial = createTaskState('Design an air fryer', 'air-fryer');
    initial.requirementState.openQuestions = ['targetTemp'];

    const updated = recordAnswer(initial, 'targetTemp', '200°C');

    expect(updated).not.toBe(initial);
    expect(updated.requirementState).not.toBe(initial.requirementState);
    expect(updated.requirementState.answers['targetTemp']).toBe('200°C');
    expect(updated.requirementState.openQuestions).not.toContain('targetTemp');
    expect(initial.requirementState.answers['targetTemp']).toBeUndefined();
    expect(updated.events.some(e => e.type === 'ANSWER_RECORDED')).toBe(true);
    expect(updated.auditHistory.some(a => a.eventType === 'ANSWER_RECORDED')).toBe(true);
  });

  it('should record an unapproved proposal/default that is NOT marked approved by default', () => {
    const task = createTaskState('Design an air fryer', 'air-fryer');
    const withProposal = recordProposal(
      task,
      'powerRating',
      '1800W',
      'Default standard heating element wattage'
    );

    expect(withProposal).not.toBe(task);
    const assumption = withProposal.requirementState.assumptions.find(a => a.key === 'powerRating');
    expect(assumption).toBeDefined();
    expect(assumption?.status).toBe('pending_approval');
    expect(assumption?.value).toBe('1800W');
    expect(withProposal.auditHistory.some(a => a.eventType === 'PROPOSAL_RECORDED')).toBe(true);
  });

  it('should explicitly approve a proposal when user provides consent', () => {
    const task = createTaskState('Design an air fryer', 'air-fryer');
    const withProposal = recordProposal(
      task,
      'powerRating',
      '1800W',
      'Default standard heating element wattage'
    );

    const approved = approveProposal(withProposal, 'powerRating');
    const assumption = approved.requirementState.assumptions.find(a => a.key === 'powerRating');
    expect(assumption?.status).toBe('approved');
    expect(approved.auditHistory.some(a => a.eventType === 'PROPOSAL_APPROVED')).toBe(true);
  });

  it('should throw an explicit validation error when attempting to approve a non-existent proposal', () => {
    const task = createTaskState('Design an air fryer', 'air-fryer');
    expect(() => approveProposal(task, 'nonExistentKey')).toThrow(
      /Cannot approve non-existent proposal/
    );
  });

  it('should reject transitioning to specification_ready or awaiting_specification_approval when unapproved assumptions exist', () => {
    const task = createTaskState('Design an air fryer', 'air-fryer');
    const withUnapproved = recordProposal(task, 'tempSensor', 'PT100', 'Standard RTD sensor');

    expect(() =>
      transitionState(withUnapproved, 'specification_ready', 'Requirements gathered')
    ).toThrow(/Cannot mark specification ready: unapproved assumptions pending/);

    expect(() =>
      transitionState(withUnapproved, 'awaiting_specification_approval', 'Requesting spec approval')
    ).toThrow(/Cannot request specification approval/);
  });

  it('should reject transitioning to specification_ready or awaiting_specification_approval when unresolved conflicts exist', () => {
    const task = createTaskState('Design an air fryer', 'air-fryer');
    task.requirementState.conflicts = [
      {
        id: 'conf-1',
        description: 'Target temp 250C exceeds max enclosure rating 200C',
        involvedKeys: ['targetTemp', 'maxTempLimit'],
        resolved: false
      }
    ];

    expect(() =>
      transitionState(task, 'specification_ready', 'Attempting ready with conflict')
    ).toThrow(/unresolved conflicts/);
  });

  it('should reject transitioning to awaiting_specification_approval if open questions remain', () => {
    const task = createTaskState('Design an air fryer', 'air-fryer');
    task.requirementState.openQuestions = ['targetTemp'];

    expect(() =>
      transitionState(task, 'awaiting_specification_approval', 'Requesting approval')
    ).toThrow(/open questions remain/);
  });

  it('should reject illegal direct transitions (e.g. clarifying directly to executing or planning)', () => {
    const task = createTaskState('Design an air fryer', 'air-fryer');
    expect(() => transitionState(task, 'executing', 'Skip to execution')).toThrow(
      /Illegal state transition from clarifying to executing/
    );
    expect(() => transitionState(task, 'planning', 'Skip to planning')).toThrow(
      /Illegal state transition from clarifying to planning/
    );
  });

  it('should allow valid sequential progression through the workflow stages and preserve immutable history', () => {
    let current: TaskState = createTaskState('Design an air fryer', 'air-fryer');

    // 1. Clarifying answers recorded
    current = recordAnswer(current, 'targetTemp', '200°C');
    current = recordAnswer(current, 'maxPower', '1800W');
    current = recordAnswer(current, 'sensor', 'NTC 100k');

    // 2. Propose a default and approve it
    current = recordProposal(current, 'fanSpeed', '2500RPM', 'Standard convection fan speed');
    current = approveProposal(current, 'fanSpeed');

    // 3. Mark specification ready
    current = transitionState(current, 'specification_ready', 'All questions answered');
    expect(current.status).toBe('specification_ready');

    // 4. Move to awaiting specification approval
    current = transitionState(
      current,
      'awaiting_specification_approval',
      'Presenting specification to user'
    );
    expect(current.status).toBe('awaiting_specification_approval');

    // 5. Specification approved -> planning
    current = transitionState(current, 'planning', 'User approved specification');
    expect(current.status).toBe('planning');

    // 6. Move to awaiting plan approval
    current = transitionState(current, 'awaiting_plan_approval', 'Execution plan prepared');
    expect(current.status).toBe('awaiting_plan_approval');

    // 7. Plan approved -> awaiting change approval
    current = transitionState(current, 'awaiting_change_approval', 'Plan approved, change proposed');
    expect(current.status).toBe('awaiting_change_approval');

    // 8. Change approved -> executing
    current = transitionState(current, 'executing', 'User approved change execution');
    expect(current.status).toBe('executing');

    // 9. Execution finished -> validating
    current = transitionState(current, 'validating', 'Execution complete, running validation');
    expect(current.status).toBe('validating');

    // 10. Validation passed -> completed
    current = transitionState(current, 'completed', 'All validation checks passed');
    expect(current.status).toBe('completed');

    // Verify all history preserved
    expect(current.auditHistory.length).toBeGreaterThan(10);
    expect(current.events.length).toBeGreaterThan(8);
  });
});
