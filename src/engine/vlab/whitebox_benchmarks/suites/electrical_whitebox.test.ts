import { describe, expect, it } from 'vitest';
import { ElectricalFixtures } from '../boundary_generator/ElectricalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';
import { AnalyticalBaselines } from '../oracle_judge/AnalyticalBaselines';
import { MetricsComparator } from '../oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from '../oracle_judge/ToleranceProfiles';

describe('VLab White-Box: Electrical Domain Batch', () => {
  it('E-01: Validates Ohm\'s law resistor DC current and voltage', () => {
    const boundary = ElectricalFixtures.createResistorDCCircuit(12, 100); // 12V, 100 Ohm -> 0.12A
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredV = result.signals['V_resistor'];
    const expectedV = result.time.map(() => 12.0);
    const verdict = MetricsComparator.judgeTrajectory(result.time, measuredV, expectedV, DEFAULT_TOLERANCE_PROFILES.linear);
    expect(verdict.passed).toBe(true);
    expect(verdict.nrmsePercent).toBeLessThan(1.0);
  });

  it('E-02: Validates RC circuit charging curve against analytical formula', () => {
    const R = 1000;
    const C = 100e-6; // tau = 0.1s
    const Vs = 10;
    const boundary = ElectricalFixtures.createRCChargingCircuit(Vs, R, C, 0.4);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredVc = result.signals['V_cap'];
    const expectedVc = AnalyticalBaselines.rcCharging(result.time, Vs, R, C);
    const verdict = MetricsComparator.judgeTrajectory(
      result.time,
      measuredVc,
      expectedVc,
      DEFAULT_TOLERANCE_PROFILES.linear,
      R * C,
      Vs
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.nrmsePercent).toBeLessThan(1.0);
  });

  it('E-03: Validates AC sinusoidal voltage across resistor', () => {
    const Vpk = 100;
    const f = 50;
    const R = 100;
    const boundary = ElectricalFixtures.createACSineCircuit(Vpk, f, R, 0.04);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredV = result.signals['V_ac'];
    expect(Math.max(...measuredV)).toBeGreaterThan(95);
    expect(Math.min(...measuredV)).toBeLessThan(-95);
  });
});
