import React, { useState } from 'react';

export interface IbdEndpointIdentity {
  usageId?: string;
  definitionId: string;
  ownerOccurrenceId?: string | null;
}

export interface IbdConnectorEndpointProps {
  usageId?: string;
  definitionId: string;
  ownerOccurrenceId?: string | null;
  name?: string;
  direction?: 'in' | 'out' | 'inout';
  isBoundary?: boolean;
  x: number;
  y: number;
  size?: number;
  isSelected?: boolean;
  isValidTarget?: boolean;
  isConnecting?: boolean;
  onClick?: (endpoint: IbdEndpointIdentity, e: React.MouseEvent) => void;
  onHover?: (endpoint: IbdEndpointIdentity | null) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  className?: string;
}

export const IbdConnectorEndpoint: React.FC<IbdConnectorEndpointProps> = ({
  usageId,
  definitionId,
  ownerOccurrenceId,
  name,
  direction,
  isBoundary = false,
  x,
  y,
  size = 12,
  isSelected = false,
  isValidTarget = true,
  isConnecting = false,
  onClick,
  onHover,
  onMouseDown,
  className = '',
}) => {
  const [hovered, setHovered] = useState(false);
  const half = size / 2;

  const strokeColor = isSelected
    ? '#f97316'
    : isConnecting
      ? (isValidTarget ? '#22c55e' : '#ef4444')
      : hovered
        ? '#fb923c'
        : isBoundary
          ? '#60a5fa'
          : '#a78bfa';

  const fillColor = isSelected
    ? '#f97316'
    : isConnecting && isValidTarget
      ? '#14532d'
      : hovered
        ? '#374151'
        : '#1f2937';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.({ usageId, definitionId, ownerOccurrenceId }, e);
  };

  const handleMouseEnter = () => {
    setHovered(true);
    onHover?.({ usageId, definitionId, ownerOccurrenceId });
  };

  const handleMouseLeave = () => {
    setHovered(false);
    onHover?.(null);
  };

  return (
    <g
      data-testid="ibd-connector-endpoint"
      data-definition-id={definitionId}
      data-occurrence-id={ownerOccurrenceId ?? 'boundary'}
      data-usage-id={usageId ?? ''}
      className={`ibd-connector-endpoint cursor-pointer select-none ${className}`}
      transform={`translate(${x}, ${y})`}
      onClick={handleClick}
      onMouseDown={onMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Invisible expanded hit target for smooth clicking */}
      <rect
        x={-half - 4}
        y={-half - 4}
        width={size + 8}
        height={size + 8}
        fill="transparent"
        stroke="none"
      />

      {/* Visual port square */}
      <rect
        x={-half}
        y={-half}
        width={size}
        height={size}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected || hovered ? 2 : 1.5}
        rx={1}
      />

      {/* Direction indicator arrow */}
      {direction === 'in' && (
        <path
          d={`M ${-half + 2} 0 L ${half - 2} 0 M ${half - 5} -3 L ${half - 2} 0 L ${half - 5} 3`}
          stroke={strokeColor}
          strokeWidth={1}
          fill="none"
        />
      )}
      {direction === 'out' && (
        <path
          d={`M ${half - 2} 0 L ${-half + 2} 0 M ${-half + 5} -3 L ${-half + 2} 0 L ${-half + 5} 3`}
          stroke={strokeColor}
          strokeWidth={1}
          fill="none"
        />
      )}

      {/* Hover tooltip / label */}
      {(hovered || isSelected) && name && (
        <g transform={`translate(0, ${-half - 6})`}>
          <rect
            x={-(name.length * 3 + 6)}
            y={-12}
            width={name.length * 6 + 12}
            height={14}
            fill="#111827"
            stroke="#374151"
            strokeWidth={1}
            rx={2}
          />
          <text
            textAnchor="middle"
            y={-2}
            fill="#f3f4f6"
            fontSize={9}
            fontFamily="monospace"
          >
            {name}
          </text>
        </g>
      )}
    </g>
  );
};
