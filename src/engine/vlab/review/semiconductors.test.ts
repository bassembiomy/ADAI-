import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { blockEquations } from '../vlabEquations';
import { VLAB_COMPONENT_DEFINITIONS } from '../vlabComponentDefinitions';
import { validateBlockParams } from '../vlabParams';
import { requiredPortsOf } from '../vlabTopologyValidation';
import { isGenericText } from './contractChecks';
import { CONTRACT_EXPECTED_FAILURES } from './contractExpectedFailures';

/**
 * WP-11: semiconductors and switches (diode, N-MOSFET, IGBT, switch).
 *
 * Every expected value is derived IN THIS FILE from the published relation named in each describe (Simscape Electrical
 * Diode piecewise-linear model, Shichman-Hodges / SPICE level 1 from Sedra & Smith, Simscape Electrical IGBT Ideal Switching,
 * Simscape Foundation Switch) or from the closed-form circuit solution written next to it. Nothing is read back from the
 * code under test. Sign convention (Simscape): through variable positive A -> K (p -> n, D -> S, C -> E), across v = v_A - v_K.
 * Every model runs through VLabPhysicsEngine.simulateStep for several steps.
 *
 * Library scope (derived from inventory.json, category Semiconductors + the Foundation switch): diode, nmos, igbt, switch.
 * The library has NO zener, PMOS, BJT, thyristor/SCR, triac, GTO or relay block (thyristor_6pulse/12pulse are gate-pulse
 * generators owned by WP-20); the contract below pins that so a new block cannot appear without a WP-11 test.
 */

// ── model builders ───────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } }) as any;
let edgeCount = 0;
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.');
  const [sb, pb] = b.split('.');
  return { id: `e${edgeCount++}`, source: sa, sourceHandle: pa, target: sb, targetHandle: pb } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }

function simulate(m: Model, steps: number, dt: number, budget = 600) {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: budget, wallClockMs: 60000 });
  let state: any = null;
  const history: any[] = [];
  for (let i = 0; i < steps; i++) {
    state = engine.simulateStep(m.nodes, m.edges, state, dt);
    history.push(state);
  }
  const system = new DAEAssembler().assemble(m.nodes, m.edges);
  const at = (name: string, s: any = state): number => {
    const i = s.variableNames.indexOf(name);
    if (i < 0) throw new Error(`no variable ${name}`);
    return s.x[i];
  };
  const across = (block: string, port: string, s: any = state): number => {
    const root = system.components.find((c) => c.blockId === block)!.portNodeMap.get(port)!;
    const i = s.variableNames.findIndex((n: string) => n.startsWith(`Across_${root}_(`));
    if (i < 0) throw new Error(`no across variable of ${block}.${port}`);
    return s.x[i];
  };
  return { state, history, at, across };
}

const near = (actual: number, expected: number, tol: number, label = '') =>
  expect(Math.abs(actual - expected), `${label}: got ${actual}, expected ${expected} (tol ${tol})`).toBeLessThanOrEqual(tol);

const GND = node('gnd', 'ground');
const lib = (id: string) => VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === id)!;
const SCOPE_IDS = ['diode', 'nmos', 'igbt', 'switch'];

// ── 1. diode: Simscape piecewise-linear I-V ──────────────────────────────────────────────────────────────────────────
// off (v < Vf): i = v*Goff ; on (v >= Vf): i = (v - Vf)/Ron + Vf*Goff ; Goff = 1/Roff
describe('WP-11 diode I-V against the Simscape piecewise-linear equations', () => {
  const Vf = 0.7, Ron = 0.01, Roff = 1e6;
  const direct = (V: number, params: Record<string, any> = {}): Model => ({
    nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('d', 'diode', { Vf, Ron, Roff, ...params }), GND],
    edges: [wire('vs.p', 'd.p'), wire('d.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
  });
  const points: [string, number, number][] = [
    ['reverse -5 V', -5, -5 / Roff],
    ['zero', 0, 0],
    ['sub-threshold 0.5 V (off branch)', 0.5, 0.5 / Roff],
    ['at Vf = 0.7 V (both branches give Vf*Goff)', 0.7, Vf / Roff],
    ['forward 0.8 V', 0.8, (0.8 - Vf) / Ron + Vf / Roff],
    ['forward 1.0 V', 1.0, (1.0 - Vf) / Ron + Vf / Roff],
    ['forward 1.2 V', 1.2, (1.2 - Vf) / Ron + Vf / Roff],
  ];
  for (const [label, V, I] of points) {
    it(`${label}: I = ${I}`, () => {
      const sim = simulate(direct(V), 3, 1e-3);
      for (const s of sim.history) {
        // nonlinear tolerance of the solver is 1e-8 on a residual in volts: the current of a Ron = 10 mOhm branch carries 1e-8/Ron = 1e-6 A
        near(sim.at('d_branch_current', s), I, 1e-8 + 1e-7 * Math.abs(I), label);
        near(sim.across('d', 'p', s) - sim.across('d', 'n', s), V, 1e-7, 'v = v_A - v_K');
      }
    });
  }
  it('I(V) is continuous across Vf (the old reverse branch jumped by Vf/Roff)', () => {
    const e = 1e-6;
    const lo = simulate(direct(Vf - e), 2, 1e-3).at('d_branch_current');
    const hi = simulate(direct(Vf + e), 2, 1e-3).at('d_branch_current');
    // exact piecewise-linear values at Vf -/+ e
    near(lo, (Vf - e) / Roff, 1e-12, 'just below Vf');
    near(hi, e / Ron + Vf / Roff, 1e-9, 'just above Vf');
    near(hi - lo, e / Ron + e / Roff, 1e-9, 'jump = slope * 2e (no step)');
  });
  it('series loop V = i R + vD: closed form i = (V - Vf + Ron*Vf/Roff)/(R + Ron)', () => {
    const V = 5, R = 100;
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('d', 'diode', { Vf, Ron, Roff }), node('r', 'resistor', { R }), GND],
      edges: [wire('vs.p', 'd.p'), wire('d.n', 'r.p'), wire('r.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const sim = simulate(m, 4, 1e-3);
    const I = (V - Vf + (Ron * Vf) / Roff) / (R + Ron);
    near(sim.at('d_branch_current'), I, 1e-9, 'loop current');
    near(sim.at('r_branch_current'), I, 1e-9, 'KCL');
    near(sim.across('d', 'p') - sim.across('d', 'n'), Vf + Ron * (I - Vf / Roff), 1e-9, 'diode drop');
    // power balance (Tellegen): source delivers V*I, diode and resistor absorb the rest
    const vD = sim.across('d', 'p') - sim.across('d', 'n');
    near(V * I, vD * I + I * I * R, 1e-9, 'power balance');
  });
  it('reverse bias leaks only V/(Roff + R) through a series load', () => {
    const V = -20, R = 100;
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('d', 'diode', { Vf, Ron, Roff }), node('r', 'resistor', { R }), GND],
      edges: [wire('vs.p', 'd.p'), wire('d.n', 'r.p'), wire('r.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    near(simulate(m, 3, 1e-3).at('d_branch_current'), V / (Roff + R), 1e-12, 'leakage');
  });
  it('Vf = 0 and Ron/Roff overrides are honoured (zero is a valid value, never a || fallback)', () => {
    const sim = simulate(direct(0.5, { Vf: 0 }), 2, 1e-3);
    near(sim.at('d_branch_current'), 0.5 / Ron, 1e-9, 'ideal-threshold diode: i = v/Ron');
    const sim2 = simulate(direct(-3, { Vf: 0, Roff: 1e3 }), 2, 1e-3);
    near(sim2.at('d_branch_current'), -3e-3, 1e-12, 'Roff = 1 kOhm');
  });
});

// ── 2. half-wave rectifier ───────────────────────────────────────────────────────────────────────────────────────────
describe('WP-11 half-wave rectifier into R (PWL diode, closed form)', () => {
  const Vpk = 10, f = 50, R = 100, Vf = 0.7, Ron = 0.01, Roff = 1e6, dt = 1e-4;
  const model = (): Model => ({
    nodes: [node('vs', 'ac_voltage', { Vpk, f, phase: 0, R_int: 0 }), node('d', 'diode', { Vf, Ron, Roff }), node('r', 'resistor', { R }), GND],
    edges: [wire('vs.p', 'd.p'), wire('d.n', 'r.p'), wire('r.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
  });
  /** closed-form load voltage of the series loop for source voltage vs: on branch if it is self-consistent, else off */
  const vload = (vs: number) => {
    const iOn = (vs - Vf + (Ron * Vf) / Roff) / (R + Ron);
    if (vs - iOn * R > Vf) return iOn * R;
    return (vs / (R + Roff)) * R;
  };
  const sim = simulate(model(), 400, dt); // two cycles, 200 steps each
  it('v_load(t) equals the closed-form PWL solution at every step', () => {
    let worst = 0;
    for (const s of sim.history) {
      const vs = Vpk * Math.sin(2 * Math.PI * f * s.time);
      worst = Math.max(worst, Math.abs(sim.at('r_branch_current', s) * R - vload(vs)));
    }
    expect(worst, `max |v_load - closed form| = ${worst} V`).toBeLessThan(1e-6);
  });
  it('peak output = (Vpk - Vf + Ron*Vf/Roff)*R/(R + Ron) at the source peak, i.e. Vpk - Vf - I*Ron', () => {
    const s = sim.history.find((h) => Math.abs(h.time - 0.005) < 1e-9)!;
    const peak = (Vpk - Vf + (Ron * Vf) / Roff) * R / (R + Ron);
    near(sim.at('r_branch_current', s) * R, peak, 1e-6, 'peak (closed form)');
    const I = sim.at('r_branch_current', s);
    near(sim.at('r_branch_current', s) * R, Vpk - Vf - I * Ron + (Ron * Vf) / Roff, 1e-6, 'Vpk - Vf - I*Ron');
  });
  it('the negative half-cycle output is only the reverse leakage v*R/(R + Roff) (<= 1.1 mV)', () => {
    let count = 0;
    for (const s of sim.history) {
      const phase = (s.time * f) % 1;
      if (phase > 0.52 && phase < 0.98) {
        count++;
        const vo = sim.at('r_branch_current', s) * R;
        expect(Math.abs(vo), `t=${s.time}`).toBeLessThan(1.1e-3);
        expect(vo).toBeLessThanOrEqual(1e-9);
      }
    }
    expect(count).toBeGreaterThan(150);
  });
  it('power balance at every step: source power = diode + load power', () => {
    for (const s of sim.history) {
      const vs = Vpk * Math.sin(2 * Math.PI * f * s.time);
      const i = sim.at('d_branch_current', s);
      const vd = sim.across('d', 'p', s) - sim.across('d', 'n', s);
      near(vs * i, vd * i + i * i * R, 1e-8, 'v_s i = v_D i + i^2 R');
    }
  });
});

// ── 3. half-wave rectifier with C filter: ripple ≈ I_load/(f C) ──────────────────────────────────────────────────────
describe('WP-11 half-wave rectifier with filter capacitor (switching events through simulateStep)', () => {
  const Vpk = 10, f = 50, R = 1000, C = 1e-3, Vf = 0.7, dt = 1e-4;
  const Vp = Vpk - Vf;
  const model = (): Model => ({
    nodes: [
      node('vs', 'ac_voltage', { Vpk, f, phase: 0, R_int: 0 }), node('d', 'diode', { Vf, Ron: 0.01, Roff: 1e6 }),
      node('r', 'resistor', { R }), node('c', 'capacitor', { C, v0: Vp }), GND,
    ],
    edges: [wire('vs.p', 'd.p'), wire('d.n', 'r.p'), wire('r.n', 'gnd.a'), wire('d.n', 'c.p'), wire('c.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
  });
  const steps = 600; // three source cycles
  const sim = simulate(model(), steps, dt, 800);
  const vout = (s: any) => sim.across('r', 'p', s);
  it('ripple of the settled cycles is within 10 % of I_load/(f*C) (first-order estimate, I_load = Vp/R)', () => {
    const cycle = (k: number) => sim.history.filter((s) => s.time > k * 0.02 + 1e-9 && s.time <= (k + 1) * 0.02 + 1e-9).map(vout);
    for (const k of [1, 2]) {
      const v = cycle(k);
      const ripple = Math.max(...v) - Math.min(...v);
      const expected = (Vp / R) / (f * C);
      expect(Math.abs(ripple - expected) / expected, `cycle ${k}: ripple ${ripple} vs ${expected}`).toBeLessThan(0.1);
    }
  });
  it('the output peak is Vpk - Vf (0.05 V) and the cycle-to-cycle drift of the peak is below 0.02 V', () => {
    const peak = (k: number) => Math.max(...sim.history.filter((s) => s.time > k * 0.02 && s.time <= (k + 1) * 0.02 + 1e-9).map(vout));
    near(peak(1), Vp, 0.05, 'peak of cycle 1');
    near(peak(2), peak(1), 0.02, 'periodic steady state');
  });
  it('the diode blocks between peaks: reverse current stays at the leakage scale and the output decays like exp(-t/RC)', () => {
    const quiet = sim.history.filter((s) => { const ph = (s.time * f) % 1; return ph > 0.32 && ph < 0.7 && s.time > 0.02; });
    expect(quiet.length).toBeGreaterThan(100);
    for (const s of quiet) expect(Math.abs(sim.at('d_branch_current', s)), `t=${s.time}`).toBeLessThan(2e-5);
    // exponential discharge: v(t2)/v(t1) = exp(-(t2 - t1)/RC) while the diode is off
    const firstCycle = quiet.filter((s) => s.time < 0.04); // one blocking interval (no conduction between its samples)
    const a = firstCycle[0], b = firstCycle[firstCycle.length - 1];
    near(vout(b) / vout(a), Math.exp(-(b.time - a.time) / (R * C)), 2e-3, 'discharge ratio');
  });
  it('Newton does not stall across the switching events: step and retry counts stay inside the budget', () => {
    const perCall = sim.history.map((s) => s.acceptedSteps + s.eventRetries);
    expect(Math.max(...perCall), `max solver steps per call ${Math.max(...perCall)}`).toBeLessThanOrEqual(40);
    const retries = sim.history.reduce((a, s) => a + s.eventRetries, 0);
    const located = sim.history.filter((s) => s.eventRetries > 0).length; // calls that contained a diode switching event
    expect(located, 'diode on/off events were detected').toBeGreaterThanOrEqual(4);
    // each event costs at most log2(dt/minStep) = 7 cuts plus margin
    expect(retries / located, `${retries} retries for ${located} events`).toBeLessThanOrEqual(12);
    const total = sim.history.reduce((a, s) => a + s.acceptedSteps, 0);
    expect(total, `${total} accepted solver steps for ${steps} calls`).toBeLessThanOrEqual(6 * steps);
    for (const s of sim.history) expect(s.rejectedSteps).toBeLessThanOrEqual(2);
  });
});

// ── 4. N-MOSFET: Shichman-Hodges ─────────────────────────────────────────────────────────────────────────────────────
// cut-off Vov<=0: 0 ; linear 0<Vds<Vov: kn(Vov*Vds - Vds^2/2)(1+lambda*Vds) ; saturation: kn/2 Vov^2 (1+lambda*Vds)
describe('WP-11 N-MOSFET drain current against Shichman-Hodges (all regions, continuity, symmetry)', () => {
  const kn = 0.5, Vth = 2, lambda = 0.01;
  const biased = (Vgs: number, Vds: number, params: Record<string, any> = {}): Model => ({
    nodes: [node('vds', 'dc_voltage', { V: Vds, R_int: 0 }), node('m', 'nmos', { kn, Vth, lambda, ...params }), node('vg', 'ps_constant', { value: Vgs }), GND],
    edges: [wire('vds.p', 'm.d'), wire('m.s', 'gnd.a'), wire('vds.n', 'gnd.a'), wire('vg.y', 'm.g')],
  });
  const id = (Vgs: number, Vds: number, params: Record<string, any> = {}) => {
    const sim = simulate(biased(Vgs, Vds, params), 3, 1e-3);
    return sim.at('m_branch_drain_current');
  };
  const points: [string, number, number, number][] = [
    ['cut-off Vgs = 1.5 V', 1.5, 5, 0],
    ['cut-off Vgs = Vth', 2, 5, 0],
    ['linear Vgs=4 Vds=1: 0.5(2*1 - 0.5)(1.01)', 4, 1, 0.5 * (2 * 1 - 0.5) * 1.01],
    ['linear Vgs=3 Vds=0.2: 0.5(0.2 - 0.02)(1.002)', 3, 0.2, 0.5 * (0.2 - 0.02) * 1.002],
    ['saturation Vgs=4 Vds=5: 0.25*4*1.05', 4, 5, 0.25 * 4 * 1.05],
    ['saturation Vgs=3 Vds=10: 0.25*1*1.1', 3, 10, 0.25 * 1 * 1.1],
    ['boundary Vds = Vov = 2: 0.25*4*1.02', 4, 2, 0.25 * 4 * 1.02],
    ['reverse Vds = -1 (source/drain swap): -0.5(3*1 - 0.5)(1.01)', 4, -1, -0.5 * (3 * 1 - 0.5) * 1.01],
    ['Vds = 0: no current', 4, 0, 0],
  ];
  for (const [label, Vgs, Vds, expected] of points) {
    // solver nonlinear tolerance 1e-8 on the residual: allow 1e-7 A
    it(`${label}`, () => near(id(Vgs, Vds), expected, 1e-7, label));
  }
  it('the region boundary Vds = Vov is C1: no jump and the same slope on both sides', () => {
    const Vov = 2, d = 1e-4;
    const below = id(4, Vov - d), mid = id(4, Vov), above = id(4, Vov + d);
    near(mid - below, above - mid, 1e-8, 'slope continuity: both sides equal 0.5*kn*Vov^2*lambda*d');
    near((above - mid) / d, 0.5 * kn * Vov * Vov * lambda, 1e-6, 'slope = kn/2 Vov^2 lambda');
  });
  it('the threshold Vgs = Vth is continuous (Id -> 0 from above) and 0 below', () => {
    near(id(2 + 1e-6, 5), 0.25 * 1e-12 * 1.05, 1e-12, 'just above threshold');
    near(id(2 - 1e-6, 5), 0, 1e-15, 'just below threshold');
  });
  it('lambda = 0 and Vth < 0 are valid (zero and negative values are physical)', () => {
    near(id(4, 5, { lambda: 0 }), 0.25 * 4, 1e-7, 'lambda = 0: no channel-length modulation');
    // depletion device Vth = -1, Vgs = 0: Vov = 1, saturation
    near(id(0, 3, { Vth: -1, lambda: 0 }), 0.25 * 1, 1e-7, 'depletion-mode threshold');
  });
  it('the gate draws no current: the gate source carries no through current', () => {
    const sim = simulate(biased(4, 5), 3, 1e-3);
    near(sim.across('m', 'g'), 4, 1e-9, 'gate signal');
    near(sim.at('vds_branch_current'), -sim.at('m_branch_drain_current'), 1e-9, 'all source current is the drain current');
  });
});

// ── 5. common-source amplifier operating point ──────────────────────────────────────────────────────────────────────
describe('WP-11 common-source amplifier: operating point and gain', () => {
  const Vdd = 12, Rd = 1000, kn = 0.002, Vth = 2, lambda = 0.02;
  const amp = (Vgs: number, over: Record<string, number> = {}): Model => ({
    nodes: [
      node('vdd', 'dc_voltage', { V: Vdd, R_int: 0 }), node('rd', 'resistor', { R: over.Rd ?? Rd }),
      node('m', 'nmos', { kn, Vth, lambda: over.lambda ?? lambda }), node('vg', 'ps_constant', { value: Vgs }), GND,
    ],
    edges: [wire('vdd.p', 'rd.p'), wire('rd.n', 'm.d'), wire('m.s', 'gnd.a'), wire('vdd.n', 'gnd.a'), wire('vg.y', 'm.g')],
  });
  // saturation: Id = a(1 + lambda(Vdd - Rd Id)), a = kn/2 Vov^2  =>  Id = a(1 + lambda Vdd)/(1 + a lambda Rd), Vd = Vdd - Rd Id
  const satOp = (Vgs: number) => {
    const a = 0.5 * kn * (Vgs - Vth) ** 2;
    const Id = (a * (1 + lambda * Vdd)) / (1 + a * lambda * Rd);
    return { Id, Vd: Vdd - Rd * Id };
  };
  it('Vgs = 3 V: Id = 1.2157 mA, Vd = 10.784 V (saturation, Vds > Vov)', () => {
    const op = satOp(3);
    near(op.Id, 0.00124 / 1.02, 1e-12, 'hand calculation');
    const sim = simulate(amp(3), 5, 1e-3);
    near(sim.at('m_branch_drain_current'), op.Id, 1e-9, 'Id');
    near(sim.across('m', 'd'), op.Vd, 1e-6, 'Vd');
    expect(op.Vd).toBeGreaterThan(3 - Vth); // saturation assumption holds
    near(sim.at('rd_branch_current'), sim.at('m_branch_drain_current'), 1e-12, 'KCL at the drain');
  });
  it('small-signal gain dVd/dVg matches the closed-form operating points (Vgs 3.0 -> 3.1 V)', () => {
    const a = satOp(3), b = satOp(3.1);
    const gainRef = (b.Vd - a.Vd) / 0.1;
    const va = simulate(amp(3), 4, 1e-3).across('m', 'd');
    const vb = simulate(amp(3.1), 4, 1e-3).across('m', 'd');
    near((vb - va) / 0.1, gainRef, 1e-4, 'gain');
    expect(gainRef).toBeLessThan(-1); // an inverting amplifier with |gain| > 1
  });
  it('a large Rd drives the device into the linear region: Newton finds the root of the cubic-free (lambda = 0) loop', () => {
    // lambda = 0, Rd = 20 kOhm, Vgs = 3: solve (Vdd - Vds)/Rd = kn(Vov Vds - Vds^2/2) by bisection in [0, Vov)
    const Rbig = 2e4, Vov = 1;
    const g = (vds: number) => (Vdd - vds) / Rbig - kn * (Vov * vds - 0.5 * vds * vds);
    let lo = 0, hi = Vov;
    for (let i = 0; i < 80; i++) { const mid = 0.5 * (lo + hi); if (g(mid) > 0) lo = mid; else hi = mid; }
    const vdsRef = 0.5 * (lo + hi);
    expect(vdsRef).toBeGreaterThan(0.1);
    expect(vdsRef).toBeLessThan(Vov);
    const sim = simulate(amp(3, { Rd: Rbig, lambda: 0 }), 5, 1e-3);
    near(sim.across('m', 'd'), vdsRef, 1e-4, 'Vds (linear region; solver residual 1e-8 A x Rd = 20 kOhm allows 2e-4 V)');
    near(sim.at('m_branch_drain_current'), (Vdd - vdsRef) / Rbig, 1e-9, 'Id');
  });
  it('cut-off: Vgs below Vth leaves the drain at Vdd and Id = 0', () => {
    const sim = simulate(amp(1.0), 4, 1e-3);
    near(sim.across('m', 'd'), Vdd, 1e-9, 'Vd = Vdd');
    near(sim.at('m_branch_drain_current'), 0, 1e-12, 'Id');
  });
});

// ── 6. IGBT ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// off (Vge < Vge_th): Ic = Vce*Goff ; on: Ic = (Vce - Vce_sat)/Rd + Vce_sat*Goff for Vce >= Vce_sat, else Vce*Goff
describe('WP-11 IGBT (Simscape ideal switching): threshold, saturation voltage, on/off resistance', () => {
  const Rd = 0.05, Vce_sat = 1.5, Vge_th = 5.5, Roff = 1e6;
  const biased = (Vge: number, Vce: number, params: Record<string, any> = {}): Model => ({
    nodes: [node('vce', 'dc_voltage', { V: Vce, R_int: 0 }), node('q', 'igbt', { Rd, Vce_sat, Vge_th, Roff, ...params }), node('vg', 'ps_constant', { value: Vge }), GND],
    edges: [wire('vce.p', 'q.c'), wire('q.e', 'gnd.a'), wire('vce.n', 'gnd.a'), wire('vg.y', 'q.g')],
  });
  const ic = (Vge: number, Vce: number, params: Record<string, any> = {}) => simulate(biased(Vge, Vce, params), 3, 1e-3).at('q_branch_collector_current');
  it('on (Vge = 10 V, Vce = 3 V): Ic = (3 - 1.5)/0.05 + 1.5/Roff = 30 A, incremental on resistance Rd', () => {
    near(ic(10, 3), 1.5 / Rd + Vce_sat / Roff, 1e-9, 'Ic');
    near((ic(10, 4) - ic(10, 3)) / 1, 1 / Rd, 1e-9, 'dIc/dVce = 1/Rd');
  });
  it('off (Vge = 0): only the leakage Vce/Roff, for either polarity', () => {
    near(ic(0, 3), 3 / Roff, 1e-12, 'forward leakage');
    near(ic(0, -3), -3 / Roff, 1e-12, 'reverse leakage');
    near(ic(0, 300), 300 / Roff, 1e-10, 'blocking 300 V');
  });
  it('gate threshold: 5.4 V is off, 5.6 V is on (hard threshold, no blend)', () => {
    near(ic(5.4, 3), 3 / Roff, 1e-12, 'Vge < Vge_th');
    near(ic(5.6, 3), 1.5 / Rd + Vce_sat / Roff, 1e-9, 'Vge > Vge_th');
    near(ic(Vge_th + 2, 3), 1.5 / Rd + Vce_sat / Roff, 1e-9, '2 V above threshold has no residual blend (the old tanh blend lost 0.03 %)');
  });
  it('gated on but Vce below the saturation voltage: no forward conduction, only leakage; no reverse conduction', () => {
    near(ic(10, 1.0), 1.0 / Roff, 1e-12, '0 < Vce < Vce_sat');
    near(ic(10, -2), -2 / Roff, 1e-12, 'Vce < 0 (no antiparallel diode in this block)');
  });
  it('continuous in Vce at Vce_sat; Vce_sat = 0 is valid', () => {
    const e = 1e-6;
    near(ic(10, Vce_sat + e) - ic(10, Vce_sat - e), e / Rd + 2 * e / Roff, 1e-9, 'no jump');
    near(ic(10, 2, { Vce_sat: 0 }), 2 / Rd, 1e-8, 'Vce_sat = 0: pure Ron');
  });
  it('power: the device dissipates Vce*Ic = Vce_sat*I + I^2 Rd when on (Tellegen with the source)', () => {
    const sim = simulate(biased(10, 3), 3, 1e-3);
    const I = sim.at('q_branch_collector_current');
    near(-sim.at('vce_branch_current') * 3, 3 * I, 1e-9, 'source power equals device power');
  });
});

// ── 7. switch ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-11 switch: on/off resistance, threshold, signal step', () => {
  const Ron = 0.01, Roff = 1e6;
  const biased = (ctrl: number, V = 5, params: Record<string, any> = {}): Model => ({
    nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('sw', 'switch', { Ron, Roff, threshold: 0.5, ...params }), node('ct', 'ps_constant', { value: ctrl }), GND],
    edges: [wire('vs.p', 'sw.p'), wire('sw.n', 'gnd.a'), wire('vs.n', 'gnd.a'), wire('ct.y', 'sw.v')],
  });
  const current = (ctrl: number, params: Record<string, any> = {}) => simulate(biased(ctrl, 5, params), 3, 1e-3).at('sw_branch_current');
  it('closed: i = V/Ron; open: i = V/Roff', () => {
    near(current(1), 5 / Ron, 1e-6, 'closed');
    near(current(0), 5 / Roff, 1e-12, 'open');
  });
  it('threshold: control 0.4 V is open, 0.6 V is closed; a negative threshold works', () => {
    near(current(0.4), 5 / Roff, 1e-12, 'below');
    near(current(0.6), 5 / Ron, 1e-6, 'above');
    near(current(-0.2, { threshold: -0.5 }), 5 / Ron, 1e-6, 'threshold -0.5 V, control -0.2 V');
    near(current(-0.8, { threshold: -0.5 }), 5 / Roff, 1e-12, 'control -0.8 V');
  });
  describe('toggled by a PS step through a load (RC), the event is located without stalling Newton', () => {
    const V = 5, R = 100, C = 1e-5, t0 = 0.01, dt = 1e-3;
    const rc = (initial: number, final: number, time: number): Model => ({
      nodes: [
        node('vs', 'dc_voltage', { V, R_int: 0 }), node('sw', 'switch', { Ron, Roff, threshold: 0.5 }), node('r', 'resistor', { R }),
        node('c', 'capacitor', { C }), node('st', 'ps_step', { time, initial, final }), GND,
      ],
      edges: [wire('vs.p', 'sw.p'), wire('sw.n', 'r.p'), wire('r.n', 'c.p'), wire('c.n', 'gnd.a'), wire('vs.n', 'gnd.a'), wire('st.y', 'sw.v')],
    });
    it('closing at t0: v_C(t) = V + (v_C(t0) - V) exp(-(t - t0)/((R + Ron) C)) after a leakage pre-charge', () => {
      const sim = simulate(rc(0, 1, t0), 40, dt, 800);
      const tauOff = (Roff + R) * C, tauOn = (R + Ron) * C;
      const vc0 = V * (1 - Math.exp(-t0 / tauOff));
      let worst = 0;
      for (const s of sim.history) {
        const t = s.time;
        const ref = t < t0 ? V * (1 - Math.exp(-t / tauOff)) : V + (vc0 - V) * Math.exp(-(t - t0) / tauOn);
        worst = Math.max(worst, Math.abs(sim.across('c', 'p', s) - ref));
      }
      // measured worst error 0.031 V (0.6 % of V, the step after the event): BDF with rtol 1e-3 at dt = tau,
      // plus the <= minimumStep (1 us) delay of the located event. Bound: 1 % of V.
      expect(worst, `max |v_C - closed form| = ${worst} V`).toBeLessThan(0.05);
      near(sim.across('c', 'p'), V, 1e-3, 'final value after 30 time constants');
      // the open phase carries only the leakage current V/(Roff + R)
      near(sim.at('sw_branch_current', sim.history[3]), (V - sim.across('c', 'p', sim.history[3])) / (Roff + R), 1e-9, 'open leakage');
    });
    it('opening at t0 freezes v_C (it only droops through Roff): v_C(t) = V exp(-(t - t0)/((Roff + R) C))', () => {
      const sim = simulate(rc(1, 0, 0.02), 40, dt, 800);
      const tauOff = (Roff + R) * C;
      const vcRef = (t: number) => (t < 0.02 ? V : V * Math.exp(-(t - 0.02) / tauOff));
      for (const s of sim.history.filter((h) => h.time > 0.01)) near(sim.across('c', 'p', s), vcRef(s.time), 0.02, `t=${s.time}`);
    });
    it('step budget: one located event, a handful of cuts, and no stall (the previous engine exhausted the attempt budget)', () => {
      const sim = simulate(rc(0, 1, t0), 40, dt, 200);
      const located = sim.history.reduce((a, s) => a + s.eventsLocated, 0);
      const retries = sim.history.reduce((a, s) => a + s.eventRetries, 0);
      expect(located).toBe(1);
      expect(retries, `${retries} event cuts`).toBeLessThanOrEqual(15);
      // WP-31b: 40 -> 80. The across voltage of the capacitor is now error-controlled (F-103) at rtol 1e-3 / atol 1e-5 right after the closing event, where v_C starts at the
      // leakage pre-charge (5 mV): 60 accepted steps for the first time constant (the old estimate ignored v_C and took ~10). Still far from a stall.
      const perCall = sim.history.map((s) => s.acceptedSteps + s.eventRetries);
      expect(Math.max(...perCall), `max steps per call ${Math.max(...perCall)}`).toBeLessThanOrEqual(80);
      const total = sim.history.reduce((a, s) => a + s.acceptedSteps, 0);
      expect(total, `${total} accepted steps over 40 calls`).toBeLessThanOrEqual(240); // WP-31b: 160 -> 240 (measured 186, same cause as the per-call bound)
    });
  });
});

// ── 8. parameters, library text, help, contract ─────────────────────────────────────────────────────────────────────
describe('WP-11 parameters, bounds, library and help text', () => {
  const bad = (type: string, params: Record<string, any>) => validateBlockParams('x', type, params).length;
  it('physical bounds: resistances > 0, kn > 0, lambda >= 0; zero Vf / Vce_sat / lambda and negative thresholds are legal', () => {
    expect(bad('diode', { Ron: 0 })).toBeGreaterThan(0);
    expect(bad('diode', { Roff: -1 })).toBeGreaterThan(0);
    expect(bad('diode', { Vf: -0.1 })).toBeGreaterThan(0);
    expect(bad('diode', { Vf: 0 })).toBe(0);
    expect(bad('nmos', { kn: 0 })).toBeGreaterThan(0);
    expect(bad('nmos', { lambda: -0.01 })).toBeGreaterThan(0);
    expect(bad('nmos', { lambda: 0, Vth: -1.5 })).toBe(0);
    expect(bad('igbt', { Rd: 0 })).toBeGreaterThan(0);
    expect(bad('igbt', { Roff: 0 })).toBeGreaterThan(0);
    expect(bad('igbt', { Vce_sat: 0, Vge_th: -2 })).toBe(0);
    expect(bad('switch', { Ron: 0 })).toBeGreaterThan(0);
    expect(bad('switch', { Roff: 0 })).toBeGreaterThan(0);
    expect(bad('switch', { threshold: -3 })).toBe(0);
  });
  it('every parameter has a unit and every library parameter is read by the equation (no dead params)', () => {
    const expectedUnits: Record<string, Record<string, string>> = {
      diode: { Ron: 'Ω', Roff: 'Ω', Vf: 'V' },
      nmos: { kn: 'A/V²', Vth: 'V', lambda: '1/V' },
      igbt: { Vge_th: 'V', Vce_sat: 'V', Rd: 'Ω', Roff: 'Ω' },
      switch: { Ron: 'Ω', Roff: 'Ω', threshold: 'V' },
    };
    for (const id of SCOPE_IDS) {
      for (const [k, unit] of Object.entries(expectedUnits[id])) expect((lib(id).params as any)[k].unit, `${id}.${k}`).toBe(unit);
      expect(Object.keys(lib(id).params).sort(), id).toEqual(Object.keys(expectedUnits[id]).sort());
    }
  });
  it('ports: direction and domain follow the physics (two electrical terminals, a physical-signal gate/control input)', () => {
    const dom = (id: string, p: string) => (lib(id).ports.find((x) => x.id === p) as any);
    expect(dom('diode', 'p').domain).toBe('Electrical'); expect(dom('diode', 'n').domain).toBe('Electrical');
    expect(dom('nmos', 'd').domain).toBe('Electrical'); expect(dom('nmos', 's').domain).toBe('Electrical');
    expect(dom('igbt', 'c').domain).toBe('Electrical'); expect(dom('igbt', 'e').domain).toBe('Electrical');
    expect(dom('switch', 'p').domain).toBe('Electrical'); expect(dom('switch', 'n').domain).toBe('Electrical');
    for (const [id, p] of [['nmos', 'g'], ['igbt', 'g'], ['switch', 'v']] as const) {
      expect(dom(id, p).domain, `${id}.${p}`).toBe('Physical');
      expect(dom(id, p).direction, `${id}.${p}`).toBe('in');
    }
  });
  it('an unwired IGBT / NMOS gate is rejected before simulation (semantic requirement; the IGBT equation hides the gate below Vce_sat)', () => {
    expect(requiredPortsOf('igbt').signal).toEqual(['g']);
    expect(requiredPortsOf('nmos').signal).toEqual(['g']);
    const open: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 3, R_int: 0 }), node('q', 'igbt'), GND],
      edges: [wire('vs.p', 'q.c'), wire('q.e', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    expect(() => new VLabPhysicsEngine().simulateStep(open.nodes, open.edges, null, 1e-3)).toThrow(/gate|\bg\b/i);
  });
  it('library equation text and help definitions state the real equations with units (no generic placeholder)', () => {
    const must: Record<string, RegExp[]> = {
      diode: [/Vf/, /Ron/, /Roff/, /\[A\]/],
      nmos: [/Vth|Vov/, /kn/, /Vds/, /λ|lambda/, /\[A\]/],
      igbt: [/Vge_th/, /Vce_sat/, /Rd/, /Roff/, /\[A\]/],
      switch: [/threshold/, /Ron/, /Roff/, /\[(V|Ω)\]/],
    };
    for (const id of SCOPE_IDS) {
      const b = lib(id);
      expect(isGenericText(b.equation), `${id}: ${b.equation}`).toBe(false);
      for (const re of must[id]) expect(b.equation, `${id} library equation ${re}`).toMatch(re);
      const d = VLAB_COMPONENT_DEFINITIONS[id];
      expect(d.equations.length, id).toBeGreaterThan(0);
      expect(d.latex.length, id).toBeGreaterThan(0);
      for (const l of d.latex) expect(/[\u0000-\u001f]/.test(l), `${id} latex control character`).toBe(false);
      expect(d.description.length, id).toBeGreaterThan(60);
      expect(d.equations.join(' '), `${id} help equations`).toMatch(/\[(A|V|ohm)\]/);
      expect(d.through, id).toMatch(/\[A\]/);
      expect(d.across, id).toMatch(/\[V\]/);
    }
  });
  it('the library has no zener, PMOS, BJT, thyristor, triac, GTO or relay block (nothing to certify, nothing hidden)', () => {
    const ids = VLAB_LIBRARY.flatMap((d) => d.blocks).map((b) => b.id);
    expect(ids.filter((i) => /zener|pmos|bjt|triac|gto|relay|^scr$|^thyristor$/i.test(i))).toEqual([]);
    const semis = VLAB_LIBRARY.flatMap((d) => d.blocks).filter((b) => b.category === 'Semiconductors').map((b) => b.id).sort();
    expect(semis).toEqual(['diode', 'igbt', 'nmos']);
  });
  it('no WP-11 entry remains in the contract expected-failure ratchet', () => {
    const left = Object.entries(CONTRACT_EXPECTED_FAILURES).filter(([, v]) => Object.values(v).includes('WP-11'));
    expect(left).toEqual([]);
  });
  it('direct equation calls: zero-valued parameters are honoured and residuals are finite and sized 1', () => {
    for (const [id, args] of [
      ['diode', { across: [1, 0], branch: [0.1], params: { Vf: 0, Ron: 0.5, Roff: 1e6 } }],
      ['nmos', { across: [5, 0, 4], branch: [0.1], params: { kn: 0.5, Vth: 2, lambda: 0 }, ports: ['d', 's', 'g'] }],
      ['igbt', { across: [3, 0, 10], branch: [0.1], params: { Rd: 0.05, Vce_sat: 0, Vge_th: 5.5, Roff: 1e6 } }],
      ['switch', { across: [5, 0, 1], branch: [0.1], params: { Ron: 0.5, Roff: 1e6, threshold: 0 }, ports: ['p', 'n', 'v'] }],
    ] as [string, any][]) {
      const r = blockEquations[id](args);
      expect(r.length, id).toBe(1);
      expect(Number.isFinite(r[0]), id).toBe(true);
    }
    // diode, Vf = 0, Ron = 0.5: residual V - Vf - Ron*(I - 0) = 1 - 0.05
    near(blockEquations.diode({ across: [1, 0], branch: [0.1], params: { Vf: 0, Ron: 0.5, Roff: 1e6 } } as any)[0], 0.95, 1e-12, 'diode residual');
  });
});
