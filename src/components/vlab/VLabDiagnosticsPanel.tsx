import React from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { serializeVLabError, type VLabDiagnostic, type VLabDiagnosticItem } from '../../engine/vlab/vlabDiagnostics';

/** Human title of each typed diagnostic code of the WP-31c worker contract. */
export const DIAGNOSTIC_TITLES: Record<string, string> = {
  TOPOLOGY: 'Invalid topology',
  PORT_WIDTH: 'Port width mismatch',
  DAE_STRUCTURE: 'Ill-posed system structure',
  NON_FINITE_RESIDUAL: 'Non-finite residual',
  BLOCK_EQUATION: 'Block equation failed',
  SCOPE_READ: 'Scope cannot read its signal',
  SOLVER: 'Solver failure',
  PARAM: 'Invalid parameter',
  MULTIBODY_CONSTRAINT: 'Multibody constraint failure',
  CANCELLED: 'Run cancelled',
  WORKER: 'Simulation worker failure',
  UNKNOWN: 'Simulation failed',
};

/** A failed step as the typed record: a worker rejection carries it, any other Error is serialized the same way. */
export function toRunDiagnostic(error: unknown): VLabDiagnostic {
  const carried = (error as { diagnostic?: VLabDiagnostic } | null)?.diagnostic;
  if (carried && typeof carried === 'object' && typeof carried.code === 'string' && typeof carried.message === 'string') return carried;
  return serializeVLabError(error);
}

/** The pre-run topology report (vlabTopologyValidation.validateTopology) as one TOPOLOGY diagnostic. */
export function topologyRunDiagnostic(message: string, diagnostics: { code: string; reason: string; blockId?: string; portId?: string }[]): VLabDiagnostic {
  const items: VLabDiagnosticItem[] = diagnostics.map(d => ({ code: d.code, message: d.reason, blockId: d.blockId, portId: d.portId, details: {} }));
  return {
    code: 'TOPOLOGY', message, name: 'TopologyValidationError',
    blockId: items[0]?.blockId, blockIds: [...new Set(items.map(i => i.blockId).filter((b): b is string => !!b))],
    portId: items[0]?.portId, details: {}, items,
  };
}

/** Offending blocks and ports of a diagnostic: blockId -> set of port ids (empty set = the block as a whole). */
export function diagnosticTargets(d: VLabDiagnostic | null): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!d) return out;
  const add = (blockId?: string, portId?: string) => {
    if (!blockId) return;
    if (!out.has(blockId)) out.set(blockId, new Set());
    if (portId) out.get(blockId)!.add(portId);
  };
  for (const id of d.blockIds ?? []) add(id);
  add(d.blockId, d.portId);
  for (const item of d.items ?? []) {
    add(item.blockId, item.portId);
    const other = item.details?.otherBlockId;
    if (typeof other === 'string') add(other, typeof item.details?.otherPortId === 'string' ? item.details.otherPortId as string : undefined);
  }
  return out;
}

export interface VLabDiagnosticsPanelProps {
  diagnostic: VLabDiagnostic | null;
  /** block id -> display label */
  labelOf?: (blockId: string) => string;
  onDismiss?: () => void;
  onSelectBlock?: (blockId: string) => void;
}

/** Shows why a run failed: the message, one row per underlying problem with its block / port, and the offending blocks. */
export const VLabDiagnosticsPanel: React.FC<VLabDiagnosticsPanelProps> = ({ diagnostic, labelOf, onDismiss, onSelectBlock }) => {
  if (!diagnostic) return null;
  const label = (id: string) => labelOf?.(id) ?? id;
  const targets = diagnosticTargets(diagnostic);
  const cancelled = diagnostic.code === 'CANCELLED';
  return (
    <div role="alert" data-testid="vlab-diagnostics-panel" data-diagnostic-code={diagnostic.code}
      className={`max-w-xl rounded-xl border px-3 py-2 shadow-2xl backdrop-blur-md text-[11px] ${cancelled ? 'bg-white/5 border-white/10 text-gray-300' : 'bg-red-950/70 border-red-500/40 text-red-200'}`}>
      <div className="flex items-start gap-2">
        {cancelled ? <Info size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />}
        <div className="min-w-0 flex-1">
          <div className="font-bold uppercase tracking-wider text-[10px]" data-testid="vlab-diagnostic-title">
            {DIAGNOSTIC_TITLES[diagnostic.code] ?? 'Simulation failed'} <span className="font-mono opacity-60">[{diagnostic.code}]</span>
          </div>
          <div className="mt-0.5 break-words" data-testid="vlab-diagnostic-message">{diagnostic.message}</div>
          {diagnostic.items.length > 1 && (
            <ul className="mt-1 list-disc pl-4 space-y-0.5" data-testid="vlab-diagnostic-items">
              {diagnostic.items.slice(0, 8).map((item, i) => (
                <li key={i}>
                  {item.blockId && <span className="font-mono text-red-300">{label(item.blockId)}{item.portId ? `.${item.portId}` : ''}: </span>}
                  {item.message}
                </li>
              ))}
              {diagnostic.items.length > 8 && <li>+{diagnostic.items.length - 8} more</li>}
            </ul>
          )}
          {targets.size > 0 && (
            <div className="mt-1 flex flex-wrap gap-1" data-testid="vlab-diagnostic-blocks">
              {[...targets.entries()].map(([blockId, ports]) => (
                <button data-help-feature="live:components/vlab/VLabDiagnosticsPanel:e23988501f96" key={blockId} type="button" onClick={() => onSelectBlock?.(blockId)} data-block-id={blockId}
                  className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] hover:bg-red-500/20">
                  {label(blockId)}{ports.size ? ` (${[...ports].join(', ')})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        {onDismiss && (
          <button data-help-feature="live:components/vlab/VLabDiagnosticsPanel:e6bed41841c3" type="button" aria-label="Dismiss diagnostic" onClick={onDismiss} className="shrink-0 text-red-300/70 hover:text-white"><X size={12} /></button>
        )}
      </div>
    </div>
  );
};
