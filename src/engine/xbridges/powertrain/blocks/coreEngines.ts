// Powertrain Blockset / Propulsion / Combustion Engine Components / Core Engine: CI Core Engine (mean value, torque structure).
// Flow ports follow the Fundamental Flow blocks: state buses {Prs, Temp} in, flow buses {MassFlw, HeatFlw} out,
// positive INTO the neighbouring volume.
import type { XBlock, XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { lookupNd, validateBreakpoints, validateTable } from '../ptMath';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';
import { readState } from './fundamentalFlow';

const CATEGORY = 'Powertrain / Propulsion / Combustion Engine Components / Core Engine' as const;
const PATH = 'Powertrain Blockset/Propulsion/Combustion Engine Components/Core Engine/';
const CLIP = { interp: 'linear', extrap: 'clip' } as const;

const inp = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const sc = (name: string, label: string, unit: string, def: number, description: string, min?: number, minExclusive?: boolean): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}), ...(minExclusive ? { minExclusive } : {}) });
const vec = (name: string, label: string, unit: string, def: number[], description: string): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'vector', description });
const tab = (name: string, label: string, unit: string, def: number[][], description: string): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'table', description });

// ---------------------------------------------------------------- placeholder default set (OM 501 LA V6 class)
const NCYL = 6, VD = 11.95e-3, LHV = 42.6e6;
const SPD = [600, 800, 1000, 1200, 1400, 1600, 1800, 2000];
const FUEL = [0, 25, 50, 75, 100, 125, 150, 175, 200];
const SOI = [-12, -8, -4, 0, 4, 8];
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const grid = (f: (N: number, F: number) => number): number[][] => SPD.map(N => FUEL.map(F => r4(f(N, F))));
const sN = (N: number): number => (N - 600) / 1400; // 0..1 across the speed range
const sF = (F: number): number => F / 200;          // 0..1 across the fuel range

const etaI = (F: number): number => 0.46 + 0.02 * (1 - Math.abs(F - 100) / 100);
const D_TQINR = grid((_N, F) => (0.95 * F * NCYL * LHV * etaI(F)) / (4 * Math.PI * 1e6));
const fmepBar = (N: number, F: number): number => 0.9 + 0.5 * (N / 2000) + 0.6 * (N / 2000) ** 2 + 0.2 * sF(F);
const D_TQF = grid((N, F) => (fmepBar(N, F) * 1e5 * VD) / (4 * Math.PI));
const D_SOI_OPT = grid((N, F) => 8 + 6 * sN(N) + 2 * sF(F));
const D_EFF_SOI = SOI.map(d => r4(d < 0 ? 1 - (0.15 / 144) * d * d : 1 - (0.03 / 64) * d * d));
const D_EXH_FRAC = grid((N, F) => 0.28 + 0.06 * sF(F) + 0.02 * sN(N));
const D_NOX = grid((N, F) => 6 + 4 * sF(F) + 4 * sN(N));
const D_NOX_SOI = [0.55, 0.7, 0.85, 1, 1.15, 1.3];
const D_PMAX_RATIO = grid((N, F) => 45 + 20 * sF(F) + 10 * sN(N));
const D_PMAX_SOI = [0.85, 0.9, 0.95, 1, 1.07, 1.15];
const D_NV = SPD.map(N => r4(0.88 + 0.06 * Math.sin(Math.PI * sN(N))));

const PLACEHOLDER = 'Default is a placeholder set for an OM 501 LA class V6 CI engine, to be replaced by the plant characterisation (WP-27b) from the crank-angle CI Cylinder.';
const IDX2 = 'Size length(SpdBp) x length(FuelBp) (rows = speed, columns = fuel mass).';

const REF_DOCS = 'MathWorks Powertrain Blockset documentation, CI Core Engine';
const REF_HEYWOOD = 'Heywood, Internal Combustion Engine Fundamentals, McGraw-Hill 1988 (volumetric efficiency ch. 6, friction ch. 13, exhaust energy ch. 4)';
const REF_GUZZELLA = 'Guzzella and Onder, Introduction to Modeling and Control of Internal Combustion Engine Systems, 2nd ed., Springer 2010, ch. 2 and 3 (mean value engine model)';

const spec: PtBlockSpec = {
  type: 'PT_CI_CORE_ENGINE',
  label: 'CI Core Engine',
  category: CATEGORY,
  simulinkPath: PATH + 'CI Core Engine',
  source: 'simulink-docs',
  symbol: 'engine-core',
  inputs: [
    inp('FuelMassCmd', 'mg', 1, 'Fuel mass injected per cylinder and cycle, mg/injection. Negative values are treated as 0 for the fuel flow and clipped to the table range for the lookups.'),
    inp('MainSOI', 'deg', 2, 'Main start of injection, deg crank angle, positive = advanced (before top dead centre). Compared with f_soi_opt to form the SOI deviation.'),
    inp('EngSpd', 'rad/s', 3, 'Engine speed. At or below 0 there is no flow and no torque.'),
    inp('Intk', 'bus', 4, 'Intake state bus {Prs [Pa], Temp [K]} of the intake manifold volume.', 'Bus: FlowStateBus'),
    inp('Exh', 'bus', 5, 'Exhaust state bus {Prs [Pa], Temp [K]} of the exhaust manifold volume.', 'Bus: FlowStateBus'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with T_exh [K], NOx [g/kWh], P_max [Pa], Lambda, BSFC [g/kWh], SOIdev [deg], TqInr, TqFric and TqPump [N*m].', 'Bus: CICoreEngineInfo'),
    out('EngTrq', 'N*m', 2, 'Brake torque at the crankshaft: inner torque minus friction and pumping torque.'),
    out('IntkFlw', 'bus', 3, 'Flow bus {MassFlw, HeatFlw} into the intake volume: the air drawn by the engine (negative).', 'Bus: FlowBus'),
    out('ExhFlw', 'bus', 4, 'Flow bus {MassFlw, HeatFlw} into the exhaust volume: air plus fuel mass at the exhaust enthalpy.', 'Bus: FlowBus'),
  ],
  params: [
    sc('Ncyl', 'Number of cylinders', '1', NCYL, 'Number of cylinders; integer >= 1.', 1),
    sc('Vd', 'Displaced volume', 'm^3', VD, 'Total engine displacement; > 0. Used for the speed-density air mass flow and the pumping torque.', 0, true),
    sc('R', 'Gas constant', 'J/(kg*K)', 287, 'Specific gas constant of intake air; > 0.', 0, true),
    sc('cp_air', 'Intake specific heat', 'J/(kg*K)', 1005, 'Specific heat of the intake air at constant pressure; > 0. Enthalpy leaving the intake volume is mdot_air*cp_air*T_intk.', 0, true),
    sc('cp_exh', 'Exhaust specific heat', 'J/(kg*K)', 1150, 'Specific heat of the exhaust gas at constant pressure; > 0.', 0, true),
    sc('AFRst', 'Stoichiometric air-fuel ratio', '1', 14.5, 'Stoichiometric air-fuel mass ratio of diesel fuel; > 0. Lambda = (air/fuel)/AFRst.', 0, true),
    sc('LHV', 'Fuel lower heating value', 'J/kg', LHV, 'Lower heating value of the fuel; > 0.', 0, true),
    vec('SpdBp', 'Speed breakpoints', 'rpm', SPD, 'Engine speed breakpoints in rpm, strictly increasing; they define the rows of the 2-D tables and f_nv. Lookups clip outside the range.'),
    vec('FuelBp', 'Fuel mass breakpoints', 'mg', FUEL, 'Fuel mass per injection breakpoints in mg, strictly increasing; they define the columns of the 2-D tables. Lookups clip.'),
    vec('SoiDevBp', 'SOI deviation breakpoints', 'deg', SOI, 'Breakpoints of the SOI deviation dSOI = MainSOI - f_soi_opt in deg, strictly increasing; they define f_eff_soi, f_nox_soi and f_pmax_soi.'),
    tab('f_tqinr', 'Inner torque table', 'N*m', D_TQINR, `Inner (indicated gas) torque at optimal SOI, the torque the combustion delivers before friction and pumping. ${IDX2} ${PLACEHOLDER} Default 0.95*F*Ncyl*LHV*eta_i/(4*pi*1e6) with eta_i 0.46 to 0.48.`),
    tab('f_tqf', 'Friction torque table', 'N*m', D_TQF, `Friction torque (mechanical losses, including accessories), always opposing rotation. ${IDX2} ${PLACEHOLDER} Default FMEP*Vd/(4*pi) with a Chen-Flynn-like FMEP of 1 to 2.2 bar growing with speed squared and load.`),
    tab('f_soi_opt', 'Optimal SOI table', 'deg', D_SOI_OPT, `Start of injection giving maximum inner torque, deg advanced. The SOI deviation is MainSOI - f_soi_opt. ${IDX2} ${PLACEHOLDER} Default 8 to 16 deg rising with speed and load.`),
    vec('f_eff_soi', 'SOI torque efficiency', '1', D_EFF_SOI, `Factor on the inner torque as a function of the SOI deviation over SoiDevBp; equals 1 at optimal SOI. ${PLACEHOLDER} Default peaked at 0 (0.85 at -12 deg, 0.97 at +8 deg).`),
    tab('f_exh_frac', 'Exhaust energy fraction table', '1', D_EXH_FRAC, `Fraction of the fuel energy mdot_f*LHV carried to the exhaust as enthalpy rise above the intake temperature. ${IDX2} ${PLACEHOLDER} Default 0.28 to 0.36.`),
    tab('f_nox', 'Engine-out NOx table', 'g/kWh', D_NOX, `Brake-specific NOx at optimal SOI. ${IDX2} ${PLACEHOLDER} Default 6 to 14 g/kWh.`),
    vec('f_nox_soi', 'NOx SOI factor', '1', D_NOX_SOI, `Factor on NOx as a function of the SOI deviation over SoiDevBp. ${PLACEHOLDER} Default rises with advance.`),
    tab('f_pmax_ratio', 'Peak pressure ratio table', '1', D_PMAX_RATIO, `Peak cylinder pressure divided by intake pressure at optimal SOI. ${IDX2} ${PLACEHOLDER} Default 45 to 75.`),
    vec('f_pmax_soi', 'Peak pressure SOI factor', '1', D_PMAX_SOI, `Factor on the peak pressure ratio as a function of the SOI deviation over SoiDevBp. ${PLACEHOLDER}`),
    vec('f_nv', 'Volumetric efficiency', '1', D_NV, `Volumetric efficiency over SpdBp (speed-density air mass flow). ${PLACEHOLDER} Default 0.88 to 0.94 peaking mid-speed.`),
  ],
  states: [],
  equations: [
    'N = EngSpd*30/pi [rpm]; mdot_air = f_nv(N)*Vd*(N/120)*P_intk/(R*T_intk); mdot_f = max(F,0)*1e-6*Ncyl*N/120 (F = FuelMassCmd)',
    'dSOI = MainSOI - f_soi_opt(N, F); TqInr = f_tqinr(N, F)*f_eff_soi(dSOI); TqFric = f_tqf(N, F)',
    'TqPump = (P_exh - P_intk)*Vd/(4*pi); EngTrq = TqInr - TqFric - TqPump',
    'T_exh = T_intk + f_exh_frac(N, F)*mdot_f*LHV/(cp_exh*(mdot_air + mdot_f))',
    'NOx = f_nox(N, F)*f_nox_soi(dSOI); P_max = P_intk*f_pmax_ratio(N, F)*f_pmax_soi(dSOI)',
    'Lambda = mdot_air/(AFRst*mdot_f) (0 when mdot_f = 0); BSFC = mdot_f*3.6e9/(EngTrq*omega) when EngTrq*omega > 0, else 0',
    'IntkFlw = {-mdot_air, -mdot_air*cp_air*T_intk}; ExhFlw = {mdot_air + mdot_f, (mdot_air + mdot_f)*cp_exh*T_exh}',
    '2-D tables are bilinear in (N, F), 1-D tables linear, all clipped to the breakpoint range; EngSpd <= 0 gives no flow and no torque',
  ],
  references: [REF_DOCS, REF_HEYWOOD, REF_GUZZELLA],
  description: 'Mean value model of a compression ignition engine core in the torque structure of the Powertrain Blockset: speed-density air flow, inner torque from a table corrected by the injection timing, minus friction and pumping torque, with exhaust temperature, NOx, peak pressure, lambda and BSFC reported.',
  behavior: 'Static block with direct feedthrough from all inputs and no states. The air flow follows from the volumetric efficiency and the intake state, the fuel flow from the injection mass and the speed. The flow ports draw the air from the intake volume and deliver air plus fuel at the exhaust enthalpy to the exhaust volume, so the block closes mass and energy balances with Control Volume System blocks. Invalid parameters (non-increasing breakpoints, wrong table sizes, negative or zero physical constants, non-integer Ncyl) or non-finite inputs or non-positive state pressures and temperatures are a block error. The default tables are placeholders until the plant characterisation (WP-27b) supplies them from the crank-angle CI Cylinder.',
  example: 'With Ncyl = 6, Vd = 11.95e-3 m^3, SpdBp = [1000 2000] rpm, FuelBp = [50 150] mg, SoiDevBp = [-10 0 10] deg, f_tqinr = [300 900; 320 950], f_tqf = [40 50; 60 70], f_soi_opt = [8 10; 12 14], f_eff_soi = [0.9 1 0.95], f_nv = [0.85 0.95], at 1500 rpm, F = 100 mg, MainSOI = 6 deg, intake 1.8 bar and 320 K, exhaust 2.0 bar: f_nv = 0.9, mdot_air = 0.2635 kg/s, dSOI = -5 deg, f_tqinr = 617.5 N*m times f_eff_soi 0.95 = 586.6 N*m, TqFric = 55 N*m, TqPump = 0.2e5*Vd/(4*pi) = 19.0 N*m and EngTrq = 512.6 N*m.',
};

const check = (p: Record<string, any>): string | null => {
  if (!Number.isInteger(p.Ncyl)) return 'Ncyl must be an integer';
  const bpS = validateBreakpoints(p.SpdBp); if (bpS) return `SpdBp: ${bpS}`;
  const bpF = validateBreakpoints(p.FuelBp); if (bpF) return `FuelBp: ${bpF}`;
  const bpD = validateBreakpoints(p.SoiDevBp); if (bpD) return `SoiDevBp: ${bpD}`;
  for (const k of ['f_tqinr', 'f_tqf', 'f_soi_opt', 'f_exh_frac', 'f_nox', 'f_pmax_ratio']) {
    const t = validateTable(p[k], [p.SpdBp, p.FuelBp]);
    if (t) return `${k}: ${t}`;
  }
  for (const k of ['f_eff_soi', 'f_nox_soi', 'f_pmax_soi']) {
    const t = validateTable(p[k], [p.SoiDevBp]);
    if (t) return `${k}: ${t}`;
  }
  const t = validateTable(p.f_nv, [p.SpdBp]);
  if (t) return `f_nv: ${t}`;
  return null;
};

const flowBus = (m: number, h: number) => makeBus(['MassFlw', 'HeatFlw'], [m, h]);
const INFO = ['T_exh', 'NOx', 'P_max', 'Lambda', 'BSFC', 'SOIdev', 'TqInr', 'TqFric', 'TqPump'];

const factory = definePtBlock(spec, {
  execute: (ins, p) => {
    const zero = { outputs: [{}, 0, {}, {}] as XValue[] };
    const bad = check(p);
    if (bad) return { ...zero, error: bad };
    const F = typeof ins[0] === 'number' ? ins[0] : NaN, soi = typeof ins[1] === 'number' ? ins[1] : NaN, w = typeof ins[2] === 'number' ? ins[2] : NaN;
    if (!Number.isFinite(F) || !Number.isFinite(soi) || !Number.isFinite(w)) return { ...zero, error: 'FuelMassCmd, MainSOI and EngSpd must be finite numbers' };
    const i = readState(ins[3], 'Intk'), e = readState(ins[4], 'Exh');
    if (typeof i === 'string') return { ...zero, error: i };
    if (typeof e === 'string') return { ...zero, error: e };
    if (w <= 0) {
      const info = makeBus(INFO, [i.T, 0, 0, 0, 0, 0, 0, 0, 0]);
      return { outputs: [info, 0, flowBus(0, 0), flowBus(0, 0)] };
    }
    const N = (w * 30) / Math.PI;
    const bp2 = [p.SpdBp, p.FuelBp];
    const L2 = (t: number[][]): number => lookupNd(t, bp2, [N, F], CLIP);
    const L1d = (t: number[], d: number): number => lookupNd(t, [p.SoiDevBp], [d], CLIP);
    const ma = lookupNd(p.f_nv, [p.SpdBp], [N], CLIP) * p.Vd * (N / 120) * i.P / (p.R * i.T);
    const mf = Math.max(F, 0) * 1e-6 * p.Ncyl * (N / 120);
    const dSoi = soi - L2(p.f_soi_opt);
    const tqInr = L2(p.f_tqinr) * L1d(p.f_eff_soi, dSoi);
    const tqFric = L2(p.f_tqf);
    const tqPump = ((e.P - i.P) * p.Vd) / (4 * Math.PI);
    const trq = tqInr - tqFric - tqPump;
    const mex = ma + mf;
    const Texh = i.T + (mex > 0 ? (L2(p.f_exh_frac) * mf * p.LHV) / (p.cp_exh * mex) : 0);
    const pw = trq * w;
    const info = makeBus(INFO, [
      Texh, L2(p.f_nox) * L1d(p.f_nox_soi, dSoi), i.P * L2(p.f_pmax_ratio) * L1d(p.f_pmax_soi, dSoi),
      mf > 0 ? ma / (p.AFRst * mf) : 0, pw > 0 ? (mf * 3.6e9) / pw : 0, dSoi, tqInr, tqFric, tqPump,
    ]);
    return { outputs: [info, trq, flowBus(0 - ma, 0 - ma * p.cp_air * i.T), flowBus(mex, mex * p.cp_exh * Texh)] };
  },
});

export const CORE_ENGINE_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [
  { spec, factory },
];
