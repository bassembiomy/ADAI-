/**
 * In-canvas Live Trace HUD displaying the actual canonical runtime snapshot:
 * values, activeStates, firedProcessIds, traversedLinkIds, timeMs, stepIndex,
 * diagnostics.
 */

import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import type { OpmDiagnostic } from '../../engine/opm/executableTypes';

export interface OpmLiveTraceOverlayProps {
  activeStates: Record<string, string>;
  variableValues: Record<string, boolean | number | string>;
  recentTrace?: { phase: string; description: string; data?: Record<string, unknown> }[];
  firingProcessIds: string[];
  traversedLinkIds: string[];
  timeMs?: number;
  stepIndex?: number;
  diagnostics?: OpmDiagnostic[];
}

export const OpmLiveTraceOverlay: React.FC<OpmLiveTraceOverlayProps> = ({
  activeStates,
  variableValues,
  recentTrace = [],
  firingProcessIds = [],
  traversedLinkIds = [],
  timeMs = 0,
  stepIndex = 0,
  diagnostics = [],
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const varEntries = Object.entries(variableValues);

  return (
    <div
      data-testid="live-trace-hud"
      className="absolute top-4 right-4 z-40 bg-[#121212]/90 backdrop-blur-md border border-[#333] rounded-lg shadow-2xl p-2.5 text-xs text-gray-200 font-mono w-64 select-none"
    >
      <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 font-bold text-sky-400 text-[11px]">
          <Activity size={13} className={firingProcessIds.length > 0 ? 'animate-pulse text-orange-400' : ''} />
          <span>LIVE EXECUTION HUD</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-gray-500 font-normal">T: {timeMs}ms (#{stepIndex})</span>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-white p-0.5"
          >
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-2">
          {/* Variables Table (from runtime snapshot values) */}
          <div>
            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block mb-1">
              Variables ({varEntries.length})
            </span>
            {varEntries.length > 0 ? (
              <div className="max-h-28 overflow-y-auto space-y-0.5 pr-1">
                {varEntries.map(([k, v]) => (
                  <div key={k} className="flex justify-between bg-black/40 px-1.5 py-0.5 rounded text-[10px]">
                    <span className="text-sky-300 truncate max-w-[120px]">{k}:</span>
                    <span className="text-white font-bold">
                      {typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-gray-500 italic">No variables declared.</div>
            )}
          </div>

          {/* Active States (from runtime snapshot) */}
          <div>
            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block mb-1">
              Active States
            </span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(activeStates).map(([objId, stId]) => (
                <span
                  key={objId}
                  className="px-1.5 py-0.5 rounded bg-orange-950/80 border border-orange-500/60 text-orange-300 text-[9px] font-bold"
                >
                  {stId}
                </span>
              ))}
              {Object.keys(activeStates).length === 0 && (
                <span className="text-[10px] text-gray-500 italic">No active states.</span>
              )}
            </div>
          </div>

          {/* Firing Processes (from runtime snapshot) */}
          {firingProcessIds.length > 0 && (
            <div>
              <span className="text-[9px] uppercase font-bold text-orange-400 tracking-wider block mb-0.5">
                Firing Processes
              </span>
              <div className="flex flex-wrap gap-1">
                {firingProcessIds.map(pid => (
                  <span
                    key={pid}
                    className="px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-400 text-sky-200 text-[9px] font-bold animate-pulse"
                  >
                    {pid}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Traversed Links (from runtime snapshot — drives edge animation) */}
          <div>
            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block mb-0.5">
              Traversed Links ({traversedLinkIds.length})
            </span>
            {traversedLinkIds.length > 0 ? (
              <div className="flex flex-wrap gap-1" data-testid="hud-traversed-links">
                {traversedLinkIds.map(lid => (
                  <span
                    key={lid}
                    className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[9px] font-bold animate-pulse"
                  >
                    {lid}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-gray-500 italic">No traversed links.</span>
            )}
          </div>

          {/* Step diagnostics (from runtime snapshot) */}
          {diagnostics.length > 0 && (
            <div>
              <span className="text-[9px] uppercase font-bold text-red-400 tracking-wider block mb-0.5">
                Diagnostics ({diagnostics.length})
              </span>
              <div className="space-y-0.5 max-h-20 overflow-y-auto" data-testid="hud-diagnostics">
                {diagnostics.map((d, i) => (
                  <div key={i} className="text-[9px] text-red-300 bg-red-950/30 px-1.5 py-0.5 rounded">
                    [{d.code}] {d.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent trace phases */}
          {recentTrace.length > 0 && (
            <div>
              <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block mb-0.5">
                Trace ({recentTrace.length})
              </span>
              <div className="space-y-0.5 max-h-20 overflow-y-auto">
                {recentTrace.slice(-5).map((t, i) => (
                  <div key={i} className="text-[9px] text-gray-400 bg-black/40 px-1.5 py-0.5 rounded">
                    [{t.phase}] {t.description}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
