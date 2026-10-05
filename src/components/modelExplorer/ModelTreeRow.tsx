import React, { useRef, useEffect, useState } from 'react';
import {
  Folder,
  Layers,
  Box,
  Component,
  CircleDot,
  CheckSquare,
  ShieldAlert,
  Layout,
  Activity,
  LayoutGrid,
  Square,
  Disc,
  GitCommit,
  ArrowRight,
  FileCode,
  FlaskConical,
  Workflow,
  Ruler,
  Scale,
  Eye,
  Telescope,
  User,
  ArrowLeftRight,
  Frame,
  MessageSquare,
  Rows3,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import type { ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';
import {
  portKindToPresentationRole,
  semanticPresentationToken,
  type SemanticPresentationRole,
} from '../../engine/sysml/semanticPresentationStyles';

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
  onRenameChange?: (val: string) => void;
  onRenameCommit?: (val: string) => void;
  onRenameCancel?: () => void;
  onStartRename?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

/**
 * Review follow-up (Finding 5b): tree node kinds mapped onto the centralized
 * semantic presentation roles (spec 3.5). Kinds with a genuine semantic role
 * resolve to that role's token; every other kind resolves to the neutral
 * requirement fallback through the same resolver (never a hard-coded
 * Tailwind palette color), so light/dark themes apply via `index.css`.
 * Port granularity: the explorer adapter emits `proxyPort` / `fullPort` /
 * `flowPort` node kinds where the definition carries them and generic
 * `port` for standard UML ports, so sub-kinds map to their respective port
 * roles while a bare `port` deterministically stays the Standard Port role
 * (never promoted to proxy/full).
 */
export function nodeKindToPresentationRole(kind: string): SemanticPresentationRole {
  switch (kind) {
    case 'block':
    case 'part':
      return 'block';
    case 'requirement':
    case 'testCase':
      return 'requirement';
    case 'state':
    case 'state_machine':
    case 'region':
    case 'pseudostate':
    case 'junction':
    case 'transition':
      return 'state';
    case 'port':
    case 'proxy':
    case 'proxyPort':
    case 'full':
    case 'fullPort':
    case 'flow':
    case 'flowPort':
    case 'standard':
    case 'standardPort':
    case 'umlPort':
      return portKindToPresentationRole(kind);
    default:
      return 'requirement';
  }
}

export function getNodeKindIcon(kind: string, _domain: string): React.ReactElement {
  // Token-backed glyph color: icons/shapes stay the non-color indicators;
  // selection/focus row states are untouched (handled by the row container).
  const iconProps = {
    size: 14,
    className: 'shrink-0',
    style: { color: semanticPresentationToken(nodeKindToPresentationRole(kind)) },
  };

  switch (kind) {
    case 'model':
      return <Layers {...iconProps} />;
    case 'package':
      return <Folder {...iconProps} />;
    case 'block':
    case 'part':
      return kind === 'block' ? <Box {...iconProps} /> : <Component {...iconProps} />;
    case 'port':
    case 'proxy':
    case 'proxyPort':
    case 'full':
    case 'fullPort':
    case 'flow':
    case 'flowPort':
    case 'standard':
    case 'standardPort':
    case 'umlPort':
      return <CircleDot {...iconProps} />;
    case 'constraint':
      return <ShieldAlert {...iconProps} />;
    case 'requirement':
    case 'testCase':
      return <CheckSquare {...iconProps} />;
    case 'diagram':
      return <Layout {...iconProps} />;
    case 'state_machine':
      return <Activity {...iconProps} />;
    case 'region':
      return <LayoutGrid {...iconProps} />;
    case 'state':
    case 'pseudostate':
    case 'junction':
    case 'transition':
      if (kind === 'pseudostate') return <Disc {...iconProps} />;
      if (kind === 'junction') return <GitCommit {...iconProps} />;
      if (kind === 'transition') return <ArrowRight {...iconProps} />;
      return <Square {...iconProps} />;
    case 'unit':
      return <Ruler {...iconProps} />;
    case 'quantityKind':
      return <Scale {...iconProps} />;
    case 'view':
      return <Eye {...iconProps} />;
    case 'viewpoint':
      return <Telescope {...iconProps} />;
    case 'stakeholder':
      return <User {...iconProps} />;
    case 'activity':
      return <Workflow {...iconProps} />;
    case 'interaction':
      return <ArrowLeftRight {...iconProps} />;
    case 'lifeline':
      return <Rows3 {...iconProps} />;
    case 'message':
      return <MessageSquare {...iconProps} />;
    case 'fragment':
    case 'interactionUse':
      return <Frame {...iconProps} />;
    case 'interactionConstraint':
    case 'stateInvariant':
      return <Square {...iconProps} />;
    case 'xbridgesModel':
      return <Workflow {...iconProps} />;
    case 'vlabModel':
      return <FlaskConical {...iconProps} />;
    default:
      return <FileCode {...iconProps} />;
  }
}

export const ModelTreeRow: React.FC<ModelTreeRowProps> = ({
  node,
  depth,
  index: _index,
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
  onStartRename,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localRename, setLocalRename] = useState(renameValue ?? node.label);

  useEffect(() => {
    if (isRenaming) {
      setLocalRename(renameValue ?? node.label);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
    }
  }, [isRenaming, renameValue, node.label]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.preventDefault();
      onRenameCommit?.(localRename.trim() || node.label);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
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
      tabIndex={isFocused ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === 'F2' && !node.readOnly) {
          e.preventDefault();
          e.stopPropagation();
          onStartRename?.();
        }
      }}
      className={`model-tree-row flex items-center h-full w-full pr-2 text-xs select-none cursor-pointer transition-colors ${
        isSelected
          ? 'bg-[var(--diagram-node-selected)] text-white font-medium border-l-2 border-[var(--focus-ring)]'
          : isFocused
          ? 'bg-[var(--surface-raised)] text-[var(--text-primary)]'
          : 'text-[var(--text-primary)] hover:bg-[var(--surface-raised)]'
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
            className="w-4 h-4 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded focus:outline-none"
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
            className="w-full bg-[var(--surface-canvas)] text-[var(--text-primary)] px-1.5 py-0.5 rounded border border-[var(--focus-ring)] text-xs outline-none shadow-inner"
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
          <span className="ml-1 text-[10px] text-[var(--text-muted)] truncate shrink-0">
            {node.secondaryLabel}
          </span>
        )}
      </div>

      {/* Badges / Stereotypes */}
      {!isRenaming && node.badges && node.badges.length > 0 && (
        <div className="flex items-center gap-1 ml-1.5 shrink-0">
          {node.badges.map((b: { kind: string; label: string }, idx: number) => (
            <span
              key={idx}
              className={`px-1 py-0.2 rounded text-[9px] uppercase tracking-wider font-mono ${
                b.kind === 'error'
                  ? 'bg-[var(--surface-raised)] text-[var(--status-danger)] border border-[var(--status-danger)]'
                  : b.kind === 'warning'
                  ? 'bg-[var(--surface-raised)] text-[var(--status-warning)] border border-[var(--status-warning)]'
                  : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)]'
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
