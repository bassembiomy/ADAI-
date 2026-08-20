import { describe, expect, it } from 'vitest';
import { FluidFixtures } from '../boundary_generator/FluidFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Fluid / Gas Domain Batch', () => {
  it('F-01: Validates gas flow resistance under pressure differential', () => {
    const Psource = 500; // 500 Pa
    const k = 0.5; // Conductance k = 0.5 kg/(s·Pa)
    // Expected mass flow = k * dP = 0.5 * 500 = 250 kg/s
    const boundary = FluidFixtures.createGasResistanceCircuit(Psource, k, 0.02);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredMdot = result.signals['res_flow_branch_mass_flow'].map((m) => Math.abs(m));
    const expectedMdot = result.time.map(() => 250.0);

    const verdict = MetricsComparator.judgeTrajectory(
      result.time,
      measuredMdot,
      expectedMdot,
      DEFAULT_TOLERANCE_PROFILES.linear
    );

    expect(verdict.passed).toBe(true);
    expect(verdict.nrmsePercent).toBeLessThan(1.0);
  });
});
