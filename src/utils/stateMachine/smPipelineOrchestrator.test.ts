import { describe, expect, it } from 'vitest';
import { flatOrFixture } from './smFixtures';
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
});
