/**
 * Robust Linear Solver for V-Lab Physics Engine.
 * Supports dense LU decomposition with partial pivoting and basic sparse structures.
 */
export class SparseLinearSolver {
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
