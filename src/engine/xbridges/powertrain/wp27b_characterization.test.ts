// WP-27b acceptance tests: plant characterisation (characterization/ciCoreEngineFit.ts). The crank-angle CI Cylinder plays
// the role of a detailed engine simulation (GT-POWER in the MathWorks workflow); its sweeps give the CI Core Engine tables.
//   characterizeCiCoreEngine({ cylinder, SpdBp, FuelBp, SoiBp, SoiDevBp, intake, T_exh_guess? }) -> PT_CI_CORE_ENGINE params
//   For every (N, F > 0) the cylinder runs at every absolute SOI in SoiBp with the nominal intake state intake(N, F) =
//   { P, T } and P_exh = P (no pumping):
//     f_soi_opt(N, F)  = SOI of maximum IMEP_gross (parabola through the best sample and its neighbours, clipped to SoiBp)
//     f_tqinr(N, F)    = IMEP_gross(SOI_opt) * Vd / (4*pi)        f_tqf(N, F) = FMEP(SOI_opt) * Vd / (4*pi)
//     f_eff_soi(dSOI)  = mean over (N, F) of IMEP_gross(SOI_opt + dSOI) / IMEP_gross(SOI_opt)   (cylinder re-run at each dSOI)
//     f_nox(N, F), f_nox_soi(dSOI) ; f_pmax_ratio(N, F) = P_max/P, f_pmax_soi(dSOI) ; all ratios averaged likewise
//     f_exh_frac(N, F) = cp_exh*(m_air + m_f)*(T_exh - T)/(m_f*LHV), m_air = Lambda*AFRst*m_f (per cycle)
//     f_nv(N)          = mean over F of m_air / (P*Vd_cyl/(R*T))
//   F = 0 (motoring): f_tqinr = 0; all other tables copy the first fuelled column.
//   Geometry and fuel constants (Ncyl, Vd, LHV, AFRst) are passed through to the core engine parameters.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { makeBus } from '../bus/busCore';
import { characterizeCiCoreEngine } from './characterization/ciCoreEngineFit';

const cylinder = { B: 0.13, S: 0.15, L: 0.26, Ncyl: 6, CR: 17.25, dTheta: 2, dTheta_comb: 60, dTheta_id: 6 };
const intake = (N: number, F: number) => ({ P: 1e5 + 1.4e5 * F / 185, T: 320 });
const opts = { cylinder, SpdBp: [800, 1400, 2000], FuelBp: [0, 60, 120, 180], SoiBp: [0, 4, 8, 12, 16, 20, 24], SoiDevBp: [-12, -6, 0, 6], intake };
const st = (Prs: number, Temp: number) => makeBus(['Prs', 'Temp'], [Prs, Temp]);

describe('CI Core Engine characterisation from the crank-angle cylinder', () => {
  const params = characterizeCiCoreEngine(opts);
  const core = BLOCK_LIBRARY.PT_CI_CORE_ENGINE('core', params);
  const cyl = BLOCK_LIBRARY.PT_CI_CYLINDER('cyl', { B: 0.13, S: 0.15, L: 0.26, Ncyl: 6, CR: 17.25, dTheta: 2 });
  const compare = (N: number, F: number, soi: number) => {
    const { P, T } = intake(N, F);
    const c = cyl.execute([N, F, soi, 60, 6, P, T, P], cyl.params, cyl.state, 0).outputs as any[];
    const m = core.execute([F, soi, N * Math.PI / 30, st(P, T), st(P, 800)], core.params, core.state, 0).outputs as any[];
    return { cyl: { T: c[1] as number, Texh: c[5] as number, NOx: c[7] as number }, core: { T: m[1] as number, Texh: m[0].T_exh as number, NOx: m[0].NOx as number } };
  };

  it('returns a complete, valid parameter set with the geometry passed through', () => {
    expect([params.Ncyl, params.SpdBp, params.FuelBp, params.SoiDevBp]).toEqual([6, [800, 1400, 2000], [0, 60, 120, 180], [-12, -6, 0, 6]]);
    expect(Math.abs(params.Vd - 6 * Math.PI / 4 * 0.13 ** 2 * 0.15) / params.Vd).toBeLessThan(1e-12);
    expect(params.f_tqinr.map((r: number[]) => r[0])).toEqual([0, 0, 0]);
    for (const r of params.f_tqinr) for (let j = 1; j < r.length; j++) expect(r[j]).toBeGreaterThan(r[j - 1]);
    expect(Math.max(...params.f_eff_soi)).toBeLessThanOrEqual(1.0001);
    expect(core.execute([120, 10, 1400 * Math.PI / 30, st(2e5, 320), st(2e5, 800)], core.params, core.state, 0).error).toBeUndefined();
  });

  it('reproduces the cylinder at grid points with optimal SOI (torque 2 %, exhaust temperature 3 %)', () => {
    for (const [N, F] of [[800, 120], [1400, 60], [1400, 180], [2000, 120]]) {
      const soi = params.f_soi_opt[[800, 1400, 2000].indexOf(N)][[0, 60, 120, 180].indexOf(F)];
      const r = compare(N, F, soi);
      expect(Math.abs(r.core.T - r.cyl.T) / r.cyl.T, `T ${N}/${F}`).toBeLessThan(0.02);
      expect(Math.abs(r.core.Texh - r.cyl.Texh) / r.cyl.Texh, `Texh ${N}/${F}`).toBeLessThan(0.03);
    }
  });

  it('follows the cylinder off the grid and off the optimal SOI (torque 6 %, NOx trend)', () => {
    const a = compare(1100, 90, 6), b = compare(1100, 90, 18);
    for (const r of [a, b]) expect(Math.abs(r.core.T - r.cyl.T) / r.cyl.T).toBeLessThan(0.06);
    expect(Math.sign(b.core.NOx - a.core.NOx)).toBe(Math.sign(b.cyl.NOx - a.cyl.NOx));
  });
}, 300_000);
