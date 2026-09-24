import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Layout,
  Link2,
  Edit2,
  Trash2,
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  ExternalLink,
  Search,
  Check,
} from 'lucide-react';
import type {
  ModelTreeNode,
  ExplorerCapability,
  CapabilityKind,
} from '../../features/modelExplorer/modelExplorerTypes';

export interface MenuActionItem {
  capability: ExplorerCapability;
  icon?: React.ReactNode;
  shortcut?: string;
}

export interface ModelExplorerMenuProps {
  x: number;
  y: number;
  targetNode: ModelTreeNode;
  capabilities: ExplorerCapability[];
  onSelectCapability: (capability: ExplorerCapability) => void;
  onClose: () => void;
  filterText?: string;
  className?: string;
}

export function filterMenuCapabilities(
  capabilities: ExplorerCapability[],
  query: string
): ExplorerCapability[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return capabilities;

  return capabilities.filter(cap => {
    if (cap.label.toLowerCase().includes(trimmed)) return true;
    if (cap.elementKind && cap.elementKind.toLowerCase().includes(trimmed)) return true;
    if (cap.relationshipKind && cap.relationshipKind.toLowerCase().includes(trimmed)) return true;
    if (cap.kind.toLowerCase().includes(trimmed)) return true;
    return false;
  });
}

function getCapabilityIcon(kind: CapabilityKind): React.ReactElement {
  const iconProps = { size: 13, className: 'shrink-0' };
  switch (kind) {
    case 'createElement':
      return <Plus {...iconProps} className="text-emerald-400" />;
    case 'createDiagram':
      return <Layout {...iconProps} className="text-sky-400" />;
    case 'createRelationship':
      return <Link2 {...iconProps} className="text-amber-400" />;
    case 'rename':
      return <Edit2 {...iconProps} className="text-blue-400" />;
    case 'delete':
      return <Trash2 {...iconProps} className="text-red-400" />;
    case 'copy':
      return <Copy {...iconProps} className="text-slate-400" />;
    case 'paste':
      return <ClipboardPaste {...iconProps} className="text-slate-400" />;
    case 'duplicate':
      return <CopyPlus {...iconProps} className="text-slate-400" />;
    case 'addToDiagram':
      return <Plus {...iconProps} className="text-indigo-400" />;
    case 'openSpecification':
      return <ExternalLink {...iconProps} className="text-violet-400" />;
    default:
      return <Check {...iconProps} className="text-slate-400" />;
  }
}

function getCapabilityShortcut(kind: CapabilityKind): string | undefined {
  switch (kind) {
    case 'rename':
      return 'F2';
    case 'delete':
      return 'Del';
    case 'copy':
      return 'Ctrl+C';
    case 'paste':
      return 'Ctrl+V';
    case 'duplicate':
      return 'Ctrl+D';
    default:
      return undefined;
  }
}

export const ModelExplorerMenu: React.FC<ModelExplorerMenuProps> = ({
  x,
  y,
  targetNode,
  capabilities,
  onSelectCapability,
  onClose,
  filterText: initialFilter = '',
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filterQuery, setFilterQuery] = useState(initialFilter);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Filter capabilities
  const filteredCapabilities = useMemo(
    () => filterMenuCapabilities(capabilities, filterQuery),
    [capabilities, filterQuery]
  );

  // Group capabilities by category
  const groupedCapabilities = useMemo(() => {
    const groups: { title: string; items: ExplorerCapability[] }[] = [];
    const elements = filteredCapabilities.filter(c => c.kind === 'createElement');
    const diagrams = filteredCapabilities.filter(c => c.kind === 'createDiagram');
    const relationships = filteredCapabilities.filter(c => c.kind === 'createRelationship');
    const edits = filteredCapabilities.filter(c =>
      ['rename', 'duplicate', 'delete'].includes(c.kind)
    );
    const clipboards = filteredCapabilities.filter(c => ['copy', 'paste'].includes(c.kind));
    const views = filteredCapabilities.filter(c =>
      ['addToDiagram', 'openSpecification', 'reveal'].includes(c.kind)
    );

    if (elements.length > 0) groups.push({ title: 'New Element', items: elements });
    if (diagrams.length > 0) groups.push({ title: 'New Diagram', items: diagrams });
    if (relationships.length > 0) groups.push({ title: 'Relationships', items: relationships });
    if (edits.length > 0) groups.push({ title: 'Edit', items: edits });
    if (clipboards.length > 0) groups.push({ title: 'Clipboard', items: clipboards });
    if (views.length > 0) groups.push({ title: 'View & Context', items: views });

    return groups;
  }, [filteredCapabilities]);

  // Close on click outside or Escape
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % Math.max(1, filteredCapabilities.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev =>
          prev === 0 ? filteredCapabilities.length - 1 : prev - 1
        );
      } else if (e.key === 'Enter') {
        const item = filteredCapabilities[focusedIndex];
        if (item && item.enabled) {
          e.preventDefault();
          onSelectCapability(item);
          onClose();
        }
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, filteredCapabilities, focusedIndex, onSelectCapability]);

  // Adjust positioning to stay within viewport
  const positionStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 260)),
    top: Math.max(8, Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 340)),
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Context menu for ${targetNode.label}`}
      style={positionStyle}
      className={`model-explorer-context-menu w-64 bg-slate-900 border border-slate-700/80 rounded-md shadow-2xl overflow-hidden flex flex-col text-xs select-none backdrop-blur-sm ${className}`}
    >
      {/* Menu Header with node label */}
      <div className="px-3 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <span className="font-semibold text-slate-200 truncate">{targetNode.label}</span>
        <span className="text-[10px] text-slate-400 font-mono uppercase bg-slate-800 px-1 py-0.5 rounded">
          {targetNode.kind}
        </span>
      </div>

      {/* Filter search if many capabilities */}
      {capabilities.length > 5 && (
        <div className="px-2 py-1.5 border-b border-slate-800 bg-slate-950/40 flex items-center gap-1.5">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={filterQuery}
            onChange={e => {
              setFilterQuery(e.target.value);
              setFocusedIndex(0);
            }}
            placeholder="Search action..."
            className="w-full bg-transparent text-slate-200 placeholder:text-slate-500 text-[11px] outline-none"
            autoFocus
          />
        </div>
      )}

      {/* Action items list */}
      <div className="max-h-72 overflow-y-auto py-1 divide-y divide-slate-800/60">
        {groupedCapabilities.length === 0 ? (
          <div className="px-3 py-3 text-center text-slate-400 text-xs">
            No matching actions
          </div>
        ) : (
          groupedCapabilities.map(group => (
            <div key={group.title} className="py-1">
              <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.title}
              </div>
              {group.items.map(cap => {
                const globalIndex = filteredCapabilities.indexOf(cap);
                const isFocused = globalIndex === focusedIndex;
                const shortcut = getCapabilityShortcut(cap.kind);

                return (
                  <button
                    key={cap.id}
                    type="button"
                    role="menuitem"
                    aria-disabled={!cap.enabled}
                    disabled={!cap.enabled}
                    onClick={() => {
                      if (cap.enabled) {
                        onSelectCapability(cap);
                        onClose();
                      }
                    }}
                    onMouseEnter={() => setFocusedIndex(globalIndex)}
                    title={cap.reason || cap.label}
                    className={`w-full flex items-center justify-between px-2.5 py-1 text-left transition-colors ${
                      !cap.enabled
                        ? 'opacity-40 cursor-not-allowed text-slate-400'
                        : isFocused
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getCapabilityIcon(cap.kind)}
                      <span className="truncate">{cap.label}</span>
                    </div>
                    {shortcut && (
                      <span
                        className={`text-[10px] font-mono ml-2 shrink-0 ${
                          isFocused ? 'text-blue-200' : 'text-slate-400'
                        }`}
                      >
                        {shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
