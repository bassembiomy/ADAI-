// src/components/xbridges/PremiumConnectionLine.tsx
import React, { useEffect, useState, useRef } from 'react';
import { getBezierPath, getSmoothStepPath, getStraightPath, useReactFlow } from 'reactflow';
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
  const { screenToFlowPosition } = useReactFlow();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const targetsRef = useRef<{ x: number; y: number; flowX: number; flowY: number }[]>([]);

  // Cache target handles on mount to avoid DOM reads on every render frame
  useEffect(() => {
    const sourceHandleEl = document.querySelector('.react-flow__handle-connecting');
    if (!sourceHandleEl) return;

    const isSourceStart = sourceHandleEl.classList.contains('source');
    const oppositeType = isSourceStart ? 'target' : 'source';
    const handleElements = document.querySelectorAll(
      oppositeType === 'target'
        ? '.react-flow__handle.target'
        : '.react-flow__handle.source'
    );

    const targets: { x: number; y: number; flowX: number; flowY: number }[] = [];
    handleElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const hX = rect.left + rect.width / 2;
      const hY = rect.top + rect.height / 2;
      const flowPos = screenToFlowPosition({ x: hX, y: hY });
      targets.push({
        x: hX,
        y: hY,
        flowX: flowPos.x,
        flowY: flowPos.y
      });
    });
    targetsRef.current = targets;
  }, [screenToFlowPosition]);

  // Listen to pointer coordinates to calculate screen-space proximity
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('pointermove', handleMouseMove);
    return () => window.removeEventListener('pointermove', handleMouseMove);
  }, []);

  // Snapping math: snap if mouse is within 30px screen-space of any valid port
  let finalToX = toX;
  let finalToY = toY;
  let minDistance = 30; // pixels
  let snappedTarget = null;

  for (const target of targetsRef.current) {
    const dist = Math.hypot(target.x - mousePos.x, target.y - mousePos.y);
    if (dist < minDistance) {
      minDistance = dist;
      snappedTarget = target;
    }
  }

  if (snappedTarget) {
    finalToX = snappedTarget.flowX;
    finalToY = snappedTarget.flowY;
  }

  let path = '';
  if (connectionLineType === 'straight') {
    [path] = getStraightPath({ sourceX: fromX, sourceY: fromY, targetX: finalToX, targetY: finalToY });
  } else if (connectionLineType === 'smoothstep') {
    [path] = getSmoothStepPath({ sourceX: fromX, sourceY: fromY, targetX: finalToX, targetY: finalToY, borderRadius: 8 });
  } else {
    [path] = getBezierPath({
      sourceX: fromX,
      sourceY: fromY,
      sourcePosition: fromPosition,
      targetX: finalToX,
      targetY: finalToY,
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
      {/* Moving dot at mouse/snapped cursor */}
      <circle
        cx={finalToX}
        cy={finalToY}
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
