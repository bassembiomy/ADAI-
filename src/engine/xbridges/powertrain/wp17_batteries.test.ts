// WP-17 acceptance tests: Datasheet Battery and Equivalent Circuit Battery
// (Powertrain Blockset / Energy Storage and Auxiliary Drive / Batteries). Sign convention: BattCurr > 0 discharges.
// Datasheet Battery (pack of Ns series x Np parallel cells, tables per cell):
//   dQ/dt = -BattCurr/3600 [Ah/s],  Q(0) = BattCapInit [Ah],  BattSoc = Q / BattChargeMax
//   BattVolt = Ns * ( Em(SOC, T) - (BattCurr/Np) * RInt(SOC, T) )      (2-D linear tables, clip)
// Equivalent Circuit Battery (one RC branch per element of R1/C1 ..., per cell, linear tables vs SOC, T fixed):
//   dV1/dt = (BattCurr/Np)/C1 - V1/(R1*C1)
//   BattVolt = Ns * ( Em(SOC) - (BattCurr/Np)*R0(SOC) - V1 )
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';
import { isBus } from '../bus/busCore';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const interp1 = (xs: number[], ys: number[], x: number) => {
  const u = Math.min(Math.max(x, xs[0]), xs[xs.length - 1]);
  let i = 0; while (i < xs.length - 2 && u > xs[i + 1]) i++;
  const f = (u - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + f * (ys[i + 1] - ys[i]);
};

function runBattery(type: string, params: any, current: number, temp: number, stop: number, dt = 0.1) {
  const blocks = [
    BLOCK_LIBRARY.Constant('i', { value: current }),
    BLOCK_LIBRARY.Constant('t', { value: temp }),
    BLOCK_LIBRARY[type]('bat', params)
  ];
  const e = new XbridgesEngine({ blocks, connections: [
    { sourceBlock: 'i', sourcePort: 'out', targetBlock: 'bat', targetPort: 'BattCurr' },
    { sourceBlock: 't', sourcePort: 'out', targetBlock: 'bat', targetPort: 'BattTemp' }
  ] } as any);
  Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: stop, fixedStep: dt } as any);
  return e;
}

describe('PT_DATASHEET_BATTERY', () => {
  const soc = [0, 0.5, 1], temps = [253.15, 298.15];
  const Em = [[3.0, 3.1], [3.6, 3.7], [4.1, 4.2]];
  const RInt = [[0.004, 0.002], [0.003, 0.0015], [0.0035, 0.0018]];
  const P = { Ns: 96, Np: 2, BattChargeMax: 10, BattCapInit: 8, CapSOCBpts: soc, CapTempBpts: temps, Em, RInt };

  it('ports, path and parameters', () => {
    expect(getPowertrainSpec('PT_DATASHEET_BATTERY')!.simulinkPath).toBe('Powertrain Blockset/Energy Storage and Auxiliary Drive/Batteries/Datasheet Battery');
    const b = BLOCK_LIBRARY.PT_DATASHEET_BATTERY('b', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['BattCurr', 'A'], ['BattTemp', 'K']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['BattSoc', '1'], ['BattVolt', 'V']]);
    for (const k of ['Ns', 'Np', 'BattChargeMax', 'BattCapInit', 'CapSOCBpts', 'CapTempBpts', 'Em', 'RInt']) expect(b.params, k).toHaveProperty(k);
  });

  it('coulomb counting: SOC falls linearly at constant discharge current', () => {
    const I = 36, stop = 100; // 36 A for 100 s = 1 Ah
    const e = runBattery('PT_DATASHEET_BATTERY', P, I, 298.15, stop);
    rel(e.getSignalValue('bat', 'BattSoc') as number, (8 - I * stop / 3600) / 10, 1e-9);
  });

  it('terminal voltage = Ns*(Em - I/Np*R) from the 2-D tables at the current SOC and temperature', () => {
    const I = 50, T = 275.65, stop = 10;
    const e = runBattery('PT_DATASHEET_BATTERY', P, I, T, stop);
    const s = e.getSignalValue('bat', 'BattSoc') as number;
    rel(s, (8 - I * stop / 3600) / 10, 1e-9);
    // bilinear in (SOC, T): SOC between 0.5 and 1, T halfway between the breakpoints.
    const fs = (s - 0.5) / 0.5, ft = (T - 253.15) / 45;
    const bil = (t: number[][]) => (1 - fs) * ((1 - ft) * t[1][0] + ft * t[1][1]) + fs * ((1 - ft) * t[2][0] + ft * t[2][1]);
    rel(e.getSignalValue('bat', 'BattVolt') as number, 96 * (bil(Em) - (I / 2) * bil(RInt)), 1e-9);
  });

  it('negative current charges; Info is a bus with power and loss terms', () => {
    const e = runBattery('PT_DATASHEET_BATTERY', P, -72, 298.15, 50);
    rel(e.getSignalValue('bat', 'BattSoc') as number, (8 + 72 * 50 / 3600) / 10, 1e-9);
    const info = e.getSignalValue('bat', 'Info') as any;
    expect(isBus(info)).toBe(true);
    for (const k of ['BattPwr', 'BattLoss', 'BattCharge']) expect(info, k).toHaveProperty(k);
    const v = e.getSignalValue('bat', 'BattVolt') as number;
    rel(info.BattPwr, v * -72, 1e-9);
    rel(info.BattCharge, 8 + 72 * 50 / 3600, 1e-9);
    expect(info.BattLoss).toBeGreaterThan(0);
  });

  it('rejects inconsistent tables and non-physical capacity as block errors', () => {
    for (const bad of [{ ...P, BattChargeMax: 0 }, { ...P, Em: [[3, 3], [3.5, 3.5]] }, { ...P, CapSOCBpts: [0, 0.6, 0.5] }]) {
      const e = runBattery('PT_DATASHEET_BATTERY', bad, 1, 298.15, 0.2);
      expect(e.diagnostics.some(d => d.code === 'BLOCK_RUNTIME_FAULT' && d.blockIds?.includes('bat'))).toBe(true);
    }
  });
});

describe('PT_EQUIVALENT_CIRCUIT_BATTERY', () => {
  const socBp = [0, 0.5, 1];
  const P = { Ns: 10, Np: 1, BattChargeMax: 5, BattCapInit: 4, SOC_BP: socBp, Em: [3.2, 3.7, 4.15], R0: [0.01, 0.008, 0.009], R1: [0.004, 0.004, 0.004], C1: [2000, 2000, 2000] };

  it('ports, path and parameters', () => {
    expect(getPowertrainSpec('PT_EQUIVALENT_CIRCUIT_BATTERY')!.simulinkPath).toBe('Powertrain Blockset/Energy Storage and Auxiliary Drive/Batteries/Equivalent Circuit Battery');
    const b = BLOCK_LIBRARY.PT_EQUIVALENT_CIRCUIT_BATTERY('b', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['BattCurr', 'A'], ['BattTemp', 'K']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['BattSoc', '1'], ['BattVolt', 'V']]);
  });

  it('RC branch voltage follows the exact first-order response; terminal voltage includes R0 and V1', () => {
    const I = 20, stop = 30;
    const e = runBattery('PT_EQUIVALENT_CIRCUIT_BATTERY', P, I, 298.15, stop, 0.01);
    const s = e.getSignalValue('bat', 'BattSoc') as number;
    rel(s, (4 - I * stop / 3600) / 5, 1e-9);
    const tau = 0.004 * 2000;
    const V1 = I * 0.004 * (1 - Math.exp(-stop / tau)); // R1, C1 constant across SOC here
    const expected = 10 * (interp1(socBp, P.Em, s) - I * interp1(socBp, P.R0, s) - V1);
    rel(e.getSignalValue('bat', 'BattVolt') as number, expected, 1e-7);
  });

  it('rest after a pulse: V1 relaxes and the terminal voltage returns to OCV', () => {
    const e = runBattery('PT_EQUIVALENT_CIRCUIT_BATTERY', P, 0, 298.15, 5, 0.01);
    rel(e.getSignalValue('bat', 'BattVolt') as number, 10 * interp1(socBp, P.Em, 0.8), 1e-12);
  });
});
