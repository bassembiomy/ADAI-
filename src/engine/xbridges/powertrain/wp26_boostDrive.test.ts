// WP-26 acceptance tests: Boost Drive (Powertrain Blockset / Propulsion / Combustion Engine Components / Boost Drive).
// Flow port convention as WP-25 (state bus {Prs, Temp} in, flow bus {MassFlw, HeatFlw} out per side, positive into the
// neighbour). Corrected quantities: Ncorr = N_rpm / sqrt(T_A / T_ref), mdot = mdot_corr * (P_A / P_ref) / sqrt(T_A / T_ref).
// Lookups are bilinear in (Ncorr [rpm], PR), clipped at the breakpoints. g = cp / (cp - R).
//   Compressor: PR = P_B / P_A; mdot_corr = f_mdot(Ncorr, PR); eta = f_eta(Ncorr, PR);
//     T_out = T_A * (1 + (PR^((g-1)/g) - 1) / eta); Trq = mdot * cp * (T_out - T_A) / omega (0 for omega <= 0);
//     FlwA = {-mdot, -mdot*cp*T_A}, FlwB = {+mdot, +mdot*cp*T_out}. Info: PR, MassFlw, Eff, CorrSpd, Pwr, T_out.
//   Turbine (wastegate): PR = P_A / P_B; mdot_t = f_mdot(Ncorr, PR) * (P_A/P_ref)/sqrt(T_A/T_ref); eta = f_eta(Ncorr, PR);
//     T_out = T_A * (1 - eta * (1 - PR^(-(g-1)/g))); Trq = mdot_t * cp * (T_A - T_out) / omega;
//     wastegate bypass = compressible orifice Cd_wg * WgArea (WP-25 Psi, isenthalpic);
//     FlwA = {-(mdot_t + mdot_wg), -(mdot_t + mdot_wg)*cp*T_A}, FlwB = {mdot_t + mdot_wg, mdot_t*cp*T_out + mdot_wg*cp*T_A}.
//   Drive Shaft: J domega/dt = TrbnTrq - CmprTrq - b*omega; output Spd [rad/s]; Info Spd_rpm.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { makeBus } from '../bus/busCore';
import { getPowertrainSpec } from './index';

const R = 287;
const st = (Prs: number, Temp: number) => makeBus(['Prs', 'Temp'], [Prs, Temp]);
const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1e-12, Math.abs(b)));
const bilin = (xb: number[], yb: number[], t: number[][], x: number, y: number) => {
  const fx = (x - xb[0]) / (xb[1] - xb[0]), fy = (y - yb[0]) / (yb[1] - yb[0]);
  return t[0][0] * (1 - fx) * (1 - fy) + t[1][0] * fx * (1 - fy) + t[0][1] * (1 - fx) * fy + t[1][1] * fx * fy;
};
const psi = (pr: number, g: number) => {
  const crit = (2 / (g + 1)) ** (g / (g - 1));
  return pr > crit ? Math.sqrt(2 * g / (g - 1) * (pr ** (2 / g) - pr ** ((g + 1) / g))) : Math.sqrt(g) * (2 / (g + 1)) ** ((g + 1) / (2 * (g - 1)));
};
const BD = 'Powertrain Blockset/Propulsion/Combustion Engine Components/Boost Drive/';
const rpm2w = Math.PI / 30;

describe('ports', () => {
  it('Simulink paths and ports', () => {
    const ports = (t: string) => { const b = BLOCK_LIBRARY[t]('x', {}); return [b.inputs.map(q => q.id), b.outputs.map(q => q.id)]; };
    expect(getPowertrainSpec('PT_COMPRESSOR')!.simulinkPath).toBe(BD + 'Compressor');
    expect(getPowertrainSpec('PT_TURBINE')!.simulinkPath).toBe(BD + 'Turbine');
    expect(getPowertrainSpec('PT_DRIVE_SHAFT')!.simulinkPath).toBe(BD + 'Drive Shaft');
    expect(ports('PT_COMPRESSOR')).toEqual([['Spd', 'A', 'B'], ['Info', 'Trq', 'FlwA', 'FlwB']]);
    expect(ports('PT_TURBINE')).toEqual([['Spd', 'WgArea', 'A', 'B'], ['Info', 'Trq', 'FlwA', 'FlwB']]);
    expect(ports('PT_DRIVE_SHAFT')).toEqual([['TrbnTrq', 'CmprTrq'], ['Info', 'Spd']]);
  });

  it('default maps are valid and give a positive flow and efficiency inside the map', () => {
    for (const t of ['PT_COMPRESSOR', 'PT_TURBINE']) {
      const b = BLOCK_LIBRARY[t]('x', {});
      const ins = t === 'PT_COMPRESSOR' ? [80000 * rpm2w, st(1e5, 298.15), st(1.6e5, 300)] : [80000 * rpm2w, 0, st(1.8e5, 873.15), st(1.05e5, 700)];
      const r = b.execute(ins as any, b.params, b.state, 0);
      expect(r.error).toBeUndefined();
      expect((r.outputs[3] as any).MassFlw).toBeGreaterThan(0);
      expect((r.outputs[0] as any).Eff).toBeGreaterThan(0.4);
    }
  });
});

describe('Compressor', () => {
  const P = { cp: 1005, R, T_ref: 298.15, P_ref: 101325, SpdBp: [50000, 100000], PrBp: [1, 3], MassFlwTbl: [[0.2, 0.1], [0.4, 0.3]], EffTbl: [[0.7, 0.6], [0.75, 0.7]] };
  it('corrected flow, efficiency, outlet temperature and absorbed torque', () => {
    const b = BLOCK_LIBRARY.PT_COMPRESSOR('c', P);
    const w = 75000 * rpm2w, Tin = 310, Pin = 0.98e5, Pout = 1.96e5;
    const o = b.execute([w, st(Pin, Tin), st(Pout, 330)], b.params, b.state, 0).outputs as any[];
    const g = 1005 / (1005 - R), th = Math.sqrt(Tin / 298.15), Nc = 75000 / th;
    const md = bilin(P.SpdBp, P.PrBp, P.MassFlwTbl, Nc, 2) * (Pin / 101325) / th, eta = bilin(P.SpdBp, P.PrBp, P.EffTbl, Nc, 2);
    const Tout = Tin * (1 + (2 ** ((g - 1) / g) - 1) / eta);
    rel(o[3].MassFlw, md, 1e-12); rel(o[2].MassFlw, -md, 1e-12);
    rel(o[3].HeatFlw, md * 1005 * Tout, 1e-12); rel(o[2].HeatFlw, -md * 1005 * Tin, 1e-12);
    rel(o[1], md * 1005 * (Tout - Tin) / w, 1e-12);
    rel(o[0].Eff, eta, 1e-12); rel(o[0].T_out, Tout, 1e-12);
    expect(b.execute([0, st(Pin, Tin), st(Pout, 330)], b.params, b.state, 0).outputs[1]).toBe(0);
  });
});

describe('Turbine', () => {
  const P = { cp: 1150, R, T_ref: 873.15, P_ref: 101325, Cd_wg: 0.9, SpdBp: [40000, 120000], PrBp: [1, 3], MassFlwTbl: [[0, 0.2], [0, 0.25]], EffTbl: [[0.6, 0.7], [0.65, 0.72]] };
  it('expansion, extracted torque and isenthalpic wastegate bypass', () => {
    const b = BLOCK_LIBRARY.PT_TURBINE('t', P);
    const w = 80000 * rpm2w, Tin = 873.15, Pin = 2e5, Pout = 1.1e5, Awg = 1e-4;
    const o = b.execute([w, Awg, st(Pin, Tin), st(Pout, 700)], b.params, b.state, 0).outputs as any[];
    const g = 1150 / (1150 - R), PR = Pin / Pout;
    const mt = bilin(P.SpdBp, P.PrBp, P.MassFlwTbl, 80000, PR) * (Pin / 101325), eta = bilin(P.SpdBp, P.PrBp, P.EffTbl, 80000, PR);
    const Tout = Tin * (1 - eta * (1 - PR ** (-(g - 1) / g)));
    const mwg = 0.9 * Awg * Pin / Math.sqrt(R * Tin) * psi(Pout / Pin, g);
    rel(o[1], mt * 1150 * (Tin - Tout) / w, 1e-12);
    rel(o[3].MassFlw, mt + mwg, 1e-12);
    rel(o[3].HeatFlw, mt * 1150 * Tout + mwg * 1150 * Tin, 1e-12);
    rel(o[2].MassFlw, -(mt + mwg), 1e-12);
    rel(o[0].WgMassFlw, mwg, 1e-12);
  });
});

describe('Drive Shaft and a complete turbocharger', () => {
  it('shaft speed integrates the torque balance', () => {
    const blocks = [BLOCK_LIBRARY.PT_DRIVE_SHAFT('s', { J: 2e-4, b: 0, w_o: 5000 }), BLOCK_LIBRARY.Constant('tt', { value: 0.1 }), BLOCK_LIBRARY.Constant('ct', { value: 0.06 })];
    const e = new XbridgesEngine({ blocks, connections: [{ sourceBlock: 'tt', sourcePort: 'out', targetBlock: 's', targetPort: 'TrbnTrq' }, { sourceBlock: 'ct', sourcePort: 'out', targetBlock: 's', targetPort: 'CmprTrq' }] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.5, fixedStep: 1e-3 } as any);
    rel(e.getSignalValue('s', 'Spd') as number, 5000 + 0.04 / 2e-4 * 0.5, 1e-9);
  });

  it('compressor + turbine + shaft between boundaries reach a power balance', () => {
    const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
    const blocks = [
      BLOCK_LIBRARY.PT_FLOW_BOUNDARY('amb', { Prs: 101325, Temp: 298.15 }), BLOCK_LIBRARY.PT_COMPRESSOR('comp', {}),
      BLOCK_LIBRARY.PT_CONTROL_VOLUME('boost', { NumPorts: 2, V: 5e-3, P_o: 1.3e5, T_o: 320 }), BLOCK_LIBRARY.PT_FLOW_RESTRICTION('eng', { Area: 6e-4, Cd: 0.8 }),
      BLOCK_LIBRARY.PT_FLOW_BOUNDARY('exhIn', { Prs: 1.9e5, Temp: 850 }), BLOCK_LIBRARY.PT_TURBINE('trb', {}), BLOCK_LIBRARY.Constant('wg', { value: 0 }),
      BLOCK_LIBRARY.PT_FLOW_BOUNDARY('exhOut', { Prs: 1.05e5, Temp: 700 }), BLOCK_LIBRARY.PT_DRIVE_SHAFT('shaft', { J: 2e-4, b: 1e-6, w_o: 70000 * rpm2w }),
      BLOCK_LIBRARY.PT_FLOW_BOUNDARY('sink', { Prs: 101325, Temp: 298.15 })];
    const e = new XbridgesEngine({ blocks, connections: [
      c('amb', 'State', 'comp', 'A'), c('boost', 'State', 'comp', 'B'), c('shaft', 'Spd', 'comp', 'Spd'), c('comp', 'FlwB', 'boost', 'Flw1'),
      c('boost', 'State', 'eng', 'A'), c('sink', 'State', 'eng', 'B'), c('eng', 'FlwA', 'boost', 'Flw2'),
      c('exhIn', 'State', 'trb', 'A'), c('exhOut', 'State', 'trb', 'B'), c('shaft', 'Spd', 'trb', 'Spd'), c('wg', 'out', 'trb', 'WgArea'),
      c('trb', 'Trq', 'shaft', 'TrbnTrq'), c('comp', 'Trq', 'shaft', 'CmprTrq')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 4, fixedStep: 5e-4 } as any);
    expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const w = e.getSignalValue('shaft', 'Spd') as number, tt = e.getSignalValue('trb', 'Trq') as number, ct = e.getSignalValue('comp', 'Trq') as number;
    expect(w).toBeGreaterThan(0);
    rel(tt, ct + 1e-6 * w, 1e-3);
    expect((e.getSignalValue('boost', 'State') as any).Prs).toBeGreaterThan(101325);
  }, 120_000);
});
