import React, { useMemo, useState } from 'react';
import type { SysmlRepository } from '../../engine/sysml/model';
import {
  ALL_ALLOCATION_KINDS,
  ALLOCATION_KIND_LABELS,
  DEFAULT_ALLOCATION_COLUMN_KINDS,
  DEFAULT_ALLOCATION_ROW_KINDS,
  allocationCellKey,
  buildAllocationMatrix,
  type AllocationElementKind,
} from '../../engine/sysml/allocation';
import { impactSeverity } from '../../engine/sysml/mutations';
import { computeImpactHash, type SysmlCommandResult, type SysmlEditorCommand } from '../../services/sysmlCommandGateway';
import { buildCreateAllocationCommand, buildDeleteAllocationCommand } from '../../services/sysmlAllocationCommands';
import { resolveSysmlReferenceLabel } from '../../features/sysml/sysmlDisplayLabel';

export interface AllocationMatrixProps {
  repository: SysmlRepository;
  /** Runs one gateway command; every change in the matrix is exactly one command (one undo step). */
  onExecute: (command: SysmlEditorCommand) => SysmlCommandResult;
  onNavigate?: (elementId: string) => void;
  authorizedBaselineIds?: readonly string[];
}

interface PendingDeletion {
  relationshipIds: string[];
  label: string;
  command: SysmlEditorCommand;
  impact: NonNullable<SysmlCommandResult['impact']>;
}

function KindFilter({ legend, selected, onToggle }: { legend: string; selected: readonly AllocationElementKind[]; onToggle: (kind: AllocationElementKind) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-1 text-[11px]">
      <legend className="sr-only">{legend}</legend>
      <span className="mr-1 font-semibold text-[var(--text-secondary)]">{legend}</span>
      {ALL_ALLOCATION_KINDS.map(kind => (
        <label key={kind} className={`cursor-pointer rounded border px-1.5 py-0.5 ${selected.includes(kind) ? 'border-orange-600 bg-orange-950/50 text-orange-200' : 'border-neutral-700 text-neutral-400'}`}>
          <input type="checkbox" className="sr-only" checked={selected.includes(kind)} onChange={() => onToggle(kind)} aria-label={`${legend}: ${ALLOCATION_KIND_LABELS[kind]}`} />
          {ALLOCATION_KIND_LABELS[kind]}
        </label>
      ))}
    </fieldset>
  );
}

export function AllocationMatrix({ repository, onExecute, onNavigate, authorizedBaselineIds = [] }: AllocationMatrixProps) {
  const [rowKinds, setRowKinds] = useState<AllocationElementKind[]>(DEFAULT_ALLOCATION_ROW_KINDS);
  const [columnKinds, setColumnKinds] = useState<AllocationElementKind[]>(DEFAULT_ALLOCATION_COLUMN_KINDS);
  const [query, setQuery] = useState('');
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const [pending, setPending] = useState<PendingDeletion | null>(null);
  const [message, setMessage] = useState<string>('');

  const matrix = useMemo(() => buildAllocationMatrix(repository, { rowKinds, columnKinds }), [repository, rowKinds, columnKinds]);
  const needle = query.trim().toLocaleLowerCase();
  const rows = needle ? matrix.rows.filter(row => row.name.toLocaleLowerCase().includes(needle)) : matrix.rows;
  const toggle = (setter: React.Dispatch<React.SetStateAction<AllocationElementKind[]>>) => (kind: AllocationElementKind) =>
    setter(current => current.includes(kind) ? current.filter(value => value !== kind) : [...current, kind]);

  const nameOf = (id: string) => resolveSysmlReferenceLabel(repository, id);
  const report = (result: SysmlCommandResult, fallback: string) => {
    setMessage(result.diagnostics.map(diagnostic => diagnostic.message).join(' ') || fallback);
  };

  const allocate = (rowId: string, columnId: string) => {
    const result = onExecute(buildCreateAllocationCommand(repository, rowId, columnId));
    if (result.committed) {
      setMessage(`Allocated ${nameOf(rowId)} to ${nameOf(columnId)}.`);
      setSelectedCell({ rowId, columnId });
    } else report(result, 'The allocation was rejected.');
  };

  const requestDeletion = (relationshipIds: string[], label: string) => {
    const command = buildDeleteAllocationCommand(relationshipIds, authorizedBaselineIds);
    const result = onExecute(command);
    if (result.committed) {
      setMessage(`Removed allocation ${label}.`);
      setSelectedCell(null);
    } else if (result.impact) {
      setPending({ relationshipIds, label, command, impact: result.impact });
    } else report(result, 'The allocation could not be removed.');
  };

  const confirmDeletion = () => {
    if (!pending) return;
    const result = onExecute({ ...pending.command, confirmedImpactHash: computeImpactHash(pending.impact) } as SysmlEditorCommand);
    if (result.committed) {
      setMessage(`Removed allocation ${pending.label}.`);
      setSelectedCell(null);
    } else report(result, 'The allocation could not be removed.');
    setPending(null);
  };

  const selectedIds = selectedCell ? matrix.cells[allocationCellKey(selectedCell.rowId, selectedCell.columnId)] ?? [] : [];
  const blocked = pending ? impactSeverity(pending.impact, authorizedBaselineIds) === 'blocked' : false;

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--surface-canvas)] text-[var(--text-primary)]" aria-labelledby="allocation-title">
      <header className="border-b border-[var(--border-default)] bg-[var(--surface-panel)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="allocation-title" className="text-sm font-semibold">Allocation Matrix</h2>
            <p className="text-[11px] text-neutral-400" data-testid="allocation-coverage">
              {matrix.coverage.allocatedRowCount}/{matrix.coverage.rowCount} rows allocated · {matrix.coverage.unallocatedRowIds.length} unallocated
            </p>
          </div>
          <input aria-label="Search rows" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search rows" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs" />
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <KindFilter legend="Rows" selected={rowKinds} onToggle={toggle(setRowKinds)} />
          <KindFilter legend="Columns" selected={columnKinds} onToggle={toggle(setColumnKinds)} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label="Allocation results" tabIndex={0}>
        <table className="engineering-table border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-[var(--text-secondary)]">
            <tr>
              <th scope="col" className="sticky left-0 border-b border-[var(--border-default)] bg-[var(--table-header-bg)] p-2 font-medium">Allocated from \ to</th>
              {matrix.columns.map(column => (
                <th key={column.id} scope="col" className="border-b border-[var(--border-default)] p-2 font-medium">
                  <button type="button" className="text-left" onClick={() => onNavigate?.(column.id)} title={ALLOCATION_KIND_LABELS[column.kind]}>{column.name}</button>
                  <span className="block text-[10px] font-normal text-neutral-500">{ALLOCATION_KIND_LABELS[column.kind]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b border-neutral-900" data-allocated={!matrix.coverage.unallocatedRowIds.includes(row.id)}>
                <th scope="row" className="sticky left-0 bg-[var(--surface-canvas)] p-2 text-left font-medium">
                  <button type="button" className="text-left" onClick={() => onNavigate?.(row.id)}>{row.name}</button>
                  <span className="block text-[10px] font-normal text-neutral-500">{ALLOCATION_KIND_LABELS[row.kind]}</span>
                </th>
                {matrix.columns.map(column => {
                  const ids = matrix.cells[allocationCellKey(row.id, column.id)] ?? [];
                  const isSelected = selectedCell?.rowId === row.id && selectedCell.columnId === column.id;
                  if (row.id === column.id) return <td key={column.id} className="p-1 text-center text-neutral-700" aria-label="An element cannot be allocated to itself">–</td>;
                  return (
                    <td key={column.id} className="p-1 text-center">
                      <button
                        type="button"
                        aria-label={ids.length ? `Allocated: ${row.name} to ${column.name}` : `Allocate ${row.name} to ${column.name}`}
                        aria-pressed={ids.length ? isSelected : undefined}
                        data-filled={ids.length > 0}
                        onClick={() => ids.length ? setSelectedCell({ rowId: row.id, columnId: column.id }) : allocate(row.id, column.id)}
                        className={`h-6 w-6 rounded border ${ids.length ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300' : 'border-neutral-800 text-neutral-700 hover:border-orange-600 hover:text-orange-300'} ${isSelected ? 'outline outline-1 outline-orange-500' : ''}`}
                      >{ids.length ? (ids.length > 1 ? ids.length : '✓') : '+'}</button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={matrix.columns.length + 1} className="p-8 text-center text-neutral-500">No elements match the selected row kinds.</td></tr>}
          </tbody>
        </table>
        {!matrix.columns.length && <p className="p-4 text-xs text-neutral-500">Select at least one column kind.</p>}
      </div>

      <footer className="border-t border-[var(--border-default)] bg-[var(--surface-panel)] p-2 text-xs" aria-live="polite">
        {selectedCell && selectedIds.length > 0 && !pending && (
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span>«allocate» {nameOf(selectedCell.rowId)} → {nameOf(selectedCell.columnId)}</span>
            <button type="button" className="rounded border border-red-800 px-2 py-0.5 text-red-300 hover:bg-red-950" onClick={() => requestDeletion(selectedIds, `${nameOf(selectedCell.rowId)} → ${nameOf(selectedCell.columnId)}`)}>Delete allocation</button>
          </div>
        )}
        {pending && (
          <div role="alertdialog" aria-label="Confirm allocation deletion" className="mb-1 rounded border border-amber-700 bg-amber-950/40 p-2">
            <p>
              Delete allocation {pending.label}? This removes {pending.impact.deletedElementIds.length} element(s)
              {pending.impact.removedRelationshipIds.length ? ` and ${pending.impact.removedRelationshipIds.length} relationship(s)` : ''}
              {pending.impact.affectedPresentationIds?.length ? `, and ${pending.impact.affectedPresentationIds.length} diagram presentation(s)` : ''}.
              {blocked ? ' This affects a protected baseline that has not been authorized.' : ''}
            </p>
            <div className="mt-1 flex gap-2">
              <button type="button" disabled={blocked} className="rounded border border-red-700 px-2 py-0.5 text-red-200 hover:bg-red-950 disabled:opacity-40" onClick={confirmDeletion}>Confirm delete</button>
              <button type="button" className="rounded border border-neutral-600 px-2 py-0.5" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
        {message && <p data-testid="allocation-message" className="text-neutral-300">{message}</p>}
      </footer>
    </section>
  );
}
