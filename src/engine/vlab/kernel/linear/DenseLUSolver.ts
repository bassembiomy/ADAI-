// src/engine/vlab/kernel/linear/DenseLUSolver.ts
import { LinearSolver } from './LinearSolver';

export class DenseLUSolver implements LinearSolver {
  private LU: number[][] = [];
  private piv: number[] = [];
  private n: number = 0;

  factorize(A: number[][], n: number): boolean {
    this.n = n;
    this.LU = Array.from({ length: n }, (_, i) => [...A[i]]);
    this.piv = Array.from({ length: n }, (_, i) => i);

    for (let j = 0; j < n; j++) {
      let maxRow = j;
      let maxVal = Math.abs(this.LU[j][j]);
      for (let i = j + 1; i < n; i++) {
        const val = Math.abs(this.LU[i][j]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = i;
        }
      }

      if (maxVal < 1e-14) {
        return false; // Singular matrix
      }

      if (maxRow !== j) {
        const tempRow = this.LU[j];
        this.LU[j] = this.LU[maxRow];
        this.LU[maxRow] = tempRow;
        const tempPiv = this.piv[j];
        this.piv[j] = this.piv[maxRow];
        this.piv[maxRow] = tempPiv;
      }

      const diag = this.LU[j][j];
      for (let i = j + 1; i < n; i++) {
        this.LU[i][j] /= diag;
        for (let k = j + 1; k < n; k++) {
          this.LU[i][k] -= this.LU[i][j] * this.LU[j][k];
        }
      }
    }
    return true;
  }

  solve(b: number[]): number[] {
    const n = this.n;
    const x = new Array(n).fill(0);

    // Apply permutation to rhs
    for (let i = 0; i < n; i++) {
      x[i] = b[this.piv[i]];
    }

    // Forward substitution: L * y = P * b
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        x[i] -= this.LU[i][j] * x[j];
      }
    }

    // Back substitution: U * x = y
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j < n; j++) {
        x[i] -= this.LU[i][j] * x[j];
      }
      x[i] /= this.LU[i][i];
    }

    return x;
  }
}
