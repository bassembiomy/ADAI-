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
 * Pins use it.fails with provisional ids XBV-8xx (docs/xbridges-verification/ledger.json).
 */
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
  it.fails('XBV-801: equal wheel speeds 3 rad/s: x(10) = x0 + r*w*10 = -1.51 (factory integrates 0.992 of it)', () => {
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
  it.fails('XBV-802: opposite wheel speeds -3/3 rad/s: theta(2) = (r (wR-wL)/L) * 2 = 2.475 rad (factory integrates 0.992 of it)', () => {
    const r = plant(-3, 3, 2);
    near(num(last(r, 'd.theta')), (R_W * 6 / L_W) * 2, 1e-6, 'theta(2)');
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
  it.fails('XBV-805: ENCODER (noise 0), w = pi rad/s for 1 s (euler 0.01 s): counts = floor(pi/(2 pi) 360) = 180 (+-1)', () => {
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
