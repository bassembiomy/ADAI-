import { describe, expect, it } from 'vitest';
import type { DifferentialFixture } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { buildRandomChart, randomStimulus, type RandomChartFeatures } from './smRandomChartFixture';

/*
 * Random-chart differential test: the generated C must reproduce the simulation on every
 * tick (active states, variables, action order, timers, history, errors) for randomly
 * generated charts with nested OR/AND states, shallow and deep history, junctions,
 * temporal and combined guards, cross-level, inner and self transitions, and typed
 * arithmetic that saturates.
 *
 * Deterministic: each chart is built from a seed. A failure message names the group and
 * seed so the chart can be rebuilt with `buildRandomChart(seed, features)`.
 * Scale with ADIA_RANDOM_CHARTS (charts per group, default 40) and ADIA_RANDOM_TICKS
 * (ticks per chart, default 250).
 */

const CHARTS = Number(process.env.ADIA_RANDOM_CHARTS ?? 40);
const TICKS = Number(process.env.ADIA_RANDOM_TICKS ?? 250);

const groups: Array<[string, RandomChartFeatures, number]> = [
  ['hierarchy-history-junctions', { innerTransitions: false, arithmetic: false }, 1_000],
  ['with-inner-transitions', { innerTransitions: true, arithmetic: false }, 2_000],
  ['with-typed-arithmetic', { innerTransitions: false, arithmetic: true }, 3_000],
  ['everything', { innerTransitions: true, arithmetic: true }, 4_000],
];

describe('random charts: generated C equals the simulation on every tick', () => {
  for (const [group, features, base] of groups) {
    it(`${group} (${CHARTS} charts x ${TICKS} ticks)`, () => {
      const failures: string[] = [];
      let compared = 0;
      let seed = base;
      let attempts = 0;
      while (compared < CHARTS && attempts < CHARTS * 5) {
        attempts += 1;
        seed += 1;
        const model = buildRandomChart(seed, features);
        const built = buildSemanticModel(model);
        if (!built.ir || built.diagnostics.some((item) => item.severity === 'error')) continue;
        compared += 1;
        const fixture: DifferentialFixture = { name: 'flat-priority', model, steps: randomStimulus(seed, TICKS) };
        try {
          const difference = compareSemanticTraces(runInterpreterTrace(fixture), compileAndRunCTrace(fixture));
          if (difference !== null) {
            failures.push(`${group} seed=${seed}: first divergence at frame ${difference.index}: `
              + `sim=${JSON.stringify(difference.expected?.activeStateIds)} ${difference.expected?.error ?? ''} `
              + `c=${JSON.stringify(difference.actual?.activeStateIds)} ${difference.actual?.error ?? ''}`);
          }
        } catch (error) {
          failures.push(`${group} seed=${seed}: ${(error as Error).message.split('\n').slice(0, 3).join(' | ')}`);
        }
      }
      expect(compared, 'enough valid random charts were generated').toBe(CHARTS);
      expect(failures).toEqual([]);
    }, 900_000);
  }
});
