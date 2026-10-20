// Powertrain Blockset / Energy Storage and Auxiliary Drive / Batteries (WP-17).
// Sign convention: BattCurr > 0 discharges the battery.
import type { XBlock } from '../../types';
import { definePtBlock } from '../ptBlock';
import { lookupNd, validateBreakpoints, validateTable } from '../ptMath';
import { makeBus } from '../../bus/busCore';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const CATEGORY = 'Powertrain / Energy Storage and Auxiliary Drive / Batteries' as const;
const PATH = 'Powertrain Blockset/Energy Storage and Auxiliary Drive/Batteries/';
const CLIP = { interp: 'linear', extrap: 'clip' } as const;

const ports = (infoType: string): { inputs: PtPortSpec[]; outputs: PtPortSpec[] } => ({
  inputs: [
    { id: 'BattCurr', name: 'BattCurr', direction: 'input', unit: 'A', simulinkIndex: 1, description: 'Battery pack current in A. Positive discharges the battery, negative charges it.' },
    { id: 'BattTemp', name: 'BattTemp', direction: 'input', unit: 'K', simulinkIndex: 2, description: 'Battery cell temperature in K.' },
  ],
  outputs: [
    { id: 'Info', name: 'Info', direction: 'output', unit: 'bus', dataType: `Bus: ${infoType}`, simulinkIndex: 1, description: 'Bus of battery internals (charge, SOC, open-circuit voltage, power, loss, temperature).' },
    { id: 'BattSoc', name: 'BattSoc', direction: 'output', unit: '1', simulinkIndex: 2, description: 'State of charge, Q / BattChargeMax (1 = full). Not clamped.' },
    { id: 'BattVolt', name: 'BattVolt', direction: 'output', unit: 'V', simulinkIndex: 3, description: 'Pack terminal voltage in V.' },
  ],
});

const commonParams = (): PtParamSpec[] => [
  { name: 'Ns', label: 'Cells in series', unit: '1', default: 96, min: 1, kind: 'scalar', description: 'Number of cells in series per parallel string. Pack voltage scales with Ns; 96 cells at 3.7 V give about 355 V.' },
  { name: 'Np', label: 'Parallel strings', unit: '1', default: 1, min: 1, kind: 'scalar', description: 'Number of parallel cell strings. Each string carries BattCurr/Np; with Np = 2 and 100 A each string carries 50 A.' },
  { name: 'BattChargeMax', label: 'Maximum charge', unit: 'A*h', default: 5, min: 0, minExclusive: true, kind: 'scalar', description: 'Charge capacity in A*h that corresponds to SOC = 1. Must be greater than 0. With 5 A*h, a stored charge of 4 A*h is SOC 0.8.' },
  { name: 'BattCapInit', label: 'Initial charge', unit: 'A*h', default: 5, min: 0, kind: 'scalar', description: 'Initial stored charge Q(0) in A*h, between 0 and BattChargeMax. With BattChargeMax 5 and BattCapInit 4 the simulation starts at SOC 0.8.' },
];

const invalidCommon = (p: Record<string, any>): string | null => {
  if (p.BattCapInit > p.BattChargeMax) return `Parameter BattCapInit (${p.BattCapInit}) must be <= BattChargeMax (${p.BattChargeMax})`;
  return null;
};

// ---------------- Datasheet Battery ----------------
const dsPorts = ports('DatasheetBatteryInfo');
const DS_SPEC: PtBlockSpec = {
  type: 'PT_DATASHEET_BATTERY',
  label: 'Datasheet Battery',
  category: CATEGORY,
  simulinkPath: PATH + 'Datasheet Battery',
  source: 'simulink-docs',
  symbol: 'battery',
  inputs: dsPorts.inputs,
  outputs: dsPorts.outputs,
  params: [
    ...commonParams(),
    { name: 'CapSOCBpts', label: 'SOC breakpoints', unit: '1', default: [0, 0.1, 0.5, 0.9, 1], kind: 'vector', description: 'State-of-charge breakpoints (strictly increasing) for the Em and RInt tables, e.g. [0 0.1 0.5 0.9 1]. Lookups clip outside the range.' },
    { name: 'CapTempBpts', label: 'Temperature breakpoints', unit: 'K', default: [253.15, 298.15], kind: 'vector', description: 'Cell temperature breakpoints in K (strictly increasing) for the Em and RInt tables, e.g. [253.15 298.15] = -20 C and 25 C.' },
    { name: 'Em', label: 'Open-circuit voltage per cell', unit: 'V', default: [[3.0, 3.1], [3.45, 3.5], [3.65, 3.7], [3.95, 4.0], [4.15, 4.2]], kind: 'table', description: 'Per-cell open-circuit voltage in V, size length(CapSOCBpts) x length(CapTempBpts). Default is a plausible Li-ion curve from 3.1 V empty to 4.2 V full at 25 C.' },
    { name: 'RInt', label: 'Internal resistance per cell', unit: 'Ohm', default: [[0.006, 0.003], [0.004, 0.002], [0.0035, 0.0018], [0.0035, 0.0018], [0.004, 0.002]], kind: 'table', description: 'Per-cell internal resistance in Ohm, same size as Em. Resistance is higher cold and at low SOC.' },
  ],
  states: ['Q'],
  equations: [
    'dQ/dt = -BattCurr/3600 [A*h/s], Q(0) = BattCapInit',
    'BattSoc = Q / BattChargeMax',
    'BattVolt = Ns*(Em(SOC,T) - (BattCurr/Np)*RInt(SOC,T))',
    'BattOcv = Ns*Em; BattPwr = BattVolt*BattCurr; BattLoss = Ns*Np*(BattCurr/Np)^2*RInt',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation: Datasheet Battery, https://www.mathworks.com/help/autoblks/ref/datasheetbattery.html',
  ],
  description: 'Battery pack of Ns series by Np parallel cells described by datasheet data: open-circuit voltage Em and internal resistance RInt as 2-D tables of state of charge and temperature, per cell. Positive BattCurr discharges the pack. Outputs terminal voltage BattVolt, state of charge BattSoc and an Info bus.',
  behavior: 'The stored charge Q is integrated by coulomb counting (dQ/dt = -BattCurr/3600 in A*h). SOC = Q/BattChargeMax is not clamped, but the tables clip at their first and last breakpoints. The terminal voltage is Ns times the cell open-circuit voltage minus the resistive drop of one string (BattCurr/Np times RInt). Invalid breakpoints (not strictly increasing), tables whose size does not match the breakpoints, or BattCapInit outside 0..BattChargeMax raise a block error.',
  example: 'Ns 96, Np 1, BattChargeMax 5, BattCapInit 4 (SOC 0.8) with 50 A discharge for 36 s removes 0.5 A*h, giving SOC 0.7. With default tables at 298.15 K and SOC 0.7 the cell Em is 3.85 V and RInt 0.0018 Ohm, so BattVolt = 96*(3.85 - 50*0.0018) = 360.96 V, BattPwr = 18.05 kW.',
};

const dsCheck = (p: Record<string, any>): string | null => {
  const c = invalidCommon(p);
  if (c) return c;
  const b1 = validateBreakpoints(p.CapSOCBpts);
  if (b1) return `CapSOCBpts: ${b1}`;
  const b2 = validateBreakpoints(p.CapTempBpts);
  if (b2) return `CapTempBpts: ${b2}`;
  const bp = [p.CapSOCBpts, p.CapTempBpts];
  const t1 = validateTable(p.Em, bp);
  if (t1) return `Em: ${t1}`;
  const t2 = validateTable(p.RInt, bp);
  if (t2) return `RInt: ${t2}`;
  return null;
};

const dsFactory = definePtBlock(DS_SPEC, {
  init: p => [p.BattCapInit],
  execute: (ins, p, state) => {
    const bad = dsCheck(p);
    if (bad) return { outputs: [], error: bad };
    const I = Number(ins[0] ?? 0), T = Number(ins[1] ?? 0);
    const Q = (state as number[])[0];
    const soc = Q / p.BattChargeMax;
    const bp = [p.CapSOCBpts, p.CapTempBpts];
    const em = lookupNd(p.Em, bp, [soc, T], CLIP);
    const r = lookupNd(p.RInt, bp, [soc, T], CLIP);
    const volt = p.Ns * (em - (I / p.Np) * r);
    const info = makeBus(
      ['BattCharge', 'BattSoc', 'BattOcv', 'BattPwr', 'BattLoss', 'BattTemp'],
      [Q, soc, p.Ns * em, volt * I, p.Ns * p.Np * (I / p.Np) ** 2 * r, T],
    );
    return { outputs: [info, soc, volt] };
  },
  derivatives: (ins) => [-Number(ins[0] ?? 0) / 3600],
});

// ---------------- Equivalent Circuit Battery ----------------
const ecPorts = ports('EquivalentCircuitBatteryInfo');
const lenNote = 'Same length as SOC_BP.';
const EC_SPEC: PtBlockSpec = {
  type: 'PT_EQUIVALENT_CIRCUIT_BATTERY',
  label: 'Equivalent Circuit Battery',
  category: CATEGORY,
  simulinkPath: PATH + 'Equivalent Circuit Battery',
  source: 'simulink-docs',
  symbol: 'ecm-battery',
  inputs: ecPorts.inputs,
  outputs: ecPorts.outputs,
  params: [
    ...commonParams(),
    { name: 'SOC_BP', label: 'SOC breakpoints', unit: '1', default: [0, 0.5, 1], kind: 'vector', description: 'State-of-charge breakpoints (strictly increasing) of the Em, R0, R1 and C1 tables, e.g. [0 0.5 1]. Lookups clip outside the range.' },
    { name: 'Em', label: 'Open-circuit voltage per cell', unit: 'V', default: [3.2, 3.7, 4.15], kind: 'vector', description: `Per-cell open-circuit voltage in V versus SOC. ${lenNote}` },
    { name: 'R0', label: 'Series resistance per cell', unit: 'Ohm', default: [0.01, 0.008, 0.009], kind: 'vector', description: `Per-cell ohmic series resistance in Ohm versus SOC. ${lenNote}` },
    { name: 'R1', label: 'RC branch resistance per cell', unit: 'Ohm', default: [0.004, 0.004, 0.004], kind: 'vector', description: `Per-cell resistance of the RC (diffusion) branch in Ohm versus SOC; must be > 0. ${lenNote}` },
    { name: 'C1', label: 'RC branch capacitance per cell', unit: 'F', default: [2000, 2000, 2000], kind: 'vector', description: `Per-cell capacitance of the RC branch in F versus SOC; must be > 0. R1=0.004 Ohm with C1=2000 F gives a time constant of 8 s. ${lenNote}` },
  ],
  states: ['Q', 'V1'],
  equations: [
    'dQ/dt = -BattCurr/3600 [A*h/s], Q(0) = BattCapInit; BattSoc = Q / BattChargeMax',
    'dV1/dt = (BattCurr/Np)/C1(SOC) - V1/(R1(SOC)*C1(SOC)), V1(0) = 0',
    'BattVolt = Ns*(Em(SOC) - (BattCurr/Np)*R0(SOC) - V1)',
    'BattOcv = Ns*Em; BattPwr = BattVolt*BattCurr; BattLoss = Ns*Np*((BattCurr/Np)^2*R0 + V1^2/R1)',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation: Equivalent Circuit Battery, https://www.mathworks.com/help/autoblks/ref/equivalentcircuitbattery.html',
    'Plett, Battery Management Systems Vol. I, Artech House 2015, ch. 2',
  ],
  description: 'Battery pack of Ns series by Np parallel cells modelled by a first-order equivalent circuit per cell: open-circuit voltage Em, series resistance R0 and one RC branch (R1, C1), all as 1-D tables of state of charge. Positive BattCurr discharges the pack. BattTemp is an input, but in this version the tables depend on SOC only (temperature-dependent tables are a documented gap versus the MathWorks block).',
  behavior: 'Charge Q is integrated by coulomb counting and the RC branch voltage V1 follows a first-order lag with time constant R1*C1. The terminal voltage is Ns*(Em - I/Np*R0 - V1), so after a current step it jumps by the R0 drop and then sags exponentially by the V1 drop; at rest V1 decays to zero and BattVolt returns to Ns*Em. Gap: BattTemp is passed to the Info bus only; tables are not temperature dependent here. Non-monotonic SOC_BP, table lengths different from SOC_BP, or R1 or C1 not greater than 0 raise a block error.',
  example: 'Ns 10, Np 1, BattChargeMax 5, BattCapInit 4, default tables, 20 A discharge for 30 s: SOC = (4 - 20*30/3600)/5 = 0.7667, V1 = 20*0.004*(1 - exp(-30/8)) = 0.0781 V, Em = 3.94 V and R0 = 0.00853 Ohm at that SOC, so BattVolt = 10*(3.94 - 20*0.00853 - 0.0781) = 36.92 V.',
};

const ecCheck = (p: Record<string, any>): string | null => {
  const c = invalidCommon(p);
  if (c) return c;
  const b = validateBreakpoints(p.SOC_BP);
  if (b) return `SOC_BP: ${b}`;
  for (const k of ['Em', 'R0', 'R1', 'C1']) {
    const t = validateTable(p[k], [p.SOC_BP]);
    if (t) return `${k}: ${t}`;
  }
  for (const k of ['R1', 'C1']) {
    if (!(p[k] as number[]).every(v => v > 0)) return `Parameter ${k} must be > 0 for every element`;
  }
  return null;
};

const ecLook = (p: Record<string, any>, soc: number) => {
  const bp = [p.SOC_BP];
  const f = (k: string) => lookupNd(p[k], bp, [soc], CLIP);
  return { em: f('Em'), r0: f('R0'), r1: f('R1'), c1: f('C1') };
};

const ecFactory = definePtBlock(EC_SPEC, {
  init: p => [p.BattCapInit, 0],
  execute: (ins, p, state) => {
    const bad = ecCheck(p);
    if (bad) return { outputs: [], error: bad };
    const I = Number(ins[0] ?? 0), T = Number(ins[1] ?? 0);
    const [Q, V1] = state as number[];
    const soc = Q / p.BattChargeMax;
    const { em, r0, r1 } = ecLook(p, soc);
    const volt = p.Ns * (em - (I / p.Np) * r0 - V1);
    const info = makeBus(
      ['BattCharge', 'BattSoc', 'BattOcv', 'V1', 'BattPwr', 'BattLoss', 'BattTemp'],
      [Q, soc, p.Ns * em, V1, volt * I, p.Ns * p.Np * ((I / p.Np) ** 2 * r0 + (V1 * V1) / r1), T],
    );
    return { outputs: [info, soc, volt] };
  },
  derivatives: (ins, p, state) => {
    const bad = ecCheck(p);
    const [Q, V1] = state as number[];
    if (bad) return [0, 0];
    const I = Number(ins[0] ?? 0);
    const { r1, c1 } = ecLook(p, Q / p.BattChargeMax);
    return [-I / 3600, (I / p.Np) / c1 - V1 / (r1 * c1)];
  },
});

export const BATTERY_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [
  { spec: DS_SPEC, factory: dsFactory },
  { spec: EC_SPEC, factory: ecFactory },
];
