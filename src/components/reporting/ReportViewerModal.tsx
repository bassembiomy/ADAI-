import React, { useState } from 'react';
import { FileText, Download, Printer, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { ReportDocument } from '../../features/reporting/reportDocumentModel';
import { saveReportAsPdf } from '../../features/reporting/exportReportToPdf';
import { saveReportAsDocx } from '../../features/reporting/exportReportToDocx';

export interface ReportViewerModalProps {
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
