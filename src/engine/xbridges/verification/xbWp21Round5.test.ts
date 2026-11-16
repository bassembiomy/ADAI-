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
