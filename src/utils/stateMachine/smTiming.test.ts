import { describe, expect, it } from 'vitest';
import { normalizeLogicalTick, timingToleranceMs } from './smTiming';

describe('fixed logical tick', () => {
  it('normalizes accepted jitter to one configured tick', () => {
    expect(timingToleranceMs(500)).toBe(50);
    expect(normalizeLogicalTick(500, 450)).toEqual({
      kind: 'accepted', observedMs: 450, logicalMs: 500,
    });
    expect(normalizeLogicalTick(500, 550)).toEqual({
      kind: 'accepted', observedMs: 550, logicalMs: 500,
    });
  });

  it('separates invalid elapsed values from out-of-tolerance jitter', () => {
    expect(normalizeLogicalTick(500, -1).kind).toBe('invalid');
    expect(normalizeLogicalTick(500, Number.NaN).kind).toBe('invalid');
    expect(normalizeLogicalTick(500, 449)).toEqual({
      kind: 'out-of-tolerance', observedMs: 449, logicalMs: 500,
    });
  });
});
