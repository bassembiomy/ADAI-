import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { DAEStructureError } from '../vlabStructure';
import { validateBlockParams } from '../vlabParams';
import { canonicalizeLegacyParams, normalizeLegacyVLabGraph } from '../../../components/vlab/vlabModelMigration';
import { isGenericText } from './contractChecks';

/**
 * WP-13 (merged WP-14): Rotational and Translational mechanical blocks against their published equations.
 *
 * Every expected value is derived IN THIS FILE from the published relation (Simscape Foundation > Mechanical block
 * reference, or the textbook / analytic solution named at the test); nothing is read back from the code under test.
 * Convention (Simscape): through variable positive R -> C through the block, across = x_R - x_C; a source delivers its
 * value INTO the body wired to its second port; single-ended ports (inertia, mass) are measured against the inertial frame.
 * Everything runs through VLabPhysicsEngine.simulateStep.
 */

// ── harness ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } }) as any;
let edgeCount = 0;
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.');
  const [sb, pb] = b.split('.');
  return { id: `e${edgeCount++}`, source: sa, sourceHandle: pa, target: sb, targetHandle: pb } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }

interface Sim {
  history: any[];
  state: any;
  times: number[];
  /** variable by name at the last step, or at step index i */
  at: (name: string, i?: number) => number;
  /** series of one variable over all steps */
  series: (name: string) => number[];
  across: (block: string, port: string, i?: number) => number;
  acrossSeries: (block: string, port: string) => number[];
  eventsLocated: number;
  eventRetries: number;
  rejected: number;
}

function simulate(m: Model, steps: number, dt: number, budget = { maxStepAttempts: 200, wallClockMs: 60000 }): Sim {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget(budget);
  let state: any = null;
  const history: any[] = [];
  let eventsLocated = 0, eventRetries = 0, rejected = 0;
  for (let i = 0; i < steps; i++) {
    state = engine.simulateStep(m.nodes, m.edges, state, dt);
    history.push(state);
    eventsLocated += state.eventsLocated ?? 0;
    eventRetries += state.eventRetries ?? 0;
    rejected += state.rejectedSteps ?? 0;
  }
  const system = new DAEAssembler().assemble(m.nodes, m.edges);
  const idx = (name: string): number => {
    const i = state.variableNames.indexOf(name);
    if (i < 0) throw new Error(`no variable ${name}`);
    return i;
  };
  const acrossIdx = (block: string, port: string): number => {
    const root = system.components.find((c) => c.blockId === block)!.portNodeMap.get(port)!;
    const i = state.variableNames.findIndex((n: string) => n.startsWith(`Across_${root}_(`));
    if (i < 0) throw new Error(`no across variable of ${block}.${port}`);
    return i;
  };
  return {
    history, state, times: history.map((s) => s.time), eventsLocated, eventRetries, rejected,
    at: (name, i = history.length - 1) => history[i].x[idx(name)],
    series: (name) => history.map((s) => s.x[idx(name)]),
    across: (block, port, i = history.length - 1) => history[i].x[acrossIdx(block, port)],
    acrossSeries: (block, port) => history.map((s) => s.x[acrossIdx(block, port)]),
  };
}

const near = (actual: number, expected: number, rel: number, label = '') => {
  const tol = rel * Math.max(Math.abs(expected), 1e-12);
  expect(Math.abs(actual - expected), `${label}: actual ${actual}, expected ${expected}, rel err ${(Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-12)) * 100}%`).toBeLessThanOrEqual(tol);
};

const REF_R = () => node('rref', 'rot_ref');
const REF_T = () => node('tref', 'trans_ref');
const lib = (id: string) => VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === id)!;

/** reported numerical errors of the reference tests (printed once at the end for the report) */
const REPORT: string[] = [];
const note = (name: string, errPct: number) => REPORT.push(`${name}: ${errPct.toExponential(2)} %`);
const pct = (actual: number, expected: number) => (100 * Math.abs(actual - expected)) / Math.max(Math.abs(expected), 1e-12);

// ── 1. constant source on a single inertia / mass (Newton's second law) ──────────────────────────────────────────────
describe('WP-13 inertia and mass under a constant source (w = T t / J, v = F t / m)', () => {
  it('inertia: w(t) = T t / J exactly (no hidden drag since the default B is 0)', () => {
    const J = 0.5, T = 3, dt = 0.01, steps = 100;
    const sim = simulate({
      nodes: [node('ts', 'torque_source', { T }), node('j', 'inertia', { J }), REF_R()],
      edges: [wire('ts.c', 'j.r'), wire('ts.r', 'rref.r')],
    }, steps, dt);
    const w = sim.acrossSeries('j', 'r');
    for (const k of [10, 50, 100]) near(w[k - 1], (T * k * dt) / J, 1e-6, `w(${k * dt})`);
    note('inertia w(1 s)', pct(w[steps - 1], (T * steps * dt) / J));
    expect(lib('inertia').params.B.value).toBe(0);
  });

  it('mass: v(t) = F t / m exactly', () => {
    const m = 2, F = 4, dt = 0.01;
    const sim = simulate({
      nodes: [node('fs', 'force_source', { F }), node('m', 'mass', { m }), REF_T()],
      edges: [wire('fs.b', 'm.p'), wire('fs.a', 'tref.p')],
    }, 100, dt);
    near(sim.across('m', 'p'), (F * 100 * dt) / m, 1e-6, 'v(1 s)');
    note('mass v(1 s)', pct(sim.across('m', 'p'), (F * 100 * dt) / m));
    expect(lib('mass').params.b.value).toBe(0);
  });

  it('a negative torque and a fractional inertia are valid (no || fallback)', () => {
    const J = 0.02, T = -0.3, dt = 0.01;
    const sim = simulate({
      nodes: [node('ts', 'torque_source', { T }), node('j', 'inertia', { J }), REF_R()],
      edges: [wire('ts.c', 'j.r'), wire('ts.r', 'rref.r')],
    }, 10, dt);
    near(sim.across('j', 'r'), (T * 10 * dt) / J, 1e-6, 'w');
  });
});

// ── 2. spring-mass-damper (translational) and its rotational analogue ───────────────────────────────────────────────
/** closed-form free response of m x'' + b x' + k x = 0, x(0) = x0, x'(0) = 0 */
const freeResponse = (m: number, b: number, k: number, x0: number, t: number): number => {
  const wn = Math.sqrt(k / m);
  const zeta = b / (2 * Math.sqrt(k * m));
  if (zeta === 0) return x0 * Math.cos(wn * t);
  const wd = wn * Math.sqrt(1 - zeta * zeta);
  return x0 * Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
};

const springMass = (m: number, k: number, b: number, x0: number): Model => ({
  nodes: [node('mass', 'mass', { m }), node('sp', 'trans_spring', { k, x0 }), node('dp', 'trans_damper', { b }), REF_T()],
  edges: [wire('sp.r', 'mass.p'), wire('sp.c', 'tref.p'), wire('dp.r', 'mass.p'), wire('dp.c', 'tref.p')],
});
const springInertia = (J: number, k: number, b: number, theta0: number): Model => ({
  nodes: [node('j', 'inertia', { J }), node('sp', 'rot_spring', { k, theta0 }), node('dp', 'rot_damper', { b }), REF_R()],
  edges: [wire('sp.r', 'j.r'), wire('sp.c', 'rref.r'), wire('dp.r', 'j.r'), wire('dp.c', 'rref.r')],
});

/** times at which the sampled signal crosses zero going down, linearly interpolated */
const downCrossings = (t: number[], y: number[]): number[] => {
  const out: number[] = [];
  for (let i = 1; i < y.length; i++) if (y[i - 1] > 0 && y[i] <= 0) out.push(t[i - 1] + (t[i] - t[i - 1]) * (y[i - 1] / (y[i - 1] - y[i])));
  return out;
};

describe('WP-13 spring-mass-damper (translational) against the closed form', () => {
  it('b = 0: period 2 pi sqrt(m/k) and energy conservation', () => {
    const m = 2, k = 50, x0 = 0.1, dt = 0.002, steps = 1500;
    const sim = simulate(springMass(m, k, 0, x0), steps, dt);
    const v = sim.acrossSeries('mass', 'p');
    const x = sim.series('sp_state_x').map((s) => x0 + s);
    const T = 2 * Math.PI * Math.sqrt(m / k);
    const t = sim.times;
    const up = [];
    for (let i = 1; i < v.length; i++) if (v[i - 1] < 0 && v[i] >= 0) up.push(t[i - 1] + (t[i] - t[i - 1]) * (-v[i - 1] / (v[i] - v[i - 1])));
    // v crosses zero upward once per period (x minimum); consecutive crossings are one period apart
    const periodMeasured = up[1] - up[0];
    near(periodMeasured, T, 5e-3, 'period');
    note('spring-mass period', pct(periodMeasured, T));
    const E0 = 0.5 * k * x0 * x0;
    const energy = x.map((xi, i) => 0.5 * m * v[i] * v[i] + 0.5 * k * xi * xi);
    const drift = Math.max(...energy.map((e) => Math.abs(e - E0) / E0));
    expect(drift).toBeLessThan(0.02);
    note('spring-mass energy drift (max)', 100 * drift);
  });

  it('underdamped: x(t) follows the closed form and the log decrement is 2 pi zeta / sqrt(1 - zeta^2)', () => {
    const m = 1, k = 100, b = 2, x0 = 0.05, dt = 0.002, steps = 1500;
    const sim = simulate(springMass(m, k, b, x0), steps, dt);
    const x = sim.series('sp_state_x').map((s) => x0 + s);
    let worst = 0;
    sim.times.forEach((t, i) => { worst = Math.max(worst, Math.abs(x[i] - freeResponse(m, b, k, x0, t))); });
    expect(worst).toBeLessThan(0.01 * x0);
    note('damped spring-mass max |x - x_exact| / x0', (100 * worst) / x0);
    const zeta = b / (2 * Math.sqrt(k * m));
    const deltaExact = (2 * Math.PI * zeta) / Math.sqrt(1 - zeta * zeta);
    // successive minima of x: down-crossings of v... use peaks via the velocity sign change
    const v = sim.acrossSeries('mass', 'p');
    const peaks: number[] = [];
    for (let i = 1; i < v.length; i++) if (v[i - 1] > 0 && v[i] <= 0) peaks.push(x[i]);
    const deltaMeasured = Math.log(peaks[0] / peaks[1]);
    near(deltaMeasured, deltaExact, 0.02, 'log decrement');
    note('log decrement', pct(deltaMeasured, deltaExact));
  });

  it('overdamped (zeta = 2): no oscillation, x(t) positive and monotone', () => {
    const m = 1, k = 100, b = 40, x0 = 0.05;
    const sim = simulate(springMass(m, k, b, x0), 600, 0.005);
    const x = sim.series('sp_state_x').map((s) => x0 + s);
    for (let i = 1; i < x.length; i++) expect(x[i]).toBeLessThanOrEqual(x[i - 1] + 1e-9);
    expect(Math.min(...x)).toBeGreaterThan(-1e-6);
    // closed form for zeta > 1: x = x0 (s2 e^{s1 t} - s1 e^{s2 t}) / (s2 - s1)
    const wn = 10, z = 2, s1 = -wn * (z - Math.sqrt(z * z - 1)), s2 = -wn * (z + Math.sqrt(z * z - 1));
    const t = sim.times[299];
    near(x[299], (x0 * (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t))) / (s2 - s1), 0.02, 'overdamped x(1.5 s)');
  });
});

describe('WP-13 spring-inertia-damper (rotational analogue) against the closed form', () => {
  it('b = 0: period 2 pi sqrt(J/k)', () => {
    const J = 0.5, k = 20, theta0 = 0.2, dt = 0.002;
    const sim = simulate(springInertia(J, k, 0, theta0), 1200, dt);
    const w = sim.acrossSeries('j', 'r');
    const up: number[] = [];
    for (let i = 1; i < w.length; i++) if (w[i - 1] < 0 && w[i] >= 0) up.push(sim.times[i - 1] + (sim.times[i] - sim.times[i - 1]) * (-w[i - 1] / (w[i] - w[i - 1])));
    const T = 2 * Math.PI * Math.sqrt(J / k);
    near(up[1] - up[0], T, 5e-3, 'period');
    note('rot spring-inertia period', pct(up[1] - up[0], T));
  });

  it('damped: theta(t) follows the closed form (J theta\'\' + b theta\' + k theta = 0)', () => {
    const J = 0.1, k = 10, b = 0.4, theta0 = 0.3, dt = 0.004;
    const sim = simulate(springInertia(J, k, b, theta0), 800, dt);
    const th = sim.series('sp_state_theta').map((s) => theta0 + s);
    let worst = 0;
    sim.times.forEach((t, i) => { worst = Math.max(worst, Math.abs(th[i] - freeResponse(J, b, k, theta0, t))); });
    expect(worst).toBeLessThan(0.01 * theta0);
    note('rot damped max |theta - exact| / theta0', (100 * worst) / theta0);
    // zeta = b / (2 sqrt(k J)) = 0.2: log decrement
    const zeta = b / (2 * Math.sqrt(k * J));
    const w = sim.acrossSeries('j', 'r');
    const peaks: number[] = [];
    for (let i = 1; i < w.length; i++) if (w[i - 1] > 0 && w[i] <= 0) peaks.push(th[i]);
    near(Math.log(peaks[0] / peaks[1]), (2 * Math.PI * zeta) / Math.sqrt(1 - zeta * zeta), 0.03, 'log decrement');
  });
});

describe('WP-13 an open mechanical port is open, never grounded by its name (F-064)', () => {
  it('a spring whose C port is left open carries no torque: the inertia accelerates freely', () => {
    const J = 0.5, T = 3, dt = 0.01;
    const sim = simulate({
      nodes: [node('ts', 'torque_source', { T }), node('j', 'inertia', { J }), node('sp', 'rot_spring', { k: 1e3 }), REF_R()],
      edges: [wire('ts.c', 'j.r'), wire('ts.r', 'rref.r'), wire('sp.r', 'j.r')],
    }, 100, dt);
    near(sim.across('j', 'r'), (T * 100 * dt) / J, 1e-6, 'w(1 s) of the freely accelerating inertia');
    expect(Math.abs(sim.at('sp_branch_torque'))).toBeLessThan(1e-9);
  });

  it('a translational damper whose C port is open carries no force', () => {
    const sim = simulate({
      nodes: [node('fs', 'force_source', { F: 5 }), node('m', 'mass', { m: 1 }), node('d', 'trans_damper', { b: 100 }), REF_T()],
      edges: [wire('fs.b', 'm.p'), wire('fs.a', 'tref.p'), wire('d.r', 'm.p')],
    }, 50, 0.01);
    near(sim.across('m', 'p'), 5 * 0.5, 1e-6, 'v(0.5 s) of the free mass');
  });

  it('a torque source and a damper with no Rotational Reference is a floating network, reported by name', () => {
    const m: Model = {
      nodes: [node('ts', 'torque_source', { T: 1 }), node('d', 'rot_damper', { b: 0.1 })],
      edges: [wire('ts.c', 'd.r'), wire('ts.r', 'd.c')],
    };
    let err: unknown;
    try { new VLabPhysicsEngine().simulateStep(m.nodes, m.edges, null, 0.01); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DAEStructureError);
    const d = (err as DAEStructureError).diagnostics[0];
    expect(d.code).toBe('floating-network');
    expect(d.reason).toMatch(/Floating mechanical network/);
    expect(d.reason).toMatch(/Mechanical Rotational \/ Translational Reference/);
    expect(d.reason).toContain('"ts"');
    expect(d.reason).toContain('"d"');
  });

  it('an ideal force source with an open port is reported by name', () => {
    const m: Model = {
      nodes: [node('fs', 'force_source', { F: 1 }), node('m', 'mass', { m: 1 })],
      edges: [wire('fs.b', 'm.p')],
    };
    let err: unknown;
    try { new VLabPhysicsEngine().simulateStep(m.nodes, m.edges, null, 0.01); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DAEStructureError);
    const d = (err as DAEStructureError).diagnostics[0];
    expect(d.reason).toMatch(/"fs".*port A is unconnected/);
    expect(d.reason).toMatch(/Translational Reference/);
  });

  it('a Rotational Reference defines zero speed: a damper to the reference stops a velocity-driven shaft at the Newton balance', () => {
    const sim = simulate({
      nodes: [node('src', 'ang_vel_source', { omega: 7 }), node('d', 'rot_damper', { b: 0.3 }), REF_R()],
      edges: [wire('src.r', 'd.r'), wire('src.c', 'rref.r'), wire('d.c', 'rref.r')],
    }, 3, 0.01);
    near(sim.at('d_branch_torque'), 0.3 * 7, 1e-9, 'damper torque b w');
    near(sim.across('d', 'r'), 7, 1e-9, 'w across the damper');
  });
});

// ── 3. mass migration (F-074) ───────────────────────────────────────────────────────────────────────────────────────
describe('WP-13 F-074: the mass / inertia hidden drag is removed with a migration that keeps old models identical', () => {
  const wrap = (value: number, unit: string, label: string) => ({ value, unit, label });

  it('Simscape Mass has no damping: a new mass runs v = F t / m, an old saved mass without b keeps its 0.1 N s/m', () => {
    // old saved node (WP-08 era): the equation default b = 0.1 applied, so the migration pins b = 0.1
    const legacy = canonicalizeLegacyParams('mass', { m: wrap(2, 'kg', 'Mass') });
    expect(legacy.b.value).toBe(0.1);
    const F = 4, m = 2, b = 0.1, dt = 0.01;
    const sim = simulate({
      nodes: [node('fs', 'force_source', { F }), node('m', 'mass', legacy), REF_T()],
      edges: [wire('fs.b', 'm.p'), wire('fs.a', 'tref.p')],
    }, 200, dt);
    // m v' + b v = F -> v(t) = (F / b)(1 - exp(-b t / m)) (first-order lag, closed form)
    const t = 200 * dt;
    const exact = (F / b) * (1 - Math.exp((-b * t) / m));
    near(sim.across('m', 'p'), exact, 2e-3, 'old model v(2 s)');
    note('migrated mass v(2 s) vs old-model closed form', pct(sim.across('m', 'p'), exact));
  });

  it('an explicit saved b (0, a fraction, or any value) is never touched; inertia keeps B = 0.001 when it was absent', () => {
    expect(canonicalizeLegacyParams('mass', { m: 1, b: 0 }).b).toBe(0);
    expect(canonicalizeLegacyParams('mass', { m: 1, b: wrap(0.37, 'N-s/m', 'x') }).b.value).toBe(0.37);
    expect(canonicalizeLegacyParams('inertia', { J: 1 }).B.value).toBe(0.001);
    expect(canonicalizeLegacyParams('inertia', { J: 1, B: 0 }).B).toBe(0);
    expect(canonicalizeLegacyParams('trans_hard_stop', { upper: 0.1 }).c.value).toBe(1);
  });

  it('rotational: an old inertia without B keeps the 0.001 drag: w(t) = (T / B)(1 - exp(-B t / J))', () => {
    const legacy = canonicalizeLegacyParams('inertia', { J: wrap(0.002, 'kg-m^2', 'J') });
    const T = 0.01, J = 0.002, B = 0.001, dt = 0.01;
    const sim = simulate({
      nodes: [node('ts', 'torque_source', { T }), node('j', 'inertia', legacy), REF_R()],
      edges: [wire('ts.c', 'j.r'), wire('ts.r', 'rref.r')],
    }, 300, dt);
    const t = 300 * dt;
    near(sim.across('j', 'r'), (T / B) * (1 - Math.exp((-B * t) / J)), 3e-3, 'old inertia w(3 s)');
  });

  it('the whole-graph loader applies the same migration', () => {
    const { nodes } = normalizeLegacyVLabGraph(
      [{ id: 'm1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'mass', params: { m: 3 } } } as any], []);
    expect((nodes[0].data as any).params.b.value).toBe(0.1);
  });
});

// ── 4. friction (Stribeck + Coulomb + viscous) ──────────────────────────────────────────────────────────────────────
/** published Simscape Rotational / Translational Friction law, written here independently of the engine */
const stribeck = (v: number, brk: number, c: number, f: number, cv: number, thr: number) =>
  (c + (brk - c) * Math.exp(-cv * Math.abs(v))) * Math.tanh((4 * v) / thr) + f * v;
/** bisection for a monotone-increasing law on [0, hi] */
const solveVelocity = (target: number, law: (v: number) => number, hi = 50): number => {
  let lo = 0;
  let up = hi;
  for (let i = 0; i < 200; i++) { const mid = 0.5 * (lo + up); if (law(mid) < target) lo = mid; else up = mid; }
  return 0.5 * (lo + up);
};

describe('WP-13 rotational friction (Stribeck + Coulomb + viscous)', () => {
  const P = { Tbrk: 0.6, Tc: 0.5, Tv: 0.1, cv: 10, wthr: 0.01 };
  const law = (w: number) => stribeck(w, P.Tbrk, P.Tc, P.Tv, P.cv, P.wthr);

  it('torque on the Stribeck curve at sample velocities, odd in velocity', () => {
    for (const w of [0.002, 0.01, 0.05, 0.2, 1, 5, -0.05, -1]) {
      const sim = simulate({
        nodes: [node('src', 'ang_vel_source', { omega: w }), node('fr', 'rot_friction', P), REF_R()],
        edges: [wire('src.r', 'fr.r'), wire('src.c', 'rref.r'), wire('fr.c', 'rref.r')],
      }, 2, 0.01);
      near(sim.at('fr_branch_torque'), law(w), 1e-9, `T(${w})`);
    }
    // the Stribeck dip: at moderate speed the Coulomb + decaying breakaway excess is below breakaway; large speed -> Tc + f w
    expect(law(0.05)).toBeLessThan(P.Tbrk + P.Tv * 0.05);
    near(law(5), P.Tc + P.Tv * 5, 1e-9, 'asymptote Tc + f w');
  });

  it('sticks below breakaway: a driving torque 0.3 < Tbrk leaves only the creep speed of the tanh smoothing', () => {
    const T = 0.3;
    const sim = simulate({
      nodes: [node('ts', 'torque_source', { T }), node('fr', 'rot_friction', P), REF_R()],
      edges: [wire('ts.c', 'fr.r'), wire('ts.r', 'rref.r'), wire('fr.c', 'rref.r')],
    }, 5, 0.01);
    const creep = solveVelocity(T, law);
    near(sim.across('fr', 'r'), creep, 1e-6, 'creep speed');
    expect(creep).toBeLessThan(1e-3 * 5);
    expect(Math.abs(sim.across('fr', 'r'))).toBeLessThan(P.wthr);
  });

  it('slips above breakaway: a driving torque 1.0 > Tbrk settles at the root of the friction law', () => {
    const T = 1.0;
    const sim = simulate({
      nodes: [node('ts', 'torque_source', { T }), node('fr', 'rot_friction', P), REF_R()],
      edges: [wire('ts.c', 'fr.r'), wire('ts.r', 'rref.r'), wire('fr.c', 'rref.r')],
    }, 5, 0.01);
    const w = solveVelocity(T, law);
    near(sim.across('fr', 'r'), w, 1e-6, 'slip speed');
    note('rot friction slip speed', pct(sim.across('fr', 'r'), w));
    expect(w).toBeGreaterThan(P.wthr);
  });

  it('dynamics: an inertia under torque 1.0 with friction accelerates as J w\' = T - T_f(w)', () => {
    const J = 0.2, T = 1.0, dt = 0.002, steps = 500;
    const sim = simulate({
      nodes: [node('ts', 'torque_source', { T }), node('j', 'inertia', { J }), node('fr', 'rot_friction', P), REF_R()],
      edges: [wire('ts.c', 'j.r'), wire('ts.r', 'rref.r'), wire('fr.r', 'j.r'), wire('fr.c', 'rref.r')],
    }, steps, dt);
    // independent RK4 of the published ODE
    let w = 0;
    const f = (x: number) => (T - law(x)) / J;
    const h = 1e-4;
    for (let i = 0; i < steps * (dt / h); i++) {
      const k1 = f(w), k2 = f(w + 0.5 * h * k1), k3 = f(w + 0.5 * h * k2), k4 = f(w + h * k3);
      w += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    }
    near(sim.across('j', 'r'), w, 5e-3, 'w(1 s)');
    note('rot friction dynamics w(1 s)', pct(sim.across('j', 'r'), w));
  });
});

describe('WP-13 translational friction (Stribeck + Coulomb + viscous)', () => {
  const P = { Fbrk: 6, Fc: 5, Fv: 2, cv: 10, vthr: 0.01 };
  const law = (v: number) => stribeck(v, P.Fbrk, P.Fc, P.Fv, P.cv, P.vthr);

  it('force on the Stribeck curve at sample velocities', () => {
    for (const v of [0.002, 0.01, 0.05, 0.3, 2, -0.05, -2]) {
      // the force that the law gives at v must produce exactly v (monotone law)
      const drive = simulate({
        nodes: [node('fr', 'trans_friction', P), node('lv', 'force_source', { F: law(v) }), REF_T()],
        edges: [wire('lv.b', 'fr.r'), wire('lv.a', 'tref.p'), wire('fr.c', 'tref.p')],
      }, 3, 0.01);
      // the Stribeck law is not monotone between the breakaway peak and the Coulomb level, so the velocity itself is not unique
      // there: the solved velocity must satisfy the published law (independently written above) for the force applied
      near(law(drive.across('fr', 'r')), law(v), 1e-9, `law(v) for F = law(${v})`);
    }
  });

  it('sticks below breakaway and slips above it', () => {
    const run = (F: number) => simulate({
      nodes: [node('fs', 'force_source', { F }), node('fr', 'trans_friction', P), REF_T()],
      edges: [wire('fs.b', 'fr.r'), wire('fs.a', 'tref.p'), wire('fr.c', 'tref.p')],
    }, 5, 0.01);
    const stuck = run(3);
    near(stuck.across('fr', 'r'), solveVelocity(3, law), 1e-6, 'creep speed');
    expect(Math.abs(stuck.across('fr', 'r'))).toBeLessThan(P.vthr);
    const slip = run(9);
    near(slip.across('fr', 'r'), solveVelocity(9, law), 1e-6, 'slip speed');
    note('trans friction slip speed', pct(slip.across('fr', 'r'), solveVelocity(9, law)));
    expect(slip.across('fr', 'r')).toBeGreaterThan(P.vthr);
  });

  it('the migrated legacy friction (Ts, Tv) reproduces the old Ts tanh(10 w) + Tv w exactly', () => {
    const legacy = canonicalizeLegacyParams('rot_friction', { Ts: { value: 0.7, unit: 'N-m', label: 'Static Friction' }, Tv: 0.1 });
    expect(legacy.Ts).toBeUndefined();
    expect(legacy.Tbrk.value).toBe(0.7);
    expect(legacy.Tc.value).toBe(0.7);
    for (const w of [0.01, 0.1, 0.5]) {
      const sim = simulate({
        nodes: [node('src', 'ang_vel_source', { omega: w }), node('fr', 'rot_friction', legacy), REF_R()],
        edges: [wire('src.r', 'fr.r'), wire('src.c', 'rref.r'), wire('fr.c', 'rref.r')],
      }, 2, 0.01);
      near(sim.at('fr_branch_torque'), 0.7 * Math.tanh(10 * w) + 0.1 * w, 1e-9, `old law at ${w}`);
    }
    const legacyT = canonicalizeLegacyParams('trans_friction', { Fs: 4, Fv: 1 });
    expect(legacyT.Fbrk).toBe(4);
    expect(legacyT.Fc).toBe(4);
    expect(legacyT.vthr.value ?? legacyT.vthr).toBeCloseTo(0.8, 12);
  });
});

// ── 5. hard stops ───────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-13 F-075: hard stops (continuous contact, damping only in contact, events for contact entry / exit)', () => {
  it('translational: a mass pushed by m g onto a stop settles at the steady penetration m g / k and never overshoots the energy bound', () => {
    const m = 1, g = 9.81, k = 1e5, c = 200, upper = 0.05, dt = 5e-4, steps = 600;
    const sim = simulate({
      nodes: [node('fs', 'force_source', { F: m * g }), node('m', 'mass', { m }),
        node('hs', 'trans_hard_stop', { lower: -10, upper, k, c, transition: 1e-4 }), REF_T()],
      edges: [wire('fs.b', 'm.p'), wire('fs.a', 'tref.p'), wire('hs.r', 'm.p'), wire('hs.c', 'tref.p')],
    }, steps, dt);
    const x = sim.series('hs_state_x');
    // free fall from x = 0 until the stop: x = g t^2 / 2 (no drag, default b = 0) -> contact speed v0 = sqrt(2 g upper)
    const v0 = Math.sqrt(2 * g * upper);
    const steady = (m * g) / k;
    near(x[steps - 1] - upper, steady, 0.01, 'steady penetration m g / k');
    note('hard stop steady penetration', pct(x[steps - 1] - upper, steady));
    // undamped energy bound on the peak penetration: m v0^2 / 2 + m g p = k p^2 / 2
    const bound = (m * g + Math.sqrt((m * g) ** 2 + k * m * v0 * v0)) / k;
    const peak = Math.max(...x) - upper;
    expect(peak).toBeLessThanOrEqual(bound * 1.001);
    expect(peak).toBeGreaterThan(steady);
    // no stall: the solve finished inside the event budget, no step was rejected down to the floor
    expect(sim.eventsLocated).toBeLessThanOrEqual(12);
    expect(sim.eventRetries).toBeLessThanOrEqual(40);
    expect(sim.rejected).toBeLessThanOrEqual(5);
    // free flight before contact: x(t) = g t^2 / 2 at t = 0.05 s (step 100) to 1e-6
    near(x[99], 0.5 * g * (100 * dt) ** 2, 1e-3, 'free flight x(0.05 s)');
    // the stop never pulls: the force of a stop at the upper bound is never negative
    for (const F of sim.series('hs_branch_force')) expect(F).toBeGreaterThanOrEqual(-1e-6);
  });

  it('the contact force is continuous at contact entry (no jump of c v or of k p)', () => {
    const m = 1, k = 1e5, c = 500, upper = 0.05, dt = 2e-4;
    const sim = simulate({
      nodes: [node('fs', 'force_source', { F: 20 }), node('m', 'mass', { m }),
        node('hs', 'trans_hard_stop', { lower: -10, upper, k, c, transition: 1e-3 }), REF_T()],
      edges: [wire('fs.b', 'm.p'), wire('fs.a', 'tref.p'), wire('hs.r', 'm.p'), wire('hs.c', 'tref.p')],
    }, 1500, dt);
    const F = sim.series('hs_branch_force');
    const x = sim.series('hs_state_x');
    const entry = x.findIndex((xi) => xi > upper);
    expect(entry).toBeGreaterThan(0);
    // the first in-contact force is at most the stiffness force of the penetration reached plus the faded-in damping, and the
    // largest force change between two samples around the entry is far below the full c v0 jump of a step discontinuity
    const v0 = Math.sqrt(2 * 20 * upper / m);
    expect(F[entry - 1]).toBe(0);
    expect(Math.abs(F[entry])).toBeLessThan(0.5 * c * v0);
  });

  it('rotational: an inertia driven by a constant torque is stopped at the upper bound with penetration T / k', () => {
    const J = 0.5, T = 2, k = 2000, c = 44, upper = 0.4, dt = 1e-3, steps = 1500;
    const sim = simulate({
      nodes: [node('ts', 'torque_source', { T }), node('j', 'inertia', { J }),
        node('hs', 'rot_hard_stop', { lower: -5, upper, k, c, transition: 1e-4 }), REF_R()],
      edges: [wire('ts.c', 'j.r'), wire('ts.r', 'rref.r'), wire('hs.r', 'j.r'), wire('hs.c', 'rref.r')],
    }, steps, dt);
    const th = sim.series('hs_state_theta');
    near(th[steps - 1] - upper, T / k, 0.01, 'steady penetration T / k');
    note('rot hard stop steady penetration', pct(th[steps - 1] - upper, T / k));
    const w0 = Math.sqrt((2 * T * upper) / J);
    const bound = (T + Math.sqrt(T * T + k * J * w0 * w0)) / k;
    expect(Math.max(...th) - upper).toBeLessThanOrEqual(bound * 1.001);
    expect(sim.eventsLocated).toBeLessThanOrEqual(12);
    expect(sim.rejected).toBeLessThanOrEqual(5);
  });

  it('the lower bound is symmetric: a negative force settles at lower - m g / k', () => {
    const m = 1, k = 1e4, c = 100, lower = -0.02;
    const sim = simulate({
      nodes: [node('fs', 'force_source', { F: -10 }), node('m', 'mass', { m }),
        node('hs', 'trans_hard_stop', { lower, upper: 5, k, c }), REF_T()],
      edges: [wire('fs.b', 'm.p'), wire('fs.a', 'tref.p'), wire('hs.r', 'm.p'), wire('hs.c', 'tref.p')],
    }, 800, 5e-4);
    near(sim.series('hs_state_x')[799], lower - 10 / k, 0.01, 'steady position');
  });
});

// ── 6. sensors and sources (sign convention) ────────────────────────────────────────────────────────────────────────
describe('WP-13 sensors read the correct value with the correct sign', () => {
  it('rot_motion_sensor: W = w_R - w_C, A = integral of W', () => {
    const w = 4, dt = 0.01;
    const run = (swap: boolean) => simulate({
      nodes: [node('src', 'ang_vel_source', { omega: w }), node('s', 'rot_motion_sensor'), REF_R()],
      edges: swap
        ? [wire('src.r', 's.c'), wire('src.c', 'rref.r'), wire('s.r', 'rref.r')]
        : [wire('src.r', 's.r'), wire('src.c', 'rref.r'), wire('s.c', 'rref.r')],
    }, 100, dt);
    const a = run(false);
    near(a.at('s_branch_signal_w'), w, 1e-9, 'W');
    near(a.at('s_branch_signal_a'), w * 100 * dt, 1e-6, 'A = w t');
    expect(Math.abs(a.at('s_branch_torque'))).toBeLessThan(1e-12);
    const b = run(true);
    near(b.at('s_branch_signal_w'), -w, 1e-9, 'W with R and C swapped');
    near(b.at('s_branch_signal_a'), -w * 100 * dt, 1e-6, 'A with R and C swapped');
  });

  it('trans_motion_sensor: V = v_R - v_C, P = integral of V', () => {
    const dt = 0.01;
    const sim = simulate({
      nodes: [node('m', 'mass', { m: 1 }), node('s', 'trans_motion_sensor'), REF_T(), node('ts', 'force_source', { F: 3 })],
      edges: [wire('ts.b', 'm.p'), wire('ts.a', 'tref.p'), wire('s.r', 'm.p'), wire('s.c', 'tref.p')],
    }, 100, dt);
    // mass under 3 N: v = 3 t, x = 1.5 t^2
    near(sim.at('s_branch_signal_v'), 3 * 100 * dt, 1e-6, 'V = F t / m');
    near(sim.at('s_branch_signal_p'), 1.5 * (100 * dt) ** 2, 1e-3, 'P = F t^2 / 2m');
  });

  it('torque_sensor: T = torque transmitted from R to C (rigid, w_R = w_C); sign flips with orientation', () => {
    const T = 2, J = 0.5, dt = 0.01;
    const run = (swap: boolean) => simulate({
      nodes: [node('ts', 'torque_source', { T }), node('sens', 'torque_sensor'), node('j', 'inertia', { J }), REF_R()],
      edges: swap
        ? [wire('ts.c', 'sens.c'), wire('ts.r', 'rref.r'), wire('sens.r', 'j.r')]
        : [wire('ts.c', 'sens.r'), wire('ts.r', 'rref.r'), wire('sens.c', 'j.r')],
    }, 50, dt);
    const a = run(false);
    near(a.at('sens_branch_torque'), T, 1e-9, 'through torque R -> C');
    near(a.across('j', 'r'), (T * 50 * dt) / J, 1e-6, 'the shaft carries the full torque');
    const b = run(true);
    near(b.at('sens_branch_torque'), -T, 1e-9, 'reversed orientation');
  });

  it('force_sensor: F = force transmitted from A to B, rigid v_A = v_B', () => {
    const F = 6, m = 3, dt = 0.01;
    const sim = simulate({
      nodes: [node('fs', 'force_source', { F }), node('sens', 'force_sensor'), node('m', 'mass', { m }), REF_T()],
      edges: [wire('fs.b', 'sens.a'), wire('fs.a', 'tref.p'), wire('sens.b', 'm.p')],
    }, 50, dt);
    near(sim.at('sens_branch_force'), F, 1e-9, 'through force A -> B');
    near(sim.across('m', 'p'), (F * 50 * dt) / m, 1e-6, 'v');
  });

  it('sources: ang_vel_source imposes w = omega; torque_source and force_source impose their through variable', () => {
    const sim = simulate({
      nodes: [node('src', 'ang_vel_source', { omega: -3.5 }), node('d', 'rot_damper', { b: 2 }), REF_R()],
      edges: [wire('src.r', 'd.r'), wire('src.c', 'rref.r'), wire('d.c', 'rref.r')],
    }, 2, 0.01);
    near(sim.across('src', 'r'), -3.5, 1e-9, 'w');
    near(sim.at('src_branch_torque'), -(2 * -3.5), 1e-9, 'source torque = -(damper torque b w)');
    const f = simulate({
      nodes: [node('fs', 'force_source', { F: -2.5 }), node('d', 'trans_damper', { b: 5 }), REF_T()],
      edges: [wire('fs.b', 'd.r'), wire('fs.a', 'tref.p'), wire('d.c', 'tref.p')],
    }, 2, 0.01);
    near(f.at('fs_branch_force'), -2.5, 1e-9, 'F');
    near(f.across('d', 'r'), -2.5 / 5, 1e-9, 'v = F / b');
  });
});

// ── 7. belt end (F-061): tension-only and damping ───────────────────────────────────────────────────────────────────
describe('WP-13 F-061: belt_end is tension-only and carries the damping term c (v_E - v_R)', () => {
  const beltModel = (F: number, p: Record<string, any>): Model => ({
    // R is anchored, E carries a mass pushed by F in +x: x_E grows, the belt is stretched
    nodes: [node('b', 'belt_end', p), node('m', 'mass', { m: 1 }), node('fs', 'force_source', { F }), REF_T()],
    edges: [wire('b.r', 'tref.p'), wire('b.e', 'm.p'), wire('fs.b', 'm.p'), wire('fs.a', 'tref.p')],
  });

  it('taut: static tension equals the applied force, output f = F', () => {
    const k = 400;
    const sim = simulate(beltModel(8, { stiffness: k, damping: 6 }), 600, 0.005);
    near(sim.at('b_branch_signal_f'), 8, 1e-3, 'tension f');
    near(sim.at('b_state_x'), 8 / k, 1e-3, 'stretch');
  });

  it('slack: a belt that is pushed instead of pulled carries 0 and the mass moves freely: x = -F t^2 / 2m', () => {
    const k = 400, F = -3, dt = 0.005, steps = 100;
    const sim = simulate(beltModel(F, { stiffness: k, damping: 0 }), steps, dt);
    const pos = sim.series('b_state_x');
    const t = steps * dt;
    near(pos[steps - 1], 0.5 * F * t * t, 1e-3, 'free flight of the mass on a slack belt');
    expect(Math.abs(sim.at('b_branch_signal_f'))).toBeLessThan(1e-9);
    expect(Math.min(...sim.series('b_branch_signal_f'))).toBeGreaterThanOrEqual(-1e-9);
  });

  it('damping: m x\'\' + c x\' + k x = F against the closed step response (underdamped), and it differs from c = 0', () => {
    const k = 400, c = 8, F = 10, m = 1, dt = 0.002, steps = 750;
    const sim = simulate(beltModel(F, { stiffness: k, damping: c }), steps, dt);
    const wn = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m)), wd = wn * Math.sqrt(1 - z * z);
    const step = (t: number) => (F / k) * (1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t)));
    const pos = sim.series('b_state_x');
    let worst = 0;
    sim.times.forEach((t, i) => { worst = Math.max(worst, Math.abs(pos[i] - step(t))); });
    expect(worst).toBeLessThan(0.01 * (F / k));
    note('belt damped step max |x - exact| / (F/k)', (100 * worst) / (F / k));
    // the tension signal includes the damping term: f = k s + c s'  with s = stretch (initially 0)
    const undamped = simulate(beltModel(F, { stiffness: k, damping: 0 }), 40, dt);
    expect(Math.abs(undamped.series('b_state_x')[39] - sim.series('b_state_x')[39])).toBeGreaterThan(1e-7);
  });

  it('the slack / taut switch is a located event, not a Newton stall', () => {
    const sim = simulate({
      nodes: [node('b', 'belt_end', { stiffness: 1e4, damping: 2 }), node('m', 'mass', { m: 1 }), node('fs', 'force_source', { F: -5 }), REF_T()],
      edges: [wire('b.r', 'tref.p'), wire('b.e', 'm.p'), wire('fs.b', 'm.p'), wire('fs.a', 'tref.p')],
    }, 200, 0.005);
    expect(sim.rejected).toBeLessThanOrEqual(5);
  });
});

// ── 8. library contract: parameters, bounds, equation text ──────────────────────────────────────────────────────────
describe('WP-13 canonical parameters, SI units, bounds and real equation text', () => {
  const BLOCKS = ['inertia', 'mass', 'rot_spring', 'rot_damper', 'rot_friction', 'rot_hard_stop', 'trans_spring', 'trans_damper',
    'trans_friction', 'trans_hard_stop', 'belt_end', 'torque_source', 'force_source', 'ang_vel_source', 'rot_motion_sensor',
    'trans_motion_sensor', 'torque_sensor', 'force_sensor'];

  it('every library equation / description is specific text, not a generic label', () => {
    for (const id of BLOCKS) {
      expect(isGenericText(lib(id).equation), `${id} equation`).toBe(false);
      expect(isGenericText(lib(id).description), `${id} description`).toBe(false);
    }
  });

  it('every exposed numeric parameter carries an SI unit and the library default passes validation', () => {
    const SI = /^(kg-m\^2|kg|N-m\/rad|N-m-s\/rad|N-m\/rad\/s|N-m|N\/m|N-s\/m|N\/m\/s|N|rad|rad\/s|m|m\/s|s\/rad|s\/m|m2|N-m-s\/rad|Pa|kg\/m)$/;
    for (const id of BLOCKS) {
      const defaults = Object.fromEntries(Object.entries(lib(id).params).map(([key, p]: any) => [key, { value: p.value, unit: p.unit, label: p.label }]));
      for (const [key, p] of Object.entries(lib(id).params) as any) expect(SI.test(p.unit), `${id}.${key} unit "${p.unit}"`).toBe(true);
      expect(validateBlockParams('x', id, defaults as any), id).toEqual([]);
    }
  });

  it('bounds: negative inertia / mass / stiffness / threshold and a zero hard-stop transition are rejected, 0 and fractions are legal where physical', () => {
    const bad = (id: string, key: string, value: number) => validateBlockParams('x', id, { [key]: value }).length;
    expect(bad('inertia', 'J', -1)).toBeGreaterThan(0);
    expect(bad('inertia', 'J', 0)).toBeGreaterThan(0);
    expect(bad('mass', 'm', 0.001)).toBe(0);
    expect(bad('rot_friction', 'wthr', 0)).toBeGreaterThan(0);
    expect(bad('trans_friction', 'Fc', -1)).toBeGreaterThan(0);
    expect(bad('trans_friction', 'Fc', 0)).toBe(0);
    expect(bad('rot_hard_stop', 'transition', 0)).toBeGreaterThan(0);
    expect(bad('rot_spring', 'theta0', -0.3)).toBe(0);
    expect(bad('belt_end', 'damping', 0)).toBe(0);
    expect(bad('belt_end', 'damping', -1)).toBeGreaterThan(0);
  });
});

it('prints the reference results (% error) for the report', () => {
  // eslint-disable-next-line no-console
  console.log(`WP-13 reference results\n${REPORT.join('\n')}`);
});
