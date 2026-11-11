/**
 * WP-07 — gates V2/V3/V4 for control, signal processing & observers, optimisation & modelling blocks.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 2, 3, 4.2 rows "Control" and
 * "Signal processing & observers", 9).
 *
 * Oracles (written here, never taken from the code under test):
 *  - closed forms: PI / PD / filtered-derivative step responses, closed-loop 1/(s+1) with a PI controller, the
 *    Discrete Impulse, the quadratic response surface, the PI speed controller;
 *  - hand-computed difference equations for the discrete PID variants (Simulink PID Controller forward Euler,
 *    backward Euler, trapezoidal; see the comments next to each case);
 *  - a reference implementation of the Simulink Kalman Filter block (discrete, time-varying, "use current
 *    measurement") written in this file with plain 2x2 arithmetic;
 *  - statistics of N(mean, variance) for the noise source, with Math.random replaced by mulberry32.
 * Dynamic cases run through the canvas loop (testkit runModel); stateful discrete blocks are also driven block-level
 * with the state threaded through execute as the engine does.
 * Failures of the product are pinned with it.fails and a provisional id XBV-2nn (the controller renumbers).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { buildModel, mulberry32, runModel, type RunResult } from '../testkit';

type B = { id: string; type: string; params?: Record<string, unknown> };

const sim = (
  blocks: B[], wires: string[], probes: string[],
  o: { solver?: string; dt?: number; stop?: number } = {},
): RunResult => runModel(buildModel({ blocks, wires }), {
  solver: o.solver ?? 'rk4', dt: o.dt ?? 0.01, stopTime: o.stop ?? 1, probes,
});
const sampleIndex = (r: RunResult, t: number) => {
  const i = r.t.findIndex((x) => Math.abs(x - t) < 1e-9);
  expect(i, `no sample at t=${t} (run has ${r.t.length} samples)`).toBeGreaterThanOrEqual(0);
  return i;
};
const valueAt = (r: RunResult, probe: string, t: number): unknown => r.signals[probe][sampleIndex(r, t)];
const num = (v: unknown): number => Number(Array.isArray(v) ? (v.flat(Infinity) as unknown[])[0] : v);
const flat = (v: unknown): number[] => (Array.isArray(v) ? (v as unknown[]).flatMap(flat) : [Number(v)]);
const near = (actual: number, expected: number, tol: number, what = '') =>
  expect(Math.abs(actual - expected), `${what} got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tol);
const constant = (id: string, value: unknown): B => ({ id, type: 'Constant', params: { value } });

/** Block-level execution with the state threaded through (one call per step, `ts` apart), as the engine does. */
const threadN = (type: string, params: Record<string, unknown>, steps: unknown[][], ts = 0.1) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  let state = b.state;
  const outs: unknown[][] = [];
  const states: any[] = [];
  steps.forEach((ins, k) => {
    const r = b.execute(ins as never, b.params, state, k * ts);
    if (r.nextState !== undefined) state = r.nextState;
    outs.push(r.outputs as unknown[]);
    states.push(state);
  });
  return { outs, states };
};

// ---------------------------------------------------------------------------------------------------------------
describe('A. PID_BASIC (continuous, rk4)', () => {
  const pid = (params: Record<string, unknown>, dt = 0.01, stop = 1, extra: B[] = [], wires: string[] = []) =>
    sim([constant('e', 1), { id: 'p', type: 'PID_BASIC', params }, ...extra], ['e.out -> p.e', ...wires], ['p.u'], { dt, stop });

  // Oracle: e = 1 from t = 0. P: u = Kp e = 2.5.   PI: u(t) = Kp + Ki t.
  it("mode 'P' Kp 2.5 gives u = 2.5 at every sample", () => {
    const r = pid({ mode: 'P', Kp: 2.5 });
    r.t.forEach((t, k) => near(num(r.signals['p.u'][k]), 2.5, 1e-12, `t=${t}`));
  });
  it("mode 'PI' Kp 2 Ki 3 gives u(t) = 2 + 3 t, u(1) = 5", () => {
    const r = pid({ mode: 'PI', Kp: 2, Ki: 3 });
    near(num(valueAt(r, 'p.u', 1)), 5, 1e-8, 't=1');
    near(num(valueAt(r, 'p.u', 0.5)), 3.5, 1e-8, 't=0.5');
    near(num(valueAt(r, 'p.u', 0)), 2, 1e-12, 't=0');
  });
  // Oracle: limit max 2 with Kp 1 Ki 10: u = min(1 + 10 t, 2); u(0.05) = 1.5, u(1) = 2 exactly.
  it('output limit max 2 with Kp 1 Ki 10: u = min(1 + 10 t, 2), u(1) = 2 exactly', () => {
    const r = pid({ mode: 'PI', Kp: 1, Ki: 10, max: 2 });
    near(num(valueAt(r, 'p.u', 0.05)), 1.5, 1e-8, 't=0.05');
    expect(num(valueAt(r, 'p.u', 1))).toBe(2);
    r.t.forEach((t, k) => expect(num(r.signals['p.u'][k])).toBeLessThanOrEqual(2));
  });
  // Oracle: D(s) = Kd N s/(s + N) on e = 1 gives u(t) = Kd N e^{-N t}; Kd N = 1, so u = e^{-100 t}.
  it("filtered derivative: mode 'PD' Kp 0 Kd 0.01 N 100 gives u = e^{-100 t} (t = 0.01, 0.05), u(0) = Kd N = 1", () => {
    const r = pid({ mode: 'PD', Kp: 0, Kd: 0.01, N: 100 }, 1e-4, 0.05);
    near(num(valueAt(r, 'p.u', 0)), 1, 1e-12, 'u(0)');
    for (const t of [0.01, 0.05]) near(num(valueAt(r, 'p.u', t)), Math.exp(-100 * t), 1e-6, `t=${t}`);
  });

  // Oracle (Simulink PID Controller, external enable/reset): enable = 0 gives u = 0 and holds the integrator;
  // it resumes from the held value. Continuous case: enable = Step(0 -> 1 at 0.5), e = 1, Kp 1 Ki 1: the integral
  // accrues only over [0.5, t], so u(1) = 1 + 0.5 = 1.5 (tolerance 0.02 covers the XBV-067 stage leak of the Step).
  it('enable = 0 gives u = 0 while disabled', () => {
    const r = pid({ mode: 'PI', Kp: 1, Ki: 1 }, 0.01, 1, [{ id: 'en', type: 'Step', params: { stepTime: 0.5, initialValue: 0, finalValue: 1 } }], ['en.out -> p.enable']);
    near(num(valueAt(r, 'p.u', 0.25)), 0, 1e-12, 'u(0.25)');
  });
  it.fails('XBV-201: continuous PID_BASIC holds its integrator while enable = 0 (Step enable 0 -> 1 at 0.5: u(1) = 1.5)', () => {
    const r = pid({ mode: 'PI', Kp: 1, Ki: 1 }, 0.01, 1, [{ id: 'en', type: 'Step', params: { stepTime: 0.5, initialValue: 0, finalValue: 1 } }], ['en.out -> p.enable']);
    near(num(valueAt(r, 'p.u', 1)), 1.5, 0.02, 'u(1)');
  });
  // Oracle: reset = 1 (level) holds the integrator at 0 and the output is the proportional (and derivative) part:
  // u = Kp e = 1.
  it.fails('XBV-202: continuous PID_BASIC with reset = 1: integrator held at 0 and u = Kp e (= 1) during the reset', () => {
    const r = pid({ mode: 'PI', Kp: 1, Ki: 1 }, 0.01, 1, [constant('rs', 1)], ['rs.out -> p.reset']);
    near(num(valueAt(r, 'p.u', 1)), 1, 1e-8, 'u(1)');
  });
  it.fails('XBV-203: continuous PID_BASIC with reset = 1 does not accumulate an integral (u(0.5) = Kp e = 1)', () => {
    const r = pid({ mode: 'PI', Kp: 1, Ki: 1 }, 0.01, 1, [constant('rs', 1)], ['rs.out -> p.reset']);
    near(num(valueAt(r, 'p.u', 0.5)), 1, 1e-8, 'u(0.5)');
  });

  // Discrete enable/reset, block-level (Ts 0.1, forward Euler, PI Kp 1 Ki 2, e = 1). Hand values:
  // k = 0: u = 1, k = 1: 1.2 (integral 0.2 held in the state).
  const dpid = { mode: 'PI', Kp: 1, Ki: 2, sampleTime: 0.1, method: 'forward_euler' };
  it('discrete enable = 0 gives u = 0 and freezes the integral; on return the sequence continues (k = 2 gives 1.4)', () => {
    const { outs } = threadN('PID_BASIC', dpid, [[1, 1, 0], [1, 1, 0], [1, 0, 0], [1, 0, 0], [1, 1, 0]]);
    expect(outs.map((o) => Number(o[0]))).toEqual([1, expect.closeTo(1.2, 12), 0, 0, expect.closeTo(1.4, 12)]);
  });
  it('discrete reset = 1 clears the integral: after the reset the sequence restarts at 1, 1.2', () => {
    const { outs } = threadN('PID_BASIC', dpid, [[1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 1], [1, 1, 0], [1, 1, 0]]);
    const u = outs.map((o) => Number(o[0]));
    near(u[4], 1, 1e-12, 'first sample after reset');
    near(u[5], 1.2, 1e-12, 'second sample after reset');
  });
  it.fails('XBV-204: PID_BASIC reset = 1 (discrete): output during the reset is Kp e = 1, not 0', () => {
    const { outs } = threadN('PID_BASIC', dpid, [[1, 1, 0], [1, 1, 0], [1, 1, 1]]);
    near(Number(outs[2][0]), 1, 1e-12, 'u during reset');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('B. PID_CONTROLLER (setpoint weighting, outputs, closed loop)', () => {
  it('r = 1, y = 0.25, Kp 2, Ki 0, Kd 0, beta 0.5: p_term = Kp (beta r - y) = 0.5, error = 0.75 (block-level)', () => {
    const { outs } = threadN('PID_CONTROLLER', { mode: 'PID', Kp: 2, Ki: 0, Kd: 0, beta: 0.5, sampleTime: 0.1 }, [[1, 0.25, 1, 0]]);
    near(Number(outs[0][2]), 0.5, 1e-12, 'p_term');
    near(Number(outs[0][1]), 0.75, 1e-12, 'error');
    near(Number(outs[0][0]), 0.5, 1e-12, 'u');
  });

  // Oracle (canvas, rk4 dt 0.01, r = 1, y = 0.25): Kp 2, Ki 1.5, Kd 0.5, N 10, beta 0.5, gamma 0.5.
  //   error = r - y = 0.75, p_term = 2 (0.5 - 0.25) = 0.5, i_term = Ki error t = 1.125 t,
  //   d_term = Kd N (gamma r - y) e^{-N t} = 0.5 * 10 * 0.25 * e^{-10 t} = 1.25 e^{-10 t}, u = p + i + d.
  const full = () => sim([constant('r', 1), constant('y', 0.25),
    { id: 'c', type: 'PID_CONTROLLER', params: { mode: 'PID', Kp: 2, Ki: 1.5, Kd: 0.5, N: 10, beta: 0.5, gamma: 0.5 } }],
    ['r.out -> c.r', 'y.out -> c.y'], ['c.u', 'c.error', 'c.p_term', 'c.i_term', 'c.d_term']);
  it('error output = r - y = 0.75 and p_term = Kp (beta r - y) = 0.5 at every sample', () => {
    const r = full();
    r.t.forEach((t, k) => {
      near(num(r.signals['c.error'][k]), 0.75, 1e-12, `error t=${t}`);
      near(num(r.signals['c.p_term'][k]), 0.5, 1e-12, `p_term t=${t}`);
    });
  });
  it('i_term = Ki (r - y) t and d_term = Kd N (gamma r - y) e^{-N t} (setpoint weight gamma acts on the derivative)', () => {
    const r = full();
    for (const t of [0.1, 0.5, 1]) {
      near(num(valueAt(r, 'c.i_term', t)), 1.125 * t, 1e-8, `i_term t=${t}`);
      near(num(valueAt(r, 'c.d_term', t)), 1.25 * Math.exp(-10 * t), 2e-6, `d_term t=${t}`); // rk4 truncation at N h = 0.1
    }
    near(num(valueAt(r, 'c.d_term', 0)), 1.25, 1e-12, 'd_term(0)');
  });
  it('u = p_term + i_term + d_term at every sample (1e-12)', () => {
    const r = full();
    r.t.forEach((t, k) => near(num(r.signals['c.u'][k]),
      num(r.signals['c.p_term'][k]) + num(r.signals['c.i_term'][k]) + num(r.signals['c.d_term'][k]), 1e-12, `t=${t}`));
  });

  // Oracle: PI Kp 1 Ki 1 (s+1)/s on plant 1/(s+1): L = 1/s, closed loop 1/(s+1), y = 1 - e^{-t}.
  const loop = (params: Record<string, unknown>, stop: number, dt = 0.001) => sim(
    [constant('r', 1), { id: 'c', type: 'PID_CONTROLLER', params }, { id: 'g', type: 'TRANSFER_FUNCTION', params: { numerator: [1], denominator: [1, 1] } }],
    ['r.out -> c.r', 'g.y -> c.y', 'c.u -> g.u'], ['g.y'], { dt, stop });
  // The PID blocks are stateful and do not declare directFeedthrough, so the engine sorts them as having none
  // (XbridgesEngine.isFeedthrough: directFeedthrough ?? !isStateful) although u contains Kp (beta r - y). In a loop the
  // controller then reads the plant output of the previous evaluation and rk4 degrades to first order (error 4.6e-5 at
  // t = 1 for dt 0.001, halving with dt; the same loop built from Sum + Integrator has 3e-11).
  it.fails('XBV-207: closed loop PI Kp 1 Ki 1 with plant 1/(s+1) is rk4-accurate: y = 1 - e^{-t} at t = 0.5, 1, 3 (1e-6); PID_CONTROLLER needs directFeedthrough', () => {
    const r = loop({ mode: 'PI', Kp: 1, Ki: 1 }, 3);
    for (const t of [0.5, 1, 3]) near(num(valueAt(r, 'g.y', t)), 1 - Math.exp(-t), 1e-6, `t=${t}`);
  });
  // Oracle: P only Kp 4: y = 0.8 (1 - e^{-5 t}), steady state 0.8.
  it('closed loop P only Kp 4: steady state 0.8 at t = 5 (1e-6)', () => {
    const r = loop({ mode: 'P', Kp: 4 }, 5, 0.005);
    near(num(valueAt(r, 'g.y', 5)), 0.8, 1e-6, 't=5');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('C. discrete PID (Ts 0.1, PI Kp 1 Ki 2, e = 1, solver discrete)', () => {
  // Hand computation of the Simulink PID Controller discrete integrator, e = 1, T = 0.1, Ki T = 0.2:
  //   forward Euler   I(k) = I(k-1) + T e(k-1)        u(k) = 1 + 0.2 k                    1, 1.2, 1.4, 1.6, 1.8, 2.0
  //   backward Euler  I(k) = I(k-1) + T e(k)          u(k) = 1 + 0.2 (k+1)                1.2, 1.4, 1.6, 1.8, 2.0, 2.2
  //   trapezoidal (the block names it 'tustin')   I(k) = I(k-1) + T/2 (e(k)+e(k-1)), e(-1) = 0:  u(0) = 1 + 0.1, u(k) = 1 + 0.2 (k + 0.5) for k >= 1
  //                                                                                       1.1, 1.3, 1.5, 1.7, 1.9, 2.1
  const expected: Record<string, number[]> = {
    forward_euler: [1, 1.2, 1.4, 1.6, 1.8, 2.0],
    backward_euler: [1.2, 1.4, 1.6, 1.8, 2.0, 2.2],
    trapezoidal: [1.1, 1.3, 1.5, 1.7, 1.9, 2.1],
  };
  const methodParam: Record<string, string> = { forward_euler: 'forward_euler', backward_euler: 'backward_euler', trapezoidal: 'tustin' };
  for (const method of Object.keys(expected)) {
    it(`PID_BASIC ${method}: u(k) for k = 0..5 (canvas, discrete solver)`, () => {
      const r = sim([constant('e', 1), { id: 'p', type: 'PID_BASIC', params: { mode: 'PI', Kp: 1, Ki: 2, sampleTime: 0.1, method: methodParam[method] } }],
        ['e.out -> p.e'], ['p.u'], { solver: 'discrete', dt: 0.1, stop: 0.5 });
      expected[method].forEach((u, k) => near(num(r.signals['p.u'][k]), u, 1e-12, `${method} k=${k}`));
    });
    it(`PID_CONTROLLER ${method}: u(k) for k = 0..5 (canvas, discrete solver)`, () => {
      const r = sim([constant('r', 1), constant('y', 0), { id: 'p', type: 'PID_CONTROLLER', params: { mode: 'PI', Kp: 1, Ki: 2, sampleTime: 0.1, method: methodParam[method] } }],
        ['r.out -> p.r', 'y.out -> p.y'], ['p.u'], { solver: 'discrete', dt: 0.1, stop: 0.5 });
      expected[method].forEach((u, k) => near(num(r.signals['p.u'][k]), u, 1e-12, `${method} k=${k}`));
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
describe('D. KALMAN_FILTER and EXTENDED_KALMAN_FILTER', () => {
  type M = number[][];
  const mul = (a: M, b: M): M => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
  const tr = (a: M): M => a[0].map((_, j) => a.map((row) => row[j]));
  const add = (a: M, b: M): M => a.map((row, i) => row.map((v, j) => v + b[i][j]));
  const sub = (a: M, b: M): M => a.map((row, i) => row.map((v, j) => v - b[i][j]));

  const A: M = [[1, 0.01], [0, 1]], Bm: M = [[0.00005], [0.01]], C: M = [[1, 0]];
  const Q: M = [[0.01, 0], [0, 0.01]], R: M = [[0.1]], P0: M = [[1, 0], [0, 1]], I2: M = [[1, 0], [0, 1]];

  /**
   * Reference: Simulink Kalman Filter block, discrete time-varying, "use current measurement" (output x[n|n]).
   * x[0|-1] = 0, P[0|-1] = Pstart. Each sample: update with y(n), output, then predict with u(n).
   */
  const reference = (ys: number[], us: number[], Pstart: M) => {
    let x: M = [[0], [0]];
    let P = Pstart;
    return ys.map((y, n) => {
      const S = mul(mul(C, P), tr(C))[0][0] + R[0][0];            // scalar innovation covariance
      const K = mul(mul(P, tr(C)), [[1 / S]]);
      const innovation = y - mul(C, x)[0][0];
      const xu = add(x, K.map((row) => [row[0] * innovation]));
      const Pu = mul(sub(I2, mul(K, C)), P);
      const out = { x_hat: [xu[0][0], xu[1][0]], y_hat: mul(C, xu)[0][0], innovation, kg: [K[0][0], K[1][0]] };
      x = add(mul(A, xu), mul(Bm, [[us[n]]]));
      P = add(mul(mul(A, Pu), tr(A)), Q);
      return out;
    });
  };
  const N = 200;
  const ys = Array.from({ length: N }, (_, n) => Math.sin(0.05 * n));
  const zeros = Array(N).fill(0);
  const relTol = (a: number, b: number) => Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(b));
  const blockRun = (type: string, us: number[], yv: number[]) => threadN(type, {}, yv.map((y, n) => [us[n], y]), 1).outs;

  it.fails('XBV-205: KALMAN_FILTER first update uses the prior P[0|-1] = P0 (no covariance prediction before the first measurement); x_hat over 200 steps matches the reference to 1e-10', () => {
    const ref = reference(ys, zeros, P0);
    const out = blockRun('KALMAN_FILTER', zeros, ys);
    out.forEach((o, n) => {
      const xh = flat(o[0]);
      expect(relTol(xh[0], ref[n].x_hat[0]) && relTol(xh[1], ref[n].x_hat[1]), `n=${n}: x_hat ${xh} vs ${ref[n].x_hat}`).toBe(true);
    });
  });
  // Characterization of the variant the block implements: predict-then-update from the posterior x[-1|-1] = 0,
  // P[-1|-1] = P0, i.e. the reference started from P[0|-1] = A P0 A' + Q. Everything after the first sample then agrees.
  it('KALMAN_FILTER equals the reference started from P[0|-1] = A P0 A\' + Q (x_hat, y_hat, innovation, kg over 200 steps, 1e-10)', () => {
    const ref = reference(ys, zeros, add(mul(mul(A, P0), tr(A)), Q));
    const out = blockRun('KALMAN_FILTER', zeros, ys);
    out.forEach((o, n) => {
      const xh = flat(o[0]), kg = flat(o[3]);
      expect(relTol(xh[0], ref[n].x_hat[0]) && relTol(xh[1], ref[n].x_hat[1]), `n=${n}: x_hat ${xh} vs ${ref[n].x_hat}`).toBe(true);
      expect(relTol(flat(o[1])[0], ref[n].y_hat), `n=${n}: y_hat`).toBe(true);
      expect(relTol(flat(o[2])[0], ref[n].innovation), `n=${n}: innovation`).toBe(true);
      expect(relTol(kg[0], ref[n].kg[0]) && relTol(kg[1], ref[n].kg[1]), `n=${n}: kg ${kg} vs ${ref[n].kg}`).toBe(true);
    });
  });
  // Oracle: x[0|-1] = 0, so the first innovation is y(0) - C x[0|-1] = y(0) whatever u(0) is
  // (x[n+1|n] = A x[n|n] + B u(n): u(0) acts on the NEXT sample).
  it.fails('XBV-206: KALMAN_FILTER first innovation = y(0) - C x[0|-1] = y(0) (u(0) = 1 only affects x[1|0])', () => {
    const out = threadN('KALMAN_FILTER', {}, [[1, 0.3]], 1).outs;
    near(flat(out[0][2])[0], 0.3, 1e-12, 'innovation(0)');
  });
  it('KALMAN_FILTER: P stays symmetric and positive definite over 10^4 steps (P read from the block state)', () => {
    const steps = Array.from({ length: 10000 }, (_, n) => [0, Math.sin(0.05 * n)]);
    const { states } = threadN('KALMAN_FILTER', {}, steps, 1);
    let asym = 0, minDet = Infinity, minDiag = Infinity;
    for (const s of states) {
      const P = s.P as M;
      asym = Math.max(asym, Math.abs(P[0][1] - P[1][0]));
      minDet = Math.min(minDet, P[0][0] * P[1][1] - P[0][1] * P[1][0]);
      minDiag = Math.min(minDiag, P[0][0], P[1][1]);
    }
    expect(asym, 'max |P01 - P10|').toBeLessThanOrEqual(1e-12);
    expect(minDiag, 'min diagonal').toBeGreaterThan(0);
    expect(minDet, 'min determinant').toBeGreaterThan(0);
  });

  // Metamorphic: the EKF with its default linear f, h is the same model as the KF defaults (x0 = 0).
  const compareEkf = (us: number[], tol: number, ports: number[]) => {
    const kf = blockRun('KALMAN_FILTER', us, ys);
    const ekf = blockRun('EXTENDED_KALMAN_FILTER', us, ys);
    kf.forEach((o, n) => {
      for (const port of ports) {
        const a = flat(ekf[n][port]), b = flat(o[port]);
        expect(a.length).toBe(b.length);
        a.forEach((v, i) => expect(Math.abs(v - b[i]) <= tol * Math.max(1, Math.abs(b[i])), `n=${n} port ${port}[${i}]: ekf ${v} vs kf ${b[i]}`).toBe(true));
      }
    });
  };
  // The EKF takes its Jacobians by central differences with eps = 1e-6 on an exactly linear model; the round-off of
  // (f(x+eps) - f(x-eps))/(2 eps) is ~1e-10 per entry and accumulates in P: the largest x_hat deviation from the KF over
  // 200 steps is 2.2e-9 (u = 0) and 2.1e-9 (u = cos(0.1 n)). The oracle is 1e-9.
  it.fails('XBV-211: EXTENDED_KALMAN_FILTER default f, h: x_hat equals KALMAN_FILTER x_hat at every step to 1e-9 (u = 0, y = sin(0.05 n))', () => {
    compareEkf(zeros, 1e-9, [0]);
  });
  it('EXTENDED_KALMAN_FILTER default f, h equals KALMAN_FILTER at every step to 1e-7 (x_hat, y_hat, innovation; u = cos(0.1 n))', () => {
    compareEkf(Array.from({ length: N }, (_, n) => Math.cos(0.1 * n)), 1e-7, [0, 1, 2]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('E. MPC_CONTROLLER (double integrator, Q = [[10]])', () => {
  const Am = [[1, 0.1], [0, 1]], Bm = [[0], [0.1]];
  // Closed loop with x(k+1) = A x + B u (block-level, state threaded through execute as the engine does).
  const closed = (extra: Record<string, unknown>, steps = 100) => {
    const b = BLOCK_LIBRARY['MPC_CONTROLLER']('m', { Q: [[10]], ...extra });
    let state = b.state;
    let x = [0, 0];
    const u: number[] = [];
    for (let k = 0; k < steps; k++) {
      const r = b.execute([x, [1]] as never, b.params, state, k * 0.1);
      state = r.nextState ?? state;
      const uk = Number(r.outputs[0]);
      u.push(uk);
      x = [Am[0][0] * x[0] + Am[0][1] * x[1] + Bm[0][0] * uk, Am[1][0] * x[0] + Am[1][1] * x[1] + Bm[1][0] * uk];
    }
    return { u, xEnd: x };
  };
  // Defaults (Np 10, Nc 3): MpcSolver.solve warm-starts from u_seq = result.u, but the block returns only u[0] as
  // the next u_seq (BlockDefinitions MPC_CONTROLLER execute: nextState.u_seq = result.u, solve() returns first_u = the
  // first nu entries), so the second call multiplies H (Nc*nu = 3) by a vector of length 1 and throws.
  it.fails('XBV-208: MPC_CONTROLLER with Nc = 3 can be called a second time (warm start has Nc*nu entries)', () => {
    closed({}, 2);
  });
  it.fails('XBV-209: MPC_CONTROLLER (defaults, Nc 3): after 100 steps |y - 1| < 1e-3 for r = 1', () => {
    expect(Math.abs(closed({}).xEnd[0] - 1)).toBeLessThan(1e-3);
  });
  it.fails('XBV-210: MPC_CONTROLLER (defaults, Nc 3) with u_max = 0.01: u <= 0.01 at every one of 100 steps', () => {
    closed({ u_max: 0.01 }).u.forEach((v, k) => expect(v, `k=${k}`).toBeLessThanOrEqual(0.01));
  });
  // Nc = 1 avoids the warm-start defect (u_seq has Nc*nu = 1 entry), so constraint satisfaction can be checked.
  it('Nc = 1: u stays within [u_min, u_max] = [-10, 10] at every step', () => {
    closed({ Nc: 1 }).u.forEach((v, k) => { expect(v, `k=${k}`).toBeGreaterThanOrEqual(-10); expect(v, `k=${k}`).toBeLessThanOrEqual(10); });
  });
  it('Nc = 1, u_max = 0.01: the constraint u <= 0.01 holds at every step (and u >= u_min)', () => {
    closed({ Nc: 1, u_max: 0.01 }).u.forEach((v, k) => { expect(v, `k=${k}`).toBeLessThanOrEqual(0.01); expect(v, `k=${k}`).toBeGreaterThanOrEqual(-10); });
  });
  it('Nc = 1, u_min = -0.02, u_max = 0.01: both bounds hold at every step', () => {
    closed({ Nc: 1, u_min: -0.02, u_max: 0.01 }).u.forEach((v, k) => { expect(v, `k=${k}`).toBeGreaterThanOrEqual(-0.02); expect(v, `k=${k}`).toBeLessThanOrEqual(0.01); });
  });
  it('Nc = 1: after 100 steps |y - 1| < 1e-3 for r = 1', () => {
    expect(Math.abs(closed({ Nc: 1 }).xEnd[0] - 1)).toBeLessThan(1e-3);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('F. noise sources', () => {
  afterEach(() => vi.restoreAllMocks());
  const draw = (params: Record<string, unknown>, n: number, seed = 1) => {
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
    const b = BLOCK_LIBRARY['WHITE_NOISE']('w', params);
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = Number(b.execute([] as never, b.params, b.state, i * 0.01).outputs[0]);
    vi.restoreAllMocks();
    return out;
  };
  const stats = (v: number[]) => {
    const n = v.length;
    const mean = v.reduce((s, x) => s + x, 0) / n;
    const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
    const r1 = v.slice(1).reduce((s, x, i) => s + (x - mean) * (v[i] - mean), 0) / (n - 1) / variance;
    return { mean, variance, r1 };
  };
  const N = 100000;
  it('WHITE_NOISE mean 0 variance 1 (10^5 samples, mulberry32(1)): |mean| < 4/sqrt(N) sigma, |var - 1| < 0.03, |r1| < 0.02', () => {
    const s = stats(draw({}, N));
    expect(Math.abs(s.mean)).toBeLessThan(4 / Math.sqrt(N));
    expect(Math.abs(s.variance - 1)).toBeLessThan(0.03);
    expect(Math.abs(s.r1)).toBeLessThan(0.02);
  });
  it('WHITE_NOISE mean 2 variance 4: mean ~ 2 (4 sigma/sqrt(N) with sigma 2), variance ~ 4 (0.12), |r1| < 0.02', () => {
    const s = stats(draw({ mean: 2, variance: 4 }, N));
    expect(Math.abs(s.mean - 2)).toBeLessThan(4 * 2 / Math.sqrt(N));
    expect(Math.abs(s.variance - 4)).toBeLessThan(0.12);
    expect(Math.abs(s.r1)).toBeLessThan(0.02);
  });
  it('WHITE_NOISE with the same seed twice gives identical sequences; another seed differs', () => {
    const a = draw({}, 1000, 1), b = draw({}, 1000, 1), c = draw({}, 1000, 2);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('G. DISCRETE_IMPULSE, DOE_MODEL, SPEED_CONTROLLER, CURRENT_CONTROLLER_DQ', () => {
  // Oracle (Simulink Discrete Impulse): amplitude at sample index = delay, 0 elsewhere.
  it('DISCRETE_IMPULSE amplitude 2, delay 3, Ts 0.1, solver discrete dt 0.1: 2 at k = 3 only', () => {
    const r = sim([{ id: 'i', type: 'DISCRETE_IMPULSE', params: { amplitude: 2, delay: 3, sampleTime: 0.1 } }], [], ['i.out'],
      { solver: 'discrete', dt: 0.1, stop: 1 });
    expect(r.signals['i.out'].map(num)).toEqual(r.t.map((_, k) => (k === 3 ? 2 : 0)));
  });
  it('DISCRETE_IMPULSE delay 0: the impulse is the first sample', () => {
    const r = sim([{ id: 'i', type: 'DISCRETE_IMPULSE', params: { amplitude: 1, delay: 0, sampleTime: 0.1 } }], [], ['i.out'],
      { solver: 'discrete', dt: 0.1, stop: 0.5 });
    expect(r.signals['i.out'].map(num)).toEqual([1, 0, 0, 0, 0, 0]);
  });

  // Oracle: Y = 2 + 3 X1 - 0.5 X1^2.
  it('DOE_MODEL RSM equation Y = 2 + 3*X1 - 0.5*X1^2: out = -1.5, 2, 6 at u = -1, 0, 2', () => {
    const b = BLOCK_LIBRARY['DOE_MODEL']('d', { modelType: 'RSM', inputNames: ['X1'], equation: 'Y = 2 + 3*X1 - 0.5*X1^2' });
    for (const [u, y] of [[-1, -1.5], [0, 2], [2, 6]]) {
      const r = b.execute([u] as never, b.params, b.state, 0);
      expect(r.error, `u=${u}`).toBeUndefined();
      near(Number(r.outputs[0]), y, 1e-12, `u=${u}`);
    }
  });

  // Oracle: PI Kp 0.5 Ki 5 on a constant speed error 2: iq_ref(t) = min(Kp e + Ki e t, maxIq) = min(1 + 10 t, 10).
  const speed = (probeT: number[]) => {
    const r = sim([constant('w', 2), constant('a', 0), { id: 's', type: 'SPEED_CONTROLLER', params: { Kp: 0.5, Ki: 5, maxIq: 10 } }],
      ['w.out -> s.speed_ref', 'a.out -> s.speed_actual'], ['s.iq_ref'], { stop: 1.2 });
    return probeT.map((t) => num(valueAt(r, 's.iq_ref', t)));
  };
  it('SPEED_CONTROLLER iq_ref(t) = min(1 + 10 t, 10): t = 0.1, 0.5, 0.8 (1e-3 on the discrete integral), saturated at 10 for t >= 0.9', () => {
    const [a, b, c, d, e] = speed([0.1, 0.5, 0.8, 1, 1.2]);
    near(a, 2, 1e-3, 't=0.1'); near(b, 6, 1e-3, 't=0.5'); near(c, 9, 1e-3, 't=0.8');
    expect(d).toBe(10); expect(e).toBe(10);
  });
  // SPEED_CONTROLLER integrates with dt = max(1e-6, time - lastTime): the first evaluation (time 0) integrates 1e-6 s,
  // so iq_ref(0) = 1.00001 and every later sample is 1e-5 too high (Ki e 1e-6). The oracle integral over [0, 0] is 0.
  it.fails('XBV-212: SPEED_CONTROLLER iq_ref(0) = Kp e = 1 (the integral over zero time is zero; 1e-9)', () => {
    near(speed([0])[0], 1, 1e-9, 't=0');
  });
  it('SPEED_CONTROLLER lower limit: error -2 gives max(-10, -1 - 10 t) (t = 1.2 -> -10)', () => {
    const r = sim([constant('w', -2), constant('a', 0), { id: 's', type: 'SPEED_CONTROLLER', params: { Kp: 0.5, Ki: 5, maxIq: 10 } }],
      ['w.out -> s.speed_ref', 'a.out -> s.speed_actual'], ['s.iq_ref'], { stop: 1.2 });
    near(num(valueAt(r, 's.iq_ref', 0.5)), -6, 1e-3, 't=0.5');
    expect(num(valueAt(r, 's.iq_ref', 1.2))).toBe(-10);
  });

  // Documented rule of the factory (CURRENT_CONTROLLER_DQ): the reference vector (id_ref, iq_ref) is limited to the
  // magnitude iMax by scaling both components; vd and vq are independent PIs, vd = Kp_d eD + Ki_d int(eD),
  // vq = Kp_q eQ + Ki_q int(eQ), eD = id_ref - id, eQ = iq_ref - iq. There is no voltage limit.
  const dq = (params: Record<string, unknown>, idRef: number, iqRef: number, id: number, iq: number) => sim(
    [constant('a', idRef), constant('b', iqRef), constant('c', id), constant('d', iq), { id: 'k', type: 'CURRENT_CONTROLLER_DQ', params }],
    ['a.out -> k.id_ref', 'b.out -> k.iq_ref', 'c.out -> k.id', 'd.out -> k.iq'], ['k.vd', 'k.vq']);
  it('CURRENT_CONTROLLER_DQ: vd = Kp_d eD + Ki_d eD t and vq = Kp_q eQ + Ki_q eQ t are independent (eD 0.75, eQ 1.5), 1e-3', () => {
    const r = dq({ Kp_d: 2, Ki_d: 4, Kp_q: 3, Ki_q: 6, iMax: 100 }, 1, 2, 0.25, 0.5);
    for (const t of [0.1, 0.5, 1]) {
      near(num(valueAt(r, 'k.vd', t)), 2 * 0.75 + 4 * 0.75 * t, 1e-3, `vd t=${t}`);
      near(num(valueAt(r, 'k.vq', t)), 3 * 1.5 + 6 * 1.5 * t, 1e-3, `vq t=${t}`);
    }
  });
  it('CURRENT_CONTROLLER_DQ: vd responds to id only and vq to iq only (cross-coupling absent)', () => {
    const base = dq({ Kp_d: 2, Ki_d: 4, Kp_q: 3, Ki_q: 6, iMax: 100 }, 1, 2, 0.25, 0.5);
    const moved = dq({ Kp_d: 2, Ki_d: 4, Kp_q: 3, Ki_q: 6, iMax: 100 }, 1, 2, 0.25, 1.5);
    base.t.forEach((_, k) => near(num(moved.signals['k.vd'][k]), num(base.signals['k.vd'][k]), 1e-12, `vd k=${k}`));
    expect(num(moved.signals['k.vq'][10])).not.toBeCloseTo(num(base.signals['k.vq'][10]), 3);
  });
  // Same dt floor as SPEED_CONTROLLER: the first evaluation integrates 1e-6 s, so vd(0) = Kp_d eD + Ki_d eD 1e-6.
  it.fails('XBV-213: CURRENT_CONTROLLER_DQ vd(0) = Kp_d eD and vq(0) = Kp_q eQ (integral over zero time is zero; 1e-9)', () => {
    const r = dq({ Kp_d: 2, Ki_d: 4, Kp_q: 3, Ki_q: 6, iMax: 100 }, 1, 2, 0.25, 0.5);
    near(num(valueAt(r, 'k.vd', 0)), 1.5, 1e-9, 'vd(0)');
    near(num(valueAt(r, 'k.vq', 0)), 4.5, 1e-9, 'vq(0)');
  });
  it('CURRENT_CONTROLLER_DQ: iMax 1 scales the reference (3, 4) to (0.6, 0.8): vd(t) = Kp_d 0.6 + Ki_d 0.6 t, vq(t) = Kp_q 0.8 + Ki_q 0.8 t', () => {
    const r = dq({ Kp_d: 2, Ki_d: 4, Kp_q: 3, Ki_q: 6, iMax: 1 }, 3, 4, 0, 0);
    for (const t of [0.1, 1]) {
      near(num(valueAt(r, 'k.vd', t)), 2 * 0.6 + 4 * 0.6 * t, 1e-3, `vd t=${t}`);
      near(num(valueAt(r, 'k.vq', t)), 3 * 0.8 + 6 * 0.8 * t, 1e-3, `vq t=${t}`);
    }
  });
});
