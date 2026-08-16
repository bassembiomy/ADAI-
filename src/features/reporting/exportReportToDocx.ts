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

  const buffer = await Packer.toBuffer(docx);
  return new Uint8Array(buffer);
}

export async function saveReportAsDocx(doc: ReportDocument, filename = 'ADIA_Engineering_Report.docx'): Promise<void> {
  const buffer = await generateReportDocxBuffer(doc);
  const blob = new Blob([buffer.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
