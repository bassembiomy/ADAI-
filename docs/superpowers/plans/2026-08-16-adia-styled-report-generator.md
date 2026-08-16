# ADIA Styled Engineering Report Generator (.pdf & .docx) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, publication-grade engineering report generation system in ADIA that outputs vector PDFs, editable Word `.docx` documents, and an in-app styled preview directly replicating the layout, typography, callouts, and decision matrix of the reference standard.

**Architecture:** A unified `ReportDocument` semantic model serves as the single source of truth for both Vector PDF (jsPDF) and Word `.docx` (docx library) exporters, as well as a live React modal (`ReportViewerModal`) with zoom, pagination, and print styling. Domain-specific builders generate standardized reports for State Machine verification and Motor/Plant tests.

**Tech Stack:** TypeScript, React, jsPDF, docx, Tailwind CSS / Vanilla CSS print styling, Vitest.

## Global Constraints
- Primary Navy header color: `#0f3b57` / `#163b5c`
- Teal accent color: `#2b7a9e` / `#0e637a`
- Warning / Decision amber background: `#fff9e6`, border: `#c89234`, text: `#734c00`
- Objective blue background: `#f0f7fc`, border: `#2b7a9e`
- Document format: Standard A4 portrait with 18mm margins, running header, and `Page N` footer
- Test card badges: rounded badge with `#0e637a` fill and white bold text

---

### Task 1: Report Document Data Model & Schema

**Files:**
- Create: `src/features/reporting/reportDocumentModel.ts`
- Test: `src/features/reporting/reportDocumentModel.test.ts`

**Interfaces:**
- Consumes: None (pure data model)
- Produces: `ReportDocument`, `ReportTestProcedure`, `ReportDecisionMatrixRow`, `ReportSignalGroup`, `validateReportDocument(doc: ReportDocument): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/reporting/reportDocumentModel.test.ts
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
    };

    expect(validateReportDocument(validDoc)).toBe(true);
  });

  it('rejects an invalid document missing essential fields', () => {
    const invalidDoc = {} as ReportDocument;
    expect(validateReportDocument(invalidDoc)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/reportDocumentModel.test.ts`
Expected: FAIL with module/function not found

- [ ] **Step 3: Implement data model and validation**

```typescript
// src/features/reporting/reportDocumentModel.ts
export interface ReportHeader {
  systemTitle: string;
  documentTitle: string;
  subtitle: string;
  primaryObjective: string;
  status: string;
  safetyClassification: string;
  runningHeader: string;
}

export interface ReportSafetyGate {
  title: string;
  description: string;
  stopTestRule: string;
  rootCauses: string[];
}

export interface ReportSignalRow {
  signalGroup: string;
  signalsToLog: string;
}

export interface ReportRequiredData {
  requiredEquipment: string[];
  requiredPreconditions: string[];
  signalsTable: ReportSignalRow[];
  currentRatingRule?: string;
}

export interface ReportTestProcedure {
  id: string;
  badgeLabel?: string;
  title: string;
  purpose: string;
  procedure: string[];
  record: string[];
  acceptanceCriteria: string[];
  decisionRule: string;
}

export interface ReportDecisionMatrixRow {
  observedResult: string;
  probableCause: string;
  confirmWith: string;
  requiredAction: string;
}

export interface ReportDecisionMatrix {
  title: string;
  rows: ReportDecisionMatrixRow[];
}

export interface ReportClassification {
  title: string;
  criteria: string[];
}

export interface ReportFinalDecision {
  title: string;
  classifications: ReportClassification[];
  releaseCondition: string;
}

export interface ReportDocument {
  header: ReportHeader;
  safetyGate: ReportSafetyGate;
  requiredDataAndSignals: ReportRequiredData;
  testProcedures: ReportTestProcedure[];
  decisionMatrix: ReportDecisionMatrix;
  finalDecisionCriteria: ReportFinalDecision;
}

export function validateReportDocument(doc: any): doc is ReportDocument {
  if (!doc || typeof doc !== 'object') return false;
  if (!doc.header?.documentTitle || !doc.header?.primaryObjective) return false;
  if (!doc.safetyGate?.stopTestRule) return false;
  if (!Array.isArray(doc.testProcedures) || doc.testProcedures.length === 0) return false;
  if (!Array.isArray(doc.decisionMatrix?.rows)) return false;
  if (!doc.finalDecisionCriteria?.releaseCondition) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/reportDocumentModel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/reportDocumentModel.ts src/features/reporting/reportDocumentModel.test.ts
git commit -m "feat(reporting): add ReportDocument model and validator"
```

---

### Task 2: Vector PDF Exporter (`exportReportToPdf`)

**Files:**
- Create: `src/features/reporting/exportReportToPdf.ts`
- Test: `src/features/reporting/exportReportToPdf.test.ts`

**Interfaces:**
- Consumes: `ReportDocument` from `reportDocumentModel.ts`
- Produces: `exportReportToPdf(doc: ReportDocument): jsPDF`, `saveReportAsPdf(doc: ReportDocument, filename?: string): void`

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/reporting/exportReportToPdf.test.ts
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
};

describe('exportReportToPdf', () => {
  it('generates a jsPDF instance with multiple pages and proper styling', () => {
    const pdf = exportReportToPdf(mockDoc);
    expect(pdf).toBeDefined();
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const pdfOutput = pdf.output('arraybuffer');
    expect(pdfOutput.byteLength).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/exportReportToPdf.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement exportReportToPdf**

```typescript
// src/features/reporting/exportReportToPdf.ts
import { jsPDF } from 'jspdf';
import type { ReportDocument } from './reportDocumentModel';

const NAVY = [15, 59, 87] as const; // #0f3b57
const TEAL = [43, 122, 158] as const; // #2b7a9e
const BADGE_BG = [14, 99, 122] as const; // #0e637a
const TEXT_DARK = [30, 41, 59] as const; // #1e293b
const MUTED = [100, 116, 139] as const;
const BG_CALLOUT_BLUE = [240, 247, 252] as const;
const BG_CALLOUT_AMBER = [255, 249, 230] as const;
const BORDER_AMBER = [200, 146, 52] as const;

export function exportReportToPdf(doc: ReportDocument): jsPDF {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const drawHeaderFooter = (pageNumber: number, totalPages: number) => {
    if (pageNumber > 1) {
      pdf.setFontSize(8);
      pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      pdf.setFont('helvetica', 'normal');
      pdf.text(doc.header.runningHeader || doc.header.documentTitle, margin, 12);
      pdf.setDrawColor(220, 226, 235);
      pdf.setLineWidth(0.3);
      pdf.line(margin, 14, pageWidth - margin, 14);
    }
    pdf.setFontSize(8);
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    pdf.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 12) {
      pdf.addPage();
      y = margin;
    }
  };

  // --- PAGE 1: COVER / TITLE ---
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.text(doc.header.systemTitle, margin, y + 40);
  y += 50;

  pdf.setFontSize(18);
  pdf.text(doc.header.documentTitle, margin, y);
  y += 10;

  // Teal divider
  pdf.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
  pdf.setLineWidth(1.2);
  pdf.line(margin, y, margin + 80, y);
  y += 8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  pdf.text(doc.header.subtitle, margin, y);
  y += 18;

  // Primary Objective Callout Box
  const objLines = pdf.splitTextToSize(doc.header.primaryObjective, contentWidth - 8);
  const boxHeight = objLines.length * 5.5 + 10;
  pdf.setFillColor(BG_CALLOUT_BLUE[0], BG_CALLOUT_BLUE[1], BG_CALLOUT_BLUE[2]);
  pdf.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.text('Primary objective:', margin + 4, y + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  pdf.text(objLines, margin + 4, y + 12);
  y += boxHeight + 20;

  pdf.setFontSize(9);
  pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  pdf.text(`Document status: ${doc.header.status}`, margin, y);
  y += 6;
  pdf.text(`Safety classification: ${doc.header.safetyClassification}`, margin, y);

  // --- PAGE 2: SAFETY GATE & EQUIPMENT ---
  pdf.addPage();
  y = margin;

  // Section 1
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.text(doc.safetyGate.title, margin, y);
  y += 8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  const descLines = pdf.splitTextToSize(doc.safetyGate.description, contentWidth);
  pdf.text(descLines, margin, y);
  y += descLines.length * 5 + 4;

  // Stop test rule box
  const stopRuleLines = pdf.splitTextToSize(`Stop-test rule: ${doc.safetyGate.stopTestRule}`, contentWidth - 8);
  const stopBoxHeight = stopRuleLines.length * 5 + 6;
  pdf.setFillColor(BG_CALLOUT_AMBER[0], BG_CALLOUT_AMBER[1], BG_CALLOUT_AMBER[2]);
  pdf.setDrawColor(BORDER_AMBER[0], BORDER_AMBER[1], BORDER_AMBER[2]);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(margin, y, contentWidth, stopBoxHeight, 1.5, 1.5, 'FD');
  pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  pdf.text(stopRuleLines, margin + 4, y + 5.5);
  y += stopBoxHeight + 8;

  // Root causes
  if (doc.safetyGate.rootCauses && doc.safetyGate.rootCauses.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Potential root causes', margin, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    for (const rc of doc.safetyGate.rootCauses) {
      pdf.text(`•  ${rc}`, margin + 2, y);
      y += 5;
    }
    y += 6;
  }

  // Section 2: Required Equipment & Signals
  checkPageBreak(50);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.text('2. Required Equipment and Data', margin, y);
  y += 7;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Required equipment', margin, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  for (const eq of doc.requiredDataAndSignals.requiredEquipment) {
    pdf.text(`•  ${eq}`, margin + 2, y);
    y += 5;
  }
  y += 4;

  // Signals Table
  const col1Width = 45;
  const col2Width = contentWidth - col1Width;
  pdf.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.rect(margin, y, contentWidth, 7, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Signal group', margin + 3, y + 4.8);
  pdf.text('Signals to log synchronously', margin + col1Width + 3, y + 4.8);
  y += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  doc.requiredDataAndSignals.signalsTable.forEach((row, idx) => {
    const lines = pdf.splitTextToSize(row.signalsToLog, col2Width - 6);
    const rowH = Math.max(7, lines.length * 4.5 + 3);
    checkPageBreak(rowH);
    if (idx % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y, contentWidth, rowH, 'F');
    }
    pdf.setDrawColor(203, 213, 225);
    pdf.rect(margin, y, contentWidth, rowH, 'S');
    pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    pdf.text(row.signalGroup, margin + 3, y + 4.8);
    pdf.text(lines, margin + col1Width + 3, y + 4.8);
    y += rowH;
  });
  y += 8;

  // --- SECTION 3: TEST PROCEDURES ---
  checkPageBreak(60);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.text('3. Detailed Test Procedures', margin, y);
  y += 8;

  for (const proc of doc.testProcedures) {
    checkPageBreak(65);
    // Badge and title
    pdf.setFillColor(BADGE_BG[0], BADGE_BG[1], BADGE_BG[2]);
    pdf.roundedRect(margin, y, 16, 6, 1, 1, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(proc.badgeLabel || proc.id, margin + 8, y + 4.2, { align: 'center' });

    pdf.setFontSize(11);
    pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    pdf.text(proc.title, margin + 20, y + 4.5);
    y += 9;

    // Purpose
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    pdf.text(`Purpose. ${proc.purpose}`, margin, y);
    y += 6;

    // Procedure
    pdf.setFont('helvetica', 'bold');
    pdf.text('Procedure', margin, y);
    y += 4.5;
    pdf.setFont('helvetica', 'normal');
    proc.procedure.forEach((step, sIdx) => {
      pdf.text(`${sIdx + 1}.  ${step}`, margin + 2, y);
      y += 4.5;
    });

    // Record
    pdf.setFont('helvetica', 'bold');
    pdf.text('Record', margin, y);
    y += 4.5;
    pdf.setFont('helvetica', 'normal');
    proc.record.forEach((rec) => {
      pdf.text(`•  ${rec}`, margin + 2, y);
      y += 4.5;
    });

    // Acceptance criteria
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    pdf.text('Acceptance criteria', margin, y);
    y += 4.5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    proc.acceptanceCriteria.forEach((crit) => {
      pdf.text(`•  ${crit}`, margin + 2, y);
      y += 4.5;
    });
    y += 2;

    // Decision rule box
    const decRuleLines = pdf.splitTextToSize(`Decision rule: ${proc.decisionRule}`, contentWidth - 8);
    const decBoxHeight = decRuleLines.length * 4.5 + 5;
    pdf.setFillColor(BG_CALLOUT_BLUE[0], BG_CALLOUT_BLUE[1], BG_CALLOUT_BLUE[2]);
    pdf.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
    pdf.roundedRect(margin, y, contentWidth, decBoxHeight, 1.5, 1.5, 'FD');
    pdf.text(decRuleLines, margin + 4, y + 4.5);
    y += decBoxHeight + 8;
  }

  // --- SECTION 4: DECISION MATRIX ---
  checkPageBreak(70);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.text(doc.decisionMatrix.title, margin, y);
  y += 8;

  // Table columns
  const mCol1 = 45;
  const mCol2 = 45;
  const mCol3 = 25;
  const mCol4 = contentWidth - mCol1 - mCol2 - mCol3;

  pdf.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.rect(margin, y, contentWidth, 7, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Observed result', margin + 2, y + 4.8);
  pdf.text('Most probable cause', margin + mCol1 + 2, y + 4.8);
  pdf.text('Confirm with', margin + mCol1 + mCol2 + 2, y + 4.8);
  pdf.text('Required action', margin + mCol1 + mCol2 + mCol3 + 2, y + 4.8);
  y += 7;

  pdf.setFont('helvetica', 'normal');
  doc.decisionMatrix.rows.forEach((row, idx) => {
    const l1 = pdf.splitTextToSize(row.observedResult, mCol1 - 4);
    const l2 = pdf.splitTextToSize(row.probableCause, mCol2 - 4);
    const l3 = pdf.splitTextToSize(row.confirmWith, mCol3 - 4);
    const l4 = pdf.splitTextToSize(row.requiredAction, mCol4 - 4);
    const rowH = Math.max(7, Math.max(l1.length, l2.length, l3.length, l4.length) * 4 + 3);

    checkPageBreak(rowH);
    if (idx % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y, contentWidth, rowH, 'F');
    }
    pdf.setDrawColor(203, 213, 225);
    pdf.rect(margin, y, contentWidth, rowH, 'S');
    pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    pdf.text(l1, margin + 2, y + 4);
    pdf.text(l2, margin + mCol1 + 2, y + 4);
    pdf.text(l3, margin + mCol1 + mCol2 + 2, y + 4);
    pdf.text(l4, margin + mCol1 + mCol2 + mCol3 + 2, y + 4);
    y += rowH;
  });
  y += 8;

  // --- SECTION 5: FINAL CRITERIA & RELEASE ---
  checkPageBreak(60);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.text(doc.finalDecisionCriteria.title, margin, y);
  y += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  for (const cls of doc.finalDecisionCriteria.classifications) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(cls.title, margin, y);
    y += 4.5;
    pdf.setFont('helvetica', 'normal');
    for (const c of cls.criteria) {
      pdf.text(`•  ${c}`, margin + 2, y);
      y += 4.5;
    }
    y += 3;
  }

  // Release condition box
  const relLines = pdf.splitTextToSize(`Release condition: ${doc.finalDecisionCriteria.releaseCondition}`, contentWidth - 8);
  const relBoxHeight = relLines.length * 4.5 + 6;
  pdf.setFillColor(BG_CALLOUT_AMBER[0], BG_CALLOUT_AMBER[1], BG_CALLOUT_AMBER[2]);
  pdf.setDrawColor(BORDER_AMBER[0], BORDER_AMBER[1], BORDER_AMBER[2]);
  pdf.roundedRect(margin, y, contentWidth, relBoxHeight, 1.5, 1.5, 'FD');
  pdf.text(relLines, margin + 4, y + 4.5);

  // Apply running headers and footers to all pages
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawHeaderFooter(i, totalPages);
  }

  return pdf;
}

export function saveReportAsPdf(doc: ReportDocument, filename = 'ADIA_Engineering_Report.pdf') {
  const pdf = exportReportToPdf(doc);
  pdf.save(filename);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/exportReportToPdf.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/exportReportToPdf.ts src/features/reporting/exportReportToPdf.test.ts
git commit -m "feat(reporting): add vector jsPDF exportReportToPdf"
```

---

### Task 3: Word Document (.docx) Exporter (`exportReportToDocx`)

**Files:**
- Create: `src/features/reporting/exportReportToDocx.ts`
- Test: `src/features/reporting/exportReportToDocx.test.ts`

**Interfaces:**
- Consumes: `ReportDocument` from `reportDocumentModel.ts`
- Produces: `generateReportDocxBuffer(doc: ReportDocument): Promise<Uint8Array>`, `saveReportAsDocx(doc: ReportDocument, filename?: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/reporting/exportReportToDocx.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/exportReportToDocx.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement exportReportToDocx**

```typescript
// src/features/reporting/exportReportToDocx.ts
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  ShadingType,
  AlignmentType,
} from 'docx';
import type { ReportDocument } from './reportDocumentModel';

const NAVY_HEX = '0F3B57';
const TEAL_HEX = '2B7A9E';
const LIGHT_BLUE_HEX = 'EEF6FB';
const AMBER_BG_HEX = 'FFF9E6';
const AMBER_BORDER_HEX = 'C89234';
const ZEBRA_ROW_HEX = 'F8FAFC';

export async function generateReportDocxBuffer(doc: ReportDocument): Promise<Uint8Array> {
  const docx = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: doc.header.runningHeader || doc.header.documentTitle,
                    size: 16,
                    color: '64748B',
                  }),
                ],
                alignment: AlignmentType.LEFT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        children: [
          // Title
          new Paragraph({
            children: [
              new TextRun({
                text: doc.header.systemTitle,
                bold: true,
                size: 36,
                color: NAVY_HEX,
              }),
            ],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: doc.header.documentTitle,
                bold: true,
                size: 32,
                color: NAVY_HEX,
              }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: doc.header.subtitle,
                size: 20,
                color: '64748B',
              }),
            ],
            spacing: { after: 300 },
          }),

          // Objective Callout Box (Single cell table)
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: LIGHT_BLUE_HEX, type: ShadingType.CLEAR },
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 8, color: TEAL_HEX },
                      bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL_HEX },
                      left: { style: BorderStyle.SINGLE, size: 8, color: TEAL_HEX },
                      right: { style: BorderStyle.SINGLE, size: 8, color: TEAL_HEX },
                    },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'Primary objective: ', bold: true, size: 19, color: NAVY_HEX }),
                          new TextRun({ text: doc.header.primaryObjective, size: 19, color: '1E293B' }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Document status: ${doc.header.status}`, size: 18, color: '64748B' }),
            ],
            spacing: { before: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Safety classification: ${doc.header.safetyClassification}`, size: 18, color: '64748B' }),
            ],
            spacing: { after: 400 },
          }),

          // Section 1: Safety Gate
          new Paragraph({
            children: [
              new TextRun({ text: doc.safetyGate.title, bold: true, size: 28, color: NAVY_HEX }),
            ],
            spacing: { before: 300, after: 150 },
          }),
          new Paragraph({
            children: [new TextRun({ text: doc.safetyGate.description, size: 20 })],
            spacing: { after: 150 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: AMBER_BG_HEX, type: ShadingType.CLEAR },
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 8, color: AMBER_BORDER_HEX },
                      bottom: { style: BorderStyle.SINGLE, size: 8, color: AMBER_BORDER_HEX },
                      left: { style: BorderStyle.SINGLE, size: 8, color: AMBER_BORDER_HEX },
                      right: { style: BorderStyle.SINGLE, size: 8, color: AMBER_BORDER_HEX },
                    },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'Stop-test rule: ', bold: true, size: 19, color: '734C00' }),
                          new TextRun({ text: doc.safetyGate.stopTestRule, size: 19, color: '1E293B' }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          // Section 2: Equipment & Signals Table
          new Paragraph({
            children: [
              new TextRun({ text: '2. Required Equipment and Data', bold: true, size: 28, color: NAVY_HEX }),
            ],
            spacing: { before: 400, after: 150 },
          }),
          ...doc.requiredDataAndSignals.requiredEquipment.map((eq) => new Paragraph({
            children: [new TextRun({ text: `• ${eq}`, size: 19 })],
          })),

          new Paragraph({ spacing: { before: 150 } }),

          // Signals Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: NAVY_HEX, type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Signal group', bold: true, color: 'FFFFFF', size: 18 })] })],
                  }),
                  new TableCell({
                    shading: { fill: NAVY_HEX, type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Signals to log synchronously', bold: true, color: 'FFFFFF', size: 18 })] })],
                  }),
                ],
              }),
              ...doc.requiredDataAndSignals.signalsTable.map((row, idx) => new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: idx % 2 === 1 ? ZEBRA_ROW_HEX : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: row.signalGroup, size: 18 })] })],
                  }),
                  new TableCell({
                    shading: { fill: idx % 2 === 1 ? ZEBRA_ROW_HEX : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: row.signalsToLog, size: 18 })] })],
                  }),
                ],
              })),
            ],
          }),

          // Section 3: Procedures
          new Paragraph({
            children: [
              new TextRun({ text: '3. Detailed Test Procedures', bold: true, size: 28, color: NAVY_HEX }),
            ],
            spacing: { before: 400, after: 150 },
          }),
          ...doc.testProcedures.flatMap((proc) => [
            new Paragraph({
              children: [
                new TextRun({ text: `[${proc.badgeLabel || proc.id}] `, bold: true, color: TEAL_HEX, size: 22 }),
                new TextRun({ text: proc.title, bold: true, color: NAVY_HEX, size: 22 }),
              ],
              spacing: { before: 200, after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Purpose. ', bold: true, size: 19 }),
                new TextRun({ text: proc.purpose, size: 19 }),
              ],
            }),
            new Paragraph({ children: [new TextRun({ text: 'Procedure', bold: true, size: 19 })] }),
            ...proc.procedure.map((step, sIdx) => new Paragraph({ children: [new TextRun({ text: `${sIdx + 1}. ${step}`, size: 19 })] })),
            new Paragraph({ children: [new TextRun({ text: 'Record', bold: true, size: 19 })] }),
            ...proc.record.map((rec) => new Paragraph({ children: [new TextRun({ text: `• ${rec}`, size: 19 })] })),
            new Paragraph({ children: [new TextRun({ text: 'Acceptance criteria', bold: true, color: NAVY_HEX, size: 19 })] }),
            ...proc.acceptanceCriteria.map((crit) => new Paragraph({ children: [new TextRun({ text: `• ${crit}`, size: 19 })] })),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      shading: { fill: LIGHT_BLUE_HEX, type: ShadingType.CLEAR },
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 8, color: TEAL_HEX },
                        bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL_HEX },
                        left: { style: BorderStyle.SINGLE, size: 8, color: TEAL_HEX },
                        right: { style: BorderStyle.SINGLE, size: 8, color: TEAL_HEX },
                      },
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: 'Decision rule: ', bold: true, size: 18, color: NAVY_HEX }),
                            new TextRun({ text: proc.decisionRule, size: 18 }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ]),

          // Section 4: Decision Matrix
          new Paragraph({
            children: [
              new TextRun({ text: doc.decisionMatrix.title, bold: true, size: 28, color: NAVY_HEX }),
            ],
            spacing: { before: 400, after: 150 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: NAVY_HEX, type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Observed result', bold: true, color: 'FFFFFF', size: 17 })] })],
                  }),
                  new TableCell({
                    shading: { fill: NAVY_HEX, type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Most probable cause', bold: true, color: 'FFFFFF', size: 17 })] })],
                  }),
                  new TableCell({
                    shading: { fill: NAVY_HEX, type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Confirm with', bold: true, color: 'FFFFFF', size: 17 })] })],
                  }),
                  new TableCell({
                    shading: { fill: NAVY_HEX, type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Required action', bold: true, color: 'FFFFFF', size: 17 })] })],
                  }),
                ],
              }),
              ...doc.decisionMatrix.rows.map((row, idx) => new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: idx % 2 === 1 ? ZEBRA_ROW_HEX : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: row.observedResult, size: 17 })] })],
                  }),
                  new TableCell({
                    shading: { fill: idx % 2 === 1 ? ZEBRA_ROW_HEX : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: row.probableCause, size: 17 })] })],
                  }),
                  new TableCell({
                    shading: { fill: idx % 2 === 1 ? ZEBRA_ROW_HEX : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: row.confirmWith, size: 17 })] })],
                  }),
                  new TableCell({
                    shading: { fill: idx % 2 === 1 ? ZEBRA_ROW_HEX : 'FFFFFF', type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: row.requiredAction, size: 17 })] })],
                  }),
                ],
              })),
            ],
          }),

          // Section 5: Sign-off
          new Paragraph({
            children: [
              new TextRun({ text: doc.finalDecisionCriteria.title, bold: true, size: 28, color: NAVY_HEX }),
            ],
            spacing: { before: 400, after: 150 },
          }),
          ...doc.finalDecisionCriteria.classifications.flatMap((cls) => [
            new Paragraph({
              children: [new TextRun({ text: cls.title, bold: true, size: 19 })],
              spacing: { before: 100 },
            }),
            ...cls.criteria.map((c) => new Paragraph({ children: [new TextRun({ text: `• ${c}`, size: 19 })] })),
          ]),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: AMBER_BG_HEX, type: ShadingType.CLEAR },
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 8, color: AMBER_BORDER_HEX },
                      bottom: { style: BorderStyle.SINGLE, size: 8, color: AMBER_BORDER_HEX },
                      left: { style: BorderStyle.SINGLE, size: 8, color: AMBER_BORDER_HEX },
                      right: { style: BorderStyle.SINGLE, size: 8, color: AMBER_BORDER_HEX },
                    },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'Release condition: ', bold: true, size: 19, color: '734C00' }),
                          new TextRun({ text: doc.finalDecisionCriteria.releaseCondition, size: 19, color: '1E293B' }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toUint8Array(docx);
}

export async function saveReportAsDocx(doc: ReportDocument, filename = 'ADIA_Engineering_Report.docx'): Promise<void> {
  const buffer = await generateReportDocxBuffer(doc);
  const blob = new Blob([buffer as any], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/exportReportToDocx.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/exportReportToDocx.ts src/features/reporting/exportReportToDocx.test.ts
git commit -m "feat(reporting): add Word .docx exporter generateReportDocxBuffer"
```

---

### Task 4: Domain Report Generators (State Machine & Motor Drive)

**Files:**
- Create: `src/features/reporting/generators/createStateMachineVerificationReport.ts`
- Create: `src/features/reporting/generators/createMotorDriveTestReport.ts`
- Test: `src/features/reporting/generators/reportGenerators.test.ts`

**Interfaces:**
- Consumes: `SemanticModel`, `SMAnalysisResult`, `ReportDocument`
- Produces: `createStateMachineVerificationReport(...)`, `createMotorDriveTestReport(...)`

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/reporting/generators/reportGenerators.test.ts
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
      motorType: 'BLDC / PMSM Ceiling-Fan Motor',
      targetRpm: 280,
      bladeType: 'Plastic Blade vs. Metal Blade',
    });

    expect(doc.header.systemTitle).toContain('BLDC/PMSM');
    expect(doc.testProcedures.some((t) => t.id === 'T01')).toBe(true);
    expect(doc.decisionMatrix.rows.length).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reporting/generators/reportGenerators.test.ts`
Expected: FAIL with missing modules

- [ ] **Step 3: Implement domain generators**

```typescript
// src/features/reporting/generators/createStateMachineVerificationReport.ts
import type { ReportDocument } from '../reportDocumentModel';

export interface SMReportOptions {
  modelName: string;
  reachabilityPercent: number;
  stateCount: number;
  transitionCount: number;
  reachableStates: string[];
  unreachableStates: string[];
  hasDeadlocks: boolean;
}

export function createStateMachineVerificationReport(options: SMReportOptions): ReportDocument {
  return {
    header: {
      systemTitle: `ADIA State Machine Suite — ${options.modelName}`,
      documentTitle: 'C-Code Generation & Model Verification Report',
      subtitle: 'Deterministic AST Analysis, Dynamic Traceability & Safety Verification',
      primaryObjective: 'Formally verify finite state machine reachability, absence of deadlock, and equivalence between semantic model and emitted C code.',
      status: options.hasDeadlocks ? 'Verification Blocked' : 'Formal Verification Passed',
      safetyClassification: 'ISO 26262 / IEC 61508 Verification Suite',
      runningHeader: `ADIA Verification Suite — ${options.modelName}`,
    },
    safetyGate: {
      title: '1. Test Logic and Safety Gate',
      description: 'C code generation and binary execution shall be halted immediately upon detection of unreachable safety states or unconditional self-loops.',
      stopTestRule: 'Stop execution and block artifact flashing if any safety invariant or deadlocked state is triggered during simulation or differential test execution.',
      rootCauses: [
        'Unreachable state definitions due to contradictory guard conditions.',
        'Deadlock or terminal trap state without escape transition.',
        'Variable type overflow or fixed-point scaling mismatch.',
      ],
    },
    requiredDataAndSignals: {
      requiredEquipment: [
        'Host GCC Toolchain (C99 compliant)',
        'ADIA Differential Trace Harness',
        'Hardware In the Loop (HIL) Probe & UART Monitor',
      ],
      requiredPreconditions: [
        'Immutable Semantic IR generated and validated',
        'Fixed step tick interval configured (100ms)',
      ],
      signalsTable: [
        { signalGroup: 'State Flow', signalsToLog: 'Active state ID, previous state, active slot configuration' },
        { signalGroup: 'Signals & Events', signalsToLog: 'Trigger events, guard evaluation booleans, action variables' },
        { signalGroup: 'Safety Metrics', signalsToLog: 'Error status code, anti-windup flags, watchdog ticks' },
      ],
    },
    testProcedures: [
      {
        id: 'T01',
        badgeLabel: 'T01',
        title: 'Static Reachability & AST Completeness',
        purpose: 'Verify that 100% of defined operational and safety states are reachable from initial transition.',
        procedure: [
          'Parse AST graph into immutable Semantic Model IR.',
          'Execute Dijkstra / BFS reachability traversal from root initial state.',
          'Verify all states are visited and no orphan nodes exist.',
        ],
        record: ['Reachable state list', 'Unreachable state list', 'Reachability percentage'],
        acceptanceCriteria: [
          `Reachability equals ${options.reachabilityPercent.toFixed(1)}% (100% required for release).`,
          'Zero orphan states detected.',
        ],
        decisionRule: 'If reachability < 100%, halt code deployment and inspect state transition guards.',
      },
      {
        id: 'T02',
        badgeLabel: 'T02',
        title: 'Differential Execution Trace Equivalence',
        purpose: 'Ensure generated C code binary produces identical execution traces to reference model.',
        procedure: [
          'Compile sm_host_test.c with host GCC compiler.',
          'Execute compiled binary with randomized test stimulus vectors.',
          'Compare JSONL execution logs with reference model trace.',
        ],
        record: ['First divergence step', 'State sequence', 'Variable transition history'],
        acceptanceCriteria: [
          'Zero trace divergences across all executed test vectors.',
          'Deterministic exit on terminal states without unexpected reset.',
        ],
        decisionRule: 'Any divergence indicates a code generation compiler bug or misaligned timing tick.',
      },
    ],
    decisionMatrix: {
      title: '4. Fault-Isolation Decision Matrix',
      rows: [
        {
          observedResult: 'State marked unreachable',
          probableCause: 'Conflicting transition guards or missing event trigger',
          confirmWith: 'T01',
          requiredAction: 'Refactor transition conditions in state chart editor.',
        },
        {
          observedResult: 'Host GCC compilation failure',
          probableCause: 'Missing header include or syntax mismatch in user action code',
          confirmWith: 'T02',
          requiredAction: 'Inspect sm_user_logic.c and verify variable declarations.',
        },
        {
          observedResult: 'Trace divergence between C and simulation',
          probableCause: 'Order of execution discrepancy in during actions vs active children',
          confirmWith: 'T02',
          requiredAction: 'Rebuild runtime bundle with latest ADIA pipeline orchestrator.',
        },
      ],
    },
    finalDecisionCriteria: {
      title: '5. Final Engineering Decision Criteria',
      classifications: [
        {
          title: 'Classify model as verified and production-ready when all conditions hold:',
          criteria: [
            'Static AST reachability is 100%.',
            'Zero deadlocks or non-terminating traps detected.',
            'Differential trace equivalence confirmed across all test vectors.',
          ],
        },
      ],
      releaseCondition: 'Do not flash generated C firmware to target MCU hardware until all T01–T02 tests have recorded PASS evidence in this verification log.',
    },
  };
}
```

```typescript
// src/features/reporting/generators/createMotorDriveTestReport.ts
import type { ReportDocument } from '../reportDocumentModel';

export interface MotorDriveReportOptions {
  motorType?: string;
  targetRpm?: number;
  bladeType?: string;
}

export function createMotorDriveTestReport(options: MotorDriveReportOptions = {}): ReportDocument {
  const motorType = options.motorType || 'BLDC/PMSM Ceiling-Fan Motor';
  const targetRpm = options.targetRpm || 280;

  return {
    header: {
      systemTitle: motorType,
      documentTitle: 'Test and Fault-Isolation Procedure',
      subtitle: options.bladeType || 'Plastic Blade vs. Metal Blade Performance',
      primaryObjective: 'Determine whether the speed limitation is caused by plastic-blade aerodynamic load, insufficient continuous motor torque, inverter saturation, FOC implementation, measurement error, or CFD/model mismatch.',
      status: 'Test-ready draft',
      safetyClassification: 'Rotating machinery - guarded testing required',
      runningHeader: 'BLDC/PMSM Fan Drive - Verification Procedure',
    },
    safetyGate: {
      title: '1. Test Logic and Safety Gate',
      description: 'The tests shall be performed in sequence. Current, voltage, speed, or field-weakening limits shall not be increased until sensor scaling, electrical angle, current tracking, voltage utilization, thermal capability, and blade mechanical-speed limits have been verified.',
      stopTestRule: 'Stop immediately for abnormal vibration, blade deformation, fastener movement, overspeed, overcurrent, DC-bus collapse, controller fault, or any motor/inverter temperature above the approved limit.',
      rootCauses: [
        'Higher aerodynamic torque from the plastic blades.',
        'Motor continuous torque below the torque required at target speed.',
        'Current, torque, power, thermal, or speed limiting in the controller.',
        'Inverter voltage saturation or DC-bus limitation.',
        'Incorrect current scaling, speed scaling, pole-pair count, or electrical-angle alignment.',
        'Incorrect motor parameters or current-loop/speed-loop tuning.',
        'Incorrect electromagnetic torque estimate or CFD load prediction.',
      ],
    },
    requiredDataAndSignals: {
      requiredEquipment: [
        'Calibrated tachometer; isolated oscilloscope probes; calibrated phase-current measurement; DC-bus voltage/current measurement.',
        'Motor and inverter temperature sensors; vibration measurement; synchronized MATLAB/Simulink signal logging.',
        'Calibrated torque transducer or dynamometer for the independent torque test.',
        'Mechanical containment, guarding, emergency stop, and approved blade mounting hardware.',
      ],
      requiredPreconditions: [
        'Motor type, pole pairs, rated current definition, continuous/peak current, allowed peak duration, rated voltage/speed/torque.',
        'Rs, Ld, Lq, flux linkage or Ke/Kt, maximum winding temperature, and maximum mechanical speed.',
        'Inverter current rating, DC-bus range, MOSFET/PCB temperature limits, PWM frequency, and sampling times.',
        'Clarke/Park scaling convention, current/torque/power limit values, and approved blade-speed limits.',
      ],
      signalsTable: [
        { signalGroup: 'Speed', signalsToLog: 'Commanded mechanical speed, controller speed, tachometer speed, speed error' },
        { signalGroup: 'Current', signalsToLog: 'Id*, Id, Iq*, Iq, Ia, Ib, Ic, current-limit and saturation flags' },
        { signalGroup: 'Voltage', signalsToLog: 'Vd*, Vq*, sqrt(Vd*^2 + Vq*^2), Vdc, modulation index or PWM duty' },
        { signalGroup: 'Control', signalsToLog: 'Speed PI P term, I term, total output, anti-windup state, active limiter' },
        { signalGroup: 'Power and condition', signalsToLog: 'Idc, DC input power, torque, temperatures, vibration, fault status' },
      ],
      currentRatingRule: 'Do not compare the motor nameplate current directly with Iq until RMS/peak definitions and Clarke/Park scaling are converted to the same convention.',
    },
    testProcedures: [
      {
        id: 'T01',
        badgeLabel: 'T01',
        title: 'Sensor Offset and Scaling Verification',
        purpose: 'Verify current, voltage, phase order, pole-pair count, and speed feedback before performance testing.',
        procedure: [
          'Disable PWM and confirm zero physical phase current.',
          'Log raw current channels for at least 5 seconds and calculate zero offsets.',
          'Apply a known current or compare every channel with a calibrated current probe.',
          'Run at safe low speed and compare controller speed with a calibrated tachometer.',
          'Verify phase sequence, current polarity, pole-pair count, and that Ia + Ib + Ic is approximately zero.',
        ],
        record: ['Raw/offset-corrected currents, calibrated reference current, speed signals, phase order.'],
        acceptanceCriteria: [
          'Current gain and offset meet the sensor calibration specification.',
          'Controller speed agrees with tachometer within +/-2% or the approved project tolerance.',
          'No unexplained current exists with PWM disabled.',
        ],
        decisionRule: 'Any failure invalidates later torque and limit conclusions. Correct sensing or scaling before continuing.',
      },
      {
        id: 'T02',
        badgeLabel: 'T02',
        title: 'No-Load Speed Capability',
        purpose: 'Determine whether the motor and inverter can reach target speed without blade load.',
        procedure: [
          'Remove all blades and confirm rotor balance and guarding.',
          'Apply production current, voltage, thermal, and acceleration limits.',
          `Command 100, 150, 180, 200, 220, 250, and ${targetRpm} RPM sequentially.`,
          'Hold each point until steady state and record all required signals.',
          'Stop for any limit, fault, abnormal noise, or vibration.',
        ],
        record: ['Speed reference/feedback, tachometer, Id/Iq references and feedback, Vd/Vq, Vdc, modulation, limits, temperatures.'],
        acceptanceCriteria: [
          `${targetRpm} RPM is reached without unintended controller limiting.`,
          'Speed agrees with tachometer and Id remains near Id*.',
          'No abnormal voltage/current saturation, heat, or vibration occurs.',
        ],
        decisionRule: `If ${targetRpm} RPM is reached easily, there is no fixed software speed limit below target. If not, investigate sensing, inverter voltage, motor parameters, and control.`,
      },
      {
        id: 'T03',
        badgeLabel: 'T03',
        title: 'No-Load Loss Characterization',
        purpose: 'Estimate speed-dependent mechanical and electromagnetic losses for later CFD comparison.',
        procedure: [
          'Use stabilized T02 data at every speed.',
          'Calculate electromagnetic torque using verified PMSM model: Te = 1.5 p [lambda_m Iq + (Ld - Lq) Id Iq].',
          'At steady-state no-load, initially set Tloss(omega) approximately equal to Te(omega).',
          'Fit Tloss = Tc + B omega + Kw omega^2 and report coefficients and fit error.',
        ],
        record: ['Te, speed, Id, Iq, fitted loss torque, model residuals.'],
        acceptanceCriteria: [
          'Torque equation, current convention, and parameter sources are documented.',
          'A constant loss is used only if data show it is valid over the test range.',
        ],
        decisionRule: 'Nonphysical loss behavior indicates incorrect scaling, Kt/flux, electrical angle, or torque calculation.',
      },
      {
        id: 'T04',
        badgeLabel: 'T04',
        title: 'Metal/Plastic Blade A-B Comparison',
        purpose: 'Determine whether the plastic blades impose higher aerodynamic load under controlled conditions.',
        procedure: [
          'Start from the defined motor/inverter temperature.',
          'Install metal blades and test 100, 150, 180, 200, and 220 RPM.',
          'Hold each point to steady state and log all signals.',
          'Cool to same starting range, install plastic blades, and repeat without changing controller settings.',
          'At equal speed calculate Tblade_est = Te - Tloss(omega) and compare Iq and DC input power.',
        ],
        record: ['Repeat runs, Iq, estimated blade torque, DC power, airflow if available, temperatures, vibration.'],
        acceptanceCriteria: [
          'At least three repeat measurements at critical points.',
          'All comparison variables and ambient/test conditions are controlled and documented.',
        ],
        decisionRule: 'Consistently higher Iq, shaft power, or blade torque for plastic at equal speed confirms higher plastic-blade load.',
      },
      {
        id: 'T05',
        badgeLabel: 'T05',
        title: 'Current-Loop Tracking',
        purpose: 'Determine whether the current controller produces the commanded torque current.',
        procedure: [
          'With plastic blades, increase speed to the point where speed no longer tracks.',
          'Record Id*, Id, Iq*, Iq, current limits, and saturation flags.',
          'Calculate Iq tracking error at each steady point.',
          'Repeat below and near the limiting point.',
        ],
        record: ['Id/Iq references and feedback, ripple, active current/torque limits, voltage utilization.'],
        acceptanceCriteria: [
          'Iq and Id track their references within approved tolerance; +/-5% may be used initially.',
          'Current ripple remains within motor/inverter requirements.',
        ],
        decisionRule: 'Iq* at limit with Iq tracking means torque/current limited. Iq not tracking with voltage margin means current-loop, parameter, or sensing error.',
      },
      {
        id: 'T06',
        badgeLabel: 'T06',
        title: 'Voltage-Saturation and DC-Bus Test',
        purpose: 'Determine whether the inverter has sufficient voltage to regulate current at target speed/load.',
        procedure: [
          'Increase plastic-blade speed gradually toward the limiting point.',
          'Calculate Vs* = sqrt(Vd*^2 + Vq*^2).',
          'Determine exact inverter voltage limit from modulation implementation; for ideal SVPWM use Vmax approx Vdc/sqrt(3).',
          'Calculate voltage utilization Uv = Vs*/Vmax.',
          'Correlate Uv, DC-bus droop, current tracking error, and modulation saturation.',
        ],
        record: ['Vd/Vq, Vs*, Vdc, Idc, modulation index/PWM, current tracking.'],
        acceptanceCriteria: [
          'Required operating point retains the approved voltage margin.',
          'No excessive DC-bus collapse; current tracking remains acceptable.',
        ],
        decisionRule: 'Uv near 1 with poor current tracking means voltage limited. Voltage margin with Iq at limit means current/torque limited.',
      },
      {
        id: 'T07',
        badgeLabel: 'T07',
        title: 'Speed Controller and Limiter Verification',
        purpose: 'Identify any software limiter that prevents additional torque demand.',
        procedure: [
          'Increase plastic-blade speed command gradually.',
          'Log speed PI P term, I term, total output, saturation, and anti-windup state.',
          'Log torque, Iq, DC-current, power, thermal, stall, and lock limits.',
          'Identify the first limiter that becomes active.',
          'Reduce command and verify smooth recovery without windup overshoot.',
        ],
        record: ['Speed error, controller terms, output command, all limit flags and limit values.'],
        acceptanceCriteria: [
          'Configured limits match approved ratings.',
          'Active limiter is unambiguously identified and anti-windup functions correctly.',
        ],
        decisionRule: 'A clamped PI output identifies a configured limit, not automatically poor PI tuning. Rating and thermal validation are required before any increase.',
      },
      {
        id: 'T08',
        badgeLabel: 'T08',
        title: 'Electrical Angle and Id Verification',
        purpose: 'Verify rotor-flux alignment and torque per ampere.',
        procedure: [
          'Confirm pole pairs, phase sequence, and sensor channel assignment.',
          'Execute the approved Hall/encoder/observer alignment procedure.',
          'At low load and loaded points, log angle, Id, Iq, input power, and phase balance.',
          'If permitted, sweep angle offset over a narrow safe range.',
          'Select calibrated offset that minimizes |Id| for Id*=0 and input power at fixed speed/load.',
        ],
        record: ['Electrical angle/offset, Id/Iq, phase currents, DC power, vibration.'],
        acceptanceCriteria: [
          'Id remains close to Id*; phase currents are balanced.',
          'Calibration provides consistent torque per ampere without abnormal current.',
        ],
        decisionRule: 'Persistent nonzero Id or poor torque per ampere indicates angle, phase-order, pole-pair, or transform-sign error.',
      },
      {
        id: 'T09',
        badgeLabel: 'T09',
        title: 'Independent Shaft-Torque Verification',
        purpose: 'Separate FOC torque-estimation error from CFD prediction error.',
        procedure: [
          'Calibrate and zero a torque transducer/dynamometer.',
          'Measure metal- and plastic-blade torque at identical safe speeds.',
          'Calculate Te, Te - Tloss, and CFD torque at every point.',
          'Calculate deviations relative to measured shaft torque and include measurement uncertainty.',
        ],
        record: ['Measured shaft torque, FOC torque, loss-corrected torque, CFD torque, uncertainty.'],
        acceptanceCriteria: [
          'Torque sensor calibration is traceable.',
          'Operating points and reference denominator are explicitly stated.',
        ],
        decisionRule: 'Measured torque matching CFD points to FOC/scaling error; matching FOC points to CFD/geometry error; matching neither requires recalibration and model review.',
      },
      {
        id: 'T10',
        badgeLabel: 'T10',
        title: 'Power and Efficiency Balance',
        purpose: 'Verify electrical input, shaft output, and system loss consistency.',
        procedure: [
          'Calculate Pdc = Vdc Idc.',
          'Calculate Pshaft = Tshaft (2 pi N/60).',
          'Calculate efficiency eta = Pshaft/Pdc.',
          'Repeat at identical metal/plastic speeds and compare power increase.',
        ],
        record: ['Vdc, Idc, torque, speed, Pdc, Pshaft, efficiency.'],
        acceptanceCriteria: [
          'Power balance is physically reasonable and repeatable.',
          'Efficiency remains between 0% and 100% after uncertainty is considered.',
        ],
        decisionRule: 'High input power with low shaft power indicates loss, electrical-angle, waveform, or measurement problems.',
      },
      {
        id: 'T11',
        badgeLabel: 'T11',
        title: 'Thermal Continuous-Operation Test',
        purpose: 'Verify continuous, not merely short-duration, capability at the required operating point.',
        procedure: [
          'Perform only after T01-T10 pass.',
          'Run at required or highest approved safe speed.',
          'Log temperature, current, voltage, speed, power, and vibration until thermal steady state or approved duration.',
          'Stop at any approved limit and inspect blades, hub, fasteners, motor, and inverter afterward.',
        ],
        record: ['Temperature trends, speed/current drift, power, vibration, inspection result.'],
        acceptanceCriteria: [
          'All temperatures remain below continuous ratings with design margin.',
          'No progressive current rise, deformation, looseness, or abnormal vibration occurs.',
        ],
        decisionRule: 'A speed achieved briefly but not thermally sustained requires lower load/current, better cooling, or a higher continuous-torque drive.',
      },
    ],
    decisionMatrix: {
      title: '4. Fault-Isolation Decision Matrix',
      rows: [
        {
          observedResult: `Cannot reach ${targetRpm} RPM without blades`,
          probableCause: 'Feedback, voltage, motor parameter, or inverter-control fault',
          confirmWith: 'T01, T02, T06, T08',
          requiredAction: 'Correct sensing, parameters, angle, or voltage limitation.',
        },
        {
          observedResult: 'Reaches target with metal but not plastic',
          probableCause: 'Plastic blade has higher aerodynamic load',
          confirmWith: 'T04, T09',
          requiredAction: 'Review blade geometry/deformation; verify motor sizing.',
        },
        {
          observedResult: 'Plastic requires higher Iq at equal speed',
          probableCause: 'Higher plastic-blade torque demand',
          confirmWith: 'T04, T09',
          requiredAction: 'Validate CFD; redesign blade or use more torque.',
        },
        {
          observedResult: 'Iq* at maximum and Iq tracks it',
          probableCause: 'Current/torque limit reached',
          confirmWith: 'T05, T07, T11',
          requiredAction: 'Verify rating and thermal margin; do not raise blindly.',
        },
        {
          observedResult: 'Iq* exceeds Iq; modulation saturated',
          probableCause: 'Insufficient available voltage',
          confirmWith: 'T05, T06',
          requiredAction: 'Review Vdc, Ke, PWM utilization, and speed range.',
        },
        {
          observedResult: 'Iq* exceeds Iq; voltage margin exists',
          probableCause: 'Current loop, sensing, or motor parameters',
          confirmWith: 'T01, T05',
          requiredAction: 'Calibrate and retune current loop.',
        },
        {
          observedResult: 'Id nonzero when Id*=0',
          probableCause: 'Angle, phase order, pole pairs, or transforms',
          confirmWith: 'T08',
          requiredAction: 'Recalibrate electrical angle and phase configuration.',
        },
        {
          observedResult: 'Speed PI saturated at torque/Iq limit',
          probableCause: 'Load requires more permitted torque',
          confirmWith: 'T07',
          requiredAction: 'Validate limit; resize motor or reduce blade load.',
        },
        {
          observedResult: 'PWM maximum and Vdc drops',
          probableCause: 'Supply/DC-bus limitation',
          confirmWith: 'T06',
          requiredAction: 'Verify supply, wiring, capacitor bank, and bus rating.',
        },
        {
          observedResult: 'Measured torque matches CFD, not FOC',
          probableCause: 'FOC torque-estimation error',
          confirmWith: 'T09',
          requiredAction: 'Correct current scaling, motor parameters, equation.',
        },
      ],
    },
    finalDecisionCriteria: {
      title: '5. Final Engineering Decision Criteria',
      classifications: [
        {
          title: 'Classify the inverter model or FOC implementation as the primary cause only when testing demonstrates one or more of the following:',
          criteria: [
            'Incorrect current/speed scaling, pole-pair count, phase assignment, or electrical angle.',
            'Poor Id/Iq tracking while adequate inverter voltage is available.',
            'Incorrect current-loop or speed-loop tuning, motor parameters, PWM implementation, or unintended limiter behavior.',
          ],
        },
        {
          title: 'Classify the motor/blade load selection as the primary cause when all of the following are true:',
          criteria: [
            'Measurements and angle alignment are verified; Id and Iq correctly track their references.',
            'Voltage control remains valid, but the approved continuous current/torque limit is reached.',
            'The plastic blade requires greater measured torque than the metal blade at equal speed.',
            'The target speed cannot be maintained within continuous current and temperature ratings.',
          ],
        },
      ],
      releaseCondition: 'Do not authorize higher current, higher DC-bus voltage, overspeed, or field weakening until electrical scaling, voltage utilization, electrical angle, continuous thermal capability, and blade mechanical integrity are formally verified.',
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reporting/generators/reportGenerators.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reporting/generators/createStateMachineVerificationReport.ts src/features/reporting/generators/createMotorDriveTestReport.ts src/features/reporting/generators/reportGenerators.test.ts
git commit -m "feat(reporting): add domain report generators for State Machine and Motor Drive"
```

---

### Task 5: In-App Interactive Report Viewer Modal (`ReportViewerModal`)

**Files:**
- Create: `src/components/reporting/ReportViewerModal.tsx`
- Test: `src/components/reporting/ReportViewerModal.test.tsx`

**Interfaces:**
- Consumes: `ReportDocument` from `reportDocumentModel.ts`, `saveReportAsPdf`, `saveReportAsDocx`
- Produces: `<ReportViewerModal isOpen={boolean} onClose={() => void} document={ReportDocument} />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/reporting/ReportViewerModal.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportViewerModal } from './ReportViewerModal';
import { createMotorDriveTestReport } from '../../features/reporting/generators/createMotorDriveTestReport';

describe('ReportViewerModal', () => {
  it('renders report modal with action buttons when open', () => {
    const doc = createMotorDriveTestReport();
    render(<ReportViewerModal isOpen={true} onClose={vi.fn()} document={doc} />);
    expect(screen.getByText(/BLDC\/PMSM/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Export PDF/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Export Word/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/reporting/ReportViewerModal.test.tsx`
Expected: FAIL with module not found

- [ ] **Step 3: Implement ReportViewerModal**

```tsx
// src/components/reporting/ReportViewerModal.tsx
import React, { useState } from 'react';
import { FileText, Download, Printer, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { ReportDocument } from '../../features/reporting/reportDocumentModel';
import { saveReportAsPdf } from '../../features/reporting/exportReportToPdf';
import { saveReportAsDocx } from '../../features/reporting/exportReportToDocx';

interface ReportViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: ReportDocument;
}

export const ReportViewerModal: React.FC<ReportViewerModalProps> = ({ isOpen, onClose, document }) => {
  const [zoom, setZoom] = useState<number>(100);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleExportPdf = () => {
    saveReportAsPdf(document, `${document.header.documentTitle.replace(/\s+/g, '_')}.pdf`);
  };

  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
      await saveReportAsDocx(document, `${document.header.documentTitle.replace(/\s+/g, '_')}.docx`);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-sm">
      {/* Top Action Bar */}
      <div className="flex h-14 items-center justify-between border-b border-slate-700 bg-slate-900 px-6 text-white">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-teal-400" />
          <span className="font-semibold">{document.header.documentTitle}</span>
          <span className="rounded bg-teal-500/20 px-2 py-0.5 text-xs text-teal-300 font-mono">
            {document.header.status}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs">
            <button
              onClick={() => setZoom((z) => Math.max(50, z - 15))}
              className="p-1 hover:text-teal-400"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 text-center font-mono">{zoom}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(150, z + 15))}
              className="p-1 hover:text-teal-400"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold hover:bg-teal-500 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </button>

          <button
            onClick={handleExportDocx}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {isExporting ? 'Generating...' : 'Export Word (.docx)'}
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-600 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>

          <button
            onClick={onClose}
            className="ml-2 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Preview Scroll Area */}
      <div className="flex-1 overflow-y-auto bg-slate-950 p-8 flex justify-center">
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          className="w-[210mm] bg-white text-slate-900 shadow-2xl p-[18mm] rounded-sm transition-transform duration-150"
        >
          {/* Header Block */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[#0f3b57] mb-1">{document.header.systemTitle}</h1>
            <h2 className="text-xl font-bold text-[#0f3b57] mb-2">{document.header.documentTitle}</h2>
            <div className="w-24 h-1 bg-[#2b7a9e] mb-3"></div>
            <p className="text-sm text-slate-500 mb-6">{document.header.subtitle}</p>

            {/* Objective Callout Box */}
            <div className="rounded-md border border-[#2b7a9e] bg-[#f0f7fc] p-4 text-sm text-[#0f3b57] mb-6">
              <span className="font-bold">Primary objective: </span>
              <span className="text-slate-800">{document.header.primaryObjective}</span>
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <div>Document status: {document.header.status}</div>
              <div>Safety classification: {document.header.safetyClassification}</div>
            </div>
          </div>

          {/* Section 1: Safety Gate */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-[#0f3b57] mb-2">{document.safetyGate.title}</h3>
            <p className="text-sm text-slate-700 mb-3">{document.safetyGate.description}</p>
            <div className="rounded-md border border-[#c89234] bg-[#fff9e6] p-3 text-sm text-[#734c00] mb-4">
              <span className="font-bold">Stop-test rule: </span>
              <span className="text-slate-800">{document.safetyGate.stopTestRule}</span>
            </div>
            {document.safetyGate.rootCauses && (
              <div>
                <div className="text-sm font-bold text-slate-800 mb-1">Potential root causes</div>
                <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                  {document.safetyGate.rootCauses.map((rc, i) => (
                    <li key={i}>{rc}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Section 2: Equipment & Data */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-[#0f3b57] mb-2">2. Required Equipment and Data</h3>
            <div className="text-sm font-bold text-slate-800 mb-1">Required equipment</div>
            <ul className="list-disc list-inside text-sm text-slate-700 space-y-1 mb-4">
              {document.requiredDataAndSignals.requiredEquipment.map((eq, i) => (
                <li key={i}>{eq}</li>
              ))}
            </ul>

            {/* Signals Table */}
            <div className="overflow-hidden rounded border border-slate-300">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0f3b57] text-white">
                  <tr>
                    <th className="px-3 py-2 font-semibold w-1/4">Signal group</th>
                    <th className="px-3 py-2 font-semibold">Signals to log synchronously</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {document.requiredDataAndSignals.signalsTable.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                      <td className="px-3 py-2 font-medium text-slate-800">{row.signalGroup}</td>
                      <td className="px-3 py-2 text-slate-600">{row.signalsToLog}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Procedures */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-[#0f3b57] mb-4">3. Detailed Test Procedures</h3>
            <div className="space-y-6">
              {document.testProcedures.map((proc) => (
                <div key={proc.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#0e637a] px-2 py-0.5 text-xs font-bold text-white">
                      {proc.badgeLabel || proc.id}
                    </span>
                    <span className="text-base font-bold text-[#0f3b57]">{proc.title}</span>
                  </div>
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold">Purpose. </span>
                    {proc.purpose}
                  </div>
                  <div className="text-sm font-semibold text-slate-800">Procedure</div>
                  <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1">
                    {proc.procedure.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ol>
                  <div className="text-sm font-semibold text-slate-800">Record</div>
                  <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                    {proc.record.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  <div className="text-sm font-semibold text-[#0f3b57]">Acceptance criteria</div>
                  <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                    {proc.acceptanceCriteria.map((ac, i) => (
                      <li key={i}>{ac}</li>
                    ))}
                  </ul>
                  <div className="rounded-md border border-[#2b7a9e] bg-[#f0f7fc] p-3 text-sm text-[#0f3b57]">
                    <span className="font-bold">Decision rule: </span>
                    <span className="text-slate-800">{proc.decisionRule}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Decision Matrix */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-[#0f3b57] mb-3">{document.decisionMatrix.title}</h3>
            <div className="overflow-hidden rounded border border-slate-300">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0f3b57] text-white">
                  <tr>
                    <th className="px-2.5 py-2 font-semibold">Observed result</th>
                    <th className="px-2.5 py-2 font-semibold">Most probable cause</th>
                    <th className="px-2.5 py-2 font-semibold">Confirm with</th>
                    <th className="px-2.5 py-2 font-semibold">Required action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {document.decisionMatrix.rows.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                      <td className="px-2.5 py-2 font-medium text-slate-800">{row.observedResult}</td>
                      <td className="px-2.5 py-2 text-slate-600">{row.probableCause}</td>
                      <td className="px-2.5 py-2 font-mono text-teal-700 font-semibold">{row.confirmWith}</td>
                      <td className="px-2.5 py-2 text-slate-700">{row.requiredAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: Final Decision */}
          <div>
            <h3 className="text-lg font-bold text-[#0f3b57] mb-3">{document.finalDecisionCriteria.title}</h3>
            <div className="space-y-3 mb-4">
              {document.finalDecisionCriteria.classifications.map((cls, i) => (
                <div key={i} className="text-sm">
                  <div className="font-semibold text-slate-800 mb-1">{cls.title}</div>
                  <ul className="list-disc list-inside text-slate-700 space-y-1">
                    {cls.criteria.map((c, ci) => (
                      <li key={ci}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="rounded-md border border-[#c89234] bg-[#fff9e6] p-3 text-sm text-[#734c00]">
              <span className="font-bold">Release condition: </span>
              <span className="text-slate-800">{document.finalDecisionCriteria.releaseCondition}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/reporting/ReportViewerModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reporting/ReportViewerModal.tsx src/components/reporting/ReportViewerModal.test.tsx
git commit -m "feat(reporting): add interactive ReportViewerModal preview component"
```

---

### Task 6: Export Barrel & Verification

**Files:**
- Modify: `src/features/reporting/index.ts`
- Test: `src/features/reporting/index.test.ts`

**Interfaces:**
- Consumes: All reporting features
- Produces: Clean public exports for `reportDocumentModel`, `exportReportToPdf`, `exportReportToDocx`, and report generators.

- [ ] **Step 1: Update barrel exports**

```typescript
// src/features/reporting/index.ts
export * from './reportDiagramModel';
export * from './reportDiagramLayout';
export * from './reportDiagrams';
export * from './reportDocumentModel';
export * from './exportReportToPdf';
export * from './exportReportToDocx';
export * from './generators/createStateMachineVerificationReport';
export * from './generators/createMotorDriveTestReport';
```

- [ ] **Step 2: Run all reporting tests**

Run: `npx vitest run src/features/reporting/`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/features/reporting/index.ts
git commit -m "feat(reporting): export styled reporting modules and generators"
```
