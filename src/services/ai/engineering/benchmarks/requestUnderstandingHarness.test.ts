import { describe, it, expect } from 'vitest';
import { REQUEST_UNDERSTANDING_CORPUS, RequestUnderstandingTestCase } from './requestUnderstandingCorpus';
import { extractStructuredEngineeringRequest } from '../intent/structuredRequestExtractor';
import { buildXbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';

interface SplitEvaluationMetrics {
  totalCases: number;
  operationMatches: number;
  operationAccuracy: number;
  totalExpectedEntities: number;
  totalExtractedEntities: number;
  truePositiveEntities: number;
  entityPrecision: number;
  entityRecall: number;
  totalValueChecks: number;
  matchedValueChecks: number;
  valueNormalizationAccuracy: number;
  hallucinatedBlocks: number;
  statusMatches: number;
  statusAccuracy: number;
}

function evaluateSplit(cases: RequestUnderstandingTestCase[]): SplitEvaluationMetrics {
  let operationMatches = 0;
  let totalExpectedEntities = 0;
  let totalExtractedEntities = 0;
  let truePositiveEntities = 0;
  let totalValueChecks = 0;
  let matchedValueChecks = 0;
  let hallucinatedBlocks = 0;
  let statusMatches = 0;

  const validCatalogBlocks = new Set([
    ...Array.from(buildXbridgesCapabilityIndex().blocks.values()).map(b => b.type),
    'Constant', 'Sum', 'VectorMul', 'TRANSFER_FUNCTION', 'PID_CONTROLLER', 'Scope'
  ]);

  for (const testCase of cases) {
    const result = extractStructuredEngineeringRequest(testCase.input);

    // Status match
    if (result.status === testCase.expectedStatus) {
      statusMatches++;
    }

    const req = result.request;

    // Operation check
    if (req) {
      const allOpsMatched = testCase.expectedOperations.every(expOp =>
        req.operations.includes(expOp)
      );
      if (allOpsMatched) {
        operationMatches++;
      }
    } else if (testCase.expectedOperations.length === 0) {
      operationMatches++;
    }

    // Entity check (distinct entity types recognized)
    const expectedSet = new Set(testCase.expectedEntityTypes);
    totalExpectedEntities += expectedSet.size;

    if (req) {
      const extractedEntityTypes = req.entities.map(e => e.groundedBlockType || e.semanticType);
      const extractedSet = new Set(extractedEntityTypes);
      totalExtractedEntities += extractedSet.size;

      // Check hallucinated blocks
      for (const ent of req.entities) {
        const typeToCheck = ent.groundedBlockType || ent.semanticType;
        if (!validCatalogBlocks.has(typeToCheck)) {
          hallucinatedBlocks++;
        }
      }

      // Count TP matches
      for (const expType of expectedSet) {
        if (extractedSet.has(expType)) {
          truePositiveEntities++;
        }
      }
    }

    // Value normalization check
    if (testCase.expectedValues && testCase.expectedValues.length > 0) {
      for (const expVal of testCase.expectedValues) {
        totalValueChecks++;
        if (req) {
          const matchFound = req.values.some(v => {
            const valMatch = JSON.stringify(v.normalizedValue) === JSON.stringify(expVal.normalizedValue);
            const unitMatch = expVal.unit === undefined || v.unit === expVal.unit;
            return valMatch && unitMatch;
          });
          if (matchFound) {
            matchedValueChecks++;
          }
        }
      }
    }
  }

  const operationAccuracy = cases.length > 0 ? (operationMatches / cases.length) * 100 : 100;
  const entityPrecision = totalExtractedEntities > 0 ? (truePositiveEntities / totalExtractedEntities) * 100 : 100;
  const entityRecall = totalExpectedEntities > 0 ? (truePositiveEntities / totalExpectedEntities) * 100 : 100;
  const valueNormalizationAccuracy = totalValueChecks > 0 ? (matchedValueChecks / totalValueChecks) * 100 : 100;
  const statusAccuracy = cases.length > 0 ? (statusMatches / cases.length) * 100 : 100;

  return {
    totalCases: cases.length,
    operationMatches,
    operationAccuracy,
    totalExpectedEntities,
    totalExtractedEntities,
    truePositiveEntities,
    entityPrecision,
    entityRecall,
    totalValueChecks,
    matchedValueChecks,
    valueNormalizationAccuracy,
    hallucinatedBlocks,
    statusMatches,
    statusAccuracy
  };
}

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

    it('has zero hallucinated blocks', () => {
      expect(metrics.hallucinatedBlocks).toBe(0);
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

    it('has zero hallucinated blocks', () => {
      expect(metrics.hallucinatedBlocks).toBe(0);
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

    it('has zero hallucinated blocks', () => {
      expect(metrics.hallucinatedBlocks).toBe(0);
    });
  });

  describe('Overall Corpus Metrics', () => {
    const metrics = evaluateSplit(REQUEST_UNDERSTANDING_CORPUS);

    it('meets all production thresholds across the full 210-case dataset', () => {
      expect(metrics.operationAccuracy).toBeGreaterThanOrEqual(98.0);
      expect(metrics.entityPrecision).toBeGreaterThanOrEqual(95.0);
      expect(metrics.entityRecall).toBeGreaterThanOrEqual(95.0);
      expect(metrics.valueNormalizationAccuracy).toBe(100);
      expect(metrics.hallucinatedBlocks).toBe(0);
    });
  });
});
