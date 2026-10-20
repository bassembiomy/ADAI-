// EC-04 acceptance tests: Fuel Injector and VVT / Valvetrain (docs/powertrain/engine-calibration-spec.md §2).
// Injector: mdot = Cd n (pi d^2/4) sqrt(2 rho (P_rail*1e6 - P_cyl)) (0 if P_rail*1e6 <= P_cyl); m_f[mg] = mdot * ET[ms]*1e-3 * 1e6;
//           mdot_mean = m_f[kg] * N_cyl * N/120.
// VVT (theta: 0 = firing TDC; intake BDC = -180; exhaust TDC = -360 == 360):
//   lift(theta) = L_max/2 * (1 - cos(2 pi (theta - open)/(close - open))) inside the event, 0 outside;
//   intake event [IVO_base + dTheta_int, IVC_base + dTheta_int], exhaust event [EVO_base + dTheta_exh, EVC_base + dTheta_exh]
//   (exhaust event measured on the previous cycle: EVO ~ +130 deg, EVC ~ +370 deg = 10 deg after gas-exchange TDC at 360);
//   curtain area A = pi D_v lift; overlap factor OF = integral over the overlap of min(A_int, A_exh) d(theta) [m^2 deg]
//   (intake angles shifted by +720 so both events are on the same axis);
//   RGF[%] = 100 * min(1, (1/CR)(P_exh/P_map)^(1/gamma) + k_ov * OF * sqrt(|P_exh - P_map|) / (N P_map));
//   eta_v = eta_v0 * V(IVC_eff)/V(-180) * (1 - RGF/100), V from the slider-crank geometry (B, S, L, CR).
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { cylinderVolume } from './engineCycle';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1e-12, Math.abs(b)));
const run = (type: string, params: any, ins: any[]) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  const r = b.execute(ins, b.params, b.state, 0);
  return { b, r, o: (id: string) => r.outputs[b.outputs.findIndex(p => p.id === id)] as any };
};

describe('PT_FUEL_INJECTOR', () => {
  const P = { n_holes: 7, d_noz: 0.12e-3, Cd: 0.7, rho_f: 830, N_cyl: 4 };
  it('ports', () => {
    const b = BLOCK_LIBRARY.PT_FUEL_INJECTOR('i', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['P_rail', 'MPa'], ['P_cyl', 'Pa'], ['ET', 'ms'], ['N', 'rpm']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['m_f', 'mg'], ['mdot_f', 'kg/s'], ['mdot_f_mean', 'kg/s']]);
  });
  it('Bernoulli orifice flow, injected mass and mean flow', () => {
    const { o } = run('PT_FUEL_INJECTOR', P, [160, 5e6, 0.8, 2000]);
    const mdot = 0.7 * 7 * Math.PI * 0.12e-3 ** 2 / 4 * Math.sqrt(2 * 830 * (160e6 - 5e6));
    rel(o('mdot_f'), mdot, 1e-12);
    rel(o('m_f'), mdot * 0.8e-3 * 1e6, 1e-12);
    rel(o('mdot_f_mean'), mdot * 0.8e-3 * 4 * 2000 / 120, 1e-12);
  });
  it('no flow when cylinder pressure reaches rail pressure; negative ET is an error', () => {
    expect(run('PT_FUEL_INJECTOR', P, [5, 6e6, 0.8, 2000]).o('m_f')).toBe(0);
    expect(run('PT_FUEL_INJECTOR', P, [160, 5e6, -0.1, 2000]).r.error).toMatch(/ET/);
  });
});

describe('PT_VVT_VALVETRAIN', () => {
  const geom = { B: 0.084, S: 0.09, L: 0.145, CR: 16.5 };
  const P = { ...geom, L_max: 9, D_int: 0.03, D_exh: 0.026, IVO_base: -370, IVC_base: -140, EVO_base: 130, EVC_base: 370, eta_v0: 0.95, gamma: 1.35, k_ov: 1e7 };
  it('ports', () => {
    const b = BLOCK_LIBRARY.PT_VVT_VALVETRAIN('v', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['dTheta_int', 'deg'], ['dTheta_exh', 'deg'], ['N', 'rpm'], ['P_map', 'Pa'], ['P_exh', 'Pa']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['IVC_eff', 'deg'], ['EVO_eff', 'deg'], ['RGF', '%'], ['eta_v', '1']]);
  });
  it('phasing shifts the valve events', () => {
    const { o } = run('PT_VVT_VALVETRAIN', P, [10, -5, 2000, 1e5, 1.1e5]);
    expect(o('IVC_eff')).toBe(-130);
    expect(o('EVO_eff')).toBe(125);
  });
  it('without overlap RGF is the ideal residual term; overlap adds to it', () => {
    // pull the events apart: intake opens late (+40), exhaust closes early (-40) -> no overlap
    const apart = run('PT_VVT_VALVETRAIN', P, [40, -40, 2000, 1e5, 1.2e5]).o;
    expect(apart('Info').OF).toBe(0);
    rel(apart('RGF'), 100 * (1 / 16.5) * Math.pow(1.2, 1 / 1.35), 1e-12);
    const more = run('PT_VVT_VALVETRAIN', P, [-20, 20, 2000, 1e5, 1.2e5]).o;
    expect(more('Info').OF).toBeGreaterThan(0);
    expect(more('RGF')).toBeGreaterThan(apart('RGF'));
  });
  it('volumetric efficiency follows the trapped volume at IVC and the residual fraction', () => {
    const { o } = run('PT_VVT_VALVETRAIN', P, [30, -40, 2000, 1e5, 1.0e5]);
    const G = { ...geom, Ncyl: 4, IVC: -110, EVO: 90 };
    rel(o('eta_v'), 0.95 * cylinderVolume(G, -110) / cylinderVolume(G, -180) * (1 - o('RGF') / 100), 1e-12);
    const late = run('PT_VVT_VALVETRAIN', P, [50, -40, 2000, 1e5, 1.0e5]).o('eta_v');
    expect(late).toBeLessThan(o('eta_v'));
  });
});
