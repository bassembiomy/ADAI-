import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { VisibleTreeRow } from '../../features/modelExplorer/modelExplorerTypes';

export interface VirtualTreeWindowOptions {
  totalRows: number;
  scrollTop: number;
  containerHeight: number;
  rowHeight: number;
  overscan?: number;
}

export interface VirtualTreeWindow {
  startIndex: number;
  endIndex: number;
  startOffset: number;
  totalHeight: number;
}

export function computeVirtualTreeWindow({
  totalRows,
  scrollTop,
  containerHeight,
  rowHeight,
  overscan = 5,
}: VirtualTreeWindowOptions): VirtualTreeWindow {
  if (totalRows <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, startOffset: 0, totalHeight: 0 };
  }

  const effectiveScrollTop = Math.max(0, scrollTop);
  const rawStartIndex = Math.floor(effectiveScrollTop / rowHeight);
  const visibleCount = Math.ceil(containerHeight / rowHeight);

  const startIndex = Math.max(0, rawStartIndex - overscan);
  const endIndex = Math.min(totalRows, rawStartIndex + visibleCount + overscan);
  const startOffset = startIndex * rowHeight;
  const totalHeight = totalRows * rowHeight;

  return {
    startIndex,
    endIndex,
    startOffset,
    totalHeight,
  };
}

export interface TreeKeyNavigationOptions {
  key: string;
  focusedIndex: number;
  totalRows: number;
  isExpanded: boolean;
  hasChildren: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onFocusIndex: (index: number) => void;
  onActivate?: () => void;
}

export function handleTreeKeyNavigation({
  key,
  focusedIndex,
  totalRows,
  isExpanded,
  hasChildren,
  onExpand,
  onCollapse,
  onFocusIndex,
  onActivate,
}: TreeKeyNavigationOptions): boolean {
  if (totalRows <= 0) return false;

  switch (key) {
    case 'ArrowDown': {
      if (focusedIndex < totalRows - 1) {
        onFocusIndex(focusedIndex + 1);
      }
      return true;
    }
    case 'ArrowUp': {
      if (focusedIndex > 0) {
        onFocusIndex(focusedIndex - 1);
      }
      return true;
    }
    case 'ArrowRight': {
      if (hasChildren && !isExpanded) {
        onExpand();
      } else if (hasChildren && isExpanded && focusedIndex < totalRows - 1) {
        onFocusIndex(focusedIndex + 1);
      }
      return true;
    }
    case 'ArrowLeft': {
      if (hasChildren && isExpanded) {
        onCollapse();
      }
      return true;
    }
    case 'Home': {
      onFocusIndex(0);
      return true;
    }
    case 'End': {
      onFocusIndex(totalRows - 1);
      return true;
    }
    case 'Enter':
    case ' ': {
      if (onActivate) {
        onActivate();
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

export interface VirtualTreeProps {
  rows: VisibleTreeRow[];
  height: number;
  rowHeight?: number;
  overscan?: number;
  focusedIndex: number;
  onFocusIndex: (index: number) => void;
  isExpanded: (row: VisibleTreeRow) => boolean;
  onToggleExpand: (row: VisibleTreeRow) => void;
  renderRow: (row: VisibleTreeRow, index: number) => React.ReactNode;
  onActivateRow?: (row: VisibleTreeRow, index: number) => void;
  className?: string;
  ariaLabel?: string;
  selectedNodeIds?: Set<string>;
}

export const VirtualTree: React.FC<VirtualTreeProps> = ({
  rows,
  height,
  rowHeight = 28,
  overscan = 5,
  focusedIndex,
  onFocusIndex,
  isExpanded,
  onToggleExpand,
  renderRow,
  onActivateRow,
  className = '',
  ariaLabel = 'Model Tree Explorer',
  selectedNodeIds,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const windowSlice = computeVirtualTreeWindow({
    totalRows: rows.length,
    scrollTop,
    containerHeight: height,
    rowHeight,
    overscan,
  });

  const visibleRows = rows.slice(windowSlice.startIndex, windowSlice.endIndex);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentRow = rows[focusedIndex];
      if (!currentRow) return;

      const expanded = isExpanded(currentRow);
      const hasChildren = currentRow.node.hasChildren;

      const handled = handleTreeKeyNavigation({
        key: e.key,
        focusedIndex,
        totalRows: rows.length,
        isExpanded: expanded,
        hasChildren,
        onExpand: () => {
          if (!expanded) onToggleExpand(currentRow);
        },
        onCollapse: () => {
          if (expanded) onToggleExpand(currentRow);
        },
        onFocusIndex,
        onActivate: () => {
          onActivateRow?.(currentRow, focusedIndex);
        },
      });

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [rows, focusedIndex, isExpanded, onToggleExpand, onFocusIndex, onActivateRow]
  );

  // Auto-scroll focused item into view
  useEffect(() => {
    if (!containerRef.current) return;
    const targetTop = focusedIndex * rowHeight;
    const targetBottom = targetTop + rowHeight;
    const currentScroll = containerRef.current.scrollTop;
    const viewportHeight = height;

    if (targetTop < currentScroll) {
      containerRef.current.scrollTop = targetTop;
    } else if (targetBottom > currentScroll + viewportHeight) {
      containerRef.current.scrollTop = targetBottom - viewportHeight;
    }
  }, [focusedIndex, rowHeight, height]);

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label={ariaLabel}
      aria-multiselectable="true"
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className={`model-virtual-tree-container outline-none focus:ring-1 focus:ring-blue-500/40 ${className}`}
      style={{
        height,
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        className="model-virtual-tree-spacer"
        style={{
          height: windowSlice.totalHeight,
          width: '100%',
          position: 'relative',
        }}
      >
        <div
          className="model-virtual-tree-slice"
          style={{
            transform: `translateY(${windowSlice.startOffset}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleRows.map((row, relativeIdx) => {
            const absoluteIdx = windowSlice.startIndex + relativeIdx;
            const isRowExpanded = isExpanded(row);
            const isSelected = selectedNodeIds ? selectedNodeIds.has(row.node.nodeId) : false;
            const isItemFocused = absoluteIdx === focusedIndex;

            return (
              <div
                key={row.node.nodeId}
                role="treeitem"
                aria-expanded={row.node.hasChildren ? isRowExpanded : undefined}
                aria-level={row.depth + 1}
                aria-selected={isSelected}
                tabIndex={isItemFocused ? 0 : -1}
                data-node-id={row.node.nodeId}
                data-semantic-id={row.node.semanticId}
                data-index={absoluteIdx}
                style={{ height: rowHeight }}
                className="model-virtual-tree-row-wrapper select-none"
              >
                {renderRow(row, absoluteIdx)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
