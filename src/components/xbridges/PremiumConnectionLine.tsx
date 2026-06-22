// src/components/xbridges/PremiumConnectionLine.tsx
import React from 'react';
import { getBezierPath, getSmoothStepPath, getStraightPath } from 'reactflow';
import { getColor } from './XBlockNode';

export const PremiumConnectionLine = ({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  connectionLineType,
  connectionLineStyle,
  fromNode
}: any) => {
  const color = fromNode ? getColor(fromNode.data.type) : '#4caf50';

  let path = '';
  if (connectionLineType === 'straight') {
    [path] = getStraightPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY });
  } else if (connectionLineType === 'smoothstep') {
    [path] = getSmoothStepPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY, borderRadius: 8 });
  } else {
    [path] = getBezierPath({
      sourceX: fromX,
      sourceY: fromY,
      sourcePosition: fromPosition,
      targetX: toX,
      targetY: toY,
      targetPosition: toPosition
    });
  }

  return (
    <g>
      {/* Background glow path */}
      <path
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeOpacity={0.2}
        d={path}
        style={{
          filter: `drop-shadow(0 0 4px ${color})`
        }}
      />
      {/* Main path */}
      <path
        fill="none"
        stroke={color}
        strokeWidth={3}
        d={path}
      />
      {/* Moving dot at mouse cursor */}
      <circle
        cx={toX}
        cy={toY}
        fill="#ffffff"
        r={4}
        stroke={color}
        strokeWidth={2}
        style={{
          filter: `drop-shadow(0 0 6px ${color})`
        }}
      />
    </g>
  );
};
