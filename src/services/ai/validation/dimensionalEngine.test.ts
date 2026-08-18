import { describe, it, expect } from 'vitest';
import { DimensionalEngine } from './dimensionalEngine';

describe('DimensionalEngine with Finite Quantity Verification', () => {
  it('should normalize SI prefixes and verify dimension vector equality', () => {
    const normL = DimensionalEngine.normalize({ value: 2.5, unit: 'mH' });
    expect(normL.normalizedValue).toBeCloseTo(0.0025);
    expect(normL.dimensionVector).toEqual([1, 2, -2, -2, 0, 0, 0]);

    const normC = DimensionalEngine.normalize({ value: 10, unit: 'uF' });
    expect(normC.normalizedValue).toBeCloseTo(1e-5);
    expect(normC.dimensionVector).toEqual([-1, -2, 4, 2, 0, 0, 0]);
  });

  it('should reject non-finite quantities (NaN, Infinity)', () => {
    expect(() => DimensionalEngine.normalize({ value: NaN, unit: 'V' })).toThrowError(/NON_FINITE_QUANTITY/);
    expect(() => DimensionalEngine.normalize({ value: Infinity, unit: 'V' })).toThrowError(/NON_FINITE_QUANTITY/);
  });

  it('should support dimensionless quantities with unit "1" and "%"', () => {
    const d1 = DimensionalEngine.normalize({ value: 0.819, unit: '1' });
    expect(d1.normalizedValue).toBe(0.819);
    expect(d1.dimensionVector).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
