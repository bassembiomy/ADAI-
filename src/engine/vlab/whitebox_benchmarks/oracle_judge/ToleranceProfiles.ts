export interface ToleranceProfile {
  maxNrmsePercent: number;
  maxSteadyStateErrorPercent: number;
  maxTauErrorPercent: number;
  maxResidualNorm: number;
}

export const DEFAULT_TOLERANCE_PROFILES: Record<string, ToleranceProfile> = {
  linear: {
    maxNrmsePercent: 1.0,
    maxSteadyStateErrorPercent: 1.0,
    maxTauErrorPercent: 2.0,
    maxResidualNorm: 1e-5,
  },
  nonlinear: {
    maxNrmsePercent: 5.0,
    maxSteadyStateErrorPercent: 3.0,
    maxTauErrorPercent: 5.0,
    maxResidualNorm: 1e-4,
  },
  conservation: {
    maxNrmsePercent: 1.0,
    maxSteadyStateErrorPercent: 0.5,
    maxTauErrorPercent: 1.0,
    maxResidualNorm: 1e-6,
  },
};
