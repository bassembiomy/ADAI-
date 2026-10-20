// WP-23 acceptance tests: Mapped SI Engine and Mapped CI Engine (Powertrain Blockset / Propulsion / Combustion Engines).
// Documented form (static maps vs commanded torque and engine speed in rpm, linear, clip; to be confirmed against goldens):
//   N = EngSpd*60/(2*pi);  EngTrq = f_tbrake(TrqCmd, N);  FuelFlw = f_fuel(TrqCmd, N) [kg/s]
//   Info: AirMassFlw = f_air(TrqCmd, N), FuelMassFlw = FuelFlw, EngPwr = EngTrq*EngSpd,
//         BSFC = FuelFlw / max(EngPwr, eps) [kg/J, reported in g/kWh as 3.6e9*FuelFlw/EngPwr when EngPwr > 0, else 0]
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { getPowertrainSpec } from './index';
import { isBus } from '../bus/busCore';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const rpm = (n: number) => n * 2 * Math.PI / 60;

const P = {
  f_tbrake_t_bpt: [0, 100, 200], f_tbrake_n_bpt: [1000, 3000, 6000],
  f_tbrake: [[-10, -15, -25], [95, 98, 90], [190, 195, 170]],
  f_fuel: [[0.0002, 0.0004, 0.0008], [0.002, 0.005, 0.009], [0.004, 0.0095, 0.017]],
  f_air: [[0.003, 0.006, 0.012], [0.03, 0.075, 0.135], [0.06, 0.14, 0.25]],
};

describe.each(['PT_MAPPED_SI_ENGINE', 'PT_MAPPED_CI_ENGINE'])('%s', (T) => {
  const exec = (params: any, cmd: number, w: number) => {
    const b = BLOCK_LIBRARY[T]('e', params);
    const r = b.execute([cmd, w], b.params, b.state, 0);
    const o = (id: string) => r.outputs[b.outputs.findIndex(p => p.id === id)];
    return { r, o };
  };

  it('ports, path and parameters', () => {
    const name = T === 'PT_MAPPED_SI_ENGINE' ? 'Mapped SI Engine' : 'Mapped CI Engine';
    expect(getPowertrainSpec(T)!.simulinkPath).toBe(`Powertrain Blockset/Propulsion/Combustion Engines/${name}`);
    const b = BLOCK_LIBRARY[T]('e', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['TrqCmd', 'N*m'], ['EngSpd', 'rad/s']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['EngTrq', 'N*m'], ['FuelFlw', 'kg/s']]);
    for (const k of Object.keys(P)) expect(b.params, k).toHaveProperty(k);
  });

  it('brake torque and fuel flow are bilinear in (commanded torque, rpm) at grid and between grid points', () => {
    expect(exec(P, 100, rpm(3000)).o('EngTrq')).toBeCloseTo(98, 12);
    const { o } = exec(P, 150, rpm(4500));
    const bil = (t: number[][]) => 0.5 * (0.5 * t[1][1] + 0.5 * t[1][2]) + 0.5 * (0.5 * t[2][1] + 0.5 * t[2][2]);
    rel(o('EngTrq') as number, bil(P.f_tbrake), 1e-12);
    rel(o('FuelFlw') as number, bil(P.f_fuel), 1e-12);
  });

  it('clips outside the map (no extrapolated fuel or torque)', () => {
    rel(exec(P, 300, rpm(8000)).o('EngTrq') as number, 170, 1e-12);
    rel(exec(P, -50, rpm(500)).o('FuelFlw') as number, 0.0002, 1e-12);
  });

  it('Info: air flow, power and BSFC in g/kWh', () => {
    const w = rpm(3000);
    const { o } = exec(P, 200, w);
    const info = o('Info') as any;
    expect(isBus(info)).toBe(true);
    rel(info.AirMassFlw, 0.14, 1e-12);
    rel(info.FuelMassFlw, 0.0095, 1e-12);
    rel(info.EngPwr, 195 * w, 1e-12);
    rel(info.BSFC, 3.6e9 * 0.0095 / (195 * w), 1e-12);
    expect((exec(P, 0, rpm(3000)).o('Info') as any).BSFC).toBe(0); // motoring: no BSFC
  });

  it('rejects maps whose size does not match their breakpoints', () => {
    expect(exec({ ...P, f_fuel: [[1, 2], [3, 4]] }, 50, rpm(2000)).r.error).toMatch(/size/i);
  });
});
