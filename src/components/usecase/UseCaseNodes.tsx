import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { UseCaseElementData } from '../../types/usecase_types';

export const UseCaseNodeComponent: React.FC<any> = ({ data, selected }) => {
  const glowStyle = selected
    ? {
        boxShadow: '0 0 25px rgba(251, 191, 36, 0.65), 0 0 45px rgba(245, 158, 11, 0.35), inset 0 0 10px rgba(251, 191, 36, 0.15)',
      }
    : undefined;

  return (
    <div
      style={glowStyle}
      className={`rounded-[50%] border-2 px-6 py-3 flex flex-col items-center justify-center bg-[#18181b]/95 backdrop-blur-md min-w-[150px] min-h-[75px] transition-all duration-200 ${
        selected ? 'border-amber-400 text-amber-200' : 'border-zinc-600 hover:border-zinc-400 text-zinc-100'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      
      <span className="text-[10px] text-amber-500/90 font-medium tracking-wide">«use case»</span>
      <span className="text-xs font-semibold text-center leading-tight mt-0.5">{data?.label || 'Use Case'}</span>

      {data?.extensionPoints && data.extensionPoints.length > 0 && (
        <div className="mt-1 pt-1 border-t border-zinc-700/60 w-full flex flex-col items-center">
          <span className="text-[9px] text-zinc-400">extension points:</span>
          {data.extensionPoints.map((ep: string, i: number) => (
            <span key={i} className="text-[9px] text-amber-300 italic">{ep}</span>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
    </div>
  );
};

export const ActorNodeComponent: React.FC<any> = ({ data, selected }) => {
  const glowStyle = selected
    ? {
        boxShadow: '0 0 25px rgba(251, 191, 36, 0.65), 0 0 45px rgba(245, 158, 11, 0.35)',
      }
    : undefined;

  const strokeColor = selected ? '#fbbf24' : '#a1a1aa';

  return (
    <div style={glowStyle} className={`flex flex-col items-center p-2 rounded-lg transition-all duration-200 ${selected ? 'border border-amber-400 bg-amber-400/5' : ''}`}>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />

      {/* SysML Vector Stick Figure */}
      <svg width="40" height="56" viewBox="0 0 40 56" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="10" r="7" className="fill-[#18181b]" />
        <line x1="20" y1="17" x2="20" y2="36" />
        <line x1="6" y1="24" x2="34" y2="24" />
        <line x1="20" y1="36" x2="8" y2="52" />
        <line x1="20" y1="36" x2="32" y2="52" />
      </svg>

      <span className="text-[10px] text-amber-500/90 font-medium mt-1">«actor»</span>
      <span className="text-xs font-semibold text-zinc-100 text-center leading-tight mt-0.5">{data?.label || 'Actor'}</span>

      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
    </div>
  );
};

export const BoundaryNodeComponent: React.FC<any> = ({ data, selected }) => {
  const glowStyle = selected
    ? {
        boxShadow: '0 0 25px rgba(251, 191, 36, 0.5), inset 0 0 15px rgba(251, 191, 36, 0.1)',
      }
    : undefined;

  return (
    <div
      style={glowStyle}
      className={`border-2 border-dashed rounded-lg bg-zinc-900/30 w-full h-full min-w-[320px] min-h-[260px] transition-all duration-200 ${
        selected ? 'border-amber-400 bg-amber-400/5' : 'border-zinc-700 hover:border-zinc-600'
      }`}
    >
      <div className="bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-300 font-bold border-b border-zinc-700/60 rounded-t-md flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-amber-500 font-medium">«subject»</span>
          <span>{data.label || 'System Boundary'}</span>
        </div>
      </div>
    </div>
  );
};
