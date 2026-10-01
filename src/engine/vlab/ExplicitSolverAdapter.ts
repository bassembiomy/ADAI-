import { AssembledSystem, EquationContext } from './types';
import { ImplicitSolver } from './ImplicitSolver';
import { CompiledPhysicalSystem, SolverConfiguration } from './kernel/types';
import { EulerSolver } from './kernel/solvers/EulerSolver';
import { RK4Solver } from './kernel/solvers/RK4Solver';
import { AdaptiveRKSolver } from './kernel/solvers/AdaptiveRKSolver';

/** Reduce explicit-state DAEs at each RK stage by solving their algebraic constraints.
 * The kernel steppers require dx - f(t,x), while VLab stores a full residual vector.
 * Models with derivatives of across/branch variables require the implicit strategy.
 */
export function explicitSolverStep(
  system: AssembledSystem, initial: number[], ctx: EquationContext,
  config: SolverConfiguration, nonlinearSolver: ImplicitSolver
): { x: number[]; accepted: boolean; lte: number } {
  const indices = system.isDifferentialState.flatMap((isState, i) => isState ? [i] : []);
  const project = (values: Float64Array, time: number) => {
    const fixed = [...initial];
    indices.forEach((index, i) => { fixed[index] = values[i]; });
    const stageContext = { ...ctx, time, states: fixed };
    const residual = (unknown: number[], solveContext: EquationContext) => {
      const x = fixed.map((value, i) => system.isDifferentialState[i] ? value : unknown[i]);
      const dx = unknown.map((value, i) => system.isDifferentialState[i] ? value : 0);
      return system.residuals(x, dx, solveContext);
    };
    const unknown = nonlinearSolver.solve(residual,
      initial.map((value, i) => system.isDifferentialState[i] ? 0 : value), stageContext);
    return {
      x: fixed.map((value, i) => system.isDifferentialState[i] ? value : unknown[i]),
      dx: indices.map(index => unknown[index])
    };
  };

  // Do not silently treat capacitor/inductor derivatives as algebraic equations.
  const zeroDx = new Array(system.systemSize).fill(0);
  const base = system.residuals(initial, zeroDx, { ...ctx });
  for (let i = 0; i < system.systemSize; i++) {
    if (system.isDifferentialState[i]) continue;
    const dx = [...zeroDx];
    dx[i] = 1;
    const probe = system.residuals(initial, dx, { ...ctx });
    if (probe.some((value, row) => value !== base[row])) {
      throw new Error(`${config.solver} requires explicit state equations for this model; select bdf or auto for across/branch derivatives.`);
    }
  }

  const compiled: CompiledPhysicalSystem = {
    id: 'vlab-explicit', domains: [], stateCount: indices.length, algebraicCount: 0,
    totalSize: indices.length, isDifferentialState: indices.map(() => true),
    variableNames: indices.map(i => system.variableNames[i]),
    residual: (time, x, _dx, _z, _context, out) => {
      const stage = project(x, time);
      stage.dx.forEach((value, i) => { out[i] = -value; });
    }
  };
  const solver = config.solver === 'euler' ? new EulerSolver()
    : config.solver === 'rk4' ? new RK4Solver() : new AdaptiveRKSolver();
  const result = solver.step({
    system: compiled, config, t: ctx.time - ctx.dt,
    x: new Float64Array(indices.map(i => initial[i])),
    dx: new Float64Array(indices.length), z: new Float64Array(0)
  }, ctx.dt);
  return {
    x: result.accepted ? project(result.x, result.t).x : initial,
    accepted: result.accepted, lte: result.lte
  };
}
