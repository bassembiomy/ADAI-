import { describe, expect, it } from 'vitest';
import { ThermalFixtures } from '../boundary_generator/ThermalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Thermal Domain Batch', () => {
  it('T-01: Validates thermal conduction temperature source propagation to sensor', () => {
    const Thot = 350; // 350 K
    const k = 2.0;
    const boundary = ThermalFixtures.createThermalConductionCircuit(Thot, k, 0.02);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredT = result.signals['T_sensor'];
    const expectedT = result.time.map(() => 350.0);

    const verdict = MetricsComparator.judgeTrajectory(
      result.time,
      measuredT,
      expectedT,
      DEFAULT_TOLERANCE_PROFILES.linear
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.nrmsePercent).toBeLessThan(1.0);
  });

  it('T-02: Validates thermal mass heating transient temperature progression', () => {
    const Thot = 350;
    const k = 5.0;
    const C = 50.0;
    const boundary = ThermalFixtures.createThermalMassTransient(Thot, k, C, 0.5);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredT = result.signals['T_mass'];

    expect(measuredT.length).toBeGreaterThan(5);
    // Initial temperature starts near ambient (293.15K) and climbs toward Thot
    expect(measuredT[0]).toBeGreaterThanOrEqual(290);
    expect(measuredT[measuredT.length - 1]).toBeGreaterThan(measuredT[0]);
  });
});
