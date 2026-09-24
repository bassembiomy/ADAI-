import React, { useRef, useEffect, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Box,
  Component,
  CircleDot,
  ShieldAlert,
  CheckSquare,
  Layers,
  Layout,
  Activity,
  LayoutGrid,
  Square,
  Disc,
  ArrowRight,
  GitCommit,
  FileCode,
} from 'lucide-react';
import type { ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';

export interface ModelTreeRowProps {
  node: ModelTreeNode;
  depth: number;
  index: number;
  isExpanded: boolean;
  isSelected: boolean;
  isFocused: boolean;
  isRenaming?: boolean;
  renameValue?: string;
  onToggleExpand: (e: React.MouseEvent) => void;
  onSelect: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onRenameChange?: (value: string) => void;
  onRenameCommit?: (value: string) => void;
  onRenameCancel?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function getNodeKindIcon(kind: string, domain: string): React.ReactElement {
  const iconProps = { size: 14, className: 'shrink-0' };

  switch (kind) {
    case 'model':
      return <Layers {...iconProps} className="shrink-0 text-blue-400" />;
    case 'package':
      return <Folder {...iconProps} className="shrink-0 text-amber-400" />;
    case 'block':
      return <Box {...iconProps} className="shrink-0 text-emerald-400" />;
    case 'part':
      return <Component {...iconProps} className="shrink-0 text-cyan-400" />;
    case 'port':
      return <CircleDot {...iconProps} className="shrink-0 text-pink-400" />;
    case 'constraint':
      return <ShieldAlert {...iconProps} className="shrink-0 text-yellow-400" />;
    case 'requirement':
      return <CheckSquare {...iconProps} className="shrink-0 text-purple-400" />;
    case 'diagram':
      return <Layout {...iconProps} className="shrink-0 text-sky-400" />;
    case 'state_machine':
      return <Activity {...iconProps} className="shrink-0 text-indigo-400" />;
    case 'region':
      return <LayoutGrid {...iconProps} className="shrink-0 text-violet-400" />;
    case 'state':
      return <Square {...iconProps} className="shrink-0 text-teal-400" />;
    case 'pseudostate':
      return <Disc {...iconProps} className="shrink-0 text-orange-400" />;
    case 'junction':
      return <GitCommit {...iconProps} className="shrink-0 text-red-400" />;
    case 'transition':
      return <ArrowRight {...iconProps} className="shrink-0 text-lime-400" />;
    default:
      return <FileCode {...iconProps} className="shrink-0 text-slate-400" />;
  }
}

export const ModelTreeRow: React.FC<ModelTreeRowProps> = ({
  node,
  depth,
  index,
  isExpanded,
  isSelected,
  isFocused,
  isRenaming = false,
  renameValue,
  onToggleExpand,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const [localRename, setLocalRename] = useState(renameValue ?? node.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setLocalRename(renameValue ?? node.label);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
    }
  }, [isRenaming, renameValue, node.label]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onRenameCommit?.(localRename.trim() || node.label);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onRenameCancel?.();
    }
  };

  const handleBlur = () => {
    if (isRenaming) {
      onRenameCommit?.(localRename.trim() || node.label);
    }
  };

  const indentPx = depth * 16 + 6;

  return (
    <div
      className={`model-tree-row flex items-center h-full w-full pr-2 text-xs select-none cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-600/30 text-white font-medium border-l-2 border-blue-500'
          : isFocused
          ? 'bg-white/10 text-slate-200'
          : 'text-slate-300 hover:bg-white/5'
      }`}
      style={{ paddingLeft: `${indentPx}px` }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable={draggable && !isRenaming}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-node-id={node.nodeId}
      data-semantic-id={node.semanticId}
      data-kind={node.kind}
    >
      {/* Expander toggle */}
      <span className="w-4 h-4 flex items-center justify-center shrink-0 mr-1">
        {node.hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-white rounded focus:outline-none"
            onClick={e => {
              e.stopPropagation();
              onToggleExpand(e);
            }}
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-4 h-4" />
        )}
      </span>

      {/* Node Kind Icon */}
      <span className="mr-1.5 flex items-center justify-center shrink-0">
        {getNodeKindIcon(node.kind, node.domain)}
      </span>

      {/* Label or Inline Rename Input */}
      <div className="flex-1 min-w-0 flex items-center overflow-hidden">
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-slate-800 text-white px-1.5 py-0.5 rounded border border-blue-500 text-xs outline-none shadow-inner"
            value={localRename}
            onChange={e => {
              setLocalRename(e.target.value);
              onRenameChange?.(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="truncate" title={node.label}>
            {node.label}
          </span>
        )}

        {/* Secondary label (e.g., ": Block", ": Real [1]") */}
        {!isRenaming && node.secondaryLabel && (
          <span className="ml-1 text-[10px] text-slate-400/80 truncate shrink-0">
            {node.secondaryLabel}
          </span>
        )}
      </div>

      {/* Badges / Stereotypes */}
      {!isRenaming && node.badges && node.badges.length > 0 && (
        <div className="flex items-center gap-1 ml-1.5 shrink-0">
          {node.badges.map((b, idx) => (
            <span
              key={idx}
              className={`px-1 py-0.2 rounded text-[9px] uppercase tracking-wider font-mono ${
                b.kind === 'error'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : b.kind === 'warning'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-700/60 text-slate-300 border border-slate-600/40'
              }`}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
