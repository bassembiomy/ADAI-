// Powertrain Blockset / Propulsion / Combustion Engine Components / Boost Drive: Compressor, Turbine (with wastegate)
// and Drive Shaft. Flow ports follow Fundamental Flow: state buses {Prs, Temp} in, one flow bus {MassFlw, HeatFlw} per
// side out, positive INTO the neighbour. Compressor and turbine are stateless maps between two volumes (their outputs do
// not depend on the neighbours' flow inputs, so there is no algebraic loop); the shaft integrates the speed.
import type { XBlock, XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { lookupNd, validateBreakpoints, validateTable, orificePsi, radps2rpm, rpm2radps } from '../ptMath';
import type { PtBlockSpec, PtParamSpec } from '../ptSpec';
import { inp, out, par, num, flowBus, readState } from './fundamentalFlow';

const CATEGORY = 'Powertrain / Propulsion / Combustion Engine Components / Boost Drive' as const;
const PATH = 'Powertrain Blockset/Propulsion/Combustion Engine Components/Boost Drive/';
const STATE_BUS = 'Bus: FlowStateBus';
const FLOW_BUS = 'Bus: FlowBus';
const CLIP = { interp: 'linear', extrap: 'clip' } as const;

const REF_WATSON = 'Watson and Janota, Turbocharging the Internal Combustion Engine, Macmillan 1982 (compressor and turbine maps, corrected quantities)';
const REF_GUZZELLA = 'Guzzella and Onder, Introduction to Modeling and Control of Internal Combustion Engine Systems, 2nd ed., Springer 2010, ch. 2 and 3 (turbocharger models)';
const REF_DOCS = 'MathWorks Powertrain Blockset documentation, Boost Drive: Compressor, Turbine, Drive Shaft';

const tbl = (name: string, label: string, unit: string, def: number[][], description: string): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'table', description });
const vec = (name: string, label: string, unit: string, def: number[], description: string): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'vector', description });

const PR_BP = [1, 1.5, 2, 2.5, 3, 3.5];
// Compressor map sized for an 11.95 L truck engine (about 0.3-0.45 kg/s at 1.8-2.5 bar boost): corrected flow shrinks
// towards the surge side as PR rises, efficiency island 0.55-0.78 around 100000 rpm and PR 2.
const C_SPD = [40000, 60000, 80000, 100000, 120000, 140000];
const C_FLOW = [
  [0.1684, 0.0253, 0.0253, 0.0253, 0.0253, 0.0253], [0.2426, 0.0364, 0.0364, 0.0364, 0.0364, 0.0364],
  [0.3142, 0.2606, 0.0471, 0.0471, 0.0471, 0.0471], [0.3841, 0.3587, 0.2685, 0.0576, 0.0576, 0.0576],
  [0.4526, 0.4385, 0.3929, 0.302, 0.0679, 0.0679], [0.52, 0.5113, 0.4841, 0.4352, 0.3555, 0.2131],
];
const C_EFF = [
  [0.616, 0.649, 0.66, 0.649, 0.616, 0.56], [0.682, 0.716, 0.727, 0.716, 0.682, 0.627],
  [0.722, 0.756, 0.767, 0.756, 0.722, 0.667], [0.736, 0.769, 0.78, 0.769, 0.736, 0.68],
  [0.722, 0.756, 0.767, 0.756, 0.722, 0.667], [0.682, 0.716, 0.727, 0.716, 0.682, 0.627],
];
// Turbine map: swallowing capacity rising with expansion ratio (zero flow at ER 1), efficiency 0.55-0.75.
const T_SPD = [30000, 50000, 70000, 90000, 110000, 130000];
const T_FLOW = [
  [0, 0.1756, 0.204, 0.2159, 0.2221, 0.2257], [0, 0.1734, 0.2015, 0.2132, 0.2193, 0.2229],
  [0, 0.1712, 0.1989, 0.2105, 0.2165, 0.2201], [0, 0.169, 0.1963, 0.2078, 0.2137, 0.2173],
  [0, 0.1668, 0.1938, 0.2051, 0.211, 0.2144], [0, 0.1646, 0.1912, 0.2024, 0.2082, 0.2116],
];
const T_EFF = [
  [0.628, 0.644, 0.65, 0.644, 0.628, 0.6], [0.683, 0.7, 0.706, 0.7, 0.683, 0.656],
  [0.717, 0.733, 0.739, 0.733, 0.717, 0.689], [0.728, 0.744, 0.75, 0.744, 0.728, 0.7],
  [0.717, 0.733, 0.739, 0.733, 0.717, 0.689], [0.683, 0.7, 0.706, 0.7, 0.683, 0.656],
];

const mapParams = (kind: 'compressor' | 'turbine', cp: number, Tref: number, spd: number[], flow: number[][], eff: number[][]): PtParamSpec[] => {
  const c = kind === 'compressor';
  return [
    par('cp', 'Specific heat at constant pressure', 'J/(kg*K)', cp, `Specific heat of the ${c ? 'intake air' : 'exhaust gas'}; must exceed R. Sets g = cp/(cp-R).`, 0, true),
    par('R', 'Gas constant', 'J/(kg*K)', 287, 'Specific gas constant of the gas.', 0, true),
    par('T_ref', 'Reference temperature', 'K', Tref, 'Reference inlet temperature of the map; corrected speed = N/sqrt(T/T_ref).', 0, true),
    par('P_ref', 'Reference pressure', 'Pa', 101325, 'Reference inlet pressure of the map; flow is scaled by P/P_ref.', 0, true),
    vec('SpdBp', 'Corrected speed breakpoints', 'rpm', spd, 'Corrected shaft speed breakpoints in rpm, strictly increasing. Lookups clip outside the range.'),
    vec('PrBp', c ? 'Pressure ratio breakpoints' : 'Expansion ratio breakpoints', '1', PR_BP, `${c ? 'Compressor pressure ratio P_B/P_A' : 'Turbine expansion ratio P_A/P_B'} breakpoints, strictly increasing. Lookups clip outside the range.`),
    tbl('MassFlwTbl', 'Corrected mass flow', 'kg/s', flow, `Corrected mass flow at T_ref and P_ref, size length(SpdBp) x length(PrBp) (speed rows, ${c ? 'PR' : 'ER'} columns); >= 0.`),
    tbl('EffTbl', c ? 'Isentropic efficiency' : 'Total-to-static efficiency', '1', eff, 'Efficiency, same size as MassFlwTbl; in (0, 1].'),
  ];
};

function checkMap(p: Record<string, any>): string | null {
  if (!(p.cp > p.R)) return 'cp must be greater than R';
  const b1 = validateBreakpoints(p.SpdBp);
  if (b1) return `SpdBp: ${b1}`;
  const b2 = validateBreakpoints(p.PrBp);
  if (b2) return `PrBp: ${b2}`;
  const bp = [p.SpdBp, p.PrBp];
  for (const k of ['MassFlwTbl', 'EffTbl']) {
    const t = validateTable(p[k], bp);
    if (t) return `${k}: ${t}`;
  }
  for (const row of p.MassFlwTbl as number[][]) if (row.some(v => v < 0)) return 'MassFlwTbl must be >= 0';
  for (const row of p.EffTbl as number[][]) if (row.some(v => !(v > 0 && v <= 1))) return 'EffTbl must be in (0, 1]';
  return null;
}

// ---------------------------------------------------------------- Compressor
const compressorSpec: PtBlockSpec = {
  type: 'PT_COMPRESSOR',
  label: 'Compressor',
  category: CATEGORY,
  simulinkPath: PATH + 'Compressor',
  source: 'simulink-docs',
  symbol: 'compressor',
  inputs: [
    inp('Spd', 'rad/s', 1, 'Shaft speed.'),
    inp('A', 'bus', 2, 'Inlet state bus {Prs, Temp} (upstream volume).', STATE_BUS),
    inp('B', 'bus', 3, 'Outlet state bus {Prs, Temp} (downstream volume).', STATE_BUS),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with PR, MassFlw [kg/s], Eff, CorrSpd [rpm], Pwr [W] (absorbed) and T_out [K].', 'Bus: CompressorInfo'),
    out('Trq', 'N*m', 2, 'Torque absorbed from the shaft (positive when the compressor loads the shaft).'),
    out('FlwA', 'bus', 3, 'Flow bus {MassFlw, HeatFlw} into the inlet volume (negative: gas leaves it).', FLOW_BUS),
    out('FlwB', 'bus', 4, 'Flow bus {MassFlw, HeatFlw} into the outlet volume.', FLOW_BUS),
  ],
  params: mapParams('compressor', 1005, 298.15, C_SPD, C_FLOW, C_EFF),
  states: [],
  equations: [
    'PR = P_B/P_A, N_corr = N_rpm/sqrt(T_A/T_ref), g = cp/(cp-R)',
    'mdot_corr = f_mdot(N_corr, PR), eta = f_eta(N_corr, PR) (bilinear, clipped), mdot = mdot_corr*(P_A/P_ref)/sqrt(T_A/T_ref)',
    'T_out = T_A*(1 + (PR^((g-1)/g) - 1)/eta)',
    'Trq = mdot*cp*(T_out - T_A)/omega (0 for omega <= 0)',
    'FlwA = {-mdot, -mdot*cp*T_A}, FlwB = {+mdot, +mdot*cp*T_out}',
  ],
  references: [REF_WATSON, REF_GUZZELLA, REF_DOCS],
  description: 'Centrifugal compressor of a turbocharger, modelled from a corrected-flow and efficiency map. It draws gas from the inlet volume, raises its pressure and temperature and loads the shaft with the absorbed power.',
  behavior: 'Static block placed between an inlet state A and an outlet state B. The corrected speed and pressure ratio address two bilinear maps (held at the ends) for corrected flow and isentropic efficiency; the actual flow is scaled with the inlet pressure and temperature. The outlet temperature follows from the isentropic temperature rise divided by the efficiency, and the absorbed torque is the power divided by the shaft speed (0 at standstill or reverse). The thermodynamic part uses max(PR, 1), so no energy is extracted for PR < 1. Non-monotonic breakpoints, mismatched tables, efficiencies outside (0, 1] or non-physical state inputs are block errors.',
  example: 'With the default map, 80000 rpm, inlet 100000 Pa and 298.15 K and an outlet at 160000 Pa (PR = 1.6): MassFlw = 0.2151 kg/s at an efficiency of 0.7582, T_out = 354.6 K, Info.Pwr = 12.21 kW and Trq = 1.457 N*m; FlwB.HeatFlw = 76646 W and FlwA.HeatFlw = -64438 W.',
};

const compressorFactory = definePtBlock(compressorSpec, {
  execute: (ins, p) => {
    const zero = { outputs: [{}, 0, {}, {}] as XValue[] };
    const bad = checkMap(p);
    if (bad) return { ...zero, error: bad };
    const w = num(ins[0]);
    if (!Number.isFinite(w)) return { ...zero, error: 'Spd must be a finite number' };
    const a = readState(ins[1], 'A'), b = readState(ins[2], 'B');
    if (typeof a === 'string') return { ...zero, error: a };
    if (typeof b === 'string') return { ...zero, error: b };
    const g = p.cp / (p.cp - p.R), th = Math.sqrt(a.T / p.T_ref);
    const Nc = Math.max(0, radps2rpm(w)) / th, PR = b.P / a.P, bp = [p.SpdBp, p.PrBp];
    const mdot = lookupNd(p.MassFlwTbl, bp, [Nc, PR], CLIP) * (a.P / p.P_ref) / th;
    const eta = lookupNd(p.EffTbl, bp, [Nc, PR], CLIP);
    const Tout = a.T * (1 + (Math.pow(Math.max(PR, 1), (g - 1) / g) - 1) / eta);
    const pwr = mdot * p.cp * (Tout - a.T);
    const trq = w > 0 ? pwr / w : 0;
    const info = makeBus(['PR', 'MassFlw', 'Eff', 'CorrSpd', 'Pwr', 'T_out'], [PR, mdot, eta, Nc, pwr, Tout]);
    return { outputs: [info, trq, flowBus(0 - mdot, 0 - mdot * p.cp * a.T), flowBus(mdot, mdot * p.cp * Tout)] };
  },
});

// ---------------------------------------------------------------- Turbine
const turbineSpec: PtBlockSpec = {
  type: 'PT_TURBINE',
  label: 'Turbine',
  category: CATEGORY,
  simulinkPath: PATH + 'Turbine',
  source: 'simulink-docs',
  symbol: 'turbine',
  inputs: [
    inp('Spd', 'rad/s', 1, 'Shaft speed.'),
    inp('WgArea', 'm^2', 2, 'Wastegate (bypass) flow area; >= 0.'),
    inp('A', 'bus', 3, 'Inlet state bus {Prs, Temp} (exhaust manifold).', STATE_BUS),
    inp('B', 'bus', 4, 'Outlet state bus {Prs, Temp} (downstream volume).', STATE_BUS),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with PR (expansion ratio), MassFlw (turbine plus wastegate, kg/s), TrbnMassFlw, WgMassFlw, Eff, CorrSpd [rpm], Pwr [W] (extracted) and T_out [K] (turbine outlet, before wastegate mixing).', 'Bus: TurbineInfo'),
    out('Trq', 'N*m', 2, 'Torque delivered to the shaft.'),
    out('FlwA', 'bus', 3, 'Flow bus {MassFlw, HeatFlw} into the inlet volume.', FLOW_BUS),
    out('FlwB', 'bus', 4, 'Flow bus {MassFlw, HeatFlw} into the outlet volume.', FLOW_BUS),
  ],
  params: [
    ...mapParams('turbine', 1150, 873.15, T_SPD, T_FLOW, T_EFF),
    par('Cd_wg', 'Wastegate discharge coefficient', '1', 0.9, 'Discharge coefficient of the wastegate orifice; >= 0.', 0),
  ],
  states: [],
  equations: [
    'PR = P_A/P_B, N_corr = N_rpm/sqrt(T_A/T_ref), g = cp/(cp-R)',
    'mdot_t = f_mdot(N_corr, PR)*(P_A/P_ref)/sqrt(T_A/T_ref), eta = f_eta(N_corr, PR) (bilinear, clipped)',
    'T_out = T_A*(1 - eta*(1 - PR^(-(g-1)/g)))',
    'Trq = mdot_t*cp*(T_A - T_out)/omega (0 for omega <= 0)',
    'Wastegate: mdot_wg = Cd_wg*WgArea*Pu/sqrt(R*Tu)*Psi(Pd/Pu), isenthalpic (Flow Restriction Psi)',
    'FlwA = {-(mdot_t + mdot_wg), -(mdot_t + mdot_wg)*cp*T_A}, FlwB = {mdot_t + mdot_wg, mdot_t*cp*T_out + mdot_wg*cp*T_A}',
  ],
  references: [REF_WATSON, REF_GUZZELLA, REF_DOCS],
  description: 'Radial turbine of a turbocharger with a wastegate bypass, modelled from a corrected-flow and efficiency map. It expands exhaust gas from the inlet to the outlet volume and drives the shaft; the wastegate is a compressible orifice in parallel.',
  behavior: 'Static block between an inlet state A and an outlet state B. The corrected speed and expansion ratio address two bilinear maps (held at the ends); the default flow is zero at ER 1 and rises with the expansion ratio (swallowing capacity). The outlet temperature follows the isentropic expansion with the map efficiency and the delivered torque is the power divided by the shaft speed (0 at standstill or reverse). The wastegate passes the gas of the higher pressure side without work (enthalpy unchanged) and adds to the mass flow of both sides; its flow is reported signed from A to B in Info.WgMassFlw. The thermodynamic part uses max(ER, 1). Invalid maps, a negative WgArea or non-physical states are block errors.',
  example: 'With the default map, 80000 rpm, inlet 190000 Pa and 850 K, outlet 105000 Pa and WgArea = 0: the expansion ratio is 1.810 (corrected speed 81082 rpm), the turbine passes 0.3554 kg/s at an efficiency of 0.7428, T_out = 763.1 K, Info.Pwr = 35.50 kW and Trq = 4.238 N*m. Opening the wastegate adds bypass flow without power.',
};

const turbineFactory = definePtBlock(turbineSpec, {
  execute: (ins, p) => {
    const zero = { outputs: [{}, 0, {}, {}] as XValue[] };
    const bad = checkMap(p);
    if (bad) return { ...zero, error: bad };
    const w = num(ins[0]), Awg = num(ins[1]);
    if (!Number.isFinite(w)) return { ...zero, error: 'Spd must be a finite number' };
    if (!Number.isFinite(Awg) || Awg < 0) return { ...zero, error: 'WgArea must be a finite number >= 0' };
    const a = readState(ins[2], 'A'), b = readState(ins[3], 'B');
    if (typeof a === 'string') return { ...zero, error: a };
    if (typeof b === 'string') return { ...zero, error: b };
    const g = p.cp / (p.cp - p.R), th = Math.sqrt(a.T / p.T_ref);
    const Nc = Math.max(0, radps2rpm(w)) / th, PR = a.P / b.P, bp = [p.SpdBp, p.PrBp];
    const mt = lookupNd(p.MassFlwTbl, bp, [Nc, PR], CLIP) * (a.P / p.P_ref) / th;
    const eta = lookupNd(p.EffTbl, bp, [Nc, PR], CLIP);
    const Tout = a.T * (1 - eta * (1 - Math.pow(Math.max(PR, 1), -(g - 1) / g)));
    const pwr = mt * p.cp * (a.T - Tout);
    const trq = w > 0 ? pwr / w : 0;
    // Wastegate: orifice from the higher-pressure side, isenthalpic; mwg is signed from A to B.
    let mwg = 0, Tu = a.T;
    if (a.P !== b.P) {
      const AtoB = a.P > b.P, up = AtoB ? a : b, dn = AtoB ? b : a;
      const m = (p.Cd_wg * Awg * up.P * orificePsi(dn.P / up.P, g)) / Math.sqrt(p.R * up.T);
      mwg = AtoB ? m : -m;
      Tu = up.T;
    }
    const hwg = mwg * p.cp * Tu, tot = mt + mwg;
    const info = makeBus(['PR', 'MassFlw', 'TrbnMassFlw', 'WgMassFlw', 'Eff', 'CorrSpd', 'Pwr', 'T_out'], [PR, tot, mt, mwg, eta, Nc, pwr, Tout]);
    return { outputs: [info, trq, flowBus(0 - tot, 0 - mt * p.cp * a.T - hwg), flowBus(tot, mt * p.cp * Tout + hwg)] };
  },
});

// ---------------------------------------------------------------- Drive Shaft
const shaftSpec: PtBlockSpec = {
  type: 'PT_DRIVE_SHAFT',
  label: 'Drive Shaft',
  category: CATEGORY,
  simulinkPath: PATH + 'Drive Shaft',
  source: 'simulink-docs',
  symbol: 'boost-shaft',
  inputs: [
    inp('TrbnTrq', 'N*m', 1, 'Torque delivered by the turbine.', undefined, false),
    inp('CmprTrq', 'N*m', 2, 'Torque absorbed by the compressor.', undefined, false),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Spd_rpm, the shaft speed in rpm.', 'Bus: DriveShaftInfo'),
    out('Spd', 'rad/s', 2, 'Turbocharger shaft speed.'),
  ],
  params: [
    par('J', 'Shaft inertia', 'kg*m^2', 2e-4, 'Rotating inertia of the turbine, shaft and compressor; > 0.', 0, true),
    par('b', 'Viscous damping', 'N*m*s/rad', 1e-6, 'Bearing friction coefficient; >= 0.', 0),
    par('w_o', 'Initial speed', 'rad/s', rpm2radps(60000), 'Shaft speed at the start of the simulation; >= 0.', 0),
  ],
  states: ['omega'],
  equations: ['J*domega/dt = TrbnTrq - CmprTrq - b*omega', 'Spd = omega, Info.Spd_rpm = omega*30/pi', 'omega(0) = w_o'],
  references: [REF_GUZZELLA, REF_WATSON, REF_DOCS],
  description: 'Rotating inertia that couples the turbine and the compressor of a turbocharger. It integrates the torque balance of the two wheels and a viscous bearing loss to give the shaft speed.',
  behavior: 'One continuous state, the speed. The output depends only on the state, so the block does not feed through and the turbine-compressor-shaft loop is not algebraic. A non-finite torque input is treated as an error by the engine; the speed is not clamped, so a negative balance below zero speed is the user\'s responsibility (the compressor and turbine report zero torque at non-positive speed).',
  example: 'With J = 2e-4 kg*m^2, b = 0 and w_o = 5000 rad/s, a constant turbine torque of 0.1 N*m against a compressor torque of 0.06 N*m accelerates the shaft at 200 rad/s^2: after 0.5 s Spd = 5100 rad/s.',
};

const shaftFactory = definePtBlock(shaftSpec, {
  init: p => ({ omega: p.w_o }),
  derivatives: (ins, p, s) => {
    const tt = num(ins[0]), ct = num(ins[1]);
    return { omega: ((Number.isFinite(tt) ? tt : 0) - (Number.isFinite(ct) ? ct : 0) - p.b * s.omega) / p.J };
  },
  execute: (_ins, _p, s) => {
    if (!s || !Number.isFinite(s.omega)) return { outputs: [{}, 0], error: 'Drive shaft speed state is missing' };
    return { outputs: [makeBus(['Spd_rpm'], [radps2rpm(s.omega)]), s.omega] };
  },
});

export const BOOST_DRIVE_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [
  { spec: compressorSpec, factory: compressorFactory },
  { spec: turbineSpec, factory: turbineFactory },
  { spec: shaftSpec, factory: shaftFactory },
];
