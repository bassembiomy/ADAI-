// WP-27 acceptance tests: CI Core Engine (mean value, torque structure), Powertrain Blockset / Propulsion /
// Combustion Engine Components / Core Engine / CI Core Engine. Flow ports as WP-25 (Intk, Exh state buses in; IntkFlw,
// ExhFlw flow buses out, positive into the neighbouring volume). 2-D tables are indexed [speed rpm][fuel mg] (SpdBp, FuelBp),
// 1-D SOI tables over SoiDevBp; all lookups linear / bilinear, clipped. N = EngSpd*30/pi.
//   mdot_air = f_nv(N) * Vd * N/120 * P_intk/(R*T_intk);  mdot_f = F*1e-6 * Ncyl * N/120  (F = FuelMassCmd [mg/injection])
//   dSOI = MainSOI - f_soi_opt(N, F);  TqInr = f_tqinr(N, F) * f_eff_soi(dSOI);  TqFric = f_tqf(N, F)
//   TqPump = (P_exh - P_intk) * Vd / (4*pi);  EngTrq = TqInr - TqFric - TqPump
//   T_exh = T_intk + f_exh_frac(N, F) * mdot_f * LHV / (cp_exh * (mdot_air + mdot_f))
//   NOx = f_nox(N, F) * f_nox_soi(dSOI) [g/kWh];  P_max = P_intk * f_pmax_ratio(N, F) * f_pmax_soi(dSOI)
//   Lambda = mdot_air / (AFRst * mdot_f);  BSFC = mdot_f * 3.6e9 / (EngTrq * omega) when EngTrq*omega > 0, else 0
//   IntkFlw = {-mdot_air, -mdot_air*cp_air*T_intk};  ExhFlw = {mdot_air + mdot_f, (mdot_air + mdot_f)*cp_exh*T_exh}
//   EngSpd <= 0: no flow, no torque.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { makeBus } from '../bus/busCore';
import { getPowertrainSpec } from './index';

const st = (Prs: number, Temp: number) => makeBus(['Prs', 'Temp'], [Prs, Temp]);
const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1e-12, Math.abs(b)));
const P = {
  Ncyl: 6, Vd: 11.95e-3, R: 287, cp_air: 1005, cp_exh: 1150, AFRst: 14.5, LHV: 42.6e6,
  SpdBp: [1000, 2000], FuelBp: [50, 150], SoiDevBp: [-10, 0, 10],
  f_tqinr: [[300, 900], [320, 950]], f_tqf: [[40, 50], [60, 70]], f_soi_opt: [[8, 10], [12, 14]], f_eff_soi: [0.9, 1, 0.95],
  f_exh_frac: [[0.3, 0.32], [0.3, 0.34]], f_nox: [[10, 8], [12, 9]], f_nox_soi: [0.5, 1, 1.6],
  f_pmax_ratio: [[50, 70], [55, 80]], f_pmax_soi: [0.8, 1, 1.15], f_nv: [0.85, 0.95],
};

describe('CI Core Engine', () => {
  it('Simulink path and ports', () => {
    expect(getPowertrainSpec('PT_CI_CORE_ENGINE')!.simulinkPath).toBe('Powertrain Blockset/Propulsion/Combustion Engine Components/Core Engine/CI Core Engine');
    const b = BLOCK_LIBRARY.PT_CI_CORE_ENGINE('x', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['FuelMassCmd', 'mg'], ['MainSOI', 'deg'], ['EngSpd', 'rad/s'], ['Intk', 'bus'], ['Exh', 'bus']]);
    expect(b.outputs.map(p => p.id)).toEqual(['Info', 'EngTrq', 'IntkFlw', 'ExhFlw']);
  });

  it('torque structure, air path, exhaust energy, emissions and peak pressure at a point', () => {
    const b = BLOCK_LIBRARY.PT_CI_CORE_ENGINE('x', P);
    const w = 1500 * Math.PI / 30;
    const o = b.execute([100, 6, w, st(1.8e5, 320), st(2.0e5, 800)], b.params, b.state, 0).outputs as any[];
    const ma = 0.9 * 11.95e-3 * 1500 / 120 * 1.8e5 / (287 * 320), mf = 100e-6 * 6 * 1500 / 120;
    const tqInr = 617.5 * 0.95, tqPump = 0.2e5 * 11.95e-3 / (4 * Math.PI), trq = tqInr - 55 - tqPump;
    const Texh = 320 + 0.315 * mf * 42.6e6 / (1150 * (ma + mf));
    rel(o[1], trq, 1e-12);
    rel(o[2].MassFlw, -ma, 1e-12); rel(o[2].HeatFlw, -ma * 1005 * 320, 1e-12);
    rel(o[3].MassFlw, ma + mf, 1e-12); rel(o[3].HeatFlw, (ma + mf) * 1150 * Texh, 1e-12);
    const i = o[0];
    rel(i.T_exh, Texh, 1e-12); rel(i.NOx, 9.75 * 0.75, 1e-12); rel(i.P_max, 1.8e5 * 63.75 * 0.9, 1e-12);
    rel(i.Lambda, ma / (14.5 * mf), 1e-12); rel(i.BSFC, mf * 3.6e9 / (trq * w), 1e-12); rel(i.SOIdev, -5, 1e-12);
    rel(i.TqInr, tqInr, 1e-12); rel(i.TqFric, 55, 1e-12); rel(i.TqPump, tqPump, 1e-12);
    const stop = b.execute([100, 6, 0, st(1.8e5, 320), st(2.0e5, 800)], b.params, b.state, 0).outputs as any[];
    expect([stop[1], stop[2].MassFlw, stop[3].MassFlw]).toEqual([0, 0, 0]);
  });

  it('runs between intake and exhaust volumes with mass conservation', () => {
    const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
    const blocks = [
      BLOCK_LIBRARY.PT_FLOW_BOUNDARY('amb', { Prs: 1.6e5, Temp: 320 }), BLOCK_LIBRARY.PT_FLOW_RESTRICTION('rin', { Area: 4e-3, Cd: 0.9 }),
      BLOCK_LIBRARY.PT_CONTROL_VOLUME('im', { NumPorts: 2, V: 1.5e-2, P_o: 1.5e5, T_o: 320 }),
      BLOCK_LIBRARY.PT_CI_CORE_ENGINE('eng', {}), BLOCK_LIBRARY.Constant('fuel', { value: 120 }), BLOCK_LIBRARY.Constant('soi', { value: 10 }),
      BLOCK_LIBRARY.Constant('spd', { value: 1400 * Math.PI / 30 }),
      BLOCK_LIBRARY.PT_CONTROL_VOLUME('em', { NumPorts: 2, V: 1.5e-2, P_o: 1.6e5, T_o: 700, cp: 1150 }), BLOCK_LIBRARY.PT_FLOW_RESTRICTION('rout', { Area: 2e-3, Cd: 0.9, cp: 1150 }),
      BLOCK_LIBRARY.PT_FLOW_BOUNDARY('sink', { Prs: 1.05e5, Temp: 700 })];
    const e = new XbridgesEngine({ blocks, connections: [
      c('amb', 'State', 'rin', 'A'), c('im', 'State', 'rin', 'B'), c('rin', 'FlwB', 'im', 'Flw1'),
      c('fuel', 'out', 'eng', 'FuelMassCmd'), c('soi', 'out', 'eng', 'MainSOI'), c('spd', 'out', 'eng', 'EngSpd'),
      c('im', 'State', 'eng', 'Intk'), c('em', 'State', 'eng', 'Exh'), c('eng', 'IntkFlw', 'im', 'Flw2'), c('eng', 'ExhFlw', 'em', 'Flw1'),
      c('em', 'State', 'rout', 'A'), c('sink', 'State', 'rout', 'B'), c('rout', 'FlwA', 'em', 'Flw2')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 3, fixedStep: 5e-4 } as any);
    expect(e.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const air = -(e.getSignalValue('eng', 'IntkFlw') as any).MassFlw, inFlw = (e.getSignalValue('rin', 'FlwB') as any).MassFlw;
    const exh = (e.getSignalValue('eng', 'ExhFlw') as any).MassFlw, outFlw = (e.getSignalValue('rout', 'FlwB') as any).MassFlw;
    rel(inFlw, air, 1e-5);
    rel(outFlw, exh, 1e-5);
    rel(exh - air, 120e-6 * 6 * 1400 / 120, 1e-9);
    expect(e.getSignalValue('eng', 'EngTrq') as number).toBeGreaterThan(0);
  }, 120_000);
});
