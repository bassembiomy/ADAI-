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
 * THE TWO CANDIDATES (both implemented as published, no per-case constants):
 *   1. NLEQ-ERR (Deuflhard): error-oriented affine-invariant Newton, with the natural monotonicity test in scaled
 *      variables -- a step lambda*dz is accepted when the simplified Newton correction satisfies
 *      |dz_bar| <= (1 - lambda/4) |dz| (the restricted monotonicity test), lambda from the prediction/correction formula
 *      mu = lambda^2 |dz| / (2 |dz_bar - (1 - lambda) dz|), growth by a factor after acceptance, and a rank-deficiency
 *      fallback that adds the |g| direction when the Jacobian is singular (NLEQ-ERR's regularisation).
 *   2. Dogleg trust region on ½||D^-1 g||², D_j = max(D_j, |z_j|, typical_j), radius updated from the actual/predicted
 *      reduction ratio, Cauchy step when the Jacobian is rank-deficient.
 *
 * Everything is scaled by 1 + |z| (the engine's own `relNorm`), because the unknowns span 1e3 to 1e10 and an unscaled norm
 * would make the large-root cases trivially "converged".
 *
 * RUN:  npx tsx scripts/xbridges-verification/loopLab.ts            (matrix + counts, exit 0 if a candidate is green)
 *       npx tsx scripts/xbridges-verification/loopLab.ts --verbose  (per-iteration trace of one case)
 *
 * WHAT IT MEASURED (2026-11-24, this file, both wirings, 3 unknowns, the engine's FD Jacobian, its Gauss-Seidel pre-passes,
 * algTol 1e-6, maxIter 100, acceptance = the solution test described at acceptedSolution):
 *   - from the engine's zero start neither published method reaches the acceptance on ANY of the twelve far-root cases
 *     (NLEQ-ERR 2/12 and dogleg 0/12; the two NLEQ-ERR successes are the root-1e3 pair).
 *   - the reason is the same for both, and it is a property of this loop, not of the algorithms: the three equations
 *     `s_out = c + s - u`, `p_out = s s` and `u_out = k p` have a structurally rank-deficient Jacobian (the first and the
 *     third rows are the same equation), so the residual's leading term lies in the range of J and, as lambda -> 0, the
 *     natural monotonicity ratio |dz_bar| / |dz| -> 1 from ABOVE, never satisfying (1 - lambda/4). Measured: for root 1e7,
 *     |dz_bar|/|dz| = 4.62e9 at lambda = 0.5, 2.89e8 at 0.125, 3.998e10 at 1e-6 -- no lambda passes.
 *   - dogleg instead makes real progress only while its trust region is small (|du| ~ 0.25) and then stalls with the scaled
 *     residual at ~0.33: the same rank deficiency makes the Cauchy direction nearly orthogonal to the actual decrease.
 *   - started at 0.9 x the root both prototypes are still only 2/12 under the same acceptance (they are healthy on the
 *     small-root cases, and dogleg was measured at 21-27 iterations from half the root in a residual-only test, but that
 *     test accepts a 10 %-wrong s -- see acceptedSolution, which is why the lab does not use it).
 *   - the one-unknown collapse `y = c + y - k y^2` is NOT the engine's problem: with F(z) = 1 + z a single Gauss-Seidel
 *     sweep is exact. Every failure above lives in the three-unknown wiring.
 * CONCLUSION: no candidate is green on all twelve, which is WP-B2's own stopping condition: report, do not tune constants
 * case by case (nine such fixes are already recorded as reverted in D21). The honest reading is that a globalisation cannot
 * rescue a start where the loop's Jacobian is rank-deficient by construction; reaching y* = sqrt(c/k) from zero needs a
 * different idea (the residual's structure, i.e. eliminating p or u analytically), not a better Newton damping.
 *
 * WHAT IT REPORTS. For every case and both wirings: converged or not, the root against the closed form, and the number of
 * F evaluations. A candidate is "green" only when every one of the twelve root cases converges, both wirings, with the
 * solution within algTol (1 + |y*|), and the no-root case ends without a false root. The budget is the same for all cases
 * and is reported, not tuned: the acceptance budget in xbEngineB.test.ts is 2020 GAIN evaluations, and one lab iteration
 * costs about 6 F evaluations (one central Jacobian with Richardson = 4n + 1), so a candidate needs to converge well
 * inside ~300 iterations to fit. A candidate that needs case-specific constants is not implemented that way on purpose.
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
}

/** One evaluation of the loop: the outputs recomputed from the outputs. Mirrors XbridgesEngine.evaluateF for this model. */
export const makeLoop = (spec: LoopSpec): ((z: number[]) => number[]) => {
  const { c, wiring } = spec;
  // The Gain block's own value: 'minus' Sum '++-' with Gain +k, 'plus' Sum '+++' with Gain -k.
  const gain = wiring === 'minus' ? spec.k : -spec.k;
  // The Sum has exactly three inputs: in1 = c (Constant), in2 = its own output, in3 = the gain output. The wiring changes
  // the sign of in3 in the Sum, not the gain's value, which is why the two wirings are the same equation.
  const sumSign = wiring === 'minus' ? -1 : +1;
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

/** Gaussian elimination with partial pivoting; null when a pivot is exactly zero or not finite (the engine's solveExact). */
const solve = (A: number[][], b: number[]): number[] | null => {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  const scale = Math.max(1, ...A.map((row) => absNorm(row)));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    // A pivot below the rounding noise of the matrix is singular for the purpose of a Newton direction. This is the only
    // threshold in the lab and it is a property of double precision, not of a case.
    if (!Number.isFinite(M[piv][c]) || Math.abs(M[piv][c]) <= 64 * EPS * scale) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f !== 0) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let acc = M[r][n];
    for (let k = r + 1; k < n; k++) acc -= M[r][k] * x[k];
    x[r] = acc / M[r][r];
  }
  return finite(x) ? x : null;
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
  F: (z: number[]) => number[], z0: number[], algTol: number, maxIter: number, verbose = false,
): LabResult => {
  let evaluations = 0;
  const evalF = (z: number[]) => { evaluations++; return F(z); };
  let z = z0.slice();
  let lambda = 1;
  let lastMu = 1; // the predicted admissible damping, used for the next halving (reported, not a cap)
  let iterations = 0;

  for (; iterations < maxIter; iterations++) {
    const f = evalF(z);
    if (!finite(f)) return { converged: false, z, evaluations, iterations, reason: 'non-finite F' };
    const g = residualOf(z, f);
    if (absNorm(g) === 0) return { converged: true, z, evaluations, iterations, reason: 'exact root' };

    const J = jacobian(evalF, z, f, true);
    let dz = J ? solve(J, g.map((v) => -v)) : null;
    if (!J || !dz) {
      // Rank-deficient Jacobian: NLEQ-ERR's fallback is a least-squares step with the residual direction added, which is
      // what the damped normal equations give here. It is a *regularised* direction, not a Newton one, so it is always
      // damped by lambda and never applied in full.
      dz = J ? dampedDirection(J, g) : null;
      if (!dz) return { converged: false, z, evaluations, iterations, reason: 'no direction (zero Jacobian)' };
      lambda = Math.min(lambda, 0.5);
    }
    const dzNorm = relNorm(dz, z);
    if (dzNorm === 0) return { converged: false, z, evaluations, iterations, reason: 'zero step' };

    // Natural monotonicity test, with lambda predicted from the previous step and corrected by bisection.
    let accepted = false;
    for (let tries = 0; tries < 60 && lambda > 1e-300; tries++) {
      const trial = z.map((v, i) => v + lambda * dz![i]);
      const ft = evalF(trial);
      if (finite(ft)) {
        const zbar = J ? solve(J, residualOf(trial, ft)) : null;
        if (zbar) {
          const dbar = relNorm(zbar, z);
          if (verbose) console.log(`    lam=${lambda.toExponential(3)} |dz|=${dzNorm.toExponential(3)} |dzbar|=${dbar.toExponential(3)} test=${(1 - lambda / 4).toExponential(3)}`);
          if (dbar <= (1 - lambda / 4) * dzNorm) {
            // Prediction/correction of the next lambda (Deuflhard): mu measures how far the correction overshoots the
            // linear prediction; it is a property of the curvature at z, so it is used before the next halving.
            // Deuflhard's prediction/correction: mu is the value at which the correction would meet the test exactly, so
            // it is where the halving starts next time. It is NOT a cap on growth -- capping lambda by max(lambda, mu) is
            // what pinned the first version at 0.125 and turned the iteration linear. Growth is the published rule.
            const denom = absNorm(zbar.map((v, i) => v - (1 - lambda) * dz![i]));
            lastMu = denom > 0 ? (lambda * lambda * dzNorm) / (2 * denom) : 1;
            const next = Math.min(1, 4 * lambda);
            z = trial;
            // Error prediction: with Newton contracting at rate (1 - lambda), the error left is lambda |dz| / (1 - lambda).
            const predicted = (lambda * dzNorm) / Math.max(1 - lambda, 1e-12);
            if (predicted <= algTol) {
              // Both halves of the fit: the predicted error, and the solution test (residual and Newton correction), because
              // the prediction is a model and the scaled residual alone can pass a 10 %-wrong iterate (see acceptedSolution).
              const correction = J ? solve(J, residualOf(z, evalF(z))) : null;
              if (acceptedSolution(evalF, z, correction, algTol)) {
                return { converged: true, z, evaluations, iterations: iterations + 1, reason: 'NLEQ-ERR convergence (solution test)' };
              }
            }
            lambda = next;
            accepted = true;
            break;
          }
        }
      }
      lambda = Math.min(lambda / 2, lastMu > 0 ? Math.max(lastMu, 1e-300) : lambda / 2);
      lastMu = 1;
    }
    if (!accepted) {
      // Deuflhard's damping strategy does not stop at the first hopeless prediction: at lambda_min it takes the damped step
      // anyway, on the relaxed test that the residual must not grow. Without this the prototype gives up at iteration 0 on
      // a start where the Newton direction is enormous, which is not what the published algorithm does.
      const LAMBDA_MIN = 1e-10;
      const trial = z.map((v, i) => v + LAMBDA_MIN * dz![i]);
      const ft = evalF(trial);
      if (finite(ft)) {
        const gNew = residualOf(trial, ft);
        if (relNorm(gNew, z) < relNorm(g, z)) {
          z = trial;
          lambda = Math.min(1, 4 * LAMBDA_MIN);
          continue;
        }
      }
      return { converged: false, z, evaluations, iterations, reason: 'monotonicity test failed at lambda_min and the residual did not fall' };
    }
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
    const ghat = g.map((v, i) => v / D[i]);
    const Jhat = J.map((row, i) => row.map((v, j) => (v * D[j]) / D[i]));
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
    const ghatNew = gNew.map((v, i) => v / D[i]);
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

const main = () => {
  const verbose = process.argv.includes('--verbose');
  // The acceptance's own budget: algTol 1e-6, maxIter 100 (the engine default). One lab iteration costs about 6 F
  // evaluations, so this is the same currency as xbEngineB's 2020-evaluation budget, with room to spare.
  const ALG_TOL = 1e-6;
  const MAX_ITER = 100;
  const candidates: Array<[string, typeof nleqErr]> = [['NLEQ-ERR', nleqErr], ['dogleg', dogleg]];

  const cases = d21Matrix();
  const lines: string[] = [];
  const push = (s: string) => { lines.push(s); console.log(s); };

  push(`loopLab -- XBV-436 globalisation prototypes, algTol ${ALG_TOL}, maxIter ${MAX_ITER}`);
  push(`F is the engine's 3-unknown loop (s, p, q); the Jacobian is the engine's own central/Richardson finite difference.`);
  push('');
  push(`${'candidate'.padEnd(10)} ${'case'.padEnd(58)} ${'root'.padStart(10)} ${'z[0]'.padStart(16)} ${'evals'.padStart(6)} ${'it'.padStart(3)}  ok`);
  const summary: Record<string, { green: number; total: number; evals: number; failures: string[] }> = {};

  for (const [name, solveCandidate] of candidates) {
    summary[name] = { green: 0, total: 0, evals: 0, failures: [] };
    for (const c of cases) {
      const F = makeLoop(c.spec);
      const root = closedFormRoot(c.spec);
      // The engine's own pre-passes first (WP-B3 keeps them), so the candidate starts where the engine would start.
      const gs = gaussSeidel(F, [0, 0, 0], ALG_TOL);
      const r = solveCandidate(F, gs.z, ALG_TOL, MAX_ITER, verbose && name === 'NLEQ-ERR');
      r.evaluations += gs.evaluations;
      const ok = isGreen(r, root);
      summary[name].total++;
      summary[name].evals = Math.max(summary[name].evals, r.evaluations);
      if (ok) summary[name].green++; else summary[name].failures.push(`${c.name}: ${r.reason}`);
      push(`${name.padEnd(10)} ${c.name.padEnd(58)} ${root.toPrecision(6).padStart(10)} ${r.z[0].toPrecision(8).padStart(16)} ${String(r.evaluations).padStart(6)} ${String(r.iterations).padStart(3)}  ${ok ? 'YES' : 'NO '}`);
    }
  }

  // Sanity check that keeps the verdict honest: both candidates must be able to solve the same cases when started near
  // the root. If this block failed, the result above would be evidence about the prototypes, not about the start point.
  push('near-root sanity check (start at 0.9 x the root, all three unknowns):');
  for (const [name, solveCandidate] of candidates) {
    let ok = 0;
    const detail: string[] = [];
    for (const c of cases) {
      const root = closedFormRoot(c.spec);
      const s0 = 0.9 * root;
      const z0 = [s0, s0 * s0, (c.spec.wiring === 'minus' ? 1 : -1) * c.spec.k * s0 * s0];
      const r = solveCandidate(makeLoop(c.spec), z0, ALG_TOL, MAX_ITER);
      const green = isGreen(r, root);
      if (green) ok++;
      else detail.push(`${c.name}: ${r.reason}`);
    }
    push(`${name.padEnd(10)} near-root: ${ok}/${cases.length} cases green${detail.length ? ' -- ' + detail.slice(0, 2).join('; ') : ''}`);
  }

  // The shapes that must stay honest: a loop with no root, and a start far from the root.
  push('');
  push('shapes that must not produce a false root:');
  for (const [name, solveCandidate] of candidates) {
    // y = 1 + y + y^2 has no real root: F never equals z, and no candidate may claim convergence.
    const F = makeLoop({ c: 1, k: -1e-300, wiring: 'minus' }); // the same 3-unknown structure, engineered to have no root
    const r = solveCandidate(F, [0, 0, 0], ALG_TOL, MAX_ITER);
    // The honest answer is "not converged"; a converged result whose residual is not within tolerance would be a false root.
    push(`${name.padEnd(10)} no-root shape: converged=${r.converged} (${r.reason}), evals=${r.evaluations}`);
  }

  push('');
  for (const [name] of candidates) {
    const s = summary[name];
    push(`${name}: ${s.green}/${s.total} cases green, worst evaluation count ${s.evals}`);
    if (s.failures.length) push(`  failures:\n    ${s.failures.join('\n    ')}`);
  }
  const winner = candidates.map(([n]) => n).find((n) => summary[n].green === summary[n].total);
  push('');
  push(winner
    ? `RESULT: ${winner} is green on all ${summary[winner].total} cases -- port it into the engine (WP-B3).`
    : 'RESULT: no candidate is green on all 12 cases -- STOP and report to the user (plan WP-B2). Do not tune constants per case.');

  const outFile = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length);
  if (outFile) writeFileSync(outFile, lines.join('\n') + '\n');
  process.exitCode = winner ? 0 : 1;
};

main();
