import React, { useEffect } from 'react';
import type { ModelDiagnostic } from '../../../engine/xbridges/types';
import { countDiagnostics, describeDiagnostic, pluralize } from './xbDiagnosticsModel';

const MAX_ITEMS = 3;
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 } as const;
const SEVERITY_TEXT = { error: 'text-red-400', warning: 'text-amber-400', info: 'text-slate-400' } as const;

export interface XbridgesDiagnosticPopupProps {
  /** Diagnostics not yet announced in this run. */
  diagnostics: readonly ModelDiagnostic[];
  onDismiss: () => void;
  onShowAll: () => void;
  /** Warnings and info hide after this many milliseconds; errors stay until dismissed. */
  autoHideMs?: number;
}

export const XbridgesDiagnosticPopup: React.FC<XbridgesDiagnosticPopupProps> = ({
  diagnostics, onDismiss, onShowAll, autoHideMs = 8000,
}) => {
  const hasError = diagnostics.some(d => d.severity === 'error');
  const visible = diagnostics.length > 0;

  useEffect(() => {
    if (!visible || hasError) return undefined;
    const timer = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(timer);
    // The timer restarts when new diagnostics arrive.
  }, [visible, hasError, autoHideMs, diagnostics, onDismiss]);

  if (!visible) return null;

  const counts = countDiagnostics(diagnostics);
  const heading: string[] = [];
  if (counts.errors) heading.push(pluralize(counts.errors, 'error'));
  if (counts.warnings) heading.push(pluralize(counts.warnings, 'warning'));
  if (counts.infos) heading.push(`${counts.infos} info`);
  const sorted = diagnostics
    .map((d, i) => ({ d, i }))
    .sort((a, b) => SEVERITY_RANK[a.d.severity] - SEVERITY_RANK[b.d.severity] || a.i - b.i)
    .map(x => x.d);
  const shown = sorted.slice(0, MAX_ITEMS);
  const more = sorted.length - shown.length;

  return (
    <div
      role={hasError ? 'alert' : 'status'}
      className="w-[360px] max-w-full max-h-full min-h-0 flex flex-col bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl text-[#e0e0e0] overflow-hidden"
    >
      <div className="shrink-0 px-3 py-2 border-b border-[#333] bg-[#111]/60 text-[10px] font-black uppercase tracking-widest text-slate-300">
        Run diagnostics: {heading.join(', ')}
      </div>
      <ul className="m-0 p-2 space-y-1.5 list-none min-h-0 max-h-[260px] overflow-y-auto custom-scrollbar">
        {shown.map((raw, i) => {
          const d = describeDiagnostic(raw);
          return (
            <li key={i} className="text-[11px] flex flex-col gap-0.5">
              <span className={`font-mono font-bold text-[10px] ${SEVERITY_TEXT[d.severity]}`}>{d.code}</span>
              <span className="text-slate-200 break-words">{d.message}</span>
              <span className="text-slate-400 break-words">{d.meaning}</span>
            </li>
          );
        })}
      </ul>
      {more > 0 && <div className="shrink-0 px-3 pb-1 text-[10px] text-slate-500">+{more} more</div>}
      <div className="shrink-0 flex justify-end gap-2 px-3 py-2 border-t border-[#333]">
        <button data-help-feature="live:components/xbridges/diagnostics/XbridgesDiagnosticPopup:1bdc27f5f835" type="button" onClick={onShowAll} className="px-2 py-0.5 rounded border border-[#444] text-[10px] font-bold text-[#c9a86c] hover:bg-[#222]">
          View all
        </button>
        <button data-help-feature="live:components/xbridges/diagnostics/XbridgesDiagnosticPopup:e6bed41841c3" type="button" onClick={onDismiss} className="px-2 py-0.5 rounded border border-[#444] text-[10px] font-bold text-slate-300 hover:bg-[#222]">
          Dismiss
        </button>
      </div>
    </div>
  );
};
