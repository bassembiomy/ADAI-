import { describe, it, expect } from 'vitest';
import { compareTrace, type ExpectedTraceStep, type ActualTraceStep } from './hilTraceComparator.js';

describe('hilTraceComparator', () => {
  it('returns passed: true when expected and actual trace match within tolerances', () => {
    const expected: ExpectedTraceStep[] = [
      { tick: 0, states: { motor: 'Idle' }, variables: { speed: 0 } },
      { tick: 1, states: { motor: 'Run' }, variables: { speed: 10 } },
    ];
    const actual: ActualTraceStep[] = [
      { tick: 0, states: { motor: 'Idle' }, variables: { speed: 0 } },
      { tick: 1, states: { motor: 'Run' }, variables: { speed: 10.0001 } },
    ];

    const comparison = compareTrace(expected, actual, { floatTolerance: 0.001 });
    expect(comparison.passed).toBe(true);
  });

  it('detects first divergence when expected state differs from physical trace', () => {
    const expected: ExpectedTraceStep[] = Array.from({ length: 20 }, (_, i) => ({
      tick: i,
      states: { motor: i >= 17 ? 'Run' : 'Idle' },
      variables: { speed: i * 5 },
    }));

    const actual: ActualTraceStep[] = Array.from({ length: 20 }, (_, i) => ({
      tick: i,
      states: { motor: 'Idle' }, // Diverges at index 17
      variables: { speed: i * 5 },
    }));

    const comparison = compareTrace(expected, actual, { floatTolerance: 0.001 });
    expect(comparison).toEqual({
      passed: false,
      firstDivergence: expect.objectContaining({
        stimulusIndex: 17,
        field: 'regions.motor',
        expected: 'Run',
        actual: 'Idle',
      }),
    });
  });
});
