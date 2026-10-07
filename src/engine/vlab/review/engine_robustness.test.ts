import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { ImplicitSolver } from '../ImplicitSolver';
import { SparseLinearSolver } from '../SparseLinearSolver';
import { SingularMatrixError, VLabSolverDiagnosticError } from '../vlabResidualDiagnostics';
import type { EquationContext } from '../types';
import type { SolverConfiguration } from '../kernel/types';
import { EquationAssembler } from '../kernel/EquationAssembler';
import { PhysicalSystemCompiler } from '../kernel/PhysicalSystemCompiler';

/**
 * WP-31b: engine correctness and error propagation (F-095, F-050, F-103, F-084/F-101, F-051).
 *
 * Every expected value is computed HERE from the governing equation (Kirchhoff + the element laws, the closed-form RLC / RC
 * step responses, the exact switching instants of the PWM comparator), never read back from the code under test.
 * Convention (Simscape): through variable positive A -> B through the block, across = v_A - v_B. SI units.
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

const cfg = (over: Partial<SolverConfiguration> = {}): SolverConfiguration => ({
  id: 'wp31b', solver: 'auto', startTime: 0, stopTime: 1, initialStep: 'auto', minimumStep: 1e-6, maximumStep: 1e-3,
  relativeTolerance: 1e-3, absoluteTolerance: 1e-6, maximumIterations: 50, nonlinearTolerance: 1e-10,
  enableDiagnostics: false, enableLogging: false, ...over,
});

function run(m: Model, steps: number, dt: number, config: any = null, probe?: (state: any, t: number) => void): any {
  const engine = new VLabPhysicsEngine(config);
  let state: any = null;
  for (let k = 0; k < steps; k++) {
    state = engine.simulateStep(m.nodes, m.edges, state, dt);
    probe?.(state, (k + 1) * dt);
  }
  return state;
}
const value = (state: any, name: string): number => {
  const i = state.variableNames.indexOf(name);
  if (i < 0) throw new Error(`no variable ${name}`);
  return state.x[i];
};
const quiet = <T>(fn: () => T): T => {
  const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try { return fn(); } finally { w.mockRestore(); }
};

// ── F-095: total work guard ─────────────────────────────────────────────────────────────────────────────────────────────
describe('F-095: a non-advancing model fails fast with a diagnostic (no endless loop)', () => {
  // Moist-air chamber whose wall port H is tied to the Thermal Reference (0 K): p = m R T / V vanishes with T, the pressure
  // row loses its pivot. This exact model used to crawl at h = 1 us accepting unconverged states (~8 min per 0.1 s call).
  const chamberOnRef = (): Model => ({
    nodes: [node('ch', 'ma_chamber', { V: 0.005 }), node('tref', 'thermal_ref')],
    edges: [wire('ch.h', 'tref.a')],
  });

  it('throws VLabSolverDiagnosticError within seconds, naming the blocks, the worst residual rows and the singular unknown', () => {
    const t0 = Date.now();
    let caught: unknown;
    quiet(() => {
      try { run(chamberOnRef(), 1, 0.1); } catch (e) { caught = e; }
    });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(caught).toBeInstanceOf(VLabSolverDiagnosticError);
    const d = (caught as VLabSolverDiagnosticError).diagnostic;
    expect(d.blocks.join(' ')).toContain('ma_chamber');
    expect(d.worstResidualRows.length).toBeGreaterThan(0);
    expect(d.worstResidualRows.every(r => r.blockId !== '' && Number.isFinite(r.value))).toBe(true);
    expect(d.singularUnknowns?.map(s => s.variable)).toContain('ch_state_pressure');
    expect(Number.isFinite(d.time) && d.h > 0).toBe(true);
  });

  it('the default wall-clock budget is on (60 s) and a configured budget stops a long fine-step call', () => {
    expect((new VLabPhysicsEngine() as any).wallClockBudgetMs).toBe(60000);
    // RC (tau = 1 ms) forced to 1 ns steps over 10 ms = 1e7 steps: the 300 ms budget must end the call with the diagnostic
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 1, R_int: 0 }), node('r', 'resistor', { R: 1000 }), node('c', 'capacitor', { C: 1e-6 }), node('gnd', 'ground')],
      edges: [wire('vs.p', 'r.p'), wire('r.n', 'c.p'), wire('c.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const engine = new VLabPhysicsEngine(cfg({ minimumStep: 1e-9, maximumStep: 1e-9, initialStep: 1e-9 }));
    engine.setStepBudget({ wallClockMs: 300 });
    const t0 = Date.now();
    expect(() => engine.simulateStep(m.nodes, m.edges, null, 0.01)).toThrow(/wall-clock budget|total step attempts/);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

// ── F-050: no best-effort acceptance at the minimum step ────────────────────────────────────────────────────────────────
describe('F-050: non-convergence at the minimum step is reported, never accepted', () => {
  it('a Newton budget of one iteration on a switching (diode) network throws the structured solver diagnostic', () => {
    // half-wave rectifier R-C load: one Newton iteration never verifies convergence of its update, so no step can converge;
    // the engine used to accept the unconverged iterate at the minimum step
    const m: Model = {
      nodes: [node('src', 'ac_voltage', { amp: 10, freq: 50 }), node('d', 'diode'), node('r', 'resistor', { R: 100 }), node('c', 'capacitor', { C: 1e-4 }), node('gnd', 'ground')],
      edges: [wire('src.p', 'd.p'), wire('d.n', 'r.p'), wire('r.p', 'c.p'), wire('r.n', 'gnd.a'), wire('c.n', 'gnd.a'), wire('src.n', 'gnd.a')],
    };
    let caught: unknown;
    try {
      run(m, 20, 1e-3, cfg({ maximumIterations: 1, nonlinearTolerance: 1e-14, minimumStep: 1e-5 }));
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(VLabSolverDiagnosticError);
    const d = (caught as VLabSolverDiagnosticError).diagnostic;
    expect(d.h).toBeLessThanOrEqual(1e-5 * (1 + 1e-9));
    expect(d.worstResidualRows.length).toBeGreaterThan(0);
    expect(d.worstResidualRows[0].blockId).not.toBe('');
    expect(Math.abs(d.worstResidualRows[0].value)).toBeGreaterThan(1e-14);
  });
});

// ── F-103: every differentiated unknown is error-controlled ─────────────────────────────────────────────────────────────
describe('F-103: the LTE norm covers across / branch derivatives; the error converges with the tolerance', () => {
  // series RLC, DC step, overdamped: vC(t) = V [1 - (s2 e^(s1 t) - s1 e^(s2 t)) / (s2 - s1)], s1,2 = -a +- sqrt(a^2 - w0^2)
  const V = 24, R = 50, L = 1e-3, C = 1e-5;
  const rlc = (): Model => ({
    nodes: [node('dc', 'dc_voltage', { V, R_int: 0 }), node('res', 'resistor', { R }), node('ind', 'inductor', { L }), node('cap', 'capacitor', { C }), node('gnd', 'ground')],
    edges: [wire('dc.p', 'res.p'), wire('res.n', 'ind.p'), wire('ind.n', 'cap.p'), wire('cap.n', 'gnd.a'), wire('dc.n', 'gnd.a')],
  });
  const alpha = R / (2 * L), w0 = 1 / Math.sqrt(L * C), r = Math.sqrt(alpha * alpha - w0 * w0), s1 = -alpha + r, s2 = -alpha - r;
  const vRef = (t: number) => V * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1));
  const worst = (config: any) => {
    let e = 0;
    run(rlc(), 40, 1e-4, config, (s, t) => { e = Math.max(e, Math.abs(value(s, 'Across_cap_p_(electrical)') - vRef(t))); });
    return e;
  };

  it('unconfigured run at 100 us output steps (only across / branch unknowns carry the dynamics) stays within 1 %', () => {
    expect(worst(null)).toBeLessThan(0.01 * V);
  });

  it('the worst error decreases with the relative tolerance (1e-2 -> 1e-3 -> 1e-4)', () => {
    // minimumStep 1 ns: the tight tolerance needs sub-microsecond steps on the 21 us pole at the DC step (at 1 us the engine
    // now reports "cannot satisfy tolerances at minimumStep" instead of accepting the step)
    const e = [1e-2, 1e-3, 1e-4].map(rtol => worst(cfg({ relativeTolerance: rtol, absoluteTolerance: rtol * 1e-3, maximumStep: 1e-4, minimumStep: 1e-9 })));
    expect(e[1]).toBeLessThan(e[0]);
    expect(e[2]).toBeLessThan(e[1]);
    expect(e[2]).toBeLessThan(1e-3 * V);
  });
});

// ── F-084 / F-101: event location ───────────────────────────────────────────────────────────────────────────────────────
describe('F-084 / F-101: switching edges are located (not accepted up to minimumStep late) with the default minimum step', () => {
  // PWM comparator: switch closes while sin(2 pi fs t) > c, c = cos(pi D), i.e. on t in [t1, t2] + k Ts with
  // t1 = asin(c) / (2 pi fs), t2 = (pi - asin(c)) / (2 pi fs)  (exact duty D).
  const FS = 20e3, TS = 1 / FS;

  it('RC charged through the switch: the charge per period matches the exact switching instants to < 1e-6 s of timing error', () => {
    // V = 1, R = 1, C = 1 F: tau ~ 1 s >> Ts, so vC accumulates the on-time almost linearly; the closed form is piecewise exponential
    const D = 0.3, c0 = Math.cos(Math.PI * D), RON = 1e-3, ROFF = 1e6;
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 1, R_int: 0 }), node('car', 'ps_sine', { amp: 1, freq: FS }),
        node('sw', 'switch', { Ron: RON, Roff: ROFF, threshold: c0 }), node('r', 'resistor', { R: 1 }), node('c', 'capacitor', { C: 1 }), node('gnd', 'ground')],
      edges: [wire('car.y', 'sw.v'), wire('vs.p', 'sw.p'), wire('sw.n', 'r.p'), wire('r.n', 'c.p'), wire('c.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const periods = 20;
    // tight local-error tolerance with the DEFAULT minimum step (1 us): the integration error is negligible, what remains is
    // the event timing (an edge accepted up to minimumStep late would show as up to 40 us of accumulated timing error)
    const state = run(m, periods * 10, TS / 10, cfg({ relativeTolerance: 1e-6, absoluteTolerance: 1e-10, maximumStep: TS / 10 }));
    const t1 = Math.asin(c0) / (2 * Math.PI * FS), t2 = (Math.PI - Math.asin(c0)) / (2 * Math.PI * FS);
    const tauOn = (1 + RON) * 1, tauOff = (1 + ROFF) * 1;
    let v = 0;
    const relax = (vv: number, dur: number, tau: number) => 1 - (1 - vv) * Math.exp(-dur / tau);
    for (let k = 0; k < periods; k++) { v = relax(v, t1, tauOff); v = relax(v, t2 - t1, tauOn); v = relax(v, TS - t2, tauOff); }
    const vSim = value(state, 'Across_c_p_(electrical)');
    // equivalent accumulated timing error of all 2 * periods edges: dv / (dv/dt on - dv/dt off)
    const timing = Math.abs(vSim - v) / ((1 - v) / tauOn - (1 - v) / tauOff);
    expect(timing, `vC ${vSim} vs ${v}`).toBeLessThan(1e-6);
  });

  it('buck converter at 20 kHz with the default minimum step (1 us): mean Vo within 0.5 % of D Vin / (1 + R_on / R)', () => {
    const D = 0.5, L = 1e-4, C = 1e-4, RON = 1e-3, Vin = 24, R = 1;
    const Vo = (D * Vin) / (1 + RON / R); // R_on of switch and diode both in the inductor path for D and 1 - D
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: Vin, R_int: 0 }), node('gnd', 'ground'), node('car', 'ps_sine', { amp: 1, freq: FS }),
        node('sw', 'switch', { Ron: RON, Roff: 1e6, threshold: Math.cos(Math.PI * D) }), node('dio', 'diode', { Vf: 0, Ron: RON, Roff: 1e6 }),
        node('l', 'inductor', { L, i0: 0.97 * Vo / R }), node('c', 'capacitor', { C, v0: 0.97 * Vo }), node('rl', 'resistor', { R })],
      edges: [wire('car.y', 'sw.v'), wire('vs.n', 'gnd.a'), wire('c.n', 'gnd.a'), wire('rl.n', 'gnd.a'), wire('rl.p', 'c.p'),
        wire('vs.p', 'sw.p'), wire('sw.n', 'dio.n'), wire('dio.p', 'gnd.a'), wire('sw.n', 'l.p'), wire('l.n', 'rl.p')],
    };
    const periods = 80, window = 10, vo: number[] = [];
    run(m, periods * 10, TS / 10, cfg({ minimumStep: 1e-6, maximumStep: 1e-5 }), (s) => { vo.push(value(s, 'Across_c_p_(electrical)')); });
    const tail = vo.slice(-window * 10);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    expect(Math.abs(mean - Vo) / Vo, `mean Vo ${mean} vs ${Vo}`).toBeLessThan(0.005);
  }, 240000);
});

// ── F-051: singular Newton matrices are reported ────────────────────────────────────────────────────────────────────────
describe('F-051: singular factorization is a diagnostic, not a silent regularization', () => {
  it('an inconsistent rank-deficient system (no solution) throws SingularMatrixError naming the unknown', () => {
    let caught: unknown;
    try { SparseLinearSolver.solve([[1, 2], [2, 4]], [1, 3]); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(SingularMatrixError);
    expect((caught as SingularMatrixError).pivots.map(p => p.column)).toEqual([1]);
  });

  it('a consistent rank-deficient system returns a solution of A x = b and is counted (never a silent 1e-12 pivot)', () => {
    const before = SparseLinearSolver.singularSolveCount;
    const x = SparseLinearSolver.solve([[1, 2], [2, 4]], [1, 2]);
    expect(x[0] + 2 * x[1]).toBeCloseTo(1, 12);
    expect(SparseLinearSolver.singularSolveCount).toBe(before + 1);
  });

  it('badly scaled but regular rows/columns (F, Pa, Ohm units) are not mistaken for singular', () => {
    // [[1e-9, 1e-9], [1e9, 3e9]] x = [2e-9, 4e9]  ->  x = [1, 1]
    const x = SparseLinearSolver.solve([[1e-9, 1e-9], [1e9, 3e9]], [2e-9, 4e9]);
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(1, 12);
  });
});

// ── direct solve vs simulateStep ────────────────────────────────────────────────────────────────────────────────────────
describe('direct Newton solve of the assembled residual agrees with simulateStep (and with the circuit laws)', () => {
  const direct = (m: Model): { names: string[]; x: number[] } => {
    const system = new DAEAssembler().assemble(m.nodes, m.edges);
    const ctx: EquationContext = {
      dt: 1e-3, time: 1e-3, parameters: {}, prevStates: new Array(system.systemSize).fill(0), states: new Array(system.systemSize).fill(0),
      stateDerivatives: new Array(system.systemSize).fill(0),
    };
    const solver = new ImplicitSolver();
    solver.configure({ tolerance: 1e-12, maxIterations: 100 });
    const x = solver.solve((sx, sc) => system.residuals(sx, new Array(system.systemSize).fill(0), sc), new Array(system.systemSize).fill(0), ctx);
    return { names: system.variableNames, x };
  };

  it('resistive divider: V R2 / (R1 + R2) and I = V / (R1 + R2)', () => {
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V: 10, R_int: 0 }), node('r1', 'resistor', { R: 300 }), node('r2', 'resistor', { R: 700 }), node('gnd', 'ground')],
      edges: [wire('vs.p', 'r1.p'), wire('r1.n', 'r2.p'), wire('r2.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const d = direct(m);
    const s = run(m, 1, 1e-3);
    // some net between r1 and r2 sits at 10 * 700 / 1000 = 7 V
    expect(s.variableNames.some((n: string, i: number) => n.startsWith('Across_') && Math.abs(s.x[i] - 7) < 1e-9)).toBe(true);
    s.variableNames.forEach((n: string, i: number) => expect(s.x[i]).toBeCloseTo(d.x[d.names.indexOf(n)], 9));
    expect(Math.abs(value(s, 'r1_branch_current'))).toBeCloseTo(10 / 1000, 12);
  });

  it('diode clamp (piecewise-linear Vf / Ron diode): simulateStep equals the direct solve; I = (V - Vf) / (R + Ron)', () => {
    const Vf = 0.7, Ron = 0.01, R = 100, V = 5;
    const m: Model = {
      nodes: [node('vs', 'dc_voltage', { V, R_int: 0 }), node('r', 'resistor', { R }), node('d', 'diode', { Vf, Ron, Roff: 1e9 }), node('gnd', 'ground')],
      edges: [wire('vs.p', 'r.p'), wire('r.n', 'd.p'), wire('d.n', 'gnd.a'), wire('vs.n', 'gnd.a')],
    };
    const d = direct(m);
    const s = run(m, 1, 1e-3);
    // agreement to the engine's default Newton tolerance (1e-8 on the residual norm)
    s.variableNames.forEach((n: string, i: number) => expect(s.x[i]).toBeCloseTo(d.x[d.names.indexOf(n)], 7));
    expect(Math.abs(value(s, 'r_branch_current'))).toBeCloseTo((V - Vf) / (R + Ron), 6);
  });
});

// ── F-084: a step source edge inside an output step (integral of a piecewise-constant input) ────────────────────────────
describe('F-084: a step-source edge inside one output step is located (integrator of a step)', () => {
  it('integral of a step: y0 min(t,T) + y1 max(0, t - T) is exact across the edge (T not on the step grid)', () => {
    const T = 0.0337, y0 = 0.5, y1 = 2;
    const m: Model = { nodes: [node('st', 'ps_step', { time: T, initial: y0, final: y1 }), node('i', 'ps_integrator', { initial: 0 })], edges: [wire('st.y', 'i.u')] };
    run(m, 5, 0.01, null, (s, t) => {
      expect(value(s, 'i_state_y')).toBeCloseTo(y0 * Math.min(t, T) + y1 * Math.max(0, t - T), 6);
    });
  });
});

// ── F-043 / F-054 / F-070: kernel IR pipeline (unused by the app, kept honest) ──────────────────────────────────────────
describe('kernel IR pipeline: numeric parameters are never replaced by silent fallbacks', () => {
  const network: any = { id: 'n', domains: ['electrical'], componentIds: ['r1', 'c1', 'l1'], portIds: [], nodeIds: [], referenceNodeIds: [], connections: [], solverConfigurationId: 's', topologyHash: 'h' };
  const nodesOf = (rParams: any) => [
    { id: 'r1', data: { type: 'resistor', params: rParams } },
    { id: 'c1', data: { type: 'capacitor', params: { capacitance: 1e-6, v0: 3.3 } } },
    { id: 'l1', data: { type: 'inductor', params: { inductance: 1e-3, i0: -0.25 } } },
  ] as any;

  it('zero and negative values are kept, v0 / i0 become the initial values, a missing value is not 0', () => {
    const ir = new PhysicalSystemCompiler().compile(network, nodesOf({ resistance: 0, offset: -2, label: 'abc', empty: '' }));
    const val = (n: string) => ir.parameters.find(p => p.name === n)?.value;
    expect(val('resistance')).toBe(0);
    expect(val('offset')).toBe(-2);
    expect(ir.parameters.some(p => p.name === 'label' || p.name === 'empty')).toBe(false);
    expect(ir.states.find(s => s.name === 'V_c1')?.initialValue).toBe(3.3);
    expect(ir.states.find(s => s.name === 'I_l1')?.initialValue).toBe(-0.25);
  });

  it('a malformed numeric value throws; the RLC assembler uses R = 0 as given (series RLC: L di/dt = Vs - vC - R i)', () => {
    expect(() => new PhysicalSystemCompiler().compile(network, nodesOf({ resistance: Infinity }))).toThrow(/finite/);
    const R = 0, L = 2e-3, C = 1e-6, Vs = 5;
    const sys = new EquationAssembler().assembleRLC({ parameters: [{ name: 'resistance', value: R }, { name: 'inductance', value: L }, { name: 'capacitance', value: C }, { name: 'voltage', value: Vs }] } as any);
    const out = new Float64Array(2);
    sys.residual(0, Float64Array.of(1, 0.5), Float64Array.of(0, 0), new Float64Array(0), {} as any, out);
    expect(out[0]).toBeCloseTo(-0.5 / C, 6);
    expect(out[1]).toBeCloseTo(-(Vs - 1 - R * 0.5) / L, 6);
  });
});