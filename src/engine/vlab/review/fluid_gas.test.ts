import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { DAEStructureError, UNSUPPORTED_BLOCKS } from '../vlabStructure';
import { validateTopology } from '../vlabTopologyValidation';
import { isGenericText } from './contractChecks';
import {
  waterLatentHeat, waterSatPressure, waterSatTemperature, waterSatLiquidDensity, waterSatVapourDensity,
} from '../vlabFluidProperties';

/**
 * WP-17: Fluid / Isothermal Liquid / Steam / Gas / Moist Air blocks against their published equations.
 *
 * Every expected value is derived IN THIS FILE from a published relation (Simscape Isothermal Liquid / Gas / Moist Air block reference,
 * Anderson "Modern Compressible Flow" for the isentropic orifice, Cengel & Boles steam tables, ASHRAE Fundamentals ch. 1 for psychrometrics,
 * White "Viscous Fluid Flow" / Hagen-Poiseuille / Haaland for pipe friction) or from a closed-form solution named at the test; nothing is read
 * back from the code under test. Convention (Simscape): through variable positive A -> B through the block, across = x_A - x_B.
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
  at: (name: string, i?: number) => number;
  series: (name: string) => number[];
  times: number[];
  across: (block: string, port: string, i?: number) => number;
}

function simulate(m: Model, steps: number, dt: number): Sim {
  const engine = new VLabPhysicsEngine();
  let state: any = null;
  const history: any[] = [];
  for (let i = 0; i < steps; i++) {
    state = engine.simulateStep(m.nodes, m.edges, state, dt);
    history.push(state);
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
    history, times: history.map((s) => s.time),
    at: (name, i = history.length - 1) => history[i].x[idx(name)],
    series: (name) => history.map((s) => s.x[idx(name)]),
    across: (block, port, i = history.length - 1) => history[i].x[acrossIdx(block, port)],
  };
}

const REPORT: string[] = [];
const pct = (actual: number, expected: number) => (100 * Math.abs(actual - expected)) / Math.max(Math.abs(expected), 1e-12);
const near = (actual: number, expected: number, relTol: number, label: string) => {
  const e = pct(actual, expected);
  REPORT.push(`${label}: ${e.toExponential(2)} %`);
  expect(e / 100, `${label}: actual ${actual}, expected ${expected}, rel err ${e}%`).toBeLessThanOrEqual(relTol);
};

const structureError = (m: Model): DAEStructureError => {
  const engine = new VLabPhysicsEngine();
  try { engine.simulateStep(m.nodes, m.edges, null, 0.01); } catch (e) { if (e instanceof DAEStructureError) return e; throw e; }
  throw new Error('expected a DAEStructureError');
};

const lib = (id: string) => VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === id)!;
const P_ATM = 101325;

// ── independent published constants / correlations (typed here, not imported) ──────────────────────────────────────
const R_AIR = 287;          // J/(kg K), the Gas domain library text
const R_A = 287.058, R_V = 461.52, EPS = 0.622; // ASHRAE Fundamentals 2017 ch. 1
const sutherland = (T: number) => (1.458e-6 * T ** 1.5) / (T + 110.4); // White, Viscous Fluid Flow
// saturation pressure of water at 20 degC: steam tables (Cengel & Boles, Table A-4) 2.3392 kPa
const PSAT_20C = 2339.2;

describe('WP-17 F-064: pressure reference is explicit; an open fluid / gas port is capped, not an atmosphere', () => {
  it('a pressure source -> resistance -> open port line carries no flow and the open node sits at the source pressure (was: 1 atm)', () => {
    const m: Model = {
      nodes: [node('src', 'pressure_source', { P: 301325 }), node('R', 'fluid_resistance', { Rf: 1e5 })],
      edges: [wire('src.p', 'R.p')],
    };
    const sim = simulate(m, 3, 0.1);
    expect(Math.abs(sim.at('R_branch_mass_flow'))).toBeLessThan(1e-12);
    near(sim.across('R', 'n'), 301325, 1e-9, 'open node pressure');
  });

  it('gas_fixed_res -> resistance -> chamber with an OPEN port B charges to the reservoir pressure (was: stalled at the atmosphere)', () => {
    // dp/dt = (R T / V) k (Ps - p)  ->  p(t) = Ps + (P0 - Ps) exp(-k R T t / V)
    const Ps = 500000, k = 1e-5, V = 0.01, T = 293.15;
    const m: Model = {
      nodes: [node('res', 'gas_fixed_res', { P: Ps }), node('R', 'gas_resistance', { k }), node('ch', 'gas_chamber', { V, T })],
      edges: [wire('res.a', 'R.a'), wire('R.b', 'ch.a')],
    };
    const dt = 0.05, steps = 100;
    const sim = simulate(m, steps, dt);
    const tau = V / (k * R_AIR * T);
    const t = steps * dt;
    near(sim.at('ch_state_pressure'), Ps + (P_ATM - Ps) * Math.exp(-t / tau), 0.01, 'gas charging through a resistance');
  });

  it('a network with no pressure datum is a named floating-network diagnostic', () => {
    const m: Model = {
      nodes: [node('R1', 'fluid_resistance'), node('R2', 'fluid_resistance'), node('Q', 'mass_flow_source', { mdot: 0 })],
      edges: [wire('R1.n', 'R2.p'), wire('Q.p', 'R1.p')],
    };
    const err = structureError(m);
    expect(err.diagnostics[0].reason).toMatch(/Floating fluid network/);
    expect(err.diagnostics[0].reason).toMatch(/pressure reference/);
  });

  it('a capacity (chamber) is a datum by itself: fan + moist-air chamber (the air-fryer topology) is well posed', () => {
    const m: Model = {
      nodes: [node('fan', 'ma_pressure_source', { P: 150 }), node('ch', 'ma_chamber', { V: 0.005 }), node('ctl', 'ps_constant', { value: 0.8 }),
        node('tsrc', 'temp_src', { T: 298.15 })],
      edges: [wire('ctl.y', 'fan.s'), wire('fan.b', 'ch.a'), wire('ch.h', 'tsrc.a')],
    };
    const sim = simulate(m, 3, 0.1);
    near(sim.across('fan', 'b') - sim.across('fan', 'a'), 150 * 0.8, 1e-9, 'fan pressure difference');
    expect(Math.abs(sim.at('fan_branch_mass_flow'))).toBeLessThan(1e-9);
  });

  it('an unconnected fluid port named n or b is no longer grounded by its name (pipe_il.b open: no flow, node at the supply pressure)', () => {
    const m: Model = {
      nodes: [node('ref', 'hydraulic_reference_il', { referencePressure: 300000 }), node('pipe', 'pipe_il', { R: 1e5 })],
      edges: [wire('ref.a', 'pipe.a')],
    };
    const sim = simulate(m, 2, 0.1);
    expect(Math.abs(sim.at('pipe_branch_mass_flow'))).toBeLessThan(1e-12);
    near(sim.across('pipe', 'b'), 300000, 1e-9, 'open pipe end');
  });
});

describe('WP-17 laminar resistance, orifice, capacitance, inertance (Isothermal Liquid / Fluid)', () => {
  it('series laminar network: mdot = (p_src - p_ref) / (R1 + R2) (Hagen-Poiseuille, dp = R mdot)', () => {
    const m: Model = {
      nodes: [node('src', 'pressure_source', { P: P_ATM + 200000 }), node('R1', 'fluid_resistance', { Rf: 1e5 }),
        node('R2', 'fluid_resistance', { Rf: 2e5 }), node('ref', 'fluid_ref')],
      edges: [wire('src.p', 'R1.p'), wire('R1.n', 'R2.p'), wire('R2.n', 'ref.p')],
    };
    const sim = simulate(m, 2, 0.1);
    near(sim.at('R1_branch_mass_flow'), 200000 / 3e5, 1e-9, 'series mdot');
    near(sim.across('R1', 'n'), P_ATM + 200000 * (2 / 3), 1e-9, 'mid node pressure');
  });

  it('IL pipe + pump: mdot = pressure_rise / R (ideal pressure head into a laminar pipe)', () => {
    const m: Model = {
      nodes: [node('ref', 'hydraulic_reference_il'), node('pump', 'pump_il', { pressure_rise: 200000 }), node('pipe', 'pipe_il', { R: 4e5 })],
      edges: [wire('ref.a', 'pump.a'), wire('pump.b', 'pipe.a'), wire('pipe.b', 'ref.a')],
    };
    const sim = simulate(m, 2, 0.1);
    near(sim.at('pipe_branch_mass_flow'), 0.5, 1e-9, 'pump head / R');
  });

  const orificeModel = (type: 'orifice' | 'restriction_il', dp: number, params: Record<string, any>): Model =>
    type === 'orifice'
      ? { nodes: [node('src', 'pressure_source', { P: P_ATM + dp }), node('o', 'orifice', params), node('ref', 'fluid_ref')], edges: [wire('src.p', 'o.p'), wire('o.n', 'ref.p')] }
      : { nodes: [node('ref', 'hydraulic_reference_il', { referencePressure: P_ATM }), node('pump', 'pump_il', { pressure_rise: dp }), node('o', 'restriction_il', params)],
        edges: [wire('ref.a', 'pump.a'), wire('pump.b', 'o.a'), wire('o.b', 'ref.a')] };

  it('orifice, turbulent: mdot = Cd A sqrt(2 rho dp) at sample pressure drops (air, and the IL restriction with water)', () => {
    for (const dp of [50, 500, 5000]) {
      const sim = simulate(orificeModel('orifice', dp, { Cd: 0.6, A: 1e-4, rho: 1.2 }), 2, 0.1);
      near(sim.at('o_branch_mass_flow'), 0.6 * 1e-4 * Math.sqrt(2 * 1.2 * dp), 1e-4, `orifice dp=${dp}`);
    }
    for (const dp of [2000, 20000, 200000]) {
      const sim = simulate(orificeModel('restriction_il', dp, { Cd: 0.7, area: 2e-5, rho: 998 }), 2, 0.1);
      near(sim.at('o_branch_mass_flow'), 0.7 * 2e-5 * Math.sqrt(2 * 998 * dp), 1e-4, `restriction_il dp=${dp}`);
    }
  });

  it('orifice continuity near zero: finite slope (laminar), odd in dp, no stall at dp = 0', () => {
    // laminar limit of the smooth law: mdot = Cd A sqrt(2 rho) dp / sqrt(dp_crit), dp_crit = pi Re^2 mu^2 / (8 rho Cd^2 A) (Simscape Local Restriction)
    const Cd = 0.6, A = 1e-4, rho = 1.2, mu = 1.81e-5, Re = 12;
    const dpCrit = (Math.PI * Re * Re * mu * mu) / (8 * rho * Cd * Cd * A);
    // Simscape smooth form at a pressure drop of 10 dp_crit (still ~4 mPa: laminar-dominated, far below any turbulent value)
    const law = (d: number) => (Cd * A * Math.sqrt(2 * rho) * d) / Math.pow(d * d + dpCrit * dpCrit, 0.25);
    const tiny = dpCrit * 10;
    const fwd = simulate(orificeModel('orifice', tiny, { Cd, A, rho, mu, Re_crit: Re }), 2, 0.1).at('o_branch_mass_flow');
    const rev = simulate(orificeModel('orifice', -tiny, { Cd, A, rho, mu, Re_crit: Re }), 2, 0.1).at('o_branch_mass_flow');
    near(fwd, law(tiny), 1e-2, 'smooth laminar / turbulent law');
    near(rev, -law(tiny), 1e-2, 'reverse flow (odd)');
    const zero = simulate(orificeModel('orifice', 0, { Cd, A, rho }), 2, 0.1).at('o_branch_mass_flow');
    expect(Math.abs(zero)).toBeLessThan(1e-12);
  });

  it('tank (capacitance) filling through a resistance: p(t) = Ps + (P0 - Ps) exp(-t / (R C))', () => {
    const Ps = P_ATM + 100000, R = 1e6, C = 1e-5, P0 = P_ATM;
    const m: Model = {
      nodes: [node('src', 'pressure_source', { P: Ps }), node('R', 'fluid_resistance', { Rf: R }), node('C', 'fluid_capacitance', { Cf: C, P0 })],
      edges: [wire('src.p', 'R.p'), wire('R.n', 'C.p')],
    };
    const dt = 0.1, steps = 100;
    const sim = simulate(m, steps, dt);
    for (const k of [20, 50, 100]) {
      near(sim.across('C', 'p', k - 1), Ps + (P0 - Ps) * Math.exp(-(k * dt) / (R * C)), 0.01, `tank p(t=${k * dt})`);
    }
  });

  it('tank draining through a resistance to the atmosphere: p - p_atm = (P0 - p_atm) exp(-t / (R C))', () => {
    const R = 1e6, C = 1e-5, P0 = P_ATM + 50000;
    const m: Model = {
      nodes: [node('C', 'fluid_capacitance', { Cf: C, P0 }), node('R', 'fluid_resistance', { Rf: R }), node('ref', 'fluid_ref')],
      edges: [wire('C.p', 'R.p'), wire('R.n', 'ref.p')],
    };
    const dt = 0.1, steps = 100;
    const sim = simulate(m, steps, dt);
    near(sim.across('C', 'p', 49) - P_ATM, 50000 * Math.exp(-5 / (R * C)), 0.01, 'tank drain t=5');
    near(sim.across('C', 'p') - P_ATM, 50000 * Math.exp(-10 / (R * C)), 0.01, 'tank drain t=10');
  });

  it('mass flow source into a tank delivers mdot INTO the network: p(t) = P0 + mdot t / C', () => {
    const m: Model = {
      nodes: [node('Q', 'mass_flow_source', { mdot: 0.01 }), node('C', 'fluid_capacitance', { Cf: 1e-5 })],
      edges: [wire('Q.p', 'C.p')],
    };
    const sim = simulate(m, 5, 0.2);
    near(sim.across('C', 'p'), P_ATM + (0.01 * 1.0) / 1e-5, 1e-6, 'mass-flow-source charging');
  });

  it('inertance + capacitance oscillate with period 2 pi sqrt(Li Cf)', () => {
    // C p' = -mdot (flow leaves the tank into the line), Li mdot' = p - p_ref  ->  p - p_ref = dP cos(t / sqrt(Li C))
    const Li = 100, C = 1e-5, dP = 20000;
    const m: Model = {
      nodes: [node('C', 'fluid_capacitance', { Cf: C, P0: P_ATM + dP }), node('L', 'fluid_inertance', { Li }), node('ref', 'fluid_ref')],
      edges: [wire('C.p', 'L.p'), wire('L.n', 'ref.p')],
    };
    const T = 2 * Math.PI * Math.sqrt(Li * C);
    const dt = T / 400, steps = 900;
    const sim = simulate(m, steps, dt);
    const p = sim.series('Across_' + new DAEAssembler().assemble(m.nodes, m.edges).components.find((c) => c.blockId === 'C')!.portNodeMap.get('p') + '_(fluid)');
    const crossings: number[] = [];
    for (let i = 1; i < p.length; i++) {
      if ((p[i - 1] - P_ATM) > 0 && (p[i] - P_ATM) <= 0) crossings.push(sim.times[i - 1] + (dt * (p[i - 1] - P_ATM)) / (p[i - 1] - p[i]));
    }
    expect(crossings.length).toBeGreaterThanOrEqual(2);
    const period = crossings[1] - crossings[0];
    near(period, T, 0.03, 'inertance oscillation period');
  });

  it('check valve: conducts (dp - P_crack)/Rf forward, blocks reverse', () => {
    const fwd = simulate({
      nodes: [node('src', 'pressure_source', { P: P_ATM + 60000 }), node('v', 'check_valve', { Rf: 1e5, P_crack: 10000 }), node('ref', 'fluid_ref')],
      edges: [wire('src.p', 'v.p'), wire('v.n', 'ref.p')],
    }, 2, 0.1);
    near(fwd.at('v_branch_mass_flow'), (60000 - 10000) / 1e5, 1e-6, 'check valve forward');
    const rev = simulate({
      nodes: [node('src', 'pressure_source', { P: P_ATM - 50000 }), node('v', 'check_valve', { Rf: 1e5, P_crack: 10000 }), node('ref', 'fluid_ref')],
      edges: [wire('src.p', 'v.p'), wire('v.n', 'ref.p')],
    }, 2, 0.1);
    expect(Math.abs(rev.at('v_branch_mass_flow'))).toBeLessThan(1e-6);
  });

  it('relief valve opens on the pressure DIFFERENCE above P_set', () => {
    const run = (dp: number) => simulate({
      nodes: [node('src', 'pressure_source', { P: P_ATM + dp }), node('v', 'relief_valve', { P_set: 500000, Rf_open: 1e3, Rf_closed: 1e10 }), node('ref', 'fluid_ref')],
      edges: [wire('src.p', 'v.p'), wire('v.n', 'ref.p')],
    }, 2, 0.1).at('v_branch_mass_flow');
    expect(Math.abs(run(300000))).toBeLessThan(300000 / 1e10 * 1.01);
    near(run(900000), 900000 / 1e3, 1e-3, 'relief valve open flow');
  });
});

describe('WP-17 Gas: compressible orifice, pipe, chamber', () => {
  const Cd = 0.62, A = 1e-5, T = 293.15, gamma = 1.4, V = 0.01;
  const choked = (p0: number) => Cd * A * p0 * Math.sqrt(gamma / (R_AIR * T)) * Math.pow(2 / (gamma + 1), (gamma + 1) / (2 * (gamma - 1)));
  const rStar = Math.pow(2 / (gamma + 1), gamma / (gamma - 1));
  const subsonic = (p0: number, p: number) => {
    const r = p / p0;
    return r <= rStar ? choked(p0) : Cd * A * p0 * Math.sqrt((2 * gamma) / ((gamma - 1) * R_AIR * T)) * Math.sqrt(r ** (2 / gamma) - r ** ((gamma + 1) / gamma));
  };
  const fill = (p0: number): Model => ({
    nodes: [node('res', 'gas_fixed_res', { P: p0 }), node('R', 'gas_restriction', { area: A, Cd, T, gamma }), node('ch', 'gas_chamber', { V, T })],
    edges: [wire('res.a', 'R.a'), wire('R.b', 'ch.a')],
  });

  it('choked flow is constant while choked and the chamber pressure rises linearly: dp/dt = (R T / V) mdot*', () => {
    const p0 = 1e6;
    const sim = simulate(fill(p0), 40, 0.05); // t = 2 s, p stays well below r* p0 = 528 kPa
    const mStar = choked(p0);
    const flows = sim.series('R_branch_mass_flow');
    for (const q of flows.slice(2)) near(q, mStar, 1e-3, 'choked mdot*');
    near(sim.at('ch_state_pressure'), P_ATM + ((R_AIR * T) / V) * mStar * 2, 5e-3, 'chamber pressure at t=2 s');
  });

  it('full fill follows the isentropic orifice ODE (RK4 reference, subsonic tail included) up to the supply pressure', () => {
    const p0 = 300000; // 1 atm -> 3 atm: starts choked (r = 0.34), ends subsonic
    const sim = simulate(fill(p0), 120, 0.05); // t = 6 s
    const f = (p: number) => ((R_AIR * T) / V) * subsonic(p0, p);
    let p = P_ATM; const h = 0.001;
    for (let i = 0; i < 6000; i++) {
      const k1 = f(p), k2 = f(p + 0.5 * h * k1), k3 = f(p + 0.5 * h * k2), k4 = f(p + h * k3);
      p += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    }
    near(sim.at('ch_state_pressure'), p, 0.01, 'orifice fill (RK4 reference)');
  });

  it('flow reverses sign with the pressure difference and is finite at dp = 0', () => {
    const run = (pa: number, pb: number) => simulate({
      nodes: [node('a', 'gas_fixed_res', { P: pa }), node('b', 'gas_fixed_res', { P: pb }), node('R', 'gas_restriction', { area: A, Cd, T, gamma })],
      edges: [wire('a.a', 'R.a'), wire('b.a', 'R.b')],
    }, 2, 0.1).at('R_branch_mass_flow');
    near(run(200000, 100000), choked(200000), 1e-4, 'forward choked');
    near(run(100000, 200000), -choked(200000), 1e-4, 'reverse choked');
    expect(Math.abs(run(150000, 150000))).toBeLessThan(1e-12);
    const small = run(150001, 150000);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(1e-4);
  });

  it('isothermal chamber: flow source -> dp/dt = R T mdot / V (closed form), open port B closed', () => {
    const m: Model = {
      nodes: [node('src', 'gas_flow_source', { mdot: 0.001 }), node('sink', 'gas_fixed_res', { P: P_ATM }), node('ch', 'gas_chamber', { V, T })],
      edges: [wire('src.a', 'sink.a'), wire('src.b', 'ch.a')],
    };
    const sim = simulate(m, 20, 0.1);
    near(sim.at('ch_state_pressure'), P_ATM + (R_AIR * T * 0.001 * 2) / V, 1e-6, 'isothermal chamber pressure rise');
  });

  it('pipe: laminar Hagen-Poiseuille at low flow, Darcy-Weisbach p_a^2 - p_b^2 = f (L/D) R T G^2 at high flow', () => {
    const L = 2, D = 0.01, f = 0.03, mu = 1.81e-5;
    const run = (pa: number, pb: number) => simulate({
      nodes: [node('a', 'gas_fixed_res', { P: pa }), node('b', 'gas_fixed_res', { P: pb }), node('p', 'gas_pipe', { L, D, f, T, mu })],
      edges: [wire('a.a', 'p.a'), wire('b.a', 'p.b')],
    }, 2, 0.1).at('p_branch_mass_flow');
    // laminar: dp = 128 mu L Q / (pi D^4), Q = mdot / rho, rho = p_mean / (R T)
    const dpLam = 0.5, pm = P_ATM + dpLam / 2;
    const rho = pm / (R_AIR * T);
    near(run(P_ATM + dpLam, P_ATM), (dpLam * Math.PI * D ** 4 * rho) / (128 * mu * L), 5e-3, 'laminar pipe flow');
    // turbulent: p_a^2 - p_b^2 = f (L/D) R T (mdot / S)^2
    const pa = 400000, pb = 300000, S = (Math.PI * D * D) / 4;
    const G = Math.sqrt((pa * pa - pb * pb) / (f * (L / D) * R_AIR * T));
    near(run(pa, pb), G * S, 5e-3, 'isothermal turbulent pipe flow');
  });
});

describe('WP-17 steam: saturation properties, generator, nozzle, accumulator', () => {
  it('IF97 saturation line and Clausius-Clapeyron latent heat reproduce the steam tables', () => {
    // Cengel & Boles Table A-5 / IAPWS-IF97: [p kPa, Tsat degC, hfg kJ/kg, rho_g kg/m3 = 1/vg]
    const rows: [number, number, number, number][] = [[101.325, 99.97, 2256.5, 1 / 1.6720], [200, 120.21, 2201.6, 1 / 0.88578], [1000, 179.88, 2014.6, 1 / 0.19436]];
    for (const [p, Ts, hfg, rhoG] of rows) {
      near(waterSatTemperature(p * 1e3) - 273.15, Ts, 2e-4, `Tsat(${p} kPa)`);
      const T = Ts + 273.15;
      near(waterLatentHeat(T) / 1e3, hfg, 3e-3, `hfg(${p} kPa)`);
      near(waterSatVapourDensity(T), rhoG, 3e-3, `rho_g(${p} kPa)`);
    }
    near(waterSatPressure(373.15), 101417.99, 1e-5, 'psat(100 degC) IF97');
    near(waterSatLiquidDensity(373.15), 958.35, 1e-3, 'rho_f(100 degC)');
  });

  it('steam generator (fluid): mdot_steam = Q / h_fg at saturation, delivered through the Steam port', () => {
    const m: Model = {
      nodes: [node('gen', 'steam_generator_fluid', { Q: 1000 }), node('hdr', 'pressure_source', { P: 200000 }), node('ret', 'fluid_ref')],
      edges: [wire('gen.p', 'hdr.p'), wire('gen.n', 'ret.p')],
    };
    const sim = simulate(m, 2, 0.1);
    // steam leaves through p: the flow p -> n through the block is negative
    near(-sim.at('gen_branch_mass_flow'), 1000 / 2201.6e3, 2e-3, 'mdot = Q / hfg(200 kPa)');
  });

  it('steam nozzle: choked flow mdot = Cd A p0 sqrt(gamma/(R T0)) (2/(gamma+1))^((gamma+1)/(2(gamma-1)))', () => {
    const Cd = 0.5, d = 5e-4, gamma = 1.3, A = Math.PI * d * d / 4, T0 = 120.21 + 273.15;
    const m: Model = {
      nodes: [node('src', 'pressure_source', { P: 200000 }), node('n', 'steam_nozzle', { Cd, d, gamma }), node('ref', 'fluid_ref')],
      edges: [wire('src.p', 'n.p'), wire('n.n', 'ref.p')],
    };
    const sim = simulate(m, 2, 0.1);
    const expected = Cd * A * 200000 * Math.sqrt(gamma / (R_V * T0)) * Math.pow(2 / (gamma + 1), (gamma + 1) / (2 * (gamma - 1)));
    near(sim.at('n_branch_mass_flow'), expected, 3e-3, 'steam nozzle choked mdot');
  });

  it('steam accumulator: dp/dt = mdot_in / (V d rho_g/dp) along the saturation line', () => {
    // d rho_g / dp at 200 kPa from the Table A-5 neighbours 150 / 250 kPa (vg = 1.1594 / 0.71873 m3/kg), central difference
    const slope = (1 / 0.71873 - 1 / 1.1594) / 1e5;
    const V = 0.5, mdot = 0.01;
    const m: Model = {
      nodes: [node('Q', 'mass_flow_source', { mdot }), node('acc', 'steam_accumulator', { V }), node('sink', 'pressure_source', { P: 200000 })],
      edges: [wire('Q.p', 'acc.pin'), wire('acc.pout', 'sink.p')],
    };
    // the vessel is held at 200 kPa by the sink: flow out equals flow in; instead charge it alone from a flow source
    const alone: Model = { nodes: [m.nodes[0], m.nodes[1], node('seed', 'fluid_capacitance', { Cf: 1e-12, P0: 200000 })], edges: [wire('Q.p', 'acc.pin'), wire('acc.pin', 'seed.p')] };
    const sim = simulate(alone, 2, 0.01);
    const dpdt = (sim.across('acc', 'pin', 1) - sim.across('acc', 'pin', 0)) / 0.01;
    near(dpdt, mdot / (V * slope), 0.03, 'accumulator charging rate');
  });

  it('steam generator (electric boiler): warms to boil_temp, then mdot_steam = (eta P - k_loss (T_b - T_amb)) / h_fg; energy is conserved', () => {
    const P = 800, Vr = 230, eta = 0.95, kLoss = 1, Tamb = 25, Tb = 100, vol = 0.05; // litres
    const m: Model = {
      nodes: [node('v', 'dc_voltage', { V: Vr, R_int: 1e-6 }), node('gen', 'steam_generator', { power: P, v_rated: Vr, eta, k_loss: kLoss, ambient_temp: Tamb, boil_temp: Tb, tank_vol: vol }),
        node('gnd', 'ground'), node('load', 'temp_src', { T: 300 })],
      edges: [wire('v.p', 'gen.p'), wire('gen.n', 'v.n'), wire('v.n', 'gnd.a'), wire('gen.s', 'load.a')],
    };
    const dt = 0.25, steps = 360; // 90 s
    const sim = simulate(m, steps, dt);
    const Tw = sim.series('gen_state_T_w'), mw = sim.series('gen_state_m_w'), Qs = sim.series('gen_branch_heat_flow');
    // boiling reached and held at the boiling temperature
    near(Tw[Tw.length - 1], 373.15, 2e-3, 'water temperature at boil');
    // steady steam power and mass flow (h_fg(100 degC) = 2256.5 kJ/kg, IAPWS-IF97)
    const hfg = 2256.5e3;
    const net = eta * P - kLoss * (Tb - Tamb);
    near(Qs[Qs.length - 1], net, 0.01, 'steady steam heat Q_s = eta P - losses');
    const mdot = -(mw[mw.length - 1] - mw[mw.length - 21]) / (20 * dt);
    near(mdot, net / hfg, 0.02, 'steam mass flow rate');
    // first law over the whole run: electric input = water enthalpy rise + losses + latent heat delivered + (1 - eta) P direct loss is excluded (eta P enters)
    let eIn = 0, eLoss = 0, eSteam = 0;
    for (let i = 0; i < steps; i++) { eIn += eta * P * dt; eLoss += kLoss * (Tw[i] - (Tamb + 273.15)) * dt; eSteam += Qs[i] * dt; }
    const dH = (vol / 1000) * 998.2 * 4182 * (Tw[Tw.length - 1] - (Tamb + 273.15));
    near(eIn, dH + eLoss + eSteam, 0.03, 'energy balance eta*E_el = dH_water + E_loss + E_steam');
    // nothing is delivered below the boiling temperature
    expect(Qs[Math.floor(10 / dt)]).toBeLessThan(1);
  });
});

describe('WP-17 Moist air: psychrometrics, chamber, pipe, converters', () => {
  const p = P_ATM, T = 293.15, phi = 0.5;
  const pv = phi * PSAT_20C;
  const w = (EPS * pv) / (p - pv);
  const rho = (p - pv) / (R_A * T) + pv / (R_V * T);
  const sensorModel = (type: string, params: Record<string, any>): Model => ({
    nodes: [node('src', 'pressure_source', { P: p }), node('s', type, params), node('sc', 'scope')],
    edges: [wire('src.p', 's.a'), wire(`s.${type === 'ma_thermo_sensor' ? 'rho' : 'w'}`, 'sc.in1')],
  });

  it('humidity ratio and mixture density at a sample state (101325 Pa, 20 degC, 50 % RH)', () => {
    const rhoSim = simulate(sensorModel('ma_thermo_sensor', { T, phi }), 2, 0.1).at('s_branch_signal_rho');
    near(rhoSim, rho, 2e-3, 'mixture density (Dalton)');
    const xv = simulate(sensorModel('ma_moisture_sensor', { T, phi }), 2, 0.1).at('s_branch_signal_w');
    near(xv, w / (1 + w), 2e-3, 'water-vapour mass fraction (w = 0.622 pv / (p - pv))');
    // dry air limit
    near(simulate(sensorModel('ma_thermo_sensor', { T, phi: 0 }), 2, 0.1).at('s_branch_signal_rho'), p / (R_A * T), 1e-6, 'dry-air density');
  });

  it('pressure & temperature sensor reports both outputs', () => {
    const m: Model = {
      nodes: [node('src', 'pressure_source', { P: 123456 }), node('s', 'ma_pt_sensor', { T: 350 }), node('sc1', 'scope'), node('sc2', 'scope')],
      edges: [wire('src.p', 's.a'), wire('s.p', 'sc1.in1'), wire('s.t', 'sc2.in1')],
    };
    const sim = simulate(m, 2, 0.1);
    near(sim.at('s_branch_signal_p'), 123456, 1e-9, 'p out');
    near(sim.at('s_branch_signal_t'), 350, 1e-9, 't out');
  });

  it('flow source + chamber: dp/dt = R_mix T mdot / V (mass balance of the rigid volume), flow sensor reads the flow', () => {
    const Tc = 298.15, V = 0.1, mdot = 0.001;
    const m: Model = {
      nodes: [node('ref', 'ma_ref'), node('src', 'ma_flow_source', { rate: mdot }), node('fs', 'ma_flow_sensor'), node('ch', 'ma_chamber', { V, ambient_temp: 25, k_loss: 0, phi }),
        node('tsrc', 'temp_src', { T: Tc }), node('sc', 'scope')],
      edges: [wire('ref.g', 'src.a'), wire('src.b', 'fs.a'), wire('fs.b', 'ch.a'), wire('ch.h', 'tsrc.a'), wire('fs.m', 'sc.in1')],
    };
    const sim = simulate(m, 10, 0.1);
    const pv0 = phi * 3169.9; // psat(25 degC) = 3.1699 kPa (Cengel & Boles Table A-4)
    const w0 = (EPS * pv0) / (P_ATM - pv0);
    const Rmix = (R_A + w0 * R_V) / (1 + w0);
    // flow starts into a 1 atm chamber from the 0 Pa reference: only the chamber pressure RATE is checked
    const dpdt = (sim.at('ch_state_pressure') - sim.at('ch_state_pressure', 4)) / 0.5;
    near(dpdt, (Rmix * Tc * mdot) / V, 5e-3, 'moist-air chamber dp/dt');
    near(sim.at('fs_branch_signal_m'), mdot, 1e-6, 'flow sensor reading');
  });

  it('sealed chamber heated at constant volume obeys p / T = const (Gay-Lussac, ideal gas, constant mass)', () => {
    const m: Model = {
      nodes: [node('ch', 'ma_chamber', { V: 0.005, k_loss: 0, ambient_temp: 25, max_temp: 400, wall_mass: 0.5, food_mass: 0 }), node('Q', 'heat_src', { Q: 100 }), node('tref', 'thermal_ref')],
      edges: [wire('Q.b', 'ch.h'), wire('Q.a', 'tref.a')],
    };
    const sim = simulate(m, 40, 0.5);
    const T0 = 298.15;
    const Tend = sim.at('ch_state_temp');
    expect(Tend).toBeGreaterThan(T0 + 5);
    near(sim.at('ch_state_pressure') / Tend, P_ATM / T0, 2e-3, 'p / T invariant');
  });

  it('pipe: laminar Hagen-Poiseuille flow at low pressure drop and Darcy-Weisbach (Haaland) at high drop; wd = dp mdot / rho', () => {
    const Tg = 293.15, L = 2;
    const pipe = (dp: number, params: Record<string, any>): Sim => simulate({
      nodes: [node('src', 'pressure_source', { P: P_ATM + dp }), node('pp', 'ma_pipe', { L, resistance: 0, T: Tg, phi, UA: 0, ...params }), node('ref', 'fluid_ref'), node('tr', 'temp_src', { T: Tg }), node('sc', 'scope')],
      edges: [wire('src.p', 'pp.a'), wire('pp.b', 'ref.p'), wire('pp.h', 'tr.a'), wire('pp.wd', 'sc.in1')],
    }, 2, 0.1);
    const pvs = phi * PSAT_20C;
    const rhoAt = (pm: number) => (pm - pvs) / (R_A * Tg) + pvs / (R_V * Tg);
    // laminar
    const D1 = 0.01, dp1 = 1;
    const s1 = pipe(dp1, { D: D1, roughness: 0 });
    const mdot1 = (dp1 * Math.PI * D1 ** 4 * rhoAt(P_ATM + dp1 / 2)) / (128 * sutherland(Tg) * L);
    near(s1.at('pp_branch_mass_flow'), mdot1, 5e-3, 'laminar pipe flow');
    // turbulent: solve dp = f (L/D) mdot^2 / (2 rho S^2) with Haaland f by fixed point
    const D2 = 0.05, dp2 = 2000, rough = 4.6e-5, S = Math.PI * D2 * D2 / 4, mu = sutherland(Tg), rho2 = rhoAt(P_ATM + dp2 / 2);
    let mdot2 = 0.05;
    for (let i = 0; i < 200; i++) {
      const Re = (4 * mdot2) / (Math.PI * D2 * mu);
      const f = Math.pow(-1.8 * Math.log10(Math.pow(rough / D2 / 3.7, 1.11) + 6.9 / Re), -2);
      mdot2 = Math.sqrt((dp2 * 2 * rho2 * S * S * D2) / (f * L));
    }
    const s2 = pipe(dp2, { D: D2, roughness: rough });
    near(s2.at('pp_branch_mass_flow'), mdot2, 0.01, 'turbulent pipe flow (Haaland)');
    near(s2.at('pp_branch_signal_wd'), (dp2 * s2.at('pp_branch_mass_flow')) / rho2, 5e-3, 'friction power wd');
  });

  it('pipe heat exchange: Q = UA (T_H - T) into the gas', () => {
    const m: Model = {
      nodes: [node('pp', 'ma_pipe', { UA: 5, T: 293.15 }), node('tr', 'temp_src', { T: 333.15 }), node('sc', 'scope'), node('ref', 'fluid_ref')],
      edges: [wire('pp.h', 'tr.a'), wire('pp.wd', 'sc.in1'), wire('pp.a', 'ref.p'), wire('pp.b', 'ref.p')],
    };
    // both ends on the datum: no flow; only the thermal exchange is checked
    const sim = simulate(m, 2, 0.1);
    near(sim.at('pp_branch_heat_flow'), 5 * 40, 1e-9, 'pipe heat exchange');
  });

  it('piston chamber (translational converter): isothermal static equilibrium p = p_env + F / A and p V = P0 V0', () => {
    const A = 0.01, V0 = 1e-3, F = 500, Tg = 293.15;
    const run = (sign: number) => simulate({
      nodes: [node('cv', 'ma_trans_conv', { A, V0, h0: 1e4, k: 0, T: Tg, phi: 0 }), node('Th', 'temp_src', { T: Tg }), node('fs', 'force_source', { F: sign * F }),
        node('m', 'mass', { m: 1, b: 0 }), node('d', 'trans_damper', { b: 200 }), node('tref', 'trans_ref'), node('sc', 'scope')],
      edges: [wire('cv.h', 'Th.a'), wire('fs.a', 'cv.r'), wire('fs.b', 'tref.p'), wire('m.p', 'cv.r'), wire('d.r', 'cv.r'), wire('d.c', 'tref.p'), wire('cv.c', 'tref.p'), wire('cv.wd', 'sc.in1')],
    }, 200, 0.05);
    const a = run(1), b = run(-1);
    const pOf = (s: Sim) => (s.at('cv_state_m') * R_A * s.at('cv_state_Tg')) / (V0 + A * s.at('cv_state_x')); // p = m R T / V (ideal gas, dry: phi = 0)
    const compressed = pOf(a) > pOf(b) ? a : b;
    const pEq = P_ATM + F / A;
    near(pOf(compressed), pEq, 0.01, 'equilibrium pressure');
    near(compressed.at('cv_state_m') * R_A * compressed.at('cv_state_Tg'), P_ATM * V0, 0.01, 'gas mass conserved (p V = m R T = P0 V0 at T = T0)');
  });
});

describe('WP-17 F-034 / F-060 / unsupported: documented decisions', () => {
  it('F-034: steam and liquid blocks share the lumped Fluid domain (no distinct two-phase domain: documented deviation)', () => {
    const dom = (id: string) => [...new Set(lib(id).ports.filter((p) => p.domain !== 'Physical').map((p) => p.domain))];
    expect(dom('steam_nozzle')).toEqual(['Fluid']);
    expect(dom('fluid_resistance')).toEqual(['Fluid']);
    expect(dom('steam_accumulator')).toEqual(['Fluid']);
  });

  it('F-060: no hydraulic pump / motor / cylinder with a shaft port; pump_il is an ideal pressure head', () => {
    expect(lib('pump_il').ports.map((p) => p.domain)).not.toContain('Rotational');
    expect(lib('pump_il').description).toMatch(/no shaft port/);
  });

  it('the two moist-air blocks without a defensible spec are explicitly unsupported and list the missing specification', () => {
    for (const id of ['ma_separator', 'ma_selector']) {
      expect(UNSUPPORTED_BLOCKS[id]).toBeDefined();
      expect(UNSUPPORTED_BLOCKS[id].missingSpec).toMatch(/Missing/);
      const nodes = [node('dut', id, {})];
      const diags = validateTopology(nodes, []).diagnostics.filter((d) => d.code === 'unsupported-block');
      expect(diags).toHaveLength(1);
    }
    for (const id of ['ma_pipe', 'ma_rot_conv', 'ma_trans_conv', 'ma_pt_sensor']) expect(UNSUPPORTED_BLOCKS[id]).toBeUndefined();
  });

  it('every fluid / gas / steam / moist-air block has specific equation and description text (no generic label)', () => {
    const ids = VLAB_LIBRARY.filter((d) => ['Fluid', 'Fluid / Steam', 'Isothermal Liquid', 'Gas'].includes(d.type)).flatMap((d) => d.blocks.map((b) => b.id));
    for (const id of [...ids, 'steam_generator']) {
      expect(isGenericText(lib(id).equation), `${id} equation`).toBe(false);
      expect(isGenericText(lib(id).description), `${id} description`).toBe(false);
    }
  });
});

describe('WP-17 report', () => {
  it('prints the reference errors', () => {
    // eslint-disable-next-line no-console
    console.log('[WP-17 reference errors]\n' + REPORT.join('\n'));
    expect(REPORT.length).toBeGreaterThan(0);
  });
});
