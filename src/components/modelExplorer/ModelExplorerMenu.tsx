import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Link2,
  Layout,
  ExternalLink,
  Search,
  Check,
} from 'lucide-react';
import type { ModelTreeNode, ExplorerCapability, CapabilityKind } from '../../features/modelExplorer/modelExplorerTypes';

export type MenuActionItem = ExplorerCapability;

export function filterMenuCapabilities(
  capabilities: ExplorerCapability[],
  query: string
): ExplorerCapability[] {
  if (!query) return capabilities;
  const q = query.toLowerCase();
  return capabilities.filter(c =>
    c.label.toLowerCase().includes(q) ||
    c.kind.toLowerCase().includes(q) ||
    (c.elementKind && c.elementKind.toLowerCase().includes(q))
  );
}

export interface ModelExplorerMenuProps {
  targetNode: ModelTreeNode;
  capabilities: ExplorerCapability[];
  anchorPosition?: { x: number; y: number };
  x?: number;
  y?: number;
  onClose: () => void;
  onSelectCapability: (cap: ExplorerCapability) => void;
  className?: string;
}

interface CapabilityGroup {
  title: string;
  items: ExplorerCapability[];
}

function groupCapabilities(caps: ExplorerCapability[]): CapabilityGroup[] {
  const features: ExplorerCapability[] = [];
  const creates: ExplorerCapability[] = [];
  const edits: ExplorerCapability[] = [];
  const diagramOps: ExplorerCapability[] = [];
  const clipboard: ExplorerCapability[] = [];
  const allTypes: ExplorerCapability[] = [];

  for (const c of caps) {
    if (c.capabilityGroup === 'allTypes' || c.catalogVisibility === 'allTypes') {
      allTypes.push(c);
    } else if (c.capabilityGroup === 'feature' || c.kind === 'createOwnedFeature') {
      features.push(c);
    } else if (c.kind === 'createElement' || c.kind === 'createRelationship' || c.kind === 'createDiagram') {
      creates.push(c);
    } else if (c.kind === 'copy' || c.kind === 'paste' || c.kind === 'duplicate') {
      clipboard.push(c);
    } else if (c.kind === 'addToDiagram' || c.kind === 'removeFromDiagram' || c.kind === 'openSpecification') {
      diagramOps.push(c);
    } else {
      edits.push(c);
    }
  }

  const groups: CapabilityGroup[] = [];
  if (features.length) groups.push({ title: 'Features', items: features });
  if (creates.length) groups.push({ title: 'New', items: creates });
  if (diagramOps.length) groups.push({ title: 'Diagram', items: diagramOps });
  if (clipboard.length) groups.push({ title: 'Clipboard', items: clipboard });
  if (edits.length) groups.push({ title: 'Edit', items: edits });
  if (allTypes.length) groups.push({ title: 'All Types (Disallowed)', items: allTypes });

  return groups;
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
      return <Edit2 {...iconProps} className="text-[var(--diagram-node-selected)]" />;
    case 'delete':
      return <Trash2 {...iconProps} className="text-[var(--status-danger)]" />;
    case 'copy':
      return <Copy {...iconProps} className="text-[var(--text-muted)]" />;
    case 'paste':
      return <ClipboardPaste {...iconProps} className="text-[var(--text-muted)]" />;
    case 'duplicate':
      return <CopyPlus {...iconProps} className="text-[var(--text-muted)]" />;
    case 'addToDiagram':
      return <Plus {...iconProps} className="text-indigo-400" />;
    case 'openSpecification':
      return <ExternalLink {...iconProps} className="text-violet-400" />;
    default:
      return <Check {...iconProps} className="text-[var(--text-muted)]" />;
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
  targetNode,
  capabilities,
  anchorPosition,
  x,
  y,
  onClose,
  onSelectCapability,
  className = '',
}) => {
  const anchorX = anchorPosition?.x ?? x ?? 0;
  const anchorY = anchorPosition?.y ?? y ?? 0;
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);

  const filteredCapabilities = filterMenuCapabilities(capabilities, filterQuery);

  const groupedCapabilities = groupCapabilities(filteredCapabilities);

  // Close on outside click or escape
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filteredCapabilities.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cap = filteredCapabilities[focusedIndex];
        if (cap && cap.enabled) {
          onSelectCapability(cap);
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

  // Viewport clamping
  const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    left: anchorX,
    top: anchorY,
    zIndex: 9999,
  });

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let left = anchorX;
      let top = anchorY;

      if (left + rect.width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - rect.width - 8);
      }
      if (top + rect.height > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - rect.height - 8);
      }

      setPositionStyle({
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
      });
    }
  }, [anchorX, anchorY]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Context menu for ${targetNode.label}`}
      style={positionStyle}
      className={`model-explorer-context-menu w-64 bg-[var(--surface-panel)] border border-[var(--border-default)] rounded-md shadow-2xl overflow-hidden flex flex-col text-xs select-none backdrop-blur-sm ${className}`}
    >
      {/* Menu Header with node label */}
      <div className="px-3 py-2 bg-[var(--surface-canvas)] border-b border-[var(--border-default)] flex items-center justify-between">
        <span className="font-semibold text-[var(--text-primary)] truncate">{targetNode.label}</span>
        <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase bg-[var(--surface-raised)] border border-[var(--border-default)] px-1 py-0.5 rounded">
          {targetNode.kind}
        </span>
      </div>

      {/* Filter search if many capabilities */}
      {capabilities.length > 5 && (
        <div className="px-2 py-1.5 border-b border-[var(--border-default)] bg-[var(--surface-canvas)] flex items-center gap-1.5">
          <Search size={12} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={filterQuery}
            onChange={e => {
              setFilterQuery(e.target.value);
              setFocusedIndex(0);
            }}
            placeholder="Search action..."
            className="w-full bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-[11px] outline-none"
            autoFocus
          />
        </div>
      )}

      {/* Action items list */}
      <div className="max-h-72 overflow-y-auto py-1 divide-y divide-[var(--border-default)]">
        {groupedCapabilities.length === 0 ? (
          <div className="px-3 py-3 text-center text-[var(--text-muted)] text-xs">
            No matching actions
          </div>
        ) : (
          groupedCapabilities.map(group => (
            <div key={group.title} className="py-1">
              <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
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
                        ? 'opacity-40 cursor-not-allowed text-[var(--text-muted)]'
                        : isFocused
                        ? 'bg-[var(--diagram-node-selected)] text-white'
                        : 'text-[var(--text-primary)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        {getCapabilityIcon(cap.kind)}
                        <span className="truncate">{cap.label}</span>
                      </div>
                      {cap.reason && !cap.enabled && (
                        <span className="text-[10px] text-amber-400/80 truncate pl-5">
                          {cap.reason}
                        </span>
                      )}
                    </div>
                    {shortcut && (
                      <span
                        className={`text-[10px] font-mono ml-2 shrink-0 ${
                          isFocused ? 'text-white/80' : 'text-[var(--text-muted)]'
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
