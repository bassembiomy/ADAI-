import { describe, it, expect } from 'vitest';
import { createTaskState, recordAnswer, recordProposal, approveProposal } from './requirementState';
import { analyzeCompleteness, ClarificationEngine } from './clarificationEngine';

describe('ClarificationEngine', () => {
  it('detects missing air-fryer required parameters in priority order and returns exactly one question', () => {
    const task = createTaskState('Create an air-fryer control system', 'air-fryer');

    // Turn 1: Fresh state -> highest priority missing item is target temperature
    const res1 = analyzeCompleteness(task);
    expect(res1.status).toBe('question');
    if (res1.status === 'question') {
      expect(res1.missingKey).toBe('targetTemperature');
      expect(res1.question.question).toMatch(/temperature/i);
      expect(res1.completenessScore).toBeLessThan(0.3);
    }

    // Answer target temperature
    const task2 = recordAnswer(task, 'targetTemperature', '200°C');
    const res2 = analyzeCompleteness(task2);
    expect(res2.status).toBe('question');
    if (res2.status === 'question') {
      // Next priority: powerRating
      expect(res2.missingKey).toBe('powerRating');
      expect(res2.question.question).toMatch(/power/i);
    }

    // Answer powerRating
    const task3 = recordAnswer(task2, 'powerRating', '1800W');
    const res3 = analyzeCompleteness(task3);
    expect(res3.status).toBe('question');
    if (res3.status === 'question') {
      // Next priority: supplyVoltage
      expect(res3.missingKey).toBe('supplyVoltage');
    }
  });

  it('detects conflicting requirements and returns status conflict', () => {
    let task = createTaskState('Create an air-fryer control system', 'air-fryer');
    task = recordAnswer(task, 'targetTemperature', '260°C');
    task = recordAnswer(task, 'safetyMaxTemperature', '240°C');

    const result = analyzeCompleteness(task);
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.conflict.description).toMatch(/exceeds/i);
      expect(result.conflict.involvedKeys).toContain('targetTemperature');
      expect(result.conflict.involvedKeys).toContain('safetyMaxTemperature');
    }
  });

  it('identifies unapproved defaults/proposals as incomplete until approved', () => {
    let task = createTaskState('Create an air-fryer control system', 'air-fryer');
    task = recordAnswer(task, 'targetTemperature', '200°C');
    task = recordAnswer(task, 'powerRating', '1800W');
    task = recordAnswer(task, 'supplyVoltage', '230V AC');
    task = recordAnswer(task, 'temperatureSensor', 'NTC 100k');
    task = recordAnswer(task, 'controlMethod', 'PID');
    task = recordAnswer(task, 'safetyMaxTemperature', '240°C');
    task = recordAnswer(task, 'successCriteria', 'Heat to 200°C in under 4 mins');

    // Add an unapproved assumption
    task = recordProposal(task, 'fanSpeed', '2500RPM', 'Standard convection fan speed');

    const result = analyzeCompleteness(task);
    expect(result.status).toBe('question');
    if (result.status === 'question') {
      expect(result.missingKey).toBe('unapproved_fanSpeed');
      expect(result.question.recommendedDefault).toBe('2500RPM');
      expect(result.question.question).toMatch(/fan speed/i);
    }

    // Now approve the proposal
    const approvedTask = approveProposal(task, 'fanSpeed');
    const approvedResult = analyzeCompleteness(approvedTask);
    expect(approvedResult.status).toBe('complete');
    if (approvedResult.status === 'complete') {
      expect(approvedResult.completenessScore).toBe(1.0);
    }
  });

  it('returns complete with score 1.0 when all air-fryer required parameters are answered and valid', () => {
    let task = createTaskState('Create an air-fryer control system', 'air-fryer');
    task = recordAnswer(task, 'targetTemperature', '200°C');
    task = recordAnswer(task, 'powerRating', '1800W');
    task = recordAnswer(task, 'supplyVoltage', '230V AC');
    task = recordAnswer(task, 'temperatureSensor', 'NTC 100k');
    task = recordAnswer(task, 'controlMethod', 'PID');
    task = recordAnswer(task, 'safetyMaxTemperature', '240°C');
    task = recordAnswer(task, 'successCriteria', 'Rise time < 4 min with overshoot < 5°C');

    const result = analyzeCompleteness(task);
    expect(result.status).toBe('complete');
    if (result.status === 'complete') {
      expect(result.completenessScore).toBe(1.0);
    }
  });
});
