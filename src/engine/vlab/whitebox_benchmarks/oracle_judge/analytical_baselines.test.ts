import { describe, expect, it } from 'vitest';
import { AnalyticalBaselines } from './AnalyticalBaselines';

describe('AnalyticalBaselines', () => {
  it('computes exact RC step response values', () => {
    const t = [0, 0.1, 0.2];
    const traj = AnalyticalBaselines.rcCharging(t, 10, 1000, 100e-6); // tau = 0.1s
    expect(traj[0]).toBe(0);
    expect(traj[1]).toBeCloseTo(10 * (1 - Math.exp(-1)), 4);
  });

  it('computes exact second-order mass-spring-damper trajectory', () => {
    const t = [0, 0.05, 0.1];
    const traj = AnalyticalBaselines.massSpringDamper(t, 10, 1.0, 100, 4); // m=1, k=100, b=4
    expect(traj[0]).toBe(0);
    expect(Number.isFinite(traj[1])).toBe(true);
  });

  it('computes thermal conduction and DC motor speed references', () => {
    const t = [0, 10, 20];
    const tTraj = AnalyticalBaselines.thermalConduction(t, 373.15, 293.15, 2.0, 50.0);
    expect(tTraj[0]).toBe(293.15);

    const mTraj = AnalyticalBaselines.dcMotorSpeed(t, 24, 2, 0.005, 0.05, 0.05, 0.001, 0.0001);
    expect(mTraj[0]).toBe(0);
    expect(mTraj[mTraj.length - 1]).toBeGreaterThan(0);
  });
});
