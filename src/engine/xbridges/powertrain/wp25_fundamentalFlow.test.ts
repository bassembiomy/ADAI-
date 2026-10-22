// WP-25 acceptance tests: Fundamental Flow (Powertrain Blockset / Propulsion / Combustion Engine Components / Fundamental Flow).
// Two-way flow connections are realised as signal pairs (Simulink causality): volumes and boundaries output a state bus
// {Prs [Pa], Temp [K]}; restrictions and heat exchangers output one flow bus {MassFlw [kg/s], HeatFlw [W]} per side, positive
// INTO the block connected on that side.
//   Flow Restriction: compressible orifice, mdot = Cd*Area*Pu/sqrt(R*Tu)*Psi(Pd/Pu),
//     Psi(pr) = sqrt(2g/(g-1)*(pr^(2/g) - pr^((g+1)/g))) for pr > (2/(g+1))^(g/(g-1)), else sqrt(g)*(2/(g+1))^((g+1)/(2(g-1)));
//     flow from the higher pressure side; downstream side gets +mdot, upstream side -mdot; HeatFlw = MassFlw*cp*Tu.
//   Control Volume System: states mass m and internal energy U; dm/dt = sum MassFlw_i, dU/dt = sum HeatFlw_i;
//     T = U/(m*cv), cv = cp - R, P = m*R*T/V. Info: Mass, Prs, Temp. NumPorts flow inputs Flw1..FlwN.
//   Flow Boundary: constant Prs and Temp; optional Flw input reported as Info.MassFlw.
//   Heat Exchanger: orifice flow as the restriction; the gas leaves at T_out = Tu - eps*(Tu - CoolantTemp):
//     downstream HeatFlw = mdot*cp*T_out, upstream HeatFlw = -mdot*cp*Tu; Info.HeatXfr = mdot*cp*eps*(Tu - CoolantTemp).
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { makeBus } from '../bus/busCore';
import { getPowertrainSpec } from './index';

const R = 287, cp = 1005, g = cp / (cp - R);
const psi = (pr: number) => {
  const crit = (2 / (g + 1)) ** (g / (g - 1));
  return pr > crit ? Math.sqrt(2 * g / (g - 1) * (pr ** (2 / g) - pr ** ((g + 1) / g))) : Math.sqrt(g) * (2 / (g + 1)) ** ((g + 1) / (2 * (g - 1)));
};
const st = (Prs: number, Temp: number) => makeBus(['Prs', 'Temp'], [Prs, Temp]);
const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1e-12, Math.abs(b)));
const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
const FF = 'Powertrain Blockset/Propulsion/Combustion Engine Components/Fundamental Flow/';

describe('ports', () => {
  it('Simulink paths and ports', () => {
    const ports = (t: string, p: any = {}) => { const b = BLOCK_LIBRARY[t]('x', p); return [b.inputs.map(q => q.id), b.outputs.map(q => q.id)]; };
    expect(getPowertrainSpec('PT_FLOW_BOUNDARY')!.simulinkPath).toBe(FF + 'Flow Boundary');
    expect(getPowertrainSpec('PT_FLOW_RESTRICTION')!.simulinkPath).toBe(FF + 'Flow Restriction');
    expect(getPowertrainSpec('PT_CONTROL_VOLUME')!.simulinkPath).toBe(FF + 'Control Volume System');
    expect(getPowertrainSpec('PT_HEAT_EXCHANGER')!.simulinkPath).toBe(FF + 'Heat Exchanger');
    expect(ports('PT_FLOW_BOUNDARY')).toEqual([['Flw'], ['Info', 'State']]);
    expect(ports('PT_FLOW_RESTRICTION')).toEqual([['A', 'B'], ['Info', 'FlwA', 'FlwB']]);
    expect(ports('PT_HEAT_EXCHANGER')).toEqual([['A', 'B', 'CoolantTemp'], ['Info', 'FlwA', 'FlwB']]);
    expect(ports('PT_CONTROL_VOLUME', { NumPorts: 3 })).toEqual([['Flw1', 'Flw2', 'Flw3'], ['Info', 'State']]);
  });
});

describe('Flow Restriction', () => {
  const P = { Area: 2e-4, Cd: 0.8, R, cp };
  const exec = (a: any, b: any) => { const r = BLOCK_LIBRARY.PT_FLOW_RESTRICTION('r', P); return r.execute([a, b], r.params, r.state, 0).outputs as any[]; };
  it('unchoked, choked and reversed flow with enthalpy flow', () => {
    const o = exec(st(1.5e5, 320), st(1.2e5, 300));
    const md = 0.8 * 2e-4 * 1.5e5 / Math.sqrt(R * 320) * psi(1.2e5 / 1.5e5);
    rel(o[2].MassFlw, md, 1e-12); rel(o[1].MassFlw, -md, 1e-12);
    rel(o[2].HeatFlw, md * cp * 320, 1e-12); rel(o[1].HeatFlw, -md * cp * 320, 1e-12);
    const ch = exec(st(3e5, 300), st(1e5, 300));
    rel(ch[2].MassFlw, 0.8 * 2e-4 * 3e5 / Math.sqrt(R * 300) * psi(0.1), 1e-12);
    const rev = exec(st(1.2e5, 300), st(1.5e5, 330));
    rel(rev[1].MassFlw, 0.8 * 2e-4 * 1.5e5 / Math.sqrt(R * 330) * psi(0.8), 1e-12);
    rel(rev[1].HeatFlw, rev[1].MassFlw * cp * 330, 1e-12);
    expect(exec(st(1e5, 300), st(1e5, 300))[2].MassFlw).toBe(0);
  });
});

describe('Control Volume System', () => {
  it('adiabatic filling conserves energy exactly and reaches the supply pressure', () => {
    const blocks = [BLOCK_LIBRARY.PT_FLOW_BOUNDARY('src', { Prs: 2e5, Temp: 300 }), BLOCK_LIBRARY.PT_FLOW_RESTRICTION('r', { Area: 1e-5, Cd: 1, R, cp }),
      BLOCK_LIBRARY.PT_CONTROL_VOLUME('v', { NumPorts: 1, V: 1e-3, P_o: 1e5, T_o: 300, R, cp })];
    const e = new XbridgesEngine({ blocks, connections: [c('src', 'State', 'r', 'A'), c('v', 'State', 'r', 'B'), c('r', 'FlwB', 'v', 'Flw1'), c('r', 'FlwA', 'src', 'Flw')] } as any);
    const m0 = 1e5 * 1e-3 / (R * 300), cv = cp - R;
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.05, fixedStep: 1e-4 } as any);
    const i1 = e.getSignalValue('v', 'Info') as any;
    rel(i1.Mass * cv * i1.Temp - m0 * cv * 300, cp * 300 * (i1.Mass - m0), 1e-9);
    expect(i1.Temp).toBeGreaterThan(300);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 3, fixedStep: 1e-3 } as any);
    rel((e.getSignalValue('v', 'State') as any).Prs, 2e5, 1e-3);
  });

  it('through-flow between two boundaries: mass balance and isenthalpic temperature at steady state', () => {
    const blocks = [BLOCK_LIBRARY.PT_FLOW_BOUNDARY('in', { Prs: 1.5e5, Temp: 320 }), BLOCK_LIBRARY.PT_FLOW_RESTRICTION('r1', { Area: 2e-4, Cd: 0.8, R, cp }),
      BLOCK_LIBRARY.PT_CONTROL_VOLUME('v', { NumPorts: 2, V: 2e-3, P_o: 1e5, T_o: 300, R, cp }), BLOCK_LIBRARY.PT_FLOW_RESTRICTION('r2', { Area: 3e-4, Cd: 0.8, R, cp }),
      BLOCK_LIBRARY.PT_FLOW_BOUNDARY('out', { Prs: 1e5, Temp: 300 })];
    const e = new XbridgesEngine({ blocks, connections: [c('in', 'State', 'r1', 'A'), c('v', 'State', 'r1', 'B'), c('r1', 'FlwB', 'v', 'Flw1'),
      c('v', 'State', 'r2', 'A'), c('out', 'State', 'r2', 'B'), c('r2', 'FlwA', 'v', 'Flw2'), c('r2', 'FlwB', 'out', 'Flw'), c('r1', 'FlwA', 'in', 'Flw')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 2, fixedStep: 5e-4 } as any);
    const f1 = (e.getSignalValue('r1', 'FlwB') as any).MassFlw, f2 = (e.getSignalValue('r2', 'FlwB') as any).MassFlw;
    expect(f1).toBeGreaterThan(0);
    rel(f2, f1, 1e-6);
    rel((e.getSignalValue('v', 'State') as any).Temp, 320, 1e-6);
    rel((e.getSignalValue('out', 'Info') as any).MassFlw, f1, 1e-6);
  });
});

describe('Heat Exchanger', () => {
  it('cools the charge by the effectiveness and reports the heat transfer', () => {
    const blocks = [BLOCK_LIBRARY.PT_FLOW_BOUNDARY('in', { Prs: 2e5, Temp: 400 }), BLOCK_LIBRARY.PT_HEAT_EXCHANGER('hx', { eps: 0.8, Area: 3e-4, Cd: 0.8, R, cp }),
      BLOCK_LIBRARY.Constant('tc', { value: 300 }), BLOCK_LIBRARY.PT_CONTROL_VOLUME('v', { NumPorts: 2, V: 2e-3, P_o: 1.5e5, T_o: 300, R, cp }),
      BLOCK_LIBRARY.PT_FLOW_RESTRICTION('r', { Area: 2e-4, Cd: 0.8, R, cp }), BLOCK_LIBRARY.PT_FLOW_BOUNDARY('out', { Prs: 1e5, Temp: 300 })];
    const e = new XbridgesEngine({ blocks, connections: [c('in', 'State', 'hx', 'A'), c('v', 'State', 'hx', 'B'), c('tc', 'out', 'hx', 'CoolantTemp'), c('hx', 'FlwB', 'v', 'Flw1'),
      c('v', 'State', 'r', 'A'), c('out', 'State', 'r', 'B'), c('r', 'FlwA', 'v', 'Flw2')] } as any);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 2, fixedStep: 5e-4 } as any);
    rel((e.getSignalValue('v', 'State') as any).Temp, 400 - 0.8 * 100, 1e-6);
    const md = (e.getSignalValue('hx', 'FlwB') as any).MassFlw;
    rel((e.getSignalValue('hx', 'Info') as any).HeatXfr, md * cp * 0.8 * 100, 1e-9);
  });
});
