// WP-14 (part 1) acceptance tests: Open Differential (Powertrain Blockset / Drivetrain / Final Drive Unit).
// Documented form (quasi-static, ideal kinematics with efficiency; inertia/damping variant to be confirmed against goldens):
//   DriveshftSpd = Ndiff * (Axl1Spd + Axl2Spd) / 2
//   Axl1Trq = Axl2Trq = Ndiff * DriveshftTrq * k / 2 - bw * AxlSpd_i,   k = eta if DriveshftTrq*DriveshftSpd >= 0 else 1/eta
//   shaftSign = +1 ('Crown wheel located to the right of the center-line') or -1 (left): multiplies DriveshftTrq and DriveshftSpd
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { getPowertrainSpec } from './index';
import { isBus } from '../bus/busCore';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const T = 'PT_OPEN_DIFFERENTIAL';
const exec = (params: any, ins: number[]) => {
  const b = BLOCK_LIBRARY[T]('d', params);
  const r = b.execute(ins, b.params, b.state, 0);
  return { r, o: (id: string) => r.outputs[b.outputs.findIndex(p => p.id === id)] };
};

describe('PT_OPEN_DIFFERENTIAL', () => {
  it('ports, path and parameters', () => {
    expect(getPowertrainSpec(T)!.simulinkPath).toBe('Powertrain Blockset/Drivetrain/Final Drive Unit/Open Differential');
    const b = BLOCK_LIBRARY[T]('d', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['DriveshftTrq', 'N*m'], ['Axl1Spd', 'rad/s'], ['Axl2Spd', 'rad/s']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['Axl1Trq', 'N*m'], ['Axl2Trq', 'N*m'], ['DriveshftSpd', 'rad/s']]);
    for (const k of ['Ndiff', 'eta', 'bw', 'shaftSide']) expect(b.params, k).toHaveProperty(k);
  });

  it('splits torque equally with the ratio and efficiency; shaft speed is the ratio times the mean axle speed', () => {
    const p = { Ndiff: 4, eta: 0.95, bw: 0, shaftSide: 'Right' };
    const { o } = exec(p, [100, 50, 60]);
    rel(o('DriveshftSpd') as number, 4 * 55, 1e-15);
    rel(o('Axl1Trq') as number, 4 * 100 * 0.95 / 2, 1e-15);
    rel(o('Axl2Trq') as number, 4 * 100 * 0.95 / 2, 1e-15);
  });

  it('back-driven (regeneration) uses 1/eta; viscous axle damping subtracts bw*speed', () => {
    const { o } = exec({ Ndiff: 4, eta: 0.95, bw: 0.1, shaftSide: 'Right' }, [-80, 30, 30]);
    rel(o('Axl1Trq') as number, 4 * -80 / 0.95 / 2 - 0.1 * 30, 1e-14);
  });

  it('power balance: shaft power in = axle power out + loss', () => {
    const { o } = exec({ Ndiff: 3.5, eta: 0.9, bw: 0.05, shaftSide: 'Right' }, [120, 40, 44]);
    const info = o('Info') as any;
    expect(isBus(info)).toBe(true);
    const pin = 120 * (o('DriveshftSpd') as number);
    const pout = (o('Axl1Trq') as number) * 40 + (o('Axl2Trq') as number) * 44;
    rel(info.PwrLoss, pin - pout, 1e-12);
    expect(info.PwrLoss).toBeGreaterThan(0);
  });

  it('left-side crown wheel reverses the shaft sign convention', () => {
    const { o } = exec({ Ndiff: 4, eta: 1, bw: 0, shaftSide: 'Left' }, [100, 50, 50]);
    rel(o('DriveshftSpd') as number, -200, 1e-15);
    rel(o('Axl1Trq') as number, -200, 1e-15);
  });
});
