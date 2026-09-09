import React, { useMemo, useRef, useState } from 'react';
import type { SysmlRepository } from '../../engine/sysml/model';
import {
  buildTraceabilityMatrix,
  computeCoverageMetrics,
  exportRtmCsv,
  type RtmStatus,
  type RtmChangeKind,
} from '../../engine/sysml/rtm';
import { VirtualizedTraceabilityGrid } from './VirtualizedTraceabilityGrid';

export interface TraceabilityMatrixProps {
  repository: SysmlRepository;
  onNavigate?: (elementId: string) => void;
  onExport?: (csv: string) => void;
}

export function nextRtmFocusIndex(current: number, key: string, count: number): number {
  if (count <= 0) return -1;
  if (key === 'ArrowDown') return Math.min(count - 1, current + 1);
  if (key === 'ArrowUp') return Math.max(0, current - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return current;
}

export function TraceabilityMatrix({ repository, onNavigate, onExport }: TraceabilityMatrixProps) {
  const [status, setStatus] = useState<RtmStatus | ''>('');
  const [owner, setOwner] = useState('');
  const [risk, setRisk] = useState('');
  const [query, setQuery] = useState('');
  const [compareBaselineId, setCompareBaselineId] = useState('');
  const [changeType, setChangeType] = useState<RtmChangeKind | 'all' | ''>('');
  const [useVirtualGrid, setUseVirtualGrid] = useState(false);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const baselines = Object.values(repository.baselines || {});
  const complete = useMemo(() => buildTraceabilityMatrix(repository, {
    compareBaselineId: compareBaselineId || undefined,
    changeType: (changeType as any) || undefined,
  }), [repository, compareBaselineId, changeType]);

  const matrix = useMemo(() => ({
    ...complete,
    rows: complete.rows.filter(row => {
      if (status && row.status !== status) return false;
      if (owner && row.requirement.owner !== owner) return false;
      if (risk && row.requirement.risk !== risk) return false;
      const needle = query.trim().toLocaleLowerCase();
      return !needle || `${row.requirement.requirementId} ${row.requirement.name} ${row.requirement.text}`.toLocaleLowerCase().includes(needle);
    }),
  }), [complete, owner, query, risk, status]);
  const metrics = useMemo(() => computeCoverageMetrics(complete), [complete]);
  const owners = [...new Set(complete.rows.map(row => row.requirement.owner).filter((value): value is string => Boolean(value)))].sort();

  const exportCsv = () => {
    const csv = exportRtmCsv(matrix);
    if (onExport) return onExport(csv);
    if (typeof document === 'undefined') return;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sysml-rtm-revision-${repository.revision}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#111] text-neutral-100" aria-labelledby="rtm-title">
      <header className="border-b border-neutral-800 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="rtm-title" className="text-sm font-semibold">Requirements Traceability Matrix</h2>
            <p className="text-[11px] text-neutral-400">Canonical revision {repository.revision} · {metrics.covered}/{metrics.total} covered · {metrics.verified} verified</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUseVirtualGrid(prev => !prev)}
              className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                useVirtualGrid ? 'border-orange-500 bg-orange-950/60 text-orange-200' : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {useVirtualGrid ? 'Standard View' : 'Virtualized Grid'}
            </button>
            <button type="button" onClick={exportCsv} className="rounded border border-orange-700 px-3 py-1 text-xs text-orange-300 hover:bg-orange-950">Export CSV</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <input aria-label="Search requirements" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search ID, name, or text" className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs" />
          <select aria-label="Filter by traceability status" value={status} onChange={event => setStatus(event.target.value as RtmStatus | '')} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs">
            <option value="">All trace statuses</option>
            {['verified', 'covered', 'failed', 'stale', 'suspect', 'uncovered', 'orphan', 'unresolved', 'unsupported'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Filter by owner" value={owner} onChange={event => setOwner(event.target.value)} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs">
            <option value="">All owners</option>
            {owners.map(value => <option key={value}>{value}</option>)}
          </select>
          <select aria-label="Filter by risk" value={risk} onChange={event => setRisk(event.target.value)} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs">
            <option value="">All risks</option>
            {['low', 'medium', 'high', 'critical'].map(value => <option key={value}>{value}</option>)}
          </select>
          <select aria-label="Compare with baseline" value={compareBaselineId} onChange={event => setCompareBaselineId(event.target.value)} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs">
            <option value="">No baseline comparison</option>
            {baselines.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select aria-label="Filter by change type" value={changeType} onChange={event => setChangeType(event.target.value as any)} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs">
            <option value="">All change types</option>
            <option value="added">Added</option>
            <option value="modified">Modified</option>
            <option value="suspect">Suspect</option>
            <option value="all">Any change</option>
          </select>
        </div>
      </header>
      <div className="flex-1 overflow-auto" role="region" aria-label="Traceability results" tabIndex={0}>
        {useVirtualGrid ? (
          <VirtualizedTraceabilityGrid
            rows={matrix.rows}
            onNavigate={onNavigate}
            containerHeight={500}
            rowHeight={42}
          />
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-neutral-950 text-neutral-400">
              <tr>{['Requirement', 'Hierarchy & Relations', 'Status', 'Owner / Risk', 'Satisfied by', 'IBD', 'Verification', 'Evidence / Artifacts'].map(label => <th key={label} scope="col" className="border-b border-neutral-800 p-2 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {matrix.rows.map((row, index) => (
                <tr
                  key={row.requirement.id}
                  ref={element => { rowRefs.current[index] = element; }}
                  tabIndex={index === 0 ? 0 : -1}
                  data-status={row.status}
                  className="border-b border-neutral-900 hover:bg-neutral-900 focus:bg-neutral-900 focus:outline focus:outline-1 focus:outline-orange-500"
                  onDoubleClick={() => onNavigate?.(row.requirement.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') return onNavigate?.(row.requirement.id);
                    const next = nextRtmFocusIndex(index, event.key, matrix.rows.length);
                    if (next !== index) { event.preventDefault(); rowRefs.current[next]?.focus(); }
                  }}
                >
                  <td className="p-2"><button type="button" onClick={() => onNavigate?.(row.requirement.id)} className="text-left"><span className="block font-mono text-orange-300">{row.requirement.requirementId}</span><span className="font-medium">{row.requirement.name}</span><span className="block max-w-xs truncate text-neutral-500">{row.requirement.text}</span></button></td>
                  <td className="p-2">
                    <div className="flex flex-col gap-1 max-w-xs">
                      {row.parents && row.parents.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-neutral-500 font-semibold uppercase">Parent:</span>
                          {row.parents.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => onNavigate?.(p.id)}
                              className="inline-flex items-center gap-1 rounded border border-blue-800/60 bg-blue-950/40 px-1.5 py-0.5 text-blue-200 hover:border-blue-500 text-[11px]"
                            >
                              <span className="text-[10px] text-blue-400 font-mono">«{p.kind === 'requirementContainment' ? 'containment' : p.kind}»</span>
                              <span className="font-mono text-orange-300">{p.requirementId}</span>
                              <span className="truncate max-w-[100px]">{p.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {row.children && row.children.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-neutral-500 font-semibold uppercase">Child:</span>
                          {row.children.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => onNavigate?.(c.id)}
                              className="inline-flex items-center gap-1 rounded border border-purple-800/60 bg-purple-950/40 px-1.5 py-0.5 text-purple-200 hover:border-purple-500 text-[11px]"
                            >
                              <span className="text-[10px] text-purple-400 font-mono">«{c.kind === 'requirementContainment' ? 'containment' : c.kind}»</span>
                              <span className="font-mono text-orange-300">{c.requirementId}</span>
                              <span className="truncate max-w-[100px]">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {(!row.parents || row.parents.length === 0) && (!row.children || row.children.length === 0) && (
                        <span className="text-neutral-600 italic">None</span>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    <StatusBadge status={row.status} />
                    {row.changeKind && row.changeKind !== 'unchanged' && (
                      <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/70 text-amber-300 border border-amber-700">
                        [{row.changeKind.toUpperCase()}]
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-neutral-300"><span className="block">{row.requirement.owner || 'Unassigned'}</span><span className="text-neutral-500">{row.requirement.risk || 'unspecified'} risk</span></td>
                  <td className="p-2">
                    {row.coveringBlocks && row.coveringBlocks.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.coveringBlocks.map(cb => (
                          <button
                            key={cb.id}
                            type="button"
                            onClick={() => onNavigate?.(cb.id)}
                            className="inline-flex items-center gap-1 rounded border border-emerald-800/60 bg-emerald-950/40 px-1.5 py-0.5 text-emerald-300 hover:border-emerald-500 text-[11px]"
                          >
                            <span className="text-[10px] text-emerald-400 font-mono">«{cb.kind}»</span>
                            <span>{cb.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <ElementLinks ids={[...row.blocks, ...row.parts]} repository={repository} onNavigate={onNavigate} empty="Uncovered" />
                    )}
                  </td>
                  <td className="p-2"><ElementLinks ids={[...row.ports, ...row.connectors]} repository={repository} onNavigate={onNavigate} empty="None" /></td>
                  <td className="p-2"><ElementLinks ids={row.verificationCases} repository={repository} onNavigate={onNavigate} empty="Not verified" /></td>
                  <td className="p-2"><ElementLinks ids={[...row.evidence, ...row.behaviors, ...row.simulations, ...row.artifacts]} repository={repository} onNavigate={onNavigate} empty="No evidence" /></td>
                </tr>
              ))}
              {!matrix.rows.length && <tr><td colSpan={8} className="p-8 text-center text-neutral-500">No requirements match the active filters.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: RtmStatus }) {
  const tone = status === 'verified' ? 'border-emerald-700 text-emerald-300' : status === 'covered' ? 'border-blue-700 text-blue-300' : status === 'failed' || status === 'unresolved' ? 'border-red-700 text-red-300' : status === 'stale' || status === 'suspect' ? 'border-amber-700 text-amber-300' : 'border-neutral-700 text-neutral-300';
  return <span className={`inline-flex rounded border px-2 py-0.5 font-medium ${tone}`} aria-label={`Traceability status: ${status}`}>{status}</span>;
}

function ElementLinks({ ids, repository, onNavigate, empty }: { ids: string[]; repository: SysmlRepository; onNavigate?: (id: string) => void; empty: string }) {
  if (!ids.length) return <span className="text-neutral-600">{empty}</span>;
  return <div className="flex flex-wrap gap-1">{ids.map(id => <button key={id} type="button" onClick={() => onNavigate?.(id)} className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-neutral-300 hover:border-orange-600">{elementName(repository, id)}</button>)}</div>;
}

function elementName(repository: SysmlRepository, id: string): string {
  return repository.definitions[id]?.name ?? repository.usages[id]?.name ?? repository.verificationCases[id]?.name ?? repository.artifacts[id]?.name ?? repository.connectors[id]?.id ?? repository.evidence[id]?.id ?? id;
}
