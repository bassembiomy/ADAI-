import { describe, it, expect } from 'vitest';
import { createTaskState, recordAnswer, recordProposal, approveProposal } from './requirementState';
import { buildSpecification } from './specificationEngine';

describe('SpecificationEngine', () => {
  function createFullyAnsweredAirFryerTask() {
    let task = createTaskState('Design an air fryer controller', 'air-fryer');
    task = recordAnswer(task, 'targetTemperature', '200°C');
    task = recordAnswer(task, 'powerRating', '1800W');
    task = recordAnswer(task, 'supplyVoltage', '230V AC');
    task = recordAnswer(task, 'temperatureSensor', 'NTC 100k');
    task = recordAnswer(task, 'controlMethod', 'PID');
    task = recordAnswer(task, 'safetyMaxTemperature', '240°C');
    task = recordAnswer(task, 'successCriteria', 'Rise time < 4 min with overshoot < 5°C');
    return task;
  }

  it('builds a complete structured specification when all requirements are satisfied', () => {
    let task = createFullyAnsweredAirFryerTask();
    task = recordProposal(task, 'preheatMode', true, 'Enable preheat cycle on startup');
    task = approveProposal(task, 'preheatMode');

    const spec = buildSpecification(task);

    expect(spec.id).toBeDefined();
    expect(spec.targetSystem).toBe('air-fryer');
    expect(spec.title).toContain('air fryer');
    expect(spec.approved).toBe(false);

    expect(spec.requirements.length).toBeGreaterThanOrEqual(6);
    const tempReq = spec.requirements.find(r => r.sourceAnswerKey === 'targetTemperature');
    expect(tempReq).toBeDefined();
    expect(tempReq?.value).toBe('200°C');
    expect(tempReq?.id).toMatch(/^REQ-/);

    expect(spec.assumptions).toHaveLength(1);
    expect(spec.assumptions[0].key).toBe('preheatMode');
    expect(spec.assumptions[0].status).toBe('approved');

    expect(spec.safetyLimits).toContain('240°C');
    expect(spec.successCriteria).toContain('Rise time < 4 min with overshoot < 5°C');
  });

  it('rejects building specification if unapproved assumptions exist', () => {
    let task = createFullyAnsweredAirFryerTask();
    task = recordProposal(task, 'fanSpeed', '2500RPM', 'Convection fan default');

    expect(() => buildSpecification(task)).toThrow(
      /Cannot build specification: unapproved assumptions remain/
    );
  });

  it('rejects building specification if unresolved conflicts exist', () => {
    let task = createFullyAnsweredAirFryerTask();
    task.requirementState.conflicts = [
      {
        id: 'conf-1',
        description: 'Power rating exceeds 10A socket limit',
        involvedKeys: ['powerRating'],
        resolved: false
      }
    ];

    expect(() => buildSpecification(task)).toThrow(
      /Cannot build specification: unresolved conflicts exist/
    );
  });

  it('rejects building specification if requirements are incomplete', () => {
    const task = createTaskState('Design an air fryer', 'air-fryer');
    expect(() => buildSpecification(task)).toThrow(
      /Cannot build specification: requirements are incomplete/
    );
  });
});
