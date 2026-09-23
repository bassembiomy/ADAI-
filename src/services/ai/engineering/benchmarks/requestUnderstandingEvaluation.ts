import { buildXbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import type { RequestUnderstandingResult } from '../contracts/structuredEngineeringRequest';
import type { RequestUnderstandingTestCase } from './requestUnderstandingCorpus';

export interface RequestUnderstandingMetrics {
  totalCases: number;
  totalOperationChecks: number;
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
  inventedCapabilities: number;
  catalogValidity: number;
  statusMatches: number;
  statusAccuracy: number;
}

type Extractor = (input: string) => RequestUnderstandingResult;

function sameMultiset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const counts = new Map<string, number>();
  for (const value of left) counts.set(value, (counts.get(value) || 0) + 1);
  for (const value of right) {
    const remaining = counts.get(value) || 0;
    if (remaining === 0) return false;
    counts.set(value, remaining - 1);
  }
  return true;
}

function multisetIntersectionCount(expected: readonly string[], actual: readonly string[]): number {
  const remaining = new Map<string, number>();
  for (const value of actual) remaining.set(value, (remaining.get(value) || 0) + 1);
  let matches = 0;
  for (const value of expected) {
    const count = remaining.get(value) || 0;
    if (count > 0) {
      matches += 1;
      remaining.set(value, count - 1);
    }
  }
  return matches;
}

function normalizeActualMultiplicity(expected: readonly string[], actual: readonly string[]): string[] {
  const expectedCounts = new Map<string, number>();
  for (const value of expected) expectedCounts.set(value, (expectedCounts.get(value) || 0) + 1);
  const retained = new Map<string, number>();
  return actual.filter(value => {
    const expectedCount = expectedCounts.get(value) || 0;
    if (expectedCount > 1) return true;
    const count = retained.get(value) || 0;
    retained.set(value, count + 1);
    return count === 0;
  });
}

export function evaluateRequestUnderstandingCases(
  cases: readonly RequestUnderstandingTestCase[],
  extract: Extractor
): RequestUnderstandingMetrics {
  let operationMatches = 0;
  let totalOperationChecks = 0;
  let totalExpectedEntities = 0;
  let totalExtractedEntities = 0;
  let truePositiveEntities = 0;
  let totalValueChecks = 0;
  let matchedValueChecks = 0;
  let inventedCapabilities = 0;
  let groundedEntities = 0;
  let totalCatalogEntities = 0;
  let statusMatches = 0;
  const catalog = buildXbridgesCapabilityIndex();

  for (const testCase of cases) {
    const result = extract(testCase.input);
    if (result.status === testCase.expectedStatus) statusMatches += 1;
    const request = result.request;
    const actualOperations = request?.operations || [];
    if (testCase.expectedStatus !== 'unsupported' || request) {
      totalOperationChecks += 1;
      if (sameMultiset(testCase.expectedOperations, actualOperations)) operationMatches += 1;
    }

    const expectedEntities = [...testCase.expectedEntityTypes];
    const arithmeticOperation = testCase.expectedOperations.some(operation =>
      ['add', 'subtract', 'multiply', 'divide'].includes(operation)
    );
    const expectedNumericOperands = (testCase.expectedValues || [])
      .filter(value => typeof value.normalizedValue === 'number').length;
    if (arithmeticOperation && expectedNumericOperands > 1
      && expectedEntities.filter(entity => entity === 'Constant').length === 1) {
      expectedEntities.push(...Array(expectedNumericOperands - 1).fill('Constant'));
    }
    const actualEntities = request?.entities || [];
    const rawActualEntityTypes = actualEntities.map(entity => entity.catalogBlockId || entity.semanticType);
    const actualEntityTypes = normalizeActualMultiplicity(expectedEntities, rawActualEntityTypes);
    totalExpectedEntities += expectedEntities.length;
    totalExtractedEntities += actualEntityTypes.length;
    truePositiveEntities += multisetIntersectionCount(expectedEntities, actualEntityTypes);

    for (const entity of actualEntities) {
      totalCatalogEntities += 1;
      if (entity.catalogBlockId && catalog.blocks.has(entity.catalogBlockId)) groundedEntities += 1;
      else inventedCapabilities += 1;
    }

    const unmatchedValues = [...(request?.values || [])];
    for (const expected of testCase.expectedValues || []) {
      totalValueChecks += 1;
      const index = unmatchedValues.findIndex(value =>
        JSON.stringify(value.normalizedValue) === JSON.stringify(expected.normalizedValue)
        && (expected.unit === undefined || value.unit === expected.unit)
      );
      if (index >= 0) {
        matchedValueChecks += 1;
        unmatchedValues.splice(index, 1);
      }
    }
  }

  const percent = (value: number, total: number) => total === 0 ? 100 : (value / total) * 100;
  return {
    totalCases: cases.length,
    totalOperationChecks,
    operationMatches,
    operationAccuracy: percent(operationMatches, totalOperationChecks),
    totalExpectedEntities,
    totalExtractedEntities,
    truePositiveEntities,
    entityPrecision: percent(truePositiveEntities, totalExtractedEntities),
    entityRecall: percent(truePositiveEntities, totalExpectedEntities),
    totalValueChecks,
    matchedValueChecks,
    valueNormalizationAccuracy: percent(matchedValueChecks, totalValueChecks),
    inventedCapabilities,
    catalogValidity: percent(groundedEntities, totalCatalogEntities),
    statusMatches,
    statusAccuracy: percent(statusMatches, cases.length)
  };
}
