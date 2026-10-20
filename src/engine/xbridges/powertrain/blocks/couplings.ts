// Powertrain Blockset / Drivetrain / Couplings: Rotational Inertia, Torsional Compliance, Disc Clutch,
// Torque Converter and Planetary Gear.
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { prelookup, interpolateNd, validateBreakpoints, radps2rpm } from '../ptMath';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  min?: number, minExclusive?: boolean, max?: number): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}), ...(minExclusive ? { minExclusive } : {}), ...(max !== undefined ? { max } : {}) });
const vec = (name: string, label: string, unit: string, def: number[], description: string): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'vector', description });

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);
const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

// ---------------------------------------------------------------- Rotational Inertia
const inertiaSpec: PtBlockSpec = {
  type: 'PT_ROTATIONAL_INERTIA',
  label: 'Rotational Inertia',
  category: 'Powertrain / Drivetrain / Couplings',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Couplings/Rotational Inertia',
  source: 'simulink-docs',
  symbol: 'inertia',
  inputs: [
    inp('InTrq', 'N*m', 1, 'Torque driving the inertia.'),
    inp('LoadTrq', 'N*m', 2, 'Load torque opposing the rotation.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Spd, Acc and KinEnergy.', 'Bus: RotationalInertiaInfo'),
    out('Spd', 'rad/s', 2, 'Angular speed of the inertia.'),
  ],
  params: [
    par('J', 'Rotational inertia', 'kg*m^2', 0.2, 'Rotational inertia of the shaft and attached bodies.', 0, true),
    par('b', 'Viscous damping', 'N*m*s/rad', 0, 'Viscous damping coefficient; subtracts b times speed from the net torque.', 0),
    par('omega_o', 'Initial speed', 'rad/s', 0, 'Angular speed at the start of the simulation.'),
  ],
  states: ['w'],
  equations: ['J*dw/dt = InTrq - LoadTrq - b*w', 'KinEnergy = J*w^2/2'],
  references: ['MathWorks Powertrain Blockset documentation, Rotational Inertia'],
  description: 'Lumped rotating inertia with optional viscous damping. Its speed is the integral of the net torque divided by the inertia.',
  behavior: 'Integrates the angular speed from the driving torque, the load torque and the viscous damping. With constant torques the speed approaches (InTrq - LoadTrq)/b exponentially with time constant J/b. Info reports speed, acceleration and kinetic energy.',
  example: 'With J = 0.5 kg*m^2, b = 0.2 N*m*s/rad, omega_o = 10 rad/s, InTrq = 30 N*m and LoadTrq = 10 N*m held for 2 s, the speed tends to 20/0.2 = 100 rad/s with time constant 2.5 s; the block gives Spd = 59.56 rad/s at t = 2 s.',
};

const inertiaFactory = definePtBlock(inertiaSpec, {
  init: p => ({ w: p.omega_o }),
  derivatives: (ins, p, s) => {
    const T = num(ins[0]), L = num(ins[1]);
    if (![T, L, s.w].every(Number.isFinite)) return { w: 0 };
    return { w: (T - L - p.b * s.w) / p.J };
  },
  execute: (ins, p, s) => {
    const T = num(ins[0]), L = num(ins[1]);
    if (![T, L].every(Number.isFinite)) return { outputs: [{}, 0], error: 'Rotational inertia inputs must be finite' };
    const acc = (T - L - p.b * s.w) / p.J;
    return { outputs: [makeBus(['Spd', 'Acc', 'KinEnergy'], [s.w, acc, 0.5 * p.J * s.w * s.w]), s.w] };
  },
});

// ---------------------------------------------------------------- Torsional Compliance
const complianceSpec: PtBlockSpec = {
  type: 'PT_TORSIONAL_COMPLIANCE',
  label: 'Torsional Compliance',
  category: 'Powertrain / Drivetrain / Couplings',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Couplings/Torsional Compliance',
  source: 'simulink-docs',
  symbol: 'compliance',
  inputs: [
    inp('InSpd', 'rad/s', 1, 'Angular speed of the input end of the shaft.'),
    inp('OutSpd', 'rad/s', 2, 'Angular speed of the output end of the shaft.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Twist, Trq and StoredEnergy.', 'Bus: TorsionalComplianceInfo'),
    out('Trq', 'N*m', 2, 'Torque transmitted through the shaft from input to output.'),
  ],
  params: [
    par('k', 'Torsional stiffness', 'N*m/rad', 1e4, 'Torque per radian of twist between the two ends.', 0, true),
    par('b', 'Torsional damping', 'N*m*s/rad', 10, 'Torque per unit relative speed between the two ends.', 0),
    par('theta_o', 'Initial twist', 'rad', 0, 'Twist angle (input end minus output end) at the start of the simulation.'),
  ],
  states: ['theta'],
  equations: ['dtheta/dt = InSpd - OutSpd', 'Trq = k*theta + b*(InSpd - OutSpd)', 'StoredEnergy = k*theta^2/2'],
  references: ['MathWorks Powertrain Blockset documentation, Torsional Compliance'],
  description: 'Flexible shaft modelled as a torsional spring and damper in parallel between an input and an output end.',
  behavior: 'Integrates the twist angle from the speed difference of the two ends. The transmitted torque is the spring torque plus the damper torque. Info reports twist, torque and stored elastic energy.',
  example: 'With k = 5000 N*m/rad, b = 10 N*m*s/rad, theta_o = 0.01 rad, InSpd = 52 rad/s and OutSpd = 50 rad/s held for 0.5 s, the twist grows to 0.01 + 2*0.5 = 1.01 rad and Trq = 5000*1.01 + 10*2 = 5070 N*m.',
};

const complianceFactory = definePtBlock(complianceSpec, {
  init: p => ({ theta: p.theta_o }),
  derivatives: (ins, p, s) => {
    const a = num(ins[0]), b = num(ins[1]);
    if (![a, b, s.theta].every(Number.isFinite)) return { theta: 0 };
    return { theta: a - b };
  },
  execute: (ins, p, s) => {
    const a = num(ins[0]), b = num(ins[1]);
    if (![a, b].every(Number.isFinite)) return { outputs: [{}, 0], error: 'Torsional compliance inputs must be finite' };
    const trq = p.k * s.theta + p.b * (a - b);
    return { outputs: [makeBus(['Twist', 'Trq', 'StoredEnergy'], [s.theta, trq, 0.5 * p.k * s.theta * s.theta]), trq] };
  },
});

// ---------------------------------------------------------------- Disc Clutch
const clutchSpec: PtBlockSpec = {
  type: 'PT_DISC_CLUTCH',
  label: 'Disc Clutch',
  category: 'Powertrain / Drivetrain / Couplings',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Couplings/Disc Clutch',
  source: 'simulink-docs',
  symbol: 'clutch',
  inputs: [
    inp('P', 'Pa', 1, 'Clutch actuation pressure on the friction discs.'),
    inp('InTrq', 'N*m', 2, 'Torque applied to the input side.'),
    inp('LoadTrq', 'N*m', 3, 'Load torque applied to the output side.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Tk, Ts, Tc, SlipSpd, SlipPwr, Reff and Locked.', 'Bus: DiscClutchInfo'),
    out('InSpd', 'rad/s', 2, 'Angular speed of the input side.'),
    out('OutSpd', 'rad/s', 3, 'Angular speed of the output side.'),
    out('Locked', '1', 4, '1 when the discs are locked together, 0 when slipping.'),
  ],
  params: [
    par('muk', 'Kinetic friction coefficient', '1', 0.3, 'Friction coefficient while the discs slip.', 0),
    par('mus', 'Static friction coefficient', '1', 0.35, 'Friction coefficient while the discs are locked; sets the breakaway torque.', 0),
    par('Ro', 'Outer disc radius', 'm', 0.15, 'Outer radius of the friction annulus; must exceed Ri.', 0, true),
    par('Ri', 'Inner disc radius', 'm', 0.1, 'Inner radius of the friction annulus.', 0),
    par('Nf', 'Number of friction surfaces', '1', 2, 'Number of friction surface pairs transmitting torque.', 0, true),
    par('Ap', 'Piston area', 'm^2', 0.01, 'Area on which the actuation pressure acts.', 0, true),
    par('J_in', 'Input inertia', 'kg*m^2', 0.2, 'Rotational inertia of the input side.', 0, true),
    par('J_out', 'Output inertia', 'kg*m^2', 0.1, 'Rotational inertia of the output side.', 0, true),
    par('b_in', 'Input damping', 'N*m*s/rad', 0, 'Viscous damping coefficient on the input side.', 0),
    par('b_out', 'Output damping', 'N*m*s/rad', 0, 'Viscous damping coefficient on the output side.', 0),
    par('omega_tol', 'Lock speed tolerance', 'rad/s', 1e-2, 'The discs may lock when the slip speed magnitude is at most this value.', 0, true),
    par('w_in_o', 'Initial input speed', 'rad/s', 0, 'Input side speed at the start of the simulation.'),
    par('w_out_o', 'Initial output speed', 'rad/s', 0, 'Output side speed at the start of the simulation.'),
  ],
  states: ['w_in', 'w_out'],
  equations: [
    'Reff = 2/3*(Ro^3 - Ri^3)/(Ro^2 - Ri^2)',
    'Tk = muk*max(P,0)*Ap*Reff*Nf, Ts = mus*max(P,0)*Ap*Reff*Nf',
    'slipping: Tc = Tk*sign(w_in - w_out); J_in*dw_in/dt = InTrq - Tc - b_in*w_in; J_out*dw_out/dt = Tc - LoadTrq - b_out*w_out',
    'locked (|w_in - w_out| <= omega_tol and |T_lock| <= Ts): a = (InTrq - LoadTrq - b_in*w_in - b_out*w_out)/(J_in + J_out), T_lock = InTrq - b_in*w_in - J_in*a, dw_in/dt = dw_out/dt = a',
    'SlipPwr = Tc*(w_in - w_out) when slipping, 0 when locked',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Disc Clutch',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Friction clutch between an input and an output inertia. It transmits kinetic friction torque while slipping and locks the two sides together when the slip speed is small and the required holding torque is within the static capacity.',
  behavior: 'Two speed states. The capacity torques follow from the actuation pressure and the effective friction radius. While slipping, the kinetic torque acts against the relative speed. The lock decision is made at every evaluation from the current speeds: when the slip speed is within omega_tol and the holding torque is within the static capacity, both sides accelerate together, and both outputs report the momentum-weighted mean speed with Locked = 1. A holding torque above the static capacity breaks the clutch away in the direction of that torque. Info.SlipPwr is the friction power dissipated while slipping and 0 while locked. A zero crossing of the slip speed lets the solver step onto the lock-up instant.',
  example: 'With the default parameters, P = 200 kPa, no torques and w_in_o = 100 rad/s, Reff = 0.1267 m and Tk = 152 N*m. After 0.02 s the input side runs at 84.8 rad/s and the output side at 30.4 rad/s (Locked = 0, SlipPwr = 8268.8 W). Lock-up occurs at 100/(152*(1/0.2 + 1/0.1)) = 0.0439 s; after 0.1 s both sides turn at 66.67 rad/s (Locked = 1, SlipPwr = 0).',
};

interface ClutchEval {
  Tk: number; Ts: number; Tc: number; Tlock: number; Reff: number;
  locked: boolean; aIn: number; aOut: number; wIn: number; wOut: number; slip: number;
}

function clutchEval(ins: XValue[], p: Record<string, any>, s: { w_in: number; w_out: number }): ClutchEval | string {
  const P = num(ins[0]), Tin = num(ins[1]), Tl = num(ins[2]);
  if (![P, Tin, Tl, s.w_in, s.w_out].every(Number.isFinite)) return 'Disc clutch inputs must be finite';
  if (!(p.Ro > p.Ri)) return 'Disc clutch needs Ro > Ri';
  const Reff = (2 / 3) * (p.Ro ** 3 - p.Ri ** 3) / (p.Ro ** 2 - p.Ri ** 2);
  const cap = Math.max(P, 0) * p.Ap * Reff * p.Nf;
  const Tk = p.muk * cap, Ts = p.mus * cap;
  const slip = s.w_in - s.w_out;
  const aLock = (Tin - Tl - p.b_in * s.w_in - p.b_out * s.w_out) / (p.J_in + p.J_out);
  const Tlock = Tin - p.b_in * s.w_in - p.J_in * aLock;
  if (Math.abs(slip) <= p.omega_tol && Math.abs(Tlock) <= Ts) {
    const m = (p.J_in * s.w_in + p.J_out * s.w_out) / (p.J_in + p.J_out);
    return { Tk, Ts, Tc: Tlock, Tlock, Reff, locked: true, aIn: aLock, aOut: aLock, wIn: m, wOut: m, slip: 0 };
  }
  // Inside the tolerance band the slip direction is the direction of the torque that broke the clutch away.
  const dir = Math.abs(slip) > p.omega_tol ? sign(slip) : sign(Tlock);
  const Tc = Tk * dir;
  return {
    Tk, Ts, Tc, Tlock, Reff, locked: false,
    aIn: (Tin - Tc - p.b_in * s.w_in) / p.J_in, aOut: (Tc - Tl - p.b_out * s.w_out) / p.J_out,
    wIn: s.w_in, wOut: s.w_out, slip,
  };
}

const clutchFactory = definePtBlock(clutchSpec, {
  init: p => ({ w_in: p.w_in_o, w_out: p.w_out_o }),
  derivatives: (ins, p, s) => {
    const e = clutchEval(ins, p, s);
    if (typeof e === 'string') return { w_in: 0, w_out: 0 };
    return { w_in: e.aIn, w_out: e.aOut };
  },
  zeroCrossings: (_ins, _p, s) => [s.w_in - s.w_out],
  execute: (ins, p, s) => {
    const e = clutchEval(ins, p, s);
    if (typeof e === 'string') return { outputs: [{}, 0, 0, 0], error: e };
    const slipPwr = e.locked ? 0 : e.Tc * e.slip;
    const info = makeBus(
      ['Tk', 'Ts', 'Tc', 'SlipSpd', 'SlipPwr', 'Reff', 'Locked'],
      [e.Tk, e.Ts, e.Tc, e.slip, slipPwr, e.Reff, e.locked ? 1 : 0],
    );
    return { outputs: [info, e.wIn, e.wOut, e.locked ? 1 : 0] };
  },
});

// ---------------------------------------------------------------- Torque Converter
const converterSpec: PtBlockSpec = {
  type: 'PT_TORQUE_CONVERTER',
  label: 'Torque Converter',
  category: 'Powertrain / Drivetrain / Couplings',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Couplings/Torque Converter',
  source: 'simulink-docs',
  symbol: 'torque-converter',
  inputs: [
    inp('ImpSpd', 'rad/s', 1, 'Impeller (pump) angular speed.'),
    inp('TurbSpd', 'rad/s', 2, 'Turbine angular speed.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with SR, K, TR and ImpSpdRpm.', 'Bus: TorqueConverterInfo'),
    out('ImpTrq', 'N*m', 2, 'Torque absorbed by the impeller.'),
    out('TurbTrq', 'N*m', 3, 'Torque delivered by the turbine.'),
  ],
  params: [
    vec('SR_bp', 'Speed ratio breakpoints', '1', [0, 0.5, 0.8, 0.9, 1], 'Strictly increasing speed ratio breakpoints in [0, 1].'),
    vec('K_tbl', 'Capacity factor table', 'rpm/sqrt(N*m)', [150, 155, 170, 200, 400], 'Capacity factor K at each speed ratio breakpoint; must be positive.'),
    vec('TR_tbl', 'Torque ratio table', '1', [2.2, 1.6, 1.1, 1.0, 1.0], 'Turbine to impeller torque ratio at each speed ratio breakpoint.'),
  ],
  states: [],
  equations: [
    'SR = clamp(TurbSpd/ImpSpd, 0, 1)',
    'ImpTrq = (ImpSpd_rpm/K(SR))^2, TurbTrq = TR(SR)*ImpTrq, both 0 for ImpSpd <= 0',
    'K and TR by linear interpolation of the tables, held constant outside the breakpoints',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Torque Converter',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Static torque converter model. The impeller torque follows from the capacity factor at the current speed ratio and the turbine torque from the torque ratio.',
  behavior: 'No states. The speed ratio is the turbine speed over the impeller speed limited to 0 to 1. The capacity factor K and the torque ratio TR are interpolated linearly from the tables and held at the end values outside the breakpoints. The impeller torque is the square of the impeller speed in rpm over K. With a stopped or reversed impeller both torques are 0.',
  example: 'With the default tables, an impeller at 2000 rpm (209.44 rad/s) and a turbine at 65 percent of its speed give SR = 0.65, K = 162.5 and TR = 1.35. The block returns ImpTrq = 151.48 N*m and TurbTrq = 204.50 N*m.',
};

const converterFactory = definePtBlock(converterSpec, {
  execute: (ins, p) => {
    const wi = num(ins[0]), wt = num(ins[1]);
    if (![wi, wt].every(Number.isFinite)) return { outputs: [{}, 0, 0], error: 'Torque converter inputs must be finite' };
    const bp = p.SR_bp as number[], K = p.K_tbl as number[], TR = p.TR_tbl as number[];
    const bad = validateBreakpoints(bp);
    if (bad) return { outputs: [{}, 0, 0], error: `SR_bp: ${bad}` };
    if (K.length !== bp.length || TR.length !== bp.length) return { outputs: [{}, 0, 0], error: 'K_tbl and TR_tbl must have the same length as SR_bp' };
    if (!K.every(k => k > 0)) return { outputs: [{}, 0, 0], error: 'K_tbl must be positive' };
    if (!(wi > 0)) return { outputs: [makeBus(['SR', 'K', 'TR', 'ImpSpdRpm'], [0, 0, 0, 0]), 0, 0] };
    const SR = Math.min(Math.max(wt / wi, 0), 1);
    const kf = [prelookup(bp, SR, { extrap: 'clip' })];
    const opts = { interp: 'linear', extrap: 'clip' } as const;
    const k = interpolateNd(K, kf, opts), tr = interpolateNd(TR, kf, opts);
    const rpm = radps2rpm(wi);
    const imp = (rpm / k) ** 2;
    return { outputs: [makeBus(['SR', 'K', 'TR', 'ImpSpdRpm'], [SR, k, tr, rpm]), imp, tr * imp] };
  },
});

// ---------------------------------------------------------------- Planetary Gear
const planetarySpec: PtBlockSpec = {
  type: 'PT_PLANETARY_GEAR',
  label: 'Planetary Gear',
  category: 'Powertrain / Drivetrain / Couplings',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Couplings/Planetary Gear',
  source: 'simulink-docs',
  symbol: 'planetary',
  inputs: [
    inp('CarrierTrq', 'N*m', 1, 'Torque applied to the planet carrier.'),
    inp('SunTrq', 'N*m', 2, 'Torque applied to the sun gear.'),
    inp('RingTrq', 'N*m', 3, 'Torque applied to the ring gear.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with the three powers and the ring to sun speed ratio.', 'Bus: PlanetaryGearInfo'),
    out('CarrierSpd', 'rad/s', 2, 'Carrier angular speed.'),
    out('SunSpd', 'rad/s', 3, 'Sun gear angular speed.'),
    out('RingSpd', 'rad/s', 4, 'Ring gear angular speed.'),
  ],
  params: [
    par('Ns', 'Sun teeth', '1', 30, 'Number of teeth on the sun gear.', 0, true),
    par('Nr', 'Ring teeth', '1', 78, 'Number of teeth on the ring gear.', 0, true),
    par('Jc', 'Carrier inertia', 'kg*m^2', 0.05, 'Rotational inertia of the carrier.', 0, true),
    par('Js', 'Sun inertia', 'kg*m^2', 0.01, 'Rotational inertia of the sun gear.', 0, true),
    par('Jr', 'Ring inertia', 'kg*m^2', 0.08, 'Rotational inertia of the ring gear.', 0, true),
    par('wc_o', 'Initial carrier speed', 'rad/s', 0, 'Carrier speed at the start of the simulation.'),
    par('ws_o', 'Initial sun speed', 'rad/s', 0, 'Sun speed at the start of the simulation.'),
  ],
  states: ['w_c', 'w_s'],
  equations: [
    'Willis: w_r = (w_c*(Ns + Nr) - w_s*Ns)/Nr',
    'a = (Ns + Nr)/Nr, b = Ns/Nr',
    '[[Jc + Jr*a^2, -Jr*a*b], [-Jr*a*b, Js + Jr*b^2]]*[dw_c/dt, dw_s/dt] = [CarrierTrq + a*RingTrq, SunTrq - b*RingTrq]',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Planetary Gear',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Ideal planetary gear set with sun, carrier and ring, each with its own inertia. Two speeds are independent; the third follows from the kinematic constraint.',
  behavior: 'States are the carrier and sun speeds. The ring speed follows from the Willis relation. The accelerations solve the 2x2 mass matrix that eliminates the internal gear contact force, driven by the three applied torques. Info reports the power of each member and the sun to ring speed ratio.',
  example: 'With the default tooth counts and inertias, wc_o = 10 rad/s, ws_o = 20 rad/s and constant CarrierTrq = 50 N*m, SunTrq = -12 N*m and RingTrq = 5 N*m, after 0.5 s the block gives CarrierSpd = 133.73 rad/s, SunSpd = -57.41 rad/s and RingSpd = 207.25 rad/s.',
};

const planetaryMatrix = (p: Record<string, any>) => {
  const a = (p.Ns + p.Nr) / p.Nr, b = p.Ns / p.Nr;
  return { a, b, m11: p.Jc + p.Jr * a * a, m12: -p.Jr * a * b, m22: p.Js + p.Jr * b * b };
};

const planetaryFactory = definePtBlock(planetarySpec, {
  init: p => ({ w_c: p.wc_o, w_s: p.ws_o }),
  derivatives: (ins, p, s) => {
    const Tc = num(ins[0]), Ts = num(ins[1]), Tr = num(ins[2]);
    if (![Tc, Ts, Tr, s.w_c, s.w_s].every(Number.isFinite)) return { w_c: 0, w_s: 0 };
    const { a, b, m11, m12, m22 } = planetaryMatrix(p);
    const q1 = Tc + a * Tr, q2 = Ts - b * Tr;
    const det = m11 * m22 - m12 * m12;
    return { w_c: (m22 * q1 - m12 * q2) / det, w_s: (m11 * q2 - m12 * q1) / det };
  },
  execute: (ins, p, s) => {
    const Tc = num(ins[0]), Ts = num(ins[1]), Tr = num(ins[2]);
    if (![Tc, Ts, Tr].every(Number.isFinite)) return { outputs: [{}, 0, 0, 0], error: 'Planetary gear inputs must be finite' };
    const wr = (s.w_c * (p.Ns + p.Nr) - s.w_s * p.Ns) / p.Nr;
    const info = makeBus(['CarrierPwr', 'SunPwr', 'RingPwr', 'RingToSunRatio'], [Tc * s.w_c, Ts * s.w_s, Tr * wr, -p.Nr / p.Ns]);
    return { outputs: [info, s.w_c, s.w_s, wr] };
  },
});

export const COUPLING_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => any }[] = [
  { spec: inertiaSpec, factory: inertiaFactory },
  { spec: complianceSpec, factory: complianceFactory },
  { spec: clutchSpec, factory: clutchFactory },
  { spec: converterSpec, factory: converterFactory },
  { spec: planetarySpec, factory: planetaryFactory },
];
