import { describe, expect, it } from 'vitest';
import type { DifferentialFixture } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { buildRandomChart, RANDOM_INPUT_EVENTS, randomChartExtraSources, randomStimulus, type RandomChartFeatures } from './smRandomChartFixture';

/*
 * Random-chart differential test: the generated C must reproduce the simulation on every
 * tick (active states, variables, action order, timers, history, errors) for randomly
 * generated charts with nested OR/AND states, shallow and deep history, junctions,
 * temporal and combined guards, cross-level, inner and self transitions, and typed
 * arithmetic that saturates; the 'with-fixed-point' group adds fixdt variables (all word lengths, signed
 * and unsigned, both rounding modes); the 'with-events' group adds input and local events
 * (event-triggered transitions, send() actions, event queue overflow); the 'with-xbridges' group turns
 * leaf states into X-Bridges states (random memory and fault policies, inputs read from and outputs
 * written to chart variables that guards read), the 'with-external-functions' group calls two hand-written C
 * functions from actions and guards (their C implementation is compiled in as an extra source), compared exactly like the other groups.
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
  ['with-events', { innerTransitions: true, arithmetic: true, events: true }, 5_000],
  ['with-fixed-point', { innerTransitions: true, arithmetic: true, fixedPoint: true }, 6_000],
  ['with-xbridges', { innerTransitions: true, arithmetic: true, events: true, xBridges: true }, 6_000],
  ['with-external-functions', { innerTransitions: true, arithmetic: true, events: true, externalFunctions: true }, 7_000],
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
        const fixture: DifferentialFixture = { name: 'flat-priority', model, steps: randomStimulus(seed, TICKS, features.events ? RANDOM_INPUT_EVENTS : undefined), extraSources: randomChartExtraSources(seed, features) };
        try {
          const difference = compareSemanticTraces(runInterpreterTrace(fixture), compileAndRunCTrace(fixture));
          if (difference !== null) {
            const expectedFrame = difference.expected as unknown as Record<string, unknown> | null;
            const actualFrame = difference.actual as unknown as Record<string, unknown> | null;
            const differing = Object.keys(expectedFrame ?? {})
              .filter((key) => JSON.stringify(expectedFrame?.[key]) !== JSON.stringify(actualFrame?.[key]));
            failures.push(`${group} seed=${seed}: first divergence at frame ${difference.index} (${differing.join(',')}): `
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
