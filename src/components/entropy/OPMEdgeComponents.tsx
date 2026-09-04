import React from 'react';
import { EdgeProps, getSmoothStepPath, getBezierPath } from 'reactflow';
import { OPMEdgeData } from './EntropyTypes';

/**
 * ISO 19450 OPD link notation:
 *  - Enabler links: agent = filled arrowhead, instrument = hollow arrowhead
 *  - Transforming links: consumption / result = filled arrowhead;
 *    effect = filled arrowheads on both ends (changes the object either way)
 *  - Event links: trigger = dashed + filled arrowhead, condition = dashed + hollow arrowhead
 *  - Structural links (glyph at the source/whole end): aggregation = filled triangle,
 *    generalization = hollow triangle, exhibition = filled circle
 *  - Requirement traceability (extension): satisfies / verifies = dashed + filled arrowhead
 * Colors are a tool-specific secondary cue; the shape carries the standard meaning.
 */

type MarkerKind = 'filled' | 'hollow' | 'none';

interface LinkStyle {
  stroke: string;
  dashed?: boolean;
  end?: MarkerKind;
  start?: MarkerKind;
  structuralStart?: 'triangle-filled' | 'triangle-hollow' | 'circle-filled';
}

const LINK_STYLES: Record<string, LinkStyle> = {
  agent:         { stroke: '#38bdf8', end: 'filled' },
  instrument:    { stroke: '#38bdf8', end: 'hollow' },
  consumption:   { stroke: '#94a3b8', end: 'filled' },
  result:        { stroke: '#10b981', end: 'filled' },
  effect:        { stroke: '#ec4899', end: 'filled', start: 'filled' },
  trigger:       { stroke: '#f59e0b', dashed: true, end: 'filled' },
  condition:     { stroke: '#c084fc', dashed: true, end: 'hollow' },
  aggregation:   { stroke: '#10b981', structuralStart: 'triangle-filled' },
  generalization:{ stroke: '#10b981', structuralStart: 'triangle-hollow' },
  exhibition:    { stroke: '#10b981', structuralStart: 'circle-filled' },
  satisfies:     { stroke: '#c084fc', dashed: true, end: 'filled' },
  verifies:      { stroke: '#c084fc', dashed: true, end: 'filled' },
};

// A single component that can render all custom edges based on the OPM link type.
export const OPMEdge: React.FC<EdgeProps<OPMEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
  selected,
}) => {
  const linkType = data?.type || 'consumption';
  const isStructural = linkType === 'aggregation' || linkType === 'generalization' || linkType === 'exhibition';

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
    offset: 24,
  });

  const ls = LINK_STYLES[linkType] ?? { stroke: '#94a3b8', end: 'filled' as MarkerKind };
  const dash = ls.dashed ? '6 4' : undefined;

  return (
    <>
      {/* SVG Marker Definitions self-contained for each edge */}
      <svg className="absolute w-0 h-0">
        <defs>
          {ls.end === 'filled' && (
            <marker id={`m-filled-${id}`} markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill={ls.stroke} />
            </marker>
          )}
          {ls.end === 'hollow' && (
            <marker id={`m-hollow-${id}`} markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill="#0d0d0d" stroke={ls.stroke} strokeWidth="1.2" />
            </marker>
          )}
          {ls.start === 'filled' && (
            <marker id={`m-sfilled-${id}`} markerWidth="10" markerHeight="7" refX="2" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill={ls.stroke} />
            </marker>
          )}
          {ls.structuralStart === 'triangle-filled' && (
            <marker id={`m-tri-f-${id}`} markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse">
              <polygon points="10 2, 2 6, 10 10" fill={ls.stroke} stroke={ls.stroke} strokeWidth="1" />
            </marker>
          )}
          {ls.structuralStart === 'triangle-hollow' && (
            <marker id={`m-tri-h-${id}`} markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse">
              <polygon points="10 2, 2 6, 10 10" fill="#0d0d0d" stroke={ls.stroke} strokeWidth="1.5" />
            </marker>
          )}
          {ls.structuralStart === 'circle-filled' && (
            <marker id={`m-cir-f-${id}`} markerWidth="12" markerHeight="12" refX="3" refY="6" orient="auto-start-reverse">
              <circle cx="6" cy="6" r="4" fill={ls.stroke} />
            </marker>
          )}
        </defs>
      </svg>

      {/* Background thicker glow path */}
      <path
        id={`${id}-glow`}
        d={edgePath}
        fill="none"
        stroke={selected ? '#fb923c' : (data?.isActiveFlow ? ls.stroke : '#27272a')}
        strokeWidth={selected ? 5 : (data?.isActiveFlow ? 5.5 : 2.5)}
        strokeOpacity={selected ? 0.35 : (data?.isActiveFlow ? 0.6 : 0.05)}
        className="transition-all duration-300 pointer-events-none"
        style={{
          filter: (selected || data?.isActiveFlow) ? `drop-shadow(0 0 5px ${selected ? '#fb923c' : ls.stroke})` : undefined
        }}
      />

      {/* Main Edge Path */}
      <path
        id={id}
        style={{
          ...style,
          stroke: selected ? '#fb923c' : (data?.isActiveFlow ? ls.stroke : '#52525b'),
          strokeWidth: selected ? 2.5 : (data?.isActiveFlow ? 2.2 : 1.2),
          strokeDasharray: dash,
        }}
        className="react-flow__edge-path transition-all duration-300"
        d={edgePath}
        markerEnd={
          ls.end === 'filled' ? `url(#m-filled-${id})`
          : ls.end === 'hollow' ? `url(#m-hollow-${id})`
          : markerEnd
        }
        markerStart={
          ls.structuralStart === 'triangle-filled' ? `url(#m-tri-f-${id})`
          : ls.structuralStart === 'triangle-hollow' ? `url(#m-tri-h-${id})`
          : ls.structuralStart === 'circle-filled' ? `url(#m-cir-f-${id})`
          : ls.start === 'filled' ? `url(#m-sfilled-${id})`
          : undefined
        }
      />

      {/* Thick invisible interaction path to make clicking/hovering easy */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        className="react-flow__edge-interaction cursor-pointer"
      />

      {/* Moving Signal Particle / Pulse (only on active execution flows) */}
      {data?.isActiveFlow && (
        <circle r="3.5" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 5px #ffffff)' }}>
          <animateMotion
            dur="1.2s"
            repeatCount="indefinite"
            path={edgePath}
            calcMode="linear"
          />
        </circle>
      )}

      {/* Edge label if present */}
      {data?.label && (
        <text className="text-[10px] font-semibold font-mono" fill="#e0e0e0">
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
            {data.label}
          </textPath>
        </text>
      )}

      {/* Condition specification text */}
      {data?.conditionText && (
        <g transform={`translate(${labelX}, ${labelY - 10})`}>
          <rect x="-40" y="-8" width="80" height="16" rx="3" fill="#1e1b4b" stroke="#ec4899" strokeWidth="0.5" opacity="0.9" />
          <text fontSize="8" fontWeight="bold" fill="#fbcfe8" textAnchor="middle" dominantBaseline="middle">
            {data.conditionText}
          </text>
        </g>
      )}
    </>
  );
};
