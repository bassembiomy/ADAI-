import { describe, it, expect } from 'vitest';
import { REQUEST_UNDERSTANDING_CORPUS } from './requestUnderstandingCorpus';
import { extractStructuredEngineeringRequest } from '../intent/structuredRequestExtractor';
import { evaluateRequestUnderstandingCases } from './requestUnderstandingEvaluation';

const evaluateSplit = (cases: typeof REQUEST_UNDERSTANDING_CORPUS) =>
  evaluateRequestUnderstandingCases(cases, extractStructuredEngineeringRequest);

describe('Request Understanding Evaluation Corpus and Regression Harness', () => {
  it('contains at least 200 reviewed test cases with valid distribution', () => {
    expect(REQUEST_UNDERSTANDING_CORPUS.length).toBeGreaterThanOrEqual(200);

    const devCount = REQUEST_UNDERSTANDING_CORPUS.filter(c => c.split === 'dev').length;
    const valCount = REQUEST_UNDERSTANDING_CORPUS.filter(c => c.split === 'val').length;
    const holdoutCount = REQUEST_UNDERSTANDING_CORPUS.filter(c => c.split === 'holdout').length;

    const total = REQUEST_UNDERSTANDING_CORPUS.length;
    expect(devCount / total).toBeGreaterThanOrEqual(0.65);
    expect(valCount / total).toBeGreaterThanOrEqual(0.12);
    expect(holdoutCount / total).toBeGreaterThanOrEqual(0.12);
  });

  describe('Dev Split Benchmark', () => {
    const devCases = REQUEST_UNDERSTANDING_CORPUS.filter(c => c.split === 'dev');
    const metrics = evaluateSplit(devCases);

    it('achieves operation identification accuracy >= 98%', () => {
      expect(metrics.operationAccuracy).toBeGreaterThanOrEqual(98.0);
    });

    it('achieves entity identification precision >= 95% and recall >= 95%', () => {
      expect(metrics.entityPrecision).toBeGreaterThanOrEqual(95.0);
      expect(metrics.entityRecall).toBeGreaterThanOrEqual(95.0);
    });

    it('achieves 100% numeric value and unit normalization accuracy', () => {
      expect(metrics.valueNormalizationAccuracy).toBe(100);
    });

    it('has zero invented capabilities and 100% catalog validity', () => {
      expect(metrics.inventedCapabilities).toBe(0);
      expect(metrics.catalogValidity).toBe(100);
    });
  });

  describe('Validation Split Benchmark', () => {
    const valCases = REQUEST_UNDERSTANDING_CORPUS.filter(c => c.split === 'val');
    const metrics = evaluateSplit(valCases);

    it('achieves operation identification accuracy >= 98%', () => {
      expect(metrics.operationAccuracy).toBeGreaterThanOrEqual(98.0);
    });

    it('achieves entity identification precision >= 95% and recall >= 95%', () => {
      expect(metrics.entityPrecision).toBeGreaterThanOrEqual(95.0);
      expect(metrics.entityRecall).toBeGreaterThanOrEqual(95.0);
    });

    it('achieves 100% numeric value and unit normalization accuracy', () => {
      expect(metrics.valueNormalizationAccuracy).toBe(100);
    });

    it('has zero invented capabilities and 100% catalog validity', () => {
      expect(metrics.inventedCapabilities).toBe(0);
      expect(metrics.catalogValidity).toBe(100);
    });
  });

  describe('Holdout Split Benchmark', () => {
    const holdoutCases = REQUEST_UNDERSTANDING_CORPUS.filter(c => c.split === 'holdout');
    const metrics = evaluateSplit(holdoutCases);

    it('achieves operation identification accuracy >= 98%', () => {
      expect(metrics.operationAccuracy).toBeGreaterThanOrEqual(98.0);
    });

    it('achieves entity identification precision >= 95% and recall >= 95%', () => {
      expect(metrics.entityPrecision).toBeGreaterThanOrEqual(95.0);
      expect(metrics.entityRecall).toBeGreaterThanOrEqual(95.0);
    });

    it('achieves 100% numeric value and unit normalization accuracy', () => {
      expect(metrics.valueNormalizationAccuracy).toBe(100);
    });

    it('has zero invented capabilities and 100% catalog validity', () => {
      expect(metrics.inventedCapabilities).toBe(0);
      expect(metrics.catalogValidity).toBe(100);
    });
  });

  describe('Overall Corpus Metrics', () => {
    const metrics = evaluateSplit(REQUEST_UNDERSTANDING_CORPUS);

    it('meets all production thresholds across the full 210-case dataset', () => {
      expect(metrics.operationAccuracy).toBeGreaterThanOrEqual(98.0);
      expect(metrics.entityPrecision).toBeGreaterThanOrEqual(95.0);
      expect(metrics.entityRecall).toBeGreaterThanOrEqual(95.0);
      expect(metrics.valueNormalizationAccuracy).toBe(100);
      expect(metrics.inventedCapabilities).toBe(0);
      expect(metrics.catalogValidity).toBe(100);
      expect(metrics.statusAccuracy).toBeGreaterThanOrEqual(95);
    });
  });
});
