// Powertrain Blockset / Propulsion / Combustion Engine Controllers / CI Controller.
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { lookupNd, validateBreakpoints, validateTable, radps2rpm } from '../ptMath';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const CLIP = { interp: 'linear', extrap: 'clip' } as const;

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });

// ---------------------------------------------------------------- placeholder OM 501 LA calibration
// OM 501 LA: 11.95 L V6 turbocharged diesel, about 185 mg/stroke at full load.
const SPD_BP = [600, 800, 1000, 1200, 1400, 1600, 1800, 2000];
const TRQ_BP = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400];
const FUEL_BP = [0, 25, 50, 75, 100, 125, 150, 175, 200];
const BOOST_BP = [1, 1.5, 2, 2.5, 3, 3.5];
const VD = 11.95e-3;
const NM_PER_MG = 9.5;
const round = (x: number, d = 4) => Number(x.toFixed(d));
const fricTrq = (N: number) => ((0.9e5 + 0.2e5 * Math.pow(N / 1000, 1.5)) * VD) / (4 * Math.PI);
const FUEL_MAX = [165, 178, 185, 185, 185, 178, 165, 150];
const TQ_MAX = [1700, 1900, 2000, 2000, 2000, 1950, 1800, 1650];
const grid = (rows: number[], cols: number[], f: (r: number, c: number) => number) =>
  rows.map(r => cols.map(c => round(f(r, c), 6)));
const DEF_FUEL_CMD = grid(SPD_BP, TRQ_BP, (N, T) => Math.min(200, Math.max(0, (T + fricTrq(N)) / NM_PER_MG)));
// Air per stroke at the boost pressure (volumetric efficiency 0.92, 320 K), mg, over lambda 1.3 and AFR 14.5.
const smokeFuel = (bar: number) => (0.92 * 1.99e-3 * bar * 1e5 / (287 * 320) * 1e6) / (1.3 * 14.5);
const DEF_SMOKE = grid(SPD_BP, BOOST_BP, (_N, b) => smokeFuel(b));
const sp = (N: number) => (N - 600) / 1400;
const DEF_SOI = grid(SPD_BP, FUEL_BP, (N, F) => 6 + 5 * sp(N) + 5 * F / 200);
const DEF_DUR = grid(SPD_BP, FUEL_BP, (N, F) => 3 * (F / 200) * (0.8 + 0.2 * sp(N)));
const DEF_WG = grid(SPD_BP, FUEL_BP, (N, F) => 1.5e-3 * (F / 200) * (0.4 + 0.6 * sp(N)));

const PH = 'Default values are a placeholder calibration for the OM 501 LA (11.95 L V6, about 185 mg/stroke full load); they are replaced by the calibration generated in the OM 501 LA reference application.';

const params: PtParamSpec[] = [
  { name: 'SpdBp', label: 'Engine speed breakpoints', unit: 'rpm', kind: 'vector', default: SPD_BP,
    description: `Engine speed breakpoints in rpm, strictly increasing, at least two; first axis of every map and the only axis of f_fuel_max and f_tq_max. ${PH}` },
  { name: 'TrqBp', label: 'Torque request breakpoints', unit: 'N*m', kind: 'vector', default: TRQ_BP,
    description: `Torque request breakpoints in N*m, strictly increasing, at least two; second axis of f_fuel_cmd. ${PH}` },
  { name: 'FuelBp', label: 'Fuel quantity breakpoints', unit: 'mg', kind: 'vector', default: FUEL_BP,
    description: `Fuel quantity per stroke breakpoints in mg, strictly increasing, at least two; second axis of f_main_soi, f_inj_dur and f_wg_area. ${PH}` },
  { name: 'BoostBp', label: 'Boost pressure breakpoints', unit: 'bar', kind: 'vector', default: BOOST_BP,
    description: `Absolute boost pressure breakpoints in bar, strictly increasing, at least two; second axis of f_fuel_smoke. ${PH}` },
  { name: 'f_fuel_cmd', label: 'Torque-to-fuel map', unit: 'mg', kind: 'table', default: DEF_FUEL_CMD,
    description: `Fuel quantity per stroke in mg (each value >= 0) for a torque request: the MR-PLD torque request to fuel quantity map. Size length(SpdBp) x length(TrqBp). Default F = (Trq + friction(N)) / 9.5 N*m per mg, clipped to 200 mg. ${PH}` },
  { name: 'f_fuel_max', label: 'Full-load fuel limit', unit: 'mg', kind: 'vector', default: FUEL_MAX,
    description: `Full-load fuel limit in mg (each value >= 0) over engine speed: the MR-PLD map 7 full-load fuel curve. Same length as SpdBp. Default about 185 mg at mid speed tapering to 150 mg at 2000 rpm. ${PH}` },
  { name: 'f_fuel_smoke', label: 'Smoke limiter map', unit: 'mg', kind: 'table', default: DEF_SMOKE,
    description: `Smoke-limited fuel quantity in mg (each value >= 0) over speed and boost pressure: the MR-PLD map 6 smoke limiter. Size length(SpdBp) x length(BoostBp). Default from air per stroke (0.92*1.99e-3 m^3 at the boost pressure, 320 K) at lambda 1.3 and stoichiometric AFR 14.5. ${PH}` },
  { name: 'f_main_soi', label: 'Main start of injection map', unit: 'deg', kind: 'table', default: DEF_SOI,
    description: `Main start of injection in deg before top dead centre over speed and fuel quantity: the MR-PLD map 1 main injection timing. Size length(SpdBp) x length(FuelBp). Default 6 to 16 deg BTDC. ${PH}` },
  { name: 'f_inj_dur', label: 'Injection duration map', unit: 'ms', kind: 'table', default: DEF_DUR,
    description: `Injection duration in ms (each value >= 0) over speed and fuel quantity: the MR-PLD map 3 injection duration, reported in Info. Size length(SpdBp) x length(FuelBp). Default 0 to 3 ms. ${PH}` },
  { name: 'f_wg_area', label: 'Wastegate area map', unit: 'm^2', kind: 'table', default: DEF_WG,
    description: `Wastegate opening area command in m^2 (each value >= 0) over speed and fuel quantity, opening with speed and fuel. Size length(SpdBp) x length(FuelBp). Default 0 to 1.5e-3 m^2. ${PH}` },
  { name: 'f_tq_max', label: 'Maximum torque curve', unit: 'N*m', kind: 'vector', default: TQ_MAX,
    description: `Maximum engine torque in N*m over engine speed: the MR-PLD map 7 torque curve, reported in Info as TqMax. Same length as SpdBp. Default about 2000 N*m at mid speed. ${PH}` },
];

const TABLES: [string, 'fuel' | 'spd' | 'trq' | 'boost'][] = [
  ['f_main_soi', 'fuel'], ['f_inj_dur', 'fuel'], ['f_wg_area', 'fuel'], ['f_fuel_cmd', 'trq'], ['f_fuel_smoke', 'boost'],
];
const NONNEG = ['f_fuel_cmd', 'f_fuel_max', 'f_fuel_smoke', 'f_inj_dur', 'f_wg_area'];

function check(p: Record<string, any>): string | null {
  for (const k of ['SpdBp', 'TrqBp', 'FuelBp', 'BoostBp']) {
    const e = validateBreakpoints(p[k]);
    if (e) return `${k}: ${e}`;
  }
  const axis = { fuel: p.FuelBp, trq: p.TrqBp, boost: p.BoostBp, spd: null } as Record<string, number[] | null>;
  for (const [k, a] of TABLES) {
    const e = validateTable(p[k], [p.SpdBp, axis[a] as number[]]);
    if (e) return `${k}: ${e}`;
  }
  for (const k of ['f_fuel_max', 'f_tq_max']) {
    const e = validateTable(p[k], [p.SpdBp]);
    if (e) return `${k}: ${e}`;
  }
  for (const k of NONNEG) {
    if ((p[k] as any[]).flat().some((v: number) => v < 0)) return `Parameter ${k} must be >= 0 for every element`;
  }
  return null;
}

const spec: PtBlockSpec = {
  type: 'PT_CI_CONTROLLER',
  label: 'CI Controller',
  category: 'Powertrain / Propulsion / Combustion Engine Controllers',
  simulinkPath: 'Powertrain Blockset/Propulsion/Combustion Engine Controllers/CI Controller',
  source: 'simulink-docs',
  symbol: 'engine-controller',
  inputs: [
    inp('TrqCmd', 'N*m', 1, 'Engine torque request.'),
    inp('EngSpd', 'rad/s', 2, 'Engine crankshaft speed. Converted to rpm for the map lookups.'),
    inp('BoostPrs', 'Pa', 3, 'Absolute boost (intake manifold) pressure. Converted to bar for the smoke limiter.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with FuelDemand, FuelFullLoad, FuelSmoke (mg), LimitActive (0 demand, 1 full load, 2 smoke), InjDur (ms) and TqMax (N*m).', 'Bus: CIControllerInfo'),
    out('FuelMassCmd', 'mg', 2, 'Commanded fuel mass per stroke.'),
    out('MainSOI', 'deg', 3, 'Commanded main start of injection in deg before top dead centre.'),
    out('WgArea', 'm^2', 4, 'Commanded wastegate area.'),
  ],
  params,
  states: [],
  equations: [
    'N = EngSpd*30/pi [rpm]; boost = BoostPrs/1e5 [bar abs]',
    'F_dem = f_fuel_cmd(N, TrqCmd); F_full = f_fuel_max(N); F_smoke = f_fuel_smoke(N, boost) (linear, clip)',
    'FuelMassCmd = max(0, min(F_dem, F_full, F_smoke)); TrqCmd <= 0 -> 0 (overrun fuel cut)',
    'LimitActive = 0 demand, 1 full load, 2 smoke (smallest wins; ties: demand, then full load)',
    'MainSOI = f_main_soi(N, F); InjDur = f_inj_dur(N, F); WgArea = f_wg_area(N, F); TqMax = f_tq_max(N)',
    'Default smoke map: F_smoke = 0.92*Vd*P/(R*T) / (lambda*AFRs), R = 287 J/(kg*K), T = 320 K, lambda = 1.3, AFRs = 14.5',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation: CI Controller, https://www.mathworks.com/help/autoblks/ref/cicontroller.html',
    'Guzzella & Onder, Introduction to Modeling and Control of Internal Combustion Engine Systems, 2nd ed., Springer 2010',
  ],
  description: 'Map-based controller for a compression-ignition (diesel) engine. It converts a torque request into a fuel quantity per stroke, limits it by the full-load curve and the smoke limiter, and commands the main start of injection and the wastegate area from speed and the resulting fuel quantity.',
  behavior: 'Static block with no states and direct feedthrough. Every map is interpolated linearly and held at the breakpoint ends. The fuel command is the smallest of the torque-request fuel, the full-load limit and the smoke limit, never below zero; a torque request of zero or less cuts the fuel. Info reports the three candidate quantities, which limit is active, the injection duration and the maximum torque at the current speed. The default tables are placeholders until the OM 501 LA reference application replaces them with its generated calibration.',
  example: '',
};

const factory = definePtBlock(spec, {
  execute: (ins, p) => {
    const bad = check(p);
    const fail = (m: string) => ({ outputs: [{}, 0, 0, 0], error: m });
    if (bad) return fail(bad);
    const trq = Number(ins[0] ?? 0), w = Number(ins[1] ?? 0), prs = Number(ins[2] ?? 0);
    if (!Number.isFinite(trq) || !Number.isFinite(w) || !Number.isFinite(prs)) return fail('CI Controller inputs must be finite');
    const N = radps2rpm(w), boost = prs / 1e5;
    const demand = lookupNd(p.f_fuel_cmd, [p.SpdBp, p.TrqBp], [N, trq], CLIP);
    const full = lookupNd(p.f_fuel_max, [p.SpdBp], [N], CLIP);
    const smoke = lookupNd(p.f_fuel_smoke, [p.SpdBp, p.BoostBp], [N, boost], CLIP);
    let F = 0, limit = 0;
    if (trq > 0) {
      F = demand;
      if (full < F) { F = full; limit = 1; }
      if (smoke < F) { F = smoke; limit = 2; }
      F = Math.max(0, F);
    }
    const bp = [p.SpdBp, p.FuelBp];
    const soi = lookupNd(p.f_main_soi, bp, [N, F], CLIP);
    const dur = lookupNd(p.f_inj_dur, bp, [N, F], CLIP);
    const wg = lookupNd(p.f_wg_area, bp, [N, F], CLIP);
    const tq = lookupNd(p.f_tq_max, [p.SpdBp], [N], CLIP);
    const info = makeBus(['FuelDemand', 'FuelFullLoad', 'FuelSmoke', 'LimitActive', 'InjDur', 'TqMax'], [demand, full, smoke, limit, dur, tq]);
    return { outputs: [info, F, soi, wg] };
  },
});

spec.example = 'With the default placeholder tables at 1400 rpm (146.6 rad/s) and 2.5 bar (2.5e5 Pa), a 1000 N*m request asks for about 118 mg per stroke and is below the 185 mg full-load limit and the smoke limit, so LimitActive = 0. A request of 2400 N*m asks for 200 mg, which is capped to 185 mg by the full-load curve (LimitActive = 1). A request of 0 N*m or less gives FuelMassCmd = 0.';

export const ENGINE_CONTROLLER_BLOCKS: { spec: PtBlockSpec; factory: typeof factory }[] = [{ spec, factory }];
