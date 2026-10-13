import type { MetricSet } from './metrics';

export type ToleranceClass = 'linear_smooth' | 'nonlinear_smooth' | 'switching' | 'stiff';

export interface Tolerance {
  /** fraction (0.005 = 0.5 %) */
  nrmse: number;
  /** percent */
  finalValuePct: number;
  /** relative frequency error (fraction), if applicable */
  freqRel?: number;
  /** event time: max(eventSteps * dt, eventPeriodFrac * T) */
  eventSteps?: number;
  eventPeriodFrac?: number;
  noDivergence?: boolean;
}

/** Plan section 4.3. Never loosen. */
export const TOLERANCES: Record<ToleranceClass, Tolerance> = {
  linear_smooth: { nrmse: 0.005, finalValuePct: 0.1, freqRel: 0.005 },
  nonlinear_smooth: { nrmse: 0.01, finalValuePct: 0.5 },
  switching: { nrmse: 0.02, finalValuePct: 1, eventSteps: 1, eventPeriodFrac: 0.005 },
  stiff: { nrmse: 0.01, finalValuePct: 0.5, noDivergence: true },
};

export function checkTolerance(cls: ToleranceClass, m: MetricSet): string[] {
  const tol = TOLERANCES[cls];
  const fails: string[] = [];
  if (!Number.isFinite(m.nrmse)) fails.push('NaN/diverged');
  if (m.nrmse > tol.nrmse) fails.push(`nrmse ${(m.nrmse * 100).toFixed(4)}% > ${(tol.nrmse * 100).toFixed(2)}%`);
  if (m.finalValueErrPct > tol.finalValuePct)
    fails.push(`final ${m.finalValueErrPct.toFixed(4)}% > ${tol.finalValuePct}%`);
  if (tol.freqRel !== undefined && m.dominantFreqGolden > 0) {
    const rel = Math.abs(m.dominantFreq - m.dominantFreqGolden) / m.dominantFreqGolden;
    if (rel > tol.freqRel) fails.push(`freq rel err ${(rel * 100).toFixed(3)}% > ${tol.freqRel * 100}%`);
  }
  return fails;
}
