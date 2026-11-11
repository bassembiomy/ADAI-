/**
 * WP-10 — gates V2/V3 for the ADIA-only blocks: navigation / robot vacuum (ROBOT_VACUUM_*) and DEM / CFD (DEM_*, CFD_*).
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 2, 3 oracle 5, 4.2, 9); decision D5:
 * ADIA-only blocks are verified by physical / kinematic invariants, bounded-state checks and closed-loop runs, G is n/a.
 *
 * Oracles (written here, never read from the block under test):
 *  - differential-drive kinematics (textbook unicycle): w_L = (v - w L/2)/r, w_R = (v + w L/2)/r, v = r (w_L+w_R)/2,
 *    w = r (w_R-w_L)/L, circle radius v/w; the unicycle integration used in the closed loops is written in this file;
 *  - DC motor L di/dt = V - R i - K w, J dw/dt = K i - B w. B = 0.02 is the literal in the factory (it has no parameter);
 *    steady state w = K V/(R B + K^2), stall current V/R;
 *  - battery Ah balance: d(SOC %) = -I t /(3600 C) * 100 over t seconds (3600 s: I/C * 100);
 *  - encoder / odometry: counts = rotation / (2 pi) * cpr; arc = counts * 2 pi / cpr * r;
 *  - Hertz contact F = k delta^(3/2) with k = stiffness_normal (the factory parameter is the contact stiffness K = 4/3 E* sqrt(R*));
 *  - breadth-first / Dijkstra search on a hand-built grid with the 8-neighbour octile costs (1, 1.414).
 * Math.random is seeded with mulberry32 in every test that runs a block that uses it (XBV-023); where the block draws
 * noise as (random - 0.5) * 2 * std, random = 0.5 makes the noise exactly zero.
 * Known and not re-pinned: XBV-019 (|| defaults turn 0 into the default: lidar noise std and wheel_friction 0 cannot be
 * set), XBV-020 (in-place state mutation: continuous dynamics use rk4 only where the block does not mutate state, the
 * discrete blocks are driven block-level), XBV-021, XBV-023, XBV-024.
 * Pins use it.fails with provisional ids finding id (docs/xbridges-verification/ledger.json) (docs/xbridges-verification/ledger.json).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { buildModel, mulberry32, runModel, type RunResult } from '../testkit';

type B = { id: string; type: string; params?: Record<string, unknown> };
type Block = ReturnType<(typeof BLOCK_LIBRARY)[string]>;

afterEach(() => { vi.restoreAllMocks(); });
const seed = (s: number) => vi.spyOn(Math, 'random').mockImplementation(mulberry32(s));
const noNoise = () => vi.spyOn(Math, 'random').mockImplementation(() => 0.5);

const num = (v: unknown): number => Number(Array.isArray(v) ? (v.flat(Infinity) as unknown[])[0] : v);
const flat = (v: unknown): number[] => (Array.isArray(v) ? (v as unknown[]).flatMap(flat) : [Number(v)]);
const near = (actual: number, expected: number, tol: number, what = '') =>
  expect(Math.abs(actual - expected), `${what} got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tol);
const constant = (id: string, value: unknown): B => ({ id, type: 'Constant', params: { value } });
const mk = (type: string, params: Record<string, unknown> = {}): Block => BLOCK_LIBRARY[type]('x', params);
const finiteDeep = (v: unknown): boolean => (Array.isArray(v) ? v.every(finiteDeep) : typeof v === 'number' ? Number.isFinite(v) : true);

/** Block-level execution with the state threaded through as the engine does (one call per step, `ts` apart). */
const drive = (b: Block, steps: unknown[][], ts = 0.1, t0 = 0) => {
  let state = b.state;
  const outs: unknown[][] = [];
  steps.forEach((ins, k) => {
    const r = b.execute(ins as never, b.params, state, t0 + k * ts);
    if (r.nextState !== undefined) state = r.nextState;
    outs.push([...(r.outputs as unknown[])]);
  });
  return { outs, state };
};
const once = (b: Block, ins: unknown[], time = 0) => b.execute(ins as never, b.params, b.state, time).outputs as unknown[];

const sim = (blocks: B[], wires: string[], probes: string[], o: { solver?: string; dt?: number; stop?: number; init?: Record<string, Record<string, unknown>> } = {}): RunResult => {
  const model = buildModel({ blocks, wires });
  for (const [id, st] of Object.entries(o.init ?? {})) {
    const blk = model.blocks.find((x) => x.id === id)!;
    blk.state = { ...(blk.state as object), ...st };
  }
  return runModel(model, { solver: o.solver ?? 'rk4', dt: o.dt ?? 0.01, stopTime: o.stop ?? 1, probes });
};
const last = (r: RunResult, probe: string) => r.signals[probe][r.signals[probe].length - 1];
const at = (r: RunResult, probe: string, t: number) => {
  const i = r.t.findIndex((x) => Math.abs(x - t) < 1e-9);
  expect(i, `no sample at t=${t}`).toBeGreaterThanOrEqual(0);
  return r.signals[probe][i];
};

// Factory constants (documented in the factory descriptions / defaults).
const R_W = 0.033; // wheel_radius
const L_W = 0.16; // wheel_separation
const CPR = 360;

// ---------------------------------------------------------------------------------------------------------------
describe('1. Differential-drive kinematics (KINEMATICS, DYNAMICS, ODOMETRY, ODOMETRY_SENSOR)', () => {
  // Factory equation: w_L_ref = (V_ref - w_ref L/2)/r, w_R_ref = (V_ref + w_ref L/2)/r.
  it('KINEMATICS gives w_L = (v - w L/2)/r and w_R = (v + w L/2)/r for several (v, w), including zero and negatives', () => {
    for (const [v, w] of [[0.2, 1.0], [0.1, 0], [0, 1.5], [-0.15, 0.7], [0.22, -1.6], [0, 0]]) {
      const [wl, wr] = once(mk('ROBOT_VACUUM_KINEMATICS'), [v, w]) as number[];
      near(wl, (v - (w * L_W) / 2) / R_W, 1e-12, `wl(${v},${w})`);
      near(wr, (v + (w * L_W) / 2) / R_W, 1e-12, `wr(${v},${w})`);
    }
  });
  it('KINEMATICS with other wheel_radius / wheel_separation uses them', () => {
    const [wl, wr] = once(mk('ROBOT_VACUUM_KINEMATICS', { wheel_radius: 0.05, wheel_separation: 0.3 }), [0.3, 2]) as number[];
    near(wl, (0.3 - 0.3) / 0.05, 1e-12);
    near(wr, (0.3 + 0.3) / 0.05, 1e-12);
  });
  it('inverse: DYNAMICS chassis outputs v = r (wL+wR)/2 and w = r (wR-wL)/L, round trip through KINEMATICS returns (v, w)', () => {
    const dyn = mk('ROBOT_VACUUM_DYNAMICS');
    for (const [v, w] of [[0.2, 1.0], [-0.1, 0.4], [0, -1.2]]) {
      const [wl, wr] = once(mk('ROBOT_VACUUM_KINEMATICS'), [v, w]) as number[];
      const o = once(dyn, [wl, wr]) as number[];
      near(o[3], v, 1e-12, 'v');
      near(o[4], w, 1e-12, 'w');
    }
  });

  // Start (-2.5, -2.5, theta 0): open floor of the hard-coded room (walls and furniture >= 0.3 m away along the paths below).
  const plant = (wl: number, wr: number, stop: number, init: Record<string, unknown> = {}) =>
    sim([constant('wl', wl), constant('wr', wr), { id: 'd', type: 'ROBOT_VACUUM_DYNAMICS' }],
      ['wl.out -> d.omega_L', 'wr.out -> d.omega_R'], ['d.x', 'd.y', 'd.theta'],
      { stop, dt: 0.01, init: { d: { x: -2.5, y: -2.5, theta: 0, ...init } } });

  it('equal wheel speeds: y and theta stay constant (straight line)', () => {
    const r = plant(3, 3, 5);
    r.t.forEach((_, k) => {
      near(num(r.signals['d.y'][k]), -2.5, 1e-9, 'y');
      near(num(r.signals['d.theta'][k]), 0, 1e-9, 'theta');
    });
  });
  // Rule: v = r w_wheel = 0.099 m/s so x(t) = x0 + v t. Factory evaluateDerivatives scales the wheel speeds by
  // slip_factor = 1 - wheel_friction/robot_mass = 0.992, while the same block's execute reports V without it.
  it.fails('XBV-122: equal wheel speeds 3 rad/s: x(10) = x0 + r*w*10 = -1.51 (factory integrates 0.992 of it)', () => {
    const r = plant(3, 3, 10);
    near(num(last(r, 'd.x')), -2.5 + R_W * 3 * 10, 1e-6, 'x(10)');
  });
  it('opposite wheel speeds: x and y stay constant (rotation in place)', () => {
    const r = plant(-3, 3, 2);
    r.t.forEach((_, k) => {
      near(num(r.signals['d.x'][k]), -2.5, 1e-9, 'x');
      near(num(r.signals['d.y'][k]), -2.5, 1e-9, 'y');
    });
  });
  it.fails('XBV-123: opposite wheel speeds -3/3 rad/s: theta(2) = (r (wR-wL)/L) * 2 = 2.475 rad (factory integrates 0.992 of it)', () => {
    const r = plant(-3, 3, 2);
    near(num(last(r, 'd.theta')), (R_W * 6 / L_W) * 2, 1e-6, 'theta(2)');
  });
  it.fails('XBV-129: DYNAMICS from its default pose (0, 0) with both wheels at 3 rad/s moves: x(1) = r w = 0.099 m (the default pose lies inside the x = 0 wall collision zone, so the plant never moves)', () => {
    const r = sim([constant('wl', 3), constant('wr', 3), { id: 'd', type: 'ROBOT_VACUUM_DYNAMICS' }],
      ['wl.out -> d.omega_L', 'wr.out -> d.omega_R'], ['d.x'], { stop: 1, dt: 0.01 });
    near(num(last(r, 'd.x')), R_W * 3 * 1, 0.002, 'x(1)');
  });
  it('constant (v, w) drives a circle of radius v/w, and it closes after one turn', () => {
    const v = 0.1, w = 0.5, R = v / w;
    const [wl, wr] = once(mk('ROBOT_VACUUM_KINEMATICS'), [v, w]) as number[];
    const r = plant(wl, wr, 14);
    // theta0 = 0 -> centre at (x0, y0 + R).
    r.t.forEach((_, k) => {
      const d = Math.hypot(num(r.signals['d.x'][k]) + 2.5, num(r.signals['d.y'][k]) + 2.5 - R);
      near(d, R, 2e-3, `distance to centre at k=${k}`);
    });
    const th = r.signals['d.theta'].map(num);
    const k = th.findIndex((x) => x >= 2 * Math.PI);
    expect(k, 'theta reaches 2 pi within 14 s').toBeGreaterThan(0);
    near(num(r.signals['d.x'][k]), -2.5, 5e-3, 'x after a full turn');
    near(num(r.signals['d.y'][k]), -2.5, 5e-3, 'y after a full turn');
  });

  // Odometry from encoder counts (block-level; ODOMETRY draws a +-2.5 % slip from Math.random: random = 0.5 -> slip 1).
  const counts = (arc: number) => (arc / R_W / (2 * Math.PI)) * CPR;
  const odo = (type: string, inc: (k: number) => [number, number], n: number) => {
    const steps: number[][] = [];
    let a = 0, b = 0;
    for (let k = 1; k <= n; k++) { const [dl, dr] = inc(k); a += dl; b += dr; steps.push([a, b]); }
    return drive(mk(type), steps, 0.1, 0.1).outs.at(-1) as number[];
  };
  for (const type of ['ROBOT_VACUUM_ODOMETRY_SENSOR', 'ROBOT_VACUUM_ODOMETRY']) {
    it(`${type}: both wheels roll 1 m -> pose (1, 0, 0)`, () => {
      noNoise();
      const [x, y, th] = odo(type, () => [counts(0.1), counts(0.1)], 10);
      near(x, 1, 1e-9, 'x'); near(y, 0, 1e-9, 'y'); near(th, 0, 1e-9, 'theta');
    });
    it(`${type}: wheels roll -/+ (pi/2) L/2 -> turn of 90 degrees in place`, () => {
      noNoise();
      const arc = (Math.PI / 2) * (L_W / 2);
      const [x, y, th] = odo(type, () => [-counts(arc / 90), counts(arc / 90)], 90);
      near(th, Math.PI / 2, 1e-9, 'theta');
      near(x, 0, 1e-9, 'x'); near(y, 0, 1e-9, 'y');
    });
  }
  it('ROBOT_VACUUM_ODOMETRY with its random slip (seeded) stays within +-2.5 % of the true 1 m', () => {
    seed(7);
    const [x] = odo('ROBOT_VACUUM_ODOMETRY', () => [counts(0.1), counts(0.1)], 10);
    near(x, 1, 0.025, 'x');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('2. ROBOT_VACUUM_MOTOR (DC motor)', () => {
  const K = 0.04, Rm = 2.5, J = 0.0075, B = 0.02;
  const motor = (duty: number, vbat: number, stop: number, init: Record<string, unknown> = {}) => {
    seed(3);
    return sim([constant('u', duty), constant('vb', vbat), { id: 'm', type: 'ROBOT_VACUUM_MOTOR' }],
      ['u.out -> m.pwm_duty', 'vb.out -> m.v_bat'], ['m.omega', 'm.current'], { dt: 0.002, stop, init: { m: init } });
  };
  it('steady state for constant duty 1 and V_bat 12: w = K V/(R B + K^2), i = B w/K', () => {
    const r = motor(1, 12, 8);
    const w = (K * 12) / (Rm * B + K * K);
    near(num(last(r, 'm.omega')), w, 1e-4, 'omega');
    near(num(last(r, 'm.current')), (B * w) / K, 1e-4, 'current');
  });
  it('steady state scales with V_bat and duty (duty 0.5, V_bat 8: V = 4)', () => {
    const r = motor(0.5, 8, 8);
    near(num(last(r, 'm.omega')), (K * 4) / (Rm * B + K * K), 1e-4);
  });
  it('stall: with w = 0 and i = V/R the electrical derivative is zero and the torque is K i', () => {
    const b = mk('ROBOT_VACUUM_MOTOR');
    const d = b.evaluateDerivatives!([1, 12], b.params, { theta_wheel: 0, omega: 0, current: 12 / Rm }, 0) as number[];
    near(d[2], 0, 1e-9, 'di/dt');
    near(d[1], (K * (12 / Rm)) / J, 1e-9, 'dw/dt');
    near(d[0], 0, 0, 'dtheta/dt');
  });
  it('zero input: the speed decays monotonically to 0 and never reverses', () => {
    const r = motor(0, 12, 8, { omega: 5, current: 0 });
    const w = r.signals['m.omega'].map(num);
    for (let k = 1; k < w.length; k++) expect(w[k], `k=${k}`).toBeLessThanOrEqual(w[k - 1] + 1e-12);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(-1e-9);
    near(w.at(-1)!, 0, 1e-3, 'final speed');
  });
  it('encoder counts the wheel rotation: counts = theta/(2 pi) cpr (noise std 0)', () => {
    seed(3);
    const b = mk('ROBOT_VACUUM_MOTOR', { encoder_noise_std: 0 });
    const st = { theta_wheel: 3.7, omega: 1, current: 0 };
    const o = b.execute([0, 12], b.params, st, 0).outputs as number[];
    expect(o[2]).toBe(Math.floor((3.7 / (2 * Math.PI)) * 360));
    near(o[0], 1, 0); // omega output is the state, noise-free
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('3. ROBOT_VACUUM_BATTERY', () => {
  const bat = (il: number, ir: number, docked: number, stop: number, dt: number, level: number) =>
    sim([constant('il', il), constant('ir', ir), constant('dk', docked), { id: 'b', type: 'ROBOT_VACUUM_BATTERY' }],
      ['il.out -> b.I_L', 'ir.out -> b.I_R', 'dk.out -> b.is_docked'], ['b.battery_level'],
      { solver: 'euler', dt, stop, init: { b: { battery_level: level } } });
  it('Ah balance over 1 h at 0.5 A + 0.5 A + 0.1 A static (C 2.6 Ah): delta SOC = -1.1/2.6 * 100 %', () => {
    const r = bat(0.5, 0.5, 0, 3600, 10, 100);
    near(num(last(r, 'b.battery_level')), 100 - (1.1 / 2.6) * 100, 1e-6);
  });
  it('current draw is the sum of |I_L|, |I_R| (negative currents discharge too)', () => {
    const r = bat(-0.5, 0.5, 0, 3600, 10, 100);
    near(num(last(r, 'b.battery_level')), 100 - (1.1 / 2.6) * 100, 1e-6);
  });
  it('docked: level rises at charge_rate (5 %/s)', () => {
    const r = bat(0.5, 0.5, 1, 5, 0.5, 50);
    near(num(last(r, 'b.battery_level')), 75, 1e-9);
  });
  it('level is held in [0, 100]: docked at 99 for 5 s, discharging from 0 for 30 s', () => {
    const up = bat(0, 0, 1, 5, 0.5, 99).signals['b.battery_level'].map(num);
    expect(Math.max(...up)).toBeLessThanOrEqual(100);
    const down = bat(0.5, 0.5, 0, 30, 0.5, 0).signals['b.battery_level'].map(num);
    expect(Math.min(...down)).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('4. WHEEL_CONTROL / MOTOR_COMMAND (PI per wheel)', () => {
  it('WHEEL_CONTROL: zero error -> V = Ki * integral, constant, and the integrator does not move', () => {
    const b = mk('ROBOT_VACUUM_WHEEL_CONTROL');
    const st = { int_errL: 0.2, int_errR: -0.1 };
    const o = b.execute([5, 7, 5, 7], b.params, st, 0).outputs as number[];
    near(o[0], 45 * 0.2, 1e-12); near(o[1], 45 * -0.1, 1e-12);
    expect(b.evaluateDerivatives!([5, 7, 5, 7], b.params, st, 0)).toEqual([0, 0]);
  });
  it('WHEEL_CONTROL: V = Kp e + Ki int e, limited to +-V_bat, integrator frozen while saturated in the error direction', () => {
    const b = mk('ROBOT_VACUUM_WHEEL_CONTROL', { V_bat: 6 });
    const o = b.execute([10, -10, 0, 0], b.params, { int_errL: 0, int_errR: 0 }, 0).outputs as number[];
    expect(o).toEqual([6, -6]);
    expect(b.evaluateDerivatives!([10, -10, 0, 0], b.params, { int_errL: 0, int_errR: 0 }, 0)).toEqual([0, 0]);
    const small = b.execute([0.1, 0, 0, 0.1], b.params, { int_errL: 0.02, int_errR: 0 }, 0).outputs as number[];
    near(small[0], 12 * 0.1 + 45 * 0.02, 1e-12); near(small[1], 12 * -0.1, 1e-12);
    expect(b.evaluateDerivatives!([0.1, 0, 0, 0.1], b.params, { int_errL: 0.02, int_errR: 0 }, 0)).toEqual([0.1, -0.1]);
  });
  it('MOTOR_COMMAND: zero error -> V = Ki * integral, unchanged on every step, whatever dt', () => {
    const b = mk('ROBOT_VACUUM_MOTOR_COMMAND');
    const wref = (v: number, w: number) => [(v - (w * L_W) / 2) / R_W, (v + (w * L_W) / 2) / R_W];
    const [wl, wr] = wref(0.1, 0.5);
    const { outs } = drive(b, [[0.1, 0.5, wl, wr], [0.1, 0.5, wl, wr], [0.1, 0.5, wl, wr]], 0.037);
    const first = { int_errL: 0, int_errR: 0 };
    // Integrator starts at 0 -> output 0 with zero error.
    outs.forEach((o) => { near(o[0] as number, 0, 1e-12); near(o[1] as number, 0, 1e-12); });
    const o = b.execute([0.1, 0.5, wl, wr], b.params, { ...first, int_errL: 0.1, int_errR: 0.05, lastTime: 1 }, 1.3).outputs as number[];
    near(o[0], 45 * 0.1, 1e-9); near(o[1], 45 * 0.05, 1e-9);
  });
  it('MOTOR_COMMAND: large +-error -> outputs limited to +-12 V; wheel references follow the inverse kinematics', () => {
    const b = mk('ROBOT_VACUUM_MOTOR_COMMAND');
    const o = b.execute([0.22, 1.6, 0, 0], b.params, { int_errL: 0, int_errR: 0, lastTime: 0 }, 0.1).outputs as number[];
    expect(o[0]).toBeLessThanOrEqual(12); expect(o[1]).toBeLessThanOrEqual(12);
    const n = b.execute([-0.22, -1.6, 0, 0], b.params, { int_errL: 0, int_errR: 0, lastTime: 0 }, 0.1).outputs as number[];
    expect(n[0]).toBeGreaterThanOrEqual(-12); expect(n[1]).toBeGreaterThanOrEqual(-12);
    // v = 0.1, w = 0: both references equal 0.1/r, e = ref for a stopped wheel, V = Kp e + Ki e dt (dt 0.02 on the first step).
    const s = b.execute([0.1, 0, 0, 0], b.params, { int_errL: 0, int_errR: 0, lastTime: 0 }, 0).outputs as number[];
    const e = 0.1 / R_W;
    near(s[0], Math.min(12, 12 * e + 45 * e * 0.02), 1e-9);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('5. Sensors (ENCODER, LIDAR, LIDAR_SENSOR, CLIFF_IR, BUMPER, DUSTBIN, MOTOR_CURRENT)', () => {
  // ENCODER: counts = floor(integral(w) cpr / (2 pi) + noise); noise std 0 -> exact quantised rotation.
  // Factory: dt = (state.lastTime === 0 ? 0.02 : time - lastTime). lastTime is stored as 0 at t = 0, so the first two
  // samples both integrate 0.02 s whatever the step.
  const encRun = (w: number, params: Record<string, unknown>) =>
    sim([constant('w', w), { id: 'e', type: 'ROBOT_VACUUM_ENCODER', params }],
      ['w.out -> e.omega_L', 'w.out -> e.omega_R'], ['e.enc_L', 'e.enc_R'], { solver: 'euler', dt: 0.01, stop: 1 });
  it.fails('XBV-126: ENCODER (noise 0), w = pi rad/s for 1 s (euler 0.01 s): counts = floor(pi/(2 pi) 360) = 180 (+-1)', () => {
    seed(5);
    near(num(last(encRun(Math.PI, { noise_std: 0 }), 'e.enc_L')), 180, 1, 'enc_L(1)');
  });
  it('ENCODER (noise 0): left and right count alike, negative speed counts down symmetrically, zero speed holds the count', () => {
    seed(5);
    const pos = encRun(Math.PI, { noise_std: 0 });
    expect(last(pos, 'e.enc_L')).toBe(last(pos, 'e.enc_R'));
    const neg = encRun(-Math.PI, { noise_std: 0 });
    near(num(last(neg, 'e.enc_L')), -num(last(pos, 'e.enc_L')), 1);
    expect(new Set(encRun(0, { noise_std: 0 }).signals['e.enc_L'].map(num))).toEqual(new Set([0]));
  });
  it('ENCODER with its default noise (std 0.1 count, seeded) stays within 1 count of the noise-free run', () => {
    seed(11);
    const noisy = num(last(encRun(Math.PI, {}), 'e.enc_L'));
    vi.restoreAllMocks(); seed(5);
    near(noisy, num(last(encRun(Math.PI, { noise_std: 0 }), 'e.enc_L')), 1);
  });

  const LIDAR_X = -2; // pose (-2, 0, 0): open floor of the living room (hard-coded room geometry, no environment input is read)
  // Hand-computed distances along the 8 beam directions [0, 45, 90, 135, 180, -135, -90, -45] degrees:
  //  0 -> wall x = 0 at 2.0; 45 -> wall x = 0 (y = 2, doorway ends at 1.3) at 2 sqrt 2; 90 -> sofa edge y = 1.5 at 1.5;
  //  135 -> wall x = -3 at sqrt 2; 180 -> wall x = -3 at 1.0; -135 -> corner (-3,-1) at sqrt 2; -90 -> wall y = -1 at 1.0;
  //  -45 -> wall y = -1 at x = -1 at sqrt 2.
  const expected8 = [2, 2 * Math.SQRT2, 1.5, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];
  it('LIDAR (noise off via random = 0.5): the 8 beams read the hand-computed wall distances, a wall straight ahead at 2 m reads 2 at angle 0', () => {
    noNoise();
    const [ranges, angles] = once(mk('ROBOT_VACUUM_LIDAR'), [LIDAR_X, 0, 0, 0]) as number[][];
    expect(angles[0]).toBe(0);
    expected8.forEach((d, i) => near(ranges[i], d, 1e-9, `beam ${i}`));
  });
  it('LIDAR rotates with the robot heading: theta = pi/2 puts the 2 m wall on beam index 6 (-90 degrees)', () => {
    noNoise();
    const [ranges] = once(mk('ROBOT_VACUUM_LIDAR'), [LIDAR_X, 0, Math.PI / 2, 0]) as number[][];
    near(ranges[6], 2, 1e-9);
  });
  it('LIDAR with noise (seeded): every range is in [0, max_range], and is the true value +-0.02 or the max-range dropout', () => {
    seed(21);
    const b = mk('ROBOT_VACUUM_LIDAR');
    for (let k = 0; k < 300; k++) {
      const [ranges] = b.execute([LIDAR_X, 0, 0, 0], b.params, b.state, k * 0.05).outputs as number[][];
      ranges.forEach((r, i) => {
        expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(4.0);
        expect(Math.abs(r - expected8[i]) <= 0.02 + 1e-9 || r === 4.0, `k=${k} beam ${i} r=${r}`).toBe(true);
      });
    }
  });
  it('LIDAR_SENSOR (pose array [-2,0,0], noise off): 45 beams from -180 deg step 8 deg; beams at +-4 deg read 2/cos 4 deg', () => {
    noNoise();
    const [ranges, pose] = once(mk('ROBOT_VACUUM_LIDAR_SENSOR'), [[LIDAR_X, 0, 0]]) as number[][];
    expect(ranges.length).toBe(45);
    near(ranges[22], 2 / Math.cos((4 * Math.PI) / 180), 1e-9, '-4 deg');
    near(ranges[23], 2 / Math.cos((4 * Math.PI) / 180), 1e-9, '+4 deg');
    near(ranges[0], 1, 1e-9, '-180 deg is the x = -3 wall');
    expect(pose).toEqual([LIDAR_X, 0, 0]);
  });
  it('LIDAR_SENSOR (default noise 0.015, seeded): all ranges in [0, 5.5] and within 0.015 of the noise-free scan', () => {
    noNoise();
    const clean = once(mk('ROBOT_VACUUM_LIDAR_SENSOR'), [[LIDAR_X, 0, 0]])[0] as number[];
    vi.restoreAllMocks(); seed(4);
    const b = mk('ROBOT_VACUUM_LIDAR_SENSOR');
    for (let k = 0; k < 100; k++) {
      const [ranges] = b.execute([[LIDAR_X, 0, 0]] as never, b.params, b.state, k * 0.1).outputs as number[][];
      ranges.forEach((r, i) => { expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(5.5); near(r, clean[i], 0.015 + 1e-9, `beam ${i}`); });
    }
  });
  it('ODOMETRY_SENSOR (deterministic, no noise input): exact sum of the encoder increments', () => {
    const { outs } = drive(mk('ROBOT_VACUUM_ODOMETRY_SENSOR'), [[360, 360], [720, 720]]);
    // 360 counts = one wheel turn = 2 pi r of arc.
    near(outs[1][0] as number, 2 * 2 * Math.PI * R_W, 1e-12);
  });
  it('CLIFF_IR reads the low value on the floor and the high value at the edge (|x| or |y| > 2.8)', () => {
    const b = mk('ROBOT_VACUUM_CLIFF_IR');
    expect(num(once(b, [0, 0])[0])).toBeLessThan(0.2);
    expect(num(once(b, [2.9, 0])[0])).toBeGreaterThan(0.2);
    expect(num(once(b, [[0, 2.9, 0]])[0])).toBeGreaterThan(0.2);
  });
  it('BUMPER_SENSOR reads 1 on a wall / furniture and 0 on open floor (true collision geometry)', () => {
    const b = mk('ROBOT_VACUUM_BUMPER_SENSOR');
    expect(once(b, [0, 0])[0]).toBe(1); // internal wall x = 0
    expect(once(b, [-2, 0])[0]).toBe(0);
    expect(once(b, [1.8, -2.0])[0]).toBe(1); // dining table
    expect(once(b, [-2.95, 0])[0]).toBe(1); // outer wall within 0.15
  });
  it('DUSTBIN_SENSOR on a grid: dust % = cleaned cells / cells * 100', () => {
    const grid = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
    near(num(once(mk('ROBOT_VACUUM_DUSTBIN_SENSOR'), [grid])[0]), 25, 1e-12);
  });
  it('MOTOR_CURRENT: total = |I_L| + |I_R| when connected', () => {
    const b = mk('ROBOT_VACUUM_MOTOR_CURRENT');
    near(num(once(b, [0.3, -0.45])[0]), 0.75, 1e-12);
    near(num(once(b, [0.3, 0])[0]), 0.3, 1e-12);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('6. Estimation (FUSION, LOCALIZATION, SENSOR_FUSION_EKF, SLAM)', () => {
  // Truth: unicycle v = 0.2, w = 0.3 sampled every 0.1 s (midpoint integration, written here).
  const truth = (n: number) => {
    const out: number[][] = []; let x = 0.5, y = -0.5, th = 0.2;
    for (let k = 0; k < n; k++) { out.push([x, y, th]); const dth = 0.3 * 0.1; x += 0.2 * 0.1 * Math.cos(th + dth / 2); y += 0.2 * 0.1 * Math.sin(th + dth / 2); th += dth; }
    return out;
  };
  const N = 200;
  // Straight run for the bias tests (a closed circle would cancel the scale error): v = 0.2 m/s, heading 0.2 rad.
  const line = (n: number) => Array.from({ length: n }, (_, k) => [0.5 + 0.02 * k * Math.cos(0.2), -0.5 + 0.02 * k * Math.sin(0.2), 0.2]);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  it('FUSION: odometry = truth and a perfect gyro -> estimate = truth at every step (no drift), confidence 100', () => {
    const tr = truth(N);
    const { outs } = drive(mk('ROBOT_VACUUM_FUSION'), tr.map(([x, y, th]) => [x, y, th, x, y, th, 0.3]), 0.1, 0.1);
    outs.forEach((o, k) => {
      near(o[0] as number, tr[k][0], 1e-9, `x k=${k}`); near(o[1] as number, tr[k][1], 1e-9, `y k=${k}`);
      near(wrap((o[2] as number) - tr[k][2]), 0, 1e-9, `theta k=${k}`); expect(o[3]).toBe(100);
    });
  });
  it('FUSION: odometry with a 10 % scale bias -> fused error after 200 steps is smaller than the odometry error', () => {
    const tr = line(N);
    let ox = tr[0][0], oy = tr[0][1];
    const ins = tr.map(([x, y, th], k) => {
      if (k > 0) { ox += 1.1 * (x - tr[k - 1][0]); oy += 1.1 * (y - tr[k - 1][1]); }
      return [ox, oy, th, x, y, th, 0];
    });
    const { outs } = drive(mk('ROBOT_VACUUM_FUSION'), ins, 0.1, 0.1);
    const fusedErr = Math.hypot((outs.at(-1)![0] as number) - tr.at(-1)![0], (outs.at(-1)![1] as number) - tr.at(-1)![1]);
    const odomErr = Math.hypot(ox - tr.at(-1)![0], oy - tr.at(-1)![1]);
    expect(fusedErr).toBeLessThan(odomErr);
    expect(odomErr).toBeGreaterThan(0.2);
  });
  it('LOCALIZATION: odometry = truth -> estimate = truth, covariance finite, positive, confidence in [0, 100]', () => {
    const tr = truth(N);
    const { outs } = drive(mk('ROBOT_VACUUM_LOCALIZATION'), tr.map(([x, y, th]) => [x, y, th, Array(8).fill(1), x, y, th]), 0.1, 0.1);
    outs.forEach((o, k) => {
      near(o[0] as number, tr[k][0], 1e-9, `x k=${k}`); near(o[1] as number, tr[k][1], 1e-9, `y k=${k}`);
      near(wrap((o[2] as number) - tr[k][2]), 0, 1e-9, `theta k=${k}`);
      (o[3] as number[]).forEach((c) => { expect(Number.isFinite(c)).toBe(true); expect(c).toBeGreaterThan(0); });
      expect(o[4]).toBeGreaterThanOrEqual(0); expect(o[4]).toBeLessThanOrEqual(100);
    });
  });
  it('LOCALIZATION: odometry with a 10 % scale bias -> fused error after 200 steps is smaller than the odometry error; confidence stays in range', () => {
    const tr = line(N);
    let ox = tr[0][0], oy = tr[0][1];
    const ins = tr.map(([x, y, th], k) => {
      if (k > 0) { ox += 1.1 * (x - tr[k - 1][0]); oy += 1.1 * (y - tr[k - 1][1]); }
      return [ox, oy, th, Array(8).fill(1), x, y, th];
    });
    const { outs } = drive(mk('ROBOT_VACUUM_LOCALIZATION'), ins, 0.1, 0.1);
    const fusedErr = Math.hypot((outs.at(-1)![0] as number) - tr.at(-1)![0], (outs.at(-1)![1] as number) - tr.at(-1)![1]);
    expect(fusedErr).toBeLessThan(Math.hypot(ox - tr.at(-1)![0], oy - tr.at(-1)![1]));
    outs.forEach((o) => { expect(o[4]).toBeGreaterThanOrEqual(0); expect(o[4]).toBeLessThanOrEqual(100); expect(finiteDeep(o[3])).toBe(true); });
  });
  it('SENSOR_FUSION_EKF: odometry = truth -> estimate stays on the truth (x, y exact, theta wrapped)', () => {
    const tr = truth(N);
    const { outs } = drive(mk('ROBOT_VACUUM_SENSOR_FUSION_EKF'), tr.map(([x, y, th]) => [x, y, th, x, y, th]), 0.1, 0.1);
    outs.forEach((o, k) => {
      near(o[0] as number, tr[k][0], 1e-6, `x k=${k}`); near(o[1] as number, tr[k][1], 1e-6, `y k=${k}`);
      near(wrap((o[2] as number) - tr[k][2]), 0, 1e-6, `theta k=${k}`);
    });
  });
  it('SENSOR_FUSION_EKF: odometry with a 10 % scale bias -> fused error smaller than the odometry error, outputs finite', () => {
    const tr = line(N);
    let ox = tr[0][0], oy = tr[0][1];
    const ins = tr.map(([x, y, th], k) => {
      if (k > 0) { ox += 1.1 * (x - tr[k - 1][0]); oy += 1.1 * (y - tr[k - 1][1]); }
      return [x, y, th, ox, oy, th];
    });
    const { outs } = drive(mk('ROBOT_VACUUM_SENSOR_FUSION_EKF'), ins, 0.1, 0.1);
    outs.forEach((o) => expect(finiteDeep(o)).toBe(true));
    const e = Math.hypot((outs.at(-1)![0] as number) - tr.at(-1)![0], (outs.at(-1)![1] as number) - tr.at(-1)![1]);
    expect(e).toBeLessThan(Math.hypot(ox - tr.at(-1)![0], oy - tr.at(-1)![1]));
  });
  it('SLAM (uses the truth inputs as the ICP result, +-0.005 m / 0.0025 rad noise): corrected pose = truth, grid in [-100, 100], accuracy in [0, 100]', () => {
    seed(13);
    const tr = truth(60);
    const ranges = [1, 1, 1, 1, 1, 1, 1, 1];
    const { outs } = drive(mk('ROBOT_VACUUM_SLAM'), tr.map(([x, y, th]) => [x, y, th, ranges, x, y, th]), 0.1, 0.1);
    outs.forEach((o, k) => {
      near(o[1] as number, tr[k][0], 0.005 + 1e-12); near(o[2] as number, tr[k][1], 0.005 + 1e-12);
      near(wrap((o[3] as number) - tr[k][2]), 0, 0.0025 + 1e-12);
      flat(o[0]).forEach((c) => { expect(c).toBeGreaterThanOrEqual(-100); expect(c).toBeLessThanOrEqual(100); });
      const stats = o[4] as number[];
      expect(stats[0]).toBeGreaterThanOrEqual(0); expect(stats[0]).toBeLessThanOrEqual(100);
    });
  });
  it('MAPPING: a hit 1 m ahead of the robot at (-2, 0, 0) marks the cell at (-1, 0) occupied (+25) and the cells before it free (-8), in [-100, 100]', () => {
    const b = mk('ROBOT_VACUUM_MAPPING');
    const ranges = [1, 4, 4, 4, 4, 4, 4, 4];
    const [grid] = once(b, [-2, 0, 0, ranges], 0.1) as number[][][];
    // cell index = floor((v + 3) / 6 * 30)
    expect(grid[15][10]).toBe(25); // y = 0 -> row 15, x = -1 -> col 10
    for (let c = 5; c <= 9; c++) expect(grid[15][c], `free col ${c}`).toBeLessThan(0); // each ray sample lowers a cell by 8
    for (let c = 11; c < 30; c++) expect(grid[15][c], `beyond col ${c}`).toBe(0);
    flat(grid).forEach((c) => { expect(c).toBeGreaterThanOrEqual(-100); expect(c).toBeLessThanOrEqual(100); });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('7. Planning (THETA_STAR/A*, GLOBAL_PLANNER, COVERAGE, BOUSTROPHEDON_SWEEP, WAYPOINT_GEN, NAV, MOTION_CONTROLLER, OBSTACLE_AVOIDANCE)', () => {
  // Grid cell (row, col) of the 30 x 30 map over [-3, 3]^2 has its centre at -3 + (index + 0.5) * 0.2.
  const cc = (row: number, col: number): [number, number] => [-3 + (col + 0.5) * 0.2, -3 + (row + 0.5) * 0.2];
  const emptyGrid = () => Array.from({ length: 30 }, () => Array(30).fill(0));
  // Open floor of the bedroom side: x in [0.3, 2.7] (cols 16..28), y in [-0.7, 0.7] (rows 11..18), no wall or furniture within 0.15 m.
  const START = cc(14, 17), GOAL = cc(14, 27);
  const barrier = (r0: number, r1: number) => { const g = emptyGrid(); for (let r = r0; r <= r1; r++) g[r][22] = 100; return g; };
  const occupied = (g: number[][]) => g.flatMap((row, r) => row.flatMap((v, c) => (v > 50 ? [cc(r, c)] : [])));
  const polylineLength = (p: number[][]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
  const cellOf = (x: number, y: number) => ({ row: Math.floor((y + 3) / 0.2 + 1e-9), col: Math.floor((x + 3) / 0.2 + 1e-9) });
  /** Oracle: Dijkstra over the 8-neighbour grid with costs 1 / 1.414, cells within `safety` of an occupied centre blocked (start and goal exempt). */
  const dijkstra = (g: number[][], s: [number, number], t: [number, number], safety: number): number => {
    const occ = occupied(g);
    const S = cellOf(...s), T = cellOf(...t);
    const blocked = (r: number, c: number) => !((r === S.row && c === S.col) || (r === T.row && c === T.col)) && occ.some(([ox, oy]) => Math.hypot(cc(r, c)[0] - ox, cc(r, c)[1] - oy) < safety);
    const dist = Array.from({ length: 30 }, () => Array(30).fill(Infinity));
    dist[S.row][S.col] = 0;
    const todo = [[S.row, S.col]];
    while (todo.length) {
      todo.sort((a, b) => dist[a[0]][a[1]] - dist[b[0]][b[1]]);
      const [r, c] = todo.shift()!;
      for (const [dr, dc, w] of [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [1, 1, 1.414]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > 29 || nc < 0 || nc > 29 || blocked(nr, nc)) continue;
        if (dist[r][c] + w < dist[nr][nc]) { dist[nr][nc] = dist[r][c] + w; todo.push([nr, nc]); }
      }
    }
    return dist[T.row][T.col] * 0.2;
  };
  const crosses = (g: number[][], a: number[], b: number[]) => {
    for (let i = 0; i <= 40; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / 40, y = a[1] + ((b[1] - a[1]) * i) / 40;
      const { row, col } = cellOf(x, y);
      if (row >= 0 && row < 30 && col >= 0 && col < 30 && g[row][col] > 50) return true;
    }
    return false;
  };
  const plan = (g: number[][], params: Record<string, unknown> = {}) => {
    const b = mk('ROBOT_VACUUM_THETA_STAR', params);
    const [path, next, failed] = b.execute([g, START, GOAL] as never, b.params, b.state, 0).outputs as [number[][], number[], number];
    return { path, next, failed };
  };

  it('THETA_STAR on an empty grid: path runs from the start cell to the goal cell, length = straight distance, failed = 0', () => {
    const { path, failed } = plan(emptyGrid());
    expect(failed).toBe(0);
    expect(path[0]).toEqual(START);
    near(path.at(-1)![0], GOAL[0], 1e-9); near(path.at(-1)![1], GOAL[1], 1e-9);
    near(polylineLength(path), Math.hypot(GOAL[0] - START[0], GOAL[1] - START[1]), 1e-9);
  });
  it('THETA_STAR around a 2-cell barrier at x = 1.5: no leg crosses an occupied cell, length is between the straight distance and the Dijkstra shortest grid path (safety 0.28)', () => {
    const g = barrier(14, 15);
    const { path, failed } = plan(g);
    expect(failed).toBe(0);
    for (let i = 1; i < path.length; i++) expect(crosses(g, path[i - 1], path[i]), `leg ${i}`).toBe(false);
    const L = polylineLength(path);
    const shortest = dijkstra(g, START, GOAL, 0.28);
    expect(Number.isFinite(shortest)).toBe(true);
    expect(L).toBeLessThanOrEqual(shortest + 1e-9);
    expect(L).toBeGreaterThan(Math.hypot(GOAL[0] - START[0], GOAL[1] - START[1]) + 1e-6); // it must detour
  });
  it('THETA_STAR: when the barrier leaves no 0.28 m corridor the safety is relaxed in 0.06 m steps and the path still avoids occupied cells', () => {
    const g = barrier(12, 17);
    const { path, failed } = plan(g);
    expect(failed).toBe(0);
    for (let i = 1; i < path.length; i++) expect(crosses(g, path[i - 1], path[i]), `leg ${i}`).toBe(false);
  });
  it('THETA_STAR with the goal enclosed by occupied cells: documented failure, empty path and failed = 1', () => {
    const g = emptyGrid();
    for (let r = 13; r <= 15; r++) for (let c = 26; c <= 28; c++) if (!(r === 14 && c === 27)) g[r][c] = 100;
    const { path, failed } = plan(g);
    expect(failed).toBe(1);
    expect(path).toEqual([]);
  });
  // The block's own line-of-sight check uses a robot radius of 0.15 m (walls) and its A* keeps cell centres 0.28 m from
  // occupied cell centres. A leg must therefore stay >= 0.15 m from every occupied cell (square of side 0.2).
  it.fails('XBV-124: THETA_STAR legs keep >= 0.15 m (the block robot radius) from every occupied cell square; the shortcut leg passes 0.025 m from the barrier', () => {
    const g = barrier(14, 15);
    const { path } = plan(g);
    const occ = occupied(g);
    let worst = Infinity;
    for (let i = 1; i < path.length; i++) {
      for (let s = 0; s <= 200; s++) {
        const x = path[i - 1][0] + ((path[i][0] - path[i - 1][0]) * s) / 200, y = path[i - 1][1] + ((path[i][1] - path[i - 1][1]) * s) / 200;
        for (const [ox, oy] of occ) worst = Math.min(worst, Math.hypot(Math.max(Math.abs(x - ox) - 0.1, 0), Math.max(Math.abs(y - oy) - 0.1, 0)));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(0.15);
  });

  // GLOBAL_PLANNER: description "Finds collision-free paths using A* and outputs the next local waypoint target".
  const gp = (g: number[][], goal: [number, number]) => mk('ROBOT_VACUUM_GLOBAL_PLANNER').execute([g, START[0], START[1], goal[0], goal[1]] as never, {}, {}, 0).outputs as [number[][], number, number];
  it('GLOBAL_PLANNER on an empty grid: next waypoint is the goal', () => {
    const [, wx, wy] = gp(emptyGrid(), GOAL);
    expect([wx, wy]).toEqual(GOAL);
  });
  it.fails('XBV-125: GLOBAL_PLANNER with a barrier between start and goal: the next waypoint has a clear line from the start (factory outputs the goal itself)', () => {
    const g = barrier(14, 15);
    const [, wx, wy] = gp(g, GOAL);
    expect(crosses(g, START, [wx, wy])).toBe(false);
  });
  it.fails('XBV-134: GLOBAL_PLANNER with the goal enclosed by occupied cells reports no path (empty path or a flag); factory returns [goal]', () => {
    const g = emptyGrid();
    for (let r = 13; r <= 15; r++) for (let c = 26; c <= 28; c++) if (!(r === 14 && c === 27)) g[r][c] = 100;
    const [path] = gp(g, GOAL);
    expect(path.length).toBe(0);
  });

  it('COVERAGE: robot on waypoint 0 (-2.2,-2.2) advances the target to waypoint 1 (-2.2, 2.2); distance travelled = path length; coverage % non-decreasing in [0, 100]', () => {
    const b = mk('ROBOT_VACUUM_COVERAGE');
    const steps: unknown[][] = [];
    for (let k = 0; k <= 44; k++) steps.push([emptyGrid(), -2.2, -2.2 + 0.1 * k]);
    const { outs } = drive(b, steps);
    expect([outs[0][0], outs[0][1]]).toEqual([-2.2, 2.2]);
    let prev = 0;
    outs.forEach((o) => { const s = o[2] as number[]; expect(s[0]).toBeGreaterThanOrEqual(prev); expect(s[0]).toBeLessThanOrEqual(100); prev = s[0]; });
    near((outs.at(-1)![2] as number[])[2], 4.4, 1e-9, 'distance');
    expect(prev).toBeGreaterThan(0);
  });
  it('BOUSTROPHEDON_SWEEP room 0, spacing 0.54: 14 lines (floor(7.2/0.54)+1) = 28 waypoints, alternating direction, inside the room box; done only after the last waypoint is reached', () => {
    const b = mk('ROBOT_VACUUM_BOUSTROPHEDON_SWEEP');
    const o0 = b.execute([0, emptyGrid(), [0, 0, 0]] as never, b.params, b.state, 0).outputs as [number[][], number[], number];
    const wps = o0[0];
    expect(wps.length).toBe(28);
    wps.forEach(([x, y], i) => {
      near(x, -5.6 + 0.54 * Math.floor(i / 2), 1e-9, `x${i}`);
      near(y, (Math.floor(i / 2) % 2 === 0) === (i % 2 === 0) ? -5.6 : 1.6, 1e-9, `y${i}`);
      expect(x).toBeGreaterThanOrEqual(-5.6); expect(x).toBeLessThanOrEqual(1.6);
    });
    expect(o0[2]).toBe(0);
    let state = b.state; let last: unknown[] = o0;
    for (let i = 0; i < wps.length; i++) {
      expect((last[2] as number), `done before waypoint ${i}`).toBe(0);
      const r = b.execute([0, emptyGrid(), [wps[i][0], wps[i][1], 0]] as never, b.params, state, 0.1 * i);
      state = r.nextState ?? state; last = r.outputs as unknown[];
    }
    expect(last[2]).toBe(1);
  });
  it('WAYPOINT_GEN: room 4 maps its boundary first ((-2.5,-2.5) -> (-2.5,0) -> (0,0) -> (0,-2.5)), battery_status 1 overrides with the dock (0,-2.8)', () => {
    const b = mk('ROBOT_VACUUM_WAYPOINT_GEN');
    const corners = [[-2.5, -2.5], [-2.5, 0], [0, 0], [0, -2.5]];
    const steps = corners.map(([x, y]) => [4, 0, x, y]);
    const { outs } = drive(b, steps);
    // Arriving (< 0.3 m) at a corner makes the next corner the active waypoint in the same step.
    expect((outs[0][0] as number[])).toEqual(corners[1]);
    expect((outs[1][0] as number[])).toEqual(corners[2]);
    expect((outs[2][0] as number[])).toEqual(corners[3]);
    const dock = mk('ROBOT_VACUUM_WAYPOINT_GEN');
    expect(drive(dock, [[4, 0, 0, 0], [4, 1, 0, 0]]).outs[1][0]).toEqual([0, -2.8]);
  });

  const far = [4, 4, 4, 4, 4, 4, 4, 4];
  const navStep = (x: number, y: number, th: number, tx: number, ty: number, mode: number, bat = 100, ranges: number[] = far) =>
    once(mk('ROBOT_VACUUM_NAV'), [x, y, th, ranges, tx, ty, mode, bat, 0]) as [number, number, number, number, number];
  it('NAV direct navigation (mode 6): v = min(0.22, 0.4 d), w = 1.6 * heading error', () => {
    let o = navStep(0, 0, 0, 1, 0, 6);
    near(o[0], 0.22, 1e-12); near(o[1], 0, 1e-12); expect(o[2]).toBe(6);
    o = navStep(0, 0, 0, 0, 0.5, 6);
    near(o[0], 0.2, 1e-12); near(o[1], 1.6 * (Math.PI / 2), 1e-12);
    o = navStep(0, 0, 0, -1, 0, 6); // goal behind: error = +-pi, wrapped
    expect(Math.abs(o[1])).toBeLessThanOrEqual(1.6 * Math.PI + 1e-9);
  });
  it('NAV: goal reached (d <= 0.1) in mode 6 -> v = w = 0 and back to Idle (1); low battery (< 20 %) forces return-to-dock (8) towards (0, -2.8); obstacle ahead (< 0.4 m) stops (v = 0) and spins (w = 0.9)', () => {
    const done = navStep(1, 0, 0, 1.05, 0, 6);
    expect(done[0]).toBe(0); expect(done[1]).toBe(0); expect(done[2]).toBe(1);
    const dock = navStep(0, 0, -Math.PI / 2, 5, 5, 6, 15);
    expect(dock[2]).toBe(8);
    near(dock[0], 0.22, 1e-12); near(dock[1], 0, 1e-9);
    const blocked = navStep(0, 0, 0, 1, 0, 6, 100, [0.3, 4, 4, 4, 4, 4, 4, 4]);
    expect(blocked[2]).toBe(7); expect(blocked[0]).toBe(0); near(blocked[1], 0.9, 1e-12);
  });
  it('MOTION_CONTROLLER (pure-pursuit-style go-to-goal) closed loop with unicycle kinematics reaches the goal within its 0.15 m tolerance, respects the v / w limits', () => {
    const b = mk('ROBOT_VACUUM_MOTION_CONTROLLER');
    for (const [x0, y0, th0, gx, gy] of [[0, 0, Math.PI, 1, 1], [-1, 0.5, 0, -1, 2], [0.3, -0.4, 2, 1.5, -0.3]]) {
      let x = x0, y = y0, th = th0;
      for (let k = 0; k < 1200; k++) {
        const [v, w] = b.execute([x, y, th, gx, gy, [0.22, 1.6]] as never, b.params, {}, k * 0.05).outputs as number[];
        expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(0.22 + 1e-12); expect(Math.abs(w)).toBeLessThanOrEqual(1.6 + 1e-12);
        th += w * 0.05; x += v * Math.cos(th) * 0.05; y += v * Math.sin(th) * 0.05;
      }
      expect(Math.hypot(gx - x, gy - y)).toBeLessThanOrEqual(0.15 + 0.01);
    }
  });
  it('MOTION_CONTROLLER: max_v = 0 in the velocity constraints -> no forward motion, spin at max_w; inside the 0.15 m tolerance both commands are 0', () => {
    const b = mk('ROBOT_VACUUM_MOTION_CONTROLLER');
    expect(b.execute([0, 0, 0, 1, 0, [0, 0.9]] as never, b.params, {}, 0).outputs).toEqual([0, 0.9]);
    expect(b.execute([0, 0, 0, 0.1, 0, [0.22, 1.6]] as never, b.params, {}, 0).outputs).toEqual([0, 0]);
  });
  it('OBSTACLE_AVOIDANCE never allows forward speed when an obstacle is closer than its thresholds (front < 0.4 m, +-45 degrees < 0.35 m): 500 random scans (seeded)', () => {
    const rnd = mulberry32(99);
    for (let k = 0; k < 500; k++) {
      const ranges = Array.from({ length: 8 }, () => 0.05 + 2 * rnd());
      const b = mk('ROBOT_VACUUM_OBSTACLE_AVOIDANCE');
      const [, , lim, mode] = b.execute([ranges, 1, 2] as never, b.params, b.state, 0).outputs as [number, number, number[], number];
      const blocked = ranges[0] < 0.4 || ranges[1] < 0.35 || ranges[7] < 0.35;
      if (blocked) { expect(lim[0], `scan ${k}`).toBe(0); expect(mode).toBe(7); }
      else { expect(lim[0]).toBe(0.22); expect(mode).toBe(5); }
    }
  });
  it('OBSTACLE_AVOIDANCE: resumes the previous mode when the obstacle clears (state threaded)', () => {
    const { outs } = drive(mk('ROBOT_VACUUM_OBSTACLE_AVOIDANCE'), [[[0.3, 4, 4, 4, 4, 4, 4, 4], 1, 2], [far, 1, 2]]);
    expect(outs[0][3]).toBe(7); expect(outs[1][3]).toBe(5); expect((outs[1][2] as number[])[0]).toBe(0.22);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('8. Closed loop: Robot Vacuum Digital Twin Lab (XbridgesWorkspace labs, id robot_vacuum_twin), 60 s, seeded', () => {
  // Blocks and wires copied from the lab definition (nodes without the Scope).
  const LAB_BLOCKS: B[] = [
    constant('target_x', 1.5), constant('target_y', 1.5), constant('mode_select', 4),
    { id: 'robot_nav', type: 'ROBOT_VACUUM_NAV', params: {} },
    { id: 'robot_comm', type: 'ROBOT_VACUUM_COMM', params: { latency_ms: 50.0, packet_loss_rate: 0.05, protocol: 'CAN' } },
    { id: 'robot_kinematics', type: 'ROBOT_VACUUM_KINEMATICS', params: { wheel_radius: 0.033, wheel_separation: 0.16 } },
    { id: 'robot_pid', type: 'ROBOT_VACUUM_WHEEL_CONTROL', params: { Kp_wheel: 12.0, Ki_wheel: 45.0, V_bat: 12.0 } },
    { id: 'motor_left', type: 'ROBOT_VACUUM_MOTOR', params: { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 } },
    { id: 'motor_right', type: 'ROBOT_VACUUM_MOTOR', params: { motor_R: 2.5, motor_L: 0.005, motor_K: 0.04, inertia: 0.0075, encoder_cpr: 360 } },
    { id: 'robot_battery', type: 'ROBOT_VACUUM_BATTERY', params: { nominal_voltage: 12.0, capacity_Ah: 2.6, static_draw_A: 0.1, charge_rate: 5.0 } },
    { id: 'robot_dynamics', type: 'ROBOT_VACUUM_DYNAMICS', params: { wheel_radius: 0.033, wheel_separation: 0.16 } },
    { id: 'robot_env', type: 'ROBOT_VACUUM_ENVIRONMENT', params: { lidar_max_range: 4.0, lidar_noise_std: 0.02 } },
    { id: 'robot_odom', type: 'ROBOT_VACUUM_ODOMETRY', params: { wheel_radius: 0.033, wheel_separation: 0.16, encoder_cpr: 360 } },
    { id: 'robot_fusion', type: 'ROBOT_VACUUM_FUSION', params: { filter_gain: 0.06 } },
    { id: 'robot_slam', type: 'ROBOT_VACUUM_SLAM', params: { lidar_max_range: 4.0 } },
  ];
  const LAB_WIRES = [
    'target_x.out -> robot_nav.target_x_in', 'target_y.out -> robot_nav.target_y_in', 'mode_select.out -> robot_nav.mode_select',
      'robot_nav.v_ref -> robot_comm.v_ref_in',
      'robot_nav.w_ref -> robot_comm.w_ref_in',
      'robot_nav.nav_state -> robot_comm.nav_state_in',
      'robot_comm.v_ref -> robot_kinematics.v_ref',
      'robot_comm.w_ref -> robot_kinematics.w_ref',
      'robot_kinematics.omegaL_ref -> robot_pid.omegaL_ref',
      'robot_kinematics.omegaR_ref -> robot_pid.omegaR_ref',
      'robot_pid.V_L -> motor_left.pwm_duty',
      'robot_pid.V_R -> motor_right.pwm_duty',
      'motor_left.omega -> robot_pid.omega_L',
      'motor_right.omega -> robot_pid.omega_R',
      'motor_left.omega -> robot_dynamics.omega_L',
      'motor_right.omega -> robot_dynamics.omega_R',
      'motor_left.current -> robot_battery.I_L',
      'motor_right.current -> robot_battery.I_R',
      'robot_env.is_docked -> robot_battery.is_docked',
      'robot_battery.battery_voltage -> motor_left.v_bat',
      'robot_battery.battery_voltage -> motor_right.v_bat',
      'motor_left.encoder -> robot_comm.enc_L_in',
      'motor_right.encoder -> robot_comm.enc_R_in',
      'motor_left.omega -> robot_comm.omega_L_in',
      'motor_right.omega -> robot_comm.omega_R_in',
      'robot_battery.battery_level -> robot_comm.battery_in',
      'robot_comm.enc_L -> robot_odom.enc_L',
      'robot_comm.enc_R -> robot_odom.enc_R',
      'robot_odom.x_odom -> robot_comm.x_odom_in',
      'robot_odom.y_odom -> robot_comm.y_odom_in',
      'robot_odom.theta_odom -> robot_comm.theta_odom_in',
      'robot_comm.x_odom -> robot_fusion.x_odom',
      'robot_comm.y_odom -> robot_fusion.y_odom',
      'robot_comm.theta_odom -> robot_fusion.theta_odom',
      'robot_dynamics.x -> robot_fusion.x_true',
      'robot_dynamics.y -> robot_fusion.y_true',
      'robot_dynamics.theta -> robot_fusion.theta_true',
      'robot_dynamics.w_chassis -> robot_fusion.yaw_rate_imu',
      'robot_fusion.x_est -> robot_slam.x_est',
      'robot_fusion.y_est -> robot_slam.y_est',
      'robot_fusion.theta_est -> robot_slam.theta_est',
      'robot_env.lidar_ranges -> robot_slam.lidar_ranges',
      'robot_fusion.x_est -> robot_nav.x_est',
      'robot_fusion.y_est -> robot_nav.y_est',
      'robot_fusion.theta_est -> robot_nav.theta_est',
      'robot_env.lidar_ranges -> robot_nav.lidar_ranges',
      'robot_comm.battery -> robot_nav.battery_level',
      'robot_env.is_docked -> robot_nav.is_docked',
      'robot_dynamics.x -> robot_env.x',
      'robot_dynamics.y -> robot_env.y',
      'robot_dynamics.theta -> robot_env.theta',
      'robot_fusion.x_est -> robot_env.x_est',
      'robot_fusion.y_est -> robot_env.y_est',
      'robot_fusion.theta_est -> robot_env.theta_est',
      'robot_comm.nav_state -> robot_env.nav_state',
  ];
  const PROBES = ['robot_dynamics.x', 'robot_dynamics.y', 'robot_dynamics.theta', 'robot_battery.battery_level', 'robot_fusion.x_est', 'robot_fusion.y_est', 'robot_fusion.theta_est', 'robot_nav.nav_state', 'robot_fusion.confidence'];
  // The app's default is rk4 with a 0.02 s step. The motor electrical pole (-R/L = -500 1/s) needs h < 2.78/500 = 5.5 ms
  // for rk4, so the stable run below uses rk4 at 0.005 s. Stateful blocks mutate their state in place (XBV-020), so the
  // euler / discrete solvers would see the same state; rk4 is what the canvas runs.
  const cache = new Map<string, RunResult>();
  const lab = (mode: number, dt: number) => {
    const key = `${mode}/${dt}`;
    if (!cache.has(key)) {
      seed(2024);
      const blocks = LAB_BLOCKS.map((b) => (b.id === 'mode_select' ? constant('mode_select', mode) : b));
      cache.set(key, runModel(buildModel({ blocks, wires: LAB_WIRES }), { solver: 'rk4', dt, stopTime: 60, probes: PROBES }));
      vi.restoreAllMocks();
    }
    return cache.get(key)!;
  };
  const LONG = 180_000;
  it.each([4, 6])('mode %i: 60 s (rk4, 0.005 s) without NaN / Inf, no model error, pose inside the room [-3, 3]^2, battery in [0, 100]', (mode) => {
    const r = lab(mode, 0.005);
    expect(r.diagnostics.filter((d) => d.severity === 'error'), 'errors').toEqual([]);
    expect(r.t.length).toBeGreaterThanOrEqual(12000);
    for (const p of PROBES) r.signals[p].forEach((v, k) => expect(finiteDeep(v), `${p} @${r.t[k]}`).toBe(true));
    r.signals['robot_dynamics.x'].map(num).forEach((x) => { expect(x).toBeGreaterThanOrEqual(-3); expect(x).toBeLessThanOrEqual(3); });
    r.signals['robot_dynamics.y'].map(num).forEach((y) => { expect(y).toBeGreaterThanOrEqual(-3); expect(y).toBeLessThanOrEqual(3); });
    r.signals['robot_battery.battery_level'].map(num).forEach((b) => { expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(100); });
    r.signals['robot_fusion.confidence'].map(num).forEach((c) => { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(100); });
  }, LONG);
  it.fails('XBV-127: the lab at the app default (rk4, 0.02 s) stays finite for 60 s (factory run diverges to Infinity within 3 s: motor pole h*lambda = 10)', () => {
    const r = lab(4, 0.02);
    for (const p of PROBES) r.signals[p].forEach((v) => expect(finiteDeep(v)).toBe(true));
  }, LONG);
  // Direct navigation (mode 6) to (1.5, 1.5). Documented purpose of the lab: "goal navigation".
  it.fails('XBV-128: lab in direct-navigation mode 6 (target (1.5, 1.5)): the robot leaves its start (0, 0) and ends within 0.5 m of the target in 60 s (it stays at (0, 0): the start lies on the x = 0 wall collision zone)', () => {
    const r = lab(6, 0.005);
    const x = r.signals['robot_dynamics.x'].map(num), y = r.signals['robot_dynamics.y'].map(num);
    expect(Math.hypot(x.at(-1)! - 1.5, y.at(-1)! - 1.5)).toBeLessThanOrEqual(0.5);
  }, LONG);
});

describe('8b. ROBOT_VACUUM_DIGITAL_TWIN (single block), 60 s, seeded', () => {
  const twin = (solver: string, dt: number) => {
    seed(77);
    const probes = ['t.x_pos', 't.y_pos', 't.theta', 't.x_est', 't.y_est', 't.theta_est', 't.lidar_ranges', 't.wheel_vels', 't.control_signals', 't.nav_state'];
    const r = sim([constant('tx', 1.5), constant('ty', 1.5), constant('md', 4), { id: 't', type: 'ROBOT_VACUUM_DIGITAL_TWIN' }],
      ['tx.out -> t.target_x', 'ty.out -> t.target_y', 'md.out -> t.mode_select'], probes, { solver, dt, stop: 60 });
    vi.restoreAllMocks();
    return { r, probes };
  };
  it('60 s (rk4 0.005 s): every output finite, pose inside the 12 x 12 m map, lidar ranges in [0, 5.5], nav_state integer', () => {
    const { r, probes } = twin('rk4', 0.005);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.t.length).toBeGreaterThanOrEqual(12000);
    for (const p of probes) r.signals[p].forEach((v, k) => expect(finiteDeep(v), `${p} @${r.t[k]}`).toBe(true));
    for (const p of ['t.x_pos', 't.y_pos']) r.signals[p].forEach((v) => flat(v).forEach((c) => expect(Math.abs(c)).toBeLessThanOrEqual(6)));
    r.signals['t.lidar_ranges'].forEach((v) => flat(v).forEach((d) => { expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThanOrEqual(5.5 + 1e-9); }));
    r.signals['t.nav_state'].forEach((v) => expect(Number.isInteger(num(v))).toBe(true));
  }, 170_000);
  it.fails('XBV-133: DIGITAL_TWIN at the app default (rk4, 0.02 s) stays finite for 60 s (factory run diverges within 2 s: motor pole h*lambda = 10)', () => {
    const { r, probes } = twin('rk4', 0.02);
    for (const p of probes) r.signals[p].forEach((v) => expect(finiteDeep(v)).toBe(true));
  }, 170_000);
});

// ---------------------------------------------------------------------------------------------------------------
describe('9. DEM / CFD (DEM_DRUM, PARTICLE_SYSTEM, HERTZ_CONTACT, BOND_FABRIC, FLUID_COUPLING, CFD_SPH_WATER_SOLVER, DEM_CFD_COSIMULATION_INTERFACE, WASHING_MACHINE_TWIN)', () => {
  const F = (b: Block, ins: unknown[], time = 0) => once(b, ins, time) as number[][];
  // Hertz contact F = K delta^(3/2); K = stiffness_normal is the factory parameter (K = 4/3 E* sqrt(R*) for given E*, R*
  // has no separate parameters in this block: E* and R* are not expressible).
  it('HERTZ_CONTACT: two particles of radius 0.05 at distance 0.09 (delta 0.01), K 500: equal and opposite force K delta^1.5 = 0.5 along the line of centres', () => {
    const [f] = F(mk('DEM_HERTZ_CONTACT'), [[0, 0, 0.09, 0], [0, 0, 0, 0], [0.8, 0, 0, 0, 0, 0], 0.05]);
    near(f[0], -0.5, 1e-12); near(f[2], 0.5, 1e-12); near(f[1], 0, 1e-12); near(f[3], 0, 1e-12);
  });
  it('HERTZ_CONTACT: force follows delta^(3/2): doubling the overlap multiplies the force by 2^1.5; stiffness 1200, delta 0.02 -> 1200 * 0.02^1.5', () => {
    const b = mk('DEM_HERTZ_CONTACT', { stiffness_normal: 1200 });
    const f2 = F(b, [[0, 0, 0.08, 0], [0, 0, 0, 0], [0.8, 0, 0, 0, 0, 0], 0.05])[0];
    near(f2[2], 1200 * Math.pow(0.02, 1.5), 1e-12);
    const f1 = F(b, [[0, 0, 0.09, 0], [0, 0, 0, 0], [0.8, 0, 0, 0, 0, 0], 0.05])[0];
    near(f2[2] / f1[2], Math.pow(2, 1.5), 1e-9);
  });
  it('HERTZ_CONTACT: zero overlap (touching or apart) -> zero force; momentum of a pair is conserved; wall contact pushes inward by K delta^1.5', () => {
    const b = mk('DEM_HERTZ_CONTACT');
    for (const d of [0.1, 0.2, 0.5]) expect(F(b, [[0, 0, d, 0], [0, 0, 0, 0], [0.8, 0, 0, 0, 0, 0], 0.05])[0].every((v) => v === 0)).toBe(true);
    const pair = F(b, [[0.1, 0.1, 0.17, 0.14], [0, 0, 0, 0], [0.8, 0, 0, 0, 0, 0], 0.05])[0];
    near(pair[0] + pair[2], 0, 1e-12); near(pair[1] + pair[3], 0, 1e-12);
    const wall = F(b, [[0.76, 0], [0, 0], [0.8, 0, 0, 0, 0, 0], 0.05])[0]; // |p| = 0.76 > 0.8 - 0.05 by 0.01
    near(wall[0], -500 * Math.pow(0.01, 1.5), 1e-12); near(wall[1], 0, 1e-12);
  });
  it('BOND_FABRIC: stretched bond (distance 0.1, rest 0.08, K 150) pulls the pair together with 150 * 0.02 = 3 N; a fabric at rest length feels no bond force', () => {
    const [f] = F(mk('DEM_BOND_FABRIC'), [[0, 0, 0.1, 0], [0, 0, 0, 0], 0.05]);
    near(f[0], 3, 1e-12); near(f[2], -3, 1e-12);
    const pos: number[] = [];
    for (let c = 0; c < 2; c++) for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) pos.push(-0.12 + col * 0.08, -0.12 + r * 0.08 + (c - 0.5) * 0.15);
    const [rest] = F(mk('DEM_BOND_FABRIC'), [pos, Array(64).fill(0), 0.05]);
    expect(rest.length).toBe(64);
    rest.forEach((v) => near(v, 0, 1e-12));
  });
  it('FLUID_COUPLING: below the waterline (y_w = -0.8 + 0.35 * 1.6 = -0.24) drag = 0.8 (v_fluid - v) with v_fluid = omega x r; above it zero', () => {
    const [f] = F(mk('DEM_FLUID_COUPLING'), [[0.3, -0.5, 0.3, 0.1], [0.1, 0, 0, 0], 0.35, [0.8, 0, 2]]);
    near(f[0], 0.8 * (-2 * -0.5 - 0.1), 1e-12); near(f[1], 0.8 * (2 * 0.3 - 0), 1e-12);
    expect(f[2]).toBe(0); expect(f[3]).toBe(0);
  });
  it('DEM_CFD_COSIMULATION_INTERFACE: drag 0.8 (v_fluid - v_dem) within 0.1 m, equal and opposite on the fluid (momentum conserved), zero beyond', () => {
    const [d, fl] = F(mk('DEM_CFD_COSIMULATION_INTERFACE'), [[0, 0, 1, 1], [1, 0, 0, 0], [0.05, 0, 0.5, 0.5], [0, 2, 0, 0], [0.8, 0, 0, 0, 0, 0]]);
    near(d[0], 0.8 * -1, 1e-12); near(d[1], 0.8 * 2, 1e-12);
    near(d[0] + fl[0], 0, 1e-12); near(d[1] + fl[1], 0, 1e-12);
    expect(d[2]).toBe(0); expect(d[3]).toBe(0); expect(fl[2]).toBe(0);
  });
  it('WASHING_MACHINE_TWIN passes its input through', () => {
    expect(once(mk('DEM_WASHING_MACHINE_TWIN'), [[1, 2, 3]])[0]).toEqual([1, 2, 3]);
  });

  const rig = (rpm: number, stop: number, params: Record<string, Record<string, unknown>> = {}) => {
    seed(31);
    const r = sim([
      constant('rpm', rpm), constant('fill', 0.35),
      { id: 'drum', type: 'DEM_DRUM', params: params.drum ?? { drum_radius: 0.8 } },
      { id: 'ps', type: 'DEM_PARTICLE_SYSTEM', params: { particle_radius: 0.05 } },
      { id: 'hz', type: 'DEM_HERTZ_CONTACT', params: { stiffness_normal: 500 } },
      { id: 'bf', type: 'DEM_BOND_FABRIC', params: { bond_stiffness: 150 } },
      { id: 'fc', type: 'DEM_FLUID_COUPLING', params: { drag_coeff: 0.8 } },
    ], [
      'rpm.out -> drum.rpm', 'drum.drum_state -> hz.drum_state', 'drum.drum_state -> fc.drum_state', 'drum.drum_state -> ps.drum_state',
      'ps.positions -> hz.positions', 'ps.velocities -> hz.velocities', 'ps.positions -> bf.positions', 'ps.velocities -> bf.velocities',
      'ps.positions -> fc.positions', 'ps.velocities -> fc.velocities', 'fill.out -> fc.fill_level',
      'hz.contact_forces -> ps.contact_forces', 'bf.bond_forces -> ps.bond_forces', 'fc.fluid_forces -> ps.fluid_forces',
    ], ['drum.angle', 'drum.omega', 'ps.positions', 'ps.velocities', 'ps.cleanliness'], { solver: 'euler', dt: 0.01, stop, ...params.run });
    vi.restoreAllMocks();
    return r;
  };
  it('DEM_DRUM omega = rpm 2 pi/60 and the drum_state vector is [radius, angle, omega]', () => {
    const o = once(mk('DEM_DRUM', { drum_radius: 0.7 }), [30], 0.01) as [number, number, number[]];
    near(o[1], Math.PI, 1e-12);
    expect(o[2][0]).toBe(0.7); near(o[2][2], Math.PI, 1e-12);
  });
  // Rule: angle(t) = integral rpm 2 pi / 60 dt. The factory takes its step from the 4th execute argument, which the engine
  // passes as the simulation TIME: dt = time when 0 < time < 0.05, else 0.016, whatever the solver step.
  it.fails('XBV-130: DEM_DRUM at 60 rpm for 2 s (euler 0.01 s): angle = 2 pi * 2 = 12.566 rad', () => {
    const r = sim([constant('rpm', 60), { id: 'drum', type: 'DEM_DRUM' }], ['rpm.out -> drum.rpm'], ['drum.angle'], { solver: 'euler', dt: 0.01, stop: 2 });
    near(num(last(r, 'drum.angle')), 4 * Math.PI, 0.1, 'angle(2)');
  });
  it.fails('XBV-131: DEM_PARTICLE_SYSTEM free fall (no forces) for 0.1 s (euler 0.01 s): vertical velocity = -g t = -0.981 m/s (same time-as-step cause)', () => {
    seed(31);
    const r = sim([{ id: 'ps', type: 'DEM_PARTICLE_SYSTEM', params: { particle_radius: 0.05 } }], [], ['ps.velocities'], { solver: 'euler', dt: 0.01, stop: 0.1 });
    const v = flat(last(r, 'ps.velocities')).filter((_, i) => i % 2 === 1);
    v.forEach((vy) => near(vy, -9.81 * 0.1, 0.05));
  });
  it('particle system conserves the particle count (32), all states finite, particles stay inside the drum (|p| <= R = 0.8; the lifter ribs push centres up to 0.0011 m past R - r, not pinned) for 10 s with hertz / bond / fluid coupling', () => {
    const r = rig(55, 10);
    r.signals['ps.positions'].forEach((p, k) => {
      const v = flat(p);
      expect(v.length, `count @${r.t[k]}`).toBe(64);
      expect(finiteDeep(p)).toBe(true);
      for (let i = 0; i < v.length; i += 2) expect(Math.hypot(v[i], v[i + 1])).toBeLessThanOrEqual(0.8);
    });
    r.signals['ps.velocities'].forEach((v) => expect(finiteDeep(v)).toBe(true));
    const c = r.signals['ps.cleanliness'].map(num);
    c.forEach((x, k) => { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100); if (k) expect(x).toBeGreaterThanOrEqual(c[k - 1]); });
  });
  it('with the drum stopped (0 rpm) the cloth settles: kinetic energy at 10 s is below its peak and the mean height drops below the start (gravity cannot be switched off in this block)', () => {
    const r = rig(0, 10);
    const ke = r.signals['ps.velocities'].map((v) => 0.5 * 0.1 * flat(v).reduce((s, x) => s + x * x, 0));
    expect(ke.at(-1)!).toBeLessThan(Math.max(...ke));
    const my = (p: unknown) => flat(p).filter((_, i) => i % 2 === 1).reduce((s, x, _i, a) => s + x / a.length, 0);
    expect(my(r.signals['ps.positions'].at(-1))).toBeLessThan(my(r.signals['ps.positions'][1]));
  });

  const sph = (params: Record<string, unknown>, steps = 600) => {
    seed(8);
    const b = mk('CFD_SPH_WATER_SOLVER', params);
    return drive(b, Array.from({ length: steps }, () => [0.35, [0.8, 0, 3, 0, 0, 0], []]), 0.01, 0.0);
  };
  it('SPH water solver: fluid particle count (hence mass = n m) conserved, 40 particles for 6 s, states finite, inside the drum (|p| <= 0.8), torque / slosh finite', () => {
    const { outs } = sph({ num_fluid_particles: 40 });
    outs.forEach((o, k) => {
      expect((o[0] as number[]).length, `count k=${k}`).toBe(80);
      expect(finiteDeep(o)).toBe(true);
      const p = o[0] as number[];
      for (let i = 0; i < p.length; i += 2) expect(Math.hypot(p[i], p[i + 1])).toBeLessThanOrEqual(0.8);
    });
  });
  // Rule (weakly compressible SPH): pressure p = k (rho - rho0) pushes crowded particles apart, so the stiffness changes the motion.
  it.fails('XBV-132: SPH sph_stiffness / fluid_density / viscosity / smoothing_length change the particle motion (factory never reads them)', () => {
    const a = sph({ num_fluid_particles: 20, sph_stiffness: 25 }).outs.at(-1)![0] as number[];
    const c = sph({ num_fluid_particles: 20, sph_stiffness: 25000, fluid_viscosity: 50, sph_smoothing_length: 0.3 }).outs.at(-1)![0] as number[];
    expect(a.some((v, i) => Math.abs(v - c[i]) > 1e-9)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('10. Smoke: every ROBOT_VACUUM_* / DEM_* / CFD_* / FABRIC_* block, 200 steps, seeded random, default inputs: outputs finite and of stable shape', () => {
  const FAMILY = Object.keys(BLOCK_LIBRARY).filter((t) => /^(ROBOT_VACUUM_|DEM_|CFD_|FABRIC_)/.test(t)).sort();
  const shape = (v: unknown): string =>
    Array.isArray(v) ? `[${v.length}:${v.length ? shape(v[0]) : ''}]` : v === null ? 'null' : typeof v === 'object' ? `{${Object.keys(v as object).sort().join(',')}}` : typeof v;
  it('every block of the family listed in docs/xbridges-verification/inventory.json is in the library and in this smoke run', () => {
    const inv = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/xbridges-verification/inventory.json'), 'utf8')) as { blocks: { type: string }[] };
    const listed = inv.blocks.map((b) => b.type).filter((t) => /^(ROBOT_VACUUM_|DEM_|CFD_|FABRIC_)/.test(t));
    expect(listed.length).toBeGreaterThan(70);
    for (const t of listed) expect(FAMILY, t).toContain(t);
  });
  it.each(FAMILY.filter((t) => t !== 'ROBOT_VACUUM_DIGITAL_TWIN'))('%s', (type) => {
    seed(1234);
    const b = mk(type);
    const ins = b.inputs.map((p) => p.value);
    let state = b.state;
    const sigs: string[] = [];
    for (let k = 0; k < 200; k++) {
      const r = b.execute(JSON.parse(JSON.stringify(ins)) as never, b.params, state, k * 0.05);
      if (r.nextState !== undefined) state = r.nextState;
      const outs = r.outputs as unknown[];
      expect(outs.length, `output count @${k}`).toBe(b.outputs.length);
      outs.forEach((o, i) => expect(finiteDeep(o), `${b.outputs[i].id} @${k}`).toBe(true));
      if (k >= 100) sigs.push(outs.map(shape).join('|'));
    }
    expect(new Set(sigs).size, `shape changes: ${[...new Set(sigs)].join(' ; ')}`).toBe(1);
  });
});
