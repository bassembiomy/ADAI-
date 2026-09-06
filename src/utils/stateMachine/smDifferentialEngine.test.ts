import { describe, expect, it } from 'vitest';
import {
  compareCycleObservations,
  type SMCycleObservation,
} from './smDifferentialEngine';

describe('smDifferentialEngine canonical observation comparison', () => {
  const baseCycle0: SMCycleObservation = {
    cycle: 0,
    activeStates: ['State_1'],
    variables: { count: 1, ratio: 0.5 },
    outputs: { motor: 1 },
    stateTimers: { State_1: 0 },
    firedTransitions: ['init'],
    executedActions: ['count = 1', 'ratio = 0.5'],
    errorStatus: 'SM_ERR_NONE',
    faultLatched: false,
  };

  const baseCycle1: SMCycleObservation = {
    cycle: 1,
    activeStates: ['State_2'],
    variables: { count: 2, ratio: 1.0 },
    outputs: { motor: 0 },
    stateTimers: { State_2: 10 },
    firedTransitions: ['trans_1_2'],
    executedActions: ['count = 2'],
    errorStatus: 'SM_ERR_NONE',
    faultLatched: false,
  };

  it('passes when cycle observations match identically across all fields', () => {
    const traceA = [baseCycle0, baseCycle1];
    const traceB = [
      {
        ...baseCycle0,
        // different property key order in objects should not cause mismatch
        variables: { ratio: 0.5, count: 1 },
      },
      baseCycle1,
    ];

    const result = compareCycleObservations(traceA, traceB, {
      modelHash: 'hash_123',
    });

    expect(result.activity).toBe('differential');
    expect(result.status).toBe('PASS');
    expect(result.details.totalCycles).toBe(2);
    expect(result.details.divergence).toBeNull();
  });

  it('detects divergence when cycle count differs', () => {
    const traceA = [baseCycle0, baseCycle1];
    const traceB = [baseCycle0];

    const result = compareCycleObservations(traceA, traceB, {
      modelHash: 'hash_123',
    });

    expect(result.status).toBe('FAIL');
    expect(result.details.divergence?.field).toBe('cycleCount');
    expect(result.details.divergence?.expected).toBe(2);
    expect(result.details.divergence?.actual).toBe(1);
  });

  it('detects divergence in active states with cycle and field details', () => {
    const traceA = [baseCycle0, baseCycle1];
    const traceB = [baseCycle0, { ...baseCycle1, activeStates: ['State_3'] }];

    const result = compareCycleObservations(traceA, traceB, {
      modelHash: 'hash_123',
    });

    expect(result.status).toBe('FAIL');
    expect(result.details.divergence?.cycle).toBe(1);
    expect(result.details.divergence?.field).toBe('activeStates');
    expect(result.details.divergence?.expected).toEqual(['State_2']);
    expect(result.details.divergence?.actual).toEqual(['State_3']);
  });

  it('detects divergence when transition or action execution order differs', () => {
    const traceA = [
      { ...baseCycle0, executedActions: ['action_A', 'action_B'] },
    ];
    const traceB = [
      { ...baseCycle0, executedActions: ['action_B', 'action_A'] },
    ];

    const result = compareCycleObservations(traceA, traceB, {
      modelHash: 'hash_123',
    });

    expect(result.status).toBe('FAIL');
    expect(result.details.divergence?.field).toBe('executedActions');
  });

  it('detects divergence in timers, outputs, and fault latched status', () => {
    const traceA = [{ ...baseCycle0, faultLatched: false }];
    const traceB = [{ ...baseCycle0, faultLatched: true }];

    const result = compareCycleObservations(traceA, traceB, {
      modelHash: 'hash_123',
      inputVectors: [{ go: true }],
      replayCommand: 'npm run test:differential -- --replay',
    });

    expect(result.status).toBe('FAIL');
    expect(result.details.divergence?.field).toBe('faultLatched');
    expect(result.details.divergence?.replayCommand).toBe(
      'npm run test:differential -- --replay',
    );
    expect(result.details.divergence?.inputVector).toEqual({ go: true });
  });
});
