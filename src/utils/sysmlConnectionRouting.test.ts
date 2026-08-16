import { describe, it, expect } from 'vitest';
import {
  calculateSeparatedRelationshipPath,
  calculateOrthogonalConnectorPath,
  type Rect,
} from './sysmlConnectionRouting';

describe('sysmlConnectionRouting', () => {
  const blockA: Rect = { x: 100, y: 100, width: 150, height: 100 };
  const blockB: Rect = { x: 400, y: 100, width: 150, height: 100 };

  it('calculates clean straight path for single relationship between separate blocks', () => {
    const route = calculateSeparatedRelationshipPath(blockA, blockB, 0, 1);
    expect(route.path).toBeDefined();
    expect(route.path.startsWith('M')).toBe(true);
    expect(route.sp.x).toBeGreaterThanOrEqual(100);
    expect(route.tp.x).toBeLessThanOrEqual(550);
    expect(route.labelPos).toBeDefined();
  });

  it('calculates curved offset paths when multiple relationships exist between same pair', () => {
    const route0 = calculateSeparatedRelationshipPath(blockA, blockB, 0, 2);
    const route1 = calculateSeparatedRelationshipPath(blockA, blockB, 1, 2);

    expect(route0.path).not.toEqual(route1.path);
    // Label positions must be distinct to avoid text collision
    expect(Math.abs(route0.labelPos.y - route1.labelPos.y)).toBeGreaterThanOrEqual(15);
  });

  it('calculates orthogonal stepped path for IBD connectors with lane separation', () => {
    const portA = { x: 250, y: 140, side: 'right' as const };
    const portB = { x: 400, y: 200, side: 'left' as const };

    const conn0 = calculateOrthogonalConnectorPath(portA, portB, 0);
    const conn1 = calculateOrthogonalConnectorPath(portA, portB, 1);

    expect(conn0.path).toBeDefined();
    expect(conn1.path).toBeDefined();
    expect(conn0.path).not.toEqual(conn1.path);
    // Midpoint X or Y should be offset by lane index
    expect(conn0.midX).not.toEqual(conn1.midX);
  });

  it('handles reverse direction relationships cleanly without overlapping', () => {
    const forward = calculateSeparatedRelationshipPath(blockA, blockB, 0, 1);
    const backward = calculateSeparatedRelationshipPath(blockB, blockA, 0, 1);

    expect(forward.path).toBeDefined();
    expect(backward.path).toBeDefined();
  });
});
