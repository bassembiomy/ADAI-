// WP-18a acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §7.6
import { describe, expect, it } from 'vitest';
import { aggregateRequirementVerdicts, evaluateAssertion, type SimSeries } from './simTemporal';
import type { SimAssertion } from './simScenario';

const STEP = 0.1;
/** Series with times k*STEP (deliberately not rounded: 0.1*3 = 0.30000000000000004). */
const series = (values: Record<string, (number | null)[]>): SimSeries => {
  const n = Object.values(values)[0].length;
  return { times: Array.from({ length: n }, (_, k) => k * STEP), values };
};
const a = (over: Partial<SimAssertion>): SimAssertion => ({ id: 'a1', requirementId: 'req1', condition: 'x == 1', temporal: { kind: 'eventually' }, ...over });
const DUR = (s: SimSeries) => s.times[s.times.length - 1];

describe('eventually', () => {
  it('passes at the first sample where the condition holds (the user case x == 1)', () => {
    const s = series({ x: [0, 0, 1, 0, 1] });
    const r = evaluateAssertion(a({}), s, DUR(s));
    expect(r.verdict).toBe('passed');
    expect(r.at?.t).toBeCloseTo(0.2, 12);
    expect(r.at?.values).toEqual({ x: 1 });
    expect(r.samplesChecked).toBe(3);
  });

  it('fails at the last window sample when the condition never holds', () => {
    const s = series({ x: [0, 0, 0, 0] });
    const r = evaluateAssertion(a({ temporal: { kind: 'eventually', window: [0, 0.2] } }), s, DUR(s));
    expect(r.verdict).toBe('failed');
    expect(r.at?.t).toBeCloseTo(0.2, 12);
    expect(r.samplesChecked).toBe(3);
  });

  it('keeps the k*step boundary sample inside the window', () => {
    const s = series({ x: [0, 0, 0, 1, 0] });
    expect(evaluateAssertion(a({ temporal: { kind: 'eventually', window: [0, 0.3] } }), s, DUR(s)).verdict).toBe('passed');
    expect(evaluateAssertion(a({ temporal: { kind: 'eventually', window: [0.3, 0.3] } }), s, DUR(s)).verdict).toBe('passed');
  });
});

describe('always and never', () => {
  it('always fails at the first false sample of its window and ignores samples outside it', () => {
    const s = series({ x: [0, 1, 1, 0, 1] });
    expect(evaluateAssertion(a({ temporal: { kind: 'always', window: [0.1, 0.2] } }), s, DUR(s)).verdict).toBe('passed');
    const r = evaluateAssertion(a({ temporal: { kind: 'always', window: [0.1, 0.4] } }), s, DUR(s));
    expect(r.verdict).toBe('failed');
    expect(r.at?.t).toBeCloseTo(0.3, 12);
  });

  it('never fails at the first true sample', () => {
    const s = series({ p: [10, 50, 101, 99] });
    const r = evaluateAssertion(a({ condition: 'p > 100', temporal: { kind: 'never' } }), s, DUR(s));
    expect(r.verdict).toBe('failed');
    expect(r.at).toEqual({ t: s.times[2], values: { p: 101 } });
    expect(evaluateAssertion(a({ condition: 'p > 200', temporal: { kind: 'never' } }), s, DUR(s)).verdict).toBe('passed');
  });

  it('fails on a non-finite value instead of treating it as false', () => {
    const s = series({ x: [1, Number.NaN, 1] });
    // Each condition is fine at t = 0, so the first decision is made at the NaN sample (t = 0.1).
    const cases = [['always', 'x > 0'], ['never', 'x > 5'], ['eventually', 'x > 5']] as const;
    for (const [kind, condition] of cases) {
      const r = evaluateAssertion(a({ condition, temporal: { kind } }), s, DUR(s));
      expect(r.verdict).toBe('failed');
      expect(r.reason).toMatch(/non-finite/);
      expect(r.at?.t).toBeCloseTo(0.1, 12);
    }
  });
});

describe('samples where an alias has no value (V-Lab at t = 0) are skipped, not guessed', () => {
  it('skips t = 0 when one alias is null there', () => {
    const s = series({ x: [1, 1, 1], y: [null, 0, 0] });
    const r = evaluateAssertion(a({ condition: 'x == 1 && y == 0', temporal: { kind: 'always' } }), s, DUR(s));
    expect(r.verdict).toBe('passed');
    expect(r.samplesChecked).toBe(2);
  });

  it('is inconclusive when no sample of the window has every value', () => {
    const s = series({ y: [null, 0, 0] });
    const r = evaluateAssertion(a({ condition: 'y == 0', temporal: { kind: 'always', window: [0, 0] } }), s, DUR(s));
    expect(r.verdict).toBe('inconclusive');
    expect(r.samplesChecked).toBe(0);
  });
});

describe('response', () => {
  const resp = (within: number, window?: [number, number]): SimAssertion =>
    a({ condition: 'off == 1', temporal: { kind: 'response', trigger: 'hot == 1', within, ...(window ? { window } : {}) } });

  it('passes when every rising edge is answered within the deadline', () => {
    //          t: 0  .1 .2 .3 .4 .5 .6 .7 .8 .9
    const s = series({
      hot: [0, 1, 1, 0, 0, 1, 0, 0, 0, 0],
      off: [0, 0, 1, 1, 0, 0, 0, 1, 1, 1],
    });
    const r = evaluateAssertion(resp(0.2), s, DUR(s));
    expect(r.verdict).toBe('passed');
  });

  it('counts the answer at exactly t_edge + within (k*step boundary)', () => {
    const s = series({ hot: [0, 1, 0, 0, 0], off: [0, 0, 0, 1, 0] });
    expect(evaluateAssertion(resp(0.2), s, DUR(s)).verdict).toBe('passed');
  });

  it('fails at the last sample before the missed deadline', () => {
    const s = series({ hot: [0, 1, 0, 0, 0, 0, 0], off: [0, 0, 0, 0, 1, 1, 1] });
    const r = evaluateAssertion(resp(0.2), s, DUR(s));
    expect(r.verdict).toBe('failed');
    expect(r.at?.t).toBeCloseTo(0.3, 12);
    expect(r.at?.values).toEqual({ off: 0, hot: 0 });
  });

  it('treats a trigger that is already true at the first sample as a rising edge', () => {
    const s = series({ hot: [1, 1, 1, 1], off: [0, 0, 0, 0] });
    expect(evaluateAssertion(resp(0.1), s, DUR(s)).verdict).toBe('failed');
  });

  it('is inconclusive when the trigger never rises (vacuous)', () => {
    const s = series({ hot: [0, 0, 0], off: [1, 1, 1] });
    const r = evaluateAssertion(resp(0.1), s, DUR(s));
    expect(r.verdict).toBe('inconclusive');
    expect(r.reason).toMatch(/trigger/);
  });

  it('is inconclusive when an unanswered edge has its deadline beyond the window', () => {
    const s = series({ hot: [0, 0, 0, 1], off: [0, 0, 0, 0] });
    expect(evaluateAssertion(resp(0.5), s, DUR(s)).verdict).toBe('inconclusive');
  });

  it('a real failure wins over a pending edge', () => {
    const s = series({ hot: [1, 0, 0, 0, 1], off: [0, 0, 0, 0, 0] });
    expect(evaluateAssertion(resp(0.1), s, DUR(s)).verdict).toBe('failed');
  });
});

describe('aggregateRequirementVerdicts', () => {
  it('failed > inconclusive > passed, per requirement', () => {
    const res = (requirementId: string, verdict: 'passed' | 'failed' | 'inconclusive', id: string) =>
      ({ assertionId: id, requirementId, verdict, samplesChecked: 1, reason: '' });
    const agg = aggregateRequirementVerdicts([
      res('r1', 'passed', 'a'), res('r1', 'failed', 'b'), res('r1', 'inconclusive', 'c'),
      res('r2', 'passed', 'd'), res('r2', 'inconclusive', 'e'),
      res('r3', 'passed', 'f'),
    ]);
    expect(agg.r1).toEqual({ verdict: 'failed', assertionIds: ['a', 'b', 'c'] });
    expect(agg.r2.verdict).toBe('inconclusive');
    expect(agg.r3.verdict).toBe('passed');
  });
});
