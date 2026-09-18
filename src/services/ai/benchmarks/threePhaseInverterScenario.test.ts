import { describe, it, expect } from 'vitest';
import { ThreePhaseInverterScenarioBenchmark } from './threePhaseInverterScenario';

describe('ThreePhaseInverterScenario Benchmark Evaluation', () => {
  it('executes full vertical slice and meets all benchmark metrics', async () => {
    const report = await ThreePhaseInverterScenarioBenchmark.run();

    expect(report.templateMatched).toBe(true);
    expect(report.preflightRejectedHallucination).toBe(true);
    expect(report.transactionSuccess).toBe(true);
    expect(report.validationResult.passed).toBe(true);
    expect(report.repairResult.success).toBe(true);
    expect(report.repairResult.totalAttempts).toBeLessThanOrEqual(3);
    expect(report.simulationResult.status).toBe('COMPLETED');
    expect(report.simulationResult.engineRunId).toBeDefined();
    expect(report.liveAdapterSuccess).toBe(true);
    expect(report.undoSuccess).toBe(true);

    // Verify key metrics
    expect(report.metrics.registryResolutionRate).toBe(1.0);
    expect(report.metrics.invalidPlanRejectionRate).toBe(1.0);
    expect(report.metrics.validationCorrectness).toBe(1.0);
    expect(report.metrics.repairMaxAttemptsBoundMet).toBe(true);
    expect(report.metrics.truthfulReportingVerified).toBe(true);
    expect(report.metrics.undoVerified).toBe(true);
    expect(report.metrics.liveAdapterVerified).toBe(true);
  });
});
