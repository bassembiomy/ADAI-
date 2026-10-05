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
    const matrix = A.map((row, i) => {
      const scale = Math.max(...row.map(Math.abs), 1e-30);
      return [...row.map(v => v / scale), b[i] / scale];
    });
    // Equilibrate columns as well: row scaling alone mistakes independent
    // coordinates for free ones when a stiffness couples very different units.
    const columnScales = Array.from({ length: n }, (_, j) => Math.max(...matrix.map(row => Math.abs(row[j])), 1e-30));
    for (const row of matrix) for (let j = 0; j < n; j++) row[j] /= columnScales[j];
    const columns = Array.from({ length: n }, (_, i) => i);
    const free = new Set(preferFreeColumns);
    let rank = 0;
    for (let k = 0; k < n; k++) {
      let pivot = 0, row = k, col = k;
      for (const priority of [false, true]) {
        for (let i = k; i < n; i++) for (let j = k; j < n; j++) {
          if (free.has(columns[j]) !== priority) continue;
          if (Math.abs(matrix[i][j]) > pivot) { pivot = Math.abs(matrix[i][j]); row = i; col = j; }
        }
        if (pivot >= 1e-7) break;
      }
      if (pivot < 1e-7) break;
      [matrix[k], matrix[row]] = [matrix[row], matrix[k]];
      for (const r of matrix) [r[k], r[col]] = [r[col], r[k]];
      [columns[k], columns[col]] = [columns[col], columns[k]];
      for (let i = k + 1; i < n; i++) {
        const factor = matrix[i][k] / matrix[k][k];
        matrix[i][k] = 0;
        for (let j = k + 1; j <= n; j++) matrix[i][j] -= factor * matrix[k][j];
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
  static solve(A: number[][], b: number[]): number[] {
    const n = b.length;
    
    // Create copies to avoid mutating input parameters
    const A_copy = A.map(row => [...row]);
    const b_copy = [...b];
    
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
      
      // If the pivot is extremely small, we add a tiny regularization term
      // to avoid division by zero (singular matrix handling)
      if (maxVal < 1e-12) {
        A_copy[i][i] = A_copy[i][i] >= 0 ? 1e-12 : -1e-12;
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
    
    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let c = i + 1; c < n; c++) {
        sum += A_copy[i][c] * x[c];
      }
      const diag = A_copy[i][i];
      x[i] = Math.abs(diag) < 1e-15 ? 0 : (b_copy[i] - sum) / diag;
    }
    
    return x;
  }
}
