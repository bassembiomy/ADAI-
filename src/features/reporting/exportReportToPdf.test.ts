import { describe, it, expect } from 'vitest';
import { exportReportToPdf } from './exportReportToPdf';
import type { ReportDocument } from './reportDocumentModel';

const mockDoc: ReportDocument = {
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
    rootCauses: ['Cause A', 'Cause B'],
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
  consistency: {
    revision: 'rev-0',
    removedRelationshipIds: [],
    removedConnectorIds: [],
    errors: [],
  },
};

describe('exportReportToPdf', () => {
  it('generates a jsPDF instance with multiple pages and proper styling', () => {
    const pdf = exportReportToPdf(mockDoc);
    expect(pdf).toBeDefined();
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const pdfOutput = pdf.output('arraybuffer');
    expect(pdfOutput.byteLength).toBeGreaterThan(1000);
  });

  it('includes report consistency metadata in the PDF output', () => {
    const pdf = exportReportToPdf({
      ...mockDoc,
      consistency: {
        revision: 'rev-1',
        removedRelationshipIds: ['rel-1'],
        removedConnectorIds: [],
        errors: [],
      },
    });
    const text = pdf.internal.pages.flat().join(' ');
    expect(text).toContain('rev-1');
    expect(text).toContain('rel-1');
  });
});
