import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCcw } from 'lucide-react';

export interface HILToolStatus {
  ok: boolean;
  tool: string | null;
  path: string | null;
  version: string | null;
}

export interface HILTargetEnvStatus {
  target: string;
  compiler: HILToolStatus;
  flasher: HILToolStatus;
  halAvailable?: boolean;
  code?: string;
  compileBlockedReason?: string;
  flashBlockedReason?: string;
  blockedReason?: string;
}

export type HILEnvLevel = 'ready' | 'partial' | 'blocked' | 'unsupported' | 'unknown';

export interface HILEnvSummary {
  level: HILEnvLevel;
  label: string;
  compileBlockedReason?: string;
  flashBlockedReason?: string;
}

/** Pure mapping from an IPC status row to what the UI (and Compile/Flash buttons) need. */
export function summarizeTargetStatus(status: HILTargetEnvStatus | undefined | null): HILEnvSummary {
  if (!status) return { level: 'unknown', label: 'Checking environment...' };
  if (status.code === 'TARGET_NOT_YET_SUPPORTED') {
    return {
      level: 'unsupported',
      label: 'Not yet supported',
      compileBlockedReason: status.compileBlockedReason,
      flashBlockedReason: status.flashBlockedReason,
    };
  }
  if (status.compileBlockedReason) {
    return { level: 'blocked', label: status.compileBlockedReason, compileBlockedReason: status.compileBlockedReason, flashBlockedReason: status.flashBlockedReason };
  }
  if (status.flashBlockedReason) {
    return { level: 'partial', label: `Compile ready. ${status.flashBlockedReason}`, flashBlockedReason: status.flashBlockedReason };
  }
  return { level: 'ready', label: 'Toolchain ready' };
}

interface HILEnvironmentStatusProps {
  target: string;
  /** Lets the parent disable Compile/Flash with the reason shown here. */
  onStatusChange?: (summary: HILEnvSummary) => void;
}

export const HILEnvironmentStatus: React.FC<HILEnvironmentStatusProps> = ({ target, onStatusChange }) => {
  const [rows, setRows] = useState<HILTargetEnvStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { ipcRenderer } = (window as any).require('electron');
      const res = await ipcRenderer.invoke('hil-env-status');
      if (res && res.success && Array.isArray(res.targets)) {
        setRows(res.targets);
        setError(null);
      } else {
        setError((res && res.error) || 'Environment check failed');
      }
    } catch (e: any) {
      // Not running inside Electron (browser dev / tests): readiness is simply unknown.
      setError(e && e.message ? String(e.message) : 'Environment check unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const status = rows ? rows.find((r) => r.target === target) : null;
  const summary = summarizeTargetStatus(status);

  useEffect(() => {
    if (onStatusChange) onStatusChange(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.level, summary.label, summary.compileBlockedReason, summary.flashBlockedReason]);

  const Icon = summary.level === 'ready' ? CheckCircle2 : summary.level === 'partial' || summary.level === 'unknown' ? AlertTriangle : XCircle;
  const color = summary.level === 'ready' ? 'text-emerald-400' : summary.level === 'partial' || summary.level === 'unknown' ? 'text-amber-400' : 'text-red-400';

  return (
    <div
      data-testid="hil-env-status"
      data-level={summary.level}
      className="flex items-center gap-2 text-[10px] font-mono bg-[#141414] border border-[#2d2d2d] rounded px-2 py-1"
      title={status ? [status.compiler.path, status.flasher.path].filter(Boolean).join('\n') : undefined}
    >
      <Icon size={12} className={color} />
      <span className="text-[#888] font-bold uppercase">Environment:</span>
      <span className={color}>{error && !status ? error : summary.label}</span>
      {status && status.compiler.ok && status.compiler.version && (
        <span className="text-[#666]">{status.compiler.tool} {status.compiler.version}</span>
      )}
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={loading}
        className="ml-auto text-[#888] hover:text-white disabled:opacity-40"
        aria-label="Re-check environment"
      >
        <RefreshCcw size={11} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
};
