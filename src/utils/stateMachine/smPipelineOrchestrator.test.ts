import { describe, expect, it } from 'vitest';
import { flatOrFixture, xb6StepFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { runVerificationPipeline } from './smPipelineOrchestrator';

describe('smPipelineOrchestrator', () => {
  it('executes real verification pipeline returning evidence-backed status report', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const report = runVerificationPipeline(ir!);

    expect(report.artifactsCount).toBeGreaterThan(0);
    expect(report.traceabilityMappingsCount).toBeGreaterThan(0);
    expect(report.status.behavioralGenerationStatus).toBe('PASS');
    expect(report.status.targetIntegrationStatus).toBe('INTEGRATION REQUIRED');
    expect(report.status.productVerificationStatus).toBe('INCOMPLETE');
  }, 30000);

  it('verifies XB6 Step block model differential trace parity across 0ms to 1000ms steps (GEN-XB-STEP-007, 009)', () => {
    const fixture = xb6StepFixture();
    const { ir } = buildSemanticModel(fixture);
    const vectors = Array.from({ length: 10 }, (_, i) => ({
      tick: i + 1,
      deltaMs: 100,
      inputs: {},
      events: [],
    }));

    const report = runVerificationPipeline(ir!, vectors);
    expect(report.differential.behavioralGenerationStatus).toBe('PASS');
    expect(report.status.behavioralGenerationStatus).toBe('PASS');
  }, 30000);
});
