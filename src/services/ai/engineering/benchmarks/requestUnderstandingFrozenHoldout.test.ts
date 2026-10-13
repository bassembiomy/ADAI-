import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';
import { extractStructuredEngineeringRequest } from '../intent/structuredRequestExtractor';
import { evaluateRequestUnderstandingCases } from './requestUnderstandingEvaluation';
import {
  FROZEN_HOLDOUT_VERSION,
  REQUEST_UNDERSTANDING_FROZEN_HOLDOUT
} from './requestUnderstandingFrozenHoldout';

const EXPECTED_HOLDOUT_HASH = 'a9db9bbb913fb84c89c86c5a8bd555f74a3f4ca6ebd5e5df39f1dda698c849f1';

describe(`frozen request-understanding holdout ${FROZEN_HOLDOUT_VERSION}`, () => {
  it('is immutable after baseline publication', () => {
    expect(sha256Hex(canonicalJson(REQUEST_UNDERSTANDING_FROZEN_HOLDOUT)))
      .toBe(EXPECTED_HOLDOUT_HASH);
  });

  it('contains 30 release cases outside development and validation splits', () => {
    expect(REQUEST_UNDERSTANDING_FROZEN_HOLDOUT).toHaveLength(30);
    expect(REQUEST_UNDERSTANDING_FROZEN_HOLDOUT.every(testCase => testCase.split === 'holdout')).toBe(true);
  });

  it('meets strict release thresholds without invented capabilities', () => {
    const metrics = evaluateRequestUnderstandingCases(REQUEST_UNDERSTANDING_FROZEN_HOLDOUT, extractStructuredEngineeringRequest);
    expect(metrics.operationAccuracy).toBeGreaterThanOrEqual(98);
    expect(metrics.entityPrecision).toBeGreaterThanOrEqual(95);
    expect(metrics.entityRecall).toBeGreaterThanOrEqual(95);
    expect(metrics.valueNormalizationAccuracy).toBe(100);
    expect(metrics.statusAccuracy).toBeGreaterThanOrEqual(95);
    expect(metrics.catalogValidity).toBe(100);
    expect(metrics.inventedCapabilities).toBe(0);
  });
});
