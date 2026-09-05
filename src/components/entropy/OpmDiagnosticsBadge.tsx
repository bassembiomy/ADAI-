/**
 * Diagnostics badge overlay displaying error and warning counters and item details.
 *
 * Exact diagnostic navigation flows through a single callback:
 * NavigateToOpmDiagnostic = (source: OpmSourceRef) => void.
 * The host selects the node or edge by source.elementId, opens the executable
 * inspector, and focuses the control tagged with data-opm-path={source.propertyPath}.
 */

import React, { useState } from 'react';
import type { OpmDiagnostic, OpmSourceRef } from '../../engine/opm/executableTypes';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

export type NavigateToOpmDiagnostic = (source: OpmSourceRef) => void;

export interface OpmDiagnosticsBadgeProps {
  diagnostics: OpmDiagnostic[];
  /** Preferred single-callback navigation (receives the full source ref). */
  onNavigateToDiagnostic?: NavigateToOpmDiagnostic;
  /** Legacy alias: receives only the element id. */
  onSelectElement?: (elementId: string) => void;
  /** Test/preview hook: start expanded. Defaults to false. */
  defaultExpanded?: boolean;
}

export const OpmDiagnosticsBadge: React.FC<OpmDiagnosticsBadgeProps> = ({
  diagnostics,
  onNavigateToDiagnostic,
  onSelectElement,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  const handleSelect = (source: OpmSourceRef): void => {
    if (onNavigateToDiagnostic) {
      onNavigateToDiagnostic(source);
    } else if (onSelectElement) {
      onSelectElement(source.elementId);
    }
  };

  if (diagnostics.length === 0) {
    return (
      <div
        data-testid="diagnostics-badge"
        className="absolute bottom-4 left-4 z-40 bg-[#121212]/90 border border-green-900/50 rounded-lg px-2.5 py-1 text-xs text-green-400 font-bold flex items-center gap-1.5 shadow-lg select-none"
      >
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>OPM Model Valid ✓</span>
      </div>
    );
  }

  return (
    <div
      data-testid="opm-diagnostics-badge"
      className="absolute bottom-4 left-4 z-40 bg-[#121212]/95 border border-[#333] rounded-lg shadow-2xl p-2 text-xs font-mono text-gray-200 max-w-sm select-none"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          aria-label="Toggle diagnostics details"
          className="flex items-center gap-1.5 font-bold hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        >
          {errors.length > 0 ? (
            <span className="flex items-center gap-1 text-red-400">
              <AlertCircle size={14} /> {errors.length} Errors
            </span>
          ) : null}
          {warnings.length > 0 ? (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle size={14} /> {warnings.length} Warnings
            </span>
          ) : null}
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Collapse diagnostics' : 'Expand diagnostics'}
          className="text-gray-400 hover:text-white p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pt-1 border-t border-[#2d2d2d]">
          {diagnostics.map((d, idx) => (
            <div
              key={idx}
              role="button"
              tabIndex={0}
              data-testid={`diagnostic-item-${idx}`}
              data-opm-path={d.source.propertyPath}
              onClick={() => handleSelect(d.source)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleSelect(d.source);
              }}
              className={`p-1.5 rounded text-[10px] cursor-pointer hover:opacity-90 border ${
                d.severity === 'error'
                  ? 'bg-red-950/40 text-red-300 border-red-900/50'
                  : d.severity === 'warning'
                    ? 'bg-amber-950/40 text-amber-300 border-amber-900/50'
                    : 'bg-sky-950/40 text-sky-300 border-sky-900/50'
              }`}
            >
              <span className="font-bold">[{d.code}]</span> {d.message}
              <div className="text-[8px] text-gray-400 mt-0.5 font-sans">
                Source: {d.source.elementId} ({d.source.propertyPath})
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
