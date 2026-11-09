import React, { useState } from 'react';
import type { ModelDiagnostic } from '../../../engine/xbridges/types';
import { countDiagnostics, describeDiagnostic, pluralize } from './xbDiagnosticsModel';

export type XbRunStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'failed';

const STATUS_LABEL: Record<XbRunStatus, string> = {
  idle: 'Idle', running: 'Running', paused: 'Paused', stopped: 'Stopped', failed: 'Failed',
};
const STATUS_DOT: Record<XbRunStatus, string> = {
  idle: 'bg-[#555]', running: 'bg-emerald-500 animate-pulse', paused: 'bg-amber-500', stopped: 'bg-slate-400', failed: 'bg-red-500',
};
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 } as const;
const SEVERITY_TEXT = { error: 'text-red-400', warning: 'text-amber-400', info: 'text-slate-400' } as const;
const SEVERITY_ROW = {
  error: 'border-red-700/30 bg-red-900/15',
  warning: 'border-amber-700/30 bg-amber-900/15',
  info: 'border-slate-600/30 bg-slate-800/30',
} as const;
const SEVERITY_LABEL = { error: 'Error', warning: 'Warning', info: 'Info' } as const;

export interface XbridgesStatusBarProps {
  status: XbRunStatus;
  /** Simulation time in seconds. */
  time: number;
  solver: string;
  stopTime: string;
  fixedStep: string;
  diagnostics: readonly ModelDiagnostic[];
  onSelectBlocks: (blockIds: string[]) => void;
  onOpenHelp: (topicId: string, sectionId: string) => void;
  /** Controlled open state of the problem list; uncontrolled when omitted. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Optional frame around the problem list, e.g. a ResizablePanel that makes its height resizable. */
  renderProblemsFrame?: (list: React.ReactNode) => React.ReactNode;
}

export const XbridgesStatusBar: React.FC<XbridgesStatusBarProps> = ({
  status, time, solver, stopTime, fixedStep, diagnostics, onSelectBlocks, onOpenHelp, expanded, onExpandedChange, renderProblemsFrame,
}) => {
  const [localExpanded, setLocalExpanded] = useState(false);
  const open = expanded ?? localExpanded;
  const setOpen = (value: boolean) => {
    if (expanded === undefined) setLocalExpanded(value);
    onExpandedChange?.(value);
  };
  const counts = countDiagnostics(diagnostics);
  const described = diagnostics
    .map((d, i) => ({ d: describeDiagnostic(d), i }))
    .sort((a, b) => SEVERITY_RANK[a.d.severity] - SEVERITY_RANK[b.d.severity] || a.i - b.i);
  const parts: string[] = [];
  if (counts.errors) parts.push(pluralize(counts.errors, 'error'));
  if (counts.warnings) parts.push(pluralize(counts.warnings, 'warning'));
  if (counts.infos) parts.push(`${counts.infos} info`);
  const summary = parts.length ? parts.join(', ') : 'No problems';
  const summaryColor = counts.errors ? 'text-red-400' : counts.warnings ? 'text-amber-400' : 'text-slate-400';

  return (
    <div className="shrink-0 border-t border-[#333] bg-[#111] text-[#e0e0e0]">
      {open && (
        (renderProblemsFrame ?? ((list) => list))(
        <ul
          role="list"
          aria-label="Problems"
          className={`${renderProblemsFrame ? 'h-full' : 'max-h-[220px]'} overflow-y-auto custom-scrollbar p-2 space-y-1 border-b border-[#333] m-0 list-none`}
        >
          {described.length === 0 && (
            <li className="px-2 py-1.5 text-[11px] text-slate-500">No problems in the last run.</li>
          )}
          {described.map(({ d, i }) => (
            <li key={i} className={`flex flex-col gap-1 p-2 rounded-lg border text-[11px] ${SEVERITY_ROW[d.severity]}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`font-black text-[9px] uppercase tracking-wider ${SEVERITY_TEXT[d.severity]}`}>{SEVERITY_LABEL[d.severity]}</span>
                <span className={`font-mono font-bold text-[10px] ${SEVERITY_TEXT[d.severity]}`}>{d.code}</span>
              </div>
              <span className="text-slate-200 break-words">{d.message}</span>
              <span className="text-slate-400 break-words">{d.meaning}</span>
              <div className="flex gap-2">
                {d.blockIds.length > 0 && (
                  <button data-help-feature="live:components/xbridges/diagnostics/XbridgesStatusBar:8551c4632149"
                    type="button"
                    onClick={() => onSelectBlocks(d.blockIds)}
                    className="px-2 py-0.5 rounded border border-[#444] text-[10px] font-bold text-[#c9a86c] hover:bg-[#222]"
                  >
                    Show block
                  </button>
                )}
                <button data-help-feature="live:components/xbridges/diagnostics/XbridgesStatusBar:c6828325f596"
                  type="button"
                  onClick={() => onOpenHelp(d.helpTopicId, d.helpSectionId)}
                  className="px-2 py-0.5 rounded border border-[#444] text-[10px] font-bold text-slate-300 hover:bg-[#222]"
                >
                  Help
                </button>
              </div>
            </li>
          ))}
        </ul>
        )
      )}
      <div
        role="status"
        aria-label="X-Bridges status bar"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-[10px] font-mono"
      >
        <span className="flex items-center gap-1.5 font-bold">
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
        <span className="tabular-nums">t = {time.toFixed(3)} s</span>
        <span className="text-slate-400">Solver: {solver}</span>
        <span className="text-slate-400">Stop: {stopTime}</span>
        <span className="text-slate-400">Step: {fixedStep}</span>
        <button data-help-feature="live:components/xbridges/diagnostics/XbridgesStatusBar:a1cc4a27dd3f"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`ml-auto px-2 py-0.5 rounded border border-[#333] font-bold hover:bg-[#222] ${summaryColor}`}
        >
          Problems: {summary}
        </button>
      </div>
    </div>
  );
};
