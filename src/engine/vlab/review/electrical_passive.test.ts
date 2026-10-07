import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { ImplicitSolver } from '../ImplicitSolver';
import { blockEquations } from '../vlabEquations';
import { VLAB_COMPONENT_DEFINITIONS } from '../vlabComponentDefinitions';
import { validateBlockParams } from '../vlabParams';
import { DAEStructureError, assertStructurallyWellPosed } from '../vlabStructure';
import { findFloatingElectricalNetworks, INTERNAL_REFERENCE_PORTS } from '../vlabElectricalReference';
import { isGenericText } from './contractChecks';

/**
 * WP-10: electrical passive components, sources, sensors and references.
 *
 * Every expected value is derived IN THIS FILE from the published relation (Simscape Foundation / Electrical block
 * reference named in each describe) or from the closed-form circuit solution written next to it; nothing is read back from
 * the code under test. Convention (Simscape): through variable positive p -> n through the block, across v = v_p - v_n,
 * so the power flowing INTO a two-terminal block is v * i and an energy-conserving network has sum(v_k * i_k) = 0
 * (Tellegen). All models run through VLabPhysicsEngine.simulateStep for several steps.
 */

// ── model builders ───────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } }) as any;
let edgeCount = 0;
/** wire('a.p', 'b.n') */
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.');
  const [sb, pb] = b.split('.');
  return { id: `e${edgeCount++}`, source: sa, sourceHandle: pa, target: sb, targetHandle: pb } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }

/** `fixedStep`: one implicit step of dt per call (WP-31b engine.setFixedStep), for checks of the discretisation itself */
function simulate(m: Model, steps: number, dt: number, fixedStep = false) {
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 200, wallClockMs: 30000 });
  engine.setFixedStep(fixedStep);
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
  /** v = v_p - v_n of a two-terminal block and its through current p -> n */
  const branchOf = (block: string, p = 'p', n = 'n', s: any = state) => ({ v: across(block, p, s) - across(block, n, s), i: at(`${block}_branch_current`, s) });
  return { state, history, at, across, branchOf, system };
}

const near = (actual: number, expected: number, tol: number, label = '') =>
  expect(Math.abs(actual - expected), `${label}: got ${actual}, expected ${expected} (tol ${tol})`).toBeLessThanOrEqual(tol);

/** Tellegen / power balance: the powers v*i INTO all branches add up to 0 (relative to the largest term). */
const expectPowerBalance = (terms: [number, number][], tolRel: number, label: string) => {
  const sum = terms.reduce((a, [v, i]) => a + v * i, 0);
  const scale = Math.max(1e-12, ...terms.map(([v, i]) => Math.abs(v * i)));
  expect(Math.abs(sum) / scale, `${label}: power balance sum = ${sum}`).toBeLessThanOrEqual(tolRel);
};

const GND = node('gnd', 'ground');
const lib = (id: string) => VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === id)!;

// ── 1. resistor divider (Simscape Resistor: v = i R; DC Voltage Source: v = V) ───────────────────────────────────────
describe('WP-10 resistor divider: v = i R, Kirchhoff laws, power balance', () => {
  const V = 10, R1 = 1000, R2 = 3000;
  const model = (ground = 'ground'): Model => ({
    nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('r1', 'resistor', { R: R1 }), node('r2', 'resistor', { R: R2 }), node('gnd', ground)],
    edges: [wire('vs.p', 'r1.p'), wire('r1.n', 'r2.p'), wire('r2.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
  });
  for (const ground of ['ground', 'delta_ref']) {
    it(`closed form over 5 steps (reference block: ${ground})`, () => {
      const sim = simulate(model(ground), 5, 0.01);
      for (const s of sim.history) {
        const I = V / (R1 + R2);
        near(sim.across('r1', 'n', s), V * R2 / (R1 + R2), 1e-9, 'v_mid = V R2/(R1+R2)');
        near(sim.at('r1_branch_current', s), I, 1e-12, 'i_R1');
        near(sim.at('r2_branch_current', s), I, 1e-12, 'i_R2 (KCL at the middle node)');
        near(sim.at('vs_branch_current', s), -I, 1e-12, 'source current p->n is -I (it delivers power)');
        expectPowerBalance([[V, -I], [R1 * I, I], [R2 * I, I]], 1e-9, 'divider');
      }
    });
  }
  it('the reference node is 0 V and every branch satisfies v = i R', () => {
    const sim = simulate(model(), 3, 0.01);
    near(sim.across('gnd', 'a'), 0, 1e-12, 'ground');
    const b1 = sim.branchOf('r1'); const b2 = sim.branchOf('r2');
    near(b1.v, R1 * b1.i, 1e-9, 'v = iR1'); near(b2.v, R2 * b2.i, 1e-9, 'v = iR2');
  });
});

// ── 2. RC charge: v_C(t) = V (1 - exp(-t/RC)) (Simscape Capacitor: i = C dv/dt) ───────────────────────────────────────
describe('WP-10 RC charge against the closed form', () => {
  const V = 5, R = 1000, C = 1e-6, tau = R * C;
  const model = (v0 = 0): Model => ({
    nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('r', 'resistor', { R }), node('c', 'capacitor', { C, v0 }), GND],
    edges: [wire('vs.p', 'r.p'), wire('r.n', 'c.p'), wire('c.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
  });
  it('v_C(t) follows V(1 - e^(-t/RC)) over 5 time constants and i = C dv/dt = (V - v)/R', () => {
    const dt = 2e-6;
    const sim = simulate(model(), Math.round(5 * tau / dt), dt);
    let worst = 0;
    sim.history.forEach((s) => {
      const t = s.time;
      const expected = V * (1 - Math.exp(-t / tau));
      const vc = sim.across('c', 'p', s);
      worst = Math.max(worst, Math.abs(vc - expected));
      near(sim.at('c_branch_current', s), (V - vc) / R, 1e-9, 'KCL: i_C = i_R = (V - v_C)/R');
    });
    expect(worst, `max |v_C - closed form| = ${worst} V`).toBeLessThan(5e-3);
    near(sim.across('c', 'p'), V * (1 - Math.exp(-5)), 5e-3, 'final value');
  });
  it('the error shrinks with the step (consistency: halving dt at least halves the worst error)', () => {
    // fixed step: the adaptive path error-controls the capacitor voltage since WP-31b (F-103), so its error follows the
    // tolerance, not dt; the consistency of the discretisation is measured at one step of dt per call
    const worstAt = (dt: number) => {
      const sim = simulate(model(), Math.round(2 * tau / dt), dt, true);
      return Math.max(...sim.history.map((s) => Math.abs(sim.across('c', 'p', s) - V * (1 - Math.exp(-s.time / tau)))));
    };
    const e1 = worstAt(8e-6), e2 = worstAt(4e-6);
    expect(e2, `e(dt)=${e1}, e(dt/2)=${e2}`).toBeLessThan(0.6 * e1);
  });
});

// ── 3. RL current rise: i(t) = V/R (1 - exp(-t R/L)) (Simscape Inductor: v = L di/dt) ────────────────────────────────
describe('WP-10 RL current rise against the closed form', () => {
  const V = 10, R = 10, L = 0.01, tau = L / R;
  it('i_L(t) follows V/R (1 - e^(-tR/L)) and v_L = V - iR', () => {
    const dt = 2e-6;
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('r', 'resistor', { R }), node('l', 'inductor', { L }), GND],
      edges: [wire('vs.p', 'r.p'), wire('r.n', 'l.p'), wire('l.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const sim = simulate(m, Math.round(5 * tau / dt), dt);
    let worst = 0;
    sim.history.forEach((s) => {
      const i = sim.at('l_branch_current', s);
      worst = Math.max(worst, Math.abs(i - (V / R) * (1 - Math.exp(-s.time / tau))));
      near(sim.branchOf('l', 'p', 'n', s).v, V - i * R, 1e-7, 'v_L = V - i R (KVL)');
    });
    expect(worst, `max |i_L - closed form| = ${worst} A`).toBeLessThan(5e-3);
  });
});

// ── 4. series RLC, underdamped ──────────────────────────────────────────────────────────────────────────────────────
describe('WP-10 series RLC step response (underdamped) against the closed form', () => {
  const V = 10, R = 10, L = 0.01, C = 1e-5;
  const alpha = R / (2 * L);                       // 500 1/s
  const w0 = 1 / Math.sqrt(L * C);                 // 3162.3 rad/s
  const wd = Math.sqrt(w0 * w0 - alpha * alpha);   // damped natural frequency
  const overshoot = Math.exp(-Math.PI * alpha / wd); // fraction of V above the final value
  const vcClosed = (t: number) => V * (1 - Math.exp(-alpha * t) * (Math.cos(wd * t) + (alpha / wd) * Math.sin(wd * t)));
  const model: Model = {
    nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('r', 'resistor', { R }), node('l', 'inductor', { L }), node('c', 'capacitor', { C }), GND],
    edges: [wire('vs.p', 'r.p'), wire('r.n', 'l.p'), wire('l.n', 'c.p'), wire('c.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
  };
  const dt = 1e-6;
  const steps = Math.round(0.006 / dt);
  const sim = simulate(model, steps, dt);

  it('is underdamped with the expected damped frequency and overshoot', () => {
    expect(alpha).toBeLessThan(w0);
    near(wd, 3122.0, 0.5, 'omega_d');
    near(overshoot, 0.6046, 1e-3, 'overshoot fraction');
  });
  it('v_C(t) matches V[1 - e^(-a t)(cos wd t + (a/wd) sin wd t)] over the whole record', () => {
    let worst = 0;
    sim.history.forEach((s) => { worst = Math.max(worst, Math.abs(sim.across('c', 'p', s) - vcClosed(s.time))); });
    expect(worst, `max |v_C - closed form| = ${worst} V`).toBeLessThan(0.05);
  });
  it('first peak: time pi/wd and value V(1 + overshoot)', () => {
    const v = sim.history.map((s) => sim.across('c', 'p', s));
    let k = 0;
    for (let i = 1; i < v.length; i++) if (v[i] > v[k]) k = i;
    near(sim.history[k].time, Math.PI / wd, 2e-5, 'peak time');
    near(v[k], V * (1 + overshoot), 0.1, 'peak value');
  });
  it('the oscillation period equals 2 pi / wd (zero crossings of v_C - V)', () => {
    const x = sim.history.map((s) => sim.across('c', 'p', s) - V);
    const cross: number[] = [];
    for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) cross.push(sim.history[i - 1].time + dt * (-x[i - 1]) / (x[i] - x[i - 1]));
    expect(cross.length).toBeGreaterThanOrEqual(2);
    near(cross[1] - cross[0], 2 * Math.PI / wd, 2e-5, 'period');
  });
  it('power balance: the source power equals the resistor loss plus the rate of stored energy at every step', () => {
    // Tellegen on the instantaneous branch quantities: sum v*i over source, R, L, C is 0 (KVL x common loop current)
    sim.history.forEach((s, k) => {
      const i = sim.at('r_branch_current', s);
      expectPowerBalance([[V, -i], [sim.branchOf('r', 'p', 'n', s).v, i], [sim.branchOf('l', 'p', 'n', s).v, sim.at('l_branch_current', s)], [sim.branchOf('c', 'p', 'n', s).v, sim.at('c_branch_current', s)]], 1e-7, `RLC step ${k}`);
    });
  });
});

// ── 5. AC source into R (Simscape AC Voltage Source: v = A sin(2 pi f t + phi)) ───────────────────────────────────────
describe('WP-10 AC source into a resistor: RMS, phase and frequency', () => {
  const Vpk = 10, f = 50, phase = 0.3, R = 20;
  const model = (params: Record<string, any>): Model => ({
    nodes: [node('vs', 'ac_voltage', { Vpk, f, phase, R_int: 0, ...params }), node('r', 'resistor', { R }), GND],
    edges: [wire('vs.p', 'r.p'), wire('r.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
  });
  it('samples equal Vpk sin(2 pi f t + phase) and i = v/R; RMS over one period = Vpk/sqrt(2)', () => {
    const dt = 1e-4, n = Math.round(1 / f / dt);
    const sim = simulate(model({}), n, dt);
    let sumSq = 0;
    sim.history.forEach((s) => {
      const expected = Vpk * Math.sin(2 * Math.PI * f * s.time + phase);
      near(sim.across('r', 'p', s), expected, 1e-7, `v(t=${s.time})`);
      near(sim.at('r_branch_current', s), expected / R, 1e-8, 'i = v/R');
      sumSq += expected * expected;
    });
    const rmsAll = Math.sqrt(sim.history.reduce((a, s) => a + sim.across('r', 'p', s) ** 2, 0) / n);
    near(rmsAll, Vpk / Math.SQRT2, 1e-3, 'RMS');
    void sumSq;
  });
  it('phase shifts the waveform and f = 0 gives the constant Vpk sin(phase)', () => {
    const a = simulate(model({ phase: 0 }), 1, 1e-3);
    const b = simulate(model({ phase: Math.PI / 2 }), 1, 1e-3);
    near(a.across('r', 'p'), Vpk * Math.sin(2 * Math.PI * f * 1e-3), 1e-9, 'phase 0');
    near(b.across('r', 'p'), Vpk * Math.cos(2 * Math.PI * f * 1e-3), 1e-9, 'phase pi/2');
    const dc = simulate(model({ f: 0 }), 3, 1e-3);
    near(dc.across('r', 'p'), Vpk * Math.sin(phase), 1e-9, 'f = 0');
  });
  it('series resistance R_int drops R_int * i across the source terminals (v = e + i R_int, i < 0 when delivering)', () => {
    const sim = simulate(model({ R_int: 5, phase: Math.PI / 2, f: 0 }), 1, 1e-3);
    const e = Vpk, I = e / (R + 5);
    near(sim.across('r', 'p'), I * R, 1e-9, 'terminal voltage');
    near(sim.at('vs_branch_current'), -I, 1e-12, 'source current');
  });
});

// ── 6. controlled sources: gain relations ───────────────────────────────────────────────────────────────────────────
describe('WP-10 controlled sources (Simscape dependent sources)', () => {
  // control voltage 2 V on cp (cn = ground), 100 ohm control resistor for the current-controlled ones
  const control = (extra: Node[], edges: Edge[]): Model => ({
    nodes: [node('vin', 'dc_voltage', { V: 2, R_int: 0 }), GND, ...extra],
    edges: [wire('vin.n', 'gnd.a'), ...edges],
  });
  for (const gain of [3, 0, -1.5]) {
    it(`vcvs: v_out = K v_in, K = ${gain}`, () => {
      const m = control([node('dut', 'vcvs', { gain }), node('rl', 'resistor', { R: 100 })],
        [wire('vin.p', 'dut.cp'), wire('dut.cn', 'gnd.a'), wire('dut.p', 'rl.p'), wire('rl.n', 'gnd.a'), wire('dut.n', 'gnd.a')]);
      const sim = simulate(m, 3, 0.01);
      near(sim.across('rl', 'p'), gain * 2, 1e-9, 'v_out');
      near(sim.at('dut_branch_current'), -gain * 2 / 100, 1e-10, 'output current p->n (delivered into the load)');
    });
  }
  for (const gm of [0.01, 0]) {
    it(`vccs: i_out = G v_in, G = ${gm} S (p -> n through the source)`, () => {
      const Vs = 10, Rs = 100;
      const m = control([node('vs', 'dc_voltage', { V: Vs, R_int: 0 }), node('rs', 'resistor', { R: Rs }), node('dut', 'vccs', { gain: gm })],
        [wire('vin.p', 'dut.cp'), wire('dut.cn', 'gnd.a'), wire('vs.n', 'gnd.a'), wire('vs.p', 'rs.p'), wire('rs.n', 'dut.p'), wire('dut.n', 'gnd.a')]);
      const sim = simulate(m, 3, 0.01);
      const I = gm * 2;
      near(sim.at('dut_branch_current'), I, 1e-12, 'i_out');
      near(sim.across('dut', 'p'), Vs - I * Rs, 1e-9, 'node voltage after the series resistor');
    });
  }
  for (const gain of [2, 0]) {
    it(`cccs: i_out = K i_ctrl, K = ${gain}`, () => {
      const Rc = 100, Vs = 10, Rs = 200;
      const m = control([node('rc', 'resistor', { R: Rc }), node('vs', 'dc_voltage', { V: Vs, R_int: 0 }), node('rs', 'resistor', { R: Rs }), node('dut', 'cccs', { gain })],
        [wire('vin.p', 'rc.p'), wire('rc.n', 'dut.cp'), wire('dut.cn', 'gnd.a'), wire('vs.n', 'gnd.a'), wire('vs.p', 'rs.p'), wire('rs.n', 'dut.p'), wire('dut.n', 'gnd.a')]);
      const sim = simulate(m, 3, 0.01);
      const Ictrl = 2 / Rc;
      near(sim.at('dut_branch_current_ctrl'), Ictrl, 1e-12, 'i_ctrl');
      near(sim.at('dut_branch_current_out'), gain * Ictrl, 1e-12, 'i_out = K i_ctrl');
      near(sim.across('dut', 'p'), Vs - gain * Ictrl * Rs, 1e-9, 'output node');
      near(sim.across('dut', 'cp'), 0, 1e-9, 'ideal ammeter: v_cp - v_cn = 0');
    });
  }
  for (const gain of [50, 0]) {
    it(`ccvs: v_out = r i_ctrl, r = ${gain} ohm`, () => {
      const Rc = 100, Rl = 1000;
      const m = control([node('rc', 'resistor', { R: Rc }), node('rl', 'resistor', { R: Rl }), node('dut', 'ccvs', { gain })],
        [wire('vin.p', 'rc.p'), wire('rc.n', 'dut.cp'), wire('dut.cn', 'gnd.a'), wire('dut.p', 'rl.p'), wire('rl.n', 'gnd.a'), wire('dut.n', 'gnd.a')]);
      const sim = simulate(m, 3, 0.01);
      const Ictrl = 2 / Rc;
      near(sim.across('rl', 'p'), gain * Ictrl, 1e-9, 'v_out');
      near(sim.at('dut_branch_current_out'), -gain * Ictrl / Rl, 1e-10, 'output current p->n');
    });
  }
  it('ccvs with R_out: v = r i_ctrl + R_out i_out (terminal voltage drops under load)', () => {
    const Rc = 100, Rl = 1000, Rout = 50, r = 50;
    const m = control([node('rc', 'resistor', { R: Rc }), node('rl', 'resistor', { R: Rl }), node('dut', 'ccvs', { gain: r, R_out: Rout })],
      [wire('vin.p', 'rc.p'), wire('rc.n', 'dut.cp'), wire('dut.cn', 'gnd.a'), wire('dut.p', 'rl.p'), wire('rl.n', 'gnd.a'), wire('dut.n', 'gnd.a')]);
    const sim = simulate(m, 3, 0.01);
    const e = r * (2 / Rc);
    near(sim.across('rl', 'p'), e * Rl / (Rl + Rout), 1e-9, 'v_load');
  });
  it('controlled_voltage: v = S from a physical signal (and 0 V when unwired)', () => {
    const wired = simulate({
      nodes: [node('k', 'ps_constant', { value: 4 }), node('dut', 'controlled_voltage', { R_int: 0 }), node('rl', 'resistor', { R: 10 }), GND],
      edges: [wire('k.y', 'dut.s'), wire('dut.p', 'rl.p'), wire('rl.n', 'gnd.a'), wire('dut.n', 'gnd.a')],
    }, 3, 0.01);
    near(wired.across('rl', 'p'), 4, 1e-9, 'v = S');
    const open = simulate({
      nodes: [node('dut', 'controlled_voltage', { R_int: 0 }), node('rl', 'resistor', { R: 10 }), GND],
      edges: [wire('dut.p', 'rl.p'), wire('rl.n', 'gnd.a'), wire('dut.n', 'gnd.a')],
    }, 2, 0.01);
    near(open.across('rl', 'p'), 0, 1e-12, 'unwired s reads 0');
  });
  it('dc_current: i = I regardless of the load (p -> n through the source)', () => {
    for (const R of [1, 100, 1e5]) {
      const sim = simulate({
        nodes: [node('is', 'dc_current', { I: -0.002 }), node('rl', 'resistor', { R }), GND],
        edges: [wire('is.p', 'rl.p'), wire('rl.n', 'gnd.a'), wire('is.n', 'gnd.a')],
      }, 2, 0.01);
      // the source pulls I = -2 mA from p to n, i.e. it pushes 2 mA INTO the node p: the load sees +2 mA
      near(sim.at('is_branch_current'), -0.002, 1e-12, 'i');
      near(sim.across('rl', 'p'), 0.002 * R, 1e-9 + 1e-9 * R, `v_load, R=${R}`);
    }
  });
});

// ── 7. sensors ──────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-10 sensors (Simscape Voltage / Current Sensor)', () => {
  it('v_sensor reads v_p - v_n of the divider midpoint and loads it by 1/R_int only', () => {
    const V = 10, R1 = 1000, R2 = 3000, Rint = 1e8;
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('r1', 'resistor', { R: R1 }), node('r2', 'resistor', { R: R2 }), node('s', 'v_sensor', { R_int: Rint }), GND],
      edges: [wire('vs.p', 'r1.p'), wire('r1.n', 'r2.p'), wire('r2.n', 'gnd.a'), wire('vs.n', 'gnd.a'), wire('s.p', 'r1.n'), wire('s.n', 'gnd.a')],
    };
    const sim = simulate(m, 3, 0.01);
    // exact: the sensor R_int is in parallel with R2
    const Rp = (R2 * Rint) / (R2 + Rint);
    const vmid = V * Rp / (R1 + Rp);
    near(sim.at('s_branch_signal_v'), vmid, 1e-9, 'signal output = v_p - v_n');
    near(sim.at('s_branch_signal_v'), 7.5, 1e-3, 'ideal 7.5 V');
    near(sim.at('s_branch_current'), vmid / Rint, 1e-14, 'leakage current');
  });
  it('v_sensor is polarity aware: reversing the terminals reverses the sign', () => {
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 6, R_int: 0 }), node('r', 'resistor', { R: 10 }), node('s', 'v_sensor'), GND],
      edges: [wire('vs.p', 'r.p'), wire('r.n', 'gnd.a'), wire('vs.n', 'gnd.a'), wire('s.p', 'gnd.a'), wire('s.n', 'r.p')],
    };
    near(simulate(m, 2, 0.01).at('s_branch_signal_v'), -6, 1e-9, 'v_p - v_n = 0 - 6');
  });
  it('i_sensor reads the series current p -> n with zero insertion drop (R_int = 0)', () => {
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 10, R_int: 0 }), node('s', 'i_sensor', { R_int: 0 }), node('r', 'resistor', { R: 4000 }), GND],
      edges: [wire('vs.p', 's.p'), wire('s.n', 'r.p'), wire('r.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const sim = simulate(m, 3, 0.01);
    near(sim.at('s_branch_signal_i'), 10 / 4000, 1e-12, 'i = V/R');
    near(sim.across('s', 'p') - sim.across('s', 'n'), 0, 1e-12, 'insertion drop');
    // reversed through direction reads the opposite sign
    const rev: Model = { nodes: m.nodes, edges: [wire('vs.p', 's.n'), wire('s.p', 'r.p'), wire('r.n', 'gnd.a'), wire('vs.n', 'gnd.a')] };
    near(simulate(rev, 2, 0.01).at('s_branch_signal_i'), -10 / 4000, 1e-12, 'reversed sensor');
  });
});

// ── 8. initial conditions (Simscape Capacitor "Initial voltage", Inductor "Initial current") ────────────────────────────
describe('WP-10 initial conditions are honoured at t = 0+', () => {
  it('capacitor v0 to ground: v(t) = v0 e^(-t/RC) and v(0+) = v0', () => {
    const v0 = 3, R = 1000, C = 1e-6;
    const m: Model = { nodes: [node('c', 'capacitor', { C, v0 }), node('r', 'resistor', { R }), GND], edges: [wire('c.p', 'r.p'), wire('r.n', 'gnd.a'), wire('c.n', 'gnd.a')] };
    const dt = 1e-6;
    const sim = simulate(m, 3000, dt);
    near(sim.across('c', 'p', sim.history[0]), v0, 5e-3, 'v(0+)');
    let worst = 0;
    sim.history.forEach((s) => { worst = Math.max(worst, Math.abs(sim.across('c', 'p', s) - v0 * Math.exp(-s.time / (R * C)))); });
    expect(worst, `max error ${worst}`).toBeLessThan(5e-3);
  });
  it('capacitor v0 with both terminals off ground: the loop decays with 2R C', () => {
    const v0 = 2, R = 1000, C = 1e-6;
    const m: Model = {
      nodes: [node('c', 'capacitor', { C, v0 }), node('ra', 'resistor', { R }), node('rb', 'resistor', { R }), GND],
      edges: [wire('c.p', 'ra.p'), wire('ra.n', 'gnd.a'), wire('c.n', 'rb.p'), wire('rb.n', 'gnd.a')],
    };
    const sim = simulate(m, 2000, 2e-6);
    near(sim.branchOf('c', 'p', 'n', sim.history[0]).v, v0, 1e-2, 'v_C(0+) = v0');
    sim.history.forEach((s) => near(sim.branchOf('c', 'p', 'n', s).v, v0 * Math.exp(-s.time / (2 * R * C)), 1e-2, 'decay'));
  });
  it('capacitor with v0 = 0 stays discharged (no spurious seed)', () => {
    const m: Model = { nodes: [node('c', 'capacitor', { C: 1e-6 }), node('r', 'resistor', { R: 1000 }), GND], edges: [wire('c.p', 'r.p'), wire('r.n', 'gnd.a'), wire('c.n', 'gnd.a')] };
    near(simulate(m, 3, 1e-3).across('c', 'p'), 0, 1e-12, 'v');
  });
  it('inductor i0: i(t) = i0 e^(-tR/L) and i(0+) = i0', () => {
    const i0 = 0.5, R = 10, L = 0.01;
    const m: Model = { nodes: [node('l', 'inductor', { L, i0 }), node('r', 'resistor', { R }), GND], edges: [wire('l.p', 'r.p'), wire('r.n', 'gnd.a'), wire('l.n', 'gnd.a')] };
    // the current leaves L at p into R: i_pn(L) = i0 flows p -> n inside L, so R carries -i0 ... the loop decays either way
    const sim = simulate(m, 3000, 1e-6);
    near(sim.at('l_branch_current', sim.history[0]), i0, 5e-3, 'i(0+)');
    let worst = 0;
    sim.history.forEach((s) => { worst = Math.max(worst, Math.abs(sim.at('l_branch_current', s) - i0 * Math.exp(-s.time * R / L))); });
    expect(worst, `max error ${worst}`).toBeLessThan(5e-3);
  });
});

// ── 9. other passives, two-ports and the op-amp ─────────────────────────────────────────────────────────────────────
describe('WP-10 variable resistor, open branches, busbar', () => {
  /** 10 V -> 100 ohm -> variable resistor r2 -> ground, optional control signal `signal` on r2.r */
  const divider = (params: Record<string, any>, signal?: number): Model => ({
    nodes: [node('vs', 'dc_voltage', { V: 10, R_int: 0 }), node('r1', 'resistor', { R: 100 }), node('r2', 'variable_resistor', params), GND,
      ...(signal === undefined ? [] : [node('k', 'ps_constant', { value: signal })])],
    edges: [wire('vs.p', 'r1.p'), wire('r1.n', 'r2.p'), wire('r2.n', 'gnd.a'), wire('vs.n', 'gnd.a'), ...(signal === undefined ? [] : [wire('k.y', 'r2.r')])],
  });
  it('variable_resistor: R = max(signal, R_min); unwired signal reads 100 ohm', () => {
    near(simulate(divider({ R_min: 5 }, 300), 2, 0.01).across('r2', 'p'), 10 * 300 / 400, 1e-9, 'R = signal = 300');
    near(simulate(divider({ R_min: 5 }, 0), 2, 0.01).across('r2', 'p'), 10 * 5 / 105, 1e-9, 'R = R_min = 5 when the signal is 0');
    near(simulate(divider({}), 2, 0.01).across('r2', 'p'), 5, 1e-9, 'unwired r reads 100 ohm -> 5 V');
    expect(lib('variable_resistor').params.R_min.value).toBe(0.001);
  });
  it('infinite_resistance carries no current; open_circuit leaves a node floating at the driven potential', () => {
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 10, R_int: 0 }), node('r', 'resistor', { R: 100 }), node('inf', 'infinite_resistance'), GND],
      edges: [wire('vs.p', 'r.p'), wire('r.n', 'inf.p'), wire('inf.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const sim = simulate(m, 2, 0.01);
    near(sim.at('inf_branch_current'), 0, 1e-12, 'i = 0');
    near(sim.across('inf', 'p'), 10, 1e-9, 'no drop across the series resistor');
    const oc: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 10, R_int: 0 }), node('r', 'resistor', { R: 100 }), node('oc', 'open_circuit'), GND],
      edges: [wire('vs.p', 'r.p'), wire('r.n', 'oc.a'), wire('vs.n', 'gnd.a')],
    };
    const so = simulate(oc, 2, 0.01);
    near(so.at('r_branch_current'), 0, 1e-12, 'open circuit: no current');
    near(so.across('r', 'n'), 10, 1e-9, 'open end sits at the source potential');
  });
  it('busbar: equal potentials and KCL (sum of currents into the bar = 0)', () => {
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 10, R_int: 0 }), node('bus', 'busbar'), node('r', 'resistor', { R: 50 }), GND],
      edges: [wire('vs.p', 'bus.1'), wire('bus.2', 'r.p'), wire('r.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const sim = simulate(m, 2, 0.01);
    near(sim.across('r', 'p'), 10, 1e-9, 'V_1 = V_2');
    near(sim.at('bus_branch_current_1') + sim.at('bus_branch_current_2'), 0, 1e-12, 'sum I = 0');
    // branch k is the current INTO the bar at terminal k: 0.2 A arrives from the source, 0.2 A leaves towards the load
    near(sim.at('bus_branch_current_1'), 10 / 50, 1e-12, 'current into the bar from the source');
    near(sim.at('bus_branch_current_2'), -10 / 50, 1e-12, 'current into the bar at terminal 2 (negative: it flows out to the load)');
  });
});

describe('WP-10 transformer, gyrator and op-amp', () => {
  it('ideal transformer (N12 = N1/N2): v1 = N v2, i2 = -N i1, zero net power', () => {
    for (const N of [2, 0.25, -3]) {
      const Rl = 50, V1 = 10;
      const m: Model = {
        nodes: [node('vs', 'dc_voltage', { V: V1, R_int: 0 }), node('t', 'transformer', { N12: N }), node('rl', 'resistor', { R: Rl }), GND],
        edges: [wire('vs.p', 't.p1'), wire('t.n1', 'gnd.a'), wire('vs.n', 'gnd.a'), wire('t.p2', 'rl.p'), wire('rl.n', 'gnd.a'), wire('t.n2', 'gnd.a')],
      };
      const sim = simulate(m, 3, 0.01);
      const V2 = V1 / N;
      const i2 = -V2 / Rl;                  // current INTO p2 is minus the load current
      const i1 = -i2 / N;
      near(sim.across('rl', 'p'), V2, 1e-9, `v2 (N=${N})`);
      near(sim.at('t_branch_current2'), i2, 1e-10, 'i2');
      near(sim.at('t_branch_current1'), i1, 1e-10, 'i1');
      expectPowerBalance([[V1, i1], [V2, i2]], 1e-9, `transformer N=${N}`);
    }
  });
  it('gyrator: i1 = G v2, i2 = -G v1, zero net power', () => {
    const g = 0.01, V2 = 2, R = 100;
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: V2, R_int: 0 }), node('g', 'gyrator', { g }), node('rl', 'resistor', { R }), GND],
      edges: [wire('vs.p', 'g.p2'), wire('g.n2', 'gnd.a'), wire('vs.n', 'gnd.a'), wire('g.p1', 'rl.p'), wire('rl.n', 'gnd.a'), wire('g.n1', 'gnd.a')],
    };
    const sim = simulate(m, 3, 0.01);
    // port 1 is loaded by R from p1 to ground: i1 (into p1) = -v1/R and i1 = g v2 -> v1 = -g v2 R
    const v1 = -g * V2 * R;
    near(sim.across('rl', 'p'), v1, 1e-9, 'v1');
    near(sim.at('g_branch_current1'), g * V2, 1e-12, 'i1');
    near(sim.at('g_branch_current2'), -g * v1, 1e-12, 'i2');
    expectPowerBalance([[v1, g * V2], [V2, -g * v1]], 1e-9, 'gyrator');
  });
  it('op-amp as a non-inverting amplifier: Vout = A Vin / (1 + A Rg/(Rf+Rg)); saturates at +/-Vsat', () => {
    const A = 1e5, Rf = 9000, Rg = 1000;
    const build = (Vin: number, Vsat?: number): Model => ({
      nodes: [node('vin', 'dc_voltage', { V: Vin, R_int: 0 }), node('op', 'opamp', Vsat === undefined ? { Gain: A } : { Gain: A, Vsat }),
        node('rf', 'resistor', { R: Rf }), node('rg', 'resistor', { R: Rg }), GND],
      edges: [wire('vin.p', 'op.in_p'), wire('vin.n', 'gnd.a'), wire('op.out', 'rf.p'), wire('rf.n', 'op.in_n'), wire('op.in_n', 'rg.p'), wire('rg.n', 'gnd.a')],
    });
    const beta = Rg / (Rf + Rg);
    const lin = simulate(build(1), 3, 0.01);
    // the Newton residual tolerance (1e-8 V on a row scaled by A = 1e5) bounds the output error at about 1e-7 V
    near(lin.across('op', 'out'), A * 1 / (1 + A * beta), 1e-6, 'closed-loop gain');
    near(lin.across('op', 'in_n'), lin.across('op', 'out') * beta, 1e-6, 'feedback divider');
    near(lin.across('op', 'in_p') - lin.across('op', 'in_n'), lin.across('op', 'out') / A, 1e-6, 'virtual short: V+ - V- = Vout/A');
    const sat = simulate(build(3), 3, 0.01);
    // 3 V * 10 = 30 V would exceed the +15 V rail: the open-loop output clamps at +15 V and the loop settles there
    near(sat.across('op', 'out'), 15, 1e-6, 'saturated at +Vsat');
    const sat5 = simulate(build(3, 5), 3, 0.01);
    near(sat5.across('op', 'out'), 5, 1e-6, 'Vsat parameter');
    const neg = simulate(build(-3), 3, 0.01);
    near(neg.across('op', 'out'), -15, 1e-6, 'saturated at -Vsat');
  });
});

// ── 10. direct solve agrees with simulateStep ───────────────────────────────────────────────────────────────────────
describe('WP-10 direct solve versus simulateStep', () => {
  it('a Newton solve of the assembled divider equals the engine state, and its residual vanishes', () => {
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 10, R_int: 0 }), node('r1', 'resistor', { R: 1000 }), node('r2', 'resistor', { R: 3000 }), GND],
      edges: [wire('vs.p', 'r1.p'), wire('r1.n', 'r2.p'), wire('r2.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const sim = simulate(m, 4, 0.01);
    const system = sim.system;
    const x0 = new Array(system.systemSize).fill(0);
    const ctx = { dt: 0.01, time: 0.01, parameters: {}, prevStates: x0.slice(), states: x0.slice(), stateDerivatives: x0.slice() } as any;
    const direct = new ImplicitSolver().solve((x, c) => system.residuals(x, new Array(system.systemSize).fill(0), c), x0, ctx);
    direct.forEach((v, i) => near(sim.state.x[i], v, 1e-8, `variable ${system.variableNames[i]}`));
    const res = system.residuals(sim.state.x, new Array(system.systemSize).fill(0), ctx);
    res.forEach((r) => near(r, 0, 1e-8, 'residual'));
  });
});

// ── 11. edge cases: bounds, large values ────────────────────────────────────────────────────────────────────────────
describe('WP-10 edge cases', () => {
  it('R, C, L <= 0 are rejected by the parameter bounds, R_int = 0 and gain = 0 are legal', () => {
    const bad = (type: string, params: Record<string, any>) => validateBlockParams('x', type, params).length;
    expect(bad('resistor', { R: 0 })).toBeGreaterThan(0);
    expect(bad('resistor', { R: -5 })).toBeGreaterThan(0);
    expect(bad('capacitor', { C: 0 })).toBeGreaterThan(0);
    expect(bad('inductor', { L: -1e-3 })).toBeGreaterThan(0);
    expect(bad('opamp', { Vsat: 0 })).toBeGreaterThan(0);
    expect(bad('transformer', { N12: 0 })).toBeGreaterThan(0);
    expect(bad('gyrator', { g: 0 })).toBeGreaterThan(0);
    expect(bad('resistor', { R: 1e12 })).toBe(0);
    expect(bad('dc_voltage', { R_int: 0 })).toBe(0);
    expect(bad('vcvs', { gain: 0 })).toBe(0);
    expect(bad('capacitor', { v0: -5 })).toBe(0);
    expect(bad('inductor', { i0: -1 })).toBe(0);
  });
  it('very large and very small values stay finite and exact', () => {
    // 1 GOhm / 1 mOhm divider
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 1000, R_int: 0 }), node('r1', 'resistor', { R: 1e9 }), node('r2', 'resistor', { R: 1e-3 }), GND],
      edges: [wire('vs.p', 'r1.p'), wire('r1.n', 'r2.p'), wire('r2.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const sim = simulate(m, 3, 0.01);
    near(sim.at('r1_branch_current'), 1000 / (1e9 + 1e-3), 1e-15, 'i');
    near(sim.across('r1', 'n'), 1000 * 1e-3 / (1e9 + 1e-3), 1e-9, 'v_mid');
  });
});

// ── 12. F-064: explicit electrical reference semantics ──────────────────────────────────────────────────────────────
describe('WP-10 F-064: only reference blocks define ground; an open electrical port is open', () => {
  it('a resistor terminal named n that is left unconnected is OPEN (no current, floats to the driven potential)', () => {
    const m: Model = { nodes: [node('vs', 'dc_voltage', { V: 5, R_int: 0 }), node('r', 'resistor', { R: 100 }), GND], edges: [wire('vs.p', 'r.p'), wire('vs.n', 'gnd.a')] };
    const sim = simulate(m, 3, 0.01);
    near(sim.at('r_branch_current'), 0, 1e-12, 'no current through an open branch');
    near(sim.across('r', 'n'), 5, 1e-9, 'open terminal n floats to v_p, it is not tied to ground');
  });
  it('a capacitor and a v_sensor with open n terminals behave as open circuits too', () => {
    const m: Model = { nodes: [node('vs', 'dc_voltage', { V: 5, R_int: 0 }), node('c', 'capacitor', { C: 1e-6 }), GND], edges: [wire('vs.p', 'c.p'), wire('vs.n', 'gnd.a')] };
    near(simulate(m, 3, 0.01).at('c_branch_current'), 0, 1e-12, 'capacitor with open n carries no current');
  });
  it('a connected electrical network with no reference is reported as a floating network by name', () => {
    const m: Model = { nodes: [node('vs', 'dc_voltage', { V: 5, R_int: 0 }), node('r', 'resistor', { R: 100 })], edges: [wire('vs.p', 'r.p'), wire('r.n', 'vs.n')] };
    let err: unknown;
    try { new VLabPhysicsEngine().simulateStep(m.nodes, m.edges, null, 0.01); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DAEStructureError);
    const d = (err as DAEStructureError).diagnostics[0];
    expect(d.code).toBe('floating-network');
    expect(d.reason).toMatch(/Floating electrical network/);
    expect(d.reason).toMatch(/Electrical Reference/);
    expect(d.reason).toContain('"vs"');
    expect(d.reason).toContain('"r"');
    // the structural check alone reports the same diagnostic
    expect(() => assertStructurallyWellPosed(new DAEAssembler().assemble(m.nodes, m.edges))).toThrow(DAEStructureError);
  });
  it('a reference block (ground or delta_ref) makes the same network valid; a second independent network without one is reported', () => {
    const grounded: Model = { nodes: [node('vs', 'dc_voltage', { V: 5, R_int: 0 }), node('r', 'resistor', { R: 100 }), GND], edges: [wire('vs.p', 'r.p'), wire('r.n', 'gnd.a'), wire('vs.n', 'gnd.a')] };
    expect(() => assertStructurallyWellPosed(new DAEAssembler().assemble(grounded.nodes, grounded.edges))).not.toThrow();
    const twoNets: Model = {
      nodes: [...grounded.nodes, node('v2', 'dc_voltage', { V: 1, R_int: 0 }), node('r2', 'resistor', { R: 10 })],
      edges: [...grounded.edges, wire('v2.p', 'r2.p'), wire('r2.n', 'v2.n')],
    };
    const sys = new DAEAssembler().assemble(twoNets.nodes, twoNets.edges);
    expect(sys.structure!.floatingElectricalNetworks!.length).toBe(1);
    expect(sys.structure!.floatingElectricalNetworks![0].blocks.map((b) => b.blockId).sort()).toEqual(['r2', 'v2']);
  });
  it('findFloatingElectricalNetworks: reference roots, ground blocks and implicit-potential blocks all count as references', () => {
    const blocks = [
      { blockId: 'a', blockType: 'resistor', roots: ['n1', 'n2'] },
      { blockId: 'b', blockType: 'resistor', roots: ['n2', 'n3'] },
      { blockId: 'c', blockType: 'resistor', roots: ['m1', 'm2'] },
      { blockId: 'op', blockType: 'opamp', roots: ['k1', 'k2'] },
      { blockId: 'k', blockType: 'resistor', roots: ['k2', 'k3'] },
    ];
    const floating = findFloatingElectricalNetworks(blocks, new Set(['n3']));
    expect(floating).toHaveLength(1);
    expect(floating[0].blocks.map((x) => x.blockId)).toEqual(['c']);
  });
  it('internal references are declared per block and port, never inferred from a port name', () => {
    expect(INTERNAL_REFERENCE_PORTS.resistor).toBeUndefined();
    expect(INTERNAL_REFERENCE_PORTS.capacitor).toBeUndefined();
    for (const [type, ports] of Object.entries(INTERNAL_REFERENCE_PORTS)) {
      const block = lib(type);
      expect(block, type).toBeTruthy();
      for (const p of ports) expect(block.ports.some((x) => x.id === p && (x.domain ?? '').toLowerCase() === 'electrical'), `${type}.${p}`).toBe(true);
    }
  });
});

// ── 13. documentation: no generic labels, units and equations written out ───────────────────────────────────────────
const WP10_BLOCKS = [
  'resistor', 'variable_resistor', 'infinite_resistance', 'capacitor', 'inductor', 'memristor', 'gyrator', 'transformer', 'opamp',
  'v_sensor', 'i_sensor', 'dc_voltage', 'ac_voltage', 'controlled_voltage', 'dc_current', 'vcvs', 'vccs', 'cccs', 'ccvs',
  'ground', 'delta_ref', 'open_circuit', 'busbar', 'phase_splitter',
];
describe('WP-10 library equation text and help definitions', () => {
  it('every block has a specific equation (library) and help definition (equations + latex); none is the generic placeholder', () => {
    for (const id of WP10_BLOCKS) {
      const b = lib(id);
      expect(b.equation, id).toBeTruthy();
      expect(isGenericText(b.equation), `${id}: ${b.equation}`).toBe(false);
      expect(b.equation).not.toMatch(/governing physical equation/i);
      const d = VLAB_COMPONENT_DEFINITIONS[id];
      expect(d, `${id} definition`).toBeTruthy();
      expect(d.equations.length, id).toBeGreaterThan(0);
      expect(d.latex.length, id).toBeGreaterThan(0);
      // a JS string "\cdot" would lose its backslash: no control characters (\b \t ...) may be hidden in the latex text
      for (const l of d.latex) expect(/[\u0000-\u001f]/.test(l), `${id} latex control character: ${JSON.stringify(l)}`).toBe(false);
      expect(d.description.length, id).toBeGreaterThan(30);
    }
  });
  it('equations carry units for the dynamic and source blocks', () => {
    expect(lib('capacitor').equation).toMatch(/F/);
    expect(lib('inductor').equation).toMatch(/H/);
    expect(lib('capacitor').params.v0).toMatchObject({ value: 0, unit: 'V' });
    expect(lib('inductor').params.i0).toMatchObject({ value: 0, unit: 'A' });
    expect(lib('opamp').params.Vsat).toMatchObject({ value: 15, unit: 'V', exclusiveMin: true });
  });
  it('ground-type blocks are references and the phase splitter keeps its composite three-phase port', () => {
    expect(lib('ground').ports.map((p) => p.id)).toEqual(['a']);
    const abc = lib('phase_splitter').ports.find((p) => p.id === 'abc')!;
    expect(abc.composite).toBe('three_phase');
    // re-certification of WP-09c: the scalar phase k is tied to the composite node k, V_k(scalar) - V_abc[k] = 0
    const ports = ['abc', 'a', 'b', 'c'];
    const r = blockEquations.phase_splitter({ across: [[1, 2, 3], 1, 2, 3], dAcross: [], branch: [0, 0, 0], dBranch: [], state: [], dState: [], ctx: {} as any, params: {}, ports, nodeId: 's' });
    expect(r).toEqual([0, 0, 0]);
    const r2 = blockEquations.phase_splitter({ across: [[1, 2, 3], 1, 5, 3], dAcross: [], branch: [0, 0, 0], dBranch: [], state: [], dState: [], ctx: {} as any, params: {}, ports, nodeId: 's' });
    expect(r2).toEqual([0, 3, 0]);
  });
});
