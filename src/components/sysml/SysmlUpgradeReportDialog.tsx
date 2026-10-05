import type { V5ChangeKind, V5UpgradeChange, V5UpgradeReport } from '../../engine/sysml/persistence/migrateV3ToV5';

export interface SysmlUpgradeReportDialogProps {
  report: V5UpgradeReport;
  /** Where the original file was kept, when the project came from a file on disk. */
  backupPath?: string | null;
  /** Set when the backup could not be written. */
  backupError?: string | null;
  onClose: () => void;
}

const GROUP_ORDER: Array<{ kind: V5ChangeKind; title: string }> = [
  { kind: 'type-specialised', title: 'Blocks specialised to keep nested contents apart' },
  { kind: 'record-dropped', title: 'Records that could not be carried over' },
  { kind: 'part-to-property', title: 'Parts' },
  { kind: 'nested-property-added', title: 'Properties added to Blocks' },
  { kind: 'part-retyped', title: 'Properties retyped' },
  { kind: 'port-to-path', title: 'Ports' },
  { kind: 'connector-rewritten', title: 'Connectors' },
  { kind: 'relationship-rewritten', title: 'Relationships' },
  { kind: 'reference-rewritten', title: 'Other references' },
  { kind: 'presentation-rekeyed', title: 'Diagram positions' },
  { kind: 'baseline-carried', title: 'Baselines' },
];

function describeVersion(version: number): string {
  return version >= 2 ? `format ${version}` : 'an early format';
}

export function groupUpgradeChanges(changes: readonly V5UpgradeChange[]): Array<{ kind: V5ChangeKind; title: string; changes: V5UpgradeChange[] }> {
  return GROUP_ORDER
    .map(group => ({ ...group, changes: changes.filter(change => change.kind === group.kind) }))
    .filter(group => group.changes.length > 0);
}

/**
 * Shown after a project written by an older model format was opened. Lists every
 * change by name; the project is upgraded in memory and the file on disk is only
 * replaced when the user saves.
 */
export function SysmlUpgradeReportDialog({ report, backupPath, backupError, onClose }: SysmlUpgradeReportDialogProps) {
  const groups = groupUpgradeChanges(report.changes);
  const warnings = report.changes.filter(change => change.severity === 'warning').length;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="sysml-upgrade-title" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
      <section className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-[#444] bg-[#171717] text-[#eee] shadow-xl">
        <header className="border-b border-[#2a2a2a] px-5 py-4">
          <h2 id="sysml-upgrade-title" className="text-lg font-semibold">Project upgraded to model format {report.toVersion}</h2>
          <p className="mt-1 text-sm text-[#bbb]">
            This project was saved in {describeVersion(report.fromVersion)}. Parts and their ports are now stored as properties of their Blocks.
            The upgrade happened in memory; the file on disk changes only when you save.
          </p>
        </header>

        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm">
          {backupPath ? (
            <p data-testid="upgrade-backup" className="rounded border border-[#2f4f2f] bg-[#142014] px-3 py-2 text-[#b7e0b7]">
              The original file was kept as <span className="font-mono">{backupPath}</span>.
            </p>
          ) : backupError ? (
            <p data-testid="upgrade-backup-error" role="alert" className="rounded border border-red-700 bg-red-950/40 px-3 py-2 text-red-300">
              The original file could not be backed up: {backupError}
            </p>
          ) : (
            <p data-testid="upgrade-backup" className="rounded border border-[#333] px-3 py-2 text-[#bbb]">
              The file you opened was not changed. Keep it as your backup before saving over it.
            </p>
          )}

          {report.changes.length === 0 ? (
            <p data-testid="upgrade-empty" className="text-[#bbb]">No model elements needed to change.</p>
          ) : (
            <>
              <p className="text-[#bbb]">
                {report.changes.length} change{report.changes.length === 1 ? '' : 's'}
                {warnings > 0 ? `, ${warnings} to review` : ''}.
              </p>
              {groups.map(group => (
                <section key={group.kind} aria-label={group.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#999]">{group.title} ({group.changes.length})</h3>
                  <ul className="mt-1 space-y-1">
                    {group.changes.map((change, index) => (
                      <li
                        key={`${group.kind}-${index}`}
                        className={change.severity === 'warning' ? 'rounded border border-amber-700/70 bg-amber-950/30 px-2 py-1 text-amber-200' : 'px-2 py-0.5 text-[#ddd]'}
                      >
                        {change.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>

        <footer className="flex justify-end border-t border-[#2a2a2a] px-5 py-3">
          <button type="button" onClick={onClose} className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white">
            Continue
          </button>
        </footer>
      </section>
    </div>
  );
}
