import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { RtmRow, RtmStatus, RtmChangeKind } from '../../engine/sysml/rtm';

export interface VirtualWindowParams {
  totalRows: number;
  scrollTop: number;
  containerHeight: number;
  rowHeight: number;
  overscan?: number;
}

export interface VirtualWindowResult {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
}

export function computeVirtualWindow({
  totalRows,
  scrollTop,
  containerHeight,
  rowHeight,
  overscan = 2,
}: VirtualWindowParams): VirtualWindowResult {
  if (totalRows <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }
  const rawStart = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(containerHeight / rowHeight);
  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(totalRows, rawStart + visibleCount + overscan);
  const offsetY = startIndex * rowHeight;
  const totalHeight = totalRows * rowHeight;

  return { startIndex, endIndex, offsetY, totalHeight };
}

export function nextGridFocusIndex(
  current: number,
  key: string,
  count: number,
  pageSize = 5,
): number {
  if (count <= 0) return -1;
  if (key === 'ArrowDown') return Math.min(count - 1, current + 1);
  if (key === 'ArrowUp') return Math.max(0, current - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'PageDown') return Math.min(count - 1, current + pageSize);
  if (key === 'PageUp') return Math.max(0, current - pageSize);
  return current;
}

export interface VirtualGridColumn {
  id: string;
  header: string;
  width?: number | string;
}

export interface VirtualizedTraceabilityGridProps {
  rows: RtmRow[];
  containerHeight?: number;
  rowHeight?: number;
  scrollTop?: number;
  onNavigate?: (elementId: string) => void;
  className?: string;
}

export function VirtualizedTraceabilityGrid({
  rows,
  containerHeight = 400,
  rowHeight = 40,
  scrollTop: controlledScrollTop,
  onNavigate,
  className = '',
}: VirtualizedTraceabilityGridProps) {
  const [internalScrollTop, setInternalScrollTop] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  const currentScrollTop = controlledScrollTop !== undefined ? controlledScrollTop : internalScrollTop;

  const virtualWindow = computeVirtualWindow({
    totalRows: rows.length,
    scrollTop: currentScrollTop,
    containerHeight,
    rowHeight,
    overscan: 3,
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (controlledScrollTop === undefined) {
      setInternalScrollTop(e.currentTarget.scrollTop);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      const row = rows[index];
      if (row && onNavigate) {
        onNavigate(row.requirement.id);
      }
      return;
    }
    const nextIndex = nextGridFocusIndex(index, e.key, rows.length, Math.floor(containerHeight / rowHeight));
    if (nextIndex !== index) {
      e.preventDefault();
      setFocusedIndex(nextIndex);
      rowRefs.current[nextIndex]?.focus();
      // Auto-scroll if necessary
      if (containerRef.current) {
        const targetTop = nextIndex * rowHeight;
        if (targetTop < containerRef.current.scrollTop) {
          containerRef.current.scrollTop = targetTop;
        } else if (targetTop + rowHeight > containerRef.current.scrollTop + containerHeight) {
          containerRef.current.scrollTop = targetTop + rowHeight - containerHeight;
        }
      }
    }
  };

  const visibleRows = rows.slice(virtualWindow.startIndex, virtualWindow.endIndex);

  const statusColors: Record<RtmStatus, { bg: string; border: string; text: string }> = {
    verified: { bg: 'bg-emerald-950/40', border: 'border-emerald-700', text: 'text-emerald-300' },
    covered: { bg: 'bg-blue-950/40', border: 'border-blue-700', text: 'text-blue-300' },
    failed: { bg: 'bg-red-950/40', border: 'border-red-700', text: 'text-red-300' },
    stale: { bg: 'bg-amber-950/40', border: 'border-amber-700', text: 'text-amber-300' },
    suspect: { bg: 'bg-orange-950/40', border: 'border-orange-700', text: 'text-orange-300' },
    uncovered: { bg: 'bg-neutral-900', border: 'border-neutral-700', text: 'text-neutral-400' },
    orphan: { bg: 'bg-purple-950/40', border: 'border-purple-700', text: 'text-purple-300' },
    unsupported: { bg: 'bg-neutral-900', border: 'border-neutral-700', text: 'text-neutral-500' },
    unresolved: { bg: 'bg-rose-950/40', border: 'border-rose-700', text: 'text-rose-300' },
  };

  const changeBadges: Record<RtmChangeKind, { label: string; bg: string; text: string }> = {
    added: { label: '[ADDED]', bg: 'bg-green-900/60', text: 'text-green-300' },
    modified: { label: '[MODIFIED]', bg: 'bg-amber-900/60', text: 'text-amber-300' },
    suspect: { label: '[SUSPECT]', bg: 'bg-orange-900/60', text: 'text-orange-300' },
    unchanged: { label: '', bg: '', text: '' },
  };

  const headers = [
    { label: 'Requirement', width: '28%' },
    { label: 'Status & Change', width: '16%' },
    { label: 'Owner / Risk', width: '14%' },
    { label: 'Satisfied by', width: '14%' },
    { label: 'IBD', width: '10%' },
    { label: 'Verification', width: '10%' },
    { label: 'Evidence', width: '8%' },
  ];

  return (
    <div
      role="grid"
      aria-rowcount={rows.length}
      aria-colcount={headers.length}
      className={`flex flex-col h-full border border-neutral-800 rounded bg-[#0d0d0d] text-neutral-200 text-xs overflow-hidden ${className}`}
    >
      {/* Sticky Header */}
      <div
        role="row"
        className="flex bg-neutral-950 border-b border-neutral-800 font-semibold text-neutral-400 select-none shrink-0"
        style={{ height: rowHeight }}
      >
        {headers.map((h, i) => (
          <div
            key={h.label}
            role="columnheader"
            aria-colindex={i + 1}
            className="px-3 flex items-center border-r border-neutral-800 last:border-r-0 truncate"
            style={{ width: h.width }}
          >
            {h.label}
          </div>
        ))}
      </div>

      {/* Virtual Scroll Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden relative focus:outline-none"
        style={{ height: containerHeight }}
        tabIndex={0}
      >
        {/* Total Height Spacer */}
        <div style={{ height: virtualWindow.totalHeight, width: '100%', position: 'relative' }}>
          {/* Visible Rows Container */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${virtualWindow.offsetY}px)`,
            }}
          >
            {visibleRows.map((row, relativeIdx) => {
              const absoluteIdx = virtualWindow.startIndex + relativeIdx;
              const isFocused = focusedIndex === absoluteIdx;
              const style = statusColors[row.status] || statusColors.uncovered;
              const changeInfo = row.changeKind ? changeBadges[row.changeKind] : undefined;

              return (
                <div
                  key={row.requirement.id}
                  ref={el => { rowRefs.current[absoluteIdx] = el; }}
                  role="row"
                  aria-rowindex={absoluteIdx + 1}
                  data-status={row.status}
                  tabIndex={isFocused ? 0 : -1}
                  onKeyDown={e => handleKeyDown(e, absoluteIdx)}
                  onClick={() => setFocusedIndex(absoluteIdx)}
                  onDoubleClick={() => onNavigate?.(row.requirement.id)}
                  style={{ height: rowHeight }}
                  className={`flex items-center border-b border-neutral-900 transition-colors cursor-pointer ${
                    isFocused ? 'bg-neutral-800/80 outline outline-1 outline-orange-500' : 'hover:bg-neutral-900/70'
                  }`}
                >
                  {/* Col 1: Requirement ID & Name */}
                  <div
                    role="gridcell"
                    aria-colindex={1}
                    className="px-3 flex flex-col justify-center border-r border-neutral-900 overflow-hidden"
                    style={{ width: headers[0].width }}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono text-orange-400 font-semibold">{row.requirement.requirementId}</span>
                      <span className="font-medium text-neutral-200 truncate">{row.requirement.name}</span>
                    </div>
                    {row.requirement.text && (
                      <span className="text-[10px] text-neutral-500 truncate" title={row.requirement.text}>
                        {row.requirement.text}
                      </span>
                    )}
                  </div>

                  {/* Col 2: Status & Change Badge */}
                  <div
                    role="gridcell"
                    aria-colindex={2}
                    className="px-3 flex items-center gap-1.5 border-r border-neutral-900 truncate"
                    style={{ width: headers[1].width }}
                  >
                    <span
                      aria-label={`Traceability status: ${row.status}`}
                      className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border ${style.bg} ${style.border} ${style.text}`}
                    >
                      {row.status}
                    </span>
                    {changeInfo && changeInfo.label && (
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${changeInfo.bg} ${changeInfo.text}`}
                      >
                        {changeInfo.label}
                      </span>
                    )}
                  </div>

                  {/* Col 3: Owner / Risk */}
                  <div
                    role="gridcell"
                    aria-colindex={3}
                    className="px-3 flex flex-col justify-center border-r border-neutral-900 truncate text-[11px]"
                    style={{ width: headers[2].width }}
                  >
                    <span className="text-neutral-300 truncate">{row.requirement.owner || 'Unassigned'}</span>
                    {row.requirement.risk && (
                      <span className="text-[10px] text-neutral-500 capitalize">{row.requirement.risk} risk</span>
                    )}
                  </div>

                  {/* Col 4: Satisfied by (blocks) */}
                  <div
                    role="gridcell"
                    aria-colindex={4}
                    className="px-3 flex items-center gap-1 border-r border-neutral-900 truncate"
                    style={{ width: headers[3].width }}
                  >
                    {row.blocks.length > 0 ? (
                      row.blocks.map(id => (
                        <button
                          key={id}
                          type="button"
                          onClick={e => { e.stopPropagation(); onNavigate?.(id); }}
                          className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-[10px] text-neutral-300 hover:border-orange-500"
                        >
                          {id}
                        </button>
                      ))
                    ) : (
                      <span className="text-neutral-600 text-[11px]">None</span>
                    )}
                  </div>

                  {/* Col 5: IBD (Parts/Connectors) */}
                  <div
                    role="gridcell"
                    aria-colindex={5}
                    className="px-3 flex items-center gap-1 border-r border-neutral-900 truncate text-[11px]"
                    style={{ width: headers[4].width }}
                  >
                    {row.parts.length + row.connectors.length > 0 ? (
                      <span className="text-neutral-300">
                        {row.parts.length > 0 && `${row.parts.length} parts `}
                        {row.connectors.length > 0 && `${row.connectors.length} conns`}
                      </span>
                    ) : (
                      <span className="text-neutral-600">None</span>
                    )}
                  </div>

                  {/* Col 6: Verification Cases */}
                  <div
                    role="gridcell"
                    aria-colindex={6}
                    className="px-3 flex items-center gap-1 border-r border-neutral-900 truncate text-[11px]"
                    style={{ width: headers[5].width }}
                  >
                    {row.verificationCases.length > 0 ? (
                      row.verificationCases.map(vc => (
                        <button
                          key={vc}
                          type="button"
                          onClick={e => { e.stopPropagation(); onNavigate?.(vc); }}
                          className="px-1 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-[10px] text-neutral-300 hover:border-orange-500"
                        >
                          {vc}
                        </button>
                      ))
                    ) : (
                      <span className="text-neutral-600">None</span>
                    )}
                  </div>

                  {/* Col 7: Evidence */}
                  <div
                    role="gridcell"
                    aria-colindex={7}
                    className="px-3 flex items-center gap-1 truncate text-[11px]"
                    style={{ width: headers[6].width }}
                  >
                    {row.evidence.length > 0 ? (
                      <span className="text-emerald-400 font-mono text-[10px]">{row.evidence.length} passed</span>
                    ) : (
                      <span className="text-neutral-600">None</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
