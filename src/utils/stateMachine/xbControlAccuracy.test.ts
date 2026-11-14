import { describe, expect, it } from 'vitest';
import { buildXBControlProgram, evaluateXBControlProgram, xbControlKernelStateRoles } from './xbControlKernels';

/*
 * Physical accuracy of the inverter-control blocks (simulation and generated C share these
 * kernels; xbInverterControlKernels.test.ts keeps the host block library identical):
 *
 *  1. Anti-windup. PI controllers with an output limit use conditional integration
 *     (clamping): the integrator does not integrate in a step where the unclamped output is
 *     beyond the limit and the error drives it further out. SPEED_CONTROLLER (limit maxIq);
 *     CURRENT_CONTROLLER_DQ and FIELD_ORIENTED_CONTROL with the new optional parameter vMax
 *     (per-axis limit on vd and vq; no limit when absent).
 *  2. Parameters set to 0 are honoured (Ki = 0 is a P controller); defaults apply only when a
 *     parameter is absent.
 *  3. Phase continuity. IM_SCALAR_CONTROL, VF_SLIP_COMP and VOLTAGE_REFERENCE_GENERATOR keep
 *     the electrical angle as state and integrate it: theta_k = wrap(theta_{k-1} + omega_k * dt)
 *     (omega = w_ref, w_sync, or 2*pi*f), so a speed or frequency command change never makes
 *     the voltage phase jump. Amplitudes are unchanged (V/f law, boost).
 */

const runKernel = (type: string, params: Record<string, unknown>, dt: number, inputs: Array<Record<string, number>>) => {
  const program = buildXBControlProgram(type, params, dt);
  let state: Record<string, number> = Object.fromEntries(xbControlKernelStateRoles(type).map((role) => [role, 0]));
  return inputs.map((input, k) => {
    const result = evaluateXBControlProgram(program, input, state, k * dt);
    state = { ...result.nextState };
    return result.outputs;
  });
};

const angleOf = (out: Record<string, number>) => {
  const alpha = out.va;
  const beta = (out.va + 2 * out.vb) / Math.sqrt(3);
  return { angle: Math.atan2(beta, alpha), magnitude: Math.hypot(alpha, beta) };
};
const wrapped = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('PI anti-windup', () => {
  it('SPEED_CONTROLLER leaves saturation as soon as the error reverses', () => {
    const inputs = [
      ...Array.from({ length: 200 }, () => ({ speed_ref: 1000, speed_actual: 0 })),
      ...Array.from({ length: 5 }, () => ({ speed_ref: 0, speed_actual: 100 })),
    ];
    const out = runKernel('SPEED_CONTROLLER', { Kp: 0.8, Ki: 40, maxIq: 6 }, 1e-3, inputs);
    expect(out[199].iq_ref).toBe(6);
    expect(out[201].iq_ref).toBeLessThan(0);
  });

  it('CURRENT_CONTROLLER_DQ with vMax limits vd/vq and recovers immediately', () => {
    const inputs = [
      ...Array.from({ length: 300 }, () => ({ id_ref: 0, iq_ref: 8, id: 0, iq: 0 })),
      ...Array.from({ length: 5 }, () => ({ id_ref: 0, iq_ref: 0, id: 0, iq: 2 })),
    ];
    const out = runKernel('CURRENT_CONTROLLER_DQ', { Kp_d: 2, Ki_d: 300, Kp_q: 2.5, Ki_q: 350, iMax: 10, vMax: 24 }, 1e-4, inputs);
    expect(out[299].vq).toBe(24);
    expect(out[301].vq).toBeLessThan(0);
  });

  it('CURRENT_CONTROLLER_DQ without vMax keeps its unlimited behaviour', () => {
    const out = runKernel('CURRENT_CONTROLLER_DQ', { Kp_d: 2, Ki_d: 300, Kp_q: 2.5, Ki_q: 350, iMax: 10 }, 1e-4,
      Array.from({ length: 50 }, () => ({ id_ref: 0, iq_ref: 8, id: 0, iq: 0 })));
    expect(out[49].vq).toBeGreaterThan(24);
  });

  it('FIELD_ORIENTED_CONTROL with vMax recovers immediately', () => {
    const inputs = [
      ...Array.from({ length: 300 }, () => ({ id_ref: 0, iq_ref: 8, ia: 0, ib: 0, theta: 0 })),
      ...Array.from({ length: 5 }, () => ({ id_ref: 0, iq_ref: 0, ia: 0, ib: 2, theta: 0 })),
    ];
    const out = runKernel('FIELD_ORIENTED_CONTROL', { Kp: 3, Ki: 500, vMax: 24 }, 1e-4, inputs);
    expect(Math.abs(out[299].vq)).toBeLessThanOrEqual(24);
    expect(Math.abs(out[301].vq)).toBeLessThan(24);
  });
});

describe('parameters set to zero are honoured', () => {
  it('SPEED_CONTROLLER with Ki = 0 is a P controller', () => {
    const out = runKernel('SPEED_CONTROLLER', { Kp: 0.01, Ki: 0, maxIq: 6 }, 1e-3,
      Array.from({ length: 20 }, () => ({ speed_ref: 100, speed_actual: 0 })));
    for (const step of out) expect(step.iq_ref).toBeCloseTo(1, 12);
  });

  it('CURRENT_CONTROLLER_DQ with Ki_q = 0 is a P controller on q', () => {
    const out = runKernel('CURRENT_CONTROLLER_DQ', { Kp_d: 1, Ki_d: 0, Kp_q: 1, Ki_q: 0, iMax: 10 }, 1e-4,
      Array.from({ length: 20 }, () => ({ id_ref: 0, iq_ref: 3, id: 0, iq: 1 })));
    for (const step of out) expect(step.vq).toBeCloseTo(2, 12);
  });
});

describe('phase-continuous voltage references', () => {
  const dt = 1e-3;
  const checkContinuity = (outs: Array<Record<string, number>>, omegas: number[]) => {
    for (let k = 1; k < outs.length; k += 1) {
      const step = wrapped(angleOf(outs[k]).angle - angleOf(outs[k - 1]).angle);
      expect(Math.abs(step), `step ${k}`).toBeCloseTo(Math.abs(wrapped(omegas[k] * dt)), 9);
    }
  };

  it('IM_SCALAR_CONTROL integrates the speed command (no phase jump on a step)', () => {
    const omegas = Array.from({ length: 40 }, (_, k) => (k < 20 ? 100 : 250));
    const outs = runKernel('IM_SCALAR_CONTROL', { v_f_ratio: 0.5, boost: 6 }, dt, omegas.map((w) => ({ w_ref: w })));
    checkContinuity(outs, omegas);
  });

  it('VOLTAGE_REFERENCE_GENERATOR integrates 2*pi*f', () => {
    const freqs = Array.from({ length: 40 }, (_, k) => (k < 15 ? 20 : 45));
    const outs = runKernel('VOLTAGE_REFERENCE_GENERATOR', { amplitude: 0.8 }, dt, freqs.map((f) => ({ f })));
    checkContinuity(outs, freqs.map((f) => 2 * Math.PI * f));
  });

  it('VF_SLIP_COMP integrates the synchronous speed it reports', () => {
    const inputs = Array.from({ length: 40 }, (_, k) => ({ w_ref: k < 20 ? 120 : 260, iq_actual: k < 10 ? 2 : 6 }));
    const outs = runKernel('VF_SLIP_COMP', { v_f_ratio: 0.5, rated_slip: 0.04, rated_iq: 8 }, dt, inputs);
    checkContinuity(outs, outs.map((out) => out.w_sync));
  });
});
