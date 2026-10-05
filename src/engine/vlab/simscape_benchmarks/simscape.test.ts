import { describe, it, expect } from 'vitest';
import { listCases, loadCase, loadGolden, runCase } from './runCase';
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
          const grid = Array.from({ length: Math.round(spec.stopTime / 0.001) + 1 }, (_, i) => i * 0.001);
          const sim = runCase(id, grid);
          const { final, tau } = spec.analytic!;
          const ref = grid.map((t) => final * (1 - Math.exp(-t / tau)));
          const name = spec.signals[0].name;
          const m = computeMetrics(grid, sim[name], ref);
          const fails = checkTolerance(spec.class, m);
          expect(fails, formatMetricTable(`${name} vs analytic`, m)).toEqual([]);

          if (golden) {
            const gm = computeMetrics(golden.time, golden.signals[name], resample(grid, ref, golden.time));
            expect(checkTolerance(spec.class, gm), formatMetricTable(`${name} golden vs analytic`, gm)).toEqual([]);
          }
        });
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
      if (golden) it('matches Simscape golden', body);
      else it.skip(`matches Simscape golden (SKIPPED: golden/${id}.csv missing, golden-import mode; run benchmarks/simscape/run_all.m on a licensed machine)`, body);
    });
  }
});
