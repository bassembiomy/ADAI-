// src/engine/vlab/kernel/linear/DenseLUSolver.test.ts
import { describe, it, expect } from 'vitest';
import { DenseLUSolver } from './DenseLUSolver';

describe('DenseLUSolver', () => {
  it('should solve a 2x2 linear system correctly', () => {
    const solver = new DenseLUSolver();
    const A = [
      [2, 1],
      [5, 7]
    ];
    const b = [11, 13];
    const ok = solver.factorize(A, 2);
    expect(ok).toBe(true);
    const x = solver.solve(b);
    expect(x[0]).toBeCloseTo(7.1111, 3);
    expect(x[1]).toBeCloseTo(-3.2222, 3);
  });

  it('should detect singular matrix and return false on factorize', () => {
    const solver = new DenseLUSolver();
    const A = [
      [1, 2],
      [2, 4]
    ];
    const ok = solver.factorize(A, 2);
    expect(ok).toBe(false);
  });
});
