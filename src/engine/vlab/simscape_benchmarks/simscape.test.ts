import { describe, it, expect } from 'vitest';
import { analyticValue, listCases, loadCase, loadGolden, runCase } from './runCase';
import { computeMetrics, formatMetricTable, resample } from './metrics';
import { checkTolerance } from './tolerances';

const cases = listCases();

describe('Simscape benchmark cases', () => {
  it('discovers at least one case', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const id of cases) {
    const spec = loadCase(id);
    const golden = loadGolden(id);

    describe(id, () => {
      if (spec.analytic) {
        it('V-Lab matches analytic solution (sanity check on golden)', () => {
          const step = spec.dt ?? 0.001;
          const grid = Array.from({ length: Math.round(spec.stopTime / step) + 1 }, (_, i) => i * step);
          const sim = runCase(id, grid);
          const ref = grid.map((t) => analyticValue(spec.analytic!, t));
          const name = spec.signals[0].name;
          const m = computeMetrics(grid, sim[name], ref);
          const fails = checkTolerance(spec.class, m);
          expect(fails, formatMetricTable(`${name} vs analytic`, m)).toEqual([]);

          if (golden) {
            const gm = computeMetrics(golden.time, golden.signals[name], resample(grid, ref, golden.time));
            expect(checkTolerance(spec.class, gm), formatMetricTable(`${name} golden vs analytic`, gm)).toEqual([]);
          }
        }, 60000);
      }

      const body = () => {
        const g = golden!;
        const sim = runCase(id, g.time);
        for (const s of spec.signals) {
          const m = computeMetrics(g.time, sim[s.name], g.signals[s.name]);
          const fails = checkTolerance(spec.class, m);
          expect(fails, formatMetricTable(s.name, m)).toEqual([]);
        }
      };
      if (golden) it('matches Simscape golden', body, 60000);
      else it.skip(`matches Simscape golden (SKIPPED: golden/${id}.csv missing, golden-import mode; run benchmarks/simscape/run_all.m on a licensed machine)`, body);
    });
  }
});
