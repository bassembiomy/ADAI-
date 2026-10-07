import { EquationContext } from './types';
import { numericParam, stringParam, vectorParam, unwrapParam, parseNumeric, VLabParamError } from './vlabParams';
import { scalarInput, vectorInput } from './vlabVectorPorts';
import { historyAt, movingAverageSpec } from './vlabHistory';
import { controllerEquations, SIGNAL_TIME_QUANTUM as CONTROLLER_TIME_QUANTUM } from './vlabControllers';
import { interfaceResiduals, jointResiduals } from './vlabJointCore';
import { computeAbsoluteReferencePressure, computeEffectivePortPressure } from '../../utils/hydraulicUnits';
import {
  R_GAS, R_WATER_VAPOUR, CP_WATER_LIQUID, STANDARD_ATMOSPHERE,
  airViscosity, darcyFrictionFactor, gasOrificeMassFlow, moistAirState, orificeMassFlow, pipePressureDrop,
  saturatedSteamAtPressure, saturatedVapourDensitySlope, waterLatentHeat,
} from './vlabFluidProperties';
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
  'steam_accumulator', 'steam_generator', 'ma_rot_conv', 'ma_trans_conv', 'belt_spool', 'pulley', 'ps_lpf',
  'memristor', 'rot_spring', 'rot_hard_stop', 'rot_motion_sensor',
  'trans_motion_sensor', 'trans_spring', 'microwave_cavity', 'reluctance_force',
  'ps_integrator', 'ps_transfer_fcn', 'ps_pi_ctrl', 'ps_pid_ctrl',
  'ac_motor', 'ma_chamber', 'lms_adaptive_filter', 'neural_neuron_learning',
  'ac_motor_pid_control', 'luenberger_observer', 'im_flux_observer', 'pmsm_foc',
  'ps_integrator_gen', 'ps_moving_avg', 'ps_sr_flipflop', 'ps_sample_hold',
  'ps_smith_predictor', 'ps_second_order_filter', 'ps_washout',
  'quad_decoder', 'resolver_to_digital', 'belt_end',
  // WP-20b: sliding mode reads d/dt of its inputs; the sampled / relay / learning blocks keep committed discrete memory
  'ps_sliding_mode', 'rl_q_learning_controller', 'hysteresis_ctrl_3ph', 'im_dtc_ctrl', 'cycloconverter_ctrl',
  // WP-20a: blocks that look back in time through the committed history (vlabHistory.ts); the Sequence Analyzer keeps its
  // running Fourier integrals as states
  'ps_delay', 'ps_rms', 'sym_comp_transform',
]);

/** Time resolution of the discontinuous sources (step, stair, sample grid): the jump is taken at t >= T - quantum / 2 [s]. */
export const SIGNAL_TIME_QUANTUM = CONTROLLER_TIME_QUANTUM;
/** Logic threshold of the physical-signal logic inputs (SR flip-flop S / R, sample-and-hold S, integrator reset): high when > 0.5. */
export const SIGNAL_LOGIC_THRESHOLD = 0.5;
/** Stefan-Boltzmann constant sigma [W/(m^2 K^4)], CODATA 2018 exact value (shared by every radiation term). */
export const STEFAN_BOLTZMANN = 5.670374419e-8;

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
  /** Instance port id -> label (from the node's own `data.ports`), when the node declares any. */
  portLabels?: Record<string, string>;
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

// Numeric parameters are read through numericParam (vlabParams.ts): a missing value takes the default, a user-supplied
// 0 / negative / "1e-3" is honoured, and malformed text throws a structured VLabParamError (never a silent default).

/**
 * Scalar input of a physical-signal port by id (WP-20a): an unwired port reads 0 (the assembler hands 0 for an unwired
 * physical input). `legacyIdx` is only for direct unit-test calls that pass no `ports` array.
 */
const sigIn = (a: { across: any[]; ports?: string[] }, id: string, legacyIdx: number): number => {
  const i = a.ports ? a.ports.indexOf(id) : legacyIdx;
  const v = i >= 0 ? a.across[i] : undefined;
  return typeof v === 'number' ? v : 0;
};

const tableError = (param: string, reason: string): never => {
  throw new VLabParamError([{ blockId: '', param, raw: undefined, code: 'invalid-parameter', reason: `Parameter "${param}": ${reason}.` }]);
};

/** Lookup-table breakpoints: at least two, strictly increasing, one value per breakpoint. */
const checkBreakpoints = (name: string, x: number[], valuesName: string, valuesLength: number): void => {
  if (x.length < 2) tableError(name, 'needs at least two breakpoints');
  if (x.length !== valuesLength) tableError(name, `has ${x.length} breakpoints but "${valuesName}" has ${valuesLength} values`);
  for (let i = 1; i < x.length; i++) if (!(x[i] > x[i - 1])) tableError(name, 'breakpoints must be strictly increasing');
};

/** Piecewise-linear interpolation with nearest (clamped) extrapolation; x strictly increasing. */
const interpolate1d = (x: number[], y: number[], u: number): number => {
  if (u <= x[0]) return y[0];
  if (u >= x[x.length - 1]) return y[y.length - 1];
  let lo = 0; let hi = x.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid] <= u) lo = mid; else hi = mid; }
  return y[lo] + ((u - x[lo]) / (x[hi] - x[lo])) * (y[hi] - y[lo]);
};

/** Numeric matrix parameter written as text ("[0 0; 0 1]", rows separated by ; or a newline) or as an array of rows. */
const matrixParam = (params: Record<string, any> | undefined, key: string, fallback: number[][]): number[][] => {
  const v = unwrapParam(params?.[key]);
  if (v === undefined || v === null) return fallback;
  let rows: unknown[][];
  if (Array.isArray(v)) rows = v.map(r => (Array.isArray(r) ? r : [r]));
  else {
    const text = String(v).replace(/[[\]]/g, ' ').trim();
    if (text === '') return fallback;
    rows = text.split(/[;\n]+/).map(r => r.trim()).filter(Boolean).map(r => r.split(/[\s,]+/).filter(Boolean));
  }
  const out = rows.map(r => r.map(item => {
    const parsed = parseNumeric(item);
    if (parsed.kind !== 'ok') tableError(key, `matrix element ${JSON.stringify(item)} is not a number`);
    return (parsed as { kind: 'ok'; value: number }).value;
  }));
  if (out.some(r => r.length !== out[0].length)) tableError(key, 'matrix rows must all have the same length');
  return out;
};

/** `lower` / `upper` of a limiter or dead zone: a swapped pair is a parameter diagnostic, never silently reordered. */
const orderedLimits = (params: Record<string, any> | undefined, lowerDefault: number, upperDefault: number): [number, number] => {
  const lower = numericParam(params, 'lower', lowerDefault);
  const upper = numericParam(params, 'upper', upperDefault);
  if (lower > upper) {
    throw new VLabParamError([{
      blockId: '', param: 'lower', raw: lower, code: 'parameter-out-of-range',
      reason: `Parameter "lower" = ${lower} must not exceed "upper" = ${upper}.`,
    }]);
  }
  return [lower, upper];
};

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

// Belt/cable material resolution (spec 2026-09-30 belt-pulley 2.5: no fallback for an unlinked block). Precedence: the live value of the
// belt_properties block this consumer's P port is LINKED to (ctx.parameters `belt_density@<source>`, source = params.belt_properties_source,
// set by the assembly) > the assembly-injected belt_density/belt_youngs of that link > the block's own density/youngs params. The model-wide
// broadcast (`belt_density`) never reaches a consumer: it used to override the own parameters of an UNLINKED block (WP-31c, F-104).
// Returns null when no material source exists so consumers keep their legacy standalone behavior.
const resolveBeltMaterial = (
  params: Record<string, any> | undefined,
  ctx: EquationContext | undefined
): { density: number; youngs: number } | null => {
  const source = params && typeof params.belt_properties_source === 'string' ? params.belt_properties_source : undefined;
  const broadcastDensity = source && ctx?.parameters ? numParam(ctx.parameters[`belt_density@${source}`], NaN) : NaN;
  const broadcastYoungs = source && ctx?.parameters ? numParam(ctx.parameters[`belt_youngs@${source}`], NaN) : NaN;
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

/**
 * Moist-air mechanical converter (Rotational / Translational Mechanical Converter (MA)), WP-17: a single-acting piston chamber.
 * The chamber volume follows the mechanism, V = V0 + K x with K = D (m^3/rad) or A (m^2) and x = integral(v_R - v_C) dt.
 *   across = [p_A, T_H, v_R, v_C, wd]; branch = [mdot into the chamber at A, Q into the gas from H, force/torque INTO the block at R, wd];
 *   state = [x, m, T_g]  (m = gas mass, so the mass balance dm/dt = mdot_A is integrated exactly, not through a product-rule expansion).
 * Ideal moist air (R, c_v from the state at (P0, T, phi), humidity ratio frozen):
 *   p = m R T_g / V      (node pressure)
 *   energy: m c_v dT/dt = mdot_A R T - p dV/dt + Q_H     (flow enters at the gas temperature: dU/dt = mdot cp T - p dV/dt + Q_H, U = m c_v T)
 *   heat transfer: Q_H = (h0 + k |v|)(T_H - T_g)   (stationary + speed dependent coefficient)
 *   force balance of the piston: F_delivered = K (p - p_env)  ->  through variable at R (INTO the block) = -K (p - p_env)
 *   wd = K (p - p_env) v = mechanical power delivered by the gas [W]
 */
function movingWallChamber(
  kind: 'rot' | 'trans',
  { across, branch, state, dState, params }: Pick<BlockEquationArgs, 'across' | 'branch' | 'state' | 'dState' | 'params'>,
): number[] {
  const K = kind === 'rot' ? numericParam(params, 'D', 0.001) : numericParam(params, 'A', 0.01);
  const V0 = numericParam(params, 'V0', 1e-3);
  const h0 = numericParam(params, 'h0', 5);
  const kHeat = numericParam(params, 'k', 0.1);
  const T0 = numericParam(params, 'T', 293.15);
  const P0 = numericParam(params, 'P0', STANDARD_ATMOSPHERE);
  const pEnv = numericParam(params, 'p_env', STANDARD_ATMOSPHERE);
  const phi = numericParam(params, 'phi', 0.5);
  const gas = moistAirState(P0, T0, phi);
  const v = across[2] - across[3];
  const x = state[0];
  const m = state[1];
  const T = Math.max(state[2], 1);
  const V = Math.max(V0 + K * x, 1e-9);
  const dV = K * v;
  const p = (m * gas.R * T) / V;
  const Qh = (h0 + kHeat * Math.abs(v)) * (across[1] - T);
  const pistonForce = K * (p - pEnv);
  return [
    across[0] - p,
    branch[1] - Qh,
    branch[2] + pistonForce,
    branch[3] - pistonForce * v,
    dState[0] - v,
    dState[1] - branch[0],
    m * gas.cv * dState[2] - (branch[0] * gas.R * T - p * dV + Qh),
  ];
}
export const blockEquations: Record<string, BlockEquationFactory> = {
  // ── ELECTRICAL DOMAIN ──────────────────────────────────────────────────────
  ground: () => [],
  delta_ref: () => [],
  open_circuit: () => [],
  subsystem: () => [],
  inport: () => [],
  outport: () => [],
  
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
  // Simscape Foundation Thermal Reference: absolute zero. The assembler pins the net to THERMAL_REFERENCE_TEMPERATURE = 0 K (WP-15,
  // F-011): every thermal across variable is an ABSOLUTE temperature in K, ambient comes from a Temperature Source or a parameter.
  thermal_ref: () => [],

  conductive_heat: ({ across, branch, params }) => {
    // Simscape Foundation Conductive Heat Transfer: Q = k A / D (T_A - T_B), here lumped: Q = k (T_A - T_B), k [W/K] = conductivity A / D.
    const k = numericParam(params, 'k', 1.0);
    const dT = across[0] - across[1];
    return [branch[0] - k * dT];
  },
  
  convective_heat: ({ across, branch, params }) => {
    // Simscape Foundation Convective Heat Transfer (Newton's law of cooling): Q = h A (T_A - T_B), h [W/(m^2 K)], A [m^2]
    const h = numericParam(params, 'h', 10.0);
    const A = numericParam(params, 'A', 0.1);
    const dT = across[0] - across[1];
    return [branch[0] - h * A * dT];
  },
  
  radiative_heat: ({ across, branch, params }) => {
    // Stefan-Boltzmann law for a grey body (Incropera & DeWitt, eq. 1.7; Simscape Radiative Heat Transfer):
    //   Q = sigma eps A (T_A^4 - T_B^4),  T in ABSOLUTE kelvin (hence the 0 K Thermal Reference)
    const eps = numericParam(params, 'eps', 0.9);
    const A = numericParam(params, 'A', 0.1);
    const sigma = STEFAN_BOLTZMANN; // W/(m^2 K^4) (CODATA 2018)
    const Ta = across[0];
    const Tb = across[1];
    const heat = eps * sigma * A * (Math.pow(Ta, 4) - Math.pow(Tb, 4));
    return [branch[0] - heat];
  },
  
  thermal_mass: ({ across, dAcross, branch, params }) => {
    // Simscape Foundation Thermal Mass: Q = m c dT/dt = C dT/dt, Q = heat flow INTO the port, T = absolute temperature (K).
    // The initial temperature T0 seeds the node history in vlabPhysics.ts (default 293.15 K).
    const C = Math.max(1e-6, numericParam(params, 'C', 100.0));
    return [branch[0] - C * dAcross[0]];
  },
  
  temp_sensor: ({ across, branch, ports }) => {
    // Simscape Foundation Temperature Sensor: T_out = T_A - T_B (both absolute, referred to the 0 K Thermal Reference), so the
    // output is the ABSOLUTE temperature when B is on the reference (or left open: INTERNAL_THERMAL_REFERENCE_PORTS).
    // across[0]: T_a, across[1]: T_b
    // branch[0]: heat_flow through sensor, branch[1]: output signal
    const Ta = across[0] ?? 0;
    const Tb = across[1] ?? 0;
    return [
      branch[0],             // zero heat flow
      branch[1] - (Ta - Tb)  // output signal = Ta - Tb
    ];
  },
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
    // Joule heating of a resistor (Ohm + Joule, lossless electrothermal conversion, F-044 / WP-15):
    //   V = I R,   Q = I^2 R = V I = V^2 / R    (electrical power in = heat flow out into the thermal port h)
    // (Vp-Vn) - I*R = 0
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
    // Lumped magnetron (WP-21). The anode circuit is the documented square-law characteristic P_elec = P_rated (V/V_nom)^2,
    // i.e. an equivalent anode resistance R_a = V_nom^2 / P_rated, so i = V P_rated / V_nom^2 and P_elec = v i >= 0 for either
    // polarity (the old i = P/|V| drew a positive current at negative V: v i < 0 while heat was still produced).
    // RF output (absorbed by the load, delivered through H): P_RF = eta P_elec, eta = efficiency/100.
    // Anode loss (1 - eta) P_elec is rejected to ambient by the magnetron's own cooling (not through H).
    // Energy: v i = P_RF + P_loss exactly. Thermal port H: the branch is the heat INTO the node wired to H [W].
    const V = across[0] - across[1];
    const P_rated = numericParam(params, 'power_rating', 900);
    const eff = (numericParam(params, 'efficiency', 65)) / 100;
    const V_nom = numericParam(params, 'v_nominal', 4000);
    const G_a = P_rated / (V_nom * V_nom);
    const I = G_a * V;
    const P_elec = V * I;
    return [
      branch[0] - I,
      branch[1] - eff * P_elec
    ];
  },

  upper_heater: ({ across, branch, params }) => {
    // Radiant resistive element (WP-21): Joule heating P_el = V^2/R (Ohm, i = V/R). The element has negligible heat capacity,
    // so its grey-body radiant output eps sigma A (T_e^4 - T_load^4) equals the absorbed Joule power at every instant
    // (quasi-static); the fraction `efficiency` reaches the cavity through H, (1 - efficiency) P_el is lost to the housing.
    // Energy: v i = Q_H + Q_loss. branch[0] = current p -> n, branch[1] = heat INTO the node wired to H [W].
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

  steam_generator: ({ across, branch, state, dState, params }) => {
    // Electric boiler (immersion heater + water tank), WP-17.
    //   across: [v_p, v_n, T_s]; branch[0] = current p -> n, branch[1] = heat injected into the steam port S (the latent heat of the steam produced);
    //   state[0] = T_w (water temperature, K), state[1] = m_w (water inventory, kg).
    // Resistive element rated `power` at `v_rated`: R = v_rated^2 / power, i = (v_p - v_n) / R, P_el = v i (Joule; Fitzgerald ch. 1).
    // Tank energy balance (first law, lumped water, liquid c_w = 4182 J/(kg K)):
    //   m_w c_w dT_w/dt = eta P_el - k_loss (T_w - T_amb) - Q_s
    // Boiling at the saturation temperature T_b = boil_temp: once T_w reaches T_b the net heat produces steam, mdot_s = Q_s / h_fg with
    // Q_s = max(0, eta P_el - k_loss (T_w - T_amb)) (zero below T_b, a smooth step of width 0.05 K), and the inventory falls dm_w/dt = -mdot_s.
    // h_fg(T_b) is the Clausius-Clapeyron latent heat of the IF97 saturation line (vlabFluidProperties.waterLatentHeat).
    const Prated = numericParam(params, 'power', 800);
    const Vr = numericParam(params, 'v_rated', 230);
    const eta = numericParam(params, 'eta', 0.95);
    const kLoss = numericParam(params, 'k_loss', 1);
    const Tamb = numericParam(params, 'ambient_temp', 25) + 273.15;
    const Tb = numericParam(params, 'boil_temp', 100) + 273.15;
    const R = Prated > 0 ? (Vr * Vr) / Prated : Infinity;
    const V = across[0] - across[1];
    const i = Number.isFinite(R) ? V / R : 0;
    const Pel = V * i;
    const Tw = state[0];
    const mw = state[1];
    // saturation exists between the triple point and the critical point (647 K); outside it the nearest limit is used (the library bound rejects it)
    const hfg = waterLatentHeat(Math.min(Math.max(Tb, 274), 640));
    const net = Math.max(0, eta * Pel - kLoss * (Tw - Tamb));
    const boiling = 0.5 * (1 + Math.tanh((Tw - Tb) / 0.05));
    const wet = 0.5 * (1 + Math.tanh((mw - 3e-3) / 1e-3));
    const Qs = boiling * wet * net;
    const mdotSteam = Qs / hfg;
    return [
      branch[0] - i,
      branch[1] - Qs,
      Math.max(mw, 1e-3) * CP_WATER_LIQUID * dState[0] - (eta * Pel - kLoss * (Tw - Tamb) - Qs),
      dState[1] + mdotSteam,
    ];
  },

  microwave_cavity: ({ across, branch, state, dState, params }) => {
    // branch[0] is heat_flow1, branch[1] is heat_flow2, branch[2] is heat_flow3, branch[3] is signal_t
    // state[0] is temp
    const getVal = (key: string, fallback: number): number => numericParam(params, key, fallback);

    // Lumped cavity energy balance (first law; Incropera & DeWitt eq. 1.12c with convection eq. 1.3a and grey-body radiation
    // eq. 1.7, sigma = CODATA STEFAN_BOLTZMANN):
    //   C dT/dt = Q_in - Q_conv - Q_rad - Q_vent,  Q_in = Q1 + Q2 + Q3 (heat INTO the cavity through M, U, S)
    //   Q_conv = h A (T - T_amb),  Q_rad = eps sigma A (T^4 - T_amb^4),  A = 6 (V/1000)^(2/3) (cube)
    //   Q_vent = (1 - cutout) Q_in, cutout = (1 + tanh((T_max - T)/3 K))/2: above the cutout limit the input is vented to ambient.
    // Temperatures in K; ambient_temp and max_temp are degC parameters (library unit), converted with +273.15.
    const vol = getVal('volume', 25);
    const maxTempK = getVal('max_temp', 250) + 273.15;
    const T_amb = getVal('ambient_temp', 25) + 273.15;

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
    const sigma = STEFAN_BOLTZMANN;
    const U_A = h_conv * A;

    const temp = state[0];

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
    // Simulink / Simscape Step: y = initial for t < T, y = final for t >= T. The jump is a time event: the solver cuts the step
    // to end just before it (vlabPhysics.detectZeroCrossings), so the switch is taken at t >= T - SIGNAL_TIME_QUANTUM / 2.
    const step_time = numericParam(params, 'time', 1.0);
    const initial = numericParam(params, 'initial', 0.0);
    const final = numericParam(params, 'final', 1.0);
    const val = ctx.time >= step_time - SIGNAL_TIME_QUANTUM / 2 ? final : initial;
    return [branch[0] - val];
  },

  ps_sine: ({ branch, params, ctx }) => {
    const A = numericParam(params, 'amp', 1.0);
    const f = numericParam(params, 'freq', 1.0);
    const val = A * Math.sin(2 * Math.PI * f * ctx.time);
    return [branch[0] - val];
  },

  ps_ramp: ({ branch, params, ctx }) => {
    // Simulink Ramp: y = 0 for t < start, y = slope (t - start) for t >= start
    const slope = numericParam(params, 'slope', 1.0);
    const start = numericParam(params, 'start', 0.0);
    const val = ctx.time > start ? slope * (ctx.time - start) : 0.0;
    return [branch[0] - val];
  },

  ps_add: (a) => {
    return [a.branch[0] - (sigIn(a, 'u1', 0) + sigIn(a, 'u2', 1))];
  },

  ps_subtract: (a) => {
    return [a.branch[0] - (sigIn(a, 'u1', 0) - sigIn(a, 'u2', 1))];
  },

  ps_gain: ({ across, branch, params }) => {
    const gain = numericParam(params, 'gain', 1.0);
    return [branch[0] - gain * (across[0] || 0)];
  },

  ps_product: (a) => {
    return [a.branch[0] - sigIn(a, 'u1', 0) * sigIn(a, 'u2', 1)];
  },

  ps_divide: (a) => {
    // y = u1 / u2; a zero divisor is replaced by +1e-12 (documented regularisation, the Newton iterates start at 0)
    const u2 = sigIn(a, 'u2', 1);
    const den = Math.abs(u2) < 1e-12 ? 1e-12 : u2;
    return [a.branch[0] - sigIn(a, 'u1', 0) / den];
  },

  ps_abs: ({ across, branch }) => {
    return [branch[0] - Math.abs(across[0] || 0)];
  },

  ps_saturation: ({ across, branch, params }) => {
    // Simulink Saturation: y = upper (u > upper), lower (u < lower), u inside
    const [lower, upper] = orderedLimits(params, -1.0, 1.0);
    const val = Math.max(lower, Math.min(upper, across[0] || 0));
    return [branch[0] - val];
  },

  ps_dead_zone: ({ across, branch, params }) => {
    // Simulink Dead Zone (start = lower, end = upper of the zone): y = u - upper (u > upper), 0 (lower <= u <= upper),
    // u - lower (u < lower). The output is continuous in u (F-042); the old block returned u itself outside the band.
    const [lower, upper] = orderedLimits(params, -0.5, 0.5);
    const u = across[0] || 0;
    const val = u > upper ? u - upper : u < lower ? u - lower : 0.0;
    return [branch[0] - val];
  },

  ps_switch: (a) => {
    // Simulink Switch with the criterion "u2 > threshold" (here the control port): y = u1 if ctrl > threshold, else u2.
    // Ports are read by id (the old equation read the control from the u2 position, F-077); the library default threshold is 0.
    const threshold = numericParam(a.params, 'threshold', 0);
    const u1 = sigIn(a, 'u1', 0); const ctrl = sigIn(a, 'ctrl', 1); const u2 = sigIn(a, 'u2', 2);
    return [a.branch[0] - (ctrl > threshold ? u1 : u2)];
  },

  ps_math: ({ across, branch, params }) => {
    // Simulink Math Function. Domain guards: log(max(u, 1e-15)), sqrt(max(u, 0)) (the Newton iterates start at u = 0).
    const func = choiceParam(params, 'func', ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'square'], 'exp');
    const u = across[0] || 0;
    let val = 0;
    switch (func) {
      case 'sin': val = Math.sin(u); break;
      case 'cos': val = Math.cos(u); break;
      case 'tan': val = Math.tan(u); break;
      case 'exp': val = Math.exp(u); break;
      case 'log': val = Math.log(Math.max(1e-15, u)); break;
      case 'sqrt': val = Math.sqrt(Math.max(0.0, u)); break;
      default: val = u * u; break; // square
    }
    return [branch[0] - val];
  },
  
  ps_lookup_1d: ({ across, branch, params }) => {
    // Simscape PS Lookup Table (1D): piecewise-linear interpolation of (table_x, table_y), nearest (clamped) extrapolation.
    const table_x = vectorParam(params, 'table_x', [0, 1, 2]);
    const table_y = vectorParam(params, 'table_y', [0, 1, 4]);
    checkBreakpoints('table_x', table_x, 'table_y', table_y.length);
    return [branch[0] - interpolate1d(table_x, table_y, across[0] || 0)];
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

  // ── DOMAIN APPLIANCES & CUSTOM ─────────────────────────────────────────────
  washing_basket: ({ across, dAcross, branch, params }) => {
    // Drum load (WP-21; rigid-body rotation about the drum axis, Meriam & Kraige, Dynamics, ch. 6):
    //   J_total = J_basket + (load_mass + unbalance) radius^2   (laundry and eccentric mass as point masses on the drum wall)
    //   tau = J_total domega/dt + b omega                        [N*m], tau = torque drawn from the shaft node R
    // vis = tau (load torque signal, N*m). Energy: tau omega = d/dt(J_total omega^2 / 2) + b omega^2.
    // The eccentric mass is on a vertical axis (top loader): its gravity torque about the axis is zero, its centrifugal force
    // m_u r omega^2 is radial (bearing load) and does no work about the axis.
    const J_basket = numericParam(params, 'J_basket', 0.1);
    const M_clothes = numericParam(params, 'load_mass', 5.0);
    const M_unbal = numericParam(params, 'unbalance', 0.5);
    const R = numericParam(params, 'radius', 0.25);
    const J_total = J_basket + (M_clothes + M_unbal) * R * R;
    const B = numericParam(params, 'damping', 0.02);
    const tau = J_total * dAcross[0] + B * across[0];
    return [
      branch[0] - tau,
      branch[1] - tau
    ];
  },
  
  washing_fluid: ({ across, branch, params }) => {
    // Wash-liquor drag load (WP-21): linear viscous drag plus quadratic (turbulent) slosh drag,
    //   tau = (drag_coeff + 0.02*detergent[%] + 0.005*water_level[L]) omega + 0.01 omega |omega|   [N*m]
    // (coefficients 0.02 N*m*s/rad per %, 0.005 N*m*s/rad per L, 0.01 N*m*s^2/rad^2). Purely dissipative: tau omega >= 0.
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

  // ── GAS AND MOIST AIR DOMAINS ──────────────────────────────────────────────
  ma_ref: () => [],

  ma_chamber: ({ across, branch, state, dState, params }) => {
    // Constant Volume Chamber (MA), WP-17.
    //   across[0]: P_a, across[1]: P_b (both ports are the chamber node), across[2]: T_h (Thermal)
    //   branch[0]: mass flow INTO the chamber at a, branch[1]: heat_flow at h (injection = -heat entering), branch[2]: mass flow INTO the chamber at b
    //   state[0]: chamber temperature T (K), state[1]: chamber pressure p (Pa)
    // Mass conservation of the ideal moist-air mixture in a rigid volume, m = p V / (R T) (Dalton + ideal gas, ASHRAE ch. 1):
    //   dm/dt = mdot_a + mdot_b  ->  dp/dt = (R T / V) (mdot_a + mdot_b) + (p / T) dT/dt
    // R = (R_a + w R_v) / (1 + w) with the humidity ratio w frozen at the initial state (p = P0, T = ambient_temp, relative humidity phi): no
    // moisture exchange or condensation is modelled. The ports carry pressure and mass flow only, so a flow convects no enthalpy: the
    // chamber exchanges energy through H only (lumped air + wall + load heat capacity, loss to ambient, safety cutout as before).
    const V = numericParam(params, 'V', 0.005);
    const T_amb = numericParam(params, 'ambient_temp', 25) + 273.15;
    const P0 = numericParam(params, 'P0', STANDARD_ATMOSPHERE);
    const phi = numericParam(params, 'phi', 0.5);
    const air0 = moistAirState(P0, T_amb, phi);
    const temp = state[0] > 1.0 ? state[0] : T_amb;
    const P = state[1];
    // air heat capacity at constant volume: m c_v with m = p V / (R T)
    const airCapacity = (Math.max(P, 1) * V / (air0.R * temp)) * air0.cv;
    const wallCapacity = numericParam(params, 'wall_mass', 2.0) * numericParam(params, 'wall_cp', 460);
    const loadCapacity = numericParam(params, 'food_mass', 0.5) * numericParam(params, 'food_cp', 4184);
    const C = Math.max(1e-6, airCapacity + wallCapacity + loadCapacity);

    // Physical heat loss to the ambient environment (convection/conduction through basket walls)
    const k_loss = numericParam(params, 'k_loss', 8.5); // W/K, realistic overall heat loss coefficient
    const heat_loss = k_loss * (temp - T_amb);
    const maxTempK = numericParam(params, 'max_temp', 220) + 273.15;
    const cutoffWidth = 3.0;
    const cutoff = 0.5 * (1.0 + Math.tanh((maxTempK - temp) / cutoffWidth));
    const heat_input = branch[1] * cutoff;
    
    return [
      across[0] - P,                                           // port a is the chamber node
      heat_input + C * dState[0] + heat_loss, /* heat entering chamber = C * dT/dt + heat_loss */
      across[1] - P,                                           // port b is the chamber node
      across[2] - temp,                                        // the thermal port sits at the chamber temperature
      // mass balance of the rigid volume, d(pV/(R T))/dt = mdot_a + mdot_b, solved for dp/dt and divided by 1 atm (O(1) row)
      (dState[1] - (air0.R * temp / V) * (branch[0] + branch[2]) - (P / temp) * dState[0]) / STANDARD_ATMOSPHERE,
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
    // w_ref is a MECHANICAL speed command (like omega): the stator frequency of the V/f set is the electrical speed P w_ref (157 rad/s, P = 2 -> 50 Hz)
    const theta_v = P * w_ref * ctx.time;
    const va = v_mag * Math.sin(theta_v);
    const vb = v_mag * Math.sin(theta_v - 2 * Math.PI / 3);
    const vc = v_mag * Math.sin(theta_v + 2 * Math.PI / 3);

    const vAlpha = (2 * va - vb - vc) / 3;
    const vBeta = (vb - vc) / Math.sqrt(3);

    // 3. Induction Motor Equations
    const sigma = 1 - (Lm * Lm) / (Ls * Lr);
    const kr = Lm / Lr;
    const tr = Lr / Rr;

    const dias = (vAlpha - (Rs + kr * kr * Rr) * ias + (kr / tr) * psiar + (kr * P * omega) * psibr) / (sigma * Ls);
    const dibs = (vBeta - (Rs + kr * kr * Rr) * ibs + (kr / tr) * psibr - (kr * P * omega) * psiar) / (sigma * Ls);
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
      // mass conservation dm/dt = mdot_a + mdot_b with m = p V / (R T):  dp/dt = (R T / V)(mdot_a + mdot_b), divided by 1 atm so the row is O(1)
      // for any volume (the structural-rank probe is blind to couplings below 1e-10 of the row scale)
      (dP - (R * T / V) * (mdot_a + mdot_b)) / STANDARD_ATMOSPHERE
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
    // Compressible orifice (Simscape Gas "Local Restriction (G)"): isentropic Saint-Venant & Wantzel flow of an ideal gas from the
    // upstream state (p_up, T) with choking at r* = (2/(gamma+1))^(gamma/(gamma-1)); see vlabFluidProperties.gasOrificeMassFlow.
    const Cd = numericParam(params, 'Cd', 0.62);
    const A = inputOrParam({ across, ports, connectedPorts }, 'ar', numericParam(params, 'area', 1e-4), 2);
    const T = numericParam(params, 'T', 293.15);
    const gamma = numericParam(params, 'gamma', 1.4);
    return [branch[0] - gasOrificeMassFlow(across[0], across[1], Cd, A, T, R_GAS, gamma)];
  },
  gas_pipe: ({ across, branch, params }) => {
    // Darcy-Weisbach friction in a straight pipe, dp = f (L/D) rho v^2 / 2 with rho = p_mean / (R T) (isothermal ideal gas, i.e.
    // p_a^2 - p_b^2 = f (L/D) R T G^2, G = mdot / S). f is the (turbulent) friction factor; at low Reynolds number the laminar
    // Hagen-Poiseuille law f = 64 / Re takes over (f_eff = max(64/Re, f)), which keeps the flow-pressure law linear at zero flow.
    const L = numericParam(params, 'L', 1);
    const D = numericParam(params, 'D', 0.05);
    const f = numericParam(params, 'f', 0.02);
    const T = numericParam(params, 'T', 293.15);
    const mu = numericParam(params, 'mu', 1.81e-5);
    const rho = Math.max(0.5 * (across[0] + across[1]), 1) / (R_GAS * T);
    return [(across[0] - across[1]) - pipePressureDrop(branch[0], L, D, rho, mu, () => f)];
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
  // out = mdot positive p -> n (branch[0] is the flow entering the block at p). WP-17 re-verification: the old row ranch[1] + branch[0] reported
  // the NEGATIVE of the p -> n flow (found by a flow-source loop through the sensor).
  gas_flow_sensor: ({ across, branch }) => [across[0] - across[1], branch[1] - branch[0]],

  // ── MAGNETIC DOMAIN ────────────────────────────────────────────────────────
  mag_ref: () => [],
  reluctance: ({ across, branch, params }) => {
    const R = numericParam(params, 'R', 1e6);
    return [(across[0] - across[1]) - branch[0] * R];
  },
  fundamental_reluctance: ({ across, branch, params }) => {
    // Hopkinson's law with the reluctance of a uniform core segment (Simscape Electrical > Magnetic > Fundamental Reluctance):
    //   mmf = Phi * R,   R = l / (mu0 mu_r A)      l [m] length, A [m^2] cross-section, mu_r relative permeability
    // (Hopkinson 1886; Fitzgerald, Kingsley, Umans "Electric Machinery" eq. 1.6-1.7). mu0 = 4 pi 1e-7 (1 + 5.5e-10) H/m.
    const l = numericParam(params, 'l', 0.1);
    const A = numericParam(params, 'A', 1e-4);
    const mur = numericParam(params, 'mu_r', 1000);
    const MU0 = 1.25663706212e-6;
    const R = l / (MU0 * mur * A);
    return [(across[0] - across[1]) - branch[0] * R];
  },
  variable_reluctance: ({ across, branch, params, ports, connectedPorts }) => {
    // Simscape Variable Reluctance: mmf = Phi * R(u), u = control signal [A-t/Wb]; bounded below by Rmin so the
    // element never becomes a short (R > 0). `R` is the reluctance used while the control port is unwired.
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const ctrlVal = inputOrParam({ across, ports, connectedPorts }, 'ctrl', numericParam(params, 'R', 1e6), 2);
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
    // Thevenin model of a permanent magnet: mmf at the terminals = Hc Lm - Rm Phi_out, Phi_out = the flux DELIVERED into the circuit
    // at N (Hopkinson's law with the magnet's internal reluctance Rm). branch[0] is the flux INTO the block at N, so
    // Phi_out = -branch[0] and the residual is mmf_NS = Hc Lm + Rm branch[0] (an Rm > 0 dissipates, never creates, magnetic energy:
    // the old sign gave a NEGATIVE internal reluctance, Phi = Hc Lm / (R_load - Rm)).
    const phi = branch[0] ?? 0;
    const mmf_pm = Hc * Lm + phi * Rm;
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
  reluctance_force: ({ across, branch, state, dState, params, ports }) => {
    // Magnetic energy at fixed flux W = Phi^2 R(x) / 2, R(x) = R0 + K x, x = integral(v_R - v_C) dt (position of R relative to C,
    // x = 0 at R0). Reluctance (Maxwell) force on the moving part F = -dW/dx|_Phi = -Phi^2/2 dR/dx = -Phi^2 K / 2
    // (equal to +i^2/2 dL/dx at fixed current; Woodson & Melcher, "Electromechanical Dynamics" part I, energy method).
    // Through variable `force` is the force INTO the block at R (the force delivered to the body at R is -force), so
    // force = +Phi^2 K / 2: a positive K (the gap opens with x) pulls R back toward the smaller reluctance (attraction).
    // R is floored at 1e-6 R0 (a closed gap) where dR/dx is 0.
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
    const x = state[0] ?? 0;
    const v = xr - xc;
    const Rlin = R0 + K * x;
    const Rfloor = 1e-6 * R0;
    const closed = Rlin < Rfloor;
    const R = closed ? Rfloor : Rlin;
    const dRdx = closed ? 0 : K;
    const phi = branch[0] ?? 0;
    const force = branch[1] ?? 0;
    return [
      (Vn - Vs) - phi * R,
      force - 0.5 * phi * phi * dRdx,
      (dState[0] ?? 0) - v
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
    // Ideal across sensor (the magnetic analogue of a voltmeter): it draws no flux (infinite reluctance) and outputs the mmf
    // difference mmf_N - mmf_S. The old model forced mmf_N = mmf_S, i.e. a short that read 0 and carried the whole flux.
    const nIdx = ports ? ports.indexOf('n') : 0;
    const sIdx = ports ? ports.indexOf('s') : 1;
    const Vn = (nIdx !== -1 && across[nIdx] !== undefined) ? across[nIdx] : (across[0] ?? 0);
    const Vs = (sIdx !== -1 && across[sIdx] !== undefined) ? across[sIdx] : (across[1] ?? 0);
    const sigF = branch[1] !== undefined ? branch[1] : (Vn - Vs);
    return [
      branch[0] ?? 0,
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
  ps_delay: (a) => {
    // Constant (transport) delay y(t) = u(t - delay) for t >= delay, y = `initial` before (Simulink Transport Delay "Initial output").
    // The input history is the committed record of the accepted steps (vlabHistory.ts): a delay >= the step is explicit in u.
    const delay = numericParam(a.params, 'delay', 1);
    if (delay < 0) tableError('delay', 'a delay cannot be negative');
    const initial = numericParam(a.params, 'initial', 0);
    const u = sigIn(a, 'u', 0);
    return [a.branch[0] - historyAt(a.ctx, a.nodeId, a.ctx.time - delay, [u], [initial])[0]];
  },
  // Sum of Elements of the input signal. The port is scalar (width 1), so the sum over its single element is the input itself.
  ps_sum: (a) => [a.branch[0] - sigIn(a, 'u', 0)],
  ps_min: (a) => {
    // Simulink MinMax (min) with the output saturated at `limit` (library "Saturation"): y = min(u1, u2, limit)
    return [a.branch[0] - Math.min(sigIn(a, 'u1', 0), sigIn(a, 'u2', 1), numericParam(a.params, 'limit', 100))];
  },
  ps_max: (a) => {
    // Simulink MinMax (max) with the output saturated at `limit` (library "Saturation"): y = max(u1, u2, limit)
    return [a.branch[0] - Math.max(sigIn(a, 'u1', 0), sigIn(a, 'u2', 1), numericParam(a.params, 'limit', -100))];
  },
  ps_rms: (a) => {
    // Sliding-window RMS (Simscape RMS, Periodic Operators): y = sqrt( (1/W) int_{t-W}^{t} u^2 dtau ), W = `window` [s].
    // State Q = int_0^t u^2 dtau (dQ/dt = u^2); the window integral is Q(t) - Q(t - W), the signal before t = 0 counts as 0.
    const W = numericParam(a.params, 'window', 0.02);
    if (!(W > 0)) tableError('window', 'must be greater than 0');
    const u = sigIn(a, 'u', 0);
    const Q = a.state[0];
    const Qlag = historyAt(a.ctx, a.nodeId, a.ctx.time - W, [Q], [0])[0];
    return [a.branch[0] - Math.sqrt(Math.max(0, (Q - Qlag) / W)), a.dState[0] - u * u];
  },
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
    // Bernoulli orifice mdot = Cd A sqrt(2 rho |dp|) sign(dp) with the Simscape smooth laminar transition (vlabFluidProperties.orificeMassFlow)
    const Cd = numericParam(params, 'Cd', 0.6);
    const A = numericParam(params, 'A', 1e-4);
    const rho = numericParam(params, 'rho', 1.2);
    const mu = numericParam(params, 'mu', 1.81e-5);
    const ReCrit = numericParam(params, 'Re_crit', 12);
    return [branch[0] - orificeMassFlow(across[0] - across[1], Cd, A, rho, mu, ReCrit)];
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
    // Single-ended source: `p` is its OUT port, so a positive mdot is delivered INTO the network. branch[0] is the flow entering the block
    // at p (Simscape A -> B convention with B on the absolute reference), hence branch = -mdot.
    const mdot = numericParam(params, 'mdot', 0.01);
    return [branch[0] + mdot];
  },

  check_valve: ({ across, branch, params }) => {
    // One-way valve: conducts (dp - P_crack)/Rf above the cracking pressure differential, nothing below it (smooth gate of width 1 mPa).
    const Rf = numericParam(params, 'Rf', 1e3);
    const Pcrack = numericParam(params, 'P_crack', 0);
    const x = across[0] - across[1] - Pcrack;
    const g = 0.5 * (1 + Math.tanh(x * 1000));
    return [branch[0] - g * x / Rf];
  },

  relief_valve: ({ across, branch, params }) => {
    // Pressure relief valve (Simscape Pressure Relief Valve): the valve opens when the pressure DIFFERENCE p_A - p_B exceeds the set
    // pressure; the flow path resistance blends from Rf_closed to Rf_open over a 10 kPa-wide smooth step.
    const P_set = numericParam(params, 'P_set', 5e5);
    const Rf_open = numericParam(params, 'Rf_open', 1e2);
    const Rf_closed = numericParam(params, 'Rf_closed', 1e10);
    const dP = across[0] - across[1];
    const open = 0.5 * (1 + Math.tanh((dP - P_set) * 1e-4));
    const R = Rf_open * open + Rf_closed * (1 - open);
    return [dP - branch[0] * R];
  },

  steam_generator_fluid: ({ across, branch, params, ports, connectedPorts }) => {
    // Ideal steam generator: the heat input Q evaporates water at the saturation state of the port pressure, mdot_steam = Q / h_fg(p_sat)
    // (first law of steady evaporation; h_fg from the IF97 saturation line by Clausius-Clapeyron). The steam leaves through the Steam port p,
    // the feed water returns through n: the flow p -> n through the block is -mdot_steam.
    const { hfg } = saturatedSteamAtPressure(across[0]);
    const Q_in = inputOrParam({ across, ports, connectedPorts }, 'q_in', numericParam(params, 'Q', 1000), 2);
    const mdot_steam = Math.max(0, Q_in) / hfg;
    return [branch[0] + mdot_steam];
  },

  steam_accumulator: ({ across, dAcross, branch, params }) => {
    // Dry saturated-steam vessel: m = V rho_g(p), so dm/dt = V (d rho_g / dp) dp/dt = mdot_in - mdot_out (the saturation line closes the
    // density-pressure relation; flash storage of a liquid inventory is not modelled). Both ports are the vessel node.
    const V = numericParam(params, 'V', 0.5);
    const storage = V * saturatedVapourDensitySlope(across[0]);
    return [
      across[0] - across[1],
      branch[0] - branch[1] - storage * dAcross[0]
    ];
  },

  steam_nozzle: ({ across, branch, params }) => {
    // Converging nozzle for saturated steam from the upstream state p_p (T_0 = T_sat(p_p), R_v = 461.52 J/(kg K)) to p_n: isentropic
    // Saint-Venant & Wantzel flow with choking at r* = (2/(gamma+1))^(gamma/(gamma-1)) (vlabFluidProperties.gasOrificeMassFlow); no reverse flow.
    const Cd = numericParam(params, 'Cd', 0.5);
    const d = numericParam(params, 'd', 0.5e-3);
    const gamma = numericParam(params, 'gamma', 1.3);
    const A = Math.PI * d * d / 4;
    const P_upstream = across[0];
    const P_downstream = across[1];
    const mdot = P_upstream > P_downstream
      ? gasOrificeMassFlow(P_upstream, P_downstream, Cd, A, saturatedSteamAtPressure(P_upstream).T, R_WATER_VAPOUR, gamma)
      : 0;
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

  pump_il: ({ across, branch, params }) => {
    const dp = numericParam(params, 'pressure_rise', 200000);
    return [(across[1] - across[0]) - dp];
  },

  pipe_il: ({ across, branch, params }) => {
    const R = numericParam(params, 'R', 100000);
    return [(across[0] - across[1]) - branch[0] * R];
  },

  restriction_il: ({ across, branch, params }) => {
    // Simscape Isothermal Liquid Local Restriction: Bernoulli orifice with the smooth laminar / turbulent transition
    const Cd = numericParam(params, 'Cd', 0.6);
    const A = numericParam(params, 'area', 1e-4);
    const rho = numericParam(params, 'rho', 1000);
    const mu = numericParam(params, 'mu', 1.0e-3);
    const ReCrit = numericParam(params, 'Re_crit', 12);
    return [branch[0] - orificeMassFlow(across[0] - across[1], Cd, A, rho, mu, ReCrit)];
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
  doe_custom: ({ across, branch, params, nodeId, ctx, ports, portLabels }) => {
    let deployment: any = unwrapParam(params?.deploymentModel);
    if (typeof deployment === 'string') {
      try {
        deployment = JSON.parse(deployment);
      } catch {
        deployment = null;
      }
    }

    // Inputs are selected by port id (in1..inN, in factorOrder order), never by position in `across`: `across` carries one entry
    // per declared port INCLUDING the output `out`, in the node's port order, so a positional read would hand the model N+1
    // inputs (or the wrong ones if the ports were reordered). A missing `inK` port truncates the vector (INSUFFICIENT_INPUTS).
    const doeInputIds = (ports as string[]).filter(p => /^in\d+$/.test(p))
      .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const doeInputs = (count: number): number[] => {
      const out: number[] = [];
      for (let k = 1; k <= count; k++) {
        const idx = (ports as string[]).indexOf(`in${k}`);
        if (idx < 0) break;
        out.push(across[idx] as number);
      }
      return out;
    };

    let y = NaN;
    if (deployment && deployment.schemaVersion === 1) {
      const nFactors = Array.isArray(deployment.factorOrder) ? deployment.factorOrder.length : doeInputIds.length;
      const res = evaluateDOEModelDetailed(deployment, doeInputs(nFactors));
      if (!res.success) {
        if (params) params._runtimeDiagnostic = res.diagnostic;
        if (ctx?.parameters && nodeId) ctx.parameters[`${nodeId}_fault`] = res.diagnostic;
        y = NaN;
      } else {
        if (params) params._runtimeDiagnostic = null;
        if (ctx?.parameters && nodeId) delete ctx.parameters[`${nodeId}_fault`];
        y = res.value;
      }
    } else {
      const eq = stringParam(params, 'equation', '');
      if (eq) {
        const legacyInputs = doeInputs(doeInputIds.length);
        // Legacy exported equations use the real factor names (engine/doe/statistics.ts): take them from the node's port
        // labels (port.label = factor name); X1..Xn stay available as aliases inside the evaluator.
        const isIdent = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z_]\w*$/.test(s);
        const factorNames = legacyInputs.map((_, i) => {
          const fromPort = portLabels?.[`in${i + 1}`];
          return isIdent(fromPort) ? fromPort : `X${i + 1}`;
        });
        const res = evaluateLegacyDOEEquationDetailed(eq, factorNames, legacyInputs);
        if (!res.success) {
          if (params) params._runtimeDiagnostic = res.diagnostic;
          if (ctx?.parameters && nodeId) ctx.parameters[`${nodeId}_fault`] = res.diagnostic;
          y = NaN;
        } else {
          if (params) params._runtimeDiagnostic = null;
          if (ctx?.parameters && nodeId) delete ctx.parameters[`${nodeId}_fault`];
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
  ps_lookup_2d: (a) => {
    // Simscape PS Lookup Table (2D): bilinear interpolation of table_z (rows = table_x breakpoints of u1, columns = table_y
    // breakpoints of u2), nearest (clamped) extrapolation. The default table [0 0; 0 1] on [0 1] x [0 1] is z = u1 u2 there.
    const x = vectorParam(a.params, 'table_x', [0, 1]);
    const y = vectorParam(a.params, 'table_y', [0, 1]);
    const z = matrixParam(a.params, 'table_z', [[0, 0], [0, 1]]);
    checkBreakpoints('table_x', x, 'table_z rows', z.length);
    checkBreakpoints('table_y', y, 'table_z columns', z[0]?.length ?? 0);
    // interpolate along u2 in every row, then along u1 between the rows
    const u2 = sigIn(a, 'u2', 1);
    const rowValues = z.map(row => interpolate1d(y, row, u2));
    return [a.branch[0] - interpolate1d(x, rowValues, sigIn(a, 'u1', 0))];
  },

  ps_integrator_gen: (a) => {
    // Integrator with external reset (Simulink Integrator, "level" reset): dy/dt = u, y(0) = initial; while the reset input is
    // high (> 0.5) the state is held at `initial` (y = initial). An unwired reset never fires.
    const initial = numericParam(a.params, 'initial', 0);
    const u = sigIn(a, 'u', 0);
    const resetting = sigIn(a, 'reset', 1) > SIGNAL_LOGIC_THRESHOLD;
    return [
      a.branch[0] - a.state[0],
      resetting ? a.state[0] - initial : a.dState[0] - u,
    ];
  },

  ps_moving_avg: (a) => {
    // Simulink Moving Average: y(k) = sum_{i=0}^{N-1} u(k-i) / N over samples u(k) = u(k ts), N = `window` samples, `ts` = sample time.
    // y is held between the sample instants; samples before t = 0 are 0 (initial state). The samples come from the committed
    // input history, so each is the exact signal value at its sample instant.
    const { n, ts } = movingAverageSpec(a.params);
    if (!(ts > 0)) tableError('ts', 'must be greater than 0');
    const u = sigIn(a, 'u', 0);
    const tk = Math.floor(a.ctx.time / ts + 1e-9) * ts;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += historyAt(a.ctx, a.nodeId, tk - i * ts, [u], [0])[0];
    return [a.branch[0] - sum / n];
  },

  ps_sr_flipflop: (a) => {
    // Set-Reset latch, set dominant: Q+ = S or (Q and not R), not-Q = 1 - Q; the inputs are high when > 0.5. The state holds Q:
    // S high -> Q = 1; else R high -> Q = 0; else dQ/dt = 0 (Q is latched). The mode changes are events of S and R.
    const S = sigIn(a, 's', 0) > SIGNAL_LOGIC_THRESHOLD;
    const R = sigIn(a, 'r', 1) > SIGNAL_LOGIC_THRESHOLD;
    const Q = a.state[0];
    return [
      a.branch[0] - Q,
      a.branch[1] - (1 - Q),
      S ? Q - 1 : R ? Q : a.dState[0],
    ];
  },

  ps_sample_hold: (a) => {
    // Sample and hold (library equation y = u if S > 0.5 else y_prev): the state tracks u while S is high and holds its
    // last value while S is low (dy/dt = 0). The falling edge of S is an event, so the held value is u at that instant.
    const u = sigIn(a, 'u', 0);
    const tracking = sigIn(a, 's', 1) > SIGNAL_LOGIC_THRESHOLD;
    return [
      a.branch[0] - a.state[0],
      tracking ? a.state[0] - u : a.dState[0],
    ];
  },

  ps_sine_3phase: (a) => {
    // Balanced positive-sequence set (Simscape "Sine Generator" convention, phase a reference):
    //   a = m Vpk sin(wt), b = m Vpk sin(wt - 2pi/3), c = m Vpk sin(wt + 2pi/3),  wt = 2*pi*f*t + ang   [rad]
    // m = amplitude modulation (input `m`, 1 when unwired), ang = phase offset of the set in rad (input `ang`, 0 when unwired);
    // `wt` is the instantaneous angle of phase a (so park_transform with theta = wt gives d = m Vpk, q = 0).
    // `abc` is one width-3 vector output (branches 0..2), `wt` the scalar after it (branch 3).
    const Vpk = numericParam(a.params, 'Vpk', 325);
    const f = numericParam(a.params, 'f', 50);
    const m = inputOrParam(a, 'm', 1);
    const ang = inputOrParam(a, 'ang', 0);
    const wt = 2 * Math.PI * f * a.ctx.time + ang;
    return [
      a.branch[0] - m * Vpk * Math.sin(wt),
      a.branch[1] - m * Vpk * Math.sin(wt - 2 * Math.PI / 3),
      a.branch[2] - m * Vpk * Math.sin(wt + 2 * Math.PI / 3),
      a.branch[3] - wt,
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

  ps_stair_gen: ({ branch, params, ctx }) => {
    // Periodic stair: y = steps[floor(t / ts) mod N] (library equation); a level change is a time event (detectZeroCrossings),
    // taken at t >= k ts - SIGNAL_TIME_QUANTUM / 2.
    const ts = numericParam(params, 'ts', 0.1);
    if (!(ts > 0)) tableError('ts', 'must be greater than 0');
    const levels = vectorParam(params, 'steps', [0, 1, 2, 1, 0]);
    const k = Math.floor((ctx.time + SIGNAL_TIME_QUANTUM / 2) / ts);
    return [branch[0] - levels[((k % levels.length) + levels.length) % levels.length]];
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
    // abc -> +/-/0 sequence magnitudes, Simscape Sequence Analyzer method (Fortescue 1918 + a running one-cycle Fourier analysis,
    // F-063). With the operator a = e^(j 2pi/3) the sequence phasors of the fundamental (f0 = `freq`, w = 2 pi f0, T = 1/f0) are
    //   V1 = (A + a B + a^2 C)/3,  V2 = (A + a^2 B + a C)/3,  V0 = (A + B + C)/3,   A = (2/T) int_{t-T}^{t} x_a(tau) e^(-j w tau) dtau
    // (the Fourier fundamental of a phase signal x = X cos(w t + phi) is A = X e^(j phi)); the Fourier integral is linear, so
    //   V_k(t) = (2/T) [Z_k(t) - Z_k(t - T)],   dZ_k/dt = s_k(t) e^(-j w t),   s1 = (x_a + a x_b + a^2 x_c)/3, s2 = conj-pair, s0 = (x_a + x_b + x_c)/3.
    // The six running integrals (re, im of Z_1, Z_2, Z_0) are states; Z(t - T) is the committed history (vlabHistory.ts). The output
    // `seq` is the three peak MAGNITUDES [|V1|, |V2|, |V0|] (no ripple at any instant of the cycle once the window is full). Warm-up:
    // the signal before t = 0 counts as 0 (Simscape Fourier "Initial input [0 0]"), so the output is exact one period after the start.
    const x = vectorInput(args, 'abc', 3);
    const f0 = numericParam(args.params, 'freq', 50);
    if (!(f0 > 0)) tableError('freq', 'must be greater than 0');
    const w = 2 * Math.PI * f0;
    const c = Math.cos(w * args.ctx.time); const s = Math.sin(w * args.ctx.time);
    const ca = -0.5; const sa = SQRT3 / 2;
    const s1re = (x[0] + ca * x[1] + ca * x[2]) / 3; const s1im = (sa * x[1] - sa * x[2]) / 3;
    const s0re = (x[0] + x[1] + x[2]) / 3;
    // z = s e^(-j w t) = (s_re cos + s_im sin) + j (s_im cos - s_re sin);  s2 = (s1_re, -s1_im), s0 imaginary part 0
    const dz = [
      s1re * c + s1im * s, s1im * c - s1re * s,
      s1re * c - s1im * s, -s1im * c - s1re * s,
      s0re * c, -s0re * s,
    ];
    const lag = historyAt(args.ctx, args.nodeId, args.ctx.time - 1 / f0, args.state.slice(0, 6), [0, 0, 0, 0, 0, 0]);
    const mag = (k: number) => (2 * f0) * Math.hypot(args.state[2 * k] - lag[2 * k], args.state[2 * k + 1] - lag[2 * k + 1]);
    return [
      args.branch[0] - mag(0), args.branch[1] - mag(1), args.branch[2] - mag(2),
      ...dz.map((d, i) => args.dState[i] - d),
    ];
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
  // ── BLDC & POWER ELECTRONICS CONTROL ────────────────────────────────────────
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
    // belt damping (spec 2026-09-30 belt-pulley 2.3): reaches a belt end only through its P link (assembly injection), never
    // through the model-wide broadcast, so an unlinked belt end keeps its own damping (spec 2.5)
    const damping = numericParam(params, 'damping', 0);
    if (ctx?.parameters) {
      ctx.parameters['belt_density'] = density;
      ctx.parameters['belt_youngs'] = youngs;
      if (nodeId) {
        ctx.parameters[`belt_density@${nodeId}`] = density;
        ctx.parameters[`belt_youngs@${nodeId}`] = youngs;
        ctx.parameters[`belt_damping@${nodeId}`] = damping;
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
    // c: the damping of the belt_properties block wired to P (injected as belt_damping, spec 2.3), else the local damping (2.5)
    const linkedDamping = params ? numParam(params.belt_damping, NaN) : NaN;
    const c = Number.isFinite(linkedDamping) ? linkedDamping : numericParam(params, 'damping', 0);
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
    // Pipe (MA), WP-17. across = [p_a, p_b, T_h, wd]; branch = [mdot a -> b, Q into the gas from H, wd].
    // Pressure loss: Darcy-Weisbach  dp = f (L / D) rho v^2 / 2  (+ the lumped local resistance `resistance` * mdot), laminar f = 64/Re,
    // turbulent f from Haaland's explicit Colebrook fit with the relative roughness e / D, Re = 4 |mdot| / (pi D mu), mu = Sutherland(T).
    // rho = p_mean / (R T) from the moist-air state (p_mean, T, phi). Heat exchange with the wall at H: Q = UA (T_H - T).
    // wd = friction power dissipated in the pipe, dp * mdot / rho [W] (>= 0).
    const L = numericParam(params, 'L', 2);
    const D = numericParam(params, 'D', 0.05);
    const rough = numericParam(params, 'roughness', 1.5e-6);
    const Rloc = numericParam(params, 'resistance', 1.0);
    const T = numericParam(params, 'T', 293.15);
    const phi = numericParam(params, 'phi', 0.5);
    const UA = numericParam(params, 'UA', 5);
    const air = moistAirState(0.5 * (across[0] + across[1]), T, phi);
    const dp = pipePressureDrop(branch[0], L, D, air.rho, airViscosity(T), Re => darcyFrictionFactor(Re, rough / D)) + Rloc * branch[0];
    return [
      (across[0] - across[1]) - dp,
      branch[1] - UA * (across[2] - T),
      // wd = (p_a - p_b) mdot / rho: the pressure difference of the pipe row above is used (not dp again), multiplied by rho, so the row is
      // well scaled at any state
      air.rho * branch[2] - (across[0] - across[1]) * branch[0],
    ];
  },

  ma_separator: ({ across, branch }) => {
    return [
      across[0] - across[1],
      branch[0] - branch[1]
    ];
  },

  ma_rot_conv: ({ across, branch, state, dState, params }) => movingWallChamber('rot', { across, branch, state, dState, params }),

  ma_trans_conv: ({ across, branch, state, dState, params }) => movingWallChamber('trans', { across, branch, state, dState, params }),

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

  // The Moist Air ports carry total pressure and mass flow only; the psychrometric state of a node is the block's own (T, phi) parameters.
  ma_moisture_sensor: ({ across, branch, params }) => {
    // water-vapour mass fraction w / (1 + w) of moist air at (p, T, phi)
    return [branch[0] - moistAirState(across[0], numericParam(params, 'T', 293.15), numericParam(params, 'phi', 0.5)).massFraction];
  },

  ma_pt_sensor: ({ across, branch, params }) => {
    // ports [a, p, t]: p = total pressure of node a, t = the temperature of the (isothermal) network, the T parameter
    return [
      branch[0] - across[0],
      branch[1] - numericParam(params, 'T', 293.15),
    ];
  },

  ma_thermo_sensor: ({ across, branch, params }) => {
    // mixture density rho = p / (R T) = (p - p_v) / (R_a T) + p_v / (R_v T) at (p, T, phi)
    return [branch[0] - moistAirState(across[0], numericParam(params, 'T', 293.15), numericParam(params, 'phi', 0.5)).rho];
  },

  ma_moisture_source: ({ across, branch, params, ports, connectedPorts }) => {
    // adds water vapour at `rate` kg/s (scaled by the S input when wired) INTO the node: the flow entering the block at a is -rate
    const S = numericParam(params, 'rate', 0.01) * inputOrParam({ across, ports, connectedPorts }, 's', 1.0, 1);
    return [branch[0] + S];
  },

  ma_flow_source: ({ across, branch, params, ports, connectedPorts }) => {
    // ideal mass flow source, mdot = rate * S (S = 1 when unwired), positive from A through the block to B
    const S = numericParam(params, 'rate', 0.01) * inputOrParam({ across, ports, connectedPorts }, 's', 1.0, 2);
    return [branch[0] - S];
  },

  ma_properties: () => [],

  // WP-20b: controllers, estimators, motor / converter controllers and learning blocks (vlabControllers.ts)
  ...controllerEquations,
};
