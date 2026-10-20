// WP-11 acceptance tests: Vehicle Body 1DOF Longitudinal (Powertrain Blockset / Vehicle Dynamics / Vehicle Body).
// Reference equations (Powertrain Blockset "Vehicle Body 1DOF Longitudinal"), per-wheel forces, gamma = grade:
//   m*xddot = NF*FwF + NR*FwR - Fd - m*g*sin(gamma)
//   Fd = 1/2*rho*Cd*Af*(xdot - wx)^2*sign(xdot - wx),   rho = Pabs/(R*Temp), R = 287.058 J/(kg*K)
//   Fl = 1/2*rho*Cl*Af*(xdot - wx)^2,  Mp = 1/2*rho*Cpm*Af*(a+b)*(xdot - wx)^2
//   FzF = (b*m*g*cos(gamma) - h*(Fd + m*g*sin(gamma) + m*xddot) - Mp) / ((a+b)*NF) - Fl/(2*NF)
//   FzR = (a*m*g*cos(gamma) + h*(Fd + m*g*sin(gamma) + m*xddot) + Mp) / ((a+b)*NR) - Fl/(2*NR)
// Expected values are computed here, independently of the block, with a reference RK4 integrator.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { getPowertrainSpec } from './index';
import { isBus } from '../bus/busCore';

const T = 'PT_VEHICLE_BODY_1DOF';
const R_AIR = 287.058;
const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

const P = { NF: 2, NR: 2, M: 1200, a: 1.4, b: 1.6, h: 0.35, Af: 2, Cd: 0.3, Cl: 0, Cpm: 0, Pabs: 101325, g: 9.81, xdot_o: 10 };

function reference(p: typeof P, FwF: number, FwR: number, gradeDeg: number, wx: number, temp: number) {
  const gam = gradeDeg * Math.PI / 180;
  const rho = p.Pabs / (R_AIR * temp);
  const forces = (v: number) => {
    const vr = v - wx;
    const Fd = 0.5 * rho * p.Cd * p.Af * vr * vr * Math.sign(vr);
    const Fl = 0.5 * rho * p.Cl * p.Af * vr * vr;
    const Mp = 0.5 * rho * p.Cpm * p.Af * (p.a + p.b) * vr * vr;
    const acc = (p.NF * FwF + p.NR * FwR - Fd - p.M * p.g * Math.sin(gam)) / p.M;
    const k = p.h * (Fd + p.M * p.g * Math.sin(gam) + p.M * acc);
    const FzF = (p.b * p.M * p.g * Math.cos(gam) - k - Mp) / ((p.a + p.b) * p.NF) - Fl / (2 * p.NF);
    const FzR = (p.a * p.M * p.g * Math.cos(gam) + k + Mp) / ((p.a + p.b) * p.NR) - Fl / (2 * p.NR);
    return { acc, FzF, FzR, Fd, Fl };
  };
  return { forces, rho };
}

function rk4(f: (v: number) => number, v0: number, dt: number, n: number) {
  let v = v0;
  for (let i = 0; i < n; i++) {
    const k1 = f(v), k2 = f(v + dt / 2 * k1), k3 = f(v + dt / 2 * k2), k4 = f(v + dt * k3);
    v += dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return v;
}

function buildModel(params: any, FwF: number, FwR: number, grade: number, wind: number[], temp: number) {
  const blocks = [
    BLOCK_LIBRARY.Constant('fwf', { value: FwF }),
    BLOCK_LIBRARY.Constant('fwr', { value: FwR }),
    BLOCK_LIBRARY.Constant('grade', { value: grade }),
    BLOCK_LIBRARY.Constant('wind', { value: `[${wind.join(' ')}]` }),
    BLOCK_LIBRARY.Constant('temp', { value: temp }),
    BLOCK_LIBRARY[T]('veh', params)
  ];
  const c = (s: string, t: string) => ({ sourceBlock: s, sourcePort: 'out', targetBlock: 'veh', targetPort: t });
  return new XbridgesEngine({ blocks, connections: [c('fwf', 'FwF'), c('fwr', 'FwR'), c('grade', 'Grade'), c('wind', 'WindXYZ'), c('temp', 'Temp')] } as any);
}

describe('PT_VEHICLE_BODY_1DOF ports and parameters (G1/G2)', () => {
  it('has the Simulink ports in order with SI units', () => {
    const s = getPowertrainSpec(T)!;
    expect(s.simulinkPath).toBe('Powertrain Blockset/Vehicle Dynamics/Vehicle Body/Vehicle Body 1DOF Longitudinal');
    const b = BLOCK_LIBRARY[T]('v', {});
    expect(b.inputs.map(p => [p.id, p.unit])).toEqual([['FwF', 'N'], ['FwR', 'N'], ['Grade', 'deg'], ['WindXYZ', 'm/s'], ['Temp', 'K']]);
    expect(b.outputs.map(p => [p.id, p.unit])).toEqual([['Info', 'bus'], ['xdot', 'm/s'], ['FzF', 'N'], ['FzR', 'N']]);
    expect(b.inputs.find(p => p.id === 'WindXYZ')!.dimensions).toEqual([3]);
  });

  it('exposes the mask parameters with defaults', () => {
    const b = BLOCK_LIBRARY[T]('v', {});
    for (const k of ['NF', 'NR', 'M', 'a', 'b', 'h', 'Af', 'Cd', 'Cl', 'Cpm', 'Pabs', 'g', 'xdot_o']) expect(b.params, k).toHaveProperty(k);
    expect(b.params.NF).toBe(2);
    expect(b.params.NR).toBe(2);
    expect(b.params.g).toBe(9.81);
    expect(b.params.Pabs).toBe(101325);
    expect(b.params.xdot_o).toBe(0);
  });
});

describe('PT_VEHICLE_BODY_1DOF physics (G4)', () => {
  it('static loads at rest on flat ground split m*g by the axle distances', () => {
    const p = { ...P, xdot_o: 0 };
    const e = buildModel(p, 0, 0, 0, [0, 0, 0], 293.15);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.1, fixedStep: 0.01 } as any);
    rel(e.getSignalValue('veh', 'xdot') as number, 0, 1e-12);
    rel(e.getSignalValue('veh', 'FzF') as number, p.b * p.M * p.g / ((p.a + p.b) * p.NF), 1e-9);
    rel(e.getSignalValue('veh', 'FzR') as number, p.a * p.M * p.g / ((p.a + p.b) * p.NR), 1e-9);
  });

  it('speed and axle loads follow the reference ODE under force, grade and head wind', () => {
    const FwF = 800, FwR = 150, grade = 4, wind = [-3, 0, 0], temp = 280;
    const ref = reference(P, FwF, FwR, grade, wind[0], temp);
    const e = buildModel(P, FwF, FwR, grade, wind, temp);
    const dt = 0.01, n = 300;
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: n * dt, fixedStep: dt } as any);
    const v = e.getSignalValue('veh', 'xdot') as number;
    rel(v, rk4(x => ref.forces(x).acc, P.xdot_o, dt, n), 1e-6);
    const f = ref.forces(v);
    rel(e.getSignalValue('veh', 'FzF') as number, f.FzF, 1e-6);
    rel(e.getSignalValue('veh', 'FzR') as number, f.FzR, 1e-6);
  });

  it('total normal load equals m*g*cos(gamma) minus lift, whatever the pitch moment', () => {
    const p = { ...P, Cl: 0.25, Cpm: 0.12, xdot_o: 30 };
    const grade = -6, temp = 300, wind = [5, 0, 0];
    const e = buildModel(p, 0, 0, grade, wind, temp);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.01, fixedStep: 0.01 } as any);
    const v = e.getSignalValue('veh', 'xdot') as number;
    const { rho } = reference(p, 0, 0, grade, wind[0], temp);
    const Fl = 0.5 * rho * p.Cl * p.Af * (v - wind[0]) ** 2;
    const total = p.NF * (e.getSignalValue('veh', 'FzF') as number) + p.NR * (e.getSignalValue('veh', 'FzR') as number);
    rel(total, p.M * p.g * Math.cos(grade * Math.PI / 180) - Fl, 1e-9);
  });

  it('drag opposes the relative air speed (tail wind faster than the car pushes it forward)', () => {
    const p = { ...P, xdot_o: 5 };
    const e = buildModel(p, 0, 0, 0, [15, 0, 0], 293.15);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 1, fixedStep: 0.01 } as any);
    expect(e.getSignalValue('veh', 'xdot') as number).toBeGreaterThan(5);
  });

  it('coasts down a grade from rest: speed goes negative (reverse motion is allowed)', () => {
    const p = { ...P, xdot_o: 0 };
    const e = buildModel(p, 0, 0, 10, [0, 0, 0], 293.15);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 1, fixedStep: 0.01 } as any);
    const ref = reference(p, 0, 0, 10, 0, 293.15);
    rel(e.getSignalValue('veh', 'xdot') as number, rk4(x => ref.forces(x).acc, 0, 0.01, 100), 1e-6);
    expect(e.getSignalValue('veh', 'xdot') as number).toBeLessThan(0);
  });

  it('Info is a bus with position, speed, acceleration and drag', () => {
    const e = buildModel(P, 500, 0, 0, [0, 0, 0], 293.15);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.5, fixedStep: 0.01 } as any);
    const info = e.getSignalValue('veh', 'Info') as any;
    expect(isBus(info)).toBe(true);
    for (const k of ['x', 'xdot', 'xddot', 'Fd', 'FzF', 'FzR']) expect(info, k).toHaveProperty(k);
    rel(info.xdot, e.getSignalValue('veh', 'xdot') as number, 1e-12);
    rel(info.x, 10 * 0.5, 0.05); // ~ xdot_o * t, refined by the small acceleration
  });

  it('rejects non-physical parameters as a block error', () => {
    const e = buildModel({ ...P, M: 0 }, 0, 0, 0, [0, 0, 0], 293.15);
    Solvers.runFixedStep(e, { solver: 'ode4', startTime: 0, stopTime: 0.02, fixedStep: 0.01 } as any);
    expect(e.diagnostics.some(d => d.code === 'BLOCK_RUNTIME_FAULT' && d.blockIds?.includes('veh'))).toBe(true);
  });
});
