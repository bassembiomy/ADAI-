// src/engine/xbridges/liveStep.ts
// The one solver dispatch of X-Bridges (plan F2 / XBV-002): the live canvas, the canvas worker, the test kit's canvas
// loop and the batch runner (Solvers.runFixedStep) all map a solver name to its stepper / runner here.
//
// Live stepping advances the engine over one output step [t, t + dt]:
//   - fixed-step solvers (euler, ode2, ode3, rk4, ode5, ode14x, discrete): one step of size dt;
//   - variable-step solvers (ode23, ode45, ode23tb): error-controlled internal steps with the engine's RelTol / AbsTol
//     (Simulink defaults 1e-3 / 1e-6 when unset), landing exactly on t + dt (decision D3). A step that cannot meet the
//     tolerance is retried with a smaller step; at the minimum step the run stops with a diagnostic.
// An unknown solver name is refused with UNSUPPORTED_SOLVER (decision D3, XBV-028); nothing falls back to Euler.
import { XbridgesEngine } from './XbridgesEngine';
import { Solvers } from './Solvers';
import { AdaptiveSolver } from './AdaptiveSolver';
import { StiffSolver } from './StiffSolver';

export type CanonicalSolver = 'euler' | 'ode2' | 'ode3' | 'rk4' | 'ode5' | 'ode23' | 'ode45' | 'ode14x' | 'ode23tb' | 'discrete';

/** Solver names the application accepts, with the canonical solver each one runs (ode1 = euler, ode4 = rk4). */
const SOLVER_NAMES = new Map<string, CanonicalSolver>([
  ['euler', 'euler'], ['ode1', 'euler'], ['fixedStep', 'euler'],
  ['ode2', 'ode2'], ['ode3', 'ode3'],
  ['rk4', 'rk4'], ['ode4', 'rk4'],
  ['ode5', 'ode5'],
  ['ode23', 'ode23'], ['ode45', 'ode45'],
  ['ode14x', 'ode14x'], ['ode23tb', 'ode23tb'],
  ['discrete', 'discrete'],
]);

/** The canonical solver for a name, or undefined for a name that is not implemented. */
export function canonicalSolver(name: unknown): CanonicalSolver | undefined {
  return typeof name === 'string' ? SOLVER_NAMES.get(name) : undefined;
}

/** Reports UNSUPPORTED_SOLVER once on the engine. */
export function reportUnsupportedSolver(engine: XbridgesEngine, solver: unknown): void {
  if (engine.diagnostics.some(d => d.code === 'UNSUPPORTED_SOLVER')) return;
  engine.diagnostics.push({
    severity: 'error',
    code: 'UNSUPPORTED_SOLVER',
    message: `Solver '${String(solver)}' is not supported. Use ode14x or ode23tb for stiff models.`,
  });
}

function reportOnce(engine: XbridgesEngine, code: string, message: string): void {
  if (!engine.diagnostics.some(d => d.code === code)) engine.diagnostics.push({ severity: 'error', code, message });
}

/** Default tolerances of the variable-step solvers (Simulink Solver pane: Relative 1e-3, Absolute 1e-6). */
const DEFAULT_REL_TOL = 1e-3;
const DEFAULT_ABS_TOL = 1e-6;

type Stepper = (engine: XbridgesEngine, t: number, dt: number, relTol: number, absTol: number) => boolean;

// Wrappers (not direct references) so the module loads even while Solvers.ts is still being evaluated.
const LIVE_STEPPERS: Record<CanonicalSolver, Stepper> = {
  euler: (e, t, dt) => { Solvers.stepEuler(e, t, dt); return true; },
  ode2: (e, t, dt) => { Solvers.stepODE2(e, t, dt); return true; },
  ode3: (e, t, dt) => { Solvers.stepODE3(e, t, dt); return true; },
  rk4: (e, t, dt) => { Solvers.stepRK4(e, t, dt); return true; },
  ode5: (e, t, dt) => { Solvers.stepODE5(e, t, dt); return true; },
  ode23: (e, t, dt, relTol, absTol) => AdaptiveSolver.stepODE23(e, t, dt, { relTol, absTol }),
  ode45: (e, t, dt, relTol, absTol) => AdaptiveSolver.stepODE45(e, t, dt, { relTol, absTol }),
  ode14x: (e, t, dt) => StiffSolver.stepODE14x(e, t, dt),
  ode23tb: (e, t, dt, relTol, absTol) => StiffSolver.stepLiveODE23TB(e, t, dt, relTol, absTol),
  discrete: (e, t, dt) => { Solvers.stepDiscrete(e, t, dt); return true; },
};

/**
 * Advances the engine over one output step [t, t + dt] with the named solver.
 * Returns false when the step could not be taken (unsupported solver, invalid tolerance, solver failure, block fault);
 * the reason is then an error diagnostic on the engine.
 */
export function liveStep(engine: XbridgesEngine, solver: string, t: number, dt: number): boolean {
  const canonical = canonicalSolver(solver);
  if (!canonical) {
    reportUnsupportedSolver(engine, solver);
    return false;
  }
  if (!Number.isFinite(t) || !(Number.isFinite(dt) && dt > 0)) {
    reportOnce(engine, 'FIXED_STEP_INVALID', `Live step needs a finite time and a step > 0 (t = ${t}, step = ${dt}).`);
    return false;
  }
  const relTol = engine.options?.relTol ?? DEFAULT_REL_TOL;
  const absTol = engine.options?.absTol ?? DEFAULT_ABS_TOL;
  if (!(Number.isFinite(relTol) && relTol > 0) || !(Number.isFinite(absTol) && absTol > 0)) {
    reportOnce(engine, 'STIFF_SOLVER_INVALID_OPTION', `Relative and absolute tolerance must be finite and > 0 (relTol = ${relTol}, absTol = ${absTol}).`);
    return false;
  }
  const ok = LIVE_STEPPERS[canonical](engine, t, dt, relTol, absTol);
  return ok && !engine.hasFatalError();
}

/**
 * The canvas time base (plan 5.1): output step n starts at startTime + n * dt (a product, not an accumulated sum), and
 * the last step is shortened to land exactly on a finite stop time. Returns null when the run is finished.
 */
export function liveStepAt(
  startTime: number, stopTime: number, dt: number, n: number,
): { time: number; stepNow: number; reachesStop: boolean } | null {
  const time = startTime + n * dt;
  const remaining = stopTime - time;
  if (remaining <= 1e-12) return null;
  const stepNow = Math.min(dt, remaining);
  return { time, stepNow, reachesStop: remaining - stepNow <= 1e-12 };
}

/** Runs the whole interval with the named solver on the batch path; false when the solver name is not implemented. */
export function runBatchSolver(engine: XbridgesEngine, solver: string, options: Parameters<typeof Solvers.runEuler>[1]): boolean {
  switch (canonicalSolver(solver)) {
    case 'ode45': AdaptiveSolver.runODE45(engine, options); return true;
    case 'ode23': AdaptiveSolver.runODE23(engine, options); return true;
    case 'rk4': Solvers.runRK4(engine, options); return true;
    case 'ode3': Solvers.runODE3(engine, options); return true;
    case 'ode2': Solvers.runODE2(engine, options); return true;
    case 'ode5': Solvers.runODE5(engine, options); return true;
    case 'ode14x': StiffSolver.runODE14x(engine, options); return true;
    case 'ode23tb': StiffSolver.runODE23TB(engine, options); return true;
    case 'discrete': Solvers.runDiscrete(engine, options); return true;
    case 'euler': Solvers.runEuler(engine, options); return true;
    default: return false;
  }
}
