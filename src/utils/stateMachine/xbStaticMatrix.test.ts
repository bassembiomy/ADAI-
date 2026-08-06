import { describe, expect, it } from 'vitest';
import { matrixInverseGaussJordan } from './xbStaticMatrix';
import { type XBNumericType } from './xbSemanticModel';

const f32: XBNumericType = { kind: 'float32' };

describe('X-Bridges Static Matrix Operations', () => {
  it('inverts a pivoting 2x2 matrix', () => {
    const result = matrixInverseGaussJordan([[0, 2], [1, 3]], f32);
    expect(result.fault).toBe(false);
    expect(result.matrix[0][0]).toBeCloseTo(-1.5);
    expect(result.matrix[0][1]).toBeCloseTo(1);
    expect(result.matrix[1][0]).toBeCloseTo(0.5);
    expect(result.matrix[1][1]).toBeCloseTo(0);
  });

  it('faults deterministically on a singular innovation covariance', () => {
    expect(matrixInverseGaussJordan([[1, 2], [2, 4]], f32).fault).toBe(true);
  });
});
