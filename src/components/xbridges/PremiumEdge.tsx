// src/components/xbridges/PremiumEdge.tsx
import React from 'react';
import { getBezierPath, getSmoothStepPath, getStraightPath, EdgeProps } from 'reactflow';

export const PremiumEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data = {},
  selected,
  type
}: EdgeProps & { type?: string }) => {
  let edgePath = '';

  if (type === 'straight') {
    [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else if (type === 'smoothstep') {
    [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, borderRadius: 8 });
  } else {
    [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  }

  const color = data?.color || '#4caf50';
  const isSimulating = data?.isSimulating ?? false;

  return (
    <>
      {/* Background thicker glow path */}
      <path
        id={`${id}-glow`}
        d={edgePath}
        fill="none"
        stroke={selected ? '#c9a86c' : color}
        strokeWidth={selected ? 6 : 4}
        strokeOpacity={0.2}
        className="transition-all duration-300 pointer-events-none"
        style={{
          filter: `drop-shadow(0 0 4px ${selected ? '#c9a86c' : color})`
        }}
      />
      {/* Main Connection Path */}
      <path
        id={id}
        className="react-flow__edge-path transition-all duration-300"
        d={edgePath}
        fill="none"
        stroke={selected ? '#c9a86c' : color}
        strokeWidth={selected ? 3.5 : 2.5}
        markerEnd={markerEnd}
        style={style}
      />
      {/* Thick invisible interaction path to make clicking/hovering easy */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        className="react-flow__edge-interaction cursor-pointer"
      />
      {/* Moving Signal Particle / Pulse */}
      {isSimulating && (
        <circle r="3.5" fill="#ffffff" className="edge-pulse-dot" style={{ filter: `drop-shadow(0 0 3px ${selected ? '#c9a86c' : color})` }}>
          <animateMotion 
            dur="2s" 
            repeatCount="indefinite" 
            path={edgePath} 
            calcMode="linear"
          />
        </circle>
      )}
    </>
  );
};
