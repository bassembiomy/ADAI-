import React, { useState } from 'react';
import type { OpmDocks, OpmPage } from './OpmDockState';

interface Props {
  docks: OpmDocks;
  onDocksChange: (d: OpmDocks) => void;
  left: React.ReactNode;
  right: React.ReactNode;
  bottom: React.ReactNode;
  center: React.ReactNode;
  initialLeftWidth?: number;
  initialRightWidth?: number;
  initialBottomHeight?: number;
}

const PAGES: OpmPage[] = ['model', 'simulate', 'review'];

const DEFAULT_LEFT_WIDTH = 250;
const DEFAULT_RIGHT_WIDTH = 340;
const DEFAULT_BOTTOM_HEIGHT = 240;

export const OpmDockShell: React.FC<Props> = ({
  docks,
  onDocksChange,
  left,
  right,
  bottom,
  center,
  initialLeftWidth = DEFAULT_LEFT_WIDTH,
  initialRightWidth = DEFAULT_RIGHT_WIDTH,
  initialBottomHeight = DEFAULT_BOTTOM_HEIGHT,
}) => {
  const [leftWidth, setLeftWidth] = useState<number>(initialLeftWidth);
  const [rightWidth, setRightWidth] = useState<number>(initialRightWidth);
  const [bottomHeight, setBottomHeight] = useState<number>(initialBottomHeight);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | 'bottom' | null>(null);

  const handleLeftMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing('left');
    const startX = e.clientX;
    const startWidth = leftWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(160, Math.min(520, startWidth + (moveEvent.clientX - startX)));
      setLeftWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleRightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing('right');
    const startX = e.clientX;
    const startWidth = rightWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(220, Math.min(650, startWidth - (moveEvent.clientX - startX)));
      setRightWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleBottomMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing('bottom');
    const startY = e.clientY;
    const startHeight = bottomHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = Math.max(120, Math.min(600, startHeight - (moveEvent.clientY - startY)));
      setBottomHeight(newHeight);
    };

    const onMouseUp = () => {
      setIsResizing(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };


  return (
    <div className={`flex h-full w-full flex-col select-none ${isResizing ? 'cursor-col-resize' : ''}`}>
      {/* Top Pagebar / Dock Management Bar */}
      <div
        data-testid="opm-pagebar"
        className="flex items-center gap-2 border-b border-[#222] bg-[#121214] px-3 shrink-0"
        style={{ height: 40 }}
      >
        <div className="flex items-center gap-1 bg-[#1a1a1d] p-0.5 rounded border border-white/5">
          {PAGES.map(p => (
            <button
              key={p}
              data-testid={`opm-page-${p}`}
              aria-label={`${p} page`}
              onClick={() => onDocksChange({ ...docks, page: p })}
              className={`px-2.5 py-1 text-xs font-semibold capitalize rounded transition-all ${
                docks.page === p
                  ? 'bg-orange-500/20 text-orange-400 font-bold border border-orange-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

      </div>

      {/* Main Viewport containing Left Dock, Canvas Center, and Right Dock */}
      <div className="flex min-h-0 flex-1 relative overflow-hidden">
        {docks.left && (
          <>
            <aside
              data-testid="opm-dock-left"
              style={{ width: `${leftWidth}px` }}
              className="shrink-0 overflow-y-auto border-r border-[#222] bg-[#111113] transition-all duration-75"
            >
              {left}
            </aside>
            <div
              data-testid="opm-resizer-left"
              onMouseDown={handleLeftMouseDown}
              onDoubleClick={() => setLeftWidth(DEFAULT_LEFT_WIDTH)}
              className="w-1.5 shrink-0 bg-[#1e1e24] hover:bg-orange-500/70 active:bg-orange-500 cursor-col-resize transition-colors flex items-center justify-center relative group z-10"
              title="Drag to resize Left Dock (Double-click to reset)"
            >
              <div className="w-0.5 h-6 bg-gray-600 group-hover:bg-black rounded-full" />
            </div>
          </>
        )}

        <main data-testid="opm-dock-center" className="relative min-w-0 flex-1 bg-[#0a0a0a]">
          {center}
        </main>

        {docks.right && (
          <>
            <div
              data-testid="opm-resizer-right"
              onMouseDown={handleRightMouseDown}
              onDoubleClick={() => setRightWidth(DEFAULT_RIGHT_WIDTH)}
              className="w-1.5 shrink-0 bg-[#1e1e24] hover:bg-orange-500/70 active:bg-orange-500 cursor-col-resize transition-colors flex items-center justify-center relative group z-10"
              title="Drag to resize Right Dock (Double-click to reset)"
            >
              <div className="w-0.5 h-6 bg-gray-600 group-hover:bg-black rounded-full" />
            </div>
            <aside
              data-testid="opm-dock-right"
              style={{ width: `${rightWidth}px` }}
              className="shrink-0 overflow-y-auto border-l border-[#222] bg-[#111113] transition-all duration-75"
            >
              {right}
            </aside>
          </>
        )}
      </div>

      {/* Bottom Dock with Resizer */}
      {docks.bottom && (
        <>
          <div
            data-testid="opm-resizer-bottom"
            onMouseDown={handleBottomMouseDown}
            onDoubleClick={() => setBottomHeight(DEFAULT_BOTTOM_HEIGHT)}
            className="h-1.5 shrink-0 bg-[#1e1e24] hover:bg-orange-500/70 active:bg-orange-500 cursor-row-resize transition-colors flex items-center justify-center relative group z-10"
            title="Drag to resize Bottom Dock (Double-click to reset)"
          >
            <div className="h-0.5 w-8 bg-gray-600 group-hover:bg-black rounded-full" />
          </div>
          <footer
            data-testid="opm-dock-bottom"
            style={{ height: `${bottomHeight}px` }}
            className="shrink-0 overflow-hidden border-t border-[#222] bg-[#0e0e10] transition-all duration-75"
          >
            {bottom}
          </footer>
        </>
      )}
    </div>
  );
};
