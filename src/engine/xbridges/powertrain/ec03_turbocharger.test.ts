// EC-03 acceptance tests: Turbocharger (compressor + turbine + shaft), parametric model [assumption, spec §2].
//   U = omega r_c; PR = (1 + eta_c sigma U^2/(cp_c T_amb))^(g_c/(g_c-1)); P_boost = PR P_amb;
//   T_comp = T_amb (1 + (PR^((g_c-1)/g_c) - 1)/eta_c);  P_c = mdot_comp cp_c (T_comp - T_amb)
//   VGT:       A_eff = A_t_min + VgtPos/100 (A_t_max - A_t_min), turbine flow = mdot_exh
//   Wastegate: A_eff = A_t_min + VgtPos/100 * A_wg_max, turbine flow = mdot_exh * A_t_min/A_eff
//   P_back solves mdot_exh = Cd_t A_eff P_back/sqrt(R T_exh) Psi_t(P_amb/P_back) (Psi as for the throttle, gamma g_t), P_back >= P_amb
//   P_t = mdot_t cp_t T_exh eta_t (1 - (P_amb/P_back)^((g_t-1)/g_t));  J omega_dot = (eta_m P_t - P_c)/max(omega, 100)
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1e-12, Math.abs(b)));
const T = 'PT_TURBOCHARGER';
const P = { J_tc: 2e-5, eta_m: 0.95, r_c: 0.025, sigma: 0.9, eta_c: 0.72, eta_t: 0.7, A_t_min: 2e-4, A_t_max: 8e-4, A_wg_max: 4e-4, Cd_t: 1,
  gamma_c: 1.4, cp_c: 1005, gamma_t: 1.33, cp_t: 1150, R: 287, N_tc0: 60000, mode: 'VGT' };
const psi = (pr: number, g: number) => {
  const prc = Math.pow(2 / (g + 1), g / (g - 1));
  return pr <= prc ? Math.sqrt(g * Math.pow(2 / (g + 1), (g + 1) / (g - 1))) : Math.sqrt(2 * g / (g - 1) * (Math.pow(pr, 2 / g) - Math.pow(pr, (g + 1) / g)));
};
// inputs: mdot_comp, mdot_exh, T_exh, VgtPos, P_amb, T_amb
const ins = [0.08, 0.085, 900, 40, 101325, 298.15];

describe('PT_TURBOCHARGER', () => {
  it('ports', () => {
    const b = BLOCK_LIBRARY[T]('t', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['mdot_comp', 'kg/s'], ['mdot_exh', 'kg/s'], ['T_exh', 'K'], ['VgtPos', '%'], ['P_amb', 'Pa'], ['T_amb', 'K']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['P_boost', 'Pa'], ['T_comp', 'K'], ['N_tc', 'rpm'], ['P_back', 'Pa']]);
    expect(b.params.mode).toBe('VGT');
  });

  it('compressor pressure ratio and outlet temperature at the current shaft speed', () => {
    const b = BLOCK_LIBRARY[T]('t', P);
    const r = b.execute(ins, b.params, b.state, 0);
    const w = 60000 * 2 * Math.PI / 60, U = w * 0.025;
    const PR = Math.pow(1 + 0.72 * 0.9 * U * U / (1005 * 298.15), 1.4 / 0.4);
    rel(r.outputs[1] as number, PR * 101325, 1e-12);
    rel(r.outputs[2] as number, 298.15 * (1 + (Math.pow(PR, 0.4 / 1.4) - 1) / 0.72), 1e-12);
    rel(r.outputs[3] as number, 60000, 1e-12);
  });

  it('back pressure satisfies the turbine orifice equation; closing the VGT raises it', () => {
    const b = BLOCK_LIBRARY[T]('t', P);
    const back = (pos: number) => b.execute([0.08, 0.085, 900, pos, 101325, 298.15], b.params, b.state, 0).outputs[4] as number;
    const pb = back(40);
    const A = 2e-4 + 0.4 * 6e-4;
    rel(0.085, A * pb / Math.sqrt(287 * 900) * psi(101325 / pb, 1.33), 1e-9);
    expect(back(10)).toBeGreaterThan(back(40));
    expect(back(90)).toBeLessThan(back(40));
    expect(back(90)).toBeGreaterThanOrEqual(101325);
  });

  it('wastegate mode: opening the gate lowers back pressure and the turbine flow share', () => {
    const b = BLOCK_LIBRARY[T]('t', { ...P, mode: 'Wastegate' });
    const at = (pos: number) => b.execute([0.08, 0.085, 900, pos, 101325, 298.15], b.params, b.state, 0);
    const shut = at(0), open = at(100);
    expect((open.outputs[4] as number)).toBeLessThan(shut.outputs[4] as number);
    rel((shut.outputs[0] as any).TurbineFlw, 0.085, 1e-12);
    rel((open.outputs[0] as any).TurbineFlw, 0.085 * 2e-4 / (2e-4 + 4e-4), 1e-12);
  });

  it('shaft dynamics: speed settles where eta_m P_t = P_c, and Info reports both powers', () => {
    const blocks: any[] = [BLOCK_LIBRARY[T]('tc', { ...P, N_tc0: 40000 })];
    const names = ['mdot_comp', 'mdot_exh', 'T_exh', 'VgtPos', 'P_amb', 'T_amb'];
    const conns: any[] = [];
    names.forEach((n, i) => { blocks.push(BLOCK_LIBRARY.Constant(n, { value: ins[i] })); conns.push({ sourceBlock: n, sourcePort: 'out', targetBlock: 'tc', targetPort: n }); });
    const e = new XbridgesEngine({ blocks, connections: conns } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 3, fixedStep: 1e-3 } as any);
    const info = e.getSignalValue('tc', 'Info') as any;
    expect(Math.abs(0.95 * info.P_t - info.P_c)).toBeLessThan(1e-3 * info.P_c);
    expect(e.getSignalValue('tc', 'N_tc') as number).toBeGreaterThan(40000);
    expect(e.getSignalValue('tc', 'P_boost') as number).toBeGreaterThan(101325);
  });
});
