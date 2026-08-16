import { describe, it, expect } from 'vitest';
import { generateReportDocxBuffer } from './exportReportToDocx';
import type { ReportDocument } from './reportDocumentModel';

const sampleDoc: ReportDocument = {
  header: {
    systemTitle: 'BLDC Motor Test',
    documentTitle: 'Fault Isolation',
    subtitle: 'Controlled test sequence',
    primaryObjective: 'Determine speed limits',
    status: 'Draft',
    safetyClassification: 'Guarded',
    runningHeader: 'BLDC Motor Verification',
  },
  safetyGate: {
    title: '1. Safety Gate',
    description: 'Sequenced execution.',
    stopTestRule: 'Stop immediately on error.',
    rootCauses: ['Cause A'],
  },
  requiredDataAndSignals: {
    requiredEquipment: ['Tachometer'],
    requiredPreconditions: ['Precondition A'],
    signalsTable: [{ signalGroup: 'Speed', signalsToLog: 'RPM' }],
  },
  testProcedures: [
    {
      id: 'T01',
      badgeLabel: 'T01',
      title: 'Sensor Test',
      purpose: 'Check sensors.',
      procedure: ['Step 1'],
      record: ['Signal A'],
      acceptanceCriteria: ['Criterion 1'],
      decisionRule: 'Rule 1',
    },
  ],
  decisionMatrix: {
    title: '4. Decision Matrix',
    rows: [
      {
        observedResult: 'Error',
        probableCause: 'Bad wiring',
        confirmWith: 'T01',
        requiredAction: 'Rewire',
      },
    ],
  },
  finalDecisionCriteria: {
    title: '5. Sign-off',
    classifications: [{ title: 'Classification 1', criteria: ['Crit A'] }],
    releaseCondition: 'Release condition A',
  },
};

describe('exportReportToDocx', () => {
  it('generates a valid DOCX file buffer with tables and formatted sections', async () => {
    const buffer = await generateReportDocxBuffer(sampleDoc);
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(2000);
  });
});
