// WP-24 acceptance tests: CI Controller (Powertrain Blockset / Propulsion / Combustion Engine Controllers / CI Controller),
// MR-PLD style calibration tables (all linear / bilinear, clipped; N = EngSpd*30/pi [rpm], boost in bar abs = BoostPrs/1e5):
//   F_dem   = f_fuel_cmd(N, TrqCmd)            [mg]  torque request -> fuel quantity          (SpdBp x TrqBp)
//   F_full  = f_fuel_max(N)                    [mg]  map 7 full-load fuel limit               (SpdBp)
//   F_smoke = f_fuel_smoke(N, boost)           [mg]  map 6 smoke limiter                      (SpdBp x BoostBp)
//   FuelMassCmd = max(0, min(F_dem, F_full, F_smoke)); TrqCmd <= 0 -> 0 (overrun fuel cut)
//   LimitActive = 0 demand, 1 full load, 2 smoke (the smallest wins; ties: demand, then full load)
//   MainSOI = f_main_soi(N, F)                 [deg BTDC] map 1                               (SpdBp x FuelBp)
//   InjDur  = f_inj_dur(N, F)                  [ms]  map 3 injection duration (Info)          (SpdBp x FuelBp)
//   WgArea  = f_wg_area(N, F)                  [m^2] wastegate area command                    (SpdBp x FuelBp)
//   Info: FuelDemand, FuelFullLoad, FuelSmoke, LimitActive, InjDur, TqMax = f_tq_max(N) (map 7 torque curve).
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { getPowertrainSpec } from './index';

const P = {
  SpdBp: [1000, 2000], TrqBp: [0, 2000], FuelBp: [0, 200], BoostBp: [1, 3],
  f_fuel_cmd: [[0, 200], [0, 180]], f_fuel_max: [190, 170], f_fuel_smoke: [[80, 240], [90, 260]],
  f_main_soi: [[4, 10], [8, 16]], f_inj_dur: [[0, 3], [0, 2]], f_wg_area: [[0, 4e-4], [2e-4, 8e-4]], f_tq_max: [2000, 1800],
};
const exec = (trq: number, rpm: number, boost: number, p: any = P) => {
  const b = BLOCK_LIBRARY.PT_CI_CONTROLLER('x', p);
  return b.execute([trq, rpm * Math.PI / 30, boost * 1e5], b.params, b.state, 0).outputs as any[];
};
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(b)));

describe('CI Controller', () => {
  it('Simulink path and ports', () => {
    expect(getPowertrainSpec('PT_CI_CONTROLLER')!.simulinkPath).toBe('Powertrain Blockset/Propulsion/Combustion Engine Controllers/CI Controller');
    const b = BLOCK_LIBRARY.PT_CI_CONTROLLER('x', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['TrqCmd', 'N*m'], ['EngSpd', 'rad/s'], ['BoostPrs', 'Pa']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['FuelMassCmd', 'mg'], ['MainSOI', 'deg'], ['WgArea', 'm^2']]);
  });

  it('demand-limited point: fuel from the torque map, SOI / duration / wastegate from the quantity', () => {
    const o = exec(1000, 1500, 2.5);
    const F = (100 + 90) / 2; // f_fuel_cmd at (1500 rpm, 1000 N*m)
    close(o[1], F);
    close(o[2], 4 + (10 - 4) * F / 200 + ((8 + (16 - 8) * F / 200) - (4 + (10 - 4) * F / 200)) * 0.5);
    close(o[0].InjDur, (3 * F / 200 + 2 * F / 200) / 2);
    close(o[3], (4e-4 * F / 200 + (2e-4 + 6e-4 * F / 200)) / 2);
    expect(o[0].LimitActive).toBe(0);
    close(o[0].TqMax, 1900);
  });

  it('full-load and smoke limits cap the fuel; overrun cuts it', () => {
    const full = exec(2000, 1500, 3);          // demand 190, full load 180, smoke 250
    close(full[1], 180); expect(full[0].LimitActive).toBe(1);
    const smoke = exec(2000, 1500, 1.5);       // smoke at 1.5 bar: 85 + (250 - 85) * 0.25 = 126.25
    close(smoke[1], 126.25); expect(smoke[0].LimitActive).toBe(2);
    close(smoke[0].FuelSmoke, 126.25); close(smoke[0].FuelFullLoad, 180); close(smoke[0].FuelDemand, 190);
    expect(exec(-50, 1500, 2)[1]).toBe(0);
  });
});
