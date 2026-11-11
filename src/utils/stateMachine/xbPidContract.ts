import { XBParameterValue } from './xbModel';
import { XBPidParameters } from './xbSemanticModel';
import { XBSolverConfig } from './xbModel';

/** Controller structures of the canvas PID_CONTROLLER mode parameter. */
export const PID_CANVAS_STRUCTURES: readonly string[] = ['P', 'PI', 'PD', 'PID'];

/** Canvas spellings of the discretization method (forward_euler, ...) mapped to the contract names. */
const PID_METHOD_ALIASES: Readonly<Record<string, string>> = {
  forwardeuler: 'ForwardEuler',
  backwardeuler: 'BackwardEuler',
  trapezoidal: 'Trapezoidal',
  tustin: 'Trapezoidal',
};

/**
 * Normalizes raw UI parameters from a PID_CONTROLLER block into a precise contract.
 * @param parameters The raw parameter dictionary from the block.
 * @param solver The solver configuration (used to fall back to the global solver step size).
 * @returns The strict XBPidParameters structure.
 * @throws Error if parameters violate constraints (e.g., negative sample time, max < min).
 */
export const normalizePidParameters = (
  parameters: Readonly<Record<string, XBParameterValue>>,
  solver: XBSolverConfig,
): XBPidParameters => {
  const modeParam = String(parameters.mode ?? 'continuous');
  // The canvas PID_CONTROLLER mode selects the controller structure (P, PI,
  // PD, PID). The embedded runtime evaluates that structure on the sampled
  // grid, so it maps to the 'discrete' contract mode; the structure itself is
  // read from the block parameter by the interpreter and the C generator.
  const isCanvasStructure = PID_CANVAS_STRUCTURES.includes(modeParam);
  if (modeParam !== 'continuous' && modeParam !== 'discrete' && !isCanvasStructure) {
    throw new Error(`Invalid PID mode: ${modeParam}`);
  }
  const mode: 'continuous' | 'discrete' = isCanvasStructure ? 'discrete' : modeParam as 'continuous' | 'discrete';

  const kp = Number(parameters.Kp ?? parameters.P ?? 0);
  const ki = Number(parameters.Ki ?? parameters.I ?? 0);
  const kd = Number(parameters.Kd ?? parameters.D ?? 0);
  const filterN = Number(parameters.N ?? 100);
  // Setpoint weights: canvas names beta / gamma (defaults 1 and 0), contract names b / c.
  const beta = Number(parameters.beta ?? parameters.b ?? 1);
  const gamma = Number(parameters.gamma ?? parameters.c ?? 0);
  
  const minimum = Number(parameters.min ?? parameters.LowerSaturationLimit ?? -Infinity);
  const maximum = Number(parameters.max ?? parameters.UpperSaturationLimit ?? Infinity);

  if (minimum > maximum) {
    throw new Error(`PID minimum (${minimum}) must be less than or equal to maximum (${maximum}).`);
  }

  const rawMethod = String(parameters.method ?? 'ForwardEuler');
  const methodParam = PID_METHOD_ALIASES[rawMethod.toLowerCase().replace(/[_\s-]/g, '')] ?? rawMethod;
  if (
    methodParam !== 'ForwardEuler' &&
    methodParam !== 'BackwardEuler' &&
    methodParam !== 'Trapezoidal'
  ) {
    throw new Error(`Invalid PID integration method: ${methodParam}`);
  }
  const method = methodParam as 'ForwardEuler' | 'BackwardEuler' | 'Trapezoidal';

  let sampleTime = Number(parameters.sampleTime ?? -1);
  if (sampleTime === -1) {
    // Fallback to solver step size
    sampleTime = solver.stepSeconds;
  }
  
  if (sampleTime <= 0 || !Number.isFinite(sampleTime)) {
    throw new Error(`PID sampleTime must be positive and finite. Got: ${sampleTime}`);
  }
  
  if (filterN < 0 || !Number.isFinite(filterN)) {
    throw new Error(`PID filter N must be non-negative and finite. Got: ${filterN}`);
  }

  if (![kp, ki, kd, beta, gamma].every(Number.isFinite)) {
    throw new Error('PID coefficients (kp, ki, kd, beta, gamma) must be finite.');
  }

  return {
    mode,
    kp,
    ki,
    kd,
    filterN,
    beta,
    gamma,
    minimum,
    maximum,
    method,
    sampleTime,
  };
};
