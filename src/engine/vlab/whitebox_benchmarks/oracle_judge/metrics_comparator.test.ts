import { describe, expect, it } from 'vitest';
import { MetricsComparator } from './MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from './ToleranceProfiles';

describe('MetricsComparator', () => {
  it('calculates exact 0% NRMSE for identical trajectories', () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    const yRef = [0, 0.632, 0.865, 0.95, 0.982, 0.993];
    const ySim = [...yRef];
    const nrmse = MetricsComparator.calculateNRMSE(ySim, yRef);
    expect(nrmse).toBeCloseTo(0, 5);
  });

  it('correctly extracts 63.2% time constant tau from first-order trajectory', () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 1.0];
    const tau = 0.2;
    const ySim = t.map((time) => 10 * (1 - Math.exp(-time / tau)));
    const calculatedTau = MetricsComparator.calculateTimeConstant(t, ySim, 10);
    expect(calculatedTau).toBeCloseTo(0.2, 2);
  });

  it('passes judgment against linear tolerance profile for valid response', () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    const yRef = t.map((time) => 5 * (1 - Math.exp(-time / 0.1)));
    const ySim = yRef.map((val) => val * 1.005); // 0.5% offset
    const verdict = MetricsComparator.judgeTrajectory(t, ySim, yRef, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(verdict.passed).toBe(true);
    expect(verdict.nrmsePercent).toBeLessThan(1.0);
  });
});
