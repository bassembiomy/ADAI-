import React, { useEffect, ReactNode } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Maximize2, Minimize2 } from 'lucide-react';

export interface ResizableSplitPaneGroupProps {
  children: ReactNode[];
  initialSizes?: number[]; // Percentages summing to ~100
  minSizes?: number[]; // Min percentage per panel
  storageKey?: string;
  maximizedIndex?: number | null;
  onRestore?: () => void;
  className?: string;
}

export const ResizableSplitPaneGroup: React.FC<ResizableSplitPaneGroupProps> = ({
  children,
  initialSizes = [],
  minSizes = [],
  storageKey,
  maximizedIndex = null,
  onRestore,
  className = '',
}) => {
  const validChildren = React.Children.toArray(children).filter(Boolean);

  // Keyboard shortcut: Escape restores from maximized view
  useEffect(() => {
    if (maximizedIndex === null || maximizedIndex === undefined) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onRestore?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [maximizedIndex, onRestore]);

  if (validChildren.length === 0) return null;

  // Fullscreen maximized focus mode
  if (maximizedIndex !== null && maximizedIndex >= 0 && maximizedIndex < validChildren.length) {
    return (
      <div className={`w-full h-full overflow-hidden flex flex-col ${className}`}>
        {validChildren[maximizedIndex]}
      </div>
    );
  }

  const defaultSizePerPane = 100 / validChildren.length;

  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId={storageKey}
      className={`w-full h-full flex ${className}`}
    >
      {validChildren.map((child, idx) => {
        const defaultSize = initialSizes[idx] ?? defaultSizePerPane;
        const minSize = minSizes[idx] ?? 12;

        return (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <PanelResizeHandle
                role="separator"
                className="group relative flex w-2 items-center justify-center cursor-col-resize focus:outline-none select-none z-10 transition-colors"
                title="Drag to resize panel (Double-click to reset)"
              >
                {/* Visual drag gutter indicator */}
                <div className="w-[3px] h-8 rounded-full bg-[#242424] group-hover:bg-[#f97316] group-active:bg-[#f97316] group-hover:h-14 transition-all duration-150" />
              </PanelResizeHandle>
            )}
            <Panel
              defaultSize={defaultSize}
              minSize={minSize}
              className="h-full overflow-hidden flex flex-col"
            >
              {child}
            </Panel>
          </React.Fragment>
        );
      })}
    </PanelGroup>
  );
};

export interface PanelMaximizeButtonProps {
  isMaximized: boolean;
  onToggle: () => void;
  title?: string;
  className?: string;
}

export const PanelMaximizeButton: React.FC<PanelMaximizeButtonProps> = ({
  isMaximized,
  onToggle,
  title,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={title || (isMaximized ? 'Restore normal view (Esc)' : 'Maximize panel for detailed visualization')}
      className={`p-1 rounded transition-colors inline-flex items-center justify-center ${
        isMaximized
          ? 'text-[#f97316] bg-[#1a1a1a] border border-[#f97316]/40 hover:bg-[#252525]'
          : 'text-gray-400 hover:text-white hover:bg-[#222]'
      } ${className}`}
    >
      {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
    </button>
  );
};
