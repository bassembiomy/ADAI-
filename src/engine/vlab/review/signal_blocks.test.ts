import { afterAll, describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { normalizeLegacyVLabGraph, SIGNAL_BLOCK_NOTICES } from '../../../components/vlab/vlabModelMigration';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { blockEquations } from '../vlabEquations';
import { isGenericText } from './contractChecks';

/**
 * WP-20a: physical-signal sources, math, nonlinear, discrete / logic and routing blocks.
 *
 * Every expected value is derived IN THIS FILE from the published relation named in each describe (Simulink / Simscape
 * Physical Signals block reference, a closed-form response, or a textbook identity); nothing is read back from the code under
 * test. Every model runs through VLabPhysicsEngine.simulateStep for several steps and reads the block output from the solver
 * variable `<block>_branch_signal_<port>` (the same variable a scope reads).
 */

// ── model builders ─────────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } }) as any;
let edgeCount = 0;
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.');
  const [sb, pb] = b.split('.');
  return { id: `e${edgeCount++}`, source: sa, sourceHandle: pa, target: sb, targetHandle: pb } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }

interface Sample { t: number; get: (block: string, port: string, k?: number) => number; branch: (block: string, name: string) => number; raw: any }
const quiet = <T>(fn: () => T): T => {
  const e = console.error; const w = console.warn;
  console.error = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.error = e; console.warn = w; }
};
/** Run `steps` calls of simulateStep of length dt; one Sample (time + output reader) per call. */
function run(m: Model, steps: number, dt: number, budget = { maxStepAttempts: 4000, wallClockMs: 60000 }): Sample[] {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget(budget);
  let state: any = null;
  const out: Sample[] = [];
  quiet(() => {
    for (let i = 0; i < steps; i++) {
      state = engine.simulateStep(m.nodes, m.edges, state, dt);
      const s = state;
      out.push({
        t: s.time, raw: s,
        /** a branch variable by its raw name (`<block>_branch_<name>`), e.g. the gate outputs of the thyristor generators */
        branch: (block, name) => {
          const i2 = s.variableNames.indexOf(`${block}_branch_${name}`);
          if (i2 < 0) throw new Error(`no variable ${block}_branch_${name}`);
          return s.x[i2];
        },
        get: (block, port, k) => {
          const name = k === undefined ? `${block}_branch_signal_${port}` : `${block}_branch_signal_${port}[${k}]`;
          const i2 = s.variableNames.indexOf(name);
          if (i2 < 0) throw new Error(`no variable ${name}`);
          return s.x[i2];
        },
      });
    }
  });
  return out;
}
const near = (actual: number, expected: number, tol: number, label = '') =>
  expect(Math.abs(actual - expected), `${label}: got ${actual}, expected ${expected} (tol ${tol})`).toBeLessThanOrEqual(tol);

const TWO_PI = 2 * Math.PI;
const lib = (id: string) => VLAB_LIBRARY.flatMap(d => d.blocks).find(b => b.id === id)!;

// ── 1. sources ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-20a sources: constant, step, ramp, sine, 3-phase sine, stair', () => {
  it('constant / ps_constant: y = value, also for 0 and negative values (no || fallback)', () => {
    for (const value of [0, -2.5, 7.25, 3e-4]) {
      for (const type of ['constant', 'ps_constant']) {
        const s = run({ nodes: [node('c', type, { value })], edges: [] }, 3, 0.01);
        s.forEach(x => near(x.get('c', 'y'), value, 1e-7, `${type} ${value}`));
      }
    }
  });

  it('step (Simulink Step): y = initial for t < T, final for t >= T, for a step time that is not a multiple of dt', () => {
    const T = 0.0337, y0 = -1, y1 = 2;
    const s = run({ nodes: [node('st', 'ps_step', { time: T, initial: y0, final: y1 })], edges: [] }, 10, 0.01);
    s.forEach(x => near(x.get('st', 'y'), x.t >= T ? y1 : y0, 1e-7, `t=${x.t}`));
  });

  it('step time event: the integral of a step is exactly final * (t - T) (the solver ends a step at the jump)', () => {
    const T = 0.0337, y0 = 0.5, y1 = 2;
    const m: Model = {
      nodes: [node('st', 'ps_step', { time: T, initial: y0, final: y1 }), node('i', 'ps_integrator', { initial: 0 })],
      edges: [wire('st.y', 'i.u')],
    };
    const s = run(m, 12, 0.01);
    s.forEach(x => {
      const expected = y0 * Math.min(x.t, T) + y1 * Math.max(0, x.t - T);
      near(x.get('i', 'y'), expected, 2e-6, `integral at t=${x.t}`);
    });
  });

  it('ramp (Simulink Ramp): y = 0 before the start time, slope * (t - start) after', () => {
    const s = run({ nodes: [node('r', 'ps_ramp', { slope: -2, start: 0.03 })], edges: [] }, 8, 0.01);
    s.forEach(x => near(x.get('r', 'y'), x.t > 0.03 ? -2 * (x.t - 0.03) : 0, 1e-7, `t=${x.t}`));
  });

  it('sine: y = amp sin(2 pi f t)', () => {
    const s = run({ nodes: [node('s', 'ps_sine', { amp: 3, freq: 5 })], edges: [] }, 20, 0.007);
    s.forEach(x => near(x.get('s', 'y'), 3 * Math.sin(TWO_PI * 5 * x.t), 1e-7, `t=${x.t}`));
  });

  it('3-phase sine (F-065): defaults m = 1, ang = 0; wired m scales the amplitude and wired ang shifts every phase and wt', () => {
    const Vpk = 40, f = 25;
    const dflt = run({ nodes: [node('g', 'ps_sine_3phase', { Vpk, f })], edges: [] }, 6, 0.004);
    dflt.forEach(x => {
      const wt = TWO_PI * f * x.t;
      near(x.get('g', 'abc', 0), Vpk * Math.sin(wt), 1e-7, 'a');
      near(x.get('g', 'abc', 1), Vpk * Math.sin(wt - TWO_PI / 3), 1e-7, 'b');
      near(x.get('g', 'abc', 2), Vpk * Math.sin(wt + TWO_PI / 3), 1e-7, 'c');
      near(x.get('g', 'wt'), wt, 1e-7, 'wt');
    });
    const m = 0.5, ang = Math.PI / 4;
    const wired = run({
      nodes: [node('g', 'ps_sine_3phase', { Vpk, f }), node('m', 'ps_constant', { value: m }), node('a', 'ps_constant', { value: ang })],
      edges: [wire('m.y', 'g.m'), wire('a.y', 'g.ang')],
    }, 6, 0.004);
    wired.forEach(x => {
      const wt = TWO_PI * f * x.t + ang;
      near(x.get('g', 'abc', 0), m * Vpk * Math.sin(wt), 1e-7, 'a');
      near(x.get('g', 'abc', 1), m * Vpk * Math.sin(wt - TWO_PI / 3), 1e-7, 'b');
      near(x.get('g', 'abc', 2), m * Vpk * Math.sin(wt + TWO_PI / 3), 1e-7, 'c');
      near(x.get('g', 'wt'), wt, 1e-7, 'wt');
    });
    // a zero amplitude is a real value (not "unwired")
    const zero = run({ nodes: [node('g', 'ps_sine_3phase', { Vpk, f }), node('m', 'ps_constant', { value: 0 })], edges: [wire('m.y', 'g.m')] }, 3, 0.004);
    zero.forEach(x => [0, 1, 2].forEach(k => near(x.get('g', 'abc', k), 0, 1e-7, `zero amplitude ${k}`)));
  });

  it('stair: y = steps[floor(t / ts) mod N] (the library level list), including the wrap-around and negative levels', () => {
    const steps = [3, -1, 4];
    const ts = 0.1;
    const s = run({ nodes: [node('sg', 'ps_stair_gen', { steps: '[3 -1 4]', ts })], edges: [] }, 16, 0.05);
    s.forEach(x => {
      const k = Math.floor((x.t + 1e-9) / ts);
      near(x.get('sg', 'y'), steps[k % steps.length], 1e-7, `t=${x.t}`);
    });
  });
});

// ── 2. math operators ──────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-20a math: add, subtract, gain, product, divide, abs, sum, math function', () => {
  const two = (type: string, a: number, b: number, params: Record<string, any> = {}) => {
    const s = run({ nodes: [node('a', 'ps_constant', { value: a }), node('b', 'ps_constant', { value: b }), node('d', type, params)], edges: [wire('a.y', 'd.u1'), wire('b.y', 'd.u2')] }, 3, 0.01);
    return s[s.length - 1].get('d', 'y');
  };
  it('add, subtract, product, divide follow y = u1 + u2, u1 - u2, u1 u2, u1 / u2 (port order u1, u2)', () => {
    near(two('ps_add', 3, -5), -2, 1e-7, 'add');
    near(two('ps_subtract', 3, -5), 8, 1e-7, 'subtract');
    near(two('ps_product', 3, -5), -15, 1e-7, 'product');
    near(two('ps_divide', 6, -3), -2, 1e-7, 'divide');
    near(two('ps_divide', 0, 4), 0, 1e-7, 'divide 0/4');
  });
  it('gain y = K u (K = 0 and K < 0 are real values), abs y = |u|, sum of elements y = u', () => {
    for (const K of [2.5, 0, -1.5]) {
      const s = run({ nodes: [node('c', 'ps_constant', { value: -4 }), node('g', 'ps_gain', { gain: K })], edges: [wire('c.y', 'g.u')] }, 2, 0.01);
      near(s[1].get('g', 'y'), K * -4, 1e-7, `gain ${K}`);
    }
    const abs = run({ nodes: [node('c', 'ps_constant', { value: -4 }), node('b', 'ps_abs')], edges: [wire('c.y', 'b.u')] }, 2, 0.01);
    near(abs[1].get('b', 'y'), 4, 1e-7, 'abs');
    const sum = run({ nodes: [node('c', 'ps_constant', { value: 6.5 }), node('b', 'ps_sum')], edges: [wire('c.y', 'b.u')] }, 2, 0.01);
    near(sum[1].get('b', 'y'), 6.5, 1e-7, 'sum of a scalar');
  });
  it('math function: sin, cos, tan, exp, log, sqrt, square of u = 0.7; an unknown function is a parameter error, not the identity', () => {
    const u = 0.7;
    const f: Record<string, number> = { sin: Math.sin(u), cos: Math.cos(u), tan: Math.tan(u), exp: Math.exp(u), log: Math.log(u), sqrt: Math.sqrt(u), square: u * u };
    for (const [func, want] of Object.entries(f)) {
      const s = run({ nodes: [node('c', 'ps_constant', { value: u }), node('m', 'ps_math', { func })], edges: [wire('c.y', 'm.u')] }, 2, 0.01);
      near(s[1].get('m', 'y'), want, 1e-7, func);
    }
    // the library default function is exp (the equation used to default to sin when the parameter was missing)
    const dflt = run({ nodes: [node('c', 'ps_constant', { value: u }), node('m', 'ps_math')], edges: [wire('c.y', 'm.u')] }, 2, 0.01);
    near(dflt[1].get('m', 'y'), Math.exp(u), 1e-7, 'default exp');
    expect(() => run({ nodes: [node('c', 'ps_constant', { value: u }), node('m', 'ps_math', { func: 'cosh' })], edges: [wire('c.y', 'm.u')] }, 1, 0.01)).toThrow(/func/);
  });
});

// ── 3. linear dynamics ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-20a integrator, first / second order lag, washout, low-pass: closed-form responses', () => {
  it('integrator: y = y0 + c t for a constant input, y = y0 + s t^2 / 2 for a ramp input (Initial State is honoured)', () => {
    const c = run({ nodes: [node('u', 'ps_constant', { value: 2 }), node('i', 'ps_integrator', { initial: 3 })], edges: [wire('u.y', 'i.u')] }, 10, 0.01);
    c.forEach(x => near(x.get('i', 'y'), 3 + 2 * x.t, 1e-7, `const t=${x.t}`));
    const r = run({ nodes: [node('u', 'ps_ramp', { slope: 4 }), node('i', 'ps_integrator', { initial: -1 })], edges: [wire('u.y', 'i.u')] }, 20, 0.005);
    r.forEach(x => near(x.get('i', 'y'), -1 + 2 * x.t * x.t, 1e-3, `ramp t=${x.t}`));
    near(r[r.length - 1].get('i', 'y'), -1 + 2 * 0.1 * 0.1, 1e-3);
  });

  it('integrator with reset (ps_integrator_gen): holds y = initial while reset > 0.5, integrates before and after', () => {
    // reset level from a stair [0 0 1 0 0], ts = 0.05: integrating on [0, 0.1), held on [0.1, 0.15), integrating from 0.15
    const m: Model = {
      nodes: [node('u', 'ps_constant', { value: 1 }), node('rs', 'ps_stair_gen', { steps: '[0 0 1 0 0]', ts: 0.05 }), node('i', 'ps_integrator_gen', { initial: 0.25 })],
      edges: [wire('u.y', 'i.u'), wire('rs.y', 'i.reset')],
    };
    const s = run(m, 24, 0.01);
    s.forEach(x => {
      const t = x.t;
      const expected = t < 0.1 - 1e-6 ? 0.25 + t : t < 0.15 - 1e-6 ? 0.25 : 0.25 + (t - 0.15);
      if (Math.abs(t - 0.1) < 1e-6 || Math.abs(t - 0.15) < 1e-6) return; // on the reset edge
      near(x.get('i', 'y'), expected, 2e-4, `t=${t}`);
    });
  });

  it('transfer function T dy/dt + y = u: y = 1 - exp(-t/T) for a unit input', () => {
    const T = 0.2;
    const s = run({ nodes: [node('u', 'ps_constant', { value: 1 }), node('g', 'ps_transfer_fcn', { T })], edges: [wire('u.y', 'g.u')] }, 100, 0.01);
    let worst = 0;
    s.forEach(x => { worst = Math.max(worst, Math.abs(x.get('g', 'y') - (1 - Math.exp(-x.t / T)))); });
    expect(worst, `max error ${worst}`).toBeLessThan(3e-3);
    near(s[s.length - 1].get('g', 'y'), 1 - Math.exp(-5), 3e-3, 'final value');
  });

  it('low-pass filter (f_cut): time constant 1/(2 pi f_cut) in the step response, and gain 1/sqrt(2) at the corner frequency', () => {
    const fc = 4, T = 1 / (TWO_PI * fc);
    const step = run({ nodes: [node('u', 'ps_constant', { value: 1 }), node('g', 'ps_lpf', { f_cut: fc })], edges: [wire('u.y', 'g.u')] }, 100, 0.002);
    step.forEach(x => near(x.get('g', 'y'), 1 - Math.exp(-x.t / T), 3e-3, `t=${x.t}`));
    // frequency response: |H(j w)| = 1/sqrt(1 + (w T)^2) = 1/sqrt(2) at w = 1/T
    const dt = 1 / (fc * 200);
    const sine = run({ nodes: [node('u', 'ps_sine', { amp: 2, freq: fc }), node('g', 'ps_lpf', { f_cut: fc })], edges: [wire('u.y', 'g.u')] }, 200 * 8, dt);
    const lastPeriod = sine.slice(-200);
    const peak = Math.max(...lastPeriod.map(x => Math.abs(x.get('g', 'y'))));
    near(peak, 2 / Math.SQRT2, 0.02, 'corner-frequency gain');
  });

  it('second-order filter: step response of wn^2 / (s^2 + 2 zeta wn s + wn^2) (underdamped closed form)', () => {
    const wn = TWO_PI * 5, zeta = 0.4;
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    const exact = (t: number) => 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
    const s = run({ nodes: [node('u', 'ps_constant', { value: 1 }), node('f', 'ps_second_order_filter', { wn, zeta })], edges: [wire('u.y', 'f.u')] }, 300, 0.001);
    let worst = 0;
    s.forEach(x => { worst = Math.max(worst, Math.abs(x.get('f', 'y') - exact(x.t))); });
    expect(worst, `max error ${worst}`).toBeLessThan(8e-3);
  });

  it('washout T s / (T s + 1): y = exp(-t/T) for a unit input', () => {
    const T = 0.1;
    const s = run({ nodes: [node('u', 'ps_constant', { value: 1 }), node('w', 'ps_washout', { T })], edges: [wire('u.y', 'w.u')] }, 60, 0.005);
    s.forEach(x => near(x.get('w', 'y'), Math.exp(-x.t / T), 8e-3, `t=${x.t}`));
  });
});

// ── 4. history blocks ──────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-20a delay, sliding-window RMS, moving average (committed history)', () => {
  it('delay: y = initial for t < delay, u(t - delay) after (ramp, exact; sine, interpolation error O(dt^2))', () => {
    const tau = 0.05, slope = 3, init = -1;
    const ramp = run({ nodes: [node('r', 'ps_ramp', { slope }), node('d', 'ps_delay', { delay: tau, initial: init })], edges: [wire('r.y', 'd.u')] }, 30, 0.01);
    ramp.forEach(x => {
      const want = x.t < tau - 1e-9 ? init : slope * (x.t - tau);
      near(x.get('d', 'y'), want, 1e-6, `ramp t=${x.t}`);
    });
    const f = 4, A = 2;
    const sine = run({ nodes: [node('s', 'ps_sine', { amp: A, freq: f }), node('d', 'ps_delay', { delay: 0.1, initial: 0 })], edges: [wire('s.y', 'd.u')] }, 300, 0.002);
    sine.forEach(x => {
      const want = x.t < 0.1 ? 0 : A * Math.sin(TWO_PI * f * (x.t - 0.1));
      near(x.get('d', 'y'), want, 1e-3, `sine t=${x.t}`);
    });
  });

  it('delay shorter than the step is consistent (implicit in the current input) and a zero delay is the input itself', () => {
    const s = run({ nodes: [node('r', 'ps_ramp', { slope: 2 }), node('d', 'ps_delay', { delay: 0.002 })], edges: [wire('r.y', 'd.u')] }, 20, 0.01);
    s.slice(2).forEach(x => near(x.get('d', 'y'), 2 * (x.t - 0.002), 1e-6, `t=${x.t}`));
    const z = run({ nodes: [node('r', 'ps_ramp', { slope: 2 }), node('d', 'ps_delay', { delay: 0 })], edges: [wire('r.y', 'd.u')] }, 5, 0.01);
    z.forEach(x => near(x.get('d', 'y'), 2 * x.t, 1e-7, `zero delay t=${x.t}`));
  });

  it('two runs never share history (a new run starts from the initial output)', () => {
    const m: Model = { nodes: [node('r', 'ps_constant', { value: 5 }), node('d', 'ps_delay', { delay: 0.05, initial: -3 })], edges: [wire('r.y', 'd.u')] };
    const a = run(m, 10, 0.01);
    near(a[2].get('d', 'y'), -3, 1e-7, 'run 1, before the delay');
    near(a[9].get('d', 'y'), 5, 1e-7, 'run 1, after the delay');
    const b = run(m, 3, 0.01);
    near(b[2].get('d', 'y'), -3, 1e-7, 'run 2 starts again from the initial output');
  });

  it('RMS of a sine over the window W: sqrt((1/W) int u^2) in the warm-up, A / sqrt(2) once W = k periods have passed', () => {
    const A = 3, f = 50, W = 0.04; // two periods
    const s = run({ nodes: [node('s', 'ps_sine', { amp: A, freq: f }), node('r', 'ps_rms', { window: W })], edges: [wire('s.y', 'r.u')] }, 500, 1e-4);
    s.forEach(x => {
      const t = x.t;
      const w = TWO_PI * f;
      // integral of A^2 sin^2(w tau) from max(0, t - W) to t: A^2 [tau/2 - sin(2 w tau)/(4 w)]
      const F = (tt: number) => A * A * (tt / 2 - Math.sin(2 * w * tt) / (4 * w));
      const want = Math.sqrt(Math.max(0, F(t) - F(Math.max(0, t - W))) / W);
      near(x.get('r', 'y'), want, 2e-3, `t=${t}`);
    });
    near(s[s.length - 1].get('r', 'y'), A / Math.SQRT2, 2e-3, 'steady RMS A/sqrt(2)');
  });

  it('moving average (N samples every ts): constant input fills the window, a ramp gives ts (k - (N-1)/2)', () => {
    const N = 4, ts = 0.1;
    const dt = 0.05; // every second step ends in the middle of a sample interval
    const c = run({ nodes: [node('u', 'ps_constant', { value: 2 }), node('a', 'ps_moving_avg', { window: N, ts })], edges: [wire('u.y', 'a.u')] }, 14, dt);
    c.forEach((x, i) => {
      if (i % 2 === 1) return; // t = (i+1) dt: odd i is a sample instant
      const k = Math.floor(x.t / ts + 1e-9);
      near(x.get('a', 'y'), 2 * Math.min(k + 1, N) / N, 1e-7, `const t=${x.t}`);
    });
    const r = run({ nodes: [node('u', 'ps_ramp', { slope: 1 }), node('a', 'ps_moving_avg', { window: N, ts })], edges: [wire('u.y', 'a.u')] }, 14, dt);
    r.forEach((x, i) => {
      if (i % 2 === 1) return;
      if (i === 0) return; // start-up: the value at t = 0 is only known from the first solve (constant over the first step)
      const k = Math.floor(x.t / ts + 1e-9);
      // samples u(j ts) = j ts for j = 0..k, zeros before t = 0
      let sum = 0; for (let j = 0; j < N; j++) sum += k - j >= 0 ? (k - j) * ts : 0;
      near(x.get('a', 'y'), sum / N, 1e-7, `ramp t=${x.t}`);
    });
  });
});

// ── 5. nonlinear ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-20a nonlinear: saturation, dead zone, min / max, switch, lookup tables', () => {
  const sineModel = (type: string, params: Record<string, any>) => ({
    nodes: [node('s', 'ps_sine', { amp: 2, freq: 3 }), node('d', type, params)], edges: [wire('s.y', 'd.u')],
  });
  const input = (t: number) => 2 * Math.sin(TWO_PI * 3 * t);

  it('saturation: y = clamp(u, lower, upper), asymmetric limits; swapped limits are a parameter error', () => {
    const s = run(sineModel('ps_saturation', { lower: -0.5, upper: 1.2 }), 60, 0.007);
    s.forEach(x => near(x.get('d', 'y'), Math.max(-0.5, Math.min(1.2, input(x.t))), 1e-7, `t=${x.t}`));
    expect(() => run(sineModel('ps_saturation', { lower: 2, upper: -2 }), 1, 0.01)).toThrow(/lower/);
  });

  it('dead zone (F-042): y = u - upper above, 0 inside, u - lower below; the output is continuous at both edges', () => {
    const lower = -0.4, upper = 0.9;
    const dz = (u: number) => (u > upper ? u - upper : u < lower ? u - lower : 0);
    const s = run(sineModel('ps_dead_zone', { lower, upper }), 80, 0.0053);
    s.forEach(x => near(x.get('d', 'y'), dz(input(x.t)), 1e-7, `t=${x.t}`));
    // continuity: the output never moves faster than the input (slope 1 outside, 0 inside)
    const fine = run(sineModel('ps_dead_zone', { lower, upper }), 200, 0.001);
    for (let i = 1; i < fine.length; i++) {
      const dy = Math.abs(fine[i].get('d', 'y') - fine[i - 1].get('d', 'y'));
      const du = Math.abs(input(fine[i].t) - input(fine[i - 1].t));
      expect(dy, `jump at t=${fine[i].t}`).toBeLessThanOrEqual(du + 1e-9);
    }
    // an input exactly at an edge reads 0
    const edge = run({ nodes: [node('c', 'ps_constant', { value: upper }), node('d', 'ps_dead_zone', { lower, upper })], edges: [wire('c.y', 'd.u')] }, 2, 0.01);
    near(edge[1].get('d', 'y'), 0, 1e-7, 'edge');
  });

  it('dead zone migration: legacy start / end are renamed, and the behaviour change is reported on the node', () => {
    const graph = {
      nodes: [{ id: 'dz', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_dead_zone', params: { start: 0.8, end: -0.3 } } }],
      edges: [],
    } as any;
    const out = normalizeLegacyVLabGraph(graph.nodes, graph.edges) as any;
    const migrated = (out.nodes ?? out)[0];
    expect(migrated.data.params.upper).toBe(0.8);
    expect(migrated.data.params.lower).toBe(-0.3);
    expect(migrated.data.params.start).toBeUndefined();
    expect(migrated.data.migrationNotices.join(' ')).toMatch(/continuous/);
    expect(SIGNAL_BLOCK_NOTICES.ps_dead_zone).toMatch(/u - upper/);
  });

  it('min / max (F-086): y = min(u1, u2, limit) / max(u1, u2, limit); limit is the saturation of the output', () => {
    const mk = (type: string, limit: number) => ({
      nodes: [node('a', 'ps_sine', { amp: 2, freq: 3 }), node('b', 'ps_constant', { value: 0.3 }), node('d', type, { limit })],
      edges: [wire('a.y', 'd.u1'), wire('b.y', 'd.u2')],
    });
    run(mk('ps_max', -0.8), 60, 0.007).forEach(x => near(x.get('d', 'y'), Math.max(input(x.t), 0.3, -0.8), 1e-7, `max t=${x.t}`));
    run(mk('ps_max', 1.0), 30, 0.007).forEach(x => near(x.get('d', 'y'), Math.max(input(x.t), 0.3, 1.0), 1e-7, `max limit t=${x.t}`));
    run(mk('ps_min', 0.8), 60, 0.007).forEach(x => near(x.get('d', 'y'), Math.min(input(x.t), 0.3, 0.8), 1e-7, `min t=${x.t}`));
    run(mk('ps_min', -1.0), 30, 0.007).forEach(x => near(x.get('d', 'y'), Math.min(input(x.t), 0.3, -1.0), 1e-7, `min limit t=${x.t}`));
    // the second input is read: u2 > u1 and u2 > limit gives u2 (the placeholder returned u1 only)
    const s = run({ nodes: [node('a', 'ps_constant', { value: 1 }), node('b', 'ps_constant', { value: 4 }), node('d', 'ps_max')], edges: [wire('a.y', 'd.u1'), wire('b.y', 'd.u2')] }, 2, 0.01);
    near(s[1].get('d', 'y'), 4, 1e-7, 'max picks u2');
  });

  it('switch (F-077): y = u1 if ctrl > threshold else u2, ports read by id; the default threshold is the library value 0', () => {
    expect(Number(lib('ps_switch').params.threshold.value)).toBe(0);
    const mk = (params: Record<string, any>) => ({
      nodes: [node('u1', 'ps_constant', { value: 5 }), node('u2', 'ps_constant', { value: 7 }), node('c', 'ps_sine', { amp: 1, freq: 4 }), node('d', 'ps_switch', params)],
      edges: [wire('u1.y', 'd.u1'), wire('c.y', 'd.ctrl'), wire('u2.y', 'd.u2')],
    });
    const ctrl = (t: number) => Math.sin(TWO_PI * 4 * t);
    const dflt = run(mk({}), 60, 0.005);
    dflt.forEach(x => { if (Math.abs(ctrl(x.t)) > 1e-3) near(x.get('d', 'y'), ctrl(x.t) > 0 ? 5 : 7, 1e-7, `default t=${x.t}`); });
    const thr = run(mk({ threshold: 0.25 }), 60, 0.005);
    thr.forEach(x => { if (Math.abs(ctrl(x.t) - 0.25) > 1e-3) near(x.get('d', 'y'), ctrl(x.t) > 0.25 ? 5 : 7, 1e-7, `threshold t=${x.t}`); });
    const neg = run(mk({ threshold: -0.5 }), 60, 0.005);
    neg.forEach(x => { if (Math.abs(ctrl(x.t) + 0.5) > 1e-3) near(x.get('d', 'y'), ctrl(x.t) > -0.5 ? 5 : 7, 1e-7, `negative threshold t=${x.t}`); });
  });

  it('switch event (F-077): the switching instant is located at the library threshold (integral error below one event-cut step; without the event it is ~1e-2)', () => {
    const f = 4, thr = 0.25, T0 = Math.asin(thr) / (TWO_PI * f);
    // time during which sin(2 pi f tau) > thr up to t: the set is (T0 + n/f, 1/(2f) - T0 + n/f)
    const above = (t: number) => {
      let sum = 0;
      for (let n = 0; n * (1 / f) <= t; n++) {
        const a = T0 + n / f, b = 1 / (2 * f) - T0 + n / f;
        sum += Math.max(0, Math.min(t, b) - a);
      }
      return sum;
    };
    const m: Model = {
      nodes: [node('u1', 'ps_constant', { value: 5 }), node('u2', 'ps_constant', { value: 7 }), node('c', 'ps_sine', { amp: 1, freq: f }),
        node('d', 'ps_switch', { threshold: thr }), node('i', 'ps_integrator', { initial: 0 })],
      edges: [wire('u1.y', 'd.u1'), wire('c.y', 'd.ctrl'), wire('u2.y', 'd.u2'), wire('d.y', 'i.u')],
    };
    const s = run(m, 50, 0.01);
    s.forEach(x => near(x.get('i', 'y'), 5 * above(x.t) + 7 * (x.t - above(x.t)), 3e-4, `integral at t=${x.t}`));
    expect(s.reduce((n, x) => n + (x.raw.eventRetries ?? 0), 0), 'the crossings were located by step cuts').toBeGreaterThan(0);
  });

  it('1-D lookup: piecewise-linear interpolation with clamped extrapolation; a non-increasing breakpoint list is a parameter error', () => {
    const x = [0, 1, 3], y = [0, 2, -2];
    const interp = (u: number) => (u <= 0 ? 0 : u >= 3 ? -2 : u <= 1 ? 2 * u : 2 - 2 * (u - 1));
    const s = run({ nodes: [node('r', 'ps_ramp', { slope: 4.5 }), node('l', 'ps_lookup_1d', { table_x: '[0 1 3]', table_y: '[0 2 -2]' })], edges: [wire('r.y', 'l.u')] }, 40, 0.0173);
    s.forEach(p => near(p.get('l', 'y'), interp(4.5 * p.t), 1e-7, `u=${4.5 * p.t}`));
    expect(() => run({ nodes: [node('c', 'ps_constant', { value: 1 }), node('l', 'ps_lookup_1d', { table_x: '[0 2 1]', table_y: '[0 1 2]' })], edges: [wire('c.y', 'l.u')] }, 1, 0.01)).toThrow(/increasing/);
    expect(x.length).toBe(y.length);
  });

  it('2-D lookup: bilinear interpolation of table_z, clamped outside; the default table is u1*u2 on the unit square', () => {
    const X = [0, 1, 2], Y = [0, 10];
    const Z = [[0, 5], [1, 6], [4, 9]]; // rows follow X, columns follow Y
    const bilinear = (u1: number, u2: number) => {
      const c1 = Math.min(2, Math.max(0, u1)), c2 = Math.min(10, Math.max(0, u2));
      const i = Math.min(1, Math.floor(c1)), fx = c1 - i, fy = c2 / 10;
      const row = (r: number) => Z[r][0] + fy * (Z[r][1] - Z[r][0]);
      return row(i) + fx * (row(i + 1) - row(i));
    };
    for (const [u1, u2] of [[0.5, 5], [1.25, 2], [1.9, 9.5], [-1, 3], [3, 30]] as const) {
      const s = run({
        nodes: [node('a', 'ps_constant', { value: u1 }), node('b', 'ps_constant', { value: u2 }), node('l', 'ps_lookup_2d', { table_x: '[0 1 2]', table_y: '[0 10]', table_z: '[0 5; 1 6; 4 9]' })],
        edges: [wire('a.y', 'l.u1'), wire('b.y', 'l.u2')],
      }, 2, 0.01);
      near(s[1].get('l', 'y'), bilinear(u1, u2), 1e-7, `(${u1}, ${u2})`);
    }
    const d = run({ nodes: [node('a', 'ps_constant', { value: 0.3 }), node('b', 'ps_constant', { value: 0.6 }), node('l', 'ps_lookup_2d')], edges: [wire('a.y', 'l.u1'), wire('b.y', 'l.u2')] }, 2, 0.01);
    near(d[1].get('l', 'y'), 0.18, 1e-7, 'default table = u1*u2');
  });
});

// ── 6. discrete / logic ────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-20a logic: SR flip-flop truth table, sample and hold', () => {
  it('SR flip-flop: set, hold, reset, hold, set, set-dominant when both are high (Q and nQ = 1 - Q)', () => {
    const S = [0, 1, 0, 0, 0, 0, 1, 1];
    const R = [0, 0, 0, 1, 0, 0, 0, 1];
    const ts = 0.1;
    const m: Model = {
      nodes: [node('s', 'ps_stair_gen', { steps: `[${S.join(' ')}]`, ts }), node('r', 'ps_stair_gen', { steps: `[${R.join(' ')}]`, ts }), node('ff', 'ps_sr_flipflop')],
      edges: [wire('s.y', 'ff.s'), wire('r.y', 'ff.r')],
    };
    // reference: Q+ = S or (Q and not R), evaluated once per interval
    let Q = 0; const want: number[] = [];
    for (let k = 0; k < S.length; k++) { Q = (S[k] || (Q && !R[k])) ? 1 : 0; want.push(Q); }
    const s = run(m, 16, 0.05);
    s.forEach((x, i) => {
      if (i % 2 === 1) return; // mid-interval samples only (t = 0.05, 0.15, ...)
      const k = Math.floor(x.t / ts);
      near(x.get('ff', 'q'), want[k], 1e-6, `Q in interval ${k}`);
      near(x.get('ff', 'nq'), 1 - want[k], 1e-6, `nQ in interval ${k}`);
    });
  });

  it('sample and hold: y = u while S > 0.5, the value at the falling edge afterwards (exactly u(T), not a lagged value)', () => {
    const T = 0.0337, slope = 3;
    const m: Model = {
      nodes: [node('u', 'ps_ramp', { slope }), node('s', 'ps_step', { time: T, initial: 1, final: 0 }), node('h', 'ps_sample_hold')],
      edges: [wire('u.y', 'h.u'), wire('s.y', 'h.s')],
    };
    const s = run(m, 12, 0.01);
    s.forEach(x => near(x.get('h', 'y'), slope * Math.min(x.t, T), 2e-6, `t=${x.t}`));
  });

  it('sample and hold re-arms: S high again tracks the new input', () => {
    const m: Model = {
      nodes: [node('u', 'ps_ramp', { slope: 2 }), node('s', 'ps_stair_gen', { steps: '[1 0 0 1]', ts: 0.05 }), node('h', 'ps_sample_hold')],
      edges: [wire('u.y', 'h.u'), wire('s.y', 'h.s')],
    };
    const s = run(m, 20, 0.0125);
    s.forEach(x => {
      const t = x.t; const k = Math.floor((t + 1e-9) / 0.05) % 4;
      if (Math.abs(t / 0.05 - Math.round(t / 0.05)) < 1e-6) return; // sample edge
      const base = Math.floor(t / 0.05 / 4) * 4 * 0.05; // start of this cycle
      const expected = k === 0 ? 2 * t : k === 3 ? 2 * t : 2 * (base + 0.05);
      near(x.get('h', 'y'), expected, 5e-6, `t=${t}`);
    });
  });
});

// ── 7. routing, converters and the phase vectors ───────────────────────────────────────────────────────────────────────
describe('WP-20a routing: demux, domain converters', () => {
  it('3-phase generator through the demux: y_k = u[k] for every sample (with amplitude and phase inputs)', () => {
    const Vpk = 30, f = 50, ang = 0.6;
    const m: Model = {
      nodes: [node('g', 'ps_sine_3phase', { Vpk, f }), node('a', 'ps_constant', { value: ang }), node('x', 'ps_demux_3')],
      edges: [wire('a.y', 'g.ang'), wire('g.abc', 'x.in')],
    };
    run(m, 12, 1e-3).forEach(s => {
      const wt = TWO_PI * f * s.t + ang;
      near(s.get('x', 'a'), Vpk * Math.sin(wt), 1e-7, 'a');
      near(s.get('x', 'b'), Vpk * Math.sin(wt - TWO_PI / 3), 1e-7, 'b');
      near(s.get('x', 'c'), Vpk * Math.sin(wt + TWO_PI / 3), 1e-7, 'c');
    });
  });

  it('demux: a scalar wired to the width-3 input is a width diagnostic, never a broadcast', () => {
    const m: Model = { nodes: [node('c', 'ps_constant', { value: 1 }), node('x', 'ps_demux_3')], edges: [wire('c.y', 'x.in')] };
    expect(() => run(m, 1, 0.01)).toThrow(/width/i);
  });

  it('subsystem with inport / outport: the signal crosses the boundary unchanged and the inner gain acts on it every step', () => {
    const inner = (id: string, type: string, params: Record<string, any>): Node =>
      ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params, parentId: 'sub' } }) as any;
    const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge => ({ id, source, sourceHandle, target, targetHandle }) as Edge;
    const m: Model = {
      nodes: [node('src', 'ps_ramp', { slope: 2 }), node('sub', 'subsystem', {}), inner('inp', 'inport', { name: 'In1', port_index: 1 }),
        inner('gain', 'ps_gain', { gain: -3 }), inner('outp', 'outport', { name: 'Out1', port_index: 1 }), node('sink', 'ps_abs')],
      edges: [edge('e1', 'src', 'y', 'sub', 'sub-inp'), edge('e2', 'sub', 'sub-outp', 'sink', 'u'), edge('e3', 'inp', 'out', 'gain', 'u'), edge('e4', 'gain', 'y', 'outp', 'in')],
    };
    run(m, 6, 0.01).forEach(s => {
      near(s.get('gain', 'y'), -3 * 2 * s.t, 1e-7, 'inner gain');
      near(s.get('sink', 'y'), 6 * s.t, 1e-7, 'after the outport: |gain * u|');
    });
  });

  it('PS-Simulink and Simulink-PS converters pass the value unchanged', () => {
    const m: Model = {
      nodes: [node('s', 'ps_sine', { amp: 2, freq: 6 }), node('c1', 'ps_simulink_conv'), node('c2', 'simulink_ps_conv'), node('g', 'ps_gain', { gain: 1 })],
      edges: [wire('s.y', 'c1.in'), wire('c1.out', 'c2.in'), wire('c2.out', 'g.u')],
    };
    run(m, 10, 0.01).forEach(s => {
      near(s.get('c1', 'out'), 2 * Math.sin(TWO_PI * 6 * s.t), 1e-7, 'ps_simulink_conv');
      near(s.get('c2', 'out'), 2 * Math.sin(TWO_PI * 6 * s.t), 1e-7, 'simulink_ps_conv');
      near(s.get('g', 'y'), 2 * Math.sin(TWO_PI * 6 * s.t), 1e-7, 'downstream');
    });
  });
});

// ── 8. sequence analyzer ───────────────────────────────────────────────────────────────────────────────────────────────
// Test-only reference source: an arbitrary width-3 signal x_k = A_k cos(w t + phi_k). The library has no scalar-to-vector block,
// so the unbalanced sets of the Sequence Analyzer need a source of their own (registered for this file only).
const VEC = 'wp20a_vec_source';
(blockEquations as any)[VEC] = ({ branch, params, ctx }: any) => {
  const w = TWO_PI * params.f;
  return [0, 1, 2].map(k => branch[k] - params.A[k] * Math.cos(w * ctx.time + params.phi[k]));
};
afterAll(() => { delete (blockEquations as any)[VEC]; });
const vecSource = (id: string, f: number, A: number[], phi: number[]): Node => ({
  id, type: 'default', position: { x: 0, y: 0 },
  data: { type: VEC, params: { f, A, phi }, ports: [{ id: 'abc', width: 3, channelNames: ['a', 'b', 'c'], pos: 'right', domain: 'Physical', direction: 'out' }] },
}) as any;

describe('WP-20a sequence analyzer: running one-period Fourier fundamental, V1 / V2 / V0 against the Fortescue closed form', () => {
  type C = { re: number; im: number };
  const cmul = (x: C, y: C): C => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
  const op: C = { re: Math.cos(TWO_PI / 3), im: Math.sin(TWO_PI / 3) };
  const op2 = cmul(op, op);
  /** closed form: peak magnitudes of V1 = (A + aB + a^2 C)/3, V2 = (A + a^2 B + aC)/3, V0 = (A + B + C)/3 of the phasors A_k e^(j phi_k) */
  const fortescue = (A: number[], phi: number[]): number[] => {
    const P = A.map((a, k) => ({ re: a * Math.cos(phi[k]), im: a * Math.sin(phi[k]) }));
    const sum = (...z: C[]) => ({ re: z.reduce((s, c) => s + c.re, 0) / 3, im: z.reduce((s, c) => s + c.im, 0) / 3 });
    return [sum(P[0], cmul(op, P[1]), cmul(op2, P[2])), sum(P[0], cmul(op2, P[1]), cmul(op, P[2])), sum(P[0], P[1], P[2])].map(z => Math.hypot(z.re, z.im));
  };
  const f = 50, T = 1 / f;
  const analyze = (A: number[], phi: number[], periods = 2.5, perPeriod = 80) => {
    const m: Model = { nodes: [vecSource('src', f, A, phi), node('sq', 'sym_comp_transform', { freq: f })], edges: [wire('src.abc', 'sq.abc')] };
    return run(m, Math.round(periods * perPeriod), T / perPeriod);
  };

  const cases: [string, number[], number[]][] = [
    ['balanced positive sequence', [100, 100, 100], [0, -TWO_PI / 3, TWO_PI / 3]],
    ['balanced negative sequence', [100, 100, 100], [0, TWO_PI / 3, -TWO_PI / 3]],
    ['zero sequence (common mode)', [60, 60, 60], [0.4, 0.4, 0.4]],
    ['unbalanced magnitudes and angles', [100, 60, 80], [0.3, -2.0, 2.2]],
    ['single phase', [90, 0, 0], [0.7, 0, 0]],
  ];
  for (const [name, A, phi] of cases) {
    it(`${name}: after one period the magnitudes equal the closed form and stay constant (no ripple)`, () => {
      const want = fortescue(A, phi);
      const s = analyze(A, phi);
      const steady = s.filter(x => x.t >= T + 1e-9);
      expect(steady.length).toBeGreaterThan(50);
      for (const x of steady) {
        [0, 1, 2].forEach(k => near(x.get('sq', 'seq', k), want[k], 0.012 * Math.max(...A), `${name} seq[${k}] at t=${x.t}`));
      }
      // the three sequences are the exact decomposition: |V1|, |V2|, |V0| are not the phase magnitudes
      expect(want.length).toBe(3);
    });
  }

  it('warm-up: the signal before t = 0 counts as 0, so the output grows from 0 and never exceeds the final value by more than the ripple of one period', () => {
    const s = analyze([100, 100, 100], [0, -TWO_PI / 3, TWO_PI / 3], 1.2);
    near(s[0].get('sq', 'seq', 0), 0, 8, 'first step ~ 0');
    const first = s.filter(x => x.t < T);
    expect(Math.max(...first.map(x => x.get('sq', 'seq', 0)))).toBeLessThanOrEqual(100 * 1.02);
    expect(first[Math.round(first.length / 2)].get('sq', 'seq', 0)).toBeLessThan(first[first.length - 1].get('sq', 'seq', 0) + 1);
  });

  it('through the library blocks: 3-phase generator -> analyzer reads [Vpk, 0, 0]; park(theta = wt + d) -> inverse synthesis -> analyzer returns |d|, |q| as V1, V2', () => {
    const Vpk = 80;
    const bal = run({ nodes: [node('g', 'ps_sine_3phase', { Vpk, f }), node('sq', 'sym_comp_transform', { freq: f })], edges: [wire('g.abc', 'sq.abc')] }, 200, T / 80);
    bal.filter(x => x.t >= T + 1e-9).forEach(x => {
      near(x.get('sq', 'seq', 0), Vpk, 0.8, 'V1');
      near(x.get('sq', 'seq', 1), 0, 0.8, 'V2');
      near(x.get('sq', 'seq', 2), 0, 0.8, 'V0');
    });
    // park of the balanced set at theta = wt + 0.5 gives constant [d, q, 0]; the inverse synthesis of [d, q, 0] has |V1| = |d|, |V2| = |q|
    const m: Model = {
      nodes: [node('g', 'ps_sine_3phase', { Vpk, f }), node('off', 'ps_constant', { value: 0.5 }), node('th', 'ps_add'), node('pk', 'park_transform'),
        node('inv', 'inv_sym_comp_transform', { freq: f }), node('sq', 'sym_comp_transform', { freq: f })],
      edges: [wire('g.wt', 'th.u1'), wire('off.y', 'th.u2'), wire('g.abc', 'pk.abc'), wire('th.y', 'pk.theta'), wire('pk.dq0', 'inv.seq'), wire('inv.abc', 'sq.abc')],
    };
    // d = Vpk cos(0.5)-type constants (derived from the park definition: '90 deg behind A' gives d = Vpk cos(delta), q = Vpk sin(delta) up to sign)
    const delta = 0.5;
    const s = run(m, 200, T / 80);
    s.filter(x => x.t >= T + 1e-9).forEach(x => {
      near(x.get('sq', 'seq', 0), Vpk * Math.cos(delta), 1.2, 'V1 = |d|');
      near(x.get('sq', 'seq', 1), Vpk * Math.sin(delta), 1.2, 'V2 = |q|');
      near(x.get('sq', 'seq', 2), 0, 1.2, 'V0');
    });
  });
});

// ── 9. thyristor firing generators ─────────────────────────────────────────────────────────────────────────────────────
describe('WP-20a thyristor firing generators: gate windows and the documented theta conventions (F-083)', () => {
  const F = 50, dt = 1 / (F * 720); // 0.5 degree per step
  const wrap = (d: number) => ((d % 360) + 360) % 360;
  it('6-pulse: g_k = 1 for wrap360(theta - alpha - 60 (k-1)) < width, theta an absolute angle in degrees (wired, it replaces the ramp)', () => {
    const alpha = 25, width = 12;
    const m: Model = {
      nodes: [node('th', 'thyristor_6pulse', { freq: F, pulse_width_deg: width }), node('r', 'ps_ramp', { slope: 360 * F }), node('al', 'ps_constant', { value: alpha })],
      edges: [wire('r.y', 'th.theta'), wire('al.y', 'th.alpha')],
    };
    let checked = 0;
    run(m, 720, dt).forEach((x, i) => {
      const theta = 0.5 * (i + 1);
      for (let k = 0; k < 6; k++) {
        const dist = wrap(theta - alpha - 60 * k);
        if (Math.abs(dist - width) < 1e-6 || dist < 1e-6 || 360 - dist < 1e-6) continue;
        near(x.branch('th', `g${k + 1}`), dist < width ? 1 : 0, 1e-7, `theta ${theta} gate ${k + 1}`);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(4000);
    // a constant theta is an absolute angle: gate 1 is high for theta in [alpha, alpha + width)
    const fixed = run({ nodes: [node('th', 'thyristor_6pulse', { freq: F, pulse_width_deg: width }), node('t', 'ps_constant', { value: alpha + 3 }), node('al', 'ps_constant', { value: alpha })], edges: [wire('t.y', 'th.theta'), wire('al.y', 'th.alpha')] }, 3, dt);
    near(fixed[2].branch('th', 'g1'), 1, 1e-7, 'gate 1 at theta = alpha + 3');
    near(fixed[2].branch('th', 'g2'), 0, 1e-7, 'gate 2 at theta = alpha + 3');
  });

  it('12-pulse: delta gates at alpha + 60 (k-1), wye gates 30 degrees later; theta is a radian OFFSET added to the internal ramp 2 pi f t', () => {
    const alpha = 15, width = 10;
    const check = (thetaRad: number, wired: boolean) => {
      const m: Model = {
        nodes: [node('th', 'thyristor_12pulse', { freq: F, pulse_width_deg: width }), node('al', 'ps_constant', { value: alpha }), ...(wired ? [node('t', 'ps_constant', { value: thetaRad })] : [])],
        edges: [wire('al.y', 'th.alpha'), ...(wired ? [wire('t.y', 'th.theta')] : [])],
      };
      let checked = 0;
      run(m, 720, dt).forEach((x, i) => {
        const phi = 0.5 * (i + 1) + (thetaRad * 180) / Math.PI; // degrees: ramp + offset
        for (let k = 0; k < 6; k++) {
          for (const [prefix, shift] of [['delta_g', 0], ['wye_g', 30]] as const) {
            const dist = wrap(phi - alpha - shift - 60 * k);
            if (Math.abs(dist - width) < 1e-6 || dist < 1e-6 || 360 - dist < 1e-6) continue;
            near(x.branch('th', `${prefix}${k + 1}`), dist < width ? 1 : 0, 1e-7, `phi ${phi} ${prefix}${k + 1}`);
            checked++;
          }
        }
      });
      expect(checked).toBeGreaterThan(8000);
    };
    check(0, true); // theta is a required input of the 12-pulse generator: 0 rad = the pure ramp
    check(Math.PI / 6, true);
    check(-0.4, true);
  });

  it('the two conventions differ on purpose and say so (6-pulse: absolute degrees, 12-pulse: radian offset)', () => {
    expect(lib('thyristor_6pulse').description).toMatch(/absolute/);
    expect(lib('thyristor_6pulse').description).toMatch(/thyristor_12pulse differs on purpose/);
    expect(lib('thyristor_12pulse').description).toMatch(/offset in radians/);
  });
});

// ── 10. F-038 recheck ──────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-20a F-038 recheck: step -> PID -> saturation', () => {
  it('a step through ps_pid_ctrl and ps_saturation runs to the end of the interval without exhausting the step budget', () => {
    const m: Model = {
      nodes: [node('st', 'ps_step', { time: 0.05, initial: 0, final: 1 }), node('pid', 'ps_pid_ctrl', { Kp: 2, Ki: 20, Kd: 0, limit: 240 }), node('sat', 'ps_saturation', { lower: -1, upper: 1 })],
      edges: [wire('st.y', 'pid.e'), wire('pid.u', 'sat.u')],
    };
    const s = run(m, 30, 0.01, { maxStepAttempts: 2000, wallClockMs: 20000 });
    // PI response of e = 1 from t = 0.05: u = Kp + Ki (t - 0.05) = 2 + 20 (t - 0.05) > 1: saturated at 1 for all t >= 0.05
    s.forEach(x => { if (x.t > 0.06) near(x.get('sat', 'y'), 1, 1e-6, `t=${x.t}`); });
  });
});

// ── 11. library text ───────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-20a library text: real equations, no generic labels', () => {
  const ids = ['constant', 'ps_constant', 'ps_step', 'ps_ramp', 'ps_sine', 'ps_sine_3phase', 'ps_stair_gen', 'ps_add', 'ps_subtract', 'ps_sum', 'ps_gain',
    'ps_product', 'ps_divide', 'ps_abs', 'ps_math', 'ps_integrator', 'ps_integrator_gen', 'ps_transfer_fcn', 'ps_lpf', 'ps_second_order_filter', 'ps_washout',
    'ps_moving_avg', 'ps_rms', 'ps_delay', 'ps_lookup_1d', 'ps_lookup_2d', 'ps_saturation', 'ps_dead_zone', 'ps_max', 'ps_min', 'ps_switch', 'ps_sr_flipflop',
    'ps_sample_hold', 'ps_demux_3', 'ps_simulink_conv', 'simulink_ps_conv', 'sym_comp_transform', 'inv_sym_comp_transform', 'thyristor_6pulse', 'thyristor_12pulse'];
  it('every block in scope has a specific equation text that names its output', () => {
    for (const id of ids) {
      const b = lib(id);
      expect(b, id).toBeDefined();
      expect(isGenericText(b.equation), `${id}: ${b.equation}`).toBe(false);
      expect(b.equation?.trim().length, id).toBeGreaterThan(5);
    }
  });
  it('the equation of the blocks that changed names the real law', () => {
    expect(lib('ps_dead_zone').equation).toMatch(/u - upper/);
    expect(lib('ps_max').equation).toMatch(/max\(u1, u2, limit\)/);
    expect(lib('ps_switch').equation).toMatch(/ctrl > threshold/);
    expect(lib('sym_comp_transform').equation).toMatch(/integral from t-T to t/);
    expect(lib('ps_lpf').equation).toMatch(/T\*dy\/dt \+ y = u/);
  });
});
