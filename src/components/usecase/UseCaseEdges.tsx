import React from 'react';
import {
  BaseEdge,
  getSmoothStepPath,
  EdgeProps,
} from '@xyflow/react';
import { UseCaseRelationshipType } from '../../types/usecase_types';
import { Trash2 } from 'lucide-react';

export interface UseCaseEdgeData extends Record<string, unknown> {
  type?: UseCaseRelationshipType;
  onTypeChange?: (edgeId: string, newType: UseCaseRelationshipType) => void;
  onDelete?: (edgeId: string) => void;
}

export const UseCaseEdgeComponent: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  selected,
}) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const edgeData = (data as UseCaseEdgeData) || { type: 'association' };
  const relType = edgeData.type || 'association';

  const isDashed = ['include', 'extend', 'refine', 'satisfy', 'trace'].includes(relType);
  const strokeColor = selected ? '#fbbf24' : '#71717a';
  const markerEnd = relType === 'generalization'
    ? 'url(#cameo-triangle-closed)'
    : (relType === 'association' ? undefined : 'url(#cameo-open-arrow)');

  return (
    <>
      <defs>
        <marker
          id="cameo-open-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 8 5 L 0 8.5" fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        </marker>
        <marker
          id="cameo-triangle-closed"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="9"
          markerHeight="9"
          orient="auto-start-reverse"
        >
          <polygon points="1 1, 11 6, 1 11" fill="#18181b" stroke={strokeColor} strokeWidth="1.5" />
        </marker>
      </defs>

      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={6}
          strokeOpacity={0.25}
          strokeLinecap="round"
          className="animate-pulse pointer-events-none"
        />
      )}

      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray: isDashed ? '6,4' : undefined,
          filter: selected ? 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.7))' : undefined,
        }}
      />

      {/* Floating Pill Label & Inline Type Switcher inside foreignObject for SVG compatibility */}
      <foreignObject
        x={labelX - 80}
        y={labelY - 16}
        width={160}
        height={32}
        style={{ overflow: 'visible', pointerEvents: 'none' }}
      >
        <div
          data-testid={`usecase-link-chip-${relType}`}
          style={{
            position: 'absolute',
            left: 80,
            top: 16,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'all',
          }}
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1.5 shadow-lg border backdrop-blur-md transition-all ${
            selected
              ? 'bg-[#18181b] border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
              : 'bg-[#18181b]/90 border-zinc-700 text-zinc-300'
          }`}
        >
          {relType !== 'association' && (
            <span className="italic font-mono">«{relType}»</span>
          )}

          {selected && (
            <div className="flex items-center gap-1 ml-1 pl-1 border-l border-zinc-700">
              <select
                value={relType}
                onChange={(e) => edgeData.onTypeChange?.(id, e.target.value as UseCaseRelationshipType)}
                className="bg-transparent text-[10px] text-amber-400 focus:outline-none cursor-pointer"
              >
                <option value="association">Association</option>
                <option value="include">«include»</option>
                <option value="extend">«extend»</option>
                <option value="generalization">Generalization</option>
                <option value="refine">«refine»</option>
                <option value="satisfy">«satisfy»</option>
                <option value="trace">«trace»</option>
              </select>

              <button
                onClick={() => edgeData.onDelete?.(id)}
                className="p-0.5 hover:text-red-400 transition-colors"
                title="Delete Relationship"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>
      </foreignObject>
    </>
  );
};
