import { describe, it, expect } from 'vitest';
import { generateGalaxyData, DEFAULT_GALAXY_PARAMS } from './galaxyGenerator';

describe('galaxyGenerator', () => {
  it('generates expected buffer sizes based on particle count', () => {
    const data = generateGalaxyData({ ...DEFAULT_GALAXY_PARAMS, count: 1000 });
    expect(data.positions.length).toBe(3000);
    expect(data.colors.length).toBe(3000);
    expect(data.count).toBe(1000);
  });

  it('contains valid non-NaN coordinate and color data', () => {
    const data = generateGalaxyData({ ...DEFAULT_GALAXY_PARAMS, count: 500 });
    for (let i = 0; i < data.positions.length; i++) {
      expect(Number.isNaN(data.positions[i])).toBe(false);
      expect(Number.isFinite(data.positions[i])).toBe(true);
    }
    for (let i = 0; i < data.colors.length; i++) {
      expect(data.colors[i]).toBeGreaterThanOrEqual(0);
      expect(data.colors[i]).toBeLessThanOrEqual(1);
    }
  });

  it('respects radial boundaries and branch count distribution', () => {
    const params = {
      ...DEFAULT_GALAXY_PARAMS,
      count: 200,
      radius: 5,
      branches: 3
    };
    const data = generateGalaxyData(params);
    expect(data.count).toBe(200);
    expect(data.positions.length).toBe(600);
  });
});
