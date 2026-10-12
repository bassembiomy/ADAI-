import { describe, it, expect, vi } from 'vitest';

vi.mock('react-plotly.js', () => ({ default: () => null }));
import { buildPlotFrame, isFaultSupportedByTarget } from './HILDashboard';

describe('HILDashboard helpers', () => {
  const channels = [{ name: 'a' }, { name: 'b' }];

  it('pushes null (gap) for channels absent from a frame, not 0', () => {
    const next = buildPlotFrame({ a: [1], b: [2] }, channels, { a: 5 }, 50);
    expect(next.a).toEqual([1, 5]);
    expect(next.b).toEqual([2, null]);
  });

  it('keeps a real zero value as 0', () => {
    const next = buildPlotFrame({}, channels, { a: 0, b: 1 }, 50);
    expect(next.a).toEqual([0]);
    expect(next.b).toEqual([1]);
  });

  it('bounds history length', () => {
    let plot: Record<string, Array<number | null>> = {};
    for (let i = 0; i < 20; i++) plot = buildPlotFrame(plot, channels, { a: i, b: i }, 5);
    expect(plot.a.length).toBe(6);
    expect(plot.a[plot.a.length - 1]).toBe(19);
  });

  it('only override faults are supported by firmware', () => {
    expect(isFaultSupportedByTarget('override')).toBe(true);
    expect(isFaultSupportedByTarget('noise')).toBe(false);
    expect(isFaultSupportedByTarget('clamp')).toBe(false);
  });
});
