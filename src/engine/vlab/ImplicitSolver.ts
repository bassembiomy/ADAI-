import { EquationContext } from './types';
import { SparseLinearSolver } from './SparseLinearSolver';
import { NonFiniteResidualError, anonymousNonFinite } from './vlabResidualDiagnostics';

type Evaluation = { fx: number[]; error?: undefined } | { fx?: undefined; error: NonFiniteResidualError };

export class ImplicitSolver {
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
    let x = [...initialX];
    let bestX = [...x];
    let minError = Infinity;

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
        return x;
      }

      // Compute Numerical Jacobian J[row][col]
      const J = this.computeJacobian(equations, x, fx, ctx);

      // Newton step: J * deltaX = -fx
      const negFx = fx.map(v => -v);
      let deltaX: number[];
      try {
        deltaX = this.allowUnderdetermined ? SparseLinearSolver.solveRankDeficient(J, negFx, this.preferFreeColumns) : SparseLinearSolver.solve(J, negFx);
      } catch (e) {
        // Fallback if solver fails (e.g. singular matrix)
        console.warn('Linear solver failed, aborting Newton step', e);
        break;
      }
      const badStep = deltaX.findIndex(v => !Number.isFinite(v));
      if (badStep !== -1) throw new NonFiniteResidualError([anonymousNonFinite(badStep, deltaX[badStep])]);

      // Backtracking line search / damping to improve convergence on sharp non-linearities
      let damping = 1.0;
      let stepAccepted = false;
      let lastNonFinite: NonFiniteResidualError | undefined;
      let sawFiniteTrial = false;

      while (damping > 0.05) {
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

        if (trialError < error || trialError < this.tolerance) {
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

    // If we finished all iterations and didn't converge below tolerance,
    // throw an error so the physics engine can retry with a smaller step size
    if (this.requireConvergence || this.allowUnderdetermined || minError > 1e-3) {
      if (this.requireConvergence || this.allowUnderdetermined) {
        throw new Error(`ImplicitSolver did not converge within ${this.maxIterations} iterations (residual ${minError}, tolerance ${this.tolerance}).`);
      }
      const finalFx = equations(bestX, ctx);
      console.error('ImplicitSolver Convergence Failure Details:');
      console.error('Best X:', bestX);
      console.error('Residuals of Best X:', finalFx.map((v, i) => `${i}: ${v}`));
      throw new Error(`ImplicitSolver did not converge. Final residual error: ${minError}`);
    }
    return bestX;
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
