import React from 'react';
import { User, Circle, Square, Layout, Maximize2, Save } from 'lucide-react';

interface UseCaseToolbarProps {
  diagramName: string;
  onAddActor: () => void;
  onAddUseCase: () => void;
  onAddBoundary: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onSave: () => void;
}

export const UseCaseToolbar: React.FC<UseCaseToolbarProps> = ({
  diagramName,
  onAddActor,
  onAddUseCase,
  onAddBoundary,
  onAutoLayout,
  onFitView,
  onSave,
}) => {
  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-[#1a1a1a]/95 border border-[#333] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 shadow-xl backdrop-blur-sm">
      {/* Breadcrumb / Title */}
      <div className="flex items-center gap-1.5 font-medium text-zinc-300 mr-1">
        <span className="text-zinc-500">SysML /</span>
        <span className="text-amber-400 font-semibold">{diagramName || 'Use Cases'}</span>
      </div>

      <div className="h-4 w-[1px] bg-[#333]" />

      {/* Node Creation Tools */}
      <button
        onClick={onAddActor}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-200 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Add SysML Actor"
      >
        <User size={13} className="text-amber-400" />
        <span>+ Actor</span>
      </button>

      <button
        onClick={onAddUseCase}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-200 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Add SysML Use Case"
      >
        <Circle size={13} className="text-sky-400" />
        <span>+ Use Case</span>
      </button>

      <button
        onClick={onAddBoundary}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-200 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Add Subject Boundary"
      >
        <Square size={13} className="text-purple-400" />
        <span>+ Subject</span>
      </button>

      <div className="h-4 w-[1px] bg-[#333]" />

      {/* Utility Actions */}
      <button
        onClick={onAutoLayout}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-300 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Auto Layout Diagram"
      >
        <Layout size={13} />
        <span>Auto Layout</span>
      </button>

      <button
        onClick={onFitView}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-300 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Fit View (Ctrl+0)"
      >
        <Maximize2 size={13} />
        <span>Fit</span>
      </button>

      <button
        onClick={onSave}
        className="flex items-center gap-1.5 h-6 px-2.5 text-[#f97316] hover:bg-[#f97316]/10 border border-[#f97316]/40 rounded transition-colors font-medium ml-1"
        title="Save Diagram (Ctrl+S)"
      >
        <Save size={13} />
        <span>Save</span>
      </button>
    </div>
  );
};
