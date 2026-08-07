import { describe, expect, it } from 'vitest';
import { compareTraces } from './smDifferentialEngine';
import type { SMTraceStep } from './smReferenceInterpreter';

describe('smDifferentialEngine', () => {
  const sampleTrace: SMTraceStep[] = [{
    tick: 1,
    activeStates: ['SM_ST_IDLE'],
    transitionIds: ['T1'],
    exitActions: [],
    transitionActions: [],
    entryActions: [],
    consumedEvents: [],
    emittedEvents: [],
    variables: {},
    timers: {},
    error: 'SM_ERR_NONE'
  }];

  const context = { modelHash: '9f8a', generatorVersion: '3.1', seed: 42, vectors: [{ tick: 1 }] };

  it('passes when reference and generated traces match exactly across all fields', () => {
    const result = compareTraces(sampleTrace, sampleTrace, context);
    expect(result.behavioralGenerationStatus).toBe('PASS');
    expect(result.firstDivergence).toBeNull();
  });

  it('fails on tick alignment mismatch', () => {
    const badTickTrace: SMTraceStep[] = [{ ...sampleTrace[0], tick: 2 }];
    const result = compareTraces(sampleTrace, badTickTrace, context);
    expect(result.behavioralGenerationStatus).toBe('FAIL');
    expect(result.firstDivergence?.field).toBe('tick');
  });

  it('detects field divergence and includes vector history in replay JSON (negative test)', () => {
    const mismatchedTrace: SMTraceStep[] = [{
      ...sampleTrace[0],
      transitionIds: ['T2_WRONG']
    }];

    const result = compareTraces(sampleTrace, mismatchedTrace, context);
    expect(result.behavioralGenerationStatus).toBe('FAIL');
    expect(result.firstDivergence?.tick).toBe(1);
    expect(result.firstDivergence?.field).toBe('transitionIds');
    expect(result.replayVectorJson).toContain('"vectors"');
    expect(result.replayVectorJson).toContain('"seed": 42');
  });
});
