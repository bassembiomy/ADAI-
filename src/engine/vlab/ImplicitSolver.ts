import { EquationContext } from './types';
import { SparseLinearSolver } from './SparseLinearSolver';
import {
  NonFiniteResidualError, SingularMatrixError, SolverConvergenceError, anonymousNonFinite, type SingularPivot,
} from './vlabResidualDiagnostics';

type Evaluation = { fx: number[]; error?: undefined } | { fx?: undefined; error: NonFiniteResidualError };

export class ImplicitSolver {
  /** relative Newton step below which the iterate is converged to working precision (see solve) */
  static readonly STEP_TOLERANCE = 1e-12;
  /** largest move of one unknown per undamped Newton step, relative to max(1, |x_i|) (see newton) */
  static readonly STEP_LIMIT = 10;
  private maxIterations = 50;
  private tolerance = 1e-8;
  private requireConvergence = false;
  private allowUnderdetermined = false;
  private preferFreeColumns: number[] = [];

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

  /**
   * Evaluate the residual at a point. A non-finite residual (returned or raised as NonFiniteResidualError by the
   * assembler) is reported, never replaced; any other exception propagates unchanged.
   */
  private evaluate(equations: (x: number[], ctx: EquationContext) => number[], x: number[], ctx: EquationContext): Evaluation {
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
    ctx: EquationContext
  ): number[] {
    let run = this.newton(equations, initialX, ctx, true);
    if (run.x) return run.x;
    // WP-31b: the monotone line search can trap Newton on piecewise-linear switching elements (a diode / switch with
    // Ron/Roff = 1e-9: the first full step lands in the other mode with a residual 1e6x larger, so every damped trial is
    // rejected, although undamped Newton enumerates the modes and converges in a few steps, which is the SPICE iteration).
    // A failed damped solve is retried once with full Newton steps before it is reported; convergence is still required.
    if (!run.singular) {
      const pure = this.newton(equations, initialX, ctx, false);
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

  /** One Newton run: `x` when converged, else the best iterate. `damped` = monotone backtracking line search. */
  private newton(
    equations: (x: number[], ctx: EquationContext) => number[],
    initialX: number[],
    ctx: EquationContext,
    damped: boolean,
  ): { x?: number[]; bestX: number[]; minError: number; singular?: SingularPivot[] } {
    let x = [...initialX];
    let bestX = [...x];
    let minError = Infinity;
    let singular: SingularPivot[] | undefined;
    const done = (converged: number[]) => ({ x: converged, bestX, minError, singular });

    for (let iter = 0; iter < this.maxIterations; iter++) {
      // The base point of an iteration must be finite: the caller rejects the step (reduces h) on this error.
      const base = this.evaluate(equations, x, ctx);
      if (base.error) throw base.error;
      const fx = base.fx;
      const error = Math.sqrt(fx.reduce((sum, val) => sum + val * val, 0));

      if (error < minError) {
        minError = error;
        bestX = [...x];
      }

      if (error < this.tolerance) {
        return done(x);
      }

      // Compute Numerical Jacobian J[row][col]
      const J = this.computeJacobian(equations, x, fx, ctx);

      // Newton step: J * deltaX = -fx
      const negFx = fx.map(v => -v);
      let deltaX: number[];
      const singularBefore = SparseLinearSolver.singularSolveCount;
      try {
        deltaX = this.allowUnderdetermined ? SparseLinearSolver.solveRankDeficient(J, negFx, this.preferFreeColumns) : SparseLinearSolver.solve(J, negFx);
      } catch (e) {
        // WP-31b (F-051): a singular (inconsistent) Newton matrix ends the solve with a diagnostic naming the unknowns.
        if (!(e instanceof SingularMatrixError)) throw e;
        singular = e.pivots;
        break;
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
      const fullRank = !this.allowUnderdetermined && SparseLinearSolver.singularSolveCount === singularBefore;
      if (fullRank && maxRelStep <= ImplicitSolver.STEP_TOLERANCE) return done(x.map((v, i) => v + deltaX[i]));

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
        const xTrial = x.map((v, i) => v + damping * deltaX[i]);
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
        // If no damping factor improves the residual, take a small step anyway to escape local minima
        x = x.map((v, i) => v + 0.1 * deltaX[i]);
      }
    }
    return { bestX, minError, singular };
  }

  private computeJacobian(
    equations: (x: number[], ctx: EquationContext) => number[],
    x: number[],
    fx: number[],
    ctx: EquationContext
  ): number[][] {
    const n = x.length;
    const eps = 1e-8;
    const J: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let j = 0; j < n; j++) {
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
      const fxPlus = plus.fx;
      for (let i = 0; i < n; i++) {
        J[i][j] = (fxPlus[i] - fx[i]) / step;
      }
    }

    return J;
  }
}
