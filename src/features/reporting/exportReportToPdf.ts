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

  if (doc.consistency) {
    y += 6;
    pdf.text(`Model revision: ${doc.consistency.revision}`, margin, y);
    y += 6;
    const removedRels = doc.consistency.removedRelationshipIds?.length > 0 ? doc.consistency.removedRelationshipIds.join(', ') : 'none';
    const removedConns = doc.consistency.removedConnectorIds?.length > 0 ? doc.consistency.removedConnectorIds.join(', ') : 'none';
    const totalRemoved = (doc.consistency.removedRelationshipIds?.length || 0) + (doc.consistency.removedConnectorIds?.length || 0);
    pdf.text(`Removed connections: ${totalRemoved} (relationships: ${removedRels}, connectors: ${removedConns})`, margin, y);
    if (doc.consistency.errors && doc.consistency.errors.length > 0) {
      y += 6;
      pdf.text(`Consistency errors: ${doc.consistency.errors.length}`, margin, y);
    }
  }

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
