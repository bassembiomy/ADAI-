import { describe, expect, it } from 'vitest';
import { flatOrFixture, type DifferentialFixture } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';

/*
 * Fast chart ticks (1 ms, 2 ms): the tick window SM_TICK_MIN_MS..SM_TICK_MAX_MS can have a lower
 * bound of 0 ms. The generated C must still compile under -Wall -Wextra -Werror (no comparison of
 * an unsigned delta with 0) and behave like the simulation, including the fault on a late tick.
 */
describe('fast chart ticks', () => {
  for (const tickMs of [1, 2]) {
    it(`${tickMs} ms tick compiles strictly and matches the simulation`, () => {
      const model = flatOrFixture();
      model.tickMs = tickMs;
      model.transitions = [{ ...model.transitions[0], condition: '', type: 'after', afterTicks: 3, action: '' }] as never;
      const fixture: DifferentialFixture = {
        name: 'timing-jitter-normalized',
        model,
        steps: [
          { kind: 'step', elapsedMs: tickMs }, { kind: 'step', elapsedMs: tickMs - 1 }, { kind: 'step', elapsedMs: tickMs },
          { kind: 'step', elapsedMs: tickMs }, { kind: 'step', elapsedMs: tickMs + 5 },
        ],
      };
      const expected = runInterpreterTrace(fixture);
      expect(compareSemanticTraces(expected, compileAndRunCTrace(fixture))).toBeNull();
      expect(expected[4].activeStateIds).toEqual(['b']);
      expect(expected[5].error).toMatch(/^TIMING/);
    }, 120_000);
  }
});
