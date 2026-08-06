import { describe, expect, it } from 'vitest';
import {
  matrixAdd,
  matrixInverseGaussJordan,
  matrixMultiply,
  matrixTranspose,
} from './xbStaticMatrix';
import type { XBNumericType } from './xbNumeric';

const f32: XBNumericType = { kind: 'float32' };

describe('xbStaticMatrix', () => {
  it('inverts a pivoting 2x2 matrix', () => {
    const result = matrixInverseGaussJordan([[0, 2], [1, 3]], 2, f32);
    expect(result.fault).toBe(false);
    expect(result.matrix[0][0]).toBeCloseTo(-1.5, 5);
    expect(result.matrix[0][1]).toBeCloseTo(1.0, 5);
    expect(result.matrix[1][0]).toBeCloseTo(0.5, 5);
    expect(result.matrix[1][1]).toBeCloseTo(0.0, 5);
  });

  it('faults deterministically on a singular matrix', () => {
    const result = matrixInverseGaussJordan([[1, 2], [2, 4]], 2, f32);
    expect(result.fault).toBe(true);
  });

  it('multiplies matrices with bounded shapes', () => {
    const a = [[1, 2], [3, 4]];
    const b = [[5, 6], [7, 8]];
    const result = matrixMultiply(a, b, 2, 2, 2, f32);
    expect(result).toEqual([[19, 22], [43, 50]]);
  });

  it('adds matrices elementwise', () => {
    const a = [[1, 2], [3, 4]];
    const b = [[10, 20], [30, 40]];
    const result = matrixAdd(a, b, 2, 2, f32);
    expect(result).toEqual([[11, 22], [33, 44]]);
  });

  it('transposes a matrix', () => {
    const a = [[1, 2, 3], [4, 5, 6]];
    const result = matrixTranspose(a, 2, 3);
    expect(result).toEqual([[1, 4], [2, 5], [3, 6]]);
  });
});
