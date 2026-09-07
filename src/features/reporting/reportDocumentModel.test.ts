import { describe, it, expect } from 'vitest';
import { validateReportDocument, type ReportDocument } from './reportDocumentModel';

describe('ReportDocumentModel', () => {
  it('validates a complete, correctly formatted report document', () => {
    const validDoc: ReportDocument = {
      header: {
        systemTitle: 'BLDC/PMSM Ceiling-Fan Motor',
        documentTitle: 'Test and Fault-Isolation Procedure',
        subtitle: 'Controlled test sequence and decision matrix',
        primaryObjective: 'Determine whether speed limitation is caused by aerodynamic load.',
        status: 'Test-ready draft',
        safetyClassification: 'Rotating machinery - guarded testing required',
        runningHeader: 'BLDC/PMSM Fan Drive - Verification Procedure',
      },
      safetyGate: {
        title: '1. Test Logic and Safety Gate',
        description: 'Tests shall be performed in sequence.',
        stopTestRule: 'Stop immediately for abnormal vibration.',
        rootCauses: ['Higher aerodynamic torque', 'Motor continuous torque below requirement'],
      },
      requiredDataAndSignals: {
        requiredEquipment: ['Calibrated tachometer', 'Isolated oscilloscope'],
        requiredPreconditions: ['Motor type and pole pairs configured'],
        signalsTable: [
          { signalGroup: 'Speed', signalsToLog: 'Commanded mechanical speed, tachometer speed' },
        ],
        currentRatingRule: 'Do not compare nameplate current directly with Iq.',
      },
      testProcedures: [
        {
          id: 'T01',
          badgeLabel: 'T01',
          title: 'Sensor Offset and Scaling Verification',
          purpose: 'Verify current, voltage, and speed feedback.',
          procedure: ['Disable PWM', 'Log raw current channels'],
          record: ['Raw/offset-corrected currents'],
          acceptanceCriteria: ['Current gain meets calibration spec'],
          decisionRule: 'Any failure invalidates later torque conclusions.',
        },
      ],
      decisionMatrix: {
        title: '4. Fault-Isolation Decision Matrix',
        rows: [
          {
            observedResult: 'Cannot reach target RPM',
            probableCause: 'Feedback or inverter fault',
            confirmWith: 'T01, T02',
            requiredAction: 'Correct sensing or voltage limitation.',
          },
        ],
      },
      finalDecisionCriteria: {
        title: '5. Final Engineering Decision Criteria',
        classifications: [
          {
            title: 'Classify inverter model as primary cause when:',
            criteria: ['Incorrect current/speed scaling', 'Poor tracking'],
          },
        ],
        releaseCondition: 'Do not authorize higher current until verified.',
      },
      consistency: {
        revision: 'rev_test_123',
        removedRelationshipIds: [],
        removedConnectorIds: [],
        errors: [],
      },
    };

    expect(validateReportDocument(validDoc)).toBe(true);
  });

  it('rejects an invalid document missing essential fields', () => {
    const invalidDoc = {} as ReportDocument;
    expect(validateReportDocument(invalidDoc)).toBe(false);
  });

  it('rejects a document missing consistency metadata', () => {
    const docWithoutConsistency = {
      header: { documentTitle: 'Title', primaryObjective: 'Objective' },
      safetyGate: { stopTestRule: 'Rule' },
      testProcedures: [{ id: '1' }],
      decisionMatrix: { rows: [] },
      finalDecisionCriteria: { releaseCondition: 'Condition' },
    };
    expect(validateReportDocument(docWithoutConsistency)).toBe(false);
  });
});

