// Powertrain Blockset / Vehicle Dynamics / Vehicle Body / Vehicle Body 1DOF Longitudinal.
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const R_AIR = 287.058; // J/(kg*K)

const inp = (id: string, unit: string, simulinkIndex: number, description: string, dimensions?: number[]): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description, ...(dimensions ? { dimensions } : {}) });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  min?: number, minExclusive?: boolean): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}), ...(minExclusive ? { minExclusive } : {}) });

const spec: PtBlockSpec = {
  type: 'PT_VEHICLE_BODY_1DOF',
  label: 'Vehicle Body 1DOF Longitudinal',
  category: 'Powertrain / Vehicle Dynamics / Vehicle Body',
  simulinkPath: 'Powertrain Blockset/Vehicle Dynamics/Vehicle Body/Vehicle Body 1DOF Longitudinal',
  source: 'simulink-docs',
  symbol: 'vehicle',
  inputs: [
    inp('FwF', 'N', 1, 'Longitudinal force on each front wheel.'),
    inp('FwR', 'N', 2, 'Longitudinal force on each rear wheel.'),
    inp('Grade', 'deg', 3, 'Road grade angle; positive uphill.'),
    inp('WindXYZ', 'm/s', 4, 'Wind velocity vector in the vehicle frame; the x component acts along the travel direction.', [3]),
    inp('Temp', 'K', 5, 'Ambient air temperature, used for the air density.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with x, xdot, xddot, Fd, Fl, Mp, FzF, FzR and Grade.', 'Bus: VehicleBody1DOFInfo'),
    out('xdot', 'm/s', 2, 'Longitudinal vehicle speed.'),
    out('FzF', 'N', 3, 'Normal force on each front wheel.'),
    out('FzR', 'N', 4, 'Normal force on each rear wheel.'),
  ],
  params: [
    par('NF', 'Number of front wheels', '1', 2, 'Number of front wheels sharing the front axle load and driven by FwF.', 1),
    par('NR', 'Number of rear wheels', '1', 2, 'Number of rear wheels sharing the rear axle load and driven by FwR.', 1),
    par('M', 'Vehicle mass', 'kg', 1200, 'Total vehicle mass; sets the inertia and the weight.', 0, true),
    par('a', 'Front axle to CG', 'm', 1.4, 'Longitudinal distance from the front axle to the center of gravity.', 0, true),
    par('b', 'Rear axle to CG', 'm', 1.6, 'Longitudinal distance from the rear axle to the center of gravity.', 0, true),
    par('h', 'CG height', 'm', 0.35, 'Height of the center of gravity above the road; sets the load transfer under acceleration.', 0),
    par('Af', 'Frontal area', 'm^2', 2, 'Effective frontal area facing the air stream.', 0, true),
    par('Cd', 'Drag coefficient', '1', 0.3, 'Aerodynamic drag coefficient; scales the drag force opposing relative air motion.', 0),
    par('Cl', 'Lift coefficient', '1', 0.1, 'Aerodynamic lift coefficient; positive lift reduces the total normal load.'),
    par('Cpm', 'Pitch moment coefficient', '1', 0.1, 'Aerodynamic pitch moment coefficient; shifts load between front and rear axles.'),
    par('Pabs', 'Absolute air pressure', 'Pa', 101325, 'Ambient absolute pressure, used for the air density.', 0, true),
    par('g', 'Gravitational acceleration', 'm/s^2', 9.81, 'Gravitational acceleration acting on the vehicle mass.', 0, true),
    par('xdot_o', 'Initial speed', 'm/s', 0, 'Longitudinal vehicle speed at the start of the simulation.'),
  ],
  states: ['x', 'xdot'],
  equations: [
    'm*xddot = NF*FwF + NR*FwR - Fd - m*g*sin(gamma)',
    'Fd = 1/2*rho*Cd*Af*(xdot - wx)^2*sign(xdot - wx), rho = Pabs/(R*Temp), R = 287.058 J/(kg*K)',
    'Fl = 1/2*rho*Cl*Af*(xdot - wx)^2, Mp = 1/2*rho*Cpm*Af*(a+b)*(xdot - wx)^2',
    'FzF = (b*m*g*cos(gamma) - h*(Fd + m*g*sin(gamma) + m*xddot) - Mp)/((a+b)*NF) - Fl/(2*NF)',
    'FzR = (a*m*g*cos(gamma) + h*(Fd + m*g*sin(gamma) + m*xddot) + Mp)/((a+b)*NR) - Fl/(2*NR)',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Vehicle Body 1DOF Longitudinal',
    'Gillespie, Fundamentals of Vehicle Dynamics, SAE 1992, ch. 2',
  ],
  description: 'Rigid vehicle body moving along the road with one degree of freedom. Wheel forces, grade and aerodynamic drag set the acceleration, and the block also computes the normal load on each axle including load transfer.',
  behavior: 'Integrates position and speed from the net longitudinal force. Drag acts against the speed relative to the wind and uses the air density from pressure and temperature. The normal forces include static weight split, load transfer from acceleration and drag, lift and pitch moment. Reverse motion is allowed.',
  example: 'A 1200 kg vehicle at rest on flat ground with a = 1.4 m, b = 1.6 m and two wheels per axle gives FzF = 1.6*1200*9.81/(3.0*2) = 3139.2 N per front wheel and FzR = 2746.8 N per rear wheel.',
};

interface Dyn {
  xddot: number; Fd: number; Fl: number; Mp: number; FzF: number; FzR: number; grade: number;
}

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

function dynamics(ins: XValue[], p: Record<string, any>, xdot: number): Dyn | string {
  const FwF = num(ins[0]), FwR = num(ins[1]), grade = num(ins[2]), Temp = num(ins[4]);
  const w = ins[3];
  const wx = Array.isArray(w) ? Number((w as any[]).flat(Infinity)[0]) : num(w);
  if (![FwF, FwR, grade, wx, Temp, xdot].every(Number.isFinite)) return 'Vehicle body inputs must be finite';
  if (Temp <= 0) return 'Temp must be > 0 K';
  const gam = (grade * Math.PI) / 180;
  const rho = p.Pabs / (R_AIR * Temp);
  const vr = xdot - wx;
  const q = 0.5 * rho * p.Af * vr * vr;
  const Fd = q * p.Cd * Math.sign(vr);
  const Fl = q * p.Cl;
  const Mp = q * p.Cpm * (p.a + p.b);
  const wg = p.M * p.g * Math.sin(gam);
  const xddot = (p.NF * FwF + p.NR * FwR - Fd - wg) / p.M;
  const k = p.h * (Fd + wg + p.M * xddot);
  const L = p.a + p.b, N = p.M * p.g * Math.cos(gam);
  const FzF = (p.b * N - k - Mp) / (L * p.NF) - Fl / (2 * p.NF);
  const FzR = (p.a * N + k + Mp) / (L * p.NR) - Fl / (2 * p.NR);
  return { xddot, Fd, Fl, Mp, FzF, FzR, grade };
}

const factory = definePtBlock(spec, {
  init: p => ({ x: 0, xdot: p.xdot_o }),
  derivatives: (ins, p, state) => {
    const d = dynamics(ins, p, state.xdot);
    return typeof d === 'string' ? { x: 0, xdot: 0 } : { x: state.xdot, xdot: d.xddot };
  },
  execute: (ins, p, state) => {
    const d = dynamics(ins, p, state.xdot);
    if (typeof d === 'string') return { outputs: [{}, 0, 0, 0], error: d };
    const info = makeBus(
      ['x', 'xdot', 'xddot', 'Fd', 'Fl', 'Mp', 'FzF', 'FzR', 'Grade'],
      [state.x, state.xdot, d.xddot, d.Fd, d.Fl, d.Mp, d.FzF, d.FzR, d.grade],
    );
    return { outputs: [info, state.xdot, d.FzF, d.FzR] };
  },
});

export const VEHICLE_BODY_BLOCKS: { spec: PtBlockSpec; factory: typeof factory }[] = [{ spec, factory }];
