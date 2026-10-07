/**
 * WP-31c (F-079c): LU factorization of the Newton matrix that can be reused for several right-hand sides (modified Newton), with a
 * genuinely sparse path for large systems.
 *
 *  - Both paths equilibrate the matrix first (rows, then columns, by powers of two: exact in floating point, like LAPACK dgeequb),
 *    exactly as SparseLinearSolver.solve does, and report a vanishing pivot (< SparseLinearSolver.SINGULAR_PIVOT on the equilibrated
 *    matrix) by returning null. The caller then uses SparseLinearSolver.solve, which owns the singular / rank-deficient handling and
 *    the diagnostics; this module never regularizes anything.
 *  - Dense path (n < SPARSE_THRESHOLD or a dense matrix): Gaussian elimination with partial pivoting; the arithmetic is the same
 *    sequence of operations as SparseLinearSolver.solve, so the result is bit-identical to it.
 *  - Sparse path: left-looking LU with threshold partial pivoting (Gilbert and Peierls, "Sparse partial pivoting in time
 *    proportional to arithmetic operations", SIAM J. Sci. Stat. Comput. 9, 1988; Davis, "Direct Methods for Sparse Linear Systems",
 *    SIAM 2006, cs_lu, section 6.4). The cost is proportional to the arithmetic on the nonzeros, not n^3. Columns are processed in
 *    order of increasing column count (a static fill-reducing ordering; the Newton matrix of a circuit / mechanical network is close
 *    to banded or tree-structured), and the diagonal is preferred whenever it is within 1/10 of the largest candidate (threshold
 *    pivoting, as UMFPACK's default), which keeps the fill low without giving up stability.
 */

/** Square matrix in compressed-column form: column j holds rows Ai[Ap[j] .. Ap[j+1]) with values Ax. */
export interface CscMatrix { n: number; Ap: number[]; Ai: number[]; Ax: number[] }

export interface LUFactor {
  readonly n: number;
  readonly kind: 'dense' | 'sparse';
  /** nonzeros of L + U (fill-in measure) */
  readonly factorNonzeros: number;
  solve(b: number[]): number[];
}

/** pivots below this (equilibrated matrix) are singular: the same constant as SparseLinearSolver.SINGULAR_PIVOT */
const SINGULAR_PIVOT = 1e-14;
/** systems with at least this many unknowns (and a sparse matrix) use the sparse LU */
export const SPARSE_LU_THRESHOLD = 96;

const pow2Inverse = (m: number) => (m > 0 && Number.isFinite(m) ? Math.pow(2, -Math.round(Math.log2(m))) : 1);

export function cscToDense(a: CscMatrix): number[][] {
  const J: number[][] = Array.from({ length: a.n }, () => new Array(a.n).fill(0));
  for (let j = 0; j < a.n; j++) for (let p = a.Ap[j]; p < a.Ap[j + 1]; p++) J[a.Ai[p]][j] += a.Ax[p];
  return J;
}

/** Equilibration factors: rows first, then columns of the row-scaled matrix (power-of-two, as SparseLinearSolver.solve). */
function equilibrate(a: CscMatrix): { rowScale: number[]; colScale: number[]; Ax: number[] } | null {
  const n = a.n;
  const rowMax = new Array(n).fill(0);
  for (let p = 0; p < a.Ai.length; p++) { const v = Math.abs(a.Ax[p]); if (v > rowMax[a.Ai[p]]) rowMax[a.Ai[p]] = v; }
  const rowScale = rowMax.map(pow2Inverse);
  const Ax = a.Ax.slice();
  for (let p = 0; p < Ax.length; p++) Ax[p] *= rowScale[a.Ai[p]];
  const colScale = new Array(n).fill(1);
  for (let j = 0; j < n; j++) {
    let m = 0;
    for (let p = a.Ap[j]; p < a.Ap[j + 1]; p++) { const v = Math.abs(Ax[p]); if (v > m) m = v; }
    if (m > 0 && Number.isFinite(m)) {
      colScale[j] = pow2Inverse(m);
      for (let p = a.Ap[j]; p < a.Ap[j + 1]; p++) Ax[p] *= colScale[j];
    }
  }
  for (const v of Ax) if (!Number.isFinite(v)) return null;
  return { rowScale, colScale, Ax };
}

class DenseLU implements LUFactor {
  readonly kind = 'dense' as const;
  readonly factorNonzeros: number;
  constructor(readonly n: number, private lu: Float64Array, private perm: number[], private rowScale: number[], private colScale: number[]) {
    this.factorNonzeros = n * n;
  }
  solve(b: number[]): number[] {
    const { n, lu, perm, rowScale, colScale } = this;
    const z = new Array<number>(n);
    for (let i = 0; i < n; i++) z[i] = b[perm[i]] * rowScale[perm[i]];
    for (let i = 0; i < n; i++) {
      const zi = z[i];
      for (let r = i + 1; r < n; r++) z[r] -= lu[r * n + i] * zi;
    }
    const y = new Array<number>(n);
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let c = i + 1; c < n; c++) sum += lu[i * n + c] * y[c];
      y[i] = (z[i] - sum) / lu[i * n + i];
    }
    return y.map((v, j) => v * colScale[j]);
  }
}

function factorDense(a: CscMatrix): LUFactor | null {
  const n = a.n;
  const eq = equilibrate(a);
  if (!eq) return null;
  const lu = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let p = a.Ap[j]; p < a.Ap[j + 1]; p++) lu[a.Ai[p] * n + j] += eq.Ax[p];
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    let maxVal = 0, pivotRow = i;
    for (let r = i; r < n; r++) {
      const val = Math.abs(lu[r * n + i]);
      if (val > maxVal) { maxVal = val; pivotRow = r; }
    }
    if (!(maxVal >= SINGULAR_PIVOT)) return null;
    if (pivotRow !== i) {
      for (let c = 0; c < n; c++) { const t = lu[i * n + c]; lu[i * n + c] = lu[pivotRow * n + c]; lu[pivotRow * n + c] = t; }
      const tp = perm[i]; perm[i] = perm[pivotRow]; perm[pivotRow] = tp;
    }
    const pivot = lu[i * n + i];
    for (let r = i + 1; r < n; r++) {
      const factor = lu[r * n + i] / pivot;
      lu[r * n + i] = factor;
      if (factor !== 0) for (let c = i + 1; c < n; c++) lu[r * n + c] -= factor * lu[i * n + c];
    }
  }
  return new DenseLU(n, lu, perm, eq.rowScale, eq.colScale);
}

class SparseLUFactor implements LUFactor {
  readonly kind = 'sparse' as const;
  readonly factorNonzeros: number;
  constructor(
    readonly n: number, private Lp: number[], private Li: number[], private Lx: number[],
    private Up: number[], private Ui: number[], private Ux: number[],
    private pinv: Int32Array, private q: number[], private rowScale: number[], private colScale: number[],
  ) {
    this.factorNonzeros = Li.length + Ui.length;
  }
  solve(b: number[]): number[] {
    const { n, Lp, Li, Lx, Up, Ui, Ux, pinv, q, rowScale, colScale } = this;
    const c = new Array<number>(n);
    for (let i = 0; i < n; i++) c[pinv[i]] = b[i] * rowScale[i];
    for (let j = 0; j < n; j++) {
      const cj = c[j];
      if (cj !== 0) for (let p = Lp[j] + 1; p < Lp[j + 1]; p++) c[Li[p]] -= Lx[p] * cj;
    }
    for (let j = n - 1; j >= 0; j--) {
      c[j] /= Ux[Up[j + 1] - 1];
      const cj = c[j];
      if (cj !== 0) for (let p = Up[j]; p < Up[j + 1] - 1; p++) c[Ui[p]] -= Ux[p] * cj;
    }
    const x = new Array<number>(n);
    for (let k = 0; k < n; k++) x[q[k]] = c[k] * colScale[q[k]];
    return x;
  }
}

function factorSparse(a: CscMatrix): LUFactor | null {
  const n = a.n;
  const eq = equilibrate(a);
  if (!eq) return null;
  const { Ap, Ai } = a;
  const Ax = eq.Ax;
  // static column ordering: fewest nonzeros first (stable)
  const q = Array.from({ length: n }, (_, j) => j).sort((u, v) => (Ap[u + 1] - Ap[u]) - (Ap[v + 1] - Ap[v]) || u - v);
  const Lp: number[] = new Array(n + 1).fill(0), Up: number[] = new Array(n + 1).fill(0);
  const Li: number[] = [], Lx: number[] = [], Ui: number[] = [], Ux: number[] = [];
  const pinv = new Int32Array(n).fill(-1);
  const x = new Float64Array(n);
  const xi = new Int32Array(n), pstack = new Int32Array(n);
  const mark = new Int32Array(n); // stamp k + 1 = visited while processing column k
  const TOL = 0.1;

  for (let k = 0; k < n; k++) {
    Lp[k] = Li.length; Up[k] = Ui.length;
    const col = q[k];
    const stamp = k + 1;
    // symbolic: reach of the nonzero pattern of A(:, col) through the graph of L (depth-first, reverse topological order in xi[top..])
    let top = n;
    for (let p = Ap[col]; p < Ap[col + 1]; p++) {
      const start = Ai[p];
      if (mark[start] === stamp) continue;
      let head = 0;
      xi[0] = start;
      while (head >= 0) {
        const j = xi[head];
        const jnew = pinv[j];
        if (mark[j] !== stamp) { mark[j] = stamp; pstack[head] = jnew < 0 ? 0 : Lp[jnew]; }
        let done = true;
        const p2 = jnew < 0 ? 0 : Lp[jnew + 1];
        for (let pp = pstack[head]; pp < p2; pp++) {
          const i = Li[pp];
          if (mark[i] === stamp) continue;
          pstack[head] = pp;
          xi[++head] = i;
          done = false;
          break;
        }
        if (done) { head--; xi[--top] = j; }
      }
    }
    // numeric: sparse triangular solve L x = A(:, col)
    for (let p = top; p < n; p++) x[xi[p]] = 0;
    for (let p = Ap[col]; p < Ap[col + 1]; p++) x[Ai[p]] += Ax[p];
    for (let px = top; px < n; px++) {
      const j = xi[px];
      const J = pinv[j];
      if (J < 0) continue;
      const xj = x[j];
      if (xj === 0) continue;
      for (let p = Lp[J] + 1; p < Lp[J + 1]; p++) x[Li[p]] -= Lx[p] * xj;
    }
    // pivot: largest unpivoted candidate; prefer the diagonal when it is within TOL of it
    let ipiv = -1, amax = -1;
    for (let p = top; p < n; p++) {
      const i = xi[p];
      if (pinv[i] < 0) {
        const t = Math.abs(x[i]);
        if (t > amax) { amax = t; ipiv = i; }
      } else {
        Ui.push(pinv[i]); Ux.push(x[i]);
      }
    }
    if (ipiv === -1 || !(amax >= SINGULAR_PIVOT)) return null;
    if (pinv[col] < 0 && Math.abs(x[col]) >= amax * TOL && mark[col] === stamp) ipiv = col;
    const pivot = x[ipiv];
    Ui.push(k); Ux.push(pivot);
    pinv[ipiv] = k;
    Li.push(ipiv); Lx.push(1);
    for (let p = top; p < n; p++) {
      const i = xi[p];
      if (pinv[i] < 0) { Li.push(i); Lx.push(x[i] / pivot); }
      x[i] = 0;
    }
  }
  Lp[n] = Li.length; Up[n] = Ui.length;
  for (let p = 0; p < Li.length; p++) Li[p] = pinv[Li[p]];
  return new SparseLUFactor(n, Lp, Li, Lx, Up, Ui, Ux, pinv, q, eq.rowScale, eq.colScale);
}

/**
 * Factorize `a`. `mode` forces a path (tests); by default the sparse LU is used for n >= SPARSE_LU_THRESHOLD when the matrix is
 * sparse (fill below 30 %), the dense LU otherwise. null = singular to working precision (see the module comment).
 */
export function factorCsc(a: CscMatrix, mode: 'auto' | 'dense' | 'sparse' = 'auto'): LUFactor | null {
  const useSparse = mode === 'sparse' || (mode === 'auto' && a.n >= SPARSE_LU_THRESHOLD && a.Ai.length <= 0.3 * a.n * a.n);
  return useSparse ? factorSparse(a) : factorDense(a);
}
