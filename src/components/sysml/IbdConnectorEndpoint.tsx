import React, { useState } from 'react';
import {
  portKindToPresentationRole,
  resolveSemanticPresentation,
  semanticPresentationToken,
} from '../../engine/sysml/semanticPresentationStyles';

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
  /**
   * Underlying port kind (`standard`, `flow`, `proxy`, `full`, …). When
   * supplied, the default symbol resolves via `portKindToPresentationRole`;
   * when absent, the legacy boundary heuristic (boundary → proxy-port role)
   * applies so existing visuals are preserved. Presentation only.
   */
  portKind?: unknown;
  /**
   * Stored `style.color` override for this endpoint's element+diagram.
   * A valid override wins for rendering via `resolveSemanticPresentation`;
   * absent/invalid values resolve to the role token. Presentation only.
   */
  overrideColor?: unknown;
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
  portKind,
  overrideColor,
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

  // Task 6 review fix: IBD port symbols and connection-preview surfaces resolve
  // presentation from the centralized semantic palette (presentation only;
  // validation state is computed upstream and color never drives it).
  // The default symbol resolves from the supplied port kind via
  // portKindToPresentationRole; only when no kind is supplied does the legacy
  // boundary heuristic apply (boundary → proxy-port role). A valid/invalid
  // connection preview presents via the valid-requirement-relationship /
  // error roles; selection and hover present via the selection role.
  // A stored user color override wins for rendering through
  // resolveSemanticPresentation; absent/invalid overrides resolve to the role
  // token. Tokens are applied through `style` (never SVG presentation attributes)
  // because browsers do not resolve var() in presentation attributes.
  const baseRole = portKind !== undefined && portKind !== null
    ? portKindToPresentationRole(portKind)
    : isBoundary
      ? 'proxyPort'
      : 'standardPort';
  const baseToken = resolveSemanticPresentation(baseRole, {
    customization: { color: overrideColor },
  }).color;
  const strokeToken = isSelected
    ? semanticPresentationToken('selection')
    : isConnecting
      ? (isValidTarget ? semanticPresentationToken('validRequirementRelationship') : semanticPresentationToken('error'))
      : hovered
        ? semanticPresentationToken('selection')
        : baseToken;

  const fillToken = isSelected
    ? semanticPresentationToken('selection')
    : isConnecting
      ? (isValidTarget ? semanticPresentationToken('validRequirementRelationship') : semanticPresentationToken('error'))
      : hovered
        ? semanticPresentationToken('selection')
        : baseToken;

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
      data-selected={isSelected ? 'true' : 'false'}
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
        style={{ fill: fillToken, stroke: strokeToken }}
        strokeWidth={isSelected || hovered ? 2 : 1.5}
        rx={1}
      />

      {/* Direction indicator arrow */}
      {direction === 'in' && (
        <path
          d={`M ${-half + 2} 0 L ${half - 2} 0 M ${half - 5} -3 L ${half - 2} 0 L ${half - 5} 3`}
          style={{ stroke: strokeToken }}
          strokeWidth={1}
          fill="none"
        />
      )}
      {direction === 'out' && (
        <path
          d={`M ${half - 2} 0 L ${-half + 2} 0 M ${-half + 5} -3 L ${-half + 2} 0 L ${-half + 5} 3`}
          style={{ stroke: strokeToken }}
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
