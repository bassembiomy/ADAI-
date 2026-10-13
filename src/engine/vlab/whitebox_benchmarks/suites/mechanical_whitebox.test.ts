import { describe, expect, it } from 'vitest';
import { MechanicalFixtures } from '../boundary_generator/MechanicalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { AnalyticalBaselines } from '../oracle_judge/AnalyticalBaselines';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Mechanical Domain Batch', () => {
  it('M-01: Validates mass-spring-damper step response against 2nd order analytical solution', () => {
    const F0 = 10;
    const m = 1.0;
    const k = 100;
    const b = 5.0;
    const boundary = MechanicalFixtures.createMassSpringDamper(F0, m, k, b, 2.0);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    // F-090: the force source now drives the mass in +x, so the spring extension is positive (no sign hidden by abs)
    expect(Math.min(...result.signals['spring_state_x'].slice(10))).toBeGreaterThan(0);
    const measuredX = result.signals['spring_state_x'].map((x) => Math.abs(x));
    const expectedX = AnalyticalBaselines.massSpringDamper(result.time, F0, m, k, b);

    // Steady state check: x_ss = F0 / k = 0.1m
    const finalMeasured = measuredX[measuredX.length - 1];
    expect(finalMeasured).toBeCloseTo(0.1, 2);

    const verdict = MetricsComparator.judgeTrajectory(
      result.time,
      measuredX,
      expectedX,
      DEFAULT_TOLERANCE_PROFILES.nonlinear,
      undefined,
      0.1
    );
    expect(verdict.passed).toBe(true);
  });

  it('M-02: Validates rotational inertia and damper spin-up', () => {
    const T0 = 5;
    const J = 0.01;
    const b = 0.1;
    const boundary = MechanicalFixtures.createInertiaDamper(T0, J, b, 0.2);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredW = result.signals['J'];
    // F-090: J w' + b w = T0 -> w(t) = T0/b (1 - e^(-b t / J)), positive for T0 > 0 (the probe reads the speed, not the torque)
    measuredW.forEach((w, i) => expect(Math.abs(w - (T0 / b) * (1 - Math.exp((-b * result.time[i]) / J)))).toBeLessThan(0.01 * (T0 / b)));
  });
});
