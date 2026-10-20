// WP-12 acceptance tests: Longitudinal Wheel (Powertrain Blockset / Drivetrain / Wheels), disc brake, magic-formula tyre.
// Documented form (to be confirmed against goldens):
//   kappa = (Re*Omega - Vx) / max(|Vx|, VXLOW)
//   Fx = Fz * D * sin(C*atan(B*kappa - E*(B*kappa - atan(B*kappa))))          (Pacejka magic formula, pure longitudinal slip)
//   My = Re * Fz * Crr * tanh(4*Omega/OMEGA_TH)                                  (rolling resistance moment)
//   Tb = mu_kinetic * BrkPrs * (pi*disc_abore^2/4) * Rm * num_pads              (disc brake torque magnitude)
//   Iyy * dOmega/dt = AxlTrq - Re*Fx - My - Tb * tanh(4*Omega/OMEGA_TH)
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';
import { isBus } from '../bus/busCore';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const T = 'PT_LONGITUDINAL_WHEEL';
const P = { Re: 0.3, Iyy: 0.8, B: 10, C: 1.9, D: 1, E: 0.97, Crr: 0.015, VXLOW: 1, OMEGA_TH: 1, disc_abore: 0.05, Rm: 0.15, num_pads: 2, mu_kinetic: 0.3, omega_o: 0 };
const mf = (k: number, p = P) => p.D * Math.sin(p.C * Math.atan(p.B * k - p.E * (p.B * k - Math.atan(p.B * k))));

function run(params: any, ins: { BrkPrs?: number; AxlTrq: number; Vx: number; Fz: number }, stop: number, dt = 1e-4) {
  const blocks: any[] = [BLOCK_LIBRARY[T]('w', params)];
  const conns: any[] = [];
  for (const [k, v] of Object.entries(ins)) {
    if (v === undefined) continue;
    blocks.push(BLOCK_LIBRARY.Constant(k, { value: v }));
    conns.push({ sourceBlock: k, sourcePort: 'out', targetBlock: 'w', targetPort: k });
  }
  const e = new XbridgesEngine({ blocks, connections: conns } as any);
  Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: stop, fixedStep: dt } as any);
  return e;
}

describe('PT_LONGITUDINAL_WHEEL', () => {
  it('ports (disc brake variant by default), path and parameters', () => {
    expect(getPowertrainSpec(T)!.simulinkPath).toBe('Powertrain Blockset/Drivetrain/Wheels/Longitudinal Wheel');
    const b = BLOCK_LIBRARY[T]('w', {});
    expect(b.params.brakeType).toBe('Disc');
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['BrkPrs', 'Pa'], ['AxlTrq', 'N*m'], ['Vx', 'm/s'], ['Fz', 'N']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['Fx', 'N'], ['Omega', 'rad/s']]);
    const nb = BLOCK_LIBRARY[T]('w', { brakeType: 'None' });
    expect(nb.inputs.map(p => p.id)).toEqual(['AxlTrq', 'Vx', 'Fz']);
  });

  it('free rolling: Omega settles at Vx/Re minus the slip that balances rolling resistance', () => {
    const p = { ...P, omega_o: 20 / 0.3 };
    const e = run(p, { BrkPrs: 0, AxlTrq: 0, Vx: 20, Fz: 4000 }, 0.5);
    const w = e.getSignalValue('w', 'Omega') as number;
    const k = (0.3 * w - 20) / 20;
    rel(e.getSignalValue('w', 'Fx') as number, 4000 * mf(k), 1e-9);
    // steady state: Re*Fx + My = 0  ->  Fx = -Fz*Crr (tanh saturated at this speed)
    rel(e.getSignalValue('w', 'Fx') as number, -4000 * 0.015, 1e-3);
  });

  it('driving torque: steady Fx*Re = AxlTrq - My and Fx = Fz*MF(kappa)', () => {
    const p = { ...P, omega_o: 15 / 0.3 };
    const e = run(p, { BrkPrs: 0, AxlTrq: 600, Vx: 15, Fz: 4000 }, 0.5);
    const w = e.getSignalValue('w', 'Omega') as number;
    const fx = e.getSignalValue('w', 'Fx') as number;
    rel(fx, 4000 * mf((0.3 * w - 15) / 15), 1e-9);
    rel(fx * 0.3, 600 - 0.3 * 4000 * 0.015, 1e-3);
    expect(w).toBeGreaterThan(15 / 0.3);
  });

  it('disc brake: steady Fx*Re = -(Tb + My) with Tb = mu*P*A*Rm*pads', () => {
    const Tb = 0.3 * 2e6 * (Math.PI * 0.05 ** 2 / 4) * 0.15 * 2; // 353.4 N*m
    const p = { ...P, omega_o: 20 / 0.3 };
    const e = run(p, { BrkPrs: 2e6, AxlTrq: 0, Vx: 20, Fz: 4000 }, 0.5);
    rel((e.getSignalValue('w', 'Fx') as number) * 0.3, -(Tb + 0.3 * 4000 * 0.015), 1e-3);
    const info = e.getSignalValue('w', 'Info') as any;
    expect(isBus(info)).toBe(true);
    rel(info.BrkTrq, Tb, 1e-9);
    for (const k of ['Kappa', 'My', 'BrkTrq', 'Fx', 'Omega']) expect(info, k).toHaveProperty(k);
  });

  it('heavy braking locks the wheel: Omega near 0 and Fx near Fz*MF(-1)', () => {
    const p = { ...P, omega_o: 10 / 0.3 };
    const e = run(p, { BrkPrs: 1e7, AxlTrq: 0, Vx: 10, Fz: 4000 }, 0.5);
    expect(Math.abs(e.getSignalValue('w', 'Omega') as number)).toBeLessThan(1);
    rel(e.getSignalValue('w', 'Fx') as number, 4000 * mf(-1), 0.05);
  });

  it('non-positive radius or inertia is a block error', () => {
    const e = run({ ...P, Re: 0 }, { BrkPrs: 0, AxlTrq: 0, Vx: 1, Fz: 1000 }, 0.001, 1e-4);
    expect(e.diagnostics.some(d => d.code === 'BLOCK_RUNTIME_FAULT' && d.blockIds?.includes('w'))).toBe(true);
  });
});
