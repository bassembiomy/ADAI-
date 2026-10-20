// EC-01 acceptance tests: crank-angle cylinder model and the CI / SI Cylinder (Wiebe) blocks.
// Spec: docs/powertrain/engine-calibration-spec.md §1 and §2. Expected values are closed-form or computed here.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { getPowertrainSpec } from './index';
import { isBus } from '../bus/busCore';
import { cylinderVolume, wiebeFraction, chenFlynnFmep, douaudEyzatTau, runEngineCycle, type EngineGeometry, type CycleOptions } from './engineCycle';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1e-12, Math.abs(b)));
const G: EngineGeometry = { B: 0.084, S: 0.09, L: 0.145, CR: 16.5, Ncyl: 4, IVC: -160, EVO: 130 };
const O: CycleOptions = { LHV: 43e6, aw: 5, mw: 2, gamma: 1.35, R: 287, etaComb: 1, etaTrap: 1, wallHeat: 'Woschni', Twall: 450, dTheta: 0.5,
  cf: { A: 0.25e5, B: 0.005, C: 0.09e5, D: 0.0009e5 }, afrStoich: 14.5, cpB: 1400, ON: 95 };
const Vd = Math.PI * G.B ** 2 * G.S / 4;
const Vc = Vd / (G.CR - 1);

describe('engine cycle building blocks', () => {
  it('cylinder volume: Vc at TDC, Vc + Vd at BDC, slider-crank in between', () => {
    rel(cylinderVolume(G, 0), Vc, 1e-12);
    rel(cylinderVolume(G, 180), Vc + Vd, 1e-12);
    rel(cylinderVolume(G, -180), Vc + Vd, 1e-12);
    const a = G.S / 2, th = 60 * Math.PI / 180;
    rel(cylinderVolume(G, 60), Vc + Math.PI * G.B ** 2 / 4 * (G.L + a - a * Math.cos(th) - Math.sqrt(G.L ** 2 - (a * Math.sin(th)) ** 2)), 1e-12);
  });

  it('Wiebe fraction: 0 before start, 1 - e^-a at the end, monotone', () => {
    expect(wiebeFraction(-10, -5, 40, 5, 2)).toBe(0);
    rel(wiebeFraction(35, -5, 40, 5, 2), 1 - Math.exp(-5), 1e-14);
    rel(wiebeFraction(100, -5, 40, 5, 2), 1 - Math.exp(-5), 1e-14);
    rel(wiebeFraction(15, -5, 40, 5, 2), 1 - Math.exp(-5 * 0.5 ** 3), 1e-14);
    let prev = 0;
    for (let th = -5; th <= 35; th += 1) { const x = wiebeFraction(th, -5, 40, 5, 2); expect(x).toBeGreaterThanOrEqual(prev); prev = x; }
  });

  it('Chen-Flynn friction is A + B*Pmax + C*Sp + D*Sp^2', () => {
    const Sp = 2 * 0.09 * 2000 / 60;
    rel(chenFlynnFmep({ A: 0.25e5, B: 0.005, C: 0.09e5, D: 0.0009e5 }, 80e5, Sp), 0.25e5 + 0.005 * 80e5 + 0.09e5 * Sp + 0.0009e5 * Sp * Sp, 1e-14);
  });

  it('Douaud-Eyzat ignition delay', () => {
    rel(douaudEyzatTau(95, 30e5, 800), 17.68e-3 * Math.pow(0.95, 3.402) * Math.pow(30e5 / 101325, -1.7) * Math.exp(3800 / 800), 1e-14);
  });
});

describe('runEngineCycle closed-form checks', () => {
  const motored = { N: 2000, mf: 0, theta0: 0, dThetaComb: 40, Pivc: 1e5, Tivc: 300, Pexh: 1e5 };
  const symGeom = { ...G, IVC: -180, EVO: 180 };

  it('motored adiabatic compression: p at TDC = p_IVC (V_IVC/V_TDC)^gamma and zero net work', () => {
    const r = runEngineCycle(symGeom, motored, { ...O, wallHeat: 'Adiabatic' }, { trace: true });
    const pTdc = r.trace!.find(s => Math.abs(s.theta) < 1e-9)!.p;
    rel(pTdc, 1e5 * Math.pow((Vc + Vd) / Vc, 1.35), 1e-7);
    expect(Math.abs(r.imepGross)).toBeLessThan(1e-6 * 1e5);
    rel(r.pMax, pTdc, 1e-12);
  });

  it('ideal Otto efficiency 1 - CR^(1-gamma) with near-instant combustion at TDC', () => {
    const r = runEngineCycle(symGeom, { ...motored, mf: 20e-6, theta0: -0.25, dThetaComb: 0.5 }, { ...O, wallHeat: 'Adiabatic', aw: 20, dTheta: 0.01 });
    rel(r.etaTh, 1 - Math.pow(G.CR, 1 - 1.35), 0.01);
  });

  it('torque, power, BSFC and exhaust temperature follow their definitions from the cycle results', () => {
    const op = { N: 2000, mf: 30e-6, theta0: -1, dThetaComb: 50, Pivc: 1.8e5, Tivc: 320, Pexh: 2.0e5 };
    const r = runEngineCycle(G, op, O);
    rel(r.imep, r.imepGross - (2.0e5 - 1.8e5), 1e-12);
    const Sp = 2 * G.S * 2000 / 60;
    rel(r.fmep, chenFlynnFmep(O.cf, r.pMax, Sp), 1e-12);
    rel(r.bmep, r.imep - r.fmep, 1e-12);
    rel(r.Tbrake, r.bmep * Vd * G.Ncyl / (4 * Math.PI), 1e-12);
    rel(r.Pbrake, r.Tbrake * 2 * Math.PI * 2000 / 60, 1e-12);
    rel(r.bsfc, 3.6e9 * (30e-6 * G.Ncyl * 2000 / 120) / r.Pbrake, 1e-12);
    rel(r.Texh, r.TEVO * Math.pow(2.0e5 / r.pEVO, 0.35 / 1.35), 1e-12);
  });

  it('a 2.0 L diesel at 2000 rpm and 30 mg/stroke gives realistic values (Woschni wall heat)', () => {
    const r = runEngineCycle(G, { N: 2000, mf: 30e-6, theta0: -1, dThetaComb: 50, Pivc: 1.8e5, Tivc: 320, Pexh: 2.0e5 }, O);
    expect(r.bmep / 1e5).toBeGreaterThan(8); expect(r.bmep / 1e5).toBeLessThan(14);
    expect(r.bsfc).toBeGreaterThan(185); expect(r.bsfc).toBeLessThan(235);
    expect(r.pMax / 1e5).toBeGreaterThan(60); expect(r.pMax / 1e5).toBeLessThan(120);
    expect(r.Texh).toBeGreaterThan(650); expect(r.Texh).toBeLessThan(900);
    expect(r.noxGPerKWh).toBeGreaterThan(0);
  });

  it('wall heat lowers efficiency and peak pressure', () => {
    const op = { N: 2000, mf: 30e-6, theta0: -1, dThetaComb: 50, Pivc: 1.8e5, Tivc: 320, Pexh: 2.0e5 };
    const w = runEngineCycle(G, op, O), ad = runEngineCycle(G, op, { ...O, wallHeat: 'Adiabatic' });
    expect(w.etaTh).toBeLessThan(ad.etaTh);
    expect(w.pMax).toBeLessThan(ad.pMax);
  });

  it('advancing combustion raises peak pressure and NOx and lowers BSFC (trend)', () => {
    const at = (soi: number) => runEngineCycle(G, { N: 2000, mf: 30e-6, theta0: -soi + 5, dThetaComb: 50, Pivc: 1.8e5, Tivc: 320, Pexh: 2.0e5 }, O);
    const r = [5, 10, 15, 20].map(at);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].pMax).toBeGreaterThan(r[i - 1].pMax);
      expect(r[i].noxGPerKWh).toBeGreaterThan(r[i - 1].noxGPerKWh);
    }
    expect(r[2].bsfc).toBeLessThan(r[0].bsfc);
  });

  it('knock index grows with spark advance and with lower octane (SI)', () => {
    const si: EngineGeometry = { B: 0.086, S: 0.086, L: 0.145, CR: 10.5, Ncyl: 4, IVC: -140, EVO: 130 };
    const opt = { ...O, LHV: 44e6, afrStoich: 14.7 };
    const at = (sa: number, ON: number) => runEngineCycle(si, { N: 2000, mf: 25e-6, theta0: -sa + 5, dThetaComb: 45, Pivc: 0.95e5, Tivc: 310, Pexh: 1.05e5 }, { ...opt, ON });
    expect(at(30, 95).knockIndex).toBeGreaterThan(at(15, 95).knockIndex);
    expect(at(25, 85).knockIndex).toBeGreaterThan(at(25, 98).knockIndex);
    expect(at(10, 95).knockIndex).toBeGreaterThanOrEqual(0);
  });
});

describe('PT_CI_CYLINDER block', () => {
  it('ports, units and spec reference', () => {
    const s = getPowertrainSpec('PT_CI_CYLINDER')!;
    expect(s.source).toBe('user-spec');
    expect(s.category).toBe('Powertrain / Engine Calibration / Engine Plant');
    const b = BLOCK_LIBRARY.PT_CI_CYLINDER('c', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['N', 'rpm'], ['m_f', 'mg'], ['SOI', 'deg'], ['dTheta_comb', 'deg'], ['dTheta_id', 'deg'],
      ['P_map', 'Pa'], ['T_map', 'K'], ['P_exh', 'Pa']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['T_brake', 'N*m'], ['IMEP', 'Pa'], ['FMEP', 'Pa'], ['BSFC', 'g/(kW*h)'],
      ['T_exh', 'K'], ['P_max', 'Pa'], ['NOx', 'g/(kW*h)']]);
    for (const k of ['B', 'S', 'L', 'Ncyl', 'CR', 'IVC', 'EVO', 'LHV', 'aw', 'mw', 'gamma', 'wallHeat', 'Twall', 'dTheta', 'cfA', 'cfB', 'cfC', 'cfD']) expect(b.params, k).toHaveProperty(k);
  });

  it('outputs equal runEngineCycle for the same operating point (theta0 = -SOI + ignition delay)', () => {
    const b = BLOCK_LIBRARY.PT_CI_CYLINDER('c', {});
    const r = b.execute([2000, 30, 6, 50, 5, 1.8e5, 320, 2.0e5], b.params, b.state, 0);
    expect(r.error).toBeUndefined();
    const p = b.params as any;
    const ref = runEngineCycle({ B: p.B, S: p.S, L: p.L, CR: p.CR, Ncyl: p.Ncyl, IVC: p.IVC, EVO: p.EVO },
      { N: 2000, mf: 30e-6, theta0: -6 + 5, dThetaComb: 50, Pivc: 1.8e5, Tivc: 320, Pexh: 2.0e5 },
      { LHV: p.LHV, aw: p.aw, mw: p.mw, gamma: p.gamma, R: p.R, etaComb: p.etaComb, etaTrap: p.etaTrap, wallHeat: p.wallHeat, Twall: p.Twall,
        dTheta: p.dTheta, cf: { A: p.cfA, B: p.cfB, C: p.cfC, D: p.cfD }, afrStoich: p.afrStoich, cpB: p.cpB, ON: 95 });
    const o = (id: string) => r.outputs[b.outputs.findIndex(x => x.id === id)] as number;
    rel(o('T_brake'), ref.Tbrake, 1e-12); rel(o('BSFC'), ref.bsfc, 1e-12); rel(o('P_max'), ref.pMax, 1e-12);
    rel(o('T_exh'), ref.Texh, 1e-12); rel(o('IMEP'), ref.imep, 1e-12); rel(o('FMEP'), ref.fmep, 1e-12); rel(o('NOx'), ref.noxGPerKWh, 1e-12);
    const info = r.outputs[0] as any;
    expect(isBus(info)).toBe(true);
    for (const k of ['BMEP', 'IMEP_gross', 'PMEP', 'P_brake', 'eta_th', 'thetaPmax', 'FuelFlw']) expect(info, k).toHaveProperty(k);
  });

  it('a stopped engine (N <= 0) gives zero torque and power without an error', () => {
    const b = BLOCK_LIBRARY.PT_CI_CYLINDER('c', {});
    const r = b.execute([0, 30, 6, 50, 5, 1.8e5, 320, 2.0e5], b.params, b.state, 0);
    expect(r.error).toBeUndefined();
    expect(r.outputs[1]).toBe(0);
    for (const v of r.outputs.slice(1)) expect(Number.isFinite(v as number)).toBe(true);
  });

  it('invalid geometry is a block error (connecting rod shorter than the crank radius)', () => {
    const b = BLOCK_LIBRARY.PT_CI_CYLINDER('c', { L: 0.04, S: 0.09 });
    expect(b.execute([2000, 30, 6, 50, 5, 1.8e5, 320, 2.0e5], b.params, b.state, 0).error).toMatch(/L/);
  });
});

describe('PT_SI_CYLINDER block', () => {
  it('ports, units and the two fuel-input modes', () => {
    const s = getPowertrainSpec('PT_SI_CYLINDER')!;
    expect(s.source).toBe('user-spec');
    const b = BLOCK_LIBRARY.PT_SI_CYLINDER('s', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['N', 'rpm'], ['SA', 'deg'], ['mdot_air', 'kg/s'], ['mdot_fuel', 'kg/s'], ['lambda', '1'],
      ['P_map', 'Pa'], ['T_map', 'K'], ['P_exh', 'Pa']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['T_brake', 'N*m'], ['BSFC', 'g/(kW*h)'], ['eta_th', '%'], ['T_exh', 'K'],
      ['KnockIndex', '1'], ['KnockMargin', '1'], ['P_max', 'Pa'], ['NOx', 'g/(kW*h)']]);
    expect(b.params.fuelInput).toBe('mdot_fuel');
    expect(b.params.AFR_stoich).toBe(14.7);
  });

  it('lambda mode burns mdot_air/(AFR*lambda); at lambda = 1 both modes agree', () => {
    const N = 3000, mair = 0.03, Ncyl = 4;
    const bf = BLOCK_LIBRARY.PT_SI_CYLINDER('a', {});
    const bl = BLOCK_LIBRARY.PT_SI_CYLINDER('b', { fuelInput: 'lambda' });
    const ins = (mfuel: number, lam: number) => [N, 20, mair, mfuel, lam, 0.9e5, 310, 1.05e5];
    const rf = bf.execute(ins(mair / 14.7, 0), bf.params, bf.state, 0);
    const rl = bl.execute(ins(0, 1), bl.params, bl.state, 0);
    rel(rl.outputs[1] as number, rf.outputs[1] as number, 1e-12);
    expect((rf.outputs[0] as any).m_f_mg).toBeCloseTo(mair / 14.7 * 120 / (N * Ncyl) * 1e6, 9);
    const rich = bl.execute(ins(0, 0.9), bl.params, bl.state, 0);
    expect((rich.outputs[0] as any).m_f_mg).toBeCloseTo(mair / (14.7 * 0.9) * 120 / (N * Ncyl) * 1e6, 9);
  });

  it('knock margin is clamp(1 - KnockIndex, 0, 1)', () => {
    const b = BLOCK_LIBRARY.PT_SI_CYLINDER('s', {});
    for (const sa of [5, 20, 40]) {
      const r = b.execute([2000, sa, 0.025, 0.025 / 14.7, 1, 0.95e5, 310, 1.05e5], b.params, b.state, 0);
      const ki = r.outputs[5] as number, km = r.outputs[6] as number;
      rel(km, Math.min(1, Math.max(0, 1 - ki)), 1e-15);
    }
  });
});
