import { describe, it, expect, vi } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { blockEquations } from '../vlabEquations';
import { assertValidTopology, validateTopology } from '../vlabTopologyValidation';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { createVLabDOEBlock } from '../../doe/integration';
import { LEGACY_TYPE_ALIASES, normalizeLegacyVLabGraph } from '../../../components/vlab/vlabModelMigration';

/**
 * WP-21: composite / appliance / DOE / utility blocks certified against PUBLISHED relations, every block exercised through
 * VLabPhysicsEngine.simulateStep. Expected values are computed here from the governing equations (Ohm / Joule, first law of a
 * lumped heat capacity with Newton convection and Stefan-Boltzmann radiation, Incropera & DeWitt eqs. 1.3a, 1.7, 1.12c;
 * rigid-body rotation tau = J domega/dt + b omega), never by calling the code under test.
 * Sign convention: through-variable positive A -> B through the block, across = v_A - v_B. SI units.
 */

const SIGMA = 5.670374419e-8; // CODATA 2018, W/(m^2 K^4)
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } }) as any;
let edgeCount = 0;
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.');
  const [sb, pb] = b.split('.');
  return { id: `w${edgeCount++}`, source: sa, sourceHandle: pa, target: sb, targetHandle: pb } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }
const lib = (id: string) => VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === id)!;

interface Sample { t: number; at: (name: string) => number; across: (block: string, port: string) => number }
function simulate(m: Model, steps: number, dt: number, probe?: (s: Sample) => void): Sample {
  const engine = new VLabPhysicsEngine();
  const system = new DAEAssembler().assemble(m.nodes, m.edges);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  let state: any = null;
  let last!: Sample;
  try {
    for (let k = 0; k < steps; k++) {
      state = engine.simulateStep(m.nodes, m.edges, state, dt);
      const names: string[] = state.variableNames;
      const x = [...state.x];
      const at = (name: string) => {
        const i = names.indexOf(name);
        if (i < 0) throw new Error(`no variable ${name}`);
        return x[i];
      };
      const across = (block: string, port: string) => {
        const root = system.components.find((c) => c.blockId === block)!.portNodeMap.get(port)!;
        const i = names.findIndex((n) => n.startsWith(`Across_${root}_(`));
        if (i < 0) throw new Error(`no across variable of ${block}.${port}`);
        return x[i];
      };
      last = { t: (k + 1) * dt, at, across };
      if (probe) probe(last);
    }
  } finally {
    const calls = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();
    expect(calls.filter((w) => w.includes('convergence issue')), 'solver convergence warnings').toHaveLength(0);
  }
  return last;
}
const rel = (a: number, e: number) => Math.abs(a - e) / Math.max(Math.abs(e), 1e-12);
const near = (a: number, e: number, tol: number, label: string) =>
  expect(rel(a, e), `${label}: actual ${a}, expected ${e}`).toBeLessThanOrEqual(tol);

/** Independent RK4 integration of dT/dt = f(T) with fine substeps (reference solution). */
function rk4(f: (T: number) => number, T0: number, tEnd: number, n = 4000): number {
  let T = T0;
  const h = tEnd / n;
  for (let i = 0; i < n; i++) {
    const k1 = f(T), k2 = f(T + h * k1 / 2), k3 = f(T + h * k2 / 2), k4 = f(T + h * k3);
    T += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return T;
}

// ── catalog: specific equations, canonical SI params, typed scope outputs ─────────────────────────────────────────────────
describe('WP-21 catalog: appliance / utility documentation and ports', () => {
  const ids = ['magnetron', 'upper_heater', 'microwave_cavity', 'washing_basket', 'washing_fluid', 'steam_generator',
    'microwave_inverter', 'doe_custom', 'conn_label', 'vlab_probe'];
  it('every equation text is specific (no generic label, no literal "\\n" escape) and states units', () => {
    for (const id of ids) {
      const b = lib(id);
      expect(b.equation, id).not.toMatch(/governing\s+(physical\s+)?equation/i);
      expect(b.description, id).not.toMatch(/^Physical component model for/);
      expect(b.equation, `${id} has a literal backslash-n`).not.toContain('\\n');
    }
    for (const id of ['magnetron', 'upper_heater', 'microwave_cavity', 'washing_basket', 'washing_fluid']) expect(lib(id).equation, id).toMatch(/\[(W|N·m|K)\]/);
  });
  it('signal outputs carry quantity and unit; washing_basket.vis is the load torque', () => {
    expect(lib('microwave_cavity').ports.find((p) => p.id === 't')).toMatchObject({ direction: 'out', quantity: 'temperature', unit: 'K' });
    expect(lib('washing_basket').ports.find((p) => p.id === 'vis')).toMatchObject({ direction: 'out', quantity: 'load torque', unit: 'N*m' });
    expect(lib('vlab_probe').ports.find((p) => p.id === 'out')).toMatchObject({ direction: 'out', quantity: 'probed signal' });
  });
  it('params are bounded and SI (or documented degC / % / L engineering units)', () => {
    expect(lib('magnetron').params.efficiency).toMatchObject({ unit: '%', min: 0, max: 100 });
    expect(lib('magnetron').params.v_nominal).toMatchObject({ unit: 'V', min: 0, exclusiveMin: true });
    expect(lib('upper_heater').params.resistance).toMatchObject({ unit: 'Ohm', min: 0, exclusiveMin: true });
    expect(lib('upper_heater').params.efficiency).toMatchObject({ min: 0, max: 1 });
    expect(lib('microwave_cavity').params.ambient_temp).toMatchObject({ unit: 'C', min: -273.15 });
    expect(lib('microwave_cavity').params.eps).toMatchObject({ min: 0, max: 1 });
  });
  it('F-092: the cavity uses the CODATA Stefan-Boltzmann constant (same as radiative_heat)', () => {
    // nominal residual: dT row = dState - (Q_in - Q_conv - Q_rad)/C with Q_in = 0, T = 400 K, T_amb = 300 K (ambient_temp = 26.85 C)
    const vol = 25, eps = 0.85, h = 10, T = 400, Ta = 300;
    const A = 6 * Math.pow(vol * 1e-3, 2 / 3);
    const C = 1.2 * vol * 1e-3 * 1005 + 2 * 460 + 0.5 * 4184;
    const rows = blockEquations.microwave_cavity({
      across: [T, T, T, 0], dAcross: [0, 0, 0, 0], branch: [0, 0, 0, T], dBranch: [0, 0, 0, 0], state: [T], dState: [0],
      params: { volume: vol, ambient_temp: Ta - 273.15, eps, h_conv: h, max_temp: 250, food_mass: 0.5, food_cp: 4184, wall_mass: 2, wall_cp: 460 },
      ports: ['h1', 'h2', 'h3', 't'], nodeId: 'c', ctx: { parameters: {} } as any,
    } as any);
    const expected = (h * A * (T - Ta) + eps * SIGMA * A * (T ** 4 - Ta ** 4)) / C;
    expect(rows[4]).toBeCloseTo(expected, 12);
  });
});

// ── magnetron ────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-21 magnetron: P_RF = eta P_elec, square-law anode, energy conserved', () => {
  const build = (V: number, eff = 65, P = 900, Vn = 4000): Model => ({
    nodes: [node('gnd', 'ground'), node('src', 'dc_voltage', { V, R_int: 0 }), node('mag', 'magnetron', { efficiency: eff, power_rating: P, v_nominal: Vn }),
      node('tm', 'thermal_mass', { C: 1000, T0: 300 })],
    edges: [wire('src.p', 'mag.p'), wire('mag.n', 'gnd.a'), wire('src.n', 'gnd.a'), wire('mag.h', 'tm.a')],
  });
  it('at the nominal 4000 V: i = 0.225 A, P_elec = 900 W, Q_H = 585 W, dT/dt = Q_H / C', () => {
    const dt = 0.1, n = 10;
    let W = 0;
    const s = simulate(build(4000), n, dt, (k) => { W += 4000 * k.at('mag_branch_current') * dt; });
    near(s.at('mag_branch_current'), 900 / 4000, 1e-6, 'anode current');
    near(s.at('mag_branch_heat_flow'), 0.65 * 900, 1e-6, 'RF heat into H');
    near(s.across('tm', 'a') - 300, 0.65 * 900 * n * dt / 1000, 1e-4, 'thermal mass temperature rise');
    // energy: electrical in = heat into H + anode loss (1 - eta) P_elec
    near(1000 * (s.across('tm', 'a') - 300) + 0.35 * W, W, 1e-4, 'electrical energy = stored heat + anode loss');
  });
  it('square law off-nominal and reverse polarity never creates energy (v i >= 0, Q_H >= 0)', () => {
    const s = simulate(build(2000), 2, 0.1);
    near(s.at('mag_branch_current'), 900 * 2000 / 4000 ** 2, 1e-6, 'i at 2000 V');
    near(s.at('mag_branch_heat_flow'), 0.65 * 900 * 0.25, 1e-6, 'Q_H at 2000 V');
    const r = simulate(build(-4000), 2, 0.1);
    expect(-4000 * r.at('mag_branch_current')).toBeCloseTo(900, 6);
    expect(r.at('mag_branch_heat_flow')).toBeCloseTo(585, 6);
  });
});

// ── upper heater ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-21 upper_heater: Joule heat, Q_H = efficiency V^2/R', () => {
  it('230 V across 35 ohm, efficiency 0.9: i = V/R, Q_H = 0.9 V^2/R, energy balance', () => {
    const V = 230, R = 35, eff = 0.9, dt = 0.1, n = 10;
    const m: Model = {
      nodes: [node('gnd', 'ground'), node('src', 'dc_voltage', { V, R_int: 0 }), node('ht', 'upper_heater', { resistance: R, efficiency: eff }),
        node('tm', 'thermal_mass', { C: 2000, T0: 300 })],
      edges: [wire('src.p', 'ht.p'), wire('ht.n', 'gnd.a'), wire('src.n', 'gnd.a'), wire('ht.h', 'tm.a')],
    };
    const s = simulate(m, n, dt);
    near(s.at('ht_branch_current'), V / R, 1e-6, 'current');
    near(s.at('ht_branch_heat_flow'), eff * V * V / R, 1e-6, 'heat into H');
    near(2000 * (s.across('tm', 'a') - 300), eff * (V * V / R) * n * dt, 1e-4, 'stored heat = eff * electrical energy');
  });
});

// ── microwave cavity ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-21 microwave_cavity: lumped first-law balance with convection + radiation (+ vent above the cutout)', () => {
  const p = { volume: 25, ambient_temp: 25, eps: 0.85, h_conv: 10, food_mass: 0.5, food_cp: 4184, wall_mass: 2, wall_cp: 460 };
  const C = 1.2 * 25e-3 * 1005 + 2 * 460 + 0.5 * 4184;
  const A = 6 * Math.pow(25e-3, 2 / 3);
  const Ta = 298.15;
  const build = (Q: number, maxTemp = 250): Model => ({
    nodes: [node('tr', 'thermal_ref'), node('qs', 'heat_src', { Q }), node('cav', 'microwave_cavity', { ...p, max_temp: maxTemp })],
    edges: [wire('qs.a', 'tr.a'), wire('qs.b', 'cav.h1')],
  });
  const ode = (Q: number, Tmax: number) => (T: number) => {
    const cut = 0.5 * (1 + Math.tanh((Tmax - T) / 3));
    return (cut * Q - 10 * A * (T - Ta) - 0.85 * SIGMA * A * (T ** 4 - Ta ** 4)) / C;
  };
  it('starts at ambient; heating rate = P_abs / C; T(t) matches the independent RK4 solution; t output = T [K]', () => {
    const Q = 1000, dt = 0.05, n = 40;
    const Ts: number[] = [Ta];
    const s = simulate(build(Q), n, dt, (k) => Ts.push(k.at('cav_state_temp')));
    // the first step from ambient: losses vanish, dT/dt = Q / C
    near((Ts[1] - Ta) / dt, Q / C, 2e-3, 'initial heating rate P_abs / C');
    near(s.at('cav_state_temp') - Ta, rk4(ode(Q, 523.15), Ta, n * dt) - Ta, 1e-3, 'temperature rise vs RK4');
    expect(s.at('cav_branch_signal_t')).toBeCloseTo(s.at('cav_state_temp'), 9);
    // energy: C dT = integral of (Q_in - Q_conv - Q_rad) dt (trapezoid over the engine samples)
    let E = 0;
    for (let i = 1; i < Ts.length; i++) {
      const loss = (T: number) => 10 * A * (T - Ta) + 0.85 * SIGMA * A * (T ** 4 - Ta ** 4);
      E += (Q - 0.5 * (loss(Ts[i]) + loss(Ts[i - 1]))) * dt;
    }
    near(C * (Ts[Ts.length - 1] - Ta), E, 1e-3, 'stored energy = input - losses');
  });
  it('thermal cutout: with T_max = ambient half the input is vented at the start (energy goes to ambient, not created)', () => {
    const Q = 1000, dt = 0.05, n = 20;
    const s = simulate(build(Q, 25), n, dt);
    near(s.at('cav_state_temp') - Ta, rk4(ode(Q, Ta), Ta, n * dt) - Ta, 2e-3, 'temperature rise with the vent');
  });
});

// ── washing machine loads ────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-21 washing_basket / washing_fluid: tau = J domega/dt + b omega, vis = tau, energy balance', () => {
  const J = 0.1 + (5 + 0.5) * 0.25 ** 2, b = 0.02, tau0 = 2;
  const basketModel = (withFluid: boolean): Model => ({
    nodes: [node('rr', 'rot_ref'), node('ts', 'torque_source', { T: tau0 }), node('bk', 'washing_basket', { J_basket: 0.1, load_mass: 5, unbalance: 0.5, radius: 0.25, damping: b }),
      ...(withFluid ? [node('fl', 'washing_fluid', { water_level: 10, detergent: 1, drag_coeff: 0.05 })] : [])],
    edges: [wire('ts.r', 'bk.r'), wire('ts.c', 'rr.r'), ...(withFluid ? [wire('fl.r', 'bk.r')] : [])],
  });
  it('step torque on the drum: omega(t) = (tau/b)(1 - exp(-b t / J)); vis = load torque = tau', () => {
    const dt = 0.01, n = 100;
    const s = simulate(basketModel(false), n, dt);
    const w = Math.abs(s.across('bk', 'r'));
    near(w, (tau0 / b) * (1 - Math.exp(-b * n * dt / J)), 2e-3, 'drum speed');
    expect(Math.abs(s.at('bk_branch_signal_vis'))).toBeCloseTo(tau0, 6);
  });
  it('with the wash liquor: source work = kinetic energy + viscous + slosh dissipation (published drag law)', () => {
    const dt = 0.005, n = 200;
    const ws: number[] = [0];
    simulate(basketModel(true), n, dt, (k) => ws.push(Math.abs(k.across('bk', 'r'))));
    const c1 = 0.05 + 0.02 * 1 + 0.005 * 10;
    const diss = (w: number) => b * w * w + (c1 * w + 0.01 * w * Math.abs(w)) * w;
    let Win = 0, D = 0;
    for (let i = 1; i < ws.length; i++) { Win += tau0 * 0.5 * (ws[i] + ws[i - 1]) * dt; D += 0.5 * (diss(ws[i]) + diss(ws[i - 1])) * dt; }
    const K = 0.5 * J * ws[ws.length - 1] ** 2;
    near(K + D, Win, 5e-3, 'work in = kinetic energy + dissipation');
  });
});

// ── utilities ────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-21 utilities: probe, label, DOE ports, legacy type aliases', () => {
  it('vlab_probe repeats its input unchanged (x = u) through simulateStep', () => {
    const m: Model = {
      nodes: [node('k', 'ps_constant', { value: -3.25 }), node('pr', 'vlab_probe')],
      edges: [wire('k.y', 'pr.in')],
    };
    const s = simulate(m, 2, 0.01);
    expect(s.at('pr_branch_signal_out')).toBeCloseTo(-3.25, 12);
  });
  it('F-040: a deployed DOE node has typed physical-signal ports and simulates y = f_DOE(u) without the old General special case', () => {
    const deployment = {
      schemaVersion: 1, modelType: 'RSM', factorOrder: ['X1', 'X2'], responseName: 'Y', trainingRowCount: 10,
      metrics: { rSquared: 1, adjustedRSquared: 1, rmse: 0 }, factorRanges: { X1: { min: -10, max: 10 }, X2: { min: -10, max: 10 } },
      rsm: { intercept: 1, terms: [{ name: 'X1', factors: [0], powers: [1], coeff: 2 }, { name: 'X2', factors: [1], powers: [1], coeff: -1 }] },
    };
    const res: any = createVLabDOEBlock({ modelType: 'RSM', factorNames: ['X1', 'X2'], responseName: 'Y', equation: 'Y = 1 + 2*X1 - X2', diagnostics: [], deployment } as any, 'doe1');
    expect(res.diagnostics ?? []).toEqual([]);
    const ports = res.data.ports as any[];
    for (const port of ports) expect(port.domain).toBe('Physical');
    expect(ports.find((q) => q.id === 'in1')).toMatchObject({ direction: 'in', quantity: 'X1' });
    expect(ports.find((q) => q.id === 'out')).toMatchObject({ direction: 'out', quantity: 'Y' });
    const m: Model = {
      nodes: [node('k1', 'ps_constant', { value: 3 }), node('k2', 'ps_constant', { value: 0.5 }), res as Node, node('sc', 'scope')],
      edges: [wire('k1.y', 'doe1.in1'), wire('k2.y', 'doe1.in2'), wire('doe1.out', 'sc.in1')],
    };
    expect(validateTopology(m.nodes, m.edges).diagnostics).toEqual([]);
    const s = simulate(m, 2, 0.01);
    expect(s.at('doe1_branch_signal_out')).toBeCloseTo(1 + 2 * 3 - 0.5, 9);
  });
  it('F-040: a saved DOE node with legacy General ports is migrated to Physical + direction', () => {
    const legacy: any = { id: 'd', type: 'default', position: { x: 0, y: 0 }, data: { type: 'doe_custom', params: {}, ports: [
      { id: 'in1', label: 'X1', type: 'input', domain: 'General' }, { id: 'out', label: 'Y', type: 'output', domain: 'General' }] } };
    const { nodes } = normalizeLegacyVLabGraph([legacy], []);
    expect(nodes[0].data.ports).toEqual([
      { id: 'in1', label: 'X1', type: 'input', domain: 'Physical', direction: 'in', quantity: 'X1' },
      { id: 'out', label: 'Y', type: 'output', domain: 'Physical', direction: 'out', quantity: 'Y' },
    ]);
  });
  it('F-019: legacy type ids are aliased to the canonical library block at load; the orphan equation keys are gone', () => {
    const live = new Set(VLAB_LIBRARY.flatMap((d) => d.blocks).map((b) => b.id));
    for (const [legacy, canonical] of Object.entries(LEGACY_TYPE_ALIASES)) {
      expect(live.has(canonical), canonical).toBe(true);
      expect(blockEquations[legacy], `orphan equation key ${legacy}`).toBeUndefined();
      const { nodes } = normalizeLegacyVLabGraph([node('n', legacy)], []);
      expect(nodes[0].data.type).toBe(canonical);
    }
    expect(blockEquations.vfd_controller).toBeUndefined();
    // an aliased heat_sensor simulates as the Heat Flow Rate Sensor (same ports a, b, h)
    const raw: Model = {
      nodes: [node('tr', 'thermal_ref'), node('qs', 'heat_src', { Q: 40 }), node('hs', 'heat_sensor'), node('tm', 'thermal_mass', { C: 100, T0: 300 })],
      edges: [wire('qs.a', 'tr.a'), wire('qs.b', 'hs.a'), wire('hs.b', 'tm.a')],
    };
    const migrated = normalizeLegacyVLabGraph(raw.nodes as any, raw.edges as any);
    const s = simulate({ nodes: migrated.nodes as any, edges: migrated.edges as any }, 2, 0.1);
    expect(Math.abs(s.at('hs_branch_signal_h'))).toBeCloseTo(40, 6);
  });
});

// ── the built-in microwave lab (copy of VLabWorkspace advanced_microwave_design) ─────────────────────────────────────────
describe('WP-21 F-091 / F-044 / F-090: the advanced microwave lab validates and conserves energy', () => {
  const lab: Model = {
    nodes: [
      node('pwr_ac', 'ac_voltage', { Vpk: 325, f: 50 }), node('mw_inverter', 'microwave_inverter', { v_out: 4000 }),
      node('mw_magnetron', 'magnetron', { efficiency: 65 }), node('mw_heater', 'upper_heater', { resistance: 35 }),
      node('mw_steam', 'steam_generator', { power: 800 }), node('mw_cavity', 'microwave_cavity', { volume: 25 }),
      node('mw_scope', 'scope', { time_range: 30 }), node('mw_ground', 'ground'),
    ],
    edges: [
      wire('pwr_ac.p', 'mw_inverter.ac_in'), wire('mw_inverter.hv_out', 'mw_magnetron.p'), wire('pwr_ac.p', 'mw_heater.p'),
      wire('pwr_ac.p', 'mw_steam.p'), wire('mw_magnetron.h', 'mw_cavity.h1'), wire('mw_heater.h', 'mw_cavity.h2'),
      wire('mw_steam.s', 'mw_cavity.h3'), wire('mw_cavity.t', 'mw_scope.in1'), wire('pwr_ac.n', 'mw_ground.a'),
      wire('mw_magnetron.n', 'mw_ground.a'), wire('mw_heater.n', 'mw_ground.a'), wire('mw_steam.n', 'mw_ground.a'),
    ],
  };
  it('the lab passes topology validation (every magnetron / heater H port is wired)', () => {
    expect(() => assertValidTopology(lab.nodes, lab.edges)).not.toThrow();
  });
  it('an open magnetron H port is a topology error (F-091)', () => {
    const open = { nodes: lab.nodes, edges: lab.edges.filter((e) => !(e.source === 'mw_magnetron' && e.sourceHandle === 'h')) };
    expect(validateTopology(open.nodes, open.edges).valid).toBe(false);
  });
  it('cavity heating over 5 mains cycles = (eta P_mag + eff <v^2>/R) t / C (steam below boiling contributes 0)', () => {
    const dt = 5e-4, n = 200; // 0.1 s = 5 cycles of 50 Hz
    const s = simulate(lab, n, dt);
    const C = 1.2 * 25e-3 * 1005 + 2 * 460 + 0.5 * 4184;
    const Qmag = 0.65 * 900;
    const Qheat = 0.9 * (325 ** 2 / 2) / 35;
    near(s.at('mw_cavity_state_temp') - 298.15, (Qmag + Qheat) * n * dt / C, 1e-2, 'cavity temperature rise');
  });
});
