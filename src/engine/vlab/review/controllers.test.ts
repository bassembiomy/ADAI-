import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { blockEquations } from '../vlabEquations';
import { UNSUPPORTED_BLOCKS } from '../vlabStructure';
import { CONTRACT_EXPECTED_FAILURES } from './contractExpectedFailures';
import { VECTOR_PORT_BACKLOG } from './vectorPortPlan';

/**
 * WP-20b: controllers, estimators, motor / converter controllers and learning blocks certified against PUBLISHED equations.
 * Every expected value is written in this file from the relation named in the comment (Simulink PID Controller, Slotine and Li,
 * Smith 1957, Luenberger 1966, Vas "Vector Control of AC Machines", Krause et al., Takahashi and Noguchi 1986, Krishnan, Widrow and
 * Hoff, Watkins and Dayan, Boyes / AD2S1200); nothing is read back from the code under test, and every model runs through
 * VLabPhysicsEngine.simulateStep. Test-local helper blocks (a vector constant and a 3-wire mux) stand in for the signal-vector
 * plumbing the library does not have (finding F-094): they are registered for this file only.
 */

const TWO_PI = 2 * Math.PI;
const blocks = VLAB_LIBRARY.flatMap(d => d.blocks);
const lib = (id: string) => blocks.find(b => b.id === id)!;

// ── model builders ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}, extra: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params, label: id, ...extra } }) as Node;
let edgeCount = 0;
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.'); const [sb, pb] = b.split('.');
  return { id: `e${edgeCount++}`, source: sa, sourceHandle: `${sa}-${pa}`, target: sb, targetHandle: `${sb}-${pb}` } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }

const outPort = (id: string, width: number) => ({ id, pos: 'right', label: id, domain: 'Physical', direction: 'out', ...(width > 1 ? { width, channelNames: width === 3 ? ['a', 'b', 'c'] : ['d', 'q'] } : {}) });
/** test-local constant vector source, params.v = the channel values */
const vec = (id: string, v: number[]): Node => node(id, 'wp20b_vec', { v }, { ports: [outPort('out', v.length)] });
/** test-local 3-wire mux a, b, c -> out[3] (the library has no signal mux, F-094) */
const mux3 = (id: string): Node => node(id, 'wp20b_mux3', {}, {
  ports: [...['a', 'b', 'c'].map(p => ({ id: p, pos: 'left', label: p, domain: 'Physical', direction: 'in' })), outPort('out', 3)],
});

beforeAll(() => {
  blockEquations.wp20b_vec = ({ branch, params }) => branch.map((b, i) => b - (params.v as number[])[i]).slice(0, (params.v as number[]).length);
  blockEquations.wp20b_mux3 = ({ across, branch, ports }) => ['a', 'b', 'c'].map((p, i) => branch[i] - (across[ports.indexOf(p)] as number));
});
afterAll(() => { delete blockEquations.wp20b_vec; delete blockEquations.wp20b_mux3; });

type Sample = { t: number; at: (name: string) => number; vec: (name: string, n: number) => number[] };
/** Run `steps` steps of `dt` through VLabPhysicsEngine.simulateStep; `probe` sees every step. */
function simulate(m: Model, steps: number, dt: number, probe?: (s: Sample, k: number) => void, validate = true): Sample {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 20000, wallClockMs: 60000 });
  if (!validate) engine.setTopologyValidation(false);
  let state: any = null;
  const sample = (k: number): Sample => {
    const names: string[] = state.variableNames;
    const at = (name: string) => { const i = names.indexOf(name); if (i < 0) throw new Error(`no variable ${name}`); return state.x[i]; };
    return { t: state.time, at, vec: (name, n) => Array.from({ length: n }, (_, j) => at(`${name}[${j}]`)) };
  };
  const err = console.error, warn = console.warn;
  console.error = () => {}; console.warn = () => {};
  try {
    for (let k = 0; k < steps; k++) {
      state = engine.simulateStep(m.nodes, m.edges, state, dt);
      if (probe) probe(sample(k), k);
    }
  } finally { console.error = err; console.warn = warn; }
  return sample(steps - 1);
}
const out = (id: string, port: string) => `${id}_branch_signal_${port}`;
const state = (id: string, name: string) => `${id}_state_${name}`;
const near = (actual: number, expected: number, tol: number, label: string) =>
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('catalog: nothing of WP-20b is unsupported or planned any more', () => {
  it('no WP-20 entry is left in the unsupported table, the expected failures or the vector backlog', () => {
    expect(Object.values(UNSUPPORTED_BLOCKS).filter(s => s.wp === 'WP-20')).toEqual([]);
    for (const [id, checks] of Object.entries(CONTRACT_EXPECTED_FAILURES)) {
      expect(Object.values(checks).filter(wp => wp === 'WP-20'), id).toEqual([]);
    }
    expect(VECTOR_PORT_BACKLOG).toEqual({});
  });

  it('abc / dq / gate ports of the controllers are width-3 / width-2 vectors with channel names', () => {
    const w = (key: string) => { const [b, p] = key.split('.'); return lib(b).ports.find(x => x.id === p)!; };
    for (const key of ['pmsm_foc.iabc_s', 'pmsm_foc.g', 'im_foc_ctrl.iabc', 'im_foc_ctrl.g', 'im_dtc_ctrl.g', 'hysteresis_ctrl_3ph.s', 'bldc_pwm_ctrl.g',
      'bldc_commutation.abc', 'bldc_current_ctrl.vabc', 'im_scalar_ctrl.vabc', 'pfc_rectifier_ctrl.vabc_ref', 'im_flux_observer.iabc']) {
      expect(w(key), key).toMatchObject({ width: 3, channelNames: ['a', 'b', 'c'] });
    }
    for (const key of ['pmsm_curr_ctrl.idq_ref', 'pmsm_curr_ctrl.vdq_ref', 'im_curr_ctrl.idq', 'pmsm_ref_gen.idq_ref', 'pmsm_tq_est.idq', 'im_flux_observer.idqsef', 'pmsm_field_weakening.vdq']) {
      expect(w(key), key).toMatchObject({ width: 2, channelNames: ['d', 'q'] });
    }
    // deliberate: the amplitude of the phase voltage reference set stays scalar (shipped labs wire it to the inverter amp input)
    expect(w('im_foc_ctrl.vabc').width).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('PI / PID (Simulink PID Controller, parallel form)', () => {
  const loop = (pi: Record<string, any>, ref: Node): Model => ({
    nodes: [ref, node('err', 'ps_subtract'), node('pi', 'ps_pi_ctrl', pi), node('plant', 'ps_transfer_fcn', { T: 0.1 })],
    edges: [wire('ref.y', 'err.u1'), wire('plant.y', 'err.u2'), wire('err.y', 'pi.e'), wire('pi.u', 'plant.u')],
  });

  it('PI on a first-order plant: the closed-loop step follows the analytic response of T s^2 + (1 + Kp) s + Ki', () => {
    // plant 1/(T s + 1), PI Kp + Ki/s: Y/R = (Kp s + Ki)/(T s^2 + (1 + Kp) s + Ki); real poles s1,2 = (-(1+Kp) +- sqrt((1+Kp)^2 - 4 T Ki))/(2 T)
    const T = 0.1, Kp = 2, Ki = 10;
    const disc = Math.sqrt((1 + Kp) ** 2 - 4 * T * Ki);
    const s1 = (-(1 + Kp) + disc) / (2 * T), s2 = (-(1 + Kp) - disc) / (2 * T);
    const A = (Kp * s1 + Ki) / (T * s1 * (s1 - s2)), B = (Kp * s2 + Ki) / (T * s2 * (s2 - s1));
    const y = (t: number) => 1 + A * Math.exp(s1 * t) + B * Math.exp(s2 * t);
    let worst = 0;
    const last = simulate(loop({ Kp, Ki, limit: 1000, Kb: 0 }, node('ref', 'ps_constant', { value: 1 })), 600, 1e-3, (s) => {
      if (s.t > 0.02) worst = Math.max(worst, Math.abs(s.at(out('plant', 'y')) - y(s.t)));
    });
    expect(worst).toBeLessThan(2e-3);
    near(last.at(out('plant', 'y')), y(0.6), 2e-3, 'final value'); // slow pole s1 = -3.8: 0.97 at 0.6 s
  });

  it('PID derivative filter: a unit error with Kp = Ki = 0 gives u(t) = Kd N e^(-N t)', () => {
    const Kd = 0.2, N = 50;
    const m: Model = { nodes: [node('e', 'ps_constant', { value: 1 }), node('pid', 'ps_pid_ctrl', { Kp: 0, Ki: 0, Kd, N, limit: 1000 })], edges: [wire('e.y', 'pid.e')] };
    let worst = 0;
    simulate(m, 100, 2e-4, (s) => { if (s.t > 0.004) worst = Math.max(worst, Math.abs(s.at(out('pid', 'u')) - Kd * N * Math.exp(-N * s.t))); });
    expect(worst / (Kd * N)).toBeLessThan(0.02);
  });

  it('back-calculation anti-windup recovers faster than no anti-windup (Kb = 0) after a saturated period', () => {
    const run = (Kb: number) => {
      let tRecover = Infinity;
      simulate(loop({ Kp: 2, Ki: 10, limit: 1, Kb }, node('ref', 'ps_step', { time: 1, initial: 5, final: 0.5 })), 400, 5e-3, (s) => {
        if (s.t > 1 && tRecover === Infinity && s.at(out('plant', 'y')) < 0.55) tRecover = s.t - 1;
      });
      return tRecover;
    };
    const withAw = run(10), without = run(0);
    expect(withAw).toBeLessThan(0.2);
    expect(without).toBeGreaterThan(withAw + 0.5);
  });

  it('reset (level > 0.5) holds the integrator at zero: u = Kp e', () => {
    const m: Model = { nodes: [node('e', 'ps_constant', { value: 2 }), node('rst', 'ps_constant', { value: 1 }), node('pi', 'ps_pi_ctrl', { Kp: 1.5, Ki: 10, limit: 100, Kb: 0 })], edges: [wire('e.y', 'pi.e'), wire('rst.y', 'pi.reset')] };
    const last = simulate(m, 20, 1e-3);
    near(last.at(out('pi', 'u')), 3, 1e-9, 'u = Kp e while reset is high');
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('state feedback and Luenberger observer', () => {
  /** classical RK4 of dx/dt = f(t, x) (the reference integration of the design equations) */
  const rk4 = (f: (x: number[]) => number[], x0: number[], dt: number, n: number): number[][] => {
    const xs = [x0]; let x = x0;
    for (let i = 0; i < n; i++) {
      const add = (a: number[], b: number[], h: number) => a.map((v, j) => v + h * b[j]);
      const k1 = f(x), k2 = f(add(x, k1, dt / 2)), k3 = f(add(x, k2, dt / 2)), k4 = f(add(x, k3, dt));
      x = x.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
      xs.push(x);
    }
    return xs;
  };

  it('observer-based state feedback on a double integrator: the 4-state closed loop follows the design equations (poles of A - BK and A - LC)', () => {
    // plant x1' = x2, x2' = u, y = x1; K = [12 7] (poles -3, -4), L = [20; 96] (poles -8, -12): s^2 + 7 s + 12, s^2 + 20 s + 96
    expect([(-7 + Math.sqrt(49 - 48)) / 2, (-7 - Math.sqrt(49 - 48)) / 2]).toEqual([-3, -4]);
    expect([(-20 + Math.sqrt(400 - 384)) / 2, (-20 - Math.sqrt(400 - 384)) / 2]).toEqual([-8, -12]);
    const K = [12, 7], L = [20, 96];
    const m: Model = {
      nodes: [node('r0', 'ps_constant', { value: 0 }), node('sf', 'ps_state_feedback', { K: '[12 7]', Nr: 1 }),
        node('obs', 'luenberger_observer', { A: '[0 1; 0 0]', B: '[0; 1]', C: '[1 0]', L: '[20; 96]' }),
        node('i2', 'ps_integrator', { initial: 0 }), node('i1', 'ps_integrator', { initial: 1 })],
      edges: [wire('r0.y', 'sf.r'), wire('obs.xhat', 'sf.x'), wire('sf.u', 'i2.u'), wire('i2.y', 'i1.u'), wire('sf.u', 'obs.u'), wire('i1.y', 'obs.y')],
    };
    const dt = 2e-3, n = 750;
    // reference: u = -K xhat, xhat' = A xhat + B u + L (x1 - xhat1)
    const ref = rk4((x) => {
      const u = -(K[0] * x[2] + K[1] * x[3]);
      return [x[1], u, x[3] + 0 * x[2] + L[0] * (x[0] - x[2]), u + L[1] * (x[0] - x[2])];
    }, [1, 0, 0, 0], dt / 4, 4 * n);
    let worst = 0;
    const last = simulate(m, n, dt, (s, k) => {
      const r = ref[4 * (k + 1)];
      worst = Math.max(worst, Math.abs(s.at(out('i1', 'y')) - r[0]), Math.abs(s.at(out('i2', 'y')) - r[1]));
    });
    expect(worst).toBeLessThan(5e-3);
    expect(Math.abs(last.at(out('i1', 'y')))).toBeLessThan(0.12); // x1 has decayed from 1 along the closed-loop poles -3, -4 (and the observer ones)
  });

  it('Luenberger observer: the estimation error obeys e\' = (A - L C) e, whatever the input u', () => {
    // plant x1' = x2, x2' = -x1 - x2 + u (the default A, B = [0; 1], C = [1 0]); observer L = [10; 10]
    const Aol = [[-10, 1], [-11, -1]]; // A - L C = [0 1; -1 -1] - [10 0; 10 0]
    const m: Model = {
      nodes: [node('u', 'ps_sine', { amp: 1, freq: 1 }), node('sub1', 'ps_subtract'), node('sub2', 'ps_subtract'), node('i2', 'ps_integrator'), node('i1', 'ps_integrator', { initial: 1 }),
        node('obs', 'luenberger_observer')],
      edges: [wire('u.y', 'sub1.u1'), wire('i1.y', 'sub1.u2'), wire('sub1.y', 'sub2.u1'), wire('i2.y', 'sub2.u2'), wire('sub2.y', 'i2.u'), wire('i2.y', 'i1.u'),
        wire('u.y', 'obs.u'), wire('i1.y', 'obs.y')],
    };
    const dt = 2e-3, n = 400;
    const ref = rk4((e) => [Aol[0][0] * e[0] + Aol[0][1] * e[1], Aol[1][0] * e[0] + Aol[1][1] * e[1]], [1, 0], dt / 4, 4 * n);
    let worst = 0, maxErr = 0;
    simulate(m, n, dt, (s, k) => {
      const xh = s.vec(out('obs', 'xhat').replace(/\[0\]$/, ''), 2);
      const e = [s.at(out('i1', 'y')) - xh[0], s.at(out('i2', 'y')) - xh[1]];
      const r = ref[4 * (k + 1)];
      worst = Math.max(worst, Math.abs(e[0] - r[0]), Math.abs(e[1] - r[1]));
      maxErr = Math.max(maxErr, Math.abs(e[0]));
    });
    expect(worst).toBeLessThan(5e-3);
    expect(maxErr).toBeGreaterThan(0.1); // the estimate really starts away from the state
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('Smith predictor (Smith 1957) and sliding mode (Slotine and Li)', () => {
  it('on a dead-time plant the response equals the delay-free response shifted by the delay', () => {
    // plant 1/(0.1 s + 1) then a 0.2 s delay; model identical; PI Kp = 1, Ki = 10 cancels the plant pole: delay-free loop 10/(s + 10)
    const theta = 0.2;
    const m: Model = {
      nodes: [node('r', 'ps_constant', { value: 1 }), node('sp', 'ps_smith_predictor', { tau: 0.1, theta, Km: 1, Kp: 1, Ki: 10 }),
        node('p1', 'ps_transfer_fcn', { T: 0.1 }), node('d', 'ps_delay', { delay: theta })],
      edges: [wire('r.y', 'sp.r'), wire('sp.u', 'p1.u'), wire('p1.y', 'd.u'), wire('d.y', 'sp.y')],
    };
    let worst = 0, early = 0;
    simulate(m, 400, 2e-3, (s) => {
      const expected = s.t <= theta ? 0 : 1 - Math.exp(-10 * (s.t - theta));
      if (s.t < theta - 0.01) early = Math.max(early, Math.abs(s.at(out('d', 'y'))));
      else worst = Math.max(worst, Math.abs(s.at(out('d', 'y')) - expected));
    });
    expect(early).toBeLessThan(1e-9);
    expect(worst).toBeLessThan(0.02);
  });

  it('sliding mode drives s = de/dt + lambda e into the boundary layer and then e decays as e^(-lambda t)', { timeout: 15000 }, () => { // measured 2.9 s alone, > 5 s under a loaded full run
    const lambda = 2, k = 5, phi = 0.02;
    const m: Model = {
      nodes: [node('r', 'ps_constant', { value: 0 }), node('sm', 'ps_sliding_mode', { lambda, k, boundary_layer: phi }),
        node('i2', 'ps_integrator', { initial: 0 }), node('i1', 'ps_integrator', { initial: 1 })],
      edges: [wire('r.y', 'sm.r'), wire('i1.y', 'sm.y'), wire('sm.u', 'i2.u'), wire('i2.y', 'i1.u')],
    };
    let sMax = 0, y0 = 1, yEnd = 1;
    simulate(m, 1000, 2e-3, (s) => {
      const y = s.at(out('i1', 'y')), yd = s.at(out('i2', 'y'));
      if (s.t > 1.2) sMax = Math.max(sMax, Math.abs(yd + lambda * y));
      yEnd = y;
      void y0;
    });
    expect(sMax).toBeLessThanOrEqual(phi * 1.1);
    expect(Math.abs(yEnd)).toBeLessThan(0.1 * Math.exp(-lambda * 0.8) + 0.05);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('learning blocks', () => {
  it('LMS identifies a known FIR system (Widrow-Hoff): d(k) = 0.5 x(k) - 0.3 x(k-1) -> w = [0.5, -0.3]', () => {
    let seed = 12345;
    const lcg = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const levels = Array.from({ length: 64 }, () => (lcg() < 0.5 ? -1 : 1));
    const ts = 0.01;
    const m: Model = {
      nodes: [node('x', 'ps_stair_gen', { steps: `[${levels.join(' ')}]`, ts }), node('xd', 'ps_delay', { delay: ts }), node('g1', 'ps_gain', { gain: 0.5 }), node('g2', 'ps_gain', { gain: -0.3 }),
        node('d', 'ps_add'), node('lms', 'lms_adaptive_filter', { lr: 0.1, ts })],
      edges: [wire('x.y', 'xd.u'), wire('x.y', 'g1.u'), wire('xd.y', 'g2.u'), wire('g1.y', 'd.u1'), wire('g2.y', 'd.u2'), wire('x.y', 'lms.x'), wire('d.y', 'lms.d')],
    };
    const last = simulate(m, 800, ts);
    near(last.at(out('lms', 'w1')), 0.5, 2e-3, 'w1');
    near(last.at(out('lms', 'w2')), -0.3, 2e-3, 'w2');
    expect(Math.abs(last.at(out('lms', 'err')))).toBeLessThan(5e-3);
  });

  it('LMS updates once per sample: between samples the weights are held (no continuous drift)', () => {
    const ts = 0.05;
    const m: Model = { nodes: [node('x', 'ps_constant', { value: 1 }), node('d', 'ps_constant', { value: 1 }), node('lms', 'lms_adaptive_filter', { lr: 0.2, ts })], edges: [wire('x.y', 'lms.x'), wire('d.y', 'lms.d')] };
    const seen: number[] = [];
    simulate(m, 20, 0.01, (s) => { seen.push(s.at(out('lms', 'w1'))); });
    // dt = 0.01 = ts/5: the weight changes only on the sample grid (t = 0.01 (k = 0), 0.05, 0.10, 0.15)
    const changes = seen.filter((v, i) => i > 0 && v !== seen[i - 1]).length;
    expect(changes).toBe(4);
  });

  const qModel = (p: Record<string, any>, error: Node, reward: Node): Model => ({
    nodes: [error, reward, node('q', 'rl_q_learning_controller', p)], edges: [wire('error.y', 'q.error'), wire('reward.y', 'q.reward')],
  });
  const constant = (id: string, value: number) => node(id, 'ps_constant', { value });

  it('Q-learning (epsilon = 0): Q(s,a) follows Q <- Q + alpha (R + gamma max Q - Q) with a fixed state and reward', () => {
    const alpha = 0.5, gamma = 0.9, R = 1;
    let Q = 0;
    const expected: number[] = [0]; // sample k = 0: no update yet
    for (let k = 1; k <= 8; k++) { Q = Q + alpha * (R + gamma * Q - Q); expected.push(Q); }
    const seen: number[] = [], acts: number[] = [];
    simulate(qModel({ alpha, gamma, epsilon: 0, ts: 0.05 }, constant('error', 0), constant('reward', R)), 9, 0.05, (s) => { seen.push(s.at(out('q', 'max_q'))); acts.push(s.at(out('q', 'action'))); });
    seen.forEach((v, i) => near(v, expected[i], 1e-7, `max_q at sample ${i}`));
    acts.forEach(a => near(a, -1, 1e-6, 'greedy on a zero table: the first action'));
  });

  it('Q-learning is deterministic for a seed (no module-level state) and a different seed gives a different run', () => {
    const run = (seed: number) => {
      const acts: number[] = [];
      simulate(qModel({ epsilon: 0.7, ts: 0.05, seed }, node('error', 'ps_sine', { amp: 2, freq: 0.7 }), constant('reward', 1)), 80, 0.05, (s) => { acts.push(s.at(out('q', 'action'))); });
      return acts;
    };
    const a1 = run(1), a1b = run(1), a2 = run(2);
    expect(a1b).toEqual(a1);
    expect(a2).not.toEqual(a1);
    expect(new Set(a1).size).toBeGreaterThan(1); // it really explores
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('observers and sensors: flux observer, quadrature decoder, resolver-to-digital', () => {
  it('IM flux observer follows the closed-form current-model response and ends synchronous (we = w_s)', () => {
    const Lm = 0.05, Lr = 0.06, Rr = 5, P = 2, wr = 50, I = 5, f = 50, ws = TWO_PI * f;
    const Tr = Lr / Rr, we = P * wr;
    // i_alpha + j i_beta = -j I e^{j ws t}  (Clarke of I sin(ws t - k 2 pi/3));  psi' = (-1/Tr + j we) psi + (Lm/Tr) i,  psi(0) = 0
    const cdiv = (a: [number, number], b: [number, number]): [number, number] => { const d = b[0] ** 2 + b[1] ** 2; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    const K = cdiv([0, -(Lm / Tr) * I], [1 / Tr, ws - we]); // psi_ss = K e^{j ws t}
    const psi = (t: number): [number, number] => {
      const c = Math.cos(ws * t), s = Math.sin(ws * t), d = Math.exp(-t / Tr), cw = Math.cos(we * t), sw = Math.sin(we * t);
      const ss: [number, number] = [K[0] * c - K[1] * s, K[0] * s + K[1] * c];
      const k0: [number, number] = [K[0], K[1]]; // psi_ss(0)
      const tr: [number, number] = [d * (k0[0] * cw - k0[1] * sw), d * (k0[0] * sw + k0[1] * cw)];
      return [ss[0] - tr[0], ss[1] - tr[1]];
    };
    const m: Model = {
      nodes: [node('i', 'ps_sine_3phase', { Vpk: I, f }), node('w', 'ps_constant', { value: wr }), node('obs', 'im_flux_observer', { Lm, Lr, Rr, P })],
      edges: [wire('i.abc', 'obs.iabc'), wire('w.y', 'obs.wr')],
    };
    const dt = 5e-4;
    let worstMag = 0, worstAng = 0;
    const last = simulate(m, 240, dt, (s) => {
      if (s.t < 0.02) return;
      const p = psi(s.t);
      worstMag = Math.max(worstMag, Math.abs(s.at(out('obs', 'imr')) - Math.hypot(p[0], p[1]) / Lm) / (Math.hypot(p[0], p[1]) / Lm));
      let da = s.at(out('obs', 'theta')) - Math.atan2(p[1], p[0]); da = Math.atan2(Math.sin(da), Math.cos(da));
      worstAng = Math.max(worstAng, Math.abs(da));
    });
    expect(worstMag).toBeLessThan(0.02);
    expect(worstAng).toBeLessThan(0.03);
    expect(Math.abs(last.at(out('obs', 'we')) - ws) / ws).toBeLessThan(0.02);
  });

  const stair = (id: string, steps: number[], ts: number) => node(id, 'ps_stair_gen', { steps: `[${steps.join(' ')}]`, ts });
  const quad = (a: number[], b: number[], extra: Record<string, any> = {}, z?: number[]): Model => ({
    nodes: [stair('a', a, 0.01), stair('b', b, 0.01), node('q', 'quad_decoder', { ppr: 100, ts: 0.04, ...extra }), ...(z ? [stair('z', z, 0.01)] : [])],
    edges: [wire('a.y', 'q.a'), wire('b.y', 'q.b'), ...(z ? [wire('z.y', 'q.z')] : [])],
  });

  it('quadrature decoder counts 4 edges per cycle: position 2 pi count / (4 ppr), velocity over the sample time', () => {
    const scale = TWO_PI / (4 * 100);
    let vel = NaN;
    const last = simulate(quad([0, 1, 1, 0], [0, 0, 1, 1]), 25, 0.005, (s) => { if (s.t > 0.1) vel = s.at(out('q', 'vel')); });
    // 12 transitions by t = 0.12, 12 at t = 0.125
    near(last.at(out('q', 'pos')), 12 * scale, 1e-7, 'position');
    near(vel, (4 * scale) / 0.04, 1e-6, 'velocity (4 counts per 0.04 s)');
  });

  it('reversed phase sequence counts down; the index pulse Z clears the count', () => {
    const scale = TWO_PI / 400;
    const down = simulate(quad([0, 0, 1, 1], [0, 1, 1, 0]), 25, 0.005);
    near(down.at(out('q', 'pos')), -12 * scale, 1e-7, 'counting down');
    // Z rises at t = 0.06 together with the 6th transition: the count restarts, 2 more edges by t = 0.085
    const idx = simulate(quad([0, 1, 1, 0], [0, 0, 1, 1], {}, [0, 0, 0, 0, 0, 0, 1, 1]), 17, 0.005);
    near(idx.at(out('q', 'pos')), 2 * scale, 1e-7, 'count after the index');
  });

  it('resolver-to-digital: the type II loop tracks a ramp angle with zero steady-state error and reads the speed', { timeout: 20000 }, () => { // measured 5.1 s alone (3000 calls of 50 us through a 1 kHz carrier)
    const fc = 1000, Om = 50, th0 = 0.3;
    const m: Model = {
      nodes: [node('carrier', 'ps_sine', { amp: 1, freq: fc }), node('ramp', 'ps_ramp', { slope: Om, start: 0 }), node('off', 'ps_constant', { value: th0 }), node('theta', 'ps_add'),
        node('sin', 'ps_math', { func: 'sin' }), node('cos', 'ps_math', { func: 'cos' }), node('vx', 'ps_product'), node('vy', 'ps_product'),
        node('rd', 'resolver_to_digital', { freq: fc, bandwidth: 50, vp_pk: 1 })],
      edges: [wire('ramp.y', 'theta.u1'), wire('off.y', 'theta.u2'), wire('theta.y', 'sin.u'), wire('theta.y', 'cos.u'), wire('carrier.y', 'vx.u1'), wire('sin.y', 'vx.u2'),
        wire('carrier.y', 'vy.u1'), wire('cos.y', 'vy.u2'), wire('carrier.y', 'rd.vp'), wire('vx.y', 'rd.vx'), wire('vy.y', 'rd.vy')],
    };
    let worst = 0, velErr = 0;
    simulate(m, 3000, 5e-5, (s) => {
      if (s.t < 0.1) return;
      worst = Math.max(worst, Math.abs(s.at(out('rd', 'ang')) - (th0 + Om * s.t)));
      velErr = Math.max(velErr, Math.abs(s.at(out('rd', 'vel')) - Om));
    });
    expect(worst).toBeLessThan(0.02);
    expect(velErr / Om).toBeLessThan(0.03);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('PMSM: torque estimator, reference generator (MTPA / field weakening), field weakening, FOC', () => {
  const p = 4, flux = 0.1;
  it('torque estimator: tau = 1.5 p (lambda iq + (Ld - Lq) id iq)', () => {
    const Ld = 0.004, Lq = 0.009, id = -2, iq = 6;
    const m: Model = { nodes: [vec('i', [id, iq]), node('t', 'pmsm_tq_est', { pole_pairs: p, flux, Ld, Lq })], edges: [wire('i.out', 't.idq')] };
    const last = simulate(m, 3, 1e-3, undefined, false);
    near(last.at(out('t', 'tq_est')), 1.5 * p * (flux * iq + (Ld - Lq) * id * iq), 1e-7, 'torque');
  });

  const refgen = (params: Record<string, any>, tq: number, w?: number, vdc?: number) => {
    const nodes: Node[] = [constant('tq', tq), node('g', 'pmsm_ref_gen', { pole_pairs: p, flux, ...params })];
    const edges: Edge[] = [wire('tq.y', 'g.tq_ref')];
    if (w !== undefined) { nodes.push(constant('w', w)); edges.push(wire('w.y', 'g.w_mech')); }
    if (vdc !== undefined) { nodes.push(constant('v', vdc)); edges.push(wire('v.y', 'g.vdc')); }
    const last = simulate({ nodes, edges }, 3, 1e-3);
    return { id: last.at(out('g', 'idq_ref[0]')), iq: last.at(out('g', 'idq_ref[1]')), sat: last.at(out('g', 'tq_ref_sat')), lim: last.at(out('g', 'tq_lim')) };
  };
  const constant = (id: string, value: number) => node(id, 'ps_constant', { value });

  it('MTPA of a non-salient machine: id = 0, iq = tau / (1.5 p lambda); torque below the limit is passed unchanged, either sign', () => {
    for (const T of [3, -3]) {
      const r = refgen({ Ld: 0.005, Lq: 0.005, i_max: 30 }, T);
      near(r.id, 0, 1e-9, 'id');
      near(r.iq, T / (1.5 * p * flux), 1e-9, 'iq');
      near(r.sat, T, 1e-12, 'limited torque');
      near(r.lim, 1.5 * p * flux * 30, 1e-6, 'torque limit 1.5 p lambda Imax');
    }
  });

  it('MTPA of a salient machine: id = lambda/(2 (Lq - Ld)) - sqrt(lambda^2/(4 (Lq - Ld)^2) + iq^2) and the torque equation holds', () => {
    const Ld = 0.004, Lq = 0.009, pp = 3, T = 8;
    const r = refgen({ Ld, Lq, i_max: 30, pole_pairs: pp }, T);
    const dL = Lq - Ld;
    const idMtpa = flux / (2 * dL) - Math.sqrt((flux * flux) / (4 * dL * dL) + r.iq * r.iq);
    near(r.id, idMtpa, 5e-4, 'id on the MTPA trajectory');
    near(1.5 * pp * r.iq * (flux + (Ld - Lq) * r.id), T, 1e-6, 'tau = 1.5 p iq (lambda + (Ld - Lq) id)');
  });

  it('field weakening: the voltage ellipse and the current circle bound the map, tau_lim and the minimum-current point match the closed forms', () => {
    const L = 0.005, Imax = 30, vdc = 60, Vmax = vdc / 2;
    // we chosen so that the circle and the ellipse meet at id = -20 A: (V/we)^2 = lambda^2 + L^2 Imax^2 + 2 L lambda id
    const vOverW = Math.sqrt(flux * flux + L * L * Imax * Imax + 2 * L * flux * -20);
    const we = Vmax / vOverW, w = we / p;
    const sat = refgen({ Ld: L, Lq: L, i_max: Imax }, 20, w, vdc);
    const iqTop = Math.sqrt(Imax * Imax - 400);
    near(sat.lim, 1.5 * p * flux * iqTop, 1e-3, 'tau_lim');
    near(sat.sat, sat.lim, 1e-3, 'a request above the limit is limited');
    near(sat.id, -20, 2e-3, 'id at the limit');
    // below the limit: the smallest |id| that keeps the voltage ellipse, id = (sqrt((V/we)^2 - (L iq)^2) - lambda)/L
    const T = 8, iq = T / (1.5 * p * flux);
    const mid = refgen({ Ld: L, Lq: L, i_max: Imax }, T, w, vdc);
    near(mid.iq, iq, 1e-6, 'iq');
    near(mid.id, (Math.sqrt(vOverW * vOverW - (L * iq) ** 2) - flux) / L, 1e-3, 'id (field weakening)');
    expect(we * we * ((L * mid.id + flux) ** 2 + (L * mid.iq) ** 2)).toBeLessThanOrEqual(Vmax * Vmax * (1 + 1e-6));
    expect(Math.hypot(mid.id, mid.iq)).toBeLessThanOrEqual(Imax);
  });

  it('field-weakening controller: over-voltage injects the negative d current (saturated at id_fw_max), under-voltage leaves it', () => {
    const run = (vmag: number, wired = true) => {
      const nodes: Node[] = [vec('iref', [2, 6]), vec('v', [vmag, 0]), node('fw', 'pmsm_field_weakening', { v_margin: 0.95, Kp: 0.5, Ki: 50, id_fw_max: 20 })];
      const edges: Edge[] = [wire('iref.out', 'fw.idq_ref'), wire('v.out', 'fw.vdq')];
      if (wired) { nodes.push(constant('vm', 40)); edges.push(wire('vm.y', 'fw.v_max')); }
      const last = simulate({ nodes, edges }, 100, 2e-3, undefined, false);
      return [last.at(out('fw', 'idq_ref_fw[0]')), last.at(out('fw', 'idq_ref_fw[1]'))];
    };
    const over = run(50);
    near(over[0], 2 - 20, 1e-6, 'id* + d (saturated)'); near(over[1], 6, 1e-12, 'iq unchanged');
    expect(run(30)).toEqual([2, 6]);
    expect(run(50, false)).toEqual([2, 6]);
  });

  it('FOC with the PMSM at stiff speed: id -> 0 and iq -> tau* / (1.5 p lambda) (Clarke -> Park -> PI + decoupling -> inverse Park)', () => {
    const w0 = 100, thetaE = (t: number) => p * w0 * t, Vdc = 150, tau = 3;
    const iqRef = tau / (1.5 * p * flux);
    const phases = ['a', 'b', 'c'];
    const nodes: Node[] = [
      node('dc', 'dc_voltage', { V: Vdc, R_int: 0 }), node('gnd', 'ground'), node('inv', 'pwm_3ph_2level', { model_mode: 'averaged', control_mode: 'three_phase_modulation' }),
      node('sp1', 'phase_splitter'), node('sp2', 'phase_splitter'), node('m', 'pmsm', { pole_pairs: p, J: 0.02, B: 0 }),
      node('w', 'ang_vel_source', { omega: w0 }), node('rref', 'rot_ref'), mux3('mux'),
      node('foc', 'pmsm_foc', { pole_pairs: p, Rs: 0.1, Kp: 5, Ki: 100, Ld: 0.005, Lq: 0.005, flux }),
      constant('tq', tau), constant('wm', w0), node('th', 'ps_ramp', { slope: w0, start: 0 }), constant('vdc', Vdc),
      ...phases.map(k => node(`is${k}`, 'i_sensor')),
    ];
    const edges: Edge[] = [
      wire('dc.p', 'inv.p'), wire('dc.n', 'gnd.a'), wire('inv.n', 'gnd.a'), wire('inv.abc', 'sp1.abc'), wire('sp2.abc', 'm.abc'),
      wire('m.r', 'w.r'), wire('w.c', 'rref.r'),
      wire('foc.g', 'inv.vabc'), wire('mux.out', 'foc.iabc_s'), wire('tq.y', 'foc.ref'), wire('wm.y', 'foc.w_s'), wire('th.y', 'foc.th_s'), wire('vdc.y', 'foc.vdc_s'),
      ...phases.flatMap(k => [wire(`sp1.${k}`, `is${k}.p`), wire(`is${k}.n`, `sp2.${k}`), wire(`is${k}.i`, `mux.${k}`)]),
    ];
    let id = NaN, iq = NaN;
    simulate({ nodes, edges }, 500, 3e-4, (s) => {
      const [a, b, c] = phases.map(k => s.at(out(`is${k}`, 'i')));
      const al = (2 / 3) * (a - b / 2 - c / 2), be = (b - c) / Math.sqrt(3), th = thetaE(s.t);
      id = al * Math.cos(th) + be * Math.sin(th); iq = -al * Math.sin(th) + be * Math.cos(th);
    }, false);
    near(id, 0, 0.1, 'id');
    near(iq, iqRef, 0.1, 'iq');
  }, 30000);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('induction machine controllers: V/f, FOC, DTC', () => {
  const constant = (id: string, value: number) => node(id, 'ps_constant', { value });
  const abcTrace = (s: Sample, id: string, port: string) => s.vec(out(id, port), 3);

  it('scalar V/f: V(f) = V_boost + (V_rated - V_boost) |f|/f_rated up to f_rated, V_rated = v_f_ratio f_rated above; phases a, b, c = sin(th), sin(th -+ 120 deg)', () => {
    const ratio = 4.4, fr = 50, boost = 10;
    for (const [f, V] of [[25, boost + (ratio * fr - boost) * 0.5], [60, ratio * fr], [-25, boost + (ratio * fr - boost) * 0.5]] as const) {
      const m: Model = { nodes: [constant('f', f), node('vf', 'im_scalar_ctrl', { v_f_ratio: ratio, f_rated: fr, v_boost: boost })], edges: [wire('f.y', 'vf.f_ref')] };
      let worst = 0;
      simulate(m, 60, 1e-3, (s) => {
        const th = TWO_PI * f * s.t;
        const exp3 = [V * Math.sin(th), V * Math.sin(th - TWO_PI / 3), V * Math.sin(th + TWO_PI / 3)];
        abcTrace(s, 'vf', 'vabc').forEach((v, k) => { worst = Math.max(worst, Math.abs(v - exp3[k])); });
      });
      expect(worst / V, `f = ${f} Hz`).toBeLessThan(2e-3);
    }
  });

  it('FOC (mode 1) without feedback: v_d = Kp_i id* + Ki_i id* t, v_q = w_e (Lm/Lr) Lm imr*, rotated by theta_f = w_e t (g = clamp(v/(vdc/2)))', () => {
    const Lm = 0.05, Lr = 0.06, P = 2, wref = 100, imr = 10, Kpi = 5, Kii = 100, vdc = 600;
    const m: Model = { nodes: [constant('w', wref), node('foc', 'im_foc_ctrl', { Lm, Lr, P, Kp_i: Kpi, Ki_i: Kii, imr_ref: imr, v_dc: vdc, mode: 1 })], edges: [wire('w.y', 'foc.wr_ref')] };
    // measured speed open = 0, so the speed loop commands torque; use wr = wr_ref instead
    m.nodes.push(constant('wr', wref)); m.edges.push(wire('wr.y', 'foc.wr'));
    const we = P * wref;
    let worstV = 0, worstG = 0;
    simulate(m, 20, 1e-3, (s) => {
      const t = s.t, vd = Kpi * imr + Kii * imr * t, vq = we * (Lm / Lr) * Lm * imr, th = we * t;
      worstV = Math.max(worstV, Math.abs(s.at(out('foc', 'vabc')) - Math.hypot(vd, vq)));
      const ga = (vd * Math.cos(th) - vq * Math.sin(th)) / (vdc / 2);
      worstG = Math.max(worstG, Math.abs(abcTrace(s, 'foc', 'g')[0] - ga));
    });
    expect(worstV).toBeLessThan(0.5);
    expect(worstG).toBeLessThan(0.01);
  });

  it('FOC mode 0 is open-loop V/f: |v| = v_f_ratio |w_e| / (2 pi) with w_e = P w*', () => {
    const m: Model = { nodes: [constant('w', 100), node('foc', 'im_foc_ctrl', { P: 2, v_f_ratio: 4.4, mode: 0, v_dc: 600 })], edges: [wire('w.y', 'foc.wr_ref')] };
    const last = simulate(m, 10, 1e-3);
    near(last.at(out('foc', 'vabc')), 4.4 * (2 * 100) / TWO_PI, 1e-9, '|v|');
  });

  it('DTC flux estimator integrates v_s - Rs i_s (voltage model) exactly for a balanced voltage set', () => {
    const V = 100, f = 50, w = TWO_PI * f;
    const m: Model = {
      nodes: [node('v', 'ps_sine_3phase', { Vpk: V, f }), node('i', 'ps_sine_3phase', { Vpk: 0, f }), constant('tq', 0), node('dtc', 'im_dtc_ctrl', { Rs: 0.1, P: 2, flux_ref: 0.5, flux_band: 0.02, tq_band: 1, ts: 1e-3 })],
      edges: [wire('v.abc', 'dtc.vabc'), wire('i.abc', 'dtc.iabc'), wire('tq.y', 'dtc.tq_ref')],
    };
    let worst = 0;
    simulate(m, 500, 1e-4, (s) => {
      // v_alpha = V sin(wt), v_beta = -V cos(wt): psi_alpha = V (1 - cos wt)/w, psi_beta = -V sin(wt)/w
      worst = Math.max(worst, Math.abs(s.at(state('dtc', 'psi_alpha')) - (V * (1 - Math.cos(w * s.t))) / w), Math.abs(s.at(state('dtc', 'psi_beta')) + (V * Math.sin(w * s.t)) / w));
    });
    expect(worst).toBeLessThan(2e-3 * V / w);
  });

  it('DTC switching table: each selected vector moves the flux the intended way (radial: up / down, tangential: torque up / down) in every sector', () => {
    const f = (kind: 'a' | 'b') => kind;
    void f;
    // flux vector psi at angle ang (sector k centred at (k-1) 60 deg), magnitude below / above the reference; estimator states are set directly
    const lookup = lib('im_dtc_ctrl');
    const ports = lookup.ports.map(pp => pp.id);
    const sectorCentre = (k: number) => ((k - 1) * Math.PI) / 3;
    const vectors = [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]];
    const eval1 = (angle: number, mag: number, torqueSign: -1 | 0 | 1, prev: number[] = [-1, 1, 0, 0, 0]) => {
      const psi = [mag * Math.cos(angle), mag * Math.sin(angle)];
      // current chosen so that the estimated torque 1.5 P (psi_a i_b - psi_b i_a) = 0 while the reference asks for +-10 N m or 0
      const across = ports.map(id => (['vabc', 'iabc'].includes(id) ? [0, 0, 0] : id === 'tq_ref' ? 10 * torqueSign : id === 'flux_ref' ? 0.5 : 0));
      const history = { dut: { t: [0], v: [prev] } };
      const rows = blockEquations.im_dtc_ctrl({
        across, dAcross: across.map(a => (Array.isArray(a) ? [0, 0, 0] : 0)), branch: [0, 0, 0], dBranch: [0, 0, 0], state: psi, dState: [0, 0],
        ctx: { dt: 1e-4, time: 1e-3, history, parameters: {}, prevStates: [], states: [], stateDerivatives: [] } as any,
        params: { Rs: 0.1, P: 2, flux_ref: 0.5, flux_band: 0.02, tq_band: 1, ts: 5e-5 }, ports, nodeId: 'dut', connectedPorts: ['tq_ref', 'vabc', 'iabc'],
      });
      const g = rows.slice(0, 3).map(r => (-r + 1) / 2); // g = 2 S - 1 -> S
      return vectors.findIndex(v => v.every((s, i) => s === g[i]));
    };
    for (let k = 1; k <= 6; k++) {
      const c = sectorCentre(k);
      for (const [mag, wantFlux] of [[0.4, +1], [0.6, -1]] as const) {
        for (const tq of [+1, -1] as const) {
          const idx = eval1(c + 0.1, mag, tq);
          expect(idx, `sector ${k} flux ${wantFlux} torque ${tq}`).toBeGreaterThanOrEqual(0);
          const vAng = (idx * Math.PI) / 3, rel = vAng - (c + 0.1);
          // component of the voltage vector along the flux (radial) and perpendicular (tangential, counter-clockwise positive)
          expect(Math.sign(Math.round(Math.cos(rel) * 1e6)), `radial sector ${k}`).toBe(wantFlux);
          expect(Math.sign(Math.round(Math.sin(rel) * 1e6)), `tangential sector ${k}`).toBe(tq);
        }
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('BLDC, DC and converter controllers', () => {
  const constant = (id: string, value: number) => node(id, 'ps_constant', { value });
  const FORWARD: Record<number, number[]> = { 5: [1, -1, 0], 4: [1, 0, -1], 6: [0, 1, -1], 2: [-1, 1, 0], 3: [-1, 0, 1], 1: [0, -1, 1], 0: [0, 0, 0], 7: [0, 0, 0] };

  it('six-step commutation: Hall 5,4,6,2,3,1 energise A+B-, A+C-, B+C-, B+A-, C+A-, C+B- (all floating for 0 / 7), reversed by dir', () => {
    const codes = [5, 4, 6, 2, 3, 1, 0, 7];
    for (const dir of [1, -1]) {
      const m: Model = { nodes: [node('h', 'ps_stair_gen', { steps: `[${codes.join(' ')}]`, ts: 0.01 }), constant('d', dir), node('c', 'bldc_commutation')], edges: [wire('h.y', 'c.hall'), wire('d.y', 'c.dir')] };
      const seen: number[][] = [];
      simulate(m, 16, 0.005, (s, k) => { if (k % 2 === 0) seen.push(s.vec(out('c', 'abc'), 3)); });
      codes.forEach((code, i) => seen[i].forEach((v, j) => near(v, FORWARD[code][j] * dir, 1e-6, `hall ${code}, dir ${dir}, phase ${j}`)));
    }
  });

  it('the table gives positive torque on the trapezoidal back-EMF of bldc_motor at every sector centre: sum(pattern_k f_k) = 2', () => {
    const trap = (a: number) => {
      const t = ((a % TWO_PI) + TWO_PI) % TWO_PI, d = Math.PI / 6;
      if (t < d) return t / d; if (t < 5 * d) return 1; if (t < 7 * d) return 1 - (t - 5 * d) / d; if (t < 11 * d) return -1; return -1 + (t - 11 * d) / d;
    };
    const hall = (deg: number) => {
      const inside = (a: number, b: number) => { const x = (((deg - a) % 360) + 360) % 360; return x < ((b - a + 360) % 360) ? 1 : 0; };
      return 4 * inside(30, 210) + 2 * inside(150, 330) + inside(270, 90);
    };
    for (let i = 0; i < 6; i++) {
      const deg = 60 + 60 * i, th = (deg * Math.PI) / 180;
      const patt = blockEquations.bldc_commutation({
        across: [hall(deg), 1, 0], dAcross: [0, 0, 0], branch: [0, 0, 0], dBranch: [], state: [], dState: [], ctx: {} as any, params: {}, ports: ['hall', 'dir', 'abc'], nodeId: 'x',
      }).map(r => -r);
      const f = [trap(th), trap(th - TWO_PI / 3), trap(th + TWO_PI / 3)];
      near(patt[0] * f[0] + patt[1] * f[1] + patt[2] * f[2], 2, 1e-9, `sector at ${deg} deg`);
    }
  });

  it('BLDC current controller: vabc = pattern u with u = Kp e + Ki e t (no limit hit); limited at +-v_max', () => {
    const run = (isRef: number) => {
      const m: Model = { nodes: [constant('r', isRef), constant('i', 0), constant('h', 5), node('c', 'bldc_current_ctrl', { Kp: 1, Ki: 10, v_max: 24 })], edges: [wire('r.y', 'c.is_ref'), wire('i.y', 'c.is'), wire('h.y', 'c.hall')] };
      return simulate(m, 100, 1e-3);
    };
    const a = run(2); // e = 2: u = 2 + 20 t at t = 0.1
    near(a.vec(out('c', 'vabc'), 3)[0], 2 + 20 * 0.1, 1e-9, 'v_a'); near(a.vec(out('c', 'vabc'), 3)[1], -(2 + 20 * 0.1), 1e-9, 'v_b'); near(a.vec(out('c', 'vabc'), 3)[2] + 0, 0, 1e-12, 'v_c floating');
    near(run(500).vec(out('c', 'vabc'), 3)[0], 24, 1e-9, 'limited at v_max');
  });

  it('BLDC PWM: the carrier-average of g_k is pattern_k u (duty (1 + pattern u)/2 against a triangular carrier)', () => {
    const m: Model = { nodes: [constant('r', 1), constant('i', 0), constant('h', 5), node('c', 'bldc_pwm_ctrl', { Kp: 0.4, Ki: 0, freq: 1000 })], edges: [wire('r.y', 'c.is_ref'), wire('i.y', 'c.is'), wire('h.y', 'c.hall')] };
    const acc = [0, 0, 0]; let n = 0;
    simulate(m, 400, 5e-6, (s) => { if (s.t > 1e-3 + 1e-9) { s.vec(out('c', 'g'), 3).forEach((v, k) => { acc[k] += v; }); n++; } });
    // u = 0.4 (Kp e), pattern A+B-: mean g = [0.4, -0.4, 0]
    near(acc[0] / n, 0.4, 0.05, 'mean g_a'); near(acc[1] / n, -0.4, 0.05, 'mean g_b'); near(acc[2] / n, 0, 0.05, 'mean g_c');
  });

  it('DC-DC voltage controller: duty = FF + Kp e + Ki e t (clamped to [0, 1]); an open vRef uses the parameter', () => {
    const m = (v: number): Model => ({ nodes: [constant('v', v), constant('ff', 0.4), node('c', 'dcdc_ctrl', { v_ref: 48, Kp: 0.01, Ki: 1 })], edges: [wire('v.y', 'c.v'), wire('ff.y', 'c.ff')] });
    near(simulate(m(48), 50, 1e-3).at(out('c', 'ctrl')), 0.4, 1e-12, 'e = 0: duty = FF');
    near(simulate(m(40), 50, 1e-3).at(out('c', 'ctrl')), 0.4 + 0.01 * 8 + 8 * 0.05, 1e-9, 'duty at 50 ms'); // e = 8 V
    near(simulate(m(40), 300, 1e-3).at(out('c', 'ctrl')), 1, 1e-12, 'clamped at 1');
  });

  it('DC voltage / current controllers: PI with output limits (duty [0, 1], voltage +-vMax from the port or the parameter)', () => {
    const dv: Model = { nodes: [constant('r', 1.1), constant('v', 1), node('c', 'dc_voltage_ctrl', { Kp: 0.5, Ki: 5 })], edges: [wire('r.y', 'c.v_ref'), wire('v.y', 'c.v')] };
    near(simulate(dv, 100, 1e-3).at(out('c', 'ctrl')), 0.5 * 0.1 + 5 * 0.1 * 0.1, 1e-9, 'duty = Kp e + Ki e t');
    const dc = (ref: number, vmaxPort?: number): Model => ({
      nodes: [constant('r', ref), constant('i', 0), node('c', 'dc_current_ctrl', { Kp: 1, Ki: 10, v_max: 240 }), ...(vmaxPort !== undefined ? [constant('vm', vmaxPort)] : [])],
      edges: [wire('r.y', 'c.i_ref'), wire('i.y', 'c.i'), ...(vmaxPort !== undefined ? [wire('vm.y', 'c.v_max')] : [])],
    });
    near(simulate(dc(2), 100, 1e-3).at(out('c', 'v_ref')), 2 + 10 * 2 * 0.1, 1e-9, 'v = Kp e + Ki e t');
    near(simulate(dc(1000), 100, 1e-3).at(out('c', 'v_ref')), 240, 1e-9, 'limit = v_max parameter');
    near(simulate(dc(1000, 50), 100, 1e-3).at(out('c', 'v_ref')), 50, 1e-9, 'limit = vMax port');
  });

  it('velocity controller: with the saturated torque wired the integral follows the back-calculation law I = I_inf (1 - e^(-Kb t))', () => {
    const Kp = 1, Ki = 2, e = 10, sat = 15, Kb = Ki / Kp;
    const m: Model = { nodes: [constant('r', 10), constant('w', 0), constant('s', sat), node('c', 'velocity_ctrl', { Kp, Ki })], edges: [wire('r.y', 'c.w_ref'), wire('w.y', 'c.w_mech'), wire('s.y', 'c.tq_sat')] };
    const Iinf = (Ki * e + Kb * (sat - Kp * e)) / Kb;
    const last = simulate(m, 500, 2e-3);
    near(last.at(out('c', 'tq_unsat')), Kp * e + Iinf * (1 - Math.exp(-Kb * 1)), 5e-3, 'tq_unsat at 1 s');
  });

  it('hysteresis current controller: per-phase relay with memory and band (reference algorithm evaluated independently on the sample grid)', () => {
    const ts = 1e-3, band = 0.04, Vref = 1, Vmeas = 0.95, f = 50, w = TWO_PI * f;
    const m: Model = {
      nodes: [node('ref', 'ps_sine_3phase', { Vpk: Vref, f }), node('meas', 'ps_sine_3phase', { Vpk: Vmeas, f }), node('h', 'hysteresis_ctrl_3ph', { band, ts })],
      edges: [wire('ref.abc', 'h.iabc_ref'), wire('meas.abc', 'h.iabc'), wire('h.s', 'scope.in1')].slice(0, 2),
    };
    m.edges.push(wire('meas.abc', 'h.iabc'));
    m.edges = [wire('ref.abc', 'h.iabc_ref'), wire('meas.abc', 'h.iabc')];
    const s = [-1, -1, -1];
    let mismatches = 0, switches = 0;
    simulate(m, 40, ts, (smp, k) => {
      const t = (k + 1) * ts;
      for (let j = 0; j < 3; j++) {
        const off = [0, -TWO_PI / 3, TWO_PI / 3][j];
        const e = (Vref - Vmeas) * Math.sin(w * t + off);
        const prev = s[j];
        s[j] = e > band / 2 ? 1 : e < -band / 2 ? -1 : s[j];
        if (s[j] !== prev) switches++;
      }
      const got = smp.vec(out('h', 's'), 3);
      if (got.some((v, j) => Math.abs(v - s[j]) > 1e-6)) mismatches++;
    });
    expect(mismatches).toBe(0);
    expect(switches).toBeGreaterThan(3);
  });

  it('PFC rectifier controller: id* = Kp_v e + Ki_v e t, v_conv = v_grid - Kp_i (i* - i) in the grid frame (per unit)', () => {
    const KpV = 0.1, KiV = 2, KpI = 1, f = 50, w = TWO_PI * f;
    const m: Model = {
      nodes: [node('vg', 'ps_sine_3phase', { Vpk: 1, f }), node('ig', 'ps_sine_3phase', { Vpk: 0.5, f }), constant('ref', 800), constant('dc', 790), node('c', 'pfc_rectifier_ctrl', { Kp_v: KpV, Ki_v: KiV, Kp_i: KpI })],
      edges: [wire('vg.abc', 'c.vabc_sens'), wire('ig.abc', 'c.iabc_sens'), wire('ref.y', 'c.vdc_ref'), wire('dc.y', 'c.vdc_sens')],
    };
    let worst = 0;
    simulate(m, 20, 5e-4, (s) => {
      const idRef = KpV * 10 + KiV * 10 * s.t, vd = 1 - KpI * (idRef - 0.5);
      // grid angle theta = w t - pi/2, so alpha = vd cos(theta) = vd sin(w t) and the set is vd [sin(wt), sin(wt - 120), sin(wt + 120)]
      const want = [0, -TWO_PI / 3, TWO_PI / 3].map(o => Math.max(-1, Math.min(1, vd * Math.sin(w * s.t + o))));
      s.vec(out('c', 'vabc_ref'), 3).forEach((v, k) => { worst = Math.max(worst, Math.abs(v - want[k])); });
      worst = Math.max(worst, Math.abs(s.at(out('c', 'vis')) - idRef));
    });
    expect(worst).toBeLessThan(2e-3);
  });

  it('cycloconverter controller: cos(alpha) = m v_ref sin(2 pi f t) (cosine crossing); the bank follows the output current with a blocking time', () => {
    const m = (icyc?: number): Model => ({
      nodes: [constant('v', 1), constant('f', 10), node('c', 'cycloconverter_ctrl', { m: 0.8, bank_limit: 0.05 }), ...(icyc !== undefined ? [constant('i', icyc)] : [])],
      edges: [wire('v.y', 'c.v_ref'), wire('f.y', 'c.f_ref'), ...(icyc !== undefined ? [wire('i.y', 'c.icyc')] : [])],
    });
    let worst = 0;
    simulate(m(), 100, 1e-3, (s) => { worst = Math.max(worst, Math.abs(s.at(out('c', 'p')) - Math.acos(0.8 * Math.sin(TWO_PI * 10 * s.t)))); });
    expect(worst).toBeLessThan(5e-3);
    const bank: number[] = [];
    simulate(m(-1), 10, 0.01, (s) => { bank.push(s.at(out('c', 'vis'))); });
    bank.slice(0, 4).forEach(v => near(v, 0, 1e-6, 'blocked for bank_limit after the polarity change (first seen at t = 0.01)'));
    bank.slice(6).forEach(v => near(v, -1, 1e-6, 'negative bank'));
    near(simulate(m(), 5, 0.01).at(out('c', 'vis')), 1, 1e-6, 'an open icyc selects the positive bank');
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ac_motor_pid_control: the stator-current equations are those of the squirrel-cage machine (equivalent circuit at standstill)', () => {
  it('blocked rotor (huge inertia), P-only speed loop: the stator current amplitude is V / |Z(w_e)| of the T-equivalent circuit', () => {
    const Rs = 0.5, Ls = 0.1, Rr = 0.4, Lr = 0.1, Lm = 0.09, P = 2, wref = 25, Kp = 2;
    const we = P * wref, V = Kp * wref; // phase voltage amplitude (omega ~ 0 so e = w_ref)
    const m: Model = { nodes: [node('c', 'ac_motor_pid_control', { Kp, Ki: 0, Kd: 0, w_ref: wref, tl: 0, Rs, Ls, Rr, Lr, Lm, P, J: 1e6, B: 0 })], edges: [] };
    // Z = Rs + j we Lls + (j we Lm)(Rr + j we Llr)/(Rr + j we (Lm + Llr)),  Lls = Ls - Lm, Llr = Lr - Lm
    const cx = (re: number, im: number) => ({ re, im });
    const mul = (a: any, b: any) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
    const div = (a: any, b: any) => { const d = b.re ** 2 + b.im ** 2; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
    const par = div(mul(cx(0, we * Lm), cx(Rr, we * (Lr - Lm))), cx(Rr, we * Lr));
    const Z = Math.hypot(Rs + par.re, we * (Ls - Lm) + par.im);
    let amp = 0;
    simulate(m, 400, 5e-3, (s, k) => { if (k > 300) amp = Math.max(amp, Math.hypot(s.at(state('c', 'ias')), s.at(state('c', 'ibs')))); }, false);
    near(amp, V / Z, 0.03 * (V / Z), 'stator current amplitude');
  });
});
