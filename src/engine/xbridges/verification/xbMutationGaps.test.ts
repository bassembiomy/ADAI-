/**
 * Tests that close gaps found by the WP-22 mutation run (docs/xbridges-verification/mutation-report.md).
 * Mutant 16: the chatter limit must fire on exactly the (MAX + 1)-th consecutive crossing at the same time (Simulink's
 * "Number of consecutive zero crossings" limit: the error is raised when the count exceeds the limit).
 * Mutants 8, 10, 12, 15: the real surviving mutants (XBV-437). Each test below pins the unmutated behaviour and
 * fails under its mutant (verified by hand-applying the mutant and restoring with git checkout).
 */
import { describe, expect, it } from 'vitest';
import { ConsecutiveCrossings, MAX_CONSECUTIVE_ZERO_CROSSINGS, crossingBlock, crossedOrTouched } from '../zeroCrossingGuard';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { liveStep, liveStepAt } from '../liveStep';
import { buildModel, type ModelSpec } from '../testkit';

describe('chatter limit boundary (mutant 16)', () => {
  it(`${MAX_CONSECUTIVE_ZERO_CROSSINGS} crossings at the same time are allowed; the next one exceeds the limit`, () => {
    const c = new ConsecutiveCrossings();
    for (let i = 1; i <= MAX_CONSECUTIVE_ZERO_CROSSINGS; i++) expect(c.note(1.5, 1e-12), `crossing ${i}`).toBe(false);
    expect(c.note(1.5, 1e-12)).toBe(true);
  });
  it('a crossing outside the window restarts the count', () => {
    const c = new ConsecutiveCrossings();
    for (let i = 1; i <= MAX_CONSECUTIVE_ZERO_CROSSINGS; i++) c.note(1.5, 1e-12);
    expect(c.note(2.5, 1e-12)).toBe(false);
    for (let i = 2; i <= MAX_CONSECUTIVE_ZERO_CROSSINGS; i++) expect(c.note(2.5, 1e-12)).toBe(false);
    expect(c.note(2.5, 1e-12)).toBe(true);
  });
  it('the window scales with |t| (128 eps |t|) and with the location tolerance (10 tol)', () => {
    const c = new ConsecutiveCrossings();
    c.note(1e6, 1e-12);
    // 128 eps 1e6 = 2.8e-8: a crossing 1e-8 later is in the same window, 1e-7 later is not
    c.note(1e6 + 1e-8, 1e-12);
    for (let i = 3; i <= MAX_CONSECUTIVE_ZERO_CROSSINGS; i++) c.note(1e6 + 1e-8, 1e-12);
    expect(c.note(1e6 + 1e-8, 1e-12)).toBe(true);
    const d = new ConsecutiveCrossings();
    d.note(1, 1e-6);
    expect(d.note(1 + 5e-6, 1e-6)).toBe(false); // within 10 tol = 1e-5: count 2
    expect(d.note(1 + 5e-5, 1e-6)).toBe(false); // outside: count restarts at 1
  });
});

// ---------------------------------------------------------------------------------------------------- helpers
/**
 * x' = 1, x(0) = 1: a free integrator (the cheapest model for step-count runs). Its non-zero local error keeps the
 * live solver's step hint alive (an estimate of exactly 0 drops the hint, XBV-423, and the next output step would
 * start from the initial-step heuristic, which masks the first-step cap).
 */
const RAMP: ModelSpec = {
  blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'x', type: 'Integrator', params: { initialCondition: 1 } }],
  wires: ['c.out -> x.in'],
};

interface Probe {
  outputTimes: number[];
  derivTimes: number[];
  commits: number;
}
/** Wraps the engine instance (production code untouched) to observe the solver's calls. */
function instrument(e: XbridgesEngine): Probe {
  const p: Probe = { outputTimes: [], derivTimes: [], commits: 0 };
  const co = e.computeOutputs.bind(e);
  e.computeOutputs = ((t: number, temp?: Map<string, unknown>) => { if (temp === undefined) p.outputTimes.push(t); return co(t, temp as never); }) as typeof e.computeOutputs;
  const cd = e.computeDerivatives.bind(e);
  e.computeDerivatives = ((t: number, temp?: Map<string, unknown>) => { if (temp === undefined) p.derivTimes.push(t); return cd(t, temp as never); }) as typeof e.computeDerivatives;
  const cu = e.commitStateUpdates.bind(e);
  e.commitStateUpdates = ((m: Map<string, unknown>) => { p.commits++; return cu(m as never); }) as typeof e.commitStateUpdates;
  return p;
}
/** Largest gap between the distinct times at which the solver evaluated the model, endpoints included. */
function largestGap(p: Probe, t0: number, tEnd: number): number {
  const ts = [...new Set([t0, tEnd, ...p.outputTimes, ...p.derivTimes])].sort((a, b) => a - b);
  let g = 0;
  for (let i = 1; i < ts.length; i++) g = Math.max(g, ts[i] - ts[i - 1]);
  return g;
}
const stateOf = (e: XbridgesEngine, id: string) => Number((e.getBlock(id) as unknown as { state: unknown }).state);
const errorCodes = (e: XbridgesEngine) => e.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);

// ======================================================================================================
// Mutant 10: the first step must be capped by maxStep (h = min(h0, hMax), XBV-424).
// The E13 tests (xbSolversB) do not catch the min->max mutant: they run without a user fixedStep, so the
// initial-step heuristic (needInitial) resets h to min(initialStep, hMax, h0) before the first trial and
// masks the mutant. With a user fixedStep (batch) or a carried hint that exceeds a newly set maxStep (live),
// the heuristic is off and h = min(h0, hMax) is the only cap.
// ======================================================================================================
describe('mutant 10: the first step is capped by maxStep even when h0 > maxStep', () => {
  const MAX = 0.01;
  for (const solver of ['ode23', 'ode45'] as const) {
    it(`${solver} batch with a user fixedStep (h0 = 1 > maxStep): the first step equals maxStep, at least T / maxStep steps`, () => {
      const e = new XbridgesEngine(buildModel(RAMP));
      const probe = instrument(e);
      // fixedStep = 1 is the user's first step (h0 = 1); maxStep = 0.01 must cap it. Without the cap the whole
      // interval would be one step of 1.0 (commits ~901, largest gap 1.0).
      Solvers.runFixedStep(e, { solver, startTime: 0, stopTime: 10, fixedStep: 1, maxStep: MAX } as never);
      expect(errorCodes(e), `diagnostics: ${e.diagnostics.map((d) => d.code).join()}`).toEqual([]);
      expect(probe.commits, `commits ${probe.commits}`).toBeGreaterThanOrEqual(1000);
      expect(largestGap(probe, 0, 10)).toBeLessThanOrEqual(MAX * (1 + 1e-9));
    });
  }
  it('ode23 live: a carried hint larger than a newly set maxStep is capped on the next output step', () => {
    const e = new XbridgesEngine(buildModel(RAMP));
    e.options = { solver: 'ode23', fixedStep: 1, startTime: 0, stopTime: 2 } as never;
    e.compile(0);
    const probe = instrument(e);
    // First output step with no maxStep: the hint grows to 5 (lte = 0 -> factor 5).
    expect(liveStep(e, 'ode23', 0, 1)).toBe(true);
    // The user now sets maxStep = 0.01. The carried hint (5) exceeds it; the first internal step of the next
    // output step must be capped to 0.01 (h = min(min(hint, dt), maxStep)), not stretched to min(hint, dt) = 1.
    (e.options as Record<string, unknown>).maxStep = MAX;
    // Only the times of the second output step: the step base t = 1, evaluated before the first trial.
    const out = probe.outputTimes.length;
    const der = probe.derivTimes.length;
    expect(liveStep(e, 'ode23', 1, 1)).toBe(true);
    const late = { outputTimes: probe.outputTimes.slice(out), derivTimes: probe.derivTimes.slice(der), commits: probe.commits };
    expect(largestGap(late, 1, 2)).toBeLessThanOrEqual(MAX * (1 + 1e-9));
    expect(errorCodes(e)).toEqual([]);
  });
});

// ======================================================================================================
// Mutant 12: the batch discrete last step is shortened to the remaining time (min(dt, stopTime - t)).
// stepDiscrete ignores its dt argument, so the mutant is observable only by recording the dt the batch
// runner passes: with stopTime = 0.35 and dt = 0.1 the steps are at t = 0, 0.1, 0.2, 0.3 with sizes
// 0.1, 0.1, 0.1, 0.05, and the last step ends exactly at 0.35. The mutant (stopTime + t) gives 0.1 for the
// last step, ending at 0.4.
// ======================================================================================================
describe('mutant 12: the batch discrete last step is shortened to the stop time', () => {
  it('stop 0.35 with dt 0.1: step sizes are 0.1, 0.1, 0.1, 0.05 and the last step ends exactly at 0.35', () => {
    const spec: ModelSpec = {
      blocks: [{ id: 'k', type: 'Constant', params: { value: 1 } }, { id: 'd', type: 'UNIT_DELAY', params: { sampleTime: 0.1 } }],
      wires: ['k.out -> d.u'],
    };
    const e = new XbridgesEngine(buildModel(spec));
    const calls: { t: number; dt: number }[] = [];
    const orig = Solvers.stepDiscrete;
    (Solvers as unknown as { stepDiscrete: typeof orig }).stepDiscrete = ((eng: XbridgesEngine, t: number, dt: number) => {
      calls.push({ t, dt });
      return orig(eng, t, dt);
    }) as typeof orig;
    try {
      Solvers.runFixedStep(e, { solver: 'discrete', startTime: 0, stopTime: 0.35, fixedStep: 0.1 } as never);
    } finally {
      (Solvers as unknown as { stepDiscrete: typeof orig }).stepDiscrete = orig;
    }
    expect(errorCodes(e), `diagnostics: ${e.diagnostics.map((d) => d.code).join()}`).toEqual([]);
    expect(calls).toHaveLength(4);
    for (const [i, c] of calls.entries()) expect(c.t).toBeCloseTo(0.1 * i, 12);
    for (const [i, c] of calls.entries()) expect(c.dt).toBeCloseTo([0.1, 0.1, 0.1, 0.05][i], 12);
    const last = calls.at(-1)!;
    // The last step ends exactly at the stop time (the untruncated step would end at 0.4).
    expect(last.t + last.dt).toBeCloseTo(0.35, 12);
    expect(last.t + last.dt).toBeLessThanOrEqual(0.35);
  });
});

// ======================================================================================================
// Mutant 15: a touch (a * b == 0) is not a crossing. crossingBlock reports strict sign changes only
// (a * b < 0); a signal that touches 0 and returns (u = (t-1)^2 at t = 1, XBV-419) must not be named as
// the crossing block. crossedOrTouched is the bisection predicate and DOES treat a touch as an event
// (a value that is zero there has already switched its block); the two are deliberately different.
// ======================================================================================================
describe('mutant 15: a touch is not a crossing (crossingBlock is strict, crossedOrTouched is inclusive)', () => {
  const zc = (v: number) => new Map([['r', [v]]]);
  it('crossingBlock: a strict sign change names the block', () => {
    expect(crossingBlock(zc(1), zc(-1))).toBe('r');
    expect(crossingBlock(zc(-1), zc(1))).toBe('r');
  });
  it('crossingBlock: a touch (product == 0) names no block', () => {
    expect(crossingBlock(zc(1), zc(0))).toBeNull();
    expect(crossingBlock(zc(0), zc(1))).toBeNull();
    expect(crossingBlock(zc(0), zc(0))).toBeNull();
    expect(crossingBlock(zc(-1), zc(0))).toBeNull();
  });
  it('crossingBlock: the same sign names no block', () => {
    expect(crossingBlock(zc(1), zc(2))).toBeNull();
    expect(crossingBlock(zc(-1), zc(-2))).toBeNull();
  });
  it('crossedOrTouched (the bisection predicate): a touch counts, for contrast', () => {
    expect(crossedOrTouched(zc(1), zc(0))).toBe(true);
    expect(crossedOrTouched(zc(1), zc(1))).toBe(false);
  });
  it('a signal that touches 0 (a Relay with switchOff = 0) is not located: the same model without the touch runs alike', () => {
    // u = (t-1)^2 via a Clock, a Sum and a Product: it touches 0 at t = 1 and returns. Two runs of the same
    // model differ only in the Relay's switchOff: 0 (a zero-crossing function that touches zero at t = 1) and
    // -0.5 (a function that never leaves its sign there). Both switch on at the same instant (u = 0.25 at
    // t = 1.5). If the touch is not a crossing the two runs are identical; a located touch cuts a step at
    // t ~ 1 in the first run only.
    const model = (switchOff: number): ModelSpec => ({
      blocks: [
        { id: 'clk', type: 'Clock' },
        { id: 'm1', type: 'Sum', params: { signs: '+-' } },
        { id: 'one', type: 'Constant', params: { value: 1 } },
        { id: 'sq', type: 'PRODUCT' },
        { id: 'r', type: 'RELAY', params: { switchOn: 0.25, switchOff, initialState: false } },
        { id: 'term', type: 'TERMINATOR' },
        { id: 'x', type: 'Integrator', params: { initialCondition: 0 } },
      ],
      wires: ['clk.clk -> m1.in1', 'one.out -> m1.in2', 'm1.out -> sq.in1', 'm1.out -> sq.in2', 'sq.y -> r.u', 'r.y -> term.u', 'sq.y -> x.in'],
    });
    const run = (switchOff: number) => {
      const e = new XbridgesEngine(buildModel(model(switchOff)));
      const probe = instrument(e);
      Solvers.runFixedStep(e, { solver: 'ode23', startTime: 0, stopTime: 2, fixedStep: 0.5, relTol: 1e-9, absTol: 1e-12 } as never);
      return { e, probe, x: stateOf(e, 'x') };
    };
    const touch = run(0);
    const noTouch = run(-0.5);
    expect(errorCodes(touch.e), `diagnostics: ${touch.e.diagnostics.map((d) => d.code).join()}`).toEqual([]);
    expect(errorCodes(noTouch.e)).toEqual([]);
    // No event at the touch: the same internal step times as the run whose crossing function only changes sign
    // at the switch-on instant (and no chatter at all).
    expect(touch.probe.outputTimes).toEqual(noTouch.probe.outputTimes);
    expect(touch.e.diagnostics.map((d) => d.code)).not.toContain('ZERO_CROSSING_CHATTER');
    // The integral of (t-1)^2 over [0, 2] is 2/3; the Relay does not switch, so both runs give it.
    expect(touch.x).toBeCloseTo(2 / 3, 9);
    expect(noTouch.x).toBeCloseTo(2 / 3, 9);
  });
});

// ======================================================================================================
// Mutant 8: the event bracket end is clamped to the interval end (tHigh = min(hi + 2*TOL, tHi)).
// An event closer than 2*EVENT_TIME_TOL to the end of an output step must land exactly on the output
// time: the next output time is exact and a free integrator (x' = 1) reads exactly the step end.
// ======================================================================================================
describe('mutant 8: an event at the end of an output step lands exactly on the output time', () => {
  it('ode23 live, Relay switching 1e-13 before the step end: x = 1 exactly (not 1 + 2e-12)', () => {
    // u = t (Clock); the Relay switches on at u = 1 - 1e-13, i.e. 1e-13 before the output step end t = 1.
    // switchOff = -1 keeps the second crossing function away from zero on [0, 1] (no spurious event at t = 0).
    const spec: ModelSpec = {
      blocks: [
        { id: 'clk', type: 'Clock' },
        { id: 'r', type: 'RELAY', params: { switchOn: 1 - 1e-13, switchOff: -1, initialState: false } },
        { id: 'term', type: 'TERMINATOR' },
        { id: 'c', type: 'Constant', params: { value: 1 } },
        { id: 'x', type: 'Integrator', params: { initialCondition: 0 } },
      ],
      wires: ['clk.clk -> r.u', 'r.y -> term.u', 'c.out -> x.in'],
    };
    const e = new XbridgesEngine(buildModel(spec));
    e.options = { solver: 'ode23', fixedStep: 1, startTime: 0, stopTime: 1 } as never;
    e.compile(0);
    const probe = instrument(e);
    expect(liveStep(e, 'ode23', 0, 1)).toBe(true);
    expect(errorCodes(e), `diagnostics: ${e.diagnostics.map((d) => d.code).join()}`).toEqual([]);
    // The event bracket end is clamped to the interval end (t = 1): the integrator reads exactly 1.
    // Without the clamp the solver would step to hi + 2e-12 > 1 and x would be 1 + ~2e-12.
    expect(stateOf(e, 'x')).toBe(1);
    expect(Math.max(...probe.outputTimes)).toBeLessThanOrEqual(1);
  });
});
