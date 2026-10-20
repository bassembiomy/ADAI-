// Powertrain Blockset / Drivetrain / Transmission Controllers / AMT, DCT and CVT Controller.
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { prelookup, interpolateNd, validateBreakpoints } from '../ptMath';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  min?: number, minExclusive?: boolean, max?: number): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}), ...(minExclusive ? { minExclusive } : {}), ...(max !== undefined ? { max } : {}) });

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

/** Linear interpolation over breakpoints, clamped at both ends. */
const interp1 = (bp: number[], tbl: number[], u: number): number =>
  interpolateNd(tbl, [prelookup(bp, u, { extrap: 'clip' })], { interp: 'linear', extrap: 'clip' });

// ---------------------------------------------------------------- AMT / DCT shift schedule

const SCHED_PARAMS: PtParamSpec[] = [
  { name: 'GearNums', label: 'Gear numbers', unit: '1', kind: 'vector', default: [1, 2, 3, 4, 5, 6],
    description: 'Selectable gear numbers, strictly increasing, at least two, e.g. [1 2 3 4 5 6]. The first and last entries are the lowest and highest gear.' },
  { name: 'PdlBp', label: 'Accelerator pedal breakpoints', unit: '%', kind: 'vector', default: [0, 25, 50, 75, 100],
    description: 'Accelerator pedal position breakpoints in %, strictly increasing, at least two. The shift speeds are interpolated linearly and held beyond both ends.' },
  { name: 'UpSpd', label: 'Upshift speed', unit: 'm/s', kind: 'table',
    default: [[2, 4, 6, 8, 10], [5, 8, 11, 14, 17], [9, 13, 17, 21, 25], [13, 18, 23, 28, 33], [17, 23, 29, 35, 41]],
    description: 'Vehicle speed in m/s above which the controller upshifts. Size (length(GearNums)-1) x length(PdlBp); row i is the shift from GearNums(i) to GearNums(i+1).' },
  { name: 'DnSpd', label: 'Downshift speed', unit: 'm/s', kind: 'table',
    default: [[1, 2, 3, 4, 5], [3, 5, 7, 9, 11], [6, 9, 12, 15, 18], [9, 13, 17, 21, 25], [12, 17, 22, 27, 32]],
    description: 'Vehicle speed in m/s below which the controller downshifts. Same size as UpSpd; row i is the shift from GearNums(i+1) to GearNums(i). Every entry must be below the matching UpSpd entry so the schedule has hysteresis.' },
  par('Gear_o', 'Initial gear', '1', 1, 'Gear engaged at the start of the simulation; must be one of GearNums.'),
  par('tHold', 'Minimum time between shifts', 's', 0.5, 'Minimum time in s between two consecutive shifts; at most one shift is commanded per tHold. Zero allows a shift on every step.', 0),
];

const isNumRow = (r: unknown): r is number[] => Array.isArray(r) && r.every(x => typeof x === 'number');

/** Returns an error message or null. */
function validateSchedule(p: Record<string, any>): string | null {
  const g: number[] = p.GearNums, bp: number[] = p.PdlBp;
  if (!isNumRow(g) || g.length < 2) return 'GearNums must be a vector with at least two gears';
  for (let i = 1; i < g.length; i++) if (!(g[i] > g[i - 1])) return 'GearNums must be strictly increasing';
  const e = validateBreakpoints(bp);
  if (e) return `PdlBp: ${e}`;
  for (const name of ['UpSpd', 'DnSpd'] as const) {
    const t = p[name];
    if (!Array.isArray(t) || t.length !== g.length - 1 || !t.every(r => isNumRow(r) && r.length === bp.length)) {
      return `${name} must be a table of size ${g.length - 1} x ${bp.length} (length(GearNums)-1 by length(PdlBp))`;
    }
  }
  for (let i = 0; i < g.length - 1; i++) {
    for (let j = 0; j < bp.length; j++) {
      if (!(p.DnSpd[i][j] < p.UpSpd[i][j])) {
        return `DnSpd(${i + 1},${j + 1}) = ${p.DnSpd[i][j]} must be below UpSpd(${i + 1},${j + 1}) = ${p.UpSpd[i][j]}`;
      }
    }
  }
  if (!g.includes(p.Gear_o)) return 'Gear_o must be one of GearNums';
  return null;
}

interface SchedState { gear: number; tLast: number }

function scheduleSpec(type: string, kind: 'AMT' | 'DCT'): PtBlockSpec {
  const clutchNote = kind === 'AMT' ? 'automated manual transmission' : 'dual clutch transmission';
  return {
    type,
    label: `${kind} Controller`,
    category: 'Powertrain / Drivetrain / Transmission Controllers',
    simulinkPath: `Powertrain Blockset/Drivetrain/Transmission Controllers/${kind} Controller`,
    source: 'simulink-docs',
    symbol: 'transmission-controller',
    inputs: [
      inp('AccelPdl', '%', 1, 'Accelerator pedal position.'),
      inp('VehSpd', 'm/s', 2, 'Vehicle speed.'),
    ],
    outputs: [
      out('Info', 'bus', 1, 'Bus with Gear, UpSpd (current upshift threshold) and DnSpd (current downshift threshold).', `Bus: ${kind}ControllerInfo`),
      out('GearCmd', '1', 2, 'Commanded gear number.'),
    ],
    params: SCHED_PARAMS,
    states: ['gear', 'tLast'],
    equations: [
      'Upshift: VehSpd > interp(PdlBp, UpSpd(row of g), AccelPdl) and g below the highest gear: g -> next entry of GearNums',
      'Downshift: VehSpd < interp(PdlBp, DnSpd(row of g-1), AccelPdl) and g above the lowest gear: g -> previous entry of GearNums',
      'At most one shift per tHold: a shift is allowed only when t - tLast >= tHold, then tLast = t; GearCmd = g',
      'Hysteresis requires DnSpd < UpSpd element-wise',
    ],
    references: [
      'MathWorks Powertrain Blockset documentation, ' + `${kind} Controller`,
      'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011 (shift schedules)',
    ],
    description: `Shift-schedule controller for an ${clutchNote}. It commands a gear from accelerator pedal and vehicle speed using separate upshift and downshift speed lines, so the schedule has hysteresis, and it limits the shift rate with a minimum hold time.`,
    behavior: 'Discrete block with a gear state and the time of the last shift. On each step, if at least tHold has passed since the last shift, the vehicle speed is compared with the upshift line of the current gear and then with the downshift line of the gear below, both interpolated over the pedal position and held at the ends. At most one gear step is taken per evaluation. GearCmd is the gear after this decision. Info reports the gear and the two thresholds in use; a threshold that does not exist at the lowest or highest gear is reported as 0. The state is committed once per macro step by the engine.',
    example: '',
  };
}

function scheduleImpl() {
  return {
    init: (p: Record<string, any>): SchedState => ({ gear: p.Gear_o, tLast: -Infinity }),
    execute: (ins: XValue[], p: Record<string, any>, state: SchedState | undefined, t: number) => {
      const err = validateSchedule(p);
      if (err) return { outputs: [{}, 0], error: err };
      const pdl = num(ins[0]), v = num(ins[1]);
      if (!Number.isFinite(pdl) || !Number.isFinite(v) || !Number.isFinite(t)) {
        return { outputs: [{}, 0], error: 'Transmission controller inputs must be finite' };
      }
      const g: number[] = p.GearNums;
      let gear = state && g.includes(state.gear) ? state.gear : p.Gear_o;
      // JSON round trips turn -Infinity into null: both mean no shift has happened yet.
      const tLast = state && typeof state.tLast === 'number' && Number.isFinite(state.tLast) ? state.tLast : -Infinity;
      let nextT = tLast;
      let idx = g.indexOf(gear);
      const upAt = (i: number) => interp1(p.PdlBp, p.UpSpd[i], pdl);
      const dnAt = (i: number) => interp1(p.PdlBp, p.DnSpd[i], pdl);
      if (t - tLast >= p.tHold - 1e-9) {
        if (idx < g.length - 1 && v > upAt(idx)) { idx += 1; nextT = t; }
        else if (idx > 0 && v < dnAt(idx - 1)) { idx -= 1; nextT = t; }
        gear = g[idx];
      }
      const up = idx < g.length - 1 ? upAt(idx) : 0;
      const dn = idx > 0 ? dnAt(idx - 1) : 0;
      return {
        outputs: [makeBus(['Gear', 'UpSpd', 'DnSpd'], [gear, up, dn]), gear],
        nextState: { gear, tLast: nextT } as SchedState,
      };
    },
  };
}

const amtSpec = scheduleSpec('PT_AMT_CONTROLLER', 'AMT');
amtSpec.example = 'With the default schedule at 50 % pedal, starting in gear 1: VehSpd 5.9 m/s at t = 0 gives GearCmd 1; 6.1 m/s at t = 0.1 s crosses the 6 m/s upshift line and gives 2; 12 m/s at t = 0.3 s still gives 2 because tHold = 0.5 s has not passed; at t = 0.7 s it gives 3. In gear 3 at 12 m/s, Info reports UpSpd = 17 and DnSpd = 7 m/s.';
const dctSpec = scheduleSpec('PT_DCT_CONTROLLER', 'DCT');
dctSpec.example = amtSpec.example;

const amtFactory = definePtBlock(amtSpec, scheduleImpl());
const dctFactory = definePtBlock(dctSpec, scheduleImpl());

// ---------------------------------------------------------------- CVT controller

const cvtSpec: PtBlockSpec = {
  type: 'PT_CVT_CONTROLLER',
  label: 'CVT Controller',
  category: 'Powertrain / Drivetrain / Transmission Controllers',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Transmission Controllers/CVT Controller',
  source: 'simulink-docs',
  symbol: 'transmission-controller',
  inputs: [
    inp('AccelPdl', '%', 1, 'Accelerator pedal position.'),
    inp('OutSpd', 'rad/s', 2, 'Transmission output shaft speed.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with EngSpdTgt, the target engine speed.', 'Bus: CVTControllerInfo'),
    out('RatioCmd', '1', 2, 'Commanded CVT ratio (input speed over output speed).'),
  ],
  params: [
    { name: 'PdlBp', label: 'Accelerator pedal breakpoints', unit: '%', kind: 'vector', default: [0, 25, 50, 75, 100],
      description: 'Accelerator pedal position breakpoints in %, strictly increasing, at least two. The target is held beyond both ends.' },
    { name: 'EngSpdTgt', label: 'Target engine speed', unit: 'rad/s', kind: 'vector', default: [105, 150, 200, 260, 320],
      description: 'Target engine (CVT input) speed in rad/s at each pedal breakpoint; same length as PdlBp, entries must be >= 0.' },
    par('Nmin', 'Minimum ratio', '1', 0.4, 'Lowest ratio the controller commands (overdrive end); must be > 0.', 0, true),
    par('Nmax', 'Maximum ratio', '1', 2.6, 'Highest ratio the controller commands (launch end); must be >= Nmin.', 0, true),
    par('wMin', 'Minimum output speed', 'rad/s', 1, 'Lower limit on the output speed used in the division, so the ratio command stays finite at standstill; must be > 0.', 0, true),
  ],
  states: [],
  equations: [
    'EngSpdTgt = interp(PdlBp, EngSpdTgt, AccelPdl), linear, held at the pedal ends',
    'RatioCmd = clamp(EngSpdTgt / max(OutSpd, wMin), Nmin, Nmax)',
  ],
  references: ['MathWorks Powertrain Blockset documentation, CVT Controller'],
  description: 'Ratio controller for a continuously variable transmission. It looks up a target engine speed from the accelerator pedal and commands the ratio that would put the transmission input at that speed for the current output speed.',
  behavior: 'Static block with no states. The target speed is interpolated over the pedal position and divided by the output speed, floored at wMin, then limited to the range Nmin to Nmax. At standstill the command therefore saturates at Nmax when the target exceeds Nmax*wMin. Info reports the target engine speed.',
  example: 'With the default table at 50 % pedal the target engine speed is 200 rad/s. At OutSpd = 100 rad/s RatioCmd = 200/100 = 2; at standstill (OutSpd = 0, floored to wMin = 1 rad/s) the quotient 200 exceeds Nmax and RatioCmd = 2.6.',
};

const cvtFactory = definePtBlock(cvtSpec, {
  execute: (ins, p) => {
    const bad = validateBreakpoints(p.PdlBp);
    if (bad) return { outputs: [{}, 0], error: `PdlBp: ${bad}` };
    if (!Array.isArray(p.EngSpdTgt) || p.EngSpdTgt.length !== p.PdlBp.length || !p.EngSpdTgt.every((x: unknown) => typeof x === 'number' && x >= 0)) {
      return { outputs: [{}, 0], error: 'EngSpdTgt must be a non-negative vector with the same length as PdlBp' };
    }
    if (!(p.Nmax >= p.Nmin)) return { outputs: [{}, 0], error: 'Nmax must be >= Nmin' };
    const pdl = num(ins[0]), w = num(ins[1]);
    if (!Number.isFinite(pdl) || !Number.isFinite(w)) return { outputs: [{}, 0], error: 'CVT controller inputs must be finite' };
    const tgt = interp1(p.PdlBp, p.EngSpdTgt, pdl);
    const ratio = Math.min(Math.max(tgt / Math.max(w, p.wMin), p.Nmin), p.Nmax);
    return { outputs: [makeBus(['EngSpdTgt'], [tgt]), ratio] };
  },
});

export const TRANSMISSION_CONTROLLER_BLOCKS: { spec: PtBlockSpec; factory: typeof amtFactory }[] = [
  { spec: amtSpec, factory: amtFactory },
  { spec: dctSpec, factory: dctFactory },
  { spec: cvtSpec, factory: cvtFactory },
];
