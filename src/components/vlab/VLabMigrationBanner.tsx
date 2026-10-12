import React, { useMemo, useState } from 'react';
import { Info, X } from 'lucide-react';

export interface VLabMigrationNotice {
  key: string;
  nodeId: string;
  block: string;
  notice: string;
}

/** Every `data.migrationNotices` entry of the loaded model, one per block and notice text. */
export function collectMigrationNotices(nodes: { id: string; data?: any }[]): VLabMigrationNotice[] {
  const out: VLabMigrationNotice[] = [];
  for (const n of nodes) {
    const list = n.data?.migrationNotices;
    if (!Array.isArray(list)) continue;
    for (const notice of list) {
      if (typeof notice !== 'string' || !notice.trim()) continue;
      out.push({ key: `${n.id}\u0000${notice}`, nodeId: n.id, block: String(n.data?.label || n.data?.type || n.id), notice });
    }
  }
  return out;
}

/**
 * Dismissible list of the changes a model migration made to the loaded blocks (a lost Kt, the +293.15 K thermal reference,
 * a changed dead-zone behaviour, N -> N12, ...). It appears when a model with notices is loaded and stays hidden once dismissed.
 */
export const VLabMigrationBanner: React.FC<{ nodes: { id: string; data?: any }[]; onSelectBlock?: (id: string) => void }> = ({ nodes, onSelectBlock }) => {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const notices = useMemo(() => collectMigrationNotices(nodes), [nodes]);
  const pending = notices.filter(n => !dismissed.has(n.key));
  if (pending.length === 0) return null;
  return (
    <div role="status" data-testid="vlab-migration-banner"
      className="max-w-xl rounded-xl border border-amber-500/40 bg-amber-950/70 px-3 py-2 text-[11px] text-amber-100 shadow-2xl backdrop-blur-md">
      <div className="flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider">Model updated on load: {pending.length} notice{pending.length === 1 ? '' : 's'}</div>
          <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4" data-testid="vlab-migration-notices">
            {pending.map(n => (
              <li key={n.key}>
                <button data-help-feature="live:components/vlab/VLabMigrationBanner:632a1fb636d5" type="button" className="font-mono text-amber-300 underline-offset-2 hover:underline" onClick={() => onSelectBlock?.(n.nodeId)}>{n.block}</button>
                {': '}{n.notice}
              </li>
            ))}
          </ul>
        </div>
        <button data-help-feature="live:components/vlab/VLabMigrationBanner:9923a59f6aa3" type="button" aria-label="Dismiss migration notices" onClick={() => setDismissed(new Set(notices.map(n => n.key)))} className="shrink-0 text-amber-200/70 hover:text-white"><X size={12} /></button>
      </div>
    </div>
  );
};
