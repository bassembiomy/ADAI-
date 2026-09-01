import { describe, it, expect } from 'vitest';
import {
  calculateSignalStatistics,
  calculateCursorDeltas,
  calculateAutoScaleRange,
  SIMULINK_SCOPE_COLORS,
  getVLabSignalInfo,
  exportScopeToCSV
} from './scopeUtils';

describe('scopeUtils', () => {
  it('has official MATLAB/Simulink scope color palette', () => {
    expect(SIMULINK_SCOPE_COLORS).toBeDefined();
    expect(SIMULINK_SCOPE_COLORS.length).toBeGreaterThanOrEqual(8);
    // Yellow, Magenta, Cyan, Red, Green, Blue, Orange, White
    expect(SIMULINK_SCOPE_COLORS[0]).toBe('#FFFF00');
    expect(SIMULINK_SCOPE_COLORS[1]).toBe('#FF00FF');
    expect(SIMULINK_SCOPE_COLORS[2]).toBe('#00FFFF');
  });

  it('calculates signal statistics accurately for sinusoidal and DC data', () => {
    const data = [
      { time: 0.0, in1: 0 },
      { time: 0.25, in1: 10 },
      { time: 0.5, in1: 0 },
      { time: 0.75, in1: -10 },
      { time: 1.0, in1: 0 }
    ];

    const stats = calculateSignalStatistics(data, 'in1');
    expect(stats.min).toBe(-10);
    expect(stats.max).toBe(10);
    expect(stats.peakToPeak).toBe(20);
    expect(stats.mean).toBeCloseTo(0, 1);
    expect(stats.rms).toBeGreaterThan(0);
    expect(stats.count).toBe(5);
  });

  it('calculates cursor deltas, delta T, delta Y, frequency, and slope', () => {
    const deltas = calculateCursorDeltas(
      { t: 0.2, val: 5.0 },
      { t: 0.6, val: 15.0 }
    );

    expect(deltas.deltaT).toBeCloseTo(0.4, 4);
    expect(deltas.frequency).toBeCloseTo(2.5, 4); // 1 / 0.4 = 2.5 Hz
    expect(deltas.deltaY).toBeCloseTo(10.0, 4);
    expect(deltas.slope).toBeCloseTo(25.0, 4); // 10 / 0.4 = 25
  });

  it('calculates robust autoscale range with 10% headroom', () => {
    const data = [
      { time: 0, in1: -5, in2: 15 },
      { time: 1, in1: 0, in2: 20 },
      { time: 2, in1: 5, in2: 10 }
    ];

    const [yMin, yMax] = calculateAutoScaleRange(data, ['in1', 'in2'], 0.1);
    // Range is -5 to 20 (span = 25). 10% headroom = 2.5 on each side => [-7.5, 22.5]
    expect(yMin).toBeCloseTo(-7.5, 2);
    expect(yMax).toBeCloseTo(22.5, 2);
  });

  it('handles flatline / constant signals in autoscale without NaN or 0-height collapse', () => {
    const flatData = [
      { time: 0, in1: 5 },
      { time: 1, in1: 5 }
    ];

    const [yMin, yMax] = calculateAutoScaleRange(flatData, ['in1'], 0.1);
    expect(yMin).toBeLessThan(5);
    expect(yMax).toBeGreaterThan(5);
    expect(Number.isFinite(yMin)).toBe(true);
    expect(Number.isFinite(yMax)).toBe(true);
  });
});
