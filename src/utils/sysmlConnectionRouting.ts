export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface RelationshipRoute {
  path: string;
  sp: Point;
  tp: Point;
  labelPos: Point;
  angle: number;
}

export interface ConnectorRoute {
  path: string;
  midX: number;
  midY: number;
  angle: number;
}

export function getEdgePoint(from: Rect, to: Rect): Point {
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  const tx = to.x + to.width / 2;
  const ty = to.y + to.height / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  const angle = Math.atan2(dy, dx);
  const w = from.width / 2;
  const h = from.height / 2;
  let edgeX = fx;
  let edgeY = fy;

  if (Math.abs(Math.cos(angle)) * h > Math.abs(Math.sin(angle)) * w) {
    edgeX = fx + (Math.cos(angle) > 0 ? w : -w);
    edgeY = fy + (edgeX - fx) * Math.tan(angle);
  } else {
    edgeY = fy + (Math.sin(angle) > 0 ? h : -h);
    edgeX = fx + (edgeY - fy) / Math.tan(angle);
  }
  return { x: edgeX, y: edgeY };
}

/**
 * Computes non-overlapping connection paths for SysML relationships.
 * If multiple relationships share the same source and target pair, curves them outwards.
 */
export function calculateSeparatedRelationshipPath(
  source: Rect,
  target: Rect,
  edgeIndex = 0,
  totalEdgesBetweenPair = 1,
): RelationshipRoute {
  const sp = getEdgePoint(source, target);
  const tp = getEdgePoint(target, source);

  const dx = tp.x - sp.x;
  const dy = tp.y - sp.y;
  const angle = Math.atan2(dy, dx);
  const midX = (sp.x + tp.x) / 2;
  const midY = (sp.y + tp.y) / 2;

  // If single edge, render straight line
  if (totalEdgesBetweenPair <= 1) {
    return {
      path: `M ${sp.x} ${sp.y} L ${tp.x} ${tp.y}`,
      sp,
      tp,
      labelPos: { x: midX, y: midY - 8 },
      angle: (angle * 180) / Math.PI,
    };
  }

  // Multi-edge curvature separation
  // Calculate perpendicular normal
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;

  // Symmetric offset: e.g. for 2 edges: -24, +24; for 3 edges: -36, 0, +36
  const offsetSpread = 32;
  const offsetMag = ((edgeIndex - (totalEdgesBetweenPair - 1) / 2)) * offsetSpread;

  const cpX = midX + nx * offsetMag;
  const cpY = midY + ny * offsetMag;

  // Bezier curve path
  const path = `M ${sp.x} ${sp.y} Q ${cpX} ${cpY} ${tp.x} ${tp.y}`;

  return {
    path,
    sp,
    tp,
    labelPos: { x: cpX, y: cpY - 8 },
    angle: (angle * 180) / Math.PI,
  };
}

/**
 * Computes orthogonal (Manhattan) non-overlapping stepped paths for IBD connectors.
 */
export function calculateOrthogonalConnectorPath(
  p1: { x: number; y: number; side?: 'top' | 'bottom' | 'left' | 'right' },
  p2: { x: number; y: number; side?: 'top' | 'bottom' | 'left' | 'right' },
  connectorIndex = 0,
): ConnectorRoute {
  const laneOffset = ((connectorIndex % 5) - 2) * 14;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  let path = '';
  let midX = (p1.x + p2.x) / 2;
  let midY = (p1.y + p2.y) / 2;

  // If ports are generally horizontal (e.g. left-right)
  if (Math.abs(dx) >= Math.abs(dy) || p1.side === 'left' || p1.side === 'right' || p2.side === 'left' || p2.side === 'right') {
    const stepX = Math.round((p1.x + p2.x) / 2) + laneOffset;
    path = `M ${p1.x} ${p1.y} L ${stepX} ${p1.y} L ${stepX} ${p2.y} L ${p2.x} ${p2.y}`;
    midX = stepX;
    midY = (p1.y + p2.y) / 2;
  } else {
    // Vertical stepped
    const stepY = Math.round((p1.y + p2.y) / 2) + laneOffset;
    path = `M ${p1.x} ${p1.y} L ${p1.x} ${stepY} L ${p2.x} ${stepY} L ${p2.x} ${p2.y}`;
    midX = (p1.x + p2.x) / 2;
    midY = stepY;
  }

  const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;

  return {
    path,
    midX,
    midY,
    angle,
  };
}
