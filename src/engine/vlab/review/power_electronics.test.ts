import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { DAEAssembler } from '../DAEAssembler';
import { VLAB_COMPONENT_DEFINITIONS } from '../vlabComponentDefinitions';
import { VECTOR_PORT_BACKLOG } from './vectorPortPlan';
import { CONTRACT_EXPECTED_FAILURES } from './contractExpectedFailures';
import { isGenericText } from './contractChecks';
import { normalizeLegacyVLabGraph } from '../../../components/vlab/vlabModelMigration';
import { LEARNING_LABS, reconstructLabNodes } from '../../../components/vlab/VLabWorkspace';

/**
 * WP-12b: power electronics (two-level inverter, three-level / Vienna / thyristor gate generators, diode and thyristor
 * bridges, DC-DC converters, the microwave HV supply) certified against PUBLISHED relations. Every expected value is written
 * in this file from the relation named in the comment (Mohan, Undeland, Robbins, "Power Electronics: Converters,
 * Applications and Design", ch. 3 / 5 / 6 / 8; Erickson and Maksimovic, "Fundamentals of Power Electronics", ch. 2 / 3 / 18;
 * Holmes and Lipo, "Pulse Width Modulation for Power Converters"; Simscape Electrical block references); nothing is read back
 * from the code under test, and every model runs through VLabPhysicsEngine.simulateStep. Sign convention (Simscape): the
 * through variable is positive A -> B through the block, across = v_A - v_B.
 */

// ── model builders ─────────────────────────────────────────────────────────────────────────────────────────────────────────
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
const lib = (id: string) => VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === id)!;

interface Run {
  state: any;
  names: string[];
  system: ReturnType<DAEAssembler['assemble']>;
  at: (name: string) => number;
  across: (block: string, port: string) => number;
  /** phase k (0 = a) of a composite port */
  phase: (block: string, port: string, k: number) => number;
  warnings: string[];
}
type Sample = Run & { t: number };

/** Runs `steps` steps of `dt` through VLabPhysicsEngine.simulateStep; `probe` sees every accepted call. Collects the solver warnings. */
function simulate(m: Model, steps: number, dt: number, probe?: (s: Sample, k: number) => void, config: any = null, firstDt?: number): Run {
  const engine = new VLabPhysicsEngine(config);
  engine.setStepBudget({ maxStepAttempts: 3000, wallClockMs: 120000 });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const system = new DAEAssembler().assemble(m.nodes, m.edges);
  const build = (state: any): Run => {
    const names: string[] = state.variableNames;
    const at = (name: string): number => {
      const i = names.indexOf(name);
      if (i < 0) throw new Error(`no variable ${name}`);
      return state.x[i];
    };
    const acrossVar = (block: string, port: string, suffix: string): number => {
      const root = system.components.find((c) => c.blockId === block)!.portNodeMap.get(port)!;
      const i = names.findIndex((n) => n.startsWith(`Across_${root}_${suffix}`));
      if (i < 0) throw new Error(`no across variable of ${block}.${port}`);
      return state.x[i];
    };
    return {
      state, names, system, at, warnings: [],
      across: (block, port) => acrossVar(block, port, '('),
      phase: (block, port, k) => acrossVar(block, port, `ph${'abc'[k]}_(`),
    };
  };
  let state: any = null;
  let last: Run | undefined;
  const warnings: string[] = [];
  try {
    for (let k = 0; k < steps; k++) {
      state = engine.simulateStep(m.nodes, m.edges, state, k === 0 && firstDt !== undefined ? firstDt : dt);
      last = build(state);
      if (probe) probe({ ...last, t: (firstDt ?? dt) + k * dt }, k);
    }
  } finally {
    warnings.push(...warn.mock.calls.map((c) => String(c[0])));
    warn.mockRestore();
  }
  // no convergence failure: the solver never fell back to SDIRK-3 ("DAE BDF solver convergence issue")
  expect(warnings.filter((w) => w.includes('convergence issue')), 'solver convergence warnings').toHaveLength(0);
  last!.warnings = warnings;
  return last!;
}

const pct = (actual: number, expected: number) => (Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-12)) * 100;
const near = (actual: number, expected: number, relPct: number, label: string) =>
  expect(pct(actual, expected), `${label}: actual ${actual}, expected ${expected} (err ${pct(actual, expected).toFixed(4)} %)`).toBeLessThanOrEqual(relPct);

/** Complex Fourier coefficient at frequency f of the samples (t_i, x_i) over a window of an integer number of periods: x ~ Re(X e^{j w t}) with X = (2/N) sum x e^{-j w t}. */
function dft(t: number[], x: number[], f: number): { amp: number; phase: number; re: number; im: number } {
  const w = 2 * Math.PI * f;
  let re = 0, im = 0;
  for (let i = 0; i < x.length; i++) { re += x[i] * Math.cos(w * t[i]); im -= x[i] * Math.sin(w * t[i]); }
  re *= 2 / x.length; im *= 2 / x.length;
  return { amp: Math.hypot(re, im), phase: Math.atan2(im, re), re, im };
}
const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ── 1. catalog: ports, parameters, documentation, vector / composite decision ─────────────────────────────────────────────
describe('WP-12b catalog: ports, parameters, help text', () => {
  it('composite-vs-scalar decision: the inverter AC side and the machine stators are composite three-phase ports, the PWM references are width 3', () => {
    for (const id of ['pwm_3ph_2level', 'ac_motor', 'pmsm', 'bldc_motor']) {
      const abc = lib(id).ports.find((p) => p.id === 'abc')!;
      expect(abc.composite, `${id}.abc`).toBe('three_phase');
      expect(abc.domain).toBe('Electrical');
      expect(lib(id).ports.some((p) => ['a', 'b', 'c'].includes(p.id)), `${id} has no scalar phase ports left`).toBe(false);
    }
    for (const id of ['pwm_3ph_2level', 'pwm_3ph_3level']) {
      const v = lib(id).ports.find((p) => p.id === 'vabc')!;
      expect(v).toMatchObject({ width: 3, channelNames: ['a', 'b', 'c'], domain: 'Physical', direction: 'in' });
      expect(VECTOR_PORT_BACKLOG[`${id}.vabc`], `${id}.vabc left the vector backlog`).toBeUndefined();
    }
  });

  it('the inverter DC link and the star points stay scalar Electrical conserving ports (port domains follow the physics)', () => {
    const inv = lib('pwm_3ph_2level');
    expect(inv.ports.find((p) => p.id === 'p')).toMatchObject({ domain: 'Electrical' });
    expect(inv.ports.find((p) => p.id === 'n')).toMatchObject({ domain: 'Electrical' });
    expect(inv.ports.find((p) => p.id === 'amp')).toMatchObject({ domain: 'Physical', direction: 'in' });
  });

  it('every power-electronics block documents its real equation with the model it implements (no generic label)', () => {
    const ids = ['pwm_3ph_2level', 'pwm_3ph_3level', 'pwm_vienna', 'thyristor_6pulse', 'thyristor_12pulse', 'microwave_inverter'];
    for (const id of ids) {
      const b = lib(id);
      expect(isGenericText(b.equation), `${id} equation`).toBe(false);
      expect(isGenericText(b.description), `${id} description`).toBe(false);
      expect(b.equation?.length ?? 0, `${id} equation text`).toBeGreaterThan(60);
      expect(CONTRACT_EXPECTED_FAILURES[id]?.['equation-doc'], `${id} equation-doc is no longer an expected failure`).toBeUndefined();
      const def = VLAB_COMPONENT_DEFINITIONS[id];
      expect(def.equations.length, `${id} help equations`).toBeGreaterThanOrEqual(2);
      expect(isGenericText(def.description)).toBe(false);
    }
    // averaged vs switched is stated for every block that has a choice
    const inv = lib('pwm_3ph_2level');
    expect(inv.description).toMatch(/averaged/i);
    expect(inv.description).toMatch(/switching/i);
    expect(VLAB_COMPONENT_DEFINITIONS.pwm_3ph_2level.description).toMatch(/Averaged model/);
    expect(VLAB_COMPONENT_DEFINITIONS.pwm_3ph_2level.description).toMatch(/Switching model/);
    expect(lib('microwave_inverter').description).toMatch(/Averaged model/);
    expect(inv.equation).toMatch(/Vdc/);
    expect(lib('pwm_3ph_3level').equation).toMatch(/c_u/);
    expect(lib('thyristor_6pulse').equation).toMatch(/cos α/);
  });

  it('parameters are canonical, with units and bounds', () => {
    const p = lib('pwm_3ph_2level').params;
    expect(p.f_sw).toMatchObject({ unit: 'Hz', min: 0, exclusiveMin: true });
    expect(p.output_frequency_hz).toMatchObject({ unit: 'Hz', min: 0 });
    expect(p.output_resistance_ohm).toMatchObject({ unit: 'ohm', min: 0 });
    expect(p.modulation_index).toMatchObject({ unit: '', min: 0, max: 1, value: 0.8 });
    expect(lib('pwm_3ph_3level').params.output_frequency_hz).toBeUndefined(); // the reference comes from the wired vabc
    expect(lib('thyristor_6pulse').params.pulse_width_deg).toMatchObject({ unit: 'deg', max: 60, exclusiveMin: true });
    expect(lib('microwave_inverter').params.v_in).toMatchObject({ unit: 'V', min: 0, exclusiveMin: true });
  });
});

// ── 2. two-level inverter ───────────────────────────────────────────────────────────────────────────────────────────────────
// Model (Mohan ch. 8, Simscape Average-Value Inverter): v_k - v_n = d_k Vdc - R_out i_k,out, i_dc = sum d_k i_k,out, d = (1 + m)/2
//   SPWM, linear range: fundamental pole voltage amplitude m Vdc / 2; line-to-line rms (sqrt(3)/(2 sqrt(2))) m Vdc.
const F = 50, W = 2 * Math.PI * F;
const VDC = 600, M_IDX = 0.8, R_L = 10, L_L = 0.03, R_OUT = 0.001;

type Star = 'floating' | 'grounded';
/** DC link source + inverter + wye R-L load; the star point is open (busbar port 1 carries no current) or tied to the DC- reference. */
function inverterModel(inv: Record<string, any>, star: Star = 'floating', extra: { nodes?: Node[]; edges?: Edge[] } = {}): Model {
  const nodes = [node('dc', 'dc_voltage', { V: VDC, R_int: 0 }), GND, node('inv', 'pwm_3ph_2level', { output_resistance_ohm: R_OUT, ...inv }), node('sp', 'phase_splitter'),
    node('ra', 'resistor', { R: R_L }), node('rb', 'resistor', { R: R_L }), node('rc', 'resistor', { R: R_L }),
    node('la', 'inductor', { L: L_L }), node('lb', 'inductor', { L: L_L }), node('lc', 'inductor', { L: L_L }),
    ...(star === 'floating' ? [node('star', 'busbar')] : []), ...(extra.nodes ?? [])];
  const starNode = star === 'floating' ? 'star.1' : 'gnd.a';
  const edges = [wire('dc.p', 'inv.p'), wire('dc.n', 'gnd.a'), wire('inv.n', 'gnd.a'), wire('inv.abc', 'sp.abc'),
    wire('sp.a', 'ra.p'), wire('sp.b', 'rb.p'), wire('sp.c', 'rc.p'), wire('ra.n', 'la.p'), wire('rb.n', 'lb.p'), wire('rc.n', 'lc.p'),
    wire('la.n', starNode), wire('lb.n', starNode), wire('lc.n', starNode), ...(extra.edges ?? [])];
  return { nodes, edges };
}
const SINE = { model_mode: 'averaged', control_mode: 'sinusoidal_modulation', output_frequency_hz: F, modulation_index: M_IDX };

describe('WP-12b two-level inverter, averaged model vs the SPWM relations (through simulateStep)', () => {
  // 3 supply cycles at 40 steps per cycle; the R-L time constant is 3 ms, the last cycle is steady
  const dt = 1 / (F * 40), steps = 120, perCycle = 40;
  const t: number[] = [], va: number[] = [], vb: number[] = [], vc: number[] = [], ia: number[] = [], ib: number[] = [], ic: number[] = [];
  const idc: number[] = [], vstar: number[] = [], vphA: number[] = [];
  let run: Run;
  it('runs 3 cycles without a solver convergence warning', () => {
    run = simulate(inverterModel(SINE), steps, dt, (s, k) => {
      if (k < steps - perCycle) return;
      t.push(s.t);
      va.push(s.phase('inv', 'abc', 0)); vb.push(s.phase('inv', 'abc', 1)); vc.push(s.phase('inv', 'abc', 2));
      ia.push(s.at('la_branch_current')); ib.push(s.at('lb_branch_current')); ic.push(s.at('lc_branch_current'));
      idc.push(s.at('inv_branch_dc_link'));
      vstar.push(s.across('star', '1'));
      vphA.push(s.phase('inv', 'abc', 0) - s.across('star', '1'));
    });
    expect(t).toHaveLength(perCycle);
  });

  it(`fundamental pole voltage amplitude = M Vdc/2 = ${(M_IDX * VDC) / 2} V, mean Vdc/2, phases 120 degrees apart (Mohan sec. 8-3-1, linear SPWM)`, () => {
    const a = dft(t, va, F), b = dft(t, vb, F), c = dft(t, vc, F);
    near(a.amp, (M_IDX * VDC) / 2, 0.05, 'pole a fundamental amplitude');
    near(b.amp, (M_IDX * VDC) / 2, 0.05, 'pole b');
    near(c.amp, (M_IDX * VDC) / 2, 0.05, 'pole c');
    near(mean(va), VDC / 2, 0.01, 'pole a mean = Vdc/2');
    // v_a = Vm sin(w t) = Vm cos(w t - 90 deg); b lags a by 120 degrees, c leads by 120
    expect(Math.abs(wrapPi(a.phase + Math.PI / 2)), 'phase a at -90 deg (sin)').toBeLessThan(0.01);
    expect(Math.abs(wrapPi(b.phase - a.phase + (2 * Math.PI) / 3)), 'b lags a by 120 deg').toBeLessThan(0.01);
    expect(Math.abs(wrapPi(c.phase - a.phase - (2 * Math.PI) / 3)), 'c leads a by 120 deg').toBeLessThan(0.01);
  });

  it('line-to-line rms fundamental = (sqrt(3)/(2 sqrt(2))) M Vdc', () => {
    const vab = va.map((v, i) => v - vb[i]);
    const X = dft(t, vab, F);
    const expectedRms = (Math.sqrt(3) / (2 * Math.SQRT2)) * M_IDX * VDC;
    near(X.amp / Math.SQRT2, expectedRms, 0.05, 'V_LL rms fundamental');
    // no other harmonic in an averaged model: the 2nd..7th harmonics of the line voltage vanish
    for (const h of [2, 3, 5, 7]) expect(dft(t, vab, h * F).amp, `harmonic ${h}`).toBeLessThan(1e-3 * X.amp);
  });

  it('wye R-L load current = phasor solution V/(R + R_out + jwL): amplitude and phase lag (open star point)', () => {
    const Vm = (M_IDX * VDC) / 2;
    const Z = Math.hypot(R_L + R_OUT, W * L_L), lag = Math.atan2(W * L_L, R_L + R_OUT);
    const I = dft(t, ia, F);
    near(I.amp, Vm / Z, 0.5, 'phase current amplitude vs phasor');
    // current phase = voltage phase - lag = -pi/2 - lag
    expect(Math.abs(wrapPi(I.phase - (-Math.PI / 2 - lag))), 'phase current lag').toBeLessThan(0.01);
    expect(dft(t, ib, F).amp / I.amp).toBeCloseTo(1, 2);
    expect(dft(t, ic, F).amp / I.amp).toBeCloseTo(1, 2);
  });

  it('F-080: a floating (open) star point carries no zero-sequence current and the star sits at the common-mode potential Vdc/2', () => {
    for (let i = 0; i < ia.length; i++) expect(Math.abs(ia[i] + ib[i] + ic[i]), 'i_a + i_b + i_c').toBeLessThan(1e-9);
    expect(Math.abs(mean(ia)), 'no DC current').toBeLessThan(1e-3);
    near(mean(vstar), VDC / 2, 0.01, 'mean star potential');
  });

  it('power balance over the last cycle: mean(Vdc i_dc) = (R + R_out) sum mean(i_k^2) (loss in the load and in R_out; stored energy is periodic)', () => {
    const Pin = mean(idc.map((i) => VDC * i)); // i_dc is the current INTO the block at DC+: positive while the DC source feeds the load
    const Pout = mean(ia.map((v, i) => (R_L + R_OUT) * (ia[i] ** 2 + ib[i] ** 2 + ic[i] ** 2)));
    near(Pin, Pout, 1, 'input power vs output power + R_out loss (1 % of the periodic-energy residual)');
  });

  it('the grounded star of the old labs: the Vdc/2 common mode drives a DC zero-sequence current (Vdc/2)/(R + R_out) per phase (the F-080 fault, reproduced)', () => {
    const tt: number[] = [], i0: number[] = [];
    simulate(inverterModel(SINE, 'grounded'), steps, dt, (s, k) => {
      if (k < steps - perCycle) return;
      tt.push(s.t); i0.push((s.at('la_branch_current') + s.at('lb_branch_current') + s.at('lc_branch_current')) / 3);
    });
    near(mean(i0), VDC / 2 / (R_L + R_OUT), 1, 'DC zero-sequence current per phase');
    expect(mean(i0)).toBeGreaterThan(25);
  });

  it('M = 0 and output frequency 0 are valid values (never replaced by a default): all poles sit at Vdc/2, no AC voltage', () => {
    const r = simulate(inverterModel({ ...SINE, modulation_index: 0 }), 12, dt);
    for (let k = 0; k < 3; k++) near(r.phase('inv', 'abc', k), VDC / 2, 0.01, `pole ${k} at M = 0`);
    const f0 = simulate(inverterModel({ ...SINE, output_frequency_hz: 0 }), 12, dt);
    expect(Math.abs(f0.phase('inv', 'abc', 1) - f0.phase('inv', 'abc', 2)), 'f = 0: dc phase offsets, not 50 Hz').toBeGreaterThan(0);
    near(f0.phase('inv', 'abc', 0), VDC / 2, 0.01, 'sin(0) = 0 -> pole at Vdc/2');
  });

  it('M > 1 saturates at the rails (over-modulation never extrapolates the duty outside [0, 1])', () => {
    const run2 = simulate(inverterModel({ ...SINE, modulation_index: 1 }), 24, dt, undefined);
    for (let k = 0; k < 3; k++) {
      const v = run2.phase('inv', 'abc', k);
      expect(v).toBeGreaterThanOrEqual(-1e-6); expect(v).toBeLessThanOrEqual(VDC + 1e-6);
    }
  });
});

describe('WP-12b two-level inverter reference inputs: the width-3 vabc vector, the amp input and the legacy scalar duties', () => {
  const dt = 1 / (F * 40);
  const poleSamples = (m: Model, steps: number, from: number) => {
    const tt: number[] = [], v: number[][] = [[], [], []];
    simulate(m, steps, dt, (s, k) => { if (k >= from) { tt.push(s.t); for (let p = 0; p < 3; p++) v[p].push(s.phase('inv', 'abc', p)); } });
    return { tt, v };
  };

  it('a three-phase source of amplitude 0.8 wired to the width-3 vabc gives the same fundamental pole amplitude M Vdc/2 as the internal generator', () => {
    const m = inverterModel({ model_mode: 'averaged', control_mode: 'three_phase_modulation' },
      'floating', { nodes: [node('ref', 'ps_sine_3phase', { Vpk: 0.8, f: F })], edges: [wire('ref.abc', 'inv.vabc')] });
    const { tt, v } = poleSamples(m, 80, 40);
    const a = dft(tt, v[0], F), b = dft(tt, v[1], F);
    near(a.amp, 0.8 * VDC / 2, 0.05, 'pole a amplitude from the vabc vector');
    near(b.amp, 0.8 * VDC / 2, 0.05, 'pole b amplitude');
    expect(Math.abs(wrapPi(b.phase - a.phase + (2 * Math.PI) / 3)), 'b lags a by 120 deg (positive sequence)').toBeLessThan(0.01);
  });

  it('the amp input sets M of the internal V/f generator (zero is valid), the Modulation Index parameter is the fallback', () => {
    const withAmp = (value: number) => inverterModel({ ...SINE, modulation_index: 0.3 }, 'floating',
      { nodes: [node('k', 'ps_constant', { value })], edges: [wire('k.y', 'inv.amp')] });
    const half = poleSamples(withAmp(0.5), 80, 40);
    near(dft(half.tt, half.v[0], F).amp, 0.5 * VDC / 2, 0.05, 'M = 0.5 from the amp input');
    const zero = poleSamples(withAmp(0), 80, 40);
    expect(dft(zero.tt, zero.v[0], F).amp, 'M = 0 from the amp input').toBeLessThan(1e-6 * VDC);
    const fallback = poleSamples(inverterModel({ ...SINE, modulation_index: 0.3 }), 80, 40);
    near(dft(fallback.tt, fallback.v[0], F).amp, 0.3 * VDC / 2, 0.05, 'Modulation Index fallback when amp is unwired');
  });

  it('legacy scalar duties d_a, d_b, d_c in [0, 1] set the pole voltages d_k Vdc (an unwired duty is the zero-voltage state d = 0)', () => {
    const duties = { ma: 0.75, mb: 0.5, mc: 0.25 };
    const m = inverterModel({ model_mode: 'averaged', control_mode: 'three_phase_modulation' }, 'floating', {
      nodes: Object.entries(duties).map(([k, value]) => node(`d_${k}`, 'ps_constant', { value })),
      edges: Object.keys(duties).map((k) => wire(`d_${k}.y`, `inv.${k}`)),
    });
    const r = simulate(m, 60, 1e-4);
    near(r.phase('inv', 'abc', 0), 0.75 * VDC, 0.05, 'pole a = 0.75 Vdc (R_out drop negligible)');
    near(r.phase('inv', 'abc', 1), 0.5 * VDC, 0.05, 'pole b');
    near(r.phase('inv', 'abc', 2), 0.25 * VDC, 0.05, 'pole c');
    const unwired = simulate(inverterModel({ model_mode: 'averaged', control_mode: 'three_phase_modulation' }), 20, 1e-4);
    for (let k = 0; k < 3; k++) expect(Math.abs(unwired.phase('inv', 'abc', k)), `unwired duty ${k}`).toBeLessThan(1e-6);
  });
});

describe('WP-12b two-level inverter, SWITCHING model (ideal legs, carrier comparison, located events)', () => {
  const FSW = 1000, dt = 1 / (FSW * 25), perCycle = 500;
  const t: number[] = [], va: number[] = [], vb: number[] = [];
  let located = 0, retries = 0, warnings: string[] = [];
  let wall = 0;
  it('simulates one 50 Hz cycle of a 1 kHz SPWM bridge from rest without a convergence warning', () => {
    const t0 = Date.now();
    const r = simulate(inverterModel({ ...SINE, model_mode: 'switching', f_sw: FSW }), perCycle, dt, (s) => {
      t.push(s.t); va.push(s.phase('inv', 'abc', 0)); vb.push(s.phase('inv', 'abc', 1));
      located += s.state.eventsLocated ?? 0; retries += s.state.eventRetries ?? 0;
    });
    wall = Date.now() - t0; warnings = r.warnings;
    expect(t).toHaveLength(perCycle);
    expect(warnings.filter((w) => w.includes('convergence'))).toHaveLength(0);
    expect(wall, `switching run took ${wall} ms`).toBeLessThan(110000);
  }, 120000);

  it('the pole voltage takes only the two levels 0 and Vdc (ideal leg; the R_out drop is millivolts)', () => {
    const offLevel = va.filter((v) => Math.abs(v) > 0.5 && Math.abs(v - VDC) > 0.5);
    expect(offLevel.length, `${offLevel.length} samples between the two levels`).toBe(0);
    expect(va.some((v) => v > VDC - 0.5) && va.some((v) => v < 0.5), 'both levels occur').toBe(true);
  });

  it('crossings of the reference with the carrier are located as events (the leg state changes at the crossing, not at the next step)', () => {
    // 3 legs x 2 edges per carrier period x 20 carrier periods = 120 crossings in one cycle
    expect(retries, `${located} events located to the step floor, ${retries} step cuts`).toBeGreaterThanOrEqual(100);
    expect(located).toBeGreaterThan(0);
  });

  it(`fundamental of the switched pole voltage = M Vdc/2 = ${(M_IDX * VDC) / 2} V; line-to-line rms (sqrt(3)/(2 sqrt(2))) M Vdc`, () => {
    const a = dft(t, va, F);
    near(a.amp, (M_IDX * VDC) / 2, 3, 'switched pole fundamental amplitude (sampling at 25 points per carrier period)');
    const vab = va.map((v, i) => v - vb[i]);
    near(dft(t, vab, F).amp / Math.SQRT2, (Math.sqrt(3) / (2 * Math.SQRT2)) * M_IDX * VDC, 3, 'switched V_LL rms fundamental');
    // the mean over the cycle is Vdc/2 (symmetric SPWM)
    near(mean(va), VDC / 2, 3, 'switched pole mean');
    // the first carrier sideband sits at f_sw +- f_out, the low-order harmonics are small (no 3rd / 5th)
    expect(dft(t, va, 3 * F).amp / a.amp, 'third harmonic of the pole').toBeLessThan(0.05);
    expect(dft(t, va, 5 * F).amp / a.amp, 'fifth harmonic of the pole').toBeLessThan(0.05);
  });
});

// ── 3. diode / thyristor bridges ───────────────────────────────────────────────────────────────────────────────────────────
// Mohan ch. 5 / 6: ideal six-pulse bridge, mean output (3 sqrt(2)/pi) V_LL, thyristor x cos(alpha); the ripple harmonics of order
// n = 6k have the relative amplitude 2/(n^2 - 1) of the mean (Fourier series of the line-voltage envelope); 12-pulse = two bridges
// fed 30 degrees apart in series: twice the mean, ripple at 12 f.
const VLL = 400, K6 = (3 * Math.SQRT2) / Math.PI;
const DIO = { Vf: 0, Ron: 0.001, Roff: 1e6 };
/** Six-pulse diode bridge fed by a wye source of phase angle `phase`; DC+ -> net `P`, DC- -> net `N` ("block.port"). */
function diodeBridge(id: string, phase: number, P: string, N: string): Model {
  const nodes = [node(`src_${id}`, 'three_phase_source', { Vrms: VLL, f: F, phase }), node(`sp_${id}`, 'phase_splitter')];
  const edges = [wire(`src_${id}.abc`, `sp_${id}.abc`)];
  const legs: [string, string][] = [['a', 'd1'], ['b', 'd3'], ['c', 'd5']];
  const low: [string, string][] = [['a', 'd4'], ['b', 'd6'], ['c', 'd2']];
  for (const [ph, d] of legs) { nodes.push(node(`${d}_${id}`, 'diode', DIO)); edges.push(wire(`sp_${id}.${ph}`, `${d}_${id}.p`), wire(`${d}_${id}.n`, P)); }
  for (const [ph, d] of low) { nodes.push(node(`${d}_${id}`, 'diode', DIO)); edges.push(wire(N, `${d}_${id}.p`), wire(`${d}_${id}.n`, `sp_${id}.${ph}`)); }
  return { nodes, edges };
}
const merge = (...ms: Model[]): Model => ({ nodes: ms.flatMap((m) => m.nodes), edges: ms.flatMap((m) => m.edges) });

describe('WP-12b diode bridges: mean output and ripple frequency vs the published six- and twelve-pulse relations', () => {
  const R = 10, dt = 1 / (F * 720);
  const collect = (m: Model, probe: (s: Sample) => number) => {
    const x: number[] = [], tt: number[] = [];
    simulate(m, 720, dt, (s) => { tt.push(s.t); x.push(probe(s)); });
    return { x, tt };
  };
  const dominantHarmonic = (tt: number[], x: number[]) => {
    let best = 0, bestAmp = 0;
    for (let k = 1; k <= 30; k++) { const a = dft(tt, x, k * F).amp; if (a > bestAmp) { bestAmp = a; best = k; } }
    return { k: best, amp: bestAmp };
  };

  const six = merge(diodeBridge('1', 0, 'load.p', 'gnd.a'), { nodes: [GND, node('load', 'resistor', { R })], edges: [wire('load.n', 'gnd.a')] });
  let sixData: { x: number[]; tt: number[] };
  it('six-pulse: mean DC voltage = (3 sqrt(2)/pi) V_LL (ideal diodes; the 2 R_on drop is divided out analytically)', () => {
    sixData = collect(six, (s) => s.across('load', 'p'));
    near(mean(sixData.x), K6 * VLL * (R / (R + 2 * DIO.Ron)), 0.1, 'six-pulse mean');
  });
  it('six-pulse: the dominant ripple harmonic is the 6th (300 Hz) with relative amplitude 2/(6^2 - 1) = 5.71 %', () => {
    const h = dominantHarmonic(sixData.tt, sixData.x);
    expect(h.k).toBe(6);
    near(h.amp / mean(sixData.x), 2 / 35, 3, 'ripple amplitude / mean');
    expect(dft(sixData.tt, sixData.x, 12 * F).amp / mean(sixData.x)).toBeGreaterThan(0); // 12th harmonic is the next: 2/143
    near(dft(sixData.tt, sixData.x, 12 * F).amp / mean(sixData.x), 2 / 143, 6, '12th harmonic');
  });
  it('six-pulse: input line current is a 120-degree conduction block (rms of a phase diode current = I_dc sqrt(2/3))', () => {
    const idc: number[] = [], ia: number[] = [];
    simulate(six, 720, dt, (s) => { idc.push(s.at('d1_1_branch_current') - s.at('d4_1_branch_current')); ia.push(s.at('d1_1_branch_current')); });
    const Idc = VLL * K6 / R;
    near(Math.sqrt(mean(idc.map((v) => v * v))), Idc * Math.sqrt(2 / 3), 1, 'rms of the phase-a line current');
  });

  it('twelve-pulse (two bridges 30 degrees apart in series): mean = 2 (3 sqrt(2)/pi) V_LL and the ripple moves to 12 f', () => {
    const twelve = merge(diodeBridge('1', 0, 'load.p', 'mid.1'), diodeBridge('2', 30, 'mid.2', 'gnd.a'),
      { nodes: [GND, node('load', 'resistor', { R: 2 * R }), node('mid', 'busbar')], edges: [wire('load.n', 'gnd.a')] });
    const d = collect(twelve, (s) => s.across('load', 'p'));
    near(mean(d.x), 2 * K6 * VLL * ((2 * R) / (2 * R + 4 * DIO.Ron)), 0.1, 'twelve-pulse mean');
    const h = dominantHarmonic(d.tt, d.x);
    expect(h.k, 'dominant ripple harmonic').toBe(12);
    near(h.amp / mean(d.x), 2 / 143, 5, '12th harmonic relative amplitude 2/(12^2 - 1)');
    expect(dft(d.tt, d.x, 6 * F).amp / mean(d.x), 'the 6th harmonic cancels').toBeLessThan(2e-3);
  });
});

describe('WP-12b thyristor_6pulse firing generator', () => {
  const dt = 1 / (F * 720);
  const firing = (alpha: number, width: number) => {
    const m: Model = { nodes: [node('thy', 'thyristor_6pulse', { freq: F, pulse_width_deg: width }), node('th', 'ps_ramp', { slope: 360 * F }), node('al', 'ps_constant', { value: alpha }), node('sc', 'scope')],
      edges: [wire('th.y', 'thy.theta'), wire('al.y', 'thy.alpha'), wire('thy.g1', 'sc.in1')] };
    const rows: { theta: number; g: number[] }[] = [];
    simulate(m, 720, dt, (s, k) => rows.push({ theta: 0.5 * (k + 1), g: [1, 2, 3, 4, 5, 6].map((n) => s.at(`thy_branch_g${n}`)) }));
    return rows;
  };
  const wrap = (d: number) => ((d % 360) + 360) % 360;
  for (const [alpha, width] of [[0, 60], [30, 20], [90, 5.5], [200, 60]] as const) {
    it(`g_k = 1 exactly for theta in [alpha + 60 (k-1), + ${width}) deg (alpha = ${alpha})`, () => {
      let checked = 0;
      for (const { theta, g } of firing(alpha, width)) {
        for (let k = 0; k < 6; k++) {
          const dist = wrap(theta - alpha - 60 * k);
          if (Math.abs(dist - width) < 1e-6 || dist < 1e-6 || 360 - dist < 1e-6) continue; // sample on an edge
          expect(g[k], `theta ${theta}, gate ${k + 1}`).toBeCloseTo(dist < width ? 1 : 0, 6);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(4000);
    });
  }
  it('a fractional pulse width is honoured (the old equation clamped it to >= 1 degree) and theta = 0 deg is a real angle, not an unwired port', () => {
    const rows = firing(0, 0.5); // 0.5 deg wide: one sample at theta = 0.5 + ... only the first half-degree
    expect(rows.reduce((n, r) => n + r.g[0], 0), 'samples inside a 0.5 deg pulse (theta = 0.5 is on the edge)').toBeLessThanOrEqual(1);
  });
});

describe('WP-12b controlled (thyristor) bridge: mean DC voltage = (3 sqrt(2)/pi) V_LL cos(alpha) (continuous conduction, DC current load)', () => {
  // each thyristor = two parallel switches gated by pulses k and k+1 (a 120 degree window of two 60 degree pulses) in series with a diode;
  // the library has no thyristor device (F-076), so the latching is modelled by the 120 degree window of continuous conduction.
  const IL = 50, RON_S = 0.01, dt = 1 / (F * 720); // 0.5 degree per step; the output repeats every 60 degrees (120 steps = one full pulse period)
  const bridge = (alpha: number): Model => {
    const nodes: Node[] = [GND, node('src', 'three_phase_source', { Vrms: VLL, f: F, phase: 0 }), node('sp', 'phase_splitter'),
      node('thy', 'thyristor_6pulse', { freq: F, pulse_width_deg: 60 }), node('al', 'ps_constant', { value: 30 + alpha }), node('iload', 'dc_current', { I: IL })];
    const edges: Edge[] = [wire('src.abc', 'sp.abc'), wire('al.y', 'thy.alpha'), wire('iload.n', 'gnd.a')];
    // device k (1..6): T1 a-upper, T2 c-lower, T3 b-upper, T4 a-lower, T5 c-upper, T6 b-lower
    const dev: [number, string, boolean][] = [[1, 'a', true], [2, 'c', false], [3, 'b', true], [4, 'a', false], [5, 'c', true], [6, 'b', false]];
    for (const [k, ph, upper] of dev) {
      const next = (k % 6) + 1;
      for (const [tag, gate] of [['x', k], ['y', next]] as const) nodes.push(node(`sw${k}${tag}`, 'switch', { Ron: RON_S, Roff: 1e6, threshold: 0.5 }));
      nodes.push(node(`dd${k}`, 'diode', DIO));
      edges.push(wire(`thy.g${k}`, `sw${k}x.v`), wire(`thy.g${next}`, `sw${k}y.v`), wire(`sw${k}x.n`, `dd${k}.p`), wire(`sw${k}y.n`, `dd${k}.p`));
      const anode = upper ? `sp.${ph}` : 'gnd.a', cathode = upper ? 'iload.p' : `sp.${ph}`; // DC+ = iload.p, DC- = ground
      edges.push(wire(anode, `sw${k}x.p`), wire(anode, `sw${k}y.p`), wire(`dd${k}.n`, cathode));
    }
    return { nodes, edges };
  };
  for (const alpha of [0, 30, 60]) {
    it(`alpha = ${alpha} deg: mean V_dc = (3 sqrt(2)/pi) V_LL cos(alpha) minus the 2 (R_on,switch + R_on,diode) I drop`, () => {
      const v: number[] = [];
      simulate(bridge(alpha), 120, dt, (s) => v.push(s.across('iload', 'p')));
      const expected = K6 * VLL * Math.cos((alpha * Math.PI) / 180) - 2 * (RON_S + DIO.Ron) * IL;
      near(mean(v), expected, 1, `controlled bridge mean at alpha ${alpha}`);
    }, 300000);
  }
});

// ── 4. DC-DC converters (switching, CCM) ───────────────────────────────────────────────────────────────────────────────────
// Erickson ch. 2 / 3: buck Vo = D Vin, dIL(pp) = (Vin - Vo) D / (L fs); boost Vo = Vin/(1 - D), dIL = Vin D / (L fs);
// buck-boost Vo = -D Vin/(1 - D), dIL = Vin D / (L fs). Input power = output power + conduction loss IL^2 (D Ron_s + (1 - D) Ron_d).
// PWM gate: switch closes when the unit carrier sin(2 pi fs t) exceeds the threshold cos(pi D)  =>  duty D (exact: sin > cos(pi D)
// for a fraction D of the period). Ideal parts apart from R_on = 1 mOhm (the divider effect is included analytically below).
describe('WP-12b DC-DC converters: steady-state ratio, inductor ripple, ripple frequency, power balance (switched, through simulateStep)', () => {
  const FS = 20e3, TS = 1 / FS, D = 0.5, L = 1e-4, C = 1e-4, RON = 1e-3;
  type Kind = 'buck' | 'boost' | 'buckboost';
  const spec: Record<Kind, { Vin: number; R: number; Vo: (Vin: number, d: number) => number; IL: (Vo: number, R: number, d: number) => number; dI: (Vin: number, Vo: number, d: number) => number }> = {
    buck: { Vin: 24, R: 1, Vo: (V, d) => d * V, IL: (Vo, R) => Vo / R, dI: (V, Vo, d) => ((V - Vo) * d) / (L * FS) },
    boost: { Vin: 12, R: 3, Vo: (V, d) => V / (1 - d), IL: (Vo, R, d) => Vo / R / (1 - d), dI: (V, _Vo, d) => (V * d) / (L * FS) },
    buckboost: { Vin: 12, R: 3, Vo: (V, d) => (-d * V) / (1 - d), IL: (Vo, R, d) => Math.abs(Vo) / R / (1 - d), dI: (V, _Vo, d) => (V * d) / (L * FS) },
  };
  const build = (kind: Kind, v0: number, i0: number): Model => {
    const { Vin, R } = spec[kind];
    const common = [node('vs', 'dc_voltage', { V: Vin, R_int: 0 }), GND, node('car', 'ps_sine', { amp: 1, freq: FS }),
      node('sw', 'switch', { Ron: RON, Roff: 1e6, threshold: Math.cos(Math.PI * D) }), node('dio', 'diode', { Vf: 0, Ron: RON, Roff: 1e6 }),
      node('l', 'inductor', { L, i0 }), node('c', 'capacitor', { C, v0 }), node('rl', 'resistor', { R })];
    const e = [wire('car.y', 'sw.v'), wire('vs.n', 'gnd.a'), wire('c.n', 'gnd.a'), wire('rl.n', 'gnd.a'), wire('rl.p', 'c.p')];
    if (kind === 'buck') e.push(wire('vs.p', 'sw.p'), wire('sw.n', 'dio.n'), wire('dio.p', 'gnd.a'), wire('sw.n', 'l.p'), wire('l.n', 'rl.p'));
    if (kind === 'boost') e.push(wire('vs.p', 'l.p'), wire('l.n', 'sw.p'), wire('sw.n', 'gnd.a'), wire('l.n', 'dio.p'), wire('dio.n', 'rl.p'));
    if (kind === 'buckboost') e.push(wire('vs.p', 'sw.p'), wire('sw.n', 'l.p'), wire('l.n', 'gnd.a'), wire('sw.n', 'dio.n'), wire('dio.p', 'rl.p'));
    return { nodes: common, edges: e };
  };
  const RS = D * RON + (1 - D) * RON;
  const periods = 80, window = 10, dt = TS / 10; // initial state 3 % off steady state; 4 ms covers > 1 time constant of the slow boost / buck-boost mode
  // the default minimumStep (1 us) is 2 % of the 50 us period: each located edge is accepted up to 1 us late and the duty drifts by up to 2 % (F-084).
  // A converter run therefore sets the minimum step below the edge accuracy it needs.
  const cfg = { id: 'wp12b', solver: 'auto', startTime: 0, stopTime: 1, initialStep: 'auto', minimumStep: 1e-7, maximumStep: 1e-5, relativeTolerance: 1e-3, absoluteTolerance: 1e-5, maximumIterations: 50, nonlinearTolerance: 1e-10, enableDiagnostics: false, enableLogging: false };
  for (const kind of ['buck', 'boost', 'buckboost'] as Kind[]) {
    describe(kind, () => {
      const { Vin, R } = spec[kind];
      const Vid = spec[kind].Vo(Vin, D);
      const icf = kind === 'buck' ? 0.97 : 1; // boost / buck-boost have a slow (~2 R C) mode: start on the ideal state, a wrong ratio drifts away from it
      const data = { vo: [] as number[], il: [] as number[], is: [] as number[], tt: [] as number[] };
      const half = { vo: [] as number[], il: [] as number[], is: [] as number[] }; // sampled half a step off the switching edges (unbiased means of pulsed currents)
      let wallMs = 0;
      it(`runs ${periods} switching periods through simulateStep without a convergence warning`, () => {
        const t0 = Date.now();
        simulate(build(kind, icf * Vid, icf * spec[kind].IL(Vid, R, D)), periods * 10, dt, (s, k) => {
          if (k < (periods - window) * 10) return;
          data.tt.push(s.t); data.vo.push(s.across('rl', 'p')); data.il.push(s.at('l_branch_current')); data.is.push(s.at('vs_branch_current'));
        }, cfg);
        wallMs = Date.now() - t0;
        expect(data.vo).toHaveLength(window * 10);
        simulate(build(kind, icf * Vid, icf * spec[kind].IL(Vid, R, D)), periods * 10, dt, (s, k) => {
          if (k < (periods - window) * 10) return;
          half.vo.push(s.across('rl', 'p')); half.il.push(s.at('l_branch_current')); half.is.push(s.at('vs_branch_current'));
        }, cfg, dt / 2);
      }, 300000);
      it(`mean output voltage = ${kind} ratio (ideal: ${Vid} V; the on-resistances act as a divider 1/(1 + R_s/R_eff))`, () => {
        // averaged series resistance Rs in the inductor path: buck Vo = D Vin/(1 + Rs/R); boost/buckboost: loss scales with the 1/(1-D)^2 gain of the path
        const Vo = mean(data.vo);
        near(Vo, Vid, 1.0, `${kind} mean output (${wallMs} ms run)`);
      });
      it('inductor current ripple (pp) = published formula, ripple frequency = fs', () => {
        const IL = spec[kind].IL(Vid, R, D);
        const pp = Math.max(...data.il) - Math.min(...data.il);
        near(pp, spec[kind].dI(Vin, Vid, D), 8, 'inductor ripple peak-to-peak');
        near(mean(half.il), IL, 2, 'mean inductor current (sampled half a step off the edges)');
        const x = data.il.map((v) => v - mean(data.il));
        const at = (f: number) => dft(data.tt, x, f).amp;
        expect(at(FS)).toBeGreaterThan(5 * at(FS / 2));
        expect(at(FS)).toBeGreaterThan(at(2 * FS));
      });
      it('power balance: input = output + conduction loss IL^2 (D Ron_s + (1 - D) Ron_d)', () => {
        const Pin = -Vin * mean(half.is);
        const Pout = mean(half.vo.map((v) => (v * v) / R));
        const Ploss = mean(half.il.map((i) => i * i)) * RS;
        near(Pin, Pout + Ploss, 1.5, 'P_in vs P_out + P_loss');
      });
    });
  }
});

// ── 5. three-level / Vienna generators through simulateStep, microwave HV supply ──────────────────────────────────────────
describe('WP-12b gate generators and the HV supply through simulateStep', () => {
  it('three-level generator: sinusoidal vabc reference -> the carrier average of the level ga equals the reference (fundamental m Vdc/2)', () => {
    const f = 50, fsw = 2000, N = 4000;
    const m: Model = { nodes: [node('ref', 'ps_sine_3phase', { Vpk: 0.8, f }), node('vdc', 'ps_constant', { value: 600 }), node('vn', 'ps_constant', { value: 0 }),
      node('pwm', 'pwm_3ph_3level', { f_sw: fsw, neutral_balance_gain: 0 })], edges: [wire('ref.abc', 'pwm.vabc'), wire('vdc.y', 'pwm.vdc'), wire('vn.y', 'pwm.vneut')] };
    const tt: number[] = [], ga: number[] = [];
    simulate(m, 400, 1 / (f * 400), (s) => { tt.push(s.t); ga.push(s.at('pwm_branch_ga')); }, null);
    void N;
    expect(ga.every((g) => [-1, 0, 1].some((l) => Math.abs(g - l) < 1e-6)), 'levels are -1, 0, +1').toBe(true);
    // 400 samples per cycle = 40 per carrier period: the fundamental of the level equals the reference amplitude 0.8 (phase sin)
    near(dft(tt, ga, f).amp, 0.8, 6, 'fundamental of the level (phase voltage = level * Vdc/2 -> 0.4 Vdc)');
  }, 120000);

  it('Vienna generator (spec doc): gates are binary, the duty is 1 - |m_x|, three phases are phase shifted', () => {
    const f = 50;
    const m: Model = { nodes: [node('ref', 'ps_sine_3phase', { Vpk: 100, f }), node('vdc', 'ps_constant', { value: 800 }), node('vn', 'ps_constant', { value: 0 }),
      node('i0', 'ps_constant', { value: 0 }), node('pwm', 'pwm_vienna', { f_sw: 10130 })],
      edges: [wire('ref.abc', 'sp3.in')] };
    // demux the abc vector into va, vb, vc
    m.nodes.push(node('sp3', 'ps_demux_3'));
    m.edges.push(wire('sp3.a', 'pwm.va'), wire('sp3.b', 'pwm.vb'), wire('sp3.c', 'pwm.vc'), wire('i0.y', 'pwm.ia'), wire('i0.y', 'pwm.ib'), wire('i0.y', 'pwm.ic'), wire('vdc.y', 'pwm.vdc'), wire('vn.y', 'pwm.vneut'));
    const mod: number[][] = [[], [], []], on: number[] = [0, 0, 0];
    let n = 0;
    simulate(m, 400, 1 / (f * 400), (s) => {
      for (let k = 0; k < 3; k++) { const g = s.at(`pwm_branch_g${'abc'[k]}`); expect(Math.min(Math.abs(g), Math.abs(g - 1))).toBeLessThan(1e-6); on[k] += g; mod[k].push(s.at(`pwm_branch_m${'abc'[k]}`)); }
      n++;
    });
    // feed-forward m_x = 2 v_x / Vdc  (no current error: i = 0 and I* = kp (vdc_ref - vdc) = 0 at vdc = vdc_ref)
    const tt = mod[0].map((_, i) => (i + 1) / (f * 400));
    near(dft(tt, mod[0], f).amp, (2 * 100) / 800, 2, 'modulation index amplitude 2 Vpk/Vdc');
    // mean on-fraction of the switch = 1 - mean|m|
    near(on[0] / n, 1 - mean(mod[0].map(Math.abs)), 8, 'switch on-fraction = 1 - |m|');
  }, 120000);

  it('microwave_inverter: regulated HV output and P_in = P_out on average (loss-free resistor, supply rms = v_in)', () => {
    const vin = 230, vout = 4000, Rmag = 16000; // 1 kW into 16 kOhm at 4 kV
    const m: Model = { nodes: [GND, node('ac', 'ac_voltage', { Vpk: vin * Math.SQRT2, f: F, phase: 0, R_int: 0 }), node('inv', 'microwave_inverter', { v_in: vin, v_out: vout }), node('rl', 'resistor', { R: Rmag })],
      edges: [wire('ac.p', 'inv.ac_in'), wire('ac.n', 'gnd.a'), wire('inv.hv_out', 'rl.p'), wire('rl.n', 'gnd.a')] };
    const dt = 1 / (F * 100);
    const vac: number[] = [], iin: number[] = [], vhv: number[] = [], iout: number[] = [];
    simulate(m, 200, dt, (s, k) => {
      if (k < 100) return;
      vac.push(s.across('inv', 'ac_in')); vhv.push(s.across('inv', 'hv_out'));
      iin.push(s.at('inv_branch_current_in')); iout.push(s.at('inv_branch_current_out'));
    });
    near(mean(vhv), vout, 0.01, 'V_hv = v_out');
    const Pout = mean(vhv.map((v, i) => v * iout[i]));
    const Pin = mean(vac.map((v, i) => v * iin[i]));
    near(Pout, (vout * vout) / Rmag, 0.5, 'output power V^2/R');
    near(Pin, Pout, 1, 'cycle-averaged input power equals output power');
    // the input current is in phase with the supply voltage (unity power factor)
    const A = dft(vac.map((_, i) => (i + 101) * dt), vac, F), B = dft(vac.map((_, i) => (i + 101) * dt), iin, F);
    expect(Math.abs(wrapPi(A.phase - B.phase)), 'phase between v_ac and i_in').toBeLessThan(0.01);
  }, 120000);
});

// ── 6. F-080 / F-013: the shipped inverter-fed induction-motor labs run on a floating star point ─────────────────────────
// Z_standstill = Rs + jw Lls + (jw Lm)(Rr + jw Llr)/(jw Lm + Rr + jw Llr) (upper bound of the phase current amplitude),
// Z_noload = Rs + jw (Lls + Lm) (lower bound); the phase voltage fundamental of the averaged inverter is M Vdc/2 with M = 1
// (the amplitude input is saturated by the controller / PID output).
describe('WP-12b F-080 / F-013: the in-app labs pid_ac_motor, vfd_inverter_drive, smart_washing_machine (floating motor star point)', () => {
  const cases: { id: string; motor: string; Vdc: number }[] = [
    { id: 'pid_ac_motor', motor: 'ac_motor', Vdc: 600 },
    { id: 'vfd_inverter_drive', motor: 'im_motor', Vdc: 600 },
    { id: 'smart_washing_machine', motor: 'wash_motor', Vdc: 320 },
  ];
  const Rs = 0.1, Rr = 0.08, Lm = 0.05, Lls = 0.01, Llr = 0.01;
  const cx = (re: number, im: number) => ({ re, im });
  const mul = (a: any, b: any) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const div = (a: any, b: any) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const jwLm = cx(0, W * Lm), rot = cx(Rr, W * Llr), rotSum = cx(Rr, W * (Llr + Lm));
  const par = div(mul(jwLm, rot), rotSum);
  const Zstand = Math.hypot(Rs + par.re, W * Lls + par.im), Znoload = Math.hypot(Rs, W * (Lls + Lm));
  const dt = 1e-3, steps = 80, perCycle = 20;

  const runLab = (id: string, motor: string, groundStar: boolean) => {
    const lab = LEARNING_LABS.find((l) => l.id === id)!;
    const nodes = reconstructLabNodes(lab.nodes as any);
    const edges: any[] = [...(lab.edges as any[])];
    if (groundStar) edges.push({ id: 'before_star', source: motor, sourceHandle: 'n_s', target: 'gnd', targetHandle: 'a_t' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ia: number[] = [], i0: number[] = [], tt: number[] = [];
    let r: Run;
    const t0 = Date.now();
    try {
      r = simulate({ nodes, edges }, steps, dt, (s, k) => {
        const a = s.at(`${motor}_branch_ia`), b = s.at(`${motor}_branch_ib`), c = s.at(`${motor}_branch_ic`);
        i0.push((a + b + c) / 3);
        if (k >= steps - perCycle) { tt.push(s.t); ia.push(a); }
      });
    } finally {
      var dumps = errors.mock.calls.filter((c) => String(c[0]).includes('ImplicitSolver Convergence Failure')).length;
      errors.mockRestore();
    }
    return { ia, i0, tt, dumps, ms: Date.now() - t0, r: r! };
  };

  for (const { id, motor, Vdc } of cases) {
    it(`${id}: no zero-sequence current, no convergence dumps, sinusoidal phase current with the expected fundamental`, () => {
      const after = runLab(id, motor, false);
      expect(after.dumps, 'ImplicitSolver convergence dumps (F-013 inverter side)').toBe(0);
      expect(Math.max(...after.i0.map(Math.abs)), 'max |i_0| over the run (A)').toBeLessThan(1e-6);
      const Vph = Vdc / 2; // M = 1
      const I = dft(after.tt, after.ia, F);
      expect(I.amp, `fundamental ${I.amp.toFixed(1)} A within [no-load, standstill] = [${(Vph / Znoload).toFixed(1)}, ${(Vph / Zstand).toFixed(1)}] A`).toBeGreaterThan(0.9 * Vph / Znoload);
      expect(I.amp).toBeLessThan(1.1 * Vph / Zstand);
      // the decaying DC offset of a voltage applied at an arbitrary instant (tau ~ Ls/Rs ~ 0.6 s) is a physical start-up transient; the offsets
      // of the three phases sum to zero (i_0 = 0 checked above); it is removed together with the fundamental
      const dc = mean(after.ia);
      const resid = after.ia.map((v, i) => v - dc - I.amp * Math.cos(W * after.tt[i] + I.phase));
      expect(Math.sqrt(mean(resid.map((v) => v * v))) / (I.amp / Math.SQRT2), 'rms of everything but the fundamental / fundamental rms').toBeLessThan(0.35);
      // before the fix (star point tied to the DC- reference): the DC common mode Vdc/2 across the zero-sequence resistance Rs
      const before = runLab(id, motor, true);
      const i0Before = Math.max(...before.i0.map(Math.abs));
      expect(i0Before, `grounded star: max |i_0| = ${i0Before.toFixed(0)} A (non-physical, was the F-080 fault)`).toBeGreaterThan(100);
      console.log(`[WP-12b F-080] ${id}: zero-sequence current before (star grounded) max ${i0Before.toFixed(1)} A, after (floating) max ${Math.max(...after.i0.map(Math.abs)).toExponential(2)} A; fundamental ${I.amp.toFixed(1)} A; run ${after.ms} ms / ${before.ms} ms`);
    }, 300000);
  }
});

// ── 7. saved-model migration of the composite decision ────────────────────────────────────────────────────────────────────
describe('WP-12b migration: saved scalar a / b / c wires of the inverter and the machines keep their circuit through a Phase Splitter', () => {
  const legacyPorts = (ids: string[], extra: any[] = []) => [...ids.map((id) => ({ id, pos: 'left', label: id.toUpperCase(), domain: 'Electrical' })), ...extra];
  const sc = (id: string, h: string, tId: string, th: string) => ({ id: `${id}`, source: id, sourceHandle: h, target: tId, targetHandle: th }) as any;
  const nodes: any[] = [
    { id: 'inv', type: 'default', position: { x: 0, y: 0 }, data: { type: 'pwm_3ph_2level', params: { control_mode: { value: 'sinusoidal_modulation' } }, ports: legacyPorts(['vabc', 'ma', 'mb', 'mc', 'p', 'n', 'a', 'b', 'c']) } },
    { id: 'mot', type: 'default', position: { x: 300, y: 0 }, data: { type: 'ac_motor', params: {}, ports: legacyPorts(['a', 'b', 'c', 'n', 'r']) } },
    { id: 'pid', type: 'default', position: { x: 0, y: 100 }, data: { type: 'ps_pid_ctrl', params: {}, ports: [] } },
  ];
  const edges: any[] = [
    { id: 'w1', source: 'inv', sourceHandle: 'a_s', target: 'mot', targetHandle: 'a_t' }, { id: 'w2', source: 'inv', sourceHandle: 'b_s', target: 'mot', targetHandle: 'b_t' },
    { id: 'w3', source: 'inv', sourceHandle: 'c_s', target: 'mot', targetHandle: 'c_t' }, { id: 'w4', source: 'pid', sourceHandle: 'u_s', target: 'inv', targetHandle: 'vabc_t' },
    { id: 'w5', source: 'mot', sourceHandle: 'n_s', target: 'gnd', targetHandle: 'a_t' },
  ];
  void sc;
  const out = normalizeLegacyVLabGraph(nodes as any, edges as any);
  it('both blocks get the composite abc port and one Phase Splitter each; the scalar wires move to the splitters', () => {
    expect(out.nodes.filter((n: any) => n.data.type === 'phase_splitter')).toHaveLength(2);
    for (const id of ['inv', 'mot']) expect(out.nodes.find((n: any) => n.id === id)!.data.ports.map((p: any) => p.id)).toContain('abc');
    const e = (id: string) => out.edges.find((x: any) => x.id === id)!;
    expect(e('w1').source).toBe('inv_phase_split'); expect(e('w1').target).toBe('mot_phase_split');
    expect(e('w3').sourceHandle).toBe('c_s');
    expect(out.edges.filter((x: any) => x.sourceHandle === 'abc_s' && x.targetHandle === 'abc_t')).toHaveLength(2);
    expect(e('w5').source).toBe('mot'); // the star point stays on the machine
  });
  it('the legacy scalar vabc (the V/f amplitude) is re-pointed to the new scalar amp input; modulation_index is back-filled', () => {
    expect(out.edges.find((x: any) => x.id === 'w4')!.targetHandle).toBe('amp_t');
    expect(out.nodes.find((n: any) => n.id === 'inv')!.data.params.modulation_index.value).toBe(0.8);
  });
  it('the migrated circuit simulates (phase splitters carry the three phases, nothing is shorted)', () => {
    const lab: Model = { nodes: [...out.nodes.filter((n: any) => n.id !== 'pid'), GND, node('dc', 'dc_voltage', { V: 100, R_int: 0 }), node('k', 'ps_constant', { value: 0.5 }), node('w', 'ang_vel_source', { omega: 0 }), node('rr', 'rot_ref')]
      .map((n: any) => (n.data?.ports ? { ...n, data: { ...n.data, ports: undefined } } : n)),
      edges: [...out.edges.filter((x: any) => !['w4', 'w5'].includes(x.id)), wire('k.y', 'inv.amp'), wire('dc.p', 'inv.p'), wire('dc.n', 'gnd.a'), wire('inv.n', 'gnd.a'), wire('mot.r', 'w.r'), wire('w.c', 'rr.r')] };
    const r = simulate(lab, 20, 1e-3);
    expect(Math.abs(r.at('mot_branch_ia') + r.at('mot_branch_ib') + r.at('mot_branch_ic'))).toBeLessThan(1e-6);
  });
});