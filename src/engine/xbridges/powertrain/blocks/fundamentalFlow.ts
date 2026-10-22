// Powertrain Blockset / Propulsion / Combustion Engine Components / Fundamental Flow:
// Flow Boundary, Flow Restriction, Control Volume System and Heat Exchanger.
// Two-way flow connections are realised as signal pairs (Simulink causality): volumes and boundaries output a state bus
// {Prs [Pa], Temp [K]}; restrictions and heat exchangers output one flow bus {MassFlw [kg/s], HeatFlw [W]} per side,
// positive INTO the block connected on that side.
import type { XBlock, XValue } from '../../types';
import { makeBus, isBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { orificePsi, orificeCriticalRatio } from '../ptMath';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const CATEGORY = 'Powertrain / Propulsion / Combustion Engine Components / Fundamental Flow' as const;
const PATH = 'Powertrain Blockset/Propulsion/Combustion Engine Components/Fundamental Flow/';

export const inp = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string, feedthrough?: boolean): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}), ...(feedthrough !== undefined ? { feedthrough } : {}) });
export const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
export const par = (name: string, label: string, unit: string, def: number, description: string,
  min?: number, minExclusive?: boolean, max?: number): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}), ...(minExclusive ? { minExclusive } : {}), ...(max !== undefined ? { max } : {}) });

const REF_HEYWOOD = 'Heywood, Internal Combustion Engine Fundamentals, McGraw-Hill 1988, ch. 2 (compressible flow through a restriction)';
const REF_GUZZELLA = 'Guzzella and Onder, Introduction to Modeling and Control of Internal Combustion Engine Systems, 2nd ed., Springer 2010, ch. 2';

const pR = par('R', 'Gas constant', 'J/(kg*K)', 287, 'Specific gas constant of the gas.', 0, true);
const pCp = par('cp', 'Specific heat at constant pressure', 'J/(kg*K)', 1005, 'Specific heat at constant pressure; must exceed R so that cv = cp - R is positive.', 0, true);

export const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);
export const field = (v: XValue | undefined, k: string): number => (isBus(v) && typeof (v as any)[k] === 'number' ? (v as any)[k] : NaN);

const STATE_BUS = 'Bus: FlowStateBus';
const FLOW_BUS = 'Bus: FlowBus';
export const stateBus = (P: number, T: number) => makeBus(['Prs', 'Temp'], [P, T]);
export const flowBus = (m: number, h: number) => makeBus(['MassFlw', 'HeatFlw'], [m, h]);

/** Reads a state bus; returns a message when it is missing, non-finite or non-physical. */
export function readState(v: XValue | undefined, side: string): { P: number; T: number } | string {
  const P = field(v, 'Prs'), T = field(v, 'Temp');
  if (!Number.isFinite(P) || !Number.isFinite(T)) return `Flow ${side} must be a state bus with Prs and Temp`;
  if (P <= 0) return `Flow ${side} Prs must be > 0 Pa`;
  if (T <= 0) return `Flow ${side} Temp must be > 0 K`;
  return { P, T };
}

interface Orifice { m: number; Tu: number; pr: number; choked: boolean; AtoB: boolean }
/** Orifice flow from the higher-pressure side. m >= 0 is the magnitude; AtoB tells the direction. */
function orifice(a: { P: number; T: number }, b: { P: number; T: number }, p: Record<string, any>): Orifice | string {
  if (!(p.cp > p.R)) return 'cp must be greater than R';
  if (a.P === b.P) return { m: 0, Tu: a.T, pr: 1, choked: false, AtoB: true };
  const AtoB = a.P > b.P;
  const up = AtoB ? a : b, dn = AtoB ? b : a;
  const g = p.cp / (p.cp - p.R);
  const pr = dn.P / up.P;
  const m = (p.Cd * p.Area * up.P * orificePsi(pr, g)) / Math.sqrt(p.R * up.T);
  return { m, Tu: up.T, pr, choked: pr <= orificeCriticalRatio(g), AtoB };
}

// ---------------------------------------------------------------- Flow Boundary
const boundarySpec: PtBlockSpec = {
  type: 'PT_FLOW_BOUNDARY',
  label: 'Flow Boundary',
  category: CATEGORY,
  simulinkPath: PATH + 'Flow Boundary',
  source: 'simulink-docs',
  symbol: 'flow-boundary',
  inputs: [inp('Flw', 'bus', 1, 'Optional flow bus {MassFlw, HeatFlw} leaving the connected component into the boundary. When unconnected the reported mass flow is 0.', FLOW_BUS, false)],
  outputs: [
    out('Info', 'bus', 1, 'Bus with MassFlw, the mass flow rate into the boundary.', 'Bus: FlowBoundaryInfo'),
    out('State', 'bus', 2, 'Boundary state bus with Prs and Temp, constant.', STATE_BUS),
  ],
  params: [
    par('Prs', 'Pressure', 'Pa', 101325, 'Boundary pressure; must be > 0.', 0, true),
    par('Temp', 'Temperature', 'K', 293.15, 'Boundary temperature; must be > 0.', 0, true),
  ],
  states: [],
  equations: ['State.Prs = Prs, State.Temp = Temp (constant, infinite reservoir)', 'Info.MassFlw = Flw.MassFlw (0 if Flw is unconnected)'],
  references: [REF_GUZZELLA, 'MathWorks Powertrain Blockset documentation, Flow Boundary'],
  description: 'Ideal pressure and temperature source or sink, such as the atmosphere at the end of a pipe. It holds a constant pressure and temperature and absorbs any flow offered to it.',
  behavior: 'Static block. The State bus always carries the parameter pressure and temperature and does not depend on the Flw input, so a boundary can close a loop with a restriction. Info.MassFlw reports the mass flow rate delivered into the boundary (zero when Flw is unconnected).',
  example: 'With the defaults, State = {Prs: 101325 Pa, Temp: 293.15 K}. A flow bus with MassFlw = 0.01 kg/s on Flw gives Info.MassFlw = 0.01 kg/s and leaves State unchanged.',
};

const boundaryFactory = definePtBlock(boundarySpec, {
  execute: (ins, p) => {
    const f = field(ins[0], 'MassFlw');
    return { outputs: [makeBus(['MassFlw'], [Number.isFinite(f) ? f : 0]), stateBus(p.Prs, p.Temp)] };
  },
});

// ---------------------------------------------------------------- Flow Restriction
const orificeEq = [
  'mdot = Cd*Area*Pu/sqrt(R*Tu)*Psi(Pd/Pu), flow from the higher pressure side u to the lower pressure side d',
  'Psi(pr) = sqrt(2g/(g-1)*(pr^(2/g) - pr^((g+1)/g))) for pr > (2/(g+1))^(g/(g-1)), else sqrt(g)*(2/(g+1))^((g+1)/(2(g-1))) (choked), g = cp/(cp-R)',
];

const restrictionSpec: PtBlockSpec = {
  type: 'PT_FLOW_RESTRICTION',
  label: 'Flow Restriction',
  category: CATEGORY,
  simulinkPath: PATH + 'Flow Restriction',
  source: 'simulink-docs',
  symbol: 'flow-restriction',
  inputs: [
    inp('A', 'bus', 1, 'State bus {Prs, Temp} of the component connected to side A.', STATE_BUS),
    inp('B', 'bus', 2, 'State bus {Prs, Temp} of the component connected to side B.', STATE_BUS),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with MassFlw (positive from A to B), PressureRatio (downstream over upstream) and Choked (1 when choked).', 'Bus: FlowRestrictionInfo'),
    out('FlwA', 'bus', 2, 'Flow bus {MassFlw, HeatFlw} into the component on side A.', FLOW_BUS),
    out('FlwB', 'bus', 3, 'Flow bus {MassFlw, HeatFlw} into the component on side B.', FLOW_BUS),
  ],
  params: [
    par('Area', 'Restriction area', 'm^2', 1e-4, 'Geometric flow area of the restriction; >= 0.', 0),
    par('Cd', 'Discharge coefficient', '1', 0.8, 'Discharge coefficient of the orifice; >= 0.', 0),
    pR, pCp,
  ],
  states: [],
  equations: [
    ...orificeEq,
    'Downstream side receives +mdot, upstream side -mdot; HeatFlw = MassFlw*cp*Tu (enthalpy carried from the upstream side)',
    'Equal pressures give exactly zero flow',
  ],
  references: [REF_HEYWOOD, REF_GUZZELLA, 'MathWorks Powertrain Blockset documentation, Flow Restriction'],
  description: 'Compressible orifice between two gas volumes. The flow goes from the higher to the lower pressure side, chokes at the critical pressure ratio and carries the enthalpy of the upstream gas.',
  behavior: 'Static block. The side with the higher pressure is upstream and supplies the temperature; the flow reverses automatically when the pressures cross and is exactly zero when they are equal. Each side receives a flow bus: the downstream side gets +mdot and cp*Tu*mdot, the upstream side the negatives. A non-positive pressure or temperature, or a non-state-bus input, is a block error.',
  example: 'With Area = 2e-4 m^2, Cd = 0.8, R = 287 and cp = 1005, side A at 150000 Pa and 320 K and side B at 120000 Pa and 300 K give a pressure ratio of 0.8, MassFlw = 0.04440 kg/s from A to B (not choked), FlwB.HeatFlw = 14279 W and FlwA.HeatFlw = -14279 W. With A at 300000 Pa and B at 100000 Pa (300 K) the ratio 0.333 is below the critical ratio 0.528, Choked = 1 and MassFlw = 0.11200 kg/s.',
};

const restrictionFactory = definePtBlock(restrictionSpec, {
  execute: (ins, p) => {
    const zero = { outputs: [{}, {}, {}] as XValue[] };
    const a = readState(ins[0], 'A'), b = readState(ins[1], 'B');
    if (typeof a === 'string') return { ...zero, error: a };
    if (typeof b === 'string') return { ...zero, error: b };
    const o = orifice(a, b, p);
    if (typeof o === 'string') return { ...zero, error: o };
    const mAB = o.AtoB ? o.m : -o.m; // positive from A to B
    const h = o.m * p.cp * o.Tu;
    const info = makeBus(['MassFlw', 'PressureRatio', 'Choked'], [mAB, o.pr, o.choked ? 1 : 0]);
    return { outputs: [info, flowBus(0 - mAB, o.AtoB ? 0 - h : h), flowBus(mAB, o.AtoB ? h : -h)] };
  },
});

// ---------------------------------------------------------------- Control Volume System
const MAX_PORTS = 16;
const flwPorts = (n: number): PtPortSpec[] =>
  Array.from({ length: n }, (_, i) => inp(`Flw${i + 1}`, 'bus', i + 1, `Flow bus {MassFlw, HeatFlw} into the volume through port ${i + 1}; an unconnected port contributes 0.`, FLOW_BUS, false));

const volumeSpec: PtBlockSpec = {
  type: 'PT_CONTROL_VOLUME',
  label: 'Control Volume System',
  category: CATEGORY,
  simulinkPath: PATH + 'Control Volume System',
  source: 'simulink-docs',
  symbol: 'control-volume',
  inputs: flwPorts(2),
  outputs: [
    out('Info', 'bus', 1, 'Bus with Mass [kg], Prs [Pa] and Temp [K] of the gas in the volume.', 'Bus: ControlVolumeInfo'),
    out('State', 'bus', 2, 'State bus {Prs, Temp} offered to the connected restrictions.', STATE_BUS),
  ],
  params: [
    par('NumPorts', 'Number of flow ports', '1', 2, 'Number of flow inputs Flw1..FlwN; integer from 1 to 16.', 1, false, MAX_PORTS),
    par('V', 'Volume', 'm^3', 1e-3, 'Fixed gas volume; > 0.', 0, true),
    par('P_o', 'Initial pressure', 'Pa', 101325, 'Gas pressure at the start of the simulation; > 0.', 0, true),
    par('T_o', 'Initial temperature', 'K', 293.15, 'Gas temperature at the start of the simulation; > 0.', 0, true),
    pR, pCp,
  ],
  states: ['m', 'U'],
  equations: [
    'dm/dt = sum_i Flw_i.MassFlw, dU/dt = sum_i Flw_i.HeatFlw',
    'T = U/(m*cv), cv = cp - R, P = m*R*T/V',
    'm(0) = P_o*V/(R*T_o), U(0) = m(0)*cv*T_o',
  ],
  references: [REF_GUZZELLA, REF_HEYWOOD, 'MathWorks Powertrain Blockset documentation, Control Volume System'],
  description: 'Fixed-volume ideal gas storage with an arbitrary number of flow ports. It integrates the mass and internal energy of the gas and reports its pressure and temperature.',
  behavior: 'Two continuous states, the gas mass m and the internal energy U, initialised from P_o and T_o. Each flow input adds its MassFlw to dm/dt and its HeatFlw (enthalpy flow) to dU/dt; unconnected or non-bus inputs add 0. The outputs depend only on the states, so the block does not feed through and loops with restrictions are not algebraic. A state with non-positive mass or internal energy is a block error.',
  example: 'Filling a V = 1e-3 m^3 volume (NumPorts = 1, P_o = 100000 Pa, T_o = 300 K) from a 200000 Pa, 300 K Flow Boundary through a Flow Restriction (Area = 1e-5 m^2, Cd = 1) with ode4 at 1e-4 s: after 0.05 s Mass = 1.3931e-3 kg, Prs = 127913 Pa and Temp = 319.94 K; after 3 s Prs = 199999 Pa and Temp = 349.20 K. The adiabatic fill heats the gas above the supply temperature because the initial gas is compressed.',
};

const nPorts = (p: Record<string, any>): number => (Number.isInteger(p.NumPorts) && p.NumPorts >= 1 && p.NumPorts <= MAX_PORTS ? p.NumPorts : 2);

function volumeCheck(p: Record<string, any>): string | null {
  if (!Number.isInteger(p.NumPorts)) return 'NumPorts must be an integer';
  if (!(p.cp > p.R)) return 'cp must be greater than R';
  return null;
}

const volumeFactory = definePtBlock(volumeSpec, {
  portsFor: p => ({ inputs: flwPorts(nPorts(p)), outputs: volumeSpec.outputs }),
  init: p => {
    const m = (p.P_o * p.V) / (p.R * p.T_o);
    return { m, U: m * (p.cp - p.R) * p.T_o };
  },
  derivatives: (ins, p) => {
    let dm = 0, dU = 0;
    for (const v of ins) {
      const m = field(v, 'MassFlw'), h = field(v, 'HeatFlw');
      if (Number.isFinite(m)) dm += m;
      if (Number.isFinite(h)) dU += h;
    }
    return { m: dm, U: dU };
  },
  execute: (_ins, p, s) => {
    const bad = volumeCheck(p);
    if (bad) return { outputs: [{}, {}], error: bad };
    if (!s || !(s.m > 0)) return { outputs: [{}, {}], error: 'Control volume mass must be > 0' };
    if (!(s.U > 0)) return { outputs: [{}, {}], error: 'Control volume internal energy must be > 0' };
    const T = s.U / (s.m * (p.cp - p.R));
    const P = (s.m * p.R * T) / p.V;
    return { outputs: [makeBus(['Mass', 'Prs', 'Temp'], [s.m, P, T]), stateBus(P, T)] };
  },
});

// ---------------------------------------------------------------- Heat Exchanger
const hxSpec: PtBlockSpec = {
  type: 'PT_HEAT_EXCHANGER',
  label: 'Heat Exchanger',
  category: CATEGORY,
  simulinkPath: PATH + 'Heat Exchanger',
  source: 'simulink-docs',
  symbol: 'heat-exchanger',
  inputs: [
    inp('A', 'bus', 1, 'State bus {Prs, Temp} of the component connected to side A.', STATE_BUS),
    inp('B', 'bus', 2, 'State bus {Prs, Temp} of the component connected to side B.', STATE_BUS),
    inp('CoolantTemp', 'K', 3, 'Coolant temperature; > 0.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with MassFlw (positive from A to B), HeatXfr (heat removed from the gas, W) and T_out (gas temperature leaving, K).', 'Bus: HeatExchangerInfo'),
    out('FlwA', 'bus', 2, 'Flow bus {MassFlw, HeatFlw} into the component on side A.', FLOW_BUS),
    out('FlwB', 'bus', 3, 'Flow bus {MassFlw, HeatFlw} into the component on side B.', FLOW_BUS),
  ],
  params: [
    par('eps', 'Effectiveness', '1', 0.8, 'Heat exchanger effectiveness, the fraction of the gas-to-coolant temperature difference removed; in [0, 1].', 0, false, 1),
    par('Area', 'Flow area', 'm^2', 1e-4, 'Equivalent flow area of the exchanger core; >= 0.', 0),
    par('Cd', 'Discharge coefficient', '1', 0.8, 'Discharge coefficient of the flow path; >= 0.', 0),
    pR, pCp,
  ],
  states: [],
  equations: [
    ...orificeEq,
    'T_out = Tu - eps*(Tu - CoolantTemp)',
    'downstream HeatFlw = mdot*cp*T_out, upstream HeatFlw = -mdot*cp*Tu; upstream MassFlw = -mdot, downstream MassFlw = +mdot',
    'HeatXfr = mdot*cp*eps*(Tu - CoolantTemp)',
  ],
  references: [REF_GUZZELLA, REF_HEYWOOD, 'Incropera et al., Fundamentals of Heat and Mass Transfer, 6th ed., Wiley 2007 (effectiveness definition)', 'MathWorks Powertrain Blockset documentation, Heat Exchanger'],
  description: 'Gas cooler such as a charge air cooler. It passes the orifice flow of a restriction and cools the gas leaving towards the downstream side by a given effectiveness towards the coolant temperature.',
  behavior: 'Static block. Flow goes from the higher pressure side, as in the Flow Restriction. The gas leaves at T_out = Tu - eps*(Tu - CoolantTemp), so the downstream flow carries the enthalpy at T_out while the upstream side loses the enthalpy at Tu. HeatXfr is the heat removed from the gas. With no flow HeatXfr is 0.',
  example: 'With eps = 0.8, Area = 3e-4 m^2, Cd = 0.8, side A at 200000 Pa and 400 K, side B at 150000 Pa and CoolantTemp = 300 K, the flow is 0.08573 kg/s from A to B, T_out = 400 - 0.8*100 = 320 K, FlwB.HeatFlw = 27570 W, FlwA.HeatFlw = -34463 W and HeatXfr = 6892.5 W.',
};

const hxFactory = definePtBlock(hxSpec, {
  execute: (ins, p) => {
    const zero = { outputs: [{}, {}, {}] as XValue[] };
    const a = readState(ins[0], 'A'), b = readState(ins[1], 'B');
    if (typeof a === 'string') return { ...zero, error: a };
    if (typeof b === 'string') return { ...zero, error: b };
    const Tc = num(ins[2]);
    if (!Number.isFinite(Tc) || Tc <= 0) return { ...zero, error: 'CoolantTemp must be a finite temperature > 0 K' };
    const o = orifice(a, b, p);
    if (typeof o === 'string') return { ...zero, error: o };
    const Tout = o.Tu - p.eps * (o.Tu - Tc);
    const mAB = o.AtoB ? o.m : -o.m;
    const hUp = 0 - o.m * p.cp * o.Tu, hDn = o.m * p.cp * Tout;
    const info = makeBus(['MassFlw', 'HeatXfr', 'T_out'], [mAB, o.m * p.cp * p.eps * (o.Tu - Tc), Tout]);
    const flwA = o.AtoB ? flowBus(0 - o.m, hUp) : flowBus(o.m, hDn);
    const flwB = o.AtoB ? flowBus(o.m, hDn) : flowBus(0 - o.m, hUp);
    return { outputs: [info, flwA, flwB] };
  },
});

export const FUNDAMENTAL_FLOW_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [
  { spec: boundarySpec, factory: boundaryFactory },
  { spec: restrictionSpec, factory: restrictionFactory },
  { spec: volumeSpec, factory: volumeFactory },
  { spec: hxSpec, factory: hxFactory },
];
