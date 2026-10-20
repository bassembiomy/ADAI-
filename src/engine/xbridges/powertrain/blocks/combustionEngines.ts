// Powertrain Blockset / Propulsion / Combustion Engines: Mapped SI Engine and Mapped CI Engine (WP-23).
// One shared implementation, two specs. Static maps (no states) over commanded torque and engine speed in rpm.
import type { XBlock } from '../../types';
import { definePtBlock } from '../ptBlock';
import { lookupNd, validateBreakpoints, validateTable, radps2rpm } from '../ptMath';
import { makeBus } from '../../bus/busCore';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const CATEGORY = 'Powertrain / Propulsion / Combustion Engines' as const;
const PATH = 'Powertrain Blockset/Propulsion/Combustion Engines/';
const CLIP = { interp: 'linear', extrap: 'clip' } as const;

// ---- Default maps generated from a Willans-line model (Guzzella & Onder 2010) ----
// Vd = 2 litre, 4-stroke. Friction power Pf(N) = fmep(N)*Vd*(N/60)/2 with fmep = 0.8e5 + 0.1e5*(N/1000)^1.5 Pa.
// Brake torque of the default map equals the commanded torque; Pbrake = T*2*pi*N/60.
// FuelFlw = (Pbrake + Pf(N)) / (eta_ind*LHV); AirMassFlw = FuelFlw*AFR.
const VD = 2e-3;
const fricPower = (N: number) => (0.8e5 + 0.1e5 * (N / 1000) ** 1.5) * VD * (N / 60) / 2;
const round = (x: number, d = 6) => Number(x.toPrecision(d));

interface MapCfg { tBpt: number[]; nBpt: number[]; lhv: number; eta: number; afr: (frac: number) => number }

function genMaps(c: MapCfg) {
  const tMax = c.tBpt[c.tBpt.length - 1];
  const tbrake: number[][] = [], fuel: number[][] = [], air: number[][] = [];
  for (const t of c.tBpt) {
    const rb: number[] = [], rf: number[] = [], ra: number[] = [];
    for (const N of c.nBpt) {
      const f = (t * 2 * Math.PI * N / 60 + fricPower(N)) / (c.eta * c.lhv);
      rb.push(t); rf.push(round(f)); ra.push(round(f * c.afr(t / tMax)));
    }
    tbrake.push(rb); fuel.push(rf); air.push(ra);
  }
  return { tbrake, fuel, air };
}

const SI_CFG: MapCfg = { tBpt: [0, 40, 80, 120, 160, 200], nBpt: [800, 1500, 2500, 3500, 4500, 5500, 6500], lhv: 43e6, eta: 0.36, afr: () => 14.7 };
const CI_CFG: MapCfg = { tBpt: [0, 70, 140, 210, 280, 350], nBpt: [800, 1200, 1800, 2400, 3000, 3600, 4400], lhv: 42.8e6, eta: 0.42, afr: f => 25 - 7 * f };
const SI_MAPS = genMaps(SI_CFG);
const CI_MAPS = genMaps(CI_CFG);

const ports = (infoType: string): { inputs: PtPortSpec[]; outputs: PtPortSpec[] } => ({
  inputs: [
    { id: 'TrqCmd', name: 'TrqCmd', direction: 'input', unit: 'N*m', simulinkIndex: 1, description: 'Commanded engine torque in N*m. Selects the row of the maps; clipped to the torque breakpoints.' },
    { id: 'EngSpd', name: 'EngSpd', direction: 'input', unit: 'rad/s', simulinkIndex: 2, description: 'Engine crankshaft speed in rad/s. Converted to rpm for the map lookup.' },
  ],
  outputs: [
    { id: 'Info', name: 'Info', direction: 'output', unit: 'bus', dataType: `Bus: ${infoType}`, simulinkIndex: 1, description: 'Bus of engine internals: AirMassFlw, FuelMassFlw, EngPwr, BSFC (g/kWh), EngSpdRpm.' },
    { id: 'EngTrq', name: 'EngTrq', direction: 'output', unit: 'N*m', simulinkIndex: 2, description: 'Brake torque delivered at the crankshaft in N*m, from f_tbrake.' },
    { id: 'FuelFlw', name: 'FuelFlw', direction: 'output', unit: 'kg/s', simulinkIndex: 3, description: 'Fuel mass flow rate in kg/s, from f_fuel.' },
  ],
});

const paramsFor = (kind: 'SI' | 'CI', cfg: MapCfg, maps: ReturnType<typeof genMaps>): PtParamSpec[] => {
  const gen = `Default generated from a Willans-line model of a 2-litre ${kind === 'SI' ? 'gasoline' : 'diesel'} engine.`;
  return [
    { name: 'f_tbrake_t_bpt', label: 'Commanded torque breakpoints', unit: 'N*m', default: cfg.tBpt, kind: 'vector', description: 'Commanded torque breakpoints in N*m, strictly increasing; they define the rows of f_tbrake, f_fuel and f_air. Lookups clip outside the range.' },
    { name: 'f_tbrake_n_bpt', label: 'Speed breakpoints', unit: 'rpm', default: cfg.nBpt, kind: 'vector', description: 'Engine speed breakpoints in rpm, strictly increasing; they define the columns of the maps. Lookups clip outside the range.' },
    { name: 'f_tbrake', label: 'Brake torque map', unit: 'N*m', default: maps.tbrake, kind: 'table', description: `Brake torque in N*m, size length(f_tbrake_t_bpt) x length(f_tbrake_n_bpt) (rows = commanded torque, columns = speed). ${gen} Default brake torque equals the command.` },
    { name: 'f_fuel', label: 'Fuel flow map', unit: 'kg/s', default: maps.fuel, kind: 'table', description: `Fuel mass flow in kg/s (each value >= 0), same size as f_tbrake. ${gen} Value = (Pbrake + Pfriction(N))/(eta_ind*LHV) with eta_ind ${cfg.eta} and LHV ${cfg.lhv / 1e6} MJ/kg.` },
    { name: 'f_air', label: 'Air flow map', unit: 'kg/s', default: maps.air, kind: 'table', description: `Air mass flow in kg/s (each value >= 0), same size as f_tbrake. ${gen} Value = f_fuel*AFR with AFR ${kind === 'SI' ? '14.7' : '25 at zero load falling linearly to 18 at full load'}.` },
  ];
};

const check = (p: Record<string, any>): string | null => {
  const b1 = validateBreakpoints(p.f_tbrake_t_bpt);
  if (b1) return `f_tbrake_t_bpt: ${b1}`;
  const b2 = validateBreakpoints(p.f_tbrake_n_bpt);
  if (b2) return `f_tbrake_n_bpt: ${b2}`;
  const bp = [p.f_tbrake_t_bpt, p.f_tbrake_n_bpt];
  for (const k of ['f_tbrake', 'f_fuel', 'f_air']) {
    const t = validateTable(p[k], bp);
    if (t) return `${k}: ${t}`;
  }
  for (const k of ['f_fuel', 'f_air']) {
    if ((p[k] as number[][]).some(r => r.some(v => v < 0))) return `Parameter ${k} must be >= 0 for every element`;
  }
  return null;
};

const impl = {
  execute: (ins: any[], p: Record<string, any>) => {
    const bad = check(p);
    if (bad) return { outputs: [], error: bad };
    const cmd = Number(ins[0] ?? 0), w = Number(ins[1] ?? 0);
    const N = radps2rpm(w);
    const bp = [p.f_tbrake_t_bpt, p.f_tbrake_n_bpt];
    const trq = lookupNd(p.f_tbrake, bp, [cmd, N], CLIP);
    const fuel = lookupNd(p.f_fuel, bp, [cmd, N], CLIP);
    const air = lookupNd(p.f_air, bp, [cmd, N], CLIP);
    const pwr = trq * w;
    const bsfc = pwr > 0 ? (3.6e9 * fuel) / pwr : 0;
    const info = makeBus(['AirMassFlw', 'FuelMassFlw', 'EngPwr', 'BSFC', 'EngSpdRpm'], [air, fuel, pwr, bsfc, N]);
    return { outputs: [info, trq, fuel] };
  },
};

const commonEq = (lhv: string, eta: string, afr: string) => [
  'N = EngSpd*60/(2*pi) [rpm]',
  'EngTrq = f_tbrake(TrqCmd, N); FuelFlw = f_fuel(TrqCmd, N); AirMassFlw = f_air(TrqCmd, N) (linear, clip)',
  'EngPwr = EngTrq*EngSpd; BSFC = 3.6e9*FuelFlw/EngPwr [g/kWh] if EngPwr > 0 else 0',
  `Default maps (Willans line): Pf(N) = (0.8e5 + 0.1e5*(N/1000)^1.5)*Vd*(N/60)/2, Vd = 2e-3 m^3; FuelFlw = (EngTrq*2*pi*N/60 + Pf)/(eta_ind*LHV), eta_ind = ${eta}, LHV = ${lhv} J/kg; AirMassFlw = FuelFlw*AFR, ${afr}`,
];

const refs = (slug: string, name: string) => [
  `MathWorks Powertrain Blockset documentation: ${name}, https://www.mathworks.com/help/autoblks/ref/${slug}.html`,
  'Guzzella & Onder, Introduction to Modeling and Control of Internal Combustion Engine Systems, 2nd ed., Springer 2010 (Willans line)',
];

const siPorts = ports('MappedSIEngineInfo');
export const SI_SPEC: PtBlockSpec = {
  type: 'PT_MAPPED_SI_ENGINE',
  label: 'Mapped SI Engine',
  category: CATEGORY,
  simulinkPath: PATH + 'Mapped SI Engine',
  source: 'simulink-docs',
  symbol: 'engine-si',
  inputs: siPorts.inputs,
  outputs: siPorts.outputs,
  params: paramsFor('SI', SI_CFG, SI_MAPS),
  states: [],
  equations: commonEq('43e6', '0.36', 'AFR = 14.7'),
  references: refs('mappedsiengine', 'Mapped SI Engine'),
  description: 'Spark-ignition engine described by static maps of brake torque, fuel flow and air flow versus commanded torque and engine speed. Outputs brake torque, fuel mass flow and an Info bus with air flow, power and brake-specific fuel consumption. No dynamics: the engine responds instantly to the torque command.',
  behavior: 'The speed input in rad/s is converted to rpm and the three 2-D maps are interpolated linearly (rows = commanded torque, columns = speed); inputs outside the breakpoints clip to the edge value, so nothing is extrapolated. BSFC is reported in g/kWh and is 0 when the engine power is not positive (motoring or idle). Non-monotonic breakpoints, maps whose size does not match the breakpoints, or negative fuel/air values raise a block error.',
  example: 'With the default maps, TrqCmd = 120 N*m at EngSpd = 3500 rpm (366.5 rad/s) gives EngTrq = 120 N*m, EngPwr = 120*366.5 = 43.98 kW, and the Willans-line fuel flow (43.98 kW + friction about 8.5 kW)/(0.36*43e6) = 3.39 g/s, i.e. BSFC about 277 g/kWh; AirMassFlw = 14.7 times the fuel flow.',
};

const ciPorts = ports('MappedCIEngineInfo');
export const CI_SPEC: PtBlockSpec = {
  type: 'PT_MAPPED_CI_ENGINE',
  label: 'Mapped CI Engine',
  category: CATEGORY,
  simulinkPath: PATH + 'Mapped CI Engine',
  source: 'simulink-docs',
  symbol: 'engine-ci',
  inputs: ciPorts.inputs,
  outputs: ciPorts.outputs,
  params: paramsFor('CI', CI_CFG, CI_MAPS),
  states: [],
  equations: commonEq('42.8e6', '0.42', 'AFR = 25 - 7*TrqCmd/TrqCmdMax (25 at no load to 18 at full load)'),
  references: refs('mappedciengine', 'Mapped CI Engine'),
  description: 'Compression-ignition (diesel) engine described by static maps of brake torque, fuel flow and air flow versus commanded torque and engine speed. Outputs brake torque, fuel mass flow and an Info bus with air flow, power and brake-specific fuel consumption. No dynamics: the engine responds instantly to the torque command.',
  behavior: 'The speed input in rad/s is converted to rpm and the three 2-D maps are interpolated linearly (rows = commanded torque, columns = speed); inputs outside the breakpoints clip to the edge value, so nothing is extrapolated. BSFC is reported in g/kWh and is 0 when the engine power is not positive. Diesel air flow is lean and falls from air-fuel ratio 25 at no load to 18 at full load. Non-monotonic breakpoints, maps whose size does not match the breakpoints, or negative fuel/air values raise a block error.',
  example: 'With the default maps, TrqCmd = 210 N*m at EngSpd = 2400 rpm (251.3 rad/s) gives EngTrq = 210 N*m, EngPwr = 52.78 kW, and fuel flow (52.78 kW + friction about 4.7 kW)/(0.42*42.8e6) = 3.20 g/s, i.e. BSFC about 218 g/kWh; AirMassFlw = 20.8 times the fuel flow (AFR at 60 % load).',
};

export const COMBUSTION_ENGINE_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [
  { spec: SI_SPEC, factory: definePtBlock(SI_SPEC, impl) },
  { spec: CI_SPEC, factory: definePtBlock(CI_SPEC, impl) },
];
