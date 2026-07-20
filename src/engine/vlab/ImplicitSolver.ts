import { EquationContext } from './types';
import { SparseLinearSolver } from './SparseLinearSolver';

export class ImplicitSolver {
  private maxIterations = 50;
  private tolerance = 1e-8;

  solve(
    equations: (x: number[], ctx: EquationContext) => number[],
    initialX: number[],
    ctx: EquationContext
  ): number[] {
    let x = [...initialX];
    let bestX = [...x];
    let minError = Infinity;
    
    for (let iter = 0; iter < this.maxIterations; iter++) {
      const fx = equations(x, ctx);
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
        deltaX = SparseLinearSolver.solve(J, negFx);
      } catch (e) {
        // Fallback if solver fails (e.g. singular matrix)
        console.warn('Linear solver failed, aborting Newton step', e);
        break;
      }
      
      // Backtracking line search / damping to improve convergence on sharp non-linearities
      let damping = 1.0;
      let stepAccepted = false;
      
      while (damping > 0.05) {
        const xTrial = x.map((v, i) => v + damping * deltaX[i]);
        const fxTrial = equations(xTrial, ctx);
        const trialError = Math.sqrt(fxTrial.reduce((sum, val) => sum + val * val, 0));
        
        if (trialError < error || trialError < this.tolerance) {
          x = xTrial;
          stepAccepted = true;
          break;
        }
        damping *= 0.5;
      }
      
      if (!stepAccepted) {
        // If no damping factor improves the residual, take a small step anyway to escape local minima
        x = x.map((v, i) => v + 0.1 * deltaX[i]);
      }
    }
    
    // If we finished all iterations and didn't converge below tolerance,
    // throw an error so the physics engine can retry with a smaller step size
    if (minError > 1e-3) {
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
      const fxPlus = equations(xPlus, ctx);
      for (let i = 0; i < n; i++) {
        J[i][j] = (fxPlus[i] - fx[i]) / h;
      }
    }
    
    return J;
  }
}
