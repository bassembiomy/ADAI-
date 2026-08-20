import { describe, expect, it } from 'vitest';
import { SignalFixtures } from '../boundary_generator/SignalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Signal / Controls Batch', () => {
  it('S-01: Validates signal gain and saturation bounds', () => {
    const input = 10;
    const gain = 2.0; // 20
    const upper = 15;
    const lower = -15;
    const boundary = SignalFixtures.createGainSaturationCircuit(gain, upper, lower, input);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measured = result.signals['clamped_out'];
    const expected = result.time.map(() => 15.0); // Clamped at 15

    const verdict = MetricsComparator.judgeTrajectory(
      result.time,
      measured,
      expected,
      DEFAULT_TOLERANCE_PROFILES.linear
    );

    expect(verdict.passed).toBe(true);
    expect(verdict.nrmsePercent).toBeLessThan(1.0);
  });
});
