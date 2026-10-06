import { EquationContext } from './types';
import { numericParam, stringParam, vectorParam, unwrapParam, VLabParamError } from './vlabParams';
import { scalarInput, vectorInput } from './vlabVectorPorts';
import { interfaceResiduals, jointResiduals } from './vlabJointCore';
import { computeAbsoluteReferencePressure, computeEffectivePortPressure } from '../../utils/hydraulicUnits';
import {
  parseVector3,
  eulerToRotationMatrix,
  transformPoint,
  normalizeVector3,
  computeRelativeAngleAxis
} from './vlabFrameKinematics';
import {
  evaluateDOEModel,
  evaluateLegacyDOEEquation,
  evaluateDOEModelDetailed,
  evaluateLegacyDOEEquationDetailed
} from '../doe/modelEvaluator';

// These equations use derivatives or discrete history. Some differentiate
// across/through variables without internal states, so state flags alone
// cannot identify a static DAE. Keep this alongside their equation definitions.
export const DERIVATIVE_DEPENDENT_BLOCK_TYPES = new Set([
  // joints with a free DOF read the joint rate for their viscous term (discrete derivative of the pose)
  'universal_joint', 'revolute_joint', 'prismatic_joint',
  'capacitor', 'inductor', 'inertia', 'mass', 'thermal_mass', 'washing_basket',
  'dc_motor', 'bldc_motor', 'pmsm', 'gas_chamber', 'em_converter',
  'spring_damper_force', 'fluid_capacitance', 'fluid_inertance',
  'steam_accumulator', 'belt_spool', 'pulley', 'ps_lpf',
  'memristor', 'rot_spring', 'rot_hard_stop', 'rot_motion_sensor',
  'trans_motion_sensor', 'trans_spring', 'microwave_cavity',
  'ps_integrator', 'ps_transfer_fcn', 'ps_pi_ctrl', 'ps_pid_ctrl',
  'ac_motor', 'ma_chamber', 'lms_adaptive_filter', 'neural_neuron_learning',
  'ac_motor_pid_control', 'luenberger_observer', 'im_flux_observer', 'pmsm_foc',
  'ps_integrator_gen', 'ps_moving_avg', 'ps_sr_flipflop', 'ps_sample_hold',
  'ps_smith_predictor', 'ps_second_order_filter', 'ps_washout',
  'quad_decoder', 'resolver_to_digital', 'belt_end',
  // Fortescue phasors of the instantaneous signals use dx/dt (analytic signal)
  'sym_comp_transform',
]);

export interface BlockEquationArgs {
  across: any[];        // values of across variables at the ports (scalars, 6-DOF frame arrays, or N-element arrays for width-N / composite ports: read them by port id with vectorInput)
  dAcross: any[];          // derivatives of across variables (same shapes as `across`)
  branch: number[];        // values of branch through-variables
  dBranch: number[];       // derivatives of branch through-variables
  state: number[];         // values of internal states
  dState: number[];        // derivatives of internal states
  ctx: EquationContext;
  params: Record<string, any>;
  ports: string[];
  nodeId: string;
  /**
   * Port ids that are wired to another block. Optional physical-signal inputs
   * (e.g. the `s` port of force_source) read as 0 when unwired, so equations
   * must consult this to fall back to their parameter instead of using 0.
   * Undefined (direct unit-test calls) means "assume every port is connected".
   */
  connectedPorts?: string[];
}

export type BlockEquationFactory = (args: BlockEquationArgs) => number[];

/**
 * Single pattern for an optional physical-signal input with a parameter fallback.
 * An unwired physical input reads 0 (not undefined), so the port value is used only
 * when the port is actually wired (per `connectedPorts`). The port is located by id
 * (first match when several aliases are given); `legacyIdx` is only used by direct
 * unit-test calls that pass no `ports` array. `connectedPorts` undefined means
 * "assume every port is connected".
 */
export function inputOrParam(
  args: { across: number[]; ports?: string[]; connectedPorts?: string[] },
  portId: string | string[],
  fallback: number,
  legacyIdx = -1,
): number {
  const { across, ports, connectedPorts } = args;
  const ids = Array.isArray(portId) ? portId : [portId];
  let idx = -1;
  let id = ids[0];
  if (ports) {
    for (const cand of ids) {
      const i = ports.indexOf(cand);
      if (i !== -1) { idx = i; id = cand; break; }
    }
  } else {
    idx = legacyIdx;
  }
  const wired = idx !== -1 && across[idx] !== undefined && (!connectedPorts || !ports || connectedPorts.includes(id));
  return wired ? across[idx] : fallback;
}

// ── Power-electronics helpers (WP-12b): shared by the equations below and by the switching-event detector (vlabPhysics) ─────
/** Unit triangular carrier at f_sw: 0 at t = 0, rising to 1 at half a period (Mohan, "Power Electronics", fig. 8-7). Mean value 1/2. */
export const triangularCarrier = (time: number, fSw: number): number => {
  const phase = (time * fSw) % 1;
  return phase < 0.5 ? 2 * phase : 2 - 2 * phase;
};

/**
 * Duty references d_k in [0, 1] of the upper switch of the three legs of pwm_3ph_2level, before the carrier comparison.
 *  - sinusoidal_modulation: internal V/f generator m_k = M sin(2 pi f t - k 2 pi/3), M = amp input (or modulation_index), d = (1 + m)/2
 *  - three_phase_modulation: the vabc vector m_abc in [-1, 1] when it is wired (d = (1 + m)/2); otherwise the scalar duty inputs
 *    ma, mb, mc in [0, 1] (the legacy form); an unwired duty input is 0 (lower switch on: the safe zero-voltage state).
 * Over-modulation (|m| > 1) saturates at the rails (clamped), it never extrapolates.
 */
export function twoLevelReferences(
  args: { across: any[]; ports: string[]; connectedPorts?: string[]; params: Record<string, any> },
  time: number,
): number[] {
  const { params, ports, connectedPorts } = args;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const wired = (id: string) => ports.includes(id) && (!connectedPorts || connectedPorts.includes(id));
  // every parameter is read in every mode (a mode only selects which of them the equation uses)
  const f = numericParam(params, 'output_frequency_hz', 50);
  const modulationIndex = numericParam(params, 'modulation_index', 0.8);
  if (stringParam(params, 'control_mode', 'three_phase_modulation') === 'sinusoidal_modulation') {
    const M = clamp(inputOrParam(args, 'amp', modulationIndex), 0, 1);
    const angle = 2 * Math.PI * ((time * f) % 1);
    return [0, -2 * Math.PI / 3, 2 * Math.PI / 3].map(offset => 0.5 + 0.5 * M * Math.sin(angle + offset));
  }
  if (wired('vabc')) return vectorInput(args, 'vabc', 3).map(m => 0.5 + 0.5 * clamp(m, -1, 1));
  return ['ma', 'mb', 'mc'].map(id => (wired(id) ? clamp(scalarInput(args, id), 0, 1) : 0));
}

// ── Three-phase transforms (WP-09c): pure helpers shared by the vector blocks below ─────────────────────────────────────────
const SQRT3 = Math.sqrt(3);

/** Enumerated text parameter: missing -> fallback, a value outside `choices` is a VLabParamError, never a silent default. */
const choiceParam = (params: Record<string, any> | undefined, key: string, choices: readonly string[], fallback: string): string => {
  const s = stringParam(params, key, fallback).trim();
  const hit = choices.find(c => c.toLowerCase() === s.toLowerCase());
  if (!hit) {
    throw new VLabParamError([{
      blockId: '', param: key, raw: s, code: 'invalid-parameter',
      reason: `Parameter "${key}": "${s}" is not one of: ${choices.join(', ')}.`,
    }]);
  }
  return hit;
};

type ClarkeConvention = 'Peak Amp Preserved' | 'Power Preserved';
const clarkeConvention = (params: Record<string, any> | undefined): ClarkeConvention =>
  choiceParam(params, 'convention', ['Peak Amp Preserved', 'Power Preserved'], 'Peak Amp Preserved') as ClarkeConvention;

/** Clarke abc -> alpha-beta-zero (Simscape "Clarke Transform"). */
const clarkeForward = ([a, b, c]: [number, number, number], conv: ClarkeConvention): [number, number, number] => {
  if (conv === 'Power Preserved') {
    const k = Math.sqrt(2 / 3);
    return [k * (a - b / 2 - c / 2), k * (SQRT3 / 2) * (b - c), (a + b + c) / SQRT3];
  }
  return [(2 / 3) * (a - b / 2 - c / 2), (b - c) / SQRT3, (a + b + c) / 3];
};

/** Inverse Clarke alpha-beta-zero -> abc. */
const clarkeInverse = ([alpha, beta, zero]: [number, number, number], conv: ClarkeConvention): [number, number, number] => {
  if (conv === 'Power Preserved') {
    // the matrix is orthogonal: the inverse is its transpose
    const k = Math.sqrt(2 / 3);
    const z = zero / Math.SQRT2;
    return [k * (alpha + z), k * (-alpha / 2 + (SQRT3 / 2) * beta + z), k * (-alpha / 2 - (SQRT3 / 2) * beta + z)];
  }
  return [alpha + zero, -alpha / 2 + (SQRT3 / 2) * beta + zero, -alpha / 2 - (SQRT3 / 2) * beta + zero];
};

type ParkAlignment = 'Aligned with A' | '90 deg behind A';
const parkAlignment = (params: Record<string, any> | undefined): ParkAlignment =>
  choiceParam(params, 'alignment', ['90 deg behind A', 'Aligned with A'], '90 deg behind A') as ParkAlignment;

const parkRotate = (alpha: number, beta: number, theta: number, al: ParkAlignment): [number, number] => {
  const c = Math.cos(theta); const s = Math.sin(theta);
  return al === 'Aligned with A' ? [alpha * c + beta * s, -alpha * s + beta * c] : [alpha * s - beta * c, alpha * c + beta * s];
};
const parkRotateInverse = (d: number, q: number, theta: number, al: ParkAlignment): [number, number] => {
  const c = Math.cos(theta); const s = Math.sin(theta);
  // both rotations are orthogonal (det = 1): the inverse is the transpose
  return al === 'Aligned with A' ? [d * c - q * s, d * s + q * c] : [d * s + q * c, -d * c + q * s];
};

/** Fortescue peak magnitudes [|V1|, |V2|, |V0|] of the analytic phasors A_k = x_k - j dx_k/dt / w. */
const fortescueMagnitudes = (x: [number, number, number], dx: [number, number, number], w: number): [number, number, number] => {
  const re = x; const im = dx.map(d => -d / w);
  const ca = -0.5; const sa = SQRT3 / 2; // a = e^(j 2pi/3)
  // a^2 = conj(a)
  const mul = (zr: number, zi: number, k: 1 | 2): [number, number] => (k === 1 ? [zr * ca - zi * sa, zr * sa + zi * ca] : [zr * ca + zi * sa, -zr * sa + zi * ca]);
  const [br1, bi1] = mul(re[1], im[1], 1); const [cr2, ci2] = mul(re[2], im[2], 2);
  const [br2, bi2] = mul(re[1], im[1], 2); const [cr1, ci1] = mul(re[2], im[2], 1);
  const v1 = [(re[0] + br1 + cr2) / 3, (im[0] + bi1 + ci2) / 3];
  const v2 = [(re[0] + br2 + cr1) / 3, (im[0] + bi2 + ci1) / 3];
  const v0 = [(re[0] + re[1] + re[2]) / 3, (im[0] + im[1] + im[2]) / 3];
  return [Math.hypot(v1[0], v1[1]), Math.hypot(v2[0], v2[1]), Math.hypot(v0[0], v0[1])];
};

// Numeric parameters are read through numericParam (vlabParams.ts): a missing value takes the default, a user-supplied
// 0 / negative / "1e-3" is honoured, and malformed text throws a structured VLabParamError (never a silent default).

// Averaging time constant of ps_moving_avg's first-order approximation (s). The `window` parameter is not wired yet (WP-20).
const MOVING_AVG_TAU = 0.1;

const asFrame = (v: any): number[] =>
  Array.isArray(v) ? v : [Number(v) || 0, 0, 0, 0, 0, 0];

const wrenchResiduals = (branch: number[], force: number[], torque: number[]): number[] => [
  (branch[0] || 0) - force[0],
  (branch[1] || 0) - force[1],
  (branch[2] || 0) - force[2],
  (branch[3] || 0) - torque[0],
  (branch[4] || 0) - torque[1],
  (branch[5] || 0) - torque[2],
];

const trapezoidalBackEmf =(angle: number): number => {
  const twoPi = 2 * Math.PI;
  const normalized = ((angle % twoPi) + twoPi) % twoPi;

  if (normalized < Math.PI / 6) return 6 * normalized / Math.PI;
  if (normalized < 5 * Math.PI / 6) return 1;
  if (normalized < 7 * Math.PI / 6) return 1 - 6 * (normalized - 5 * Math.PI / 6) / Math.PI;
  if (normalized < 11 * Math.PI / 6) return -1;
  return -1 + 6 * (normalized - 11 * Math.PI / 6) / Math.PI;
};

/** Amplitude-invariant Clarke transform of three phase quantities: [alpha, beta, zero] = [(2a-b-c)/3, (b-c)/sqrt(3), (a+b+c)/3]. */
const clarkeAmplitudeInvariant = (a: number, b: number, c: number): [number, number, number] =>
  [(2 * a - b - c) / 3, (b - c) / Math.sqrt(3), (a + b + c) / 3];

// ── Shared belt/cable helpers ──────────────────────────────────────────────
const numParam = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const portIndex = (ports: string[], name: string, fallback: number): number => {
  const idx = (ports || []).findIndex(p => (p || '').toLowerCase() === name);
  return idx !== -1 ? idx : fallback;
};

// Belt/cable material resolution. Precedence: live ctx.parameters broadcast
// (published by belt_properties) > assembly-injected belt_density/belt_youngs
// > block's own density/youngs params. Returns null when no material source
// exists so consumers keep their legacy standalone behavior.
const resolveBeltMaterial = (
  params: Record<string, any> | undefined,
  ctx: EquationContext | undefined
): { density: number; youngs: number } | null => {
  const broadcastDensity = ctx?.parameters ? numParam(ctx.parameters['belt_density'], NaN) : NaN;
  const broadcastYoungs = ctx?.parameters ? numParam(ctx.parameters['belt_youngs'], NaN) : NaN;
  const injectedDensity = params ? numParam(params.belt_density, NaN) : NaN;
  const injectedYoungs = params ? numParam(params.belt_youngs, NaN) : NaN;
  const ownDensity = params ? numParam(params.density, NaN) : NaN;
  const ownYoungs = params ? numParam(params.youngs, NaN) : NaN;
  const densityRaw = Number.isFinite(broadcastDensity) ? broadcastDensity
    : Number.isFinite(injectedDensity) ? injectedDensity : ownDensity;
  const youngsRaw = Number.isFinite(broadcastYoungs) ? broadcastYoungs
    : Number.isFinite(injectedYoungs) ? injectedYoungs : ownYoungs;
  if (!Number.isFinite(densityRaw) && !Number.isFinite(youngsRaw)) return null;
  return {
    density: Math.max(0, Number.isFinite(densityRaw) ? densityRaw : 1.1),
    youngs: Number.isFinite(youngsRaw) && (youngsRaw as number) > 0 ? (youngsRaw as number) : 1e9,
  };
};

// ── Mechanical helpers (WP-13): shared by the equations below and by the contact-event detector (vlabPhysics) ──────────────

/**
 * Simscape Foundation > Mechanical > Rotational / Translational Friction (Stribeck + Coulomb + viscous):
 *   F = [ Fc + (Fbrk - Fc) * exp(-cv * |v|) ] * sign(v) + f * v
 * with the discontinuous sign(v) replaced by the continuous tanh(4 v / vThr) over the "linear region velocity threshold" vThr
 * (the block reaches 99.9 % of the Coulomb level at |v| = vThr). Fbrk >= Fc >= 0 [N or N*m], f [N*s/m or N*m*s/rad],
 * cv = transition approximation coefficient [s/m or s/rad], vThr [m/s or rad/s].
 */
export const stribeckFriction = (v: number, Fbrk: number, Fc: number, f: number, cv: number, vThr: number): number =>
  (Fc + (Fbrk - Fc) * Math.exp(-cv * Math.abs(v))) * Math.tanh(4 * v / vThr) + f * v;

/** cubic smooth step: 0 for u <= 0, 1 for u >= 1, C1 in between (the Simscape hard-stop transition-region blend) */
const smoothStep01 = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * Simscape Foundation > Mechanical > Rotational / Translational Hard Stop, "Full stiffness and damping applied at bounds,
 * damped rebound" in its continuous (transition-region) form. x = relative position (integral of v_R - v_C), bounds
 * lower < upper, contact stiffness k, contact damping c, transition region w:
 *   penetration p = x - upper (x > upper) or lower - x (x < lower), outward speed vo = +v / -v
 *   F_contact = max(0, k * p + c * vo * smoothstep(p / w))   (the stop only pushes; the damping acts only while in contact and
 *                                                            fades in over p in [0, w], so F is continuous at contact entry)
 * The through force follows the spring sign convention (positive for x > upper, negative for x < lower).
 */
export const hardStopForce = (x: number, v: number, lower: number, upper: number, k: number, c: number, w: number): number => {
  if (x > upper) {
    const p = x - upper;
    return Math.max(0, k * p + c * v * (w > 0 ? smoothStep01(p / w) : 1));
  }
  if (x < lower) {
    const p = lower - x;
    return -Math.max(0, k * p - c * v * (w > 0 ? smoothStep01(p / w) : 1));
  }
  return 0;
};

/** Axial stiffness of a belt end [N/m]: k = E*A/L from the linked belt material, else the `stiffness` parameter. */
export const beltEndStiffness = (params: Record<string, any> | undefined, ctx?: EquationContext): number => {
  const mat = resolveBeltMaterial(params, ctx);
  const len = numericParam(params, 'length', 1.0);
  const area = numericParam(params, 'area', 1e-3);
  return mat ? (mat.youngs * area) / len : numericParam(params, 'stiffness', 1e6);
};

export const blockEquations: Record<string, BlockEquationFactory> = {
  // ── ELECTRICAL DOMAIN ──────────────────────────────────────────────────────
  ground: () => [],
  delta_ref: () => [],
  open_circuit: () => [],
  subsystem: () => [],
  Subsystem: () => [],
  inport: () => [],
  Inport: () => [],
  outport: () => [],
  Outport: () => [],
  
  resistor: ({ across, branch, params }) => {
    // Simscape Foundation Electrical > Resistor: v = i * R, v = v_p - v_n, i positive p -> n through the block (R > 0, WP-08).
    // Residual: (Vp - Vn) - I*R = 0   [V]
    const R = numericParam(params, 'R', 100);
    return [(across[0] - across[1]) - branch[0] * R];
  },
  
  variable_resistor: ({ across, branch, params, ports, connectedPorts }) => {
    // Simscape Foundation Electrical > Variable Resistor: v = i * R, R = max(R_signal, R_min) (parameter "Minimum resistance",
    // default 1e-3 ohm). The control signal is the physical signal at port 'r' [ohm]; an unwired 'r' reads 100 ohm (documented).
    // Residual: (Vp - Vn) - I*max(R_ctrl, R_min) = 0   [V]
    const R_min = numericParam(params, 'R_min', 1e-3);
    const R_ctrl = Math.max(R_min, inputOrParam({ across, ports, connectedPorts }, 'r', 100, 2));
    return [(across[0] - across[1]) - branch[0] * R_ctrl];
  },
  
  infinite_resistance: ({ branch }) => {
    // Open branch (R -> infinity): i = 0, v is free. Residual: I = 0   [A]
    return [branch[0]];
  },

  capacitor: ({ dAcross, branch, params }) => {
    // Simscape Foundation Electrical > Capacitor: i = C * dv/dt, v = v_p - v_n, with parameter "Initial voltage" v0 (v(0) = v0).
    // v0 is honoured by seeding the node potentials of the solution vector so that v_p - v_n = v0 in the history of the first
    // step (vlabPhysics.seedCapacitorVoltages); the equation itself is the published relation.
    // Residual: I - C * d(Vp - Vn)/dt = 0   [A]
    const C = numericParam(params, 'C', 1e-6);
    return [branch[0] - C * (dAcross[0] - dAcross[1])];
  },

  inductor: ({ across, branch, dBranch, params }) => {
    // Simscape Foundation Electrical > Inductor: v = L * di/dt, v = v_p - v_n, i positive p -> n, with parameter
    // "Initial current" i0 (the branch current is seeded with i0, vlabPhysics). Residual: (Vp - Vn) - L*dI/dt = 0   [V]
    const L = numericParam(params, 'L', 1e-3);
    return [(across[0] - across[1]) - L * dBranch[0]];
  },
  
  memristor: ({ across, branch, state, dState, params }) => {
    // No Simscape Foundation / ee_lib analog (documented, simplified linear-drift memristor, not a published block):
    //   v = M(w) * i  with M(w) = M0 + 10 * w  [ohm], dw/dt = i  [C]  (w is the transported charge, 10 ohm/C drift gain).
    // Residuals: (Vp - Vn) - I*M = 0 [V],  dw/dt - I = 0 [A]
    const M0 = numericParam(params, 'M0', 100);
    const w = state[0];
    const M = M0 + 10 * w;
    return [
      (across[0] - across[1]) - branch[0] * M,
      dState[0] - branch[0]
    ];
  },
  
  switch: ({ across, branch, params, ports, connectedPorts }) => {
    // Simscape Foundation Electrical > Switch: closed when the control signal exceeds the threshold, v = i*Ron (closed
    // resistance Ron [ohm]); open otherwise, i = v*Gopen with Gopen = 1/Roff (Roff = 1/open conductance [ohm]).
    // The control is the physical signal at port 'v' [V]; unwired reads 0 V. The change of mode is a zero-crossing
    // event of (ctrl - threshold) handled in VLabPhysicsEngine.detectZeroCrossings (WP-11).
    // Residual: (Vp - Vn) - I*R = 0   [V],  R = ctrl > threshold ? Ron : Roff
    const Ron = numericParam(params, 'Ron', 0.01);
    const Roff = numericParam(params, 'Roff', 1e6);
    const threshold = numericParam(params, 'threshold', 0.5);
    const ctrl = inputOrParam({ across, ports, connectedPorts }, 'v', 0, 2);
    const R = ctrl > threshold ? Ron : Roff;
    return [(across[0] - across[1]) - branch[0] * R];
  },
  
  diode: ({ across, branch, params }) => {
    const Ron = numericParam(params, 'Ron', 0.01);
    const Roff = numericParam(params, 'Roff', 1e6);
    const Vf = numericParam(params, 'Vf', 0.7);
    const V = across[0] - across[1];
    // Simscape Electrical > Semiconductors > Diode, "Piecewise linear" model (forward voltage Vf, on resistance Ron,
    // off conductance Goff = 1/Roff), v = v_A - v_K, i positive A -> K:
    //   v <  Vf :  i = v*Goff                       (off)
    //   v >= Vf :  i = (v - Vf)/Ron + Vf*Goff       (on; equals Vf*Goff at v = Vf, so i(v) is continuous)
    // Residuals in voltage form [V]:  off: v - i*Roff,  on: v - Vf - Ron*(i - Vf*Goff).
    // The Vf*Goff offset is dropped only for the degenerate Roff = 0 (an always-closed device has no leakage term).
    const Ioffset = Roff > 0 ? Vf / Roff : 0;
    if (V > Vf) return [V - Vf - Ron * (branch[0] - Ioffset)];
    return [V - branch[0] * Roff];
  },
  
  nmos: ({ across, branch, params, ports }) => {
    // across[0] = Vd, across[1] = Vs, across[2] = Vg
    const portValue = (id: string, fallbackIndex: number) => {
      const index = ports?.indexOf(id) ?? -1;
      const value = index >= 0 ? across[index] : across[fallbackIndex];
      // a port the block does not have reads 0 (optional port); a NaN input never gets here (the assembler rejects it)
      return value ?? 0;
    };
    const Vd = portValue('d', 0);
    const Vs = portValue('s', 1);
    const Vg = portValue('g', 2);
    const kn = numericParam(params, 'kn', 0.5);
    const Vth = numericParam(params, 'Vth', 2.0);
    const lambda = numericParam(params, 'lambda', 0.01);
    
    // Shichman-Hodges (SPICE level 1) N-channel MOSFET, gate current 0, kn = mu*Cox*W/L [A/V^2], lambda [1/V]:
    //   Vov = Vgs - Vth
    //   cut-off    Vov <= 0       :  Id = 0
    //   linear     0 < Vds < Vov  :  Id = kn*(Vov*Vds - Vds^2/2)*(1 + lambda*Vds)
    //   saturation Vds >= Vov > 0 :  Id = kn/2*Vov^2*(1 + lambda*Vds)
    // (Sedra & Smith, Microelectronic Circuits; SPICE level-1 model: the (1 + lambda*Vds) factor applies in the linear region
    // too, so Id and dId/dVds are continuous at Vds = Vov; Id is C0 at Vov = 0.) Like SPICE the device is symmetric:
    // for Vds < 0 drain and source swap roles, Vgs -> Vgd = Vg - Vd, Vds -> -Vds, and the current reverses.
    // Residual: Id_branch - Id(Vgs, Vds) = 0   [A]
    const reversed = Vd < Vs;
    const Vlow = reversed ? Vd : Vs;
    const Vgs = Vg - Vlow;
    const Vds = reversed ? Vs - Vd : Vd - Vs;
    const Vov = Vgs - Vth;

    let Id_target = 0;
    if (Vov > 0) {
      if (Vds < Vov) {
        Id_target = kn * (Vov * Vds - 0.5 * Vds * Vds) * (1 + lambda * Vds);
      } else {
        Id_target = 0.5 * kn * Vov * Vov * (1 + lambda * Vds);
      }
    }

    const Id = reversed ? -Id_target : Id_target;
    const residual = branch[0] - Id;
    // A non-finite residual is reported by the assembler (block, row), never turned into 0 (F-045).
    return [residual];
  },
  
  igbt: ({ across, branch, params }) => {
    // across[0] = Vc, across[1] = Ve, across[2] = Vg
    const Vge_th = numericParam(params, 'Vge_th', 5.5);
    const Vce_sat = numericParam(params, 'Vce_sat', 1.5);
    const Rd = numericParam(params, 'Rd', 0.05);
    const Roff = numericParam(params, 'Roff', 1e6);
    
    const Vge = across[2] - across[1];
    const Vce = across[0] - across[1];
    
    // Simscape Electrical > Semiconductors > IGBT (Ideal, Switching): gate on when Vge >= Vge_th (threshold), then a
    // unidirectional piecewise-linear conduction path with forward voltage Vce_sat and on resistance Rd; off: leakage
    // through the off conductance Goff = 1/Roff only (parameters: Vce_sat = Vf, Rd = Ron, Roff = 1/Goff):
    //   off (Vge < Vge_th)           : Ic = Vce*Goff
    //   on  (Vge >= Vge_th)          : Ic = (Vce - Vce_sat)/Rd + Vce_sat*Goff   if Vce >= Vce_sat,  else Vce*Goff
    // (continuous in Vce at Vce_sat). The gate turn-on is a zero-crossing event of (Vge - Vge_th), handled in
    // VLabPhysicsEngine.detectZeroCrossings, not a smoothed blend (WP-11: the old tanh blend changed Ic by up to
    // 0.03 % two volts above threshold and moved the real threshold). Residual: Ic_branch - Ic = 0   [A]
    const on = Vge >= Vge_th;
    const Ic = on && Vce >= Vce_sat
      ? (Vce - Vce_sat) / Rd + Vce_sat / Roff
      : Vce / Roff;

    return [branch[0] - Ic];
  },
  
  v_sensor: ({ across, branch, params }) => {
    // Simscape Foundation Electrical > Voltage Sensor: V = v_p - v_n, ideal (no current). Deviation: a finite input
    // resistance R_int (default 1e8 ohm) models a real meter; R_int -> infinity recovers the ideal sensor.
    // branch[0] is leakage current p -> n: I_leak - V/R_int = 0   [A]
    // branch[1] is output signal: signal_out - V = 0   [V]
    const R_int = numericParam(params, 'R_int', 1e8);
    const V = across[0] - across[1];
    return [
      branch[0] - V / R_int,
      branch[1] - V
    ];
  },
  
  i_sensor: ({ across, branch, params }) => {
    // Simscape Foundation Electrical > Current Sensor: v_p - v_n = 0 (ideal short), I = i (p -> n). Deviation: a small series
    // resistance R_int (default 1e-6 ohm); R_int = 0 recovers the ideal sensor.
    // branch[0] is the through current p -> n: (Vp - Vn) - I*R_int = 0   [V]
    // branch[1] is output signal: signal_out - I = 0   [A]
    const R_int = numericParam(params, 'R_int', 1e-6);
    const V = across[0] - across[1];
    return [
      V - branch[0] * R_int,
      branch[1] - branch[0]
    ];
  },
  
  dc_voltage: ({ across, branch, params }) => {
    // Simscape Foundation Electrical > DC Voltage Source: v = V (v = v_p - v_n; i positive p -> n through the source, so a
    // source that delivers power has i < 0). Deviation: series resistance R_int (default 1e-3 ohm; Simscape's source is ideal,
    // R_int = 0 recovers it). Residual: (Vp - Vn) - V - I*R_int = 0   [V]
    const V = numericParam(params, 'V', 12);
    const R_int = numericParam(params, 'R_int', 1e-3);
    return [(across[0] - across[1]) - V - branch[0] * R_int];
  },
  
  ac_voltage: ({ across, branch, params, ctx }) => {
    // Simscape Foundation Electrical > AC Voltage Source: v = A*sin(2*pi*f*t + phi) (Vpk = A [V], f [Hz], phase = phi [rad]).
    // Deviations: default phase pi/4 (Simscape 0; chosen against zero-sampling aliasing at the lab step, locked by
    // ac_voltage_parameters.test.ts) and series resistance R_int (default 1e-3 ohm; 0 recovers the ideal source).
    // Residual: (Vp - Vn) - Vpk*sin(2*pi*f*t + phase) - I*R_int = 0   [V]
    const Vpk = numericParam(params, 'Vpk', 230);
    const f = numericParam(params, 'f', 50);
    const phase = numericParam(params, 'phase', Math.PI / 4);
    const R_int = numericParam(params, 'R_int', 1e-3);
    const V_ac = Vpk * Math.sin(2 * Math.PI * f * ctx.time + phase);
    return [(across[0] - across[1]) - V_ac - branch[0] * R_int];
  },
  
  controlled_voltage: ({ across, branch, params, ports, connectedPorts }) => {
    // Simscape Foundation Electrical > Controlled Voltage Source: v = S (physical signal at port 's' [V]; 0 V when unwired).
    // Deviation: series resistance R_int (default 1e-3 ohm; 0 recovers the ideal source).
    // Residual: (Vp - Vn) - S - I*R_int = 0   [V]
    const S = inputOrParam({ across, ports, connectedPorts }, 's', 0, 2);
    const R_int = numericParam(params, 'R_int', 1e-3);
    return [(across[0] - across[1]) - S - branch[0] * R_int];
  },
  
  dc_current: ({ branch, params }) => {
    // Simscape Foundation Electrical > DC Current Source: i = I, positive from p to n through the source. Residual: I_branch - I = 0   [A]
    const I = numericParam(params, 'I', 1);
    return [branch[0] - I];
  },
  
  transformer: ({ across, branch, params }) => {
    // Simscape Electrical > Passive > Ideal Transformer, turns ratio N = N1/N2 (winding 1 = p1/n1, winding 2 = p2/n2):
    //   v1 = N * v2,   i2 = -N * i1   (i1, i2 positive INTO p1 / p2). Power: v1*i1 + v2*i2 = N*v2*i1 - N*v2*i1 = 0 (lossless).
    // (Until WP-10 the block used the key N with v2 = N*v1, i.e. N_old = N2/N1; the canonical key is now N12 = N1/N2 = 1/N_old,
    // and vlabModelMigration maps a saved N to N12 = 1/N.) Default N12 = 0.1 reproduces the old default v2 = 10*v1.
    // Residuals: V1 - N12*V2 = 0 [V],  I2 + N12*I1 = 0 [A]
    const N = numericParam(params, 'N12', 0.1);
    const V1 = across[0] - across[1];
    const V2 = across[2] - across[3];
    return [
      V1 - N * V2,
      branch[1] + N * branch[0]
    ];
  },
  
  gyrator: ({ across, branch, params }) => {
    // Simscape Electrical > Passive > Gyrator: i1 = G * v2, i2 = -G * v1 (G = gyration conductance [S]; i1, i2 INTO p1 / p2).
    // Power: v1*i1 + v2*i2 = G*v1*v2 - G*v1*v2 = 0 (lossless).
    // Residuals: I1 - G*V2 = 0 [A],  I2 + G*V1 = 0 [A]
    const g = numericParam(params, 'g', 0.01);
    const V1 = across[0] - across[1];
    const V2 = across[2] - across[3];
    return [
      branch[0] - g * V2,
      branch[1] + g * V1
    ];
  },
  
  opamp: ({ across, branch, params }) => {
    // Simscape Electrical > Integrated Circuits > Op-Amp (behavioural, ground-referenced output, ideal inputs draw no current):
    //   V_out = clamp(A * (V+ - V-), -Vsat, +Vsat),  A = open-loop gain [1], Vsat = supply-rail limit [V] (default 15 V).
    // The output current is the free branch variable (supplied by the rails). Residual: V_out - clamp(...) = 0   [V]
    const Gain = numericParam(params, 'Gain', 1e5);
    const Vsat = numericParam(params, 'Vsat', 15);
    const Vplus = across[0];
    const Vminus = across[1];
    const Vout = across[2];
    const targetV = Math.max(-Vsat, Math.min(Vsat, Gain * (Vplus - Vminus)));
    return [Vout - targetV];
  },

  three_phase_source: (args) => {
    // Simscape Electrical > Sources > Three-Phase Source (wye connection): the phase-to-neutral voltages of a balanced,
    // positive-sequence (a-b-c) source, v_k = v_abc,k - v_n:
    //   v_a = sqrt(2/3) V_LL sin(w t + phi),  v_b = sqrt(2/3) V_LL sin(w t + phi - 2 pi/3),  v_c = sqrt(2/3) V_LL sin(w t + phi + 2 pi/3)
    // V_LL = phase-to-phase RMS voltage [V] (param Vrms), f = frequency [Hz], phi = phase angle of phase A [deg] (Simscape
    // default 0). The star point n is a real terminal (reference it with an Electrical Reference block); the three phase
    // currents are the through variables (positive from abc,k through the source to n, Simscape convention), so a balanced
    // load returns zero current in n. No hidden phase shift and no absolute potentials to ground (F-068).
    // Residuals: (v_abc,k - v_n) - v_k = 0   [V], k = a, b, c
    const { params, ctx } = args;
    const abc = vectorInput(args, 'abc', 3);
    const n = scalarInput(args, 'n');
    const Vll = numericParam(params, 'Vrms', 400);
    const f = numericParam(params, 'f', 50);
    const phi = numericParam(params, 'phase', 0) * Math.PI / 180;
    const Vpk = Vll * Math.sqrt(2 / 3);
    const w = 2 * Math.PI * f;
    return [0, 1, 2].map(k => (abc[k] - n) - Vpk * Math.sin(w * ctx.time + phi - k * 2 * Math.PI / 3));
  },

  busbar: ({ across, branch }) => {
    // Library equation: V_1 = V_2 = ... = V_n and sum I_k = 0. branch[k] is the current into the bar at terminal k,
    // so n terminals give (n - 1) potential equalities plus one current balance = n rows for n unknowns.
    const residuals: number[] = [];
    for (let i = 1; i < across.length; i++) {
      residuals.push(across[i] - across[0]);
    }
    residuals.push(branch.reduce((sum, current) => sum + current, 0));
    return residuals;
  },

  phase_splitter: (args) => {
    // Composite three-phase port abc <-> scalar phase ports a, b, c (WP-09c, Simscape "Phase Splitter"): the phase k node of
    // the composite port IS the scalar port k, V_k(scalar) = V_abc[k] (an ideal wire per phase). The phase currents are the
    // three through variables (branch k = current from abc,k into the block, out through scalar port k), so KCL holds
    // per phase and the phases are NOT short-circuited together.
    const abc = vectorInput(args, 'abc', 3);
    return [
      scalarInput(args, 'a') - abc[0],
      scalarInput(args, 'b') - abc[1],
      scalarInput(args, 'c') - abc[2],
    ];
  },

  vcvs: ({ across, branch, params }) => {
    // Simscape Electrical > Additional Components > Voltage-Controlled Voltage Source: v_out = K * v_in, v_in = v_cp - v_cn,
    // the control port draws no current. gain K [1] (0 is legal: the output is a short). Residual: (Vp - Vn) - K*(Vcp - Vcn) = 0   [V]
    const gain = numericParam(params, 'gain', 1);
    const Vin = across[2] - across[3];
    const Vout = across[0] - across[1];
    return [Vout - gain * Vin];
  },

  vccs: ({ across, branch, params }) => {
    // Simscape Electrical > Additional Components > Voltage-Controlled Current Source: i_out = G * v_in, v_in = v_cp - v_cn,
    // i_out positive p -> n through the source, no control current. gain G [S]. Residual: I - G*(Vcp - Vcn) = 0   [A]
    const gain = numericParam(params, 'gain', 1);
    const Vin = across[2] - across[3];
    return [branch[0] - gain * Vin];
  },

  cccs: ({ across, branch, params }) => {
    // Simscape Electrical > Additional Components > Current-Controlled Current Source: i_out = K * i_in, the control port is an
    // ideal ammeter (v_cp - v_cn = i_in * R_in, R_in default 0 = short). K [1].
    // branch[0]: output current (p -> n), branch[1]: control current (cp -> cn)
    // Residuals: I_out - K*I_ctrl = 0 [A],  (Vcp - Vcn) - R_in*I_ctrl = 0 [V]
    const gain = numericParam(params, 'gain', 1);
    const Rin = numericParam(params, 'R_in', 0);
    const Vctrl = (across[2] ?? 0) - (across[3] ?? 0);
    return [
      branch[0] - gain * branch[1],
      Vctrl - branch[1] * Rin
    ];
  },

  ccvs: ({ across, branch, params }) => {
    // Simscape Electrical > Additional Components > Current-Controlled Voltage Source: v_out = R_m * i_in (+ R_out * i_out for
    // a non-ideal output), control port is an ideal ammeter (v_cp - v_cn = i_in * R_in, default 0). R_m = gain [ohm].
    // branch[0]: output voltage source current (p -> n), branch[1]: control current (cp -> cn)
    // Residuals: (Vp - Vn) - R_m*I_ctrl - R_out*I_out = 0 [V],  (Vcp - Vcn) - R_in*I_ctrl = 0 [V]
    const gain = numericParam(params, 'gain', 1);
    const Rin = numericParam(params, 'R_in', 0);
    const Rout = numericParam(params, 'R_out', 0);
    const Vout = (across[0] ?? 0) - (across[1] ?? 0);
    const Vctrl = (across[2] ?? 0) - (across[3] ?? 0);
    return [
      Vout - gain * branch[1] - branch[0] * Rout,
      Vctrl - branch[1] * Rin
    ];
  },

  // ── ROTATIONAL DOMAIN ──────────────────────────────────────────────────────
  rot_ref: () => [],
  
  inertia: ({ across, dAcross, branch, params }) => {
    // Simscape Foundation > Mechanical > Rotational Elements > Inertia: T = J * d(omega)/dt (omega = absolute speed of the
    // node, relative to the inertial frame). B is NOT a Simscape inertia parameter: it is the optional viscous drag to the
    // inertial frame kept (default 0 = Simscape) so that models saved with the old 0.001 default behave identically (WP-13, F-074).
    const J = numericParam(params, 'J', 0.01);
    const B = numericParam(params, 'B', 0);
    return [branch[0] - J * dAcross[0] - B * across[0]];
  },

  rot_spring: ({ across, branch, state, dState, params }) => {
    // Simscape Rotational Spring: T = K * phi,  phi = phi0 + integral(omega_R - omega_C) dt  (phi0 = initial deformation)
    const k = numericParam(params, 'k', 100);
    const theta0 = numericParam(params, 'theta0', 0);
    const theta = state[0];
    const omega = across[0] - (across[1] || 0);
    return [
      branch[0] - k * (theta0 + theta),
      dState[0] - omega
    ];
  },

  rot_damper: ({ across, branch, params }) => {
    // Simscape Rotational Damper: T = D * (omega_R - omega_C)
    const b = numericParam(params, 'b', 0.1);
    const omega = across[0] - (across[1] || 0);
    return [branch[0] - b * omega];
  },

  rot_friction: ({ across, branch, params }) => {
    // Simscape Rotational Friction: T = [Tc + (Tbrk - Tc) exp(-cv |w|)] tanh(4 w / wThr) + f w   (see stribeckFriction)
    const Tbrk = numericParam(params, 'Tbrk', 0.6);
    const Tc = numericParam(params, 'Tc', 0.5);
    const Tv = numericParam(params, 'Tv', 0.1);
    const cv = numericParam(params, 'cv', 10);
    const wthr = numericParam(params, 'wthr', 0.01);
    const omega = across[0] - (across[1] || 0);
    return [branch[0] - stribeckFriction(omega, Tbrk, Tc, Tv, cv, wthr)];
  },

  rot_hard_stop: ({ across, branch, state, dState, params }) => {
    // Simscape Rotational Hard Stop, continuous damped-rebound contact (see hardStopForce); theta = integral(w_R - w_C) dt.
    // Contact entry / exit is a zero-crossing event of theta - lower / theta - upper (VLabPhysicsEngine.detectZeroCrossings).
    const lower = numericParam(params, 'lower', -1);
    const upper = numericParam(params, 'upper', 1);
    const k = numericParam(params, 'k', 1000);
    const c = numericParam(params, 'c', 0.1);
    const w = numericParam(params, 'transition', 1e-4);
    const omega = across[0] - (across[1] || 0);
    return [branch[0] - hardStopForce(state[0], omega, lower, upper, k, c, w), dState[0] - omega];
  },
  
  torque_source: ({ across, branch, params, ports, connectedPorts }) => {
    // Torque = S (commanded via the `s` port when wired, else the T parameter)
    const S = inputOrParam({ across, ports, connectedPorts }, 's', numericParam(params, 'T', 5), 2);
    return [branch[0] - S];
  },
  
  rot_motion_sensor: ({ across, branch, state, dState }) => {
    // branch[0] is through torque (ideal sensor has 0 torque load)
    // branch[1] is output signal w (velocity); branch[2] is output signal a (angle)
    // state[0] is theta (position)
    const omega = across[0] - (across[1] || 0);
    return [
      branch[0],
      branch[1] - omega,
      branch[2] - state[0],
      dState[0] - omega
    ];
  },

  trans_motion_sensor: ({ across, branch, state, dState }) => {
    // branch[0] is through force (ideal sensor has 0 force load)
    // branch[1] is output signal v (velocity)
    // branch[2] is output signal p (position)
    // state[0] is x (position)
    const v = across[0] - (across[1] || 0);
    return [
      branch[0],
      branch[1] - v,
      branch[2] - state[0],
      dState[0] - v
    ];
  },

  force_sensor: ({ across, branch }) => {
    // Acts as rigid mechanical connection (v1 = v2) and outputs through force to signal
    const v1 = across[0];
    const v2 = across[1];
    return [
      v1 - v2,
      branch[1] - branch[0]
    ];
  },
  
  torque_sensor: ({ across, branch }) => {
    // acts as rigid connection for mechanical port: omega1 = omega2
    // outputs branch torque to signal
    const w1 = across[0];
    const w2 = across[1];
    return [
      w1 - w2,
      branch[1] - branch[0]
    ];
  },
  
  gear_box: ({ across, branch, params, ports }) => {
    // w1 = ratio * w2  =>  w2 = w1 / ratio
    // T1 * w1 + T2 * w2 = 0  =>  ratio * T1 + T2 = 0
    const ratio = numericParam(params, 'ratio', 2);
    let w1: number;
    let w2: number;

    if (ports && (ports.includes('s1') || ports.includes('s2'))) {
      const s1Idx = ports.indexOf('s1');
      const s2Idx = ports.indexOf('s2');
      w1 = (s1Idx !== -1 && across[s1Idx] !== undefined) ? across[s1Idx] : (across[0] ?? 0);
      w2 = (s2Idx !== -1 && across[s2Idx] !== undefined) ? across[s2Idx] : (across[1] ?? 0);
    } else if (ports && (ports.includes('r1') || ports.includes('c1'))) {
      const r1Idx = ports.indexOf('r1');
      const c1Idx = ports.indexOf('c1');
      const r2Idx = ports.indexOf('r2');
      const c2Idx = ports.indexOf('c2');
      const wr1 = (r1Idx !== -1 && across[r1Idx] !== undefined) ? across[r1Idx] : (across[0] ?? 0);
      const wc1 = (c1Idx !== -1 && across[c1Idx] !== undefined) ? across[c1Idx] : (across[1] ?? 0);
      const wr2 = (r2Idx !== -1 && across[r2Idx] !== undefined) ? across[r2Idx] : (across[2] ?? 0);
      const wc2 = (c2Idx !== -1 && across[c2Idx] !== undefined) ? across[c2Idx] : (across[3] ?? 0);
      w1 = wr1 - wc1;
      w2 = wr2 - wc2;
    } else {
      if (across.length >= 4) {
        w1 = across[0] - (across[1] || 0);
        w2 = across[2] - (across[3] || 0);
      } else {
        w1 = across[0] ?? 0;
        w2 = across[1] ?? 0;
      }
    }

    return [
      w1 - ratio * w2,
      ratio * (branch[0] ?? 0) + (branch[1] ?? 0)
    ];
  },

  // ── TRANSLATIONAL DOMAIN ───────────────────────────────────────────────────
  trans_ref: () => [],
  
  mass: ({ across, dAcross, branch, params }) => {
    // Simscape Foundation > Mechanical > Translational Elements > Mass: F = m * dv/dt (v = absolute speed of the node).
    // b is NOT a Simscape mass parameter: it is the optional viscous drag to the inertial frame kept (default 0 = Simscape)
    // so that models saved with the old 0.1 default behave identically (WP-13, F-074).
    const m = numericParam(params, 'm', 1.0);
    const b = numericParam(params, 'b', 0);
    return [branch[0] - m * dAcross[0] - b * across[0]];
  },

  trans_spring: ({ across, branch, state, dState, params }) => {
    // Simscape Translational Spring: F = K * x,  x = x0 + integral(v_R - v_C) dt  (x0 = initial deformation)
    const k = numericParam(params, 'k', 1000);
    const x0 = numericParam(params, 'x0', 0);
    const x = state[0];
    const v = across[0] - (across[1] || 0);
    return [
      branch[0] - k * (x0 + x),
      dState[0] - v
    ];
  },

  trans_damper: ({ across, branch, params }) => {
    // Simscape Translational Damper: F = D * (v_R - v_C)
    const b = numericParam(params, 'b', 10);
    const v = across[0] - (across[1] || 0);
    return [branch[0] - b * v];
  },

  trans_friction: ({ across, branch, params }) => {
    // Simscape Translational Friction: F = [Fc + (Fbrk - Fc) exp(-cv |v|)] tanh(4 v / vThr) + f v   (see stribeckFriction)
    const Fbrk = numericParam(params, 'Fbrk', 6);
    const Fc = numericParam(params, 'Fc', 5);
    const Fv = numericParam(params, 'Fv', 2);
    const cv = numericParam(params, 'cv', 10);
    const vthr = numericParam(params, 'vthr', 0.01);
    const v = across[0] - (across[1] || 0);
    return [branch[0] - stribeckFriction(v, Fbrk, Fc, Fv, cv, vthr)];
  },

  trans_hard_stop: ({ across, branch, state, dState, params }) => {
    // Simscape Translational Hard Stop, continuous damped-rebound contact (see hardStopForce); x = integral(v_R - v_C) dt.
    // The old equation read x = 0.01 * (absolute node speed) and always added 1.0 * v (F-075); both are gone.
    const lower = numericParam(params, 'lower', -0.1);
    const upper = numericParam(params, 'upper', 0.1);
    const k = numericParam(params, 'k', 10000);
    const c = numericParam(params, 'c', 10);
    const w = numericParam(params, 'transition', 1e-4);
    const v = across[0] - (across[1] || 0);
    return [branch[0] - hardStopForce(state[0], v, lower, upper, k, c, w), dState[0] - v];
  },
  
  force_source: ({ across, branch, params, ports, connectedPorts }) => {
    // Force = S (commanded via the `s` port when wired, else the F parameter)
    const S = inputOrParam({ across, ports, connectedPorts }, 's', numericParam(params, 'F', 10), 2);
    return [branch[0] - S];
  },

  lever: ({ across, branch, params, ports = [] }) => {
    // Ideal massless rigid lever, small angle, pivot C between A (arm L1) and B (arm L2, opposite side).
    // Rigid-body kinematics about the pivot: v_A = v_C + w*L1, v_B = v_C - w*L2  (w = lever angular rate)
    //   => (v_A - v_C)*L2 + (v_B - v_C)*L1 = 0                          (velocity relation, v_A/v_B = -L1/L2 at a fixed pivot)
    // Statics (forces INTO the block, branch[k] = F_A, F_B, F_C): moment about the pivot F_A*L1 - F_B*L2 = 0, force sum
    // F_A + F_B + F_C = 0 (pivot reaction)  =>  power F_A v_A + F_B v_B + F_C v_C = v_C*sum(F) + w*(F_A*L1 - F_B*L2) = 0.
    const L1 = numericParam(params, 'L1', 0.5);
    const L2 = numericParam(params, 'L2', 0.5);
    const vA = across[portIndex(ports, 'a', 0)];
    const vB = across[portIndex(ports, 'b', 1)];
    const vC = across[portIndex(ports, 'c', 2)];
    return [
      (vA - vC) * L2 + (vB - vC) * L1,
      branch[0] * L1 - branch[1] * L2,
      branch[0] + branch[1] + branch[2]
    ];
  },

  // ── THERMAL DOMAIN ─────────────────────────────────────────────────────────
  thermal_ref: () => [],
  
  conductive_heat: ({ across, branch, params }) => {
    // Q = k * (Ta - Tb) or (k * A / L) * (Ta - Tb)
    // k is the thermal conductance in W/K (library unit); geometry (A, L) is not a parameter of this block.
    const k = numericParam(params, 'k', 1.0);
    const dT = across[0] - across[1];
    return [branch[0] - k * dT];
  },
  
  convective_heat: ({ across, branch, params }) => {
    // Q = h * A * (Ta - Tb)
    const h = numericParam(params, 'h', 10.0);
    const A = numericParam(params, 'A', 0.1);
    const dT = across[0] - across[1];
    return [branch[0] - h * A * dT];
  },
  
  radiative_heat: ({ across, branch, params }) => {
    // Q = eps * sigma * A * (Ta^4 - Tb^4)
    const eps = numericParam(params, 'eps', 0.9);
    const A = numericParam(params, 'A', 0.1);
    const sigma = 5.67e-8; // Stefan-Boltzmann
    const Ta = across[0];
    const Tb = across[1];
    const heat = eps * sigma * A * (Math.pow(Ta, 4) - Math.pow(Tb, 4));
    return [branch[0] - heat];
  },
  
  thermal_mass: ({ across, dAcross, branch, params }) => {
    // Q = C * dT/dt
    const C = Math.max(1e-6, numericParam(params, 'C', 100.0));
    return [branch[0] - C * dAcross[0]];
  },
  
  temp_sensor: ({ across, branch, ports }) => {
    // across[0]: T_a, across[1]: T_b
    // branch[0]: heat_flow through sensor, branch[1]: output signal
    const Ta = across[0] ?? 0;
    const Tb = across[1] ?? 0;
    return [
      branch[0],             // zero heat flow
      branch[1] - (Ta - Tb)  // output signal = Ta - Tb
    ];
  },
  
  heat_sensor: (args) => blockEquations.heat_flow_sensor(args),
  
  heat_src: ({ branch, params }) => {
    const Q = numericParam(params, 'Q', 100);
    return [branch[0] - Q];
  },
  
  temp_src: ({ across, branch, params }) => {
    const T = numericParam(params, 'T', 293.15);
    return [across[0] - T];
  },
  
  ctrl_heat_src: ({ across, branch, ports, connectedPorts }) => {
    const Q = inputOrParam({ across, ports, connectedPorts }, 's', 0, 2);
    return [branch[0] - Q];
  },
  
  ctrl_temp_src: ({ across, branch, ports, connectedPorts }) => {
    const S = inputOrParam({ across, ports, connectedPorts }, 's', 293.15, 2);
    const Ta = across[0] ?? 0;
    const Tb = (ports && ports.includes('b') && across[1] !== undefined) ? across[1] : 0;
    return [(Ta - Tb) - S];
  },

  // ── COUPLINGS ──────────────────────────────────────────────────────────────
  rotational_electromechanical_converter: ({ across, branch, params }) => {
    // V = Ra*I + K*w => (Vp-Vn) - I*Ra - K*w = 0           (Simscape Foundation Rotational Electromechanical Converter, L = 0)
    // T_in = -K*I: branch[1] is the torque INTO the block at R, the torque delivered is K*I
    //   => V*I + T_in*w = Ra*I^2 (electrical power in = resistive loss + mechanical power out).
    const K = numericParam(params, 'K', 1);
    const Ra = numericParam(params, 'R', 1);
    const V = across[0] - across[1];
    const w = across[2] - across[3];
    const I = branch[0];
    const T = branch[1];
    return [
      V - I * Ra - K * w,
      T + K * I
    ];
  },
  
  translational_electromechanical_converter: ({ across, branch, params }) => {
    // V = I*R + Bl*v
    // F_in = -Bl*I: branch[1] is the force INTO the block at R, the force delivered is Bl*I
    //   => V*I + F_in*v = R*I^2.
    const Bl = numericParam(params, 'Bl', 1.0);
    const R = numericParam(params, 'R', 1.0);
    const V = across[0] - across[1];
    const v = across[2] - across[3];
    const I = branch[0];
    const F = branch[1];
    return [
      V - I * R - Bl * v,
      F + Bl * I
    ];
  },
  
  thermal_resistor: ({ across, branch, params }) => {
    // V = I * R => (Vp-Vn) - I*R = 0
    // Q_heat = I^2 * R (flows OUT of the component into the thermal node)
    const R = numericParam(params, 'R', 10.0);
    const V = across[0] - across[1];
    const I = branch[0];
    const Q = branch[1];
    return [
      V - I * R,
      Q - I * I * R
    ];
  },

  microwave_inverter: ({ across, branch, params, ports, connectedPorts }) => {
    // branch[0] is current_in, branch[1] is current_out
    // Ideal, loss-free high-voltage supply with unity-power-factor input (loss-free resistor, Erickson and Maksimovic,
    // "Fundamentals of Power Electronics", ch. 18; averaged model, no energy storage):
    //   V_hv = ctrl * v_out                                  [V]   regulated HV output, measured against the model ground
    //   i_in = G_e v_ac,   G_e = V_hv i_out / v_in^2         [S]   input conductance (resistor emulation, in phase with v_ac)
    // so the instantaneous input power is v_ac i_in = (V_hv i_out) v_ac^2 / v_in^2 and its cycle average is exactly the output
    // power V_hv i_out when the supply rms equals the nominal v_in (the dividing-by-v_ac form of P_in = P_out is singular at the
    // zero crossings, so the nominal v_in^2 is used). i_in is the current INTO the block at ac_in, i_out the current OUT of the
    // block at hv_out; both terminals are measured against the model ground (single-ended ports, no return terminal).
    // branch[0] = i_in, branch[1] = i_out. Residuals: [V_hv - ctrl v_out,  i_in - (V_hv i_out / v_in^2) v_ac]
    const ctrl_val = inputOrParam({ across, ports, connectedPorts }, 'ctrl', 1.0, 2);
    const v_out_target = (numericParam(params, 'v_out', 4000)) * ctrl_val;
    const v_in_nom = numericParam(params, 'v_in', 230);
    const V_ac = across[ports.indexOf('ac_in')];
    const V_out = across[ports.indexOf('hv_out')];
    return [
      V_out - v_out_target,
      branch[0] - ((V_out * branch[1]) / (v_in_nom * v_in_nom)) * V_ac
    ];
  },

  magnetron: ({ across, branch, params }) => {
    // branch[0] is current, branch[1] is heat_flow
    const V = across[0] - across[1];
    const P_rated = numericParam(params, 'power_rating', 900);
    const eff = (numericParam(params, 'efficiency', 65)) / 100;
    const V_nom = numericParam(params, 'v_nominal', 4000);
    // Electrical power follows the documented P = P_rated * (V/V_nom)^2
    // characteristic, so at the nominal 4000 V the magnetron draws its
    // rated power and outputs P_rated * efficiency as heat (≈585 W for 900 W, 65%).
    const power_factor = Math.pow(V / Math.max(1, V_nom), 2);
    const P_elec = P_rated * power_factor;
    const I = P_elec / Math.max(1, Math.abs(V));
    const Q = P_rated * eff * power_factor;
    return [
      branch[0] - I,
      branch[1] - Q
    ];
  },

  upper_heater: ({ across, branch, params }) => {
    // branch[0] is current, branch[1] is heat_flow
    const V = across[0] - across[1];
    const R = numericParam(params, 'resistance', 35.0);
    const eff = numericParam(params, 'efficiency', 0.9);
    const I = V / R;
    const Q = I * I * R * eff;
    return [
      branch[0] - I,
      branch[1] - Q
    ];
  },

  steam_generator: ({ across, branch, params }) => {
    // branch[0] is current, branch[1] is heat_flow
    const P = numericParam(params, 'power', 800);
    const V = across[0] - across[1];
    const I_target = P / 230;
    return [
      V - branch[0] * (230 / Math.max(1, I_target)),
      branch[1] - P
    ];
  },

  microwave_cavity: ({ across, branch, state, dState, params }) => {
    // branch[0] is heat_flow1, branch[1] is heat_flow2, branch[2] is heat_flow3, branch[3] is signal_t
    // state[0] is temp
    const getVal = (key: string, fallback: number): number => numericParam(params, key, fallback);

    const vol = getVal('volume', 25);
    const maxTempC = getVal('max_temp', 250);
    const maxTempK = maxTempC > 350 ? maxTempC : maxTempC + 273.15;
    const T_amb_C = getVal('ambient_temp', 25);
    const T_amb = T_amb_C > 200 ? T_amb_C : T_amb_C + 273.15;

    // Thermal mass: air + cavity walls + optional food/water load.
    // Without a food load the cavity has very little thermal capacitance,
    // which is unphysical and causes the temperature to rise without limit.
    const food_mass = getVal('food_mass', 0.5); // kg
    const food_cp = getVal('food_cp', 4184);    // J/(kg*K), water approx.
    const wall_mass = getVal('wall_mass', 2.0); // kg
    const wall_cp = getVal('wall_cp', 460);     // J/(kg*K), steel approx.
    const C_air = vol * 0.0012 * 1005;
    const C = C_air + wall_mass * wall_cp + food_mass * food_cp;

    // Heat loss based on cavity surface area (cube approximation) so that
    // larger 55 L cavities lose heat faster than smaller 25 L ones.
    const V_m3 = vol * 1e-3;
    const side = Math.pow(V_m3, 1 / 3);
    const A = 6 * side * side;
    const h_conv = getVal('h_conv', 10); // W/(m^2*K) natural convection
    const eps = getVal('eps', 0.85);     // emissivity
    const sigma = 5.67e-8;
    const U_A = h_conv * A;

    const temp = state[0] > 1.0 ? state[0] : T_amb;

    // Convective loss + Stefan-Boltzmann radiation loss
    const Q_conv = U_A * (temp - T_amb);
    const Q_rad = eps * sigma * A * (Math.pow(temp, 4) - Math.pow(T_amb, 4));
    const Q_loss = Q_conv + Q_rad;

    // Thermal safety cutout: smoothly reduce heat input as the cavity
    // temperature approaches the safety limit. A hard step discontinuity
    // caused DAE solver convergence failures in Simscape-style models.
    const Q_raw = branch[0] + branch[1] + branch[2];
    const cutoff_width = 3.0; // K
    const cutoff = 0.5 * (1.0 + Math.tanh((maxTempK - temp) / cutoff_width));
    const Q_in = Q_raw * cutoff;

    return [
      across[0] - temp,
      across[1] - temp,
      across[2] - temp,
      branch[3] - temp,
      dState[0] - (Q_in - Q_loss) / C
    ];
  },

  // ── PHYSICAL SIGNAL BLOCKS ─────────────────────────────────────────────────
  constant: ({ branch, params }) => {
    const val = numericParam(params, 'value', 1.0);
    return [branch[0] - val];
  },

  ps_constant: ({ branch, params }) => {
    const val = numericParam(params, 'value', 1.0);
    return [branch[0] - val];
  },

  ps_step: ({ branch, params, ctx }) => {
    const step_time = numericParam(params, 'time', 1.0);
    const initial = numericParam(params, 'initial', 0.0);
    const final = numericParam(params, 'final', 1.0);
    const val = ctx.time >= step_time ? final : initial;
    return [branch[0] - val];
  },
  
  ps_sine: ({ branch, params, ctx }) => {
    const A = numericParam(params, 'amp', 1.0);
    const f = numericParam(params, 'freq', 1.0);
    const val = A * Math.sin(2 * Math.PI * f * ctx.time);
    return [branch[0] - val];
  },
  
  ps_ramp: ({ branch, params, ctx }) => {
    const slope = numericParam(params, 'slope', 1.0);
    const start = numericParam(params, 'start', 0.0);
    const val = ctx.time > start ? slope * (ctx.time - start) : 0.0;
    return [branch[0] - val];
  },
  
  ps_add: ({ across, branch }) => {
    return [branch[0] - ((across[0] || 0) + (across[1] || 0))];
  },
  
  ps_subtract: ({ across, branch }) => {
    return [branch[0] - ((across[0] || 0) - (across[1] || 0))];
  },
  
  ps_gain: ({ across, branch, params }) => {
    const gain = numericParam(params, 'gain', 1.0);
    return [branch[0] - gain * (across[0] || 0)];
  },
  
  ps_product: ({ across, branch }) => {
    return [branch[0] - (across[0] || 0) * (across[1] || 0)];
  },
  
  ps_divide: ({ across, branch }) => {
    const den = Math.abs(across[1] || 0) < 1e-12 ? 1e-12 : (across[1] || 0);
    return [branch[0] - (across[0] || 0) / den];
  },
  
  ps_abs: ({ across, branch }) => {
    return [branch[0] - Math.abs(across[0] || 0)];
  },
  
  ps_saturation: ({ across, branch, params }) => {
    const upper = numericParam(params, 'upper', 1.0);
    const lower = numericParam(params, 'lower', -1.0);
    const val = Math.max(lower, Math.min(upper, across[0] || 0));
    return [branch[0] - val];
  },
  
  ps_dead_zone: ({ across, branch, params }) => {
    const upper = numericParam(params, 'upper', 0.5);
    const lower = numericParam(params, 'lower', -0.5);
    const u = across[0] || 0;
    const val = u > lower && u < upper ? 0.0 : u;
    return [branch[0] - val];
  },
  
  ps_switch: ({ across, branch, params }) => {
    const threshold = numericParam(params, 'threshold', 0.5);
    const ctrl = across[2] || 0;
    const val = ctrl > threshold ? (across[0] || 0) : (across[1] || 0);
    return [branch[0] - val];
  },
  
  ps_math: ({ across, branch, params }) => {
    const func = stringParam(params, 'func', 'sin');
    const u = across[0] || 0;
    let val = 0;
    switch (func) {
      case 'sin': val = Math.sin(u); break;
      case 'cos': val = Math.cos(u); break;
      case 'tan': val = Math.tan(u); break;
      case 'exp': val = Math.exp(u); break;
      case 'log': val = Math.log(Math.max(1e-15, u)); break;
      case 'sqrt': val = Math.sqrt(Math.max(0.0, u)); break;
      case 'square': val = u * u; break;
      default: val = u; break;
    }
    return [branch[0] - val];
  },
  
  ps_lookup_1d: ({ across, branch, params }) => {
    const table_x = vectorParam(params, 'table_x', [0, 1, 2]);
    const table_y = vectorParam(params, 'table_y', [0, 1, 4]);
    const u = across[0] || 0;
    
    // Linear interpolation
    let val = table_y[0];
    if (u <= table_x[0]) {
      val = table_y[0];
    } else if (u >= table_x[table_x.length - 1]) {
      val = table_y[table_y.length - 1];
    } else {
      for (let i = 0; i < table_x.length - 1; i++) {
        if (u >= table_x[i] && u <= table_x[i + 1]) {
          const t = (u - table_x[i]) / (table_x[i + 1] - table_x[i]);
          val = table_y[i] + t * (table_y[i + 1] - table_y[i]);
          break;
        }
      }
    }
    return [branch[0] - val];
  },

  ps_integrator: ({ across, branch, state, dState }) => {
    // dy/dt = u => dState[0] - across[0] = 0
    // signal = y => branch[0] - state[0] = 0
    return [
      branch[0] - state[0],
      dState[0] - across[0]
    ];
  },

  ps_transfer_fcn: ({ across, branch, state, dState, params }) => {
    // T * dy/dt + y = u
    const T = numericParam(params, 'T', 1.0);
    return [
      branch[0] - state[0],
      T * dState[0] + state[0] - across[0]
    ];
  },

  ps_lpf: ({ across, branch, state, dState, params }) => {
    // First-order low-pass H(s) = 1/(1 + T s) has its -3 dB corner at w_c = 1/T, so T = 1/(2*pi*f_cut).
    // T dy/dt + y = u; the derivative goes through the shared stencil (BDF1 reproduces y(k) = alpha u + (1-alpha) y(k-1)).
    const T = 1 / (2 * Math.PI * numericParam(params, 'f_cut', 100));
    const u = across[0] || 0;
    return [
      branch[0] - state[0],
      T * dState[0] + state[0] - u
    ];
  },

  ps_pi_ctrl: ({ across, branch, state, dState, params }) => {
    const Kp = numericParam(params, 'Kp', 1.0);
    const Ki = numericParam(params, 'Ki', 0.0);
    const error = across[0] || 0;
    const integral = state[0];
    
    // Saturation limit
    const limit = numericParam(params, 'limit', Infinity);
    const u_unsat = Kp * error + Ki * integral;
    const u = Math.max(-limit, Math.min(limit, u_unsat));
    
    // Anti-windup
    let error_int = error;
    if (u !== u_unsat && Math.sign(error) === Math.sign(u_unsat)) {
      error_int = 0; // stop integrating if saturated
    }
    
    return [
      branch[0] - u,
      dState[0] - error_int
    ];
  },

  ps_pid_ctrl: ({ across, branch, state, dState, params, ctx }) => {
    const Kp = numericParam(params, 'Kp', 1.0);
    const Ki = numericParam(params, 'Ki', 0.0);
    const Kd = numericParam(params, 'Kd', 0.0);
    const N = numericParam(params, 'N', 100); // derivative filter coef
    const error = across[0] || 0;
    const integral = state[0];
    const filter = state[1];
    
    // Derivative filter dynamics: filter_dot = N * (error - filter)
    const deriv = N * (error - filter);
    const limit = numericParam(params, 'limit', Infinity);
    
    const u_unsat = Kp * error + Ki * integral + Kd * deriv;
    const u = Math.max(-limit, Math.min(limit, u_unsat));
    
    // Anti-windup
    let error_int = error;
    if (u !== u_unsat && Math.sign(error) === Math.sign(u_unsat)) {
      error_int = 0;
    }
    
    return [
      branch[0] - u,
      dState[0] - error_int,
      dState[1] - deriv
    ];
  },

  // ── DOMAIN APPLIANCES & CUSTOM ─────────────────────────────────────────────
  washing_basket: ({ across, dAcross, branch, params }) => {
    // across[0] is omega (angular velocity)
    // J_total = J_basket + (load_mass + unbalance) * radius^2
    const J_basket = numericParam(params, 'J_basket', 0.1);
    const M_clothes = numericParam(params, 'load_mass', 5.0);
    const M_unbal = numericParam(params, 'unbalance', 0.5);
    const R = numericParam(params, 'radius', 0.25);
    const J_total = J_basket + (M_clothes + M_unbal) * R * R;
    const B = numericParam(params, 'damping', 0.02);
    
    // Dynamic torque load and physical output vis signal
    return [
      branch[0] - (J_total * dAcross[0] + B * across[0]),
      branch[1] - across[0]
    ];
  },
  
  washing_fluid: ({ across, branch, params }) => {
    // across[0] is omega
    const Det = numericParam(params, 'detergent', 1);
    const Water = numericParam(params, 'water_level', 10);
    const drag = numericParam(params, 'drag_coeff', 0.05); // base viscous drag coefficient (N-m-s/rad)
    const viscosity = drag + (Det * 0.02) + (Water * 0.005);
    const torque = viscosity * across[0] + 0.01 * Math.sign(across[0]) * across[0] * across[0];
    // One rotational port `r` -> one torque branch (the second row duplicated it and had no unknown, F-025).
    return [
      branch[0] - torque
    ];
  },
  

  // ── MACHINES DOMAIN ────────────────────────────────────────────────────────
  // Mechanical reference of every machine below (F-064, explicit): the single Rotational port R is the rotor shaft, its
  // across variable is the ROTOR SPEED RELATIVE TO THE INERTIAL FRAME and the machine case is fixed to that frame. This is a
  // library-declared internal reference (INTERNAL_MECHANICAL_REFERENCE in vlabElectricalReference.ts), not a name rule: the
  // block has no case / return port whose name could be mistaken for a reference. The reaction torque on the case is absorbed
  // by the inertial frame. Electrical star points (ac_motor.n, pmsm.n, bldc_motor.g) are real terminals with a through
  // current and are never grounded by name.
  dc_motor: ({ across, dAcross, branch, dBranch, state, dState, params }) => {
    // Permanent-magnet DC machine (Simscape DC Motor; Krause, Analysis of Electric Machinery, ch. 2 / Ogata, Modern Control
    // Engineering, DC servomotor):
    //   v = Ra i + La di/dt + k w            [V]   (back-EMF constant k = Ke, V s/rad)
    //   tau_e = k i                           [N m] (torque constant = back-EMF constant in SI, so no energy is created)
    //   J dw/dt = tau_e - B w - tau_shaft     [N m] (tau_shaft = torque delivered to the load at R)
    // Power balance: v i = Ra i^2 + d(La i^2/2)/dt + B w^2 + d(J w^2/2)/dt + tau_shaft w   (F-059: one constant k).
    // across[0,1]: electrical terminals p, n; across[2]: shaft speed w; state[0]: rotor angle theta, state[1]: speed w
    const Ra = numericParam(params, 'Ra', 2.0);
    const La = numericParam(params, 'La', 0.01);
    const k = numericParam(params, 'Ke', 0.05);
    const J = numericParam(params, 'J', 0.01);
    const B = numericParam(params, 'B', 0.001);

    const V = across[0] - across[1];
    const Ia = branch[0];
    const dIa = dBranch[0];
    const torque = branch[1];

    return [
      V - Ia * Ra - La * dIa - k * state[1],             // branch[0]: current
      across[2] - state[1],                              // branch[1]: torque (link port across to speed state)
      dState[0] - state[1],                              // state[0]: theta
      torque - (k * Ia - J * dState[1] - B * state[1])   // state[1]: omega
    ];
  },

  ac_motor: (args) => {
    // Squirrel-cage induction machine, stationary (alpha-beta) reference frame, amplitude-invariant Clarke transform,
    // rotor quantities referred to the stator (Krause, Wasynczuk, Sudhoff, Analysis of Electric Machinery, ch. 4-5; Simscape
    // Electrical "Asynchronous Machine Squirrel Cage" uses the same T-equivalent):
    //   v_s = Rs i_s + d psi_s/dt,   0 = Rr i_r + d psi_r/dt - j w_e psi_r,   w_e = P w (rotor electrical speed)
    //   psi_s = Ls i_s + Lm i_r,     psi_r = Lr i_r + Lm i_s,                  Ls = Lls + Lm, Lr = Llr + Lm
    //   tau_e = (3/2) P (psi_s_alpha i_s_beta - psi_s_beta i_s_alpha) = (3/2) P (Lm/Lr)(psi_r_alpha i_beta - psi_r_beta i_alpha)
    //   J dw/dt = tau_e - B w - tau_shaft
    // Eliminating i_r = (psi_r - Lm i_s)/Lr (states: rotor flux psi_r) gives the implemented residuals
    //   v_s = Rs i_s + sigma Ls d i_s/dt + (Lm/Lr) d psi_r/dt,   sigma Ls = Ls - Lm^2/Lr
    //   d psi_r/dt = -(Rr/Lr)(psi_r - Lm i_s) + j w_e psi_r
    //   zero sequence: v_0 = Rs i_0 + Lls d i_0/dt (the rotor cage carries no zero-sequence current)
    // The stator is wye connected: i_k flows from phase terminal k through the winding to the star point n (n is a terminal;
    // an open n forces i_a + i_b + i_c = 0). state: theta, w, psi_r_alpha, psi_r_beta.
    const { branch, dBranch, state, dState, params } = args;
    const Rs = numericParam(params, 'Rs', 0.1);
    const Rr = numericParam(params, 'Rr', 0.08);
    const Lm = numericParam(params, 'Lm', 0.05);
    const Lls = numericParam(params, 'Lls', 0.01);
    const Llr = numericParam(params, 'Llr', 0.01);
    const P = numericParam(params, 'P', 2);
    const J = numericParam(params, 'J', 0.05);
    const B = numericParam(params, 'B', 0.005);
    const Lr = Llr + Lm;
    const Ls = Lls + Lm;
    const sigmaLs = Ls - (Lm * Lm) / Lr;

    const abc = vectorInput(args, 'abc', 3);
    const vn = scalarInput(args, 'n');
    const [vAlpha, vBeta, vZero] = clarkeAmplitudeInvariant(abc[0] - vn, abc[1] - vn, abc[2] - vn);
    const [iAlpha, iBeta, iZero] = clarkeAmplitudeInvariant(branch[0], branch[1], branch[2]);
    const [dIAlpha, dIBeta, dIZero] = clarkeAmplitudeInvariant(dBranch[0], dBranch[1], dBranch[2]);
    const torque = branch[3];
    const omega = state[1];
    const wE = P * omega;
    const psiAlpha = state[2];
    const psiBeta = state[3];
    const Te = 1.5 * P * (Lm / Lr) * (psiAlpha * iBeta - psiBeta * iAlpha);

    return [
      vAlpha - Rs * iAlpha - sigmaLs * dIAlpha - (Lm / Lr) * dState[2],   // branch[0]: alpha-axis stator voltage
      vBeta - Rs * iBeta - sigmaLs * dIBeta - (Lm / Lr) * dState[3],      // branch[1]: beta-axis stator voltage
      vZero - Rs * iZero - Lls * dIZero,                                  // branch[2]: zero sequence
      scalarInput(args, 'r') - omega,                                     // branch[3]: torque (link port across to speed state)
      dState[0] - omega,                                                  // state[0]: theta
      torque - (Te - J * dState[1] - B * omega),                          // state[1]: omega (torque equation)
      dState[2] + (Rr / Lr) * (psiAlpha - Lm * iAlpha) + wE * psiBeta,    // state[2]: rotor flux alpha
      dState[3] + (Rr / Lr) * (psiBeta - Lm * iBeta) - wE * psiAlpha      // state[3]: rotor flux beta
    ];
  },

  bldc_motor: (args) => {
    // Three-phase brushless DC machine with trapezoidal back-EMF (Pillay and Krishnan, "Modeling, simulation and analysis of
    // permanent-magnet motor drives, part II: the brushless DC motor drive", IEEE Trans. Ind. Appl. 25(2), 1989; Simscape
    // Electrical "Trapezoidal PMSM" form): per phase x in {a, b, c}, wye connected, star point g
    //   v_x - v_g = Rs i_x + Ls d i_x/dt + e_x,    e_x = Ke w f(P theta - phi_x)       phi = 0, 2 pi/3, -2 pi/3
    //   tau_e = (e_a i_a + e_b i_b + e_c i_c) / w = Ke (f_a i_a + f_b i_b + f_c i_c)
    //   J dw/dt = tau_e - B w - tau_shaft
    // f is the unit trapezoid (flat +-1 over 120 deg, 60 deg ramps). Ke [V s/rad] is the back-EMF constant (peak phase
    // back-EMF per mechanical rad/s) and, in SI, the torque constant: tau_e w = sum(e_x i_x) holds exactly (no energy is
    // created), so there is one constant, like the DC motor (F-059). state: theta (mechanical), w.
    const { branch, dBranch, state, dState, params } = args;
    const Rs = numericParam(params, 'Rs', 0.2);
    const Ls = numericParam(params, 'Ls', 0.002);
    const Ke = numericParam(params, 'Ke', 0.1);
    const P = numericParam(params, 'P', 4);
    const J = numericParam(params, 'J', 0.02);
    const B = numericParam(params, 'B', 0.002);

    const abc = vectorInput(args, 'abc', 3);
    const vg = scalarInput(args, 'g');
    const Va = abc[0] - vg;
    const Vb = abc[1] - vg;
    const Vc = abc[2] - vg;

    const ia = branch[0];
    const ib = branch[1];
    const ic = branch[2];
    const torque = branch[3];
    const electricalAngle = P * state[0];
    const phaseA = trapezoidalBackEmf(electricalAngle);
    const phaseB = trapezoidalBackEmf(electricalAngle - 2 * Math.PI / 3);
    const phaseC = trapezoidalBackEmf(electricalAngle + 2 * Math.PI / 3);
    const ea = Ke * state[1] * phaseA;
    const eb = Ke * state[1] * phaseB;
    const ec = Ke * state[1] * phaseC;
    const Te = Ke * (phaseA * ia + phaseB * ib + phaseC * ic);

    return [
      Va - ia * Rs - Ls * dBranch[0] - ea,               // branch[0]: ia
      Vb - ib * Rs - Ls * dBranch[1] - eb,               // branch[1]: ib
      Vc - ic * Rs - Ls * dBranch[2] - ec,               // branch[2]: ic
      scalarInput(args, 'r') - state[1],                 // branch[3]: torque
      dState[0] - state[1],                              // state[0]: theta
      torque - (Te - J * dState[1] - B * state[1])       // state[1]: omega
    ];
  },

  pmsm: (args) => {
    // Permanent-magnet synchronous machine, rotor-fixed dq frame, amplitude-invariant Clarke / Park transforms (Krause et al.,
    // ch. 5; Simscape Electrical "PMSM" / Mathworks dq equations):
    //   v_d = Rs i_d + Ld d i_d/dt - w_e Lq i_q
    //   v_q = Rs i_q + Lq d i_q/dt + w_e (Ld i_d + lambda_m),         w_e = p w (electrical speed), theta_e = p theta
    //   v_0 = Rs i_0 + L0 d i_0/dt
    //   tau_e = (3/2) p (lambda_m i_q + (Ld - Lq) i_d i_q)
    //   J dw/dt = tau_e - B w - tau_shaft
    // The d axis is aligned with phase a at theta = 0. The stator is wye connected: i_k flows from terminal k to the star point
    // n (an open n forces i_a + i_b + i_c = 0, so i_0 = 0). Power into the stator = (3/2)(v_d i_d + v_q i_q) + 3 v_0 i_0.
    // state: theta (mechanical), w.
    const { branch, dBranch, state, dState, params } = args;
    const Rs = numericParam(params, 'Rs', 0.1);
    const P = numericParam(params, 'pole_pairs', 4);
    const Ld = numericParam(params, 'Ld', 0.005);
    const Lq = numericParam(params, 'Lq', 0.005);
    const L0 = numericParam(params, 'L0', 0.005);
    const flux = numericParam(params, 'flux', 0.1);
    const J = numericParam(params, 'J', 0.02);
    const B = numericParam(params, 'B', 0.002);

    const abc = vectorInput(args, 'abc', 3);
    const vn = scalarInput(args, 'n');
    const torque = branch[3];

    const [vAlpha, vBeta, vZero] = clarkeAmplitudeInvariant(abc[0] - vn, abc[1] - vn, abc[2] - vn);
    const [iAlpha, iBeta, iZero] = clarkeAmplitudeInvariant(branch[0], branch[1], branch[2]);
    const [dIAlpha, dIBeta, dIZero] = clarkeAmplitudeInvariant(dBranch[0], dBranch[1], dBranch[2]);

    const electricalAngle = P * state[0];
    const electricalSpeed = P * state[1];
    const cosTheta = Math.cos(electricalAngle);
    const sinTheta = Math.sin(electricalAngle);
    const vd = cosTheta * vAlpha + sinTheta * vBeta;
    const vq = -sinTheta * vAlpha + cosTheta * vBeta;
    const id = cosTheta * iAlpha + sinTheta * iBeta;
    const iq = -sinTheta * iAlpha + cosTheta * iBeta;
    // d(i_d)/dt = (rotated alpha-beta derivative) + w_e i_q ; d(i_q)/dt = (...) - w_e i_d  (the angle also moves)
    const dId = cosTheta * dIAlpha + sinTheta * dIBeta + electricalSpeed * iq;
    const dIq = -sinTheta * dIAlpha + cosTheta * dIBeta - electricalSpeed * id;

    const Te = 1.5 * P * (flux * iq + (Ld - Lq) * id * iq);

    return [
      vd - Rs * id - Ld * dId + electricalSpeed * Lq * iq,
      vq - Rs * iq - Lq * dIq - electricalSpeed * (Ld * id + flux),
      vZero - Rs * iZero - L0 * dIZero,
      scalarInput(args, 'r') - state[1],                 // branch[3]: torque
      dState[0] - state[1],                              // state[0]: theta
      torque - (Te - J * dState[1] - B * state[1])       // state[1]: omega
    ];
  },

  // ── INVERTERS & CONTROL BLOCKS ─────────────────────────────────────────────
  pwm_3ph_2level: (args) => {
    // Two-level three-phase voltage-source inverter (Mohan, Undeland, Robbins, "Power Electronics", ch. 8; Simscape Electrical
    // "Average-Value Inverter (Three-Phase)" for the averaged model, "Converter (Three-Phase)" with ideal switches for the
    // switching model). Leg k has an upper and a lower ideal switch with duty d_k in [0, 1] of the upper one; v_n is the DC- rail:
    //   v_k - v_n = d_k Vdc - R_out i_k,out          (k = a, b, c; i_k,out = -i_k, the current flowing OUT of terminal k)
    //   i_dc,in   = sum_k d_k i_k,out                 (power balance: Vdc i_dc = sum (v_k - v_n + R_out i_k,out) i_k,out)
    // averaged: d_k is the continuous reference; switching: d_k = 1 when the reference >= the triangular carrier at f_sw,
    // else 0 (ideal legs with anti-parallel diodes, no dead time). Reference: m_k in [-1, 1] -> d_k = (1 + m_k) / 2, so the
    // fundamental pole voltage amplitude is m Vdc / 2 (linear range, m <= 1). Internal V/f generator (sinusoidal_modulation):
    // m_k = M sin(2 pi f t - k 2 pi/3), M = input amp (or param modulation_index).
    // branch: [i_dc (p -> block), i_a, i_b, i_c (abc,k -> block)]. Residuals: [i_dc + sum d_k i_k, (v_k - v_n) - d_k Vdc - R_out i_k]
    const { branch, params, ctx } = args;
    const abc = vectorInput(args, 'abc', 3);
    const vn = scalarInput(args, 'n');
    const Vdc = scalarInput(args, 'p') - vn;
    const Rout = numericParam(params, 'output_resistance_ohm', 0.001);
    const refs = twoLevelReferences(args, ctx.time);
    const carrier = triangularCarrier(ctx.time, numericParam(params, 'f_sw', 5000));
    const duties = stringParam(params, 'model_mode', 'averaged') === 'switching'
      ? refs.map(ref => ref >= carrier ? 1 : 0)
      : refs;
    const [Idc, Ia, Ib, Ic] = branch;
    return [
      Idc + duties[0] * Ia + duties[1] * Ib + duties[2] * Ic,
      (abc[0] - vn) - duties[0] * Vdc - Ia * Rout,
      (abc[1] - vn) - duties[1] * Vdc - Ib * Rout,
      (abc[2] - vn) - duties[2] * Vdc - Ic * Rout
    ];
  },

  vfd_controller: ({ across, branch, params, ctx, ports, connectedPorts }) => {
    const wRefId = ports.find(p => p.toLowerCase().startsWith('w') && p.toLowerCase().includes('ref')) ?? 'w_ref';
    const w_ref = inputOrParam({ across, ports, connectedPorts }, wRefId, 1500);
    const w_rad = w_ref * (2 * Math.PI / 60);
    ctx.parameters['grid_freq'] = w_rad;
    const V_mag = Math.max(0.1, Math.min(1.0, Math.abs(w_ref) / 1500));

    const isPhysicalOutput = (pId: string) => {
      const id = pId.toLowerCase();
      return ['g', 'vabc', 'vis', 'y', 'out'].includes(id) || id.startsWith('out') || id.startsWith('signal');
    };
    const outputs = ports.filter(isPhysicalOutput);
    const residuals = outputs.map((outPort, idx) => {
      const id = outPort.toLowerCase();
      if (id === 'vabc') return branch[idx] - V_mag;
      if (id === 'g') return branch[idx] - 1.0;
      return branch[idx] - 0.0;
    });
    return residuals;
  },

  im_foc_ctrl: ({ across, branch, params, ctx, ports, connectedPorts }) => {
    const wRefId = ports.find(p => p.toLowerCase().startsWith('w') && p.toLowerCase().includes('ref')) ?? 'wr_ref';
    const w_ref = inputOrParam({ across, ports, connectedPorts }, wRefId, numericParam(params, 'target_rpm', 1500));
    const w_rad = w_ref * (2 * Math.PI / 60);
    ctx.parameters['grid_freq'] = w_rad;

    const isPhysicalOutput = (pId: string) => {
      const id = pId.toLowerCase();
      return ['g', 'vabc', 'vis', 'y', 'out'].includes(id) || id.startsWith('out') || id.startsWith('signal');
    };
    const outputs = ports.filter(isPhysicalOutput);
    const residuals = outputs.map((outPort, idx) => {
      const id = outPort.toLowerCase();
      if (id === 'vabc') return branch[idx] - 1.0;
      if (id === 'g') return branch[idx] - 1.0;
      return branch[idx] - 0.0;
    });
    return residuals;
  },

  // ── GAS AND MOIST AIR DOMAINS ──────────────────────────────────────────────
  ma_ref: () => [],

  ma_chamber: ({ across, branch, state, dState, params }) => {
    // across[0]: P_a (Fluid), across[1]: P_b (Fluid), across[2]: T_h (Thermal)
    // branch[0]: mass_flow at port a, branch[1]: heat_flow at port h
    const V = numericParam(params, 'V', 0.005);
    const T_amb = numericParam(params, 'ambient_temp', 25) + 273.15;
    const rho = 1.2, Cp = 1005;
    const airCapacity = rho * Cp * V;
    const wallCapacity = numericParam(params, 'wall_mass', 2.0) * numericParam(params, 'wall_cp', 460);
    const loadCapacity = numericParam(params, 'food_mass', 0.5) * numericParam(params, 'food_cp', 4184);
    const C = Math.max(1e-6, airCapacity + wallCapacity + loadCapacity);
    const temp = state[0] > 1.0 ? state[0] : T_amb;

    // Physical heat loss to the ambient environment (convection/conduction through basket walls)
    const k_loss = numericParam(params, 'k_loss', 8.5); // W/K, realistic overall heat loss coefficient
    const heat_loss = k_loss * (temp - T_amb);
    const maxTempK = numericParam(params, 'max_temp', 220) + 273.15;
    const cutoffWidth = 3.0;
    const cutoff = 0.5 * (1.0 + Math.tanh((maxTempK - temp) / cutoffWidth));
    const heat_input = branch[1] * cutoff;
    
    return [
      branch[0] - 0.0,
      heat_input + C * dState[0] + heat_loss, /* heat entering chamber = C * dT/dt + heat_loss */
      across[2] - temp
    ];
  },

  ma_pressure_source: ({ across, branch, params, ports, connectedPorts }) => {
    // Pb - Pa - P_max * ctrl = 0 (ctrl = 1 when port 's' is unwired)
    const P_max = numericParam(params, 'P', 150);
    const ctrl = inputOrParam({ across, ports, connectedPorts }, 's', 1.0, 2);
    const Pa = across[0];
    const Pb = across[1];
    return [(Pb - Pa) - P_max * ctrl];
  },

  lms_adaptive_filter: ({ across, branch, state, dState, params, ports, connectedPorts }) => {
    const a = { across, ports, connectedPorts };
    const x = inputOrParam(a, 'x', 0, 0);
    const d = inputOrParam(a, 'd', 0, 1);
    const lr = inputOrParam(a, 'lr', numericParam(params, 'lr', 0.05), 2);
    const w1 = state[0];
    const w2 = state[1];
    const x_prev = state[2];

    const y = w1 * x + w2 * x_prev;
    const err = d - y;

    return [
      branch[0] - y,
      branch[1] - err,
      branch[2] - w1,
      branch[3] - w2,
      dState[0] - lr * err * x,
      dState[1] - lr * err * x_prev,
      dState[2] - (x - x_prev) / 0.01
    ];
  },

  neural_neuron_learning: ({ across, branch, state, dState, params, ports, connectedPorts }) => {
    const a = { across, ports, connectedPorts };
    const x1 = inputOrParam(a, 'x1', 0, 0);
    const x2 = inputOrParam(a, 'x2', 0, 1);
    const target = inputOrParam(a, 'target', 0, 2);
    const lr = inputOrParam(a, 'lr', numericParam(params, 'lr', 0.1), 3);

    const w1 = state[0];
    const w2 = state[1];
    const bias = state[2];

    const net = w1 * x1 + w2 * x2 + bias;
    const y = Math.tanh(net);
    const err = target - y;
    const f_prime = 1 - y * y;

    return [
      branch[0] - y,
      branch[1] - err,
      branch[2] - w1,
      branch[3] - w2,
      branch[4] - bias,
      dState[0] - lr * err * f_prime * x1,
      dState[1] - lr * err * f_prime * x2,
      dState[2] - lr * err * f_prime
    ];
  },

  rl_q_learning_controller: ({ across, branch, params, ctx, nodeId }) => {
    const error = across[0] !== undefined ? across[0] : 0;
    const reward = across[1] !== undefined ? across[1] : 0;
    const reset = across[2] !== undefined ? !!across[2] : false;

    const alpha = numericParam(params, 'alpha', 0.1);
    const gamma = numericParam(params, 'gamma', 0.9);
    const epsilon = numericParam(params, 'epsilon', 0.1);
    const nS = Math.max(1, Math.round(numericParam(params, 'numStates', 5)));
    const nA = Math.max(1, Math.round(numericParam(params, 'numActions', 3)));

    const actions: number[] = [];
    if (nA === 1) {
      actions.push(0.0);
    } else {
      for (let i = 0; i < nA; i++) {
        actions.push(-1.0 + (2.0 * i) / (nA - 1));
      }
    }

    let cached = rlStateCache.get(nodeId);
    if (!cached || cached.qTable.length !== nS || cached.qTable[0]?.length !== nA || ctx.time < 1e-5 || reset) {
      cached = {
        qTable: Array.from({ length: nS }, () => Array(nA).fill(0)),
        lastStateIdx: Math.floor(nS / 2),
        lastActionIdx: Math.floor(nA / 2),
        hasPrev: 0,
        lastUpdateTime: -1.0,
        currentAction: actions[Math.floor(nA / 2)] ?? 0,
        currentMaxQ: 0.0
      };
      rlStateCache.set(nodeId, cached);
    }

    const Ts = 0.05;
    if (ctx.time - cached.lastUpdateTime >= Ts - 1e-12) {
      let s = Math.floor(nS / 2);
      if (nS === 5) {
        if (error < -1.0) s = 0;
        else if (error < -0.1) s = 1;
        else if (error > 1.0) s = 4;
        else if (error > 0.1) s = 3;
        else s = 2;
      } else {
        const range = 3.0;
        const normalized = (error + 1.5) / range;
        s = Math.max(0, Math.min(nS - 1, Math.floor(normalized * nS)));
      }

      if (cached.hasPrev === 1 && !reset) {
        const maxQNext = Math.max(...(cached.qTable[s] ?? [0]));
        const targetQ = reward + gamma * maxQNext;
        const currentQ = cached.qTable[cached.lastStateIdx]?.[cached.lastActionIdx] ?? 0;
        if (cached.qTable[cached.lastStateIdx]) {
          cached.qTable[cached.lastStateIdx][cached.lastActionIdx] = currentQ + alpha * (targetQ - currentQ);
        }
      }

      let aIdx = Math.floor(nA / 2);
      const pseudoRand = Math.abs(Math.sin((ctx.time + 0.001) * 12345.67 + s * 987.65)) % 1;
      if (pseudoRand < epsilon) {
        aIdx = Math.floor(pseudoRand * nA) % nA;
      } else {
        let maxVal = cached.qTable[s]?.[0] ?? 0;
        aIdx = 0;
        for (let i = 1; i < nA; i++) {
          if ((cached.qTable[s]?.[i] ?? 0) > maxVal) {
            maxVal = cached.qTable[s][i];
            aIdx = i;
          }
        }
      }

      cached.currentAction = actions[aIdx] ?? 0;
      cached.currentMaxQ = Math.max(...(cached.qTable[s] ?? [0]));
      cached.lastStateIdx = s;
      cached.lastActionIdx = aIdx;
      cached.hasPrev = 1;
      cached.lastUpdateTime = ctx.time;
    }

    return [
      branch[0] - cached.currentAction,
      branch[1] - cached.currentMaxQ
    ];
  },

  ac_motor_pid_control: ({ across, branch, state, dState, params, ctx, ports, connectedPorts }) => {
    const w_ref = inputOrParam({ across, ports, connectedPorts }, 'w_ref', numericParam(params, 'w_ref', 157), 0);
    const tl = inputOrParam({ across, ports, connectedPorts }, 'tl', numericParam(params, 'tl', 0), 1);

    const ias = state[0];
    const ibs = state[1];
    const psiar = state[2];
    const psibr = state[3];
    const omega = state[4];
    const theta = state[5];
    const i_state = state[6];
    const d_state = state[7];

    const Rs = numericParam(params, 'Rs', 0.5);
    const Ls = numericParam(params, 'Ls', 0.1);
    const Rr = numericParam(params, 'Rr', 0.4);
    const Lr = numericParam(params, 'Lr', 0.1);
    const Lm = numericParam(params, 'Lm', 0.09);
    const P = numericParam(params, 'P', 2);
    const J = numericParam(params, 'J', 0.01);
    const B = numericParam(params, 'B', 0.001);

    const Kp = numericParam(params, 'Kp', 2.5);
    const Ki = numericParam(params, 'Ki', 1.2);
    const Kd = numericParam(params, 'Kd', 0.1);
    const N = numericParam(params, 'N', 100);

    const error = w_ref - omega;

    // 1. PID Logic
    const integral = i_state;
    const deriv = Kd * N * (error - d_state);
    const v_mag = Math.max(0, Kp * error + integral + deriv);

    // 2. Stator Voltage Generation
    const theta_v = w_ref * ctx.time;
    const va = v_mag * Math.sin(theta_v);
    const vb = v_mag * Math.sin(theta_v - 2 * Math.PI / 3);
    const vc = v_mag * Math.sin(theta_v + 2 * Math.PI / 3);

    const vAlpha = (2 * va - vb - vc) / 3;
    const vBeta = (vb - vc) / Math.sqrt(3);

    // 3. Induction Motor Equations
    const sigma = 1 - (Lm * Lm) / (Ls * Lr);
    const kr = Lm / Lr;
    const tr = Lr / Rr;

    const dias = (vAlpha - (Rs + kr * kr * Rr) / sigma * ias + (kr / (sigma * tr)) * psiar + (kr * P * omega / sigma) * psibr) / (sigma * Ls);
    const dibs = (vBeta - (Rs + kr * kr * Rr) / sigma * ibs + (kr / (sigma * tr)) * psibr - (kr * P * omega / sigma) * psiar) / (sigma * Ls);
    const dpsiar = (Lm / tr) * ias - (1 / tr) * psiar - P * omega * psibr;
    const dpsibr = (Lm / tr) * ibs - (1 / tr) * psibr + P * omega * psiar;

    const Te = 1.5 * P * kr * (psiar * ibs - psibr * ias);
    const domega = (Te - tl - B * omega) / J;
    const dtheta = omega;

    // 4. PID State Derivatives
    const di_state = Ki * error;
    const dd_state = N * (error - d_state);

    return [
      branch[0] - omega,
      branch[1] - error,
      branch[2] - Te,
      dState[0] - dias,
      dState[1] - dibs,
      dState[2] - dpsiar,
      dState[3] - dpsibr,
      dState[4] - domega,
      dState[5] - dtheta,
      dState[6] - di_state,
      dState[7] - dd_state
    ];
  },

  // ── GAS DOMAIN ─────────────────────────────────────────────────────────────
  gas_ref: () => [],
  gas_cap: ({ branch }) => [branch[0]],
  gas_chamber: ({ across, dAcross, branch, dState, state, params }) => {
    const V = numericParam(params, 'V', 0.01);
    const R = 287;
    const T = numericParam(params, 'T', 293.15);
    const P = state[0];
    const dP = dState[0];
    const mdot_a = branch[0];
    const mdot_b = branch[1];
    return [
      across[0] - P,
      across[1] - P,
      dP - (R * T / V) * (mdot_a + mdot_b)
    ];
  },
  gas_reservoir: ({ across, branch, params, ports, connectedPorts }) => {
    const P_ctrl = inputOrParam({ across, ports, connectedPorts }, 's', numericParam(params, 'P', 101325), 1);
    return [across[0] - P_ctrl];
  },
  gas_resistance: ({ across, branch, params }) => {
    const k = numericParam(params, 'k', 1e-5);
    return [branch[0] - k * (across[0] - across[1])];
  },
  gas_restriction: ({ across, branch, params, ports, connectedPorts }) => {
    const Cd = numericParam(params, 'Cd', 0.62);
    const A = inputOrParam({ across, ports, connectedPorts }, 'ar', numericParam(params, 'area', 1e-4), 2);
    const T = numericParam(params, 'T', 293.15);
    const k = Cd * A / Math.sqrt(T);
    return [branch[0] - k * (across[0] - across[1])];
  },
  gas_pipe: ({ across, branch, params }) => {
    const L = numericParam(params, 'L', 1);
    const D = numericParam(params, 'D', 0.05);
    const f = numericParam(params, 'f', 0.02);
    const R_f = (f * L / D) * 10;
    return [(across[0] - across[1]) - R_f * branch[0]];
  },
  gas_fixed_res: ({ across, params }) => {
    const P = numericParam(params, 'P', 101325);
    return [across[0] - P];
  },
  gas_rotational_conv: ({ across, branch, params }) => {
    const D = numericParam(params, 'D', 0.01);
    const R = 287;
    const T = numericParam(params, 'T', 293.15);
    const P_a = across[0];
    const P_h = across[1];
    const omega = across[2] - across[3];
    const mdot = branch[0];
    const torque = branch[1];
    const deltaP = P_a - P_h;
    // Ideal displacement machine: volumetric flow at A is V' = D*w (mdot = rho_A*V'), shaft torque delivered = D*(P_A - P_H).
    // branch[1] is the torque INTO the block at R, so the delivered torque is -branch[1]:
    //   P_shaft_in + P_gas_in = branch[1]*w + (P_A - P_H)*V' = w*(branch[1] + D*(P_A - P_H)) = 0.
    return [
      mdot - (P_a * D / (R * T)) * omega,
      torque + D * deltaP
    ];
  },
  gas_translational_conv: ({ across, branch, params }) => {
    const A = numericParam(params, 'A', 0.001);
    const R = 287;
    const T = numericParam(params, 'T', 293.15);
    const P_a = across[0];
    const P_h = across[1];
    const v = across[2] - across[3];
    const mdot = branch[0];
    const force = branch[1];
    const deltaP = P_a - P_h;
    // Ideal double-acting cylinder: V' = A*v at A, force delivered = A*(P_A - P_H); branch[1] is the force INTO the block at R:
    //   branch[1]*v + (P_A - P_H)*A*v = 0.
    return [
      mdot - (P_a * A / (R * T)) * v,
      force + A * deltaP
    ];
  },
  gas_flow_source: ({ across, branch, params, ports, connectedPorts }) => {
    const mdot = inputOrParam({ across, ports, connectedPorts }, 'm', numericParam(params, 'mdot', 0.1), 2);
    return [branch[0] - mdot];
  },
  gas_pressure_source: ({ across, branch, params, ports, connectedPorts }) => {
    // Pb - Pa = P_source (commanded via the `p` port when wired, else the P parameter)
    const P = inputOrParam({ across, ports, connectedPorts }, 'p', numericParam(params, 'P', 200000), 2);
    return [(across[1] - across[0]) - P];
  },
  gas_pressure_sensor: ({ across, branch }) => [branch[0], branch[1] - across[0]],
  gas_flow_sensor: ({ across, branch }) => [across[0] - across[1], branch[1] + branch[0]],

  // ── MAGNETIC DOMAIN ────────────────────────────────────────────────────────
  mag_ref: () => [],
  reluctance: ({ across, branch, params }) => {
    const R = numericParam(params, 'R', 1e6);
    return [(across[0] - across[1]) - branch[0] * R];
  },
  fundamental_reluctance: ({ across, branch, params }) => {
    const R = numericParam(params, 'R', 1e6);
    return [(across[0] - across[1]) - branch[0] * R];
  },
  variable_reluctance: ({ across, branch, params, ports, connectedPorts }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const ctrlVal = inputOrParam({ across, ports, connectedPorts }, 'ctrl', 1e6, 2);
    const Rmin = numericParam(params, 'Rmin', 1e5);
    const R_ctrl = Math.max(Rmin, Number(ctrlVal));
    return [(Vn - Vs) - branch[0] * R_ctrl];
  },
  permanent_magnet: ({ across, branch, params, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const Hc = numericParam(params, 'Hc', 1000);
    const Lm = numericParam(params, 'Lm', 0.05);
    const Rm = numericParam(params, 'Rm', 0);
    const phi = branch[0] ?? 0;
    const mmf_pm = Hc * Lm - phi * Rm;
    return [(Vn - Vs) - mmf_pm];
  },
  em_converter: ({ across, dAcross, branch, dBranch, params }) => {
    const N = numericParam(params, 'N', 100);
    const V = across[0] - across[1];
    const mmf = across[2] - across[3];
    const I = branch[0];
    const dPhi = dBranch[1];
    // MMF = N*I (MMF rise from S to N) and V = N dPhi_ext/dt, where phi_ext is the flux that leaves port N into the
    // external circuit. branch[1] is the flux INTO the block at N (= -phi_ext), so V = -N dbranch[1]/dt. A reluctance R
    // across N-S then gives phi_ext = N I/R and V = (N^2/R) dI/dt: a positive inductance L = N^2/R, and the electrical
    // power V*I equals the stored-energy rate mmf * dphi_ext/dt (lossless).
    return [
      V + N * dPhi,
      mmf - N * I
    ];
  },
  reluctance_force: ({ across, branch, params, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const rIdx = ports ? ports.indexOf('r') : 2;
    const cIdx = ports ? ports.indexOf('c') : 3;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const xr = (rIdx !== -1 && across[rIdx] !== undefined) ? across[rIdx] : (across[2] ?? 0);
    const xc = (cIdx !== -1 && across[cIdx] !== undefined) ? across[cIdx] : (across[3] ?? 0);

    const R0 = numericParam(params, 'R0', 1e6);
    const K = numericParam(params, 'K', 1e7);
    const x = xr - xc;
    const R = R0 + K * Math.max(0, x);
    const dRdx = K;
    const phi = branch[0] ?? 0;
    const force = branch[1] ?? 0;
    return [
      (Vn - Vs) - phi * R,
      force - 0.5 * phi * phi * dRdx
    ];
  },
  mag_flux_sensor: ({ across, branch, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const fluxThru = branch[0] ?? 0;
    const sigPhi = branch[1] !== undefined ? branch[1] : fluxThru;
    return [
      Vn - Vs,
      sigPhi - fluxThru
    ];
  },
  mag_mmf_sensor: ({ across, branch, ports }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const sigF = branch[1] !== undefined ? branch[1] : (Vn - Vs);
    return [
      Vn - Vs,
      sigF - (Vn - Vs)
    ];
  },
  mag_mmf_source: ({ across, params }) => {
    const MMF = numericParam(params, 'MMF', 10);
    return [(across[0] - across[1]) - MMF];
  },
  mag_flux_source: ({ branch, params }) => {
    const phi = numericParam(params, 'phi', 0.001);
    return [branch[0] - phi];
  },
  mag_controlled_mmf: ({ across, params, ports, connectedPorts }) => {
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const S = inputOrParam({ across, ports, connectedPorts }, ['src', 's_in'], numericParam(params, 'MMF', 0), 2);
    return [(Vn - Vs) - S];
  },

  // ── ADVANCED CONTROL & OBSERVERS ───────────────────────────────────────────
  luenberger_observer: ({ across, branch, state, dState, params }) => {
    const A = -1;
    // Scalar observer gain: the first element of the gain list ("[10; 10]" -> 10).
    const L = vectorParam(params, 'L', [10])[0];
    const u = across[0] || 0;
    const y = across[1] || 0;
    const xhat = state[0];
    const dxhat = dState[0];
    return [
      branch[0] - xhat,
      dxhat - (A * xhat + u + L * (y - xhat))
    ];
  },
  im_flux_observer: ({ across, branch, state, dState, params }) => {
    const Rs = numericParam(params, 'Rs', 0.1);
    const Lm = numericParam(params, 'Lm', 0.05);
    const Lr = numericParam(params, 'Lr', 0.06);
    const Rr = numericParam(params, 'Rr', 0.08);
    const Tr = Lr / Rr;
    const is = across[0] || 0;
    const wr = across[1] || 0;
    const psi_d = state[0];
    const psi_q = state[1];
    const dPsi_d = dState[0];
    const dPsi_q = dState[1];
    return [
      branch[0] - psi_d,
      branch[1] - (psi_d / Math.max(0.01, Lm)),
      dPsi_d - ((Lm / Tr) * is - (1 / Tr) * psi_d - wr * psi_q),
      dPsi_q - (- (1 / Tr) * psi_q + wr * psi_d)
    ];
  },
  pmsm_foc: ({ across, branch, state, dState, params }) => {
    const Kp = numericParam(params, 'Kp', 5.0);
    const Ki = numericParam(params, 'Ki', 100.0);
    const ref_speed = across[0] || 0;
    const iabc = across[1] || 0;
    const w = across[2] || 0;
    const theta = across[3] || 0;
    const id = iabc * Math.cos(theta);
    const iq = iabc * Math.sin(theta);
    const id_ref = 0;
    const iq_ref = Math.max(-50, Math.min(50, (ref_speed - w) * 2.0));
    const err_d = id_ref - id;
    const err_q = iq_ref - iq;
    const vd = Kp * err_d + state[0];
    const vq = Kp * err_q + state[1];
    const va = vd * Math.cos(theta) - vq * Math.sin(theta);
    return [
      branch[0] - va,
      branch[1] - w,
      dState[0] - Ki * err_d,
      dState[1] - Ki * err_q
    ];
  },
  clarke_transform: (args) => {
    // Abc -> alpha-beta-zero (Simscape "Clarke Transform"; Clarke 1943, amplitude-invariant form):
    //   alpha = (2/3)(a - b/2 - c/2),  beta = (b - c)/sqrt(3),  zero = (a + b + c)/3
    // 'Power Preserved' scales by sqrt(3/2) (orthogonal matrix, P_abc = P_alpha-beta-0): sqrt(2/3)(a - b/2 - c/2), (b - c)/sqrt(2), (a+b+c)/sqrt(3).
    const [a, b, c] = vectorInput(args, 'abc', 3);
    const [alpha, beta, zero] = clarkeForward([a, b, c], clarkeConvention(args.params));
    return [args.branch[0] - alpha, args.branch[1] - beta, args.branch[2] - zero];
  },

  // ── MULTIBODY JOINTS & CONSTRAINTS ─────────────────────────────────────────
  world_frame: () => [],
  ref_frame: () => [],
  rigid_transform: ({ across, branch, params }) => {
    const B = Array.isArray(across[0]) ? across[0] : [across[0] || 0, 0, 0, 0, 0, 0];
    const F = Array.isArray(across[1]) ? across[1] : [across[1] || 0, 0, 0, 0, 0, 0];

    const offset = parseVector3(params?.offset, [0, 0, 0]);
    const rotDeg = parseVector3(params?.rotation, [0, 0, 0]);
    const rotRad = [rotDeg[0] * Math.PI / 180, rotDeg[1] * Math.PI / 180, rotDeg[2] * Math.PI / 180];

    const R_b = eulerToRotationMatrix(B[3], B[4], B[5]);
    const P_rel = transformPoint(R_b, offset);
    const P_exp = [B[0] + P_rel[0], B[1] + P_rel[1], B[2] + P_rel[2]];
    const R_exp = [B[3] + rotRad[0], B[4] + rotRad[1], B[5] + rotRad[2]];

    return [
      F[0] - P_exp[0],
      F[1] - P_exp[1],
      F[2] - P_exp[2],
      F[3] - R_exp[0],
      F[4] - R_exp[1],
      F[5] - R_exp[2],
    ];
  },
  transform_sensor: ({ across, branch }) => {
    const B = Array.isArray(across[0]) ? across[0] : [across[0] || 0, 0, 0, 0, 0, 0];
    const F = Array.isArray(across[1]) ? across[1] : [across[1] || 0, 0, 0, 0, 0, 0];

    const dx = F[0] - B[0];
    const dy = F[1] - B[1];
    const dz = F[2] - B[2];
    // SI: the Euler-angle differences are published in rad (F-053; they were degrees before WP-19a)
    const drx = F[3] - B[3];
    const dry = F[4] - B[4];
    const drz = F[5] - B[5];

    return [
      (branch[0] || 0) - dx,
      (branch[1] || 0) - dy,
      (branch[2] || 0) - dz,
      (branch[3] || 0) - drx,
      (branch[4] || 0) - dry,
      (branch[5] || 0) - drz,
    ];
  },
  // Branch layout: [lambda, fx, fy, fz, signal_d?, signal_f?]. lambda is an
  // internal scalar multiplier (no Kirchhoff port); fx/fy/fz carry the
  // reaction force applied on F (and, with opposite sign, on B) along the
  // B->F direction, so the per-coordinate Frame equilibrium equations
  // determine lambda from the attached load, exactly like a Lagrange
  // multiplier for |P_f - P_b| = L.
  dist_constraint: ({ across, branch, params, ports }) => {
    const bIdx = ports.indexOf('b');
    const fIdx = ports.indexOf('f');
    const B = asFrame(across[bIdx]);
    const F = asFrame(across[fIdx]);

    const targetDist = numericParam(params, 'dist', 1.0);
    const direction = normalizeVector3([F[0] - B[0], F[1] - B[1], F[2] - B[2]]);
    const lambda = branch[0] || 0;

    // When B and F exactly coincide there is no direction to carry a
    // reaction. Falling back to a fixed, deterministic axis (rather than
    // branching to a different equation, or throwing) keeps this equation
    // continuous through the degenerate point: every Newton iterate of every
    // simulation starts all-new frame variables at exactly 0, so any model
    // with a nonzero target is transiently exactly here on its very first
    // residual evaluation, even when well-posed. The fallback gives Newton a
    // concrete, finite gradient to follow — pushing the frames apart along
    // this axis — and the moment they separate, the real direction (now
    // well-defined) takes over on the next evaluation. (The one case this
    // genuinely cannot resolve — both ports wired to the literal same frame
    // with a nonzero target, which stays coincident at every possible
    // position — is rejected statically in DAEAssembler before solving.)
    const n = direction.defined ? direction.unit : [0, 0, 1];
    const actualDist = direction.defined ? direction.magnitude : 0;

    const res = [actualDist - targetDist];
    res.push((branch[1] || 0) - lambda * n[0]);
    res.push((branch[2] || 0) - lambda * n[1]);
    res.push((branch[3] || 0) - lambda * n[2]);

    let next = 4;
    if (ports.includes('d')) res.push((branch[next++] || 0) - actualDist);
    if (ports.includes('f_reac')) res.push((branch[next++] || 0) - Math.abs(lambda));
    return res;
  },
  // Branch layout: [lambda, tx, ty, tz, signal_ang?, signal_t?], mirroring
  // dist_constraint but along the relative rotation axis of Rrel = Rb^T*Rf.
  angle_constraint: ({ across, branch, params, ports }) => {
    const bIdx = ports.indexOf('b');
    const fIdx = ports.indexOf('f');
    const B = asFrame(across[bIdx]);
    const F = asFrame(across[fIdx]);

    const angleDeg = numericParam(params, 'angle', 0.0);
    const targetAngleRad = angleDeg * Math.PI / 180;
    const relative = computeRelativeAngleAxis([B[3], B[4], B[5]], [F[3], F[4], F[5]]);
    const lambda = branch[0] || 0;

    // See dist_constraint for why this uses a fixed fallback axis rather
    // than branching/throwing when the two orientations exactly coincide.
    const axis = relative.axisDefined ? relative.axis : [0, 0, 1];
    const actualAngle = relative.axisDefined ? relative.angle : 0;

    const res = [actualAngle - targetAngleRad];
    res.push((branch[1] || 0) - lambda * axis[0]);
    res.push((branch[2] || 0) - lambda * axis[1]);
    res.push((branch[3] || 0) - lambda * axis[2]);

    let next = 4;
    // SI: the measured angle is published in rad (F-053); only the `angle` parameter stays in degrees
    if (ports.includes('ang')) res.push((branch[next++] || 0) - actualAngle);
    if (ports.includes('t_reac')) res.push((branch[next++] || 0) - Math.abs(lambda));
    return res;
  },
  // ── multibody joints: one shared implementation (vlabJointCore.ts, WP-19a) ──
  spherical_joint: (a) => jointResiduals('spherical', { ...a, dt: a.ctx?.dt }),
  universal_joint: (a) => jointResiduals('universal', { ...a, dt: a.ctx?.dt }),
  revolute_joint: (a) => jointResiduals('revolute', { ...a, dt: a.ctx?.dt }),
  prismatic_joint: (a) => jointResiduals('prismatic', { ...a, dt: a.ctx?.dt }),
  weld_joint: (a) => jointResiduals('weld', { ...a, dt: a.ctx?.dt }),
  common_gear: ({ across, branch, params }) => {
    const ratio = numericParam(params, 'ratio', 2);
    return [
      across[1] - ratio * across[0],
      branch[0] + ratio * branch[1]
    ];
  },
  rack_pinion: ({ across, branch, params }) => {
    const R = numericParam(params, 'radius', 0.1);
    return [
      across[1] - R * across[0],
      branch[0] + R * branch[1]
    ];
  },
  // Force elements: branch[0..5] is the wrench [Fx Fy Fz Tx Ty Tz] applied on
  // frame F (the reaction acts on B); trailing branches are measurement signals.
  grav_field: ({ branch, params, ports }) => {
    const g = numericParam(params, 'g', 9.81);
    const m = numericParam(params, 'mass', 1);
    const dir = parseVector3(params?.direction, [0, 0, -1]);
    const dirNorm = Math.hypot(dir[0], dir[1], dir[2]);
    const unit = dirNorm > 0 ? dir.map(c => c / dirNorm) : [0, 0, 0];
    const F = unit.map(c => m * g * c);
    const res = wrenchResiduals(branch, F, [0, 0, 0]);
    if (ports.includes('fm')) res.push((branch[6] || 0) - Math.hypot(F[0], F[1], F[2]));
    return res;
  },
  spring_damper_force: ({ across, dAcross, branch, params, ports }) => {
    const k = numericParam(params, 'k', 1000);
    const b = numericParam(params, 'b', 10);
    const x0 = numericParam(params, 'x0', 0);
    const bIdx = ports.indexOf('b');
    const fIdx = ports.indexOf('f');
    const B = asFrame(across[bIdx]);
    const Fr = asFrame(across[fIdx]);
    const vB = asFrame(dAcross[bIdx]);
    const vF = asFrame(dAcross[fIdx]);

    const d = [Fr[0] - B[0], Fr[1] - B[1], Fr[2] - B[2]];
    const dv = [vF[0] - vB[0], vF[1] - vB[1], vF[2] - vB[2]];
    const L = Math.hypot(d[0], d[1], d[2]);
    const n = L > 1e-12 ? d.map(c => c / L) : [0, 0, 0];
    const vRel = dv[0] * n[0] + dv[1] * n[1] + dv[2] * n[2];
    // F = k(x - x0) + b(v1 - v2): positive in tension, pulls F back toward B.
    const Fmag = k * (L - x0) + b * vRel;
    const res = wrenchResiduals(branch, n.map(c => -Fmag * c), [0, 0, 0]);
    let next = 6;
    if (ports.includes('x')) res.push((branch[next++] || 0) - L);
    if (ports.includes('v')) res.push((branch[next++] || 0) - vRel);
    if (ports.includes('fm')) res.push((branch[next++] || 0) - Fmag);
    return res;
  },
  external_force: ({ across, branch, params, ports }) => {
    const forceScale = numericParam(params, 'force_scale', 1);
    const torqueScale = numericParam(params, 'torque_scale', 1);
    const input = (id: string) => {
      const idx = ports.indexOf(id);
      return idx >= 0 ? Number(across[idx]) || 0 : 0;
    };
    const F = ['in_fx', 'in_fy', 'in_fz'].map(id => forceScale * input(id));
    const T = ['in_tx', 'in_ty', 'in_tz'].map(id => torqueScale * input(id));
    const res = wrenchResiduals(branch, F, T);
    let next = 6;
    if (ports.includes('fm')) res.push((branch[next++] || 0) - Math.hypot(F[0], F[1], F[2]));
    if (ports.includes('tm')) res.push((branch[next++] || 0) - Math.hypot(T[0], T[1], T[2]));
    return res;
  },

  // ── MISCELLANEOUS & SINKS & SOURCES ────────────────────────────────────────
  ps_delay: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  ps_sum: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  ps_min: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  ps_max: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  ps_rms: ({ across, branch }) => [branch[0] - Math.abs(across[0] || 0)],
  ps_terminator: () => [],
  heat_flow_sensor: ({ across, branch }) => [
    across[0] - across[1],
    branch[1] - branch[0]
  ],

  // ── FLUID / PNEUMATIC DOMAIN ────────────────────────────────────────────────
  fluid_ref: () => [],

  fluid_resistance: ({ across, branch, params }) => {
    const Rf = numericParam(params, 'Rf', 1e5);
    return [(across[0] - across[1]) - branch[0] * Rf];
  },

  orifice: ({ across, branch, params }) => {
    const Cd = numericParam(params, 'Cd', 0.6);
    const A = numericParam(params, 'A', 1e-4);
    const rho = numericParam(params, 'rho', 1.2);
    const dP = across[0] - across[1];
    const mdot = Cd * A * Math.sqrt(2 * rho * Math.abs(dP)) * Math.sign(dP);
    return [branch[0] - mdot];
  },

  fluid_capacitance: ({ across, dAcross, branch, params }) => {
    const Cf = numericParam(params, 'Cf', 1e-5);
    return [branch[0] - Cf * dAcross[0]];
  },

  fluid_inertance: ({ across, branch, dBranch, params }) => {
    const Li = numericParam(params, 'Li', 100);
    return [(across[0] - across[1]) - Li * dBranch[0]];
  },

  pressure_source: ({ across, branch, params }) => {
    const P = numericParam(params, 'P', 101325);
    return [across[0] - P];
  },

  ctrl_pressure_source: ({ across, ports, connectedPorts }) => {
    const P = inputOrParam({ across, ports, connectedPorts }, 'ctrl', 101325);
    return [across[0] - P];
  },

  mass_flow_source: ({ branch, params }) => {
    const mdot = numericParam(params, 'mdot', 0.01);
    return [branch[0] - mdot];
  },

  check_valve: ({ across, branch, params }) => {
    const Rf = numericParam(params, 'Rf', 1e3);
    const dP = across[0] - across[1];
    const g = 0.5 * (1 + Math.tanh(dP * 1000));
    return [branch[0] - g * dP / Rf];
  },

  relief_valve: ({ across, branch, params }) => {
    const P_set = numericParam(params, 'P_set', 5e5);
    const Rf_open = numericParam(params, 'Rf_open', 1e2);
    const Rf_closed = numericParam(params, 'Rf_closed', 1e10);
    const dP = across[0] - across[1];
    const open = 0.5 * (1 + Math.tanh((across[0] - P_set) * 1e-4));
    const R = Rf_open * open + Rf_closed * (1 - open);
    return [dP - branch[0] * R];
  },

  steam_generator_fluid: ({ across, branch, params, ports, connectedPorts }) => {
    const P = across[0];
    const T_sat = 100 + (P - 101325) / 3600;
    const h_fg = (2257 - 2.175 * Math.max(0, T_sat - 100)) * 1000;
    const Q_in = inputOrParam({ across, ports, connectedPorts }, 'q_in', numericParam(params, 'Q', 1000), 2);
    const mdot_steam = Math.max(0, Q_in / h_fg);
    return [branch[0] - mdot_steam];
  },

  steam_accumulator: ({ across, dAcross, branch, params }) => {
    const V = numericParam(params, 'V', 0.5);
    const P = across[0];
    const rho_steam = 0.6 + (P - 101325) * 4e-6;
    const Cf = V * 1e-3 * rho_steam / 1e5;
    return [
      across[0] - across[1],
      branch[0] - branch[1] - Cf * dAcross[0]
    ];
  },

  steam_nozzle: ({ across, branch, params }) => {
    const Cd = numericParam(params, 'Cd', 0.5);
    const d = numericParam(params, 'd', 0.5e-3);
    const A = Math.PI * d * d / 4;
    const P_upstream = across[0];
    const P_downstream = across[1];
    const rho = 0.6;
    const dP = Math.max(0, P_upstream - P_downstream);
    const mdot = Cd * A * Math.sqrt(2 * rho * dP);
    return [branch[0] - mdot];
  },

  pressure_sensor: ({ across, branch }) => {
    // An ideal pressure sensor has zero hydraulic flow and exposes the
    // measured pressure through its physical signal output branch.
    return [branch[0], branch[1] - across[0]];
  },

  flow_sensor: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[1] - branch[0]
    ];
  },

  // ── ISOTHERMAL LIQUID DOMAIN ───────────────────────────────────────────────
  hydraulic_reference_il: () => [],
  reservoir_il: () => [],

  pump_il: ({ across, branch, params }) => {
    const dp = numericParam(params, 'pressure_rise', 200000);
    return [(across[1] - across[0]) - dp];
  },

  pipe_il: ({ across, branch, params }) => {
    const R = numericParam(params, 'R', 100000);
    return [(across[0] - across[1]) - branch[0] * R];
  },

  restriction_il: ({ across, branch, params }) => {
    const Cd = numericParam(params, 'Cd', 0.6);
    const A = numericParam(params, 'area', 1e-4);
    const rho = numericParam(params, 'rho', 1000);
    const dp = across[0] - across[1];
    const mdot = Cd * A * Math.sqrt(2 * rho * Math.max(1e-9, Math.abs(dp))) * Math.sign(dp);
    return [branch[0] - mdot];
  },

  // ── SIMULATION & UTILITIES ──────────────────────────────────────────────────
  scope: () => [],
  solver_config: () => [],
  // Mechanism Configuration (F-032): a Frame connection that records the mechanism's uniform gravity vector. It owns no
  // branch and no constraint (zero rows); the vector is validated here so a malformed value is a diagnostic, never ignored.
  mech_config: ({ params }) => {
    parseVector3(params?.gravity, [0, 0, -9.81], 'gravity');
    return [];
  },
  ps_simulink_conv: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  simulink_ps_conv: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  vlab_probe: ({ across, branch }) => [branch[0] - (across[0] || 0)],
  // A net label only names the net its single port is wired to: it has no through variable, hence no residual.
  conn_label: () => [],
  doe_custom: ({ across, branch, params, nodeId, ctx, ports }) => {
    let deployment: any = unwrapParam(params?.deploymentModel);
    if (typeof deployment === 'string') {
      try {
        deployment = JSON.parse(deployment);
      } catch {
        deployment = null;
      }
    }

    let y = NaN;
    if (deployment && deployment.schemaVersion === 1) {
      const res = evaluateDOEModelDetailed(deployment, across);
      if (!res.success) {
        if (params) params._runtimeDiagnostic = res.diagnostic;
        if (ctx?.parameters && nodeId) ctx.parameters[`${nodeId}_fault`] = res.diagnostic;
        y = NaN;
      } else {
        if (params) params._runtimeDiagnostic = null;
        y = res.value;
      }
    } else {
      const eq = stringParam(params, 'equation', '');
      if (eq) {
        const factorNames = across.map((_, i) => `X${i + 1}`);
        const res = evaluateLegacyDOEEquationDetailed(eq, factorNames, across);
        if (!res.success) {
          if (params) params._runtimeDiagnostic = res.diagnostic;
          if (ctx?.parameters && nodeId) ctx.parameters[`${nodeId}_fault`] = res.diagnostic;
          y = NaN;
        } else {
          if (params) params._runtimeDiagnostic = null;
          y = res.value;
        }
      } else {
        const diag = {
          code: 'MISSING_MODEL_PAYLOAD',
          severity: 'error' as const,
          message: 'doe_custom block has no deployment model or equation configured.'
        };
        if (params) params._runtimeDiagnostic = diag;
        if (ctx?.parameters && nodeId) ctx.parameters[`${nodeId}_fault`] = diag;
        y = NaN;
      }
    }
    // The response drives the instance's declared output port `out` (engine/doe/integration.ts); an instance without
    // one (the bare library block has no ports) has nothing to drive and therefore no residual row.
    return ports.includes('out') ? [branch[0] - y] : [];
  },

  ps_demux_3: (args) => {
    // Demux of a width-3 vector: y_k = u[k], by port id (WP-09c).
    const u = vectorInput(args, 'in', 3);
    return [args.branch[0] - u[0], args.branch[1] - u[1], args.branch[2] - u[2]];
  },

  // ── MATH & SIGNAL PROCESSING ────────────────────────────────────────────────
  ps_lookup_2d: ({ across, branch }) => {
    const x = across[0] || 0;
    const y = across[1] || 0;
    return [branch[0] - x * y];
  },

  ps_integrator_gen: ({ across, branch, state, dState }) => {
    return [
      dState[0] - (across[0] || 0),
      branch[0] - state[0]
    ];
  },

  ps_moving_avg: ({ across, branch, state, dState, params }) => {
    const T = MOVING_AVG_TAU;
    return [
      dState[0] - ((across[0] || 0) - state[0]) / T,
      branch[0] - state[0]
    ];
  },

  ps_sr_flipflop: ({ across, branch, state, dState }) => {
    const S = across[0] || 0;
    const R = across[1] || 0;
    const Q = state[0] || 0;
    return [
      dState[0] - (S * (1 - Q) - R * Q),
      branch[0] - Q,
      branch[1] - (1 - Q)
    ];
  },

  ps_sample_hold: ({ across, branch, state, dState }) => {
    const u = across[0] || 0;
    const trig = across[1] || 0;
    const holdVal = state[0] || 0;
    const dHold = trig > 0.5 ? (u - holdVal) * 1e3 : 0.0;
    return [
      dState[0] - dHold,
      branch[0] - holdVal
    ];
  },

  ps_smith_predictor: ({ across, branch, state, dState, params }) => {
    const T = numericParam(params, 'tau', 0.1);
    return [
      dState[0] - ((across[0] || 0) - state[0]) / T,
      branch[0] - state[0]
    ];
  },

  ps_sine_3phase: ({ branch, params, ctx }) => {
    // Balanced positive-sequence set (Simscape "Sine Generator" convention, phase a reference):
    //   a = Vpk sin(wt), b = Vpk sin(wt - 2pi/3), c = Vpk sin(wt + 2pi/3), and `wt` the instantaneous angle wt = 2*pi*f*t.
    // `abc` is one width-3 vector output (branches 0..2), `wt` the scalar after it (branch 3). The `m` / `ang` inputs are
    // not read yet (WP-20).
    const Vpk = numericParam(params, 'Vpk', 325);
    const f = numericParam(params, 'f', 50);
    const wt = 2 * Math.PI * f * ctx.time;
    return [
      branch[0] - Vpk * Math.sin(wt),
      branch[1] - Vpk * Math.sin(wt - 2 * Math.PI / 3),
      branch[2] - Vpk * Math.sin(wt + 2 * Math.PI / 3),
      branch[3] - wt,
    ];
  },

  ps_second_order_filter: ({ across, branch, state, dState, params }) => {
    const wn = numericParam(params, 'wn', 100);
    const zeta = numericParam(params, 'zeta', 0.707);
    const u = across[0] || 0;
    return [
      dState[0] - state[1],
      dState[1] - (wn * wn * u - 2 * zeta * wn * state[1] - wn * wn * state[0]),
      branch[0] - state[0]
    ];
  },

  ps_state_feedback: ({ across, branch, params }) => {
    const x = across[0] || 0;
    // Scalar feedback gain: the first element of the gain list ("[1 2]" -> 1).
    const K = vectorParam(params, 'K', [1.0])[0];
    return [branch[0] - (-K * x)];
  },

  ps_sliding_mode: ({ across, branch, params }) => {
    const s = across[0] || 0;
    const eta = numericParam(params, 'k', 10);
    const limit = numericParam(params, 'boundary_layer', 0.05);
    const sat = Math.max(-1.0, Math.min(1.0, s / limit));
    return [branch[0] - (-eta * sat)];
  },

  ps_stair_gen: ({ branch, params, ctx }) => {
    // Each sample period raises the output by one unit; the library `steps` level list is not used yet (WP-20).
    const step_time = numericParam(params, 'ts', 0.1);
    const steps = Math.floor(ctx.time / step_time);
    return [branch[0] - steps];
  },

  ps_washout: ({ across, branch, state, dState, params }) => {
    const T = numericParam(params, 'T', 0.1);
    const u = across[0] || 0;
    const y = u - (state[0] || 0);
    return [
      dState[0] - y / T,
      branch[0] - y
    ];
  },

  // ── MATH TRANSFORMS ─────────────────────────────────────────────────────────
  inv_clarke_transform: (args) => {
    // Alpha-beta-zero -> abc (inverse of clarke_transform, same convention):
    //   a = alpha + zero,  b = -alpha/2 + (sqrt(3)/2) beta + zero,  c = -alpha/2 - (sqrt(3)/2) beta + zero
    const ab0 = vectorInput(args, 'ab0', 3);
    const [a, b, c] = clarkeInverse(ab0 as [number, number, number], clarkeConvention(args.params));
    return [args.branch[0] - a, args.branch[1] - b, args.branch[2] - c];
  },

  park_transform: (args) => {
    // abc -> dq0 (Simscape "abc to dq0"; Park 1929): the amplitude-invariant Clarke alpha-beta-zero rotated by theta.
    //   'Aligned with A':   d =  alpha cos(th) + beta sin(th),  q = -alpha sin(th) + beta cos(th)
    //   '90 deg behind A':  d =  alpha sin(th) - beta cos(th),  q =  alpha cos(th) + beta sin(th)   (th -> th - pi/2)
    //   zero = (a + b + c)/3.  For a = Vpk sin(wt), b, c lagging/leading by 120 deg and th = wt, '90 deg behind A' gives d = Vpk, q = 0.
    const abc = vectorInput(args, 'abc', 3) as [number, number, number];
    const theta = scalarInput(args, 'theta');
    const [alpha, beta, zero] = clarkeForward(abc, 'Peak Amp Preserved');
    const [d, q] = parkRotate(alpha, beta, theta, parkAlignment(args.params));
    return [args.branch[0] - d, args.branch[1] - q, args.branch[2] - zero];
  },

  inv_park_transform: (args) => {
    // dq0 -> abc (inverse of park_transform): rotate back by theta, then the inverse Clarke (peak convention).
    const dq0 = vectorInput(args, 'dq0', 3);
    const theta = scalarInput(args, 'theta');
    const [alpha, beta] = parkRotateInverse(dq0[0], dq0[1], theta, parkAlignment(args.params));
    const [a, b, c] = clarkeInverse([alpha, beta, dq0[2]], 'Peak Amp Preserved');
    return [args.branch[0] - a, args.branch[1] - b, args.branch[2] - c];
  },

  sym_comp_transform: (args) => {
    // abc -> +/-/0 sequence (Fortescue 1918). With the operator a = e^(j 2pi/3):
    //   V1 = (A + a B + a^2 C)/3,  V2 = (A + a^2 B + a C)/3,  V0 = (A + B + C)/3
    // of the PHASORS A, B, C at the base frequency. The phasor of the instantaneous signal x(t) = X cos(wt + phi) is the
    // analytic signal A = x - j (dx/dt)/w (= X e^(j(wt+phi))), so with w = 2 pi f_base the output `seq` is the three real
    // peak MAGNITUDES [|V1|, |V2|, |V0|]. A balanced positive set gives [Vpk, 0, 0]. dx/dt is the solver's dAcross.
    const abc = vectorInput(args, 'abc', 3);
    const dabc = vectorInput({ across: args.dAcross, ports: args.ports }, 'abc', 3);
    const w = 2 * Math.PI * numericParam(args.params, 'freq', 50);
    const seq = fortescueMagnitudes(abc as [number, number, number], dabc as [number, number, number], w);
    return [args.branch[0] - seq[0], args.branch[1] - seq[1], args.branch[2] - seq[2]];
  },

  inv_sym_comp_transform: (args) => {
    // +/-/0 sequence magnitudes -> abc (inverse Fortescue synthesis at the base frequency, phase reference cos(wt) on phase a):
    //   a = (V1 + V2 + V0) cos(wt)
    //   b = V1 cos(wt - 2pi/3) + V2 cos(wt + 2pi/3) + V0 cos(wt)
    //   c = V1 cos(wt + 2pi/3) + V2 cos(wt - 2pi/3) + V0 cos(wt)
    const [v1, v2, v0] = vectorInput(args, 'seq', 3);
    const wt = 2 * Math.PI * numericParam(args.params, 'freq', 50) * args.ctx.time;
    const sh = 2 * Math.PI / 3;
    const a = (v1 + v2 + v0) * Math.cos(wt);
    const b = v1 * Math.cos(wt - sh) + v2 * Math.cos(wt + sh) + v0 * Math.cos(wt);
    const c = v1 * Math.cos(wt + sh) + v2 * Math.cos(wt - sh) + v0 * Math.cos(wt);
    return [args.branch[0] - a, args.branch[1] - b, args.branch[2] - c];
  },
  quad_decoder: ({ across, branch, state, dState }) => {
    return [
      dState[0] - 0,
      branch[0] - (state[0] || 0),
      branch[1] - 0
    ];
  },

  resolver_to_digital: ({ across, branch, state, dState }) => {
    const s = across[0] || 0;
    const c = across[1] || 0;
    const theta = Math.atan2(s, c);
    return [
      dState[0] - 0,
      branch[0] - theta,
      branch[1] - 0
    ];
  },

  // ── BLDC & POWER ELECTRONICS CONTROL ────────────────────────────────────────
  bldc_commutation: ({ across, branch }) => {
    const theta = across[0] || 0;
    const ha = Math.sin(theta) > 0 ? 1 : 0;
    const hb = Math.sin(theta - 2*Math.PI/3) > 0 ? 1 : 0;
    const hc = Math.sin(theta + 2*Math.PI/3) > 0 ? 1 : 0;
    return [
      branch[0] - ha,
      branch[1] - hb,
      branch[2] - hc
    ];
  },

  bldc_current_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - error * 5.0];
  },

  bldc_pwm_ctrl: ({ across, branch }) => {
    const ctrl = across[0] || 0;
    return [branch[0] - Math.max(0, Math.min(1.0, ctrl))];
  },

  dcdc_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - Math.max(0.01, Math.min(0.99, 0.5 + error * 0.1))];
  },

  pfc_rectifier_ctrl: ({ across, branch }) => {
    const V_out = across[0] || 0;
    const V_ref = across[1] || 0;
    const I_ac = across[2] || 0;
    const duty = (V_ref - V_out) * 0.05 + Math.abs(I_ac) * 0.01;
    return [branch[0] - Math.max(0, Math.min(0.95, duty))];
  },

  cycloconverter_ctrl: ({ across, branch, ctx }) => {
    const f_out = across[0] || 10;
    const w = 2 * Math.PI * f_out;
    const firing_angle = 45 + 30 * Math.sin(w * ctx.time);
    return [branch[0] - firing_angle];
  },

  pwm_3ph_3level: (args) => {
    // Three-level (NPC) phase-disposition PWM (Holmes and Lipo, "Pulse Width Modulation for Power Converters", ch. 3 level-shifted
    // carriers; Simscape Electrical "PWM Generator (Three-Level)"). Reference vector m_abc = vabc in [-1, 1] (unit = Vdc/2), two
    // in-phase triangular carriers c_u = tri(f_sw t) in [0, 1] and c_l = c_u - 1 in [-1, 0]:
    //   r_k = clamp(m_k + Delta_neut, -1, 1),   Delta_neut = clamp(k_neut v_neut / max(|v_dc|, 1), -0.15, 0.15)
    //   g_k = +1 if r_k >= c_u,  -1 if r_k <= c_l,  0 otherwise     (phase voltage v_k = g_k Vdc/2 in {-Vdc/2, 0, +Vdc/2})
    // The carrier average of g_k is exactly r_k for every |r_k| <= 1 (P(c_u <= r) = r), so the fundamental phase voltage is
    // m Vdc/2 and the line-to-line rms fundamental is (sqrt(3)/(2 sqrt(2))) m Vdc, as for the two-level inverter.
    // Outputs: ga, gb, gc (levels) and ma, mb, mc = clamp(m_k, -1, 1) (the references). Residuals: [branch_ga..gc - g, branch_ma..mc - m]
    const { branch, params, ctx } = args;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const m = vectorInput(args, 'vabc', 3).map(v => clamp(v, -1, 1));
    const vdc = Math.abs(scalarInput(args, 'vdc'));
    const vneut = scalarInput(args, 'vneut');
    const fSw = numericParam(params, 'f_sw', 2000);
    const neutralGain = numericParam(params, 'neutral_balance_gain', 0.1);
    const neutralCorrection = clamp(neutralGain * vneut / Math.max(vdc, 1), -0.15, 0.15);
    const upper = triangularCarrier(ctx.time, fSw);
    const lower = upper - 1;
    const gates = m.map(ref => {
      const corrected = clamp(ref + neutralCorrection, -1, 1);
      return corrected >= upper ? 1 : corrected <= lower ? -1 : 0;
    });
    return [
      branch[0] - gates[0],
      branch[1] - gates[1],
      branch[2] - gates[2],
      branch[3] - m[0],
      branch[4] - m[1],
      branch[5] - m[2]
    ];
  },

  pwm_vienna: ({ across, branch, params, ctx }) => {
    const va = across[0] ?? 0;
    const vb = across[1] ?? 0;
    const vc = across[2] ?? 0;
    const ia = across[3] ?? 0;
    const ib = across[4] ?? 0;
    const ic = across[5] ?? 0;
    const vdc = Math.abs(across[6] ?? 0);
    const vneut = across[7] ?? 0;

    const fSw = Math.max(1, numericParam(params, 'f_sw', 10000));
    const vdcRef = numericParam(params, 'vdc_ref', 800);
    const kpV = numericParam(params, 'kp_v', 0.1);
    const neutralGain = numericParam(params, 'neutral_balance_gain', 0.1);

    // 1. DC voltage regulation loop
    const vdcError = vdcRef - vdc;
    const iRefAmplitude = Math.max(0, kpV * vdcError);

    // 2. Neutral-point midpoint balance correction
    const neutralCorrection = Math.max(-0.2, Math.min(0.2, neutralGain * vneut / Math.max(vdc, 1)));

    // 3. Phase modulation indices calculation
    const vNormDenom = Math.max(vdc, 1);
    const vMag = Math.max(Math.sqrt(va * va + vb * vb + vc * vc), 1);

    const phases = [
      { v: va, i: ia },
      { v: vb, i: ib },
      { v: vc, i: ic }
    ];

    const mods = phases.map(p => {
      const vNormalized = (2 * p.v) / vNormDenom;
      const iTarget = (iRefAmplitude * p.v) / vMag;
      const iError = iTarget - p.i;
      const rawMod = vNormalized + 0.05 * iError + neutralCorrection;
      return Math.max(-1, Math.min(1, rawMod));
    });

    // 4. Triangular carrier at f_sw in [0, 1]
    const carrierPhase = (ctx.time * fSw) % 1;
    const carrier = 2 * Math.abs(carrierPhase - 0.5);

    // 5. Switching gates: switch is ON (1) when carrier < duty (1 - |m|), else OFF (0)
    const gates = mods.map(m => {
      const duty = 1 - Math.abs(m);
      return carrier < duty ? 1 : 0;
    });

    return [
      branch[0] - gates[0],
      branch[1] - gates[1],
      branch[2] - gates[2],
      branch[3] - mods[0],
      branch[4] - mods[1],
      branch[5] - mods[2]
    ];
  },

  thyristor_6pulse: (args) => {
    // Six-pulse thyristor-bridge firing generator (Simscape Electrical "Synchronized 6-Pulse Generator", Mohan ch. 6): the
    // gate of thyristor k = 1..6 is high while the synchronisation angle theta [deg] is within pulse_width_deg of the firing
    // angle alpha + 60 (k - 1) [deg], alpha counted from the natural commutation point of thyristor 1:
    //   g_k = 1 if wrap360(theta - (alpha + 60 (k - 1))) < pulse_width_deg, else 0
    // When the theta port is not wired the angle is the internal ramp theta = 360 freq t (freq [Hz]). An exact 0 deg theta is a
    // legitimate value (it is not mistaken for an unwired port).
    // Residuals: [branch_gk - g_k], k = 1..6
    const { branch, params, ctx, ports, connectedPorts } = args;
    const freq = numericParam(params, 'freq', 50);
    const pulseWidth = numericParam(params, 'pulse_width_deg', 20);
    const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;
    const thetaWired = ports.includes('theta') && (!connectedPorts || connectedPorts.includes('theta'));
    const thetaDeg = wrap360(thetaWired ? scalarInput(args, 'theta') : ctx.time * freq * 360);
    const alphaDeg = wrap360(scalarInput(args, 'alpha'));
    const gates: number[] = [];
    for (let k = 0; k < 6; k++) {
      const fireAngle = wrap360(alphaDeg + k * 60);
      const dist = wrap360(thetaDeg - fireAngle);
      gates.push(dist < pulseWidth ? 1 : 0);
    }
    return gates.map((g, i) => branch[i] - g);
  },

  thyristor_12pulse: ({ across, branch, params, ctx, ports }) => {
    // Twelve-pulse firing generator (Simscape Electrical "Synchronized 12-Pulse Generator", Mohan ch. 6 / Rashid ch. 10):
    // two six-pulse sequences, the wye (star) bridge 30 deg behind the delta bridge,
    //   delta_g_k = 1 if wrap2pi(phi - (alpha + 60 (k-1))) < pulse_width_deg,   wye_g_k = same with alpha + 30 + 60 (k-1)
    //   phi = theta + 2 pi freq t   [rad]
    // theta is the electrical phase offset in radians (the convention used by
    // the other electrical angle blocks).  alpha is the firing angle in
    // degrees, while freq advances theta through the simulation time.
    // (the six-pulse block takes theta as an absolute angle in degrees: the two conventions are documented in their help texts, F-083)
    const valueAtPort = (portId: string, fallbackIndex: number, fallback: number) => {
      const index = ports.indexOf(portId);
      const value = across[index >= 0 ? index : fallbackIndex];
      const numeric = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    };
    const theta = valueAtPort('theta', 0, 0);
    const alphaDeg = valueAtPort('alpha', 1, 30);
    const freq = Math.max(0, numericParam(params, 'freq', 50));
    const pulseWidthDeg = Math.max(0, Math.min(60, numericParam(params, 'pulse_width_deg', 5)));

    const twoPi = 2 * Math.PI;
    const normalizeAngle = (angle: number) => ((angle % twoPi) + twoPi) % twoPi;
    const phase = normalizeAngle(theta + twoPi * freq * ctx.time);
    const alphaRad = alphaDeg * Math.PI / 180;
    const pulseWidthRad = pulseWidthDeg * Math.PI / 180;
    const isFiringPulse = (phaseOffsetDeg: number) => {
      const firingAngle = alphaRad + phaseOffsetDeg * Math.PI / 180;
      const elapsed = normalizeAngle(phase - firingAngle);
      return elapsed < pulseWidthRad ? 1 : 0;
    };

    // Each bridge fires at alpha + k*60 degrees.  The wye transformer shifts
    // its complete six-pulse sequence by 30 degrees relative to delta.
    const deltaGates = Array.from({ length: 6 }, (_, index) => isFiringPulse(index * 60));
    const wyeGates = Array.from({ length: 6 }, (_, index) => isFiringPulse(30 + index * 60));
    const gates = [...deltaGates, ...wyeGates];

    // There is one allocated branch for every visible gate output.  The
    // fallback prevents a malformed legacy caller from turning a residual into
    // NaN; normal assembly always supplies all twelve branches.
    return gates.map((gate, index) => {
      const residual = (branch[index] ?? 0) - gate;
      return residual === 0 ? 0 : residual;
    });
  },

  dc_current_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - error * 2.0];
  },

  dc_voltage_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - error * 5.0];
  },

  hysteresis_ctrl_3ph: ({ across, branch }) => {
    const error_a = (across[0] || 0) - (across[3] || 0);
    const error_b = (across[1] || 0) - (across[4] || 0);
    const error_c = (across[2] || 0) - (across[5] || 0);
    return [
      branch[0] - (error_a > 0.05 ? 1.0 : (error_a < -0.05 ? 0.0 : 0.5)),
      branch[1] - (error_b > 0.05 ? 1.0 : (error_b < -0.05 ? 0.0 : 0.5)),
      branch[2] - (error_c > 0.05 ? 1.0 : (error_c < -0.05 ? 0.0 : 0.5))
    ];
  },

  velocity_ctrl: ({ across, branch }) => {
    const error = (across[0] || 0) - (across[1] || 0);
    return [branch[0] - error * 10.0];
  },

  im_scalar_ctrl: ({ across, branch }) => {
    const w_ref = across[0] || 1500;
    const V_mag = Math.max(0.1, Math.min(1.0, Math.abs(w_ref) / 1500));
    return [
      branch[0] - V_mag,
      branch[1] - w_ref
    ];
  },

  im_dtc_ctrl: ({ across, branch }) => {
    const error_tq = (across[0] || 0) - (across[1] || 0);
    const error_flux = (across[2] || 0) - (across[3] || 0);
    return [
      branch[0] - (error_tq > 5 ? 1 : (error_tq < -5 ? -1 : 0)),
      branch[1] - (error_flux > 0.01 ? 1 : 0)
    ];
  },

  im_curr_ctrl: ({ across, branch }) => {
    // idq_ref / idq / vdq_ref are single scalar ports: they carry the d channel. The q-channel row read vdq_ff and
    // v_max (across[2], across[3]) as if they were idq_ref_q / idq_q and had no unknown (F-025); it is removed until
    // vector ports exist (WP-20). The gain 2.0 is the unexposed placeholder tracked by params-dead (WP-20).
    const error_d = (across[0] || 0) - (across[1] || 0);
    return [
      branch[0] - error_d * 2.0
    ];
  },

  pmsm_curr_ctrl: ({ across, branch }) => {
    // Same single d-channel mapping as im_curr_ctrl (see there).
    const error_d = (across[0] || 0) - (across[1] || 0);
    return [
      branch[0] - error_d * 2.0
    ];
  },

  pmsm_ref_gen: ({ across, branch }) => {
    const tq_ref = across[1] || 0;
    return [
      branch[0] - 0.0,
      branch[1] - tq_ref * 0.5
    ];
  },

  pmsm_field_weakening: ({ across, branch }) => {
    const speed = across[0] || 0;
    const limit = 200;
    const id_fw = speed > limit ? -(speed - limit) * 0.1 : 0.0;
    return [branch[0] - id_fw];
  },

  pmsm_tq_est: ({ across, branch }) => {
    const iq = across[1] || 0;
    const Kt = 0.2;
    return [branch[0] - (Kt * iq)];
  },

  // ── MECHANICAL & MULTIBODY ──────────────────────────────────────────────────
  ang_vel_source: ({ across, params, ports, connectedPorts }) => {
    // omega commanded via the `s` port when wired, else the omega parameter (legacy key `w` is migrated on load)
    const w = inputOrParam({ across, ports, connectedPorts }, 's', numericParam(params, 'omega', 50), 2);
    return [across[0] - (across[1] || 0) - w];
  },

  wheel_axle: ({ across, branch, params, ports = [] }) => {
    const Rw = numericParam(params, 'Rw', 0.3);
    const rotationalPort = ports.indexOf('a');
    const translationalPort = ports.indexOf('p');
    const w = rotationalPort >= 0 ? across[rotationalPort] : across[0];
    const v = translationalPort >= 0 ? across[translationalPort] : across[1];
    const T = branch[0];
    const F = branch[1];
    return [
      v - w * Rw,
      T + Rw * F
    ];
  },

  // Scalar <-> Frame bridges (vlabJointCore.ts conventions): the network port pair R-C follows the relative motion of the
  // Frames B-F about / along the configured axis, and the through variable of the network is applied along the SAME
  // world axis R_B*axis on F (+) with the reaction on B (-). Lossless: T*w_rel (F*v_rel) is handed over unchanged.
  rot_multibody_interface: ({ across, dAcross, branch, params, ports = [], nodeId, ctx }) =>
    interfaceResiduals('rotation', { across, dAcross, branch, params: params ?? {}, ports, nodeId: nodeId ?? '', dt: ctx?.dt }),

  trans_multibody_interface: ({ across, dAcross, branch, params, ports = [], nodeId, ctx }) =>
    interfaceResiduals('translation', { across, dAcross, branch, params: params ?? {}, ports, nodeId: nodeId ?? '', dt: ctx?.dt }),

  // ── BELT & CABLE MATERIAL ────────────────────────────────────────────────
  // belt_properties is a property-link block: it contributes no DAE residuals
  // itself, but publishes density/youngs so belt/cable parts absorb them into
  // stiffness (k = E*A/L), wrapped-belt inertia (J = 2*pi*rho*R^3) and tension.
  // Propagation has two layers: DAEAssembler injects belt_density/belt_youngs
  // into consumer params at assembly time (wired P port wins, else model-wide),
  // and this factory mirrors them onto ctx.parameters (grid_freq precedent)
  // for live evaluation paths.
  belt_properties: ({ params, ctx, nodeId }) => {
    const density = numericParam(params, 'density', 1.1);
    const youngs = numericParam(params, 'youngs', 1e9);
    if (ctx?.parameters) {
      ctx.parameters['belt_density'] = density;
      ctx.parameters['belt_youngs'] = youngs;
      if (nodeId) {
        ctx.parameters[`belt_density@${nodeId}`] = density;
        ctx.parameters[`belt_youngs@${nodeId}`] = youngs;
      }
    }
    return [];
  },

  belt_end: ({ across, branch, state, dState, params, ctx, ports = [] }) => {
    // Axial stiffness from material (k = E*A/L); legacy fixed stiffness param when no belt_properties material is available.
    const k = beltEndStiffness(params, ctx);
    const rIdx = portIndex(ports, 'r', 0);
    const eIdx = portIndex(ports, 'e', 1);
    // extension x = x_E - x_R (stretch positive, the state of this block), v = dx/dt = v_E - v_R. Belt/cable spec
    // (docs/superpowers/specs/2026-09-30-vlab-belt-pulley-domains-and-scope-outputs-design.md 2.4): the tension is
    // T = k x + c v and the belt is tension-only (non-slack condition): a slack belt (T < 0) carries no force, T = max(0, k x + c v).
    // F_R->E, the force INTO the block at R, is -T. The slack / taut switch is a zero-crossing event of k x + c v
    // (detectZeroCrossings). The extension is the state so that a taut belt is the state the structural probe sees.
    const v = across[eIdx] - across[rIdx];
    const x = state[0];
    const c = numericParam(params, 'damping', 0);
    const res = [
      branch[0] + Math.max(0, k * x + c * v),
    ];    if (branch.length > 1) {
      // Measurement signal f is the belt tension T = -F_R->E
      res.push(branch[1] + branch[0]);
    }
    res.push(dState[0] - v);
    return res;
  },

  belt_spool: ({ across, dAcross, branch, params, ctx, ports = [] }) => {
    const R = numericParam(params, 'radius', 0.1);
    const mat = resolveBeltMaterial(params, ctx);
    const rIdx = portIndex(ports, 'r', 0);
    const aIdx = portIndex(ports, 'a', 1);
    const w = across[rIdx];
    const v = across[aIdx];
    // Spool inertia + wrapped-belt inertia (one circumference: m = rho*2*pi*R).
    const J = numericParam(params, 'inertia', 0) +(mat ? 2 * Math.PI * mat.density * R ** 3 : 0);
    const dw = dAcross[rIdx];
    const res = [
      v - w * R,
      branch[0] + branch[1] * R - J * dw
    ];
    if (branch.length > 2) {
      // Measurement signal t couples to torque
      res.push(branch[2] - branch[0]);
    }
    return res;
  },

  pulley: ({ across, dAcross, branch, params, ctx, ports = [] }) => {
    const R = numericParam(params, 'radius', 0.1);
    const mat = resolveBeltMaterial(params, ctx);
    const rIdx = portIndex(ports, 'r', 0);
    const aIdx = portIndex(ports, 'a', 1);
    const bIdx = portIndex(ports, 'b', 2);
    const w = across[rIdx];
    const vA = across[aIdx];
    const vB = across[bIdx];
    const J = numericParam(params, 'inertia', 0.01) +(mat ? 2 * Math.PI * mat.density * R ** 3 : 0);
    const dw = dAcross[rIdx];
    const res = [
      vA - w * R,
      vB + w * R,
      branch[0] + (branch[1] - branch[2]) * R - J * dw
    ];
    if (branch.length > 3) {
      // Measurement signal t couples to torque
      res.push(branch[3] - branch[0]);
    }
    return res;
  },

  // ── GAS AND MOIST AIR DOMAINS ──────────────────────────────────────────────
  gas_inf_resistance: ({ branch }) => [branch[0]],

  ma_pipe: ({ across, branch, params }) => {
    const f = numericParam(params, 'resistance', 1.0);
    const Pa = across[0];
    const Pb = across[1];
    return [Pb - Pa - f * branch[0]];
  },

  ma_separator: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[0] - branch[1]
    ];
  },

  ma_rot_conv: ({ across, branch, params }) => {
    const h0 = numericParam(params, 'h0', 5.0);
    const k = numericParam(params, 'k', 0.1);
    const w = across[0];
    const Ta = across[1];
    const Tb = across[2];
    const Q = branch[0];
    const h = h0 + k * Math.abs(w);
    return [Q - h * (Ta - Tb)];
  },

  ma_trans_conv: ({ across, branch, params }) => {
    const h0 = numericParam(params, 'h0', 5.0);
    const k = numericParam(params, 'k', 0.1);
    const v = across[0];
    const Ta = across[1];
    const Tb = across[2];
    const Q = branch[0];
    const h = h0 + k * Math.abs(v);
    return [Q - h * (Ta - Tb)];
  },

  ma_flow_sensor: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[1] - branch[0]
    ];
  },

  ma_selector: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[0] - branch[1]
    ];
  },

  ma_moisture_sensor: ({ branch }) => {
    return [branch[0] - 0.5];
  },

  ma_pt_sensor: ({ across, branch }) => {
    return [
      branch[0] - (across[0] || 101325),
      branch[1] - (across[1] || 293.15)
    ];
  },

  ma_thermo_sensor: ({ branch }) => {
    return [branch[0] - 1000];
  },

  ma_moisture_source: ({ branch, params }) => {
    const S = numericParam(params, 'rate', 0.01);
    return [branch[0] - S];
  },

  ma_flow_source: ({ branch, params }) => {
    const S = numericParam(params, 'rate', 0.01);
    return [branch[0] - S];
  },

  ma_properties: () => []
};

const rlStateCache = new Map<string, {
  qTable: number[][];
  lastStateIdx: number;
  lastActionIdx: number;
  hasPrev: number;
  lastUpdateTime: number;
  currentAction: number;
  currentMaxQ: number;
}>();

/**
 * Run `fn` and then restore every equation cache that outlives a single evaluation (the RL Q-table). The assembler's
 * structural probe evaluates each factory once at assembly time; that must not advance a running block's memory.
 */
export function withStatefulEquationCaches<T>(fn: () => T): T {
  const snapshot = new Map([...rlStateCache].map(([k, v]) => [k, structuredClone(v)] as const));
  try {
    return fn();
  } finally {
    rlStateCache.clear();
    snapshot.forEach((v, k) => rlStateCache.set(k, v));
  }
}
