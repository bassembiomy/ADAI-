import { afterAll, describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { ImplicitSolver } from '../ImplicitSolver';
import { ddtVector } from '../vlabDiscretization';
import { validateTopology } from '../vlabTopologyValidation';
import { getVLabSignalInfo } from '../../../utils/scopeUtils';

/**
 * WP-30: CROSS-DOMAIN connected reference models (user section 12 "Connected-model tests" / "End-to-end engine tests").
 *
 * Every model is built from real library blocks, wired through exact port ids, accepted by the pre-simulation topology validation
 * (validateTopology: domains, signal direction, required ports) and run for many steps through VLabPhysicsEngine.simulateStep (the
 * engine's own topology validation stays ON). The reference of every model is written HERE from the published governing equations
 * named in the comment (closed form, or an RK4 integration of the stated linear / nonlinear ODE at a step 20-100x finer than the
 * engine step); nothing is read back from the code under test. Each model also checks finiteness, the energy / mass / power balance,
 * and the quantity / unit of its scope channels. Models 1 and 5 additionally compare a direct Newton solve of the assembled DAE
 * (BDF1 step, ImplicitSolver) with simulateStep at the same step.
 */

// ── model builders ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params, label: id } }) as Node;
let edgeCount = 0;
/** 'a.p' -> 'b.q' : source handle `p_s`, target handle `q_t` (the canvas handle form) */
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.'); const [sb, pb] = b.split('.');
  return { id: `w${edgeCount++}`, source: sa, sourceHandle: `${pa}_s`, target: sb, targetHandle: `${pb}_t` } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }

interface Sample { t: number; at: (name: string) => number; scope: (id: string, ch?: number) => number }
const sampleOf = (state: any): Sample => {
  const names: string[] = state.variableNames;
  const at = (name: string) => {
    const i = names.indexOf(name);
    if (i < 0) throw new Error(`no variable ${name}; have ${names.join(', ')}`);
    return state.x[i];
  };
  const scope = (id: string, ch = 1) => {
    const v = state.perScopeValues?.[id];
    if (typeof v === 'number') { if (ch !== 1) throw new Error(`scope ${id} has one channel`); return v; }
    const r = v?.[`in${ch}`];
    if (typeof r !== 'number') throw new Error(`scope ${id} channel ${ch} has no sample: ${JSON.stringify(v)}`);
    return r;
  };
  return { t: state.time, at, scope };
};

/** topology accepted (no unconnected required port, no domain / direction error), then `steps` simulateStep calls of `dt` */
function simulate(m: Model, steps: number, dt: number, probe?: (s: Sample, k: number) => void): { last: Sample; ms: number; state: any } {
  const report = validateTopology(m.nodes, m.edges);
  expect(report.diagnostics.map(d => d.reason)).toEqual([]);
  const engine = new VLabPhysicsEngine();
  engine.setStepBudget({ maxStepAttempts: 50000, wallClockMs: 240000 });
  let state: any = null;
  const t0 = Date.now();
  const err = console.error, warn = console.warn;
  const messages: string[] = [];
  console.error = (...a: unknown[]) => { messages.push(a.map(String).join(' ')); };
  console.warn = (...a: unknown[]) => { messages.push(a.map(String).join(' ')); };
  try {
    for (let k = 0; k < steps; k++) {
      state = engine.simulateStep(m.nodes, m.edges, state, dt); // a hard solver failure throws here
      if (!state.x.every(Number.isFinite)) throw new Error(`non-finite state at step ${k}`);
      if (probe) probe(sampleOf(state), k);
    }
  } finally { console.error = err; console.warn = warn; }
  // no Newton convergence failure was absorbed on the way (the engine reports those, then accepts a best-effort state)
  expect(messages.filter(s => /converg|SDIRK/i.test(s))).toEqual([]);
  return { last: sampleOf(state), ms: Date.now() - t0, state };
}

/** classic RK4 of x' = f(t, x) from x0, returning the state at every multiple of dtOut up to n*dtOut (sub substeps each) */
function rk4(f: (t: number, x: number[]) => number[], x0: number[], dtOut: number, n: number, sub: number): number[][] {
  const out = [x0.slice()]; let x = x0.slice(); const h = dtOut / sub; let t = 0;
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < sub; j++) {
      const k1 = f(t, x);
      const k2 = f(t + h / 2, x.map((v, i) => v + (h / 2) * k1[i]));
      const k3 = f(t + h / 2, x.map((v, i) => v + (h / 2) * k2[i]));
      const k4 = f(t + h, x.map((v, i) => v + h * k3[i]));
      x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      t += h;
    }
    out.push(x.slice());
  }
  return out;
}

/** trapezoid integral of samples y on a uniform grid dt, from y0 at t = 0 */
const trapz = (y: number[], dt: number, y0 = 0) => y.reduce((acc, v, i) => acc + 0.5 * dt * (v + (i === 0 ? y0 : y[i - 1])), 0);
/** worst |sim - ref| over the run, relative to the peak |ref| */
const peakRelErr = (sim: number[], ref: number[]) => {
  const peak = Math.max(...ref.map(Math.abs));
  return Math.max(...sim.map((v, i) => Math.abs(v - ref[i]))) / peak;
};
const pct = (a: number, b: number) => (100 * Math.abs(a - b)) / Math.max(Math.abs(b), 1e-300);

/** a scope channel names the expected measured quantity and SI unit (wiring metadata, user section 9) */
function expectScopeUnit(m: Model, scopeId: string, channel: number, unit: string, quantity: RegExp) {
  const info = getVLabSignalInfo(scopeId, channel - 1, m.nodes, m.edges);
  expect(info.connected, `${scopeId}.in${channel} connected`).toBe(true);
  expect(info.unit, `${scopeId}.in${channel} unit`).toBe(unit);
  expect(info.quantity ?? '', `${scopeId}.in${channel} quantity`).toMatch(quantity);
}

/**
 * Direct solve versus simulateStep (user section 11): from the engine state after `warm` steps, one BDF1 step of h solved by
 * ImplicitSolver on the freshly assembled DAE (residuals(x, (x - x_k)/h)) must equal the engine's next simulateStep (forced to BDF1
 * by dropping its BDF2 history) at the same step.
 */
function directVersusEngine(m: Model, h: number, warm: number): number {
  const engine = new VLabPhysicsEngine();
  const err = console.error, warn = console.warn;
  console.error = () => {}; console.warn = () => {};
  try {
    let s: any = null;
    for (let k = 0; k < warm; k++) s = engine.simulateStep(m.nodes, m.edges, s, h);
    const system = new DAEAssembler().assemble(m.nodes, m.edges);
    expect(system.variableNames).toEqual(s.variableNames);
    const n = system.systemSize;
    const ctx: any = { dt: h, time: s.time + h, history: s.history, parameters: {}, prevStates: [...s.x], states: [...s.x], stateDerivatives: new Array(n).fill(0), order: 1 };
    const direct = new ImplicitSolver().solve((x, c) => system.residuals(x, ddtVector(x, c, system.firstOrderOnly), c), [...s.x], ctx);
    const next = engine.simulateStep(m.nodes, m.edges, { ...s, prevX: undefined, prevDt: undefined }, h);
    const res = system.residuals(next.x, ddtVector(next.x, ctx, system.firstOrderOnly), ctx);
    let worst = 0;
    direct.forEach((v: number, i: number) => { worst = Math.max(worst, Math.abs(v - next.x[i]) / Math.max(1, Math.abs(v))); });
    res.forEach((r: number) => expect(Math.abs(r)).toBeLessThan(1e-6));
    return worst;
  } finally { console.error = err; console.warn = warn; }
}

const REPORT: string[] = [];
const row = (model: string, reference: number, simulated: number, ms: number, what: string) =>
  REPORT.push(`${model.padEnd(34)} ${what.padEnd(26)} ref ${reference.toPrecision(7).padStart(13)}  sim ${simulated.toPrecision(7).padStart(13)}  err ${pct(simulated, reference).toExponential(2)} %  ${ms} ms`);
afterAll(() => { if (REPORT.length) console.log(`WP-30 connected models\n${REPORT.join('\n')}`); });

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. DC motor speed control: ps_constant -> ps_subtract -> ps_pi_ctrl -> controlled_voltage -> dc_motor -> inertia + damper,
//    rot_motion_sensor feedback. Governing equations (Simscape DC Motor, Krause ch. 3; Simulink PID Controller, parallel form):
//      La di/dt = u - Ra i - k w,   J dw/dt = k i - B w,   u = Kp e + I,  dI/dt = Ki e,  e = w_ref - w
//    -> characteristic polynomial La J s^3 + (Ra J + La B) s^2 + (Ra B + k^2 + Kp k) s + Ki k  (3rd order; with La -> 0 the
//       2nd-order model Ra J s^2 + (Ra B + k^2 + Kp k) s + Ki k). Zero steady-state error by the integral action: w(inf) = w_ref.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const M1 = { wref: 50, Kp: 1, Ki: 10, Ra: 1, La: 0.001, k: 0.1, Jm: 0.001, Bm: 0.001, Jl: 0.01, b: 0.02 };
const model1 = (): Model => ({
  nodes: [
    node('ref', 'ps_constant', { value: M1.wref }), node('sub', 'ps_subtract'),
    node('pi', 'ps_pi_ctrl', { Kp: M1.Kp, Ki: M1.Ki, limit: 1000, Kb: 0 }),
    node('cv', 'controlled_voltage', { R_int: 0 }),
    node('motor', 'dc_motor', { Ra: M1.Ra, La: M1.La, Ke: M1.k, J: M1.Jm, B: M1.Bm }),
    node('load', 'inertia', { J: M1.Jl, B: 0 }), node('damp', 'rot_damper', { b: M1.b }),
    node('sens', 'rot_motion_sensor'), node('gnd', 'ground'), node('rref', 'rot_ref'),
    node('scope', 'scope', { numSignals: 2 }),
  ],
  edges: [
    wire('ref.y', 'sub.u1'), wire('sens.w', 'sub.u2'), wire('sub.y', 'pi.e'), wire('pi.u', 'cv.s'),
    wire('cv.p', 'motor.p'), wire('motor.n', 'gnd.a'), wire('cv.n', 'gnd.a'),
    wire('motor.r', 'load.r'), wire('motor.r', 'damp.r'), wire('damp.c', 'rref.r'), wire('motor.r', 'sens.r'), wire('sens.c', 'rref.r'),
    wire('sens.w', 'scope.in1'), wire('pi.u', 'scope.in2'),
  ],
});

describe('WP-30 model 1: DC motor speed control (signal <-> electrical <-> rotational)', () => {
  it('closed-loop response = the analytic 3rd-order model; w(inf) = w_ref; energy balance; scope units', () => {
    const { wref, Kp, Ki, Ra, La, k } = M1; const J = M1.Jm + M1.Jl, B = M1.Bm + M1.b;
    const dt = 1e-3, steps = 1500;
    const ref = rk4((_t, [i, w, I]) => { const e = wref - w; const u = Kp * e + I; return [(u - Ra * i - k * w) / La, (k * i - B * w) / J, Ki * e]; }, [0, 0, 0], dt, steps, 50);
    const m = model1();
    const w: number[] = [], u: number[] = [], cur: number[] = [];
    const sim = simulate(m, steps, dt, (s) => { w.push(s.scope('scope', 1)); u.push(s.scope('scope', 2)); cur.push(s.at('motor_branch_current')); });
    const wRef = ref.slice(1).map(x => x[1]);
    expect(peakRelErr(w, wRef)).toBeLessThan(0.01);
    // poles: overshoot and peak time of the simulated response = those of the analytic model
    const peakSim = Math.max(...w), peakRef = Math.max(...wRef);
    const tpSim = (w.indexOf(peakSim) + 1) * dt, tpRef = (wRef.indexOf(peakRef) + 1) * dt;
    expect(Math.abs(peakSim - peakRef) / wref).toBeLessThan(0.005);
    expect(Math.abs(tpSim - tpRef)).toBeLessThanOrEqual(0.02 * tpRef + dt);
    // the 2nd-order (La -> 0, electrical pole at -Ra/La = -1000 1/s) closed loop W/W_ref = (b1 s + a0)/(s^2 + a1 s + a0),
    //   a1 = (Ra B + k^2 + Kp k)/(Ra J) = 2 zeta wn, a0 = Ki k/(Ra J) = wn^2, b1 = Kp k/(Ra J); step response
    //   w/w_ref = 1 - e^(-a1 t/2) [cos(wd t) + ((a1 - b1) - a1/2)/wd sin(wd t)],  wd = sqrt(a0 - a1^2/4)
    const a1 = (Ra * B + k * k + Kp * k) / (Ra * J), a0 = (Ki * k) / (Ra * J), b1 = (Kp * k) / (Ra * J);
    const wd = Math.sqrt(a0 - (a1 * a1) / 4);
    const w2 = w.map((_, j) => { const t = (j + 1) * dt; return wref * (1 - Math.exp(-a1 * t / 2) * (Math.cos(wd * t) + ((a1 - b1 - a1 / 2) / wd) * Math.sin(wd * t))); });
    expect(peakRelErr(w, w2)).toBeLessThan(0.02);
    expect(a1 / (2 * Math.sqrt(a0))).toBeLessThan(1); // underdamped dominant pair (zeta < 1)
    expect(w.at(-1)!).toBeCloseTo(wref, 2); // integral action: zero steady-state error
    row('1 DC motor speed control', wref, w.at(-1)!, sim.ms, 'w(1.5 s) [rad/s]');
    row('1 DC motor speed control', peakRef, peakSim, sim.ms, 'peak w [rad/s]');
    // energy: int(u i) = int(Ra i^2 + B w^2) + La i^2/2 + J w^2/2  (u is the motor terminal voltage, R_int = 0)
    const Ein = trapz(u.map((v, j) => v * cur[j]), dt);
    const Eout = trapz(cur.map((v, j) => Ra * v * v + B * w[j] * w[j]), dt) + 0.5 * La * cur.at(-1)! ** 2 + 0.5 * J * w.at(-1)! ** 2;
    expect(Math.abs(Ein - Eout) / Ein).toBeLessThan(0.01);
    expectScopeUnit(m, 'scope', 1, 'rad/s', /angular velocity/);
  }, 240000);

  it('direct BDF1 Newton solve of the assembled DAE = simulateStep at the same step', () => {
    expect(directVersusEngine(model1(), 1e-4, 20)).toBeLessThan(1e-6);
  }, 240000);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. Resistive heater: dc_voltage -> thermal_resistor (Joule heat into H) -> thermal_mass -> convective_heat -> ambient temp_src;
//    temp_sensor against the 0 K Thermal Reference. Governing equations (Simscape Thermal Mass / Convective Heat Transfer):
//      C dT/dt = V^2/R - h A (T - T_amb)  ->  T(t) = T_amb + V^2/(R h A) (1 - exp(-t h A / C)),  tau = m c / (h A)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('WP-30 model 2: resistive heater, thermal mass, convection to ambient (electrical -> thermal)', () => {
  it('T(inf) = T_amb + V^2/(R h A), tau = C/(h A); energy balance; scope unit K', () => {
    const V = 24, R = 10, C = 450, h = 20, A = 0.1, Tamb = 293.15;
    const m: Model = {
      nodes: [
        node('vs', 'dc_voltage', { V, R_int: 0 }), node('heater', 'thermal_resistor', { R }), node('gnd', 'ground'),
        node('mass', 'thermal_mass', { C, T0: Tamb }), node('conv', 'convective_heat', { h, A }), node('amb', 'temp_src', { T: Tamb }),
        node('ts', 'temp_sensor'), node('tref', 'thermal_ref'), node('is', 'i_sensor', { R_int: 0 }), node('scope', 'scope'),
      ],
      edges: [
        wire('vs.p', 'is.p'), wire('is.n', 'heater.a'), wire('heater.b', 'gnd.a'), wire('vs.n', 'gnd.a'),
        wire('heater.h', 'mass.a'), wire('mass.a', 'conv.a'), wire('conv.b', 'amb.a'),
        wire('mass.a', 'ts.a'), wire('ts.b', 'tref.a'), wire('ts.t', 'scope.in1'),
      ],
    };
    const dt = 2, steps = 600, P = (V * V) / R, hA = h * A, tau = C / hA;
    const T: number[] = [], I: number[] = [];
    const sim = simulate(m, steps, dt, (s) => { T.push(s.scope('scope')); I.push(s.at('is_branch_signal_i')); });
    const Tref = T.map((_, j) => Tamb + (P / hA) * (1 - Math.exp(-((j + 1) * dt) / tau)));
    expect(peakRelErr(T.map(v => v - Tamb), Tref.map(v => v - Tamb))).toBeLessThan(0.01);
    const tauIdx = Math.round(tau / dt) - 1; // T(tau) - T_amb = (1 - 1/e) of the rise
    expect(Math.abs((T[tauIdx] - Tamb) / (P / hA) - (1 - Math.exp(-1)))).toBeLessThan(0.005);
    row('2 heater + thermal mass', Tref.at(-1)!, T.at(-1)!, sim.ms, `T(${steps * dt} s) [K]`);
    expect(Math.abs(T.at(-1)! - Tref.at(-1)!)).toBeLessThan(0.05);
    // energy: int(V i) = C (T - T0) + int(h A (T - T_amb))
    const Ein = trapz(I.map(i => V * i), dt), Eout = C * (T.at(-1)! - Tamb) + trapz(T.map(v => hA * (v - Tamb)), dt);
    expect(Math.abs(Ein - Eout) / Ein).toBeLessThan(0.01);
    I.forEach(i => expect(i).toBeCloseTo(V / R, 9));
    expectScopeUnit(m, 'scope', 1, 'K', /temperature/);
  }, 240000);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. Hydraulic: pressure_source -> orifice -> flow_sensor -> fluid_capacitance (tank) -> fluid_resistance -> fluid_ref.
//    Governing equations (block specification = Simscape-style orifice with laminar transition, linear restriction, compliance):
//      q_or = Cd A sqrt(2 rho) dP / (dP^2 + dP_crit^2)^(1/4),  q_R = (p - p_atm)/Rf,  Cf dp/dt = q_or - q_R
//    Steady state: q_or(Ps - p) = (p - p_atm)/Rf  (solved by bisection here).
// 3b. Fluid -> translational: gas_reservoir -> gas_translational_conv -> mass + spring + damper: m x'' + b x' + k x = A (P - P_atm).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('WP-30 model 3: hydraulic orifice, tank and restriction; gas piston force balance', () => {
  it('tank pressure = the orifice/restriction ODE and its bisection steady state; mass balance; scope units Pa, kg/s', () => {
    const patm = 101325, Ps = patm + 5e5, Cd = 0.7, A = 1e-5, rho = 850, mu = 1.81e-5, Re = 12, Cf = 1e-7, Rf = 2e6;
    const dPc = (Math.PI * Re * Re * mu * mu) / (8 * rho * Cd * Cd * A);
    const qor = (dP: number) => (Cd * A * Math.sqrt(2 * rho) * dP) / Math.pow(dP * dP + dPc * dPc, 0.25);
    const m: Model = {
      nodes: [
        node('src', 'pressure_source', { P: Ps }), node('or', 'orifice', { Cd, A, rho, mu, Re_crit: Re }), node('fs', 'flow_sensor'),
        node('tank', 'fluid_capacitance', { Cf, P0: patm }), node('res', 'fluid_resistance', { Rf }), node('fref', 'fluid_ref'),
        node('ps', 'pressure_sensor'), node('scope', 'scope', { numSignals: 2 }),
      ],
      edges: [
        wire('src.p', 'or.p'), wire('or.n', 'fs.p'), wire('fs.n', 'tank.p'), wire('tank.p', 'res.p'), wire('res.n', 'fref.p'),
        wire('tank.p', 'ps.p'), wire('ps.out', 'scope.in1'), wire('fs.out', 'scope.in2'),
      ],
    };
    const dt = 1e-3, steps = 800;
    const p: number[] = [], q: number[] = [];
    const sim = simulate(m, steps, dt, (s) => { p.push(s.scope('scope', 1)); q.push(s.scope('scope', 2)); });
    const ref = rk4((_t, [pc]) => [(qor(Ps - pc) - (pc - patm) / Rf) / Cf], [patm], dt, steps, 20).slice(1).map(x => x[0]);
    expect(peakRelErr(p.map(v => v - patm), ref.map(v => v - patm))).toBeLessThan(0.01);
    let lo = patm, hi = Ps;
    for (let j = 0; j < 200; j++) { const mid = 0.5 * (lo + hi); if (qor(Ps - mid) - (mid - patm) / Rf > 0) lo = mid; else hi = mid; }
    const pss = 0.5 * (lo + hi);
    expect(Math.abs(p.at(-1)! - pss) / (pss - patm)).toBeLessThan(0.002);
    expect(Math.abs(q.at(-1)! - (pss - patm) / Rf) / ((pss - patm) / Rf)).toBeLessThan(0.002);
    row('3 hydraulic orifice/tank/restr.', ref.at(-1)!, p.at(-1)!, sim.ms, 'p_tank(0.8 s) [Pa]');
    row('3 hydraulic orifice/tank/restr.', pss, p.at(-1)!, sim.ms, 'p_tank vs steady state [Pa]');
    // mass balance of the tank: int(q_in - q_out) = Cf (p - p0)
    const stored = trapz(q.map((v, j) => v - (p[j] - patm) / Rf), dt);
    expect(Math.abs(stored - Cf * (p.at(-1)! - patm)) / (Cf * (p.at(-1)! - patm))).toBeLessThan(0.01);
    expectScopeUnit(m, 'scope', 1, 'Pa', /pressure/);
    expectScopeUnit(m, 'scope', 2, 'kg/s', /mass flow/);
  }, 240000);

  it('gas piston: x(t) of m x\'\' + b x\' + k x = A (P - P_atm) (critically damped), force balance k x = A dP at rest', () => {
    const P = 3e5, patm = 101325, A = 1e-3, mass = 1, k = 1e4, b = 200;
    const m: Model = {
      nodes: [
        node('res', 'gas_reservoir', { P }), node('conv', 'gas_translational_conv', { A, T: 293.15 }), node('gref', 'gas_ref'),
        node('m', 'mass', { m: mass, b: 0 }), node('sp', 'trans_spring', { k }), node('d', 'trans_damper', { b }), node('tref', 'trans_ref'),
        node('tm', 'trans_motion_sensor'), node('scope', 'scope'),
      ],
      edges: [
        wire('res.a', 'conv.a'), wire('conv.h', 'gref.g'), wire('conv.r', 'm.p'), wire('conv.c', 'tref.p'),
        wire('m.p', 'sp.r'), wire('sp.c', 'tref.p'), wire('m.p', 'd.r'), wire('d.c', 'tref.p'),
        wire('m.p', 'tm.r'), wire('tm.c', 'tref.p'), wire('tm.p', 'scope.in1'),
      ],
    };
    const dt = 1e-3, steps = 200, F = A * (P - patm), wn = Math.sqrt(k / mass); // zeta = b / (2 sqrt(k m)) = 1
    expect(b / (2 * Math.sqrt(k * mass))).toBe(1);
    const x: number[] = [];
    const sim = simulate(m, steps, dt, (s) => x.push(s.scope('scope')));
    const xr = x.map((_, j) => { const t = (j + 1) * dt; return (F / k) * (1 - Math.exp(-wn * t) * (1 + wn * t)); });
    expect(peakRelErr(x, xr)).toBeLessThan(0.01);
    expect(Math.abs(x.at(-1)! - F / k) / (F / k)).toBeLessThan(0.002);
    row('3b gas piston force balance', F / k, x.at(-1)!, sim.ms, 'x(0.2 s) [m]');
    expectScopeUnit(m, 'scope', 1, 'm', /position/);
  }, 240000);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. Gas: gas_reservoir -> gas_restriction (choked) -> gas_flow_sensor -> gas_chamber (+ gas_cap) -> gas_pressure_sensor.
//    Choked (p_ch/p0 < r* = (2/(g+1))^(g/(g-1))) mass flow of an ideal gas (Simscape Orifice (G), White "Fluid Mechanics" 9.4):
//      mdot* = Cd A p0 sqrt(g/(R T)) (2/(g+1))^((g+1)/(2(g-1)))   (independent of the chamber pressure)
//    Isothermal chamber: dp/dt = R T / V mdot  ->  p(t) = P0 + R T mdot* t / V (linear while choked).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('WP-30 model 4: gas chamber filling through a choked restriction', () => {
  it('constant choked mass flow while p_ch/p0 < r*; linear pressure rise; mass balance; scope units Pa, kg/s', () => {
    const p0 = 5e5, Cd = 0.62, A = 1e-5, T = 293.15, g = 1.4, Rg = 287, V = 0.01, P0 = 101325;
    const m: Model = {
      nodes: [
        node('res', 'gas_reservoir', { P: p0 }), node('rst', 'gas_restriction', { area: A, Cd, T, gamma: g }), node('fs', 'gas_flow_sensor'),
        node('ch', 'gas_chamber', { V, T, P0 }), node('cap', 'gas_cap'), node('ps', 'gas_pressure_sensor'), node('scope', 'scope', { numSignals: 2 }),
      ],
      edges: [
        wire('res.a', 'rst.a'), wire('rst.b', 'fs.p'), wire('fs.n', 'ch.a'), wire('ch.b', 'cap.a'),
        wire('ch.a', 'ps.p'), wire('ps.out', 'scope.in1'), wire('fs.out', 'scope.in2'),
      ],
    };
    const rStar = Math.pow(2 / (g + 1), g / (g - 1));
    const mdotStar = Cd * A * p0 * Math.sqrt(g / (Rg * T)) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1)));
    const dt = 0.01, steps = 200;
    const p: number[] = [], q: number[] = [];
    const sim = simulate(m, steps, dt, (s) => { p.push(s.scope('scope', 1)); q.push(s.scope('scope', 2)); });
    expect(p.at(-1)! / p0).toBeLessThan(rStar); // still choked at the end of the run
    q.forEach(v => expect(Math.abs(v - mdotStar) / mdotStar).toBeLessThan(1e-3));
    const pr = p.map((_, j) => P0 + (Rg * T * mdotStar * (j + 1) * dt) / V);
    expect(peakRelErr(p.map(v => v - P0), pr.map(v => v - P0))).toBeLessThan(0.005);
    row('4 gas choked filling', mdotStar, q.at(-1)!, sim.ms, 'mdot* [kg/s]');
    row('4 gas choked filling', pr.at(-1)!, p.at(-1)!, sim.ms, 'p_ch(2 s) [Pa]');
    // mass balance: int(mdot) = V (p - P0) / (R T)
    expect(Math.abs(trapz(q, dt, q[0]) - (V * (p.at(-1)! - P0)) / (Rg * T)) / ((V * (p.at(-1)! - P0)) / (Rg * T))).toBeLessThan(0.01);
    expectScopeUnit(m, 'scope', 1, 'Pa', /pressure/);
    expectScopeUnit(m, 'scope', 2, 'kg/s', /mass flow/);
  }, 240000);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 5. Electromagnetic: dc_voltage -> resistor -> em_converter (N turns) -> reluctance loop with mag_flux_sensor and mag_ref.
//    Governing equations (Simscape Electromagnetic Converter mmf = N i, v = N dPhi/dt; Reluctance mmf = Phi R_m):
//      L = N^2 / R_m,  i(t) = V/R (1 - exp(-t R / L)),  Phi = N i / R_m
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const M5 = { V: 10, R: 10, N: 100, Rm: 1e6 };
const model5 = (): Model => ({
  nodes: [
    node('vs', 'dc_voltage', { V: M5.V, R_int: 0 }), node('r', 'resistor', { R: M5.R }), node('gnd', 'ground'),
    node('em', 'em_converter', { N: M5.N }), node('core', 'reluctance', { R: M5.Rm }), node('fx', 'mag_flux_sensor'), node('mref', 'mag_ref'),
    node('is', 'i_sensor', { R_int: 0 }), node('scope', 'scope', { numSignals: 2 }),
  ],
  edges: [
    wire('vs.p', 'is.p'), wire('is.n', 'r.p'), wire('r.n', 'em.p'), wire('em.n', 'gnd.a'), wire('vs.n', 'gnd.a'),
    wire('em.mag_n', 'core.n'), wire('core.s', 'fx.n'), wire('fx.s', 'em.mag_s'), wire('em.mag_s', 'mref.n'),
    wire('fx.phi', 'scope.in1'), wire('is.i', 'scope.in2'),
  ],
});

describe('WP-30 model 5: winding on a reluctance circuit (electrical <-> magnetic)', () => {
  it('i(t) = V/R (1 - e^(-t R/L)), L = N^2/R_m; Phi = N i / R_m; energy balance; scope units Wb, A', () => {
    const { V, R, N, Rm } = M5; const L = (N * N) / Rm, tau = L / R;
    const m = model5();
    const dt = 2e-5, steps = 400;
    const phi: number[] = [], i: number[] = [];
    const sim = simulate(m, steps, dt, (s) => { phi.push(s.scope('scope', 1)); i.push(s.scope('scope', 2)); });
    const iRef = i.map((_, j) => (V / R) * (1 - Math.exp(-((j + 1) * dt) / tau)));
    expect(peakRelErr(i, iRef)).toBeLessThan(0.01);
    phi.forEach((f, j) => expect(Math.abs(Math.abs(f) - (N * i[j]) / Rm)).toBeLessThan(1e-9 + 1e-6 * Math.abs(f)));
    row('5 winding + reluctance', V / R, i.at(-1)!, sim.ms, 'i(8 ms) [A]');
    row('5 winding + reluctance', (N * V) / (R * Rm), Math.abs(phi.at(-1)!), sim.ms, '|Phi|(8 ms) [Wb]');
    // energy: int(V i) = int(R i^2) + L i^2 / 2
    const Ein = trapz(i.map(v => V * v), dt), Eout = trapz(i.map(v => R * v * v), dt) + 0.5 * L * i.at(-1)! ** 2;
    expect(Math.abs(Ein - Eout) / Ein).toBeLessThan(0.01);
    expectScopeUnit(m, 'scope', 1, 'Wb', /flux/);
    expectScopeUnit(m, 'scope', 2, 'A', /current/);
  }, 240000);

  it('direct BDF1 Newton solve of the assembled DAE = simulateStep at the same step', () => {
    expect(directVersusEngine(model5(), 1e-5, 20)).toBeLessThan(1e-6);
  }, 240000);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 6. Inverter-fed induction motor: dc_voltage -> averaged pwm_3ph_2level (vabc from the V/f controller im_scalar_ctrl, scaled to
//    the modulation index: v_f_ratio = M / f_rated, so V(f_rated) = M) -> composite abc -> ac_motor (star point n floating)
//    -> rot_damper load. Phase currents read from the machine's own branch currents (i_a, i_b, i_c).
//    Steady state from the per-phase equivalent circuit (Krause, "Analysis of Electric Machinery", ch. 6; Fitzgerald ch. 6):
//      V_ph,rms = M Vdc / (2 sqrt 2),  Z = Rs + j X_ls + j X_m || (Rr/s + j X_lr),  T_e = 3 P |I_r|^2 Rr / (s w_e)
//      T_e(s) = (B + b) w_m,  w_m = (1 - s) w_e / P   (P = pole pairs); balanced, star point floating -> i_a + i_b + i_c = 0.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('WP-30 model 6: inverter-fed induction motor with V/f control (signal -> power electronics -> machine)', () => {
  it('steady speed = synchronous minus the equivalent-circuit slip; no zero-sequence current; scope unit rad/s', () => {
    const Vdc = 600, M = 0.8, f = 50, Rs = 0.5, Rr = 0.5, Lm = 0.05, Lls = 0.005, Llr = 0.005, P = 2, J = 0.005, Bm = 0.005, b = 0.2, Rout = 0.001;
    const phases = ['a', 'b', 'c'];
    const m: Model = {
      nodes: [
        node('dc', 'dc_voltage', { V: Vdc, R_int: 0 }), node('gnd', 'ground'),
        node('fref', 'ps_constant', { value: f }), node('vf', 'im_scalar_ctrl', { v_f_ratio: M / f, f_rated: f, v_boost: 0 }),
        node('inv', 'pwm_3ph_2level', { model_mode: 'averaged', control_mode: 'three_phase_modulation', output_resistance_ohm: Rout }),
        node('mot', 'ac_motor', { Rs, Rr, Lm, Lls, Llr, P, J, B: Bm }), node('load', 'rot_damper', { b }), node('rref', 'rot_ref'),
        node('ws', 'rot_motion_sensor'), node('scope', 'scope'),
      ],
      edges: [
        wire('fref.y', 'vf.f_ref'), wire('vf.vabc', 'inv.vabc'),
        wire('dc.p', 'inv.p'), wire('dc.n', 'gnd.a'), wire('inv.n', 'gnd.a'),
        wire('inv.abc', 'mot.abc'),
        wire('mot.r', 'load.r'), wire('load.c', 'rref.r'), wire('mot.r', 'ws.r'), wire('ws.c', 'rref.r'), wire('ws.w', 'scope.in1'),
      ],
    };
    // equivalent-circuit steady state (complex arithmetic written out)
    const we = 2 * Math.PI * f, Vph = (M * Vdc) / (2 * Math.SQRT2), Xm = we * Lm, Xls = we * Lls, Xlr = we * Llr, Rse = Rs + Rout;
    const torque = (s: number) => {
      const zr = [Rr / s, Xlr], zm = [0, Xm];
      const sum = [zr[0] + zm[0], zr[1] + zm[1]], den = sum[0] ** 2 + sum[1] ** 2;
      const prod = [zr[0] * zm[0] - zr[1] * zm[1], zr[0] * zm[1] + zr[1] * zm[0]];
      const par = [(prod[0] * sum[0] + prod[1] * sum[1]) / den, (prod[1] * sum[0] - prod[0] * sum[1]) / den];
      const z = [Rse + par[0], Xls + par[1]];
      const is = Vph / Math.hypot(z[0], z[1]);
      const ir = (is * Xm) / Math.hypot(sum[0], sum[1]); // |I_r| = |I_s| |Z_m| / |Z_m + Z_r|
      return (3 * P * ir * ir * Rr) / (s * we);
    };
    const mismatch = (s: number) => torque(s) - (Bm + b) * (1 - s) * (we / P);
    let lo = 1e-6, hi = 0.05; // stable operating point: below the breakdown slip
    expect(mismatch(lo)).toBeLessThan(0); expect(mismatch(hi)).toBeGreaterThan(0);
    for (let j = 0; j < 200; j++) { const mid = 0.5 * (lo + hi); if (mismatch(mid) > 0) hi = mid; else lo = mid; }
    const slip = 0.5 * (lo + hi), wSync = we / P, wRef = (1 - slip) * wSync;

    const dt = 5e-4, steps = 1000, period = Math.round(1 / f / dt);
    const w: number[] = []; let worstZero = 0, peakPhase = 0;
    const sim = simulate(m, steps, dt, (s, k) => {
      w.push(s.scope('scope'));
      const [ia, ib, ic] = phases.map(p => s.at(`mot_branch_i${p}`));
      if (k > steps - 2 * period) { worstZero = Math.max(worstZero, Math.abs(ia + ib + ic)); peakPhase = Math.max(peakPhase, Math.abs(ia)); }
    });
    const wAvg = w.slice(-2 * period).reduce((a, v) => a + v, 0) / (2 * period);
    expect(Math.abs(wAvg - wRef) / wRef).toBeLessThan(0.005);
    expect(Math.abs((wSync - wAvg) / wSync - slip) / slip).toBeLessThan(0.05);
    expect(worstZero).toBeLessThan(1e-6 * Math.max(1, peakPhase));
    expect(peakPhase).toBeGreaterThan(1);
    row('6 inverter + induction motor', wRef, wAvg, sim.ms, 'w_m [rad/s]');
    row('6 inverter + induction motor', slip, (wSync - wAvg) / wSync, sim.ms, 'slip [1]');
    expectScopeUnit(m, 'scope', 1, 'rad/s', /angular velocity/);
  }, 240000);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 7. Drivetrain: torque_source -> gear_box (w1 = N w2) -> rack_pinion (v = r w2) -> mass with trans_friction and trans_hard_stop.
//    Governing equations (Simscape Simple Gear / Rack & Pinion (ideal, lossless), Translational Friction, Translational Hard Stop):
//      m dv/dt = N T / r - F_fr(v),  F_fr = [Fc + (Fbrk - Fc) e^(-cv |v|)] tanh(4 v / v_thr) + Fv v   (before contact)
//      kinematics w1 = N v / r; power T w1 = d/dt(m v^2 / 2) + F_fr v; at rest on the stop k (x - upper) = N T / r.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('WP-30 model 7: torque source, gearbox, rack-pinion, mass with friction and a hard stop', () => {
  it('kinematic ratios, power balance and the friction ODE before contact; the hard stop holds the mass at F/k', () => {
    const T = 0.5, N = 4, r = 0.05, mass = 1, Fbrk = 6, Fc = 5, Fv = 2, cv = 10, vthr = 0.01, upper = 0.1, k = 1e4;
    const m: Model = {
      nodes: [
        node('ts', 'torque_source', { T }), node('rref', 'rot_ref'), node('gb', 'gear_box', { ratio: N }), node('rp', 'rack_pinion', { radius: r }),
        node('m', 'mass', { m: mass, b: 0 }), node('fr', 'trans_friction', { Fbrk, Fc, Fv, cv, vthr }),
        node('hs', 'trans_hard_stop', { upper, lower: -0.1, k, c: 10, transition: 1e-4 }), node('tref', 'trans_ref'),
        node('rs', 'rot_motion_sensor'), node('tm', 'trans_motion_sensor'), node('scope', 'scope', { numSignals: 3 }),
      ],
      edges: [
        wire('ts.c', 'gb.s1'), wire('ts.r', 'rref.r'), wire('gb.s2', 'rp.b'), wire('rp.f', 'm.p'),
        wire('m.p', 'fr.r'), wire('fr.c', 'tref.p'), wire('m.p', 'hs.r'), wire('hs.c', 'tref.p'),
        wire('gb.s1', 'rs.r'), wire('rs.c', 'rref.r'), wire('m.p', 'tm.r'), wire('tm.c', 'tref.p'),
        wire('tm.p', 'scope.in1'), wire('tm.v', 'scope.in2'), wire('rs.w', 'scope.in3'),
      ],
    };
    const dt = 5e-4, steps = 3000;
    const x: number[] = [], v: number[] = [], w1: number[] = [];
    const sim = simulate(m, steps, dt, (s) => { x.push(s.scope('scope', 1)); v.push(s.scope('scope', 2)); w1.push(s.scope('scope', 3)); });
    const ffr = (u: number) => (Fc + (Fbrk - Fc) * Math.exp(-cv * Math.abs(u))) * Math.tanh((4 * u) / vthr) + Fv * u;
    const ref = rk4((_t, [, u]) => [u, (N * T / r - ffr(u)) / mass], [0, 0], dt, steps, 20).slice(1);
    const free = x.findIndex(p => p >= 0.95 * upper); // before contact
    expect(free).toBeGreaterThan(50);
    expect(peakRelErr(v.slice(0, free), ref.slice(0, free).map(s => s[1]))).toBeLessThan(0.01);
    w1.forEach((w, j) => expect(Math.abs(w - (N * v[j]) / r)).toBeLessThan(1e-6 * Math.max(1, Math.abs(w))));
    const Ein = trapz(w1.slice(0, free).map(w => T * w), dt);
    const Eout = 0.5 * mass * v[free - 1] ** 2 + trapz(v.slice(0, free).map(u => ffr(u) * u), dt);
    expect(Math.abs(Ein - Eout) / Ein).toBeLessThan(0.01);
    const xRest = upper + (N * T) / (r * k);
    expect(Math.max(...x)).toBeLessThan(upper + 0.05);
    expect(Math.abs(x.at(-1)! - xRest) / (xRest - upper)).toBeLessThan(0.02);
    expect(Math.abs(v.at(-1)!)).toBeLessThan(1e-3);
    row('7 drivetrain + hard stop', ref[free - 1][1], v[free - 1], sim.ms, 'v before contact [m/s]');
    row('7 drivetrain + hard stop', xRest, x.at(-1)!, sim.ms, 'x at rest on stop [m]');
    expectScopeUnit(m, 'scope', 1, 'm', /position/);
    expectScopeUnit(m, 'scope', 2, 'm/s', /velocity/);
    expectScopeUnit(m, 'scope', 3, 'rad/s', /angular velocity/);
  }, 240000);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 8. Mixed signal: ps_sine -> ps_saturation -> controlled_voltage + vccs (= a PS-controlled current source, the library has none)
//    -> parallel RC -> v_sensor -> scope.   C dv/dt + v/R = i(t),  i = Gm sat(A sin(w t)).
//    Closed form, piecewise: on a saturated interval i = +-Gm L: v = +-Gm L R + (v0 -+ Gm L R) e^(-(t - t0)/tau);
//    on a linear interval i = Gm A sin(w t): v = vp(t) + (v0 - vp(t0)) e^(-(t - t0)/tau),
//    vp(t) = Gm A R (sin(w t) - w tau cos(w t)) / (1 + (w tau)^2),  tau = R C.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('WP-30 model 8: saturated sine -> controlled current source -> RC -> voltage sensor -> scope', () => {
  it('capacitor voltage = the closed-form piecewise solution; charge balance; scope unit V', () => {
    const Amp = 2, freq = 50, L = 1, Gm = 0.01, R = 1000, C = 1e-5, tau = R * C, w = 2 * Math.PI * freq;
    const m: Model = {
      nodes: [
        node('sine', 'ps_sine', { amp: Amp, freq }), node('sat', 'ps_saturation', { upper: L, lower: -L }),
        node('cv', 'controlled_voltage', { R_int: 0 }), node('gm', 'vccs', { gain: Gm }), node('gnd', 'ground'),
        node('r', 'resistor', { R }), node('c', 'capacitor', { C, v0: 0 }), node('vs', 'v_sensor'), node('scope', 'scope'),
      ],
      edges: [
        wire('sine.y', 'sat.u'), wire('sat.y', 'cv.s'), wire('cv.p', 'gm.cp'), wire('cv.n', 'gnd.a'), wire('gm.cn', 'gnd.a'),
        wire('gm.p', 'gnd.a'), wire('gm.n', 'r.p'), wire('r.n', 'gnd.a'), wire('gm.n', 'c.p'), wire('c.n', 'gnd.a'),
        wire('gm.n', 'vs.p'), wire('vs.n', 'gnd.a'), wire('vs.v', 'scope.in1'),
      ],
    };
    // closed form: segment boundaries where |A sin(w t)| = L
    const vp = (t: number) => (Gm * Amp * R * (Math.sin(w * t) - w * tau * Math.cos(w * t))) / (1 + (w * tau) ** 2);
    const ts = Math.asin(L / Amp) / w, Tp = 1 / freq;
    const vRef = (t: number) => {
      const bounds: number[] = [];
      for (let n = 0; n * Tp <= t + Tp; n++) bounds.push(n * Tp, n * Tp + ts, n * Tp + Tp / 2 - ts, n * Tp + Tp / 2 + ts, n * Tp + Tp - ts);
      bounds.sort((a, c) => a - c);
      let v = 0, t0 = 0;
      for (const tb of [...bounds.filter(b => b > 0 && b < t), t]) {
        const mid = 0.5 * (t0 + tb), s = Amp * Math.sin(w * mid);
        const e = Math.exp(-(tb - t0) / tau);
        if (Math.abs(s) >= L) { const vi = Math.sign(s) * Gm * L * R; v = vi + (v - vi) * e; } else v = vp(tb) + (v - vp(t0)) * e;
        t0 = tb;
      }
      return v;
    };
    const dt = 5e-5, steps = 1200;
    const v: number[] = [];
    const sim = simulate(m, steps, dt, (s) => v.push(s.scope('scope')));
    const ref = v.map((_, j) => vRef((j + 1) * dt));
    expect(peakRelErr(v, ref)).toBeLessThan(0.01);
    const vMax = Math.max(...v), vMaxRef = Math.max(...ref);
    row('8 sat. sine -> CCS -> RC', vMaxRef, vMax, sim.ms, 'max v_C [V]');
    // charge balance: int(i) = C v + int(v / R)
    const iSrc = v.map((_, j) => Gm * Math.max(-L, Math.min(L, Amp * Math.sin(w * (j + 1) * dt))));
    expect(Math.abs(trapz(iSrc, dt) - (C * v.at(-1)! + trapz(v.map(x => x / R), dt))) / (Gm * L * 3 * Tp)).toBeLessThan(0.01);
    expectScopeUnit(m, 'scope', 1, 'V', /voltage/);
  }, 240000);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// F-090 / spec 2026-09-30 belt-pulley section 2.3: a Belt-Cable End linked to Belt-Cable Properties inherits its damping.
//   taut belt, end R fixed, mass on E pulled by F:  m x'' = F - (k x + c x'),  k = E A / L  (c from the properties block)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('WP-30 F-090: belt_end inherits the belt_properties damping', () => {
  const build = (propsDamping: number | undefined, localDamping: number): Model => ({
    nodes: [
      node('bp', 'belt_properties', { density: 1.1, youngs: 1e6, ...(propsDamping === undefined ? {} : { damping: propsDamping }) }),
      node('be', 'belt_end', { stiffness: 1e6, length: 1, area: 1e-3, damping: localDamping }),
      node('m', 'mass', { m: 1, b: 0 }), node('fs', 'force_source', { F: 10 }), node('tref', 'trans_ref'),
      node('tm', 'trans_motion_sensor'), node('scope', 'scope'),
    ],
    edges: [
      wire('bp.p', 'be.p'), wire('be.r', 'tref.p'), wire('be.e', 'm.p'), wire('fs.b', 'm.p'), wire('fs.a', 'tref.p'),
      wire('m.p', 'tm.r'), wire('tm.c', 'tref.p'), wire('tm.p', 'scope.in1'),
    ],
  });
  const reference = (c: number, dt: number, steps: number) => {
    const k = (1e6 * 1e-3) / 1; // E A / L
    return rk4((_t, [x, u]) => [u, 10 - Math.max(0, k * x + c * u)], [0, 0], dt, steps, 20).slice(1).map(s => s[0]);
  };
  it('linked: c = belt_properties.damping (the local damping is not used); unlinked keeps its own damping', () => {
    const dt = 1e-3, steps = 400;
    const x: number[] = [];
    simulate(build(20, 0), steps, dt, (s) => x.push(s.scope('scope')));
    expect(peakRelErr(x, reference(20, dt, steps))).toBeLessThan(0.01);
    // without the property-link wire the block keeps its local stiffness / damping (spec 2.5: no fallback)
    // (local stiffness 1e6 N/m, local damping 2000 N s/m = critical for m = 1 kg: at rest x = F / k_local = 1e-5 m)
    const unlinked = build(20, 2000);
    unlinked.edges = unlinked.edges.filter(e => !(e.source === 'bp'));
    unlinked.nodes = unlinked.nodes.filter(n => n.id !== 'bp');
    const xu: number[] = [];
    simulate(unlinked, steps, dt, (s) => xu.push(s.scope('scope')));
    expect(Math.abs(xu.at(-1)! - 1e-5) / 1e-5).toBeLessThan(0.01);
  }, 240000);
});
