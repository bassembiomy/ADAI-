import { Point } from '../types/sm_types';

/**
 * Calculates the quadratic Bezier control point P1 such that the curve
 * B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2 passes exactly through cursorWorld at t = 0.5.
 *
 * Formula:
 * M = 0.25 * P0 + 0.5 * P1 + 0.25 * P2
 * P1 = 2 * M - 0.5 * (P0 + P2)
 */
export function calculateControlPointFromMidpoint(
  source: Point,
  target: Point,
  cursorWorld: Point
): Point {
  return {
    x: 2 * cursorWorld.x - 0.5 * (source.x + target.x),
    y: 2 * cursorWorld.y - 0.5 * (source.y + target.y)
  };
}

/**
 * Converts screen/pointer coordinates to SVG world coordinates.
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number },
  view: { offsetX: number; offsetY: number; scale: number },
  uiZoom: number = 1.0
): Point {
  const safeUiZoom = uiZoom || 1.0;
  const safeScale = view.scale || 1.0;
  return {
    x: ((clientX - canvasRect.left) / safeUiZoom - view.offsetX) / safeScale,
    y: ((clientY - canvasRect.top) / safeUiZoom - view.offsetY) / safeScale
  };
}

/**
 * Checks if mouse movement distance exceeds a given drag threshold in pixels.
 */
export function isDragThresholdExceeded(
  dx: number,
  dy: number,
  threshold: number = 3
): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/**
 * Calculates the default control point for transitions without manual control points.
 */
export function getDefaultControlPoint(
  sp: Point,
  tp: Point,
  isSelfLoop: boolean = false
): Point {
  if (isSelfLoop) {
    return {
      x: (sp.x + tp.x) / 2,
      y: Math.min(sp.y, tp.y) - 50
    };
  }
  return {
    x: (sp.x + tp.x) / 2 + (tp.y - sp.y) * 0.3,
    y: (sp.y + tp.y) / 2 + (sp.x - tp.x) * 0.3
  };
}
