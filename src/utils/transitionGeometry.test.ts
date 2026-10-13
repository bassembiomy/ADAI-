import { describe, it, expect } from 'vitest';
import {
  calculateControlPointFromMidpoint,
  screenToWorld,
  getDefaultControlPoint,
  isDragThresholdExceeded,
  accumulateDragPosition
} from './transitionGeometry';

describe('transitionGeometry', () => {
  it('calculates quadratic bezier control point so curve passes through cursor at midpoint', () => {
    const sp = { x: 100, y: 100 };
    const tp = { x: 300, y: 100 };
    const cursor = { x: 200, y: 200 };

    // P1 = 2*M - 0.5*(P0 + P2)
    // P1.x = 2*200 - 0.5*(100 + 300) = 400 - 200 = 200
    // P1.y = 2*200 - 0.5*(100 + 100) = 400 - 100 = 300
    const cp = calculateControlPointFromMidpoint(sp, tp, cursor);
    expect(cp).toEqual({ x: 200, y: 300 });

    // Verify midpoint B(0.5) with this cp equals cursor
    const midX = 0.25 * sp.x + 0.5 * cp.x + 0.25 * tp.x;
    const midY = 0.25 * sp.y + 0.5 * cp.y + 0.25 * tp.y;
    expect(midX).toBeCloseTo(cursor.x);
    expect(midY).toBeCloseTo(cursor.y);
  });

  it('correctly maps screen coordinates to world coordinates accounting for pan, zoom, and uiZoom', () => {
    const canvasRect = { left: 50, top: 50, right: 850, bottom: 650, width: 800, height: 600 } as DOMRect;
    const view = { offsetX: 100, offsetY: 50, scale: 1.5 };
    const uiZoom = 1.0;

    // clientX = 200, clientY = 200
    // canvas relative = (200 - 50) = 150, (200 - 50) = 150
    // worldX = (150 - 100) / 1.5 = 50 / 1.5 = 33.333
    // worldY = (150 - 50) / 1.5 = 100 / 1.5 = 66.666
    const world = screenToWorld(200, 200, canvasRect, view, uiZoom);
    expect(world.x).toBeCloseTo(33.333, 2);
    expect(world.y).toBeCloseTo(66.666, 2);
  });

  it('detects when drag movement threshold is exceeded', () => {
    expect(isDragThresholdExceeded(1, 1, 3)).toBe(false);
    expect(isDragThresholdExceeded(3, 0, 3)).toBe(false);
    expect(isDragThresholdExceeded(3.1, 0, 3)).toBe(true);
    expect(isDragThresholdExceeded(0, 4, 3)).toBe(true);
  });

  it('provides sensible default control points for normal transitions and self loops', () => {
    const sp = { x: 100, y: 100 };
    const tp = { x: 200, y: 100 };
    const cp = getDefaultControlPoint(sp, tp, false);
    expect(cp.x).toBeCloseTo(150);
    expect(cp.y).toBeCloseTo(70);

    const loopCp = getDefaultControlPoint(sp, sp, true);
    expect(loopCp.y).toBeLessThan(sp.y);
  });

  it('accumulates sub-grid mouse deltas across small movements without dropping precision or freezing', () => {
    let raw = { x: 100, y: 100 };

    // Move by +2px 5 times (total +10px). With snapping at gridSize=20:
    for (let i = 0; i < 4; i++) {
      const res = accumulateDragPosition(raw, 2, 0, true, 20);
      raw = res.raw;
      expect(res.snapped.x).toBe(100); // Has not crossed threshold yet
    }
    expect(raw.x).toBe(108);

    // 5th move: reaches 110, which snaps to 120
    const res5 = accumulateDragPosition(raw, 2, 0, true, 20);
    expect(res5.raw.x).toBe(110);
    expect(res5.snapped.x).toBe(120);

    // Smooth movement with snap disabled:
    const smoothRes = accumulateDragPosition({ x: 55.4, y: 32.1 }, 1.2, 2.3, false, 20);
    expect(smoothRes.raw.x).toBeCloseTo(56.6);
    expect(smoothRes.raw.y).toBeCloseTo(34.4);
    expect(smoothRes.snapped.x).toBeCloseTo(56.6);
    expect(smoothRes.snapped.y).toBeCloseTo(34.4);
  });
});

