import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { DAEStructureError } from '../vlabStructure';
import { VLAB_COMPONENT_DEFINITIONS } from '../vlabComponentDefinitions';
import { IMPLICIT_ABSOLUTE_POTENTIAL_BLOCKS, INTERNAL_MECHANICAL_REFERENCE, INTERNAL_REFERENCE_PORTS } from '../vlabElectricalReference';
import { VECTOR_PORT_BACKLOG } from './vectorPortPlan';
import { isGenericText } from './contractChecks';
import { machineConstantNotice, normalizeLegacyVLabGraph } from '../../../components/vlab/vlabModelMigration';

/**
 * WP-12a: electrical machines (dc_motor, ac_motor = squirrel-cage induction machine, pmsm, bldc_motor) and the three-phase
 * source, certified against published equations.
 *
 * Every expected value is computed IN THIS FILE from the published relation named in the comment (Krause, Wasynczuk,
 * Sudhoff, "Analysis of Electric Machinery and Drive Systems"; Ogata, "Modern Control Engineering" DC servomotor; Simscape
 * Electrical block reference; Pillay and Krishnan 1989 for the BLDC); nothing is read back from the code under test, and
 * everything runs through VLabPhysicsEngine.simulateStep over many steps. Convention (Simscape): through variable positive
 * A -> B through the block, across = v_A - v_B; a source that delivers power has a negative through current.
 */

// ── model builders ──────────────────────────────────────────────────────────────────────────────────────────────────
const node = (id: string, type: string, params: Record<string, any> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } }) as any;
let edgeCount = 0;
const wire = (a: string, b: string): Edge => {
  const [sa, pa] = a.split('.');
  const [sb, pb] = b.split('.');
  return { id: `e${edgeCount++}`, source: sa, sourceHandle: pa, target: sb, targetHandle: pb } as Edge;
};
interface Model { nodes: Node[]; edges: Edge[] }
const GND = node('gnd', 'ground');
const RREF = node('rref', 'rot_ref');

type Sample = { t: number; at: (name: string) => number };

/** Run `steps` steps of `dt` through VLabPhysicsEngine.simulateStep; `probe` sees every accepted step. Fails on any solver warning. */
function simulate(m: Model, steps: number, dt: number, probe?: (s: Sample, k: number) => void, config: any = null) {
  const engine = new VLabPhysicsEngine(config);
  engine.setStepBudget({ maxStepAttempts: 400, wallClockMs: 60000 });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  let state: any = null;
  let names: string[] = [];
  try {
    for (let k = 0; k < steps; k++) {
      state = engine.simulateStep(m.nodes, m.edges, state, dt);
      names = state.variableNames;
      if (probe) probe({ t: (k + 1) * dt, at: (name: string) => state.x[names.indexOf(name)] }, k);
    }
  } finally {
    warn.mockRestore();
  }
  // no convergence failure: the solver never fell back to SDIRK-3 ("DAE BDF solver convergence issue")
  expect(warn.mock.calls.filter(c => String(c[0]).includes('convergence issue')), 'solver convergence warnings').toHaveLength(0);
  const system = new DAEAssembler().assemble(m.nodes, m.edges);
  const at = (name: string): number => {
    const i = names.indexOf(name);
    if (i < 0) throw new Error(`no variable ${name}`);
    return state.x[i];
  };
  const across = (block: string, port: string): number => {
    const root = system.components.find((c) => c.blockId === block)!.portNodeMap.get(port)!;
    const i = names.findIndex((n) => n.startsWith(`Across_${root}_(`));
    if (i < 0) throw new Error(`no across variable of ${block}.${port}`);
    return state.x[i];
  };
  return { state, at, across };
}

/** Solver configuration with a tight local-error tolerance: separates the formula error from the discretisation error of the default 1e-3 LTE control. */
const tight = (rel: number) => ({ id: 'wp12a', solver: 'auto', startTime: 0, stopTime: 1, initialStep: 'auto', minimumStep: 1e-6, maximumStep: 0.01,
  relativeTolerance: rel, absoluteTolerance: rel * 1e-2, maximumIterations: 50, nonlinearTolerance: 1e-10, enableDiagnostics: false, enableLogging: false });

const near = (actual: number, expected: number, rel: number, label = '') => {
  const tol = rel * Math.max(Math.abs(expected), 1e-12);
  expect(Math.abs(actual - expected), `${label}: actual ${actual}, expected ${expected} (rel err ${(Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-12) * 100).toFixed(4)} %)`).toBeLessThanOrEqual(tol);
};
const pct = (actual: number, expected: number) => Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-12) * 100;

const block = (id: string) => VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === id)!;
const portDomains = (id: string) => Object.fromEntries(block(id).ports.map((p) => [p.id, p.domain]));

// ── 1. catalog: ports, parameters, documentation, reference semantics ──────────────────────────────────────────────────
describe('WP-12a catalog: ports, parameters, equation text, explicit references', () => {
  it('port domains follow the block physics (stator terminals Electrical, shaft Rotational, three-phase source composite)', () => {
    const E = 'Electrical', R = 'Rotational';
    expect(portDomains('dc_motor')).toEqual({ p: E, n: E, r: R });
    expect(portDomains('ac_motor')).toEqual({ abc: E, n: E, r: R });
    expect(portDomains('pmsm')).toEqual({ abc: E, n: E, r: R });
    expect(portDomains('bldc_motor')).toEqual({ abc: E, g: E, r: R });
    expect(portDomains('three_phase_source')).toEqual({ abc: E, n: E });
    const abc = block('three_phase_source').ports.find((p) => p.id === 'abc')!;
    expect(abc.composite).toBe('three_phase');
    // WP-12b: the machine stator terminals are the same composite port as the source
    for (const id of ['ac_motor', 'pmsm', 'bldc_motor']) expect(block(id).ports.find((p) => p.id === 'abc')!.composite, id).toBe('three_phase');
  });

  it('one back-EMF / torque constant (F-059): dc_motor and bldc_motor expose Ke and no Kt', () => {
    for (const id of ['dc_motor', 'bldc_motor']) {
      expect(block(id).params.Ke, `${id}.Ke`).toBeDefined();
      expect(block(id).params.Kt, `${id}.Kt`).toBeUndefined();
      expect(block(id).params.Ke.unit).toBe('V*s/rad');
    }
  });

  it('parameters are canonical, SI, and bounded where physical', () => {
    const units = (id: string) => Object.fromEntries(Object.entries(block(id).params).map(([k, s]) => [k, s.unit]));
    expect(units('ac_motor')).toEqual({ Rs: 'Ω', Rr: 'Ω', Lm: 'H', Lls: 'H', Llr: 'H', P: '', J: 'kg-m^2', B: 'N-m-s/rad' });
    expect(units('pmsm')).toEqual({ pole_pairs: '', Rs: 'Ω', Ld: 'H', Lq: 'H', L0: 'H', flux: 'Wb', J: 'kg-m^2', B: 'N-m-s/rad' });
    expect(units('three_phase_source')).toEqual({ Vrms: 'V', f: 'Hz', phase: 'deg' });
    expect(block('three_phase_source').params.phase.value).toBe(0); // Simscape default (F-068: no hidden pi/4)
    expect(block('ac_motor').params.Lls.min).toBe(0);
    expect(block('ac_motor').params.Lm.exclusiveMin).toBe(true);
  });

  it('every machine and the source documents its real equation with units (no generic label)', () => {
    for (const id of ['dc_motor', 'ac_motor', 'pmsm', 'bldc_motor', 'three_phase_source']) {
      const b = block(id);
      expect(isGenericText(b.equation), `${id} equation`).toBe(false);
      expect(isGenericText(b.description), `${id} description`).toBe(false);
      expect(b.equation).toMatch(/\[(V|N·m|Wb)\]/);
      const def = VLAB_COMPONENT_DEFINITIONS[id];
      expect(def.equations.length, `${id} definitions`).toBeGreaterThanOrEqual(3);
      expect(def.equations.join(' ')).toMatch(/\[(V|N\*m|A)\]/);
    }
    expect(block('dc_motor').equation).toContain('τ_e = k·I');
    expect(block('ac_motor').equation).toContain('τ_e = (3/2)·P·(ψ_sα·i_sβ − ψ_sβ·i_sα)');
    expect(block('pmsm').equation).toContain('v_q = Rs·i_q + Lq·di_q/dt + ω_e·(Ld·i_d + λm)');
    expect(block('pmsm').equation).toContain('τ_e = (3/2)·p·(λm·i_q + (Ld − Lq)·i_d·i_q)');
  });

  it('F-068: the three-phase source is no longer an implicit absolute potential; it has a star-point terminal', () => {
    expect(IMPLICIT_ABSOLUTE_POTENTIAL_BLOCKS.has('three_phase_source')).toBe(false);
    expect(block('three_phase_source').ports.map((p) => p.id)).toEqual(['abc', 'n']);
    // a source with loads but no Electrical Reference is a reported floating network, not silently grounded
    const m: Model = {
      nodes: [node('src', 'three_phase_source'), node('sp', 'phase_splitter'), node('ra', 'resistor', { R: 10 }), node('rb', 'resistor', { R: 10 }), node('rc', 'resistor', { R: 10 })],
      edges: [wire('src.abc', 'sp.abc'), wire('sp.a', 'ra.p'), wire('sp.b', 'rb.p'), wire('sp.c', 'rc.p'), wire('ra.n', 'src.n'), wire('rb.n', 'src.n'), wire('rc.n', 'src.n')],
    };
    let err: unknown;
    try { new VLabPhysicsEngine().simulateStep(m.nodes, m.edges, null, 0.001); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DAEStructureError);
    expect((err as DAEStructureError).diagnostics[0].code).toBe('floating-network');
  });

  it('F-064: machine shafts have an explicit, library-declared mechanical reference and no name-based rotational grounding', () => {
    for (const id of ['dc_motor', 'ac_motor', 'pmsm', 'bldc_motor']) {
      const decl = INTERNAL_MECHANICAL_REFERENCE[id];
      expect(decl, `${id} declares its mechanical reference`).toBeDefined();
      expect(decl.reason).toMatch(/inertial frame/);
      const shaft = block(id).ports.find((p) => p.id === decl.port)!;
      expect(shaft.domain).toBe('Rotational');
      // no machine port that the assembler's case/return name rule (c, b, n, ref, gnd) could ground is non-electrical
      for (const p of block(id).ports) {
        if (['c', 'b', 'n', 'ref', 'gnd'].includes(p.id.toLowerCase())) expect(p.domain, `${id}.${p.id}`).toBe('Electrical');
      }
      // and no electrical machine port is grounded by design
      expect(INTERNAL_REFERENCE_PORTS[id] ?? []).toEqual([]);
    }
    // the unconnected rotor port of a motor is not a reference: an unwired star point is OPEN, not 0 V
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 10, R_int: 0 }), GND, node('m', 'pmsm', { Rs: 1 }), node('w', 'ang_vel_source', { omega: 0 }), RREF,
        node('ra', 'resistor', { R: 1 }), node('rb', 'resistor', { R: 1 }), node('rc', 'resistor', { R: 1 }), node('spm', 'phase_splitter')],
      edges: [wire('vs.p', 'ra.p'), wire('vs.p', 'rb.p'), wire('vs.p', 'rc.p'), wire('vs.n', 'gnd.a'), wire('ra.n', 'spm.a'), wire('rb.n', 'spm.b'), wire('rc.n', 'spm.c'), wire('spm.abc', 'm.abc'),
        wire('m.r', 'w.r'), wire('w.c', 'rref.r')],
    };
    const sim = simulate(m, 60, 0.001);
    // star point open: i_a + i_b + i_c = 0 (zero-sequence current cannot flow) and the star point sits at the common-mode potential
    near(sim.at('m_branch_ia') + sim.at('m_branch_ib') + sim.at('m_branch_ic') + 1e-12, 1e-12, 1e-6, 'open star point: sum of phase currents = 0');
    near(sim.across('m', 'n'), 10, 1e-6, 'floating star point follows the common-mode potential, it is not tied to ground');
  });

  it('vector port plan has no machine / source entry left to mark (their abc ports are electrical, handled as composite/scalar terminals)', () => {
    for (const key of Object.keys(VECTOR_PORT_BACKLOG)) {
      expect(key).not.toMatch(/^(dc_motor|ac_motor|pmsm|bldc_motor|three_phase_source)\./);
    }
  });
});

// ── 2. DC motor ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-12a dc_motor (v = Ra i + La di/dt + k w,  tau_e = k i,  J dw/dt = tau_e - B w - tau_load)', () => {
  const dcModel = (V: number, motor: Record<string, any>, load: 'damper' | 'none' | 'locked', b = 0.05): Model => {
    const nodes = [node('vs', 'dc_voltage', { V, R_int: 0 }), GND, node('m', 'dc_motor', motor)];
    const edges = [wire('vs.p', 'm.p'), wire('vs.n', 'gnd.a'), wire('m.n', 'gnd.a')];
    if (load === 'damper') { nodes.push(node('load', 'rot_damper', { b }), RREF); edges.push(wire('m.r', 'load.r'), wire('load.c', 'rref.r')); }
    else if (load === 'locked') { nodes.push(node('w', 'ang_vel_source', { omega: 0 }), RREF); edges.push(wire('m.r', 'w.r'), wire('w.c', 'rref.r')); }
    else { nodes.push(node('load', 'inertia', { J: 1e-9, B: 0 })); edges.push(wire('m.r', 'load.r')); }
    return { nodes, edges };
  };

  it('no-load speed is V/k (B = 0) and k V/(Ra B + k^2) with viscous damping', () => {
    const V = 24, Ra = 1, La = 0.001, k = 0.1;
    // B = 0: w = V/k = 240 rad/s; mechanical time constant J Ra/k^2 = 0.1 s -> 2 s is 20 tau
    const sim0 = simulate(dcModel(V, { Ra, La, Ke: k, J: 0.001, B: 0 }, 'none'), 400, 0.005);
    near(sim0.at('m_state_omega'), V / k, 1e-4, 'no-load speed V/k');
    expect(sim0.at('m_branch_current')).toBeLessThan(1e-3); // no-load current ~ 0
    const B = 0.01;
    const sim1 = simulate(dcModel(V, { Ra, La, Ke: k, J: 0.001, B }, 'none'), 400, 0.005);
    near(sim1.at('m_state_omega'), (k * V) / (Ra * B + k * k), 1e-4, 'damped no-load speed');
  });

  it('stall (locked rotor): torque = k V/Ra and current = V/Ra', () => {
    const V = 12, Ra = 2, La = 0.01, k = 0.05;
    const sim = simulate(dcModel(V, { Ra, La, Ke: k, J: 0.01, B: 0.001 }, 'locked'), 100, 0.002);
    near(sim.at('m_branch_current'), V / Ra, 1e-6, 'stall current');
    near(sim.at('m_branch_torque'), (k * V) / Ra, 1e-6, 'stall torque');
  });

  it('electrical time constant La/Ra (locked rotor): i(tau_e) = (V/Ra)(1 - 1/e)', () => {
    const V = 12, Ra = 2, La = 0.01, tauE = La / Ra; // 5 ms
    const sim = simulate(dcModel(V, { Ra, La, Ke: 0.05, J: 0.01, B: 0.001 }, 'locked'), 10, tauE / 10);
    near(sim.at('m_branch_current'), (V / Ra) * (1 - Math.exp(-1)), 5e-3, 'i at t = La/Ra');
  });

  it('mechanical time constant J Ra/(Ra (B + b) + k^2): w(tau_m) = w_ss (1 - 1/e)', () => {
    const V = 24, Ra = 1, k = 0.1, J = 0.01, B = 0.002, b = 0.05;
    const wss = (k * V) / (Ra * (B + b) + k * k);
    const tauM = (J * Ra) / (Ra * (B + b) + k * k); // La negligible
    const sim = simulate(dcModel(V, { Ra, La: 1e-5, Ke: k, J, B }, 'damper', b), 40, tauM / 40);
    near(sim.at('m_state_omega'), wss * (1 - Math.exp(-1)), 5e-3, 'w at t = tau_m');
    const fin = simulate(dcModel(V, { Ra, La: 1e-5, Ke: k, J, B }, 'damper', b), 200, tauM / 8);
    near(fin.at('m_state_omega'), wss, 1e-4, 'steady-state speed');
    // the load damper receives b w and the machine delivers k I - B w (steady state)
    near(fin.at('m_branch_torque'), b * wss, 1e-3, 'delivered torque = b w');
  });

  it('power balance: V I = Ra I^2 + B w^2 + tau_load w + d/dt(La I^2/2 + J w^2/2) integrated over a start-up transient', () => {
    const V = 24, Ra = 1, La = 0.01, k = 0.1, J = 0.01, B = 0.002, b = 0.05;
    const dt = 0.001, steps = 500;
    let Ein = 0, Eres = 0, Edamp = 0, Eload = 0, prev: { p: number; r: number; d: number; l: number } | null = null;
    let last = { I: 0, w: 0 };
    simulate(dcModel(V, { Ra, La, Ke: k, J, B }, 'damper', b), steps, dt, (s) => {
      const I = s.at('m_branch_current'), w = s.at('m_state_omega');
      const cur = { p: V * I, r: Ra * I * I, d: B * w * w, l: b * w * w };
      if (prev) { Ein += 0.5 * (cur.p + prev.p) * dt; Eres += 0.5 * (cur.r + prev.r) * dt; Edamp += 0.5 * (cur.d + prev.d) * dt; Eload += 0.5 * (cur.l + prev.l) * dt; }
      prev = cur; last = { I, w };
    });
    const stored = 0.5 * La * last.I * last.I + 0.5 * J * last.w * last.w;
    const out = Eres + Edamp + Eload + stored;
    expect(Ein).toBeGreaterThan(1);
    near(Ein, out, 2e-3, `energy in ${Ein} J vs out ${out} J`);
  });

  it('a saved Kt that differs from Ke migrates to one constant k = Ke with a notice; equal values migrate silently', () => {
    const n1 = { id: 'm', position: { x: 0, y: 0 }, data: { type: 'dc_motor', params: { Ke: { value: 0.05 }, Kt: { value: 0.08 } }, ports: block('dc_motor').ports } } as any;
    const n2 = { id: 'm2', position: { x: 0, y: 0 }, data: { type: 'bldc_motor', params: { Ke: { value: 0.1 }, Kt: { value: 0.1 } }, ports: block('bldc_motor').ports } } as any;
    const out = normalizeLegacyVLabGraph([n1, n2], []).nodes;
    expect(out[0].data.params.Kt).toBeUndefined();
    expect(out[0].data.params.Ke.value).toBe(0.05);
    expect(out[0].data.migrationNotices).toHaveLength(1);
    expect(out[0].data.migrationNotices[0]).toMatch(/Kt = 0\.08.*Ke = 0\.05/);
    expect(out[1].data.params.Kt).toBeUndefined();
    expect(out[1].data.migrationNotices).toBeUndefined();
    expect(machineConstantNotice('dc_motor', { Kt: 0.05 })).toBeUndefined(); // equals the library default Ke
    // idempotent
    expect(normalizeLegacyVLabGraph(out, []).nodes[0].data.migrationNotices).toHaveLength(1);
  });
});

// ── 3. three-phase source ────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-12a three_phase_source (Simscape Three-Phase Source: wye, V_LL rms, f, phase angle of phase A)', () => {
  const f = 50, dt = 1 / (f * 200); // 200 samples per period
  const sourceModel = (params: Record<string, any>, loads: [number, number, number] = [10, 10, 10]): Model => ({
    nodes: [node('src', 'three_phase_source', params), node('sp', 'phase_splitter'), GND,
      node('ra', 'resistor', { R: loads[0] }), node('rb', 'resistor', { R: loads[1] }), node('rc', 'resistor', { R: loads[2] })],
    edges: [wire('src.abc', 'sp.abc'), wire('src.n', 'gnd.a'), wire('sp.a', 'ra.p'), wire('sp.b', 'rb.p'), wire('sp.c', 'rc.p'),
      wire('ra.n', 'gnd.a'), wire('rb.n', 'gnd.a'), wire('rc.n', 'gnd.a')],
  });
  const wrap = (a: number) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };

  it('phase voltages are Vpk sin(w t + phi - k 120 deg) at every step with Vpk = sqrt(2/3) V_LL (no hidden phase shift)', () => {
    for (const phiDeg of [0, 30, -75]) {
      const Vll = 400, R = 10;
      const Vpk = Vll * Math.sqrt(2 / 3), phi = phiDeg * Math.PI / 180;
      let worst = 0, checked = 0;
      simulate(sourceModel({ Vrms: Vll, f, phase: phiDeg }, [R, R, R]), 200, dt, (s) => {
        for (const [k, id] of [[0, 'ra'], [1, 'rb'], [2, 'rc']] as const) {
          const v = R * s.at(`${id}_branch_current`);
          const expected = Vpk * Math.sin(2 * Math.PI * f * s.t + phi - k * 2 * Math.PI / 3);
          worst = Math.max(worst, Math.abs(v - expected) / Vpk);
          checked++;
        }
      });
      expect(checked).toBe(600);
      expect(worst, `phi = ${phiDeg} deg: max |v - v_published| / Vpk`).toBeLessThan(1e-9);
    }
  });

  it('V_LL rms over a period, 120 degree displacement (DFT phase), and the phase parameter', () => {
    const Vll = 400, R = 10, phiDeg = 20;
    const va: number[] = [], vb: number[] = [], vc: number[] = [], t: number[] = [];
    simulate(sourceModel({ Vrms: Vll, f, phase: phiDeg }, [R, R, R]), 200, dt, (s) => {
      va.push(R * s.at('ra_branch_current')); vb.push(R * s.at('rb_branch_current')); vc.push(R * s.at('rc_branch_current')); t.push(s.t);
    });
    const rms = (x: number[]) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
    const vab = va.map((v, i) => v - vb[i]);
    const vbc = vb.map((v, i) => v - vc[i]);
    near(rms(vab), Vll, 1e-9, 'rms(v_ab) = V_LL');
    near(rms(vbc), Vll, 1e-9, 'rms(v_bc) = V_LL');
    near(rms(va), Vll / Math.sqrt(3), 1e-9, 'rms(v_a) = V_LL/sqrt(3)');
    // fundamental phasor by DFT over exactly one period: (2/N) sum v e^{-j w t} = -j Vpk e^{j phi_k}
    const angle = (x: number[]) => {
      let re = 0, im = 0;
      x.forEach((v, i) => { const a = 2 * Math.PI * f * t[i]; re += v * Math.cos(a); im -= v * Math.sin(a); });
      return Math.atan2(im, re) + Math.PI / 2; // phi_k
    };
    const phiA = angle(va), phiB = angle(vb), phiC = angle(vc);
    near(phiA, phiDeg * Math.PI / 180, 1e-9, 'phase parameter = angle of phase A');
    near(Math.abs(wrap(phiA - phiB)), 2 * Math.PI / 3, 1e-9, 'a leads b by 120 deg');
    near(Math.abs(wrap(phiB - phiC)), 2 * Math.PI / 3, 1e-9, 'b leads c by 120 deg');
    near(Math.abs(wrap(phiC - phiA)), 2 * Math.PI / 3, 1e-9, 'c leads a by 120 deg');
    expect(wrap(phiA - phiB)).toBeGreaterThan(0); // positive a-b-c sequence
  });

  it('neutral current is zero for a balanced load and i_n = -(i_a + i_b + i_c) = sum(v_k/R_k) for an unbalanced one', () => {
    let worstBalanced = 0;
    simulate(sourceModel({ Vrms: 400, f, phase: 0 }, [10, 10, 10]), 200, dt, (s) => {
      const sum = s.at('src_branch_phase_a') + s.at('src_branch_phase_b') + s.at('src_branch_phase_c');
      worstBalanced = Math.max(worstBalanced, Math.abs(sum));
      // each source current is minus the load current (Simscape sign: delivering power = negative through current)
      expect(Math.abs(s.at('src_branch_phase_a') + s.at('ra_branch_current'))).toBeLessThan(1e-9);
    });
    expect(worstBalanced, 'balanced load: sum of phase currents').toBeLessThan(1e-9);
    const R = [10, 20, 40]; const Vpk = 400 * Math.sqrt(2 / 3);
    let worst = 0;
    simulate(sourceModel({ Vrms: 400, f, phase: 0 }, R as any), 200, dt, (s) => {
      const vk = [0, 1, 2].map((k) => Vpk * Math.sin(2 * Math.PI * f * s.t - k * 2 * Math.PI / 3));
      const inExpected = vk.reduce((a, v, k) => a + v / R[k], 0); // current returned through n to ground
      const sum = s.at('src_branch_phase_a') + s.at('src_branch_phase_b') + s.at('src_branch_phase_c'); // into n
      worst = Math.max(worst, Math.abs(sum + inExpected));
    });
    expect(worst, 'unbalanced: neutral current').toBeLessThan(1e-9);
  });

  it('migration: a legacy source (scalar a/b/c, absolute to ground) becomes composite + Phase Splitter + Electrical Reference, same circuit', () => {
    const legacyPorts = ['a', 'b', 'c'].map((id) => ({ id, pos: 'right', label: id.toUpperCase(), domain: 'Electrical' }));
    const nodes = [
      { id: 'vs', position: { x: 10, y: 20 }, data: { type: 'three_phase_source', params: { Vrms: { value: 400 }, f: { value: 50 } }, ports: legacyPorts } },
      { id: 'ra', position: { x: 0, y: 0 }, data: { type: 'resistor', params: { R: { value: 10 } }, ports: block('resistor').ports } },
      { id: 'rb', position: { x: 0, y: 0 }, data: { type: 'resistor', params: { R: { value: 10 } }, ports: block('resistor').ports } },
      { id: 'rc', position: { x: 0, y: 0 }, data: { type: 'resistor', params: { R: { value: 10 } }, ports: block('resistor').ports } },
      { id: 'gnd', position: { x: 0, y: 0 }, data: { type: 'ground', params: {}, ports: block('ground').ports } },
    ] as any[];
    const edges = [
      { id: 'e1', source: 'vs', sourceHandle: 'a_s', target: 'ra', targetHandle: 'p_t' },
      { id: 'e2', source: 'vs', sourceHandle: 'b_s', target: 'rb', targetHandle: 'p_t' },
      { id: 'e3', source: 'rc', sourceHandle: 'p_s', target: 'vs', targetHandle: 'c_t' },
      { id: 'e4', source: 'ra', sourceHandle: 'n_s', target: 'gnd', targetHandle: 'a_t' },
      { id: 'e5', source: 'rb', sourceHandle: 'n_s', target: 'gnd', targetHandle: 'a_t' },
      { id: 'e6', source: 'rc', sourceHandle: 'n_s', target: 'gnd', targetHandle: 'a_t' },
    ] as any[];
    const out = normalizeLegacyVLabGraph(nodes, edges);
    const src = out.nodes.find((n) => n.id === 'vs')!;
    expect(src.data.ports.map((p: any) => p.id)).toEqual(['abc', 'n']);
    expect(src.data.params.phase.value).toBe(0);
    const split = out.nodes.find((n) => n.data.type === 'phase_splitter')!;
    expect(split).toBeDefined();
    expect(out.nodes.filter((n) => n.data.type === 'ground')).toHaveLength(2); // the model's own plus the star-point reference
    const find = (id: string) => out.edges.find((e) => e.id === id)!;
    expect(find('e1').source).toBe(split.id); expect(find('e2').source).toBe(split.id); expect(find('e3').target).toBe(split.id);
    expect(find('e1').sourceHandle).toBe('a_s');
    // the migrated model runs and reproduces the old waveform amplitude on the loads (phase param backfilled to 0)
    const sim = simulate({ nodes: out.nodes.map((n) => ({ ...n, type: 'default' })) as Node[], edges: out.edges as Edge[] }, 25, 0.0005);
    const Vpk = 400 * Math.sqrt(2 / 3);
    near(10 * sim.at('ra_branch_current'), Vpk * Math.sin(2 * Math.PI * 50 * 0.0125), 1e-6, 'v_a at t = 12.5 ms');
    // idempotent: a second pass does not insert anything
    const again = normalizeLegacyVLabGraph(out.nodes, out.edges);
    expect(again.nodes.length).toBe(out.nodes.length);
    expect(again.edges.length).toBe(out.edges.length);
  });
});

// ── 4. induction machine ───────────────────────────────────────────────────────────────────────────────────────────────
type C = { re: number; im: number };
const cx = (re: number, im = 0): C => ({ re, im });
const cadd = (a: C, b: C): C => cx(a.re + b.re, a.im + b.im);
const cmul = (a: C, b: C): C => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a: C, b: C): C => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const cabs = (a: C) => Math.hypot(a.re, a.im);

/**
 * Per-phase T-equivalent circuit (Krause ch. 4; Simscape Asynchronous Machine Squirrel Cage): V_ph (rms) feeds Rs + j Xls in
 * series with the parallel of j Xm and (Rr/s + j Xlr). Returns { torque [N m], statorCurrentRms, rotorCurrentRms }.
 *   I_r = I_s Zm/(Zm + Zr),  T = 3 |I_r|^2 (Rr/s) / w_sync,  w_sync = 2 pi f / P.
 */
function inductionEquivalentCircuit(p: { Vph: number; f: number; P: number; Rs: number; Rr: number; Lls: number; Llr: number; Lm: number }, s: number) {
  const w = 2 * Math.PI * p.f, wSync = w / p.P;
  const Zs = cx(p.Rs, w * p.Lls);
  const Zr = cx(p.Rr / s, w * p.Llr);
  const Zm = cx(0, w * p.Lm);
  const Zpar = cdiv(cmul(Zm, Zr), cadd(Zm, Zr));
  const Is = cdiv(cx(p.Vph), cadd(Zs, Zpar));
  const Ir = cmul(Is, cdiv(Zm, cadd(Zm, Zr)));
  return { torque: (3 * cabs(Ir) ** 2 * (p.Rr / s)) / wSync, statorCurrentRms: cabs(Is), rotorCurrentRms: cabs(Ir), wSync };
}

describe('WP-12a ac_motor: squirrel-cage induction machine vs the per-phase equivalent circuit (Krause dq0)', () => {
  // A small machine (rotor time constant Lr/Rr = 11 ms) on a 20 Hz supply keeps the adaptive implicit solve cheap; the
  // equivalent-circuit relations below hold for any parameters.
  const MP = { Rs: 0.5, Rr: 0.4, Lls: 0.0004, Llr: 0.0004, Lm: 0.004, P: 2 };
  const f = 20, Vll = 60;
  const gridModel = (extra: Record<string, any>, shaft: 'speed' | 'free', omega = 0): Model => {
    const nodes = [node('src', 'three_phase_source', { Vrms: Vll, f, phase: 0 }), GND,
      node('m', 'ac_motor', { ...MP, ...extra })];
    const edges = [wire('src.abc', 'm.abc'), wire('src.n', 'gnd.a')];
    if (shaft === 'speed') { nodes.push(node('w', 'ang_vel_source', { omega }), RREF); edges.push(wire('m.r', 'w.r'), wire('w.c', 'rref.r')); }
    else { nodes.push(node('load', 'inertia', { J: 1e-9, B: 0 })); edges.push(wire('m.r', 'load.r')); }
    return { nodes, edges };
  };

  /** One run at slip s: mean torque and rms phase-a current over the last supply period (20 samples), compared with the equivalent circuit. */
  const steadyState = (s: number, config: any = null) => {
    const wSync = 2 * Math.PI * f / MP.P;
    const dt = 0.0025, steps = 60; // 0.15 s = 14 rotor time constants (Lr/Rr = 11 ms); the last 20 samples are one supply period
    const torque: number[] = [], ia: number[] = [];
    simulate(gridModel({ J: 0.05, B: 0 }, 'speed', (1 - s) * wSync), steps, dt, (sample, k) => {
      if (k >= steps - 20) { torque.push(sample.at('m_branch_torque')); ia.push(sample.at('m_branch_ia')); }
    }, config);
    const ref = inductionEquivalentCircuit({ ...MP, Vph: Vll / Math.sqrt(3), f }, s);
    const meanTorque = torque.reduce((a, v) => a + v, 0) / torque.length;
    // exact rms of one full period (a sampled peak of 20 samples per period would under-read by up to 1.2 %)
    const rmsIa = Math.sqrt(ia.reduce((a, v) => a + v * v, 0) / ia.length);
    return { ref, meanTorque, rmsIa };
  };
  const ratedTorque = inductionEquivalentCircuit({ ...MP, Vph: Vll / Math.sqrt(3), f }, 0.05).torque;

  for (const s of [0.05, 0.02, -0.05, 1]) {
    it(`steady-state torque and stator current at slip s = ${s} match the equivalent circuit (speed held by a stiff speed source)`, () => {
      const { ref, meanTorque, rmsIa } = steadyState(s);
      // eslint-disable-next-line no-console
      console.info(`[WP-12a] IM s=${s}: torque analytic ${ref.torque.toFixed(4)} N m, simulated ${meanTorque.toFixed(4)} N m (${pct(meanTorque, ref.torque).toFixed(4)} %, ${(Math.abs(meanTorque - ref.torque) / ratedTorque * 100).toFixed(3)} % of rated); stator current rms analytic ${ref.statorCurrentRms.toFixed(4)} A, simulated ${rmsIa.toFixed(4)} A (${pct(rmsIa, ref.statorCurrentRms).toFixed(4)} %)`);
      // default adaptive control (local error 1e-3 relative): the torque error is normalised to the rated torque (s = 0.05) of this machine
      expect(Math.abs(meanTorque - ref.torque), `torque at s = ${s}: ${meanTorque} vs ${ref.torque}`).toBeLessThanOrEqual(2.5e-2 * ratedTorque);
      near(rmsIa, ref.statorCurrentRms, 5e-3, `stator current rms at s = ${s}`);
      // generating (s < 0) has negative torque, motoring (0 < s <= 1) positive
      expect(Math.sign(meanTorque)).toBe(Math.sign(s));
    }, 120000);
  }

  for (const [s, tol] of [[0.05, 3e-4]] as const) {
    it(`with a tight local-error tolerance (${tol}) the simulated torque and current converge to the equivalent circuit (s = ${s}): the formula is exact, the default-tolerance error is discretisation`, () => {
      const { ref, meanTorque, rmsIa } = steadyState(s, tight(tol));
      // eslint-disable-next-line no-console
      console.info(`[WP-12a] IM s=${s} (tight ${tol}): torque analytic ${ref.torque.toFixed(5)}, simulated ${meanTorque.toFixed(5)} (${pct(meanTorque, ref.torque).toFixed(4)} %); stator current rms analytic ${ref.statorCurrentRms.toFixed(5)}, simulated ${rmsIa.toFixed(5)} (${pct(rmsIa, ref.statorCurrentRms).toFixed(4)} %)`);
      near(meanTorque, ref.torque, 5e-3, `tight torque at s = ${s}`);
      near(rmsIa, ref.statorCurrentRms, 2e-3, `tight stator current rms at s = ${s}`);
    }, 120000);
  }

  it('the published Krause equations (alpha-beta, rotor flux form) integrated independently with RK4 reproduce the equivalent circuit to 1e-5: the residual torque error of the engine is discretisation', () => {
    const { Rs, Rr, Lls, Llr, Lm, P } = MP;
    const Ls = Lls + Lm, Lr = Llr + Lm, sigmaLs = Ls - (Lm * Lm) / Lr;
    for (const s of [0.05, -0.05]) {
      const w = 2 * Math.PI * f, wSync = w / P, wE = P * (1 - s) * wSync, Vm = Vll * Math.sqrt(2 / 3);
      const vA = (t: number) => Vm * Math.sin(w * t), vB = (t: number) => -Vm * Math.cos(w * t);
      const der = (t: number, x: number[]) => {
        const [iA, iB, pA, pB] = x;
        const dpA = -(Rr / Lr) * (pA - Lm * iA) - wE * pB, dpB = -(Rr / Lr) * (pB - Lm * iB) + wE * pA;
        return [(vA(t) - Rs * iA - (Lm / Lr) * dpA) / sigmaLs, (vB(t) - Rs * iB - (Lm / Lr) * dpB) / sigmaLs, dpA, dpB];
      };
      let x = [0, 0, 0, 0], t = 0, tSum = 0, n = 0;
      const h = 2e-6, T = 0.3;
      while (t < T) {
        const k1 = der(t, x), k2 = der(t + h / 2, x.map((v, i) => v + h / 2 * k1[i])), k3 = der(t + h / 2, x.map((v, i) => v + h / 2 * k2[i])), k4 = der(t + h, x.map((v, i) => v + h * k3[i]));
        x = x.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
        t += h;
        if (t > T - 1 / f) { tSum += 1.5 * P * (Lm / Lr) * (x[2] * x[1] - x[3] * x[0]); n++; }
      }
      near(tSum / n, inductionEquivalentCircuit({ ...MP, Vph: Vll / Math.sqrt(3), f }, s).torque, 1e-5, `RK4 torque at s = ${s}`);
    }
  });

  it('free-running with no load and no friction the rotor reaches synchronous speed 2 pi f / P', () => {
    const J = 0.05;
    let wLast = 0, wPrev = 0;
    simulate(gridModel({ J, B: 0 }, 'free'), 100, 0.01, (s) => { wPrev = wLast; wLast = s.at('m_state_omega'); });
    near(wLast, 2 * Math.PI * f / MP.P, 2e-3, 'synchronous speed');
    expect(Math.abs(wLast - wPrev)).toBeLessThan(0.02); // settled
  }, 120000);

  it('starting from rest on the grid (F-013): the transient converges at every step, no SDIRK fallback, speed rises monotonically towards synchronous', () => {
    const speeds: number[] = [];
    const sim = simulate(gridModel({ J: 0.5, B: 0.01 }, 'free'), 60, 0.01, (s) => { speeds.push(s.at('m_state_omega')); });
    expect(Number.isFinite(sim.at('m_state_omega'))).toBe(true);
    expect(speeds[speeds.length - 1]).toBeGreaterThan(speeds[10]);
    expect(speeds[speeds.length - 1]).toBeLessThanOrEqual(2 * Math.PI * f / MP.P * 1.05);
  }, 120000);

  it('rotor-flux states and the stator star point obey the published relations: open star point -> i_a + i_b + i_c = 0; torque = 3/2 P Lm/Lr (psi_ra i_b - psi_rb i_a)', () => {
    const wSync = 2 * Math.PI * f / MP.P;
    const Lr = MP.Llr + MP.Lm;
    let worstSum = 0, worstTorque = 0, teScale = 0, n = 0;
    simulate(gridModel({ J: 0.05, B: 0 }, 'speed', 0.9 * wSync), 60, 0.0025, (s, k) => {
      if (k < 3) return; // the speed source steps w from 0: the first BDF samples carry J dw/dt of that jump
      const ia = s.at('m_branch_ia'), ib = s.at('m_branch_ib'), ic = s.at('m_branch_ic');
      worstSum = Math.max(worstSum, Math.abs(ia + ib + ic));
      const iAlpha = (2 * ia - ib - ic) / 3, iBeta = (ib - ic) / Math.sqrt(3);
      const te = 1.5 * MP.P * (MP.Lm / Lr) * (s.at('m_state_psi_r_alpha') * iBeta - s.at('m_state_psi_r_beta') * iAlpha);
      // with B = 0 and a stiff speed source the delivered torque is te - J dw/dt = te
      worstTorque = Math.max(worstTorque, Math.abs(s.at('m_branch_torque') - te));
      teScale = Math.max(teScale, Math.abs(te));
      n++;
    });
    expect(n).toBe(57);
    expect(worstSum).toBeLessThan(1e-9);
    expect(teScale).toBeGreaterThan(1);
    expect(worstTorque / teScale).toBeLessThan(1e-4);
  }, 120000);
});

// ── 5. PMSM ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('WP-12a pmsm: dq model vs the closed-form steady state', () => {
  const PP = { pole_pairs: 4, Rs: 0.5, Ld: 0.02, Lq: 0.035, L0: 0.005, flux: 0.1 };
  const omegaM = 5; // mechanical rad/s -> w_e = 20 rad/s (low frequency keeps the adaptive implicit solve cheap)
  const wE = PP.pole_pairs * omegaM;
  const fE = wE / (2 * Math.PI);
  const supplied = (Vll: number, phaseDeg: number): Model => ({
    nodes: [node('src', 'three_phase_source', { Vrms: Vll, f: fE, phase: phaseDeg }), GND, node('m', 'pmsm', { ...PP, J: 0.02, B: 0 }),
      node('w', 'ang_vel_source', { omega: omegaM }), RREF],
    edges: [wire('src.abc', 'm.abc'), wire('src.n', 'gnd.a'), wire('m.r', 'w.r'), wire('w.c', 'rref.r')],
  });

  for (const phaseDeg of [200, 150, 330]) {
    it(`steady-state i_d, i_q and torque on a balanced supply (phase of v_a = ${phaseDeg} deg) match the dq closed form`, () => {
      const Vll = 6, Vm = Vll * Math.sqrt(2 / 3), phi = phaseDeg * Math.PI / 180;
      // Park transform of v_a = Vm sin(x), x = w_e t + phi, rotor angle w_e t (d axis on phase a at t = 0):  v_d = Vm sin(phi), v_q = -Vm cos(phi)
      const vd = Vm * Math.sin(phi), vq = -Vm * Math.cos(phi);
      // v_d = Rs i_d - w Lq i_q ; v_q = Rs i_q + w (Ld i_d + lambda_m)  ->  2x2 linear system
      const D = PP.Rs * PP.Rs + wE * wE * PP.Ld * PP.Lq;
      const id = (PP.Rs * vd + wE * PP.Lq * (vq - wE * PP.flux)) / D;
      const iq = (PP.Rs * (vq - wE * PP.flux) - wE * PP.Ld * vd) / D;
      const te = 1.5 * PP.pole_pairs * (PP.flux * iq + (PP.Ld - PP.Lq) * id * iq);
      const dt = 0.005, steps = 140; // 0.7 s = 10 L/R (Lq/Rs = 70 ms)
      let idSim = 0, iqSim = 0, torque = 0;
      simulate(supplied(Vll, phaseDeg), steps, dt, (s, k) => {
        if (k === steps - 1) {
          const th = wE * s.t;
          const ia = s.at('m_branch_ia'), ib = s.at('m_branch_ib'), ic = s.at('m_branch_ic');
          const iAlpha = (2 * ia - ib - ic) / 3, iBeta = (ib - ic) / Math.sqrt(3);
          idSim = Math.cos(th) * iAlpha + Math.sin(th) * iBeta;
          iqSim = -Math.sin(th) * iAlpha + Math.cos(th) * iBeta;
          torque = s.at('m_branch_torque');
        }
      });
      // eslint-disable-next-line no-console
      console.info(`[WP-12a] PMSM phi=${phaseDeg}: id analytic ${id.toFixed(5)} sim ${idSim.toFixed(5)} (${pct(idSim, id).toFixed(4)} %); iq analytic ${iq.toFixed(5)} sim ${iqSim.toFixed(5)} (${pct(iqSim, iq).toFixed(4)} %); torque analytic ${te.toFixed(5)} sim ${torque.toFixed(5)} (${pct(torque, te).toFixed(4)} %)`);
      // default adaptive control (local error 1e-3 relative): errors normalised to the dq current amplitude / the torque scale 1.5 p lambda_m |i_dq|
      const iAmp = Math.hypot(id, iq), tScale = 1.5 * PP.pole_pairs * PP.flux * iAmp;
      expect(Math.abs(idSim - id) / iAmp, 'i_d / |i_dq|').toBeLessThan(5e-3);
      expect(Math.abs(iqSim - iq) / iAmp, 'i_q / |i_dq|').toBeLessThan(5e-3);
      expect(Math.abs(torque - te) / tScale, 'torque (1.5 p (lambda_m i_q + (Ld - Lq) i_d i_q)) / scale').toBeLessThan(1e-2);
    });
  }

  it('with a tight local-error tolerance (1e-4) i_d, i_q and the torque converge to the closed form (phase 150 deg)', () => {
    const Vll = 6, Vm = Vll * Math.sqrt(2 / 3), phi = 150 * Math.PI / 180;
    const vd = Vm * Math.sin(phi), vq = -Vm * Math.cos(phi);
    const D = PP.Rs * PP.Rs + wE * wE * PP.Ld * PP.Lq;
    const id = (PP.Rs * vd + wE * PP.Lq * (vq - wE * PP.flux)) / D;
    const iq = (PP.Rs * (vq - wE * PP.flux) - wE * PP.Ld * vd) / D;
    const te = 1.5 * PP.pole_pairs * (PP.flux * iq + (PP.Ld - PP.Lq) * id * iq);
    const dt = 0.005, steps = 140;
    let idSim = 0, iqSim = 0, torque = 0;
    simulate(supplied(Vll, 150), steps, dt, (s, k) => {
      if (k === steps - 1) {
        const th = wE * s.t;
        const ia = s.at('m_branch_ia'), ib = s.at('m_branch_ib'), ic = s.at('m_branch_ic');
        const iAlpha = (2 * ia - ib - ic) / 3, iBeta = (ib - ic) / Math.sqrt(3);
        idSim = Math.cos(th) * iAlpha + Math.sin(th) * iBeta;
        iqSim = -Math.sin(th) * iAlpha + Math.cos(th) * iBeta;
        torque = s.at('m_branch_torque');
      }
    }, tight(1e-4));
    // eslint-disable-next-line no-console
    console.info(`[WP-12a] PMSM phi=150 (tight): id analytic ${id.toFixed(5)} sim ${idSim.toFixed(5)} (${pct(idSim, id).toFixed(4)} %); iq analytic ${iq.toFixed(5)} sim ${iqSim.toFixed(5)} (${pct(iqSim, iq).toFixed(4)} %); torque analytic ${te.toFixed(5)} sim ${torque.toFixed(5)} (${pct(torque, te).toFixed(4)} %)`);
    near(idSim, id, 1e-3, 'i_d');
    near(iqSim, iq, 1e-3, 'i_q');
    near(torque, te, 1e-3, 'torque');
  }, 120000);

  it('open-circuit phase voltage is the back-EMF -lambda_m w_e sin(w_e t): amplitude lambda_m w_e', () => {
    const R = 1e6;
    const m: Model = {
      nodes: [GND, node('m', 'pmsm', { ...PP, J: 0.02, B: 0 }), node('w', 'ang_vel_source', { omega: omegaM }), RREF,
        node('ra', 'resistor', { R }), node('rb', 'resistor', { R }), node('rc', 'resistor', { R }), node('spm', 'phase_splitter')],
      edges: [wire('m.abc', 'spm.abc'), wire('spm.a', 'ra.p'), wire('spm.b', 'rb.p'), wire('spm.c', 'rc.p'), wire('ra.n', 'gnd.a'), wire('rb.n', 'gnd.a'), wire('rc.n', 'gnd.a'), wire('m.n', 'gnd.a'),
        wire('m.r', 'w.r'), wire('w.c', 'rref.r')],
    };
    const dt = (1 / fE) / 100;
    let peak = 0, worst = 0;
    simulate(m, 100, dt, (s) => {
      const t = s.t;
      const va = R * s.at('ra_branch_current');
      const vb = R * s.at('rb_branch_current');
      peak = Math.max(peak, Math.abs(va));
      // v_alpha + j v_beta = j lambda_m w_e e^{j theta_e}  ->  v_a = -lambda_m w_e sin(theta_e), v_b = -lambda_m w_e sin(theta_e - 2 pi/3)
      worst = Math.max(worst, Math.abs(va + PP.flux * wE * Math.sin(wE * t)), Math.abs(vb + PP.flux * wE * Math.sin(wE * t - 2 * Math.PI / 3)));
    });
    near(peak, PP.flux * wE, 5e-3, 'back-EMF amplitude lambda_m w_e');
    expect(worst / (PP.flux * wE)).toBeLessThan(5e-3);
  });

  it('free-running PMSM synchronised to a grid at the electrical speed settles at p w = w_e (torque -> 0, no load)', () => {
    const m: Model = supplied(6, 180);
    m.nodes = m.nodes.filter((n) => n.id !== 'w' && n.id !== 'rref');
    m.edges = m.edges.filter((e) => e.source !== 'w' && e.target !== 'w' && e.source !== 'rref' && e.target !== 'rref');
    m.nodes.push(node('load', 'inertia', { J: 1e-9, B: 0 }));
    m.edges.push(wire('m.r', 'load.r'));
    // start from rest the machine cannot synchronise by itself (no damper winding), but it must run without a convergence failure
    const sim = simulate(m, 60, 0.005);
    expect(Number.isFinite(sim.at('m_state_omega'))).toBe(true);
  });
});

// ── 6. BLDC ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Unit trapezoid of the published BLDC model: +1 over 120 deg, 60 deg ramps (Pillay and Krishnan 1989, fig. 2); period 2 pi. */
const trapezoid = (x: number): number => {
  const d = (((x * 180 / Math.PI) % 360) + 360) % 360; // degrees in [0, 360)
  if (d < 30) return d / 30;
  if (d < 150) return 1;
  if (d < 210) return 1 - (d - 150) / 30;
  if (d < 330) return -1;
  return -1 + (d - 330) / 30;
};

describe('WP-12a bldc_motor: trapezoidal back-EMF and torque (e_x = Ke w f(P theta - phi_x), tau = sum(e_x i_x)/w)', () => {
  const BP = { Rs: 0.2, Ls: 0.002, Ke: 0.1, P: 4 };
  const omegaM = 60;
  const generator = (RL: number): Model => ({
    nodes: [GND, node('m', 'bldc_motor', { ...BP, J: 0.02, B: 0.003 }), node('w', 'ang_vel_source', { omega: omegaM }), RREF,
      node('ra', 'resistor', { R: RL }), node('rb', 'resistor', { R: RL }), node('rc', 'resistor', { R: RL }), node('spm', 'phase_splitter')],
    edges: [wire('m.abc', 'spm.abc'), wire('spm.a', 'ra.p'), wire('spm.b', 'rb.p'), wire('spm.c', 'rc.p'), wire('ra.n', 'gnd.a'), wire('rb.n', 'gnd.a'), wire('rc.n', 'gnd.a'), wire('m.g', 'gnd.a'),
      wire('m.r', 'w.r'), wire('w.c', 'rref.r')],
  });
  const phases = [0, 2 * Math.PI / 3, -2 * Math.PI / 3];

  it('open-circuit phase voltages are the trapezoidal back-EMF Ke w f(P theta - phi_x) at every step', () => {
    const R = 1e6;
    const dt = 0.0005;
    let worst = 0, seenFlat = 0, seenRamp = 0;
    simulate(generator(R), 400, dt, (s) => {
      const th = omegaM * s.t;
      for (const [k, id] of [[0, 'ra'], [1, 'rb'], [2, 'rc']] as const) {
        const expected = BP.Ke * omegaM * trapezoid(BP.P * th - phases[k]);
        const v = R * s.at(`${id}_branch_current`);
        worst = Math.max(worst, Math.abs(v - expected) / (BP.Ke * omegaM));
        const f = Math.abs(trapezoid(BP.P * th - phases[k]));
        if (f === 1) seenFlat++; else if (f > 0.02 && f < 0.98) seenRamp++;
      }
    });
    expect(seenFlat, 'covers the flat tops').toBeGreaterThan(100);
    expect(seenRamp, 'covers the ramps').toBeGreaterThan(20);
    // 1e6 ohm sense resistors load the 0.2 ohm winding by 2e-7 relative
    expect(worst).toBeLessThan(5e-3);
  });

  it('electromagnetic torque is Ke sum(f_x i_x) (= sum(e_x i_x)/w) and the energy balances over many electrical periods', () => {
    const RL = 2, B = 0.003, dt = 0.0005, steps = 400;
    let eShaft = 0, eRes = 0, prev: { p: number; r: number } | null = null, W0: number | null = null, W1 = 0;
    let worstTorque = 0, firstT = 0, lastT = 0;
    simulate(generator(RL), steps, dt, (s, k) => {
      if (k < 3) return; // the speed source steps w from 0 to 60 rad/s: the first BDF samples carry J dw/dt of that jump
      const th = omegaM * s.t;
      const i = [s.at('m_branch_ia'), s.at('m_branch_ib'), s.at('m_branch_ic')];
      const fx = phases.map((ph) => trapezoid(BP.P * th - ph));
      const te = BP.Ke * (fx[0] * i[0] + fx[1] * i[1] + fx[2] * i[2]);
      // delivered shaft torque with a stiff speed source: tau = te - B w
      worstTorque = Math.max(worstTorque, Math.abs(s.at('m_branch_torque') - (te - B * omegaM)));
      // power from the shaft source into the machine = -tau w ; electrical losses (load + winding resistance) ; stored Ls i^2/2
      const cur = { p: -s.at('m_branch_torque') * omegaM, r: (RL + BP.Rs) * (i[0] ** 2 + i[1] ** 2 + i[2] ** 2) };
      const W = 0.5 * BP.Ls * (i[0] ** 2 + i[1] ** 2 + i[2] ** 2);
      if (prev) { eShaft += 0.5 * (cur.p + prev.p) * dt; eRes += 0.5 * (cur.r + prev.r) * dt; lastT = s.t; } else { firstT = s.t; }
      if (W0 === null) W0 = W;
      W1 = W;
      prev = cur;
    });
    expect(worstTorque).toBeLessThan(2e-3);
    // sum(e_x i_x) = te w :  -te w = (Rs + RL) sum(i^2) + d/dt(Ls sum(i^2)/2)  =>  shaft energy = losses + damping + stored change
    const damping = B * omegaM * omegaM * (lastT - firstT);
    expect(eShaft).toBeGreaterThan(1);
    near(eShaft, eRes + damping + (W1 - (W0 ?? 0)), 1e-2, 'shaft energy = I^2 R losses + damping + change of stored magnetic energy');
  });
});
