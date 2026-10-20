// Powertrain Blockset / Drivetrain / Wheels / Longitudinal Wheel.
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  min?: number, minExclusive?: boolean): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}), ...(minExclusive ? { minExclusive } : {}) });

const BrkPrs = inp('BrkPrs', 'Pa', 1, 'Brake actuation pressure on the pads.');
const outputs: PtPortSpec[] = [
  out('Info', 'bus', 1, 'Bus with Kappa, Fx, My, BrkTrq, Omega and Fz.', 'Bus: LongitudinalWheelInfo'),
  out('Fx', 'N', 2, 'Longitudinal tyre force on the vehicle.'),
  out('Omega', 'rad/s', 3, 'Wheel angular velocity.'),
];
const discIns: PtPortSpec[] = [
  BrkPrs,
  inp('AxlTrq', 'N*m', 2, 'Axle torque applied to the wheel.'),
  inp('Vx', 'm/s', 3, 'Longitudinal wheel hub speed.'),
  inp('Fz', 'N', 4, 'Normal load on the tyre.'),
];
const noneIns: PtPortSpec[] = [
  inp('AxlTrq', 'N*m', 1, 'Axle torque applied to the wheel.'),
  inp('Vx', 'm/s', 2, 'Longitudinal wheel hub speed.'),
  inp('Fz', 'N', 3, 'Normal load on the tyre.'),
];

const spec: PtBlockSpec = {
  type: 'PT_LONGITUDINAL_WHEEL',
  label: 'Longitudinal Wheel',
  category: 'Powertrain / Drivetrain / Wheels',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Wheels/Longitudinal Wheel',
  source: 'simulink-docs',
  symbol: 'wheel',
  inputs: discIns,
  outputs,
  variants: {
    param: 'brakeType',
    ports: { Disc: { inputs: discIns, outputs }, None: { inputs: noneIns, outputs } },
  },
  params: [
    par('Re', 'Effective rolling radius', 'm', 0.3, 'Effective rolling radius of the tyre; converts wheel speed to contact speed and force to torque.', 0, true),
    par('Iyy', 'Wheel inertia', 'kg*m^2', 0.8, 'Rotational inertia of the wheel about its spin axis.', 0, true),
    par('B', 'Stiffness factor B', '1', 10, 'Magic-formula stiffness factor; sets the slope of force against slip at zero slip.'),
    par('C', 'Shape factor C', '1', 1.9, 'Magic-formula shape factor; sets the shape of the force curve.'),
    par('D', 'Peak factor D', '1', 1, 'Magic-formula peak factor; the peak friction coefficient (force per unit normal load).', 0),
    par('E', 'Curvature factor E', '1', 0.97, 'Magic-formula curvature factor; sets the curvature near and after the peak.'),
    par('Crr', 'Rolling resistance coefficient', '1', 0.015, 'Rolling resistance coefficient; rolling moment is Re*Fz*Crr at speed.', 0),
    par('VXLOW', 'Low speed threshold', 'm/s', 1, 'Lower bound of the speed used to normalise slip; avoids division by zero near standstill.', 0, true),
    par('OMEGA_TH', 'Wheel speed threshold', 'rad/s', 1, 'Wheel speed scale over which rolling resistance and braking torque change sign smoothly.', 0, true),
    par('disc_abore', 'Brake bore diameter', 'm', 0.05, 'Diameter of the brake caliper piston bore; sets the piston area.', 0, true),
    par('Rm', 'Mean pad radius', 'm', 0.15, 'Effective radius at which the pads act on the disc.', 0, true),
    par('num_pads', 'Number of pads', '1', 2, 'Number of brake pads pressing on the disc.', 0),
    par('mu_kinetic', 'Pad friction coefficient', '1', 0.3, 'Kinetic friction coefficient between pad and disc.', 0),
    par('omega_o', 'Initial wheel speed', 'rad/s', 0, 'Wheel angular velocity at the start of the simulation.'),
    {
      name: 'brakeType', label: 'Brake type', unit: '', default: 'Disc', kind: 'enum', options: ['Disc', 'None'],
      description: 'Disc includes the BrkPrs input and a disc brake; None removes the brake and the BrkPrs port.',
    },
  ],
  states: ['Omega'],
  equations: [
    'kappa = (Re*Omega - Vx)/max(|Vx|, VXLOW)',
    'Fx = Fz*D*sin(C*atan(B*kappa - E*(B*kappa - atan(B*kappa))))',
    'My = Re*Fz*Crr*tanh(4*Omega/OMEGA_TH)',
    'Tb = mu_kinetic*max(BrkPrs,0)*(pi*disc_abore^2/4)*Rm*num_pads (Disc only, else 0)',
    'Iyy*dOmega/dt = AxlTrq - Re*Fx - My - Tb*tanh(4*Omega/OMEGA_TH)',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Longitudinal Wheel',
    'Pacejka, Tire and Vehicle Dynamics, 3rd ed., Butterworth-Heinemann 2012',
  ],
  description: 'Wheel with one rotational degree of freedom that produces a longitudinal tyre force from slip with a magic-formula tyre model. An optional disc brake and rolling resistance oppose the rotation.',
  behavior: 'Integrates wheel speed from axle torque, tyre reaction torque, rolling resistance and brake torque. Slip is normalised by the larger of the hub speed magnitude and VXLOW. Rolling and brake torques oppose rotation through a smooth tanh sign. Brake pressure cannot pull: a negative BrkPrs is treated as 0. A negative normal load is treated as a lifted tyre and gives zero force and rolling moment. With brakeType None the BrkPrs port and brake torque are removed.',
  example: 'With Re = 0.3 m, B = 10, C = 1.9, D = 1, E = 0.97, Fz = 4000 N, Vx = 20 m/s and Omega = 70 rad/s, kappa = (0.3*70 - 20)/20 = 0.05 and Fx = 4000*sin(1.9*atan(0.5 - 0.97*(0.5 - atan(0.5)))) = 4000*0.7356 = about 2.94 kN. With BrkPrs = 2 MPa, disc_abore = 0.05 m, Rm = 0.15 m, 2 pads and mu = 0.3, the brake torque is 353.4 N*m.',
};

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

interface Dyn { kappa: number; Fx: number; My: number; Tb: number; Fz: number; AxlTrq: number; th: number }

function dynamics(ins: XValue[], p: Record<string, any>, omega: number): Dyn | string {
  const disc = p.brakeType !== 'None';
  const o = disc ? 1 : 0;
  const prs = disc ? num(ins[0]) : 0;
  const AxlTrq = num(ins[o]), Vx = num(ins[o + 1]), Fz = num(ins[o + 2]);
  if (![prs, AxlTrq, Vx, Fz, omega].every(Number.isFinite)) return 'Longitudinal wheel inputs must be finite';
  const fz = Math.max(Fz, 0);
  const kappa = (p.Re * omega - Vx) / Math.max(Math.abs(Vx), p.VXLOW);
  const bk = p.B * kappa;
  const Fx = fz * p.D * Math.sin(p.C * Math.atan(bk - p.E * (bk - Math.atan(bk))));
  const th = Math.tanh((4 * omega) / p.OMEGA_TH);
  const My = p.Re * fz * p.Crr * th;
  const Tb = disc ? p.mu_kinetic * Math.max(prs, 0) * ((Math.PI * p.disc_abore * p.disc_abore) / 4) * p.Rm * p.num_pads : 0;
  return { kappa, Fx, My, Tb, Fz: fz, AxlTrq, th };
}

const factory = definePtBlock(spec, {
  init: p => ({ Omega: p.omega_o }),
  derivatives: (ins, p, state) => {
    const d = dynamics(ins, p, state.Omega);
    if (typeof d === 'string') return { Omega: 0 };
    return { Omega: (d.AxlTrq - p.Re * d.Fx - d.My - d.Tb * d.th) / p.Iyy };
  },
  execute: (ins, p, state) => {
    const d = dynamics(ins, p, state.Omega);
    if (typeof d === 'string') return { outputs: [{}, 0, 0], error: d };
    const info = makeBus(
      ['Kappa', 'Fx', 'My', 'BrkTrq', 'Omega', 'Fz'],
      [d.kappa, d.Fx, d.My, d.Tb, state.Omega, d.Fz],
    );
    return { outputs: [info, d.Fx, state.Omega] };
  },
});

export const WHEEL_BLOCKS: { spec: PtBlockSpec; factory: typeof factory }[] = [{ spec, factory }];
