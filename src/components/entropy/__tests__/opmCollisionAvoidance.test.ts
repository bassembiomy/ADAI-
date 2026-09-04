import { describe, it, expect } from 'vitest';
import { resolveBlockOverlap, RectBounds, checkOverlap } from '../OpmCollisionAvoidance';

describe('OpmCollisionAvoidance', () => {
  describe('checkOverlap', () => {
    it('returns false when bounding boxes do not touch or intersect', () => {
      const a: RectBounds = { id: 'a', x: 0, y: 0, width: 100, height: 50 };
      const b: RectBounds = { id: 'b', x: 120, y: 0, width: 100, height: 50 };
      expect(checkOverlap(a, b, 10)).toBe(false);
    });

    it('returns true when bounding boxes intersect within padding', () => {
      const a: RectBounds = { id: 'a', x: 0, y: 0, width: 100, height: 50 };
      const b: RectBounds = { id: 'b', x: 95, y: 10, width: 100, height: 50 };
      expect(checkOverlap(a, b, 10)).toBe(true);
    });
  });

  describe('resolveBlockOverlap', () => {
    it('does not alter position if there is no collision', () => {
      const moving: RectBounds = { id: 'node-1', x: 0, y: 0, width: 100, height: 50 };
      const others: RectBounds[] = [
        { id: 'node-2', x: 200, y: 200, width: 100, height: 50 }
      ];

      const result = resolveBlockOverlap(moving, others, 10);
      expect(result.collided).toBe(false);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('nudges moving node away when overlapping another node', () => {
      const moving: RectBounds = { id: 'node-1', x: 50, y: 20, width: 100, height: 60 };
      const others: RectBounds[] = [
        { id: 'node-2', x: 0, y: 0, width: 100, height: 60 }
      ];

      const result = resolveBlockOverlap(moving, others, 15);
      expect(result.collided).toBe(true);
      const noOverlapX = result.x >= 115 || result.x + moving.width <= -15;
      const noOverlapY = result.y >= 75 || result.y + moving.height <= -15;
      expect(noOverlapX || noOverlapY).toBe(true);
    });

    it('avoids colliding with multiple neighboring blocks by shifting to open space', () => {
      const moving: RectBounds = { id: 'node-1', x: 50, y: 0, width: 100, height: 60 };
      const others: RectBounds[] = [
        { id: 'node-2', x: 0, y: 0, width: 100, height: 60 },
        { id: 'node-3', x: 120, y: 0, width: 100, height: 60 },
      ];

      const result = resolveBlockOverlap(moving, others, 10);
      expect(result.collided).toBe(true);
      // Resolved position must not overlap either node-2 or node-3
      const movingResolved: RectBounds = { id: 'node-1', x: result.x, y: result.y, width: 100, height: 60 };
      expect(checkOverlap(movingResolved, others[0], 5)).toBe(false);
      expect(checkOverlap(movingResolved, others[1], 5)).toBe(false);
    });
  });
});
