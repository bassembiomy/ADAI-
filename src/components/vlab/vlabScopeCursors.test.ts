import { describe, it, expect } from 'vitest';
import { calculateCursorDeltas } from '../../utils/scopeUtils';

describe('VLab Scope Caliper Cursor Math & Snapping', () => {
  it('correctly calculates deltas between two cursor points', () => {
    const c1 = { t: 1.25, val: 220.0 };
    const c2 = { t: 1.75, val: 0.0 };

    const deltas = calculateCursorDeltas(c1, c2);
    expect(deltas.deltaT).toBeCloseTo(0.5, 3);
    expect(deltas.deltaY).toBeCloseTo(220.0, 3);
    expect(deltas.frequency).toBeCloseTo(2.0, 3); // 1 / 0.5 = 2.0 Hz
    expect(deltas.slope).toBeCloseTo(-440.0, 3); // (0 - 220) / 0.5 = -440
  });

  it('handles identical cursor positions without division by zero errors', () => {
    const c1 = { t: 2.0, val: 50.0 };
    const c2 = { t: 2.0, val: 50.0 };

    const deltas = calculateCursorDeltas(c1, c2);
    expect(deltas.deltaT).toBe(0);
    expect(deltas.deltaY).toBe(0);
    expect(deltas.frequency).toBe(0);
    expect(deltas.slope).toBe(0);
  });
});
