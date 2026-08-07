import { describe, it, expect } from 'vitest';
import { convertTime, alignRuntimeThreshold } from './smTiming';

describe('smTiming utilities', () => {
  it('converts units correctly', () => {
    expect(convertTime(0.3, 'seconds', 'milliseconds', 100)).toBe(300);
    expect(convertTime(300, 'milliseconds', 'seconds', 100)).toBe(0.3);
    expect(convertTime(3, 'ticks', 'milliseconds', 100)).toBe(300);
    expect(convertTime(500, 'milliseconds', 'milliseconds', 100)).toBe(500);
  });

  it('aligns runtime thresholds cleanly including 0ms', () => {
    expect(alignRuntimeThreshold(300, 100, 'ceil-to-tick')).toEqual({
      requiredTicks: 3,
      thresholdMs: 300,
    });
    expect(alignRuntimeThreshold(250, 100, 'ceil-to-tick')).toEqual({
      requiredTicks: 3,
      thresholdMs: 300,
    });
    expect(alignRuntimeThreshold(0, 100, 'ceil-to-tick')).toEqual({
      requiredTicks: 0,
      thresholdMs: 0,
    });
    expect(alignRuntimeThreshold(0, 100, 'exact')).toEqual({
      requiredTicks: 0,
      thresholdMs: 0,
    });
  });

  it('throws on invalid input values', () => {
    expect(() => alignRuntimeThreshold(-10, 100)).toThrow('Invalid time threshold');
    expect(() => alignRuntimeThreshold(100, 0)).toThrow('Invalid base tick');
    expect(() => convertTime(10, 'seconds', 'unknown' as any, 100)).toThrow('Unsupported unit conversion');
  });
});
