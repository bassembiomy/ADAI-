import React from 'react';
import { Handle, Position, NodeProps, useUpdateNodeInternals, NodeResizer } from '@xyflow/react';
import { OPMNodeData, OPMPort, type AppNode } from './EntropyTypes';

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
    width: 10,
    height: 10,
    border: '2px solid #18181b',
    borderRadius: '50%',
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 20,
    cursor: 'crosshair',
    boxShadow: `0 0 6px ${color}99`,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
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
    <div key={port.id} className="group hover:z-30" style={wrapperStyle}>
      <Handle
        type={isInput ? 'target' : 'source'}
        position={position}
        id={port.id}
        style={handleStyle}
        className="hover:scale-125 hover:!border-amber-400 hover:!shadow-[0_0_12px_#fbbf24]"
      />
      <span className="opacity-0 group-hover:opacity-100 group-hover:text-amber-100 group-hover:bg-black/95 group-hover:border-amber-400/50 group-hover:scale-105 transition-all duration-150 shadow-lg pointer-events-none z-30" style={labelStyle}>
        {port.name}
      </span>
    </div>
  );
};

// Custom Object Node Component (also renders Requirement nodes per the extension)
export const OPMObjectNode: React.FC<NodeProps<AppNode>> = ({ id, data, selected }) => {
  const isRequirement = data.type === 'requirement';
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

  // ISO 19450: physical things get a THICK border, informational things a thin one.
  const borderClass = selected
    ? isRequirement
      ? 'border-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.65),0_0_50px_rgba(245,158,11,0.35),inset_0_0_12px_rgba(251,191,36,0.15)] ring-1 ring-amber-300/40 bg-gradient-to-b from-[#22142d]/95 to-[#160b22]/95'
      : 'border-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.65),0_0_50px_rgba(245,158,11,0.35),inset_0_0_12px_rgba(251,191,36,0.15)] ring-1 ring-amber-300/40 bg-gradient-to-b from-[#1a1608]/95 to-[#0a1810]/95'
    : isRequirement
      ? 'border border-purple-500/70 bg-[#160b22]/90 shadow-lg'
      : isPhysical
        ? 'border-[3px] border-emerald-400 bg-[#0a1810]/90 shadow-lg'
        : 'border-2 border-emerald-500 bg-[#0a1810]/90 shadow-lg';

  const stateCount = (data.states || []).length;
  const dynamicMinHeight = stateCount > 0 ? 110 : 80;
  const dynamicMinWidth = stateCount > 0 ? 240 : 220;

  return (
    <div
      className={`relative rounded-xl px-3 py-2 flex flex-col justify-between transition-all duration-200 backdrop-blur-md ${borderClass}`}
      style={{
        minWidth: `${dynamicMinWidth}px`,
        minHeight: `${dynamicMinHeight}px`,
        width: '100%',
        height: '100%'
      }}
    >
      <NodeResizer minWidth={160} minHeight={60} isVisible={selected} lineStyle={{ borderColor: '#fbbf24' }} handleStyle={{ background: '#fbbf24', border: '1px solid #78350f', borderRadius: '4px' }} />

      {/* Header tag */}
      <div className={`flex items-center justify-between gap-2 border-b px-2 pb-1 select-none ${isRequirement ? 'border-purple-800/40' : 'border-emerald-800/40 bg-emerald-950/80'}`}>
        <span className={`text-[8px] uppercase tracking-wider font-extrabold ${isRequirement ? 'text-purple-400/90' : 'text-emerald-400/80'}`}>
          {isRequirement ? '«Requirement»' : '«Object»'}
        </span>
        {!isRequirement && (
          <span className="text-[13px] font-bold text-white truncate">
            {data.name}
          </span>
        )}
        {isPhysical && !isRequirement && (
          <span className="text-[7.5px] px-1.5 py-0.5 rounded bg-emerald-900/60 border border-emerald-700/60 text-emerald-300 font-bold uppercase tracking-wider">Physical</span>
        )}
      </div>

      {isRequirement ? (
        /* Requirement internals: the statement lives INSIDE the shape */
        <div className="flex-1 overflow-y-auto custom-scrollbar text-[10px] leading-snug text-purple-100/95 italic px-1 py-1.5 select-none">
          {(data as any).requirementText || data.name}
        </div>
      ) : (
        <>
          {/* Reserved clean slot area for child state nodes */}
          {stateCount > 0 ? (
            <div className="mt-1 h-9 w-full rounded-lg border border-emerald-900/30 bg-black/35" />
          ) : (
            <div className="mt-1 h-9 w-full rounded-lg border border-dashed border-emerald-700/60 bg-black/25 flex items-center justify-center px-2 text-[10px] text-emerald-300/70 select-none truncate">+ State — click State tool then this object</div>
          )}

          {/* Attributes Listing */}
          {data.attributes && data.attributes.length > 0 && (
            <div className="mt-1 border-t border-emerald-900/40 pt-1 space-y-0.5 text-[8.5px] font-mono text-emerald-400/90 z-10">
              {data.attributes.map((attr, idx) => (
                <div key={idx} className="flex justify-between hover:bg-emerald-950/20 px-1 rounded transition-colors">
                  <span>{attr.key}:</span>
                  <span className="text-emerald-200">{attr.value}</span>
                </div>
              ))}
            </div>
          )}
        </>
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
export const OPMProcessNode: React.FC<NodeProps<AppNode>> = ({ id, data, selected }) => {
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
      className={`relative px-4 py-2 min-w-[200px] min-h-[68px] flex flex-col items-center justify-center transition-all duration-200 ${
        selected
          ? 'border-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.65),0_0_50px_rgba(245,158,11,0.35),inset_0_0_12px_rgba(251,191,36,0.15)] ring-1 ring-amber-300/40 bg-gradient-to-b from-[#1a1608]/95 to-[#081522]/95'
          : isFiring
          ? 'border-2 border-orange-400 bg-sky-900/60 shadow-[0_0_25px_rgba(251,146,60,0.8)] scale-105 animate-pulse'
          : 'border border-sky-600/70 bg-[#0c1a24]/85 backdrop-blur-md shadow-md'
      } ${
        isPhysical && !selected
          ? 'border-[3px] border-sky-400/90'
          : ''
      }`}
      style={{
        borderRadius: '50%',
        width: '100%',
        height: '100%',
      }}
    >
      <NodeResizer minWidth={160} minHeight={60} isVisible={selected} lineStyle={{ borderColor: '#fbbf24' }} handleStyle={{ background: '#fbbf24', border: '1px solid #78350f', borderRadius: '4px' }} />

      <div className="text-center z-10 select-none px-3">
        <span className="text-[7.5px] uppercase tracking-widest font-black text-sky-400/70 block mb-0.5">«Process»</span>
        <div className="text-xs font-bold text-sky-100 px-2 truncate max-w-[180px]">
          {data.name}
        </div>
      </div>

      {/* Zoomed-in internals: the process's procedural link summary INSIDE the ellipse */}
      {isZoomedIn && (
        <div className="absolute inset-x-5 bottom-2 flex justify-center gap-1 flex-wrap z-10">
          {(data.inputs || []).slice(0, 4).map(p => (
            <span key={p.id} className="text-[7px] px-1 py-0.5 rounded bg-black/50 border border-sky-800/60 text-sky-300/90 font-mono">→ {p.name}</span>
          ))}
          {(data.outputs || []).slice(0, 4).map(p => (
            <span key={p.id} className="text-[7px] px-1 py-0.5 rounded bg-black/50 border border-emerald-800/60 text-emerald-300/90 font-mono">{p.name} →</span>
          ))}
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
export const OPMStateNode: React.FC<NodeProps<AppNode>> = ({ id, data, selected }) => {
  const isActive = (data as any).isActive;
  const isInitial = Boolean((data as any).isInitial);
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
      className={`relative rounded-lg px-2 py-1 w-[95px] h-[32px] flex items-center justify-center border transition-all duration-200 box-border ${
        selected
          ? 'border-2 border-amber-400 bg-gradient-to-b from-[#2a1b08] to-[#140b02] shadow-[0_0_22px_rgba(251,191,36,0.7),inset_0_0_8px_rgba(251,191,36,0.2)] ring-1 ring-amber-300/50 scale-105'
          : isActive
          ? 'border-orange-400 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-extrabold shadow-[0_0_18px_rgba(249,115,22,0.85)] scale-105'
          : 'border-orange-900/40 bg-gradient-to-br from-[#1a0e05]/95 to-[#0e0803]/95 text-orange-200/80 hover:border-orange-500/50 hover:bg-[#1a0e05]'
      }`}
    >
      <div className={`text-[9.5px] font-bold text-center select-none flex items-center justify-center gap-1 w-full px-1 truncate ${isActive ? 'text-black font-black' : 'text-orange-200/90'}`}>
        {/* ISO initial-state marker: small filled dot */}
        {isInitial && <span title="Initial state" className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />}
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-black/60 animate-ping border border-black/40 shrink-0" />}
        <span className="truncate">{data.name}</span>
      </div>

      {/* Ports placed absolutely on boundaries */}
      {leftPorts.map((p, idx) => renderOPMPort(p, idx, leftPorts.length, false))}
      {rightPorts.map((p, idx) => renderOPMPort(p, idx, rightPorts.length, false))}
      {topPorts.map((p, idx) => renderOPMPort(p, idx, topPorts.length, false))}
      {bottomPorts.map((p, idx) => renderOPMPort(p, idx, bottomPorts.length, false))}
    </div>
  );
};
