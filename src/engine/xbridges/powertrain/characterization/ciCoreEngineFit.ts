// WP-27b plant characterisation: fits the mean value CI Core Engine tables (PT_CI_CORE_ENGINE) from sweeps of the
// crank-angle CI Cylinder, which plays the role of the detailed engine simulation. Pure and deterministic.
//   f_soi_opt(N,F) = SOI of maximum IMEP_gross (parabola through the best sample and its neighbours, clipped to SoiBp)
//   f_tqinr = IMEP_gross(SOI_opt) Vd/(4 pi), f_tqf = FMEP(SOI_opt) Vd/(4 pi) (Vd = whole engine)
//   f_eff_soi, f_nox_soi, f_pmax_soi = means over fuelled (N,F) of the ratio at SOI_opt + dSOI to the value at SOI_opt
//   f_exh_frac = cp_exh (m_air + m_f)(T_exh - T)/(m_f LHV), f_nv(N) = mean over F of m_air/(P Vd_cyl/(R T))
//   F = 0 (motoring): f_tqinr = 0, every other table copies the first fuelled column.
// References: Heywood 1988 (ICE Fundamentals); Guzzella and Onder 2010 (mean value engine model).
import type { XBus } from '../../types';
import { ENGINE_CYLINDER_BLOCKS } from '../blocks/engineCylinders';

export interface CiCharacterizationOpts {
  cylinder: Record<string, any> & { B: number; S: number; L: number; Ncyl: number; CR: number; dTheta: number; dTheta_comb: number; dTheta_id: number };
  SpdBp: number[];
  FuelBp: number[];
  SoiBp: number[];
  SoiDevBp: number[];
  intake: (N: number, F: number) => { P: number; T: number };
  cp_exh?: number;
  cp_air?: number;
}

const cylFactory = ENGINE_CYLINDER_BLOCKS.find(b => b.spec.type === 'PT_CI_CYLINDER')!.factory;

interface Pt { imep: number; fmep: number; texh: number; pmax: number; nox: number; lambda: number }

const strictlyIncreasing = (v: number[]): boolean => v.length >= 1 && v.every((x, i) => Number.isFinite(x) && (i === 0 || x > v[i - 1]));
const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;

/** Vertex of the parabola through three points; null when it is not a maximum. */
function parabolaMax(x: number[], y: number[]): number | null {
  const [x0, x1, x2] = x, [y0, y1, y2] = y;
  const d01 = (y1 - y0) / (x1 - x0), d12 = (y2 - y1) / (x2 - x1);
  const a = (d12 - d01) / (x2 - x0);
  if (!(a < 0)) return null;
  const b = d01 - a * (x0 + x1);
  return -b / (2 * a);
}

export function characterizeCiCoreEngine(opts: CiCharacterizationOpts): Record<string, any> {
  const { cylinder, SpdBp, FuelBp, SoiBp, SoiDevBp, intake } = opts;
  if (!strictlyIncreasing(SpdBp) || !strictlyIncreasing(FuelBp) || !strictlyIncreasing(SoiBp) || !strictlyIncreasing(SoiDevBp)) {
    throw new Error('characterizeCiCoreEngine: SpdBp, FuelBp, SoiBp and SoiDevBp must be finite and strictly increasing');
  }
  if (SoiBp.length < 1) throw new Error('characterizeCiCoreEngine: SoiBp is empty');
  const cp_exh = opts.cp_exh ?? 1150, cp_air = opts.cp_air ?? 1005;
  if (!(cp_exh > 0) || !(cp_air > 0)) throw new Error('characterizeCiCoreEngine: cp_exh and cp_air must be > 0');
  const { dTheta_comb, dTheta_id, ...cylParams } = cylinder;
  const blk = cylFactory('ptfit_cyl', cylParams);
  const p = blk.params as Record<string, any>;
  const Ncyl: number = p.Ncyl, R: number = p.R, LHV: number = p.LHV, AFRst: number = p.afrStoich;
  const Vd = Ncyl * Math.PI / 4 * p.B * p.B * p.S;
  const VdCyl = Vd / Ncyl;
  const nF = FuelBp.length, nS = SpdBp.length;
  const first = FuelBp.findIndex(f => f > 0);
  if (first < 0) throw new Error('characterizeCiCoreEngine: FuelBp needs at least one fuelled breakpoint (> 0)');
  if (FuelBp.slice(0, first).some(f => f !== 0)) throw new Error('characterizeCiCoreEngine: FuelBp may only have F = 0 (motoring) below the fuelled breakpoints');

  const run = (N: number, F: number, soi: number): Pt => {
    const { P, T } = intake(N, F);
    const r = blk.execute([N, F, soi, dTheta_comb, dTheta_id, P, T, P], blk.params, blk.state, 0);
    if (r.error) throw new Error(`characterizeCiCoreEngine: CI Cylinder at N=${N} F=${F} SOI=${soi}: ${r.error}`);
    const o = r.outputs as any[];
    const info = o[0] as XBus;
    const pt: Pt = { imep: info.IMEP_gross as number, fmep: o[3], texh: o[5], pmax: o[6], nox: o[7], lambda: info.Lambda as number };
    for (const v of Object.values(pt)) if (!Number.isFinite(v)) throw new Error(`characterizeCiCoreEngine: non-finite cylinder output at N=${N} F=${F} SOI=${soi}`);
    return pt;
  };

  const zeros = (): number[][] => SpdBp.map(() => FuelBp.map(() => 0));
  const tq = zeros(), tqf = zeros(), soiOpt = zeros(), exh = zeros(), nox = zeros(), pmr = zeros();
  const nv: number[] = [];
  const effS = SoiDevBp.map(() => [] as number[]), noxS = SoiDevBp.map(() => [] as number[]), pmS = SoiDevBp.map(() => [] as number[]);
  const lo = SoiBp[0], hi = SoiBp[SoiBp.length - 1];

  for (let i = 0; i < nS; i++) {
    const N = SpdBp[i];
    const nvs: number[] = [];
    for (let j = first; j < nF; j++) {
      const F = FuelBp[j];
      const { P, T } = intake(N, F);
      const samples = SoiBp.map(s => run(N, F, s));
      let best = 0;
      samples.forEach((s, k) => { if (s.imep > samples[best].imep) best = k; });
      let so = SoiBp[best];
      if (best > 0 && best < SoiBp.length - 1) {
        const v = parabolaMax(SoiBp.slice(best - 1, best + 2), samples.slice(best - 1, best + 2).map(s => s.imep));
        if (v !== null) so = Math.min(hi, Math.max(lo, v));
      }
      const o = run(N, F, so);
      const mf = F * 1e-6, ma = o.lambda * AFRst * mf;
      tq[i][j] = o.imep * Vd / (4 * Math.PI);
      tqf[i][j] = o.fmep * Vd / (4 * Math.PI);
      soiOpt[i][j] = so;
      exh[i][j] = cp_exh * (ma + mf) * (o.texh - T) / (mf * LHV);
      nox[i][j] = o.nox;
      pmr[i][j] = o.pmax / P;
      nvs.push(ma / (P * VdCyl / (R * T)));
      SoiDevBp.forEach((d, k) => {
        const s = d === 0 ? o : run(N, F, so + d);
        if (o.imep > 0) effS[k].push(Math.min(1, s.imep / o.imep)); // SOI_opt is the maximum of the table domain: ratios above 1 (optimum at the SoiBp end) are capped
        if (o.nox > 0) noxS[k].push(s.nox / o.nox);
        if (o.pmax > 0) pmS[k].push(s.pmax / o.pmax);
      });
    }
    nv.push(mean(nvs));
    for (let j = 0; j < first; j++) {
      tq[i][j] = 0;
      for (const t of [tqf, soiOpt, exh, nox, pmr]) t[i][j] = t[i][first];
      tqf[i][j] = tqf[i][first];
    }
  }
  const avg = (a: number[][], name: string): number[] => a.map(v => {
    if (v.length === 0) throw new Error(`characterizeCiCoreEngine: no valid samples for ${name}`);
    return mean(v);
  });

  return {
    Ncyl, Vd, R, cp_air, cp_exh, AFRst, LHV,
    SpdBp: [...SpdBp], FuelBp: [...FuelBp], SoiDevBp: [...SoiDevBp],
    f_tqinr: tq, f_tqf: tqf, f_soi_opt: soiOpt, f_eff_soi: avg(effS, 'f_eff_soi'),
    f_exh_frac: exh, f_nox: nox, f_nox_soi: avg(noxS, 'f_nox_soi'),
    f_pmax_ratio: pmr, f_pmax_soi: avg(pmS, 'f_pmax_soi'), f_nv: nv,
  };
}

const range = (a: number, b: number, s: number): number[] => { const o: number[] = []; for (let x = a; x <= b + 1e-9; x += s) o.push(x); return o; };

export const OM501_LA_CHARACTERIZATION_OPTS: CiCharacterizationOpts = {
  cylinder: { B: 0.13, S: 0.15, L: 0.26, Ncyl: 6, CR: 17.25, dTheta: 2, dTheta_comb: 60, dTheta_id: 6, etaTrap: 0.88 },
  SpdBp: [600, 800, 1000, 1200, 1400, 1600, 1800, 2000],
  FuelBp: [0, 25, 50, 75, 100, 125, 150, 175, 200],
  SoiBp: range(0, 36, 3), // wide enough to contain the optimum (60 deg burn -> about 25-30 deg BTDC)
  SoiDevBp: [-15, -10, -5, 0, 5, 10],
  intake: (_N, F) => ({ P: Math.min(2.8e5, 1e5 + 1.5e5 * F / 185), T: 320 }),
};

let om501Cache: Record<string, any> | null = null;
/** Memoised OM 501 LA CI Core Engine parameter set from the crank-angle cylinder. Callers must not mutate it. */
export function om501LaCoreEngineParams(): Record<string, any> {
  if (!om501Cache) om501Cache = characterizeCiCoreEngine(OM501_LA_CHARACTERIZATION_OPTS);
  return om501Cache;
}
