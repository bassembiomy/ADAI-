import { describe, expect, it } from 'vitest';
import { runReferenceInterpreter, type SMTraceStep } from './smReferenceInterpreter';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';

describe('smReferenceInterpreter', () => {
  it('selects highest-priority enabled transition based on guard evaluation (Milestone 7C)', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const trace = runReferenceInterpreter(ir!, [{ tick: 1, deltaMs: 100, inputs: { speed: 120 }, events: [] }]);

    expect(trace.length).toBe(1);
    expect(trace[0].tick).toBe(1);
    expect(trace[0].activeStates).toBeDefined();
    expect(trace[0].transitionIds).toBeDefined();
    expect(trace[0].error).toBe('SM_ERR_NONE');
  });
});
