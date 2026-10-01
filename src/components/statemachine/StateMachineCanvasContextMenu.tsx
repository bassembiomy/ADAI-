import React, { useEffect, useRef, useState } from 'react';
import { Plus, Circle, Box } from 'lucide-react';

export interface StateMachineCanvasContextMenuProps {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  onAddState: (worldX: number, worldY: number) => void;
  onAddJunction: (worldX: number, worldY: number) => void;
  onAddXBridgesState: (worldX: number, worldY: number) => void;
  onClose: () => void;
}

export const StateMachineCanvasContextMenu: React.FC<StateMachineCanvasContextMenuProps> = ({
  x,
  y,
  worldX,
  worldY,
  onAddState,
  onAddJunction,
  onAddXBridgesState,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 9999,
  });

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let left = x;
      let top = y;

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
  }, [x, y]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="State Machine Workspace Actions"
      style={positionStyle}
      className="state-machine-canvas-context-menu w-52 bg-[#121212]/95 border border-[#2d2d2d] rounded-lg shadow-2xl overflow-hidden py-1 text-xs select-none backdrop-blur-md"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#888] border-b border-[#222]">
        Add State Machine Element
      </div>

      <button
        role="menuitem"
        onClick={() => {
          onAddState(worldX, worldY);
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-[#222] text-[#e0e0e0] hover:text-[#fff] flex items-center space-x-2.5 transition-colors group cursor-pointer"
      >
        <div className="w-5 h-5 rounded flex items-center justify-center bg-[#f97316]/10 border border-[#f97316]/30 group-hover:border-[#f97316]/60">
          <Plus size={12} className="text-[#f97316]" />
        </div>
        <div className="flex flex-col">
          <span className="font-medium">State</span>
          <span className="text-[10px] text-[#777]">Standard state</span>
        </div>
      </button>

      <button
        role="menuitem"
        onClick={() => {
          onAddJunction(worldX, worldY);
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-[#222] text-[#e0e0e0] hover:text-[#fff] flex items-center space-x-2.5 transition-colors group cursor-pointer"
      >
        <div className="w-5 h-5 rounded flex items-center justify-center bg-[#f59e0b]/10 border border-[#f59e0b]/30 group-hover:border-[#f59e0b]/60">
          <Circle size={10} className="text-[#f59e0b] fill-[#f59e0b]/20" />
        </div>
        <div className="flex flex-col">
          <span className="font-medium">Junction</span>
          <span className="text-[10px] text-[#777]">Condition branch</span>
        </div>
      </button>

      <button
        role="menuitem"
        onClick={() => {
          onAddXBridgesState(worldX, worldY);
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-[#222] text-[#e0e0e0] hover:text-[#fff] flex items-center space-x-2.5 transition-colors group cursor-pointer"
      >
        <div className="w-5 h-5 rounded flex items-center justify-center bg-[#4caf50]/10 border border-[#4caf50]/30 group-hover:border-[#4caf50]/60">
          <Box size={12} className="text-[#4caf50]" />
        </div>
        <div className="flex flex-col">
          <span className="font-medium text-[#4caf50]">X-Bridges State</span>
          <span className="text-[10px] text-[#777]">Continuous subsystem</span>
        </div>
      </button>
    </div>
  );
};
