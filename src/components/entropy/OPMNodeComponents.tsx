import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { OPMNodeData } from './EntropyTypes';

// Custom Object Node Component
export const OPMObjectNode: React.FC<NodeProps<OPMNodeData>> = ({ data, selected }) => {
  const isPhysical = data.physical;
  const isZoomedIn = data.zoomedIn;

  return (
    <div
      className={`relative rounded-md px-4 py-3 min-w-[150px] min-h-[80px] flex flex-col justify-between transition-all duration-300 ${
        selected
          ? 'border-2 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)] bg-emerald-950/40'
          : 'border border-emerald-600/70 bg-[#0d1f14]/80 backdrop-blur-md shadow-md'
      } ${
        isPhysical
          ? 'border-dashed shadow-[0_0_8px_rgba(52,211,153,0.15)] [border-width:2px]'
          : ''
      }`}
      style={{
        width: isZoomedIn ? '100%' : 'auto',
        height: isZoomedIn ? '100%' : 'auto',
      }}
    >
      {/* OPM Object Label */}
      <div className="flex items-center justify-between border-b border-emerald-800/40 pb-1.5 mb-2">
        <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-400/80">Object</span>
        {isPhysical && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 font-semibold scale-90">Physical</span>
        )}
      </div>

      <div className="text-sm font-bold text-emerald-100 text-center flex-1 flex items-center justify-center px-2 py-1">
        {data.name}
      </div>

      {/* Attributes Listing */}
      {data.attributes && data.attributes.length > 0 && (
        <div className="mt-2 border-t border-emerald-900/40 pt-1.5 space-y-0.5 text-[10px] font-mono text-emerald-400/90">
          {data.attributes.map((attr, idx) => (
            <div key={idx} className="flex justify-between hover:bg-emerald-950/20 px-1 rounded transition-colors">
              <span>{attr.key}:</span>
              <span className="text-emerald-200">{attr.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* standard OPM boundary state placeholders if any, or child states */}
      {isZoomedIn && (
        <div className="mt-4 border-t border-emerald-800/20 pt-2 text-[10px] text-[#666] italic text-center">
          In-Body Detail Area (Drag elements here)
        </div>
      )}

      {/* Standard Handles for Connection */}
      <Handle type="target" position={Position.Top} className="!bg-emerald-400 !w-2.5 !h-2.5" id="t-top" />
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-400 !w-2.5 !h-2.5" id="s-bottom" />
      <Handle type="target" position={Position.Left} className="!bg-emerald-400 !w-2.5 !h-2.5" id="t-left" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" id="s-right" />
    </div>
  );
};

// Custom Process Node Component
export const OPMProcessNode: React.FC<NodeProps<OPMNodeData>> = ({ data, selected }) => {
  const isPhysical = data.physical;
  const isZoomedIn = data.zoomedIn;
  
  // Custom metadata set during simulation firing
  const isFiring = (data as any).isFiring;

  return (
    <div
      className={`relative rounded-full px-6 py-4 min-w-[140px] min-h-[75px] flex flex-col items-center justify-center transition-all duration-300 ${
        selected
          ? 'border-2 border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.5)] bg-sky-950/50'
          : isFiring
          ? 'border-2 border-orange-400 bg-sky-900/60 shadow-[0_0_25px_rgba(251,146,60,0.8)] scale-105 animate-pulse'
          : 'border border-sky-600/70 bg-[#0c1a24]/80 backdrop-blur-md shadow-md'
      } ${
        isPhysical
          ? 'border-dashed [border-width:2px]'
          : ''
      }`}
      style={{
        borderRadius: '50%',
        width: isZoomedIn ? '100%' : 'auto',
        height: isZoomedIn ? '100%' : 'auto',
      }}
    >
      <div className="text-center">
        <span className="text-[8px] uppercase tracking-widest font-black text-sky-400/60 block mb-0.5">Process</span>
        <div className="text-sm font-extrabold text-sky-100 px-3">
          {data.name}
        </div>
      </div>

      {isZoomedIn && (
        <div className="absolute bottom-3 text-[9px] text-sky-400/40 italic">
          Zoomed Inside
        </div>
      )}

      {/* Handles */}
      <Handle type="target" position={Position.Top} className="!bg-sky-400 !w-2.5 !h-2.5" id="t-top" />
      <Handle type="source" position={Position.Bottom} className="!bg-sky-400 !w-2.5 !h-2.5" id="s-bottom" />
      <Handle type="target" position={Position.Left} className="!bg-sky-400 !w-2.5 !h-2.5" id="t-left" />
      <Handle type="source" position={Position.Right} className="!bg-sky-400 !w-2.5 !h-2.5" id="s-right" />
    </div>
  );
};

// Custom State Node Component
export const OPMStateNode: React.FC<NodeProps<OPMNodeData>> = ({ data, selected }) => {
  const isActive = (data as any).isActive;

  return (
    <div
      className={`relative rounded-md px-2.5 py-1 min-w-[70px] flex items-center justify-center border transition-all duration-200 ${
        selected
          ? 'border-orange-400 bg-orange-950/60 shadow-[0_0_10px_rgba(251,146,60,0.4)]'
          : isActive
          ? 'border-orange-400 bg-orange-600 text-black font-bold shadow-[0_0_15px_rgba(251,146,60,0.7)] animate-pulse'
          : 'border-orange-700/60 bg-[#241712]/90 hover:border-orange-500'
      }`}
    >
      <div className={`text-[11px] font-semibold text-center select-none ${isActive ? 'text-black' : 'text-orange-200'}`}>
        {data.name}
      </div>

      {/* Handles */}
      <Handle type="target" position={Position.Top} className="!bg-orange-400 !w-2 !h-2" id="t-top" />
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400 !w-2 !h-2" id="s-bottom" />
      <Handle type="target" position={Position.Left} className="!bg-orange-400 !w-2 !h-2" id="t-left" />
      <Handle type="source" position={Position.Right} className="!bg-orange-400 !w-2 !h-2" id="s-right" />
    </div>
  );
};
