// EC-02 acceptance tests: Ambient Conditions, Throttle Body, Intake Manifold (docs/powertrain/engine-calibration-spec.md §2).
//   Ambient: p_sat = 610.94*exp(17.625*(T-273.15)/(T-30.11)) (Magnus, Alduchov & Eskridge 1996), p_v = RH/100*p_sat,
//            rho = (P - p_v)/(287.058 T) + p_v/(461.495 T)
//   Throttle: psi = min(alpha + alpha0, 90 deg); A = (pi D^2/4)(1 - cos(psi)/cos(alpha0)) + A_leak
//            mdot = sign * Cd A p_up / sqrt(R T_up) * Psi(pr), pr = p_down/p_up (upstream = higher pressure),
//            Psi = sqrt(2g/(g-1) (pr^(2/g) - pr^((g+1)/g))) for pr > pr_c = (2/(g+1))^(g/(g-1)), else sqrt(g (2/(g+1))^((g+1)/(g-1)))
//   Manifold: T_map = (mdot_in T_in + mdot_egr T_egr)/(mdot_in + mdot_egr) (T_in when no flow);
//            dP/dt = R T_map/V_m (mdot_in + mdot_egr - mdot_cyl), mdot_cyl = eta_v P Vd_tot N/(120 R T_map)
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';
import { isBus } from '../bus/busCore';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1e-12, Math.abs(b)));
const run = (type: string, params: any, ins: any[]) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  const r = b.execute(ins, b.params, b.state, 0);
  return { b, r, o: (id: string) => r.outputs[b.outputs.findIndex(p => p.id === id)] as any };
};
const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });

describe('PT_AMBIENT', () => {
  it('ports, defaults and moist-air density', () => {
    expect(getPowertrainSpec('PT_AMBIENT')!.category).toBe('Powertrain / Engine Calibration / Test Cell and DoE');
    const { b, o } = run('PT_AMBIENT', { P_amb: 98000, T_amb: 303.15, RH: 60 }, []);
    expect(b.inputs).toEqual([]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Amb', 'bus'], ['P_amb', 'Pa'], ['T_amb', 'K']]);
    const T = 303.15, psat = 610.94 * Math.exp(17.625 * (T - 273.15) / (T - 30.11)), pv = 0.6 * psat;
    const amb = o('Amb');
    expect(isBus(amb)).toBe(true);
    rel(amb.rho, (98000 - pv) / (287.058 * T) + pv / (461.495 * T), 1e-12);
    expect(amb).toMatchObject({ P: 98000, T: 303.15, RH: 60 });
    expect(o('P_amb')).toBe(98000);
    const d = BLOCK_LIBRARY.PT_AMBIENT('d', {});
    expect(d.params).toMatchObject({ P_amb: 101325, T_amb: 298.15, RH: 50 });
  });
});

describe('PT_THROTTLE_BODY', () => {
  const P = { D_th: 0.05, Cd: 0.8, alpha0: 5, A_leak: 1e-6, gamma: 1.4, R: 287 };
  const area = (alpha: number) => Math.PI * 0.05 ** 2 / 4 * (1 - Math.cos(Math.min(alpha + 5, 90) * Math.PI / 180) / Math.cos(5 * Math.PI / 180)) + 1e-6;
  const psi = (pr: number, g = 1.4) => {
    const prc = Math.pow(2 / (g + 1), g / (g - 1));
    return pr <= prc ? Math.sqrt(g * Math.pow(2 / (g + 1), (g + 1) / (g - 1))) : Math.sqrt(2 * g / (g - 1) * (Math.pow(pr, 2 / g) - Math.pow(pr, (g + 1) / g)));
  };

  it('ports', () => {
    const b = BLOCK_LIBRARY.PT_THROTTLE_BODY('t', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['alpha', 'deg'], ['P_amb', 'Pa'], ['P_map', 'Pa'], ['T_amb', 'K']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['mdot_th', 'kg/s']]);
  });

  it('choked and unchoked compressible orifice flow', () => {
    const choked = run('PT_THROTTLE_BODY', P, [30, 101325, 30000, 298.15]).o('mdot_th');
    rel(choked, 0.8 * area(30) * 101325 / Math.sqrt(287 * 298.15) * psi(0.1), 1e-12);
    const sub = run('PT_THROTTLE_BODY', P, [30, 101325, 0.9 * 101325, 298.15]).o('mdot_th');
    rel(sub, 0.8 * area(30) * 101325 / Math.sqrt(287 * 298.15) * psi(0.9), 1e-12);
    expect(run('PT_THROTTLE_BODY', P, [30, 101325, 101325, 298.15]).o('mdot_th')).toBe(0);
  });

  it('closed plate leaks only A_leak; opening is monotone; full open at 90 - alpha0', () => {
    rel(run('PT_THROTTLE_BODY', P, [0, 101325, 50000, 298.15]).o('Info').Area, 1e-6, 1e-12);
    let prev = 0;
    for (const a of [0, 10, 20, 40, 60, 85]) { const m = run('PT_THROTTLE_BODY', P, [a, 101325, 50000, 298.15]).o('mdot_th'); expect(m).toBeGreaterThan(prev); prev = m; }
    rel(run('PT_THROTTLE_BODY', P, [85, 101325, 50000, 298.15]).o('Info').Area, Math.PI * 0.05 ** 2 / 4 + 1e-6, 1e-12);
  });

  it('reverse flow when the manifold pressure exceeds ambient', () => {
    const m = run('PT_THROTTLE_BODY', P, [30, 101325, 1.2e5, 298.15]).o('mdot_th');
    rel(m, -0.8 * area(30) * 1.2e5 / Math.sqrt(287 * 298.15) * psi(101325 / 1.2e5), 1e-12);
  });
});

describe('PT_INTAKE_MANIFOLD', () => {
  const P = { V_m: 3e-3, R: 287, eta_v: 0.9, Vd_tot: 2e-3, P_o: 1e5 };

  it('ports and parameters', () => {
    const b = BLOCK_LIBRARY.PT_INTAKE_MANIFOLD('m', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['mdot_in', 'kg/s'], ['N', 'rpm'], ['mdot_egr', 'kg/s'], ['T_in', 'K'], ['T_egr', 'K']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['P_map', 'Pa'], ['T_map', 'K'], ['mdot_cyl', 'kg/s']]);
    for (const k of Object.keys(P)) expect(b.params, k).toHaveProperty(k);
  });

  it('filling/emptying follows the exact exponential solution with constant inputs', () => {
    const mIn = 0.03, mEgr = 0.005, Tin = 310, Tegr = 500, N = 2500;
    const blocks = [
      BLOCK_LIBRARY.Constant('min', { value: mIn }), BLOCK_LIBRARY.Constant('n', { value: N }),
      BLOCK_LIBRARY.Constant('megr', { value: mEgr }), BLOCK_LIBRARY.Constant('tin', { value: Tin }),
      BLOCK_LIBRARY.Constant('tegr', { value: Tegr }), BLOCK_LIBRARY.PT_INTAKE_MANIFOLD('man', P),
    ];
    const e = new XbridgesEngine({ blocks, connections: [c('min', 'out', 'man', 'mdot_in'), c('n', 'out', 'man', 'N'),
      c('megr', 'out', 'man', 'mdot_egr'), c('tin', 'out', 'man', 'T_in'), c('tegr', 'out', 'man', 'T_egr')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.05, fixedStep: 1e-4 } as any);
    const T = (mIn * Tin + mEgr * Tegr) / (mIn + mEgr);
    const a = 287 * T * (mIn + mEgr) / 3e-3, b = 0.9 * 2e-3 * N / (120 * 3e-3);
    const exact = a / b + (1e5 - a / b) * Math.exp(-b * 0.05);
    rel(e.getSignalValue('man', 'T_map') as number, T, 1e-12);
    rel(e.getSignalValue('man', 'P_map') as number, exact, 1e-8);
    rel(e.getSignalValue('man', 'mdot_cyl') as number, 0.9 * exact * 2e-3 * N / (120 * 287 * T), 1e-8);
  });

  it('throttle + manifold settle where throttle flow equals cylinder flow', () => {
    const blocks = [
      BLOCK_LIBRARY.PT_AMBIENT('amb', {}), BLOCK_LIBRARY.Constant('alpha', { value: 20 }), BLOCK_LIBRARY.Constant('n', { value: 2000 }),
      BLOCK_LIBRARY.Constant('zero', { value: 0 }), BLOCK_LIBRARY.PT_THROTTLE_BODY('th', {}), BLOCK_LIBRARY.PT_INTAKE_MANIFOLD('man', P),
    ];
    const e = new XbridgesEngine({ blocks, connections: [
      c('alpha', 'out', 'th', 'alpha'), c('amb', 'P_amb', 'th', 'P_amb'), c('amb', 'T_amb', 'th', 'T_amb'), c('man', 'P_map', 'th', 'P_map'),
      c('th', 'mdot_th', 'man', 'mdot_in'), c('n', 'out', 'man', 'N'), c('zero', 'out', 'man', 'mdot_egr'),
      c('amb', 'T_amb', 'man', 'T_in'), c('amb', 'T_amb', 'man', 'T_egr')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode14x', startTime: 0, stopTime: 2, fixedStep: 1e-3 } as any);
    rel(e.getSignalValue('th', 'mdot_th') as number, e.getSignalValue('man', 'mdot_cyl') as number, 1e-6);
    const p = e.getSignalValue('man', 'P_map') as number;
    expect(p).toBeGreaterThan(2e4); expect(p).toBeLessThan(101325);
  });
});
