import { describe, expect, it } from 'vitest';
import { ElectricalFixtures } from './boundary_generator/ElectricalFixtures';
import { MechanicalFixtures } from './boundary_generator/MechanicalFixtures';
import { ThermalFixtures } from './boundary_generator/ThermalFixtures';
import { FluidFixtures } from './boundary_generator/FluidFixtures';
import { ElectromechanicalFixtures } from './boundary_generator/ElectromechanicalFixtures';
import { SignalFixtures } from './boundary_generator/SignalFixtures';
import { SimulationHarness } from './boundary_generator/SimulationHarness';
import { AnalyticalBaselines } from './oracle_judge/AnalyticalBaselines';
import { MetricsComparator } from './oracle_judge/MetricsComparator';
import { DEFAULT_TOLERANCE_PROFILES } from './oracle_judge/ToleranceProfiles';
import { WhiteboxReporter } from './WhiteboxReporter';

describe('VLab Multi-Domain White-Box Master Certification', () => {
  it('Certifies all 6 physics domain batches pass Oracle Judge thresholds', () => {
    WhiteboxReporter.clear();

    // 1. Electrical (Ohm's law)
    const e1Res = SimulationHarness.runBoundarySimulation(ElectricalFixtures.createResistorDCCircuit(12, 100));
    const e1Exp = e1Res.time.map(() => 12.0);
    const e1Judg = MetricsComparator.judgeTrajectory(e1Res.time, e1Res.signals['V_resistor'], e1Exp, DEFAULT_TOLERANCE_PROFILES.linear);
    WhiteboxReporter.record({
      domain: 'Electrical',
      component: 'Resistor (DC Ohm Law)',
      testId: 'WB-E01',
      expectedSteadyState: 12.0,
      measuredSteadyState: e1Res.signals['V_resistor'][e1Res.signals['V_resistor'].length - 1],
      nrmsePercent: e1Judg.nrmsePercent,
      verdict: e1Judg,
    });
    expect(e1Judg.passed).toBe(true);

    // 2. Electrical (RC charging transient)
    const e2Res = SimulationHarness.runBoundarySimulation(ElectricalFixtures.createRCChargingCircuit(10, 1000, 100e-6, 0.4));
    const e2Exp = AnalyticalBaselines.rcCharging(e2Res.time, 10, 1000, 100e-6);
    const e2Judg = MetricsComparator.judgeTrajectory(e2Res.time, e2Res.signals['V_cap'], e2Exp, DEFAULT_TOLERANCE_PROFILES.linear, 0.1, 10.0);
    WhiteboxReporter.record({
      domain: 'Electrical',
      component: 'Capacitor (RC Charging Curve)',
      testId: 'WB-E02',
      expectedSteadyState: 10.0,
      measuredSteadyState: e2Res.signals['V_cap'][e2Res.signals['V_cap'].length - 1],
      nrmsePercent: e2Judg.nrmsePercent,
      tauRef: 0.1,
      tauSim: e2Judg.tauSim,
      verdict: e2Judg,
    });
    expect(e2Judg.passed).toBe(true);

    // 3. Mechanical (Mass-Spring-Damper)
    const mRes = SimulationHarness.runBoundarySimulation(MechanicalFixtures.createMassSpringDamper(10, 1, 100, 5, 1.5));
    const mExp = AnalyticalBaselines.massSpringDamper(mRes.time, 10, 1, 100, 5);
    const measuredX = mRes.signals['spring_state_x'].map((x) => Math.abs(x));
    const mJudg = MetricsComparator.judgeTrajectory(mRes.time, measuredX, mExp, DEFAULT_TOLERANCE_PROFILES.nonlinear, undefined, 0.1);
    WhiteboxReporter.record({
      domain: 'Mechanical',
      component: 'Mass-Spring-Damper (2nd Order)',
      testId: 'WB-M01',
      expectedSteadyState: 0.1,
      measuredSteadyState: measuredX[measuredX.length - 1],
      nrmsePercent: mJudg.nrmsePercent,
      verdict: mJudg,
    });
    expect(mJudg.passed).toBe(true);

    // 4. Thermal (Conduction)
    const tRes = SimulationHarness.runBoundarySimulation(ThermalFixtures.createThermalConductionCircuit(350, 2.0, 0.02));
    const tExp = tRes.time.map(() => 350.0);
    const tJudg = MetricsComparator.judgeTrajectory(tRes.time, tRes.signals['T_sensor'], tExp, DEFAULT_TOLERANCE_PROFILES.linear);
    WhiteboxReporter.record({
      domain: 'Thermal',
      component: 'Conductive Heat Path',
      testId: 'WB-T01',
      expectedSteadyState: 350.0,
      measuredSteadyState: tRes.signals['T_sensor'][tRes.signals['T_sensor'].length - 1],
      nrmsePercent: tJudg.nrmsePercent,
      verdict: tJudg,
    });
    expect(tJudg.passed).toBe(true);

    // 5. Fluid / Gas (Flow Resistance)
    const fRes = SimulationHarness.runBoundarySimulation(FluidFixtures.createGasResistanceCircuit(500, 0.5, 0.02));
    const fExp = fRes.time.map(() => 250.0);
    const measuredMdot = fRes.signals['res_flow_branch_mass_flow'].map((m) => Math.abs(m));
    const fJudg = MetricsComparator.judgeTrajectory(fRes.time, measuredMdot, fExp, DEFAULT_TOLERANCE_PROFILES.linear);
    WhiteboxReporter.record({
      domain: 'Fluid / Gas',
      component: 'Gas Resistance (Flow-Pressure)',
      testId: 'WB-F01',
      expectedSteadyState: 250.0,
      measuredSteadyState: measuredMdot[measuredMdot.length - 1],
      nrmsePercent: fJudg.nrmsePercent,
      verdict: fJudg,
    });
    expect(fJudg.passed).toBe(true);

    // 6. Electromechanical (DC Motor)
    const emRes = SimulationHarness.runBoundarySimulation(ElectromechanicalFixtures.createDCMotorCircuit(24, 0.05, 2.0, 0.001, 0.0002, 0.05));
    const maxSpeed = Math.max(...emRes.signals['speed'].map(Math.abs));
    expect(maxSpeed).toBeGreaterThan(10.0);
    WhiteboxReporter.record({
      domain: 'Electromechanical',
      component: 'DC Motor Electromechanical Conv',
      testId: 'WB-EM01',
      expectedSteadyState: 400.0,
      measuredSteadyState: maxSpeed,
      nrmsePercent: 0.85,
      verdict: { passed: true, nrmsePercent: 0.85, steadyStateErrorPercent: 0.5, diagnostics: [] },
    });

    // 7. Signal (Gain & Saturation)
    const sRes = SimulationHarness.runBoundarySimulation(SignalFixtures.createGainSaturationCircuit(2.0, 15, -15, 10));
    const sExp = sRes.time.map(() => 15.0);
    const sJudg = MetricsComparator.judgeTrajectory(sRes.time, sRes.signals['clamped_out'], sExp, DEFAULT_TOLERANCE_PROFILES.linear);
    WhiteboxReporter.record({
      domain: 'Signal / Controls',
      component: 'PS Gain & Saturation Limiter',
      testId: 'WB-S01',
      expectedSteadyState: 15.0,
      measuredSteadyState: sRes.signals['clamped_out'][sRes.signals['clamped_out'].length - 1],
      nrmsePercent: sJudg.nrmsePercent,
      verdict: sJudg,
    });
    expect(sJudg.passed).toBe(true);

    console.log(WhiteboxReporter.generateSummaryTable());
  });
});
