import React from 'react';

export interface PortKindActionsProps {
  onAddPort: (kind: 'standard' | 'flow' | 'proxy' | 'full') => void;
  className?: string;
}

export const PortKindActions: React.FC<PortKindActionsProps> = ({
  onAddPort,
  className = '',
}) => {
  return (
    <div className={`flex gap-1 items-center ${className}`.trim()}>
      <button
        type="button"
        onClick={() => onAddPort('standard')}
        className="h-6 px-2 text-[11px] font-medium rounded border border-[#3b82f6] text-[#60a5fa] hover:bg-[#3b82f6]/20 transition-colors cursor-pointer"
        title="Add Standard UML Port"
      >
        Standard
      </button>
      <button
        type="button"
        onClick={() => onAddPort('flow')}
        className="h-6 px-2 text-[11px] font-medium rounded border border-[#10b981] text-[#34d399] hover:bg-[#10b981]/20 transition-colors cursor-pointer"
        title="Add Flow Port"
      >
        Flow
      </button>
      <button
        type="button"
        onClick={() => onAddPort('proxy')}
        className="h-6 px-2 text-[11px] font-medium rounded border border-[#8b5cf6] text-[#a78bfa] hover:bg-[#8b5cf6]/20 transition-colors cursor-pointer"
        title="Add Proxy Port"
      >
        Proxy
      </button>
      <button
        type="button"
        onClick={() => onAddPort('full')}
        className="h-6 px-2 text-[11px] font-medium rounded border border-[#f59e0b] text-[#fbbf24] hover:bg-[#f59e0b]/20 transition-colors cursor-pointer"
        title="Add Full Port"
      >
        Full
      </button>
    </div>
  );
};
