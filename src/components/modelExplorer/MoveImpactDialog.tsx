import React from 'react';
import { AlertTriangle, X, Check, ShieldAlert, ArrowRight } from 'lucide-react';
import type { ExplorerImpact } from '../../features/modelExplorer/modelExplorerTypes';

export interface MoveImpactDialogProps {
  isOpen: boolean;
  impact: ExplorerImpact;
  impactHash: string;
  onConfirm: (confirmedImpactHash: string) => void;
  onCancel: () => void;
  operationTitle?: string;
  className?: string;
}

export const MoveImpactDialog: React.FC<MoveImpactDialogProps> = ({
  isOpen,
  impact,
  impactHash,
  onConfirm,
  onCancel,
  operationTitle = 'Confirm Structural Move',
  className = '',
}) => {
  if (!isOpen) return null;

  const hasInvalidations = impact.invalidated && impact.invalidated.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-impact-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div
        className={`bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-xs text-slate-200 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <span id="move-impact-dialog-title" className="font-semibold text-sm text-slate-100">
              {operationTitle}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Impact Warning Banner */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5 p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200">
            <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 text-[11px] leading-relaxed">
              <span className="font-semibold text-amber-100">
                Structural relocation requires confirmation
              </span>
              <span>
                Moving these model elements alters containment hierarchy and may invalidate
                associated transitions, relationships, or diagram presentations.
              </span>
            </div>
          </div>

          {/* Invalidations */}
          {hasInvalidations && (
            <div className="flex flex-col gap-1.5">
              <span className="font-medium text-red-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Invalidated Transitions & Relationships ({impact.invalidated.length})
              </span>
              <div className="max-h-28 overflow-y-auto bg-slate-950/80 rounded border border-red-500/30 p-2 divide-y divide-red-500/20">
                {impact.invalidated.map((inv, idx) => (
                  <div key={idx} className="py-1 text-[11px] text-red-200/90 font-mono">
                    {inv}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descendants affected */}
          {impact.descendants.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-slate-300">
                Included Descendant Elements ({impact.descendants.length})
              </span>
              <div className="max-h-20 overflow-y-auto bg-slate-950/50 rounded border border-slate-800 p-2 text-slate-400 text-[11px] font-mono">
                {impact.descendants.join(', ')}
              </div>
            </div>
          )}

          {/* Presentations affected */}
          {impact.presentations.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-slate-300">
                Affected Diagram Presentations ({impact.presentations.length})
              </span>
              <div className="max-h-16 overflow-y-auto bg-slate-950/50 rounded border border-slate-800 p-2 text-slate-400 text-[11px] font-mono">
                {impact.presentations.join(', ')}
              </div>
            </div>
          )}

          {/* Confirmation Hash Display */}
          <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 text-[11px]">
            <span className="text-slate-400">Impact Verification Hash:</span>
            <span className="font-mono text-blue-400 select-all">{impactHash}</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 bg-slate-950 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(impactHash)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-amber-600 text-white font-medium hover:bg-amber-500 transition-colors shadow-sm"
          >
            <Check size={14} />
            <span>Confirm</span>
          </button>
        </div>
      </div>
    </div>
  );
};
