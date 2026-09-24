import React from 'react';
import {
  FolderTree,
  Layout,
  Search,
  ChevronsDown,
  ChevronsUp,
  Star,
  X,
} from 'lucide-react';
import type { ExplorerView } from '../../features/modelExplorer/modelExplorerTypes';

export interface ModelExplorerToolbarProps {
  viewMode: ExplorerView;
  onViewModeChange: (mode: ExplorerView) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  showFavoritesOnly?: boolean;
  onToggleFavoritesOnly?: () => void;
  activeDiagramName?: string;
  className?: string;
}

export const ModelExplorerToolbar: React.FC<ModelExplorerToolbarProps> = ({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchQueryChange,
  onExpandAll,
  onCollapseAll,
  showFavoritesOnly = false,
  onToggleFavoritesOnly,
  activeDiagramName,
  className = '',
}) => {
  return (
    <div
      role="toolbar"
      aria-label="Model Explorer Toolbar"
      className={`model-explorer-toolbar flex flex-col gap-1.5 p-2 bg-slate-900 border-b border-slate-800 text-xs ${className}`}
    >
      {/* Top row: View Switcher tabs */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded border border-slate-800">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'containment'}
            onClick={() => onViewModeChange('containment')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              viewMode === 'containment'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Containment Tree (Full Semantic Hierarchy)"
          >
            <FolderTree size={12} />
            <span>Containment</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'diagramContext'}
            onClick={() => onViewModeChange('diagramContext')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              viewMode === 'diagramContext'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title={
              activeDiagramName
                ? `Diagram Context (${activeDiagramName})`
                : 'Diagram Context (Elements visible in active diagram)'
            }
          >
            <Layout size={12} />
            <span>Diagram</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'search'}
            onClick={() => onViewModeChange('search')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              viewMode === 'search'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Search & Filtered View"
          >
            <Search size={12} />
            <span>Search</span>
          </button>
        </div>

        {/* Tree expand / collapse / favorites actions */}
        <div className="flex items-center gap-1">
          {onToggleFavoritesOnly && (
            <button
              type="button"
              aria-label="Toggle Favorites"
              aria-pressed={showFavoritesOnly}
              onClick={onToggleFavoritesOnly}
              className={`p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors ${
                showFavoritesOnly ? 'text-amber-400 bg-amber-500/10' : ''
              }`}
              title="Show Favorites Only"
            >
              <Star size={13} fill={showFavoritesOnly ? 'currentColor' : 'none'} />
            </button>
          )}

          <button
            type="button"
            aria-label="Expand All"
            onClick={onExpandAll}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Expand All"
          >
            <ChevronsDown size={13} />
          </button>

          <button
            type="button"
            aria-label="Collapse All"
            onClick={onCollapseAll}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Collapse All"
          >
            <ChevronsUp size={13} />
          </button>
        </div>
      </div>

      {/* Bottom row: Search input */}
      <div className="relative flex items-center w-full">
        <Search size={12} className="absolute left-2 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchQueryChange(e.target.value)}
          placeholder="Filter model (e.g. Engine, :Block)..."
          className="w-full bg-slate-950 text-slate-200 pl-7 pr-6 py-1 rounded border border-slate-800 text-[11px] placeholder:text-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/40"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Clear Search"
            onClick={() => onSearchQueryChange('')}
            className="absolute right-1.5 p-0.5 text-slate-400 hover:text-white rounded"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
