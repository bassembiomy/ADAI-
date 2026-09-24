import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type {
  ModelTreeNode,
  ExplorerView,
  VisibleTreeRow,
  ExplorerCapability,
  ActiveDiagramContext,
} from '../../features/modelExplorer/modelExplorerTypes';
import { projectModelTree } from '../../features/modelExplorer/modelExplorerProjection';
import { projectDiagramContext } from '../../features/modelExplorer/modelExplorerDiagramContext';
import {
  createModelExplorerDragPayload,
  classifyTreeDropTarget,
  MIME_TYPE_MODEL_ELEMENT,
} from '../../features/modelExplorer/modelExplorerDragDrop';
import {
  loadPersistedExplorerUiState,
  persistExplorerUiState,
} from '../../features/modelExplorer/modelExplorerMultiSelect';
import { VirtualTree } from './VirtualTree';
import { ModelTreeRow } from './ModelTreeRow';
import { ModelExplorerToolbar } from './ModelExplorerToolbar';
import { ModelExplorerMenu } from './ModelExplorerMenu';
import './modelExplorer.css';

export interface ModelExplorerProps {
  nodesById: Map<string, ModelTreeNode> | Record<string, ModelTreeNode>;
  rootNodeIds: string[];
  activeDiagramContext?: ActiveDiagramContext;
  onRevealInContainment?: (semanticId: string) => void;
  selectedNodeIds: Set<string>;
  onSelectNode: (node: ModelTreeNode, multiSelect?: boolean, rangeSelect?: boolean) => void;
  onActivateNode?: (node: ModelTreeNode) => void;
  onContextMenuNode?: (node: ModelTreeNode, event: React.MouseEvent) => void;
  getCapabilities?: (node: ModelTreeNode) => ExplorerCapability[];
  onExecuteCapability?: (capability: ExplorerCapability, node: ModelTreeNode) => void;
  onMoveNode?: (draggedNode: ModelTreeNode, targetNode: ModelTreeNode) => void;
  renamingNodeId?: string | null;
  onRenameCommit?: (nodeId: string, newName: string) => void;
  onRenameCancel?: () => void;
  favoriteNodeIds?: Set<string>;
  onToggleFavorite?: (nodeId: string) => void;
  projectId?: string;
  className?: string;
  height?: number;
}

export const ModelExplorer: React.FC<ModelExplorerProps> = ({
  nodesById,
  rootNodeIds,
  activeDiagramContext,
  onRevealInContainment,
  selectedNodeIds,
  onSelectNode,
  onActivateNode,
  onContextMenuNode,
  getCapabilities,
  onExecuteCapability,
  onMoveNode,
  renamingNodeId,
  onRenameCommit,
  onRenameCancel,
  favoriteNodeIds,
  onToggleFavorite,
  projectId,
  className = '',
  height,
}) => {
  const persistedState = useMemo(() => {
    return projectId ? loadPersistedExplorerUiState(projectId) : null;
  }, [projectId]);

  const [viewMode, setViewMode] = useState<ExplorerView>(() => {
    return persistedState?.activeView || 'containment';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => {
    if (persistedState?.expandedNodeIds && persistedState.expandedNodeIds.length > 0) {
      return new Set(persistedState.expandedNodeIds);
    }
    return new Set(rootNodeIds);
  });
  const [internalFavorites, setInternalFavorites] = useState<Set<string>>(() => {
    if (persistedState?.favorites && persistedState.favorites.length > 0) {
      return new Set(persistedState.favorites);
    }
    return favoriteNodeIds ?? new Set();
  });

  const effectiveFavorites = favoriteNodeIds ?? internalFavorites;

  useEffect(() => {
    if (projectId) {
      persistExplorerUiState(projectId, {
        favorites: Array.from(effectiveFavorites),
        recentSemanticIds: Array.from(selectedNodeIds),
        expandedNodeIds: Array.from(expandedNodeIds),
        activeView: viewMode,
      });
    }
  }, [projectId, effectiveFavorites, selectedNodeIds, expandedNodeIds, viewMode]);

  useEffect(() => {
    setExpandedNodeIds(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const rootId of rootNodeIds) {
        if (!next.has(rootId)) {
          next.add(rootId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rootNodeIds]);

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [localRenamingNodeId, setLocalRenamingNodeId] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<ModelTreeNode | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: ModelTreeNode;
    capabilities: ExplorerCapability[];
  } | null>(null);

  const effectiveRenamingId = renamingNodeId !== undefined ? renamingNodeId : localRenamingNodeId;

  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(400);

  // Measure tree viewport height
  useEffect(() => {
    if (height) return;
    if (!containerRef.current) return;

    const updateHeight = () => {
      if (containerRef.current) {
        // Toolbar is approx 75px
        const totalH = containerRef.current.clientHeight;
        setMeasuredHeight(Math.max(150, totalH - 75));
      }
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [height]);

  const treeHeight = height ?? measuredHeight;

  // Project visible tree rows according to active viewMode and filters
  const visibleRows = useMemo(() => {
    const isDiagramMode = viewMode === 'diagramContext';
    const contextProjection = isDiagramMode && activeDiagramContext
      ? projectDiagramContext({
          roots: rootNodeIds,
          nodes: nodesById instanceof Map ? Object.fromEntries(nodesById.entries()) : nodesById,
          revision: 1,
        }, activeDiagramContext)
      : null;
    const projectedNodes = contextProjection?.nodes ?? nodesById;
    const projectedRoots = contextProjection?.roots ?? rootNodeIds;

    return projectModelTree({
      nodesById: projectedNodes,
      rootNodeIds: projectedRoots,
      expandedNodeIds,
      filterQuery: searchQuery,
      favoritesOnly: showFavoritesOnly,
      favoriteNodeIds: effectiveFavorites,
    });
  }, [
    nodesById,
    rootNodeIds,
    expandedNodeIds,
    searchQuery,
    viewMode,
    activeDiagramContext,
    showFavoritesOnly,
    effectiveFavorites,
  ]);

  // Adjust focused index if out of bounds
  useEffect(() => {
    if (focusedIndex >= visibleRows.length) {
      setFocusedIndex(Math.max(0, visibleRows.length - 1));
    }
  }, [visibleRows.length, focusedIndex]);

  const handleToggleExpand = useCallback((row: VisibleTreeRow) => {
    const nodeId = row.node.nodeId;
    setExpandedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const allParentIds = new Set<string>();
    const nodeMap = nodesById instanceof Map ? nodesById : new Map(Object.entries(nodesById));
    nodeMap.forEach(n => {
      if (n.hasChildren) {
        allParentIds.add(n.nodeId);
      }
    });
    setExpandedNodeIds(allParentIds);
  }, [nodesById]);

  const handleCollapseAll = useCallback(() => {
    setExpandedNodeIds(new Set());
  }, []);

  const isRowExpanded = useCallback(
    (row: VisibleTreeRow) => expandedNodeIds.has(row.node.nodeId),
    [expandedNodeIds]
  );

  const handleRowClick = useCallback(
    (row: VisibleTreeRow, e: React.MouseEvent) => {
      const isMulti = e.ctrlKey || e.metaKey;
      const isRange = e.shiftKey;
      onSelectNode(row.node, isMulti, isRange);
    },
    [onSelectNode]
  );

  const handleRowDoubleClick = useCallback(
    (row: VisibleTreeRow) => {
      if (row.node.hasChildren) {
        handleToggleExpand(row);
      }
      onActivateNode?.(row.node);
    },
    [handleToggleExpand, onActivateNode]
  );

  const handleContextMenu = useCallback(
    (node: ModelTreeNode, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const caps = getCapabilities ? getCapabilities(node) : [];
      if (caps.length > 0) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          node,
          capabilities: caps,
        });
      }
      onContextMenuNode?.(node, e);
    },
    [getCapabilities, onContextMenuNode]
  );

  const handleSelectCapability = useCallback(
    (capability: ExplorerCapability) => {
      if (!contextMenu) return;
      const targetNode = contextMenu.node;
      if (capability.kind === 'rename') {
        setLocalRenamingNodeId(targetNode.nodeId);
      }
      if (capability.kind === 'createElement' || capability.kind === 'createDiagram') {
        setExpandedNodeIds(prev => new Set([...prev, targetNode.nodeId]));
      }
      onExecuteCapability?.(capability, targetNode);
      setContextMenu(null);
    },
    [contextMenu, onExecuteCapability]
  );

  const handleRenameCommit = useCallback(
    (nodeId: string, newName: string) => {
      setLocalRenamingNodeId(null);
      onRenameCommit?.(nodeId, newName);
    },
    [onRenameCommit]
  );

  const handleRenameCancel = useCallback(() => {
    setLocalRenamingNodeId(null);
    onRenameCancel?.();
  }, [onRenameCancel]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        const focusedRow = visibleRows[focusedIndex];
        if (focusedRow && !focusedRow.node.readOnly) {
          e.preventDefault();
          setLocalRenamingNodeId(focusedRow.node.nodeId);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [visibleRows, focusedIndex]);

  return (
    <div
      ref={containerRef}
      className={`model-explorer-container flex flex-col h-full w-full bg-[var(--surface-panel)] border-r border-[var(--border-default)] ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'F2') {
          const focusedRow = visibleRows[focusedIndex];
          if (focusedRow && !focusedRow.node.readOnly) {
            e.preventDefault();
            setLocalRenamingNodeId(focusedRow.node.nodeId);
          }
        }
      }}
    >
      <ModelExplorerToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        showFavoritesOnly={showFavoritesOnly}
        onToggleFavoritesOnly={() => setShowFavoritesOnly(prev => !prev)}
        activeDiagramName={activeDiagramContext?.name}
        diagramAvailable={Boolean(activeDiagramContext)}
      />

      <div className="flex-1 min-h-0 w-full relative">
        {visibleRows.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--text-muted)]">
            {searchQuery
              ? `No model elements matching "${searchQuery}"`
              : viewMode === 'diagramContext'
              ? activeDiagramContext
                ? `No model elements are presented in ${activeDiagramContext.name}`
                : 'No active diagram context'
              : showFavoritesOnly
              ? 'No favorite elements marked'
              : 'Model is empty'}
          </div>
        ) : (
          <VirtualTree
            rows={visibleRows}
            height={treeHeight}
            rowHeight={26}
            focusedIndex={focusedIndex}
            onFocusIndex={setFocusedIndex}
            isExpanded={isRowExpanded}
            onToggleExpand={handleToggleExpand}
            selectedNodeIds={selectedNodeIds}
            onActivateRow={(row) => {
              if (!row.node.readOnly) {
                setLocalRenamingNodeId(row.node.nodeId);
              }
              onActivateNode?.(row.node);
            }}
            renderRow={(row, idx) => (
              <ModelTreeRow
                node={row.node}
                depth={row.depth}
                index={idx}
                isExpanded={isRowExpanded(row)}
                isSelected={selectedNodeIds.has(row.node.nodeId)}
                isFocused={idx === focusedIndex}
                isRenaming={effectiveRenamingId === row.node.nodeId}
                onToggleExpand={() => handleToggleExpand(row)}
                onSelect={(e) => {
                  setFocusedIndex(idx);
                  handleRowClick(row, e);
                }}
                onDoubleClick={() => handleRowDoubleClick(row)}
                onContextMenu={(e) => handleContextMenu(row.node, e)}
                onRenameCommit={(newName) => handleRenameCommit(row.node.nodeId, newName)}
                onRenameCancel={handleRenameCancel}
                onStartRename={() => {
                  if (!row.node.readOnly) {
                    setLocalRenamingNodeId(row.node.nodeId);
                  }
                }}
                draggable={!effectiveRenamingId}
                onDragStart={(e) => {
                  setDraggedNode(row.node);
                  const payload = createModelExplorerDragPayload(row.node);
                  e.dataTransfer.setData(MIME_TYPE_MODEL_ELEMENT, JSON.stringify(payload));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!draggedNode) return;
                  const classification = classifyTreeDropTarget({
                    draggedNode,
                    targetNode: row.node,
                    nodesById,
                  });
                  if (classification.allowed) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropTargetId(row.node.nodeId);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedNode && dropTargetId === row.node.nodeId) {
                    onMoveNode?.(draggedNode, row.node);
                  }
                  setDraggedNode(null);
                  setDropTargetId(null);
                }}
              />
            )}
          />
        )}
      </div>

      {contextMenu && (
        <ModelExplorerMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetNode={contextMenu.node}
          capabilities={contextMenu.capabilities}
          onSelectCapability={handleSelectCapability}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
