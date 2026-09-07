import React, { useState, useEffect, useRef } from 'react';
import { Minus, Maximize2, Minimize2, X, ArrowRightFromLine, Move } from 'lucide-react';

export interface OpmFloatingWindowProps {
  title: string;
  badge?: string;
  isOpen: boolean;
  onClose: () => void;
  onDock: () => void;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  children: React.ReactNode;
}

const DEFAULT_WIDTH = 450;
const DEFAULT_HEIGHT = 640;
const DEFAULT_MIN_WIDTH = 340;
const DEFAULT_MIN_HEIGHT = 320;

export const OpmFloatingWindow: React.FC<OpmFloatingWindowProps> = ({
  title,
  badge = 'OPM Studio',
  isOpen,
  onClose,
  onDock,
  initialPosition,
  initialSize,
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  children,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (initialPosition) return initialPosition;
    const initialX = typeof window !== 'undefined' ? Math.max(40, window.innerWidth - (initialSize?.width || DEFAULT_WIDTH) - 24) : 100;
    return { x: initialX, y: 56 };
  });

  const [size, setSize] = useState<{ width: number; height: number }>(() => ({
    width: initialSize?.width || DEFAULT_WIDTH,
    height: initialSize?.height || DEFAULT_HEIGHT,
  }));

  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; startW: number; startH: number }>({
    mouseX: 0,
    mouseY: 0,
    startW: 0,
    startH: 0,
  });

  // Dragging logic
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const nextX = Math.max(0, Math.min(window.innerWidth - 80, dragStartRef.current.startX + dx));
      const nextY = Math.max(0, Math.min(window.innerHeight - 40, dragStartRef.current.startY + dy));
      setPos({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Resizing logic
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dw = e.clientX - resizeStartRef.current.mouseX;
      const dh = e.clientY - resizeStartRef.current.mouseY;
      const maxW = typeof window !== 'undefined' ? window.innerWidth - 20 : 1800;
      const maxH = typeof window !== 'undefined' ? window.innerHeight - 40 : 1200;

      const newW = Math.max(minWidth, Math.min(maxW, resizeStartRef.current.startW + dw));
      const newH = Math.max(minHeight, Math.min(maxH, resizeStartRef.current.startH + dh));
      setSize({ width: newW, height: newH });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, minHeight]);

  if (!isOpen) return null;

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: pos.x,
      startY: pos.y,
    };
    setIsDragging(true);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startW: size.width,
      startH: size.height,
    };
    setIsResizing(true);
  };

  return (
    <div
      data-testid="opm-floating-window"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={
        isMaximized
          ? { left: 8, top: 48, width: 'calc(100vw - 16px)', height: 'calc(100vh - 56px)' }
          : { left: `${pos.x}px`, top: `${pos.y}px`, width: isMinimized ? '320px' : `${size.width}px`, height: isMinimized ? 'auto' : `${size.height}px` }
      }
      className={`fixed z-[9990] flex flex-col bg-[#121217]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_25px_60px_rgba(0,0,0,0.85)] overflow-hidden font-sans transition-all duration-100 ${
        isMaximized ? 'inset-x-2' : ''
      }`}
    >
      {/* Top Accent Gradient Bar */}
      <div className="h-0.5 w-full bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 shrink-0" />

      {/* Title Bar */}
      <div
        data-testid="opm-floating-titlebar"
        onMouseDown={handleTitleMouseDown}
        onDoubleClick={() => {
          setIsMaximized((prev) => !prev);
          setIsMinimized(false);
        }}
        className={`h-10 bg-[#16161c] border-b border-white/10 px-3 flex items-center justify-between gap-2 shrink-0 select-none ${
          isMaximized ? 'cursor-default' : 'cursor-move'
        }`}
        title="Drag to move. Double-click to toggle maximize/restore."
      >
        <div className="flex items-center gap-2 min-w-0">
          <Move size={12} className="text-gray-400 shrink-0 opacity-60" />
          <span className="text-xs font-bold text-gray-200 uppercase tracking-wider truncate">
            {title}
          </span>
          {badge && (
            <span className="text-[9px] px-1.5 py-0.2 font-mono font-bold uppercase rounded bg-orange-500/15 border border-orange-500/30 text-orange-400 shrink-0">
              {badge}
            </span>
          )}
        </div>

        {/* Window Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            data-testid="opm-floating-dock-btn"
            onClick={onDock}
            className="p-1.5 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10 rounded transition-colors"
            title="Dock to sidebar"
          >
            <ArrowRightFromLine size={13} />
          </button>

          <button
            data-testid="opm-floating-minimize-btn"
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
            title={isMinimized ? 'Restore' : 'Minimize'}
          >
            <Minus size={13} />
          </button>

          <button
            data-testid="opm-floating-maximize-btn"
            onClick={() => {
              setIsMaximized((prev) => !prev);
              setIsMinimized(false);
            }}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            data-testid="opm-floating-close-btn"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors ml-0.5"
            title="Close / Dock"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {!isMinimized && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          {children}

          {/* Corner Resize Grip */}
          {!isMaximized && (
            <div
              data-testid="opm-floating-resizer"
              onMouseDown={handleResizeMouseDown}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 z-20 group"
              title="Drag corner to resize window"
            >
              <div className="w-2 h-2 border-r-2 border-b-2 border-gray-500 group-hover:border-orange-400 transition-colors" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
