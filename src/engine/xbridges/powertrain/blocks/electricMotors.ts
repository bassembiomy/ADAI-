// Powertrain Blockset / Propulsion / Electric Motors and Inverters (WP-19).
// Sign convention: positive torque and BattAmp = motoring / battery discharge.
import type { XBlock } from '../../types';
import { definePtBlock } from '../ptBlock';
import { lookupNd, validateBreakpoints, validateTable } from '../ptMath';
import { makeBus } from '../../bus/busCore';
import type { PtBlockSpec } from '../ptSpec';

const CATEGORY = 'Powertrain / Propulsion / Electric Motors and Inverters' as const;
const PATH = 'Powertrain Blockset/Propulsion/Electric Motors and Inverters/';
const CLIP = { interp: 'linear', extrap: 'clip' } as const;

const MAPPED_SPEC: PtBlockSpec = {
  type: 'PT_MAPPED_MOTOR',
  label: 'Mapped Motor',
  category: CATEGORY,
  simulinkPath: PATH + 'Mapped Motor',
  source: 'simulink-docs',
  symbol: 'motor-mapped',
  inputs: [
    { id: 'TrqCmd', name: 'TrqCmd', direction: 'input', unit: 'N*m', simulinkIndex: 1, description: 'Torque command in N*m. Positive motors, negative regenerates. Limited to the torque envelope.' },
    { id: 'Spd', name: 'Spd', direction: 'input', unit: 'rad/s', simulinkIndex: 2, description: 'Motor shaft speed in rad/s. The envelope and loss map use its magnitude.' },
    { id: 'BattVolt', name: 'BattVolt', direction: 'input', unit: 'V', simulinkIndex: 3, description: 'Battery (DC link) voltage in V. Must be greater than 0.' },
  ],
  outputs: [
    { id: 'Info', name: 'Info', direction: 'output', unit: 'bus', dataType: 'Bus: MappedMotorInfo', simulinkIndex: 1, description: 'Bus with MechPwr, ElecPwr, PwrLoss, TrqLimit and Spd.' },
    { id: 'MotTrq', name: 'MotTrq', direction: 'output', unit: 'N*m', simulinkIndex: 2, description: 'Motor torque in N*m after the envelope limit and the first-order response.' },
    { id: 'BattAmp', name: 'BattAmp', direction: 'output', unit: 'A', simulinkIndex: 3, description: 'Battery current in A, ElecPwr/BattVolt. Positive discharges the battery.' },
  ],
  params: [
    { name: 'Tc', label: 'Torque response time constant', unit: 's', default: 0.02, min: 0, minExclusive: true, kind: 'scalar', description: 'Time constant in s of the first-order torque response. Must be greater than 0. With 0.02 s the torque reaches 63% of a step after 20 ms.' },
    { name: 'w_t', label: 'Envelope speed breakpoints', unit: 'rad/s', default: [0, 500, 1000], kind: 'vector', description: 'Speed breakpoints in rad/s (strictly increasing, magnitude) of the maximum torque envelope, e.g. [0 500 1000]. Lookups clip outside the range.' },
    { name: 'T_t', label: 'Maximum torque', unit: 'N*m', default: [300, 300, 150], kind: 'vector', description: 'Maximum torque magnitude in N*m at each w_t breakpoint (each >= 0), same length as w_t. [300 300 150] gives a constant-torque region then field weakening.' },
    { name: 'w_eff_bp', label: 'Loss map speed breakpoints', unit: 'rad/s', default: [0, 1000], kind: 'vector', description: 'Speed breakpoints in rad/s (strictly increasing, magnitude) for the rows of losses_table.' },
    { name: 'T_eff_bp', label: 'Loss map torque breakpoints', unit: 'N*m', default: [0, 300], kind: 'vector', description: 'Torque magnitude breakpoints in N*m (strictly increasing) for the columns of losses_table.' },
    { name: 'losses_table', label: 'Power loss table', unit: 'W', default: [[200, 2000], [1200, 6000]], kind: 'table', description: 'Total motor and inverter power loss in W (each >= 0), size length(w_eff_bp) x length(T_eff_bp): rows are speed, columns are torque magnitude. Clips outside the range.' },
  ],
  states: ['MotTrq'],
  equations: [
    'Tlim = interp1(w_t, T_t, |Spd|) (clip); Tsat = clamp(TrqCmd, -Tlim, Tlim)',
    'dMotTrq/dt = (Tsat - MotTrq)/Tc, MotTrq(0) = 0',
    'MechPwr = MotTrq*Spd; PwrLoss = interp2(w_eff_bp, T_eff_bp, losses_table, |Spd|, |MotTrq|) (clip)',
    'ElecPwr = MechPwr + PwrLoss; BattAmp = ElecPwr/BattVolt',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation: Mapped Motor, https://www.mathworks.com/help/autoblks/ref/mappedmotor.html',
    'Hendershot & Miller, Design of Brushless Permanent-Magnet Machines, 2010 (loss-map approach)',
  ],
  description: 'Electric motor and inverter modelled by a torque envelope and a power-loss map. The torque command is limited by the speed-dependent maximum torque, followed by a first-order response. Battery current follows from mechanical power plus the mapped loss divided by battery voltage.',
  behavior: 'The command is clamped to plus or minus the envelope Tlim(|Spd|) and the motor torque lags it with time constant Tc. Mechanical power is MotTrq*Spd; losses are looked up on |Spd| and |MotTrq| and always add to the electrical power, so regeneration returns less than the mechanical power and BattAmp turns negative only when regenerated power exceeds the losses. Non-monotonic breakpoints, tables of the wrong size, negative torque limits or losses, Tc not greater than 0, or BattVolt not greater than 0 (or not finite) raise a block error.',
  example: 'With the defaults, TrqCmd 150 N*m at Spd 400 rad/s settles at MotTrq 150 N*m (Tlim 300). The loss map at 400 rad/s and 150 N*m gives 0.4 and 0.5 fractions: 0.6*(0.5*200+0.5*2000)+0.4*(0.5*1200+0.5*6000) = 0.6*1100 + 0.4*3600 = 2100 W. ElecPwr = 150*400 + 2100 = 62100 W, so BattAmp = 62100/350 = 177.4 A at 350 V.',
};

const check = (p: Record<string, any>): string | null => {
  for (const k of ['w_t', 'w_eff_bp', 'T_eff_bp']) {
    const b = validateBreakpoints(p[k]);
    if (b) return `${k}: ${b}`;
  }
  const t1 = validateTable(p.T_t, [p.w_t]);
  if (t1) return `T_t: ${t1}`;
  if (!(p.T_t as number[]).every(v => v >= 0)) return 'Parameter T_t must be >= 0 for every element';
  const t2 = validateTable(p.losses_table, [p.w_eff_bp, p.T_eff_bp]);
  if (t2) return `losses_table: ${t2}`;
  if (!(p.losses_table as number[][]).flat().every(v => v >= 0)) return 'Parameter losses_table must be >= 0 for every element';
  return null;
};

const tlimOf = (p: Record<string, any>, w: number): number => lookupNd(p.T_t, [p.w_t], [Math.abs(w)], CLIP);

const mappedFactory = definePtBlock(MAPPED_SPEC, {
  init: () => [0],
  execute: (ins, p, state) => {
    const bad = check(p);
    if (bad) return { outputs: [], error: bad };
    const w = Number(ins[1] ?? 0), volt = Number(ins[2] ?? 0);
    if (!Number.isFinite(volt) || volt <= 0) return { outputs: [], error: `BattVolt must be finite and > 0 (got ${volt})` };
    const trq = (state as number[])[0];
    const tlim = tlimOf(p, w);
    const mech = trq * w;
    const loss = lookupNd(p.losses_table, [p.w_eff_bp, p.T_eff_bp], [Math.abs(w), Math.abs(trq)], CLIP);
    const elec = mech + loss;
    const info = makeBus(['MechPwr', 'ElecPwr', 'PwrLoss', 'TrqLimit', 'Spd'], [mech, elec, loss, tlim, w]);
    return { outputs: [info, trq, elec / volt] };
  },
  derivatives: (ins, p, state) => {
    const trq = (state as number[])[0];
    if (check(p)) return [0];
    const cmd = Number(ins[0] ?? 0), w = Number(ins[1] ?? 0);
    const tlim = tlimOf(p, w);
    const tsat = Math.min(Math.max(cmd, -tlim), tlim);
    return [(tsat - trq) / p.Tc];
  },
});

export const ELECTRIC_MOTOR_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [
  { spec: MAPPED_SPEC, factory: mappedFactory },
];
