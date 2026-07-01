import React from 'react';
import { Handle, Position, NodeProps, useUpdateNodeInternals, NodeResizer } from 'reactflow';
import { OPMNodeData, OPMPort } from './EntropyTypes';

// Helpers to style port handles by OPM link role
const getHandleColor = (type: string) => {
  switch (type) {
    case 'agent': return '#38bdf8'; // Sky-400 (agents)
    case 'instrument': return '#0284c7'; // Dark sky (instruments)
    case 'trigger': return '#f59e0b'; // Amber-500 (triggers)
    case 'condition': return '#c084fc'; // Purple-400 (conditions)
    case 'effect': return '#ec4899'; // Pink-500 (effects)
    case 'result': return '#10b981'; // Emerald-500 (results)
    case 'consumption': return '#64748b'; // Slate-400 (consumption)
    default: return '#94a3b8'; // Slate-400 standard
  }
};

const renderOPMPort = (port: OPMPort, idx: number, totalCount: number, isEllipse: boolean = false) => {
  const isInput = port.direction === 'input';
  const position = 
    port.position === 'left' ? Position.Left :
    port.position === 'right' ? Position.Right :
    port.position === 'top' ? Position.Top : Position.Bottom;

  const color = getHandleColor(port.type);
  const percentage = `${((idx + 1) * 100) / (totalCount + 1)}%`;
  
  const handleStyle: React.CSSProperties = {
    background: color,
    width: 9,
    height: 9,
    border: '2px solid #0d0d0d',
    borderRadius: '50%',
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 20,
    cursor: 'pointer',
  };

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 20,
    width: '0px',
    height: '0px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    fontSize: '7.5px',
    fontFamily: 'monospace',
    padding: '1.5px 3px',
    borderRadius: '3px',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#d1d5db',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    userSelect: 'none',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  };

  // If ellipse, project coordinates onto boundary
  if (isEllipse) {
    const tVal = ((idx + 1) / (totalCount + 1)) * 2 - 1; // from -1 to 1
    const factor = Math.sqrt(Math.max(0, 1 - tVal * tVal));

    if (port.position === 'left') {
      wrapperStyle.left = `${50 * (1 - factor)}%`;
      wrapperStyle.top = percentage;
      labelStyle.left = '12px';
      labelStyle.transform = 'translateY(-50%)';
    } else if (port.position === 'right') {
      wrapperStyle.left = `${50 + 50 * factor}%`;
      wrapperStyle.top = percentage;
      labelStyle.right = '12px';
      labelStyle.transform = 'translateY(-50%)';
    } else if (port.position === 'top') {
      wrapperStyle.left = percentage;
      wrapperStyle.top = `${50 * (1 - factor)}%`;
      labelStyle.top = '12px';
      labelStyle.transform = 'translateX(-50%)';
    } else if (port.position === 'bottom') {
      wrapperStyle.left = percentage;
      wrapperStyle.top = `${50 + 50 * factor}%`;
      labelStyle.bottom = '12px';
      labelStyle.transform = 'translateX(-50%)';
    }
  } else {
    // Normal rectangular boundaries
    if (port.position === 'left') {
      wrapperStyle.left = '0%';
      wrapperStyle.top = percentage;
      labelStyle.left = '12px';
      labelStyle.transform = 'translateY(-50%)';
    } else if (port.position === 'right') {
      wrapperStyle.left = '100%';
      wrapperStyle.top = percentage;
      labelStyle.right = '12px';
      labelStyle.transform = 'translateY(-50%)';
    } else if (port.position === 'top') {
      wrapperStyle.left = percentage;
      wrapperStyle.top = '0%';
      labelStyle.top = '12px';
      labelStyle.transform = 'translateX(-50%)';
    } else if (port.position === 'bottom') {
      wrapperStyle.left = percentage;
      wrapperStyle.top = '100%';
      labelStyle.bottom = '12px';
      labelStyle.transform = 'translateX(-50%)';
    }
  }

  return (
    <div key={port.id} className="group" style={wrapperStyle}>
      <Handle
        type={isInput ? 'target' : 'source'}
        position={position}
        id={port.id}
        style={handleStyle}
      />
      <span className="opacity-75 group-hover:opacity-100 group-hover:text-white group-hover:bg-black/90 group-hover:scale-105" style={labelStyle}>
        {port.name}
      </span>
    </div>
  );
};

// Custom Object Node Component
export const OPMObjectNode: React.FC<NodeProps<OPMNodeData>> = ({ id, data, selected }) => {
  const isPhysical = data.physical;
  const isZoomedIn = data.zoomedIn;
  const updateNodeInternals = useUpdateNodeInternals();

  const allPorts = React.useMemo(() => [
    ...(data.inputs || []),
    ...(data.outputs || [])
  ], [data.inputs, data.outputs]);

  React.useEffect(() => {
    updateNodeInternals(id);
  }, [id, allPorts.length, data.inputs, data.outputs, updateNodeInternals]);

  const leftPorts = allPorts.filter(p => p.position === 'left');
  const rightPorts = allPorts.filter(p => p.position === 'right');
  const topPorts = allPorts.filter(p => p.position === 'top');
  const bottomPorts = allPorts.filter(p => p.position === 'bottom');

  return (
    <div
      className={`relative rounded-md px-4 py-3 min-w-[150px] min-h-[85px] flex flex-col justify-between transition-all duration-300 ${
        selected
          ? 'border-2 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)] bg-emerald-950/40'
          : 'border border-emerald-600/70 bg-[#0d1f14]/80 backdrop-blur-md shadow-md'
      } ${
        isPhysical
          ? 'border-dashed shadow-[0_0_8px_rgba(52,211,153,0.15)] [border-width:2px]'
          : ''
      }`}
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      <NodeResizer minWidth={120} minHeight={60} isVisible={selected} lineStyle={{ borderColor: '#10b981' }} handleStyle={{ background: '#10b981', border: 'none', borderRadius: '4px' }} />

      {/* OPM Object Label */}
      <div className="flex items-center justify-between border-b border-emerald-800/40 pb-1 mb-1.5 select-none">
        <span className="text-[9px] uppercase tracking-wider font-extrabold text-emerald-400/80">Object</span>
        {isPhysical && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 font-semibold scale-90">Physical</span>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center relative px-1 py-1">
        <div className="text-sm font-bold text-emerald-100 text-center px-2 py-0.5 select-none">
          {data.name}
        </div>
      </div>

      {/* Attributes Listing */}
      {data.attributes && data.attributes.length > 0 && (
        <div className="mt-1.5 border-t border-emerald-900/40 pt-1 space-y-0.5 text-[9px] font-mono text-emerald-400/90 z-10">
          {data.attributes.map((attr, idx) => (
            <div key={idx} className="flex justify-between hover:bg-emerald-950/20 px-1 rounded transition-colors">
              <span>{attr.key}:</span>
              <span className="text-emerald-200">{attr.value}</span>
            </div>
          ))}
        </div>
      )}

      {isZoomedIn && (
        <div className="mt-4 border-t border-emerald-800/20 pt-2 text-[10px] text-[#666] italic text-center">
          In-Body Detail Area (Drag elements here)
        </div>
      )}

      {/* Ports placed absolutely on boundaries */}
      {leftPorts.map((p, idx) => renderOPMPort(p, idx, leftPorts.length, false))}
      {rightPorts.map((p, idx) => renderOPMPort(p, idx, rightPorts.length, false))}
      {topPorts.map((p, idx) => renderOPMPort(p, idx, topPorts.length, false))}
      {bottomPorts.map((p, idx) => renderOPMPort(p, idx, bottomPorts.length, false))}
    </div>
  );
};

// Custom Process Node Component
export const OPMProcessNode: React.FC<NodeProps<OPMNodeData>> = ({ id, data, selected }) => {
  const isPhysical = data.physical;
  const isZoomedIn = data.zoomedIn;
  const isFiring = (data as any).isFiring;
  const updateNodeInternals = useUpdateNodeInternals();

  const allPorts = React.useMemo(() => [
    ...(data.inputs || []),
    ...(data.outputs || [])
  ], [data.inputs, data.outputs]);

  React.useEffect(() => {
    updateNodeInternals(id);
  }, [id, allPorts.length, data.inputs, data.outputs, updateNodeInternals]);

  const leftPorts = allPorts.filter(p => p.position === 'left');
  const rightPorts = allPorts.filter(p => p.position === 'right');
  const topPorts = allPorts.filter(p => p.position === 'top');
  const bottomPorts = allPorts.filter(p => p.position === 'bottom');

  return (
    <div
      className={`relative px-6 py-4 min-w-[140px] min-h-[80px] flex flex-col items-center justify-center transition-all duration-300 ${
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
        width: '100%',
        height: '100%',
      }}
    >
      <NodeResizer minWidth={120} minHeight={60} isVisible={selected} lineStyle={{ borderColor: '#0284c7' }} handleStyle={{ background: '#0284c7', border: 'none', borderRadius: '4px' }} />

      <div className="text-center z-10 select-none">
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

      {/* Ports placed absolutely on ellipse boundaries */}
      {leftPorts.map((p, idx) => renderOPMPort(p, idx, leftPorts.length, true))}
      {rightPorts.map((p, idx) => renderOPMPort(p, idx, rightPorts.length, true))}
      {topPorts.map((p, idx) => renderOPMPort(p, idx, topPorts.length, true))}
      {bottomPorts.map((p, idx) => renderOPMPort(p, idx, bottomPorts.length, true))}
    </div>
  );
};

// Custom State Node Component
export const OPMStateNode: React.FC<NodeProps<OPMNodeData>> = ({ id, data, selected }) => {
  const isActive = (data as any).isActive;
  const updateNodeInternals = useUpdateNodeInternals();

  const allPorts = React.useMemo(() => [
    ...(data.inputs || []),
    ...(data.outputs || [])
  ], [data.inputs, data.outputs]);

  React.useEffect(() => {
    updateNodeInternals(id);
  }, [id, allPorts.length, data.inputs, data.outputs, updateNodeInternals]);

  const leftPorts = allPorts.filter(p => p.position === 'left');
  const rightPorts = allPorts.filter(p => p.position === 'right');
  const topPorts = allPorts.filter(p => p.position === 'top');
  const bottomPorts = allPorts.filter(p => p.position === 'bottom');

  return (
    <div
      className={`relative rounded-full px-3 py-1.5 min-w-[75px] min-h-[28px] flex items-center justify-center border transition-all duration-300 ${
        selected
          ? 'border-orange-400 bg-orange-950/70 shadow-[0_0_12px_rgba(251,146,60,0.5)] scale-105'
          : isActive
          ? 'border-orange-400 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-extrabold shadow-[0_0_18px_rgba(249,115,22,0.85)] scale-105'
          : 'border-orange-900/40 bg-gradient-to-br from-[#1a0e05]/90 to-[#0e0803]/90 text-orange-200/80 hover:border-orange-500/50 hover:bg-[#1a0e05]'
      }`}
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      <div className={`text-[10px] font-bold text-center select-none flex items-center justify-center gap-1.5 ${isActive ? 'text-black font-black' : 'text-orange-200/90'}`}>
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-black/60 animate-ping border border-black/40" />}
        <span>{data.name}</span>
      </div>

      {/* Ports placed absolutely on boundaries */}
      {leftPorts.map((p, idx) => renderOPMPort(p, idx, leftPorts.length, false))}
      {rightPorts.map((p, idx) => renderOPMPort(p, idx, rightPorts.length, false))}
      {topPorts.map((p, idx) => renderOPMPort(p, idx, topPorts.length, false))}
      {bottomPorts.map((p, idx) => renderOPMPort(p, idx, bottomPorts.length, false))}
    </div>
  );
};
