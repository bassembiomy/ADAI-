/**
 * WP-12 part B - solver verification (plan section 5.1, decisions D3 and D15): adaptive error control of ode23 / ode45 /
 * ode23tb with the user's RelTol / AbsTol (batch and live), output times and the stop-time hit, maxStep / minStep,
 * stiffness (Van der Pol, Robertson) and time accumulation (XBV-017).
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md.
 *
 * Oracles (never engine output):
 *  - closed forms: x' = -x -> e^-t; x' = sin t -> 1 - cos t; harmonic oscillator -> cos t;
 *  - a reference RK4 written in this file at a tiny step (Van der Pol), checked against itself at twice the step;
 *  - Hairer-Wanner published values of Robertson's problem at t = 40;
 *  - integer arithmetic of the sample grid (k * dt, hit index = floor(t / Ts) + 1).
 *
 * Error model used for the bounds. The controller keeps the weighted local error estimate of every internal step below
 * tol = RelTol * |x| + AbsTol. A global error is the sum of the local errors carried by a (here non-expanding) flow:
 *   ode23 (3rd order, estimate O(h^3)) and ode45 (5th order, estimate O(h^5)): h ~ tol^(1/(p+1)), global ~ h^p ~ tol,
 *     so |e(t)| <= M t (RelTol S + AbsTol) with M = 4 (measured up to 2.7 at t = 1 for ode23, 0.5 - 0.7 at t = 10; M = 4 keeps a margin of 1.5 to 8);
 *   ode23tb (TR-BDF2, 2nd order, estimate O(h^3)): h ~ tol^(1/3), global ~ h^2 ~ tol^(2/3),
 *     so |e(t)| <= 4 t RelTol^(2/3) S.
 * S is |x(t)| for the contracting decay and the largest |x| on [0, t] for the oscillating problems.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { liveStep, liveStepAt } from '../liveStep';
import {
  invalidSolverOptionTexts, solverOptionDiagnostics, solverOptionsForRun, type SolverOptionTexts,
} from '../simulationConfig';
import { buildModel, runModel, type ModelSpec } from '../testkit';

// ---------------------------------------------------------------------------------------------------- models
/** x' = -x, x(0) = x0. Exact: x0 e^-t. */
const decay = (x0 = 1): ModelSpec => ({
  blocks: [{ id: 'x', type: 'Integrator', params: { initialCondition: x0 } }, { id: 'g', type: 'GAIN', params: { gain: -1 } }],
  wires: ['x.out -> g.u', 'g.y -> x.in'],
});
/** x' = sin t, x(0) = 0 (non-autonomous; a sine source at 1/(2 pi) Hz). Exact: 1 - cos t. */
const SINF: ModelSpec = {
  blocks: [
    { id: 'w', type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 1 / (2 * Math.PI), offset: 0, phase: 0 } },
    { id: 'x', type: 'Integrator', params: { initialCondition: 0 } },
  ],
  wires: ['w.out -> x.in'],
};
/** x1' = x2, x2' = -x1, (1, 0). Exact: x1 = cos t, x2 = -sin t. */
const OSC: ModelSpec = {
  blocks: [
    { id: 'x1', type: 'Integrator', params: { initialCondition: 1 } },
    { id: 'x2', type: 'Integrator', params: { initialCondition: 0 } },
    { id: 'g', type: 'GAIN', params: { gain: -1 } },
  ],
  wires: ['x1.out -> g.u', 'g.y -> x2.in', 'x2.out -> x1.in'],
};
/** x' = 0, x(0) = 1: every step is accepted, so only maxStep limits the step. */
const ZERO: ModelSpec = {
  blocks: [{ id: 'c', type: 'Constant', params: { value: 0 } }, { id: 'x', type: 'Integrator', params: { initialCondition: 1 } }],
  wires: ['c.out -> x.in'],
};
/** x' = 1 (a free integrator: the cheapest model for step-count runs). */
const RAMP: ModelSpec = {
  blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'x', type: 'Integrator', params: { initialCondition: 0 } }],
  wires: ['c.out -> x.in'],
};
/** Van der Pol: x1' = x2, x2' = mu (1 - x1^2) x2 - x1, (2, 0). */
const vdp = (mu: number): ModelSpec => ({
  blocks: [
    { id: 'x1', type: 'Integrator', params: { initialCondition: 2 } }, { id: 'x2', type: 'Integrator', params: { initialCondition: 0 } },
    { id: 'p', type: 'PRODUCT' }, { id: 'one', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'Sum', params: { signs: '+-' } },
    { id: 'q', type: 'PRODUCT' }, { id: 'm', type: 'GAIN', params: { gain: mu } }, { id: 'r', type: 'Sum', params: { signs: '+-' } },
  ],
  wires: ['x1.out -> p.in1', 'x1.out -> p.in2', 'one.out -> s.in1', 'p.y -> s.in2', 's.out -> q.in1', 'x2.out -> q.in2',
    'q.y -> m.u', 'm.y -> r.in1', 'x1.out -> r.in2', 'x2.out -> x1.in', 'r.out -> x2.in'],
});
/** Robertson: y1' = -0.04 y1 + 1e4 y2 y3; y2' = 0.04 y1 - 1e4 y2 y3 - 3e7 y2^2; y3' = 3e7 y2^2; y(0) = (1, 0, 0). */
const ROBERTSON: ModelSpec = {
  blocks: [
    { id: 'y1', type: 'Integrator', params: { initialCondition: 1 } }, { id: 'y2', type: 'Integrator', params: { initialCondition: 0 } },
    { id: 'y3', type: 'Integrator', params: { initialCondition: 0 } },
    { id: 'p23', type: 'PRODUCT' }, { id: 'p22', type: 'PRODUCT' },
    { id: 'a', type: 'GAIN', params: { gain: 0.04 } }, { id: 'b', type: 'GAIN', params: { gain: 1e4 } }, { id: 'c', type: 'GAIN', params: { gain: 3e7 } },
    { id: 's1', type: 'Sum', params: { signs: '-+' } }, { id: 's2', type: 'Sum', params: { signs: '+--' } },
  ],
  wires: ['y2.out -> p23.in1', 'y3.out -> p23.in2', 'y2.out -> p22.in1', 'y2.out -> p22.in2', 'y1.out -> a.u', 'p23.y -> b.u', 'p22.y -> c.u',
    'a.y -> s1.in1', 'b.y -> s1.in2', 's1.out -> y1.in', 'a.y -> s2.in1', 'b.y -> s2.in2', 'c.y -> s2.in3', 's2.out -> y2.in', 'c.y -> y3.in'],
};

// --------------------------------------------------------------------------------------------------- helpers
const VARIABLE = ['ode23', 'ode45', 'ode23tb'] as const;
type Variable = (typeof VARIABLE)[number];
const errorCodes = (e: XbridgesEngine) => e.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
const allCodes = (e: XbridgesEngine) => e.diagnostics.map((d) => d.code);
const stateOf = (e: XbridgesEngine, id: string) => Number((e.getBlock(id) as unknown as { state: unknown }).state);
const ulp = (x: number) => Math.abs(x) * Number.EPSILON;

interface Probe {
  /** Times at which the top-level outputs were computed, in call order (major steps). */
  outputTimes: number[];
  /** Times of top-level derivative evaluations (the first stage of a step). */
  derivTimes: number[];
  /** Times passed to updateDiscreteStates, in call order. */
  discreteTimes: number[];
  commits: number;
}
/** Wraps the engine instance (production code untouched) to observe the solver's calls. */
function instrument(e: XbridgesEngine): Probe {
  const p: Probe = { outputTimes: [], derivTimes: [], discreteTimes: [], commits: 0 };
  const co = e.computeOutputs.bind(e);
  e.computeOutputs = ((t: number, temp?: Map<string, unknown>) => { if (temp === undefined) p.outputTimes.push(t); return co(t, temp as never); }) as typeof e.computeOutputs;
  const cd = e.computeDerivatives.bind(e);
  e.computeDerivatives = ((t: number, temp?: Map<string, unknown>) => { if (temp === undefined) p.derivTimes.push(t); return cd(t, temp as never); }) as typeof e.computeDerivatives;
  const ud = e.updateDiscreteStates.bind(e);
  e.updateDiscreteStates = ((t: number) => { p.discreteTimes.push(t); return ud(t); }) as typeof e.updateDiscreteStates;
  const cu = e.commitStateUpdates.bind(e);
  e.commitStateUpdates = ((m: Map<string, unknown>) => { p.commits++; return cu(m as never); }) as typeof e.commitStateUpdates;
  return p;
}

interface LiveOptions { dt: number; stop: number; start?: number; options?: Record<string, unknown>; ids?: string[] }
interface LiveResult { e: XbridgesEngine; probe: Probe; times: number[]; values: Record<string, number[]>; ok: boolean; ms: number }
/** The canvas live loop (liveStepAt + liveStep) with explicit engine options; records the state after every output step. */
function liveRun(spec: ModelSpec, solver: string, o: LiveOptions): LiveResult {
  const start = o.start ?? 0;
  const e = new XbridgesEngine(buildModel(spec));
  e.options = { solver, fixedStep: o.dt, startTime: start, stopTime: o.stop, ...(o.options ?? {}) } as never;
  e.compile(start);
  const probe = instrument(e);
  const ids = o.ids ?? ['x'];
  const times = [start];
  const values: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, [stateOf(e, id)]]));
  const t0 = Date.now();
  let ok = true;
  for (let n = 0; ; n++) {
    const plan = liveStepAt(start, o.stop, o.dt, n);
    if (plan === null) break;
    if (!liveStep(e, solver, plan.time, plan.stepNow)) { ok = false; break; }
    times.push(plan.reachesStop ? o.stop : start + (n + 1) * o.dt);
    for (const id of ids) values[id].push(stateOf(e, id));
  }
  return { e, probe, times, values, ok, ms: Date.now() - t0 };
}
/** The batch runner (Solvers.runFixedStep). */
function batchRun(spec: ModelSpec, solver: string, stop: number, options: Record<string, unknown> = {}, start = 0) {
  const e = new XbridgesEngine(buildModel(spec));
  const probe = instrument(e);
  const t0 = Date.now();
  Solvers.runFixedStep(e, { solver, startTime: start, stopTime: stop, ...options } as never);
  return { e, probe, ms: Date.now() - t0 };
}

const SLOPE: Record<Variable, number> = { ode23: 1, ode45: 1, ode23tb: 2 / 3 };
/** Largest admissible global error at time t (see the header). */
const bound = (solver: Variable, t: number, relTol: number, absTol: number, scale: number) =>
  solver === 'ode23tb' ? 4 * t * Math.pow(relTol, 2 / 3) * scale + absTol : 4 * t * (relTol * scale + absTol);

// ======================================================================================================
// 1. Adaptive error control (D3)
// ======================================================================================================
interface Problem { name: string; spec: ModelSpec; id: string; exact: (t: number) => number; scale: (t: number) => number; ids?: string[] }
const PROBLEMS: Problem[] = [
  { name: "x' = -x", spec: decay(), id: 'x', exact: (t) => Math.exp(-t), scale: (t) => Math.exp(-t) },
  { name: "x' = sin t", spec: SINF, id: 'x', exact: (t) => 1 - Math.cos(t), scale: () => 2 },
  { name: 'harmonic oscillator x1 = cos t', spec: OSC, id: 'x1', exact: (t) => Math.cos(t), scale: () => 1, ids: ['x1', 'x2'] },
];
const SWEEP = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9];
const ABS = 1e-12;
const TIMES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Global error at t = 1..10 for one RelTol; live (output step 0.5 so that 1..10 are output times) or batch (one run per t). */
function errorsAt(p: Problem, solver: Variable, mode: 'live' | 'batch', relTol: number): number[] {
  const options = { relTol, absTol: ABS };
  if (mode === 'live') {
    // Output step 1: the controller, not the output step, must limit the internal step (dt 0.5 would cap ode45 at loose RelTol).
    // ode23 on x' = -x needs dt 0.5: at h = 1 its error estimate vanishes (finding candidate below).
    const dt = solver === 'ode23' && p.name === "x' = -x" ? 0.5 : 1;
    const r = liveRun(p.spec, solver, { dt, stop: 10, options, ids: p.ids ?? [p.id] });
    expect(r.ok, `${solver} live ${p.name} RelTol ${relTol}: ${allCodes(r.e)}`).toBe(true);
    return TIMES.map((t) => Math.abs(r.values[p.id][t / dt] - p.exact(t)));
  }
  return TIMES.map((t) => {
    // maxStep = t: the batch default cap (0.05 for ode23 / ode45) would hide the tolerance control.
    const r = batchRun(p.spec, solver, t, { relTol, absTol: ABS, maxStep: t });
    expect(errorCodes(r.e), `${solver} batch ${p.name} RelTol ${relTol} T ${t}`).toEqual([]);
    return Math.abs(stateOf(r.e, p.id) - p.exact(t));
  });
}

describe('D3: global error follows the user RelTol (t = 1 .. 10, RelTol sweep 1e-3 .. 1e-9)', () => {
  for (const solver of VARIABLE) for (const mode of ['live', 'batch'] as const) for (const p of PROBLEMS) {
    it(`${solver} ${mode}, ${p.name}: error within the order-derived multiple of RelTol |x| + AbsTol, monotone in RelTol, slope ${SLOPE[solver].toFixed(2)}`, () => {
      const table = SWEEP.map((relTol) => ({ relTol, errs: errorsAt(p, solver, mode, relTol) }));
      for (const { relTol, errs } of table) {
        errs.forEach((e, i) => {
          const t = TIMES[i];
          const scale = p.scale(t);
          expect(e, `${solver} ${mode} ${p.name} RelTol ${relTol} t = ${t}`).toBeLessThanOrEqual(bound(solver, t, relTol, ABS, scale) + 1e-13);
        });
      }
      // Tightening RelTol never makes the worst error worse by more than noise (a factor 3 and a 1e-13 round-off floor).
      const worst = table.map((r) => Math.max(...r.errs));
      for (let k = 1; k < worst.length; k++) expect(worst[k], `${solver} ${mode} ${p.name} ${SWEEP[k - 1]} -> ${SWEEP[k]}: ${worst}`).toBeLessThanOrEqual(3 * worst[k - 1] + 1e-13);
      // Scaling: the error falls with RelTol^q (q = 1, or 2/3 for ode23tb) over 1e-5 .. 1e-9. Looser values are not used: there the
      // output step (live) or the problem, not the tolerance, limits the step and the error is flat.
      const slope = Math.log10(worst[2] / worst[6]) / 4;
      expect(slope, `${solver} ${mode} ${p.name} worst errors ${worst}`).toBeGreaterThanOrEqual(SLOPE[solver] - 0.35);
      expect(slope, `${solver} ${mode} ${p.name} worst errors ${worst}`).toBeLessThanOrEqual(SLOPE[solver] + 0.6);
    }, 60_000);
  }
});

describe('D3: the error does not depend on the output step (the controller works inside each output step)', () => {
  for (const solver of VARIABLE) {
    it(`${solver} live, x' = -x: dt 0.5, 0.25 and 0.1 all meet the RelTol 1e-6 bound at t = 10`, () => {
      for (const dt of [0.5, 0.25, 0.1]) {
        const r = liveRun(decay(), solver, { dt, stop: 10, options: { relTol: 1e-6, absTol: ABS } });
        expect(r.ok, allCodes(r.e).join()).toBe(true);
        const err = Math.abs(r.values.x.at(-1)! - Math.exp(-10));
        expect(err, `${solver} dt ${dt}`).toBeLessThanOrEqual(bound(solver, 10, 1e-6, ABS, Math.exp(-10)) + 1e-13);
      }
    });
  }
  // Finding (now acceptance): ode23 accepts a step with no error although the true error is 9 %.
  // Derivation: Bogacki-Shampine stages for x' = -x, h = 1: k = (-1, -1/2, -5/8, -1/3); the error vector
  // e = (2/9 - 7/24, 1/3 - 1/4, 4/9 - 1/3, -1/8) gives e.k = 0.0694 - 0.0417 - 0.0694 + 0.0417 = 0, so the estimate is
  // blind at h * lambda = -1 and the live loop starts every output step with h0 = dt = 1. The solution is 1/3 instead of e^-1 (9 %).
  it('ode23 live, x\' = -x, dt = 1, RelTol 1e-6: the first step is not accepted with a 9 % error (XBV-423)', () => {
    const r = liveRun(decay(), 'ode23', { dt: 1, stop: 1, options: { relTol: 1e-6, absTol: ABS } });
    expect(Math.abs(r.values.x[1] - Math.exp(-1))).toBeLessThanOrEqual(2 * (1e-6 * Math.exp(-1) + ABS));
  });
});

describe('D3: AbsTol governs where x is near 0 (x\' = -x from x0 = 1e-8)', () => {
  const X0 = 1e-8;
  for (const solver of VARIABLE) for (const mode of ['live', 'batch'] as const) {
    it(`${solver} ${mode}: tiny AbsTol gives relative accuracy, large AbsTol relaxes the control`, () => {
      const run = (absTol: number) => {
        if (mode === 'live') {
          const r = liveRun(decay(X0), solver, { dt: 0.5, stop: 5, options: { relTol: 1e-6, absTol } });
          return { x: r.values.x.at(-1)!, commits: r.probe.commits, e: r.e };
        }
        const r = batchRun(decay(X0), solver, 5, { relTol: 1e-6, absTol, maxStep: 5 });
        return { x: stateOf(r.e, 'x'), commits: r.probe.commits, e: r.e };
      };
      const exact = X0 * Math.exp(-5);
      const tight = run(1e-18);
      // AbsTol << RelTol |x|: the relative error stays within the RelTol bound.
      expect(Math.abs(tight.x - exact) / exact, `${solver} ${mode} tight`).toBeLessThanOrEqual(bound(solver, 5, 1e-6, 0, 1) );
      // AbsTol >> |x|: the local tolerance is AbsTol, so the solver takes larger steps (fewer than with tight AbsTol). With |x| ~ 1e-10 an
      // absolute-error bound of 2 t AbsTol cannot fail, so only the step count discriminates here.
      const loose = run(1e-4);
      expect(loose.commits, `${solver} ${mode} steps loose ${loose.commits} vs tight ${tight.commits}`).toBeLessThan(tight.commits);
    });
  }
});

describe('D3: the user RelTol / AbsTol / maxStep / minStep reach the solver (canvas -> engine.options)', () => {
  const texts = (o: Partial<SolverOptionTexts>): SolverOptionTexts => ({ relative: '1e-3', absolute: '1e-6', extrapolationOrder: '4', newtonIterations: '1', maxStep: '', minStep: '', ...o });
  it('solverOptionsForRun maps the toolbar texts to engine option names for ode23, ode45 and ode23tb; empty step limits stay unset', () => {
    for (const s of VARIABLE) {
      expect(solverOptionsForRun(s, texts({ relative: '1e-9', absolute: '1e-12', maxStep: '0.01', minStep: '1e-8' }))).toEqual({ relTol: 1e-9, absTol: 1e-12, maxStep: 0.01, minStep: 1e-8 });
      expect(solverOptionsForRun(s, texts({}))).toEqual({ relTol: 1e-3, absTol: 1e-6 });
    }
  });
  it('fixed-step solvers receive no tolerance options; ode14x receives only its own options', () => {
    for (const s of ['euler', 'rk4', 'ode2', 'ode3', 'ode5', 'discrete']) expect(solverOptionsForRun(s, texts({ relative: '1e-9' }))).toEqual({});
    expect(solverOptionsForRun('ode14x', texts({ relative: '1e-9', extrapolationOrder: '3', newtonIterations: '2' }))).toEqual({ extrapolationOrder: 3, newtonIterations: 2 });
  });
  it('the workspace spreads solverOptionsForRun into the engine options, and the worker takes the same options object', () => {
    const root = join(__dirname, '../../../..');
    const ws = readFileSync(join(root, 'src/components/xbridges/XbridgesWorkspace.tsx'), 'utf8');
    expect(ws).toMatch(/\.\.\.solverOptionsForRun\(solverType, solverOptionTexts\)/);
    expect(ws).toMatch(/engineRef\.current\.options = solverOptions/);
    expect(ws).toMatch(/compile\(model, timeRef\.current, solverOptions\)/);
    expect(readFileSync(join(root, 'src/engine/xbridges/xbridgesWorker.ts'), 'utf8')).toMatch(/workerEngine\.options = request\.solverOptions as SolverOptions/);
  });
  for (const solver of VARIABLE) {
    it(`${solver} live: RelTol changes the step count (looser < tighter) and the result accuracy`, () => {
      const steps = (relTol: number) => liveRun(decay(), solver, { dt: 2, stop: 6, options: { relTol, absTol: ABS } }).probe.commits;
      expect(steps(1e-3), solver).toBeLessThan(steps(1e-6));
      expect(steps(1e-6), solver).toBeLessThan(steps(1e-9));
    });
    it(`${solver} live: AbsTol changes the step count on a small solution (x0 = 1e-8)`, () => {
      const steps = (absTol: number) => liveRun(decay(1e-8), solver, { dt: 2, stop: 6, options: { relTol: 1e-3, absTol } }).probe.commits;
      expect(steps(1e-3), solver).toBeLessThan(steps(1e-14));
    });
    it(`${solver} live: unset tolerances behave exactly like the Simulink defaults 1e-3 / 1e-6`, () => {
      const a = liveRun(decay(), solver, { dt: 0.5, stop: 5 });
      const b = liveRun(decay(), solver, { dt: 0.5, stop: 5, options: { relTol: 1e-3, absTol: 1e-6 } });
      expect(a.values.x).toEqual(b.values.x);
      expect(a.probe.commits).toBe(b.probe.commits);
    });
    it(`${solver} live: a non-positive or non-finite tolerance is refused with STIFF_SOLVER_INVALID_OPTION, state unchanged`, () => {
      for (const bad of [{ relTol: 0 }, { relTol: -1e-3 }, { absTol: 0 }, { absTol: Number.NaN }, { relTol: Number.POSITIVE_INFINITY }]) {
        const r = liveRun(decay(), solver, { dt: 0.5, stop: 1, options: bad });
        expect(r.ok, JSON.stringify(bad)).toBe(false);
        expect(errorCodes(r.e), JSON.stringify(bad)).toContain('STIFF_SOLVER_INVALID_OPTION');
        expect(r.values.x, JSON.stringify(bad)).toEqual([1]);
      }
    });
  }
});

// ======================================================================================================
// 2. Output times and the stop-time hit
// ======================================================================================================
describe('output times: the canvas time base lands on start + k dt, the last sample is exactly the stop time', () => {
  // [start, stop, dt]; the expected number of steps is ceil((stop - start) / dt - 1e-9), the number of samples steps + 1.
  const CASES: [number, number, number][] = [
    [0, 1, 0.1], [0, 1.0003, 0.1], [0, 0.35, 0.1], [0.05, 0.35, 0.1], [0.25, 1.1, 0.3], [2, 3, 0.01], [0, 0.3, 0.1], [0, 1e-3, 1e-4], [1.5, 1.5 + 1e-3, 0.1], [0, 7, 2],
  ];
  const expectGrid = (t: number[], start: number, stop: number, dt: number, label: string) => {
    const steps = Math.ceil((stop - start) / dt - 1e-9);
    expect(t.length, `${label} sample count`).toBe(steps + 1);
    expect(t[0], label).toBe(start);
    for (let k = 1; k < steps; k++) expect(Math.abs(t[k] - (start + k * dt)), `${label} t[${k}]`).toBeLessThanOrEqual(2 * ulp(start + k * dt));
    expect(t[steps], `${label} last sample is the stop time`).toBe(stop);
    for (let k = 1; k < t.length; k++) expect(t[k], `${label} strictly increasing at ${k}`).toBeGreaterThan(t[k - 1]);
  };
  for (const [start, stop, dt] of CASES) {
    for (const solver of ['rk4', 'ode45', 'ode23', 'ode23tb'] as const) {
      it(`${solver} live [${start}, ${stop}] dt ${dt}: samples on the grid, last exactly ${stop}`, () => {
        const r = runModel(buildModel(RAMP), { solver, dt, stopTime: stop, startTime: start, probes: ['x.out'] });
        expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expectGrid(r.t, start, stop, dt, `${solver} [${start}, ${stop}] ${dt}`);
        // x' = 1 is integrated exactly by every method: the logged value at t is t - start, also at the shortened last step.
        r.t.forEach((t, k) => expect(Math.abs(Number(r.signals['x.out'][k]) - (t - start)), `${solver} x at ${t}`).toBeLessThanOrEqual(1e-9));
      });
    }
  }
  it('every stop k * 0.1 (k = 1 .. 200) gives k + 1 samples ending exactly at the stop time (no missing or duplicate last sample)', () => {
    for (let k = 1; k <= 200; k++) {
      const stop = Number((k * 0.1).toFixed(10));
      const plans: number[] = [];
      for (let n = 0; ; n++) { const p = liveStepAt(0, stop, 0.1, n); if (p === null) break; plans.push(p.time); }
      expect(plans.length, `stop ${stop}`).toBe(k);
    }
  });
  it('the last output step is the shortened one and reaches the stop time; the steps before it are full', () => {
    const plans: { stepNow: number; reachesStop: boolean }[] = [];
    for (let n = 0; ; n++) { const p = liveStepAt(0, 0.35, 0.1, n); if (p === null) break; plans.push(p); }
    expect(plans.map((p) => p.reachesStop)).toEqual([false, false, false, true]);
    expect(plans[3].stepNow).toBeCloseTo(0.05, 12);
    for (const p of plans.slice(0, 3)) expect(p.stepNow).toBe(0.1);
  });
  // XBV-427: SolverOptions declares outputTimes and stiffDetect (types.ts) but no solver reads them. A declared option must be implemented or
  // removed (as D3 removed ode113 / ode15s / ode23s).
  for (const opt of ['outputTimes', 'stiffDetect']) {
    it(`XBV-427: SolverOptions.${opt} is either not declared or read by a solver`, () => {
      const root = join(__dirname, '..');
      const declared = new RegExp(`\\b${opt}\\??\\s*:`).test(readFileSync(join(root, 'types.ts'), 'utf8'));
      const read = ['Solvers.ts', 'AdaptiveSolver.ts', 'StiffSolver.ts', 'liveStep.ts', 'XbridgesEngine.ts', 'xbridgesWorker.ts', 'simulationConfig.ts']
        .some((f) => new RegExp(`\\b${opt}\\b`).test(readFileSync(join(root, f), 'utf8')));
      expect(!declared || read).toBe(true);
    });
  }
});

describe('batch runner: every solver ends exactly at the stop time and does not repeat a major step', () => {
  const CASES: [number, number, number][] = [[0, 1.0003, 0.1], [0, 0.35, 0.1], [0.05, 0.35, 0.1], [0, 1, 0.1]];
  for (const solver of ['euler', 'rk4', 'ode5', 'ode23', 'ode45', 'ode23tb'] as const) for (const [start, stop, dt] of CASES) {
    it(`${solver} batch [${start}, ${stop}] dt ${dt}: first output at start, last exactly stop, strictly increasing, no overshoot`, () => {
      const r = batchRun(decay(), solver, stop, { fixedStep: dt, relTol: 1e-6, absTol: 1e-9 }, start);
      expect(errorCodes(r.e)).toEqual([]);
      const t = r.probe.outputTimes;
      expect(t[0], solver).toBe(start);
      expect(t.at(-1), solver).toBe(stop);
      for (let k = 1; k < t.length; k++) expect(t[k], `${solver} output ${k}: ${t[k - 1]} -> ${t[k]}`).toBeGreaterThan(t[k - 1]);
      expect(Math.max(...t), solver).toBeLessThanOrEqual(stop);
      expect(Math.abs(stateOf(r.e, 'x') - Math.exp(-(stop - start))), `${solver} value at stop`).toBeLessThanOrEqual(solver === 'euler' ? 0.05 : 1e-4);
    });
  }
  for (const solver of ['euler', 'rk4', 'ode5'] as const) {
    it(`${solver} batch fixed step: outputs on start + k dt (to 2 ulp), then exactly the stop time (dt 0.1, stop 0.35 and 1.0003)`, () => {
      for (const [stop, n] of [[0.35, 4], [1.0003, 11]] as const) {
        const r = batchRun(decay(), solver, stop, { fixedStep: 0.1 });
        const t = r.probe.outputTimes;
        expect(t.length, `${solver} stop ${stop}: ${t}`).toBe(n + 1);
        for (let k = 0; k < n; k++) expect(Math.abs(t[k] - k * 0.1), `${solver} t[${k}]`).toBeLessThanOrEqual(2 * ulp(k * 0.1) + 1e-300);
        expect(t[n]).toBe(stop);
      }
    });
  }
});

// ======================================================================================================
// 3. maxStep / minStep
// ======================================================================================================
/** Largest gap between the distinct times at which the solver evaluated the model, endpoints included. */
function largestGap(p: Probe, t0: number, tEnd: number): number {
  const ts = [...new Set([t0, tEnd, ...p.outputTimes, ...p.derivTimes])].sort((a, b) => a - b);
  let g = 0;
  for (let i = 1; i < ts.length; i++) g = Math.max(g, ts[i] - ts[i - 1]);
  return g;
}
describe('maxStep caps the internal step (a pulse narrower than maxStep cannot be stepped over; here every gap is measured)', () => {
  const MAX = 0.01;
  // Finding (now acceptance) (live ode23 / ode45): the first internal step of a live run is h0 = dt and is not capped by maxStep.
  // Observed on x' = -x, dt = 1, maxStep = 0.01: the whole output step is one internal step of 1.0 (100 x maxStep).
  for (const solver of ['ode23', 'ode45'] as const) {
    it(`${solver} live: the first internal step is capped by maxStep ${MAX} (XBV-424)`, () => {
      const r = liveRun(decay(), solver, { dt: 1, stop: 1, options: { maxStep: MAX } });
      expect(largestGap(r.probe, 0, 1)).toBeLessThanOrEqual(MAX * (1 + 1e-9));
    });
    it(`${solver} live: after the first output step the hint is capped, so gaps never exceed maxStep ${MAX} (t in [1, 2])`, () => {
      const r = liveRun(decay(), solver, { dt: 1, stop: 2, options: { maxStep: MAX } });
      const late = { ...r.probe, outputTimes: r.probe.outputTimes.filter((t) => t >= 1), derivTimes: r.probe.derivTimes.filter((t) => t >= 1) };
      expect(largestGap(late, 1, 2)).toBeLessThanOrEqual(MAX * (1 + 1e-9));
      expect(r.probe.commits).toBeGreaterThanOrEqual(100);
    });
    // Finding (now acceptance) (batch ode23 / ode45): the first step is h0 = (stop - start) / 50 = 0.2 > maxStep 0.01 (981 internal
    // steps for T = 10, maxStep 0.01 instead of at least 1000).
    it(`${solver} batch: the first step is capped by maxStep ${MAX}, at least T / maxStep steps (XBV-424)`, () => {
      const r = batchRun(ZERO, solver, 10, { maxStep: MAX });
      expect(r.probe.commits).toBeGreaterThanOrEqual(1000);
    });
  }
  it('ode23tb live: every internal step is at most maxStep (steps >= dt / maxStep) and gaps are capped', () => {
    const r = liveRun(decay(), 'ode23tb', { dt: 1, stop: 1, options: { maxStep: MAX } });
    expect(r.ok).toBe(true);
    expect(r.probe.commits).toBeGreaterThanOrEqual(100);
    expect(largestGap(r.probe, 0, 1)).toBeLessThanOrEqual(MAX * (1 + 1e-9));
  });
  it('ode23tb batch: at least T / maxStep steps, none longer than maxStep', () => {
    const r = batchRun(ZERO, 'ode23tb', 10, { maxStep: MAX });
    expect(r.probe.commits).toBeGreaterThanOrEqual(1000);
    expect(largestGap(r.probe, 0, 10)).toBeLessThanOrEqual(MAX * (1 + 1e-9));
  });
  it('without maxStep the step is not capped: far fewer steps than T / 0.01 (the cap is what limits them)', () => {
    for (const solver of ['ode23', 'ode45', 'ode23tb']) expect(liveRun(ZERO, solver, { dt: 1, stop: 10 }).probe.commits, solver).toBeLessThan(100);
  });
});

describe('minStep: STIFF_SOLVER_STEP_TOO_SMALL when the tolerance cannot be met at the minimum step', () => {
  // The rule (AdaptiveSolver.integrate, live): a step of size h = hMin whose weighted error estimate exceeds 1 reports
  // STIFF_SOLVER_STEP_TOO_SMALL and fails (liveStep returns false, the step-start state is restored).
  // x' = -x with RelTol 1e-9 needs h of about 1e-2 (ode45) / 1e-3 (ode23): minStep 0.5 cannot be met, minStep 1e-6 can.
  const hard = { relTol: 1e-9, absTol: 1e-12 };
  for (const solver of ['ode23', 'ode45'] as const) {
    it(`${solver} live: minStep 0.5 -> error STIFF_SOLVER_STEP_TOO_SMALL, step refused, x stays 1`, () => {
      const r = liveRun(decay(), solver, { dt: 2, stop: 2, options: { ...hard, minStep: 0.5 } });
      expect(r.ok).toBe(false);
      expect(errorCodes(r.e)).toContain('STIFF_SOLVER_STEP_TOO_SMALL');
      expect(r.values.x).toEqual([1]);
    });
    it(`${solver} live: minStep 1e-6 (below the needed step) runs and meets the tolerance`, () => {
      const r = liveRun(decay(), solver, { dt: 2, stop: 2, options: { ...hard, minStep: 1e-6 } });
      expect(r.ok).toBe(true);
      expect(errorCodes(r.e)).toEqual([]);
      expect(Math.abs(r.values.x[1] - Math.exp(-2))).toBeLessThanOrEqual(bound(solver, 2, 1e-9, 1e-12, Math.exp(-2)));
    });
  }
  it('ode23tb live: minStep 0.5 -> STIFF_SOLVER_STEP_TOO_SMALL, step refused, x stays 1', () => {
    const r = liveRun(decay(), 'ode23tb', { dt: 2, stop: 2, options: { ...hard, minStep: 0.5 } });
    expect(r.ok).toBe(false);
    expect(errorCodes(r.e)).toContain('STIFF_SOLVER_STEP_TOO_SMALL');
    expect(r.values.x).toEqual([1]);
  });
  it('ode23tb batch: step fell below minStep -> STIFF_SOLVER_STEP_TOO_SMALL', () => {
    const r = batchRun(decay(), 'ode23tb', 1, { ...hard, minStep: 0.5 });
    expect(errorCodes(r.e)).toContain('STIFF_SOLVER_STEP_TOO_SMALL');
  });
  // By design (comment in AdaptiveSolver.integrate: "a step at the minimum step is accepted" in batch runs) the batch
  // ode23 / ode45 accept a step that misses the tolerance at minStep, silently.
  // Finding (now acceptance): no diagnostic at all (not even a warning) when the batch ode23 / ode45 give up the tolerance at minStep.
  for (const solver of ['ode23', 'ode45'] as const) {
    it(`${solver} batch: tolerance not met at minStep 0.5 is reported (STIFF_SOLVER_STEP_TOO_SMALL, XBV-425)`, () => {
      const r = batchRun(decay(), solver, 1, { ...hard, minStep: 0.5, maxStep: 1 });
      expect(allCodes(r.e)).toContain('STIFF_SOLVER_STEP_TOO_SMALL');
    });
  }
});

describe('invalid maxStep / minStep', () => {
  const T = (o: Partial<SolverOptionTexts>): SolverOptionTexts => ({ relative: '1e-3', absolute: '1e-6', extrapolationOrder: '4', newtonIterations: '1', maxStep: '', minStep: '', ...o });
  it('canvas: 0, negative, text and min > max are refused with STIFF_SOLVER_INVALID_OPTION before the run; empty and "auto" mean unset', () => {
    for (const s of VARIABLE) {
      for (const bad of ['0', '-1', '-0.01', 'abc', 'NaN', 'inf']) {
        expect(invalidSolverOptionTexts(s, T({ maxStep: bad })), `${s} maxStep ${bad}`).toEqual(['maxStep']);
        expect(invalidSolverOptionTexts(s, T({ minStep: bad })), `${s} minStep ${bad}`).toEqual(['minStep']);
        expect(solverOptionDiagnostics(s, T({ maxStep: bad })).map((d) => [d.severity, d.code])).toEqual([['error', 'STIFF_SOLVER_INVALID_OPTION']]);
      }
      expect(invalidSolverOptionTexts(s, T({ maxStep: '0.01', minStep: '0.1' }))).toEqual(['minStep']);
      expect(invalidSolverOptionTexts(s, T({ maxStep: '0.1', minStep: '0.1' }))).toEqual([]);
      expect(invalidSolverOptionTexts(s, T({ maxStep: '', minStep: 'auto' }))).toEqual([]);
      // an invalid value is never passed on, never clamped
      expect(solverOptionsForRun(s, T({ maxStep: '0.01', minStep: '0.1' }))).toEqual({ relTol: 1e-3, absTol: 1e-6, maxStep: 0.01 });
      expect(solverOptionsForRun(s, T({ maxStep: '-1' }))).toEqual({ relTol: 1e-3, absTol: 1e-6 });
    }
  });
  // Engine level (options passed to the solver directly, as the API / worker user can), XBV-426: every invalid combination gives exactly
  // STIFF_SOLVER_INVALID_OPTION (as the canvas does), never the misleading STIFF_SOLVER_STEP_TOO_SMALL or a silent clamp.
  // [solver, mode, options, expected error codes]
  const IN: string[] = ['STIFF_SOLVER_INVALID_OPTION'];
    const MAXBAD = [{ maxStep: 0 }, { maxStep: -1 }];
  const MINBAD = [{ minStep: 0 }, { minStep: -1 }];
  const CROSS = { minStep: 1, maxStep: 0.1 };
  const ROWS: [Variable, 'live' | 'batch', Record<string, number>, string[]][] = [
    ['ode23', 'live', MAXBAD[0], IN], ['ode23', 'live', MAXBAD[1], IN], ['ode23', 'live', MINBAD[0], IN], ['ode23', 'live', MINBAD[1], IN], ['ode23', 'live', CROSS, IN],
    ['ode45', 'live', MAXBAD[0], IN], ['ode45', 'live', MAXBAD[1], IN], ['ode45', 'live', MINBAD[0], IN], ['ode45', 'live', MINBAD[1], IN], ['ode45', 'live', CROSS, IN],
    ['ode23tb', 'live', MAXBAD[0], IN], ['ode23tb', 'live', MAXBAD[1], IN], ['ode23tb', 'live', MINBAD[0], IN], ['ode23tb', 'live', MINBAD[1], IN], ['ode23tb', 'live', CROSS, IN],
    ['ode23', 'batch', MAXBAD[0], IN], ['ode23', 'batch', MAXBAD[1], IN], ['ode23', 'batch', MINBAD[0], IN], ['ode23', 'batch', MINBAD[1], IN], ['ode23', 'batch', CROSS, IN],
    ['ode45', 'batch', MAXBAD[0], IN], ['ode45', 'batch', MAXBAD[1], IN], ['ode45', 'batch', MINBAD[0], IN], ['ode45', 'batch', MINBAD[1], IN], ['ode45', 'batch', CROSS, IN],
    ['ode23tb', 'batch', MAXBAD[0], IN], ['ode23tb', 'batch', MAXBAD[1], IN], ['ode23tb', 'batch', MINBAD[0], IN], ['ode23tb', 'batch', MINBAD[1], IN], ['ode23tb', 'batch', CROSS, IN],
  ];
  const run = (solver: Variable, mode: 'live' | 'batch', o: Record<string, number>) =>
    mode === 'live' ? liveRun(decay(), solver, { dt: 0.5, stop: 1, options: o }).e : batchRun(decay(), solver, 0.05, o).e;
  for (const [solver, mode, o, codes] of ROWS) {
    it(`${solver} ${mode} ${JSON.stringify(o)} -> error codes [${codes}]`, () => {
      expect([...new Set(errorCodes(run(solver, mode, o)))]).toEqual(codes);
    });
  }
  // Finding (now acceptance): the engine accepts maxStep <= 0, minStep <= 0 and minStep > maxStep without STIFF_SOLVER_INVALID_OPTION
  // in most solver / mode combinations (only the batch ode23tb refuses the non-positive values; live ode23 / ode45 report the
  // misleading STIFF_SOLVER_STEP_TOO_SMALL for maxStep <= 0, the batch ode23 / ode45 run silently with a clamped step).
  // Expected: STIFF_SOLVER_INVALID_OPTION for every row, as the canvas does for the same texts.
  it('every invalid maxStep / minStep combination is refused with STIFF_SOLVER_INVALID_OPTION by every solver and mode (XBV-426)', () => {
    for (const [solver, mode, o] of ROWS) expect(errorCodes(run(solver, mode, o)), `${solver} ${mode} ${JSON.stringify(o)}`).toContain('STIFF_SOLVER_INVALID_OPTION');
  });
});

// ======================================================================================================
// 4. Stiffness
// ======================================================================================================
/** Independent classical RK4 (this file), fixed step h, from y0 at t = 0; returns y at each requested time (multiples of h). */
function rk4Reference(f: (y: number[]) => number[], y0: number[], h: number, times: number[]): number[][] {
  let y = y0.slice();
  const out: number[][] = [];
  const add = (a: number[], b: number[], s: number) => a.map((v, i) => v + s * b[i]);
  const total = Math.round(Math.max(...times) / h);
  const want = new Map(times.map((t) => [Math.round(t / h), t]));
  for (let n = 1; n <= total; n++) {
    const k1 = f(y), k2 = f(add(y, k1, h / 2)), k3 = f(add(y, k2, h / 2)), k4 = f(add(y, k3, h));
    y = y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    if (want.has(n)) out.push(y.slice());
  }
  return out;
}
const vdpField = (mu: number) => (y: number[]) => [y[1], mu * (1 - y[0] * y[0]) * y[1] - y[0]];

describe('Van der Pol mu = 1 (non-stiff) against an independent RK4 reference at t = 1, 2', () => {
  // Reference: RK4 with h = 1e-3 (global error ~ 1e-12 on this smooth orbit); self-checked against h = 5e-4.
  const ref = rk4Reference(vdpField(1), [2, 0], 1e-3, [1, 2]);
  const ref2 = rk4Reference(vdpField(1), [2, 0], 5e-4, [1, 2]);
  it('the reference is converged (h and h/2 agree to 1e-10)', () => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expect(Math.abs(ref[i][j] - ref2[i][j])).toBeLessThan(1e-10);
  });
  const RELTOL = 1e-8;
  for (const solver of VARIABLE) for (const mode of ['live', 'batch'] as const) {
    it(`${solver} ${mode}, RelTol 1e-8: x1, x2 at t = 1 and 2 within the order bound of the reference`, () => {
      [1, 2].forEach((t, i) => {
        const got = mode === 'live'
          ? (() => { const r = liveRun(vdp(1), solver, { dt: 1, stop: t, options: { relTol: RELTOL, absTol: 1e-10 }, ids: ['x1', 'x2'] }); expect(r.ok, allCodes(r.e).join()).toBe(true); return [r.values.x1.at(-1)!, r.values.x2.at(-1)!]; })()
          : (() => { const r = batchRun(vdp(1), solver, t, { relTol: RELTOL, absTol: 1e-10, maxStep: t }); expect(errorCodes(r.e)).toEqual([]); return [stateOf(r.e, 'x1'), stateOf(r.e, 'x2')]; })();
        // scale 2 = the largest |x1| on the orbit; the bound of the header with RelTol^q
        const b = bound(solver, t, RELTOL, 1e-10, 2);
        got.forEach((v, j) => expect(Math.abs(v - ref[i][j]), `${solver} ${mode} t = ${t} x${j + 1} = ${v}, reference ${ref[i][j]}`).toBeLessThanOrEqual(b));
      });
    });
  }
});

describe('Van der Pol mu = 1000 (stiff)', () => {
  // Reference: RK4 with h = 2e-4 (explicit RK4 is stable here: |lambda| h <= 3000 * 2e-4 = 0.6 < 2.78), self-checked with h = 4e-4.
  const TS = [100, 300, 500];
  const ref = rk4Reference(vdpField(1000), [2, 0], 2e-4, TS);
  const ref2 = rk4Reference(vdpField(1000), [2, 0], 4e-4, TS);
  it('the reference is converged (h and 2h agree to 1e-6 relative on x1)', () => {
    TS.forEach((_, i) => expect(Math.abs(ref[i][0] - ref2[i][0]) / Math.abs(ref[i][0])).toBeLessThan(1e-6));
  });
  // Stated tolerance: ode23tb at RelTol 1e-6 (2nd order, global ~ t RelTol^(2/3) = 5e-2 pessimistic bound; measured about 2e-5).
  // The check is 1e-3 relative on x1 and 1e-4 absolute on x2.
  it('ode23tb live, RelTol 1e-6, output step 100: completes quickly and agrees with the reference at t = 100, 300, 500', () => {
    const r = liveRun(vdp(1000), 'ode23tb', { dt: 100, stop: 500, options: { relTol: 1e-6, absTol: 1e-9 }, ids: ['x1', 'x2'] });
    expect(r.ok, allCodes(r.e).join()).toBe(true);
    expect(errorCodes(r.e)).toEqual([]);
    expect(r.ms, 'ode23tb wall time').toBeLessThan(20_000);
    TS.forEach((t, i) => {
      expect(Math.abs(r.values.x1[t / 100] - ref[i][0]) / Math.abs(ref[i][0]), `x1(${t})`).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(r.values.x2[t / 100] - ref[i][1]), `x2(${t})`).toBeLessThanOrEqual(1e-4);
    });
  }, 60_000);
  it('ode23tb batch, RelTol 1e-6: agrees with the reference at t = 100 and 500', () => {
    for (const [t, i] of [[100, 0], [500, 2]] as const) {
      const r = batchRun(vdp(1000), 'ode23tb', t, { relTol: 1e-6, absTol: 1e-9 });
      expect(errorCodes(r.e)).toEqual([]);
      expect(Math.abs(stateOf(r.e, 'x1') - ref[i][0]) / Math.abs(ref[i][0]), `x1(${t})`).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(stateOf(r.e, 'x2') - ref[i][1]), `x2(${t})`).toBeLessThanOrEqual(1e-4);
    }
  }, 60_000);
  // ode45 (explicit): pinned outcome - it completes without an error diagnostic (stability-limited steps of about 1e-3,
  // a few 1e5 steps, about 10 s) and agrees with the reference; trial steps that blow up are rolled back and leave
  // NUMERICAL_INSTABILITY warnings. There is no stiffness diagnostic in the engine (SolverOptions.stiffDetect is never read).
  it('ode45 live, RelTol 1e-6, output step 100: completes (no error diagnostic) and agrees with the reference; no stiffness diagnostic (none in Simulink either)', () => {
    const r = liveRun(vdp(1000), 'ode45', { dt: 100, stop: 500, options: { relTol: 1e-6, absTol: 1e-9 }, ids: ['x1', 'x2'] });
    expect(r.ok, allCodes(r.e).join()).toBe(true);
    expect(errorCodes(r.e)).toEqual([]);
    expect(r.ms, 'ode45 wall time').toBeLessThan(50_000);
    TS.forEach((t, i) => expect(Math.abs(r.values.x1[t / 100] - ref[i][0]) / Math.abs(ref[i][0]), `x1(${t})`).toBeLessThanOrEqual(1e-3));
    expect(allCodes(r.e).every((c) => c === 'NUMERICAL_INSTABILITY')).toBe(true);
  }, 90_000);
});

describe('Robertson kinetics (Hairer-Wanner reference at t = 40)', () => {
  // y1(40) = 0.7158270687, y2(40) = 9.185534765e-6, y3(40) = 0.2841637457 (Hairer & Wanner, Solving ODEs II, problem ROBER,
  // tabulated reference values).
  const REF = { y1: 0.7158270687, y2: 9.185534765e-6, y3: 0.2841637457 };
  const check = (get: (id: string) => number, label: string) => {
    for (const id of ['y1', 'y2', 'y3'] as const) expect(Math.abs(get(id) - REF[id]) / REF[id], `${label} ${id} = ${get(id)} vs ${REF[id]}`).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(get('y1') + get('y2') + get('y3') - 1), `${label} y1 + y2 + y3 - 1`).toBeLessThanOrEqual(1e-8);
  };
  const OPT = { relTol: 1e-6, absTol: 1e-12 };
  it('ode23tb live (output step 40 and 1), RelTol 1e-6', () => {
    for (const dt of [40, 1]) {
      const r = liveRun(ROBERTSON, 'ode23tb', { dt, stop: 40, options: OPT, ids: ['y1', 'y2', 'y3'] });
      expect(r.ok, allCodes(r.e).join()).toBe(true);
      expect(errorCodes(r.e)).toEqual([]);
      check((id) => r.values[id].at(-1)!, `live dt ${dt}`);
    }
  });
  it('ode23tb batch, RelTol 1e-6', () => {
    const r = batchRun(ROBERTSON, 'ode23tb', 40, OPT);
    expect(errorCodes(r.e)).toEqual([]);
    check((id) => stateOf(r.e, id), 'batch');
  });
  it('trial-step blow-ups of the Newton iteration stay warnings: the run carries no error diagnostic and no NaN state', () => {
    const r = liveRun(ROBERTSON, 'ode23tb', { dt: 40, stop: 40, options: OPT, ids: ['y1', 'y2', 'y3'] });
    expect(r.e.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    for (const id of ['y1', 'y2', 'y3']) expect(Number.isFinite(r.values[id].at(-1)!)).toBe(true);
  });
});

// ======================================================================================================
// 5. Time accumulation (XBV-017)
// ======================================================================================================
describe('XBV-017: time base', () => {
  // Rule (liveStep.liveStepAt, plan 5.1): live output step n starts at start + n * dt (a product, not a running sum).
  for (const [dt, steps] of [[0.1, 1e5], [1e-3, 1e6], [0.3, 1e5], [1 / 3, 1e5]] as const) {
    it(`live time base, dt = ${dt}, ${steps} steps: t_n = n dt to one rounding (no drift), while a running sum would drift`, () => {
      let naive = 0;
      let worst = 0;
      let stepViolations = 0;
      for (let n = 0; n < steps; n++) {
        const p = liveStepAt(0, Number.POSITIVE_INFINITY, dt, n)!;
        worst = Math.max(worst, Math.abs(p.time - n * dt) / Math.max(ulp(n * dt), 1e-300));
        if (p.stepNow !== dt) stepViolations++;
        naive += dt;
      }
      expect(stepViolations, 'steps shorter than dt').toBe(0);
      expect(worst, 'worst deviation from n * dt in ulps').toBeLessThanOrEqual(1);
      // Sanity of the oracle: the repeated addition the canvas must not use does drift for these steps.
      const exact = steps * dt;
      if (dt === 0.1 || dt === 1e-3) expect(Math.abs(naive - exact), 'running sum drift').toBeGreaterThan(ulp(exact) * 100);
    }, 60_000);
  }
  it('live time base: t_n = start + n dt for a non-zero start time as well (start 0.7, dt 0.1, 1e5 steps)', () => {
    let worst = 0;
    for (let n = 0; n < 1e5; n++) worst = Math.max(worst, Math.abs(liveStepAt(0.7, 1e9, 0.1, n)!.time - (0.7 + n * 0.1)));
    expect(worst).toBe(0);
  });
  // Batch fixed step (Kahan-compensated running sum, Solvers.runEuler / runRK4): measured against k * dt.
  for (const [dt, steps] of [[0.1, 1e5], [1e-3, 1e6]] as const) {
    it(`batch rk4 time base, dt = ${dt}, ${steps} steps: the compensated sum stays within 4 ulp of k dt and the last output is the stop time`, () => {
      const stop = steps * dt;
      const r = batchRun(RAMP, 'rk4', stop, { fixedStep: dt });
      expect(errorCodes(r.e)).toEqual([]);
      const t = r.probe.outputTimes;
      let worst = 0;
      for (let k = 0; k < Math.min(t.length - 1, steps); k++) worst = Math.max(worst, Math.abs(t[k] - k * dt) / Math.max(ulp(k * dt), 1e-300));
      expect(worst, `worst deviation in ulp over ${t.length} outputs`).toBeLessThanOrEqual(4);
      expect(t.at(-1)).toBe(stop);
      expect(t.length, 'one output per step plus the final one').toBe(steps + 1);
      expect(Math.abs(stateOf(r.e, 'x') - stop), 'x(stop) of x\' = 1').toBeLessThanOrEqual(1e-6);
    }, 60_000);
  }
});

describe('XBV-017: a discrete block at Ts = 0.3 fires at every hit k * 0.3, never skips or double-fires', () => {
  /** Forward-Euler discrete integrator, Ts = 0.3, u = 1: y = 0.3 * (number of hits so far); hitIndex counts the hits. */
  const DISCRETE: ModelSpec = {
    blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'd', type: 'INTEGRATOR_DISCRETE', params: { sample_time: 0.3, initial_condition: 0 } }, { id: 'tm', type: 'TERMINATOR' }],
    wires: ['c.out -> d.u', 'd.y -> tm.u'],
  };
  const yOf = (e: XbridgesEngine) => Number((e.getBlock('d') as unknown as { state: { y: number } }).state.y);
  const hits = (e: XbridgesEngine) => ((e.getBlock('d') as unknown as { hitIndex?: number }).hitIndex ?? 0);
  // Hit k happens at t = 0.3 k; with output step dt = 0.1 j the step n starts at n dt and the first start at or after 0.3 k is n = 3 k / j.
  for (const [dt, per] of [[0.1, 3], [0.05, 6], [0.3, 1], [0.15, 2]] as const) {
    for (const solver of ['rk4', 'ode45'] as const) {
      const steps = solver === 'rk4' ? 1e5 : 3000;
      it(`${solver} live dt ${dt}: hit count after step n is floor(n / ${per}) + 1 for ${steps} steps (every hit once, none missed)`, () => {
        const e = new XbridgesEngine(buildModel(DISCRETE));
        e.options = { solver, fixedStep: dt, startTime: 0, stopTime: Number.POSITIVE_INFINITY } as never;
        e.compile(0);
        for (let n = 0; n < steps; n++) {
          const p = liveStepAt(0, Number.POSITIVE_INFINITY, dt, n)!;
          expect(liveStep(e, solver, p.time, p.stepNow)).toBe(true);
          const expected = Math.floor(n / per) + 1;
          if (hits(e) !== expected) expect(hits(e), `step ${n}, t = ${p.time}`).toBe(expected);
        }
        const k = hits(e);
        expect(Math.abs(yOf(e) - 0.3 * k), 'integral of 1 over k hits').toBeLessThanOrEqual(1e-9 * Math.max(1, 0.3 * k));
        expect(errorCodes(e)).toEqual([]);
      }, 60_000);
    }
  }
  it('batch rk4 and discrete, dt 0.1, T = 1e4 (1e5 steps): floor(T / 0.3) + 1 hits, y = 0.3 * hits', () => {
    for (const solver of ['rk4', 'discrete'] as const) {
      const r = batchRun(DISCRETE, solver, 1e4, { fixedStep: 0.1 });
      expect(errorCodes(r.e), solver).toEqual([]);
      // hits at 0, 0.3, ..., 9999.9: floor(1e4 / 0.3) = 33333 hits after t = 0, plus the one at t = 0 -> 33334; the final major
      // step at t = 1e4 is past the hit at 9999.9 and before the next (10000.2).
      expect(hits(r.e), solver).toBe(33334);
      expect(Math.abs(yOf(r.e) - 0.3 * 33334), solver).toBeLessThanOrEqual(1e-6);
    }
  }, 60_000);
});

// ======================================================================================================
// WP-21 E14 acceptance (controller): XBV-428, XBV-429
// ======================================================================================================
describe('XBV-428: minStep = maxStep is a valid fixed internal step; the last step before an output or stop time may be shorter', () => {
  // x' = -x, x(0) = 1, h = 1e-3: x(1) = e^-1; a third-order method at h = 1e-3 is far inside 1e-5 relative.
  for (const solver of ['ode23', 'ode45', 'ode23tb'] as const) {
    it(`${solver} batch, minStep = maxStep = 1e-3 to t = 1: no error, x(1) = e^-1 within 1e-5`, () => {
      const r = batchRun(decay(), solver, 1, { minStep: 1e-3, maxStep: 1e-3 });
      expect(errorCodes(r.e)).toEqual([]);
      expect(Math.abs(stateOf(r.e, 'x') - Math.exp(-1)) / Math.exp(-1)).toBeLessThanOrEqual(1e-5);
    });
    it(`${solver} live dt 0.1, minStep = maxStep = 1e-3 to t = 1.05: no error, x = e^-1.05 within 1e-5`, () => {
      const r = liveRun(decay(), solver, { dt: 0.1, stop: 1.05, options: { minStep: 1e-3, maxStep: 1e-3 } });
      expect(r.ok).toBe(true);
      expect(errorCodes(r.e)).toEqual([]);
      expect(Math.abs(r.values.x.at(-1)! - Math.exp(-1.05)) / Math.exp(-1.05)).toBeLessThanOrEqual(1e-5);
    });
  }
});

describe('XBV-429: batch runs start from the MATLAB initial step, not span / 50', () => {
  // x' = -x, x0 = 1, f0 = -1, threshold AbsTol / RelTol = 1e-3 < |x0|: rh = 1 / (0.8 RelTol^pow), h0 = 0.8 RelTol^pow
  // (ode45 pow 1/5, ode23 pow 1/3). For x' = -x the step at h0 is accepted, so the first major step lands at h0.
  for (const [solver, pow] of [['ode45', 1 / 5], ['ode23', 1 / 3]] as const) {
    it(`${solver} batch, RelTol 1e-9, AbsTol 1e-12, stop 10: the first major step is h0 = 0.8 RelTol^${pow.toFixed(3)} (within 1 %)`, () => {
      const h0 = 0.8 * 1e-9 ** pow;
      const r = batchRun(decay(), solver, 10, { relTol: 1e-9, absTol: 1e-12 });
      const first = r.probe.outputTimes.find((t) => t > 0)!;
      expect(Math.abs(first - h0) / h0, `first step ${first}, h0 ${h0}`).toBeLessThanOrEqual(0.01);
    });
  }
});
