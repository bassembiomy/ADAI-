import { describe, it, expect } from 'vitest';
import {
  nrmse, maxAbs, finalValueErrPct, peak, overshootPct, settlingTime,
  dominantFrequency, eventTimes, resample, computeMetrics,
} from './metrics';

const grid = (T: number, dt: number) => Array.from({ length: Math.round(T / dt) + 1 }, (_, i) => i * dt);

describe('simscape metrics', () => {
  const t = grid(5, 0.001);
  const g = t.map((x) => 10 * (1 - Math.exp(-x)));

  it('identical signals give zero error', () => {
    expect(nrmse(g, g)).toBe(0);
    expect(maxAbs(g, g)).toBe(0);
    expect(finalValueErrPct(g, g)).toBe(0);
  });

  it('nrmse is normalised by golden range', () => {
    const y = g.map((v) => v + 0.1);
    expect(nrmse(y, g)).toBeCloseTo(0.1 / (g[g.length - 1] - g[0]), 10);
    expect(maxAbs(y, g)).toBeCloseTo(0.1, 12);
  });

  it('final value error in percent', () => {
    const y = [...g];
    y[y.length - 1] = g[g.length - 1] * 1.01;
    expect(finalValueErrPct(y, g)).toBeCloseTo(1, 8);
  });

  it('settling time 2% of first-order step = ~ln(50) tau', () => {
    const tl = grid(30, 0.001);
    const gl = tl.map((x) => 10 * (1 - Math.exp(-x)));
    expect(settlingTime(tl, gl)).toBeCloseTo(Math.log(50), 2);
  });

  it('overshoot and peak of an underdamped step', () => {
    const wn = 10, z = 0.2, wd = wn * Math.sqrt(1 - z * z);
    const tt = grid(5, 0.0005);
    const y = tt.map((x) => 1 - Math.exp(-z * wn * x) * (Math.cos(wd * x) + (z * wn / wd) * Math.sin(wd * x)));
    const expected = 100 * Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z));
    expect(overshootPct(y)).toBeGreaterThan(expected - 0.5);
    expect(overshootPct(y)).toBeLessThan(expected + 0.5);
    expect(peak(y)).toBeGreaterThan(1.5);
  });

  it('dominant frequency from zero crossings', () => {
    const tt = grid(1, 0.0001);
    const y = tt.map((x) => 3 + Math.sin(2 * Math.PI * 50 * x + 0.3));
    expect(dominantFrequency(tt, y)).toBeCloseTo(50, 0);
  });

  it('event times interpolate level crossings', () => {
    const tt = grid(1, 0.01);
    const y = tt.map((x) => x - 0.255);
    expect(eventTimes(tt, y, 0, 1)[0]).toBeCloseTo(0.255, 10);
    expect(eventTimes(tt, y, 0, -1)).toHaveLength(0);
  });

  it('resample interpolates linearly and clamps', () => {
    expect(resample([0, 1, 2], [0, 10, 0], [-1, 0.5, 1.5, 3])).toEqual([0, 5, 5, 0]);
  });

  it('computeMetrics wires everything', () => {
    const m = computeMetrics(t, g, g);
    expect(m.nrmse).toBe(0);
    expect(m.settlingTime).toBeCloseTo(m.settlingTimeGolden, 12);
  });
});

