import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';
import { extractStructuredEngineeringRequest } from '../intent/structuredRequestExtractor';
import { evaluateRequestUnderstandingCases } from './requestUnderstandingEvaluation';
import { RELEASE_HOLDOUT_VERSION, REQUEST_UNDERSTANDING_RELEASE_HOLDOUT } from './requestUnderstandingReleaseHoldout';

const EXPECTED_RELEASE_HOLDOUT_HASH = 'a3d9cc3eaf50fb1e549674508d64c06b0b6bc64a2c25cafebc6b0a3b8337e8ec';

describe(`request-understanding release holdout ${RELEASE_HOLDOUT_VERSION}`, () => {
  it('matches its immutable published hash', () => {
    expect(sha256Hex(canonicalJson(REQUEST_UNDERSTANDING_RELEASE_HOLDOUT)))
      .toBe(EXPECTED_RELEASE_HOLDOUT_HASH);
  });

  it('contains exactly 30 holdout-only release cases', () => {
    expect(REQUEST_UNDERSTANDING_RELEASE_HOLDOUT).toHaveLength(30);
    expect(REQUEST_UNDERSTANDING_RELEASE_HOLDOUT.every(testCase => testCase.split === 'holdout')).toBe(true);
  });

  it('meets all strict extraction and catalog release thresholds', () => {
    const metrics = evaluateRequestUnderstandingCases(
      REQUEST_UNDERSTANDING_RELEASE_HOLDOUT,
      extractStructuredEngineeringRequest
    );
    expect(metrics.operationAccuracy).toBeGreaterThanOrEqual(98);
    expect(metrics.entityPrecision).toBeGreaterThanOrEqual(95);
    expect(metrics.entityRecall).toBeGreaterThanOrEqual(95);
    expect(metrics.valueNormalizationAccuracy).toBe(100);
    expect(metrics.statusAccuracy).toBeGreaterThanOrEqual(95);
    expect(metrics.catalogValidity).toBe(100);
    expect(metrics.inventedCapabilities).toBe(0);
  });
});
