import { EquationContext } from './types';
import { SparseLinearSolver } from './SparseLinearSolver';
import { factorCsc, cscToDense, type CscMatrix, type LUFactor } from './SparseLU';
import { buildJacobianPattern, extendJacobianPattern, type JacobianPattern } from './vlabJacobian';
import { ddtStencil } from './vlabDiscretization';
import {
  NonFiniteResidualError, SingularMatrixError, SolverConvergenceError, anonymousNonFinite, type SingularPivot,
} from './vlabResidualDiagnostics';

type Evaluation = { fx: number[]; error?: undefined } | { fx?: undefined; error: NonFiniteResidualError };

/**
 * Optional structure of the residual family a solve belongs to (WP-31c). With it the solver colors the Jacobian (F-079a) and
 * reuses the factorization across Newton iterations and steps (modified Newton, F-079b). `system` identifies the residual family:
 * a cached Jacobian is never used for another one. Without hints every solve is the exact dense Newton iteration.
 */
export interface SolveHints { system: object; pattern?: number[][] | null }

export class ImplicitSolver {
  /** relative Newton step below which the iterate is converged to working precision (see solve) */
  static readonly STEP_TOLERANCE = 1e-12;
  /** largest move of one unknown per undamped Newton step, relative to max(1, |x_i|) (see newton) */
  static readonly STEP_LIMIT = 10;
  /** a cached factorization is reused while dt and the leading BDF coefficient stay within these ratios of its own */
  static readonly REUSE_RATIO_MIN = 0.6;
  static readonly REUSE_RATIO_MAX = 1.7;
  /** a factorization is refreshed after this many Newton iterations with it */
  static readonly MAX_REUSES = 30;
  /** a stale-Jacobian iteration that reduces the residual by less than this factor triggers a refresh */
  static readonly SLOW_CONVERGENCE = 0.5;
  private maxIterations = 50;
  private tolerance = 1e-8;
  private requireConvergence = false;
  private allowUnderdetermined = false;
  private preferFreeColumns: number[] = [];

  /** work counters (tests and performance reports); never reset by the solver */
  readonly stats = { residualEvals: 0, jacobians: 0, jacobianEvals: 0, coloredJacobians: 0, factorizations: 0, newtonIterations: 0, reusedIterations: 0, exactFallbacks: 0 };

  private system: object | null = null;
  private pattern: JacobianPattern | null = null;
  private cache: { factor: LUFactor; csc: CscMatrix; dt: number; a0: number; uses: number } | null = null;

  configure(options: { maxIterations?: number; tolerance?: number; allowUnderdetermined?: boolean; preferFreeColumns?: number[] }): void {
    if (options.allowUnderdetermined !== undefined) this.allowUnderdetermined = options.allowUnderdetermined;
    if (options.preferFreeColumns !== undefined) this.preferFreeColumns = options.preferFreeColumns;
    if (Number.isFinite(options.maxIterations) && (options.maxIterations ?? 0) > 0) {
      this.maxIterations = Math.floor(options.maxIterations!);
    }
    if (Number.isFinite(options.tolerance) && (options.tolerance ?? 0) > 0) {
      this.tolerance = options.tolerance!;
      this.requireConvergence = true;
    }
  }

  /** the colored-Jacobian structure currently in use (tests) */
  get jacobianPattern(): JacobianPattern | null { return this.pattern; }

  private adopt(hints: SolveHints | undefined, n: number): boolean {
    if (!hints) return false;
    if (hints.system !== this.system) {
      this.system = hints.system;
      this.cache = null;
      this.pattern = hints.pattern && hints.pattern.length === n ? buildJacobianPattern(hints.pattern, n) : null;
    }
    return true;
  }

  /**
   * Evaluate the residual at a point. A non-finite residual (returned or raised as NonFiniteResidualError by the
   * assembler) is reported, never replaced; any other exception propagates unchanged.
   */
  private evaluate(equations: (x: number[], ctx: EquationContext) => number[], x: number[], ctx: EquationContext): Evaluation {
    this.stats.residualEvals++;
    let fx: number[];
    try {
      fx = equations(x, ctx);
    } catch (e) {
      if (e instanceof NonFiniteResidualError) return { error: e };
      throw e;
    }
    const bad = fx.findIndex(v => !Number.isFinite(v));
    if (bad !== -1) return { error: new NonFiniteResidualError([anonymousNonFinite(bad, fx[bad])]) };
    return { fx };
  }

  solve(
    equations: (x: number[], ctx: EquationContext) => number[],
    initialX: number[],
    ctx: EquationContext,
    hints?: SolveHints,
  ): number[] {
    const structured = this.adopt(hints, initialX.length);
    // WP-31c: modified Newton first (colored Jacobian, factorization reused); on failure the exact Newton iteration (fresh dense
    // Jacobian every iteration), which is what the solver did before, so no model can fail that solved before.
    if (structured) {
      const fast = this.newton(equations, initialX, ctx, true, true);
      if (fast.x) return fast.x;
      this.stats.exactFallbacks++;
      this.cache = null;
    }
    let run = this.newton(equations, initialX, ctx, true, false);
    if (run.x) return run.x;
    // WP-31b: the monotone line search can trap Newton on piecewise-linear switching elements (a diode / switch with
    // Ron/Roff = 1e-9: the first full step lands in the other mode with a residual 1e6x larger, so every damped trial is
    // rejected, although undamped Newton enumerates the modes and converges in a few steps, which is the SPICE iteration).
    // A failed damped solve is retried once with full Newton steps before it is reported; convergence is still required.
    if (!run.singular) {
      const pure = this.newton(equations, initialX, ctx, false, false);
      if (pure.x) return pure.x;
      if (pure.minError < run.minError) run = pure;
    }
    const { bestX, minError, singular } = run;

    // If we finished all iterations and didn't converge below tolerance (or the Newton matrix was singular),
    // throw a structured error so the physics engine can retry with a smaller step size or name the failing rows
    if (singular || this.requireConvergence || this.allowUnderdetermined || minError > 1e-3) {
      const best = this.evaluate(equations, bestX, ctx);
      const residual = best.fx ?? [];
      const why = singular
        ? `singular Newton matrix in unknown(s) ${singular.map(s => s.column).join(', ')}`
        : `residual ${minError}, tolerance ${this.tolerance}`;
      throw new SolverConvergenceError(
        `ImplicitSolver did not converge within ${this.maxIterations} iterations (${why}).`,
        bestX, residual, minError, singular,
      );
    }
    return bestX;
  }

  private stale(ctx: EquationContext): boolean {
    const c = this.cache;
    if (!c) return true;
    if (c.uses >= ImplicitSolver.MAX_REUSES) return true;
    const dtRatio = ctx.dt / c.dt, a0Ratio = ddtStencil(ctx).a0 / c.a0;
    const { REUSE_RATIO_MIN: lo, REUSE_RATIO_MAX: hi } = ImplicitSolver;
    return !(dtRatio > lo && dtRatio < hi && a0Ratio > lo && a0Ratio < hi);
  }

  /**
   * One Newton run: `x` when converged, else the best iterate. `damped` = monotone backtracking line search.
   * `modified` = colored Jacobian and a factorization that is reused until it goes stale (convergence slow, h / order changed).
   */
  private newton(
    equations: (x: number[], ctx: EquationContext) => number[],
    initialX: number[],
    ctx: EquationContext,
    damped: boolean,
    modified: boolean,
  ): { x?: number[]; bestX: number[]; minError: number; singular?: SingularPivot[] } {
    let x = [...initialX];
    let bestX = [...x];
    let minError = Infinity;
    let singular: SingularPivot[] | undefined;
    const done = (converged: number[]) => ({ x: converged, bestX, minError, singular });
    let forceFresh = false;
    let previousError = Infinity;
    let previousStale = false;

    for (let iter = 0; iter < this.maxIterations; iter++) {
      this.stats.newtonIterations++;
      // The base point of an iteration must be finite: the caller rejects the step (reduces h) on this error.
      const base = this.evaluate(equations, x, ctx);
      if (base.error) throw base.error;
      const fx = base.fx;
      const error = Math.sqrt(fx.reduce((sum, val) => sum + val * val, 0));

      if (error < minError) {
        minError = error;
        bestX = [...x];
      }
      // an iteration with the cached Jacobian that did not reduce the residual enough: refresh it
      if (modified && previousStale && !(error <= ImplicitSolver.SLOW_CONVERGENCE * previousError)) forceFresh = true;

      if (error < this.tolerance) {
        // modified Newton stops at the first residual below tolerance, where exact Newton has usually already converged
        // quadratically far beyond it: one more correction with the cached factorization (one residual evaluation) recovers that
        // (up to 6 corrections, until the residual is 1e-8 of the tolerance: linear convergence with an approximate Jacobian
        // would otherwise leave the solution anywhere below the tolerance, and results would depend on whether J was reused)
        if (modified && this.cache && !this.allowUnderdetermined) {
          let px = x, pf = fx, pe = error;
          for (let k = 0; k < 6 && pe > this.tolerance * 1e-8; k++) {
            const corr = this.cache.factor.solve(pf.map(v => -v));
            if (!corr.every(Number.isFinite)) break;
            const cand = px.map((v, i) => v + corr[i]);
            const check = this.evaluate(equations, cand, ctx);
            if (!check.fx) break;
            const ce = Math.sqrt(check.fx.reduce((s, v) => s + v * v, 0));
            if (!(ce < pe)) break;
            px = cand; pf = check.fx; pe = ce;
          }
          if (px !== x) return done(px);
        }
        return done(x);
      }

      // Newton matrix: the cached factorization, or a fresh Jacobian
      let deltaX: number[] | undefined;
      let usedStale = false;
      let fullRank = true;
      const negFx = fx.map(v => -v);
      let csc: CscMatrix | undefined;
      if (modified && !this.allowUnderdetermined && !forceFresh && !this.stale(ctx)) {
        deltaX = this.cache!.factor.solve(negFx);
        this.cache!.uses++;
        this.stats.reusedIterations++;
        usedStale = true;
        if (!deltaX.every(Number.isFinite)) { deltaX = undefined; usedStale = false; forceFresh = true; }
      }
      if (!deltaX) {
        forceFresh = false;
        csc = this.computeJacobian(equations, x, fx, ctx, modified);
        const singularBefore = SparseLinearSolver.singularSolveCount;
        const factor = this.allowUnderdetermined ? null : factorCsc(csc);
        if (factor) {
          this.stats.factorizations++;
          if (modified) this.cache = { factor, csc, dt: ctx.dt, a0: ddtStencil(ctx).a0, uses: 0 };
          deltaX = factor.solve(negFx);
        } else {
          if (modified) this.cache = null;
          const J = cscToDense(csc);
          try {
            deltaX = this.allowUnderdetermined ? SparseLinearSolver.solveRankDeficient(J, negFx, this.preferFreeColumns) : SparseLinearSolver.solve(J, negFx);
          } catch (e) {
            // WP-31b (F-051): a singular (inconsistent) Newton matrix ends the solve with a diagnostic naming the unknowns.
            if (!(e instanceof SingularMatrixError)) throw e;
            singular = e.pivots;
            break;
          }
          fullRank = !this.allowUnderdetermined && SparseLinearSolver.singularSolveCount === singularBefore;
        }
      }
      const badStep = deltaX.findIndex(v => !Number.isFinite(v));
      if (badStep !== -1) throw new NonFiniteResidualError([anonymousNonFinite(badStep, deltaX[badStep])]);
      // WP-31b: step tolerance (Dennis & Schnabel, "Numerical Methods for Unconstrained Optimization and Nonlinear
      // Equations", 7.2: stop when the relative Newton step is below steptol; their default eps^(2/3) ~ 4e-11, here 1e-12).
      // The iterate then equals the root to working precision and the remaining residual is the round-off floor of rows
      // whose terms are large (e.g. L/h * i with a 1 mOhm / 1 MOhm switch pair); it is NOT an unconverged state.
      // Only for a full-rank Newton matrix: a rank-deficient solve returns zero increments on free unknowns whatever the residual.
      let maxRelStep = 0;
      for (let i = 0; i < deltaX.length; i++) {
        const r = Math.abs(deltaX[i]) / Math.max(1, Math.abs(x[i]));
        if (r > maxRelStep) maxRelStep = r;
      }
      if (fullRank && maxRelStep <= ImplicitSolver.STEP_TOLERANCE) return done(x.map((v, i) => v + deltaX![i]));

      // Backtracking line search / damping to improve convergence on sharp non-linearities
      // (undamped run: the first finite trial is taken, after limiting the step so that no unknown moves by more than
      // STEP_LIMIT * max(1, |x_i|); a generic form of the SPICE junction-voltage limiting (Nagel, SPICE2, 1975): a mode
      // change of a 1 MOhm switch otherwise throws node voltages to 1e8 V, where the finite-difference Jacobian is
      // inaccurate and the mode enumeration cycles)
      let damping = 1.0;
      if (!damped) {
        // per unknown, like the per-junction limiting of SPICE (a whole-step scale would freeze every unknown)
        deltaX = deltaX.map((d, i) => {
          const limit = ImplicitSolver.STEP_LIMIT * Math.max(1, Math.abs(x[i]));
          return Math.abs(d) > limit ? Math.sign(d) * limit : d;
        });
      }
      let stepAccepted = false;
      let lastNonFinite: NonFiniteResidualError | undefined;
      let sawFiniteTrial = false;
      const minDamping = damped ? 0.05 : damping * 0.05;

      while (damping > minDamping) {
        const step = deltaX;
        const xTrial = x.map((v, i) => v + damping * step[i]);
        const trial = this.evaluate(equations, xTrial, ctx);
        if (trial.error) {
          // A non-finite residual is a failed iterate: shrink the step.
          lastNonFinite = trial.error;
          damping *= 0.5;
          continue;
        }
        sawFiniteTrial = true;
        const trialError = Math.sqrt(trial.fx.reduce((sum, val) => sum + val * val, 0));

        if (!damped || trialError < error || trialError < this.tolerance) {
          x = xTrial;
          stepAccepted = true;
          break;
        }
        damping *= 0.5;
      }

      if (!stepAccepted) {
        // Every damped trial was non-finite: there is no iterate to escape to, report the block that failed.
        if (!sawFiniteTrial && lastNonFinite) throw lastNonFinite;
        if (usedStale) { forceFresh = true; previousStale = false; continue; } // retry this point with a fresh Jacobian
        // If no damping factor improves the residual, take a small step anyway to escape local minima
        x = x.map((v, i) => v + 0.1 * deltaX![i]);
      } else if (usedStale && damping < 1) {
        forceFresh = true;
      }
      previousError = error;
      previousStale = usedStale;
    }
    return { bestX, minError, singular };
  }

  /** forward difference of column j (backward on a domain boundary); returns the difference quotient numerator and the step */
  private columnDifference(
    equations: (x: number[], ctx: EquationContext) => number[], x: number[], ctx: EquationContext, j: number,
  ): { fxPlus: number[]; step: number } {
    const eps = 1e-8;
    const xPlus = [...x];
    // Adapt perturbation to scale of x[j]
    const h = eps * Math.max(1.0, Math.abs(x[j]));
    xPlus[j] += h;
    let plus = this.evaluate(equations, xPlus, ctx);
    let step = h;
    if (plus.error) {
      // Domain boundary on the forward side: fall back to a backward difference before giving up.
      const xMinus = [...x];
      xMinus[j] -= h;
      const minus = this.evaluate(equations, xMinus, ctx);
      if (minus.error) throw plus.error;
      plus = minus;
      step = -h;
    }
    this.stats.jacobianEvals++;
    return { fxPlus: plus.fx!, step };
  }

  /**
   * Jacobian as a compressed-column matrix. `colored` (modified Newton with a pattern): one evaluation per column group.
   * Otherwise the dense forward-difference Jacobian (n evaluations), which also learns any entry that the structural
   * pattern missed (a regime-dependent dependency), so a later colored Jacobian is correct.
   */
  private computeJacobian(
    equations: (x: number[], ctx: EquationContext) => number[],
    x: number[],
    fx: number[],
    ctx: EquationContext,
    colored: boolean,
  ): CscMatrix {
    const n = x.length;
    this.stats.jacobians++;
    const pat = this.pattern;
    if (colored && pat && pat.n === n) {
      this.stats.coloredJacobians++;
      const Ax = new Array<number>(pat.Ai.length).fill(0);
      for (const group of pat.groups) {
        const xp = [...x];
        const hs = group.map(j => 1e-8 * Math.max(1.0, Math.abs(x[j])));
        group.forEach((j, g) => { xp[j] += hs[g]; });
        const r = this.evaluate(equations, xp, ctx);
        if (r.fx) {
          this.stats.jacobianEvals++;
          group.forEach((j, g) => {
            for (let p = pat.Ap[j]; p < pat.Ap[j + 1]; p++) Ax[p] = (r.fx![pat.Ai[p]] - fx[pat.Ai[p]]) / hs[g];
          });
        } else {
          // the joint perturbation left the domain: difference the columns one by one (with the backward fallback)
          for (const j of group) {
            const { fxPlus, step } = this.columnDifference(equations, x, ctx, j);
            for (let p = pat.Ap[j]; p < pat.Ap[j + 1]; p++) Ax[p] = (fxPlus[pat.Ai[p]] - fx[pat.Ai[p]]) / step;
          }
        }
      }
      return { n, Ap: pat.Ap, Ai: pat.Ai, Ax };
    }

    const Ap = new Array<number>(n + 1), Ai: number[] = new Array(n * n), Ax: number[] = new Array(n * n);
    const found: [number, number][] = [];
    for (let j = 0; j < n; j++) {
      const { fxPlus, step } = this.columnDifference(equations, x, ctx, j);
      Ap[j] = j * n;
      for (let i = 0; i < n; i++) {
        const v = (fxPlus[i] - fx[i]) / step;
        Ai[j * n + i] = i;
        Ax[j * n + i] = v;
        if (v !== 0) found.push([i, j]);
      }
    }
    Ap[n] = n * n;
    if (pat && pat.n === n) this.pattern = extendJacobianPattern(pat, found);
    return { n, Ap, Ai, Ax };
  }
}
