/**
 * WP-13b — engine semantics part B (plan section 5.2): algebraic-loop tolerance and iteration limits, multirate hold,
 * zero crossings of the D2 blocks under variable step (and D15 under fixed step), DOE evaluator diagnostic codes.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 2, 3, 9, decisions D2 and D15).
 *
 * Oracles: hand-derived fixed points and closed-form integrals (stated in the comment of each case), never the
 * engine's own output.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { buildModel, runModel, type ModelSpec } from '../testkit';
import { evaluateDOEModelDetailed, evaluateLegacyDOEEquationDetailed } from '../../doe/modelEvaluator';
import { fitRSM, normalizeInputDataset } from '../../doe/statistics';
import { createVLabDOEBlock, createXBridgesDOEBlock, validateDOEModelResult } from '../../doe/integration';

const codes = (d: { code: string }[]) => d.map((x) => x.code);

// ---------------------------------------------------------------------------------------------------------------------
// 1. Algebraic loops: algTol / maxIter observability
// ---------------------------------------------------------------------------------------------------------------------
describe('1. algebraic loop tolerance and iteration limit', () => {
  /** y = a*u + b*y through Constant -> Gain a -> Sum(+ +) with Gain b in the feedback. Fixed point y = a u / (1 - b). */
  const linearLoop = (a: number, b: number, u: number): ModelSpec => ({
    blocks: [
      { id: 'c', type: 'Constant', params: { value: u } }, { id: 'ga', type: 'GAIN', params: { gain: a } },
      { id: 's', type: 'Sum', params: { signs: '++' } }, { id: 'gb', type: 'GAIN', params: { gain: b } },
    ],
    wires: ['c.out -> ga.u', 'ga.y -> s.in1', 's.out -> gb.u', 'gb.y -> s.in2'],
  });
  const solve = (spec: ModelSpec, opts: Record<string, unknown>, probe: [string, string] = ['s', 'out']) => {
    const e = new XbridgesEngine(buildModel(spec));
    e.options = { solver: 'rk4', fixedStep: 0.1, startTime: 0, stopTime: 1, ...opts } as never;
    const compile = e.compile(0);
    e.computeOutputs(0);
    return { y: Number(e.getSignalValue(...probe)), codes: codes([...compile, ...e.diagnostics]), fatal: e.hasFatalError() };
  };

  describe('a. linear loop with a known fixed point: |y - y*| <= algTol * (1 + |y|)', () => {
    // y* = a u / (1 - b), derived by hand per row. b = 0.5, 0.3 contract; b = -0.5 alternates; b = 2 diverges under plain iteration (Newton).
    const rows: [string, number, number, number, number][] = [
      ['a=1 b=0.5 u=3', 1, 0.5, 3, 6], // 3 / 0.5
      ['a=2 b=0.3 u=1', 2, 0.3, 1, 2 / 0.7],
      ['a=1 b=-0.5 u=3', 1, -0.5, 3, 2], // 3 / 1.5
      ['a=1 b=2 u=3', 1, 2, 3, -3], // 3 / (1 - 2)
    ];
    for (const algTol of [1e-3, 1e-6, 1e-10]) for (const [name, a, b, u, ystar] of rows) {
      it(`${name}, algTol ${algTol}`, () => {
        const r = solve(linearLoop(a, b, u), { algTol });
        expect(r.codes).not.toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
        expect(Math.abs(r.y - ystar)).toBeLessThanOrEqual(algTol * (1 + Math.abs(ystar)));
      });
    }
  });

  describe('b. slow loops: maxIter limits the Newton iteration', () => {
    // Linear contraction 0.99: y* = u / (1 - 0.99) = 100 u. Gauss-Seidel does not settle in 50 passes (0.99^50 = 0.6), Newton on a linear
    // loop is exact in one step, so even maxIter = 1 gives the fixed point (Simulink also solves a linear loop at once).
    it('linear loop, contraction 0.99, u = 1: y = 100 for maxIter 1 and 100', () => {
      for (const maxIter of [1, 100]) {
        const r = solve(linearLoop(1, 0.99, 1), { maxIter });
        expect(r.codes, `maxIter ${maxIter}`).not.toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
        expect(Math.abs(r.y - 100)).toBeLessThanOrEqual(1e-6 * 101);
      }
    });
    // Nonlinear slow loop: z = F(z) = z - (z - c)^3, c = 0.5, fixed point z = c (a triple root of z - F(z) = (z - c)^3).
    // Newton on g(z) = (z - c)^3 shrinks e = z - c by 2/3 per iteration (e' = e - e^3 / (3 e^2)).
    // XBV-421: convergence is judged on the solution, |z - z*| <= algTol (1 + |z*|), not on the residual |e|^3 (which would accept |e| = 1e-2 at
    // algTol 1e-6). A triple root is only resolvable to |e| ~ (eps |z|)^(1/3) ~ 5e-6 from the residual in double precision, so the tests use
    // algTol 1e-2 and 1e-4 (|e| <= 1.5e-2 / 1.5e-4, residual >= 3e-12, well above rounding). From e0 = -0.5 plain Newton needs (2/3)^n <= 3e-2
    // or 3e-4, about 9 and 20 iterations; an engine that accelerates (e.g. Aitken, multiple-root detection) may need fewer, so the tests pin the
    // outcome and the ordering, not the count. Every counted iteration must evaluate the loop (no iteration counted without work).
    // Gauss-Seidel (e' = e - e^3) is sublinear (e ~ 1/sqrt(2n)), so it does not settle in 50 passes either.
    const slow: ModelSpec = {
      blocks: [
        { id: 'c', type: 'Constant', params: { value: 0.5 } }, { id: 's1', type: 'Sum', params: { signs: '+-' } },
        { id: 'p', type: 'PRODUCT', params: { numInputs: 3 } }, { id: 's2', type: 'Sum', params: { signs: '+-' } },
      ],
      wires: ['s2.out -> s1.in1', 'c.out -> s1.in2', 's1.out -> p.in1', 's1.out -> p.in2', 's1.out -> p.in3', 's2.out -> s2.in1', 'p.y -> s2.in2'],
    };
    it('maxIter 3 is not enough: ALGEBRAIC_LOOP_NOT_CONVERGED (error) and the run is fatal', () => {
      const r = solve(slow, { algTol: 1e-6, maxIter: 3 });
      expect(r.codes).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
      expect(r.fatal).toBe(true);
    });
    for (const algTol of [1e-2, 1e-4]) {
      it(`maxIter 100 converges to z = 0.5 within algTol ${algTol} on the solution, no diagnostic`, () => {
        const r = solve(slow, { algTol, maxIter: 100 }, ['s2', 'out']);
        expect(r.codes).not.toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
        expect(Math.abs(r.y - 0.5)).toBeLessThanOrEqual(algTol * 1.5);
      });
    }
    const minIter = (algTol: number) => { for (let n = 1; n <= 100; n++) if (!solve(slow, { algTol, maxIter: n }).codes.includes('ALGEBRAIC_LOOP_NOT_CONVERGED')) return n; return Infinity; };
    it('the threshold is monotone: below the least sufficient maxIter every count fails, above it every count succeeds', () => {
      const n = minIter(1e-4);
      expect(n).toBeGreaterThan(3);
      expect(n).toBeLessThanOrEqual(100);
      for (const m of [n - 1, Math.max(1, n - 3)]) expect(solve(slow, { algTol: 1e-4, maxIter: m }).codes).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
      for (const m of [n + 1, n + 10, 100]) expect(solve(slow, { algTol: 1e-4, maxIter: m }).codes).not.toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
    });
    it('a tighter algTol needs more iterations: least sufficient maxIter at 1e-4 > at 1e-2', () => {
      expect(minIter(1e-4)).toBeGreaterThan(minIter(1e-2));
      expect(minIter(1e-4)).toBeLessThanOrEqual(100);
    });
  });

  describe('c. a loop with no solution gives an error, never a NaN carried on', () => {
    it('y = 1 + y: ALGEBRAIC_LOOP_NOT_CONVERGED, fatal, and the run stops at the first step', () => {
      const spec = linearLoop(1, 1, 1);
      const r = solve(spec, {});
      expect(r.codes).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
      expect(r.fatal).toBe(true);
      const run = runModel(buildModel(spec), { solver: 'rk4', dt: 0.1, stopTime: 0.5, probes: ['s.out'] });
      expect(run.diagnostics.filter((d) => d.code === 'ALGEBRAIC_LOOP_NOT_CONVERGED').every((d) => d.severity === 'error')).toBe(true);
      expect(run.t.length).toBeLessThan(6);
      for (const v of run.signals['s.out']) expect(Number.isNaN(Number(v))).toBe(false);
    });
    // XBV-416: y = 1 + g y has the finite solution y = -1 / (g - 1). The engine must return it, or stop with the fatal ALGEBRAIC_LOOP_NOT_CONVERGED
    // (Simulink stops on a loop it cannot solve); it must never carry Infinity or NaN on with warnings only.
    for (const g of [1e10, 1e300]) {
      it(`y = 1 + ${g} * y: the finite solution -1/(g - 1), or a fatal ALGEBRAIC_LOOP_NOT_CONVERGED`, () => {
        const r = solve(linearLoop(1, g, 1), {});
        if (r.codes.includes('ALGEBRAIC_LOOP_NOT_CONVERGED')) expect(r.fatal).toBe(true);
        else expect(Math.abs(r.y - -1 / (g - 1))).toBeLessThanOrEqual(1e-6 * Math.abs(1 / (g - 1)) + 1e-300);
        const run = runModel(buildModel(linearLoop(1, g, 1)), { solver: 'rk4', dt: 0.1, stopTime: 0.5, probes: ['s.out'] });
        for (const v of run.signals['s.out']) expect(Number.isFinite(Number(v)), `s.out = ${v}`).toBe(true);
      });
    }
    // XBV-418: every step of a run, not only the first output, solves the loop: s = -1/(g - 1) and the feedback gain output g s = -g/(g - 1),
    // both within 1e-6 relative (a warm start from the previous step must not stop at a value that only meets algTol on s).
    for (const g of [1e6, 1e10, 1e300]) for (const solver of ['euler', 'rk4']) {
      it(`y = 1 + ${g} * y, ${solver} over 5 steps: s and the gain output exact at every step`, () => {
        const run = runModel(buildModel(linearLoop(1, g, 1)), { solver, dt: 0.1, stopTime: 0.5, probes: ['s.out', 'gb.y'] });
        const errs = run.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
        // g = 1e300: the Jacobian 1 - g is at the edge of double range, so the fatal ALGEBRAIC_LOOP_NOT_CONVERGED is also accepted (as in XBV-416).
        if (g === 1e300 && errs.length) { expect([...new Set(errs)]).toEqual(['ALGEBRAIC_LOOP_NOT_CONVERGED']); return; }
        expect(errs).toEqual([]);
        const s = -1 / (g - 1), gy = -g / (g - 1);
        for (const v of run.signals['s.out']) expect(Math.abs(Number(v) - s), `s.out = ${v}`).toBeLessThanOrEqual(1e-6 * Math.abs(s));
        for (const v of run.signals['gb.y']) expect(Math.abs(Number(v) - gy), `gb.y = ${v}`).toBeLessThanOrEqual(1e-6 * Math.abs(gy));
      });
    }
    // XBV-421: near-unit contraction y = c(t) + q y, c = 1 + 0.1 t (Clock): the exact solution is c / (1 - q). Convergence is judged on the
    // solution (|y - y*| <= algTol (1 + |y*|), algTol 1e-6 default), so a small sweep change is not enough when q is close to 1.
    const qLoop = (q: number): ModelSpec => ({
      blocks: [{ id: 'clk', type: 'Clock' }, { id: 'k', type: 'GAIN', params: { gain: 0.1 } }, { id: 'one', type: 'Constant', params: { value: 1 } },
        { id: 's', type: 'Sum', params: { signs: '+++' } }, { id: 'gq', type: 'GAIN', params: { gain: q } }],
      wires: ['clk.clk -> k.u', 'one.out -> s.in1', 'k.y -> s.in2', 's.out -> gq.u', 'gq.y -> s.in3'],
    });
    for (const q of [0.9, 0.99, 0.9999, 0.999999, -0.999]) {
      it(`y = 1 + 0.1 t + ${q} y, rk4 over 20 steps: within algTol on the solution at every step`, () => {
        const run = runModel(buildModel(qLoop(q)), { solver: 'rk4', dt: 0.1, stopTime: 2, probes: ['s.out'] });
        expect(run.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
        run.t.forEach((t, i) => {
          const ys = (1 + 0.1 * t) / (1 - q);
          expect(Math.abs(Number(run.signals['s.out'][i]) - ys), `t ${t}`).toBeLessThanOrEqual(1e-6 * (1 + Math.abs(ys)));
        });
      });
    }
    // XBV-421 / 422: nonlinear y = 1 + y - k y^2 (Sum + + -, PRODUCT y y, Gain k): y* = 1 / sqrt(k); the loop map has slope 1 - 2 k y* = 1 - 2 sqrt(k)
    // (0.998 for k = 1e-6), and for k = 1e-8 the Newton Jacobian 2 k y is 0 at the starting guess 0, which must not end the solve.
    const kLoop = (k: number): ModelSpec => ({
      blocks: [{ id: 'one', type: 'Constant', params: { value: 1 } }, { id: 's', type: 'Sum', params: { signs: '++-' } },
        { id: 'p', type: 'PRODUCT', params: { numInputs: 2 } }, { id: 'gk', type: 'GAIN', params: { gain: k } }],
      wires: ['one.out -> s.in1', 's.out -> s.in2', 's.out -> p.in1', 's.out -> p.in2', 'p.y -> gk.u', 'gk.y -> s.in3'],
    });
    for (const k of [1e-6, 1e-8, 1e-10]) {
      it(`y = 1 + y - ${k} y^2: y* = ${1 / Math.sqrt(k)} within algTol on the solution, rk4 over 10 steps, no error`, () => {
        const run = runModel(buildModel(kLoop(k)), { solver: 'rk4', dt: 0.1, stopTime: 1, probes: ['s.out'] });
        expect(run.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
        const ys = 1 / Math.sqrt(k);
        for (const v of run.signals['s.out']) expect(Math.abs(Number(v) - ys), `s.out = ${v}`).toBeLessThanOrEqual(1e-6 * (1 + ys));
      });
    }
    // XBV-421 rework: a loop with no solution must stay fatal however small the inconsistency is relative to 1, as long as the residual
    // |u| exceeds algTol (1 + |y|): y = u + y has no solution for u != 0; a damped or tiny step must never be taken as convergence.
    for (const u of [1, 1e-2, 1e-4, 1e-5]) {
      it(`y = ${u} + y has no solution: fatal ALGEBRAIC_LOOP_NOT_CONVERGED, no value carried on`, () => {
        const r = solve(linearLoop(1, 1, u), {});
        expect(r.codes).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
        expect(r.fatal).toBe(true);
        const run = runModel(buildModel(linearLoop(1, 1, u)), { solver: 'rk4', dt: 0.1, stopTime: 0.5, probes: ['s.out'] });
        expect(run.diagnostics.some((d) => d.code === 'ALGEBRAIC_LOOP_NOT_CONVERGED' && d.severity === 'error')).toBe(true);
        expect(run.t.length).toBeLessThan(3);
      });
    }
    // XBV-431: far roots from a zero start. y = c + y - k y^2 has the roots +-sqrt(c / k); Simulink's trust-region solver reaches them. The engine
    // must converge to one root within algTol on the solution, keep the same root over the steps, and report no error.
    const ckLoop = (c: number, k: number): ModelSpec => ({
      blocks: [{ id: 'one', type: 'Constant', params: { value: c } }, { id: 's', type: 'Sum', params: { signs: '++-' } },
        { id: 'p', type: 'PRODUCT', params: { numInputs: 2 } }, { id: 'gk', type: 'GAIN', params: { gain: k } }],
      wires: ['one.out -> s.in1', 's.out -> s.in2', 's.out -> p.in1', 's.out -> p.in2', 'p.y -> gk.u', 'gk.y -> s.in3'],
    });
    for (const [c, k] of [[1, 1e-14], [1, 1e-20], [1e12, 1], [1e-6, 1e-12]] as const) {
      it(`y = ${c} + y - ${k} y^2 (roots +-${Math.sqrt(c / k)}): one root within algTol, the same at every step, no error (XBV-431)`, () => {
        const run = runModel(buildModel(ckLoop(c, k)), { solver: 'rk4', dt: 0.1, stopTime: 0.5, probes: ['s.out'] });
        expect(run.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
        const r = Math.sqrt(c / k), v0 = Number(run.signals['s.out'][0]);
        const ys = Math.sign(v0) * r;
        for (const v of run.signals['s.out']) expect(Math.abs(Number(v) - ys), `s.out = ${v}`).toBeLessThanOrEqual(1e-6 * (1 + r));
      });
    }
    it('y = 1 + 1e10 * y is solvable in double precision: -1/(1e10 - 1) within 1e-6 relative, no error', () => {
      const r = solve(linearLoop(1, 1e10, 1), {});
      expect(r.codes).not.toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
      expect(Math.abs(r.y - -1 / (1e10 - 1))).toBeLessThanOrEqual(1e-16);
    });
  });

  describe('d. algTol and maxIter reach the solver through the options the canvas passes', () => {
    // The canvas builds {solver, startTime, stopTime, fixedStep, ...solverOptionsForRun()} and sets engine.options (XbridgesWorkspace.tsx:2045-2062).
    const slow: ModelSpec = {
      blocks: [
        { id: 'c', type: 'Constant', params: { value: 0.5 } }, { id: 's1', type: 'Sum', params: { signs: '+-' } },
        { id: 'p', type: 'PRODUCT', params: { numInputs: 3 } }, { id: 's2', type: 'Sum', params: { signs: '+-' } },
      ],
      wires: ['s2.out -> s1.in1', 'c.out -> s1.in2', 's1.out -> p.in1', 's1.out -> p.in2', 's1.out -> p.in3', 's2.out -> s2.in1', 'p.y -> s2.in2'],
    };
    it('engine.options.maxIter changes the outcome on the same model (3 fails, 100 passes)', () => {
      expect(solve(slow, { maxIter: 3 }).codes).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
      expect(solve(slow, { maxIter: 100 }).codes).not.toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
    });
    it('engine.options.algTol changes the outcome (at the least maxIter that suffices for 1e-2, 1e-4 fails)', () => {
      let n = 1;
      while (n < 100 && solve(slow, { algTol: 1e-2, maxIter: n }).codes.includes('ALGEBRAIC_LOOP_NOT_CONVERGED')) n++;
      expect(solve(slow, { algTol: 1e-2, maxIter: n }).codes).not.toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
      expect(solve(slow, { algTol: 1e-4, maxIter: n }).codes).toContain('ALGEBRAIC_LOOP_NOT_CONVERGED');
    });
    it('the diagnostic message names the tolerance in force', () => {
      const e = new XbridgesEngine(buildModel(linearLoop(1, 1, 1)));
      e.options = { solver: 'rk4', fixedStep: 0.1, startTime: 0, stopTime: 1, algTol: 1e-3 } as never;
      e.compile(0); e.computeOutputs(0);
      expect(e.diagnostics.find((d) => d.code === 'ALGEBRAIC_LOOP_NOT_CONVERGED')?.message).toContain('tolerance 0.001');
    });
    it('defaults when unset: algTol 1e-6 and maxIter 100 (loop solved to 1e-6 relative)', () => {
      const r = solve(linearLoop(1, 0.5, 3), {});
      expect(Math.abs(r.y - 6)).toBeLessThanOrEqual(1e-6 * 7);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. Multirate hold
// ---------------------------------------------------------------------------------------------------------------------
describe('2. rate ratios: sample hits on t = n*Ts and zero-order hold', () => {
  // Unit Delay at Ts: hit k happens at t = k*Ts, y(t) = u((k - 1) Ts) for k >= 1 and the initial condition (0) before hit 1
  // (output before update: the output at a hit is the value stored at the previous hit). Held between hits.
  const delay = (ts: number, u: (t: number) => number) => (t: number): number => {
    const k = Math.floor(t / ts + 1e-9);
    return k < 1 ? 0 : u((k - 1) * ts);
  };
  const ramp = (t: number) => t; // Integrator of 1 from 0
  const base = [{ id: 'one', type: 'Constant', params: { value: 1 } }, { id: 'ramp', type: 'Integrator', params: { initialCondition: 0 } }];
  const ud = (id: string, ts: number) => ({ id, type: 'UNIT_DELAY', params: { initialCondition: 0, sampleTime: ts } });
  const check = (r: ReturnType<typeof runModel>, probe: string, oracle: (t: number) => number) => {
    expect(r.t.length).toBeGreaterThan(2);
    r.signals[probe].forEach((v, i) => expect(Math.abs(Number(v) - oracle(r.t[i])), `${probe} at t = ${r.t[i]}`).toBeLessThan(1e-12));
  };
  // [fast, slow, base step = gcd, stop]
  const pairs: [number, number, number, number][] = [[0.1, 0.3, 0.1, 2], [0.2, 0.5, 0.1, 2], [0.1, 0.25, 0.05, 1.5], [0.01, 0.07, 0.01, 0.5]];

  for (const [a, b, dt, stop] of pairs) describe(`Ts pair (${a}, ${b}), base step ${dt}`, () => {
    it('two parallel delays on one ramp each hold their own last sample', () => {
      const r = runModel(buildModel({ blocks: [...base, ud('f', a), ud('s', b)], wires: ['one.out -> ramp.in', 'ramp.out -> f.u', 'ramp.out -> s.u'] }),
        { solver: 'rk4', dt, stopTime: stop, probes: ['f.y', 's.y'] });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      check(r, 'f.y', delay(a, ramp));
      check(r, 's.y', delay(b, ramp));
    });
    it('fast to slow: the slow delay samples the held output of the fast delay (RATE_TRANSITION_REQUIRED warning, run continues)', () => {
      const r = runModel(buildModel({ blocks: [...base, ud('f', a), ud('s', b)], wires: ['one.out -> ramp.in', 'ramp.out -> f.u', 'f.y -> s.u'] }),
        { solver: 'rk4', dt, stopTime: stop, probes: ['f.y', 's.y'] });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const w = r.diagnostics.filter((d) => d.code === 'RATE_TRANSITION_REQUIRED');
      expect(w).toHaveLength(1);
      expect(w[0].severity).toBe('warning');
      check(r, 'f.y', delay(a, ramp));
      check(r, 's.y', delay(b, delay(a, ramp)));
    });
    it('slow to fast: the fast delay re-samples the held slow output at every fast hit', () => {
      const r = runModel(buildModel({ blocks: [...base, ud('f', a), ud('s', b)], wires: ['one.out -> ramp.in', 'ramp.out -> s.u', 's.y -> f.u'] }),
        { solver: 'rk4', dt, stopTime: stop, probes: ['f.y', 's.y'] });
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(r.diagnostics.filter((d) => d.code === 'RATE_TRANSITION_REQUIRED')).toHaveLength(1);
      check(r, 's.y', delay(b, ramp));
      check(r, 'f.y', delay(a, delay(b, ramp)));
    });
  });

  it('equal rates on a direct connection give no RATE_TRANSITION_REQUIRED', () => {
    const r = runModel(buildModel({ blocks: [...base, ud('f', 0.1), ud('s', 0.1)], wires: ['one.out -> ramp.in', 'ramp.out -> f.u', 'f.y -> s.u'] }),
      { solver: 'rk4', dt: 0.1, stopTime: 1, probes: ['s.y'] });
    expect(codes(r.diagnostics)).not.toContain('RATE_TRANSITION_REQUIRED');
    check(r, 's.y', delay(0.1, delay(0.1, ramp)));
  });

  it('the hits fall on the absolute grid n*Ts: a 0.07 s delay changes only at multiples of 0.07 (base step 0.01)', () => {
    const r = runModel(buildModel({ blocks: [...base, ud('s', 0.07)], wires: ['one.out -> ramp.in', 'ramp.out -> s.u'] }),
      { solver: 'rk4', dt: 0.01, stopTime: 0.5, probes: ['s.y'] });
    const changes = r.t.filter((_, i) => i > 0 && Number(r.signals['s.y'][i]) !== Number(r.signals['s.y'][i - 1]));
    // Output changes at hit k (k >= 2, since y(hit 1) = u(0) = 0): t = 0.14, 0.21, 0.28, 0.35, 0.42, 0.49.
    expect(changes.map((t) => Math.round(t * 100))).toEqual([14, 21, 28, 35, 42, 49]);
  });

  it('a fixed step that is not a multiple of Ts is reported: Ts 0.25 at step 0.1 gives SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP (error) and no run', () => {
    // 0.25 / 0.1 = 2.5, not an integer. The diagnostic is the engine's answer to a non-integer ratio on a fixed step.
    const r = runModel(buildModel({ blocks: [...base, ud('s', 0.25)], wires: ['one.out -> ramp.in', 'ramp.out -> s.u'] }),
      { solver: 'rk4', dt: 0.1, stopTime: 1, probes: ['s.y'] });
    const d = r.diagnostics.find((x) => x.code === 'SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP');
    expect(d?.severity).toBe('error');
    expect(r.t).toEqual([]);
  });
  it('a non-integer ratio between the two rates runs when the step is the gcd: Ts 0.1 and 0.25 at step 0.05 (ratio 2.5)', () => {
    const r = runModel(buildModel({ blocks: [...base, ud('f', 0.1), ud('s', 0.25)], wires: ['one.out -> ramp.in', 'ramp.out -> f.u', 'ramp.out -> s.u'] }),
      { solver: 'rk4', dt: 0.05, stopTime: 1, probes: ['f.y', 's.y'] });
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.t.length).toBe(21);
  });
  it('the discrete solver applies the same fixed-step multiple check (Ts 0.07 at step 0.02)', () => {
    const r = runModel(buildModel({ blocks: [ud('d', 0.07), { id: 'k', type: 'Constant', params: { value: 1 } }], wires: ['k.out -> d.u'] }),
      { solver: 'discrete', dt: 0.02, stopTime: 0.2, probes: ['d.y'] });
    expect(codes(r.diagnostics)).toContain('SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP');
  });
  // X-Bridges has no sample-time offset parameter (sample time is a scalar Ts, hits on n*Ts) and no Rate Transition block
  // (the RATE_TRANSITION_REQUIRED text says to use a Unit Delay): offset sample times are reported as not supported in the WP report.
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. Zero crossings of the D2 blocks (variable step) and D15 (fixed step)
// ---------------------------------------------------------------------------------------------------------------------
describe('3. D2 blocks drive an Integrator: the integral is exact in closed form', () => {
  const VARIABLE = ['ode23', 'ode45', 'ode23tb'];
  const stateOf = (e: XbridgesEngine, id: string) => Number((e as unknown as { executionOrder: Array<{ id: string; state: unknown }> }).executionOrder.find((b) => b.id === id)!.state);
  /** Integral of the model's `x` Integrator over [0, T], batch runner (Solvers.runFixedStep) or the canvas loop (runModel, step 0.01). */
  const integral = (spec: ModelSpec, solver: string, T: number, mode: 'batch' | 'live', dt = 0.01, tol?: { relTol: number; absTol: number }): number => {
    if (mode === 'batch') {
      const e = new XbridgesEngine(buildModel(spec));
      Solvers.runFixedStep(e, { solver, startTime: 0, stopTime: T, fixedStep: dt, ...tol } as never);
      expect(e.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
      return stateOf(e, 'x');
    }
    const r = runModel(buildModel(spec), { solver, dt, stopTime: T, probes: ['x.out'], ...tol });
    expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
    return Number(r.signals['x.out'].at(-1));
  };
  const sine = { id: 'sg', type: 'WaveformGen', params: { type: 'Sine', amp: 1, freq: 1, phase: 0 } }; // sin(2 pi t)
  const x = { id: 'x', type: 'Integrator' };
  const SQ3 = Math.sqrt(3);

  interface Case { name: string; spec: ModelSpec; T: number; exact: number; tol: number }
  const cases: Case[] = [
    {
      // Saturation +-0.5 of sin(2 pi t) over [0, 1/2]. sin >= 0.5 for t in [1/12, 5/12].
      // Integral = int_0^{1/12} sin + 0.5 (5/12 - 1/12) + int_{5/12}^{1/2} sin
      //          = (1 - cos(pi/6)) / (2 pi) + 1/6 + (cos(5 pi / 6) - cos(pi)) / (2 pi) = (1 - sqrt(3)/2) / pi + 1/6.
      name: 'SATURATION +-0.5 of sin(2 pi t) over [0, 0.5]',
      spec: { blocks: [sine, { id: 'b', type: 'SATURATION', params: { lowerLimit: -0.5, upperLimit: 0.5 } }, x], wires: ['sg.out -> b.u', 'b.y -> x.in'] },
      T: 0.5, exact: (1 - SQ3 / 2) / Math.PI + 1 / 6, tol: 1e-5,
    },
    {
      // int_0^1 |sin(2 pi t)| dt = 2 * int_0^{1/2} sin(2 pi t) dt = 2 * [(1 - cos pi) / (2 pi)] = 2 / pi.
      name: 'Abs of sin(2 pi t) over [0, 1]',
      spec: { blocks: [sine, { id: 'b', type: 'Abs' }, x], wires: ['sg.out -> b.in', 'b.out -> x.in'] },
      T: 1, exact: 2 / Math.PI, tol: 1e-5,
    },
    {
      // u = t - 1 on [0, 2], dead zone [-0.3, 0.5]: y = u + 0.3 for u < -0.3 (t < 0.7), 0 inside, u - 0.5 for u > 0.5 (t > 1.5).
      // Integral = -int_{-1}^{-0.3} -(u + 0.3) ... = int_{-1}^{-0.3} (u + 0.3) du + int_{0.5}^{1} (u - 0.5) du = -0.7^2/2 + 0.5^2/2 = -0.245 + 0.125 = -0.12.
      name: 'DEADZONE [-0.3, 0.5] of the ramp t - 1 over [0, 2]',
      spec: {
        blocks: [{ id: 'clk', type: 'Clock' }, { id: 'one', type: 'Constant', params: { value: 1 } }, { id: 'sb', type: 'Sum', params: { signs: '+-' } },
          { id: 'b', type: 'DEADZONE', params: { lowerLimit: -0.3, upperLimit: 0.5 } }, x],
        wires: ['clk.clk -> sb.in1', 'one.out -> sb.in2', 'sb.out -> b.u', 'b.y -> x.in'],
      },
      T: 2, exact: -0.12, tol: 1e-5,
    },
    {
      // Relay on = 0.5, off = -0.5 (on 1, off 0), initially off, input sin(2 pi t). On from sin = 0.5 (t = 1/12) until sin = -0.5 (t = 7/12),
      // again from 13/12 to 19/12. On time over [0, 2] = 2 * 1/2 = 1 (piecewise constant integrand).
      name: 'RELAY with hysteresis on sin(2 pi t) over [0, 2]',
      spec: { blocks: [sine, { id: 'b', type: 'RELAY', params: { switchOn: 0.5, switchOff: -0.5, onValue: 1, offValue: 0 } }, x], wires: ['sg.out -> b.u', 'b.y -> x.in'] },
      T: 2, exact: 1, tol: 2e-6,
    },
    {
      // Switch passes u1 = 3 while ctrl = sin(2 pi t) >= 0.3, else u2 = -1. With a = asin(0.3) / (2 pi), sin >= 0.3 for t in [a, 1/2 - a] (length d = 1/2 - 2a).
      // Integral over one period = 3 d - (1 - d) = 4 d - 1 = 1 - 8 a.
      name: 'SWITCH (u2 >= 0.3) on sin(2 pi t) over [0, 1]',
      spec: {
        blocks: [sine, { id: 'u1', type: 'Constant', params: { value: 3 } }, { id: 'u2', type: 'Constant', params: { value: -1 } },
          { id: 'b', type: 'SWITCH', params: { threshold: 0.3, criteria: '>=' } }, x],
        wires: ['u1.out -> b.u1', 'u2.out -> b.u2', 'sg.out -> b.ctrl', 'b.y -> x.in'],
      },
      T: 1, exact: 1 - 8 * Math.asin(0.3) / (2 * Math.PI), tol: 2e-6,
    },
  ];
  // PWM carriers, duty d on 10 whole periods (f = 50 Hz, T = 0.2 s): the on-fraction of one period is
  //   sawtooth, inv_sawtooth, triangle: d;   square (carrier 0.25 / 0.75): 1/2 for d = 0.5;   sine ((sin + 1)/2): 1/2 - asin(2d - 1 ... ) see below.
  // Sine carrier: on while (sin(2 pi p) + 1) / 2 < d, i.e. sin < 2d - 1 = -s; fraction = 1/2 - asin(s) / pi; d = 0.3: s = 0.4.
  const pwm = (carrierType: string, d: number, exactFraction: number): Case => ({
    name: `PWM_GENERATOR ${carrierType} duty ${d}, 50 Hz over 10 periods`,
    spec: { blocks: [{ id: 'c', type: 'Constant', params: { value: d } }, { id: 'b', type: 'PWM_GENERATOR', params: { frequency: 50, carrierType } }, x], wires: ['c.out -> b.duty', 'b.pwm -> x.in'] },
    T: 0.2, exact: 0.2 * exactFraction, tol: 2e-6,
  });
  cases.push(pwm('sawtooth', 0.3, 0.3), pwm('inv_sawtooth', 0.3, 0.3), pwm('triangle', 0.3, 0.3), pwm('square', 0.5, 0.5), pwm('sine', 0.3, 0.5 - Math.asin(0.4) / Math.PI));

  // Tight tolerances (RelTol 1e-8, AbsTol 1e-10): the solver's truncation error is far below the 1e-5 / 2e-6 budget, so what is left is the event handling.
  const TIGHT = { relTol: 1e-8, absTol: 1e-10 };
  for (const c of cases) for (const solver of VARIABLE) for (const mode of ['batch', 'live'] as const) {
    // XBV-415: a crossing exactly on the live output grid (t = 1.5) must not be skipped.
    it(`${c.name}, ${solver} ${mode}, RelTol 1e-8: error <= ${c.tol}`, () => {
      const v = integral(c.spec, solver, c.T, mode, 0.01, TIGHT);
      expect(Math.abs(v - c.exact), `got ${v}, exact ${c.exact}`).toBeLessThanOrEqual(c.tol);
    }, 120_000);
  }
  describe('dead-zone crossing on and off the live output grid (h = 0.01), RelTol 1e-8', () => {
    // u = t, dead zone [-10, L], integral over [0, 2] = int_L^2 (t - L) dt = (2 - L)^2 / 2.
    const dz = (L: number): ModelSpec => ({ blocks: [{ id: 'clk', type: 'Clock' }, { id: 'b', type: 'DEADZONE', params: { lowerLimit: -10, upperLimit: L } }, x], wires: ['clk.clk -> b.u', 'b.y -> x.in'] });
    for (const solver of VARIABLE) {
      it(`${solver}: crossing at t = 1.505 (between grid points): error <= 1e-5`, () => {
        expect(Math.abs(integral(dz(1.505), solver, 2, 'live', 0.01, TIGHT) - (2 - 1.505) ** 2 / 2)).toBeLessThanOrEqual(1e-5);
      }, 120_000);
      // XBV-415: crossing exactly on the grid (t = 1.5, exact in binary).
      it(`${solver}: crossing exactly at t = 1.5 (on the grid): error <= 1e-5`, () => {
        expect(Math.abs(integral(dz(1.5), solver, 2, 'live', 0.01, TIGHT) - 0.125)).toBeLessThanOrEqual(1e-5);
      }, 120_000);
    }
  });

  // Default tolerances (RelTol 1e-3, AbsTol 1e-6): the integrand of the Relay, Switch and PWM cases is piecewise constant, so with the events located the
  // integral must not depend on the tolerance (error <= 2e-6).
  for (const c of cases.filter((k) => k.tol === 2e-6)) for (const solver of VARIABLE) for (const mode of ['batch', 'live'] as const) {
    // XBV-414: no first-same-as-last stage may be reused across a located event.
    it(`${c.name}, ${solver} ${mode}, default tolerances: error <= ${c.tol}`, () => {
      const v = integral(c.spec, solver, c.T, mode, 0.01);
      expect(Math.abs(v - c.exact), `got ${v}, exact ${c.exact}`).toBeLessThanOrEqual(c.tol);
    }, 120_000);
  }

  describe('D15: fixed-step solvers do not locate the crossing; the mode changes at the next major step', () => {
    // SATURATION upper 0.55 (lower -10) of the ramp t, step h = 0.1, stop 1. The region is decided at the major step (start of each step) and held in the
    // minor stages. Steps starting at t_k = 0 ... 0.5 are linear (y = t), steps starting at 0.6 ... 0.9 are saturated (y = 0.55).
    //   rk4 integrates y = t exactly on [0, 0.6]: 0.6^2 / 2 = 0.18; plus 0.4 * 0.55 = 0.22   -> 0.40  (the crossing 0.55 is not located: exact would be 0.55^2/2 + 0.45 * 0.55 = 0.399)
    //   euler: left Riemann sum of t_k over k = 0..5: 0.1 * (0 + 0.1 + 0.2 + 0.3 + 0.4 + 0.5) = 0.15; plus 0.22 -> 0.37.
    const spec: ModelSpec = {
      blocks: [{ id: 'clk', type: 'Clock' }, { id: 'b', type: 'SATURATION', params: { lowerLimit: -10, upperLimit: 0.55 } }, x],
      wires: ['clk.clk -> b.u', 'b.y -> x.in'],
    };
    for (const [solver, expected] of [['rk4', 0.4], ['euler', 0.37]] as const) for (const mode of ['batch', 'live'] as const) {
      it(`SATURATION of a ramp, ${solver} ${mode}, h = 0.1: ${expected} (major-step mode), not the located-crossing value`, () => {
        const v = integral(spec, solver, 1, mode, 0.1);
        expect(Math.abs(v - expected)).toBeLessThanOrEqual(1e-12);
      });
    }
    // SWITCH on the same ramp (u1 = 1 when t >= 0.55 else 0): mode flips at t = 0.6; integral over [0, 1] = 0.4 for rk4 and for euler.
    const sw: ModelSpec = {
      blocks: [{ id: 'clk', type: 'Clock' }, { id: 'u1', type: 'Constant', params: { value: 1 } }, { id: 'u2', type: 'Constant', params: { value: 0 } },
        { id: 'b', type: 'SWITCH', params: { threshold: 0.55, criteria: '>=' } }, x],
      wires: ['u1.out -> b.u1', 'u2.out -> b.u2', 'clk.clk -> b.ctrl', 'b.y -> x.in'],
    };
    for (const solver of ['rk4', 'euler']) for (const mode of ['batch', 'live'] as const) {
      it(`SWITCH threshold 0.55 on a ramp, ${solver} ${mode}, h = 0.1: 0.4`, () => {
        expect(Math.abs(integral(sw, solver, 1, mode, 0.1) - 0.4)).toBeLessThanOrEqual(1e-12);
      });
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. DOE evaluator diagnostic codes (src/engine/doe/integration.ts, modelEvaluator.ts)
// ---------------------------------------------------------------------------------------------------------------------
describe('4. DOE diagnostic codes: one recipe per emitted code, each asserts code and severity', () => {
  type Diag = { code: string; severity: string };
  const rsm = (over: Record<string, unknown> = {}) => ({
    schemaVersion: 1, modelType: 'RSM', factorOrder: ['a', 'b'], responseName: 'y', trainingRowCount: 5, metrics: {},
    rsm: { intercept: 1, terms: [{ name: 'a', factors: [0], powers: [1], coeff: 2 }] }, ...over,
  });
  const gmdh = (layers: unknown, over: Record<string, unknown> = {}) => ({
    schemaVersion: 1, modelType: 'GMDH', factorOrder: ['a', 'b'], responseName: 'y', trainingRowCount: 5, metrics: {}, gmdh: { polyOrder: 2, layers }, ...over,
  });
  const taguchi = (factorLevels: unknown, grandMean: unknown = 10, over: Record<string, unknown> = {}) => ({
    schemaVersion: 1, modelType: 'Taguchi', factorOrder: ['a', 'b'], responseName: 'y', trainingRowCount: 5, metrics: {},
    taguchi: { grandMean, factorLevels }, ...over,
  });
  const lv = (name: string, levels: unknown) => ({ factorName: name, levels });
  const okTag = [lv('a', [{ level: 0, meanY: 9, snr: 0 }]), lv('b', [{ level: 0, meanY: 11, snr: 0 }])];
  const okNeuron = { inputs: [0, 1], coeffs: [0, 1, 0, 0, 0, 0] };
  const stat = (d: { headers: string[]; data: unknown[][] }): Diag[] => fitRSM(d as never).diagnostics ?? [];
  const validate = (m: unknown): Diag[] => validateDOEModelResult(m as never);
  const evalModel = (m: unknown, ins: unknown[] = [1, 2]): Diag[] => { const r = evaluateDOEModelDetailed(m, ins as number[]); expect(r.success).toBe(false); expect(Number.isNaN(r.value)).toBe(true); return r.diagnostic ? [r.diagnostic] : []; };
  const legacy = (eq: string, names: string[], ins: number[]): Diag[] => { const r = evaluateLegacyDOEEquationDetailed(eq, names, ins); expect(r.success).toBe(false); return r.diagnostic ? [r.diagnostic] : []; };
  // A legacy result that validates but has no coefficients to synthesize a deployment from.
  const legacyNoDeployment = { modelType: 'RSM', factorNames: ['a'], responseName: 'y' };

  // The code each recipe must produce, with the severity the source gives it (error unless the third element says warning).
  const recipes: [string, () => Diag[], ('error' | 'warning')?][] = [
    // validateDOEModelResult
    ['UNSUPPORTED_MODEL_TYPE', () => validate(rsm({ modelType: 'Foo' }))],
    ['MISSING_FACTORS', () => validate(rsm({ factorOrder: [] }))],
    ['DUPLICATE_FACTORS', () => validate(rsm({ factorOrder: ['a', 'a'] }))],
    ['MISSING_RESPONSE', () => validate(rsm({ responseName: '  ' }))],
    ['INVALID_SCHEMA_VERSION', () => validate(rsm({ schemaVersion: 2 }))],
    ['MISSING_RSM_PAYLOAD', () => validate(rsm({ rsm: undefined }))],
    ['NON_FINITE_COEFFICIENT', () => validate(rsm({ rsm: { intercept: Number.NaN, terms: [] } }))],
    ['NON_FINITE_COEFFICIENT', () => validate(rsm({ rsm: { intercept: 1, terms: [{ name: 't', factors: [0], powers: [1], coeff: Infinity }] } }))],
    ['NON_FINITE_COEFFICIENT', () => validate(gmdh([[{ inputs: [0, 1], coeffs: [1, Number.NaN] }]]))],
    ['NON_FINITE_COEFFICIENT', () => validate(taguchi(okTag, Number.NaN))],
    ['MALFORMED_TERM_PAYLOAD', () => validate(rsm({ rsm: { intercept: 1, terms: [{ name: 't', factors: 'x', powers: [1], coeff: 1 }] } }))],
    ['TERM_LENGTH_MISMATCH', () => validate(rsm({ rsm: { intercept: 1, terms: [{ name: 't', factors: [0], powers: [1, 2], coeff: 1 }] } }))],
    ['INVALID_FACTOR_INDEX', () => validate(rsm({ rsm: { intercept: 1, terms: [{ name: 't', factors: [5], powers: [1], coeff: 1 }] } }))],
    ['INVALID_TERM_POWER', () => validate(rsm({ rsm: { intercept: 1, terms: [{ name: 't', factors: [0], powers: [0], coeff: 1 }] } }))],
    ['MISSING_GMDH_PAYLOAD', () => validate(gmdh([]))],
    ['EMPTY_GMDH_LAYER', () => validate(gmdh([[]]))],
    ['INVALID_NEURON_STRUCTURE', () => validate(gmdh([[{ inputs: [0], coeffs: [] }]]))],
    ['INVALID_NEURON_INPUT', () => validate(gmdh([[{ inputs: [0, 9], coeffs: [] }]]))],
    ['MISSING_TAGUCHI_PAYLOAD', () => validate(taguchi(okTag, 10, { taguchi: undefined }))],
    ['FACTOR_LEVEL_COUNT_MISMATCH', () => validate(taguchi([okTag[0]]))],
    ['EMPTY_FACTOR_LEVELS', () => validate(taguchi([lv('a', []), okTag[1]]))],
    ['NON_FINITE_LEVEL_STATISTIC', () => validate(taguchi([lv('a', [{ level: 0, meanY: Number.NaN, snr: 0 }]), okTag[1]]))],
    ['MISSING_DEPLOYMENT_MODEL', () => (createXBridgesDOEBlock(legacyNoDeployment as never) as { diagnostics?: Diag[] }).diagnostics ?? []],
    ['MISSING_DEPLOYMENT_MODEL', () => (createVLabDOEBlock(legacyNoDeployment as never) as { diagnostics?: Diag[] }).diagnostics ?? []],
    // evaluateDOEModelDetailed
    ['MISSING_MODEL_PAYLOAD', () => evalModel(null)],
    ['UNSUPPORTED_SCHEMA_VERSION', () => evalModel(rsm({ schemaVersion: 2 }))],
    ['INVALID_FACTOR_ORDER', () => evalModel(rsm({ factorOrder: [] }))],
    ['INSUFFICIENT_INPUTS', () => evalModel(rsm(), [1])],
    ['NON_NUMERIC_INPUT', () => evalModel(rsm(), [1, null])],
    ['NON_FINITE_INPUT', () => evalModel(rsm(), [1, Infinity])],
    ['NON_FINITE_INPUT', () => legacy('y = a + b', ['a', 'b'], [1, Number.NaN])],
    ['INVALID_RSM_PAYLOAD', () => evalModel(rsm({ rsm: undefined }))],
    ['INVALID_FACTOR_INDEX', () => evalModel(rsm({ rsm: { intercept: 1, terms: [{ name: 't', factors: [7], powers: [1], coeff: 1 }] } }))],
    ['NUMERICAL_OVERFLOW', () => evalModel(rsm({ rsm: { intercept: 0, terms: [{ name: 't', factors: [0], powers: [2], coeff: 1e308 }] } }), [1e10, 1])],
    ['NUMERICAL_OVERFLOW', () => evalModel(gmdh([[{ inputs: [0, 1], coeffs: [0, 0, 0, 1e308, 0, 0] }]]), [1e10, 1])],
    ['NUMERICAL_OVERFLOW', () => evalModel(taguchi([lv('a', [{ level: 0, meanY: -1e308, snr: 0 }]), lv('b', [{ level: 0, meanY: -1e308, snr: 0 }])], 1e308), [0, 0])],
    ['NUMERICAL_OVERFLOW', () => legacy('y = 1 / 0', ['a'], [1])],
    ['INVALID_GMDH_PAYLOAD', () => evalModel(gmdh([]))],
    ['EMPTY_GMDH_LAYER', () => evalModel(gmdh([[]]))],
    ['INVALID_NEURON_STRUCTURE', () => evalModel(gmdh([[{ inputs: [0], coeffs: [] }]]))],
    ['INVALID_NEURON_INPUT', () => evalModel(gmdh([[{ inputs: [0, 9], coeffs: [] }]]))],
    ['INVALID_TAGUCHI_PAYLOAD', () => evalModel(taguchi(okTag, Number.NaN))],
    ['FACTOR_LEVEL_COUNT_MISMATCH', () => evalModel(taguchi([okTag[0]]))],
    ['EMPTY_FACTOR_LEVELS', () => evalModel(taguchi([lv('a', []), okTag[1]]))],
    ['NON_FINITE_LEVEL_STATISTIC', () => evalModel(taguchi([lv('a', [{ level: 0, meanY: Number.NaN, snr: 0 }]), okTag[1]]))],
    ['UNSUPPORTED_MODEL_TYPE', () => evalModel(rsm({ modelType: 'Foo' }))],
    // statistics.ts: normalizeInputDataset (reached through fitRSM) and fitRSM
    ['INVALID_HEADERS', () => stat({ headers: ['y'], data: [[1]] })],
    ['DUPLICATE_HEADER', () => stat({ headers: ['a', 'a', 'y'], data: [[1, 2, 3]] })],
    ['EMPTY_DATASET', () => stat({ headers: ['a', 'y'], data: [] })],
    ['RAGGED_ROW', () => stat({ headers: ['a', 'y'], data: [[1, 2], [3]] })],
    ['NON_FINITE_INPUT', () => normalizeInputDataset({ headers: ['a', 'y'], data: [[1, Number.NaN]] }).diagnostics],
    // y = 5 for every row: variance 0 (4 rows, 1 factor: 3 terms, so 1 residual df)
    ['ZERO_VARIANCE_RESPONSE', () => stat({ headers: ['a', 'y'], data: [[-1, 5], [0, 5], [1, 5], [2, 5]] }), 'warning'],
    // 2 rows < 3 terms of a 1-factor quadratic
    ['INSUFFICIENT_DEGREES_OF_FREEDOM', () => stat({ headers: ['a', 'y'], data: [[0, 1], [1, 2]] }), 'warning'],
    // every row has a = 1: coded column is constant, the quadratic design matrix is singular
    ['RANK_DEFICIENT', () => stat({ headers: ['a', 'y'], data: [[1, 1], [1, 2], [1, 3], [1, 4]] })],
    // 3 rows = 3 terms: residual df 0
    ['SATURATED_DESIGN_UNESTIMABLE_INFERENCE', () => stat({ headers: ['a', 'y'], data: [[-1, 1], [0, 3], [1, 2]] }), 'warning'],
    // evaluateLegacyDOEEquationDetailed
    ['INVALID_EQUATION_STRING', () => legacy('', ['a'], [1])],
    ['SECURITY_VALIDATION_FAILED', () => legacy('y = process', ['a'], [1])],
    ['EQUATION_PARSE_ERROR', () => legacy('y = 2 +* ', ['a'], [1])],
  ];

  for (const [code, run, severity = 'error'] of recipes) {
    it(`${code}: ${run.toString().replace(/\s+/g, ' ').slice(6, 70)}`, () => {
      const d = run().filter((x) => x.code === code);
      expect(d.length, `no ${code} in the diagnostics`).toBeGreaterThan(0);
      expect(d.every((x) => x.severity === severity), `severity of ${code}`).toBe(true);
    });
  }

  it('a valid model gives no diagnostics from any of the three entry points (the recipes above are not firing on a healthy base)', () => {
    expect(validate(rsm())).toEqual([]);
    expect(validate(gmdh([[okNeuron]]))).toEqual([]);
    expect(validate(taguchi(okTag))).toEqual([]);
    expect(evaluateDOEModelDetailed(rsm(), [3, 4])).toMatchObject({ success: true, value: 1 + 2 * 3 }); // 1 + 2 a
    expect(evaluateLegacyDOEEquationDetailed('y = a + 2 b', ['a', 'b'], [3, 4])).toMatchObject({ success: true, value: 11 });
  });

  // Every non-test .ts file of src/engine/doe is scanned (directory listing, no fixed list). Emission forms: `code: '..'` / `code = '..'` in any
  // quote style, plus any ALL_CAPS_WITH_UNDERSCORE string literal (catches helper calls such as warn('X', ..)); 'DOE_MODEL' is a block type, not a code.
  const doeDir = join(__dirname, '..', '..', 'doe');
  const doeSources = readdirSync(doeDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort();
  const codesByFile = (): Map<string, Set<string>> => {
    const out = new Map<string, Set<string>>();
    for (const f of doeSources) {
      const src = readFileSync(join(doeDir, f), 'utf8');
      const set = new Set<string>();
      for (const m of src.matchAll(/\bcode\s*[:=]\s*['"`]([A-Z][A-Z0-9_]+)['"`]/g)) set.add(m[1]);
      for (const m of src.matchAll(/['"`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)['"`]/g)) if (m[1] !== 'DOE_MODEL') set.add(m[1]);
      out.set(f, set);
    }
    return out;
  };
  it('coverage: every diagnostic code literal in every non-test file of src/engine/doe has a recipe, and every recipe names an emitted code', () => {
    const byFile = codesByFile();
    expect([...byFile.keys()]).toEqual(expect.arrayContaining(['integration.ts', 'modelEvaluator.ts', 'statistics.ts']));
    const found = new Set([...byFile.values()].flatMap((s) => [...s]));
    const covered = new Set(recipes.map(([c]) => c));
    expect([...found].filter((c) => !covered.has(c)).sort()).toEqual([]);
    expect([...covered].filter((c) => !found.has(c)).sort()).toEqual([]);
    // 41 distinct codes: integration.ts 20, modelEvaluator.ts 22 (with NON_FINITE_INPUT, INVALID_FACTOR_INDEX shared, etc.), statistics.ts 9; union 41.
    expect(found.size).toBe(41);
    expect(byFile.get('statistics.ts')!.size).toBe(9);
  });
  it('severity: the codes the sources give severity warning are exactly ZERO_VARIANCE_RESPONSE, INSUFFICIENT_DEGREES_OF_FREEDOM, SATURATED_DESIGN_UNESTIMABLE_INFERENCE; the rest are error', () => {
    const warn = new Set<string>();
    for (const f of doeSources) {
      const src = readFileSync(join(doeDir, f), 'utf8');
      for (const m of src.matchAll(/code:\s*'([A-Z_]+)',\s*severity:\s*'(\w+)'/g)) {
        expect(['error', 'warning']).toContain(m[2]);
        if (m[2] === 'warning') warn.add(m[1]);
      }
    }
    expect([...warn].sort()).toEqual(['INSUFFICIENT_DEGREES_OF_FREEDOM', 'SATURATED_DESIGN_UNESTIMABLE_INFERENCE', 'ZERO_VARIANCE_RESPONSE']);
    for (const [code, , sev = 'error'] of recipes) expect(sev === 'warning', code).toBe(warn.has(code));
  });
});
