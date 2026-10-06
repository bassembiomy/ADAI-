import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { ddt, ddtStencil, ddtVector } from '../vlabDiscretization';

/**
 * WP-31a (F-067, F-058): order of accuracy of the V-Lab time discretisation.
 *
 * The BDF2 stencil must apply to EVERY derivative an equation forms: C d(Vp-Vn)/dt (an across value), L dI/dt (a branch
 * value) and m dv/dt (an across value) as well as integrator states. Expected values are the closed-form solutions of the
 * linear circuits / oscillator, written in this file (Simscape Capacitor i = C dv/dt, Inductor v = L di/dt, Newton's law).
 * Everything runs through VLabPhysicsEngine.simulateStep. "BDF1 forced" drops the stored history before every call, which is
 * exactly the startup / post-event path of the engine.
 */
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } }) as any;
let edgeCount = 0;
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.');
  const [sb, pb] = b.split('.');
  return { id: `e${edgeCount++}`, source: sa, sourceHandle: pa, target: sb, targetHandle: pb } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }

interface Trace { t: number[]; at: (name: string, k: number) => number; acrossAt: (block: string, port: string, k: number) => number; states: any[] }

/** One simulateStep call per entry of `dts`; each call must be exactly one accepted, unrejected solver step. */
function run(m: Model, dts: number[], opts: { bdf1?: boolean; fixedSteps?: boolean } = {}): Trace {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 500, wallClockMs: 60000 });
  const system = new DAEAssembler().assemble(m.nodes, m.edges);
  let state: any = null;
  const states: any[] = [];
  for (const dt of dts) {
    const input = opts.bdf1 && state ? { ...state, prevX: undefined } : state;
    state = engine.simulateStep(m.nodes, m.edges, input, dt);
    if (opts.fixedSteps !== false) {
      expect(state.acceptedSteps, 'one solver step per call (fixed step), call ' + states.length + ', dt ' + dt).toBe(1);
      expect(state.rejectedSteps, 'no step rejection (fixed step)').toBe(0);
    }
    states.push(state);
  }
  const at = (name: string, k: number) => {
    const i = states[k].variableNames.indexOf(name);
    if (i < 0) throw new Error(`no variable ${name}`);
    return states[k].x[i];
  };
  const acrossAt = (block: string, port: string, k: number) => {
    const root = system.components.find((c) => c.blockId === block)!.portNodeMap.get(port)!;
    const i = states[k].variableNames.findIndex((n: string) => n.startsWith(`Across_${root}_(`));
    if (i < 0) throw new Error(`no across variable of ${block}.${port}`);
    return states[k].x[i];
  };
  return { t: states.map((s) => s.time), at, acrossAt, states };
}

const observedOrder = (e1: number, e2: number) => Math.log2(e1 / e2);
const maxErr = (tr: Trace, f: (k: number) => number, from = 0) => {
  let w = 0;
  for (let k = from; k < tr.t.length; k++) w = Math.max(w, Math.abs(f(k)));
  return w;
};
const repeat = (dt: number, n: number) => new Array(n).fill(dt);

const GND = node('gnd', 'ground');

// ── RC charge: vC(t) = V (1 - exp(-t/RC)) ─────────────────────────────────────────────────────────────────────────────
const V = 5, R = 1000, C = 1e-6, tau = R * C;
const rc = (): Model => ({
  nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('r', 'resistor', { R }), node('c', 'capacitor', { C, v0: 0 }), GND],
  edges: [wire('vs.p', 'r.p'), wire('r.n', 'c.p'), wire('c.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
});
const rcError = (h: number, opts: { bdf1?: boolean } = {}) => {
  const tr = run(rc(), repeat(h, Math.round(3 * tau / h)), opts);
  return maxErr(tr, (k) => tr.acrossAt('c', 'p', k) - tr.acrossAt('c', 'n', k) - V * (1 - Math.exp(-tr.t[k] / tau)));
};

// ── series RLC, underdamped step response ─────────────────────────────────────────────────────────────────────────────
const Rr = 20, L = 1e-3, Cc = 1e-6;
const alpha = Rr / (2 * L), w0 = 1 / Math.sqrt(L * Cc), wd = Math.sqrt(w0 * w0 - alpha * alpha);
const rlc = (): Model => ({
  nodes: [node('vs', 'dc_voltage', { V: 1, R_int: 0 }), node('r', 'resistor', { R: Rr }), node('l', 'inductor', { L, i0: 0 }), node('c', 'capacitor', { C: Cc, v0: 0 }), GND],
  edges: [wire('vs.p', 'r.p'), wire('r.n', 'l.p'), wire('l.n', 'c.p'), wire('c.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
});
const vcRef = (t: number) => 1 - Math.exp(-alpha * t) * (Math.cos(wd * t) + (alpha / wd) * Math.sin(wd * t));
const iRef = (t: number) => (1 / (wd * L)) * Math.exp(-alpha * t) * Math.sin(wd * t);
const TRLC = 2.4e-4;
const rlcRun = (dts: number[], opts: { bdf1?: boolean; fixedSteps?: boolean } = {}) => {
  const tr = run(rlc(), dts, opts);
  return {
    tr,
    ev: maxErr(tr, (k) => tr.acrossAt('c', 'p', k) - tr.acrossAt('c', 'n', k) - vcRef(tr.t[k])),
    ei: maxErr(tr, (k) => (tr.at('l_branch_current', k) - iRef(tr.t[k])) * 1e-3),
  };
};

// ── RL: i(t) = (V/R)(1 - exp(-R t/L)) ─────────────────────────────────────────────────────────────────────────────────
const Rl = 100, Ll = 0.1, tauL = Ll / Rl;
const rl = (): Model => ({
  nodes: [node('vs', 'dc_voltage', { V: 10, R_int: 0 }), node('r', 'resistor', { R: Rl }), node('l', 'inductor', { L: Ll, i0: 0 }), GND],
  edges: [wire('vs.p', 'r.p'), wire('r.n', 'l.p'), wire('l.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
});
const rlError = (h: number, opts: { bdf1?: boolean } = {}) => {
  const tr = run(rl(), repeat(h, Math.round(3 * tauL / h)), opts);
  return maxErr(tr, (k) => tr.at('l_branch_current', k) - (10 / Rl) * (1 - Math.exp(-tr.t[k] / tauL)));
};

describe('WP-31a stencil helper (vlabDiscretization)', () => {
  const base = { dt: 0.1, order: 1 as number | undefined, prevPrevStates: undefined as number[] | undefined, prevDt: undefined as number | undefined };
  it('BDF1: (x - x1)/h; BDF2: variable-step formula; both exact on polynomials they are built for', () => {
    const ctx: any = { ...base, prevStates: [3], states: [0], stateDerivatives: [0], time: 0, parameters: {} };
    expect(ddt(ctx, 5, 0)).toBeCloseTo((5 - 3) / 0.1, 12);
    // BDF2 reproduces the exact derivative of any quadratic x(t) = a t^2 + b t + c at t_{n+1}, for variable steps
    const h = 0.1, hp = 0.04, a = 1.7, b = -0.6, c = 0.3, t1 = 1.0;
    const f = (t: number) => a * t * t + b * t + c;
    const ctx2: any = { dt: h, order: 2, prevStates: [f(t1)], prevPrevStates: [f(t1 - hp)], prevDt: hp, states: [0], stateDerivatives: [0], time: 0, parameters: {} };
    expect(ddt(ctx2, f(t1 + h), 0)).toBeCloseTo(2 * a * (t1 + h) + b, 10);
    expect(ddtVector([f(t1 + h)], ctx2)[0]).toBeCloseTo(2 * a * (t1 + h) + b, 10);
    // with the stage dt, x - dt * ddt(x) is the history blend (x1 for BDF1)
    expect(ddtVector([f(t1 + h), 7], { ...ctx2, prevStates: [f(t1), 6], prevPrevStates: [f(t1 - hp), 6] }, [false, true])[1]).toBeCloseTo((7 - 6) / h, 12); // pinned to BDF1
    const s = ddtStencil(ctx2);
    expect(s.a0 + s.a1 + s.a2).toBeCloseTo(0, 12); // a constant has zero derivative
  });
});

describe('WP-31a observed order of accuracy through VLabPhysicsEngine.simulateStep', () => {
  it('RC charge (C d(Vp-Vn)/dt of an across value): BDF2 order >= 1.8, BDF1 order ~ 1', () => {
    const hs = [tau / 40, tau / 80, tau / 160];
    const e2 = hs.map((h) => rcError(h));
    const e1 = hs.map((h) => rcError(h, { bdf1: true }));
    console.log('RC BDF2 errors', e2, 'orders', observedOrder(e2[0], e2[1]), observedOrder(e2[1], e2[2]));
    console.log('RC BDF1 errors', e1, 'orders', observedOrder(e1[0], e1[1]), observedOrder(e1[1], e1[2]));
    expect(observedOrder(e2[0], e2[1])).toBeGreaterThanOrEqual(1.8);
    expect(observedOrder(e2[1], e2[2])).toBeGreaterThanOrEqual(1.8);
    for (const p of [observedOrder(e1[0], e1[1]), observedOrder(e1[1], e1[2])]) { expect(p).toBeGreaterThan(0.85); expect(p).toBeLessThan(1.25); }
    expect(e2[0]).toBeLessThan(e1[0] / 5);
  });

  it('RL (L dI/dt of a branch value): BDF2 order >= 1.8, BDF1 order ~ 1', () => {
    const hs = [tauL / 40, tauL / 80, tauL / 160];
    const e2 = hs.map((h) => rlError(h));
    const e1 = hs.map((h) => rlError(h, { bdf1: true }));
    console.log('RL BDF2 errors', e2, 'orders', observedOrder(e2[0], e2[1]), observedOrder(e2[1], e2[2]));
    console.log('RL BDF1 errors', e1, 'orders', observedOrder(e1[0], e1[1]), observedOrder(e1[1], e1[2]));
    expect(observedOrder(e2[0], e2[1])).toBeGreaterThanOrEqual(1.8);
    expect(observedOrder(e2[1], e2[2])).toBeGreaterThanOrEqual(1.8);
    for (const p of [observedOrder(e1[0], e1[1]), observedOrder(e1[1], e1[2])]) { expect(p).toBeGreaterThan(0.85); expect(p).toBeLessThan(1.25); }
  });

  it('series RLC underdamped: BDF2 order >= 1.8 on vC and iL, BDF1 order ~ 1', () => {
    const hs = [2e-6, 1e-6, 5e-7];
    const r2 = hs.map((h) => rlcRun(repeat(h, Math.round(TRLC / h))));
    const r1 = hs.map((h) => rlcRun(repeat(h, Math.round(TRLC / h)), { bdf1: true }));
    console.log('RLC BDF2 vC errors', r2.map((r) => r.ev), 'iL', r2.map((r) => r.ei));
    console.log('RLC BDF1 vC errors', r1.map((r) => r.ev), 'iL', r1.map((r) => r.ei));
    for (const key of ['ev', 'ei'] as const) {
      expect(observedOrder(r2[0][key], r2[1][key])).toBeGreaterThanOrEqual(1.8);
      expect(observedOrder(r2[1][key], r2[2][key])).toBeGreaterThanOrEqual(1.8);
      for (const p of [observedOrder(r1[0][key], r1[1][key]), observedOrder(r1[1][key], r1[2][key])]) { expect(p).toBeGreaterThan(0.85); expect(p).toBeLessThan(1.25); }
    }
  });

  it('mass-spring-damper (m dv/dt of an across value, spring state): BDF2 order >= 1.8', { timeout: 120000 }, () => {
    const m = 1, k = 100, b = 2, F = 10;
    const model = (): Model => ({
      nodes: [node('src', 'force_source', { F }), node('mass', 'mass', { m, b: 0 }), node('spring', 'trans_spring', { k }), node('damper', 'trans_damper', { b }), node('ref', 'trans_ref', {})],
      edges: [wire('src.a', 'mass.p'), wire('src.b', 'ref.p'), wire('mass.p', 'spring.r'), wire('spring.c', 'ref.p'), wire('mass.p', 'damper.r'), wire('damper.c', 'ref.p')],
    });
    const al = b / (2 * m), wn = Math.sqrt(k / m), wdm = Math.sqrt(wn * wn - al * al);
    const vRef = (t: number) => (F / (m * wdm)) * Math.exp(-al * t) * Math.sin(wdm * t);
    const err = (h: number, bdf1 = false) => {
      const tr = run(model(), repeat(h, Math.round(0.15 / h)), { bdf1 });
      // the force source drives the mass in the direction that makes the steady spring force F: take |v|
      return maxErr(tr, (i) => Math.abs(tr.acrossAt('mass', 'p', i)) - Math.abs(vRef(tr.t[i])));
    };
    const hs = [4e-4, 2e-4, 1e-4];
    const e2 = hs.map((h) => err(h));
    const e1 = hs.map((h) => err(h, true));
    console.log('MSD BDF2 errors', e2, 'BDF1 errors', e1);
    expect(observedOrder(e2[0], e2[1])).toBeGreaterThanOrEqual(1.8);
    expect(observedOrder(e2[1], e2[2])).toBeGreaterThanOrEqual(1.8);
    expect(observedOrder(e1[1], e1[2])).toBeLessThan(1.3);
  });
});

describe('WP-31a variable step and restart', () => {
  it('a step-size change mid-run keeps second order (RLC, h then 0.7 h after a quarter of the run)', () => {
    const errFor = (scale: number) => {
      const h = 4e-6 * scale;
      const dts: number[] = [];
      let t = 0;
      let i = 0;
      while (t < TRLC) {
        const dt = t < TRLC / 4 ? h : 0.7 * h; // one step-size change mid-run (ratio 0.7), then growth via sub-steps
        dts.push(dt); t += dt; i++;
      }
      // the engine may split a call into several solver steps when the size grows (it never exceeds the last accepted h),
      // which is itself a step-size change; the global time grid is irregular by construction here.
      const tr = run(rlc(), dts, { fixedSteps: false });
      const spacing = new Set(tr.t.slice(1).map((x, j) => Math.round((x - tr.t[j]) * 1e12)));
      expect(spacing.size, 'the grid has more than one step size').toBeGreaterThan(1);
      // error measured after the change (the early, fixed-h part carries its own, larger error)
      const k0 = tr.t.findIndex((x) => x >= TRLC / 4);
      return maxErr(tr, (k) => tr.acrossAt('c', 'p', k) - tr.acrossAt('c', 'n', k) - vcRef(tr.t[k]), k0);
    };
    const e = [errFor(1), errFor(0.5), errFor(0.25)];
    console.log('RLC variable-step vC errors', e);
    expect(observedOrder(e[0], e[1])).toBeGreaterThanOrEqual(1.8);
    expect(observedOrder(e[1], e[2])).toBeGreaterThanOrEqual(1.8);
  });

  it('a restart (history dropped) mid-run falls back to BDF1 for one step without a spike', () => {
    const h = tau / 80;
    const engine = new VLabPhysicsEngine();
    const m = rc();
    let state: any = null;
    const vc: number[] = [];
    const ic: number[] = [];
    const names = new DAEAssembler().assemble(m.nodes, m.edges).variableNames;
    const iCap = names.indexOf('c_branch_current');
    const n = Math.round(2 * tau / h);
    for (let k = 0; k < n; k++) {
      // reset after every 60 steps: history dropped, so the next step is BDF1 (the engine's startup / post-event path)
      const input = state && k === 60 ? { ...state, prevX: undefined, prevDt: undefined } : state;
      state = engine.simulateStep(m.nodes, m.edges, input, h);
      expect(state.acceptedSteps).toBe(1);
      vc.push(state.x[iCap]);
      ic.push(state.time);
    }
    for (let k = 0; k < n; k++) {
      const t = ic[k];
      const iExact = (V / R) * Math.exp(-t / tau);
      // current is continuous across the restart: no spike (BDF1 local error is O(h^2), so within a few percent of the peak)
      expect(Math.abs(vc[k] - iExact), `i_C error at step ${k}`).toBeLessThan(0.02 * (V / R));
    }
    const jump = Math.abs(vc[60] - vc[59]);
    const expectedJump = Math.abs((V / R) * (Math.exp(-ic[59] / tau) - Math.exp(-ic[60] / tau)));
    expect(Math.abs(jump - expectedJump)).toBeLessThan(0.01 * (V / R));
  });

  it('simulateStep BDF2 history bookkeeping: (wrong-size history is ignored)', () => {
    const engine = new VLabPhysicsEngine();
    const m = rc();
    const s1 = engine.simulateStep(m.nodes, m.edges, null, tau / 80);
    expect(s1.prevX).toBeDefined();
    const s2 = engine.simulateStep(m.nodes, m.edges, s1, tau / 80);
    expect(s2.prevX).toBeDefined();
    expect(s2.prevX!.length).toBe(s2.x.length);
    // stale history with the wrong size (topology change) is ignored rather than mixed in
    const stale = engine.simulateStep(m.nodes, m.edges, { ...s2, prevX: [1, 2] }, tau / 80);
    expect(stale.acceptedSteps).toBe(1);
    expect(Number.isFinite(stale.x[0])).toBe(true);
  });
});
