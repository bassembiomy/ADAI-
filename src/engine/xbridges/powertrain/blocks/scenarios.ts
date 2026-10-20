// Powertrain Blockset / Vehicle Scenarios: Drive Cycle Source and Longitudinal Driver (WP-10).
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import type { PtBlockSpec, PtPortSpec } from '../ptSpec';
import { DRIVE_CYCLES } from '../cycles/driveCycles';

const CYCLE_OPTIONS = ['FTP75', 'UDDS', 'HWFET', 'US06', 'NEDC', 'WLTP Class 3', 'JC08', 'Workspace variable'];
const NOT_SHIPPED = ['NEDC', 'WLTP Class 3', 'JC08'];
const MPH = 0.44704;

const dcOut: PtPortSpec = {
  id: 'VelRef', name: 'VelRef', direction: 'output', unit: 'm/s', simulinkIndex: 1,
  description: 'Reference vehicle speed at the current time, in the unit selected by outUnit (m/s by default).',
};

export const DRIVE_CYCLE_SPEC: PtBlockSpec = {
  type: 'PT_DRIVE_CYCLE_SOURCE',
  label: 'Drive Cycle Source',
  category: 'Powertrain / Vehicle Scenarios / Drive Cycle and Maneuvers',
  simulinkPath: 'Powertrain Blockset/Vehicle Scenarios/Drive Cycle and Maneuvers/Drive Cycle Source',
  source: 'simulink-docs',
  symbol: 'drive-cycle',
  inputs: [],
  outputs: [dcOut],
  params: [
    { name: 'cycleVar', label: 'Drive cycle', unit: '', kind: 'enum', default: 'FTP75', options: CYCLE_OPTIONS,
      description: 'Speed schedule to follow. FTP75, UDDS, HWFET and US06 ship with ADIA (EPA schedules, 1 s samples). NEDC, WLTP Class 3 and JC08 are not shipped and return an error; supply them with Workspace variable.' },
    { name: 'wsVar', label: 'Workspace variable [t v]', unit: 's, m/s', kind: 'table', default: [[0, 0], [10, 0]],
      description: 'Used when the drive cycle is Workspace variable. Two columns [t v] with t in s (strictly increasing, at least 2 rows) and v in m/s, whatever outUnit is. Example [0 0; 10 5; 20 5; 30 0].' },
    { name: 'outUnit', label: 'Output unit', unit: '', kind: 'enum', default: 'm/s', options: ['m/s', 'km/h', 'mph'],
      description: 'Unit of VelRef: m/s, km/h (m/s * 3.6) or mph (m/s / 0.44704). Example: 10 m/s gives 36 km/h or 22.37 mph.' },
    { name: 'Ts', label: 'Sample time', unit: 's', kind: 'scalar', default: 0, min: 0,
      description: 'Sample period. 0 interpolates linearly between cycle samples; Ts > 0 holds the value at floor(t/Ts)*Ts for the whole period (zero-order hold). Example Ts = 1 on a 1 s cycle gives a staircase.' },
    { name: 'repeatCycle', label: 'Repeat cycle', unit: '', kind: 'enum', default: 'off', options: ['off', 'on'],
      description: 'on: the cycle restarts after its duration (t mod duration). off: the last speed is held after the end. Example: US06 lasts 600 s, so at t = 700 s on gives the speed at 100 s.' },
  ],
  states: [],
  equations: [
    'VelRef(t) = interp(t_k, v_k, tq) / unitScale, tq = t (Ts = 0) or floor(t/Ts)*Ts (Ts > 0)',
    'repeatCycle on: t <- t mod T_end; off: t clamped to [t_0, T_end]',
    'unitScale = 1 (m/s), 1/3.6 (km/h), 0.44704 (mph)',
    'FTP75 = UDDS(0..1369 s), 600 s soak at 0, UDDS(0..505 s); duration 2474 s',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation: Drive Cycle Source',
    'U.S. EPA Dynamometer Driver Schedules (UDDS, HWFET, US06, FTP-75), public domain',
  ],
  description: 'Generates a reference vehicle speed from a standard drive cycle (FTP75, UDDS, HWFET, US06) or from a user [t v] table.',
  behavior: 'VelRef is a pure function of the simulation time: linear interpolation of the 1 s cycle samples (or a zero-order hold when Ts > 0), converted to outUnit. After the end the last speed is held, or the cycle repeats when repeatCycle is on. The block keeps no state. NEDC, WLTP Class 3 and JC08 data are not shipped and raise an error.',
  example: 'FTP75 in m/s: at t = 20 s VelRef follows the UDDS start (about 0 to 1.3 m/s); at t = 1500 s the vehicle is in the 600 s soak and VelRef = 0; the cycle covers 17.77 km with a top speed of 91.25 km/h.',
};

function parseTable(wsVar: unknown): { t: number[]; v: number[] } {
  if (!Array.isArray(wsVar) || wsVar.length < 2 || !wsVar.every(r => Array.isArray(r) && r.length === 2)) {
    throw new Error('wsVar must be a table with two columns [t v] and at least 2 rows');
  }
  const t: number[] = [], v: number[] = [];
  for (const r of wsVar as number[][]) {
    if (!Number.isFinite(r[0]) || !Number.isFinite(r[1])) throw new Error('wsVar values must be finite');
    t.push(r[0]); v.push(r[1]);
  }
  for (let i = 1; i < t.length; i++) {
    if (!(t[i] > t[i - 1])) throw new Error('wsVar time column must be strictly increasing');
  }
  return { t, v };
}

function sampleAt(t0: number, dt: number | null, tArr: number[] | null, v: number[], tq: number): number {
  const n = v.length;
  if (dt !== null) {
    const x = (tq - t0) / dt;
    const i = Math.min(Math.floor(x), n - 2);
    const f = x - i;
    return v[i] + f * (v[i + 1] - v[i]);
  }
  const ta = tArr!;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ta[mid] <= tq) lo = mid; else hi = mid;
  }
  const f = (tq - ta[lo]) / (ta[hi] - ta[lo]);
  return v[lo] + f * (v[hi] - v[lo]);
}

const driveCycleFactory = definePtBlock(DRIVE_CYCLE_SPEC, {
  execute(_ins, p, _state, t) {
    const name = String(p.cycleVar);
    if (NOT_SHIPPED.includes(name)) {
      return { outputs: [0], error: `${name} data is not shipped with ADIA; use 'Workspace variable' with a [t v] table` };
    }
    let t0 = 0, dt: number | null = 1, tArr: number[] | null = null, v: number[], tEnd: number;
    if (name === 'Workspace variable') {
      const tab = parseTable(p.wsVar);
      tArr = tab.t; v = tab.v; dt = null; t0 = tab.t[0]; tEnd = tab.t[tab.t.length - 1];
    } else {
      const c = DRIVE_CYCLES[name as keyof typeof DRIVE_CYCLES];
      v = c.v; t0 = c.t0; tEnd = c.t0 + (c.v.length - 1) * c.dt;
    }
    const Ts = Number(p.Ts);
    let tq = Ts > 0 ? Math.floor(t / Ts) * Ts : t;
    if (p.repeatCycle === 'on') {
      const dur = tEnd - t0;
      tq = t0 + (((tq - t0) % dur) + dur) % dur;
    }
    tq = Math.min(Math.max(tq, t0), tEnd);
    const ms = sampleAt(t0, dt, tArr, v, tq);
    const out = p.outUnit === 'km/h' ? ms * 3.6 : p.outUnit === 'mph' ? ms / MPH : ms;
    return { outputs: [out] };
  },
});

const num = (x: XValue): number => (typeof x === 'number' ? x : Number(x));

export const DRIVER_SPEC: PtBlockSpec = {
  type: 'PT_LONGITUDINAL_DRIVER',
  label: 'Longitudinal Driver',
  category: 'Powertrain / Vehicle Scenarios / Driver',
  simulinkPath: 'Powertrain Blockset/Vehicle Scenarios/Driver/Longitudinal Driver',
  source: 'simulink-docs',
  symbol: 'driver',
  inputs: [
    { id: 'VelRef', name: 'VelRef', direction: 'input', unit: 'm/s', simulinkIndex: 1, description: 'Reference vehicle speed.' },
    { id: 'VelFdbk', name: 'VelFdbk', direction: 'input', unit: 'm/s', simulinkIndex: 2, description: 'Measured (feedback) vehicle speed.' },
    { id: 'Grade', name: 'Grade', direction: 'input', unit: 'deg', simulinkIndex: 3, description: 'Road grade angle, positive uphill.' },
  ],
  outputs: [
    { id: 'Info', name: 'Info', direction: 'output', unit: 'bus', dataType: 'Bus: LongitudinalDriverInfo', simulinkIndex: 1,
      description: 'Bus with VelErr, Cmd (unsaturated command), CmdSat (saturated command) and Integrator (state z).' },
    { id: 'AccelCmd', name: 'AccelCmd', direction: 'output', unit: '1', simulinkIndex: 2, description: 'Normalized acceleration command in [0, 1].' },
    { id: 'DecelCmd', name: 'DecelCmd', direction: 'output', unit: '1', simulinkIndex: 3, description: 'Normalized deceleration (braking) command in [0, 1].' },
  ],
  params: [
    { name: 'Kp', label: 'Proportional gain', unit: '1', kind: 'scalar', default: 1,
      description: 'Proportional gain on the speed error. With vnom = 30 m/s, Kp = 1 and a 3 m/s error add 0.1 to the command.' },
    { name: 'Ki', label: 'Integral gain', unit: '1/s', kind: 'scalar', default: 0.1,
      description: 'Integral gain applied to the integrated error z. Ki = 0 disables integral action and anti-windup (dz/dt = e).' },
    { name: 'Kff', label: 'Feed-forward gain', unit: '1', kind: 'scalar', default: 0.02,
      description: 'Feed-forward gain on the reference speed. With vnom = 30 m/s and Kff = 0.02, a 15 m/s reference adds 0.01 to the command.' },
    { name: 'Kg', label: 'Grade gain', unit: '1/deg', kind: 'scalar', default: 0.01,
      description: 'Command added per degree of road grade. Example Kg = 0.01 and a 2 deg grade add 0.02.' },
    { name: 'Kaw', label: 'Anti-windup gain', unit: '1', kind: 'scalar', default: 1, min: 0,
      description: 'Back-calculation gain that pulls the integrator back when the command saturates; 0 disables anti-windup.' },
    { name: 'vnom', label: 'Nominal speed', unit: 'm/s', kind: 'scalar', default: 30, min: 0, minExclusive: true,
      description: 'Speed that normalizes the speed terms to a dimensionless command. Example vnom = 30 m/s makes a 30 m/s error a full command.' },
  ],
  states: ['z'],
  equations: [
    'e = VelRef - VelFdbk',
    'y = (Kff*VelRef + Kp*e + Ki*z)/vnom + Kg*Grade',
    'ysat = clamp(y, -1, 1); AccelCmd = max(ysat, 0); DecelCmd = max(-ysat, 0)',
    'dz/dt = e + Kaw*(ysat - y)*vnom/Ki (back-calculation); for Ki = 0: dz/dt = e (no back-calculation term)',
    'Info: VelErr = e, Cmd = y, CmdSat = ysat, Integrator = z',
  ],
  references: ['MathWorks Powertrain Blockset documentation: Longitudinal Driver'],
  description: 'Longitudinal driver model: PI speed controller with reference feed-forward, grade compensation and anti-windup, producing normalized accelerator and brake commands.',
  behavior: 'The command y sums the normalized feed-forward and PI terms and a grade term, is saturated to [-1, 1], and is split into AccelCmd (positive part) and DecelCmd (negative part), so only one is non-zero at a time. The integrator z accumulates the speed error and is corrected by back-calculation when the command saturates, so it does not wind up.',
  example: 'Kp = 0.6, Ki = 0.05, Kff = 0.02, Kg = 0.01, vnom = 30, z = 0: VelRef = 20, VelFdbk = 15, Grade = 2 deg gives y = (0.4 + 3)/30 + 0.02 = 0.1333, so AccelCmd = 0.1333 and DecelCmd = 0.',
};

const driverFactory = definePtBlock(DRIVER_SPEC, {
  init: () => 0,
  execute(ins, p, state) {
    const ref = num(ins[0]), fb = num(ins[1]), grade = num(ins[2]);
    const z = num(state ?? 0);
    const e = ref - fb;
    const y = (p.Kff * ref + p.Kp * e + p.Ki * z) / p.vnom + p.Kg * grade;
    const ysat = Math.min(Math.max(y, -1), 1);
    const info = makeBus(['VelErr', 'Cmd', 'CmdSat', 'Integrator'], [e, y, ysat, z]);
    return { outputs: [info, Math.max(ysat, 0), Math.max(-ysat, 0)] };
  },
  derivatives(ins, p, state) {
    const ref = num(ins[0]), fb = num(ins[1]), grade = num(ins[2]);
    const z = num(state ?? 0);
    const e = ref - fb;
    if (p.Ki === 0) return e;
    const y = (p.Kff * ref + p.Kp * e + p.Ki * z) / p.vnom + p.Kg * grade;
    const ysat = Math.min(Math.max(y, -1), 1);
    return e + (p.Kaw * (ysat - y) * p.vnom) / p.Ki;
  },
});

export const SCENARIO_BLOCKS: { spec: PtBlockSpec; factory: typeof driveCycleFactory }[] = [
  { spec: DRIVE_CYCLE_SPEC, factory: driveCycleFactory },
  { spec: DRIVER_SPEC, factory: driverFactory },
];
