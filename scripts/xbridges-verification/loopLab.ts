/**
 * loopLab -- a stand-alone laboratory for the algebraic-loop globalisation (XBV-436, plan section B, WP-B2).
 *
 * WHY. `solveAlgebraicLoopCore` (src/engine/xbridges/XbridgesEngine.ts, ~lines 774-1200) fails on four of the twelve
 * far-root cases of D21: from a zero start the loop `y = c + y ∓ k y^2` is only reachable through a globalisation that
 * does not rely on `|g|` decreasing, because at the start the finite-difference Jacobian of the loop is pure rounding and
 * the Newton step is many orders of magnitude too long. Nine local fixes were measured and reverted (D21). WP-B2 asks for
 * two *published* globalisations, prototyped outside the engine, on the same case matrix, before anything is changed in
 * production code.
 *
 * WHAT THIS IS. A black box `F(z)` -- the loop's outputs recomputed from the loop's outputs -- and nothing else. The lab
 * never reads engine state: it re-evaluates the blocks from the model definition, exactly as the engine's `evaluateF`
 * does, and builds the Jacobian with the engine's own finite-difference convention (central, Richardson-combined,
 * `h = 1e-4 max(1, |z_j|)`, de-noised at 32 eps |F_i| / h). If a candidate works here it works on the same numbers the
 * engine sees; if it only works because the lab used the analytic Jacobian, it would say nothing about the engine.
 *
 * THE LOOP. The engine's cycle for the D21 model is three unknowns, not one:
 *   s  = c + s - k p   (the Sum; its own output is an input to itself)
 *   p  = s * s         (the PRODUCT)
 *   q  = k p           (the GAIN, wired back into the Sum)
 * so F(z) = [c + s - k p, s s, k p] and g(z) = z - F(z) has the unique real root (s, s^2, k s^2) with s = sqrt(c/k) --
 * the closed form the acceptance uses. Keeping all three unknowns matters: with one unknown the system is regular and a
 * good globalisation succeeds far too easily, which is what made the nine local fixes look promising in isolation.
 *
 * THE CANDIDATES (all implemented as published, no per-case constants):
 *   1. NLEQ-ERR (Deuflhard): error-oriented affine-invariant Newton with the natural monotonicity test, the mu prediction /
 *      correction for lambda, and the simplified-correction convergence test.
 *   2. Dogleg trust region on 1/2 ||R g||^2 with D_j = max(D_j, |z_j|, 1) for the region and R_i the function scaling.
 *   3. newton-fd: plain undamped Newton with the lab's own finite-difference Jacobian -- the CONTROL. It must reach the root
 *      from 0.9 x root on every case; if it does not, the lab (not the algorithm under test) is defective.
 *
 * THE LOOP IS REGULAR. An earlier version of this header (decision D24) said that "no candidate can work because the
 * Jacobian is structurally rank-deficient, rows 1 and 3 are the same equation". That was WRONG. With g = z - F(z) and the
 * engine's chained evaluation (the Product reads the Sum's new output), s_out = c + s - u, p_out = s_out^2, u_out = gain p_out:
 *     g1 = u - c,   g2 = p - s_out^2,   g3 = u - gain s_out^2,    det J = 2 k s_out  (k = |gain|)
 * which is non-zero for every s_out != 0 (rows 1 and 3 are different equations; the Jacobian is only singular where
 * s_out = 0). Row- and column-scaled to the root (s ~ R, p ~ R^2, u ~ c, k R^2 = c) the determinant at the root is 2: well
 * conditioned. The loop is badly SCALED (entries of J from 1e-21 to 1e10) and badly NONLINEAR far from the root (the Newton
 * step from s = 50 is root^2 / 100), not rank-deficient. The controller measured plain Newton with the exact Jacobian converging from 0.9 x root in 4
 * iterations on all twelve cases; the control candidate newton-fd (below) reproduces that with the lab's finite-difference Jacobian.
 *
 * DEFECTS FOUND IN THE LAB (2026-11-24; the first matrix measured them, not the algorithms):
 *   LAB-1  `solve` tested every pivot against 64 eps max(1, |A|max) of the UNSCALED matrix. At 0.9 x root (s, p, u) =
 *          (9e6, 8.1e13, 0.81): the second pivot of the regular system is 1e-14, below 64 eps x 1.8e7 = 0.25, so J was
 *          reported singular and plain Newton failed 10/12 (and so did both globalisations: every step solves with it).
 *          Fix: column scaling by the engine's 1 + |z_j| and row equilibration by each row's largest scaled entry (rows must
 *          be scaled by their OWN size: the first equation u = c is not on the scale of s, a similarity 1/w_i does not
 *          cure it); the pivot floor is then 0 -- only an exactly zero or non-finite pivot is singular, because entries at
 *          the rounding noise of the difference quotient were already zeroed by the engine's own de-noising.
 *   LAB-2  The resolution floor of the black box (not a defect of any solver, but of the case definition): s_out = c + s - u
 *          adds u to s ~ root, so below ulp(s)/2 the Sum cannot see u - c. For c = 1e-3, k = 1e-20 (root 3.16e8) every s in
 *          about [root - 6.7e3, root + 2.7e3] is an EXACT floating-point fixed point of F, while the acceptance tolerance is
 *          1e-6 (1 + root) = 316. A solver that sees only F cannot tell these apart: reaching +-316 is luck. The lab reports
 *          such a cell as 'f' (converged inside the floor) and the strict count separately.
 *
 * DEFECTS FOUND IN THE CANDIDATES AS FIRST WRITTEN:
 *   Dogleg  DL-1  the merit was 1/2 ||D^-1 g||^2 with the SAME D (the unknowns' scale) on rows and columns. Row 1 (g1 = u - c,
 *                 O(1) error) was divided by D_1 = |s| ~ 9e6 and so invisible, and a full Newton step -- which sets u = c
 *                 exactly but is large in s -- increased that merit by 1e11. Dennis-Schnabel scale the FUNCTION separately
 *                 (D_F); here R_i = 1 / max_j |J_ij| D_j. Near the root dogleg now takes the Newton step.
 *   NLEQ-ERR  NL-1  the mu in the prediction used the absolute max-norm for |dz_bar - (1 - lambda) dz| and the scaled norm for
 *                   |dz|, and the sign was wrong: dz_bar = -J^-1 g(trial) so the quantity is |J^-1 g + (1 - lambda) dz|.
 *             NL-2  mu was computed only for ACCEPTED steps and rejection just halved, so reaching lambda ~ 1e-19 (a step of
 *                   1e18 from s = 50) needed 60 halvings; a hard cap of 60 tries then fell into an unpublished fallback at a
 *                   fixed lambda_min = 1e-10. Now the rejection is lambda = min(mu, lambda / 2) with mu from the rejected
 *                   trial, and the failure test is "lambda |dz| below double precision" (no constant).
 *             NL-3  convergence was "lambda |dz| / (1 - lambda) <= algTol", which at lambda = 1 divides by 1e-12 and can never
 *                   hold; the published test is the simplified correction |dz_bar| <= algTol after a full step, confirmed by
 *                   the solution test (acceptedSolution).
 *             NL-4  the lambda for the next step was min(1, 4 lambda), ignoring the published prediction
 *                   mu' = lambda_prev |dz_prev| |dz_bar| / (|dz_bar - dz| |dz|). Now mu' is used, limited to growth x4.
 *             NL-5  at lambda below about 1e-14 the monotonicity test compares two norms that differ by lambda/4 of their size
 *                   and is decided by rounding; with an ill-conditioned J the rounding is amplified by |J^-1|. Both the test
 *                   and mu are now evaluated with that noise (|J^-1| eps (|trial| + |F|), componentwise) as an allowance:
 *                   the test holds for every small enough lambda in exact arithmetic, so below the noise it is accepted and
 *                   a mu inside the noise is not used. The predicted lambda is also kept above a tenth of the last accepted.
 *
 * ZERO START. From (0,0,0) the engine's Gauss-Seidel pre-passes give s ~ 50 c (c per sweep, 50 sweeps) and u ~ 0, NOT s = 0,
 * and in the engine's chained F the s column of J is not zero at s = 0 either (dp_out/ds = 2 s_out = 2c). What is true is that
 * J is nearly singular there (det = 2 k s_out ~ 1e-21 against entries of O(0.1)), so the Newton step is root^2 / (2 s) and the
 * monotonicity test admits lambda ~ s / |dz| only: s can roughly double per iteration, 26 to 40 iterations measured from s = 50 to the far roots.
 * Only in the direct (Jacobi) form F = [c + s - u, s^2, k p] -- the controller's textbook equations -- is the s column
 * identically zero at s = 0; the lab implements that form too (spec.form = 'direct') and the zero-column start strategy
 * (see nleqErr's `repair`) is measured on it: without the strategy NLEQ-ERR stops at iteration 0 ('no damping factor above the
 * rounding floor', every derivative-based step has ds = 0), with it all twelve converge.
 *
 * WHAT THE ENGINE DOES TODAY (XbridgesEngine.solveAlgebraicLoopCore, `newton`, lines ~996-1130): Newton with a central/
 * Richardson FD Jacobian and `directionOf` (exact solve, damped normal equations when singular); a step larger than
 * HUGE_STEP = 1e8 (relative) is backtracked until |g| falls; a singular or zero Jacobian, or a step with no decrease, moves
 * EVERY unknown by pert (1 + |z|) with pert = 1e-2 growing x10 per consecutive perturbation up to 1e12, and gives up (stalled)
 * once pert >= 1. That sequence of ever larger kicks to all unknowns, plus the 1e8 backtracking threshold, is what rescues roots
 * up to 1e8 and nothing beyond: the iterate is thrown to the region where the plain Newton iteration converges, which is
 * bounded by the kick sequence and the 60 backtracking halvings, and |g| is a poor merit at a far root.
 *
 * RUN:  npx tsx scripts/xbridges-verification/loopLab.ts            (matrix + counts, exit 0 if a candidate is green from zero)
 *       npx tsx scripts/xbridges-verification/loopLab.ts --verbose  (per-iteration trace of NLEQ-ERR, zero start)
 *
 * WHAT IT REPORTS. For every start and candidate the evaluation count of each of the twelve cases (F evaluations, the pre-
 * passes included) against the 2020-evaluation budget of xbEngineB.test.ts, whether the root is within the acceptance's
 * 1e-6 (1 + root) ('' strict) or only inside the black box's resolution floor ('f'), and the no-root shape, which must end
 * without a false root. The budget is reported, not tuned; no candidate uses a per-case constant.
 */

import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------------------------------------------------
// The loop as a black box: F(z) for the three engine unknowns (s, p, q).
// ---------------------------------------------------------------------------------------------------------------------
export interface LoopSpec {
  c: number;
  k: number;
  /** 'minus': Sum '++-' with Gain +k; 'plus': Sum '+++' with Gain -k. The same equation, wired differently. */
  wiring: 'minus' | 'plus';
  /**
   * 'chained' (default): the engine's evaluateF -- blocks run in sequence inside ONE evaluation, so the Product reads the Sum's
   * NEW output. 'direct': every block reads the iterate (Jacobi form, F = [c + s - u, s^2, k p]): the controller's textbook
   * form, used only to test the zero-column start strategy, because at s = 0 its s column is identically zero.
   */
  form?: 'chained' | 'direct';
}

/** One evaluation of the loop: the outputs recomputed from the outputs. Mirrors XbridgesEngine.evaluateF for this model. */
export const makeLoop = (spec: LoopSpec): ((z: number[]) => number[]) => {
  const { c, wiring } = spec;
  // The Gain block's own value: 'minus' Sum '++-' with Gain +k, 'plus' Sum '+++' with Gain -k.
  const gain = wiring === 'minus' ? spec.k : -spec.k;
  // The Sum has exactly three inputs: in1 = c (Constant), in2 = its own output, in3 = the gain output. The wiring changes
  // the sign of in3 in the Sum, not the gain's value, which is why the two wirings are the same equation.
  const sumSign = wiring === 'minus' ? -1 : +1;
  if (spec.form === 'direct') return (z: number[]) => [c + z[0] + sumSign * z[2], z[0] * z[0], gain * z[1]];
  return (z: number[]) => {
    const sOut = c + z[0] + sumSign * z[2];
    const pOut = sOut * sOut;
    const qOut = gain * pOut;
    return [sOut, pOut, qOut];
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Numerics shared by both candidates: the engine's scaling, norm and finite-difference Jacobian.
// ---------------------------------------------------------------------------------------------------------------------
const EPS = 2.220446049250313e-16;
/** relative pivot floor of the equilibrated matrix; 0 = only an exactly zero pivot is singular (see solve) */
let PIVOT_TOL = 0;
const absNorm = (v: number[]) => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const finite = (v: number[]) => v.every(Number.isFinite);
/** the engine's relNorm: max |v_i| / (1 + |z_i|) -- the error left after a step, in the acceptance's own units. */
const relNorm = (v: number[], z: number[]) => {
  let m = 0;
  for (let i = 0; i < v.length; i++) m = Math.max(m, Math.abs(v[i]) / (1 + Math.abs(z[i])));
  return m;
};
const residualOf = (z: number[], f: number[]) => z.map((zi, i) => zi - f[i]);

/**
 * dF/dz by central differences with the Richardson combination, the engine's convention (2h and h combined, O(h^4)), and
 * the same de-noising for entries at the rounding noise of the difference quotient. `n` is small (3) here.
 */
export const jacobian = (F: (z: number[]) => number[], z: number[], fz: number[], denoise: boolean): number[][] | null => {
  const n = z.length;
  const J: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const h = 1e-4 * Math.max(1, Math.abs(z[j]));
    const at = (d: number) => F(z.map((v, i) => (i === j ? v + d : v)));
    const p1 = at(h);
    const m1 = at(-h);
    const p2 = at(2 * h);
    const m2 = at(-2 * h);
    if (!finite(p1) || !finite(m1) || !finite(p2) || !finite(m2)) return null;
    const d1 = p1.map((v, i) => (v - m1[i]) / (2 * h));
    const col = d1.map((v, i) => (4 * v - (p2[i] - m2[i]) / (4 * h)) / 3);
    for (let i = 0; i < n; i++) {
      J[i][j] = (i === j ? 1 : 0) - col[i];
      if (denoise && Math.abs(J[i][j]) <= (32 * EPS * Math.abs(fz[i])) / h) J[i][j] = 0;
    }
  }
  return finite(J.flat()) ? J : null;
};

/**
 * Solve A x = b by Gaussian elimination with partial pivoting after row and column equilibration; null when a row is
 * identically zero, or a pivot is exactly zero, not finite, or at the rounding noise of the equilibrated matrix.
 *
 * `w` (optional) is the unknowns' scale, the engine's 1 + |z|: columns are scaled by it (x = W y) and then every row by
 * its own largest entry, so every equilibrated row has max-norm 1 and the pivot test `64 eps` means "singular to double
 * precision" and nothing else. This is the lab defect of 2026-11-24 (see the header, DEFECT 1): the first version tested
 * the pivot against `64 eps max(1, |A|_max)` of the UNSCALED matrix. With (s, p, u) = (9e6, 8.1e13, 0.81) the Jacobian has
 * entries from 1e-7 to 2e7, the second pivot of a perfectly regular system (det = 2 k s) is 1e-14 in absolute terms, and it
 * was declared singular; scaling the rows by 1/w_i (a similarity transform) does not cure it, because the first equation
 * (u = c) is NOT on the scale of s -- rows must be scaled by their own size.
 */
const solve = (A: number[][], b: number[], w?: number[]): number[] | null => {
  const n = b.length;
  const wt = w ?? new Array(n).fill(1);
  const M = A.map((row, i) => {
    const scaled = row.map((v, j) => v * wt[j]);
    const m = absNorm(scaled);
    if (!(m > 0) || !Number.isFinite(m)) return null;
    return [...scaled.map((v) => v / m), b[i] / m];
  });
  if (M.some((r) => r === null)) return null;
  const R = M as number[][];
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(R[r][c]) > Math.abs(R[piv][c])) piv = r;
    // A pivot below the rounding noise of the equilibrated matrix is singular for the purpose of a Newton direction. This
    // is the only threshold in the lab and it is a property of double precision, not of a case.
    if (!Number.isFinite(R[piv][c]) || Math.abs(R[piv][c]) <= PIVOT_TOL) return null;
    [R[c], R[piv]] = [R[piv], R[c]];
    for (let r = c + 1; r < n; r++) {
      const f = R[r][c] / R[c][c];
      if (f !== 0) for (let k = c; k <= n; k++) R[r][k] -= f * R[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let acc = R[r][n];
    for (let k = r + 1; k < n; k++) acc -= R[r][k] * x[k];
    x[r] = acc / R[r][r];
  }
  const out = x.map((v, j) => v * wt[j]);
  return finite(out) ? out : null;
};

/** the engine's scale of the unknowns, 1 + |z_i| */
const scaleOf = (z: number[]) => z.map((v) => 1 + Math.abs(v));

/**
 * Rounding noise of a simplified Newton correction J^-1 r, where r carries an absolute error `rn` (componentwise): the
 * componentwise bound |J^-1| rn, from the columns of J^-1. For an ill-conditioned J this is many orders of magnitude above
 * eps |correction|, which is exactly why a fixed `64 eps` allowance in the monotonicity test is wrong (see NLEQ-ERR notes).
 */
const correctionNoise = (J: number[][], w: number[], rn: number[]): number[] | null => {
  const n = rn.length;
  const out = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const col = solve(J, e, w);
    if (!col) return null;
    for (let i = 0; i < n; i++) out[i] += Math.abs(col[i]) * rn[j];
  }
  return out;
};

/** Least-squares direction via the damped normal equations -- the engine's fallback for a singular Jacobian. */
const dampedDirection = (J: number[][], g: number[]): number[] | null => {
  const n = J.length;
  const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, c) => J.reduce((acc, row) => acc + row[a] * row[c], 0)));
  const maxDiag = Math.max(...JtJ.map((row, i) => row[i]));
  if (!(maxDiag > 0) || !Number.isFinite(maxDiag)) return null;
  for (let i = 0; i < n; i++) JtJ[i][i] += 1e-8 * maxDiag;
  const rhs = Array.from({ length: n }, (_, a) => -J.reduce((acc, row, i) => acc + row[a] * g[i], 0));
  return solve(JtJ, rhs);
};

const mul = (J: number[][], v: number[]) => J.map((row) => row.reduce((acc, a, j) => acc + a * v[j], 0));

// ---------------------------------------------------------------------------------------------------------------------
// The engine's Gauss-Seidel pre-passes -- part of every case, because WP-B3 keeps them
// ---------------------------------------------------------------------------------------------------------------------
/**
 * The engine runs up to `algMaxPasses` (50) Gauss-Seidel sweeps over the cycle before it hands the iterate to Newton, and
 * WP-B3 keeps them. A prototype that starts the candidate at zero would therefore be solving a *harder* problem than the
 * engine faces, and its verdict would not transfer. One sweep is one evaluation of F, and the sweep's own settling test is
 * the engine's: the change is within algTol (1 + |z|) and not growing.
 */
export const gaussSeidel = (
  F: (z: number[]) => number[], z0: number[], algTol: number, maxPasses = 50,
): { z: number[]; evaluations: number; settled: boolean } => {
  let z = z0.slice();
  let evaluations = 0;
  let prevChange = Infinity;
  for (let pass = 0; pass < maxPasses; pass++) {
    const cur = F(z);
    evaluations++;
    if (!finite(cur)) return { z: z0.slice(), evaluations, settled: false };
    const change = relNorm(cur.map((v, i) => v - z[i]), z);
    // the engine's test: settled when the change is within algTol and not growing (a contraction), or exactly zero
    const settled = change === 0 || (pass >= 1 && change <= prevChange && change <= algTol);
    z = cur;
    prevChange = change;
    if (settled) return { z, evaluations, settled: true };
  }
  return { z, evaluations, settled: false };
};

/**
 * The acceptance test both candidates use -- and the reason the lab's first version was wrong.
 *
 * The engine judges a loop on the SOLUTION, not on the residual (XBV-421). That is not pedantry here: in the three-unknown
 * wiring a residual of 0.19 on the Sum row is "2e-8" once it is scaled by 1 + |s| = 9e6, so an iterate whose s is 10 %
 * off the root passes a residual test at algTol = 1e-6. A candidate is accepted only when BOTH
 *   - the residual, scaled componentwise by 1 + |z_i|, is within algTol, and
 *   - the Newton correction at that point (equivalently: the step that produced it) is within algTol, i.e. the iterate is a
 *     fixed point of the Newton map, which is the error estimate the engine's step-size test uses.
 */
const acceptedSolution = (F: (z: number[]) => number[], z: number[], dz: number[] | null, algTol: number): boolean => {
  const f = F(z);
  if (!finite(f)) return false;
  if (relNorm(residualOf(z, f), z) > algTol) return false;
  if (dz && relNorm(dz, z) > algTol) return false;
  return true;
};

// ---------------------------------------------------------------------------------------------------------------------
// Candidate 1: NLEQ-ERR (Deuflhard) -- natural monotonicity test in scaled variables.
// ---------------------------------------------------------------------------------------------------------------------
export interface LabResult {
  converged: boolean;
  z: number[];
  /** F evaluations -- the currency the engine's acceptance budget is written in. */
  evaluations: number;
  iterations: number;
  /** why it stopped, for the report */
  reason: string;
}

/**
 * NLEQ-ERR as published (Deuflhard, Numer. Math. 22 (1974) 289-315; the error-oriented variant described in Nowak and
 * Weimann, "A modified NLEQ-ERR algorithm", and in Deuflhard's book, Algorithm 4.1):
 *
 *   lambda = 1; loop:
 *     J = dg/dz;  solve J dz = -g                                        (Newton direction)
 *     if J is rank-deficient: take the regularised (|g|-direction augmented) step and continue -- NLEQ-ERR's RDA
 *     predict mu from the last accepted lambda; shrink lambda until the *restricted monotonicity test* holds:
 *        |J(z)^-1 g(z + lambda dz)|  <=  (1 - lambda / 4) |dz|           (natural monotonicity, in the scaled norm)
 *     accept: z += lambda dz;  lambda = min(1, 4 lambda) (correction step from the published formula if it is smaller)
 *     convergence: the predicted error  lambda |dz| / (1 - lambda) <= algTol (1 + |z|)
 *
 * The test is affine invariant: it compares two Newton corrections and never the residual, so it does not care that at a
 * far root |g| first grows. That is the property D21 needs.
 */
export const nleqErr = (
  F: (z: number[]) => number[], z0: number[], algTol: number, maxIter: number, verbose = false, repair = false,
): LabResult => {
  let evaluations = 0;
  const evalF = (z: number[]) => { evaluations++; return F(z); };
  let z = z0.slice();
  let lambda = 1;
  // what the predictor of the next damping factor needs from the last accepted step (Deuflhard's mu')
  let prev: { lambda: number; dz: number[]; dbar: number[] } | null = null;
  let iterations = 0;

  for (; iterations < maxIter; iterations++) {
    const f = evalF(z);
    if (!finite(f)) return { converged: false, z, evaluations, iterations, reason: 'non-finite F' };
    const g = residualOf(z, f);
    if (absNorm(g) === 0) return { converged: true, z, evaluations, iterations, reason: 'exact root' };

    const w = scaleOf(z);
    const J = jacobian(evalF, z, f, true);
    if (repair && J) {
      // START STRATEGY (task 4): a Jacobian column that is identically zero at the iterate means no derivative-based step
      // can move that unknown. Perturb it by sqrt(eps) times the scale of the OTHER unknowns (at least 1) -- the size at
      // which the quadratic response becomes visible to a difference quotient -- and continue. No case-specific constant.
      const dead = z.map((_, j) => J.every((row) => row[j] === 0));
      if (dead.some(Boolean)) {
        const scale = (j: number) => Math.max(1, ...z.map((v, i) => (i === j ? 0 : Math.abs(v))));
        z = z.map((v, j) => (dead[j] ? v + Math.sqrt(EPS) * scale(j) : v));
        if (verbose) console.log(`  it ${iterations} REPAIR zero column(s) ${dead.map((d, j) => (d ? j : -1)).filter((j) => j >= 0)} -> z=${z.map((v) => v.toExponential(3)).join(',')}`);
        prev = null;
        continue;
      }
    }
    let dz = J ? solve(J, g.map((v) => -v), w) : null;
    let regularised = false;
    if (!J || !dz) {
      // Rank-deficient Jacobian: NLEQ-ERR's fallback is a least-squares step with the residual direction added, which is
      // what the damped normal equations give here. It is a *regularised* direction, not a Newton one, so it is always
      // damped by lambda and never applied in full.
      dz = J ? dampedDirection(J, g) : null;
      if (!dz) return { converged: false, z, evaluations, iterations, reason: 'no direction (zero Jacobian)' };
      regularised = true;
    }
    const dzNorm = relNorm(dz, z);
    if (dzNorm === 0) return { converged: false, z, evaluations, iterations, reason: 'zero step' };
    // A Newton correction already within algTol at a point whose residual is within algTol is the solution.
    if (!regularised && dzNorm <= algTol && acceptedSolution(evalF, z, dz, algTol)) {
      return { converged: true, z, evaluations, iterations, reason: 'NLEQ-ERR convergence (correction within algTol)' };
    }

    // Prediction of lambda for this step (Deuflhard): mu' = lambda_prev |dz_prev| |dbar| / (|dbar - dz| |dz|), lambda = min(1, mu').
    if (prev && !regularised) {
      const den = relNorm(prev.dbar.map((v, i) => v - dz![i]), z);
      const noise = 64 * EPS * (relNorm(prev.dbar, z) + dzNorm);
      // mu' divides by the difference of two nearly equal vectors; below the rounding noise of that difference it is noise
      // (it pinned the first version at lambda ~ 1.7e-16 = eps, forever), so it is then replaced by the published growth
      // limit alone: lambda may grow by at most a factor 4 per step.
      const mu = den > noise ? (prev.lambda * relNorm(prev.dz, z) * relNorm(prev.dbar, z)) / (den * dzNorm) : Infinity;
      // the predicted factor is also not allowed to fall below a tenth of the last accepted one (the monotonicity test below
      // still decides; this only keeps a rounding-limited mu' from collapsing lambda by orders of magnitude at once)
      lambda = Math.min(1, 4 * prev.lambda, Math.max(mu, prev.lambda / 10));
    } else lambda = regularised ? Math.min(lambda, 0.5) : 1;

    // Natural monotonicity test; on rejection lambda = min(mu, lambda / 2) with mu from the rejected trial itself.
    let accepted = false;
    let zbar: number[] | null = null;
    for (let tries = 0; tries < 4000; tries++) {
      // a step that no longer moves the iterate (below double precision) cannot be damped further: the published
      // lambda_min test, written in the one unit that does not depend on the case
      if (lambda * dzNorm < EPS) break;
      const trial = z.map((v, i) => v + lambda * dz![i]);
      const ft = evalF(trial);
      if (!finite(ft)) { lambda /= 2; continue; }
      const zb = J ? solve(J, residualOf(trial, ft), w) : null;
      if (!zb) { lambda /= 2; continue; }
      const dbar = relNorm(zb, z);
      // componentwise rounding error of g(trial) = trial - F(trial): eps (|trial| + |F|); its image under J^-1 is the noise of zb
      const zbNoise = correctionNoise(J!, w, trial.map((v, i) => EPS * (Math.abs(v) + Math.abs(ft[i]))));
      const noise = zbNoise ? relNorm(zbNoise, z) : 0;
      // Delta-xbar = -zb, so the prediction/correction residual is |-zb - (1 - lambda) dz| = |zb + (1 - lambda) dz|
      const denom = relNorm(zb.map((v, i) => v + (1 - lambda) * dz![i]), z);
      const mu = denom > 8 * noise + 64 * EPS * (dbar + dzNorm) ? (lambda * lambda * dzNorm) / (2 * denom) : Infinity;
      if (verbose) console.log(`    lam=${lambda.toExponential(3)} |dz|=${dzNorm.toExponential(3)} |dzbar|=${dbar.toExponential(3)} test=${(1 - lambda / 4).toExponential(3)} mu=${mu.toExponential(3)}`);
      // The test compares two norms that differ by a fraction lambda/4 of their size: below lambda ~ 64 eps it cannot be
      // told from rounding, and it holds for every small enough lambda in exact arithmetic, so the rounding noise of the
      // comparison is allowed (without it the first version accepted and rejected steps at lambda ~ 1e-16 by coin flip).
      if (dbar <= (1 - lambda / 4) * dzNorm + 8 * noise + 64 * EPS * (dbar + dzNorm)) {
        accepted = true;
        zbar = zb;
        z = trial;
        prev = regularised ? null : { lambda, dz: dz, dbar: zb.map((v) => -v) };
        if (verbose) console.log(`  it ${iterations} ACCEPT lam=${lambda.toExponential(2)} z=${z.map((v) => v.toExponential(4)).join(',')}`);
        // Convergence (Deuflhard): after a full step the remaining error is estimated by the simplified correction |dbar|.
        // The estimate is a model, so it is confirmed by the solution test (acceptedSolution) with the corrected point.
        if (lambda === 1 && dbar <= algTol) {
          const zc = z.map((v, i) => v - zb[i]);
          const gc = residualOf(zc, evalF(zc));
          const corr = solve(J!, gc, w);
          if (acceptedSolution(evalF, zc, corr ? corr.map((v) => -v) : null, algTol)) {
            return { converged: true, z: zc, evaluations, iterations: iterations + 1, reason: 'NLEQ-ERR convergence (simplified correction + solution test)' };
          }
        }
        break;
      }
      // Deuflhard's reduction lambda = min(mu, lambda / 2), safeguarded as in Dennis-Schnabel's backtracking (never below
      // lambda / 10): mu is a curvature estimate from one trial and is as noisy as the two corrections it is built from.
      lambda = Math.min(lambda / 2, mu);
    }
    if (!accepted) {
      return { converged: false, z, evaluations, iterations, reason: 'monotonicity test failed: no damping factor above the rounding floor' };
    }
    void zbar;
  }
  return { converged: false, z, evaluations, iterations, reason: 'iteration limit' };
};

// ---------------------------------------------------------------------------------------------------------------------
// Candidate 2: dogleg trust region on ½||D^-1 g||².
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Powell's dogleg (as in Dennis and Schnabel, "Numerical Methods for Unconstrained Optimization and Nonlinear Equations",
 * section 6.4.3), with the column scaling the plan asks for:
 *   D_j = max(D_j, |z_j|, typical_j)  -- typical_j = 1 (the scale of the unknowns; the small roots are O(1))
 * and the radius from the ratio of actual to predicted reduction, rho: rho < 0.25 -> radius / 4, rho > 0.75 on a full
 * step -> radius * 2, always clamped to a documented range. A rank-deficient Jacobian gives the Cauchy step (the
 * steepest-descent step in the scaled norm), which is what keeps the first iteration finite when the FD Jacobian is pure
 * rounding.
 *
 * The step is the dogleg combination of the Cauchy point and the Newton point, so it is inside the trust region by
 * construction; the merit ½||D^-1 g||² is what the ratio tests, and the convergence test is on the solution (|z - F(z)|
 * within algTol (1 + |z|)), not on the merit, because a tiny merit at a multiple root leaves a large solution error.
 */
export const dogleg = (
  F: (z: number[]) => number[], z0: number[], algTol: number, maxIter: number, verbose = false,
): LabResult => {
  let evaluations = 0;
  const evalF = (z: number[]) => { evaluations++; return F(z); };
  let z = z0.slice();
  const n = z.length;
  // Scaling D_j = max(D_j, |z_j|, typical_j), typical_j = 1, and the scaled variable u = z / D (elementwise). The trust
  // region, the merit and the Cauchy point all live in u; only the step is mapped back with dz = D * du. Getting this
  // transform wrong in one place only (as the first two versions did) makes the predicted and actual reductions disagree
  // by orders of magnitude, and the ratio test then rejects every step or accepts a step that climbs the merit.
  const D = z.map(() => 1);
  let delta = 1;
  const norm2 = (v: number[]) => Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));

  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    for (let i = 0; i < n; i++) D[i] = Math.max(D[i], Math.abs(z[i]), 1);
    const f = evalF(z);
    if (!finite(f)) return { converged: false, z, evaluations, iterations, reason: 'non-finite F' };
    const g = residualOf(z, f);

    const J = jacobian(evalF, z, f, true);
    if (!J) return { converged: false, z, evaluations, iterations, reason: 'no Jacobian' };
    // u-space quantities: ghat = g / D, Jhat = D^-1 J D, step in u, and the merit 1/2 ||ghat||^2
    // Function scaling R_i = 1 / max_j |J_ij| D_j: the merit must weigh each equation by the size of its own response to a
    // step of the trust region (Dennis-Schnabel's D_F), NOT by the size of the unknown it happens to be paired with.
    const R = J.map((row) => { const m = Math.max(...row.map((v, j) => Math.abs(v) * D[j])); return m > 0 ? 1 / m : 1; });
    const ghat = g.map((v, i) => v * R[i]);
    const Jhat = J.map((row, i) => row.map((v, j) => v * D[j] * R[i]));
    const merit = (gh: number[]) => 0.5 * gh.reduce((acc, v) => acc + v * v, 0);
    const duN = solve(Jhat, ghat.map((v) => -v)); // Newton point in u
    // Acceptance: judged on the solution (see acceptedSolution). duN is the Newton correction at this iterate.
    if (acceptedSolution(evalF, z, duN ? duN.map((v, i) => v * D[i]) : null, algTol)) {
      return { converged: true, z, evaluations, iterations, reason: 'dogleg convergence (solution test)' };
    }

    // Cauchy point: r = -Jhat^T ghat, minimise along it.
    const r = Array.from({ length: n }, (_, j) => -Jhat.reduce((acc, row, i) => acc + row[j] * ghat[i], 0));
    const Jr = mul(Jhat, r);
    const curv = Jr.reduce((acc, v) => acc + v * v, 0);
    let du: number[] | null = null;
    if (curv > 0) {
      const alpha = -(ghat.reduce((acc, v, i) => acc + v * Jr[i], 0)) / curv;
      const pC = r.map((v) => v * alpha);
      const nC = norm2(pC);
      if (nC >= delta || !duN) {
        du = nC > 0 ? pC.map((v) => (v * delta) / nC) : null;
      } else if (norm2(duN) <= delta) {
        du = duN;
      } else {
        const q = duN.map((v, i) => v - pC[i]);
        const a = q.reduce((acc, v) => acc + v * v, 0);
        const b = 2 * pC.reduce((acc, v, i) => acc + v * q[i], 0);
        const cc = pC.reduce((acc, v) => acc + v * v, 0) - delta * delta;
        const disc = Math.max(0, b * b - 4 * a * cc);
        const tau = a > 0 ? (-b + Math.sqrt(disc)) / (2 * a) : 0;
        du = pC.map((v, i) => v + tau * q[i]);
      }
    }
    if (!du) return { converged: false, z, evaluations, iterations, reason: 'no descent direction' };
    const duNorm = norm2(du);
    if (!(duNorm > 0)) return { converged: false, z, evaluations, iterations, reason: 'zero step' };

    const dz = du.map((v, i) => v * D[i]);
    const trial = z.map((v, i) => v + dz[i]);
    const ft = evalF(trial);
    if (!finite(ft)) { delta /= 4; if (delta < 1e-300) return { converged: false, z, evaluations, iterations, reason: 'radius underflow' }; continue; }
    const gNew = residualOf(trial, ft);
    const ghatNew = gNew.map((v, i) => v * R[i]);
    // model: ghat(z + dz) ~ ghat + Jhat du
    const Jdu = mul(Jhat, du);
    const predicted = -(ghat.reduce((acc, v, i) => acc + v * Jdu[i], 0) + 0.5 * Jdu.reduce((acc, v) => acc + v * v, 0));
    const actual = merit(ghat) - merit(ghatNew);
    const rho = predicted > 0 ? actual / predicted : -1;
    // If the region has shrunk to where the MODEL predicts no reduction, the linearisation is at the rounding floor and no
    // step of this direction helps: report it rather than spin to maxIter (the engine calls this a stationary point).
    if (predicted <= 0 && duNorm <= delta * 1.000001 && delta < 1e-6) {
      return { converged: false, z, evaluations, iterations, reason: `no descent model at |du| = ${duNorm.toExponential(2)} (linearisation at the rounding floor)` };
    }
    if (verbose) console.log(`    delta=${delta.toExponential(3)} |du|=${duNorm.toExponential(3)} pred=${predicted.toExponential(3)} act=${actual.toExponential(3)} rho=${rho.toFixed(3)} |g|=${relNorm(g, z).toExponential(2)}`);
    if (rho > 0) {
      z = trial;
      if (rho > 0.75 && duNorm > 0.99 * delta) delta *= 2;
    } else {
      delta /= 4;
      if (delta < 1e-300) return { converged: false, z, evaluations, iterations, reason: 'radius underflow' };
    }
  }
  return { converged: false, z, evaluations, iterations, reason: 'iteration limit' };
};


// ---------------------------------------------------------------------------------------------------------------------
// Control: plain undamped Newton with the lab's own finite-difference Jacobian.
// ---------------------------------------------------------------------------------------------------------------------
export const newtonFd = (
  F: (z: number[]) => number[], z0: number[], algTol: number, maxIter: number, verbose = false,
): LabResult => {
  let evaluations = 0;
  const evalF = (z: number[]) => { evaluations++; return F(z); };
  let z = z0.slice();
  for (let iterations = 0; iterations < maxIter; iterations++) {
    const f = evalF(z);
    if (!finite(f)) return { converged: false, z, evaluations, iterations, reason: 'non-finite F' };
    const g = residualOf(z, f);
    const J = jacobian(evalF, z, f, true);
    const dz = J ? solve(J, g.map((v) => -v), scaleOf(z)) : null;
    if (verbose) console.log('   it', iterations, 'z', z, 'g', g, 'J', JSON.stringify(J), 'dz', dz);
    if (!dz) return { converged: false, z, evaluations, iterations, reason: 'singular Jacobian' };
    if (acceptedSolution(evalF, z, dz, algTol)) return { converged: true, z, evaluations, iterations, reason: 'Newton convergence (solution test)' };
    z = z.map((v, i) => v + dz[i]);
  }
  return { converged: false, z, evaluations, iterations: maxIter, reason: 'iteration limit' };
};

// ---------------------------------------------------------------------------------------------------------------------
// The D21 case matrix (12 root cases, both wirings) plus the shapes that must stay honest.
// ---------------------------------------------------------------------------------------------------------------------
export interface Case { name: string; root: number; spec: LoopSpec; expectRoot: boolean }

export const d21Matrix = (): Case[] => {
  const rows: Array<[number, number, number]> = [ // root, c, k
    [1e3, 1, 1e-6],
    [1e7, 1, 1e-14],
    [1e8, 1, 1e-16],
    [Math.sqrt(1e-3 / 1e-20), 1e-3, 1e-20],
    [1e9, 1, 1e-18],
    [1e10, 1, 1e-20],
  ];
  const out: Case[] = [];
  for (const [root, c, k] of rows) for (const wiring of ['minus', 'plus'] as const) {
    out.push({ name: `y=${c} + y ${wiring === 'minus' ? '-' : '+'} ${k} y^2 (root ${root.toPrecision(6)}, '${wiring}')`, root, spec: { c, k, wiring }, expectRoot: true });
  }
  return out;
};

/** The root the acceptance uses, from the closed form of the scalar equation (s = sqrt(c/k) with k signed). */
export const closedFormRoot = (spec: LoopSpec) => Math.sqrt(spec.c / spec.k);

// ---------------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------------
const isGreen = (r: LabResult, root: number) =>
  r.converged && Number.isFinite(r.z[0]) && Math.abs(r.z[0] - root) <= 1e-6 * (1 + root);

/**
 * The resolution floor of the black box at the root: the largest |s - root| for which F is EXACTLY at its fixed point in
 * double precision (fl(c + s - u) === s with u = gain s^2), found by scanning outward in steps of 1e-8 root. Every point in
 * that band is a legitimate converged answer for ANY solver that sees only F: the Sum adds c (or u) to s ~ root, and below
 * ulp(s)/2 the sum cannot tell. For c = 1e-3, k = 1e-20 (root 3.16e8) the band is several thousand wide against the
 * acceptance's 316, so reaching +-316 is luck, not algorithm.
 */
const resolutionBand = (spec: LoopSpec, root: number): number => {
  const gain = spec.wiring === 'minus' ? spec.k : -spec.k;
  let widest = 0;
  const step = root * 1e-8;
  for (let i = 1; i <= 100000; i++) {
    for (const sign of [-1, 1]) {
      const s = root + sign * i * step;
      const u = gain * s * s;
      const z = [s, s * s, u];
      if (makeLoop({ ...spec, form: 'chained' })(z)[0] === s) widest = Math.max(widest, i * step);
    }
  }
  return widest;
};

type Solver = (F: (z: number[]) => number[], z0: number[], algTol: number, maxIter: number, verbose?: boolean, repair?: boolean) => LabResult;

const main = () => {
  const verbose = process.argv.includes('--verbose');
  // The acceptance's own budget: algTol 1e-6, maxIter 100 (the engine default). xbEngineB counts GAIN evaluations and the
  // engine calls the Gain once per F evaluation, so F evaluations are the same currency.
  const ALG_TOL = 1e-6;
  const MAX_ITER = 100;
  const BUDGET = 2020;
  const candidates: Array<[string, Solver]> = [['NLEQ-ERR', nleqErr], ['dogleg', dogleg], ['newton-fd', newtonFd]];
  const cases = d21Matrix();
  const lines: string[] = [];
  const push = (s: string) => { lines.push(s); console.log(s); };
  const bands = cases.map((c) => resolutionBand(c.spec, closedFormRoot(c.spec)));

  push(`loopLab -- XBV-436 globalisation prototypes, algTol ${ALG_TOL}, maxIter ${MAX_ITER}, evaluation budget ${BUDGET}`);
  push(`F is the engine's 3-unknown loop (s, p, u); the Jacobian is the engine's own central/Richardson finite difference.`);
  push(`cell = evaluations, suffix: '' strict green (|s - root| <= 1e-6 (1 + root)); 'f' converged inside the black box's resolution floor`);
  push(`(a legitimate fixed point of F that the strict test cannot tell from the root); '-' not converged or wrong. Cases in order:`);
  push(cases.map((c, i) => `${i + 1}:${c.root.toPrecision(3)}${c.spec.wiring === 'minus' ? '-' : '+'}${bands[i] > 1e-6 * (1 + c.root) ? '[floor ' + bands[i].toExponential(1) + ']' : ''}`).join('  '));
  push('');

  type Start = { name: string; form: 'chained' | 'direct'; z0: (c: Case, F: (z: number[]) => number[]) => { z: number[]; evals: number }; repair?: boolean; only?: string[] };
  const nearStart = (c: Case) => {
    const root = closedFormRoot(c.spec);
    const s0 = 0.9 * root;
    const gain = c.spec.wiring === 'minus' ? c.spec.k : -c.spec.k;
    return { z: [s0, s0 * s0, gain * s0 * s0], evals: 0 };
  };
  const zeroGS = (c: Case, F: (z: number[]) => number[]) => { const gs = gaussSeidel(F, [0, 0, 0], ALG_TOL); return { z: gs.z, evals: gs.evaluations }; };
  const zeroPure = () => ({ z: [0, 0, 0], evals: 0 });
  const starts: Start[] = [
    { name: 'near   (0.9 x root, chained)', form: 'chained', z0: nearStart },
    { name: 'zero   (G-S pre-passes, chained)', form: 'chained', z0: zeroGS },
    { name: 'zero   (no pre-pass, chained)', form: 'chained', z0: zeroPure },
    { name: 'zero   (G-S pre-passes, chained) + zero-column repair', form: 'chained', z0: zeroGS, repair: true, only: ['NLEQ-ERR'] },
    { name: 'zero   (no pre-pass, direct form: s column = 0)', form: 'direct', z0: zeroPure },
    { name: 'zero   (no pre-pass, direct form) + zero-column repair', form: 'direct', z0: zeroPure, repair: true, only: ['NLEQ-ERR'] },
    { name: 'zero   (G-S pre-passes, direct form) + zero-column repair', form: 'direct', z0: zeroGS, repair: true, only: ['NLEQ-ERR'] },
  ];

  const tally: Record<string, { strict: number; band: number; worst: number }> = {};
  for (const st of starts) {
    push(`== start: ${st.name}`);
    for (const [name, solveCandidate] of candidates) {
      if (st.only && !st.only.includes(name)) continue;
      const cells: string[] = [];
      let strict = 0; let band = 0; let worst = 0; const why: string[] = [];
      cases.forEach((c, i) => {
        const F = makeLoop({ ...c.spec, form: st.form });
        const root = closedFormRoot(c.spec);
        const start = st.z0(c, F);
        const r = solveCandidate(F, start.z, ALG_TOL, MAX_ITER, verbose && name === 'NLEQ-ERR' && st.name.startsWith('zero   (G-S pre-passes, chained)') && !st.repair, st.repair === true);
        const evals = r.evaluations + start.evals;
        worst = Math.max(worst, evals);
        const err = Math.abs(r.z[0] - root);
        const ok = isGreen(r, root);
        const inBand = r.converged && Number.isFinite(r.z[0]) && err <= Math.max(1e-6 * (1 + root), bands[i]);
        if (ok) strict++;
        if (inBand) band++;
        else why.push(`${i + 1}: ${r.reason}`);
        cells.push(`${evals}${ok ? '' : inBand ? 'f' : '-'}`.padStart(7));
      });
      push(`${name.padEnd(10)} ${cells.join('')}   strict ${strict}/12  with-floor ${band}/12  worst ${worst}${worst > BUDGET ? ' (OVER BUDGET)' : ''}`);
      if (why.length) push(`           not converged: ${why.slice(0, 3).join('; ')}${why.length > 3 ? '; ...' : ''}`);
      tally[`${st.name} | ${name}`] = { strict, band, worst };
    }
    push('');
  }

  // The shapes that must stay honest: a loop with no root.
  push('no-root shape (y = 1 + y + y^2, must not claim a root):');
  for (const [name, solveCandidate] of candidates) {
    const F = makeLoop({ c: 1, k: -1, wiring: 'minus' });
    const r = solveCandidate(F, [0, 0, 0], ALG_TOL, MAX_ITER);
    const rootClaimed = r.converged && relNorm(residualOf(r.z, F(r.z)), r.z) <= ALG_TOL;
    push(`${name.padEnd(10)} converged=${r.converged} false-root=${rootClaimed} (${r.reason}), evals=${r.evaluations}`);
  }

  push('');
  const zeroKey = 'zero   (G-S pre-passes, chained)';
  const winner = candidates.map(([n]) => n).find((n) => (tally[`${zeroKey} | ${n}`]?.band ?? 0) === 12 && tally[`${zeroKey} | ${n}`].worst <= BUDGET);
  push(winner
    ? `RESULT: ${winner} converges on all 12 from the engine's zero start within ${BUDGET} evaluations (strict ${tally[`${zeroKey} | ${winner}`].strict}/12; the rest sit inside the black box's resolution floor).`
    : 'RESULT: no candidate converges on all 12 from the engine\'s zero start within budget.');
  const outFile = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length);
  if (outFile) writeFileSync(outFile, lines.join('\n') + '\n');
  process.exitCode = winner ? 0 : 1;
};

if (process.argv[1]?.includes('loopLab')) main();
