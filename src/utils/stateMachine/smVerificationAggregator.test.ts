import { describe, expect, it } from 'vitest';
import { aggregateVerificationStatus } from './smVerificationAggregator';

describe('smVerificationAggregator', () => {
  it('returns FAIL if any required stage is FAIL regardless of other stages', () => {
    const result = aggregateVerificationStatus({
      hostCompile: 'PASS',
      runtimeTests: 'FAIL',
      differential: 'BLOCKED',
      coverage: 'BLOCKED',
      mcuIntegration: 'INTEGRATION REQUIRED'
    });

    expect(result.behavioralGenerationStatus).toBe('FAIL');
  });

  it('returns BLOCKED when host compilation fails', () => {
    const result = aggregateVerificationStatus({
      hostCompile: 'FAIL',
      runtimeTests: 'BLOCKED',
      differential: 'BLOCKED',
      coverage: 'BLOCKED',
      mcuIntegration: 'INTEGRATION REQUIRED'
    });

    expect(result.behavioralGenerationStatus).toBe('FAIL');
  });

  it('returns PASS for optional stage NOT APPLICABLE', () => {
    const result = aggregateVerificationStatus({
      hostCompile: 'PASS',
      runtimeTests: 'PASS',
      differential: 'PASS',
      coverage: 'NOT APPLICABLE',
      mcuIntegration: 'INTEGRATION REQUIRED'
    });

    expect(result.behavioralGenerationStatus).toBe('PASS');
    expect(result.productVerificationStatus).toBe('INCOMPLETE');
  });
});
