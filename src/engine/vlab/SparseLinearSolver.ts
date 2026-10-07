import { SingularMatrixError, type SingularPivot } from './vlabResidualDiagnostics';

/**
 * Robust Linear Solver for V-Lab Physics Engine.
 * Supports dense LU decomposition with partial pivoting and basic sparse structures.
 */
export class SparseLinearSolver {
  /** Rank-revealing elimination for joints with genuinely free coordinates.
   * Zero Newton increments on free columns preserve the current pose. The
   * nonlinear solver still checks every residual, including redundant rows.
   */
  static solveRankDeficient(A: number[][], b: number[], preferFreeColumns: number[] = []): number[] {
    const n = b.length;
    // WP-31c: flat typed rows and an array lookup for the free columns (the Set lookup inside the O(n^2) pivot search of every
    // elimination step made this the dominant cost of a multibody step); the pivot choice and the arithmetic are unchanged.
    const matrix = A.map((row, i) => {
      let scale = 1e-30;
      for (const v of row) { const a = Math.abs(v); if (a > scale) scale = a; }
      const r = new Float64Array(n + 1);
      for (let j = 0; j < n; j++) r[j] = row[j] / scale;
      r[n] = b[i] / scale;
      return r;
    });
    // Equilibrate columns as well: row scaling alone mistakes independent
    // coordinates for free ones when a stiffness couples very different units.
    const columnScales = new Array<number>(n);
    for (let j = 0; j < n; j++) {
      let m = 1e-30;
      for (const row of matrix) { const a = Math.abs(row[j]); if (a > m) m = a; }
      columnScales[j] = m;
    }
    for (const row of matrix) for (let j = 0; j < n; j++) row[j] /= columnScales[j];
    const columns = Array.from({ length: n }, (_, i) => i);
    const freeSet = new Set(preferFreeColumns);
    const isFree = columns.map(c => freeSet.has(c));
    let rank = 0;
    for (let k = 0; k < n; k++) {
      // best entry among the non-free columns first (scan order i, j; strict >), the free columns only if none reaches 1e-7
      let pivot = 0, row = k, col = k;
      let freePivot = 0, freeRow = k, freeCol = k;
      for (let i = k; i < n; i++) {
        const mi = matrix[i];
        for (let j = k; j < n; j++) {
          const a = Math.abs(mi[j]);
          if (isFree[j]) { if (a > freePivot) { freePivot = a; freeRow = i; freeCol = j; } }
          else if (a > pivot) { pivot = a; row = i; col = j; }
        }
      }
      if (!(pivot >= 1e-7) && freePivot > pivot) { pivot = freePivot; row = freeRow; col = freeCol; }
      if (pivot < 1e-7) break;
      const tr = matrix[k]; matrix[k] = matrix[row]; matrix[row] = tr;
      for (const r of matrix) { const t = r[k]; r[k] = r[col]; r[col] = t; }
      const tc = columns[k]; columns[k] = columns[col]; columns[col] = tc;
      const tf = isFree[k]; isFree[k] = isFree[col]; isFree[col] = tf;
      const mk = matrix[k];
      for (let i = k + 1; i < n; i++) {
        const mi = matrix[i];
        const factor = mi[k] / mk[k];
        mi[k] = 0;
        for (let j = k + 1; j <= n; j++) mi[j] -= factor * mk[j];
      }
      rank++;
    }
    const result = new Array(n).fill(0), permuted = new Array(n).fill(0);
    for (let i = rank - 1; i >= 0; i--) {
      let value = matrix[i][n];
      for (let j = i + 1; j < rank; j++) value -= matrix[i][j] * permuted[j];
      permuted[i] = value / matrix[i][i];
    }
    columns.forEach((col, i) => { result[col] = permuted[i] / columnScales[col]; });
    return result;
  }
  /**
   * Solves Ax = b using Gaussian elimination with partial pivoting.
   * This is extremely robust for DAE algebraic constraints.
   */
  /**
   * Pivot threshold of the equilibrated matrix (every row and column scaled by a power of two to max |a| in [0.7, 1.42]). A pivot below it means the
   * Newton matrix is singular to working precision (condition number > 1e14): reported, never regularized (WP-31b, F-051).
   */
  static readonly SINGULAR_PIVOT = 1e-14;
  /** Number of singular-but-consistent solves (free unknowns held) since the last reset; the engine reports it per call. */
  static singularSolveCount = 0;

  static solve(A: number[][], b: number[]): number[] {
    const n = b.length;

    // WP-31b (F-051): row then column equilibration (D_r A D_c y = D_r b, x = D_c y) so that the singularity test is
    // independent of the units of the rows (W, A, Pa) and of the unknowns. The solution is unchanged in exact arithmetic.
    // Power-of-two scale factors (LAPACK dgeequb): scaling is exact, no rounding is introduced.
    const pow2Inverse = (m: number) => (m > 0 && Number.isFinite(m) ? Math.pow(2, -Math.round(Math.log2(m))) : 1);
    const rowScale = A.map(row => {
      let m = 0;
      for (const v of row) { const a = Math.abs(v); if (a > m) m = a; }
      return pow2Inverse(m);
    });
    const A_copy = A.map((row, i) => row.map(v => v * rowScale[i]));
    const colScale = new Array(n).fill(1);
    for (let j = 0; j < n; j++) {
      let m = 0;
      for (let i = 0; i < n; i++) { const a = Math.abs(A_copy[i][j]); if (a > m) m = a; }
      if (m > 0 && Number.isFinite(m)) {
        colScale[j] = pow2Inverse(m);
        for (let i = 0; i < n; i++) A_copy[i][j] *= colScale[j];
      }
    }
    const b_copy = b.map((v, i) => v * rowScale[i]);
    const singular: SingularPivot[] = [];

    // Row mapping to keep track of permutations (pivoting)
    const p = Array.from({ length: n }, (_, i) => i);

    for (let i = 0; i < n; i++) {
      // Find pivot row (largest absolute value in column i)
      let maxVal = 0;
      let pivotRow = i;
      for (let r = i; r < n; r++) {
        const val = Math.abs(A_copy[r][i]);
        if (val > maxVal) {
          maxVal = val;
          pivotRow = r;
        }
      }

      // No usable pivot: the matrix is singular in this unknown. Record it (all of them are collected) and skip the column.
      if (!(maxVal >= SparseLinearSolver.SINGULAR_PIVOT)) {
        singular.push({ column: i, pivot: maxVal });
        continue;
      } else if (pivotRow !== i) {
        // Swap rows in A, b, and permutation vector
        const tempRow = A_copy[i];
        A_copy[i] = A_copy[pivotRow];
        A_copy[pivotRow] = tempRow;
        
        const tempB = b_copy[i];
        b_copy[i] = b_copy[pivotRow];
        b_copy[pivotRow] = tempB;
        
        const tempP = p[i];
        p[i] = p[pivotRow];
        p[pivotRow] = tempP;
      }
      
      // Eliminate column i below row i
      const pivot = A_copy[i][i];
      for (let r = i + 1; r < n; r++) {
        const factor = A_copy[r][i] / pivot;
        A_copy[r][i] = 0; // Explicitly set to 0
        for (let c = i + 1; c < n; c++) {
          A_copy[r][c] -= factor * A_copy[i][c];
        }
        b_copy[r] -= factor * b_copy[i];
      }
    }
    if (singular.length) {
      // A singular but CONSISTENT system (b in the range of A, e.g. an unknown that the current mode leaves undetermined,
      // whose row and column vanish together) has the solutions x_p + null(A). The rank-revealing elimination returns
      // the one with zero components on the free unknowns (the Newton increment holds them at their current value).
      // It is used only when it reproduces b; every use is counted (singularSolveCount) and surfaced by the engine.
      // An inconsistent system has no solution: that is the diagnostic.
      const xr = SparseLinearSolver.solveRankDeficient(A, b);
      let resid = 0, scale = 0;
      for (let i = 0; i < n; i++) {
        let s = 0, mag = Math.abs(b[i]);
        for (let j = 0; j < n; j++) { s += A[i][j] * xr[j]; mag += Math.abs(A[i][j] * xr[j]); }
        resid = Math.max(resid, Math.abs(s - b[i]));
        scale = Math.max(scale, mag);
      }
      if (xr.every(Number.isFinite) && resid <= 1e-10 * scale) {
        SparseLinearSolver.singularSolveCount++;
        return xr;
      }
      throw new SingularMatrixError(singular);
    }

    // Back substitution (every pivot passed the singularity test above)
    const y = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let c = i + 1; c < n; c++) {
        sum += A_copy[i][c] * y[c];
      }
      y[i] = (b_copy[i] - sum) / A_copy[i][i];
    }

    return y.map((v, j) => v * colScale[j]);
  }
}
