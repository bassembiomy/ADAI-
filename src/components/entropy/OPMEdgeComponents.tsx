import React from 'react';
import { EdgeProps, getBezierPath } from '@xyflow/react';
import { OPMEdgeData, type AppEdge } from './EntropyTypes';

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

const LINK_LABELS: Record<string, string> = {
  agent: 'Agent',
  instrument: 'Instrument',
  consumption: 'Consumption',
  result: 'Result',
  effect: 'Effect',
  trigger: 'Trigger',
  condition: 'Condition',
  aggregation: 'Aggregation',
  generalization: 'Generalization',
  exhibition: 'Exhibition',
  satisfies: 'Satisfies',
  verifies: 'Verifies',
};

const LINK_ICONS: Record<string, string> = {
  agent: '👤',
  instrument: '🎯',
  consumption: '📦',
  result: '✨',
  effect: '🔄',
  trigger: '⚡',
  condition: '❓',
  aggregation: '🧩',
  generalization: '📐',
  exhibition: '⚪',
  satisfies: '📜',
  verifies: '✅',
};

// A single component that can render all custom edges based on the OPM link type.
export const OPMEdge: React.FC<EdgeProps<AppEdge>> = ({
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

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const ls = LINK_STYLES[linkType] ?? { stroke: '#94a3b8', end: 'filled' as MarkerKind };
  const dash = ls.dashed ? '6 4' : undefined;
  const markerStroke = selected ? '#fbbf24' : ls.stroke;

  return (
    <>
      {/* SVG Marker Definitions self-contained for each edge */}
      <svg className="absolute w-0 h-0">
        <defs>
          {ls.end === 'filled' && (
            <marker id={`m-filled-${id}`} markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill={markerStroke} />
            </marker>
          )}
          {ls.end === 'hollow' && (
            <marker id={`m-hollow-${id}`} markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill="#0d0d0d" stroke={markerStroke} strokeWidth="1.2" />
            </marker>
          )}
          {ls.start === 'filled' && (
            <marker id={`m-sfilled-${id}`} markerWidth="10" markerHeight="7" refX="2" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
              <polygon points="0 0, 10 3.5, 0 7" fill={markerStroke} />
            </marker>
          )}
          {ls.structuralStart === 'triangle-filled' && (
            <marker id={`m-tri-f-${id}`} markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse">
              <polygon points="10 2, 2 6, 10 10" fill={markerStroke} stroke={markerStroke} strokeWidth="1" />
            </marker>
          )}
          {ls.structuralStart === 'triangle-hollow' && (
            <marker id={`m-tri-h-${id}`} markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto-start-reverse">
              <polygon points="10 2, 2 6, 10 10" fill="#0d0d0d" stroke={markerStroke} strokeWidth="1.5" />
            </marker>
          )}
          {ls.structuralStart === 'circle-filled' && (
            <marker id={`m-cir-f-${id}`} markerWidth="12" markerHeight="12" refX="3" refY="6" orient="auto-start-reverse">
              <circle cx="6" cy="6" r="4" fill={markerStroke} />
            </marker>
          )}
        </defs>
      </svg>

      {/* Background thicker glow path */}
      <path
        id={`${id}-glow`}
        d={edgePath}
        fill="none"
        stroke={selected ? '#fbbf24' : (data?.isActiveFlow ? ls.stroke : '#27272a')}
        strokeWidth={selected ? 6 : (data?.isActiveFlow ? 5.5 : 2.5)}
        strokeOpacity={selected ? 0.6 : (data?.isActiveFlow ? 0.6 : 0.05)}
        className="transition-all duration-300 pointer-events-none"
        style={{
          filter: selected ? 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.85))' : (data?.isActiveFlow ? `drop-shadow(0 0 5px ${ls.stroke})` : undefined)
        }}
      />

      {/* Main Edge Path */}
      <path
        id={id}
        style={{
          ...style,
          stroke: selected ? '#fbbf24' : (data?.isActiveFlow ? ls.stroke : '#52525b'),
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

      {/* Always-on midpoint type chip (foreignObject keeps the chip testid in the
          edge's own SVG output; EdgeLabelRenderer portals render null under
          renderToStaticMarkup since there is no viewport DOM node) */}
      <foreignObject
        x={labelX - 80}
        y={labelY - 16}
        width={160}
        height={32}
        style={{ overflow: 'visible', pointerEvents: 'none' }}
      >
        <div
          data-testid={`opm-link-chip-${linkType}`}
          style={{
            position: 'absolute',
            left: 80,
            top: 16,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
          className={`nodrag nopan z-40 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] backdrop-blur-md transition-all ${
            selected
              ? 'bg-[#121214]/95 border border-amber-400/80 shadow-[0_0_16px_rgba(251,191,36,0.6)] text-amber-200 z-50'
              : 'bg-[#121214]/85 border border-[#333] text-gray-300 shadow-md hover:border-amber-400/50'
          }`}
        >
          <span className="font-semibold select-none flex items-center gap-1">
            <span>{LINK_ICONS[linkType] || '🔗'}</span>
            <span>{LINK_LABELS[linkType] || linkType}</span>
          </span>
          {selected && (
            <>
              <select
                value={linkType}
                onChange={(e) => {
                  e.stopPropagation();
                  if (data?.onTypeChange) {
                    (data.onTypeChange as any)(e.target.value);
                  }
                }}
                className="bg-[#1c1a14] text-amber-100 border border-amber-500/50 rounded px-1.5 py-0.5 text-[9px] outline-none cursor-pointer hover:border-amber-400"
                style={{ pointerEvents: 'auto' }}
              >
                <optgroup label="Procedural" className="bg-[#141414] text-neutral-200">
                  <option value="consumption">Consumption</option>
                  <option value="result">Result</option>
                  <option value="effect">Effect</option>
                  <option value="agent">Agent</option>
                  <option value="instrument">Instrument</option>
                  <option value="trigger">Trigger</option>
                  <option value="condition">Condition</option>
                </optgroup>
                <optgroup label="Structural" className="bg-[#141414] text-neutral-200">
                  <option value="aggregation">Aggregation</option>
                  <option value="generalization">Generalization</option>
                  <option value="exhibition">Exhibition</option>
                </optgroup>
                <optgroup label="Traceability" className="bg-[#141414] text-neutral-200">
                  <option value="satisfies">Satisfies</option>
                  <option value="verifies">Verifies</option>
                </optgroup>
              </select>
              {Boolean(data?.onDelete) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    (data?.onDelete as any)();
                  }}
                  className="hover:text-red-400 text-neutral-400 ml-0.5 p-0.5 transition-colors font-bold"
                  style={{ pointerEvents: 'auto' }}
                  title="Delete link"
                >
                  ✕
                </button>
              )}
            </>
          )}
        </div>
      </foreignObject>
    </>
  );
};
