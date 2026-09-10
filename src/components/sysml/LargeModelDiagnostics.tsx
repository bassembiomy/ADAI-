import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, Cpu, Database, Eye, Gauge, Layers, ShieldCheck, Zap } from 'lucide-react';
import type { NormalizedSysmlStore } from '../../engine/sysml/normalizedStore';
import type { SysmlWorkerDiagnostics } from '../../services/sysmlWorkerClient';

export interface PerformanceLimitsConfig {
  virtualizationThreshold: number;
  performanceModeThreshold: number;
  largeModelWarningThreshold: number;
  forcePerformanceMode?: boolean;
}

const STORAGE_KEY = 'adia_sysml_performance_limits';

export function loadStoredPerformanceLimits(): PerformanceLimitsConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          virtualizationThreshold: parsed.virtualizationThreshold ?? 150,
          performanceModeThreshold: parsed.performanceModeThreshold ?? 500,
          largeModelWarningThreshold: parsed.largeModelWarningThreshold ?? 5000,
          forcePerformanceMode: Boolean(parsed.forcePerformanceMode),
        };
      }
    }
  } catch {
    // Fallback to defaults if parsing fails
  }
  return {
    virtualizationThreshold: 150,
    performanceModeThreshold: 500,
    largeModelWarningThreshold: 5000,
    forcePerformanceMode: false,
  };
}

export function saveStoredPerformanceLimits(limits: PerformanceLimitsConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limits));
    }
  } catch {
    // Storage quota or disabled in sandbox
  }
}

export interface LargeModelDiagnosticsProps {
  store?: NormalizedSysmlStore;
  activeDiagramId?: string;
  totalBlockCount: number;
  totalPartCount: number;
  totalConnectorCount: number;
  totalRelationshipCount: number;
  visibleCount?: number;
  isVirtualizing?: boolean;
  isDegradedMode?: boolean;
  pendingWorkerJobs?: number;
  lastSaveTimestamp?: string;
  onTogglePerformanceMode?: (enabled: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
  workerDiagnostics?: SysmlWorkerDiagnostics;
}

export const LargeModelDiagnostics: React.FC<LargeModelDiagnosticsProps> = ({
  totalBlockCount,
  totalPartCount,
  totalConnectorCount,
  totalRelationshipCount,
  visibleCount,
  isVirtualizing,
  isDegradedMode,
  pendingWorkerJobs = 0,
  lastSaveTimestamp,
  onTogglePerformanceMode,
  isOpen,
  onClose,
  workerDiagnostics,
}) => {
  const [limits, setLimits] = useState<PerformanceLimitsConfig>(loadStoredPerformanceLimits);

  useEffect(() => {
    saveStoredPerformanceLimits(limits);
  }, [limits]);

  if (!isOpen) return null;

  const totalEntities = totalBlockCount + totalPartCount + totalConnectorCount + totalRelationshipCount;
  const isLargeModel = totalEntities >= limits.largeModelWarningThreshold;

  // Approximate memory estimation (average ~350 bytes per normalized entity + coordinates)
  const estimatedMemoryMb = ((totalEntities * 380) / (1024 * 1024)).toFixed(2);

  const rendererMode = isDegradedMode
    ? 'High Performance (Simplified)'
    : isVirtualizing
    ? 'Spatial Viewport Culled'
    : 'Full Direct SVG';

  const handleForcePerformanceToggle = (checked: boolean) => {
    const next = { ...limits, forcePerformanceMode: checked };
    setLimits(next);
    onTogglePerformanceMode?.(checked);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#141416] border border-[#2a2a2e] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#242428] bg-[#1a1a1e]">
          <div className="flex items-center gap-2.5">
            <Gauge className="w-5 h-5 text-orange-500" />
            <h2 className="text-sm font-semibold text-[#f0f0f0]">SysML Large Model Diagnostics & Limits</h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-[#888] hover:text-[#eee] px-2.5 py-1 rounded bg-[#242428] hover:bg-[#333] transition-colors"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Large Model Warning Banner */}
          {isLargeModel && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-950/40 border border-orange-700/50 text-orange-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Very Large Model Detected ({totalEntities.toLocaleString()} entities)</span>
                <p className="mt-0.5 text-orange-300/80">
                  Heavy operations like full-project layout and whole-model SVG export will prompt for confirmation to avoid main-thread freezes.
                </p>
              </div>
            </div>
          )}

          {/* Main-Thread Fallback Warning Banner */}
          {workerDiagnostics && (!workerDiagnostics.workerAvailable || workerDiagnostics.isMainThreadFallback) && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-950/40 border border-red-700/50 text-red-300 text-xs" data-testid="main-thread-fallback-warning">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Main-Thread Fallback Warning</span>
                <p className="mt-0.5 text-red-300/80">
                  {workerDiagnostics.fallbackReason || 'Web Workers are unavailable. Heavy operations are executing synchronously on the main thread.'}
                </p>
              </div>
            </div>
          )}

          {/* Status Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#1a1a1e] border border-[#242428] rounded-lg p-3">
              <div className="flex items-center gap-2 text-[#888] mb-1">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                <span>Total Entities</span>
              </div>
              <div className="text-base font-bold text-[#eee]">{totalEntities.toLocaleString()}</div>
              <div className="text-[10px] text-[#666] mt-0.5">
                {totalBlockCount} blocks, {totalPartCount} parts, {totalRelationshipCount} rels
              </div>
            </div>

            <div className="bg-[#1a1a1e] border border-[#242428] rounded-lg p-3">
              <div className="flex items-center gap-2 text-[#888] mb-1">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Active Viewport</span>
              </div>
              <div className="text-base font-bold text-[#eee]">
                {visibleCount !== undefined ? `${visibleCount.toLocaleString()} visible` : 'All Visible'}
              </div>
              <div className="text-[10px] text-[#666] mt-0.5">
                {isVirtualizing ? 'Offscreen elements culled' : 'Full diagram unculled'}
              </div>
            </div>

            <div className="bg-[#1a1a1e] border border-[#242428] rounded-lg p-3">
              <div className="flex items-center gap-2 text-[#888] mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Renderer Mode</span>
              </div>
              <div className="text-xs font-semibold text-[#ddd] truncate">{rendererMode}</div>
              <div className="text-[10px] text-[#666] mt-0.5">
                {isDegradedMode ? 'Fast simplified nodes' : 'Full details & labels'}
              </div>
            </div>

            <div className="bg-[#1a1a1e] border border-[#242428] rounded-lg p-3">
              <div className="flex items-center gap-2 text-[#888] mb-1">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span>Memory Estimate</span>
              </div>
              <div className="text-base font-bold text-[#eee]">~{estimatedMemoryMb} MB</div>
              <div className="text-[10px] text-[#666] mt-0.5">
                {pendingWorkerJobs > 0 ? `${pendingWorkerJobs} worker task(s) active` : 'Idle worker queue'}
              </div>
            </div>

            {/* Worker Engine & Queue Diagnostics */}
            <div className="bg-[#1a1a1e] border border-[#242428] rounded-lg p-3 col-span-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-[#888]">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Web Worker Engine</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${workerDiagnostics?.workerAvailable && !workerDiagnostics?.isMainThreadFallback ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40' : 'bg-amber-950/50 text-amber-400 border border-amber-800/40'}`}>
                  {workerDiagnostics?.workerAvailable && !workerDiagnostics?.isMainThreadFallback ? 'Isolated Worker Active' : 'Main Thread Fallback'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-[#ddd] mt-2">
                <span>Queue: <strong className="text-[#eee]">{workerDiagnostics?.pendingCount ?? pendingWorkerJobs}</strong> pending</span>
                <span>Stale Rejected: <strong className="text-[#eee]">{workerDiagnostics?.staleCount ?? 0}</strong></span>
                <span>Last Task: <strong className="text-[#eee]">{workerDiagnostics?.lastTaskDurationMs != null ? `${workerDiagnostics.lastTaskDurationMs.toFixed(1)} ms` : 'Idle'}</strong></span>
              </div>
              {workerDiagnostics?.fallbackReason && (
                <div className="text-[10px] text-amber-400/90 mt-1.5" data-testid="worker-fallback-reason">
                  Reason: {workerDiagnostics.fallbackReason}
                </div>
              )}
            </div>
          </div>

          {/* Performance Mode Controls */}
          <div className="bg-[#1a1a1e] border border-[#242428] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-[#eee]">Performance Mode Override</div>
                <div className="text-[10px] text-[#888]">Omit complex node shadows & defer non-essential labels during pan</div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(limits.forcePerformanceMode)}
                onChange={(e) => handleForcePerformanceToggle(e.target.checked)}
                className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
              />
            </div>

            <div className="pt-2 border-t border-[#242428] space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#888]">Spatial Culling Threshold</span>
                <span className="font-mono text-[#eee]">{limits.virtualizationThreshold} items</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#888]">Simplified Rendering Threshold</span>
                <span className="font-mono text-[#eee]">{limits.performanceModeThreshold} items</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#888]">Safety Warning Threshold</span>
                <span className="font-mono text-[#eee]">{limits.largeModelWarningThreshold} items</span>
              </div>
            </div>
          </div>

          {/* Last Save / Persistence Status */}
          {lastSaveTimestamp && (
            <div className="flex items-center justify-between text-[11px] text-[#888] px-1">
              <span>Last Snapshot Saved:</span>
              <span className="font-mono text-[#aaa]">{lastSaveTimestamp}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
