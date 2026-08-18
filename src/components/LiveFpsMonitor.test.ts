import { describe, it, expect } from 'vitest';
import {
  getFpsColorClass,
  getFpsStrokeColor,
  computeRollingAverageFps,
  calculateSparklineY,
  LiveFpsMonitor,
} from './LiveFpsMonitor';

describe('LiveFpsMonitor Utility and Logic', () => {
  it('assigns emerald colors for FPS >= 55', () => {
    expect(getFpsColorClass(60)).toBe('text-emerald-400');
    expect(getFpsColorClass(55)).toBe('text-emerald-400');
    expect(getFpsStrokeColor(60)).toBe('#10b981');
    expect(getFpsStrokeColor(55)).toBe('#10b981');
  });

  it('assigns amber colors for 30 <= FPS < 55', () => {
    expect(getFpsColorClass(54)).toBe('text-amber-400');
    expect(getFpsColorClass(30)).toBe('text-amber-400');
    expect(getFpsStrokeColor(54)).toBe('#f59e0b');
    expect(getFpsStrokeColor(30)).toBe('#f59e0b');
  });

  it('assigns rose colors for FPS < 30', () => {
    expect(getFpsColorClass(29)).toBe('text-rose-400');
    expect(getFpsColorClass(10)).toBe('text-rose-400');
    expect(getFpsStrokeColor(29)).toBe('#f43f5e');
    expect(getFpsStrokeColor(10)).toBe('#f43f5e');
  });

  it('computes rolling average FPS correctly', () => {
    expect(computeRollingAverageFps([60, 60, 60])).toBe(60);
    expect(computeRollingAverageFps([30, 60])).toBe(45);
    expect(computeRollingAverageFps([])).toBe(60);
  });

  it('calculates sparkline Y coordinates within bounds', () => {
    const height = 14;
    // maxFps (60) should map to top (y = 2)
    const yTop = calculateSparklineY(60, 60, height);
    expect(yTop).toBe(2);

    // 0 fps should map to bottom (y = height - 2 = 12)
    const yBottom = calculateSparklineY(0, 60, height);
    expect(yBottom).toBe(12);

    // 30 fps (50%) should map to middle (y = 7)
    const yMid = calculateSparklineY(30, 60, height);
    expect(yMid).toBe(7);
  });

  it('exports LiveFpsMonitor as a React component function', () => {
    expect(typeof LiveFpsMonitor).toBe('function');
  });
});
