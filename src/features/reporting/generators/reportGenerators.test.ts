import { describe, it, expect } from 'vitest';
import { createStateMachineVerificationReport } from './createStateMachineVerificationReport';
import { createMotorDriveTestReport } from './createMotorDriveTestReport';

describe('Report Generators', () => {
  it('creates a compliant ReportDocument for State Machine verification', () => {
    const doc = createStateMachineVerificationReport({
      modelName: 'Motor_FSM',
      reachabilityPercent: 100,
      stateCount: 5,
      transitionCount: 8,
      reachableStates: ['IDLE', 'RUNNING', 'BRAKING'],
      unreachableStates: [],
      hasDeadlocks: false,
    });

    expect(doc.header.documentTitle).toContain('Verification');
    expect(doc.testProcedures.length).toBeGreaterThan(0);
    expect(doc.decisionMatrix.rows.length).toBeGreaterThan(0);
  });

  it('creates a compliant ReportDocument for Motor Drive & Fault Isolation', () => {
    const doc = createMotorDriveTestReport({
      motorType: 'BLDC/PMSM Ceiling-Fan Motor',
      targetRpm: 280,
      bladeType: 'Plastic Blade vs. Metal Blade',
    });

    expect(doc.header.systemTitle).toContain('BLDC/PMSM');
    expect(doc.testProcedures.some((t) => t.id === 'T01')).toBe(true);
    expect(doc.decisionMatrix.rows.length).toBeGreaterThan(5);
  });
});
