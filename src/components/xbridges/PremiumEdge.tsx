// src/components/xbridges/PremiumEdge.tsx
import React, { useContext } from 'react';
import { getBezierPath, getSmoothStepPath, getStraightPath, EdgeProps, useReactFlow } from 'reactflow';
import { WorkspaceContext } from './context';

const getDistanceToSegment = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
};

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
  const { setEdges, screenToFlowPosition } = useReactFlow();
  const workspaceContext = useContext(WorkspaceContext);
  
  let edgePath = '';
  const vertices = data?.vertices || [];

  if (vertices.length > 0) {
    edgePath = `M ${sourceX} ${sourceY}`;
    for (const v of vertices) {
      edgePath += ` L ${v.x} ${v.y}`;
    }
    edgePath += ` L ${targetX} ${targetY}`;
  } else {
    if (type === 'straight') {
      [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    } else if (type === 'smoothstep') {
      [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, borderRadius: 8 });
    } else {
      [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    }
  }

  const color = data?.color || '#4caf50';
  const isSimulating = data?.isSimulating ?? false;

  const handleEdgeDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

    if (workspaceContext?.saveHistory) {
      workspaceContext.saveHistory();
    }

    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === id) {
          const currentVertices = edge.data?.vertices || [];
          const points = [
            { x: sourceX, y: sourceY },
            ...currentVertices,
            { x: targetX, y: targetY }
          ];

          let minDistance = Infinity;
          let insertIndex = 0;

          for (let i = 0; i < points.length - 1; i++) {
            const dist = getDistanceToSegment(flowPos, points[i], points[i + 1]);
            if (dist < minDistance) {
              minDistance = dist;
              insertIndex = i;
            }
          }

          const newVertices = [...currentVertices];
          newVertices.splice(insertIndex, 0, flowPos);

          return {
            ...edge,
            data: {
              ...edge.data,
              vertices: newVertices
            }
          };
        }
        return edge;
      })
    );
  };

  const handleVertexMouseDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();

    if (workspaceContext?.saveHistory) {
      workspaceContext.saveHistory();
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const flowPos = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });

      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === id) {
            const currentVertices = edge.data?.vertices || [];
            const updatedVertices = currentVertices.map((v: any, idx: number) =>
              idx === index ? flowPos : v
            );
            return {
              ...edge,
              data: {
                ...edge.data,
                vertices: updatedVertices
              }
            };
          }
          return edge;
        })
      );
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleVertexDoubleClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();

    if (workspaceContext?.saveHistory) {
      workspaceContext.saveHistory();
    }

    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === id) {
          const currentVertices = edge.data?.vertices || [];
          const updatedVertices = currentVertices.filter((_: any, idx: number) => idx !== index);
          return {
            ...edge,
            data: {
              ...edge.data,
              vertices: updatedVertices
            }
          };
        }
        return edge;
      })
    );
  };

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
        onDoubleClick={handleEdgeDoubleClick}
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
      {/* Waypoint/Vertex Handles */}
      {selected &&
        vertices.map((v: any, idx: number) => (
          <g key={idx} className="group cursor-move">
            {/* Thicker invisible grab-area */}
            <circle
              cx={v.x}
              cy={v.y}
              r={12}
              fill="transparent"
              style={{ pointerEvents: 'all' }}
              onMouseDown={(e) => handleVertexMouseDown(e, idx)}
              onDoubleClick={(e) => handleVertexDoubleClick(e, idx)}
            />
            {/* Visual handle representation */}
            <circle
              cx={v.x}
              cy={v.y}
              r={5.5}
              fill="#ffffff"
              stroke="#c9a86c"
              strokeWidth={2}
              className="transition-all duration-200 group-hover:scale-125 group-hover:fill-[#c9a86c] group-hover:stroke-white pointer-events-none"
              style={{
                filter: 'drop-shadow(0 0 3px rgba(201,168,108,0.5))'
              }}
            />
          </g>
        ))}
    </>
  );
};

