// EC-05 acceptance tests: Engine Dynamometer, Calibration ECU, Calibration Map 2D (engine-calibration-spec.md §2).
// Dyno: J = J_eng + J_dyno; omega_dot = (T_brake - T_load)/J;
//   Speed mode: T_load = Kp (N - N_set) + Ki z, dz/dt = N - N_set  (N in rpm; absorbing torque positive)
//   Torque mode: T_load = T_set.   P_dyno = T_load * omega / 1000 [kW].
// ECU: mode 'DoE override' passes DoE vector element i to output factorOrder[i] (others: default_<name>);
//   mode 'Map' looks up each output in its speed x load table (bilinear, clip).
// Calibration Map 2D: 'Bilinear' = 2-D lookup (clip); 'Bicubic' = tensor-product natural cubic spline (clip to the grid).
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1e-12, Math.abs(b)));
const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });

function dynoRun(params: any, Nset: number, Tb: number, Tset: number, stop: number) {
  const blocks = [BLOCK_LIBRARY.Constant('ns', { value: Nset }), BLOCK_LIBRARY.Constant('tb', { value: Tb }), BLOCK_LIBRARY.Constant('ts', { value: Tset }),
    BLOCK_LIBRARY.PT_ENGINE_DYNO('dy', params)];
  const e = new XbridgesEngine({ blocks, connections: [c('ns', 'out', 'dy', 'N_set'), c('tb', 'out', 'dy', 'T_brake'), c('ts', 'out', 'dy', 'T_set')] } as any);
  Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: stop, fixedStep: 1e-3 } as any);
  return e;
}

describe('PT_ENGINE_DYNO', () => {
  it('ports and parameters', () => {
    const b = BLOCK_LIBRARY.PT_ENGINE_DYNO('d', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['N_set', 'rpm'], ['T_brake', 'N*m'], ['T_set', 'N*m']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['N_actual', 'rpm'], ['T_load', 'N*m'], ['P_dyno', 'kW']]);
    expect(b.params.mode).toBe('Speed');
    for (const k of ['Kp', 'Ki', 'J_dyno', 'J_eng', 'N_o']) expect(b.params, k).toHaveProperty(k);
  });

  it('speed mode holds the set speed and absorbs the engine torque', () => {
    const e = dynoRun({ mode: 'Speed', Kp: 0.5, Ki: 5, J_dyno: 0.5, J_eng: 0.15, N_o: 800 }, 2000, 150, 0, 10);
    rel(e.getSignalValue('dy', 'N_actual') as number, 2000, 1e-4);
    rel(e.getSignalValue('dy', 'T_load') as number, 150, 1e-3);
    rel(e.getSignalValue('dy', 'P_dyno') as number, (e.getSignalValue('dy', 'T_load') as number) * (e.getSignalValue('dy', 'N_actual') as number) * 2 * Math.PI / 60 / 1000, 1e-12);
  });

  it('torque mode accelerates the shaft at (T_brake - T_set)/J exactly', () => {
    const e = dynoRun({ mode: 'Torque', J_dyno: 0.5, J_eng: 0.15, N_o: 1000 }, 0, 120, 100, 2);
    rel(e.getSignalValue('dy', 'N_actual') as number, 1000 + (20 / 0.65) * 2 * 60 / (2 * Math.PI), 1e-9);
    expect(e.getSignalValue('dy', 'T_load')).toBe(100);
  });
});

describe('PT_CALIBRATION_ECU', () => {
  const outIds = ['SOI', 'P_rail', 'PW', 'SA', 'VgtPos', 'EgrPos'];
  it('ports', () => {
    const b = BLOCK_LIBRARY.PT_CALIBRATION_ECU('e', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['N', 'rpm'], ['Load', '%'], ['DoE', '1']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['SOI', 'deg'], ['P_rail', 'MPa'], ['PW', 'ms'], ['SA', 'deg'], ['VgtPos', '%'], ['EgrPos', '%']]);
    expect(b.params.mode).toBe('DoE override');
    expect(b.params.factorOrder).toBe('SOI,P_rail,PW,SA,VgtPos,EgrPos');
  });

  it('DoE override passes the vector through in factor order; missing factors use their defaults', () => {
    const b = BLOCK_LIBRARY.PT_CALIBRATION_ECU('e', { factorOrder: 'P_rail,SOI', default_PW: 0.7, default_SA: 0, default_VgtPos: 50, default_EgrPos: 10 });
    const r = b.execute([2000, 50, [140, 7]], b.params, b.state, 0);
    const o = Object.fromEntries(outIds.map(id => [id, r.outputs[b.outputs.findIndex(p => p.id === id)]]));
    expect(o).toEqual({ SOI: 7, P_rail: 140, PW: 0.7, SA: 0, VgtPos: 50, EgrPos: 10 });
  });

  it('map mode interpolates each output on speed x load', () => {
    const speedBp = [1000, 2000, 3000], loadBp = [0, 50, 100];
    const soi = speedBp.map(n => loadBp.map(l => 0.002 * n + 0.04 * l));
    const b = BLOCK_LIBRARY.PT_CALIBRATION_ECU('e', { mode: 'Map', speedBp, loadBp, map_SOI: soi });
    const r = b.execute([1500, 75, []], b.params, b.state, 0);
    rel(r.outputs[1] as number, 0.002 * 1500 + 0.04 * 75, 1e-12);
    const clipped = b.execute([5000, 120, []], b.params, b.state, 0);
    rel(clipped.outputs[1] as number, 0.002 * 3000 + 0.04 * 100, 1e-12);
  });
});

describe('PT_CALIBRATION_MAP_2D', () => {
  const xs = [1000, 1500, 2500, 4000], ys = [10, 40, 70, 100];
  const f = (x: number, y: number) => 3 + 0.01 * x - 0.2 * y + 1e-4 * x * y;
  const Z = xs.map(x => ys.map(y => f(x, y)));

  it('ports', () => {
    const b = BLOCK_LIBRARY.PT_CALIBRATION_MAP_2D('m', {});
    expect(b.inputs.map(p => p.id)).toEqual(['X_in', 'Y_in']);
    expect(b.outputs.map(p => p.id)).toEqual(['Z_out']);
    expect(b.params.method).toBe('Bilinear');
  });

  it.each(['Bilinear', 'Bicubic'])('%s reproduces a bilinear surface exactly and passes through the grid', (method) => {
    const b = BLOCK_LIBRARY.PT_CALIBRATION_MAP_2D('m', { X_bp: xs, Y_bp: ys, Z, method });
    for (const [x, y] of [[1200, 25], [3000, 90], [2500, 40], [1000, 100]]) rel(b.execute([x, y], b.params, b.state, 0).outputs[0] as number, f(x, y), 1e-10);
    rel(b.execute([9000, 0], b.params, b.state, 0).outputs[0] as number, f(4000, 10), 1e-10);
  });

  it('Bicubic is smooth across breakpoints where Bilinear has a kink', () => {
    const g = (x: number) => (x / 1000) ** 2;
    const Zq = xs.map(x => ys.map(() => g(x)));
    const slope = (method: string, x: number, h: number) => {
      const b = BLOCK_LIBRARY.PT_CALIBRATION_MAP_2D('m', { X_bp: xs, Y_bp: ys, Z: Zq, method });
      const v = (xx: number) => b.execute([xx, 50], b.params, b.state, 0).outputs[0] as number;
      return [(v(x) - v(x - h)) / h, (v(x + h) - v(x)) / h];
    };
    const [bl, br] = slope('Bilinear', 1500, 1e-3);
    const [cl, cr] = slope('Bicubic', 1500, 1e-3);
    expect(Math.abs(bl - br)).toBeGreaterThan(1e-4);
    expect(Math.abs(cl - cr)).toBeLessThan(1e-6);
  });
});
