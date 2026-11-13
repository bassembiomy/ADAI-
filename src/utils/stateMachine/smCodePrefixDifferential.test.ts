import { describe, expect, it } from 'vitest';
import type { DifferentialFixture } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { buildRandomChart, RANDOM_INPUT_EVENTS, randomStimulus } from './smRandomChartFixture';

/* Random charts generated with a non-default code prefix still equal the simulation tick by tick. */
describe('code prefix: random charts with prefix MOTOR', () => {
  it('generated C equals the simulation on 10 charts', () => {
    const features = { innerTransitions: true, arithmetic: true, events: true };
    const failures: string[] = [];
    let compared = 0;
    for (let seed = 7_001; compared < 10 && seed < 7_100; seed += 1) {
      const model = buildRandomChart(seed, features);
      model.codePrefix = 'MOTOR';
      const built = buildSemanticModel(model);
      if (!built.ir || built.diagnostics.some((item) => item.severity === 'error')) continue;
      compared += 1;
      const fixture: DifferentialFixture = { name: 'flat-priority', model, steps: randomStimulus(seed, 120, RANDOM_INPUT_EVENTS) };
      const difference = compareSemanticTraces(runInterpreterTrace(fixture), compileAndRunCTrace(fixture));
      if (difference !== null) failures.push(`seed=${seed}: divergence at frame ${difference.index}`);
    }
    expect(compared).toBe(10);
    expect(failures).toEqual([]);
  }, 600_000);
});
