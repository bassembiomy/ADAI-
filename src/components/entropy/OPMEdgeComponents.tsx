import React from 'react';
import { EdgeProps, getBezierPath } from 'reactflow';
import { OPMEdgeData } from './EntropyTypes';

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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const linkType = data?.type || 'consumption';
  
  // Base styling for OPM links
  let strokeColor = '#94a3b8'; // slate-400
  let strokeWidth = selected ? 2.5 : 1.5;
  let strokeDasharray = undefined;

  // Specific link type styling
  if (linkType === 'aggregation' || linkType === 'generalization' || linkType === 'exhibition') {
    strokeColor = '#10b981'; // emerald-500 for structural links
  } else if (linkType === 'agent' || linkType === 'instrument') {
    strokeColor = '#38bdf8'; // sky-400 for enabling links
  } else if (linkType === 'trigger') {
    strokeColor = '#f59e0b'; // amber-500
    strokeWidth = selected ? 3 : 2;
  } else if (linkType === 'condition') {
    strokeColor = '#c084fc'; // purple-400
  } else if (linkType === 'effect') {
    strokeColor = '#ec4899'; // pink-500
  }

  // Custom marker setups
  let customMarkerEnd = undefined;
  let customMarkerStart = undefined;

  switch (linkType) {
    case 'consumption':
      customMarkerEnd = `url(#opm-arrow-consumption-${id})`;
      break;
    case 'result':
      customMarkerEnd = `url(#opm-arrow-result-${id})`;
      break;
    case 'effect':
      customMarkerEnd = `url(#opm-arrow-effect-end-${id})`;
      customMarkerStart = `url(#opm-arrow-effect-start-${id})`;
      break;
    case 'agent':
      customMarkerEnd = `url(#opm-circle-agent-${id})`;
      break;
    case 'instrument':
      customMarkerEnd = `url(#opm-circle-instrument-${id})`;
      break;
    case 'condition':
      customMarkerEnd = `url(#opm-circle-condition-${id})`;
      break;
    case 'trigger':
      customMarkerEnd = `url(#opm-lightning-trigger-${id})`;
      break;
    // Structural links have a triangle marker at the source (the whole / superclass / object exhibiting)
    case 'aggregation':
      customMarkerStart = `url(#opm-tri-aggregation-${id})`;
      break;
    case 'generalization':
      customMarkerStart = `url(#opm-tri-generalization-${id})`;
      break;
    case 'exhibition':
      customMarkerStart = `url(#opm-tri-exhibition-${id})`;
      break;
    default:
      break;
  }

  return (
    <>
      {/* SVG Marker Definitions self-contained for each edge */}
      <svg className="absolute w-0 h-0">
        <defs>
          {/* Consumption Arrow (Normal arrowhead pointing target) */}
          <marker
            id={`opm-arrow-consumption-${id}`}
            markerWidth="10"
            markerHeight="7"
            refX="8"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={strokeColor} />
          </marker>

          {/* Result Arrow (Normal arrowhead pointing target) */}
          <marker
            id={`opm-arrow-result-${id}`}
            markerWidth="10"
            markerHeight="7"
            refX="8"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={strokeColor} />
          </marker>

          {/* Effect Arrow (Double-headed arrow, start and end markers) */}
          <marker
            id={`opm-arrow-effect-end-${id}`}
            markerWidth="10"
            markerHeight="7"
            refX="8"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={strokeColor} />
          </marker>
          <marker
            id={`opm-arrow-effect-start-${id}`}
            markerWidth="10"
            markerHeight="7"
            refX="2"
            refY="3.5"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={strokeColor} />
          </marker>

          {/* Agent (Solid black circle at target) */}
          <marker
            id={`opm-circle-agent-${id}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <circle cx="4" cy="4" r="3.5" fill={strokeColor} stroke={strokeColor} strokeWidth="1" />
          </marker>

          {/* Instrument (Hollow circle at target) */}
          <marker
            id={`opm-circle-instrument-${id}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <circle cx="4" cy="4" r="3.5" fill="#0c1a24" stroke={strokeColor} strokeWidth="1.5" />
          </marker>

          {/* Condition (Circle with 'c' at target) */}
          <marker
            id={`opm-circle-condition-${id}`}
            markerWidth="12"
            markerHeight="12"
            refX="10"
            refY="6"
            orient="auto"
          >
            <circle cx="6" cy="6" r="5" fill="#0c1a24" stroke={strokeColor} strokeWidth="1.5" />
            <text x="6" y="9" fontSize="8" fontWeight="bold" fontFamily="monospace" fill={strokeColor} textAnchor="middle">c</text>
          </marker>

          {/* Trigger (Lightning bolt / double arrowhead at target) */}
          <marker
            id={`opm-lightning-trigger-${id}`}
            markerWidth="12"
            markerHeight="12"
            refX="10"
            refY="6"
            orient="auto"
            markerUnits="strokeWidth"
          >
            {/* Draw a lightning symbol or double chevron */}
            <path d="M3,2 L8,6 L4,7 L9,11" fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
          </marker>

          {/* Aggregation (Solid triangle pointing whole - pointing back to source) */}
          <marker
            id={`opm-tri-aggregation-${id}`}
            markerWidth="12"
            markerHeight="12"
            refX="2"
            refY="6"
            orient="auto-start-reverse"
          >
            <polygon points="10 2, 2 6, 10 10" fill={strokeColor} stroke={strokeColor} strokeWidth="1" />
          </marker>

          {/* Generalization (Open triangle pointing superclass - pointing back to source) */}
          <marker
            id={`opm-tri-generalization-${id}`}
            markerWidth="12"
            markerHeight="12"
            refX="2"
            refY="6"
            orient="auto-start-reverse"
          >
            <polygon points="10 2, 2 6, 10 10" fill="#0d1f14" stroke={strokeColor} strokeWidth="1.5" />
          </marker>

          {/* Exhibition (Open triangle containing smaller solid triangle) */}
          <marker
            id={`opm-tri-exhibition-${id}`}
            markerWidth="12"
            markerHeight="12"
            refX="2"
            refY="6"
            orient="auto-start-reverse"
          >
            <polygon points="10 2, 2 6, 10 10" fill="#0d1f14" stroke={strokeColor} strokeWidth="1.5" />
            <polygon points="8 4, 4 6, 8 8" fill={strokeColor} />
          </marker>
        </defs>
      </svg>

      {/* Main Edge Path */}
      <path
        id={id}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
        }}
        className="react-flow__edge-path transition-all"
        d={edgePath}
        markerEnd={customMarkerEnd || markerEnd}
        markerStart={customMarkerStart}
      />

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
