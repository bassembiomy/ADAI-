/**
 * WP-21 round 5, batch E5 acceptance (controller).
 * XBV-185: ode23tb treats a Newton iteration that overflows as a failed step (MATLAB ode23tb: a Newton failure shrinks h
 *   and retries), so the Robertson problem runs. Reference (Hairer & Wanner, Robertson at t = 40):
 *   y1 = 0.7158270687, y2 = 9.185534764e-6, y3 = 0.2841637457.
 * XBV-186 / decision D15: fixed-step solvers do not locate zero crossings (Simulink default: 'Enable zero-crossing
 *   detection for fixed-step simulation' off). A block mode changes at a major step, the output grid is k * h, and a
 *   batch run (Solvers.runFixedStep) gives the same numbers as the live canvas step. Step at 0.025 into an Integrator,
 *   h = 0.01, 0.05 s: the Step mode switches at the major step t = 0.03, so x(0.05) = 0.02 (live and batch).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { buildModel, runModel, type ModelSpec } from '../testkit';
import { BLOCK_LIBRARY } from '../BlockDefinitions';

const ROBERTSON: ModelSpec = {
  blocks: [
    { id: 'y1', type: 'Integrator', params: { initialCondition: 1 } }, { id: 'y2', type: 'Integrator' }, { id: 'y3', type: 'Integrator' },
    { id: 'p23', type: 'PRODUCT' }, { id: 'p22', type: 'PRODUCT' },
    { id: 'a1', type: 'GAIN', params: { gain: 0.04 } }, { id: 'b1', type: 'GAIN', params: { gain: 1e4 } }, { id: 'c1', type: 'GAIN', params: { gain: 3e7 } },
    { id: 'd1', type: 'Sum', params: { signs: '-+' } }, { id: 'd2', type: 'Sum', params: { signs: '+--' } },
  ],
  wires: ['y2.out -> p23.in1', 'y3.out -> p23.in2', 'y2.out -> p22.in1', 'y2.out -> p22.in2', 'y1.out -> a1.u', 'p23.y -> b1.u', 'p22.y -> c1.u',
    'a1.y -> d1.in1', 'b1.y -> d1.in2', 'd1.out -> y1.in', 'a1.y -> d2.in1', 'b1.y -> d2.in2', 'c1.y -> d2.in3', 'd2.out -> y2.in', 'c1.y -> y3.in'],
};

describe('XBV-185: ode23tb runs the Robertson problem', () => {
  it('t = 40, RelTol 1e-4, AbsTol 1e-10: no error, y1/y3 within 1e-3 and y2 within 1e-2 relative of the reference', () => {
    const probes = ['y1.out', 'y2.out', 'y3.out'];
    const r = runModel(buildModel(ROBERTSON), { solver: 'ode23tb', dt: 1, stopTime: 40, probes, relTol: 1e-4, absTol: 1e-10 });
    expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    expect(r.t.at(-1)).toBeCloseTo(40, 9);
    const ref = [0.7158270687, 9.185534764e-6, 0.2841637457];
    const last = probes.map((p) => Number(r.signals[p].at(-1)));
    expect(Math.abs(last[0] - ref[0]) / ref[0]).toBeLessThanOrEqual(1e-3);
    expect(Math.abs(last[1] - ref[1]) / ref[1]).toBeLessThanOrEqual(1e-2);
    expect(Math.abs(last[2] - ref[2]) / ref[2]).toBeLessThanOrEqual(1e-3);
  }, 240_000);
});

const STEP_INT: ModelSpec = {
  blocks: [{ id: 's', type: 'Step', params: { stepTime: 0.025, initialValue: 0, finalValue: 1 } }, { id: 'j', type: 'Integrator' }],
  wires: ['s.out -> j.in'],
};
const SWITCH_INT: ModelSpec = {
  blocks: [{ id: 'c', type: 'Constant', params: { value: 1 } }, { id: 'i', type: 'Integrator' }, { id: 'sw', type: 'SWITCH', params: { threshold: 0.025, criteria: '>=' } }, { id: 'a', type: 'Constant', params: { value: 5 } }, { id: 'j', type: 'Integrator' }],
  wires: ['c.out -> i.in', 'i.out -> sw.ctrl', 'a.out -> sw.u1', 'c.out -> sw.u2', 'sw.y -> j.in'],
};

describe('XBV-186 / D15: fixed-step solvers change modes at major steps, batch = live', () => {
  for (const solver of ['euler', 'ode2', 'ode3', 'rk4', 'ode5', 'ode14x']) {
    for (const [name, spec, expected] of [['Step', STEP_INT, 0.02], ['Switch', SWITCH_INT, 0.13]] as const) {
      it(`${solver}, ${name}: batch takes 5 steps of 0.01 and x(0.05) = ${expected}, equal to the live run`, () => {
        const e = new XbridgesEngine(buildModel(spec));
        let commits = 0;
        const commit = e.commitStateUpdates.bind(e);
        (e as unknown as { commitStateUpdates: typeof commit }).commitStateUpdates = (m) => { commits++; return commit(m); };
        Solvers.runFixedStep(e, { solver, startTime: 0, stopTime: 0.05, fixedStep: 0.01 } as never);
        expect(e.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(commits).toBe(5);
        expect(Number(e.getSignalValue('j', 'out'))).toBeCloseTo(expected, 12);
        const live = runModel(buildModel(spec), { solver, dt: 0.01, stopTime: 0.05, probes: ['j.out'] });
        expect(Number(live.signals['j.out'].at(-1))).toBeCloseTo(expected, 12);
      });
    }
  }
  it('no fixed-step solver carries zero-crossing event code (bracketZeroCrossing is gone or unused)', () => {
    const root = join(__dirname, '..');
    for (const f of ['Solvers.ts', 'StiffSolver.ts']) expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/bracketZeroCrossing\(/);
  });
});

// ---------------------------------------------------------------- batch J2 (schema)
// XBV-180: a parameter whose value 0 is not degenerate in the block equation (or that execute does not use) accepts 0 at
// compile; a negative physical value is still refused. Simulink mask checks follow the equation, not a blanket > 0.
describe('XBV-180: parameters that are not divisors accept 0', () => {
  const ZERO_OK: Array<[string, string]> = [
    ['ROBOT_VACUUM_MOTOR', 'motor_R'], ['ROBOT_VACUUM_MOTOR', 'motor_K'],
    ['ROBOT_VACUUM_DIGITAL_TWIN', 'motor_R'], ['ROBOT_VACUUM_DIGITAL_TWIN', 'motor_K'],
    ['AC_INDUCTION_MOTOR', 'Lm'], ['IM_FLUX_OBSERVER', 'Lm'], ['AC_MOTOR_PID_CONTROL', 'Lm'],
    ['ROBOT_VACUUM_BATTERY', 'nominal_voltage'], ['SVPWM_CORE', 'Ts'], ['MTPA_CONTROLLER', 'Ld'],
    ['IM_FOC_CONTROL', 'Rr'], ['IM_FOC_CONTROL', 'Lr'], ['IM_FOC_CONTROL', 'P'], ['IM_SCALAR_CONTROL', 'rated_f'],
  ];
  const paramErrors = (type: string, params: Record<string, unknown>) =>
    new XbridgesEngine(buildModel({ blocks: [{ id: 'u', type, params }], wires: [] })).compile(0)
      .filter((d) => d.severity === 'error' && d.code.startsWith('PARAMETER_')).map((d) => `${d.code}: ${d.message}`);
  for (const [type, param] of ZERO_OK) {
    it(`${type}.${param} = 0 compiles without a PARAMETER_* error; -1 is refused`, () => {
      expect(paramErrors(type, { [param]: 0 })).toEqual([]);
      expect(paramErrors(type, { [param]: -1 }).length).toBeGreaterThan(0);
    });
  }
  it('IM_FOC_CONTROL.Lm = 0 is still refused (divisor, XBV-153)', () => {
    expect(paramErrors('IM_FOC_CONTROL', { Lm: 0 }).length).toBeGreaterThan(0);
  });
});

// XBV-187 (WP-21 E5 rework, D15): with fixed-step solvers a clutch locks at the major step where the slip has changed sign
// since the previous major step (or is within omega_tol), with the holding torque within the static capacity, as
// Simulink's clutch models do without zero-crossing detection. Reference: the ode23tb lock time (event located).
describe('XBV-187: clutch lock-up with fixed-step solvers', () => {
  const lockTime = (r: { t: number[]; signals: Record<string, unknown[]> }) => {
    const w = r.signals['b.EngSpd'].map(Number);
    const j = w.findIndex((_, k) => w.slice(k).every((x) => Math.abs(x - w.at(-1)!) < 1e-9));
    return j >= 0 && j < w.length - 1 ? r.t[j] : Number.NaN;
  };
  for (const type of ['PT_AUTOMATED_MANUAL_TRANSMISSION', 'PT_DUAL_CLUTCH_TRANSMISSION']) {
    const proto = BLOCK_LIBRARY[type]('b', {});
    const vals = [1, 50, 1];
    const spec: ModelSpec = {
      blocks: [{ id: 'b', type }, ...proto.inputs.map((_p: { id: string }, i: number) => ({ id: `k${i}`, type: 'Constant', params: { value: vals[i] ?? 1 } }))],
      wires: proto.inputs.map((p: { id: string }, i: number) => `k${i}.out -> b.${p.id}`),
    };
    for (const dt of [1e-3, 1e-4]) {
      it(`${type} (Teng 50): rk4 ${dt} locks within 2 steps of the ode23tb lock time`, () => {
        const ref = lockTime(runModel(buildModel(spec), { solver: 'ode23tb', dt: 1e-4, stopTime: 0.05, probes: ['b.EngSpd'], relTol: 1e-6, absTol: 1e-9 }));
        expect(Number.isFinite(ref)).toBe(true);
        const r = runModel(buildModel(spec), { solver: 'rk4', dt, stopTime: 0.05, probes: ['b.EngSpd'] });
        expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(Math.abs(lockTime(r) - ref)).toBeLessThanOrEqual(2 * dt + 1e-12);
      }, 120_000);
    }
  }
});

// XBV-192 (batch D3): RATE_LIMITER slew rates may be vectors of the input size, applied element by element (per-element
// rates); a rate vector whose size differs from the input is refused with a diagnostic instead of skipping the limit.
describe('XBV-192: Rate Limiter with vector slew rates', () => {
  it('rates [1 2 4] per s, Ts 0.1, u = [10 10 10]: y(0) = [0.1 0.2 0.4] and y(0.2) = [0.3 0.6 1.2]', () => {
    const r = runModel(buildModel({
      blocks: [{ id: 'c', type: 'Constant', params: { value: [10, 10, 10] } }, { id: 'r', type: 'RATE_LIMITER', params: { risingSlewRate: [1, 2, 4], fallingSlewRate: [-1, -2, -4], sampleTime: 0.1 } }],
      wires: ['c.out -> r.u'],
    }), { solver: 'discrete', dt: 0.1, stopTime: 0.2, probes: ['r.y'] });
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const at = (k: number) => (r.signals['r.y'][k] as number[]).map(Number);
    at(0).forEach((v, i) => expect(v).toBeCloseTo([0.1, 0.2, 0.4][i], 12));
    at(2).forEach((v, i) => expect(v).toBeCloseTo([0.3, 0.6, 1.2][i], 12));
  });
  it('a rate vector of size 2 for a 3-element input is refused with an error diagnostic', () => {
    const r = runModel(buildModel({
      blocks: [{ id: 'c', type: 'Constant', params: { value: [10, 10, 10] } }, { id: 'r', type: 'RATE_LIMITER', params: { risingSlewRate: [1, 2], fallingSlewRate: -1, sampleTime: 0.1 } }],
      wires: ['c.out -> r.u'],
    }), { solver: 'discrete', dt: 0.1, stopTime: 0.2, probes: ['r.y'] });
    expect(r.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});

// XBV-193: Generate C (embedded validator) refuses vector Rate Limiter slew rates with a message that says so.
import { runEmbedded } from '../testkit';
describe('XBV-193: embedded refusal of vector slew rates names the cause', () => {
  it('RATE_LIMITER risingSlewRate [1 2 4]: an error diagnostic whose message mentions vector / scalar rates', () => {
    const r = runEmbedded({
      blocks: [{ id: 'c', type: 'Constant', params: { value: [10, 10, 10] } }, { id: 'r', type: 'RATE_LIMITER', params: { risingSlewRate: [1, 2, 4], fallingSlewRate: -1, sampleTime: 0.1 } }],
      wires: ['c.out -> r.u'],
    }, { solver: 'discrete', dt: 0.1, steps: 2, probes: ['r.y'], portDimensions: { 'c.out': [3], 'r.u': [3], 'r.y': [3] } });
    const errs = r.diagnostics.filter((d) => d.severity === 'error');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.map((d) => d.message).join(' | ')).toMatch(/vector|scalar/i);
  });
});

// XBV-194: a one-element array slew rate [2] is the scalar 2 on every path (MATLAB semantics). The embedded interpreter
// (and, through the same parameter reader, generated C) must use rate 2, not fall back to the default 1: rising 2 /s,
// Ts 0.1, u = 10 gives 0.2, 0.4, 0.6, equal to the canvas.
describe('XBV-194: one-element array slew rates are scalars in the embedded path', () => {
  for (const rate of [2, [2], '[2]'] as const) {
    it(`risingSlewRate ${JSON.stringify(rate)}: embedded gives 0.2, 0.4, 0.6 like the canvas`, () => {
      const spec: ModelSpec = {
        blocks: [{ id: 'c', type: 'Constant', params: { value: 10 } }, { id: 'r', type: 'RATE_LIMITER', params: { risingSlewRate: rate, fallingSlewRate: -2, sampleTime: 0.1 } }],
        wires: ['c.out -> r.u'],
      };
      const emb = runEmbedded(spec, { solver: 'discrete', dt: 0.1, steps: 3, probes: ['r.y'] });
      expect(emb.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      emb.signals['r.y'].forEach((v, k) => expect(v[0]).toBeCloseTo([0.2, 0.4, 0.6][k], 12));
      const canvas = runModel(buildModel(spec), { solver: 'discrete', dt: 0.1, stopTime: 0.2, probes: ['r.y'] });
      canvas.signals['r.y'].forEach((v, k) => expect(Number(Array.isArray(v) ? v[0] : v)).toBeCloseTo([0.2, 0.4, 0.6][k], 12));
    });
  }
});

// XBV-196: an empty slew rate is refused with a message that says it is empty (not 'vector').
describe('XBV-196: empty slew rate message', () => {
  for (const rate of [[], '[]'] as const) {
    it(`risingSlewRate ${JSON.stringify(rate)}: an error whose message says empty`, () => {
      const r = runEmbedded({
        blocks: [{ id: 'c', type: 'Constant', params: { value: 10 } }, { id: 'r', type: 'RATE_LIMITER', params: { risingSlewRate: rate, fallingSlewRate: -1, sampleTime: 0.1 } }],
        wires: ['c.out -> r.u'],
      }, { solver: 'discrete', dt: 0.1, steps: 2, probes: ['r.y'] });
      const msgs = r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message).join(' | ');
      expect(msgs).toMatch(/empty/i);
      expect(msgs).not.toMatch(/supports only scalar slew rates/i);
    });
  }
});

// XBV-187 rework (E5 verifier): the held friction direction must not outlive a located lock-up under the variable-step
// solvers. Disc clutch (wp13 parameters, P 200 kPa, no torques, w_in_o 100): t* = 100 / (Tk (1/J_in + 1/J_out)) = 0.04386 s;
// after t* both sides turn at 0.2 * 100 / 0.3 = 66.667 rad/s with Locked = 1, live ode45 / ode23 at output step 0.01 as well.
describe('XBV-187: clutch lock-up under the variable-step solvers (live)', () => {
  const P = { muk: 0.3, mus: 0.35, Ro: 0.15, Ri: 0.1, Nf: 2, Ap: 0.01, J_in: 0.2, J_out: 0.1, b_in: 0, b_out: 0, omega_tol: 1e-2, w_in_o: 100, w_out_o: 0 };
  const disc: ModelSpec = {
    blocks: [{ id: 'b', type: 'PT_DISC_CLUTCH', params: P }, { id: 'p', type: 'Constant', params: { value: 2e5 } }, { id: 'ti', type: 'Constant', params: { value: 0 } }, { id: 'tl', type: 'Constant', params: { value: 0 } }],
    wires: ['p.out -> b.P', 'ti.out -> b.InTrq', 'tl.out -> b.LoadTrq'],
  };
  for (const solver of ['ode45', 'ode23', 'ode23tb']) {
    for (const dt of [0.01, 0.001]) {
      it(`PT_DISC_CLUTCH ${solver} output step ${dt}: Locked = 1 and both speeds 66.667 at t = 0.05`, () => {
        const r = runModel(buildModel(disc), { solver, dt, stopTime: 0.05, probes: ['b.Locked', 'b.InSpd', 'b.OutSpd'], relTol: 1e-6, absTol: 1e-9 });
        expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(Number(r.signals['b.Locked'].at(-1))).toBe(1);
        expect(Number(r.signals['b.InSpd'].at(-1))).toBeCloseTo(200 / 3, 3);
        expect(Number(r.signals['b.OutSpd'].at(-1))).toBeCloseTo(200 / 3, 3);
      }, 60_000);
    }
  }
  it('a restored disc-clutch state without the held direction does not give NaN torque', () => {
    const b = BLOCK_LIBRARY['PT_DISC_CLUTCH']('b', P) as unknown as { state: Record<string, unknown>; execute: (i: unknown[], p: unknown, s: unknown, t: number) => { outputs: unknown[] } };
    const legacy = Object.fromEntries(Object.entries(b.state).filter(([k]) => !['lk', 'sp', 'hs', 'hd'].includes(k)));
    const out = b.execute([2e5, 0, 0], (b as unknown as { params: unknown }).params, legacy, 0).outputs;
    for (const v of out.slice(1)) expect(Number.isNaN(Number(v))).toBe(false);
  });
});
