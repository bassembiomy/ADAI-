import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { DAEStructureError } from '../vlabStructure';
import { validateBlockParams } from '../vlabParams';
import { canonicalizeLegacyParams, normalizeLegacyVLabGraph } from '../../../components/vlab/vlabModelMigration';
import { ThermalFixtures } from '../whitebox_benchmarks/boundary_generator/ThermalFixtures';
import { SimulationHarness } from '../whitebox_benchmarks/boundary_generator/SimulationHarness';
import { isGenericText } from './contractChecks';

/**
 * WP-15 (merged WP-16): Thermal and Magnetic blocks against their published equations.
 *
 * Every expected value is derived IN THIS FILE from the published relation (Simscape Foundation > Thermal / Magnetic block
 * reference, Incropera & DeWitt for conduction / convection / radiation, Hopkinson's law, the energy method of Woodson &
 * Melcher for the reluctance force) or from a closed-form solution named at the test; nothing is read back from the code
 * under test. Convention (Simscape): through variable positive A -> B through the block, across = x_A - x_B; the Thermal
 * Reference is ABSOLUTE ZERO (0 K) so every thermal across variable is an absolute temperature.
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
  at: (name: string, i?: number) => number;
  series: (name: string) => number[];
  across: (block: string, port: string, i?: number) => number;
  acrossSeries: (block: string, port: string) => number[];
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
    history, state, times: history.map((s) => s.time),
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

const lib = (id: string) => VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === id)!;
const REPORT: string[] = [];
const note = (name: string, errPct: number) => REPORT.push(`${name}: ${errPct.toExponential(2)} %`);
const pct = (actual: number, expected: number) => (100 * Math.abs(actual - expected)) / Math.max(Math.abs(expected), 1e-12);

const SIGMA = 5.670374419e-8; // Stefan-Boltzmann constant, W/(m^2 K^4) (CODATA 2018)
const MU0 = 4 * Math.PI * 1e-7;

const structureError = (m: Model, topologyValidation = true): DAEStructureError => {
  const engine = new VLabPhysicsEngine();
  engine.setTopologyValidation(topologyValidation);
  try { engine.simulateStep(m.nodes, m.edges, null, 0.01); } catch (e) { if (e instanceof DAEStructureError) return e; throw e; }
  throw new Error('expected a DAEStructureError');
};

// ── 1. thermal reference is absolute zero, sensors read absolute kelvin (F-011) ──────────────────────────────────────
describe('WP-15 F-011: Thermal Reference = 0 K, temperature sensors read absolute temperature', () => {
  const sensorModel = (T: number, bTo: 'ref' | 'open' | { T: number }): Model => {
    const nodes = [node('src', 'temp_src', { T }), node('s', 'temp_sensor'), node('scope', 'scope')];
    const edges = [wire('src.a', 's.a'), wire('s.t', 'scope.in1')];
    if (bTo === 'ref') { nodes.push(node('ref', 'thermal_ref')); edges.push(wire('s.b', 'ref.a')); }
    else if (bTo !== 'open') { nodes.push(node('src2', 'temp_src', { T: bTo.T })); edges.push(wire('s.b', 'src2.a')); }
    return { nodes, edges };
  };

  it('sensor with B on the Thermal Reference reads the ABSOLUTE temperature (350 K, not 350 - 293.15)', () => {
    const sim = simulate(sensorModel(350, 'ref'), 3, 0.01);
    near(sim.at('s_branch_signal_t'), 350, 1e-9, 'T_out');
    note('sensor vs reference (350 K)', pct(sim.at('s_branch_signal_t'), 350));
  });

  it('the Thermal Reference node is exactly 0 K', () => {
    const sim = simulate(sensorModel(350, 'ref'), 2, 0.01);
    expect(Math.abs(sim.across('ref', 'a'))).toBeLessThan(1e-12);
  });

  it('a sensor with B left open reads against the reference too (absolute temperature)', () => {
    const sim = simulate(sensorModel(412.5, 'open'), 2, 0.01);
    near(sim.at('s_branch_signal_t'), 412.5, 1e-9, 'T_out');
  });

  it('a sensor between two temperatures outputs T_A - T_B (differential use is unchanged)', () => {
    const sim = simulate(sensorModel(350, { T: 300 }), 2, 0.01);
    near(sim.at('s_branch_signal_t'), 50, 1e-9, 'T_out');
  });

  it('a cryogenic source reads its true temperature (no 293.15 K floor anywhere)', () => {
    const sim = simulate(sensorModel(4.2, 'ref'), 2, 0.01);
    near(sim.at('s_branch_signal_t'), 4.2, 1e-9, 'T_out');
  });

  it('the whitebox T-01 / T-02 fixtures probe the SENSOR output again and agree with the analytic solution', () => {
    const t01 = ThermalFixtures.createThermalConductionCircuit(350, 2, 0.02);
    expect(t01.probes[0].sourceHandle).toBe('t_s');
    expect(t01.probes[0].engineVariable).toBeUndefined();
    const r1 = SimulationHarness.runBoundarySimulation(t01);
    // T-01: the source pins the node at 350 K, the sensor reads it against 0 K
    r1.signals['T_sensor'].forEach((s: number) => near(s, 350, 1e-9, 'T-01'));

    const k = 5, C = 50, Thot = 350, T0 = 293.15;
    const t02 = ThermalFixtures.createThermalMassTransient(Thot, k, C, 0.5);
    expect(t02.probes[0].sourceHandle).toBe('t_s');
    expect(t02.probes[0].engineVariable).toBeUndefined();
    const r2 = SimulationHarness.runBoundarySimulation(t02);
    let worst = 0;
    r2.time.forEach((t: number, i: number) => {
      const T = r2.signals['T_mass'][i];
      // T(t) = Tinf + (T0 - Tinf) exp(-t k / C)  (first order lag of a thermal mass through a conductance k, tau = C / k)
      worst = Math.max(worst, Math.abs(T - (Thot + (T0 - Thot) * Math.exp(-t * k / C))));
    });
    expect(worst / (Thot - T0)).toBeLessThan(0.01);
    note('T-02 through the sensor, max |T - exact| / step', (100 * worst) / (Thot - T0));
  });
});

// ── 2. thermal mass cooling / heating (Q = C dT/dt through a conductance) ────────────────────────────────────────────
describe('WP-15 thermal mass: T(t) = Tinf + (T0 - Tinf) exp(-t k / C)', () => {
  const cooling = (T0: number, Tinf: number, k: number, C: number): Model => ({
    nodes: [node('env', 'temp_src', { T: Tinf }), node('g', 'conductive_heat', { k }), node('m', 'thermal_mass', { C, T0 }), node('s', 'temp_sensor'), node('ref', 'thermal_ref')],
    edges: [wire('env.a', 'g.a'), wire('g.b', 'm.a'), wire('m.a', 's.a'), wire('s.b', 'ref.a')],
  });

  it('cooling from 400 K to a 300 K environment: time constant C / k, ambient taken from the source (not 293.15 K)', () => {
    const T0 = 400, Tinf = 300, k = 2, C = 100, dt = 0.5, steps = 300;
    const sim = simulate(cooling(T0, Tinf, k, C), steps, dt);
    const T = sim.series('s_branch_signal_t');
    let worst = 0;
    sim.times.forEach((t, i) => { worst = Math.max(worst, Math.abs(T[i] - (Tinf + (T0 - Tinf) * Math.exp(-t * k / C)))); });
    expect(worst / (T0 - Tinf)).toBeLessThan(0.005);
    note('thermal mass cooling, max |T - exact| / step', (100 * worst) / (T0 - Tinf));
    // settles on the SOURCE temperature 300 K, not on a hidden 293.15 K ambient
    near(T[steps - 1], Tinf + (T0 - Tinf) * Math.exp(-sim.times[steps - 1] * k / C), 2e-3, 'T(150 s)');
  });

  it('heating from below (T0 < Tinf) and a fractional capacity', () => {
    const T0 = 250.5, Tinf = 320, k = 0.75, C = 12.5, dt = 0.05, steps = 200;
    const sim = simulate(cooling(T0, Tinf, k, C), steps, dt);
    const T = sim.series('s_branch_signal_t');
    let worst = 0;
    sim.times.forEach((t, i) => { worst = Math.max(worst, Math.abs(T[i] - (Tinf + (T0 - Tinf) * Math.exp(-t * k / C)))); });
    expect(worst / (Tinf - T0)).toBeLessThan(0.005);
  });

  it('the initial temperature T0 is honoured (default 293.15 K, 0 K and fractions are valid)', () => {
    const m = (extra: Record<string, any>): Model => ({
      nodes: [node('m', 'thermal_mass', { C: 1e6, ...extra }), node('hs', 'heat_src', { Q: 0 }), node('ref', 'thermal_ref'), node('s', 'temp_sensor')],
      edges: [wire('hs.b', 'm.a'), wire('hs.a', 'ref.a'), wire('m.a', 's.a'), wire('s.b', 'ref.a')],
    });
    near(simulate(m({}), 2, 0.01).at('s_branch_signal_t', 0), 293.15, 1e-6, 'default T0');
    near(simulate(m({ T0: 0 }), 2, 0.01).at('s_branch_signal_t', 0), 0, 1, 'T0 = 0 K (abs err)');
    expect(simulate(m({ T0: 0 }), 2, 0.01).at('s_branch_signal_t', 0)).toBeLessThan(1e-3);
    near(simulate(m({ T0: 311.37 }), 2, 0.01).at('s_branch_signal_t', 0), 311.37, 1e-6, 'T0 = 311.37 K');
  });

  it('an isolated mass heated by a heat flow source: T(t) = T0 + Q t / C exactly (energy balance)', () => {
    const Q = 40, C = 200, T0 = 300, dt = 0.1, steps = 100;
    const sim = simulate({
      nodes: [node('hs', 'heat_src', { Q }), node('m', 'thermal_mass', { C, T0 }), node('ref', 'thermal_ref')],
      edges: [wire('hs.a', 'ref.a'), wire('hs.b', 'm.a')],
    }, steps, dt);
    const T = sim.acrossSeries('m', 'a');
    [10, 50, 100].forEach((k) => near(T[k - 1], T0 + (Q * k * dt) / C, 2e-4, `T(${k * dt})`));
    note('heat source into a mass, T(10 s)', pct(T[steps - 1], T0 + (Q * steps * dt) / C));
  });
});

// ── 3. conduction chain, convection, radiation (steady state) ────────────────────────────────────────────────────────
describe('WP-15 steady heat transfer: conduction chain, convection, radiation', () => {
  it('series conduction: Q = (T1 - T2) / (1/k1 + 1/k2), the middle node sits at T1 - Q / k1', () => {
    const T1 = 400, T2 = 300, k1 = 2, k2 = 3;
    const Q = (T1 - T2) / (1 / k1 + 1 / k2);
    const sim = simulate({
      nodes: [node('h', 'temp_src', { T: T1 }), node('c', 'temp_src', { T: T2 }), node('l1', 'conductive_heat', { k: k1 }), node('l2', 'conductive_heat', { k: k2 })],
      edges: [wire('h.a', 'l1.a'), wire('l1.b', 'l2.a'), wire('l2.b', 'c.a')],
    }, 2, 0.01);
    near(sim.at('l1_branch_heat_flow'), Q, 1e-9, 'Q through l1');
    near(sim.at('l2_branch_heat_flow'), Q, 1e-9, 'Q through l2');
    near(sim.across('l1', 'b'), T1 - Q / k1, 1e-9, 'T_mid');
    note('conduction chain Q', pct(sim.at('l1_branch_heat_flow'), Q));
  });

  it('convection: Q = h A (Ts - Tf), also negative for a cold surface', () => {
    const run = (Ts: number, Tf: number, h: number, A: number) => simulate({
      nodes: [node('s', 'temp_src', { T: Ts }), node('f', 'temp_src', { T: Tf }), node('cv', 'convective_heat', { h, A })],
      edges: [wire('s.a', 'cv.a'), wire('cv.b', 'f.a')],
    }, 2, 0.01).at('cv_branch_heat_flow');
    near(run(350, 300, 25, 0.4), 25 * 0.4 * 50, 1e-9, 'Q hot surface');
    near(run(280, 300, 12.5, 0.08), 12.5 * 0.08 * -20, 1e-9, 'Q cold surface');
    note('convection Q', pct(run(350, 300, 25, 0.4), 500));
  });

  it('radiation: Q = sigma eps A (Ta^4 - Tb^4) between two fixed absolute temperatures', () => {
    const eps = 0.8, A = 0.5, Ta = 600, Tb = 300;
    const sim = simulate({
      nodes: [node('a', 'temp_src', { T: Ta }), node('b', 'temp_src', { T: Tb }), node('rad', 'radiative_heat', { eps, A })],
      edges: [wire('a.a', 'rad.a'), wire('rad.b', 'b.a')],
    }, 2, 0.01);
    const Q = SIGMA * eps * A * (Ta ** 4 - Tb ** 4);
    near(sim.at('rad_branch_heat_flow'), Q, 1e-9, 'Q');
    note('radiation Q', pct(sim.at('rad_branch_heat_flow'), Q));
  });

  it('radiation balance with a heat source: sigma eps A (T^4 - Tenv^4) = Q gives T = (Q / (sigma eps A) + Tenv^4)^(1/4)', () => {
    const Q = 200, eps = 0.8, A = 0.5, Tenv = 300;
    // the quartic sigma eps A T^4 - (Q + sigma eps A Tenv^4) = 0 has the single positive root below
    const Texact = Math.pow(Q / (SIGMA * eps * A) + Tenv ** 4, 0.25);
    const sim = simulate({
      nodes: [node('hs', 'heat_src', { Q }), node('ref', 'thermal_ref'), node('rad', 'radiative_heat', { eps, A }), node('env', 'temp_src', { T: Tenv })],
      edges: [wire('hs.a', 'ref.a'), wire('hs.b', 'rad.a'), wire('rad.b', 'env.a')],
    }, 2, 0.01);
    near(sim.across('rad', 'a'), Texact, 1e-8, 'T');
    note('radiation balance T', pct(sim.across('rad', 'a'), Texact));
    expect(Texact).toBeGreaterThan(300);
  });

  it('a radiating mass settles on the same quartic root (transient reaches steady state)', () => {
    const Q = 100, eps = 0.9, A = 0.2, Tenv = 293.15, C = 50;
    const Texact = Math.pow(Q / (SIGMA * eps * A) + Tenv ** 4, 0.25);
    const sim = simulate({
      nodes: [node('hs', 'heat_src', { Q }), node('ref', 'thermal_ref'), node('m', 'thermal_mass', { C, T0: Tenv }),
        node('rad', 'radiative_heat', { eps, A }), node('env', 'temp_src', { T: Tenv })],
      edges: [wire('hs.a', 'ref.a'), wire('hs.b', 'm.a'), wire('m.a', 'rad.a'), wire('rad.b', 'env.a')],
    }, 300, 2);
    // linearised time constant at the root: C / (4 sigma eps A T^3); 600 s is many time constants
    const tau = C / (4 * SIGMA * eps * A * Texact ** 3);
    expect(sim.times[299]).toBeGreaterThan(5 * tau);
    near(sim.across('m', 'a'), Texact, 2e-3, 'T(600 s)');
  });
});

// ── 4. heater: P = V^2 / R and energy conservation (F-044) ───────────────────────────────────────────────────────────
describe('WP-15 F-044: thermal_resistor turns P = V^2 / R into heat flow, energy conserved', () => {
  const heater = (V: number, R: number, link: { k: number; Tenv: number } | { C: number; T0: number }): Model => {
    const nodes = [node('v', 'dc_voltage', { V, R_int: 0 }), node('g', 'ground'), node('h', 'thermal_resistor', { R })];
    const edges = [wire('v.p', 'h.a'), wire('h.b', 'g.a'), wire('v.n', 'g.a')];
    if ('k' in link) {
      nodes.push(node('l', 'conductive_heat', { k: link.k }), node('env', 'temp_src', { T: link.Tenv }));
      edges.push(wire('h.h', 'l.a'), wire('l.b', 'env.a'));
    } else {
      nodes.push(node('m', 'thermal_mass', { C: link.C, T0: link.T0 }), node('ref', 'thermal_ref'));
      edges.push(wire('h.h', 'm.a'));
    }
    return { nodes, edges };
  };

  it('230 V across 35 ohm: heat flow into the thermal port = V^2 / R = 1511.43 W and equals the electrical power V I', () => {
    const V = 230, R = 35;
    const sim = simulate(heater(V, R, { k: 10, Tenv: 293.15 }), 3, 0.01);
    const P = (V * V) / R;
    const Q = sim.at('h_branch_heat_flow');
    near(Q, P, 1e-9, 'Q = V^2/R');
    // electrical power into the resistor: v_ab * i_ab (through variable positive a -> b)
    const Pel = (sim.across('h', 'a') - sim.across('h', 'b')) * sim.at('h_branch_current');
    near(Pel, Q, 1e-9, 'P_el = Q (energy conservation)');
    near(sim.at('l_branch_heat_flow'), P, 1e-9, 'all of it flows through the link');
    // the node above the ambient by Q / k
    near(sim.across('h', 'h'), 293.15 + P / 10, 1e-9, 'T_h = Tenv + P / k');
    note('heater Q = V^2/R', pct(Q, P));
  });

  it('lossless heating of a mass: C (T - T0) = P t (all the electrical energy is stored as heat)', () => {
    const V = 12, R = 0.5, C = 800, T0 = 295, dt = 0.1, steps = 100;
    const P = (V * V) / R; // 288 W
    const sim = simulate(heater(V, R, { C, T0 }), steps, dt);
    const T = sim.acrossSeries('m', 'a');
    [10, 50, 100].forEach((k) => near(C * (T[k - 1] - T0), P * k * dt, 5e-4, `stored energy at ${k * dt} s`));
    note('heater energy balance (10 s)', pct(C * (T[steps - 1] - T0), P * steps * dt));
  });

  it('a heater with an open thermal port is rejected before assembly, port named (the heat has nowhere to go)', () => {
    const m: Model = {
      nodes: [node('v', 'dc_voltage', { V: 10, R_int: 0 }), node('g', 'ground'), node('h', 'thermal_resistor', { R: 10 })],
      edges: [wire('v.p', 'h.a'), wire('h.b', 'g.a'), wire('v.n', 'g.a')],
    };
    // editor layer: the required-port table (derived from the Jacobian) names the open port before assembly
    expect(() => new VLabPhysicsEngine().simulateStep(m.nodes, m.edges, null, 0.01)).toThrow(/Required port "h" of .*thermal_resistor.* is not connected/);
  });
});

// ── 5. open ports, source ports, floating networks (F-064 rest) ──────────────────────────────────────────────────────
describe('WP-15 F-064: explicit thermal reference semantics (no name-based or domain-based grounding)', () => {
  it('an unconnected thermal port is OPEN (adiabatic): a mass behind a link with an open far end does not cool', () => {
    const sim = simulate({
      nodes: [node('m', 'thermal_mass', { C: 100, T0: 350 }), node('g', 'conductive_heat', { k: 5 })],
      edges: [wire('m.a', 'g.a')],
    }, 20, 0.5);
    near(sim.acrossSeries('m', 'a')[19], 350, 1e-9, 'T_mass');
    expect(Math.abs(sim.at('g_branch_heat_flow'))).toBeLessThan(1e-9);
  });

  it('a heat flow source with an open port is rejected by name', () => {
    const m: Model = {
      nodes: [node('hs', 'heat_src', { Q: 10 }), node('m', 'thermal_mass', { C: 10 })],
      edges: [wire('hs.b', 'm.a')],
    };
    expect(() => new VLabPhysicsEngine().simulateStep(m.nodes, m.edges, null, 0.01)).toThrow(/Required port "a" of .*heat_src.* is not connected/);
  });

  it('a floating thermal network (no reference, no mass, no temperature source) is reported with a clear diagnostic', () => {
    const e = structureError({
      nodes: [node('hs', 'heat_src', { Q: 10 }), node('r', 'ctrl_heat_src'), node('g', 'conductive_heat', { k: 1 }), node('g2', 'conductive_heat', { k: 1 }), node('ps', 'ps_constant', { value: 1 })],
      edges: [wire('hs.b', 'g.a'), wire('g.b', 'g2.a'), wire('g2.b', 'hs.a'), wire('ps.y', 'r.s'), wire('r.a', 'g.a'), wire('r.b', 'g2.b')],
    });
    expect(e.message).toMatch(/Floating thermal network/);
    expect(e.message).toMatch(/Thermal Reference/);
  });

  it('a thermal network with a Thermal Reference is not floating (conduction to the reference only: Q = 0 K datum)', () => {
    const sim = simulate({
      nodes: [node('hs', 'heat_src', { Q: 30 }), node('g', 'conductive_heat', { k: 3 }), node('ref', 'thermal_ref')],
      edges: [wire('hs.a', 'ref.a'), wire('hs.b', 'g.a'), wire('g.b', 'ref.a')],
    }, 2, 0.01);
    // all 30 W flow through k = 3 W/K to the 0 K datum: the source node sits at 10 K absolute
    near(sim.across('g', 'a'), 10, 1e-9, 'T');
  });

  it('ctrl_temp_src with B open sets the ABSOLUTE temperature S (T_A - 0 K = S) and ctrl_heat_src delivers S watts', () => {
    const t = simulate({
      nodes: [node('ps', 'ps_constant', { value: 320 }), node('c', 'ctrl_temp_src'), node('g', 'conductive_heat', { k: 2 }), node('ref', 'thermal_ref')],
      edges: [wire('ps.y', 'c.s'), wire('c.a', 'g.a'), wire('g.b', 'ref.a')],
    }, 2, 0.01);
    near(t.across('c', 'a'), 320, 1e-9, 'T_A');
    near(t.at('g_branch_heat_flow'), 2 * 320, 1e-9, 'Q');
    const q = simulate({
      nodes: [node('ps', 'ps_constant', { value: 40 }), node('c', 'ctrl_heat_src'), node('g', 'conductive_heat', { k: 2 }), node('ref', 'thermal_ref')],
      edges: [wire('ps.y', 'c.s'), wire('c.a', 'ref.a'), wire('c.b', 'g.a'), wire('g.b', 'ref.a')],
    }, 2, 0.01);
    near(q.at('g_branch_heat_flow'), 40, 1e-9, 'Q');
    near(q.across('g', 'a'), 20, 1e-9, 'T = Q / k');
  });

  it('heat_flow_sensor reads the heat flow from A to B without disturbing the network', () => {
    const sim = simulate({
      nodes: [node('hs', 'heat_src', { Q: 50 }), node('ref', 'thermal_ref'), node('q', 'heat_flow_sensor'), node('g', 'conductive_heat', { k: 1 })],
      edges: [wire('hs.a', 'ref.a'), wire('hs.b', 'q.a'), wire('q.b', 'g.a'), wire('g.b', 'ref.a')],
    }, 2, 0.01);
    near(sim.at('q_branch_signal_h'), 50, 1e-9, 'Q_out');
    near(sim.across('g', 'a'), 50, 1e-9, 'T');
  });
});

// ── 6. magnetic circuits (Hopkinson's law) ───────────────────────────────────────────────────────────────────────────
describe('WP-15 magnetic circuits: mmf = R Phi, series / parallel reluctances, sources, sensors', () => {
  it('series reluctances: Phi = mmf / (R1 + R2), the mmf divides in proportion to R', () => {
    const F = 100, R1 = 1e5, R2 = 2e5;
    const Phi = F / (R1 + R2);
    const sim = simulate({
      nodes: [node('f', 'mag_mmf_source', { MMF: F }), node('r1', 'reluctance', { R: R1 }), node('r2', 'reluctance', { R: R2 }), node('ref', 'mag_ref')],
      edges: [wire('f.n', 'r1.n'), wire('r1.s', 'r2.n'), wire('r2.s', 'f.s'), wire('f.s', 'ref.n')],
    }, 2, 0.01);
    near(sim.at('r1_branch_flux'), Phi, 1e-9, 'Phi');
    near(sim.across('r1', 's'), F - Phi * R1, 1e-9, 'mmf at the tap');
    note('series reluctance Phi', pct(sim.at('r1_branch_flux'), Phi));
  });

  it('parallel reluctances: Phi_total = mmf (1/R1 + 1/R2), the flux divides inversely with R', () => {
    const F = 100, R1 = 1e5, R2 = 2e5;
    const sim = simulate({
      nodes: [node('f', 'mag_mmf_source', { MMF: F }), node('r1', 'reluctance', { R: R1 }), node('r2', 'reluctance', { R: R2 }), node('ref', 'mag_ref')],
      edges: [wire('f.n', 'r1.n'), wire('f.n', 'r2.n'), wire('r1.s', 'f.s'), wire('r2.s', 'f.s'), wire('f.s', 'ref.n')],
    }, 2, 0.01);
    near(sim.at('r1_branch_flux') + sim.at('r2_branch_flux'), F * (1 / R1 + 1 / R2), 1e-9, 'Phi_total');
    near(sim.at('r1_branch_flux') / sim.at('r2_branch_flux'), R2 / R1, 1e-9, 'flux ratio');
  });

  it('fundamental reluctance implements the printed equation R = l / (mu0 mu_r A) (F-064 / equation stated in the UI)', () => {
    const l = 0.2, A = 4e-4, mur = 2500, F = 50;
    const R = l / (MU0 * mur * A);
    const sim = simulate({
      nodes: [node('f', 'mag_mmf_source', { MMF: F }), node('c', 'fundamental_reluctance', { l, A, mu_r: mur }), node('ref', 'mag_ref')],
      edges: [wire('f.n', 'c.n'), wire('c.s', 'f.s'), wire('f.s', 'ref.n')],
    }, 2, 0.01);
    near(sim.at('c_branch_flux'), F / R, 1e-6, 'Phi = mmf / R');
    note('fundamental reluctance Phi', pct(sim.at('c_branch_flux'), F / R));
    // a longer, thinner or less permeable core has more reluctance
    const run = (p: Record<string, number>) => simulate({
      nodes: [node('f', 'mag_mmf_source', { MMF: F }), node('c', 'fundamental_reluctance', p), node('ref', 'mag_ref')],
      edges: [wire('f.n', 'c.n'), wire('c.s', 'f.s'), wire('f.s', 'ref.n')],
    }, 2, 0.01).at('c_branch_flux');
    near(run({ l: 2 * l, A, mu_r: mur }), F / (2 * R), 1e-6, 'double length');
    near(run({ l, A: 2 * A, mu_r: mur }), 2 * F / R, 1e-6, 'double area');
    near(run({ l, A, mu_r: 2 * mur }), 2 * F / R, 1e-6, 'double permeability');
  });

  it('flux source: the mmf across a reluctance is R Phi (and the sign follows the through-variable convention)', () => {
    const Phi = 1e-3, R = 1e5;
    const sim = simulate({
      nodes: [node('p', 'mag_flux_source', { phi: Phi }), node('r', 'reluctance', { R }), node('ref', 'mag_ref')],
      edges: [wire('r.n', 'p.s'), wire('r.s', 'p.n'), wire('p.n', 'ref.n')],
    }, 2, 0.01);
    near(sim.at('r_branch_flux'), Phi, 1e-9, 'Phi in R');
    near(sim.across('r', 'n') - sim.across('r', 's'), Phi * R, 1e-9, 'mmf drop = R Phi');
  });

  it('variable reluctance follows its control signal, never below Rmin, and uses R while the port is unwired', () => {
    const F = 100;
    const run = (ctrl: number | null, extra: Record<string, number> = {}) => {
      const nodes = [node('f', 'mag_mmf_source', { MMF: F }), node('v', 'variable_reluctance', { Rmin: 1e5, ...extra }), node('ref', 'mag_ref')];
      const edges = [wire('f.n', 'v.n'), wire('v.s', 'f.s'), wire('f.s', 'ref.n')];
      if (ctrl !== null) { nodes.push(node('c', 'ps_constant', { value: ctrl })); edges.push(wire('c.y', 'v.ctrl')); }
      return simulate({ nodes, edges }, 2, 0.01).at('v_branch_flux');
    };
    near(run(4e5), F / 4e5, 1e-9, 'R = ctrl');
    near(run(1e3), F / 1e5, 1e-9, 'floored at Rmin');
    near(run(null, { R: 5e5 }), F / 5e5, 1e-9, 'unwired: parameter R');
  });

  it('controlled mmf source follows its signal (negative and fractional values are valid) and uses MMF while unwired', () => {
    const run = (sig: number | null) => {
      const nodes = [node('s', 'mag_controlled_mmf', { MMF: 25 }), node('r', 'reluctance', { R: 1e4 }), node('ref', 'mag_ref')];
      const edges = [wire('s.n', 'r.n'), wire('r.s', 's.s'), wire('s.s', 'ref.n')];
      if (sig !== null) { nodes.push(node('c', 'ps_constant', { value: sig })); edges.push(wire('c.y', 's.src')); }
      return simulate({ nodes, edges }, 2, 0.01).at('r_branch_flux');
    };
    near(run(-30.5), -30.5 / 1e4, 1e-9, 'negative mmf');
    near(run(null), 25 / 1e4, 1e-9, 'unwired: parameter MMF');
  });

  it('mmf and flux sensors output mmf (N - S) and the flux through the branch', () => {
    const F = 80, R = 4e4;
    const sim = simulate({
      nodes: [node('f', 'mag_mmf_source', { MMF: F }), node('fs', 'mag_flux_sensor'), node('r', 'reluctance', { R }), node('ms', 'mag_mmf_sensor'), node('ref', 'mag_ref')],
      edges: [wire('f.n', 'fs.n'), wire('fs.s', 'r.n'), wire('r.s', 'f.s'), wire('ms.n', 'r.n'), wire('ms.s', 'r.s'), wire('f.s', 'ref.n')],
    }, 2, 0.01);
    near(sim.at('fs_branch_signal_phi'), F / R, 1e-9, 'flux sensor');
    near(sim.at('ms_branch_signal_f'), F, 1e-9, 'mmf sensor');
  });

  it('permanent magnet: mmf = Hc Lm - Phi Rm drives flux through a load reluctance', () => {
    const Hc = 8e4, Lm = 0.01, Rm = 2e5, RL = 3e5;
    const sim = simulate({
      nodes: [node('pm', 'permanent_magnet', { Hc, Lm, Rm }), node('r', 'reluctance', { R: RL }), node('ref', 'mag_ref')],
      edges: [wire('pm.n', 'r.n'), wire('r.s', 'pm.s'), wire('pm.s', 'ref.n')],
    }, 2, 0.01);
    near(sim.at('r_branch_flux'), (Hc * Lm) / (Rm + RL), 1e-9, 'Phi = Hc Lm / (Rm + RL)');
  });

  it('an unconnected magnetic port is OPEN (zero flux), not grounded by its name `n`', () => {
    const F = 100;
    const sim = simulate({
      nodes: [node('f', 'mag_mmf_source', { MMF: F }), node('r', 'reluctance', { R: 1e5 }), node('ref', 'mag_ref')],
      edges: [wire('r.s', 'f.n'), wire('f.s', 'ref.n')],
    }, 2, 0.01);
    expect(Math.abs(sim.at('r_branch_flux'))).toBeLessThan(1e-12);
    // r.n is open: it floats with the rest of the circuit at +100 A-t, it is not pinned to 0
    near(sim.across('r', 'n'), F, 1e-9, 'open N floats');
  });

  it('a magnetic network without a Magnetic Reference is rejected with a clear diagnostic', () => {
    const e = structureError({
      nodes: [node('f', 'mag_mmf_source', { MMF: 10 }), node('r', 'reluctance', { R: 1e5 })],
      edges: [wire('f.n', 'r.n'), wire('r.s', 'f.s')],
    });
    expect(e.message).toMatch(/Floating magnetic network/);
    expect(e.message).toMatch(/Magnetic Reference/);
  });
});

// ── 7. winding (em_converter): L = N^2 / R from a voltage step ───────────────────────────────────────────────────────
describe('WP-15 winding: v = N dPhi/dt, mmf = N i, so a winding on a reluctance R is an inductor L = N^2 / R', () => {
  it('voltage step through a series resistance: i(t) = (V / Rw)(1 - exp(-t Rw / L)), Phi = N i / R', () => {
    const N = 100, R = 1e5, V = 1, Rw = 2;
    const L = (N * N) / R; // 0.1 H
    const tau = L / Rw;
    const dt = 0.0025, steps = 120;
    const sim = simulate({
      nodes: [node('v', 'dc_voltage', { V, R_int: 0 }), node('rw', 'resistor', { R: Rw }), node('w', 'em_converter', { N }), node('g', 'ground'),
        node('core', 'reluctance', { R }), node('ref', 'mag_ref')],
      edges: [wire('v.p', 'rw.p'), wire('rw.n', 'w.p'), wire('w.n', 'g.a'), wire('v.n', 'g.a'),
        wire('w.mag_n', 'core.n'), wire('core.s', 'w.mag_s'), wire('w.mag_s', 'ref.n')],
    }, steps, dt);
    const i = sim.series('rw_branch_current');
    const phi = sim.series('core_branch_flux');
    let worst = 0, worstPhi = 0;
    sim.times.forEach((t, k) => {
      const exact = (V / Rw) * (1 - Math.exp(-t / tau));
      worst = Math.max(worst, Math.abs(i[k] - exact));
      // the flux sign is checked here: Phi through the core (N -> S) is +N i / R for a positive current
      worstPhi = Math.max(worstPhi, Math.abs(phi[k] - (N * exact) / R));
    });
    expect(worst / (V / Rw)).toBeLessThan(0.01);
    expect(worstPhi / ((N * V) / (Rw * R))).toBeLessThan(0.01);
    expect(phi[steps - 1]).toBeGreaterThan(0);
    note('winding i(t) vs closed form, max error / final', (100 * worst) / (V / Rw));
    note('winding flux N i / R, max error / final', (100 * worstPhi) / ((N * V) / (Rw * R)));
  });
});

// ── 8. reluctance force ──────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-15 reluctance force: F = -1/2 Phi^2 dR/dx on the body at R, R = R0 + K x with x = integral(v)', () => {
  const actuator = (Phi: number, m: number, R0: number, K: number): Model => ({
    nodes: [node('p', 'mag_flux_source', { phi: Phi }), node('rf', 'reluctance_force', { R0, K }), node('ref', 'mag_ref'),
      node('m', 'mass', { m }), node('tref', 'trans_ref')],
    edges: [wire('rf.n', 'p.s'), wire('rf.s', 'p.n'), wire('p.n', 'ref.n'), wire('rf.r', 'm.p'), wire('rf.c', 'tref.p')],
  });

  it('K > 0: the force on the mass is -1/2 Phi^2 K (toward lower reluctance): v(t) = -(Phi^2 K / (2 m)) t, x = -(1/2) a t^2', () => {
    const Phi = 2e-3, m = 2, R0 = 1e6, K = 1e7, dt = 0.001, steps = 100;
    const F = -0.5 * Phi * Phi * K; // -20 N
    const sim = simulate(actuator(Phi, m, R0, K), steps, dt);
    const v = sim.acrossSeries('m', 'p');
    [50, 100].forEach((k) => near(v[k - 1], (F / m) * k * dt, 2e-4, `v(${k * dt})`));
    note('reluctance force v(0.1 s)', pct(v[steps - 1], (F / m) * steps * dt));
    // R follows the integrated position: mmf drop = Phi (R0 + K x), x = F t^2 / (2 m)
    const t = steps * dt;
    const x = (F / (2 * m)) * t * t;
    near(sim.across('rf', 'n') - sim.across('rf', 's'), Phi * (R0 + K * x), 2e-3, 'mmf = Phi R(x)');
  });

  it('K < 0: the force reverses (the gap closes with x): F = -1/2 Phi^2 K > 0 pushes the mass toward +x', () => {
    const Phi = 1e-3, m = 1, R0 = 1e6, K = -2e6, dt = 0.01, steps = 10;
    const F = -0.5 * Phi * Phi * K; // +1 N
    const sim = simulate(actuator(Phi, m, R0, K), steps, dt);
    near(sim.across('m', 'p'), (F / m) * steps * dt, 2e-4, 'v');
    expect(sim.across('m', 'p')).toBeGreaterThan(0);
  });

  it('the air-gap position is a state (x is NOT the relative velocity)', () => {
    const sim = simulate(actuator(2e-3, 2, 1e6, 1e7), 5, 0.01);
    expect(sim.state.variableNames).toContain('rf_state_x');
  });
});

// ── 9. migration and library contract ────────────────────────────────────────────────────────────────────────────────
describe('WP-15 migration notices, canonical parameters, bounds and real equation text', () => {
  it('saved thermal_ref / temp_sensor nodes get a notice that readings are now absolute (+293.15 K), idempotently', () => {
    const nodes = [node('ref', 'thermal_ref'), node('s', 'temp_sensor'), node('m', 'thermal_mass', { C: 10 }), node('r', 'resistor', { R: 1 })];
    const out = normalizeLegacyVLabGraph(nodes as any, []).nodes as any[];
    expect(out[0].data.migrationNotices[0]).toMatch(/0 K.*\+293\.15 K/);
    expect(out[1].data.migrationNotices).toHaveLength(1);
    expect(out[3].data.migrationNotices).toBeUndefined();
    const again = normalizeLegacyVLabGraph(out, []).nodes as any[];
    expect(again[0].data.migrationNotices).toHaveLength(1);
    // the thermal mass keeps the initial temperature the old model always used
    expect(out[2].data.params.T0.value).toBe(293.15);
  });

  it('a saved fundamental_reluctance R is kept by solving for the core length (R = l / (mu0 mu_r A))', () => {
    const next = canonicalizeLegacyParams('fundamental_reluctance', { R: { value: 7.5e5, unit: 'A-t/Wb', label: 'Reluctance' } });
    expect(next.R).toBeUndefined();
    const A = lib('fundamental_reluctance').params.A.value as number;
    const mur = lib('fundamental_reluctance').params.mu_r.value as number;
    near(next.l.value / (MU0 * mur * A), 7.5e5, 1e-6, 'R recovered');
    const out = normalizeLegacyVLabGraph([node('c', 'fundamental_reluctance', { R: { value: 7.5e5 } })] as any, []).nodes as any[];
    expect(out[0].data.migrationNotices[0]).toMatch(/R = 750000/);
  });

  const BLOCKS = ['thermal_ref', 'conductive_heat', 'convective_heat', 'radiative_heat', 'thermal_mass', 'temp_sensor', 'heat_flow_sensor', 'heat_src',
    'temp_src', 'ctrl_heat_src', 'ctrl_temp_src', 'thermal_resistor', 'mag_ref', 'reluctance', 'fundamental_reluctance', 'variable_reluctance',
    'permanent_magnet', 'em_converter', 'reluctance_force', 'mag_flux_sensor', 'mag_mmf_sensor', 'mag_mmf_source', 'mag_flux_source', 'mag_controlled_mmf'];

  it('every library equation / description is specific text, not a generic label; the Thermal Reference says 0 K', () => {
    for (const id of BLOCKS) {
      expect(isGenericText(lib(id).equation), `${id} equation`).toBe(false);
      expect(isGenericText(lib(id).description), `${id} description`).toBe(false);
    }
    expect(lib('thermal_ref').equation).toMatch(/0 K/);
    expect(lib('thermal_ref').equation).not.toMatch(/293/);
  });

  it('every library default passes validation and the thermal / magnetic parameters carry SI units', () => {
    const SI = /^(W\/K|W\/m\^2\/K|m\^2|J\/K|K|W|1|Ω|A-t\/Wb|A-t\/\(Wb-m\)|A-t|Wb|m|A\/m|channels)$/;
    for (const id of BLOCKS) {
      const defaults = Object.fromEntries(Object.entries(lib(id).params).map(([key, p]: any) => [key, { value: p.value, unit: p.unit, label: p.label }]));
      for (const [key, p] of Object.entries(lib(id).params) as any) expect(SI.test(p.unit), `${id}.${key} unit "${p.unit}"`).toBe(true);
      expect(validateBlockParams('x', id, defaults as any), id).toEqual([]);
    }
  });

  it('bounds: zero and fractions legal where physical, negative / zero capacity, area and permeability rejected', () => {
    const bad = (id: string, key: string, value: number) => validateBlockParams('x', id, { [key]: value }).length;
    expect(bad('thermal_mass', 'C', 0)).toBeGreaterThan(0);
    expect(bad('thermal_mass', 'C', 0.001)).toBe(0);
    expect(bad('thermal_mass', 'T0', 0)).toBe(0);
    expect(bad('thermal_mass', 'T0', -1)).toBeGreaterThan(0);
    expect(bad('conductive_heat', 'k', 0)).toBe(0);
    expect(bad('conductive_heat', 'k', -1)).toBeGreaterThan(0);
    expect(bad('radiative_heat', 'eps', 1.2)).toBeGreaterThan(0);
    expect(bad('radiative_heat', 'eps', 0.35)).toBe(0);
    expect(bad('heat_src', 'Q', -20)).toBe(0);
    expect(bad('temp_src', 'T', 0)).toBeGreaterThan(0);
    expect(bad('reluctance', 'R', 0)).toBeGreaterThan(0);
    expect(bad('fundamental_reluctance', 'l', 0)).toBeGreaterThan(0);
    expect(bad('fundamental_reluctance', 'A', -1e-4)).toBeGreaterThan(0);
    expect(bad('fundamental_reluctance', 'mu_r', 0.9)).toBe(0);
    expect(bad('variable_reluctance', 'R', 0)).toBeGreaterThan(0);
    expect(bad('mag_mmf_source', 'MMF', -50)).toBe(0);
    expect(bad('reluctance_force', 'K', -1e6)).toBe(0);
  });
});

it('prints the reference results (% error) for the report', () => {
  // eslint-disable-next-line no-console
  console.log(`WP-15 reference results\n${REPORT.join('\n')}`);
});
