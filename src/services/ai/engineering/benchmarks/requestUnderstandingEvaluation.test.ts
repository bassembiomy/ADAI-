import { describe, expect, it } from 'vitest';
import { evaluateRequestUnderstandingCases } from './requestUnderstandingEvaluation';
import type { RequestUnderstandingTestCase } from './requestUnderstandingCorpus';

const baseCase: RequestUnderstandingTestCase = {
  id: 'strict-1',
  input: 'Add 10 and 20',
  category: 'arithmetic',
  split: 'dev',
  expectedOperations: ['add'],
  expectedEntityTypes: ['Constant', 'Constant', 'Sum'],
  expectedStatus: 'ready'
};

describe('strict request-understanding evaluation', () => {
  it('rejects unexpected extra operations', () => {
    const metrics = evaluateRequestUnderstandingCases([baseCase], () => ({
      status: 'ready',
      request: {
        operations: ['add', 'multiply'],
        entities: [],
        values: []
      }
    } as any));
    expect(metrics.operationAccuracy).toBe(0);
  });

  it('counts entity multiplicity instead of collapsing entity types', () => {
    const metrics = evaluateRequestUnderstandingCases([baseCase], () => ({
      status: 'ready',
      request: {
        operations: ['add'],
        entities: [
          { semanticType: 'Constant', catalogBlockId: 'Constant' },
          { semanticType: 'Sum', catalogBlockId: 'Sum' }
        ],
        values: []
      }
    } as any));
    expect(metrics.entityRecall).toBeCloseTo(66.666, 2);
  });

  it('marks an entity without verified catalog resolution as invented', () => {
    const metrics = evaluateRequestUnderstandingCases([
      { ...baseCase, expectedEntityTypes: ['Sum'] }
    ], () => ({
      status: 'ready',
      request: {
        operations: ['add'],
        entities: [{ semanticType: 'Sum' }],
        values: []
      }
    } as any));
    expect(metrics.inventedCapabilities).toBe(1);
    expect(metrics.catalogValidity).toBe(0);
  });

  it('does not score operations for unsupported requests that have no structured request', () => {
    const metrics = evaluateRequestUnderstandingCases([
      { ...baseCase, expectedStatus: 'unsupported', expectedOperations: ['create'], expectedEntityTypes: [] }
    ], () => ({ status: 'unsupported', reason: 'outside supported domain' } as any));
    expect(metrics.operationAccuracy).toBe(100);
    expect(metrics.operationMatches).toBe(0);
  });
});
