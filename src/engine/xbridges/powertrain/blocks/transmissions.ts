// Powertrain Blockset / Drivetrain / Transmissions: Ideal Fixed Gear Transmission, Automated Manual Transmission,
// Dual Clutch Transmission and Continuously Variable Transmission.
import type { XBlock, XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { powerFlowEfficiency } from '../ptMath';
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

const spec: PtBlockSpec = {
  type: 'PT_IDEAL_FIXED_GEAR_TRANSMISSION',
  label: 'Ideal Fixed Gear Transmission',
  category: 'Powertrain / Drivetrain / Transmissions',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Transmissions/Ideal Fixed Gear Transmission',
  source: 'simulink-docs',
  symbol: 'transmission',
  inputs: [
    inp('Gear', '1', 1, 'Selected gear number; 0 is neutral.'),
    inp('InTrq', 'N*m', 2, 'Torque applied to the transmission input shaft.'),
    inp('OutSpd', 'rad/s', 3, 'Angular speed of the transmission output shaft.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with GearRatio, Eff, InPwr, OutPwr and PwrLoss.', 'Bus: IdealFixedGearTransmissionInfo'),
    out('OutTrq', 'N*m', 2, 'Torque delivered to the output shaft.'),
    out('InSpd', 'rad/s', 3, 'Angular speed of the input shaft.'),
  ],
  params: [
    vec('GearNums', 'Gear numbers', '1', [-1, 0, 1, 2, 3, 4, 5], 'Selectable gear numbers; -1 is reverse and 0 is neutral.'),
    vec('Ratios', 'Gear ratios', '1', [-3.5, 0, 3.8, 2.2, 1.4, 1, 0.8], 'Input speed over output speed for each gear number; same length as GearNums.'),
    vec('Eff', 'Gear efficiencies', '1', [0.9, 1, 0.95, 0.96, 0.97, 0.97, 0.96], 'Mechanical efficiency in (0, 1] for each gear number; same length as GearNums.'),
  ],
  states: [],
  equations: [
    'N = Ratios[index of Gear in GearNums]',
    'InSpd = N*OutSpd',
    'OutTrq = N*k*InTrq, k = Eff if InTrq*InSpd >= 0, else 1/Eff',
    'Gear = 0 (neutral): OutTrq = 0, InSpd = 0',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Ideal Fixed Gear Transmission',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Fixed ratio gearbox without inertia. The selected gear sets the speed ratio and the efficiency, applied in the direction of power flow.',
  behavior: 'Static block with no states. The input speed is the gear ratio times the output speed. The output torque is the ratio times the input torque scaled by the efficiency when power flows from input to output and by its inverse when the gearbox is back-driven. Neutral gives zero torque and zero input speed. A gear number that is not in GearNums is reported as a block error.',
  example: 'With the default tables, gear 2 has ratio 2.2 and efficiency 0.96. For InTrq = 100 N*m and OutSpd = 40 rad/s the block gives InSpd = 88 rad/s and OutTrq = 211.2 N*m. Back-driven with InTrq = -100 N*m the output torque is -229.17 N*m (efficiency applied as 1/0.96).',
};

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

const factory = definePtBlock(spec, {
  execute: (ins, p) => {
    const g = num(ins[0]), T = num(ins[1]), w = num(ins[2]);
    if (![g, T, w].every(Number.isFinite)) return { outputs: [{}, 0, 0], error: 'Gear transmission inputs must be finite' };
    const gear = Math.round(g);
    if (gear === 0) {
      return { outputs: [makeBus(['GearRatio', 'Eff', 'InPwr', 'OutPwr', 'PwrLoss'], [0, 1, 0, 0, 0]), 0, 0] };
    }
    const nums = p.GearNums as number[], ratios = p.Ratios as number[], effs = p.Eff as number[];
    if (ratios.length !== nums.length || effs.length !== nums.length) {
      return { outputs: [{}, 0, 0], error: 'Ratios and Eff must have the same length as GearNums' };
    }
    const i = nums.indexOf(gear);
    if (i < 0) return { outputs: [{}, 0, 0], error: `Gear ${gear} is not in GearNums` };
    const eta = effs[i];
    if (!(eta > 0 && eta <= 1)) return { outputs: [{}, 0, 0], error: `Eff for Gear ${gear} must be in (0, 1]` };
    const N = ratios[i];
    const spdIn = N * w;
    const k = T * spdIn === 0 ? eta : powerFlowEfficiency(T, spdIn, eta);
    const trqOut = N * k * T;
    const pIn = T * spdIn, pOut = trqOut * w;
    return { outputs: [makeBus(['GearRatio', 'Eff', 'InPwr', 'OutPwr', 'PwrLoss'], [N, k, pIn, pOut, pIn - pOut]), trqOut, spdIn] };
  },
});


const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

// ---------------------------------------------------------------- shared clutch-to-clutch shift machinery (AMT, DCT)
// State layout (all numbers, JSON safe):
//   w_in  input shaft speed, the only continuous state (integrated by the solver)
//   gF    gear engaged before / outside a shift
//   gT    target gear of the running shift
//   sh    1 while a shift is running, else 0
//   t0    start time of the running shift
//   lk    1 while a clutch is locked (input shaft kinematically tied to the output), else 0
//   lkG   gear of the locked clutch
// Everything the equations need (engaged gear, clutch capacities, handover fraction) is a pure function of these
// fields and the time, so all RK stages see one consistent description. The fields are advanced (shift start and end,
// lock and release, re-seeding w_in to the kinematic speed while locked) in the pure discrete update of the block,
// which the engine calls once per major step and which returns a new state object (Simulink mdlUpdate).
interface ShiftState { w_in: number; gF: number; gT: number; sh: number; t0: number; lk: number; lkG: number }
interface Clutch { gear: number; N: number; eta: number; cap: number }
interface Profile { cls: Clutch[]; gear: number; frac: number }
interface GearTable { nums: number[]; ratios: number[]; effs: number[] }

function gearTable(p: Record<string, any>): GearTable | string {
  const nums = p.GearNums as number[], ratios = p.Ratios as number[], effs = p.Eff as number[];
  if (ratios.length !== nums.length || effs.length !== nums.length) return 'Ratios and Eff must have the same length as GearNums';
  if (new Set(nums).size !== nums.length) return 'GearNums must not repeat a gear number';
  for (let i = 0; i < nums.length; i++) {
    if (!(effs[i] > 0 && effs[i] <= 1)) return `Eff for Gear ${nums[i]} must be in (0, 1]`;
  }
  if (!nums.includes(p.Gear_o)) return `Gear_o ${p.Gear_o} is not in GearNums`;
  return { nums, ratios, effs };
}

const makeClutch = (tb: GearTable, gear: number, cap: number): Clutch => {
  const i = tb.nums.indexOf(gear);
  return { gear, N: tb.ratios[i], eta: tb.effs[i], cap };
};

interface Sol { wEng: number; Tc: number[]; aIn: number; diffTrq: number }

/** Torques and input-shaft acceleration for the given clutches; lockIdx >= 0 ties the input shaft to that clutch. */
function solveClutches(cls: Clutch[], lockIdx: number, wIn: number, Teng: number, wd: number, p: Record<string, any>): Sol {
  const wEng = lockIdx >= 0 ? cls[lockIdx].N * wd : wIn;
  const tol = p.omega_tol as number;
  const slip = cls.map(c => wEng - c.N * wd);
  const Tc = cls.map((c, j) => (j === lockIdx ? 0 : c.cap * (lockIdx >= 0 || Math.abs(slip[j]) > tol ? sign(slip[j]) : 0)));
  const free = Teng - p.b_in * wEng;
  const others = (j: number) => Tc.reduce((a, t, k) => (k === j ? a : a + t), 0);
  let aIn = 0;
  if (lockIdx >= 0) {
    Tc[lockIdx] = free - others(lockIdx);
  } else {
    // Inside the tolerance band the slip direction is the direction of the torque that breaks the clutch away.
    cls.forEach((c, j) => { if (Math.abs(slip[j]) <= tol) Tc[j] = c.cap * sign(free - others(j)); });
    aIn = (free - Tc.reduce((a, t) => a + t, 0)) / p.J_in;
  }
  const diffTrq = cls.reduce((a, c, i) => a + c.N * (Tc[i] * wEng >= 0 ? c.eta : 1 / c.eta) * Tc[i], 0) + 0;
  return { wEng, Tc, aIn, diffTrq };
}

interface ShiftModel { clutches: number; total: (p: Record<string, any>) => number; profile: (s: ShiftState, p: Record<string, any>, tb: GearTable, t: number) => Profile }

/** Advances the discrete bookkeeping of the committed state: finish and start shifts, lock and release the clutches. */
function advanceShift(m: ShiftModel, s0: ShiftState, cmd: number | undefined, Teng: number, wd: number, p: Record<string, any>, tb: GearTable, t: number): ShiftState {
  const s: ShiftState = { ...s0 };
  if (s.sh === 1 && t - s.t0 >= m.total(p)) { s.gF = s.gT; s.sh = 0; }
  if (s.sh === 0 && cmd !== undefined && cmd !== s.gF) { s.sh = 1; s.t0 = t; s.gT = cmd; }
  const cls = m.profile(s, p, tb, t).cls;
  let li = s.lk === 1 ? cls.findIndex(c => c.gear === s.lkG) : -1;
  if (li >= 0 && !(cls[li].cap > 0 && Math.abs(solveClutches(cls, li, s.w_in, Teng, wd, p).Tc[li]) <= cls[li].cap)) li = -1;
  if (li < 0) {
    for (let i = 0; i < cls.length; i++) {
      if (cls[i].cap > 0 && Math.abs(s.w_in - cls[i].N * wd) <= p.omega_tol
        && Math.abs(solveClutches(cls, i, s.w_in, Teng, wd, p).Tc[i]) <= cls[i].cap) { li = i; break; }
    }
  }
  if (li >= 0) { s.lk = 1; s.lkG = cls[li].gear; s.w_in = cls[li].N * wd; } else { s.lk = 0; }
  return s;
}

interface ShiftIns { cmd: number; Teng: number; wd: number }
function shiftInputs(ins: XValue[], tb: GearTable): ShiftIns | string {
  const g = num(ins[0]), Teng = num(ins[1]), wd = num(ins[2]);
  if (![g, Teng, wd].every(Number.isFinite)) return 'Transmission inputs must be finite';
  const cmd = Math.round(g);
  if (!tb.nums.includes(cmd)) return `Gear ${cmd} is not in GearNums`;
  return { cmd, Teng, wd };
}

interface ShiftView { prof: Profile; li: number; sol: Sol }
function shiftView(m: ShiftModel, s: ShiftState, p: Record<string, any>, tb: GearTable, t: number, i: ShiftIns): ShiftView {
  const prof = m.profile(s, p, tb, t);
  const li = s.lk === 1 ? prof.cls.findIndex(c => c.gear === s.lkG) : -1;
  return { prof, li, sol: solveClutches(prof.cls, li, s.w_in, i.Teng, i.wd, p) };
}

/** Discrete fields of the shift state: engaged/target gear, shift flag and start time, lock flag and locked gear. */
const SHIFT_DISCRETE_KEYS = ['gF', 'gT', 'sh', 't0', 'lk', 'lkG'];

function shiftInit(p: Record<string, any>): ShiftState {
  return { w_in: p.w_in_o, gF: p.Gear_o, gT: p.Gear_o, sh: 0, t0: 0, lk: 0, lkG: p.Gear_o };
}

function shiftUpdate(m: ShiftModel, ins: XValue[], p: Record<string, any>, s: ShiftState, t: number): ShiftState {
  const tb = gearTable(p);
  if (typeof tb === 'string') return s;
  const i = shiftInputs(ins, tb);
  if (typeof i === 'string') return s;
  return advanceShift(m, s, i.cmd, i.Teng, i.wd, p, tb, t);
}

function shiftExecute(m: ShiftModel, ins: XValue[], p: Record<string, any>, s: ShiftState, t: number,
  info: (v: ShiftView) => ReturnType<typeof makeBus>): { outputs: XValue[]; error?: string } {
  const tb = gearTable(p);
  if (typeof tb === 'string') return { outputs: [{}, 0, 0], error: tb };
  const i = shiftInputs(ins, tb);
  if (typeof i === 'string') return { outputs: [{}, 0, 0], error: i };
  const v = shiftView(m, s, p, tb, t, i);
  return { outputs: [info(v), v.sol.wEng, v.sol.diffTrq] };
}

function shiftDerivatives(m: ShiftModel, ins: XValue[], p: Record<string, any>, s: ShiftState, t: number): { w_in: number } {
  const tb = gearTable(p);
  if (typeof tb === 'string') return { w_in: 0 };
  const i = shiftInputs(ins, tb);
  if (typeof i === 'string') return { w_in: 0 };
  return { w_in: shiftView(m, s, p, tb, t, i).sol.aIn };
}

/** Slip speed of every unlocked clutch that can carry torque; the solver steps onto the instant it changes sign. */
function shiftZeroCrossings(m: ShiftModel, ins: XValue[], p: Record<string, any>, s: ShiftState, t: number): number[] {
  const none = new Array<number>(m.clutches).fill(0);
  const tb = gearTable(p);
  const g = num(ins[2]);
  if (typeof tb === 'string' || !Number.isFinite(g) || (s.lk !== 0 && s.lk !== 1)) return none;
  // Fractional gear fields appear only in interpolated solver states; no event is reported for those.
  if (![s.gF, s.gT, s.sh].every(Number.isInteger) || !tb.nums.includes(s.gF) || (s.sh === 1 && !tb.nums.includes(s.gT))) return none;
  const cls = m.profile(s, p, tb, t).cls;
  return none.map((_, i) => (i >= cls.length || s.lk === 1 || !(cls[i].cap > 0) ? 0 : s.w_in - cls[i].N * g));
}

const shiftStates = ['w_in'];

// ---------------------------------------------------------------- Automated Manual Transmission
const amtSpec: PtBlockSpec = {
  type: 'PT_AUTOMATED_MANUAL_TRANSMISSION',
  label: 'Automated Manual Transmission',
  category: 'Powertrain / Drivetrain / Transmissions',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Transmissions/Automated Manual Transmission',
  source: 'simulink-docs',
  symbol: 'transmission',
  inputs: [
    inp('GearCmd', '1', 1, 'Commanded gear number. A command different from the engaged gear starts a shift.'),
    inp('EngTrq', 'N*m', 2, 'Torque applied to the transmission input shaft by the engine.'),
    inp('DiffSpd', 'rad/s', 3, 'Angular speed of the transmission output shaft (differential side).'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Gear, Locked, ClutchCap and ClutchTrq.', 'Bus: AutomatedManualTransmissionInfo'),
    out('EngSpd', 'rad/s', 2, 'Angular speed of the input shaft (engine side).'),
    out('DiffTrq', 'N*m', 3, 'Torque delivered to the output shaft.'),
  ],
  params: [
    vec('GearNums', 'Gear numbers', '1', [1, 2, 3, 4, 5, 6], 'Selectable gear numbers; the engaged and the commanded gear must be in this list.'),
    vec('Ratios', 'Gear ratios', '1', [3.8, 2.2, 1.4, 1, 0.8, 0.65], 'Input speed over output speed for each gear number; same length as GearNums.'),
    vec('Eff', 'Gear efficiencies', '1', [0.95, 0.96, 0.97, 0.97, 0.97, 0.96], 'Mechanical efficiency in (0, 1] for each gear number; same length as GearNums.'),
    par('J_in', 'Input shaft inertia', 'kg*m^2', 0.2, 'Rotational inertia of the input shaft and the clutch driven plate.', 0, true),
    par('b_in', 'Input shaft damping', 'N*m*s/rad', 0, 'Viscous damping coefficient on the input shaft.', 0),
    par('Tc_max', 'Clutch capacity', 'N*m', 400, 'Torque capacity of the dry clutch when fully closed.', 0, true),
    par('t_dis', 'Disengage time', 's', 0.1, 'Time the clutch capacity ramps from full to zero at the start of a shift.', 0),
    par('t_syn', 'Synchronisation time', 's', 0.15, 'Time the clutch stays open while the gear is changed.', 0),
    par('t_eng', 'Engage time', 's', 0.1, 'Time the clutch capacity ramps from zero back to full after the gear change.', 0),
    par('omega_tol', 'Lock speed tolerance', 'rad/s', 1e-2, 'The clutch may lock when the slip speed magnitude is at most this value.', 0, true),
    par('Gear_o', 'Initial gear', '1', 1, 'Engaged gear number at the start of the simulation; must be in GearNums.'),
    par('w_in_o', 'Initial input speed', 'rad/s', 0, 'Input shaft speed at the start of the simulation.'),
  ],
  states: shiftStates,
  equations: [
    'N = Ratios[index of the engaged gear in GearNums], w_t = N*DiffSpd',
    'shift: clutch capacity cap ramps Tc_max -> 0 over t_dis, stays 0 for t_syn (gear change), ramps 0 -> Tc_max over t_eng',
    'slipping: Tc = cap*sign(w_in - w_t); J_in*dw_in/dt = EngTrq - b_in*w_in - Tc; DiffTrq = N*k*Tc',
    'locked (|w_in - w_t| <= omega_tol and |EngTrq - b_in*w_in| <= cap): EngSpd = w_t, DiffTrq = N*k*(EngTrq - b_in*EngSpd)',
    'k = Eff if power flows from input to output (Tc*EngSpd >= 0), else 1/Eff',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Automated Manual Transmission',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Manual gearbox with one dry clutch and an automated gear change. During a shift the clutch opens, the gear is changed and the clutch closes again, so the driveline torque is interrupted.',
  behavior: 'The input shaft is a state. With the clutch locked the engine speed follows the output speed through the gear ratio and the gearbox passes the engine torque on. When the engine torque exceeds the clutch capacity, or while the capacity is ramped down, the clutch slips with the capacity as friction torque against the slip direction. A gear command different from the engaged gear starts a shift: the capacity ramps down, stays at zero while the gear changes, and ramps back up; the clutch locks again when the slip speed is inside the tolerance and the holding torque is within the capacity. A command that is not in GearNums is a block error naming the gear; commands during a running shift are taken up after it ends. Info reports the engaged gear, the lock flag, the clutch capacity and the clutch torque.',
  example: 'With GearNums = [1 2 3], Ratios = [3.5 2.1 1.4], Eff = 1, J_in = 0.2 kg*m^2, Tc_max = 300 N*m, t_dis = 0.1 s, t_syn = 0.2 s, t_eng = 0.1 s, Gear_o = 1, w_in_o = 105 rad/s, EngTrq = 20 N*m and DiffSpd = 30 rad/s, the clutch is locked in gear 1 (EngSpd = 105 rad/s, DiffTrq = 70 N*m). When GearCmd steps from 1 to 2 at t = 1 s the clutch opens: at t = 1.2 s ClutchCap = 0 and DiffTrq = 0 while the engine speeds up to 115.3 rad/s. The clutch closes again and at t = 2 s it is locked in gear 2 with EngSpd = 2.1*30 = 63 rad/s and DiffTrq = 2.1*20 = 42 N*m.',
};

const amtModel: ShiftModel = {
  clutches: 1,
  total: p => p.t_dis + p.t_syn + p.t_eng,
  profile: (s, p, tb, t) => {
    if (s.sh !== 1) return { cls: [makeClutch(tb, s.gF, p.Tc_max)], gear: s.gF, frac: 0 };
    const el = Math.max(t - s.t0, 0), tSw = p.t_dis + p.t_syn;
    const gear = el >= tSw ? s.gT : s.gF;
    let cap: number;
    if (el < p.t_dis) cap = p.Tc_max * (1 - el / p.t_dis);
    else if (el < tSw) cap = 0;
    else { const e2 = el - tSw; cap = e2 >= p.t_eng ? p.Tc_max : p.Tc_max * e2 / p.t_eng; }
    return { cls: [makeClutch(tb, gear, cap)], gear, frac: 0 };
  },
};

const amtFactory = definePtBlock(amtSpec, {
  init: shiftInit,
  discreteStateKeys: SHIFT_DISCRETE_KEYS,
  update: (ins, p, s, t) => shiftUpdate(amtModel, ins, p, s, t),
  derivatives: (ins, p, s, t) => shiftDerivatives(amtModel, ins, p, s, t),
  zeroCrossings: (ins, p, s, t) => shiftZeroCrossings(amtModel, ins, p, s, t),
  execute: (ins, p, s, t) => shiftExecute(amtModel, ins, p, s, t, v =>
    makeBus(['Gear', 'Locked', 'ClutchCap', 'ClutchTrq'], [v.prof.gear, v.li >= 0 ? 1 : 0, v.prof.cls[0].cap, v.sol.Tc[0] + 0])),
});

// ---------------------------------------------------------------- Dual Clutch Transmission
const dctSpec: PtBlockSpec = {
  type: 'PT_DUAL_CLUTCH_TRANSMISSION',
  label: 'Dual Clutch Transmission',
  category: 'Powertrain / Drivetrain / Transmissions',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Transmissions/Dual Clutch Transmission',
  source: 'simulink-docs',
  symbol: 'transmission',
  inputs: [
    inp('GearCmd', '1', 1, 'Commanded gear number. A command different from the engaged gear starts a clutch-to-clutch shift.'),
    inp('EngTrq', 'N*m', 2, 'Torque applied to the transmission input shaft by the engine.'),
    inp('DiffSpd', 'rad/s', 3, 'Angular speed of the transmission output shaft (differential side).'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Gear, HandoverFrac and Locked.', 'Bus: DualClutchTransmissionInfo'),
    out('EngSpd', 'rad/s', 2, 'Angular speed of the input shaft (engine side).'),
    out('DiffTrq', 'N*m', 3, 'Torque delivered to the output shaft.'),
  ],
  params: [
    vec('GearNums', 'Gear numbers', '1', [1, 2, 3, 4, 5, 6, 7], 'Selectable gear numbers; the engaged and the commanded gear must be in this list.'),
    vec('Ratios', 'Gear ratios', '1', [3.9, 2.4, 1.6, 1.2, 0.95, 0.8, 0.65], 'Input speed over output speed for each gear number; same length as GearNums.'),
    vec('Eff', 'Gear efficiencies', '1', [0.96, 0.97, 0.97, 0.97, 0.97, 0.97, 0.96], 'Mechanical efficiency in (0, 1] for each gear number; same length as GearNums.'),
    par('J_in', 'Input shaft inertia', 'kg*m^2', 0.2, 'Rotational inertia of the input shaft and the clutch housing.', 0, true),
    par('b_in', 'Input shaft damping', 'N*m*s/rad', 0, 'Viscous damping coefficient on the input shaft.', 0),
    par('Tc_max', 'Clutch capacity', 'N*m', 400, 'Torque capacity of each clutch when fully closed.', 0, true),
    par('t_x', 'Handover time', 's', 0.2, 'Duration of the torque handover between the off-going and the on-coming clutch.', 0, true),
    par('omega_tol', 'Lock speed tolerance', 'rad/s', 1e-2, 'A clutch may lock when its slip speed magnitude is at most this value.', 0, true),
    par('Gear_o', 'Initial gear', '1', 1, 'Engaged gear number at the start of the simulation; must be in GearNums.'),
    par('w_in_o', 'Initial input speed', 'rad/s', 0, 'Input shaft speed at the start of the simulation.'),
  ],
  states: shiftStates,
  equations: [
    'N = Ratios[index of the gear in GearNums], w_t = N*DiffSpd for each of the two engaged gears',
    'handover over t_x: f = (t - t0)/t_x, cap_off = Tc_max*(1 - f), cap_on = Tc_max*f',
    'on-coming clutch slipping: Tc_on = cap_on*sign(w_in - N_on*DiffSpd); J_in*dw_in/dt = EngTrq - b_in*w_in - Tc_on - Tc_off',
    'off-going clutch locked (|T_lock| <= cap_off, T_lock = EngTrq - b_in*w_in - Tc_on): EngSpd = N_off*DiffSpd, DiffTrq = N_off*k*T_lock + N_on*k*Tc_on',
    'after the handover the on-coming clutch has capacity Tc_max, synchronises and locks: EngSpd = N_on*DiffSpd, DiffTrq = N_on*k*(EngTrq - b_in*EngSpd)',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Dual Clutch Transmission',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Gearbox with two clutches, one for the odd and one for the even gears. A shift hands the torque over from the off-going to the on-coming clutch without interrupting the driveline torque.',
  behavior: 'The input shaft is a state. In steady operation one clutch is closed and locked, the engine speed follows the output speed through that gear ratio. A gear command different from the engaged gear starts a handover over t_x: the off-going capacity falls linearly while the on-coming capacity rises. The on-coming clutch slips and carries its capacity; the off-going clutch stays locked as long as the remaining torque is within its capacity, so the output torque is the sum of both gear paths. After the handover the on-coming clutch synchronises the input shaft and locks. A command that is not in GearNums is a block error naming the gear; commands during a running handover are taken up after it ends. Info reports the engaged gear, the handover fraction (0 outside a shift) and the lock flag.',
  example: 'With GearNums = [1 2 3], Ratios = [3.5 2.1 1.4], Eff = 1, J_in = 0.2 kg*m^2, Tc_max = 400 N*m, t_x = 0.2 s, Gear_o = 1, w_in_o = 105 rad/s, EngTrq = 100 N*m and DiffSpd = 30 rad/s, GearCmd stepping from 1 to 2 at t = 1 s starts the handover. At t = 1.1 s HandoverFrac = 0.5, the off-going clutch is still locked (EngSpd = 105 rad/s) and DiffTrq = 3.5*(100 - 200) + 2.1*200 = 70 N*m, without interruption. At t = 2 s the block is locked in gear 2 with HandoverFrac = 0, EngSpd = 63 rad/s and DiffTrq = 2.1*100 = 210 N*m.',
};

const dctModel: ShiftModel = {
  clutches: 2,
  total: p => p.t_x,
  profile: (s, p, tb, t) => {
    if (s.sh !== 1) return { cls: [makeClutch(tb, s.gF, p.Tc_max)], gear: s.gF, frac: 0 };
    const el = Math.max(t - s.t0, 0);
    if (el >= p.t_x) return { cls: [makeClutch(tb, s.gT, p.Tc_max)], gear: s.gT, frac: 0 };
    const f = el / p.t_x;
    return { cls: [makeClutch(tb, s.gF, p.Tc_max * (1 - f)), makeClutch(tb, s.gT, p.Tc_max * f)], gear: s.gF, frac: f };
  },
};

const dctFactory = definePtBlock(dctSpec, {
  init: shiftInit,
  discreteStateKeys: SHIFT_DISCRETE_KEYS,
  update: (ins, p, s, t) => shiftUpdate(dctModel, ins, p, s, t),
  derivatives: (ins, p, s, t) => shiftDerivatives(dctModel, ins, p, s, t),
  zeroCrossings: (ins, p, s, t) => shiftZeroCrossings(dctModel, ins, p, s, t),
  execute: (ins, p, s, t) => shiftExecute(dctModel, ins, p, s, t, v =>
    makeBus(['Gear', 'HandoverFrac', 'Locked'], [v.prof.gear, v.prof.frac, v.li >= 0 ? 1 : 0])),
});

// ---------------------------------------------------------------- Continuously Variable Transmission
const cvtSpec: PtBlockSpec = {
  type: 'PT_CONTINUOUSLY_VARIABLE_TRANSMISSION',
  label: 'Continuously Variable Transmission',
  category: 'Powertrain / Drivetrain / Transmissions',
  simulinkPath: 'Powertrain Blockset/Drivetrain/Transmissions/Continuously Variable Transmission',
  source: 'simulink-docs',
  symbol: 'cvt',
  inputs: [
    inp('RatioCmd', '1', 1, 'Commanded ratio of input speed to output speed.'),
    inp('InTrq', 'N*m', 2, 'Torque applied to the transmission input shaft.'),
    inp('OutSpd', 'rad/s', 3, 'Angular speed of the transmission output shaft.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Ratio, InPwr, OutPwr, PwrLoss and Eff.', 'Bus: ContinuouslyVariableTransmissionInfo'),
    out('OutTrq', 'N*m', 2, 'Torque delivered to the output shaft.'),
    out('InSpd', 'rad/s', 3, 'Angular speed of the input shaft.'),
  ],
  params: [
    par('Nmin', 'Minimum ratio', '1', 0.5, 'Lowest achievable ratio of input speed to output speed (overdrive).', 0, true),
    par('Nmax', 'Maximum ratio', '1', 2.5, 'Highest achievable ratio of input speed to output speed; must exceed Nmin.', 0, true),
    par('tau', 'Ratio time constant', 's', 0.2, 'Time constant of the first-order ratio actuator.', 0, true),
    par('eta', 'Efficiency', '1', 0.9, 'Mechanical efficiency, applied in the direction of power flow; in (0, 1].', 0, true, 1),
    par('N_o', 'Initial ratio', '1', 1, 'Ratio at the start of the simulation; must lie in [Nmin, Nmax].', 0, true),
  ],
  states: ['N'],
  equations: [
    'dN/dt = (clamp(RatioCmd, Nmin, Nmax) - N)/tau',
    'InSpd = N*OutSpd',
    'OutTrq = N*k*InTrq, k = eta if InTrq*InSpd >= 0, else 1/eta',
    'PwrLoss = InTrq*InSpd - OutTrq*OutSpd',
  ],
  references: [
    'MathWorks Powertrain Blockset documentation, Continuously Variable Transmission',
    'Naunheimer et al., Automotive Transmissions, 2nd ed., Springer 2011',
  ],
  description: 'Continuously variable transmission whose ratio follows the command through a first-order lag, limited to the ratio range of the variator.',
  behavior: 'The ratio is a state. The commanded ratio is limited to [Nmin, Nmax] and the ratio approaches it exponentially with time constant tau. The input speed is the ratio times the output speed, and the output torque is the ratio times the input torque scaled by eta when power flows from input to output and by 1/eta when back-driven. Nmax must exceed Nmin and the initial ratio must lie in the range, otherwise the block reports an error. Info reports the ratio, the powers and the power loss.',
  example: 'With Nmin = 0.5, Nmax = 2.5, tau = 0.2 s, eta = 0.9 and N_o = 1, a constant RatioCmd = 2 with InTrq = 100 N*m and OutSpd = 50 rad/s gives Ratio = 2 - exp(-t/0.2). At t = 0.2 s Ratio = 1.632, InSpd = 81.6 rad/s and OutTrq = 1.632*0.9*100 = 146.9 N*m. A command of 5 is limited to Nmax = 2.5.',
};

interface CvtEval { cmd: number; T: number; w: number }
function cvtEval(ins: XValue[], p: Record<string, any>, N: number): CvtEval | string {
  const cmd = num(ins[0]), T = num(ins[1]), w = num(ins[2]);
  if (![cmd, T, w, N].every(Number.isFinite)) return 'CVT inputs must be finite';
  if (!(p.Nmax > p.Nmin)) return 'CVT needs Nmax > Nmin';
  if (!(p.N_o >= p.Nmin && p.N_o <= p.Nmax)) return 'N_o must lie in [Nmin, Nmax]';
  return { cmd, T, w };
}

const cvtFactory = definePtBlock(cvtSpec, {
  init: p => ({ N: p.N_o }),
  derivatives: (ins, p, s) => {
    const e = cvtEval(ins, p, s.N);
    if (typeof e === 'string') return { N: 0 };
    return { N: (Math.min(Math.max(e.cmd, p.Nmin), p.Nmax) - s.N) / p.tau };
  },
  execute: (ins, p, s) => {
    const e = cvtEval(ins, p, s.N);
    if (typeof e === 'string') return { outputs: [{}, 0, 0], error: e };
    const spdIn = s.N * e.w;
    const k = e.T * spdIn >= 0 ? p.eta : 1 / p.eta;
    const trqOut = s.N * k * e.T;
    const pIn = e.T * spdIn, pOut = trqOut * e.w;
    return { outputs: [makeBus(['Ratio', 'InPwr', 'OutPwr', 'PwrLoss', 'Eff'], [s.N, pIn, pOut, pIn - pOut, k]), trqOut, spdIn] };
  },
});

export const TRANSMISSION_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [
  { spec, factory },
  { spec: amtSpec, factory: amtFactory },
  { spec: dctSpec, factory: dctFactory },
  { spec: cvtSpec, factory: cvtFactory },
];
