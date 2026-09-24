import React from 'react';
import { AlertTriangle, ShieldAlert, Check, X } from 'lucide-react';
import type { ExplorerImpact } from '../../features/modelExplorer/modelExplorerTypes';

export interface MoveImpactDialogProps {
  isOpen?: boolean;
  impact: ExplorerImpact;
  impactHash: string;
  onConfirm: (hash: string) => void;
  onCancel: () => void;
  operationTitle?: string;
  className?: string;
}

export const MoveImpactDialog: React.FC<MoveImpactDialogProps> = ({
  isOpen = true,
  impact,
  impactHash,
  onConfirm,
  onCancel,
  operationTitle = 'Confirm Structural Move',
  className = '',
}) => {
  if (isOpen === false) return null;
  const hasInvalidations = impact.invalidated.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-impact-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div
        className={`bg-[var(--surface-panel)] border border-[var(--border-default)] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-xs text-[var(--text-primary)] ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-canvas)] border-b border-[var(--border-default)]">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <span id="move-impact-dialog-title" className="font-semibold text-sm text-[var(--text-primary)]">
              {operationTitle}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Impact Warning Banner */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5 p-3 rounded bg-[var(--surface-raised)] border border-[var(--status-warning)] text-[var(--status-warning)]">
            <ShieldAlert size={16} className="text-[var(--status-warning)] shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 text-[11px] leading-relaxed">
              <span className="font-semibold">
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
              <span className="font-medium text-[var(--status-danger)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-danger)]" />
                Invalidated Transitions & Relationships ({impact.invalidated.length})
              </span>
              <div className="max-h-28 overflow-y-auto bg-[var(--surface-canvas)] rounded border border-[var(--status-danger)] p-2 divide-y divide-[var(--border-default)]">
                {impact.invalidated.map((inv: string, idx: number) => (
                  <div key={idx} className="py-1 text-[11px] text-[var(--status-danger)] font-mono">
                    {inv}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descendants affected */}
          {impact.descendants.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-[var(--text-secondary)]">
                Included Descendant Elements ({impact.descendants.length})
              </span>
              <div className="max-h-20 overflow-y-auto bg-[var(--surface-canvas)] rounded border border-[var(--border-default)] p-2 text-[var(--text-muted)] text-[11px] font-mono">
                {impact.descendants.join(', ')}
              </div>
            </div>
          )}

          {/* Presentations affected */}
          {impact.presentations.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-[var(--text-secondary)]">
                Affected Diagram Presentations ({impact.presentations.length})
              </span>
              <div className="max-h-16 overflow-y-auto bg-[var(--surface-canvas)] rounded border border-[var(--border-default)] p-2 text-[var(--text-muted)] text-[11px] font-mono">
                {impact.presentations.join(', ')}
              </div>
            </div>
          )}

          {/* Confirmation Hash Display */}
          <div className="flex items-center justify-between p-2 rounded bg-[var(--surface-canvas)] border border-[var(--border-default)] text-[11px]">
            <span className="text-[var(--text-muted)]">Impact Verification Hash:</span>
            <span className="font-mono text-[var(--diagram-node-selected)] select-all">{impactHash}</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 bg-[var(--surface-canvas)] border-t border-[var(--border-default)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--surface-canvas)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(impactHash)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[var(--status-warning)] text-white font-medium hover:opacity-90 transition-colors shadow-sm"
          >
            <Check size={14} />
            <span>Confirm</span>
          </button>
        </div>
      </div>
    </div>
  );
};
