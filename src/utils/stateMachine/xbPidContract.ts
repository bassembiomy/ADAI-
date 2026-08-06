import { XBParameterValue } from './xbModel';
import { XBPidParameters } from './xbSemanticModel';
import { XBSolverConfig } from './xbModel';

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
  if (modeParam !== 'continuous' && modeParam !== 'discrete') {
    throw new Error(`Invalid PID mode: ${modeParam}`);
  }
  const mode = modeParam as 'continuous' | 'discrete';

  const kp = Number(parameters.Kp ?? parameters.P ?? 0);
  const ki = Number(parameters.Ki ?? parameters.I ?? 0);
  const kd = Number(parameters.Kd ?? parameters.D ?? 0);
  const filterN = Number(parameters.N ?? 100);
  const beta = Number(parameters.b ?? 1);
  const gamma = Number(parameters.c ?? 1);
  
  const minimum = Number(parameters.min ?? parameters.LowerSaturationLimit ?? -Infinity);
  const maximum = Number(parameters.max ?? parameters.UpperSaturationLimit ?? Infinity);

  if (minimum > maximum) {
    throw new Error(`PID minimum (${minimum}) must be less than or equal to maximum (${maximum}).`);
  }

  const methodParam = String(parameters.method ?? 'ForwardEuler');
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
